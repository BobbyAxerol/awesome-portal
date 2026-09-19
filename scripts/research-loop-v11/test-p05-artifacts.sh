#!/usr/bin/env bash
set -euo pipefail

# P05 backend-only gate.  It deliberately avoids a frontend rebuild: P05 has
# no browser route or UI implementation.  PostgreSQL proof remains isolated
# and self-cleaning in the companion script.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"
apps/control-api/node_modules/.bin/tsc --noEmit -p apps/control-api/tsconfig.build.json
project_python="${PORTAL_RESEARCH_PYTHON:-$repo_root/apps/portal/.venv/bin/python}"
if [[ ! -x "$project_python" ]]; then
  echo "P05 requires the lockfile-aligned project Python at $project_python" >&2
  exit 1
fi
"$project_python" -c '
import importlib.metadata
actual = importlib.metadata.version("quantbt-engine")
if actual != "1.1.1":
    raise SystemExit(f"P05 requires quantbt-engine==1.1.1, found {actual!r}")
'
PYTHONPATH=apps/portal/backend/src:apps/portal \
  "$project_python" -m pytest \
  apps/portal/backend/tests/test_research_artifacts.py -q
rust_cargo="${PORTAL_RESEARCH_CARGO:-$(command -v cargo || true)}"
if [[ -z "$rust_cargo" || ! -x "$rust_cargo" ]]; then
  echo "P05 requires Cargo in PATH or PORTAL_RESEARCH_CARGO for the bounded Rust reader gate" >&2
  exit 1
fi
rust_target="$(mktemp -d "${TMPDIR:-/tmp}/portal-research-p05-rust-target.XXXXXX")"
cleanup_rust_target() {
  rm -rf -- "$rust_target"
}
trap cleanup_rust_target EXIT
"$rust_cargo" fmt --manifest-path apps/research-artifact-reader-rs/Cargo.toml --check
CARGO_TARGET_DIR="$rust_target" "$rust_cargo" test --manifest-path apps/research-artifact-reader-rs/Cargo.toml --offline
CARGO_TARGET_DIR="$rust_target" "$rust_cargo" clippy --manifest-path apps/research-artifact-reader-rs/Cargo.toml --all-targets --offline -- -D warnings
scripts/research-loop-v11/test-p05-postgres.sh
