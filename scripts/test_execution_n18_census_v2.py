#!/usr/bin/env python3
"""Tests for the N18 census v2 mode: superset of v1, 13 screenless PROJECTION_INPUT relations, E1 subset pack."""

from __future__ import annotations

import copy
import csv
import importlib.util
import io
import pathlib


MODULE_PATH = pathlib.Path(__file__).with_name("execution-n18-census.py")
SPEC = importlib.util.spec_from_file_location("execution_n18_census_v2", MODULE_PATH)
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


def validate_v2(payload: dict) -> dict:
    return MODULE.validate(payload, compare_sources=False, version=2)


def main() -> None:
    v1 = MODULE.build_census()
    v2 = MODULE.build_census_v2()
    result = validate_v2(v2)
    assert result["relations"] == result["classified_relations"] == 109
    assert result["business_rows_retained"] == 0 and result["runtime_effect"] == "NONE"
    assert MODULE.validate(MODULE.read_json(MODULE.CENSUS_V2_PATH), version=2)["relations"] == 109

    # v1 stays frozen and v2 is a strict superset with byte-identical v1 entries.
    assert MODULE.validate(MODULE.read_json(MODULE.CENSUS_PATH))["relations"] == 96
    v1_by_id = {row["relation_id"]: row for row in v1["relations"]}
    v2_by_id = {row["relation_id"]: row for row in v2["relations"]}
    assert set(v1_by_id) < set(v2_by_id) and len(set(v2_by_id) - set(v1_by_id)) == 13
    assert all(v2_by_id[key] == value for key, value in v1_by_id.items())
    for key in ("manager_primitives", "gateway_operations", "cli_actions", "commissioned_requests"):
        assert v2[key] == v1[key]

    added = [v2_by_id[f"public.{name}"] for name in sorted(MODULE.T1_RELATIONS)]
    assert len(added) == 13
    assert all(
        row["classification"] == "PROJECTION_INPUT"
        and row["screen_ids"] == []
        and row["delivery_phase"] == "N24"
        and row["consumer"] == "PROJECTION_REDUCER"
        for row in added
    )
    assert all(row["source_snapshot_state"] in {"NONEMPTY", "EMPTY", "UNKNOWN"} for row in added)

    # E1 pack contains only the 109 selected relations and no extra relation.
    rows = list(csv.DictReader(io.StringIO(MODULE.E1_V2_RELATIONS.read_text(encoding="utf-8"), newline="")))
    assert {row["relation"] for row in rows} == {row["relation_id"].removeprefix("public.") for row in v2["relations"]}
    columns = list(csv.DictReader(io.StringIO(MODULE.E1_V2_COLUMNS.read_text(encoding="utf-8"), newline="")))
    assert {row["relation"] for row in columns} <= {row["relation"] for row in rows}

    expect_failure(lambda: MODULE.validate(v2, compare_sources=False), "v2 payload under v1 rules")
    dropped = copy.deepcopy(v2)
    dropped["relations"].pop(0)
    expect_failure(lambda: validate_v2(dropped), "dropped relation")
    screen = copy.deepcopy(v2)
    next(r for r in screen["relations"] if r["relation_id"] == "public.economic_facts")["screen_ids"] = ["S1"]
    expect_failure(lambda: validate_v2(screen), "T1 relation bound to a screen")
    reclass = copy.deepcopy(v2)
    next(r for r in reclass["relations"] if r["relation_id"] == "public.economic_facts")["classification"] = "AUDIT_ONLY"
    expect_failure(lambda: validate_v2(reclass), "T1 relation reclassified")
    badstate = copy.deepcopy(v2)
    next(r for r in badstate["relations"] if r["relation_id"] == "public.economic_facts")["source_snapshot_state"] = "MAYBE"
    expect_failure(lambda: validate_v2(badstate), "unknown snapshot state")
    print("N18 census v2 tests passed.")


if __name__ == "__main__":
    main()
