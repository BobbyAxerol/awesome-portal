#!/usr/bin/env bash
# Portal web visual baseline gate (v1.1 visual baseline slice).
#
# Screenshots 4 breakpoints x (Research Light / Operations Dark / Print) plus the
# Research screens against the completed-run fixture
# (registry/fixtures/runs/visual-baseline-run) and fails on any baseline drift.
#
# The gate property comes from the COMMAND, not the mount: `e2e:visual` runs
# `playwright test` without `--update-snapshots`, so it can only compare. The
# repo is mounted read-write because Playwright has to write `test-results/`
# (traces on failure) and because `npm ci` needs a writable node_modules — a
# read-only mount made this script unable to run at all. Snapshots are rewritten
# only by an explicit `--update`.
#
# Usage:
#   scripts/portal-web-visual.sh            # verify against committed snapshots
#   scripts/portal-web-visual.sh --update   # re-record snapshots
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="${ROOT_DIR}/apps/portal/frontend"
IMAGE="mcr.microsoft.com/playwright:v1.62.1-noble"
NPM_SCRIPT="e2e:visual"

if [[ "${1:-}" == "--update" ]]; then
  NPM_SCRIPT="e2e:update"
  shift
fi

if [ ! -f "${PROJECT_DIR}/playwright.config.ts" ]; then
  printf 'Visual baseline not implemented yet (no playwright.config.ts) — skipping.\n'
  exit 0
fi

command -v docker >/dev/null 2>&1 || { printf 'Docker CLI is required.\n' >&2; exit 1; }
docker info >/dev/null 2>&1 || { printf 'Cannot access the Docker daemon.\n' >&2; exit 1; }

# Rendering is font- and GPU-sensitive, so the pinned image is part of the
# contract: a baseline recorded in a different image is not comparable.
docker run --rm \
  -u "${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}" \
  -v "${ROOT_DIR}:/repo" \
  -w /repo/apps/portal/frontend \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/.npm \
  -e VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY=true \
  "${IMAGE}" \
  sh -lc "
    set -e
    if [ ! -d node_modules ]; then
      npm ci --no-audit --no-fund
    fi
    npm run ${NPM_SCRIPT} -- ${*:-}
  "

printf 'Portal web visual baseline passed.\n'
