"""FULL-02 native adapters on deterministic unit tape, not HMD qualification.

The parent takes ordinary P08/P10 product receipts separately. These focused
tests prove native study scoping, actual route identity and Holdout exclusion.
"""
from __future__ import annotations

import json
import pandas as pd
import pytest

from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.research_full02_profiles import (
    DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_PER_FOLD_DECAY_PROFILE_DIGEST,
    DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST,
)
from portal_api.services.research_supervisor import DeltaWfoChildReceipt
from portal_api.workers import research_child
from test_advanced_walkforward import _market


def _receipt(tmp_path, *, three_window=False):
    frame = _market().frame
    market_path = tmp_path / "market.parquet"
    frame.to_parquet(market_path)
    milliseconds = lambda timestamp: int(timestamp.value // 1_000_000)
    return DeltaWfoChildReceipt(job_id="rjob_full02_unit", run_id="run-full02-unit",
        worker_attempt_id="ra_full02_unit", lease_epoch=1, market_path=market_path,
        artifact_root=tmp_path / "artifacts", dataset_id="golden-fixture", symbol="ETHUSDT",
        execution_profile_id=DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID if three_window else DELTA_PER_FOLD_DECAY_PROFILE_ID,
        execution_profile_digest=DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST if three_window else DELTA_PER_FOLD_DECAY_PROFILE_DIGEST,
        data_start_utc_ms=milliseconds(frame.index[0]), first_oos_utc_ms=milliseconds(frame.index[140]),
        data_end_exclusive_utc_ms=milliseconds(frame.index[-1] + pd.Timedelta(hours=1)),
        holdout_start_utc_ms=milliseconds(frame.index[300]) if three_window else None,
        task="P10_DELTA_THREE_WINDOW_OPTIMIZED" if three_window else "P10_DELTA_WFO",
        temporal_controls=None if three_window else {"split_frequency": "weekly", "window_mode": "expanding",
            "train_window": None, "label_horizon_bars": 0, "purge_bars": 0, "embargo_bars": 0})


def test_full02_route_factories_reject_unadmitted_targets():
    gateway = QuantBTGateway()
    with pytest.raises(ValueError, match="not Portal-allowlisted"):
        gateway.run_mode1_calibration(strategy_fn=None, data=pd.DataFrame(), param_ranges={}, oos_start=None,
            optimization_config={}, optuna_trials=3, optuna_early_stopping=None, random_seed=42,
            account_kwargs={}, target_mode="basket")
    with pytest.raises(ValueError, match="not Portal-allowlisted"):
        gateway.run_frozen_replay(evaluation_frame=pd.DataFrame(), signal=pd.Series(dtype=float),
            account_kwargs={}, target_mode="basket")


def test_decay_child_rejects_digest_preview_and_causal_controls(tmp_path, monkeypatch):
    receipt = _receipt(tmp_path)
    payload = receipt.as_payload(output_root=tmp_path / "output")
    calls = []
    monkeypatch.setattr(research_child, "_run_delta_wfo_study", lambda *args, **kwargs: calls.append(kwargs) or {})
    research_child._run_p10_delta_wfo(payload, tmp_path / "output")
    assert calls[0]["per_fold_decay"] is True and calls[0]["causal_inner"] is False
    assert calls[0]["optuna_trials"] == 3
    for changes in ({"execution_profile_digest": "0" * 64}, {"optuna_trials": 400}, {"causal_inner_controls": {}}):
        with pytest.raises(ValueError):
            research_child._run_p10_delta_wfo({**payload, **changes}, tmp_path / "output")


def test_actual_decay_child_retains_outer_study_identity_and_oos_used_truth(tmp_path):
    receipt = _receipt(tmp_path)
    output = tmp_path / "output"
    output.mkdir()
    result = research_child._run_p10_delta_wfo(receipt.as_payload(output_root=output), output)
    assert 2 <= result["n_folds"] <= 16
    assert result["trial_rows"] == 3 * result["n_folds"]
    root = output / receipt.run_id
    trials = pd.read_parquet(root / "wfo/trials.parquet")
    assert trials.groupby("study_id").size().eq(3).all()
    selections = pd.read_parquet(root / "wfo/fold_selection.parquet")
    assert selections["outer_oos_used_for_selection"].all()
    assert set(selections["causality_claim"]) == {"fold_local_decay_calibration"}
    selected = json.loads((root / "selection/selected_params.json").read_text())
    assert selected["scope"] == "LAST_FOLD_DEPLOYMENT"
    assert selected["fold_id"] == str(int(selections.iloc[-1]["fold_id"]))
    records = [json.loads(line) for line in (tmp_path / "progress.ndjson").read_text().splitlines()]
    assert len(records) == result["trial_rows"]
    assert [record["trial"] for record in records] == list(range(1, result["trial_rows"] + 1))
    assert [record["source_trial_id"] for record in records] == ["0", "1", "2"] * result["n_folds"]


def test_decay_child_checks_total_studies_before_any_trial(tmp_path, monkeypatch):
    receipt = _receipt(tmp_path)
    payload = receipt.as_payload(output_root=tmp_path / "output")
    monkeypatch.setattr(QuantBTGateway, "walk_forward_fold_plan", lambda *args, **kwargs: [{}] * 17)
    with pytest.raises(ValueError, match="2..16"):
        research_child._run_p10_delta_wfo(payload, tmp_path / "output")
    assert not (tmp_path / "progress.ndjson").exists()


def test_decay_child_rejects_off_step_pin_before_compute(tmp_path):
    receipt = _receipt(tmp_path)
    payload = receipt.as_payload(output_root=tmp_path / "output")
    with pytest.raises(ValueError, match="declared step"):
        research_child._run_p10_delta_wfo({**payload, "pinned_parameters": {"rvol": "1.37"}}, tmp_path / "output")


def test_three_window_task_negative_axes(tmp_path):
    receipt = _receipt(tmp_path, three_window=True)
    payload = receipt.as_payload(output_root=tmp_path / "output")
    for changes in ({"execution_profile_digest": "0" * 64}, {"optuna_trials": 400},
                    {"temporal_controls": {}}, {"holdout_start_utc_ms": receipt.first_oos_utc_ms},
                    {"pinned_parameters": {"window": "32"}}, {"pinned_parameters": {"rvol": "NaN"}},
                    {"pinned_parameters": {"rvol": "1.37"}}):
        with pytest.raises(ValueError):
            research_child._run_p10_delta_three_window_optimized({**payload, **changes}, tmp_path / "output")


def _three_window_run(tmp_path):
    tmp_path.mkdir()
    receipt = _receipt(tmp_path, three_window=True)
    output = tmp_path / "output"
    output.mkdir()
    result = research_child._run_p10_delta_three_window_optimized(receipt.as_payload(output_root=output), output)
    return receipt, result, output / receipt.run_id


def test_actual_optimized_three_window_native_route_and_untouched_holdout(tmp_path):
    receipt, result, root = _three_window_run(tmp_path / "first")
    assert result["n_folds"] == 1 and result["trial_rows"] == 3
    manifest = json.loads((root / "manifest.json").read_text())
    config = json.loads((root / "config.json").read_text())
    assert manifest["protocol"] == "three_window_decay"
    assert config["execution"]["target_mode"] == "signal_notional"
    source = json.loads((root / "wfo/source_contract.v1.json").read_text())
    assert source["engine_operation"] == "train_test_split"
    roles = json.loads((root / "wfo/three_window_roles.v1.json").read_text())
    assert roles["freeze_before_holdout"] and roles["holdout_used_for_selection"] is False
    observations = pd.read_parquet(root / "series/stitched.parquet")
    assert observations.index.min().value // 1_000_000 == receipt.first_oos_utc_ms
    assert observations.index.max().value // 1_000_000 < receipt.holdout_start_utc_ms
    holdout = pd.read_parquet(root / "series/holdout_live.parquet")
    assert holdout.index.min().value // 1_000_000 == receipt.holdout_start_utc_ms
    assert (root / "series/account_ledger.v1.parquet").is_file()
    selected = json.loads((root / "selection/selected_params.json").read_text())
    second_dir = tmp_path / "mutated"
    second_dir.mkdir()
    second = _receipt(second_dir, three_window=True)
    market = pd.read_parquet(second.market_path)
    market.loc[market.index >= pd.Timestamp(second.holdout_start_utc_ms, unit="ms", tz="UTC"), ["open", "high", "low", "close"]] *= 1.2
    market.to_parquet(second.market_path)
    second_output = second_dir / "output"
    second_output.mkdir()
    research_child._run_p10_delta_three_window_optimized(second.as_payload(output_root=second_output), second_output)
    mutated = json.loads((second_output / second.run_id / "selection/selected_params.json").read_text())
    assert mutated["params"] == selected["params"] and mutated["params_hash"] == selected["params_hash"]
    assert mutated["trial_id"] == selected["trial_id"]
