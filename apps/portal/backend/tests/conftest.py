from __future__ import annotations

from datetime import UTC, datetime

import numpy as np
import pandas as pd
import pytest

from portal_api.adapters.market_data import DatasetDescriptor, InMemoryMarketDataProvider
from portal_api.domain.requests import (
    AccountConfig,
    ExecutionConfig,
    OptimizationConfig,
    ParameterSpaceConfig,
    ParameterSpec,
    PortalRunRequest,
    ThreeWindowConfig,
)


@pytest.fixture
def market_frame() -> pd.DataFrame:
    index = pd.date_range("2019-12-01", "2026-08-01", freq="1D", tz="UTC")
    trend = np.linspace(100.0, 250.0, len(index))
    wave = 3.0 * np.sin(np.arange(len(index)) / 17.0)
    close = trend + wave
    open_ = close * (1.0 + 0.001 * np.sin(np.arange(len(index)) / 5.0))
    high = np.maximum(open_, close) * 1.01
    low = np.minimum(open_, close) * 0.99
    volume = 1_000.0 + 200.0 * (1.0 + np.sin(np.arange(len(index)) / 11.0))
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=index,
    )


@pytest.fixture
def provider(market_frame: pd.DataFrame) -> InMemoryMarketDataProvider:
    descriptor = DatasetDescriptor(
        dataset_id="eth-1d",
        symbol="ETHUSDT",
        venue="BINANCE",
        timeframe="1d",
    )
    return InMemoryMarketDataProvider({"eth-1d": (descriptor, market_frame)})


@pytest.fixture
def parameter_space() -> ParameterSpaceConfig:
    values = {
        "window": ParameterSpec(kind="int_range", low=20, high=60, step=2),
        "rsi_l": ParameterSpec(kind="int_range", low=12, high=30, step=1),
        "signalLength": ParameterSpec(kind="int_range", low=3, high=20, step=1),
        "len_atr1": ParameterSpec(kind="int_range", low=5, high=20, step=1),
        "len_atr2": ParameterSpec(kind="int_range", low=25, high=60, step=1),
        "rvol": ParameterSpec(kind="float_range", low=1.0, high=2.5, step=0.1),
        "len_vol": ParameterSpec(kind="int_range", low=8, high=40, step=2),
        "slpercent": ParameterSpec(kind="float_range", low=0.7, high=2.5, step=0.1),
    }
    return ParameterSpaceConfig(values)


@pytest.fixture
def run_request(parameter_space: ParameterSpaceConfig) -> PortalRunRequest:
    return PortalRunRequest(
        strategy_id="delta-rsi-polynomial-alpha",
        dataset_id="eth-1d",
        symbol="ETHUSDT",
        timeframe="1d",
        protocol="three_window_decay",
        parameter_space=parameter_space,
        calibration=ThreeWindowConfig(
            is_start=datetime(2020, 1, 1, tzinfo=UTC),
            is_end_exclusive=datetime(2024, 1, 1, tzinfo=UTC),
            oos_start=datetime(2024, 1, 1, tzinfo=UTC),
            oos_end_exclusive=datetime(2025, 7, 1, tzinfo=UTC),
            holdout_start=datetime(2025, 7, 1, tzinfo=UTC),
            holdout_end_exclusive=datetime(2026, 7, 1, tzinfo=UTC),
            optimization=OptimizationConfig(),
        ),
        account=AccountConfig(),
        execution=ExecutionConfig(),
    )
