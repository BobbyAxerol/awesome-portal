#!/usr/bin/env python3
"""Verify sanitized N03 owner implementation evidence without deploying it."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import pathlib
import re
import stat
import sys
from datetime import datetime
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parent.parent
REQUEST_DIRECTORY = (
    ROOT
    / "services/portal-execution-edge-rs/contracts/d4-paper-read-v2-implementation-request"
)
N02_SCRIPT = ROOT / "scripts/execution-n02-contract-verify.py"
PACK_FILES = {
    "implementation-profile.json",
    "source-metrics.json",
    "query-plan-evidence.json",
    "acceptance-results.json",
}
MAXIMUM_FILE_BYTES = 2 * 1024 * 1024
SHA256 = re.compile(r"sha256:[0-9a-f]{64}")
COMMIT = re.compile(r"[0-9a-f]{40}")
SAFE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}")
ZERO_SHA256 = "sha256:" + "0" * 64
ZERO_COMMIT = "0" * 40


class ImplementationError(ValueError):
    """Stable N03 evidence rejection."""


def _load_n02_module():
    specification = importlib.util.spec_from_file_location("execution_n02_verify_for_n03", N02_SCRIPT)
    if specification is None or specification.loader is None:
        raise ImplementationError("N02 verifier cannot be loaded")
    module = importlib.util.module_from_spec(specification)
    sys.modules[specification.name] = module
    specification.loader.exec_module(module)
    return module


N02 = _load_n02_module()


def _exact(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        raise ImplementationError(f"{label} schema keys are not exact")


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ImplementationError(f"{label} must be an object")
    return value


def _positive_int(value: Any, label: str, maximum: int) -> int:
    if type(value) is not int or not 0 < value <= maximum:
        raise ImplementationError(f"{label} is outside its bounded integer range")
    return value


def _utc_timestamp(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ImplementationError(f"{label} must use UTC Z form")
    try:
        datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ImplementationError(f"{label} is malformed") from exc
    return value


def _no_duplicate_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ImplementationError("JSON contains a duplicate object key")
        result[key] = value
    return result


def read_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise ImplementationError("required owner evidence file is missing") from exc
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise ImplementationError("owner evidence files must be regular non-symlinks")
    if metadata.st_size <= 0 or metadata.st_size > MAXIMUM_FILE_BYTES:
        raise ImplementationError("owner evidence file exceeds its bounded size")
    try:
        value = json.loads(
            path.read_text(encoding="utf-8"), object_pairs_hook=_no_duplicate_object
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ImplementationError("owner evidence JSON is unreadable") from exc
    return _object(value, path.name)


def digest(path: pathlib.Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def validate_profile(
    payload: dict[str, Any],
    *,
    mode: str,
    n02_contract: dict[str, Any] | None = None,
) -> dict[str, int]:
    _exact(
        payload,
        {
            "schema_version",
            "contract_revision",
            "status",
            "implementation_kind",
            "scope",
            "transport",
            "source_access",
            "lease_and_demand",
            "query_behavior",
            "bounds",
            "runtime",
        },
        "implementation profile",
    )
    if payload["schema_version"] != "portal.execution.d4.incremental-implementation-profile.v1":
        raise ImplementationError("implementation profile schema version mismatch")
    if payload["contract_revision"] != "d4.paper-read.v2":
        raise ImplementationError("N03 implementation is not bound to d4.paper-read.v2")
    statuses = {
        "template": {"REQUEST_EXAMPLE_NOT_OWNER_PUBLISHED"},
        "candidate": {"OWNER_DRAFT", "OWNER_PUBLISHED"},
        "acceptance": {"OWNER_PUBLISHED"},
    }[mode]
    if payload["status"] not in statuses:
        raise ImplementationError("implementation publication status is invalid for this mode")
    if payload["implementation_kind"] not in {
        "NATIVE_OUTBOX",
        "DEMAND_DRIVEN_INCREMENTAL_FACADE",
    }:
        raise ImplementationError("implementation kind is not an accepted source-owned design")

    scope = _object(payload["scope"], "implementation scope")
    if scope != {
        "scope_id": "PAPER_BINANCE_USDM",
        "mode": "paper",
        "venue": "BINANCE",
        "caller_selectable": False,
    }:
        raise ImplementationError("implementation widened the fixed Paper scope")

    transport = _object(payload["transport"], "implementation transport")
    _exact(
        transport,
        {
            "host_publication",
            "source_proxy_mtls_only",
            "identity_mandatory",
            "methods",
            "routes",
        },
        "implementation transport",
    )
    expected_routes = ["/v2/events"]
    if n02_contract is not None:
        contract_transport = _object(n02_contract["transport"], "accepted N02 transport")
        contract_routes = _object(contract_transport["routes"], "accepted N02 routes")
        expected_routes = sorted(set(contract_routes.values()))
    if (
        transport["host_publication"] != "LOOPBACK_ONLY"
        or transport["source_proxy_mtls_only"] is not True
        or transport["identity_mandatory"] is not True
        or transport["methods"] != ["GET"]
        or sorted(transport["routes"]) != expected_routes
    ):
        raise ImplementationError("implementation widened listener, identity, method or route")

    source_access = _object(payload["source_access"], "source access")
    _exact(
        source_access,
        {
            "dedicated_read_identity",
            "default_transaction_read_only",
            "portal_receives_database_credential",
            "portal_receives_redis_or_cli_authority",
        },
        "source access",
    )
    if source_access != {
        "dedicated_read_identity": True,
        "default_transaction_read_only": True,
        "portal_receives_database_credential": False,
        "portal_receives_redis_or_cli_authority": False,
    }:
        raise ImplementationError("source access is not dedicated and read-only")

    lease = _object(payload["lease_and_demand"], "lease and demand")
    _exact(
        lease,
        {
            "consumer_lease_required",
            "no_background_scan_without_active_lease",
            "source_selects_after_lease_expiry",
            "lease_attributed_metrics",
        },
        "lease and demand",
    )
    if lease != {
        "consumer_lease_required": True,
        "no_background_scan_without_active_lease": True,
        "source_selects_after_lease_expiry": 0,
        "lease_attributed_metrics": True,
    }:
        raise ImplementationError("implementation does not become source-idle after lease expiry")

    query = _object(payload["query_behavior"], "query behavior")
    _exact(
        query,
        {
            "ordinary_delta_request_full_scan",
            "baseline_only_on_new_epoch_or_resync",
            "deletes_use_tombstones",
            "cursor_advance_after_durable_page_ack",
        },
        "query behavior",
    )
    if query != {
        "ordinary_delta_request_full_scan": False,
        "baseline_only_on_new_epoch_or_resync": True,
        "deletes_use_tombstones": True,
        "cursor_advance_after_durable_page_ack": True,
    }:
        raise ImplementationError("implementation scan, tombstone or cursor behavior is unsafe")

    bounds = _object(payload["bounds"], "implementation bounds")
    expected_bounds = {
        "maximum_page_rows": 10_000,
        "maximum_response_bytes": 1 << 30,
        "maximum_requests_per_minute": 100_000,
        "maximum_in_flight_requests": 128,
        "maximum_queue_depth": 1_000_000,
        "maximum_rss_bytes": 1 << 34,
        "maximum_source_rows_scanned_per_returned_row": 100_000,
    }
    _exact(bounds, set(expected_bounds), "implementation bounds")
    normalized = {
        key: _positive_int(bounds[key], key, maximum)
        for key, maximum in expected_bounds.items()
    }
    if n02_contract is not None:
        contract_limits = _object(n02_contract["limits"], "accepted N02 limits")
        cross_limits = {
            "maximum_page_rows": "maximum_page_rows",
            "maximum_response_bytes": "maximum_response_bytes",
            "maximum_requests_per_minute": "maximum_requests_per_minute",
            "maximum_in_flight_requests": "maximum_in_flight_requests",
        }
        if any(
            normalized[profile_key] > contract_limits[contract_key]
            for profile_key, contract_key in cross_limits.items()
        ):
            raise ImplementationError("implementation bounds exceed the accepted N02 contract")

    runtime = _object(payload["runtime"], "implementation runtime")
    _exact(
        runtime,
        {
            "non_root",
            "read_only_root_filesystem",
            "capabilities_dropped",
            "automatic_restart_outside_owner_window",
            "bounded_logs",
        },
        "implementation runtime",
    )
    if runtime != {
        "non_root": True,
        "read_only_root_filesystem": True,
        "capabilities_dropped": True,
        "automatic_restart_outside_owner_window": False,
        "bounded_logs": True,
    }:
        raise ImplementationError("implementation runtime isolation is incomplete")
    return normalized


def validate_metrics(payload: dict[str, Any], *, mode: str, bounds: dict[str, int]) -> None:
    _exact(
        payload,
        {
            "schema_version",
            "contract_revision",
            "synthetic_example",
            "observation",
            "within_declared_bounds",
            "contains_business_data",
        },
        "source metrics",
    )
    if (
        payload["schema_version"] != "portal.execution.d4.incremental-source-metrics.v1"
        or payload["contract_revision"] != "d4.paper-read.v2"
    ):
        raise ImplementationError("source metrics identity mismatch")
    if mode == "template" and payload["synthetic_example"] is not True:
        raise ImplementationError("request metrics must remain synthetic")
    if mode != "template" and payload["synthetic_example"] is not False:
        raise ImplementationError("owner metrics cannot be the request example")
    if payload["within_declared_bounds"] is not True or payload["contains_business_data"] is not False:
        raise ImplementationError("source metrics are out of bounds or contain business data")
    observation = _object(payload["observation"], "source observation")
    names = {
        "idle_after_lease_expiry_seconds",
        "idle_source_select_delta",
        "idle_source_bytes_read_delta",
        "active_request_count",
        "p50_freshness_ms",
        "p95_freshness_ms",
        "p99_freshness_ms",
        "peak_rss_bytes",
        "peak_in_flight_requests",
        "peak_queue_depth",
        "maximum_rows_scanned_per_returned_row",
        "full_baseline_count",
        "ordinary_delta_full_scan_count",
        "source_error_count",
    }
    _exact(observation, names, "source observation")
    for name in names:
        if type(observation[name]) is not int or observation[name] < 0:
            raise ImplementationError(f"source metric {name} must be a non-negative integer")
    if observation["idle_source_select_delta"] != 0 or observation["idle_source_bytes_read_delta"] != 0:
        raise ImplementationError("idle lease-expired source activity is non-zero")
    if observation["ordinary_delta_full_scan_count"] != 0:
        raise ImplementationError("ordinary delta requests performed a full scan")
    if not (
        observation["p50_freshness_ms"]
        <= observation["p95_freshness_ms"]
        <= observation["p99_freshness_ms"]
    ):
        raise ImplementationError("freshness percentiles are not monotonic")
    if observation["peak_rss_bytes"] > bounds["maximum_rss_bytes"]:
        raise ImplementationError("observed RSS exceeds the declared bound")
    if observation["peak_in_flight_requests"] > bounds["maximum_in_flight_requests"]:
        raise ImplementationError("observed in-flight requests exceed the declared bound")
    if observation["peak_queue_depth"] > bounds["maximum_queue_depth"]:
        raise ImplementationError("observed queue depth exceeds the declared bound")
    if (
        observation["maximum_rows_scanned_per_returned_row"]
        > bounds["maximum_source_rows_scanned_per_returned_row"]
    ):
        raise ImplementationError("observed scan amplification exceeds the declared bound")
    if mode == "acceptance" and (
        observation["idle_after_lease_expiry_seconds"] < 1800
        or observation["active_request_count"] < 100
        or observation["full_baseline_count"] != 1
        or observation["source_error_count"] != 0
    ):
        raise ImplementationError("owner observation is too short, incomplete or contains errors")


def validate_query_evidence(payload: dict[str, Any], *, mode: str) -> None:
    _exact(
        payload,
        {
            "schema_version",
            "contract_revision",
            "synthetic_example",
            "contains_sql_or_business_values",
            "entities",
        },
        "query-plan evidence",
    )
    if (
        payload["schema_version"]
        != "portal.execution.d4.incremental-query-plan-evidence.v1"
        or payload["contract_revision"] != "d4.paper-read.v2"
        or payload["contains_sql_or_business_values"] is not False
    ):
        raise ImplementationError("query-plan evidence identity or redaction is invalid")
    if mode == "template" and payload["synthetic_example"] is not True:
        raise ImplementationError("request query evidence must remain synthetic")
    if mode != "template" and payload["synthetic_example"] is not False:
        raise ImplementationError("owner query evidence cannot be the request example")
    entities = payload["entities"]
    if not isinstance(entities, list) or len(entities) != 3:
        raise ImplementationError("query-plan evidence must cover exactly three entities")
    seen: set[str] = set()
    for value in entities:
        item = _object(value, "query-plan entity")
        _exact(
            item,
            {
                "entity",
                "plan_sha256",
                "incremental_key_reviewed",
                "ordinary_delta_seq_scan",
                "within_declared_amplification",
            },
            "query-plan entity",
        )
        entity = item["entity"]
        if entity not in {"orders", "fills", "positions"} or entity in seen:
            raise ImplementationError("query-plan entity set is invalid")
        seen.add(entity)
        if not isinstance(item["plan_sha256"], str) or not SHA256.fullmatch(item["plan_sha256"]):
            raise ImplementationError("query-plan evidence digest is malformed")
        if mode != "template" and item["plan_sha256"] == ZERO_SHA256:
            raise ImplementationError("owner query-plan evidence digest is a placeholder")
        if (
            item["incremental_key_reviewed"] is not True
            or item["ordinary_delta_seq_scan"] is not False
            or item["within_declared_amplification"] is not True
        ):
            raise ImplementationError("query-plan evidence does not prove bounded incremental access")


ACCEPTANCE_CASES = {
    "dedicated_identity_positive",
    "missing_wrong_revoked_identity_denied",
    "get_only_fixed_scope",
    "lease_expiry_zero_source_selects",
    "baseline_watermark_counts",
    "ordered_incremental_upsert",
    "delete_tombstone",
    "duplicate_replay_idempotent",
    "cursor_ahead_expired_gap_fail_closed",
    "new_building_epoch_resync",
    "restart_recovery",
    "source_loss_recovery",
    "rate_memory_queue_backpressure_bounds",
    "rollback_to_dormant_v1_compatible_state",
}


def validate_results(payload: dict[str, Any], *, mode: str) -> None:
    _exact(
        payload,
        {"schema_version", "contract_revision", "synthetic_non_business_data", "cases"},
        "acceptance results",
    )
    if (
        payload["schema_version"]
        != "portal.execution.d4.incremental-implementation-acceptance.v1"
        or payload["contract_revision"] != "d4.paper-read.v2"
        or payload["synthetic_non_business_data"] is not True
    ):
        raise ImplementationError("acceptance results identity is invalid")
    cases = payload["cases"]
    if not isinstance(cases, list) or len(cases) != len(ACCEPTANCE_CASES):
        raise ImplementationError("implementation acceptance corpus is incomplete")
    seen: set[str] = set()
    for value in cases:
        item = _object(value, "acceptance case")
        _exact(item, {"name", "passed", "evidence_sha256"}, "acceptance case")
        name = item["name"]
        if name not in ACCEPTANCE_CASES or name in seen:
            raise ImplementationError("implementation acceptance case set is invalid")
        seen.add(name)
        if type(item["passed"]) is not bool:
            raise ImplementationError("implementation acceptance result must be boolean")
        if not isinstance(item["evidence_sha256"], str) or not SHA256.fullmatch(
            item["evidence_sha256"]
        ):
            raise ImplementationError("implementation acceptance digest is malformed")
        if mode == "template" and (item["passed"] is not False or item["evidence_sha256"] != ZERO_SHA256):
            raise ImplementationError("request template accidentally claims implementation evidence")
        if mode == "acceptance" and (item["passed"] is not True or item["evidence_sha256"] == ZERO_SHA256):
            raise ImplementationError("owner implementation acceptance case is not proven")


def _validate_authority(payload: dict[str, Any]) -> None:
    expected = {
        "implementation_evidence_only",
        "portal_activation",
        "network_change",
        "database_credential_handoff",
        "redis",
        "cli",
        "broker",
        "command",
        "mutation",
        "live",
        "canary",
    }
    _exact(payload, expected, "implementation authority")
    if payload["implementation_evidence_only"] is not True or any(
        payload[key] is not False for key in expected - {"implementation_evidence_only"}
    ):
        raise ImplementationError("N03 evidence widened Portal or trading authority")


def validate_manifest(
    payload: dict[str, Any],
    pack_dir: pathlib.Path,
    *,
    mode: str,
    n02_result: dict[str, Any],
) -> None:
    _exact(
        payload,
        {
            "schema_version",
            "contract_revision",
            "published_at_utc",
            "source_implementation_commit",
            "image_digest",
            "image_platform",
            "contract_sha256",
            "n02_owner_pack_manifest_sha256",
            "owner_id",
            "owner_accepted",
            "owner_acceptance_evidence_sha256",
            "files",
            "authority",
        },
        "owner implementation manifest",
    )
    if (
        payload["schema_version"]
        != "portal.execution.d4.incremental-implementation-owner-pack.v1"
        or payload["contract_revision"] != "d4.paper-read.v2"
        or payload["image_platform"] != "linux/amd64"
    ):
        raise ImplementationError("owner implementation manifest identity mismatch")
    _utc_timestamp(payload["published_at_utc"], "implementation published_at_utc")
    if not isinstance(payload["owner_id"], str) or not SAFE_ID.fullmatch(payload["owner_id"]):
        raise ImplementationError("implementation owner ID is malformed")
    if type(payload["owner_accepted"]) is not bool:
        raise ImplementationError("implementation owner acceptance must be boolean")
    if mode == "acceptance" and payload["owner_accepted"] is not True:
        raise ImplementationError("Trading System owner has not accepted the implementation")
    if (
        not isinstance(payload["source_implementation_commit"], str)
        or not COMMIT.fullmatch(payload["source_implementation_commit"])
        or payload["source_implementation_commit"] == ZERO_COMMIT
    ):
        raise ImplementationError("source implementation commit is absent or malformed")
    for key in (
        "image_digest",
        "contract_sha256",
        "n02_owner_pack_manifest_sha256",
        "owner_acceptance_evidence_sha256",
    ):
        if not isinstance(payload[key], str) or not SHA256.fullmatch(payload[key]):
            raise ImplementationError(f"{key} is not a SHA-256 identity")
    if payload["image_digest"] == ZERO_SHA256:
        raise ImplementationError("source implementation image digest is a placeholder")
    if mode == "acceptance" and payload["owner_acceptance_evidence_sha256"] == ZERO_SHA256:
        raise ImplementationError("implementation owner acceptance evidence is a placeholder")
    if payload["contract_sha256"] != n02_result["capability_contract_sha256"]:
        raise ImplementationError("implementation is not bound to the accepted N02 contract")
    if payload["n02_owner_pack_manifest_sha256"] != n02_result["owner_pack_manifest_sha256"]:
        raise ImplementationError("implementation is not bound to the accepted N02 owner pack")
    files = _object(payload["files"], "implementation manifest files")
    if set(files) != PACK_FILES:
        raise ImplementationError("implementation manifest file set is not exact")
    for name, expected in files.items():
        if not isinstance(expected, str) or not SHA256.fullmatch(expected) or expected == ZERO_SHA256:
            raise ImplementationError("implementation manifest contains a missing file digest")
        if digest(pack_dir / name) != expected:
            raise ImplementationError("implementation evidence byte digest mismatch")
    _validate_authority(_object(payload["authority"], "implementation authority"))


def validate_template() -> dict[str, Any]:
    manifest = read_json(REQUEST_DIRECTORY / "owner-implementation.manifest.example.json")
    profile = read_json(REQUEST_DIRECTORY / "implementation-profile.example.json")
    metrics = read_json(REQUEST_DIRECTORY / "source-metrics.example.json")
    query = read_json(REQUEST_DIRECTORY / "query-plan-evidence.example.json")
    results = read_json(REQUEST_DIRECTORY / "acceptance-results.example.json")
    bounds = validate_profile(profile, mode="template")
    validate_metrics(metrics, mode="template", bounds=bounds)
    validate_query_evidence(query, mode="template")
    validate_results(results, mode="template")
    if (
        manifest.get("owner_accepted") is not False
        or manifest.get("source_implementation_commit") != ZERO_COMMIT
        or any(
            manifest.get(key) != ZERO_SHA256
            for key in (
                "image_digest",
                "contract_sha256",
                "n02_owner_pack_manifest_sha256",
                "owner_acceptance_evidence_sha256",
            )
        )
        or any(
            value != ZERO_SHA256
            for value in _object(manifest.get("files"), "template implementation files").values()
        )
    ):
        raise ImplementationError("request template accidentally claims owner implementation")
    _validate_authority(_object(manifest.get("authority"), "template implementation authority"))
    return {
        "decision": "N03_IMPLEMENTATION_REQUEST_TEMPLATE_VALID",
        "contract_revision": "d4.paper-read.v2",
        "owner_accepted": False,
        "runtime_active": False,
    }


def _accepted_n02(pack_dir: pathlib.Path) -> dict[str, Any]:
    try:
        return N02.validate_pack(pack_dir, mode="acceptance")
    except N02.ContractError as exc:
        raise ImplementationError(f"accepted N02 owner pack is required: {exc}") from exc


def validate_pack(
    pack_dir: pathlib.Path, *, mode: str, n02_pack_dir: pathlib.Path
) -> dict[str, Any]:
    for path, label in ((pack_dir, "N03"), (n02_pack_dir, "N02")):
        if not path.is_absolute() or ".." in path.parts:
            raise ImplementationError(f"{label} pack path must be absolute and non-traversing")
    n02_result = _accepted_n02(n02_pack_dir)
    n02_contract = N02.read_json(n02_pack_dir / "incremental-contract.json")
    try:
        entries = {path.name for path in pack_dir.iterdir()}
    except OSError as exc:
        raise ImplementationError("owner implementation directory is unreadable") from exc
    if entries != PACK_FILES | {"owner-implementation.manifest.json"}:
        raise ImplementationError("owner implementation directory has missing or unexpected files")
    manifest = read_json(pack_dir / "owner-implementation.manifest.json")
    profile = read_json(pack_dir / "implementation-profile.json")
    metrics = read_json(pack_dir / "source-metrics.json")
    query = read_json(pack_dir / "query-plan-evidence.json")
    results = read_json(pack_dir / "acceptance-results.json")
    bounds = validate_profile(profile, mode=mode, n02_contract=n02_contract)
    validate_metrics(metrics, mode=mode, bounds=bounds)
    validate_query_evidence(query, mode=mode)
    validate_results(results, mode=mode)
    validate_manifest(manifest, pack_dir, mode=mode, n02_result=n02_result)
    return {
        "decision": (
            "N03_OWNER_IMPLEMENTATION_ACCEPTED"
            if mode == "acceptance"
            else "N03_OWNER_IMPLEMENTATION_CANDIDATE_VALID"
        ),
        "contract_revision": "d4.paper-read.v2",
        "source_implementation_commit": manifest["source_implementation_commit"],
        "image_digest": manifest["image_digest"],
        "owner_accepted": manifest["owner_accepted"],
        "runtime_active": False,
        "source_call": False,
        "portal_activation": False,
    }


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("--mode", choices=("template", "candidate", "acceptance"), required=True)
    value.add_argument("--pack-dir", type=pathlib.Path)
    value.add_argument("--n02-pack-dir", type=pathlib.Path)
    return value


def main() -> int:
    arguments = parser().parse_args()
    try:
        if arguments.mode == "template":
            if arguments.pack_dir is not None or arguments.n02_pack_dir is not None:
                raise ImplementationError("template mode does not accept external packs")
            result = validate_template()
        else:
            if arguments.pack_dir is None or arguments.n02_pack_dir is None:
                raise ImplementationError("candidate and acceptance modes require both pack paths")
            result = validate_pack(
                arguments.pack_dir,
                mode=arguments.mode,
                n02_pack_dir=arguments.n02_pack_dir,
            )
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        return 0
    except ImplementationError as exc:
        print(f"N03 implementation verification: REJECTED ({exc})", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
