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


def test_approved_btcusdt_signal_notional_walkforward_public_api() -> None:
    """RF-03 source feasibility only; P10 preview admission is a separate gate.

    This opt-in test executes real Optuna trials against the approved read-only
    historical loader.  It neither persists a Research run nor promotes an
    imported AlphaVersion or changes the fixed P04 producer.
    """
    from portal_api.services.three_window_runner import _strategy_callable
    from strategy.specification import DELTA_RSI_SPECIFICATION

    runtime = load_historical_data_runtime(os.environ["HISTORICAL_MARKET_DATA_ROOT"])
    prepared = HistoricalMarketDataProvider(runtime=runtime, engine="duckdb").load(
        MarketDataQuery(
            dataset_id=CRYPTO_BINANCE_DATASET_ID,
            symbol="BTCUSDT",
            timeframe="1h",
            start="2026-06-01T00:00:00+00:00",
            end_exclusive="2026-07-15T00:00:00+00:00",
        )
    )
    gateway = QuantBTGateway()
    assert any(
        row.get("target_mode") == "signal_notional" and row.get("status") == "supported"
        for row in gateway.walkforward_capabilities()
    )
    wf_config = gateway.build_advanced_walkforward_config(config_fields={
        "split_mode": "2026-07-01",
        "split_frequency": "weekly",
        "target_mode": "signal_notional",
        "window_mode": "expanding",
        "optimization_mode": "mode_1_decay",
        "optimization_schedule": "global",
        "optuna_trials": 3,
        "random_seed": 42,
    })
    _, source = gateway.run_advanced_walkforward(
        strategy_fn=_strategy_callable,
        data=prepared.frame,
        wf_config=wf_config,
        optimization_config={},
        param_ranges=dict(DELTA_RSI_SPECIFICATION.parameter_space),
        fixed_params=None,
        account_kwargs={
            "initial_capital": 20_000,
            "leverage": 3,
            "alloc_per_trade": 2_000,
            "fee_rate": 0.0005,
            "use_funding": False,
        },
        target_mode="signal_notional",
    )
    assert source["target_mode"] == "signal_notional"
    assert source["n_folds"] >= 2
    assert source["n_optuna_trial_rows"] >= 3
    assert len(source["fold_table"]) >= 2
    assert len(source["trial_table"]) >= 3
