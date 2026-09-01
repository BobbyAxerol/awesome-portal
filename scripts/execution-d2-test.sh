#!/usr/bin/env bash
# PRE-IAM-05 offline D2 gate. It may optionally build and run no-network image
# introspection containers, but never starts a Portal service or contacts AWS/TS.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_images=false
if [[ "${1:-}" == --build-images ]]; then
  build_images=true
  shift
fi
[[ $# -eq 0 ]] || { printf 'Usage: %s [--build-images]\n' "$0" >&2; exit 2; }

preflight="${root_dir}/scripts/execution-d2-preflight.sh"
renderer="${root_dir}/scripts/execution-d2-render-source-proxy.sh"
probe_renderer="${root_dir}/scripts/execution-d3-render-probe-env.sh"
env_example="${root_dir}/deploy/execution-d1/edge-source-proxy.env.example"
compose_base="${root_dir}/deploy/compose.execution-edge.yaml"
compose_dark="${root_dir}/deploy/execution-d1/compose.dark.yaml"
manager_profile_compose="${root_dir}/deploy/execution-manager-v2/compose.profile-read.yaml"
manager_proxy_profile_compose="${root_dir}/deploy/execution-manager-v2/compose.profile-source-proxy.yaml"
manager_contract_dir="${root_dir}/services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1"

# The Manager-v2 handoff is an imported owner pack, not a loose collection of
# examples.  Reject byte drift, accidental secret material, route widening and
# any attempt to describe the five private Paper routes as a completed N11-v1
# or an already-consumed Portal feature before constructing an offline fixture.
python3 - "${root_dir}" "${manager_contract_dir}" <<'PY'
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import sys


root = Path(sys.argv[1]).resolve()
pack = Path(sys.argv[2]).resolve()
if pack.parent.parent.parent.parent != root:
    raise SystemExit("Manager contract pack must remain inside this Portal worktree")

lock_path = pack / "contract-pack.lock.json"
if not lock_path.is_file():
    raise SystemExit("Manager contract import lock is missing")
lock = json.loads(lock_path.read_text(encoding="utf-8"))
if lock.get("schema_version") != "portal.execution.manager-v2-paper-read.import-lock.v1":
    raise SystemExit("Manager contract import lock schema is not recognized")
if lock.get("status") != "PRIVATE_PAPER_ROUTE_QUALIFIED_NO_PRODUCT_CONSUMER":
    raise SystemExit("Manager contract import readiness is not the approved private handoff")

expected_paths = {
    "/portal/execution/v2/manager/catalog",
    "/portal/execution/v2/manager/capabilities",
    "/portal/execution/v2/manager/projections/{kind}",
    "/portal/execution/v2/manager/records/{schema}/{relation}",
    "/portal/execution/v2/manager/records/{schema}/{relation}/{key}",
}
files = lock.get("files")
if not isinstance(files, dict) or not files:
    raise SystemExit("Manager contract import lock has no pinned files")
expected_files = set(files) | {"README.md", "contract-pack.lock.json"}
actual_files = {
    path.relative_to(pack).as_posix()
    for path in pack.rglob("*")
    if path.is_file()
}
if actual_files != expected_files:
    raise SystemExit("Manager contract import has unpinned or missing files")

for relative_path, expected_digest in files.items():
    relative = Path(relative_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise SystemExit("Manager contract import lock contains an unsafe path")
    source = pack / relative
    if not source.is_file():
        raise SystemExit(f"Manager contract import file is missing: {relative_path}")
    actual_digest = "sha256:" + hashlib.sha256(source.read_bytes()).hexdigest()
    if actual_digest != expected_digest:
        raise SystemExit(f"Manager contract import digest drift: {relative_path}")

secret_markers = (
    b"-----BEGIN PRIVATE KEY-----",
    b"-----BEGIN RSA PRIVATE KEY-----",
    b"-----BEGIN EC PRIVATE KEY-----",
    b"postgresql://",
    b"postgres://",
    b"AWS_SECRET_ACCESS_KEY=",
    b"DB_LOGIN_SECRET=",
    b"JWT_PRIVATE_KEY=",
    b"MTLS_PRIVATE_KEY=",
)
for relative_path in files:
    payload = (pack / relative_path).read_bytes()
    if any(marker.lower() in payload.lower() for marker in secret_markers):
        raise SystemExit(f"Manager contract import contains secret-shaped content: {relative_path}")

owner_manifest = json.loads(
    (pack / "owner-publication/owner-publication.manifest.json").read_text(encoding="utf-8")
)
if owner_manifest.get("status") != "OWNER_PUBLISHED_PRIVATE_PAPER_ROUTE_QUALIFIED":
    raise SystemExit("Owner publication has not reached the qualified handoff state")
if owner_manifest.get("n11_v1_complete") is not False:
    raise SystemExit("Owner publication incorrectly claims N11-v1 completeness")
if owner_manifest.get("portal_product_consumer_implemented") is not False:
    raise SystemExit("Owner publication incorrectly claims a Portal product consumer")
if lock.get("owner_publication_manifest_sha256") != files.get(
    "owner-publication/owner-publication.manifest.json"
):
    raise SystemExit("Owner publication manifest lock is inconsistent")
for name, digest in owner_manifest.get("files", {}).items():
    if files.get(f"owner-publication/{name}") != digest:
        raise SystemExit(f"Owner publication member is not pinned: {name}")

runtime_overlay_manifest = json.loads(
    (pack / "owner-runtime-overlay/manager-v2-runtime-qualification.manifest.json").read_text(
        encoding="utf-8"
    )
)
if runtime_overlay_manifest.get("contract_revision") != "trading-system.portal-execution.manager-v2.runtime.v1":
    raise SystemExit("Manager runtime overlay revision drifted")
if runtime_overlay_manifest.get("status") != "OWNER_LOOPBACK_QUALIFICATION_PASSED_CLEANED_UP":
    raise SystemExit("Manager runtime overlay historical qualification state drifted")
for name, digest in runtime_overlay_manifest.get("files", {}).items():
    if files.get(f"owner-runtime-overlay/{name}") != digest:
        raise SystemExit(f"Manager runtime overlay member is not pinned: {name}")
runtime_overlay = json.loads(
    (pack / "owner-runtime-overlay/manager-v2-runtime-qualification.json").read_text(encoding="utf-8")
)
if (
    runtime_overlay.get("base_source_dark_contract", {}).get("revision")
    != "trading-system.portal-execution.manager-v2.v1"
    or runtime_overlay.get("profile", {}).get("profile_id") != "PAPER_BINANCE_USDM"
    or runtime_overlay.get("limits", {}).get("maximum_page_rows") != 200
    or runtime_overlay.get("limits", {}).get("maximum_response_bytes") != 1_048_576
    or runtime_overlay.get("wire_overlay", {}).get("manager_record_required_addition") != "record_key"
):
    raise SystemExit("Manager runtime overlay no longer binds the approved wire delta")
dto_handoff = (pack / "RUST_DTO_HANDOFF.md").read_text(encoding="utf-8")
for marker in (
    "MANAGER_V2_CONTRACT_VERSION",
    "OpaqueCursor",
    "CatalogueDigest",
    "ManagerEnvelope",
    "ManagerUnavailable",
    "ManagerValue",
):
    if marker not in dto_handoff:
        raise SystemExit("Manager Rust DTO handoff is incomplete")

publication = json.loads(
    (pack / "owner-publication/manager-v2-private-paper-publication.json").read_text(encoding="utf-8")
)
operations = publication.get("operations")
published_paths = {
    operation.get("path_template")
    for operation in operations if operation.get("method") == "GET"
} if isinstance(operations, list) else set()
if len(operations or []) != 5 or published_paths != expected_paths:
    raise SystemExit("Manager publication does not pin exactly the five approved GET routes")
scope = publication.get("scope", {})
for field in (
    "public_listener", "sandbox", "canary", "live", "command", "redis",
    "broker", "cli_execution", "event_sse_replay", "portal_database_dsn_or_role",
):
    if scope.get(field) is not False:
        raise SystemExit(f"Manager publication widened forbidden scope: {field}")
truthful = publication.get("truthful_readiness", {})
if truthful.get("private_same_host_route_qualified") is not True:
    raise SystemExit("Manager publication is missing private route qualification")
if publication.get("owner_loopback_overlay", {}).get("manifest_sha256") != files.get(
    "owner-runtime-overlay/manager-v2-runtime-qualification.manifest.json"
):
    raise SystemExit("Manager publication does not bind the imported runtime overlay")
if any(truthful.get(field) is not False for field in (
    "portal_product_consumer_implemented", "public_or_production_authoritative",
    "high_availability_or_independent_failure_domain", "n11_v1_complete",
)):
    raise SystemExit("Manager publication overstates route readiness")

acceptance = json.loads(
    (pack / "owner-publication/n11-v1-acceptance.json").read_text(encoding="utf-8")
)
if (
    acceptance.get("capability_count") != 24
    or acceptance.get("typed_unavailable_capability_count") != 24
    or acceptance.get("implemented_capability_count") != 0
    or acceptance.get("complete_24_route_claim") is not False
    or acceptance.get("manager_v2_is_n11_v1") is not False
):
    raise SystemExit("N11-v1 acceptance is no longer the truthful unavailable result")
freeze = json.loads(
    (pack / "owner-publication/n11-v1-capability-freeze.json").read_text(encoding="utf-8")
)
capabilities = freeze.get("capabilities")
if not isinstance(capabilities, list) or len(capabilities) != 24 or any(
    entry.get("status") != "TYPED_UNAVAILABLE" for entry in capabilities
):
    raise SystemExit("N11-v1 freeze no longer contains exactly 24 typed-unavailable capabilities")

openapi = json.loads((pack / "manager-v2.openapi.json").read_text(encoding="utf-8"))
if openapi.get("x-contract-revision") != "trading-system.portal-execution.manager-v2.v1":
    raise SystemExit("Manager OpenAPI revision drifted")
if set(openapi.get("paths", {})) != expected_paths:
    raise SystemExit("Manager OpenAPI does not match the frozen five-route surface")
if any(set(path_item) != {"get"} for path_item in openapi["paths"].values()):
    raise SystemExit("Manager OpenAPI permits a non-GET operation")

template = pack / "source-proxy-manager-v2-locations.conf.template"
active_template = root / "deploy/execution-d1/source-proxy/manager-v2-locations.conf.template"
if template.read_bytes() != active_template.read_bytes():
    raise SystemExit("Imported Manager route template does not match the active template")
locations = template.read_text(encoding="utf-8")
if locations.count("auth_request /_manager_v2_issue;") != 5:
    raise SystemExit("Manager route template does not have five issuer gates")
if locations.count("proxy_pass https://127.0.0.1:8023;") != 5:
    raise SystemExit("Manager route template does not have five facade upstreams")
if locations.count("proxy_pass https://127.0.0.1:8024/internal/issue;") != 1:
    raise SystemExit("Manager route template does not have exactly one issuer upstream")
if re.search(r"X-API-Key|/v1/|proxy_pass\\s+http:", locations):
    raise SystemExit("Manager route template widened into an unapproved legacy path")

assertions = lock.get("assertions", {})
if assertions.get("private_same_host_route_qualified") is not True or any(
    assertions.get(field) is not False for field in (
        "portal_product_consumer_implemented", "n11_v1_complete",
        "public_or_production_authoritative", "direct_database_access",
        "d4_or_v1_widened", "sandbox", "canary", "live", "command",
        "event_sse_replay",
    )
):
    raise SystemExit("Manager contract import assertions are inconsistent")
PY

python3 - "${compose_base}" "${compose_dark}" <<'PY'
from pathlib import Path
import sys

base = Path(sys.argv[1]).read_text()
dark = Path(sys.argv[2]).read_text()
for token in ('cpus: "2.0"', 'mem_limit: 2048m', 'mem_reservation: 512m'):
    if token not in base:
        raise SystemExit(f"D2 Edge resource contract missing: {token}")
for token in (
    'cpus: "1.5"',
    'mem_limit: 2048m',
    'cpus: "1.0"',
    'mem_limit: 1024m',
    'cpus: "0.50"',
    'mem_limit: 512m',
    'mem_reservation: 128m',
):
    if token not in dark:
        raise SystemExit(f"D2 shared-host resource contract missing: {token}")
PY

bash -n "${preflight}" "${renderer}" "$0"
"${preflight}" --env-file "${env_example}" --mode template >/dev/null
grep -Eq '^EDGE_SECRET_DIRECTORY=/srv/primus/portal/' "${env_example}"
grep -Eq '^SOURCE_PROXY_SECRET_DIRECTORY=/srv/primus/portal/' "${env_example}"
grep -Eq '^SOURCE_PROXY_CONFIG_FILE=/srv/primus/portal/' "${env_example}"

tmp_dir="$(mktemp -d)"
docker_cli=()
integration_suffix="d2-$$-${RANDOM}"
integration_network="portal-execution-${integration_suffix}"
integration_pg="portal-projection-pg-${integration_suffix}"
integration_edge="portal-execution-edge-${integration_suffix}"
integration_pgdata="portal-projection-pgdata-${integration_suffix}"
integration_pgsecrets="portal-projection-pgsecrets-${integration_suffix}"
integration_edgesecrets="portal-projection-edgesecrets-${integration_suffix}"
cleanup() {
  if [[ "${build_images}" == true && "${#docker_cli[@]}" -gt 0 ]]; then
    "${docker_cli[@]}" container rm --force \
      "${integration_edge}" "${integration_pg}" \
      >/dev/null 2>&1 || true
    "${docker_cli[@]}" network rm "${integration_network}" \
      >/dev/null 2>&1 || true
    "${docker_cli[@]}" volume rm \
      "${integration_pgdata}" "${integration_pgsecrets}" \
      "${integration_edgesecrets}" >/dev/null 2>&1 || true
    "${docker_cli[@]}" image rm \
      portal-source-proxy:pre-iam-05 portal-execution-edge:pre-iam-05 \
      >/dev/null 2>&1 || true
  fi
  rm -rf -- "${tmp_dir}"
}
trap cleanup EXIT
runtime_gid="$(id -g)"
# The workspace verifier is commonly invoked through sudo so it can reach the
# Docker daemon.  Keep the offline fixture representative of the production
# contract in that case: Portal workloads must never inherit root's GID 0.
if [[ "${runtime_gid}" == 0 ]]; then
  runtime_gid=987
fi
edge_secrets="${tmp_dir}/srv/primus/portal/execution-edge/secrets"
proxy_secrets="${tmp_dir}/srv/primus/portal/source-proxy/secrets"
proxy_config="${tmp_dir}/srv/primus/portal/source-proxy/nginx.conf"
projection_secrets="${tmp_dir}/srv/primus/portal/projection-postgres/secrets"
projection_init="${tmp_dir}/srv/primus/portal/projection-postgres/init-projection-database.sh"
mkdir -p "${edge_secrets}" "${proxy_secrets}" "${projection_secrets}" \
  "$(dirname "${projection_init}")"
chmod 0750 "${edge_secrets}" "${proxy_secrets}" "${projection_secrets}"
chgrp "${runtime_gid}" "${edge_secrets}" "${proxy_secrets}" "${projection_secrets}"
cp "${root_dir}/deploy/execution-d2/init-projection-database.sh" "${projection_init}"
chmod 0550 "${projection_init}"
chgrp "${runtime_gid}" "${projection_init}"

cp "${env_example}" "${tmp_dir}/candidate.env"
sed -i \
  -e 's/sha256:0000000000000000000000000000000000000000000000000000000000000000/sha256:1111111111111111111111111111111111111111111111111111111111111111/' \
  -e 's/^EDGE_SOURCE_GATEWAY_DIGEST=.*/EDGE_SOURCE_GATEWAY_DIGEST=sha256:8a81f121f068bec80821c5f3be38c8865682e248147f1ca808800a18ea8c1fde/' \
  -e "s/^PORTAL_RUNTIME_GID=.*/PORTAL_RUNTIME_GID=${runtime_gid}/" \
  -e "s/^PROJECTION_DB_CONTAINER_GID=.*/PROJECTION_DB_CONTAINER_GID=${runtime_gid}/" \
  -e "s#^EDGE_SECRET_DIRECTORY=.*#EDGE_SECRET_DIRECTORY=${edge_secrets}#" \
  -e "s#^SOURCE_PROXY_SECRET_DIRECTORY=.*#SOURCE_PROXY_SECRET_DIRECTORY=${proxy_secrets}#" \
  -e "s#^SOURCE_PROXY_CONFIG_FILE=.*#SOURCE_PROXY_CONFIG_FILE=${proxy_config}#" \
  -e "s#^PROJECTION_DB_SECRET_DIRECTORY=.*#PROJECTION_DB_SECRET_DIRECTORY=${projection_secrets}#" \
  -e "s#^PROJECTION_DB_INIT_SCRIPT=.*#PROJECTION_DB_INIT_SCRIPT=${projection_init}#" \
  "${tmp_dir}/candidate.env"
chmod 0600 "${tmp_dir}/candidate.env"

"${renderer}" --env-file "${tmp_dir}/candidate.env" --output "${proxy_config}" >/dev/null
[[ "$(stat -c '%a' "${proxy_config}")" == 640 ]]
[[ "$(stat -c '%g' "${proxy_config}")" == "${runtime_gid}" ]]
grep -Fq 'listen 172.23.0.1:8444 ssl;' "${proxy_config}"
proxy_syntax_config="${tmp_dir}/source-proxy.syntax-test.conf"
sed 's/listen 172\.23\.0\.1:8444 ssl;/listen 127.0.0.1:18444 ssl;/' \
  "${proxy_config}" > "${proxy_syntax_config}"
chmod 0640 "${proxy_syntax_config}"
chgrp "${runtime_gid}" "${proxy_syntax_config}"

command -v openssl >/dev/null 2>&1 || {
  printf 'OpenSSL is required for the offline D2 identity fixture.\n' >&2
  exit 1
}
pki_dir="${tmp_dir}/pki"
mkdir -p "${pki_dir}"
make_ca() {
  local name="$1"
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -sha256 \
    -subj "/CN=${name}" -keyout "${pki_dir}/${name}.key" \
    -out "${pki_dir}/${name}.crt" >/dev/null 2>&1
}
make_leaf() {
  local name="$1" ca="$2" usage="$3" san="${4:-}"
  openssl req -newkey rsa:2048 -nodes -sha256 -subj "/CN=${name}" \
    -keyout "${pki_dir}/${name}.key" -out "${pki_dir}/${name}.csr" >/dev/null 2>&1
  printf 'extendedKeyUsage=%s\n' "${usage}" > "${pki_dir}/${name}.ext"
  if [[ -n "${san}" ]]; then
    printf 'subjectAltName=%s\n' "${san}" >> "${pki_dir}/${name}.ext"
  fi
  openssl x509 -req -in "${pki_dir}/${name}.csr" -days 2 -sha256 \
    -CA "${pki_dir}/${ca}.crt" -CAkey "${pki_dir}/${ca}.key" -CAcreateserial \
    -extfile "${pki_dir}/${name}.ext" -out "${pki_dir}/${name}.crt" >/dev/null 2>&1
}
for ca in edge-ca sgp-client-ca source-server-ca projection-client-ca projection-db-ca manager-ca; do make_ca "${ca}"; done
make_leaf edge-server edge-ca serverAuth
make_leaf source-proxy-server source-server-ca serverAuth
make_leaf source-proxy-client projection-client-ca clientAuth
make_leaf projection-postgres projection-db-ca serverAuth DNS:projection-postgres
make_leaf manager-v2-client manager-ca clientAuth

cp "${pki_dir}/edge-server.crt" "${edge_secrets}/edge-server.crt"
cp "${pki_dir}/edge-server.key" "${edge_secrets}/edge-server.key"
cp "${pki_dir}/sgp-client-ca.crt" "${edge_secrets}/sgp-client-ca.crt"
cp "${pki_dir}/source-server-ca.crt" "${edge_secrets}/source-proxy-ca.crt"
{
  cat "${pki_dir}/source-proxy-client.crt"
  cat "${pki_dir}/source-proxy-client.key"
} > "${edge_secrets}/source-proxy-client.pem"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
  -out "${pki_dir}/control-api.key" >/dev/null 2>&1
control_modulus="$(openssl rsa -in "${pki_dir}/control-api.key" -noout -modulus |
  cut -d= -f2)"
python3 - "${edge_secrets}/control-api.jwks.json" "${control_modulus}" <<'PY'
import base64
import json
import pathlib
import sys

output = pathlib.Path(sys.argv[1])
modulus = bytes.fromhex(sys.argv[2])
encoded_modulus = base64.urlsafe_b64encode(modulus).rstrip(b"=").decode("ascii")
encoded_exponent = base64.urlsafe_b64encode((65537).to_bytes(3, "big")).rstrip(b"=").decode("ascii")
output.write_text(
    json.dumps(
        {"keys": [{"kty": "RSA", "kid": "offline-d2", "alg": "RS256", "use": "sig", "n": encoded_modulus, "e": encoded_exponent}]},
        separators=(",", ":"),
    )
    + "\n",
    encoding="utf-8",
)
PY
printf '0123456789abcdef0123456789abcdef\n' \
  > "${edge_secrets}/source-proxy-admission-token"
cp "${pki_dir}/source-proxy-server.crt" "${proxy_secrets}/source-proxy-server.crt"
cp "${pki_dir}/source-proxy-server.key" "${proxy_secrets}/source-proxy-server.key"
cp "${pki_dir}/projection-client-ca.crt" "${proxy_secrets}/projection-ingestor-ca.crt"
{
  cat "${pki_dir}/manager-v2-client.crt"
  cat "${pki_dir}/manager-v2-client.key"
} > "${proxy_secrets}/manager-v2-client.pem"
cp "${pki_dir}/manager-ca.crt" "${proxy_secrets}/manager-v2-ca.crt"
cp "${pki_dir}/projection-db-ca.crt" "${edge_secrets}/projection-db-ca.crt"
cp "${pki_dir}/projection-postgres.crt" "${projection_secrets}/projection-postgres.crt"
cp "${pki_dir}/projection-postgres.key" "${projection_secrets}/projection-postgres.key"

owner_password=OwnerPasswordFixture0123456789abcdef
runtime_password=RuntimePasswordFixture0123456789abc
printf '%s\n' "${owner_password}" > "${projection_secrets}/projection-owner-password"
printf '%s\n' "${runtime_password}" > "${projection_secrets}/projection-runtime-password"
printf '%s\n' BootstrapPasswordFixture0123456789abc \
  > "${projection_secrets}/postgres-bootstrap-password"
printf 'postgresql://portal_projection_owner:%s@projection-postgres:5432/portal_projection?sslmode=verify-full&sslrootcert=/run/secrets/projection-db-ca.crt\n' \
  "${owner_password}" > "${edge_secrets}/projection-migration-database-url"
printf 'postgresql://portal_projection_runtime:%s@projection-postgres:5432/portal_projection?sslmode=verify-full&sslrootcert=/run/secrets/projection-db-ca.crt\n' \
  "${runtime_password}" > "${edge_secrets}/projection-database-url"

for file in edge-server.crt sgp-client-ca.crt control-api.jwks.json source-proxy-ca.crt \
  projection-db-ca.crt; do
  chmod 0644 "${edge_secrets}/${file}"
  chgrp "${runtime_gid}" "${edge_secrets}/${file}"
done
for file in edge-server.key source-proxy-client.pem source-proxy-admission-token \
  projection-migration-database-url projection-database-url; do
  chmod 0640 "${edge_secrets}/${file}"
  chgrp "${runtime_gid}" "${edge_secrets}/${file}"
done
for file in source-proxy-server.crt projection-ingestor-ca.crt manager-v2-ca.crt; do
  chmod 0644 "${proxy_secrets}/${file}"
  chgrp "${runtime_gid}" "${proxy_secrets}/${file}"
done
for file in source-proxy-server.key manager-v2-client.pem; do
  chmod 0640 "${proxy_secrets}/${file}"
  chgrp "${runtime_gid}" "${proxy_secrets}/${file}"
done
printf 'proxy_set_header X-Portal-Source-Mode dark;\n' \
  > "${proxy_secrets}/trading-system-read-header.conf"
chmod 0640 "${proxy_secrets}/trading-system-read-header.conf"
chgrp "${runtime_gid}" "${proxy_secrets}/trading-system-read-header.conf"
chmod 0644 "${projection_secrets}/projection-postgres.crt"
chgrp "${runtime_gid}" "${projection_secrets}/projection-postgres.crt"
for file in projection-postgres.key postgres-bootstrap-password \
  projection-owner-password projection-runtime-password; do
  chmod 0640 "${projection_secrets}/${file}"
  chgrp "${runtime_gid}" "${projection_secrets}/${file}"
done

"${preflight}" --env-file "${tmp_dir}/candidate.env" --mode offline >/dev/null
cp "${tmp_dir}/candidate.env" "${tmp_dir}/stale-gateway-lock.env"
sed -i \
  's/^EDGE_SOURCE_GATEWAY_DIGEST=.*/EDGE_SOURCE_GATEWAY_DIGEST=sha256:4f63dc9949f8102714ab0ee9391757dee3a704135be6680cc2a96d89f54a1db9/' \
  "${tmp_dir}/stale-gateway-lock.env"
if "${preflight}" --env-file "${tmp_dir}/stale-gateway-lock.env" --mode offline \
    >/dev/null 2>&1; then
  printf 'Execution preflight unexpectedly accepted a stale source gateway lock.\n' >&2
  exit 1
fi
sed -i 's/listen 172\.23\.0\.1:8444 ssl;/listen 172.23.0.1:8444 quic;/' \
  "${proxy_config}"
if "${preflight}" --env-file "${tmp_dir}/candidate.env" --mode offline \
    >/dev/null 2>&1; then
  printf 'D2 preflight accepted a forbidden Source Proxy QUIC listener.\n' >&2
  exit 1
fi
sed -i 's/listen 172\.23\.0\.1:8444 quic;/listen 172.23.0.1:8444 ssl;/' \
  "${proxy_config}"
"${preflight}" --env-file "${tmp_dir}/candidate.env" --mode offline >/dev/null
[[ "$(grep -c 'return 503;' "${proxy_config}")" -eq 7 ]]
if grep -Fq 'X-API-Key' "${proxy_config}"; then
  printf 'D2 dark Source Proxy unexpectedly rendered a Trading System API key.\n' >&2
  exit 1
fi

# Manager-v2 keeps V1 dark, uses one Source-Proxy-held client leaf, and accepts
# only the five bounded owner routes through the short-lived certificate-bound
# token issuer.  Preserve the frozen historical Paper pack, then prove the
# profile overlay can alter only its dedicated loopback upstream ports.
manager_config="${tmp_dir}/srv/primus/portal/source-proxy/nginx.manager-v2.conf"
manager_locations="${proxy_secrets}/manager-v2-locations.conf"
cp "${tmp_dir}/candidate.env" "${tmp_dir}/manager.env"
sed -i \
  -e 's/^SOURCE_PROXY_SOURCE_MODE=dark$/SOURCE_PROXY_SOURCE_MODE=manager-paper-read/' \
  -e "s#^SOURCE_PROXY_CONFIG_FILE=.*#SOURCE_PROXY_CONFIG_FILE=${manager_config}#" \
  "${tmp_dir}/manager.env"
chmod 0600 "${tmp_dir}/manager.env"
"${renderer}" --env-file "${tmp_dir}/manager.env" --output "${manager_config}" \
  --manager-locations-output "${manager_locations}" >/dev/null
"${preflight}" --env-file "${tmp_dir}/manager.env" --mode manager-offline >/dev/null
[[ "$(grep -c 'return 503;' "${manager_config}")" -eq 7 ]]
[[ "$(grep -Fxc '        include /run/secrets/manager-v2-locations.conf;' "${manager_config}")" -eq 1 ]]
[[ "$(grep -Fxc '    auth_request /_manager_v2_issue;' "${manager_locations}")" -eq 5 ]]
[[ "$(grep -Fxc '    proxy_pass https://127.0.0.1:8023;' "${manager_locations}")" -eq 5 ]]
[[ "$(grep -Fxc '    proxy_pass https://127.0.0.1:8024/internal/issue;' "${manager_locations}")" -eq 1 ]]
if grep -Eq 'X-API-Key|/v1/|proxy_pass[[:space:]]+http:' "${manager_locations}"; then
  printf 'Manager-v2 route fixture unexpectedly widened into a legacy path.\n' >&2
  exit 1
fi
sed -i 's#127\.0\.0\.1:8023#127.0.0.1:8025#' "${manager_locations}"
if "${preflight}" --env-file "${tmp_dir}/manager.env" --mode manager-offline \
    >/dev/null 2>&1; then
  printf 'Manager preflight unexpectedly accepted an unapproved facade upstream.\n' >&2
  exit 1
fi
"${renderer}" --env-file "${tmp_dir}/manager.env" --output "${manager_config}" \
  --manager-locations-output "${manager_locations}" >/dev/null
rm -f -- "${proxy_secrets}/manager-v2-client.pem"
if "${preflight}" --env-file "${tmp_dir}/manager.env" --mode manager-offline \
    >/dev/null 2>&1; then
  printf 'Manager preflight unexpectedly accepted a missing client identity.\n' >&2
  exit 1
fi
{
  cat "${pki_dir}/manager-v2-client.crt"
  cat "${pki_dir}/manager-v2-client.key"
} > "${proxy_secrets}/manager-v2-client.pem"
chmod 0640 "${proxy_secrets}/manager-v2-client.pem"
chgrp "${runtime_gid}" "${proxy_secrets}/manager-v2-client.pem"
"${preflight}" --env-file "${tmp_dir}/manager.env" --mode manager-offline >/dev/null
manager_active_env="${tmp_dir}/manager-active.env"
manager_active_config="${tmp_dir}/srv/primus/portal/source-proxy/nginx.manager-live.conf"
cp "${tmp_dir}/manager.env" "${manager_active_env}"
sed -i \
  -e 's/^SOURCE_PROXY_SOURCE_MODE=manager-paper-read$/SOURCE_PROXY_SOURCE_MODE=manager-profile-read/' \
  -e "s#^SOURCE_PROXY_CONFIG_FILE=.*#SOURCE_PROXY_CONFIG_FILE=${manager_active_config}#" \
  -e 's/^EDGE_ENVIRONMENT=paper$/EDGE_ENVIRONMENT=live/' \
  -e 's/^EDGE_PRIVATE_PORT=8443$/EDGE_PRIVATE_PORT=8445/' \
  -e 's/^EDGE_DELEGATION_AUDIENCE=portal-execution-edge-paper$/EDGE_DELEGATION_AUDIENCE=portal-execution-edge-live/' \
  -e 's/^EDGE_MANAGER_V2_READ_ENABLED=false$/EDGE_MANAGER_V2_READ_ENABLED=true/' \
  -e 's/^EDGE_MANAGER_V2_PROFILE_ID=$/EDGE_MANAGER_V2_PROFILE_ID=LIVE_BINANCE_USDM/' \
  -e 's/^SOURCE_PROXY_MANAGER_PROFILE_ID=$/SOURCE_PROXY_MANAGER_PROFILE_ID=LIVE_BINANCE_USDM/' \
  -e 's/^SOURCE_PROXY_MANAGER_FACADE_PORT=$/SOURCE_PROXY_MANAGER_FACADE_PORT=8223/' \
  -e 's/^SOURCE_PROXY_MANAGER_ISSUER_PORT=$/SOURCE_PROXY_MANAGER_ISSUER_PORT=8224/' \
  -e "s#^SOURCE_PROXY_MANAGER_LOCATIONS_FILE=.*#SOURCE_PROXY_MANAGER_LOCATIONS_FILE=${manager_locations}#" \
  "${manager_active_env}"
chmod 0600 "${manager_active_env}"
"${renderer}" --env-file "${manager_active_env}" --output "${manager_active_config}" \
  --manager-locations-output "${manager_locations}" >/dev/null
"${preflight}" --env-file "${manager_active_env}" --mode manager-active-offline >/dev/null
[[ "$(grep -Fxc '    proxy_pass https://127.0.0.1:8223;' "${manager_locations}")" -eq 5 ]]
[[ "$(grep -Fxc '    proxy_pass https://127.0.0.1:8224/internal/issue;' "${manager_locations}")" -eq 1 ]]
sed -i 's/^SOURCE_PROXY_MANAGER_PROFILE_ID=LIVE_BINANCE_USDM$/SOURCE_PROXY_MANAGER_PROFILE_ID=SANDBOX_BINANCE_USDM/' \
  "${manager_active_env}"
if "${preflight}" --env-file "${manager_active_env}" --mode manager-active-offline \
    >/dev/null 2>&1; then
  printf 'Manager active-read preflight accepted a cross-profile Source Proxy overlay.\n' >&2
  exit 1
fi
sed -i 's/^SOURCE_PROXY_MANAGER_PROFILE_ID=SANDBOX_BINANCE_USDM$/SOURCE_PROXY_MANAGER_PROFILE_ID=LIVE_BINANCE_USDM/' \
  "${manager_active_env}"
sed -i 's#127\.0\.0\.1:8223#127.0.0.1:8225#' "${manager_locations}"
if "${preflight}" --env-file "${manager_active_env}" --mode manager-active-offline \
    >/dev/null 2>&1; then
  printf 'Manager profile overlay preflight accepted an unapproved facade upstream.\n' >&2
  exit 1
fi
"${renderer}" --env-file "${manager_active_env}" --output "${manager_active_config}" \
  --manager-locations-output "${manager_locations}" >/dev/null
manager_proxy_syntax_config="${tmp_dir}/source-proxy.manager.syntax-test.conf"
sed 's/listen 172\.23\.0\.1:8444 ssl;/listen 127.0.0.1:18445 ssl;/' \
  "${manager_active_config}" > "${manager_proxy_syntax_config}"
chmod 0640 "${manager_proxy_syntax_config}"
chgrp "${runtime_gid}" "${manager_proxy_syntax_config}"

# The same accepted D2 identity boundary may be promoted to D3 only by the
# three-field probe-only delta. Public contracts/health open; all four
# alpha/account paths and every projection/query/realtime/command gate remain
# closed, and the harmless dark header replaces a Trading System credential.
probe_config="${tmp_dir}/srv/primus/portal/source-proxy/nginx.d3-probe.conf"
"${probe_renderer}" --d2-env "${tmp_dir}/candidate.env" \
  --output "${tmp_dir}/probe.env" --proxy-config "${probe_config}" >/dev/null
"${preflight}" --env-file "${tmp_dir}/probe.env" --mode probe-offline >/dev/null
[[ "$(grep -c 'return 503;' "${probe_config}")" -eq 4 ]]
[[ "$(grep -c 'D3 contract-probe gate accepted' "${probe_config}")" -eq 3 ]]
if grep -Fq 'X-API-Key' "${probe_config}"; then
  printf 'D3 contract probe unexpectedly rendered a Trading System API key.\n' >&2
  exit 1
fi
cp "${tmp_dir}/probe.env" "${tmp_dir}/unsafe-probe-alpha.env"
sed -i 's/^EDGE_PROBE_ALPHA_ID=$/EDGE_PROBE_ALPHA_ID=alpha-not-authorized/' \
  "${tmp_dir}/unsafe-probe-alpha.env"
if "${preflight}" --env-file "${tmp_dir}/unsafe-probe-alpha.env" \
    --mode probe-offline >/dev/null 2>&1; then
  printf 'D3 preflight unexpectedly accepted an alpha-scoped contract probe.\n' >&2
  exit 1
fi
if "${preflight}" --env-file "${env_example}" --mode offline >/dev/null 2>&1; then
  printf 'D2 offline preflight unexpectedly accepted template digests.\n' >&2
  exit 1
fi

cp "${tmp_dir}/candidate.env" "${tmp_dir}/rollback.env"
sed -i '/^PORTAL_.*_IMAGE=/ s/sha256:1111111111111111111111111111111111111111111111111111111111111111/sha256:2222222222222222222222222222222222222222222222222222222222222222/' \
  "${tmp_dir}/rollback.env"
chmod 0600 "${tmp_dir}/rollback.env"
"${preflight}" --env-file "${tmp_dir}/rollback.env" --mode offline >/dev/null

command -v docker >/dev/null 2>&1 || {
  printf 'Docker CLI is required for D2 Compose/image verification.\n' >&2
  exit 1
}
docker_cli=(docker)
if ! docker info >/dev/null 2>&1; then
  sudo -n docker info >/dev/null 2>&1 || {
    printf 'D2 verification requires Docker access or scoped passwordless sudo docker.\n' >&2
    exit 1
  }
  docker_cli=(sudo -n docker)
fi
compose=("${docker_cli[@]}" compose --project-directory "${root_dir}" -f "${compose_base}" -f "${compose_dark}")
"${compose[@]}" --env-file "${tmp_dir}/candidate.env" config --quiet
"${compose[@]}" --env-file "${tmp_dir}/candidate.env" config > "${tmp_dir}/candidate.yaml"
"${compose[@]}" --env-file "${tmp_dir}/rollback.env" config > "${tmp_dir}/rollback.yaml"
manager_profile_render=("${docker_cli[@]}" compose --project-directory "${root_dir}" \
  -f "${compose_base}" -f "${compose_dark}" -f "${manager_profile_compose}" \
  -f "${manager_proxy_profile_compose}")
"${manager_profile_render[@]}" --env-file "${manager_active_env}" config --quiet
"${manager_profile_render[@]}" --env-file "${manager_active_env}" config > "${tmp_dir}/manager-profile.yaml"
grep -Fq 'EDGE_MANAGER_V2_READ_ENABLED: "true"' "${tmp_dir}/manager-profile.yaml"
grep -Fq 'EDGE_MANAGER_V2_PROFILE_ID: LIVE_BINANCE_USDM' "${tmp_dir}/manager-profile.yaml"
grep -Fq "source: ${manager_locations}" "${tmp_dir}/manager-profile.yaml"
grep -Fq 'target: /run/secrets/manager-v2-locations.conf' "${tmp_dir}/manager-profile.yaml"
for flag in EDGE_PROJECTION_INGESTION_ENABLED EDGE_SOURCE_PROBES_ENABLED \
  EDGE_REALTIME_SSE_ENABLED EDGE_ANALYTICS_QUERY_ENABLED EDGE_COMMAND_RELAY_ENABLED; do
  grep -Fq "${flag}: \"false\"" "${tmp_dir}/manager-profile.yaml"
done
if grep -Eq 'published: "(5432|8000|8444)"' "${tmp_dir}/manager-profile.yaml"; then
  printf 'Manager profile manifest unexpectedly published DB/Source Proxy/TS traffic.\n' >&2
  exit 1
fi

for rendered in "${tmp_dir}/candidate.yaml" "${tmp_dir}/rollback.yaml"; do
  grep -Fq 'EDGE_PROJECTION_INGESTION_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_SOURCE_PROBES_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_REALTIME_SSE_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_ANALYTICS_QUERY_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_SHADOW_QUERY_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_PAPER_WORKBENCH_SHADOW_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_COMMAND_RELAY_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_ANALYTICS_SOURCE_PROFILE: fixture' "${rendered}"
  grep -Fq 'POSTGRES_PASSWORD_FILE: /run/secrets/postgres-bootstrap-password' "${rendered}"
  grep -Fq 'ssl=on' "${rendered}"
  grep -Fq 'projection-migrate' "${rendered}"
  grep -Fq 'service_completed_successfully' "${rendered}"
  grep -Fq 'read_only: true' "${rendered}"
  grep -Fq 'no-new-privileges:true' "${rendered}"
  grep -Fq 'pids_limit:' "${rendered}"
  grep -Fq 'mem_limit:' "${rendered}"
  if grep -Eq 'published: "(5432|8000|8444)"' "${rendered}"; then
    printf 'D2 dark manifest unexpectedly published DB/Source Proxy/TS traffic.\n' >&2
    exit 1
  fi
done
sed -E 's/@sha256:[a-f0-9]{64}/@sha256:DIGEST/g' "${tmp_dir}/candidate.yaml" > "${tmp_dir}/candidate.normalized"
sed -E 's/@sha256:[a-f0-9]{64}/@sha256:DIGEST/g' "${tmp_dir}/rollback.yaml" > "${tmp_dir}/rollback.normalized"
diff -u "${tmp_dir}/candidate.normalized" "${tmp_dir}/rollback.normalized"

# Fail closed on a widened runtime flag and on parser injection.
cp "${tmp_dir}/candidate.env" "${tmp_dir}/unsafe.env"
sed -i 's/^EDGE_ANALYTICS_QUERY_ENABLED=false$/EDGE_ANALYTICS_QUERY_ENABLED=true/' "${tmp_dir}/unsafe.env"
chmod 0600 "${tmp_dir}/unsafe.env"
if "${preflight}" --env-file "${tmp_dir}/unsafe.env" --mode offline >/dev/null 2>&1; then
  printf 'D2 preflight unexpectedly accepted an enabled analytics flag.\n' >&2
  exit 1
fi
cp "${tmp_dir}/candidate.env" "${tmp_dir}/unsafe-shadow.env"
sed -i 's/^EDGE_SHADOW_QUERY_ENABLED=false$/EDGE_SHADOW_QUERY_ENABLED=true/' "${tmp_dir}/unsafe-shadow.env"
chmod 0600 "${tmp_dir}/unsafe-shadow.env"
if "${preflight}" --env-file "${tmp_dir}/unsafe-shadow.env" --mode offline >/dev/null 2>&1; then
  printf 'D2 preflight unexpectedly accepted an enabled N07 shadow-query flag.\n' >&2
  exit 1
fi
cp "${tmp_dir}/candidate.env" "${tmp_dir}/unsafe-command.env"
sed -i 's/^EDGE_COMMAND_RELAY_ENABLED=false$/EDGE_COMMAND_RELAY_ENABLED=true/' "${tmp_dir}/unsafe-command.env"
chmod 0600 "${tmp_dir}/unsafe-command.env"
if "${preflight}" --env-file "${tmp_dir}/unsafe-command.env" --mode offline >/dev/null 2>&1; then
  printf 'D2 preflight unexpectedly accepted command relay.\n' >&2
  exit 1
fi
cp "${tmp_dir}/candidate.env" "${tmp_dir}/unsafe-probe.env"
sed -i 's/^EDGE_SOURCE_PROBES_ENABLED=false$/EDGE_SOURCE_PROBES_ENABLED=true/' "${tmp_dir}/unsafe-probe.env"
chmod 0600 "${tmp_dir}/unsafe-probe.env"
if "${preflight}" --env-file "${tmp_dir}/unsafe-probe.env" --mode offline >/dev/null 2>&1; then
  printf 'D2 preflight unexpectedly accepted source probes.\n' >&2
  exit 1
fi
cp "${tmp_dir}/candidate.env" "${tmp_dir}/malicious.env"
sed -i 's/^EDGE_ENVIRONMENT=paper$/EDGE_ENVIRONMENT=$(touch bad)/' "${tmp_dir}/malicious.env"
chmod 0600 "${tmp_dir}/malicious.env"
if "${preflight}" --env-file "${tmp_dir}/malicious.env" --mode template >/dev/null 2>&1; then
  printf 'D2 preflight unexpectedly accepted executable input.\n' >&2
  exit 1
fi
[[ ! -e "${root_dir}/bad" && ! -e "${tmp_dir}/bad" ]] || {
  printf 'D2 env input was executed.\n' >&2
  exit 1
}

# Prove the renderer establishes the configured supplemental group before the
# target-host readiness step. The fixture uses temporary paths, so it runs the
# identical file/identity validation in offline mode; real readiness remains
# locked to /srv/primus/portal and is an explicit D2 deployment gate.
"${preflight}" --env-file "${tmp_dir}/candidate.env" --mode offline >/dev/null

if [[ "${build_images}" == true ]]; then
  "${docker_cli[@]}" build --pull \
    --file "${root_dir}/deploy/images/source-proxy.Dockerfile" \
    --tag portal-source-proxy:pre-iam-05 "${root_dir}"
  "${docker_cli[@]}" build --pull \
    --file "${root_dir}/deploy/images/execution-edge.Dockerfile" \
    --tag portal-execution-edge:pre-iam-05 "${root_dir}"
  [[ "$("${docker_cli[@]}" image inspect --format '{{.Config.User}}' portal-source-proxy:pre-iam-05)" == 101:101 ]]
  [[ "$("${docker_cli[@]}" image inspect --format '{{.Config.User}}' portal-execution-edge:pre-iam-05)" == 65532:65532 ]]
  "${docker_cli[@]}" run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --entrypoint /bin/sh \
    portal-source-proxy:pre-iam-05 -ceu 'test "$(id -u)" = 101; nginx -v; test ! -w /'
  "${docker_cli[@]}" run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --group-add "${runtime_gid}" \
    --volume "${proxy_syntax_config}:/etc/nginx/nginx.conf:ro" \
    --volume "${proxy_secrets}:/run/secrets:ro" \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m \
    --tmpfs /var/cache/nginx:rw,noexec,nosuid,nodev,size=8m,mode=0750,uid=101,gid=101 \
    --entrypoint nginx portal-source-proxy:pre-iam-05 -t -q
  "${docker_cli[@]}" run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --group-add "${runtime_gid}" \
    --volume "${manager_proxy_syntax_config}:/etc/nginx/nginx.conf:ro" \
    --volume "${proxy_secrets}:/run/secrets:ro" \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m \
    --tmpfs /var/cache/nginx:rw,noexec,nosuid,nodev,size=8m,mode=0750,uid=101,gid=101 \
    --entrypoint nginx portal-source-proxy:pre-iam-05 -t -q
  if "${docker_cli[@]}" run --rm --network none --read-only --cap-drop ALL \
      --security-opt no-new-privileges --group-add "${runtime_gid}" \
      --volume "${edge_secrets}:/run/secrets:ro" \
      portal-execution-edge:pre-iam-05 unsupported-command-for-runtime-proof \
      >/dev/null 2>&1; then
    printf 'Distroless D2 Edge unexpectedly accepted an unsupported command.\n' >&2
    exit 1
  fi

  # Exercise the real first-boot PostgreSQL boundary and the compiled Rust
  # migrator on an isolated, unpublished Docker network. Named volumes let the
  # fixtures carry the same container ownership as production without relaxing
  # the host preflight permissions above.
  "${docker_cli[@]}" network create --internal "${integration_network}" >/dev/null
  for volume in "${integration_pgdata}" "${integration_pgsecrets}" \
    "${integration_edgesecrets}"; do
    "${docker_cli[@]}" volume create "${volume}" >/dev/null
  done
  "${docker_cli[@]}" run --rm --user 0:0 \
    --volume "${projection_secrets}:/fixture:ro" \
    --volume "${projection_init}:/fixture-init:ro" \
    --volume "${integration_pgsecrets}:/destination" \
    --entrypoint /bin/sh "${PORTAL_PROJECTION_POSTGRES_IMAGE:-docker.io/library/postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685}" \
    -ceu 'cp /fixture/* /destination/; cp /fixture-init /destination/10-portal-projection.sh; chown -R 0:70 /destination; chmod 0750 /destination; chmod 0644 /destination/projection-postgres.crt; chmod 0640 /destination/projection-postgres.key /destination/*password; chmod 0550 /destination/10-portal-projection.sh'
  "${docker_cli[@]}" run --rm --user 0:0 \
    --volume "${edge_secrets}:/fixture:ro" \
    --volume "${integration_edgesecrets}:/destination" \
    --entrypoint /bin/sh "${PORTAL_PROJECTION_POSTGRES_IMAGE:-docker.io/library/postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685}" \
    -ceu 'cp /fixture/* /destination/; chown -R 65532:65532 /destination; chmod 0750 /destination; chmod 0644 /destination/*.crt /destination/*.json; chmod 0640 /destination/*.key /destination/*.pem /destination/*token /destination/*database-url'

  "${docker_cli[@]}" run --detach --name "${integration_pg}" \
    --network "${integration_network}" --network-alias projection-postgres \
    --read-only --security-opt no-new-privileges --pids-limit 128 \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=16m,mode=1777 \
    --tmpfs /run/postgresql:rw,noexec,nosuid,nodev,size=8m,mode=3775,uid=70,gid=70 \
    --volume "${integration_pgdata}:/var/lib/postgresql/data" \
    --volume "${integration_pgsecrets}:/run/secrets:ro" \
    --volume "${integration_pgsecrets}:/docker-entrypoint-initdb.d:ro" \
    --env POSTGRES_USER=postgres --env POSTGRES_DB=postgres \
    --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres-bootstrap-password \
    --env 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=trust' \
    --env PROJECTION_DB_NAME=portal_projection \
    --env PROJECTION_DB_OWNER_USER=portal_projection_owner \
    --env PROJECTION_DB_RUNTIME_USER=portal_projection_runtime \
    "${PORTAL_PROJECTION_POSTGRES_IMAGE:-docker.io/library/postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685}" \
    postgres -c ssl=on \
      -c ssl_cert_file=/run/secrets/projection-postgres.crt \
      -c ssl_key_file=/run/secrets/projection-postgres.key \
      -c password_encryption=scram-sha-256 >/dev/null

  projection_ready=false
  for _ in $(seq 1 40); do
    if "${docker_cli[@]}" exec "${integration_pg}" \
      pg_isready -q -h 127.0.0.1 -U postgres -d postgres; then
      projection_ready=true
      break
    fi
    sleep 1
  done
  if [[ "${projection_ready}" != true ]]; then
    "${docker_cli[@]}" logs "${integration_pg}" >&2
    printf 'D2 projection PostgreSQL did not become ready.\n' >&2
    exit 1
  fi

  "${docker_cli[@]}" run --rm --network "${integration_network}" \
    --read-only --cap-drop ALL --security-opt no-new-privileges \
    --user 65532:65532 --volume "${integration_edgesecrets}:/run/secrets:ro" \
    --env EDGE_PROJECTION_DATABASE_URL_FILE=/run/secrets/projection-migration-database-url \
    portal-execution-edge:pre-iam-05 projection-migrate
  "${docker_cli[@]}" run --rm --network "${integration_network}" \
    --read-only --cap-drop ALL --security-opt no-new-privileges \
    --user 65532:65532 --volume "${integration_edgesecrets}:/run/secrets:ro" \
    --env EDGE_PROJECTION_DATABASE_URL_FILE=/run/secrets/projection-database-url \
    portal-execution-edge:pre-iam-05 projection-check

  role_evidence="$("${docker_cli[@]}" exec "${integration_pg}" psql \
    --username postgres --dbname postgres --tuples-only --no-align \
    --command "SELECT rolname || ':' || CASE WHEN NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole THEN 'SAFE' ELSE 'UNSAFE' END FROM pg_roles WHERE rolname IN ('portal_projection_owner','portal_projection_runtime') ORDER BY rolname")"
  [[ "${role_evidence}" == $'portal_projection_owner:SAFE\nportal_projection_runtime:SAFE' ]] || {
    printf 'D2 projection role authority evidence is incomplete or unsafe.\n' >&2
    exit 1
  }
  database_owner="$("${docker_cli[@]}" exec "${integration_pg}" psql \
    --username postgres --dbname postgres --tuples-only --no-align \
    --command "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='portal_projection'")"
  [[ "${database_owner}" == portal_projection_owner ]]
  if "${docker_cli[@]}" exec \
      --env PGPASSWORD="${runtime_password}" "${integration_pg}" psql \
      --host projection-postgres --username portal_projection_runtime \
      --dbname portal_projection --set ON_ERROR_STOP=1 \
      --command 'CREATE TABLE portal_projection.runtime_must_not_ddl(id integer)' \
      >/dev/null 2>&1; then
    printf 'D2 runtime projection role unexpectedly gained DDL authority.\n' >&2
    exit 1
  fi
  if "${docker_cli[@]}" exec \
      --env PGPASSWORD="${runtime_password}" "${integration_pg}" psql \
      'sslmode=disable host=projection-postgres dbname=portal_projection user=portal_projection_runtime' \
      --command 'SELECT 1' >/dev/null 2>&1; then
    printf 'D2 projection PostgreSQL unexpectedly accepted plaintext transport.\n' >&2
    exit 1
  fi
  projection_port_bindings="$("${docker_cli[@]}" inspect \
    --format '{{json .HostConfig.PortBindings}}' "${integration_pg}")"
  [[ "${projection_port_bindings}" == '{}' || "${projection_port_bindings}" == null ]]

  # D2 Edge must become ready with no Source Proxy container or source route
  # available. This is the executable proof that dark startup performs no
  # capability or business-data probe.
  "${docker_cli[@]}" run --detach --name "${integration_edge}" \
    --network "${integration_network}" --read-only --cap-drop ALL \
    --security-opt no-new-privileges --pids-limit 128 --user 65532:65532 \
    --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m,mode=1777 \
    --volume "${integration_edgesecrets}:/run/secrets:ro" \
    --env EDGE_BIND_ADDRESS=0.0.0.0:8443 \
    --env EDGE_HEALTH_BIND_ADDRESS=127.0.0.1:9100 \
    --env EDGE_ENVIRONMENT=paper \
    --env EDGE_TLS_CERTIFICATE_FILE=/run/secrets/edge-server.crt \
    --env EDGE_TLS_PRIVATE_KEY_FILE=/run/secrets/edge-server.key \
    --env EDGE_TLS_CLIENT_CA_FILE=/run/secrets/sgp-client-ca.crt \
    --env EDGE_DELEGATION_JWKS_FILE=/run/secrets/control-api.jwks.json \
    --env EDGE_DELEGATION_ISSUER=portal-control-api \
    --env EDGE_DELEGATION_AUDIENCE=portal-execution-edge-paper \
    --env EDGE_SOURCE_ORIGIN=https://source-proxy-does-not-exist:8444 \
    --env EDGE_SOURCE_CA_FILE=/run/secrets/source-proxy-ca.crt \
    --env EDGE_SOURCE_CLIENT_IDENTITY_FILE=/run/secrets/source-proxy-client.pem \
    --env EDGE_SOURCE_API_KEY_FILE=/run/secrets/source-proxy-admission-token \
    --env EDGE_SOURCE_GATEWAY_DIGEST=sha256:8a81f121f068bec80821c5f3be38c8865682e248147f1ca808800a18ea8c1fde \
    --env EDGE_SOURCE_PROBES_ENABLED=false \
    --env EDGE_MANAGER_V2_READ_ENABLED=false \
    --env EDGE_PROJECTION_INGESTION_ENABLED=false \
    --env EDGE_REALTIME_SSE_ENABLED=false \
    --env EDGE_ANALYTICS_QUERY_ENABLED=false \
    --env EDGE_ANALYTICS_SOURCE_PROFILE=fixture \
    --env EDGE_COMMAND_RELAY_ENABLED=false \
    portal-execution-edge:pre-iam-05 serve >/dev/null
  edge_ready=false
  for _ in $(seq 1 20); do
    if "${docker_cli[@]}" exec "${integration_edge}" \
      /usr/local/bin/portal-execution-edge healthcheck >/dev/null 2>&1; then
      edge_ready=true
      break
    fi
    sleep 1
  done
  if [[ "${edge_ready}" != true ]]; then
    "${docker_cli[@]}" logs "${integration_edge}" >&2
    printf 'D2 Execution Edge did not become ready while source probes were disabled.\n' >&2
    exit 1
  fi
  edge_port_bindings="$("${docker_cli[@]}" inspect \
    --format '{{json .HostConfig.PortBindings}}' "${integration_edge}")"
  [[ "${edge_port_bindings}" == '{}' || "${edge_port_bindings}" == null ]]
  [[ "$("${docker_cli[@]}" inspect --format '{{.State.Restarting}}' "${integration_edge}")" == false ]]
  printf 'PRE-IAM-05 D2 runtime image, isolated PostgreSQL/migrator and source-dark Edge gates passed. Cleanup will now remove every disposable service and volume.\n'
else
  printf 'PRE-IAM-05 D2 dark manifest, preflight and rollback gates passed. No service started.\n'
fi
