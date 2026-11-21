"""Private P11 journal relay from the durable worker to Control API.

The relay is intentionally best-effort for *delivery*, never for source
persistence: :class:`ResearchProgressJournal` fsyncs before this module sees
an event.  A temporary Control API outage cannot turn completed work into a
failed attempt, and the private reconciliation read can later replay the same
sequence idempotently.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import time
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from portal_api.services.research_progress import ResearchProgressJournal


class ResearchProgressRelayError(RuntimeError):
    """A private relay response cannot be trusted as an acknowledgement."""


def _service_principal(secret: str) -> str:
    now = int(time.time())
    payload = {
        "principalId": "research-progress-worker",
        "username": "research-progress-worker",
        "accessSubject": None,
        "accessEmail": None,
        "role": "ADMIN",
        "authnMethods": ["research_progress_writer"],
        "sessionId": "research-progress-worker",
        "mustChangePassword": False,
        "issuedAt": datetime.now(UTC).isoformat(),
        "policyVersion": "auth-policy-v1",
        "exp": now + 60,
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    ).decode("ascii").rstrip("=")
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest()
    ).decode("ascii").rstrip("=")
    return f"{encoded}.{signature}"


class ResearchProgressRelay:
    """Relays a bounded journal in sequence order with durable local ACKs."""

    def __init__(
        self,
        *,
        journal: ResearchProgressJournal,
        job_id: str,
        workspace_id: str,
        endpoint: str,
        secret: str,
        timeout_seconds: float = 1.5,
    ) -> None:
        parsed = urlparse(endpoint)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
            raise ResearchProgressRelayError("P11 Control API relay origin is invalid")
        if len(secret.encode("utf-8")) < 16:
            raise ResearchProgressRelayError("P11 Control API relay secret is invalid")
        if not 0.25 <= timeout_seconds <= 10:
            raise ResearchProgressRelayError("P11 Control API relay timeout is invalid")
        self.journal = journal
        self.job_id = job_id
        self.workspace_id = workspace_id
        self.endpoint = endpoint.rstrip("/") + "/internal/research/progress/events"
        self.secret = secret
        self.timeout_seconds = timeout_seconds
        self._ack_path = self.journal.root / "relay-ack.json"

    @classmethod
    def from_environment(
        cls,
        *,
        journal: ResearchProgressJournal,
        job_id: str,
        workspace_id: str,
    ) -> "ResearchProgressRelay | None":
        enabled = os.getenv("PORTAL_FEATURE_RESEARCH_PROGRESS", "false").strip().lower() == "true"
        endpoint = os.getenv("CONTROL_API_INTERNAL_URL", "").strip()
        secret = os.getenv("INTERNAL_PRINCIPAL_SECRET", "")
        if not enabled:
            return None
        if not endpoint or not secret:
            raise ResearchProgressRelayError("P11 relay is enabled without its private Control API configuration")
        raw_timeout = os.getenv("PORTAL_RESEARCH_PROGRESS_RELAY_TIMEOUT_SECONDS", "1.5")
        try:
            timeout = float(raw_timeout)
        except ValueError as exc:
            raise ResearchProgressRelayError("P11 relay timeout is invalid") from exc
        return cls(
            journal=journal,
            job_id=job_id,
            workspace_id=workspace_id,
            endpoint=endpoint,
            secret=secret,
            timeout_seconds=timeout,
        )

    async def flush(self) -> bool:
        """Deliver as much as one bounded page; false means retry later."""

        ack = self._read_ack()
        page = self.journal.events_after(ack, limit=500)
        for event in page["events"]:
            snapshot = self.journal.snapshot()
            body = {
                "schema_version": "research.progress-ingress.v1",
                "run_id": self.journal.run_id,
                "job_id": self.job_id,
                "workspace_id": self.workspace_id,
                "worker_attempt_id": self.journal.attempt_id,
                "lease_epoch": self.journal.lease_epoch,
                "event": event,
                "snapshot": snapshot,
            }
            # P13 evidence is a separate bounded document: carrying it in
            # every progress event would make a transient callback outage
            # expensive and would violate P11's small event vocabulary.  The
            # terminal event's digest binds this one document immutably.
            if event.get("event_type") == "run_completed":
                payload = event.get("payload")
                evidence_digest = payload.get("evidence_digest") if isinstance(payload, dict) else None
                if evidence_digest is not None:
                    if not isinstance(evidence_digest, str):
                        raise ResearchProgressRelayError("P13 terminal evidence digest is invalid")
                    try:
                        body["evidence"] = self.journal.read_evidence_source(evidence_digest)
                    except Exception as exc:  # journal remains recovery authority
                        raise ResearchProgressRelayError("P13 terminal evidence source is unavailable") from exc
                # P14 is a separate digest-bound terminal receipt. It never
                # travels on non-terminal events and does not give the relay a
                # holdout-read, unlock or worker-control capability.
                split_digest = payload.get("split_digest") if isinstance(payload, dict) else None
                if split_digest is not None:
                    if not isinstance(split_digest, str):
                        raise ResearchProgressRelayError("P14 terminal split digest is invalid")
                    try:
                        body["split"] = self.journal.read_split_source(split_digest)
                    except Exception as exc:  # journal remains recovery authority
                        raise ResearchProgressRelayError("P14 terminal split source is unavailable") from exc
            try:
                await asyncio.to_thread(self._post, body)
            except ResearchProgressRelayError:
                return False
            self._write_ack(int(event["sequence"]))
        return int(self._read_ack()) >= int(page["latest_sequence"])

    async def run_until(self, stopped: asyncio.Event) -> None:
        """A single bounded loop per worker attempt, not per browser viewer."""

        while not stopped.is_set():
            try:
                await self.flush()
            except Exception:  # journal persistence still remains the authority
                pass
            try:
                await asyncio.wait_for(stopped.wait(), timeout=0.25)
            except TimeoutError:
                continue

    def _post(self, body: dict[str, Any]) -> None:
        encoded = json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
        request = urllib.request.Request(
            self.endpoint,
            data=encoded,
            method="POST",
            headers={
                "content-type": "application/json",
                "accept": "application/json",
                "x-portal-principal": _service_principal(self.secret),
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:  # noqa: S310 -- deployment-bound origin
                if response.status != 202:
                    raise ResearchProgressRelayError("P11 progress relay was rejected")
                raw = response.read(8_192)
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise ResearchProgressRelayError("P11 progress relay is unavailable") from exc
        try:
            decoded = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ResearchProgressRelayError("P11 progress relay returned invalid JSON") from exc
        if not isinstance(decoded, dict) or decoded.get("accepted") is not True:
            raise ResearchProgressRelayError("P11 progress relay acknowledgement is invalid")

    def _read_ack(self) -> int:
        try:
            payload = json.loads(self._ack_path.read_text(encoding="utf-8"))
            value = payload.get("last_acknowledged_sequence")
            if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
                return value
        except (OSError, ValueError, json.JSONDecodeError):
            pass
        return 0

    def _write_ack(self, sequence: int) -> None:
        temporary = self._ack_path.with_suffix(".partial")
        with temporary.open("w", encoding="utf-8") as handle:
            handle.write(json.dumps({"last_acknowledged_sequence": sequence}, sort_keys=True) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, self._ack_path)
        os.chmod(self._ack_path, 0o600)


__all__ = ["ResearchProgressRelay", "ResearchProgressRelayError"]
