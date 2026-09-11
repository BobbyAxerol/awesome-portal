#!/usr/bin/env bash
# Offline acceptance for BE-R2-2's one-shot D3 metadata-only runner. Network
# calls, assertions and the edge are simulated; no Portal runtime is touched.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="${ROOT_DIR}/scripts/execution-d3-manager-live-audit.sh"
workspace="$(mktemp -d)"
cleanup() { rm -rf -- "${workspace}"; }
trap cleanup EXIT
mkdir -m 0700 "${workspace}/bin" "${workspace}/evidence"

cat > "${workspace}/bin/node" <<'NODE'
#!/usr/bin/env bash
set -euo pipefail
shift # assertion CLI path; this fake validates the runner's invocation shape.
output=""; matrix="legacy-v1"; profile=""; resource="execution:command-center"; window=""; environment=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-directory) output="$2"; shift 2 ;;
    --matrix) matrix="$2"; shift 2 ;;
    --profile-id) profile="$2"; shift 2 ;;
    --resource) resource="$2"; shift 2 ;;
    --change-window-id) window="$2"; shift 2 ;;
    --environment) environment="$2"; shift 2 ;;
    *) shift 2 ;;
  esac
done
[[ -d "${output}" && -n "${window}" && -n "${environment}" ]]
names=(valid malformed wrong-signature unknown-key wrong-issuer wrong-audience expired ttl-too-long future-not-before wrong-environment missing-scope)
prefix="legacy"
if [[ "${matrix}" == manager-audit-v1 ]]; then
  [[ "${resource}" == execution:manager-v2:read && -n "${profile}" ]]
  names+=(wrong-resource missing-resource wrong-profile)
  prefix="manager"
fi
for name in "${names[@]}"; do
  printf '%s-%s-%s\n' "${prefix}" "${name}" "${profile}" > "${output}/${name}.jwt"
  chmod 0600 "${output}/${name}.jwt"
done
python3 - "${output}/manifest.json" "${matrix}" "${resource}" "${profile}" "${window}" "${names[@]}" <<'PY'
import json, pathlib, sys
out, matrix, resource, profile, window, *names = sys.argv[1:]
payload = {
  "schema_version": "portal.execution.d3.assertion-corpus.v1",
  "change_window_id": window,
  "resource": resource,
  "maximum_accepted_ttl_seconds": 60,
  "records": [{"file": f"{name}.jwt", "expected_http_status": 200 if name == "valid" else 403} for name in names],
}
if matrix == "manager-audit-v1":
  payload.update({"audit_matrix": matrix, "audit_scope": "manager-v2-metadata-only", "profile_id": profile})
pathlib.Path(out).write_text(json.dumps(payload), encoding="utf-8")
PY
chmod 0600 "${output}/manifest.json"
NODE
chmod 0700 "${workspace}/bin/node"

cat > "${workspace}/bin/curl" <<'CURL'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "-V" ]]; then
  printf 'curl fake\nFeatures: HTTP2\n'
  exit 0
fi
output=""; cert=""; method="GET"; authorization=""; url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --cert) cert="$2"; shift 2 ;;
    --key|--cacert|--request|--header|--write-out|--connect-timeout|--max-time|--proto|--tlsv1.3|--tls-max|--noproxy)
      if [[ "$1" == "--tlsv1.3" ]]; then shift; else
        if [[ "$1" == "--request" ]]; then method="$2"; fi
        if [[ "$1" == "--header" && "${2:-}" == @* ]]; then authorization="$(<"${2#@}")"; fi
        shift 2
      fi ;;
    --silent|--show-error|--http2) shift ;;
    *) url="$1"; shift ;;
  esac
done
if [[ -z "${cert}" || "${cert}" == *wrong-client* ]]; then exit 60; fi
token="${authorization#Authorization: Bearer }"; token="${token//$'\n'/}"
status=403; body='{}'
if [[ "${url}" == */internal/v1/compatibility ]]; then
  if [[ -z "${authorization}" ]]; then status=401
  elif [[ "${token}" == legacy-valid-* ]]; then status=503
  else status=403; fi
elif [[ "${url}" == */internal/v2/manager/* ]]; then
  if [[ -z "${authorization}" ]]; then status=401
  elif [[ "${token}" != manager-valid-* ]]; then status=403
  elif [[ "${method}" != GET ]]; then status=405
  elif [[ "${url}" == */not-commissioned ]]; then status=404
  else
    status=200
    profile="${token#manager-valid-}"
    if [[ "${url}" == */catalogue ]]; then
      body="$(python3 - "${profile}" <<'PY'
import json, sys
profile=sys.argv[1]
print(json.dumps({"contract_version":"trading-system.portal-execution.manager-v2.runtime.v1","profile_id":profile,"catalogue_sha256":"sha256:0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44","availability":"AVAILABLE","freshness":"FRESH","completeness":"COMPLETE","as_of":"2026-09-11T12:00:00Z","data":{"relation_count":96,"relations":[{"id":{"schema":"public","relation":f"r{i}"}} for i in range(96)]}}))
PY
)"
    else
      body="$(python3 - "${profile}" <<'PY'
import json, sys
profile=sys.argv[1]
print(json.dumps({"contract_version":"trading-system.portal-execution.manager-v2.runtime.v1","profile_id":profile,"catalogue_sha256":"sha256:0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44","availability":"AVAILABLE","freshness":"FRESH","completeness":"COMPLETE","as_of":"2026-09-11T12:00:00Z","data":{"capabilities":[{"id":f"c{i}"} for i in range(5)]}}))
PY
)"
    fi
  fi
fi
printf '%s' "${body}" > "${output}"
printf '%s\t2\t0.001\t0.002\t0.003' "${status}"
CURL
chmod 0700 "${workspace}/bin/curl"

openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj '/CN=d3-manager-audit-test' \
  -keyout "${workspace}/client.key" -out "${workspace}/client.crt" >/dev/null 2>&1
cp "${workspace}/client.crt" "${workspace}/ca.crt"
cp "${workspace}/client.key" "${workspace}/delegation.key"
chmod 0600 "${workspace}/client.key" "${workspace}/delegation.key"
touch "${workspace}/assertion-cli.js"
chmod 0600 "${workspace}/assertion-cli.js"

PATH="${workspace}/bin:${PATH}" CURL_BIN="${workspace}/bin/curl" \
  "${RUNNER}" \
  --origin https://127.0.0.1:8443 \
  --ca-file "${workspace}/ca.crt" --client-cert-file "${workspace}/client.crt" --client-key-file "${workspace}/client.key" \
  --delegation-private-key-file "${workspace}/delegation.key" --key-id d3-test-k1 --issuer portal-control-api \
  --environment paper --profile-id PAPER_BINANCE_USDM --audience portal-execution-edge-paper \
  --expected-catalogue-sha256 sha256:0c71b72cd5d23cb21e902837d2a6c496d11da5bd09af70123dca3918cd9b1b44 \
  --assertion-cli "${workspace}/assertion-cli.js" --evidence-file "${workspace}/evidence/paper.json" \
  --change-window-id D3-AUDIT-OFFLINE-TEST --iterations 3 --maximum-total-ms 1000 >/dev/null

python3 - "${workspace}/evidence/paper.json" <<'PY'
import json, pathlib, sys
payload=json.loads(pathlib.Path(sys.argv[1]).read_text())
assert payload["schema_version"] == "portal.execution.d3.manager-audit-evidence.v1"
assert payload["audit_scope"] == "D3_GET_ONLY_MANAGER_METADATA"
assert payload["profile"] == {"environment":"paper", "profile_id":"PAPER_BINANCE_USDM", "audience":"portal-execution-edge-paper"}
assert payload["business_rows_read"] is False and payload["raw_business_payload_persisted"] is False
assert payload["runtime_mutation"] is False
assert payload["manager"]["catalogue"]["relation_count"] == 96
assert payload["manager"]["capabilities"]["published_capability_count"] == 5
assert payload["negative_matrix"]["profile_crossing_rejected"] is True
text=json.dumps(payload)
for forbidden in ("manager-valid", "items", "record_key", "next_cursor", "-----BEGIN"):
    assert forbidden not in text, forbidden
PY
test -z "$(find "${workspace}/evidence" -maxdepth 1 -name '.d3-manager-audit.*' -print -quit)"
printf 'BE-R2-2 D3 Manager audit offline test passed.\n'
