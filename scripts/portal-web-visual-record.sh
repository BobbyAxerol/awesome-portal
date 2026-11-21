#!/usr/bin/env bash
# Record the Research Loop visual baselines, then prove they compare.
#
# Scope is fixed on purpose: this only ever re-records
# `e2e/research-loop.visual.spec.ts` (S00-S14, laptop + mobile, Research Light) in the
# pinned Playwright image through scripts/portal-web-visual.sh, and it fails if a
# single file outside that spec's snapshot directory changed. It exists so recording
# is a reviewed, bounded action instead of a bare `--update`.
#
# Usage (run through sudo so the Docker daemon is reachable):
#   sudo env HOST_UID=$(id -u) HOST_GID=$(id -g) ./scripts/portal-web-visual-record.sh
#   sudo env HOST_UID=$(id -u) HOST_GID=$(id -g) ./scripts/portal-web-visual-record.sh 'S07/S08.execute.replay'
#
# The optional argument is a Playwright --grep REGEX naming only the cells to record
# (no spaces: use `.` for a space). Without it all 28 cells are re-recorded.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC="e2e/research-loop.visual.spec.ts"
SNAP_DIR="apps/portal/frontend/${SPEC}-snapshots"
GREP="${1:-}"
[ "$#" -le 1 ] || { printf 'usage: %s [grep-regex]\n' "$0" >&2; exit 2; }
if [ -n "${GREP}" ] && ! printf '%s' "${GREP}" | grep -Eq '^[A-Za-z0-9/._|()-]{1,80}$'; then
  printf 'grep regex may only use letters, digits and / . _ - | ( ) (no spaces).\n' >&2; exit 2
fi

# Run as root through sudo, git would refuse a user-owned checkout; scope that to this repo only.
git_() { git -c "safe.directory=${ROOT_DIR}" -C "${ROOT_DIR}" "$@"; }

cd "${ROOT_DIR}"
[ -f "apps/portal/frontend/${SPEC}" ] || { printf 'missing %s\n' "${SPEC}" >&2; exit 1; }

dirty="$(git_ status --porcelain | grep -v " ${SNAP_DIR}/" || true)"
if [ -n "${dirty}" ]; then
  printf 'Refusing to record: the working tree has changes outside %s:\n%s\n' "${SNAP_DIR}" "${dirty}" >&2
  exit 1
fi

printf '== record %s%s\n' "${SPEC}" "${GREP:+ (grep: ${GREP})}"
args=(--update "${SPEC}" --project=chromium)
[ -z "${GREP}" ] || args+=(-g "${GREP}")
"${ROOT_DIR}/scripts/portal-web-visual.sh" "${args[@]}"

changed="$(git_ status --porcelain)"
outside="$(printf '%s\n' "${changed}" | grep -v " ${SNAP_DIR}/" | grep -v '^$' || true)"
if [ -n "${outside}" ]; then
  printf 'Recording touched files outside %s — review and revert them:\n%s\n' "${SNAP_DIR}" "${outside}" >&2
  exit 1
fi
printf '== changed baselines (%s):\n%s\n' "$(printf '%s\n' "${changed}" | grep -c . || true)" "${changed}"

printf '== compare\n'
"${ROOT_DIR}/scripts/portal-web-visual.sh" "${SPEC}" --project=chromium
printf 'Research Loop visual baselines recorded and compared.\n'
