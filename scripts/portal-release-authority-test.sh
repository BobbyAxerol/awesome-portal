#!/usr/bin/env bash
# N14A source-dark release authority: contracts, channel isolation and restore.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOURCE_PREFIX="portal-n14a-release-test"
NETWORK="${RESOURCE_PREFIX}-net"
DEV_CONTAINER="${RESOURCE_PREFIX}-dev-pg"
STABLE_CONTAINER="${RESOURCE_PREFIX}-stable-pg"
RESTORE_CONTAINER="${RESOURCE_PREFIX}-restore-pg"
DEV_VOLUME="${RESOURCE_PREFIX}-dev-data"
STABLE_VOLUME="${RESOURCE_PREFIX}-stable-data"
RESTORE_VOLUME="${RESOURCE_PREFIX}-restore-data"
TMP_DIR="$(mktemp -d)"

command -v docker >/dev/null 2>&1 || {
  printf 'Docker CLI is required for the N14A isolation rehearsal.\n' >&2
  exit 1
}

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
  "${DOCKER[@]}" rm -f \
    "${DEV_CONTAINER}" "${STABLE_CONTAINER}" "${RESTORE_CONTAINER}" \
    >/dev/null 2>&1 || true
  "${DOCKER[@]}" volume rm \
    "${DEV_VOLUME}" "${STABLE_VOLUME}" "${RESTORE_VOLUME}" \
    >/dev/null 2>&1 || true
  "${DOCKER[@]}" network rm "${NETWORK}" >/dev/null 2>&1 || true
  rm -rf -- "${TMP_DIR}"
}
trap cleanup EXIT

# Exact, test-owned resources may remain only after an interrupted prior run.
cleanup
TMP_DIR="$(mktemp -d)"

python3 "${ROOT_DIR}/scripts/portal-release-authority.py" verify --mode template
python3 "${ROOT_DIR}/scripts/test_portal_release_authority.py"

"${DOCKER[@]}" compose \
  --env-file "${ROOT_DIR}/deploy/.env.development.example" \
  -f "${ROOT_DIR}/compose.yaml" config --quiet
"${DOCKER[@]}" compose \
  --env-file "${ROOT_DIR}/deploy/.env.production.example" \
  -f "${ROOT_DIR}/deploy/compose.production.yaml" config --quiet
"${DOCKER[@]}" compose \
  --env-file "${ROOT_DIR}/deploy/.env.execution-edge.example" \
  -f "${ROOT_DIR}/deploy/compose.execution-edge.yaml" config --quiet

"${DOCKER[@]}" network create "${NETWORK}" >/dev/null
"${DOCKER[@]}" volume create "${DEV_VOLUME}" >/dev/null
"${DOCKER[@]}" volume create "${STABLE_VOLUME}" >/dev/null
"${DOCKER[@]}" volume create "${RESTORE_VOLUME}" >/dev/null

start_postgres() {
  local container="$1"
  local volume="$2"
  local database="$3"
  "${DOCKER[@]}" run -d --name "${container}" --network "${NETWORK}" \
    -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB="${database}" \
    -v "${volume}:/var/lib/postgresql/data" \
    postgres:16-alpine >/dev/null
}

wait_postgres() {
  local container="$1"
  local database="$2"
  for _ in $(seq 1 30); do
    if "${DOCKER[@]}" exec "${container}" \
      pg_isready -U portal -d "${database}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  "${DOCKER[@]}" logs "${container}" >&2
  printf 'PostgreSQL did not become ready: %s\n' "${container}" >&2
  return 1
}

start_postgres "${DEV_CONTAINER}" "${DEV_VOLUME}" portal_dev
start_postgres "${STABLE_CONTAINER}" "${STABLE_VOLUME}" portal_stable
start_postgres "${RESTORE_CONTAINER}" "${RESTORE_VOLUME}" portal_restore
wait_postgres "${DEV_CONTAINER}" portal_dev
wait_postgres "${STABLE_CONTAINER}" portal_stable
wait_postgres "${RESTORE_CONTAINER}" portal_restore

"${DOCKER[@]}" exec "${DEV_CONTAINER}" psql -v ON_ERROR_STOP=1 \
  -U portal -d portal_dev -c \
  "CREATE TABLE release_probe (channel text PRIMARY KEY, marker text NOT NULL); INSERT INTO release_probe VALUES ('dev', 'DEV_UNTOUCHED');" \
  >/dev/null
"${DOCKER[@]}" exec "${STABLE_CONTAINER}" psql -v ON_ERROR_STOP=1 \
  -U portal -d portal_stable -c \
  "CREATE TABLE release_probe (channel text PRIMARY KEY, marker text NOT NULL); INSERT INTO release_probe VALUES ('stable', 'STABLE_PRE_RELEASE');" \
  >/dev/null

# Capture stable before migration. Dev is deliberately never a backup source.
"${DOCKER[@]}" exec "${STABLE_CONTAINER}" pg_dump -U portal -d portal_stable \
  --format=custom --file=/tmp/portal-stable.dump
"${DOCKER[@]}" cp \
  "${STABLE_CONTAINER}:/tmp/portal-stable.dump" "${TMP_DIR}/portal-stable.dump"
test -s "${TMP_DIR}/portal-stable.dump"
sha256sum "${TMP_DIR}/portal-stable.dump" > "${TMP_DIR}/portal-stable.dump.sha256"
sha256sum --check "${TMP_DIR}/portal-stable.dump.sha256" >/dev/null

# Expand-only migration followed by a compatible forward fix.
"${DOCKER[@]}" exec "${STABLE_CONTAINER}" psql -v ON_ERROR_STOP=1 \
  -U portal -d portal_stable -c \
  "ALTER TABLE release_probe ADD COLUMN schema_version integer NOT NULL DEFAULT 1; UPDATE release_probe SET marker='STABLE_RELEASE_CANDIDATE', schema_version=2 WHERE channel='stable';" \
  >/dev/null
"${DOCKER[@]}" exec "${STABLE_CONTAINER}" psql -v ON_ERROR_STOP=1 \
  -U portal -d portal_stable -c \
  "UPDATE release_probe SET marker='STABLE_FORWARD_FIXED', schema_version=3 WHERE channel='stable';" \
  >/dev/null

dev_marker="$("${DOCKER[@]}" exec "${DEV_CONTAINER}" \
  psql -U portal -d portal_dev -Atc "SELECT marker FROM release_probe WHERE channel='dev'")"
stable_marker="$("${DOCKER[@]}" exec "${STABLE_CONTAINER}" \
  psql -U portal -d portal_stable -Atc "SELECT marker || ':' || schema_version FROM release_probe WHERE channel='stable'")"
[[ "${dev_marker}" == "DEV_UNTOUCHED" ]] || {
  printf 'Dev state changed during stable rehearsal: %s\n' "${dev_marker}" >&2
  exit 1
}
[[ "${stable_marker}" == "STABLE_FORWARD_FIXED:3" ]] || {
  printf 'Stable forward-fix state is invalid: %s\n' "${stable_marker}" >&2
  exit 1
}

"${DOCKER[@]}" cp "${TMP_DIR}/portal-stable.dump" \
  "${RESTORE_CONTAINER}:/tmp/portal-stable.dump"
"${DOCKER[@]}" exec "${RESTORE_CONTAINER}" pg_restore \
  -U portal -d portal_restore --exit-on-error /tmp/portal-stable.dump
restore_marker="$("${DOCKER[@]}" exec "${RESTORE_CONTAINER}" \
  psql -U portal -d portal_restore -Atc \
  "SELECT marker FROM release_probe WHERE channel='stable'")"
[[ "${restore_marker}" == "STABLE_PRE_RELEASE" ]] || {
  printf 'Stable restore marker mismatch: %s\n' "${restore_marker}" >&2
  exit 1
}

dev_mount="$("${DOCKER[@]}" inspect -f '{{range .Mounts}}{{.Name}}{{end}}' "${DEV_CONTAINER}")"
stable_mount="$("${DOCKER[@]}" inspect -f '{{range .Mounts}}{{.Name}}{{end}}' "${STABLE_CONTAINER}")"
restore_mount="$("${DOCKER[@]}" inspect -f '{{range .Mounts}}{{.Name}}{{end}}' "${RESTORE_CONTAINER}")"
[[ "${dev_mount}" == "${DEV_VOLUME}" && "${stable_mount}" == "${STABLE_VOLUME}" \
  && "${restore_mount}" == "${RESTORE_VOLUME}" ]] || {
  printf 'Docker volume identity drifted during N14A rehearsal.\n' >&2
  exit 1
}
[[ "${dev_mount}" != "${stable_mount}" && "${stable_mount}" != "${restore_mount}" \
  && "${dev_mount}" != "${restore_mount}" ]] || {
  printf 'Dev, stable and restore targets unexpectedly share a mutable volume.\n' >&2
  exit 1
}

printf '%s\n' \
  'N14A source-dark release contracts, Compose profiles, dev/stable isolation,' \
  'stable backup/restore and expand/forward-fix rehearsal passed.'
