#!/usr/bin/env bash
# RF01-B2 — P01 is a point-in-time capture (Bobby, Q2, 2026-09-23).
#
# `p01-baseline.mjs --verify` is exact at the commit that recorded
# `baseline.json` and drifts by design afterwards, because every later phase
# changes the roots it hashes. This runs that commit's own verifier inside a
# temporary worktree of that commit, so the historical proof stays checkable
# without being re-captured. The live gate is `test-route-inventory.sh`.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
capture_commit="$(git log -1 --format=%H --diff-filter=A -- upgrade/research_loop/evidence/P01/baseline.json)"
[[ -n "$capture_commit" ]] || { printf 'P01 baseline.json has no recording commit\n' >&2; exit 1; }
workdir="$(mktemp -d)"
trap 'git worktree remove --force "$workdir/p01" >/dev/null 2>&1 || true; rm -rf "$workdir"' EXIT
git worktree add -q --detach "$workdir/p01" "$capture_commit"
(cd "$workdir/p01" && node scripts/research-loop-v11/p01-baseline.mjs --verify)
