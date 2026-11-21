#!/usr/bin/env bash
set -euo pipefail

# Backend-only phase gate: compile Control API then exercise the bounded,
# self-cleaning PostgreSQL cell.  No frontend build, Compose stack or release
# image is needed for a schema/authorization foundation phase.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
apps/control-api/node_modules/.bin/tsc --noEmit -p apps/control-api/tsconfig.build.json
scripts/research-loop-v11/test-p03-postgres.sh
