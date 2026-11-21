#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
container="portal-udb02-test-$$"
DOCKER=(docker); if ! docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
trap '"${DOCKER[@]}" rm -f "$container" >/dev/null 2>&1 || true' EXIT
"${DOCKER[@]}" run -d --rm --name "$container" --label portal.phase=UDB-02 \
  --memory=900000000 --memory-swap=900000000 --cpus=2 --pids-limit=128 \
  --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=512m --shm-size=64m \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control_test \
  -p 127.0.0.1::5432 postgres:16.15-alpine@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685 >/dev/null
for _ in $(seq 1 30); do
  if "${DOCKER[@]}" exec "$container" pg_isready -U portal >/dev/null 2>&1;then break;fi;sleep 1
done
port="$("${DOCKER[@]}" port "$container" 5432/tcp|sed -n 's/.*:\([0-9][0-9]*\)$/\1/p')"
cd "$root/apps/control-api"
TEST_DATABASE_URL="postgres://portal:portal@127.0.0.1:$port/portal_control_test" \
  ./node_modules/.bin/vitest run test/udb-execution-store.spec.ts test/local-read-authority.spec.ts \
  test/command-center.spec.ts test/health.spec.ts test/manager-lists.spec.ts
