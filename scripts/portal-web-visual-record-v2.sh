#!/usr/bin/env bash
# Record the V2 screen pixel baselines, then prove they compare twice in a row.
#
# Scope is fixed on purpose: this only ever re-records `e2e/execution-v2-visual.spec.ts`
# (chromium-v2 project, fixture lab / BFF_DOUBLE) in the pinned Playwright image through
# scripts/portal-web-visual.sh. It refuses to start when the working tree has changes outside
# that spec's snapshot directory, and fails if recording touched anything outside it. Recording is
# therefore a reviewed, bounded action instead of a bare `--update`
# (AGENT_WORKING_RULES G4 + 10.10: baselines only for the new groups).
#
# After recording it compares twice in a row. Two green compares are the stability proof: a cell
# that is noisy between two page loads turns one of them red here, not later in CI.
#
# Usage:
#   ./scripts/portal-web-visual-record-v2.sh                     # record all cells
#   ./scripts/portal-web-visual-record-v2.sh 'Fleet|Blotter'     # record only matching cells
#
# The optional argument is a Playwright --grep REGEX over test titles ("<Group> @ <width>"; use `.`
# for a space). Heavy: hold the repo's heavy-job lock around it (one pinned-image job at a time).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC="e2e/execution-v2-visual.spec.ts"
PROJECT="chromium-v2"
SNAP_DIR="apps/portal/frontend/${SPEC}-snapshots"
GREP="${1:-}"
[ "$#" -le 1 ] || { printf 'usage: %s [grep-regex]\n' "$0" >&2; exit 2; }
if [ -n "${GREP}" ] && ! printf '%s' "${GREP}" | grep -Eq '^[A-Za-z0-9/._|()&-]{1,80}$'; then
  printf 'grep regex may only use letters, digits and / . _ - | ( ) & (no spaces).\n' >&2; exit 2
fi

git_() { git -c "safe.directory=${ROOT_DIR}" -C "${ROOT_DIR}" "$@"; }

cd "${ROOT_DIR}"
[ -f "apps/portal/frontend/${SPEC}" ] || { printf 'missing %s\n' "${SPEC}" >&2; exit 1; }

outside_of_snapshots() { grep -v " ${SNAP_DIR}/" | grep -v '^$' || true; }

dirty="$(git_ status --porcelain --untracked-files=all | outside_of_snapshots)"
if [ -n "${dirty}" ]; then
  printf 'Refusing to record: the working tree has changes outside %s:\n%s\n' "${SNAP_DIR}" "${dirty}" >&2
  exit 1
fi

# --workers=2: the pinned image runs three Vite builds first; more workers only add timing noise.
common=("${SPEC}" "--project=${PROJECT}" "--workers=2")
[ -z "${GREP}" ] || common+=(-g "${GREP}")

printf '== record %s%s\n' "${SPEC}" "${GREP:+ (grep: ${GREP})}"
"${ROOT_DIR}/scripts/portal-web-visual.sh" --update "${common[@]}"

changed="$(git_ status --porcelain --untracked-files=all)"
outside="$(printf '%s\n' "${changed}" | outside_of_snapshots)"
if [ -n "${outside}" ]; then
  printf 'Recording touched files outside %s - review and revert them:\n%s\n' "${SNAP_DIR}" "${outside}" >&2
  exit 1
fi
printf '== changed baselines: %s\n' "$(printf '%s\n' "${changed}" | grep -c . || true)"

for pass in 1 2; do
  printf '== compare %s of 2\n' "${pass}"
  "${ROOT_DIR}/scripts/portal-web-visual.sh" "${common[@]}"
done
printf 'V2 visual baselines recorded; two consecutive compares passed.\n'
