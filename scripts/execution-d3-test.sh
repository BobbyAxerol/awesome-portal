#!/usr/bin/env bash
# Offline D3 gate. It renders no production secret, contacts no AWS/Trading
# System endpoint and starts no Portal service.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
preflight="${root_dir}/scripts/execution-d2-preflight.sh"
renderer="${root_dir}/scripts/execution-d2-render-source-proxy.sh"
env_example="${root_dir}/deploy/execution-d1/edge-source-proxy.env.example"
compose_base="${root_dir}/deploy/compose.execution-edge.yaml"
compose_dark="${root_dir}/deploy/execution-d1/compose.dark.yaml"
compose_probe="${root_dir}/deploy/execution-d3/compose.probes.yaml"
live_probe="${root_dir}/scripts/execution-d3-live-probe.sh"
env_renderer="${root_dir}/scripts/execution-d3-render-probe-env.sh"

bash -n "${preflight}" "${renderer}" "${live_probe}" "${env_renderer}" "$0"
tmp_dir="$(mktemp -d)"
cleanup() { rm -rf -- "${tmp_dir}"; }
trap cleanup EXIT

# Template render proves the exact D3 route delta before any credential/file
# readiness is considered.
cp "${env_example}" "${tmp_dir}/probe.env"
sed -i \
  -e 's/^SOURCE_PROXY_SOURCE_MODE=dark$/SOURCE_PROXY_SOURCE_MODE=contract-probe/' \
  -e 's/^EDGE_SOURCE_PROBES_ENABLED=false$/EDGE_SOURCE_PROBES_ENABLED=true/' \
  -e "s/^PORTAL_RUNTIME_GID=.*/PORTAL_RUNTIME_GID=$(id -g)/" \
  "${tmp_dir}/probe.env"
"${preflight}" --env-file "${tmp_dir}/probe.env" --mode template >/dev/null
"${renderer}" --env-file "${tmp_dir}/probe.env" \
  --output "${tmp_dir}/source-proxy.conf" >/dev/null
[[ "$(grep -c 'D3 contract-probe gate accepted' "${tmp_dir}/source-proxy.conf")" -eq 3 ]]
[[ "$(grep -c 'return 503;' "${tmp_dir}/source-proxy.conf")" -eq 4 ]]
[[ "$(grep -c '^        location = /v1/' "${tmp_dir}/source-proxy.conf")" -eq 7 ]]
if grep -Fq 'X-API-Key' "${tmp_dir}/source-proxy.conf"; then
  printf 'D3 template leaked a Trading System credential header.\n' >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || {
  printf 'Docker CLI is required for D3 Compose verification.\n' >&2
  exit 1
}
docker_cli=(docker)
if ! docker info >/dev/null 2>&1; then
  sudo -n docker info >/dev/null 2>&1 || {
    printf 'D3 verification requires Docker access or scoped passwordless sudo docker.\n' >&2
    exit 1
  }
  docker_cli=(sudo -n docker)
fi
compose=("${docker_cli[@]}" compose --project-directory "${root_dir}" \
  -f "${compose_base}" -f "${compose_dark}" -f "${compose_probe}")
"${compose[@]}" --env-file "${tmp_dir}/probe.env" config --quiet
"${compose[@]}" --env-file "${tmp_dir}/probe.env" config > "${tmp_dir}/probe.yaml"
grep -Fq 'EDGE_SOURCE_PROBES_ENABLED: "true"' "${tmp_dir}/probe.yaml"
grep -Fq 'EDGE_PROBE_ALPHA_ID: ""' "${tmp_dir}/probe.yaml"
grep -Fq 'EDGE_PROJECTION_INGESTION_ENABLED: "false"' "${tmp_dir}/probe.yaml"
grep -Fq 'EDGE_REALTIME_SSE_ENABLED: "false"' "${tmp_dir}/probe.yaml"
grep -Fq 'EDGE_ANALYTICS_QUERY_ENABLED: "false"' "${tmp_dir}/probe.yaml"
grep -Fq 'EDGE_ANALYTICS_SOURCE_PROFILE: fixture' "${tmp_dir}/probe.yaml"
grep -Fq 'EDGE_COMMAND_RELAY_ENABLED: "false"' "${tmp_dir}/probe.yaml"
grep -Fq 'com.primusspark.portal.execution-phase: d3-contract-probe' "${tmp_dir}/probe.yaml"
if grep -Eq 'published: "(5432|8000|8444)"' "${tmp_dir}/probe.yaml"; then
  printf 'D3 manifest unexpectedly published DB/Source Proxy/TS traffic.\n' >&2
  exit 1
fi

# Exercise the live-probe control flow with a deterministic fake curl. Real
# cryptographic material is still generated so the script's file/key checks are
# covered. No socket is opened.
pki="${tmp_dir}/pki"
tokens="${tmp_dir}/tokens"
evidence="${tmp_dir}/evidence"
fake_bin="${tmp_dir}/bin"
mkdir -m 0700 "${pki}" "${tokens}" "${evidence}" "${fake_bin}"
make_identity() {
  local name="$1"
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -sha256 \
    -subj "/CN=${name}" -keyout "${pki}/${name}.key" \
    -out "${pki}/${name}.crt" >/dev/null 2>&1
  chmod 0600 "${pki}/${name}.key"
}
make_identity edge-ca
make_identity trusted-client
make_identity wrong-client
for name in valid malformed wrong-signature unknown-key wrong-issuer wrong-audience \
  expired ttl-too-long future-not-before wrong-environment missing-scope; do
  printf 'token-%s\n' "${name}" > "${tokens}/${name}.jwt"
  chmod 0600 "${tokens}/${name}.jwt"
done
cat > "${tokens}/manifest.json" <<'JSON'
{
  "schema_version": "portal.execution.d3.assertion-corpus.v1",
  "change_window_id": "CW-D3-OFFLINE",
  "maximum_accepted_ttl_seconds": 60,
  "records": [
    {"file":"valid.jwt","expected_http_status":200},
    {"file":"malformed.jwt","expected_http_status":403},
    {"file":"wrong-signature.jwt","expected_http_status":403},
    {"file":"unknown-key.jwt","expected_http_status":403},
    {"file":"wrong-issuer.jwt","expected_http_status":403},
    {"file":"wrong-audience.jwt","expected_http_status":403},
    {"file":"expired.jwt","expected_http_status":403},
    {"file":"ttl-too-long.jwt","expected_http_status":403},
    {"file":"future-not-before.jwt","expected_http_status":403},
    {"file":"wrong-environment.jwt","expected_http_status":403},
    {"file":"missing-scope.jwt","expected_http_status":403}
  ]
}
JSON
chmod 0600 "${tokens}/manifest.json"
cat > "${fake_bin}/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == -V ]]; then
  printf 'curl 8.0 fake\nFeatures: HTTP2 HTTPS SSL\n'
  exit 0
fi
output=""
certificate=""
header_file=""
method=GET
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --output) output="$2"; shift 2 ;;
    --cert) certificate="$2"; shift 2 ;;
    --key|--cacert|--connect-timeout|--max-time|--write-out|--header|--request)
      case "$1" in
        --header) [[ "$2" == @* ]] && header_file="${2#@}" ;;
        --request) method="$2" ;;
      esac
      shift 2
      ;;
    --*) shift ;;
    *) url="$1"; shift ;;
  esac
done
if [[ -z "${certificate}" || "${certificate}" != "${D3_FAKE_TRUSTED_CERT}" ]]; then
  [[ -n "${output}" ]] && : > "${output}"
  exit 35
fi
status=401
token=""
if [[ -n "${header_file}" ]]; then
  token="$(sed -n 's/^Authorization: Bearer //p' "${header_file}")"
  status=403
  [[ "${token}" == token-valid ]] && status=200
fi
[[ "${url}" == */internal/v1/not-commissioned ]] && status=404
[[ "${method}" == POST ]] && status=405
: > "${output}"
if [[ "${status}" == 200 ]]; then
  cat > "${output}" <<'JSON'
{"identity":{"adapter_id":"ts-adapter-v1","source_gateway_digest":"sha256:fixture","source_api_version":"v1","source_contract_revision":"v1","source_schema_version":"v1","capability_snapshot_id":"cap_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","contract_checked_at":"2026-08-23T00:00:00Z"},"capabilities":{"contracts":{"state":"SUPPORTED","reason":"v1_contract_verified","checked_at":"2026-08-23T00:00:00Z"},"health":{"state":"READ_ONLY","reason":"live_read_probe_succeeded","checked_at":"2026-08-23T00:00:00Z"},"capabilities":{"state":"READ_ONLY","reason":"live_read_probe_succeeded","checked_at":"2026-08-23T00:00:00Z"},"orders":{"state":"DISABLED","reason":"alpha_probe_not_configured","checked_at":"2026-08-23T00:00:00Z"},"fills":{"state":"DISABLED","reason":"alpha_probe_not_configured","checked_at":"2026-08-23T00:00:00Z"},"positions":{"state":"DISABLED","reason":"alpha_probe_not_configured","checked_at":"2026-08-23T00:00:00Z"},"events":{"state":"DISABLED","reason":"alpha_probe_not_configured","checked_at":"2026-08-23T00:00:00Z"}},"observed_venue_products":[],"warnings":[]}
JSON
fi
printf '%.3s\t2\t0.005\t0.020\t0.050' "${status}"
SH
chmod 0755 "${fake_bin}/curl"
PATH="${fake_bin}:${PATH}" D3_FAKE_TRUSTED_CERT="${pki}/trusted-client.crt" \
  "${live_probe}" \
    --origin https://10.70.0.2:8443 \
    --ca-file "${pki}/edge-ca.crt" \
    --client-cert-file "${pki}/trusted-client.crt" \
    --client-key-file "${pki}/trusted-client.key" \
    --wrong-client-cert-file "${pki}/wrong-client.crt" \
    --wrong-client-key-file "${pki}/wrong-client.key" \
    --assertion-directory "${tokens}" \
    --evidence-file "${evidence}/d3.json" \
    --change-window-id CW-D3-OFFLINE \
    --iterations 3 --maximum-total-ms 100 >/dev/null
python3 - "${evidence}/d3.json" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload["transport"] == {"http_version": "2", "tls_version": "TLSv1.3", "mtls": True}
assert payload["delegation"] == {"algorithm": "RS256", "maximum_ttl_seconds": 60}
assert payload["business_source_read"] is False
assert payload["projection_ingestion"] is False
assert len(payload["records"]) == 19
assert not any("token" in str(value).lower() for value in payload.values())
PY
[[ "$(stat -c '%a' "${evidence}/d3.json")" == 600 ]]

printf 'D3 probe-only Compose, route guards and redacted H2/mTLS/JWT matrix gates passed. No network or service state changed.\n'
