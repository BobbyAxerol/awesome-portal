#!/usr/bin/env bash
# Atomically migrate a private D1 owner-input file to the tracked v1 schema and
# open one bounded network-only change window. Values are never sourced or
# printed. The previous file is retained mode 0600 for exact rollback/audit.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template="${ROOT_DIR}/deploy/execution-d1/owner-input.env.example"
input=""
owner=""
duration_minutes=120

usage() {
  cat <<'EOF'
Usage: execution-d1-open-window.sh --input FILE --owner NAME [--duration-minutes 30..240]

Migrates FILE to owner-input v1, preserves compatible values, normalizes the
WireGuard peer IP fields, enables only D1 decision gates, and keeps every
Trading System/command/live/delivery safety lock false.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      input="$2"
      shift 2
      ;;
    --owner)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      owner="$2"
      shift 2
      ;;
    --duration-minutes)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      duration_minutes="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument.\n' >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ -n "${input}" && -f "${input}" && -r "${input}" && -w "${input}" ]] || {
  printf 'A readable and writable private owner-input file is required.\n' >&2
  exit 1
}
[[ -f "${template}" && -r "${template}" ]] || {
  printf 'Tracked owner-input v1 template is unavailable.\n' >&2
  exit 1
}
[[ "${owner}" =~ ^[A-Za-z][A-Za-z0-9._-]{0,63}$ ]] || {
  printf 'Owner identifier is invalid.\n' >&2
  exit 1
}
[[ "${duration_minutes}" =~ ^[0-9]+$ ]] &&
  (( 10#${duration_minutes} >= 30 && 10#${duration_minutes} <= 240 )) || {
    printf 'Change-window duration must be 30..240 minutes.\n' >&2
    exit 1
  }

input_mode="$(stat -c '%a' "${input}" 2>/dev/null || true)"
if [[ ! "${input_mode}" =~ ^[0-7]{3,4}$ ]] || (( (8#${input_mode} & 8#077) != 0 )); then
  printf 'Private owner input must have no group/world permission bits.\n' >&2
  exit 1
fi

declare -A old_values=()
parse_private_input() {
  local raw line key value line_number=0
  while IFS= read -r raw || [[ -n "${raw}" ]]; do
    line_number=$((line_number + 1))
    line="${raw#"${raw%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "${line}" || "${line}" == \#* ]] && continue
    if [[ ! "${line}" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]]; then
      printf 'Private owner-input syntax is invalid at line %d.\n' "${line_number}" >&2
      exit 1
    fi
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    if [[ "${value}" == *'$('* || "${value}" == *'${'* || "${value}" == *'`'* ||
          "${value}" == *"'"* || "${value}" == *'"'* ||
          ! "${value}" =~ ^[A-Za-z0-9._:/,@+\ -]*$ ]]; then
      printf 'Private owner-input value syntax is unsafe for key %s.\n' "${key}" >&2
      exit 1
    fi
    [[ ! -v "old_values[${key}]" ]] || {
      printf 'Private owner-input has a duplicate key %s.\n' "${key}" >&2
      exit 1
    }
    old_values["${key}"]="${value}"
  done < "${input}"
}
parse_private_input

now="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
window_start="$(date -u -d '1 minute ago' '+%Y-%m-%dT%H:%M:%SZ')"
window_end="$(date -u -d "+${duration_minutes} minutes" '+%Y-%m-%dT%H:%M:%SZ')"
timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
backup="${input}.pre-v1.${timestamp}"
lock_file="${input}.lock"
tmp_file=""

exec 9>"${lock_file}"
chmod 600 "${lock_file}"
flock -n 9 || {
  printf 'Another owner-input update is in progress.\n' >&2
  exit 1
}

tmp_file="$(mktemp "${input}.tmp.XXXXXX")"
cleanup() {
  [[ -z "${tmp_file}" || ! -e "${tmp_file}" ]] || rm -f -- "${tmp_file}"
}
trap cleanup EXIT
chmod 600 "${tmp_file}"

locked_value() {
  case "$1" in
    INPUT_VERSION) printf '%s' 'portal.execution-d1.owner-input.v1' ;;
    OWNER|ROLLBACK_OWNER) printf '%s' "${owner}" ;;
    OWNER_CONFIRMED_AT_UTC) printf '%s' "${now}" ;;
    D1_AUTHORIZED) printf '%s' 'true' ;;
    D1_CHANGE_WINDOW_START_UTC) printf '%s' "${window_start}" ;;
    D1_CHANGE_WINDOW_END_UTC) printf '%s' "${window_end}" ;;
    SGP_PROVIDER) printf '%s' 'digitalocean' ;;
    SGP_REGION) printf '%s' 'sgp1' ;;
    SGP_PUBLIC_IP_CONFIRMED_STATIC|WG_VALUES_APPROVED|PORTAL_NETWORK_VALUES_APPROVED|IDENTITY_DECISIONS_APPROVED)
      printf '%s' 'true'
      ;;
    AWS_REGION) printf '%s' 'ap-east-1' ;;
    AWS_SG_CHANGE_MODE) printf '%s' 'OWNER_MANUAL' ;;
    WG_CIDR) printf '%s' '10.70.0.0/30' ;;
    WG_AWS_IP) printf '%s' "${old_values[WG_AWS_IP]:-10.70.0.2}" | sed 's#/.*##' ;;
    WG_SGP_IP) printf '%s' "${old_values[WG_SGP_IP]:-10.70.0.1}" | sed 's#/.*##' ;;
    WG_UDP_PORT) printf '%s' '51820' ;;
    EDGE_PRIVATE_PORT) printf '%s' '8443' ;;
    EDGE_TLS_IDENTITY) printf '%s' 'spiffe://primusspark/portal/execution-edge/paper' ;;
    PORTAL_BRIDGE_CIDR) printf '%s' '172.23.0.0/24' ;;
    SOURCE_PROXY_PRIVATE_PORT) printf '%s' '8444' ;;
    FIRST_SOURCE_SCOPE) printf '%s' 'PAPER_BINANCE_USDM' ;;
    PKI_MODE) printf '%s' 'PRIVATE_OFFLINE_ROOT_SEPARATE_INTERMEDIATES' ;;
    JWT_ISSUER) printf '%s' 'portal-control-api' ;;
    JWT_AUDIENCE) printf '%s' 'portal-execution-edge-paper' ;;
    JWT_MAX_TTL_SECONDS) printf '%s' '60' ;;
    ALLOW_TRADING_SYSTEM_CHANGES|ALLOW_TRADING_SYSTEM_DB_REDIS_CLI|ALLOW_COMMANDS|ALLOW_LIVE|ALLOW_DELIVERY_PROFILE_ACTIVATION)
      printf '%s' 'false'
      ;;
    *) return 1 ;;
  esac
}

while IFS= read -r raw || [[ -n "${raw}" ]]; do
  if [[ "${raw}" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]]; then
    key="${BASH_REMATCH[1]}"
    if value="$(locked_value "${key}")"; then
      printf '%s=%s\n' "${key}" "${value}" >> "${tmp_file}"
    else
      printf '%s=%s\n' "${key}" "${old_values[${key}]:-${BASH_REMATCH[2]}}" >> "${tmp_file}"
    fi
  else
    printf '%s\n' "${raw}" >> "${tmp_file}"
  fi
done < "${template}"

install -m 600 "${input}" "${backup}"
mv -f -- "${tmp_file}" "${input}"
tmp_file=""
chmod 600 "${input}"

printf 'D1 owner input migrated atomically; prior revision retained mode 0600.\n'
printf 'D1 change window opened for %s minutes; no host/network state changed.\n' "${duration_minutes}"
