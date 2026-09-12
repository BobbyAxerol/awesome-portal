#!/usr/bin/env python3
"""Mutation tests for the EDS-12 release qualification verifier."""

from __future__ import annotations

import copy
import importlib.util
import json
import pathlib
import tempfile


MODULE_PATH = pathlib.Path(__file__).with_name("execution-eds12-qualification.py")
SPEC = importlib.util.spec_from_file_location("execution_eds12_qualification", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise SystemExit("cannot load EDS-12 qualification verifier")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def expect_failure(callback, label: str) -> None:
    try:
        callback()
    except MODULE.QualificationError:
        return
    raise AssertionError(f"expected fail-closed rejection: {label}")


def deployed_evidence() -> dict:
    qualification_digest = MODULE.digest(MODULE.QUALIFICATION_PATH)
    profiles = [
        {"profile_id": profile_id, "stage": stage, "passed": True}
        for profile_id, stage in sorted(MODULE.PROFILE_STAGES)
    ]
    browser_states = [
        {"profile_id": profile_id, "stage": stage, "state": state, "passed": True}
        for profile_id, stage in sorted(MODULE.PROFILE_STAGES)
        for state in sorted(MODULE.UI_STATES)
    ]
    return {
        "schema_version": "portal.execution.eds12-deployed-evidence.v1",
        "candidate_qualification_sha256": qualification_digest,
        "release_manifest": {
            "source_ref": "refs/heads/main",
            "source_commit": "a" * 40,
            "manifest_sha256": "sha256:" + "b" * 64,
            "image_tag": "sha-" + "a" * 40,
        },
        "images": [
            {
                "service_id": service_id,
                "image_digest": "sha256:" + format(index, "064x"),
                "signature_verified": True,
                "sbom_verified": True,
                "provenance_verified": True,
                "critical_vulnerabilities": 0,
                "high_vulnerability_disposition": "NO_FINDINGS",
            }
            for index, service_id in enumerate(sorted(MODULE.SERVICE_IDS), start=1)
        ],
        "profiles": profiles,
        "browser_states": browser_states,
        "failure_scenarios": [
            {"id": scenario_id, "passed": True}
            for scenario_id in sorted(MODULE.FAILURE_IDS)
        ],
        "source_extensions": [
            {
                "request_id": request_id,
                "source_contract_revision": "trading-system.manager-v2.test.v1",
                "evidence_sha256": "sha256:" + character * 64,
                "accepted": True,
            }
            for request_id, character in (
                ("BR-EX-80", "c"),
                ("BR-EX-81", "d"),
                ("MARKET_CONTEXT", "e"),
            )
        ],
        "p0_p1_open": 0,
        "owner_visual_data_action_parity": True,
        "authority": {
            "commands_enabled": False,
            "live_mutation_enabled": False,
            "direct_source_access": False,
            "product_active": False,
            "operations_qualified": False,
        },
    }


def runtime_binding_inputs(
    evidence: dict,
    directory: pathlib.Path,
) -> tuple[pathlib.Path, pathlib.Path, pathlib.Path, dict, dict]:
    """Create non-secret two-cell marker fixtures bound to the exact test pack."""
    release_pack = directory / "release-pack"
    release_pack.mkdir()
    candidate = {
        "source_ref": evidence["release_manifest"]["source_ref"],
        "source_commit": evidence["release_manifest"]["source_commit"],
        "image_tag": evidence["release_manifest"]["image_tag"],
        "deployment_compose_bundle": {"sha256": "sha256:" + "f" * 64},
    }
    manifest_path = release_pack / "release-manifest.json"
    manifest_path.write_text(json.dumps(candidate), encoding="utf-8")
    evidence["release_manifest"]["manifest_sha256"] = MODULE.digest(manifest_path)
    candidate_images = {row["service_id"]: {"image_digest": row["image_digest"]} for row in evidence["images"]}

    image_by_service = {row["service_id"]: row["image_digest"] for row in evidence["images"]}
    sgp = directory / "sgp-runtime-binding.env"
    sgp.write_text(
        "\n".join([
            "SCHEMA_VERSION=portal.sgp-runtime-binding.v1",
            f"SOURCE_COMMIT={candidate['source_commit']}",
            f"IMAGE_TAG={candidate['image_tag']}",
            f"RELEASE_MANIFEST_SHA256={evidence['release_manifest']['manifest_sha256']}",
            f"DEPLOYMENT_COMPOSE_BUNDLE_SHA256={candidate['deployment_compose_bundle']['sha256']}",
            f"PORTAL_API_IMAGE=example.invalid/portal-api@{image_by_service['portal-api']}",
            f"PORTAL_WEB_IMAGE=example.invalid/portal-web@{image_by_service['portal-web']}",
            f"PORTAL_CONTROL_API_IMAGE=example.invalid/control-api@{image_by_service['control-api']}",
            f"PORTAL_ROADMAP_API_IMAGE=example.invalid/roadmap-api@{image_by_service['roadmap-task-board-api']}",
            "COMMANDS_ENABLED=false",
            "LIVE_MUTATION_ENABLED=false",
            "DIRECT_SOURCE_ACCESS=false",
            "HEALTH=HEALTHY",
            "",
        ]),
        encoding="utf-8",
    )
    aws = directory / "aws-hk-runtime-binding.json"
    aws.write_text(json.dumps({
        "schema_version": "portal.execution-edge-runtime-binding.v1",
        "source_commit": candidate["source_commit"],
        "image_tag": candidate["image_tag"],
        "release_manifest_sha256": evidence["release_manifest"]["manifest_sha256"],
        "deployment_compose_bundle_sha256": candidate["deployment_compose_bundle"]["sha256"],
        "services": [
            {"service_id": service_id, "image_digest": image_by_service[service_id], "health": "HEALTHY"}
            for service_id in sorted(MODULE.AWS_SERVICE_IDS)
        ],
        "command_relay_enabled": False,
        "live_mutation_enabled": False,
        "direct_source_access": False,
        "health": "HEALTHY",
    }), encoding="utf-8")
    return release_pack, sgp, aws, candidate, candidate_images


def main() -> None:
    result = MODULE.validate_static()
    assert result["decision"] == "EDS12_QUALIFICATION_READY_DEPLOYED_EVIDENCE_PENDING"
    assert result["failure_scenarios"] == 10
    assert result["product_active"] is False

    qualification = MODULE.read_json(MODULE.QUALIFICATION_PATH)
    failure = MODULE.read_json(MODULE.FAILURE_PATH)

    widened = copy.deepcopy(qualification)
    widened["authority"]["sse_activation_authorized"] = True
    expect_failure(lambda: MODULE.validate_release_and_authority(widened), "SSE authority widening")

    bad_ttl = copy.deepcopy(qualification)
    bad_ttl["baseline"]["p01_r4_r5_source_integration"]["lease_ttl_seconds"] = 60
    expect_failure(lambda: MODULE.validate_baseline(bad_ttl), "R4/R5 lease TTL drift")

    missing_failure = copy.deepcopy(failure)
    missing_failure["scenarios"].pop()
    expect_failure(lambda: MODULE.validate_failure_matrix(qualification, missing_failure), "missing failure scenario")

    bad_extension = copy.deepcopy(qualification)
    bad_extension["source_extensions"][1]["fallback"] = "show cached page"
    expect_failure(lambda: MODULE.validate_source_extensions(bad_extension), "BR-EX-81 hidden history limitation")

    bad_input = copy.deepcopy(qualification)
    bad_input["evidence_inputs"][0]["sha256"] = "sha256:" + "0" * 64
    expect_failure(lambda: MODULE.validate_inputs(bad_input), "immutable input digest drift")

    evidence = deployed_evidence()
    deployed_result = MODULE.validate_deployed_payload(evidence)
    assert deployed_result["decision"] == "EDS12_DEPLOYED_EVIDENCE_SEMANTICALLY_VALID_RUNTIME_BINDING_PENDING"
    assert deployed_result["product_active"] is False
    assert deployed_result["operations_qualified"] is False

    direct_access = copy.deepcopy(evidence)
    direct_access["authority"]["direct_source_access"] = True
    expect_failure(lambda: MODULE.validate_deployed_payload(direct_access), "direct source access")

    missing_state = copy.deepcopy(evidence)
    missing_state["browser_states"].pop()
    expect_failure(lambda: MODULE.validate_deployed_payload(missing_state), "missing browser state")

    unaccepted_extension = copy.deepcopy(evidence)
    unaccepted_extension["source_extensions"][1]["accepted"] = False
    expect_failure(lambda: MODULE.validate_deployed_payload(unaccepted_extension), "unaccepted BR-EX-81")

    original_candidate_validator = MODULE.validate_candidate_pack
    try:
        with tempfile.TemporaryDirectory() as temporary:
            directory = pathlib.Path(temporary)
            runtime_evidence = copy.deepcopy(evidence)
            release_pack, sgp_marker, aws_marker, candidate, candidate_images = runtime_binding_inputs(runtime_evidence, directory)
            MODULE.validate_candidate_pack = lambda _pack: (candidate, candidate_images)
            runtime_evidence_path = directory / "evidence.json"
            runtime_evidence_path.write_text(json.dumps(runtime_evidence), encoding="utf-8")
            runtime_result = MODULE.validate_runtime_binding(runtime_evidence_path, release_pack, sgp_marker, aws_marker)
            assert runtime_result["decision"] == "PRODUCT_ACTIVE"
            assert runtime_result["product_active"] is True

            good_sgp = sgp_marker.read_text(encoding="utf-8")
            bad_sgp = "\n".join(
                "PORTAL_API_IMAGE=example.invalid/portal-api@sha256:" + "0" * 64
                if line.startswith("PORTAL_API_IMAGE=") else line
                for line in sgp_marker.read_text(encoding="utf-8").splitlines()
            ) + "\n"
            sgp_marker.write_text(bad_sgp, encoding="utf-8")
            expect_failure(
                lambda: MODULE.validate_runtime_binding(runtime_evidence_path, release_pack, sgp_marker, aws_marker),
                "SGP runtime image mismatch",
            )
            # Restore the Portal marker and prove the Edge-side marker cannot
            # silently widen authority after an otherwise valid bind.
            sgp_marker.write_text(good_sgp, encoding="utf-8")
            aws_payload = json.loads(aws_marker.read_text(encoding="utf-8"))
            aws_payload["command_relay_enabled"] = True
            aws_marker.write_text(json.dumps(aws_payload), encoding="utf-8")
            expect_failure(
                lambda: MODULE.validate_runtime_binding(runtime_evidence_path, release_pack, sgp_marker, aws_marker),
                "AWS-HK command relay enabled",
            )
    finally:
        MODULE.validate_candidate_pack = original_candidate_validator

    print("EDS-12 qualification mutation tests passed (11 fail-closed cases).")


if __name__ == "__main__":
    main()
