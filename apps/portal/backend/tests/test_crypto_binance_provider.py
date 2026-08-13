from __future__ import annotations

import pandas as pd
import pytest

from portal_api.adapters.market_data import (
    CRYPTO_BINANCE_DATASET_ID,
    CryptoBinanceMarketDataProvider,
)
from portal_api.domain.errors import DataSchemaError, DatasetNotFoundError


class FakeCryptoBinanceLoader:
    def __init__(self, frame: pd.DataFrame, calls: list[dict[str, object]]) -> None:
        self._frame = frame
        self._calls = calls

    def load_resampled(self, symbol: str, **kwargs: object) -> pd.DataFrame:
        self._calls.append({"symbol": symbol, **kwargs})
        return self._frame.copy(deep=True)


def raw_loader_frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "time": pd.to_datetime(
                ["2024-01-01 01:00:00", "2024-01-01 00:00:00"]
            ),
            "symbol": ["ETHUSDT", "ETHUSDT"],
            "open": [101.0, 100.0],
            "high": [103.0, 102.0],
            "low": [100.0, 99.0],
            "close": [102.0, 101.0],
            "volume": [12.0, 10.0],
        }
    )


def test_crypto_provider_calls_canonical_resample_hot_path() -> None:
    calls: list[dict[str, object]] = []
    frame = raw_loader_frame()
    provider = CryptoBinanceMarketDataProvider(
        "/unused/in/factory/test",
        loader_factory=lambda: FakeCryptoBinanceLoader(frame, calls),
        check_val=True,
        engine="duckdb",
    )

    prepared = provider.load(
        CRYPTO_BINANCE_DATASET_ID,
        symbol="ethusdt",
        timeframe="1h",
    )

    assert calls == [
        {
            "symbol": "ETHUSDT",
            "timeframe": "1h",
            "check_val": True,
            "engine": "duckdb",
        }
    ]
    assert prepared.descriptor.symbol == "ETHUSDT"
    assert prepared.descriptor.timeframe == "1h"
    assert prepared.descriptor.dynamic_query is True
    assert prepared.frame.index.is_monotonic_increasing
    assert str(prepared.frame.index.tz) == "UTC"
    assert prepared.load_metadata["provider"] == "CryptoBinance1m"
    assert prepared.load_metadata["source_resolution"] == "1min"
    assert prepared.load_metadata["resample_engine"] == "duckdb"
    assert float(prepared.load_metadata["load_seconds"]) >= 0.0


def test_crypto_provider_catalog_is_dynamic() -> None:
    provider = CryptoBinanceMarketDataProvider(
        "/unused/in/catalog/test",
        loader_factory=lambda: FakeCryptoBinanceLoader(raw_loader_frame(), []),
    )

    descriptor = provider.list_datasets()[0]

    assert descriptor.dataset_id == CRYPTO_BINANCE_DATASET_ID
    assert descriptor.symbol is None
    assert descriptor.timeframe is None
    assert descriptor.dynamic_query is True
    assert "1h" in descriptor.supported_timeframes


@pytest.mark.parametrize("symbol", [None, "", "../ETH", "ETH/USDT"])
def test_crypto_provider_rejects_invalid_symbol(symbol: str | None) -> None:
    provider = CryptoBinanceMarketDataProvider(
        "/unused/in/symbol/test",
        loader_factory=lambda: FakeCryptoBinanceLoader(raw_loader_frame(), []),
    )

    with pytest.raises(DataSchemaError, match="symbol"):
        provider.load(CRYPTO_BINANCE_DATASET_ID, symbol=symbol, timeframe="1h")


def test_crypto_provider_rejects_empty_loader_result() -> None:
    provider = CryptoBinanceMarketDataProvider(
        "/unused/in/empty/test",
        loader_factory=lambda: FakeCryptoBinanceLoader(pd.DataFrame(), []),
    )

    with pytest.raises(DatasetNotFoundError, match="no Binance futures bars"):
        provider.load(CRYPTO_BINANCE_DATASET_ID, symbol="ETHUSDT", timeframe="1h")


@pytest.mark.parametrize("timeframe", [None, "", "0h", "hourly", "../1h"])
def test_crypto_provider_rejects_invalid_timeframe(timeframe: str | None) -> None:
    provider = CryptoBinanceMarketDataProvider(
        "/unused/in/timeframe/test",
        loader_factory=lambda: FakeCryptoBinanceLoader(raw_loader_frame(), []),
    )

    with pytest.raises(DataSchemaError, match="timeframe"):
        provider.load(CRYPTO_BINANCE_DATASET_ID, symbol="ETHUSDT", timeframe=timeframe)


def test_crypto_provider_rejects_unknown_dataset() -> None:
    provider = CryptoBinanceMarketDataProvider(
        "/unused/in/id/test",
        loader_factory=lambda: FakeCryptoBinanceLoader(raw_loader_frame(), []),
    )

    with pytest.raises(DatasetNotFoundError, match="unknown dataset_id"):
        provider.load("unknown", symbol="ETHUSDT", timeframe="1h")
