"""Bounded full lifecycle custody beside, never inside, the original P05 seal.

Only the admitted parent exporter calls this while source Parquet still exists.
Rows are source lifecycle observations, not an execution/generation-clock claim.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

import pyarrow.parquet as pq

MAX_SOURCE_ROWS = 20_000
MAX_SOURCE_BYTES = 16 * 1024 * 1024
MAX_ROW_BYTES = 4096
BATCH_ROWS = 200


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode()


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def source_file_digest(path: Path) -> str:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_SOURCE_BYTES:
        raise ValueError("CHILD_AUDIT_SOURCE_BYTES_EXCEED_BOUND")
    if pq.ParquetFile(path).metadata.num_rows > MAX_SOURCE_ROWS:
        raise ValueError("CHILD_AUDIT_SOURCE_ROWS_EXCEED_BOUND")
    return hashlib.sha256(path.read_bytes()).hexdigest()


@dataclass(frozen=True, slots=True)
class ChildAuditCompanionCapture:
    rows: tuple[Mapping[str, Any], ...]
    source_file_digest: str
    source_contract_digest: str
    records_dropped_by_source: int | None
    policy: str | None

    def __post_init__(self) -> None:
        if len(self.rows) > MAX_SOURCE_ROWS:
            raise ValueError("CHILD_AUDIT_SOURCE_ROWS_EXCEED_BOUND")
        for ordinal, row in enumerate(self.rows):
            if row.get("audit_ordinal") != ordinal or len(canonical_bytes(row)) > MAX_ROW_BYTES:
                raise ValueError("CHILD_AUDIT_SOURCE_ROW_INVALID")
        dropped = self.records_dropped_by_source
        if dropped is not None and (type(dropped) is not int or not 0 <= dropped <= 2_000_000):
            raise ValueError("CHILD_AUDIT_SOURCE_DROP_COUNT_INVALID")

    def bind(self, binding: Mapping[str, Any]) -> dict[str, Any]:
        fingerprints = {row["run_fingerprint"] for row in self.rows if row.get("run_fingerprint") is not None}
        return {"schema_version": "research.child-audit-companion-manifest.v1", **binding,
            "source_file_digest": self.source_file_digest, "source_contract_digest": self.source_contract_digest,
            "rows_digest": digest(list(self.rows)), "source_record_count": len(self.rows),
            "records_dropped_by_source": self.records_dropped_by_source,
            "source_total_count": None if self.records_dropped_by_source is None else len(self.rows) + self.records_dropped_by_source,
            "source_run_fingerprint": next(iter(fingerprints)) if len(fingerprints) == 1 else None,
            "policy": self.policy, "authority": "SOURCE_LIFECYCLE_OBSERVATIONS_NOT_GENERATION_CLOCK"}

    def batches(self):
        for start in range(0, len(self.rows), BATCH_ROWS):
            rows = list(self.rows[start:start + BATCH_ROWS])
            yield {"batch_ordinal": start // BATCH_ROWS, "batch_digest": digest(rows), "rows": rows}
