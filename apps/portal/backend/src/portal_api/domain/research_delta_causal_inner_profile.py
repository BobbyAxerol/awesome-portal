"""Immutable causal/nested executor; historical global profiles stay unchanged."""
from __future__ import annotations
from portal_api.domain.research_execution_recipes import execution_recipe


import hashlib
import json
import re
from types import MappingProxyType
from typing import Any, Mapping

DELTA_CAUSAL_INNER_PROFILE_ID = "p10.delta-signal-notional-causal-inner.v1"
_PROFILE = execution_recipe(DELTA_CAUSAL_INNER_PROFILE_ID)["descriptor"]
DELTA_CAUSAL_INNER_PROFILE_DIGEST = "60a041b373808405f8896aee0a3421d41cc2199d516dadc9f40e1187e2fefdd1"
if hashlib.sha256(json.dumps(_PROFILE, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest() != DELTA_CAUSAL_INNER_PROFILE_DIGEST:
    raise RuntimeError("Causal inner executor profile digest drifted")
DELTA_CAUSAL_INNER_PROFILE = MappingProxyType(_PROFILE)


def causal_inner_controls(spec: Mapping[str, Any]) -> dict[str, Any]:
    """Exact requested-spec v2 controls allowed across the confined child port."""
    p = DELTA_CAUSAL_INNER_PROFILE
    wf = spec.get("walk_forward")
    if spec.get("schema_version") != p["requested_spec_version"] or not isinstance(wf, dict):
        raise ValueError("causal inner execution requires an advanced requested-spec v2")
    if spec.get("optimization_mode") != p["optimization_mode"] or spec.get("optimization_schedule") != p["optimization_schedule"]:
        raise ValueError("causal inner execution requires mode_1_decay/per_fold_causal")
    if wf.get("frequency") not in p["frequencies"] or wf.get("window_mode") not in p["window_modes"]:
        raise ValueError("causal inner frequency/window mode is not admitted")
    width = wf.get("train_window")
    if width is not None and (not isinstance(width, str) or not re.fullmatch(r"[1-9][0-9]{0,4}(D|h)", width)):
        raise ValueError("causal outer train width must be bounded")
    if wf.get("window_mode") == "rolling" and width is None:
        raise ValueError("causal rolling execution requires its outer train width")
    if wf.get("window_mode") == "expanding" and width is not None:
        raise ValueError("causal expanding execution forbids an outer rolling width")
    inner = wf.get("inner")
    if not isinstance(inner, dict) or not {"split_frequency", "window_mode", "train_window"} <= inner.keys() or set(inner) - {"split_frequency", "window_mode", "train_window", "min_folds"}:
        raise ValueError("causal Mode 1 requires its closed inner validation object")
    if inner["split_frequency"] not in p["inner_constraints"]["frequencies"] or inner["window_mode"] not in p["inner_constraints"]["window_modes"]:
        raise ValueError("causal inner frequency/window mode is not admitted")
    if not isinstance(inner["train_window"], str) or not re.fullmatch(r"[1-9][0-9]{0,4}(D|h)", inner["train_window"]):
        raise ValueError("causal inner train width must be bounded")
    minimum = inner.get("min_folds", 2)
    if isinstance(minimum, bool) or not isinstance(minimum, int) or not 2 <= minimum <= 16:
        raise ValueError("causal inner minimum folds must be 2..16")
    controls = {"split_frequency": wf["frequency"], "window_mode": wf["window_mode"], "train_window": width,
        "inner_split_frequency": inner["split_frequency"], "inner_window_mode": inner["window_mode"],
        "inner_train_window": inner["train_window"], "inner_min_folds": minimum}
    for name in ("label_horizon_bars", "purge_bars", "embargo_bars"):
        value = wf.get(name, 0)
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= p["max_guard_bars"]:
            raise ValueError("causal temporal guard exceeds the admitted bound")
        controls[name] = value
    return controls
