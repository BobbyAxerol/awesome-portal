#!/usr/bin/env bash
# Read-only D4 Source Proxy admission gate. It never starts a service, opens a
# socket, reads the dedicated source key value or contacts Trading System.
set -euo pipefail

usage() {
  printf 'Usage: %s --runtime-env PATH --owner-input PATH --config PATH --contract PATH --mode template|readiness\n' "$0" >&2
  exit 2
}

runtime_env=""
owner_input=""
config_file=""
contract_file=""
mode=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --runtime-env) [[ $# -ge 2 ]] || usage; runtime_env="$2"; shift 2 ;;
    --owner-input) [[ $# -ge 2 ]] || usage; owner_input="$2"; shift 2 ;;
    --config) [[ $# -ge 2 ]] || usage; config_file="$2"; shift 2 ;;
    --contract) [[ $# -ge 2 ]] || usage; contract_file="$2"; shift 2 ;;
    --mode) [[ $# -ge 2 ]] || usage; mode="$2"; shift 2 ;;
    *) usage ;;
  esac
done
for path in "${runtime_env}" "${owner_input}" "${config_file}" "${contract_file}"; do
  [[ -n "${path}" && -f "${path}" ]] || usage
done
[[ "${mode}" =~ ^(template|readiness)$ ]] || usage

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
imported_contract="${root_dir}/services/portal-execution-edge-rs/contracts/d4-paper-read-v1/source-proxy-d4-read-locations.conf.template"
manifest_dir="$(dirname "${imported_contract}")"

"${root_dir}/scripts/execution-d2-preflight.sh" \
  --env-file "${runtime_env}" --mode template >/dev/null
if [[ "${mode}" == template ]]; then
  python3 "${root_dir}/scripts/execution-d4-authorization.py" \
    --input "${owner_input}" --mode template >/dev/null
else
  python3 "${root_dir}/scripts/execution-d4-authorization.py" \
    --input "${owner_input}" --mode readiness >/dev/null
fi

(cd "${manifest_dir}" && sha256sum --quiet -c MANIFEST.sha256)
expected_contract_sha="$(sha256sum "${imported_contract}" | cut -d' ' -f1)"
actual_contract_sha="$(sha256sum "${contract_file}" | cut -d' ' -f1)"
[[ "${actual_contract_sha}" == "${expected_contract_sha}" ]] || {
  printf 'D4 Source Proxy rejected contract-include drift.\n' >&2
  exit 1
}

read_value() {
  local key="$1"
  awk -F= -v wanted="${key}" '$1 == wanted { print substr($0, index($0, "=") + 1); exit }' \
    "${runtime_env}"
}
bridge_ip="$(read_value PORTAL_BRIDGE_GATEWAY_IP)"
private_port="$(read_value SOURCE_PROXY_PRIVATE_PORT)"
runtime_gid="$(read_value PORTAL_RUNTIME_GID)"
source_mode="$(read_value SOURCE_PROXY_SOURCE_MODE)"
secret_directory="$(read_value SOURCE_PROXY_SECRET_DIRECTORY)"
declared_config="$(read_value SOURCE_PROXY_CONFIG_FILE)"
[[ "${source_mode}" == paper-read ]] || {
  printf 'D4 Source Proxy requires paper-read mode.\n' >&2
  exit 1
}

expected_listener="        listen ${bridge_ip}:${private_port} ssl;"
[[ "$(grep -Fxc "${expected_listener}" "${config_file}")" -eq 1 &&
   "$(grep -Ec '^[[:space:]]*listen[[:space:]]' "${config_file}")" -eq 1 ]] || {
  printf 'D4 Source Proxy requires one exact private TLS listener.\n' >&2
  exit 1
}
[[ "$(grep -Fxc '        http2 on;' "${config_file}")" -eq 1 &&
   "$(grep -Fxc '        ssl_protocols TLSv1.3;' "${config_file}")" -eq 1 &&
   "$(grep -Fxc '        ssl_verify_client on;' "${config_file}")" -eq 1 &&
   "$(grep -Fxc '    proxy_pass_request_body off;' "${config_file}")" -eq 1 &&
   "$(grep -Fxc '        limit_req zone=d4_paper_read burst=120 nodelay;' "${config_file}")" -eq 1 &&
   "$(grep -Fxc '        limit_req_status 429;' "${config_file}")" -eq 1 &&
   "$(grep -Fxc '        include /etc/nginx/d4-paper-read-locations.conf;' "${config_file}")" -eq 1 &&
   "$(grep -Fxc '    limit_req_zone $binary_remote_addr zone=d4_paper_read:1m rate=120r/m;' "${config_file}")" -eq 1 ]] || {
  printf 'D4 Source Proxy rejected HTTP/2, TLS, mTLS, rate or include drift.\n' >&2
  exit 1
}
if grep -Eiq '(^|[[:space:]])(quic|http3)([[:space:];]|$)|alt-svc|X-API-Key|127\.0\.0\.1:8000|/v1/contracts|/v1/health/capabilities' \
    "${config_file}"; then
  printf 'D4 Source Proxy contains a legacy, discovery or forbidden transport surface.\n' >&2
  exit 1
fi
[[ "$(grep -Ec '^location = /v1/(orders|fills|positions|events) \{' "${contract_file}")" -eq 4 &&
   "$(grep -Fc 'proxy_pass_request_headers off;' "${contract_file}")" -eq 4 &&
   "$(grep -Fc '127.0.0.1:8011' "${contract_file}")" -eq 8 &&
   "$(grep -Fc 'include /run/secrets/trading-system-read-header.conf;' "${contract_file}")" -eq 4 ]] || {
  printf 'D4 Source Proxy rejected exact-route or loopback-facade drift.\n' >&2
  exit 1
}
if grep -Eq '__[A-Z0-9_]+__' "${config_file}" "${contract_file}"; then
  printf 'D4 Source Proxy contains an unresolved placeholder.\n' >&2
  exit 1
fi

if [[ "${mode}" == readiness ]]; then
  (( EUID == 0 )) || {
    printf 'D4 Source Proxy readiness must run as root.\n' >&2
    exit 1
  }
  [[ ! -L "${runtime_env}" && ! -L "${owner_input}" &&
     "$(stat -c '%u:%a' "${runtime_env}")" == 0:600 &&
     "$(stat -c '%u:%a' "${owner_input}")" == 0:600 ]] || {
    printf 'D4 Source Proxy readiness requires root-owned mode-0600 inputs.\n' >&2
    exit 1
  }
  [[ "${config_file}" == "${declared_config}" &&
     "${config_file}" == /srv/primus/portal/* &&
     "${contract_file}" == /srv/primus/portal/* &&
     ! -L "${config_file}" && ! -L "${contract_file}" &&
     "$(stat -c '%u:%g:%a' "${config_file}")" == "0:${runtime_gid}:640" &&
     "$(stat -c '%u:%g:%a' "${contract_file}")" == "0:${runtime_gid}:640" ]] || {
    printf 'D4 Source Proxy readiness rejected installed config/contract ownership.\n' >&2
    exit 1
  }
  [[ -d "${secret_directory}" && ! -L "${secret_directory}" &&
     "$(stat -c '%u:%g:%a' "${secret_directory}")" == "0:${runtime_gid}:750" ]] || {
    printf 'D4 Source Proxy readiness rejected its secret directory.\n' >&2
    exit 1
  }
  for file in source-proxy-server.crt projection-ingestor-ca.crt; do
    path="${secret_directory}/${file}"
    [[ -f "${path}" && ! -L "${path}" && "$(stat -c '%u:%g:%a' "${path}")" == "0:${runtime_gid}:644" ]] || {
      printf 'D4 Source Proxy readiness rejected a certificate boundary.\n' >&2
      exit 1
    }
    openssl x509 -in "${path}" -noout -checkend 86400 >/dev/null 2>&1 || {
      printf 'D4 Source Proxy readiness rejected an invalid/near-expiry certificate.\n' >&2
      exit 1
    }
  done
  server_key="${secret_directory}/source-proxy-server.key"
  header_file="${secret_directory}/trading-system-read-header.conf"
  for path in "${server_key}" "${header_file}"; do
    [[ -f "${path}" && ! -L "${path}" && "$(stat -c '%u:%g:%a' "${path}")" == "0:${runtime_gid}:640" ]] || {
      printf 'D4 Source Proxy readiness rejected a private runtime file.\n' >&2
      exit 1
    }
  done
  openssl pkey -in "${server_key}" -noout >/dev/null 2>&1 || {
    printf 'D4 Source Proxy readiness rejected its server key.\n' >&2
    exit 1
  }
  cert_digest="$(openssl x509 -in "${secret_directory}/source-proxy-server.crt" -pubkey -noout 2>/dev/null |
    openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | cut -d' ' -f1)"
  key_digest="$(openssl pkey -in "${server_key}" -pubout -outform DER 2>/dev/null |
    sha256sum | cut -d' ' -f1)"
  [[ -n "${cert_digest}" && "${cert_digest}" == "${key_digest}" ]] || {
    printf 'D4 Source Proxy readiness rejected a mismatched server identity.\n' >&2
    exit 1
  }
  python3 - "${header_file}" <<'PY'
import pathlib
import re
import sys

lines = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
if len(lines) != 2:
    raise SystemExit("D4 Source Proxy identity include must contain exactly two lines.")
match = re.fullmatch(
    r'proxy_set_header X-Portal-Paper-Read-Key "([^"\s]{16,512})";', lines[0]
)
if not match or match.group(1) == "REPLACE_WITH_DEDICATED_PAPER_READ_KEY":
    raise SystemExit("D4 Source Proxy dedicated identity is missing or malformed.")
if lines[1] != 'proxy_set_header X-Portal-Read-Contract "d4.paper-read.v1";':
    raise SystemExit("D4 Source Proxy contract header drifted.")
PY
fi

printf 'D4 Source Proxy %s preflight PASSED. No service or source request started.\n' "${mode}"
