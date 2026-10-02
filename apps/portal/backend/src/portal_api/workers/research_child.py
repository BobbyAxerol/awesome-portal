"""P06 bounded QuantBT child entry point.

This module is intentionally *not* a generic plugin launcher.  P06 permits
only two server-installed operations: the pinned P04 Delta-RSI qualification
and (W1) the digest-pinned Delta signal-notional advanced WFO profile.  P07
owns imported/user strategy admission.  The parent supervisor starts this
module in a separate PID, mount, user and network namespace and hands it an
allowlisted receipt.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import math
import os
import resource
from decimal import Decimal, localcontext
from pathlib import Path
from typing import Any


_BLOCKED_ENV_PREFIXES = (
    "AWS_",
    "DATABASE_",
    "EXECUTION_",
    "NATS_",
    "PORTAL_",
    "REDIS_",
)

_P04_DELTA_PARAMS: dict[str, float | int] = {
    "window": 32,
    "rsi_l": 20,
    "signalLength": 9,
    "len_atr1": 10,
    "len_atr2": 42,
    "rvol": 1.6,
    "len_vol": 16,
    "slpercent": 1.3,
}
# The progress ingress has a hard 28 KiB evidence-document limit.  Point count
# alone is not a byte bound (long decimal strings and four independent series
# used to overrun it), so the producer reserves headroom for the fixed receipt
# envelope and gives each visual series its own conservative budget.
# These caps are calculated against the Control API's 28 KiB ingress ceiling
# using the contract's *largest legal* decimal strings, not typical floats.
# They leave more than 3 KiB for the fixed source envelope/reason codes.
_MAX_EQUITY_EVIDENCE_POINTS = 32
_MAX_ROLLING_EVIDENCE_POINTS = 16
_MAX_MONTHLY_EVIDENCE_POINTS = 32
_MAX_DISTRIBUTION_BUCKETS = 12
# E16-R1: an overview, not a replay tape. Twelve extrema-preserving OHLC
# buckets leave the existing 24-KiB source-receipt budget intact.
_MAX_P04_CANDLE_OVERVIEW_BUCKETS = 12
_MAX_EVIDENCE_RECEIPT_BYTES = 24 * 1024
_MAX_CANDLE_OVERVIEW_BUCKETS = 48
_MIN_CANDLE_OVERVIEW_BUCKETS = 8
_ALLOWED_TASKS = frozenset({
    "P04_DELTA_SMOKE", "P10_DELTA_WFO", "P16_DELTA_WHATIF_GRID", "P17_IMPORTED_SIGNAL_NOTIONAL"
})

_IMPORTED_FORBIDDEN_NODES = (
    ast.Import, ast.ImportFrom, ast.ClassDef, ast.AsyncFunctionDef, ast.Lambda,
    ast.With, ast.AsyncWith, ast.Try, ast.Raise, ast.Global, ast.Nonlocal,
    ast.Yield, ast.YieldFrom, ast.Await, ast.While, ast.Delete, ast.Attribute,
)
_IMPORTED_SAFE_CALLS = frozenset({"abs", "bool", "enumerate", "float", "int", "len", "max", "min", "range", "round", "sum", "zip"})
_IMPORTED_MAX_AST_NODES = 20_000
_IMPORTED_MAX_AST_DEPTH = 96
_IMPORTED_MAX_WARMUP_BARS = 4_096


def _finite_decimal(value: object, *, label: str) -> Decimal:
    """Accept one finite engine scalar without losing decimal intent."""

    if isinstance(value, bool):
        raise ValueError(f"P13 {label} is not numeric")
    try:
        numeric = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"P13 {label} is not numeric") from exc
    if not math.isfinite(numeric):
        raise ValueError(f"P13 {label} is not finite")
    decimal = value if isinstance(value, Decimal) else Decimal(str(numeric))
    if not decimal.is_finite():
        raise ValueError(f"P13 {label} is not finite")
    return decimal


def _decimal_text(value: object, *, label: str) -> str:
    """Render a finite source number as a non-exponent decimal string.

    The child is the last place QuantBT values exist as Python numerics.  Do
    not let a JSON float cross this boundary: it would give each later reader
    a chance to round differently or serialize an invalid NaN.
    """

    text = format(_finite_decimal(value, label=label), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    text = "0" if text in {"", "-0"} else text
    # The ingress schema's exact-decimal field is deliberately finite.  Fail
    # in the isolated child before journalling rather than produce a receipt
    # that can only fail late at the Portal callback.
    if len(text) > 96:
        raise ValueError(f"P13 {label} exceeds exact-decimal transport bound")
    return text


def _ratio_minus_one(numerator: object, denominator: object, *, label: str) -> Decimal:
    """Return an exact bounded decimal ratio from source scalar text."""

    top = _finite_decimal(numerator, label=label)
    bottom = _finite_decimal(denominator, label=label)
    if bottom <= 0:
        raise ValueError(f"P13 {label} denominator is non-positive")
    # A fixed precision makes non-terminating source ratios deterministic and
    # guarantees their serialized text stays below the exact-decimal bound.
    with localcontext() as context:
        context.prec = 48
        return top / bottom - Decimal(1)


def _utc_ms(value: object, *, label: str) -> int:
    import pandas as pd

    try:
        timestamp = pd.Timestamp(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"P13 {label} timestamp is invalid") from exc
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize("UTC")
    else:
        timestamp = timestamp.tz_convert("UTC")
    milliseconds = int(timestamp.value // 1_000_000)
    if milliseconds < 0:
        raise ValueError(f"P13 {label} timestamp precedes UTC epoch")
    return milliseconds


def _evidence_indices(equity: list[float], *, maximum_points: int) -> list[int]:
    """Return bounded chronological points while preserving extrema.

    The full OOS vector remains in-memory only long enough for source metric
    calculations.  A chart sample is a rendering aid, never the metric input.
    Each interior bucket contributes its min and max point, preserving the
    visually material drawdown/extrema without LTTB's numeric ambiguity.
    """

    count = len(equity)
    if maximum_points < 2:
        raise ValueError("P13 evidence sampling requires room for both endpoints")
    if count <= maximum_points:
        return list(range(count))
    buckets = (maximum_points - 2) // 2
    selected = {0, count - 1}
    for bucket in range(buckets):
        start = 1 + ((count - 2) * bucket) // buckets
        end = 1 + ((count - 2) * (bucket + 1)) // buckets
        if end <= start:
            continue
        window = equity[start:end]
        minimum = min(range(start, end), key=lambda index: equity[index])
        maximum = max(range(start, end), key=lambda index: equity[index])
        selected.add(minimum)
        selected.add(maximum)
    return sorted(selected)


def _return_distribution(values: list[float]) -> dict[str, Any]:
    """Return a bounded deterministic histogram from actual OOS returns."""

    finite = [value for value in values if math.isfinite(value)]
    if not finite:
        return {
            "state": "NOT_APPLICABLE",
            "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_FINITE_RETURN_OBSERVATIONS",
            "buckets": [],
        }
    lower, upper = min(finite), max(finite)
    if math.isclose(lower, upper, rel_tol=0.0, abs_tol=0.0):
        return {
            "state": "NOT_APPLICABLE",
            "reason_code": "P04_RETURN_DISTRIBUTION_ZERO_VARIANCE",
            "buckets": [],
        }
    bucket_count = _MAX_DISTRIBUTION_BUCKETS
    width = (upper - lower) / bucket_count
    counts = [0] * bucket_count
    for value in finite:
        index = min(bucket_count - 1, max(0, int((value - lower) / width)))
        counts[index] += 1
    buckets: list[dict[str, str]] = []
    for index in range(bucket_count):
        lower_bound = lower + width * index
        upper_bound = lower + width * (index + 1)
        # Every finite value must have exactly one home.  The final bucket is
        # upper-inclusive; labelling it upper-exclusive while placing `upper`
        # inside it made a mathematically false immutable receipt.
        buckets.append({
            "lower_inclusive": _decimal_text(lower_bound, label="distribution lower"),
            "upper": _decimal_text(upper_bound, label="distribution upper"),
            "upper_inclusive": "true" if index == bucket_count - 1 else "false",
            "count": str(counts[index]),
        })
    return {
        "state": "AVAILABLE",
        "reason_code": None,
        "buckets": buckets,
    }


def _monthly_returns(oos) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Build calendar returns from the previous calendar close, not first tick.

    A partial first month has no preceding close and is deliberately omitted.
    If a future run spans more than the receipt budget, the retained tail is
    explicitly labelled rather than pretending the chart is complete.
    """

    import pandas as pd

    all_months: list[dict[str, Any]] = []
    prior_close: float | None = None
    omitted_leading = 0
    frame = pd.DataFrame({"equity": oos})
    # Calendar grouping is explicitly UTC.  Source snapshots historically use
    # both tz-aware and naive-as-UTC indices, so normalize the latter rather
    # than relying on pandas' host-local default or raising after compute.
    utc_index = pd.DatetimeIndex(frame.index)
    if utc_index.tz is None:
        utc_index = utc_index.tz_localize("UTC")
    else:
        utc_index = utc_index.tz_convert("UTC")
    utc_periods = utc_index.tz_localize(None).to_period("M")
    for period, values in frame.groupby(utc_periods, sort=True):
        close = float(values["equity"].iloc[-1])
        if not math.isfinite(close) or close <= 0:
            raise ValueError("P13 P04 monthly evidence is invalid")
        if prior_close is None:
            omitted_leading += 1
        else:
            month_start = pd.Timestamp(period.start_time, tz="UTC")
            all_months.append({
                "month_start_utc_ms": _utc_ms(month_start, label="monthly"),
                "return_fraction": _decimal_text(
                    _ratio_minus_one(close, prior_close, label="monthly return"), label="monthly return",
                ),
            })
        prior_close = close
    omitted_transport = max(0, len(all_months) - _MAX_MONTHLY_EVIDENCE_POINTS)
    emitted = all_months[-_MAX_MONTHLY_EVIDENCE_POINTS:]
    return emitted, {
        "source_observation_count": len(oos),
        "emitted_point_count": len(emitted),
        "total_period_count": len(all_months),
        "omitted_leading_period_count": omitted_leading,
        "omitted_transport_period_count": omitted_transport,
        "sampling": "FULL" if omitted_transport == 0 else "TAIL_WINDOW_V1",
    }


def _rolling_returns(oos, equity: list[float]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return a receipt-bounded sample of true 20-observation rolling facts."""

    full = [{
        "at_utc_ms": _utc_ms(oos.index[index], label="rolling"),
        "return_fraction": _decimal_text(
            _ratio_minus_one(equity[index], equity[index - 20], label="rolling return"), label="rolling return",
        ),
    } for index in range(20, len(equity))]
    if not full:
        return [], {
            "source_observation_count": 0,
            "emitted_point_count": 0,
            "sampling": "NOT_APPLICABLE",
            "window_observations": 20,
        }
    selected = _evidence_indices(
        [float(item["return_fraction"]) for item in full],
        maximum_points=_MAX_ROLLING_EVIDENCE_POINTS,
    )
    emitted = [full[index] for index in selected]
    return emitted, {
        "source_observation_count": len(full),
        "emitted_point_count": len(emitted),
        "sampling": "FULL" if len(emitted) == len(full) else "EXTREMA_BUCKET_V1",
        "window_observations": 20,
    }


def _p04_candle_overview(*, market, positions, oos_start_utc_ms: int) -> dict[str, Any]:
    """Retain a bounded OHLC overview from the exact child tape.

    This is deliberately not a per-bar replay series. Each bucket preserves
    its first open, last close, true maximum high and true minimum low.
    """

    import pandas as pd

    start = pd.Timestamp(oos_start_utc_ms, unit="ms", tz="UTC")
    oos = market.loc[market.index >= start]
    if oos.empty:
        raise ValueError("P17 P04 market overview has no OOS bars")
    required = ("open", "high", "low", "close")
    if any(name not in oos.columns for name in required):
        raise ValueError("P17 P04 market overview requires OHLC columns")
    if hasattr(positions, "columns"):
        position_column = next(
            (column for column in positions.columns if column.endswith("DEFAULT")),
            positions.columns[0],
        )
        position_series = positions[position_column]
    else:
        position_series = positions
    aligned_positions = position_series.reindex(market.index).loc[oos.index]
    if aligned_positions.isna().any():
        raise ValueError("P17 P04 market overview position chronology is incomplete")

    bucket_bars = max(1, math.ceil(len(oos) / _MAX_P04_CANDLE_OVERVIEW_BUCKETS))
    values: list[dict[str, Any]] = []
    maximum: tuple[Decimal, int] | None = None
    minimum: tuple[Decimal, int] | None = None
    previous_position: Decimal | None = None
    for first in range(0, len(oos), bucket_bars):
        frame = oos.iloc[first : first + bucket_bars]
        bucket_positions = aligned_positions.iloc[first : first + bucket_bars]
        highs = [_finite_decimal(value, label="candle high") for value in frame["high"].to_list()]
        lows = [_finite_decimal(value, label="candle low") for value in frame["low"].to_list()]
        high = max(highs)
        low = min(lows)
        high_at = _utc_ms(frame.index[highs.index(high)], label="candle high")
        low_at = _utc_ms(frame.index[lows.index(low)], label="candle low")
        if maximum is None or high > maximum[0]:
            maximum = (high, high_at)
        if minimum is None or low < minimum[0]:
            minimum = (low, low_at)
        transitions = 0
        for raw_position in bucket_positions.to_list():
            position = _finite_decimal(raw_position, label="position")
            if previous_position is not None and position != previous_position:
                transitions += 1
            previous_position = position
        volumes = frame["volume"].to_list() if "volume" in frame.columns else None
        volume = None if volumes is None else _decimal_text(
            sum((_finite_decimal(item, label="candle volume") for item in volumes), Decimal("0")),
            label="candle volume",
        )
        values.append({
            "first_ordinal": first,
            "last_ordinal": first + len(frame) - 1,
            "open_utc_ms": _utc_ms(frame.index[0], label="candle open"),
            "close_utc_ms": _utc_ms(frame.index[-1], label="candle close"),
            "open": _decimal_text(frame.iloc[0]["open"], label="candle open"),
            "high": _decimal_text(high, label="candle high"),
            "low": _decimal_text(low, label="candle low"),
            "close": _decimal_text(frame.iloc[-1]["close"], label="candle close"),
            "volume": volume,
            "transitions": transitions,
        })
    assert maximum is not None and minimum is not None
    return {
        "source_bar_count": len(oos),
        "emitted_bucket_count": len(values),
        "bucket_bars": bucket_bars,
        "sampling": "FULL" if bucket_bars == 1 else "OHLC_BUCKET_V1",
        "envelope": {
            "max_high": _decimal_text(maximum[0], label="max high"),
            "max_high_at_utc_ms": maximum[1],
            "min_low": _decimal_text(minimum[0], label="min low"),
            "min_low_at_utc_ms": minimum[1],
        },
        "values": values,
    }


def _candle_overview_absence(reason_code: str) -> dict[str, Any]:
    """The one absent shape; every field an available overview fills is null."""

    return {
        "state": "NOT_PUBLISHED",
        "reason_code": reason_code,
        "scope": "OOS_EQUITY_WINDOW",
        "source_bar_count": None,
        "emitted_bucket_count": 0,
        "bucket_bars": None,
        "sampling": None,
        "envelope": None,
        "values": [],
    }


def _candle_overview_buckets(frame, *, bucket_bars: int, has_volume: bool) -> dict[str, Any]:
    """Bucket the OOS bars, keeping each bucket's true high and low.

    A bucket's high is the maximum ``high`` and its low the minimum ``low`` of
    the bars it covers; its open is the first bar's open and its close the
    last bar's close.  Nothing is interpolated and nothing is averaged, so a
    downsample can never hide the window's price range -- the run envelope
    below is exactly the maximum/minimum of these true bucket extremes.
    """

    import pandas as pd

    # Bulk UTC conversion: `_utc_ms` builds one Timestamp per call, which a
    # per-bar loop over a multi-thousand-bar window would pay for twice over.
    utc_index = pd.DatetimeIndex(frame.index)
    utc_index = utc_index.tz_localize("UTC") if utc_index.tz is None else utc_index.tz_convert("UTC")
    timestamps = [int(value) // 1_000_000 for value in utc_index.asi8]
    if any(value < 0 for value in timestamps):
        raise ValueError("P13 candle overview timestamp precedes UTC epoch")
    opens = [float(value) for value in frame["open"].to_list()]
    highs = [float(value) for value in frame["high"].to_list()]
    lows = [float(value) for value in frame["low"].to_list()]
    closes = [float(value) for value in frame["close"].to_list()]
    volumes = [float(value) for value in frame["volume"].to_list()] if has_volume else None
    count = len(timestamps)
    values: list[dict[str, Any]] = []
    envelope_high: tuple[float, int] | None = None
    envelope_low: tuple[float, int] | None = None
    for start in range(0, count, bucket_bars):
        end = min(count, start + bucket_bars)
        span = range(start, end)
        high_index = max(span, key=lambda index: highs[index])
        low_index = min(span, key=lambda index: lows[index])
        high, low = highs[high_index], lows[low_index]
        # A tape whose own bar breaks OHLC would make a bucket the contract
        # must refuse, and that refusal would reject the whole evidence
        # receipt -- equity series included.  Fail here instead, so the
        # caller turns one bad tape into one typed absence.
        if (
            not math.isfinite(high) or not math.isfinite(low) or high < low
            or high < max(opens[start], closes[end - 1]) or low > min(opens[start], closes[end - 1])
        ):
            raise ValueError("P13 candle overview bucket range is invalid")
        if envelope_high is None or high > envelope_high[0]:
            envelope_high = (high, timestamps[high_index])
        if envelope_low is None or low < envelope_low[0]:
            envelope_low = (low, timestamps[low_index])
        bucket_volume: str | None = None
        if volumes is not None:
            window = volumes[start:end]
            if all(math.isfinite(value) for value in window):
                bucket_volume = _decimal_text(sum(window), label="bucket volume")
        values.append({
            "first_ordinal": start,
            "last_ordinal": end - 1,
            "open_utc_ms": timestamps[start],
            "close_utc_ms": timestamps[end - 1],
            "open": _decimal_text(opens[start], label="bucket open"),
            "high": _decimal_text(high, label="bucket high"),
            "low": _decimal_text(low, label="bucket low"),
            "close": _decimal_text(closes[end - 1], label="bucket close"),
            "volume": bucket_volume,
            # P04 publishes no execution ledger through this adapter, so a
            # per-bucket transition count would be invented.  The key stays
            # in the retained lane's shape and carries an explicit null.
            "transitions": None,
        })
    assert envelope_high is not None and envelope_low is not None  # count >= 1
    return {
        "state": "AVAILABLE",
        "reason_code": None,
        "scope": "OOS_EQUITY_WINDOW",
        "source_bar_count": count,
        "emitted_bucket_count": len(values),
        "bucket_bars": bucket_bars,
        "sampling": "FULL" if bucket_bars == 1 else "OHLC_BUCKET_V1",
        "envelope": {
            "max_high": _decimal_text(envelope_high[0], label="max high"),
            "max_high_at_utc_ms": envelope_high[1],
            "min_low": _decimal_text(envelope_low[0], label="min low"),
            "min_low_at_utc_ms": envelope_low[1],
        },
        "values": values,
    }


def _candle_overview(market, index, *, receipt_bytes: int, byte_budget: int) -> dict[str, Any]:
    """E16-R1 · retain a bounded OHLC overview while the child still holds the tape.

    The P10 producer deletes the derived tape before the artifact bundle is
    written (``research_run_producer._execute`` / ``finally: shutil.rmtree``),
    and the bundle keeps only two JSON documents.  This child is therefore the
    last place the run's OHLC exists; an overview not summarised here can
    never be recovered from the run's own artifacts, and nothing about the
    tape itself is retained -- this is a summary, not a second price store.

    The window is exactly the OOS equity window the replay replays, so a
    bucket ordinal and an OOS observation ordinal count the same bars.
    """

    required = ("open", "high", "low", "close")
    if any(column not in market.columns for column in required):
        return _candle_overview_absence("P04_TAPE_DID_NOT_PUBLISH_OHLC_COLUMNS")
    frame = market.loc[index, [*required, "volume"] if "volume" in market.columns else list(required)]
    count = len(frame.index)
    if count < 1:
        return _candle_overview_absence("P04_OOS_WINDOW_HAS_NO_PRICED_BAR")
    has_volume = "volume" in frame.columns
    # `"candle_overview":` plus the separating comma, so the fit is measured
    # against the receipt this block will actually be embedded in.
    overhead = len('"candle_overview":,')
    ladder: list[int] = []
    maximum = _MAX_CANDLE_OVERVIEW_BUCKETS
    while maximum > _MIN_CANDLE_OVERVIEW_BUCKETS:
        ladder.append(maximum)
        maximum //= 2
    ladder.append(_MIN_CANDLE_OVERVIEW_BUCKETS)
    for maximum in ladder:
        bucket_bars = max(1, math.ceil(count / maximum))
        block = _candle_overview_buckets(frame, bucket_bars=bucket_bars, has_volume=has_volume)
        encoded = len(json.dumps(block, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))
        if receipt_bytes + overhead + encoded <= byte_budget:
            return block
    return _candle_overview_absence("P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET")


def _fit_evidence_display(receipt: dict[str, Any], *, byte_budget: int, reserve_bytes: int) -> None:
    """Fit only declared display samples; all source metrics/digests stay exact.

    V1 and additive v2 facts share the original 24-KiB passport. Sampling
    each block independently does not bound their sum. Keep endpoints and
    extrema of the already extrema-preserving samples, updating coverage;
    never discard a metric, change a source count, or increase the budget.
    """
    def size() -> int:
        return len(json.dumps(receipt, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))

    metadata = receipt["source"]["series_metadata"]
    for maximum in (16, 8, 4):
        if size() + reserve_bytes <= byte_budget:
            return
        points = receipt["equity_points"]
        if len(points) > maximum:
            selected = _evidence_indices([float(row["equity"]) for row in points], maximum_points=maximum)
            receipt["equity_points"] = [points[index] for index in selected]
            receipt["source"]["emitted_equity_points"] = len(selected)
            receipt["source"]["chart_sampling"] = "EXTREMA_BUCKET_V1"
            metadata["equity_oos"].update(emitted_point_count=len(selected), sampling="EXTREMA_BUCKET_V1")
        rolling = receipt["derived"]["rolling_returns_20_observations"]
        if len(rolling) > maximum:
            selected = _evidence_indices([float(row["return_fraction"]) for row in rolling], maximum_points=maximum)
            receipt["derived"]["rolling_returns_20_observations"] = [rolling[index] for index in selected]
            metadata["rolling_returns_20"].update(emitted_point_count=len(selected), sampling="EXTREMA_BUCKET_V1")
        # Additive v2 curves share the legacy core budget too. Coarsen only
        # display points; source counts, scalar facts and source digests stay.
        v2 = receipt["summary_analytics_v2"]
        for curve in (v2["strategy_curve"], v2["benchmark_curve"], v2["last_30d"]["points"]):
            if len(curve) > maximum:
                selected = _evidence_indices([float(row["value"]) for row in curve], maximum_points=maximum)
                curve[:] = [curve[index] for index in selected]
        is_curve = receipt["summary_analytics"]["in_sample_equity"]
        if len(is_curve["points"]) > maximum:
            selected = _evidence_indices([float(row["equity"]) for row in is_curve["points"]], maximum_points=maximum)
            is_curve["points"] = [is_curve["points"][index] for index in selected]
            is_curve.update(emitted_point_count=len(selected), sampling="EXTREMA_BUCKET_V1")
    if size() + reserve_bytes > byte_budget:
        raise ValueError("P13 mandatory evidence facts exceed the child byte budget")


def _p13_evidence_source(
    *,
    market,
    result,
    report: dict[str, Any],
    oos_start_utc_ms: int,
    execution_adapter_id: str = "p04.delta-rsi.v1",
    is_start_utc_ms: int | None = None,
    run_id: str | None = None,
    source_windows: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the bounded evidence passport from the actual QuantBT result.

    It excludes raw OHLCV/source rows, fills, benchmark and funding. E16 adds
    only a bounded, extrema-preserving market overview; it is not a per-bar
    replay source and cannot be used to infer execution ordering.
    """

    import pandas as pd

    # Keep the engine adapter inside the isolated child entry point.  P13
    # evidence needs only its pinned version string; importing it here avoids
    # widening module import side effects for journal-only helpers while still
    # making the child receipt self-contained.
    from portal_api.adapters.quantbt import QuantBTGateway

    start = pd.Timestamp(oos_start_utc_ms, unit="ms", tz="UTC")
    equity_series = result.equity.reindex(market.index).astype(float)
    mask = equity_series.index >= start
    oos = equity_series.loc[mask].dropna()
    if oos.empty:
        raise ValueError("P13 P04 result did not publish any OOS equity observations")
    if not oos.index.is_monotonic_increasing or oos.index.has_duplicates:
        raise ValueError("P13 P04 OOS equity index is not a strict chronological series")

    equity = [float(value) for value in oos.to_list()]
    if any(not math.isfinite(value) or value <= 0 for value in equity):
        raise ValueError("P13 P04 OOS equity contains a non-finite or non-positive value")
    maximum = -math.inf
    drawdowns: list[Decimal] = []
    source_hash = hashlib.sha256()
    for timestamp, value in zip(oos.index, equity, strict=True):
        maximum = max(maximum, value)
        drawdown = _ratio_minus_one(value, maximum, label="drawdown")
        drawdowns.append(drawdown)
        source_hash.update(f"{_utc_ms(timestamp, label='OOS')}|{_decimal_text(value, label='equity')}\n".encode("utf-8"))

    selected = _evidence_indices(equity, maximum_points=_MAX_EQUITY_EVIDENCE_POINTS)
    points = [{
        "at_utc_ms": _utc_ms(oos.index[index], label="OOS"),
        "equity": _decimal_text(equity[index], label="equity"),
        "drawdown_fraction": _decimal_text(drawdowns[index], label="drawdown"),
    } for index in selected]

    months, monthly_metadata = _monthly_returns(oos)
    rolling, rolling_metadata = _rolling_returns(oos, equity)
    returns_series = result.returns.reindex(market.index).loc[mask].dropna().astype(float)
    distribution = _return_distribution([float(value) for value in returns_series.to_list()])

    initial = equity[0]
    final = float(report["final_equity"])
    if not math.isfinite(final) or final <= 0:
        raise ValueError("P13 P04 engine final equity is invalid")
    if not math.isclose(final, equity[-1], rel_tol=1e-9, abs_tol=1e-7):
        raise ValueError("P13 P04 engine final equity does not reconcile to the OOS series")
    receipt = {
        "schema_version": "research.p13.evidence-source.v1",
        "source": {
            "execution_adapter_id": execution_adapter_id,
            "engine_version": QuantBTGateway().version(),
            "input_scope": "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
            "oos_observation_count": len(equity),
            "emitted_equity_points": len(points),
            "chart_sampling": "FULL" if len(points) == len(equity) else "EXTREMA_BUCKET_V1",
            "source_transform_digest": source_hash.hexdigest(),
            # V1 receipts remain readable.  This marker selects the corrected
            # P13R2 immutable projection and prevents corrected series from
            # being confused with a historical P13R1 receipt.
            "evidence_transform_revision": "P13_SOURCE_R2",
            # Endpoint values reconcile to the OOS equity series.  Engine
            # counters, by contrast, cover the full confined child input
            # (optional warmup + IS + OOS).  Do not collapse these distinct
            # populations into a misleading one-word scope.
            "direct_metric_scopes": {
                "initial_equity": "OOS_EQUITY_SERIES",
                "final_equity": "OOS_EQUITY_SERIES",
                "num_trades": "FULL_CHILD_TAPE",
                "bars": "FULL_CHILD_TAPE",
            },
            "series_metadata": {
                "equity_oos": {
                    "source_observation_count": len(equity),
                    "emitted_point_count": len(points),
                    "sampling": "FULL" if len(points) == len(equity) else "EXTREMA_BUCKET_V1",
                },
                "monthly_returns": monthly_metadata,
                "rolling_returns_20": rolling_metadata,
                "return_distribution": {
                    "source_observation_count": len(returns_series),
                    "emitted_point_count": len(distribution["buckets"]),
                    "sampling": "FULL_RETURN_HISTOGRAM_V2",
                },
            },
        },
        "direct": {
            "initial_equity": _decimal_text(initial, label="initial equity"),
            "final_equity": _decimal_text(final, label="final equity"),
            "num_trades": str(int(report["num_trades"])),
            "bars": str(int(len(market))),
        },
        "derived": {
        "net_return_fraction": _decimal_text(
            _ratio_minus_one(final, initial, label="net return"), label="net return",
        ),
            "max_drawdown_fraction": _decimal_text(min(drawdowns), label="max drawdown"),
            "monthly_returns": months,
            "rolling_returns_20_observations": rolling,
            "return_distribution": distribution,
        },
        "equity_points": points,
        "unavailable": {
            "benchmark": {"state": "NOT_PUBLISHED", "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK"},
            "funding": {"state": "NOT_PUBLISHED", "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_FUNDING"},
            "audited_fills": {"state": "NOT_PUBLISHED", "reason_code": "P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS"},
            "per_fold_metrics": {"state": "NOT_APPLICABLE", "reason_code": "P04_SINGLE_WINDOW_HAS_NO_PER_FOLD_METRICS"},
        },
    }
    from portal_api.services.research_retained_analytics import retained_analytics
    receipt["summary_analytics"] = retained_analytics(
        result=result, mode="FIXED", is_start_utc_ms=is_start_utc_ms,
        oos_start_utc_ms=oos_start_utc_ms,
    )
    from portal_api.services.research_portal_analytics import portal_analytics_v2
    close_digest = hashlib.sha256(market["close"].to_numpy(dtype="<f8").tobytes()).hexdigest()
    receipt["summary_analytics_v2"] = portal_analytics_v2(
        result=result, mode="FIXED", market_close=market["close"],
        benchmark_locator=f"P08.verified_tape:{close_digest}:close:OOS",
        is_start_utc_ms=is_start_utc_ms, oos_start_utc_ms=oos_start_utc_ms,
    )
    # RF-05 CG-P13-03/04/06: additive engine OOS analytics (services/research_evidence_metrics.py).
    # An analytics failure is a typed absence, never a failed child run.
    from portal_api.services import research_evidence_metrics as analytics
    from quantbt.errors import QuantBTEngineError
    # Reserve truthful absence envelopes before fitting display points. The
    # optional analytics may consume remaining space, but must leave room
    # for the final candle block even when no overview fits.
    absent_analytics = analytics.not_published_block()
    absent_candles = _candle_overview_absence("P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET")
    def block_bytes(key: str, value: object) -> int:
        return len(json.dumps({key: value}, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))
    candle_reserve = block_bytes("candle_overview", absent_candles)
    # Additive distribution facts must not starve an already available candle
    # overview. Reserve its smallest truthful bucket before fitting display
    # samples; never widen the receipt budget or change source metrics.
    try:
        minimum_overview = _candle_overview_buckets(market.reindex(oos.index),
            bucket_bars=max(1, math.ceil(len(oos) / _MIN_CANDLE_OVERVIEW_BUCKETS)),
            has_volume="volume" in market.columns)
        candle_reserve = max(candle_reserve, block_bytes("candle_overview", minimum_overview))
    except (KeyError, ValueError):
        pass  # The final bounded producer retains the existing typed refusal.
    _fit_evidence_display(receipt, byte_budget=_MAX_EVIDENCE_RECEIPT_BYTES,
                          reserve_bytes=block_bytes("oos_analytics", absent_analytics) + candle_reserve)
    try:
        receipt["oos_analytics"] = analytics.oos_analytics(result=result, market=market, oos_start_utc_ms=oos_start_utc_ms, byte_budget=_MAX_EVIDENCE_RECEIPT_BYTES - candle_reserve, receipt_bytes=len(json.dumps(receipt, separators=(",", ":"), ensure_ascii=True).encode("utf-8")))
    except (ValueError, QuantBTEngineError):
        receipt["oos_analytics"] = absent_analytics
    # E16-R1: last, so it measures itself against the finished receipt and
    # never pushes an existing series out of the budget.  An overview failure
    # is a typed absence, never a failed child run.
    try:
        receipt["candle_overview"] = _candle_overview(
            market,
            oos.index,
            receipt_bytes=len(json.dumps(receipt, separators=(",", ":"), ensure_ascii=True).encode("utf-8")),
            byte_budget=_MAX_EVIDENCE_RECEIPT_BYTES,
        )
    except (KeyError, ValueError):
        receipt["candle_overview"] = _candle_overview_absence("P13_CANDLE_OVERVIEW_SOURCE_BARS_ARE_UNREADABLE")
    encoded = json.dumps(receipt, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    if len(encoded) > _MAX_EVIDENCE_RECEIPT_BYTES:
        # This runs inside the bounded child before its terminal event is
        # journalled.  It is therefore a deterministic source error rather
        # than a late, unrecoverable sidecar-storage failure.
        raise ValueError("P13 evidence receipt exceeds the child byte budget")
    if run_id is not None:
        from portal_api.services.research_enrich_analysis import enrich_analysis, digest_rows
        from portal_api.services.research_evidence_metrics import decimal_text
        raw_rows = [{"at_utc_ms": _utc_ms(at, label="OOS"), "equity": decimal_text(value),
            "return_fraction": decimal_text(result.returns.loc[at]),
            "position": [decimal_text(v) for v in result.positions.loc[at]],
            "close": decimal_text(market.loc[at, "close"])} for at, value in oos.items()]
        receipt["enriched_analysis"] = enrich_analysis(run_id=run_id, result=result, mode="FIXED", market_close=market["close"],
            benchmark_locator=receipt["summary_analytics_v2"]["benchmark_locator"],
            is_start_utc_ms=is_start_utc_ms, oos_start_utc_ms=oos_start_utc_ms,
            source_tables=[{"name": "OBSERVATION", "row_count": len(raw_rows), "digest": digest_rows(raw_rows)}],
            analytics=receipt["summary_analytics_v2"], source_windows=source_windows)
    return receipt


def _safe_path(value: str, *, label: str) -> Path:
    path = Path(value).resolve(strict=True)
    if not path.is_file() or path.suffix != ".parquet":
        raise ValueError(f"{label} must name an existing Parquet file")
    return path


def _safe_imported_source_path(value: str) -> Path:
    unresolved = Path(value)
    if unresolved.is_symlink():
        raise ValueError("source_path must not be a symlink")
    path = unresolved.resolve(strict=True)
    if not path.is_file() or path.suffix != ".py":
        raise ValueError("source_path must name an existing Python source file")
    return path


def _assert_clean_environment() -> None:
    leaked = sorted(
        name for name in os.environ
        if name.startswith(_BLOCKED_ENV_PREFIXES)
    )
    if leaked:
        raise RuntimeError(f"blocked scheduler environment keys reached the child: {', '.join(leaked)}")


def _network_namespace() -> str:
    return os.readlink("/proc/self/ns/net")


def _enforced_limits() -> dict[str, int]:
    """Return only the caps imposed by the allowlisted parent supervisor."""

    scratch = os.statvfs(os.environ["TMPDIR"])
    return {
        "address_space_bytes": int(resource.getrlimit(resource.RLIMIT_AS)[0]),
        "cpu_seconds": int(resource.getrlimit(resource.RLIMIT_CPU)[0]),
        "file_bytes": int(resource.getrlimit(resource.RLIMIT_FSIZE)[0]),
        "fd_limit": int(resource.getrlimit(resource.RLIMIT_NOFILE)[0]),
        "nproc_limit": int(resource.getrlimit(resource.RLIMIT_NPROC)[0]),
        "scratch_bytes": int(scratch.f_frsize * scratch.f_blocks),
    }


def _capture_fixed_replay_source(*, receipt: dict[str, Any], receipt_dir: Path | None,
                                 market: Any, result: Any, output: dict[str, Any]) -> None:
    # Legacy scalar callers have no declared full OOS source or work directory.
    # They must not acquire a complete-observation claim from old samples.
    windows = receipt.get("source_windows")
    if receipt_dir is None or not isinstance(windows, dict) or not isinstance(windows.get("oos"), dict):
        return
    from portal_api.services.research_fixed_replay import capture_fixed_replay

    oos = windows["oos"]
    if oos.get("start_ms") != receipt.get("oos_start_utc_ms"):
        raise ValueError("fixed replay declared OOS boundary disagrees with child receipt")
    output["fixed_replay_source"] = capture_fixed_replay(
        result=result, market=market, output_directory=receipt_dir,
        oos_start_utc_ms=oos["start_ms"], oos_end_exclusive_utc_ms=oos["end_ms"],
    )


def _run_p04_delta_smoke(receipt: dict[str, Any], *, receipt_dir: Path | None = None) -> dict[str, Any]:
    """Run the pinned real P04 Delta calculation over an approved tape.

    The output is intentionally a tiny scalar receipt.  P05 owns artifact
    reservation/sealing; this child neither knows nor receives PostgreSQL,
    NATS, Execution, broker or CLI credentials.
    """

    import pandas as pd

    from portal_api.adapters.quantbt import QuantBTGateway
    from strategy.delta_rsi import generate_signals

    parameters = receipt.get("p04_parameters", _P04_DELTA_PARAMS)
    if not isinstance(parameters, dict) or set(parameters) != set(_P04_DELTA_PARAMS):
        raise ValueError("P04 child receipt has an invalid parameter map")
    for name, expected in _P04_DELTA_PARAMS.items():
        value = parameters.get(name)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != expected:
            raise ValueError("P04 child receipt parameter map does not match installed profile")
    market_path = _safe_path(str(receipt["market_path"]), label="market_path")
    market = pd.read_parquet(market_path)
    signal = generate_signals(market, dict(parameters))["pos_weight"]
    endpoint = QuantBTGateway().signal_notional_endpoint(
        initial_capital=20_000,
        leverage=3,
        alloc_per_trade=2_000,
        fee_rate=0.0005,
        use_funding=False,
    )
    result = endpoint.backtest(data=market, signal=signal)
    report = result.full_report()
    output = {
        "task": "P04_DELTA_SMOKE",
        "engine_version": QuantBTGateway().version(),
        "bars": int(len(market)),
        "final_equity": float(report["final_equity"]),
        "num_trades": int(report["num_trades"]),
    }
    oos_start_utc_ms = receipt.get("oos_start_utc_ms")
    # Older P06 test receipts are intentionally still executable; P13 only
    # receives an evidence document when P10 supplied the immutable boundary.
    if isinstance(oos_start_utc_ms, int) and not isinstance(oos_start_utc_ms, bool) and oos_start_utc_ms >= 0:
        output["evidence_source"] = _p13_evidence_source(
            market=market,
            result=result,
            report=report,
            oos_start_utc_ms=oos_start_utc_ms,
            is_start_utc_ms=receipt.get("is_start_utc_ms"),
            run_id=receipt.get("run_id"),
            source_windows=receipt.get("source_windows"),
        )
    _capture_fixed_replay_source(receipt=receipt, receipt_dir=receipt_dir, market=market, result=result, output=output)
    return output


def _load_imported_entrypoint(source_text: str, *, expected_entrypoint: str) -> tuple[Any, dict[str, Any]]:
    """Compile one structurally restricted function with no ambient authority."""

    try:
        tree = ast.parse(source_text, filename="<imported-alpha>", mode="exec")
    except SyntaxError as exc:
        raise ValueError("E17 imported Alpha source is not valid Python") from exc
    stack: list[tuple[ast.AST, int]] = [(tree, 1)]
    count = 0
    while stack:
        node, depth = stack.pop()
        count += 1
        if count > _IMPORTED_MAX_AST_NODES or depth > _IMPORTED_MAX_AST_DEPTH:
            raise ValueError("E17 imported Alpha AST exceeds its bound")
        if isinstance(node, _IMPORTED_FORBIDDEN_NODES):
            raise ValueError(f"E17 imported Alpha uses forbidden syntax: {type(node).__name__}")
        if isinstance(node, ast.Name) and (node.id.startswith("__") or node.id in {"open", "eval", "exec", "compile", "globals", "locals", "getattr", "setattr", "delattr", "vars", "dir", "input", "breakpoint", "memoryview"}):
            raise ValueError("E17 imported Alpha references a forbidden name")
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in _IMPORTED_SAFE_CALLS:
                raise ValueError("E17 imported Alpha may call only the bounded safe builtin set")
        stack.extend((child, depth + 1) for child in ast.iter_child_nodes(node))
    body = [node for node in tree.body if not (isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant) and isinstance(node.value.value, str))]
    if len(body) != 2:
        raise ValueError("E17 imported Alpha must contain one literal contract and one function")
    assignment = next((node for node in body if isinstance(node, ast.Assign)), None)
    function = next((node for node in body if isinstance(node, ast.FunctionDef)), None)
    if (
        assignment is None or len(assignment.targets) != 1 or not isinstance(assignment.targets[0], ast.Name)
        or assignment.targets[0].id != "ALPHA_CONTRACT" or function is None or function.name != expected_entrypoint
        or len(function.args.args) != 1 or function.args.defaults or function.args.vararg or function.args.kwarg
    ):
        raise ValueError("E17 imported Alpha definition does not match its immutable entrypoint")
    try:
        contract = ast.literal_eval(assignment.value)
    except (ValueError, TypeError, MemoryError, RecursionError) as exc:
        raise ValueError("E17 imported Alpha contract is not literal") from exc
    if not isinstance(contract, dict) or contract.get("schema_version") != "research.alpha-source.v1" or contract.get("entrypoint") != expected_entrypoint:
        raise ValueError("E17 imported Alpha contract does not match the admitted source identity")
    warmup = contract.get("warmup_bars")
    required = contract.get("required_columns")
    if (
        isinstance(warmup, bool) or not isinstance(warmup, int) or not 0 <= warmup <= _IMPORTED_MAX_WARMUP_BARS
        or not isinstance(required, list) or not required
        or any(column not in {"open", "high", "low", "close", "volume"} for column in required)
    ):
        raise ValueError("E17 imported Alpha data contract exceeds the execution profile")
    safe_builtins = {name: getattr(__builtins__, name) for name in _IMPORTED_SAFE_CALLS} if not isinstance(__builtins__, dict) else {
        name: __builtins__[name] for name in _IMPORTED_SAFE_CALLS
    }
    namespace: dict[str, Any] = {"__builtins__": safe_builtins}
    module = ast.fix_missing_locations(ast.Module(body=[assignment, function], type_ignores=[]))
    exec(compile(module, "<imported-alpha>", "exec"), namespace, namespace)  # noqa: S102
    entrypoint = namespace.get(expected_entrypoint)
    if not callable(entrypoint):
        raise ValueError("E17 imported Alpha entrypoint did not load")
    return entrypoint, contract


def _run_p17_imported_signal_notional(receipt: dict[str, Any], *, receipt_dir: Path | None = None) -> dict[str, Any]:
    """Execute one exact P07 source against past-only bounded bar contexts."""

    import pandas as pd

    from portal_api.adapters.quantbt import QuantBTGateway
    from portal_api.domain.research_imported_alpha_profile import (
        IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
        IMPORTED_ALPHA_ADAPTER_ID,
        IMPORTED_ALPHA_MAX_SIGNAL_POINTS,
        IMPORTED_ALPHA_MAX_SOURCE_BYTES,
        IMPORTED_ALPHA_PROFILE_DIGEST,
        IMPORTED_ALPHA_PROFILE_ID,
    )

    if (
        receipt.get("execution_adapter_id") != IMPORTED_ALPHA_ADAPTER_ID
        or receipt.get("adapter_contract_digest") != IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST
        or receipt.get("execution_profile_id") != IMPORTED_ALPHA_PROFILE_ID
        or receipt.get("execution_profile_digest") != IMPORTED_ALPHA_PROFILE_DIGEST
    ):
        raise ValueError("E17 child receipt does not name the installed profile")
    market_path = _safe_path(str(receipt["market_path"]), label="market_path")
    source_path = _safe_imported_source_path(str(receipt["source_path"]))
    source_bytes = source_path.read_bytes()
    source_digest = receipt.get("source_digest")
    if (
        not isinstance(source_digest, str) or len(source_digest) != 64
        or not 1 <= len(source_bytes) <= IMPORTED_ALPHA_MAX_SOURCE_BYTES
        or hashlib.sha256(source_bytes).hexdigest() != source_digest
    ):
        raise ValueError("E17 imported source bytes do not match the immutable digest")
    try:
        source_text = source_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("E17 imported source is not UTF-8") from exc
    entrypoint_name = receipt.get("entrypoint")
    if not isinstance(entrypoint_name, str):
        raise ValueError("E17 imported source has no entrypoint")
    entrypoint, contract = _load_imported_entrypoint(source_text, expected_entrypoint=entrypoint_name)
    parameters = receipt.get("parameters")
    if not isinstance(parameters, dict) or len(parameters) > 12:
        raise ValueError("E17 imported parameters are invalid")
    market = pd.read_parquet(market_path)
    if not 2 <= len(market) <= IMPORTED_ALPHA_MAX_SIGNAL_POINTS:
        raise ValueError("E17 market input exceeds the signal profile bound")
    required = list(contract["required_columns"])
    if any(column not in market.columns for column in required):
        raise ValueError("E17 market input omits a declared required column")
    warmup = int(contract["warmup_bars"])
    seed = receipt.get("random_seed")
    signals: list[float] = []
    for index, (timestamp, row) in enumerate(market.iterrows()):
        if index < warmup:
            signals.append(0.0)
            continue
        start = max(0, index - warmup)
        context = {
            "schema_version": "research.imported-alpha-context.v1",
            "timestamp_utc_ms": _utc_ms(timestamp, label="imported bar"),
            "bar_index": index,
            "history": {
                column: tuple(float(value) for value in market[column].iloc[start:index + 1].tolist())
                for column in required
            },
            "parameters": dict(parameters),
            "random_seed": seed,
        }
        output = entrypoint(context)
        if (
            not isinstance(output, dict)
            or output.get("schema_version") != "research.imported-signal-notional-output.v1"
            or set(output) != {"schema_version", "signal_notional"}
        ):
            raise ValueError("E17 imported Alpha returned an invalid output contract")
        value = output.get("signal_notional")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)) or abs(float(value)) > 1e12:
            raise ValueError("E17 imported Alpha returned an invalid signal notional")
        signals.append(float(value))
    signal = pd.Series(signals, index=market.index, dtype="float64")
    endpoint = QuantBTGateway().signal_notional_endpoint(
        initial_capital=20_000,
        leverage=3,
        alloc_per_trade=2_000,
        fee_rate=0.0005,
        use_funding=False,
    )
    result = endpoint.backtest(data=market, signal=signal)
    report = result.full_report()
    output: dict[str, Any] = {
        "task": "P17_IMPORTED_SIGNAL_NOTIONAL",
        "engine_version": QuantBTGateway().version(),
        "bars": int(len(market)),
        "final_equity": float(report["final_equity"]),
        "num_trades": int(report["num_trades"]),
        "source_digest": source_digest,
        "execution_profile_digest": IMPORTED_ALPHA_PROFILE_DIGEST,
    }
    oos_start_utc_ms = receipt.get("oos_start_utc_ms")
    if isinstance(oos_start_utc_ms, int) and not isinstance(oos_start_utc_ms, bool) and oos_start_utc_ms >= 0:
        output["evidence_source"] = _p13_evidence_source(
            market=market,
            result=result,
            report=report,
            oos_start_utc_ms=oos_start_utc_ms,
            execution_adapter_id=IMPORTED_ALPHA_ADAPTER_ID,
            is_start_utc_ms=receipt.get("is_start_utc_ms"),
            run_id=receipt.get("run_id"),
            source_windows=receipt.get("source_windows"),
        )
    _capture_fixed_replay_source(receipt=receipt, receipt_dir=receipt_dir, market=market, result=result, output=output)
    return output


def _wfo_output_root(receipt: dict[str, Any], receipt_dir: Path | None) -> Path:
    """Accept only the supervisor-created empty ``output`` sibling directory.

    It is on the real scratch filesystem (not this child's tmpfs) so the
    parent can read it after the mount namespace is gone.  Anything else --
    another path, a symlink, a pre-populated directory -- is refused.
    """

    if receipt_dir is None:
        raise ValueError("P10 WFO child requires its receipt directory")
    raw = receipt.get("output_root")
    if not isinstance(raw, str) or not raw:
        raise ValueError("P10 WFO child receipt has no output_root")
    expected = (receipt_dir / "output").resolve(strict=True)
    candidate = Path(raw)
    if candidate.is_symlink():
        raise ValueError("P10 WFO output_root must not be a symlink")
    resolved = candidate.resolve(strict=True)
    if resolved != expected or not resolved.is_dir():
        raise ValueError("P10 WFO output_root escapes the expected sibling output directory")
    tmpdir = os.environ.get("TMPDIR")
    if tmpdir and resolved.is_relative_to(Path(tmpdir).resolve()):
        raise ValueError("P10 WFO output_root must not be the child tmpfs")
    if any(resolved.iterdir()):
        raise ValueError("P10 WFO output_root must start empty")
    return resolved


class _ChildProgressWriter:
    """CG-P06-02: the child's bounded live progress channel.

    One append-only NDJSON file beside ``result.json``; exclusive create and
    no-follow, so it cannot be redirected. Each record is one Optuna trial as
    the engine saw it plus this process's own CPU seconds. It never carries a
    parameter value, market row, path or credential, and it stops silently at
    its record/line budget: it is an observation, not a result.
    """

    def __init__(self, path: Path, *, cumulative_trials: bool = False) -> None:
        from portal_api.services.research_supervisor import (
            CHILD_PROGRESS_MAX_LINE_BYTES,
            CHILD_PROGRESS_MAX_RECORDS,
            CHILD_PROGRESS_SCHEMA,
        )

        self._schema = CHILD_PROGRESS_SCHEMA
        self._max_records = CHILD_PROGRESS_MAX_RECORDS
        self._max_line = CHILD_PROGRESS_MAX_LINE_BYTES
        self._descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_APPEND, 0o600)
        self._sequence = 0
        self._cumulative_trials = cumulative_trials
        self._study_id: str | None = None

    def trial(self, study: Any, frozen_trial: Any) -> None:
        if self._sequence >= self._max_records:
            return
        state_name = getattr(getattr(frozen_trial, "state", None), "name", None)
        state = {"COMPLETE": "COMPLETE", "PRUNED": "PRUNED", "FAIL": "FAILED"}.get(state_name)
        number = getattr(frozen_trial, "number", None)
        if state is None or not isinstance(number, int) or isinstance(number, bool) or number < 0:
            return

        def decimal_or_none(value: object) -> str | None:
            try:
                return _decimal_text(value, label="trial objective")
            except (TypeError, ValueError):
                return None  # a pruned/-inf/NaN objective is not a number

        objective = decimal_or_none(getattr(frozen_trial, "value", None)) if state == "COMPLETE" else None
        try:
            best = decimal_or_none(study.best_value)
        except (ValueError, RuntimeError):
            best = None  # Optuna raises until one trial completes
        usage = resource.getrusage(resource.RUSAGE_SELF)
        record = {
            "schema_version": self._schema,
            "sequence": self._sequence + 1,
            "kind": "trial",
            "trial": self._sequence + 1 if self._cumulative_trials else number + 1,
            "state": state,
            "objective": objective,
            "best_objective": best,
            "cpu_seconds": round(usage.ru_utime + usage.ru_stime, 3),
        }
        if self._cumulative_trials:
            if self._study_id is None:
                return  # No source study identity: retained rows reconcile later.
            record.update(study_id=self._study_id, source_trial_id=str(number))
        line = (json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
        if len(line) > self._max_line:
            return
        os.write(self._descriptor, line)
        self._sequence += 1

    def close(self) -> None:
        os.close(self._descriptor)


def _observe_optuna_trials(writer: _ChildProgressWriter) -> Any:
    """Observe each finished trial through QuantBT's own study callback.

    ``quantbt.walkforward`` passes its module-level ``logging_callback`` to
    ``study.optimize`` at call time. Wrapping that one name lets the child
    see every finished trial without changing what the engine computes; the
    wrapper calls the original first and never lets an observation error
    reach the study. Returns the restore function. If the engine build has
    no such callback the channel stays silent and the retained trial table
    alone closes the study.
    """

    import quantbt.walkforward as walkforward

    original = getattr(walkforward, "logging_callback", None)
    if not callable(original):
        return lambda: None

    def observed(study: Any, frozen_trial: Any) -> None:
        original(study, frozen_trial)
        try:
            writer.trial(study, frozen_trial)
        except Exception:  # noqa: BLE001 - observation must never alter the study
            pass

    walkforward.logging_callback = observed
    original_optimize = walkforward.WalkForwardEngine.optimize_params
    if writer._cumulative_trials:
        # Observe the engine's actual public study_id argument. Compact Optuna
        # trial attrs omit it; callback order is not a source identity.
        import inspect
        signature = inspect.signature(original_optimize)

        def observed_optimize(*args: Any, **kwargs: Any) -> Any:
            arguments = signature.bind(*args, **kwargs)
            arguments.apply_defaults()
            source_study = arguments.arguments["study_id"]
            previous = writer._study_id
            writer._study_id = str(source_study) if type(source_study) is int and source_study >= 0 else None
            try:
                return original_optimize(*args, **kwargs)
            finally:
                writer._study_id = previous

        walkforward.WalkForwardEngine.optimize_params = observed_optimize

    def restore() -> None:
        walkforward.logging_callback = original
        if writer._cumulative_trials:
            walkforward.WalkForwardEngine.optimize_params = original_optimize

    return restore


def _utc_ms_field(receipt: dict[str, Any], name: str) -> int:
    value = receipt.get(name)
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"P10 WFO child receipt {name} is invalid")
    return value


def _run_p10_delta_wfo(receipt: dict[str, Any], output_root: Path) -> dict[str, Any]:
    """Run the W1 §1.1 profile through the Portal advanced WFO runner.

    Every WFO knob comes from the digest-verified profile; the receipt only
    carries the admitted span, first OOS boundary and dataset labels.
    """

    from portal_api.domain.research_delta_wfo_profile import (
        DELTA_WFO_PREVIEW_LONG_MAX_TRIALS,
        DELTA_WFO_PREVIEW_LONG_MIN_TRIALS,
        DELTA_WFO_PROFILE,
        DELTA_WFO_PROFILE_DIGEST,
        DELTA_WFO_PROFILE_ID,
        delta_wfo_profile_digest,
    )

    from portal_api.domain.research_delta_wfo_v2_profile import DELTA_WFO_V2_PROFILE_ID, DELTA_WFO_V2_PROFILE_DIGEST, temporal_controls
    from portal_api.domain.research_delta_causal_inner_profile import DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_DIGEST, causal_inner_controls
    temporal = receipt.get("execution_profile_id") == DELTA_WFO_V2_PROFILE_ID
    causal = receipt.get("execution_profile_id") == DELTA_CAUSAL_INNER_PROFILE_ID
    controls = None
    if causal:
        if receipt.get("execution_profile_digest") != DELTA_CAUSAL_INNER_PROFILE_DIGEST or "optuna_trials" in receipt or "temporal_controls" in receipt:
            raise ValueError("causal inner child requires its exact bounded profile, without preview overrides")
        raw = receipt.get("causal_inner_controls")
        if not isinstance(raw, dict) or set(raw) != {"split_frequency", "window_mode", "train_window", "label_horizon_bars", "purge_bars", "embargo_bars", "inner_split_frequency", "inner_window_mode", "inner_train_window", "inner_min_folds"}:
            raise ValueError("causal inner child requires exactly its bounded controls")
        controls = causal_inner_controls({"schema_version": "research.requested-spec.v2", "optimization_mode": "mode_1_decay", "optimization_schedule": "per_fold_causal", "walk_forward": {
            "frequency": raw["split_frequency"], "window_mode": raw["window_mode"], "train_window": raw["train_window"],
            **{key: raw[key] for key in ("label_horizon_bars", "purge_bars", "embargo_bars")},
            "inner": {"split_frequency": raw["inner_split_frequency"], "window_mode": raw["inner_window_mode"], "train_window": raw["inner_train_window"], "min_folds": raw["inner_min_folds"]}}})
    elif receipt.get("causal_inner_controls") is not None:
        raise ValueError("causal controls cannot enter another child profile")
    elif temporal:
        if receipt.get("execution_profile_digest") != DELTA_WFO_V2_PROFILE_DIGEST:
            raise ValueError("P10 temporal child profile digest does not match its installed profile")
        raw = receipt.get("temporal_controls")
        if not isinstance(raw, dict) or set(raw) != {"split_frequency", "window_mode", "train_window", "label_horizon_bars", "purge_bars", "embargo_bars"}:
            raise ValueError("P10 temporal child requires exactly its bounded controls")
        controls = temporal_controls({"schema_version": "research.requested-spec.v2", "optimization_mode": "mode_1_decay", "optimization_schedule": "global",
            "walk_forward": {"frequency": raw["split_frequency"], **{k: v for k, v in raw.items() if k != "split_frequency"}}})
    elif receipt.get("execution_profile_id") != DELTA_WFO_PROFILE_ID:
        raise ValueError("P10 WFO child receipt names an uninstalled execution profile")
    if not temporal and not causal and (
        receipt.get("execution_profile_digest") != DELTA_WFO_PROFILE_DIGEST
        or delta_wfo_profile_digest(DELTA_WFO_PROFILE) != DELTA_WFO_PROFILE_DIGEST
    ):
        raise ValueError("P10 WFO child profile digest does not match the installed profile")
    optuna_trials = int(DELTA_WFO_PROFILE["optuna_trials"])
    if "optuna_trials" in receipt:
        # Research preview only: the parent adds this key solely when its
        # PORTAL_ENV=local preview flag admitted a long study (the child's
        # clean environment cannot see that flag itself).
        requested = receipt["optuna_trials"]
        if (
            isinstance(requested, bool) or not isinstance(requested, int)
            or not DELTA_WFO_PREVIEW_LONG_MIN_TRIALS <= requested <= DELTA_WFO_PREVIEW_LONG_MAX_TRIALS
        ):
            raise ValueError("P10 WFO child preview trial count is outside its admitted bound")
        optuna_trials = requested
    return _run_delta_wfo_study(receipt, output_root, optuna_trials=optuna_trials,
        temporal_controls=controls, profile_digest=DELTA_CAUSAL_INNER_PROFILE_DIGEST if causal else DELTA_WFO_V2_PROFILE_DIGEST if temporal else DELTA_WFO_PROFILE_DIGEST,
        causal_inner=causal)


def _run_delta_wfo_study(receipt: dict[str, Any], output_root: Path, *, optuna_trials: int,
        temporal_controls: dict[str, Any] | None = None, profile_digest: str | None = None, causal_inner: bool = False) -> dict[str, Any]:
    """The locked W1 Delta WFO study, with a caller-verified trial count.

    Both the WFO profile (3 sampled trials) and the P16 what-if profile
    (1..81 enqueued trials) run this exact request: same data, same folds,
    same mode_1_decay/global objective, same seed. The caller has already
    verified its own pinned profile digest.
    """

    import pandas as pd

    from portal_api.adapters.market_data import DatasetDescriptor, prepare_market_data
    from portal_api.adapters.quantbt import QuantBTGateway
    from portal_api.domain.enums import OptimizationMode, OptimizationSchedule
    from portal_api.domain.requests import (
        AccountConfig,
        AdvancedWalkForwardConfig,
        ExecutionConfig,
        OptimizationConfig,
        ParameterSpaceConfig,
        ParameterSpec,
        PortalRunRequest,
    )
    from portal_api.domain.research_delta_wfo_profile import DELTA_WFO_PROFILE, DELTA_WFO_PROFILE_DIGEST
    from portal_api.repositories.artifacts import ArtifactRepository
    from portal_api.services.advanced_walkforward_runner import AdvancedWalkForwardRunner
    from strategy.specification import DELTA_RSI_SPECIFICATION

    # 81 is the what-if grid's own bound; 400 the research-preview long WFO.
    if isinstance(optuna_trials, bool) or not 1 <= optuna_trials <= 400:
        raise ValueError("P10 WFO study trial count is outside its admitted bound")
    raw_pins = receipt.get("pinned_parameters") or {}
    if not isinstance(raw_pins, dict) or not set(raw_pins) <= {"rvol", "slpercent"}:
        raise ValueError("P10 WFO child pins only the what-if axes")
    pins: dict[str, float] = {}
    for name, value in raw_pins.items():
        low, high, _step = DELTA_RSI_SPECIFICATION.parameter_space[name]
        if not isinstance(value, str):
            raise ValueError("P10 WFO pins are exact decimal text")
        pins[name] = float(Decimal(value))
        if not low <= pins[name] <= high:
            raise ValueError("P10 WFO pin leaves its declared range")
    if causal_inner:
        from portal_api.domain.research_delta_causal_inner_profile import DELTA_CAUSAL_INNER_PROFILE
    profile = DELTA_CAUSAL_INNER_PROFILE if causal_inner else DELTA_WFO_PROFILE
    if causal_inner and optuna_trials != 3:
        raise ValueError("causal inner execution runs exactly 3 trials per outer study")
    run_id = receipt.get("run_id")
    dataset_id = receipt.get("dataset_id")
    symbol = receipt.get("symbol")
    if not all(isinstance(value, str) and value for value in (run_id, dataset_id, symbol)):
        raise ValueError("P10 WFO child receipt identity is invalid")
    start_ms = _utc_ms_field(receipt, "data_start_utc_ms")
    end_ms = _utc_ms_field(receipt, "data_end_exclusive_utc_ms")
    split_ms = _utc_ms_field(receipt, "first_oos_utc_ms")
    if not start_ms < split_ms < end_ms:
        raise ValueError("P10 WFO child span is invalid")

    market_path = _safe_path(str(receipt["market_path"]), label="market_path")
    market = prepare_market_data(
        pd.read_parquet(market_path),
        DatasetDescriptor(dataset_id=dataset_id, symbol=symbol, venue="BINANCE", timeframe=profile["timeframe"]),
    )
    start = pd.Timestamp(start_ms, unit="ms", tz="UTC")
    end = pd.Timestamp(end_ms, unit="ms", tz="UTC")
    split = pd.Timestamp(split_ms, unit="ms", tz="UTC")
    temporal = temporal_controls or {}
    if causal_inner:
        plan = QuantBTGateway().walk_forward_fold_plan(index=market.frame.index[(market.frame.index >= start) & (market.frame.index < end)], config_fields={
            **temporal, "split_mode": split.isoformat(), "optimization_mode": "mode_1_decay", "optimization_schedule": "per_fold_causal", "optuna_trials": 3})
        if not 2 <= len(plan) <= 16 or any(not 2 <= len(fold["inner"] or []) <= 16 for fold in plan):
            raise ValueError("causal inner plan exceeds its 2..16 outer/inner fold bounds")
    request = PortalRunRequest(
        strategy_id="delta-rsi-polynomial-alpha",
        dataset_id=dataset_id,
        symbol=symbol,
        timeframe=profile["timeframe"],
        protocol="advanced_walk_forward",
        parameter_space=ParameterSpaceConfig({
            # W5a: a what-if sibling pins its two axes; everything else is searched.
            key: ParameterSpec(kind="fixed", value=pins[key]) if key in pins else ParameterSpec(
                kind="float_range" if isinstance(low, float) else "int_range",
                low=low,
                high=high,
                step=step,
            )
            for key, (low, high, step) in DELTA_RSI_SPECIFICATION.parameter_space.items()
        }),
        # The same account as the installed P04 Delta qualification child.
        account=AccountConfig(
            initial_capital=20_000,
            leverage=3,
            alloc_per_trade=2_000,
            canonical_one_way_fee_rate=0.0005,
            funding_enabled=False,
        ),
        execution=ExecutionConfig(target_mode=profile["execution_route"]),
        calibration=AdvancedWalkForwardConfig(
            data_start=start.to_pydatetime(),
            data_end_exclusive=end.to_pydatetime(),
            split_mode=split.isoformat(),
            split_frequency=temporal.get("split_frequency", "weekly"),
            window_mode=temporal.get("window_mode", "expanding"),
            **({k: v for k, v in temporal.items() if k not in {"split_frequency", "window_mode"}}),
            optimization_mode=OptimizationMode(profile["optimization_mode"]),
            optimization_schedule=OptimizationSchedule(profile["optimization_schedule"]),
            fold_boundary_position_policy="carry",
            optuna_trials=optuna_trials,
            optuna_early_stopping=None,
            random_seed=profile["random_seed"],
            optimization=OptimizationConfig(min_trades_per_year=50.0, trade_penalty_factor=0.5),
        ),
    )
    from portal_api.services.research_supervisor import CHILD_PROGRESS_FILENAME

    writer = _ChildProgressWriter(output_root.parent / CHILD_PROGRESS_FILENAME, cumulative_trials=causal_inner)
    restore = _observe_optuna_trials(writer)
    try:
        summary = AdvancedWalkForwardRunner(
            gateway=QuantBTGateway(),
            artifacts=ArtifactRepository(output_root),
        ).run(request, market, run_id, target_mode=profile["execution_route"])
    finally:
        restore()
        writer.close()
    n_folds = int(summary.get("n_folds") or 0)
    bounds = profile["fold_bounds"]
    if not bounds["min"] <= n_folds <= bounds["max"]:
        raise ValueError(f"P10 WFO produced {n_folds} folds outside the admitted {bounds['min']}..{bounds['max']}")
    trials_path = output_root / run_id / "wfo" / "trials.parquet"
    trial_rows = len(pd.read_parquet(trials_path)) if trials_path.is_file() else 0
    if trial_rows != optuna_trials * (n_folds if causal_inner else 1):
        raise ValueError("P10 WFO did not publish exactly the admitted trial count")
    if causal_inner:
        trials = pd.read_parquet(trials_path)
        if "study_id" not in trials or len(trials.groupby("study_id")) != n_folds or not trials.groupby("study_id").size().eq(3).all():
            raise ValueError("causal inner source did not publish exactly 3 trials for every outer study")
    return {
        "task": "P10_DELTA_WFO",
        "engine_version": QuantBTGateway().version(),
        "bars": int(len(market.frame)),
        "n_folds": n_folds,
        "trial_rows": trial_rows,
        "execution_profile_digest": profile_digest or DELTA_WFO_PROFILE_DIGEST,
        # CG-P11-09: this process's own high-water RSS (Linux reports KiB).
        "peak_rss_bytes": int(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss) * 1024,
    }


def _engine_value(value: str, *, kind: type) -> int | float:
    """An exact decimal parameter as the declared engine type (int or float)."""

    exact = Decimal(value)
    if kind is int:
        if exact != exact.to_integral_value():
            raise ValueError("an integer parameter received a fractional what-if value")
        return int(exact)
    return float(exact)


def _parameter_identity(parameters: dict[str, Any]) -> tuple[tuple[str, str], ...]:
    """Canonical exact text for a parameter map (floats through their shortest repr)."""

    def text(value: Any) -> str:
        exact = Decimal(str(value)) if not isinstance(value, Decimal) else value
        normalized = exact.normalize()
        rendered = format(normalized, "f")
        return "0" if rendered in {"-0", "0"} else rendered

    return tuple(sorted((name, text(value)) for name, value in parameters.items()))


def _run_p16_delta_whatif(receipt: dict[str, Any], output_root: Path) -> dict[str, Any]:
    """W5a A10c: evaluate 1..81 exact configurations with QuantBT's own objective.

    The request is the parent WFO run's (same data span, same folds, same
    mode_1_decay/global objective, same seed). Each admitted configuration is
    enqueued as a fixed Optuna trial, so every value is scored by QuantBT's
    ``evaluate_params_is`` exactly as the parent's own trials were — the
    child adds no scorer and no interpolation. The results are one bounded
    ``whatif_results.json`` beside the engine output.
    """

    import optuna
    import pandas as pd

    from portal_api.domain.research_whatif_profile import (
        WHATIF_MAX_EVALUATIONS,
        WHATIF_PROFILE,
        WHATIF_PROFILE_DIGEST,
        WHATIF_PROFILE_ID,
        whatif_profile_digest,
    )
    from strategy.specification import DELTA_RSI_SPECIFICATION

    if receipt.get("execution_profile_id") != WHATIF_PROFILE_ID:
        raise ValueError("P16 what-if child receipt names an uninstalled execution profile")
    if (
        receipt.get("execution_profile_digest") != WHATIF_PROFILE_DIGEST
        or whatif_profile_digest(WHATIF_PROFILE) != WHATIF_PROFILE_DIGEST
    ):
        raise ValueError("P16 what-if child profile digest does not match the installed profile")
    grid_key = receipt.get("whatif_grid_key")
    evaluations = receipt.get("whatif_evaluations")
    if not isinstance(grid_key, str) or len(grid_key) != 64:
        raise ValueError("P16 what-if child receipt carries no grid key")
    if not isinstance(evaluations, list) or not 1 <= len(evaluations) <= WHATIF_MAX_EVALUATIONS:
        raise ValueError("P16 what-if child receipt must carry 1..81 evaluations")
    declared = DELTA_RSI_SPECIFICATION.parameter_space
    enqueued: list[tuple[str, dict[str, int | float]]] = []
    seen: set[str] = set()
    for entry in evaluations:
        if not isinstance(entry, dict):
            raise ValueError("P16 what-if evaluation is invalid")
        key = entry.get("evaluation_key")
        parameters = entry.get("parameters")
        if not isinstance(key, str) or len(key) != 64 or key in seen or not isinstance(parameters, dict):
            raise ValueError("P16 what-if evaluation identity is invalid")
        if set(parameters) != set(declared):
            raise ValueError("P16 what-if evaluation must name every declared Delta parameter")
        typed: dict[str, int | float] = {}
        for name, value in parameters.items():
            low, high, _step = declared[name]
            if not isinstance(value, str):
                raise ValueError("P16 what-if parameter values are exact decimal text")
            typed[name] = _engine_value(value, kind=int if isinstance(low, int) and isinstance(high, int) else float)
            if not low <= typed[name] <= high:
                raise ValueError("P16 what-if evaluation leaves its declared range")
        seen.add(key)
        enqueued.append((key, typed))

    original_create_study = optuna.create_study

    def create_study(*args: Any, **kwargs: Any) -> Any:
        # QuantBT creates its own study; the admitted configurations are
        # enqueued first so each trial evaluates exactly one of them.
        study = original_create_study(*args, **kwargs)
        for _key, parameters in enqueued:
            study.enqueue_trial(dict(parameters), skip_if_exists=False)
        return study

    optuna.create_study = create_study
    try:
        summary = _run_delta_wfo_study(receipt, output_root, optuna_trials=len(enqueued))
    finally:
        optuna.create_study = original_create_study

    run_id = str(receipt["run_id"])
    trials = pd.read_parquet(output_root / run_id / "wfo" / "trials.parquet")
    by_identity: dict[tuple[tuple[str, str], ...], dict[str, Any]] = {}
    for record in trials.to_dict(orient="records"):
        by_identity.setdefault(_parameter_identity(json.loads(record["params_json"])), record)
    results: list[dict[str, Any]] = []
    for key, parameters in enqueued:
        record = by_identity.get(_parameter_identity(parameters))
        if record is None:
            raise ValueError("P16 what-if engine did not evaluate an admitted configuration")
        objective = record.get("objective")
        defined = (
            not bool(record.get("pruned"))
            and isinstance(objective, (int, float))
            and not isinstance(objective, bool)
            and math.isfinite(float(objective))
        )
        results.append({
            "evaluation_key": key,
            "trial_id": str(int(record["trial_id"])),
            "state": "COMPLETE" if defined else "PRUNED",
            "objective": _decimal_text(objective, label="what-if objective") if defined else None,
        })
    document = {"schema_version": "research.whatif-results.v1", "grid_key": grid_key, "results": results}
    (output_root / run_id / "whatif_results.json").write_text(
        json.dumps(document, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    return {
        **summary,
        "task": "P16_DELTA_WHATIF_GRID",
        "execution_profile_digest": WHATIF_PROFILE_DIGEST,
        "whatif_results": len(results),
    }


def execute_receipt(receipt: dict[str, Any], *, receipt_dir: Path | None = None) -> dict[str, Any]:
    _assert_clean_environment()
    if receipt.get("schema_version") != "research.p06.child-receipt.v1":
        raise ValueError("unsupported child receipt schema")
    task = receipt.get("task")
    if task not in _ALLOWED_TASKS:
        raise ValueError("P06 child task is not allowlisted")
    if task == "P10_DELTA_WFO":
        result = _run_p10_delta_wfo(receipt, _wfo_output_root(receipt, receipt_dir))
    elif task == "P16_DELTA_WHATIF_GRID":
        result = _run_p16_delta_whatif(receipt, _wfo_output_root(receipt, receipt_dir))
    elif task == "P17_IMPORTED_SIGNAL_NOTIONAL":
        result = _run_p17_imported_signal_notional(receipt, receipt_dir=receipt_dir)
    else:
        result = _run_p04_delta_smoke(receipt, receipt_dir=receipt_dir)
    result.update(
        {
            "child_pid": os.getpid(),
            "network_namespace": _network_namespace(),
            "credential_environment_clean": True,
            "enforced_limits": _enforced_limits(),
        }
    )
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="P06 isolated QuantBT child")
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--result", required=True)
    arguments = parser.parse_args()
    receipt_path = Path(arguments.receipt).resolve(strict=True)
    result_path = Path(arguments.result).resolve()
    if result_path.parent != receipt_path.parent or result_path.name != "result.json":
        raise ValueError("child result path must be the sibling fixed result.json")
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    result = execute_receipt(receipt, receipt_dir=receipt_path.parent)
    temporary = result_path.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n", encoding="utf-8")
    os.replace(temporary, result_path)
    return 0


if __name__ == "__main__":  # pragma: no cover - spawned child entry point
    raise SystemExit(main())
