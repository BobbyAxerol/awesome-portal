#!/usr/bin/env python3
"""Dependency-free verifier for the E5 named existing-data publication pack.

The verifier reads only committed sanitized contracts.  It does not open a
database, source connection, cache, listener or command channel.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "contracts" / "maximum-data-return-v1"
SCHEMAS = {
    "e5-existing-data-publication.v1.schema.json": "portal.execution.maximum-data.e5.existing-data-publication.schema.v1",
    "e5-named-page.v1.schema.json": "portal.execution.maximum-data.e5.named-page.schema.v1",
}
EXPECTED_FIXTURES = {
    "POPULATED": "NAMED_PAGE",
    "EMPTY": "NAMED_PAGE",
    "PARTIAL": "NAMED_PAGE",
    "STALE": "NAMED_PAGE",
    "DUPLICATE": "TYPED_SOURCE_REJECTION",
    "GAP": "NOT_OBSERVABLE_FROM_MANAGER_PAGE",
    "CORRECTION": "NOT_OBSERVABLE_FROM_MANAGER_PAGE",
    "CONTINUATION": "NAMED_PAGE",
}
FORBIDDEN = ("postgres://", "redis://", "SELECT ", "BEGIN ", "/portal/execution/v4")


def fail(message: str) -> None:
    raise ValueError(message)


def load(name: str) -> Any:
    return json.loads((PACK / name).read_text(encoding="utf-8"))


def digest(name: str) -> str:
    return "sha256:" + hashlib.sha256((PACK / name).read_bytes()).hexdigest()


def require_text(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value or value.strip() != value:
        fail(f"{name} must be nonblank text")
    return value


def verify_schemas() -> None:
    for filename, schema_id in SCHEMAS.items():
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
            fail(f"schema meta: {filename}")


def verify_registry() -> None:
    registry = load("e5-existing-data-publication.v1.json")
    e3 = load("e3-field-definitions.v1.json")
    e4 = load("e4-operation-bindings.v1.json")
    if (
        registry.get("schema_version") != "portal.execution.maximum-data.e5.existing-data-publication.v1"
        or registry.get("phase") != "EX-DP-05"
        or registry.get("status") != "EDGE_IMPLEMENTED_SOURCE_DARK"
        or registry.get("e3_coverage_manifest_sha256") != digest("e3-coverage.manifest.json")
        or registry.get("e4_contract_manifest_sha256") != digest("e4-contract.manifest.json")
        or registry.get("page_bounds") != {
            "maximum_page_rows": 200,
            "maximum_response_bytes": 1048576,
            "maximum_cursor_bytes": 4096,
            "total_history_cap": False,
        }
    ):
        fail("registry identity or page bounds")
    authority = registry.get("authority")
    if not isinstance(authority, dict) or any(
        authority.get(key) is not False
        for key in (
            "browser_direct_source_access",
            "direct_database_access",
            "direct_redis_access",
            "raw_relation_or_sql_selection",
            "source_identity_or_credential",
            "source_network_change",
            "command_or_cli_execution",
            "runtime_activation",
        )
    ) or authority.get("typed_unavailable_retained") is not True:
        fail("authority widened")
    entries = registry.get("entries")
    if not isinstance(entries, list) or len(entries) != 34:
        fail("entry count")
    e3_by_id = {item["field_id"]: item for item in e3["fields"]}
    e4_by_id = {item["field_id"]: item for item in e4["bindings"]}
    ids = [item.get("field_id") for item in entries]
    if len(set(ids)) != len(ids) or set(ids) != set(e3_by_id) or set(ids) != set(e4_by_id):
        fail("E3/E4 field coverage")
    counts = {
        "EXISTING_PORTAL_CONTRACT": 0,
        "MANAGER_RELATION_PAGE": 0,
        "PORTAL_DERIVED_DELEGATE": 0,
        "TYPED_UNAVAILABLE": 0,
        "TYPED_SOURCE_OWNER_GAP": 0,
    }
    for entry in entries:
        field_id = require_text(entry.get("field_id"), "field_id")
        kind = entry.get("implementation")
        if kind not in counts:
            fail("unknown implementation")
        counts[kind] += 1
        profiles = entry.get("profiles")
        if not isinstance(profiles, list) or not profiles or len(set(profiles)) != len(profiles):
            fail("profile scope")
        binding = e4_by_id[field_id]
        if kind == "MANAGER_RELATION_PAGE":
            if (
                binding["binding_status"] != "E5_NAMED_OPERATION_REQUIRED"
                or entry.get("manager_relation_id") != e3_by_id[field_id]["source_relation_or_operation"]
                or profiles != ["PAPER", "SANDBOX", "LIVE"]
                or any(entry.get(key) is not None for key in ("existing_contract_id", "portal_delegate_id", "typed_status_code", "typed_absence_id"))
            ):
                fail(f"manager binding: {field_id}")
        elif kind == "TYPED_SOURCE_OWNER_GAP":
            if (
                binding["binding_status"] != "SOURCE_OWNER_GAP"
                or entry.get("typed_status_code") != "SOURCE_OWNER_GAP"
                or entry.get("typed_absence_id") != binding["typed_absence_id"]
                or profiles != ["PAPER", "SANDBOX", "LIVE", "CANARY"]
            ):
                fail(f"owner gap: {field_id}")
        elif kind == "TYPED_UNAVAILABLE":
            if field_id != "canary_drift" or profiles != ["CANARY"] or entry.get("typed_absence_id") is not None:
                fail("Canary unavailable")
    if counts != {
        "EXISTING_PORTAL_CONTRACT": 4,
        "MANAGER_RELATION_PAGE": 19,
        "PORTAL_DERIVED_DELEGATE": 4,
        "TYPED_UNAVAILABLE": 1,
        "TYPED_SOURCE_OWNER_GAP": 6,
    }:
        fail("implementation inventory")


def verify_fixtures_and_manifest() -> None:
    fixtures = load("e5-golden-fixtures.v1.json")
    if fixtures.get("schema_version") != "portal.execution.maximum-data.e5.golden-fixtures.v1" or fixtures.get("provenance") != "SYNTHETIC_SOURCE_TO_CONTRACT_NO_BUSINESS_ROWS":
        fail("fixture identity")
    states = {item.get("state"): item.get("expected_outcome") for item in fixtures.get("fixtures", [])}
    if states != EXPECTED_FIXTURES or len(fixtures["fixtures"]) != len(EXPECTED_FIXTURES):
        fail("fixture states")
    manifest = load("e5-publication.manifest.json")
    expected_files = {
        filename: digest(filename)
        for filename in (
            "e5-existing-data-publication.v1.schema.json",
            "e5-named-page.v1.schema.json",
            "e5-existing-data-publication.v1.json",
            "e5-golden-fixtures.v1.json",
        )
    }
    if (
        manifest.get("schema_version") != "portal.execution.maximum-data.e5.publication-manifest.v1"
        or manifest.get("phase") != "EX-DP-05"
        or manifest.get("status") != "EDGE_IMPLEMENTED_SOURCE_DARK"
        or manifest.get("files") != expected_files
        or manifest.get("counts") != {
            "field_count": 34,
            "manager_relation_adapter_count": 19,
            "existing_contract_count": 4,
            "portal_delegate_count": 4,
            "typed_unavailable_count": 1,
            "source_owner_gap_count": 6,
        }
        or any(value != "NOT_APPLIED" for value in manifest.get("runtime_mutations", {}).values())
    ):
        fail("manifest")


def verify_redaction_boundary() -> None:
    for filename in (*SCHEMAS, "e5-existing-data-publication.v1.json", "e5-golden-fixtures.v1.json", "e5-publication.manifest.json"):
        raw = (PACK / filename).read_text(encoding="utf-8")
        if any(value in raw for value in FORBIDDEN):
            fail(f"forbidden source authority: {filename}")


def main() -> None:
    verify_schemas()
    verify_registry()
    verify_fixtures_and_manifest()
    verify_redaction_boundary()
    print("E5 publication validation passed: 34 fields, 19 Manager adapters, 4 delegates, 6 source gaps")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"E5 publication validation failed: {error}", file=sys.stderr)
        sys.exit(1)
