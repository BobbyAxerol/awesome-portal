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
    DurableRunError,
    AttemptRegistry,
    RunAttempt,
    RunIntent,
)
from portal_api.services.job_broker import JobBroker, JobMessage

logger = logging.getLogger("portal_api.durable_worker")

RunExecutor = Callable[[dict[str, Any], str, Path], Awaitable[dict[str, Any]]]


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
        if attempt.status in {"SUCCEEDED", "FAILED", "CANCELLED"}:
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
        p10_temp_dir: Path | None = None
        try:
            heartbeater = asyncio.create_task(
                self._heartbeat_loop(attempt, lease_token)
            )
            attempt = self._registry.transition(
                attempt, to="RUNNING", lease_token=lease_token
            )
            if executor is None:
                raise RuntimeError("research producer executor is not configured")
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
            result = await executor(request_json, run_id, engine_root)
            if result.get("status") != "COMPLETED":
                raise DurableRunError(
                    f"engine returned {result.get('status')}"
                )
            engine_dir = engine_root / run_id
            self._artifact_store.stage_directory(engine_dir, temp_dir)
            if is_research_producer:
                shutil.rmtree(engine_root)
            bundle = self._artifact_store.commit_bundle(
                run_id=run_id,
                attempt_id=attempt.run_attempt_id,
                temp_dir=temp_dir,
                required_files=(),
                manifest_extra={"engine": {"status": "COMPLETED"}},
            )
            attempt = self._registry.transition(
                attempt,
                to="SUCCEEDED",
                lease_token=lease_token,
                artifacts_sha256=bundle.bundle_sha256,
            )
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
            attempt = self._registry.transition(
                attempt,
                to="CANCELLED",
                lease_token=lease_token,
                failure_code="CANCELLED",
            )
            raise
        except Exception as exc:  # noqa: BLE001 - standardized failure codes below
            failure_code = self._classify(exc)
            try:
                attempt = self._registry.transition(
                    attempt,
                    to="FAILED",
                    lease_token=lease_token,
                    failure_code=failure_code,
                    failure_message=str(exc),
                )
            except DurableRunError:
                logger.exception("failed attempt transition after engine error")
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

    async def _heartbeat_loop(self, attempt: RunAttempt, lease_token: str) -> None:
        while True:
            await asyncio.sleep(max(self._lease_seconds / 3.0, 1.0))
            current = self._registry.attempt(attempt.run_id, attempt.run_attempt_id)
            if current is None or current.status in {"SUCCEEDED", "FAILED", "CANCELLED"}:
                return
            if current.lease_token != lease_token:
                raise DurableRunError("lease lost during heartbeat")
            await asyncio.to_thread(
                self._registry.heartbeat,
                current,
                lease_token=lease_token,
                lease_seconds=self._lease_seconds,
            )

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

    async def stop(self) -> None:
        await self._broker.close()


__all__ = ["DurableQuantWorker", "RunExecutor", "execute_run_in_process"]
