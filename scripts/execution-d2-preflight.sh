#!/usr/bin/env bash
# Read-only D2 input/secret/config validator. It never sources the env file,
# contacts AWS/Trading System, pulls an image or starts a container.
set -euo pipefail

usage() {
  printf 'Usage: %s --env-file PATH --mode template|offline|readiness|probe-offline|probe-readiness|source-readiness|manager-offline|manager-readiness\n' "$0" >&2
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
[[ "${mode}" =~ ^(template|offline|readiness|probe-offline|probe-readiness|source-readiness|manager-offline|manager-readiness)$ ]] || usage
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
contract_lock="${root_dir}/services/portal-execution-edge-rs/contract-pack.lock.json"
if [[ "${mode}" != template ]]; then
  [[ ! -L "${env_file}" && "$(stat -c '%a' "${env_file}")" == 600 ]] || {
    printf 'Execution preflight requires a non-symlink mode-0600 env file.\n' >&2
    exit 1
  }
fi

declare -A values=()
allowed_keys=' PORTAL_EXECUTION_EDGE_IMAGE PORTAL_SOURCE_PROXY_IMAGE PORTAL_PROJECTION_POSTGRES_IMAGE PORTAL_RUNTIME_GID EDGE_PRIVATE_BIND_IP EDGE_SECRET_DIRECTORY SOURCE_PROXY_SECRET_DIRECTORY SOURCE_PROXY_CONFIG_FILE PORTAL_BRIDGE_CIDR PORTAL_BRIDGE_GATEWAY_IP SOURCE_PROXY_PRIVATE_PORT SOURCE_PROXY_SOURCE_MODE PROJECTION_DB_SECRET_DIRECTORY PROJECTION_DB_INIT_SCRIPT PROJECTION_DB_VOLUME_NAME PROJECTION_DB_CONTAINER_GID PROJECTION_DB_NAME PROJECTION_DB_OWNER_USER PROJECTION_DB_RUNTIME_USER EDGE_ENVIRONMENT EDGE_DELEGATION_ISSUER EDGE_DELEGATION_AUDIENCE EDGE_SOURCE_ORIGIN EDGE_SOURCE_GATEWAY_DIGEST EDGE_SOURCE_PROBES_ENABLED EDGE_SOURCE_CLIENT_IDENTITY_FILE EDGE_SOURCE_API_KEY_FILE EDGE_PROBE_ALPHA_ID EDGE_PROJECTION_INGESTION_ENABLED EDGE_REALTIME_SSE_ENABLED EDGE_ANALYTICS_QUERY_ENABLED EDGE_ANALYTICS_SOURCE_PROFILE EDGE_COMMAND_RELAY_ENABLED '

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
  PORTAL_EXECUTION_EDGE_IMAGE PORTAL_SOURCE_PROXY_IMAGE PORTAL_PROJECTION_POSTGRES_IMAGE PORTAL_RUNTIME_GID
  EDGE_PRIVATE_BIND_IP EDGE_SECRET_DIRECTORY SOURCE_PROXY_SECRET_DIRECTORY
  SOURCE_PROXY_CONFIG_FILE PORTAL_BRIDGE_CIDR PORTAL_BRIDGE_GATEWAY_IP
  SOURCE_PROXY_PRIVATE_PORT SOURCE_PROXY_SOURCE_MODE EDGE_ENVIRONMENT EDGE_DELEGATION_ISSUER
  PROJECTION_DB_SECRET_DIRECTORY PROJECTION_DB_INIT_SCRIPT PROJECTION_DB_VOLUME_NAME
  PROJECTION_DB_CONTAINER_GID PROJECTION_DB_NAME PROJECTION_DB_OWNER_USER
  PROJECTION_DB_RUNTIME_USER
  EDGE_DELEGATION_AUDIENCE EDGE_SOURCE_ORIGIN EDGE_SOURCE_GATEWAY_DIGEST
  EDGE_SOURCE_PROBES_ENABLED
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
[[ "${values[PORTAL_PROJECTION_POSTGRES_IMAGE]}" =~ ^docker\.io/library/postgres@sha256:[a-f0-9]{64}$ ]] || {
  printf 'D2 preflight requires an immutable official PostgreSQL digest.\n' >&2
  exit 1
}

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
if [[ "${mode}" != template ]]; then
  locked_gateway_prefix="$(python3 - "${contract_lock}" <<'PY'
import json
import pathlib
import re
import sys

path = pathlib.Path(sys.argv[1])
try:
    payload = json.loads(path.read_text(encoding="utf-8"))
except (OSError, ValueError) as exc:
    raise SystemExit("Execution preflight rejected an unreadable contract lock.") from exc
value = payload.get("runtime_gateway_digest_prefix")
if not isinstance(value, str) or not re.fullmatch(r"sha256:[a-f0-9]{12,64}", value):
    raise SystemExit("Execution preflight rejected an invalid gateway digest lock.")
print(value)
PY
)"
  [[ "${values[EDGE_SOURCE_GATEWAY_DIGEST]}" == "${locked_gateway_prefix}"* ]] || {
    printf 'Execution preflight rejected source gateway identity drift.\n' >&2
    exit 1
  }
fi
[[ "${values[PORTAL_RUNTIME_GID]}" =~ ^[1-9][0-9]{1,8}$ ]] || {
  printf 'D2 preflight requires a positive numeric portal-runtime GID.\n' >&2
  exit 1
}
[[ "${values[PROJECTION_DB_CONTAINER_GID]}" =~ ^[1-9][0-9]{0,8}$ ]] || {
  printf 'D2 preflight rejected the PostgreSQL container GID.\n' >&2
  exit 1
}
for key in PROJECTION_DB_NAME PROJECTION_DB_OWNER_USER PROJECTION_DB_RUNTIME_USER; do
  [[ "${values[${key}]}" =~ ^[a-z][a-z0-9_]{2,62}$ ]] || {
    printf 'D2 preflight rejected a projection database identifier.\n' >&2
    exit 1
  }
done
[[ "${values[PROJECTION_DB_OWNER_USER]}" != "${values[PROJECTION_DB_RUNTIME_USER]}" ]] || {
  printf 'D2 preflight requires separate projection owner/runtime roles.\n' >&2
  exit 1
}
[[ "${values[PROJECTION_DB_VOLUME_NAME]}" =~ ^portal-execution-projection-pgdata-v[1-9][0-9]*$ ]] || {
  printf 'D2 preflight rejected the versioned projection volume name.\n' >&2
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
case "${mode}" in
  manager-offline|manager-readiness)
    [[ "${values[SOURCE_PROXY_SOURCE_MODE]}" == manager-paper-read ]] || {
      printf 'Manager read readiness requires manager-paper-read mode.\n' >&2
      exit 1
    }
    ;;
  source-readiness)
    [[ "${values[SOURCE_PROXY_SOURCE_MODE]}" == paper-read ]] || {
      printf 'Source-read readiness requires paper-read mode.\n' >&2
      exit 1
    }
    ;;
  probe-offline|probe-readiness)
    [[ "${values[SOURCE_PROXY_SOURCE_MODE]}" == contract-probe ]] || {
      printf 'D3 probe readiness requires contract-probe mode.\n' >&2
      exit 1
    }
    ;;
  offline|readiness)
    [[ "${values[SOURCE_PROXY_SOURCE_MODE]}" == dark ]] || {
      printf 'D2 requires the Source Proxy to remain dark.\n' >&2
      exit 1
    }
    ;;
  template)
    [[ "${values[SOURCE_PROXY_SOURCE_MODE]}" =~ ^(dark|contract-probe|paper-read|manager-paper-read)$ ]] || {
      printf 'D2 template rejected the Source Proxy source mode.\n' >&2
      exit 1
    }
    ;;
esac
expected_source_probes=false
if [[ "${mode}" =~ ^(probe-offline|probe-readiness|source-readiness)$ ]]; then
  expected_source_probes=true
elif [[ "${mode}" == template && "${values[SOURCE_PROXY_SOURCE_MODE]}" =~ ^(contract-probe|paper-read)$ ]]; then
  expected_source_probes=true
fi
[[ "${values[EDGE_PROJECTION_INGESTION_ENABLED]}" == false &&
   "${values[EDGE_SOURCE_PROBES_ENABLED]}" == "${expected_source_probes}" &&
   "${values[EDGE_REALTIME_SSE_ENABLED]}" == false &&
   "${values[EDGE_ANALYTICS_QUERY_ENABLED]}" == false &&
   "${values[EDGE_COMMAND_RELAY_ENABLED]}" == false &&
   "${values[EDGE_ANALYTICS_SOURCE_PROFILE]}" == fixture ]] || {
  printf 'Execution preflight rejected a runtime capability outside the selected gate.\n' >&2
  exit 1
}
case "${mode}" in
  manager-offline|manager-readiness|probe-offline|probe-readiness|offline|readiness)
    [[ -z "${values[EDGE_PROBE_ALPHA_ID]:-}" ]] || {
      printf 'D2/D3 preflight forbids alpha-scoped source probes.\n' >&2
      exit 1
    }
    ;;
  source-readiness)
    [[ "${values[EDGE_PROBE_ALPHA_ID]:-}" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || {
      printf 'Source-read readiness requires one bounded alpha scope.\n' >&2
      exit 1
    }
    ;;
esac
[[ "${values[EDGE_SOURCE_CLIENT_IDENTITY_FILE]}" == /run/secrets/source-proxy-client.pem &&
   "${values[EDGE_SOURCE_API_KEY_FILE]}" == /run/secrets/source-proxy-admission-token ]] || {
  printf 'D2 preflight rejected a source identity path outside the Edge secret mount.\n' >&2
  exit 1
}
for key in EDGE_SECRET_DIRECTORY SOURCE_PROXY_SECRET_DIRECTORY SOURCE_PROXY_CONFIG_FILE \
  PROJECTION_DB_SECRET_DIRECTORY PROJECTION_DB_INIT_SCRIPT; do
  [[ "${values[${key}]}" == /* && "${values[${key}]}" != *'/../'* ]] || {
    printf 'D2 preflight rejected a non-absolute or traversing runtime path.\n' >&2
    exit 1
  }
done
if [[ "${mode}" =~ ^(readiness|probe-readiness|source-readiness|manager-readiness)$ ]]; then
  for key in EDGE_SECRET_DIRECTORY SOURCE_PROXY_SECRET_DIRECTORY SOURCE_PROXY_CONFIG_FILE \
    PROJECTION_DB_SECRET_DIRECTORY PROJECTION_DB_INIT_SCRIPT; do
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

  check_directory_group() {
    local path="$1" expected_gid="$2"
    [[ -d "${path}" && ! -L "${path}" ]] || {
      printf 'D2 preflight requires a real runtime directory.\n' >&2
      exit 1
    }
    [[ "$(stat -c '%a' "${path}")" == 750 && "$(stat -c '%g' "${path}")" == "${expected_gid}" ]] || {
      printf 'D2 preflight rejected runtime directory mode or group.\n' >&2
      exit 1
    }
  }
  check_secret_group() {
    local path="$1" expected_mode="$2" expected_gid="$3"
    [[ -f "${path}" && ! -L "${path}" && -s "${path}" ]] || {
      printf 'D2 preflight requires a regular non-symlink secret/config file.\n' >&2
      exit 1
    }
    [[ "$(stat -c '%a' "${path}")" == "${expected_mode}" && "$(stat -c '%g' "${path}")" == "${expected_gid}" ]] || {
      printf 'D2 preflight rejected secret/config mode or group.\n' >&2
      exit 1
    }
  }
  check_directory() { check_directory_group "$1" "${values[PORTAL_RUNTIME_GID]}"; }
  check_secret() { check_secret_group "$1" "$2" "${values[PORTAL_RUNTIME_GID]}"; }

  check_directory "${values[EDGE_SECRET_DIRECTORY]}"
  check_directory "${values[SOURCE_PROXY_SECRET_DIRECTORY]}"
  check_directory_group "${values[PROJECTION_DB_SECRET_DIRECTORY]}" \
    "${values[PROJECTION_DB_CONTAINER_GID]}"
  check_secret "${values[SOURCE_PROXY_CONFIG_FILE]}" 640
  expected_proxy_listener="        listen ${values[PORTAL_BRIDGE_GATEWAY_IP]}:${values[SOURCE_PROXY_PRIVATE_PORT]} ssl;"
  [[ "$(grep -Fxc "${expected_proxy_listener}" "${values[SOURCE_PROXY_CONFIG_FILE]}")" -eq 1 &&
     "$(grep -Ec '^[[:space:]]*listen[[:space:]]' "${values[SOURCE_PROXY_CONFIG_FILE]}")" -eq 1 ]] || {
    printf 'D2 preflight requires exactly one Source Proxy TLS/TCP listener.\n' >&2
    exit 1
  }
  if grep -Eiq '(^|[[:space:]])(quic|http3)([[:space:];]|$)|alt-svc' \
      "${values[SOURCE_PROXY_CONFIG_FILE]}"; then
    printf 'D2 preflight forbids QUIC, HTTP/3 and Alt-Svc on the Source Proxy.\n' >&2
    exit 1
  fi
  for file in edge-server.crt edge-server.key sgp-client-ca.crt control-api.jwks.json \
    source-proxy-ca.crt source-proxy-client.pem source-proxy-admission-token; do
    case "${file}" in *.crt|*.json) expected=644 ;; *) expected=640 ;; esac
    check_secret "${values[EDGE_SECRET_DIRECTORY]}/${file}" "${expected}"
  done
  check_secret "${values[EDGE_SECRET_DIRECTORY]}/projection-db-ca.crt" 644
  check_secret "${values[EDGE_SECRET_DIRECTORY]}/projection-database-url" 640
  check_secret "${values[EDGE_SECRET_DIRECTORY]}/projection-migration-database-url" 640
  for file in source-proxy-server.crt source-proxy-server.key projection-ingestor-ca.crt \
    trading-system-read-header.conf; do
    case "${file}" in *.crt) expected=644 ;; *) expected=640 ;; esac
    check_secret "${values[SOURCE_PROXY_SECRET_DIRECTORY]}/${file}" "${expected}"
  done
  if [[ "${values[SOURCE_PROXY_SOURCE_MODE]}" == manager-paper-read ]]; then
    check_secret "${values[SOURCE_PROXY_SECRET_DIRECTORY]}/manager-v2-locations.conf" 640
    check_secret "${values[SOURCE_PROXY_SECRET_DIRECTORY]}/manager-v2-client.pem" 640
    check_secret "${values[SOURCE_PROXY_SECRET_DIRECTORY]}/manager-v2-ca.crt" 644
  fi
  check_secret_group "${values[PROJECTION_DB_SECRET_DIRECTORY]}/projection-postgres.crt" \
    644 "${values[PROJECTION_DB_CONTAINER_GID]}"
  for file in projection-postgres.key postgres-bootstrap-password \
    projection-owner-password projection-runtime-password; do
    check_secret_group "${values[PROJECTION_DB_SECRET_DIRECTORY]}/${file}" 640 \
      "${values[PROJECTION_DB_CONTAINER_GID]}"
  done

  [[ -f "${values[PROJECTION_DB_INIT_SCRIPT]}" &&
     ! -L "${values[PROJECTION_DB_INIT_SCRIPT]}" &&
     -x "${values[PROJECTION_DB_INIT_SCRIPT]}" ]] || {
    printf 'D2 preflight rejected the projection bootstrap script.\n' >&2
    exit 1
  }
  bash -n "${values[PROJECTION_DB_INIT_SCRIPT]}"
  if [[ "${mode}" =~ ^(readiness|probe-readiness|source-readiness|manager-readiness)$ ]]; then
    [[ "$(stat -c '%u:%g:%a' "${values[PROJECTION_DB_INIT_SCRIPT]}")" == \
      "0:${values[PROJECTION_DB_CONTAINER_GID]}:550" ]] || {
      printf 'D2 readiness requires a root-owned immutable projection bootstrap script.\n' >&2
      exit 1
    }
  fi

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
  if [[ "${values[SOURCE_PROXY_SOURCE_MODE]}" == manager-paper-read ]]; then
    openssl x509 -in "${proxy_dir}/manager-v2-client.pem" -noout -checkend 86400 >/dev/null 2>&1 &&
      openssl pkey -in "${proxy_dir}/manager-v2-client.pem" -noout >/dev/null 2>&1 || {
        printf 'Manager read preflight rejected the Manager client identity bundle.\n' >&2
        exit 1
      }
  fi

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
  if [[ "${values[SOURCE_PROXY_SOURCE_MODE]}" == manager-paper-read ]]; then
    matches_key "${proxy_dir}/manager-v2-client.pem" "${proxy_dir}/manager-v2-client.pem" || {
      printf 'Manager read preflight rejected a mismatched Manager client bundle.\n' >&2
      exit 1
    }
  fi
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
  if [[ "${values[SOURCE_PROXY_SOURCE_MODE]}" == manager-paper-read ]]; then
    openssl verify -CAfile "${proxy_dir}/manager-v2-ca.crt" \
      "${proxy_dir}/manager-v2-client.pem" >/dev/null 2>&1 || {
        printf 'Manager read preflight rejected the Manager client trust chain.\n' >&2
        exit 1
      }
    openssl x509 -in "${proxy_dir}/manager-v2-client.pem" -noout -text 2>/dev/null |
      grep -Fq 'TLS Web Client Authentication' || {
        printf 'Manager read preflight requires a client-auth Manager leaf.\n' >&2
        exit 1
      }
  fi

  projection_dir="${values[PROJECTION_DB_SECRET_DIRECTORY]}"
  openssl x509 -in "${projection_dir}/projection-postgres.crt" -noout \
    -checkend 86400 >/dev/null 2>&1 &&
    openssl pkey -in "${projection_dir}/projection-postgres.key" -noout \
      >/dev/null 2>&1 || {
      printf 'D2 preflight rejected the projection PostgreSQL TLS identity.\n' >&2
      exit 1
    }
  matches_key "${projection_dir}/projection-postgres.crt" \
    "${projection_dir}/projection-postgres.key" || {
      printf 'D2 preflight rejected a mismatched projection PostgreSQL identity.\n' >&2
      exit 1
    }
  openssl verify -verify_hostname projection-postgres \
    -CAfile "${edge_dir}/projection-db-ca.crt" \
    "${projection_dir}/projection-postgres.crt" >/dev/null 2>&1 || {
      printf 'D2 preflight rejected the projection PostgreSQL trust chain.\n' >&2
      exit 1
    }

  python3 - \
    "${edge_dir}/projection-migration-database-url" \
    "${edge_dir}/projection-database-url" \
    "${projection_dir}/projection-owner-password" \
    "${projection_dir}/projection-runtime-password" \
    "${values[PROJECTION_DB_NAME]}" \
    "${values[PROJECTION_DB_OWNER_USER]}" \
    "${values[PROJECTION_DB_RUNTIME_USER]}" <<'PY'
import pathlib
import sys
import urllib.parse

migration_url, runtime_url, owner_password_file, runtime_password_file = map(
    pathlib.Path, sys.argv[1:5]
)
database, owner_user, runtime_user = sys.argv[5:8]
owner_password = owner_password_file.read_text(encoding="utf-8").strip()
runtime_password = runtime_password_file.read_text(encoding="utf-8").strip()
if owner_password == runtime_password:
    raise SystemExit("D2 preflight rejected reused projection role credentials.")

def validate(path: pathlib.Path, expected_user: str, expected_password: str) -> None:
    raw = path.read_text(encoding="utf-8").strip()
    parsed = urllib.parse.urlparse(raw)
    query = urllib.parse.parse_qs(parsed.query, strict_parsing=True)
    if (
        parsed.scheme not in {"postgres", "postgresql"}
        or parsed.hostname != "projection-postgres"
        or parsed.port != 5432
        or parsed.path != f"/{database}"
        or urllib.parse.unquote(parsed.username or "") != expected_user
        or urllib.parse.unquote(parsed.password or "") != expected_password
        or query != {
            "sslmode": ["verify-full"],
            "sslrootcert": ["/run/secrets/projection-db-ca.crt"],
        }
    ):
        raise SystemExit("D2 preflight rejected a projection database URL boundary.")

validate(migration_url, owner_user, owner_password)
validate(runtime_url, runtime_user, runtime_password)
PY

  key_files=(
    "${edge_dir}/edge-server.key"
    "${proxy_dir}/source-proxy-server.key"
    "${edge_dir}/source-proxy-client.pem"
  )
  if [[ "${values[SOURCE_PROXY_SOURCE_MODE]}" == manager-paper-read ]]; then
    key_files+=("${proxy_dir}/manager-v2-client.pem")
  fi
  key_fingerprints="$(
    for private_key in "${key_files[@]}"; do
      openssl pkey -in "${private_key}" -pubout -outform DER 2>/dev/null |
        sha256sum | cut -d' ' -f1
    done
  )"
  [[ "$(sort -u <<<"${key_fingerprints}" | wc -l)" -eq "${#key_files[@]}" ]] || {
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
  if [[ "${values[SOURCE_PROXY_SOURCE_MODE]}" =~ ^(dark|contract-probe|manager-paper-read)$ ]]; then
    if [[ "$(wc -l < "${header_file}")" -ne 1 ]] ||
        ! grep -Fxq 'proxy_set_header X-Portal-Source-Mode dark;' "${header_file}"; then
      printf 'D2/D3 preflight requires the exact non-credential dark marker.\n' >&2
      exit 1
    fi
  elif [[ "$(wc -l < "${header_file}")" -ne 1 ]] ||
      ! grep -Eq '^proxy_set_header X-API-Key [A-Za-z0-9._~-]{16,256};$' "${header_file}"; then
    printf 'Source-read readiness requires a dedicated Trading System read identity.\n' >&2
    exit 1
  fi
  if [[ "${values[SOURCE_PROXY_SOURCE_MODE]}" == manager-paper-read ]]; then
    manager_locations_file="${proxy_dir}/manager-v2-locations.conf"
    manager_locations_template="${root_dir}/deploy/execution-d1/source-proxy/manager-v2-locations.conf.template"
    [[ "$(grep -Fxc '        include /run/secrets/manager-v2-locations.conf;' "${values[SOURCE_PROXY_CONFIG_FILE]}")" -eq 1 &&
       "$(grep -Fc 'manager-v2-locations.conf' "${values[SOURCE_PROXY_CONFIG_FILE]}")" -eq 1 ]] || {
      printf 'Manager read preflight requires the one exact Manager locations include.\n' >&2
      exit 1
    }
    cmp -s "${manager_locations_template}" "${manager_locations_file}" || {
      printf 'Manager read preflight rejected Manager locations drift.\n' >&2
      exit 1
    }
    [[ "$(grep -Ec '^location ' "${manager_locations_file}")" -eq 6 &&
       "$(grep -Fxc '    auth_request /_manager_v2_issue;' "${manager_locations_file}")" -eq 5 &&
       "$(grep -Fxc '    proxy_pass https://127.0.0.1:8023;' "${manager_locations_file}")" -eq 5 &&
       "$(grep -Fxc '    proxy_pass https://127.0.0.1:8024/internal/issue;' "${manager_locations_file}")" -eq 1 &&
       "$(grep -Fxc '    proxy_ssl_protocols TLSv1.3;' "${manager_locations_file}")" -eq 6 ]] || {
      printf 'Manager read preflight rejected the bounded mTLS route set.\n' >&2
      exit 1
    }
    if grep -Eq 'X-API-Key|/v1/|proxy_pass[[:space:]]+http:' "${manager_locations_file}"; then
      printf 'Manager read preflight rejected a legacy credential or upstream in Manager routes.\n' >&2
      exit 1
    fi
  elif grep -Fq 'manager-v2-locations.conf' "${values[SOURCE_PROXY_CONFIG_FILE]}"; then
    printf 'D2/D3/D4 preflight rejected a Manager include outside manager-paper-read.\n' >&2
    exit 1
  fi
  [[ "$(wc -c < "${edge_dir}/source-proxy-admission-token")" -ge 32 ]] || {
    printf 'D2 preflight rejected a short Source Proxy admission token.\n' >&2
    exit 1
  }
fi

if [[ "${mode}" =~ ^(readiness|probe-readiness|source-readiness|manager-readiness)$ ]]; then
  [[ "$(stat -c '%u' "${env_file}")" == 0 ]] || {
    printf 'Execution readiness requires a root-owned env file.\n' >&2
    exit 1
  }
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
