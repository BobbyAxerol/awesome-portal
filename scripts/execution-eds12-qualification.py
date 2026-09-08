#!/usr/bin/env python3
"""EDS-12 static/deployed release qualification verifier.

The static mode validates only committed non-secret contracts, runbooks and
digest bindings.  The deployed mode consumes a separately supplied sanitized
evidence object and fails closed until protected-main images, browser proof,
failure proof and the three explicit Portal-owned source adapters are all
present.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import stat
import sys
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parent.parent
PACK = ROOT / "services/portal-execution-edge-rs/contracts/eds12-release-qualification-v1"
QUALIFICATION_PATH = PACK / "qualification.v1.json"
FAILURE_PATH = PACK / "failure-matrix.v1.json"
MANIFEST_PATH = PACK / "MANIFEST.sha256"
MAX_BYTES = 16 * 1024 * 1024
SHA256 = re.compile(r"sha256:[a-f0-9]{64}\Z")
COMMIT = re.compile(r"[a-f0-9]{40}\Z")
SENSITIVE_KEY_PARTS = {
    "password", "secret", "token", "private_key", "credential", "cookie",
    "authorization", "database_url", "dsn", "redis_url", "broker_key",
}
SENSITIVE_VALUE = re.compile(
    r"(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|"
    r"postgres(?:ql)?://[^\s]+:[^\s]+@|redis://[^\s]+@|"
    r"authorization\s*:\s*bearer|x-api-key\s*:)",
    re.IGNORECASE,
)

INPUTS = (
    ("n29_acceptance", "services/portal-execution-edge-rs/contracts/n29-product-acceptance-v1/product-acceptance.v1.json"),
    ("n29_debt", "services/portal-execution-edge-rs/contracts/n29-product-acceptance-v1/debt-register.v1.json"),
    ("current_source_map", "services/portal-execution-edge-rs/contracts/current-source-v1/capability-source-map.json"),
    ("n17a_dr_harness", "scripts/execution-n17a-production-dr-test.sh"),
    ("n17b_current_acceptance", "scripts/execution-n17b-current-acceptance-test.sh"),
    ("n29_release_profile", "deploy/manifests/execution-manager-product-release-profile.v1.json"),
    ("protected_release_workflow", ".github/workflows/publish-images.yml"),
    ("cosign_signature_adapter", "scripts/verify-cosign-signature.py"),
    ("image_publication_gate", "scripts/execution-image-publication-test.sh"),
    ("current_source_compose", "deploy/compose.execution-current-source.yaml"),
    ("profile_runtime_prepare", "scripts/execution-profile-runtime-prepare.sh"),
    ("market_context_static_gate", "scripts/execution-market-context-data-layer-adapter-test.sh"),
    ("current_source_proxy", "apps/control-api/src/execution/current-source.proxy.ts"),
    ("manager_projection", "services/portal-execution-edge-rs/crates/manager-projection/src/lib.rs"),
    ("frontend_execution_route", "apps/portal/frontend/src/execution/ExecutionPreviewRoute.tsx"),
    ("frontend_product_boundary", "apps/portal/frontend/src/execution/productBoundary.test.ts"),
    ("subject_activity_bff", "apps/control-api/src/execution/subject-activity.service.ts"),
    ("subject_activity_ui", "apps/portal/frontend/src/execution/useSubjectActivityFacts.ts"),
    ("projection_relation_ladder", "apps/control-api/src/execution/profile-projection.catalog.ts"),
    ("projection_repository", "apps/control-api/src/execution/profile-projection.repository.ts"),
    ("market_context_intake", "apps/control-api/src/execution/market-context.intake.ts"),
    ("market_context_service", "apps/control-api/src/execution/market-context.service.ts"),
    ("market_context_chart_bff", "apps/control-api/src/execution/market-candles.controller.ts"),
    ("market_context_chart_translator", "apps/control-api/src/execution/market-candles.service.ts"),
    ("market_context_adapter", "services/portal-execution-edge-rs/contracts/portal-market-context-data-layer-adapter-v1/market-context-data-layer-adapter.v1.json"),
    ("market_context_proxy_template", "deploy/execution-d1/source-proxy/manager-market-context-data-layer-locations.conf.template"),
    ("phase12_qualification", "upgrade/execution-v1/PHASE_12_QUALIFICATION.md"),
    ("operations_runbook", "upgrade/execution-v1/OPERATIONS_RUNBOOK.md"),
    ("rollback_runbook", "upgrade/execution-v1/ROLLBACK_RUNBOOK.md"),
    ("failure_matrix", "services/portal-execution-edge-rs/contracts/eds12-release-qualification-v1/failure-matrix.v1.json"),
)

PROFILE_STAGES = {
    ("PAPER_BINANCE_USDM", "PAPER"),
    ("SANDBOX_BINANCE_USDM", "SANDBOX"),
    ("LIVE_BINANCE_USDM", "CANARY_OVER_LIVE"),
    ("LIVE_BINANCE_USDM", "LIVE"),
}
FAILURE_IDS = {
    "SOURCE_OUTAGE",
    "NETWORK_PARTITION",
    "EDGE_UNAVAILABLE",
    "SGP_PROJECTION_DB_UNAVAILABLE",
    "DISK_PRESSURE",
    "CURSOR_EXPIRED_OR_CYCLE",
    "EPOCH_CHANGE",
    "SCHEMA_OR_CATALOGUE_INCOMPATIBLE",
    "CORRUPT_FRAME",
    "LATE_CORRECTION",
}
UI_STATES = {"ready", "empty", "partial", "stale", "unavailable", "denied", "error"}
SERVICE_IDS = {
    "portal-api", "portal-web", "control-api", "roadmap-task-board-api",
    "execution-edge", "source-proxy",
}


class QualificationError(ValueError):
    """Stable EDS-12 fail-closed rejection."""


def duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise QualificationError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def safe_file(path: pathlib.Path, *, maximum: int = MAX_BYTES) -> pathlib.Path:
    try:
        metadata = path.lstat()
    except OSError as error:
        raise QualificationError(f"required artifact is missing: {path}") from error
    if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
        raise QualificationError(f"artifact must be a regular non-symlink: {path}")
    if metadata.st_size <= 0 or metadata.st_size > maximum:
        raise QualificationError(f"artifact size is outside bounds: {path}")
    return path


def read_json(path: pathlib.Path) -> dict[str, Any]:
    safe_file(path)
    try:
        value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=duplicates)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise QualificationError(f"invalid JSON artifact: {path}") from error
    if not isinstance(value, dict):
        raise QualificationError(f"JSON artifact must be an object: {path}")
    reject_sensitive(value)
    return value


def reject_sensitive(value: Any) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = key.lower().replace("-", "_")
            if any(part in normalized for part in SENSITIVE_KEY_PARTS) and child not in (False, None, "", "REDACTED"):
                raise QualificationError(f"secret-shaped key is not redacted: {key}")
            reject_sensitive(child)
    elif isinstance(value, list):
        for child in value:
            reject_sensitive(child)
    elif isinstance(value, str) and SENSITIVE_VALUE.search(value):
        raise QualificationError("secret-shaped value is forbidden")


def digest(path: pathlib.Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise QualificationError(message)


def exact(value: dict[str, Any], expected: set[str], label: str) -> None:
    require(set(value) == expected, f"{label} key set drifted")


def sha256(value: Any) -> bool:
    return isinstance(value, str) and SHA256.fullmatch(value) is not None


def validate_manifest() -> None:
    safe_file(MANIFEST_PATH)
    rows: dict[str, str] = {}
    for line in MANIFEST_PATH.read_text(encoding="utf-8").splitlines():
        expected, name = line.split("  ", 1)
        require(name not in rows, "duplicate EDS-12 manifest path")
        require("/" not in name and ".." not in name, "unsafe EDS-12 manifest path")
        require(re.fullmatch(r"[0-9a-f]{64}", expected) is not None, "invalid EDS-12 manifest digest")
        rows[name] = expected
    expected_names = {
        "README.md",
        "qualification.v1.schema.json",
        "qualification.v1.json",
        "failure-matrix.v1.json",
        "deployed-evidence.v1.schema.json",
    }
    require(set(rows) == expected_names, "EDS-12 manifest file set drifted")
    for name, expected in rows.items():
        require(hashlib.sha256((PACK / name).read_bytes()).hexdigest() == expected, f"EDS-12 manifest digest drifted: {name}")


def validate_baseline(qualification: dict[str, Any]) -> None:
    baseline = qualification["baseline"]
    exact(baseline, {"n29_product_acceptance", "p01_r4_r5_source_integration"}, "EDS-12 baseline")
    n29 = baseline["n29_product_acceptance"]
    exact(n29, {"file", "decision"}, "N29 baseline")
    require(n29 == {
        "file": "services/portal-execution-edge-rs/contracts/n29-product-acceptance-v1/product-acceptance.v1.json",
        "decision": "RELEASE_CANDIDATE_READY_PROTECTED_RELEASE_PENDING",
    }, "N29 baseline drifted")
    r4r5 = baseline["p01_r4_r5_source_integration"]
    exact(r4r5, {"p01_base", "integration_ref", "integration_commit", "lease_ttl_seconds", "source_only", "runtime_activation"}, "P01 R4/R5 baseline")
    require(r4r5 == {
        "p01_base": "f9e3d94613b1b9421043ce38e9a778d243124c69",
        "integration_ref": "integration/portal-r4r5-p01-final",
        "integration_commit": "98c47b3a66668b6082a60767cc94bfd2359a607f",
        "lease_ttl_seconds": 900,
        "source_only": True,
        "runtime_activation": False,
    }, "P01 R4/R5 source-only boundary drifted")

    n29_contract = read_json(ROOT / n29["file"])
    require(n29_contract["decision"] == n29["decision"], "N29 baseline decision drifted")
    require(n29_contract["runtime_effect"] == "NONE", "N29 baseline widened runtime")


def validate_profiles(qualification: dict[str, Any]) -> None:
    rows = qualification["profiles"]
    require(isinstance(rows, list) and len(rows) == len(PROFILE_STAGES), "EDS-12 profile count drifted")
    actual: set[tuple[str, str]] = set()
    for row in rows:
        require(isinstance(row, dict), "EDS-12 profile row must be object")
        exact(row, {"profile_id", "stage", "read_authority", "sse_authority", "command_authority", "live_mutation_authority"}, "EDS-12 profile row")
        pair = (row["profile_id"], row["stage"])
        require(pair not in actual, "duplicate EDS-12 profile stage")
        actual.add(pair)
        require(row["read_authority"] == "DEPLOYED_EVIDENCE_REQUIRED", "EDS-12 read authority widened")
        require(row["sse_authority"] == "DEPLOYED_EVIDENCE_REQUIRED", "EDS-12 SSE authority widened")
        require(row["command_authority"] == "DISABLED", "EDS-12 command authority widened")
        require(row["live_mutation_authority"] == "DISABLED", "EDS-12 Live mutation authority widened")
    require(actual == PROFILE_STAGES, "EDS-12 profile stage set drifted")


def validate_failure_matrix(qualification: dict[str, Any], failure: dict[str, Any]) -> None:
    exact(failure, {"schema_version", "phase", "runtime_effect", "scenarios"}, "failure matrix")
    require(failure["schema_version"] == "portal.execution.eds12-failure-matrix.v1", "failure matrix revision drifted")
    require(failure["phase"] == "EDS-12" and failure["runtime_effect"] == "NONE", "failure matrix activated runtime")
    binding = qualification["failure_matrix"]
    exact(binding, {"file", "schema_version", "scenario_count"}, "failure matrix binding")
    require(binding["file"] == "services/portal-execution-edge-rs/contracts/eds12-release-qualification-v1/failure-matrix.v1.json", "failure matrix path drifted")
    require(binding["schema_version"] == failure["schema_version"] and binding["scenario_count"] == len(FAILURE_IDS), "failure matrix binding drifted")
    rows = failure["scenarios"]
    require(isinstance(rows, list) and len(rows) == len(FAILURE_IDS), "failure scenario count drifted")
    actual: set[str] = set()
    for row in rows:
        require(isinstance(row, dict), "failure scenario must be object")
        exact(row, {"id", "reader_state", "forbidden", "offline_proof", "runtime_proof", "recovery"}, "failure scenario")
        scenario_id = row["id"]
        require(isinstance(scenario_id, str) and scenario_id not in actual, "duplicate failure scenario")
        actual.add(scenario_id)
        require(isinstance(row["forbidden"], list) and len(row["forbidden"]) >= 1, "failure scenario lacks forbidden action")
        require(all(isinstance(row[key], str) and row[key] for key in ("reader_state", "offline_proof", "runtime_proof", "recovery")), "failure scenario detail malformed")
    require(actual == FAILURE_IDS, "failure scenario set drifted")


def validate_inputs(qualification: dict[str, Any]) -> None:
    rows = qualification["evidence_inputs"]
    require(isinstance(rows, list) and len(rows) == len(INPUTS), "EDS-12 evidence input count drifted")
    expected = {identifier: path for identifier, path in INPUTS}
    actual: dict[str, dict[str, Any]] = {}
    for row in rows:
        require(isinstance(row, dict), "evidence input must be object")
        exact(row, {"id", "file", "sha256"}, "evidence input")
        identifier = row["id"]
        require(identifier not in actual and identifier in expected, "unexpected EDS-12 evidence input")
        actual[identifier] = row
        require(row["file"] == expected[identifier], f"evidence path drifted: {identifier}")
        target = ROOT / row["file"]
        safe_file(target)
        require(sha256(row["sha256"]) and row["sha256"] == digest(target), f"evidence digest drifted: {identifier}")
    require(set(actual) == set(expected), "EDS-12 evidence input set drifted")


def validate_source_extensions(qualification: dict[str, Any]) -> None:
    rows = qualification["source_extensions"]
    require(isinstance(rows, list) and len(rows) == 3, "EDS-12 source extension count drifted")
    actual: dict[str, dict[str, Any]] = {}
    for row in rows:
        require(isinstance(row, dict), "source extension must be object")
        exact(row, {"request_id", "state", "required_proof", "fallback"}, "source extension")
        identifier = row["request_id"]
        require(identifier not in actual, "duplicate source extension")
        actual[identifier] = row
    require(actual.get("BR-EX-80", {}).get("state") == "PORTAL_DERIVED_ACTIVE_PENDING_DEPLOYMENT", "BR-EX-80 status drifted")
    require(actual.get("BR-EX-81", {}).get("state") == "PORTAL_RETAINED_CURRENT_WINDOW_ACTIVE_PENDING_DEPLOYMENT", "BR-EX-81 status drifted")
    require(actual.get("MARKET_CONTEXT", {}).get("state") == "PORTAL_EDGE_DATA_LAYER_ACTIVE_PENDING_DEPLOYMENT", "Market Context status drifted")
    require("DERIVED" in actual["BR-EX-80"]["fallback"], "BR-EX-80 fallback stopped being explicit")
    require("authoritative replay" in actual["BR-EX-81"]["fallback"], "BR-EX-81 fallback stopped being explicit")
    require("public-venue fallback" in actual["MARKET_CONTEXT"]["fallback"], "Market Context fallback widened")


def validate_release_and_authority(qualification: dict[str, Any]) -> None:
    gates = qualification["release_gates"]
    expected_gates = {
        "static_contract_and_mutation": "REQUIRED",
        "offline_dr_restore_rebuild": "REQUIRED",
        "protected_main_signed_images_sbom_provenance": "REQUIRED",
        "exact_deployed_browser_state_matrix": "REQUIRED",
        "profile_isolation_and_redaction": "REQUIRED",
        "p0_p1_integrity_issues": "ZERO_REQUIRED",
        "owner_visual_data_action_parity": "REQUIRED",
        "product_active": "FORBIDDEN_UNTIL_ALL_REQUIRED_EVIDENCE",
    }
    require(gates == expected_gates, "EDS-12 release gates drifted")
    authority = qualification["authority"]
    expected_authority = {
        "qualification_pack_authorized": True,
        "source_activation_authorized": False,
        "query_activation_authorized": False,
        "sse_activation_authorized": False,
        "command_activation_authorized": False,
        "live_mutation_authorized": False,
        "stable_release_authorized": False,
        "product_active": False,
        "operations_qualified": False,
    }
    require(authority == expected_authority, "EDS-12 authority drifted")
    rollback = qualification["rollback"]
    exact(rollback, {"strategy", "first_action", "preserve", "forbidden", "runbook"}, "EDS-12 rollback")
    require(rollback["strategy"] == "PROFILE_LOCAL_READER_ROLLBACK_ONLY", "rollback scope drifted")
    require(set(rollback["forbidden"]) == {"trading_system_data_mutation", "projection_truncate", "automatic_command_retry", "cross_profile_fallback"}, "rollback containment drifted")
    artifact = qualification["artifact_generation"]
    exact(artifact, {"release_manifest", "producer", "tracked_template_only", "secrets_permitted"}, "EDS-12 artifact generation")
    require(artifact["release_manifest"] == "artifacts/execution/release_manifest.json", "release artifact path drifted")
    require(artifact["tracked_template_only"] is True and artifact["secrets_permitted"] is False, "artifact policy widened")


def validate_docs_and_workspace() -> None:
    docs = {
        "upgrade/execution-v1/PHASE_12_QUALIFICATION.md": ["STATIC_QUALIFIED", "PRODUCT_ACTIVE", "BR-EX-81", "Market Context", "protected-main"],
        "upgrade/execution-v1/OPERATIONS_RUNBOOK.md": ["PAPER_BINANCE_USDM", "SANDBOX_BINANCE_USDM", "CANARY_OVER_LIVE", "LIVE_BINANCE_USDM"],
        "upgrade/execution-v1/ROLLBACK_RUNBOOK.md": ["PROFILE_LOCAL_READER_ROLLBACK_ONLY", "projection", "Trading System"],
        "upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md": ["BR-EX-80", "BR-EX-81", "Market Context", "EDS-12"],
    }
    for relative, tokens in docs.items():
        path = safe_file(ROOT / relative)
        content = path.read_text(encoding="utf-8")
        require(all(token in content for token in tokens), f"EDS-12 documentation drifted: {relative}")
    workspace = safe_file(ROOT / "services/portal-execution-edge-rs/Cargo.toml").read_text(encoding="utf-8")
    crate = safe_file(ROOT / "services/portal-execution-edge-rs/crates/eds12-qualification/Cargo.toml").read_text(encoding="utf-8")
    rust = safe_file(ROOT / "services/portal-execution-edge-rs/crates/eds12-qualification/src/lib.rs").read_text(encoding="utf-8")
    require('"crates/eds12-qualification"' in workspace, "EDS-12 Rust crate is not in workspace")
    require('name = "eds12-qualification"' in crate, "EDS-12 Rust crate identity drifted")
    require("validate_embedded_qualification" in rust and "forbid(unsafe_code)" in rust, "EDS-12 Rust authority drifted")


def validate_static() -> dict[str, Any]:
    validate_manifest()
    qualification = read_json(QUALIFICATION_PATH)
    failure = read_json(FAILURE_PATH)
    exact(qualification, {
        "schema_version", "phase", "decision", "runtime_effect", "baseline", "profiles",
        "failure_matrix", "evidence_inputs", "source_extensions", "release_gates",
        "authority", "rollback", "artifact_generation",
    }, "EDS-12 qualification")
    require(qualification["schema_version"] == "portal.execution.eds12-release-qualification.v1", "EDS-12 qualification revision drifted")
    require(qualification["phase"] == "EDS-12", "EDS-12 phase drifted")
    require(qualification["decision"] == "EDS12_QUALIFICATION_READY_DEPLOYED_EVIDENCE_PENDING", "EDS-12 decision drifted")
    require(qualification["runtime_effect"] == "NONE", "EDS-12 static qualification activated runtime")
    validate_baseline(qualification)
    validate_profiles(qualification)
    validate_failure_matrix(qualification, failure)
    validate_inputs(qualification)
    validate_source_extensions(qualification)
    validate_release_and_authority(qualification)
    validate_docs_and_workspace()
    return {
        "phase": "EDS-12",
        "decision": qualification["decision"],
        "profile_stages": len(PROFILE_STAGES),
        "failure_scenarios": len(FAILURE_IDS),
        "source_extensions": ["BR-EX-80", "BR-EX-81", "MARKET_CONTEXT"],
        "product_active": False,
        "operations_qualified": False,
        "runtime_effect": "NONE",
    }


def validate_deployed(evidence_path: pathlib.Path) -> dict[str, Any]:
    evidence = read_json(evidence_path)
    return validate_deployed_payload(evidence)


def validate_deployed_payload(evidence: dict[str, Any]) -> dict[str, Any]:
    """Validate a sanitized deployed-evidence payload after static admission."""
    static = validate_static()
    exact(evidence, {
        "schema_version", "candidate_qualification_sha256", "release_manifest", "images", "profiles",
        "browser_states", "failure_scenarios", "source_extensions", "p0_p1_open",
        "owner_visual_data_action_parity", "authority",
    }, "deployed EDS-12 evidence")
    require(evidence["schema_version"] == "portal.execution.eds12-deployed-evidence.v1", "deployed evidence revision drifted")
    require(evidence["candidate_qualification_sha256"] == digest(QUALIFICATION_PATH), "deployed evidence is bound to a different EDS-12 qualification")
    release = evidence["release_manifest"]
    exact(release, {"source_ref", "source_commit", "manifest_sha256", "image_tag"}, "deployed release manifest binding")
    require(release["source_ref"] == "refs/heads/main", "deployed evidence is not protected-main")
    require(isinstance(release["source_commit"], str) and COMMIT.fullmatch(release["source_commit"]) is not None, "invalid protected-main commit")
    require(sha256(release["manifest_sha256"]), "invalid deployed release manifest digest")
    require(release["image_tag"] == f"sha-{release['source_commit']}", "deployed image tag is not immutable")

    images = evidence["images"]
    require(isinstance(images, list) and len(images) == len(SERVICE_IDS), "deployed image set is incomplete")
    image_ids: set[str] = set()
    for row in images:
        require(isinstance(row, dict), "deployed image row must be object")
        exact(row, {"service_id", "image_digest", "signature_verified", "sbom_verified", "provenance_verified", "critical_vulnerabilities", "high_vulnerability_disposition"}, "deployed image row")
        identifier = row["service_id"]
        require(identifier in SERVICE_IDS and identifier not in image_ids, "unexpected deployed image service")
        image_ids.add(identifier)
        require(sha256(row["image_digest"]), "deployed image is not digest-pinned")
        require(row["signature_verified"] is True and row["sbom_verified"] is True and row["provenance_verified"] is True, "deployed image verification is incomplete")
        require(row["critical_vulnerabilities"] == 0, "critical image vulnerability is release blocking")
        require(row["high_vulnerability_disposition"] in {"NO_FINDINGS", "OWNER_ACCEPTED"}, "high vulnerability has no disposition")
    require(image_ids == SERVICE_IDS, "deployed image service set drifted")

    profiles = evidence["profiles"]
    require(isinstance(profiles, list) and len(profiles) == len(PROFILE_STAGES), "deployed profile evidence count drifted")
    profile_pairs: set[tuple[str, str]] = set()
    for row in profiles:
        require(isinstance(row, dict), "deployed profile row must be object")
        exact(row, {"profile_id", "stage", "passed"}, "deployed profile row")
        pair = (row["profile_id"], row["stage"])
        require(pair not in profile_pairs and pair in PROFILE_STAGES and row["passed"] is True, "deployed profile evidence is incomplete")
        profile_pairs.add(pair)
    require(profile_pairs == PROFILE_STAGES, "deployed profile evidence set drifted")

    browser = evidence["browser_states"]
    require(isinstance(browser, list) and len(browser) == len(PROFILE_STAGES) * len(UI_STATES), "browser matrix cardinality drifted")
    browser_pairs: set[tuple[str, str, str]] = set()
    for row in browser:
        require(isinstance(row, dict), "browser state row must be object")
        exact(row, {"profile_id", "stage", "state", "passed"}, "browser state row")
        key = (row["profile_id"], row["stage"], row["state"])
        require((key[0], key[1]) in PROFILE_STAGES and key[2] in UI_STATES and key not in browser_pairs and row["passed"] is True, "browser state proof is incomplete")
        browser_pairs.add(key)
    expected_browser = {(profile, stage, state) for profile, stage in PROFILE_STAGES for state in UI_STATES}
    require(browser_pairs == expected_browser, "browser state matrix drifted")

    failures = evidence["failure_scenarios"]
    require(isinstance(failures, list) and len(failures) == len(FAILURE_IDS), "deployed failure evidence count drifted")
    failure_ids: set[str] = set()
    for row in failures:
        require(isinstance(row, dict), "deployed failure row must be object")
        exact(row, {"id", "passed"}, "deployed failure row")
        require(row["id"] in FAILURE_IDS and row["id"] not in failure_ids and row["passed"] is True, "deployed failure evidence is incomplete")
        failure_ids.add(row["id"])
    require(failure_ids == FAILURE_IDS, "deployed failure set drifted")

    extensions = evidence["source_extensions"]
    require(isinstance(extensions, list) and len(extensions) == 3, "source extension evidence count drifted")
    extension_ids: set[str] = set()
    for row in extensions:
        require(isinstance(row, dict), "source extension evidence row must be object")
        exact(row, {"request_id", "source_contract_revision", "evidence_sha256", "accepted"}, "source extension evidence")
        require(row["request_id"] in {"BR-EX-80", "BR-EX-81", "MARKET_CONTEXT"} and row["request_id"] not in extension_ids, "unexpected source extension evidence")
        require(isinstance(row["source_contract_revision"], str) and row["source_contract_revision"], "source extension has no revision")
        require(sha256(row["evidence_sha256"]) and row["accepted"] is True, "source extension is not accepted")
        extension_ids.add(row["request_id"])
    require(extension_ids == {"BR-EX-80", "BR-EX-81", "MARKET_CONTEXT"}, "source extension evidence set drifted")

    require(evidence["p0_p1_open"] == 0 and evidence["owner_visual_data_action_parity"] is True, "integrity or owner parity gate failed")
    authority = evidence["authority"]
    require(authority == {"commands_enabled": False, "live_mutation_enabled": False, "direct_source_access": False, "product_active": True, "operations_qualified": True}, "deployed authority is unsafe or incomplete")
    return {**static, "decision": "PRODUCT_ACTIVE", "product_active": True, "operations_qualified": True, "source_commit": release["source_commit"]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("verify-static")
    deployed = subcommands.add_parser("verify-deployed")
    deployed.add_argument("--evidence", required=True, type=pathlib.Path)
    args = parser.parse_args()
    try:
        result = validate_static() if args.command == "verify-static" else validate_deployed(args.evidence)
    except (QualificationError, OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        print(f"EDS-12 qualification rejected: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
