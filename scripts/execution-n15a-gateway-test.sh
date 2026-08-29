#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${ROOT_DIR}/packages/contracts/fixtures/execution-intercell-gateway.source-dark.valid.json"
EVENTS="${ROOT_DIR}/packages/contracts/fixtures/execution-intercell-gateway.event-corpus.valid.json"
ARTIFACTS="${ROOT_DIR}/packages/contracts/fixtures/execution-intercell-gateway.artifact-corpus.valid.json"
OPENAPI="${ROOT_DIR}/packages/contracts/openapi/execution-intercell-gateway.openapi.json"
GENERATED="${ROOT_DIR}/packages/contracts/generated/execution-intercell-gateway.d.ts"
RUST_LIB="${ROOT_DIR}/services/portal-execution-edge-rs/crates/intercell-gateway/src/lib.rs"

python3 - \
  "${PROFILE}" \
  "${EVENTS}" \
  "${ARTIFACTS}" \
  "${OPENAPI}" \
  "${GENERATED}" \
  "${RUST_LIB}" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/n11-external-read-v1-request/capability-catalogue.schema.json" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/n12-command-relay-v1-request/command-capability-catalogue.schema.json" \
  "${ROOT_DIR}/services/portal-execution-edge-rs/contracts/d4-paper-read-v2-request/incremental-contract.schema.json" \
  "${ROOT_DIR}/packages/contracts/schemas/execution-intercell-gateway.v1.schema.json" <<'PY'
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

(
    profile_path,
    events_path,
    artifacts_path,
    openapi_path,
    generated_path,
    rust_path,
    query_schema_path,
    command_schema_path,
    event_schema_path,
    gateway_schema_path,
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


profile = load(profile_path)
events = load(events_path)
artifacts = load(artifacts_path)
openapi = load(openapi_path)
generated = generated_path.read_text(encoding="utf-8")
rust = rust_path.read_text(encoding="utf-8")

if profile.get("schema_version") != "portal.execution.intercell-gateway.v1":
    raise SystemExit("N15A profile schema version drifted")
for key, expected in {
    "source_dark": True,
    "runtime_active": False,
    "source_call_authorized": False,
}.items():
    if profile.get(key) is not expected:
        raise SystemExit(f"N15A source-dark boundary drifted: {key}")

interfaces = profile.get("interfaces", [])
expected_order = ["QUERY", "COMMAND", "EVENT", "ARTIFACT"]
if [item.get("interface") for item in interfaces] != expected_order:
    raise SystemExit("N15A must declare exactly four ordered independent interfaces")
if any(item.get("publication_state") != "FIXTURE_ONLY" for item in interfaces):
    raise SystemExit("N15A interface claims owner publication")

expected_digests = {
    "QUERY": digest(query_schema_path),
    "COMMAND": digest(command_schema_path),
    "EVENT": digest(event_schema_path),
    "ARTIFACT": digest(gateway_schema_path),
}
for item in interfaces:
    if item.get("contract_digest") != expected_digests[item["interface"]]:
        raise SystemExit(f"N15A {item['interface']} foundation digest drifted")

identity = profile.get("identity_policy", {})
if identity.get("read_identity_class") == identity.get("command_identity_class"):
    raise SystemExit("N15A read and command identities were merged")
for key, expected in {
    "identities_distinct": True,
    "delegated_resource_policy": "EXACT_RESOURCE_ONLY",
    "raw_browser_token_forwarding": False,
    "wildcard_scope_allowed": False,
}.items():
    if identity.get(key) != expected:
        raise SystemExit(f"N15A identity boundary drifted: {key}")

method_by_interface = {
    "QUERY": "GET",
    "COMMAND": "POST",
    "EVENT": "STREAM",
    "ARTIFACT": "REFERENCE",
}
transports = profile.get("transports", [])
if [item.get("interface") for item in transports] != expected_order:
    raise SystemExit("N15A must declare one transport policy per interface")
for policy in transports:
    interface = policy["interface"]
    if policy.get("method") != method_by_interface[interface]:
        raise SystemExit(f"N15A {interface} method drifted")
    if (
        policy.get("redirects_allowed") is not False
        or policy.get("http2_required") is not True
        or policy.get("tls13_required") is not True
        or policy.get("retry_after_dispatch") != 0
        or policy.get("maximum_response_bytes", 0) > 8_388_608
    ):
        raise SystemExit(f"N15A {interface} transport widened")
if next(item for item in transports if item["interface"] == "COMMAND")["retry_before_dispatch"] != 0:
    raise SystemExit("N15A command transport permits retry")

if events.get("source_dark") is not True:
    raise SystemExit("N15A event corpus is not source-dark")
operations = {event.get("operation") for event in events.get("events", [])}
if operations != {"UPSERT", "DELETE"}:
    raise SystemExit("N15A event corpus lost UPSERT/DELETE coverage")
if len({event.get("epoch") for event in events["events"]}) < 2:
    raise SystemExit("N15A event corpus lost epoch-change coverage")

if artifacts.get("source_dark") is not True:
    raise SystemExit("N15A artifact corpus is not source-dark")
expected_rejections = {
    "ACCEPTED",
    "TOO_LARGE",
    "SCHEMA_INCOMPATIBLE",
    "EXPIRED",
    "DIGEST_MISMATCH",
    "SIGNATURE_INVALID",
    "POLICY_DENIED",
}
if {case.get("expected") for case in artifacts.get("cases", [])} != expected_rejections:
    raise SystemExit("N15A artifact rejection corpus is incomplete")

if openapi.get("paths") != {} or openapi.get("servers") != []:
    raise SystemExit("N15A component contract mounted a runtime endpoint/origin")
if openapi.get("x-runtime-mounted") is not False or openapi.get("x-source-dark") is not True:
    raise SystemExit("N15A OpenAPI source-dark marker drifted")
for token in (
    "GatewayInterface",
    "GatewayProfile",
    "InterfaceNegotiation",
    "GatewayEvent",
    "ArtifactDescriptor",
):
    if token not in generated:
        raise SystemExit(f"N15A generated TypeScript lost {token}")

for forbidden in ("reqwest", "TcpListener", "TcpStream", "source_proxy_origin", "api_key"):
    if forbidden in rust:
        raise SystemExit(f"N15A pure gateway crate gained a network/secret surface: {forbidden}")
for required in (
    "LocalTransportDouble",
    "network_attempts",
    "DelegatedAssertionGate",
    "EventReplayGuard",
    "ArtifactPolicy",
):
    if required not in rust:
        raise SystemExit(f"N15A Rust authority lost {required}")

serialized = json.dumps([profile, events, artifacts], sort_keys=True).lower()
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
        raise SystemExit(f"N15A fixture contains secret-shaped material: {forbidden}")

print(
    json.dumps(
        {
            "decision": "N15A_SOURCE_DARK_GATEWAY_VALID",
            "interfaces": expected_order,
            "runtime_active": False,
            "source_call_authorized": False,
            "network_attempts": 0,
        },
        separators=(",", ":"),
        sort_keys=True,
    )
)
PY

printf 'N15A four-interface source-dark contract/static security gate passed. No network or source call started.\n'
