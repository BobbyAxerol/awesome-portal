"""Causal/inner admission and actual QuantBT output over deterministic unit tape.

This is not HMD/runtime qualification. It exercises the pinned public engine
and custody joins over the existing golden fixture, without any holdout.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import pandas as pd
import pytest

from portal_api.domain.research_delta_causal_inner_profile import (
    DELTA_CAUSAL_INNER_PROFILE, DELTA_CAUSAL_INNER_PROFILE_DIGEST,
    DELTA_CAUSAL_INNER_PROFILE_ID, causal_inner_controls,
)
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.domain.requests import AdvancedWalkForwardConfig, OptimizationConfig
from portal_api.services.advanced_walkforward_runner import AdvancedWalkForwardRunner, _config_fields
from portal_api.services.current_source_artifacts import (
    CurrentSourceArtifactAdapter, CurrentSourceArtifactError, causal_inner_current_source_admission,
    iter_current_source_retention_batches,
)
from portal_api.services.research_current_source_retention import CurrentSourceRetentionResult
from portal_api.services.research_artifacts import ResearchArtifactStore
from portal_api.services.research_progress import ResearchProgressError, ResearchProgressJournal
from portal_api.services.research_run_producer import LiveStudyProgress, parameter_bundle_digest
from portal_api.services.research_supervisor import (
    _valid_child_progress_record, DeltaWfoChildReceipt, ResearchSupervisorError,
    IsolatedResearchSupervisor, ResearchChildLimits,
)
from portal_api.workers.durable_worker import DurableQuantWorker
from portal_api.workers.research_child import _ChildProgressWriter
from portal_api.workers import research_child
from test_current_source_artifacts import _market, _request, _identity, _fence
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.repositories.artifacts import ArtifactRepository
from wfo_test_support import wfo_request


def causal_request():
    document = wfo_request(split_mode="2024-01-14")
    document["research"].update(execution_profile_id=DELTA_CAUSAL_INNER_PROFILE_ID,
                                execution_profile_digest=DELTA_CAUSAL_INNER_PROFILE_DIGEST)
    spec = document["research"]["requested_spec"]
    spec.update(schema_version="research.requested-spec.v2", optimization_schedule="per_fold_causal")
    spec["walk_forward"]["inner"] = {"split_frequency": "weekly", "window_mode": "expanding", "train_window": "1D", "min_folds": 2}
    return document


def test_profile_digest_and_public_engine_mapping():
    encoded = json.dumps(dict(DELTA_CAUSAL_INNER_PROFILE), sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    assert hashlib.sha256(encoded).hexdigest() == DELTA_CAUSAL_INNER_PROFILE_DIGEST
    admitted = ResearchRunProducerRequest.model_validate(causal_request())
    assert admitted.research.is_delta_wfo
    controls = causal_inner_controls(admitted.research.requested_spec)
    config = AdvancedWalkForwardConfig(**controls, optimization_mode="mode_1_decay", optimization_schedule="per_fold_causal", optuna_trials=3)
    fields = _config_fields(config, target_mode="signal_notional")
    assert fields["inner_train_window"] == "1D"
    plan = QuantBTGateway().walk_forward_fold_plan(index=_market().frame.index, config_fields={**controls,
        "optimization_mode": "mode_1_decay", "optimization_schedule": "per_fold_causal", "optuna_trials": 3, "split_mode": "2024-01-14"})
    assert len(plan) == 2 and [len(fold["inner"]) for fold in plan] == [2, 3]
    assert all(not key.startswith("inner_") for key in AdvancedWalkForwardConfig().model_dump())


@pytest.mark.parametrize("case", ["digest", "missing_inner", "inner_width", "inner_min", "inner_unknown", "schedule", "budget", "optimization", "route", "width"])
def test_causal_profile_closed_refusals(case, monkeypatch):
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO", "true")
    monkeypatch.setenv("PORTAL_ENV", "local")
    doc = causal_request()
    spec = doc["research"]["requested_spec"]
    wf = spec["walk_forward"]
    if case == "digest": doc["research"]["execution_profile_digest"] = "0" * 64
    if case == "missing_inner": del wf["inner"]
    if case == "inner_width": wf["inner"]["train_window"] = "0D"
    if case == "inner_min": wf["inner"]["min_folds"] = 17
    if case == "inner_unknown": wf["inner"]["source"] = "holdout"
    if case == "schedule": spec["optimization_schedule"] = "per_fold_decay"
    if case == "budget": spec["optuna_trials"] = 400
    if case == "optimization": spec["optimization_config"] = {"candidate_selection_metric": "oos_mean_sharpe"}
    if case == "route": spec["route_params"] = {"scale": 2}
    if case == "width": wf["train_window"] = "14D"
    with pytest.raises(ValueError): ResearchRunProducerRequest.model_validate(doc)


def test_causal_config_rejects_partial_or_nonrobust_inner():
    with pytest.raises(ValueError):
        AdvancedWalkForwardConfig(optimization_mode="mode_1_decay", optimization_schedule="per_fold_causal")
    with pytest.raises(ValueError):
        AdvancedWalkForwardConfig(optimization_mode="mode_1_decay", optimization_schedule="per_fold_causal",
            inner_split_frequency="weekly", inner_window_mode="expanding", inner_train_window="1D",
            optimization=OptimizationConfig(candidate_selection_metric="oos_mean_sharpe"))
    with pytest.raises(ValueError): AdvancedWalkForwardConfig(inner_min_folds=2)
    admission = causal_inner_current_source_admission()
    admission.validate()
    with pytest.raises(CurrentSourceArtifactError): replace(admission, optuna_trials=400).validate()


def _child_receipt(tmp_path: Path) -> DeltaWfoChildReceipt:
    controls = causal_inner_controls(causal_request()["research"]["requested_spec"])
    return DeltaWfoChildReceipt(job_id="rjob_causal_unit", run_id="run-causal-child-unit", worker_attempt_id="ra_causal_unit", lease_epoch=1,
        market_path=tmp_path / "market.parquet", artifact_root=tmp_path / "artifacts",
        execution_profile_id=DELTA_CAUSAL_INNER_PROFILE_ID, execution_profile_digest=DELTA_CAUSAL_INNER_PROFILE_DIGEST,
        dataset_id="golden-fixture", symbol="ETHUSDT", data_start_utc_ms=1_704_067_200_000,
        data_end_exclusive_utc_ms=1_705_867_200_000, first_oos_utc_ms=1_705_190_400_000,
        causal_inner_controls=controls)


def test_private_child_envelope_keeps_its_closed_profile(tmp_path, monkeypatch):
    receipt = _child_receipt(tmp_path)
    payload = receipt.as_payload(output_root=tmp_path / "output")
    assert "optuna_trials" not in payload and "temporal_controls" not in payload
    assert set(payload["causal_inner_controls"]) == {"split_frequency", "window_mode", "train_window",
        "label_horizon_bars", "purge_bars", "embargo_bars", "inner_split_frequency", "inner_window_mode", "inner_train_window", "inner_min_folds"}
    with pytest.raises(ResearchSupervisorError): replace(receipt, optuna_trials=400).as_payload(output_root=tmp_path / "output")
    with pytest.raises(ResearchSupervisorError): replace(receipt, causal_inner_controls=None).as_payload(output_root=tmp_path / "output")
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=tmp_path)
    with pytest.raises(ResearchSupervisorError, match="cannot widen"):
        supervisor.run_delta_wfo(receipt, limits=ResearchChildLimits(cpu_seconds=121, wall_seconds=240))
    with pytest.raises(ResearchSupervisorError, match="cannot widen"):
        supervisor.run_delta_wfo(receipt, limits=ResearchChildLimits(cpu_seconds=120, wall_seconds=241))
    called = []
    monkeypatch.setattr(research_child, "_run_delta_wfo_study", lambda *args, **kwargs: called.append(kwargs) or {})
    research_child._run_p10_delta_wfo(payload, tmp_path / "output")
    assert called[0]["optuna_trials"] == 3 and called[0]["causal_inner"] is True
    for field, value in (("execution_profile_digest", "0" * 64), ("optuna_trials", 400), ("causal_inner_controls", {})):
        malformed = {**payload, field: value}
        with pytest.raises(ValueError): research_child._run_p10_delta_wfo(malformed, tmp_path / "output")


def test_snapshot_planner_binds_total_trials_before_progress(tmp_path):
    from test_research_run_producer import _snapshot
    from test_research_delta_wfo import _wfo_executor
    snapshots, identity = _snapshot(tmp_path)
    document = causal_request()
    document["research"].update(snapshot_id=identity.snapshot_id, snapshot_content_hash=identity.content_hash)
    executor = _wfo_executor(tmp_path, snapshots)
    admitted = ResearchRunProducerRequest.model_validate(document)
    assert executor.causal_planned_trials(admitted) == 6
    document["research"]["requested_spec"]["walk_forward"]["inner"]["min_folds"] = 16
    with pytest.raises(ValueError): executor.causal_planned_trials(ResearchRunProducerRequest.model_validate(document))


def test_actual_child_callback_carries_native_study_identity(tmp_path):
    receipt = _child_receipt(tmp_path)
    _market().frame.to_parquet(receipt.market_path)
    output = tmp_path / "output"
    output.mkdir()
    result = research_child._run_p10_delta_wfo(receipt.as_payload(output_root=output), output)
    assert result["n_folds"] == 2 and result["trial_rows"] == 6
    records = [json.loads(line) for line in (tmp_path / "progress.ndjson").read_text().splitlines()]
    assert [record["study_id"] for record in records] == ["0"] * 3 + ["1"] * 3
    assert [record["source_trial_id"] for record in records] == ["0", "1", "2"] * 2
    assert [record["trial"] for record in records] == list(range(1, 7))
    assert all(_valid_child_progress_record(record, record["sequence"]) is not None for record in records)


@pytest.fixture(scope="module")
def causal_source(tmp_path_factory):
    path = tmp_path_factory.mktemp("causal-golden-unit")
    source = ArtifactRepository(path / "source")
    base = _request(target_mode="signal_notional", optuna_trials=3)
    calibration = AdvancedWalkForwardConfig(**{**base.calibration.model_dump(),
        "split_mode": "2024-01-14", "optimization_schedule": "per_fold_causal",
        "inner_split_frequency": "weekly", "inner_window_mode": "expanding", "inner_train_window": "1D", "inner_min_folds": 2})
    request = base.model_copy(update={"calibration": calibration})
    run_id = "run-causal-unit"
    AdvancedWalkForwardRunner(gateway=QuantBTGateway(), artifacts=source).run(request, _market(), run_id, target_mode="signal_notional")
    return source, run_id


def _export(source, run_id, retained_path):
    store = ResearchArtifactStore(retained_path)
    exported = CurrentSourceArtifactAdapter(source_artifacts=source, retained_artifacts=store).export_advanced_walkforward(
        run_id=run_id, identity=_identity(run_id), fence=_fence(run_id),
        admission=causal_inner_current_source_admission(), fence_validator=lambda _: True)
    batches = list(iter_current_source_retention_batches(retained_artifacts=store, receipt=exported.receipt, cursor_secret=b"c" * 32))
    return exported, batches


def test_actual_nested_output_retains_each_fold_and_local_trial(causal_source, tmp_path):
    source, run_id = causal_source
    exported, batches = _export(source, run_id, tmp_path / "retained")
    rows = {kind: [row["payload"] for batch in batches if batch.table_kind == kind for row in batch.rows]
            for kind in ("FOLD", "TRIAL", "CANDIDATE", "SELECTION")}
    assert len(rows["TRIAL"]) == 6 and len({row["trial_id"] for row in rows["TRIAL"]}) == 6
    assert {row["trial_facts"]["source_trial_id"] for row in rows["TRIAL"]} == {"0", "1", "2"}
    assert len(rows["FOLD"]) == 2
    assert [row["causal_selection"]["inner_fold_count"] for row in rows["FOLD"]] == [2, 3]
    assert exported.receipt.summary["source_facts"]["temporal_guards"]["observed_inner_fold_count"] == 5
    for fold in rows["FOLD"]:
        block = fold["causal_selection"]
        assert block["study_trial_rows"] == 3 and block["outer_oos_used_for_selection"] is False
        assert block["objective_kind"] == "INNER_VALIDATION_DECAY_J"
        assert block["candidate_metrics_scope"] == "OUTER_FOLD_POST_SELECTION"
        assert block["candidate_is_scope"] == "INNER_VALIDATION_IS_MEAN"
        assert block["candidate_oos_scope"] == "OUTER_FOLD_OOS"
        assert block["candidate_decay_scope"] == "INNER_IS_MEAN_MINUS_OUTER_OOS"
        assert fold["fold_facts"]["oos_score"] is None
        selected_trial = next(row for row in rows["TRIAL"] if row["trial_id"] == block["selected_trial_id"])
        assert selected_trial["state"] == "COMPLETE"
        assert selected_trial["trial_facts"]["stage"] == "is_search" and selected_trial["trial_facts"]["pruned"] is False
        selected_candidate = next(row for row in rows["CANDIDATE"] if row["trial_facts"]["study_id"] == block["study_id"]
            and row["trial_facts"]["source_trial_id"] == selected_trial["trial_facts"]["source_trial_id"])
        assert selected_candidate["objective"] == block["objective"]
        assert selected_candidate["trial_facts"]["stage"] == "oos_candidate_selection" and selected_candidate["trial_facts"]["pruned"] is False
        assert all(inner["test_end_utc_ms"] <= fold["train_end_utc_ms"] for inner in block["inner_folds"])
    summary = exported.receipt.summary["selection"]
    assert summary["scope"] == "LAST_FOLD_DEPLOYMENT" and summary["fold_id"] == rows["FOLD"][-1]["fold_id"]
    assert summary["parameters"] == rows["FOLD"][-1]["causal_selection"]["parameters"]
    assert rows["SELECTION"][0]["scope"] == "LAST_FOLD_DEPLOYMENT"


@pytest.mark.parametrize("case", ["inner_oos", "missing_inner", "inner_count", "params", "study", "last_selection"])
def test_causal_retention_refuses_source_substitution(causal_source, tmp_path, case):
    import shutil
    original, run_id = causal_source
    shutil.copytree(original.root, tmp_path / "source")
    source = ArtifactRepository(tmp_path / "source")
    run_dir = source.run_directory(run_id)
    if case in {"inner_oos", "missing_inner"}:
        path = run_dir / "wfo/inner_folds.parquet"
        frame = pd.read_parquet(path)
        if case == "missing_inner": frame = frame.iloc[1:]
        else: frame.loc[0, "inner_test_end"] = pd.Timestamp("2024-01-15T00:00:00Z")
        frame.to_parquet(path)
    elif case == "params":
        path = run_dir / "wfo/params_by_fold.json"
        document = json.loads(path.read_text())
        document["0"]["window"] = 999
        path.write_text(json.dumps(document))
    elif case == "last_selection":
        path = run_dir / "selection/selected_params.json"
        document = json.loads(path.read_text())
        document["fold_id"] = "0"
        path.write_text(json.dumps(document))
    else:
        path = run_dir / "wfo/fold_selection.parquet"
        frame = pd.read_parquet(path)
        frame.loc[0, "inner_fold_count" if case == "inner_count" else "study_id"] = 16 if case == "inner_count" else 9
        frame.to_parquet(path)
    with pytest.raises(CurrentSourceArtifactError) as failure:
        _export(source, run_id, tmp_path / "retained")
    assert failure.value.code == "RESEARCH_CURRENT_SOURCE_CAUSAL_BINDING_REJECTED"


def test_causal_progress_retains_source_ids_and_per_fold_selection(causal_source, tmp_path):
    source, run_id = causal_source
    exported, batches = _export(source, run_id, tmp_path / "retained")
    trials = [row["payload"] for batch in batches if batch.table_kind == "TRIAL" for row in batch.rows]
    folds = [row["payload"] for batch in batches if batch.table_kind == "FOLD" for row in batch.rows]
    journal = ResearchProgressJournal(tmp_path / "journal", run_id=run_id, attempt_id="ra_causal", lease_epoch=1, planned_trials=6, profile="DELTA_WFO")
    journal.emit("run_started")
    for stage in ("S1", "S2", "S3"):
        journal.emit("stage_started", {"stage": stage})
        journal.emit("stage_completed", {"stage": stage})
    journal.emit("stage_started", {"stage": "S4"})
    result = CurrentSourceRetentionResult(receipt=exported.receipt, manifest_digest=exported.receipt.manifest_digest,
        retained_import_digest="a" * 64, table_rows={"FOLD": 2}, batch_count=len(batches),
        trial_states=tuple(row["state"] for row in trials),
        causal_trials=tuple({"trial_id": row["trial_id"], "state": row["state"], "objective": row["objective"],
            "source_trial_id": row["trial_facts"]["source_trial_id"], "study_id": row["trial_facts"]["study_id"]} for row in trials),
        causal_fold_selections=tuple({"fold_id": row["fold_id"], **row["causal_selection"]} for row in folds))
    handoff = DurableQuantWorker._emit_retained_wfo_progress(journal, result)
    snapshot = journal.snapshot()
    assert snapshot["overall"]["trials_done"] == 6
    assert all(fold["selection"]["scope"] == "PER_FOLD_STUDY" for fold in snapshot["folds"])
    assert [fold["selection"]["study_id"] for fold in snapshot["folds"]] == ["0", "1"]
    assert handoff["params_digest"] == parameter_bundle_digest(folds[-1]["causal_selection"]["parameters"])
    assert all(fold["fold_timeline"]["state"] == "NOT_PUBLISHED" for fold in snapshot["folds"])
    ResearchProgressJournal(tmp_path / "journal", run_id=run_id, attempt_id="ra_causal", lease_epoch=1, planned_trials=6, profile="DELTA_WFO").snapshot()
    with pytest.raises(ResearchProgressError): journal.emit("trial_completed", {"study": "PER_FOLD_STUDY", "trial": 1})


def test_live_causal_callback_preserves_repeated_local_ids(tmp_path):
    path = tmp_path / "progress.ndjson"
    writer = _ChildProgressWriter(path, cumulative_trials=True)
    trial = SimpleNamespace(number=0, state=SimpleNamespace(name="COMPLETE"), value=1.5)
    for study_id in ("0", "1"):
        writer._study_id = study_id
        writer.trial(SimpleNamespace(best_value=1.5), trial)
    writer.close()
    records = [json.loads(line) for line in path.read_text().splitlines()]
    assert [record["trial"] for record in records] == [1, 2]
    assert [record["source_trial_id"] for record in records] == ["0", "0"]
    assert [record["study_id"] for record in records] == ["0", "1"]
    assert all(_valid_child_progress_record(record, record["sequence"]) == record for record in records)
    events = []
    live = LiveStudyProgress(lambda event, payload: events.append((event, payload)), trials_declared=6, cpu_cap_seconds=120, per_fold=True)
    for record in records: live(record)
    trials = [payload for event, payload in events if event == "trial_completed"]
    assert [payload["study_id"] for payload in trials] == ["0", "1"]
    assert all(payload["study"] == "PER_FOLD_STUDY" for payload in trials)
