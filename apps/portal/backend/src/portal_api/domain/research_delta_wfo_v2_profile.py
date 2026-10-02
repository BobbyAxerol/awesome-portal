"""Versioned, bounded requested-spec v2 executor; W1's digest stays immutable.

V2 global Mode 1 consumes rolling width and all three temporal guards. Inner
causal selection is not mislabeled as global: it requires its own retained
selection-sequence profile. The caller receives an explicit refusal today.
"""
from __future__ import annotations
import hashlib
import json
import re
from typing import Any, Mapping

DELTA_WFO_V2_PROFILE_ID = "p10.delta-signal-notional-wfo.v2"
DELTA_WFO_V2_PROFILE = {
    "schema_version": "research.p10.delta-wfo-profile.v2",
    "profile_id": DELTA_WFO_V2_PROFILE_ID,
    "adapter_id": "p04.delta-rsi.v1",
    "adapter_contract_digest": "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
    "engine_release_id": "er_quantbt_111", "requested_spec_version": "research.requested-spec.v2",
    "execution_route": "signal_notional", "protocol": "advanced", "timeframe": "1h",
    "frequencies": ["weekly", "monthly", "quarterly"], "window_modes": ["expanding", "rolling"],
    "max_span_days": 92, "fold_bounds": {"min": 2, "max": 16},
    "optimization_mode": "mode_1_decay", "optimization_schedule": "global", "random_seed": 42,
    "max_guard_bars": 10_000, "inner_validation": "NOT_ADMITTED_GLOBAL_RETENTION_ONLY",
    "trial_count": {"min": 3, "max": 3},
    "current_source": {"source_adapter_id": "rs02.quantbt-signal-notional-wfo.v1", "profile_id": "rs02.delta-signal-notional-wfo.v1"},
    "child_limits": {"cpu_seconds": 120, "wall_seconds": 240},
}
DELTA_WFO_V2_PROFILE_DIGEST = hashlib.sha256(json.dumps(DELTA_WFO_V2_PROFILE,
    sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
if DELTA_WFO_V2_PROFILE_DIGEST != "d65291f776dce1fef162da9eb6505ba63fc6e3ae0f55679fe12dece3858c7fa0":
    raise RuntimeError("Requested-spec v2 executor profile digest drifted")

def temporal_controls(spec: Mapping[str, Any]) -> dict[str, Any]:
    """Only validated, bounded knobs may cross the no-network child boundary."""
    wf = spec.get("walk_forward")
    if spec.get("schema_version") != "research.requested-spec.v2" or not isinstance(wf, dict):
        raise ValueError("the temporal executor requires an advanced requested-spec v2")
    p = DELTA_WFO_V2_PROFILE
    if spec.get("optimization_mode") != p["optimization_mode"] or spec.get("optimization_schedule") != p["optimization_schedule"]:
        raise ValueError("the temporal retained profile executes mode_1_decay/global only")
    if wf.get("inner") is not None:
        raise ValueError("inner causal selection requires a retained per-fold selection profile")
    if wf.get("frequency") not in p["frequencies"] or wf.get("window_mode") not in p["window_modes"]:
        raise ValueError("the temporal executor frequency/window mode is not admitted")
    width = wf.get("train_window")
    if width is not None and (not isinstance(width, str) or not re.fullmatch(r"[1-9][0-9]{0,4}(D|h)", width)):
        raise ValueError("the temporal executor requires a bounded train width")
    if wf.get("window_mode") == "rolling" and width is None:
        raise ValueError("rolling execution requires its explicit train width")
    controls = {"split_frequency": wf["frequency"], "window_mode": wf["window_mode"], "train_window": width}
    for name in ("label_horizon_bars", "purge_bars", "embargo_bars"):
        value = wf.get(name, 0)
        if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= p["max_guard_bars"]:
            raise ValueError("the temporal executor guard is outside its admitted bound")
        controls[name] = value
    return controls
