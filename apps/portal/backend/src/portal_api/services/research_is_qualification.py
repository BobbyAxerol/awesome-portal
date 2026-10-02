"""Private opt-in IS qualification witness, never a product replay artifact.

Capture one existing fixed QuantBT result before scratch retirement. The
caller owns opt-in admission and private custody outside the engine bundle.
No metrics, strategy, objective, accounting or engine execution occurs here.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from pathlib import Path
from typing import Any, BinaryIO

from portal_api.services.research_enrich_analysis import IS_DEFINITION
from portal_api.services.research_evidence_metrics import _engine_result_types, declared_is_scoped_result

SOURCE_SCHEMA = "research.is-qualification-source.v1"
HEADER_SCHEMA = "research.is-qualification-witness.v1"
FILE_NAME = "is-qualification.ndjson"
MAX_ROWS = 20_000
MAX_BYTES = 2 * 1024 * 1024
MAX_METADATA_BYTES = 2048
MAX_LINE_BYTES = 8192
COPY_BYTES = 64 * 1024
_HASH = re.compile(r"^[a-f0-9]{64}$")
_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_SYMBOL = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$")
_BINDING_KEYS = {"run_id", "job_id", "worker_attempt_id", "lease_epoch"}
_BASE_KEYS = {"schema_version", "state", "reason_code", "binding_sha256", "is_start_utc_ms", "is_end_exclusive_utc_ms"}
_AVAILABLE_KEYS = _BASE_KEYS | {"file_name", "file_sha256", "byte_count", "normalized_rows_sha256",
    "observation_is_digest", "row_count", "first_observed_utc_ms", "last_observed_utc_ms"}
_ABSENCES = {
    "IS_QUALIFICATION_SOURCE_UNAVAILABLE", "IS_QUALIFICATION_SOURCE_INVALID",
    "IS_QUALIFICATION_DECLARED_WINDOWS_UNAVAILABLE", "IS_QUALIFICATION_NOT_FIXED",
    "IS_QUALIFICATION_SAMPLED_SOURCE", "IS_QUALIFICATION_ROW_LIMIT_EXCEEDED",
    "IS_QUALIFICATION_FILE_LIMIT_EXCEEDED", "IS_QUALIFICATION_MARKET_CLOSE_UNAVAILABLE",
}


def _json(value: Any) -> bytes:
    # EXACT convention of _declared_is_input: ensure_ascii defaults to True.
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False).encode("utf-8")


def _sha(value: Any) -> str:
    return hashlib.sha256(_json(value)).hexdigest()


def _binding(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != _BINDING_KEYS \
            or any(not isinstance(value[key], str) or not _ID.fullmatch(value[key])
                for key in ("run_id", "job_id", "worker_attempt_id")) \
            or type(value["lease_epoch"]) is not int or not 1 <= value["lease_epoch"] <= 9_007_199_254_740_991:
        raise ValueError("IS qualification requires the exact private immutable attempt binding")
    return dict(value)


def _utc_ms(value: Any) -> bool:
    return type(value) is int and 0 <= value <= 9_007_199_254_740_991


def _locator(value: Any) -> bool:
    return isinstance(value, str) and 1 <= len(value) <= 256 and all(32 <= ord(char) < 127 for char in value)


def _windows(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict) or set(value) - {"is", "oos", "holdout"}:
        raise ValueError("IS qualification requires immutable declared source windows")
    result = {}
    for name, row in value.items():
        if not isinstance(row, dict) or set(row) != {"start_ms", "end_ms", "source_locator"} \
                or not _utc_ms(row["start_ms"]) or not _utc_ms(row["end_ms"]) \
                or row["start_ms"] >= row["end_ms"] or not _locator(row["source_locator"]):
            raise ValueError("IS qualification source windows are incompatible")
        result[name] = dict(row)
    if "is" in result and "oos" in result and result["is"]["end_ms"] != result["oos"]["start_ms"] \
            or "holdout" in result and "oos" in result and result["oos"]["end_ms"] != result["holdout"]["start_ms"]:
        raise ValueError("IS qualification source windows are not exact adjacent half-open declarations")
    return result


def _absent(reason: str, *, binding: dict[str, Any], windows: dict[str, Any]) -> dict[str, Any]:
    source = {"schema_version": SOURCE_SCHEMA, "state": "NOT_PUBLISHED", "reason_code": reason,
        "binding_sha256": _sha(binding), "is_start_utc_ms": windows.get("is", {}).get("start_ms"),
        "is_end_exclusive_utc_ms": windows.get("is", {}).get("end_ms")}
    validate_is_qualification_metadata(source)
    return source


def validate_is_qualification_metadata(source: Any) -> None:
    if not isinstance(source, dict) or len(_json(source)) >= MAX_METADATA_BYTES \
            or source.get("schema_version") != SOURCE_SCHEMA \
            or not isinstance(source.get("binding_sha256"), str) or not _HASH.fullmatch(source["binding_sha256"]):
        raise ValueError("IS qualification metadata is incompatible or exceeds its private byte bound")
    start, end = source.get("is_start_utc_ms"), source.get("is_end_exclusive_utc_ms")
    missing = start is None and end is None
    if not missing and (not _utc_ms(start) or not _utc_ms(end) or start >= end):
        raise ValueError("IS qualification metadata bounds are incompatible")
    if source.get("state") == "NOT_PUBLISHED":
        if set(source) != _BASE_KEYS or source.get("reason_code") not in _ABSENCES:
            raise ValueError("IS qualification absence is incompatible")
        return
    if set(source) != _AVAILABLE_KEYS or source.get("state") != "AVAILABLE" \
            or source.get("reason_code") is not None or missing or source.get("file_name") != FILE_NAME:
        raise ValueError("IS qualification available metadata is incompatible")
    for key in ("file_sha256", "normalized_rows_sha256", "observation_is_digest"):
        if not isinstance(source[key], str) or not _HASH.fullmatch(source[key]):
            raise ValueError("IS qualification metadata digest is incompatible")
    if type(source["row_count"]) is not int or not 2 <= source["row_count"] <= MAX_ROWS \
            or type(source["byte_count"]) is not int or not 1 <= source["byte_count"] <= MAX_BYTES:
        raise ValueError("IS qualification metadata row/file budget is incompatible")
    first, last = source["first_observed_utc_ms"], source["last_observed_utc_ms"]
    if not _utc_ms(first) or not _utc_ms(last) or not start <= first < last < end:
        raise ValueError("IS qualification observed bounds are incompatible")


def _parent_fd(path: Path) -> int:
    parent = path.parent
    if not parent.is_absolute():
        raise ValueError("IS qualification paths must be private absolute paths")
    for directory in (parent, *parent.parents):
        if stat.S_ISLNK(directory.lstat().st_mode):
            raise ValueError("IS qualification parent symlinks are forbidden")
    fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    info = os.fstat(fd)
    if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o077:
        os.close(fd)
        raise ValueError("IS qualification requires a private output/retention directory")
    return fd


def _open(path: Path, *, create: bool = False) -> int:
    directory = _parent_fd(path)
    try:
        return os.open(path.name, (os.O_WRONLY | os.O_CREAT | os.O_EXCL if create else os.O_RDONLY | os.O_NONBLOCK)
            | os.O_NOFOLLOW, 0o600, dir_fd=directory)
    finally:
        os.close(directory)


def _file_info(handle: BinaryIO, source: dict[str, Any] | None = None):
    info = os.fstat(handle.fileno())
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 \
            or info.st_size > MAX_BYTES or source is not None and info.st_size != source["byte_count"]:
        raise ValueError("IS qualification source must be an exact bounded private regular file")
    return info


def _remove_created(path: Path, identity) -> None:
    # Never remove an existing/user file or a replacement at our original path.
    try:
        info = path.lstat()
    except FileNotFoundError:
        return
    if (info.st_dev, info.st_ino) == (identity.st_dev, identity.st_ino):
        path.unlink()


class _FileLimit(ValueError):
    pass


def _write_line(handle: BinaryIO, value: Any, byte_count: int) -> tuple[bytes, int]:
    raw = _json(value)
    if len(raw) + 1 > MAX_LINE_BYTES or byte_count + len(raw) + 1 > MAX_BYTES:
        raise _FileLimit("IS qualification witness exceeds its bounded line/file size")
    handle.write(raw + b"\n")
    return raw, byte_count + len(raw) + 1


def _float_repr(value: Any) -> bool:
    if not isinstance(value, str) or not 1 <= len(value) <= 96:
        return False
    try:
        number = float(value)
    except ValueError:
        return False
    return number == number and abs(number) != float("inf") and repr(number) == value


def _row(row: Any, *, symbols: int, start: int, end: int, previous: int | None) -> int:
    if not isinstance(row, list) or len(row) != 5 or not _utc_ms(row[0]) \
            or not start <= row[0] < end or previous is not None and row[0] <= previous \
            or not isinstance(row[3], list) or len(row[3]) != symbols \
            or not all(_float_repr(value) for value in [row[1], row[2], *row[3], row[4]]) \
            or float(row[1]) <= 0 or float(row[4]) <= 0:
        raise ValueError("IS qualification row is not exact finite IS-only source chronology")
    return row[0]


def capture_is_qualification(*, result: Any, market_close: Any, output_directory: Path,
        source_windows: Any, binding: Any, benchmark_locator: str,
        mode: str = "FIXED", sampled: bool = False) -> dict[str, Any]:
    """Return bounded private metadata; opt-in and public exclusion belong to caller."""
    import numpy as np
    import pandas as pd

    binding, windows = _binding(binding), _windows(source_windows)
    absent = lambda reason: _absent(reason, binding=binding, windows=windows)
    if type(sampled) is not bool:
        raise ValueError("IS qualification sampled discriminator must be an exact boolean")
    if sampled:
        return absent("IS_QUALIFICATION_SAMPLED_SOURCE")
    if mode != "FIXED":
        return absent("IS_QUALIFICATION_NOT_FIXED")
    if set(windows) != {"is", "oos", "holdout"}:
        return absent("IS_QUALIFICATION_DECLARED_WINDOWS_UNAVAILABLE")
    if not _locator(benchmark_locator):
        raise ValueError("IS qualification must bind the exact source enrichment benchmark locator")
    if not isinstance(result, _engine_result_types()):
        return absent("IS_QUALIFICATION_SOURCE_UNAVAILABLE")
    if result.metadata.get("walk_forward"):
        return absent("IS_QUALIFICATION_NOT_FIXED")
    index = result.equity.index
    if not isinstance(index, pd.DatetimeIndex) or index.tz is None or index.hasnans:
        return absent("IS_QUALIFICATION_SOURCE_INVALID")
    start, end = windows["is"]["start_ms"], windows["is"]["end_ms"]
    # Refuse actual source exposure; filtering later must never hide holdout.
    if len(index) and int(index.max().value // 1_000_000) >= windows["oos"]["end_ms"]:
        raise ValueError("IS qualification source contains holdout/out-of-window observations")
    if not index.is_unique or not index.is_monotonic_increasing \
            or any(not getattr(result, key).index.equals(index) for key in ("returns", "positions", "closes")):
        return absent("IS_QUALIFICATION_SOURCE_INVALID")
    selected = index[(index >= pd.Timestamp(start, unit="ms", tz="UTC"))
        & (index < pd.Timestamp(end, unit="ms", tz="UTC"))]
    if len(selected) > MAX_ROWS:
        return absent("IS_QUALIFICATION_ROW_LIMIT_EXCEEDED")
    if len(selected) < 2:
        return absent("IS_QUALIFICATION_SOURCE_UNAVAILABLE")
    if any(at.value % 1_000_000 for at in selected):
        return absent("IS_QUALIFICATION_SOURCE_INVALID")
    if not isinstance(market_close, pd.Series) or not market_close.index.equals(index):
        return absent("IS_QUALIFICATION_MARKET_CLOSE_UNAVAILABLE")
    symbols = list(result.symbols)
    if len(symbols) != 1 or not isinstance(symbols[0], str) or not _SYMBOL.fullmatch(symbols[0]) \
            or list(result.positions.columns) != ["Position_" + symbols[0]] \
            or list(result.closes.columns) != ["Close_" + symbols[0]]:
        return absent("IS_QUALIFICATION_SOURCE_INVALID")
    try:
        close = market_close.loc[selected].to_numpy(dtype=float)
        consumed_close = result.closes.loc[selected, "Close_" + symbols[0]].to_numpy(dtype=float)
    except (ValueError, TypeError, OverflowError):
        return absent("IS_QUALIFICATION_MARKET_CLOSE_UNAVAILABLE")
    if not np.isfinite(close).all() or np.any(close <= 0):
        return absent("IS_QUALIFICATION_MARKET_CLOSE_UNAVAILABLE")
    if not np.array_equal(consumed_close, close):
        raise ValueError("IS qualification source close disagrees with actual consumed engine close")
    try:
        scoped = declared_is_scoped_result(result, start_utc_ms=start, end_exclusive_utc_ms=end)
    except ValueError:
        return absent("IS_QUALIFICATION_SOURCE_INVALID")
    if not scoped.equity.index.equals(selected):
        raise ValueError("IS qualification declared scope disagrees with actual engine source")
    observation_header = {"definition": IS_DEFINITION,
        "bounds": {**windows["is"], "bounds_semantics": "START_INCLUSIVE_END_EXCLUSIVE"},
        "symbols": list(scoped.symbols), "position_columns": list(scoped.positions.columns),
        "benchmark_locator": benchmark_locator}
    header = {"schema_version": HEADER_SCHEMA, "binding": binding,
        "source_windows": windows, "observation_header": observation_header}
    path = Path(output_directory) / FILE_NAME
    fd = _open(path, create=True)
    identity = os.fstat(fd)
    file_hash, rows_hash = hashlib.sha256(), hashlib.sha256(b"[")
    observation_hash = hashlib.sha256(_json(observation_header))
    byte_count, previous, first = 0, None, None
    try:
        with os.fdopen(fd, "wb") as handle:
            raw, byte_count = _write_line(handle, header, byte_count)
            file_hash.update(raw + b"\n")
            for ordinal, (at, equity, returns, positions, price) in enumerate(zip(scoped.equity.index, scoped.equity,
                    scoped.returns, scoped.positions.to_numpy(dtype=float), close, strict=True)):
                row = [int(at.value // 1_000_000), repr(float(equity)), repr(float(returns)),
                    [repr(float(value)) for value in np.atleast_1d(positions)], repr(float(price))]
                previous = _row(row, symbols=len(symbols), start=start, end=end, previous=previous)
                first = previous if first is None else first
                raw, byte_count = _write_line(handle, row, byte_count)
                file_hash.update(raw + b"\n"); observation_hash.update(raw)
                if ordinal:
                    rows_hash.update(b",")
                rows_hash.update(raw)
            handle.flush(); os.fsync(handle.fileno())
        rows_hash.update(b"]")
        source = {"schema_version": SOURCE_SCHEMA, "state": "AVAILABLE", "reason_code": None,
            "binding_sha256": _sha(binding), "file_name": FILE_NAME, "file_sha256": file_hash.hexdigest(),
            "byte_count": byte_count, "normalized_rows_sha256": rows_hash.hexdigest(),
            "observation_is_digest": observation_hash.hexdigest(), "row_count": len(selected),
            "is_start_utc_ms": start, "is_end_exclusive_utc_ms": end,
            "first_observed_utc_ms": first, "last_observed_utc_ms": previous}
        validate_is_qualification_metadata(source)
        verify_is_qualification_file(path, source, binding=binding, source_windows=windows)
        return source
    except BaseException as exc:
        _remove_created(path, identity)
        if isinstance(exc, _FileLimit):
            return absent("IS_QUALIFICATION_FILE_LIMIT_EXCEEDED")
        raise


def _read_line(handle: BinaryIO) -> tuple[Any, bytes]:
    raw = handle.readline(MAX_LINE_BYTES + 1)
    if not raw:
        return None, b""
    if len(raw) > MAX_LINE_BYTES or not raw.endswith(b"\n"):
        raise ValueError("IS qualification line is truncated or exceeds its byte bound")
    try:
        value = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise ValueError("IS qualification line is not bounded canonical JSON") from exc
    if _json(value) + b"\n" != raw:
        raise ValueError("IS qualification line is not exact canonical source JSON")
    return value, raw


def _verify_handle(handle: BinaryIO, source: dict[str, Any], *, binding: Any, source_windows: Any) -> None:
    binding, windows = _binding(binding), _windows(source_windows)
    validate_is_qualification_metadata(source)
    if source["state"] != "AVAILABLE" or set(windows) != {"is", "oos", "holdout"} \
            or source["binding_sha256"] != _sha(binding) \
            or source["is_start_utc_ms"] != windows["is"]["start_ms"] \
            or source["is_end_exclusive_utc_ms"] != windows["is"]["end_ms"]:
        raise ValueError("IS qualification metadata differs from the expected private attempt/windows")
    before = _file_info(handle, source)
    header, raw = _read_line(handle)
    if not isinstance(header, dict) or set(header) != {"schema_version", "binding", "source_windows", "observation_header"} \
            or header["schema_version"] != HEADER_SCHEMA or header["binding"] != binding or header["source_windows"] != windows:
        raise ValueError("IS qualification header binding/schema is incompatible")
    observation = header["observation_header"]
    if not isinstance(observation, dict) or set(observation) != {"definition", "bounds", "symbols", "position_columns", "benchmark_locator"} \
            or observation["definition"] != IS_DEFINITION \
            or observation["bounds"] != {**windows["is"], "bounds_semantics": "START_INCLUSIVE_END_EXCLUSIVE"} \
            or not _locator(observation["benchmark_locator"]):
        raise ValueError("IS qualification observation hash header is incompatible")
    symbols = observation["symbols"]
    if not isinstance(symbols, list) or len(symbols) != 1 or not isinstance(symbols[0], str) \
            or not _SYMBOL.fullmatch(symbols[0]) or observation["position_columns"] != ["Position_" + symbols[0]]:
        raise ValueError("IS qualification native symbol/position header is incompatible")
    file_hash, rows_hash = hashlib.sha256(raw), hashlib.sha256(b"[")
    observation_hash = hashlib.sha256(_json(observation))
    count, size, first, previous = 0, len(raw), None, None
    while True:
        row, raw = _read_line(handle)
        if not raw:
            break
        if count >= source["row_count"] or size + len(raw) > MAX_BYTES:
            raise ValueError("IS qualification rows exceed the exact metadata budget")
        previous = _row(row, symbols=len(symbols), start=source["is_start_utc_ms"], end=source["is_end_exclusive_utc_ms"], previous=previous)
        first = previous if first is None else first
        file_hash.update(raw); observation_hash.update(raw[:-1])
        if count:
            rows_hash.update(b",")
        rows_hash.update(raw[:-1]); count += 1; size += len(raw)
    rows_hash.update(b"]")
    after = _file_info(handle, source)
    if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_size, after.st_mtime_ns, after.st_ctime_ns) \
            or size != source["byte_count"] or count != source["row_count"] \
            or first != source["first_observed_utc_ms"] or previous != source["last_observed_utc_ms"] \
            or file_hash.hexdigest() != source["file_sha256"] \
            or rows_hash.hexdigest() != source["normalized_rows_sha256"] \
            or observation_hash.hexdigest() != source["observation_is_digest"]:
        raise ValueError("IS qualification file-byte/row/OBSERVATION_IS custody mismatch")


def verify_is_qualification_file(path: Path, source: dict[str, Any], *, binding: Any, source_windows: Any) -> None:
    """Verify bounded canonical bytes against external immutable expected identity."""
    with os.fdopen(_open(Path(path)), "rb") as handle:
        _verify_handle(handle, source, binding=binding, source_windows=source_windows)


def copy_is_qualification_file(source_path: Path, destination: Path, source: dict[str, Any],
        *, binding: Any, source_windows: Any) -> None:
    """Copy verified exact bytes only to a private caller-owned directory."""
    destination = Path(destination)
    with os.fdopen(_open(Path(source_path)), "rb") as incoming:
        _verify_handle(incoming, source, binding=binding, source_windows=source_windows)
        incoming.seek(0)
        fd = _open(destination, create=True)
        identity = os.fstat(fd)
        try:
            digest, size = hashlib.sha256(), 0
            with os.fdopen(fd, "wb") as outgoing:
                while chunk := incoming.read(COPY_BYTES):
                    size += len(chunk)
                    if size > source["byte_count"]:
                        raise ValueError("IS qualification source changed during exact copy")
                    outgoing.write(chunk); digest.update(chunk)
                outgoing.flush(); os.fsync(outgoing.fileno())
            if size != source["byte_count"] or digest.hexdigest() != source["file_sha256"]:
                raise ValueError("IS qualification source changed during exact copy")
            verify_is_qualification_file(destination, source, binding=binding, source_windows=source_windows)
        except BaseException:
            _remove_created(destination, identity)
            raise
