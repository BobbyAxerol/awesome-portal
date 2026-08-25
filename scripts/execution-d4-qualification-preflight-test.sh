#!/usr/bin/env bash
# Synthetic, no-network readiness/negative test for the D4 qualifier gate.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
preflight="${root_dir}/scripts/execution-d4-qualification-preflight.sh"
tmp_dir="$(mktemp -d)"
cleanup() { sudo -n rm -rf -- "${tmp_dir}"; }
trap cleanup EXIT

runtime_gid="$(id -g)"
if [[ "${runtime_gid}" == 0 ]]; then
  runtime_gid=987
fi
edge_env="${tmp_dir}/edge.env"
owner_input="${tmp_dir}/owner-input.env"
qualifier_env="${tmp_dir}/qualifier.env"
bad_qualifier_env="${tmp_dir}/qualifier-bad.env"
secret_dir="${tmp_dir}/edge-secrets"
cp "${root_dir}/deploy/execution-d1/edge-source-proxy.env.example" "${edge_env}"
sed -i \
  -e "s#^PORTAL_RUNTIME_GID=.*#PORTAL_RUNTIME_GID=${runtime_gid}#" \
  -e "s#^EDGE_SECRET_DIRECTORY=.*#EDGE_SECRET_DIRECTORY=${secret_dir}#" \
  -e 's/^SOURCE_PROXY_SOURCE_MODE=dark$/SOURCE_PROXY_SOURCE_MODE=paper-read/' \
  -e 's/^EDGE_SOURCE_PROBES_ENABLED=false$/EDGE_SOURCE_PROBES_ENABLED=true/' \
  "${edge_env}"

python3 - "${root_dir}/deploy/execution-d4/owner-input.env.example" \
  "${owner_input}" <<'PY'
import datetime
import pathlib
import sys

source = pathlib.Path(sys.argv[1])
target = pathlib.Path(sys.argv[2])
values = {}
order = []
for raw in source.read_text(encoding="utf-8").splitlines():
    if not raw or raw.startswith("#"):
        continue
    key, value = raw.split("=", 1)
    values[key] = value
    order.append(key)

now = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
timestamp = lambda value: value.isoformat().replace("+00:00", "Z")
digest = "sha256:" + "d" * 64
values.update(
    {
        "OWNER": "bobby",
        "OWNER_CONFIRMED_AT_UTC": timestamp(now),
        "D4_AUTHORIZED": "true",
        "D4_CHANGE_WINDOW_ID": "d4-synthetic-readiness",
        "D4_CHANGE_WINDOW_START_UTC": timestamp(now - datetime.timedelta(minutes=1)),
        "D4_CHANGE_WINDOW_END_UTC": timestamp(now + datetime.timedelta(minutes=30)),
        "SOURCE_OWNER": "bobby",
        "ROLLBACK_OWNER": "bobby",
        "BACKUP_OWNER": "bobby",
        "OBSERVABILITY_OWNER": "bobby",
        "DEPLOYMENT_COMMIT": "a" * 40,
        "SOURCE_IMPLEMENTATION_COMMIT": "b" * 40,
        "SOURCE_RUNTIME_ACCEPTANCE_COMMIT": "c" * 40,
        "MAPPER_SOURCE_COMMIT": "a" * 40,
        "BUILDING_EPOCH_ID": "018f5e5b-2ec2-7c56-9d87-6d5b8b8af001",
        "SOURCE_FACADE_IMAGE_DIGEST": digest,
        "PROJECTION_STORAGE_ENCRYPTED": "true",
        "PROJECTION_STORAGE_APPROVED": "true",
    }
)
for key in (
    "SOURCE_IDENTITY_DEDICATED",
    "SOURCE_IDENTITY_READ_ONLY",
    "SOURCE_MISSING_CREDENTIAL_REJECTED",
    "SOURCE_WRONG_CREDENTIAL_REJECTED",
    "SOURCE_REVOKED_CREDENTIAL_REJECTED",
    "SOURCE_MUTATION_METHODS_DENIED",
    "SOURCE_RUNTIME_LOOPBACK_ONLY",
    "SOURCE_PROXY_SECRET_DELIVERED",
    "SOURCE_PROXY_EXACT_ROUTES_CONFIGURED",
):
    values[key] = "true"
for key in values:
    if key.endswith("_SHA256") and not key.startswith(
        ("REPLAY_", "PARITY_", "FRESHNESS_", "GAP_", "RESTART_", "LOAD_", "RESTORE_")
    ):
        values[key] = digest
target.write_text(
    "".join(f"{key}={values[key]}\n" for key in order), encoding="utf-8"
)
PY

owner_digest="sha256:$(sha256sum "${owner_input}" | cut -d' ' -f1)"
sed \
  -e "s#^D4_OWNER_INPUT_FILE=.*#D4_OWNER_INPUT_FILE=${owner_input}#" \
  -e "s#^D4_AUTHORIZATION_EVIDENCE_SHA256=.*#D4_AUTHORIZATION_EVIDENCE_SHA256=${owner_digest}#" \
  "${root_dir}/deploy/execution-d4/qualification-runtime.env.example" > "${qualifier_env}"
sed 's/^D4_AUTHORIZATION_EVIDENCE_SHA256=.*/D4_AUTHORIZATION_EVIDENCE_SHA256=sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/' \
  "${qualifier_env}" > "${bad_qualifier_env}"

mkdir -p "${secret_dir}"
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -sha256 \
  -subj '/CN=d4-synthetic-source-ca' \
  -keyout "${tmp_dir}/source-ca.key" \
  -out "${secret_dir}/source-proxy-ca.crt" >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -sha256 \
  -subj '/CN=d4-synthetic-qualifier' \
  -keyout "${tmp_dir}/client.key" \
  -out "${tmp_dir}/client.crt" >/dev/null 2>&1
cat "${tmp_dir}/client.crt" "${tmp_dir}/client.key" > \
  "${secret_dir}/d4-source-proxy-client.pem"
printf '%s\n' \
  'postgresql://portal_projection_runtime:synthetic@projection-postgres:5432/portal_projection?sslmode=require' \
  > "${secret_dir}/projection-runtime-database-url"

sudo -n chown root:root "${edge_env}" "${owner_input}" \
  "${qualifier_env}" "${bad_qualifier_env}"
sudo -n chmod 0600 "${edge_env}" "${owner_input}" \
  "${qualifier_env}" "${bad_qualifier_env}"
sudo -n chown root:"${runtime_gid}" "${secret_dir}"
sudo -n chmod 0750 "${secret_dir}"
sudo -n chown root:"${runtime_gid}" "${secret_dir}/"*
sudo -n chmod 0644 "${secret_dir}/source-proxy-ca.crt"
sudo -n chmod 0640 "${secret_dir}/d4-source-proxy-client.pem" \
  "${secret_dir}/projection-runtime-database-url"

sudo -n "${preflight}" --edge-env "${edge_env}" \
  --qualifier-env "${qualifier_env}" --owner-input "${owner_input}" \
  --mode readiness >/dev/null
if sudo -n "${preflight}" --edge-env "${edge_env}" \
  --qualifier-env "${bad_qualifier_env}" --owner-input "${owner_input}" \
  --mode readiness >/dev/null 2>&1; then
  printf 'D4 qualifier negative evidence-drift fixture unexpectedly passed.\n' >&2
  exit 1
fi

printf 'D4 qualifier synthetic readiness and evidence-drift gates passed. No network or service started.\n'
