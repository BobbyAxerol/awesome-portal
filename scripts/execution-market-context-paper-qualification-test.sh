#!/usr/bin/env bash
# Static gate for the one-shot BE-R2-4 Paper qualification runner and its
# committed, sanitized rejection record. This never contacts an Edge, Data
# Layer, database, broker, CLI or browser endpoint.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="${ROOT_DIR}/scripts/execution-market-context-paper-qualification.mjs"
RECORD="${ROOT_DIR}/deploy/manifests/execution-market-context-paper-qualification.v1.json"
ADAPTER="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/portal-market-context-data-layer-adapter-v1/market-context-data-layer-adapter.v1.json"

python3 -m json.tool "${RECORD}" >/dev/null
python3 - "${RUNNER}" "${RECORD}" "${ADAPTER}" <<'PY'
import json
import pathlib
import re
import sys

runner = pathlib.Path(sys.argv[1]).read_text()
record = json.loads(pathlib.Path(sys.argv[2]).read_text())
adapter = json.loads(pathlib.Path(sys.argv[3]).read_text())

assert record["schema_version"] == "portal.execution.market-context-paper-qualification.v1"
assert record["scope"] == "PAPER_GET_ONLY_FIXED_MARKET_CONTEXT"
assert record["decision"] == "SOURCE_DEPLOYMENT_CONTRACT_MISMATCH"
assert record["runtime_mutation"] is False
assert record["browser_direct_access"] is False
assert record["raw_market_payload_persisted"] is False
assert record["delegated_resource"] == "execution:manager-v2:read"
assert record["expected_adapter"]["adapter_revision"] == adapter["adapter_revision"]
assert record["expected_adapter"]["adapter_manifest_sha256"].startswith("sha256:")
assert record["expected_adapter"]["contract_revision"] == "trading-system.portal-execution.market-context.v1"
assert record["expected_adapter"]["profile"] == "PAPER_BINANCE_USDM"
assert record["observed_transport"] == {
    "tls_version": "TLSv1.3",
    "http_version": "h2",
    "mtls": True,
    "delegated_jwt_profile_binding": True,
}
assert record["observed_probe"] == {
    "operation_id": "managerMarketContextLatestV1",
    "http_status": 502,
    "typed_code": "MANAGER_V2_SOURCE_CONTRACT_REJECTED",
    "raw_response_persisted": False,
}
assert record["deployed_proxy_shape"] == {
    "route_family": "eds11r-r4-r5-manager-facade-extension",
    "market_route_upstream": "loopback_mtls_manager_facade",
    "expected_data_layer_adapter_upstream": "loopback_data_layer_only",
    "match": False,
}
assert record["portal_status"] == "PAPER_TYPED_UNAVAILABLE_PENDING_REQUALIFICATION"
assert len(record["required_owner_resolution"]["required_positive_evidence"]) == 4
assert record["required_owner_resolution"]["forbidden_workarounds"] == [
    "Portal direct Data Layer or Trading System database access",
    "cross-profile fallback",
    "runtime feature activation before Paper evidence",
]

# The runner is deliberately a one-shot private server-side proof. It mints a
# short-lived read JWT in memory, is fixed to Paper, and retains only a
# sanitized digest/summary. It has no endpoint for browser, DB, broker, CLI,
# source write, retries or persistent raw payloads.
for required in (
    'const RESOURCE = "execution:manager-v2:read";',
    'const PROFILE = "PAPER_BINANCE_USDM";',
    'const ENVIRONMENT = "paper";',
    'const LATEST_PATH = "/internal/v2/manager/market/latest?venue=BINANCE&instrument=BTCUSDT";',
    'ALPNProtocols: ["h2"]',
    'minVersion: "TLSv1.3"',
    'maxVersion: "TLSv1.3"',
    'raw_market_payload_persisted: false',
    'runtime_mutation: false',
    'browser_direct_access: false',
):
    assert required in runner, required

for fixed_path in (
    "/internal/v2/manager/market/latest?venue=BINANCE&instrument=BTCUSDT",
    "/internal/v2/manager/market/candles?venue=BINANCE&instrument=BTCUSDT&interval=1m",
):
    assert fixed_path in runner, fixed_path

assert "const [latest, candles, invalidInterval, profileMismatch] = await Promise.all([" not in runner
assert "http2.connect" not in runner  # use the pinned node:http2 import only
for forbidden in (
    "fetch(", "axios", "postgres", "redis", "broker", "child_process",
    "exec(", "spawn(", "PUT", "POST", "PATCH", "DELETE", "retry",
    "writeFile", "appendFile", "mkdir", "/v1/binance/", "source_proxy",
):
    assert forbidden.lower() not in runner.lower(), forbidden

serialized = json.dumps(record, sort_keys=True).lower()
for forbidden in (
    "private_key", "client_secret", "authorization", "bearer ", "postgres://",
    "redis://", "api_key", "-----begin", "dsn",
):
    assert forbidden not in serialized, forbidden
assert not re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", serialized)
PY

DOCKER=(docker)
if ! "${DOCKER[@]}" info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER=(sudo -n docker)
  else
    printf '%s\n' 'Cannot access Docker for Node syntax verification.' >&2
    exit 1
  fi
fi

# Parse-only in a sealed disposable container. No dependencies or source
# secrets are mounted, so this cannot become a hidden transport probe.
"${DOCKER[@]}" run --rm --network none --read-only \
  -v "${RUNNER}:/runner.mjs:ro" \
  --tmpfs /tmp:rw,exec,mode=1777,size=8m \
  node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 \
  node --check /runner.mjs >/dev/null

bash -n "${ROOT_DIR}/scripts/execution-market-context-paper-qualification-test.sh"
printf '%s\n' 'BE-R2-4 Paper qualification runner and sanitized rejection record passed.'
