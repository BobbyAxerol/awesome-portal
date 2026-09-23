#!/usr/bin/env bash
# RF01-B2 — the live static route gate for every Research phase.
#
# Fails on a route declared twice, a protected-kernel mismatch, or a static
# route set that differs from the committed ledger. A change that adds or
# removes a route records it with:
#
#   node scripts/research-loop-v11/p01-baseline.mjs --write-live-routes
#
# P01's own point-in-time proof is `test-p01-capture.sh`.
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
node scripts/research-loop-v11/p01-baseline.mjs --live-routes
