#!/usr/bin/env bash
# UDB-01 authorized preview-only change window. No bootstrap, SQL patch,
# production/dev source, new grants, volume replacement or broad restart.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
helper="$root/scripts/research-preview/preview.sh"
state_root="/home/bobby/.local/state/portal-udb01"
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
project=portal-research-preview
pg=portal-research-preview-portal-postgres-1
mode="${1:-}"
case "$mode" in apply|rollback) ;; *) echo "Usage: $0 apply | rollback <state-directory>" >&2; exit 2;; esac
umask 077

check_idle() {
  local active
  active="$("$helper" compose exec -T portal-postgres psql -X -U portal -d portal_control -Atc \
    "SELECT count(*) FROM research.jobs j LEFT JOIN research.run_producers p
       ON p.workspace_id=j.workspace_id AND p.run_id=j.run_id
     WHERE j.state IN ('QUEUED','RETRY_WAIT','CLAIMED','RUNNING','CANCEL_REQUESTED')
       AND NOT (j.state='QUEUED' AND j.current_worker_attempt_id IS NULL
                AND coalesce(p.dispatch_state='PENDING',false))")"
  [[ "$active" == 0 ]] || { echo 'UDB: preserve active children; rollout refused' >&2; exit 1; }
  [[ "$("${DOCKER[@]}" inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$pg")" == "$project" ]] || exit 1
  [[ "$("${DOCKER[@]}" inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$pg")" == portal-research-preview_portal-postgres-data ]] || exit 1
}
capture() {
  "$helper" compose run --rm --no-deps -T control-api node < "$root/scripts/research-udb/inventory.cjs"
}
start_apps() {
  "$helper" compose up -d --no-build --no-deps --wait control-api portal-api quant-worker-py
  "$helper" compose exec -T portal-web nginx -t
  "$helper" compose exec -T portal-web nginx -s reload
  curl --fail --silent --show-error --retry 8 --retry-delay 1 --retry-all-errors --max-time 5 \
    http://127.0.0.1:8095/api/control/readyz >/dev/null
  curl --fail --silent --show-error --retry 8 --retry-delay 1 --retry-all-errors --max-time 5 \
    http://127.0.0.1:8095/api/ready >/dev/null
}
check_idle
if [[ "$mode" == rollback ]]; then
  state="$(realpath -e "${2:?rollback requires its recorded state directory}")"
  [[ "$state" == "$state_root"/preview-* && -f "$state/rollback.json" ]] || { echo 'UDB: invalid rollback state' >&2; exit 1; }
  "$helper" compose stop -t 30 control-api portal-api quant-worker-py
  "$helper" compose -f "$state/rollback.json" up -d --no-build --no-deps portal-postgres
  "$helper" compose -f "$state/rollback.json" up -d --no-build --no-deps control-api portal-api quant-worker-py
  "$helper" compose exec -T portal-web nginx -s reload
  echo "UDB: prior preview images/config restored; same DB volume and forward schema preserved ($state)"
  exit
fi

state="$state_root/preview-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$state"
"${DOCKER[@]}" inspect "$pg" portal-research-preview-control-api-1 \
  portal-research-preview-portal-api-1 portal-research-preview-quant-worker-py-1 | \
  node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{
    const services={}; for (const c of JSON.parse(s)) {
      const name=c.Config.Labels["com.docker.compose.service"]; services[name]={image:c.Image};
      if (name==="portal-postgres") Object.assign(services[name],{command:c.Config.Cmd,
        mem_limit:c.HostConfig.Memory,memswap_limit:c.HostConfig.MemorySwap,
        shm_size:c.HostConfig.ShmSize,cpus:c.HostConfig.NanoCpus/1e9,pids_limit:c.HostConfig.PidsLimit??0});
    } console.log(JSON.stringify({services},null,2));});' > "$state/rollback.json"
git -C "$root" diff --binary -- compose.yaml deploy/postgres deploy/research-preview \
  apps/control-api/src/execution/shared-read.repository.ts apps/control-api/migrations > "$state/source.patch"
sha256sum "$state/source.patch" > "$state/source.sha256"
sha256sum "$root/compose.yaml" "$root/deploy/postgres/portal.conf" "$root/deploy/postgres/preview.conf" \
  "$root/deploy/postgres/p23.conf" "$root/apps/control-api/src/execution/shared-read.repository.ts" \
  "$root/apps/control-api/migrations/1723680000130_udb-cache-storage-forward-repair.sql" > "$state/source-files.sha256"
"$helper" compose stop -t 30 control-api portal-api
check_idle
"$helper" compose stop -t 30 quant-worker-py
capture > "$state/before.json"
"$helper" compose exec -T portal-postgres pg_dump -U portal -d portal_control \
  --format=custom --exclude-table-data=public.execution_shared_read_cache > "$state/database.dump"
sha256sum "$state/database.dump" > "$state/database.sha256"

# A failure intentionally leaves preview intake stopped with a valid backup.
# No automatic restore of an old identity/session snapshot can resurrect grants.
trap 'echo "UDB: apply interrupted; preserve $state and use its reviewed rollback command" >&2' ERR
"$helper" compose up -d --no-build --no-deps --wait portal-postgres
"$helper" compose run --rm --no-deps -T control-api-migrate
capture > "$state/after.json"
node - "$state/before.json" "$state/after.json" <<'NODE'
const fs=require('fs'),assert=require('assert/strict');
const before=JSON.parse(fs.readFileSync(process.argv[2]));
const after=JSON.parse(fs.readFileSync(process.argv[3]));
assert.deepEqual(after.custody,before.custody,'Core identity/grants/workspaces changed');
assert.equal(after.activeJobs,0);
const cache=after.tables.find(t=>t.schema==='public'&&t.name==='execution_shared_read_cache');
assert.equal(cache.relpersistence,'u');
assert(cache.toast_options.includes('autovacuum_vacuum_threshold=5000'));
assert(after.migrations.some(m=>m.name==='1723680000130_udb-cache-storage-forward-repair'));
assert.equal(after.settings.find(s=>s.name==='shared_buffers').setting,'32768');
assert(after.settings.every(s=>!s.pending_restart));
console.log('UDB preview custody, forward DDL and actual config PASS');
NODE
start_apps
trap - ERR
echo "UDB preview profile applied; private backup/custody/rollback receipt: $state"
