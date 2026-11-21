#!/usr/bin/env bash
# TEST_ONLY: owner/ACL-preserving historical clone in an internal disposable
# cell. Never connect to an existing Portal database or mount its volumes.
set -euo pipefail
umask 077
[[ "$#" == 0 ]] || exit 2
exec 9>/tmp/portal-heavy.lock
flock -n 9
readonly root="$(cd "$(dirname "$0")/.." && pwd -P)"
readonly backup=/home/bobby/.local/state/portal-preview-migration-20261103-EevDSNOc/preview.dump
readonly expected=324fb9f35dbb606773010af310caf1261e386abc6cb57be3abaf378f9f8c15c8
[[ -f "$backup" && ! -L "$backup" && "$(sha256sum "$backup" | cut -d' ' -f1)" == "$expected" ]] || exit 2
readonly suffix="$(openssl rand -hex 4)"
[[ "$suffix" =~ ^[a-f0-9]{8}$ ]] || exit 2
readonly net="elp2-c2-clone-$suffix"
readonly pg="control-api-test-postgres-$suffix"
readonly node="elp2-c2-clone-node-$suffix"
readonly pg_image=postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6
readonly node_image=node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
if docker info >/dev/null 2>&1; then d=(docker); else d=(sudo -n docker); fi
for name in "$pg" "$node"; do ! "${d[@]}" container inspect "$name" >/dev/null 2>&1 || exit 2; done
! "${d[@]}" network inspect "$net" >/dev/null 2>&1 || exit 2
cleanup(){
  # -v removes only anonymous volumes attached to these exact test containers.
  "${d[@]}" rm -f -v "$node" "$pg" >/dev/null 2>&1 || true
  "${d[@]}" network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT
"${d[@]}" network create --internal "$net" >/dev/null
"${d[@]}" run -d --rm --name "$pg" --network "$net" --read-only --cpus 0.5 --memory 512m --pids-limit 256 \
  --mount type=volume,dst=/var/lib/postgresql/data \
  --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m --tmpfs /tmp:rw,exec,mode=1777,size=256m \
  --mount "type=bind,src=$backup,dst=/preview.dump,readonly" \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control_test "$pg_image" >/dev/null
ready=false
for _ in $(seq 1 30); do
  if "${d[@]}" exec "$pg" psql -U portal -d portal_control_test -Atqc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || exit 1
# This role exists only inside the disposable cluster; ownership and ACL
# restoration is intentional, and errors are not ignored.
"${d[@]}" exec "$pg" psql -v ON_ERROR_STOP=1 -U portal -d portal_control_test \
  -c 'CREATE ROLE portal_research_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS' >/dev/null
"${d[@]}" exec "$pg" pg_restore -U portal -d portal_control_test --exit-on-error /preview.dump
"${d[@]}" run --rm --name "$node" --network "$net" --read-only --cpus 1.5 --memory 1024m --pids-limit 256 \
  -v "$root/apps/control-api:/cell/work:ro" \
  --tmpfs /cell/work/node_modules/.vite-temp:rw,exec,mode=1777,size=32m \
  --tmpfs /tmp:rw,exec,mode=1777,size=128m -w /cell/work -e HOME=/tmp \
  -e TEST_DATABASE_URL="postgres://portal:portal@$pg:5432/portal_control_test" \
  -e PORTAL_C2_HISTORICAL_REHEARSAL=TEST_ONLY_RESTORED_CLONE \
  "$node_image" npm test -- test/c2-historical-candidate-rehearsal.spec.ts
