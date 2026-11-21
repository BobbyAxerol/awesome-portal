#!/usr/bin/env bash
# BE-P18 B1 large-scale EXPLAIN gate driver. Heavy: ~1M-row corpus in a DISPOSABLE PostgreSQL container that this
# script creates and removes. It never touches another container, never uses docker compose and never reaches the
# research-preview stack. The whole run holds /tmp/portal-heavy.lock (waits while a hook or another heavy job runs).
#
#   scripts/be-p18-b1-explain.sh                 # full scale, writes the receipt into the BE-CLAUDE evidence folder
#   B1_EXPLAIN_SCALE=0.02 scripts/be-p18-b1-explain.sh   # smoke at 2% scale (receipt goes to a scratch dir)
#
# Needs: docker (directly or `sudo -n docker`, or put a wrapper first in PATH), apps/control-api/node_modules.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/apps/control-api"
SCALE="${B1_EXPLAIN_SCALE:-1}"
EVIDENCE_DIR="${ROOT_DIR}/upgrade/execution_loop/evidence/BE-CLAUDE-2026-10-20"
OUT_DIR="${B1_EXPLAIN_OUT_DIR:-${EVIDENCE_DIR}}"
# Same image the CI cell uses (postgres 16.15), pinned by digest.
POSTGRES_IMAGE="postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6"
NAME="explain-b1-$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
LOCK="${PORTAL_HEAVY_LOCK:-/tmp/portal-heavy.lock}"

if [ "${B1_EXPLAIN_LOCKED:-}" != "1" ]; then
  exec env B1_EXPLAIN_LOCKED=1 flock "${LOCK}" "$0" "$@"
fi

command -v docker >/dev/null 2>&1 || { printf 'docker is required\n' >&2; exit 1; }
cleanup() { docker rm -f -v "${NAME}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

PASSWORD="b1x-$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n')"
# Bounded: <= 3 GB RAM, <= 3 CPUs. Published on loopback only, random host port. Anonymous data volume is removed with -v.
docker run -d --name "${NAME}" --memory 3g --memory-swap 3g --cpus 3 --shm-size 512m \
  -e POSTGRES_PASSWORD="${PASSWORD}" -p 127.0.0.1::5432 "${POSTGRES_IMAGE}" \
  -c shared_buffers=768MB -c effective_cache_size=2GB -c max_wal_size=4GB -c checkpoint_timeout=30min \
  -c fsync=off -c synchronous_commit=off -c full_page_writes=off >/dev/null
for _ in $(seq 1 60); do
  docker exec "${NAME}" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done
docker exec "${NAME}" pg_isready -U postgres >/dev/null
PORT="$(docker port "${NAME}" 5432/tcp | head -n1 | sed 's/.*://')"

mkdir -p "${OUT_DIR}"
cd "${APP_DIR}"
export TEST_DATABASE_URL="postgres://postgres:${PASSWORD}@127.0.0.1:${PORT}/postgres"
STATUS=0
# Functional regression of what the gate's two fixes touch (row-scope predicate, deadline engine, queue V2 service and
# index migration 148 (renumbered 149 on merge, see the receipt note)), on the SAME disposable server, before the heavy corpus. B1_EXPLAIN_REGRESSION= (empty) skips it.
REGRESSION="${B1_EXPLAIN_REGRESSION-test/elp2-query-scope.spec.ts test/query-snapshot-reader.spec.ts test/elp204-operational-current.spec.ts}"
if [ -n "${REGRESSION}" ]; then
  # shellcheck disable=SC2086
  node_modules/.bin/vitest run --maxWorkers=1 --no-file-parallelism ${REGRESSION} || STATUS=$?
fi
B1_EXPLAIN=1 B1_EXPLAIN_DISPOSABLE=1 B1_EXPLAIN_SCALE="${SCALE}" B1_EXPLAIN_OUT_DIR="${OUT_DIR}" \
  node_modules/.bin/vitest run --maxWorkers=1 --no-file-parallelism "${B1_EXPLAIN_SPEC:-test/be-p18-b1-explain.pg.spec.ts}" || STATUS=$?
exit "${STATUS}"
