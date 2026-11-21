#!/usr/bin/env bash
# TEST_ONLY: native READ/SSE integration against one disposable PostgreSQL.
# Synthetic source and keys; no qualified Edge authority or runtime change.
set -euo pipefail
umask 077
[[ "$#" == 0 ]] || exit 2
exec 9>/tmp/portal-heavy.lock
flock -n 9
readonly suffix="$$${RANDOM}${RANDOM}"
[[ "$suffix" =~ ^[0-9]+$ ]] || exit 2
readonly network="native-frame-test-net-$suffix"
readonly postgres="control-api-test-postgres-$suffix"
readonly node="native-frame-test-node-$suffix"
readonly pg_image='postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6'
readonly node_image='node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32'
readonly root="$(cd "$(dirname "$0")/.." && pwd -P)"
if docker info >/dev/null 2>&1; then d=(docker); else d=(sudo -n docker); fi
"${d[@]}" image inspect "$pg_image" "$node_image" >/dev/null
for name in "$postgres" "$node"; do ! "${d[@]}" container inspect "$name" >/dev/null 2>&1 || exit 2; done
! "${d[@]}" network inspect "$network" >/dev/null 2>&1 || exit 2
cleanup() {
  "${d[@]}" rm -f "$node" "$postgres" >/dev/null 2>&1 || true
  "${d[@]}" network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT
"${d[@]}" network create --internal "$network" >/dev/null
"${d[@]}" run -d --rm --pull=never --name "$postgres" --network "$network" --read-only \
  --cpus 0.6 --memory 512m --pids-limit 192 \
  --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=1024m \
  --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m --tmpfs /tmp:rw,exec,mode=1777,size=64m \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control_test "$pg_image" >/dev/null
ready=false
for _ in $(seq 1 30); do
  if "${d[@]}" exec "$postgres" pg_isready -U portal -d portal_control_test >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || exit 1
"${d[@]}" run --rm --pull=never --name "$node" --network "$network" --read-only \
  --cpus 1.4 --memory 1024m --pids-limit 256 \
  -v "$root/apps/control-api:/workspace/apps/control-api:ro" \
  -v "$root/services/portal-execution-edge-rs/contracts:/workspace/services/portal-execution-edge-rs/contracts:ro" \
  -v "$root/packages/contracts:/workspace/packages/contracts:ro" \
  -v "$root/deploy/control-api/bootstrap-users.yaml:/workspace/deploy/control-api/bootstrap-users.yaml:ro" \
  --tmpfs /workspace/apps/control-api/node_modules/.vite-temp:rw,exec,mode=1777,size=32m \
  --tmpfs /tmp:rw,exec,mode=1777,size=64m -w /workspace/apps/control-api -e HOME=/tmp \
  -e TEST_DATABASE_URL="postgres://portal:portal@$postgres:5432/portal_control_test" \
  "$node_image" ./node_modules/.bin/vitest run --maxWorkers=1 --no-file-parallelism test/elp210-native-frame-coupled.spec.ts
