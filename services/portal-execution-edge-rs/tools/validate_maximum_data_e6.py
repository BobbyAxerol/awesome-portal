#!/usr/bin/env python3
"""Dependency-free verifier for sanitized EX-DP-06 acceptance evidence.

The verifier reads committed contracts only. It never opens a database,
network, cache, listener, command channel or credential source.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "contracts" / "maximum-data-return-v1"
PROFILES = {
    "PAPER": "PAPER_BINANCE_USDM",
    "SANDBOX": "SANDBOX_BINANCE_USDM",
    "LIVE": "LIVE_BINANCE_USDM",
}
FORBIDDEN = (
    "postgres://",
    "redis://",
    "SELECT ",
    "BEGIN ",
    "/portal/execution/v4",
    '"trace_id"',
    '"record_key"',
    "-----BEGIN",
)


def fail(message: str) -> None:
    raise ValueError(message)


def load(name: str) -> Any:
    return json.loads((PACK / name).read_text(encoding="utf-8"))


def digest(name: str) -> str:
    return "sha256:" + hashlib.sha256((PACK / name).read_bytes()).hexdigest()


def nonblank(value: Any) -> bool:
    return isinstance(value, str) and bool(value) and value.strip() == value


def sha256(value: Any) -> bool:
    if not isinstance(value, str) or not value.startswith("sha256:"):
        return False
    suffix = value.removeprefix("sha256:")
    return len(suffix) == 64 and all(character in "0123456789abcdef" for character in suffix)


def verify_schema(name: str, expected_id: str) -> None:
    schema = load(name)
    if (
        schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema"
        or schema.get("$id") != expected_id
        or schema.get("type") != "object"
        or schema.get("additionalProperties") is not False
        or not isinstance(schema.get("required"), list)
        or not schema["required"]
        or not isinstance(schema.get("properties"), dict)
        or not schema["properties"]
    ):
        fail(f"schema identity: {name}")


def verify_domains(acceptance: dict[str, Any]) -> None:
    e4 = load("e4-domain-capabilities.v1.json")
    e5 = load("e5-existing-data-publication.v1.json")
    expected = {item["domain_id"]: item for item in e4["domains"]}
    field_ids = {item["field_id"] for item in e5["entries"]}
    domains = acceptance.get("domains")
    if not isinstance(domains, list) or len(domains) != 11:
        fail("domain count")
    actual = {item.get("domain_id") for item in domains}
    if actual != set(expected) or len(actual) != len(domains):
        fail("domain inventory")
    for domain in domains:
        domain_id = domain["domain_id"]
        fields = domain.get("field_ids")
        gaps = domain.get("typed_source_owner_gap_ids")
        semantics = domain.get("accepted_semantics")
        if (
            not isinstance(fields, list)
            or not fields
            or len(set(fields)) != len(fields)
            or not set(fields).issubset(field_ids)
            or not isinstance(gaps, list)
            or len(set(gaps)) != len(gaps)
            or set(gaps) != set(expected[domain_id]["source_owner_gap_ids"])
            or not isinstance(semantics, list)
            or not semantics
            or not all(nonblank(value) for value in semantics)
            or not nonblank(domain.get("owner_action"))
        ):
            fail(f"domain mapping: {domain_id}")
        if expected[domain_id]["source_owner_gap_ids"]:
            if "TYPED" not in domain.get("acceptance_status", ""):
                fail(f"untyped domain limitation: {domain_id}")
        elif (
            domain.get("acceptance_status") != "ACCEPTED_CURRENT_STATE_ONLY"
            or domain.get("owner_action") != "NOT_REQUIRED_CURRENT_SOURCE_BOUNDARY"
        ):
            fail(f"current-only domain boundary: {domain_id}")


def verify_runtime(evidence: dict[str, Any]) -> None:
    e5 = load("e5-existing-data-publication.v1.json")
    expected_relations = {
        entry["field_id"]: entry["manager_relation_id"]
        for entry in e5["entries"]
        if entry["implementation"] == "MANAGER_RELATION_PAGE"
    }
    captures = evidence.get("captures")
    if not isinstance(captures, list) or len(captures) != 3:
        fail("capture count")
    if {capture.get("profile") for capture in captures} != set(PROFILES):
        fail("capture profiles")
    total = 0
    for capture in captures:
        profile = capture["profile"]
        expected_profile = PROFILES[profile]
        bounds = capture.get("request_bounds")
        catalogue = capture.get("catalogue")
        observations = capture.get("relation_observations")
        negative = capture.get("negative_checks")
        if (
            capture.get("schema_version") != "portal.execution.maximum-data.e6.runtime-evidence.v1"
            or capture.get("capture_method") != "SAME_HOST_EXISTING_EDGE_MTLS_READ_ONLY"
            or not nonblank(capture.get("captured_at_utc"))
            or bounds != {"relation_page_limit": 1, "maximum_response_bytes": 1048576}
            or not isinstance(catalogue, dict)
            or catalogue.get("http_status") != 200
            or catalogue.get("content_type") != "application/json"
            or catalogue.get("response_bytes", 1048577) > 1048576
            or not sha256(catalogue.get("body_sha256"))
            or catalogue.get("profile_id") != expected_profile
            or catalogue.get("availability") != "AVAILABLE"
            or catalogue.get("freshness") != "FRESH"
            or catalogue.get("completeness") != "COMPLETE"
            or catalogue.get("relation_count") != 96
            or catalogue.get("fixed_relation_count") != 19
            or catalogue.get("all_fixed_relations_present") is not True
            or catalogue.get("profile_binding_valid") is not True
            or not isinstance(observations, list)
            or len(observations) != 19
            or not isinstance(negative, dict)
        ):
            fail(f"capture boundary: {profile}")
        if {item.get("field_id") for item in observations} != set(expected_relations):
            fail(f"relation inventory: {profile}")
        for item in observations:
            item_count = item.get("item_count")
            state = (
                "PARTIAL"
                if item.get("completeness") != "COMPLETE"
                else "AUTHORITATIVE_EMPTY"
                if item_count == 0
                else "POPULATED"
            )
            if (
                item.get("http_status") != 200
                or item.get("content_type") != "application/json"
                or item.get("response_bytes", 1048577) > 1048576
                or not sha256(item.get("body_sha256"))
                or item.get("profile_id") != expected_profile
                or item.get("expected_profile_id") != expected_profile
                or item.get("relation_id") != expected_relations[item["field_id"]]
                or item.get("profile_binding_valid") is not True
                or item.get("relation_binding_valid") is not True
                or item_count not in (0, 1)
                or item.get("page_bound_valid") is not True
                or item.get("observed_state") != state
                or (
                    item_count == 0
                    and (
                        item.get("primary_resource_key_status") != "AUTHORITATIVE_EMPTY"
                        or item.get("record_field_shape_sha256") is not None
                    )
                )
                or (
                    item_count == 1
                    and (
                        item.get("primary_resource_key_status") != "NONEMPTY_VALIDATED"
                        or not sha256(item.get("record_field_shape_sha256"))
                    )
                )
            ):
                fail(f"relation observation: {profile}/{item.get('field_id')}")
        missing_cert = negative.get("missing_client_certificate")
        method_denial = negative.get("read_identity_post_method_denial")
        if (
            not isinstance(missing_cert, dict)
            or missing_cert.get("outcome") != "DENIED"
            or not nonblank(missing_cert.get("error_class"))
            or not isinstance(method_denial, dict)
            or method_denial.get("denied") is not True
            or method_denial.get("http_status") != 405
        ):
            fail(f"negative checks: {profile}")
        total += len(observations)
    if total != 57:
        fail("observation count")


def verify_manifest() -> None:
    manifest = load("e6-acceptance.manifest.json")
    expected_files = {
        name: digest(name)
        for name in (
            "e6-domain-acceptance.v1.schema.json",
            "e6-runtime-evidence.v1.schema.json",
            "e6-domain-acceptance.v1.json",
            "e6-runtime-evidence.v1.json",
        )
    }
    if (
        manifest.get("schema_version") != "portal.execution.maximum-data.e6.acceptance-manifest.v1"
        or manifest.get("phase") != "EX-DP-06"
        or manifest.get("status") != "EDGE_SHADOW_VERIFIED"
        or manifest.get("e3_coverage_manifest_sha256") != digest("e3-coverage.manifest.json")
        or manifest.get("e4_contract_manifest_sha256") != digest("e4-contract.manifest.json")
        or manifest.get("e5_publication_manifest_sha256") != digest("e5-publication.manifest.json")
        or manifest.get("counts")
        != {
            "domain_count": 11,
            "profile_capture_count": 3,
            "manager_relation_observation_count": 57,
            "negative_check_count": 6,
        }
        or manifest.get("files") != expected_files
        or any(value != "NOT_APPLIED" for value in manifest.get("runtime_mutations", {}).values())
    ):
        fail("manifest")


def main() -> None:
    verify_schema(
        "e6-domain-acceptance.v1.schema.json",
        "portal.execution.maximum-data.e6.domain-acceptance.schema.v1",
    )
    verify_schema(
        "e6-runtime-evidence.v1.schema.json",
        "portal.execution.maximum-data.e6.runtime-evidence.schema.v1",
    )
    acceptance = load("e6-domain-acceptance.v1.json")
    evidence = load("e6-runtime-evidence.v1.json")
    if (
        acceptance.get("schema_version") != "portal.execution.maximum-data.e6.domain-acceptance.v1"
        or acceptance.get("phase") != "EX-DP-06"
        or acceptance.get("status") != "EDGE_SHADOW_VERIFIED"
        or evidence.get("schema_version") != "portal.execution.maximum-data.e6.runtime-evidence.v1"
        or evidence.get("phase") != "EX-DP-06"
        or evidence.get("status") != "SAME_HOST_READ_ONLY_QUALIFIED"
        or evidence.get("capture_method") != "SAME_HOST_EXISTING_EDGE_MTLS_READ_ONLY"
        or evidence.get("raw_data_persisted") is not False
    ):
        fail("E6 identity")
    for pack in (acceptance, evidence):
        if (
            pack.get("e3_coverage_manifest_sha256") != digest("e3-coverage.manifest.json")
            or pack.get("e4_contract_manifest_sha256") != digest("e4-contract.manifest.json")
            or pack.get("e5_publication_manifest_sha256") != digest("e5-publication.manifest.json")
        ):
            fail("E3/E4/E5 pin")
    authority = acceptance.get("authority")
    if not isinstance(authority, dict) or any(authority.get(name) is not False for name in authority):
        fail("authority widened")
    verify_domains(acceptance)
    verify_runtime(evidence)
    verify_manifest()
    for name in (
        "e6-domain-acceptance.v1.schema.json",
        "e6-runtime-evidence.v1.schema.json",
        "e6-domain-acceptance.v1.json",
        "e6-runtime-evidence.v1.json",
        "e6-acceptance.manifest.json",
    ):
        raw = (PACK / name).read_text(encoding="utf-8")
        if any(value in raw for value in FORBIDDEN):
            fail(f"forbidden content: {name}")
    print("E6 acceptance validation passed: 11 domains, 3 profiles, 57 Manager observations, 6 denials")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"E6 acceptance validation failed: {error}", file=sys.stderr)
        sys.exit(1)
