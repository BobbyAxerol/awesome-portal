#!/usr/bin/env bash
# TEST_ONLY: actual RLS negative or C2 revoke retake on fresh bounded PostgreSQL.
set -euo pipefail
umask 077
case "${1:-rls}" in
  rls) test_args=(test/restore-inventory-rls-pg.spec.ts) ;;
  legacy-dr-guard) test_args=(test/legacy-dr-guard-pg.spec.ts) ;;
  c2-revoke) test_args=(test/elp210-current-human-candidate.spec.ts -t 'blocks fresh entry during revocation|advances the conservative global revision') ;;
  restore-core) test_args=(test/elp210-current-human-candidate.spec.ts -t 'restore quiescence reconciles the same entered original') ;;
  restore-original) test_args=(test/restore-core-quiescence-pg.spec.ts test/restore-c2-original-recovery.spec.ts) ;;
  restore-fence) test_args=(test/restore-local-generation-fence-pg.spec.ts) ;;
  restore-writer-quarantine) test_args=(test/restore-local-writer-quarantine-pg.spec.ts) ;;
  restore-database-quarantine) test_args=(test/restore-local-database-quarantine-pg.spec.ts) ;;
  restore-c2-fence) test_args=(test/restore-local-generation-c2-extension-pg.spec.ts) ;;
  restore-delivery-fence) test_args=(test/restore-local-generation-delivery-extension-pg.spec.ts) ;;
  restore-session-quarantine) test_args=(test/restore-quarantine-sessions-pg.spec.ts) ;;
  c2-owner) test_args=(test/c2-owner-issuer-pg.spec.ts) ;;
  c2-revalidate-lock) test_args=(test/c2-owner-issuer-pg.spec.ts -t 'holds the owner session lock during C2 issue revalidation') ;;
  c2-issuer-upgrade) test_args=(test/c2-owner-issuer-pg.spec.ts -t 'upgrades a disposable legacy candidate') ;;
  c2-drain-delivery) test_args=(test/c2-owner-issuer-pg.spec.ts -t 'does not clear a drain while a retired C2 lease retains an uncertain delivery|requires delivery schema for a pinned C2 deployment') ;;
  c2-emergency) test_args=(test/c2-p7-emergency-reduction-candidate-pg.spec.ts) ;;
  c2-delivery) test_args=(test/c2-delivery-obligation-pg.spec.ts) ;;
  c2-delivery-procedure) test_args=(test/c2-delivery-procedure-pg.spec.ts) ;;
  c2-unentered-unknown) test_args=(test/c2-unentered-unknown-pg.spec.ts) ;;
  c2-trust-reuse) test_args=(test/elp210-current-human-candidate.spec.ts -t 'proves original .* custody before a distinct financial read|durably fences concurrent and restarted STATUS issues') ;;
  status-context) test_args=(test/elp210-current-human-candidate.spec.ts -t 'commits the original context/lease link atomically') ;;
  c2-regression) test_args=(test/elp210-current-human-candidate.spec.ts -t 'blocks fresh entry during revocation|advances the conservative global revision|restore quiescence reconciles the same entered original|genuine signed source rollback before ENTER|never accepts .* as an unentered rollback') ;;
  status-recovery) test_args=(test/command-source-assertion-pg.spec.ts -t 'rejoins the winning context after two authorities prepare|recovers a persisted pre-lease context in a new OS process|keeps UNKNOWN on the same PG attempt') ;;
  *) exit 2 ;;
esac
[[ "$#" -le 1 ]] || exit 2
exec 9>/tmp/portal-heavy.lock
flock -n 9
readonly suffix=$(openssl rand -hex 4)
[[ "$suffix" =~ ^[a-f0-9]{8}$ ]] || exit 2
readonly net="elp2-restore-rls-$suffix"
readonly pg="control-api-test-postgres-$suffix"
readonly authority="control-api-test-authority-$suffix"
readonly node="elp2-restore-rls-node-$suffix"
if [[ "${1:-rls}" == status-recovery ]]; then
  # The application integration suite independently enforces this exact
  # disposable database name and the randomized test-server hostname.
  readonly db=portal_control_test
else
  readonly db="portal_restore_rls_$suffix"
fi
readonly pg_image=postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6
readonly node_image=node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
readonly root="$(cd "$(dirname "$0")/.." && pwd -P)"
pg_memory=384m
node_cpu=1.5
node_memory=1152m
if [[ "${1:-rls}" == c2-owner ]]; then
  # Two-cluster cell remains within the approved aggregate 2 CPU / 1.5 GiB cap.
  pg_memory=320m
  node_cpu=1.1
  node_memory=896m
fi
if docker info >/dev/null 2>&1; then d=(docker); else d=(sudo -n docker); fi
! "${d[@]}" container inspect "$pg" >/dev/null 2>&1 || exit 2
! "${d[@]}" container inspect "$node" >/dev/null 2>&1 || exit 2
! "${d[@]}" container inspect "$authority" >/dev/null 2>&1 || exit 2
! "${d[@]}" network inspect "$net" >/dev/null 2>&1 || exit 2
cleanup() {
  "${d[@]}" rm -f "$node" "$pg" "$authority" >/dev/null 2>&1 || true
  "${d[@]}" network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT
pg_server_args=()
if [[ "${1:-rls}" == restore-writer-quarantine || "${1:-rls}" == restore-database-quarantine ]]; then
  # Dedicated cell only: exercise real two-phase transactions; never alter a
  # shared PostgreSQL server or retain prepared test transactions.
  pg_server_args=(-c max_prepared_transactions=10)
fi
"${d[@]}" network create --internal "$net" >/dev/null
"${d[@]}" run -d --rm --name "$pg" --network "$net" --read-only --cpus 0.5 --memory "$pg_memory" --pids-limit 256 \
  --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=1024m \
  --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m --tmpfs /tmp:rw,exec,mode=1777,size=128m \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB="$db" "$pg_image" "${pg_server_args[@]}" >/dev/null
ready=false
for _ in $(seq 1 30); do
  if "${d[@]}" exec "$pg" psql -U portal -d "$db" -Atqc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || exit 1
authority_env=()
if [[ "${1:-rls}" == c2-owner ]]; then
  "${d[@]}" run -d --rm --name "$authority" --network "$net" --read-only --cpus 0.4 --memory 320m --pids-limit 128 \
    --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=256m \
    --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m --tmpfs /tmp:rw,exec,mode=1777,size=64m \
    -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB="$db" "$pg_image" >/dev/null
  ready=false
  for _ in $(seq 1 30); do
    if "${d[@]}" exec "$authority" psql -U portal -d "$db" -Atqc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
    sleep 1
  done
  [[ "$ready" == true ]] || exit 1
  authority_env=(-e "TEST_AUTHORITY_DATABASE_URL=postgres://portal:portal@$authority:5432/$db")
fi
"${d[@]}" run --rm --name "$node" --network "$net" --read-only --cpus "$node_cpu" --memory "$node_memory" --pids-limit 256 \
  -v "$root/apps/control-api:/cell/work:ro" \
  -v "$root/scripts/research-udb:/cell/research-udb:ro" \
  -v "$root/packages/contracts:/contracts:ro" \
  -v "$root/services/portal-execution-edge-rs/contracts/maximum-data-return-v1:/services/portal-execution-edge-rs/contracts/maximum-data-return-v1:ro" \
  --tmpfs /cell/work/node_modules/.vite-temp:rw,exec,mode=1777,size=32m \
  --tmpfs /tmp:rw,exec,mode=1777,size=128m -w /cell/work -e HOME=/tmp \
  -e PORTAL_CONTRACTS_DIR=/contracts \
  -e TEST_DATABASE_URL="postgres://portal:portal@$pg:5432/$db" \
  "${authority_env[@]}" \
  -e PORTAL_TEST_RESTORE_RLS=TEST_ONLY_DISPOSABLE_RLS \
  -e C2_EMERGENCY_TEST_DISPOSABLE=TEST_ONLY_C2_EMERGENCY_DEDICATED_CLUSTER \
  "$node_image" npm test -- "${test_args[@]}"
