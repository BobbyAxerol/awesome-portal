#!/usr/bin/env python3
"""N29 finite campaign product-acceptance verifier.

The verifier is intentionally offline. It binds committed evidence, proves the
complete census disposition and rejects a product GO while the reviewed UI is
fixture-only or the protected image publication has not returned evidence.
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
    "n17b_real_paper_acceptance_sha256": ROOT / "packages/contracts/fixtures/execution-production-acceptance.current-paper.accepted.json",
    "release_workflow_sha256": ROOT / ".github/workflows/publish-images.yml",
    "recovery_runbook_sha256": ROOT / "deploy/runbooks/portal-n17a-source-dark-production-dr.md",
    "governance_product_migration_sha256": ROOT / "apps/control-api/migrations/1723680000015_execution-product-governance.sql",
    "governance_product_schema_sha256": ROOT / "packages/contracts/schemas/execution-governance-product.v1.schema.json",
    "governance_product_openapi_sha256": ROOT / "packages/contracts/openapi/execution-governance.openapi.json",
    "governance_product_test_sha256": ROOT / "apps/control-api/test/governance-product.spec.ts",
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
    require(catalogue.count('status: "AVAILABLE"') == 22, "available screen count drifted")
    require(catalogue.count('status: "TYPED_UNAVAILABLE"') == 1, "unavailable screen count drifted")
    require(set(re.findall(r"BR-EX-\d{2}", catalogue)) == {f"BR-EX-{n}" for n in range(41, 72)}, "screen request coverage drifted")
    for reason in [
        "N28_FULL_EXPOSURE_POPULATION_NOT_PUBLISHED",
    ]:
        require(reason in catalogue, f"missing typed unavailable reason: {reason}")
    for promoted in [
        "executionAlphaQueryAnalyticsV1",
        "executionPortfolioQueryAnalyticsV1",
        "executionOperatorTaskCatalogue",
        "executionNewApprovalRequestV1",
        "executionWaiversRegisterV1",
    ]:
        require(promoted in catalogue, f"delivered backend screen remains stale: {promoted}")

    frontend = EVIDENCE_PATHS["frontend_product_route_sha256"].read_text(encoding="utf-8")
    require("createFixtureApi()" in frontend, "frontend transport changed without N29 evidence refresh")
    require(
        "no HTTP adapter, EventSource or" in frontend
        and "Trading System client is constructed here" in frontend,
        "frontend fixture boundary is no longer explicit",
    )
    require(acceptance["release_gates"]["frontend_http_consumer"] == "BLOCKED_FIXTURE_ONLY", "fixture UI was presented as product-ready")
    require(acceptance["authority"]["product_release_authorized"] is False, "fixture UI authorized a product release")


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
    require({item["blocker_id"] for item in debt["release_blockers"]} == {"N29-FE-01", "N29-REL-01"}, "release blocker set drifted")
    require(debt["typed_external_gaps"]["count"] == 9 and debt["typed_external_gaps"]["release_blocking"] is False, "typed owner gap policy drifted")
    require(debt["intentional_exclusions"]["count"] == 3 and debt["intentional_exclusions"]["release_blocking"] is False, "intentional exclusion policy drifted")

    release = read_json(ROOT / "deploy/manifests/execution-manager-product-release-profile.v1.json")
    require(release["decision"] == "DEV_BACKEND_CANDIDATE_READY_PRODUCT_NO_GO", "release profile decision drifted")
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
        require(acceptance["decision"] == "BACKEND_ACCEPTED_PRODUCT_RELEASE_NO_GO", "acceptance verdict drifted")
        require(debt["decision"] == "NO_UNNAMED_DEBT", "debt decision drifted")
        validate_manifest()
        validate_inventory(acceptance)
        validate_screen_and_ui(acceptance)
        validate_governance_product()
        validate_release_authority(acceptance, debt)
        validate_no_sensitive_material()
    except (AcceptanceError, OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"N29 acceptance rejected: {error}", file=sys.stderr)
        return 1
    print(json.dumps({
        "phase": "N29",
        "backend_decision": "ACCEPTED",
        "product_release": "NO_GO",
        "relations": 96,
        "commissioned_requests": 31,
        "portal_reads": 27,
        "commands": 9,
        "screen_contracts": 23,
        "internal_technical_debt": 0,
        "release_blockers": ["N29-FE-01", "N29-REL-01"],
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
