#!/usr/bin/env python3
"""Mutation tests for the EDS-12 release qualification verifier."""

from __future__ import annotations

import copy
import importlib.util
import pathlib


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
            for request_id, character in (("BR-EX-80", "c"), ("BR-EX-81", "d"))
        ],
        "p0_p1_open": 0,
        "owner_visual_data_action_parity": True,
        "authority": {
            "commands_enabled": False,
            "live_mutation_enabled": False,
            "direct_source_access": False,
            "product_active": True,
            "operations_qualified": True,
        },
    }


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
    assert deployed_result["product_active"] is True
    assert deployed_result["operations_qualified"] is True

    direct_access = copy.deepcopy(evidence)
    direct_access["authority"]["direct_source_access"] = True
    expect_failure(lambda: MODULE.validate_deployed_payload(direct_access), "direct source access")

    missing_state = copy.deepcopy(evidence)
    missing_state["browser_states"].pop()
    expect_failure(lambda: MODULE.validate_deployed_payload(missing_state), "missing browser state")

    unaccepted_extension = copy.deepcopy(evidence)
    unaccepted_extension["source_extensions"][1]["accepted"] = False
    expect_failure(lambda: MODULE.validate_deployed_payload(unaccepted_extension), "unaccepted BR-EX-81")

    print("EDS-12 qualification mutation tests passed (9 fail-closed cases).")


if __name__ == "__main__":
    main()
