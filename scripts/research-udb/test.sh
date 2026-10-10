#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="portal-udb01-test-$$"
image="postgres:16.15-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685"
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
cleanup() { "${DOCKER[@]}" rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${DOCKER[@]}" run -d --rm --name "$container" --label portal.phase=UDB-01 \
  --memory=900000000 --memory-swap=900000000 --cpus=2 --pids-limit=128 \
  --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=512m --shm-size=64m \
  -v "$root/deploy/postgres/portal.conf:/etc/postgresql/portal.conf:ro" \
  -v "$root/deploy/postgres/p23.conf:/etc/postgresql/p23.conf:ro" \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control_test \
  -p 127.0.0.1::5432 "$image" postgres -c config_file=/etc/postgresql/p23.conf >/dev/null
for _ in $(seq 1 40); do
  if "${DOCKER[@]}" exec "$container" pg_isready -U portal -d portal_control_test >/dev/null 2>&1; then break; fi
  sleep 1
done
port="$("${DOCKER[@]}" port "$container" 5432/tcp | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p')"
[[ "$port" =~ ^[0-9]+$ ]] || { echo 'UDB disposable PG unavailable' >&2; exit 1; }
cd "$root/apps/control-api"
TEST_DATABASE_URL="postgres://portal:portal@127.0.0.1:$port/portal_control_test" \
  ./node_modules/.bin/vitest run test/udb-cache-storage.spec.ts \
    test/execution-shared-read-cache-maintenance.spec.ts test/execution-shared-admission.spec.ts \
    test/migration-recovery.spec.ts test/auth.spec.ts test/a4-owner-access.spec.ts \
    test/a4-governance-delegation.spec.ts test/local-read-authority.spec.ts
"${DOCKER[@]}" exec "$container" psql -X -U portal -d portal_control_test -Atc \
  "SELECT json_build_object('shared_buffers',current_setting('shared_buffers'),'autovacuum_work_mem',current_setting('autovacuum_work_mem'),'cache_persistence',(SELECT relpersistence FROM pg_class WHERE oid='execution_shared_read_cache'::regclass));"
"${DOCKER[@]}" stats --no-stream --format '{{.Name}} {{.MemUsage}}' "$container"

# A crashed backend forces actual postmaster crash recovery without deleting
# tmpfs / recreating the test DB. UNLOGGED cache may vanish; WAL-backed facts
# and credentials must not. No runtime process is involved.
"${DOCKER[@]}" exec "$container" psql -X -v ON_ERROR_STOP=1 -U portal -d portal_control_test -c \
  "CREATE TABLE public.udb_durable_canary (id integer PRIMARY KEY, value text NOT NULL);
   INSERT INTO public.udb_durable_canary VALUES (1,'immutable-test-fact');
   INSERT INTO portal_users (user_id,username,display_name,role,status,must_change_password)
   VALUES ('usr_udb_crash','udb-crash','Crash Test','ADMIN','ACTIVE',false);
   INSERT INTO workspaces (workspace_id,name,owner_user_id) VALUES ('ws_udb_crash','Crash Test','usr_udb_crash');
   INSERT INTO execution_shared_read_cache
    (cache_key,source_id,profile_id,workspace_id,principal_digest,adapter_revision,request_digest,
     etag,authority,freshness,completeness,as_of,response_body,response_bytes,stored_at,expires_at)
   VALUES ('sha256:'||repeat('1',64),'udb-fixture','PAPER_BINANCE_USDM','ws_udb_crash','sha256:'||repeat('2',64),
     'UDB01','sha256:'||repeat('3',64),'\"sha256-'||repeat('4',64)||'\"','UDB_FIXTURE','FRESH','COMPLETE',now(),'{}',2,now(),now()+interval '1 hour');
   CHECKPOINT;" >/dev/null
"${DOCKER[@]}" exec -e PGAPPNAME=udb-crash-target "$container" psql -X -U portal -d portal_control_test -c 'SELECT pg_sleep(30)' >/dev/null 2>&1 &
target_job=$!
sleep 1
pid="$("${DOCKER[@]}" exec "$container" psql -X -U portal -d portal_control_test -Atc "SELECT pid FROM pg_stat_activity WHERE application_name='udb-crash-target' AND state='active'")"
[[ "$pid" =~ ^[0-9]+$ && "$pid" -gt 1 ]] || { echo 'Crash target not uniquely identified' >&2; exit 1; }
"${DOCKER[@]}" exec --user postgres "$container" kill -9 "$pid"
wait "$target_job" || true
for _ in $(seq 1 20); do
  if "${DOCKER[@]}" exec "$container" pg_isready -U portal -d portal_control_test >/dev/null 2>&1; then break; fi
  sleep 1
done
proof="$("${DOCKER[@]}" exec "$container" psql -X -U portal -d portal_control_test -Atc \
  "SELECT (SELECT count(*) FROM execution_shared_read_cache)=0 AND
     (SELECT value FROM udb_durable_canary WHERE id=1)='immutable-test-fact' AND
     EXISTS (SELECT 1 FROM portal_users WHERE user_id='usr_udb_crash');")"
[[ "$proof" == t ]] || { echo 'UDB crash custody failed' >&2; exit 1; }
echo 'UDB01-T03 actual crash recovery: cache lost, durable fact and identity preserved PASS'
