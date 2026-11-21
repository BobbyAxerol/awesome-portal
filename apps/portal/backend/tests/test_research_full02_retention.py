"""FULL-02 custody/unit proofs. Golden engine output is not a product HMD receipt."""
from __future__ import annotations

import copy
from dataclasses import replace

import pytest

from portal_api.domain.research_execution_recipes import execution_recipe, recipe_digest
from portal_api.domain.research_full02_profiles import (
    DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_PER_FOLD_DECAY_PROFILE_DIGEST,
    DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST,
)
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.services.current_source_artifacts import (
    CurrentSourceArtifactAdapter, CurrentSourceArtifactError, full02_current_source_admission,
    iter_current_source_retention_batches,
)
from portal_api.services.research_artifacts import ResearchArtifactStore
from portal_api.services.research_progress import ResearchProgressJournal
from portal_api.services.research_supervisor import ResearchSupervisorError, ResearchChildLimits, IsolatedResearchSupervisor
from portal_api.workers import research_child
from test_current_source_artifacts import _identity, _fence
from test_research_full02_child import _receipt
from wfo_test_support import wfo_request, assert_summary_budgets


def full02_request(*, three_window=False):
    doc = wfo_request()
    research = doc["research"]
    spec = research["requested_spec"]
    research.update(execution_profile_id=DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID if three_window else DELTA_PER_FOLD_DECAY_PROFILE_ID,
        execution_profile_digest=DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST if three_window else DELTA_PER_FOLD_DECAY_PROFILE_DIGEST)
    if three_window:
        spec.update(protocol="three_window_decay", windows={
            "is": {"start": "2024-01-01T00:00:00Z", "end_exclusive": "2024-01-08T00:00:00Z"},
            "oos": {"start": "2024-01-08T00:00:00Z", "end_exclusive": "2024-01-15T00:00:00Z"},
            "holdout": {"start": "2024-01-15T00:00:00Z", "end_exclusive": "2024-01-22T00:00:00Z"}})
        spec.pop("walk_forward")
        doc["protocol"] = "three_window_decay"
    else:
        spec.update(schema_version="research.requested-spec.v2", optimization_schedule="per_fold_decay")
    bind_work(doc)
    return doc


def bind_work(doc):
    research, spec = doc["research"], doc["research"]["requested_spec"]
    research["requested_spec_digest"] = recipe_digest(spec)
    work = {"schema_version": execution_recipe(research["execution_profile_id"])["work_schema_version"],
        **{name: research[name] for name in ("requested_spec_digest", "effective_spec_digest", "dataset_binding_digest", "manifest_digest")},
        "snapshot": {name: research[name] for name in ("snapshot_id", "snapshot_content_hash")},
        "alpha": {"alpha_id": research["alpha_id"], "alpha_version_id": research["alpha_version_id"],
            "adapter_id": research["execution_adapter_id"], "adapter_contract_digest": research["adapter_contract_digest"]},
        "execution_profile": {"profile_id": research["execution_profile_id"], "profile_digest": research["execution_profile_digest"]},
        "engine_release_id": spec["client"]["engine_release_id"], "requested_spec": spec}
    research["work_digest"] = recipe_digest(work)


@pytest.mark.parametrize("three_window", [False, True])
def test_exact_private_work_and_preview_budget_refusals(three_window, monkeypatch):
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO", "true")
    monkeypatch.setenv("PORTAL_ENV", "local")
    doc = full02_request(three_window=three_window)
    admitted = ResearchRunProducerRequest.model_validate(doc)
    assert admitted.research.is_delta_wfo
    assert admitted.research.is_three_window_optimized is three_window
    for mutation in ("trial", "seed", "timeframe", "digest", "work", "spec", "optimizer", "route"):
        bad = copy.deepcopy(doc)
        research, spec = bad["research"], bad["research"]["requested_spec"]
        if mutation == "trial": spec["optuna_trials"] = 400
        if mutation == "seed": spec["random_seed"] = 43
        if mutation == "timeframe": spec["data"]["timeframe"] = "4h"
        if mutation == "digest": research["execution_profile_digest"] = "0" * 64
        if mutation == "work": research["work_digest"] = "0" * 64
        if mutation == "spec": research["requested_spec_digest"] = "0" * 64
        if mutation == "optimizer": spec["optimization_config"] = {"sampler": {"kind": "RandomSampler"}}
        if mutation == "route": spec["route_params"] = {"fee_bps": "1"}
        if mutation not in {"digest", "work", "spec"}: bind_work(bad)
        with pytest.raises(ValueError): ResearchRunProducerRequest.model_validate(bad)


@pytest.mark.parametrize("three_window", [False, True])
def test_exact_retention_and_supervisor_caps(three_window, tmp_path):
    admission = full02_current_source_admission(three_window=three_window)
    admission.validate()
    for kwargs in ({"random_seed": 43}, {"optuna_trials": 400}, {"maximum_runtime_seconds": 3600}):
        with pytest.raises(CurrentSourceArtifactError): replace(admission, **kwargs).validate()
    receipt = _receipt(tmp_path, three_window=three_window)
    supervisor = IsolatedResearchSupervisor(tmp_path / "scratch", allowed_market_root=tmp_path)
    with pytest.raises(ResearchSupervisorError, match="cannot widen"):
        supervisor.run_delta_wfo(receipt, limits=ResearchChildLimits(cpu_seconds=121, wall_seconds=240))


def test_three_window_source_copy_does_not_claim_walk_forward(tmp_path):
    journal = ResearchProgressJournal(tmp_path, run_id="rrun_full02", attempt_id="rat_full02", lease_epoch=1,
        planned_trials=3, cpu_cap_seconds=120, profile="DELTA_THREE_WINDOW")
    assert "Three Window" in journal._copy["claimed"]
    assert "walk-forward" not in " ".join(journal._copy.values())


@pytest.mark.parametrize("three_window", [False, True])
def test_native_output_seals_into_exact_current_source_lane(three_window, tmp_path):
    receipt = _receipt(tmp_path, three_window=three_window)
    output = tmp_path / "output"
    output.mkdir()
    fn = research_child._run_p10_delta_three_window_optimized if three_window else research_child._run_p10_delta_wfo
    result = fn(receipt.as_payload(output_root=output), output)
    store = ResearchArtifactStore(tmp_path / "retained")
    adapter = CurrentSourceArtifactAdapter(source_artifacts=ArtifactRepository(output), retained_artifacts=store)
    exported = adapter.export_advanced_walkforward(run_id=receipt.run_id, identity=_identity(receipt.run_id), fence=_fence(receipt.run_id),
        admission=full02_current_source_admission(three_window=three_window), fence_validator=lambda _: True)
    assert exported.receipt.table_rows["trials"] == result["trial_rows"]
    assert_summary_budgets(dict(exported.receipt.summary))
    batches = list(iter_current_source_retention_batches(retained_artifacts=store, receipt=exported.receipt, cursor_secret=b"full02-test-secret" * 2))
    folds = [row["payload"] for batch in batches if batch.table_kind == "FOLD" for row in batch.rows]
    trials = [row["payload"] for batch in batches if batch.table_kind == "TRIAL" for row in batch.rows]
    audit = exported.child_audit_companion
    assert audit is not None
    for fold in folds:
        for witness in fold["child_audit"]["records"]:
            full_record = dict(audit.rows[witness["audit_ordinal"]])
            full_record.pop("run_fingerprint")
            assert full_record == witness
    if not three_window:
        assert all(fold["fold_selection"]["outer_oos_used_for_selection"] is True for fold in folds)
        assert all("causal_selection" not in fold for fold in folds)
        assert len({row["trial_id"] for row in trials}) == result["trial_rows"]
        assert all(len([trial for trial in trials if trial["trial_facts"]["study_id"] == fold["fold_selection"]["study_id"]]) == 3 for fold in folds)
    else:
        assert len(folds) == 1
        disclosure = exported.receipt.summary["protocol_disclosure"]
        assert disclosure["independent_holdout"]["holdout_used_for_selection"] is False
        assert disclosure["observation_scope"] == "OOS_SELECTION_INPUT"
        assert set(disclosure["window_series"]) == {"is", "oos", "holdout"}
        assert all(1 <= len(points) <= 48 for points in disclosure["window_series"].values())
        observations = [row["payload"] for batch in batches if batch.table_kind == "OBSERVATION" for row in batch.rows]
        assert all(receipt.first_oos_utc_ms <= row["at_utc_ms"] < receipt.holdout_start_utc_ms for row in observations)
        # P05 full replay custody is a separate private Parquet table, not
        # additional current-source import rows and not a 48-point substitute.
        reader = store.reader(cursor_secret=b"full02-test-secret" * 2)
        cursor, retained_rows = None, []
        while True:
            page = reader.read_page(artifact_id=exported.receipt.artifact_id, table_kind="three_window_replay", cursor=cursor, limit=200)
            retained_rows.extend(page.rows)
            if page.next_cursor is None: break
            cursor = page.next_cursor
        assert len(retained_rows) == sum(window["bar_count"] for window in disclosure["windows"].values())
        assert {row["window_role"] for row in retained_rows} == {"IS", "OOS", "HOLDOUT"}
        assert [row["source_ordinal"] for row in retained_rows] == list(range(len(retained_rows)))
        assert all(batch.table_kind in {"OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION"} for batch in batches)
