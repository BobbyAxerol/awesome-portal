#!/usr/bin/env bash
set -euo pipefail
task_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
task_container="research-wex-postgres-${$}"
task_image="postgres:16-alpine@sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6"
DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then DOCKER=(sudo -n docker); fi
cleanup(){ "${DOCKER[@]}" rm -f "$task_container" >/dev/null 2>&1 || true; }
trap cleanup EXIT
"${DOCKER[@]}" run -d --rm --name "$task_container" --tmpfs /var/lib/postgresql/data:rw,exec,mode=0700,size=1024m \
  -e POSTGRES_USER=portal -e POSTGRES_PASSWORD=portal -e POSTGRES_DB=portal_control_test -p 127.0.0.1::5432 "$task_image" >/dev/null
for _ in $(seq 1 30); do if "${DOCKER[@]}" exec "$task_container" pg_isready -U portal -d portal_control_test >/dev/null 2>&1; then break; fi; sleep 1; done
task_port="$("${DOCKER[@]}" port "$task_container" 5432/tcp | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -n 1)"
[[ "$task_port" =~ ^[0-9]+$ ]]
cd "$task_root/apps/control-api"
TEST_DATABASE_URL="postgres://portal:portal@127.0.0.1:${task_port}/portal_control_test" \
  ./node_modules/.bin/vitest run --config ../../scripts/research-loop-v11/vitest.window-execution.config.mts
