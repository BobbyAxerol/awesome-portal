"""Strategy registry over the clean strategy package (§5, §6).

Maps ``strategy_id`` to its immutable specification and to the generator
module. The registry itself performs no kernel import; ``get_generators``
returns the module, whose heavy imports stay lazy.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

import pandas as pd

from .specification import DELTA_RSI_SPECIFICATION, StrategySpecification


@runtime_checkable
class StrategyGenerators(Protocol):
    """Runtime surface of one strategy package module."""

    def generate_signals(self, data: pd.DataFrame, params: dict[str, object]) -> pd.DataFrame: ...

    def build_walkforward_signal(
        self,
        data: pd.DataFrame,
        params: dict[str, object],
        train_index: pd.DatetimeIndex,
        test_index: pd.DatetimeIndex,
        fold: object,
    ) -> pd.Series: ...

    def warm_up(self, params: dict[str, object] | None = None) -> None: ...


# Immutable registry map; do not mutate after definition.
_SPECIFICATIONS = {
    DELTA_RSI_SPECIFICATION.strategy_id: DELTA_RSI_SPECIFICATION,
}


def list_specifications() -> tuple[StrategySpecification, ...]:
    return tuple(_SPECIFICATIONS.values())


def get_specification(strategy_id: str) -> StrategySpecification:
    try:
        return _SPECIFICATIONS[strategy_id]
    except KeyError as exc:
        raise KeyError(f"unknown strategy_id: {strategy_id}") from exc


def get_generators(strategy_id: str) -> StrategyGenerators:
    get_specification(strategy_id)
    if strategy_id == DELTA_RSI_SPECIFICATION.strategy_id:
        from . import delta_rsi

        return delta_rsi
    raise KeyError(f"no generator registered for strategy_id: {strategy_id}")


__all__ = [
    "StrategyGenerators",
    "list_specifications",
    "get_specification",
    "get_generators",
]
