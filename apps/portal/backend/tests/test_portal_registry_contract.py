from __future__ import annotations

import copy
import hashlib
import json
from collections import Counter
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource


PORTAL_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = PORTAL_ROOT.parents[1]
REGISTRY_ROOT = PORTAL_ROOT / "registry"
SCHEMA_ROOT = REGISTRY_ROOT / "schemas"
SOURCE_PATH = REGISTRY_ROOT / "registry.json"
SCHEMA_PATHS = {
    "source": SCHEMA_ROOT / "portal-registry-source.v1.schema.json",
    "public": SCHEMA_ROOT / "portal-registry.v1.schema.json",
    "summary": SCHEMA_ROOT / "portal-summary.v1.schema.json",
}

EXECUTION_LOOP_REVISION_4_ROUTES = {
    "EXECUTION_COMMAND_CENTER_SCREEN": "/execution",
    "EXECUTION_OPERATIONS_QUEUE_SCREEN": "/execution/operations",
    "EXECUTION_INCIDENT_DETAIL_SCREEN": "/execution/operations/incidents/:incidentId",
    "EXECUTION_APPROVAL_INBOX_SCREEN": "/governance/approvals",
    "EXECUTION_GATE_R1_REVIEW_SCREEN": "/governance/approvals/:approvalId/r1",
    "EXECUTION_GATE_R2_REVIEW_SCREEN": "/governance/approvals/:approvalId/r2",
    "EXECUTION_PAPER_EXIT_REVIEW_SCREEN": "/governance/exit-reviews/:reviewId",
    "EXECUTION_PAPER_WORKBENCH_SCREEN": "/deployments/paper/:deploymentId",
    "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN": "/deployments/paper/:deploymentId/vn-market",
    "EXECUTION_SANDBOX_CERTIFICATION_SCREEN": "/deployments/sandbox/:deploymentId",
    "EXECUTION_CANARY_CONTROL_ROOM_SCREEN": "/deployments/live/:deploymentId/canary",
    "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN": "/deployments/live/:deploymentId",
    "EXECUTION_FULL_BLOTTER_SCREEN": "/deployments/blotter",
    "EXECUTION_ALPHA_360_SCREEN": "/deployments/alphas/:alphaId",
    "EXECUTION_PORTFOLIO_360_SCREEN": "/deployments/portfolios/:portfolioId",
    "EXECUTION_ACCOUNT_BROKER_360_SCREEN": "/deployments/accounts/:accountId",
    "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN": "/administration/actions",
}
DELIVERY_POLICY_FLAGS = {
    "query_enabled",
    "projection_ingestion_enabled",
    "sse_enabled",
    "paper_commands_enabled",
    "sandbox_commands_enabled",
    "live_protective_commands_enabled",
    "live_risk_increasing_commands_enabled",
}


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


SCHEMAS = {name: _load_json(path) for name, path in SCHEMA_PATHS.items()}
SCHEMA_REGISTRY = Registry().with_resources(
    (schema["$id"], Resource.from_contents(schema)) for schema in SCHEMAS.values()
)
FORMAT_CHECKER = FormatChecker()


def _validator(name: str) -> Draft202012Validator:
    return Draft202012Validator(
        SCHEMAS[name],
        registry=SCHEMA_REGISTRY,
        format_checker=FORMAT_CHECKER,
    )


def _validation_errors(name: str, document: dict[str, Any]) -> list[str]:
    errors = sorted(_validator(name).iter_errors(document), key=lambda item: list(item.path))
    return [f"{error.json_path}: {error.message}" for error in errors]


def _assert_valid(name: str, document: dict[str, Any]) -> None:
    assert not (errors := _validation_errors(name, document)), "\n".join(errors)


def _canonical_digest(document: dict[str, Any]) -> str:
    encoded = json.dumps(
        document,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _normalize_route(route: str) -> str:
    path = route.split("?", 1)[0]
    return path if path == "/" else path.rstrip("/")


def _duplicates(values: list[object]) -> set[object]:
    counts = Counter(values)
    return {value for value, count in counts.items() if count > 1}


def _invariant_errors(source: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    groups = {item["id"]: item for item in source["feature_groups"]}
    features = {item["id"]: item for item in source["features"]}
    screens = {item["screen_id"]: item for item in source["screens"]}
    concerns = {item["id"]: item for item in source["concerns"]}
    lifecycle = {item["id"]: item for item in source["lifecycle_stages"]}

    collections = {
        "feature group": [item["id"] for item in source["feature_groups"]],
        "feature": [item["id"] for item in source["features"]],
        "screen": [item["screen_id"] for item in source["screens"]],
        "concern": [item["id"] for item in source["concerns"]],
        "lifecycle": [item["id"] for item in source["lifecycle_stages"]],
    }
    for label, values in collections.items():
        if duplicates := _duplicates(values):
            errors.append(f"duplicate {label} IDs: {sorted(duplicates)}")

    group_orders = [item["order"] for item in source["feature_groups"]]
    if duplicates := _duplicates(group_orders):
        errors.append(f"duplicate feature-group orders: {sorted(duplicates)}")
    lifecycle_orders = [item["order"] for item in source["lifecycle_stages"]]
    if duplicates := _duplicates(lifecycle_orders):
        errors.append(f"duplicate lifecycle orders: {sorted(duplicates)}")

    all_feature_routes: list[tuple[str, str]] = []
    for feature in source["features"]:
        feature_id = feature["id"]
        all_feature_routes.append((_normalize_route(feature["canonical_route"]), feature_id))
        all_feature_routes.extend(
            (_normalize_route(route), feature_id) for route in feature["legacy_routes"]
        )
        if feature["group"] not in groups:
            errors.append(f"feature {feature_id} references unknown group {feature['group']}")
        for key, available in (
            ("screen_ids", screens),
            ("concern_ids", concerns),
            ("lifecycle_stage_ids", lifecycle),
        ):
            for reference in feature[key]:
                if reference not in available:
                    errors.append(f"feature {feature_id} has dangling {key}: {reference}")
        if feature["source_module"] is not None and not (
            REPO_ROOT / feature["source_module"]
        ).is_dir():
            errors.append(
                f"feature {feature_id} source module does not exist: {feature['source_module']}"
            )

    route_owners: dict[str, str] = {}
    for route, feature_id in all_feature_routes:
        if previous := route_owners.get(route):
            errors.append(f"feature route collision {route}: {previous}, {feature_id}")
        route_owners[route] = feature_id

    screen_routes = [_normalize_route(item["route"]) for item in source["screens"]]
    if duplicates := _duplicates(screen_routes):
        errors.append(f"duplicate screen routes: {sorted(duplicates)}")

    visible_nav = [
        (item["group"], item["navigation"]["order"])
        for item in source["features"]
        if item["maturity"] not in {"HIDDEN", "DEPRECATED"}
    ]
    if duplicates := _duplicates(visible_nav):
        errors.append(f"duplicate visible navigation positions: {sorted(duplicates)}")

    screens_by_feature: dict[str, set[str]] = {feature_id: set() for feature_id in features}
    for screen in source["screens"]:
        screen_id = screen["screen_id"]
        feature_id = screen["feature_id"]
        if feature_id not in features:
            errors.append(f"screen {screen_id} references unknown feature {feature_id}")
            continue
        screens_by_feature[feature_id].add(screen_id)
        for concern_id in screen["concern_ids"]:
            if concern_id not in concerns:
                errors.append(f"screen {screen_id} references unknown concern {concern_id}")
            elif screen_id not in concerns[concern_id]["screen_ids"]:
                errors.append(
                    f"screen {screen_id} concern {concern_id} is not reciprocally linked"
                )

    for feature_id, feature in features.items():
        if set(feature["screen_ids"]) != screens_by_feature[feature_id]:
            errors.append(f"feature {feature_id} screen links are not symmetric")
        for concern_id in feature["concern_ids"]:
            if concern_id in concerns and feature_id not in concerns[concern_id]["feature_ids"]:
                errors.append(
                    f"feature {feature_id} concern {concern_id} is not reciprocally linked"
                )

    for concern_id, concern in concerns.items():
        for feature_id in concern["feature_ids"]:
            if feature_id not in features:
                errors.append(f"concern {concern_id} references unknown feature {feature_id}")
            elif concern_id not in features[feature_id]["concern_ids"]:
                errors.append(
                    f"concern {concern_id} feature {feature_id} is not reciprocally linked"
                )
        for screen_id in concern["screen_ids"]:
            if screen_id not in screens:
                errors.append(f"concern {concern_id} references unknown screen {screen_id}")
            elif concern_id not in screens[screen_id]["concern_ids"]:
                errors.append(
                    f"concern {concern_id} screen {screen_id} is not reciprocally linked"
                )
        for evidence_ref in concern["evidence_refs"]:
            evidence_path = evidence_ref.split("#", 1)[0]
            if evidence_path and not (REPO_ROOT / evidence_path).is_file():
                errors.append(f"concern {concern_id} evidence does not exist: {evidence_path}")

    for lifecycle_id, stage in lifecycle.items():
        for feature_id in stage["feature_ids"]:
            if feature_id not in features:
                errors.append(
                    f"lifecycle {lifecycle_id} references unknown feature {feature_id}"
                )
            elif lifecycle_id not in features[feature_id]["lifecycle_stage_ids"]:
                errors.append(
                    f"lifecycle {lifecycle_id} feature {feature_id} is not reciprocally linked"
                )

    return errors


def _availability(state: str, *, reason_code: str | None = None) -> dict[str, Any]:
    return {
        "state": state,
        "reason_code": reason_code,
        "detail": None if reason_code is None else "Safe availability detail.",
        "retryable": state in {"unavailable", "degraded", "stale"},
        "checked_at": "2026-08-15T12:00:00Z",
        "as_of": "2026-08-15T11:59:59Z" if state == "available" else None,
        "stale_after_seconds": 30,
        "authority": {
            "service": "portal-api",
            "contract": "portal.summary.v1",
            "endpoint": "/api/runs",
        },
        "provenance": {"source_revision": "1", "content_digest": None},
    }


def _summary_fixture(source: dict[str, Any]) -> dict[str, Any]:
    maturity_counts = Counter(feature["maturity"] for feature in source["features"])
    blocking = sum(
        concern["severity"] == "BLOCKING"
        and concern["status"] in {"OPEN", "PARTIAL", "BLOCKED"}
        for concern in source["concerns"]
    )
    return {
        "schema_version": "portal.summary.v1",
        "registry_digest": _canonical_digest(source),
        "environment": "research",
        "requested_at": "2026-08-15T12:00:00Z",
        "completed_at": "2026-08-15T12:00:00.100000Z",
        "overall_availability": _availability("degraded", reason_code="PARTIAL_SOURCE_FAILURE"),
        "registry_counts": {
            "by_maturity": {
                maturity: maturity_counts.get(maturity, 0)
                for maturity in (
                    "AVAILABLE",
                    "PROTOTYPE",
                    "COMMISSIONED",
                    "BLOCKED",
                    "HIDDEN",
                    "DEPRECATED",
                )
            },
            "blocking_concerns": blocking,
        },
        "sections": [
            {
                "source_id": "quantbt_current",
                "feature_id": "QUANTBT_RESEARCH",
                "label": "QuantBT Backtest",
                "availability": _availability("available"),
                "metrics": {
                    "total_runs": {
                        "availability": _availability("available"),
                        "value": 0,
                        "unit": "runs",
                        "timezone": "UTC",
                        "segment": None,
                        "source_artifact_digest": None,
                    }
                },
                "recent_items": [],
                "warnings": [],
            },
            {
                "source_id": "planning_current",
                "feature_id": "PLANNING",
                "label": "Roadmap & Task Board",
                "availability": _availability("unavailable", reason_code="LOCAL_ONLY_STATE"),
                "metrics": {
                    "task_count": {
                        "availability": _availability(
                            "unavailable", reason_code="LOCAL_ONLY_STATE"
                        ),
                        "value": None,
                        "unit": "tasks",
                        "timezone": "UTC",
                        "segment": None,
                        "source_artifact_digest": None,
                    }
                },
                "recent_items": [],
                "warnings": [],
            },
        ],
        "priority_items": [],
    }


def test_json_schemas_are_valid_draft_2020_12() -> None:
    for schema in SCHEMAS.values():
        Draft202012Validator.check_schema(schema)


def test_canonical_registry_source_and_public_document_validate() -> None:
    source = _load_json(SOURCE_PATH)
    assert "content_digest" not in source
    _assert_valid("source", source)

    digest = _canonical_digest(source)
    assert digest == _canonical_digest(copy.deepcopy(source))
    assert digest != _canonical_digest({**source, "revision": source["revision"] + 1})

    public_document = {**source, "content_digest": digest}
    _assert_valid("public", public_document)


def test_revision_4_commissions_execution_routes_with_fail_closed_fixture_policy() -> None:
    source = _load_json(SOURCE_PATH)
    assert source["revision"] == 4
    assert [group["id"] for group in source["feature_groups"][:4]] == [
        "command",
        "governance",
        "deployments",
        "administration",
    ]

    screens = {screen["screen_id"]: screen for screen in source["screens"]}
    assert {
        screen_id: screens[screen_id]["route"]
        for screen_id in EXECUTION_LOOP_REVISION_4_ROUTES
    } == EXECUTION_LOOP_REVISION_4_ROUTES

    for screen_id in EXECUTION_LOOP_REVISION_4_ROUTES:
        screen = screens[screen_id]
        assert screen["contract_revision"] == 2
        assert screen["maturity"] == "COMMISSIONED"
        assert screen["data_mode"] == "NONE"
        assert screen["delivery_profile"] == "fixture"
        assert screen["delivery_policy"]["policy_revision"] == 1
        assert DELIVERY_POLICY_FLAGS <= screen["delivery_policy"].keys()
        assert not any(
            screen["delivery_policy"][flag] for flag in DELIVERY_POLICY_FLAGS
        )
        assert screen["inputs"] == []
        assert screen["backend_dependency_ids"] == []

    for screen in source["screens"]:
        if screen["maturity"] in {"COMMISSIONED", "BLOCKED"}:
            assert screen["delivery_profile"] is not None
            assert screen["delivery_policy"] is not None
        else:
            assert screen["delivery_profile"] is None
            assert screen["delivery_policy"] is None

    features = {feature["id"]: feature for feature in source["features"]}
    assert features["EXECUTION_ADMIN_ACTIONS"]["navigation"]["show_in_sidebar"] is False
    assert "/execution" not in features["QUANTBT_RESEARCH"]["legacy_routes"]


def test_registry_references_routes_and_evidence_are_consistent() -> None:
    source = _load_json(SOURCE_PATH)
    assert not (errors := _invariant_errors(source)), "\n".join(errors)


def test_only_current_real_capabilities_are_marked_available() -> None:
    source = _load_json(SOURCE_PATH)
    available = {
        feature["id"] for feature in source["features"] if feature["maturity"] == "AVAILABLE"
    }
    real = {feature["id"] for feature in source["features"] if feature["data_mode"] == "REAL"}
    assert available == {"QUANTBT_RESEARCH", "PLANNING"}
    # v0.4 P0.6: the Command Center aggregates real counts while the screen
    # itself is still PROTOTYPE — REAL data mode under PROTOTYPE maturity.
    assert real == {"QUANTBT_RESEARCH", "PLANNING", "COMMAND_CENTER"}
    for feature in source["features"]:
        if feature["data_mode"] == "REAL":
            assert feature["maturity"] in {"AVAILABLE", "PROTOTYPE"}
        if feature["maturity"] == "COMMISSIONED":
            assert feature["data_mode"] != "REAL"

    commissioned = {
        "ALPHA_POOL",
        "ALPHA_MINING",
        "STRATEGY_COMPOSER",
        "APPROVALS",
        "DATA_CATALOG",
        "PAPER_TRADING",
        "SANDBOX_TRADING",
        "LIVE_OPERATIONS",
    }
    by_id = {feature["id"]: feature for feature in source["features"]}
    assert all(by_id[feature_id]["maturity"] == "COMMISSIONED" for feature_id in commissioned)
    assert all(not by_id[feature_id]["summary_source_ids"] for feature_id in commissioned)


def test_schema_rejects_unknown_source_field_and_authored_digest() -> None:
    source = _load_json(SOURCE_PATH)
    with_unknown = {**source, "unknown": True}
    with_digest = {**source, "content_digest": _canonical_digest(source)}
    assert _validation_errors("source", with_unknown)
    assert _validation_errors("source", with_digest)


def test_schema_rejects_missing_or_partial_delivery_contract() -> None:
    source = _load_json(SOURCE_PATH)
    commissioned = next(
        screen for screen in source["screens"] if screen["maturity"] == "COMMISSIONED"
    )

    missing = copy.deepcopy(source)
    target = next(
        screen
        for screen in missing["screens"]
        if screen["screen_id"] == commissioned["screen_id"]
    )
    del target["delivery_profile"]
    assert _validation_errors("source", missing)

    partial = copy.deepcopy(source)
    target = next(
        screen
        for screen in partial["screens"]
        if screen["screen_id"] == commissioned["screen_id"]
    )
    del target["delivery_policy"]["live_risk_increasing_commands_enabled"]
    assert _validation_errors("source", partial)


def test_invariants_detect_dangling_reference_and_route_collision() -> None:
    source = _load_json(SOURCE_PATH)

    dangling = copy.deepcopy(source)
    dangling["features"][0]["screen_ids"].append("MISSING_SCREEN")
    assert any("dangling screen_ids" in error for error in _invariant_errors(dangling))

    collision = copy.deepcopy(source)
    collision["features"][1]["canonical_route"] = collision["features"][0][
        "canonical_route"
    ]
    assert any("feature route collision" in error for error in _invariant_errors(collision))


def test_summary_schema_accepts_truthful_partial_fixture() -> None:
    source = _load_json(SOURCE_PATH)
    _assert_valid("summary", _summary_fixture(source))


def test_summary_schema_rejects_healthy_zero_for_unavailable_metric() -> None:
    source = _load_json(SOURCE_PATH)
    summary = _summary_fixture(source)
    summary["sections"][1]["metrics"]["task_count"]["value"] = 0
    errors = _validation_errors("summary", summary)
    assert any("None was expected" in error for error in errors)


def test_summary_schema_rejects_unowned_future_priority() -> None:
    source = _load_json(SOURCE_PATH)
    summary = _summary_fixture(source)
    summary["priority_items"].append(
        {
            "id": "planning:blocker:1",
            "type": "PLANNING_BLOCKER",
            "severity": "warning",
            "title": "Inferred blocker",
            "feature_id": "PLANNING",
            "resource_id": "task-1",
            "observed_at": "2026-08-15T12:00:00Z",
            "authority": "planning_current",
            "route": "/planning/board",
            "evidence_digest": None,
        }
    )
    assert _validation_errors("summary", summary)


@pytest.mark.parametrize("schema_name", ["source", "public", "summary"])
def test_schema_contracts_forbid_additional_properties(schema_name: str) -> None:
    if schema_name == "source":
        document = _load_json(SOURCE_PATH)
    elif schema_name == "public":
        source = _load_json(SOURCE_PATH)
        document = {**source, "content_digest": _canonical_digest(source)}
    else:
        document = _summary_fixture(_load_json(SOURCE_PATH))
    document["unexpected"] = "forbidden"
    assert _validation_errors(schema_name, document)
