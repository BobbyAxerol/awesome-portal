#!/usr/bin/env bash
# CI-equivalent Control API tests: real PostgreSQL + node:22 in Docker.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/control-api"
MAXIMUM_DATA_PACK="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/maximum-data-return-v1"
EDS08_SOURCE_CONTINUITY_PACK="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/eds08-source-continuity-v1"
# Permit a caller to use a replacement disposable test-network name after a
# stale-name collision, without changing any Portal runtime network. The
# default keeps CI behavior unchanged.
NETWORK="${CONTROL_API_TEST_NETWORK:-control-api-test-net}"
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
test -f "${MAXIMUM_DATA_PACK}/MANIFEST.sha256"
test -f "${EDS08_SOURCE_CONTINUITY_PACK}/MANIFEST.sha256"

# Docker/containerd cannot create a nested tmpfs or bind mount below a
# read-only bind destination on every supported host. Build a non-secret,
# disposable test cell instead: the repository stays untouched and read-only
# rootfs/network isolation remain intact.
mkdir -p "${WORK_DIR}"
cp -a \
  "${APP_DIR}/migrations" \
  "${APP_DIR}/src" \
  "${APP_DIR}/test" \
  "${APP_DIR}/tooling" \
  "${APP_DIR}/package.json" \
  "${APP_DIR}/package-lock.json" \
  "${APP_DIR}/tsconfig.build.json" \
  "${APP_DIR}/tsconfig.json" \
  "${APP_DIR}/vitest.config.mts" \
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
  -v "${MAXIMUM_DATA_PACK}:/services/portal-execution-edge-rs/contracts/maximum-data-return-v1:ro" \
  -v "${EDS08_SOURCE_CONTINUITY_PACK}:/services/portal-execution-edge-rs/contracts/eds08-source-continuity-v1:ro" \
  --tmpfs /tmp:rw,exec,mode=1777,size=512m \
  -w /cell/work \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/.npm \
  -e TEST_DATABASE_URL="postgres://portal:portal@${PG_CONTAINER}:5432/portal_control_test" \
  -e EDS02_SOURCE_PACK="/services/portal-execution-edge-rs/contracts/maximum-data-return-v1" \
  -e EDS08_SOURCE_CONTINUITY_PACK="/services/portal-execution-edge-rs/contracts/eds08-source-continuity-v1" \
  "${NODE_IMAGE}" sh -c '
    set -e
    npm run build
    npm test
  '

CONTROL_SIGNATURE_SQL="SELECT string_agg(value, ':' ORDER BY ordinal) FROM (VALUES (1, (SELECT count(*)::text FROM pgmigrations)), (2, (SELECT count(*)::text FROM portal_users)), (3, (SELECT count(*)::text FROM governance_approval_requests)), (4, (SELECT count(*)::text FROM governance_approval_known_limitations)), (5, (SELECT count(*)::text FROM governance_r2_lineage)), (6, (SELECT count(*)::text FROM governance_approval_history)), (7, (SELECT count(*)::text FROM governance_paper_exit_reviews)), (8, (SELECT count(*)::text FROM execution_command_plans_f0)), (9, (SELECT count(*)::text FROM execution_command_plans_f0 WHERE payload_json <> '{}'::jsonb)), (10, (SELECT count(*)::text FROM execution_operation_queue_items)), (11, (SELECT count(*)::text FROM execution_operation_queue_items WHERE assigned_to_user_id IS NOT NULL)), (12, (SELECT count(*)::text FROM execution_operation_queue_read WHERE incident_id IS NOT NULL)), (13, (SELECT count(*)::text FROM execution_operation_workflow_events)), (14, (SELECT count(*)::text FROM execution_incidents)), (15, (SELECT count(*)::text FROM execution_incident_operation_links)), (16, (SELECT count(*)::text FROM execution_incident_annotations)), (17, (SELECT count(*)::text FROM execution_incident_evidence)), (18, (SELECT count(*)::text FROM execution_incident_events)), (19, (SELECT count(*)::text FROM governance_sandbox_certifications)), (20, (SELECT count(*)::text FROM governance_sandbox_smoke_plans)), (21, (SELECT count(*)::text FROM governance_sandbox_step_evidence)), (22, (SELECT count(*)::text FROM governance_sandbox_findings)), (23, (SELECT count(*)::text FROM governance_sandbox_certification_events)), (24, (SELECT count(*)::text FROM governance_sandbox_promotion_plans)), (25, (SELECT count(*)::text FROM governance_canary_envelopes)), (26, (SELECT count(*)::text FROM execution_activation_capabilities)), (27, (SELECT count(*)::text FROM execution_activation_capabilities WHERE effective_profile <> 'fixture' OR source_enabled OR runtime_enabled OR NOT kill_switch_engaged)), (28, (SELECT count(*)::text FROM execution_activation_plans)), (29, (SELECT count(*)::text FROM execution_activation_evidence_refs)), (30, (SELECT count(*)::text FROM execution_activation_compatibility_requirements)), (31, (SELECT count(*)::text FROM execution_activation_events)), (32, (SELECT count(*)::text FROM execution_shared_admission_state)), (33, (SELECT count(*)::text FROM execution_shared_admission_leases)), (34, (SELECT count(*)::text FROM execution_shared_read_flights)), (35, (SELECT count(*)::text FROM execution_shared_read_cache)), (36, (SELECT count(*)::text FROM execution_manager_operation_continuations)), (37, (SELECT count(*)::text FROM execution_manager_projection_snapshots)), (38, (SELECT count(*)::text FROM execution_alpha_fleet_projection)), (39, (SELECT count(*)::text FROM execution_binding_projection)), (40, (SELECT count(*)::text FROM execution_profile_projection_leases)), (41, (SELECT count(*)::text FROM execution_profile_projection_snapshots)), (42, (SELECT count(*)::text FROM execution_profile_projection_journal)), (43, (SELECT count(*)::text FROM execution_durable_mirror_batches)), (44, (SELECT count(*)::text FROM execution_durable_mirror_revisions)), (45, (SELECT count(*)::text FROM execution_durable_mirror_observations)), (46, (SELECT count(*)::text FROM execution_durable_mirror_current_entities)), (47, (SELECT count(*)::text FROM execution_durable_mirror_range_rows)), (48, (SELECT count(*)::text FROM execution_durable_mirror_continuations)), (49, (SELECT count(*)::text FROM execution_durable_mirror_gaps)), (50, (SELECT count(*)::text FROM execution_durable_mirror_conflicts)), (51, (SELECT count(*)::text FROM execution_financial_query_cursors))) AS signature(ordinal, value);"
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
