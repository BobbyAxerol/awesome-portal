#!/usr/bin/env bash
# Produces a D3 probe-only env from an accepted D2 env without sourcing or
# printing it. The output is new, mode-preserving and atomically installed.
set -euo pipefail

usage() {
  printf 'Usage: %s --d2-env ABSOLUTE_PATH --output ABSOLUTE_PATH --proxy-config ABSOLUTE_PATH\n' "$0" >&2
  exit 2
}

d2_env=""
output=""
proxy_config=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --d2-env) [[ $# -ge 2 ]] || usage; d2_env="$2"; shift 2 ;;
    --output) [[ $# -ge 2 ]] || usage; output="$2"; shift 2 ;;
    --proxy-config) [[ $# -ge 2 ]] || usage; proxy_config="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[[ "${d2_env}" == /* && "${output}" == /* && "${proxy_config}" == /* &&
   -f "${d2_env}" && ! -L "${d2_env}" ]] || usage
[[ ! -e "${output}" && ! -e "${proxy_config}" ]] || {
  printf 'D3 renderer refuses to overwrite an existing env or proxy config.\n' >&2
  exit 1
}
for output_dir in "$(dirname "${output}")" "$(dirname "${proxy_config}")"; do
  [[ -d "${output_dir}" && ! -L "${output_dir}" ]] || {
    printf 'D3 renderer requires existing non-symlink output directories.\n' >&2
    exit 1
  }
done

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
preflight="${root_dir}/scripts/execution-d2-preflight.sh"
proxy_renderer="${root_dir}/scripts/execution-d2-render-source-proxy.sh"
"${preflight}" --env-file "${d2_env}" --mode offline >/dev/null

temporary="$(mktemp "${output}.tmp.XXXXXX")"
cleanup() { rm -f -- "${temporary}" "${proxy_config}"; }
trap cleanup EXIT
awk -F= '
  BEGIN { mode=0; probes=0; alpha=0; config=0 }
  $1 == "SOURCE_PROXY_SOURCE_MODE" { print "SOURCE_PROXY_SOURCE_MODE=contract-probe"; mode++; next }
  $1 == "EDGE_SOURCE_PROBES_ENABLED" { print "EDGE_SOURCE_PROBES_ENABLED=true"; probes++; next }
  $1 == "EDGE_PROBE_ALPHA_ID" { print "EDGE_PROBE_ALPHA_ID="; alpha++; next }
  $1 == "SOURCE_PROXY_CONFIG_FILE" { print "SOURCE_PROXY_CONFIG_FILE=" proxy; config++; next }
  { print }
  END { if (mode != 1 || probes != 1 || alpha != 1 || config != 1) exit 42 }
' proxy="${proxy_config}" "${d2_env}" > "${temporary}" || {
  printf 'D3 renderer rejected missing or duplicate gate fields.\n' >&2
  exit 1
}
chmod --reference="${d2_env}" "${temporary}"
chown --reference="${d2_env}" "${temporary}"
"${proxy_renderer}" --env-file "${temporary}" --output "${proxy_config}" >/dev/null
"${preflight}" --env-file "${temporary}" --mode probe-offline >/dev/null
mv -- "${temporary}" "${output}"
trap - EXIT
printf 'Rendered D3 probe-only env/config without exposing any value.\n'
