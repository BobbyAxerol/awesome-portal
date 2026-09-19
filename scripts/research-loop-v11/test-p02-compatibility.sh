#!/usr/bin/env bash
set -euo pipefail

# P02 executes the current Control API tests and an external Research harness.
# It intentionally does not build or deploy a frontend/runtime image.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

node scripts/research-loop-v11/p02-compatibility.mjs
P02_CURRENT_SOURCE_REGRESSION=true scripts/research-loop-v11/test-p02-postgres.sh

# P01-GAP-07 closeout: run the environment-freeze assertion in the exact
# 3.12.14 runtime pin rather than weakening the committed freeze to match a
# developer workstation's Python patch version.
scripts/research-loop-v11/test-p02-python-pin.sh
