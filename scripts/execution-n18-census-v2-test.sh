#!/usr/bin/env bash
# N18 census v2 (superset of v1 plus 13 T1 relations) gate; source-dark only, v1 files untouched.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS="${ROOT_DIR}/services/portal-execution-edge-rs/contracts"
CONTRACT_DIR="${CONTRACTS}/manager-surface-census-v2"
E1_DIR="${CONTRACTS}/maximum-data-return-v2"

python3 -m py_compile \
  "${ROOT_DIR}/scripts/execution-n18-census.py" \
  "${ROOT_DIR}/scripts/test_execution_n18_census_v2.py"
python3 -m json.tool "${CONTRACT_DIR}/manager-surface-census.v2.schema.json" >/dev/null
python3 -m json.tool "${CONTRACT_DIR}/manager-surface-census.v2.json" >/dev/null
python3 -m json.tool "${E1_DIR}/E1_CAPTURE_PROVENANCE.json" >/dev/null
python3 "${ROOT_DIR}/scripts/execution-n18-census.py" --census-version 2 --verify
python3 "${ROOT_DIR}/scripts/test_execution_n18_census_v2.py"

(cd "${CONTRACT_DIR}" && sha256sum -c MANIFEST.sha256)
(cd "${E1_DIR}" && sha256sum -c MANIFEST.sha256)

if grep -Eiq '(-----BEGIN|postgres(ql)?://|redis://|authorization:[[:space:]]*bearer|x-admin-token:)' \
  "${CONTRACT_DIR}/manager-surface-census.v2.json" \
  "${E1_DIR}/E1_CAPTURE_PROVENANCE.json" \
  "${E1_DIR}/DATABASE_RELATION_CENSUS.csv"; then
  echo "N18 census v2 contains secret-shaped material" >&2
  exit 1
fi

printf 'N18 census v2 gate passed.\n'
