"""RF-05 / P13 OOS analytics read from the pinned QuantBT 1.1.1 result.

The confined P04 child already publishes endpoint, drawdown and chart facts
(``research.p13.evidence-source.v1``).  This module adds the Screen-04
performance facts the engine itself computes, *without* re-implementing them:

* Metrics are QuantBT's own ``full_report`` numbers over the OOS scope.  The
  scope is produced by QuantBT's own ``scoped_result(scope="oos")`` path: the
  child tape is given a one-row walk-forward ``fold_table`` whose test window
  is [P08 OOS boundary, last child bar].  Nothing here recomputes a Sharpe.
* The engine returns sentinels (``0.0`` for a zero-variance Sharpe, ``inf``
  for a loss-free profit factor, ``0.0`` hit rate without exposure, ...).  A
  sentinel is not a measurement, so each one becomes a typed absence with a
  reason code instead of a number.
* Rolling Sharpe(63) is QuantBT's ``rolling_sharpe`` over the scoped result
  (63 UTC daily returns, 365-day annualisation).  Rolling beta needs a
  benchmark series, which P04 does not publish: typed ``NOT_PUBLISHED``.
* Sharpe decay (IS vs OOS) needs the IS boundary, which the P06 child receipt
  does not carry (only ``oos_start_utc_ms``): typed ``NOT_PUBLISHED``.
* The leading OOS calendar month is measured from the last pre-OOS close only
  when that close belongs to the previous calendar month (a true month
  boundary).  The value is real engine equity; no bar is invented.

Pure functions only: no I/O, no database, no environment.  The child calls
:func:`oos_analytics` once; everything else is exposed for unit tests.
"""

from __future__ import annotations

import dataclasses
import json
import math
from decimal import Decimal, localcontext
from typing import Any

SCHEMA_VERSION = "research.p13.oos-analytics.v1"
ENGINE_SCOPE_LOCATOR = (
    "quantbt==1.1.1:quantbt.core.scopes.scoped_result(scope='oos',"
    "fold_table=[P08 oos_start, last child bar])"
)
ENGINE_REPORT_LOCATOR = "quantbt.metrics.performance.full_report(trading_days=365)"
ENGINE_ROLLING_LOCATOR = "quantbt.metrics.performance.rolling_sharpe(window=63,trading_days=365)"
TRADING_DAYS = 365
ROLLING_SHARPE_WINDOW_DAYS = 63
MAX_ROLLING_SHARPE_POINTS = 12
_MAX_DECIMAL_TEXT = 96
_CAGR_CLAMP = math.expm1(50.0)
#: QuantBT's lower clamp; also its ``growth <= 0`` answer (-1.0).
_CAGR_FLOOR = math.expm1(-50.0)

#: key -> (full_report field, divide-by-100 flag).  The locator published in
#: the receipt names the exact engine field; the /100 is an exact decimal unit
#: conversion from QuantBT's percent convention to the registry's FRACTION.
ENGINE_METRIC_FIELDS: dict[str, tuple[str, bool]] = {
    "sharpe": ("sharpe", False),
    "sortino": ("sortino", False),
    "cagr_fraction": ("cagr_pct", True),
    "profit_factor": ("profit_factor", False),
    "long_hit_rate_fraction": ("long_hitrate_pct", True),
    "short_hit_rate_fraction": ("short_hitrate_pct", True),
}


def decimal_text(value: object) -> str:
    """Render a finite engine float as a plain (non-exponent) decimal string.

    ``Decimal(str(float))`` keeps the float's shortest round-trip digits, so
    the text is exactly the engine's number, never a re-rounded one.
    """

    if isinstance(value, bool):
        raise ValueError("P13 analytics value is not numeric")
    numeric = float(value)  # type: ignore[arg-type]
    if not math.isfinite(numeric):
        raise ValueError("P13 analytics value is not finite")
    text = format(value if isinstance(value, Decimal) else Decimal(str(numeric)), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    text = "0" if text in {"", "-0"} else text
    if len(text) > _MAX_DECIMAL_TEXT:
        raise ValueError("P13 analytics value exceeds the exact-decimal transport bound")
    return text


def _percent_to_fraction(value: float) -> str:
    with localcontext() as context:
        context.prec = 48
        return decimal_text(Decimal(str(float(value))) / Decimal(100))


def _absent(state: str, reason_code: str) -> dict[str, Any]:
    return {"state": state, "reason_code": reason_code, "value": None, "locator": None}


def _utc_ms(value: object) -> int:
    import pandas as pd

    timestamp = pd.Timestamp(value)
    timestamp = timestamp.tz_localize("UTC") if timestamp.tzinfo is None else timestamp.tz_convert("UTC")
    milliseconds = int(timestamp.value // 1_000_000)
    if milliseconds < 0:
        raise ValueError("P13 analytics timestamp precedes UTC epoch")
    return milliseconds


def _engine_result_types() -> tuple[type, ...]:
    from quantbt.core.results import BacktestResultV2
    from quantbt.core.types import BacktestResult

    return (BacktestResultV2, BacktestResult)


def oos_scoped_result(result: Any, *, oos_start_utc_ms: int):
    """Return QuantBT's own OOS-scoped copy of ``result``.

    The P04 child runs a plain backtest, so the engine has no walk-forward
    metadata of its own.  We hand QuantBT exactly one fold whose test window
    starts at the immutable P08 boundary and ends at the last child bar (the
    producer guarantees the tape stops before the sealed holdout), and let
    ``scoped_result`` slice equity/returns/positions exactly as it does for
    its own walk-forward reports.
    """

    import pandas as pd
    from quantbt.core.scopes import scoped_result

    index = result.equity.index
    start = pd.Timestamp(oos_start_utc_ms, unit="ms", tz="UTC")
    if index.tz is None:
        start = start.tz_localize(None)
    fold_table = pd.DataFrame([{"test_start": start, "test_end": index[-1]}])
    metadata = dict(result.metadata)
    metadata["walk_forward"] = {"fold_table": fold_table}
    return scoped_result(dataclasses.replace(result, metadata=metadata), scope="oos")


def declared_is_scoped_result(result: Any, *, start_utc_ms: int, end_exclusive_utc_ms: int):
    """Report on existing declared IS rows; never execute or reset an account.

    QuantBT's public test slicer has an inclusive end. Use the last actual IS
    observation, not the exclusive boundary (which belongs to OOS). Its ledger
    tuples are not scoped, so callers must not publish IS trades/fills from it.
    """
    import numpy as np
    import pandas as pd
    from quantbt.core.scopes import scoped_result

    if not isinstance(result, _engine_result_types()) or any(type(value) is not int
            or not 0 <= value <= 9_007_199_254_740_991 for value in (start_utc_ms, end_exclusive_utc_ms)) \
            or start_utc_ms >= end_exclusive_utc_ms:
        raise ValueError("declared IS reporting requires an admitted result and half-open UTC bounds")
    index = result.equity.index
    if not 2 <= len(index) <= 2_000_000 or index.tz is None or not index.is_unique \
            or not index.is_monotonic_increasing:
        raise ValueError("declared IS reporting requires bounded chronological source observations")
    start = pd.Timestamp(start_utc_ms, unit="ms", tz="UTC")
    end = pd.Timestamp(end_exclusive_utc_ms, unit="ms", tz="UTC")
    selected = index[(index >= start) & (index < end)]
    if len(selected) < 2:
        raise ValueError("declared IS reporting requires at least two source observations")
    for array in (result.returns, result.positions, result.closes):
        if not array.index.equals(index):
            raise ValueError("declared IS source arrays must have exactly aligned indexes")
    for array in (result.equity, result.returns, result.positions):
        values = array.loc[selected].to_numpy(dtype=float)
        if not np.isfinite(values).all():
            raise ValueError("declared IS source account contains non-finite observations")
    if np.any(result.equity.loc[selected].to_numpy(dtype=float) <= 0):
        raise ValueError("declared IS source equity must be positive")
    metadata = dict(result.metadata)
    metadata["walk_forward"] = {"fold_table": pd.DataFrame([
        {"test_start": start, "test_end": selected[-1]}])}
    return scoped_result(dataclasses.replace(result, metadata=metadata), scope="test")


def engine_is_metrics(scoped: Any) -> dict[str, dict[str, Any]]:
    """Only IS Sharpe and drawdown; public reporting, not a strategy rerun."""
    import numpy as np
    from quantbt.metrics.performance import full_report

    report = full_report(scoped, trading_days=TRADING_DAYS)
    sample, _periods, _kind = _stats_sample(scoped)
    finite = sample[np.isfinite(sample)]
    if len(finite) < 2:
        sharpe = _absent("NOT_APPLICABLE", "P13_IS_RETURN_SAMPLE_BELOW_TWO")
    elif float(np.std(finite, ddof=1)) == 0:
        sharpe = _absent("NOT_APPLICABLE", "P13_IS_RETURN_ZERO_VARIANCE")
    else:
        sharpe = {"state": "AVAILABLE", "reason_code": None, "value": decimal_text(report["sharpe"]),
            "locator": "quantbt.metrics.performance.full_report(trading_days=365).sharpe:DECLARED_IS"}
    with localcontext() as context:
        context.prec = 48
        drawdown = decimal_text(-Decimal(str(float(report["max_drawdown_pct"]))) / Decimal(100))
    return {"sharpe": sharpe, "max_drawdown_fraction": {"state": "AVAILABLE", "reason_code": None,
        "value": drawdown, "locator": "quantbt.metrics.performance.full_report.max_drawdown_pct:-/100:DECLARED_IS"}}


def _stats_sample(scoped: Any) -> tuple[Any, float, str]:
    """The exact return sample and annualisation QuantBT uses for the report."""

    import numpy as np
    from quantbt.metrics import performance

    index = scoped.equity.index
    equity = scoped.equity.to_numpy(dtype=np.float64)
    returns = scoped.returns.to_numpy(dtype=np.float64)
    sample = performance._array_returns_for_stats(index, equity, returns)
    periods = performance._array_annualization_periods(index, sample, TRADING_DAYS)
    # Same precedence as QuantBT: UTC-daily equity returns when at least one
    # finite daily return exists, otherwise bar returns.
    daily = performance._array_daily_equity(index, equity)
    daily_returns = np.diff(daily) / daily[:-1] if len(daily) >= 2 else np.empty(0)
    kind = "DAILY_UTC_EQUITY" if int(np.sum(np.isfinite(daily_returns))) > 0 else "BAR"
    return sample, float(periods), kind


def engine_oos_metrics(scoped: Any) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    """Map QuantBT's own OOS report onto typed metric facts.

    Every AVAILABLE value is the engine's number; every engine sentinel is a
    typed absence.  The guards read the same sample QuantBT reported on.
    """

    import numpy as np
    from quantbt.metrics.performance import full_report

    report = full_report(scoped, trading_days=TRADING_DAYS)
    sample, periods, sample_kind = _stats_sample(scoped)
    finite = sample[np.isfinite(sample)]
    return_sample = {
        "kind": sample_kind,
        "observation_count": int(len(finite)),
        "annualization_periods": decimal_text(periods),
    }

    def engine(key: str) -> dict[str, Any]:
        field, percent = ENGINE_METRIC_FIELDS[key]
        raw = float(report[field])
        if not math.isfinite(raw):
            raise ValueError(f"P13 engine {field} is not finite after its guard")
        return {
            "state": "AVAILABLE",
            "reason_code": None,
            "value": _percent_to_fraction(raw) if percent else decimal_text(raw),
            "locator": f"full_report.{field}" + ("/100" if percent else ""),
        }

    metrics: dict[str, dict[str, Any]] = {}

    # Sharpe: QuantBT returns 0.0 when it has < 2 returns or zero variance.
    if len(finite) < 2:
        metrics["sharpe"] = _absent("NOT_APPLICABLE", "P13_OOS_RETURN_SAMPLE_BELOW_TWO")
    elif float(np.std(finite, ddof=1)) == 0.0:
        metrics["sharpe"] = _absent("NOT_APPLICABLE", "P13_OOS_RETURN_ZERO_VARIANCE")
    else:
        metrics["sharpe"] = engine("sharpe")

    # Sortino: inf without downside and positive mean; 0.0 without downside.
    downside = finite[finite < 0.0]
    if len(finite) == 0:
        metrics["sortino"] = _absent("NOT_APPLICABLE", "P13_OOS_RETURN_SAMPLE_EMPTY")
    elif len(downside) == 0 or float(np.sqrt(np.mean(downside ** 2))) == 0.0:
        metrics["sortino"] = _absent("NOT_APPLICABLE", "P13_OOS_HAS_NO_DOWNSIDE_RETURNS")
    else:
        metrics["sortino"] = engine("sortino")

    # Profit factor: inf when no losing return; gains==0 is a real 0.
    if len(finite) == 0:
        metrics["profit_factor"] = _absent("NOT_APPLICABLE", "P13_OOS_RETURN_SAMPLE_EMPTY")
    elif float(abs(np.sum(finite[finite < 0.0]))) == 0.0:
        metrics["profit_factor"] = _absent("NOT_APPLICABLE", "P13_OOS_HAS_NO_LOSING_RETURNS")
    else:
        metrics["profit_factor"] = engine("profit_factor")

    # CAGR: QuantBT substitutes total return (vs initial capital) below one
    # day, returns 0.0 without elapsed time and clamps at expm1(+-50).
    index = scoped.equity.index
    elapsed_days = (index[-1] - index[0]).total_seconds() / 86_400.0 if len(index) >= 2 else 0.0
    if elapsed_days < 1.0:
        metrics["cagr_fraction"] = _absent("NOT_APPLICABLE", "P13_OOS_SPAN_BELOW_ONE_DAY")
    else:
        cagr_raw = float(report["cagr_pct"]) / 100.0
        clamped_high = math.isclose(cagr_raw, _CAGR_CLAMP, rel_tol=1e-12)
        clamped_low = cagr_raw <= _CAGR_FLOOR or math.isclose(cagr_raw, _CAGR_FLOOR, rel_tol=1e-12)
        if clamped_high or clamped_low:
            metrics["cagr_fraction"] = _absent("NOT_APPLICABLE", "P13_QUANTBT_CAGR_CLAMPED")
        else:
            metrics["cagr_fraction"] = engine("cagr_fraction")

    # Hit rates: QuantBT averages per position column and substitutes 0.0 for
    # a column that never held that side, so the mean is a fact only when
    # every column held exposure.
    positions = scoped.positions[[f"Position_{symbol}" for symbol in scoped.symbols]].to_numpy(dtype=np.float64)
    for side, held in (("long", positions > 0.0), ("short", positions < 0.0)):
        per_column = np.sum(held, axis=0)
        if int(np.sum(per_column)) == 0:
            metrics[f"{side}_hit_rate_fraction"] = _absent("NOT_APPLICABLE", f"P13_OOS_HAS_NO_{side.upper()}_EXPOSURE_BARS")
        elif bool(np.any(per_column == 0)):
            metrics[f"{side}_hit_rate_fraction"] = _absent("NOT_APPLICABLE", f"P13_OOS_{side.upper()}_EXPOSURE_NOT_IN_EVERY_SYMBOL")
        else:
            metrics[f"{side}_hit_rate_fraction"] = engine(f"{side}_hit_rate_fraction")

    # Decay compares IS against OOS Sharpe.  The P06 child receipt carries only
    # the OOS boundary; the tape prefix mixes optional warmup with IS, so an IS
    # Sharpe would be a guess about where warmup ends.
    metrics["sharpe_decay"] = _absent("NOT_PUBLISHED", "P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT")
    return metrics, return_sample


def extrema_indices(values: list[float], *, maximum_points: int) -> list[int]:
    """Chronological sample that keeps both endpoints and each bucket's min/max."""

    count = len(values)
    if maximum_points < 2:
        raise ValueError("P13 analytics sampling needs room for both endpoints")
    if count <= maximum_points:
        return list(range(count))
    buckets = (maximum_points - 2) // 2
    selected = {0, count - 1}
    for bucket in range(buckets):
        start = 1 + ((count - 2) * bucket) // buckets
        end = 1 + ((count - 2) * (bucket + 1)) // buckets
        if end <= start:
            continue
        selected.add(min(range(start, end), key=lambda index: values[index]))
        selected.add(max(range(start, end), key=lambda index: values[index]))
    return sorted(selected)


def engine_rolling_sharpe(scoped: Any) -> dict[str, Any]:
    """QuantBT rolling Sharpe(63 daily returns) over the OOS scope."""

    from quantbt.metrics.performance import rolling_sharpe

    rolling = rolling_sharpe(scoped, window=ROLLING_SHARPE_WINDOW_DAYS, trading_days=TRADING_DAYS)
    daily_returns = int(len(scoped.daily_returns))
    defined = rolling.iloc[ROLLING_SHARPE_WINDOW_DAYS - 1:] if len(rolling) >= ROLLING_SHARPE_WINDOW_DAYS else rolling.iloc[0:0]
    finite = [(stamp, float(value)) for stamp, value in defined.items() if math.isfinite(float(value))]
    base = {
        "window_days": ROLLING_SHARPE_WINDOW_DAYS,
        "daily_return_count": daily_returns,
        "locator": ENGINE_ROLLING_LOCATOR,
    }
    if daily_returns < ROLLING_SHARPE_WINDOW_DAYS:
        return {
            **base, "state": "NOT_APPLICABLE", "reason_code": "P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW",
            "source_observation_count": 0, "omitted_non_finite_count": 0,
            "emitted_point_count": 0, "sampling": None, "points": [],
        }
    omitted = int(len(defined) - len(finite))
    if not finite:
        return {
            **base, "state": "NOT_APPLICABLE", "reason_code": "P13_ROLLING_SHARPE_ZERO_VARIANCE_WINDOWS",
            "source_observation_count": 0, "omitted_non_finite_count": omitted,
            "emitted_point_count": 0, "sampling": None, "points": [],
        }
    selected = extrema_indices([value for _, value in finite], maximum_points=MAX_ROLLING_SHARPE_POINTS)
    points = [{"at_utc_ms": _utc_ms(finite[index][0]), "sharpe": decimal_text(finite[index][1])} for index in selected]
    return {
        **base, "state": "AVAILABLE", "reason_code": None,
        "source_observation_count": len(finite), "omitted_non_finite_count": omitted,
        "emitted_point_count": len(points),
        "sampling": "FULL" if len(points) == len(finite) else "EXTREMA_BUCKET_V1",
        "points": points,
    }


def monthly_leading_boundary(equity: Any, *, oos_start_utc_ms: int) -> dict[str, Any]:
    """Leading OOS calendar-month return from a true month-boundary close.

    ``equity`` is the full child-tape engine equity (warmup + IS + OOS).  The
    base is the last close strictly before the OOS boundary, accepted only
    when it lies in an earlier UTC calendar month than the first OOS bar: it
    is then the previous calendar close, the same rule the child uses for
    every later month.  Mid-month boundaries stay omitted (typed).
    """

    import pandas as pd

    series = equity.astype(float).dropna()
    index = pd.DatetimeIndex(series.index)
    index = index.tz_localize("UTC") if index.tz is None else index.tz_convert("UTC")
    series = pd.Series(series.to_numpy(), index=index)
    start = pd.Timestamp(oos_start_utc_ms, unit="ms", tz="UTC")
    before = series.loc[series.index < start]
    oos = series.loc[series.index >= start]
    if oos.empty:
        return {"state": "NOT_APPLICABLE", "reason_code": "P13_OOS_HAS_NO_OBSERVATIONS", "base_at_utc_ms": None, "point": None}
    if before.empty:
        return {"state": "NOT_APPLICABLE", "reason_code": "P13_NO_PRE_OOS_CLOSE_IN_CHILD_TAPE", "base_at_utc_ms": None, "point": None}
    base_at, base = before.index[-1], float(before.iloc[-1])
    first = oos.index[0]
    if (base_at.year, base_at.month) == (first.year, first.month):
        return {"state": "NOT_APPLICABLE", "reason_code": "P13_OOS_STARTS_MID_CALENDAR_MONTH", "base_at_utc_ms": None, "point": None}
    if not math.isfinite(base) or base <= 0:
        raise ValueError("P13 month-boundary base equity is invalid")
    month = oos.loc[(oos.index.year == first.year) & (oos.index.month == first.month)]
    close = float(month.iloc[-1])
    if not math.isfinite(close) or close <= 0:
        raise ValueError("P13 month-boundary close equity is invalid")
    with localcontext() as context:
        context.prec = 48
        fraction = Decimal(str(close)) / Decimal(str(base)) - Decimal(1)
    month_start = pd.Timestamp(year=first.year, month=first.month, day=1, tz="UTC")
    return {
        "state": "AVAILABLE",
        "reason_code": None,
        "base_at_utc_ms": _utc_ms(base_at),
        "point": {"month_start_utc_ms": _utc_ms(month_start), "return_fraction": decimal_text(fraction)},
    }


def _encoded_size(value: Any) -> int:
    return len(json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))


ENGINE_UNAVAILABLE_REASON = "P13_ENGINE_RESULT_NOT_AVAILABLE_TO_ANALYTICS"


def not_published_block(reason: str = ENGINE_UNAVAILABLE_REASON) -> dict[str, Any]:
    """The typed ``NOT_PUBLISHED`` analytics block: every fact absent, none invented."""

    return {
        "schema_version": SCHEMA_VERSION,
        "state": "NOT_PUBLISHED",
        "reason_code": reason,
        "scope_locator": None,
        "report_locator": None,
        "return_sample": None,
        "metrics": {key: _absent("NOT_PUBLISHED", reason) for key in [*ENGINE_METRIC_FIELDS, "sharpe_decay"]},
        "rolling_sharpe_63": {
            "state": "NOT_PUBLISHED", "reason_code": reason, "window_days": ROLLING_SHARPE_WINDOW_DAYS,
            "daily_return_count": None, "locator": None, "source_observation_count": 0,
            "omitted_non_finite_count": 0, "emitted_point_count": 0, "sampling": None, "points": [],
        },
        "rolling_beta_63": {"state": "NOT_PUBLISHED", "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK", "window_days": ROLLING_SHARPE_WINDOW_DAYS},
        "monthly_leading": {"state": "NOT_PUBLISHED", "reason_code": reason, "base_at_utc_ms": None, "point": None},
    }


def oos_analytics(
    *,
    result: Any,
    market: Any,
    oos_start_utc_ms: int,
    receipt_bytes: int,
    byte_budget: int,
) -> dict[str, Any]:
    """Build the additive ``oos_analytics`` block for one P13 receipt.

    ``receipt_bytes``/``byte_budget`` keep the enlarged receipt inside the
    child's existing transport ceiling: rolling points are the only elastic
    part and are withdrawn (typed) before anything is allowed to overflow.
    """

    beta = {"state": "NOT_PUBLISHED", "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK", "window_days": ROLLING_SHARPE_WINDOW_DAYS}
    if not isinstance(result, _engine_result_types()):
        # A non-engine result (a pre-P13 compatibility caller or a test double)
        # has no engine scope to read.  Say so; never compute a stand-in.
        block: dict[str, Any] = not_published_block()
    else:
        scoped = oos_scoped_result(result, oos_start_utc_ms=oos_start_utc_ms)
        metrics, return_sample = engine_oos_metrics(scoped)
        block = {
            "schema_version": SCHEMA_VERSION,
            "state": "AVAILABLE",
            "reason_code": None,
            "scope_locator": ENGINE_SCOPE_LOCATOR,
            "report_locator": ENGINE_REPORT_LOCATOR,
            "return_sample": return_sample,
            "metrics": metrics,
            "rolling_sharpe_63": engine_rolling_sharpe(scoped),
            "rolling_beta_63": beta,
            "monthly_leading": monthly_leading_boundary(
                result.equity.reindex(market.index), oos_start_utc_ms=oos_start_utc_ms,
            ),
        }
    # `"oos_analytics":` plus a separating comma.
    overhead = len('"oos_analytics":') + 1
    if receipt_bytes + overhead + _encoded_size(block) > byte_budget and block["rolling_sharpe_63"]["points"]:
        rolling = block["rolling_sharpe_63"]
        block["rolling_sharpe_63"] = {
            **rolling, "state": "NOT_PUBLISHED", "reason_code": "P13_RECEIPT_BYTE_BUDGET_EXHAUSTED",
            "emitted_point_count": 0, "sampling": None, "points": [],
        }
    if receipt_bytes + overhead + _encoded_size(block) > byte_budget:
        raise ValueError("P13 OOS analytics exceed the child receipt byte budget")
    return block
