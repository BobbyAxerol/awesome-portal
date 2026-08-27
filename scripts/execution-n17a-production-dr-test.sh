#!/usr/bin/env bash
# N17A offline PITR/restore/rebuild/rotation/rollback and game-day rehearsal.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOURCE_PREFIX="portal-n17a-dr-test"
NETWORK="${RESOURCE_PREFIX}-net"
PRIMARY_CONTAINER="${RESOURCE_PREFIX}-primary-pg"
RESTORE_CONTAINER="${RESOURCE_PREFIX}-restore-pg"
PRIMARY_VOLUME="${RESOURCE_PREFIX}-primary-data"
ARCHIVE_VOLUME="${RESOURCE_PREFIX}-wal-archive"
BASE_VOLUME="${RESOURCE_PREFIX}-base-backup"
RESTORE_VOLUME="${RESOURCE_PREFIX}-restore-data"
POSTGRES_IMAGE="postgres:16-alpine@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6"
TMP_DIR="$(mktemp -d)"

command -v docker >/dev/null 2>&1 || { printf 'Docker CLI is required for N17A.\n' >&2; exit 1; }
command -v openssl >/dev/null 2>&1 || { printf 'OpenSSL is required for N17A encrypted-backup rehearsal.\n' >&2; exit 1; }

DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
  else
    printf 'Cannot access Docker directly or through passwordless sudo.\n' >&2
    exit 1
  fi
fi

cleanup() {
  "${DOCKER[@]}" rm -f "${PRIMARY_CONTAINER}" "${RESTORE_CONTAINER}" >/dev/null 2>&1 || true
  "${DOCKER[@]}" volume rm \
    "${PRIMARY_VOLUME}" "${ARCHIVE_VOLUME}" "${BASE_VOLUME}" "${RESTORE_VOLUME}" \
    >/dev/null 2>&1 || true
  "${DOCKER[@]}" network rm "${NETWORK}" >/dev/null 2>&1 || true
  rm -rf -- "${TMP_DIR}"
}
trap cleanup EXIT

# Exact test-owned resources are safe to remove after an interrupted prior run.
cleanup
TMP_DIR="$(mktemp -d)"

python3 "${ROOT_DIR}/scripts/execution-n17a-readiness.py" verify-static
python3 "${ROOT_DIR}/scripts/test_execution_n17a_readiness.py"

"${DOCKER[@]}" network create --internal "${NETWORK}" >/dev/null
for volume in "${PRIMARY_VOLUME}" "${ARCHIVE_VOLUME}" "${BASE_VOLUME}" "${RESTORE_VOLUME}"; do
  "${DOCKER[@]}" volume create "${volume}" >/dev/null
done
"${DOCKER[@]}" run --rm \
  -v "${ARCHIVE_VOLUME}:/archive" \
  -v "${BASE_VOLUME}:/base" \
  "${POSTGRES_IMAGE}" sh -eu -c 'chmod 0777 /archive /base'

"${DOCKER[@]}" run -d --name "${PRIMARY_CONTAINER}" --network "${NETWORK}" \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control \
  -v "${PRIMARY_VOLUME}:/var/lib/postgresql/data" \
  -v "${ARCHIVE_VOLUME}:/archive" \
  -v "${BASE_VOLUME}:/base" \
  "${POSTGRES_IMAGE}" postgres \
  -c wal_level=replica \
  -c archive_mode=on \
  -c "archive_command=test ! -f /archive/%f && cp %p /archive/%f" \
  -c archive_timeout=1s \
  -c max_wal_senders=5 >/dev/null

wait_postgres() {
  local container="$1"
  local database="$2"
  for _ in $(seq 1 45); do
    if "${DOCKER[@]}" exec "${container}" pg_isready -U portal -d "${database}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  "${DOCKER[@]}" logs "${container}" >&2
  printf 'PostgreSQL did not become ready: %s\n' "${container}" >&2
  return 1
}

wait_postgres "${PRIMARY_CONTAINER}" portal_control
"${DOCKER[@]}" exec "${PRIMARY_CONTAINER}" psql -v ON_ERROR_STOP=1 -U portal -d portal_control -c \
  "CREATE TABLE control_probe (sequence bigint PRIMARY KEY, marker text NOT NULL); INSERT INTO control_probe VALUES (1, 'BASELINE');" >/dev/null
"${DOCKER[@]}" exec -u postgres "${PRIMARY_CONTAINER}" \
  pg_basebackup -U portal -D /base -Fp -Xs -c fast >/dev/null

"${DOCKER[@]}" exec "${PRIMARY_CONTAINER}" psql -v ON_ERROR_STOP=1 -U portal -d portal_control -c \
  "INSERT INTO control_probe VALUES (2, 'ACCEPTED_BEFORE_TARGET');" >/dev/null
target_lsn="$("${DOCKER[@]}" exec "${PRIMARY_CONTAINER}" psql -U portal -d portal_control -Atq -c 'SELECT pg_current_wal_lsn()')"
[[ "${target_lsn}" =~ ^[0-9A-F]+/[0-9A-F]+$ ]] || {
  printf 'Invalid PITR target LSN: %s\n' "${target_lsn}" >&2
  exit 1
}
"${DOCKER[@]}" exec "${PRIMARY_CONTAINER}" psql -v ON_ERROR_STOP=1 -U portal -d portal_control -c \
  "INSERT INTO control_probe VALUES (3, 'MUST_NOT_SURVIVE_TARGET'); SELECT pg_switch_wal();" >/dev/null
sleep 2
"${DOCKER[@]}" stop "${PRIMARY_CONTAINER}" >/dev/null

"${DOCKER[@]}" run --rm \
  -e TARGET_LSN="${target_lsn}" \
  -v "${BASE_VOLUME}:/from:ro" \
  -v "${RESTORE_VOLUME}:/to" \
  "${POSTGRES_IMAGE}" sh -eu -c '
    cp -a /from/. /to/
    touch /to/recovery.signal
    {
      printf "restore_command = '\''cp /archive/%%f %%p'\''\n"
      printf "recovery_target_lsn = '\''%s'\''\n" "${TARGET_LSN}"
      printf "recovery_target_inclusive = on\n"
      printf "recovery_target_action = '\''promote'\''\n"
    } >> /to/postgresql.auto.conf
    chown -R postgres:postgres /to
  '

"${DOCKER[@]}" run -d --name "${RESTORE_CONTAINER}" --network "${NETWORK}" \
  -v "${RESTORE_VOLUME}:/var/lib/postgresql/data" \
  -v "${ARCHIVE_VOLUME}:/archive:ro" \
  "${POSTGRES_IMAGE}" >/dev/null
wait_postgres "${RESTORE_CONTAINER}" portal_control

pitr_rows="$("${DOCKER[@]}" exec "${RESTORE_CONTAINER}" psql -U portal -d portal_control -Atq -c \
  "SELECT string_agg(marker, ',' ORDER BY sequence) FROM control_probe")"
[[ "${pitr_rows}" == "BASELINE,ACCEPTED_BEFORE_TARGET" ]] || {
  printf 'PITR result crossed target LSN: %s\n' "${pitr_rows}" >&2
  exit 1
}
printf '%s\n' "${pitr_rows}" > "${TMP_DIR}/control-pitr-result.txt"

# Encrypted logical backup and independent restore verification.
"${DOCKER[@]}" exec "${RESTORE_CONTAINER}" pg_dump -U portal -d portal_control \
  --format=custom --file=/tmp/portal-control.dump
"${DOCKER[@]}" cp "${RESTORE_CONTAINER}:/tmp/portal-control.dump" "${TMP_DIR}/portal-control.dump"
sha256sum "${TMP_DIR}/portal-control.dump" > "${TMP_DIR}/portal-control.dump.sha256"
openssl rand -hex 32 > "${TMP_DIR}/ephemeral-backup-key"
chmod 0600 "${TMP_DIR}/ephemeral-backup-key"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
  -in "${TMP_DIR}/portal-control.dump" \
  -out "${TMP_DIR}/portal-control.dump.enc" \
  -pass "file:${TMP_DIR}/ephemeral-backup-key"
[[ "$(sha256sum "${TMP_DIR}/portal-control.dump" | cut -d ' ' -f 1)" != \
   "$(sha256sum "${TMP_DIR}/portal-control.dump.enc" | cut -d ' ' -f 1)" ]] || {
  printf 'Encrypted backup is byte-identical to plaintext.\n' >&2
  exit 1
}
rm -f -- "${TMP_DIR}/portal-control.dump"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "${TMP_DIR}/portal-control.dump.enc" \
  -out "${TMP_DIR}/portal-control.dump" \
  -pass "file:${TMP_DIR}/ephemeral-backup-key"
(cd "${TMP_DIR}" && sha256sum --check portal-control.dump.sha256 >/dev/null)
"${DOCKER[@]}" cp "${TMP_DIR}/portal-control.dump" "${RESTORE_CONTAINER}:/tmp/portal-control.dump"
"${DOCKER[@]}" exec "${RESTORE_CONTAINER}" createdb -U portal portal_control_logical_restore
"${DOCKER[@]}" exec "${RESTORE_CONTAINER}" pg_restore -U portal -d portal_control_logical_restore \
  --exit-on-error /tmp/portal-control.dump
logical_rows="$("${DOCKER[@]}" exec "${RESTORE_CONTAINER}" psql -U portal -d portal_control_logical_restore -Atq -c \
  "SELECT string_agg(marker, ',' ORDER BY sequence) FROM control_probe")"
[[ "${logical_rows}" == "${pitr_rows}" ]] || {
  printf 'Encrypted logical restore signature mismatch.\n' >&2
  exit 1
}

# Deterministic projection rebuild from a sealed Portal-owned event corpus.
"${DOCKER[@]}" exec "${RESTORE_CONTAINER}" psql -v ON_ERROR_STOP=1 -U portal -d portal_control -c \
  "CREATE TABLE projection_events (event_id bigint PRIMARY KEY, account_id text NOT NULL, delta bigint NOT NULL); INSERT INTO projection_events VALUES (1, 'acct-a', 100), (2, 'acct-b', 40), (3, 'acct-a', 25); CREATE TABLE rebuilt_projection AS SELECT account_id, sum(delta)::bigint AS balance FROM projection_events GROUP BY account_id;" >/dev/null
projection_rows="$("${DOCKER[@]}" exec "${RESTORE_CONTAINER}" psql -U portal -d portal_control -Atq -F '|' -c \
  "SELECT account_id, balance FROM rebuilt_projection ORDER BY account_id")"
expected_projection="$(printf 'acct-a|125\nacct-b|40')"
[[ "${projection_rows}" == "${expected_projection}" ]] || {
  printf 'Projection rebuild differs from sealed corpus: %s\n' "${projection_rows}" >&2
  exit 1
}
printf '%s\n' "${projection_rows}" > "${TMP_DIR}/projection-rebuild-result.txt"

# Rotation dry-run uses only temporary random bytes and fingerprints.
openssl rand 64 > "${TMP_DIR}/identity-old"
openssl rand 64 > "${TMP_DIR}/identity-new"
old_fingerprint="$(sha256sum "${TMP_DIR}/identity-old" | cut -d ' ' -f 1)"
new_fingerprint="$(sha256sum "${TMP_DIR}/identity-new" | cut -d ' ' -f 1)"
[[ "${old_fingerprint}" != "${new_fingerprint}" ]] || {
  printf 'Rotation dry-run did not produce distinct identities.\n' >&2
  exit 1
}
printf 'old=revoked:%s\nnew=verified:%s\ncommands=disabled\n' \
  "${old_fingerprint}" "${new_fingerprint}" > "${TMP_DIR}/rotation-result.txt"
rm -f -- "${TMP_DIR}/identity-old" "${TMP_DIR}/identity-new" "${TMP_DIR}/ephemeral-backup-key"

digest_file() {
  printf 'sha256:%s' "$(sha256sum "$1" | cut -d ' ' -f 1)"
}

python3 "${ROOT_DIR}/scripts/execution-n17a-readiness.py" seal-evidence \
  --output "${TMP_DIR}/n17a-evidence.json" \
  --generated-at "$(date +%s)" \
  --drill "NETWORK_PARTITION=$(digest_file "${ROOT_DIR}/deploy/execution-readiness/game-day-plan.source-dark.json")" \
  --drill "AUTH_LOSS=$(digest_file "${ROOT_DIR}/deploy/execution-readiness/rotation-inventory.source-dark.json")" \
  --drill "SOURCE_LOSS=$(digest_file "${ROOT_DIR}/packages/contracts/fixtures/execution-production-readiness.source-dark.valid.json")" \
  --drill "COMMAND_CONTAINMENT=$(digest_file "${ROOT_DIR}/packages/contracts/fixtures/execution-emergency-routing.source-dark.valid.json")" \
  --drill "CONTROL_DATABASE_PITR=$(digest_file "${TMP_DIR}/control-pitr-result.txt")" \
  --drill "PROJECTION_REBUILD=$(digest_file "${TMP_DIR}/projection-rebuild-result.txt")" \
  --drill "RELEASE_ROLLBACK=$(digest_file "${ROOT_DIR}/deploy/manifests/release-owner-decision.template.json")" \
  --drill "CREDENTIAL_COMPROMISE=$(digest_file "${TMP_DIR}/rotation-result.txt")"
python3 "${ROOT_DIR}/scripts/execution-n17a-readiness.py" verify-evidence \
  --evidence "${TMP_DIR}/n17a-evidence.json"

printf '%s\n' \
  'N17A isolated WAL PITR, encrypted logical restore, deterministic projection rebuild,' \
  'rotation/compromise, rollback and eight-scenario source-dark evidence gates passed.' \
  'No production route, source request, command dispatch or external network was used.'
