#!/usr/bin/env sh
# Runs canonical fixture and generated-type checks after dependencies exist.
set -eu

./node_modules/.bin/vitest run --no-cache
node tooling/generate-execution-command-catalog.mjs --check

generate_and_compare() {
  source_file="$1"
  target_file="$2"
  temporary="/tmp/$(basename "${target_file}")"
  ./node_modules/.bin/openapi-typescript "${source_file}" -o "${temporary}"
  diff -q "${temporary}" "${target_file}"
}

generate_and_compare /repo/apps/portal/registry/openapi/portal-api.openapi.json generated/portal-api.d.ts
generate_and_compare openapi/execution-analytics.openapi.json generated/execution-analytics.d.ts
generate_and_compare openapi/execution-analytics-series.openapi.json generated/execution-analytics-series.d.ts
generate_and_compare openapi/execution-governance.openapi.json generated/execution-governance.d.ts
generate_and_compare openapi/execution-realtime.openapi.json generated/execution-realtime.d.ts
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
