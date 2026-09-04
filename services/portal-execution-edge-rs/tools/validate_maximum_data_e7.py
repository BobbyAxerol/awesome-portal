#!/usr/bin/env python3
"""Dependency-free verifier for the EX-DP-07 portable owner return pack.

The verifier reads committed files only. It never opens a source connection,
database, cache, listener, command channel or credential store.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "contracts" / "maximum-data-return-v1"
REQUIRED_PATHS = {
    "MASTER_RESPONSE.md",
    "owner-response.v2.json",
    "DEPLOYED_RUNTIME_MANIFEST.json",
    "SOURCE_SYSTEM_INVENTORY.json",
    "DATABASE_RELATION_CENSUS.csv",
    "COLUMN_SEMANTICS_CATALOG.csv",
    "SOURCE_LINEAGE_GRAPH.json",
    "PROFILE_MODE_VENUE_COVERAGE.json",
    "SCREEN_FIELD_SOURCE_COVERAGE.csv",
    "ACTION_CAPABILITY_COVERAGE.csv",
    "DERIVED_METRIC_FEASIBILITY.csv",
    "EVENT_CONTINUITY_REPORT.md",
    "ORDER_FILL_REPLAY_CAPABILITY.json",
    "RISK_DATA_CAPABILITY.json",
    "ACCOUNTING_EQUITY_CAPABILITY.json",
    "ACCOUNT_BINDING_CAPABILITY.json",
    "MARKET_CONTEXT_CAPABILITY.json",
    "PUBLICATION_HEALTH_CAPABILITY.json",
    "SOURCE_PUBLICATION_PLAN.json",
    "SOURCE_OWNER_GAPS.json",
    "RELEASE_COMPATIBILITY_MATRIX.json",
    "schemas/source-catalog.v1.schema.json",
    "schemas/relation-history.v1.schema.json",
    "schemas/incremental-events.v2.schema.json",
    "schemas/source-health.v1.schema.json",
    "benchmarks/SOURCE_RATE_WINDOWS.csv",
    "benchmarks/EDGE_STREAM_BENCHMARK.json",
    "benchmarks/CROSS_CELL_BENCHMARK.json",
    "benchmarks/FAILURE_RECOVERY_REPORT.md",
    "evidence/EVIDENCE_INDEX.md",
}
PINS = {
    "e3_coverage_manifest_sha256": "sha256:f9ba8afb8acdf1f863c4de15758fa6e8b63cfd97b69ee0b43d4fc91f3bdbd310",
    "e4_contract_manifest_sha256": "sha256:abc4dcfe1f94f69099dc241f2f07c95c6976d919a8e1b7f68bd9fe88873d8984",
    "e5_publication_manifest_sha256": "sha256:57a36804838d341b6f67d4abbf15b64878743b3b58141b0af1d6934e6f189909",
    "e6_acceptance_manifest_sha256": "sha256:5081befce2c7d62a0a33abd95607e3caf02b7659448b39473e0208640a9e0ef5",
}
FORBIDDEN = (
    "/home/",
    "/srv/",
    "postgres://",
    "postgresql://",
    "redis://",
    "authorization:",
    "-----begin",
)


def fail(message: str) -> None:
    raise ValueError(message)


def load(name: str) -> Any:
    return json.loads((PACK / name).read_text(encoding="utf-8"))


def digest(name: str) -> str:
    return "sha256:" + hashlib.sha256((PACK / name).read_bytes()).hexdigest()


def valid_digest(value: Any) -> bool:
    return (
        isinstance(value, str)
        and value.startswith("sha256:")
        and len(value) == 71
        and all(character in "0123456789abcdef" for character in value[7:])
    )


def read_manifest() -> dict[str, str]:
    manifest: dict[str, str] = {}
    for line in (PACK / "MANIFEST.sha256").read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        parts = line.split("  ", 1)
        if len(parts) != 2 or len(parts[0]) != 64 or not parts[1]:
            fail("invalid MANIFEST.sha256 line")
        if parts[1] in manifest:
            fail(f"duplicate manifest path: {parts[1]}")
        manifest[parts[1]] = "sha256:" + parts[0]
    return manifest


def verify_manifest() -> None:
    manifest = read_manifest()
    actual = {
        path.relative_to(PACK).as_posix(): "sha256:"
        + hashlib.sha256(path.read_bytes()).hexdigest()
        for path in PACK.rglob("*")
        if path.is_file() and path.name != "MANIFEST.sha256"
    }
    if manifest != actual:
        fail("MANIFEST.sha256 is not a complete exact file index")
    if not REQUIRED_PATHS.issubset(manifest):
        fail("MANIFEST.sha256 misses a required return path")


def verify_pins(value: dict[str, Any]) -> None:
    pins = value.get("pins")
    if not isinstance(pins, dict):
        fail("missing frozen pins")
    for key, expected in PINS.items():
        if pins.get(key) != expected:
            fail(f"frozen pin drift: {key}")
    if not valid_digest(pins.get("e1_evidence_manifest_sha256")) or not valid_digest(
        pins.get("e2_positive_semantic_audit_manifest_sha256")
    ):
        fail("E1/E2 evidence pin")


def verify_owner_response() -> None:
    owner = load("owner-response.v2.json")
    if (
        owner.get("schema_version") != "portal.execution.edge-owner-response.v2"
        or owner.get("request_revision") != "portal.execution.edge-maximum-data-request.v1"
        or not isinstance(owner.get("captured_at_ms"), int)
        or not valid_digest(owner.get("image_digest"))
        or not valid_digest(owner.get("catalogue_digest"))
        or not valid_digest(owner.get("serving_policy_digest"))
        or owner.get("return_pack_digest") != digest("e7-return-pack.manifest.json")
    ):
        fail("owner response identity")
    verify_pins(owner)
    capabilities = owner.get("capabilities")
    if not isinstance(capabilities, list) or len(capabilities) != 34:
        fail("capability count")
    expected_fields = {
        entry["field_id"]
        for entry in load("e5-existing-data-publication.v1.json")["entries"]
    }
    actual_fields = {entry.get("field_id") for entry in capabilities if isinstance(entry, dict)}
    if actual_fields != expected_fields or len(actual_fields) != len(capabilities):
        fail("capability field coverage")
    allowed = {
        "AVAILABLE_DIRECT",
        "AVAILABLE_DERIVED_AT_PORTAL",
        "OWNER_ACTION_REQUIRED",
        "CONTRACT_INCOMPATIBLE",
    }
    for capability in capabilities:
        if not isinstance(capability, dict) or capability.get("status") not in allowed:
            fail("capability status")
        if capability.get("history_semantics") in {
            "EVENT_HISTORY_AVAILABLE",
            "GLOBAL_SEQUENCE",
        }:
            fail("unsafe history claim")
        if (
            not isinstance(capability.get("as_of_ms"), int)
            or not isinstance(capability.get("profiles"), list)
            or not capability["profiles"]
            or not isinstance(capability.get("impacted_screens"), list)
            or not capability["impacted_screens"]
            or not isinstance(capability.get("evidence_references"), list)
            or not capability["evidence_references"]
            or not isinstance(capability.get("portal_can_proceed"), bool)
        ):
            fail(f"capability evidence shape: {capability.get('field_id')}")
    gaps = owner.get("genuine_source_gaps")
    if not isinstance(gaps, list) or len(gaps) != 18:
        fail("genuine source gap count")
    if {gap.get("gap_id") for gap in gaps if isinstance(gap, dict)} != {
        gap.get("gap_id") for gap in load("SOURCE_OWNER_GAPS.json")["gaps"]
    }:
        fail("genuine source gap inventory")


def verify_capacity() -> None:
    capacity = load("e7-resilience-capacity.v1.json")
    if (
        capacity.get("schema_version")
        != "portal.execution.maximum-data.e7.resilience-capacity.v1"
        or capacity.get("phase") != "EX-DP-07"
        or capacity.get("raw_rows_persisted") is not False
        or capacity.get("production_slo_established") is not False
    ):
        fail("capacity identity")
    profiles = capacity.get("profiles")
    if not isinstance(profiles, list) or len(profiles) != 3:
        fail("capacity profile count")
    expected = {"PAPER": (1, 1), "SANDBOX": (1, 1), "LIVE": (2, 0)}
    for profile in profiles:
        if not isinstance(profile, dict) or profile.get("profile") not in expected:
            fail("capacity profile")
        safe, errors = expected[profile["profile"]]
        if (
            profile.get("tested_concurrency") != 2
            or profile.get("maximum_safe_concurrency_observed") != safe
            or profile.get("source_error_count") != errors
            or profile.get("page_limit") != 1
            or profile.get("maximum_response_bytes") != 1048576
            or profile.get("request_count") < profile.get("successful_request_count", 0)
        ):
            fail(f"capacity bound: {profile['profile']}")
    transient = capacity.get("additional_typed_source_unavailability_observations")
    if transient != [
        {
            "profile": "LIVE",
            "profile_id": "LIVE_BINANCE_USDM",
            "field_id": "order_current",
            "relation_id": "public.orders",
            "page_limit": 1,
            "http_status": 503,
            "status": "SOURCE_UNAVAILABLE_OBSERVED",
            "consumer_behavior": "TYPED_UNAVAILABLE_NO_AUTOMATIC_RETRY",
            "measurement_role": "availability observation only; it does not replace the bounded deployment-page concurrency measurement",
        }
    ]:
        fail("typed source-unavailable observation")
    requirements = capacity.get("external_evidence_requirements")
    required_ids = {
        "GLOBAL_SEQUENCE_AND_GAP_RATE",
        "RETAINED_EVENT_REPLAY_AND_CORRECTION",
        "CROSS_CELL_SGP_INGEST",
        "ONE_FIVE_THIRTY_MINUTE_SOURCE_OUTAGE",
    }
    if not isinstance(requirements, list) or {
        item.get("requirement_id") for item in requirements if isinstance(item, dict)
    } != required_ids:
        fail("external evidence requirements")


def verify_portability_and_redaction() -> None:
    inventory = load("SOURCE_SYSTEM_INVENTORY.json")
    census = (PACK / "DATABASE_RELATION_CENSUS.csv").read_text(encoding="utf-8")
    columns = (PACK / "COLUMN_SEMANTICS_CATALOG.csv").read_text(encoding="utf-8")
    if (
        inventory.get("read_boundary") != "REPEATABLE_READ_READ_ONLY_CATALOG_METADATA_ONLY"
        or census.count("\n") != 100
        or "NOT_QUERIED_E1_NO_BUSINESS_ROW_ACCESS" not in census
        or not columns.startswith("source_system,schema,relation,ordinal,column,data_type,")
    ):
        fail("metadata census lost no-row provenance")
    for path in PACK.rglob("*"):
        if not path.is_file():
            continue
        raw = path.read_text(encoding="utf-8", errors="strict").lower()
        if any(marker in raw for marker in FORBIDDEN):
            fail(f"forbidden portable content: {path.relative_to(PACK)}")


def verify_pack_manifest() -> None:
    manifest = load("e7-return-pack.manifest.json")
    if (
        manifest.get("schema_version") != "portal.execution.maximum-data.e7.return-pack.v1"
        or manifest.get("phase") != "EX-DP-07"
        or manifest.get("status")
        != "RETURN_PACK_ACCEPTED_FOR_CURRENT_QUALIFIED_READS_AND_TYPED_EXTERNAL_GATES"
        or set(manifest.get("required_paths", [])) != REQUIRED_PATHS
    ):
        fail("E7 return manifest identity")
    verify_pins(manifest)
    authority = manifest.get("authority")
    if not isinstance(authority, dict) or any(value is not False for value in authority.values()):
        fail("return authority widened")


def main() -> None:
    verify_owner_response()
    verify_capacity()
    verify_pack_manifest()
    verify_portability_and_redaction()
    verify_manifest()
    print("E7 return validation passed: 34 capabilities, 18 genuine source gaps, 3 measured profiles")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"E7 return validation failed: {error}", file=sys.stderr)
        sys.exit(1)
