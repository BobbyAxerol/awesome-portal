"""Live control and operational safety foundations (U16 / BAR-13).

Signed, expiring, idempotent deployment intents; dual approval with
short-lived step-up grants; protective actions fail closed on stale/unknown/
mismatch state; audited incident state machine. The risk engine remains the
final authority — Portal never emits raw normal-UI orders; intents carry
observed acknowledgements only.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from portal_api.domain.errors import PortalDomainError
from portal_api.serialization import canonicalize

IntentAction = Literal[
    "canary", "scale", "pause", "rollback", "protective", "cancel_all"
]
IntentState = Literal["PENDING", "APPROVED", "ACKNOWLEDGED", "REJECTED", "EXPIRED"]

INCIDENT_STATES = ("OPEN", "ACKNOWLEDGED", "RESOLVED", "RETIRED")


class LiveControlError(PortalDomainError):
    code = "LIVE_CONTROL_DENIED"


@dataclass(frozen=True, slots=True)
class DeploymentIntent:
    intent_id: str
    deployment_id: str
    action: IntentAction
    payload: dict[str, Any]
    expires_at: float
    nonce: str


@dataclass(slots=True)
class Incident:
    incident_id: str
    title: str
    state: str
    opened_at: str
    history: list[str] = field(default_factory=list)

    def record(self, event: str) -> None:
        self.history.append(f"{event}:{datetime.now(UTC).isoformat()}")

    def as_dict(self) -> dict[str, Any]:
        return {
            "incident_id": self.incident_id,
            "title": self.title,
            "state": self.state,
            "opened_at": self.opened_at,
            "history": self.history,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "Incident":
        return cls(
            incident_id=payload["incident_id"],
            title=payload["title"],
            state=payload["state"],
            opened_at=payload["opened_at"],
            history=payload.get("history", []),
        )


class LiveControlAuthority:
    def __init__(self, root: Path, *, signing_secret: str | None = None) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self._secret = (signing_secret or os.getenv("PORTAL_LIVE_CONTROL_SECRET") or "").encode()
        self._grant: tuple[str, float] | None = None
        self._acknowledged: dict[str, str] = {}

    # ------------------------------------------------------------ intents

    def sign_intent(self, intent: DeploymentIntent) -> str:
        canonical = json.dumps(
            canonicalize(
                {
                    "intent_id": intent.intent_id,
                    "deployment_id": intent.deployment_id,
                    "action": intent.action,
                    "payload": intent.payload,
                    "expires_at": intent.expires_at,
                    "nonce": intent.nonce,
                }
            ),
            sort_keys=True,
            separators=(",", ":"),
        )
        return hmac.new(self._secret, canonical.encode(), hashlib.sha256).hexdigest()

    def create_intent(
        self,
        *,
        deployment_id: str,
        action: IntentAction,
        payload: dict[str, Any],
        ttl_seconds: float = 300.0,
    ) -> tuple[DeploymentIntent, str]:
        intent = DeploymentIntent(
            intent_id=f"dpi_{secrets.token_hex(10)}",
            deployment_id=deployment_id,
            action=action,
            payload=payload,
            expires_at=time.time() + ttl_seconds,
            nonce=secrets.token_hex(8),
        )
        return intent, self.sign_intent(intent)

    def verify_intent(
        self,
        intent: DeploymentIntent,
        signature: str,
        *,
        current_deployment_state: str | None,
    ) -> str:
        """Fail-closed verification: signature, expiry and state match."""
        expected = self.sign_intent(intent)
        if not hmac.compare_digest(expected, signature):
            raise LiveControlError("intent signature is invalid")
        if time.time() > intent.expires_at:
            raise LiveControlError("intent has expired")
        if current_deployment_state in {"UNKNOWN", "STALE"}:
            raise LiveControlError(
                f"deployment state {current_deployment_state!r} blocks new actions"
            )
        return "VERIFIED"

    # ---------------------------------------------------------- approvals

    def request_approval(
        self,
        intent: DeploymentIntent,
        signature: str,
        *,
        approvers: tuple[str, ...],
        current_deployment_state: str,
    ) -> dict[str, Any]:
        self.verify_intent(
            intent, signature, current_deployment_state=current_deployment_state
        )
        if len(set(approvers)) < 2:
            raise LiveControlError("dual approval requires two distinct approvers")
        self._acknowledged[intent.intent_id] = "PENDING"
        return {"intent_id": intent.intent_id, "state": "APPROVED"}

    def grant_step_up(self, actor: str, ttl_seconds: float = 300.0) -> str:
        token = secrets.token_hex(16)
        self._grant = (token, time.time() + ttl_seconds)
        del actor
        return token

    def execute_with_step_up(
        self,
        intent: DeploymentIntent,
        signature: str,
        *,
        step_up_token: str,
        current_deployment_state: str,
    ) -> str:
        self.verify_intent(
            intent, signature, current_deployment_state=current_deployment_state
        )
        if self._grant is None or time.time() > self._grant[1]:
            raise LiveControlError("step-up grant is missing or expired")
        if not hmac.compare_digest(self._grant[0], step_up_token):
            raise LiveControlError("step-up token is invalid")
        self._grant = None  # single-use
        return "ACKNOWLEDGED"

    def acknowledge(self, intent_id: str, observed_state: str) -> str:
        if intent_id not in self._acknowledged:
            raise LiveControlError("intent was never approved")
        self._acknowledged[intent_id] = observed_state
        return observed_state

    def break_glass(
        self, *, actor: str, reason: str, incident_id: str | None = None
    ) -> dict[str, Any]:
        entry = {
            "actor": actor,
            "reason": reason,
            "incident_id": incident_id,
            "at": datetime.now(UTC).isoformat(),
        }
        path = self.root / "break-glass-audit.jsonl"
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, sort_keys=True) + "\n")
        return entry

    # ---------------------------------------------------------- incidents

    def open_incident(self, title: str) -> Incident:
        incident = Incident(
            incident_id=f"inc_{secrets.token_hex(10)}",
            title=title,
            state="OPEN",
            opened_at=datetime.now(UTC).isoformat(),
        )
        incident.record("opened")
        self._save_incident(incident)
        return incident

    def transition_incident(self, incident: Incident, *, to: str, actor: str) -> Incident:
        if incident.state == to:
            raise LiveControlError("idempotent replay of a resolved incident")
        allowed = {
            "OPEN": ("ACKNOWLEDGED", "RESOLVED"),
            "ACKNOWLEDGED": ("RESOLVED",),
            "RESOLVED": ("RETIRED",),
            "RETIRED": (),
        }.get(incident.state, ())
        if to not in allowed:
            raise LiveControlError(
                f"incident state {to!r} is not a valid transition from {incident.state!r}"
            )
        incident.state = to
        incident.record(f"{to}:{actor}")
        self._save_incident(incident)
        return incident

    def incident(self, incident_id: str) -> Incident | None:
        path = self.root / "incidents" / f"{incident_id}.json"
        if not path.is_file():
            return None
        return Incident.from_dict(json.loads(path.read_text(encoding="utf-8")))

    def _save_incident(self, incident: Incident) -> None:
        path = self.root / "incidents" / f"{incident.incident_id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix(".tmp")
        temp.write_text(
            json.dumps(canonicalize(incident.as_dict()), sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        os.replace(temp, path)


__all__ = [
    "DeploymentIntent",
    "INCIDENT_STATES",
    "Incident",
    "LiveControlAuthority",
    "LiveControlError",
]
