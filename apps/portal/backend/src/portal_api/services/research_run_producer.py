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
import re
import shutil
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation, ROUND_CEILING
from pathlib import Path
from typing import Any

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from pydantic import ValidationError

from portal_api.domain.research_delta_wfo_profile import (
    DELTA_WFO_CPU_SECONDS,
    DELTA_WFO_PROFILE_DIGEST,
    DELTA_WFO_PROFILE_ID,
)
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.serialization import canonicalize
from portal_api.services.data_catalog import DataCatalogError, SnapshotStore
from portal_api.services.research_supervisor import (
    DELTA_WFO_CHILD_LIMITS,
    DeltaWfoChildReceipt,
    IsolatedResearchSupervisor,
    ResearchChildLimits,
    ResearchChildReceipt,
    ResearchSupervisorError,
)
from portal_api.services.research_progress import ResearchProgressJournal


# The WFO child's validated QuantBT output is copied here, beside (not
# inside) the ``<run_id>`` engine directory the durable worker stages into its
# bundle.  The worker's P05/RS-02 retention reads it, then removes the whole
# engine root.  It is never a browser-visible artifact.
WFO_SOURCE_DIRNAME = ".p10-wfo-source"


def delta_wfo_enabled() -> bool:
    """W1 flag: default off, and meaningless without P05 retained artifacts."""

    def flag(name: str) -> bool:
        return os.getenv(name, "false").strip().lower() == "true"

    return flag("PORTAL_FEATURE_RESEARCH_WFO_PROFILE") and flag("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS")


class ResearchRunProducerError(RuntimeError):
    """A bounded producer failure, safe for the durable worker to classify."""

    def __init__(self, message: str, *, code: str = "ENGINE_ERROR") -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True, slots=True)
class TapeWindowCounts:
    """Measured rows copied into the confined child tape by P10.

    Counts are deliberately split by semantic time role.  They attest the
    derived tape, not physical Parquet row-group I/O: Arrow may have had to
    read a neighbouring row group before P10 removed rows at the holdout
    boundary.  P14 publishes that physical-I/O limitation explicitly.
    """

    warmup_bars: int
    warmup_start: pd.Timestamp | None
    is_bars: int
    outer_oos_bars: int

    @property
    def total_bars(self) -> int:
        return self.warmup_bars + self.is_bars + self.outer_oos_bars


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


def _sha256_canonical_json(value: object) -> str:
    """Hash a public, bounded P14 fact with the same canonical bytes as P11."""

    try:
        encoded = json.dumps(canonicalize(value), sort_keys=True, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ResearchRunProducerError("P14 source fact is not serializable") from exc
    return hashlib.sha256(encoded).hexdigest()


def _cpu_budget_tick_payload(used_cpu_seconds: float, cpu_cap_seconds: int) -> dict[str, Any]:
    """Render measured/enforced child CPU as the P11 core-minute budget fact."""

    if isinstance(used_cpu_seconds, bool) or not isinstance(used_cpu_seconds, (int, float)):
        raise ResearchRunProducerError("P11 child CPU usage is invalid")
    if isinstance(cpu_cap_seconds, bool) or not isinstance(cpu_cap_seconds, int) or cpu_cap_seconds < 1:
        raise ResearchRunProducerError("P11 child CPU cap is invalid")
    try:
        used_seconds = Decimal(str(used_cpu_seconds))
    except InvalidOperation as exc:
        raise ResearchRunProducerError("P11 child CPU usage is invalid") from exc
    if not used_seconds.is_finite() or used_seconds < 0:
        raise ResearchRunProducerError("P11 child CPU usage is invalid")

    cap_seconds = Decimal(cpu_cap_seconds)
    used_core_minutes = (used_seconds / Decimal(60)).quantize(Decimal("0.001"), rounding=ROUND_CEILING)
    cap_core_minutes = (cap_seconds / Decimal(60)).quantize(Decimal("0.001"), rounding=ROUND_CEILING)
    pct = int((used_seconds * Decimal(100) / cap_seconds).to_integral_value(rounding=ROUND_CEILING))
    return {
        "used": format(used_core_minutes, "f"),
        "cap": format(cap_core_minutes, "f"),
        "pct": min(100, max(0, pct)),
    }


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
    child_limits: ResearchChildLimits = field(default_factory=ResearchChildLimits)
    wfo_child_limits: ResearchChildLimits = DELTA_WFO_CHILD_LIMITS

    async def __call__(
        self,
        request_json: dict[str, Any],
        run_id: str,
        artifact_root: Path,
        *,
        progress_journal: ResearchProgressJournal | None = None,
    ) -> dict[str, Any]:
        try:
            request = ResearchRunProducerRequest.model_validate(request_json)
        except ValidationError as exc:
            raise ResearchRunProducerError("P10 durable request no longer satisfies its private contract") from exc
        if request.run_id != run_id:
            raise ResearchRunProducerError("P10 durable run identity does not match its worker envelope")
        return await asyncio.to_thread(
            self._execute_sync,
            request,
            artifact_root,
            progress_journal,
        )

    async def execute_with_progress(
        self,
        request_json: dict[str, Any],
        run_id: str,
        artifact_root: Path,
        progress_journal: ResearchProgressJournal,
    ) -> dict[str, Any]:
        """Explicit P11 hook; plain test executors retain the three-arg API.

        Keeping this separate means a generic/mocked executor cannot acquire
        implied progress authority merely because P11 is enabled.
        """

        return await self(
            request_json,
            run_id,
            artifact_root,
            progress_journal=progress_journal,
        )

    def _execute_sync(
        self,
        request: ResearchRunProducerRequest,
        artifact_root: Path,
        progress_journal: ResearchProgressJournal | None = None,
    ) -> dict[str, Any]:
        def progress(event_type: str, payload: dict[str, Any] | None = None) -> None:
            if progress_journal is not None:
                progress_journal.emit(event_type, payload)

        if request.research.is_delta_wfo:
            return self._execute_delta_wfo_sync(request, artifact_root, progress)

        research = request.research
        progress("stage_started", {"stage": "S1"})
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
        holdout_window = windows["holdout"]
        assert isinstance(is_window, dict) and isinstance(oos_window, dict) and isinstance(holdout_window, dict)
        is_start = _utc_timestamp(is_window.get("start"), label="IS start")
        oos_start = _utc_timestamp(oos_window.get("start"), label="OOS start")
        oos_end = _utc_timestamp(oos_window.get("end_exclusive"), label="OOS end")
        holdout_start = _utc_timestamp(holdout_window.get("start"), label="holdout start")
        holdout_end = _utc_timestamp(holdout_window.get("end_exclusive"), label="holdout end")
        if is_start >= oos_start or oos_start >= oos_end or oos_end != holdout_start or holdout_start >= holdout_end:
            raise ResearchRunProducerError("P10 three-window chronology is invalid")

        job_directory = self.market_root / request.job_id / request.worker_attempt_id
        tape_path = job_directory / "is_oos_only.parquet"
        if job_directory.exists():
            # A redelivery may see a stale partial temporary directory after a
            # killed worker.  It contains no accepted artifact; clear exactly
            # this validated job/lease path before rebuilding its tape.
            shutil.rmtree(job_directory)
        job_directory.mkdir(mode=0o700, parents=True)
        try:
            tape_counts = self._write_is_oos_tape(
                frame_path=frame_path,
                tape_path=tape_path,
                is_start=is_start,
                oos_start=oos_start,
                oos_end=oos_end,
            )
            # P08 already verified the requested warmup policy.  A valid
            # zero-warmup snapshot can begin exactly at IS start, so requiring
            # a row strictly before that boundary here would reject a truthful
            # P08 manifest.  The producer's own invariant is narrower: enough
            # IS/OOS rows to run the fixed adapter, and no row at/after OOS
            # end (the sealed holdout boundary).
            if tape_counts.total_bars < 2 or tape_counts.is_bars < 1 or tape_counts.outer_oos_bars < 1:
                raise ResearchRunProducerError("P10 immutable snapshot cannot form a bounded IS/OOS tape")
            os.chmod(tape_path, 0o600)
            # The tape is now verified, bounded and holdout-free.  This is the
            # real S1 hook, not a timer/progress estimate in a browser.
            progress("stage_completed", {"stage": "S1"})
            progress("stage_started", {"stage": "S2"})
            receipt = ResearchChildReceipt(
                job_id=request.job_id,
                run_id=request.run_id,
                worker_attempt_id=request.worker_attempt_id,
                lease_epoch=request.lease_epoch,
                market_path=tape_path,
                artifact_root=artifact_root,
                p04_parameters=dict(research.p04_parameters),
                oos_start_utc_ms=int(oos_start.value // 1_000_000),
            )
            # P10 has one server-installed fixed qualification, not a generic
            # optimizer.  S2 therefore records preparation of that exact one
            # study and never invents a sweep/trial count.
            progress("stage_completed", {"stage": "S2"})
            progress("stage_started", {"stage": "S3"})
            # The private request has already fixed the P04 parameter map and
            # the child receipt is immutable from this point onward.
            progress("stage_completed", {"stage": "S3"})
            progress("stage_started", {"stage": "S4"})
            # Publish the exact CPU ceiling before entering P06. CPU usage is
            # not observable from this parent callback while the child runs;
            # the measured value is published immediately after its receipt.
            progress("budget_tick", _cpu_budget_tick_payload(0, self.child_limits.cpu_seconds))
            child = self.supervisor.run_p04_delta_qualification(
                receipt,
                limits=self.child_limits,
                on_child_alive=(lambda: progress("heartbeat", {})) if progress_journal is not None else None,
            )
            progress("budget_tick", _cpu_budget_tick_payload(
                child.cpu_seconds,
                child.enforced_limits.get("cpu_seconds", 0),
            ))
            progress("trial_completed", {
                "fold": 1,
                "trial": 1,
                "state": "COMPLETE",
                "overall_pct": 80,
                "tqdm_line": "fixed P04 qualification completed · trial 1/1",
                "console": {
                    "tone": "COMPLETE",
                    "text": "fixed P04 qualification completed",
                    "fold": 1,
                    "trial": 1,
                },
            })
            progress("fold_completed", {"fold": 1})
            progress("stage_completed", {"stage": "S4"})
        except ResearchSupervisorError as exc:
            raise ResearchRunProducerError(
                "P10 isolated Delta qualification exceeded its resource budget"
                if exc.code == "RESOURCE_EXCEEDED"
                else "P10 isolated Delta qualification failed",
                code=exc.code,
            ) from exc
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
        split_source = self._p14_split_source(
            request=request,
            tape_counts=tape_counts,
            is_start=is_start,
            oos_start=oos_start,
            oos_end=oos_end,
            holdout_end=holdout_end,
            source_transform_digest=(
                child.evidence_source.get("source", {}).get("source_transform_digest")
                if isinstance(child.evidence_source, dict) else None
            ),
        )
        receipt_document["split_source"] = split_source
        if child.evidence_source is not None:
            # The evidence receipt is generated while the confined child owns
            # the full result. It is copied into the sealed bundle and later
            # relayed through P11; it is not an artifact path or a database
            # source and does not expand P10's private input capability.
            receipt_document["evidence_source"] = child.evidence_source
        receipt_path = engine_directory / "research" / "p10-receipt.json"
        receipt_path.write_text(
            json.dumps(canonicalize(receipt_document), sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        os.chmod(receipt_path, 0o600)
        return {
            "status": "COMPLETED",
            "research_receipt": receipt_document,
            "research_evidence": child.evidence_source,
            "research_split": split_source,
        }

    def _execute_delta_wfo_sync(
        self,
        request: ResearchRunProducerRequest,
        artifact_root: Path,
        progress: Any,
    ) -> dict[str, Any]:
        """W1 row D: the Delta signal-notional WFO through the same P06 child.

        Holdout is not part of an advanced topology, so the child tape is the
        P08 snapshot bounded to rows before ``walk_forward.end_exclusive``.
        The child writes real QuantBT advanced-WFO output; this method copies
        the validated tree to ``engine_root/.p10-wfo-source/<run_id>`` for the
        worker's P05/RS-02 retention.  It publishes no P13 evidence and no P14
        split receipt (both are P04-shaped hubs), and it does not claim any
        trial/fold: those are emitted by the worker from the retained tables.
        """

        if not delta_wfo_enabled():
            raise ResearchRunProducerError(
                "P10 Delta WFO profile is not enabled (PORTAL_FEATURE_RESEARCH_WFO_PROFILE "
                "and PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS are both required)",
                code="CAPABILITY_MISMATCH",
            )
        research = request.research
        if research.execution_profile_digest != DELTA_WFO_PROFILE_DIGEST:
            raise ResearchRunProducerError("P10 Delta WFO profile digest no longer matches", code="CAPABILITY_MISMATCH")
        progress("stage_started", {"stage": "S1"})
        try:
            identity, _ = self.snapshots.describe(research.snapshot_id)
        except DataCatalogError as exc:
            raise ResearchRunProducerError("P10 immutable preflight snapshot is unavailable") from exc
        if identity.content_hash != research.snapshot_content_hash:
            raise ResearchRunProducerError("P10 immutable preflight snapshot hash no longer matches")
        frame_path = self.snapshots.snapshot_path(research.snapshot_id) / "frame.parquet"
        if _sha256_file(frame_path) != identity.content_hash:
            raise ResearchRunProducerError("P10 immutable preflight snapshot bytes no longer match")

        walk_forward = research.requested_spec["walk_forward"]
        assert isinstance(walk_forward, dict)  # enforced by the private DTO
        span_start = _utc_timestamp(walk_forward.get("start"), label="walk-forward start")
        first_oos = _utc_timestamp(walk_forward.get("split_mode"), label="walk-forward first OOS")
        span_end = _utc_timestamp(walk_forward.get("end_exclusive"), label="walk-forward end")
        if not span_start < first_oos < span_end:
            raise ResearchRunProducerError("P10 walk-forward chronology is invalid")
        data = research.requested_spec.get("data")
        assert isinstance(data, dict)

        job_directory = self.market_root / request.job_id / request.worker_attempt_id
        tape_path = job_directory / "wfo_span.parquet"
        if job_directory.exists():
            shutil.rmtree(job_directory)
        job_directory.mkdir(mode=0o700, parents=True)
        source_root = artifact_root / WFO_SOURCE_DIRNAME
        try:
            tape_counts = self._write_is_oos_tape(
                frame_path=frame_path,
                tape_path=tape_path,
                is_start=span_start,
                oos_start=first_oos,
                oos_end=span_end,
            )
            if tape_counts.is_bars < 1 or tape_counts.outer_oos_bars < 1:
                raise ResearchRunProducerError("P10 immutable snapshot cannot form a bounded walk-forward tape")
            os.chmod(tape_path, 0o600)
            progress("stage_completed", {"stage": "S1"})
            progress("stage_started", {"stage": "S2"})
            receipt = DeltaWfoChildReceipt(
                job_id=request.job_id,
                run_id=request.run_id,
                worker_attempt_id=request.worker_attempt_id,
                lease_epoch=request.lease_epoch,
                market_path=tape_path,
                artifact_root=artifact_root,
                execution_profile_id=DELTA_WFO_PROFILE_ID,
                execution_profile_digest=DELTA_WFO_PROFILE_DIGEST,
                dataset_id=str(data.get("dataset_id")),
                symbol=str(data.get("symbol")),
                data_start_utc_ms=int(span_start.value // 1_000_000),
                data_end_exclusive_utc_ms=int(span_end.value // 1_000_000),
                first_oos_utc_ms=int(first_oos.value // 1_000_000),
            )
            progress("stage_completed", {"stage": "S2"})
            progress("stage_started", {"stage": "S3"})
            progress("stage_completed", {"stage": "S3"})
            progress("stage_started", {"stage": "S4"})
            cpu_cap = min(self.wfo_child_limits.cpu_seconds, DELTA_WFO_CPU_SECONDS)
            progress("budget_tick", _cpu_budget_tick_payload(0, cpu_cap))
            child = self.supervisor.run_delta_wfo(
                receipt,
                limits=self.wfo_child_limits,
                on_child_alive=(lambda: progress("heartbeat", {})),
            )
            try:
                progress("budget_tick", _cpu_budget_tick_payload(min(child.cpu_seconds, cpu_cap), cpu_cap))
                destination = source_root / request.run_id
                if destination.exists():
                    shutil.rmtree(destination)
                source_root.mkdir(mode=0o700, parents=True, exist_ok=True)
                shutil.copytree(child.output_root / request.run_id, destination, symlinks=True)
            finally:
                shutil.rmtree(child.output_root, ignore_errors=True)
        except ResearchSupervisorError as exc:
            raise ResearchRunProducerError(
                "P10 isolated Delta WFO exceeded its resource budget"
                if exc.code == "RESOURCE_EXCEEDED"
                else "P10 isolated Delta WFO failed",
                code=exc.code,
            ) from exc
        finally:
            if job_directory.exists():
                shutil.rmtree(job_directory)

        engine_directory = artifact_root / request.run_id
        engine_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        (engine_directory / "config").mkdir(mode=0o700, exist_ok=True)
        (engine_directory / "research").mkdir(mode=0o700, exist_ok=True)
        public_config = {
            "schema_version": "research.p10.run-config.v1",
            "run_id": request.run_id,
            "alpha_id": research.alpha_id,
            "alpha_version_id": research.alpha_version_id,
            "execution_adapter_id": research.execution_adapter_id,
            "execution_profile_id": research.execution_profile_id,
            "execution_profile_digest": research.execution_profile_digest,
            "requested_spec": research.requested_spec,
            "requested_spec_digest": research.requested_spec_digest,
            "effective_spec_digest": research.effective_spec_digest,
            "dataset_binding_digest": research.dataset_binding_digest,
            "manifest_digest": research.manifest_digest,
            "input_scope": "P08_OPTIONAL_WARMUP_PLUS_WFO_SPAN",
        }
        request_path = engine_directory / "config" / "request.json"
        request_path.write_text(
            json.dumps(canonicalize(public_config), sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        os.chmod(request_path, 0o600)
        receipt_document = {
            "schema_version": "research.p10.delta-wfo-receipt.v1",
            "run_id": request.run_id,
            "execution_adapter_id": research.execution_adapter_id,
            "execution_profile_id": research.execution_profile_id,
            "execution_profile_digest": research.execution_profile_digest,
            "requested_spec_digest": research.requested_spec_digest,
            "effective_spec_digest": research.effective_spec_digest,
            "dataset_binding_digest": research.dataset_binding_digest,
            "manifest_digest": research.manifest_digest,
            "input_scope": "P08_OPTIONAL_WARMUP_PLUS_WFO_SPAN",
            "tape": {
                "warmup_bars": tape_counts.warmup_bars,
                "is_bars": tape_counts.is_bars,
                "outer_oos_bars": tape_counts.outer_oos_bars,
            },
            "engine": {
                "version": child.engine_version,
                "bars": child.bars,
                "n_folds": child.n_folds,
                "trial_rows": child.trial_rows,
                "output_files": child.output_files,
                "output_bytes": child.output_bytes,
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
            "research_evidence": None,
            "research_split": None,
        }

    @staticmethod
    def _p14_split_source(
        *,
        request: ResearchRunProducerRequest,
        tape_counts: TapeWindowCounts,
        is_start: pd.Timestamp,
        oos_start: pd.Timestamp,
        oos_end: pd.Timestamp,
        holdout_end: pd.Timestamp,
        source_transform_digest: object,
    ) -> dict[str, Any]:
        """Build P14's exact current-adapter chronology receipt.

        This is intentionally not a generic WFO/fold schema.  The installed
        adapter publishes one fixed-profile IS/OOS observation and no search
        trace, purge/embargo, gap scan, holdout evaluation, release seal or
        unlock authority.  Encoding those absences here prevents a later
        reader from mistaking a visual placeholder for an engine fact.
        """

        if not isinstance(source_transform_digest, str) or not re.fullmatch(r"[0-9a-f]{64}", source_transform_digest):
            raise ResearchRunProducerError("P14 fixed adapter did not publish its OOS source transform digest")
        research = request.research

        def range_document(start: pd.Timestamp, end: pd.Timestamp) -> dict[str, int]:
            return {
                "start_utc_ms": int(start.value // 1_000_000),
                "end_exclusive_utc_ms": int(end.value // 1_000_000),
            }

        absence = lambda reason: {"state": "NOT_PUBLISHED", "reason_code": reason}
        if tape_counts.warmup_bars:
            if tape_counts.warmup_start is None:
                raise ResearchRunProducerError("P14 warmup count is missing its exact source start")
            warmup: dict[str, Any] = {
                "state": "AVAILABLE",
                "bars": tape_counts.warmup_bars,
                "data_role": "WARMUP_NOT_SCORED",
                "child_input_state": "EXPOSED_TO_CHILD_TAPE",
                **range_document(tape_counts.warmup_start, is_start),
            }
        else:
            warmup = {"state": "NOT_APPLICABLE", "bars": 0, "reason_code": "P08_WARMUP_NOT_REQUESTED"}

        parameter_bundle_digest = _sha256_canonical_json(dict(research.p04_parameters))
        return {
            "schema_version": "research.p14.split-source.v1",
            "source": {
                "execution_adapter_id": "p04.delta-rsi.v1",
                "engine_version": "1.1.1",
                "input_scope": "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
                "source_transform_digest": source_transform_digest,
                "manifest_digest": research.manifest_digest,
                "physical_io": {
                    "state": "NOT_ATTESTED",
                    "reason_code": "P10_ROW_GROUP_PHYSICAL_IO_BOUNDARY_NOT_PUBLISHED",
                },
            },
            "protocol": {
                "kind": "THREE_WINDOW_CURRENT",
                "fold_plan": absence("P04_FIXED_PROFILE_DOES_NOT_PUBLISH_FOLD_PLAN"),
                "selection": {
                    "state": "FIXED_PROFILE_NO_SEARCH",
                    "parameter_bundle_digest": parameter_bundle_digest,
                    "strict_outer_oos": {
                        "state": "NOT_ASSERTED",
                        "reason_code": "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_STRICT_OUTER_OOS_SELECTION_FACTS",
                    },
                },
            },
            # RS-01 made the ingress contract explicit: when warmup bars exist
            # the timeline starts at the warmup, and every window is contiguous
            # with the next. Starting it at IS made every real terminal event
            # with warmup fail ingestion (found on the RF-02 real-API lane).
            "timeline": range_document(
                tape_counts.warmup_start if tape_counts.warmup_bars else is_start,
                holdout_end,
            ),
            "windows": {
                "warmup": warmup,
                "is": {
                    **range_document(is_start, oos_start),
                    "bars": tape_counts.is_bars,
                    "data_role": "IS_CALIBRATION_HISTORY",
                    "child_input_state": "EXPOSED_TO_CHILD_TAPE",
                },
                "outer_oos": {
                    **range_document(oos_start, oos_end),
                    "bars": tape_counts.outer_oos_bars,
                    "data_role": "OUTER_OOS_OBSERVATION",
                    "child_input_state": "EXPOSED_TO_CHILD_TAPE",
                    "evaluation_state": "P04_OBSERVED_AFTER_FIXED_PROFILE",
                },
                "holdout": {
                    **range_document(oos_end, holdout_end),
                    "bars": None,
                    "data_role": "HOLDOUT",
                    "child_input_state": "NOT_EXPOSED_TO_CHILD_TAPE",
                    "evaluation_state": "NOT_EVALUATED",
                    "result_exposure_state": "NOT_EXPOSED",
                    "snapshot_integrity_state": "P08_METADATA_BOUND",
                },
            },
            "absences": {
                "purge": absence("P04_FIXED_PROFILE_DOES_NOT_PUBLISH_PURGE"),
                "embargo": absence("P04_FIXED_PROFILE_DOES_NOT_PUBLISH_EMBARGO"),
                "inner_folds": absence("P04_FIXED_PROFILE_DOES_NOT_PUBLISH_INNER_FOLDS"),
                "theta_per_fold": absence("P04_FIXED_PROFILE_DOES_NOT_PUBLISH_THETA_PER_FOLD"),
                "gap_scan": absence("P04_FIXED_PROFILE_DOES_NOT_PUBLISH_GAP_SCAN"),
                "holdout_unlock": absence("DR01_HOLDOUT_UNLOCK_AUTHORITY_NOT_PUBLISHED"),
            },
        }

    @staticmethod
    def _write_is_oos_tape(
        *,
        frame_path: Path,
        tape_path: Path,
        oos_end: pd.Timestamp,
        is_start: pd.Timestamp,
        oos_start: pd.Timestamp,
    ) -> TapeWindowCounts:
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
        warmup_bars = 0
        warmup_start: pd.Timestamp | None = None
        is_bars = 0
        outer_oos_bars = 0
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
                filtered_timestamps = timestamps[mask]
                warmup_mask = filtered_timestamps < is_start
                warmup_bars += int(warmup_mask.sum())
                if bool(warmup_mask.any()):
                    candidate = pd.Timestamp(filtered_timestamps[warmup_mask][0])
                    warmup_start = candidate if warmup_start is None else min(warmup_start, candidate)
                is_bars += int(((filtered_timestamps >= is_start) & (filtered_timestamps < oos_start)).sum())
                outer_oos_bars += int(((filtered_timestamps >= oos_start) & (filtered_timestamps < oos_end)).sum())
            if writer is None:
                raise ResearchRunProducerError("P10 immutable snapshot has no allowed IS/OOS rows")
            writer.close()
            writer = None
            os.replace(temporary, tape_path)
            return TapeWindowCounts(
                warmup_bars=warmup_bars,
                warmup_start=warmup_start,
                is_bars=is_bars,
                outer_oos_bars=outer_oos_bars,
            )
        except ResearchRunProducerError:
            raise
        except (OSError, pa.ArrowException, TypeError, ValueError) as exc:
            raise ResearchRunProducerError("P10 immutable snapshot cannot form a bounded IS/OOS tape") from exc
        finally:
            if writer is not None:
                writer.close()
            if temporary.exists():
                temporary.unlink(missing_ok=True)


__all__ = [
    "ResearchRunProducerError",
    "ResearchRunProducerExecutor",
    "WFO_SOURCE_DIRNAME",
    "delta_wfo_enabled",
]
