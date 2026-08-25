#!/usr/bin/env bash
# Offline/readiness gate for the one-shot D4 BUILDING qualifier. It reads no
# source credential, opens no socket, starts no service and changes no state.
set -euo pipefail

usage() {
  printf 'Usage: %s --edge-env PATH --qualifier-env PATH --owner-input PATH --mode template|readiness\n' "$0" >&2
  exit 2
}

edge_env=""
qualifier_env=""
owner_input=""
mode=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --edge-env) [[ $# -ge 2 ]] || usage; edge_env="$2"; shift 2 ;;
    --qualifier-env) [[ $# -ge 2 ]] || usage; qualifier_env="$2"; shift 2 ;;
    --owner-input) [[ $# -ge 2 ]] || usage; owner_input="$2"; shift 2 ;;
    --mode) [[ $# -ge 2 ]] || usage; mode="$2"; shift 2 ;;
    *) usage ;;
  esac
done
for path in "${edge_env}" "${qualifier_env}" "${owner_input}"; do
  [[ -n "${path}" && -f "${path}" ]] || usage
done
[[ "${mode}" =~ ^(template|readiness)$ ]] || usage

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"${root_dir}/scripts/execution-d2-preflight.sh" \
  --env-file "${edge_env}" --mode template >/dev/null
python3 "${root_dir}/scripts/execution-d4-authorization.py" \
  --input "${owner_input}" --mode "${mode}" >/dev/null

declare -A qualifier=()
allowed=' D4_OWNER_INPUT_FILE D4_AUTHORIZATION_EVIDENCE_SHA256 D4_WORKSPACE_ID D4_SOURCE_PROXY_ORIGIN D4_MAXIMUM_REQUESTS D4_MAXIMUM_ELAPSED_SECONDS D4_POLL_INTERVAL_MS '
while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line}" || "${line}" == \#* ]] && continue
  [[ "${line}" =~ ^([A-Z][A-Z0-9_]*)=([A-Za-z0-9_./:@-]*)$ ]] || {
    printf 'D4 qualifier preflight rejected a malformed env line.\n' >&2
    exit 1
  }
  key="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"
  [[ "${allowed}" == *" ${key} "* && ! -v "qualifier[${key}]" ]] || {
    printf 'D4 qualifier preflight rejected an unknown or duplicate key.\n' >&2
    exit 1
  }
  qualifier["${key}"]="${value}"
done < "${qualifier_env}"
for key in D4_OWNER_INPUT_FILE D4_AUTHORIZATION_EVIDENCE_SHA256 D4_WORKSPACE_ID \
  D4_SOURCE_PROXY_ORIGIN D4_MAXIMUM_REQUESTS D4_MAXIMUM_ELAPSED_SECONDS \
  D4_POLL_INTERVAL_MS; do
  [[ -n "${qualifier[${key}]:-}" ]] || {
    printf 'D4 qualifier preflight missing %s.\n' "${key}" >&2
    exit 1
  }
done

read_edge() {
  local key="$1"
  awk -F= -v wanted="${key}" '$1 == wanted { print substr($0, index($0, "=") + 1); exit }' \
    "${edge_env}"
}
runtime_gid="$(read_edge PORTAL_RUNTIME_GID)"
edge_secret_directory="$(read_edge EDGE_SECRET_DIRECTORY)"
bridge_ip="$(read_edge PORTAL_BRIDGE_GATEWAY_IP)"
private_port="$(read_edge SOURCE_PROXY_PRIVATE_PORT)"
db_name="$(read_edge PROJECTION_DB_NAME)"
db_runtime_user="$(read_edge PROJECTION_DB_RUNTIME_USER)"

[[ "${qualifier[D4_OWNER_INPUT_FILE]}" == /* &&
   "${qualifier[D4_OWNER_INPUT_FILE]}" != *'/../'* &&
   "${qualifier[D4_SOURCE_PROXY_ORIGIN]}" == "https://${bridge_ip}:${private_port}" &&
   "${qualifier[D4_WORKSPACE_ID]}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$ &&
   "${qualifier[D4_MAXIMUM_REQUESTS]}" =~ ^[1-9][0-9]{0,4}$ &&
   "${qualifier[D4_MAXIMUM_ELAPSED_SECONDS]}" =~ ^[1-9][0-9]{0,3}$ &&
   "${qualifier[D4_POLL_INTERVAL_MS]}" =~ ^[1-9][0-9]{2,5}$ ]] || {
  printf 'D4 qualifier preflight rejected scope, origin, path or budget metadata.\n' >&2
  exit 1
}
(( qualifier[D4_MAXIMUM_REQUESTS] <= 10000 &&
   qualifier[D4_MAXIMUM_ELAPSED_SECONDS] <= 7200 &&
   qualifier[D4_POLL_INTERVAL_MS] >= 250 &&
   qualifier[D4_POLL_INTERVAL_MS] <= 300000 )) || {
  printf 'D4 qualifier preflight rejected an unbounded runtime budget.\n' >&2
  exit 1
}

owner_digest="sha256:$(sha256sum "${owner_input}" | cut -d' ' -f1)"
if [[ "${mode}" == template ]]; then
  [[ "${qualifier[D4_AUTHORIZATION_EVIDENCE_SHA256]}" =~ ^sha256:[a-f0-9]{64}$ ]] || {
    printf 'D4 qualifier template requires a canonical authorization digest.\n' >&2
    exit 1
  }
  printf 'D4 qualifier template preflight PASSED. No state changed.\n'
  exit 0
fi

(( EUID == 0 )) || {
  printf 'D4 qualifier readiness must run as root.\n' >&2
  exit 1
}
for path in "${edge_env}" "${qualifier_env}" "${owner_input}"; do
  [[ ! -L "${path}" && "$(stat -c '%u:%a' "${path}")" == 0:600 ]] || {
    printf 'D4 qualifier readiness requires root-owned mode-0600 inputs.\n' >&2
    exit 1
  }
done
[[ "${qualifier[D4_OWNER_INPUT_FILE]}" == "${owner_input}" ]] || {
  printf 'D4 qualifier rejected the installed owner-input path.\n' >&2
  exit 1
}
[[ "${qualifier[D4_AUTHORIZATION_EVIDENCE_SHA256]}" == "${owner_digest}" ]] || {
  printf 'D4 qualifier rejected owner-input evidence drift.\n' >&2
  exit 1
}
[[ -d "${edge_secret_directory}" && ! -L "${edge_secret_directory}" &&
   "$(stat -c '%u:%g:%a' "${edge_secret_directory}")" == "0:${runtime_gid}:750" ]] || {
  printf 'D4 qualifier rejected the Edge secret directory.\n' >&2
  exit 1
}

check_secret() {
  local path="$1" mode="$2"
  [[ -f "${path}" && ! -L "${path}" && -s "${path}" &&
     "$(stat -c '%u:%g:%a' "${path}")" == "0:${runtime_gid}:${mode}" ]] || {
    printf 'D4 qualifier rejected a runtime secret boundary.\n' >&2
    exit 1
  }
}
database_url_file="${edge_secret_directory}/projection-runtime-database-url"
source_ca_file="${edge_secret_directory}/source-proxy-ca.crt"
client_identity_file="${edge_secret_directory}/d4-source-proxy-client.pem"
check_secret "${database_url_file}" 640
check_secret "${source_ca_file}" 644
check_secret "${client_identity_file}" 640
openssl x509 -in "${source_ca_file}" -noout -checkend 86400 >/dev/null 2>&1 || {
  printf 'D4 qualifier rejected an invalid or near-expiry Source Proxy CA.\n' >&2
  exit 1
}
openssl x509 -in "${client_identity_file}" -noout -checkend 86400 >/dev/null 2>&1 &&
  openssl pkey -in "${client_identity_file}" -noout >/dev/null 2>&1 || {
    printf 'D4 qualifier rejected its combined mTLS client identity.\n' >&2
    exit 1
  }

python3 - "${database_url_file}" "${db_runtime_user}" "${db_name}" <<'PY'
import pathlib
import sys
import urllib.parse

raw = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").strip()
parsed = urllib.parse.urlparse(raw)
query = urllib.parse.parse_qs(parsed.query, strict_parsing=True)
if (
    parsed.scheme not in {"postgres", "postgresql"}
    or parsed.username != sys.argv[2]
    or parsed.hostname != "projection-postgres"
    or (parsed.port or 5432) != 5432
    or parsed.path != f"/{sys.argv[3]}"
    or query.get("sslmode") not in (["require"], ["verify-ca"], ["verify-full"])
):
    raise SystemExit("D4 qualifier rejected its projection runtime DSN boundary.")
PY

printf 'D4 qualifier readiness preflight PASSED. No service or source request started.\n'
