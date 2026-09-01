#!/usr/bin/env bash
# N24 static release, bounds, profile isolation and rollback gate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "${TMP_DIR}"' EXIT

python3 -m json.tool \
  "${ROOT_DIR}/deploy/manifests/durable-manager-projection-release-profile.v1.json" \
  >/dev/null

python3 - "${ROOT_DIR}" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / "deploy/manifests/durable-manager-projection-release-profile.v1.json").read_text())
assert manifest["phase"] == "N24"
assert manifest["profiles"] == {
    "paper": "PAPER_BINANCE_USDM",
    "sandbox": "SANDBOX_BINANCE_USDM",
    "live": "LIVE_BINANCE_USDM",
}
assert manifest["adapter_version"] == "portal.execution.manager-projection.manager-v2.runtime.v4"
assert len(manifest["required_feeds"]) == 13
assert len(set(manifest["required_feeds"])) == 13
assert set(manifest["required_feeds"]) == {
    "manager.order", "manager.fill", "manager.position", "manager.account",
    "manager.reconciliation", "manager.portfolio",
    "relation.strategy_deployments", "relation.account_balances",
    "relation.account_policies", "relation.account_reservations",
    "relation.portfolio_allocations", "relation.risk_profiles",
    "relation.domain_events",
}
assert manifest["required_snapshot_kinds"] == [
    "ACCOUNT", "EVENT", "FILL", "ORDER", "PERFORMANCE", "POSITION",
    "RECONCILIATION", "RUNTIME",
]
assert manifest["change_semantics"] == "PORTAL_PROJECTION_DELTA"
assert manifest["source_sequence_semantics"] == "POLL_BOUNDED_NO_OWNER_SEQUENCE"
bounds = manifest["bounds"]
assert 250 <= bounds["default_poll_interval_ms"] <= bounds["maximum_poll_interval_ms"] <= 60000
assert bounds["maximum_pages_per_feed"] == 100
assert bounds["maximum_records_per_feed"] == 20000
assert bounds["maximum_records_per_cycle"] == 80000
assert bounds["storage_soft_limit_percent"] < bounds["storage_hard_limit_percent"] < 100
recovery = manifest["recovery_objectives"]
assert recovery == {
    "steady_state_rpo_seconds": 10,
    "worker_restart_rto_seconds": 120,
    "local_rebuild_rto_seconds": 900,
    "backup_restore_rto_seconds": 3600,
    "pitr_required_before_runtime_activation": True,
    "encrypted_backup_required": True,
    "restore_parity_required": True,
}
flags = manifest["candidate_flags"]
assert flags["manager_projection_worker"] is True
for flag in ("edge_projection_ingestion", "edge_realtime_sse", "edge_analytics_query", "edge_command_relay"):
    assert flags[flag] is False
assert manifest["rollback"]["stop_worker_only"] is True
assert manifest["rollback"]["source_or_trading_system_mutation"] is False
assert manifest["phase_authorization"]["content_addressed_dev_deployment_authorized"] is True

mapper = (root / "services/portal-execution-edge-rs/crates/manager-projection/src/lib.rs").read_text()
store = (root / "services/portal-execution-edge-rs/crates/projection-store-pg/src/manager_projection.rs").read_text()
migration = (root / "services/portal-execution-edge-rs/crates/projection-store-pg/migrations/0012_manager_projection.sql").read_text()
worker = (root / "services/portal-execution-edge-rs/crates/edge-service/src/manager_projection_command.rs").read_text()
edge_main = (root / "services/portal-execution-edge-rs/crates/edge-service/src/main.rs").read_text()
overlay = (root / "deploy/execution-manager-v2/compose.durable-projection.yaml").read_text()
for token in ("PORTAL_PROJECTION_DELTA", "MAXIMUM_CYCLE_RECORDS", "empty_live_cycle_still_emits_all_complete_snapshots"):
    assert token in mapper
for token in ("ManagerProjectionLeaseProof", "commit_manager_projection_cycle", "activate_manager_projection_epoch", "prepare_manager_projection_rebuild_epoch", "rollback_manager_projection_epoch", "tombstone_observation"):
    assert token in store
for token in ("manager_projection_leases", "manager_projection_commits", "manager_projection_cycles", "'EVENT'"):
    assert token in migration
for token in ("MAXIMUM_FEED_PAGES", "MAXIMUM_FEED_RECORDS", "MAXIMUM_CYCLE_RECORDS", "FeedBoundExceeded", "CycleBoundExceeded", "CursorCycle", "MissedTickBehavior::Skip", "valid_page_shape"):
    assert token in worker
assert 'Some("manager-projection-run")' in edge_main
assert 'Some("manager-projection-rebuild-once")' in edge_main
assert 'Some("manager-projection-rollback-once")' in edge_main
assert "ports:" not in overlay
assert 'EDGE_COMMAND_RELAY_ENABLED: "false"' in overlay
assert 'EDGE_REALTIME_SSE_ENABLED: "false"' in overlay
assert 'EDGE_ANALYTICS_QUERY_ENABLED: "false"' in overlay
assert 'EDGE_MANAGER_PROJECTION_REBUILD_AUTHORIZED: ${EDGE_MANAGER_PROJECTION_REBUILD_AUTHORIZED:-false}' in overlay
assert 'EDGE_MANAGER_PROJECTION_ROLLBACK_AUTHORIZED: ${EDGE_MANAGER_PROJECTION_ROLLBACK_AUTHORIZED:-false}' in overlay

serialized = json.dumps(manifest, sort_keys=True).lower()
for forbidden in ("-----begin", "authorization: bearer", "private_key", "client_secret", "api_key", "password", "postgres://", "redis://"):
    assert forbidden not in serialized
PY

mkdir -p "${TMP_DIR}/secrets"
render_profile() {
  local environment="$1"
  local profile="$2"
  PORTAL_EXECUTION_EDGE_IMAGE=example.invalid/portal-edge@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  PORTAL_RUNTIME_GID=991 \
  EDGE_PRIVATE_BIND_IP=10.70.0.2 \
  EDGE_SECRET_DIRECTORY="${TMP_DIR}/secrets" \
  EDGE_ENVIRONMENT="${environment}" \
  EDGE_DELEGATION_AUDIENCE="portal-execution-edge-${environment}" \
  EDGE_SOURCE_ORIGIN=https://172.23.0.1:8444 \
  EDGE_SOURCE_CLIENT_IDENTITY_FILE=/run/secrets/source-proxy-client.pem \
  EDGE_SOURCE_GATEWAY_DIGEST=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  EDGE_MANAGER_V2_PROFILE_ID="${profile}" \
  EDGE_MANAGER_PROJECTION_OWNER_DIGEST=sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc \
  docker compose \
    -f "${ROOT_DIR}/deploy/compose.execution-edge.yaml" \
    -f "${ROOT_DIR}/deploy/execution-manager-v2/compose.profile-read.yaml" \
    -f "${ROOT_DIR}/deploy/execution-manager-v2/compose.durable-projection.yaml" \
    config 2>/dev/null
}

for binding in \
  paper:PAPER_BINANCE_USDM \
  sandbox:SANDBOX_BINANCE_USDM \
  live:LIVE_BINANCE_USDM
do
  environment="${binding%%:*}"
  profile="${binding#*:}"
  rendered="$(render_profile "${environment}" "${profile}")"
  grep -Fq 'manager-projection-run' <<<"${rendered}"
  grep -Fq "EDGE_ENVIRONMENT: ${environment}" <<<"${rendered}"
  grep -Fq "EDGE_MANAGER_V2_PROFILE_ID: ${profile}" <<<"${rendered}"
  grep -Fq 'EDGE_MANAGER_PROJECTION_ENABLED: "true"' <<<"${rendered}"
  grep -Fq 'EDGE_SOURCE_CA_FILE: /run/secrets/source-proxy-ca.crt' <<<"${rendered}"
  grep -Fq 'EDGE_MANAGER_PROJECTION_REBUILD_AUTHORIZED: "false"' <<<"${rendered}"
  grep -Fq 'EDGE_MANAGER_PROJECTION_ROLLBACK_AUTHORIZED: "false"' <<<"${rendered}"
  grep -Fq 'EDGE_COMMAND_RELAY_ENABLED: "false"' <<<"${rendered}"
done

printf '%s\n' 'N24 durable projection static, three-profile render, bounds and rollback gates passed.'
