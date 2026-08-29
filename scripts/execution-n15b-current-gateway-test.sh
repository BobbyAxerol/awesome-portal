#!/usr/bin/env bash
# N15B current-capability inter-cell gateway contract and fail-closed static gate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-intercell-gateway.current-paper.accepted.json" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/current-source-v1/capability-source-map.json" \
  "${ROOT_DIR}/deploy/manifests/current-source-paper-release-profile.v1.json" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/owner-publication/manager-v2-private-paper-publication.json" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/owner-runtime-overlay/qualification-result.json" \
  "${ROOT_DIR}/upgrade/backend/EX_BE_02_LIVE_D3_TRANSPORT_ACCEPTANCE.md" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/crates/intercell-gateway/src/current_acceptance.rs" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/crates/edge-service/src/main.rs" \
  "${ROOT_DIR}/apps/control-api/src/execution/current-source.proxy.ts" <<'PY'
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

(
    acceptance_path,
    source_map_path,
    release_profile_path,
    publication_path,
    qualification_path,
    d3_report_path,
    rust_authority_path,
    rust_edge_path,
    typescript_bff_path,
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


acceptance = load(acceptance_path)
source_map = load(source_map_path)
release_profile = load(release_profile_path)
publication = load(publication_path)
qualification = load(qualification_path)
rust_authority = rust_authority_path.read_text(encoding="utf-8")
rust_edge = rust_edge_path.read_text(encoding="utf-8")
typescript_bff = typescript_bff_path.read_text(encoding="utf-8")

expected_bindings = {
    "n13b_current_source_map_sha256": digest(source_map_path),
    "n14b_release_profile_sha256": digest(release_profile_path),
    "manager_publication_sha256": digest(publication_path),
    "manager_qualification_sha256": digest(qualification_path),
    "d3_transport_report_sha256": digest(d3_report_path),
}
if acceptance.get("immutable_bindings") != expected_bindings:
    raise SystemExit("N15B immutable evidence binding drifted")

expected_profile = {
    "environment": "paper",
    "manager_profile_id": "PAPER_BINANCE_USDM",
    "audience": "portal-execution-edge-paper",
    "screen_id": "PAPER_TRADING_SCREEN",
}
if acceptance.get("profile") != expected_profile:
    raise SystemExit("N15B accepted profile/screen widened")
if release_profile.get("screen_ids") != ["PAPER_TRADING_SCREEN"]:
    raise SystemExit("N14B release profile no longer has one accepted screen")

interfaces = acceptance.get("interfaces", [])
if [item.get("interface") for item in interfaces] != ["QUERY", "COMMAND", "EVENT", "ARTIFACT"]:
    raise SystemExit("N15B lost independent four-interface classification")
expected_states = [
    "ACCEPTED_CURRENT_SOURCE",
    "DEFERRED_N16B",
    "SOURCE_DOES_NOT_CURRENTLY_EXIST",
    "SOURCE_DOES_NOT_CURRENTLY_EXIST",
]
if [item.get("state") for item in interfaces] != expected_states:
    raise SystemExit("N15B interface state drifted")
if interfaces[2].get("enabled") is not False or interfaces[3].get("enabled") is not False:
    raise SystemExit("N15B invented an Event or Artifact source")
if interfaces[2].get("snapshot_delta_label") != "PORTAL_PROJECTION_DELTA":
    raise SystemExit("N15B mislabeled a Portal delta as a Trading System event")

query = acceptance.get("query_boundary", {})
if query.get("capability_ids") != [
    "deployments.positions",
    "deployments.execution-quality",
    "sessions.current",
]:
    raise SystemExit("N15B Query capability slice widened")
if query.get("source_binding_ids") != [
    "manager.deployments",
    "manager.performance",
    "manager.positions",
    "manager.sessions",
]:
    raise SystemExit("N15B Query source slice widened")
for key, expected in {
    "delegated_resource": "execution:current-source:PAPER_TRADING_SCREEN:read",
    "delegated_scope": "execution.read",
    "jwt_maximum_ttl_seconds": 60,
    "maximum_page_rows": 200,
    "maximum_source_response_bytes": 1_048_576,
    "maximum_bff_response_bytes": 2_097_152,
    "retry_after_dispatch": 0,
    "redirects_allowed": False,
    "raw_browser_token_forwarding": False,
}.items():
    if query.get(key) != expected:
        raise SystemExit(f"N15B Query boundary drifted: {key}")

counts = {
    "CONNECTED": 0,
    "DERIVED_FROM_EXISTING_SOURCE": 0,
    "SUPPORTED_BUT_NOT_ACTIVATED": 0,
    "SOURCE_DOES_NOT_CURRENTLY_EXIST": 0,
}
for capability in source_map.get("capabilities", []):
    counts[capability["classification"]] += 1
if acceptance.get("capability_inventory") != {
    "total": 29,
    "connected": counts["CONNECTED"],
    "derived": counts["DERIVED_FROM_EXISTING_SOURCE"],
    "supported_not_activated": counts["SUPPORTED_BUT_NOT_ACTIVATED"],
    "absent": counts["SOURCE_DOES_NOT_CURRENTLY_EXIST"],
}:
    raise SystemExit("N15B capability inventory drifted")

if publication.get("status") != "PRIVATE_PAPER_ROUTE_QUALIFIED":
    raise SystemExit("N15B Manager publication evidence is not qualified")
if qualification.get("transport_and_identity", {}).get("invalid_jwt_denied") is not True:
    raise SystemExit("N15B identity negative evidence is missing")

runtime = acceptance.get("runtime_authority", {})
if runtime.get("private_query_contract_accepted") is not True:
    raise SystemExit("N15B Query acceptance missing")
for key in (
    "n15b_candidate_deployed",
    "product_bff_enabled",
    "registry_promoted",
    "sse_enabled",
    "command_enabled",
    "trading_system_changed",
):
    if runtime.get(key) is not False:
        raise SystemExit(f"N15B widened runtime authority: {key}")

for token in (
    "CurrentGatewayAcceptance",
    "authorize_query",
    "QueryScopeNotAccepted",
):
    if token not in rust_authority:
        raise SystemExit(f"N15B Rust authority lost {token}")
for token in (
    ".current_gateway_acceptance",
    "CURRENT_SOURCE_QUERY_NOT_ACCEPTED",
    "N15B_QUERY_CAPABILITY_NOT_ACCEPTED",
):
    if token not in rust_edge:
        raise SystemExit(f"N15B Rust Edge gate lost {token}")
for token in (
    "assertN15bCurrentQueryAccepted(environment, screenId)",
    "N15B_QUERY_CAPABILITY_NOT_ACCEPTED",
    "N15B_CURRENT_SOURCE_ACCEPTED",
    "retry_count: 0",
):
    if token not in typescript_bff:
        raise SystemExit(f"N15B TypeScript BFF gate lost {token}")

serialized = json.dumps(acceptance, sort_keys=True).lower()
for forbidden in (
    "-----begin",
    "authorization: bearer",
    "private_key",
    "client_secret",
    "api_key",
    "password",
    "postgres://",
    "redis://",
):
    if forbidden in serialized:
        raise SystemExit(f"N15B fixture contains secret-shaped material: {forbidden}")

print(json.dumps({
    "decision": "N15B_CURRENT_QUERY_ACCEPTED",
    "profile": "PAPER_BINANCE_USDM",
    "screen": "PAPER_TRADING_SCREEN",
    "query_capabilities": 3,
    "interfaces": dict(zip(["QUERY", "COMMAND", "EVENT", "ARTIFACT"], expected_states)),
    "product_runtime_active": False,
    "source_mutations": 0,
}, separators=(",", ":"), sort_keys=True))
PY

printf 'N15B current-capability gateway acceptance gate passed; runtime and source remain unchanged.\n'
