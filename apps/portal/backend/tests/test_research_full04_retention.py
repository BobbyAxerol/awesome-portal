"""FULL-04 native custody units; these tapes are not HMD product qualification."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
import hashlib
import json

import pandas as pd
import pytest

from portal_api.domain.research_execution_recipes import execution_recipe
from portal_api.domain.research_run_producer import ResearchRunProducerRequest
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.services.current_source_artifacts import (
    CurrentSourceArtifactAdapter, CurrentSourceArtifactError,
    iter_current_source_retention_batches, recipe_current_source_admission,
)
from portal_api.services.research_artifacts import ResearchArtifactStore
from portal_api.services.research_current_source_retention import ResearchCurrentSourceRetentionClient
from portal_api.workers import research_child
from test_current_source_artifacts import _fence, _identity
from test_research_full04_child import METHODS, full04_receipt
from test_research_full03_child import bind_full03_work, full03_request
from wfo_test_support import FakeControlApi, assert_summary_budgets


@pytest.mark.parametrize("method", METHODS)
@pytest.mark.parametrize("timeframe", ("1m", "5m", "15m", "30m", "1h", "4h", "1d"))
def test_full04_all_exact_source_recipes_keep_declared_identity_and_caps(method, timeframe):
    row = execution_recipe(f"p10.delta-{method}-{timeframe}.v1")
    admission = recipe_current_source_admission(row["profile_id"], row["profile_digest"])
    assert admission.optimization_mode == row["descriptor"]["optimization_mode"]
    assert admission.optimization_schedule == row["descriptor"]["optimization_schedule"]
    assert admission.optuna_trials == row["public_profile"]["trial_default"]
    assert admission.maximum_runtime_seconds == row["budgets"]["wall_seconds"]
    assert admission.source_adapter_id == row["descriptor"]["current_source"]["source_adapter_id"]
    with pytest.raises(CurrentSourceArtifactError):
        replace(admission, execution_profile_digest="f" * 64).validate()


@pytest.fixture(scope="module", params=METHODS)
def native_export(request, tmp_path_factory):
    base = tmp_path_factory.mktemp("full04-retention-" + request.param)
    child = replace(full04_receipt(base, request.param), run_id="rrun_" + hashlib.sha256(request.param.encode()).hexdigest()[:32])
    output = base / "output"
    output.mkdir()
    result = research_child._run_p10_delta_wfo(child.as_payload(output_root=output), output)
    store = ResearchArtifactStore(base / "retained")
    adapter = CurrentSourceArtifactAdapter(source_artifacts=ArtifactRepository(output), retained_artifacts=store)
    admission = recipe_current_source_admission(child.execution_profile_id, child.execution_profile_digest)
    exported = adapter.export_advanced_walkforward(run_id=child.run_id, identity=_identity(child.run_id),
        fence=_fence(child.run_id), admission=admission, fence_validator=lambda _: True)
    batches = list(iter_current_source_retention_batches(retained_artifacts=store, receipt=exported.receipt,
        cursor_secret=b"full04-custody-unit-secret" * 2))
    return request.param, child, result, output / child.run_id, store, adapter, admission, exported, batches


def test_full04_native_mode_facts_and_five_private_audits_are_in_p05_custody(native_export):
    method, child, result, raw, store, adapter, admission, exported, batches = native_export
    receipt = exported.receipt
    summary = dict(receipt.summary)
    disclosure = summary["optimizer_disclosure"]
    assert_summary_budgets(summary)
    assert receipt.table_rows["trials"] == result["trial_rows"]
    assert receipt.source_adapter_id == admission.source_adapter_id
    assert disclosure["optimization_mode"] == admission.optimization_mode
    assert disclosure["optimization_schedule"] == admission.optimization_schedule
    manifest, digest = store._load_and_verify_manifest(receipt.artifact_id, verify_parts=True)
    assert digest == receipt.manifest_digest
    doc = json.loads((raw / "wfo/mode_evidence.v1.json").read_text())
    private = {table["table_kind"]: table for table in manifest["tables"] if table["table_kind"].startswith("mode_audit_")}
    assert {batch.table_kind for batch in batches} == {"OBSERVATION", "FOLD", "TRIAL", "CANDIDATE", "SELECTION"}
    assert any(document["name"] == "source_mode_evidence" for document in manifest["documents"])
    for name, source in doc["source_tables"].items():
        frame = pd.read_parquet(raw / source["path"])
        assert hashlib.sha256((raw / source["path"]).read_bytes()).hexdigest() == source["sha256"]
        if len(frame.columns):
            assert private["mode_audit_" + name]["rows"] == len(frame) == source["rows"]
            reader = store.reader(cursor_secret=b"native-full04-audit-unit" * 2)
            page = reader.read_page(artifact_id=receipt.artifact_id, table_kind="mode_audit_" + name, limit=200)
            assert len(page.rows) == min(len(frame), 200)
    assert disclosure["full_sample_used_for_selection"] is (method == "mode5-global")
    assert disclosure["oos_used_for_selection"] is (method == "mode3-global")
    trials = [row["payload"] for batch in batches if batch.table_kind == "TRIAL" for row in batch.rows]
    candidates = [row["payload"] for batch in batches if batch.table_kind == "CANDIDATE" for row in batch.rows]
    assert len({row["candidate_id"] for row in candidates}) == len(candidates)
    assert not any(row["trial_id"].startswith("native_centroid") for row in trials)
    assert summary["source_facts"]["search"]["top_is_k"] is None
    assert summary["source_facts"]["search"]["raw_best_is_trial_id"] is None
    if method == "mode2-global":
        assert disclosure["calibration_sample"] == "BOOTSTRAP_PROXY"
        selected = disclosure["selection_target"]
        assert selected["selection_score_kind"] == "IS_MEAN_SHARPE"
        source_trial = next(row for row in trials if row["trial_id"] == selected["trial_id"])
        assert source_trial["trial_facts"]["objective_kind"] == "SBB_BOOTSTRAP_ROBUST_J"
        assert source_trial["trial_facts"]["metrics"]["mean_oos_sharpe"] is None
        original_trial = pd.read_parquet(raw / "wfo/trials.parquet").set_index("trial_id").loc[int(selected["trial_id"])]
        assert float(disclosure["mode_evidence"]["synthetic_oos_mean"]) == original_trial["mean_oos_sharpe"]
    if method == "mode3-global":
        assert disclosure["mode_evidence"]["cluster_size"] is not None
        if doc["selection_target"]["kind"] == "SYNTHETIC_CENTROID":
            assert summary["selection"]["trial_id"] is None
            assert disclosure["centroid"]["parameters"] == summary["selection"]["parameters"]
        else:
            assert disclosure["selection_target"]["kind"] == "TRIAL" and "centroid" not in disclosure
    if method == "mode4-causal":
        folds = [row["payload"] for batch in batches if batch.table_kind == "FOLD" for row in batch.rows]
        for ordinal, fold in enumerate(folds):
            pick = fold["mode4_selection"]
            assert "causal_selection" not in fold and "fold_selection" not in fold
            assert pick["outer_oos_used_for_selection"] is False
            assert pick["objective_kind"] == "IS_MEAN_SHARPE"
            assert pick["selection_sequence"] == ordinal
            assert pick["selected_trial_id"].startswith("study_" + pick["study_id"] + ".trial_")
            assert len([trial for trial in trials if trial["trial_facts"]["study_id"] == pick["study_id"]]) == 3
            assert not any(key.startswith("inner_") for key in pick)
        assert disclosure["selection_target"]["kind"] == "STUDY_LOCAL_TRIAL"
    if method == "mode5-global":
        assert receipt.table_rows["folds"] == 1
        assert disclosure["calibration_sample"] == "FULL_SAMPLE"
        assert disclosure["selection_target"]["objective_kind"] == "FULL_SAMPLE_MEAN_SHARPE"
        assert disclosure["mode_evidence"]["selection_sample_bars"] > 0
        assert summary["derived_scope"] == "FULL_SAMPLE_CALIBRATION_INCLUSIVE_V1"
        assert summary["execution_observation"]["evaluation_role"] == "FULL_SAMPLE_CALIBRATION"
        enriched = summary["enriched_analysis"]
        assert enriched["scope"]["window"] == "FULL_SAMPLE"
        assert enriched["scope"]["coverage"] == "FULL_RETAINED_FULL_SAMPLE"
        assert enriched["library_summary"]["return_basis"]["scope"] == "RETAINED_FULL_SAMPLE_OBSERVATIONS"
        assert enriched["library_summary"]["return_basis"]["definition_id"] == "FIRST_LAST_RETAINED_FULL_SAMPLE_EQUITY_V1"
        assert enriched["windows"]["oos"]["state"] == "NOT_APPLICABLE"
        assert enriched["windows"]["full_sample"]["state"] == "AVAILABLE"
        assert enriched["monthly_returns"]["definition_id"] == "FULL_SAMPLE_MONTH_CLOSE_OVER_FIRST_OR_PREVIOUS_OBSERVED_MONTH_CLOSE_V1"
        for facts in enriched["facts"].values():
            assert all(fact["scope"] == "FULL_SAMPLE" for fact in facts.values())
        source_v1 = json.loads((raw / "wfo/retained_analytics.v1.json").read_text())
        source_v2 = json.loads((raw / "wfo/retained_analytics.v2.json").read_text())
        assert summary["summary_analytics"]["net_oos_return"]["value"] == source_v1["net_oos_return"]["value"]
        assert summary["summary_analytics"]["net_oos_return"]["scope"] == "FULL_SAMPLE"
        assert summary["summary_analytics_v2"]["metrics"]["benchmark_return_fraction"]["value"] == source_v2["metrics"]["benchmark_return_fraction"]["value"]


def test_full04_mode5_ordinary_retention_uses_native_fullspan_not_requested_oos(native_export, tmp_path):
    method, child, _, raw, _, _, _, _, _ = native_export
    if method != "mode5-global":
        return
    doc = full03_request(child.execution_profile_id)
    doc.update(run_id=child.run_id, job_id=child.job_id, worker_attempt_id=child.worker_attempt_id,
        lease_epoch=child.lease_epoch)
    spec = doc["research"]["requested_spec"]
    spec["optimization_mode"] = "mode_5_full_robust"
    def utc(value):
        return pd.Timestamp(value, unit="ms", tz="UTC").isoformat()
    spec["walk_forward"].update(start=utc(child.data_start_utc_ms), split_mode=utc(child.first_oos_utc_ms),
        end_exclusive=utc(child.data_end_exclusive_utc_ms))
    bind_full03_work(doc)
    request = ResearchRunProducerRequest.model_validate(doc)
    source_config_before = (raw / "config.json").read_bytes()
    with FakeControlApi() as api:
        result = ResearchCurrentSourceRetentionClient(endpoint=api.origin,
            secret="full04-ordinary-retention-unit-secret", sleep=lambda _: None).retain(
            request=request, source_root=raw.parent, artifact_root=tmp_path,
            fence_validator=lambda fence: fence.run_id == child.run_id and fence.lease_epoch == child.lease_epoch)
    seal = api.bodies("current-source/seal")[0]
    assert seal["summary"] == result.receipt.summary
    enriched = seal["summary"]["enriched_analysis"]
    # The ordinary request really declares a later WFO OOS start. Mode5's
    # native ONE full-span fold is authoritative, not that requested split.
    assert child.data_start_utc_ms < child.first_oos_utc_ms
    assert enriched["scope"]["first_at_utc_ms"] == child.data_start_utc_ms
    assert enriched["windows"]["full_sample"]["start_ms"] == child.data_start_utc_ms
    assert enriched["scope"]["window"] == "FULL_SAMPLE"
    assert seal["summary"]["execution_observation"]["evaluation_role"] == "FULL_SAMPLE_CALIBRATION"
    assert enriched["windows"]["oos"]["state"] == "NOT_APPLICABLE"
    assert enriched["windows"]["full_sample"]["end_ms"] == child.data_end_exclusive_utc_ms
    assert (raw / "config.json").read_bytes() == source_config_before


@pytest.mark.parametrize("change", ("hash", "path", "rows", "missing", "total"))
def test_full04_native_audit_declaration_tamper_is_refused(native_export, change):
    _, child, _, raw, _, adapter, _, _, _ = native_export
    doc = json.loads((raw / "wfo/mode_evidence.v1.json").read_text())
    row = execution_recipe(child.execution_profile_id)
    if change == "hash": doc["source_tables"]["trials"]["sha256"] = "0" * 64
    elif change == "path": doc["source_tables"]["trials"]["path"] = "../outside.parquet"
    elif change == "rows": doc["source_tables"]["trials"]["rows"] += 1
    elif change == "missing": del doc["source_tables"]["trials"]
    elif change == "total": doc["row_counts"]["trials"] += 1
    with pytest.raises(CurrentSourceArtifactError) as refusal:
        adapter._mode_audit_tables(raw, doc, row)
    assert refusal.value.code == "RESEARCH_CURRENT_SOURCE_MODE_EVIDENCE_REJECTED"


def test_full04_wrong_native_optimizer_settings_and_receipt_caps_are_refused(native_export):
    _, _, _, raw, _, adapter, admission, _, _ = native_export
    config = json.loads((raw / "config.json").read_text())
    row = admission.recipe()
    key = next(iter(row["descriptor"]["optimizer_settings"]))
    config["calibration"]["optimization"][key] = "FOREIGN_OPTIMIZER_SETTING"
    with pytest.raises(CurrentSourceArtifactError): adapter._assert_admission_matches_source(config, admission)
    for altered in (replace(admission, optuna_trials=400), replace(admission, maximum_runtime_seconds=1800),
                    replace(admission, execution_profile_digest="0" * 64)):
        with pytest.raises(CurrentSourceArtifactError): altered.validate()


def test_full04_compact_target_cannot_disagree_with_verified_native_selection(native_export):
    _, child, _, raw, _, adapter, _, _, _ = native_export
    doc = json.loads((raw / "wfo/mode_evidence.v1.json").read_text())
    # Alter both compact target witnesses coherently. The independent native
    # audit's authentic selected row must still reject this forged target.
    doc["best_trial"]["trial_id"] = 999
    doc["selection_target"].update(native_trial_id=999, source_trial_id=999, kind="OPTUNA_TRIAL")
    with pytest.raises(CurrentSourceArtifactError) as refusal:
        adapter._mode_audit_tables(raw, doc, execution_recipe(child.execution_profile_id))
    assert refusal.value.code == "RESEARCH_CURRENT_SOURCE_MODE_EVIDENCE_REJECTED"


def test_full04_mode4_cross_study_selection_is_not_reinterpreted(native_export):
    method, child, _, raw, store, adapter, _, exported, _ = native_export
    if method != "mode4-causal":
        return
    reader = store.reader(cursor_secret=b"full04-local-study-negative" * 2)
    rows = {kind: list(reader.read_page(artifact_id=exported.receipt.artifact_id, table_kind=kind, limit=200).rows)
            for kind in ("folds", "trials", "candidates")}
    rows = deepcopy(rows)
    original = json.loads(rows["trials"][0]["payload_json"])
    original["trial_facts"]["study_id"] = "foreign_study"
    rows["trials"][0]["payload_json"] = json.dumps(original)
    selection = json.loads((raw / "selection/selected_params.json").read_text())
    with pytest.raises(CurrentSourceArtifactError) as refusal:
        adapter._attach_mode4_selections(raw, folds=rows["folds"], trials=rows["trials"],
            candidates=rows["candidates"], selection=selection, recipe=execution_recipe(child.execution_profile_id))
    assert refusal.value.code == "RESEARCH_CURRENT_SOURCE_MODE4_BINDING_REJECTED"
