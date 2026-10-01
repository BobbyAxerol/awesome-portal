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
from typing import Any

from portal_api.services.research_distributions import all_time_distributions
from portal_api.services.research_evidence_metrics import decimal_text, extrema_indices, oos_scoped_result
from portal_api.services.research_portal_analytics import portal_analytics_v2, _fact

MAX_BYTES = 65_536


def digest_rows(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


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
                    nominal_bar_ms: int | None = None, analytics: dict[str, Any] | None = None) -> dict[str, Any]:
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
    tables = sorted(source_tables, key=lambda row: row["name"])
    if not 1 <= len(tables) <= 8 or len({row["name"] for row in tables}) != len(tables):
        raise ValueError("enrichment source table identities are invalid")
    digest = digest_rows({"version": "research.enriched-analysis.v1", "run_id": run_id,
        "lane": mode, "sampled": sampled, "source_tables": tables, "analytics_input": base["input_digest"],
        "source_observation_count": source_observation_count, "nominal_bar_ms": step_ms})
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
        "windows": {"oos": state, "is": {"state": "NOT_PUBLISHED", "reason_code": "RETAINED_NO_IN_SAMPLE_ACCOUNT_PAYLOAD"},
            "holdout": {"state": "NOT_PUBLISHED", "reason_code": "RETAINED_NO_HOLDOUT_ACCOUNT_PAYLOAD"}},
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
            "buckets": [] if sampled else [{**row, "count": int(row["count"])} for row in dist["values"]]},
        "drawdown_episodes": {**state, "origin": "PORTAL_DERIVED", "total": len(episodes),
            "open_episode_present": open_present, "longest_open": longest_open,
            "values": sorted(episodes, key=lambda row: (float(row["depth_fraction"]), row["start_utc_ms"]))[:10]},
        "library_summary": {**state, "label": "all time", "basis": "ALL_TIME", "sparkline": points(capital, 64),
            "sampling": "EXTREMA_BUCKET_V1", "source_observation_count": source_count,
            "coverage": "SAMPLED_RETAINED_EQUITY" if sampled else "FULL_RETAINED_OOS",
            "return_fraction": decimal_text(capital[-1] / capital[0] - 1), "sharpe": metrics["sharpe"],
            "max_drawdown_fraction": decimal_text(min(dd)), "input_digest": digest},
        "rolling": None,
    }
    if len(json.dumps(block, separators=(",", ":"), allow_nan=False).encode()) > MAX_BYTES:
        raise ValueError("enrichment exceeds its independent immutable byte budget")
    return block


def enrich_retained(*, run_id: str, observations: list[dict[str, Any]], folds: list[dict[str, Any]],
                    nominal_bar_ms: int | None = None):
    from portal_api.services.research_analytics_sidecar import retained_result, derive_sidecar
    result, close = retained_result(observations, folds)
    return enrich_analysis(run_id=run_id, result=result, mode="WFO", market_close=close,
        benchmark_locator="P05.retained_OBSERVATION.bar.candle.close_or_NOT_PUBLISHED",
        nominal_bar_ms=nominal_bar_ms, analytics=derive_sidecar(observations, folds),
        source_tables=[{"name": kind, "row_count": len(rows), "digest": digest_rows(rows)}
            for kind, rows in (("OBSERVATION", observations), ("FOLD", folds))])


def enrich_fixed_passport(*, run_id: str, passport: dict[str, Any], nominal_bar_ms: int | None = None):
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
        source_tables=tables, analytics=analytics)
