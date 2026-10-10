#!/usr/bin/env bash
# Fixed preview-only operator change window; retain original DB/artifacts.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
helper="$root/scripts/research-preview/preview.sh"
home_dir=/home/bobby/.config/portal-research-preview
state_root=/home/bobby/.local/state/portal-udb02
marker="$home_dir/execution-store.enabled"
overlay="$root/deploy/research-preview/compose.execution-store.yaml"
workspace=ws_06G19F61YB8CFR7TEWMS7HQ660
mode="${1:-}"
DOCKER=(docker); if ! docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
umask 077
case "$mode" in apply|resume|rollback) ;; *) echo 'Usage: execution-store.sh apply | resume/rollback <state-directory>' >&2; exit 2;; esac
[[ "$root" == /home/bobby/portal-research && "$(git -C "$root" branch --show-current)" == docs/research-loop-plan ]] || exit 1
[[ "$("${DOCKER[@]}" inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' portal-research-preview-portal-postgres-1)" == portal-research-preview ]] || exit 1
[[ "$("${DOCKER[@]}" inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' portal-research-preview-portal-postgres-1)" == portal-research-preview_portal-postgres-data ]] || exit 1
active="$("$helper" compose exec -T portal-postgres psql -X -U portal -d portal_control -Atc \
  "SELECT count(*) FROM research.jobs j LEFT JOIN research.run_producers p
    ON p.workspace_id=j.workspace_id AND p.run_id=j.run_id
    WHERE j.state IN ('QUEUED','RETRY_WAIT','CLAIMED','RUNNING','CANCEL_REQUESTED')
    AND NOT (j.state='QUEUED' AND j.current_worker_attempt_id IS NULL AND coalesce(p.dispatch_state='PENDING',false))")"
[[ "$active" == 0 ]] || { echo 'UDB02 preserve active child; change window refused' >&2;exit 1; }
compose_domain() {
  if [[ -f "$marker" ]]; then "$helper" compose "$@";
  else "$helper" compose -f "$overlay" "$@"; fi
}
finish_window() {
  "$helper" compose exec -T -e "UDB_REVIEW_WORKSPACE_ID=$workspace" control-api node < "$root/scripts/research-udb/inventory.cjs" > "$state/after.json"
  node - "$state/before.json" "$state/after.json" "$state/provision.json" <<'NODE'
const fs=require('fs'),assert=require('assert/strict');const [a,b,p]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));
for(const [name,held] of Object.entries(a.custody)) {
 if(!['workspaces','workspace_members'].includes(name)) assert.deepEqual(b.custody[name],held,name);
}
assert.equal(b.custody.workspaces.count,a.custody.workspaces.count+Number(p.created));
assert.equal(b.custody.workspace_members.count,a.custody.workspace_members.count+Number(p.created));
assert.deepEqual(b.originalWorkspaceCustody,a.originalWorkspaceCustody,'original workspaces changed');
console.log('UDB02 custody PASS; only audited owner review workspace/membership added');
NODE
  "$helper" compose start portal-api quant-worker-py
  "$helper" compose exec -T portal-web nginx -t
  "$helper" compose exec -T portal-web nginx -s reload
  curl --fail --silent --show-error --retry 8 --retry-delay 1 --retry-all-errors --max-time 5 http://127.0.0.1:8095/api/control/readyz >/dev/null
  curl --fail --silent --show-error --retry 8 --retry-delay 1 --retry-all-errors --max-time 5 http://127.0.0.1:8095/api/ready >/dev/null
}
if [[ "$mode" == resume ]];then
  state="$(realpath -e "${2:?}")"
  [[ "$state" == "$state_root"/apply-* && -f "$state/import.json" && -f "$state/provision.json" && -f "$marker" ]] || exit 1
  finish_window;echo "UDB02 recorded window resumed: $state";exit
fi
if [[ "$mode" == rollback ]]; then
  state="$(realpath -e "${2:?}")"
  [[ "$state" == "$state_root"/apply-* && -f "$state/rollback.json" ]] || exit 1
  rollback_file="$state/rollback.json"
  if [[ -n "${3:-}" ]];then
    rollback_file="$(realpath -e "$3")"
    [[ "$rollback_file" == "$state"/reconstructed-baseline.rollback.json ]] || exit 1
  fi
  previous="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).services["control-api"].image)' "$rollback_file")"
  # A bad historical OCI reference must not stop the currently working API.
  "${DOCKER[@]}" image inspect "$previous" >/dev/null
  "$helper" compose stop -t 30 control-api
  # Remove only our empty enable marker, retain credentials/data/backup.
  if [[ -f "$marker" ]]; then [[ ! -s "$marker" ]] || exit 1;unlink "$marker";fi
  "$helper" compose -f "$rollback_file" up -d --pull never --no-build --no-deps --wait control-api
  compose_domain stop -t 30 execution-postgres
  "$helper" compose start portal-api quant-worker-py
  "$helper" compose exec -T portal-web nginx -s reload
  echo 'UDB02 prior Core binding restored, both volumes preserved'; exit
fi
[[ ! -f "$marker" ]] || { echo 'UDB02 already enabled: use receipt, do not overwrite rollback';exit 1; }
node "$root/scripts/research-udb/store-secrets.cjs"
mkdir -p "$state_root/transfer"
state="$state_root/apply-$(date -u +%Y%m%dT%H%M%SZ)";mkdir "$state"
"${DOCKER[@]}" inspect portal-research-preview-control-api-1 | node -e '
let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.stringify({services:{"control-api":{image:JSON.parse(s)[0].Image}}})))' > "$state/rollback.json"
"$helper" compose stop -t 30 control-api portal-api quant-worker-py
"$helper" compose run --rm --no-deps -T -e "UDB_REVIEW_WORKSPACE_ID=$workspace" control-api node < "$root/scripts/research-udb/inventory.cjs" > "$state/before.json"
"$helper" compose exec -T portal-postgres pg_dump -U portal -d portal_control --format=custom \
  --exclude-table-data=public.execution_shared_read_cache > "$state/core.dump"
sha256sum "$state/core.dump" > "$state/core.sha256"
trap 'echo "UDB02 interrupted; retain $state and use recorded rollback, never reset Core identity" >&2' ERR
compose_domain up -d --no-build --no-deps --wait execution-postgres
# Versioned idempotent role bootstrap can recover interrupted new-volume init.
# No hand SQL, no password rotation, no Core/identity table access.
compose_domain exec -T --user postgres execution-postgres bash /docker-entrypoint-initdb.d/execution-init.sh
compose_domain run --rm --no-deps -T execution-store-admin
compose_domain run --rm --no-deps -T execution-store-admin node dist/cli/execution-store.js provision "$workspace" > "$state/provision.json"
compose_domain run --rm --no-deps -T execution-store-admin node dist/cli/execution-store.js import /var/lib/udb-transfer/current > "$state/import.json"
if [[ -f "$state_root/transfer/entities.manifest.json" ]];then
  compose_domain run --rm --no-deps -T execution-store-admin node dist/cli/execution-store.js import /var/lib/udb-transfer/entities > "$state/entities-import.json"
fi
"$helper" compose stop -t 30 control-api
node - "$marker" <<'NODE'
require('node:fs').writeFileSync(process.argv[2],'',{flag:'wx',mode:0o600});
NODE
"$helper" compose up -d --no-build --no-deps --wait control-api
finish_window
trap - ERR
echo "UDB02 applied; exact rollback/custody: $state"
