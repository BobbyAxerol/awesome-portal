from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from portal_api.adapters.market_data import (
    BINANCE_RELEASE_DATASET_ID,
    CRYPTO_BINANCE_DATASET_ID,
    HISTORICAL_EXCLUDED_SCOPES,
    HISTORICAL_LOADER_CONTRACT,
    HISTORICAL_READER_VERSION,
    HISTORICAL_USAGE_SCOPES,
    HistoricalMarketDataProvider,
    MarketDataQuery,
    UnavailableHistoricalMarketDataProvider,
    load_historical_data_runtime,
)
from portal_api.domain.errors import (
    DataSchemaError,
    DatasetNotFoundError,
    DateRangeError,
)


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


def historical_query(**overrides: object) -> MarketDataQuery:
    values: dict[str, object] = {
        "dataset_id": CRYPTO_BINANCE_DATASET_ID,
        "symbol": "ETHUSDT",
        "timeframe": "1h",
        "start": "2024-01-01T00:00:00+00:00",
        "end_exclusive": "2024-01-01T02:00:00+00:00",
    }
    values.update(overrides)
    return MarketDataQuery(**values)


def test_historical_provider_calls_bounded_reader_hot_path() -> None:
    calls: list[dict[str, object]] = []
    provider = HistoricalMarketDataProvider(
        loader_factory=lambda: FakeCryptoBinanceLoader(raw_loader_frame(), calls),
        check_val=True,
        engine="duckdb",
    )

    prepared = provider.load(historical_query(symbol="ethusdt"))

    assert calls == [
        {
            "symbol": "ETHUSDT",
            "timeframe": "1h",
            "start_date": "2024-01-01T00:00:00+00:00",
            "end_date": "2024-01-01T01:59:59.999999+00:00",
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
    assert prepared.load_metadata["source_timezone"] == "UTC"
    assert prepared.load_metadata["resample_engine"] == "duckdb"
    assert prepared.load_metadata["loader_contract"] == HISTORICAL_LOADER_CONTRACT
    assert prepared.load_metadata["usage_scope"] == "backtest,research"
    assert float(prepared.load_metadata["load_seconds"]) >= 0.0


def test_historical_catalog_declares_scope_and_excludes_realtime_paper() -> None:
    provider = HistoricalMarketDataProvider(
        loader_factory=lambda: FakeCryptoBinanceLoader(raw_loader_frame(), []),
    )

    descriptor = provider.list_datasets()[0]

    assert descriptor.dataset_id == CRYPTO_BINANCE_DATASET_ID
    assert descriptor.source_class == "historical_market_data"
    assert descriptor.availability == "available"
    assert descriptor.usage_scopes == HISTORICAL_USAGE_SCOPES
    assert descriptor.excluded_scopes == HISTORICAL_EXCLUDED_SCOPES
    assert "1h" in descriptor.supported_timeframes


@pytest.mark.parametrize("symbol", [None, "", "../ETH", "ETH/USDT"])
def test_historical_provider_rejects_invalid_symbol(symbol: str | None) -> None:
    provider = HistoricalMarketDataProvider(
        loader_factory=lambda: FakeCryptoBinanceLoader(raw_loader_frame(), []),
    )

    with pytest.raises(DataSchemaError, match="symbol"):
        provider.load(historical_query(symbol=symbol))


def test_historical_provider_rejects_empty_loader_result() -> None:
    provider = HistoricalMarketDataProvider(
        loader_factory=lambda: FakeCryptoBinanceLoader(pd.DataFrame(), []),
    )

    with pytest.raises(DatasetNotFoundError, match="no Binance futures bars"):
        provider.load(historical_query())


@pytest.mark.parametrize("timeframe", [None, "", "0h", "hourly", "../1h"])
def test_historical_provider_rejects_invalid_timeframe(timeframe: str | None) -> None:
    provider = HistoricalMarketDataProvider(
        loader_factory=lambda: FakeCryptoBinanceLoader(raw_loader_frame(), []),
    )

    with pytest.raises(DataSchemaError, match="timeframe"):
        provider.load(historical_query(timeframe=timeframe))


def test_historical_provider_requires_explicit_timezone_aware_bounds() -> None:
    provider = HistoricalMarketDataProvider(
        loader_factory=lambda: FakeCryptoBinanceLoader(raw_loader_frame(), []),
    )

    with pytest.raises(DateRangeError, match="explicit start"):
        provider.load(historical_query(end_exclusive=None))
    with pytest.raises(DateRangeError, match="include a timezone"):
        provider.load(historical_query(start="2024-01-01"))
    with pytest.raises(DateRangeError, match="positive duration"):
        provider.load(
            historical_query(
                start="2024-01-02T00:00:00+00:00",
                end_exclusive="2024-01-01T00:00:00+00:00",
            )
        )


def test_historical_provider_rejects_unknown_dataset() -> None:
    provider = HistoricalMarketDataProvider(
        loader_factory=lambda: FakeCryptoBinanceLoader(raw_loader_frame(), []),
    )

    with pytest.raises(DatasetNotFoundError, match="unknown dataset_id"):
        provider.load(historical_query(dataset_id="unknown"))


def test_unavailable_provider_advertises_reason_and_never_returns_fixture() -> None:
    provider = UnavailableHistoricalMarketDataProvider("not mounted")

    descriptor = provider.list_datasets()[0]
    assert descriptor.availability == "unavailable"
    assert descriptor.unavailable_reason == "not mounted"
    with pytest.raises(DatasetNotFoundError, match="not mounted"):
        provider.load(historical_query())


def _runtime_test_modules(tmp_path: Path):
    storage_root = tmp_path / "storage"
    metadata_dir = storage_root / "_primus_metadata"
    metadata_dir.mkdir(parents=True)
    manifest_path = metadata_dir / "release_manifest.json"
    payload = {
        "status": "pass",
        "environment_id": "test-hmd",
        "git": {"commit": "abc123", "tag": "reader-test"},
    }
    manifest_path.write_text(json.dumps(payload), encoding="utf-8")
    loader_path = tmp_path / "site-packages" / "data_loader.py"
    loader_path.parent.mkdir()
    loader_path.write_text("# installed test module\n", encoding="utf-8")

    class Loader:
        pass

    loader_module = SimpleNamespace(
        __file__=str(loader_path),
        STORAGE_DIR=storage_root,
        LOADER_CONTRACT_VERSION=HISTORICAL_LOADER_CONTRACT,
        CryptoBinance1m=Loader,
    )

    def assert_compatible(root: Path, **kwargs: str) -> dict[str, str]:
        assert Path(root) == storage_root
        assert kwargs == {
            "dataset_id": BINANCE_RELEASE_DATASET_ID,
            "loader_contract_version": HISTORICAL_LOADER_CONTRACT,
        }
        return {"dataset_id": BINANCE_RELEASE_DATASET_ID}

    manifest_module = SimpleNamespace(
        validate_accepted_release_manifest=lambda value: value,
        read_release_manifest=lambda root: payload,
        assert_loader_compatible=assert_compatible,
        release_manifest_path=lambda root: manifest_path,
    )
    distribution = SimpleNamespace(
        version=HISTORICAL_READER_VERSION,
        locate_file=lambda name: loader_path,
    )
    return storage_root, loader_module, manifest_module, distribution


def test_runtime_verifies_installed_wheel_and_manifest(monkeypatch, tmp_path: Path) -> None:
    storage_root, loader_module, manifest_module, distribution = _runtime_test_modules(
        tmp_path
    )
    monkeypatch.setenv("HISTORICAL_MARKET_DATA_ROOT", str(storage_root))
    monkeypatch.setattr(
        "portal_api.adapters.market_data.importlib.metadata.distribution",
        lambda name: distribution,
    )
    monkeypatch.setattr(
        "portal_api.adapters.market_data.importlib.import_module",
        lambda name: loader_module if name == "data_loader" else manifest_module,
    )

    runtime = load_historical_data_runtime(storage_root)

    assert runtime.reader_version == HISTORICAL_READER_VERSION
    assert runtime.loader_contract == HISTORICAL_LOADER_CONTRACT
    assert runtime.environment_id == "test-hmd"
    assert runtime.release_commit == "abc123"
    assert len(runtime.manifest_digest) == 64


def test_runtime_rejects_shadowed_data_loader(monkeypatch, tmp_path: Path) -> None:
    storage_root, loader_module, manifest_module, distribution = _runtime_test_modules(
        tmp_path
    )
    loader_module.__file__ = str(tmp_path / "portal" / "data_loader.py")
    monkeypatch.setenv("HISTORICAL_MARKET_DATA_ROOT", str(storage_root))
    monkeypatch.setattr(
        "portal_api.adapters.market_data.importlib.metadata.distribution",
        lambda name: distribution,
    )
    monkeypatch.setattr(
        "portal_api.adapters.market_data.importlib.import_module",
        lambda name: loader_module if name == "data_loader" else manifest_module,
    )

    with pytest.raises(DataSchemaError, match="shadowed"):
        load_historical_data_runtime(storage_root)


def test_runtime_fails_closed_when_manifest_rejects_release(
    monkeypatch, tmp_path: Path
) -> None:
    storage_root, loader_module, manifest_module, distribution = _runtime_test_modules(
        tmp_path
    )
    monkeypatch.setenv("HISTORICAL_MARKET_DATA_ROOT", str(storage_root))
    monkeypatch.setattr(
        "portal_api.adapters.market_data.importlib.metadata.distribution",
        lambda name: distribution,
    )
    monkeypatch.setattr(
        "portal_api.adapters.market_data.importlib.import_module",
        lambda name: loader_module if name == "data_loader" else manifest_module,
    )
    manifest_module.validate_accepted_release_manifest = lambda value: (_ for _ in ()).throw(
        RuntimeError("status=fail")
    )

    with pytest.raises(DataSchemaError, match="status=fail"):
        load_historical_data_runtime(storage_root)
