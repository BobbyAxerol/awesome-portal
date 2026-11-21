#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

readonly -a p01_source_roots=(
  apps/control-api
  apps/portal/backend
  apps/portal/frontend
  apps/portal/strategy
  deploy
  services/portal-execution-edge-rs
  upgrade/research_loop/CLAUDE-FOR-thanhvuong.md
  upgrade/research_loop/RESEARCH_LOOP_GUIDE_V1_1_24_PHASES_vi.md
  upgrade/research_loop/release-v1.1
)

# P01 captures a named committed baseline.  Do not silently fold an unrelated
# tracked/untracked implementation change into source-only evidence.  The P01
# script/evidence and Unified Plan are deliberately outside this list.
if ! git diff --quiet -- "${p01_source_roots[@]}" || ! git diff --cached --quiet -- "${p01_source_roots[@]}"; then
  printf 'P01 refuses tracked or staged changes under captured source roots; commit/review them before recording a named baseline.\n' >&2
  exit 1
fi
if untracked_source="$(git ls-files --others --exclude-standard -- "${p01_source_roots[@]}")"; [[ -n "$untracked_source" ]]; then
  printf 'P01 refuses untracked files under captured source roots:\n%s\n' "$untracked_source" >&2
  exit 1
fi

node scripts/research-loop-v11/p01-baseline.mjs --self-test
node scripts/research-loop-v11/p01-baseline.mjs --verify
