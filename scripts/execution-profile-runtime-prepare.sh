#!/usr/bin/env bash
# Render one Sandbox/Live profile without copying any workload secret.
set -euo pipefail

usage() {
  printf 'Usage: %s --profile sandbox|live --base-env PATH --output-env PATH --edge-image CONTENT_ADDRESS\n' "$0" >&2
  exit 2
}

profile="" base_env="" output_env="" edge_image=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) profile="${2:-}"; shift 2 ;;
    --base-env) base_env="${2:-}"; shift 2 ;;
    --output-env) output_env="${2:-}"; shift 2 ;;
    --edge-image) edge_image="${2:-}"; shift 2 ;;
    *) usage ;;
  esac
done
[[ "${EUID}" -eq 0 && "${profile}" =~ ^(sandbox|live)$ && -f "${base_env}" &&
   "${output_env}" == /srv/primus/portal/runtime/* &&
   "${edge_image}" =~ ^portal-execution-edge-manager-v2@sha256:[a-f0-9]{64}$ ]] || usage

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_gid="$(getent group portal-runtime | cut -d: -f3)"
[[ "${runtime_gid}" =~ ^[0-9]+$ ]] || { printf 'portal-runtime group is missing.\n' >&2; exit 1; }

case "${profile}" in
  sandbox)
    upper=SANDBOX profile_id=SANDBOX_BINANCE_USDM edge_port=8444
    bridge_cidr=172.24.0.0/24 bridge_gateway=172.24.0.1
    facade_port=8123 issuer_port=8124 volume=portal-execution-projection-pgdata-v2
    ;;
  live)
    upper=LIVE profile_id=LIVE_BINANCE_USDM edge_port=8445
    bridge_cidr=172.25.0.0/24 bridge_gateway=172.25.0.1
    facade_port=8223 issuer_port=8224 volume=portal-execution-projection-pgdata-v3
    ;;
esac

proxy_dir=/srv/primus/portal/source-proxy
proxy_config="${proxy_dir}/nginx.manager-${profile}.conf"
manager_locations="${proxy_dir}/manager-v2-locations-${profile}.conf"
[[ -d "${proxy_dir}" && ! -L "${proxy_dir}" ]] || {
  printf 'Shared Source Proxy directory is missing or unsafe.\n' >&2
  exit 1
}

cp -- "${base_env}" "${output_env}"
sed -i \
  -e '/^EDGE_DEV_LOCAL_IMAGE_ALLOWED=/d' \
  -e '/^EDGE_PRIVATE_PORT=/d' \
  -e '/^SOURCE_PROXY_MANAGER_PROFILE_ID=/d' \
  -e '/^SOURCE_PROXY_MANAGER_FACADE_PORT=/d' \
  -e '/^SOURCE_PROXY_MANAGER_ISSUER_PORT=/d' \
  -e '/^SOURCE_PROXY_MANAGER_LOCATIONS_FILE=/d' \
  -e '/^EDGE_MANAGER_V2_READ_ENABLED=/d' \
  -e '/^EDGE_MANAGER_V2_PROFILE_ID=/d' \
  -e '/^EDGE_SHADOW_QUERY_ENABLED=/d' \
  -e '/^EDGE_PAPER_WORKBENCH_SHADOW_ENABLED=/d' \
  -e "s#^PORTAL_EXECUTION_EDGE_IMAGE=.*#PORTAL_EXECUTION_EDGE_IMAGE=${edge_image}#" \
  -e "s#^SOURCE_PROXY_CONFIG_FILE=.*#SOURCE_PROXY_CONFIG_FILE=${proxy_config}#" \
  -e "s#^PORTAL_BRIDGE_CIDR=.*#PORTAL_BRIDGE_CIDR=${bridge_cidr}#" \
  -e "s#^PORTAL_BRIDGE_GATEWAY_IP=.*#PORTAL_BRIDGE_GATEWAY_IP=${bridge_gateway}#" \
  -e 's#^SOURCE_PROXY_SOURCE_MODE=.*#SOURCE_PROXY_SOURCE_MODE=manager-profile-read#' \
  -e "s#^PROJECTION_DB_VOLUME_NAME=.*#PROJECTION_DB_VOLUME_NAME=${volume}#" \
  -e "s#^EDGE_ENVIRONMENT=.*#EDGE_ENVIRONMENT=${profile}#" \
  -e "s#^EDGE_DELEGATION_AUDIENCE=.*#EDGE_DELEGATION_AUDIENCE=portal-execution-edge-${profile}#" \
  -e "s#^EDGE_SOURCE_ORIGIN=.*#EDGE_SOURCE_ORIGIN=https://${bridge_gateway}:8444#" \
  "${output_env}"
printf '%s\n' \
  'EDGE_DEV_LOCAL_IMAGE_ALLOWED=true' \
  "EDGE_PRIVATE_PORT=${edge_port}" \
  "SOURCE_PROXY_MANAGER_PROFILE_ID=${profile_id}" \
  "SOURCE_PROXY_MANAGER_FACADE_PORT=${facade_port}" \
  "SOURCE_PROXY_MANAGER_ISSUER_PORT=${issuer_port}" \
  "SOURCE_PROXY_MANAGER_LOCATIONS_FILE=${manager_locations}" \
  'EDGE_MANAGER_V2_READ_ENABLED=true' \
  "EDGE_MANAGER_V2_PROFILE_ID=${profile_id}" \
  'EDGE_SHADOW_QUERY_ENABLED=false' \
  'EDGE_PAPER_WORKBENCH_SHADOW_ENABLED=false' \
  >>"${output_env}"
chown root:"${runtime_gid}" "${output_env}"
chmod 0600 "${output_env}"

"${root_dir}/scripts/execution-d2-render-source-proxy.sh" \
  --env-file "${output_env}" \
  --output "${proxy_config}" \
  --manager-locations-output "${manager_locations}"
"${root_dir}/scripts/execution-d2-preflight.sh" \
  --env-file "${output_env}" --mode manager-active-readiness

printf 'Prepared %s profile with shared read-only secrets and distinct non-secret routes.\n' "${upper}"
