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
import errno
import hashlib
import json
import math
import os
import re
import shutil
import time
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_HALF_EVEN
from pathlib import Path
from typing import Any

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from pydantic import ValidationError

from portal_api.domain.research_delta_wfo_profile import (
    DELTA_WFO_CPU_SECONDS,
    DELTA_WFO_OPTUNA_TRIALS,
    DELTA_WFO_PROFILE_DIGEST,
    DELTA_WFO_PROFILE_ID,
    DeltaWfoPreviewLongMisconfigured,
    delta_wfo_admitted_trials,
    delta_wfo_preview_long_enabled,
)
from portal_api.domain.research_run_producer import ResearchRunProducerRequest, sibling_pins
from portal_api.domain.research_whatif_profile import WHATIF_PROFILE_DIGEST, WHATIF_PROFILE_ID
from portal_api.serialization import canonicalize
from portal_api.services.data_catalog import DataCatalogError, SnapshotStore
from portal_api.services.research_supervisor import (
    DELTA_WFO_CHILD_LIMITS,
    DELTA_WFO_PREVIEW_LONG_CHILD_LIMITS,
    IMPORTED_ALPHA_CHILD_LIMITS,
    DeltaWfoChildReceipt,
    ImportedAlphaChildReceipt,
    IsolatedResearchSupervisor,
    ResearchChildLimits,
    ResearchChildReceipt,
    ResearchSupervisorError,
)
from portal_api.services.research_progress import ResearchProgressJournal
from portal_api.services.research_imported_source import ResearchImportedSourceClient, ResearchImportedSourceError


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


def whatif_enabled() -> bool:
    """W5a A10c flag: the what-if diagnostic rides on the WFO lane."""

    return delta_wfo_enabled() and os.getenv("PORTAL_FEATURE_RESEARCH_WHATIF", "false").strip().lower() == "true"


class ResearchRunProducerError(RuntimeError):
    """A bounded producer failure, safe for the durable worker to classify."""

    def __init__(self, message: str, *, code: str = "ENGINE_ERROR") -> None:
        super().__init__(message)
        self.code = code


def _storage_exhausted(exc: BaseException) -> bool:
    """Classify bounded Arrow/Python disk exhaustion without exposing paths."""

    if isinstance(exc, OSError) and exc.errno in (errno.ENOSPC, errno.EDQUOT):
        return True
    # ArrowIOError is an OSError with errno=None on the pinned PyArrow wheel.
    return isinstance(exc, (OSError, pa.ArrowException)) and bool(
        re.search(r"(?:\[errno (?:28|122)\]|no space left on device|disk quota exceeded)", str(exc), re.I)
    )


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


def parameter_bundle_digest(parameters: dict[str, Any]) -> str:
    """sha256 of a parameter bundle's canonical JSON (the P14 digest rule).

    Screen 03's hand-off cursor and every fold selection carry this digest,
    so a fixed P04 bundle matches its P14 ``parameter_bundle_digest``.
    """

    return _sha256_canonical_json(dict(parameters))


def _short_objective(value: str | None) -> str:
    """Three decimals for the tqdm line; the exact value stays on the event."""

    if value is None:
        return "—"
    return format(Decimal(value).quantize(Decimal("0.001"), rounding=ROUND_HALF_EVEN), "f")


class LiveStudyProgress:
    """Map the P06 child's live Optuna records onto P11 events (CG-P06-02).

    Every number here is a source observation: the trial number, state and
    objective come from the child's Optuna callback and CPU seconds from the
    child's own rusage. The ETA is the remaining search time at the observed
    trial rate, published only while trials remain; nothing is estimated for
    the retention and seal steps after the study. A repeated or out-of-range
    trial is ignored, never re-counted.
    """

    def __init__(
        self,
        progress: Any,
        *,
        trials_declared: int,
        cpu_cap_seconds: int,
        clock: Any = time.monotonic,
    ) -> None:
        self._progress = progress
        self._declared = trials_declared
        self._cpu_cap = cpu_cap_seconds
        self._clock = clock
        self._started = clock()
        self._last_trial = 0
        self._pruned = 0
        self._last_budget_pct = -1

    @property
    def trials_observed(self) -> int:
        return self._last_trial

    def __call__(self, record: dict[str, Any]) -> None:
        trial = record.get("trial")
        if not isinstance(trial, int) or isinstance(trial, bool) or trial <= self._last_trial or trial > self._declared:
            return
        state = record.get("state")
        if state not in {"COMPLETE", "PRUNED", "INFEASIBLE", "FAILED"}:
            return
        objective = record.get("objective")
        best = record.get("best_objective")
        self._last_trial = trial
        if state != "COMPLETE":
            self._pruned += 1
        elapsed = max(0.0, self._clock() - self._started)
        remaining = self._declared - trial
        eta = math.ceil(elapsed / trial * remaining) if remaining > 0 and trial > 0 else None
        tone = {"COMPLETE": "COMPLETE", "PRUNED": "INFO", "INFEASIBLE": "WARN", "FAILED": "ERROR"}[state]
        self._progress("trial_completed", {
            "study": "GLOBAL",
            "trial": trial,
            "state": state,
            "objective": objective,
            "best_objective": best,
            "eta_s": eta,
            "tqdm_line": (
                f"global study · trial {trial}/{self._declared} · best IS Sharpe {_short_objective(best)}"
                f" · pruned {self._pruned}/{trial}"
            ),
            "console": {
                "tone": tone,
                "text": f"global trial {trial} IS Sharpe={_short_objective(objective)} state={state}",
                "trial": trial,
            },
        })
        cpu = record.get("cpu_seconds")
        if isinstance(cpu, (int, float)) and not isinstance(cpu, bool) and math.isfinite(cpu) and cpu >= 0:
            tick = _cpu_budget_tick_payload(min(float(cpu), float(self._cpu_cap)), self._cpu_cap)
            if tick["pct"] != self._last_budget_pct:
                self._last_budget_pct = tick["pct"]
                self._progress("budget_tick", tick)


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
    imported_child_limits: ResearchChildLimits = IMPORTED_ALPHA_CHILD_LIMITS
    imported_source_client: ResearchImportedSourceClient | None = None

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
        # asyncio.to_thread cannot cancel its running child. Join its bounded
        # supervisor thread before the worker can mark the lease terminal or
        # retire scratch; otherwise it could delete a still-running child's
        # files and allow post-terminal writes.
        running = asyncio.create_task(
            asyncio.to_thread(self._execute_sync, request, artifact_root, progress_journal)
        )
        try:
            return await asyncio.shield(running)
        except asyncio.CancelledError:
            while not running.done():
                try:
                    await asyncio.shield(running)
                except asyncio.CancelledError:
                    continue
                except Exception:
                    break
            if running.done() and not running.cancelled():
                running.exception()  # Consume a child failure after cancellation.
            raise

    def retire_terminal_scratch(
        self, *, job_id: str, run_id: str, worker_attempt_id: str, lease_epoch: int
    ) -> bool:
        """Worker-only cleanup after an exact durable terminal transition."""
        return self.supervisor.retire_terminal_scratch(
            job_id=job_id,
            run_id=run_id,
            worker_attempt_id=worker_attempt_id,
            lease_epoch=lease_epoch,
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

        if request.research.is_delta_wfo or request.research.is_whatif:
            return self._execute_delta_wfo_sync(request, artifact_root, progress)

        research = request.research
        imported = research.is_imported_alpha
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
        source_path = job_directory / "imported_alpha.py"
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
            if imported:
                if self.imported_source_client is None:
                    raise ResearchRunProducerError(
                        "E17 imported source authority is not configured",
                        code="CAPABILITY_MISMATCH",
                    )
                try:
                    source = self.imported_source_client.fetch(request)
                except ResearchImportedSourceError as exc:
                    raise ResearchRunProducerError(str(exc), code=exc.code) from exc
                source_path.write_bytes(source.source_bytes)
                os.chmod(source_path, 0o600)
            # The tape is now verified, bounded and holdout-free.  This is the
            # real S1 hook, not a timer/progress estimate in a browser.
            progress("stage_completed", {"stage": "S1"})
            progress("stage_started", {"stage": "S2"})
            if imported:
                assert research.imported_source_digest is not None
                assert research.imported_entrypoint is not None
                assert research.imported_parameters is not None
                receipt = ImportedAlphaChildReceipt(
                    job_id=request.job_id,
                    run_id=request.run_id,
                    worker_attempt_id=request.worker_attempt_id,
                    lease_epoch=request.lease_epoch,
                    market_path=tape_path,
                    source_path=source_path,
                    source_digest=research.imported_source_digest,
                    entrypoint=research.imported_entrypoint,
                    parameters=dict(research.imported_parameters),
                    random_seed=research.requested_spec.get("random_seed"),
                    artifact_root=artifact_root,
                    oos_start_utc_ms=int(oos_start.value // 1_000_000),
                    is_start_utc_ms=int(is_start.value // 1_000_000),
                )
            else:
                assert research.p04_parameters is not None
                receipt = ResearchChildReceipt(
                    job_id=request.job_id,
                    run_id=request.run_id,
                    worker_attempt_id=request.worker_attempt_id,
                    lease_epoch=request.lease_epoch,
                    market_path=tape_path,
                    artifact_root=artifact_root,
                    p04_parameters=dict(research.p04_parameters),
                    oos_start_utc_ms=int(oos_start.value // 1_000_000),
                    is_start_utc_ms=int(is_start.value // 1_000_000),
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
            limits = self.imported_child_limits if imported else self.child_limits
            progress("budget_tick", _cpu_budget_tick_payload(0, limits.cpu_seconds))
            if imported:
                assert isinstance(receipt, ImportedAlphaChildReceipt)
                child = self.supervisor.run_imported_alpha_qualification(
                    receipt,
                    limits=limits,
                    on_child_alive=(lambda: progress("heartbeat", {})) if progress_journal is not None else None,
                )
            else:
                assert isinstance(receipt, ResearchChildReceipt)
                child = self.supervisor.run_p04_delta_qualification(
                    receipt,
                    limits=limits,
                    on_child_alive=(lambda: progress("heartbeat", {})) if progress_journal is not None else None,
                )
            progress("budget_tick", _cpu_budget_tick_payload(
                child.cpu_seconds,
                child.enforced_limits.get("cpu_seconds", 0),
            ))
            # A fixed profile has no search: one fold, one trial, no
            # objective. The percentage is derived by the journal from these
            # facts, not supplied here.
            progress("trial_completed", {
                "fold": 1,
                "trial": 1,
                "state": "COMPLETE",
                "eta_s": None,
                "tqdm_line": "fixed profile · fold 1/1 · trial 1/1 · no search",
                "console": {
                    "tone": "COMPLETE",
                    "text": "restricted imported Alpha qualification completed" if imported else "fixed P04 qualification completed",
                    "fold": 1,
                    "trial": 1,
                },
            })
            progress("fold_completed", {
                "fold": 1,
                "selection": {
                    "scope": "IMPORTED_FIXED_PROFILE" if imported else "FIXED_PROFILE",
                    "trial": 1,
                    "objective": None,
                    "params_digest": parameter_bundle_digest(dict(
                        research.imported_parameters if imported else research.p04_parameters or {}
                    )),
                },
            })
            progress("stage_completed", {"stage": "S4"})
        except ResearchSupervisorError as exc:
            raise ResearchRunProducerError(
                "E17 isolated imported Alpha qualification exceeded its resource budget"
                if imported and exc.code == "RESOURCE_EXCEEDED"
                else "E17 isolated imported Alpha qualification failed"
                if imported
                else "P10 isolated Delta qualification exceeded its resource budget"
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
            "schema_version": "research.p17.imported-run-config.v1" if imported else "research.p10.run-config.v1",
            "run_id": request.run_id,
            "alpha_id": research.alpha_id,
            "alpha_version_id": research.alpha_version_id,
            "execution_adapter_id": research.execution_adapter_id,
            "requested_spec": research.requested_spec,
            "requested_spec_digest": research.requested_spec_digest,
            "effective_spec_digest": research.effective_spec_digest,
            "dataset_binding_digest": research.dataset_binding_digest,
            "manifest_digest": research.manifest_digest,
            **({
                "execution_profile_id": research.execution_profile_id,
                "execution_profile_digest": research.execution_profile_digest,
                "source_digest": research.imported_source_digest,
                "entrypoint": research.imported_entrypoint,
                "parameters": research.imported_parameters,
            } if imported else {"p04_parameters": research.p04_parameters}),
            "input_scope": "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY",
        }
        request_path = engine_directory / "config" / "request.json"
        request_path.write_text(
            json.dumps(canonicalize(public_config), sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        os.chmod(request_path, 0o600)
        receipt_document = {
            "schema_version": "research.p17.imported-qualification-receipt.v1" if imported else "research.p10.delta-qualification-receipt.v1",
            "run_id": request.run_id,
            "execution_adapter_id": research.execution_adapter_id,
            "requested_spec_digest": research.requested_spec_digest,
            "effective_spec_digest": research.effective_spec_digest,
            "dataset_binding_digest": research.dataset_binding_digest,
            "manifest_digest": research.manifest_digest,
            **({
                "execution_profile_id": research.execution_profile_id,
                "execution_profile_digest": research.execution_profile_digest,
                "source_digest": research.imported_source_digest,
                "entrypoint": research.imported_entrypoint,
                "parameters": research.imported_parameters,
            } if imported else {"p04_parameters": research.p04_parameters}),
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
            imported_source_digest=child.imported_source_digest,
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
        fold: folds are emitted by the worker from the retained tables. Trials
        are observed live from the child's Optuna callback through the P06
        progress channel (``LiveStudyProgress``) and reconciled by the worker
        against the retained TRIAL rows.
        """

        if not delta_wfo_enabled():
            raise ResearchRunProducerError(
                "P10 Delta WFO profile is not enabled (PORTAL_FEATURE_RESEARCH_WFO_PROFILE "
                "and PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS are both required)",
                code="CAPABILITY_MISMATCH",
            )
        research = request.research
        whatif = research.whatif if research.is_whatif else None
        if research.is_whatif:
            # W5a A10c: the diagnostic re-runs its parent's exact study with
            # its admitted evaluations enqueued; nothing else changes.
            if not whatif_enabled() or whatif is None:
                raise ResearchRunProducerError(
                    "P16 what-if diagnostic is not enabled (PORTAL_FEATURE_RESEARCH_WHATIF)",
                    code="CAPABILITY_MISMATCH",
                )
            if research.execution_profile_digest != WHATIF_PROFILE_DIGEST:
                raise ResearchRunProducerError("P16 what-if profile digest no longer matches", code="CAPABILITY_MISMATCH")
        elif research.execution_profile_digest != DELTA_WFO_PROFILE_DIGEST:
            raise ResearchRunProducerError("P10 Delta WFO profile digest no longer matches", code="CAPABILITY_MISMATCH")
        # Research preview only: a long study runs the spec's own admitted
        # trial count under the preview child limits. Off, both stay locked.
        try:
            preview_long = whatif is None and delta_wfo_preview_long_enabled()
            study_trials = (
                delta_wfo_admitted_trials(research.requested_spec) if preview_long else DELTA_WFO_OPTUNA_TRIALS
            )
        except (DeltaWfoPreviewLongMisconfigured, ValueError) as exc:
            raise ResearchRunProducerError(str(exc), code="CAPABILITY_MISMATCH") from exc
        child_limits = (
            DELTA_WFO_PREVIEW_LONG_CHILD_LIMITS
            if preview_long and self.wfo_child_limits is DELTA_WFO_CHILD_LIMITS
            else self.wfo_child_limits
        )
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
                execution_profile_id=WHATIF_PROFILE_ID if whatif is not None else DELTA_WFO_PROFILE_ID,
                execution_profile_digest=WHATIF_PROFILE_DIGEST if whatif is not None else DELTA_WFO_PROFILE_DIGEST,
                dataset_id=str(data.get("dataset_id")),
                symbol=str(data.get("symbol")),
                data_start_utc_ms=int(span_start.value // 1_000_000),
                data_end_exclusive_utc_ms=int(span_end.value // 1_000_000),
                first_oos_utc_ms=int(first_oos.value // 1_000_000),
                task="P16_DELTA_WHATIF_GRID" if whatif is not None else "P10_DELTA_WFO",
                # A what-if diagnostic scores full configurations, so it never
                # carries its parent's pins; a sibling WFO run does.
                pinned_parameters=() if whatif is not None else tuple(
                    (name, format(Decimal(str(value)).normalize(), "f"))
                    for name, value in sorted(sibling_pins(research.requested_spec).items())
                ),
                whatif_grid_key=whatif.grid_key if whatif is not None else None,
                whatif_evaluations=tuple(
                    {"evaluation_key": entry.evaluation_key, "parameters": dict(entry.parameters)}
                    for entry in whatif.evaluations
                ) if whatif is not None else (),
                optuna_trials=study_trials if preview_long else None,
            )
            progress("stage_completed", {"stage": "S2"})
            progress("stage_started", {"stage": "S3"})
            progress("stage_completed", {"stage": "S3"})
            progress("stage_started", {"stage": "S4"})
            cpu_cap = child_limits.cpu_seconds if preview_long else min(child_limits.cpu_seconds, DELTA_WFO_CPU_SECONDS)
            progress("budget_tick", _cpu_budget_tick_payload(0, cpu_cap))
            declared_trials = len(whatif.evaluations) if whatif is not None else study_trials
            live = LiveStudyProgress(progress, trials_declared=declared_trials, cpu_cap_seconds=cpu_cap)
            child = self.supervisor.run_delta_wfo(
                receipt,
                limits=child_limits,
                on_child_alive=(lambda: progress("heartbeat", {})),
                on_child_progress=live,
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
        if whatif is not None:
            receipt_document["whatif"] = {
                "parent_run_id": whatif.parent_run_id,
                "grid_key": whatif.grid_key,
                "evaluations": len(whatif.evaluations),
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
        imported_source_digest: str | None = None,
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

        imported = research.is_imported_alpha
        if imported and imported_source_digest != research.imported_source_digest:
            raise ResearchRunProducerError("E17 child source identity differs from its immutable admission")
        parameters = research.imported_parameters if imported else research.p04_parameters
        if parameters is None:
            raise ResearchRunProducerError("P14 fixed adapter did not publish its exact parameter bundle")
        parameter_bundle_digest = _sha256_canonical_json(dict(parameters))
        absence_prefix = "E17_IMPORTED_FIXED_PROFILE" if imported else "P04_FIXED_PROFILE"
        return {
            "schema_version": "research.p14.split-source.v1",
            "source": {
                "execution_adapter_id": research.execution_adapter_id,
                **({"imported_source_digest": imported_source_digest} if imported else {}),
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
                "fold_plan": absence(f"{absence_prefix}_DOES_NOT_PUBLISH_FOLD_PLAN"),
                "selection": {
                    "state": "FIXED_PROFILE_NO_SEARCH",
                    "parameter_bundle_digest": parameter_bundle_digest,
                    "strict_outer_oos": {
                        "state": "NOT_ASSERTED",
                        "reason_code": f"{absence_prefix}_DOES_NOT_PUBLISH_STRICT_OUTER_OOS_SELECTION_FACTS",
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
                    "evaluation_state": (
                        "IMPORTED_ALPHA_OBSERVED_AFTER_FIXED_PROFILE"
                        if imported else "P04_OBSERVED_AFTER_FIXED_PROFILE"
                    ),
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
                "purge": absence(f"{absence_prefix}_DOES_NOT_PUBLISH_PURGE"),
                "embargo": absence(f"{absence_prefix}_DOES_NOT_PUBLISH_EMBARGO"),
                "inner_folds": absence(f"{absence_prefix}_DOES_NOT_PUBLISH_INNER_FOLDS"),
                "theta_per_fold": absence(f"{absence_prefix}_DOES_NOT_PUBLISH_THETA_PER_FOLD"),
                "gap_scan": absence(f"{absence_prefix}_DOES_NOT_PUBLISH_GAP_SCAN"),
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
            if _storage_exhausted(exc):
                raise ResearchRunProducerError(
                    "P10 immutable snapshot tape exhausted its disk or filesystem quota",
                    code="RESOURCE_EXCEEDED",
                ) from exc
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
