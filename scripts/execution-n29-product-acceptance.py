#!/usr/bin/env python3
"""N29 finite campaign product-acceptance verifier.

The verifier is intentionally offline. It binds committed evidence, proves the
complete census disposition and BR-EX-72 delivery, and rejects a product GO
until protected-main image publication has returned evidence.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import re
import stat
import sys
from collections import Counter
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "services/portal-execution-edge-rs/contracts/n29-product-acceptance-v1"
ACCEPTANCE = PACK / "product-acceptance.v1.json"
DEBT = PACK / "debt-register.v1.json"
MANIFEST = PACK / "MANIFEST.sha256"

EVIDENCE_PATHS = {
    "n18_census_sha256": ROOT / "services/portal-execution-edge-rs/contracts/manager-surface-census-v1/manager-surface-census.v1.json",
    "n28_registry_sha256": ROOT / "services/portal-execution-edge-rs/contracts/n28-missing-capability-v1/missing-capability-registry.v1.json",
    "n28_owner_request_sha256": ROOT / "services/portal-execution-edge-rs/contracts/n28-missing-capability-v1/owner-request.v3.json",
    "screen_bff_catalogue_sha256": ROOT / "apps/control-api/src/screen-bff/catalogue.ts",
    "frontend_product_route_sha256": ROOT / "apps/portal/frontend/src/execution/ExecutionPreviewRoute.tsx",
    "frontend_product_boundary_test_sha256": ROOT / "apps/portal/frontend/src/execution/productBoundary.test.ts",
    "frontend_consumer_return_packet_sha256": ROOT / "upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CLAUDE_TO_CODEX_N29_FE_01_RETURN_PACKET.md",
    "frontend_consumer_evidence_sha256": ROOT / "upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/CLAUDE_TO_CODEX_N29_CONSUMER_EVIDENCE.md",
    "frontend_same_origin_bff_double_sha256": ROOT / "apps/portal/frontend/e2e/bffDouble.ts",
    "n17b_real_paper_acceptance_sha256": ROOT / "packages/contracts/fixtures/execution-production-acceptance.current-paper.accepted.json",
    "release_workflow_sha256": ROOT / ".github/workflows/publish-images.yml",
    "recovery_runbook_sha256": ROOT / "deploy/runbooks/portal-n17a-source-dark-production-dr.md",
    "governance_product_migration_sha256": ROOT / "apps/control-api/migrations/1723680000015_execution-product-governance.sql",
    "governance_product_schema_sha256": ROOT / "packages/contracts/schemas/execution-governance-product.v1.schema.json",
    "governance_product_openapi_sha256": ROOT / "packages/contracts/openapi/execution-governance.openapi.json",
    "governance_product_test_sha256": ROOT / "apps/control-api/test/governance-product.spec.ts",
    "br72_schema_sha256": ROOT / "packages/contracts/schemas/execution-manager-lists.v1.schema.json",
    "br72_fleet_v2_schema_sha256": ROOT / "packages/contracts/schemas/execution-alpha-fleet-list.v2.schema.json",
    "br72_openapi_sha256": ROOT / "packages/contracts/openapi/execution-manager-lists.openapi.json",
    "br72_migration_sha256": ROOT / "apps/control-api/migrations/1723680000016_execution-manager-lists.sql",
    "br72_fleet_v2_migration_sha256": ROOT / "apps/control-api/migrations/1723680000017_execution-alpha-fleet-v2.sql",
    "br72_service_sha256": ROOT / "apps/control-api/src/manager-lists/manager-lists.service.ts",
    "br72_repository_sha256": ROOT / "apps/control-api/src/manager-lists/manager-lists.repository.ts",
    "br72_controller_sha256": ROOT / "apps/control-api/src/manager-lists/manager-lists.controller.ts",
    "br72_test_sha256": ROOT / "apps/control-api/test/manager-lists.spec.ts",
    "br72_source_boundary_sha256": ROOT / "apps/control-api/src/execution/current-source.proxy.ts",
    "br76_schema_sha256": ROOT / "packages/contracts/schemas/execution-portfolio-list.v1.schema.json",
    "br76_fixture_sha256": ROOT / "packages/contracts/fixtures/execution-portfolio-list.valid.json",
    "br72_source_boundary_test_sha256": ROOT / "apps/control-api/test/execution-current-source.spec.ts",
    "br72_live_review_fixture_sha256": ROOT / "packages/contracts/fixtures/governance-live-review.valid.json",
    "br72_registry_source_sha256": ROOT / "apps/portal/registry/registry.json",
    "br72_registry_public_sha256": ROOT / "apps/portal/registry/fixtures/registry.public.json",
    "br72_frontend_test_sha256": ROOT / "apps/portal/frontend/src/execution/brEx72.test.tsx",
    "br72_frontend_containers_sha256": ROOT / "apps/portal/frontend/src/execution/screens/profileContainers.tsx",
    "br72_frontend_alpha_fleet_sha256": ROOT / "apps/portal/frontend/src/execution/screens/AlphaFleet.tsx",
    "br72_frontend_recompose_sha256": ROOT / "apps/portal/frontend/src/execution/screens/recomposeContainers.tsx",
    "br72_frontend_registry_sha256": ROOT / "apps/portal/frontend/src/execution/previewRegistry.ts",
}

SENSITIVE = re.compile(
    r"(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|postgres(?:ql)?://[^\s]+:[^\s]+@|redis://[^\s]+@|authorization\s*:\s*bearer|x-api-key\s*:)",
    re.IGNORECASE,
)


class AcceptanceError(ValueError):
    """Stable fail-closed N29 validation error."""


def read_json(path: pathlib.Path) -> dict[str, Any]:
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or info.st_size > 16 * 1024 * 1024:
        raise AcceptanceError(f"unsafe artifact: {path}")
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise AcceptanceError(f"artifact is not an object: {path}")
    return value


def digest(path: pathlib.Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AcceptanceError(message)


def validate_manifest() -> None:
    rows: dict[str, str] = {}
    for line in MANIFEST.read_text(encoding="utf-8").splitlines():
        expected, name = line.split("  ", 1)
        require(name not in rows, "duplicate manifest path")
        require("/" not in name and ".." not in name, "unsafe manifest path")
        rows[name] = expected
    expected_names = {
        "README.md",
        "debt-register.v1.json",
        "product-acceptance.v1.json",
        "product-acceptance.v1.schema.json",
    }
    require(set(rows) == expected_names, "N29 manifest file set drifted")
    for name, expected in rows.items():
        actual = hashlib.sha256((PACK / name).read_bytes()).hexdigest()
        require(actual == expected, f"N29 manifest digest mismatch: {name}")


def validate_inventory(acceptance: dict[str, Any]) -> None:
    census = read_json(EVIDENCE_PATHS["n18_census_sha256"])
    require(census["counts"] == {
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
    }, "N18 count inventory drifted")
    relation_classes = Counter(row["classification"] for row in census["relations"])
    require(relation_classes == {
        "SCREEN_BOUND": 54,
        "PROJECTION_INPUT": 16,
        "AUDIT_ONLY": 13,
        "INTERNAL_ONLY": 13,
    }, "N18 relation disposition drifted")
    require(
        all(row["delivery_phase"] == "N29" for row in census["relations"] if row["classification"] in {"AUDIT_ONLY", "INTERNAL_ONLY"}),
        "N29 internal/audit relation ownership drifted",
    )
    require({row["request_id"] for row in census["commissioned_requests"]} == {f"BR-EX-{n}" for n in range(41, 72)}, "commissioned request set drifted")

    registry = read_json(EVIDENCE_PATHS["n28_registry_sha256"])
    require(registry["counts"] == {
        "alternative_adapters": 13,
        "owner_contract_entries": 9,
        "intentional_exclusions": 3,
        "n27_reclassification_candidates": 5,
    }, "N28 classification drifted")
    require(all(row["typed_unavailable_until_verified"] is True for row in registry["owner_contract_entries"]), "N28 gap became optimistic")

    scope = acceptance["accepted_scope"]
    require(scope["relations"]["total"] == len(census["relations"]), "accepted relation total drifted")
    require(scope["commissioned_requests"]["total"] == len(census["commissioned_requests"]), "accepted request total drifted")
    require(scope["portal_reads"]["total"] == len(census["portal_read_capabilities"]), "accepted read total drifted")
    require(scope["requested_commands"]["total"] == len(census["requested_command_capabilities"]), "accepted command total drifted")


def validate_screen_and_ui(acceptance: dict[str, Any]) -> None:
    catalogue = EVIDENCE_PATHS["screen_bff_catalogue_sha256"].read_text(encoding="utf-8")
    require(catalogue.count("screen({") == 23, "screen catalogue size drifted")
    require(catalogue.count('status: "AVAILABLE"') == 23, "available screen count drifted")
    require(catalogue.count('status: "TYPED_UNAVAILABLE"') == 0, "unavailable screen count drifted")
    request_ids = set(re.findall(r"BR-EX-\d{2}", catalogue))
    require({request_id for request_id in request_ids if 41 <= int(request_id[-2:]) <= 71} == {f"BR-EX-{n}" for n in range(41, 72)}, "screen request coverage drifted")
    expected_base_mapping = {
        "PAPER_TRADING_SCREEN": ["BR-EX-41"],
        "SANDBOX_TRADING_SCREEN": ["BR-EX-60"],
        "LIVE_OPERATIONS_SCREEN": ["BR-EX-56"],
        "EXECUTION_COMMAND_CENTER_SCREEN": ["BR-EX-42", "BR-EX-43", "BR-EX-44", "BR-EX-45"],
        "EXECUTION_OPERATIONS_QUEUE_SCREEN": ["BR-EX-47"],
        "EXECUTION_INCIDENT_DETAIL_SCREEN": ["BR-EX-46"],
        "EXECUTION_APPROVAL_INBOX_SCREEN": ["BR-EX-35"],
        "EXECUTION_GATE_R1_REVIEW_SCREEN": ["BR-EX-67"],
        "EXECUTION_GATE_R2_REVIEW_SCREEN": ["BR-EX-67"],
        "EXECUTION_PAPER_EXIT_REVIEW_SCREEN": ["BR-EX-63"],
        "EXECUTION_PAPER_WORKBENCH_SCREEN": ["BR-EX-62"],
        "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN": ["BR-EX-62"],
        "EXECUTION_SANDBOX_CERTIFICATION_SCREEN": ["BR-EX-60", "BR-EX-61"],
        "EXECUTION_CANARY_CONTROL_ROOM_SCREEN": ["BR-EX-59"],
        "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN": ["BR-EX-57"],
        "EXECUTION_FULL_BLOTTER_SCREEN": ["BR-EX-48"],
        "EXECUTION_ALPHA_360_SCREEN": ["BR-EX-49", "BR-EX-50", "BR-EX-64"],
        "EXECUTION_PORTFOLIO_360_SCREEN": ["BR-EX-51", "BR-EX-65", "BR-EX-66"],
        "EXECUTION_ACCOUNT_BROKER_360_SCREEN": ["BR-EX-52", "BR-EX-53", "BR-EX-54"],
        "EXECUTION_ADMIN_ACTION_DRAWER_SCREEN": ["BR-EX-68"],
        "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN": ["BR-EX-69"],
        "EXECUTION_GATE_LIVE_REVIEW_SCREEN": ["BR-EX-70"],
        "EXECUTION_WAIVERS_REGISTER_SCREEN": ["BR-EX-71"],
    }
    for screen_id, expected in expected_base_mapping.items():
        row = next((line for line in catalogue.splitlines() if f'screenId: "{screen_id}"' in line), None)
        require(row is not None, f"screen mapping missing: {screen_id}")
        match = re.search(r"requestIds: \[([^]]*)\]", row)
        require(match is not None, f"screen request mapping malformed: {screen_id}")
        require(re.findall(r"BR-EX-\d{2}", match.group(1)) == expected, f"screen request mapping drifted: {screen_id}")
    missing_capabilities = read_json(EVIDENCE_PATHS["n28_registry_sha256"])
    require(
        any(
            row.get("reason_code") == "N28_FULL_EXPOSURE_POPULATION_NOT_PUBLISHED"
            for row in missing_capabilities["owner_contract_entries"]
        ),
        "branch-local full-exposure gap lost its owner classification",
    )
    for promoted in [
        "executionAlphaQueryAnalyticsV1",
        "executionPortfolioQueryAnalyticsV1",
        "executionOperatorTaskCatalogue",
        "executionNewApprovalRequestV1",
        "executionWaiversRegisterV1",
    ]:
        require(promoted in catalogue, f"delivered backend screen remains stale: {promoted}")

    frontend = EVIDENCE_PATHS["frontend_product_route_sha256"].read_text(encoding="utf-8")
    boundary = EVIDENCE_PATHS["frontend_product_boundary_test_sha256"].read_text(encoding="utf-8")
    return_packet = EVIDENCE_PATHS["frontend_consumer_return_packet_sha256"].read_text(encoding="utf-8")
    require("createHttpApi" in frontend and "createFixtureApi" not in frontend, "product route is not the same-origin HTTP consumer")
    for token in ["ExecutionPreviewRoute", "createFixtureApi", "CC_FIXTURES", ".smoke", ".fixtures"]:
        require(token in boundary, f"frontend product-boundary gate missing: {token}")
    require("FRONTEND_CONSUMER_ACCEPTANCE_READY_FOR_CODEX" in return_packet, "frontend return verdict missing")
    require(acceptance["accepted_scope"]["commissioned_requests"]["frontend_source_consumer_accepted"] == 31, "frontend request acceptance drifted")
    require(acceptance["release_gates"]["frontend_http_consumer"] == "PASS_SAME_ORIGIN_CONSUMER_ACCEPTED", "same-origin frontend acceptance missing")
    require(acceptance["authority"]["product_release_authorized"] is False, "frontend acceptance widened product authority")


def validate_governance_product() -> None:
    controller = (ROOT / "apps/control-api/src/governance/governance.controller.ts").read_text(encoding="utf-8")
    service = (ROOT / "apps/control-api/src/governance/governance.service.ts").read_text(encoding="utf-8")
    repository = (ROOT / "apps/control-api/src/governance/governance.repository.ts").read_text(encoding="utf-8")
    migration = EVIDENCE_PATHS["governance_product_migration_sha256"].read_text(encoding="utf-8")
    openapi = read_json(EVIDENCE_PATHS["governance_product_openapi_sha256"])
    paths = openapi.get("paths", {})
    require("/api/v1/execution/governance/approvals" in paths, "BR-EX-69 OpenAPI route missing")
    require("/api/v1/execution/governance/waivers" in paths, "BR-EX-71 OpenAPI route missing")
    for token in ["ApprovalCreateRequestSchema", "governanceConditionsQuery", "assertMutationSecurity"]:
        require(token in controller, f"N29 governance controller boundary missing: {token}")
    for token in [
        "computeEvidenceManifestHash([evidence])",
        "REQUEST_KEY_PAYLOAD_CONFLICT",
        "DUPLICATE_OPEN_APPROVAL",
        "EVIDENCE_RUN_NOT_ELIGIBLE",
    ]:
        require(token in service, f"N29 governance service boundary missing: {token}")
    for token in [
        "BEGIN ISOLATION LEVEL SERIALIZABLE",
        "FOR SHARE OF run",
        "governance.r1_request.created",
        "governance_approval_known_limitations",
    ]:
        require(token in repository, f"N29 governance repository boundary missing: {token}")
    for token in [
        "governance_approval_open_alpha_run_idx",
        "governance_approval_request_key_idx",
        "governance_conditions_register",
        "artifact_sha256",
    ]:
        require(token in migration, f"N29 governance migration boundary missing: {token}")


def validate_br_ex_72(acceptance: dict[str, Any], debt: dict[str, Any]) -> None:
    openapi = read_json(EVIDENCE_PATHS["br72_openapi_sha256"])
    require(set(openapi.get("paths", {})) == {
        "/api/v1/execution/alphas",
        "/api/v1/execution/portfolios",
        "/api/v1/execution/broker-bindings",
        "/api/v1/execution/broker-bindings/{binding_id}",
    }, "BR-EX-72/76 route set drifted")
    limit = openapi["components"]["parameters"]["Limit"]["schema"]
    require(limit == {"type": "integer", "minimum": 1, "maximum": 50, "default": 50}, "BR-EX-72 page bound drifted")

    migration = EVIDENCE_PATHS["br72_migration_sha256"].read_text(encoding="utf-8")
    fleet_v2_schema = read_json(EVIDENCE_PATHS["br72_fleet_v2_schema_sha256"])
    fleet_v2_migration = EVIDENCE_PATHS["br72_fleet_v2_migration_sha256"].read_text(encoding="utf-8")
    repository = EVIDENCE_PATHS["br72_repository_sha256"].read_text(encoding="utf-8")
    service = EVIDENCE_PATHS["br72_service_sha256"].read_text(encoding="utf-8")
    controller = EVIDENCE_PATHS["br72_controller_sha256"].read_text(encoding="utf-8")
    source_boundary = EVIDENCE_PATHS["br72_source_boundary_sha256"].read_text(encoding="utf-8")
    for token in [
        "execution_manager_projection_snapshots",
        "execution_alpha_fleet_projection",
        "execution_binding_projection",
    ]:
        require(token in migration and token in repository, f"BR-EX-72 projection missing: {token}")
    require(
        fleet_v2_schema["$defs"]["AlphaFleetResponse"]["properties"]["schema_version"]["const"]
        == "execution.alpha-fleet-list.v2",
        "Alpha Fleet v2 schema authority drifted",
    )
    for token in [
        "ADD COLUMN summary jsonb",
        "environment IN ('all', 'paper', 'sandbox', 'live')",
        "ADD COLUMN stages jsonb",
        "ADD COLUMN metrics_availability jsonb",
        "WHERE projection_kind = 'ALPHA_FLEET'",
    ]:
        require(token in fleet_v2_migration, f"Alpha Fleet v2 migration boundary missing: {token}")
    for token in [
        "MAX_SOURCE_PAGES = 10",
        "SOURCE_PAGE_LIMIT = 200",
        "BR72_SOURCE_POPULATION_EXCEEDS_BOUND",
        "BR72_SOURCE_CURSOR_CYCLE",
        "execution.alpha-fleet-list.v2",
        'environment === "all"',
        "manager.positions",
        "manager.reconciliation",
        "execution.bindings-list.v1",
    ]:
        require(token in service, f"BR-EX-72 service boundary missing: {token}")
    for token in ["@Get(\"/alphas\")", "@Get(\"/broker-bindings\")", "@Get(\"/broker-bindings/:binding_id\")"]:
        require(token in controller, f"BR-EX-72 controller route missing: {token}")
    for token in [
        "BR72_MANAGER_LIST_ACCEPTANCE",
        "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
        "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN",
        "broker_account_sync_effective",
    ]:
        require(token in source_boundary, f"BR-EX-72 source boundary missing: {token}")
    require("venue_credentials" not in source_boundary.split("BR72_MANAGER_LIST_SCREEN_BINDINGS", 1)[1].split("type Br72ManagerListScreenId", 1)[0], "BR-EX-72 source boundary exposes credentials")

    live_review = read_json(EVIDENCE_PATHS["br72_live_review_fixture_sha256"])
    require(live_review.get("schema_version") == "governance.live-review.v1", "canonical Live Review fixture drifted")
    for consumer in [
        ROOT / "apps/portal/frontend/src/execution/api/fixtureApi.ts",
        ROOT / "apps/portal/frontend/e2e/bffDouble.ts",
    ]:
        require("governance-live-review.valid.json" in consumer.read_text(encoding="utf-8"), "Live Review consumer stopped using canonical fixture")

    registry = read_json(EVIDENCE_PATHS["br72_registry_source_sha256"])
    public_registry = read_json(EVIDENCE_PATHS["br72_registry_public_sha256"])
    require(registry.get("revision") == 6 and public_registry.get("revision") == 6, "registry revision 6 drifted")
    screens = {row["screen_id"]: row for row in registry["screens"]}
    expected = {
        "EXECUTION_ALPHA_FLEET_LIST_SCREEN": {"query_enabled", "projection_ingestion_enabled"},
        "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN": {"query_enabled", "projection_ingestion_enabled"},
        "EXECUTION_NEW_APPROVAL_REQUEST_SCREEN": {"governance_write_enabled"},
        "EXECUTION_GATE_LIVE_REVIEW_SCREEN": {"query_enabled"},
        "EXECUTION_WAIVERS_REGISTER_SCREEN": {"query_enabled"},
    }
    for screen_id, enabled_expected in expected.items():
        row = screens[screen_id]
        enabled = {key for key, value in row["delivery_policy"].items() if key.endswith("_enabled") and value}
        require(row["delivery_profile"] == "shadow" and enabled == enabled_expected, f"registry delivery policy drifted: {screen_id}")

    containers = EVIDENCE_PATHS["br72_frontend_containers_sha256"].read_text(encoding="utf-8")
    fleet_screen = EVIDENCE_PATHS["br72_frontend_alpha_fleet_sha256"].read_text(encoding="utf-8")
    recompose = EVIDENCE_PATHS["br72_frontend_recompose_sha256"].read_text(encoding="utf-8")
    frontend_registry = EVIDENCE_PATHS["br72_frontend_registry_sha256"].read_text(encoding="utf-8")
    require("AlphaFleetContainer" in containers and "AccountsBindingsContainer" in containers, "BR-EX-72 frontend containers missing")
    require("N20_FLEET_LIST_CONTRACT_NOT_PUBLISHED" not in containers, "Fleet still renders typed unavailable")
    require("N20_BINDINGS_LIST_CONTRACT_NOT_PUBLISHED" not in containers, "Bindings still renders typed unavailable")
    for token in ["item.stages.some", "positionPnl", "balance.locked", "SOURCE_LATEST_WINDOW_NOT_PUBLISHED"]:
        require(token in fleet_screen, f"Alpha Fleet v2 product rendering missing: {token}")
    for token in ["getAlphaFleet(query)", 'useState<FleetFilter>("all")', "stage: next === \"all\" ? undefined"]:
        require(token in recompose, f"Alpha Fleet v2 product consumer missing: {token}")
    require("EXECUTION_ALPHA_FLEET_LIST_SCREEN" in frontend_registry and "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN" in frontend_registry, "BR-EX-72 frontend registry roots missing")
    # BR-EX-76 (Phase 4 / P4-A): the portfolio identity list is part of the
    # accepted manager-list surface — pin its authority and bounds.
    portfolio_schema = read_json(EVIDENCE_PATHS["br76_schema_sha256"])
    require(
        portfolio_schema["$defs"]["PortfolioListResponse"]["properties"]["schema_version"]["const"]
        == "execution.portfolio-list.v1",
        "BR-EX-76 portfolio list schema authority drifted",
    )
    require(
        portfolio_schema["$defs"]["PortfolioListResponse"]["properties"]["items"]["maxItems"] == 100,
        "BR-EX-76 portfolio population bound drifted",
    )
    for token in [
        "PORTFOLIO_LIST_MAX_ITEMS = 100",
        "BR76_PORTFOLIO_SOURCE_UNAVAILABLE",
        "execution.portfolio-list.v1",
        'lineage("portfolio_allocations", allocations)',
    ]:
        require(token in service, f"BR-EX-76 portfolio service boundary missing: {token}")
    require("PortfolioListQuerySchema" in controller, "BR-EX-76 portfolio route validation missing")
    for token in ["PortfolioListRichContainer", "api.listPortfolios()"]:
        require(token in recompose, f"BR-EX-76 portfolio register consumer missing: {token}")
    require(acceptance["accepted_scope"]["br_ex_72"]["status"] == "COMPLETE", "BR-EX-72 acceptance state drifted")
    require({item["blocker_id"] for item in debt["resolved_delivery_gates"]} == {"N29-FE-01", "N29-BE-72"}, "BR-EX-72 resolved gate missing")


def validate_release_authority(acceptance: dict[str, Any], debt: dict[str, Any]) -> None:
    for key, path in EVIDENCE_PATHS.items():
        require(acceptance["evidence"][key] == digest(path), f"evidence digest drifted: {key}")
    workflow = EVIDENCE_PATHS["release_workflow_sha256"].read_text(encoding="utf-8")
    for token in ["branches: [main]", "cosign sign --yes", "cosign verify-attestation", "type spdxjson", "type slsaprovenance"]:
        require(token in workflow, f"protected release workflow lost: {token}")
    require(acceptance["release_gates"]["signed_immutable_images"] == "PENDING_PROTECTED_MAIN_WORKFLOW", "unsigned feature images were accepted")
    require(acceptance["release_gates"]["stable_release"] == "NOT_AUTHORIZED", "stable release authority widened")
    for key, value in acceptance["authority"].items():
        if key != "portal_release_candidate":
            require(value is False, f"authority widened: {key}")
    require(acceptance["authority"]["portal_release_candidate"] is True, "backend candidate authority missing")
    require(debt["internal_technical_debt"] == [], "unnamed internal technical debt exists")
    require({item["blocker_id"] for item in debt["release_blockers"]} == {"N29-REL-01"}, "release blocker set drifted")
    require(debt["typed_external_gaps"]["count"] == 9 and debt["typed_external_gaps"]["release_blocking"] is False, "typed owner gap policy drifted")
    require(debt["intentional_exclusions"]["count"] == 3 and debt["intentional_exclusions"]["release_blocking"] is False, "intentional exclusion policy drifted")

    release = read_json(ROOT / "deploy/manifests/execution-manager-product-release-profile.v1.json")
    require(release["decision"] == "DEV_PRODUCT_CANDIDATE_READY_PROTECTED_RELEASE_PENDING", "release profile decision drifted")
    require(release["accepted_runtime_authority"]["commands"] is False, "command authority widened")
    require(release["accepted_runtime_authority"]["live_mutation"] is False, "Live mutation authority widened")
    require(release["publication"]["published_by_this_phase"] is False, "N29 falsely claimed publication")

    slo = (ROOT / "deploy/execution-manager-v2/product-slo.v1.yml").read_text(encoding="utf-8")
    require("production_slo_claimed: false" in slo and "error_budget_window_open: false" in slo, "provisional SLO became production evidence")


def validate_no_sensitive_material() -> None:
    paths = [
        ACCEPTANCE,
        DEBT,
        ROOT / "deploy/manifests/execution-manager-product-release-profile.v1.json",
        ROOT / "deploy/execution-manager-v2/product-dashboard.v1.json",
        ROOT / "deploy/execution-manager-v2/product-slo.v1.yml",
        ROOT / "deploy/runbooks/execution-manager-n29-product-release-and-rollback.md",
    ]
    for path in paths:
        require(SENSITIVE.search(path.read_text(encoding="utf-8")) is None, f"secret-shaped N29 content: {path}")


def main() -> int:
    try:
        acceptance = read_json(ACCEPTANCE)
        debt = read_json(DEBT)
        require(acceptance["schema_version"] == "portal.execution.product-acceptance.v1", "acceptance revision drifted")
        require(acceptance["decision"] == "RELEASE_CANDIDATE_READY_PROTECTED_RELEASE_PENDING", "acceptance verdict drifted")
        require(debt["decision"] == "NO_UNNAMED_DEBT", "debt decision drifted")
        validate_manifest()
        validate_inventory(acceptance)
        validate_screen_and_ui(acceptance)
        validate_governance_product()
        validate_br_ex_72(acceptance, debt)
        validate_release_authority(acceptance, debt)
        validate_no_sensitive_material()
    except (AcceptanceError, OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"N29 acceptance rejected: {error}", file=sys.stderr)
        return 1
    print(json.dumps({
        "phase": "N29",
        "backend_decision": "RELEASE_CANDIDATE_READY",
        "product_release": "NO_GO",
        "relations": 96,
        "commissioned_requests": 31,
        "portal_reads": 27,
        "commands": 9,
        "screen_contracts": 23,
        "internal_technical_debt": 0,
        "release_blockers": ["N29-REL-01"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
