#!/usr/bin/env sh
# Runs canonical fixture and generated-type checks after dependencies exist.
set -eu

# This verifier is invoked from developer worktrees as well as the immutable
# release image, so it must not assume the image-only `/repo` mount exists.
contracts_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
repo_root=$(CDPATH= cd -- "$contracts_dir/../.." && pwd)
cd "$contracts_dir"

./node_modules/.bin/vitest run --no-cache
node tooling/generate-execution-command-catalog.mjs --check

generate_and_compare() {
  source_file="$1"
  target_file="$2"
  temporary="/tmp/$(basename "${target_file}")"
  ./node_modules/.bin/openapi-typescript "${source_file}" -o "${temporary}"
  diff -q "${temporary}" "${target_file}"
}

generate_and_compare "$repo_root/apps/portal/registry/openapi/portal-api.openapi.json" generated/portal-api.d.ts
generate_and_compare openapi/execution-analytics.openapi.json generated/execution-analytics.d.ts
generate_and_compare openapi/execution-query-analytics.openapi.json generated/execution-query-analytics.d.ts
generate_and_compare openapi/execution-analytics-series.openapi.json generated/execution-analytics-series.d.ts
generate_and_compare openapi/execution-governance.openapi.json generated/execution-governance.d.ts
generate_and_compare openapi/execution-realtime.openapi.json generated/execution-realtime.d.ts
generate_and_compare openapi/execution-profile-realtime.openapi.json generated/execution-profile-realtime.d.ts
generate_and_compare openapi/execution-command-center.openapi.json generated/execution-command-center.d.ts
generate_and_compare openapi/execution-operations.openapi.json generated/execution-operations.d.ts
generate_and_compare openapi/execution-canary.openapi.json generated/execution-canary.d.ts
generate_and_compare openapi/execution-live-full.openapi.json generated/execution-live-full.d.ts
generate_and_compare openapi/execution-staged-activation.openapi.json generated/execution-staged-activation.d.ts
generate_and_compare openapi/execution-intercell-gateway.openapi.json generated/execution-intercell-gateway.d.ts
generate_and_compare openapi/execution-emergency-routing.openapi.json generated/execution-emergency-routing.d.ts
generate_and_compare openapi/execution-production-readiness.openapi.json generated/execution-production-readiness.d.ts
generate_and_compare openapi/execution-screen-bff.openapi.json generated/execution-screen-bff.d.ts
generate_and_compare openapi/execution-paper-read.openapi.json generated/execution-paper-read.d.ts
generate_and_compare openapi/execution-profile-read.openapi.json generated/execution-profile-read.d.ts
generate_and_compare openapi/execution-manager-lists.openapi.json generated/execution-manager-lists.d.ts
generate_and_compare openapi/execution-contract-authority.openapi.json generated/execution-contract-authority.d.ts
generate_and_compare openapi/execution-market-context.openapi.json generated/execution-market-context.d.ts
generate_and_compare openapi/research-alpha-import.openapi.json generated/research-alpha-import.d.ts
generate_and_compare openapi/research-preflight.openapi.json generated/research-preflight.d.ts
node tooling/generate-research-dataset-index.mjs --check
generate_and_compare openapi/research-dataset-index.openapi.json generated/research-dataset-index.d.ts
node tooling/generate-research-run-setup.mjs --check
node tooling/generate-research-execution-recipes.mjs --check
generate_and_compare openapi/research-run-setup.openapi.json generated/research-run-setup.d.ts
generate_and_compare openapi/research-foundation.openapi.json generated/research-foundation.d.ts
generate_and_compare openapi/research-run-create.openapi.json generated/research-run-create.d.ts
generate_and_compare openapi/research-progress.openapi.json generated/research-progress.d.ts
node tooling/generate-research-engine-qualification.mjs --check
generate_and_compare openapi/research-run-library.openapi.json generated/research-run-library.d.ts
generate_and_compare openapi/research-evidence.openapi.json generated/research-evidence.d.ts
generate_and_compare openapi/research-split.openapi.json generated/research-split.d.ts
generate_and_compare openapi/research-search.openapi.json generated/research-search.d.ts
generate_and_compare openapi/research-freeze.openapi.json generated/research-freeze.d.ts
generate_and_compare openapi/research-replay.openapi.json generated/research-replay.d.ts
generate_and_compare openapi/research-current-source.openapi.json generated/research-current-source.d.ts
node tooling/generate-research-replay-continuity.mjs --check
generate_and_compare openapi/research-report.openapi.json generated/research-report.d.ts
generate_and_compare openapi/research-attempt-lineage.openapi.json generated/research-attempt-lineage.d.ts
generate_and_compare openapi/research-compare.openapi.json generated/research-compare.d.ts
generate_and_compare openapi/research-release-candidate.openapi.json generated/research-release-candidate.d.ts
node tooling/generate-research-final-audit.mjs --check
generate_and_compare openapi/research-final-audit.openapi.json generated/research-final-audit.d.ts
node tooling/generate-research-window-execution.mjs --check
generate_and_compare openapi/research-window-execution.openapi.json generated/research-window-execution.d.ts
