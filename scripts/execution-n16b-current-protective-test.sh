#!/usr/bin/env bash
# N16B source-as-is protective-path compatibility and fail-closed runtime gate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-protective-path.current-emergency-close.accepted.json" \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-command-catalog.valid.json" \
  "${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/README.md" \
  "${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/evidence/phaseF/runtime_identity.txt" \
  "${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/openapi.sanitized.json" \
  "${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract/request-contracts.json" \
  "${ROOT_DIR}/upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/extract/response-shapes.json" \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-intercell-gateway.current-paper.accepted.json" \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-emergency-routing.source-dark.valid.json" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/crates/command-relay/src/current_primitive.rs" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/crates/edge-service/src/main.rs" \
  "${ROOT_DIR}/apps/control-api/src/operations/current-protective.acceptance.ts" \
  "${ROOT_DIR}/apps/control-api/src/operations/operations.service.ts" <<'PY'
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

(
    acceptance_path,
    catalog_path,
    source_readme_path,
    runtime_identity_path,
    openapi_path,
    request_contracts_path,
    response_shapes_path,
    n15b_path,
    n16a_path,
    rust_authority_path,
    rust_edge_path,
    typescript_acceptance_path,
    typescript_service_path,
) = map(Path, sys.argv[1:])


def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise SystemExit(f"duplicate JSON key rejected: {key}")
        value[key] = item
    return value


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=reject_duplicates)


def digest(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


def find_routes(value: Any, output: set[tuple[str, str]]) -> None:
    if isinstance(value, dict):
        method, path = value.get("method"), value.get("path")
        if isinstance(method, str) and isinstance(path, str):
            output.add((method.upper(), path))
        for item in value.values():
            find_routes(item, output)
    elif isinstance(value, list):
        for item in value:
            find_routes(item, output)


acceptance = load(acceptance_path)
catalog = load(catalog_path)
openapi = load(openapi_path)
request_contracts = load(request_contracts_path)
response_shapes = load(response_shapes_path)
source_readme = source_readme_path.read_text(encoding="utf-8")
runtime_identity = runtime_identity_path.read_text(encoding="utf-8")
rust_authority = rust_authority_path.read_text(encoding="utf-8")
rust_edge = rust_edge_path.read_text(encoding="utf-8")
typescript_acceptance = typescript_acceptance_path.read_text(encoding="utf-8")
typescript_service = typescript_service_path.read_text(encoding="utf-8")

expected_bindings = {
    "command_catalog_sha256": digest(catalog_path),
    "openapi_sha256": digest(openapi_path),
    "request_contracts_sha256": digest(request_contracts_path),
    "response_shapes_sha256": digest(response_shapes_path),
    "n15b_acceptance_sha256": digest(n15b_path),
    "n16a_profile_sha256": digest(n16a_path),
}
if acceptance.get("immutable_bindings") != expected_bindings:
    raise SystemExit("N16B immutable source evidence binding drifted")

source = acceptance.get("source", {})
if source.get("source_commit") not in source_readme:
    raise SystemExit("N16B source commit is not evidenced by the sanitized pack")
if source.get("gateway_digest") not in runtime_identity:
    raise SystemExit("N16B gateway digest is not evidenced by runtime identity")

required_routes = {
    ("GET", "/v1/admin/ops/emergency-close/plan"),
    ("POST", "/v1/admin/ops/emergency-close"),
    ("GET", "/v1/admin/ops/emergency-close/{operation_id}"),
    ("POST", "/v1/admin/ops/emergency-close/{operation_id}/verify"),
}
openapi_routes = {
    (method.upper(), path)
    for path, methods in openapi.get("paths", {}).items()
    for method in methods
}
extracted_routes: set[tuple[str, str]] = set()
find_routes(request_contracts, extracted_routes)
find_routes(response_shapes, extracted_routes)
if not required_routes.issubset(openapi_routes | extracted_routes):
    raise SystemExit("N16B emergency-close source route chain is incomplete")

mapping = acceptance.get("accepted_mapping", {})
expected_mapping = {
    "capability_id": "live.emergency-close",
    "catalog_key": "ops/emergency-close",
    "environment": "LIVE_FULL",
    "target_types": ["ACCOUNT"],
    "mode": "live",
    "venue": "BINANCE",
    "product": "USD_M",
    "source_idempotent": False,
    "portal_idempotency_required": True,
    "automatic_retry_after_dispatch": False,
    "requires_webauthn": True,
    "distinct_approver_count": 2,
}
for key, expected in expected_mapping.items():
    if mapping.get(key) != expected:
        raise SystemExit(f"N16B accepted mapping widened or drifted: {key}")

classifications = acceptance.get("capability_classification", [])
expected_ids = [
    "paper.halt", "paper.cancel-open-orders", "sandbox.halt",
    "sandbox.cancel-open-orders", "live.halt", "live.reduce",
    "live.emergency-close", "live.resume", "live.scale",
]
if [item.get("capability_id") for item in classifications] != expected_ids:
    raise SystemExit("N16B capability classification is incomplete or reordered")
accepted = [item for item in classifications if item.get("state") == "ACCEPTED_CURRENT_PRIMITIVE"]
if len(accepted) != 1 or accepted[0].get("capability_id") != "live.emergency-close":
    raise SystemExit("N16B must accept exactly one current protective primitive")
if classifications[7].get("state") == "ACCEPTED_CURRENT_PRIMITIVE" or classifications[8].get("state") == "ACCEPTED_CURRENT_PRIMITIVE":
    raise SystemExit("N16B allowed an R4 command to inherit the protective path")

runtime = acceptance.get("runtime_authority", {})
if runtime.get("compatibility_contract_accepted") is not True:
    raise SystemExit("N16B compatibility contract is not accepted")
for key in (
    "command_transport_enabled", "source_call_authorized", "public_route_enabled",
    "live_mutation_authorized", "trading_system_changed", "runtime_probe_executed",
):
    if runtime.get(key) is not False:
        raise SystemExit(f"N16B widened runtime authority: {key}")

catalog_entry = next((item for item in catalog.get("entries", []) if item.get("key") == "ops/emergency-close"), None)
if not catalog_entry or catalog_entry.get("plan_required") is not True or catalog_entry.get("verify_required") is not True:
    raise SystemExit("N16B canonical command catalogue lost plan/verify policy")

for token in (
    "CurrentProtectiveAcceptance", "authorize_transport", "CommandIdentityRequired",
    "ScopeNotAccepted", "RuntimeInactive", "automatic_retry_after_dispatch",
):
    if token not in rust_authority:
        raise SystemExit(f"N16B Rust authority lost {token}")
for token in (
    "CurrentProtectiveAcceptance::canonical", "EDGE_COMMAND_RELAY_ENABLED",
):
    if token not in rust_edge:
        raise SystemExit(f"N16B Edge startup/runtime gate lost {token}")
for token in (
    "classifyN16bProtectivePlan", "N16B_TARGET_SCOPE_UNSUPPORTED",
    "N16B_CURRENT_PRIMITIVE_PLAN_INVALID", "N16B_RUNTIME_ACTIVATION_PENDING",
    "runtimeActive: false", "automaticRetryAfterDispatch: false",
):
    if token not in typescript_acceptance:
        raise SystemExit(f"N16B TypeScript acceptance lost {token}")
for token in ("classifyN16bProtectivePlan(input)", "source_side_effect_requested: false"):
    if token not in typescript_service:
        raise SystemExit(f"N16B TypeScript plan gate lost {token}")

serialized = json.dumps(acceptance, sort_keys=True).lower()
for forbidden in (
    "-----begin", "authorization: bearer", "private_key", "client_secret",
    "api_key", "password", "postgres://", "redis://", "x-admin-token",
):
    if forbidden in serialized:
        raise SystemExit(f"N16B fixture contains secret-shaped material: {forbidden}")

print(json.dumps({
    "decision": "N16B_CURRENT_PRIMITIVE_COMPATIBILITY_ACCEPTED",
    "accepted_capability": "live.emergency-close",
    "accepted_environment": "LIVE_FULL",
    "accepted_target": "ACCOUNT",
    "classified_capabilities": len(classifications),
    "product_runtime_active": False,
    "source_mutations": 0,
}, separators=(",", ":"), sort_keys=True))
PY

printf 'N16B current protective-path compatibility gate passed; command runtime and source remain unchanged.\n'
