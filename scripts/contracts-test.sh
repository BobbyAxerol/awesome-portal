#!/usr/bin/env bash
# CI-equivalent contracts workspace tests (node:22 in Docker, no services).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="${ROOT_DIR}/packages/contracts"
NODE_CONTAINER="contracts-test-node"
NODE_IMAGE="node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32"
DEPS_DIR="$(mktemp -d)"
WORKSPACE_DIR="${DEPS_DIR}/workspace"

command -v docker >/dev/null 2>&1 || { printf 'Docker CLI is required.\n' >&2; exit 1; }
DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
  else
    printf 'Cannot access the Docker daemon directly or through passwordless sudo.\n' >&2
    exit 1
  fi
fi

cleanup() {
  "${DOCKER[@]}" rm -f "${NODE_CONTAINER}" >/dev/null 2>&1 || true
  rm -rf -- "${DEPS_DIR}"
}
trap cleanup EXIT

# The egress-capable dependency step sees package metadata only. Contract and
# application source are mounted later, read-only, in a networkless container.
cp "${CONTRACTS_DIR}/package.json" "${CONTRACTS_DIR}/package-lock.json" "${DEPS_DIR}/"
"${DOCKER[@]}" run --rm --network bridge --read-only \
  -u "${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}" \
  -v "${DEPS_DIR}:/deps" \
  --tmpfs /tmp:rw,exec,mode=1777,size=256m \
  -w /deps -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  "${NODE_IMAGE}" npm ci --no-audit --no-fund

# Keep the host checkout immutable while avoiding nested mounts below a
# read-only /repo bind (unsupported by some containerd snapshotters). Only the
# contract workspace and the one canonical Portal OpenAPI input are copied.
mkdir -p \
  "${WORKSPACE_DIR}/packages/contracts" \
  "${WORKSPACE_DIR}/apps/portal/registry/openapi" \
  "${WORKSPACE_DIR}/apps/control-api/src/operations" \
  "${WORKSPACE_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract"
cp -a \
  "${CONTRACTS_DIR}/README.md" \
  "${CONTRACTS_DIR}/contracts-snapshot.json" \
  "${CONTRACTS_DIR}/fixtures" \
  "${CONTRACTS_DIR}/generated" \
  "${CONTRACTS_DIR}/openapi" \
  "${CONTRACTS_DIR}/package.json" \
  "${CONTRACTS_DIR}/package-lock.json" \
  "${CONTRACTS_DIR}/schemas" \
  "${CONTRACTS_DIR}/test" \
  "${CONTRACTS_DIR}/tooling" \
  "${CONTRACTS_DIR}/vitest.config.ts" \
  "${WORKSPACE_DIR}/packages/contracts/"
cp -a \
  "${ROOT_DIR}/apps/portal/registry/openapi/portal-api.openapi.json" \
  "${WORKSPACE_DIR}/apps/portal/registry/openapi/"
cp -a \
  "${ROOT_DIR}/apps/control-api/src/operations/catalog.generated.ts" \
  "${WORKSPACE_DIR}/apps/control-api/src/operations/"
cp -a \
  "${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract/cli-command-map.json" \
  "${WORKSPACE_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract/"
cp -a \
  "${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/openapi.sanitized.json" \
  "${WORKSPACE_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/"
mv "${DEPS_DIR}/node_modules" "${WORKSPACE_DIR}/node_modules"
ln -s ../../node_modules "${WORKSPACE_DIR}/packages/contracts/node_modules"

"${DOCKER[@]}" run --rm --name "${NODE_CONTAINER}" --network none --read-only \
  -u "${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}" \
  -v "${WORKSPACE_DIR}:/repo" \
  --tmpfs /tmp:rw,exec,mode=1777,size=256m \
  -w /repo/packages/contracts \
  -e HOME=/tmp \
  "${NODE_IMAGE}" sh -c '
    set -e
    ./tooling/verify-generated.sh
  '
printf 'Contracts workspace tests passed.\n'
