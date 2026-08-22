#!/usr/bin/env bash
# Render one root-owned WireGuard cell config without exposing key material in
# command arguments, stdout, Git or temporary world-readable files.
set -euo pipefail

cell=""
private_key_file=""
peer_public_key_file=""
preshared_key_file=""
endpoint=""
output="/etc/wireguard/portal0.conf"

usage() {
  cat <<'EOF'
Usage: execution-d1-render-wireguard.sh --cell sgp|aws \
  --private-key-file FILE --peer-public-key-file FILE \
  --preshared-key-file FILE [--endpoint IPV4:51820] \
  [--output /etc/wireguard/portal0.conf]
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cell) cell="${2:-}"; shift 2 ;;
    --private-key-file) private_key_file="${2:-}"; shift 2 ;;
    --peer-public-key-file) peer_public_key_file="${2:-}"; shift 2 ;;
    --preshared-key-file) preshared_key_file="${2:-}"; shift 2 ;;
    --endpoint) endpoint="${2:-}"; shift 2 ;;
    --output) output="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown renderer argument.\n' >&2; usage >&2; exit 2 ;;
  esac
done

[[ "$(id -u)" -eq 0 ]] || { printf 'Renderer must run as root.\n' >&2; exit 1; }
[[ "${cell}" == "sgp" || "${cell}" == "aws" ]] || {
  printf 'Cell must be sgp or aws.\n' >&2
  exit 1
}
[[ "${output}" == "/etc/wireguard/portal0.conf" ]] || {
  printf 'Output path is outside the D1 boundary.\n' >&2
  exit 1
}

for key_file in "${private_key_file}" "${peer_public_key_file}" "${preshared_key_file}"; do
  [[ -f "${key_file}" && -r "${key_file}" ]] || {
    printf 'A required WireGuard identity file is unavailable.\n' >&2
    exit 1
  }
  key_mode="$(stat -c '%a' "${key_file}" 2>/dev/null || true)"
  if [[ ! "${key_mode}" =~ ^[0-7]{3,4}$ ]] || (( (8#${key_mode} & 8#077) != 0 )); then
    printf 'WireGuard identity files must have no group/world permissions.\n' >&2
    exit 1
  fi
done

IFS= read -r private_key < "${private_key_file}"
IFS= read -r peer_public_key < "${peer_public_key_file}"
IFS= read -r preshared_key < "${preshared_key_file}"
for key_material in "${private_key}" "${peer_public_key}" "${preshared_key}"; do
  [[ "${key_material}" =~ ^[A-Za-z0-9+/]{43}=$ ]] || {
    printf 'WireGuard identity material has an invalid encoded shape.\n' >&2
    exit 1
  }
done

if [[ "${cell}" == "sgp" ]]; then
  [[ "${endpoint}" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}:51820$ ]] || {
    printf 'SGP requires the approved AWS IPv4 endpoint on UDP 51820.\n' >&2
    exit 1
  }
elif [[ -n "${endpoint}" ]]; then
  printf 'AWS responder config must not declare a roaming endpoint.\n' >&2
  exit 1
fi

install -d -m 700 -o root -g root /etc/wireguard
tmp_dir="$(mktemp -d /etc/wireguard/.portal0-render.XXXXXX)"
tmp_file="${tmp_dir}/portal0.conf"
cleanup() {
  [[ ! -e "${tmp_file}" ]] || rm -f -- "${tmp_file}"
  [[ ! -d "${tmp_dir}" ]] || rmdir -- "${tmp_dir}"
}
trap cleanup EXIT
install -m 600 /dev/null "${tmp_file}"

if [[ "${cell}" == "sgp" ]]; then
  {
    printf '%s\n' '[Interface]'
    printf 'Address = %s\n' '10.70.0.1/30'
    printf 'PrivateKey = %s\n' "${private_key}"
    printf '%s\n' 'Table = off' 'SaveConfig = false' '' '[Peer]'
    printf 'PublicKey = %s\n' "${peer_public_key}"
    printf 'PresharedKey = %s\n' "${preshared_key}"
    printf 'Endpoint = %s\n' "${endpoint}"
    printf '%s\n' 'AllowedIPs = 10.70.0.2/32' 'PersistentKeepalive = 25'
  } > "${tmp_file}"
else
  {
    printf '%s\n' '[Interface]'
    printf 'Address = %s\n' '10.70.0.2/30'
    printf '%s\n' 'ListenPort = 51820'
    printf 'PrivateKey = %s\n' "${private_key}"
    printf '%s\n' 'Table = off' 'SaveConfig = false' '' '[Peer]'
    printf 'PublicKey = %s\n' "${peer_public_key}"
    printf 'PresharedKey = %s\n' "${preshared_key}"
    printf '%s\n' 'AllowedIPs = 10.70.0.1/32'
  } > "${tmp_file}"
fi

wg-quick strip "${tmp_file}" >/dev/null
install -m 600 -o root -g root "${tmp_file}" "${output}"
rm -f -- "${tmp_file}"
rmdir -- "${tmp_dir}"
printf 'WireGuard D1 config rendered and validated without exposing identity material.\n'
