#!/usr/bin/env bash
# Root-owned helper installed outside the runner's writable worktree.
set -euo pipefail

readonly runner_home='/srv/portal-ci-runner'
readonly runtime_dir="${runner_home}/runtime"
readonly docker_host="unix://${runtime_dir}/docker.sock"

[[ "$(id -un)" == 'portal-ci-runner' ]] || {
  echo 'CI runner Docker readiness check must run as portal-ci-runner.' >&2
  exit 1
}
[[ "${HOME:-}" == "${runner_home}" ]] || {
  echo 'CI runner Docker readiness check received an unexpected HOME.' >&2
  exit 1
}
[[ "${XDG_RUNTIME_DIR:-}" == "${runtime_dir}" ]] || {
  echo 'CI runner Docker readiness check received an unexpected XDG runtime directory.' >&2
  exit 1
}

for attempt in $(seq 1 30); do
  if [[ -S "${runtime_dir}/docker.sock" ]] && \
    docker --host "${docker_host}" version --format '{{.Server.Version}}' >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

echo 'Rootless Docker did not become ready within 30 seconds.' >&2
exit 1
