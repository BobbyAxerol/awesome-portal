#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_WHEEL="${1:-/home/bobby/pool_alpha/wheels/primus_historical_market_data-0.1.0rc3-py3-none-any.whl}"
EXPECTED_SHA256="3b2a41b87ff834912556bb3039bf3e3c148bd859a1ced9ee4f52a3c658ca5663"
DESTINATION_DIR="${ROOT_DIR}/vendor/hmd-reader"
DESTINATION_WHEEL="${DESTINATION_DIR}/primus_historical_market_data-0.1.0rc3-py3-none-any.whl"

if [[ ! -f "${SOURCE_WHEEL}" ]]; then
  printf 'Approved reader wheel not found: %s\n' "${SOURCE_WHEEL}" >&2
  exit 1
fi
printf '%s  %s\n' "${EXPECTED_SHA256}" "${SOURCE_WHEEL}" | sha256sum -c -
install -d -m 0750 "${DESTINATION_DIR}"
install -m 0640 "${SOURCE_WHEEL}" "${DESTINATION_WHEEL}"
printf '%s  %s\n' "${EXPECTED_SHA256}" "${DESTINATION_WHEEL}" | sha256sum -c -
printf 'Staged ignored approved reader wheel at %s\n' "${DESTINATION_WHEEL}"
