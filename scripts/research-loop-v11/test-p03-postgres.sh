#!/usr/bin/env bash
set -euo pipefail

# P03's database proof is deliberately disposable and isolated from every
# compose/runtime database.  It uses a pinned image, tmpfs-only storage and an
# exact-name trap; it never removes volumes, images or unrelated containers.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
suffix="${P03_TEST_RUN_SUFFIX:-$$}"
container="research-p03-postgres-${suffix}"
image="postgres:16-alpine@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6"
restore_dump=""

command -v docker >/dev/null || { echo "P03 requires Docker for its disposable PostgreSQL." >&2; exit 1; }
DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
  else
    echo "P03 cannot access Docker directly or via passwordless sudo." >&2
    exit 1
  fi
fi

cleanup() {
  [[ -z "$restore_dump" ]] || rm -f -- "$restore_dump"
  "${DOCKER[@]}" rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT

"${DOCKER[@]}" run -d --rm --name "$container" \
  --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=1024m \
  --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m \
  --tmpfs /tmp:rw,exec,mode=1777,size=64m \
  -e POSTGRES_USER=portal \
  -e POSTGRES_PASSWORD=portal \
  -e POSTGRES_DB=portal_control_test \
  -p 127.0.0.1::5432 \
  "$image" >/dev/null

ready=false
for _ in $(seq 1 30); do
  if "${DOCKER[@]}" exec "$container" pg_isready -U portal -d portal_control_test >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || { "${DOCKER[@]}" logs "$container" >&2; exit 1; }

port="$("${DOCKER[@]}" port "$container" 5432/tcp | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n 1)"
[[ "$port" =~ ^[0-9]+$ ]] || { echo "P03 could not determine disposable PostgreSQL port." >&2; exit 1; }

cd "$root/apps/control-api"
TEST_DATABASE_URL="postgres://portal:portal@127.0.0.1:${port}/portal_control_test" \
  ./node_modules/.bin/vitest run \
    --config ../../scripts/research-loop-v11/vitest.p03.config.mts \
    ../../scripts/research-loop-v11/p03-schema.spec.ts

# T01 also needs an isolated restore proof, not merely an upgrade.  The
# temporary archive is exact-path scoped, the restore target lives only in the
# disposable PostgreSQL container, and both are removed before EXIT.
restore_dump="$(mktemp /tmp/research-p03-restore.XXXXXX)"
restore_db="portal_control_p03_restore_${suffix}"
restore_basename="$(basename "$restore_dump")"
"${DOCKER[@]}" exec "$container" pg_dump -U portal -d portal_control_test --format=custom > "$restore_dump"
"${DOCKER[@]}" exec "$container" createdb -U portal "$restore_db"
"${DOCKER[@]}" exec -i "$container" sh -c "cat > /tmp/${restore_basename}" < "$restore_dump"
"${DOCKER[@]}" exec "$container" pg_restore -U portal -d "$restore_db" "/tmp/${restore_basename}" >/dev/null
restored_relation="$("${DOCKER[@]}" exec "$container" psql -U portal -d "$restore_db" -Atqc "SELECT to_regclass('research.attempts')")"
[[ "$restored_relation" == "research.attempts" ]] || { echo "P03 restore proof did not restore research.attempts" >&2; exit 1; }
"${DOCKER[@]}" exec "$container" dropdb -U portal "$restore_db"
echo "P03 isolated restore proof: PASS"
