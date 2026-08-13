from __future__ import annotations

from typing import Any, Mapping

import pandas as pd

from portal_api.domain.errors import ParameterSpaceError
from portal_api.domain.requests import ParameterSpaceConfig
from strategy.specification import DELTA_RSI_SPECIFICATION


# Single source of truth lives in the strategy package (Phase P1).
DELTA_RSI_SPEC = DELTA_RSI_SPECIFICATION


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
        # Deliberately lazy: the strategy package imports strategy.main (Numba)
        # only at call time; API startup never loads the kernel.
        from strategy.delta_rsi import generate_signals as package_generate

        missing = sorted(set(self.specification.parameter_space) - set(params))
        if missing:
            raise ParameterSpaceError(f"missing strategy params: {missing}")
        return package_generate(data, dict(params))

    def build_walkforward_signal(
        self,
        data: pd.DataFrame,
        params: Mapping[str, object],
        train_index: pd.DatetimeIndex,
        test_index: pd.DatetimeIndex,
        fold: object,
    ) -> pd.Series:
        from strategy.delta_rsi import build_walkforward_signal as package_walkforward

        return package_walkforward(data, dict(params), train_index, test_index, fold)
