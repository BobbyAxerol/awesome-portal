#!/usr/bin/env python3
"""Build and verify the N18 Manager surface census without source traffic.

The census is derived exclusively from committed, sanitized contract artifacts.
It never connects to AWS-HK, a database, Redis, a broker, or a CLI.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import sys
from collections import Counter, defaultdict
from typing import Any, Iterable


ROOT = pathlib.Path(__file__).resolve().parent.parent
CENSUS_DIR = (
    ROOT
    / "services/portal-execution-edge-rs/contracts/manager-surface-census-v1"
)
CENSUS_PATH = CENSUS_DIR / "manager-surface-census.v1.json"
PLAN_PATH = ROOT / "upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md"

SOURCE_PATHS = {
    "manager_schema": ROOT
    / "upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/"
    "trading_system_portal_contract_pack/extract/db-schema.json",
    "gateway_api": ROOT
    / "upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/"
    "trading_system_portal_contract_pack/extract/api-surface.json",
    "cli_catalogue": ROOT
    / "upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/"
    "trading_system_portal_contract_pack/extract/cli-command-map.json",
    "source_capabilities": ROOT
    / "upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/"
    "trading_system_portal_contract_pack/capabilities.sanitized.json",
    "human_command_catalogue": ROOT
    / "upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/"
    "trading_system_portal_contract_pack/command-catalog.yaml",
    "current_source_map": ROOT
    / "services/portal-execution-edge-rs/contracts/current-source-v1/"
    "capability-source-map.json",
    "manager_openapi": ROOT
    / "services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/"
    "manager-v2.openapi.json",
    "manager_publication": ROOT
    / "services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/"
    "owner-publication/owner-publication.manifest.json",
    "manager_runtime_qualification": ROOT
    / "services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/"
    "owner-runtime-overlay/manager-v2-runtime-qualification.manifest.json",
    "n11_read_freeze": ROOT
    / "services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/"
    "owner-publication/n11-v1-capability-freeze.json",
    "n12_command_catalogue": ROOT
    / "services/portal-execution-edge-rs/contracts/n12-command-relay-v1-request/"
    "command-capability-catalogue.example.json",
    "n17b_acceptance": ROOT
    / "packages/contracts/fixtures/"
    "execution-production-acceptance.current-paper.accepted.json",
}

PROFILE_STATES = {"NONEMPTY", "EMPTY", "UNAVAILABLE", "NOT_APPLICABLE"}
RELATION_CLASSES = {
    "SCREEN_BOUND",
    "PROJECTION_INPUT",
    "AUDIT_ONLY",
    "INTERNAL_ONLY",
}
DELIVERY_PHASES = {f"N{number}" for number in range(19, 30)}
N17B_RELATIONS = {
    "account_equity_snapshots",
    "execution_sessions",
    "performance_snapshots",
    "portfolio_equity_snapshots",
    "positions_v2",
    "strategy_deployments",
}
PAPER_ONLY_RELATIONS = {
    "paper_account_seed",
    "paper_matcher_config",
    "paper_open_orders",
}

# Every relation appears exactly once. The policy is product-facing, not a
# database ownership rewrite: no relation is exposed to the browser directly.
RELATION_GROUPS = {
    "SCREEN_BOUND": {
        "account_balances",
        "account_policies",
        "account_reservations",
        "account_sync_current_state",
        "account_sync_effective",
        "account_sync_snapshots",
        "accounts",
        "alpha_risk_config",
        "alphas",
        "broker_account_sync_current_state",
        "broker_account_sync_effective",
        "broker_account_sync_snapshots",
        "broker_sync_state_history",
        "broker_sync_valuation_current_state",
        "broker_sync_valuation_history",
        "command_ack_evidence",
        "command_journal",
        "conditional_order_group_legs",
        "conditional_order_groups",
        "dead_letters",
        "execution_replay_jobs",
        "execution_sessions",
        "fills",
        "instrument_aliases",
        "instrument_metadata_history",
        "instruments",
        "margin_balances",
        "operator_operations",
        "order_bracket_legs",
        "order_brackets",
        "orders",
        "paper_account_seed",
        "paper_matcher_config",
        "paper_open_orders",
        "performance_projection_current_state",
        "portfolio_allocations",
        "portfolio_audit_current_state",
        "portfolio_capital_ledger",
        "portfolio_equity_snapshots",
        "portfolios",
        "positions_v2",
        "reconciliation_findings",
        "reconciliation_observation_buckets",
        "redis_transport_epochs",
        "risk_grants",
        "risk_profiles",
        "service_heartbeats",
        "settlement_calendars",
        "sizing_decisions",
        "strategies",
        "strategy_deployments",
        "traders",
        "venue_accounts",
        "venues",
    },
    "PROJECTION_INPUT": {
        "account_equity_snapshots",
        "alpha_ledger",
        "alpha_positions",
        "arb_order_packages",
        "binance_fills",
        "cash_ledger",
        "copy_event_outbox",
        "domain_events",
        "funding_accruals",
        "funding_rates",
        "margin_ledger",
        "order_pending_exposure",
        "performance_events",
        "performance_snapshots",
        "settlement_buckets",
        "settlements",
    },
    "AUDIT_ONLY": {
        "audit_log",
        "command_broker_attempts",
        "command_delivery_attempts",
        "command_dispatch_outbox",
        "command_stream_trim_audit",
        "copy_event_dead_letters",
        "copy_publish_policies",
        "engine_authority_decisions",
        "engine_authority_scopes",
        "engine_authority_transitions",
        "engine_shadow_comparisons",
        "execution_command_outbox",
        "portfolio_audit_log",
    },
    "INTERNAL_ONLY": {
        "broker_sync_raw_hot",
        "compatibility_surface_registry",
        "compatibility_usage_daily",
        "dnse_trading_tokens",
        "event_idempotency",
        "maintenance_policy_registry",
        "order_group_event_inbox",
        "projection_storage_policies",
        "schema_migration_ledger",
        "schema_object_ownership",
        "storage_archive_manifests",
        "venue_credentials",
        "venue_rate_limits",
    },
}

CLASS_POLICY = {
    "SCREEN_BOUND": ("SCREEN_BFF", "N20"),
    "PROJECTION_INPUT": ("PROJECTION_REDUCER", "N24"),
    "AUDIT_ONLY": ("AUDIT_EVIDENCE", "N29"),
    "INTERNAL_ONLY": ("NONE_INTERNAL", "N29"),
}

REQUEST_PHASE = {
    "BR-EX-41": "N25",
    "BR-EX-42": "N20",
    "BR-EX-43": "N26",
    "BR-EX-44": "N20",
    "BR-EX-45": "N20",
    "BR-EX-46": "N20",
    "BR-EX-47": "N20",
    "BR-EX-48": "N20",
    "BR-EX-49": "N20",
    "BR-EX-50": "N25",
    "BR-EX-51": "N25",
    "BR-EX-52": "N20",
    "BR-EX-53": "N20",
    "BR-EX-54": "N20",
    "BR-EX-55": "N20",
    "BR-EX-56": "N23",
    "BR-EX-57": "N23",
    "BR-EX-58": "N20",
    "BR-EX-59": "N23",
    "BR-EX-60": "N23",
    "BR-EX-61": "N27",
    "BR-EX-62": "N22",
    "BR-EX-63": "N20",
    "BR-EX-64": "N25",
    "BR-EX-65": "N25",
    "BR-EX-66": "N27",
    "BR-EX-67": "N20",
    "BR-EX-68": "N27",
    "BR-EX-69": "N20",
    "BR-EX-70": "N23",
    "BR-EX-71": "N20",
}

READ_PHASE = {
    "deployments.execution-quality": "N25",
    "deployments.contribution": "N25",
    "portfolios.correlation-samples": "N25",
    "market.ticks": "N25",
    "market.candles": "N25",
    "ops.streams": "N26",
    "ops.redis-retention": "N26",
}

MANAGER_PRIMITIVES = {
    "managerCatalog",
    "managerRelationRecords",
    "managerRelationRecord",
    "managerProjection",
    "managerCapabilities",
}


class CensusError(ValueError):
    """Stable N18 census rejection."""


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise CensusError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def read_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"), object_pairs_hook=_reject_duplicate_keys
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CensusError(f"invalid JSON source: {path.relative_to(ROOT)}") from exc
    if not isinstance(value, dict):
        raise CensusError(f"JSON source must be an object: {path.relative_to(ROOT)}")
    return value


def sha256(path: pathlib.Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def _profile_states(
    relation: str, relation_class: str, source_state: str
) -> dict[str, dict[str, str]]:
    if relation_class == "INTERNAL_ONLY":
        return {
            profile: {
                "state": "NOT_APPLICABLE",
                "reason": "INTERNAL_RELATION_NOT_A_PRODUCT_PROFILE_SURFACE",
            }
            for profile in ("PAPER", "SANDBOX", "LIVE")
        }
    if relation in PAPER_ONLY_RELATIONS:
        return {
            "PAPER": {
                "state": "UNAVAILABLE",
                "reason": "SOURCE_PRESENT_BUT_NOT_IN_ACCEPTED_PORTAL_RELATION_SET",
            },
            "SANDBOX": {"state": "NOT_APPLICABLE", "reason": "PAPER_ONLY_RELATION"},
            "LIVE": {"state": "NOT_APPLICABLE", "reason": "PAPER_ONLY_RELATION"},
        }
    if relation in N17B_RELATIONS:
        return {
            "PAPER": {
                "state": source_state,
                "reason": "N17B_EXACT_CURRENT_PAPER_RELATION_BASELINE",
            },
            "SANDBOX": {
                "state": "UNAVAILABLE",
                "reason": "PROFILE_NOT_ACCEPTED_FOR_PORTAL_RELATION_READ",
            },
            "LIVE": {
                "state": "UNAVAILABLE",
                "reason": "PROFILE_NOT_ACCEPTED_FOR_PORTAL_RELATION_READ",
            },
        }
    return {
        profile: {
            "state": "UNAVAILABLE",
            "reason": "RELATION_CATALOGUED_SOURCE_PRESENT_PORTAL_ADAPTER_PENDING_N19",
        }
        for profile in ("PAPER", "SANDBOX", "LIVE")
    }


def _relation_screen_map(source_map: dict[str, Any]) -> dict[str, set[str]]:
    bindings = {row["id"]: row for row in source_map["source_bindings"]}
    capabilities = {row["id"]: row for row in source_map["capabilities"]}
    result: dict[str, set[str]] = defaultdict(set)
    for screen in source_map["screens"]:
        for capability_id in screen["read_capabilities"]:
            capability = capabilities[capability_id]
            for binding_id in capability["source_bindings"]:
                for relation in bindings[binding_id]["relations"]:
                    if relation.startswith("public."):
                        result[relation.removeprefix("public.")].add(screen["screen_id"])
    return result


def _build_relations(
    schema: dict[str, Any], source_map: dict[str, Any]
) -> list[dict[str, Any]]:
    runtime_objects = schema.get("runtime_objects")
    if not isinstance(runtime_objects, dict):
        raise CensusError("manager schema has no runtime object inventory")
    classified = set().union(*RELATION_GROUPS.values())
    duplicates = [
        name
        for name, count in Counter(
            name for names in RELATION_GROUPS.values() for name in names
        ).items()
        if count != 1
    ]
    if duplicates:
        raise CensusError(f"relation classification duplicates: {duplicates}")
    if classified != set(runtime_objects):
        missing = sorted(set(runtime_objects) - classified)
        unknown = sorted(classified - set(runtime_objects))
        raise CensusError(f"relation classification drift: missing={missing}, unknown={unknown}")

    screens = _relation_screen_map(source_map)
    result = []
    for relation, runtime in sorted(runtime_objects.items()):
        relation_class = next(
            key for key, members in RELATION_GROUPS.items() if relation in members
        )
        consumer, phase = CLASS_POLICY[relation_class]
        approximate_rows = runtime.get("approx_live_rows")
        if type(approximate_rows) is not int or approximate_rows < 0:
            raise CensusError(f"relation cardinality evidence is invalid: {relation}")
        source_state = "NONEMPTY" if approximate_rows > 0 else "EMPTY"
        result.append(
            {
                "relation_id": f"public.{relation}",
                "kind": str(runtime.get("kind", "")).upper(),
                "source_capability": "managerRelationRecords",
                "source_authority": "TRADING_SYSTEM",
                "source_snapshot_state": source_state,
                "source_snapshot_evidence": "SANITIZED_APPROXIMATE_RUNTIME_CARDINALITY_2026_08_20",
                "profile_availability": _profile_states(
                    relation, relation_class, source_state
                ),
                "classification": relation_class,
                "owner": "TRADING_SYSTEM_SOURCE_OWNER",
                "consumer": consumer,
                "screen_ids": sorted(screens.get(relation, set())),
                "delivery_phase": phase,
            }
        )
    return result


def _profile_applicability(text: str) -> dict[str, str]:
    lowered = text.lower()
    if "paper" in lowered and "sandbox" not in lowered and "live" not in lowered:
        return {"PAPER": "UNAVAILABLE", "SANDBOX": "NOT_APPLICABLE", "LIVE": "NOT_APPLICABLE"}
    if "sandbox" in lowered and "paper" not in lowered and "live" not in lowered:
        return {"PAPER": "NOT_APPLICABLE", "SANDBOX": "UNAVAILABLE", "LIVE": "NOT_APPLICABLE"}
    if "live" in lowered and "paper" not in lowered and "sandbox" not in lowered:
        return {"PAPER": "NOT_APPLICABLE", "SANDBOX": "NOT_APPLICABLE", "LIVE": "UNAVAILABLE"}
    return {"PAPER": "UNAVAILABLE", "SANDBOX": "UNAVAILABLE", "LIVE": "UNAVAILABLE"}


def _build_gateway_operations(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = payload.get("operations")
    if not isinstance(rows, list):
        raise CensusError("gateway operation catalogue is invalid")
    result = []
    seen: set[str] = set()
    for row in rows:
        method = row.get("method")
        path = row.get("path")
        if not isinstance(method, str) or not isinstance(path, str):
            raise CensusError("gateway operation identity is invalid")
        identifier = f"{method} {path}"
        if identifier in seen:
            raise CensusError(f"duplicate gateway operation: {identifier}")
        seen.add(identifier)
        read_only = method == "GET"
        result.append(
            {
                "operation_id": identifier,
                "method": method,
                "path": path,
                "auth_kinds": sorted(row.get("auth", {}).get("kinds", [])),
                "classification": "READ_CANDIDATE" if read_only else "COMMAND_CANDIDATE",
                "owner": "TRADING_SYSTEM_GATEWAY_OWNER",
                "consumer": "RUST_MANAGER_COMPAT" if read_only else "RUST_COMMAND_RELAY",
                "delivery_phase": "N19" if read_only else "N27",
                "profile_availability": _profile_applicability(path),
                "portal_runtime_state": "UNAVAILABLE",
            }
        )
    return sorted(result, key=lambda item: item["operation_id"])


def _build_cli_actions(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = payload.get("commands")
    if not isinstance(rows, list):
        raise CensusError("CLI catalogue is invalid")
    result = []
    seen: set[str] = set()
    for row in rows:
        identifier = f"{row.get('command')}/{row.get('action')}"
        if identifier in seen:
            raise CensusError(f"duplicate CLI action: {identifier}")
        seen.add(identifier)
        access_paths = sorted(row.get("access_paths", []))
        has_http = "HTTP" in access_paths
        direct = sorted(set(access_paths) - {"HTTP"})
        if has_http and direct:
            classification = "HTTP_ADAPTABLE_DIRECT_PATHS_FORBIDDEN"
        elif has_http:
            classification = "HTTP_ADAPTABLE"
        else:
            classification = "SEMANTICALLY_INCOMPATIBLE_DIRECT_ONLY"
        result.append(
            {
                "action_id": identifier,
                "risk_tier": row.get("risk_tier_proposed"),
                "access_paths": access_paths,
                "http_paths": sorted(row.get("http_paths", [])),
                "classification": classification,
                "owner": "TRADING_SYSTEM_COMMAND_OWNER",
                "consumer": "RUST_COMMAND_RELAY" if has_http else "NONE_DIRECT_ACCESS_FORBIDDEN",
                "delivery_phase": "N27",
                "profile_availability": _profile_applicability(identifier),
                "portal_runtime_state": "UNAVAILABLE",
            }
        )
    return sorted(result, key=lambda item: item["action_id"])


def _split_markdown_row(line: str) -> list[str]:
    placeholder = "\u0000PIPE\u0000"
    protected = line.replace(r"\|", placeholder)
    return [cell.strip().replace(placeholder, "|") for cell in protected.split("|")[1:-1]]


def _build_requests() -> list[dict[str, Any]]:
    rows: list[list[str]] = []
    matcher = re.compile(r"^\| BR-EX-(?:4[1-9]|5[0-9]|6[0-9]|7[01]) \|")
    for line in PLAN_PATH.read_text(encoding="utf-8").splitlines():
        if matcher.match(line):
            cells = _split_markdown_row(line)
            if len(cells) != 17:
                raise CensusError(
                    f"commissioned request row has {len(cells)} columns, expected 17: {cells[0]}"
                )
            rows.append(cells)
    identifiers = [row[0] for row in rows]
    expected = set(REQUEST_PHASE)
    if set(identifiers) != expected or len(identifiers) != len(expected):
        missing = sorted(expected - set(identifiers))
        duplicate = sorted(key for key, count in Counter(identifiers).items() if count > 1)
        unknown = sorted(set(identifiers) - expected)
        raise CensusError(
            f"commissioned request ledger drift: missing={missing}, duplicate={duplicate}, unknown={unknown}"
        )
    result = []
    delivery_keys: set[str] = set()
    for row in rows:
        identifier = row[0]
        delivery_key = f"execution-manager.{identifier.lower()}"
        if delivery_key in delivery_keys:
            raise CensusError(f"duplicate request delivery key: {delivery_key}")
        delivery_keys.add(delivery_key)
        result.append(
            {
                "request_id": identifier,
                "screen_route": row[2],
                "authority": row[5],
                "owner": row[11],
                "consumer": row[14],
                "delivery_key": delivery_key,
                "delivery_phase": REQUEST_PHASE[identifier],
                "status_at_freeze": row[13].strip("`"),
                "source": "EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#7.2",
            }
        )
    return sorted(result, key=lambda item: int(item["request_id"].split("-")[-1]))


def _build_manager_primitives(openapi: dict[str, Any]) -> list[dict[str, Any]]:
    paths = openapi.get("paths")
    if not isinstance(paths, dict):
        raise CensusError("Manager OpenAPI paths are invalid")
    result = []
    for path, path_item in paths.items():
        operation = path_item.get("get") if isinstance(path_item, dict) else None
        if not isinstance(operation, dict):
            raise CensusError("Manager surface contains a non-GET or invalid primitive")
        operation_id = operation.get("operationId")
        result.append(
            {
                "operation_id": operation_id,
                "method": "GET",
                "path": path,
                "owner": "TRADING_SYSTEM_MANAGER_V2_OWNER",
                "consumer": "RUST_MANAGER_COMPAT",
                "delivery_phase": "N19",
                "paper_transport_state": "PRIVATE_QUALIFIED_PRODUCT_DARK",
                "sandbox_transport_state": "UNAVAILABLE",
                "live_transport_state": "UNAVAILABLE",
            }
        )
    if {row["operation_id"] for row in result} != MANAGER_PRIMITIVES:
        raise CensusError("Manager primitive catalogue drifted")
    return sorted(result, key=lambda item: item["operation_id"])


def _read_capability_phase(identifier: str) -> str:
    return READ_PHASE.get(identifier, "N20")


def _build_portal_reads(source_map: dict[str, Any]) -> list[dict[str, Any]]:
    screens_by_capability: dict[str, set[str]] = defaultdict(set)
    for screen in source_map["screens"]:
        for capability in screen["read_capabilities"]:
            screens_by_capability[capability].add(screen["screen_id"])
    accepted = {
        "deployments.positions": "NONEMPTY",
        "deployments.execution-quality": "EMPTY",
        "sessions.current": "NONEMPTY",
    }
    result = []
    for row in source_map["capabilities"]:
        if row["kind"] != "READ":
            continue
        identifier = row["id"]
        paper_state = accepted.get(identifier, "UNAVAILABLE")
        result.append(
            {
                "capability_id": identifier,
                "source_bindings": row["source_bindings"],
                "source_classification": row["classification"],
                "portal_contract": row["portal_contract"],
                "owner": "PORTAL_EXECUTION_BACKEND",
                "consumer": "SCREEN_BFF",
                "screen_ids": sorted(screens_by_capability.get(identifier, set())),
                "delivery_phase": _read_capability_phase(identifier),
                "profile_availability": {
                    "PAPER": paper_state,
                    "SANDBOX": "UNAVAILABLE",
                    "LIVE": "UNAVAILABLE",
                },
            }
        )
    return sorted(result, key=lambda item: item["capability_id"])


def _build_commands(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows = payload.get("capabilities")
    if not isinstance(rows, list):
        raise CensusError("N12 command catalogue is invalid")
    result = []
    for row in rows:
        result.append(
            {
                "capability_id": row["id"],
                "environments": row["environments"],
                "risk_tier": row["risk_tier"],
                "effect": row["effect"],
                "owner": "TRADING_SYSTEM_COMMAND_OWNER",
                "consumer": "ADMIN_ACTION_DRAWER",
                "delivery_phase": "N27",
                "publication_state": "UNPUBLISHED",
                "portal_runtime_state": "UNAVAILABLE",
            }
        )
    return sorted(result, key=lambda item: item["capability_id"])


def build_census() -> dict[str, Any]:
    schema = read_json(SOURCE_PATHS["manager_schema"])
    api = read_json(SOURCE_PATHS["gateway_api"])
    cli = read_json(SOURCE_PATHS["cli_catalogue"])
    source_map = read_json(SOURCE_PATHS["current_source_map"])
    manager_openapi = read_json(SOURCE_PATHS["manager_openapi"])
    n12 = read_json(SOURCE_PATHS["n12_command_catalogue"])

    relations = _build_relations(schema, source_map)
    manager_primitives = _build_manager_primitives(manager_openapi)
    gateway_operations = _build_gateway_operations(api)
    cli_actions = _build_cli_actions(cli)
    portal_reads = _build_portal_reads(source_map)
    commands = _build_commands(n12)
    requests = _build_requests()

    return {
        "schema_version": "portal.execution.manager-surface-census.v1",
        "phase": "N18",
        "decision": "N18_CAPABILITY_DATA_COVERAGE_CENSUS_COMPLETE",
        "generated_from_sanitized_contracts_only": True,
        "runtime_effect": "NONE",
        "source_artifacts": {
            name: {
                "path": str(path.relative_to(ROOT)),
                "sha256": sha256(path),
            }
            for name, path in sorted(SOURCE_PATHS.items())
        },
        "evidence_time": {
            "schema_runtime_capture": "2026-08-20T10:50:00Z",
            "contract_pack_final_capture": "2026-08-21T07:34:00Z",
            "manager_runtime_qualification": "2026-08-28",
            "n17b_private_acceptance": "2026-08-29",
            "census_freeze": "2026-08-30",
        },
        "counts": {
            "relations": len(relations),
            "manager_primitives": len(manager_primitives),
            "gateway_operations": len(gateway_operations),
            "gateway_get_operations": sum(
                item["method"] == "GET" for item in gateway_operations
            ),
            "gateway_mutation_operations": sum(
                item["method"] != "GET" for item in gateway_operations
            ),
            "cli_actions": len(cli_actions),
            "cli_direct_only_actions": sum(
                item["classification"] == "SEMANTICALLY_INCOMPATIBLE_DIRECT_ONLY"
                for item in cli_actions
            ),
            "portal_read_capabilities": len(portal_reads),
            "requested_command_capabilities": len(commands),
            "commissioned_requests": len(requests),
        },
        "corrected_n17b_baseline": {
            "profile": "PAPER_BINANCE_USDM",
            "screen_id": "PAPER_TRADING_SCREEN",
            "relations": sorted(N17B_RELATIONS),
            "capabilities": [
                "deployments.execution-quality",
                "deployments.positions",
                "sessions.current",
            ],
            "product_runtime_enabled": False,
        },
        "manager_primitives": manager_primitives,
        "relations": relations,
        "gateway_operations": gateway_operations,
        "cli_actions": cli_actions,
        "portal_read_capabilities": portal_reads,
        "requested_command_capabilities": commands,
        "commissioned_requests": requests,
        "authority": {
            "source_owner": "TRADING_SYSTEM",
            "compatibility_owner": "RUST_EXECUTION_EDGE",
            "control_and_screen_owner": "TYPESCRIPT_CONTROL_API",
            "browser_raw_relation_access": False,
            "database_redis_cli_shell_access": False,
            "source_activation": False,
            "schema_migration": False,
            "product_endpoint_added": False,
        },
    }


def _iter_nodes(value: Any) -> Iterable[Any]:
    yield value
    if isinstance(value, dict):
        for child in value.values():
            yield from _iter_nodes(child)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_nodes(child)


def _no_business_rows_or_secrets(census: dict[str, Any]) -> None:
    forbidden_keys = {
        "rows",
        "records",
        "business_rows",
        "payload",
        "raw",
        "password",
        "secret",
        "private_key",
        "api_key",
        "access_token",
        "refresh_token",
        "dsn",
        "database_url",
        "redis_url",
    }
    for node in _iter_nodes(census):
        if isinstance(node, dict):
            overlap = {str(key).lower() for key in node} & forbidden_keys
            if overlap:
                raise CensusError(f"census contains forbidden row/secret key: {sorted(overlap)}")
        elif isinstance(node, str):
            lowered = node.lower()
            for token in (
                "-----begin",
                "postgres://",
                "postgresql://",
                "redis://",
                "authorization: bearer",
                "x-admin-token:",
            ):
                if token in lowered:
                    raise CensusError(f"census contains secret-shaped material: {token}")


def validate(census: dict[str, Any], *, compare_sources: bool = True) -> dict[str, Any]:
    expected_top = {
        "schema_version",
        "phase",
        "decision",
        "generated_from_sanitized_contracts_only",
        "runtime_effect",
        "source_artifacts",
        "evidence_time",
        "counts",
        "corrected_n17b_baseline",
        "manager_primitives",
        "relations",
        "gateway_operations",
        "cli_actions",
        "portal_read_capabilities",
        "requested_command_capabilities",
        "commissioned_requests",
        "authority",
    }
    if set(census) != expected_top:
        raise CensusError("census top-level schema is not exact")
    if (
        census["schema_version"] != "portal.execution.manager-surface-census.v1"
        or census["phase"] != "N18"
        or census["decision"] != "N18_CAPABILITY_DATA_COVERAGE_CENSUS_COMPLETE"
        or census["generated_from_sanitized_contracts_only"] is not True
        or census["runtime_effect"] != "NONE"
    ):
        raise CensusError("census identity or authority drifted")

    counts = census["counts"]
    expected_counts = {
        "relations": 96,
        "manager_primitives": 5,
        "gateway_operations": 104,
        "gateway_get_operations": 56,
        "gateway_mutation_operations": 48,
        "cli_actions": 64,
        "cli_direct_only_actions": 7,
        "portal_read_capabilities": 27,
        "requested_command_capabilities": 9,
        "commissioned_requests": 31,
    }
    if counts != expected_counts:
        raise CensusError(f"census completeness counts drifted: {counts}")

    relations = census["relations"]
    relation_ids = [item["relation_id"] for item in relations]
    if len(relation_ids) != len(set(relation_ids)) or len(relation_ids) != 96:
        raise CensusError("relation census is duplicated or incomplete")
    for item in relations:
        if item["classification"] not in RELATION_CLASSES:
            raise CensusError("relation is unclassified")
        if item["delivery_phase"] not in DELIVERY_PHASES:
            raise CensusError("relation has no delivery phase")
        if not item["owner"] or not item["consumer"] or not item["source_capability"]:
            raise CensusError("relation has ambiguous owner, consumer, or source")
        states = item["profile_availability"]
        if set(states) != {"PAPER", "SANDBOX", "LIVE"}:
            raise CensusError("relation profile coverage is incomplete")
        if any(state["state"] not in PROFILE_STATES for state in states.values()):
            raise CensusError("relation profile state is invalid")

    baseline = census["corrected_n17b_baseline"]
    if set(baseline["relations"]) != N17B_RELATIONS or len(baseline["relations"]) != 6:
        raise CensusError("corrected N17B six-relation baseline drifted")
    if baseline["product_runtime_enabled"] is not False:
        raise CensusError("N18 cannot activate the N17B product runtime")

    collections = (
        ("manager_primitives", "operation_id"),
        ("gateway_operations", "operation_id"),
        ("cli_actions", "action_id"),
        ("portal_read_capabilities", "capability_id"),
        ("requested_command_capabilities", "capability_id"),
        ("commissioned_requests", "request_id"),
    )
    for collection, identity in collections:
        values = census[collection]
        identifiers = [item[identity] for item in values]
        if len(identifiers) != len(set(identifiers)):
            raise CensusError(f"duplicate entry in {collection}")
        for item in values:
            if not item.get("owner") or not item.get("consumer"):
                raise CensusError(f"ambiguous owner or consumer in {collection}")
            if item.get("delivery_phase") not in DELIVERY_PHASES:
                raise CensusError(f"missing delivery phase in {collection}")

    request_phases = {
        item["request_id"]: item["delivery_phase"]
        for item in census["commissioned_requests"]
    }
    if request_phases != REQUEST_PHASE:
        raise CensusError("commissioned request phase assignment drifted")

    authority = census["authority"]
    if authority != {
        "source_owner": "TRADING_SYSTEM",
        "compatibility_owner": "RUST_EXECUTION_EDGE",
        "control_and_screen_owner": "TYPESCRIPT_CONTROL_API",
        "browser_raw_relation_access": False,
        "database_redis_cli_shell_access": False,
        "source_activation": False,
        "schema_migration": False,
        "product_endpoint_added": False,
    }:
        raise CensusError("N18 authority widened")

    _no_business_rows_or_secrets(census)

    if compare_sources:
        generated = build_census()
        if census != generated:
            raise CensusError("canonical census or a source digest drifted; render a reviewed revision")

    return {
        "decision": census["decision"],
        **counts,
        "classified_relations": len(relations),
        "unclassified_entries": 0,
        "duplicate_entries": 0,
        "business_rows_retained": 0,
        "runtime_effect": "NONE",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--render",
        action="store_true",
        help="render the deterministic census to stdout",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="verify the committed census and every bound source digest",
    )
    args = parser.parse_args()
    if args.render == args.verify:
        parser.error("choose exactly one of --render or --verify")
    try:
        if args.render:
            census = build_census()
            validate(census, compare_sources=False)
            print(json.dumps(census, indent=2, ensure_ascii=False, sort_keys=True))
        else:
            result = validate(read_json(CENSUS_PATH))
            print(json.dumps(result, separators=(",", ":"), sort_keys=True))
    except CensusError as exc:
        print(f"N18 census rejected: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
