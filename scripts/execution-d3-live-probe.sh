#!/usr/bin/env bash
# Operator-run D3 SGP -> AWS-HK transport/auth matrix. It never prints a JWT,
# key, certificate body or source response; evidence contains status/timing and
# the capability snapshot ID only.
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: execution-d3-live-probe.sh \
  --origin https://HOST:8443 \
  --ca-file PATH --client-cert-file PATH --client-key-file PATH \
  --wrong-client-cert-file PATH --wrong-client-key-file PATH \
  --assertion-directory PATH --evidence-file ABSOLUTE_PATH \
  --change-window-id ID [--iterations 5] [--maximum-total-ms 2000]

The assertion directory must be caller-owned mode 0700 and produced by the
Control API `probe:d3-assertions` command. The evidence path must not exist.
EOF
  exit 2
}

origin=""
ca_file=""
client_cert_file=""
client_key_file=""
wrong_client_cert_file=""
wrong_client_key_file=""
assertion_directory=""
evidence_file=""
change_window_id=""
iterations=5
maximum_total_ms=2000
while [[ $# -gt 0 ]]; do
  case "$1" in
    --origin) [[ $# -ge 2 ]] || usage; origin="${2%/}"; shift 2 ;;
    --ca-file) [[ $# -ge 2 ]] || usage; ca_file="$2"; shift 2 ;;
    --client-cert-file) [[ $# -ge 2 ]] || usage; client_cert_file="$2"; shift 2 ;;
    --client-key-file) [[ $# -ge 2 ]] || usage; client_key_file="$2"; shift 2 ;;
    --wrong-client-cert-file) [[ $# -ge 2 ]] || usage; wrong_client_cert_file="$2"; shift 2 ;;
    --wrong-client-key-file) [[ $# -ge 2 ]] || usage; wrong_client_key_file="$2"; shift 2 ;;
    --assertion-directory) [[ $# -ge 2 ]] || usage; assertion_directory="$2"; shift 2 ;;
    --evidence-file) [[ $# -ge 2 ]] || usage; evidence_file="$2"; shift 2 ;;
    --change-window-id) [[ $# -ge 2 ]] || usage; change_window_id="$2"; shift 2 ;;
    --iterations) [[ $# -ge 2 ]] || usage; iterations="$2"; shift 2 ;;
    --maximum-total-ms) [[ $# -ge 2 ]] || usage; maximum_total_ms="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[[ "${origin}" =~ ^https://[A-Za-z0-9._:-]+(:[0-9]{2,5})?$ ]] || usage
[[ "${evidence_file}" == /* && ! -e "${evidence_file}" ]] || usage
[[ "${change_window_id}" =~ ^[A-Za-z0-9._:-]{3,128}$ ]] || usage
[[ "${iterations}" =~ ^[0-9]+$ && "${maximum_total_ms}" =~ ^[0-9]+$ ]] || usage
(( iterations >= 3 && iterations <= 50 && maximum_total_ms >= 100 && maximum_total_ms <= 10000 )) || usage

for file in "${ca_file}" "${client_cert_file}" "${client_key_file}" \
  "${wrong_client_cert_file}" "${wrong_client_key_file}"; do
  [[ -f "${file}" && ! -L "${file}" && -r "${file}" ]] || {
    printf 'D3 rejected a missing, unreadable or symlinked TLS input.\n' >&2
    exit 1
  }
done
for certificate in "${ca_file}" "${client_cert_file}" "${wrong_client_cert_file}"; do
  openssl x509 -in "${certificate}" -noout -checkend 3600 >/dev/null 2>&1 || {
    printf 'D3 rejected invalid or near-expiry certificate material.\n' >&2
    exit 1
  }
done
for private_key in "${client_key_file}" "${wrong_client_key_file}"; do
  openssl pkey -in "${private_key}" -noout >/dev/null 2>&1 || {
    printf 'D3 rejected invalid client key material.\n' >&2
    exit 1
  }
  [[ "$(( $(stat -c '%a' "${private_key}") % 10 ))" -eq 0 ]] || {
    printf 'D3 rejected a world-readable client key.\n' >&2
    exit 1
  }
done
matches_key() {
  local certificate="$1" private_key="$2" cert_digest key_digest
  cert_digest="$(openssl x509 -in "${certificate}" -pubkey -noout 2>/dev/null |
    openssl pkey -pubin -outform DER 2>/dev/null | sha256sum | cut -d' ' -f1)"
  key_digest="$(openssl pkey -in "${private_key}" -pubout -outform DER 2>/dev/null |
    sha256sum | cut -d' ' -f1)"
  [[ -n "${cert_digest}" && "${cert_digest}" == "${key_digest}" ]]
}
matches_key "${client_cert_file}" "${client_key_file}" || {
  printf 'D3 rejected a mismatched trusted client identity.\n' >&2
  exit 1
}
matches_key "${wrong_client_cert_file}" "${wrong_client_key_file}" || {
  printf 'D3 rejected a mismatched negative client identity.\n' >&2
  exit 1
}

[[ -d "${assertion_directory}" && ! -L "${assertion_directory}" &&
   "$(stat -c '%a' "${assertion_directory}")" == 700 ]] || {
  printf 'D3 assertion directory must be a non-symlink mode-0700 directory.\n' >&2
  exit 1
}
if [[ "$(stat -c '%u' "${assertion_directory}")" != "$(id -u)" ]]; then
  printf 'D3 assertion directory must be owned by the caller.\n' >&2
  exit 1
fi
assertion_cases=(
  valid malformed wrong-signature unknown-key wrong-issuer wrong-audience
  expired ttl-too-long future-not-before wrong-environment missing-scope
)
for case_name in "${assertion_cases[@]}"; do
  token_file="${assertion_directory}/${case_name}.jwt"
  [[ -f "${token_file}" && ! -L "${token_file}" &&
     "$(stat -c '%a' "${token_file}")" == 600 &&
     "$(wc -c < "${token_file}")" -le 16384 ]] || {
    printf 'D3 assertion corpus is missing or has unsafe file permissions.\n' >&2
    exit 1
  }
done
[[ -f "${assertion_directory}/manifest.json" &&
   "$(stat -c '%a' "${assertion_directory}/manifest.json")" == 600 ]] || {
  printf 'D3 assertion corpus manifest is missing or unsafe.\n' >&2
  exit 1
}
python3 - "${assertion_directory}/manifest.json" "${change_window_id}" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
expected = {
    "valid.jwt": 200,
    "malformed.jwt": 403,
    "wrong-signature.jwt": 403,
    "unknown-key.jwt": 403,
    "wrong-issuer.jwt": 403,
    "wrong-audience.jwt": 403,
    "expired.jwt": 403,
    "ttl-too-long.jwt": 403,
    "future-not-before.jwt": 403,
    "wrong-environment.jwt": 403,
    "missing-scope.jwt": 403,
}
observed = {
    record.get("file"): record.get("expected_http_status")
    for record in payload.get("records", [])
    if isinstance(record, dict)
}
if (
    payload.get("schema_version") != "portal.execution.d3.assertion-corpus.v1"
    or payload.get("change_window_id") != sys.argv[2]
    or payload.get("maximum_accepted_ttl_seconds") != 60
    or observed != expected
):
    raise SystemExit("D3 assertion corpus manifest does not match this window.")
PY

evidence_dir="$(dirname "${evidence_file}")"
[[ -d "${evidence_dir}" && ! -L "${evidence_dir}" &&
   "$(stat -c '%a' "${evidence_dir}")" == 700 &&
   "$(stat -c '%u' "${evidence_dir}")" == "$(id -u)" ]] || {
  printf 'D3 evidence directory must be caller-owned mode 0700.\n' >&2
  exit 1
}
curl_bin="$(command -v curl || true)"
[[ -n "${curl_bin}" ]] || { printf 'D3 requires curl.\n' >&2; exit 1; }
"${curl_bin}" -V | grep -Eq 'Features:.*HTTP2' || {
  printf 'D3 requires a curl build with HTTP/2 support.\n' >&2
  exit 1
}

tmp_dir="$(mktemp -d)"
chmod 0700 "${tmp_dir}"
records_file="${tmp_dir}/records.tsv"
: > "${records_file}"
cleanup() { rm -rf -- "${tmp_dir}"; }
trap cleanup EXIT

request_number=0
last_body=""
run_http() {
  local label="$1" expected_status="$2" certificate="$3" private_key="$4"
  local assertion_file="$5" method="$6" path="$7"
  request_number=$((request_number + 1))
  local body="${tmp_dir}/body-${request_number}" error="${tmp_dir}/error-${request_number}"
  local header="${tmp_dir}/header-${request_number}" metrics status version connect start total token=""
  local args=(
    --silent --show-error --noproxy '*' --proto '=https' --http2
    --tlsv1.3 --tls-max 1.3 --connect-timeout 2 --max-time 8
    --cacert "${ca_file}" --request "${method}" --header 'Accept: application/json'
    --output "${body}" --write-out $'%{http_code}\t%{http_version}\t%{time_connect}\t%{time_starttransfer}\t%{time_total}'
  )
  if [[ -n "${certificate}" ]]; then
    args+=(--cert "${certificate}" --key "${private_key}")
  fi
  if [[ -n "${assertion_file}" ]]; then
    token="$(tr -d '\r\n' < "${assertion_file}")"
    [[ -n "${token}" && "${token}" != *[[:space:]]* ]] || {
      printf 'D3 rejected malformed assertion file content.\n' >&2
      exit 1
    }
    printf 'Authorization: Bearer %s\n' "${token}" > "${header}"
    chmod 0600 "${header}"
    args+=(--header "@${header}")
  fi
  if ! metrics="$("${curl_bin}" "${args[@]}" "${origin}${path}" 2>"${error}")"; then
    printf 'D3 HTTP case failed before returning its expected status: %s\n' "${label}" >&2
    exit 1
  fi
  IFS=$'\t' read -r status version connect start total <<<"${metrics}"
  [[ "${status}" == "${expected_status}" && "${version}" =~ ^2([.]0)?$ ]] || {
    printf 'D3 HTTP case returned an unexpected status or non-H2 protocol: %s\n' "${label}" >&2
    exit 1
  }
  if [[ -n "${token}" ]] &&
      (grep -Fq -- "${token}" "${body}" || grep -Fq -- "${token}" "${error}"); then
    printf 'D3 detected delegated assertion reflection in a response.\n' >&2
    exit 1
  fi
  [[ "$(wc -c < "${body}")" -le 2097152 ]] || {
    printf 'D3 response exceeded the bounded body limit.\n' >&2
    exit 1
  }
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "${label}" "${status}" "${version}" "${connect}" "${start}" "${total}" >> "${records_file}"
  last_body="${body}"
}

run_tls_rejection() {
  local label="$1" certificate="$2" private_key="$3"
  request_number=$((request_number + 1))
  local body="${tmp_dir}/body-${request_number}" error="${tmp_dir}/error-${request_number}"
  local args=(
    --silent --show-error --noproxy '*' --proto '=https' --http2
    --tlsv1.3 --tls-max 1.3 --connect-timeout 2 --max-time 8
    --cacert "${ca_file}" --output "${body}"
  )
  if [[ -n "${certificate}" ]]; then args+=(--cert "${certificate}" --key "${private_key}"); fi
  if "${curl_bin}" "${args[@]}" "${origin}/internal/v1/compatibility" \
      > /dev/null 2>"${error}"; then
    printf 'D3 TLS negative case unexpectedly reached HTTP: %s\n' "${label}" >&2
    exit 1
  fi
  [[ ! -s "${body}" ]] || {
    printf 'D3 TLS negative case unexpectedly returned a response body.\n' >&2
    exit 1
  }
  printf '%s\tTLS_REJECT\tNA\t0\t0\t0\n' "${label}" >> "${records_file}"
}

run_tls_rejection no-client-certificate "" ""
run_tls_rejection wrong-client-certificate "${wrong_client_cert_file}" "${wrong_client_key_file}"
run_http no-jwt 401 "${client_cert_file}" "${client_key_file}" "" GET /internal/v1/compatibility
for case_name in malformed wrong-signature unknown-key wrong-issuer wrong-audience \
  expired ttl-too-long future-not-before wrong-environment missing-scope; do
  run_http "jwt-${case_name}" 403 "${client_cert_file}" "${client_key_file}" \
    "${assertion_directory}/${case_name}.jwt" GET /internal/v1/compatibility
done
run_http valid 200 "${client_cert_file}" "${client_key_file}" \
  "${assertion_directory}/valid.jwt" GET /internal/v1/compatibility
snapshot_id="$(python3 - "${last_body}" <<'PY'
import json
import pathlib
import re
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if set(payload) != {"identity", "capabilities", "observed_venue_products", "warnings"}:
    raise SystemExit("D3 compatibility payload has unexpected top-level fields.")
identity = payload.get("identity")
capabilities = payload.get("capabilities")
if not isinstance(identity, dict) or not isinstance(capabilities, dict):
    raise SystemExit("D3 compatibility payload is incomplete.")
snapshot = identity.get("capability_snapshot_id")
if not isinstance(snapshot, str) or not re.fullmatch(r"cap_[0-9a-f]{64}", snapshot):
    raise SystemExit("D3 compatibility snapshot ID is invalid.")
if capabilities.get("contracts", {}).get("state") != "SUPPORTED":
    raise SystemExit("D3 contract capability is not supported.")
for name in ("health", "capabilities"):
    if capabilities.get(name, {}).get("state") != "READ_ONLY":
        raise SystemExit(f"D3 public capability is not read-only: {name}")
for name in ("orders", "fills", "positions", "events"):
    item = capabilities.get(name, {})
    if item.get("state") != "DISABLED" or item.get("reason") != "alpha_probe_not_configured":
        raise SystemExit(f"D3 business capability was not kept disabled: {name}")
print(snapshot)
PY
)"
for index in $(seq 1 "${iterations}"); do
  run_http "latency-${index}" 200 "${client_cert_file}" "${client_key_file}" \
    "${assertion_directory}/valid.jwt" GET /internal/v1/compatibility
  total="$(tail -n 1 "${records_file}" | cut -f6)"
  awk -v seconds="${total}" -v maximum="${maximum_total_ms}" \
    'BEGIN { if ((seconds * 1000) > maximum) exit 1 }' || {
    printf 'D3 bounded latency case exceeded the approved total-time ceiling.\n' >&2
    exit 1
  }
done
run_http unknown-route 404 "${client_cert_file}" "${client_key_file}" \
  "${assertion_directory}/valid.jwt" GET /internal/v1/not-commissioned
run_http method-denied 405 "${client_cert_file}" "${client_key_file}" \
  "${assertion_directory}/valid.jwt" POST /internal/v1/compatibility

python3 - "${records_file}" "${evidence_file}" "${change_window_id}" \
  "${snapshot_id}" "${iterations}" "${maximum_total_ms}" <<'PY'
import datetime
import json
import os
import pathlib
import sys

records_path, output_path, window, snapshot, iterations, maximum = sys.argv[1:]
records = []
for line in pathlib.Path(records_path).read_text(encoding="utf-8").splitlines():
    label, status, protocol, connect, start, total = line.split("\t")
    records.append({
        "case": label,
        "result": status,
        "http_version": protocol,
        "connect_seconds": connect,
        "start_transfer_seconds": start,
        "total_seconds": total,
    })
payload = {
    "schema_version": "portal.execution.d3.live-probe-evidence.v1",
    "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "change_window_id": window,
    "transport": {"http_version": "2", "tls_version": "TLSv1.3", "mtls": True},
    "delegation": {"algorithm": "RS256", "maximum_ttl_seconds": 60},
    "capability_snapshot_id": snapshot,
    "latency_policy": {"iterations": int(iterations), "maximum_total_ms": int(maximum)},
    "business_source_read": False,
    "projection_ingestion": False,
    "records": records,
}
fd = os.open(output_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY
chmod 0600 "${evidence_file}"
printf 'D3 live probe PASSED: H2/TLS1.3 mTLS, JWT matrix, %s bounded latency samples; snapshot ID recorded privately.\n' "${iterations}"
