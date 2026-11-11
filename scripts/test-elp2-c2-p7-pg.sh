#!/usr/bin/env bash
# TEST_ONLY: isolated PostgreSQL, synthetic identities and synthetic source verifier.
set -euo pipefail
umask 077
[[ "$#" -le 1 ]] || exit 2
case "${1:-acceptance}" in
  acceptance) readonly test_file=test/c2-p7-acceptance-pg.spec.ts ;;
  owner-intent) readonly test_file=test/c2-p7-owner-intent-candidate-pg.spec.ts ;;
  record-link-upgrade) readonly test_file=test/c2-p7-record-link-upgrade-pg.spec.ts ;;
  schema-observation) readonly test_file=test/c2-p7-schema-observation-pg.spec.ts ;;
  *) exit 2 ;;
esac
exec 9>/tmp/portal-heavy.lock
flock -n 9
readonly suffix=$(openssl rand -hex 4)
[[ "$suffix" =~ ^[a-f0-9]{8}$ ]] || exit 2
readonly net="elp2-c2-p7-$suffix"
readonly pg="elp2-c2-p7-pg-$suffix"
readonly authority="elp2-c2-p7-authority-$suffix"
readonly node="elp2-c2-p7-node-$suffix"
readonly db="portal_c2_p7_$suffix"
readonly pg_image=postgres@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6
readonly node_image=node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
readonly root="$(cd "$(dirname "$0")/.." && pwd -P)"
readonly b1=/home/bobby/secure/edge-ts-c2-pm-authority-b1-r1/c2-publication-input.json
readonly expected=409542f42012120f994f32600c7632ca3a13cfce8210c685218956a753de31fd
[[ -f "$b1" && "$(sha256sum "$b1" | cut -d' ' -f1)" == "$expected" ]] || exit 2
if docker info >/dev/null 2>&1; then d=(docker); else d=(sudo -n docker); fi
for name in "$pg" "$authority" "$node"; do ! "${d[@]}" container inspect "$name" >/dev/null 2>&1 || exit 2; done
! "${d[@]}" network inspect "$net" >/dev/null 2>&1 || exit 2
cleanup() {
  "${d[@]}" rm -f "$node" "$pg" "$authority" >/dev/null 2>&1 || true
  "${d[@]}" network rm "$net" >/dev/null 2>&1 || true
}
trap cleanup EXIT
"${d[@]}" network create --internal "$net" >/dev/null
"${d[@]}" run -d --rm --name "$pg" --network "$net" --read-only --cpus 0.5 --memory 384m --pids-limit 128 \
  --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=512m \
  --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m --tmpfs /tmp:rw,exec,mode=1777,size=64m \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB="$db" "$pg_image" >/dev/null
ready=false
for _ in $(seq 1 30); do
  if "${d[@]}" exec "$pg" psql -U portal -d "$db" -Atqc 'SELECT 1' >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || exit 1
node_cpu=1.5
node_memory=1152m
authority_env=()
if [[ "${1:-acceptance}" == owner-intent ]]; then
  # Two independent clusters; aggregate <= 2 CPU / 1.5 GiB.
  node_cpu=1.1
  node_memory=832m
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
  -v "$root/apps/control-api:/cell/work:ro" -v "$b1:/cell/b1.json:ro" \
  --tmpfs /cell/work/node_modules/.vite-temp:rw,exec,mode=1777,size=32m \
  --tmpfs /tmp:rw,exec,mode=1777,size=64m -w /cell/work -e HOME=/tmp \
  -e TEST_DATABASE_URL="postgres://portal:portal@$pg:5432/$db" \
  "${authority_env[@]}" \
  -e C2_P7_TEST_DISPOSABLE=TEST_ONLY_C2_P7_DEDICATED_DATABASE \
  -e C2_B1_PREFLIGHT_TEST_FILE=/cell/b1.json -e C2_B1_PREFLIGHT_TEST_SHA256="$expected" \
  "$node_image" npm test -- "$test_file"
