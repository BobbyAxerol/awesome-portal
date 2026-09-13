#!/usr/bin/env bash
# Refresh/check the two tracked, non-secret release-integrity ledgers in their
# dependency order.  It never contacts GitHub/GHCR, starts a runtime, reads
# credentials, or changes deployed state.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:---check}"

case "${mode}" in
  --check)
    write_args=()
    ;;
  --write)
    write_args=(--write)
    ;;
  *)
    printf 'Usage: %s [--check|--write]\n' "$0" >&2
    exit 2
    ;;
esac

# N29 binds the protected release workflow; EDS-12 then binds the resulting
# N29 acceptance artifact.  Preserve that direction to avoid stale parent
# digests after a reviewed CI or publisher change.
python3 "${ROOT_DIR}/scripts/execution-n29-product-acceptance.py" \
  --refresh-evidence "${write_args[@]}"
python3 "${ROOT_DIR}/scripts/execution-eds12-qualification.py" \
  refresh-static-input-digests "${write_args[@]}"

# Always prove the new (or already current) chain after the optional write.
python3 "${ROOT_DIR}/scripts/execution-n29-product-acceptance.py"
python3 "${ROOT_DIR}/scripts/execution-eds12-qualification.py" verify-static

printf '%s\n' 'Release-integrity ledgers are current; no runtime authority changed.'
