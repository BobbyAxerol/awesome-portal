#!/usr/bin/env bash
# CI-equivalent Control API tests: real PostgreSQL + node:22 in Docker.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/control-api"
NETWORK="control-api-test-net"
PG_CONTAINER="control-api-test-postgres"
NODE_CONTAINER="control-api-test-node"
NODE_IMAGE="node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32"
POSTGRES_IMAGE="postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6"
DEPS_DIR="$(mktemp -d)"
WORK_DIR="${DEPS_DIR}/work"

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
  rm -rf -- "${DEPS_DIR}"
}
trap cleanup EXIT

# Dependency resolution sees package metadata only; the repository source is
# not mounted in this egress-capable preparation container. The resulting
# node_modules tree becomes read-only in the internal test cell below.
cp "${APP_DIR}/package.json" "${APP_DIR}/package-lock.json" "${DEPS_DIR}/"
"${DOCKER[@]}" run --rm --network bridge --read-only \
  -u "${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}" \
  -v "${DEPS_DIR}:/deps" \
  --tmpfs /tmp:rw,exec,mode=1777,size=256m \
  -w /deps -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  "${NODE_IMAGE}" npm ci --no-audit --no-fund
test -x "${DEPS_DIR}/node_modules/.bin/tsc"

# Docker/containerd cannot create a nested tmpfs or bind mount below a
# read-only bind destination on every supported host. Build a non-secret,
# disposable test cell instead: the repository stays untouched and read-only
# rootfs/network isolation remain intact.
mkdir -p "${WORK_DIR}"
cp -a \
  "${APP_DIR}/migrations" \
  "${APP_DIR}/src" \
  "${APP_DIR}/test" \
  "${APP_DIR}/package.json" \
  "${APP_DIR}/package-lock.json" \
  "${APP_DIR}/tsconfig.build.json" \
  "${APP_DIR}/tsconfig.json" \
  "${APP_DIR}/vitest.config.ts" \
  "${WORK_DIR}/"
ln -s ../node_modules "${WORK_DIR}/node_modules"

# The test cell can reach only its temporary PostgreSQL container. Source is
# mounted read-only and all generated/runtime files live in tmpfs.
"${DOCKER[@]}" network create --internal "${NETWORK}" >/dev/null

"${DOCKER[@]}" run -d --name "${PG_CONTAINER}" --network "${NETWORK}" --read-only \
  --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=2048m \
  --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m \
  --tmpfs /tmp:rw,exec,mode=1777,size=64m \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control_test \
  "${POSTGRES_IMAGE}" >/dev/null

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

"${DOCKER[@]}" run --rm --name "${NODE_CONTAINER}" --network "${NETWORK}" --read-only \
  -u "${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}" \
  -v "${DEPS_DIR}:/cell" \
  --tmpfs /tmp:rw,exec,mode=1777,size=512m \
  -w /cell/work \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/.npm \
  -e TEST_DATABASE_URL="postgres://portal:portal@${PG_CONTAINER}:5432/portal_control_test" \
  "${NODE_IMAGE}" sh -c '
    set -e
    npm run build
    npm test
  '

CONTROL_SIGNATURE_SQL="SELECT concat((SELECT count(*) FROM pgmigrations), ':', (SELECT count(*) FROM portal_users), ':', (SELECT count(*) FROM governance_approval_requests), ':', (SELECT count(*) FROM governance_approval_known_limitations), ':', (SELECT count(*) FROM governance_r2_lineage), ':', (SELECT count(*) FROM governance_approval_history), ':', (SELECT count(*) FROM governance_paper_exit_reviews), ':', (SELECT count(*) FROM execution_command_plans_f0), ':', (SELECT count(*) FROM execution_command_plans_f0 WHERE payload_json <> '{}'::jsonb), ':', (SELECT count(*) FROM execution_command_plans_f0 WHERE payload_storage_policy <> 'HASH_ONLY_NO_RAW'), ':', (SELECT count(*) FROM execution_operation_queue_items), ':', (SELECT count(*) FROM execution_operation_queue_items WHERE assigned_to_user_id IS NOT NULL), ':', (SELECT count(*) FROM execution_operation_queue_read WHERE incident_id IS NOT NULL), ':', (SELECT count(*) FROM execution_operation_workflow_events), ':', (SELECT count(*) FROM execution_incidents), ':', (SELECT count(*) FROM execution_incident_operation_links), ':', (SELECT count(*) FROM execution_incident_annotations), ':', (SELECT count(*) FROM execution_incident_evidence), ':', (SELECT count(*) FROM execution_incident_events), ':', (SELECT count(*) FROM governance_sandbox_certifications), ':', (SELECT count(*) FROM governance_sandbox_smoke_plans), ':', (SELECT count(*) FROM governance_sandbox_step_evidence), ':', (SELECT count(*) FROM governance_sandbox_findings), ':', (SELECT count(*) FROM governance_sandbox_certification_events), ':', (SELECT count(*) FROM governance_sandbox_promotion_plans), ':', (SELECT count(*) FROM governance_canary_envelopes), ':', (SELECT count(*) FROM execution_activation_capabilities), ':', (SELECT count(*) FROM execution_activation_capabilities WHERE effective_profile <> 'fixture' OR source_enabled OR runtime_enabled OR NOT kill_switch_engaged), ':', (SELECT count(*) FROM execution_activation_plans), ':', (SELECT count(*) FROM execution_activation_evidence_refs), ':', (SELECT count(*) FROM execution_activation_compatibility_requirements), ':', (SELECT count(*) FROM execution_activation_events), ':', (SELECT count(*) FROM execution_shared_admission_state), ':', (SELECT count(*) FROM execution_shared_admission_leases), ':', (SELECT count(*) FROM execution_shared_read_flights), ':', (SELECT count(*) FROM execution_shared_read_cache), ':', (SELECT count(*) FROM execution_manager_projection_snapshots), ':', (SELECT count(*) FROM execution_alpha_fleet_projection), ':', (SELECT count(*) FROM execution_binding_projection));"
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
