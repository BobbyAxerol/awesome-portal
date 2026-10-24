#!/usr/bin/env bash
# Restore a real backup twice in one disposable, network-isolated PostgreSQL.
# This proves a dump/restore round-trip of the supplied backup, NOT that the
# original runtime was quiesced at backup time or old credentials can reactivate.
set -euo pipefail
umask 077
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ "$#" == 6 && "$1" == --backup && "$3" == --profile && "$5" == --output-dir ]] || exit 2
BACKUP="$2"; PROFILE="$4"; OUTPUT="$6"
[[ "${BACKUP}" == /* && -f "${BACKUP}" && ! -L "${BACKUP}" ]] || exit 2
[[ "${OUTPUT}" == /* && -d "${OUTPUT}" && ! -L "${OUTPUT}" ]] || exit 2
[[ "${PROFILE}" == PORTAL_V1 || "${PROFILE}" == RESEARCH_CURRENT_HUMAN_V1 ]] || exit 2
[[ "$(stat -c '%u:%a' "${OUTPUT}")" == "$(id -u):700" ]] || exit 2
[[ -z "$(find "${OUTPUT}" -mindepth 1 -maxdepth 1 -print -quit)" ]] || exit 2
SUFFIX="${BASHPID}${RANDOM}"
NETWORK="elp211-preservation-net-${SUFFIX}"
PG="elp211-preservation-postgres-${SUFFIX}"
NODE="elp211-preservation-node-${SUFFIX}"
DATA_VOLUME="elp211-preservation-data-${SUFFIX}"
DATA_CREATED=false
SOURCE_DB="elp211_preservation_source_${SUFFIX}"
RESTORE_DB="elp211_preservation_restore_${SUFFIX}"
PG_IMAGE=postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6
NODE_IMAGE=node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
"${DOCKER[@]}" info >/dev/null
for target in "${PG}" "${NODE}"; do
  ! "${DOCKER[@]}" container inspect "${target}" >/dev/null 2>&1 || exit 2
done
! "${DOCKER[@]}" network inspect "${NETWORK}" >/dev/null 2>&1 || exit 2
! "${DOCKER[@]}" volume inspect "${DATA_VOLUME}" >/dev/null 2>&1 || exit 2
cleanup() {
  "${DOCKER[@]}" rm -f "${NODE}" "${PG}" >/dev/null 2>&1 || true
  "${DOCKER[@]}" network rm "${NETWORK}" >/dev/null 2>&1 || true
  if [[ "${DATA_CREATED}" == true ]]; then "${DOCKER[@]}" volume rm "${DATA_VOLUME}" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
"${DOCKER[@]}" network create --internal "${NETWORK}" >/dev/null
"${DOCKER[@]}" volume create --label portal.owner=elp211-preservation "${DATA_VOLUME}" >/dev/null
DATA_CREATED=true
"${DOCKER[@]}" run -d --rm --name "${PG}" --network "${NETWORK}" --read-only \
  --cpus 1 --memory 1024m --pids-limit 128 \
  --mount "type=volume,src=${DATA_VOLUME},dst=/var/lib/postgresql/data" \
  --tmpfs /var/run/postgresql:rw,noexec,mode=1777,size=16m \
  --tmpfs /tmp:rw,noexec,mode=1777,size=128m \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB="${SOURCE_DB}" \
  "${PG_IMAGE}" postgres -c shared_buffers=32MB -c work_mem=4MB \
    -c max_connections=12 -c max_wal_size=64MB -c min_wal_size=32MB >/dev/null
ready=false
for _ in $(seq 1 30); do
  if "${DOCKER[@]}" exec "${PG}" pg_isready -U portal -d "${SOURCE_DB}" >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "${ready}" == true ]] || exit 1
# pg_dump does not include cluster roles. This exact NOLOGIN RLS role is the
# migration-owned Research dependency, not a copied runtime credential/grant.
# Unknown role dependencies still fail pg_restore; never use --no-acl to pass.
"${DOCKER[@]}" exec "${PG}" psql -U portal -d "${SOURCE_DB}" -v ON_ERROR_STOP=1 -c \
  'CREATE ROLE portal_research_runtime NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOREPLICATION NOBYPASSRLS' \
  > "${OUTPUT}/role-bootstrap.private.log" 2>&1
"${DOCKER[@]}" exec -i "${PG}" pg_restore -U portal -d "${SOURCE_DB}" --exit-on-error \
  < "${BACKUP}" > "${OUTPUT}/source-restore.private.log" 2>&1
capture() {
  "${DOCKER[@]}" run --rm --name "${NODE}" --network "${NETWORK}" --read-only \
    --cpus 1 --memory 512m --pids-limit 128 --user "$(id -u):$(id -g)" \
    --tmpfs /tmp:rw,noexec,mode=1777,size=16m \
    -v "${ROOT_DIR}/scripts/execution-v2:/repo/scripts/execution-v2:ro" \
    -v "${ROOT_DIR}/apps/control-api/package.json:/repo/apps/control-api/package.json:ro" \
    -v "${ROOT_DIR}/apps/control-api/node_modules:/repo/apps/control-api/node_modules:ro" \
    -v "${OUTPUT}:/evidence" \
    -e PGHOST="${PG}" -e PGPORT=5432 -e PGUSER=portal -e PGPASSWORD=portal -e PGDATABASE="$1" \
    "${NODE_IMAGE}" node /repo/scripts/execution-v2/migration-preservation-cli.mjs capture \
      --profile "${PROFILE}" --output "/evidence/$2"
}
capture "${SOURCE_DB}" source.json
"${DOCKER[@]}" exec "${PG}" pg_dump -U portal -d "${SOURCE_DB}" -Fc -f /tmp/roundtrip.dump
"${DOCKER[@]}" exec "${PG}" createdb -U portal "${RESTORE_DB}"
"${DOCKER[@]}" exec "${PG}" pg_restore -U portal -d "${RESTORE_DB}" --exit-on-error /tmp/roundtrip.dump \
  > "${OUTPUT}/roundtrip-restore.private.log" 2>&1
capture "${RESTORE_DB}" restored.json
node "${ROOT_DIR}/scripts/execution-v2/migration-preservation-cli.mjs" compare \
  --source "${OUTPUT}/source.json" --restored "${OUTPUT}/restored.json" --output "${OUTPUT}/comparison.json"
sha256sum "${BACKUP}" "${OUTPUT}/source.json" "${OUTPUT}/restored.json" "${OUTPUT}/comparison.json" \
  > "${OUTPUT}/digests.private.txt"
printf 'BACKUP_ROUNDTRIP_PRESERVED; no runtime DB connected; disposable cell cleanup on exit.\n'
