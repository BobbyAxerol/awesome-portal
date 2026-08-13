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
export PORTAL_MARKET_DATA_DIR="${PORTAL_MARKET_DATA_DIR:-${ROOT_DIR}/runtime/market-data}"

mkdir -p "${PORTAL_MARKET_DATA_DIR}"
COMPOSE=(docker compose --project-directory "${ROOT_DIR}" -f "${ROOT_DIR}/compose.yaml")
started=false
health_file="$(mktemp /tmp/portal-smoke-health.XXXXXX)"

cleanup() {
  if [[ "${started}" == true ]]; then
    "${COMPOSE[@]}" down --volumes --remove-orphans >/dev/null || true
  fi
  rm -f -- "${health_file}"
}
trap cleanup EXIT

"${COMPOSE[@]}" up --detach --build
started=true

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

grep --quiet '"status":"ok"' "${health_file}" || {
  printf 'Unexpected health response:\n' >&2
  cat "${health_file}" >&2
  exit 1
}

"${COMPOSE[@]}" ps
printf 'Portal smoke test passed at %s\n' "${health_url}"
