#!/usr/bin/env bash
# Portal web visual baseline (U02 exit gate).
#
# Mirrors scripts/contracts-test.sh: the host needs no Node and no browser, the
# suite runs in the pinned Playwright image so screenshots are byte-comparable
# between machines. Rendering is font- and GPU-sensitive, so a baseline taken
# in a different image is not a baseline.
#
# Usage:
#   scripts/portal-web-visual.sh            # verify against committed snapshots
#   scripts/portal-web-visual.sh --update   # re-record snapshots
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="mcr.microsoft.com/playwright:v1.62.1-noble"
SCRIPT="e2e"

if [[ "${1:-}" == "--update" ]]; then
  SCRIPT="e2e:update"
  shift
fi

command -v docker >/dev/null 2>&1 || { printf 'Docker CLI is required.\n' >&2; exit 1; }
docker info >/dev/null 2>&1 || { printf 'Cannot access the Docker daemon.\n' >&2; exit 1; }

docker run --rm \
  -u "${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}" \
  -v "${ROOT_DIR}:/repo" \
  -w /repo/apps/portal/frontend \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/.npm \
  -e VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY=true \
  "${IMAGE}" \
  sh -lc "npm run ${SCRIPT} -- ${*:-}"

printf 'Portal web visual baseline passed.\n'
