#!/usr/bin/env bash
# CI-equivalent contracts workspace tests (node:22 in Docker, no services).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="${ROOT_DIR}/packages/contracts"
NODE_CONTAINER="contracts-test-node"

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
}
trap cleanup EXIT

"${DOCKER[@]}" run --rm --name "${NODE_CONTAINER}" \
  -u "${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}" \
  -v "${ROOT_DIR}:/repo:ro" \
  -v "${CONTRACTS_DIR}:/work" \
  -w /work \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/.npm \
  node:22-alpine sh -c '
    set -e
    if [ ! -d node_modules ]; then
      npm ci --no-audit --no-fund
    fi
    npx vitest run
    npx openapi-typescript /repo/apps/portal/registry/openapi/portal-api.openapi.json -o /tmp/portal-api.d.ts
    diff -q /tmp/portal-api.d.ts generated/portal-api.d.ts
    npx openapi-typescript openapi/execution-analytics.openapi.json -o /tmp/execution-analytics.d.ts
    diff -q /tmp/execution-analytics.d.ts generated/execution-analytics.d.ts
    npx openapi-typescript openapi/execution-governance.openapi.json -o /tmp/execution-governance.d.ts
    diff -q /tmp/execution-governance.d.ts generated/execution-governance.d.ts
    npx openapi-typescript openapi/execution-realtime.openapi.json -o /tmp/execution-realtime.d.ts
    diff -q /tmp/execution-realtime.d.ts generated/execution-realtime.d.ts
    npx openapi-typescript openapi/execution-command-center.openapi.json -o /tmp/execution-command-center.d.ts
    diff -q /tmp/execution-command-center.d.ts generated/execution-command-center.d.ts
  '
printf 'Contracts workspace tests passed.\n'
