"""B7: bounded timestamp index, built explicitly; public reads never load HMD.

The source is the approved MarketDataProvider, including its validation. A bar
is closed by its fixed interval and observation clock, exactly as P08; this is
not a claim that each aggregate has every constituent minute. Ranges and gaps
are index metadata, not candles, session calendars or instrument authority.
"""
from __future__ import annotations

import argparse
import copy
from collections import OrderedDict
import hashlib
import json
import os
import re
import tempfile
from time import monotonic
from datetime import datetime, timezone
from pathlib import Path
from typing import Mapping

import pandas as pd

from portal_api.adapters.market_data import (
    HistoricalMarketDataProvider, MarketDataQuery, VN_STOCK_DAILY_DATASET_ID,
    VnStockDailyQualificationProvider, canonical_fixed_timeframe,
)
from portal_api.domain.errors import DatasetNotFoundError
from portal_api.domain.research_execution_recipes import EXECUTION_MAX_WARMUP_BARS, EXECUTION_PLANNING_MAX_BARS
from portal_api.services.research_dataset_catalog import build_research_dataset_catalog

MAX_BYTES = 8 * 1024 * 1024
MAX_ROWS = 10_000_000
MAX_RUNS = 50_000
MAX_CHUNKS = 100
MAX_SYMBOLS = 256
MAX_TIMEFRAMES = 16
_SYMBOL = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,31}$")
_TF = re.compile(r"^([1-9][0-9]*)(min|m|h|d)$")
_DIGEST = re.compile(r"^[0-9a-f]{64}$")
INSTRUMENT_FIELDS = ("display_name", "underlying", "base", "quote", "settle_currency",
                     "tick_size", "lot_size", "contract_multiplier", "listing_utc_ms", "expiry_utc_ms")


class DatasetIndexError(ValueError):
    pass


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def timeframe_ms(value: str) -> int:
    match = _TF.fullmatch(value.lower())
    if not match:
        raise DatasetIndexError("DATASET_INTERVAL_INVALID")
    result = int(match[1]) * {"min": 60_000, "m": 60_000, "h": 3_600_000, "d": 86_400_000}[match[2]]
    if result > 31 * 86_400_000:
        raise DatasetIndexError("DATASET_INTERVAL_INVALID")
    return result


def _interval_key(row: dict) -> tuple[str, str, int]:
    return row["dataset_id"], row["symbol"], timeframe_ms(row["index"]["timeframe"])


def _indexed_intervals(document: dict | None) -> dict[tuple[str, str, int], dict]:
    """Resolve aliases without changing a historical document or its hash.

    A duration alias never authorizes another dataset/symbol. Contradictory
    alias entries are refused rather than picking the first index silently.
    """
    result: dict[tuple[str, str, int], dict] = {}
    for row in document["entries"] if document else ():
        key = _interval_key(row)
        index = row["index"]
        previous = result.get(key)
        if previous is not None and {k: v for k, v in previous.items() if k != "timeframe"} != {
            k: v for k, v in index.items() if k != "timeframe"
        }:
            raise DatasetIndexError("DATASET_INDEX_INTERVAL_ALIAS_CONFLICT")
        result[key] = index
    return result


def _find_index(document: dict | None, dataset_id: str, symbol: str, timeframe: str) -> dict | None:
    return _indexed_intervals(document).get((dataset_id, symbol, timeframe_ms(timeframe)))


def discover_indexed_timeframes(provider, store: "DatasetIndexStore", *, dataset_id: str,
                               symbols: list[str]) -> dict[str, object]:
    """Bounded explicit operator discovery; never load a market data frame."""
    if not symbols or len(symbols) > MAX_SYMBOLS or any(not _SYMBOL.fullmatch(s) for s in symbols):
        raise DatasetIndexError("DATASET_INDEX_SELECTION_NOT_PUBLISHED")
    catalog = enrich_dataset_catalog(provider, store)
    dataset = next((row for row in catalog["datasets"] if row["dataset_id"] == dataset_id), None)
    if dataset is None:
        raise DatasetIndexError("DATASET_INDEX_SELECTION_NOT_PUBLISHED")
    listed = {row["symbol"]: row for row in dataset["symbols"]["items"]}
    return {"dataset_id": dataset_id, "catalog_revision": catalog["catalog_revision"],
        "source_manifest_digest": source_digest(provider), "as_of_utc_ms": catalog["as_of_utc_ms"],
        "source_timezone": dataset["source_timezone"],
        "clock_basis": "OBSERVED_SOURCE_LOCAL_DATE_V1" if dataset_id == VN_STOCK_DAILY_DATASET_ID
            else "UTC_FIXED_INTERVAL_OPEN_TIME_V1",
        "published_timeframes": dataset["timeframes"],
        "symbols": [{"symbol": symbol,
            "availability": "AVAILABLE" if symbol in listed else "NOT_PUBLISHED",
            "reason_code": None if symbol in listed else "HMD_SYMBOL_NOT_LISTED",
            "coverage_by_timeframe": listed.get(symbol, {}).get("coverage_by_timeframe", [])}
            for symbol in sorted(set(symbols))]}


def index_root() -> Path:
    return Path(os.getenv("PORTAL_ARTIFACT_ROOT", "artifacts/runs")) / "durable-store" / "research-dataset-index"


def build_bar_index(provider, *, dataset_id: str, symbol: str, timeframe: str,
                    start_ms: int, end_ms: int, as_of_ms: int) -> dict[str, object]:
    """Explicit operator only: sequential <=31-day queries, <=10M target bars.

    Use exactly aligned edges. Do not ceil an arbitrary start to imply data was
    available earlier. Actual clock is captured by the operator once per revision.
    """
    if dataset_id == VN_STOCK_DAILY_DATASET_ID:
        from portal_api.services.research_observed_daily_index import build_observed_daily_index
        return build_observed_daily_index(provider, dataset_id=dataset_id, symbol=symbol,
            timeframe=timeframe, start_ms=start_ms, end_ms=end_ms, as_of_ms=as_of_ms)
    step = timeframe_ms(timeframe)
    if not _SYMBOL.fullmatch(symbol) or start_ms < 0 or start_ms >= end_ms or as_of_ms < 0:
        raise DatasetIndexError("DATASET_INDEX_BOUNDS_INVALID")
    left = ((start_ms + step - 1) // step) * step
    right = (min(end_ms, as_of_ms) // step) * step
    if left >= right or (right - left) // step > MAX_ROWS:
        raise DatasetIndexError("DATASET_INDEX_RANGE_EXCEEDS_BUDGET")
    chunk_ms = (31 * 86_400_000 // step) * step
    if (right - left + chunk_ms - 1) // chunk_ms > MAX_CHUNKS:
        raise DatasetIndexError("DATASET_INDEX_CHUNK_BUDGET")
    runs: list[list[int]] = []
    row_count = 0
    duplicates = 0
    cursor = left
    while cursor < right:
        boundary = min(right, cursor + chunk_ms)
        try:
            loaded = provider.load(MarketDataQuery(dataset_id=dataset_id, symbol=symbol,
                timeframe=timeframe, start=pd.Timestamp(cursor, unit="ms", tz="UTC"),
                end_exclusive=pd.Timestamp(boundary, unit="ms", tz="UTC")))
        except DatasetNotFoundError:
            # Source-authoritative empty range, not an auth/I/O/schema fallback.
            values: list[int] = []
        else:
            values = [int(x.value // 1_000_000) for x in loaded.frame.index]
            if len(values) > MAX_ROWS or any(x < cursor or x + step > boundary or x % step for x in values):
                raise DatasetIndexError("DATASET_READER_TIMESTAMP_CONTRACT_REJECTED")
            duplicates += len(values) - len(set(values))
        ordered = sorted(set(values))
        row_count += len(ordered)
        if row_count > MAX_ROWS:
            raise DatasetIndexError("DATASET_INDEX_RANGE_EXCEEDS_BUDGET")
        for stamp in ordered:
            if runs and runs[-1][1] + step == stamp:
                runs[-1][1] = stamp
            else:
                runs.append([stamp, stamp])
        if len(runs) > MAX_RUNS:
            raise DatasetIndexError("DATASET_INDEX_GAP_BUDGET")
        cursor = boundary
    return {"timeframe": timeframe.lower(), "resolution_ms": step, "start_utc_ms": left,
        "end_exclusive_utc_ms": right, "as_of_utc_ms": as_of_ms,
        "duplicate_bar_count": duplicates, "runs": runs}


def bar_summary(index: Mapping[str, object]) -> dict[str, object]:
    if index.get("clock_basis") == "OBSERVED_SOURCE_LOCAL_DATE_V1":
        from portal_api.services.research_observed_daily_index import observed_bar_summary
        return observed_bar_summary(index)
    step = int(index["resolution_ms"])
    runs = index["runs"]
    assert isinstance(runs, list)
    total = sum((last - first) // step + 1 for first, last in runs)
    expected = (runs[-1][1] - runs[0][0]) // step + 1 if runs else 0
    gaps = [(runs[i][0] - runs[i - 1][1]) // step - 1 for i in range(1, len(runs))]
    return {"timeframe": index["timeframe"], "resolution_seconds": step // 1000,
        "availability": "AVAILABLE" if total else "NOT_PUBLISHED",
        "reason_code": None if total else "HMD_INDEXED_RANGE_HAS_NO_BARS",
        "origin": "PORTAL_DERIVED", "as_of_utc_ms": index["as_of_utc_ms"],
        "first_bar_utc_ms": runs[0][0] if runs else None,
        "last_bar_utc_ms": runs[-1][1] if runs else None,
        "last_closed_bar_end_utc_ms": runs[-1][1] + step if runs else None,
        "bar_count": total, "expected_bar_count": expected,
        "missing_ratio": format((expected - total) / expected, ".12f") if expected else None,
        "gap_count": len(gaps), "largest_gap_seconds": max(gaps, default=0) * step // 1000,
        "duplicate_bar_count": index["duplicate_bar_count"],
        "coverage_scope": "INDEXED_RANGE", "indexed_start_utc_ms": index["start_utc_ms"],
        "indexed_end_exclusive_utc_ms": index["end_exclusive_utc_ms"],
        "closed_bar_policy": "INTERVAL_END_AT_OR_BEFORE_AS_OF_V1"}


def build_symbol_indexes(provider, *, dataset_id: str, symbol: str, timeframes: list[str],
                         start_ms: int, end_ms: int, as_of_ms: int) -> list[dict[str, object]]:
    """One bounded 1m reader pass for all fixed Binance intervals.

    The accepted reader bins UTC fixed intervals, drops bins with no OHLC and
    keeps nonempty bins. Derive presence only, never prices or completeness of
    their constituents. Independent target-reader parity is a real-data gate.
    """
    if not _SYMBOL.fullmatch(symbol) or start_ms < 0 or end_ms <= start_ms:
        raise DatasetIndexError("DATASET_INDEX_BOUNDS_INVALID")
    steps = {tf: timeframe_ms(tf) for tf in timeframes}
    if not steps or len(steps) > MAX_TIMEFRAMES or any(DAY_MS % step for step in steps.values()):
        raise DatasetIndexError("DATASET_INTERVAL_INVALID")
    left = ((start_ms + 59_999) // 60_000) * 60_000
    right = min(end_ms, as_of_ms) // 60_000 * 60_000
    if left >= right or (right - left) // 60_000 > MAX_ROWS or (right - left + 31 * DAY_MS - 1) // (31 * DAY_MS) > MAX_CHUNKS:
        raise DatasetIndexError("DATASET_INDEX_RANGE_EXCEEDS_BUDGET")
    indexes = {tf: {"timeframe": tf, "resolution_ms": step,
        "start_utc_ms": (left + step - 1) // step * step, "end_exclusive_utc_ms": right // step * step,
        "as_of_utc_ms": as_of_ms, "duplicate_bar_count": 0, "runs": []} for tf, step in steps.items()
        if (left + step - 1) // step < right // step}
    cursor = left
    while cursor < right:
        # Align normal chunk ends to UTC days: a higher-timeframe bucket never
        # straddles two normal chunks. Only the final chunk can be incomplete.
        boundary = min(right, ((cursor // DAY_MS) + 31) * DAY_MS)
        try:
            loaded = provider.load(MarketDataQuery(dataset_id=dataset_id, symbol=symbol, timeframe="1min",
                start=pd.Timestamp(cursor, unit="ms", tz="UTC"), end_exclusive=pd.Timestamp(boundary, unit="ms", tz="UTC")))
        except DatasetNotFoundError:
            values = []
        else:
            values = [int(x.value // 1_000_000) for x in loaded.frame.index]
            if len(values) > 31 * 1440 or any(x < cursor or x + 60_000 > boundary or x % 60_000 for x in values):
                raise DatasetIndexError("DATASET_READER_TIMESTAMP_CONTRACT_REJECTED")
        for tf, index in indexes.items():
            step = steps[tf]
            bins = sorted(set(x // step * step for x in values))
            runs = index["runs"]
            if step == 60_000:
                index["duplicate_bar_count"] += len(values) - len(set(values))
            for stamp in bins:
                if stamp < index["start_utc_ms"] or stamp + step > index["end_exclusive_utc_ms"]:
                    continue
                if runs and stamp <= runs[-1][1]:
                    continue
                if runs and runs[-1][1] + step == stamp:
                    runs[-1][1] = stamp
                else:
                    runs.append([stamp, stamp])
            if len(runs) > MAX_RUNS:
                raise DatasetIndexError("DATASET_INDEX_GAP_BUDGET")
        cursor = boundary
    return list(indexes.values())


DAY_MS = 86_400_000


def validate_document(value: object) -> dict:
    if not isinstance(value, dict) or set(value) != {"schema_version", "source_manifest_digest", "as_of_utc_ms", "entries"}:
        raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
    if value["schema_version"] not in {"research.dataset-index.v1", "research.dataset-index.v2"} or not _DIGEST.fullmatch(str(value["source_manifest_digest"])):
        raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
    clock = value["as_of_utc_ms"]
    if type(clock) is not int or clock < 0 or not isinstance(value["entries"], list) or len(value["entries"]) > MAX_SYMBOLS * MAX_TIMEFRAMES:
        raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
    keys: set[tuple[str, str, str]] = set()
    for row in value["entries"]:
        if not isinstance(row, dict) or set(row) != {"dataset_id", "symbol", "index"}:
            raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
        if not _SYMBOL.fullmatch(str(row["symbol"])) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,190}", str(row["dataset_id"])):
            raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
        index = row["index"]
        if row["dataset_id"] == VN_STOCK_DAILY_DATASET_ID:
            if value["schema_version"] != "research.dataset-index.v2":
                raise DatasetIndexError("DATASET_INDEX_OBSERVED_DATE_REQUIRES_V2")
            from portal_api.services.research_observed_daily_index import validate_observed_daily_index
            validate_observed_daily_index(index)
            if index["as_of_utc_ms"] != clock:
                raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
            key = (row["dataset_id"], row["symbol"], index["timeframe"])
            if key in keys:
                raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
            keys.add(key)
            continue
        if not isinstance(index, dict) or set(index) != {"timeframe", "resolution_ms", "start_utc_ms", "end_exclusive_utc_ms", "as_of_utc_ms", "duplicate_bar_count", "runs"}:
            raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
        step = timeframe_ms(str(index["timeframe"]))
        for field in ("resolution_ms", "start_utc_ms", "end_exclusive_utc_ms", "as_of_utc_ms", "duplicate_bar_count"):
            if type(index[field]) is not int or index[field] < 0:
                raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
        start, end = index["start_utc_ms"], index["end_exclusive_utc_ms"]
        if index["resolution_ms"] != step or index["as_of_utc_ms"] != clock or start >= end or start % step or end % step or end > clock or (end - start) // step > MAX_ROWS:
            raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
        runs = index["runs"]
        if not isinstance(runs, list) or len(runs) > MAX_RUNS:
            raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
        previous = start - 2 * step
        for pair in runs:
            if not isinstance(pair, list) or len(pair) != 2 or any(type(x) is not int for x in pair):
                raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
            first, last = pair
            if first < start or last + step > end or first > last or first % step or last % step or first <= previous + step:
                raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
            previous = last
        key = (row["dataset_id"], row["symbol"], index["timeframe"])
        if key in keys:
            raise DatasetIndexError("DATASET_INDEX_DOCUMENT_REJECTED")
        keys.add(key)
    _indexed_intervals(value)
    return value


class DatasetIndexStore:
    """One atomic immutable revision. No market-source I/O on this read path."""
    def __init__(self, root: Path | None = None):
        self.root = root or index_root()
        self._cache: tuple[str, dict] | None = None
        self.catalog_cache: tuple[tuple[str | None, str | None, str | None], float, dict] | None = None
        self._estimates: OrderedDict[str, tuple[float, dict]] = OrderedDict()

    def estimate(self, revision: str | None, document: dict | None, requested: dict, *, warmup_bars: int,
                 engine_catalog, gateway=None) -> dict:
        # Metadata-only, <=64 entries/30s. Scope/identity checks remain outside
        # this cache; no authorization, HMD prices or preflight tokens are kept.
        cache_inputs = [revision, requested, warmup_bars]
        if requested.get("data", {}).get("dataset_id") == VN_STOCK_DAILY_DATASET_ID:
            # The index is immutable but the release/profile qualification can
            # be withdrawn independently. Neither flag changes nor source-pin
            # refusal may keep a previously ready estimate in this cache.
            cache_inputs.append(_vn_observed_qualification(engine_catalog))
        key = hashlib.sha256(canonical(cache_inputs)).hexdigest()
        now = monotonic()
        cached = self._estimates.get(key)
        if cached is not None and now - cached[0] < 30:
            self._estimates.move_to_end(key)
            return copy.deepcopy(cached[1])
        result = declaration_estimate(document, requested, warmup_bars=warmup_bars,
            engine_catalog=engine_catalog, gateway=gateway)
        self._estimates[key] = (now, copy.deepcopy(result))
        self._estimates.move_to_end(key)
        while len(self._estimates) > 64:
            self._estimates.popitem(last=False)
        return result

    def publish(self, document: dict) -> str:
        validate_document(document)
        raw = canonical(document)
        if len(raw) > MAX_BYTES:
            raise DatasetIndexError("DATASET_INDEX_BYTE_BUDGET")
        revision = hashlib.sha256(raw).hexdigest()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Bounded disk custody: operator never silently prunes prior revisions.
        destination = self.root / f"{revision}.json"
        if not destination.exists() and sum(p.stat().st_size for p in self.root.glob("*.json")) + len(raw) > 128 * 1024 * 1024:
            raise DatasetIndexError("DATASET_INDEX_STORAGE_BUDGET")
        if destination.exists():
            if destination.read_bytes() != raw:
                raise DatasetIndexError("DATASET_INDEX_REVISION_CORRUPT")
        else:
            self._atomic(destination, raw)
        self._atomic(self.root / "current", revision.encode())
        self._cache = (revision, document)
        return revision

    def _atomic(self, destination: Path, raw: bytes) -> None:
        fd, path = tempfile.mkstemp(prefix=".stage-", dir=self.root)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(path, destination)
        finally:
            if os.path.exists(path):
                os.unlink(path)

    def read(self, source_digest: str | None) -> tuple[str | None, dict | None, str | None]:
        pointer = self.root / "current"
        if not pointer.exists():
            return None, None, "HMD_METADATA_INDEX_NOT_BUILT"
        if pointer.is_symlink() or pointer.stat().st_size != 64 or not _DIGEST.fullmatch(revision := pointer.read_text()):
            raise DatasetIndexError("DATASET_INDEX_POINTER_CORRUPT")
        if self._cache is None or self._cache[0] != revision:
            path = self.root / f"{revision}.json"
            if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_BYTES:
                raise DatasetIndexError("DATASET_INDEX_REVISION_CORRUPT")
            raw = path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != revision:
                raise DatasetIndexError("DATASET_INDEX_REVISION_CORRUPT")
            self._cache = (revision, validate_document(json.loads(raw)))
        document = self._cache[1]
        if not source_digest or source_digest != document["source_manifest_digest"]:
            return revision, None, "HMD_METADATA_INDEX_SOURCE_REVISION_CHANGED"
        return revision, document, None


def source_digest(provider) -> str | None:
    runtime = getattr(provider, "_runtime", None)
    return getattr(runtime, "manifest_digest", None)


def enrich_dataset_catalog(provider, store: DatasetIndexStore) -> dict[str, object]:
    digest = source_digest(provider)
    revision, document, reason = store.read(digest)
    key = (digest, revision, reason)
    if store.catalog_cache and store.catalog_cache[0] == key and monotonic() - store.catalog_cache[1] < 30:
        return store.catalog_cache[2]
    catalog = build_research_dataset_catalog(provider)
    clock = document["as_of_utc_ms"] if document else None
    entries = _indexed_intervals(document)
    datasets = []
    for dataset in catalog["datasets"]:
        items = []
        for symbol in dataset["symbols"]["items"]:
            coverage = [{**bar_summary(entries[(dataset["dataset_id"], symbol["symbol"], timeframe_ms(tf))]),
                "timeframe": tf} for tf in dataset["timeframes"]
                if (dataset["dataset_id"], symbol["symbol"], timeframe_ms(tf)) in entries]
            items.append({**symbol, "coverage_by_timeframe": coverage,
                "coverage_availability": {"state": "AVAILABLE" if coverage else "NOT_PUBLISHED",
                    "reason_code": None if coverage else reason or "HMD_SYMBOL_INTERVAL_NOT_INDEXED"},
                "instrument": {"state": "NOT_PUBLISHED", "reason_code": "HMD_READER_INSTRUMENT_METADATA_NOT_PUBLISHED",
                    "origin": "HMD_DIRECT", "as_of_utc_ms": None, "contract_kind": None,
                    **{field: None for field in INSTRUMENT_FIELDS}},
                "quality": {"state": "NOT_PUBLISHED", "reason_code": "HMD_QUALITY_IS_TIMEFRAME_SPECIFIC",
                    "origin": "PORTAL_DERIVED", "gap_count": None, "missing_ratio": None,
                    "duplicate_bar_count": None, "as_of_utc_ms": clock}})
        datasets.append({**dataset, "catalog_revision": revision, "as_of_utc_ms": clock,
            "timeframes": [{"timeframe": tf, "resolution_seconds": timeframe_ms(tf) // 1000,
                "availability": dataset["availability"], "reason_code": None if dataset["availability"] == "available" else "HMD_DATASET_NOT_AVAILABLE"} for tf in dataset["timeframes"]],
            "asset_class": None, "asset_class_availability": {"state": "NOT_PUBLISHED", "reason_code": "HMD_READER_ASSET_CLASS_NOT_PUBLISHED"},
            "symbols": {**dataset["symbols"], "items": items}})
    public = {"schema_version": "research.dataset-catalog.v2", "catalog_revision": revision,
        "as_of_utc_ms": clock, "index_availability": {"state": "AVAILABLE" if document else "NOT_PUBLISHED", "reason_code": reason},
        "datasets": datasets, "coverage_rule": "Exact closed target bars in indexed range only. Quality measures gaps between first/last observed bars, not listing history. Preflight remains authoritative; constituent-minute completeness and instrument facts are not inferred."}
    store.catalog_cache = (key, monotonic(), public)
    return public


def earliest_start_with_warmup(index: dict, warmup_bars: int, step: int) -> int | None:
    """First indexed target bar preceded by the declared contiguous warmup."""
    if index.get("clock_basis") == "OBSERVED_SOURCE_LOCAL_DATE_V1":
        from portal_api.services.research_observed_daily_index import observed_earliest_start_with_warmup
        return observed_earliest_start_with_warmup(index, warmup_bars)
    return next((first + warmup_bars * step for first, last in index["runs"]
        if (last - first) // step >= warmup_bars), None)


def window_metadata(document: dict | None, *, dataset_id: str, symbol: str, timeframe: str,
                    start_ms: int, end_ms: int, warmup_bars: int) -> dict[str, object]:
    if start_ms >= end_ms or start_ms < 0 or not _SYMBOL.fullmatch(symbol) or not 0 <= warmup_bars <= EXECUTION_MAX_WARMUP_BARS:
        raise DatasetIndexError("DATASET_WINDOW_QUERY_INVALID")
    step = timeframe_ms(timeframe)
    if dataset_id == VN_STOCK_DAILY_DATASET_ID:
        from portal_api.services.research_observed_daily_index import observed_window_metadata
        index = _find_index(document, dataset_id, symbol, timeframe)
        if timeframe.lower() != "1d":
            raise DatasetIndexError("DATASET_INTERVAL_INVALID")
        return observed_window_metadata(index, start_ms=start_ms, end_ms=end_ms, warmup_bars=warmup_bars)
    if start_ms % step or end_ms % step:
        raise DatasetIndexError("DATASET_WINDOW_NOT_BAR_ALIGNED")
    index = _find_index(document, dataset_id, symbol, timeframe)
    unavailable = {"availability": "NOT_PUBLISHED", "reason_code": "HMD_SYMBOL_INTERVAL_NOT_INDEXED",
        "bars": None, "first_bar_utc_ms": None, "last_bar_utc_ms": None,
        "warmup_bars_required": warmup_bars, "warmup_bars_available_before_start": None,
        "verified_range": None, "earliest_start_with_warmup_utc_ms": None}
    if not index:
        return unavailable
    unavailable.update(verified_range={"start_utc_ms": index["start_utc_ms"],
        "end_exclusive_utc_ms": index["end_exclusive_utc_ms"], "basis": "INDEXED_TARGET_BAR_RANGE_V1"},
        earliest_start_with_warmup_utc_ms=earliest_start_with_warmup(index, warmup_bars, step))
    # Never present an overlap count as the complete requested window. A
    # warmup-only refusal can still disclose all requested bars and the
    # observed indexed warmup subset, scoped by the explicit verified range.
    if start_ms < index["start_utc_ms"] or end_ms > index["end_exclusive_utc_ms"]:
        return {**unavailable, "reason_code": "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE"}
    bars = 0
    warmup = 0
    first = last = None
    for left, right in index["runs"]:
        a, b = max(left, start_ms), min(right, end_ms - step)
        if a <= b:
            bars += (b - a) // step + 1
            first = a if first is None else min(first, a)
            last = b if last is None else max(last, b)
        a, b = max(left, start_ms - warmup_bars * step), min(right, start_ms - step)
        if a <= b:
            warmup += (b - a) // step + 1
    warmup_refused = start_ms - warmup_bars * step < index["start_utc_ms"]
    return {**unavailable, "availability": "NOT_PUBLISHED" if warmup_refused else "AVAILABLE",
        "reason_code": "WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE" if warmup_refused else None, "bars": bars,
        "first_bar_utc_ms": first, "last_bar_utc_ms": last,
        "warmup_bars_required": warmup_bars, "warmup_bars_available_before_start": warmup}


def _vn_observed_qualification(engine_catalog) -> dict | None:
    try:
        fact = engine_catalog.public_document().current_release.vn_observed_daily_qualification
        return fact.model_dump(mode="json") if fact is not None else None
    except (AttributeError, OSError, ValueError, RuntimeError):
        return None


def _fold_geometry(folds: list[dict]) -> list[dict]:
    """Sanitized actual P08/engine plan; never a second calendar inference."""
    def interval(value):
        return {"start_utc_ms": int(pd.Timestamp(value["start_utc"]).value // 1_000_000),
            "end_exclusive_utc_ms": int(pd.Timestamp(value["end_exclusive_utc"]).value // 1_000_000),
            "bars": value["bars"]}
    return [{"ordinal": ordinal, "train": interval(fold["train"]),
        "outer_oos": interval(fold["outer_oos"])} for ordinal, fold in enumerate(folds, 1)]


def declaration_estimate(document: dict | None, requested: dict, *, warmup_bars: int,
                         engine_catalog, gateway=None) -> dict:
    """DR-08: plan only from actual indexed timestamps, never OHLCV or a job.

    Reuse the P08 planner so calendar edges and v2 guard semantics do not grow
    a second definition. The frame has an index only, no synthetic prices.
    Partial ranges cannot produce a complete fold count.
    """
    from portal_api.services.research_preflight_snapshot import (
        ResearchPreflightSnapshotError, _advanced_topology, _engine_advanced_topology,
        _three_window_topology, _v2_walk_forward_fields, parse_source_instant, sha256_json,
    )
    data = requested["data"]
    dataset, symbol, timeframe = data["dataset_id"], data["symbol"], data["timeframe"]
    step = timeframe_ms(timeframe)
    windows: list[dict] = []
    absence = {"availability": "NOT_PUBLISHED", "reason_code": "HMD_SYMBOL_INTERVAL_NOT_INDEXED",
        "count": None, "basis": "P08_PLANNER_ON_INDEXED_TIMESTAMPS_V1",
        "min_train_bars": None, "min_oos_bars": None}
    result = {"schema_version": "research.declaration-metadata.v1", "catalog_revision": None,
        "requested_spec_digest": sha256_json(requested),
        "as_of_utc_ms": document["as_of_utc_ms"] if document else None,
        "scope": "INDEX_ESTIMATE_NOT_PREFLIGHT_OR_RUN_AUTHORIZATION", "windows": windows,
        "planned_folds": absence, "earliest_start_utc_ms": None,
        "earliest_start_basis": "CONTIGUOUS_INDEXED_WARMUP_BARS_V1"}
    # The index can qualify observed dates before the execution profile is
    # admitted. Never publish a ready fold plan from a UTC/24-7 planner for VN.
    if dataset == VN_STOCK_DAILY_DATASET_ID:
        from portal_api.domain.research_vn_observed_fixed_profile import (
            VN_OBSERVED_FIXED_PROFILE_ID, VN_OBSERVED_FIXED_PROFILE_DIGEST,
            validate_vn_observed_fixed_spec,
        )
        result["earliest_start_basis"] = "OBSERVED_INDEXED_WARMUP_BARS_V1"
        # Measured window counts remain useful, while a UTC planner may not
        # authorize the unqualified profile. Keep the existing strict window
        # DTO free of BarMetadata's additive basis/warmup disclosures.
        spans = requested.get("windows") or {"span": requested["walk_forward"]}
        for key, span in spans.items():
            left = int(parse_source_instant(span["start"], source_timezone="Asia/Ho_Chi_Minh").value // 1_000_000)
            right = int(parse_source_instant(span["end_exclusive"], source_timezone="Asia/Ho_Chi_Minh").value // 1_000_000)
            metadata = window_metadata(document, dataset_id=dataset, symbol=symbol, timeframe=timeframe,
                start_ms=left, end_ms=right, warmup_bars=warmup_bars if key.upper() in {"IS", "SPAN"} else 0)
            window = {field: metadata[field] for field in ("availability", "reason_code", "bars", "first_bar_utc_ms",
                "last_bar_utc_ms", "warmup_bars_required", "warmup_bars_available_before_start")}
            if window["availability"] != "AVAILABLE":
                for field in ("bars", "first_bar_utc_ms", "last_bar_utc_ms", "warmup_bars_available_before_start"):
                    window[field] = None
            windows.append({"window": key.upper(), "start_utc_ms": left, "end_exclusive_utc_ms": right, **window})
        result["planned_folds"] = {**absence, "reason_code": "VN_DAILY_PORTAL_EXECUTION_NOT_QUALIFIED"}
        index = _find_index(document, dataset, symbol, timeframe)
        if index is None:
            return result
        result["earliest_start_utc_ms"] = earliest_start_with_warmup(index, warmup_bars, step)
        fact = _vn_observed_qualification(engine_catalog)
        expected = {"state": "AVAILABLE", "reason_code": None,
            "profile_id": VN_OBSERVED_FIXED_PROFILE_ID, "profile_digest": VN_OBSERVED_FIXED_PROFILE_DIGEST,
            "dataset_id": VN_STOCK_DAILY_DATASET_ID, "symbol": "FPT", "timeframe": "1d",
            "source_timezone": "Asia/Ho_Chi_Minh", "clock_basis": "OBSERVED_SOURCE_LOCAL_DATE_V1",
            "index_revision": hashlib.sha256(canonical(document)).hexdigest()}
        if fact != expected or warmup_bars != 300:
            return result
        try:
            validate_vn_observed_fixed_spec(requested)
        except ValueError:
            return result
        incomplete = next((row for row in windows if row["availability"] != "AVAILABLE"), None)
        if incomplete:
            result["planned_folds"] = {**absence, "reason_code": incomplete["reason_code"]}
            return result
        left = min(row["start_utc_ms"] for row in windows)
        right = max(row["end_exclusive_utc_ms"] for row in windows)
        count = sum((min(last, right-step)-max(first, left))//step+1 for first, last in index["runs"]
            if max(first, left) <= min(last, right-step))
        if count > EXECUTION_PLANNING_MAX_BARS:
            result["planned_folds"] = {**absence, "reason_code": "DECLARATION_TIMESTAMP_PLAN_BUDGET_EXCEEDED"}
            return result
        stamps = [stamp for first, last in index["runs"]
            for stamp in range(max(first, left), min(last, right-step)+1, step)]
        frame = pd.DataFrame(index=pd.DatetimeIndex(pd.to_datetime(stamps, unit="ms", utc=True)))
        if len(frame.index) == 0:
            result["planned_folds"] = {**absence, "reason_code": "HMD_INDEXED_RANGE_HAS_NO_BARS"}
            return result
        try:
            _, _, topology = _three_window_topology(requested, frame, source_timezone="Asia/Ho_Chi_Minh",
                verified_end_exclusive=pd.Timestamp(index["end_exclusive_utc_ms"], unit="ms", tz="UTC"))
        except ResearchPreflightSnapshotError as exc:
            result["planned_folds"] = {**absence, "reason_code": exc.code}
            return result
        folds = topology["folds"]
        result["planned_folds"] = {**absence, "availability": "AVAILABLE", "reason_code": None,
            "count": len(folds), "min_train_bars": min(f["train"]["bars"] for f in folds),
            "min_oos_bars": min(f["outer_oos"]["bars"] for f in folds), "items": _fold_geometry(folds)}
        return result
    spans = requested.get("windows") or {"span": requested["walk_forward"]}
    def instant(text):
        return int(parse_source_instant(text, source_timezone="UTC").value // 1_000_000)
    bounds = [(key.upper(), instant(value["start"]), instant(value["end_exclusive"])) for key, value in spans.items()]
    for key, left, right in bounds:
        metadata = window_metadata(document, dataset_id=dataset, symbol=symbol, timeframe=timeframe,
            start_ms=left, end_ms=right, warmup_bars=warmup_bars if key in {"IS", "SPAN"} else 0)
        # BarMetadata's additive refusal disclosure is not a widening of the
        # existing Declaration WindowEstimate shape or admission semantics.
        metadata.pop("verified_range")
        metadata.pop("earliest_start_with_warmup_utc_ms")
        if metadata["availability"] != "AVAILABLE":
            for field in ("bars", "first_bar_utc_ms", "last_bar_utc_ms", "warmup_bars_available_before_start"):
                metadata[field] = None
        windows.append({"window": key, "start_utc_ms": left, "end_exclusive_utc_ms": right,
            **metadata})
    index = _find_index(document, dataset, symbol, timeframe)
    if not index:
        return result
    result["earliest_start_utc_ms"] = earliest_start_with_warmup(index, warmup_bars, step)
    incomplete = next((row for row in windows if row["availability"] != "AVAILABLE"), None)
    if incomplete:
        result["planned_folds"] = {**absence, "reason_code": incomplete["reason_code"]}
        return result
    left = min(x[1] for x in bounds); right = max(x[2] for x in bounds)
    count = sum((min(last, right-step)-max(first,left))//step+1 for first,last in index["runs"]
        if max(first,left) <= min(last,right-step))
    if count > EXECUTION_PLANNING_MAX_BARS:
        result["planned_folds"] = {**absence, "reason_code": "DECLARATION_TIMESTAMP_PLAN_BUDGET_EXCEEDED"}
        return result
    stamps = [stamp for first,last in index["runs"] for stamp in range(max(first,left), min(last,right-step)+1, step)]
    frame = pd.DataFrame(index=pd.DatetimeIndex(pd.to_datetime(stamps, unit="ms", utc=True)))
    if len(frame.index) == 0:
        result["planned_folds"] = {**absence, "reason_code": "HMD_INDEXED_RANGE_HAS_NO_BARS"}
        return result
    try:
        if requested["protocol"] == "three_window_decay":
            _, _, topology = _three_window_topology(requested, frame, source_timezone="UTC")
        elif requested["schema_version"] == "research.requested-spec.v2":
            _, _, topology = _engine_advanced_topology(requested, frame, source_timezone="UTC",
                options=engine_catalog.walk_forward_options(), gateway=gateway,
                v2=_v2_walk_forward_fields(requested), trials=requested["optuna_trials"])
        else:
            _, _, topology = _advanced_topology(requested, frame, source_timezone="UTC",
                options=engine_catalog.walk_forward_options())
    except ResearchPreflightSnapshotError as exc:
        result["planned_folds"] = {**absence, "reason_code": exc.code}
        return result
    folds = topology["folds"]
    result["planned_folds"] = {**absence, "availability": "AVAILABLE", "reason_code": None,
        "count": len(folds), "min_train_bars": min(f["train"]["bars"] for f in folds),
        "min_oos_bars": min(f["outer_oos"]["bars"] for f in folds), "items": _fold_geometry(folds)}
    return result


def merge_index_documents(previous: dict, incoming: dict) -> dict:
    """Append namespace coverage without losing any unrelated interval facts."""
    validate_document(previous)
    validate_document(incoming)
    if any(previous[k] != incoming[k] for k in ("source_manifest_digest", "as_of_utc_ms")):
        raise DatasetIndexError("DATASET_INDEX_APPEND_SOURCE_CLOCK_MISMATCH")
    key = _interval_key
    combined = {key(row): row for row in previous["entries"]}
    combined.update({key(row): row for row in incoming["entries"]})
    result = {**incoming, "entries": [combined[k] for k in sorted(combined)]}
    if previous["schema_version"] == "research.dataset-index.v2":
        result["schema_version"] = "research.dataset-index.v2"
    validate_document(result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Explicit read-only HMD timestamp-index builder; no backtest.")
    parser.add_argument("--dataset-id", default="crypto-binance-1m")
    parser.add_argument("--symbol", action="append", required=True)
    parser.add_argument("--timeframe", action="append")
    parser.add_argument("--start")
    parser.add_argument("--end-exclusive")
    parser.add_argument("--discover", action="store_true", help="Metadata-only published/indexed interval discovery; no source price reads or index writes")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--append", action="store_true", help="Preserve other indexed datasets at the same verified source clock")
    parser.add_argument("--partition-span", action="store_true", help="Clip queries to source-published month partitions; facts still come from actual bars")
    parser.add_argument("--source-only-qualification", action="store_true",
        help="Explicit VN observed-date index only; never grants P08/P10 execution admission")
    parser.add_argument("--qualification-root", type=Path,
        help="Explicit private index destination for VN source qualification; never an input data root")
    args = parser.parse_args()
    if args.discover:
        if args.apply or args.append or args.partition_span or args.source_only_qualification:
            raise DatasetIndexError("DATASET_DISCOVERY_CANNOT_MUTATE_INDEX")
        if args.dataset_id == VN_STOCK_DAILY_DATASET_ID:
            raise DatasetIndexError("VN_OBSERVED_INDEX_REQUIRES_SOURCE_ONLY_QUALIFICATION")
        print(json.dumps(discover_indexed_timeframes(HistoricalMarketDataProvider(), DatasetIndexStore(),
            dataset_id=args.dataset_id, symbols=args.symbol), sort_keys=True))
        return
    if not args.timeframe or not args.start or not args.end_exclusive:
        parser.error("index construction requires --timeframe, --start and --end-exclusive")
    if args.dataset_id == VN_STOCK_DAILY_DATASET_ID:
        if not args.source_only_qualification or args.partition_span:
            raise DatasetIndexError("VN_OBSERVED_INDEX_REQUIRES_SOURCE_ONLY_QUALIFICATION")
        provider = VnStockDailyQualificationProvider()
        symbols = sorted(set(args.symbol))
        timeframes = sorted(set(x.lower() for x in args.timeframe))
        if not symbols or len(symbols) > MAX_SYMBOLS or timeframes != ["1d"] or any(not _SYMBOL.fullmatch(x) for x in symbols):
            raise DatasetIndexError("DATASET_INDEX_SELECTION_NOT_PUBLISHED")
        def observed_instant(text: str) -> int:
            value = pd.Timestamp(text)
            if value.tzinfo is None:
                raise DatasetIndexError("DATASET_INDEX_UTC_BOUND_REQUIRED")
            nanoseconds = value.tz_convert("UTC").value
            if nanoseconds % 1_000_000:
                raise DatasetIndexError("DATASET_WINDOW_NOT_BAR_ALIGNED")
            return int(nanoseconds // 1_000_000)
        start, end = observed_instant(args.start), observed_instant(args.end_exclusive)
        clock = int(datetime.now(timezone.utc).timestamp() * 1000)
        if args.apply and args.qualification_root is None:
            raise DatasetIndexError("VN_OBSERVED_INDEX_REQUIRES_PRIVATE_QUALIFICATION_ROOT")
        if args.qualification_root is not None:
            if not args.qualification_root.is_absolute() or args.qualification_root == Path("/"):
                raise DatasetIndexError("VN_OBSERVED_INDEX_REQUIRES_PRIVATE_QUALIFICATION_ROOT")
            for ancestor in (args.qualification_root, *args.qualification_root.parents):
                if ancestor.is_symlink():
                    raise DatasetIndexError("DATASET_INDEX_QUALIFICATION_ROOT_REJECTED")
        store = DatasetIndexStore(args.qualification_root) if args.qualification_root is not None else DatasetIndexStore()
        if args.apply and not args.append and (store.root / "current").exists():
            raise DatasetIndexError("VN_OBSERVED_INDEX_EXISTING_REVISION_REQUIRES_APPEND")
        previous = None
        if args.append:
            _, previous, reason = store.read(source_digest(provider))
            if previous is None:
                raise DatasetIndexError(reason or "DATASET_INDEX_APPEND_REQUIRES_VERIFIED_BASE")
            clock = previous["as_of_utc_ms"]
        entries = [{"dataset_id": args.dataset_id, "symbol": symbol,
            "index": build_bar_index(provider, dataset_id=args.dataset_id, symbol=symbol,
                timeframe="1d", start_ms=start, end_ms=end, as_of_ms=clock)} for symbol in symbols]
        document = {"schema_version": "research.dataset-index.v2", "source_manifest_digest": source_digest(provider),
            "as_of_utc_ms": clock, "entries": entries}
        if previous is not None:
            document = merge_index_documents(previous, document)
        validate_document(document)
        revision = store.publish(document) if args.apply else hashlib.sha256(canonical(document)).hexdigest()
        print(json.dumps({"applied": args.apply, "catalog_revision": revision, "entries": len(entries),
            "bars": sum(bar_summary(row["index"])["bar_count"] for row in entries), "bytes": len(canonical(document)),
            "qualification_scope": "OBSERVED_INDEX_ONLY_NOT_EXECUTION_ADMISSION"}))
        return
    if args.source_only_qualification or args.qualification_root is not None:
        raise DatasetIndexError("VN_OBSERVED_INDEX_REQUIRES_EXACT_SOURCE_NAMESPACE")
    provider = HistoricalMarketDataProvider()
    catalog = build_research_dataset_catalog(provider)
    dataset = next((row for row in catalog["datasets"] if row["dataset_id"] == args.dataset_id and row["availability"] == "available"), None)
    if dataset is None:
        raise DatasetIndexError("DATASET_INDEX_SELECTION_NOT_PUBLISHED")
    names = {row["symbol"] for row in dataset["symbols"]["items"]}
    symbols, timeframes = sorted(set(args.symbol)), sorted(set(canonical_fixed_timeframe(x) for x in args.timeframe))
    if len(symbols) > MAX_SYMBOLS or len(timeframes) > MAX_TIMEFRAMES or not set(symbols) <= names or not set(timeframes) <= set(dataset["timeframes"]):
        raise DatasetIndexError("DATASET_INDEX_SELECTION_NOT_PUBLISHED")
    def instant(text: str) -> int:
        value = pd.Timestamp(text)
        if value.tzinfo is None:
            raise DatasetIndexError("DATASET_INDEX_UTC_BOUND_REQUIRED")
        return int(value.tz_convert("UTC").value // 1_000_000)
    start, end = instant(args.start), instant(args.end_exclusive)
    clock = int(datetime.now(timezone.utc).timestamp() * 1000)
    store = DatasetIndexStore()
    previous = None
    if args.append:
        _, previous, reason = store.read(source_digest(provider))
        if previous is None:
            raise DatasetIndexError(reason or "DATASET_INDEX_APPEND_REQUIRES_VERIFIED_BASE")
        # Never relabel old timestamps as a new scan. A later source clock
        # requires an explicit all-source rebuild, not an append.
        clock = previous["as_of_utc_ms"]
    entries = []
    for symbol in symbols:
        left, right = start, end
        if args.partition_span:
            coverage = next(row["coverage"] for row in dataset["symbols"]["items"] if row["symbol"] == symbol)
            if coverage:
                left = max(left, int(pd.Timestamp(coverage["first_month"], tz="UTC").value // 1_000_000))
                right = min(right, int((pd.Timestamp(coverage["last_month"], tz="UTC") + pd.offsets.MonthBegin(1)).value // 1_000_000))
        if left >= min(right, clock):
            continue
        for index in build_symbol_indexes(provider, dataset_id=dataset["dataset_id"], symbol=symbol,
                timeframes=timeframes, start_ms=left, end_ms=right, as_of_ms=clock):
            entries.append({"dataset_id": dataset["dataset_id"], "symbol": symbol, "index": index})
    document = {"schema_version": "research.dataset-index.v1", "source_manifest_digest": source_digest(provider),
        "as_of_utc_ms": clock, "entries": entries}
    if previous is not None:
        document = merge_index_documents(previous, document)
    validate_document(document)
    revision = store.publish(document) if args.apply else hashlib.sha256(canonical(document)).hexdigest()
    print(json.dumps({"applied": args.apply, "catalog_revision": revision, "entries": len(entries),
        "bars": sum(bar_summary(row["index"])["bar_count"] for row in entries), "bytes": len(canonical(document))}))


if __name__ == "__main__":
    main()
