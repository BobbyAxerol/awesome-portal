#!/usr/bin/env bash
# TEST_ONLY: two disposable independent PG clusters; no Portal runtime/volume.
set -euo pipefail
umask 077
[[ "$#" -le 1 ]] || exit 2
case "${1:-all}" in
  all) readonly tests=(test/restore-checkpoint-authority-pg.spec.ts test/restore-authority-upgrade-pg.spec.ts test/command-status-ack-census-pg.spec.ts) ;;
  census) readonly tests=(test/command-status-ack-census-pg.spec.ts) ;;
  authority) readonly tests=(test/restore-checkpoint-authority-pg.spec.ts) ;;
  upgrade) readonly tests=(test/restore-authority-upgrade-pg.spec.ts) ;;
  witness) readonly tests=(test/restore-checkpoint-witness-producer-pg.spec.ts) ;;
  ordinary) readonly tests=(test/ordinary-profile-restore-pg.spec.ts) ;;
  *) exit 2 ;;
esac
exec 9>/tmp/portal-heavy.lock
flock -n 9
readonly suffix=$(openssl rand -hex 4)
[[ "$suffix" =~ ^[a-f0-9]{8}$ ]] || exit 2
readonly net="elp2-ckpt-$suffix"
readonly source="elp2-ckpt-source-$suffix"
readonly authority="elp2-ckpt-authority-$suffix"
readonly witness="elp2-ckpt-witness-$suffix"
readonly node="elp2-ckpt-node-$suffix"
readonly db="portal_restore_checkpoint_$suffix"
readonly pg_image=postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6
readonly node_image=node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
readonly root="$(cd "$(dirname "$0")/.." && pwd -P)"
if docker info >/dev/null 2>&1; then d=(docker); else d=(sudo -n docker); fi
for name in "$source" "$authority" "$witness" "$node"; do ! "${d[@]}" container inspect "$name" >/dev/null 2>&1 || exit 2; done
! "${d[@]}" network inspect "$net" >/dev/null 2>&1 || exit 2
cleanup() {
  "${d[@]}" rm -f "$node" "$source" "$authority" "$witness" >/dev/null 2>&1 || true
  "${d[@]}" network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT
"${d[@]}" network create --internal "$net" >/dev/null
clusters=("$source" "$authority")
pg_cpu=0.4; pg_memory=320m; node_cpu=1.2; node_memory=896m; witness_env=()
if [[ "${1:-all}" == witness ]]; then
  clusters+=("$witness"); pg_cpu=0.3; pg_memory=256m; node_cpu=1.1; node_memory=768m
  witness_env=(-e "TEST_WITNESS_DATABASE_URL=postgres://portal:portal@$witness:5432/$db")
fi
for name in "${clusters[@]}"; do
  "${d[@]}" run -d --rm --name "$name" --network "$net" --read-only --cpus "$pg_cpu" --memory "$pg_memory" --pids-limit 128 \
    --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=512m \
    --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m --tmpfs /tmp:rw,exec,mode=1777,size=64m \
    -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB="$db" "$pg_image" -c max_prepared_transactions=10 >/dev/null
done
for name in "${clusters[@]}"; do
  ready=false
  for _ in $(seq 1 30); do
    if "${d[@]}" exec "$name" psql -U portal -d "$db" -Atqc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
    sleep 1
  done
  [[ "$ready" == true ]] || exit 1
done
run_node() {
"${d[@]}" run --rm --name "$node" --network "$net" --read-only --cpus "$node_cpu" --memory "$node_memory" --pids-limit 256 \
  -v "$root/apps/control-api:/cell/work:ro" \
  --tmpfs /cell/work/node_modules/.vite-temp:rw,exec,mode=1777,size=32m \
  --tmpfs /tmp:rw,exec,mode=1777,size=64m -w /cell/work -e HOME=/tmp \
  -e TEST_DATABASE_URL="postgres://portal:portal@$source:5432/$db" \
  -e TEST_AUTHORITY_DATABASE_URL="postgres://portal:portal@$authority:5432/$db" \
  -e TEST_ORDINARY_RESTORED_DATABASE_URL="postgres://portal:portal@$source:5432/${db}_copy" \
  -e PORTAL_TEST_ORDINARY_RESTORE_PHASE="${1:-}" \
  "${witness_env[@]}" \
  -e PORTAL_TEST_RESTORE_CHECKPOINT=TEST_ONLY_DISPOSABLE_TWO_CLUSTERS \
  "$node_image" npm test -- "${tests[@]}"
}
if [[ "${1:-all}" == ordinary ]]; then
  # All names are generated and validated above, all bytes remain inside the
  # owned disposable cluster. Preserve the source/dump/history; no live DB is
  # contacted. Restoring back to the ORIGINAL physical DB name demonstrates
  # the stale-revoke risk rather than relying on a name-mismatch refusal.
  run_node SEED
  "${d[@]}" exec "$source" pg_dump -U portal -d "$db" -Fc -f /tmp/ordinary.dump
  "${d[@]}" exec "$source" createdb -U portal "${db}_copy"
  "${d[@]}" exec "$source" pg_restore -U portal --exit-on-error -d "${db}_copy" /tmp/ordinary.dump
  run_node CHECK_COPY
  run_node POST_SNAPSHOT
  "${d[@]}" exec "$source" psql -U portal -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE $db RENAME TO ${db}_history"
  "${d[@]}" exec "$source" psql -U portal -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE ${db}_copy RENAME TO $db"
  run_node VERIFY_STALE
else
  run_node
fi
