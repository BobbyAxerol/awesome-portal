"""FULL05 confined strategy callback. The engine still owns selection/accounting."""
from __future__ import annotations

import hashlib
import math
from types import SimpleNamespace
from typing import Any

from portal_api.domain.research_imported_search import validate_imported_search_binding, validate_trial_parameters
from portal_api.domain.requests import ParameterSpaceConfig, ParameterSpec
from portal_api.services.research_alpha_definition import load_research_alpha_definition


def imported_strategy(source_bytes: bytes, binding: dict[str, Any], history: Any, *,
                      alpha_id: str, alpha_version_id: str) -> tuple[Any, Any, ParameterSpaceConfig]:
    import pandas as pd

    validate_imported_search_binding(binding)
    if not 1 <= len(source_bytes) <= 256 * 1024 or hashlib.sha256(source_bytes).hexdigest() != binding["source_digest"]:
        raise ValueError("ALPHA_SOURCE_DIGEST_MISMATCH")
    entrypoint, declaration = load_research_alpha_definition(source_bytes.decode("utf-8"), expected_entrypoint=binding["entrypoint"])
    if declaration != binding["declaration"]:
        raise ValueError("ALPHA_DECLARATION_DIGEST_MISMATCH")
    required, warmup = declaration["required_columns"], declaration["warmup_bars"]
    if not isinstance(required, list) or not required or any(c not in {"open", "high", "low", "close", "volume"} or c not in history for c in required):
        raise ValueError("ALPHA_REQUIRED_COLUMNS_NOT_AVAILABLE")
    index = pd.DatetimeIndex(history.index)
    if len(history) > 100_000 or index.tz is None or str(index.tz) != "UTC" or not index.is_unique or not index.is_monotonic_increasing:
        raise ValueError("ALPHA_HISTORY_OUTSIDE_PROFILE")
    arrays = {column: tuple(float(v) for v in history[column]) for column in required}
    space = ParameterSpaceConfig({name: ParameterSpec(**p) for name, p in binding["parameter_space"].items()})

    def signal(data, params, train_index, test_index, fold):
        # Per-bar contexts contain past/current bars only, never scoring future,
        # OOS/Holdout labels, engine objects, handles or mutable dataframes.
        validate_trial_parameters(binding["parameter_space"], params)
        positions = index.get_indexer(pd.DatetimeIndex(test_index))
        if bool((positions < 0).any()):
            raise ValueError("ALPHA_HISTORY_OUTSIDE_PROFILE")
        values = []
        for position in positions:
            if position < warmup:
                values.append(0.0)
                continue
            context = {"schema_version": "research.imported-alpha-context.v1",
                "timestamp_utc_ms": int(index[position].value // 1_000_000), "bar_index": int(position),
                "history": {c: arrays[c][max(0, position-warmup):position+1] for c in required},
                "parameters": dict(params), "random_seed": 42}
            output = entrypoint(context)
            if not isinstance(output, dict) or set(output) != {"schema_version", "signal_notional"} or output["schema_version"] != "research.imported-signal-notional-output.v1":
                raise ValueError("ALPHA_OUTPUT_CONTRACT_REJECTED")
            value = output["signal_notional"]
            if type(value) not in (int, float) or not math.isfinite(value) or abs(value) > 1e12:
                raise ValueError("ALPHA_OUTPUT_CONTRACT_REJECTED")
            values.append(float(value))
        return pd.Series(values, index=test_index, name="signal_notional", dtype="float64")

    specification = SimpleNamespace(strategy_id=alpha_id, display_name=alpha_id, version=alpha_version_id,
        default_timeframe=declaration["timeframes"][0], required_columns=tuple(required),
        structural_contract=declaration, parameter_space=binding["parameter_space"])
    return signal, specification, space


class ImportedStrategyRegistry:
    """One child-owned, immutable adapter; never a registry/plugin lookup."""
    def __init__(self, specification: Any, space: ParameterSpaceConfig) -> None:
        self.specification, self.space = specification, space

    def get(self, strategy_id: str) -> Any:
        if strategy_id != self.specification.strategy_id:
            raise ValueError("ALPHA_PARAMETER_BINDING_MISMATCH")
        return self

    def validate_parameter_space(self, space: ParameterSpaceConfig) -> None:
        if space != self.space:
            raise ValueError("ALPHA_PARAMETER_BINDING_MISMATCH")
