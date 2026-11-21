"""FULL-03 exact dispatch/clock tests; unit tapes are not HMD qualification."""
from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import replace
from types import SimpleNamespace

import pandas as pd
import pytest

from portal_api.domain.research_execution_recipes import execution_recipe, recipe_digest
from portal_api.domain.research_full03_profiles import (
    full03_recipe, full03_controls, full03_execution_binding, full03_profile_enabled,
)
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.services.research_run_producer import ResearchRunProducerExecutor, ResearchRunProducerError
from portal_api.services.research_supervisor import (
    DeltaWfoChildReceipt, IsolatedResearchSupervisor, ResearchChildLimits, ResearchSupervisorError,
)
from portal_api.workers import research_child
from test_advanced_walkforward import _market
from wfo_test_support import wfo_request

METHODS = ("wfo-temporal", "causal-inner", "per-fold-decay", "three-window-optimized")
TIMEFRAMES = ("1m", "5m", "15m", "30m", "1h", "4h", "1d")
PROFILE_IDS = tuple(f"p10.delta-{method}-{timeframe}.v1" for method in METHODS for timeframe in TIMEFRAMES)


def full03_request(profile_id="p10.delta-wfo-temporal-4h.v1"):
    doc = wfo_request()
    row = execution_recipe(profile_id)
    research, spec, p = doc["research"], doc["research"]["requested_spec"], row["descriptor"]
    requirement = p["alpha_binding_requirements"]
    research.update(execution_profile_id=profile_id, execution_profile_digest=row["profile_digest"],
        alpha_version_id=requirement["alpha_version_id"], execution_adapter_id=requirement["adapter_id"],
        adapter_contract_digest=requirement["adapter_contract_digest"])
    spec["alpha_binding"]["alpha_version_id"] = requirement["alpha_version_id"]
    spec["data"]["timeframe"] = p["timeframe"]
    spec.update(schema_version=p["requested_spec_version"], optimization_schedule=p["optimization_schedule"])
    if row["adapter_kind"] == "DELTA_THREE_WINDOW_OPTIMIZED":
        spec.pop("walk_forward")
        spec.update(protocol="three_window_decay", windows={
            "is": {"start": "2024-01-01T00:00:00Z", "end_exclusive": "2024-01-08T00:00:00Z"},
            "oos": {"start": "2024-01-08T00:00:00Z", "end_exclusive": "2024-01-15T00:00:00Z"},
            "holdout": {"start": "2024-01-15T00:00:00Z", "end_exclusive": "2024-01-22T00:00:00Z"}})
        doc["protocol"] = "three_window_decay"
    else:
        spec["walk_forward"].update(train_window=None, label_horizon_bars=0, purge_bars=0, embargo_bars=0)
        if p["optimization_schedule"] == "per_fold_causal":
            spec["walk_forward"]["inner"] = {"split_frequency": "weekly", "window_mode": "expanding", "train_window": "1D", "min_folds": 2}
    bind_full03_work(doc)
    return doc


def bind_full03_work(doc):
    r = doc["research"]
    r["requested_spec_digest"] = recipe_digest(r["requested_spec"])
    r["work_digest"] = recipe_digest({"schema_version": execution_recipe(r["execution_profile_id"])["work_schema_version"],
        **{name: r[name] for name in ("requested_spec_digest", "effective_spec_digest", "dataset_binding_digest", "manifest_digest")},
        "snapshot": {name: r[name] for name in ("snapshot_id", "snapshot_content_hash")},
        "alpha": {"alpha_id": r["alpha_id"], "alpha_version_id": r["alpha_version_id"],
            "adapter_id": r["execution_adapter_id"], "adapter_contract_digest": r["adapter_contract_digest"]},
        "execution_profile": {"profile_id": r["execution_profile_id"], "profile_digest": r["execution_profile_digest"]},
        "engine_release_id": r["requested_spec"]["client"]["engine_release_id"], "requested_spec": r["requested_spec"]})


@pytest.mark.parametrize("profile_id", PROFILE_IDS)
def test_exact_registry_profiles_bind_new_av_without_preview_inheritance(profile_id, monkeypatch):
    monkeypatch.setenv("PORTAL_ENV", "local")
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO", "true")
    admitted = ResearchRunProducerRequest.model_validate(full03_request(profile_id))
    assert admitted.research.is_full03 and admitted.research.is_delta_wfo
    row = full03_recipe(profile_id, admitted.research.execution_profile_digest)
    assert admitted.research.is_three_window_optimized == (row["adapter_kind"] == "DELTA_THREE_WINDOW_OPTIMIZED")
    assert admitted.model_dump(mode="json") == full03_request(profile_id)
    malformed = full03_request(profile_id)
    malformed["research"]["requested_spec"]["optuna_trials"] = 400
    bind_full03_work(malformed)
    with pytest.raises(ValueError):
        ResearchRunProducerRequest.model_validate(malformed)


@pytest.mark.parametrize("field", ("digest", "old_av", "adapter", "timeframe", "dataset", "seed", "work", "snapshot", "source", "mode", "schedule", "optimizer", "client", "nonfinite_pin"))
def test_closed_full03_envelope_refusals(field):
    doc = full03_request()
    r, s = doc["research"], doc["research"]["requested_spec"]
    if field == "digest": r["execution_profile_digest"] = "0" * 64
    if field == "old_av":
        r["alpha_version_id"] = s["alpha_binding"]["alpha_version_id"] = "av_delta_rsi_polynomial_alpha_1_0_0"
    if field == "adapter": r["execution_adapter_id"] = "p04.delta-rsi.v1"
    if field == "timeframe": s["data"]["timeframe"] = "1h"
    if field == "dataset": doc["dataset_id"] = s["data"]["dataset_id"] = "vn-stock-daily"
    if field == "seed": s["random_seed"] = True
    if field == "work": r["work_digest"] = "0" * 64
    if field == "snapshot": r["snapshot_content_hash"] = "0" * 64
    if field == "source": r["imported_source_digest"] = "0" * 64
    if field == "mode": s["optimization_mode"] = "mode_5_full_robust"
    if field == "schedule": s["optimization_schedule"] = "per_fold_decay"
    if field == "optimizer": s["optimization_config"] = {"scoring_backend": "proxy"}
    if field == "client": s["client"] = None
    if field == "nonfinite_pin": s["parameter_space_overrides"] = [{"name": "rvol", "kind": "pin", "value": "NaN"}]
    with pytest.raises(ValueError):
        ResearchRunProducerRequest.model_validate(doc)


def test_daily_span_uses_daily_recipe_bound_not_old_92_days():
    doc = full03_request("p10.delta-wfo-temporal-1d.v1")
    doc["research"]["requested_spec"]["walk_forward"]["end_exclusive"] = "2025-01-01T00:00:00Z"
    bind_full03_work(doc)
    ResearchRunProducerRequest.model_validate(doc)
    doc["research"]["requested_spec"]["walk_forward"]["end_exclusive"] = "2035-01-01T00:00:00Z"
    bind_full03_work(doc)
    with pytest.raises(ValueError, match="range"):
        ResearchRunProducerRequest.model_validate(doc)


def _receipt(tmp_path, method="wfo-temporal", timeframe="4h"):
    profile_id = f"p10.delta-{method}-{timeframe}.v1"
    row = execution_recipe(profile_id)
    frame = _market().frame.copy()
    interval = pd.Timedelta(milliseconds=row["descriptor"]["source_clock"]["bar_interval_ms"])
    frame.index = pd.date_range("2023-01-01", periods=len(frame), freq=interval, tz="UTC")
    start, split, holdout = frame.index[300], frame.index[378], frame.index[440]
    frame.to_parquet(tmp_path / "market.parquet")
    controls = full03_controls(full03_request(profile_id)["research"]["requested_spec"], row)
    ms = lambda t: int(t.value // 1_000_000)
    return DeltaWfoChildReceipt(job_id="rjob_full03_unit", run_id="run-full03-unit", worker_attempt_id="ra_full03_unit",
        lease_epoch=1, market_path=tmp_path / "market.parquet", artifact_root=tmp_path / "artifacts",
        execution_profile_id=profile_id, execution_profile_digest=row["profile_digest"], dataset_id="crypto-binance-1m", symbol="BTCUSDT",
        data_start_utc_ms=ms(start), first_oos_utc_ms=ms(split), data_end_exclusive_utc_ms=ms(frame.index[-1] + interval),
        task="P10_DELTA_THREE_WINDOW_OPTIMIZED" if method == "three-window-optimized" else "P10_DELTA_WFO",
        temporal_controls=controls if method != "causal-inner" else None,
        causal_inner_controls=controls if method == "causal-inner" else None,
        holdout_start_utc_ms=ms(holdout) if method == "three-window-optimized" else None,
        execution_binding=full03_execution_binding(row))


@pytest.mark.parametrize("method", METHODS[:3])
def test_child_dispatch_selects_exact_descriptor_and_study_semantics(tmp_path, method, monkeypatch):
    receipt = _receipt(tmp_path, method)
    calls = []
    monkeypatch.setattr(research_child, "_run_delta_wfo_study", lambda *args, **kwargs: calls.append(kwargs) or {})
    research_child._run_p10_delta_wfo(receipt.as_payload(output_root=tmp_path / "output"), tmp_path / "output")
    assert calls[0]["exact_recipe"]["descriptor"]["timeframe"] == "4h"
    assert calls[0]["causal_inner"] == (method == "causal-inner")
    assert calls[0]["per_fold_decay"] == (method == "per-fold-decay")


def test_candidate_gate_is_exact_local_only(monkeypatch):
    # Test the pre-qualification lane independently of the compiled image's
    # real product qualification, which changes only after all receipts pass.
    monkeypatch.setattr("portal_api.domain.research_full03_profiles.execution_recipe_qualification",
                        lambda _: {"kind": "CANDIDATE_NOT_QUALIFIED"})
    profile = "p10.delta-wfo-temporal-4h.v1"
    env = {"PORTAL_FEATURE_RESEARCH_FULL03_PROFILE": "true", "PORTAL_ENV": "local", "PORTAL_RECIPE_QUALIFICATION_PROFILE_ID": profile}
    assert full03_profile_enabled(profile, env)
    assert not full03_profile_enabled(profile, {**env, "PORTAL_ENV": "production"})
    assert not full03_profile_enabled(profile, {**env, "PORTAL_RECIPE_QUALIFICATION_PROFILE_ID": "p10.delta-wfo-temporal-1h.v1"})
    assert not full03_profile_enabled(profile, {**env, "PORTAL_FEATURE_RESEARCH_FULL03_PROFILE": "false"})


def test_qualified_recipe_still_requires_its_feature_flag(monkeypatch):
    monkeypatch.setattr("portal_api.domain.research_full03_profiles.execution_recipe_qualification",
                        lambda _: {"kind": "PRODUCT_RUN_QUALIFIED"})
    profile = "p10.delta-wfo-temporal-4h.v1"
    assert full03_profile_enabled(profile, {"PORTAL_FEATURE_RESEARCH_FULL03_PROFILE": "true"})
    assert not full03_profile_enabled(profile, {})


def test_receipt_rejects_foreign_binding_and_widened_budgets_before_launch(tmp_path):
    receipt = _receipt(tmp_path)
    for modified in (replace(receipt, execution_binding=None), replace(receipt, optuna_trials=400),
                     replace(receipt, execution_binding={**receipt.execution_binding, "timeframe": "1h"}),
                     replace(receipt, causal_inner_controls={}), replace(receipt, task="P16_DELTA_WHATIF_GRID")):
        with pytest.raises(ResearchSupervisorError):
            modified.as_payload(output_root=tmp_path / "output")
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=tmp_path)
    for limits in (ResearchChildLimits(cpu_seconds=121), ResearchChildLimits(wall_seconds=241), ResearchChildLimits(memory_bytes=5 * 1024**3)):
        with pytest.raises(ResearchSupervisorError, match="cannot widen"):
            supervisor.run_delta_wfo(receipt, limits=limits)


@pytest.mark.parametrize("case", ("missing_warmup", "off_clock", "extra_old_warmup", "unclosed", "future", "bar_budget"))
def test_actual_clock_and_warmup_refusals_without_compute(tmp_path, case):
    receipt = _receipt(tmp_path)
    row = execution_recipe(receipt.execution_profile_id)
    frame = pd.read_parquet(receipt.market_path)
    payload = receipt.as_payload(output_root=tmp_path / "output")
    if case == "missing_warmup": frame = frame.iloc[1:]
    if case == "off_clock": frame.index = frame.index + pd.Timedelta(minutes=1)
    if case == "extra_old_warmup": frame.index = frame.index - pd.Timedelta(hours=4)
    if case == "unclosed": payload["data_end_exclusive_utc_ms"] -= 1
    if case == "future":
        frame.index = frame.index + pd.Timedelta(days=10_000)
        for name in ("data_start_utc_ms", "first_oos_utc_ms", "data_end_exclusive_utc_ms"):
            payload[name] += 10_000 * 86_400_000
    if case == "bar_budget": row = copy.deepcopy(row); row["budgets"]["planning_max_bars"] = len(frame) - 1
    with pytest.raises(ValueError):
        research_child._validate_full03_market(frame, payload, row)


def test_writer_preserves_gaps_and_half_open_edges_and_300_target_bars(tmp_path):
    receipt = _receipt(tmp_path)
    frame = pd.read_parquet(receipt.market_path)
    start = pd.Timestamp(receipt.data_start_utc_ms, unit="ms", tz="UTC")
    split = pd.Timestamp(receipt.first_oos_utc_ms, unit="ms", tz="UTC")
    end = pd.Timestamp(receipt.data_end_exclusive_utc_ms, unit="ms", tz="UTC")
    frame = frame.drop(frame.index[350])
    frame.to_parquet(receipt.market_path)
    tape = tmp_path / "tape.parquet"
    counts = ResearchRunProducerExecutor._write_is_oos_tape(frame_path=receipt.market_path, tape_path=tape,
        is_start=start, oos_start=split, oos_end=end, warmup_lower_bound=start - pd.Timedelta(hours=300 * 4))
    output = pd.read_parquet(tape)
    assert counts.warmup_bars == 300 and len(output) == len(frame)
    assert output.index.equals(frame.index)
    assert output.index[-1] < end


def test_source_clock_accepts_arrow_microsecond_index_without_changing_bar_units(tmp_path):
    receipt = _receipt(tmp_path)
    row = execution_recipe(receipt.execution_profile_id)
    frame = pd.read_parquet(receipt.market_path)
    frame.index = frame.index.as_unit("us")
    research_child._validate_full03_market(frame, receipt.as_payload(output_root=tmp_path / "output"), row)


@pytest.mark.parametrize("slice_start", (300, 350, 400))
def test_full03_indicator_reads_exact_predecessors_before_each_slice_without_future_or_accounting_leak(tmp_path, slice_start, monkeypatch):
    import strategy.main as protected_kernel
    receipt = _receipt(tmp_path)
    history = pd.read_parquet(receipt.market_path)
    engine_data = history.iloc[slice_start:]
    scoring = engine_data.index[:20]
    observed = []
    original = protected_kernel.generate_delta_rsi_signals

    def protected_output(data, params):
        observed.append(data.copy())
        return original(data, params)

    monkeypatch.setattr(protected_kernel, "generate_delta_rsi_signals", protected_output)
    strategy = research_child._full03_strategy_callable(history)
    signal = strategy(engine_data, research_child._P04_DELTA_PARAMS, engine_data.index[:10], scoring, None)
    kernel_input = observed[0]
    assert kernel_input.index[:300].equals(history.index[slice_start - 300:slice_start])
    assert len(kernel_input) == 320 and kernel_input.index[-1] == scoring[-1]
    assert signal.index.equals(scoring) and len(signal) == 20
    altered = history.copy()
    altered.loc[altered.index > scoring[-1], "close"] *= 1_000_000
    research_child._full03_strategy_callable(altered)(altered.iloc[slice_start:], research_child._P04_DELTA_PARAMS, scoring[:10], scoring, None)
    pd.testing.assert_frame_equal(observed[0], observed[1])


def test_full03_indicator_refuses_missing_predecessors_and_foreign_scoring_indices(tmp_path):
    receipt = _receipt(tmp_path)
    history = pd.read_parquet(receipt.market_path)
    strategy = research_child._full03_strategy_callable(history)
    with pytest.raises(ValueError, match="300 observed"):
        strategy(history.iloc[299:], {}, history.index[299:305], history.index[305:310], None)
    with pytest.raises(ValueError, match="scoring indices"):
        strategy(history.iloc[300:], {}, history.index[300:305], history.index[299:301], None)


def _producer(tmp_path, method, supervisor=None):
    receipt = _receipt(tmp_path, method)
    frame = pd.read_parquet(receipt.market_path)
    frame_path = tmp_path / "frame.parquet"
    frame.to_parquet(frame_path)
    digest = hashlib.sha256(frame_path.read_bytes()).hexdigest()
    snapshots = SimpleNamespace(describe=lambda _: (SimpleNamespace(content_hash=digest), None), snapshot_path=lambda _: tmp_path)
    doc = full03_request(receipt.execution_profile_id)
    doc["research"]["snapshot_content_hash"] = digest
    spec = doc["research"]["requested_spec"]
    instant = lambda milliseconds: pd.Timestamp(milliseconds, unit="ms", tz="UTC").isoformat()
    if method == "three-window-optimized":
        windows = spec["windows"]
        for name, start, end in (("is", receipt.data_start_utc_ms, receipt.first_oos_utc_ms),
                                ("oos", receipt.first_oos_utc_ms, receipt.holdout_start_utc_ms),
                                ("holdout", receipt.holdout_start_utc_ms, receipt.data_end_exclusive_utc_ms)):
            windows[name] = {"start": instant(start), "end_exclusive": instant(end)}
    else:
        spec["walk_forward"].update(start=instant(receipt.data_start_utc_ms), split_mode=instant(receipt.first_oos_utc_ms),
            end_exclusive=instant(receipt.data_end_exclusive_utc_ms))
    bind_full03_work(doc)
    request = ResearchRunProducerRequest.model_validate(doc)
    return request, ResearchRunProducerExecutor(snapshots=snapshots, supervisor=supervisor, market_root=tmp_path / "work")


@pytest.mark.parametrize("method", METHODS)
def test_producer_constructs_exact_receipt_and_budgets_before_confined_launch_and_retires_tape(tmp_path, method, monkeypatch):
    calls = []

    def bounded_launch(receipt, *, limits, **kwargs):
        calls.append((receipt, limits))
        raise ResearchSupervisorError("test stops before launching a child", code="RESOURCE_EXCEEDED")

    request, producer = _producer(tmp_path, method, SimpleNamespace(run_delta_wfo=bounded_launch))
    for name in ("PORTAL_FEATURE_RESEARCH_WFO_PROFILE", "PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS", "PORTAL_FEATURE_RESEARCH_FULL03_PROFILE"):
        monkeypatch.setenv(name, "true")
    monkeypatch.setenv("PORTAL_ENV", "local")
    monkeypatch.setenv("PORTAL_RECIPE_QUALIFICATION_PROFILE_ID", request.research.execution_profile_id)
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO", "true")
    with pytest.raises(ResearchRunProducerError) as error:
        producer._execute_delta_wfo_sync(request, tmp_path / "artifacts", lambda *_: None)
    assert error.value.code == "RESOURCE_EXCEEDED" and len(calls) == 1
    receipt, limits = calls[0]
    assert receipt.execution_binding["timeframe"] == "4h" and receipt.optuna_trials is None
    assert limits.cpu_seconds == 120 and limits.wall_seconds == 240 and limits.memory_bytes == 4 * 1024**3
    assert not receipt.market_path.exists()


@pytest.mark.parametrize("method", ("causal-inner", "per-fold-decay"))
def test_actual_snapshot_planner_observes_target_clock_and_total_study_trials(tmp_path, method):
    request, producer = _producer(tmp_path, method)
    trials = producer.causal_planned_trials(request)
    assert trials == 9
    frame = pd.read_parquet(tmp_path / "frame.parquet")
    frame.iloc[1:].to_parquet(tmp_path / "frame.parquet")
    with pytest.raises(ResearchRunProducerError, match="binding changed"):
        producer.causal_planned_trials(request)


@pytest.mark.parametrize("method", METHODS)
def test_actual_native_four_hour_child_keeps_exact_timeframe_and_study_mapping(tmp_path, method):
    receipt = _receipt(tmp_path, method)
    output = tmp_path / "output"
    output.mkdir()
    run = research_child._run_p10_delta_three_window_optimized if method == "three-window-optimized" else research_child._run_p10_delta_wfo
    result = run(receipt.as_payload(output_root=output), output)
    assert result["execution_profile_digest"] == receipt.execution_profile_digest
    assert result["bars"] == len(pd.read_parquet(receipt.market_path))
    config = json.loads((output / receipt.run_id / "config.json").read_text())
    assert config["timeframe"] == "4h"
    trials = pd.read_parquet(output / receipt.run_id / "wfo/trials.parquet")
    assert len(trials) == 3 * (result["n_folds"] if method in {"causal-inner", "per-fold-decay"} else 1)
    if method in {"causal-inner", "per-fold-decay"}:
        assert trials.groupby("study_id").size().eq(3).all()
    stitched = pd.read_parquet(output / receipt.run_id / "series/stitched.parquet")
    # Native Advanced output aligns initial-equity/zero-position observations
    # to the declared analysis span; its account takes positions only in OOS.
    # Indicator predecessors must enter neither that span nor the account.
    expected_start = receipt.first_oos_utc_ms if method == "three-window-optimized" else receipt.data_start_utc_ms
    assert int(stitched.index.min().value // 1_000_000) == expected_start
    if method != "three-window-optimized":
        before_oos = stitched.loc[stitched.index < pd.Timestamp(receipt.first_oos_utc_ms, unit="ms", tz="UTC")]
        assert before_oos["accepted_position"].eq(0).all() and before_oos["equity"].eq(20_000).all()
    assert int(stitched.index.max().value // 1_000_000) < receipt.data_end_exclusive_utc_ms
