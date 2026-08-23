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

python3 - "${compose_base}" "${compose_dark}" <<'PY'
from pathlib import Path
import sys

base = Path(sys.argv[1]).read_text()
dark = Path(sys.argv[2]).read_text()
for token in ('cpus: "1.5"', 'mem_limit: 1024m', 'mem_reservation: 256m'):
    if token not in base:
        raise SystemExit(f"D2 Edge resource contract missing: {token}")
for token in (
    'cpus: "1.0"',
    'mem_limit: 1024m',
    'cpus: "0.50"',
    'mem_limit: 512m',
    'cpus: "0.25"',
    'mem_limit: 256m',
    'mem_reservation: 64m',
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
  -e 's/^EDGE_SOURCE_GATEWAY_DIGEST=.*/EDGE_SOURCE_GATEWAY_DIGEST=sha256:3333333333333333333333333333333333333333333333333333333333333333/' \
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
for ca in edge-ca sgp-client-ca source-server-ca projection-client-ca projection-db-ca; do make_ca "${ca}"; done
make_leaf edge-server edge-ca serverAuth
make_leaf source-proxy-server source-server-ca serverAuth
make_leaf source-proxy-client projection-client-ca clientAuth
make_leaf projection-postgres projection-db-ca serverAuth DNS:projection-postgres

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
for file in source-proxy-server.crt projection-ingestor-ca.crt; do
  chmod 0644 "${proxy_secrets}/${file}"
  chgrp "${runtime_gid}" "${proxy_secrets}/${file}"
done
chmod 0640 "${proxy_secrets}/source-proxy-server.key"
chgrp "${runtime_gid}" "${proxy_secrets}/source-proxy-server.key"
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
[[ "$(grep -c 'return 503;' "${proxy_config}")" -eq 7 ]]
if grep -Fq 'X-API-Key' "${proxy_config}"; then
  printf 'D2 dark Source Proxy unexpectedly rendered a Trading System API key.\n' >&2
  exit 1
fi

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

for rendered in "${tmp_dir}/candidate.yaml" "${tmp_dir}/rollback.yaml"; do
  grep -Fq 'EDGE_PROJECTION_INGESTION_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_SOURCE_PROBES_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_REALTIME_SSE_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_ANALYTICS_QUERY_ENABLED: "false"' "${rendered}"
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
    --volume "${edge_secrets}:/run/secrets:ro" --entrypoint /bin/sh \
    portal-execution-edge:pre-iam-05 -ceu \
    'test "$(id -u)" = 65532; test -x /usr/local/bin/portal-execution-edge; test -r /run/secrets/edge-server.key; test ! -w /'

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
    --entrypoint /bin/sh portal-execution-edge:pre-iam-05 \
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
    --env EDGE_SOURCE_GATEWAY_DIGEST=sha256:3333333333333333333333333333333333333333333333333333333333333333 \
    --env EDGE_SOURCE_PROBES_ENABLED=false \
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
