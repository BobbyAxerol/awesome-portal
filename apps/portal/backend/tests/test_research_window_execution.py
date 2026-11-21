"""Synthetic protocol regressions; not a product/HMD qualification receipt."""
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

from portal_api.services.research_window_execution import (
    capture_native_windows, read_rows, verify_source, frame_observations,
    completed_window, package, canonical, retain_companion,
    capture_current_windows,
)
from portal_api.adapters.research_native_routes import run_native_delta
from portal_api.services.current_source_artifacts import current_source_schema_registry
from test_research_native_routes import tape, PARAMS


@pytest.mark.parametrize("route", ["intrabar_bracket", "reactive", "event_driven"])
def test_actual_pinned_engine_journals_are_retained_without_reconstructing_orders(route, monkeypatch, tmp_path):
    import strategy.delta_rsi
    market = tape()
    weights = np.zeros(len(market)); weights[310:350] = 1; weights[360:400] = -1
    monkeypatch.setattr(strategy.delta_rsi, "generate_signals",
        lambda data, _: pd.DataFrame({"pos_weight": weights}, index=data.index))
    runner = run_native_delta
    if route == "intrabar_bracket":
        from portal_api.adapters.research_native_bracket_v4 import run_native_delta as runner
    result = runner(route=route, market=market, symbol="BTCUSDT", parameters=PARAMS)
    windows = {key: {"start_ms": int(market.index[a].value // 1_000_000),
                     "end_ms": int(market.index[b].value // 1_000_000)}
               for key, a, b in [("is", 300, 355), ("oos", 355, 449)]}
    source = capture_native_windows(result=result, market=market, route=route, symbol="BTCUSDT",
                                    source_windows=windows, output_directory=tmp_path)
    rows = read_rows(tmp_path / "window-execution.parquet"); verify_source(source, rows)
    actual = [row["payload"] for row in rows if row["kind"] == "EXECUTION" and row["payload"]["record_kind"] == "FILL"]
    expected = len(result.fills) or len(result.metadata.get("fills_report", []))
    assert actual and len(actual) == expected
    for record in actual:
        assert record["price"] is not None and record["qty"] is not None
        assert record["fill_price"] == record["price"] and record["fill_qty"] == record["qty"]
        assert record["filled_at_utc_ms"] is not None
        assert "oco_group_id" in record["missing_fields"]
        assert record["missing_fields"].keys() == {key for key, value in record.items() if value is None}
    if route == "intrabar_bracket":
        assert any(row["payload"]["active_stop"] is not None for row in rows if row["kind"] == "OBSERVATION")
        assert all(record["exit_reason"] is not None for record in actual)
    assert source["windows"][-1]["availability"]["reason_code"] == "FIXED_NATIVE_PROFILE_DID_NOT_EXECUTE_HOLDOUT"
    assert [row["source_ordinal"] for row in rows] == list(range(len(rows)))
    assert all(row["payload"]["monthly_returns"]["definition_id"].startswith("WINDOW_") for row in rows if row["kind"] == "ANALYTICS")


def test_bar_arrow_schema_preserves_candles_when_fee_ledger_is_missing():
    schema = current_source_schema_registry(bar_ledger=True).require("observations").arrow_schema
    bar = '{"candle":{"open":"100"},"fee":null}'
    row = {"source_ordinal": 0, "source_index_utc": "2026-01-01T00:00:00+00:00", "at_utc_ms": 1767225600000,
           "equity": "20000", "return_fraction": "0", "drawdown_fraction": "0", "accepted_position": "0",
           "signal_target": "0", "bar_json": bar}
    assert pa.RecordBatch.from_pylist([row], schema=schema).to_pylist()[0]["bar_json"] == bar


def test_three_completed_windows_have_independent_full_population_analytics():
    market = tape().iloc[:48].copy()
    market["equity"] = 20000 + np.arange(len(market))
    market["returns"] = market.equity.pct_change().fillna(0)
    market["drawdown"] = 0; market["accepted_position"] = 0; market["signal_target"] = 0
    descriptors, records = [], []
    for role, part in zip(["IS", "OOS", "HOLDOUT"], np.array_split(np.arange(len(market)), 3)):
        source = frame_observations(market.iloc[part])
        d, rows = completed_window(observations=source, window=role, fold_id=None, start=source[0]["at_utc_ms"],
            end=source[-1]["at_utc_ms"] + 3600000, bar_ms=3600000, authority="FROZEN_PARAMETER_POST_SELECTION_ACCOUNT")
        descriptors.append(d); records.extend(rows)
    source, rows = package(descriptors, records, protocol="three_window_decay", execution_route="pct_equity")
    assert source["counts"] == {"OBSERVATION": 48, "ANALYTICS": 3, "EXECUTION": 0}
    analyses = [row["payload"] for row in rows if row["kind"] == "ANALYTICS"]
    assert len({a["input_digest"] for a in analyses}) == 3
    assert all(a["observation_count"] == 16 for a in analyses)
    assert all(a["metrics"]["trade_count"]["value"] is None for a in analyses)
    assert all(a["metrics"]["return_fraction"]["scope"] == a["window"] for a in analyses)
    assert b"NaN" not in canonical(rows)


def test_source_path_and_exact_hash_fail_closed(tmp_path):
    (tmp_path / "source").symlink_to(tmp_path / "missing")
    with pytest.raises(ValueError): read_rows(tmp_path / "source")
    with pytest.raises(ValueError): verify_source({"schema_version": "research.window-execution-source.v1", "row_count": 0, "rows_digest": "0"*64}, [])


def test_wfo_oos_scope_excludes_true_source_training_padding(tmp_path):
    market = tape().iloc[:48].copy()
    market["equity"] = 20000 + np.arange(len(market))
    market["returns"] = market.equity.pct_change().fillna(0)
    market["drawdown"] = 0; market["accepted_position"] = 0; market["signal_target"] = 0
    observations = frame_observations(market)
    start, end = observations[24]["at_utc_ms"], observations[-1]["at_utc_ms"] + 3600000
    source, rows = capture_current_windows(observations=observations,
        folds=[{"fold_id":"0","test_start_utc_ms":start,"test_end_utc_ms":end-3600000}],
        windows={"oos":{"start_ms":start,"end_ms":end}},three_rows=None,raw_dir=tmp_path,route="pct_equity",bar_ms=3600000)
    actual = [r for r in rows if r["kind"] == "OBSERVATION"]
    assert len(actual) == 24 and actual[0]["at_utc_ms"] == start
    assert source["windows"][0]["observation_count"] == 24
    assert source["windows"][-1]["availability"]["state"] == "NOT_APPLICABLE"


def test_global_selected_params_and_local_fold_params_never_mix():
    from portal_api.services.advanced_walkforward_runner import _training_params_for_fold
    source = {"params_by_fold": {}, "optimization_schedule":"global", "best_trial":{"params":{"rvol":1.6}}}
    assert _training_params_for_fold(source, 2) == {"rvol":1.6}
    source["optimization_schedule"] = "per_fold_causal"
    assert _training_params_for_fold(source, 2) is None
    source["params_by_fold"] = {"2":{"rvol":1.8}}
    assert _training_params_for_fold(source, 2) == {"rvol":1.8}
    assert _training_params_for_fold(source, 0) is None


def test_training_diagnostic_uses_engine_slice_and_observed_predecessors(tmp_path):
    from portal_api.services.advanced_walkforward_runner import AdvancedWalkForwardRunner
    from portal_api.workers.research_child import _full03_strategy_callable
    from portal_api.repositories.artifacts import ArtifactRepository
    from portal_api.services.three_window_runner import _account_kwargs
    from portal_api.domain.requests import AccountConfig, ExecutionConfig
    from portal_api.adapters.quantbt import QuantBTGateway
    market = tape()
    fold = pd.DataFrame([{"fold_id":0,"train_start":market.index[300],"train_end":market.index[354]}])
    runner = AdvancedWalkForwardRunner(gateway=QuantBTGateway(),artifacts=ArtifactRepository(tmp_path))
    runner._write_training_diagnostics("training-test",market,
        {"fold_table":fold,"params_by_fold":{},"optimization_schedule":"global","best_trial":{"params":PARAMS}},
        _account_kwargs(AccountConfig(),ExecutionConfig()),"pct_equity",_full03_strategy_callable(market))
    frame = pd.read_parquet(tmp_path / "training-test" / "series" / "training-0.parquet")
    assert len(frame) == 55 and frame.index[0] == market.index[300] and frame.index[-1] == market.index[354]
    assert frame.equity.notna().all()
