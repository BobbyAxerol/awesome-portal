"""Approval and promotion authority (U15 / BAR-12-BE1).

Versioned approval policy, evidence-bound approval requests, separation of
duties and the §10.4 promotion state machine with the §10.5 gate matrix
evaluated server-side at command time. File-backed registry for this slice;
the durable database authority stays with the Control API read models.
"""

from __future__ import annotations

import json
import os
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from portal_api.domain.errors import PortalDomainError
from portal_api.serialization import canonicalize

PROMOTION_STAGES = (
    "RESEARCH",
    "PAPER_REQUESTED",
    "PAPER_APPROVED",
    "PAPER_ACTIVE",
    "SANDBOX_REQUESTED",
    "SANDBOX_APPROVED",
    "SANDBOX_ACTIVE",
    "LIVE_CANARY_REQUESTED",
    "LIVE_CANARY_APPROVED",
    "LIVE_CANARY",
    "LIVE_SCALE_REQUESTED",
    "LIVE_SCALED",
    "PAUSED",
    "ROLLED_BACK",
    "RETIRED",
)

# §10.5: which evidence gates are required per environment (minimum set).
GATE_MATRIX: dict[str, tuple[str, ...]] = {
    "PAPER": (
        "artifact_immutable",
        "engine_capability_eligible",
        "dataset_quality_pass",
        "final_audit_evidence",
        "holdout_wfo_evidence",
        "reconciliation_plan",
        "paper_account_permission",
        "rollback_plan",
    ),
    "SANDBOX": (
        "artifact_immutable",
        "engine_capability_eligible",
        "dataset_quality_pass",
        "final_audit_evidence",
        "holdout_wfo_evidence",
        "paper_observation",
        "reconciliation_plan",
        "risk_approval",
        "sandbox_account_permission",
        "rollback_plan",
        "incident_slo_readiness",
    ),
    "LIVE_CANARY": (
        "artifact_immutable",
        "engine_capability_eligible",
        "dataset_quality_pass",
        "final_audit_evidence",
        "holdout_wfo_evidence",
        "paper_observation",
        "risk_approval_dual",
        "canary_account_permission",
        "rollback_tested",
        "incident_slo_readiness",
    ),
}

Decision = Literal["approve", "reject", "waiver"]


class ApprovalAuthorityError(PortalDomainError):
    code = "APPROVAL_AUTHORITY_DENIED"


@dataclass(frozen=True, slots=True)
class ApprovalPolicy:
    policy_version: str
    separation_of_duties: bool = True
    max_open_requests: int = 16


@dataclass(slots=True)
class ApprovalRequest:
    request_id: str
    alpha_id: str
    alpha_version: str
    artifact_digest: str
    audit_digest: str
    target_stage: str
    requested_by: str
    created_at: str
    state: str = "OPEN"
    decisions: list[dict[str, Any]] = field(default_factory=list)
    history: list[str] = field(default_factory=list)

    def record(self, event: str) -> None:
        self.history.append(f"{event}:{datetime.now(UTC).isoformat()}")

    def as_dict(self) -> dict[str, Any]:
        return {
            "request_id": self.request_id,
            "alpha_id": self.alpha_id,
            "alpha_version": self.alpha_version,
            "artifact_digest": self.artifact_digest,
            "audit_digest": self.audit_digest,
            "target_stage": self.target_stage,
            "requested_by": self.requested_by,
            "created_at": self.created_at,
            "state": self.state,
            "decisions": self.decisions,
            "history": self.history,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "ApprovalRequest":
        return cls(
            request_id=payload["request_id"],
            alpha_id=payload["alpha_id"],
            alpha_version=payload["alpha_version"],
            artifact_digest=payload["artifact_digest"],
            audit_digest=payload["audit_digest"],
            target_stage=payload["target_stage"],
            requested_by=payload["requested_by"],
            created_at=payload["created_at"],
            state=payload.get("state", "OPEN"),
            decisions=payload.get("decisions", []),
            history=payload.get("history", []),
        )


@dataclass(slots=True)
class Promotion:
    alpha_id: str
    alpha_version: str
    artifact_digest: str
    stage: str
    paused_reason: str | None = None
    history: list[str] = field(default_factory=list)

    def record(self, event: str) -> None:
        self.history.append(f"{event}:{datetime.now(UTC).isoformat()}")

    def as_dict(self) -> dict[str, Any]:
        return {
            "alpha_id": self.alpha_id,
            "alpha_version": self.alpha_version,
            "artifact_digest": self.artifact_digest,
            "stage": self.stage,
            "paused_reason": self.paused_reason,
            "history": self.history,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "Promotion":
        return cls(
            alpha_id=payload["alpha_id"],
            alpha_version=payload["alpha_version"],
            artifact_digest=payload["artifact_digest"],
            stage=payload["stage"],
            paused_reason=payload.get("paused_reason"),
            history=payload.get("history", []),
        )


# The approval request itself carries the *_REQUESTED intent; promotion
# moves the aggregate directly to the *_APPROVED stage of the next
# environment once the decision and gate evidence pass.
_TRANSITIONS: dict[str, tuple[str, ...]] = {
    "RESEARCH": ("PAPER_APPROVED",),
    "PAPER_APPROVED": ("PAPER_ACTIVE",),
    "PAPER_ACTIVE": ("SANDBOX_APPROVED", "PAUSED"),
    "SANDBOX_APPROVED": ("SANDBOX_ACTIVE",),
    "SANDBOX_ACTIVE": ("LIVE_CANARY_APPROVED", "PAUSED"),
    "LIVE_CANARY_APPROVED": ("LIVE_CANARY",),
    "LIVE_CANARY": ("LIVE_SCALED", "PAUSED", "ROLLED_BACK"),
    "LIVE_SCALED": ("PAUSED", "ROLLED_BACK"),
    "PAUSED": ("RETIRED",),
    "ROLLED_BACK": ("RETIRED",),
    "RETIRED": (),
}


def evaluate_gates(stage: str, evidence: dict[str, bool]) -> tuple[tuple[str, ...], tuple[str, ...]]:
    """Return (required, failed) gates for the stage per the §10.5 matrix."""
    environment = stage.split("_")[0]
    required = GATE_MATRIX.get(environment, ())
    failed = tuple(gate for gate in required if not evidence.get(gate, False))
    return required, failed


class ApprovalAuthority:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.policy = ApprovalPolicy(policy_version="approval-policy-v1")

    def _request_path(self, request_id: str) -> Path:
        return self.root / "requests" / f"{request_id}.json"

    def _promotion_path(self, alpha_id: str) -> Path:
        return self.root / "promotions" / f"{alpha_id}.json"

    def create_request(
        self,
        *,
        alpha_id: str,
        alpha_version: str,
        artifact_digest: str,
        audit_digest: str,
        target_stage: str,
        requested_by: str,
    ) -> ApprovalRequest:
        if target_stage not in PROMOTION_STAGES or not target_stage.endswith("_REQUESTED"):
            raise ApprovalAuthorityError("target stage must be a promotion request stage")
        request = ApprovalRequest(
            request_id=f"apr_{secrets.token_hex(12)}",
            alpha_id=alpha_id,
            alpha_version=alpha_version,
            artifact_digest=artifact_digest,
            audit_digest=audit_digest,
            target_stage=target_stage,
            requested_by=requested_by,
            created_at=datetime.now(UTC).isoformat(),
        )
        request.record("created")
        self._save(request)
        return request

    def decide(
        self,
        request: ApprovalRequest,
        *,
        decided_by: str,
        decision: Decision,
        reason: str,
        evidence: dict[str, bool] | None = None,
    ) -> ApprovalRequest:
        if request.state != "OPEN":
            raise ApprovalAuthorityError("request is not open")
        if self.policy.separation_of_duties and decided_by == request.requested_by:
            raise ApprovalAuthorityError("self-approval is denied (separation of duties)")
        if decision == "approve":
            environment = request.target_stage.split("_")[0]
            if environment in GATE_MATRIX and evidence is None:
                raise ApprovalAuthorityError("approval requires gate evidence")
            if evidence is not None:
                _, failed = evaluate_gates(request.target_stage, evidence)
                if failed:
                    raise ApprovalAuthorityError(
                        f"promotion gates failed: {', '.join(failed)}"
                    )
        request.state = "APPROVED" if decision == "approve" else "REJECTED"
        request.decisions.append(
            {
                "decided_by": decided_by,
                "decision": decision,
                "reason": reason,
                "at": datetime.now(UTC).isoformat(),
            }
        )
        request.record(f"decision:{decision}")
        self._save(request)
        return request

    def promote(self, request: ApprovalRequest) -> Promotion:
        if request.state != "APPROVED":
            raise ApprovalAuthorityError("only approved requests may promote")
        promotion = self._load_promotion(request.alpha_id)
        if promotion is None:
            promotion = Promotion(
                alpha_id=request.alpha_id,
                alpha_version=request.alpha_version,
                artifact_digest=request.artifact_digest,
                stage="RESEARCH",
            )
        allowed = _TRANSITIONS.get(promotion.stage, ())
        approved_stage = request.target_stage.removesuffix("_REQUESTED") + "_APPROVED"
        if approved_stage not in allowed:
            raise ApprovalAuthorityError(
                f"stage {approved_stage!r} is not a valid transition from {promotion.stage!r}"
            )
        if (
            promotion.artifact_digest
            and promotion.artifact_digest != request.artifact_digest
            and promotion.stage != "RESEARCH"
        ):
            raise ApprovalAuthorityError("artifact digest changed; new evidence invalidates")
        promotion.alpha_version = request.alpha_version
        promotion.artifact_digest = request.artifact_digest
        promotion.stage = approved_stage
        promotion.record(f"promoted:{approved_stage}")
        self._save_promotion(promotion)
        return promotion

    def transition(
        self,
        promotion: Promotion,
        *,
        to: str,
        actor: str,
        reason: str | None = None,
    ) -> Promotion:
        if to not in _TRANSITIONS.get(promotion.stage, ()):
            raise ApprovalAuthorityError(
                f"stage {to!r} is not a valid transition from {promotion.stage!r}"
            )
        promotion.stage = to
        promotion.paused_reason = reason if to == "PAUSED" else None
        promotion.record(f"transition:{to}:{actor}")
        self._save_promotion(promotion)
        return promotion

    def promotion(self, alpha_id: str) -> Promotion | None:
        return self._load_promotion(alpha_id)

    def request(self, request_id: str) -> ApprovalRequest | None:
        path = self._request_path(request_id)
        if not path.is_file():
            return None
        return ApprovalRequest.from_dict(self._read(path))

    def _load_promotion(self, alpha_id: str) -> Promotion | None:
        path = self._promotion_path(alpha_id)
        if not path.is_file():
            return None
        return Promotion.from_dict(self._read(path))

    def _save(self, request: ApprovalRequest) -> None:
        path = self._request_path(request.request_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        self._write(path, canonicalize(request.as_dict()))

    def _save_promotion(self, promotion: Promotion) -> None:
        path = self._promotion_path(promotion.alpha_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        self._write(path, canonicalize(promotion.as_dict()))

    @staticmethod
    def _write(path: Path, payload: dict[str, Any]) -> None:
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        os.replace(temp, path)

    @staticmethod
    def _read(path: Path) -> dict[str, Any]:
        return json.loads(path.read_text(encoding="utf-8"))


__all__ = [
    "ApprovalAuthority",
    "ApprovalAuthorityError",
    "ApprovalPolicy",
    "ApprovalRequest",
    "GATE_MATRIX",
    "PROMOTION_STAGES",
    "Promotion",
    "evaluate_gates",
]
