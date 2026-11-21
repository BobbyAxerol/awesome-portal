"""Independent engine/report oracles for E11/E14; not product receipts."""
from __future__ import annotations

import dataclasses
import json
from decimal import Decimal

import numpy as np
import pandas as pd
import pytest

from portal_api.services.research_retained_analytics import retained_analytics
from test_research_evidence_metrics import _engine_run, _synthetic_market


@pytest.fixture(scope="module")
def engine_result():
    market = _synthetic_market(100)
    return _engine_run(market)


def _ms(index, ordinal):
    return int(index[ordinal].value // 1_000_000)


def test_fixed_is_excludes_warmup_and_oos_without_inventing_curve_points(engine_result):
    result = engine_result
    index = result.equity.index
    block = retained_analytics(result=result, mode="FIXED", is_start_utc_ms=_ms(index, 24), oos_start_utc_ms=_ms(index, 24 * 20))
    curve = block["in_sample_equity"]
    assert curve["state"] == "AVAILABLE"
    assert curve["source_observation_count"] == 24 * 19
    assert 2 <= len(curve["points"]) <= 24
    for point in curve["points"]:
        stamp = pd.Timestamp(point["at_utc_ms"], unit="ms", tz="UTC")
        assert index[24] <= stamp < index[24 * 20]
        assert float(point["equity"]) == float(result.equity.loc[stamp])
    assert curve["points"][0]["at_utc_ms"] == _ms(index, 24)
    assert curve["points"][-1]["at_utc_ms"] == _ms(index, 24 * 20 - 1)
    assert len(json.dumps(block).encode()) < 16_384


def test_wfo_uses_engine_union_of_test_windows_not_whole_account(engine_result):
    from quantbt.core.results import BacktestResultV2
    from quantbt.metrics.performance import full_report, rolling_sharpe

    source = engine_result
    index = source.equity.index
    folds = pd.DataFrame([
        {"test_start": index[24 * 10], "test_end": index[24 * 35 - 1]},
        {"test_start": index[24 * 40], "test_end": index[-1]},
    ])
    result = dataclasses.replace(source, metadata={**source.metadata, "walk_forward": {"fold_table": folds}})
    block = retained_analytics(result=result, mode="WFO")
    mask = ((index >= index[24 * 10]) & (index < index[24 * 35])) | (index >= index[24 * 40])
    oracle = BacktestResultV2(
        equity=source.equity.loc[mask], returns=source.returns.loc[mask], positions=source.positions.loc[mask],
        closes=source.closes.loc[mask], symbols=source.symbols, initial_capital=source.initial_capital,
        leverage=source.leverage, liquidated=source.liquidated, liquidation_bar=source.liquidation_bar,
    )
    report = full_report(oracle, trading_days=365)
    assert block["oos_observation_count"] == int(mask.sum())
    assert Decimal(block["net_oos_return"]["value"]) == Decimal(str(report["total_return_pct"])) / 100
    assert block["net_oos_return"]["scope"] == "OOS"
    assert block["net_oos_return"]["origin"] == "ENGINE_DIRECT"
    assert block["in_sample_equity"]["state"] == "NOT_PUBLISHED"
    assert block["in_sample_equity"]["reason_code"] == "QUANTBT_WFO_HAS_NO_SELECTED_CANDIDATE_IS_ACCOUNT"
    rolling = block["rolling_sharpe_63"]
    assert rolling["state"] == "AVAILABLE" and len(rolling["points"]) <= 12
    expected = rolling_sharpe(oracle, window=63, trading_days=365)
    for point in rolling["points"]:
        assert float(point["sharpe"]) == float(expected.loc[pd.Timestamp(point["at_utc_ms"], unit="ms", tz="UTC")])


def test_trade_tiles_do_not_infer_a_ledger_from_count_or_bar_returns(engine_result):
    index = engine_result.equity.index
    block = retained_analytics(result=engine_result, mode="FIXED", oos_start_utc_ms=_ms(index, 24))
    assert block["total_trade_count"]["scope"] == "CHILD_TAPE"
    assert block["total_trade_count"]["value"] == str(int(engine_result.full_report(scope="full")["num_trades"]))
    assert block["trade_ledger_record_count"] == 0
    for key in ("win_rate", "payoff_ratio", "average_hold_seconds", "max_consecutive_losses"):
        assert block["behaviour"][key]["state"] == "NOT_PUBLISHED"
        assert block["behaviour"][key]["value"] is None
        assert block["behaviour"][key]["source_locator"] == "QuantBT.result.trades"
    exposure = block["behaviour"]["exposure_fraction"]
    accepted = engine_result.positions.loc[index[24]:]
    values = accepted.to_numpy()
    count = np.any(values != 0, axis=1).sum() if values.ndim > 1 else (values != 0).sum()
    assert float(exposure["value"]) == pytest.approx(count / len(accepted))
    assert block["in_sample_equity"]["reason_code"] == "P08_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT"


def test_short_rolling_stays_typed_and_same_input_is_deterministic(engine_result):
    index = engine_result.equity.index
    kwargs = dict(result=engine_result, mode="FIXED", oos_start_utc_ms=_ms(index, 24 * 80))
    first = retained_analytics(**kwargs)
    assert first == retained_analytics(**kwargs)
    assert first["rolling_sharpe_63"]["state"] == "NOT_APPLICABLE"
    assert first["rolling_sharpe_63"]["points"] == []
    other = retained_analytics(result=engine_result, mode="FIXED", oos_start_utc_ms=_ms(index, 24 * 81))
    assert first["input_digest"] != other["input_digest"]


def test_untyped_result_and_duplicate_timestamps_are_rejected(engine_result):
    with pytest.raises(ValueError, match="actual admitted"):
        retained_analytics(result=object(), mode="FIXED", oos_start_utc_ms=1)
    duplicate = lambda value: pd.concat([value.iloc[:1], value])
    invalid = dataclasses.replace(engine_result, equity=duplicate(engine_result.equity),
        returns=duplicate(engine_result.returns), positions=duplicate(engine_result.positions), closes=duplicate(engine_result.closes))
    with pytest.raises(ValueError, match="strictly chronological"):
        retained_analytics(result=invalid, mode="WFO")
