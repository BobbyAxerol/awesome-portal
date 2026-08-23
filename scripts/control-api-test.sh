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
  "${DOCKER[@]}" rm -f "${NODE_CONTAINER}" "${PG_CONTAINER}" >/dev/null 2>&1 || true
  "${DOCKER[@]}" network rm "${NETWORK}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${DOCKER[@]}" network create "${NETWORK}" >/dev/null

"${DOCKER[@]}" run -d --name "${PG_CONTAINER}" --network "${NETWORK}" \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control_test \
  postgres:16-alpine >/dev/null

ready=false
for _ in $(seq 1 30); do
  if "${DOCKER[@]}" exec "${PG_CONTAINER}" pg_isready -U portal -d portal_control_test >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "${ready}" != true ]]; then
  printf 'PostgreSQL did not become ready.\n' >&2
  "${DOCKER[@]}" logs "${PG_CONTAINER}" >&2
  exit 1
fi

"${DOCKER[@]}" run --rm --name "${NODE_CONTAINER}" --network "${NETWORK}" \
  -u "${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}" \
  -v "${ROOT_DIR}:/repo:ro" \
  -v "${APP_DIR}:/work" \
  --tmpfs /work/node_modules:rw,exec,mode=1777,size=512m \
  -w /work \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/.npm \
  -e TEST_DATABASE_URL="postgres://portal:portal@${PG_CONTAINER}:5432/portal_control_test" \
  node:22-alpine sh -c '
    set -e
    npm ci --no-audit --no-fund
    npm run build
    npm test
  '

CONTROL_SIGNATURE_SQL="SELECT concat((SELECT count(*) FROM pgmigrations), ':', (SELECT count(*) FROM portal_users), ':', (SELECT count(*) FROM governance_approval_requests), ':', (SELECT count(*) FROM governance_paper_exit_reviews), ':', (SELECT count(*) FROM execution_command_plans_f0), ':', (SELECT count(*) FROM execution_command_plans_f0 WHERE payload_json <> '{}'::jsonb), ':', (SELECT count(*) FROM execution_command_plans_f0 WHERE payload_storage_policy <> 'HASH_ONLY_NO_RAW'), ':', (SELECT count(*) FROM execution_operation_queue_items), ':', (SELECT count(*) FROM execution_operation_workflow_events), ':', (SELECT count(*) FROM execution_incidents), ':', (SELECT count(*) FROM execution_incident_operation_links), ':', (SELECT count(*) FROM execution_incident_annotations), ':', (SELECT count(*) FROM execution_incident_evidence), ':', (SELECT count(*) FROM execution_incident_events));"
source_signature="$(${DOCKER[@]} exec "${PG_CONTAINER}" psql -U portal -d portal_control_test -Atc "${CONTROL_SIGNATURE_SQL}")"
"${DOCKER[@]}" exec "${PG_CONTAINER}" pg_dump -U portal -d portal_control_test \
  --format=custom --file=/tmp/portal_control_test.dump
"${DOCKER[@]}" exec "${PG_CONTAINER}" createdb -U portal portal_control_restore
"${DOCKER[@]}" exec "${PG_CONTAINER}" pg_restore -U portal -d portal_control_restore \
  --exit-on-error /tmp/portal_control_test.dump
restore_signature="$(${DOCKER[@]} exec "${PG_CONTAINER}" psql -U portal -d portal_control_restore -Atc "${CONTROL_SIGNATURE_SQL}")"
[[ "${source_signature}" == "${restore_signature}" ]] || {
  printf 'Control API restore signature mismatch: source=%s restore=%s\n' \
    "${source_signature}" "${restore_signature}" >&2
  exit 1
}

printf 'Control API security/query/governance tests and PostgreSQL restore drill passed.\n'
