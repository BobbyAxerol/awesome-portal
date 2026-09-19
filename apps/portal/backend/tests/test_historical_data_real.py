from __future__ import annotations

import importlib
import os

import numpy as np
import pytest

from portal_api.adapters.market_data import (
    CRYPTO_BINANCE_DATASET_ID,
    HISTORICAL_READER_VERSION,
    HistoricalMarketDataProvider,
    MarketDataQuery,
    load_historical_data_runtime,
    market_content_hash,
    normalize_market_frame,
)
from portal_api.adapters.quantbt import QuantBTGateway
from golden_fixture import GOLDEN_PARAMS
from strategy.main import generate_delta_rsi_signals


pytestmark = pytest.mark.skipif(
    os.getenv("PORTAL_RUN_HMD_REAL_SMOKE") != "1",
    reason="external-data-unavailable: opt in with PORTAL_RUN_HMD_REAL_SMOKE=1",
)


def test_approved_btcusdt_reader_window_and_provenance() -> None:
    storage_root = os.environ["HISTORICAL_MARKET_DATA_ROOT"]
    runtime = load_historical_data_runtime(storage_root)
    provider = HistoricalMarketDataProvider(runtime=runtime, engine="duckdb")

    prepared = provider.load(
        MarketDataQuery(
            dataset_id=CRYPTO_BINANCE_DATASET_ID,
            symbol="BTCUSDT",
            timeframe="1h",
            start="2026-08-01T00:00:00+00:00",
            end_exclusive="2026-08-02T00:00:00+00:00",
        )
    )

    assert len(prepared.frame) == 24
    assert prepared.frame.index.is_monotonic_increasing
    assert prepared.frame.index.is_unique
    assert prepared.missing_bar_count == 0
    assert prepared.load_metadata["reader_version"] == HISTORICAL_READER_VERSION
    assert prepared.load_metadata["loader_contract"] == "hmd-loader-v1"
    assert prepared.load_metadata["manifest_digest"] == runtime.manifest_digest
    assert prepared.load_metadata["usage_scope"] == "backtest,research"

    direct = runtime.loader_class().load_resampled(
        "BTCUSDT",
        timeframe="1h",
        start_date="2026-08-01T00:00:00+00:00",
        end_date="2026-08-01T23:59:59.999999+00:00",
        check_val=True,
        engine="duckdb",
    )
    direct_frame = normalize_market_frame(
        direct.sort_values("time", kind="stable")
        .rename(columns={"time": "datetime"})
        .set_index("datetime")
    )
    assert market_content_hash(direct_frame) == prepared.content_hash


def test_approved_btcusdt_delta_signal_notional_direct_adapter_parity() -> None:
    """P04 actual-data proof, intentionally opt-in and read-only.

    It does not promote the historical tape to a live alpha result.  It proves
    only that the protected Delta signal, public 1.1.1 endpoint and Portal
    adapter agree over a manifest-pinned historical window.
    """
    runtime = load_historical_data_runtime(os.environ["HISTORICAL_MARKET_DATA_ROOT"])
    prepared = HistoricalMarketDataProvider(runtime=runtime, engine="duckdb").load(
        MarketDataQuery(
            dataset_id=CRYPTO_BINANCE_DATASET_ID,
            symbol="BTCUSDT",
            timeframe="1h",
            start="2026-08-01T00:00:00+00:00",
            end_exclusive="2026-08-15T00:00:00+00:00",
        )
    )
    assert len(prepared.frame) == 336
    assert prepared.missing_bar_count == 0
    signal = generate_delta_rsi_signals(prepared.frame, GOLDEN_PARAMS)["pos_weight"]
    account = {
        "initial_capital": 20_000,
        "leverage": 3,
        "alloc_per_trade": 2_000,
        "fee_rate": 0.0005,
        "use_funding": False,
    }
    direct = importlib.import_module("quantbt").QuantBTEndpoint.signal_notional(**account)
    adapter = QuantBTGateway().signal_notional_endpoint(**account)
    direct_result = direct.backtest(data=prepared.frame, signal=signal)
    adapter_result = adapter.backtest(data=prepared.frame, signal=signal)
    np.testing.assert_allclose(direct_result.equity.to_numpy(), adapter_result.equity.to_numpy())
    assert direct.full_report() == adapter.full_report()
