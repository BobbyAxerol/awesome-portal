#!/usr/bin/env bash
# N26/N27 static release, source-honesty, bounds and rollback gate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 -m json.tool \
  "${ROOT_DIR}/deploy/manifests/realtime-manager-release-profile.v2.json" >/dev/null
python3 -m json.tool \
  "${ROOT_DIR}/deploy/manifests/operator-command-plane-release-profile.v1.json" >/dev/null
python3 -m json.tool \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/n26-manager-realtime-v2/activation.candidate.example.json" >/dev/null
(cd "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/n26-manager-realtime-v2" && sha256sum -c MANIFEST.sha256)

python3 - "${ROOT_DIR}" <<'PY'
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
realtime = json.loads((root / "deploy/manifests/realtime-manager-release-profile.v2.json").read_text())
commands = json.loads((root / "deploy/manifests/operator-command-plane-release-profile.v1.json").read_text())
candidate = json.loads((root / "services/portal-execution-edge-rs/contracts/n26-manager-realtime-v2/activation.candidate.example.json").read_text())
task_fixture = json.loads((root / "packages/contracts/fixtures/execution-command-tasks.valid.json").read_text())

assert realtime["phase"] == "N26"
assert realtime["delivery_profile"] == "current_projection"
assert realtime["profiles"] == {
    "paper": "PAPER_BINANCE_USDM",
    "sandbox": "SANDBOX_BINANCE_USDM",
    "live": "LIVE_BINANCE_USDM",
}
assert realtime["resources"]["delegated_jwt"] == "execution:manager-realtime"
assert realtime["bounds"] == {
    "journal_batch": 512,
    "replay_limit": 1024,
    "subscriber_queue": 256,
    "heartbeat_seconds": 15,
    "poll_interval_ms": 100,
    "maximum_projection_facts": 80000,
}
assert realtime["candidate_flags"]["edge_command_relay"] is False
assert realtime["candidate_flags"]["control_api_command_relay"] is False
assert realtime["rollback"]["disable_realtime_only"] is True
assert realtime["rollback"]["source_or_trading_system_mutation"] is False

assert candidate["owner_approval"]["approved"] is False
assert candidate["owner_approval"]["approved_at"] is None
assert candidate["authority_set"] == "PROJECTION_QUERY_REALTIME_COMMANDS_DISABLED"
assert len(candidate["profiles"]) == 3

assert commands["phase"] == "N27"
assert commands["task_count"] == 24
assert commands["task_group_count"] == 6
assert commands["source_action_count"] == 64
assert commands["task_classification"] == {
    "CONNECTED": 0,
    "SUPPORTED_BUT_INACTIVE": 14,
    "SEMANTICALLY_INCOMPATIBLE": 10,
}
assert commands["candidate_flags"]["source_command_transport"] is False
assert commands["candidate_flags"]["edge_command_relay"] is False
assert commands["authority"]["source_retry_after_ambiguous_dispatch"] is False
assert commands["rollback"]["source_side_effect_possible"] is False
assert task_fixture["total_tasks"] == commands["task_count"]
assert task_fixture["classification_counts"] == commands["task_classification"]
assert task_fixture["relay_state"] == "DISABLED"

operator_tasks = (root / "apps/control-api/src/operations/operator-tasks.ts").read_text()
task_ids = re.findall(r'task\("([a-z0-9-]+)"', operator_tasks)
assert task_ids == [
    "health", "inspect", "capital", "performance", "sizing", "broker-read",
    "redis-inspect", "portfolio-create", "portfolio-state", "allocation-change",
    "config-plan", "deployment-state", "trading-state", "risk-profile",
    "alpha-register", "account-policy", "account-seed-paper", "account-sync",
    "reconcile-positions", "reconcile-open-orders", "broker-reconcile",
    "emergency-close", "testnet-hard-reset", "lab-reset",
]

for relative, required in {
    "services/portal-execution-edge-rs/crates/projection-store-pg/src/manager_projection.rs":
        ("PORTAL_PROJECTION_DELTA", "realtime_sequence", "poll_interval_ms"),
    "services/portal-execution-edge-rs/crates/edge-service/src/main.rs":
        ("ManagerProjection", "active_manager_realtime_authority", "auth.expiring"),
    "apps/control-api/src/execution/realtime.controller.ts":
        ("auth.expired", "terminal: true", "response.end?.()"),
    "apps/control-api/src/operations/operations.service.ts":
        ("COMMAND_RELAY_DISABLED", "HASH_ONLY_NO_RAW", "source_request_sent"),
}.items():
    text = (root / relative).read_text()
    for token in required:
        assert token in text, (relative, token)

serialized = json.dumps({"realtime": realtime, "commands": commands}, sort_keys=True).lower()
for forbidden in (
    "-----begin", "authorization: bearer", "private_key", "client_secret",
    "api_key", "password", "postgres://", "redis://",
):
    assert forbidden not in serialized
PY

bash -n "${ROOT_DIR}/scripts/execution-n26-n27-test.sh"
printf '%s\n' 'N26/N27 realtime, command source-honesty, bounds and rollback gates passed.'
