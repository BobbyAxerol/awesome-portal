#!/usr/bin/env bash
# Builds the single active N28 Trading System owner request v3 pack.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/n28-missing-capability-v1"
MARKET_CONTEXT_DIR="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/eds11r-market-context-v1-request"

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s DESTINATION\n' "$0" >&2
  exit 2
fi

DESTINATION="$1"
if [[ -e "${DESTINATION}" ]]; then
  printf 'Destination already exists: %s\n' "${DESTINATION}" >&2
  exit 1
fi

install -d -m 0755 "${DESTINATION}/contracts"
install -m 0644 \
  "${ROOT_DIR}/upgrade/backend/TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md" \
  "${DESTINATION}/REQUEST.md"

for file in \
  README.md \
  MANIFEST.sha256 \
  missing-capability-registry.v1.json \
  missing-capability-registry.v1.schema.json \
  owner-request.v3.json \
  owner-response.v1.schema.json \
  owner-response.pending.example.json; do
  install -m 0644 "${CONTRACT_DIR}/${file}" "${DESTINATION}/contracts/${file}"
done

# EDS-11R4 is an annex of the same single owner campaign, not an independent
# request. Preserve its own manifest-bound directory so its return schema
# cannot collide with the exact MC-01…MC-09 response schema above.
install -d -m 0755 "${DESTINATION}/contracts/eds11r-market-context-v1-request"
while IFS= read -r file; do
  install -d -m 0755 "$(dirname "${DESTINATION}/contracts/eds11r-market-context-v1-request/${file}")"
  install -m 0644 "${MARKET_CONTEXT_DIR}/${file}" \
    "${DESTINATION}/contracts/eds11r-market-context-v1-request/${file}"
done < <(cd "${MARKET_CONTEXT_DIR}" && find . -type f -printf '%P\n' | LC_ALL=C sort)

(
  cd "${DESTINATION}"
  while IFS= read -r relative_path; do
    sha256sum "${relative_path}"
  done < <(find . -type f ! -name INPUT_MANIFEST.sha256 -printf '%P\n' | LC_ALL=C sort)
) >"${DESTINATION}/INPUT_MANIFEST.sha256"

(
  cd "${DESTINATION}"
  sha256sum --quiet -c INPUT_MANIFEST.sha256
)

printf 'Trading System master owner campaign (N28 + EDS-11R4) built: %s\n' "${DESTINATION}"
