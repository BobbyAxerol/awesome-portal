#!/usr/bin/env bash
# UDB02-T04, fixed preview only. Exact disposable restore targets; no broad prune.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
helper="$root/scripts/research-preview/preview.sh"
state="$(realpath -e "${1:?provide the applied UDB02 state directory}")"
[[ "$root" == /home/bobby/portal-research && "$state" == /home/bobby/.local/state/portal-udb02/apply-* && -f "$state/import.json" ]] || exit 1
[[ -f /home/bobby/.config/portal-research-preview/execution-store.enabled ]] || exit 1
DOCKER=(docker);if ! docker info >/dev/null 2>&1;then DOCKER=(sudo -n docker);fi
pg=portal-research-preview-execution-postgres-1
core_pg=portal-research-preview-portal-postgres-1
control=portal-research-preview-control-api-1
restore=portal-udb02-restore-pg
runner=portal-udb02-restore-api
network=portal-udb02-restore
volume=portal-udb02-restore-pg-data
secrets=/home/bobby/.config/portal-research-preview/execution-store
umask 077
owned=0
cleanup() {
  if [[ "$owned" == 1 ]];then
    "${DOCKER[@]}" rm -f "$runner" "$restore" >/dev/null 2>&1 || true
    "${DOCKER[@]}" network rm "$network" >/dev/null
    "${DOCKER[@]}" volume rm "$volume" >/dev/null
  fi
}
trap cleanup EXIT
for kind in container network volume;do
  case "$kind" in container) targets=("$restore" "$runner");;network)targets=("$network");;volume)targets=("$volume");;esac
  for name in "${targets[@]}";do if "${DOCKER[@]}" "$kind" inspect "$name" >/dev/null 2>&1;then echo 'UDB02 restore name already exists; refuse takeover' >&2;exit 1;fi;done
done
"${DOCKER[@]}" inspect "$control" "$pg" "$core_pg" | node -e '
let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.stringify(JSON.parse(s).map(c=>({name:c.Name,id:c.Id,image:c.Image,started_at:c.State.StartedAt,memory:c.HostConfig.Memory,ports:c.HostConfig.PortBindings,networks:Object.keys(c.NetworkSettings.Networks),mounts:c.Mounts.map(m=>({name:m.Name??null,destination:m.Destination}))})),null,2)))' > "$state/runtime-before.json"
image="$("${DOCKER[@]}" inspect -f '{{.Image}}' "$control")"
readback() {
  "$helper" compose exec -T -e UDB_SAVE_RESPONSE=true control-api node < "$root/scripts/research-udb/store-readback.cjs" > "$state/$1.jsonl"
}
if [[ "${2:-}" != restore-only ]];then
readback live-before

# Actual domain restart with the API/Core still running. No fallback to Core.
api_pid="$("${DOCKER[@]}" inspect -f '{{.State.Pid}}' "$control")"
"$helper" compose stop -t 30 execution-postgres
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8095/api/control/readyz >/dev/null
"$helper" compose up -d --no-build --no-deps --wait execution-postgres
[[ "$("${DOCKER[@]}" inspect -f '{{.State.Pid}}' "$control")" == "$api_pid" ]] || { echo 'UDB02 API unexpectedly restarted' >&2;exit 1; }
readback live-domain-restart

# Core restart is also independent; pause only Python intake/worker while idle.
active="$("$helper" compose exec -T portal-postgres psql -X -U portal -d portal_control -Atc "SELECT count(*) FROM research.jobs WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')")"
[[ "$active" == 0 ]] || exit 1
"$helper" compose stop -t 30 portal-api quant-worker-py
"$helper" compose exec -T control-api node < "$root/scripts/research-udb/inventory.cjs" > "$state/core-restart-before.json"
domain_pid="$("${DOCKER[@]}" inspect -f '{{.State.Pid}}' "$pg")"
"$helper" compose restart -t 30 portal-postgres
for _ in $(seq 1 30);do
  if "$helper" compose exec -T portal-postgres pg_isready -U portal -d portal_control >/dev/null 2>&1;then break;fi;sleep 1
done
"$helper" compose exec -T execution-postgres psql -X -U exec_owner -d portal_execution -Atc 'SELECT count(*) FROM execution_timeseries_history' > "$state/domain-during-core-restart.txt"
[[ "$("${DOCKER[@]}" inspect -f '{{.State.Pid}}' "$pg")" == "$domain_pid" ]] || exit 1
[[ "$("${DOCKER[@]}" inspect -f '{{.State.Pid}}' "$control")" == "$api_pid" ]] || exit 1
"$helper" compose exec -T control-api node < "$root/scripts/research-udb/inventory.cjs" > "$state/core-restart-after.json"
node - "$state/core-restart-before.json" "$state/core-restart-after.json" <<'NODE'
const fs=require('fs'),assert=require('assert/strict');const [a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));
assert.deepEqual(a.custody,b.custody);assert.deepEqual(a.migrations,b.migrations);
console.log('UDB02 Core restart: identity/research/seals/migrations unchanged');
NODE
"$helper" compose start portal-api quant-worker-py
readback live-core-restart
fi

# Custom-format backup/restore of the isolated domain only, never auth/Core.
"$helper" compose exec -T execution-postgres pg_dump -U exec_owner -d portal_execution --format=custom > "$state/execution.dump"
sha256sum "$state/execution.dump" > "$state/execution.sha256"
"${DOCKER[@]}" network create --internal --label portal.phase=UDB-02 "$network" >/dev/null
owned=1
"${DOCKER[@]}" volume create --label portal.phase=UDB-02 "$volume" >/dev/null
"${DOCKER[@]}" run -d --name "$restore" --label portal.phase=UDB-02 --network "$network" --network-alias execution-postgres \
  --memory=536870912 --memory-swap=536870912 --cpus=1 --pids-limit=96 --shm-size=64m \
  -e POSTGRES_USER=exec_owner -e POSTGRES_DB=portal_execution -e POSTGRES_PASSWORD_FILE=/run/secrets/execution/owner-password \
  -v "$volume:/var/lib/postgresql/data" \
  -v "$root/deploy/postgres/portal.conf:/etc/postgresql/portal.conf:ro" \
  -v "$root/deploy/postgres/execution.conf:/etc/postgresql/execution.conf:ro" \
  -v "$root/deploy/postgres/execution-init.sh:/docker-entrypoint-initdb.d/execution-init.sh:ro" \
  -v "$secrets/owner-password:/run/secrets/execution/owner-password:ro" \
  -v "$secrets/runtime-password:/run/secrets/execution/runtime-password:ro" \
  postgres:16.15-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685 \
  postgres -c config_file=/etc/postgresql/execution.conf >/dev/null
for _ in $(seq 1 30);do
  if "${DOCKER[@]}" exec "$restore" pg_isready -U exec_owner -d portal_execution >/dev/null 2>&1;then break;fi;sleep 1
done
"${DOCKER[@]}" exec -i "$restore" pg_restore -U exec_owner -d portal_execution --no-owner --exit-on-error < "$state/execution.dump"
"${DOCKER[@]}" create --name "$runner" --label portal.phase=UDB-02 --network "$network" \
  --memory=512000000 --memory-swap=512000000 --cpus=1 --pids-limit=64 --read-only --cap-drop=ALL --security-opt no-new-privileges:true \
  -e DATABASE_URL=postgres://portal:portal@portal-postgres:5432/portal_control -e AUTH_MODE=dev -e PORTAL_ENV=local \
  -e EXECUTION_DATABASE_URL_FILE=/run/secrets/execution/runtime-url -e UDB_READBACK_INPROCESS=true -e UDB_SAVE_RESPONSE=true -e UDB_VERIFY_TRANSFERS=true \
  -v "$secrets/runtime-url:/run/secrets/execution/runtime-url:ro" \
  -v /home/bobby/.local/state/portal-udb02/transfer:/var/lib/udb-transfer:ro \
  -v "$root/scripts/research-udb/store-readback.cjs:/opt/control-api/store-readback.cjs:ro" \
  "$image" node store-readback.cjs >/dev/null
"${DOCKER[@]}" network connect portal-research-preview_portal "$runner"
"${DOCKER[@]}" start -a "$runner" > "$state/restore-readback.jsonl"
[[ "$("${DOCKER[@]}" inspect -f '{{.State.ExitCode}}' "$runner")" == 0 ]] || exit 1
"${DOCKER[@]}" inspect "$restore" "$runner" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.stringify(JSON.parse(s).map(c=>({name:c.Name,image:c.Image,oom:c.State.OOMKilled,exit:c.State.ExitCode})),null,2)))' > "$state/restore-runtime.json"
echo "UDB02-T04 ${2:-restart-and-restore}: exact domain restore/content/BFF PASS; receipts: $state"
