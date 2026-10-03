"""Durable Quant worker (U11 / BAR-08-BE2).

Pulls ``quant.run.requested.*`` jobs, claims the attempt with a lease,
heartbeats while executing the existing run engine, finalizes artifacts
content-addressed and publishes terminal events. Redelivery of a completed
attempt is a no-op; retry always creates a NEW attempt so history is never
overwritten. Cancellation is a desired-state command checked cooperatively;
the supervisor hard-kills after the grace period.
"""

from __future__ import annotations

import asyncio
import errno
import hashlib
import json
import logging
import math
import os
import shutil
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Awaitable, Callable

from pydantic import ValidationError

from portal_api.domain.research_delta_wfo_profile import (
    DELTA_WFO_CPU_SECONDS,
    DELTA_WFO_OPTUNA_TRIALS,
    DeltaWfoPreviewLongMisconfigured,
    delta_wfo_admitted_trials,
    delta_wfo_child_cpu_seconds,
)
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.domain.research_delta_causal_inner_profile import DELTA_CAUSAL_INNER_PROFILE_ID
from portal_api.domain.research_imported_alpha_profile import IMPORTED_ALPHA_CPU_SECONDS
from portal_api.domain.research_whatif_profile import WHATIF_CPU_SECONDS
from portal_api.services.artifact_store import ContentAddressedArtifactStore
from portal_api.services.research_artifacts import ResearchArtifactError
from portal_api.services.durable_runs import (
    DEFAULT_GRACE_SECONDS,
    DEFAULT_LEASE_SECONDS,
    DurableRunCancelled,
    DurableRunError,
    AttemptRegistry,
    RunAttempt,
    RunIntent,
    STANDARD_FAILURE_CODES,
)
from portal_api.services.job_broker import JobBroker, JobMessage
from portal_api.services.research_progress import ResearchProgressError, ResearchProgressJournal
from portal_api.services.research_progress_relay import (
    ResearchProgressRelay,
    ResearchProgressRelayError,
)
from portal_api.services.research_current_source_retention import (
    CurrentSourceRetentionResult,
    ResearchCurrentSourceRetentionClient,
    ResearchCurrentSourceRetentionError,
)
from portal_api.services.research_retained_receipt import ResearchRetainedReceiptClient, ResearchRetainedReceiptError
from portal_api.services.research_run_producer import WFO_SOURCE_DIRNAME, parameter_bundle_digest
from portal_api.services.research_whatif_retention import (
    ResearchWhatIfRetentionClient,
    ResearchWhatIfRetentionError,
    read_whatif_results,
)

logger = logging.getLogger("portal_api.durable_worker")

RunExecutor = Callable[[dict[str, Any], str, Path], Awaitable[dict[str, Any]]]


async def _joined_retention_thread(
    retain: Callable[..., Any], *, fence_validator: Callable[[Any], bool], **kwargs: Any
) -> Any:
    """Fence cancellation and join bounded custody work before scratch retirement.

    A running to_thread cannot itself be cancelled. Its network clients and
    source population are already bounded; keep heartbeat/lease ownership until
    that thread settles, rather than deleting roots that it is still reading.
    """
    cancelled = threading.Event()

    def current_fence(fence: Any) -> bool:
        return not cancelled.is_set() and fence_validator(fence)

    running = asyncio.create_task(asyncio.to_thread(retain, fence_validator=current_fence, **kwargs))
    try:
        return await asyncio.shield(running)
    except asyncio.CancelledError:
        cancelled.set()
        while not running.done():
            try:
                await asyncio.shield(running)
            except asyncio.CancelledError:
                continue
            except Exception:
                break
        if running.done() and not running.cancelled():
            running.exception()  # Consume the expected fenced source failure.
        raise



# Control API marks the P10 producer DISPATCHED only after Portal's 202
# receipt returns, while this worker may already hold the job: the first
# run_started post can race that write and get a stale-lease 409. The start
# gate therefore retries within a bounded window instead of failing the run
# on the first refusal (seen on the preview's first retained run).
START_ACK_WINDOW_SECONDS = 15.0
START_ACK_RETRY_SECONDS = 0.25

RESEARCH_IDENTITY_ARTIFACTS = (
    "research/requested-spec.json",
    "research/effective-spec-receipt.json",
    "research/dataset-binding-receipt.json",
)


async def _await_start_acknowledged(
    relay: Any,
    *,
    window_seconds: float = START_ACK_WINDOW_SECONDS,
    retry_seconds: float = START_ACK_RETRY_SECONDS,
) -> bool:
    deadline = time.monotonic() + window_seconds
    while True:
        if await relay.flush():
            return True
        if time.monotonic() >= deadline:
            return False
        await asyncio.sleep(retry_seconds)


class _ProgressJournalRecoveryRequired(DurableRunError):
    """Stop a reclaimed P11 attempt before it can execute ambiguously.

    A journal that is neither new nor terminal proves that a previous worker
    owned at least part of the same attempt.  P11 deliberately owns neither a
    retry route nor a way to reset that evidence.  Re-running it in place
    would turn a lease expiry into duplicate execution and an ambiguous
    progress history.  The local attempt is fenced; P12 owns an explicit new
    attempt if an operator chooses to retry.
    """

    code = "LEASE_LOST"


class _DeltaWfoProfileUnavailable(DurableRunError):
    """W1: a Delta WFO job reached a worker whose WFO lane is dark."""

    code = "CAPABILITY_MISMATCH"


def _flag(name: str) -> bool:
    return os.getenv(name, "false").strip().lower() == "true"


async def execute_run_in_process(
    request_json: dict[str, Any], run_id: str, artifact_root: Path
) -> dict[str, Any]:
    """Execute through the existing engine in a worker process."""
    from portal_api.workers import run_worker

    return await asyncio.to_thread(
        run_worker.execute_run,
        request_json=request_json,
        run_id=run_id,
        artifact_root=str(artifact_root),
    )


class DurableQuantWorker:
    def __init__(
        self,
        *,
        broker: JobBroker,
        registry: AttemptRegistry,
        artifact_store: ContentAddressedArtifactStore,
        executor: RunExecutor = execute_run_in_process,
        research_executor: RunExecutor | None = None,
        lease_seconds: float = DEFAULT_LEASE_SECONDS,
        grace_seconds: float = DEFAULT_GRACE_SECONDS,
        worker_id: str | None = None,
    ) -> None:
        self._broker = broker
        self._registry = registry
        self._artifact_store = artifact_store
        self._executor = executor
        # P10 is deliberately a distinct executor slot. A research producer
        # must never fall through to the legacy generic ProcessPool runner.
        self._research_executor = research_executor
        self._lease_seconds = lease_seconds
        self._grace_seconds = grace_seconds
        self._worker_id = worker_id or f"wkr_{datetime.now(UTC).timestamp():.0f}"

    async def start(self, subject: str = "quant.run.requested") -> None:
        # Keep the legacy subject exact and subscribe P10 explicitly.  The
        # latter is not a generic wildcard: only the server-owned producer
        # route may place a valid research envelope on it.
        await self._broker.subscribe(subject, self._handle_job)
        if subject == "quant.run.requested":
            await self._broker.subscribe("quant.run.requested.research", self._handle_job)

    def _intent_exists(self, run_id: str) -> bool:
        try:
            self._registry.run_intent(run_id)
            return True
        except DurableRunError:
            return False

    async def _handle_job(self, message: JobMessage) -> None:
        payload = message.payload
        is_research_producer = payload.get("schema_version") == "research.run-producer-job.v1"
        run_id = payload.get("run_id")
        attempt_id = payload.get("run_attempt_id")
        if not run_id or not attempt_id:
            logger.warning("job without run identity; ignored")
            return

        if is_research_producer:
            try:
                research_request = ResearchRunProducerRequest.model_validate(
                    payload.get("request_json")
                )
            except ValidationError:
                # A broker message cannot broaden the private P10 route. Its
                # producer had no valid durable request and is ignored rather
                # than being routed to a generic executor.
                logger.warning("invalid P10 research producer message; ignored")
                return
            if (
                research_request.run_id != run_id
                or research_request.worker_attempt_id != attempt_id
                or research_request.lease_epoch != payload.get("lease_epoch")
            ):
                logger.warning("P10 research producer identity mismatch; ignored")
                return
            request_json = research_request.model_dump(mode="json")
            executor = self._research_executor
        else:
            request_json = payload.get("request_json", {})
            executor = self._executor

        if not self._intent_exists(run_id):
            from portal_api.serialization import canonicalize

            encoded = json.dumps(
                canonicalize(request_json), sort_keys=True, separators=(",", ":")
            ).encode("utf-8")
            self._registry.create_run_intent(
                RunIntent(
                    run_id=run_id,
                    run_spec_sha256=hashlib.sha256(encoded).hexdigest(),
                    workspace_id=payload.get("workspace_id", "ws_unknown"),
                    created_at=datetime.now(UTC).isoformat(),
                    payload=request_json,
                )
            )
        attempt = self._registry.attempt(run_id, attempt_id)
        if attempt is None:
            attempt = self._registry.create_attempt(run_id, attempt_id=attempt_id)
        if attempt.status in {"SUCCEEDED", "FAILED", "CANCELLED", "LEASE_LOST"}:
            logger.info(
                "redelivery no-op for completed attempt %s/%s", run_id, attempt_id
            )
            return
        if attempt.status == "CLAIMED" and (attempt.lease_until or 0) > time.time():
            logger.info("attempt %s still leased; skip", attempt_id)
            return

        attempt = self._registry.claim(attempt, lease_seconds=self._lease_seconds)
        lease_token = attempt.lease_token or ""
        heartbeater: asyncio.Task | None = None
        progress_relay_task: asyncio.Task | None = None
        progress_relay_stop: asyncio.Event | None = None
        progress_journal: ResearchProgressJournal | None = None
        progress_relay: ResearchProgressRelay | None = None
        p10_temp_dir: Path | None = None
        is_delta_wfo = is_research_producer and research_request.research.is_delta_wfo
        # W5a A10c: a what-if diagnostic runs its parent's WFO study in the
        # same confined child and seals one WHATIF_GRID relation instead of
        # an RS-02 current-source lane.
        is_whatif = is_research_producer and research_request.research.is_whatif
        is_final_audit = is_research_producer and research_request.research.is_final_audit
        is_imported_alpha = is_research_producer and research_request.research.is_imported_alpha
        executor_settled = False
        whatif_job = research_request.research.whatif if is_whatif else None
        try:
            if is_final_audit and not (
                _flag("PORTAL_FEATURE_RESEARCH_WFO_PROFILE")
                and _flag("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS")
                and _flag("PORTAL_FEATURE_RESEARCH_PROGRESS")
            ):
                raise _DeltaWfoProfileUnavailable("Pinned audit requires WFO, P05 custody and P11 progress")
            if is_imported_alpha and not (
                _flag("PORTAL_FEATURE_RESEARCH_IMPORTED_EXECUTION")
                and _flag("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS")
                and _flag("PORTAL_FEATURE_RESEARCH_PROGRESS")
            ):
                raise _DeltaWfoProfileUnavailable(
                    "E17 imported Alpha execution requires PORTAL_FEATURE_RESEARCH_IMPORTED_EXECUTION, "
                    "PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS and PORTAL_FEATURE_RESEARCH_PROGRESS"
                )
            if is_whatif and not (
                _flag("PORTAL_FEATURE_RESEARCH_WHATIF")
                and _flag("PORTAL_FEATURE_RESEARCH_WFO_PROFILE")
                and _flag("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS")
                and _flag("PORTAL_FEATURE_RESEARCH_PROGRESS")
            ):
                raise _DeltaWfoProfileUnavailable(
                    "P16 what-if diagnostic requires PORTAL_FEATURE_RESEARCH_WHATIF, "
                    "PORTAL_FEATURE_RESEARCH_WFO_PROFILE, PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS "
                    "and PORTAL_FEATURE_RESEARCH_PROGRESS"
                )
            if is_delta_wfo and not (
                _flag("PORTAL_FEATURE_RESEARCH_WFO_PROFILE")
                and _flag("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS")
                and _flag("PORTAL_FEATURE_RESEARCH_PROGRESS")
            ):
                # Refused before any journal, child or artifact exists. The
                # Control API admission refuses first; this is the worker's
                # own fence against a dark or mis-configured replica.
                raise _DeltaWfoProfileUnavailable(
                    "P10 Delta WFO profile requires PORTAL_FEATURE_RESEARCH_WFO_PROFILE, "
                    "PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS and PORTAL_FEATURE_RESEARCH_PROGRESS"
                )
            # Research preview only: a long WFO declares its admitted trial
            # count and the preview child CPU cap. Off, both stay locked.
            wfo_trials = DELTA_WFO_OPTUNA_TRIALS
            wfo_cpu_cap = DELTA_WFO_CPU_SECONDS
            if is_delta_wfo and not is_whatif:
                try:
                    if research_request.research.execution_profile_id == DELTA_CAUSAL_INNER_PROFILE_ID:
                        planner = getattr(self._research_executor, "causal_planned_trials", None)
                        if not callable(planner):
                            raise _DeltaWfoProfileUnavailable("Causal executor cannot bind its trial count to the immutable snapshot")
                        wfo_trials = await asyncio.to_thread(planner, research_request)
                        wfo_cpu_cap = 120
                    else:
                        wfo_trials = delta_wfo_admitted_trials(research_request.research.requested_spec)
                        wfo_cpu_cap = delta_wfo_child_cpu_seconds()
                except (DeltaWfoPreviewLongMisconfigured, ValueError) as exc:
                    raise _DeltaWfoProfileUnavailable(str(exc)) from exc
            progress_enabled = (
                is_research_producer
                and os.getenv("PORTAL_FEATURE_RESEARCH_PROGRESS", "false").strip().lower() == "true"
            )
            if progress_enabled:
                # The journal sits beside the already-durable attempt ledger,
                # never in ephemeral P10 scratch.  It is written before the
                # asynchronous callback so an outage cannot erase progress.
                progress_journal = ResearchProgressJournal(
                    self._registry.root,
                    run_id=run_id,
                    attempt_id=attempt.run_attempt_id,
                    lease_epoch=research_request.lease_epoch,
                    planned_trials=(
                        0 if is_final_audit else len(whatif_job.evaluations) if whatif_job is not None
                        else wfo_trials if is_delta_wfo else 1
                    ),
                    cpu_cap_seconds=(
                        120 if is_final_audit else WHATIF_CPU_SECONDS if is_whatif else IMPORTED_ALPHA_CPU_SECONDS
                        if is_imported_alpha else wfo_cpu_cap if is_delta_wfo else 45
                    ),
                    profile=(
                        "PINNED_FINAL_AUDIT" if is_final_audit else "DELTA_WHATIF" if is_whatif else "IMPORTED_ALPHA"
                        if is_imported_alpha else "DELTA_WFO" if is_delta_wfo else "P04_FIXED"
                    ),
                )
                try:
                    progress_relay = ResearchProgressRelay.from_environment(
                        journal=progress_journal,
                        job_id=research_request.job_id,
                        workspace_id=research_request.workspace_id,
                    )
                except ResearchProgressRelayError as exc:
                    # A deployment that deliberately enables P11 must supply
                    # its private relay; running silently dark would make the
                    # product claim durable progress it does not have.
                    raise DurableRunError(str(exc)) from exc
                existing_progress = progress_journal.snapshot()
                if existing_progress["status"] in {"COMPLETED", "FAILED"}:
                    # Source-terminal state is durable and sequence-fenced.
                    # A process may have died after the source terminal
                    # receipt but before its local attempt ledger transition.
                    # Reconcile that narrow crash window; do not execute the
                    # immutable attempt again.
                    attempt = await self._reconcile_terminal_progress_journal(
                        attempt=attempt,
                        lease_token=lease_token,
                        journal=progress_journal,
                        relay=progress_relay,
                        snapshot=existing_progress,
                        is_research_producer=is_research_producer,
                    )
                    return
                if existing_progress["status"] != "QUEUED":
                    raise _ProgressJournalRecoveryRequired(
                        "P11 reclaimed a non-terminal source journal; create a new P12 retry instead"
                    )
                progress_journal.emit("run_started")
                if os.getenv("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS", "false").lower() == "true":
                    # P05 reserve requires a RUNNING P06 lease. A source
                    # journal alone is not authority: wait for its exact
                    # start event to be accepted before executing the child.
                    if progress_relay is None or not await _await_start_acknowledged(progress_relay):
                        raise ResearchRetainedReceiptError("P05 start lease was not acknowledged")
                if progress_relay is not None:
                    progress_relay_stop = asyncio.Event()
                    progress_relay_task = asyncio.create_task(
                        progress_relay.run_until(progress_relay_stop)
                    )
            heartbeater = asyncio.create_task(
                self._heartbeat_loop(attempt, lease_token, progress_journal)
            )
            attempt = self._registry.transition(
                attempt, to="RUNNING", lease_token=lease_token
            )
            if executor is None:
                raise RuntimeError("research producer executor is not configured")
            if (
                is_research_producer
                and self._registry.cancellation_requested(
                    run_id,
                    attempt.run_attempt_id,
                    lease_epoch=research_request.lease_epoch,
                )
            ):
                raise DurableRunCancelled("P11 cancellation was requested before the child started")
            temp_dir = self._artifact_store.temp_dir(run_id, attempt.run_attempt_id)
            if is_research_producer:
                # P10 source/receipt output is staged under the content
                # addressed attempt temp directory, never at the shared
                # artifact root. A reclaimed lease starts from an empty
                # validated temp directory so stale partial output cannot be
                # bundled with a later execution.
                self._clear_p10_temp_dir(temp_dir)
                p10_temp_dir = temp_dir
                engine_root = temp_dir / ".p10-engine"
            else:
                engine_root = Path(self._artifact_store.root)
            progress_executor = getattr(executor, "execute_with_progress", None)
            try:
                if is_research_producer and progress_journal is not None and callable(progress_executor):
                    result = await progress_executor(
                        request_json,
                        run_id,
                        engine_root,
                        progress_journal,
                    )
                else:
                    result = await executor(request_json, run_id, engine_root)
            finally:
                # The research executor joins its bounded to_thread child even
                # on cancellation. No terminal cleanup can race a live child.
                executor_settled = True
            if result.get("status") != "COMPLETED":
                raise DurableRunError(
                    f"engine returned {result.get('status')}"
                )
            if (
                is_research_producer
                and self._registry.cancellation_requested(
                    run_id,
                    attempt.run_attempt_id,
                    lease_epoch=research_request.lease_epoch,
                )
            ):
                # Do not seal a completed-looking artifact after Control API
                # has fenced this exact lease.  The immutable source files are
                # still confined to the attempt scratch and the P06 terminal
                # CAS will record CANCELLED rather than a misleading success.
                raise DurableRunCancelled("P11 cancellation was requested before artifact seal")
            if is_research_producer and result.get("is_qualification_source") is not None:
                from portal_api.services.research_is_qualification_retention import retain_is_qualification

                def qualification_fence(_binding: object) -> bool:
                    current = self._registry.attempt(run_id, attempt.run_attempt_id)
                    return (
                        current is not None
                        and current.status in {"CLAIMED", "RUNNING"}
                        and self._registry.verify_lease(current, lease_token=lease_token)
                        and not self._registry.cancellation_requested(
                            run_id, attempt.run_attempt_id, lease_epoch=research_request.lease_epoch
                        )
                    )

                await _joined_retention_thread(
                    retain_is_qualification, request=research_request,
                    source=result["is_qualification_source"], source_path=result.get("is_qualification_path"),
                    private_root=Path(self._artifact_store.root), evidence=result["research_evidence"],
                    fence_validator=qualification_fence,
                )
            engine_dir = engine_root / run_id
            self._artifact_store.stage_directory(engine_dir, temp_dir)
            evidence_digest: str | None = None
            handoff_cursor: dict[str, Any] | None = None
            if is_delta_wfo:
                # W1 row G: reserve → RS-02 export → P05 seal → batches →
                # current-source seal, all before `run_completed`. There is no
                # dark fallback: a WFO run without retained rows is a failure.
                current_source = ResearchCurrentSourceRetentionClient.from_environment()
                if progress_journal is None:
                    raise ResearchCurrentSourceRetentionError("RS-02 retention requires the P11 progress lease")

                def current_wfo_fence(_fence: object) -> bool:
                    current = self._registry.attempt(run_id, attempt.run_attempt_id)
                    return (
                        current is not None
                        and current.status in {"CLAIMED", "RUNNING"}
                        and self._registry.verify_lease(current, lease_token=lease_token)
                        and not self._registry.cancellation_requested(
                            run_id, attempt.run_attempt_id, lease_epoch=research_request.lease_epoch
                        )
                    )

                retention = await _joined_retention_thread(
                    current_source.retain,
                    request=research_request,
                    source_root=engine_root / WFO_SOURCE_DIRNAME,
                    artifact_root=Path(self._artifact_store.root),
                    fence_validator=current_wfo_fence,
                )
                handoff_cursor = self._emit_retained_wfo_progress(progress_journal, retention)
            elif is_whatif:
                # W5a A10c: reserve → P05 whatif_results → P05 seal →
                # WHATIF_GRID seal, all before `run_completed`. The frozen
                # parent run is never written.
                if progress_journal is None or whatif_job is None:
                    raise ResearchWhatIfRetentionError("P16 what-if retention requires the P11 progress lease")
                whatif_client = ResearchWhatIfRetentionClient.from_environment()
                results = read_whatif_results(
                    engine_root / WFO_SOURCE_DIRNAME / run_id / "whatif_results.json",
                    grid_key=whatif_job.grid_key,
                    evaluation_keys={entry.evaluation_key for entry in whatif_job.evaluations},
                )

                def current_whatif_fence(_fence: object) -> bool:
                    current = self._registry.attempt(run_id, attempt.run_attempt_id)
                    return (
                        current is not None
                        and current.status in {"CLAIMED", "RUNNING"}
                        and self._registry.verify_lease(current, lease_token=lease_token)
                        and not self._registry.cancellation_requested(
                            run_id, attempt.run_attempt_id, lease_epoch=research_request.lease_epoch
                        )
                    )

                await _joined_retention_thread(
                    whatif_client.retain,
                    request=research_request,
                    results=results,
                    artifact_root=Path(self._artifact_store.root),
                    fence_validator=current_whatif_fence,
                )
                self._emit_whatif_trials(progress_journal, results)
            elif is_research_producer:
                p04_parameters = research_request.research.p04_parameters
                if p04_parameters is not None:
                    # The fixed profile hands over its one fold, its one
                    # trial and the exact parameter bundle P14 digests.
                    handoff_cursor = {
                        "fold": 1,
                        "trial": 1,
                        "params_digest": parameter_bundle_digest(dict(p04_parameters)),
                    }
                retained = ResearchRetainedReceiptClient.from_environment()
                if retained is not None:
                    receipt = result.get("research_receipt")
                    if not isinstance(receipt, dict) or progress_journal is None:
                        raise ResearchRetainedReceiptError("P05 source receipt or progress lease is unavailable")
                    def current_fence(_fence: object) -> bool:
                        current = self._registry.attempt(run_id, attempt.run_attempt_id)
                        return (
                            current is not None
                            and current.status in {"CLAIMED", "RUNNING"}
                            and self._registry.verify_lease(current, lease_token=lease_token)
                            and not self._registry.cancellation_requested(
                                run_id, attempt.run_attempt_id, lease_epoch=research_request.lease_epoch
                            )
                        )
                    await _joined_retention_thread(
                        retained.retain,
                        request=research_request,
                        receipt=receipt,
                        artifact_root=Path(self._artifact_store.root),
                        fence_validator=current_fence,
                        fixed_replay_path=(
                            engine_root / research_request.run_id / "research" / "fixed-replay.parquet"
                            if isinstance(receipt.get("fixed_replay_source"), dict)
                            and receipt["fixed_replay_source"].get("state") == "AVAILABLE"
                            else None
                        ),
                        **({"audit_source_root": engine_root / WFO_SOURCE_DIRNAME / run_id} if is_final_audit else {}),
                    )
            split_digest: str | None = None
            sealed_names: list[str] = []
            if is_research_producer:
                shutil.rmtree(engine_root)
                if progress_journal is not None:
                    progress_journal.emit("stage_started", {"stage": "S5"})
                    progress_journal.emit("seal_started")
                    research_dir = temp_dir / "research"
                    research_dir.mkdir(mode=0o700, exist_ok=True)
                    # These are explicit artifact lifecycle facts.  The
                    # progress view never promotes a path or a partial file
                    # to a readable artifact merely because a console says
                    # that sealing began.
                    for name in RESEARCH_IDENTITY_ARTIFACTS:
                        progress_journal.emit("artifact_writing", {"name": name})
                    self._write_research_identity_artifacts(research_dir, research_request)
                    sealed_names.extend(RESEARCH_IDENTITY_ARTIFACTS)
                    source_evidence = result.get("research_evidence")
                    if source_evidence is not None:
                        if not isinstance(source_evidence, dict):
                            raise DurableRunError("P13 source evidence receipt is invalid")
                        # Write the receipt before the terminal event. A lost
                        # Control callback can then be retried from the P11
                        # journal without reopening QuantBT or an artifact.
                        evidence_digest = progress_journal.store_evidence_source(source_evidence)
                        progress_journal.emit("artifact_writing", {"name": "research/evidence-source.json"})
                        progress_journal.export_evidence_source_to(
                            research_dir / "evidence-source.json",
                            evidence_digest,
                        )
                        sealed_names.append("research/evidence-source.json")
                    source_split = result.get("research_split")
                    if source_split is not None:
                        if not isinstance(source_split, dict):
                            raise DurableRunError("P14 source split receipt is invalid")
                        # The terminal chronology receipt is persisted before
                        # its digest can enter P11. It has no raw rows,
                        # holdout values, source path or unlock authority.
                        split_digest = progress_journal.store_split_source(source_split)
                        progress_journal.emit("artifact_writing", {"name": "research/split-source.json"})
                        progress_journal.export_split_source_to(
                            research_dir / "split-source.json",
                            split_digest,
                        )
                        sealed_names.append("research/split-source.json")
                    # Export the journal only after every artifact entered
                    # WRITING. This makes the persisted console/progress
                    # receipt truthful without attempting the impossible
                    # self-reference of writing its own SEALED digest.
                    progress_journal.emit("artifact_writing", {"name": "research/progress-journal.ndjson"})
                    progress_journal.emit("artifact_writing", {"name": "research/progress-receipt.json"})
                    sealed_names.extend(("research/progress-journal.ndjson", "research/progress-receipt.json"))
                    progress_journal.export_to(research_dir / "progress-journal.ndjson")
                    self._write_progress_receipt(
                        research_dir / "progress-receipt.json",
                        progress_journal.snapshot(),
                    )
            bundle = self._artifact_store.commit_bundle(
                run_id=run_id,
                attempt_id=attempt.run_attempt_id,
                temp_dir=temp_dir,
                required_files=(
                    tuple(sealed_names)
                    if progress_journal is not None else ()
                ),
                manifest_extra={"engine": {"status": "COMPLETED"}},
            )
            if progress_journal is not None:
                progress_journal.mark_mandatory_sealed(
                    bundle_digest=bundle.bundle_sha256,
                    bundle_bytes=sum((temp_dir / name).stat().st_size for name in bundle.files),
                )
                for name in sealed_names:
                    digest = bundle.files.get(name)
                    if digest is None:
                        raise DurableRunError("P11 mandatory progress artifact was not sealed")
                    progress_journal.emit("artifact_sealed", {
                        "name": name,
                        "size": str((temp_dir / name).stat().st_size),
                        "digest": digest,
                        "reader_href": None,
                    })
                progress_journal.emit("stage_completed", {"stage": "S5"})
            if progress_journal is not None:
                completion_payload = {
                    # P11 only carries bounded, measured receipt fields into
                    # Control API's durable P06 closeout.  It does not infer
                    # metrics from stdout, a console tail, or filesystem
                    # paths.  A field the receipt did not measure is null
                    # (CG-P11-09), never a zero that reads as a measurement.
                    "usage": self._p11_usage(
                        result,
                        cpu_cap_seconds=120 if is_final_audit else WHATIF_CPU_SECONDS if is_whatif else wfo_cpu_cap if is_delta_wfo else 45,
                    ),
                }
                if evidence_digest is not None:
                    completion_payload["evidence_digest"] = evidence_digest
                if split_digest is not None:
                    completion_payload["split_digest"] = split_digest
                if handoff_cursor is not None:
                    completion_payload["handoff_cursor"] = handoff_cursor
                progress_journal.emit("run_completed", completion_payload)
            # The source journal is fsync'd before the local attempt is made
            # terminal.  Otherwise a crash in this tiny window would leave a
            # sealed bundle and a SUCCEEDED attempt with no recoverable P11
            # completion event.  On redelivery the terminal source receipt is
            # reconciled above without re-executing the attempt.
            attempt = self._registry.transition(
                attempt,
                to="SUCCEEDED",
                lease_token=lease_token,
                artifacts_sha256=bundle.bundle_sha256,
            )
            if progress_journal is not None:
                if progress_relay is not None:
                    try:
                        await progress_relay.flush()
                    except ResearchProgressRelayError:
                        # The fsync'd journal is the recovery authority. A
                        # post-seal callback outage must never turn a sealed
                        # bundle into an artificial failed worker attempt.
                        logger.warning("P11 terminal progress relay deferred", exc_info=True)
            await self._publish_terminal_event("quant.run.succeeded", {
                "run_id": run_id,
                "run_attempt_id": attempt.run_attempt_id,
                "bundle_sha256": bundle.bundle_sha256,
                "producer": "research.run-producer.v1" if is_research_producer else "legacy",
            })
            if is_research_producer:
                # Blobs and the immutable bundle are already committed. Do
                # not retain a second unaddressed copy of P10 artifacts.
                self._clear_p10_temp_dir(temp_dir)
        except asyncio.CancelledError:
            if progress_journal is not None:
                try:
                    progress_journal.emit("run_failed", {
                        "code": "USER_CANCELLED",
                        "message": "run cancelled by worker shutdown",
                        "usage": self._p11_usage({}),
                    })
                except (ResearchProgressError, ResearchProgressRelayError):
                    pass
            attempt = self._registry.transition(
                attempt,
                to="CANCELLED",
                lease_token=lease_token,
                failure_code="CANCELLED",
            )
            raise
        except Exception as exc:  # noqa: BLE001 - standardized failure codes below
            failure_code = self._classify(exc)
            failure_message = "artifact storage capacity exhausted" if self._storage_full(exc) else str(exc)
            should_write_terminal_progress = not isinstance(exc, _ProgressJournalRecoveryRequired)
            if progress_journal is not None and should_write_terminal_progress:
                try:
                    # Persist the source terminal receipt before changing the
                    # local attempt ledger.  A later redelivery can reconcile
                    # from this exact journal; it must never infer a terminal
                    # state from console text, a temp directory, or a broker
                    # notification.
                    progress_journal.emit("run_failed", {
                        "code": "USER_CANCELLED" if failure_code == "CANCELLED" else failure_code,
                        "message": "run cancelled by researcher" if failure_code == "CANCELLED" else failure_message[:1024],
                        "usage": self._p11_usage({}),
                    })
                except (ResearchProgressError, ResearchProgressRelayError):
                    logger.warning("P11 terminal progress event could not be journalled", exc_info=True)
            try:
                attempt = self._registry.transition(
                    attempt,
                    to=(
                        "CANCELLED"
                        if failure_code == "CANCELLED"
                        else "LEASE_LOST"
                        if failure_code == "LEASE_LOST"
                        else "FAILED"
                    ),
                    lease_token=lease_token,
                    failure_code=failure_code if failure_code != "CANCELLED" else None,
                    failure_message=failure_message,
                )
            except DurableRunError:
                logger.exception("failed attempt transition after engine error")
            if progress_journal is not None and should_write_terminal_progress:
                try:
                    if progress_relay is not None:
                        await progress_relay.flush()
                except (ResearchProgressError, ResearchProgressRelayError):
                    logger.warning("P11 terminal progress event was journalled but could not be relayed", exc_info=True)
            await self._publish_terminal_event("quant.run.failed", {
                "run_id": run_id,
                "run_attempt_id": attempt.run_attempt_id,
                "failure_code": failure_code,
                "producer": "research.run-producer.v1" if is_research_producer else "legacy",
            })
        finally:
            if is_research_producer and executor_settled:
                persisted = self._registry.attempt(run_id, attempt.run_attempt_id)
                retire = getattr(executor, "retire_terminal_scratch", None)
                if (
                    persisted is not None
                    and persisted.status in {"SUCCEEDED", "FAILED", "CANCELLED", "LEASE_LOST"}
                    and persisted.lease_token == lease_token
                    and callable(retire)
                ):
                    try:
                        retire(
                            job_id=research_request.job_id,
                            run_id=run_id,
                            worker_attempt_id=attempt.run_attempt_id,
                            lease_epoch=research_request.lease_epoch,
                        )
                    except Exception:
                        # A cleanup failure cannot rewrite a terminal run or
                        # conceal its sealed evidence. The plateau gate will
                        # still detect and report retained scratch.
                        logger.exception("P23 terminal scratch retirement failed")
            if p10_temp_dir is not None:
                # Covers child failure, cancellation and staging/commit
                # failure. The immutable bundle (if any) is already outside
                # this attempt temp directory; only disposable P10 material
                # is removed here.
                self._clear_p10_temp_dir(p10_temp_dir)
            if heartbeater is not None:
                heartbeater.cancel()
                try:
                    await heartbeater
                except asyncio.CancelledError:
                    pass
            if progress_relay_stop is not None:
                progress_relay_stop.set()
            if progress_relay_task is not None:
                try:
                    await progress_relay_task
                except asyncio.CancelledError:
                    pass

    async def _reconcile_terminal_progress_journal(
        self,
        *,
        attempt: RunAttempt,
        lease_token: str,
        journal: ResearchProgressJournal,
        relay: ResearchProgressRelay | None,
        snapshot: dict[str, Any],
        is_research_producer: bool,
    ) -> RunAttempt:
        """Close the local ledger from an already-fsync'd source terminal.

        This is deliberately a narrow recovery operation.  It accepts only a
        terminal P11 journal for the exact claimed attempt; it does not scan
        temp directories, parse console text, manufacture usage, or retry an
        execution.  A completed source record additionally has to resolve its
        immutable content-addressed bundle before local success is recorded.
        """

        status = snapshot.get("status")
        producer = "research.run-producer.v1" if is_research_producer else "legacy"
        if status == "COMPLETED":
            mandatory = snapshot.get("mandatory_bundle")
            digest = mandatory.get("digest") if isinstance(mandatory, dict) else None
            if (
                snapshot.get("readiness", {}).get("mandatory") != "SEALED"
                or not isinstance(digest, str)
                or len(digest) != 64
            ):
                raise DurableRunError("P11 completed journal has no valid mandatory bundle")
            manifest = self._artifact_store.open_bundle(
                attempt.run_id,
                attempt.run_attempt_id,
                digest,
            )
            if (
                manifest.get("run_id") != attempt.run_id
                or manifest.get("run_attempt_id") != attempt.run_attempt_id
                or manifest.get("status") != "succeeded"
            ):
                raise DurableRunError("P11 mandatory bundle does not match the journal identity")
            attempt = self._registry.transition(
                attempt,
                to="SUCCEEDED",
                lease_token=lease_token,
                artifacts_sha256=digest,
            )
            await self._flush_terminal_progress_relay(relay)
            await self._publish_terminal_event("quant.run.succeeded", {
                "run_id": attempt.run_id,
                "run_attempt_id": attempt.run_attempt_id,
                "bundle_sha256": digest,
                "producer": producer,
            })
            return attempt

        if status == "FAILED":
            failure = snapshot.get("failure")
            source_code = failure.get("code") if isinstance(failure, dict) else None
            source_message = failure.get("message") if isinstance(failure, dict) else None
            cancelled = source_code in {"CANCELLED", "USER_CANCELLED"}
            failure_code = (
                "CANCELLED"
                if cancelled
                else source_code
                if source_code in STANDARD_FAILURE_CODES
                else "ENGINE_ERROR"
            )
            attempt = self._registry.transition(
                attempt,
                to="CANCELLED" if cancelled else "FAILED",
                lease_token=lease_token,
                failure_code=None if cancelled else failure_code,
                failure_message=source_message if isinstance(source_message, str) else "P11 source journal reported failure",
            )
            await self._flush_terminal_progress_relay(relay)
            await self._publish_terminal_event("quant.run.failed", {
                "run_id": attempt.run_id,
                "run_attempt_id": attempt.run_attempt_id,
                "failure_code": failure_code,
                "producer": producer,
            })
            return attempt

        raise _ProgressJournalRecoveryRequired("P11 journal is not terminal")

    @staticmethod
    async def _flush_terminal_progress_relay(relay: ResearchProgressRelay | None) -> None:
        if relay is None:
            return
        try:
            await relay.flush()
        except ResearchProgressRelayError:
            # The journal is the recovery authority.  Local completion must
            # not be rewritten merely because the callback happens to be
            # unavailable during this one recovery attempt.
            logger.warning("P11 terminal progress relay deferred during recovery", exc_info=True)

    async def _heartbeat_loop(
        self,
        attempt: RunAttempt,
        lease_token: str,
        progress_journal: ResearchProgressJournal | None = None,
    ) -> None:
        while True:
            await asyncio.sleep(max(self._lease_seconds / 3.0, 1.0))
            current = self._registry.attempt(attempt.run_id, attempt.run_attempt_id)
            if current is None or current.status in {"SUCCEEDED", "FAILED", "CANCELLED", "LEASE_LOST"}:
                return
            if current.lease_token != lease_token:
                raise DurableRunError("lease lost during heartbeat")
            await asyncio.to_thread(
                self._registry.heartbeat,
                current,
                lease_token=lease_token,
                lease_seconds=self._lease_seconds,
            )
            if progress_journal is not None:
                progress_journal.emit("heartbeat")

    @staticmethod
    def _storage_full(exc: Exception) -> bool:
        return (
            isinstance(exc, ResearchArtifactError) and exc.reason == "RESEARCH_ARTIFACT_DISK_FULL"
        ) or (isinstance(exc, OSError) and exc.errno in {errno.ENOSPC, errno.EDQUOT})

    @staticmethod
    def _classify(exc: Exception) -> str:
        if DurableQuantWorker._storage_full(exc):
            return "RESOURCE_EXCEEDED"
        if isinstance(exc, asyncio.CancelledError):
            return "CANCELLED"
        if isinstance(exc, DurableRunError):
            return exc.code if exc.code in {
                "ENGINE_IMPORT_FAILED", "CAPABILITY_MISMATCH", "DATASET_NOT_FOUND",
                "SCHEMA_INVALID", "ALPHA_IMPORT_FAILED", "RESOURCE_EXCEEDED",
                "CANCELLED", "ENGINE_ERROR", "ARTIFACT_COMMIT_FAILED", "LEASE_LOST",
            } else "CAPABILITY_MISMATCH"
        typed_code = getattr(exc, "code", None)
        if typed_code in STANDARD_FAILURE_CODES:
            return typed_code
        message = str(exc)
        if "research producer executor" in message.lower() or "p10" in message.lower():
            return "CAPABILITY_MISMATCH"
        if "import" in message.lower() and "engine" in message.lower():
            return "ENGINE_IMPORT_FAILED"
        if "dataset" in message.lower():
            return "DATASET_NOT_FOUND"
        if "schema" in message.lower():
            return "SCHEMA_INVALID"
        if "cancel" in message.lower():
            return "CANCELLED"
        if "lease" in message.lower():
            return "LEASE_LOST"
        return "ENGINE_ERROR"

    async def _publish_terminal_event(self, subject: str, payload: dict[str, Any]) -> None:
        """Publish observation without rolling back durable work already sealed.

        The bundle and attempt registry are the P10/P06 completion authority.
        Event retention/replay and a durable status projection belong to P11;
        a missing or temporarily unavailable terminal-event stream must not
        turn a successfully committed run into a failed retry, nor retain a
        duplicate P10 scratch directory.  A later P11 reconciler may publish
        from the durable authority, but this worker never invents completion.
        """

        try:
            await self._broker.publish(subject, payload)
        except Exception:  # noqa: BLE001 - terminal notification is non-authoritative
            logger.warning(
                "terminal worker notification was not published; durable state remains authoritative",
                extra={"subject": subject, "run_id": payload.get("run_id")},
                exc_info=True,
            )

    @staticmethod
    def _clear_p10_temp_dir(temp_dir: Path) -> None:
        """Clear only an attempt-scoped P10 scratch directory we derived.

        ``temp_dir`` always comes from ``ContentAddressedArtifactStore`` with
        already-validated run/attempt identifiers. This helper never walks a
        configured root or arbitrary caller path.
        """

        for child in temp_dir.iterdir():
            if child.is_dir():
                shutil.rmtree(child)
            else:
                child.unlink()

    @staticmethod
    def _write_progress_receipt(path: Path, snapshot: dict[str, Any]) -> None:
        """Persist a small sealed receipt, never a worker path/secret/lease."""

        payload = {
            "schema_version": "research.p11.progress-receipt.v1",
            "run_id": snapshot["run_id"],
            "attempt_id": snapshot["attempt_id"],
            "latest_sequence": snapshot["latest_sequence"],
            "retention_floor_sequence": snapshot["retention_floor_sequence"],
            "readiness": snapshot["readiness"],
            "source": snapshot["source"],
        }
        path.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        path.chmod(0o600)

    @staticmethod
    def _write_research_identity_artifacts(
        research_dir: Path,
        request: ResearchRunProducerRequest,
    ) -> None:
        """Seal the three immutable producer inputs P11 names as artifacts.

        These receipts deliberately omit credentials, source paths, lease
        tokens and raw market rows. They are reconstructed only from the
        already validated P10 envelope and remain bounded by its 64-KiB cap.
        """

        research = request.research
        documents = {
            "requested-spec.json": {
                "schema_version": "research.p11.requested-spec-receipt.v1",
                "run_id": request.run_id,
                "attempt_id": request.worker_attempt_id,
                "requested_spec": research.requested_spec,
                "requested_spec_digest": research.requested_spec_digest,
            },
            "effective-spec-receipt.json": {
                "schema_version": "research.p11.effective-spec-receipt.v1",
                "run_id": request.run_id,
                "attempt_id": request.worker_attempt_id,
                "effective_spec_digest": research.effective_spec_digest,
                "manifest_digest": research.manifest_digest,
                "execution_adapter_id": research.execution_adapter_id,
                "adapter_contract_digest": research.adapter_contract_digest,
                "execution_profile_id": research.execution_profile_id,
                "execution_profile_digest": research.execution_profile_digest,
            },
            "dataset-binding-receipt.json": {
                "schema_version": "research.p11.dataset-binding-receipt.v1",
                "run_id": request.run_id,
                "attempt_id": request.worker_attempt_id,
                "snapshot_id": research.snapshot_id,
                "snapshot_content_hash": research.snapshot_content_hash,
                "dataset_binding_digest": research.dataset_binding_digest,
            },
        }
        for name, payload in documents.items():
            path = research_dir / name
            path.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8")
            path.chmod(0o600)

    @staticmethod
    def _emit_whatif_trials(journal: ResearchProgressJournal, results: list[dict[str, Any]]) -> None:
        """Close the diagnostic study from its sealed results.

        Trials seen live on the child's Optuna channel stay as they are; any
        the channel missed are claimed from the sealed result rows. There is
        no fold and no selection: a diagnostic evaluates, it never selects.
        """

        total = len(results)
        live = int(journal.snapshot()["overall"]["trials_done"])
        if live > total:
            raise DurableRunError("P11 observed more live what-if trials than the sealed results hold")
        for index in range(live + 1, total + 1):
            state = results[index - 1]["state"]
            journal.emit("trial_completed", {
                "study": "GLOBAL",
                "trial": index,
                "eta_s": None,
                "state": "COMPLETE" if state == "COMPLETE" else "PRUNED",
                "tqdm_line": f"what-if · evaluation {index}/{total} · from sealed results",
                "console": {
                    "tone": "COMPLETE",
                    "text": f"what-if evaluation {index} sealed (not observed live)",
                    "trial": index,
                },
            })

    @staticmethod
    def _emit_retained_wfo_progress(
        journal: ResearchProgressJournal,
        retention: CurrentSourceRetentionResult,
    ) -> dict[str, Any]:
        """Close the WFO study from the rows Control API has retained.

        Trials were already observed live from the child's Optuna callback
        (CG-P06-02); the retained TRIAL rows are the authority they must
        match. A trial the live channel missed is claimed here from its
        retained row, and a live count above the retained count fails the run
        closed. Folds complete only now, one per retained FOLD row, each with
        the one global-study selection (trial, objective, parameter digest)
        from the retained SELECTION. No ``fold_segment_observed`` is emitted:
        QuantBT publishes no per-fold segment timestamps. Returns the
        structured hand-off cursor ``run_completed`` carries.
        """

        states = list(retention.trial_states)
        total = len(states)
        live = int(journal.snapshot()["overall"]["trials_done"])
        if live > total:
            raise DurableRunError("P11 observed more live WFO trials than the retained trial table holds")
        if getattr(retention, "causal_fold_selections", ()):
            trials = list(retention.causal_trials)
            folds = list(retention.causal_fold_selections)
            if len(trials) != total or len(folds) != retention.table_rows["FOLD"] or total != 3 * len(folds):
                raise DurableRunError("P11 retained causal study counts do not match")
            for index in range(live + 1, total + 1):
                source = trials[index - 1]
                journal.emit("trial_completed", {"study": "PER_FOLD_STUDY", "trial": index, "eta_s": None,
                    "study_id": source["study_id"], "source_trial_id": source["source_trial_id"],
                    "state": source["state"], "objective": source["objective"],
                    "tqdm_line": f"per-fold studies · trial {index}/{total} · from retained trial table"})
            for ordinal, source in enumerate(folds, 1):
                selected = [(index + 1, trial) for index, trial in enumerate(trials)
                            if trial["trial_id"] == source["selected_trial_id"] and trial["study_id"] == source["study_id"]]
                if len(selected) != 1:
                    raise DurableRunError("P11 causal fold does not name one exact retained study trial")
                selected_trial, selected_row = selected[0]
                digest = parameter_bundle_digest(dict(source["parameters"]))
                journal.emit("fold_completed", {"fold": ordinal, "selection": {
                    "scope": "PER_FOLD_STUDY", "trial": selected_trial, "study_id": source["study_id"],
                    "source_trial_id": selected_row["source_trial_id"], "objective": source["objective"], "params_digest": digest}})
            journal.emit("stage_completed", {"stage": "S4"})
            return {"fold": len(folds), "trial": selected_trial, "params_digest": digest}
        for index in range(live + 1, total + 1):
            state = states[index - 1]
            payload: dict[str, Any] = {
                "study": "GLOBAL",
                "trial": index,
                "eta_s": None,
                "tqdm_line": f"global study · trial {index}/{total} · from retained trial table",
                "console": {
                    "tone": "COMPLETE",
                    "text": f"global trial {index} retained (not observed live)",
                    "trial": index,
                },
            }
            if state in {"COMPLETE", "PRUNED", "INFEASIBLE", "FAILED"}:
                payload["state"] = state
            journal.emit("trial_completed", payload)

        selection = retention.receipt.summary.get("selection") if isinstance(retention.receipt.summary, dict) else None
        if not isinstance(selection, dict):
            raise DurableRunError("P11 retained WFO selection is unavailable")
        trial_id = selection.get("trial_id")
        parameters = selection.get("parameters")
        if not isinstance(trial_id, str) or not trial_id.isdigit() or not isinstance(parameters, dict) or not parameters:
            raise DurableRunError("P11 retained WFO selection is not a numbered trial with parameters")
        selected_trial = int(trial_id) + 1  # Optuna trial numbers are 0-based; P11 ordinals are not.
        if not 1 <= selected_trial <= total:
            raise DurableRunError("P11 retained WFO selection names a trial outside the retained table")
        objective = selection.get("objective")
        if objective is not None and not isinstance(objective, str):
            raise DurableRunError("P11 retained WFO selection objective is invalid")
        digest = parameter_bundle_digest(parameters)
        fold_count = int(retention.table_rows["FOLD"])
        if fold_count < 1:
            raise DurableRunError("P11 retained WFO run has no fold")
        for fold in range(1, fold_count + 1):
            journal.emit("fold_completed", {
                "fold": fold,
                "selection": {
                    "scope": "GLOBAL_STUDY",
                    "trial": selected_trial,
                    "objective": objective,
                    "params_digest": digest,
                },
            })
        journal.emit("stage_completed", {"stage": "S4"})
        return {"fold": fold_count, "trial": selected_trial, "params_digest": digest}

    @staticmethod
    def _p11_usage(result: dict[str, Any], *, cpu_cap_seconds: int = 45) -> dict[str, int | None]:
        """Project the P10 child receipt into P06's exact usage shape.

        CG-P11-09: only measured quantities are numbers. The child receipt
        measures CPU seconds and peak RSS; there is no scratch high-water or
        descriptor probe, so those are ``None``. A missing, non-finite or
        negative CPU value is unmeasured (``None``), and so is a zero RSS: a
        running Python child always has resident memory, so zero only means
        the parent's rusage delta could not see it. Bounds are repeated here
        before the private callback; Control API validates them again.
        """

        receipt = result.get("research_receipt")
        resource = receipt.get("resource") if isinstance(receipt, dict) else None
        if not isinstance(resource, dict):
            resource = {}

        def measurement(name: str, maximum: int, *, zero_is_unmeasured: bool) -> int | None:
            value = resource.get(name)
            if (value is None or isinstance(value, bool) or not isinstance(value, (int, float))
                    or (isinstance(value, float) and not math.isfinite(value)) or value < 0):
                return None
            if zero_is_unmeasured and value == 0:
                return None
            # The child reports CPU seconds as a float. Round upward so a
            # positive partial second cannot appear as zero usage.
            return min(math.ceil(value), maximum)

        return {
            "peak_rss_bytes": measurement("peak_rss_bytes", 4 * 1024 * 1024 * 1024, zero_is_unmeasured=True),
            "cpu_seconds": measurement("cpu_seconds", cpu_cap_seconds, zero_is_unmeasured=False),
            "scratch_bytes": None,
            "fd_peak": None,
        }

    async def stop(self) -> None:
        await self._broker.close()


__all__ = ["DurableQuantWorker", "RunExecutor", "execute_run_in_process"]
