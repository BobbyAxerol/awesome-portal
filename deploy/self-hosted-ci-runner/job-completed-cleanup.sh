#!/usr/bin/env bash
# Root-owned GitHub runner completion hook.  It never sees production paths,
# Docker's rootful socket, Portal volumes, or the deployment runner home.
set -euo pipefail

readonly runner_user='portal-ci-runner'
readonly runner_home='/srv/portal-ci-runner'
readonly runner_dir="${runner_home}/actions-runner"
readonly work_root="${runner_dir}/_work"
readonly runtime_dir="${runner_home}/runtime"
readonly docker_host="unix://${runtime_dir}/docker.sock"

[[ "$(id -un)" == "${runner_user}" ]] || exit 0
[[ "${HOME:-}" == "${runner_home}" ]] || exit 0
[[ "${DOCKER_HOST:-}" == "${docker_host}" ]] || exit 0

# The hook is normally invoked from the Actions workspace, but an owner may
# also run it manually from an arbitrary directory.  Enter the runner-owned
# root before any `find` so an inaccessible caller cwd can never make cleanup
# fail partway through its bounded routine.
cd "${runner_home}"

safe_clear_workspace() {
  local workspace_root workspace
  [[ -n "${GITHUB_WORKSPACE:-}" && -d "${GITHUB_WORKSPACE}" ]] || return 0
  workspace_root="$(realpath -e "${work_root}")" || return 0
  workspace="$(realpath -e "${GITHUB_WORKSPACE}")" || return 0
  case "${workspace}" in
    "${workspace_root}"/*/*)
      ;;
    *)
      echo 'Refused CI workspace cleanup outside the exact runner work root.' >&2
      return 0
      ;;
  esac
  case "${workspace#"${workspace_root}/"}" in
    _actions/*|_temp/*|_tool/*)
      echo 'Refused CI workspace cleanup of a runner-reserved directory.' >&2
      return 0
      ;;
  esac
  find "${workspace}" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
}

safe_clear_workspace

# Retain only fresh, rootless CI-only build state.  Never prune volumes: a
# publication job has no durable application volume, and volume deletion would
# be the wrong primitive even within this isolated daemon.
if docker --host "${docker_host}" version >/dev/null 2>&1; then
  docker --host "${docker_host}" container prune --force --filter 'until=24h' >/dev/null || true
  docker --host "${docker_host}" network prune --force --filter 'until=24h' >/dev/null || true
  docker --host "${docker_host}" image prune --all --force --filter 'until=168h' >/dev/null || true
  docker --host "${docker_host}" buildx prune --force --filter 'until=168h' >/dev/null || true
fi

# Playwright browsers are deliberately cached for reproducible browser gates;
# old unused revisions are bounded without deleting the currently used browser.
if [[ -d "${runner_home}/.cache/ms-playwright" ]]; then
  find "${runner_home}/.cache/ms-playwright" -mindepth 1 -maxdepth 1 \
    -type d -mtime +30 -exec rm -rf -- {} +
fi

# GitHub's runner cleans current temp paths itself.  This catches only orphaned
# directories from interrupted jobs after a day, on this runner alone.
if [[ -d "${work_root}/_temp" ]]; then
  find "${work_root}/_temp" -mindepth 1 -maxdepth 1 -mtime +1 \
    -exec rm -rf -- {} +
fi

echo 'portal-ci runner cleanup completed (workspace, stale rootless cache, no volumes).'
