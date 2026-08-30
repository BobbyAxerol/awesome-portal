#!/usr/bin/env bash
# N22 static, release, Paper-only render and rollback gates.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "${TMP_DIR}"' EXIT

python3 "${ROOT_DIR}/scripts/test_portal_full_paper_read_release.py"
python3 -m json.tool "${ROOT_DIR}/deploy/manifests/full-paper-read-release-profile.v1.json" >/dev/null
python3 -m json.tool "${ROOT_DIR}/packages/contracts/schemas/execution-paper-read.v1.schema.json" >/dev/null
python3 -m json.tool "${ROOT_DIR}/packages/contracts/openapi/execution-paper-read.openapi.json" >/dev/null

python3 - "${ROOT_DIR}" <<'PY'
import json, pathlib, sys
root = pathlib.Path(sys.argv[1])
profile = json.loads((root / "deploy/manifests/full-paper-read-release-profile.v1.json").read_text())
assert profile["environment"] == "paper"
assert len(profile["screen_ids"]) == 4
assert len(profile["activated_capability_ids"]) == 7
assert len(profile["source_binding_ids"]) == 9
assert profile["typed_unavailable_capability_ids"] == ["market.candles"]
assert profile["candidate_flags"]["control_api_current_source_paper"] is True
for key in ("control_api_current_source_sandbox", "control_api_current_source_live", "edge_projection_ingestion", "edge_realtime_sse", "edge_analytics_query", "edge_command_relay"):
    assert profile["candidate_flags"][key] is False
proxy = (root / "apps/control-api/src/execution/current-source.proxy.ts").read_text()
service = (root / "apps/control-api/src/paper-read/paper-read.service.ts").read_text()
controller = (root / "apps/control-api/src/paper-read/paper-read.controller.ts").read_text()
assert "N22_FULL_PAPER_READ_ACCEPTED" in proxy
assert "N22_CROSS_PROFILE_ROW_REJECTED" in service
assert "N25_EXACT_QUERY_NOT_ACTIVE" in service
assert "N28_MARKET_CANDLES_SOURCE_NOT_ACTIVATED" in service
assert '/api/v1/execution/screens' in controller
assert "record_key" not in service
assert "raw_response" not in service
PY

mkdir -p "${TMP_DIR}/sgp-secrets"
render="$({
  CONTROL_API_EXECUTION_EDGE_SECRET_DIRECTORY="${TMP_DIR}/sgp-secrets" \
  CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_PAPER=true \
  CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX=false \
  CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_LIVE=false \
  EXECUTION_EDGE_PAPER_ORIGIN=https://10.70.0.2:8443 \
  EXECUTION_EDGE_PAPER_PROFILE_ID=PAPER_BINANCE_USDM \
  EXECUTION_EDGE_PAPER_AUDIENCE=portal-execution-edge-paper \
  docker compose --env-file "${ROOT_DIR}/deploy/.env.production.example" \
    -f "${ROOT_DIR}/deploy/compose.production.yaml" \
    -f "${ROOT_DIR}/deploy/compose.execution-current-source.yaml" config
} 2>/dev/null)"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true"' <<<"${render}"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "false"' <<<"${render}"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "false"' <<<"${render}"
grep -Fq 'FEATURE_EXECUTION_COMMAND_RELAY: "false"' <<<"${render}"

rollback="$({
  CONTROL_API_EXECUTION_EDGE_SECRET_DIRECTORY="${TMP_DIR}/sgp-secrets" \
  CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_PAPER=false \
  docker compose --env-file "${ROOT_DIR}/deploy/.env.production.example" \
    -f "${ROOT_DIR}/deploy/compose.production.yaml" \
    -f "${ROOT_DIR}/deploy/compose.execution-current-source.yaml" config
} 2>/dev/null)"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "false"' <<<"${rollback}"

printf '%s\n' 'N22 full Paper read static, immutable release, Paper-only render and rollback gates passed.'
