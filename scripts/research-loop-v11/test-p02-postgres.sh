#!/usr/bin/env bash
set -euo pipefail

# A focused, disposable PostgreSQL cell for P02's unchanged-consumer spike.
# It is deliberately separate from compose/runtime PostgreSQL and self-cleans.
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
suffix="${P02_TEST_RUN_SUFFIX:-$$}"
container="research-p02-postgres-${suffix}"
image="postgres:16-alpine@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6"

command -v docker >/dev/null || { echo "P02 requires Docker for its disposable test PostgreSQL." >&2; exit 1; }
DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
  else
    echo "P02 cannot access Docker directly or via passwordless sudo." >&2
    exit 1
  fi
fi
cleanup() { "${DOCKER[@]}" rm -f "$container" >/dev/null 2>&1 || true; }
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
[[ "$port" =~ ^[0-9]+$ ]] || { echo "P02 could not determine disposable PostgreSQL port." >&2; exit 1; }

cd "$root/apps/control-api"
targets=(scripts/research-loop-v11/p02-compatibility.spec.ts)
if [[ "${P02_CURRENT_SOURCE_REGRESSION:-false}" == "true" ]]; then
  # The same isolated cell can also run the three source suites whose current
  # semantics P02 relies on.  This remains bounded: no compose/runtime DB,
  # no network listener, and the container is removed by the EXIT trap.
  targets=()
fi
TEST_DATABASE_URL="postgres://portal:portal@127.0.0.1:${port}/portal_control_test" \
  ./node_modules/.bin/vitest run \
    --config ../../scripts/research-loop-v11/vitest.p02.config.mts \
    "${targets[@]}"
