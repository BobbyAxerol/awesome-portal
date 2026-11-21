#!/usr/bin/env bash
set -euo pipefail

# P07 uses one disposable tmpfs PostgreSQL cell.  Its trap removes exactly
# that named container; it never prunes Portal/Execution images, volumes,
# networks, source bytes or persistent database evidence.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
suffix="${P07_TEST_RUN_SUFFIX:-$$}"
container="research-p07-postgres-${suffix}"
image="postgres:16-alpine@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6"

command -v docker >/dev/null || { echo "P07 requires Docker for its disposable PostgreSQL proof." >&2; exit 1; }
DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null && sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
  else
    echo "P07 cannot access Docker directly or via passwordless sudo." >&2
    exit 1
  fi
fi

cleanup() { "${DOCKER[@]}" rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${DOCKER[@]}" run -d --rm --name "$container" \
  --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=1024m \
  --tmpfs /run/postgresql:rw,exec,mode=1777,size=16m \
  --tmpfs /tmp:rw,exec,mode=1777,size=64m \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control_test \
  -p 127.0.0.1::5432 "$image" >/dev/null

ready=false
for _ in $(seq 1 30); do
  if "${DOCKER[@]}" exec "$container" pg_isready -U portal -d portal_control_test >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]] || { "${DOCKER[@]}" logs "$container" >&2; exit 1; }
port="$("${DOCKER[@]}" port "$container" 5432/tcp | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n 1)"
[[ "$port" =~ ^[0-9]+$ ]] || { echo "P07 could not determine disposable PostgreSQL port." >&2; exit 1; }

cd "$root/apps/control-api"
TEST_DATABASE_URL="postgres://portal:portal@127.0.0.1:${port}/portal_control_test" \
  ./node_modules/.bin/vitest run --config ../../scripts/research-loop-v11/vitest.p07.config.mts \
  ../../scripts/research-loop-v11/p07-alpha-import.spec.ts

echo "P07 isolated PostgreSQL Alpha import proof: PASS"
