#!/usr/bin/env bash
# N17B exact current-set acceptance and source-as-is Portal adapter gate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 - \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-production-acceptance.current-paper.accepted.json" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/current-source-v1/capability-source-map.json" \
  "${ROOT_DIR}/deploy/manifests/current-source-paper-release-profile.v1.json" \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-intercell-gateway.current-paper.accepted.json" \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-protective-path.current-emergency-close.accepted.json" \
  "${ROOT_DIR}/packages/contracts/fixtures/execution-production-readiness.source-dark.valid.json" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/owner-publication/owner-publication.manifest.json" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/owner-runtime-overlay/manager-v2-runtime-qualification.manifest.json" \
  "${ROOT_DIR}/apps/control-api/src/execution/current-source.proxy.ts" \
  "${ROOT_DIR}/apps/control-api/src/execution/delegation.ts" \
  "${ROOT_DIR}/apps/control-api/src/config.ts" \
  "${ROOT_DIR}/deploy/compose.execution-current-source.yaml" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/crates/production-readiness/src/current_acceptance.rs" <<'PY'
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

(
    acceptance_path,
    source_map_path,
    release_path,
    n15b_path,
    n16b_path,
    n17a_path,
    manager_publication_path,
    manager_qualification_path,
    proxy_path,
    delegation_path,
    config_path,
    compose_path,
    rust_path,
) = map(Path, sys.argv[1:])


def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise SystemExit(f"duplicate JSON key rejected: {key}")
        result[key] = value
    return result


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=reject_duplicates)


def digest(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


acceptance = load(acceptance_path)
expected_bindings = {
    "n13b_source_map_sha256": digest(source_map_path),
    "n14b_release_profile_sha256": digest(release_path),
    "n15b_gateway_acceptance_sha256": digest(n15b_path),
    "n16b_protective_acceptance_sha256": digest(n16b_path),
    "n17a_readiness_profile_sha256": digest(n17a_path),
    "manager_publication_sha256": digest(manager_publication_path),
    "manager_qualification_sha256": digest(manager_qualification_path),
    "edge_image_sha256": "sha256:acf792c7831f1f7a16dcf2a004fa797a9e9b4812ba6b83f6fd0a3ee216f995db",
    "source_proxy_image_sha256": "sha256:dafa9e70a3d90cd079147d149dbbaa8ac8a3a9db079b0cf8099892a7f1d5fbe7",
}
if acceptance.get("immutable_bindings") != expected_bindings:
    raise SystemExit("N17B immutable evidence binding drifted")

if (
    acceptance.get("schema_version") != "portal.execution.production-acceptance-current.v1"
    or acceptance.get("phase") != "N17B"
    or acceptance.get("decision") != "N17B_EXACT_CURRENT_SET_ACCEPTED"
):
    raise SystemExit("N17B identity or decision drifted")

profile = acceptance.get("profile", {})
if profile != {
    "environment": "paper",
    "manager_profile_id": "PAPER_BINANCE_USDM",
    "screen_id": "PAPER_TRADING_SCREEN",
    "source_contract": "trading-system.portal-execution.manager-v2.runtime.v1",
}:
    raise SystemExit("N17B exact Paper profile drifted")

delivery = acceptance.get("delivery", [])
if [item.get("interface") for item in delivery] != ["QUERY", "COMMAND", "EVENT", "ARTIFACT"]:
    raise SystemExit("N17B four-interface set widened or reordered")
if delivery[0].get("state") != "CONNECTED_PRIVATE_ACCEPTED":
    raise SystemExit("N17B exact Paper Query is not accepted")
if delivery[1] != {
    "interface": "COMMAND",
    "state": "COMPATIBILITY_ACCEPTED_RUNTIME_INACTIVE",
    "capability_ids": ["live.emergency-close"],
    "reason": "EXACT_LIVE_ACCOUNT_WINDOW_NOT_OPEN",
}:
    raise SystemExit("N17B command classification or authority drifted")
if any(item.get("state") != "SOURCE_DOES_NOT_CURRENTLY_EXIST" for item in delivery[2:]):
    raise SystemExit("N17B invented Event or Artifact delivery")

transport = acceptance.get("transport_evidence", {})
if not all(transport.get(key) is True for key in ("http2", "tls13_mtls", "delegated_jwt")):
    raise SystemExit("N17B private transport evidence is incomplete")
if not (1 <= transport.get("portal_limit_requests_per_second", 0) <= 15 < transport.get("source_limit_requests_per_second", 0)):
    raise SystemExit("N17B Portal pacing has no safe source margin")
if transport.get("requests", 0) < 25 or transport.get("successful_requests") != transport.get("requests"):
    raise SystemExit("N17B paced real-source qualification failed")
if transport.get("negative_statuses") != {
    "missing_jwt": 401,
    "wrong_resource": 403,
    "wrong_method": 405,
}:
    raise SystemExit("N17B delegated-auth negative matrix drifted")
for key in ("business_rows_emitted", "source_mutations", "command_dispatches"):
    if transport.get(key) != 0:
        raise SystemExit(f"N17B evidence crossed a forbidden boundary: {key}")

runtime = acceptance.get("runtime_authority", {})
for key in (
    "owner_phase_approval",
    "exact_set_contract_accepted",
    "paper_private_path_qualified",
    "portal_adapter_implemented",
):
    if runtime.get(key) is not True:
        raise SystemExit(f"N17B acceptance authority missing: {key}")
for key in (
    "signed_product_image_published",
    "product_bff_enabled",
    "public_stable_changed",
    "sandbox_read_enabled",
    "live_read_enabled",
    "live_command_enabled",
    "live_mutation_authorized",
    "trading_system_changed",
):
    if runtime.get(key) is not False:
        raise SystemExit(f"N17B runtime authority widened: {key}")

rollback = acceptance.get("rollback", {})
if rollback.get("scope") != "PAPER_QUERY_ADAPTER_ONLY" or rollback.get("automatic_retry_after_dispatch") is not False:
    raise SystemExit("N17B rollback scope or retry policy drifted")

proxy = proxy_path.read_text(encoding="utf-8")
delegation = delegation_path.read_text(encoding="utf-8")
config = config_path.read_text(encoding="utf-8")
compose = compose_path.read_text(encoding="utf-8")
rust = rust_path.read_text(encoding="utf-8")
for token in (
    "N17B_EXACT_CURRENT_SET_ACCEPTED",
    "MANAGER_V2_CURRENT_AS_IS",
    "/internal/v2/manager/capabilities",
    "/internal/v2/manager/relations/public/",
    "CurrentSourceRateLimiter",
    "N17B_RATE_LIMIT_QUEUE_TIMEOUT",
    "retryable: false",
):
    if token not in proxy:
        raise SystemExit(f"N17B TypeScript adapter lost invariant: {token}")
if "MANAGER_V2_READ_RESOURCE" not in delegation:
    raise SystemExit("N17B delegated identity lost exact Manager-v2 resource")
for token in (
    "EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND",
    ".max(15)",
    "EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_PACE_WAIT_MS",
):
    if token not in config:
        raise SystemExit(f"N17B config lost pacing invariant: {token}")
if "EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND:-15" not in compose:
    raise SystemExit("N17B compose lost safe pacing default")
for token in (
    "pub fn validate",
    "BindingDrift",
    "DeliveryWidened",
    "RuntimeAuthorityWidened",
    "InvalidRollback",
):
    if token not in rust:
        raise SystemExit(f"N17B Rust authority lost invariant: {token}")

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
    "x-admin-token",
):
    if forbidden in serialized:
        raise SystemExit(f"N17B acceptance contains secret-shaped material: {forbidden}")

print(json.dumps({
    "decision": acceptance["decision"],
    "paper_private_path": "QUALIFIED",
    "paced_requests": transport["requests"],
    "successful_requests": transport["successful_requests"],
    "portal_rps": transport["portal_limit_requests_per_second"],
    "source_rps": transport["source_limit_requests_per_second"],
    "product_bff_enabled": False,
    "live_mutations": 0,
}, separators=(",", ":"), sort_keys=True))
PY

printf 'N17B exact current-set acceptance passed; Paper private Query is qualified and all unaccepted runtime authority remains dark.\n'
