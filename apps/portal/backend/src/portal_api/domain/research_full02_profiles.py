"""FULL-02 exact adapters; immutable historical identities are not broadened."""
from __future__ import annotations

from typing import Any, Mapping
import os
from .research_execution_recipes import execution_recipe, execution_recipe_qualification
from .research_delta_wfo_v2_profile import temporal_controls

DELTA_PER_FOLD_DECAY_PROFILE_ID = "p10.delta-signal-notional-per-fold-decay.v1"
DELTA_PER_FOLD_DECAY_PROFILE_DIGEST = "60ae004f65b0eba83ce12089b0224ab467b30a9acc4161ad0787108344cd134e"
DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID = "p10.delta-signal-notional-three-window-optimized.v1"
DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST = "0e210afa7c891cfb93e78126a4ca86fb6c1a25d3bcb4d8d81a5534accb5ee3c9"
DELTA_PER_FOLD_DECAY_PROFILE = execution_recipe(DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_PER_FOLD_DECAY_PROFILE_DIGEST)["descriptor"]
DELTA_THREE_WINDOW_OPTIMIZED_PROFILE = execution_recipe(DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST)["descriptor"]


def full02_profile_enabled(profile_id: str, env: Mapping[str, str] | None = None) -> bool:
    source = os.environ if env is None else env
    if profile_id not in (DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID):
        return False
    if source.get("PORTAL_FEATURE_RESEARCH_FULL02_PROFILE", "false") != "true":
        return False
    qualification = execution_recipe_qualification(profile_id)
    return qualification["kind"] == "PRODUCT_RUN_QUALIFIED" or (
        qualification["kind"] == "CANDIDATE_NOT_QUALIFIED"
        and source.get("PORTAL_ENV") == "local"
        and source.get("PORTAL_RECIPE_QUALIFICATION_PROFILE_ID") == profile_id)


def per_fold_decay_controls(spec: Mapping[str, Any]) -> dict[str, Any]:
    if spec.get("optimization_schedule") != "per_fold_decay":
        raise ValueError("the per-fold-decay profile requires its exact schedule")
    # Identical temporal axes, not identical selection semantics. Validate a
    # projection without modifying the immutable input or disguising the work.
    return temporal_controls({**spec, "optimization_schedule": "global"})
