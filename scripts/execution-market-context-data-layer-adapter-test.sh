#!/usr/bin/env bash
# Static safety gate for the Portal-owned current-source Market Context adapter.
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template="${root_dir}/deploy/execution-d1/source-proxy/manager-market-context-data-layer-locations.conf.template"
contract="${root_dir}/services/portal-execution-edge-rs/contracts/portal-market-context-data-layer-adapter-v1/market-context-data-layer-adapter.v1.json"

python3 -m json.tool "${contract}" >/dev/null
python3 - "${template}" "${contract}" <<'PY'
import json
import pathlib
import sys

template = pathlib.Path(sys.argv[1]).read_text()
contract = json.loads(pathlib.Path(sys.argv[2]).read_text())

assert contract["schema_version"] == "portal.execution.market-context-data-layer-adapter.v1"
assert contract["adapter_revision"] == "portal.execution.market-context-data-layer.v1"
assert contract["authority_boundary"]["browser_direct_data_layer"] is False
assert contract["authority_boundary"]["portal_direct_data_layer"] is False
assert contract["authority_boundary"]["direct_trading_system_database"] is False
assert contract["authority_boundary"]["source_commands"] is False
assert [op["operation_id"] for op in contract["fixed_operations"]] == [
    "managerMarketContextLatestV1", "managerMarketContextCandlesV1"
]
for route in (
    "location = /portal/execution/v2/manager/market/latest",
    "location = /portal/execution/v2/manager/market/candles",
    "auth_request /_manager_v2_issue;",
    'X-Portal-Source-Adapter "portal.execution.market-context-data-layer.v1"',
    "/v1/binance/price-last/$arg_instrument?market=usdm",
    "/v1/binance/futures/klines/$arg_instrument?interval=$arg_interval&limit=$arg_point_limit&start_time=$arg_from_ms&end_time=$arg_to_ms",
):
    assert route in template, route
for forbidden in ("location /v1/", "proxy_pass $", "include /run/secrets/trading-system-read-header.conf"):
    assert forbidden not in template.lower(), forbidden
assert template.count("location = /portal/execution/v2/manager/market/") == 2
PY

bash -n "${root_dir}/scripts/execution-d2-render-source-proxy.sh"
bash -n "${root_dir}/scripts/execution-d2-preflight.sh"
bash -n "${root_dir}/scripts/execution-profile-runtime-prepare.sh"
printf '%s\n' 'Portal Market Context Data Layer adapter static contract passed.'
