"""FULL-04 SQL/registry predicates, not an applied-database migration receipt."""
from __future__ import annotations

import json
import re
from pathlib import Path

from portal_api.domain.research_execution_recipes import recipe_digest

ROOT = Path(__file__).resolve().parents[4]
SQL98 = ROOT / "apps/control-api/migrations/1723680000098_research-full03-indexed-recipes.sql"
SQL101 = ROOT / "apps/control-api/migrations/1723680000101_research-full04-mode-recipes.sql"
TABLE = ROOT / "apps/portal/registry/research-execution-recipes.v1.json"
OLD36_DIGEST = "223f55db55580f807996ca9f474479d8525d7a560bb327a4e79f225a88460534"


def test_full04_migration_preserves_all_36_historical_recipe_bytes_semantically():
    table = json.loads(TABLE.read_text())
    old = [row for row in table["recipes"] if row["descriptor"]["schema_version"] != "research.full04-delta-profile.v1"]
    assert len(old) == 36
    # Independently measured from approved base 8f9c2125, not today's registry.
    assert recipe_digest(old) == OLD36_DIGEST


def test_full04_migration_descriptor_inserts_are_exact_digest_bound_new_candidates():
    sql = SQL101.read_text()
    pattern = re.compile(r"INSERT INTO research\.execution_recipe_descriptors_v1\([^\n]+?\) VALUES\('([^']*)','([^']*)','([^']*)','((?:[^']|'')*)'::jsonb,'((?:[^']|'')*)'::jsonb\);")
    inserts = pattern.findall(sql)
    rows = {row["profile_id"]: row for row in json.loads(TABLE.read_text())["recipes"]
        if row["descriptor"]["schema_version"] == "research.full04-delta-profile.v1"}
    assert len(inserts) == len(rows) == 35
    for profile_id, profile_digest, full_digest, raw_descriptor, raw_policy in inserts:
        row = rows.pop(profile_id)
        descriptor = json.loads(raw_descriptor.replace("''", "'"))
        policy = json.loads(raw_policy.replace("''", "'"))
        assert descriptor == row["descriptor"]
        assert policy == {key: value for key, value in row.items() if key != "descriptor"}
        assert recipe_digest(descriptor) == profile_digest == row["profile_digest"]
        assert recipe_digest(row) == full_digest
        assert f"VALUES('{full_digest}','CANDIDATE_NOT_QUALIFIED','CANDIDATE',NULL,NULL,'OWNER_CELL_ONLY_NOT_PRODUCT_AUTHORITY')" in sql
        assert f"execution_profile_id='{profile_id}' AND execution_profile_digest='{profile_digest}' AND execution_profile_digest IS NOT NULL" in sql
        pair = descriptor["current_source"]
        assert f"source_adapter_id='{pair['source_adapter_id']}' AND profile_id='{pair['profile_id']}'" in sql
    assert rows == {}


def test_full04_migration_retains_prior_exact_digest_and_source_pair_predicates():
    before, after = SQL98.read_text(), SQL101.read_text()
    for pattern in (
        r"run_producers_execution_profile_id_check CHECK\(execution_profile_id IN\(([^\n]+?)\)\),",
        r"ADD CONSTRAINT run_producers_execution_profile_digest_check CHECK\(([\s\S]+?)\),\n ADD CONSTRAINT run_producers_full03_exact_check",
        r"current_source_seals_v1_source_profile_pair_check CHECK\(([\s\S]+?)\);",
    ):
        assert re.search(pattern, before).group(1) in after
    assert not re.search(r"\b(?:UPDATE|DELETE|TRUNCATE|CASCADE)\b", after)


def test_full04_migration_keeps_is_only_causal_and_full_sample_one_fold_semantics():
    rows = [row for row in json.loads(TABLE.read_text())["recipes"]
        if row["descriptor"]["schema_version"] == "research.full04-delta-profile.v1"]
    for row in rows:
        p = row["descriptor"]
        assert p["alpha_binding_requirements"]["alpha_version_id"] == "av_delta_rsi_polynomial_alpha_1_0_1"
        assert row["preview_override"] is None
        assert row["budgets"]["cpu_seconds"] == 120 and row["budgets"]["wall_seconds"] == 240
        if p["optimization_schedule"] == "per_fold_causal":
            assert p["optimization_mode"] == "mode_4_is_only_robust"
            assert p["inner_validation"] == "NOT_APPLICABLE" and "inner_constraints" not in p
            assert p["trial_scope"] == "PER_OUTER_FOLD_STUDY" and p["max_total_trials"] == 48
        if p["optimization_mode"] == "mode_5_full_robust":
            assert p["fold_bounds"] == row["public_profile"]["fold_bounds"] == {"min": 1, "max": 1}
