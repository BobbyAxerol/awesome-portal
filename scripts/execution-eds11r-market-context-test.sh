#!/usr/bin/env bash
# EDS-11R4 single-owner-campaign Market Context adapter request gate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACT_DIR="${ROOT_DIR}/services/portal-execution-edge-rs/contracts/eds11r-market-context-v1-request"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "${TMP_DIR}"' EXIT

for file in \
  market-context-owner-request.v1.json \
  market-context-owner-return.v1.schema.json \
  market-context-wire-contract.v1.json \
  market-context-capability.v1.schema.json \
  owner-return.pending.example.json \
  fixtures/expected-coverage.v1.json \
  schemas/market-latest-envelope.v1.schema.json \
  schemas/market-candles-envelope.v1.schema.json; do
  python3 -m json.tool "${CONTRACT_DIR}/${file}" >/dev/null
done

(cd "${CONTRACT_DIR}" && sha256sum --quiet -c MANIFEST.sha256)

python3 - "${ROOT_DIR}" <<'PY'
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
contract = root / "services/portal-execution-edge-rs/contracts/eds11r-market-context-v1-request"
request = json.loads((contract / "market-context-owner-request.v1.json").read_text())
pending = json.loads((contract / "owner-return.pending.example.json").read_text())
schema = json.loads((contract / "market-context-owner-return.v1.schema.json").read_text())
wire = json.loads((contract / "market-context-wire-contract.v1.json").read_text())
capability_schema = json.loads((contract / "market-context-capability.v1.schema.json").read_text())
latest_schema = json.loads((contract / "schemas/market-latest-envelope.v1.schema.json").read_text())
candles_schema = json.loads((contract / "schemas/market-candles-envelope.v1.schema.json").read_text())
coverage = json.loads((contract / "fixtures/expected-coverage.v1.json").read_text())
master = (root / "upgrade/backend/TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md").read_text()

ids = ["market.latest.v1", "market.candles.v1", "venue.calendar.v1", "market.benchmark.v1", "market.vnm-constraints.v1"]
assert request["schema_version"] == "portal.execution.eds11r.market-context-owner-request.v1"
assert request["request_revision"] == "portal.execution.eds11r.market-context-owner-request.v1"
assert request["phase"] == "EDS-11R4"
assert request["status"] == "OWNER_ADAPTER_IMPLEMENTATION_PENDING"
assert request["source_as_is"] is True
assert request["wire_contract"] == "market-context-wire-contract.v1.json"
assert request["return_capability_schema"] == "market-context-capability.v1.schema.json"
assert request["reuse"]["no_new_market_database"] is True
assert request["reuse"]["no_history_reingestion"] is True
assert request["common_contract"] == {
    "transport": "TLS_1_3_MTLS",
    "delegated_scope": "execution:manager-v2:read",
    "identity_binding": "EXACT_CAPABILITY_AUDIENCE_ENVIRONMENT_PROFILE",
    "version_header": "X-Trading-Contract-Revision",
    "browser_direct_access": False,
    "portal_direct_data_layer_or_redis_access": False,
    "source_command_authority": False,
    "automatic_retry": False,
    "portal_activation_on_publication": False,
    "runtime_change_authorized": False,
}
assert [row["capability_id"] for row in request["operations"]] == ids
assert [row["delivery"] for row in request["operations"]] == [
    "REQUIRED_IMMEDIATE", "REQUIRED_IMMEDIATE", "PUBLISH_IF_EXACT_SOURCE_SEMANTICS_EXIST",
    "PUBLISH_IF_EXACT_SOURCE_SEMANTICS_EXIST", "PUBLISH_IF_EXACT_SOURCE_SEMANTICS_EXIST",
]
assert request["operations"][0]["bounds"] == {"maximum_instruments": 200, "maximum_response_bytes": 1048576}
assert request["operations"][1]["bounds"] == {"maximum_raw_bars": 2000, "maximum_response_bytes": 8388608, "portal_visual_points_per_page": 200}
assert all(value is False for key, value in request["authority"].items() if key != "unpublished_capability_remains_typed_pending")
assert request["authority"]["unpublished_capability_remains_typed_pending"] is True

assert pending["owner_accepted"] is False and pending["portal_activation"] is False
assert [row["capability_id"] for row in pending["capabilities"]] == ids
for row in pending["capabilities"]:
    assert row["state"] == "TYPED_UNAVAILABLE"
    assert row["operation_id"] is None
    assert row["contract_revision"] is None
    assert row["schema_sha256"] is None
    assert row["fixture_index_sha256"] is None
    assert row["acceptance_sha256"] is None
    assert row["profiles"] == ["PAPER", "SANDBOX", "LIVE"]
assert all(value is False for value in pending["authority"].values())

assert schema["$id"].endswith("eds11r-market-context-owner-return.v1.schema.json")
assert schema["properties"]["portal_activation"] == {"const": False}
entry = schema["properties"]["capabilities"]["items"]
assert entry["properties"]["capability_id"]["enum"] == ids
assert entry["properties"]["state"]["enum"] == ["PUBLISHED", "TYPED_UNAVAILABLE"]
assert wire["schema_version"] == "portal.execution.eds11r.market-context-wire-contract.v1"
assert wire["contract_revision"] == "trading-system.portal-execution.market-context.v1"
assert wire["transport"] == {
    "portal_to_edge": "TLS_1_3_MTLS_AND_SHORT_LIVED_DELEGATED_JWT",
    "delegated_resource": "execution:manager-v2:read",
    "browser_direct_access": False,
    "portal_direct_data_layer_or_redis_access": False,
    "source_commands": False,
    "automatic_retry": False,
}
assert [(row["capability_id"], row["method"], row["edge_path"], row["manager_path"])
        for row in wire["operations"]] == [
    ("market.latest.v1", "GET", "/internal/v2/manager/market/latest", "/portal/execution/v2/manager/market/latest"),
    ("market.candles.v1", "GET", "/internal/v2/manager/market/candles", "/portal/execution/v2/manager/market/candles"),
]
assert wire["operations"][0]["query_parameters"] == ["venue", "instrument"]
assert wire["operations"][1]["query_parameters"] == ["venue", "instrument", "interval", "from_ms", "to_ms", "point_limit"]
assert all(value is True for value in wire["owner_rules"].values() if value is True)
assert capability_schema["$id"].endswith("eds11r-market-context-capability.v1.schema.json")
assert capability_schema["properties"]["contract_revision"] == {"const": "trading-system.portal-execution.market-context.v1"}
assert latest_schema["$id"].endswith("market-latest-envelope.v1.schema.json")
assert candles_schema["$id"].endswith("market-candles-envelope.v1.schema.json")
assert latest_schema["properties"]["data"]["properties"]["operation_id"] == {"const": "managerMarketContextLatestV1"}
assert candles_schema["properties"]["data"]["properties"]["operation_id"] == {"const": "managerMarketContextCandlesV1"}
assert latest_schema["properties"]["data"]["properties"]["items"]["maxItems"] == 200
assert candles_schema["properties"]["data"]["properties"]["items"]["maxItems"] == 2000
assert coverage["synthetic_no_business_data"] is True
assert coverage["browser_authority"] == "NAMED_SAME_ORIGIN_BFF_ONLY"
assert [row["capability_id"] for row in coverage["expected_capabilities"]] == ids
assert coverage["bounds"] == {
    "latest_maximum_instruments": 200,
    "candles_maximum_raw_bars": 2000,
    "candles_maximum_response_bytes": 8388608,
    "portal_visual_points_per_page": 200,
}

for token in (
    "## 2A. EDS-11R4", "market-context-owner-request.v1.json",
    "Exact private Manager/Edge route contract", "market-context-wire-contract.v1.json",
    "same** v3 owner return", "no direct Data Layer/Redis/browser route",
):
    assert token in master, token

serialized = json.dumps({"request": request, "pending": pending, "coverage": coverage}, sort_keys=True).lower()
for forbidden in ("-----begin", "authorization: bearer", "client_secret", "private_key", "postgres://", "redis://", "api_key"):
    assert forbidden not in serialized
assert not re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", serialized)
PY

# The owner receives one campaign directory.  Exercise the builder rather
# than merely verifying the annex in place: nested fixture directories must
# survive the copy and both source and copied manifests must still validate.
PACKET_DIR="${TMP_DIR}/owner-campaign"
"${ROOT_DIR}/scripts/build-trading-system-owner-campaign-pack.sh" "${PACKET_DIR}" >/dev/null
test -f "${PACKET_DIR}/contracts/eds11r-market-context-v1-request/fixtures/expected-coverage.v1.json"
test -f "${PACKET_DIR}/contracts/eds11r-market-context-v1-request/schemas/market-latest-envelope.v1.schema.json"
(cd "${PACKET_DIR}/contracts/eds11r-market-context-v1-request" && sha256sum --quiet -c MANIFEST.sha256)
(cd "${PACKET_DIR}" && sha256sum --quiet -c INPUT_MANIFEST.sha256)

bash -n "${ROOT_DIR}/scripts/execution-eds11r-market-context-test.sh"
printf '%s\n' 'EDS-11R4 Market Context source-as-is adapter request, pending return and authority gates passed.'
