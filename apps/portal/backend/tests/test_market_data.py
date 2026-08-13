from __future__ import annotations

import pandas as pd
import pytest

from portal_api.adapters.market_data import (
    DatasetDescriptor,
    normalize_market_frame,
    partition_three_windows,
    prepare_market_data,
)
from portal_api.domain.errors import DataSchemaError
from portal_api.domain.requests import ThreeWindowConfig


def test_normalization_is_utc_sorted_and_does_not_mutate_input(market_frame: pd.DataFrame) -> None:
    original = market_frame.copy(deep=True)
    shuffled = market_frame.iloc[::-1]

    normalized = normalize_market_frame(shuffled)

    assert normalized.index.is_monotonic_increasing
    assert str(normalized.index.tz) == "UTC"
    pd.testing.assert_frame_equal(market_frame, original)


def test_invalid_high_is_rejected(market_frame: pd.DataFrame) -> None:
    broken = market_frame.copy()
    broken.iloc[10, broken.columns.get_loc("high")] = broken.iloc[10]["close"] * 0.5
    with pytest.raises(DataSchemaError, match="high"):
        normalize_market_frame(broken)


def test_partition_uses_exact_half_open_boundaries(market_frame: pd.DataFrame) -> None:
    descriptor = DatasetDescriptor("eth-1d", "ETHUSDT", "BINANCE", "1d")
    prepared = prepare_market_data(market_frame, descriptor)
    windows = partition_three_windows(prepared, ThreeWindowConfig())

    assert windows.is_frame.index[0] == pd.Timestamp("2020-01-01", tz="UTC")
    assert windows.is_frame.index[-1] == pd.Timestamp("2023-12-31", tz="UTC")
    assert windows.oos_frame.index[0] == pd.Timestamp("2024-01-01", tz="UTC")
    assert windows.oos_frame.index[-1] == pd.Timestamp("2025-06-30", tz="UTC")
    assert windows.holdout_frame.index[0] == pd.Timestamp("2025-07-01", tz="UTC")
    assert set(windows.is_frame.index).isdisjoint(windows.oos_frame.index)
    assert set(windows.oos_frame.index).isdisjoint(windows.holdout_frame.index)


def test_content_hash_changes_when_market_data_changes(market_frame: pd.DataFrame) -> None:
    descriptor = DatasetDescriptor("eth-1d", "ETHUSDT", "BINANCE", "1d")
    first = prepare_market_data(market_frame, descriptor)
    changed = market_frame.copy()
    changed.iloc[-1, changed.columns.get_loc("volume")] += 1.0
    second = prepare_market_data(changed, descriptor)
    assert first.content_hash != second.content_hash
