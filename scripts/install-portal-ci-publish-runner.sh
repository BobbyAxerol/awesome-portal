#!/usr/bin/env bash
# Install a dedicated rootless GitHub Actions runner for Portal CI and image
# publication.  It is deliberately separate from the production deploy runner.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  sudo scripts/install-portal-ci-publish-runner.sh \
    --repository-url https://github.com/BobbyAxerol/awesome-portal \
    --registration-token-file /tmp/portal-ci-runner-registration-token \
    --lock-file deploy/self-hosted-ci-runner/actions-runner.lock.json \
    --install-browser-deps
USAGE
}

repository_url=''
registration_token_file=''
lock_file=''
install_browser_deps=false

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
    --install-browser-deps)
      install_browser_deps=true
      shift
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

[[ "$(id -u)" == '0' ]] || {
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
required_strings = (
    "runner_version", "asset_name", "asset_url", "asset_sha256", "runner_name",
    "runner_user", "runner_home", "runner_directory", "runtime_directory",
    "docker_service_name", "runner_service_name", "slice_name",
)
missing = [key for key in required_strings if not isinstance(lock.get(key), str) or not lock[key]]
if missing:
    raise SystemExit(f"missing lock keys: {', '.join(missing)}")
labels = lock.get("runner_labels")
if labels != ["portal-ci", "portal-publish"]:
    raise SystemExit("runner_labels must be the exact portal-ci,portal-publish pair")
if not re.fullmatch(r"[0-9a-f]{64}", lock["asset_sha256"]):
    raise SystemExit("asset_sha256 must be lowercase SHA-256")
if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", lock["runner_version"]):
    raise SystemExit("runner_version is invalid")
for key in required_strings:
    print(lock[key])
print(",".join(labels))
PY
)

runner_version="${lock_values[0]}"
asset_name="${lock_values[1]}"
asset_url="${lock_values[2]}"
asset_sha256="${lock_values[3]}"
runner_name="${lock_values[4]}"
runner_user="${lock_values[5]}"
runner_home="${lock_values[6]}"
runner_directory="${lock_values[7]}"
runtime_directory="${lock_values[8]}"
docker_service_name="${lock_values[9]}"
runner_service_name="${lock_values[10]}"
slice_name="${lock_values[11]}"
runner_labels="${lock_values[12]}"

[[ "${runner_name}" == 'portal-ci-publish-sgp1' ]] || { echo 'Unexpected runner name.' >&2; exit 1; }
[[ "${runner_user}" == 'portal-ci-runner' ]] || { echo 'Unexpected runner user.' >&2; exit 1; }
[[ "${runner_home}" == '/srv/portal-ci-runner' ]] || { echo 'Unexpected runner home.' >&2; exit 1; }
[[ "${runner_directory}" == "${runner_home}/actions-runner" ]] || { echo 'Unexpected runner directory.' >&2; exit 1; }
[[ "${runtime_directory}" == "${runner_home}/runtime" ]] || { echo 'Unexpected runtime directory.' >&2; exit 1; }
[[ "${docker_service_name}" == 'portal-ci-rootless-docker.service' ]] || { echo 'Unexpected Docker service name.' >&2; exit 1; }
[[ "${runner_service_name}" == 'portal-gh-ci-publish-runner.service' ]] || { echo 'Unexpected runner service name.' >&2; exit 1; }
[[ "${slice_name}" == 'portal-ci-publish.slice' ]] || { echo 'Unexpected runner slice name.' >&2; exit 1; }
[[ "${runner_labels}" == 'portal-ci,portal-publish' ]] || { echo 'Unexpected runner labels.' >&2; exit 1; }
[[ "${asset_name}" == "actions-runner-linux-x64-${runner_version}.tar.gz" ]] || { echo 'Runner asset/version drifted.' >&2; exit 1; }
[[ "${asset_url}" == "https://github.com/actions/runner/releases/download/v${runner_version}/${asset_name}" ]] || { echo 'Runner download URL drifted.' >&2; exit 1; }

for required_command in curl docker dockerd-rootless.sh rootlesskit slirp4netns newuidmap newgidmap runuser systemctl tar sha256sum python3; do
  command -v "${required_command}" >/dev/null 2>&1 || {
    printf 'Required rootless CI runner command is missing: %s\n' "${required_command}" >&2
    exit 1
  }
done
docker compose version >/dev/null 2>&1 || {
  echo 'Docker Compose v2 is required for the CI runner.' >&2
  exit 1
}
[[ "$(sysctl -n kernel.unprivileged_userns_clone 2>/dev/null || true)" == '1' ]] || {
  echo 'kernel.unprivileged_userns_clone must be enabled for rootless Docker.' >&2
  exit 1
}

browser_packages=(
  fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0
  libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libgtk-3-0
  libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1
  libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 libxshmfence1
  libxss1 libxtst6 xvfb
)
missing_browser_packages=()
for package in "${browser_packages[@]}"; do
  dpkg-query -W -f='${db:Status-Abbrev}' "${package}" 2>/dev/null | grep -qx 'ii ' || \
    missing_browser_packages+=("${package}")
done
if ((${#missing_browser_packages[@]} > 0)); then
  [[ "${install_browser_deps}" == true ]] || {
    printf 'Missing Playwright Chromium packages: %s\n' "${missing_browser_packages[*]}" >&2
    echo 'Re-run with --install-browser-deps after reviewing the exact package list.' >&2
    exit 1
  }
  apt-get update
  apt-get install --yes --no-install-recommends "${missing_browser_packages[@]}"
fi

tmp_dir=''
installation_complete=0
runner_user_created=0
subuid_start=''
subgid_start=''
units_installed=0
helper_directory_installed=0
runner_directory_created=0

cleanup() {
  [[ -e "${registration_token_file}" ]] && shred -u -- "${registration_token_file}" || true
  [[ -n "${tmp_dir}" && -d "${tmp_dir}" ]] && rm -rf -- "${tmp_dir}"
  if (( installation_complete == 0 )); then
    systemctl disable --now "${runner_service_name}" "${docker_service_name}" >/dev/null 2>&1 || true
    if (( units_installed == 1 )); then
      rm -f -- "/etc/systemd/system/${runner_service_name}" \
        "/etc/systemd/system/${docker_service_name}" \
        "/etc/systemd/system/${slice_name}"
      systemctl daemon-reload || true
    fi
    if (( helper_directory_installed == 1 )); then
      rm -rf -- /usr/local/lib/portal-ci-runner
    fi
    if (( runner_directory_created == 1 )); then
      rm -rf -- "${runner_home}"
    fi
    if (( runner_user_created == 1 )); then
      if [[ -n "${subuid_start}" ]]; then
        sed -i "\\|^${runner_user}:${subuid_start}:65536$|d" /etc/subuid || true
      fi
      if [[ -n "${subgid_start}" ]]; then
        sed -i "\\|^${runner_user}:${subgid_start}:65536$|d" /etc/subgid || true
      fi
      userdel --remove "${runner_user}" >/dev/null 2>&1 || true
    fi
  fi
}
trap cleanup EXIT

registration_token="$(tr -d '\r\n' < "${registration_token_file}")"
[[ "${registration_token}" =~ ^[A-Za-z0-9._-]{20,}$ ]] || {
  echo 'Registration token format is invalid.' >&2
  exit 1
}

source_directory="$(dirname "${lock_file}")"
for source_file in \
  "${source_directory}/${slice_name}" \
  "${source_directory}/${docker_service_name}" \
  "${source_directory}/${runner_service_name}" \
  "${source_directory}/wait-for-rootless-docker.sh" \
  "${source_directory}/job-completed-cleanup.sh"; do
  [[ -f "${source_file}" ]] || {
    printf 'Required CI runner source file is missing: %s\n' "${source_file}" >&2
    exit 1
  }
done

if id -u "${runner_user}" >/dev/null 2>&1; then
  echo 'Refusing to reuse an existing CI runner user.' >&2
  exit 1
fi
for forbidden_path in \
  "${runner_home}" \
  "/etc/systemd/system/${runner_service_name}" \
  "/etc/systemd/system/${docker_service_name}" \
  "/etc/systemd/system/${slice_name}" \
  /usr/local/lib/portal-ci-runner; do
  [[ ! -e "${forbidden_path}" ]] || {
    printf 'Refusing to overwrite an existing CI runner path: %s\n' "${forbidden_path}" >&2
    exit 1
  }
done

useradd --system --create-home --home-dir "${runner_home}" --shell /usr/sbin/nologin "${runner_user}"
runner_user_created=1
install -d -o "${runner_user}" -g "${runner_user}" -m 0700 \
  "${runner_home}" "${runtime_directory}" "${runner_home}/.docker"

next_subid_start() {
  awk -F: 'BEGIN { max = 100000 }
    $2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ {
      end = $2 + $3
      if (end > max) max = end
    }
    END { print max }' "$1"
}

if ! grep -q "^${runner_user}:" /etc/subuid; then
  subuid_start="$(next_subid_start /etc/subuid)"
  usermod --add-subuids "${subuid_start}-$((subuid_start + 65535))" "${runner_user}"
fi
if ! grep -q "^${runner_user}:" /etc/subgid; then
  subgid_start="$(next_subid_start /etc/subgid)"
  usermod --add-subgids "${subgid_start}-$((subgid_start + 65535))" "${runner_user}"
fi
grep -q "^${runner_user}:[0-9][0-9]*:[1-9][0-9]*$" /etc/subuid || {
  echo 'Subordinate UID allocation was not created for the rootless CI runner.' >&2
  exit 1
}
grep -q "^${runner_user}:[0-9][0-9]*:[1-9][0-9]*$" /etc/subgid || {
  echo 'Subordinate GID allocation was not created for the rootless CI runner.' >&2
  exit 1
}

tmp_dir="$(mktemp -d /tmp/portal-ci-runner.XXXXXX)"
archive_path="${tmp_dir}/${asset_name}"
curl --fail-with-body --silent --show-error --location --proto '=https' --tlsv1.2 \
  --output "${archive_path}" "${asset_url}"
printf '%s  %s\n' "${asset_sha256}" "${archive_path}" | sha256sum --check --status

install -d -o "${runner_user}" -g "${runner_user}" -m 0700 "${runner_directory}"
runner_directory_created=1
tar --extract --gzip --file "${archive_path}" --directory "${runner_directory}" --no-same-owner
chown -R "${runner_user}:${runner_user}" "${runner_directory}"

runuser -u "${runner_user}" -- env \
  HOME="${runner_home}" \
  XDG_RUNTIME_DIR="${runtime_directory}" \
  "${runner_directory}/config.sh" --unattended --replace \
    --url "${repository_url}" --token "${registration_token}" \
    --name "${runner_name}" --labels "${runner_labels}" --work _work

install -d -o root -g root -m 0755 /usr/local/lib/portal-ci-runner
helper_directory_installed=1
install -o root -g root -m 0755 \
  "${source_directory}/wait-for-rootless-docker.sh" \
  /usr/local/lib/portal-ci-runner/wait-for-rootless-docker.sh
install -o root -g root -m 0755 \
  "${source_directory}/job-completed-cleanup.sh" \
  /usr/local/lib/portal-ci-runner/job-completed-cleanup.sh
for unit in "${slice_name}" "${docker_service_name}" "${runner_service_name}"; do
  install -o root -g root -m 0644 \
    "${source_directory}/${unit}" "/etc/systemd/system/${unit}"
done
units_installed=1
systemctl daemon-reload
systemctl enable --now "${docker_service_name}"

# Rootless Docker initializes containerd and BuildKit asynchronously.  Do not
# mistake the short socket-creation interval for a failed bootstrap; the same
# bounded readiness helper is used by the runner service itself.
runuser -u "${runner_user}" -- env \
  HOME="${runner_home}" \
  XDG_RUNTIME_DIR="${runtime_directory}" \
  DOCKER_HOST="unix://${runtime_directory}/docker.sock" \
  /usr/local/lib/portal-ci-runner/wait-for-rootless-docker.sh

rootless_security_options="$(runuser -u "${runner_user}" -- env \
  HOME="${runner_home}" \
  XDG_RUNTIME_DIR="${runtime_directory}" \
  DOCKER_HOST="unix://${runtime_directory}/docker.sock" \
  docker info --format '{{json .SecurityOptions}}')"
grep -Fq 'name=rootless' <<<"${rootless_security_options}" || {
  echo 'CI runner Docker daemon did not report rootless mode.' >&2
  exit 1
}

systemctl enable --now "${runner_service_name}"
systemctl is-active --quiet "${docker_service_name}"
systemctl is-active --quiet "${runner_service_name}"
installation_complete=1
printf 'Portal CI/publication runner is installed and active: %s / %s\n' \
  "${docker_service_name}" "${runner_service_name}"
