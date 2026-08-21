#!/usr/bin/env bash
# Operator-run SGP -> AWS HK compatibility probe. Credentials are file-only.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: execution-edge-live-probe.sh <https-origin> <ca.crt> <client.crt> <client.key> <assertion.jwt-file>

Calls only GET /internal/v1/compatibility over TLS 1.3 mTLS. The delegated
assertion must be audience/environment-bound and live no longer than 60s.
EOF
}

if [[ $# -ne 5 ]]; then
  usage >&2
  exit 2
fi

origin="${1%/}"
ca_file="$2"
client_cert_file="$3"
client_key_file="$4"
assertion_file="$5"

[[ "${origin}" =~ ^https://[^/]+$ ]] || {
  printf 'Origin must be an exact HTTPS origin without path/query/fragment.\n' >&2
  exit 2
}
for required_file in "${ca_file}" "${client_cert_file}" "${client_key_file}" "${assertion_file}"; do
  [[ -f "${required_file}" && -r "${required_file}" ]] || {
    printf 'Required probe file is not readable: %s\n' "${required_file}" >&2
    exit 2
  }
done
[[ "$(wc -c < "${assertion_file}")" -le 16384 ]] || {
  printf 'Delegated assertion file is unexpectedly large.\n' >&2
  exit 2
}

assertion="$(tr -d '\r\n' < "${assertion_file}")"
[[ -n "${assertion}" ]] || {
  printf 'Delegated assertion file is empty.\n' >&2
  exit 2
}

curl --fail --silent --show-error \
  --proto '=https' \
  --tlsv1.3 \
  --connect-timeout 2 \
  --max-time 8 \
  --cacert "${ca_file}" \
  --cert "${client_cert_file}" \
  --key "${client_key_file}" \
  --header "Authorization: Bearer ${assertion}" \
  --header 'Accept: application/json' \
  "${origin}/internal/v1/compatibility"
printf '\n'
