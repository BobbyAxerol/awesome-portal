#!/usr/bin/env bash
# N28 exact inventory, source-evidence, owner-packet and source-dark gate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/n28-missing-capability-v1"

for file in \
  missing-capability-registry.v1.json \
  missing-capability-registry.v1.schema.json \
  owner-request.v3.json \
  owner-response.v1.schema.json \
  owner-response.pending.example.json \
  fixtures/binance-candles.valid.json \
  fixtures/vnm-candles.valid.json \
  fixtures/gateway-tick.valid.json \
  fixtures/session-calendar.valid.json \
  fixtures/gateway-events.valid.json; do
  python3 -m json.tool "${CONTRACT_DIR}/${file}" >/dev/null
done

(cd "${CONTRACT_DIR}" && sha256sum --quiet -c MANIFEST.sha256)

python3 - "${ROOT_DIR}" <<'PY'
import hashlib
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
contract = root / "services/portal-execution-edge-rs/contracts/n28-missing-capability-v1"
registry = json.loads((contract / "missing-capability-registry.v1.json").read_text())
request = json.loads((contract / "owner-request.v3.json").read_text())
pending = json.loads((contract / "owner-response.pending.example.json").read_text())

def digest(path):
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()

evidence = {
    "n18_census_sha256": root / "services/portal-execution-edge-rs/contracts/manager-surface-census-v1/manager-surface-census.v1.json",
    "current_source_map_sha256": root / "services/portal-execution-edge-rs/contracts/current-source-v1/capability-source-map.json",
    "n25_release_profile_sha256": root / "deploy/manifests/query-analytics-release-profile.v1.json",
    "n27_task_fixture_sha256": root / "packages/contracts/fixtures/execution-command-tasks.valid.json",
    "data_layer_contract_sha256": root / "upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract/data-layer-contract.json",
    "gateway_api_surface_sha256": root / "upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract/api-surface.json",
    "gateway_event_catalog_sha256": root / "upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract/event-catalog.json",
}
assert registry["source_evidence"] == {key: digest(path) for key, path in evidence.items()}
assert registry["counts"] == {
    "alternative_adapters": 13,
    "owner_contract_entries": 9,
    "intentional_exclusions": 3,
    "n27_reclassification_candidates": 5,
}
assert registry["runtime_effect"] == "NONE"
assert all(row["activation_state"] == "SOURCE_DARK" for row in registry["alternative_adapters"])
assert [row["owner_request_id"] for row in registry["owner_contract_entries"]] == [f"MC-{i:02d}" for i in range(1, 10)]
assert all(row["typed_unavailable_until_verified"] for row in registry["owner_contract_entries"])
assert {row["task_id"] for row in registry["intentional_exclusions"]} == {"redis-inspect", "testnet-hard-reset", "lab-reset"}
assert all(not row["owner_request_created"] for row in registry["intentional_exclusions"])
assert registry["n27_reclassification_candidates"] == ["inspect", "performance", "broker-read", "portfolio-create", "risk-profile"]
assert registry["authority"] == {
    "browser_source_access": False,
    "direct_database_access": False,
    "direct_redis_access": False,
    "raw_cli_or_shell": False,
    "source_command_activation": False,
    "source_network_change": False,
    "trading_system_mutation": False,
    "typed_unavailable_retained": True,
}

assert request["request_revision"] == "portal.execution.trading-system-owner-request.v3"
assert request["supersedes_request_revision"] == "portal.execution.trading-system-owner-request.v2"
assert request["status"] == "OWNER_PUBLICATION_PENDING"
assert len(request["entries"]) == 9
assert [(row["request_id"], row["capability_id"]) for row in request["entries"]] == [
    (row["owner_request_id"], row["capability_id"])
    for row in registry["owner_contract_entries"]
]
assert request["common_contract"]["portal_activation_on_publication"] is False
assert request["common_contract"]["automatic_retry"] is False

assert pending["owner_accepted"] is False
assert all(row["state"] == "TYPED_UNAVAILABLE" and not row["portal_activation"] for row in pending["entries"])
assert all(row["contract_revision"] is None for row in pending["entries"])
assert all(value is False for value in pending["authority"].values())

serialized = json.dumps({"registry": registry, "request": request, "pending": pending}, sort_keys=True).lower()
for forbidden in ("-----begin", "authorization: bearer", "client_secret", "private_key", "postgres://", "redis://"):
    assert forbidden not in serialized
assert not re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", serialized)
PY

bash -n "${ROOT_DIR}/scripts/execution-n28-missing-capability-test.sh"
printf '%s\n' 'N28 genuine-gap inventory, source evidence, owner packet, typed-unavailable and source-dark gates passed.'
