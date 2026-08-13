"""Strategy specification contract (implementation_plan_protoyype.md §6.1).

The specification is provenance for the UI/audit surfaces; it is never used to
re-implement signal logic. The structural thesis lives here as an immutable
record and is mirrored by the protected kernel in ``strategy/main.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class StrategySpecification:
    strategy_id: str
    display_name: str
    version: str
    default_timeframe: str
    required_columns: tuple[str, ...]
    structural_contract: dict[str, Any]
    parameter_space: dict[str, tuple[int | float, int | float, int | float]]


DELTA_RSI_SPECIFICATION = StrategySpecification(
    strategy_id="delta-rsi-polynomial-alpha",
    display_name="Delta-RSI Polynomial Alpha",
    version="1.0.0",
    default_timeframe="1h",
    required_columns=("open", "high", "low", "close", "volume"),
    structural_contract={
        "polynomial_degree": 2,
        "long_entry": "signal_line_crossing",
        "short_entry": "direction_change",
        "indicator_exit": "direction_change",
        "atr_filter": True,
        "relative_volume_filter": True,
        "hard_stop_loss": True,
        "trailing_stop": False,
        "take_profit": False,
    },
    parameter_space={
        "window": (20, 60, 2),
        "rsi_l": (12, 30, 1),
        "signalLength": (3, 20, 1),
        "len_atr1": (5, 20, 1),
        "len_atr2": (25, 60, 1),
        "rvol": (1.0, 2.5, 0.1),
        "len_vol": (8, 40, 2),
        "slpercent": (0.7, 2.5, 0.1),
    },
)
