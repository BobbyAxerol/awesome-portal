#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
preflight="${root_dir}/scripts/execution-d4-storage-preflight.sh"
template="${root_dir}/deploy/execution-d4/storage-input.env.example"
overlay="${root_dir}/deploy/execution-d4/compose.encrypted-storage.yaml"
tmp_dir="$(mktemp -d)"
cleanup() { rm -rf "${tmp_dir}"; }
trap cleanup EXIT

"${preflight}" --env-file "${template}" --mode template >/dev/null

filled="${tmp_dir}/storage.env"
sed \
  -e 's/^OWNER=.*/OWNER=bobby/' \
  -e 's/^STORAGE_APPROVED=.*/STORAGE_APPROVED=true/' \
  -e 's/^AWS_INSTANCE_ID=.*/AWS_INSTANCE_ID=i-00a12daa5535dc225/' \
  -e 's/^AWS_AVAILABILITY_ZONE=.*/AWS_AVAILABILITY_ZONE=ap-east-1a/' \
  -e 's/^AWS_VOLUME_ID=.*/AWS_VOLUME_ID=vol-0123456789abcdef0/' \
  -e 's/^AWS_EBS_ENCRYPTED=.*/AWS_EBS_ENCRYPTED=true/' \
  -e "s/^AWS_KMS_KEY_ID_SHA256=.*/AWS_KMS_KEY_ID_SHA256=sha256:$(printf 'a%.0s' {1..64})/" \
  -e "s/^AWS_DESCRIBE_VOLUME_EVIDENCE_SHA256=.*/AWS_DESCRIBE_VOLUME_EVIDENCE_SHA256=sha256:$(printf 'b%.0s' {1..64})/" \
  -e 's#^EXPECTED_DEVICE=.*#EXPECTED_DEVICE=/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_vol0123456789abcdef0#' \
  -e 's/^EXPECTED_FILESYSTEM_UUID=.*/EXPECTED_FILESYSTEM_UUID=01234567-89ab-cdef-0123-456789abcdef/' \
  "${template}" > "${filled}"
chmod 0600 "${filled}"
"${preflight}" --env-file "${filled}" --mode offline >/dev/null

bad="${tmp_dir}/bad.env"
sed 's/^AWS_EBS_ENCRYPTED=true/AWS_EBS_ENCRYPTED=false/' "${filled}" > "${bad}"
chmod 0600 "${bad}"
if "${preflight}" --env-file "${bad}" --mode offline >/dev/null 2>&1; then
  printf 'D4 storage test expected unencrypted EBS rejection.\n' >&2
  exit 1
fi
sed 's/^AWS_AVAILABILITY_ZONE=ap-east-1a/AWS_AVAILABILITY_ZONE=us-east-1a/' "${filled}" > "${bad}"
chmod 0600 "${bad}"
if "${preflight}" --env-file "${bad}" --mode offline >/dev/null 2>&1; then
  printf 'D4 storage test expected availability-zone rejection.\n' >&2
  exit 1
fi
sed 's#^MOUNT_PATH=.*#MOUNT_PATH=/#' "${filled}" > "${bad}"
chmod 0600 "${bad}"
if "${preflight}" --env-file "${bad}" --mode offline >/dev/null 2>&1; then
  printf 'D4 storage test expected root mount rejection.\n' >&2
  exit 1
fi
sed 's/v2$/v1/' "${filled}" > "${bad}"
chmod 0600 "${bad}"
if "${preflight}" --env-file "${bad}" --mode offline >/dev/null 2>&1; then
  printf 'D4 storage test expected D2 volume-name reuse rejection.\n' >&2
  exit 1
fi
sed 's/^MINIMUM_SIZE_GIB=20/MINIMUM_SIZE_GIB=19/' "${filled}" > "${bad}"
chmod 0600 "${bad}"
if "${preflight}" --env-file "${bad}" --mode offline >/dev/null 2>&1; then
  printf 'D4 storage test expected undersized-volume rejection.\n' >&2
  exit 1
fi
sed 's#^DATA_DIRECTORY=.*#DATA_DIRECTORY=/srv/primus/portal/projection-d4-other/postgres#' "${filled}" > "${bad}"
chmod 0600 "${bad}"
if "${preflight}" --env-file "${bad}" --mode offline >/dev/null 2>&1; then
  printf 'D4 storage test expected data-directory drift rejection.\n' >&2
  exit 1
fi
sed '/^AWS_DESCRIBE_VOLUME_EVIDENCE_SHA256=/d' "${filled}" > "${bad}"
chmod 0600 "${bad}"
if "${preflight}" --env-file "${bad}" --mode offline >/dev/null 2>&1; then
  printf 'D4 storage test expected missing AWS evidence rejection.\n' >&2
  exit 1
fi
cp "${filled}" "${bad}"
chmod 0644 "${bad}"
if "${preflight}" --env-file "${bad}" --mode offline >/dev/null 2>&1; then
  printf 'D4 storage test expected weak input-mode rejection.\n' >&2
  exit 1
fi
if rg -n '(^|_)(SECRET|TOKEN|PASSWORD|API_KEY)=' "${template}" >/dev/null; then
  printf 'D4 storage template must remain credential-free.\n' >&2
  exit 1
fi

compose_env="${tmp_dir}/compose.env"
cp "${root_dir}/deploy/execution-d1/edge-source-proxy.env.example" "${compose_env}"
{
  printf 'D4_PROJECTION_DB_VOLUME_NAME=portal-execution-projection-pgdata-v2\n'
  printf 'D4_PROJECTION_DATA_DIRECTORY=/srv/primus/portal/projection-d4/postgres\n'
} >> "${compose_env}"

docker_cli=(docker)
if ! docker info >/dev/null 2>&1; then
  docker_cli=(sudo -n docker)
fi
rendered="${tmp_dir}/rendered.yaml"
"${docker_cli[@]}" compose \
  --env-file "${compose_env}" \
  -f "${root_dir}/deploy/compose.execution-edge.yaml" \
  -f "${root_dir}/deploy/execution-d1/compose.dark.yaml" \
  -f "${overlay}" config > "${rendered}"
python3 - "${rendered}" <<'PY'
import pathlib
import sys

text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
for expected in (
    "name: portal-execution-projection-pgdata-v2",
    "device: /srv/primus/portal/projection-d4/postgres",
    "o: bind",
    "type: none",
    'EDGE_ANALYTICS_QUERY_ENABLED: "false"',
    'EDGE_PROJECTION_INGESTION_ENABLED: "false"',
    'EDGE_REALTIME_SSE_ENABLED: "false"',
    'EDGE_COMMAND_RELAY_ENABLED: "false"',
    'EDGE_SOURCE_PROBES_ENABLED: "false"',
):
    if expected not in text:
        raise SystemExit(f"D4 storage Compose lost required boundary: {expected}")
PY

printf 'D4 encrypted-storage template, rejection and Compose-overlay gates passed. No state changed.\n'
