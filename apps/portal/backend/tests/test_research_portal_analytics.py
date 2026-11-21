"""D-AN-01: actual QuantBT result, exact OOS scope, no fabricated source facts."""

from __future__ import annotations

import dataclasses
import json

import numpy as np
import pandas as pd

from portal_api.services.research_portal_analytics import portal_analytics_v2
from test_research_evidence_metrics import _engine_run, _synthetic_market


def _ms(value: pd.Timestamp) -> int:
    return int(value.value // 1_000_000)


def test_fixed_v2_seals_all_time_and_last_30d_from_loaded_market():
    market = _synthetic_market(100)
    result = _engine_run(market)
    block = portal_analytics_v2(
        result=result, mode="FIXED", market_close=market["close"],
        benchmark_locator="hmd:test/BTCUSDT/1h#close@sealed-snapshot",
        is_start_utc_ms=_ms(result.equity.index[24]),
        oos_start_utc_ms=_ms(result.equity.index[24 * 20]),
    )
    assert block["schema_version"] == "research.retained-analytics.v2"
    assert "rolling_sharpe_63" not in block
    assert block["metrics"]["sharpe"]["origin"] == "ENGINE_DIRECT"
    assert block["metrics"]["volatility_fraction"]["origin"] == "PORTAL_DERIVED"
    assert block["metrics"]["benchmark_return_fraction"]["state"] == "AVAILABLE"
    assert block["last_30d"]["label"] == "last 30D"
    assert block["last_30d"]["points"][-1]["at_utc_ms"] == _ms(result.equity.index[-1])
    assert all(fact["input_digest"] == block["input_digest"] for fact in block["metrics"].values())
    assert len(json.dumps(block, separators=(",", ":")).encode()) <= 16_384


def test_wfo_v2_uses_engine_outer_test_union_not_in_sample():
    market = _synthetic_market(100)
    source = _engine_run(market)
    index = source.equity.index
    folds = pd.DataFrame([
        {"test_start": index[24 * 10], "test_end": index[24 * 35 - 1]},
        {"test_start": index[24 * 40], "test_end": index[-1]},
    ])
    result = dataclasses.replace(source, metadata={**source.metadata, "walk_forward": {"fold_table": folds}})
    block = portal_analytics_v2(result=result, mode="WFO", market_close=market["close"],
        benchmark_locator="hmd:test/BTCUSDT/1h#close@sealed-snapshot")
    mask = ((index >= index[24 * 10]) & (index < index[24 * 35])) | (index >= index[24 * 40])
    assert block["oos_observation_count"] == int(mask.sum())
    assert block["strategy_curve"][0]["at_utc_ms"] == _ms(index[24 * 10])
    assert block["metrics"]["sharpe_decay"]["state"] == "NOT_APPLICABLE"


def test_benchmark_absence_is_typed_when_close_is_not_aligned():
    market = _synthetic_market(40)
    result = _engine_run(market)
    close = market["close"].drop(result.equity.index[24])
    block = portal_analytics_v2(result=result, mode="FIXED", market_close=close,
        benchmark_locator="hmd:test/BTCUSDT/1h#close@partial",
        oos_start_utc_ms=_ms(result.equity.index[24]))
    assert block["metrics"]["benchmark_return_fraction"]["state"] == "NOT_PUBLISHED"
    assert block["metrics"]["benchmark_return_fraction"]["reason_code"] == "PORTAL_ANALYTICS_BENCHMARK_CLOSE_UNAVAILABLE"
    assert block["benchmark_curve"] == []


def test_exposure_parts_sum_to_one_without_pretending_to_have_trades():
    market = _synthetic_market(40)
    result = _engine_run(market)
    block = portal_analytics_v2(result=result, mode="FIXED", market_close=market["close"],
        benchmark_locator="hmd:test/BTCUSDT/1h#close@sealed-snapshot",
        oos_start_utc_ms=_ms(result.equity.index[24]))
    values = [float(block["behaviour"][f"exposure_{side}_fraction"]["value"])
              for side in ("long", "short", "flat")]
    assert np.isclose(sum(values), 1)
    assert block["behaviour"]["win_rate"]["source_locator"].endswith("not_audited_trades")


def test_long_range_adapts_display_bytes_without_changing_all_time_facts(monkeypatch):
    from portal_api.services import research_portal_analytics as analytics

    market = _synthetic_market(450)
    result = _engine_run(market)
    kwargs = dict(result=result, mode="FIXED", market_close=market["close"],
                  benchmark_locator="hmd:test/BTCUSDT/1h#close@sealed-snapshot",
                  oos_start_utc_ms=_ms(result.equity.index[1]))
    # Compare the same real source population, not a fabricated analytics DTO.
    monkeypatch.setattr(analytics, "MAX_BLOCK_BYTES", 64_000)
    full = portal_analytics_v2(**kwargs, maximum_block_bytes=64_000)
    monkeypatch.setattr(analytics, "MAX_BLOCK_BYTES", 16_384)
    bounded = portal_analytics_v2(**kwargs, maximum_block_bytes=15_360)
    assert len(json.dumps(bounded, separators=(",", ":"), allow_nan=False).encode()) <= 16_384
    for key in ("input_digest", "metrics", "behaviour", "oos_observation_count"):
        assert bounded[key] == full[key]
    assert bounded["distributions"]["return_distribution"] == full["distributions"]["return_distribution"]
    for key in ("strategy_curve", "benchmark_curve"):
        assert bounded[key][0] == full[key][0] and bounded[key][-1] == full[key][-1]
    monthly = bounded["distributions"]["monthly_returns"]
    assert monthly["emitted_point_count"] + monthly["omitted_transport_period_count"] == monthly["total_period_count"]
    assert monthly["source_observation_count"] == full["oos_observation_count"]
    from portal_api.services.current_source_artifacts import CurrentSourceArtifactAdapter
    calibration = CurrentSourceArtifactAdapter._full_sample_projection(bounded)
    assert len(json.dumps(calibration, separators=(",", ":"), allow_nan=False).encode()) <= 16_384
