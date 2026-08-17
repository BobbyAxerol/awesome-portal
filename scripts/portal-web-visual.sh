#!/usr/bin/env bash
# Portal web visual baseline gate (v1.1 visual baseline slice).
#
# Screenshots 4 breakpoints x (Research Light / Operations Dark / Print)
# against the completed-run fixture (registry/fixtures/runs/visual-baseline-run)
# and fails on any baseline drift. The Playwright project itself is owned by
# the frontend slice; until it lands, this gate reports a clear skip so the
# contracts/control-api gates are not blocked by an unimplemented baseline.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="${ROOT_DIR}/apps/portal/frontend"

if [ ! -f "${PROJECT_DIR}/playwright.config.ts" ]; then
  printf 'Visual baseline not implemented yet (no playwright.config.ts) — skipping.\n'
  exit 0
fi

command -v docker >/dev/null 2>&1 || { printf 'Docker CLI is required.\n' >&2; exit 1; }
docker info >/dev/null 2>&1 || { printf 'Cannot access the Docker daemon.\n' >&2; exit 1; }

docker run --rm \
  -v "${ROOT_DIR}:/repo:ro" \
  -w /repo/apps/portal/frontend \
  mcr.microsoft.com/playwright:v1.62.1-noble \
  sh -c '
    set -e
    if [ ! -d node_modules ]; then
      npm ci --no-audit --no-fund
    fi
    npm run e2e:visual
  '
printf 'Portal web visual baseline passed.\n'
