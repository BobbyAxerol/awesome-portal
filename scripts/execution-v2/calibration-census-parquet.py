#!/usr/bin/env python3
"""Bounded offline P05 manifest/Parquet custody, no calculator or authority.

Called by calibration-census.mjs with explicit stdin only. Requires the already
installed pyarrow from the approved QuantBT adapter environment; no installation,
network, DB, pickle, fixture generation or source writes. Every manifest part and
document is hashed before actual observation values are streamed in small batches.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import sys
from contextlib import contextmanager
from datetime import datetime
from decimal import Decimal
from pathlib import Path


def require(condition, code):
    if not condition:
        raise ValueError(code)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()


def extract(payload):
    import pyarrow.parquet as pq

    limits = payload["limits"]
    root = Path(payload["root"])
    require(root.is_absolute() and root != Path("/") and root.is_dir() and root.resolve() == root, "CENSUS_ROOT_INVALID")
    seen, result, total_bytes, total_rows, total_parts = set(), [], 0, 0, 0
    total_decoded_bytes = 0

    @contextmanager
    def read_verified(relative, expected_hash, expected_bytes, maximum):
        nonlocal total_bytes
        require(isinstance(relative, str) and "\\" not in relative
                and all(part not in {"", ".", ".."} for part in relative.split("/"))
                and not relative.startswith("/"), "CENSUS_CUSTODY_PATH_INVALID")
        current = root
        for part in relative.split("/"):
            current /= part
            require(not current.is_symlink(), "CENSUS_SYMLINK_FORBIDDEN")
        require(current.resolve().is_relative_to(root), "CENSUS_CUSTODY_PATH_ESCAPE")
        require(type(expected_bytes) is int and 0 < expected_bytes <= maximum,
                "CENSUS_SOURCE_BYTE_LIMIT")
        parent_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            parts = relative.split("/")
            for part in parts[:-1]:
                child_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
                os.close(parent_fd)
                parent_fd = child_fd
            fd = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent_fd)
        finally:
            os.close(parent_fd)
        stream = os.fdopen(fd, "rb")
        info = os.fstat(stream.fileno())
        key = (info.st_dev, info.st_ino)
        require(stat.S_ISREG(info.st_mode) and info.st_size == expected_bytes,
                "CENSUS_SOURCE_SIZE_MISMATCH")
        require(key not in seen, "CENSUS_CUSTODY_FILE_ALIAS")
        seen.add(key)
        total_bytes += info.st_size
        require(total_bytes <= limits["total_source_bytes"], "CENSUS_TOTAL_SOURCE_BYTE_LIMIT")
        hashed = hashlib.sha256()
        read_bytes = 0
        while chunk := stream.read(65_536):
            read_bytes += len(chunk)
            require(read_bytes <= expected_bytes, "CENSUS_SOURCE_CHANGED")
            hashed.update(chunk)
        require("sha256:" + hashed.hexdigest() == expected_hash, "CENSUS_SOURCE_HASH_MISMATCH")
        after = os.fstat(stream.fileno())
        require(read_bytes == info.st_size and after.st_size == info.st_size
                and after.st_mtime_ns == info.st_mtime_ns and after.st_ctime_ns == info.st_ctime_ns,
                "CENSUS_SOURCE_CHANGED")
        stream.seek(0)
        try:
            yield stream
            after = os.fstat(stream.fileno())
            require(after.st_size == info.st_size and after.st_mtime_ns == info.st_mtime_ns
                    and after.st_ctime_ns == info.st_ctime_ns, "CENSUS_SOURCE_CHANGED")
        finally:
            stream.close()

    decimal_pattern = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?\Z")

    def exact(value, positive=False, return_value=False):
        require(isinstance(value, str) and len(value) <= 512 and decimal_pattern.fullmatch(value),
                "CENSUS_OBSERVATION_DECIMAL_INVALID")
        number = Decimal(value)
        require(number.is_finite() and (not positive or number > 0)
                and (not return_value or number > -1), "CENSUS_OBSERVATION_DECIMAL_INVALID")

    for run in payload["inventory"]["runs"]:
        for item in run["artifacts"]:
            pin = item["manifest"]
            with read_verified(pin["path"], pin["sha256"], pin["bytes"], limits["manifest_bytes"]) as stream:
                manifest = json.loads(stream.read().decode("utf-8"))
            require(manifest["schema_version"] == "research.artifact-manifest.v1"
                    and manifest["workspace_id"] == payload["inventory"]["scope"]["workspace_id"]
                    and manifest["run_id"] == run["run_id"] and manifest["artifact_id"] == item["artifact_id"]
                    and manifest["artifact_revision"] == item["artifact_revision"], "CENSUS_MANIFEST_BINDING_MISMATCH")
            completed = datetime.fromisoformat(manifest["completed_at"].replace("Z", "+00:00"))
            require(completed.tzinfo is not None and int(completed.timestamp() * 1000) <= payload["inventory"]["cutoff_ms"],
                    "CENSUS_SOURCE_NOT_AVAILABLE_AT_CUTOFF")
            require(Path(pin["path"]).parent.name == item["artifact_id"], "CENSUS_MANIFEST_DIRECTORY_MISMATCH")
            tables = manifest["tables"]
            require(isinstance(tables, list) and 0 < len(tables) <= 64
                    and len({table["table_kind"] for table in tables}) == len(tables), "CENSUS_TABLES_INVALID")
            observation = next((t for t in tables if t["table_kind"] == "observations"), None)
            require(observation is not None and observation["rows"] == item["expected_rows"]
                    and observation["sequence_column"] == "source_ordinal"
                    and observation["schema_version"] in {"research.current-source-observations.v1",
                                                          "research.current-source-observations.v2"},
                    "CENSUS_OBSERVATION_TABLE_INVALID")
            base = Path(pin["path"]).parent
            ordinal, previous_stamp, window_rows, first_stamp, last_stamp = 0, None, 0, None, None
            value_hash, manifest_rows, manifest_bytes = hashlib.sha256(), 0, 0
            for table in tables:
                parts = table["parts"]
                require(isinstance(parts, list) and 0 < len(parts) <= limits["parts"], "CENSUS_PARTS_INVALID")
                table_rows, table_bytes = 0, 0
                for index, part in enumerate(parts):
                    total_parts += 1
                    require(total_parts <= limits["parts"] and type(part["part_ordinal"]) is int
                            and part["part_ordinal"] == index + 1
                            and part["table_kind"] == table["table_kind"], "CENSUS_PART_SEQUENCE_INVALID")
                    require(type(part["rows"]) is int and 0 < part["rows"] <= limits["rows"], "CENSUS_PART_ROWS_INVALID")
                    # Validate the original relative value before Path can normalize it.
                    relative = part["relative_path"]
                    require(isinstance(relative, str) and not relative.startswith("/") and "\\" not in relative
                            and all(p not in {"", ".", ".."} for p in relative.split("/")), "CENSUS_CUSTODY_PATH_INVALID")
                    with read_verified(str(base / relative), "sha256:" + part["sha256"],
                                       part["bytes"], limits["part_bytes"]) as stream:
                        parquet = pq.ParquetFile(stream, thrift_string_size_limit=1_048_576,
                                                 thrift_container_size_limit=65_536)
                        require(parquet.metadata.num_rows == part["rows"], "CENSUS_PARQUET_COUNT_MISMATCH")
                        require(0 < parquet.metadata.num_row_groups <= 1024 and parquet.metadata.num_columns <= 64,
                                "CENSUS_PARQUET_DECOMPRESSED_BYTE_LIMIT")
                        total_decoded_bytes += sum(parquet.metadata.row_group(i).total_byte_size
                                                   for i in range(parquet.metadata.num_row_groups))
                        require(0 < parquet.metadata.num_row_groups <= 1024 and parquet.metadata.num_columns <= 64
                                and total_decoded_bytes <= limits["total_source_bytes"]
                                and sum(parquet.metadata.row_group(i).total_byte_size
                                        for i in range(parquet.metadata.num_row_groups)) <= limits["part_bytes"]
                                and all(parquet.metadata.row_group(i).total_byte_size <= 16_777_216
                                        for i in range(parquet.metadata.num_row_groups)),
                                "CENSUS_PARQUET_DECOMPRESSED_BYTE_LIMIT")
                        if table is observation:
                            require(type(part["sequence_min"]) is int and type(part["sequence_max"]) is int
                                    and part["sequence_min"] == ordinal and part["sequence_max"] == ordinal + part["rows"] - 1,
                                    "CENSUS_PART_ORDINAL_MISMATCH")
                            required = ["source_ordinal", "at_utc_ms", "equity", "return_fraction"]
                            require(len(set(parquet.schema_arrow.names)) == len(parquet.schema_arrow.names)
                                    and set(required).issubset(parquet.schema_arrow.names), "CENSUS_OBSERVATION_COLUMNS_MISSING")
                            for batch in parquet.iter_batches(batch_size=64, columns=required, use_threads=False):
                                for row in batch.to_pylist():
                                    stamp = row["at_utc_ms"]
                                    require(type(row["source_ordinal"]) is int and row["source_ordinal"] == ordinal,
                                            "CENSUS_OBSERVATION_ORDINAL_MISMATCH")
                                    require(type(stamp) is int and 0 <= stamp <= 9_007_199_254_740_991
                                            and stamp <= payload["inventory"]["cutoff_ms"]
                                            and (previous_stamp is None or stamp > previous_stamp),
                                            "CENSUS_OBSERVATION_TIME_INVALID")
                                    exact(row["equity"], positive=True)
                                    exact(row["return_fraction"], return_value=True)
                                    value_hash.update(canonical(row) + b"\n")
                                    if item["window"]["start_ms"] <= stamp < item["window"]["end_ms"]:
                                        first_stamp = stamp if first_stamp is None else first_stamp
                                        last_stamp, window_rows = stamp, window_rows + 1
                                    previous_stamp, ordinal = stamp, ordinal + 1
                    table_rows += part["rows"]
                    table_bytes += part["bytes"]
                    total_rows += part["rows"]
                    require(total_rows <= limits["rows"], "CENSUS_TOTAL_ROWS_LIMIT")
                require(table_rows == table["rows"] and table_bytes == table["bytes"], "CENSUS_TABLE_TOTAL_MISMATCH")
                manifest_rows += table_rows
                manifest_bytes += table_bytes
            documents = manifest.get("documents", [])
            require(isinstance(documents, list) and len(documents) <= 64
                    and len({d["name"] for d in documents}) == len(documents), "CENSUS_DOCUMENTS_INVALID")
            for document in documents:
                relative = document["relative_path"]
                require(isinstance(relative, str) and not relative.startswith("/") and "\\" not in relative
                        and all(p not in {"", ".", ".."} for p in relative.split("/")), "CENSUS_CUSTODY_PATH_INVALID")
                with read_verified(str(base / relative), "sha256:" + document["sha256"], document["bytes"],
                                   limits["part_bytes"]):
                    pass
                manifest_bytes += document["bytes"]
            require(manifest_rows == manifest["totals"]["rows"] and manifest_bytes == manifest["totals"]["bytes"],
                    "CENSUS_MANIFEST_TOTAL_MISMATCH")
            require(ordinal == item["expected_rows"] and window_rows == item["window"]["expected_observations"],
                    "CENSUS_WINDOW_COUNT_MISMATCH")
            result.append({"run_id": run["run_id"], "artifact_id": item["artifact_id"],
                "artifact_revision": item["artifact_revision"], "manifest_sha256": pin["sha256"],
                "rows": ordinal, "first_ordinal": 0, "last_ordinal": ordinal - 1, "window_rows": window_rows,
                "first_at_ms": first_stamp, "last_at_ms": last_stamp,
                "observation_values_sha256": "sha256:" + value_hash.hexdigest()})
    return {"schema_version": "portal.elp2-10.parquet-census.v1", "artifacts": result,
            "verified_source_bytes": total_bytes,
            "custody_root": str(root),
            "inventory_content_sha256": "sha256:" + hashlib.sha256(canonical(payload["inventory"])).hexdigest(),
            "extractor_sha256": "sha256:" + hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}


if __name__ == "__main__":
    try:
        data = sys.stdin.buffer.read(1_048_577)
        require(len(data) <= 1_048_576, "CENSUS_INVENTORY_BYTE_LIMIT")
        print(json.dumps(extract(json.loads(data)), sort_keys=True, separators=(",", ":")))
    except ImportError:
        print("CENSUS_EXISTING_PYARROW_ENVIRONMENT_REQUIRED", file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        code = str(error)
        print(code if re.fullmatch(r"[A-Z][A-Z0-9_]{2,127}", code) else "CENSUS_PARQUET_CUSTODY_INVALID", file=sys.stderr)
        sys.exit(1)
