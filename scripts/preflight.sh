#!/usr/bin/env bash
# Run what CI runs, before pushing.
#
# Every command below is copied from .github/workflows/ci.yml. The only steps
# left out are the three that cannot mean anything off the runner:
# "Bind disposable job temporary directory", "Assert isolated CI runner
# boundary" and "Protect append-only migration history" (it diffs against the
# PR base SHA).
#
# Order is deliberate: the checks that have actually caught something run
# first, so a 40-minute cycle is not spent discovering a two-minute failure.
# Python first, because no other local gate runs it — verify-workspace invokes
# no pytest, and that is exactly how two CI failures reached main.
#
# Usage:  bash preflight.sh [group...]     groups: py fe heavy all   (default all)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PY_IMAGE=python:3.12.14-slim          # the version ci.yml pins
NODE_IMAGE=node:22-bookworm
UID_GID="$(id -u):$(id -g)"
LOG_DIR="${PREFLIGHT_LOG_DIR:-$(mktemp -d -t portal-preflight-XXXXXX)}"
mkdir -p "$LOG_DIR"

PASS=(); FAIL=(); SKIP=()

run() {                                # run <name> <command...>
  local name="$1"; shift
  local log="$LOG_DIR/${name// /_}.log"
  printf '  %-46s ' "$name"
  if "$@" >"$log" 2>&1; then
    printf 'ok\n'; PASS+=("$name")
  else
    printf 'FAIL   %s\n' "$log"; FAIL+=("$name")
  fi
}

dpy() {                                # python step, CI's pinned interpreter
  sudo docker run --rm -u "$UID_GID" -e HOME=/tmp -v "$ROOT":/repo -w /repo "$PY_IMAGE" bash -lc "$1"
}
dnode() {                              # node step, in <dir>
  sudo docker run --rm -u "$UID_GID" -e HOME=/tmp -v "$ROOT":/repo -w "/repo/$1" "$NODE_IMAGE" bash -lc "$2"
}

group_py() {
  echo "── Python backends (no local gate runs these; CI is the only other place)"
  run "Test Portal Research backend" dpy '
    python -m pip install --quiet --upgrade pip >/dev/null 2>&1
    python -m pip install --quiet --constraint constraints/portal.txt -e "./apps/portal/backend[dev]" >/dev/null 2>&1
    (cd apps/portal && sha256sum -c strategy/PROTECTED_SHA256) &&
    PYTHONPATH=apps/portal/backend/src:apps/portal python -m pytest -q -c apps/portal/backend/pyproject.toml apps/portal/backend/tests &&
    python -m compileall -q apps/portal/backend/src apps/portal/strategy'
  run "Test Roadmap & Task Board backend" dpy '
    python -m pip install --quiet -r features/roadmap-task-board/backend/requirements-dev.txt >/dev/null 2>&1
    PYTHONPATH=features/roadmap-task-board python -m pytest -q features/roadmap-task-board/backend/tests &&
    python -m compileall -q features/roadmap-task-board/backend'
}

group_fe() {
  echo "── Frontends (audit included: CI fails on a moderate advisory)"
  run "Test and build Portal Research frontend" dnode apps/portal/frontend '
    ls node_modules >/dev/null 2>&1 || npm ci --no-audit --no-fund >/dev/null 2>&1
    ls /repo/features/roadmap-task-board/frontend/node_modules >/dev/null 2>&1 ||
      npm ci --prefix /repo/features/roadmap-task-board/frontend --no-audit --no-fund >/dev/null 2>&1
    npm audit --package-lock-only --audit-level=moderate && npm test && npm run build'
  run "Test and build Roadmap & Task Board" dnode features/roadmap-task-board/frontend '
    ls node_modules >/dev/null 2>&1 || npm ci --no-audit --no-fund >/dev/null 2>&1
    npm audit --package-lock-only --audit-level=moderate && npm test && npm run build'
  run "Run Roadmap local-first browser flows" \
    sudo docker run --rm -u "$UID_GID" -e HOME=/tmp -v "$ROOT":/repo \
      -w /repo/features/roadmap-task-board/frontend mcr.microsoft.com/playwright:v1.62.1-noble \
      bash -lc 'ls node_modules >/dev/null 2>&1 || npm ci --no-audit --no-fund >/dev/null 2>&1; npm run e2e'
}

group_heavy() {
  echo "── Monorepo stack (long; serial because each mounts the repo)"
  run "Validate Portal contracts"        bash ./scripts/portal verify
  run "Lint GitHub Actions definitions"  sudo docker run --rm --user 0:0 -v "$ROOT:/repo:ro" -w /repo rhysd/actionlint:1.7.7
  run "Test shared contracts workspace"  sudo bash ./scripts/contracts-test.sh
  run "Test Control API"                 sudo bash ./scripts/control-api-test.sh
  for s in portal-release-authority-test portal-current-source-release-test \
           execution-n15a-gateway-test execution-n15b-current-gateway-test \
           execution-n16b-current-protective-test execution-n16a-emergency-routing-test \
           execution-n17a-production-dr-test execution-n17b-current-acceptance-test \
           execution-n18-census-test execution-n19-manager-compat-test \
           execution-n20-screen-bff-test execution-n21-shared-admission-test \
           execution-n22-full-paper-read-test execution-n23-sandbox-live-read-test \
           execution-n28-missing-capability-test execution-eds12-qualification-test \
           execution-edge-test; do
    [ -x "./scripts/$s.sh" ] && run "$s" sudo bash "./scripts/$s.sh" || SKIP+=("$s (absent)")
  done
  for p in test_self_hosted_deploy_runner test_self_hosted_ci_publish_runner \
           test_apply_production_execution_feature_profile; do
    [ -f "./scripts/$p.py" ] && run "$p" python3 "./scripts/$p.py" || SKIP+=("$p (absent)")
  done
  echo "── Visual baseline"
  run "Portal web visual baseline" env HOST_UID="$(id -u)" HOST_GID="$(id -g)" \
    sudo -E bash ./scripts/portal-web-visual.sh
  echo "── Composed stack"
  run "Smoke-test composed services" sudo bash ./scripts/portal smoke
}

groups=("${@:-all}")
for g in "${groups[@]}"; do
  case "$g" in
    py) group_py;; fe) group_fe;; heavy) group_heavy;;
    all) group_py; group_fe; group_heavy;;
    *) echo "unknown group: $g" >&2; exit 2;;
  esac
done

echo
echo "passed ${#PASS[@]}   failed ${#FAIL[@]}   skipped ${#SKIP[@]}"
((${#FAIL[@]})) && { printf 'FAILED: %s\n' "${FAIL[@]}"; exit 1; }
exit 0
