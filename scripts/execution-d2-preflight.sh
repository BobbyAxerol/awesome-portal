#!/usr/bin/env bash
# Read-only D2 input/secret/config validator. It never sources the env file,
# contacts AWS/Trading System, pulls an image or starts a container.
set -euo pipefail

usage() {
  printf 'Usage: %s --env-file PATH --mode template|offline|readiness\n' "$0" >&2
  exit 2
}

env_file=""
mode=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) [[ $# -ge 2 ]] || usage; env_file="$2"; shift 2 ;;
    --mode) [[ $# -ge 2 ]] || usage; mode="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -n "${env_file}" && -f "${env_file}" ]] || usage
[[ "${mode}" =~ ^(template|offline|readiness)$ ]] || usage

declare -A values=()
allowed_keys=' PORTAL_EXECUTION_EDGE_IMAGE PORTAL_SOURCE_PROXY_IMAGE PORTAL_RUNTIME_GID EDGE_PRIVATE_BIND_IP EDGE_SECRET_DIRECTORY SOURCE_PROXY_SECRET_DIRECTORY SOURCE_PROXY_CONFIG_FILE PORTAL_BRIDGE_CIDR PORTAL_BRIDGE_GATEWAY_IP SOURCE_PROXY_PRIVATE_PORT EDGE_ENVIRONMENT EDGE_DELEGATION_ISSUER EDGE_DELEGATION_AUDIENCE EDGE_SOURCE_ORIGIN EDGE_SOURCE_GATEWAY_DIGEST EDGE_SOURCE_CLIENT_IDENTITY_FILE EDGE_SOURCE_API_KEY_FILE EDGE_PROBE_ALPHA_ID EDGE_PROJECTION_INGESTION_ENABLED EDGE_REALTIME_SSE_ENABLED EDGE_ANALYTICS_QUERY_ENABLED EDGE_ANALYTICS_SOURCE_PROFILE EDGE_COMMAND_RELAY_ENABLED '

while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line}" || "${line}" == \#* ]] && continue
  [[ "${line}" =~ ^([A-Z][A-Z0-9_]*)=([A-Za-z0-9_./:@-]*)$ ]] || {
    printf 'D2 preflight rejected an unsafe or malformed env line.\n' >&2
    exit 1
  }
  key="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"
  [[ "${allowed_keys}" == *" ${key} "* ]] || {
    printf 'D2 preflight rejected an unknown env key: %s\n' "${key}" >&2
    exit 1
  }
  [[ ! -v "values[${key}]" ]] || {
    printf 'D2 preflight rejected a duplicate env key: %s\n' "${key}" >&2
    exit 1
  }
  values["${key}"]="${value}"
done < "${env_file}"

required=(
  PORTAL_EXECUTION_EDGE_IMAGE PORTAL_SOURCE_PROXY_IMAGE PORTAL_RUNTIME_GID
  EDGE_PRIVATE_BIND_IP EDGE_SECRET_DIRECTORY SOURCE_PROXY_SECRET_DIRECTORY
  SOURCE_PROXY_CONFIG_FILE PORTAL_BRIDGE_CIDR PORTAL_BRIDGE_GATEWAY_IP
  SOURCE_PROXY_PRIVATE_PORT EDGE_ENVIRONMENT EDGE_DELEGATION_ISSUER
  EDGE_DELEGATION_AUDIENCE EDGE_SOURCE_ORIGIN EDGE_SOURCE_GATEWAY_DIGEST
  EDGE_SOURCE_CLIENT_IDENTITY_FILE EDGE_SOURCE_API_KEY_FILE
  EDGE_PROJECTION_INGESTION_ENABLED EDGE_REALTIME_SSE_ENABLED
  EDGE_ANALYTICS_QUERY_ENABLED EDGE_ANALYTICS_SOURCE_PROFILE EDGE_COMMAND_RELAY_ENABLED
)
for key in "${required[@]}"; do
  [[ -n "${values[${key}]:-}" ]] || {
    printf 'D2 preflight missing required key: %s\n' "${key}" >&2
    exit 1
  }
done

image_pattern='^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$'
for key in PORTAL_EXECUTION_EDGE_IMAGE PORTAL_SOURCE_PROXY_IMAGE; do
  [[ "${values[${key}]}" =~ ${image_pattern} ]] || {
    printf 'D2 preflight requires an immutable GHCR digest for %s.\n' "${key}" >&2
    exit 1
  }
done
[[ "${values[EDGE_SOURCE_GATEWAY_DIGEST]}" =~ ^sha256:[a-f0-9]{64}$ ]] || {
  printf 'D2 preflight requires the full observed source gateway digest.\n' >&2
  exit 1
}
[[ "${values[PORTAL_RUNTIME_GID]}" =~ ^[1-9][0-9]{1,8}$ ]] || {
  printf 'D2 preflight requires a positive numeric portal-runtime GID.\n' >&2
  exit 1
}
[[ "${values[SOURCE_PROXY_PRIVATE_PORT]}" =~ ^[0-9]{4,5}$ ]] || {
  printf 'D2 preflight rejected the Source Proxy port.\n' >&2
  exit 1
}
private_port="${values[SOURCE_PROXY_PRIVATE_PORT]}"
(( private_port >= 1024 && private_port <= 65535 )) || {
  printf 'D2 preflight requires an unprivileged Source Proxy port.\n' >&2
  exit 1
}

python3 - "${values[EDGE_PRIVATE_BIND_IP]}" "${values[PORTAL_BRIDGE_CIDR]}" \
  "${values[PORTAL_BRIDGE_GATEWAY_IP]}" <<'PY'
import ipaddress
import sys

try:
    edge = ipaddress.ip_address(sys.argv[1])
    bridge = ipaddress.ip_network(sys.argv[2], strict=True)
    gateway = ipaddress.ip_address(sys.argv[3])
except ValueError:
    raise SystemExit("D2 preflight rejected malformed private network metadata.")
if not edge.is_private or not gateway.is_private:
    raise SystemExit("D2 preflight requires private listener addresses.")
if gateway not in bridge or edge in bridge:
    raise SystemExit("D2 preflight rejected the edge/bridge address relationship.")
if gateway in (bridge.network_address, bridge.broadcast_address):
    raise SystemExit("D2 preflight rejected a non-host bridge gateway.")
PY

[[ "${values[EDGE_SOURCE_ORIGIN]}" == "https://${values[PORTAL_BRIDGE_GATEWAY_IP]}:${values[SOURCE_PROXY_PRIVATE_PORT]}" ]] || {
  printf 'D2 preflight requires Edge to target the exact private Source Proxy origin.\n' >&2
  exit 1
}
[[ "${values[EDGE_ENVIRONMENT]}" == paper ]] || {
  printf 'D2 preflight is locked to the first Paper scope.\n' >&2
  exit 1
}
[[ "${values[EDGE_PROJECTION_INGESTION_ENABLED]}" == false &&
   "${values[EDGE_REALTIME_SSE_ENABLED]}" == false &&
   "${values[EDGE_ANALYTICS_QUERY_ENABLED]}" == false &&
   "${values[EDGE_COMMAND_RELAY_ENABLED]}" == false &&
   "${values[EDGE_ANALYTICS_SOURCE_PROFILE]}" == fixture ]] || {
  printf 'D2 preflight rejected a non-dark runtime capability.\n' >&2
  exit 1
}
[[ "${values[EDGE_SOURCE_CLIENT_IDENTITY_FILE]}" == /run/secrets/source-proxy-client.pem &&
   "${values[EDGE_SOURCE_API_KEY_FILE]}" == /run/secrets/source-proxy-admission-token ]] || {
  printf 'D2 preflight rejected a source identity path outside the Edge secret mount.\n' >&2
  exit 1
}
for key in EDGE_SECRET_DIRECTORY SOURCE_PROXY_SECRET_DIRECTORY SOURCE_PROXY_CONFIG_FILE; do
  [[ "${values[${key}]}" == /* && "${values[${key}]}" != *'/../'* ]] || {
    printf 'D2 preflight rejected a non-absolute or traversing runtime path.\n' >&2
    exit 1
  }
done
if [[ "${mode}" == readiness ]]; then
  for key in EDGE_SECRET_DIRECTORY SOURCE_PROXY_SECRET_DIRECTORY SOURCE_PROXY_CONFIG_FILE; do
    [[ "${values[${key}]}" == /srv/primus/portal/* ]] || {
      printf 'D2 readiness rejected a runtime path outside /srv/primus/portal.\n' >&2
      exit 1
    }
  done
fi

zero_digest='sha256:0000000000000000000000000000000000000000000000000000000000000000'
if [[ "${mode}" != template ]]; then
  [[ "${values[PORTAL_EXECUTION_EDGE_IMAGE]}" != *@"${zero_digest}" &&
     "${values[PORTAL_SOURCE_PROXY_IMAGE]}" != *@"${zero_digest}" &&
     "${values[EDGE_SOURCE_GATEWAY_DIGEST]}" != "${zero_digest}" ]] || {
    printf 'D2 preflight rejected a template digest outside template mode.\n' >&2
    exit 1
  }

  check_directory() {
    local path="$1"
    [[ -d "${path}" && ! -L "${path}" ]] || {
      printf 'D2 preflight requires a real runtime directory.\n' >&2
      exit 1
    }
    [[ "$(stat -c '%a' "${path}")" == 750 && "$(stat -c '%g' "${path}")" == "${values[PORTAL_RUNTIME_GID]}" ]] || {
      printf 'D2 preflight rejected runtime directory mode or group.\n' >&2
      exit 1
    }
  }
  check_secret() {
    local path="$1" expected_mode="$2"
    [[ -f "${path}" && ! -L "${path}" && -s "${path}" ]] || {
      printf 'D2 preflight requires a regular non-symlink secret/config file.\n' >&2
      exit 1
    }
    [[ "$(stat -c '%a' "${path}")" == "${expected_mode}" && "$(stat -c '%g' "${path}")" == "${values[PORTAL_RUNTIME_GID]}" ]] || {
      printf 'D2 preflight rejected secret/config mode or group.\n' >&2
      exit 1
    }
  }

  check_directory "${values[EDGE_SECRET_DIRECTORY]}"
  check_directory "${values[SOURCE_PROXY_SECRET_DIRECTORY]}"
  check_secret "${values[SOURCE_PROXY_CONFIG_FILE]}" 640
  for file in edge-server.crt edge-server.key sgp-client-ca.crt control-api.jwks.json \
    source-proxy-ca.crt source-proxy-client.pem source-proxy-admission-token; do
    case "${file}" in *.crt|*.json) expected=644 ;; *) expected=640 ;; esac
    check_secret "${values[EDGE_SECRET_DIRECTORY]}/${file}" "${expected}"
  done
  for file in source-proxy-server.crt source-proxy-server.key projection-ingestor-ca.crt \
    trading-system-read-header.conf; do
    case "${file}" in *.crt) expected=644 ;; *) expected=640 ;; esac
    check_secret "${values[SOURCE_PROXY_SECRET_DIRECTORY]}/${file}" "${expected}"
  done

  edge_dir="${values[EDGE_SECRET_DIRECTORY]}"
  proxy_dir="${values[SOURCE_PROXY_SECRET_DIRECTORY]}"
  for certificate in \
    "${edge_dir}/edge-server.crt" \
    "${edge_dir}/sgp-client-ca.crt" \
    "${edge_dir}/source-proxy-ca.crt" \
    "${proxy_dir}/source-proxy-server.crt" \
    "${proxy_dir}/projection-ingestor-ca.crt"; do
    openssl x509 -in "${certificate}" -noout -checkend 86400 >/dev/null 2>&1 || {
      printf 'D2 preflight rejected an invalid or near-expiry certificate.\n' >&2
      exit 1
    }
  done
  for private_key in "${edge_dir}/edge-server.key" "${proxy_dir}/source-proxy-server.key"; do
    openssl pkey -in "${private_key}" -noout >/dev/null 2>&1 || {
      printf 'D2 preflight rejected an invalid workload private key.\n' >&2
      exit 1
    }
  done
  openssl x509 -in "${edge_dir}/source-proxy-client.pem" -noout -checkend 86400 >/dev/null 2>&1 &&
    openssl pkey -in "${edge_dir}/source-proxy-client.pem" -noout >/dev/null 2>&1 || {
      printf 'D2 preflight rejected the Source Proxy client identity bundle.\n' >&2
      exit 1
    }

  matches_key() {
    local certificate="$1" private_key="$2" cert_digest key_digest
    cert_digest="$(openssl x509 -in "${certificate}" -pubkey -noout 2>/dev/null |
      openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | cut -d' ' -f1)"
    key_digest="$(openssl pkey -in "${private_key}" -pubout -outform DER 2>/dev/null |
      sha256sum | cut -d' ' -f1)"
    [[ -n "${cert_digest}" && "${cert_digest}" == "${key_digest}" ]]
  }
  matches_key "${edge_dir}/edge-server.crt" "${edge_dir}/edge-server.key" || {
    printf 'D2 preflight rejected a mismatched Edge certificate/key.\n' >&2
    exit 1
  }
  matches_key "${proxy_dir}/source-proxy-server.crt" "${proxy_dir}/source-proxy-server.key" || {
    printf 'D2 preflight rejected a mismatched Source Proxy certificate/key.\n' >&2
    exit 1
  }
  matches_key "${edge_dir}/source-proxy-client.pem" "${edge_dir}/source-proxy-client.pem" || {
    printf 'D2 preflight rejected a mismatched Source Proxy client bundle.\n' >&2
    exit 1
  }
  openssl verify -CAfile "${edge_dir}/source-proxy-ca.crt" \
    "${proxy_dir}/source-proxy-server.crt" >/dev/null 2>&1 || {
      printf 'D2 preflight rejected the Source Proxy server trust chain.\n' >&2
      exit 1
    }
  openssl verify -CAfile "${proxy_dir}/projection-ingestor-ca.crt" \
    "${edge_dir}/source-proxy-client.pem" >/dev/null 2>&1 || {
      printf 'D2 preflight rejected the Source Proxy client trust chain.\n' >&2
      exit 1
    }

  key_fingerprints="$(
    for private_key in \
      "${edge_dir}/edge-server.key" \
      "${proxy_dir}/source-proxy-server.key" \
      "${edge_dir}/source-proxy-client.pem"; do
      openssl pkey -in "${private_key}" -pubout -outform DER 2>/dev/null |
        sha256sum | cut -d' ' -f1
    done
  )"
  [[ "$(sort -u <<<"${key_fingerprints}" | wc -l)" -eq 3 ]] || {
    printf 'D2 preflight rejected reused workload private key material.\n' >&2
    exit 1
  }

  python3 - "${edge_dir}/control-api.jwks.json" <<'PY'
import json
import sys

try:
    payload = json.load(open(sys.argv[1], encoding="utf-8"))
except (OSError, ValueError):
    raise SystemExit("D2 preflight rejected invalid JWKS JSON.")
keys = payload.get("keys") if isinstance(payload, dict) else None
if not isinstance(keys, list) or not keys:
    raise SystemExit("D2 preflight rejected an empty JWKS.")
for key in keys:
    if not isinstance(key, dict) or key.get("kty") != "RSA" or not all(
        isinstance(key.get(name), str) and key[name] for name in ("kid", "n", "e")
    ):
        raise SystemExit("D2 preflight rejected a non-RSA or incomplete JWKS key.")
PY

header_file="${proxy_dir}/trading-system-read-header.conf"
if [[ "$(wc -l < "${header_file}")" -ne 1 ]] ||
    ! grep -Eq '^proxy_set_header X-API-Key [A-Za-z0-9._~-]{16,256};$' "${header_file}"; then
    printf 'D2 preflight rejected a placeholder Trading System read identity.\n' >&2
    exit 1
  fi
  [[ "$(wc -c < "${edge_dir}/source-proxy-admission-token")" -ge 32 ]] || {
    printf 'D2 preflight rejected a short Source Proxy admission token.\n' >&2
    exit 1
  }
fi

if [[ "${mode}" == readiness ]]; then
  runtime_group="$(getent group portal-runtime 2>/dev/null || true)"
  [[ -n "${runtime_group}" ]] || {
    printf 'D2 readiness requires the portal-runtime system group.\n' >&2
    exit 1
  }
  [[ "$(cut -d: -f3 <<<"${runtime_group}")" == "${values[PORTAL_RUNTIME_GID]}" ]] || {
    printf 'D2 readiness rejected a portal-runtime GID mismatch.\n' >&2
    exit 1
  }
fi

printf 'D2 %s preflight PASSED. No network, source or runtime state changed.\n' "${mode}"
