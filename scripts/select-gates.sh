#!/usr/bin/env bash
# Pick the smallest sufficient gate lanes for a change (AGENT_WORKING_RULES §10.10c). Read-only: it only prints.
#   scripts/select-gates.sh [base-ref]          # default base: merge-base with claude/fe-parity, else HEAD~1
#   scripts/select-gates.sh --landing [base]    # also requires the one full R2/R3 hook (lander runs it once per SHA)
# The lanes are a floor, not a ceiling: add a lane when a diff touches something the table does not name.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
landing=0; [ "${1:-}" = "--landing" ] && { landing=1; shift; }
base="${1:-$(git merge-base HEAD claude/fe-parity 2>/dev/null || git rev-parse HEAD~1)}"
mapfile -t files < <({ git diff --name-only "$base" HEAD; git diff --name-only; git ls-files --others --exclude-standard; } | sort -u | grep -v '^$' || true)
[ "${#files[@]}" -gt 0 ] || { echo "no changed paths against ${base}: nothing to run"; exit 0; }
has() { printf '%s\n' "${files[@]}" | grep -Eq "$1"; }
lanes=(); add() { lanes+=("$1"); }
only_docs=1; for f in "${files[@]}"; do case "$f" in upgrade/*|*.md|*/evidence/*) ;; *) only_docs=0 ;; esac; done
if [ "$only_docs" = 1 ]; then add "R0 docs only: git diff --check; no hook, no tests"; fi
if [ "$only_docs" = 0 ]; then
  has '^apps/portal/frontend/src/execution/v2/|^apps/portal/frontend/e2e/execution-v2-' && add "FE-V2: (cd apps/portal/frontend && npx tsc --noEmit && npx vitest run <touched folders> src/execution/v2/{testHygiene,absentValues,failClosed,v2Hygiene,linkTargets,titleAbsence}* --maxWorkers=3); host Playwright only the touched execution-v2-*.spec.ts, --workers=2 (no lock)"
  has '^apps/portal/frontend/src/(styles|app|portal)/|^apps/portal/frontend/src/execution/[^v][^/]*\.(tsx?|css)$|execution\.css' && add "FE-SHARED-V1: FE-V2 lane + visual V1 only for the spec that touches the file: scripts/portal-web-visual.sh -g '<spec>' (locked)"
  has '^apps/portal/frontend/e2e/execution-v2-visual.spec.ts-snapshots/|v2/css/|v2/screens/.*\.tsx$' && add "V2-PIXELS: scripts/portal-web-visual.sh e2e/execution-v2-visual.spec.ts --project=chromium-v2 (one locked command); re-record only the failing cells via scripts/portal-web-visual-record-v2.sh '<grep>' in a clean worktree"
  has '^packages/contracts/' && add "CONTRACTS: generators --check, python3 packages/contracts/tooling/snapshot.py --check, scripts/refresh-release-integrity-ledgers.sh --check, contracts vitest (no hook)"
  has '^apps/control-api/src/' && add "BE-PURE: (cd apps/control-api && npx tsc --noEmit -p tsconfig.build.json && npx vitest run <specs of the touched modules> --maxWorkers=2)"
  has '^apps/control-api/(migrations/|src/.*(repository|store|postgres))' && add "BE-PG: scripts/control-api-test.sh <explicit PG spec paths of the touched modules> (one locked command; the runner needs file paths, not folders)"
  has '^deploy/images/' && add "IMAGE: bash scripts/control-api-image-permissions-test.sh; scripts/refresh-release-integrity-ledgers.sh --check"
  has '^apps/portal/registry/' && add "REGISTRY: registry pytest + exporter check; N29 re-pin only if the revision changed"
  has '^(scripts/verify-workspace.sh|scripts/execution-n29|scripts/execution-eds12|services/portal-execution-edge-rs/contracts/)' && add "PINS: refresh-release-integrity-ledgers.sh --check (then --write by script if stale)"
  has '^upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/r2_ledger/|route-inventory' && add "LEDGERS: (cd apps/portal/frontend && npx vitest run src/execution/r2Ledger.test.ts); node scripts/research-loop-v11/p01-baseline.mjs --live-routes"
fi
[ "${#lanes[@]}" -gt 0 ] || add "NO LANE MATCHED: read the diff and pick the smallest check by hand (a script: run it with --help or its own test); do not default to the full hook"
[ "$landing" = 1 ] && add "LANDING (once per frozen SHA, by the lander only): full R2/R3 hook; the other agent reuses that result, never repeats it"
echo "base=${base}  changed=${#files[@]} paths"
printf ' - %s\n' "${lanes[@]}"
echo "Full hook is NOT required unless --landing, or the diff touches gate scripts/pins beyond the lanes above."
