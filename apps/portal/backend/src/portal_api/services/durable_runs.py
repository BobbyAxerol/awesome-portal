"""Durable run/attempt authority (U11 / BAR-08-BE1).

Separates the immutable ``run`` intent from ``run_attempt`` executions and
implements the claim-lease/heartbeat lifecycle with standardized failure
codes. The registry is file-backed under the artifact root for this slice;
the durable database authority stays with the Control API read model.
"""

from __future__ import annotations

import json
import os
import secrets
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

from portal_api.domain.errors import PortalDomainError
from portal_api.serialization import canonicalize


ATTEMPT_STATES = (
    "QUEUED",
    "CLAIMED",
    "RUNNING",
    "FINALIZING",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
    "LEASE_LOST",
)
RUN_STATES = ("QUEUED", "CLAIMED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED")
TERMINAL_ATTEMPT_STATES = {"SUCCEEDED", "FAILED", "CANCELLED", "LEASE_LOST"}
STANDARD_FAILURE_CODES = (
    "ENGINE_IMPORT_FAILED",
    "CAPABILITY_MISMATCH",
    "DATASET_NOT_FOUND",
    "SCHEMA_INVALID",
    "ALPHA_IMPORT_FAILED",
    "RESOURCE_EXCEEDED",
    "CANCELLED",
    "ENGINE_ERROR",
    "ARTIFACT_COMMIT_FAILED",
    "LEASE_LOST",
)
DEFAULT_LEASE_SECONDS = 60.0
DEFAULT_GRACE_SECONDS = 10.0


class DurableRunError(PortalDomainError):
    code = "DURABLE_RUN_FAILED"


@dataclass(frozen=True, slots=True)
class RunIntent:
    run_id: str
    run_spec_sha256: str
    workspace_id: str
    created_at: str
    payload: dict[str, Any]


@dataclass(slots=True)
class RunAttempt:
    run_attempt_id: str
    run_id: str
    status: str
    lease_token: str | None = None
    lease_until: float | None = None
    started_at: str | None = None
    completed_at: str | None = None
    failure_code: str | None = None
    failure_message: str | None = None
    heartbeat_count: int = 0
    artifacts_sha256: str | None = None
    history: list[str] = field(default_factory=list)

    def record(self, event: str) -> None:
        self.history.append(f"{event}:{datetime.now(UTC).isoformat()}")

    def as_dict(self) -> dict[str, Any]:
        return {
            "run_attempt_id": self.run_attempt_id,
            "run_id": self.run_id,
            "status": self.status,
            "lease_token": self.lease_token,
            "lease_until": self.lease_until,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "failure_code": self.failure_code,
            "failure_message": self.failure_message,
            "heartbeat_count": self.heartbeat_count,
            "artifacts_sha256": self.artifacts_sha256,
            "history": self.history,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "RunAttempt":
        return cls(
            run_attempt_id=payload["run_attempt_id"],
            run_id=payload["run_id"],
            status=payload["status"],
            lease_token=payload.get("lease_token"),
            lease_until=payload.get("lease_until"),
            started_at=payload.get("started_at"),
            completed_at=payload.get("completed_at"),
            failure_code=payload.get("failure_code"),
            failure_message=payload.get("failure_message"),
            heartbeat_count=payload.get("heartbeat_count", 0),
            artifacts_sha256=payload.get("artifacts_sha256"),
            history=payload.get("history", []),
        )


class AttemptRegistry:
    """Append-only attempt ledger under the run directory.

    ``run-intent.json`` is written exactly once; attempts are immutable once
    terminal. Redelivery of a completed attempt is a no-op because the
    registry, not the broker, decides whether an attempt may start.
    """

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def run_dir(self, run_id: str) -> Path:
        return self.root / run_id

    def _attempt_path(self, run_id: str, attempt_id: str) -> Path:
        return self.run_dir(run_id) / "attempts" / f"{attempt_id}.json"

    def create_run_intent(self, intent: RunIntent) -> None:
        run_dir = self.run_dir(intent.run_id)
        if run_dir.exists():
            raise DurableRunError("run intent already exists")
        run_dir.mkdir(parents=True)
        self._write_json(run_dir / "run-intent.json", {
            "run_id": intent.run_id,
            "run_spec_sha256": intent.run_spec_sha256,
            "workspace_id": intent.workspace_id,
            "created_at": intent.created_at,
            "payload": canonicalize(intent.payload),
        })

    def run_intent(self, run_id: str) -> dict[str, Any]:
        path = self.run_dir(run_id) / "run-intent.json"
        if not path.is_file():
            raise DurableRunError("run intent not found")
        return self._read_json(path)

    def attempt(self, run_id: str, attempt_id: str) -> RunAttempt | None:
        path = self._attempt_path(run_id, attempt_id)
        if not path.is_file():
            return None
        return RunAttempt.from_dict(self._read_json(path))

    def attempts(self, run_id: str) -> list[RunAttempt]:
        attempts_dir = self.run_dir(run_id) / "attempts"
        if not attempts_dir.is_dir():
            return []
        attempts = [
            RunAttempt.from_dict(self._read_json(path))
            for path in sorted(attempts_dir.glob("*.json"))
        ]
        return sorted(attempts, key=lambda item: item.history[0] if item.history else "")

    def latest_attempt(self, run_id: str) -> RunAttempt | None:
        attempts = self.attempts(run_id)
        return attempts[-1] if attempts else None

    def create_attempt(self, run_id: str) -> RunAttempt:
        self.run_intent(run_id)
        attempt_id = f"ra_{secrets.token_hex(13)}"
        attempt = RunAttempt(run_attempt_id=attempt_id, run_id=run_id, status="QUEUED")
        attempt.record("created")
        self._save(attempt)
        return attempt

    def claim(self, attempt: RunAttempt, *, lease_seconds: float) -> RunAttempt:
        now = time.time()
        if attempt.status == "CLAIMED" and attempt.lease_token is not None:
            if (attempt.lease_until or 0) > now:
                raise DurableRunError("attempt already claimed by another worker")
            attempt.record("lease_expired_reclaimed")
        if attempt.status in TERMINAL_ATTEMPT_STATES:
            raise DurableRunError(f"attempt is terminal: {attempt.status}")
        attempt.status = "CLAIMED"
        attempt.lease_token = secrets.token_hex(16)
        attempt.lease_until = now + lease_seconds
        attempt.record("claimed")
        self._save(attempt)
        return attempt

    def heartbeat(self, attempt: RunAttempt, *, lease_token: str, lease_seconds: float) -> RunAttempt:
        if attempt.lease_token != lease_token:
            raise DurableRunError("heartbeat token mismatch")
        attempt.lease_until = time.time() + lease_seconds
        attempt.heartbeat_count += 1
        self._save(attempt)
        return attempt

    def verify_lease(self, attempt: RunAttempt, *, lease_token: str) -> bool:
        return (
            attempt.lease_token == lease_token
            and (attempt.lease_until or 0) > time.time()
        )

    def transition(
        self,
        attempt: RunAttempt,
        *,
        to: str,
        lease_token: str | None = None,
        failure_code: str | None = None,
        failure_message: str | None = None,
        artifacts_sha256: str | None = None,
    ) -> RunAttempt:
        if attempt.status in TERMINAL_ATTEMPT_STATES:
            raise DurableRunError(f"attempt is terminal: {attempt.status}")
        if to not in ATTEMPT_STATES:
            raise DurableRunError(f"unknown attempt state: {to}")
        if lease_token is not None and attempt.lease_token != lease_token:
            raise DurableRunError("transition token mismatch")
        if to in TERMINAL_ATTEMPT_STATES:
            if to == "CANCELLED":
                failure_code = "CANCELLED"
            if to in {"FAILED", "LEASE_LOST"} and failure_code not in STANDARD_FAILURE_CODES:
                raise DurableRunError(f"non-standard failure code: {failure_code}")
            if to == "SUCCEEDED" and failure_code is not None:
                failure_code = None
        attempt.status = to
        attempt.completed_at = datetime.now(UTC).isoformat()
        attempt.failure_code = failure_code if to in {"FAILED", "CANCELLED", "LEASE_LOST"} else None
        attempt.failure_message = failure_message if failure_code else None
        if artifacts_sha256:
            attempt.artifacts_sha256 = artifacts_sha256
        attempt.record(to.lower())
        self._save(attempt)
        return attempt

    def _save(self, attempt: RunAttempt) -> None:
        path = self._attempt_path(attempt.run_id, attempt.run_attempt_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        self._write_json(path, canonicalize(attempt.as_dict()))

    @staticmethod
    def _write_json(path: Path, payload: dict[str, Any]) -> None:
        temp = path.with_suffix(".tmp")
        temp.write_text(
            json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8"
        )
        os.replace(temp, path)

    @staticmethod
    def _read_json(path: Path) -> dict[str, Any]:
        return json.loads(path.read_text(encoding="utf-8"))


__all__ = [
    "ATTEMPT_STATES",
    "DEFAULT_GRACE_SECONDS",
    "DEFAULT_LEASE_SECONDS",
    "DurableRunError",
    "AttemptRegistry",
    "RUN_STATES",
    "RunAttempt",
    "RunIntent",
    "STANDARD_FAILURE_CODES",
    "TERMINAL_ATTEMPT_STATES",
]
