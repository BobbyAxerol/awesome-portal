"""FULL-01 independent legacy digest/parity and shared confined budgets."""
from copy import deepcopy

import pytest

from portal_api.domain.research_execution_recipes import (
    execution_recipe, execution_recipe_budgets, assert_execution_recipe_table, recipe_digest,
)
from portal_api.domain.research_execution_recipes_generated import EXECUTION_RECIPE_TABLE, EXECUTION_RECIPE_REVISION
from portal_api.domain.research_delta_wfo_profile import DELTA_WFO_PROFILE, DELTA_WFO_PROFILE_ID
from portal_api.domain.research_delta_wfo_v2_profile import DELTA_WFO_V2_PROFILE, DELTA_WFO_V2_PROFILE_ID
from portal_api.domain.research_delta_causal_inner_profile import DELTA_CAUSAL_INNER_PROFILE, DELTA_CAUSAL_INNER_PROFILE_ID
from portal_api.domain.research_imported_alpha_profile import IMPORTED_ALPHA_PROFILE, IMPORTED_ALPHA_PROFILE_ID
from portal_api.domain.research_vn_observed_fixed_profile import vn_observed_fixed_profile, VN_OBSERVED_FIXED_PROFILE_ID
from portal_api.services.research_supervisor import ResearchChildLimits, DELTA_WFO_CHILD_LIMITS, IMPORTED_ALPHA_CHILD_LIMITS


@pytest.mark.parametrize("profile_id,descriptor", [
    (DELTA_WFO_PROFILE_ID,dict(DELTA_WFO_PROFILE)),(DELTA_WFO_V2_PROFILE_ID,DELTA_WFO_V2_PROFILE),
    (DELTA_CAUSAL_INNER_PROFILE_ID,dict(DELTA_CAUSAL_INNER_PROFILE)),
    (IMPORTED_ALPHA_PROFILE_ID,dict(IMPORTED_ALPHA_PROFILE)),(VN_OBSERVED_FIXED_PROFILE_ID,vn_observed_fixed_profile()),
])
def test_old_profile_descriptors_and_cross_language_shared_bytes(profile_id, descriptor):
    row = execution_recipe(profile_id)
    assert row["descriptor"] == descriptor
    assert recipe_digest(descriptor) == row["profile_digest"]
    assert recipe_digest(EXECUTION_RECIPE_TABLE) == EXECUTION_RECIPE_REVISION


def test_refuse_unknown_tampered_and_ambiguous_recipe():
    with pytest.raises(ValueError): execution_recipe("unknown")
    with pytest.raises(ValueError): execution_recipe(DELTA_WFO_PROFILE_ID,None)
    with pytest.raises(ValueError): execution_recipe(DELTA_WFO_PROFILE_ID,"0"*64)
    assert execution_recipe("p04.fixed-qualification.v1",None)["profile_digest"] is None
    changed = deepcopy(EXECUTION_RECIPE_TABLE)
    changed["recipes"][0]["budgets"]["cpu_seconds"] = 46
    with pytest.raises(ValueError): assert_execution_recipe_table(changed,EXECUTION_RECIPE_REVISION)
    with pytest.raises(ValueError): assert_execution_recipe_table(changed,recipe_digest(changed))
    duplicate = deepcopy(EXECUTION_RECIPE_TABLE)
    duplicate["recipes"].append(duplicate["recipes"][0])
    with pytest.raises(ValueError): assert_execution_recipe_table(duplicate,recipe_digest(duplicate))


def test_budget_defaults_and_no_shared_mutable_alias():
    row = execution_recipe(DELTA_WFO_PROFILE_ID)
    row["budgets"]["cpu_seconds"] = 999
    assert execution_recipe(DELTA_WFO_PROFILE_ID)["budgets"]["cpu_seconds"] == 120
    assert ResearchChildLimits().cpu_seconds == 45
    assert ResearchChildLimits().wall_seconds == 90
    assert DELTA_WFO_CHILD_LIMITS.cpu_seconds == 120
    assert DELTA_WFO_CHILD_LIMITS.wall_seconds == 240
    assert IMPORTED_ALPHA_CHILD_LIMITS.scratch_bytes == 134217728


def test_preview_never_widens_causal_and_refuses_production():
    preview = {"PORTAL_ENV":"local","PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO":"true"}
    assert execution_recipe_budgets(DELTA_WFO_PROFILE_ID,preview)["cpu_seconds"] == 1800
    assert execution_recipe_budgets(DELTA_CAUSAL_INNER_PROFILE_ID,preview)["cpu_seconds"] == 120
    with pytest.raises(ValueError):
        execution_recipe_budgets(DELTA_WFO_PROFILE_ID,{**preview,"PORTAL_ENV":"production"})
