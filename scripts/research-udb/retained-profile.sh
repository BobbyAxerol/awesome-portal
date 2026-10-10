#!/usr/bin/env bash
# UDB03 fixed local preview reader change window. No source activation/data move.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
helper="$root/scripts/research-preview/preview.sh"
marker=/home/bobby/.config/portal-research-preview/execution-retained.enabled
state_root=/home/bobby/.local/state/portal-udb03
mode="${1:-}"
[[ "$root" == /home/bobby/portal-research && "$(git -C "$root" branch --show-current)" == docs/research-loop-plan ]] || exit 1
[[ -f /home/bobby/.config/portal-research-preview/execution-store.enabled ]] || exit 1
DOCKER=(docker);if ! docker info >/dev/null 2>&1;then DOCKER=(sudo -n docker);fi
umask 077
case "$mode" in
  apply)
    [[ ! -f "$marker" ]] || { echo 'UDB03 already active; do not overwrite rollback';exit 1; }
    [[ "$("$helper" compose exec -T portal-postgres psql -X -U portal -d portal_control -Atc "SELECT count(*) FROM research.jobs WHERE state IN ('CLAIMED','RUNNING','CANCEL_REQUESTED')")" == 0 ]] || { echo 'UDB03 preserve active Research work';exit 1; }
    state="$state_root/apply-$(date -u +%Y%m%dT%H%M%SZ)";mkdir -p "$state"
    "${DOCKER[@]}" inspect portal-research-preview-control-api-1 | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.stringify({services:{"control-api":{image:JSON.parse(s)[0].Image}}})))' > "$state/rollback.json"
    "$helper" compose exec -T control-api node < "$root/scripts/research-udb/inventory.cjs" > "$state/before.json"
    "$helper" compose exec -T portal-postgres pg_dump -U portal -d portal_control --format=custom --exclude-table-data=public.execution_shared_read_cache > "$state/core.dump"
    sha256sum "$state/core.dump" > "$state/core.sha256"
    # CLI migrates Core forward once, idempotent. The domain ledger is unchanged.
    "$helper" compose run --rm --no-deps -T control-api node dist/cli/migrate.js > "$state/migration.log"
    "$helper" compose run --rm --no-deps -T -e EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID=ws_06G19F61YB8CFR7TEWMS7HQ660 control-api \
      node dist/cli/execution-store.js grant-review claude-preview > "$state/grant.json"
    node - "$marker" <<'NODE'
require('node:fs').writeFileSync(process.argv[2],'',{flag:'wx',mode:0o600});
NODE
    "$helper" compose up -d --pull never --no-build --no-deps --wait control-api
    "$helper" compose exec -T portal-web nginx -s reload
    "$helper" compose exec -T control-api node < "$root/scripts/research-udb/inventory.cjs" > "$state/after.json"
    node - "$state/before.json" "$state/after.json" <<'NODE'
const fs=require('fs'),assert=require('assert/strict');const [a,b]=process.argv.slice(2).map(p=>JSON.parse(fs.readFileSync(p)));
assert.deepEqual(a.custody,b.custody,'Core identity/Research custody changed');assert.equal(b.migrations.length,a.migrations.length+1);
console.log('UDB03 immutable owner/auth/grants/membership/Research unchanged; one additive Core migration');
NODE
    echo "UDB03 retained-only API applied: $state";;
  rollback)
    state="$(realpath -e "${2:?}")";[[ "$state" == "$state_root"/apply-* && -f "$state/rollback.json" ]] || exit 1
    previous="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).services["control-api"].image)' "$state/rollback.json")"
    "${DOCKER[@]}" image inspect "$previous" >/dev/null
    [[ -f "$marker" && ! -s "$marker" ]] || exit 1
    unlink "$marker"
    "$helper" compose -f "$state/rollback.json" up -d --pull never --no-build --no-deps --wait control-api
    "$helper" compose exec -T portal-web nginx -s reload
    echo 'UDB03 original reader/image restored; all data/identity and audit kept, scoped review grant inert outside retained profile';;
  *) echo 'Usage: retained-profile.sh apply | rollback <recorded-state-dir>' >&2;exit 2;;
esac
