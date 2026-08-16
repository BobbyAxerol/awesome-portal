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
  "${ROOT_DIR}/constraints/portal.txt" \
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
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/api/ingress.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/api/routes_portal.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/adapters/planning_summary.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/adapters/quantbt_summary.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/domain/portal_registry.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/domain/portal_links.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/domain/portal_summary.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/repositories/portal_links.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/repositories/portal_registry.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/services/portal_links.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/services/portal_registry.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/services/portal_overview.py" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_portal_registry_api.py" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_planning_summary_adapter.py" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_quantbt_summary_adapter.py" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_portal_summary_service.py" \
  "${ROOT_DIR}/apps/portal/backend/src/portal_api/domain/canonical.py" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_canonical_contracts.py" \
  "${ROOT_DIR}/packages/contracts/README.md" \
  "${ROOT_DIR}/packages/contracts/package.json" \
  "${ROOT_DIR}/packages/contracts/package-lock.json" \
  "${ROOT_DIR}/packages/contracts/contracts-snapshot.json" \
  "${ROOT_DIR}/packages/contracts/tooling/snapshot.py" \
  "${ROOT_DIR}/packages/contracts/schemas/common.v1.schema.json" \
  "${ROOT_DIR}/packages/contracts/schemas/problem.v1.schema.json" \
  "${ROOT_DIR}/packages/contracts/schemas/command-envelope.v1.schema.json" \
  "${ROOT_DIR}/packages/contracts/schemas/event-envelope.v1.schema.json" \
  "${ROOT_DIR}/packages/contracts/fixtures/problem.valid.json" \
  "${ROOT_DIR}/packages/contracts/fixtures/command.valid.json" \
  "${ROOT_DIR}/packages/contracts/fixtures/event.valid.json" \
  "${ROOT_DIR}/packages/contracts/generated/portal-api.d.ts" \
  "${ROOT_DIR}/packages/contracts/vitest.config.ts" \
  "${ROOT_DIR}/packages/contracts/test/fixtures.spec.ts" \
  "${ROOT_DIR}/scripts/contracts-test.sh" \
  "${ROOT_DIR}/upgrade/backend/BAR_06_SHARED_CONTRACT_AUTHORITY.md" \
  "${ROOT_DIR}/upgrade/backend/adr/ADR-001-JAVASCRIPT_WORKSPACE_AND_LOCK_AUTHORITY.md" \
  "${ROOT_DIR}/upgrade/backend/adr/ADR-002-OPAQUE_ID_FORMAT.md" \
  "${ROOT_DIR}/upgrade/backend/adr/ADR-005-EVENT_SCHEMA_ENCODING_AND_REGISTRY.md" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_m0_freeze.py" \
  "${ROOT_DIR}/apps/portal/scripts/export_m0_freeze.py" \
  "${ROOT_DIR}/apps/portal/scripts/export_environment_report.py" \
  "${ROOT_DIR}/scripts/verify-m0-golden.sh" \
  "${ROOT_DIR}/upgrade/backend/BAR_05_REPRODUCIBILITY_FREEZE.md" \
  "${ROOT_DIR}/upgrade/backend/bar05/m0-freeze-manifest.json" \
  "${ROOT_DIR}/upgrade/backend/bar05/environment-report.json" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_frontend_handoff.py" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_compat_parity.py" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_artifact_provenance.py" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_portal_links_api.py" \
  "${ROOT_DIR}/apps/portal/backend/tests/test_ingress_boundary.py" \
  "${ROOT_DIR}/apps/portal/frontend/package-lock.json" \
  "${ROOT_DIR}/apps/portal/registry/registry.json" \
  "${ROOT_DIR}/apps/portal/registry/links.v1.json" \
  "${ROOT_DIR}/apps/portal/registry/fixtures/links.public.json" \
  "${ROOT_DIR}/apps/portal/registry/FRONTEND_HANDOFF.md" \
  "${ROOT_DIR}/apps/portal/registry/openapi/portal-api.openapi.json" \
  "${ROOT_DIR}/apps/portal/registry/fixtures/registry.public.json" \
  "${ROOT_DIR}/apps/portal/registry/fixtures/summary.healthy.json" \
  "${ROOT_DIR}/apps/portal/registry/fixtures/summary.empty.json" \
  "${ROOT_DIR}/apps/portal/registry/fixtures/summary.partial.json" \
  "${ROOT_DIR}/apps/portal/registry/fixtures/summary.stale.json" \
  "${ROOT_DIR}/apps/portal/registry/fixtures/summary.denied.json" \
  "${ROOT_DIR}/apps/portal/registry/fixtures/summary.unavailable.json" \
  "${ROOT_DIR}/apps/portal/scripts/export_handoff_contract.py" \
  "${ROOT_DIR}/apps/portal/scripts/export_compat_snapshots.py" \
  "${ROOT_DIR}/apps/portal/scripts/export_m0_freeze.py" \
  "${ROOT_DIR}/apps/portal/scripts/export_environment_report.py" \
  "${ROOT_DIR}/scripts/verify-m0-golden.sh" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-registry-source.v1.schema.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-registry.v1.schema.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-summary.v1.schema.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-links.v1.schema.json" \
  "${ROOT_DIR}/upgrade/backend/BAR_02_COMPATIBILITY_BOUNDARIES_AND_PARITY_FREEZE.md" \
  "${ROOT_DIR}/upgrade/backend/BAR_03_OPERATIONAL_INGRESS_BOUNDARY.md" \
  "${ROOT_DIR}/deploy/nginx/portal.conf" \
  "${ROOT_DIR}/apps/control-api/package.json" \
  "${ROOT_DIR}/apps/control-api/package-lock.json" \
  "${ROOT_DIR}/apps/control-api/tsconfig.json" \
  "${ROOT_DIR}/apps/control-api/vitest.config.ts" \
  "${ROOT_DIR}/apps/control-api/migrations/1723680000000_init-identity.sql" \
  "${ROOT_DIR}/apps/control-api/migrations/1723680000001_control-facade.sql" \
  "${ROOT_DIR}/apps/control-api/src/id.ts" \
  "${ROOT_DIR}/apps/control-api/src/repos/workspaces.ts" \
  "${ROOT_DIR}/apps/control-api/src/repos/runs.ts" \
  "${ROOT_DIR}/apps/control-api/src/repos/outbox.ts" \
  "${ROOT_DIR}/apps/control-api/src/facade/proxy.service.ts" \
  "${ROOT_DIR}/apps/control-api/src/facade/facade.controller.ts" \
  "${ROOT_DIR}/apps/control-api/src/facade/session.guard.ts" \
  "${ROOT_DIR}/apps/control-api/test/facade.spec.ts" \
  "${ROOT_DIR}/upgrade/backend/BAR_07_CONTROL_API_FACADE.md" \
  "${ROOT_DIR}/apps/control-api/src/main.ts" \
  "${ROOT_DIR}/apps/control-api/src/app.ts" \
  "${ROOT_DIR}/apps/control-api/src/app.module.ts" \
  "${ROOT_DIR}/apps/control-api/src/config.ts" \
  "${ROOT_DIR}/apps/control-api/src/domain.ts" \
  "${ROOT_DIR}/apps/control-api/src/tokens.ts" \
  "${ROOT_DIR}/apps/control-api/src/http-error.filter.ts" \
  "${ROOT_DIR}/apps/control-api/src/auth/auth.service.ts" \
  "${ROOT_DIR}/apps/control-api/src/auth/auth.controller.ts" \
  "${ROOT_DIR}/apps/control-api/src/auth/argon.ts" \
  "${ROOT_DIR}/apps/control-api/src/auth/policy.ts" \
  "${ROOT_DIR}/apps/control-api/src/auth/cloudflare.ts" \
  "${ROOT_DIR}/apps/control-api/src/auth/principal.ts" \
  "${ROOT_DIR}/apps/control-api/src/auth/cookies.ts" \
  "${ROOT_DIR}/apps/control-api/src/admin/admin.service.ts" \
  "${ROOT_DIR}/apps/control-api/src/admin/admin.controller.ts" \
  "${ROOT_DIR}/apps/control-api/src/admin/rbac.guard.ts" \
  "${ROOT_DIR}/apps/control-api/src/repos/users.ts" \
  "${ROOT_DIR}/apps/control-api/src/repos/bindings.ts" \
  "${ROOT_DIR}/apps/control-api/src/repos/credentials.ts" \
  "${ROOT_DIR}/apps/control-api/src/repos/sessions.ts" \
  "${ROOT_DIR}/apps/control-api/src/repos/audit.ts" \
  "${ROOT_DIR}/apps/control-api/src/db/pool.ts" \
  "${ROOT_DIR}/apps/control-api/src/health/health.controller.ts" \
  "${ROOT_DIR}/apps/control-api/src/cli/bootstrap.ts" \
  "${ROOT_DIR}/apps/control-api/test/harness.ts" \
  "${ROOT_DIR}/apps/control-api/test/repos.spec.ts" \
  "${ROOT_DIR}/apps/control-api/test/auth.spec.ts" \
  "${ROOT_DIR}/apps/control-api/test/matrix.spec.ts" \
  "${ROOT_DIR}/deploy/images/control-api.Dockerfile" \
  "${ROOT_DIR}/scripts/control-api-test.sh" \
  "${ROOT_DIR}/upgrade/backend/BAR_04_THIN_IDENTITY_BFF.md" \
  "${ROOT_DIR}/upgrade/backend/adr/ADR-003-POSTGRES_MIGRATION_AND_QUERY_APPROACH.md" \
  "${ROOT_DIR}/upgrade/backend/bar02/snapshots/portal-api.openapi.json" \
  "${ROOT_DIR}/upgrade/backend/bar02/snapshots/planning-api.openapi.json" \
  "${ROOT_DIR}/upgrade/backend/bar02/snapshots/run-request.schema.json" \
  "${ROOT_DIR}/upgrade/backend/bar02/snapshots/manifest.json" \
  "${ROOT_DIR}/apps/portal/strategy/PROTECTED_SHA256" \
  "${ROOT_DIR}/apps/portal/strategy/main.py" \
  "${ROOT_DIR}/features/roadmap-task-board/backend/requirements-dev.txt" \
  "${ROOT_DIR}/features/roadmap-task-board/backend/tests/test_summary_contract.py" \
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
  constraints/portal.txt \
  apps/portal/backend/pyproject.toml \
  apps/portal/backend/src/portal_api/api/routes_portal.py \
  apps/portal/backend/src/portal_api/adapters/planning_summary.py \
  apps/portal/backend/src/portal_api/adapters/quantbt_summary.py \
  apps/portal/backend/src/portal_api/domain/portal_registry.py \
  apps/portal/backend/src/portal_api/domain/portal_links.py \
  apps/portal/backend/src/portal_api/domain/portal_summary.py \
  apps/portal/backend/src/portal_api/repositories/portal_links.py \
  apps/portal/backend/src/portal_api/repositories/portal_registry.py \
  apps/portal/backend/src/portal_api/services/portal_links.py \
  apps/portal/backend/src/portal_api/services/portal_registry.py \
  apps/portal/backend/src/portal_api/services/portal_overview.py \
  apps/portal/backend/tests/test_portal_registry_api.py \
  apps/portal/backend/tests/test_planning_summary_adapter.py \
  apps/portal/backend/tests/test_quantbt_summary_adapter.py \
  apps/portal/backend/tests/test_portal_summary_service.py \
  apps/portal/backend/src/portal_api/domain/canonical.py \
  apps/portal/backend/tests/test_canonical_contracts.py \
  packages/contracts/README.md \
  packages/contracts/package.json \
  packages/contracts/package-lock.json \
  packages/contracts/contracts-snapshot.json \
  packages/contracts/tooling/snapshot.py \
  packages/contracts/schemas/common.v1.schema.json \
  packages/contracts/schemas/problem.v1.schema.json \
  packages/contracts/schemas/command-envelope.v1.schema.json \
  packages/contracts/schemas/event-envelope.v1.schema.json \
  packages/contracts/fixtures/problem.valid.json \
  packages/contracts/fixtures/command.valid.json \
  packages/contracts/fixtures/event.valid.json \
  packages/contracts/generated/portal-api.d.ts \
  packages/contracts/vitest.config.ts \
  packages/contracts/test/fixtures.spec.ts \
  scripts/contracts-test.sh \
  upgrade/backend/BAR_06_SHARED_CONTRACT_AUTHORITY.md \
  upgrade/backend/adr/ADR-001-JAVASCRIPT_WORKSPACE_AND_LOCK_AUTHORITY.md \
  upgrade/backend/adr/ADR-002-OPAQUE_ID_FORMAT.md \
  upgrade/backend/adr/ADR-005-EVENT_SCHEMA_ENCODING_AND_REGISTRY.md \
  apps/portal/backend/tests/test_m0_freeze.py \
  apps/portal/scripts/export_m0_freeze.py \
  apps/portal/scripts/export_environment_report.py \
  scripts/verify-m0-golden.sh \
  upgrade/backend/BAR_05_REPRODUCIBILITY_FREEZE.md \
  upgrade/backend/bar05/m0-freeze-manifest.json \
  upgrade/backend/bar05/environment-report.json \
  apps/portal/backend/tests/test_frontend_handoff.py \
  apps/portal/backend/tests/test_compat_parity.py \
  apps/portal/backend/tests/test_artifact_provenance.py \
  apps/portal/backend/tests/test_portal_links_api.py \
  apps/portal/backend/tests/test_ingress_boundary.py \
  apps/portal/frontend/package-lock.json \
  apps/portal/registry/registry.json \
  apps/portal/registry/links.v1.json \
  apps/portal/registry/fixtures/links.public.json \
  apps/portal/registry/FRONTEND_HANDOFF.md \
  apps/portal/registry/openapi/portal-api.openapi.json \
  apps/portal/registry/fixtures/registry.public.json \
  apps/portal/registry/fixtures/summary.healthy.json \
  apps/portal/registry/fixtures/summary.empty.json \
  apps/portal/registry/fixtures/summary.partial.json \
  apps/portal/registry/fixtures/summary.stale.json \
  apps/portal/registry/fixtures/summary.denied.json \
  apps/portal/registry/fixtures/summary.unavailable.json \
  apps/portal/scripts/export_handoff_contract.py \
  apps/portal/scripts/export_compat_snapshots.py \
  apps/portal/registry/schemas/portal-registry-source.v1.schema.json \
  apps/portal/registry/schemas/portal-registry.v1.schema.json \
  apps/portal/registry/schemas/portal-summary.v1.schema.json \
  apps/portal/registry/schemas/portal-links.v1.schema.json \
  apps/portal/strategy/PROTECTED_SHA256 \
  upgrade/backend/BAR_02_COMPATIBILITY_BOUNDARIES_AND_PARITY_FREEZE.md \
  upgrade/backend/BAR_03_OPERATIONAL_INGRESS_BOUNDARY.md \
  deploy/nginx/portal.conf \
  apps/control-api/package.json \
  apps/control-api/package-lock.json \
  apps/control-api/tsconfig.json \
  apps/control-api/vitest.config.ts \
  apps/control-api/migrations/1723680000000_init-identity.sql \
  apps/control-api/migrations/1723680000001_control-facade.sql \
  apps/control-api/src/id.ts \
  apps/control-api/src/repos/workspaces.ts \
  apps/control-api/src/repos/runs.ts \
  apps/control-api/src/repos/outbox.ts \
  apps/control-api/src/facade/proxy.service.ts \
  apps/control-api/src/facade/facade.controller.ts \
  apps/control-api/src/facade/session.guard.ts \
  apps/control-api/test/facade.spec.ts \
  upgrade/backend/BAR_07_CONTROL_API_FACADE.md \
  apps/control-api/src/main.ts \
  apps/control-api/src/app.ts \
  apps/control-api/src/app.module.ts \
  apps/control-api/src/config.ts \
  apps/control-api/src/domain.ts \
  apps/control-api/src/tokens.ts \
  apps/control-api/src/http-error.filter.ts \
  apps/control-api/src/auth/auth.service.ts \
  apps/control-api/src/auth/auth.controller.ts \
  apps/control-api/src/auth/argon.ts \
  apps/control-api/src/auth/policy.ts \
  apps/control-api/src/auth/cloudflare.ts \
  apps/control-api/src/auth/principal.ts \
  apps/control-api/src/auth/cookies.ts \
  apps/control-api/src/admin/admin.service.ts \
  apps/control-api/src/admin/admin.controller.ts \
  apps/control-api/src/admin/rbac.guard.ts \
  apps/control-api/src/repos/users.ts \
  apps/control-api/src/repos/bindings.ts \
  apps/control-api/src/repos/credentials.ts \
  apps/control-api/src/repos/sessions.ts \
  apps/control-api/src/repos/audit.ts \
  apps/control-api/src/db/pool.ts \
  apps/control-api/src/health/health.controller.ts \
  apps/control-api/src/cli/bootstrap.ts \
  apps/control-api/test/harness.ts \
  apps/control-api/test/repos.spec.ts \
  apps/control-api/test/auth.spec.ts \
  apps/control-api/test/matrix.spec.ts \
  deploy/images/control-api.Dockerfile \
  scripts/control-api-test.sh \
  upgrade/backend/BAR_04_THIN_IDENTITY_BFF.md \
  upgrade/backend/adr/ADR-003-POSTGRES_MIGRATION_AND_QUERY_APPROACH.md \
  upgrade/backend/bar02/snapshots/portal-api.openapi.json \
  upgrade/backend/bar02/snapshots/planning-api.openapi.json \
  upgrade/backend/bar02/snapshots/run-request.schema.json \
  upgrade/backend/bar02/snapshots/manifest.json \
  features/roadmap-task-board/backend/requirements-dev.txt \
  features/roadmap-task-board/backend/tests/test_summary_contract.py \
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
  "${ROOT_DIR}/apps/portal/registry/links.v1.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-registry-source.v1.schema.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-registry.v1.schema.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-summary.v1.schema.json" \
  "${ROOT_DIR}/apps/portal/registry/schemas/portal-links.v1.schema.json" \
  "${ROOT_DIR}/upgrade/backend/bar02/snapshots/planning-api.openapi.json" \
  "${ROOT_DIR}/upgrade/backend/bar02/snapshots/run-request.schema.json" \
  "${ROOT_DIR}/upgrade/backend/bar02/snapshots/manifest.json"; do
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
  "${ROOT_DIR}/scripts/verify-m0-golden.sh" \
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
