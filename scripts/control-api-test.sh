#!/usr/bin/env bash
# CI-equivalent Control API tests: real PostgreSQL + node:22 in Docker.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/control-api"
NETWORK="control-api-test-net"
PG_CONTAINER="control-api-test-postgres"
NODE_CONTAINER="control-api-test-node"
PG_PORT="${CONTROL_API_TEST_PG_PORT:-55432}"

command -v docker >/dev/null 2>&1 || { printf 'Docker CLI is required.\n' >&2; exit 1; }
docker info >/dev/null 2>&1 || { printf 'Cannot access the Docker daemon.\n' >&2; exit 1; }

cleanup() {
  docker rm -f "${NODE_CONTAINER}" "${PG_CONTAINER}" >/dev/null 2>&1 || true
  docker network rm "${NETWORK}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "${NETWORK}" >/dev/null

docker run -d --name "${PG_CONTAINER}" --network "${NETWORK}" \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control_test \
  postgres:16-alpine >/dev/null

ready=false
for _ in $(seq 1 30); do
  if docker exec "${PG_CONTAINER}" pg_isready -U portal -d portal_control_test >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "${ready}" != true ]]; then
  printf 'PostgreSQL did not become ready.\n' >&2
  docker logs "${PG_CONTAINER}" >&2
  exit 1
fi

docker run --rm --name "${NODE_CONTAINER}" --network "${NETWORK}" \
  -u "${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}" \
  -v "${ROOT_DIR}:/repo:ro" \
  -v "${APP_DIR}:/work" \
  -w /work \
  -e TEST_DATABASE_URL="postgres://portal:portal@${PG_CONTAINER}:5432/portal_control_test" \
  node:22-alpine sh -c '
    set -e
    if [ ! -d node_modules ]; then
      npm install --no-audit --no-fund
    fi
    npx vitest run
  '
printf 'Control API tests passed against a real PostgreSQL container.\n'
