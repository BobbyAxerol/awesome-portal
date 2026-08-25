#!/usr/bin/env bash
# Offline D4 proxy contract/config test. It uses synthetic PKI and never opens
# a source connection or reads a runtime credential.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_example="${root_dir}/deploy/execution-d1/edge-source-proxy.env.example"
owner_template="${root_dir}/deploy/execution-d4/owner-input.env.example"
contract_source="${root_dir}/services/portal-execution-edge-rs/contracts/d4-paper-read-v1/source-proxy-d4-read-locations.conf.template"
renderer="${root_dir}/scripts/execution-d4-render-source-proxy.sh"
preflight="${root_dir}/scripts/execution-d4-source-proxy-preflight.sh"
qualifier_preflight="${root_dir}/scripts/execution-d4-qualification-preflight.sh"

bash -n "${renderer}" "${preflight}" "${qualifier_preflight}" "$0"
tmp_dir="$(mktemp -d)"
cleanup() { rm -rf -- "${tmp_dir}"; }
trap cleanup EXIT

cp "${runtime_example}" "${tmp_dir}/runtime.env"
runtime_gid="$(id -g)"
if [[ "${runtime_gid}" == 0 ]]; then
  runtime_gid=987
fi
sed -i \
  -e 's/^SOURCE_PROXY_SOURCE_MODE=dark$/SOURCE_PROXY_SOURCE_MODE=paper-read/' \
  -e 's/^EDGE_SOURCE_PROBES_ENABLED=false$/EDGE_SOURCE_PROBES_ENABLED=true/' \
  -e "s/^PORTAL_RUNTIME_GID=.*/PORTAL_RUNTIME_GID=${runtime_gid}/" \
  "${tmp_dir}/runtime.env"
cp "${contract_source}" "${tmp_dir}/d4-paper-read-locations.conf"
"${renderer}" --env-file "${tmp_dir}/runtime.env" \
  --output "${tmp_dir}/nginx.conf" >/dev/null
"${preflight}" \
  --runtime-env "${tmp_dir}/runtime.env" \
  --owner-input "${owner_template}" \
  --config "${tmp_dir}/nginx.conf" \
  --contract "${tmp_dir}/d4-paper-read-locations.conf" \
  --mode template >/dev/null
"${qualifier_preflight}" \
  --edge-env "${tmp_dir}/runtime.env" \
  --qualifier-env "${root_dir}/deploy/execution-d4/qualification-runtime.env.example" \
  --owner-input "${owner_template}" \
  --mode template >/dev/null

# Syntax-check the complete Nginx config using synthetic material only.
mkdir -p "${tmp_dir}/secrets"
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -sha256 \
  -subj '/CN=d4-source-proxy-test' \
  -keyout "${tmp_dir}/secrets/source-proxy-server.key" \
  -out "${tmp_dir}/secrets/source-proxy-server.crt" >/dev/null 2>&1
cp "${tmp_dir}/secrets/source-proxy-server.crt" \
  "${tmp_dir}/secrets/projection-ingestor-ca.crt"
cat > "${tmp_dir}/secrets/trading-system-read-header.conf" <<'EOF'
proxy_set_header X-Portal-Paper-Read-Key "offline-synthetic-key-never-runtime";
proxy_set_header X-Portal-Read-Contract "d4.paper-read.v1";
EOF
chmod 0755 "${tmp_dir}" "${tmp_dir}/secrets"
chmod 0644 "${tmp_dir}/nginx.conf" "${tmp_dir}/d4-paper-read-locations.conf" \
  "${tmp_dir}/secrets/"*
# `nginx -t` in the pinned unprivileged image opens the configured listener.
# Syntax-check an otherwise byte-equivalent copy on container loopback; the
# preflight above independently proves the release config's exact bridge IP.
cp "${tmp_dir}/nginx.conf" "${tmp_dir}/nginx-syntax.conf"
sed -i "s/listen 172\.23\.0\.1:8444 ssl;/listen 127.0.0.1:18444 ssl;/" \
  "${tmp_dir}/nginx-syntax.conf"
chmod 0644 "${tmp_dir}/nginx-syntax.conf"

command -v docker >/dev/null 2>&1 || {
  printf 'Docker CLI is required for D4 Source Proxy syntax verification.\n' >&2
  exit 1
}
docker_cli=(docker)
if ! docker info >/dev/null 2>&1; then
  sudo -n docker info >/dev/null 2>&1 || {
    printf 'D4 Source Proxy test requires Docker access.\n' >&2
    exit 1
  }
  docker_cli=(sudo -n docker)
fi
cp "${tmp_dir}/runtime.env" "${tmp_dir}/compose.env"
cat >> "${tmp_dir}/compose.env" <<EOF
PROJECTION_DB_VOLUME_NAME=portal-execution-projection-pgdata-v2
DATA_DIRECTORY=/srv/primus/portal/projection-d4/postgres
SOURCE_PROXY_D4_CONTRACT_FILE=${tmp_dir}/d4-paper-read-locations.conf
D4_OWNER_INPUT_FILE=${owner_template}
D4_AUTHORIZATION_EVIDENCE_SHA256=sha256:$(sha256sum "${owner_template}" | cut -d' ' -f1)
D4_WORKSPACE_ID=workspace_d4_offline
D4_SOURCE_PROXY_ORIGIN=https://172.23.0.1:8444
EOF
compose=("${docker_cli[@]}" compose --project-directory "${root_dir}" \
  -f "${root_dir}/deploy/compose.execution-edge.yaml" \
  -f "${root_dir}/deploy/execution-d1/compose.dark.yaml" \
  -f "${root_dir}/deploy/execution-d4/compose.encrypted-storage.yaml" \
  -f "${root_dir}/deploy/execution-d4/compose.paper-read-shadow.yaml" \
  --profile d4-paper-read-shadow)
"${compose[@]}" --env-file "${tmp_dir}/compose.env" config --quiet
"${compose[@]}" --env-file "${tmp_dir}/compose.env" config > "${tmp_dir}/compose.yaml"
grep -Fq 'target: /etc/nginx/d4-paper-read-locations.conf' "${tmp_dir}/compose.yaml"
grep -Fq 'com.primusspark.portal.source-contract: d4.paper-read.v1' "${tmp_dir}/compose.yaml"
grep -Fq 'paper-read-qualifier:' "${tmp_dir}/compose.yaml"
grep -Fq 'command:' "${tmp_dir}/compose.yaml"
grep -Fq -- '- d4-qualify' "${tmp_dir}/compose.yaml"
grep -Fq 'EDGE_D4_PROJECTION_DATABASE_URL_FILE: /run/secrets/projection-runtime-database-url' "${tmp_dir}/compose.yaml"
grep -Fq 'EDGE_D4_SOURCE_CLIENT_IDENTITY_FILE: /run/secrets/d4-source-proxy-client.pem' "${tmp_dir}/compose.yaml"
grep -Fq 'EDGE_PROJECTION_INGESTION_ENABLED: "false"' "${tmp_dir}/compose.yaml"
grep -Fq 'EDGE_REALTIME_SSE_ENABLED: "false"' "${tmp_dir}/compose.yaml"
grep -Fq 'EDGE_ANALYTICS_QUERY_ENABLED: "false"' "${tmp_dir}/compose.yaml"
grep -Fq 'EDGE_COMMAND_RELAY_ENABLED: "false"' "${tmp_dir}/compose.yaml"
if grep -Eq 'published: "(5432|8011|8444)"|EDGE_D4_SOURCE_API_KEY|X-Portal-Paper-Read-Key' "${tmp_dir}/compose.yaml"; then
  printf 'D4 Compose unexpectedly published a source or database port.\n' >&2
  exit 1
fi
image='portal-source-proxy-d4-offline:test'
"${docker_cli[@]}" build --tag "${image}" \
  --file "${root_dir}/deploy/images/source-proxy.Dockerfile" "${root_dir}" >/dev/null
"${docker_cli[@]}" run --rm \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=8m,mode=1777 \
  --tmpfs /var/cache/nginx:rw,noexec,nosuid,nodev,size=8m,mode=0750,uid=101,gid=101 \
  -v "${tmp_dir}/nginx-syntax.conf:/etc/nginx/nginx.conf:ro" \
  -v "${tmp_dir}/d4-paper-read-locations.conf:/etc/nginx/d4-paper-read-locations.conf:ro" \
  -v "${tmp_dir}/secrets:/run/secrets:ro" \
  "${image}" nginx -t -q

expect_rejection() {
  local expected="$1" candidate="$2" contract="$3"
  if "${preflight}" \
    --runtime-env "${tmp_dir}/runtime.env" \
    --owner-input "${owner_template}" \
    --config "${candidate}" --contract "${contract}" --mode template \
    >"${tmp_dir}/reject.out" 2>"${tmp_dir}/reject.err"; then
    printf 'D4 Source Proxy negative fixture unexpectedly passed.\n' >&2
    exit 1
  fi
  grep -Fq "${expected}" "${tmp_dir}/reject.err"
}

cp "${tmp_dir}/nginx.conf" "${tmp_dir}/no-h2.conf"
sed -i '/http2 on;/d' "${tmp_dir}/no-h2.conf"
expect_rejection 'HTTP/2, TLS, mTLS, rate or include drift' \
  "${tmp_dir}/no-h2.conf" "${tmp_dir}/d4-paper-read-locations.conf"

cp "${tmp_dir}/nginx.conf" "${tmp_dir}/unsafe-burst.conf"
sed -i 's/burst=120/burst=4/' "${tmp_dir}/unsafe-burst.conf"
expect_rejection 'HTTP/2, TLS, mTLS, rate or include drift' \
  "${tmp_dir}/unsafe-burst.conf" "${tmp_dir}/d4-paper-read-locations.conf"

cp "${tmp_dir}/d4-paper-read-locations.conf" "${tmp_dir}/legacy-origin.conf"
sed -i 's/127\.0\.0\.1:8011/127.0.0.1:8000/g' "${tmp_dir}/legacy-origin.conf"
expect_rejection 'contract-include drift' \
  "${tmp_dir}/nginx.conf" "${tmp_dir}/legacy-origin.conf"

cp "${tmp_dir}/nginx.conf" "${tmp_dir}/legacy-header.conf"
printf '\n# X-API-Key legacy marker\n' >> "${tmp_dir}/legacy-header.conf"
expect_rejection 'legacy, discovery or forbidden transport surface' \
  "${tmp_dir}/legacy-header.conf" "${tmp_dir}/d4-paper-read-locations.conf"

printf 'D4 Source Proxy render, syntax, exact-route and negative gates passed. No source request started.\n'
