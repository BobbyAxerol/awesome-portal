from __future__ import annotations

import os

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
