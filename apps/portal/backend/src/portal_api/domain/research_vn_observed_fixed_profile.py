"""One immutable FPT observed-date research profile; no VN venue authority."""
from __future__ import annotations
from portal_api.domain.research_execution_recipes import execution_recipe


import hashlib
import json
import os
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

VN_OBSERVED_FIXED_PROFILE_ID = "p10.vn-stock-daily-observed-fixed.v1"
VN_OBSERVED_FIXED_PROFILE_DIGEST = "acb6566ebae23bcf77c77974136c9d083a95f0967260b1332530f600f5abe00e"
VN_OBSERVED_FIXED_FLAG = "PORTAL_FEATURE_RESEARCH_VN_OBSERVED_PROFILE"
_PROFILE = execution_recipe(VN_OBSERVED_FIXED_PROFILE_ID)["descriptor"]


def vn_observed_fixed_profile() -> dict:
    return json.loads(json.dumps(_PROFILE, sort_keys=True, separators=(",", ":"), ensure_ascii=False))


def vn_observed_fixed_profile_digest(value: dict | None = None) -> str:
    raw = json.dumps(_PROFILE if value is None else value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()


if vn_observed_fixed_profile_digest() != VN_OBSERVED_FIXED_PROFILE_DIGEST:
    raise RuntimeError("VN observed fixed profile digest drifted")


def vn_observed_fixed_enabled() -> bool:
    return os.getenv(VN_OBSERVED_FIXED_FLAG, "false").strip().lower() == "true"


def vn_source_instant(value: object) -> datetime:
    if not isinstance(value, str) or not 1 <= len(value) <= 64:
        raise ValueError("VN observed fixed boundary is invalid")
    fraction = re.search(r"[T ]\d{2}:\d{2}:\d{2}[.,](\d+)", value)
    if fraction is not None and (len(fraction.group(1)) > 9 or any(digit != "0" for digit in fraction.group(1))):
        raise ValueError("VN observed fixed boundaries must be source-local date midnights")
    try:
        instant = datetime.fromisoformat(value.replace("Z", "+00:00"))
        local = instant.replace(tzinfo=ZoneInfo("Asia/Ho_Chi_Minh")) if instant.tzinfo is None else instant.astimezone(ZoneInfo("Asia/Ho_Chi_Minh"))
    except (TypeError, ValueError) as exc:
        raise ValueError("VN observed fixed boundary is invalid") from exc
    if local.hour or local.minute or local.second or local.microsecond:
        raise ValueError("VN observed fixed boundaries must be source-local date midnights")
    return local.astimezone(timezone.utc)


def validate_vn_observed_fixed_spec(spec: dict) -> None:
    if (spec.get("schema_version") != "research.requested-spec.v1"
            or spec.get("execution_route") != "signal_notional" or spec.get("protocol") != "three_window_decay"
            or spec.get("optimization_mode") != "mode_1_decay" or spec.get("optimization_schedule") != "global"
            or type(spec.get("optuna_trials")) is not int or spec["optuna_trials"] != 1
            or spec.get("early_stopping") is not None or spec.get("random_seed") is not None
            or spec.get("walk_forward") is not None or spec.get("route_params") or spec.get("optimization_config")
            or spec.get("parameter_space_overrides")):
        raise ValueError("VN observed fixed profile requires its exact fixed signal-notional tuple")
    data, client, windows = spec.get("data"), spec.get("client"), spec.get("windows")
    if not isinstance(data, dict) or any(data.get(key) != _PROFILE[key] for key in ("dataset_id", "symbol", "timeframe")):
        raise ValueError("VN observed fixed profile admits only qualified FPT source daily bars")
    if not isinstance(client, dict) or client.get("engine_release_id") != "er_quantbt_111":
        raise ValueError("VN observed fixed profile requires QuantBT 1.1.1")
    if not isinstance(windows, dict) or set(windows) != {"is", "oos", "holdout"}:
        raise ValueError("VN observed fixed profile requires its three source windows")
    pairs = []
    for key in ("is", "oos", "holdout"):
        window = windows[key]
        if not isinstance(window, dict) or set(window) != {"start", "end_exclusive"}:
            raise ValueError("VN observed fixed window is invalid")
        start, end = vn_source_instant(window["start"]), vn_source_instant(window["end_exclusive"])
        if start >= end:
            raise ValueError("VN observed fixed window has no positive range")
        pairs.append((start, end))
    if pairs[0][1] != pairs[1][0] or pairs[1][1] != pairs[2][0] or (pairs[-1][1] - pairs[0][0]).total_seconds() > 732 * 86400:
        raise ValueError("VN observed fixed chronology/span is invalid")
