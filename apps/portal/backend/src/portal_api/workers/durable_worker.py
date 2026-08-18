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
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Awaitable, Callable

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
        lease_seconds: float = DEFAULT_LEASE_SECONDS,
        grace_seconds: float = DEFAULT_GRACE_SECONDS,
        worker_id: str | None = None,
    ) -> None:
        self._broker = broker
        self._registry = registry
        self._artifact_store = artifact_store
        self._executor = executor
        self._lease_seconds = lease_seconds
        self._grace_seconds = grace_seconds
        self._worker_id = worker_id or f"wkr_{datetime.now(UTC).timestamp():.0f}"

    async def start(self, subject: str = "quant.run.requested") -> None:
        await self._broker.subscribe(subject, self._handle_job)

    def _intent_exists(self, run_id: str) -> bool:
        try:
            self._registry.run_intent(run_id)
            return True
        except DurableRunError:
            return False

    async def _handle_job(self, message: JobMessage) -> None:
        payload = message.payload
        run_id = payload.get("run_id")
        attempt_id = payload.get("run_attempt_id")
        if not run_id or not attempt_id:
            logger.warning("job without run identity; ignored")
            return

        if not self._intent_exists(run_id):
            from portal_api.serialization import canonicalize

            request_json = payload.get("request_json", {})
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
            attempt = self._registry.create_attempt(run_id)
            if attempt.run_attempt_id != attempt_id:
                # A retry flow asked for a fresh attempt id; keep the payload's
                # identity only when the registry agrees.
                attempt = self._registry.attempt(run_id, attempt.run_attempt_id) or attempt
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
        try:
            heartbeater = asyncio.create_task(
                self._heartbeat_loop(attempt, lease_token)
            )
            attempt = self._registry.transition(
                attempt, to="RUNNING", lease_token=lease_token
            )
            result = await self._executor(
                payload.get("request_json", {}), run_id, Path(self._artifact_store.root)
            )
            if result.get("status") != "COMPLETED":
                raise DurableRunError(
                    f"engine returned {result.get('status')}"
                )
            temp_dir = self._artifact_store.temp_dir(run_id, attempt.run_attempt_id)
            engine_dir = Path(self._artifact_store.root) / run_id
            self._artifact_store.stage_directory(engine_dir, temp_dir)
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
            await self._broker.publish("quant.run.succeeded", {
                "run_id": run_id,
                "run_attempt_id": attempt.run_attempt_id,
                "bundle_sha256": bundle.bundle_sha256,
            })
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
            await self._broker.publish("quant.run.failed", {
                "run_id": run_id,
                "run_attempt_id": attempt.run_attempt_id,
                "failure_code": failure_code,
            })
        finally:
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
            return exc.code
        message = str(exc)
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

    async def stop(self) -> None:
        await self._broker.close()


__all__ = ["DurableQuantWorker", "RunExecutor", "execute_run_in_process"]
