#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: ./scripts/verify-workspace.sh

Checks the Portal monorepo source boundaries, protected strategy integrity,
shell syntax and both rendered Docker Compose definitions.
EOF
}

if [[ $# -ne 0 ]]; then
  usage >&2
  exit 2
fi

for required in \
  "${ROOT_DIR}/compose.yaml" \
  "${ROOT_DIR}/deploy/compose.production.yaml" \
  "${ROOT_DIR}/deploy/.env.production.example" \
  "${ROOT_DIR}/vendor/hmd-reader/README.md" \
  "${ROOT_DIR}/.gitignore" \
  "${ROOT_DIR}/.dockerignore" \
  "${ROOT_DIR}/.githooks/lib/access-policy.sh" \
  "${ROOT_DIR}/.githooks/pre-applypatch" \
  "${ROOT_DIR}/.githooks/pre-commit" \
  "${ROOT_DIR}/.githooks/pre-merge-commit" \
  "${ROOT_DIR}/.githooks/pre-push" \
  "${ROOT_DIR}/.githooks/pre-rebase" \
  "${ROOT_DIR}/apps/portal/backend/pyproject.toml" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/api/routes_portal.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/adapters/quantbt_summary.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/domain/portal_registry.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/domain/portal_summary.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/repositories/portal_registry.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/services/portal_registry.py" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_portal_registry_api.py" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_quantbt_summary_adapter.py" \
  "${ROOT_DIR}/apps/portal/frontend/package-lock.json" \
  "${ROOT_DIR}/apps/portal/registry/registry.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-registry-source.v1.schema.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-registry.v1.schema.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-summary.v1.schema.json" \
  "${ROOT_DIR}/apps/portal/strategy/PROTECTED_SHA256" \
  "${ROOT_DIR}/apps/portal/strategy/main.py" \
  "${ROOT_DIR}/features/roadmap-task-board/backend/requirements-dev.txt" \
  "${ROOT_DIR}/features/roadmap-task-board/frontend/package-lock.json"; do
  [[ -f "${required}" ]] || {
    printf 'Required Portal source file is missing: %s\n' "${required}" >&2
    exit 1
  }
done

command -v docker >/dev/null 2>&1 || {
  printf 'Docker CLI is required to validate compose.yaml.\n' >&2
  exit 1
}

if nested_git="$(find "${ROOT_DIR}/apps" "${ROOT_DIR}/features" -name .git -print -quit)"; [[ -n "${nested_git}" ]]; then
  printf 'Nested Git metadata is not allowed in the Portal monorepo: %s\n' "${nested_git}" >&2
  exit 1
fi

for tracked_source in \
  apps/portal/backend/pyproject.toml \
  apps/portal/backend/src/portal_api/api/routes_portal.py \
  apps/portal/backend/src/portal_api/adapters/quantbt_summary.py \
  apps/portal/backend/src/portal_api/domain/portal_registry.py \
  apps/portal/backend/src/portal_api/domain/portal_summary.py \
  apps/portal/backend/src/portal_api/repositories/portal_registry.py \
  apps/portal/backend/src/portal_api/services/portal_registry.py \
  apps/portal/backend/tests/test_portal_registry_api.py \
  apps/portal/backend/tests/test_quantbt_summary_adapter.py \
  apps/portal/frontend/package-lock.json \
  apps/portal/registry/registry.json \
  apps/portal/registry/schemas/portal-registry-source.v1.schema.json \
  apps/portal/registry/schemas/portal-registry.v1.schema.json \
  apps/portal/registry/schemas/portal-summary.v1.schema.json \
  apps/portal/strategy/PROTECTED_SHA256 \
  features/roadmap-task-board/backend/requirements-dev.txt \
  features/roadmap-task-board/frontend/package-lock.json; do
  git -C "${ROOT_DIR}" ls-files --error-unmatch "${tracked_source}" >/dev/null || {
    printf 'Portal source is present but not tracked by the parent Git: %s\n' "${tracked_source}" >&2
    exit 1
  }
done

command -v python3 >/dev/null 2>&1 || {
  printf 'Python 3 is required to validate Portal JSON contracts.\n' >&2
  exit 1
}

for json_contract in \
  "${ROOT_DIR}/apps/portal/registry/registry.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-registry-source.v1.schema.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-registry.v1.schema.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-summary.v1.schema.json"; do
  python3 -m json.tool "${json_contract}" >/dev/null
done

bash -n \
  "${ROOT_DIR}/scripts/portal" \
  "${ROOT_DIR}/scripts/verify-workspace.sh" \
  "${ROOT_DIR}/scripts/smoke-stack.sh" \
  "${ROOT_DIR}/scripts/stage-hmd-reader-wheel.sh" \
  "${ROOT_DIR}/scripts/install-git-hooks.sh" \
  "${ROOT_DIR}/scripts/provision-contributor-workspace.sh" \
  "${ROOT_DIR}/scripts/verify-contributor-workspace.sh" \
  "${ROOT_DIR}/.githooks/lib/access-policy.sh" \
  "${ROOT_DIR}/.githooks/pre-applypatch" \
  "${ROOT_DIR}/.githooks/pre-commit" \
  "${ROOT_DIR}/.githooks/pre-merge-commit" \
  "${ROOT_DIR}/.githooks/pre-push" \
  "${ROOT_DIR}/.githooks/pre-rebase" \
  "${ROOT_DIR}/apps/portal/scripts/run_backend.sh" \
  "${ROOT_DIR}/apps/portal/scripts/run_dev.sh" \
  "${ROOT_DIR}/apps/portal/scripts/run_frontend.sh" \
  "${ROOT_DIR}/apps/portal/scripts/smoke_quantbt_pypi.sh" \
  "${ROOT_DIR}/apps/portal/scripts/test_backend.sh" \
  "${ROOT_DIR}/features/roadmap-task-board/tooling/clean-generated.sh"

(cd "${ROOT_DIR}/apps/portal" && sha256sum -c strategy/PROTECTED_SHA256)

while IFS= read -r tracked_path; do
  case "${tracked_path}" in
    */node_modules/*|*/dist/*|*/build/*|*/coverage/*|*/.pytest_cache/*|*/__pycache__/*|*/tsconfig.tsbuildinfo)
      printf 'Generated dependency or build output is tracked by Portal Git: %s\n' "${tracked_path}" >&2
      exit 1
      ;;
  esac
done < <(git -C "${ROOT_DIR}" ls-files)

docker compose --project-directory "${ROOT_DIR}" -f "${ROOT_DIR}/compose.yaml" config --quiet
docker compose --project-directory "${ROOT_DIR}" \
  --env-file "${ROOT_DIR}/deploy/.env.production.example" \
  -f "${ROOT_DIR}/deploy/compose.production.yaml" config --quiet
printf 'Portal monorepo verification passed.\n'
