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

# Rootless Docker maps container UID 0 to the unprivileged runner account. A
# literal host UID/GID is translated through the subordinate-ID range instead,
# which can make the bind-mounted checkout unreadable inside the container.
# Retain normal ownership on rootful developer Docker, but use namespace root
# for the isolated rootless CI daemon. This never grants host-root access.
CONTAINER_USER="${HOST_UID:-$(id -u)}:${HOST_GID:-$(id -g)}"
if docker info --format '{{json .SecurityOptions}}' | grep -Fq 'name=rootless'; then
  CONTAINER_USER='0:0'
fi

# Rendering is font- and GPU-sensitive, so the pinned image is part of the
# contract: a baseline recorded in a different image is not comparable.
docker run --rm \
  -u "${CONTAINER_USER}" \
  -v "${ROOT_DIR}:/repo" \
  -w /repo/apps/portal/frontend \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/.npm \
  -e VITE_ROADMAP_TASK_BOARD_LOCAL_ONLY=true \
  "${IMAGE}" \
  sh -lc "
    set -e
    npm_ci_with_network_retry() {
      package_dir=\"\$1\"
      attempt=1
      max_attempts=3
      while true; do
        if npm ci --prefix \"\${package_dir}\" --no-audit --no-fund; then
          return 0
        fi
        if [ \"\${attempt}\" -ge \"\${max_attempts}\" ]; then
          printf 'npm ci failed after %s attempts in %s\\n' \
            \"\${attempt}\" \"\${package_dir}\" >&2
          return 1
        fi
        delay_seconds=\$((attempt * 5))
        printf 'Transient npm install failure in %s; retrying in %ss (%s/%s)\\n' \
          \"\${package_dir}\" \"\${delay_seconds}\" \"\${attempt}\" \"\${max_attempts}\" >&2
        sleep \"\${delay_seconds}\"
        attempt=\$((attempt + 1))
      done
    }

    # GitHub-hosted runners occasionally reset an npm registry download.  Retry
    # only dependency acquisition, in a bounded way; test and snapshot failures
    # still fail immediately and can never be masked by this helper.
    export npm_config_fetch_retries=5
    export npm_config_fetch_retry_mintimeout=2000
    export npm_config_fetch_retry_maxtimeout=10000
    # Portal compiles the embedded Planning source in-place. In a clean
    # checkout TypeScript resolves that source's React/Mermaid imports from
    # Planning's own node_modules, so both package graphs must exist before
    # Playwright starts its production-build web server.
    if [ ! -d /repo/features/roadmap-task-board/frontend/node_modules ]; then
      npm_ci_with_network_retry /repo/features/roadmap-task-board/frontend
    fi
    if [ ! -d node_modules ]; then
      npm_ci_with_network_retry .
    fi
    npm run ${NPM_SCRIPT} -- ${*:-}
  "

printf 'Portal web visual baseline passed.\n'
