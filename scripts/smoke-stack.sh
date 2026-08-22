#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v docker >/dev/null 2>&1 || {
  printf 'Docker CLI is required for the stack smoke test.\n' >&2
  exit 1
}
docker info >/dev/null 2>&1 || {
  printf 'Cannot access the Docker daemon for the stack smoke test.\n' >&2
  exit 1
}
command -v curl >/dev/null 2>&1 || {
  printf 'curl is required for the stack smoke test.\n' >&2
  exit 1
}

# Use a dedicated project/port by default so this never stops a developer's
# normal `portal` stack. Callers may override all values explicitly.
export PORTAL_STACK_NAME="${PORTAL_STACK_NAME:-portal-smoke}"
export PORTAL_HTTP_PORT="${PORTAL_HTTP_PORT:-18080}"
export PORTAL_IMAGE_PREFIX="${PORTAL_IMAGE_PREFIX:-local/portal-smoke}"
export PORTAL_IMAGE_TAG="${PORTAL_IMAGE_TAG:-smoke}"
export PORTAL_ENV="local"
export CONTROL_API_AUTH_MODE="dev"
export PORTAL_PUBLIC_ORIGIN="http://127.0.0.1:${PORTAL_HTTP_PORT}"
export CONTROL_API_QUERY_CURSOR_KEYS_JSON=""
export CONTROL_API_QUERY_CURSOR_KEYS_FILE=""
export CONTROL_API_GOVERNANCE_APPLY_KEYS_JSON=""
export CONTROL_API_GOVERNANCE_APPLY_KEYS_FILE=""
export PORTAL_HISTORICAL_DATA_MODE="${PORTAL_HISTORICAL_DATA_MODE:-disabled}"
export PORTAL_HISTORICAL_DATA_DIR="${PORTAL_HISTORICAL_DATA_DIR:-${ROOT_DIR}/runtime/historical-market-data}"
# Smoke the audited route deliberately; normal local `up` remains local-first
# until the release owner performs the documented rollout switch.
export ROADMAP_TASK_BOARD_LOCAL_ONLY="${ROADMAP_TASK_BOARD_LOCAL_ONLY:-false}"
export ROADMAP_TASK_BOARD_PERSISTENCE="${ROADMAP_TASK_BOARD_PERSISTENCE:-v1}"
export ROADMAP_TASK_BOARD_API_BASE="${ROADMAP_TASK_BOARD_API_BASE:-/roadmap-task-board/api}"
export ROADMAP_TASK_BOARD_PUBLIC_URL="${ROADMAP_TASK_BOARD_PUBLIC_URL:-http://127.0.0.1:${PORTAL_HTTP_PORT}/roadmap-task-board}"

mkdir -p "${PORTAL_HISTORICAL_DATA_DIR}"
mkdir -p "${ROOT_DIR}/runtime/control-api-secrets"
COMPOSE=(docker compose --project-directory "${ROOT_DIR}" -f "${ROOT_DIR}/compose.yaml")
health_file="$(mktemp /tmp/portal-smoke-health.XXXXXX)"
cookie_file="$(mktemp /tmp/portal-smoke-cookie.XXXXXX)"

cleanup() {
  # `compose up` may create only part of the project and then fail before it
  # returns. Always tear down the explicitly scoped smoke project so retries
  # cannot collide with containers left by a partial startup.
  "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null || true
  rm -f -- "${health_file}" "${cookie_file}"
}
trap cleanup EXIT

"${COMPOSE[@]}" up --detach --build

health_url="http://127.0.0.1:${PORTAL_HTTP_PORT}/api/health"
health_ready=false
for _ in $(seq 1 45); do
  if curl --fail --silent "${health_url}" >"${health_file}"; then
    health_ready=true
    break
  fi
  sleep 2
done

if [[ "${health_ready}" != true || ! -s "${health_file}" ]]; then
  printf 'Portal health endpoint did not become ready: %s\n' "${health_url}" >&2
  "${COMPOSE[@]}" ps >&2 || true
  "${COMPOSE[@]}" logs >&2 || true
  exit 1
fi

web_url="http://127.0.0.1:${PORTAL_HTTP_PORT}/"
web_ready=false
for _ in $(seq 1 15); do
  if curl --fail --silent "${web_url}" >/dev/null; then
    web_ready=true
    break
  fi
  sleep 1
done
if [[ "${web_ready}" != true ]]; then
  printf 'Portal web entry point did not become ready: %s\n' "${web_url}" >&2
  "${COMPOSE[@]}" logs >&2 || true
  exit 1
fi

roadmap_task_board_url="http://127.0.0.1:${PORTAL_HTTP_PORT}/roadmap-task-board/"
roadmap_task_board_ready=false
for _ in $(seq 1 15); do
  if curl --fail --silent "${roadmap_task_board_url}" | grep --quiet '<div id="root"></div>'; then
    roadmap_task_board_ready=true
    break
  fi
  sleep 1
done
if [[ "${roadmap_task_board_ready}" != true ]]; then
  printf 'Embedded Roadmap & Task Board did not become ready: %s\n' "${roadmap_task_board_url}" >&2
  "${COMPOSE[@]}" logs >&2 || true
  exit 1
fi

roadmap_task_board_api_url="http://127.0.0.1:${PORTAL_HTTP_PORT}/roadmap-task-board/api"

# The public Planning route is session/CSRF protected. Activate the isolated
# smoke DB's bootstrap ADMIN, rotate the one-time credential immediately, and
# keep every secret inside a 0600 temporary cookie/variable that cleanup removes.
activation_output="$("${COMPOSE[@]}" exec -T control-api \
  node dist/cli/bootstrap.js --file bootstrap-users.yaml --print-one-time-credentials)"
activation_token="$(printf '%s\n' "${activation_output}" | awk '$1 == "ONE_TIME" && $2 == "bobby" { print $3; exit }')"
unset activation_output
if [[ -z "${activation_token}" ]]; then
  printf 'Could not provision the isolated smoke ADMIN session.\n' >&2
  exit 1
fi
smoke_credential='smoke-gateway-credential-2026-unique'
printf 'Smoke: activate bootstrap administrator\n'
curl --fail-with-body --silent --show-error --cookie-jar "${cookie_file}" \
  --request POST "http://127.0.0.1:${PORTAL_HTTP_PORT}/api/auth/login" \
  --header 'Content-Type: application/json' \
  --header 'x-dev-access-email: bobby@azdag.com' \
  --data "{\"username\":\"bobby\",\"credential\":\"${activation_token}\"}" >/dev/null
csrf_token="$(awk '$6 == "__Host-portal_csrf" { print $7; exit }' "${cookie_file}")"
if [[ -z "${csrf_token}" ]]; then
  printf 'Smoke login did not issue a CSRF cookie.\n' >&2
  exit 1
fi
printf 'Smoke: rotate bootstrap credential before protected façade access\n'
curl --fail-with-body --silent --show-error --cookie "${cookie_file}" \
  --request POST "http://127.0.0.1:${PORTAL_HTTP_PORT}/api/auth/change-password" \
  --header 'Content-Type: application/json' \
  --header 'x-dev-access-email: bobby@azdag.com' \
  --header "x-portal-csrf: ${csrf_token}" \
  --data "{\"current_password\":\"${activation_token}\",\"new_password\":\"${smoke_credential}\"}" >/dev/null
unset activation_token
: >"${cookie_file}"
printf 'Smoke: authenticate with rotated credential\n'
curl --fail-with-body --silent --show-error --cookie-jar "${cookie_file}" \
  --request POST "http://127.0.0.1:${PORTAL_HTTP_PORT}/api/auth/login" \
  --header 'Content-Type: application/json' \
  --header 'x-dev-access-email: bobby@azdag.com' \
  --data "{\"username\":\"bobby\",\"credential\":\"${smoke_credential}\"}" >/dev/null
unset smoke_credential
csrf_token="$(awk '$6 == "__Host-portal_csrf" { print $7; exit }' "${cookie_file}")"
if [[ -z "${csrf_token}" ]]; then
  printf 'Smoke re-login did not issue a CSRF cookie.\n' >&2
  exit 1
fi

# Phase 1/2 operational path: seed one isolated Portal-owned R1 request through
# PostgreSQL (the trusted intake endpoint is intentionally not browser-facing),
# then exercise read → plan → apply → poll through the public gateway.
workspace_id="ws_smoke_phase12"
"${COMPOSE[@]}" exec -T portal-postgres psql -U portal -d portal_control \
  -v ON_ERROR_STOP=1 -v workspace_id="${workspace_id}" >/dev/null <<'SQL'
INSERT INTO workspaces (workspace_id, name, owner_user_id)
SELECT :'workspace_id', 'Smoke Phase 1-2', user_id
FROM portal_users
WHERE username = 'bobby'
ON CONFLICT (workspace_id) DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role)
SELECT :'workspace_id', user_id,
       CASE WHEN username = 'bobby' THEN 'OWNER' ELSE 'MEMBER' END
FROM portal_users
WHERE username IN ('bobby', 'stan')
ON CONFLICT (workspace_id, user_id) DO NOTHING;
SQL

"${COMPOSE[@]}" exec -T portal-postgres psql -U portal -d portal_control \
  -v ON_ERROR_STOP=1 -v workspace_id="${workspace_id}" >/dev/null <<'SQL'
INSERT INTO governance_approval_requests
  (approval_id, workspace_id, gate, subject_type, subject_id, subject_label,
   release_candidate, environment, target_label, requester_user_id,
   requester_username, artifact_creator_user_id, artifact_creator_username,
   status, policy_version, quorum_required, evidence_set_hash,
   evidence_complete, blocker_count, blocker_summary, sla_due_at, expires_at,
   created_at, updated_at)
SELECT
  'SMOKE-R1', :'workspace_id', 'R1', 'ALPHA_VERSION', 'smoke-alpha-v1',
  'Smoke alpha v1', 'SMOKE-RC-1', 'RESEARCH', 'R1', user_id, username,
  user_id, username, 'PENDING', 'approval.v3', 1,
  'sha256:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  true, 0, NULL, now() + interval '6 hours', now() + interval '48 hours',
  now(), now()
FROM portal_users
WHERE username = 'stan';
SQL

printf 'Smoke: read Phase 1 Approval Inbox and R1 evidence envelope\n'
approval_inbox="$(curl --fail-with-body --silent --show-error --cookie "${cookie_file}" \
  "http://127.0.0.1:${PORTAL_HTTP_PORT}/api/v1/execution/governance/approvals?workspace_id=${workspace_id}&view=R1")"
[[ "${approval_inbox}" == *'"id":"SMOKE-R1"'* && "${approval_inbox}" == *'"record_authority":"PORTAL"'* ]] || {
  printf 'Approval Inbox smoke response was unexpected: %s\n' "${approval_inbox}" >&2
  exit 1
}
r1_detail="$(curl --fail-with-body --silent --show-error --cookie "${cookie_file}" \
  "http://127.0.0.1:${PORTAL_HTTP_PORT}/api/v1/execution/governance/approvals/SMOKE-R1/r1?workspace_id=${workspace_id}")"
[[ "${r1_detail}" == *'"can_approve":true'* && "${r1_detail}" == *'"panel_state":"unavailable"'* ]] || {
  printf 'R1 detail smoke response was unexpected: %s\n' "${r1_detail}" >&2
  exit 1
}

plan_payload="{\"schema_version\":\"governance.r1-decision-plan-request.v1\",\"workspace_id\":\"${workspace_id}\",\"request_key\":\"smoke:r1:approve\",\"command_type\":\"GOVERNANCE_R1_DECISION\",\"command_version\":1,\"target\":{\"approval_id\":\"SMOKE-R1\"},\"expected_approval_version\":1,\"payload\":{\"decision\":\"APPROVE\",\"reason\":\"Independent SGP operational smoke review.\",\"evidence_hashes\":[]}}"
csrf_status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:${PORTAL_HTTP_PORT}/api/v1/execution/commands/plans" \
  --cookie "${cookie_file}" --header 'Content-Type: application/json' \
  --header "Origin: ${PORTAL_PUBLIC_ORIGIN}" --data "${plan_payload}")"
[[ "${csrf_status}" == "403" ]] || {
  printf 'Governance mutation without CSRF returned %s instead of 403.\n' "${csrf_status}" >&2
  exit 1
}

printf 'Smoke: execute Phase 2 plan/apply/poll with CSRF and immutable evidence binding\n'
planned="$(curl --fail-with-body --silent --show-error \
  --request POST "http://127.0.0.1:${PORTAL_HTTP_PORT}/api/v1/execution/commands/plans" \
  --cookie "${cookie_file}" --header 'Content-Type: application/json' \
  --header "Origin: ${PORTAL_PUBLIC_ORIGIN}" --header "x-portal-csrf: ${csrf_token}" \
  --data "${plan_payload}")"
operation_id="$(printf '%s' "${planned}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["operation_id"])')"
apply_token="$(printf '%s' "${planned}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["apply_token"])')"
[[ -n "${operation_id}" && -n "${apply_token}" ]] || {
  printf 'Governance plan did not return operation/apply binding.\n' >&2
  exit 1
}
applied="$(curl --fail-with-body --silent --show-error \
  --request POST "http://127.0.0.1:${PORTAL_HTTP_PORT}/api/v1/execution/operations/${operation_id}/apply" \
  --cookie "${cookie_file}" --header 'Content-Type: application/json' \
  --header "Origin: ${PORTAL_PUBLIC_ORIGIN}" --header "x-portal-csrf: ${csrf_token}" \
  --data "{\"schema_version\":\"governance.r1-decision-apply-request.v1\",\"workspace_id\":\"${workspace_id}\",\"apply_token\":\"${apply_token}\"}")"
[[ "${applied}" == *'"status":"PENDING"'* ]] || {
  printf 'Governance apply response was unexpected: %s\n' "${applied}" >&2
  exit 1
}
terminal="$(curl --fail-with-body --silent --show-error --cookie "${cookie_file}" \
  "http://127.0.0.1:${PORTAL_HTTP_PORT}/api/v1/execution/operations/${operation_id}?workspace_id=${workspace_id}")"
[[ "${terminal}" == *'"status":"SUCCEEDED"'* && "${terminal}" == *'"verification_result":"SUCCEEDED"'* ]] || {
  printf 'Governance operation poll response was unexpected: %s\n' "${terminal}" >&2
  exit 1
}
governance_evidence="$("${COMPOSE[@]}" exec -T portal-postgres \
  psql -U portal -d portal_control -Atqc \
  "SELECT (SELECT count(*) FROM governance_approval_decisions WHERE approval_id='SMOKE-R1') || ':' || (SELECT count(*) FROM product_audit_events WHERE aggregate_id='SMOKE-R1' AND event_type='governance.r1_decision.applied') || ':' || (SELECT count(*) FROM outbox_messages WHERE aggregate_id='SMOKE-R1' AND event_type='governance.r1_decision.applied')")"
[[ "${governance_evidence}" == "1:1:1" ]] || {
  printf 'Governance decision/audit/outbox atomicity smoke was unexpected: %s\n' "${governance_evidence}" >&2
  exit 1
}
roadmap_task_board_api_ready=false
for _ in $(seq 1 15); do
  if curl --fail --silent --cookie "${cookie_file}" \
    "${roadmap_task_board_api_url}/ready" | grep --quiet '"ok":true'; then
    roadmap_task_board_api_ready=true
    break
  fi
  sleep 1
done
if [[ "${roadmap_task_board_api_ready}" != true ]]; then
  printf 'Roadmap & Task Board API did not become ready: %s\n' "${roadmap_task_board_api_url}/ready" >&2
  "${COMPOSE[@]}" logs >&2 || true
  exit 1
fi

printf 'Smoke: create Planning task through authenticated gateway\n'
created_task="$(curl --fail-with-body --silent --show-error --request POST "${roadmap_task_board_api_url}/v1/tasks" \
  --cookie "${cookie_file}" \
  --header 'Content-Type: application/json' \
  --header "x-portal-csrf: ${csrf_token}" \
  --header 'X-Portal-Actor: forged-browser-actor' \
  --data '{"id":"SMOKE-PHASE5","title":"Phase 5 gateway smoke","workstream":"Portal","phase":"P5","owner":"smoke"}')"
[[ "${created_task}" == *'"id":"SMOKE-PHASE5"'* && "${created_task}" == *'"version":1'* ]] || {
  printf 'Roadmap task create response was unexpected: %s\n' "${created_task}" >&2
  exit 1
}

printf 'Smoke: transition Planning task through authenticated gateway\n'
transitioned_task="$(curl --fail-with-body --silent --show-error --request POST "${roadmap_task_board_api_url}/v1/tasks/SMOKE-PHASE5/transition" \
  --cookie "${cookie_file}" \
  --header 'Content-Type: application/json' \
  --header "x-portal-csrf: ${csrf_token}" \
  --header 'X-Portal-Actor: forged-browser-actor' \
  --data '{"status":"Done","expected_version":1}')"
[[ "${transitioned_task}" == *'"status":"Done"'* && "${transitioned_task}" == *'"version":2'* ]] || {
  printf 'Roadmap task transition response was unexpected: %s\n' "${transitioned_task}" >&2
  exit 1
}

printf 'Smoke: verify authenticated actor in Planning audit trail\n'
activity="$(curl --fail-with-body --silent --show-error --cookie "${cookie_file}" \
  "${roadmap_task_board_api_url}/v1/tasks/SMOKE-PHASE5/activity")"
[[ "${activity}" == *'"task.status_changed"'* && "${activity}" == *'"actor":"bobby"'* && "${activity}" != *'forged-browser-actor'* ]] || {
  printf 'Roadmap task activity response was unexpected: %s\n' "${activity}" >&2
  exit 1
}

printf 'Smoke: delete Planning task without a request body through authenticated gateway\n'
deleted_task="$(curl --fail-with-body --silent --show-error --request DELETE \
  "${roadmap_task_board_api_url}/v1/tasks/SMOKE-PHASE5?expected_version=2" \
  --cookie "${cookie_file}" \
  --header "x-portal-csrf: ${csrf_token}")"
[[ "${deleted_task}" == *'"id":"SMOKE-PHASE5"'* && "${deleted_task}" == *'"version":3'* && "${deleted_task}" == *'"deleted_at":'* ]] || {
  printf 'Roadmap task delete response was unexpected: %s\n' "${deleted_task}" >&2
  exit 1
}

grep --quiet '"status":"ok"' "${health_file}" || {
  printf 'Unexpected health response:\n' >&2
  cat "${health_file}" >&2
  exit 1
}

"${COMPOSE[@]}" ps
printf 'Portal smoke test passed at %s, %s and %s\n' \
  "${health_url}" "${roadmap_task_board_url}" "${roadmap_task_board_api_url}/ready"
