#!/usr/bin/env bash
# EDS-12 static qualification and optional isolated DR gate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_OFFLINE_DR=false

if [[ "${1:-}" == "--offline-dr" ]]; then
  RUN_OFFLINE_DR=true
elif [[ $# -ne 0 ]]; then
  printf 'Usage: %s [--offline-dr]\n' "$0" >&2
  exit 2
fi

python3 -m py_compile \
  "${ROOT_DIR}/scripts/execution-eds12-qualification.py" \
  "${ROOT_DIR}/scripts/test_execution_eds12_qualification.py" \
  "${ROOT_DIR}/scripts/collect-eds12-runtime-binding.py" \
  "${ROOT_DIR}/scripts/test_collect_eds12_runtime_binding.py"
python3 "${ROOT_DIR}/scripts/execution-n29-product-acceptance.py"
python3 "${ROOT_DIR}/scripts/execution-eds12-qualification.py" verify-static
python3 "${ROOT_DIR}/scripts/test_execution_eds12_qualification.py"
python3 "${ROOT_DIR}/scripts/test_collect_eds12_runtime_binding.py"
python3 "${ROOT_DIR}/scripts/test_portal_release_authority.py"

if command -v cargo >/dev/null 2>&1; then
  (cd "${ROOT_DIR}/services/portal-execution-edge-rs" && cargo test -p eds12-qualification)
elif [[ "${EDS12_REQUIRE_RUST:-false}" == "true" ]]; then
  printf 'Cargo is required for the requested EDS-12 Rust gate.\n' >&2
  exit 1
else
  printf '%s\n' 'EDS-12 local static gate passed; Rust crate remains required in CI/remote Rust gate.'
fi

if [[ "${RUN_OFFLINE_DR}" == true ]]; then
  "${ROOT_DIR}/scripts/execution-n17a-production-dr-test.sh"
fi

printf '%s\n' 'EDS-12 static qualification gate passed; no runtime activation or source traffic occurred.'
