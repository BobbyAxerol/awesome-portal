#!/usr/bin/env bash
# Offline/CI gate for the D1 preparation package. Does not contact AWS, install
# packages, generate keys, start services, or read business data.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFLIGHT="${ROOT_DIR}/scripts/execution-d1-preflight.sh"
OPEN_WINDOW="${ROOT_DIR}/scripts/execution-d1-open-window.sh"
WG_RENDERER="${ROOT_DIR}/scripts/execution-d1-render-wireguard.sh"
EXAMPLE="${ROOT_DIR}/deploy/execution-d1/owner-input.env.example"
EDGE_ENV="${ROOT_DIR}/deploy/execution-d1/edge-source-proxy.env.example"

bash -n "${PREFLIGHT}" "${OPEN_WINDOW}" "${WG_RENDERER}" "$0"
if grep -En 'ss "\$\{flags\}"|ss -H-l' "${PREFLIGHT}" >/dev/null; then
  printf 'Preflight contains a non-portable combined ss flag.\n' >&2
  exit 1
fi
"${PREFLIGHT}" --input "${EXAMPLE}" --mode template --cell none

tmp_dir="$(mktemp -d)"
cleanup() { rm -rf -- "${tmp_dir}"; }
trap cleanup EXIT

cp "${EXAMPLE}" "${tmp_dir}/readiness.env"
confirmed_at="$(date -u -d '10 minutes ago' '+%Y-%m-%dT%H:%M:%SZ')"
window_start="$(date -u -d '5 minutes ago' '+%Y-%m-%dT%H:%M:%SZ')"
window_end="$(date -u -d '55 minutes' '+%Y-%m-%dT%H:%M:%SZ')"
sed -i \
  -e 's/^OWNER=$/OWNER=bobby/' \
  -e "s/^OWNER_CONFIRMED_AT_UTC=$/OWNER_CONFIRMED_AT_UTC=${confirmed_at}/" \
  -e 's/^D1_AUTHORIZED=false$/D1_AUTHORIZED=true/' \
  -e "s/^D1_CHANGE_WINDOW_START_UTC=$/D1_CHANGE_WINDOW_START_UTC=${window_start}/" \
  -e "s/^D1_CHANGE_WINDOW_END_UTC=$/D1_CHANGE_WINDOW_END_UTC=${window_end}/" \
  -e 's/^ROLLBACK_OWNER=$/ROLLBACK_OWNER=bobby/' \
  -e 's/^SGP_STABLE_PUBLIC_IP=$/SGP_STABLE_PUBLIC_IP=192.0.2.10/' \
  -e 's/^SGP_PUBLIC_IP_CONFIRMED_STATIC=false$/SGP_PUBLIC_IP_CONFIRMED_STATIC=true/' \
  -e 's/^SGP_CLOUD_FIREWALL=$/SGP_CLOUD_FIREWALL=portal-test/' \
  -e 's/^AWS_ELASTIC_IP=$/AWS_ELASTIC_IP=198.51.100.20/' \
  -e 's/^AWS_SSH_HOST=$/AWS_SSH_HOST=198.51.100.20/' \
  -e 's/^AWS_SSH_ED25519_FINGERPRINT=$/AWS_SSH_ED25519_FINGERPRINT=SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/' \
  -e 's/^AWS_INSTANCE_ID=$/AWS_INSTANCE_ID=i-0123456789abcdef0/' \
  -e 's/^AWS_PUBLIC_IPV4=$/AWS_PUBLIC_IPV4=198.51.100.20/' \
  -e 's/^AWS_SECURITY_GROUP_ID=$/AWS_SECURITY_GROUP_ID=sg-0123456789abcdef0/' \
  -e 's/^AWS_VPC_ID=$/AWS_VPC_ID=vpc-0123456789abcdef0/' \
  -e 's/^AWS_SUBNET_ID=$/AWS_SUBNET_ID=subnet-0123456789abcdef0/' \
  -e 's/^WG_VALUES_APPROVED=false$/WG_VALUES_APPROVED=true/' \
  -e 's/^PORTAL_NETWORK_VALUES_APPROVED=false$/PORTAL_NETWORK_VALUES_APPROVED=true/' \
  -e 's/^PKI_OWNER=$/PKI_OWNER=bobby/' \
  -e 's/^IDENTITY_DECISIONS_APPROVED=false$/IDENTITY_DECISIONS_APPROVED=true/' \
  "${tmp_dir}/readiness.env"
chmod 600 "${tmp_dir}/readiness.env"

# The atomic v0→v1 migration preserves metadata, normalizes peer IPs and opens
# only the D1 gates. The resulting file must pass the same readiness validator.
cp "${tmp_dir}/readiness.env" "${tmp_dir}/migration.env"
sed -i \
  -e 's/^INPUT_VERSION=portal.execution-d1.owner-input.v1$/INPUT_VERSION=portal.execution-d1.owner-input.v0/' \
  -e 's/^D1_AUTHORIZED=true$/D1_AUTHORIZED=false/' \
  -e 's/^WG_AWS_IP=10.70.0.2$/WG_AWS_IP=10.70.0.2\/30/' \
  -e 's/^WG_SGP_IP=10.70.0.1$/WG_SGP_IP=10.70.0.1\/30/' \
  -e 's/^WG_VALUES_APPROVED=true$/WG_VALUES_APPROVED=false/' \
  -e 's/^PORTAL_NETWORK_VALUES_APPROVED=true$/PORTAL_NETWORK_VALUES_APPROVED=false/' \
  -e 's/^IDENTITY_DECISIONS_APPROVED=true$/IDENTITY_DECISIONS_APPROVED=false/' \
  "${tmp_dir}/migration.env"
chmod 600 "${tmp_dir}/migration.env"
"${OPEN_WINDOW}" --input "${tmp_dir}/migration.env" --owner test-owner \
  --duration-minutes 30 >/dev/null
"${PREFLIGHT}" --input "${tmp_dir}/migration.env" --mode readiness \
  --cell none >/dev/null
compgen -G "${tmp_dir}/migration.env.pre-v1.*" >/dev/null || {
  printf 'Owner-input migration did not retain a private backup.\n' >&2
  exit 1
}

# Deferred EIP allocation and route-table IDs are warnings, not D1 blockers.
readiness_output="$("${PREFLIGHT}" --input "${tmp_dir}/readiness.env" --mode readiness --cell none)"
grep -Fq 'AWS_EIP_ALLOCATION_ID deferred' <<<"${readiness_output}"
grep -Fq 'AWS_ROUTE_TABLE_ID deferred' <<<"${readiness_output}"

# They become hard requirements at the production stop-gate.
if "${PREFLIGHT}" --input "${tmp_dir}/readiness.env" --mode production --cell none >/dev/null 2>&1; then
  printf 'Production preflight unexpectedly accepted deferred metadata.\n' >&2
  exit 1
fi

# Network activation additionally requires the exact revocable SG rule ID.
if "${PREFLIGHT}" --input "${tmp_dir}/readiness.env" --mode activation \
    --cell none >/dev/null 2>&1; then
  printf 'Activation preflight unexpectedly accepted a missing SG rule ID.\n' >&2
  exit 1
fi
sed -i 's/^AWS_WG_SG_RULE_ID=$/AWS_WG_SG_RULE_ID=sgr-0123456789abcdef0/' \
  "${tmp_dir}/readiness.env"
"${PREFLIGHT}" --input "${tmp_dir}/readiness.env" --mode activation \
  --cell none >/dev/null

# The parser must reject shell syntax rather than sourcing it.
cp "${EXAMPLE}" "${tmp_dir}/malicious.env"
sed -i 's/^OWNER=$/OWNER=$(touch bad)/' "${tmp_dir}/malicious.env"
if "${PREFLIGHT}" --input "${tmp_dir}/malicious.env" --mode template --cell none >/dev/null 2>&1; then
  printf 'Preflight unexpectedly accepted executable owner input.\n' >&2
  exit 1
fi
[[ ! -e "${ROOT_DIR}/bad" && ! -e "${tmp_dir}/bad" ]] || {
  printf 'Owner input was executed.\n' >&2
  exit 1
}

# Library parse failures must not echo a malformed private value or traceback.
cp "${EXAMPLE}" "${tmp_dir}/redaction.env"
sed -i 's/^WG_AWS_IP=10.70.0.2$/WG_AWS_IP=DO_NOT_ECHO_PRIVATE_VALUE/' \
  "${tmp_dir}/redaction.env"
set +e
redaction_output="$("${PREFLIGHT}" --input "${tmp_dir}/redaction.env" \
  --mode template --cell none 2>&1)"
redaction_status=$?
set -e
[[ "${redaction_status}" -ne 0 ]] || {
  printf 'Preflight unexpectedly accepted malformed network input.\n' >&2
  exit 1
}
if grep -Fq 'DO_NOT_ECHO_PRIVATE_VALUE' <<<"${redaction_output}" ||
    grep -Fq 'Traceback' <<<"${redaction_output}"; then
  printf 'Preflight leaked a private value or parser traceback.\n' >&2
  exit 1
fi

# Any safety-boundary widening must fail even in template mode.
cp "${EXAMPLE}" "${tmp_dir}/unsafe.env"
sed -i 's/^ALLOW_COMMANDS=false$/ALLOW_COMMANDS=true/' "${tmp_dir}/unsafe.env"
if "${PREFLIGHT}" --input "${tmp_dir}/unsafe.env" --mode template --cell none >/dev/null 2>&1; then
  printf 'Preflight unexpectedly accepted command authority.\n' >&2
  exit 1
fi

command -v docker >/dev/null 2>&1 || {
  printf 'Docker CLI is required for the offline Compose render.\n' >&2
  exit 1
}
docker compose --project-directory "${ROOT_DIR}" \
  --env-file "${EDGE_ENV}" \
  -f "${ROOT_DIR}/deploy/compose.execution-edge.yaml" \
  -f "${ROOT_DIR}/deploy/execution-d1/compose.dark.yaml" \
  config --quiet

rendered="$(docker compose --project-directory "${ROOT_DIR}" \
  --env-file "${EDGE_ENV}" \
  -f "${ROOT_DIR}/deploy/compose.execution-edge.yaml" \
  -f "${ROOT_DIR}/deploy/execution-d1/compose.dark.yaml" \
  config)"
grep -Fq 'EDGE_PROJECTION_INGESTION_ENABLED: "false"' <<<"${rendered}"
grep -Fq 'EDGE_REALTIME_SSE_ENABLED: "false"' <<<"${rendered}"
grep -Fq 'EDGE_ANALYTICS_QUERY_ENABLED: "false"' <<<"${rendered}"
grep -Fq 'network_mode: host' <<<"${rendered}"
grep -Fq 'if ($request_method != GET)' \
  "${ROOT_DIR}/deploy/execution-d1/source-proxy/nginx.conf.template"
grep -Fq 'client_max_body_size 1k;' \
  "${ROOT_DIR}/deploy/execution-d1/source-proxy/nginx.conf.template"
if grep -Eq 'published: "(8444|8000)"' <<<"${rendered}"; then
  printf 'Dark Compose unexpectedly publishes Source Proxy/TS ports.\n' >&2
  exit 1
fi

printf 'Execution D1 offline templates, safety parser and dark Compose gate passed. No state changed.\n'
