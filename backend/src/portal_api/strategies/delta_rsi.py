from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

import pandas as pd

from portal_api.domain.errors import ParameterSpaceError
from portal_api.domain.requests import ParameterSpaceConfig


@dataclass(frozen=True, slots=True)
class StrategySpecification:
    strategy_id: str
    display_name: str
    version: str
    default_timeframe: str
    required_columns: tuple[str, ...]
    structural_contract: dict[str, Any]
    parameter_space: dict[str, tuple[int | float, int | float, int | float]]


DELTA_RSI_SPEC = StrategySpecification(
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


class DeltaRsiStrategyAdapter:
    specification = DELTA_RSI_SPEC

    def validate_parameter_space(self, parameter_space: ParameterSpaceConfig) -> None:
        expected = set(self.specification.parameter_space)
        actual = set(parameter_space.root)
        missing = sorted(expected - actual)
        unknown = sorted(actual - expected)
        if missing or unknown:
            raise ParameterSpaceError(
                f"parameter space mismatch; missing={missing}, unknown={unknown}"
            )

    def generate_signals(
        self,
        data: pd.DataFrame,
        params: Mapping[str, object],
    ) -> pd.DataFrame:
        # Deliberately lazy: importing strategy.main loads Numba and belongs in a worker.
        from strategy.main import generate_delta_rsi_signals

        missing = sorted(set(self.specification.parameter_space) - set(params))
        if missing:
            raise ParameterSpaceError(f"missing strategy params: {missing}")
        return generate_delta_rsi_signals(data, dict(params))

    def build_walkforward_signal(
        self,
        data: pd.DataFrame,
        params: Mapping[str, object],
        train_index: pd.DatetimeIndex,
        test_index: pd.DatetimeIndex,
        fold: object,
    ) -> pd.Series:
        del train_index, fold
        if len(test_index) == 0:
            return pd.Series(dtype=float, index=test_index, name="pos_weight")
        frame = data.loc[: test_index[-1]].copy()
        generated = self.generate_signals(frame, params)
        return generated["pos_weight"].reindex(test_index).fillna(0.0).astype(float)
