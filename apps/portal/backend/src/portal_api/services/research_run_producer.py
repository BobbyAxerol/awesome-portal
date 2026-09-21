"""P10's bounded Portal-side executor for the one installed Delta adapter.

The Control API owns browser admission, PostgreSQL intent identity and the
private signed hop.  This service owns none of those things.  It receives an
already-validated opaque P10 request from the durable worker, verifies the
immutable P08 snapshot identity again, creates a short-lived IS+OOS-only tape,
then invokes the existing P06 isolated child.

In particular this is *not* a generic strategy launcher: an imported Alpha
source never becomes executable merely because it is ACTIVE.  P10 supports the
single server-installed ``p04.delta-rsi.v1`` qualification adapter only.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from pydantic import ValidationError

from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.serialization import canonicalize
from portal_api.services.data_catalog import DataCatalogError, SnapshotStore
from portal_api.services.research_supervisor import (
    IsolatedResearchSupervisor,
    ResearchChildReceipt,
    ResearchSupervisorError,
)


class ResearchRunProducerError(RuntimeError):
    """A bounded producer failure, safe for the durable worker to classify."""


def _utc_timestamp(value: object, *, label: str) -> pd.Timestamp:
    try:
        timestamp = pd.Timestamp(value)
    except (TypeError, ValueError) as exc:
        raise ResearchRunProducerError(f"P10 {label} is invalid") from exc
    if timestamp.tzinfo is None:
        timestamp = timestamp.tz_localize("UTC")
    return timestamp.tz_convert("UTC")


def _sha256_file(path: Path) -> str:
    """Hash a sealed snapshot without materialising it in worker memory."""

    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                digest.update(chunk)
    except OSError as exc:
        raise ResearchRunProducerError("P10 immutable preflight snapshot is unavailable") from exc
    return digest.hexdigest()


def _timestamp_index_column(schema: pa.Schema) -> str:
    """Resolve the one Pandas index field from a sealed SnapshotStore parquet.

    P08 snapshots are written by :class:`SnapshotStore` with an explicit
    Pandas DatetimeIndex.  We deliberately read that metadata rather than
    guessing a user-controlled column name, and refuse a different layout
    rather than widening the child input surface.
    """

    raw_metadata = schema.metadata or {}
    raw_pandas = raw_metadata.get(b"pandas")
    if raw_pandas is None:
        raise ResearchRunProducerError("P10 immutable snapshot omits its Pandas index metadata")
    try:
        metadata = json.loads(raw_pandas.decode("utf-8"))
        fields = metadata["index_columns"]
    except (UnicodeDecodeError, KeyError, TypeError, ValueError) as exc:
        raise ResearchRunProducerError("P10 immutable snapshot has invalid Pandas index metadata") from exc
    if not isinstance(fields, list) or len(fields) != 1 or not isinstance(fields[0], str):
        raise ResearchRunProducerError("P10 immutable snapshot must have one timestamp index")
    name = fields[0]
    if name not in schema.names:
        raise ResearchRunProducerError("P10 immutable snapshot index is not present in its frame")
    if not pa.types.is_timestamp(schema.field(name).type):
        raise ResearchRunProducerError("P10 immutable snapshot index is not a timestamp")
    return name


@dataclass(frozen=True, slots=True)
class ResearchRunProducerExecutor:
    """Execute exactly one P10 Delta qualification under P06 confinement."""

    snapshots: SnapshotStore
    supervisor: IsolatedResearchSupervisor
    market_root: Path

    async def __call__(
        self,
        request_json: dict[str, Any],
        run_id: str,
        artifact_root: Path,
    ) -> dict[str, Any]:
        try:
            request = ResearchRunProducerRequest.model_validate(request_json)
        except ValidationError as exc:
            raise ResearchRunProducerError("P10 durable request no longer satisfies its private contract") from exc
        if request.run_id != run_id:
            raise ResearchRunProducerError("P10 durable run identity does not match its worker envelope")
        return await asyncio.to_thread(self._execute_sync, request, artifact_root)

    def _execute_sync(
        self,
        request: ResearchRunProducerRequest,
        artifact_root: Path,
    ) -> dict[str, Any]:
        research = request.research
        try:
            identity, _ = self.snapshots.describe(research.snapshot_id)
        except DataCatalogError as exc:
            raise ResearchRunProducerError("P10 immutable preflight snapshot is unavailable") from exc
        if identity.content_hash != research.snapshot_content_hash:
            raise ResearchRunProducerError("P10 immutable preflight snapshot hash no longer matches")
        frame_path = self.snapshots.snapshot_path(research.snapshot_id) / "frame.parquet"
        # `SnapshotStore.open()` is intentionally convenient for small API
        # reads, but a P10 worker must not copy a potentially 512 MiB P08
        # snapshot only to discard the sealed holdout.  Verify the raw sealed
        # bytes once, then stream bounded record batches into a derived tape.
        if _sha256_file(frame_path) != identity.content_hash:
            raise ResearchRunProducerError("P10 immutable preflight snapshot bytes no longer match")

        windows = research.requested_spec["windows"]
        assert isinstance(windows, dict)  # enforced by the private DTO
        is_window = windows["is"]
        oos_window = windows["oos"]
        assert isinstance(is_window, dict) and isinstance(oos_window, dict)
        is_start = _utc_timestamp(is_window.get("start"), label="IS start")
        oos_end = _utc_timestamp(oos_window.get("end_exclusive"), label="OOS end")
        if is_start >= oos_end:
            raise ResearchRunProducerError("P10 IS/OOS boundary is invalid")

        job_directory = self.market_root / request.job_id / request.worker_attempt_id
        tape_path = job_directory / "is_oos_only.parquet"
        if job_directory.exists():
            # A redelivery may see a stale partial temporary directory after a
            # killed worker.  It contains no accepted artifact; clear exactly
            # this validated job/lease path before rebuilding its tape.
            shutil.rmtree(job_directory)
        job_directory.mkdir(mode=0o700, parents=True)
        try:
            row_count = self._write_is_oos_tape(
                frame_path=frame_path,
                tape_path=tape_path,
                oos_end=oos_end,
            )
            # P08 already verified the requested warmup policy.  A valid
            # zero-warmup snapshot can begin exactly at IS start, so requiring
            # a row strictly before that boundary here would reject a truthful
            # P08 manifest.  The producer's own invariant is narrower: enough
            # IS/OOS rows to run the fixed adapter, and no row at/after OOS
            # end (the sealed holdout boundary).
            if row_count < 2:
                raise ResearchRunProducerError("P10 immutable snapshot cannot form a bounded IS/OOS tape")
            os.chmod(tape_path, 0o600)
            receipt = ResearchChildReceipt(
                job_id=request.job_id,
                run_id=request.run_id,
                worker_attempt_id=request.worker_attempt_id,
                lease_epoch=request.lease_epoch,
                market_path=tape_path,
                artifact_root=artifact_root,
                p04_parameters=dict(research.p04_parameters),
            )
            child = self.supervisor.run_p04_delta_qualification(receipt)
        except ResearchSupervisorError as exc:
            raise ResearchRunProducerError("P10 isolated Delta qualification failed") from exc
        finally:
            # This tape is a short-lived derived work input, not a second
            # historical store. Its stable identity is the P08 digest retained
            # by Control API; source rows never remain under worker scratch.
            if job_directory.exists():
                shutil.rmtree(job_directory)

        engine_directory = artifact_root / request.run_id
        engine_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        (engine_directory / "config").mkdir(mode=0o700, exist_ok=True)
        (engine_directory / "research").mkdir(mode=0o700, exist_ok=True)
        # Artifacts are later read through named, authorized BFFs.  They are
        # not a private worker-envelope store: keep user-reviewable requested
        # values and immutable public digests, but never persist the opaque
        # preflight capability, worker/job/lease fence, snapshot locator/hash
        # or work digest where a future artifact reader could expose them.
        public_config = {
            "schema_version": "research.p10.run-config.v1",
            "run_id": request.run_id,
            "alpha_id": research.alpha_id,
            "alpha_version_id": research.alpha_version_id,
            "execution_adapter_id": research.execution_adapter_id,
            "requested_spec": research.requested_spec,
            "requested_spec_digest": research.requested_spec_digest,
            "effective_spec_digest": research.effective_spec_digest,
            "dataset_binding_digest": research.dataset_binding_digest,
            "manifest_digest": research.manifest_digest,
            "p04_parameters": research.p04_parameters,
            "input_scope": "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
        }
        request_path = engine_directory / "config" / "request.json"
        request_path.write_text(
            json.dumps(canonicalize(public_config), sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        os.chmod(request_path, 0o600)
        receipt_document = {
            "schema_version": "research.p10.delta-qualification-receipt.v1",
            "run_id": request.run_id,
            "execution_adapter_id": research.execution_adapter_id,
            "requested_spec_digest": research.requested_spec_digest,
            "effective_spec_digest": research.effective_spec_digest,
            "dataset_binding_digest": research.dataset_binding_digest,
            "manifest_digest": research.manifest_digest,
            "p04_parameters": research.p04_parameters,
            "input_scope": "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
            "holdout_rows_exposed_to_child": 0,
            "engine": {
                "version": child.engine_version,
                "final_equity": child.final_equity,
                "num_trades": child.num_trades,
                "bars": child.bars,
            },
            "resource": {
                "elapsed_seconds": child.elapsed_seconds,
                "peak_rss_bytes": child.peak_rss_bytes,
                "cpu_seconds": child.cpu_seconds,
                "enforced_limits": child.enforced_limits,
            },
        }
        receipt_path = engine_directory / "research" / "p10-receipt.json"
        receipt_path.write_text(
            json.dumps(canonicalize(receipt_document), sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        os.chmod(receipt_path, 0o600)
        return {
            "status": "COMPLETED",
            "research_receipt": receipt_document,
        }

    @staticmethod
    def _write_is_oos_tape(
        *,
        frame_path: Path,
        tape_path: Path,
        oos_end: pd.Timestamp,
    ) -> int:
        """Write a bounded P08 warmup+IS+OOS tape without reading holdout.

        `iter_batches` caps the in-memory frame slice at 65,536 records.  The
        output has the same Pandas index metadata as the source so the already
        audited P04 child can read it normally, while every row at or after
        the OOS end (including sealed Holdout) is structurally absent.
        """

        try:
            parquet = pq.ParquetFile(frame_path)
            index_column = _timestamp_index_column(parquet.schema_arrow)
        except (OSError, pa.ArrowException) as exc:
            raise ResearchRunProducerError("P10 immutable snapshot Parquet is unreadable") from exc

        temporary = tape_path.with_suffix(".partial")
        writer: pq.ParquetWriter | None = None
        row_count = 0
        try:
            for batch in parquet.iter_batches(batch_size=65_536):
                table = pa.Table.from_batches([batch])
                timestamps = pd.DatetimeIndex(
                    pd.to_datetime(table.column(index_column).to_pandas(), utc=True)
                )
                mask = timestamps < oos_end
                if not bool(mask.any()):
                    continue
                filtered = table.filter(pa.array(mask.tolist(), type=pa.bool_()))
                if writer is None:
                    writer = pq.ParquetWriter(temporary, filtered.schema, compression="snappy")
                writer.write_table(filtered)
                row_count += filtered.num_rows
            if writer is None:
                raise ResearchRunProducerError("P10 immutable snapshot has no allowed IS/OOS rows")
            writer.close()
            writer = None
            os.replace(temporary, tape_path)
            return row_count
        except ResearchRunProducerError:
            raise
        except (OSError, pa.ArrowException, TypeError, ValueError) as exc:
            raise ResearchRunProducerError("P10 immutable snapshot cannot form a bounded IS/OOS tape") from exc
        finally:
            if writer is not None:
                writer.close()
            if temporary.exists():
                temporary.unlink(missing_ok=True)


__all__ = ["ResearchRunProducerError", "ResearchRunProducerExecutor"]
