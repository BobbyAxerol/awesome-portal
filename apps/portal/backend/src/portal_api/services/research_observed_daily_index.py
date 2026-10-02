"""Bounded VN source-date presence, not an exchange calendar or execution grant.

Only an explicit operator build reads the approved provider. All summaries and
warmup queries use compressed timestamp metadata; they never load market data.
Source midnight labels remain their exact UTC instants (17:00 the previous day),
not fabricated session-close timestamps. The enclosing index document owns the
dataset/symbol/release-digest binding and its immutable revision.
"""
from __future__ import annotations

import re
from typing import Mapping

import pandas as pd

from portal_api.adapters.market_data import (
    MarketDataQuery, VN_SOURCE_TIMEZONE, VN_STOCK_DAILY_DATASET_ID,
)
from portal_api.domain.errors import DatasetNotFoundError

DAY_MS = 86_400_000
LOCAL_UTC_OFFSET_MS = 7 * 3_600_000
CLOCK_BASIS = "OBSERVED_SOURCE_LOCAL_DATE_V1"
TIMESTAMP_BASIS = "SOURCE_LOCAL_DATE_LABEL_NOT_SESSION_CLOSE"
CLOSED_BAR_POLICY = "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1"
RANGE_BASIS = "INDEXED_OBSERVED_LOCAL_DATE_RANGE_V1"
# The existing timestamp-index budgets, not a wider daily-source exception.
MAX_ROWS = 10_000_000
MAX_RUNS = 50_000
MAX_CHUNKS = 100
MAX_CHUNK_DAYS = 31
MAX_WARMUP_BARS = 100_000
MAX_SAFE_MS = 9_007_199_254_740_991
_SYMBOL = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,31}$")
_DIGEST = re.compile(r"^[0-9a-f]{64}$")
_FIELDS = frozenset({"timeframe", "resolution_ms", "start_utc_ms",
    "end_exclusive_utc_ms", "as_of_utc_ms", "duplicate_bar_count", "runs",
    "clock_basis", "source_timezone"})
_EMPTY_SOURCE_MESSAGE = "No observed VN daily bars in the requested local-date window"


def _error(code: str) -> ValueError:
    # The existing service dispatches here lazily. Keep its typed refusal class
    # without a top-level circular import or a second route/error convention.
    from portal_api.services.enrich_dataset_catalog import DatasetIndexError
    return DatasetIndexError(code)


def _millisecond(value: object) -> bool:
    return type(value) is int and 0 <= value <= MAX_SAFE_MS


def _local_midnight(value: int) -> bool:
    return (value + LOCAL_UTC_OFFSET_MS) % DAY_MS == 0


def _warmup(value: object) -> int:
    if type(value) is not int or not 0 <= value <= MAX_WARMUP_BARS:
        raise _error("DATASET_WINDOW_QUERY_INVALID")
    return value


def _count(first: int, last: int) -> int:
    return (last - first) // DAY_MS + 1


def validate_observed_daily_index(index: object) -> dict:
    """Validate the closed observed-date branch; never reinterpret UTC indexes."""
    rejected = "DATASET_INDEX_DOCUMENT_REJECTED"
    if not isinstance(index, dict) or set(index) != _FIELDS:
        raise _error(rejected)
    if index["timeframe"] != "1d" or index["clock_basis"] != CLOCK_BASIS \
            or index["source_timezone"] != VN_SOURCE_TIMEZONE:
        raise _error(rejected)
    for key in ("resolution_ms", "start_utc_ms", "end_exclusive_utc_ms", "as_of_utc_ms"):
        if not _millisecond(index[key]):
            raise _error(rejected)
    start, end, clock = index["start_utc_ms"], index["end_exclusive_utc_ms"], index["as_of_utc_ms"]
    if index["resolution_ms"] != DAY_MS or start >= end or end > clock \
            or not _local_midnight(start) or not _local_midnight(end) \
            or (end - start) // DAY_MS > MAX_ROWS \
            or (end - start + MAX_CHUNK_DAYS * DAY_MS - 1) // (MAX_CHUNK_DAYS * DAY_MS) > MAX_CHUNKS:
        raise _error(rejected)
    # A duplicate source label fails the source boundary, not an accepted index.
    if type(index["duplicate_bar_count"]) is not int or index["duplicate_bar_count"] != 0:
        raise _error(rejected)
    runs = index["runs"]
    if not isinstance(runs, list) or len(runs) > MAX_RUNS:
        raise _error(rejected)
    previous = start - 2 * DAY_MS
    rows = 0
    for pair in runs:
        if not isinstance(pair, list) or len(pair) != 2 or any(not _millisecond(x) for x in pair):
            raise _error(rejected)
        first, last = pair
        if first < start or last + DAY_MS > end or first > last \
                or not _local_midnight(first) or not _local_midnight(last) \
                or first <= previous + DAY_MS:
            raise _error(rejected)
        rows += _count(first, last)
        if rows > MAX_ROWS:
            raise _error(rejected)
        previous = last
    return index


def _provider_revision(provider) -> str | None:
    runtime = getattr(provider, "_runtime", None)
    if runtime is None:
        return None  # Explicit isolated loader-factory test doubles.
    revision = getattr(runtime, "manifest_digest", None)
    if not isinstance(revision, str) or not _DIGEST.fullmatch(revision):
        raise _error("DATASET_INDEX_SOURCE_REVISION_CHANGED")
    return revision


def _source_timestamps(loaded: object, *, symbol: str, start: int, end: int,
                       expected_revision: str | None) -> list[int]:
    """Read only timestamps, refusing a substituted source or repaired chronology."""
    descriptor = getattr(loaded, "descriptor", None)
    metadata = getattr(loaded, "load_metadata", None)
    if descriptor is None or getattr(descriptor, "dataset_id", None) != VN_STOCK_DAILY_DATASET_ID \
            or getattr(descriptor, "symbol", None) != symbol or getattr(descriptor, "timeframe", None) != "1d" \
            or getattr(descriptor, "venue", None) != "VN" or getattr(descriptor, "source_timezone", None) != VN_SOURCE_TIMEZONE \
            or not isinstance(metadata, Mapping) or metadata.get("daily_timestamp_basis") != TIMESTAMP_BASIS:
        raise _error("DATASET_READER_TIMESTAMP_CONTRACT_REJECTED")
    if expected_revision is not None and metadata.get("manifest_digest") != expected_revision:
        raise _error("DATASET_INDEX_SOURCE_REVISION_CHANGED")
    frame = getattr(loaded, "frame", None)
    if not isinstance(frame, pd.DataFrame) or not isinstance(frame.index, pd.DatetimeIndex):
        raise _error("DATASET_READER_TIMESTAMP_CONTRACT_REJECTED")
    index = frame.index
    if index.tz is None or index.hasnans or not index.is_monotonic_increasing or index.has_duplicates:
        raise _error("DATASET_READER_TIMESTAMP_CONTRACT_REJECTED")
    if len(index) > MAX_CHUNK_DAYS or len(index) > MAX_ROWS:
        raise _error("DATASET_INDEX_RANGE_EXCEEDS_BUDGET")
    local = index.tz_convert(VN_SOURCE_TIMEZONE)
    if not (local == local.normalize()).all():
        raise _error("DATASET_READER_TIMESTAMP_CONTRACT_REJECTED")
    # as_unit avoids interpreting pandas' microsecond index storage as ns.
    values = [int(value) for value in index.tz_convert("UTC").as_unit("ms").asi8]
    if any(not _millisecond(x) or not _local_midnight(x) or x < start or x + DAY_MS > end for x in values):
        raise _error("DATASET_READER_TIMESTAMP_CONTRACT_REJECTED")
    return values


def build_observed_daily_index(provider, *, dataset_id: str, symbol: str, timeframe: str,
                               start_ms: int, end_ms: int, as_of_ms: int) -> dict[str, object]:
    """Explicit sequential <=31-local-date reads, with no resampling or fill.

    The as-of cutoff conservatively excludes the current source-local date.
    This is a date bound only: no actual session-close clock is asserted.
    """
    if dataset_id != VN_STOCK_DAILY_DATASET_ID:
        raise _error("VN_OBSERVED_INDEX_REQUIRES_EXACT_SOURCE_NAMESPACE")
    if not isinstance(timeframe, str) or timeframe.lower() != "1d":
        raise _error("DATASET_INTERVAL_INVALID")
    if not isinstance(symbol, str) or not _SYMBOL.fullmatch(symbol) \
            or any(not _millisecond(x) for x in (start_ms, end_ms, as_of_ms)) or start_ms >= end_ms:
        raise _error("DATASET_INDEX_BOUNDS_INVALID")
    if not _local_midnight(start_ms) or not _local_midnight(end_ms):
        raise _error("DATASET_WINDOW_NOT_BAR_ALIGNED")
    right = ((min(end_ms, as_of_ms) + LOCAL_UTC_OFFSET_MS) // DAY_MS) * DAY_MS - LOCAL_UTC_OFFSET_MS
    if start_ms >= right or (right - start_ms) // DAY_MS > MAX_ROWS:
        raise _error("DATASET_INDEX_RANGE_EXCEEDS_BUDGET")
    chunk_ms = MAX_CHUNK_DAYS * DAY_MS
    if (right - start_ms + chunk_ms - 1) // chunk_ms > MAX_CHUNKS:
        raise _error("DATASET_INDEX_CHUNK_BUDGET")
    revision = _provider_revision(provider)
    runs: list[list[int]] = []
    rows = 0
    cursor = start_ms
    while cursor < right:
        boundary = min(right, cursor + chunk_ms)
        try:
            query = MarketDataQuery(dataset_id=dataset_id, symbol=symbol, timeframe="1d",
                start=pd.Timestamp(cursor, unit="ms", tz="UTC"),
                end_exclusive=pd.Timestamp(boundary, unit="ms", tz="UTC"))
        except (ValueError, OverflowError) as exc:
            raise _error("DATASET_INDEX_BOUNDS_INVALID") from exc
        try:
            loaded = provider.load(query)
        except DatasetNotFoundError as exc:
            # Only the exact installed provider's authoritative empty-window
            # refusal means no observed rows. Auth/I/O/namespace failures do not.
            if str(exc) != _EMPTY_SOURCE_MESSAGE:
                raise
            values: list[int] = []
        else:
            values = _source_timestamps(loaded, symbol=symbol, start=cursor, end=boundary,
                expected_revision=revision)
        if _provider_revision(provider) != revision:
            raise _error("DATASET_INDEX_SOURCE_REVISION_CHANGED")
        rows += len(values)
        if rows > MAX_ROWS:
            raise _error("DATASET_INDEX_RANGE_EXCEEDS_BUDGET")
        for stamp in values:
            if runs and runs[-1][1] + DAY_MS == stamp:
                runs[-1][1] = stamp
            else:
                runs.append([stamp, stamp])
        if len(runs) > MAX_RUNS:
            raise _error("DATASET_INDEX_GAP_BUDGET")
        cursor = boundary
    return validate_observed_daily_index({"timeframe": "1d", "resolution_ms": DAY_MS,
        "start_utc_ms": start_ms, "end_exclusive_utc_ms": right, "as_of_utc_ms": as_of_ms,
        "duplicate_bar_count": 0, "runs": runs, "clock_basis": CLOCK_BASIS,
        "source_timezone": VN_SOURCE_TIMEZONE})


def observed_bar_summary(index: dict) -> dict[str, object]:
    """Complete observed-row counts; session expectations remain unpublished."""
    validate_observed_daily_index(index)
    runs = index["runs"]
    total = sum(_count(first, last) for first, last in runs)
    return {"timeframe": "1d", "resolution_seconds": DAY_MS // 1000,
        "availability": "AVAILABLE" if total else "NOT_PUBLISHED",
        "reason_code": None if total else "HMD_INDEXED_RANGE_HAS_NO_BARS",
        "origin": "PORTAL_DERIVED", "as_of_utc_ms": index["as_of_utc_ms"],
        "first_bar_utc_ms": runs[0][0] if runs else None,
        "last_bar_utc_ms": runs[-1][1] if runs else None,
        "last_closed_bar_end_utc_ms": None, "bar_count": total,
        "expected_bar_count": None, "missing_ratio": None, "gap_count": None,
        "largest_gap_seconds": None, "duplicate_bar_count": 0,
        "coverage_scope": "INDEXED_RANGE", "indexed_start_utc_ms": index["start_utc_ms"],
        "indexed_end_exclusive_utc_ms": index["end_exclusive_utc_ms"],
        "closed_bar_policy": CLOSED_BAR_POLICY, "clock_basis": CLOCK_BASIS,
        "source_timezone": VN_SOURCE_TIMEZONE,
        "calendar_availability": {"state": "NOT_PUBLISHED", "reason_code": "VN_SESSION_CALENDAR_NOT_PUBLISHED"}}


def _ordinal_stamp(runs: list[list[int]], ordinal: int) -> int | None:
    for first, last in runs:
        length = _count(first, last)
        if ordinal < length:
            return first + ordinal * DAY_MS
        ordinal -= length
    return None


def observed_earliest_start_with_warmup(index: dict, warmup_bars: int) -> int | None:
    """First actual bar with N actual predecessors; weekends need no invented bars."""
    validate_observed_daily_index(index)
    return _ordinal_stamp(index["runs"], _warmup(warmup_bars))


def observed_window_metadata(index: dict | None, *, start_ms: int, end_ms: int,
                             warmup_bars: int) -> dict[str, object]:
    """Index-only half-open observations and the exact last-N warmup start.

    The enclosing read path must first validate dataset/symbol/release identity.
    A requested range outside that revision gets no partial count disguised as
    full coverage. An insufficient observed prefix preserves its measured count
    with the existing typed warmup refusal, never a calendar-based estimate.
    """
    needed = _warmup(warmup_bars)
    if any(not _millisecond(x) for x in (start_ms, end_ms)) or start_ms >= end_ms:
        raise _error("DATASET_WINDOW_QUERY_INVALID")
    if not _local_midnight(start_ms) or not _local_midnight(end_ms):
        raise _error("DATASET_WINDOW_NOT_BAR_ALIGNED")
    absent = {"availability": "NOT_PUBLISHED", "reason_code": "HMD_SYMBOL_INTERVAL_NOT_INDEXED",
        "bars": None, "first_bar_utc_ms": None, "last_bar_utc_ms": None,
        "warmup_bars_required": needed, "warmup_bars_available_before_start": None,
        "verified_range": None, "earliest_start_with_warmup_utc_ms": None,
        "warmup_start_utc_ms": None, "clock_basis": CLOCK_BASIS, "source_timezone": VN_SOURCE_TIMEZONE}
    if index is None:
        return absent
    validate_observed_daily_index(index)
    absent.update(verified_range={"start_utc_ms": index["start_utc_ms"],
        "end_exclusive_utc_ms": index["end_exclusive_utc_ms"], "basis": RANGE_BASIS},
        earliest_start_with_warmup_utc_ms=_ordinal_stamp(index["runs"], needed))
    if start_ms < index["start_utc_ms"] or end_ms > index["end_exclusive_utc_ms"]:
        return {**absent, "reason_code": "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE"}
    bars = before = 0
    first = last = None
    for left, right in index["runs"]:
        a, b = max(left, start_ms), min(right, end_ms - DAY_MS)
        if a <= b:
            bars += _count(a, b)
            first = a if first is None else min(first, a)
            last = b if last is None else max(last, b)
        if left < start_ms:
            before += _count(left, min(right, start_ms - DAY_MS))
    enough = before >= needed
    return {**absent, "availability": "AVAILABLE" if enough else "NOT_PUBLISHED",
        "reason_code": None if enough else "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE",
        "bars": bars, "first_bar_utc_ms": first, "last_bar_utc_ms": last,
        "warmup_bars_available_before_start": min(before, needed),
        "warmup_start_utc_ms": _ordinal_stamp(index["runs"], before - needed) if enough and needed else None}
