"""Fresh fixed OOS market/account observations, never an execution ledger.

One existing QuantBT result is read while its aligned tape still exists. Raw
child bytes and normalized rows have different hashes; the existing P05 writer
later produces its own immutable part hashes. No sampled passport is upgraded.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import stat
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterator

import pyarrow as pa
import pyarrow.parquet as pq

from portal_api.services.research_evidence_metrics import (
    _engine_result_types, decimal_text, oos_scoped_result,
)

SOURCE_SCHEMA = "research.fixed-replay-source.v1"
FILE_NAME = "fixed-replay.parquet"
MAX_ROWS = 20_000
MAX_BYTES = 2 * 1024 * 1024
BATCH_ROWS = 200
VALUE_FIELDS = ("open", "high", "low", "close", "volume", "equity", "return_fraction", "drawdown_fraction")
REPLAY_SCHEMA = pa.schema([
    pa.field("source_ordinal", pa.int64(), nullable=False),
    pa.field("at_utc_ms", pa.int64(), nullable=False),
    *(pa.field(name, pa.string(), nullable=False) for name in VALUE_FIELDS),
    pa.field("positions_json", pa.string(), nullable=False),
])
_DECIMAL = re.compile(r"^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$")
_SYMBOL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$")
_HASH = re.compile(r"^[a-f0-9]{64}$")
_AVAILABLE_FIELDS = {
    "schema_version", "state", "reason_code", "file_name", "file_sha256", "byte_count",
    "normalized_rows_sha256", "row_count", "oos_start_utc_ms", "oos_end_exclusive_utc_ms",
    "first_observed_utc_ms", "last_observed_utc_ms",
}
_ABSENCE_REASONS = {
    "FIXED_REPLAY_ROW_LIMIT_EXCEEDED", "FIXED_REPLAY_FILE_LIMIT_EXCEEDED",
    "FIXED_REPLAY_MARKET_FIELDS_UNAVAILABLE", "FIXED_REPLAY_SOURCE_UNAVAILABLE",
}


def canonical_rows_json(value: Any) -> bytes:
    """Same UTF-8/sorted-key/no-float convention as canonicalResearchJson."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")


class _RowsHash:
    def __init__(self) -> None:
        self.digest = hashlib.sha256(b"[")
        self.count = 0

    def add(self, row: dict[str, Any]) -> None:
        if self.count:
            self.digest.update(b",")
        self.digest.update(canonical_rows_json(row))
        self.count += 1

    def finish(self) -> str:
        digest = self.digest.copy()
        digest.update(b"]")
        return digest.hexdigest()


class _FileLimitExceeded(ValueError):
    pass


class _BoundedFile(io.BufferedWriter):
    def write(self, data: Any) -> int:
        # Check before a kernel write: the child's unchanged RLIMIT_FSIZE
        # must not turn a typed replay absence into a killed backtest child.
        if self.tell() + len(data) > MAX_BYTES:
            raise _FileLimitExceeded("fixed replay file limit exceeded")
        return super().write(data)


def _bounds(start: Any, end: Any) -> None:
    if any(type(value) is not int or not 0 <= value <= 8_640_000_000_000_000 for value in (start, end)) or start >= end:
        raise ValueError("fixed replay requires exact half-open OOS UTC bounds")


def unavailable_source(reason: str, *, start: int, end: int) -> dict[str, Any]:
    _bounds(start, end)
    if reason not in _ABSENCE_REASONS:
        raise ValueError("fixed replay absence reason is not admitted")
    return {"schema_version": SOURCE_SCHEMA, "state": "NOT_PUBLISHED", "reason_code": reason,
        "oos_start_utc_ms": start, "oos_end_exclusive_utc_ms": end}


def validate_source_metadata(source: Any) -> None:
    if not isinstance(source, dict) or len(canonical_rows_json(source)) >= 2048 \
            or source.get("schema_version") != SOURCE_SCHEMA:
        raise ValueError("fixed replay source metadata is incompatible")
    _bounds(source.get("oos_start_utc_ms"), source.get("oos_end_exclusive_utc_ms"))
    if source.get("state") == "NOT_PUBLISHED":
        if set(source) != {"schema_version", "state", "reason_code", "oos_start_utc_ms", "oos_end_exclusive_utc_ms"} \
                or source["reason_code"] not in _ABSENCE_REASONS:
            raise ValueError("fixed replay source absence is incompatible")
        return
    if set(source) != _AVAILABLE_FIELDS or source.get("state") != "AVAILABLE" or source.get("reason_code") is not None \
            or source.get("file_name") != FILE_NAME:
        raise ValueError("fixed replay source metadata is incompatible")
    for name in ("file_sha256", "normalized_rows_sha256"):
        if not isinstance(source[name], str) or not _HASH.fullmatch(source[name]):
            raise ValueError("fixed replay source hash is incompatible")
    for name, limit in (("row_count", MAX_ROWS), ("byte_count", MAX_BYTES)):
        if type(source[name]) is not int or not 1 <= source[name] <= limit:
            raise ValueError("fixed replay source budget is incompatible")
    first, last = source["first_observed_utc_ms"], source["last_observed_utc_ms"]
    if type(first) is not int or type(last) is not int or not source["oos_start_utc_ms"] <= first <= last < source["oos_end_exclusive_utc_ms"]:
        raise ValueError("fixed replay observed bounds are incompatible")


def _validate_row(row: dict[str, Any], ordinal: int, previous: int | None, source: dict[str, Any]) -> None:
    if set(row) != {"source_ordinal", "at_utc_ms", "positions", *VALUE_FIELDS} or type(row["source_ordinal"]) is not int \
            or row["source_ordinal"] != ordinal or type(row["at_utc_ms"]) is not int or len(canonical_rows_json(row)) > 4096:
        raise ValueError("fixed replay ordinal/row schema is incompatible")
    at = row["at_utc_ms"]
    if not source["oos_start_utc_ms"] <= at < source["oos_end_exclusive_utc_ms"] or (previous is not None and at <= previous):
        raise ValueError("fixed replay timestamps are not strict OOS chronology")
    positions = row["positions"]
    if not isinstance(positions, dict) or not 1 <= len(positions) <= 16 \
            or any(not isinstance(symbol, str) or not _SYMBOL.fullmatch(symbol) for symbol in positions):
        raise ValueError("fixed replay positions are incompatible")
    for value in [*(row[name] for name in VALUE_FIELDS), *positions.values()]:
        if not isinstance(value, str) or len(value) > 96 or not _DECIMAL.fullmatch(value):
            raise ValueError("fixed replay values require exact finite decimal strings")
    prices = [Decimal(row[name]) for name in ("open", "high", "low", "close")]
    if any(value <= 0 for value in prices) or prices[1] < max(prices[0], prices[2], prices[3]) \
            or prices[2] > min(prices[0], prices[1], prices[3]) or Decimal(row["volume"]) < 0 \
            or Decimal(row["equity"]) <= 0 or not -1 <= Decimal(row["drawdown_fraction"]) <= 0:
        raise ValueError("fixed replay market/account values are incompatible")


def rows_to_batch(rows: list[dict[str, Any]]) -> pa.RecordBatch:
    return pa.RecordBatch.from_pylist([
        {**{name: row[name] for name in ("source_ordinal", "at_utc_ms", *VALUE_FIELDS)},
            "positions_json": canonical_rows_json(row["positions"]).decode("utf-8")}
        for row in rows], schema=REPLAY_SCHEMA)


def batch_to_rows(batch: pa.RecordBatch) -> list[dict[str, Any]]:
    if not batch.schema.equals(REPLAY_SCHEMA):
        raise ValueError("fixed replay Parquet schema is incompatible")
    return [{**{name: row[name] for name in ("source_ordinal", "at_utc_ms", *VALUE_FIELDS)},
        "positions": json.loads(row["positions_json"])} for row in batch.to_pylist()]


def capture_fixed_replay(*, result: Any, market: Any, output_directory: Path,
                         oos_start_utc_ms: int, oos_end_exclusive_utc_ms: int) -> dict[str, Any]:
    """Capture actual aligned OHLCV/account arrays; never execute an engine."""
    import numpy as np
    import pandas as pd

    start, end = oos_start_utc_ms, oos_end_exclusive_utc_ms
    _bounds(start, end)
    absent = lambda reason: unavailable_source(reason, start=start, end=end)
    if not isinstance(result, _engine_result_types()):
        raise ValueError("fixed replay requires an actual installed QuantBT result")
    index = result.equity.index
    if index.tz is None or not index.is_unique or not index.is_monotonic_increasing or not market.index.equals(index) \
            or any(not getattr(result, name).index.equals(index) for name in ("returns", "positions", "closes")):
        raise ValueError("fixed replay requires strictly aligned chronological source arrays")
    # Structural holdout refusal, not a filter that hides accidental exposure.
    end_at = pd.Timestamp(end, unit="ms", tz="UTC")
    if not len(index) or index[-1] >= end_at:
        raise ValueError("fixed replay source contains holdout/out-of-window observations")
    selected = index[index >= pd.Timestamp(start, unit="ms", tz="UTC")]
    if len(selected) > MAX_ROWS:
        return absent("FIXED_REPLAY_ROW_LIMIT_EXCEEDED")
    if not len(selected):
        return absent("FIXED_REPLAY_SOURCE_UNAVAILABLE")
    if any(name not in market.columns for name in ("open", "high", "low", "close", "volume")) \
            or not np.isfinite(market.loc[selected, ["open", "high", "low", "close", "volume"]].to_numpy(dtype=float)).all():
        return absent("FIXED_REPLAY_MARKET_FIELDS_UNAVAILABLE")
    symbols = list(result.symbols)
    if len(symbols) != 1 \
            or any(not isinstance(symbol, str) or not _SYMBOL.fullmatch(symbol) for symbol in symbols) \
            or set(result.positions.columns) != {"Position_" + symbol for symbol in symbols} \
            or list(result.closes.columns) != ["Close_" + symbol for symbol in symbols]:
        # quantbt==1.1.1 native_vectorized.py materializes Position_<symbol>
        # and Close_<symbol>. DEFAULT is an engine label, not dataset identity;
        # immutable requested-spec/dataset binding remains in the P05 receipt.
        raise ValueError("fixed replay requires actual pinned engine position/close columns")
    # This profile consumed one exact close stream. Aligned timestamps alone
    # must not let a same-index substituted market claim engine input custody.
    if not np.array_equal(result.closes.loc[selected, "Close_" + symbols[0]].to_numpy(dtype=float),
            market.loc[selected, "close"].to_numpy(dtype=float)):
        raise ValueError("fixed replay market closes disagree with actual consumed engine closes")
    scoped = oos_scoped_result(result, oos_start_utc_ms=start)
    if not scoped.equity.index.equals(selected):
        raise ValueError("fixed replay engine OOS scope disagrees with declared source")
    drawdown = scoped.drawdown
    directory = output_directory
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError("fixed replay output must be the private child work directory")
    path, partial = directory / FILE_NAME, directory / "fixed-replay.partial.parquet"
    if path.exists() or path.is_symlink() or partial.exists() or partial.is_symlink():
        raise ValueError("fixed replay child output already exists")
    metadata = {"schema_version": SOURCE_SCHEMA, "state": "AVAILABLE", "reason_code": None,
        "file_name": FILE_NAME, "oos_start_utc_ms": start, "oos_end_exclusive_utc_ms": end}
    normalized = _RowsHash()
    previous = None
    rows: list[dict[str, Any]] = []
    first = None
    fd = os.open(partial, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    sink = _BoundedFile(io.FileIO(fd, mode="wb", closefd=True))
    writer = None
    try:
        writer = pq.ParquetWriter(sink, REPLAY_SCHEMA, compression="zstd", use_dictionary=False)
        for ordinal, at in enumerate(selected):
            # Millisecond transport must not merge distinct real source bars.
            if at.value % 1_000_000:
                raise ValueError("fixed replay source timestamp is not exact UTC milliseconds")
            at_ms = int(at.value // 1_000_000)
            row = {"source_ordinal": ordinal, "at_utc_ms": at_ms,
                **{name: decimal_text(market.loc[at, name]) for name in ("open", "high", "low", "close", "volume")},
                "equity": decimal_text(scoped.equity.loc[at]), "return_fraction": decimal_text(scoped.returns.loc[at]),
                "drawdown_fraction": decimal_text(-drawdown.loc[at]),
                "positions": {symbol: decimal_text(scoped.positions.loc[at, "Position_" + symbol]) for symbol in symbols}}
            _validate_row(row, ordinal, previous, metadata)
            previous = at_ms
            first = at_ms if first is None else first
            normalized.add(row)
            rows.append(row)
            if len(rows) == BATCH_ROWS:
                writer.write_batch(rows_to_batch(rows), row_group_size=BATCH_ROWS)
                rows.clear()
        if rows:
            writer.write_batch(rows_to_batch(rows), row_group_size=BATCH_ROWS)
        writer.close()
        writer = None
        sink.close()
        os.rename(partial, path)
    except BaseException as exc:
        if writer is not None:
            try:
                writer.close()
            except Exception:
                pass
        sink.close()
        partial.unlink(missing_ok=True)
        if isinstance(exc, _FileLimitExceeded):
            return absent("FIXED_REPLAY_FILE_LIMIT_EXCEEDED")
        raise
    metadata.update(file_sha256=hashlib.sha256(path.read_bytes()).hexdigest(), byte_count=path.stat().st_size,
        normalized_rows_sha256=normalized.finish(), row_count=normalized.count,
        first_observed_utc_ms=first, last_observed_utc_ms=previous)
    validate_source_metadata(metadata)
    return metadata


def iter_parquet_rows(path: Path) -> Iterator[list[dict[str, Any]]]:
    parquet = pq.ParquetFile(path)
    if not parquet.schema_arrow.equals(REPLAY_SCHEMA) or not 1 <= parquet.metadata.num_rows <= MAX_ROWS \
            or any(parquet.metadata.row_group(i).num_rows > BATCH_ROWS for i in range(parquet.metadata.num_row_groups)):
        raise ValueError("fixed replay Parquet schema/row groups exceed source bounds")
    for batch in parquet.iter_batches(batch_size=BATCH_ROWS):
        yield batch_to_rows(batch)


def verify_normalized_rows(batches: Iterator[list[dict[str, Any]]], source: dict[str, Any]) -> None:
    validate_source_metadata(source)
    if source["state"] != "AVAILABLE":
        raise ValueError("fixed replay absence has no retained rows")
    normalized = _RowsHash()
    previous = first = None
    for rows in batches:
        if not 1 <= len(rows) <= BATCH_ROWS:
            raise ValueError("fixed replay source batch exceeds bounds")
        for row in rows:
            if normalized.count >= source["row_count"]:
                raise ValueError("fixed replay source row count exceeds declared count")
            _validate_row(row, normalized.count, previous, source)
            previous = row["at_utc_ms"]
            first = previous if first is None else first
            normalized.add(row)
    if normalized.count != source["row_count"] or normalized.finish() != source["normalized_rows_sha256"] \
            or first != source["first_observed_utc_ms"] or previous != source["last_observed_utc_ms"]:
        raise ValueError("fixed replay normalized source digest/count/bounds mismatch")


def verify_fixed_replay_file(path: Path, source: dict[str, Any]) -> None:
    validate_source_metadata(source)
    if source["state"] != "AVAILABLE":
        raise ValueError("fixed replay absence has no source file")
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size != source["byte_count"] or info.st_size > MAX_BYTES \
            or hashlib.sha256(path.read_bytes()).hexdigest() != source["file_sha256"]:
        raise ValueError("fixed replay source byte custody mismatch")
    verify_normalized_rows(iter_parquet_rows(path), source)


def copy_fixed_replay_file(source_path: Path, destination: Path, source: dict[str, Any]) -> None:
    """Copy exact verified child bytes before the child work is retired."""
    verify_fixed_replay_file(source_path, source)
    raw = source_path.read_bytes()  # independently bounded to 2 MiB above
    if hashlib.sha256(raw).hexdigest() != source["file_sha256"]:
        raise ValueError("fixed replay source changed during copy")
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(raw)
    verify_fixed_replay_file(destination, source)
