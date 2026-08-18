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
export PORTAL_HISTORICAL_DATA_MODE="${PORTAL_HISTORICAL_DATA_MODE:-disabled}"
export PORTAL_HISTORICAL_DATA_DIR="${PORTAL_HISTORICAL_DATA_DIR:-${ROOT_DIR}/runtime/historical-market-data}"
# Smoke the audited route deliberately; normal local `up` remains local-first
# until the release owner performs the documented rollout switch.
export ROADMAP_TASK_BOARD_LOCAL_ONLY="${ROADMAP_TASK_BOARD_LOCAL_ONLY:-false}"
export ROADMAP_TASK_BOARD_PERSISTENCE="${ROADMAP_TASK_BOARD_PERSISTENCE:-v1}"
export ROADMAP_TASK_BOARD_API_BASE="${ROADMAP_TASK_BOARD_API_BASE:-/roadmap-task-board/api}"
export ROADMAP_TASK_BOARD_PUBLIC_URL="${ROADMAP_TASK_BOARD_PUBLIC_URL:-http://127.0.0.1:${PORTAL_HTTP_PORT}/roadmap-task-board}"

mkdir -p "${PORTAL_HISTORICAL_DATA_DIR}"
COMPOSE=(docker compose --project-directory "${ROOT_DIR}" -f "${ROOT_DIR}/compose.yaml")
health_file="$(mktemp /tmp/portal-smoke-health.XXXXXX)"

cleanup() {
  # `compose up` may create only part of the project and then fail before it
  # returns. Always tear down the explicitly scoped smoke project so retries
  # cannot collide with containers left by a partial startup.
  "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null || true
  rm -f -- "${health_file}"
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
roadmap_task_board_api_ready=false
for _ in $(seq 1 15); do
  if curl --fail --silent "${roadmap_task_board_api_url}/ready" | grep --quiet '"ok":true'; then
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

created_task="$(curl --fail --silent --show-error --request POST "${roadmap_task_board_api_url}/v1/tasks" \
  --header 'Content-Type: application/json' \
  --header 'X-Portal-Actor: smoke' \
  --data '{"id":"SMOKE-PHASE5","title":"Phase 5 gateway smoke","workstream":"Portal","phase":"P5","owner":"smoke"}')"
[[ "${created_task}" == *'"id":"SMOKE-PHASE5"'* && "${created_task}" == *'"version":1'* ]] || {
  printf 'Roadmap task create response was unexpected: %s\n' "${created_task}" >&2
  exit 1
}

transitioned_task="$(curl --fail --silent --show-error --request POST "${roadmap_task_board_api_url}/v1/tasks/SMOKE-PHASE5/transition" \
  --header 'Content-Type: application/json' \
  --header 'X-Portal-Actor: smoke' \
  --data '{"status":"Done","expected_version":1}')"
[[ "${transitioned_task}" == *'"status":"Done"'* && "${transitioned_task}" == *'"version":2'* ]] || {
  printf 'Roadmap task transition response was unexpected: %s\n' "${transitioned_task}" >&2
  exit 1
}

activity="$(curl --fail --silent --show-error "${roadmap_task_board_api_url}/v1/tasks/SMOKE-PHASE5/activity")"
[[ "${activity}" == *'"task.status_changed"'* ]] || {
  printf 'Roadmap task activity response was unexpected: %s\n' "${activity}" >&2
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
