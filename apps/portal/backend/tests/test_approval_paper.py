from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path

import pytest

from portal_api.services.approval_authority import (
    ApprovalAuthority,
    ApprovalAuthorityError,
    GATE_MATRIX,
    PROMOTION_STAGES,
    evaluate_gates,
)
from portal_api.services.paper_ledger import PaperFill, PaperLedger, PaperLedgerError

PAPER_EVIDENCE = {
    "artifact_immutable": True,
    "engine_capability_eligible": True,
    "dataset_quality_pass": True,
    "final_audit_evidence": True,
    "holdout_wfo_evidence": True,
    "reconciliation_plan": True,
    "paper_account_permission": True,
    "rollback_plan": True,
}

SANDBOX_EVIDENCE = {
    "artifact_immutable": True,
    "engine_capability_eligible": True,
    "dataset_quality_pass": True,
    "final_audit_evidence": True,
    "holdout_wfo_evidence": True,
    "paper_observation": True,
    "reconciliation_plan": True,
    "risk_approval": True,
    "sandbox_account_permission": True,
    "rollback_plan": True,
    "incident_slo_readiness": True,
}


def _authority(tmp_path: Path) -> ApprovalAuthority:
    return ApprovalAuthority(tmp_path / "approvals")


# ---------------------------------------------------------------- gates


def test_gate_matrix_requires_and_fails_explicitly() -> None:
    required, failed = evaluate_gates("PAPER_REQUESTED", PAPER_EVIDENCE)
    assert failed == ()
    assert "artifact_immutable" in required

    _, failed = evaluate_gates(
        "PAPER_REQUESTED", {**PAPER_EVIDENCE, "final_audit_evidence": False}
    )
    assert failed == ("final_audit_evidence",)

    required_sandbox, _ = evaluate_gates("SANDBOX_REQUESTED", {})
    assert "risk_approval" in required_sandbox
    assert "incident_slo_readiness" in required_sandbox


def test_promotion_stages_cover_the_104_state_machine() -> None:
    assert PROMOTION_STAGES[0] == "RESEARCH"
    for stage in (
        "PAPER_REQUESTED",
        "PAPER_ACTIVE",
        "SANDBOX_ACTIVE",
        "LIVE_CANARY",
        "LIVE_SCALED",
        "PAUSED",
        "ROLLED_BACK",
        "RETIRED",
    ):
        assert stage in PROMOTION_STAGES


# -------------------------------------------------------- approvals


def test_request_and_decision_flow_with_separation_of_duties(tmp_path: Path) -> None:
    authority = _authority(tmp_path)
    request = authority.create_request(
        alpha_id="delta-rsi-polynomial",
        alpha_version="1.0.0",
        artifact_digest="sha256:aaaa",
        audit_digest="sha256:bbbb",
        target_stage="PAPER_REQUESTED",
        requested_by="thanhvuong",
    )

    with pytest.raises(ApprovalAuthorityError, match="self-approval"):
        authority.decide(
            request, decided_by="thanhvuong", decision="approve", reason="ok", evidence=PAPER_EVIDENCE
        )

    approved = authority.decide(
        request,
        decided_by="bobby",
        decision="approve",
        reason="evidence reviewed",
        evidence=PAPER_EVIDENCE,
    )
    assert approved.state == "APPROVED"
    assert approved.decisions[0]["decided_by"] == "bobby"

    promotion = authority.promote(approved)
    assert promotion.stage == "PAPER_APPROVED"
    assert promotion.artifact_digest == "sha256:aaaa"


def test_crafted_promotion_is_denied(tmp_path: Path) -> None:
    authority = _authority(tmp_path)
    request = authority.create_request(
        alpha_id="delta-rsi-polynomial",
        alpha_version="1.0.0",
        artifact_digest="sha256:aaaa",
        audit_digest="sha256:bbbb",
        target_stage="PAPER_REQUESTED",
        requested_by="stan",
    )

    # Missing evidence cannot approve.
    with pytest.raises(ApprovalAuthorityError, match="requires gate evidence"):
        authority.decide(request, decided_by="bobby", decision="approve", reason="x")

    # Failing a gate cannot approve.
    with pytest.raises(ApprovalAuthorityError, match="gates failed"):
        authority.decide(
            request,
            decided_by="bobby",
            decision="approve",
            reason="x",
            evidence={**PAPER_EVIDENCE, "holdout_wfo_evidence": False},
        )

    # A decision on a decided request is denied.
    authority.decide(
        request,
        decided_by="bobby",
        decision="reject",
        reason="not now",
    )
    with pytest.raises(ApprovalAuthorityError, match="not open"):
        authority.decide(request, decided_by="bobby", decision="approve", reason="x", evidence=PAPER_EVIDENCE)


def test_invalid_transitions_and_digest_change_are_denied(tmp_path: Path) -> None:
    authority = _authority(tmp_path)
    request = authority.create_request(
        alpha_id="delta-rsi-polynomial",
        alpha_version="1.0.0",
        artifact_digest="sha256:aaaa",
        audit_digest="sha256:bbbb",
        target_stage="SANDBOX_REQUESTED",
        requested_by="stan",
    )
    authority.decide(
        request, decided_by="bobby", decision="approve", reason="ok", evidence=SANDBOX_EVIDENCE
    )
    # RESEARCH -> SANDBOX_APPROVED skips PAPER: denied.
    with pytest.raises(ApprovalAuthorityError, match="not a valid transition"):
        authority.promote(request)

    paper_request = authority.create_request(
        alpha_id="delta-rsi-polynomial",
        alpha_version="1.0.0",
        artifact_digest="sha256:aaaa",
        audit_digest="sha256:bbbb",
        target_stage="PAPER_REQUESTED",
        requested_by="stan",
    )
    authority.decide(
        paper_request,
        decided_by="bobby",
        decision="approve",
        reason="ok",
        evidence=PAPER_EVIDENCE,
    )
    promotion = authority.promote(paper_request)
    assert promotion.stage == "PAPER_APPROVED"
    authority.transition(promotion, to="PAPER_ACTIVE", actor="bobby")

    # A new request with a DIFFERENT artifact digest invalidates promotion.
    changed = authority.create_request(
        alpha_id="delta-rsi-polynomial",
        alpha_version="1.1.0",
        artifact_digest="sha256:cccc",
        audit_digest="sha256:bbbb",
        target_stage="SANDBOX_REQUESTED",
        requested_by="stan",
    )
    authority.decide(
        changed, decided_by="bobby", decision="approve", reason="ok", evidence=SANDBOX_EVIDENCE
    )
    with pytest.raises(ApprovalAuthorityError, match="digest changed"):
        authority.promote(changed)


def test_pause_rollback_and_retire_flow(tmp_path: Path) -> None:
    authority = _authority(tmp_path)
    request = authority.create_request(
        alpha_id="delta-rsi-polynomial",
        alpha_version="1.0.0",
        artifact_digest="sha256:aaaa",
        audit_digest="sha256:bbbb",
        target_stage="PAPER_REQUESTED",
        requested_by="stan",
    )
    authority.decide(
        request, decided_by="bobby", decision="approve", reason="ok", evidence=PAPER_EVIDENCE
    )
    promotion = authority.promote(request)
    active = authority.transition(promotion, to="PAPER_ACTIVE", actor="bobby")
    assert active.stage == "PAPER_ACTIVE"

    paused = authority.transition(active, to="PAUSED", actor="bobby", reason="drift detected")
    assert paused.stage == "PAUSED"
    assert paused.paused_reason == "drift detected"

    retired = authority.transition(paused, to="RETIRED", actor="bobby")
    assert retired.stage == "RETIRED"


# ------------------------------------------------------------ paper ledger


def test_paper_ledger_is_deterministic_and_replays(tmp_path: Path) -> None:
    ledger = PaperLedger(tmp_path / "paper")
    account = ledger.create_account(initial_cash=10_000.0, secret_reference="ref:paper-account-1")

    ledger.submit_order(account["account_id"], symbol="ETHUSDT", side="buy", quantity=2.0, price=1000.0)
    ledger.submit_order(account["account_id"], symbol="ETHUSDT", side="sell", quantity=1.0, price=1200.0)

    state = ledger.state(account["account_id"])
    assert state["cash"] == 9200.0
    assert state["positions"] == {"ETHUSDT": 1.0}
    assert state["secret_reference"] == "ref:paper-account-1"
    # Only a reference travels with the account; no credential value ever does.
    assert "api_key" not in json_dump(state)
    assert "private_key" not in json_dump(state)
    assert "secret_key" not in json_dump(state)

    replay = ledger.replay(account["account_id"])
    assert replay["matches"] is True
    assert replay["cash"] == 9200.0


def json_dump(payload: dict) -> str:
    import json

    return json.dumps(payload)


def test_paper_ledger_rejects_crafted_orders(tmp_path: Path) -> None:
    ledger = PaperLedger(tmp_path / "paper")
    account = ledger.create_account(initial_cash=100.0, secret_reference="ref:x")

    with pytest.raises(PaperLedgerError, match="side"):
        ledger.submit_order(account["account_id"], symbol="ETHUSDT", side="hold", quantity=1.0, price=10.0)
    with pytest.raises(PaperLedgerError, match="positive"):
        ledger.submit_order(account["account_id"], symbol="ETHUSDT", side="buy", quantity=-1.0, price=10.0)
    with pytest.raises(PaperLedgerError, match="insufficient"):
        ledger.submit_order(account["account_id"], symbol="ETHUSDT", side="buy", quantity=100.0, price=10.0)


def test_reconciliation_detects_drift(tmp_path: Path) -> None:
    ledger = PaperLedger(tmp_path / "paper")
    account = ledger.create_account(initial_cash=10_000.0, secret_reference="ref:y")
    order, fill = ledger.submit_order(
        account["account_id"], symbol="ETHUSDT", side="buy", quantity=1.0, price=1000.0
    )

    clean = ledger.reconcile(
        account["account_id"],
        [PaperFill(fill_id=fill.fill_id, order_id=order.order_id, symbol="ETHUSDT", side="buy", quantity=1.0, price=1000.0, occurred_at=fill.occurred_at)],
    )
    assert clean["clean"] is True
    assert clean["drift"] == 0

    drifted = ledger.reconcile(
        account["account_id"],
        [PaperFill(fill_id=fill.fill_id, order_id=order.order_id, symbol="ETHUSDT", side="buy", quantity=1.0, price=999.0, occurred_at=fill.occurred_at)],
    )
    assert drifted["clean"] is False
    assert drifted["drift"] == 1
