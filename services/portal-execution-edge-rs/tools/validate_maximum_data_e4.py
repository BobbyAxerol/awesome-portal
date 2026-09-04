#!/usr/bin/env python3
"""Dependency-free E4 return-pack verifier.

This is deliberately a contract validator, not a database client or a route
probe.  It independently decodes the JSON pack so a Python consumer rejects
the same timestamp, decimal, lineage, continuation and replay inventions as
the Rust contract crate.
"""

from __future__ import annotations

import hashlib
import json
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "contracts" / "maximum-data-return-v1"
EXPECTED_STATES = {
    "POPULATED",
    "EMPTY",
    "PARTIAL",
    "STALE",
    "GAP",
    "DUPLICATE",
    "CORRECTION",
    "CONTINUATION",
}
EXPECTED_EVENTS = {
    "SIGNAL_INTENT_CREATED",
    "SIZING_REQUESTED",
    "SIZING_APPROVED",
    "SIZING_REDUCED",
    "SIZING_REJECTED",
    "RISK_CHECK_REQUESTED",
    "RISK_APPROVED",
    "RISK_REJECTED",
    "RISK_LIMIT_CHANGED",
    "RISK_BREACH_OPENED",
    "RISK_BREACH_RESOLVED",
    "COMMAND_ACCEPTED",
    "COMMAND_DISPATCHED",
    "COMMAND_ACKNOWLEDGED",
    "COMMAND_TERMINAL",
    "ORDER_CREATED",
    "ORDER_SUBMITTED",
    "ORDER_SOURCE_ACKNOWLEDGED",
    "ORDER_BROKER_ACKNOWLEDGED",
    "ORDER_REJECTED",
    "ORDER_REPLACE_REQUESTED",
    "ORDER_REPLACED",
    "CANCEL_REQUESTED",
    "ORDER_CANCELED",
    "ORDER_EXPIRED",
    "PARTIAL_FILL",
    "FILL",
    "FILL_CORRECTED",
    "POSITION_UPDATED",
    "ACCOUNTING_UPDATED",
    "EQUITY_SNAPSHOT",
    "RECONCILIATION_FINDING_OPENED",
    "RECONCILIATION_FINDING_RESOLVED",
    "ALLOCATION_CHANGED",
    "BROKER_SYNC_STATE_CHANGED",
    "KILL_SWITCH_STATE_CHANGED",
}
SCHEMA_IDS = {
    "e4-source-catalogue.v1.schema.json": "portal.execution.maximum-data.e4.source-catalogue.schema.v1",
    "e4-domain-capability.v1.schema.json": "portal.execution.maximum-data.e4.domain-capability.schema.v1",
    "e4-history-continuation.v1.schema.json": "portal.execution.maximum-data.e4.history-continuation.schema.v1",
    "e4-source-health.v1.schema.json": "portal.execution.maximum-data.e4.source-health.schema.v1",
    "e4-coverage-artifact.v1.schema.json": "portal.execution.maximum-data.e4.coverage-artifact.schema.v1",
    "e4-read-envelope.v1.schema.json": "portal.execution.maximum-data.e4.read-envelope.schema.v1",
    "e4-event-coverage.v1.schema.json": "portal.execution.maximum-data.e4.event-coverage.schema.v1",
}


def fail(message: str) -> None:
    raise ValueError(message)


def load(name: str) -> Any:
    return json.loads((PACK / name).read_text(encoding="utf-8"))


def is_int64(value: Any) -> bool:
    return type(value) is int and -(2**63) <= value < 2**63


def require_text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value or value.strip() != value:
        fail(f"{name} must be nonblank text")
    return value


def verify_schema_documents() -> None:
    for filename, schema_id in SCHEMA_IDS.items():
        document = load(filename)
        if (
            document.get("$schema") != "https://json-schema.org/draft/2020-12/schema"
            or document.get("$id") != schema_id
            or document.get("type") != "object"
            or document.get("additionalProperties") is not False
            or not isinstance(document.get("required"), list)
            or not document["required"]
            or not isinstance(document.get("properties"), dict)
            or not document["properties"]
        ):
            fail(f"invalid schema meta: {filename}")


def verify_exact_decimal(amount: Any, path: str) -> None:
    if not isinstance(amount, dict) or set(amount) != {"value", "currency", "scale"}:
        fail(f"{path}: exact decimal shape")
    value = amount["value"]
    currency = amount["currency"]
    scale = amount["scale"]
    if not isinstance(value, str) or not isinstance(currency, str) or type(scale) is not int:
        fail(f"{path}: float or untyped exact decimal")
    if not (3 <= len(currency) <= 12 and currency.isascii() and currency.isupper()):
        fail(f"{path}: currency")
    try:
        parsed = Decimal(value)
    except InvalidOperation as error:
        raise ValueError(f"{path}: decimal string") from error
    if not parsed.is_finite() or -parsed.as_tuple().exponent != scale:
        fail(f"{path}: decimal scale")


def verify_fixture(fixture: dict[str, Any], source_ids: set[str]) -> None:
    if fixture.get("synthetic_no_business_row") is not True:
        fail("fixture provenance")
    state = fixture.get("state")
    envelope = fixture.get("envelope")
    if state not in EXPECTED_STATES or not isinstance(envelope, dict) or envelope.get("state") != state:
        fail("fixture state")
    lineage = envelope.get("lineage")
    health = envelope.get("source_health")
    page = envelope.get("page")
    records = envelope.get("records")
    if not isinstance(lineage, dict) or not isinstance(health, dict) or not isinstance(page, dict):
        fail("fixture envelope shape")
    require_text(lineage.get("profile_id"), "profile_id")
    if lineage.get("mode") not in {"PAPER", "SANDBOX", "LIVE"}:
        fail("lineage mode")
    if health.get("source_id") not in source_ids:
        fail("unknown source id")
    if not is_int64(health.get("observed_at_ms")):
        fail("observed_at_ms must be int64")
    if health.get("global_sequence") is not None or health.get("source_epoch") is not None:
        fail("fixture invents event stream semantics")
    if envelope.get("schema_version") != SCHEMA_IDS["e4-read-envelope.v1.schema.json"]:
        fail("read envelope schema")
    if (
        page.get("source_id") != health.get("source_id")
        or page.get("profile_id") != lineage.get("profile_id")
        or page.get("logical_operation_id") != envelope.get("logical_operation_id")
        or page.get("source_contract_revision") != envelope.get("source_contract_revision")
    ):
        fail("unbound continuation")
    if bool(page.get("has_more")) != (page.get("next_cursor") is not None):
        fail("cursor must exactly match has_more")
    if page.get("next_cursor") is not None:
        token = page["next_cursor"].get("token") if isinstance(page["next_cursor"], dict) else None
        if not isinstance(token, str) or not token or len(token) > 4096 or token.strip() != token:
            fail("invalid opaque cursor")
    for timestamp_name in ("earliest_available_time_ms", "newest_available_time_ms", "retention_floor_ms"):
        value = page.get(timestamp_name)
        if value is not None and not is_int64(value):
            fail(f"{timestamp_name} must be int64")
    if not isinstance(records, list):
        fail("records")
    for record in records:
        verify_exact_decimal(record.get("amount"), "record.amount")
        if not is_int64(record.get("effective_at_ms")) or not is_int64(record.get("observed_at_ms")):
            fail("record timestamps must be int64")
        if record["observed_at_ms"] < record["effective_at_ms"]:
            fail("record time ordering")
    if state == "POPULATED" and not records:
        fail("populated requires a synthetic record")
    if state == "EMPTY" and records:
        fail("empty must not contain records")
    if state == "PARTIAL" and page.get("completeness") != "PARTIAL":
        fail("partial completeness")
    if state == "STALE" and health.get("freshness") != "STALE":
        fail("stale freshness")
    if state == "GAP" and (page.get("completeness") != "GAP" or not page.get("resnapshot_required")):
        fail("gap semantics")
    if state == "DUPLICATE" and envelope.get("duplicate_records_suppressed", 0) < 1:
        fail("duplicate semantics")
    if state == "CORRECTION" and not any(record.get("correction_of_fixture_record_id") for record in records):
        fail("correction provenance")
    if state == "CONTINUATION" and not page.get("has_more"):
        fail("continuation semantics")


def verify_pack() -> None:
    verify_schema_documents()
    sources = load("e4-source-catalogue.v1.json")
    source_ids = {entry["source_id"] for entry in sources["sources"]}
    if len(source_ids) != 6 or "TRADING_SYSTEM_MANAGER_V2_PAPER" not in source_ids:
        fail("source catalogue")
    manager = next(entry for entry in sources["sources"] if entry["source_id"] == "TRADING_SYSTEM_MANAGER_V2_PAPER")
    if manager["supported_profile_ids"] != ["PAPER_BINANCE_USDM"] or manager["supported_modes"] != ["PAPER"]:
        fail("manager-v2 profile compatibility")

    e3 = load("e3-field-definitions.v1.json")
    bindings = load("e4-operation-bindings.v1.json")["bindings"]
    e3_field_ids = {entry["field_id"] for entry in e3["fields"]}
    binding_ids = {entry["field_id"] for entry in bindings}
    if len(bindings) != len(binding_ids) or binding_ids != e3_field_ids:
        fail("E3 field binding coverage")
    for binding in bindings:
        gap = binding["binding_status"] == "SOURCE_OWNER_GAP"
        if gap != (binding["logical_operation_id"] is None) or gap != (binding["typed_absence_id"] is not None):
            fail("typed operation or absence")

    coverage = load("e4-event-coverage.v1.json")["coverage"]
    if {entry["event_type"] for entry in coverage} != EXPECTED_EVENTS or len(coverage) != 36:
        fail("minimum event coverage")
    for event in coverage:
        if event["status"] == "AVAILABLE" or event["replay_eligible"] is not False:
            fail("invented event replay")
        if (event["status"] == "SOURCE_ABSENT") != bool(event["owner_action_id"]):
            fail("event source owner ruling")

    fixtures = load("e4-golden-fixtures.v1.json")
    if fixtures.get("provenance") != "SYNTHETIC_NO_BUSINESS_ROWS":
        fail("fixture provenance")
    if {fixture["state"] for fixture in fixtures["fixtures"]} != EXPECTED_STATES:
        fail("fixture coverage")
    for fixture in fixtures["fixtures"]:
        verify_fixture(fixture, source_ids)

    manifest = load("e4-contract.manifest.json")
    if manifest.get("status") != "COMPLETE" or manifest.get("phase") != "EX-DP-04":
        fail("manifest status")
    if manifest["counts"]["field_binding_count"] != len(bindings) or manifest["counts"]["event_coverage_count"] != len(coverage):
        fail("manifest counts")
    for filename, expected_digest in manifest["files"].items():
        actual_digest = "sha256:" + hashlib.sha256((PACK / filename).read_bytes()).hexdigest()
        if actual_digest != expected_digest:
            fail(f"manifest digest: {filename}")
        raw = (PACK / filename).read_text(encoding="utf-8")
        if any(forbidden in raw for forbidden in ("/portal/execution/v4", "postgres://", "SELECT ")):
            fail(f"forbidden transport boundary: {filename}")


if __name__ == "__main__":
    try:
        verify_pack()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f"E4 contract validation failed: {error}", file=sys.stderr)
        sys.exit(1)
    print("E4 contract validation passed: 7 schemas, 34 field bindings, 36 event rulings, 8 fixtures")
