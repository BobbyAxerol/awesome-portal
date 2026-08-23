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
env_example="${root_dir}/deploy/execution-d1/edge-source-proxy.env.example"
compose_base="${root_dir}/deploy/compose.execution-edge.yaml"
compose_dark="${root_dir}/deploy/execution-d1/compose.dark.yaml"

bash -n "${preflight}" "${renderer}" "$0"
"${preflight}" --env-file "${env_example}" --mode template >/dev/null
grep -Eq '^EDGE_SECRET_DIRECTORY=/srv/primus/portal/' "${env_example}"
grep -Eq '^SOURCE_PROXY_SECRET_DIRECTORY=/srv/primus/portal/' "${env_example}"
grep -Eq '^SOURCE_PROXY_CONFIG_FILE=/srv/primus/portal/' "${env_example}"

tmp_dir="$(mktemp -d)"
docker_cli=()
cleanup() {
  if [[ "${build_images}" == true && "${#docker_cli[@]}" -gt 0 ]]; then
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
mkdir -p "${edge_secrets}" "${proxy_secrets}"
chmod 0750 "${edge_secrets}" "${proxy_secrets}"
chgrp "${runtime_gid}" "${edge_secrets}" "${proxy_secrets}"

cp "${env_example}" "${tmp_dir}/candidate.env"
sed -i \
  -e 's/sha256:0000000000000000000000000000000000000000000000000000000000000000/sha256:1111111111111111111111111111111111111111111111111111111111111111/' \
  -e 's/^EDGE_SOURCE_GATEWAY_DIGEST=.*/EDGE_SOURCE_GATEWAY_DIGEST=sha256:3333333333333333333333333333333333333333333333333333333333333333/' \
  -e "s/^PORTAL_RUNTIME_GID=.*/PORTAL_RUNTIME_GID=${runtime_gid}/" \
  -e "s#^EDGE_SECRET_DIRECTORY=.*#EDGE_SECRET_DIRECTORY=${edge_secrets}#" \
  -e "s#^SOURCE_PROXY_SECRET_DIRECTORY=.*#SOURCE_PROXY_SECRET_DIRECTORY=${proxy_secrets}#" \
  -e "s#^SOURCE_PROXY_CONFIG_FILE=.*#SOURCE_PROXY_CONFIG_FILE=${proxy_config}#" \
  "${tmp_dir}/candidate.env"

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
  local name="$1" ca="$2" usage="$3"
  openssl req -newkey rsa:2048 -nodes -sha256 -subj "/CN=${name}" \
    -keyout "${pki_dir}/${name}.key" -out "${pki_dir}/${name}.csr" >/dev/null 2>&1
  printf 'extendedKeyUsage=%s\n' "${usage}" > "${pki_dir}/${name}.ext"
  openssl x509 -req -in "${pki_dir}/${name}.csr" -days 2 -sha256 \
    -CA "${pki_dir}/${ca}.crt" -CAkey "${pki_dir}/${ca}.key" -CAcreateserial \
    -extfile "${pki_dir}/${name}.ext" -out "${pki_dir}/${name}.crt" >/dev/null 2>&1
}
for ca in edge-ca sgp-client-ca source-server-ca projection-client-ca; do make_ca "${ca}"; done
make_leaf edge-server edge-ca serverAuth
make_leaf source-proxy-server source-server-ca serverAuth
make_leaf source-proxy-client projection-client-ca clientAuth

cp "${pki_dir}/edge-server.crt" "${edge_secrets}/edge-server.crt"
cp "${pki_dir}/edge-server.key" "${edge_secrets}/edge-server.key"
cp "${pki_dir}/sgp-client-ca.crt" "${edge_secrets}/sgp-client-ca.crt"
cp "${pki_dir}/source-server-ca.crt" "${edge_secrets}/source-proxy-ca.crt"
{
  cat "${pki_dir}/source-proxy-client.crt"
  cat "${pki_dir}/source-proxy-client.key"
} > "${edge_secrets}/source-proxy-client.pem"
printf '{"keys":[{"kty":"RSA","kid":"offline-d2","n":"AQAB","e":"AQAB"}]}\n' \
  > "${edge_secrets}/control-api.jwks.json"
printf '0123456789abcdef0123456789abcdef\n' \
  > "${edge_secrets}/source-proxy-admission-token"
cp "${pki_dir}/source-proxy-server.crt" "${proxy_secrets}/source-proxy-server.crt"
cp "${pki_dir}/source-proxy-server.key" "${proxy_secrets}/source-proxy-server.key"
cp "${pki_dir}/projection-client-ca.crt" "${proxy_secrets}/projection-ingestor-ca.crt"

for file in edge-server.crt sgp-client-ca.crt control-api.jwks.json source-proxy-ca.crt; do
  chmod 0644 "${edge_secrets}/${file}"
  chgrp "${runtime_gid}" "${edge_secrets}/${file}"
done
for file in edge-server.key source-proxy-client.pem source-proxy-admission-token; do
  chmod 0640 "${edge_secrets}/${file}"
  chgrp "${runtime_gid}" "${edge_secrets}/${file}"
done
for file in source-proxy-server.crt projection-ingestor-ca.crt; do
  chmod 0644 "${proxy_secrets}/${file}"
  chgrp "${runtime_gid}" "${proxy_secrets}/${file}"
done
chmod 0640 "${proxy_secrets}/source-proxy-server.key"
chgrp "${runtime_gid}" "${proxy_secrets}/source-proxy-server.key"
printf 'proxy_set_header X-API-Key offline-test-value-0123456789;\n' \
  > "${proxy_secrets}/trading-system-read-header.conf"
chmod 0640 "${proxy_secrets}/trading-system-read-header.conf"
chgrp "${runtime_gid}" "${proxy_secrets}/trading-system-read-header.conf"

"${preflight}" --env-file "${tmp_dir}/candidate.env" --mode offline >/dev/null
if "${preflight}" --env-file "${env_example}" --mode offline >/dev/null 2>&1; then
  printf 'D2 offline preflight unexpectedly accepted template digests.\n' >&2
  exit 1
fi

cp "${tmp_dir}/candidate.env" "${tmp_dir}/rollback.env"
sed -i '/^PORTAL_.*_IMAGE=/ s/sha256:1111111111111111111111111111111111111111111111111111111111111111/sha256:2222222222222222222222222222222222222222222222222222222222222222/' \
  "${tmp_dir}/rollback.env"
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
  grep -Fq 'EDGE_REALTIME_SSE_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_ANALYTICS_QUERY_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_COMMAND_RELAY_ENABLED: "false"' "${rendered}"
  grep -Fq 'EDGE_ANALYTICS_SOURCE_PROFILE: fixture' "${rendered}"
  grep -Fq 'read_only: true' "${rendered}"
  grep -Fq 'no-new-privileges:true' "${rendered}"
  grep -Fq 'pids_limit:' "${rendered}"
  grep -Fq 'mem_limit:' "${rendered}"
  if grep -Eq 'published: "(8000|8444)"' "${rendered}"; then
    printf 'D2 dark manifest unexpectedly published Source Proxy/TS traffic.\n' >&2
    exit 1
  fi
done
sed -E 's/@sha256:[a-f0-9]{64}/@sha256:DIGEST/g' "${tmp_dir}/candidate.yaml" > "${tmp_dir}/candidate.normalized"
sed -E 's/@sha256:[a-f0-9]{64}/@sha256:DIGEST/g' "${tmp_dir}/rollback.yaml" > "${tmp_dir}/rollback.normalized"
diff -u "${tmp_dir}/candidate.normalized" "${tmp_dir}/rollback.normalized"

# Fail closed on a widened runtime flag and on parser injection.
cp "${tmp_dir}/candidate.env" "${tmp_dir}/unsafe.env"
sed -i 's/^EDGE_ANALYTICS_QUERY_ENABLED=false$/EDGE_ANALYTICS_QUERY_ENABLED=true/' "${tmp_dir}/unsafe.env"
if "${preflight}" --env-file "${tmp_dir}/unsafe.env" --mode offline >/dev/null 2>&1; then
  printf 'D2 preflight unexpectedly accepted an enabled analytics flag.\n' >&2
  exit 1
fi
cp "${tmp_dir}/candidate.env" "${tmp_dir}/unsafe-command.env"
sed -i 's/^EDGE_COMMAND_RELAY_ENABLED=false$/EDGE_COMMAND_RELAY_ENABLED=true/' "${tmp_dir}/unsafe-command.env"
if "${preflight}" --env-file "${tmp_dir}/unsafe-command.env" --mode offline >/dev/null 2>&1; then
  printf 'D2 preflight unexpectedly accepted command relay.\n' >&2
  exit 1
fi
cp "${tmp_dir}/candidate.env" "${tmp_dir}/malicious.env"
sed -i 's/^EDGE_ENVIRONMENT=paper$/EDGE_ENVIRONMENT=$(touch bad)/' "${tmp_dir}/malicious.env"
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
fi

printf 'PRE-IAM-05 D2 dark manifest, preflight, rollback and image boundary gates passed. No service started.\n'
