#!/usr/bin/env bash
# N14B current-source compatibility, profile render and rollback rehearsal.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf -- "${TMP_DIR}"
}
trap cleanup EXIT

python3 "${ROOT_DIR}/scripts/test_portal_current_source_release.py"

mkdir -p "${TMP_DIR}/sgp-secrets" "${TMP_DIR}/edge-secrets"

paper_control="$({
  CONTROL_API_EXECUTION_EDGE_SECRET_DIRECTORY="${TMP_DIR}/sgp-secrets" \
  CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_PAPER=true \
  CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX=false \
  CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_LIVE=false \
  EXECUTION_EDGE_PAPER_ORIGIN=https://10.70.0.2:8443 \
  EXECUTION_EDGE_PAPER_PROFILE_ID=PAPER_BINANCE_USDM \
  EXECUTION_EDGE_PAPER_AUDIENCE=portal-execution-edge-paper \
  docker compose \
    --env-file "${ROOT_DIR}/deploy/.env.production.example" \
    -f "${ROOT_DIR}/deploy/compose.production.yaml" \
    -f "${ROOT_DIR}/deploy/compose.execution-current-source.yaml" \
    config
} 2>/dev/null)"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true"' <<<"${paper_control}"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "false"' <<<"${paper_control}"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "false"' <<<"${paper_control}"
grep -Fq 'FEATURE_EXECUTION_COMMAND_RELAY: "false"' <<<"${paper_control}"

rollback_control="$({
  CONTROL_API_EXECUTION_EDGE_SECRET_DIRECTORY="${TMP_DIR}/sgp-secrets" \
  CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_PAPER=false \
  docker compose \
    --env-file "${ROOT_DIR}/deploy/.env.production.example" \
    -f "${ROOT_DIR}/deploy/compose.production.yaml" \
    -f "${ROOT_DIR}/deploy/compose.execution-current-source.yaml" \
    config
} 2>/dev/null)"
grep -Fq 'FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "false"' <<<"${rollback_control}"

paper_edge="$({
  PORTAL_EXECUTION_EDGE_IMAGE=ghcr.io/primus/portal-execution-edge@sha256:1111111111111111111111111111111111111111111111111111111111111111 \
  PORTAL_RUNTIME_GID=991 \
  EDGE_PRIVATE_BIND_IP=10.70.0.2 \
  EDGE_PRIVATE_PORT=8443 \
  EDGE_SECRET_DIRECTORY="${TMP_DIR}/edge-secrets" \
  EDGE_ENVIRONMENT=paper \
  EDGE_DELEGATION_AUDIENCE=portal-execution-edge-paper \
  EDGE_SOURCE_ORIGIN=https://172.23.0.1:8444 \
  EDGE_SOURCE_GATEWAY_DIGEST=sha256:2222222222222222222222222222222222222222222222222222222222222222 \
  EDGE_MANAGER_V2_PROFILE_ID=PAPER_BINANCE_USDM \
  docker compose \
    -f "${ROOT_DIR}/deploy/compose.execution-edge.yaml" \
    -f "${ROOT_DIR}/deploy/execution-manager-v2/compose.profile-read.yaml" \
    config
} 2>/dev/null)"
grep -Fq 'EDGE_MANAGER_V2_READ_ENABLED: "true"' <<<"${paper_edge}"
grep -Fq 'EDGE_MANAGER_V2_PROFILE_ID: PAPER_BINANCE_USDM' <<<"${paper_edge}"
grep -Fq 'EDGE_COMMAND_RELAY_ENABLED: "false"' <<<"${paper_edge}"
grep -Fq 'EDGE_REALTIME_SSE_ENABLED: "false"' <<<"${paper_edge}"

rollback_edge="$({
  PORTAL_EXECUTION_EDGE_IMAGE=ghcr.io/primus/portal-execution-edge@sha256:1111111111111111111111111111111111111111111111111111111111111111 \
  PORTAL_RUNTIME_GID=991 \
  EDGE_PRIVATE_BIND_IP=10.70.0.2 \
  EDGE_PRIVATE_PORT=8443 \
  EDGE_SECRET_DIRECTORY="${TMP_DIR}/edge-secrets" \
  EDGE_ENVIRONMENT=paper \
  EDGE_DELEGATION_AUDIENCE=portal-execution-edge-paper \
  EDGE_SOURCE_ORIGIN=https://172.23.0.1:8444 \
  EDGE_SOURCE_GATEWAY_DIGEST=sha256:2222222222222222222222222222222222222222222222222222222222222222 \
  docker compose -f "${ROOT_DIR}/deploy/compose.execution-edge.yaml" config
} 2>/dev/null)"
grep -Fq 'EDGE_MANAGER_V2_READ_ENABLED: "false"' <<<"${rollback_edge}"

printf '%s\n' \
  'N14B immutable current-source manifest, Paper-only candidate render,' \
  'affected-profile rollback and forward-fix chain gates passed.' \
  'No container, source request, registry promotion or runtime deployment occurred.'
