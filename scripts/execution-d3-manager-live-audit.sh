#!/usr/bin/env bash
# BE-R2-2 one-shot D3 audit. It reaches only compatibility plus the two
# Manager metadata endpoints; no relation/page/business request is made.
set -euo pipefail

readonly MANAGER_RESOURCE="execution:manager-v2:read"
readonly MANAGER_CONTRACT="trading-system.portal-execution.manager-v2.runtime.v1"
readonly MAXIMUM_ROWS=200
readonly MAXIMUM_RESPONSE_BYTES=1048576

usage() {
  cat >&2 <<'EOF'
Usage: execution-d3-manager-live-audit.sh \
  --origin https://HOST:8443 \
  --ca-file ABSOLUTE_PATH --client-cert-file ABSOLUTE_PATH --client-key-file ABSOLUTE_PATH \
  --delegation-private-key-file ABSOLUTE_PATH --key-id ID --issuer ISSUER \
  --environment paper|sandbox|live --profile-id EXACT_PROFILE --audience EXACT_AUDIENCE \
  --expected-catalogue-sha256 sha256:HEX --assertion-cli ABSOLUTE_PATH \
  --evidence-file ABSOLUTE_PATH --change-window-id D3-AUDIT-ID \
  [--iterations 3] [--maximum-total-ms 2000]

The evidence parent must be caller-owned mode 0700 and the evidence file must
not exist. The runner creates and destroys all assertion files and temporary
response bodies itself. It never sends a business relation/page request.
EOF
  exit 2
}

origin=""
ca_file=""
client_cert_file=""
client_key_file=""
delegation_private_key_file=""
key_id=""
issuer=""
environment=""
profile_id=""
audience=""
expected_catalogue_sha256=""
assertion_cli=""
evidence_file=""
change_window_id=""
iterations=3
maximum_total_ms=2000
while [[ $# -gt 0 ]]; do
  case "$1" in
    --origin) [[ $# -ge 2 ]] || usage; origin="${2%/}"; shift 2 ;;
    --ca-file) [[ $# -ge 2 ]] || usage; ca_file="$2"; shift 2 ;;
    --client-cert-file) [[ $# -ge 2 ]] || usage; client_cert_file="$2"; shift 2 ;;
    --client-key-file) [[ $# -ge 2 ]] || usage; client_key_file="$2"; shift 2 ;;
    --delegation-private-key-file) [[ $# -ge 2 ]] || usage; delegation_private_key_file="$2"; shift 2 ;;
    --key-id) [[ $# -ge 2 ]] || usage; key_id="$2"; shift 2 ;;
    --issuer) [[ $# -ge 2 ]] || usage; issuer="$2"; shift 2 ;;
    --environment) [[ $# -ge 2 ]] || usage; environment="$2"; shift 2 ;;
    --profile-id) [[ $# -ge 2 ]] || usage; profile_id="$2"; shift 2 ;;
    --audience) [[ $# -ge 2 ]] || usage; audience="$2"; shift 2 ;;
    --expected-catalogue-sha256) [[ $# -ge 2 ]] || usage; expected_catalogue_sha256="$2"; shift 2 ;;
    --assertion-cli) [[ $# -ge 2 ]] || usage; assertion_cli="$2"; shift 2 ;;
    --evidence-file) [[ $# -ge 2 ]] || usage; evidence_file="$2"; shift 2 ;;
    --change-window-id) [[ $# -ge 2 ]] || usage; change_window_id="$2"; shift 2 ;;
    --iterations) [[ $# -ge 2 ]] || usage; iterations="$2"; shift 2 ;;
    --maximum-total-ms) [[ $# -ge 2 ]] || usage; maximum_total_ms="$2"; shift 2 ;;
    *) usage ;;
  esac
done

[[ "${origin}" =~ ^https://[A-Za-z0-9._:-]+(:[0-9]{2,5})?$ ]] || usage
[[ "${environment}" =~ ^(paper|sandbox|live)$ ]] || usage
[[ "${profile_id}" =~ ^(PAPER|SANDBOX|LIVE)_[A-Z0-9_]{2,120}$ ]] || usage
[[ "${profile_id}" == "${environment^^}_"* ]] || usage
[[ "${audience}" =~ ^portal-execution-edge-(paper|sandbox|live)$ ]] || usage
[[ "${audience}" == "portal-execution-edge-${environment}" ]] || usage
[[ "${expected_catalogue_sha256}" =~ ^sha256:[a-f0-9]{64}$ ]] || usage
[[ "${change_window_id}" =~ ^D3-AUDIT-[A-Za-z0-9._:-]{1,118}$ ]] || usage
[[ "${iterations}" =~ ^[0-9]+$ && "${maximum_total_ms}" =~ ^[0-9]+$ ]] || usage
(( iterations >= 3 && iterations <= 20 && maximum_total_ms >= 100 && maximum_total_ms <= 10000 )) || usage
[[ "${evidence_file}" == /* && ! -e "${evidence_file}" ]] || usage

regular_input() {
  local file="$1"
  [[ "${file}" == /* && -f "${file}" && ! -L "${file}" && -r "${file}" ]] || {
    printf 'D3 Manager audit rejected a missing, unreadable or symlinked input.\n' >&2
    exit 1
  }
}
for file in "${ca_file}" "${client_cert_file}" "${client_key_file}" \
  "${delegation_private_key_file}" "${assertion_cli}"; do
  regular_input "${file}"
done
[[ "$(( $(stat -c '%a' "${client_key_file}") % 10 ))" -eq 0 ]] || {
  printf 'D3 Manager audit rejected a world-readable client key.\n' >&2
  exit 1
}
[[ "$(( $(stat -c '%a' "${delegation_private_key_file}") % 10 ))" -eq 0 ]] || {
  printf 'D3 Manager audit rejected a world-readable delegation key.\n' >&2
  exit 1
}
openssl x509 -in "${ca_file}" -noout -checkend 3600 >/dev/null 2>&1 || {
  printf 'D3 Manager audit rejected an invalid or near-expiry CA.\n' >&2
  exit 1
}
openssl x509 -in "${client_cert_file}" -noout -checkend 3600 >/dev/null 2>&1 || {
  printf 'D3 Manager audit rejected an invalid or near-expiry client certificate.\n' >&2
  exit 1
}
openssl pkey -in "${client_key_file}" -noout >/dev/null 2>&1 || {
  printf 'D3 Manager audit rejected an invalid client key.\n' >&2
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
matches_key "${client_cert_file}" "${client_key_file}" || {
  printf 'D3 Manager audit rejected a mismatched trusted client identity.\n' >&2
  exit 1
}

evidence_dir="$(dirname "${evidence_file}")"
[[ -d "${evidence_dir}" && ! -L "${evidence_dir}" &&
  "$(stat -c '%a' "${evidence_dir}")" == 700 &&
  "$(stat -c '%u' "${evidence_dir}")" == "$(id -u)" ]] || {
  printf 'D3 Manager audit evidence directory must be caller-owned mode 0700.\n' >&2
  exit 1
}
curl_bin="${CURL_BIN:-$(command -v curl || true)}"
[[ -n "${curl_bin}" ]] || { printf 'D3 Manager audit requires curl.\n' >&2; exit 1; }
"${curl_bin}" -V | grep -Eq 'Features:.*HTTP2' || {
  printf 'D3 Manager audit requires a curl build with HTTP/2 support.\n' >&2
  exit 1
}
command -v node >/dev/null 2>&1 || { printf 'D3 Manager audit requires node.\n' >&2; exit 1; }

tmp_dir="$(mktemp -d "${evidence_dir}/.d3-manager-audit.XXXXXX")"
chmod 0700 "${tmp_dir}"
records_file="${tmp_dir}/records.tsv"
legacy_dir="${tmp_dir}/legacy-corpus"
manager_dir="${tmp_dir}/manager-corpus"
mkdir -m 0700 "${legacy_dir}" "${manager_dir}"
: > "${records_file}"
cleanup() {
  # The directory is created above with mktemp directly beneath the validated
  # caller-owned evidence directory; no caller-supplied path is ever removed.
  rm -rf -- "${tmp_dir}"
}
trap cleanup EXIT

node "${assertion_cli}" \
  --acknowledge D3_AUTH_NEGATIVE_MATRIX \
  --private-key-file "${delegation_private_key_file}" --key-id "${key_id}" \
  --issuer "${issuer}" --audience "${audience}" --environment "${environment}" \
  --output-directory "${legacy_dir}" --change-window-id "${change_window_id}" >/dev/null
node "${assertion_cli}" \
  --acknowledge D3_MANAGER_AUDIT_NEGATIVE_MATRIX --matrix manager-audit-v1 \
  --private-key-file "${delegation_private_key_file}" --key-id "${key_id}" \
  --issuer "${issuer}" --audience "${audience}" --environment "${environment}" \
  --resource "${MANAGER_RESOURCE}" --profile-id "${profile_id}" \
  --output-directory "${manager_dir}" --change-window-id "${change_window_id}" >/dev/null

python3 - "${legacy_dir}/manifest.json" "${manager_dir}/manifest.json" \
  "${change_window_id}" "${profile_id}" <<'PY'
import json
import pathlib
import sys

legacy, manager, window, profile = [json.loads(pathlib.Path(p).read_text()) for p in sys.argv[1:3]] + sys.argv[3:]
legacy_expected = {
    "valid.jwt": 200, "malformed.jwt": 403, "wrong-signature.jwt": 403,
    "unknown-key.jwt": 403, "wrong-issuer.jwt": 403, "wrong-audience.jwt": 403,
    "expired.jwt": 403, "ttl-too-long.jwt": 403, "future-not-before.jwt": 403,
    "wrong-environment.jwt": 403, "missing-scope.jwt": 403,
}
manager_expected = dict(legacy_expected, **{
    "wrong-resource.jwt": 403, "missing-resource.jwt": 403, "wrong-profile.jwt": 403,
})
def records(doc):
    return {r.get("file"): r.get("expected_http_status") for r in doc.get("records", []) if isinstance(r, dict)}
if (
    legacy.get("schema_version") != "portal.execution.d3.assertion-corpus.v1"
    or legacy.get("change_window_id") != window
    or legacy.get("resource") != "execution:command-center"
    or records(legacy) != legacy_expected
):
    raise SystemExit("D3 legacy compatibility assertion corpus drifted")
if (
    manager.get("schema_version") != "portal.execution.d3.assertion-corpus.v1"
    or manager.get("audit_matrix") != "manager-audit-v1"
    or manager.get("audit_scope") != "manager-v2-metadata-only"
    or manager.get("change_window_id") != window
    or manager.get("resource") != "execution:manager-v2:read"
    or manager.get("profile_id") != profile
    or records(manager) != manager_expected
):
    raise SystemExit("D3 Manager assertion corpus drifted")
PY

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=d3-manager-audit-untrusted' \
  -keyout "${tmp_dir}/wrong-client.key" -out "${tmp_dir}/wrong-client.crt" \
  >/dev/null 2>&1
chmod 0600 "${tmp_dir}/wrong-client.key" "${tmp_dir}/wrong-client.crt"

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
  if [[ -n "${certificate}" ]]; then args+=(--cert "${certificate}" --key "${private_key}"); fi
  if [[ -n "${assertion_file}" ]]; then
    token="$(tr -d '\r\n' < "${assertion_file}")"
    [[ -n "${token}" && "${token}" != *[[:space:]]* ]] || {
      printf 'D3 Manager audit rejected malformed assertion file content.\n' >&2
      exit 1
    }
    printf 'Authorization: Bearer %s\n' "${token}" > "${header}"
    chmod 0600 "${header}"
    args+=(--header "@${header}")
  fi
  if ! metrics="$("${curl_bin}" "${args[@]}" "${origin}${path}" 2>"${error}")"; then
    printf 'D3 Manager audit HTTP case failed before expected status: %s\n' "${label}" >&2
    exit 1
  fi
  IFS=$'\t' read -r status version connect start total <<<"${metrics}"
  [[ "${status}" == "${expected_status}" && "${version}" =~ ^2([.]0)?$ ]] || {
    printf 'D3 Manager audit returned unexpected status/protocol: %s\n' "${label}" >&2
    exit 1
  }
  [[ "$(wc -c < "${body}")" -le 2097152 ]] || {
    printf 'D3 Manager audit response exceeded hard temporary bound.\n' >&2
    exit 1
  }
  if [[ -n "${token}" ]] && (grep -Fq -- "${token}" "${body}" || grep -Fq -- "${token}" "${error}"); then
    printf 'D3 Manager audit detected assertion reflection.\n' >&2
    exit 1
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "${label}" "${status}" "${version}" "${connect}" "${start}" "${total}" >> "${records_file}"
  last_body="${body}"
}

run_tls_rejection() {
  local label="$1" certificate="$2" private_key="$3"
  request_number=$((request_number + 1))
  local body="${tmp_dir}/body-${request_number}" error="${tmp_dir}/error-${request_number}"
  local args=(--silent --show-error --noproxy '*' --proto '=https' --http2
    --tlsv1.3 --tls-max 1.3 --connect-timeout 2 --max-time 8 --cacert "${ca_file}" --output "${body}")
  if [[ -n "${certificate}" ]]; then args+=(--cert "${certificate}" --key "${private_key}"); fi
  if "${curl_bin}" "${args[@]}" "${origin}/internal/v2/manager/catalogue" >/dev/null 2>"${error}"; then
    printf 'D3 Manager audit TLS negative reached HTTP: %s\n' "${label}" >&2
    exit 1
  fi
  [[ ! -s "${body}" ]] || { printf 'D3 Manager audit TLS negative returned a body.\n' >&2; exit 1; }
  printf '%s\tTLS_REJECT\tNA\t0\t0\t0\n' "${label}" >> "${records_file}"
}

run_tls_rejection no-client-certificate "" ""
run_tls_rejection wrong-client-certificate "${tmp_dir}/wrong-client.crt" "${tmp_dir}/wrong-client.key"
run_http compatibility-no-jwt 401 "${client_cert_file}" "${client_key_file}" "" GET /internal/v1/compatibility
# The legacy D2 compatibility facade is intentionally fail-closed (503) in
# the active Manager-v2 topology. A 503 with mTLS/H2 is recorded as a typed
# legacy-unavailable state; it is not used as evidence for Manager data or
# authorization. The Manager metadata path below is the D3 authority.
run_http compatibility-typed-unavailable 503 "${client_cert_file}" "${client_key_file}" "${legacy_dir}/valid.jwt" GET /internal/v1/compatibility
run_http manager-no-jwt 401 "${client_cert_file}" "${client_key_file}" "" GET /internal/v2/manager/catalogue
for case_name in malformed wrong-signature unknown-key wrong-issuer wrong-audience expired ttl-too-long future-not-before wrong-environment missing-scope wrong-resource missing-resource wrong-profile; do
  run_http "jwt-${case_name}" 403 "${client_cert_file}" "${client_key_file}" \
    "${manager_dir}/${case_name}.jwt" GET /internal/v2/manager/catalogue
done
run_http manager-catalogue-valid 200 "${client_cert_file}" "${client_key_file}" "${manager_dir}/valid.jwt" GET /internal/v2/manager/catalogue
catalogue_body="${last_body}"
run_http manager-capabilities-valid 200 "${client_cert_file}" "${client_key_file}" "${manager_dir}/valid.jwt" GET /internal/v2/manager/capabilities
capabilities_body="${last_body}"
for index in $(seq 1 "${iterations}"); do
  run_http "manager-latency-${index}" 200 "${client_cert_file}" "${client_key_file}" "${manager_dir}/valid.jwt" GET /internal/v2/manager/catalogue
  total="$(tail -n 1 "${records_file}" | cut -f6)"
  awk -v seconds="${total}" -v maximum="${maximum_total_ms}" 'BEGIN { if ((seconds * 1000) > maximum) exit 1 }' || {
    printf 'D3 Manager audit exceeded approved total-time ceiling.\n' >&2
    exit 1
  }
done
run_http manager-unknown-route 404 "${client_cert_file}" "${client_key_file}" "${manager_dir}/valid.jwt" GET /internal/v2/manager/not-commissioned
run_http manager-method-denied 405 "${client_cert_file}" "${client_key_file}" "${manager_dir}/valid.jwt" POST /internal/v2/manager/catalogue

python3 - "${catalogue_body}" "${capabilities_body}" "${records_file}" "${evidence_file}" \
  "${change_window_id}" "${environment}" "${profile_id}" "${audience}" \
  "${expected_catalogue_sha256}" "${iterations}" "${maximum_total_ms}" <<'PY'
import datetime
import json
import os
import pathlib
import re
import sys

(catalogue_path, capabilities_path, records_path, output_path, window, environment,
 profile, audience, expected_digest, iterations, maximum) = sys.argv[1:]

def obj(path):
    value = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise SystemExit("Manager metadata response must be an object")
    return value

def text(value, name):
    if not isinstance(value, str) or not value:
        raise SystemExit(f"Manager metadata response is missing {name}")
    return value

def epoch_ms(value):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise SystemExit("Manager metadata as_of is not UTC")
    return int(datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)

def reject_raw(value, path="response"):
    if isinstance(value, list):
        for index, entry in enumerate(value): reject_raw(entry, f"{path}[{index}]")
    elif isinstance(value, dict):
        for key, entry in value.items():
            if key in {"items", "record_key", "next_cursor", "payload"}:
                raise SystemExit(f"D3 Manager audit saw a business-row field at {path}.{key}")
            reject_raw(entry, f"{path}.{key}")

catalogue = obj(catalogue_path)
capabilities = obj(capabilities_path)
for response in (catalogue, capabilities):
    reject_raw(response)
    if text(response.get("contract_version"), "contract_version") != "trading-system.portal-execution.manager-v2.runtime.v1":
        raise SystemExit("Manager contract revision drifted")
    if text(response.get("profile_id"), "profile_id") != profile:
        raise SystemExit("Manager profile crossing was accepted")
    if text(response.get("catalogue_sha256"), "catalogue_sha256") != expected_digest:
        raise SystemExit("Manager catalogue digest drifted")

catalogue_data = catalogue.get("data")
capabilities_data = capabilities.get("data")
if not isinstance(catalogue_data, dict) or not isinstance(capabilities_data, dict):
    raise SystemExit("Manager metadata data is incomplete")
relations = catalogue_data.get("relations")
if not isinstance(relations, list) or catalogue_data.get("relation_count") != 96 or len(relations) != 96:
    raise SystemExit("Manager catalogue did not return exactly 96 metadata relations")
if not isinstance(capabilities_data.get("capabilities"), list) or not capabilities_data["capabilities"]:
    raise SystemExit("Manager capabilities metadata is empty")

def summary(response, *, relation_count=None, capability_count=None):
    output = {
        "contract_version": response["contract_version"],
        "catalogue_sha256": response["catalogue_sha256"],
        "availability": text(response.get("availability"), "availability"),
        "freshness": text(response.get("freshness"), "freshness"),
        "completeness": text(response.get("completeness"), "completeness"),
        "as_of_ms": epoch_ms(response.get("as_of")),
    }
    if relation_count is not None: output["relation_count"] = relation_count
    if capability_count is not None: output["published_capability_count"] = capability_count
    return output

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
    "schema_version": "portal.execution.d3.manager-audit-evidence.v1",
    "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "audit_scope": "D3_GET_ONLY_MANAGER_METADATA",
    "change_window_id": window,
    "profile": {"environment": environment, "profile_id": profile, "audience": audience},
    "transport": {"http_version": "2", "tls_version": "TLSv1.3", "mtls": True},
    "delegation": {"algorithm": "RS256", "resource": "execution:manager-v2:read", "maximum_ttl_seconds": 60},
    "business_rows_read": False,
    "raw_business_payload_persisted": False,
    "runtime_mutation": False,
    "manager": {
        "catalogue": summary(catalogue, relation_count=96),
        "capabilities": summary(capabilities, capability_count=len(capabilities_data["capabilities"])),
    },
    "negative_matrix": {
        "manager_jwt_rejected_case_count": 13,
        "manager_missing_assertion_rejected": True,
        "tls_identity_rejected_case_count": 2,
        "profile_crossing_rejected": True,
    },
    "latency_policy": {"iterations": int(iterations), "maximum_total_ms": int(maximum)},
    "transport_records": records,
}

def reject_evidence(value, path="evidence"):
    if isinstance(value, list):
        for index, entry in enumerate(value): reject_evidence(entry, f"{path}[{index}]")
    elif isinstance(value, dict):
        for key, entry in value.items():
            if key in {"token", "jwt", "certificate", "private_key", "cursor", "trace_id", "items", "record_key", "payload"}:
                raise SystemExit(f"D3 evidence redaction failed at {path}.{key}")
            reject_evidence(entry, f"{path}.{key}")
    elif isinstance(value, str) and ("-----BEGIN" in value or re.match(r"^eyJ[\w-]+\.", value)):
        raise SystemExit(f"D3 evidence credential redaction failed at {path}")

reject_evidence(payload)
fd = os.open(output_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2, sort_keys=True)
    handle.write("\n")
PY
chmod 0600 "${evidence_file}"
printf 'D3 Manager audit PASSED: %s (%s), TLS1.3/H2 mTLS, exact Manager JWT matrix, metadata only.\n' \
  "${environment}" "${profile_id}"
