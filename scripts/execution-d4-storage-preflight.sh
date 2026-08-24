#!/usr/bin/env bash
# Fail-closed D4 encrypted projection-storage validator. It never creates,
# formats, mounts, unmounts or removes a block device or Docker volume.
set -euo pipefail

usage() {
  printf 'Usage: %s --env-file PATH --mode template|offline|readiness\n' "$0" >&2
  exit 2
}

env_file=""
mode=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) [[ $# -ge 2 ]] || usage; env_file="$2"; shift 2 ;;
    --mode) [[ $# -ge 2 ]] || usage; mode="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -n "${env_file}" && -f "${env_file}" ]] || usage
[[ "${mode}" =~ ^(template|offline|readiness)$ ]] || usage

declare -A values=()
allowed_keys=' INPUT_VERSION OWNER STORAGE_APPROVED AWS_INSTANCE_ID AWS_VOLUME_ID AWS_EBS_ENCRYPTED AWS_KMS_KEY_ID_SHA256 AWS_DESCRIBE_VOLUME_EVIDENCE_SHA256 EXPECTED_DEVICE EXPECTED_FILESYSTEM_UUID MOUNT_PATH DATA_DIRECTORY FILESYSTEM REQUIRED_MOUNT_OPTIONS MINIMUM_SIZE_GIB PROJECTION_DB_CONTAINER_UID PROJECTION_DB_CONTAINER_GID PROJECTION_DB_VOLUME_NAME '
while IFS= read -r line || [[ -n "${line}" ]]; do
  [[ -z "${line}" || "${line}" == \#* ]] && continue
  [[ "${line}" =~ ^([A-Z][A-Z0-9_]*)=([A-Za-z0-9_./,:@+-]*)$ ]] || {
    printf 'D4 storage preflight rejected an unsafe or malformed env line.\n' >&2
    exit 1
  }
  key="${BASH_REMATCH[1]}"
  value="${BASH_REMATCH[2]}"
  [[ "${allowed_keys}" == *" ${key} "* ]] || {
    printf 'D4 storage preflight rejected an unknown env key.\n' >&2
    exit 1
  }
  [[ ! -v "values[${key}]" ]] || {
    printf 'D4 storage preflight rejected a duplicate env key.\n' >&2
    exit 1
  }
  values["${key}"]="${value}"
done < "${env_file}"

required=(
  INPUT_VERSION OWNER STORAGE_APPROVED AWS_INSTANCE_ID AWS_VOLUME_ID
  AWS_EBS_ENCRYPTED AWS_KMS_KEY_ID_SHA256 AWS_DESCRIBE_VOLUME_EVIDENCE_SHA256
  EXPECTED_DEVICE EXPECTED_FILESYSTEM_UUID MOUNT_PATH DATA_DIRECTORY FILESYSTEM
  REQUIRED_MOUNT_OPTIONS MINIMUM_SIZE_GIB PROJECTION_DB_CONTAINER_UID
  PROJECTION_DB_CONTAINER_GID PROJECTION_DB_VOLUME_NAME
)
for key in "${required[@]}"; do
  [[ -v "values[${key}]" ]] || {
    printf 'D4 storage preflight rejected an incomplete input schema.\n' >&2
    exit 1
  }
done
[[ "${#values[@]}" -eq "${#required[@]}" ]] || {
  printf 'D4 storage preflight rejected an incomplete input schema.\n' >&2
  exit 1
}

[[ "${values[INPUT_VERSION]}" == portal.execution-d4.storage-input.v1 ]] || {
  printf 'D4 storage preflight rejected the input version.\n' >&2
  exit 1
}
[[ "${values[STORAGE_APPROVED]}" =~ ^(true|false)$ &&
   "${values[AWS_EBS_ENCRYPTED]}" =~ ^(true|false)$ ]] || {
  printf 'D4 storage preflight requires strict boolean values.\n' >&2
  exit 1
}
if [[ "${mode}" == template ]]; then
  [[ "${values[STORAGE_APPROVED]}" == false && "${values[AWS_EBS_ENCRYPTED]}" == false ]] || {
    printf 'D4 storage template must remain unapproved and unproven.\n' >&2
    exit 1
  }
  printf 'D4 storage template preflight PASSED. No state changed.\n'
  exit 0
fi

[[ ! -L "${env_file}" && "$(stat -c '%a' "${env_file}")" == 600 ]] || {
  printf 'D4 storage preflight requires a non-symlink mode-0600 input.\n' >&2
  exit 1
}
[[ -n "${values[OWNER]}" && "${values[STORAGE_APPROVED]}" == true ]] || {
  printf 'D4 projection storage is not owner-approved.\n' >&2
  exit 1
}
[[ "${values[AWS_INSTANCE_ID]}" =~ ^i-[0-9a-f]{17}$ &&
   "${values[AWS_VOLUME_ID]}" =~ ^vol-[0-9a-f]{17}$ ]] || {
  printf 'D4 storage preflight rejected AWS resource identity metadata.\n' >&2
  exit 1
}
[[ "${values[AWS_EBS_ENCRYPTED]}" == true ]] || {
  printf 'D4 storage preflight rejected an unencrypted EBS volume.\n' >&2
  exit 1
}
digest_pattern='^sha256:[0-9a-f]{64}$'
for key in AWS_KMS_KEY_ID_SHA256 AWS_DESCRIBE_VOLUME_EVIDENCE_SHA256; do
  [[ "${values[${key}]}" =~ ${digest_pattern} ]] || {
    printf 'D4 storage preflight rejected malformed AWS encryption evidence.\n' >&2
    exit 1
  }
done
[[ "${values[EXPECTED_DEVICE]}" == /dev/disk/by-id/* &&
   "${values[EXPECTED_DEVICE]}" != *'/../'* ]] || {
  printf 'D4 storage preflight requires a stable /dev/disk/by-id path.\n' >&2
  exit 1
}
[[ "${values[EXPECTED_FILESYSTEM_UUID]}" =~ ^[0-9a-fA-F-]{16,64}$ ]] || {
  printf 'D4 storage preflight rejected the filesystem UUID.\n' >&2
  exit 1
}
[[ "${values[MOUNT_PATH]}" == /srv/primus/portal/projection-d4 &&
   "${values[DATA_DIRECTORY]}" == "${values[MOUNT_PATH]}/postgres" ]] || {
  printf 'D4 storage preflight rejected a path outside the dedicated mount.\n' >&2
  exit 1
}
[[ "${values[FILESYSTEM]}" == ext4 ]] || {
  printf 'D4 storage preflight currently accepts only the reviewed ext4 profile.\n' >&2
  exit 1
}
[[ "${values[REQUIRED_MOUNT_OPTIONS]}" == rw,nodev,nosuid,noexec ]] || {
  printf 'D4 storage preflight rejected mount-option drift.\n' >&2
  exit 1
}
[[ "${values[MINIMUM_SIZE_GIB]}" =~ ^[1-9][0-9]{0,3}$ &&
   "${values[PROJECTION_DB_CONTAINER_UID]}" =~ ^[1-9][0-9]{0,8}$ &&
   "${values[PROJECTION_DB_CONTAINER_GID]}" =~ ^[1-9][0-9]{0,8}$ ]] || {
  printf 'D4 storage preflight rejected size or container ownership metadata.\n' >&2
  exit 1
}
(( values[MINIMUM_SIZE_GIB] >= 20 )) || {
  printf 'D4 storage preflight rejected an undersized projection volume.\n' >&2
  exit 1
}
[[ "${values[PROJECTION_DB_VOLUME_NAME]}" =~ ^portal-execution-projection-pgdata-v[2-9][0-9]*$ ]] || {
  printf 'D4 storage preflight requires a new versioned projection volume.\n' >&2
  exit 1
}

if [[ "${mode}" == offline ]]; then
  printf 'D4 storage offline preflight PASSED. No host state inspected or changed.\n'
  exit 0
fi

(( EUID == 0 )) || {
  printf 'D4 storage readiness must run as root for device, mount and Docker inspection.\n' >&2
  exit 1
}
[[ "$(stat -c '%u' "${env_file}")" == 0 ]] || {
  printf 'D4 storage readiness requires a root-owned input.\n' >&2
  exit 1
}
device="${values[EXPECTED_DEVICE]}"
mount_path="${values[MOUNT_PATH]}"
data_directory="${values[DATA_DIRECTORY]}"
[[ -b "${device}" ]] || {
  printf 'D4 storage readiness could not resolve the approved block device.\n' >&2
  exit 1
}
[[ -d "${mount_path}" && ! -L "${mount_path}" &&
   -d "${data_directory}" && ! -L "${data_directory}" ]] || {
  printf 'D4 storage readiness requires real mount/data directories.\n' >&2
  exit 1
}
[[ "$(stat -c '%u:%g:%a' "${mount_path}")" == 0:0:750 ]] || {
  printf 'D4 storage readiness rejected mount-directory ownership or mode.\n' >&2
  exit 1
}
expected_data_stat="${values[PROJECTION_DB_CONTAINER_UID]}:${values[PROJECTION_DB_CONTAINER_GID]}:700"
[[ "$(stat -c '%u:%g:%a' "${data_directory}")" == "${expected_data_stat}" ]] || {
  printf 'D4 storage readiness rejected PostgreSQL data ownership or mode.\n' >&2
  exit 1
}
findmnt -n -M "${mount_path}" >/dev/null 2>&1 || {
  printf 'D4 storage readiness requires the approved path to be a mountpoint.\n' >&2
  exit 1
}
mount_uuid="$(findmnt -n -o UUID -M "${mount_path}")"
root_uuid="$(findmnt -n -o UUID -M /)"
[[ -n "${mount_uuid}" && "${mount_uuid}" == "${values[EXPECTED_FILESYSTEM_UUID]}" &&
   "${mount_uuid}" != "${root_uuid}" ]] || {
  printf 'D4 storage readiness rejected root reuse or filesystem identity drift.\n' >&2
  exit 1
}
[[ "$(blkid -s UUID -o value "${device}")" == "${mount_uuid}" ]] || {
  printf 'D4 storage readiness rejected device/filesystem identity drift.\n' >&2
  exit 1
}
[[ "$(findmnt -n -o FSTYPE -M "${mount_path}")" == "${values[FILESYSTEM]}" ]] || {
  printf 'D4 storage readiness rejected filesystem-type drift.\n' >&2
  exit 1
}
mount_options=",$(findmnt -n -o OPTIONS -M "${mount_path}"),"
IFS=',' read -r -a required_options <<<"${values[REQUIRED_MOUNT_OPTIONS]}"
for option in "${required_options[@]}"; do
  [[ "${mount_options}" == *",${option},"* ]] || {
    printf 'D4 storage readiness rejected missing mount hardening.\n' >&2
    exit 1
  }
done
size_bytes="$(lsblk -b -dn -o SIZE "${device}")"
[[ "${size_bytes}" =~ ^[0-9]+$ ]] || {
  printf 'D4 storage readiness could not measure the block device.\n' >&2
  exit 1
}
(( size_bytes >= values[MINIMUM_SIZE_GIB] * 1024 * 1024 * 1024 )) || {
  printf 'D4 storage readiness rejected an undersized block device.\n' >&2
  exit 1
}

volume_name="${values[PROJECTION_DB_VOLUME_NAME]}"
docker info >/dev/null 2>&1 || {
  printf 'D4 storage readiness requires a reachable Docker daemon.\n' >&2
  exit 1
}
volume_exists=false
while IFS= read -r existing_volume; do
  if [[ "${existing_volume}" == "${volume_name}" ]]; then
    volume_exists=true
    break
  fi
done < <(docker volume ls --format '{{.Name}}')
if [[ "${volume_exists}" == true ]]; then
  volume_options="$(docker volume inspect --format '{{json .Options}}' "${volume_name}")"
  python3 - "${volume_options}" "${data_directory}" <<'PY'
import json
import sys

try:
    options = json.loads(sys.argv[1])
except (TypeError, ValueError) as exc:
    raise SystemExit("D4 storage readiness rejected unreadable Docker volume options.") from exc
if options != {"device": sys.argv[2], "o": "bind", "type": "none"}:
    raise SystemExit("D4 storage readiness rejected a Docker volume collision.")
PY
fi

printf 'D4 encrypted storage readiness PASSED. No host or Docker state changed.\n'
