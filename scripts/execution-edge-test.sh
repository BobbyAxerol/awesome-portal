#!/usr/bin/env bash
# Reproducible EX-BE-01/02/03 gate: immutable evidence + Rust + PostgreSQL.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EDGE_DIR="${ROOT_DIR}/services/portal-execution-edge-rs"
PACK_DIR="${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack"
IMAGE="portal-execution-edge-ci:rust-1.85.1"
NETWORK="execution-edge-test-net"
PG_CONTAINER="execution-edge-test-postgres"

command -v docker >/dev/null 2>&1 || {
  printf 'Docker CLI is required.\n' >&2
  exit 1
}

DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
  else
    printf 'Cannot access the Docker daemon directly or through passwordless sudo.\n' >&2
    exit 1
  fi
fi

[[ -f "${EDGE_DIR}/Cargo.lock" ]] || {
  printf 'Cargo.lock is required; EX-BE-01 never resolves dependencies implicitly.\n' >&2
  exit 1
}

[[ "$(sha256sum "${PACK_DIR}/MANIFEST.sha256" | cut -d ' ' -f 1)" == \
  "9e4430fcb27cce87158376a53888dc80515673d32dbfe3b53d08e164de67e85d" ]] || {
  printf 'Trading System contract-pack manifest identity drifted.\n' >&2
  exit 1
}

(cd "${PACK_DIR}" && sha256sum --quiet -c MANIFEST.sha256)

cleanup() {
  "${DOCKER[@]}" rm -f "${PG_CONTAINER}" >/dev/null 2>&1 || true
  "${DOCKER[@]}" network rm "${NETWORK}" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup
"${DOCKER[@]}" network create "${NETWORK}" >/dev/null
"${DOCKER[@]}" run -d --name "${PG_CONTAINER}" --network "${NETWORK}" \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal \
  -e POSTGRES_DB=portal_projection_test \
  postgres:16-alpine@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6 >/dev/null

ready=false
for _ in $(seq 1 30); do
  if "${DOCKER[@]}" exec "${PG_CONTAINER}" \
    pg_isready -U portal -d portal_projection_test >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "${ready}" != true ]]; then
  printf 'Projection PostgreSQL did not become ready.\n' >&2
  "${DOCKER[@]}" logs "${PG_CONTAINER}" >&2
  exit 1
fi

"${DOCKER[@]}" build \
  --tag "${IMAGE}" \
  --file "${ROOT_DIR}/deploy/images/execution-edge-ci.Dockerfile" \
  "${ROOT_DIR}"

"${DOCKER[@]}" run --rm \
  --network "${NETWORK}" \
  --user "${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}" \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,exec,mode=1777,size=64m \
  --tmpfs /cargo:rw,exec,mode=1777,size=512m \
  --tmpfs /target:rw,exec,mode=1777,size=3072m \
  -e HOME=/tmp \
  -e CARGO_HOME=/cargo \
  -e CARGO_TARGET_DIR=/target \
  -e TEST_PROJECTION_DATABASE_URL="postgres://portal:portal@${PG_CONTAINER}:5432/portal_projection_test" \
  -v "${ROOT_DIR}:/repo:ro" \
  -w /repo/services/portal-execution-edge-rs \
  "${IMAGE}" sh -eu -c '
    cargo fmt --all -- --check
    cargo test --locked --all-targets
    cargo clippy --locked --all-targets -- -D warnings
  '

printf 'Execution edge contracts, auth, transport, projection replay and PostgreSQL gates passed.\n'
