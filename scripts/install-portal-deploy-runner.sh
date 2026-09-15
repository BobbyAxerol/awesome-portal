#!/usr/bin/env bash
# Install the dedicated non-root runner used only by Portal deploy.yml.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  sudo scripts/install-portal-deploy-runner.sh \
    --repository-url https://github.com/BobbyAxerol/awesome-portal \
    --registration-token-file /tmp/portal-gh-runner-registration-token \
    --lock-file deploy/self-hosted-runner/actions-runner.lock.json
USAGE
}

repository_url=""
registration_token_file=""
lock_file=""

while (($#)); do
  case "$1" in
    --repository-url)
      repository_url="${2:-}"
      shift 2
      ;;
    --registration-token-file)
      registration_token_file="${2:-}"
      shift 2
      ;;
    --lock-file)
      lock_file="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

[[ "$(id -u)" == "0" ]] || {
  echo 'Run this installer through sudo as root.' >&2
  exit 1
}
[[ "${repository_url}" == 'https://github.com/BobbyAxerol/awesome-portal' ]] || {
  echo 'Only the canonical Portal repository is permitted.' >&2
  exit 1
}
[[ -n "${registration_token_file}" && -f "${registration_token_file}" ]] || {
  echo 'A registration-token file is required.' >&2
  exit 1
}
[[ -n "${lock_file}" && -f "${lock_file}" ]] || {
  echo 'A runner lock file is required.' >&2
  exit 1
}

readarray -t lock_values < <(python3 - "${lock_file}" <<'PY'
import json
import re
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    lock = json.load(handle)
required = (
    "runner_version", "asset_name", "asset_url", "asset_sha256", "runner_name",
    "runner_label", "runner_user", "runner_home", "runner_directory", "service_name",
)
missing = [key for key in required if not isinstance(lock.get(key), str) or not lock[key]]
if missing:
    raise SystemExit(f"missing lock keys: {', '.join(missing)}")
if not re.fullmatch(r"[0-9a-f]{64}", lock["asset_sha256"]):
    raise SystemExit("asset_sha256 must be lowercase SHA-256")
if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", lock["runner_version"]):
    raise SystemExit("runner_version is invalid")
for key in required:
    print(lock[key])
PY
)

runner_version="${lock_values[0]}"
asset_name="${lock_values[1]}"
asset_url="${lock_values[2]}"
asset_sha256="${lock_values[3]}"
runner_name="${lock_values[4]}"
runner_label="${lock_values[5]}"
runner_user="${lock_values[6]}"
runner_home="${lock_values[7]}"
runner_directory="${lock_values[8]}"
service_name="${lock_values[9]}"

[[ "${runner_user}" == 'portal-gh-runner' ]] || { echo 'Unexpected runner user.' >&2; exit 1; }
[[ "${runner_home}" == '/srv/portal-gh-runner' ]] || { echo 'Unexpected runner home.' >&2; exit 1; }
[[ "${runner_directory}" == "${runner_home}/actions-runner" ]] || { echo 'Unexpected runner directory.' >&2; exit 1; }
[[ "${service_name}" == 'portal-gh-deploy-runner.service' ]] || { echo 'Unexpected service name.' >&2; exit 1; }
[[ "${asset_name}" == "actions-runner-linux-x64-${runner_version}.tar.gz" ]] || { echo 'Runner asset/version drifted.' >&2; exit 1; }
[[ "${asset_url}" == "https://github.com/actions/runner/releases/download/v${runner_version}/${asset_name}" ]] || { echo 'Runner download URL drifted.' >&2; exit 1; }

tmp_dir=""
installation_complete=0
service_unit_installed=0
runner_directory_created=0
cleanup() {
  [[ -e "${registration_token_file}" ]] && shred -u -- "${registration_token_file}" || true
  [[ -n "${tmp_dir}" && -d "${tmp_dir}" ]] && rm -rf -- "${tmp_dir}"
  if (( installation_complete == 0 )); then
    systemctl disable --now "${service_name}" >/dev/null 2>&1 || true
    if (( service_unit_installed == 1 )); then
      rm -f -- "/etc/systemd/system/${service_name}"
      systemctl daemon-reload || true
    fi
    if (( runner_directory_created == 1 )); then
      rm -rf -- "${runner_directory}"
    fi
  fi
}
trap cleanup EXIT

registration_token="$(tr -d '\r\n' < "${registration_token_file}")"
[[ "${registration_token}" =~ ^[A-Za-z0-9._-]{20,}$ ]] || {
  echo 'Registration token format is invalid.' >&2
  exit 1
}

service_unit_source="$(dirname "${lock_file}")/${service_name}"
[[ -f "${service_unit_source}" ]] || {
  printf 'Service unit is missing next to lock file: %s\n' "${service_unit_source}" >&2
  exit 1
}

if ! id -u "${runner_user}" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${runner_home}" --shell /usr/sbin/nologin "${runner_user}"
fi
install -d -o "${runner_user}" -g "${runner_user}" -m 0700 "${runner_home}"

if systemctl is-active --quiet "${service_name}"; then
  printf 'Runner service is already active: %s\n' "${service_name}" >&2
  exit 1
fi
[[ ! -e "/etc/systemd/system/${service_name}" ]] || {
  printf 'Runner service unit already exists: %s\n' "${service_name}" >&2
  exit 1
}
[[ ! -e "${runner_directory}" ]] || {
  printf 'Runner directory already exists: %s\n' "${runner_directory}" >&2
  exit 1
}

tmp_dir="$(mktemp -d /tmp/portal-gh-runner.XXXXXX)"

archive_path="${tmp_dir}/${asset_name}"
curl --fail-with-body --silent --show-error --location --proto '=https' --tlsv1.2 \
  --output "${archive_path}" "${asset_url}"
printf '%s  %s\n' "${asset_sha256}" "${archive_path}" | sha256sum --check --status

install -d -o "${runner_user}" -g "${runner_user}" -m 0700 "${runner_directory}"
runner_directory_created=1
tar --extract --gzip --file "${archive_path}" --directory "${runner_directory}" --no-same-owner
chown -R "${runner_user}:${runner_user}" "${runner_directory}"

runuser -u "${runner_user}" -- env HOME="${runner_home}" \
  "${runner_directory}/config.sh" --unattended --replace \
  --url "${repository_url}" --token "${registration_token}" \
  --name "${runner_name}" --labels "${runner_label}" --work _work

install -o root -g root -m 0644 "${service_unit_source}" "/etc/systemd/system/${service_name}"
service_unit_installed=1
systemctl daemon-reload
systemctl enable --now "${service_name}"
systemctl is-active --quiet "${service_name}"
installation_complete=1
printf 'Portal deployment runner is installed and active: %s\n' "${service_name}"
