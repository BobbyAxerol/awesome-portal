#!/usr/bin/env bash
set -euo pipefail
# One owned tmpfs PostgreSQL; no shared Portal data or persistent volume.
task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
task_suffix="${FULL04_TEST_RUN_SUFFIX:-$$}"
[[ "$task_suffix" =~ ^[a-zA-Z0-9_-]+$ ]] || exit 1
task_container="research-full04-postgres-${task_suffix}"
task_image="postgres:16-alpine@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6"
DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
cleanup() { "${DOCKER[@]}" rm -f "$task_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${DOCKER[@]}" run -d --rm --name "$task_container" \
  --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=1024m \
  --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m \
  --tmpfs /tmp:rw,exec,mode=1777,size=64m \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control_test \
  -p 127.0.0.1::5432 "$task_image" >/dev/null
task_ready=false
for _ in $(seq 1 30); do
  if "${DOCKER[@]}" exec "$task_container" pg_isready -U portal -d portal_control_test >/dev/null 2>&1; then task_ready=true; break; fi
  sleep 1
done
[[ "$task_ready" == true ]] || exit 1
task_port="$("${DOCKER[@]}" port "$task_container" 5432/tcp | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n 1)"
[[ "$task_port" =~ ^[0-9]+$ ]] || exit 1
cd "$task_root/apps/control-api"
case "${FULL04_TEST_SCOPE:-migration}" in
  migration) task_tests=(test/research-full03-immutable-av-migration.spec.ts) ;;
  research) task_tests=(test/research*.spec.ts) ;;
  *) printf 'Use migration or research test scope.\n' >&2; exit 1 ;;
esac
TEST_DATABASE_URL="postgres://portal:portal@127.0.0.1:${task_port}/portal_control_test" \
 ./node_modules/.bin/vitest run --maxWorkers=1 --no-file-parallelism \
 "${task_tests[@]}"
echo "FULL04 isolated upgrade/immutable-history PostgreSQL proof: PASS"
