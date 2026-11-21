#!/usr/bin/env bash
set -euo pipefail

# P09 uses one disposable tmpfs PostgreSQL cell. Its cleanup addresses exactly
# the named test container and never prunes Portal images, volumes, sources or
# any shared runtime resource.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
suffix="${P09_TEST_RUN_SUFFIX:-$$}"
container="research-p09-postgres-${suffix}"
image="postgres:16-alpine@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6"

command -v docker >/dev/null || { echo "P09 requires Docker for its disposable PostgreSQL proof." >&2; exit 1; }
DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null && sudo -n docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); else
    echo "P09 cannot access Docker directly or via passwordless sudo." >&2; exit 1
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
for _ in $(seq 1 30); do "${DOCKER[@]}" exec "$container" pg_isready -U portal -d portal_control_test >/dev/null 2>&1 && break; sleep 1; done
port="$("${DOCKER[@]}" port "$container" 5432/tcp | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n 1)"
[[ "$port" =~ ^[0-9]+$ ]] || { echo "P09 could not determine disposable PostgreSQL port." >&2; exit 1; }
cd "$root/apps/control-api"
TEST_DATABASE_URL="postgres://portal:portal@127.0.0.1:${port}/portal_control_test" \
  ./node_modules/.bin/vitest run --config ../../scripts/research-loop-v11/vitest.p09.config.mts \
  ../../scripts/research-loop-v11/p09-foundation.spec.ts
echo "P09 isolated PostgreSQL foundation proof: PASS"
