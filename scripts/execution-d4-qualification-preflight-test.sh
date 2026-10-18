#!/usr/bin/env bash
# Synthetic, no-network readiness/negative test for the D4 qualifier gate.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
preflight="${root_dir}/scripts/execution-d4-qualification-preflight.sh"
require_root=false
if [[ "${1:-}" == "--require-root" ]]; then
  require_root=true
  shift
elif [[ $# -ne 0 ]]; then
  printf 'Usage: %s [--require-root]\n' "$0" >&2
  exit 2
fi
tmp_dir="$(mktemp -d)"
cleanup() {
  # The privileged branch deliberately makes this fixture root-owned. Restore
  # only its directory ownership so the invoking user can remove its children.
  # Never recursively change ownership or follow a substituted secret symlink.
  if [[ "${EUID}" != 0 && -d "${tmp_dir}/edge-secrets" && ! -L "${tmp_dir}/edge-secrets" ]] &&
    [[ "$(stat -c %u -- "${tmp_dir}/edge-secrets")" != "$(id -u)" ]]; then
    sudo -n chown --no-dereference "$(id -u):$(id -g)" -- "${tmp_dir}/edge-secrets"
  fi
  rm -rf -- "${tmp_dir}"
}
trap cleanup EXIT

# CI/publication uses a deliberately non-privileged user and must never obtain
# sudo merely to emulate production file ownership.  A workstation or a
# deployment-only drill can request the stronger real-ownership branch.
root_command=()
root_readiness=false
if [[ "${EUID}" == 0 ]]; then
  root_readiness=true
elif sudo -n true >/dev/null 2>&1; then
  root_command=(sudo -n)
  root_readiness=true
fi
if [[ "${require_root}" == true && "${root_readiness}" != true ]]; then
  printf 'D4 qualifier privileged readiness was requested but root is unavailable.\n' >&2
  exit 1
fi

runtime_gid="$(id -g)"
if [[ "${runtime_gid}" == 0 ]]; then
  runtime_gid=987
fi
edge_env="${tmp_dir}/edge.env"
owner_input="${tmp_dir}/owner-input.env"
qualifier_env="${tmp_dir}/qualifier.env"
bad_qualifier_env="${tmp_dir}/qualifier-bad.env"
secret_dir="${tmp_dir}/edge-secrets"
projection_init="${tmp_dir}/init-projection-database.sh"
cp "${root_dir}/deploy/execution-d1/edge-source-proxy.env.example" "${edge_env}"
sed -i \
  -e "s#^PORTAL_RUNTIME_GID=.*#PORTAL_RUNTIME_GID=${runtime_gid}#" \
  -e "s#^EDGE_SECRET_DIRECTORY=.*#EDGE_SECRET_DIRECTORY=${secret_dir}#" \
  -e "s#^PROJECTION_DB_INIT_SCRIPT=.*#PROJECTION_DB_INIT_SCRIPT=${projection_init}#" \
  -e 's/^SOURCE_PROXY_SOURCE_MODE=dark$/SOURCE_PROXY_SOURCE_MODE=paper-read/' \
  -e 's/^EDGE_SOURCE_PROBES_ENABLED=false$/EDGE_SOURCE_PROBES_ENABLED=true/' \
  "${edge_env}"
printf '%s\n' '#!/usr/bin/env bash' 'set -euo pipefail' > "${projection_init}"

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

if [[ "${root_readiness}" == true ]]; then
  "${root_command[@]}" chown root:root "${edge_env}" "${owner_input}" \
    "${qualifier_env}" "${bad_qualifier_env}"
  "${root_command[@]}" chmod 0600 "${edge_env}" "${owner_input}" \
    "${qualifier_env}" "${bad_qualifier_env}"
  "${root_command[@]}" chown root:70 "${projection_init}"
  "${root_command[@]}" chmod 0550 "${projection_init}"
  "${root_command[@]}" chown root:"${runtime_gid}" "${secret_dir}"
  "${root_command[@]}" chmod 0750 "${secret_dir}"
  "${root_command[@]}" chown root:"${runtime_gid}" "${secret_dir}/"*
  "${root_command[@]}" chmod 0644 "${secret_dir}/source-proxy-ca.crt"
  "${root_command[@]}" chmod 0640 "${secret_dir}/d4-source-proxy-client.pem" \
    "${secret_dir}/projection-runtime-database-url"

  "${root_command[@]}" "${preflight}" --edge-env "${edge_env}" \
    --qualifier-env "${qualifier_env}" --owner-input "${owner_input}" \
    --mode readiness >/dev/null
  if "${root_command[@]}" "${preflight}" --edge-env "${edge_env}" \
    --qualifier-env "${bad_qualifier_env}" --owner-input "${owner_input}" \
    --mode readiness >/dev/null 2>&1; then
    printf 'D4 qualifier negative evidence-drift fixture unexpectedly passed.\n' >&2
    exit 1
  fi
  printf 'D4 qualifier privileged readiness and evidence-drift gates passed. No network or service started.\n'
  exit 0
fi

# This branch is the appropriate CI proof: it exercises the non-secret
# template parser and confirms that the production script still contains the
# root/owner/mode/evidence requirements.  It intentionally cannot claim a
# privileged readiness drill.
template_owner_input="${tmp_dir}/owner-input-template.env"
template_qualifier_env="${tmp_dir}/qualifier-template.env"
sed 's/^D4_AUTHORIZED=true$/D4_AUTHORIZED=false/' "${owner_input}" > "${template_owner_input}"
template_owner_digest="sha256:$(sha256sum "${template_owner_input}" | cut -d' ' -f1)"
sed \
  -e "s#^D4_OWNER_INPUT_FILE=.*#D4_OWNER_INPUT_FILE=${template_owner_input}#" \
  -e "s#^D4_AUTHORIZATION_EVIDENCE_SHA256=.*#D4_AUTHORIZATION_EVIDENCE_SHA256=${template_owner_digest}#" \
  "${qualifier_env}" > "${template_qualifier_env}"
"${preflight}" --edge-env "${edge_env}" \
  --qualifier-env "${template_qualifier_env}" --owner-input "${template_owner_input}" \
  --mode template >/dev/null
template_bad_qualifier_env="${tmp_dir}/qualifier-template-bad.env"
sed 's/^D4_AUTHORIZATION_EVIDENCE_SHA256=.*/D4_AUTHORIZATION_EVIDENCE_SHA256=not-a-sha256-digest/' \
  "${template_qualifier_env}" > "${template_bad_qualifier_env}"
if "${preflight}" --edge-env "${edge_env}" \
  --qualifier-env "${template_bad_qualifier_env}" --owner-input "${template_owner_input}" \
  --mode template >/dev/null 2>&1; then
  printf 'D4 qualifier malformed template fixture unexpectedly passed.\n' >&2
  exit 1
fi
grep -Fq '(( EUID == 0 ))' "${preflight}"
grep -Fq "stat -c '%u:%a'" "${preflight}"
grep -Fq 'D4 qualifier readiness requires root-owned mode-0600 inputs.' "${preflight}"
grep -Fq 'D4 qualifier rejected owner-input evidence drift.' "${preflight}"

printf 'D4 qualifier rootless template/static gates passed; privileged readiness remains separately required. No network or service started.\n'
