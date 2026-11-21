"""FULL-04 public-native compute evidence on a unit tape, not HMD product proof."""
from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from types import SimpleNamespace

import pandas as pd
import pytest

from portal_api.domain.research_execution_recipes import execution_recipe
from portal_api.domain.research_full03_profiles import full03_execution_binding
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.services.advanced_walkforward_runner import (
    AdvancedWalkForwardError, AdvancedWalkForwardRunner, _native_selection_target,
    _native_optuna_trials,
)
from portal_api.workers import research_child
from portal_api.services.research_supervisor import IsolatedResearchSupervisor, ResearchChildLimits, ResearchSupervisorError
from test_research_full03_child import _receipt

METHODS = ("mode3-global", "mode2-global", "mode4-global", "mode4-causal", "mode5-global")


@pytest.mark.parametrize("method", METHODS)
def test_full04_exact_supervisor_caps_refuse_preview_long_budgets_before_compute(tmp_path,method,monkeypatch):
    receipt=full04_receipt(tmp_path,method)
    supervisor=IsolatedResearchSupervisor(tmp_path/"scratch",allowed_market_root=tmp_path)
    monkeypatch.setattr(supervisor,"_launch",lambda *a,**k: pytest.fail("caps must refuse before launch"))
    for limits in (ResearchChildLimits(cpu_seconds=121),ResearchChildLimits(wall_seconds=241),
                   ResearchChildLimits(memory_bytes=5*1024**3)):
        with pytest.raises(ResearchSupervisorError,match="cannot widen"):
            supervisor.run_delta_wfo(receipt,limits=limits)


def full04_receipt(tmp_path, method):
    original = _receipt(tmp_path)
    row = execution_recipe(f"p10.delta-{method}-4h.v1")
    return replace(original, execution_profile_id=row["profile_id"],
        execution_profile_digest=row["profile_digest"], execution_binding=full03_execution_binding(row),
        causal_inner_controls=original.temporal_controls if method == "mode4-causal" else None,
        temporal_controls=None if method == "mode4-causal" else original.temporal_controls)


@pytest.mark.parametrize("method", METHODS)
def test_full04_child_dispatch_does_not_invent_nested_inner_validation(tmp_path, method, monkeypatch):
    receipt = full04_receipt(tmp_path, method)
    calls = []
    monkeypatch.setattr(research_child, "_run_delta_wfo_study", lambda *args, **kwargs: calls.append(kwargs) or {})
    research_child._run_p10_delta_wfo(receipt.as_payload(output_root=tmp_path / "output"), tmp_path / "output")
    assert calls[0]["causal_inner"] is False
    assert calls[0]["per_fold_decay"] is False
    assert calls[0]["exact_recipe"]["descriptor"]["optimizer_settings"]
    assert not any(key.startswith("inner_") for key in calls[0]["temporal_controls"])


@pytest.mark.parametrize("method", METHODS)
def test_full04_actual_native_child_keeps_mode_evidence_and_exact_optuna_identity(tmp_path, method):
    receipt = full04_receipt(tmp_path, method)
    output = tmp_path / "output"
    output.mkdir()
    result = research_child._run_p10_delta_wfo(receipt.as_payload(output_root=output), output)
    root = output / receipt.run_id
    row = execution_recipe(receipt.execution_profile_id)
    expected_trials = row["public_profile"]["trial_default"] * (result["n_folds"] if method == "mode4-causal" else 1)
    trials = pd.read_parquet(root / "wfo/trials.parquet")
    assert result["trial_rows"] == len(trials) == expected_trials
    assert trials["trial_id"].ge(0).all()
    doc = json.loads((root / "wfo/mode_evidence.v1.json").read_text())
    assert doc["schema_version"] == "portal.wfo-mode-evidence.v1"
    assert doc["optimization_mode"] == row["descriptor"]["optimization_mode"]
    assert len((root / "wfo/mode_evidence.v1.json").read_bytes()) <= 256 * 1024
    for name, source in doc["source_tables"].items():
        path = root / source["path"]
        assert hashlib.sha256(path.read_bytes()).hexdigest() == source["sha256"]
        assert len(pd.read_parquet(path)) == source["rows"] == doc["row_counts"][name]
    config = json.loads((root / "config.json").read_text())
    for key, value in row["descriptor"]["optimizer_settings"].items():
        assert config["calibration"]["optimization"][key] == value
    source = json.loads((root / "wfo/source_contract.v1.json").read_text())["walk_forward"]
    selected = json.loads((root / "selection/selected_params.json").read_text())
    if method == "mode3-global":
        candidates = pd.read_parquet(root / "wfo/candidates.parquet")
        # This deterministic native case evaluates a real centroid candidate;
        # choosing it for deployment remains the engine's decision.
        centroid = candidates.loc[candidates["trial_id"].eq(-1)]
        assert len(centroid) == 1
        assert json.loads(centroid.iloc[0]["selection_metadata_json"])["selector"] == "centroid"
        if doc["selection_target"]["kind"] == "SYNTHETIC_CENTROID":
            assert selected["trial_id"] is None and selected["native_trial_id"] == -1
    if method == "mode2-global":
        assert source["scoring_backend"] == "proxy" and source["sbb_samples"] == 32
        evaluations = pd.read_parquet(root / doc["source_tables"]["evaluations"]["path"])
        assert evaluations["fold_metric"].str.contains("synthetic", regex=False).any()
    if method == "mode4-causal":
        assert not source["oos_used_for_selection"]
        assert not (root / "wfo/inner_folds.parquet").exists()
        folds = pd.read_parquet(root / "wfo/fold_selection.parquet")
        assert folds["inner_fold_count"].eq(0).all()
        assert folds["outer_oos_used_for_selection"].eq(False).all()
        assert trials.groupby("study_id").size().eq(3).all()
        assert selected["scope"] == "LAST_FOLD_DEPLOYMENT"
    if method == "mode5-global":
        assert result["n_folds"] == 1 and source["full_sample_used_for_selection"]
        assert source["validation_claim"] == "none_full_sample_calibration"
        folds = pd.read_parquet(root / "wfo/folds.parquet")
        assert folds.iloc[0]["train_start"] == folds.iloc[0]["test_start"]
        assert folds.iloc[0]["train_end"] == folds.iloc[0]["test_end"]


def test_full04_native_centroid_is_a_target_not_an_optuna_trial():
    target = _native_selection_target({"trial_id": -1, "params": {"x": 1},
        "selection_metadata": {"selector": "centroid", "medoid_trial_id": 3}})
    assert target["kind"] == "SYNTHETIC_CENTROID" and target["source_trial_id"] is None
    with pytest.raises(AdvancedWalkForwardError):
        _native_selection_target({"trial_id": -1, "selection_metadata": {"selector": "medoid"}})
    table = pd.DataFrame([
        {"trial_id": 0, "pruned": False, "selection_metadata": {"stage": "is_search"}},
        {"trial_id": -1, "pruned": False, "selection_metadata": {"stage": "oos_candidate_selection"}},
        {"trial_id": 1, "pruned": True, "selection_metadata": None},
    ])
    assert _native_optuna_trials(table)["trial_id"].tolist() == [0, 1]


def test_full04_native_mode_evidence_bounds_fail_instead_of_truncating(tmp_path):
    runner = AdvancedWalkForwardRunner(gateway=None, artifacts=ArtifactRepository(tmp_path))
    audit = SimpleNamespace(to_pandas=lambda _: pd.DataFrame({"row": range(4097)}))
    with pytest.raises(AdvancedWalkForwardError, match="table row bound"):
        runner._write_mode_evidence("unit", {}, SimpleNamespace(research_audit=audit))
