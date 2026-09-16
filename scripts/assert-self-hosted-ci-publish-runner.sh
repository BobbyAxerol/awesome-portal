#!/usr/bin/env bash
# Fail closed if a CI/publication workflow is accidentally scheduled on the
# deployment runner, rootful Docker, or a generic host.
set -euo pipefail

readonly expected_name='portal-ci-publish-sgp1'
readonly expected_user='portal-ci-runner'
readonly expected_home='/srv/portal-ci-runner'
readonly expected_runtime="${expected_home}/runtime"
readonly expected_docker_host="unix://${expected_runtime}/docker.sock"

[[ "${RUNNER_NAME:-}" == "${expected_name}" ]] || {
  printf 'Unexpected CI/publication runner: %s\n' "${RUNNER_NAME:-<unset>}" >&2
  exit 1
}
[[ "$(id -un)" == "${expected_user}" && "$(id -u)" != '0' ]] || {
  echo 'CI/publication runner must be the dedicated non-root user.' >&2
  exit 1
}
[[ "${HOME:-}" == "${expected_home}" ]] || {
  printf 'Unexpected CI/publication runner home: %s\n' "${HOME:-<unset>}" >&2
  exit 1
}
[[ "${XDG_RUNTIME_DIR:-}" == "${expected_runtime}" ]] || {
  echo 'CI/publication runner XDG runtime directory drifted.' >&2
  exit 1
}
[[ "${DOCKER_HOST:-}" == "${expected_docker_host}" && -S "${expected_runtime}/docker.sock" ]] || {
  echo 'CI/publication runner must use its private rootless Docker socket.' >&2
  exit 1
}
docker --host "${expected_docker_host}" info --format '{{json .SecurityOptions}}' \
  | grep -Fq 'name=rootless' || {
  echo 'CI/publication runner Docker daemon is not rootless.' >&2
  exit 1
}

echo 'Dedicated rootless CI/publication runner boundary verified.'
