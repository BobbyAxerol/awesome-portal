#!/usr/bin/env bash
# CI-equivalent contracts workspace tests (node:22 in Docker, no services).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="${ROOT_DIR}/packages/contracts"
NODE_IMAGE="node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32"
DEPS_DIR="$(mktemp -d)"
# Different worktrees/agents may verify concurrently. A fixed name collided
# and its unconditional cleanup could remove another invocation's container.
NODE_CONTAINER="contracts-test-node-${DEPS_DIR##*/}"
WORKSPACE_DIR="${DEPS_DIR}/workspace"
RUN_UID="${HOST_UID:-$(id -u)}"
RUN_GID="${HOST_GID:-$(id -g)}"
# A rootless daemon maps container UID 0 to its unprivileged host owner.  The
# runner service deliberately uses UMask=0077, so using its numeric host UID
# *inside* that user namespace maps to a subordinate UID which cannot read the
# ephemeral package metadata.  Use root only inside a confirmed rootless
# namespace; a rootful daemon keeps the original unprivileged host UID/GID.
CONTAINER_USER="${RUN_UID}:${RUN_GID}"
# This script may be invoked through passwordless sudo when Docker is not
# directly accessible.  Keep the temporary parent traversable by the mapped
# unprivileged Node UID; individual source files remain copied with their
# normal permissions and the container only receives the staged workspace.
chmod 755 "${DEPS_DIR}"
if [ "$(id -u)" -eq 0 ]; then
  chown "${RUN_UID}:${RUN_GID}" "${DEPS_DIR}"
fi

command -v docker >/dev/null 2>&1 || { printf 'Docker CLI is required.\n' >&2; exit 1; }
DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
  else
    printf 'Cannot access the Docker daemon directly or through passwordless sudo.\n' >&2
    exit 1
  fi
fi

if "${DOCKER[@]}" info --format '{{json .SecurityOptions}}' | grep -Fq 'name=rootless'; then
  CONTAINER_USER='0:0'
fi

cleanup() {
  local owner
  owner="$("${DOCKER[@]}" inspect -f '{{index .Config.Labels "io.primus.contract-test.owner"}}' \
    "${NODE_CONTAINER}" 2>/dev/null || true)"
  if [[ "$owner" == "$DEPS_DIR" ]]; then
    "${DOCKER[@]}" rm -f "${NODE_CONTAINER}" >/dev/null 2>&1 || true
  fi
  rm -rf -- "${DEPS_DIR}"
}
trap cleanup EXIT

# The egress-capable dependency step sees package metadata only. Contract and
# application source are mounted later, read-only, in a networkless container.
cp "${CONTRACTS_DIR}/package.json" "${CONTRACTS_DIR}/package-lock.json" "${DEPS_DIR}/"
"${DOCKER[@]}" run --rm --network bridge --read-only \
  -u "${CONTAINER_USER}" \
  -v "${DEPS_DIR}:/deps" \
  --tmpfs /tmp:rw,exec,mode=1777,size=256m \
  -w /deps -e HOME=/tmp -e npm_config_cache=/tmp/.npm \
  "${NODE_IMAGE}" npm ci --no-audit --no-fund

# Keep the host checkout immutable while avoiding nested mounts below a
# read-only /repo bind (unsupported by some containerd snapshotters). Only the
# contract workspace and the one canonical Portal OpenAPI input are copied.
mkdir -p \
  "${WORKSPACE_DIR}/packages/contracts" \
  "${WORKSPACE_DIR}/apps/portal/registry/openapi" \
  "${WORKSPACE_DIR}/apps/control-api/src/operations" \
  "${WORKSPACE_DIR}/apps/control-api/src/research" \
  "${WORKSPACE_DIR}/apps/portal/backend/src/portal_api/domain" \
  "${WORKSPACE_DIR}/upgrade/research_loop/evidence/P02" \
  "${WORKSPACE_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract"
cp -a \
  "${CONTRACTS_DIR}/README.md" \
  "${CONTRACTS_DIR}/contracts-snapshot.json" \
  "${CONTRACTS_DIR}/fixtures" \
  "${CONTRACTS_DIR}/generated" \
  "${CONTRACTS_DIR}/openapi" \
  "${CONTRACTS_DIR}/package.json" \
  "${CONTRACTS_DIR}/package-lock.json" \
  "${CONTRACTS_DIR}/schemas" \
  "${CONTRACTS_DIR}/test" \
  "${CONTRACTS_DIR}/tooling" \
  "${CONTRACTS_DIR}/vitest.config.ts" \
  "${WORKSPACE_DIR}/packages/contracts/"
cp -a \
  "${ROOT_DIR}/apps/portal/registry/openapi/portal-api.openapi.json" \
  "${WORKSPACE_DIR}/apps/portal/registry/openapi/"
cp -a \
  "${ROOT_DIR}/apps/control-api/src/operations/catalog.generated.ts" \
  "${WORKSPACE_DIR}/apps/control-api/src/operations/"
# Verify image-owned TS/Python views and every exact checked-in receipt
# reference (legacy/FULL02/FULL03/FULL04/FULL05). No private runtime inputs are staged.
cp -a "${ROOT_DIR}/apps/portal/registry/research-execution-recipes.v1.json" \
  "${ROOT_DIR}/apps/portal/registry/research-execution-recipes.v1.schema.json" \
  "${WORKSPACE_DIR}/apps/portal/registry/"
cp -a "${ROOT_DIR}/apps/control-api/src/research/execution-recipes.generated.ts" \
  "${WORKSPACE_DIR}/apps/control-api/src/research/"
cp -a "${ROOT_DIR}/apps/portal/backend/src/portal_api/domain/research_execution_recipes_generated.py" \
  "${WORKSPACE_DIR}/apps/portal/backend/src/portal_api/domain/"
for receipt in \
  P04/phase-report.md \
  P23/P23_QUALIFICATION_CLOSEOUT_2026-10-05.md \
  P10/B7_B8_TEMPORAL_EXECUTOR_2026-10-02.md \
  P10/B8_CAUSAL_INNER_CURRENT_SOURCE_2026-10-02.md \
  P10/B8_VN_FIXED_PRODUCT_VERTICAL_2026-10-02.md \
  P10/E17_IMPORTED_DRAFT_EXECUTION_BACKEND_RECEIPT_2026-09-27.md \
  P10/FULL_02_PRODUCT_QUALIFICATION_2026-10-06.md \
  P10/FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md \
  P10/FULL_04_PRODUCT_QUALIFICATION_2026-10-06.md \
  P10/FULL_05_PRODUCT_QUALIFICATION_2026-10-06.md; do
  mkdir -p "${WORKSPACE_DIR}/upgrade/research_loop/evidence/${receipt%/*}"
  cp -a "${ROOT_DIR}/upgrade/research_loop/evidence/${receipt}" \
    "${WORKSPACE_DIR}/upgrade/research_loop/evidence/${receipt}"
done
cp -a \
  "${ROOT_DIR}/upgrade/research_loop/evidence/P02/requested-spec.v1.schema.json" \
  "${WORKSPACE_DIR}/upgrade/research_loop/evidence/P02/"
cp -a \
  "${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract/cli-command-map.json" \
  "${WORKSPACE_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract/"
cp -a \
  "${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/openapi.sanitized.json" \
  "${WORKSPACE_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/"
mv "${DEPS_DIR}/node_modules" "${WORKSPACE_DIR}/node_modules"
ln -s ../../node_modules "${WORKSPACE_DIR}/packages/contracts/node_modules"

"${DOCKER[@]}" run --rm --name "${NODE_CONTAINER}" --network none --read-only \
  --label "io.primus.contract-test.owner=${DEPS_DIR}" \
  -u "${CONTAINER_USER}" \
  -v "${WORKSPACE_DIR}:/repo" \
  --tmpfs /tmp:rw,exec,mode=1777,size=256m \
  -w /repo/packages/contracts \
  -e HOME=/tmp \
  "${NODE_IMAGE}" sh -c '
    set -e
    ./tooling/verify-generated.sh
  '
printf 'Contracts workspace tests passed.\n'
