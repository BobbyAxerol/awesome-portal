"""B6: one deterministic, bounded enrichment pipeline; no I/O or engine run.

The result is a sealed QuantBT account, never reconstructed PnL. Old fixed
passports contain sampled equity only: describe that coverage and withhold
daily/trade/benchmark facts rather than converting samples into a full ledger.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
from decimal import Decimal, localcontext
from typing import Any

from portal_api.services.research_distributions import all_time_distributions
from portal_api.services.research_evidence_metrics import (
    decimal_text, extrema_indices, oos_scoped_result, declared_is_scoped_result, engine_is_metrics,
)
from portal_api.services.research_portal_analytics import portal_analytics_v2, _fact

MAX_BYTES = 65_536
CHART_DEFINITION = "B9_ALL_TIME_DAILY_DISTRIBUTION_AND_DRAWDOWN_V1"
RETURN_DEFINITION = "FIRST_LAST_RETAINED_OOS_EQUITY_V1"
IS_DEFINITION = "B9_FULL_DECLARED_IS_ACCOUNT_AND_DAILY_DISTRIBUTION_V1"
IS_RETURN_DEFINITION = "FIRST_LAST_DECLARED_IS_EQUITY_V1"
IS_SCOPE_LOCATOR = "quantbt==1.1.1:scoped_result(scope='test',fold_table=[declared_IS.start,last_actual_IS_bar_before_end_exclusive])"
DISTRIBUTION_POLICY = {
    "quantile_method": "LINEAR_TYPE_7", "probability": "0.95",
    "risk_variable": "LOSS_FRACTION_NEGATIVE_RETURN",
    "risk_sign": "SIGNED_LOSS_FRACTION", "tail": "LOSS_GTE_VAR_INCLUSIVE",
    "minimum_observations": 2,
}


def distribution_statistics(*, daily_returns: Any, digest: str, sampled: bool) -> dict[str, Any]:
    """Exact decimal presentation of the source daily sample, never histogram bins.

    Mean/median describe returns. VaR/CVaR describe losses (-return): a
    wholly profitable sample can therefore have negative risk values. Type-7
    interpolation uses (n-1)*p; CVaR averages every observed loss >= VaR,
    including threshold ties, rather than inventing fractional observations.
    """
    keys = ("mean", "median", "var_95", "cvar_95")
    locator = "scoped.daily_returns:ALL_TIME_UTC_DAY"
    if sampled:
        return {key: _fact(None, digest, locator,
            reason="P04_RETAINED_SAMPLED_EQUITY_HAS_NO_DAILY_RETURN_LEDGER") for key in keys}
    values = sorted(Decimal(str(value)) for value in daily_returns.dropna().to_numpy(dtype=float))
    if not all(value.is_finite() for value in values):
        raise ValueError("daily return statistics require finite source returns")
    if len(values) < 2:
        return {key: _fact(None, digest, locator, state="NOT_APPLICABLE",
            reason="PORTAL_DAILY_RETURN_STATISTICS_TOO_FEW_OBSERVATIONS") for key in keys}
    with localcontext() as context:
        context.prec = 48
        def quantile(sample, probability):
            position = Decimal(len(sample) - 1) * probability
            lower = int(position)
            return sample[lower] + (sample[min(lower + 1, len(sample) - 1)] - sample[lower]) * (position - lower)
        losses = sorted(-value for value in values)
        var = quantile(losses, Decimal("0.95"))
        tail = [value for value in losses if value >= var]
        computed = {"mean": sum(values) / Decimal(len(values)), "median": quantile(values, Decimal("0.5")),
            "var_95": var, "cvar_95": sum(tail) / Decimal(len(tail))}
    definitions = {"mean": "arithmetic_mean_return", "median": "return_type7_p0.5",
        "var_95": "signed_loss_type7_p0.95", "cvar_95": "mean_signed_loss_gte_var_inclusive"}
    return {key: _fact(value, digest, locator + ":" + definitions[key]) for key, value in computed.items()}


def _source_windows(source_windows: dict[str, Any] | None) -> dict[str, Any]:
    """Accept only caller-supplied, source-located half-open metadata bounds."""
    if source_windows is not None and not isinstance(source_windows, dict):
        raise ValueError("enrichment window metadata is incompatible")
    result = {}
    for kind, row in (source_windows or {}).items():
        if kind not in {"is", "oos", "holdout"} or not isinstance(row, dict) \
                or set(row) != {"start_ms", "end_ms", "source_locator"}:
            raise ValueError("enrichment window metadata is incompatible")
        start, end, locator = row["start_ms"], row["end_ms"], row["source_locator"]
        if any(type(value) is not int or not 0 <= value <= 9_007_199_254_740_991 for value in (start, end)) \
                or start >= end or not isinstance(locator, str) or not 1 <= len(locator) <= 256:
            raise ValueError("enrichment window metadata requires source-located half-open UTC bounds")
        result[kind] = {**row, "bounds_semantics": "START_INCLUSIVE_END_EXCLUSIVE"}
    return result


def declared_source_windows(windows: dict[str, Any] | None) -> dict[str, Any]:
    """Convert immutable RequestedSpec bounds, not transport/display timestamps."""
    import pandas as pd
    if windows is None:
        return {}
    if not isinstance(windows, dict):
        raise ValueError("declared windows must be an immutable object")
    result = {}
    for kind in ("is", "oos", "holdout"):
        window = windows.get(kind)
        if window is None:
            continue
        if not isinstance(window, dict) or not isinstance(window.get("start"), str) \
                or not isinstance(window.get("end_exclusive"), str):
            raise ValueError("declared window bounds are missing")
        def utc_ms(value):
            at = pd.Timestamp(value)
            if at.tzinfo is None:
                at = at.tz_localize("UTC")
            else:
                at = at.tz_convert("UTC")
            return int(at.value // 1_000_000)
        result[kind] = {"start_ms": utc_ms(window["start"]), "end_ms": utc_ms(window["end_exclusive"]),
            "source_locator": f"P10.immutable_requested_spec.windows.{kind}"}
    _source_windows(result)
    return result


def digest_rows(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def _declared_is_input(*, result, mode, sampled, window_bounds, is_start_utc_ms,
                       oos_start_utc_ms, market_close, benchmark_locator):
    """Full source-time input only; never promote a retained display sample."""
    import numpy as np
    import pandas as pd

    if mode != "FIXED" or sampled or "is" not in window_bounds:
        return None
    bounds = window_bounds["is"]
    if bounds["start_ms"] != is_start_utc_ms or bounds["end_ms"] != oos_start_utc_ms \
            or ("oos" in window_bounds and window_bounds["oos"]["start_ms"] != bounds["end_ms"]):
        raise ValueError("declared IS bounds disagree with the immutable child boundaries")
    start = pd.Timestamp(bounds["start_ms"], unit="ms", tz="UTC")
    end = pd.Timestamp(bounds["end_ms"], unit="ms", tz="UTC")
    count = int(((result.equity.index >= start) & (result.equity.index < end)).sum())
    if count < 2:
        return None
    scoped = declared_is_scoped_result(result, start_utc_ms=bounds["start_ms"],
        end_exclusive_utc_ms=bounds["end_ms"])
    if not isinstance(market_close, pd.Series) or market_close.index.tz is None or not market_close.index.is_unique:
        raise ValueError("declared IS benchmark requires the source close index, not display prices")
    close = market_close.reindex(scoped.equity.index).to_numpy(dtype=float)
    # Stream every actual reporting row into the identity without retaining a
    # second potentially million-row list. Float repr also binds invalid close
    # input truthfully, while its benchmark curve remains explicitly absent.
    raw_hash = hashlib.sha256()
    raw_hash.update(json.dumps({"definition": IS_DEFINITION, "bounds": bounds,
        "symbols": list(scoped.symbols), "position_columns": list(scoped.positions.columns),
        "benchmark_locator": benchmark_locator}, sort_keys=True, separators=(",", ":")).encode())
    for at, equity, returns, positions, price in zip(scoped.equity.index, scoped.equity,
            scoped.returns, scoped.positions.to_numpy(dtype=float), close, strict=True):
        raw_hash.update(json.dumps([int(at.value // 1_000_000), repr(float(equity)), repr(float(returns)),
            [repr(float(value)) for value in np.atleast_1d(positions)], repr(float(price))],
            separators=(",", ":"), allow_nan=False).encode())
    return scoped, close, {"name": "OBSERVATION_IS", "row_count": count, "digest": raw_hash.hexdigest()}


def _is_payload(*, scoped, close, bounds, digest, benchmark_locator):
    import numpy as np

    index = scoped.equity.index.tz_convert("UTC").as_unit("ns")
    equity = scoped.equity.to_numpy(dtype=float)
    first, last = (int(index[at].value // 1_000_000) for at in (0, -1))
    def fact(value, locator, *, state="NOT_PUBLISHED", reason="IS_SOURCE_VALUE_NOT_PUBLISHED", origin="PORTAL_DERIVED"):
        return {**_fact(value, digest, locator, state=state, reason=reason, origin=origin), "scope": "IS"}
    engine = engine_is_metrics(scoped)
    metrics = {key: fact(row["value"], row["locator"] or f"quantbt.full_report.{key}:DECLARED_IS",
        state=row["state"], reason=row["reason_code"] or "IS_SOURCE_VALUE_NOT_PUBLISHED", origin="ENGINE_DIRECT")
        for key, row in engine.items()}
    with localcontext() as context:
        context.prec = 48
        endpoint_return = Decimal(str(equity[-1])) / Decimal(str(equity[0])) - 1
    metrics["return_fraction"] = fact(endpoint_return, "QuantBT.result.equity:DECLARED_IS:first_last_ratio_minus_one")
    def points(values):
        chosen = extrema_indices(list(values), maximum_points=24)
        return [{"at_utc_ms": int(index[i].value // 1_000_000), "value": decimal_text(values[i])} for i in chosen]
    strategy = points(equity / equity[0] * 100)
    good_close = bool(np.isfinite(close).all() and np.all(close > 0))
    daily = scoped.daily_returns
    distribution = all_time_distributions(equity=scoped.equity, daily_returns=daily,
        digest=digest, scope_locator=IS_SCOPE_LOCATOR)["return_distribution"]
    statistics = {key: {**row, "scope": "IS", "source_locator": row["source_locator"] + ":DECLARED_IS"}
        for key, row in distribution_statistics(daily_returns=daily, digest=digest, sampled=False).items()}
    return {"state": "AVAILABLE", "reason_code": None, "basis": "ALL_TIME",
        "scope": {"window": "IS", "coverage": "FULL_SOURCE_IS", **bounds,
            "first_at_utc_ms": first, "last_at_utc_ms": last, "observation_count": len(index),
            "source_table": "OBSERVATION_IS", "locator": IS_SCOPE_LOCATOR},
        "facts": {"metrics": metrics},
        "return_basis": {"definition_id": IS_RETURN_DEFINITION, "start_equity": decimal_text(equity[0]),
            "end_equity": decimal_text(equity[-1]), "first_at_utc_ms": first, "last_at_utc_ms": last,
            "source_locator": IS_SCOPE_LOCATOR},
        "benchmark": {"state": "AVAILABLE" if good_close else "NOT_PUBLISHED",
            "reason_code": None if good_close else "IS_SOURCE_ALIGNED_POSITIVE_CLOSE_NOT_PUBLISHED",
            "definition_id": "DECLARED_IS_SOURCE_CLOSE_REBASED_100_V1",
            "source_locator": benchmark_locator[:-4] + ":IS" if benchmark_locator.endswith(":OOS")
                else "enriched_analysis.scope.benchmark_locator:loaded_close:DECLARED_IS",
            "input_digest": digest},
        "curves": {"sampling": {"source_observation_count": len(index), "emitted_point_count": len(strategy),
            "method": "EXTREMA_BUCKET_V1"}, "strategy_rebased_100": strategy,
            "benchmark_rebased_100": points(close / close[0] * 100) if good_close else [],
            "drawdown_fraction": points(equity / np.maximum.accumulate(equity) - 1)},
        "return_distribution": {"state": distribution["state"], "reason_code": distribution["reason_code"],
            "origin": "PORTAL_DERIVED", "sampling": "UTC_DAY", "observation_count": distribution["source_observation_count"],
            "bucket_basis": "ALL_TIME_SOURCE_UTC_DAILY_RETURNS_12_BIN_V1", "statistics_policy": DISTRIBUTION_POLICY.copy(),
            **statistics, "buckets": [{**row, "count": int(row["count"])} for row in distribution["values"]]}}


def drawdown_episodes(index: Any, equity: Any) -> tuple[list[dict[str, Any]], bool, bool]:
    peak = 0
    trough = None
    episodes = []
    for at in range(1, len(equity)):
        if equity[at] >= equity[peak]:
            if trough is not None:
                episodes.append(_episode(index, equity, peak, trough, at))
                trough = None
            peak = at
        elif trough is None or equity[at] < equity[trough]:
            trough = at
    if trough is not None:
        episodes.append(_episode(index, equity, peak, trough, None))
    longest = max(episodes, key=lambda row: (row["duration_seconds"], row["recovery_utc_ms"] is None), default=None)
    return episodes, trough is not None, bool(longest and longest["recovery_utc_ms"] is None)


def _episode(index, equity, peak, trough, recovery):
    end = len(index) - 1 if recovery is None else recovery
    return {"start_utc_ms": int(index[peak].value // 1_000_000),
            "trough_utc_ms": int(index[trough].value // 1_000_000),
            "recovery_utc_ms": None if recovery is None else int(index[recovery].value // 1_000_000),
            "depth_fraction": decimal_text(equity[trough] / equity[peak] - 1),
            "duration_seconds": int((index[end] - index[peak]).total_seconds())}


def enrich_analysis(*, run_id: str, result: Any, mode: str, market_close: Any,
                    benchmark_locator: str, source_tables: list[dict[str, Any]],
                    is_start_utc_ms: int | None = None, oos_start_utc_ms: int | None = None,
                    sampled: bool = False, source_observation_count: int | None = None,
                    nominal_bar_ms: int | None = None, analytics: dict[str, Any] | None = None,
                    source_windows: dict[str, Any] | None = None) -> dict[str, Any]:
    import numpy as np
    import pandas as pd
    from quantbt.core.scopes import scoped_result

    scoped = scoped_result(result, scope="oos") if mode == "WFO" else oos_scoped_result(result, oos_start_utc_ms=oos_start_utc_ms)
    index = scoped.equity.index.tz_convert("UTC").as_unit("ns")
    capital = scoped.equity.to_numpy(dtype=float)
    if not 2 <= len(index) <= 2_000_000 or not index.is_unique or not index.is_monotonic_increasing \
            or not np.isfinite(capital).all() or np.any(capital <= 0):
        raise ValueError("enrichment requires chronological positive sealed OOS equity")
    step_ms = nominal_bar_ms or int(np.min(np.diff(index.asi8)) // 1_000_000)
    if step_ms <= 0:
        raise ValueError("enrichment nominal bar interval is invalid")
    if sampled and analytics is None:
        locator = "P13.retained_sampled_equity:OOS"
        base = {"input_digest": digest_rows(source_tables), "scope_locator": locator,
            "metrics": {key: _fact(None, digest_rows(source_tables), locator) for key in (
                "sharpe", "sortino", "cagr_fraction", "profit_factor", "long_hit_rate_fraction", "short_hit_rate_fraction",
                "volatility_fraction", "skew", "excess_kurtosis", "beta", "correlation", "benchmark_return_fraction",
                "max_drawdown_duration_days", "sharpe_decay")},
            "behaviour": {key: _fact(None, digest_rows(source_tables), locator) for key in (
                "exposure_long_fraction", "exposure_short_fraction", "exposure_flat_fraction", "win_rate", "payoff_ratio",
                "average_hold_seconds", "max_consecutive_losses", "turnover_notional")}}
    else:
        base = analytics or portal_analytics_v2(result=result, mode=mode, market_close=market_close,
            benchmark_locator=benchmark_locator, is_start_utc_ms=is_start_utc_ms, oos_start_utc_ms=oos_start_utc_ms)
    window_bounds = _source_windows(source_windows)
    is_input = _declared_is_input(result=result, mode=mode, sampled=sampled, window_bounds=window_bounds,
        is_start_utc_ms=is_start_utc_ms, oos_start_utc_ms=oos_start_utc_ms,
        market_close=market_close, benchmark_locator=benchmark_locator)
    tables = sorted([*source_tables, *([is_input[2]] if is_input else [])], key=lambda row: row["name"])
    if "oos" in window_bounds and not (window_bounds["oos"]["start_ms"] <= int(index[0].value // 1_000_000)
            and int(index[-1].value // 1_000_000) < window_bounds["oos"]["end_ms"]):
        raise ValueError("source OOS bounds do not contain the retained OOS account")
    if not 1 <= len(tables) <= 8 or len({row["name"] for row in tables}) != len(tables):
        raise ValueError("enrichment source table identities are invalid")
    digest = digest_rows({"version": "research.enriched-analysis.v1", "run_id": run_id,
        "lane": mode, "sampled": sampled, "source_tables": tables, "analytics_input": base["input_digest"],
        "source_observation_count": source_observation_count, "nominal_bar_ms": step_ms,
        "chart_definition_id": CHART_DEFINITION, "return_definition_id": RETURN_DEFINITION,
        "source_windows": window_bounds,
        **({"is_definition_id": IS_DEFINITION, "is_return_definition_id": IS_RETURN_DEFINITION,
            "is_distribution_policy": DISTRIBUTION_POLICY} if is_input else {})})
    metrics, behaviour = copy.deepcopy(base["metrics"]), copy.deepcopy(base["behaviour"])
    for fact in (*metrics.values(), *behaviour.values()):
        fact["input_digest"] = digest
    if sampled and analytics is None:
        # Neither sampled equity nor a v1 display passport proves daily returns,
        # positions, benchmark prices or a complete trade/diagnostic ledger.
        for facts in (metrics, behaviour):
            for key, fact in facts.items():
                facts[key] = _fact(None, digest, "P13.retained_sampled_equity:not_a_daily_or_position_ledger",
                    reason="P04_RETAINED_SAMPLED_EQUITY_HAS_NO_COMPLETE_ANALYTICS_INPUT")
    close = market_close.reindex(scoped.equity.index).to_numpy(dtype=float)
    good_close = np.isfinite(close).all() and bool(np.all(close > 0)) and not sampled
    if not good_close and not (sampled and analytics is not None):
        for key in ("beta", "correlation", "benchmark_return_fraction", "long_hit_rate_fraction", "short_hit_rate_fraction"):
            metrics[key] = _fact(None, digest, benchmark_locator, reason="AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED")
    dd = capital / np.maximum.accumulate(capital) - 1
    episodes, open_present, longest_open = drawdown_episodes(index, capital)
    for ordinal, episode in enumerate(episodes, 1):
        episode["label"] = f"Drawdown {ordinal} ({'open' if episode['recovery_utc_ms'] is None else 'recovered'})"
        episode["regime"] = {"state": "NOT_PUBLISHED", "value": None,
            "reason_code": "SOURCE_DID_NOT_PUBLISH_MARKET_REGIME",
            "source_locator": "QuantBT.result.metadata:market_regime_not_published", "input_digest": digest}
    def points(values, maximum=32):
        chosen = extrema_indices(list(values), maximum_points=maximum)
        return [{"at_utc_ms": int(index[i].value // 1_000_000), "value": decimal_text(values[i])} for i in chosen]
    strategy = points(capital / capital[0] * 100)
    distributions = all_time_distributions(equity=scoped.equity,
        daily_returns=pd.Series([], index=pd.DatetimeIndex([], tz="UTC"), dtype=float) if sampled else scoped.daily_returns,
        digest=digest, scope_locator=base["scope_locator"], maximum_months=120)
    monthly = distributions["monthly_returns"]
    monthly_values = []
    for row in monthly["values"]:
        start = pd.Timestamp(row["month_start_utc_ms"], unit="ms", tz="UTC")
        expected = int(math.ceil(((start + pd.offsets.MonthBegin(1)) - start).total_seconds() * 1000 / step_ms))
        monthly_values.append({**row, "expected_observation_count": expected,
            "partial": row["partial"] or sampled or row["observation_count"] < expected})
    dist = distributions["return_distribution"]
    state = {"state": "AVAILABLE", "reason_code": None}
    windows = {"oos": state, "is": {"state": "NOT_PUBLISHED", "reason_code": "RETAINED_NO_IN_SAMPLE_ACCOUNT_PAYLOAD"},
        "holdout": {"state": "NOT_PUBLISHED", "reason_code": "RETAINED_NO_HOLDOUT_ACCOUNT_PAYLOAD"}}
    windows = {kind: {**head, **window_bounds.get(kind, {})} for kind, head in windows.items()}
    if is_input:
        windows["is"].update(state="AVAILABLE", reason_code=None)
    fold_table = result.metadata.get("walk_forward", {}).get("fold_table") if mode == "WFO" else None
    fold_count = len(fold_table) if fold_table is not None else 1
    source_count = source_observation_count or len(index)
    if source_count < len(index):
        raise ValueError("enrichment coverage contradicts retained observations")
    block = {
        "schema_version": "research.enriched-analysis.v1", "service": "enrich_analysis", "basis": "ALL_TIME",
        "lane": mode, "run_id": run_id, "input_digest": digest, "source_tables": tables,
        "scope": {"window": "OOS", "first_at_utc_ms": int(index[0].value // 1_000_000),
            "last_at_utc_ms": int(index[-1].value // 1_000_000), "observation_count": len(index),
            "fold_count": fold_count, "locator": base["scope_locator"], "benchmark_locator": benchmark_locator,
            "coverage": "SAMPLED_RETAINED_EQUITY" if sampled else "FULL_RETAINED_OOS",
            "source_observation_count": source_count},
        "windows": windows,
        "facts": {"metrics": metrics, "behaviour": behaviour},
        "curves": {"sampling": {"source_observation_count": len(index), "emitted_point_count": len(strategy),
            "method": "EXTREMA_BUCKET_V1"}, "strategy_rebased_100": strategy,
            "benchmark_rebased_100": points(close / close[0] * 100) if good_close else [],
            "drawdown_fraction": points(dd)},
        "monthly_returns": {**state, "state": monthly["state"], "reason_code": monthly["reason_code"],
            "origin": "PORTAL_DERIVED", "includes_partial_months": True, "values": monthly_values,
            "sampling": monthly["sampling"], "total_period_count": monthly["total_period_count"],
            "omitted_transport_period_count": monthly["omitted_transport_period_count"],
            "definition_id": distributions["monthly_definition"]},
        "return_distribution": {"state": "NOT_PUBLISHED" if sampled else dist["state"],
            "reason_code": "P04_RETAINED_SAMPLED_EQUITY_HAS_NO_DAILY_RETURN_LEDGER" if sampled else dist["reason_code"],
            "origin": "PORTAL_DERIVED", "sampling": "UTC_DAY", "observation_count": 0 if sampled else dist["source_observation_count"],
            "bucket_basis": distributions["distribution_definition"],
            "statistics_policy": DISTRIBUTION_POLICY.copy(),
            **distribution_statistics(daily_returns=scoped.daily_returns, digest=digest, sampled=sampled),
            "buckets": [] if sampled else [{**row, "count": int(row["count"])} for row in dist["values"]]},
        "drawdown_episodes": {**state, "origin": "PORTAL_DERIVED", "total": len(episodes),
            "open_episode_present": open_present, "longest_open": longest_open,
            "values": sorted(episodes, key=lambda row: (float(row["depth_fraction"]), row["start_utc_ms"]))[:10]},
        "library_summary": {**state, "label": "all time", "basis": "ALL_TIME", "sparkline": points(capital, 64),
            "sampling": "EXTREMA_BUCKET_V1", "source_observation_count": source_count,
            "coverage": "SAMPLED_RETAINED_EQUITY" if sampled else "FULL_RETAINED_OOS",
            "return_fraction": decimal_text(capital[-1] / capital[0] - 1), "sharpe": metrics["sharpe"],
            "return_basis": {"definition_id": RETURN_DEFINITION, "scope": "RETAINED_OOS_OBSERVATIONS",
                "first_at_utc_ms": int(index[0].value // 1_000_000), "last_at_utc_ms": int(index[-1].value // 1_000_000),
                "start_equity": decimal_text(capital[0]), "end_equity": decimal_text(capital[-1]),
                "source_locator": base["scope_locator"]},
            "max_drawdown_fraction": decimal_text(min(dd)), "input_digest": digest},
        "rolling": None,
    }
    if is_input:
        block["by_window"] = {"is": _is_payload(scoped=is_input[0], close=is_input[1], bounds=window_bounds["is"],
            digest=digest, benchmark_locator=benchmark_locator)}
        # Only new display samples may shrink; scalar facts, histogram counts,
        # source row counts/digests and the existing OOS payload never change.
        for maximum in (16, 8, 4):
            if len(json.dumps(block, separators=(",", ":"), allow_nan=False).encode()) <= MAX_BYTES:
                break
            curves = block["by_window"]["is"]["curves"]
            for curve in (curves["strategy_rebased_100"], curves["benchmark_rebased_100"], curves["drawdown_fraction"]):
                if len(curve) > maximum:
                    selected = extrema_indices([float(row["value"]) for row in curve], maximum_points=maximum)
                    curve[:] = [curve[at] for at in selected]
            curves["sampling"]["emitted_point_count"] = len(curves["strategy_rebased_100"])
    if len(json.dumps(block, separators=(",", ":"), allow_nan=False).encode()) > MAX_BYTES:
        raise ValueError("enrichment exceeds its independent immutable byte budget")
    return block


def enrich_retained(*, run_id: str, observations: list[dict[str, Any]], folds: list[dict[str, Any]],
                    nominal_bar_ms: int | None = None, source_windows: dict[str, Any] | None = None):
    from portal_api.services.research_analytics_sidecar import retained_result, derive_sidecar
    result, close = retained_result(observations, folds)
    return enrich_analysis(run_id=run_id, result=result, mode="WFO", market_close=close,
        benchmark_locator="P05.retained_OBSERVATION.bar.candle.close_or_NOT_PUBLISHED",
        nominal_bar_ms=nominal_bar_ms, analytics=derive_sidecar(observations, folds),
        source_windows=source_windows,
        source_tables=[{"name": kind, "row_count": len(rows), "digest": digest_rows(rows)}
            for kind, rows in (("OBSERVATION", observations), ("FOLD", folds))])


def enrich_fixed_passport(*, run_id: str, passport: dict[str, Any], nominal_bar_ms: int | None = None,
                          source_windows: dict[str, Any] | None = None):
    import pandas as pd
    from quantbt.core.results import BacktestResultV2
    rows = passport["equity_points"]
    index = pd.to_datetime([row["at_utc_ms"] for row in rows], unit="ms", utc=True)
    equity = pd.Series([float(row["equity"]) for row in rows], index=index)
    # Placeholder arrays feed only the typed result interface: every analytic
    # needing these inputs is explicitly withheld in sampled mode above.
    close = pd.Series(float("nan"), index=index)
    result = BacktestResultV2(equity=equity, returns=equity.pct_change().fillna(0),
        positions=pd.DataFrame({"Position_retained": 0.0}, index=index),
        closes=pd.DataFrame({"retained": close}, index=index), symbols=["retained"], initial_capital=float(equity.iloc[0]))
    # A v2 block already sealed by the original full-data child is a valid
    # source fact. Preserve it; do not recalculate its daily metrics from the
    # sparse display points or downgrade existing source facts to absence.
    analytics = passport.get("summary_analytics_v2")
    tables = [{"name": "P13_EQUITY_POINTS", "row_count": len(rows), "digest": digest_rows(rows)}]
    if analytics is not None:
        tables.append({"name": "P13_SEALED_ANALYTICS_V2", "row_count": 1, "digest": digest_rows(analytics)})
    return enrich_analysis(run_id=run_id, result=result, mode="FIXED", market_close=close,
        oos_start_utc_ms=int(index[0].value // 1_000_000), sampled=True,
        source_observation_count=passport["source"]["oos_observation_count"], nominal_bar_ms=nominal_bar_ms,
        benchmark_locator="P13.retained_sampled_equity:benchmark_NOT_PUBLISHED",
        source_tables=tables, analytics=analytics, source_windows=source_windows)
