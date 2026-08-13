#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="${ROOT_DIR}/repos.conf"
LOCK_FILE="${ROOT_DIR}/repos.lock"
REQUIRE_SOURCES=false

usage() {
  cat <<'EOF'
Usage: ./scripts/verify-workspace.sh [--require-sources]

Checks parent-repository contracts, manifest/lock consistency, shell syntax and
the rendered Docker Compose configuration. --require-sources additionally
requires every configured child repository to exist and contain its locked
revision; CI uses this mode after ./scripts/portal sync --locked.
EOF
}

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 2
fi
if [[ "${1:-}" == "--require-sources" ]]; then
  REQUIRE_SOURCES=true
elif [[ $# -eq 1 ]]; then
  usage >&2
  exit 2
fi

for required in \
  "${ROOT_DIR}/compose.yaml" \
  "${ROOT_DIR}/deploy/compose.production.yaml" \
  "${ROOT_DIR}/deploy/.env.production.example" \
  "${ROOT_DIR}/repos.conf" \
  "${ROOT_DIR}/repos.lock" \
  "${ROOT_DIR}/.gitignore" \
  "${ROOT_DIR}/.dockerignore"; do
  [[ -f "${required}" ]] || {
    printf 'Required workspace file is missing: %s\n' "${required}" >&2
    exit 1
  }
done

command -v docker >/dev/null 2>&1 || {
  printf 'Docker CLI is required to validate compose.yaml.\n' >&2
  exit 1
}

bash -n \
  "${ROOT_DIR}/scripts/portal" \
  "${ROOT_DIR}/scripts/sync-repos.sh" \
  "${ROOT_DIR}/scripts/verify-workspace.sh" \
  "${ROOT_DIR}/scripts/smoke-stack.sh" \
  "${ROOT_DIR}/scripts/install-git-hooks.sh"

locked_revision() {
  local wanted_name="$1"
  local lock_name revision ignored
  while IFS='|' read -r lock_name revision ignored; do
    [[ -z "${lock_name}" || "${lock_name}" == \#* ]] && continue
    [[ -z "${ignored}" ]] || {
      printf 'Invalid lock row for %s\n' "${lock_name}" >&2
      exit 1
    }
    if [[ "${lock_name}" == "${wanted_name}" ]]; then
      printf '%s\n' "${revision}"
      return 0
    fi
  done < "${LOCK_FILE}"
  return 1
}

seen_names="|"
while IFS='|' read -r name relative_path remote_url default_branch extra; do
  [[ -z "${name}" || "${name}" == \#* ]] && continue
  [[ -n "${relative_path}" && -n "${remote_url}" && -n "${default_branch}" && -z "${extra}" ]] || {
    printf 'Invalid manifest row for %s\n' "${name}" >&2
    exit 1
  }
  [[ "${seen_names}" != *"|${name}|"* ]] || {
    printf 'Duplicate repository name in manifest: %s\n' "${name}" >&2
    exit 1
  }
  seen_names+="${name}|"

  revision="$(locked_revision "${name}")" || {
    printf 'No locked revision for %s in %s\n' "${name}" "${LOCK_FILE}" >&2
    exit 1
  }
  [[ -n "${revision}" ]] || {
    printf 'Empty locked revision for %s\n' "${name}" >&2
    exit 1
  }

  repository="${ROOT_DIR}/${relative_path}"
  if [[ "${REQUIRE_SOURCES}" == true ]]; then
    [[ -d "${repository}/.git" ]] || {
      printf 'Configured repository is absent: %s\n' "${repository}" >&2
      exit 1
    }
    configured_url="$(git -C "${repository}" remote get-url origin)"
    [[ "${configured_url}" == "${remote_url}" ]] || {
      printf 'Unexpected origin for %s: %s\n' "${name}" "${configured_url}" >&2
      exit 1
    }
    git -C "${repository}" rev-parse --verify --quiet "${revision}^{commit}" >/dev/null || {
      printf 'Locked revision missing from %s: %s\n' "${name}" "${revision}" >&2
      exit 1
    }
    git -C "${repository}" diff --check
    git -C "${repository}" diff --cached --check
  fi
done < "${MANIFEST}"

seen_locks="|"
while IFS='|' read -r lock_name revision extra; do
  [[ -z "${lock_name}" || "${lock_name}" == \#* ]] && continue
  [[ -n "${revision}" && -z "${extra}" ]] || {
    printf 'Invalid lock row for %s\n' "${lock_name}" >&2
    exit 1
  }
  [[ "${seen_names}" == *"|${lock_name}|"* ]] || {
    printf 'Lock entry has no matching manifest repository: %s\n' "${lock_name}" >&2
    exit 1
  }
  [[ "${seen_locks}" != *"|${lock_name}|"* ]] || {
    printf 'Duplicate repository name in lock file: %s\n' "${lock_name}" >&2
    exit 1
  }
  seen_locks+="${lock_name}|"
done < "${LOCK_FILE}"

# Current app-specific integrity contract. Further sub-portals should add an
# equivalent contract to this script alongside their Compose service.
QUANTBT_PORTAL_ROOT="${ROOT_DIR}/apps/quantbt-portal"
if [[ -d "${QUANTBT_PORTAL_ROOT}/strategy" ]]; then
  (cd "${QUANTBT_PORTAL_ROOT}" && sha256sum -c strategy/PROTECTED_SHA256)
fi

docker compose --project-directory "${ROOT_DIR}" -f "${ROOT_DIR}/compose.yaml" config --quiet
docker compose --project-directory "${ROOT_DIR}" \
  --env-file "${ROOT_DIR}/deploy/.env.production.example" \
  -f "${ROOT_DIR}/deploy/compose.production.yaml" config --quiet
printf 'Workspace verification passed%s.\n' \
  "$([[ "${REQUIRE_SOURCES}" == true ]] && printf ' with locked sources' || true)"
