#!/usr/bin/env bash
# N23 static, contract, immutable release and independent rollback gates.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "${TMP_DIR}"' EXIT

python3 "${ROOT_DIR}/scripts/test_portal_sandbox_live_read_release.py"
python3 -m json.tool "${ROOT_DIR}/deploy/manifests/sandbox-live-read-release-profile.v1.json" >/dev/null
python3 -m json.tool "${ROOT_DIR}/packages/contracts/schemas/execution-profile-read.v1.schema.json" >/dev/null
python3 -m json.tool "${ROOT_DIR}/packages/contracts/schemas/governance-live-review.v1.schema.json" >/dev/null
python3 -m json.tool "${ROOT_DIR}/packages/contracts/openapi/execution-profile-read.openapi.json" >/dev/null

python3 - "${ROOT_DIR}" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
profile = json.loads((root / "deploy/manifests/sandbox-live-read-release-profile.v1.json").read_text())
assert profile["phase"] == "N23"
assert set(profile["profiles"]) == {"sandbox", "live"}
assert profile["profiles"]["sandbox"]["manager_profile_id"] == "SANDBOX_BINANCE_USDM"
assert profile["profiles"]["live"]["manager_profile_id"] == "LIVE_BINANCE_USDM"
assert profile["canary"] == {
    "trading_system_mode": None,
    "source_profile": "LIVE_BINANCE_USDM",
    "composition": "PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS",
}
assert profile["typed_unavailable_capability_ids"] == ["market.ticks"]
assert profile["candidate_flags"]["control_api_current_source_sandbox"] is True
assert profile["candidate_flags"]["control_api_current_source_live"] is True
for key in ("edge_projection_ingestion", "edge_realtime_sse", "edge_analytics_query", "edge_command_relay"):
    assert profile["candidate_flags"][key] is False
proxy = (root / "apps/control-api/src/execution/current-source.proxy.ts").read_text()
service = (root / "apps/control-api/src/profile-read/profile-read.service.ts").read_text()
controller = (root / "apps/control-api/src/profile-read/profile-read.controller.ts").read_text()
assert "N23_SANDBOX_LIVE_READ_ACCEPTED" in proxy
assert "PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS" in service
assert '"market.ticks"' in service
assert '"/sandbox"' in controller and '"/live"' in controller
assert "record_key" not in service and "raw_response" not in service
PY

mkdir -p "${TMP_DIR}/sgp-secrets"
render_profile() {
  local sandbox="$1"
  local live="$2"
  CONTROL_API_EXECUTION_EDGE_SECRET_DIRECTORY="${TMP_DIR}/sgp-secrets" \
  PORTAL_RUNTIME_GID=991 \
  CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_PAPER=true \
  CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX="${sandbox}" \
  CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_LIVE="${live}" \
  EXECUTION_EDGE_PAPER_ORIGIN=https://10.70.0.2:8443 \
  EXECUTION_EDGE_PAPER_PROFILE_ID=PAPER_BINANCE_USDM \
  EXECUTION_EDGE_PAPER_AUDIENCE=portal-execution-edge-paper \
  EXECUTION_EDGE_SANDBOX_ORIGIN=https://10.70.0.3:8443 \
  EXECUTION_EDGE_SANDBOX_PROFILE_ID=SANDBOX_BINANCE_USDM \
  EXECUTION_EDGE_SANDBOX_AUDIENCE=portal-execution-edge-sandbox \
  EXECUTION_EDGE_LIVE_ORIGIN=https://10.70.0.4:8443 \
  EXECUTION_EDGE_LIVE_PROFILE_ID=LIVE_BINANCE_USDM \
  EXECUTION_EDGE_LIVE_AUDIENCE=portal-execution-edge-live \
  docker compose --env-file "${ROOT_DIR}/deploy/.env.production.example" \
    -f "${ROOT_DIR}/deploy/compose.production.yaml" \
    -f "${ROOT_DIR}/deploy/compose.execution-current-source.yaml" config 2>/dev/null
}

candidate="$(render_profile true true)"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "true"' <<<"${candidate}"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "true"' <<<"${candidate}"
grep -Fq 'FEATURE_EXECUTION_COMMAND_RELAY: "false"' <<<"${candidate}"

sandbox_rollback="$(render_profile false true)"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "false"' <<<"${sandbox_rollback}"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "true"' <<<"${sandbox_rollback}"

live_rollback="$(render_profile true false)"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "true"' <<<"${live_rollback}"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "false"' <<<"${live_rollback}"

printf '%s\n' 'N23 Sandbox/Live static, immutable release, profile render and independent rollback gates passed.'
