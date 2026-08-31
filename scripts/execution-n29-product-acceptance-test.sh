#!/usr/bin/env bash
# N29 finite campaign acceptance, debt and release-authority gate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 -m json.tool \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/n29-product-acceptance-v1/product-acceptance.v1.json" >/dev/null
python3 -m json.tool \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/n29-product-acceptance-v1/debt-register.v1.json" >/dev/null
python3 -m json.tool \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/n29-product-acceptance-v1/product-acceptance.v1.schema.json" >/dev/null
python3 -m json.tool \
  "${ROOT_DIR}/deploy/manifests/execution-manager-product-release-profile.v1.json" >/dev/null
python3 -m json.tool \
  "${ROOT_DIR}/deploy/execution-manager-v2/product-dashboard.v1.json" >/dev/null

python3 "${ROOT_DIR}/scripts/execution-n29-product-acceptance.py"

printf '%s\n' 'N29 complete-surface, no-unnamed-debt and fail-closed product release gates passed.'
