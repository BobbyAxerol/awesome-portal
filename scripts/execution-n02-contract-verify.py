#!/usr/bin/env python3
"""Validate the non-secret N02 owner contract pack without importing or running it."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import stat
import sys
from datetime import datetime
from typing import Any


REQUEST_DIRECTORY = (
    pathlib.Path(__file__).resolve().parent.parent
    / "services/portal-execution-edge-rs/contracts/d4-paper-read-v2-request"
)
PACK_FILES = {
    "incremental-contract.json",
    "compatibility-fixtures.json",
    "error-corpus.json",
}
MAXIMUM_FILE_BYTES = 2 * 1024 * 1024
SHA256 = re.compile(r"sha256:[0-9a-f]{64}")
COMMIT = re.compile(r"[0-9a-f]{40}")
SAFE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}")
SAFE_ROUTE = re.compile(r"/[A-Za-z0-9/_-]{1,255}")
ZERO_SHA256 = "sha256:" + "0" * 64
ZERO_COMMIT = "0" * 40


class ContractError(ValueError):
    """Stable N02 package rejection."""


def _exact(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        raise ContractError(f"{label} schema keys are not exact")


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{label} must be an object")
    return value


def _positive_int(value: Any, label: str, maximum: int) -> int:
    if type(value) is not int or not 0 < value <= maximum:
        raise ContractError(f"{label} is outside its bounded integer range")
    return value


def _utc_timestamp(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ContractError(f"{label} must use UTC Z form")
    try:
        datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ContractError(f"{label} is malformed") from exc
    return value


def _no_duplicate_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ContractError("JSON contains a duplicate object key")
        value[key] = item
    return value


def read_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise ContractError("required owner-pack file is missing") from exc
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise ContractError("owner-pack files must be regular non-symlinks")
    if metadata.st_size <= 0 or metadata.st_size > MAXIMUM_FILE_BYTES:
        raise ContractError("owner-pack file exceeds its bounded size")
    try:
        payload = json.loads(
            path.read_text(encoding="utf-8"), object_pairs_hook=_no_duplicate_object
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ContractError("owner-pack JSON is unreadable") from exc
    return _object(payload, path.name)


def digest(path: pathlib.Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def validate_contract(payload: dict[str, Any], *, mode: str) -> None:
    _exact(
        payload,
        {
            "schema_version",
            "contract_revision",
            "previous_revision",
            "status",
            "scope",
            "compatibility",
            "transport",
            "consumer_lease",
            "snapshot",
            "cursor",
            "delta",
            "retention",
            "resync",
            "entities",
            "limits",
            "freshness",
            "authority",
        },
        "incremental contract",
    )
    if payload["schema_version"] != "portal.execution.d4.incremental-source.v1":
        raise ContractError("incremental contract schema version mismatch")
    if payload["contract_revision"] != "d4.paper-read.v2":
        raise ContractError("N02 cannot accept the v1 or an unknown contract revision")
    if payload["previous_revision"] != "d4.paper-read.v1":
        raise ContractError("N02 compatibility predecessor mismatch")
    allowed_status = {
        "template": {"REQUEST_EXAMPLE_NOT_OWNER_PUBLISHED"},
        "candidate": {"OWNER_DRAFT", "OWNER_PUBLISHED"},
        "acceptance": {"OWNER_PUBLISHED"},
    }[mode]
    if payload["status"] not in allowed_status:
        raise ContractError("incremental contract publication status is not valid for this mode")

    scope = _object(payload["scope"], "scope")
    _exact(scope, {"scope_id", "mode", "venue", "caller_selectable"}, "scope")
    if scope != {
        "scope_id": "PAPER_BINANCE_USDM",
        "mode": "paper",
        "venue": "BINANCE",
        "caller_selectable": False,
    }:
        raise ContractError("incremental contract widened the first Paper scope")

    compatibility = _object(payload["compatibility"], "compatibility")
    _exact(
        compatibility,
        {
            "change_kind",
            "v1_snapshot_baseline_supported",
            "unknown_revision_fails_closed",
            "unknown_enum_fails_closed",
        },
        "compatibility",
    )
    if compatibility != {
        "change_kind": "ADDITIVE_WITH_EXPLICIT_ADAPTER",
        "v1_snapshot_baseline_supported": True,
        "unknown_revision_fails_closed": True,
        "unknown_enum_fails_closed": True,
    }:
        raise ContractError("v2 compatibility is not additive and fail-closed")

    transport = _object(payload["transport"], "transport")
    _exact(
        transport,
        {
            "public_listener",
            "source_proxy_mtls_only",
            "identity_mandatory",
            "methods",
            "routes",
        },
        "transport",
    )
    if (
        transport["public_listener"] is not False
        or transport["source_proxy_mtls_only"] is not True
        or transport["identity_mandatory"] is not True
        or transport["methods"] != ["GET"]
    ):
        raise ContractError("incremental transport widened listener, identity or method authority")
    routes = _object(transport["routes"], "transport routes")
    _exact(routes, {"snapshot_begin", "delta_page", "lease_renewal"}, "transport routes")
    if any(not isinstance(route, str) or not SAFE_ROUTE.fullmatch(route) for route in routes.values()):
        raise ContractError("incremental route is malformed or contains a query")

    lease = _object(payload["consumer_lease"], "consumer lease")
    _exact(
        lease,
        {
            "required",
            "issued_by",
            "opaque_token",
            "ttl_seconds",
            "maximum_active_per_identity",
            "renewal_is_get_only",
            "expired_lease_error",
            "source_selects_after_expiry",
        },
        "consumer lease",
    )
    if (
        lease["required"] is not True
        or lease["issued_by"] != "SNAPSHOT_BEGIN_RESPONSE"
        or lease["opaque_token"] is not True
        or lease["renewal_is_get_only"] is not True
        or lease["expired_lease_error"] != "LEASE_EXPIRED"
        or lease["source_selects_after_expiry"] != 0
    ):
        raise ContractError("consumer lease does not fail dormant after expiry")
    _positive_int(lease["ttl_seconds"], "lease ttl", 3600)
    if not 1 <= _positive_int(
        lease["maximum_active_per_identity"], "active leases per identity", 8
    ) <= 8:
        raise ContractError("active lease bound is invalid")

    snapshot = _object(payload["snapshot"], "snapshot")
    _exact(
        snapshot,
        {
            "watermark_required",
            "resource_counts_required",
            "one_baseline_per_epoch_or_resync",
            "maximum_rows",
            "maximum_aggregate_bytes",
        },
        "snapshot",
    )
    if (
        snapshot["watermark_required"] is not True
        or snapshot["one_baseline_per_epoch_or_resync"] is not True
        or set(snapshot["resource_counts_required"] if isinstance(snapshot["resource_counts_required"], list) else [])
        != {"orders", "fills", "positions"}
    ):
        raise ContractError("snapshot lacks watermark, exact counts or resync baseline")
    _positive_int(snapshot["maximum_rows"], "snapshot row maximum", 10_000_000)
    _positive_int(snapshot["maximum_aggregate_bytes"], "snapshot byte maximum", 1 << 34)

    cursor = _object(payload["cursor"], "cursor")
    _exact(
        cursor,
        {
            "opaque",
            "epoch_bound",
            "strict_total_order",
            "monotonic_sequence",
            "same_cursor_same_ordered_page",
            "duplicates_are_idempotent_by_event_id",
            "advance_only_after_atomic_projection_commit",
            "ahead_error",
            "expired_error",
            "gap_error",
        },
        "cursor",
    )
    for key in (
        "opaque",
        "epoch_bound",
        "strict_total_order",
        "monotonic_sequence",
        "same_cursor_same_ordered_page",
        "duplicates_are_idempotent_by_event_id",
        "advance_only_after_atomic_projection_commit",
    ):
        if cursor[key] is not True:
            raise ContractError(f"cursor invariant {key} is not proven")
    if (cursor["ahead_error"], cursor["expired_error"], cursor["gap_error"]) != (
        "CURSOR_AHEAD",
        "CURSOR_EXPIRED",
        "GAP_DETECTED",
    ):
        raise ContractError("cursor failure codes are incomplete")

    delta = _object(payload["delta"], "delta")
    _exact(
        delta,
        {
            "operations",
            "delete_requires_tombstone",
            "full_record_upsert",
            "event_id_required",
            "entity_version_required",
            "observed_at_required",
        },
        "delta",
    )
    if set(delta["operations"] if isinstance(delta["operations"], list) else []) != {
        "UPSERT",
        "DELETE",
    } or any(delta[key] is not True for key in set(delta) - {"operations"}):
        raise ContractError("delta upsert/tombstone identity is incomplete")

    retention = _object(payload["retention"], "retention")
    _exact(
        retention,
        {
            "minimum_recovery_window_seconds",
            "floor_published_on_every_page",
            "earliest_recoverable_cursor_published",
            "maximum_events",
            "maximum_bytes",
            "maximum_age_seconds",
        },
        "retention",
    )
    if (
        retention["floor_published_on_every_page"] is not True
        or retention["earliest_recoverable_cursor_published"] is not True
    ):
        raise ContractError("retention floor or earliest recoverable cursor is missing")
    recovery = _positive_int(
        retention["minimum_recovery_window_seconds"], "minimum recovery window", 31_536_000
    )
    _positive_int(retention["maximum_events"], "retained event maximum", 100_000_000)
    _positive_int(retention["maximum_bytes"], "retained byte maximum", 1 << 40)
    age = _positive_int(retention["maximum_age_seconds"], "retained age maximum", 31_536_000)
    if age < recovery:
        raise ContractError("retention age is shorter than the recovery window")

    resync = _object(payload["resync"], "resync")
    _exact(
        resync,
        {"trigger_errors", "target", "descriptor_counts_required", "silent_skip_forbidden"},
        "resync",
    )
    if (
        set(resync["trigger_errors"] if isinstance(resync["trigger_errors"], list) else [])
        != {"CURSOR_EXPIRED", "GAP_DETECTED"}
        or resync["target"] != "NEW_BUILDING_EPOCH"
        or set(
            resync["descriptor_counts_required"]
            if isinstance(resync["descriptor_counts_required"], list)
            else []
        )
        != {"orders", "fills", "positions"}
        or resync["silent_skip_forbidden"] is not True
    ):
        raise ContractError("full-resync semantics are incomplete")

    entities = payload["entities"]
    if not isinstance(entities, list) or len(entities) != 3:
        raise ContractError("entity completeness must describe exactly the D4 source entities")
    seen: set[str] = set()
    for entity_value in entities:
        entity = _object(entity_value, "entity completeness")
        _exact(
            entity,
            {
                "entity",
                "source_completeness",
                "poll_interval_ms",
                "ordering_key",
                "delete_semantics",
            },
            "entity completeness",
        )
        name = entity["entity"]
        if name not in {"orders", "fills", "positions"} or name in seen:
            raise ContractError("entity completeness set is invalid")
        seen.add(name)
        completeness = entity["source_completeness"]
        if completeness not in {"EVENT_SOURCED", "POLL_BOUNDED", "UNKNOWN"}:
            raise ContractError("source completeness enum is invalid")
        interval = entity["poll_interval_ms"]
        if completeness == "POLL_BOUNDED":
            _positive_int(interval, "poll interval", 3_600_000)
        elif interval is not None:
            raise ContractError("poll interval is valid only for POLL_BOUNDED")
        ordering = entity["ordering_key"]
        if (
            not isinstance(ordering, list)
            or len(ordering) < 2
            or len(ordering) > 6
            or any(not isinstance(key, str) or not SAFE_ID.fullmatch(key) for key in ordering)
        ):
            raise ContractError("entity ordering key is not stable and bounded")
        if entity["delete_semantics"] not in {"TOMBSTONE", "IMMUTABLE_NO_DELETE"}:
            raise ContractError("entity delete semantics are unknown")
    if seen != {"orders", "fills", "positions"}:
        raise ContractError("entity completeness set is incomplete")

    limits = _object(payload["limits"], "limits")
    _exact(
        limits,
        {
            "default_page_rows",
            "maximum_page_rows",
            "maximum_response_bytes",
            "maximum_requests_per_minute",
            "maximum_in_flight_requests",
            "maximum_unchanged_poll_requests",
        },
        "limits",
    )
    default_rows = _positive_int(limits["default_page_rows"], "default page rows", 10_000)
    maximum_rows = _positive_int(limits["maximum_page_rows"], "maximum page rows", 10_000)
    if default_rows > maximum_rows:
        raise ContractError("default page rows exceed maximum page rows")
    _positive_int(limits["maximum_response_bytes"], "response byte maximum", 1 << 30)
    _positive_int(limits["maximum_requests_per_minute"], "request rate maximum", 100_000)
    _positive_int(limits["maximum_in_flight_requests"], "in-flight request maximum", 128)
    _positive_int(limits["maximum_unchanged_poll_requests"], "unchanged poll maximum", 10_000)

    freshness = _object(payload["freshness"], "freshness")
    _exact(
        freshness,
        {
            "as_of_is_source_observation_time",
            "poll_bounded_claims_only_observed_states",
            "future_timestamp_fails_unknown",
            "source_loss_stops_cursor_advance",
        },
        "freshness",
    )
    if any(value is not True for value in freshness.values()):
        raise ContractError("freshness semantics are not fail-closed")
    _validate_authority(_object(payload["authority"], "contract authority"), contract=True)


def _validate_authority(payload: dict[str, Any], *, contract: bool) -> None:
    expected = {
        "database",
        "redis",
        "cli",
        "broker",
        "command",
        "mutation",
        "live",
        "canary",
    }
    if not contract:
        expected |= {"contract_only", "source_implementation", "source_traffic", "portal_activation"}
    _exact(payload, expected, "authority")
    if not contract and payload["contract_only"] is not True:
        raise ContractError("owner pack is not contract-only")
    false_keys = expected - ({"contract_only"} if not contract else set())
    if any(payload[key] is not False for key in false_keys):
        raise ContractError("owner pack widened runtime or Trading System authority")


def validate_fixtures(payload: dict[str, Any]) -> None:
    _exact(
        payload,
        {"schema_version", "contract_revision", "synthetic_non_business_data", "scenarios"},
        "compatibility fixtures",
    )
    if (
        payload["schema_version"] != "portal.execution.d4.incremental-fixtures.v1"
        or payload["contract_revision"] != "d4.paper-read.v2"
        or payload["synthetic_non_business_data"] is not True
    ):
        raise ContractError("compatibility fixtures identity is invalid")
    scenarios = payload["scenarios"]
    if not isinstance(scenarios, list):
        raise ContractError("compatibility scenarios must be an array")
    required = {
        "baseline_watermark_counts",
        "ordered_upsert_page",
        "delete_tombstone",
        "duplicate_replay",
        "gap_requires_new_building_epoch",
        "lease_expiry_zero_source_selects",
        "entity_completeness_matrix",
    }
    actual: set[str] = set()
    for value in scenarios:
        scenario = _object(value, "compatibility scenario")
        _exact(scenario, {"name", "fixture_id"}, "compatibility scenario")
        if scenario["name"] in actual or not isinstance(scenario["fixture_id"], str):
            raise ContractError("compatibility scenario is duplicate or malformed")
        if not scenario["fixture_id"].startswith("synthetic-"):
            raise ContractError("compatibility fixture is not visibly synthetic")
        actual.add(scenario["name"])
    if actual != required:
        raise ContractError("compatibility fixture corpus is incomplete")


def validate_errors(payload: dict[str, Any]) -> None:
    _exact(
        payload,
        {"schema_version", "contract_revision", "synthetic_non_business_data", "cases"},
        "error corpus",
    )
    if (
        payload["schema_version"] != "portal.execution.d4.incremental-errors.v1"
        or payload["contract_revision"] != "d4.paper-read.v2"
        or payload["synthetic_non_business_data"] is not True
    ):
        raise ContractError("error corpus identity is invalid")
    expected = {
        "CONTRACT_REVISION_UNSUPPORTED": (400, False, False),
        "CURSOR_AHEAD": (409, False, False),
        "CURSOR_EXPIRED": (410, False, True),
        "GAP_DETECTED": (409, False, True),
        "LEASE_EXPIRED": (401, False, False),
        "RESPONSE_TOO_LARGE": (413, False, False),
        "RATE_LIMITED": (429, True, False),
        "SOURCE_UNAVAILABLE": (503, True, False),
    }
    cases = payload["cases"]
    if not isinstance(cases, list) or len(cases) != len(expected):
        raise ContractError("error corpus is incomplete")
    actual: dict[str, tuple[Any, Any, Any]] = {}
    for value in cases:
        case = _object(value, "error case")
        _exact(case, {"code", "http_status", "retryable", "requires_resync"}, "error case")
        code = case["code"]
        if not isinstance(code, str) or code in actual:
            raise ContractError("error case code is malformed or duplicate")
        actual[code] = (case["http_status"], case["retryable"], case["requires_resync"])
    if actual != expected:
        raise ContractError("error corpus status/retry/resync mapping drifted")


def validate_manifest(payload: dict[str, Any], pack_dir: pathlib.Path, *, mode: str) -> None:
    _exact(
        payload,
        {
            "schema_version",
            "contract_revision",
            "previous_revision",
            "compatibility_revision",
            "published_at_utc",
            "source_contract_commit",
            "owner_id",
            "owner_accepted",
            "owner_acceptance_evidence_sha256",
            "capability_contract_sha256",
            "files",
            "authority",
        },
        "owner manifest",
    )
    if (
        payload["schema_version"] != "portal.execution.d4.incremental-owner-pack.v1"
        or payload["contract_revision"] != "d4.paper-read.v2"
        or payload["previous_revision"] != "d4.paper-read.v1"
        or payload["compatibility_revision"] != "d4.paper-read.v1-to-v2"
    ):
        raise ContractError("owner manifest contract identity mismatch")
    _utc_timestamp(payload["published_at_utc"], "published_at_utc")
    if not isinstance(payload["owner_id"], str) or not SAFE_ID.fullmatch(payload["owner_id"]):
        raise ContractError("owner manifest owner ID is malformed")
    if payload["owner_accepted"] not in {True, False}:
        raise ContractError("owner acceptance decision must be boolean")
    if mode == "acceptance" and payload["owner_accepted"] is not True:
        raise ContractError("Trading System owner has not accepted the N02 pack")
    if not isinstance(payload["source_contract_commit"], str) or not COMMIT.fullmatch(
        payload["source_contract_commit"]
    ) or payload["source_contract_commit"] == ZERO_COMMIT:
        raise ContractError("owner source-contract commit is absent or malformed")
    for key in ("owner_acceptance_evidence_sha256", "capability_contract_sha256"):
        if not isinstance(payload[key], str) or not SHA256.fullmatch(payload[key]):
            raise ContractError(f"{key} is not a SHA-256 identity")
    if mode == "acceptance" and payload["owner_acceptance_evidence_sha256"] == ZERO_SHA256:
        raise ContractError("owner acceptance evidence digest is a placeholder")
    files = _object(payload["files"], "owner manifest files")
    if set(files) != PACK_FILES:
        raise ContractError("owner manifest file set is not exact")
    for name, expected in files.items():
        if not isinstance(expected, str) or not SHA256.fullmatch(expected) or expected == ZERO_SHA256:
            raise ContractError("owner manifest contains a missing file digest")
        if digest(pack_dir / name) != expected:
            raise ContractError("owner pack byte digest mismatch")
    if payload["capability_contract_sha256"] != files["incremental-contract.json"]:
        raise ContractError("capability contract digest does not bind the contract bytes")
    _validate_authority(_object(payload["authority"], "manifest authority"), contract=False)


def validate_template() -> dict[str, Any]:
    manifest = read_json(REQUEST_DIRECTORY / "owner-pack.manifest.example.json")
    contract = read_json(REQUEST_DIRECTORY / "incremental-contract.example.json")
    fixtures = read_json(REQUEST_DIRECTORY / "compatibility-fixtures.example.json")
    errors = read_json(REQUEST_DIRECTORY / "error-corpus.example.json")
    read_json(REQUEST_DIRECTORY / "incremental-contract.schema.json")
    validate_contract(contract, mode="template")
    validate_fixtures(fixtures)
    validate_errors(errors)
    if (
        manifest.get("owner_accepted") is not False
        or manifest.get("source_contract_commit") != ZERO_COMMIT
        or manifest.get("owner_acceptance_evidence_sha256") != ZERO_SHA256
        or manifest.get("capability_contract_sha256") != ZERO_SHA256
    ):
        raise ContractError("request template accidentally claims owner acceptance")
    if any(value != ZERO_SHA256 for value in _object(manifest.get("files"), "template files").values()):
        raise ContractError("request template accidentally pins unpublished owner bytes")
    _validate_authority(_object(manifest.get("authority"), "template authority"), contract=False)
    return {
        "decision": "N02_REQUEST_TEMPLATE_VALID",
        "contract_revision": "d4.paper-read.v2",
        "owner_accepted": False,
        "runtime_active": False,
    }


def validate_pack(pack_dir: pathlib.Path, *, mode: str) -> dict[str, Any]:
    if not pack_dir.is_absolute() or ".." in pack_dir.parts:
        raise ContractError("owner pack path must be absolute and non-traversing")
    try:
        entries = {path.name for path in pack_dir.iterdir()}
    except OSError as exc:
        raise ContractError("owner pack directory is unreadable") from exc
    expected = PACK_FILES | {"owner-pack.manifest.json"}
    if entries != expected:
        raise ContractError("owner pack directory contains a missing or unexpected entry")
    manifest = read_json(pack_dir / "owner-pack.manifest.json")
    contract = read_json(pack_dir / "incremental-contract.json")
    fixtures = read_json(pack_dir / "compatibility-fixtures.json")
    errors = read_json(pack_dir / "error-corpus.json")
    validate_contract(contract, mode=mode)
    validate_fixtures(fixtures)
    validate_errors(errors)
    validate_manifest(manifest, pack_dir, mode=mode)
    return {
        "decision": "N02_OWNER_PACK_ACCEPTED" if mode == "acceptance" else "N02_OWNER_PACK_CANDIDATE_VALID",
        "contract_revision": "d4.paper-read.v2",
        "compatibility_revision": "d4.paper-read.v1-to-v2",
        "owner_accepted": manifest["owner_accepted"],
        "source_contract_commit": manifest["source_contract_commit"],
        "owner_pack_manifest_sha256": digest(pack_dir / "owner-pack.manifest.json"),
        "capability_contract_sha256": manifest["capability_contract_sha256"],
        "runtime_active": False,
        "source_call": False,
    }


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("--mode", choices=("template", "candidate", "acceptance"), required=True)
    value.add_argument("--pack-dir", type=pathlib.Path)
    return value


def main() -> int:
    arguments = parser().parse_args()
    try:
        if arguments.mode == "template":
            if arguments.pack_dir is not None:
                raise ContractError("template mode does not accept an external pack")
            result = validate_template()
        else:
            if arguments.pack_dir is None:
                raise ContractError("candidate and acceptance modes require --pack-dir")
            result = validate_pack(arguments.pack_dir, mode=arguments.mode)
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        return 0
    except ContractError as exc:
        print(f"N02 contract verification: REJECTED ({exc})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
