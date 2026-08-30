#!/usr/bin/env bash
# N18 complete Manager relation/capability census gate; source-dark only.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/manager-surface-census-v1"

python3 -m py_compile \
  "${ROOT_DIR}/scripts/execution-n18-census.py" \
  "${ROOT_DIR}/scripts/test_execution_n18_census.py"
python3 -m json.tool "${CONTRACT_DIR}/manager-surface-census.v1.schema.json" >/dev/null
python3 -m json.tool "${CONTRACT_DIR}/manager-surface-census.v1.json" >/dev/null
python3 "${ROOT_DIR}/scripts/execution-n18-census.py" --verify
python3 "${ROOT_DIR}/scripts/test_execution_n18_census.py"

(
  cd "${CONTRACT_DIR}"
  sha256sum -c MANIFEST.sha256
)

if grep -Eiq '(-----BEGIN|postgres(ql)?://|redis://|authorization:[[:space:]]*bearer|x-admin-token:)' \
  "${CONTRACT_DIR}/manager-surface-census.v1.json"; then
  echo "N18 census contains secret-shaped material" >&2
  exit 1
fi

printf 'N18 Manager relation and capability census gate passed.\n'
