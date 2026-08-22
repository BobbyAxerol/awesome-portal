#!/usr/bin/env bash
# Read-only EX-BE-02-LIVE D1 decision and host preflight. This script never
# sources owner input, never prints values, and never mutates host/cloud state.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_INPUT="${ROOT_DIR}/deploy/execution-d1/owner-input.env.example"

usage() {
  cat <<'EOF'
Usage: execution-d1-preflight.sh [--input FILE] [--mode template|readiness|production] [--cell none|sgp|aws]

template    Validate tracked defaults and safety locks; D1_AUTHORIZED must be false.
readiness   Require owner authorization/change window and D1 network decisions.
production  Add the deferred AWS control-plane IDs and D2/operations decisions.

--cell runs additional read-only local route/port/tool checks. It never installs,
starts, stops, renders or writes anything. Values are reported only as SET/MISSING.
EOF
}

input_file="${DEFAULT_INPUT}"
mode="template"
cell="none"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --input)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      input_file="$2"
      shift 2
      ;;
    --mode)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      mode="$2"
      shift 2
      ;;
    --cell)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      cell="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

case "${mode}" in template|readiness|production) ;; *) printf 'Invalid mode.\n' >&2; exit 2 ;; esac
case "${cell}" in none|sgp|aws) ;; *) printf 'Invalid cell.\n' >&2; exit 2 ;; esac
[[ -f "${input_file}" && -r "${input_file}" ]] || {
  printf 'Owner input is not a readable regular file.\n' >&2
  exit 1
}

if [[ "${mode}" != "template" ]]; then
  input_mode="$(stat -c '%a' "${input_file}" 2>/dev/null || true)"
  if [[ ! "${input_mode}" =~ ^[0-7]{3,4}$ ]] || (( (8#${input_mode} & 8#077) != 0 )); then
    printf 'Owner input must have no group/world permission bits.\n' >&2
    exit 1
  fi
fi

declare -A allowed=()
declare -A values=()
keys=(
  INPUT_VERSION OWNER OWNER_CONFIRMED_AT_UTC D1_AUTHORIZED
  D1_CHANGE_WINDOW_START_UTC D1_CHANGE_WINDOW_END_UTC ROLLBACK_OWNER
  SGP_PROVIDER SGP_REGION SGP_STABLE_PUBLIC_IP SGP_RESERVED_IP
  SGP_PUBLIC_IP_CONFIRMED_STATIC SGP_CLOUD_FIREWALL
  AWS_SSH_HOST AWS_SSH_PORT AWS_SSH_USER AWS_SSH_ED25519_FINGERPRINT
  AWS_REGION AWS_INSTANCE_ID AWS_PUBLIC_IPV4 AWS_ELASTIC_IP
  AWS_EIP_ALLOCATION_ID AWS_SECURITY_GROUP_ID AWS_VPC_ID AWS_SUBNET_ID
  AWS_ROUTE_TABLE_ID AWS_SG_CHANGE_MODE
  WG_CIDR WG_AWS_IP WG_SGP_IP WG_UDP_PORT WG_VALUES_APPROVED
  EDGE_PRIVATE_PORT EDGE_PRIVATE_DNS EDGE_TLS_IDENTITY PORTAL_BRIDGE_CIDR
  SOURCE_PROXY_PRIVATE_PORT PORTAL_NETWORK_VALUES_APPROVED
  FIRST_SOURCE_SCOPE FIRST_SOURCE_SCOPE_APPROVED TRADING_SYSTEM_READ_IDENTITY_OWNER
  PROJECTION_DB_MODE PROJECTION_DB_REGION PROJECTION_INITIAL_STORAGE_GB
  PROJECTION_PITR_RETENTION_DAYS PROJECTION_RPO_MINUTES PROJECTION_RTO_MINUTES
  PROJECTION_DB_DECISION_APPROVED PKI_MODE PKI_OWNER AWS_SECRET_DELIVERY
  SGP_SECRET_DELIVERY JWT_ISSUER JWT_AUDIENCE JWT_MAX_TTL_SECONDS
  IDENTITY_DECISIONS_APPROVED AWS_OOM_IO_REVIEW_OWNER D2_RESOURCE_BUDGET_APPROVED
  OBSERVABILITY_DESTINATION OBSERVABILITY_OWNER BACKUP_OWNER
  ALLOW_TRADING_SYSTEM_CHANGES ALLOW_TRADING_SYSTEM_DB_REDIS_CLI
  ALLOW_COMMANDS ALLOW_LIVE ALLOW_DELIVERY_PROFILE_ACTIVATION
)
for key in "${keys[@]}"; do allowed["${key}"]=1; done

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

line_number=0
while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
  line_number=$((line_number + 1))
  line="$(trim "${raw_line}")"
  [[ -z "${line}" || "${line}" == \#* ]] && continue
  if [[ ! "${line}" =~ ^([A-Z][A-Z0-9_]*)=(.*)$ ]]; then
    printf 'Invalid owner-input syntax at line %d.\n' "${line_number}" >&2
    exit 1
  fi
  key="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"
  [[ -n "${allowed[${key}]:-}" ]] || {
    printf 'Unknown owner-input key at line %d: %s\n' "${line_number}" "${key}" >&2
    exit 1
  }
  [[ ! -v "values[${key}]" ]] || {
    printf 'Duplicate owner-input key: %s\n' "${key}" >&2
    exit 1
  }
  # Input is intentionally a restricted data file, not shell syntax.
  if [[ "${value}" == *'$('* || "${value}" == *'${'* || "${value}" == *'`'* ||
        "${value}" == *"'"* || "${value}" == *'"'* ||
        ! "${value}" =~ ^[A-Za-z0-9._:/,@+\ -]*$ ]]; then
    printf 'Unsafe or unsupported value syntax for key: %s\n' "${key}" >&2
    exit 1
  fi
  values["${key}"]="${value}"
done < "${input_file}"

errors=0
warnings=0
error() { printf 'ERROR  %s\n' "$1" >&2; errors=$((errors + 1)); }
warn() { printf 'WARN   %s\n' "$1"; warnings=$((warnings + 1)); }
pass() { printf 'PASS   %s\n' "$1"; }

for key in "${keys[@]}"; do
  [[ -v "values[${key}]" ]] || error "missing schema key ${key}"
done
if (( errors > 0 )); then
  printf 'D1 preflight failed before value validation: %d error(s).\n' "${errors}" >&2
  exit 1
fi

is_true() { [[ "${values[$1]}" == "true" ]]; }
is_false() { [[ "${values[$1]}" == "false" ]]; }
require_set() { [[ -n "${values[$1]}" ]] || error "$1 is MISSING"; }
require_true() { is_true "$1" || error "$1 must be true"; }
require_false() { is_false "$1" || error "$1 must be false"; }
require_exact() { [[ "${values[$1]}" == "$2" ]] || error "$1 is outside the locked value"; }
require_integer_range() {
  local key="$1" minimum="$2" maximum="$3" value="${values[$1]}"
  if [[ ! "${value}" =~ ^[0-9]+$ ]] || (( 10#${value} < minimum || 10#${value} > maximum )); then
    error "$key is outside ${minimum}..${maximum}"
  fi
}

require_exact INPUT_VERSION portal.execution-d1.owner-input.v1
for key in D1_AUTHORIZED SGP_PUBLIC_IP_CONFIRMED_STATIC WG_VALUES_APPROVED \
  PORTAL_NETWORK_VALUES_APPROVED FIRST_SOURCE_SCOPE_APPROVED \
  PROJECTION_DB_DECISION_APPROVED IDENTITY_DECISIONS_APPROVED \
  D2_RESOURCE_BUDGET_APPROVED ALLOW_TRADING_SYSTEM_CHANGES \
  ALLOW_TRADING_SYSTEM_DB_REDIS_CLI ALLOW_COMMANDS ALLOW_LIVE \
  ALLOW_DELIVERY_PROFILE_ACTIVATION; do
  [[ "${values[${key}]}" == "true" || "${values[${key}]}" == "false" ]] ||
    error "$key must be true or false"
done

require_false ALLOW_TRADING_SYSTEM_CHANGES
require_false ALLOW_TRADING_SYSTEM_DB_REDIS_CLI
require_false ALLOW_COMMANDS
require_false ALLOW_LIVE
require_false ALLOW_DELIVERY_PROFILE_ACTIVATION
require_exact SGP_PROVIDER digitalocean
require_exact SGP_REGION sgp1
require_exact AWS_REGION ap-east-1
require_exact AWS_SG_CHANGE_MODE OWNER_MANUAL
require_exact FIRST_SOURCE_SCOPE PAPER_BINANCE_USDM
require_exact EDGE_PRIVATE_PORT 8443
require_exact SOURCE_PROXY_PRIVATE_PORT 8444
require_exact EDGE_TLS_IDENTITY spiffe://primusspark/portal/execution-edge/paper
require_exact PKI_MODE PRIVATE_OFFLINE_ROOT_SEPARATE_INTERMEDIATES
require_exact JWT_ISSUER portal-control-api
require_exact JWT_AUDIENCE portal-execution-edge-paper
require_integer_range AWS_SSH_PORT 1 65535
require_integer_range WG_UDP_PORT 1 65535
require_integer_range JWT_MAX_TTL_SECONDS 1 60

command -v python3 >/dev/null 2>&1 || error "python3 is required for CIDR validation"
if command -v python3 >/dev/null 2>&1; then
  if ! python3 - "${values[WG_CIDR]}" "${values[WG_SGP_IP]}" \
      "${values[WG_AWS_IP]}" "${values[PORTAL_BRIDGE_CIDR]}" 2>/dev/null <<'PY'
import ipaddress
import sys

wg = ipaddress.ip_network(sys.argv[1], strict=True)
sgp = ipaddress.ip_address(sys.argv[2])
aws = ipaddress.ip_address(sys.argv[3])
bridge = ipaddress.ip_network(sys.argv[4], strict=True)
if wg.version != 4 or wg.prefixlen != 30:
    raise SystemExit("WireGuard network must be an IPv4 /30")
if sgp not in wg or aws not in wg or sgp == aws or sgp in (wg.network_address, wg.broadcast_address) or aws in (wg.network_address, wg.broadcast_address):
    raise SystemExit("peer addresses must be distinct usable addresses inside the /30")
if bridge.version != 4 or not bridge.is_private or wg.overlaps(bridge):
    raise SystemExit("Portal bridge must be private IPv4 and not overlap WireGuard")
PY
  then
    error "CIDR/address relationship is invalid"
  else
    pass "candidate WireGuard/bridge address model is valid"
  fi
fi

asset_root="${ROOT_DIR}/deploy/execution-d1"
required_assets=(
  owner-input.env.example
  wireguard/portal0.sgp.conf.template
  wireguard/portal0.aws.conf.template
  pki/openssl-workload-profiles.cnf.template
  pki/identity-inventory.md
  source-proxy/nginx.conf.template
  source-proxy/trading-system-read-header.conf.example
  edge-source-proxy.env.example
  compose.dark.yaml
)
for asset in "${required_assets[@]}"; do
  [[ -f "${asset_root}/${asset}" ]] || error "missing D1 asset ${asset}"
done

if grep -R -E -n --exclude='*.example' \
    'BEGIN ([A-Z0-9]+ )?PRIVATE KEY|^[[:space:]]*PrivateKey[[:space:]]*=[[:space:]]*[A-Za-z0-9+/]{20,}' \
    "${asset_root}" >/dev/null 2>&1; then
  error "tracked D1 assets contain private-key-shaped material"
else
  pass "tracked D1 assets contain no private-key-shaped material"
fi

proxy_template="${asset_root}/source-proxy/nginx.conf.template"
for path in contracts health health/capabilities orders fills positions events; do
  grep -Fq "location = /v1/${path}" "${proxy_template}" || error "Source Proxy is missing exact /v1/${path} allowlist"
done
if [[ "$(grep -c 'include /run/secrets/trading-system-read-header.conf;' "${proxy_template}")" -ne 4 ]]; then
  error "Source Proxy must inject the TS read identity on exactly four alpha routes"
else
  pass "Source Proxy credential injection is limited to four alpha routes"
fi
grep -Fq 'listen __PORTAL_BRIDGE_GATEWAY_IP__:__SOURCE_PROXY_PRIVATE_PORT__ ssl;' "${proxy_template}" ||
  error "Source Proxy listener is not bridge-bound"
if grep -Eq 'listen[[:space:]]+(0\.0\.0\.0|\[::\]|80|443)(:|[[:space:];])' "${proxy_template}"; then
  error "Source Proxy template contains a public/wildcard listener"
fi

if [[ "${mode}" == "template" ]]; then
  require_false D1_AUTHORIZED
  pass "template mode keeps D1 unauthorized"
else
  for key in OWNER OWNER_CONFIRMED_AT_UTC D1_CHANGE_WINDOW_START_UTC \
    D1_CHANGE_WINDOW_END_UTC ROLLBACK_OWNER SGP_STABLE_PUBLIC_IP \
    SGP_CLOUD_FIREWALL AWS_SSH_HOST AWS_SSH_ED25519_FINGERPRINT \
    AWS_INSTANCE_ID AWS_PUBLIC_IPV4 AWS_ELASTIC_IP AWS_SECURITY_GROUP_ID \
    AWS_VPC_ID AWS_SUBNET_ID PKI_OWNER; do
    require_set "${key}"
  done
  require_true D1_AUTHORIZED
  require_true SGP_PUBLIC_IP_CONFIRMED_STATIC
  require_true WG_VALUES_APPROVED
  require_true PORTAL_NETWORK_VALUES_APPROVED
  require_true IDENTITY_DECISIONS_APPROVED
  pass "D1 owner/network/identity decision gates are declared"

  if [[ "${values[AWS_SSH_HOST]}" != "${values[AWS_ELASTIC_IP]}" ||
        "${values[AWS_PUBLIC_IPV4]}" != "${values[AWS_ELASTIC_IP]}" ]]; then
    error "AWS SSH/current public IPv4 must identify the approved Elastic IP"
  fi
  [[ "${values[AWS_INSTANCE_ID]}" =~ ^i-[0-9a-f]{8,17}$ ]] ||
    error "AWS_INSTANCE_ID is malformed"
  [[ "${values[AWS_SECURITY_GROUP_ID]}" =~ ^sg-[0-9a-f]{8,17}$ ]] ||
    error "AWS_SECURITY_GROUP_ID is malformed"
  [[ "${values[AWS_VPC_ID]}" =~ ^vpc-[0-9a-f]{8,17}$ ]] ||
    error "AWS_VPC_ID is malformed"
  [[ "${values[AWS_SUBNET_ID]}" =~ ^subnet-[0-9a-f]{8,17}$ ]] ||
    error "AWS_SUBNET_ID is malformed"
  [[ "${values[AWS_SSH_ED25519_FINGERPRINT]}" =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]] ||
    error "AWS SSH Ed25519 fingerprint is malformed"

  if ! python3 - "${values[OWNER_CONFIRMED_AT_UTC]}" \
      "${values[D1_CHANGE_WINDOW_START_UTC]}" \
      "${values[D1_CHANGE_WINDOW_END_UTC]}" \
      "${values[SGP_STABLE_PUBLIC_IP]}" "${values[AWS_ELASTIC_IP]}" \
      2>/dev/null <<'PY'
from datetime import datetime, timezone
import ipaddress
import sys

def timestamp(raw: str) -> datetime:
    if not raw.endswith("Z"):
        raise ValueError("UTC timestamps must end in Z")
    return datetime.fromisoformat(raw[:-1] + "+00:00")

confirmed, start, end = map(timestamp, sys.argv[1:4])
now = datetime.now(timezone.utc)
if confirmed > now:
    raise ValueError("owner confirmation cannot be in the future")
if not start <= now <= end:
    raise ValueError("preflight must run inside the approved change window")
if end <= start or (end - start).total_seconds() > 4 * 60 * 60:
    raise ValueError("change window must be positive and no longer than four hours")
sgp = ipaddress.ip_address(sys.argv[4])
aws = ipaddress.ip_address(sys.argv[5])
if sgp.version != 4 or aws.version != 4 or sgp == aws:
    raise ValueError("carrier endpoints must be distinct IPv4 addresses")
for address in (sgp, aws):
    if address.is_unspecified or address.is_loopback or address.is_multicast:
        raise ValueError("carrier endpoint is not usable")
PY
  then
    error "change-window or carrier-endpoint validation failed"
  else
    pass "change window and carrier endpoint structure are valid"
  fi

  if [[ -z "${values[AWS_EIP_ALLOCATION_ID]}" ]]; then
    warn "AWS_EIP_ALLOCATION_ID deferred; require it at the production metadata stop-gate"
  fi
  if [[ -z "${values[AWS_ROUTE_TABLE_ID]}" ]]; then
    warn "AWS_ROUTE_TABLE_ID deferred; require it at the production route-proof stop-gate"
  fi
fi

if [[ "${mode}" == "production" ]]; then
  for key in AWS_EIP_ALLOCATION_ID AWS_ROUTE_TABLE_ID AWS_OOM_IO_REVIEW_OWNER \
    OBSERVABILITY_DESTINATION OBSERVABILITY_OWNER BACKUP_OWNER \
    PROJECTION_RPO_MINUTES PROJECTION_RTO_MINUTES; do
    require_set "${key}"
  done
  require_true FIRST_SOURCE_SCOPE_APPROVED
  require_true PROJECTION_DB_DECISION_APPROVED
  require_true D2_RESOURCE_BUDGET_APPROVED
  pass "production metadata, resource, database and operations stop-gates are declared"
fi

local_route_conflict() {
  command -v ip >/dev/null 2>&1 || { warn "ip command unavailable; local route conflict not checked"; return; }
  local routes
  routes="$(ip -o -4 route show 2>/dev/null || true)"
  if [[ -z "${routes}" ]]; then
    warn "local IPv4 route inventory unavailable"
    return
  fi
  if python3 - "${values[WG_CIDR]}" "${values[PORTAL_BRIDGE_CIDR]}" \
      "${routes}" 2>/dev/null <<'PY'
import ipaddress
import re
import sys

candidates = [ipaddress.ip_network(sys.argv[1]), ipaddress.ip_network(sys.argv[2])]
for token in re.findall(r"(?:\d{1,3}\.){3}\d{1,3}(?:/\d{1,2})?", sys.argv[3]):
    try:
        route = ipaddress.ip_network(token, strict=False)
    except ValueError:
        continue
    if route.prefixlen == 0:
        continue
    if any(route.overlaps(candidate) for candidate in candidates):
        raise SystemExit(1)
PY
  then
    pass "local routes do not overlap candidate D1 networks"
  else
    error "local route overlaps a candidate D1 network"
  fi
}

port_is_free() {
  local protocol="$1" port="$2" label="$3"
  command -v ss >/dev/null 2>&1 || { warn "ss unavailable; ${label} not checked"; return; }
  local flags="-H-ln${protocol}"
  if ss "${flags}" 2>/dev/null | awk '{print $5}' | grep -Eq "(^|[.:])${port}$"; then
    error "${label} is already listening"
  else
    pass "${label} is not listening"
  fi
}

if [[ "${cell}" != "none" ]]; then
  local_route_conflict
  if command -v wg >/dev/null 2>&1 && command -v wg-quick >/dev/null 2>&1; then
    pass "WireGuard userspace tools are installed"
  else
    warn "WireGuard userspace tools are absent; D1b must install pinned wireguard-tools"
  fi
  if [[ "${cell}" == "aws" ]]; then
    port_is_free u "${values[WG_UDP_PORT]}" "AWS WireGuard UDP port"
    port_is_free t "${values[EDGE_PRIVATE_PORT]}" "AWS private Edge TCP port"
    port_is_free t "${values[SOURCE_PROXY_PRIVATE_PORT]}" "AWS Source Proxy TCP port"
  fi
fi

if (( errors > 0 )); then
  printf 'D1 preflight FAILED: %d error(s), %d warning(s). No state changed.\n' "${errors}" "${warnings}" >&2
  exit 1
fi
printf 'D1 preflight PASSED (%s/%s): %d warning(s). No state changed.\n' "${mode}" "${cell}" "${warnings}"
