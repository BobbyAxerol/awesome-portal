#!/usr/bin/env python3
"""Dependency-free verifier for the EDS-08 source-continuity owner packet.

The verifier reads committed contract files only. It never opens a source
connection, database, cache, listener, command channel or credential store.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PACK = ROOT / "contracts" / "eds08-source-continuity-v1"
E7_PACK = ROOT / "contracts" / "maximum-data-return-v1"
EXPECTED_LANES = {
    "EVENT",
    "MARKET",
    "VALUATION",
    "OPERATIONS",
    "COMMAND",
    "ARTIFACT",
    "RESEARCH",
}
EXPECTED_LANE_BY_GAP = {
    "position-version-history": "EVENT",
    "order-broker-ack-clocks": "EVENT",
    "fill-correction-replay": "EVENT",
    "session-funnel-and-producer-version": "EVENT",
    "signal-intent-funnel": "EVENT",
    "risk-event-correction": "EVENT",
    "market-latest-ticks": "MARKET",
    "market-ohlcv": "MARKET",
    "market-benchmark": "MARKET",
    "market-session-calendar": "MARKET",
    "market-vnm-constraints": "MARKET",
    "portfolio-profile-equity-direct": "VALUATION",
    "position-mark-provenance": "VALUATION",
    "valuation-mark-provenance": "VALUATION",
    "reconciliation-ack-evidence": "OPERATIONS",
    "command-safe-reference-payload-contract": "COMMAND",
    "artifact-signed-reference": "ARTIFACT",
    "research-run-linkage": "RESEARCH",
}
EXPECTED_EVENT_CLASSES = {
    "position-version-history": "execution.position-lifecycle.v1",
    "fill-correction-replay": "execution.fill-lifecycle.v1",
    "risk-event-correction": "risk.decision-lifecycle.v1",
}
EXPECTED_CASES = {
    "DUPLICATE",
    "GAP",
    "CORRECTION",
    "TOMBSTONE",
    "EPOCH_RESET",
    "RETENTION_BOUNDARY",
    "CROSS_PROFILE_REJECTION",
    "SNAPSHOT_TAIL",
}
REQUIRED_PATHS = {
    "README.md",
    "owner-request.v1.json",
    "owner-return.v1.schema.json",
    "owner-return.pending.example.json",
    "source-event-envelope.v1.schema.json",
    "snapshot-tail.v1.schema.json",
    "fixtures/continuity-cases.v1.json",
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
MAX_U64 = 18_446_744_073_709_551_615
MAX_SAFE_JSON_INTEGER = 9_007_199_254_740_991


def fail(message: str) -> None:
    raise ValueError(message)


def obj(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(f"{label} must be an object")
    return value


def array(value: Any, label: str) -> list[Any]:
    if not isinstance(value, list):
        fail(f"{label} must be an array")
    return value


def text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or value != value.strip():
        fail(f"{label} must be nonblank text")
    return value


def digest(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def sha256(value: Any, label: str) -> str:
    raw = text(value, label)
    if len(raw) != 71 or not raw.startswith("sha256:") or any(ch not in "0123456789abcdef" for ch in raw[7:]):
        fail(f"{label} must be sha256")
    return raw


def decimal_u64(value: Any, label: str) -> int:
    raw = text(value, label)
    if not raw.isdigit() or (len(raw) > 1 and raw.startswith("0")):
        fail(f"{label} must be a decimal string")
    parsed = int(raw)
    if parsed > MAX_U64:
        fail(f"{label} exceeds u64")
    return parsed


def utc_ms(value: Any, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 0 or value > MAX_SAFE_JSON_INTEGER:
        fail(f"{label} must be a safe UTC epoch millisecond integer")
    return value


def identifier(value: Any, label: str) -> str:
    raw = text(value, label)
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._:-")
    if len(raw) > 192 or any(ch not in allowed for ch in raw):
        fail(f"{label} identifier")
    return raw


def load(pack: Path, name: str) -> Any:
    return json.loads((pack / name).read_text(encoding="utf-8"))


def read_manifest(pack: Path) -> dict[str, str]:
    manifest: dict[str, str] = {}
    for line in (pack / "MANIFEST.sha256").read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        parts = line.split("  ", 1)
        if len(parts) != 2 or len(parts[0]) != 64 or not parts[1] or parts[1] in manifest:
            fail("invalid or duplicate MANIFEST.sha256 line")
        manifest[parts[1]] = "sha256:" + parts[0]
    return manifest


def verify_manifest(pack: Path) -> None:
    manifest = read_manifest(pack)
    actual = {
        path.relative_to(pack).as_posix(): digest(path)
        for path in pack.rglob("*")
        if path.is_file() and path.name != "MANIFEST.sha256"
    }
    if manifest != actual:
        fail("MANIFEST.sha256 is not a complete exact file index")
    if set(manifest) != REQUIRED_PATHS:
        fail("MANIFEST.sha256 required path set")


def verify_portability(pack: Path) -> None:
    for path in pack.rglob("*"):
        if not path.is_file():
            continue
        raw = path.read_text(encoding="utf-8", errors="strict").lower()
        if any(marker in raw for marker in FORBIDDEN):
            fail(f"forbidden portable content: {path.relative_to(pack)}")


def profile(value: Any, label: str) -> tuple[str, str, str, str, str, str, str]:
    item = obj(value, label)
    expected = {"workspace_id", "mode", "profile_id", "venue_id", "resource_kind", "resource_id", "filter_digest"}
    if set(item) != expected:
        fail(f"{label} shape")
    workspace_id = identifier(item["workspace_id"], f"{label}.workspace_id")
    mode = text(item["mode"], f"{label}.mode")
    if mode not in {"PAPER", "SANDBOX", "LIVE"}:
        fail(f"{label}.mode")
    profile_id = identifier(item["profile_id"], f"{label}.profile_id")
    venue_id = identifier(item["venue_id"], f"{label}.venue_id")
    resource_kind = identifier(item["resource_kind"], f"{label}.resource_kind")
    resource_id = identifier(item["resource_id"], f"{label}.resource_id")
    filter_digest = sha256(item["filter_digest"], f"{label}.filter_digest")
    return (workspace_id, mode, profile_id, venue_id, resource_kind, resource_id, filter_digest)


def verify_baseline(pack: Path, request: dict[str, Any]) -> set[str]:
    if request.get("schema_version") != "portal.execution.eds08.source-continuity-owner-request.v1":
        fail("request schema version")
    if request.get("request_revision") != "portal.execution.eds08.source-continuity-owner-request.v1":
        fail("request revision")
    if request.get("phase") != "EDS-08" or request.get("status") != "SOURCE_OWNER_ACTION_REQUIRED":
        fail("request phase/status")
    baseline = obj(request.get("baseline"), "baseline")
    expected = {
        "e7_return_pack_manifest_sha256": digest(E7_PACK / "e7-return-pack.manifest.json"),
        "source_owner_gaps_sha256": digest(E7_PACK / "SOURCE_OWNER_GAPS.json"),
        "event_continuity_ruling_sha256": digest(E7_PACK / "EVENT_CONTINUITY_REPORT.md"),
        "e5_existing_data_publication_sha256": digest(E7_PACK / "e5-existing-data-publication.v1.json"),
        "e6_domain_acceptance_sha256": digest(E7_PACK / "e6-domain-acceptance.v1.json"),
    }
    if baseline != expected:
        fail("frozen E7 baseline drift")
    source_gaps = array(obj(load(E7_PACK, "SOURCE_OWNER_GAPS.json"), "E7 gaps").get("gaps"), "E7 gaps.gaps")
    gap_ids = {identifier(obj(item, "E7 gap").get("gap_id"), "E7 gap id") for item in source_gaps}
    if len(gap_ids) != 18 or gap_ids != set(EXPECTED_LANE_BY_GAP):
        fail("E7 source gap inventory")
    return gap_ids


def verify_request(pack: Path, request: dict[str, Any], gap_ids: set[str]) -> None:
    current_truth = obj(request.get("current_truth"), "current truth")
    if (
        current_truth.get("qualified_surface") != "MANAGER_V2_PROFILE_AND_CATALOGUE_BOUND_CURRENT_PAGE"
        or current_truth.get("global_event_sequence") != "NOT_PROVEN"
        or current_truth.get("retention_floor") != "UNDECLARED"
        or current_truth.get("correction_replay") != "NOT_ACCEPTED"
    ):
        fail("current truth drift")
    lanes = [obj(item, "owner lane") for item in array(request.get("owner_lanes"), "owner lanes")]
    if {text(lane.get("lane_id"), "owner lane id") for lane in lanes} != EXPECTED_LANES or len(lanes) != 7:
        fail("owner lane set")
    seen: dict[str, str] = {}
    event_items: dict[str, dict[str, Any]] = {}
    for lane in lanes:
        lane_id = text(lane.get("lane_id"), "owner lane id")
        owners = array(lane.get("owners"), f"{lane_id} owners")
        if not owners or not all(isinstance(owner, str) and owner for owner in owners):
            fail(f"{lane_id} owners")
        items = [obj(item, f"{lane_id} item") for item in array(lane.get("items"), f"{lane_id} items")]
        if not items:
            fail(f"{lane_id} empty")
        for item in items:
            gap_id = identifier(item.get("gap_id"), f"{lane_id} gap")
            if gap_id in seen:
                fail(f"duplicate mapped source gap: {gap_id}")
            seen[gap_id] = lane_id
            if item.get("delivery_kind") == "AUTHORITATIVE_EVENT_STREAM":
                event_items[gap_id] = item
            if not isinstance(item.get("event_class_id"), (str, type(None))):
                fail(f"event class type: {gap_id}")
            text(item.get("minimum_result"), f"minimum result: {gap_id}")
    if set(seen) != gap_ids or seen != EXPECTED_LANE_BY_GAP:
        fail("every E7 gap must be mapped once to its canonical owner lane")
    if set(event_items) != set(EXPECTED_EVENT_CLASSES):
        fail("event stream scope must be minimal and explicit")
    for gap_id, event_class_id in EXPECTED_EVENT_CLASSES.items():
        if event_items[gap_id].get("event_class_id") != event_class_id:
            fail(f"event class mapping: {gap_id}")
    event_classes = [obj(item, "event class") for item in array(request.get("event_classes"), "event classes")]
    if len(event_classes) != 3:
        fail("event class count")
    actual_classes: dict[str, str] = {}
    for event_class in event_classes:
        class_id = identifier(event_class.get("event_class_id"), "event class id")
        class_gaps = [identifier(value, "event class gap") for value in array(event_class.get("gap_ids"), "event class gaps")]
        if len(class_gaps) != 1:
            fail("event class source gap scope")
        required_profiles = array(event_class.get("required_profiles"), "event class profiles")
        if required_profiles != ["PAPER", "SANDBOX", "LIVE"]:
            fail("event class profile scope")
        text(event_class.get("purpose"), "event class purpose")
        actual_classes[class_gaps[0]] = class_id
    if actual_classes != EXPECTED_EVENT_CLASSES:
        fail("event class inventory")
    event_contract = obj(request.get("event_contract"), "event contract")
    if (
        event_contract.get("event_envelope_schema") != "source-event-envelope.v1.schema.json"
        or event_contract.get("snapshot_tail_schema") != "snapshot-tail.v1.schema.json"
        or event_contract.get("sequence_encoding") != "DECIMAL_STRING_U64"
        or event_contract.get("timestamp_encoding") != "UTC_EPOCH_MILLISECONDS"
    ):
        fail("event contract identity")
    required_semantics = set(array(event_contract.get("required_semantics"), "event contract semantics"))
    expected_semantics = {
        "STREAM_PROFILE_RESOURCE_BINDING",
        "SOURCE_EPOCH_AND_CONTIGUOUS_SEQUENCE",
        "IMMUTABLE_EVENT_ID_AND_ENTITY_VERSION",
        "CORRECTION_AND_TOMBSTONE_CAUSALITY",
        "RETENTION_FLOOR_AND_RESNAPSHOT_REQUIRED",
        "SNAPSHOT_HIGH_WATERMARK_THEN_TAIL_FROM_NEXT_SEQUENCE",
        "OPAQUE_RELATION_BOUND_RESUME_CURSOR",
    }
    if required_semantics != expected_semantics:
        fail("event contract semantic set")
    authority = obj(request.get("authority"), "request authority")
    if any(value is not False for value in authority.values()):
        fail("request authority must be false")


def verify_schema_identity(pack: Path) -> None:
    event_schema = obj(load(pack, "source-event-envelope.v1.schema.json"), "event schema")
    snapshot_schema = obj(load(pack, "snapshot-tail.v1.schema.json"), "snapshot schema")
    owner_schema = obj(load(pack, "owner-return.v1.schema.json"), "owner schema")
    if (
        event_schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema"
        or event_schema.get("$id") != "https://schemas.primusspark.com/portal/execution/eds08-source-event-envelope.v1.schema.json"
        or event_schema.get("type") != "object"
        or event_schema.get("additionalProperties") is not False
    ):
        fail("event schema identity")
    decimal = obj(obj(event_schema.get("$defs"), "event defs").get("DecimalU64"), "decimal u64")
    if decimal.get("type") != "string" or "[0-9]" not in str(decimal.get("pattern")):
        fail("event source sequence must be exact decimal string")
    if (
        snapshot_schema.get("$id") != "https://schemas.primusspark.com/portal/execution/eds08-snapshot-tail.v1.schema.json"
        or snapshot_schema.get("type") != "object"
        or snapshot_schema.get("additionalProperties") is not False
        or owner_schema.get("$id") != "https://schemas.primusspark.com/portal/execution/eds08-owner-return.v1.schema.json"
    ):
        fail("snapshot/owner schema identity")


def event(value: Any, label: str) -> tuple[tuple[str, str, str, str, str, str, str], str, int, str, str]:
    item = obj(value, label)
    required = {
        "schema_version", "contract_revision", "stream_id", "profile", "source_epoch", "source_sequence", "event_id", "operation", "occurred_at_ms", "published_at_ms", "entity", "causation_id", "correlation_id", "correction_of_event_id", "tombstone_of_event_id", "payload_schema_revision", "payload_sha256", "payload", "resume_cursor"
    }
    if set(item) != required:
        fail(f"{label} shape")
    if item.get("schema_version") != "portal.execution.eds08.source-event.v1":
        fail(f"{label} schema version")
    identifier(item.get("contract_revision"), f"{label}.contract_revision")
    identifier(item.get("stream_id"), f"{label}.stream_id")
    event_profile = profile(item.get("profile"), f"{label}.profile")
    epoch = identifier(item.get("source_epoch"), f"{label}.source_epoch")
    sequence = decimal_u64(item.get("source_sequence"), f"{label}.source_sequence")
    event_id = identifier(item.get("event_id"), f"{label}.event_id")
    operation = text(item.get("operation"), f"{label}.operation")
    if operation not in {"UPSERT", "CORRECTION", "TOMBSTONE"}:
        fail(f"{label}.operation")
    occurred = utc_ms(item.get("occurred_at_ms"), f"{label}.occurred_at_ms")
    published = utc_ms(item.get("published_at_ms"), f"{label}.published_at_ms")
    if published < occurred:
        fail(f"{label} published before occurred")
    entity = obj(item.get("entity"), f"{label}.entity")
    if set(entity) != {"entity_kind", "entity_id", "entity_version"}:
        fail(f"{label}.entity shape")
    identifier(entity.get("entity_kind"), f"{label}.entity_kind")
    identifier(entity.get("entity_id"), f"{label}.entity_id")
    decimal_u64(entity.get("entity_version"), f"{label}.entity_version")
    for field in ("causation_id", "correlation_id", "correction_of_event_id", "tombstone_of_event_id"):
        if item[field] is not None:
            identifier(item[field], f"{label}.{field}")
    if operation == "CORRECTION" and item["correction_of_event_id"] is None:
        fail(f"{label} correction causal identifier")
    if operation == "TOMBSTONE" and item["tombstone_of_event_id"] is None:
        fail(f"{label} tombstone causal identifier")
    identifier(item.get("payload_schema_revision"), f"{label}.payload_schema_revision")
    sha256(item.get("payload_sha256"), f"{label}.payload_sha256")
    payload = obj(item.get("payload"), f"{label}.payload")
    if payload.get("synthetic") is not True:
        fail(f"{label} is not synthetic")
    if item["resume_cursor"] is not None:
        if not isinstance(item["resume_cursor"], str) or not item["resume_cursor"] or len(item["resume_cursor"]) > 4096:
            fail(f"{label}.resume_cursor")
    return (event_profile, epoch, sequence, event_id, operation)


def watermark(value: Any, label: str) -> tuple[str, int]:
    item = obj(value, label)
    if set(item) != {"source_epoch", "source_sequence"}:
        fail(f"{label} shape")
    return (identifier(item.get("source_epoch"), f"{label}.source_epoch"), decimal_u64(item.get("source_sequence"), f"{label}.source_sequence"))


def verify_snapshot(value: Any, label: str) -> tuple[tuple[str, str, str, str, str, str, str], tuple[str, int]]:
    item = obj(value, label)
    required = {
        "schema_version", "contract_revision", "stream_id", "profile", "snapshot_id", "snapshot_as_of_ms", "snapshot_high_watermark", "tail_starts_after", "retention_floor", "resnapshot_required", "resume_cursor", "completeness"
    }
    if set(item) != required or item.get("schema_version") != "portal.execution.eds08.snapshot-tail.v1":
        fail(f"{label} shape/schema")
    identifier(item.get("contract_revision"), f"{label}.contract_revision")
    identifier(item.get("stream_id"), f"{label}.stream_id")
    snapshot_profile = profile(item.get("profile"), f"{label}.profile")
    identifier(item.get("snapshot_id"), f"{label}.snapshot_id")
    utc_ms(item.get("snapshot_as_of_ms"), f"{label}.snapshot_as_of_ms")
    high = watermark(item.get("snapshot_high_watermark"), f"{label}.snapshot_high_watermark")
    tail = watermark(item.get("tail_starts_after"), f"{label}.tail_starts_after")
    if high != tail:
        fail(f"{label} tail must start after high-watermark")
    floor = obj(item.get("retention_floor"), f"{label}.retention_floor")
    if set(floor) != {"source_epoch", "source_sequence", "occurred_at_ms"}:
        fail(f"{label}.retention_floor shape")
    identifier(floor.get("source_epoch"), f"{label}.retention_floor.source_epoch")
    decimal_u64(floor.get("source_sequence"), f"{label}.retention_floor.source_sequence")
    utc_ms(floor.get("occurred_at_ms"), f"{label}.retention_floor.occurred_at_ms")
    if not isinstance(item.get("resnapshot_required"), bool) or item.get("completeness") not in {"COMPLETE", "PARTIAL", "RETENTION_FLOOR", "GAP"}:
        fail(f"{label} state")
    if item["completeness"] in {"RETENTION_FLOOR", "GAP"} and item["resnapshot_required"] is not True:
        fail(f"{label} resnapshot state")
    return snapshot_profile, high


def verify_fixtures(pack: Path) -> None:
    fixture_doc = obj(load(pack, "fixtures/continuity-cases.v1.json"), "fixtures")
    if fixture_doc.get("schema_version") != "portal.execution.eds08.continuity-cases.v1" or fixture_doc.get("synthetic_no_business_data") is not True:
        fail("fixture identity")
    cases = [obj(item, "fixture case") for item in array(fixture_doc.get("cases"), "fixture cases")]
    if len(cases) != 8 or {text(case.get("kind"), "fixture kind") for case in cases} != EXPECTED_CASES:
        fail("fixture case inventory")
    for case in cases:
        kind = text(case.get("kind"), "fixture kind")
        expected_profile = profile(case.get("expected_profile"), f"{kind}.expected_profile")
        events = array(case.get("events"), f"{kind}.events")
        decoded = [event(item, f"{kind}.event[{index}]") for index, item in enumerate(events)]
        expected = obj(case.get("expected"), f"{kind}.expected")
        if set(expected) != {"decision", "advance_checkpoint", "resnapshot_required"} or not isinstance(expected["advance_checkpoint"], bool) or not isinstance(expected["resnapshot_required"], bool):
            fail(f"{kind}.expected")
        decision = text(expected["decision"], f"{kind}.expected.decision")
        if kind == "DUPLICATE":
            if len(decoded) != 2 or decoded[0][2:] != decoded[1][2:] or decoded[0][0] != expected_profile or decision != "IDEMPOTENT_DUPLICATE_NO_VISIBLE_DUPLICATION":
                fail("duplicate fixture semantics")
        elif kind == "GAP":
            if len(decoded) != 2 or decoded[0][0] != expected_profile or decoded[1][0] != expected_profile or decoded[0][1] != decoded[1][1] or decoded[1][2] != decoded[0][2] + 2 or decision != "FENCE_AND_RESNAPSHOT_REQUIRED" or expected["resnapshot_required"] is not True:
                fail("gap fixture semantics")
        elif kind == "CORRECTION":
            if len(decoded) != 1 or decoded[0][0] != expected_profile or decoded[0][4] != "CORRECTION" or decision != "APPLY_CORRECTION_WITH_CAUSAL_REFERENCE":
                fail("correction fixture semantics")
        elif kind == "TOMBSTONE":
            if len(decoded) != 1 or decoded[0][0] != expected_profile or decoded[0][4] != "TOMBSTONE" or decision != "APPLY_TOMBSTONE_WITH_CAUSAL_REFERENCE":
                fail("tombstone fixture semantics")
        elif kind == "EPOCH_RESET":
            prior = watermark(case.get("previous_checkpoint"), "epoch reset checkpoint")
            if len(decoded) != 1 or decoded[0][0] != expected_profile or decoded[0][1] == prior[0] or decoded[0][2] != 1 or decision != "FENCE_PREVIOUS_EPOCH_AND_REQUIRE_SNAPSHOT" or expected["resnapshot_required"] is not True:
                fail("epoch reset fixture semantics")
        elif kind == "RETENTION_BOUNDARY":
            requested = watermark(case.get("requested_after"), "retention requested after")
            floor = obj(case.get("retention_floor"), "retention floor")
            floor_epoch = identifier(floor.get("source_epoch"), "retention floor epoch")
            floor_sequence = decimal_u64(floor.get("source_sequence"), "retention floor sequence")
            utc_ms(floor.get("occurred_at_ms"), "retention floor time")
            if events or requested[0] != floor_epoch or floor_sequence <= requested[1] or decision != "RETENTION_FLOOR_AND_RESNAPSHOT_REQUIRED" or expected["resnapshot_required"] is not True:
                fail("retention fixture semantics")
        elif kind == "CROSS_PROFILE_REJECTION":
            if len(decoded) != 1 or decoded[0][0] == expected_profile or decision != "REJECT_CROSS_PROFILE_NO_ACK" or expected["advance_checkpoint"] is not False:
                fail("cross-profile fixture semantics")
        elif kind == "SNAPSHOT_TAIL":
            snapshot_profile, high = verify_snapshot(case.get("snapshot"), "snapshot-tail snapshot")
            if len(decoded) != 1 or snapshot_profile != expected_profile or decoded[0][0] != expected_profile or decoded[0][1] != high[0] or decoded[0][2] != high[1] + 1 or decision != "COMMIT_SNAPSHOT_THEN_TAIL_FROM_NEXT_SEQUENCE":
                fail("snapshot-tail fixture semantics")


def verify_pending_return(pack: Path, gap_ids: set[str]) -> None:
    pending = obj(load(pack, "owner-return.pending.example.json"), "pending owner return")
    if (
        pending.get("schema_version") != "trading-system.portal.execution.eds08-owner-return.v1"
        or pending.get("request_revision") != "portal.execution.eds08.source-continuity-owner-request.v1"
        or pending.get("publication_state") != "PENDING_TEMPLATE_NOT_EVIDENCE"
        or pending.get("owner_accepted") is not False
    ):
        fail("pending return identity")
    entries = [obj(item, "pending return entry") for item in array(pending.get("entries"), "pending return entries")]
    if len(entries) != 18 or {identifier(item.get("gap_id"), "pending gap id") for item in entries} != gap_ids:
        fail("pending return gap set")
    for entry in entries:
        if entry.get("state") != "SOURCE_GAP_CONFIRMED":
            fail("pending return falsely accepts a source")
        for key in ("contract_revision", "schema_sha256", "fixture_index_sha256", "acceptance_evidence_sha256", "event_class_id", "event_contract", "capability_contract"):
            if entry.get(key) is not None:
                fail("pending return contract leakage")
        text(entry.get("reason"), "pending return reason")
    authority = obj(pending.get("authority"), "pending authority")
    if any(value is not False for value in authority.values()):
        fail("pending authority")


def verify_owner_return(path: Path, gap_ids: set[str]) -> None:
    returned = obj(json.loads(path.read_text(encoding="utf-8")), "owner return")
    if (
        returned.get("schema_version") != "trading-system.portal.execution.eds08-owner-return.v1"
        or returned.get("request_revision") != "portal.execution.eds08.source-continuity-owner-request.v1"
        or returned.get("publication_state") != "OWNER_RETURN"
    ):
        fail("owner return identity")
    text(returned.get("source_revision"), "owner return source revision")
    text(returned.get("owner_id"), "owner return owner id")
    if not isinstance(returned.get("owner_accepted"), bool):
        fail("owner return owner accepted")
    authority = obj(returned.get("authority"), "owner return authority")
    if any(value is not False for value in authority.values()):
        fail("owner return authority")
    entries = [obj(item, "owner return entry") for item in array(returned.get("entries"), "owner return entries")]
    if len(entries) != 18 or {identifier(item.get("gap_id"), "owner return gap id") for item in entries} != gap_ids:
        fail("owner return gap set")
    for entry in entries:
        state = text(entry.get("state"), "owner return state")
        if state not in {"EVENT_SOURCE_ACCEPTED", "CAPABILITY_ACCEPTED_NON_EVENT", "SOURCE_GAP_CONFIRMED"}:
            fail("owner return state")
        if state == "SOURCE_GAP_CONFIRMED":
            if any(entry.get(key) is not None for key in ("contract_revision", "schema_sha256", "fixture_index_sha256", "acceptance_evidence_sha256", "event_class_id", "event_contract", "capability_contract")):
                fail("source gap return contract leakage")
            text(entry.get("reason"), "source gap return reason")
            continue
        for key in ("contract_revision", "schema_sha256", "fixture_index_sha256", "acceptance_evidence_sha256"):
            if key.endswith("sha256"):
                sha256(entry.get(key), f"accepted {key}")
            else:
                identifier(entry.get(key), f"accepted {key}")
        if entry.get("reason") is not None:
            fail("accepted owner return reason")
        if state == "EVENT_SOURCE_ACCEPTED":
            if entry.get("gap_id") not in EXPECTED_EVENT_CLASSES or entry.get("event_class_id") != EXPECTED_EVENT_CLASSES[entry["gap_id"]] or entry.get("capability_contract") is not None:
                fail("event owner return mapping")
            event_contract = obj(entry.get("event_contract"), "accepted event contract")
            if event_contract.get("sequence_encoding") != "DECIMAL_STRING_U64" or not all(event_contract.get(flag) is True for flag in ("retention_floor_declared", "correction_tombstone_supported", "snapshot_tail_supported", "cross_profile_rejection", "resumable_cursor")):
                fail("accepted event contract semantics")
        else:
            if entry.get("event_class_id") is not None or entry.get("event_contract") is not None:
                fail("non-event owner return mapping")
            capability = obj(entry.get("capability_contract"), "accepted capability contract")
            identifier(capability.get("operation_id"), "accepted capability operation")
            profiles = array(capability.get("profile_scope"), "accepted capability profiles")
            if not profiles or not all(profile_name in {"PAPER", "SANDBOX", "LIVE", "CANARY"} for profile_name in profiles):
                fail("accepted capability profiles")
            text(capability.get("semantics"), "accepted capability semantics")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pack", type=Path, default=DEFAULT_PACK, help="EDS-08 contract pack directory")
    parser.add_argument("--owner-return", type=Path, help="sanitized owner-return JSON to verify; pending template is not accepted")
    args = parser.parse_args()
    pack = args.pack.resolve()
    try:
        verify_manifest(pack)
        verify_portability(pack)
        request = obj(load(pack, "owner-request.v1.json"), "owner request")
        gap_ids = verify_baseline(pack, request)
        verify_request(pack, request, gap_ids)
        verify_schema_identity(pack)
        verify_fixtures(pack)
        verify_pending_return(pack, gap_ids)
        if args.owner_return is not None:
            verify_owner_return(args.owner_return.resolve(), gap_ids)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"EDS-08 source continuity contract validation failed: {error}", file=sys.stderr)
        return 1
    suffix = " plus owner return" if args.owner_return is not None else ""
    print(f"EDS-08 source continuity contract validation passed: 18 gaps, 7 owner lanes, 3 event classes, 8 synthetic cases{suffix}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
