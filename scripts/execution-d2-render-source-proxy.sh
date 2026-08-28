#!/usr/bin/env bash
# Atomically renders only non-secret listener metadata into the root/group-owned
# Source Proxy config. The Trading System credential remains a separate include.
set -euo pipefail

usage() {
  printf 'Usage: %s --env-file PATH --output ABSOLUTE_PATH [--manager-locations-output ABSOLUTE_PATH]\n' "$0" >&2
  exit 2
}

env_file=""
output=""
manager_locations_output=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) [[ $# -ge 2 ]] || usage; env_file="$2"; shift 2 ;;
    --output) [[ $# -ge 2 ]] || usage; output="$2"; shift 2 ;;
    --manager-locations-output) [[ $# -ge 2 ]] || usage; manager_locations_output="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -n "${env_file}" && -n "${output}" && "${output}" == /* ]] || usage

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template="${root_dir}/deploy/execution-d1/source-proxy/nginx.conf.template"
manager_locations_template="${root_dir}/deploy/execution-d1/source-proxy/manager-v2-locations.conf.template"
"${root_dir}/scripts/execution-d2-preflight.sh" --env-file "${env_file}" --mode template >/dev/null

read_value() {
  local key="$1"
  awk -F= -v wanted="${key}" '$1 == wanted { print substr($0, index($0, "=") + 1); exit }' "${env_file}"
}
bridge_ip="$(read_value PORTAL_BRIDGE_GATEWAY_IP)"
private_port="$(read_value SOURCE_PROXY_PRIVATE_PORT)"
runtime_gid="$(read_value PORTAL_RUNTIME_GID)"
source_mode="$(read_value SOURCE_PROXY_SOURCE_MODE)"
case "${source_mode}" in
  dark)
    public_probe_guard='return 503;'
    alpha_read_guard='return 503;'
    manager_read_include='# Manager-v2 route disabled'
    ;;
  contract-probe)
    public_probe_guard='# D3 contract-probe gate accepted'
    alpha_read_guard='return 503;'
    manager_read_include='# Manager-v2 route disabled'
    ;;
  paper-read)
    public_probe_guard='# D3 contract-probe gate accepted'
    alpha_read_guard='# D4 source-read gate accepted'
    manager_read_include='# Manager-v2 route disabled'
    ;;
  manager-paper-read|manager-profile-read)
    public_probe_guard='return 503;'
    alpha_read_guard='return 503;'
    [[ -n "${manager_locations_output}" && "${manager_locations_output}" == /* ]] || {
      printf 'Manager read rendering requires --manager-locations-output.\n' >&2
      exit 1
    }
    manager_read_include='include /run/secrets/manager-v2-locations.conf;'
    ;;
  *) printf 'D2 renderer rejected an unknown Source Proxy source mode.\n' >&2; exit 1 ;;
esac

output_dir="$(dirname "${output}")"
[[ -d "${output_dir}" && ! -L "${output_dir}" ]] || {
  printf 'D2 renderer requires an existing non-symlink output directory.\n' >&2
  exit 1
}
[[ ! -e "${output}" || ! -L "${output}" ]] || {
  printf 'D2 renderer refuses a symlink configuration output.\n' >&2
  exit 1
}
if [[ -n "${manager_locations_output}" ]]; then
  manager_output_dir="$(dirname "${manager_locations_output}")"
  [[ -d "${manager_output_dir}" && ! -L "${manager_output_dir}" ]] || {
    printf 'D2 renderer requires a non-symlink Manager output directory.\n' >&2
    exit 1
  }
  [[ ! -e "${manager_locations_output}" || ! -L "${manager_locations_output}" ]] || {
    printf 'D2 renderer refuses a symlink Manager locations output.\n' >&2
    exit 1
  }
fi
temporary="$(mktemp "${output}.tmp.XXXXXX")"
manager_temporary=""
cleanup() {
  rm -f -- "${temporary}"
  [[ -z "${manager_temporary}" ]] || rm -f -- "${manager_temporary}"
}
trap cleanup EXIT
if [[ "${source_mode}" =~ ^(manager-paper-read|manager-profile-read)$ ]]; then
  manager_temporary="$(mktemp "${manager_locations_output}.tmp.XXXXXX")"
  cp -- "${manager_locations_template}" "${manager_temporary}"
  if [[ "${source_mode}" == manager-profile-read ]]; then
    manager_facade_port="$(read_value SOURCE_PROXY_MANAGER_FACADE_PORT)"
    manager_issuer_port="$(read_value SOURCE_PROXY_MANAGER_ISSUER_PORT)"
    sed -i \
      -e "s#127\\.0\\.0\\.1:8023#127.0.0.1:${manager_facade_port}#g" \
      -e "s#127\\.0\\.0\\.1:8024/internal/issue#127.0.0.1:${manager_issuer_port}/internal/issue#g" \
      "${manager_temporary}"
  fi
  if grep -Eq '__[A-Z0-9_]+__' "${manager_temporary}"; then
    printf 'D2 renderer found an unresolved Manager locations placeholder.\n' >&2
    exit 1
  fi
  chmod 0640 "${manager_temporary}"
  chgrp "${runtime_gid}" "${manager_temporary}" || {
    printf 'D2 renderer could not assign the configured portal-runtime group.\n' >&2
    exit 1
  }
  mv -f -- "${manager_temporary}" "${manager_locations_output}"
  manager_temporary=""
fi
sed \
  -e "s/__PORTAL_BRIDGE_GATEWAY_IP__/${bridge_ip}/g" \
  -e "s/__SOURCE_PROXY_PRIVATE_PORT__/${private_port}/g" \
  -e "s/__PUBLIC_PROBE_GUARD__/${public_probe_guard}/g" \
  -e "s/__ALPHA_READ_GUARD__/${alpha_read_guard}/g" \
  -e "s@__MANAGER_READ_INCLUDE__@${manager_read_include}@g" \
  "${template}" > "${temporary}"
if grep -Eq '__[A-Z0-9_]+__' "${temporary}"; then
  printf 'D2 renderer left an unresolved configuration placeholder.\n' >&2
  exit 1
fi
chmod 0640 "${temporary}"
chgrp "${runtime_gid}" "${temporary}" || {
  printf 'D2 renderer could not assign the configured portal-runtime group.\n' >&2
  exit 1
}
mv -f -- "${temporary}" "${output}"
trap - EXIT
printf 'Rendered D2 Source Proxy config without source credentials.\n'
