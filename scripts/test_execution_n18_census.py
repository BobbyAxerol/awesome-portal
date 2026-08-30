#!/usr/bin/env python3
"""Mutation tests for the source-dark N18 census verifier."""

from __future__ import annotations

import copy
import importlib.util
import pathlib


MODULE_PATH = pathlib.Path(__file__).with_name("execution-n18-census.py")
SPEC = importlib.util.spec_from_file_location("execution_n18_census", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise SystemExit("cannot load N18 census verifier")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def expect_failure(callback, label: str) -> None:
    try:
        callback()
    except MODULE.CensusError:
        return
    raise AssertionError(f"expected fail-closed rejection: {label}")


def validate_mutation(payload: dict) -> None:
    MODULE.validate(payload, compare_sources=False)


def main() -> None:
    census = MODULE.build_census()
    result = MODULE.validate(census, compare_sources=False)
    assert result["relations"] == result["classified_relations"] == 96
    assert result["business_rows_retained"] == 0
    assert result["runtime_effect"] == "NONE"

    canonical = MODULE.read_json(MODULE.CENSUS_PATH)
    assert MODULE.validate(canonical)["commissioned_requests"] == 31

    relation_ids = {row["relation_id"] for row in census["relations"]}
    assert len(relation_ids) == 96
    assert set(census["corrected_n17b_baseline"]["relations"]) == MODULE.N17B_RELATIONS
    assert census["corrected_n17b_baseline"]["product_runtime_enabled"] is False

    request_ids = [row["request_id"] for row in census["commissioned_requests"]]
    assert request_ids == [f"BR-EX-{number}" for number in range(41, 72)]
    assert all(row["delivery_phase"] in MODULE.DELIVERY_PHASES for row in census["commissioned_requests"])

    direct_only = [
        row for row in census["cli_actions"]
        if row["classification"] == "SEMANTICALLY_INCOMPATIBLE_DIRECT_ONLY"
    ]
    assert len(direct_only) == 7
    assert all(row["consumer"] == "NONE_DIRECT_ACCESS_FORBIDDEN" for row in direct_only)

    duplicate_relation = copy.deepcopy(census)
    duplicate_relation["relations"][1]["relation_id"] = duplicate_relation["relations"][0]["relation_id"]
    expect_failure(lambda: validate_mutation(duplicate_relation), "duplicate relation")

    unclassified = copy.deepcopy(census)
    unclassified["relations"][0]["classification"] = "RAW_TABLE_PAGE"
    expect_failure(lambda: validate_mutation(unclassified), "unclassified relation")

    profile_gap = copy.deepcopy(census)
    del profile_gap["relations"][0]["profile_availability"]["LIVE"]
    expect_failure(lambda: validate_mutation(profile_gap), "profile coverage gap")

    duplicate_request = copy.deepcopy(census)
    duplicate_request["commissioned_requests"][1]["request_id"] = duplicate_request["commissioned_requests"][0]["request_id"]
    expect_failure(lambda: validate_mutation(duplicate_request), "duplicate request")

    request_phase_drift = copy.deepcopy(census)
    request_phase_drift["commissioned_requests"][0]["delivery_phase"] = "N29"
    expect_failure(lambda: validate_mutation(request_phase_drift), "request phase drift")

    secret_shape = copy.deepcopy(census)
    secret_shape["relations"][0]["api_key"] = "forbidden"
    expect_failure(lambda: validate_mutation(secret_shape), "secret material")

    business_rows = copy.deepcopy(census)
    business_rows["relations"][0]["rows"] = [{"id": "business-row"}]
    expect_failure(lambda: validate_mutation(business_rows), "business rows")

    authority_widening = copy.deepcopy(census)
    authority_widening["authority"]["source_activation"] = True
    expect_failure(lambda: validate_mutation(authority_widening), "runtime authority")

    digest_drift = copy.deepcopy(canonical)
    first_source = next(iter(digest_drift["source_artifacts"].values()))
    first_source["sha256"] = "sha256:" + "f" * 64
    expect_failure(lambda: MODULE.validate(digest_drift), "source digest drift")

    print("N18 census verifier mutation tests passed (10 fail-closed cases).")


if __name__ == "__main__":
    main()
