from __future__ import annotations

import time
from pathlib import Path

import pytest

from portal_api.services.live_control import (
    INCIDENT_STATES,
    LiveControlAuthority,
    LiveControlError,
)


@pytest.fixture
def authority(tmp_path: Path) -> LiveControlAuthority:
    return LiveControlAuthority(tmp_path / "live", signing_secret="test-live-secret")


def test_signed_intent_verifies_and_detects_tampering(authority) -> None:
    intent, signature = authority.create_intent(
        deployment_id="dep_1", action="canary", payload={"scale": 1}
    )
    assert authority.verify_intent(
        intent, signature, current_deployment_state="HEALTHY"
    ) == "VERIFIED"

    tampered = authority.create_intent(
        deployment_id="dep_1", action="canary", payload={"scale": 2}
    )[0]
    with pytest.raises(LiveControlError, match="signature"):
        authority.verify_intent(tampered, signature, current_deployment_state="HEALTHY")


def test_expired_intent_fails_closed(authority) -> None:
    intent, signature = authority.create_intent(
        deployment_id="dep_1", action="pause", payload={}, ttl_seconds=0.05
    )
    time.sleep(0.1)
    with pytest.raises(LiveControlError, match="expired"):
        authority.verify_intent(intent, signature, current_deployment_state="HEALTHY")


def test_stale_or_unknown_deployment_state_blocks_actions(authority) -> None:
    intent, signature = authority.create_intent(
        deployment_id="dep_1", action="scale", payload={"scale": 3}
    )
    for state in ("UNKNOWN", "STALE"):
        with pytest.raises(LiveControlError, match="blocks new actions"):
            authority.verify_intent(intent, signature, current_deployment_state=state)


def test_dual_approval_and_single_approver_denial(authority) -> None:
    intent, signature = authority.create_intent(
        deployment_id="dep_1", action="protective", payload={"flatten": True}
    )
    with pytest.raises(LiveControlError, match="two distinct"):
        authority.request_approval(
            intent,
            signature,
            approvers=("bobby",),
            current_deployment_state="HEALTHY",
        )
    result = authority.request_approval(
        intent,
        signature,
        approvers=("bobby", "stan"),
        current_deployment_state="HEALTHY",
    )
    assert result["state"] == "APPROVED"
    assert authority.acknowledge(intent.intent_id, "observed:flattened") == "observed:flattened"


def test_step_up_grant_is_short_lived_and_single_use(authority) -> None:
    intent, signature = authority.create_intent(
        deployment_id="dep_1", action="cancel_all", payload={}
    )
    token = authority.grant_step_up("bobby")
    assert (
        authority.execute_with_step_up(
            intent,
            signature,
            step_up_token=token,
            current_deployment_state="HEALTHY",
        )
        == "ACKNOWLEDGED"
    )
    with pytest.raises(LiveControlError, match="missing or expired"):
        authority.execute_with_step_up(
            intent,
            signature,
            step_up_token=token,
            current_deployment_state="HEALTHY",
        )

    intent2, signature2 = authority.create_intent(
        deployment_id="dep_1", action="pause", payload={}, ttl_seconds=300
    )
    token2 = authority.grant_step_up("stan", ttl_seconds=0.05)
    time.sleep(0.1)
    with pytest.raises(LiveControlError, match="missing or expired"):
        authority.execute_with_step_up(
            intent2,
            signature2,
            step_up_token=token2,
            current_deployment_state="HEALTHY",
        )


def test_break_glass_is_always_audited(authority) -> None:
    entry = authority.break_glass(
        actor="bobby", reason="manual flatten", incident_id="inc_1"
    )
    assert entry["actor"] == "bobby"
    audit = (authority.root / "break-glass-audit.jsonl").read_text(encoding="utf-8")
    assert "manual flatten" in audit


def test_incident_state_machine_is_audited_and_idempotent(authority) -> None:
    incident = authority.open_incident("paper drift detected")
    assert incident.state == "OPEN"
    assert incident.incident_id in INCIDENT_STATES or incident.state in INCIDENT_STATES

    acknowledged = authority.transition_incident(incident, to="ACKNOWLEDGED", actor="bobby")
    assert acknowledged.state == "ACKNOWLEDGED"
    assert any("ACKNOWLEDGED:bobby" in event for event in acknowledged.history)

    with pytest.raises(LiveControlError, match="not a valid transition"):
        authority.transition_incident(acknowledged, to="OPEN", actor="stan")

    resolved = authority.transition_incident(acknowledged, to="RESOLVED", actor="bobby")
    with pytest.raises(LiveControlError, match="idempotent replay"):
        authority.transition_incident(resolved, to="RESOLVED", actor="bobby")

    retired = authority.transition_incident(resolved, to="RETIRED", actor="bobby")
    assert retired.state == "RETIRED"
    reloaded = authority.incident(incident.incident_id)
    assert reloaded is not None
    assert reloaded.state == "RETIRED"
