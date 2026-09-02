#!/usr/bin/env bash
# Phase 2 complete Screen BFF and controlled command-plane acceptance gate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for contract in \
  execution-canary-control-room.v1.schema.json \
  execution-command-center-snapshot.v1.schema.json \
  execution-command-tasks.v1.schema.json \
  execution-live-full-operations.v1.schema.json \
  execution-profile-read.v1.schema.json \
  governance-live-review.v1.schema.json; do
  python3 -m json.tool "${ROOT_DIR}/packages/contracts/schemas/${contract}" >/dev/null
done

python3 - "${ROOT_DIR}" <<'PY'
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
catalogue = (root / "apps/control-api/src/screen-bff/catalogue.ts").read_text()
operations = (root / "apps/control-api/src/operations/operations.service.ts").read_text()
tasks = (root / "apps/control-api/src/operations/operator-tasks.ts").read_text()
adapter = (root / "apps/control-api/src/execution/profile-read-adapter.service.ts").read_text()
analytics = (root / "apps/control-api/src/execution/local-query-analytics.service.ts").read_text()
production = (root / "deploy/compose.production.yaml").read_text()
local = (root / "deploy/compose.execution-local-projection.yaml").read_text()

assert catalogue.count("screen({") == 23
assert catalogue.count('status: "AVAILABLE"') == 23
assert catalogue.count('status: "TYPED_UNAVAILABLE"') == 0
for operation in (
    "executionCommandCenterSnapshot",
    "executionAccountBroker360V1",
    "executionPaperWorkbenchV1",
    "executionFullBlotterV1",
    "executionSandboxCertification",
    "executionCanaryControlRoom",
    "executionLiveFullOperations",
    "executionAlphaQueryAnalyticsV1",
    "executionPortfolioQueryAnalyticsV1",
    "executionGateLiveReviewV1",
    "executionOperatorTaskCatalogue",
):
    assert operation in catalogue, operation

assert re.search(
    r'const LOCAL_R0_ADAPTER = Object\.freeze\(\{.*?inspect: "admin\.inspect".*?'
    r'capital: "admin\.performance".*?performance: "admin\.performance".*?'
    r'"broker-read": "admin\.broker-read"',
    tasks,
    re.S,
)
assert 'relay_state: localR0Enabled ? "LOCAL_R0_ONLY" : "DISABLED"' in tasks
assert 'source_request_sent: false' in operations
assert 'transport: "SGP_LOCAL_PROJECTION"' in operations
assert "matchesFilters(row.fields, filters)" in adapter
assert "selected.slice(0, limit)" in adapter
assert "facts: sourceFacts" in analytics
assert "Object.values(sourceFacts).flat()" in analytics

for proxy in (
    root / "apps/control-api/src/execution/current-source.proxy.ts",
    root / "apps/control-api/src/execution/realtime.proxy.ts",
    root / "apps/control-api/src/execution/analytics.proxy.ts",
):
    proxy_text = proxy.read_text()
    assert 'from "node:net"' in proxy_text
    assert "servername: origin.hostname" not in proxy_text
    assert "servername: profile.origin.hostname" not in proxy_text

assert 'FEATURE_EXECUTION_LOCAL_R0_TASKS: "false"' in production
assert 'FEATURE_EXECUTION_COMMAND_RELAY: "false"' in production
assert "CONTROL_API_FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT:-false" in local
assert "CONTROL_API_FEATURE_EXECUTION_LOCAL_R0_TASKS:-false" in local

for path, marker in (
    ("apps/control-api/test/canary-control-room.spec.ts", "bounded local-profile facts"),
    ("apps/control-api/test/execution-operations.spec.ts", "bounded SGP projection"),
    ("apps/control-api/test/execution-analytics.spec.ts", "without cross-subject leakage"),
    ("apps/control-api/test/profile-screen-composer.spec.ts", "exact decimals"),
):
    assert marker in (root / path).read_text(), (path, marker)

secret_pattern = re.compile(
    r"(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|postgres(?:ql)?://[^\s]+:[^\s]+@|"
    r"authorization\s*:\s*bearer|x-api-key\s*:)",
    re.I,
)
for path in (
    root / "packages/contracts/fixtures/execution-command-tasks.valid.json",
    root / "packages/contracts/fixtures/execution-live-full-operations.unavailable.valid.json",
    root / "packages/contracts/fixtures/execution-canary-control-room.unavailable.valid.json",
):
    assert secret_pattern.search(path.read_text()) is None, path
PY

"${ROOT_DIR}/scripts/execution-n20-screen-bff-test.sh"
"${ROOT_DIR}/scripts/execution-n26-n27-test.sh"
"${ROOT_DIR}/scripts/contracts-test.sh"
"${ROOT_DIR}/scripts/control-api-test.sh"
"${ROOT_DIR}/scripts/execution-n29-product-acceptance-test.sh"

printf '%s\n' 'Phase 2 complete Screen BFF, local R0 and fail-closed mutation gates passed.'
