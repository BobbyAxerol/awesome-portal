"""Bounded, source-time descriptive analytics over a QuantBT result.

This module never executes a strategy, computes PnL/fills/objectives, or reads
HMD itself.  Both child lanes pass their already-loaded close and result; the
output is an immutable, small Portal-derived companion to the v1 engine block.
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any

from portal_api.services.research_evidence_metrics import (
    decimal_text,
    engine_oos_metrics,
    extrema_indices,
    oos_scoped_result,
)

SCHEMA_VERSION = "research.retained-analytics.v2"
MAX_BLOCK_BYTES = 16_384
MAX_OBSERVATIONS = 2_000_000
MAX_CURVE_POINTS = 24
TRADING_DAYS = 365


def _fact(value: object | None, digest: str, locator: str, *,
          reason: str = "PORTAL_ANALYTICS_INPUT_UNAVAILABLE",
          state: str = "NOT_PUBLISHED", origin: str = "PORTAL_DERIVED") -> dict[str, Any]:
    if value is not None:
        try:
            value = decimal_text(value)
        except (TypeError, ValueError, OverflowError):
            value = None
            reason = "PORTAL_ANALYTICS_NON_FINITE_RESULT"
        else:
            state, reason = "AVAILABLE", None
    return {"state": state, "reason_code": reason, "value": value,
            "origin": origin, "scope": "OOS", "source_locator": locator,
            "input_digest": digest}


def _curve(points: Any, values: Any, *, maximum: int = MAX_CURVE_POINTS) -> list[dict[str, Any]]:
    if not len(points):
        return []
    chosen = extrema_indices([float(value) for value in values], maximum_points=maximum)
    return [{"at_utc_ms": int(points[index].value // 1_000_000),
             "value": decimal_text(values[index])} for index in chosen]


def _episodes(positions: Any, returns: Any, digest: str) -> dict[str, dict[str, Any]]:
    """Account-exposure episodes, deliberately not an audited trade ledger."""
    import numpy as np

    keys = ("win_rate", "payoff_ratio", "average_hold_seconds", "max_consecutive_losses")
    locator = "QuantBT.result.positions+returns:account_exposure_episodes_not_audited_trades"
    absent = lambda reason: {key: _fact(None, digest, locator, reason=reason,
                                        state="NOT_APPLICABLE") for key in keys}
    if positions.shape[1] != 1:
        return absent("PORTAL_ANALYTICS_MULTI_SYMBOL_EPISODES_NOT_ATTRIBUTABLE")
    signs = np.sign(positions.iloc[:, 0].to_numpy(dtype=float))
    gains = returns.to_numpy(dtype=float)
    if not np.isfinite(signs).all() or not np.isfinite(gains).all() or np.any(gains <= -1):
        return absent("PORTAL_ANALYTICS_EPISODE_INPUT_INVALID")
    completed: list[tuple[float, float]] = []
    start: int | None = None
    for index in range(len(signs) + 1):
        sign = signs[index] if index < len(signs) else 0
        if start is not None and (sign == 0 or sign != signs[start]):
            # The return at bar t belongs to exposure at t-1.  A still-open
            # episode is excluded, rather than invented as a closed trade.
            if index < len(signs):
                factor = float(np.prod(1.0 + gains[start + 1:index + 1]))
                duration = (positions.index[index] - positions.index[start]).total_seconds()
                completed.append((factor - 1.0, duration))
            start = None
        if index < len(signs) and sign != 0 and start is None:
            start = index
    if not completed:
        return absent("PORTAL_ANALYTICS_NO_CLOSED_POSITION_EPISODES")
    wins = [gain for gain, _ in completed if gain > 0]
    losses = [-gain for gain, _ in completed if gain < 0]
    streak = longest = 0
    for gain, _ in completed:
        streak = streak + 1 if gain < 0 else 0
        longest = max(longest, streak)
    return {
        "win_rate": _fact(len(wins) / len(completed), digest, locator),
        "payoff_ratio": _fact((sum(wins) / len(wins)) / (sum(losses) / len(losses)), digest, locator)
            if wins and losses else _fact(None, digest, locator, reason="PORTAL_ANALYTICS_EPISODES_NEED_WINS_AND_LOSSES", state="NOT_APPLICABLE"),
        "average_hold_seconds": _fact(sum(seconds for _, seconds in completed) / len(completed), digest, locator),
        "max_consecutive_losses": _fact(longest, digest, locator),
    }


def portal_analytics_v2(*, result: Any, mode: str, market_close: Any,
                        benchmark_locator: str, is_start_utc_ms: int | None = None,
                        oos_start_utc_ms: int | None = None) -> dict[str, Any]:
    """Produce all-time OOS facts and one explicitly labelled last-30D card.

    WFO scopes to QuantBT's union of outer-test windows; FIXED scopes to P08's
    immutable OOS boundary.  No source request is made on a read path.
    """
    import numpy as np
    import pandas as pd
    from quantbt.core.results import BacktestResultV2
    from quantbt.core.scopes import scoped_result
    from quantbt.core.types import BacktestResult

    if not isinstance(result, (BacktestResult, BacktestResultV2)) or mode not in {"FIXED", "WFO"}:
        raise ValueError("Portal analytics require an admitted QuantBT result")
    if mode == "WFO":
        scoped = scoped_result(result, scope="oos")
        scope_locator = "quantbt==1.1.1:scoped_result(scope='oos',source_fold_table)"
    else:
        if oos_start_utc_ms is None:
            raise ValueError("fixed Portal analytics require the sealed P08 OOS boundary")
        scoped = oos_scoped_result(result, oos_start_utc_ms=oos_start_utc_ms)
        scope_locator = "quantbt==1.1.1:scoped_result(scope='oos',P08.OOS.start:last_child_bar)"
    index = scoped.equity.index
    if not 2 <= len(index) <= MAX_OBSERVATIONS or index.tz is None or not index.is_monotonic_increasing or not index.is_unique:
        raise ValueError("Portal analytics require bounded UTC chronological OOS observations")
    if not isinstance(market_close, pd.Series) or not market_close.index.is_unique or market_close.index.tz is None:
        raise ValueError("Portal analytics require the already-loaded HMD close series")
    close = market_close.reindex(index)
    if not 1 <= len(benchmark_locator) <= 256:
        raise ValueError("benchmark locator must be bounded and nonempty")
    equity = scoped.equity.to_numpy(dtype=float)
    bar_returns = scoped.returns.to_numpy(dtype=float)
    positions = scoped.positions.reindex(index)
    position_values = positions.to_numpy(dtype=float)
    close_values = close.to_numpy(dtype=float)
    if not np.isfinite(equity).all() or not np.isfinite(bar_returns).all() or not np.isfinite(position_values).all():
        raise ValueError("Portal analytics cannot seal non-finite QuantBT result observations")
    digest_source = hashlib.sha256()
    digest_source.update(scope_locator.encode())
    digest_source.update(benchmark_locator.encode())
    for stamp, capital, ret, pos, price in zip(index, equity, bar_returns, position_values, close_values, strict=True):
        digest_source.update(json.dumps([int(stamp.value // 1_000_000), repr(capital), repr(ret),
                                         [repr(float(value)) for value in np.atleast_1d(pos)],
                                         repr(price)], separators=(",", ":")).encode())
    digest = digest_source.hexdigest()

    daily = scoped.daily_returns.dropna().astype(float)
    daily_values = daily.to_numpy(dtype=float)
    if not np.isfinite(daily_values).all():
        daily_values = np.asarray([], dtype=float)
    values = daily_values
    metrics: dict[str, dict[str, Any]] = {}
    engine, _sample = engine_oos_metrics(scoped)
    for key in ("sharpe", "sortino", "cagr_fraction", "profit_factor",
                "long_hit_rate_fraction", "short_hit_rate_fraction"):
        source = engine[key]
        metrics[key] = _fact(source["value"] if source["state"] == "AVAILABLE" else None,
                             digest, "quantbt.full_report." + key,
                             reason=source["reason_code"] or "PORTAL_ANALYTICS_ENGINE_VALUE_UNAVAILABLE",
                             state=source["state"], origin="ENGINE_DIRECT")
    if len(values) < 2:
        metrics["volatility_fraction"] = _fact(None, digest, "scoped.daily_returns:std_ddof1*sqrt365",
            reason="PORTAL_ANALYTICS_TOO_FEW_DAILY_RETURNS", state="NOT_APPLICABLE")
    else:
        metrics["volatility_fraction"] = _fact(float(np.std(values, ddof=1) * math.sqrt(TRADING_DAYS)),
            digest, "scoped.daily_returns:std_ddof1*sqrt365")
    centered = values - np.mean(values) if len(values) else values
    variance = float(np.mean(centered ** 2)) if len(values) else 0.0
    for key, minimum, power, subtract in (("skew", 3, 3, 0), ("excess_kurtosis", 4, 4, 3)):
        locator = f"scoped.daily_returns:population_m{power}/m2^{power/2:g}" + ("-3" if subtract else "")
        if len(values) < minimum or variance == 0:
            metrics[key] = _fact(None, digest, locator, reason="PORTAL_ANALYTICS_TOO_FEW_OR_ZERO_VARIANCE_DAILY_RETURNS", state="NOT_APPLICABLE")
        else:
            metrics[key] = _fact(float(np.mean(centered ** power) / variance ** (power / 2) - subtract), digest, locator)

    aligned = pd.DataFrame({"strategy": daily, "benchmark": close.resample("1D").last().pct_change(fill_method=None)}).dropna()
    pair = aligned.to_numpy(dtype=float)
    pair = pair[np.isfinite(pair).all(axis=1)]
    for key in ("beta", "correlation"):
        locator = "scoped.daily_returns+HMD.close:UTC_day_inner_join:population_covariance"
        if len(pair) < 2 or float(np.var(pair[:, 1])) == 0 or (key == "correlation" and float(np.var(pair[:, 0])) == 0):
            metrics[key] = _fact(None, digest, locator, reason="PORTAL_ANALYTICS_BENCHMARK_SAMPLE_INSUFFICIENT", state="NOT_APPLICABLE")
        else:
            covariance = float(np.mean((pair[:, 0] - np.mean(pair[:, 0])) * (pair[:, 1] - np.mean(pair[:, 1]))))
            denominator = float(np.var(pair[:, 1])) if key == "beta" else float(np.std(pair[:, 0]) * np.std(pair[:, 1]))
            metrics[key] = _fact(covariance / denominator, digest, locator)

    good_close = np.isfinite(close_values).all() and np.all(close_values > 0)
    baseline = close_values[0] if good_close else math.nan
    metrics["benchmark_return_fraction"] = _fact(close_values[-1] / baseline - 1 if good_close else None,
        digest, "HMD.close:OOS_first_last_buy_and_hold", reason="PORTAL_ANALYTICS_BENCHMARK_CLOSE_UNAVAILABLE")
    peak = 0
    underwater_peak: int | None = None
    longest_days = 0.0
    longest_recovered = True
    for ordinal, capital in enumerate(equity):
        if capital >= equity[peak]:
            if underwater_peak is not None:
                days = (index[ordinal] - index[underwater_peak]).total_seconds() / 86_400
                if days >= longest_days:
                    longest_days, longest_recovered = days, True
                underwater_peak = None
            peak = ordinal
        elif underwater_peak is None:
            underwater_peak = peak
    if underwater_peak is not None:
        days = (index[-1] - index[underwater_peak]).total_seconds() / 86_400
        if days >= longest_days:
            longest_days, longest_recovered = days, False
    metrics["max_drawdown_duration_days"] = _fact(longest_days, digest,
        "QuantBT.result.equity:longest_peak_to_recovery_or_scope_end_days")
    if mode == "FIXED" and is_start_utc_ms is not None and oos_start_utc_ms is not None:
        import dataclasses
        start = pd.Timestamp(is_start_utc_ms, unit="ms", tz="UTC")
        end = pd.Timestamp(oos_start_utc_ms, unit="ms", tz="UTC")
        mask = (result.equity.index >= start) & (result.equity.index < end)
        if int(mask.sum()) >= 2:
            is_result = dataclasses.replace(result,
                equity=result.equity.loc[mask], returns=result.returns.loc[mask],
                positions=result.positions.loc[mask], closes=result.closes.loc[mask])
            is_sharpe = engine_oos_metrics(is_result)[0]["sharpe"]
            oos_sharpe = engine["sharpe"]
            if is_sharpe["state"] == "AVAILABLE" and oos_sharpe["state"] == "AVAILABLE":
                metrics["sharpe_decay"] = _fact(float(is_sharpe["value"]) - float(oos_sharpe["value"]),
                    digest, "quantbt.full_report.sharpe:sealed_IS_minus_OOS", origin="PORTAL_DERIVED")
    metrics.setdefault("sharpe_decay", _fact(None, digest,
        "quantbt.full_report.sharpe:sealed_IS_minus_OOS",
        reason="PORTAL_ANALYTICS_IS_OR_OOS_SHARPE_UNAVAILABLE", state="NOT_APPLICABLE"))

    counts = {"long": int(np.sum(position_values > 0)), "short": int(np.sum(position_values < 0)),
              "flat": int(np.sum(position_values == 0))}
    total = sum(counts.values())
    behaviour = {f"exposure_{side}_fraction": _fact(count / total, digest,
        "QuantBT.result.positions:OOS_bar_side_fraction") for side, count in counts.items()}
    behaviour.update(_episodes(positions, scoped.returns, digest))
    diagnostics = getattr(scoped, "diagnostics", None)
    turnover = None
    if isinstance(diagnostics, pd.DataFrame) and "turnover" in diagnostics:
        series = diagnostics["turnover"].reindex(index)
        if np.isfinite(series.to_numpy(dtype=float)).all():
            turnover = float(series.sum())
    behaviour["turnover_notional"] = _fact(turnover, digest, "QuantBT.result.diagnostics.turnover:OOS_sum",
        reason="PORTAL_ANALYTICS_TURNOVER_NOT_PUBLISHED")

    strategy_curve = _curve(index, equity / equity[0] * 100)
    benchmark_curve = _curve(index, close_values / baseline * 100) if good_close else []
    last_start = index[-1] - pd.Timedelta(days=30)
    last_equity = scoped.equity.loc[scoped.equity.index >= last_start]
    last_daily = daily.loc[daily.index >= last_start]
    last_values = last_daily.to_numpy(dtype=float)
    last_sharpe = None if len(last_values) < 2 or float(np.std(last_values, ddof=1)) == 0 else \
        float(np.mean(last_values) / np.std(last_values, ddof=1) * math.sqrt(TRADING_DAYS))
    last_30d = {
        "label": "last 30D", "window_start_utc_ms": int(last_start.value // 1_000_000),
        "window_end_utc_ms": int(index[-1].value // 1_000_000),
        "partial_window": bool(index[0] > last_start),
        "source_observation_count": len(last_equity),
        "points": _curve(last_equity.index, last_equity.to_numpy(dtype=float)),
        "return_fraction": _fact(float(last_equity.iloc[-1] / last_equity.iloc[0] - 1) if len(last_equity) >= 2 else None,
            digest, "QuantBT.result.equity:trailing_30_UTC_days", reason="PORTAL_ANALYTICS_TOO_FEW_LAST_30D_OBSERVATIONS", state="NOT_APPLICABLE"),
        "sharpe": _fact(last_sharpe, digest, "scoped.daily_returns:trailing_30_UTC_days:annualized365",
            reason="PORTAL_ANALYTICS_TOO_FEW_OR_ZERO_VARIANCE_LAST_30D_RETURNS", state="NOT_APPLICABLE"),
    }
    block = {
        "schema_version": SCHEMA_VERSION, "input_digest": digest,
        "scope_locator": scope_locator, "benchmark_locator": benchmark_locator,
        "oos_observation_count": len(index), "drawdown_recovered": longest_recovered,
        "metrics": metrics,
        "behaviour": behaviour,
        "strategy_curve": strategy_curve, "benchmark_curve": benchmark_curve,
        "last_30d": last_30d,
    }
    if len(json.dumps(block, separators=(",", ":"), allow_nan=False).encode()) > MAX_BLOCK_BYTES:
        raise ValueError("Portal analytics v2 exceed immutable transport budget")
    return block
