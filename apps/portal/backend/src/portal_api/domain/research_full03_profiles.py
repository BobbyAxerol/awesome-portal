"""Exact image-owned indexed recipes, never a timeframe menu authority.

The source-controlled registry supplies each admitted interval and its clock.
Delta recipes require the installed kernel binding. FULL05 recipes require the
separate immutable imported adapter dependency. Neither grants create authority.
"""
from __future__ import annotations

import os
import re
from typing import Any, Mapping

from .research_execution_recipes import execution_recipe, execution_recipe_qualification

FULL03_DELTA_ADAPTER_ID = "full03.delta-rsi.v1"
FULL03_DELTA_ALPHA_ID = "delta-rsi-polynomial-alpha"
FULL03_DELTA_ALPHA_VERSION_ID = "av_delta_rsi_polynomial_alpha_1_0_1"
FULL03_DELTA_ADAPTER_CONTRACT_DIGEST = "23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b"
_WIDTH = re.compile(r"[1-9][0-9]{0,4}(D|h)")


def is_full03_profile(profile_id: str) -> bool:
    try:
        row = execution_recipe(profile_id)
        return row["descriptor"].get("adapter_id") == FULL03_DELTA_ADAPTER_ID or row["source_requirement"] == "IMPORTED_IMMUTABLE_SEARCH_BINDING"
    except ValueError:
        return False


def full03_recipe(profile_id: str, profile_digest: object) -> dict[str, Any]:
    row = execution_recipe(profile_id, profile_digest)
    p = row["descriptor"]
    if row["source_requirement"] == "IMPORTED_IMMUTABLE_SEARCH_BINDING":
        from .research_imported_alpha_profile import IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST, IMPORTED_ALPHA_ADAPTER_ID
        if (row["adapter_kind"] != "IMPORTED_SEARCH" or p.get("adapter_id") != IMPORTED_ALPHA_ADAPTER_ID
                or p.get("adapter_contract_digest") != IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST or row["preview_override"] is not None):
            raise ValueError("FULL05 imported recipe dependency mismatch")
        return row
    if (p.get("adapter_id") != FULL03_DELTA_ADAPTER_ID
            or row["adapter_kind"] not in {"DELTA_WFO", "DELTA_THREE_WINDOW_OPTIMIZED"}
            or row["source_requirement"] != "FULL03_IMMUTABLE_DELTA_BINDING"
            or row["preview_override"] is not None):
        raise ValueError("FULL-03 requires its exact installed Delta recipe")
    requirement, clock = p.get("alpha_binding_requirements"), p.get("source_clock")
    if (not isinstance(requirement, dict)
            or requirement.get("alpha_id") != FULL03_DELTA_ALPHA_ID
            or requirement.get("alpha_version_id") != FULL03_DELTA_ALPHA_VERSION_ID
            or requirement.get("adapter_id") != FULL03_DELTA_ADAPTER_ID
            or requirement.get("adapter_contract_digest") != p["adapter_contract_digest"]
            or p["adapter_contract_digest"] != FULL03_DELTA_ADAPTER_CONTRACT_DIGEST
            or requirement.get("warmup_bars") != 300
            or not isinstance(clock, dict)
            or clock.get("clock_basis") != "FIXED_UTC_INTERVAL_V1"
            or clock.get("source_timezone") != "UTC"
            or clock.get("warmup_semantics") != "FIXED_INTERVAL_PREDECESSORS_V1"
            or type(clock.get("bar_interval_ms")) is not int or clock["bar_interval_ms"] <= 0):
        raise ValueError("FULL-03 recipe has an incompatible Alpha/source-clock binding")
    interval = re.fullmatch(r"([1-9][0-9]*)(m|h|d)", p.get("timeframe", ""))
    if interval is None or int(interval[1]) * {"m": 60_000, "h": 3_600_000, "d": 86_400_000}[interval[2]] != clock["bar_interval_ms"]:
        raise ValueError("FULL-03 timeframe and source interval disagree")
    return row


def full03_profile_enabled(profile_id: str, env: Mapping[str, str] | None = None) -> bool:
    source = os.environ if env is None else env
    if not is_full03_profile(profile_id):
        return False
    if execution_recipe(profile_id)["source_requirement"] == "IMPORTED_IMMUTABLE_SEARCH_BINDING":
        qualification = execution_recipe_qualification(profile_id)
        return source.get("PORTAL_FEATURE_RESEARCH_FULL05_PROFILE") == "true" and source.get("PORTAL_FEATURE_RESEARCH_IMPORTED_EXECUTION") == "true" and (
            qualification["kind"] == "PRODUCT_RUN_QUALIFIED" or qualification["kind"] == "CANDIDATE_NOT_QUALIFIED"
            and source.get("PORTAL_ENV") == "local" and source.get("PORTAL_RECIPE_QUALIFICATION_PROFILE_ID") == profile_id)
    if not is_full03_profile(profile_id) or source.get("PORTAL_FEATURE_RESEARCH_FULL03_PROFILE", "false") != "true":
        return False
    qualification = execution_recipe_qualification(profile_id)
    row = execution_recipe(profile_id)
    if ("FEATURE_RESEARCH_FULL04_PROFILE" in row["feature_flags"]
            and source.get("PORTAL_FEATURE_RESEARCH_FULL04_PROFILE", "false") != "true"):
        return False
    return qualification["kind"] == "PRODUCT_RUN_QUALIFIED" or (
        qualification["kind"] == "CANDIDATE_NOT_QUALIFIED"
        and source.get("PORTAL_ENV") == "local"
        and source.get("PORTAL_RECIPE_QUALIFICATION_PROFILE_ID") == profile_id)


def full03_execution_binding(row: Mapping[str, Any]) -> dict[str, Any]:
    p = row["descriptor"]
    requirement = p["alpha_binding_requirements"]
    fields = ("adapter_id", "adapter_contract_digest") if row["source_requirement"] == "IMPORTED_IMMUTABLE_SEARCH_BINDING" else ("alpha_id", "alpha_version_id", "adapter_id", "adapter_contract_digest")
    return {name: requirement[name] for name in fields} | {
        "timeframe": p["timeframe"], "source_clock": dict(p["source_clock"])}


def validate_full03_execution_binding(binding: object, row: Mapping[str, Any]) -> None:
    if binding != full03_execution_binding(row):
        raise ValueError("FULL-03 child Alpha/timeframe/source-clock binding does not match its exact recipe")


def full03_controls(spec: Mapping[str, Any], row: Mapping[str, Any]) -> dict[str, Any] | None:
    """Retain global, fold-local decay and causal-inner semantics independently."""
    p = row["descriptor"]
    if p["protocol"] == "three_window_decay":
        return None
    wf = spec.get("walk_forward")
    if (spec.get("schema_version") != p["requested_spec_version"] or not isinstance(wf, dict)
            or spec.get("optimization_mode") != p["optimization_mode"]
            or spec.get("optimization_schedule") != p["optimization_schedule"]):
        raise ValueError("FULL-03 temporal controls require their exact mode/schedule/version")
    if wf.get("frequency") not in p["frequencies"] or wf.get("window_mode") not in p["window_modes"]:
        raise ValueError("FULL-03 frequency/window mode is outside its exact recipe")
    width = wf.get("train_window")
    if width is not None and (not isinstance(width, str) or not _WIDTH.fullmatch(width)):
        raise ValueError("FULL-03 train width must be bounded")
    if wf["window_mode"] == "rolling" and width is None:
        raise ValueError("FULL-03 rolling execution requires its explicit train width")
    if wf["window_mode"] == "expanding" and width is not None:
        raise ValueError("FULL-03 expanding execution forbids a rolling width")
    controls = {"split_frequency": wf["frequency"], "window_mode": wf["window_mode"], "train_window": width}
    for name in ("label_horizon_bars", "purge_bars", "embargo_bars"):
        value = wf.get(name, 0)
        if type(value) is not int or not 0 <= value <= p["max_guard_bars"]:
            raise ValueError("FULL-03 temporal guard is outside its exact recipe")
        controls[name] = value
    inner = wf.get("inner")
    if p["optimization_schedule"] != "per_fold_causal" or "inner_constraints" not in p:
        if inner is not None:
            raise ValueError("FULL-03 non-causal recipe forbids inner validation")
        return controls
    limits = p["inner_constraints"]
    if (not isinstance(inner, dict) or not {"split_frequency", "window_mode", "train_window"} <= inner.keys()
            or set(inner) - {"split_frequency", "window_mode", "train_window", "min_folds"}
            or inner["split_frequency"] not in limits["frequencies"]
            or inner["window_mode"] not in limits["window_modes"]
            or not isinstance(inner["train_window"], str) or not _WIDTH.fullmatch(inner["train_window"])):
        raise ValueError("FULL-03 causal recipe requires its exact bounded inner controls")
    minimum = inner.get("min_folds", limits["fold_bounds"]["min"])
    if type(minimum) is not int or not limits["fold_bounds"]["min"] <= minimum <= limits["fold_bounds"]["max"]:
        raise ValueError("FULL-03 inner minimum folds is outside its exact recipe")
    controls.update(inner_split_frequency=inner["split_frequency"], inner_window_mode=inner["window_mode"],
        inner_train_window=inner["train_window"], inner_min_folds=minimum)
    return controls


def full03_controls_from_receipt(receipt: Mapping[str, Any], row: Mapping[str, Any]) -> dict[str, Any] | None:
    p = row["descriptor"]
    causal = p["optimization_schedule"] == "per_fold_causal"
    key = "causal_inner_controls" if causal else "temporal_controls"
    other = "temporal_controls" if causal else "causal_inner_controls"
    if "optuna_trials" in receipt or other in receipt:
        raise ValueError("FULL-03 recipes forbid preview trial overrides and foreign controls")
    raw = receipt.get(key)
    fields = {"split_frequency", "window_mode", "train_window", "label_horizon_bars", "purge_bars", "embargo_bars"}
    nested = causal and "inner_constraints" in p
    if nested:
        fields |= {"inner_split_frequency", "inner_window_mode", "inner_train_window", "inner_min_folds"}
    if not isinstance(raw, dict) or set(raw) != fields:
        raise ValueError("FULL-03 child requires exactly its bounded temporal controls")
    wf = {"frequency": raw["split_frequency"], **{k: v for k, v in raw.items() if k != "split_frequency" and not k.startswith("inner_")}}
    if nested:
        wf["inner"] = {"split_frequency": raw["inner_split_frequency"], "window_mode": raw["inner_window_mode"],
            "train_window": raw["inner_train_window"], "min_folds": raw["inner_min_folds"]}
    return full03_controls({"schema_version": p["requested_spec_version"], "optimization_mode": p["optimization_mode"],
        "optimization_schedule": p["optimization_schedule"], "walk_forward": wf}, row)
