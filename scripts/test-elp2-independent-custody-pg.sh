#!/usr/bin/env bash
# TEST_ONLY: fresh disposable two-cluster PostgreSQL; no runtime/volume.
set -euo pipefail
umask 077
[[ "$#" == 0 ]] || exit 2
exec 9>/tmp/portal-heavy.lock
flock -n 9
readonly suffix=$(openssl rand -hex 4)
[[ "$suffix" =~ ^[a-f0-9]{8}$ ]] || exit 2
readonly net="elp2-custody-$suffix" source="elp2-custody-source-$suffix" authority="elp2-custody-authority-$suffix" node="elp2-custody-node-$suffix"
readonly db="portal_restore_checkpoint_$suffix"
readonly pg_image=postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6
readonly node_image=node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
readonly root="$(cd "$(dirname "$0")/.." && pwd -P)"
if docker info >/dev/null 2>&1; then d=(docker); else d=(sudo -n docker); fi
for name in "$source" "$authority" "$node"; do ! "${d[@]}" container inspect "$name" >/dev/null 2>&1 || exit 2; done
! "${d[@]}" network inspect "$net" >/dev/null 2>&1 || exit 2
cleanup() {
  "${d[@]}" rm -f "$node" "$source" "$authority" >/dev/null 2>&1 || true
  "${d[@]}" network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT
"${d[@]}" network create --internal "$net" >/dev/null
for name in "$source" "$authority"; do
  "${d[@]}" run -d --rm --name "$name" --network "$net" --read-only --cpus 0.4 --memory 320m --pids-limit 128 \
    --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=256m \
    --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m --tmpfs /tmp:rw,exec,mode=1777,size=64m \
    -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB="$db" "$pg_image" >/dev/null
done
for name in "$source" "$authority"; do
  ready=false
  for _ in $(seq 1 30); do
    if "${d[@]}" exec "$name" psql -U portal -d "$db" -Atqc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
    sleep 1
  done
  [[ "$ready" == true ]] || exit 1
done
"${d[@]}" run --rm --name "$node" --network "$net" --read-only --cpus 1.2 --memory 896m --pids-limit 256 \
  -v "$root/apps/control-api:/cell/work:ro" --tmpfs /cell/work/node_modules/.vite-temp:rw,exec,mode=1777,size=32m \
  --tmpfs /tmp:rw,exec,mode=1777,size=64m -w /cell/work -e HOME=/tmp \
  -e TEST_DATABASE_URL="postgres://portal:portal@$source:5432/$db" \
  -e TEST_AUTHORITY_DATABASE_URL="postgres://portal:portal@$authority:5432/$db" \
  -e PORTAL_TEST_RESTORE_CHECKPOINT=TEST_ONLY_DISPOSABLE_TWO_CLUSTERS \
  "$node_image" npm test -- test/restore-independent-custody-candidate-pg.spec.ts
