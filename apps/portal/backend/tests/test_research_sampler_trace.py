"""Real Optuna public-API observation, parity and bounded retention tests."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import optuna
import pytest

from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.services.research_sampler_trace import (
    SAMPLER_TRACE_PATH,
    SAMPLER_TRACE_SCOPE,
    SAMPLER_TRACE_SUMMARY_MAX_BYTES,
    SamplerPublicTrace,
    retain_sampler_trace,
)


def _objective(trial: optuna.Trial) -> float:
    x = trial.suggest_float("rvol", 1.0, 2.0, step=0.1)
    y = trial.suggest_int("window", 20, 40, step=2)
    return -(x - 1.4) ** 2 - (y - 28) ** 2


def _run(*, observer: SamplerPublicTrace | None = None, scope: str | None = "7"):
    original_create = optuna.create_study
    restore = observer.install(source_study_id=lambda: scope) if observer else lambda: None
    try:
        sampler = optuna.samplers.TPESampler(seed=42, n_startup_trials=3)
        original_class = type(sampler)
        study = optuna.create_study(direction="maximize", sampler=sampler, pruner=optuna.pruners.NopPruner())
        assert type(study.sampler) is original_class
        study.optimize(_objective, n_trials=12)
        rows = [(trial.number, dict(trial.params), trial.value, trial.state.name) for trial in study.trials]
    finally:
        restore()
    assert optuna.create_study is original_create
    assert all(name not in vars(sampler) for name in (
        "before_trial", "after_trial", "infer_relative_search_space", "sample_independent", "sample_relative", "reseed_rng",
    ))
    return rows, study


def test_real_tpe_sampler_observation_preserves_rng_params_objectives_and_class(tmp_path: Path) -> None:
    baseline, _ = _run()
    observer = SamplerPublicTrace(run_id="run-sampler", engine_version="1.1.1")
    observed, study = _run(observer=observer)
    assert observed == baseline
    document = observer.document()
    assert document["capture_complete"] is True
    assert document["scope"] == SAMPLER_TRACE_SCOPE
    assert document["optuna_version"] == optuna.__version__
    assert len(document["trials"]) == 12
    assert document["studies"][0]["source_study_id"] == "7"
    assert document["studies"][0]["sampler_class"] == "TPESampler"
    assert document["studies"][0]["effective_configuration_state"] == "NOT_PUBLISHED"
    assert document["studies"][0]["distributions"]["window"] == {
        "kind": "IntDistribution", "low": "20", "high": "40", "step": "2", "log": False,
    }
    for row, source in zip(document["trials"], study.trials, strict=True):
        assert row["trial_number"] == source.number
        assert row["state"] == "COMPLETE"
        assert {key: float(value) for key, value in row["returned_parameters"].items()} == source.params
        assert float(row["values"][0]) == source.value
        assert "sample_independent" in row["invocation_kinds"]
        assert "after_trial" in row["invocation_kinds"]
        assert row["completed_at_utc_ms"] >= row["started_at_utc_ms"]
        assert "startup" not in json.dumps(row).lower()
    artifacts = ArtifactRepository(tmp_path)
    path = observer.write(artifacts=artifacts, run_id="run-sampler")
    retained, summary = retain_sampler_trace(path, run_id="run-sampler", trial_count=12)
    assert retained == document
    assert summary["state"] == "AVAILABLE"
    assert summary["artifact_sha256"] == hashlib.sha256(path.read_bytes()).hexdigest()
    assert summary["sampled_trial_count"] == 8
    assert summary["omitted_sample_trial_count"] == 4
    assert [row["trial_number"] for row in summary["sample_trials"]] == [0, 1, 2, 3, 8, 9, 10, 11]
    assert len(json.dumps(summary).encode()) <= SAMPLER_TRACE_SUMMARY_MAX_BYTES


def test_trace_hash_and_bytes_are_exactly_the_p05_sealed_document(tmp_path: Path) -> None:
    from portal_api.services.research_artifacts import ResearchArtifactStore
    from test_research_artifacts import _batch, _writer

    observer = SamplerPublicTrace(run_id="run_p05", engine_version="1.1.1")
    _run(observer=observer)
    source = observer.write(artifacts=ArtifactRepository(tmp_path / "source"), run_id="run_p05")
    value, summary = retain_sampler_trace(source, run_id="run_p05", trial_count=12)
    store = ResearchArtifactStore(tmp_path / "retained")
    writer = _writer(store, "art_sampler")
    writer.append_batch("trial_index", _batch())
    sealed_digest = writer.write_small_document("source_sampler_public_trace", value)
    candidate = writer.seal()
    manifest, digest = store._load_and_verify_manifest(candidate.artifact_id, verify_parts=True)
    document = next(item for item in manifest["documents"] if item["name"] == "source_sampler_public_trace")
    retained_bytes = (store.artifacts_dir / candidate.artifact_id / document["relative_path"]).read_bytes()
    assert retained_bytes == source.read_bytes()
    assert digest == candidate.manifest_digest
    assert sealed_digest == document["sha256"] == summary["artifact_sha256"]
    assert len(retained_bytes) == document["bytes"] == summary["size_bytes"]


def test_long_actual_public_trace_keeps_400_trials_in_bounded_canonical_bytes(tmp_path: Path) -> None:
    observer = SamplerPublicTrace(run_id="run-400", engine_version="1.1.1")
    restore = observer.install(source_study_id=lambda: "0")
    try:
        study = optuna.create_study(sampler=optuna.samplers.RandomSampler(seed=42))

        def objective(trial: optuna.Trial) -> float:
            return sum(trial.suggest_float(name, 0.1, 1.0, step=0.1) for name in (
                "window", "rsi_l", "signalLength", "len_atr1", "len_atr2", "rvol", "len_vol", "slpercent",
            ))

        study.optimize(objective, n_trials=400)
    finally:
        restore()
    path = observer.write(artifacts=ArtifactRepository(tmp_path), run_id="run-400")
    _, summary = retain_sampler_trace(path, run_id="run-400", trial_count=400)
    assert summary["state"] == "AVAILABLE"
    assert summary["recorded_trial_count"] == 400
    assert summary["omitted_trial_count"] == 0
    assert summary["size_bytes"] <= 256 * 1024
    assert len(json.dumps(summary).encode()) <= SAMPLER_TRACE_SUMMARY_MAX_BYTES
    assert summary["sample_trials"][-1]["trial_number"] == 399


def test_public_ask_tell_and_unknown_source_study_scope_are_not_inferred() -> None:
    observer = SamplerPublicTrace(run_id="run-ask-tell", engine_version="1.1.1")
    restore = observer.install(source_study_id=lambda: None)
    try:
        study = optuna.create_study(sampler=optuna.samplers.TPESampler(seed=42), direction="maximize")
        for _ in range(4):
            trial = study.ask()
            value = _objective(trial)
            study.tell(trial, value)
    finally:
        restore()
    document = observer.document()
    assert document["capture_complete"] is True
    assert len(document["trials"]) == 4
    assert document["studies"][0]["source_study_id"] is None
    assert all(row["source_study_id"] is None for row in document["trials"])


def test_observer_does_not_change_original_failure_or_terminal_states(tmp_path: Path) -> None:
    observer = SamplerPublicTrace(run_id="run-failure", engine_version="1.1.1")
    original_create = optuna.create_study
    restore = observer.install(source_study_id=lambda: "0")

    def objective(trial: optuna.Trial) -> float:
        trial.suggest_int("window", 20, 24)
        if trial.number == 0:
            raise optuna.TrialPruned("original prune")
        raise ValueError("original source failure")

    try:
        study = optuna.create_study(sampler=optuna.samplers.TPESampler(seed=42))
        with pytest.raises(ValueError, match="original source failure"):
            study.optimize(objective, n_trials=2)
    finally:
        restore()
    assert optuna.create_study is original_create
    document = observer.document()
    assert [row["state"] for row in document["trials"]] == ["PRUNED", "FAIL"]
    assert all(row["values"] is None for row in document["trials"])
    path = observer.write(artifacts=ArtifactRepository(tmp_path), run_id="run-failure")
    assert retain_sampler_trace(path, run_id="run-failure", trial_count=2)[1]["state"] == "AVAILABLE"


def test_unsupported_observation_never_changes_the_sampler_result(tmp_path: Path) -> None:
    observer = SamplerPublicTrace(run_id="run-categorical", engine_version="1.1.1")
    restore = observer.install(source_study_id=lambda: "0")
    try:
        study = optuna.create_study(sampler=optuna.samplers.TPESampler(seed=42))
        study.optimize(lambda trial: 1 if trial.suggest_categorical("choice", ["a", "b"]) == "a" else 2, n_trials=2)
    finally:
        restore()
    assert len(study.trials) == 2
    path = observer.write(artifacts=ArtifactRepository(tmp_path), run_id="run-categorical")
    _, summary = retain_sampler_trace(path, run_id="run-categorical", trial_count=2)
    assert summary["state"] == "PARTIAL"
    assert summary["capture_complete"] is False


def test_retention_rejects_foreign_or_unknown_trace_fields_and_does_not_invent_history(tmp_path: Path) -> None:
    assert retain_sampler_trace(tmp_path / "missing.json", run_id="run-sampler", trial_count=12) is None
    observer = SamplerPublicTrace(run_id="run-sampler", engine_version="1.1.1")
    _run(observer=observer)
    artifacts = ArtifactRepository(tmp_path)
    path = observer.write(artifacts=artifacts, run_id="run-sampler")
    with pytest.raises(ValueError, match="foreign source binding"):
        retain_sampler_trace(path, run_id="other-run", trial_count=12)
    with pytest.raises(ValueError, match="source trial census"):
        retain_sampler_trace(path, run_id="run-sampler", trial_count=13)
    document = json.loads(path.read_text())
    document["private_path"] = "not allowed"
    artifacts.write_json("run-sampler", SAMPLER_TRACE_PATH, document)
    with pytest.raises(ValueError, match="incompatible schema"):
        retain_sampler_trace(path, run_id="run-sampler", trial_count=12)


@pytest.mark.parametrize("alter", [
    lambda doc: doc.update(invocation_count=1),
    lambda doc: doc["trials"][0].update(completed_at_utc_ms=-1),
    lambda doc: doc["trials"][0]["returned_parameters"].update(window="NaN"),
    lambda doc: doc["trials"][0]["invocation_kinds"].append("reseed_rng"),
    lambda doc: doc["trials"][0].update(source_study_id="8"),
    lambda doc: doc["studies"][0].update(observer_study_index=False),
])
def test_retention_rejects_changed_counters_timing_decimal_and_scope(tmp_path: Path, alter) -> None:
    observer = SamplerPublicTrace(run_id="run-sampler", engine_version="1.1.1")
    _run(observer=observer)
    source = observer.write(artifacts=ArtifactRepository(tmp_path), run_id="run-sampler")
    document = json.loads(source.read_bytes())
    alter(document)
    source.write_bytes(json.dumps(document, sort_keys=True, separators=(",", ":")).encode())
    with pytest.raises(ValueError):
        retain_sampler_trace(source, run_id="run-sampler", trial_count=12)


def test_real_quantbt_hook_binds_native_study_scope_and_keeps_progress(tmp_path: Path) -> None:
    import quantbt.walkforward as walkforward
    from portal_api.workers import research_child

    writer = research_child._ChildProgressWriter(tmp_path / "progress.ndjson")
    observer = SamplerPublicTrace(run_id="run-scope", engine_version="1.1.1")
    original_optimize = walkforward.WalkForwardEngine.optimize_params
    original_callback = walkforward.logging_callback
    restore = research_child._observe_optuna_trials(writer, sampler_trace=observer)
    try:
        # The hook has source scope from the exact native argument; no callback
        # ordinal or fold count is interpreted as a study ID.
        assert walkforward.WalkForwardEngine.optimize_params is not original_optimize
        writer._study_id = "6"
        study = optuna.create_study(sampler=optuna.samplers.TPESampler(seed=42), direction="maximize")
        study.optimize(_objective, n_trials=2, callbacks=[walkforward.logging_callback])
    finally:
        restore()
        writer.close()
    assert walkforward.WalkForwardEngine.optimize_params is original_optimize
    assert walkforward.logging_callback is original_callback
    assert observer.document()["studies"][0]["source_study_id"] == "6"
    progress = [json.loads(line) for line in (tmp_path / "progress.ndjson").read_text().splitlines()]
    assert [row["trial"] for row in progress] == [1, 2]
