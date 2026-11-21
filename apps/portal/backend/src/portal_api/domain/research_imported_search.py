"""FULL05 immutable source declaration and narrowed parameter custody (no engine/IO)."""
from __future__ import annotations

import math
import re
from decimal import Decimal
from typing import Any, Mapping

from .research_execution_recipes import recipe_digest


def bind_parameter_space(declaration: Mapping[str, Any], overrides: object) -> dict[str, Any]:
    raw = declaration.get("parameter_space")
    if not isinstance(raw, dict) or not 1 <= len(raw) <= 12 or not isinstance(overrides, list):
        raise ValueError("ALPHA_DECLARATION_NOT_PUBLISHED")
    choices = {}
    for item in overrides:
        if not isinstance(item, dict) or item.get("name") in choices:
            raise ValueError("ALPHA_PARAMETER_NOT_DECLARED")
        choices[item.get("name")] = item
    space: dict[str, Any] = {}
    for name, p in raw.items():
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", name) or not isinstance(p, dict):
            raise ValueError("ALPHA_DECLARATION_NOT_PUBLISHED")
        override = choices.pop(name, None)
        kind = p.get("kind")
        if kind == "fixed":
            scalar(p.get("value"))
            if override and (override.get("kind") != "pin" or type(override.get("value")) is not type(p["value"]) and not _numeric_pair(override.get("value"), p["value"]) or override.get("value") != p["value"]):
                raise ValueError("ALPHA_PARAMETER_OUTSIDE_DECLARATION")
            space[name] = {"kind": "fixed", "value": p["value"]}
        elif kind == "categorical":
            values = p.get("values")
            if not isinstance(values, list) or not 1 <= len(values) <= 64:
                raise ValueError("ALPHA_DECLARATION_NOT_PUBLISHED")
            for value in values:
                scalar(value)
            if override:
                value = override.get("value")
                if override.get("kind") != "pin" or not any((type(value) is type(v) or _numeric_pair(value, v)) and value == v for v in values):
                    raise ValueError("ALPHA_PARAMETER_OUTSIDE_DECLARATION")
                space[name] = {"kind": "fixed", "value": value}
            else:
                space[name] = {"kind": "categorical", "values": list(values)}
        elif kind in {"int_range", "float_range"}:
            low, high, step = (p.get(key) for key in ("low", "high", "step"))
            if not all(type(v) in (int, float) and math.isfinite(v) for v in (low, high, step)) or low > high or step <= 0:
                raise ValueError("ALPHA_DECLARATION_NOT_PUBLISHED")
            if kind == "int_range" and not all(float(v).is_integer() for v in (low, high, step)):
                raise ValueError("ALPHA_DECLARATION_NOT_PUBLISHED")
            def on_grid(value: Any) -> bool:
                if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
                    return False
                units = (Decimal(str(value)) - Decimal(str(low))) / Decimal(str(step))
                return abs(units - units.to_integral_value()) <= Decimal("1e-9")
            if override:
                if override.get("kind") == "pin" and on_grid(override.get("value")):
                    space[name] = {"kind": "fixed", "value": override["value"]}
                elif override.get("kind") == "sweep" and on_grid(override.get("low")) and on_grid(override.get("high")) and override["low"] <= override["high"]:
                    space[name] = {"kind": kind, "low": override["low"], "high": override["high"], "step": step}
                else:
                    raise ValueError("ALPHA_PARAMETER_OUTSIDE_DECLARATION")
            else:
                space[name] = {"kind": kind, "low": low, "high": high, "step": step}
        else:
            raise ValueError("ALPHA_DECLARATION_NOT_PUBLISHED")
    if choices:
        raise ValueError("ALPHA_PARAMETER_NOT_DECLARED")
    for p in space.values():
        values = [p["value"]] if p["kind"] == "fixed" else p.get("values", [])
        if any(type(value) not in (int, float) for value in values):
            raise ValueError("IMPORTED_NON_NUMERIC_SEARCH_NOT_QUALIFIED")
        if p["kind"] == "categorical" and len({float(v).is_integer() for v in values}) > 1:
            raise ValueError("IMPORTED_MIXED_NUMERIC_CATEGORY_NOT_QUALIFIED")
    return space


def _numeric_pair(left: Any, right: Any) -> bool:
    return type(left) in (int, float) and type(right) in (int, float)


def validate_trial_parameters(space: Mapping[str, Any], params: Mapping[str, Any]) -> None:
    """Check each engine candidate, including synthetic targets, before source execution."""
    if set(space) != set(params):
        raise ValueError("ALPHA_PARAMETER_BINDING_MISMATCH")
    for name, p in space.items():
        value = params[name]
        if type(value) not in (int, float) or not math.isfinite(value):
            raise ValueError("ALPHA_PARAMETER_OUTSIDE_DECLARATION")
        if p["kind"] == "fixed":
            valid = value == p["value"]
        elif p["kind"] == "categorical":
            valid = value in p["values"]
        else:
            units = (Decimal(str(value)) - Decimal(str(p["low"]))) / Decimal(str(p["step"]))
            valid = p["low"] <= value <= p["high"] and abs(units - units.to_integral_value()) <= Decimal("1e-9")
            if p["kind"] == "int_range":
                valid = valid and float(value).is_integer()
        if not valid:
            raise ValueError("ALPHA_PARAMETER_OUTSIDE_DECLARATION")


def scalar(value: Any) -> None:
    if type(value) not in (str, int, float, bool) or isinstance(value, str) and len(value) > 256 or isinstance(value, float) and not math.isfinite(value):
        raise ValueError("ALPHA_PARAMETER_OUTSIDE_DECLARATION")


def validate_imported_search_binding(binding: object, *, spec: Mapping[str, Any] | None = None) -> dict[str, Any]:
    fields = {"schema_version", "source_digest", "entrypoint", "declaration", "declaration_digest", "parameter_space", "parameter_space_digest"}
    if not isinstance(binding, dict) or set(binding) != fields or binding["schema_version"] != "research.imported-search-binding.v1":
        raise ValueError("ALPHA_DECLARATION_NOT_PUBLISHED")
    declaration = binding["declaration"]
    if not isinstance(declaration, dict) or declaration.get("schema_version") != "research.alpha-source.v1" or declaration.get("entrypoint") != binding["entrypoint"]:
        raise ValueError("ALPHA_DECLARATION_NOT_PUBLISHED")
    if not isinstance(binding["source_digest"], str) or not re.fullmatch(r"[a-f0-9]{64}", binding["source_digest"]):
        raise ValueError("ALPHA_SOURCE_DIGEST_MISMATCH")
    warmup = declaration.get("warmup_bars")
    if type(warmup) is not int or not 1 <= warmup <= 4096 or not isinstance(declaration.get("determinism"), dict):
        raise ValueError("IMPORTED_WARMUP_EXCEEDS_EXECUTOR_LIMIT")
    if recipe_digest(declaration) != binding["declaration_digest"] or recipe_digest(binding["parameter_space"]) != binding["parameter_space_digest"]:
        raise ValueError("ALPHA_DECLARATION_DIGEST_MISMATCH")
    if spec is not None:
        if spec.get("data", {}).get("timeframe") not in declaration.get("timeframes", []):
            raise ValueError("ALPHA_TIMEFRAME_NOT_DECLARED")
        if spec.get("random_seed") != 42:
            raise ValueError("ALPHA_RANDOM_SEED_REQUIRED")
        if bind_parameter_space(declaration, spec.get("parameter_space_overrides")) != binding["parameter_space"]:
            raise ValueError("ALPHA_PARAMETER_BINDING_MISMATCH")
        if spec.get("optimization_mode") == "mode_3_flat_minima" and any(p["kind"] == "categorical" for p in binding["parameter_space"].values()):
            raise ValueError("IMPORTED_CATEGORICAL_CENTROID_NOT_APPLICABLE")
    return binding
