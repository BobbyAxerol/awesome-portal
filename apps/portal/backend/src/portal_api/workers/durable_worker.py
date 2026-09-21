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
import hashlib
import json
import logging
import os
import shutil
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Awaitable, Callable

from pydantic import ValidationError

from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.services.artifact_store import ContentAddressedArtifactStore
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

logger = logging.getLogger("portal_api.durable_worker")

RunExecutor = Callable[[dict[str, Any], str, Path], Awaitable[dict[str, Any]]]


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
        try:
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
                    planned_trials=1,
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
            if is_research_producer and progress_journal is not None and callable(progress_executor):
                result = await progress_executor(
                    request_json,
                    run_id,
                    engine_root,
                    progress_journal,
                )
            else:
                result = await executor(request_json, run_id, engine_root)
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
            engine_dir = engine_root / run_id
            self._artifact_store.stage_directory(engine_dir, temp_dir)
            evidence_digest: str | None = None
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
                    progress_journal.emit("artifact_writing", {"name": "research/progress-journal.ndjson"})
                    progress_journal.export_to(research_dir / "progress-journal.ndjson")
                    progress_journal.emit("artifact_writing", {"name": "research/progress-receipt.json"})
                    self._write_progress_receipt(
                        research_dir / "progress-receipt.json",
                        progress_journal.snapshot(),
                    )
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
            bundle = self._artifact_store.commit_bundle(
                run_id=run_id,
                attempt_id=attempt.run_attempt_id,
                temp_dir=temp_dir,
                required_files=(
                    (
                        "research/progress-journal.ndjson",
                        "research/progress-receipt.json",
                        *(("research/evidence-source.json",) if evidence_digest is not None else ()),
                    )
                    if progress_journal is not None else ()
                ),
                manifest_extra={"engine": {"status": "COMPLETED"}},
            )
            if progress_journal is not None:
                progress_journal.mark_mandatory_sealed(
                    bundle_digest=bundle.bundle_sha256,
                    bundle_bytes=sum((temp_dir / name).stat().st_size for name in bundle.files),
                )
                sealed_names = ["research/progress-journal.ndjson", "research/progress-receipt.json"]
                if evidence_digest is not None:
                    sealed_names.append("research/evidence-source.json")
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
                    # paths.  A field absent from the fixed P04 receipt stays
                    # zero rather than becoming a guessed measurement.
                    "usage": self._p11_usage(result),
                }
                if evidence_digest is not None:
                    completion_payload["evidence_digest"] = evidence_digest
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
                        "message": "run cancelled by researcher" if failure_code == "CANCELLED" else str(exc)[:1024],
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
                    failure_message=str(exc),
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
    def _classify(exc: Exception) -> str:
        if isinstance(exc, asyncio.CancelledError):
            return "CANCELLED"
        if isinstance(exc, DurableRunError):
            return exc.code if exc.code in {
                "ENGINE_IMPORT_FAILED", "CAPABILITY_MISMATCH", "DATASET_NOT_FOUND",
                "SCHEMA_INVALID", "ALPHA_IMPORT_FAILED", "RESOURCE_EXCEEDED",
                "CANCELLED", "ENGINE_ERROR", "ARTIFACT_COMMIT_FAILED", "LEASE_LOST",
            } else "CAPABILITY_MISMATCH"
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
    def _p11_usage(result: dict[str, Any]) -> dict[str, int]:
        """Project the fixed P10 child receipt into P06's exact usage shape.

        The source child currently measures peak RSS and CPU seconds.  There
        is no trustworthy fd/scratch probe in the immutable P04 receipt, so
        those values are explicitly zero rather than fabricated.  Bounds are
        repeated here before the private callback; Control API independently
        validates them before persisting a terminal job state.
        """

        receipt = result.get("research_receipt")
        resource = receipt.get("resource") if isinstance(receipt, dict) else None
        if not isinstance(resource, dict):
            resource = {}

        def measurement(name: str, maximum: int) -> int:
            value = resource.get(name, 0)
            if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                return 0
            return min(value, maximum)

        return {
            "peak_rss_bytes": measurement("peak_rss_bytes", 4 * 1024 * 1024 * 1024),
            "cpu_seconds": measurement("cpu_seconds", 45),
            "scratch_bytes": 0,
            "fd_peak": 0,
        }

    async def stop(self) -> None:
        await self._broker.close()


__all__ = ["DurableQuantWorker", "RunExecutor", "execute_run_in_process"]
