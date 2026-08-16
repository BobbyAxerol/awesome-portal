#!/usr/bin/env bash
# CI-equivalent contracts workspace tests (node:22 in Docker, no services).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="${ROOT_DIR}/packages/contracts"
NODE_CONTAINER="contracts-test-node"

command -v docker >/dev/null 2>&1 || { printf 'Docker CLI is required.\n' >&2; exit 1; }
docker info >/dev/null 2>&1 || { printf 'Cannot access the Docker daemon.\n' >&2; exit 1; }

cleanup() {
  docker rm -f "${NODE_CONTAINER}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run --rm --name "${NODE_CONTAINER}" \
  -u "${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}" \
  -v "${ROOT_DIR}:/repo:ro" \
  -v "${CONTRACTS_DIR}:/work" \
  -w /work \
  node:22-alpine sh -c '
    set -e
    if [ ! -d node_modules ]; then
      npm install --no-audit --no-fund
    fi
    npx vitest run
    npx openapi-typescript /repo/apps/portal/registry/openapi/portal-api.openapi.json -o /tmp/portal-api.d.ts
    diff -q /tmp/portal-api.d.ts generated/portal-api.d.ts
  '
printf 'Contracts workspace tests passed.\n'
