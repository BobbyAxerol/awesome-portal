from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from portal_api.strategies import StrategyRegistry


def test_registry_does_not_import_protected_numba_kernel() -> None:
    sys.modules.pop("strategy.main", None)
    registry = StrategyRegistry()
    strategy = registry.get("delta-rsi-polynomial-alpha")

    assert strategy.specification.version == "1.0.0"
    assert "strategy.main" not in sys.modules


def test_adapter_generates_expected_surface_without_input_mutation() -> None:
    index = pd.date_range("2024-01-01", periods=240, freq="1h", tz="UTC")
    close = 100.0 + np.linspace(0.0, 20.0, len(index)) + 4.0 * np.sin(np.arange(len(index)) / 5.0)
    frame = pd.DataFrame(
        {
            "open": close,
            "high": close * 1.02,
            "low": close * 0.98,
            "close": close,
            "volume": 1_000.0 + 900.0 * (1.0 + np.sin(np.arange(len(index)) / 3.0)),
        },
        index=index,
    )
    original = frame.copy(deep=True)
    params = {
        "window": 32,
        "rsi_l": 20,
        "signalLength": 9,
        "len_atr1": 10,
        "len_atr2": 42,
        "rvol": 1.6,
        "len_vol": 16,
        "slpercent": 1.3,
    }

    generated = StrategyRegistry().get("delta-rsi-polynomial-alpha").generate_signals(frame, params)

    assert {"pos_weight", "exit_type", "exit_price"}.issubset(generated.columns)
    assert generated.index.equals(frame.index)
    pd.testing.assert_frame_equal(frame, original)
