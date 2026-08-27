#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE="${ROOT_DIR}/packages/contracts/fixtures/execution-emergency-routing.source-dark.valid.json"
CORPUS="${ROOT_DIR}/packages/contracts/fixtures/execution-emergency-routing.ui-corpus.valid.json"
OPENAPI="${ROOT_DIR}/packages/contracts/openapi/execution-emergency-routing.openapi.json"
GENERATED="${ROOT_DIR}/packages/contracts/generated/execution-emergency-routing.d.ts"
RUST_LIB="${ROOT_DIR}/services/portal-execution-edge-rs/crates/emergency-routing/src/lib.rs"
ORIGIN_POLICY="${ROOT_DIR}/deploy/execution-emergency/origin-isolation.source-dark.json"
NGINX_TEMPLATE="${ROOT_DIR}/deploy/execution-emergency/nginx.same-origin.source-dark.conf.template"

python3 - \
  "${PROFILE}" \
  "${CORPUS}" \
  "${OPENAPI}" \
  "${GENERATED}" \
  "${RUST_LIB}" \
  "${ORIGIN_POLICY}" \
  "${NGINX_TEMPLATE}" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

profile_path, corpus_path, openapi_path, generated_path, rust_path, origin_path, nginx_path = map(Path, sys.argv[1:])


def reject_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise SystemExit(f"duplicate JSON key rejected: {key}")
        value[key] = item
    return value


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=reject_duplicates)


profile = load(profile_path)
corpus = load(corpus_path)
openapi = load(openapi_path)
origin = load(origin_path)
generated = generated_path.read_text(encoding="utf-8")
rust = rust_path.read_text(encoding="utf-8")
nginx = nginx_path.read_text(encoding="utf-8")

for key, expected in {
    "source_dark": True,
    "runtime_active": False,
    "network_authorized": False,
    "source_call_authorized": False,
}.items():
    if profile.get(key) is not expected:
        raise SystemExit(f"N16A profile widened {key}")

route = profile.get("route", {})
for key, expected in {
    "public_origin": "https://portal.primusspark.com",
    "path_prefix": "/ops/emergency/",
    "browser_mode": "SAME_ORIGIN_ONLY",
    "origin_resolution": "SERVER_SIDE_ONLY",
    "same_origin_only": True,
    "redirects_allowed": False,
    "cors_allowed": False,
    "public_route_active": False,
    "execution_origin_bound": False,
    "browser_internal_origin_visible": False,
    "browser_delegated_token_visible": False,
}.items():
    if route.get(key) != expected:
        raise SystemExit(f"N16A same-origin boundary drifted: {key}")

security = profile.get("security", {})
if security.get("maximum_session_seconds", 999) > 300:
    raise SystemExit("N16A emergency session exceeds five minutes")
if security.get("maximum_step_up_age_seconds", 999) > 90:
    raise SystemExit("N16A phishing-resistant step-up is too old")
if security.get("minimum_distinct_approvals", 0) < 2:
    raise SystemExit("N16A break-glass lost distinct approvals")
if security.get("command_independent_health") is not True:
    raise SystemExit("N16A health became command-dependent")
if security.get("immutable_audit_mode") != "SHA256_HASH_CHAIN":
    raise SystemExit("N16A immutable Portal audit mode drifted")

command = profile.get("command", {})
if command.get("protective_capabilities") != ["LIVE_HALT", "LIVE_REDUCE", "LIVE_EMERGENCY_CLOSE"]:
    raise SystemExit("N16A R3 protective catalogue drifted")
if command.get("forbidden_risk_increasing_capabilities") != ["LIVE_RESUME", "LIVE_SCALE"]:
    raise SystemExit("N16A R4 structural denial drifted")
for key in (
    "n12_r3_catalogue_published",
    "dedicated_command_identity_bound",
    "control_visible",
    "plan_allowed",
    "apply_allowed",
    "verify_allowed",
):
    if command.get(key) is not False:
        raise SystemExit(f"N16A command boundary widened: {key}")

routes = corpus.get("routes", [])
if [item.get("scenario") for item in routes] != [
    "NORMAL_RESEARCH", "RESEARCH_LOSS", "CLOUDFLARE_LOSS",
    "EXECUTION_ORIGIN_LOSS", "ROLLBACK",
]:
    raise SystemExit("N16A fault/rollback corpus is incomplete")
if any(
    item.get("route_target") != "NONE"
    or item.get("control_visible") is not False
    or item.get("source_request_sent") is not False
    or item.get("network_attempts") != 0
    for item in routes
):
    raise SystemExit("N16A route corpus claims runtime/source authority")
commands = corpus.get("commands", [])
if {item.get("risk_tier") for item in commands} != {"R3_LIVE_PROTECTIVE", "R4_LIVE_RISK_INCREASING"}:
    raise SystemExit("N16A command corpus lost R3/R4 separation")
if any(
    item.get("decision") != "DENIED"
    or item.get("plan_allowed") is not False
    or item.get("apply_allowed") is not False
    or item.get("verify_allowed") is not False
    or item.get("source_request_sent") is not False
    for item in commands
):
    raise SystemExit("N16A command corpus contains an enabled action")

if openapi.get("paths") != {} or openapi.get("servers") != []:
    raise SystemExit("N16A component contract mounted a route/origin")
if openapi.get("x-runtime-mounted") is not False or openapi.get("x-public-route-active") is not False:
    raise SystemExit("N16A OpenAPI runtime marker drifted")
for token in ("EmergencyProfile", "RouteDecision", "CommandDecision", "AuditRecord"):
    if token not in generated:
        raise SystemExit(f"N16A generated TypeScript lost {token}")

for key in (
    "cloudflare_application_created", "dns_or_tunnel_route_created",
    "public_route_active", "execution_origin_bound", "internal_origin_in_browser_payload",
    "delegated_token_in_browser", "r3_catalogue_published", "r4_allowed",
):
    if origin.get(key) is not False:
        raise SystemExit(f"N16A origin isolation template widened {key}")
if "proxy_pass" in nginx or "upstream " in nginx or "location = /" in nginx:
    raise SystemExit("N16A Nginx template gained an upstream or broad route")
if "return 503" not in nginx or "N12_R3_CATALOGUE_UNPUBLISHED" not in nginx:
    raise SystemExit("N16A Nginx template no longer fails closed")

for forbidden in ("reqwest", "TcpListener", "TcpStream", "cloudflare_api", "source_proxy_origin", "api_key"):
    if forbidden in rust:
        raise SystemExit(f"N16A pure routing crate gained a network/secret surface: {forbidden}")
for required in (
    "EmergencyRouter", "EmergencyCommandGate", "ImmutableAuditChain",
    "N12R3CatalogueUnpublished", "RiskIncreasingForbidden", "network_attempts",
):
    if required not in rust:
        raise SystemExit(f"N16A Rust authority lost {required}")

serialized = json.dumps([profile, corpus, origin], sort_keys=True).lower()
for forbidden in (
    "-----begin", "authorization: bearer", "private_key", "client_secret",
    "api_key", "password", "postgres://", "redis://", "43.198.", "16.163.",
):
    if forbidden in serialized:
        raise SystemExit(f"N16A fixture contains secret/internal-origin material: {forbidden}")

print(json.dumps({
    "decision": "N16A_SOURCE_DARK_EMERGENCY_ROUTING_VALID",
    "public_route_active": False,
    "source_call_authorized": False,
    "r4_allowed": False,
    "network_attempts": 0,
}, separators=(",", ":"), sort_keys=True))
PY

printf 'N16A same-domain source-dark routing/security/failover gate passed. No public route, origin or source call started.\n'
