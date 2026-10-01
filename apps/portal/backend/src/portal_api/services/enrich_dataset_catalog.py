"""B7: bounded timestamp index, built explicitly; public reads never load HMD.

The source is the approved MarketDataProvider, including its validation. A bar
is closed by its fixed interval and observation clock, exactly as P08; this is
not a claim that each aggregate has every constituent minute. Ranges and gaps
are index metadata, not candles, session calendars or instrument authority.
"""
from __future__ import annotations

import argparse
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

from portal_api.adapters.market_data import HistoricalMarketDataProvider, MarketDataQuery
from portal_api.domain.errors import DatasetNotFoundError
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


def index_root() -> Path:
    return Path(os.getenv("PORTAL_ARTIFACT_ROOT", "artifacts/runs")) / "durable-store" / "research-dataset-index"


def build_bar_index(provider, *, dataset_id: str, symbol: str, timeframe: str,
                    start_ms: int, end_ms: int, as_of_ms: int) -> dict[str, object]:
    """Explicit operator only: sequential <=31-day queries, <=10M target bars.

    Use exactly aligned edges. Do not ceil an arbitrary start to imply data was
    available earlier. Actual clock is captured by the operator once per revision.
    """
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
    if value["schema_version"] != "research.dataset-index.v1" or not _DIGEST.fullmatch(str(value["source_manifest_digest"])):
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
    return value


class DatasetIndexStore:
    """One atomic immutable revision. No market-source I/O on this read path."""
    def __init__(self, root: Path | None = None):
        self.root = root or index_root()
        self._cache: tuple[str, dict] | None = None
        self.catalog_cache: tuple[tuple[str | None, str | None, str | None], float, dict] | None = None

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
    entries = {(row["dataset_id"], row["symbol"], row["index"]["timeframe"]): row["index"]
               for row in document["entries"]} if document else {}
    datasets = []
    for dataset in catalog["datasets"]:
        items = []
        for symbol in dataset["symbols"]["items"]:
            coverage = [bar_summary(entries[(dataset["dataset_id"], symbol["symbol"], tf)])
                for tf in dataset["timeframes"] if (dataset["dataset_id"], symbol["symbol"], tf) in entries]
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


def window_metadata(document: dict | None, *, dataset_id: str, symbol: str, timeframe: str,
                    start_ms: int, end_ms: int, warmup_bars: int) -> dict[str, object]:
    if start_ms >= end_ms or start_ms < 0 or not _SYMBOL.fullmatch(symbol) or not 0 <= warmup_bars <= 100_000:
        raise DatasetIndexError("DATASET_WINDOW_QUERY_INVALID")
    step = timeframe_ms(timeframe)
    if start_ms % step or end_ms % step:
        raise DatasetIndexError("DATASET_WINDOW_NOT_BAR_ALIGNED")
    index = next((row["index"] for row in document["entries"]
        if (row["dataset_id"], row["symbol"], row["index"]["timeframe"]) == (dataset_id, symbol, timeframe.lower())), None) if document else None
    unavailable = {"availability": "NOT_PUBLISHED", "reason_code": "HMD_SYMBOL_INTERVAL_NOT_INDEXED",
        "bars": None, "first_bar_utc_ms": None, "last_bar_utc_ms": None,
        "warmup_bars_required": warmup_bars, "warmup_bars_available_before_start": None}
    if not index:
        return unavailable
    if start_ms - warmup_bars * step < index["start_utc_ms"] or end_ms > index["end_exclusive_utc_ms"]:
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
    return {"availability": "AVAILABLE", "reason_code": None, "bars": bars,
        "first_bar_utc_ms": first, "last_bar_utc_ms": last,
        "warmup_bars_required": warmup_bars, "warmup_bars_available_before_start": warmup}


def main() -> None:
    parser = argparse.ArgumentParser(description="Explicit read-only HMD timestamp-index builder; no backtest.")
    parser.add_argument("--symbol", action="append", required=True)
    parser.add_argument("--timeframe", action="append", required=True)
    parser.add_argument("--start", required=True)
    parser.add_argument("--end-exclusive", required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--partition-span", action="store_true", help="Clip queries to source-published month partitions; facts still come from actual bars")
    args = parser.parse_args()
    provider = HistoricalMarketDataProvider()
    catalog = build_research_dataset_catalog(provider)
    dataset = next(row for row in catalog["datasets"] if row["dataset_id"] == "crypto-binance-1m")
    names = {row["symbol"] for row in dataset["symbols"]["items"]}
    symbols, timeframes = sorted(set(args.symbol)), sorted(set(x.lower() for x in args.timeframe))
    if len(symbols) > MAX_SYMBOLS or len(timeframes) > MAX_TIMEFRAMES or not set(symbols) <= names or not set(timeframes) <= set(dataset["timeframes"]):
        raise DatasetIndexError("DATASET_INDEX_SELECTION_NOT_PUBLISHED")
    def instant(text: str) -> int:
        value = pd.Timestamp(text)
        if value.tzinfo is None:
            raise DatasetIndexError("DATASET_INDEX_UTC_BOUND_REQUIRED")
        return int(value.tz_convert("UTC").value // 1_000_000)
    start, end = instant(args.start), instant(args.end_exclusive)
    clock = int(datetime.now(timezone.utc).timestamp() * 1000)
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
    validate_document(document)
    revision = DatasetIndexStore().publish(document) if args.apply else hashlib.sha256(canonical(document)).hexdigest()
    print(json.dumps({"applied": args.apply, "catalog_revision": revision, "entries": len(entries),
        "bars": sum(bar_summary(row["index"])["bar_count"] for row in entries), "bytes": len(canonical(document))}))


if __name__ == "__main__":
    main()
