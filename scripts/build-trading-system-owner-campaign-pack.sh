#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s DESTINATION\n' "$0" >&2
  exit 2
fi

DESTINATION="$1"
if [[ -e "${DESTINATION}" ]]; then
  printf 'Destination already exists: %s\n' "${DESTINATION}" >&2
  exit 1
fi

install -d -m 0755 \
  "${DESTINATION}/annexes/n02-incremental-contract" \
  "${DESTINATION}/annexes/n03-source-implementation" \
  "${DESTINATION}/annexes/n11-external-read" \
  "${DESTINATION}/annexes/n12-command" \
  "${DESTINATION}/annexes/n15-event-artifact-reference"

install -m 0644 \
  "${ROOT_DIR}/upgrade/backend/TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md" \
  "${DESTINATION}/REQUEST.md"

cp -a \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/d4-paper-read-v2-request/." \
  "${DESTINATION}/annexes/n02-incremental-contract/"
cp -a \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/d4-paper-read-v2-implementation-request/." \
  "${DESTINATION}/annexes/n03-source-implementation/"
cp -a \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/n11-external-read-v1-request/." \
  "${DESTINATION}/annexes/n11-external-read/"
cp -a \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/n12-command-relay-v1-request/." \
  "${DESTINATION}/annexes/n12-command/"

install -m 0644 \
  "${ROOT_DIR}/packages/contracts/schemas/execution-intercell-gateway.v1.schema.json" \
  "${ROOT_DIR}/packages/contracts/openapi/execution-intercell-gateway.openapi.json" \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-intercell-gateway.source-dark.valid.json" \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-intercell-gateway.event-corpus.valid.json" \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-intercell-gateway.artifact-corpus.valid.json" \
  "${DESTINATION}/annexes/n15-event-artifact-reference/"

(
  cd "${DESTINATION}"
  while IFS= read -r relative_path; do
    sha256sum "${relative_path}"
  done < <(find . -type f ! -name INPUT_MANIFEST.sha256 -printf '%P\n' | LC_ALL=C sort)
) >"${DESTINATION}/INPUT_MANIFEST.sha256"

(
  cd "${DESTINATION}"
  sha256sum -c INPUT_MANIFEST.sha256
)

printf 'Trading System owner campaign pack built: %s\n' "${DESTINATION}"
