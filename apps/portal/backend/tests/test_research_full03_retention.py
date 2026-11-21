"""Exact FULL-03 custody units. Native unit tapes do not qualify HMD product runs."""
from __future__ import annotations

from dataclasses import replace
import json
from types import SimpleNamespace

import pyarrow as pa

import pytest

from portal_api.domain.research_execution_recipes import execution_recipe
from portal_api.repositories.artifacts import ArtifactRepository
from portal_api.services.current_source_artifacts import (
    CurrentSourceArtifactAdapter, CurrentSourceArtifactError, recipe_current_source_admission,
    iter_current_source_retention_batches,
    FULL03_STORAGE_BATCH_ROWS, MAXIMUM_TABLE_BATCH_ROWS,
)
from portal_api.services.research_artifacts import ResearchArtifactStore
from portal_api.workers import research_child
from test_current_source_artifacts import _identity, _fence
from test_research_full03_child import PROFILE_IDS, METHODS, _receipt
from wfo_test_support import assert_summary_budgets


def test_full03_storage_parts_fit_existing_seal_without_widening_wire_batches():
    schema = pa.schema([pa.field("ordinal", pa.int64())])
    registry = SimpleNamespace(require=lambda _: SimpleNamespace(arrow_schema=schema))
    parts = []
    writer = SimpleNamespace(append_batch=lambda kind, batch: parts.append((kind, batch)))
    adapter = object.__new__(CurrentSourceArtifactAdapter)
    rows = [{"ordinal": ordinal} for ordinal in range(100_000)]
    for kind in ("observations", "three_window_replay"):
        adapter._write_rows(writer, registry, kind, rows, maximum_batch_rows=FULL03_STORAGE_BATCH_ROWS)
        saved = [batch for table, batch in parts if table == kind]
        assert sum(batch.num_rows for batch in saved) == 100_000
        assert all(batch.num_rows <= 2048 for batch in saved)
        assert [row["ordinal"] for batch in saved for row in batch.to_pylist()] == list(range(100_000))
    assert len(parts) + 4 <= 128
    assert MAXIMUM_TABLE_BATCH_ROWS == 200
    historical = []
    adapter._write_rows(SimpleNamespace(append_batch=lambda kind, batch: historical.append(batch)), registry,
                        "observations", rows[:401])
    assert [batch.num_rows for batch in historical] == [200, 200, 1]


def test_dense_three_window_display_fits_without_discarding_source_authority():
    adapter = object.__new__(CurrentSourceArtifactAdapter)
    points = [{"at_utc_ms": i, "equity": str(100 + (i * 7) % 43), "return_fraction": str((i * 3) % 11),
               "drawdown_fraction": str(-(i * 5) % 17), "accepted_position": "0", "signal_target": None}
              for i in range(48)]
    protocol = {"window_series": {role: list(points) for role in ("is", "oos", "holdout")},
                "window_series_metadata": {role: {"source_observation_count": 10000, "emitted_point_count": 48,
                   "sampling": "MULTI_SERIES_EXTREMA_V1"} for role in ("is", "oos", "holdout")},
                "independent_holdout": {"holdout_used_for_selection": False, "digest": "d" * 64}}
    summary = {"authority": "a" * 48000, "protocol_disclosure": protocol}
    adapter._fit_summary_budget(summary, [], exact_display_sampling=True)
    assert summary["authority"] == "a" * 48000
    assert protocol["independent_holdout"]["holdout_used_for_selection"] is False
    for role, saved in protocol["window_series"].items():
        assert saved[0] == points[0] and saved[-1] == points[-1]
        for field in ("equity", "return_fraction", "drawdown_fraction"):
            assert min(int(p[field]) for p in saved) == min(int(p[field]) for p in points)
            assert max(int(p[field]) for p in saved) == max(int(p[field]) for p in points)
        assert protocol["window_series_metadata"][role]["source_observation_count"] == 10000
        assert protocol["window_series_metadata"][role]["emitted_point_count"] == len(saved)
    assert_summary_budgets(summary)


@pytest.mark.parametrize("profile_id",PROFILE_IDS)
def test_custody_uses_exact_recipe_bounds_and_never_long_preview(profile_id,monkeypatch):
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_PREVIEW_LONG_WFO","true")
    monkeypatch.setenv("PORTAL_ENV","local")
    row=execution_recipe(profile_id)
    admission=recipe_current_source_admission(profile_id,row["profile_digest"])
    assert admission.source_adapter_id==row["descriptor"]["current_source"]["source_adapter_id"]
    assert admission.maximum_runtime_seconds==row["budgets"]["wall_seconds"]
    assert admission.optuna_trials==3
    for altered in (replace(admission,optuna_trials=400),replace(admission,random_seed=True),
                    replace(admission,execution_profile_digest="0"*64),replace(admission,maximum_runtime_seconds=1800),
                    replace(admission,profile_id="rs02.delta-signal-notional-wfo.v1")):
        with pytest.raises(CurrentSourceArtifactError): altered.validate()


@pytest.mark.parametrize("method",METHODS)
def test_native_four_hour_output_retains_scoped_trials_and_independent_holdout(tmp_path,method):
    child=_receipt(tmp_path,method)
    output=tmp_path/"output"
    output.mkdir()
    run=research_child._run_p10_delta_three_window_optimized if method=="three-window-optimized" else research_child._run_p10_delta_wfo
    result=run(child.as_payload(output_root=output),output)
    store=ResearchArtifactStore(tmp_path/"retained")
    adapter=CurrentSourceArtifactAdapter(source_artifacts=ArtifactRepository(output),retained_artifacts=store)
    source_windows=None
    if method=="three-window-optimized":
        source_windows={"is":{"start_ms":child.data_start_utc_ms,"end_ms":child.first_oos_utc_ms,"source_locator":"fixture:requested-spec.windows.is"},
            "oos":{"start_ms":child.first_oos_utc_ms,"end_ms":child.holdout_start_utc_ms,"source_locator":"fixture:requested-spec.windows.oos"},
            "holdout":{"start_ms":child.holdout_start_utc_ms,"end_ms":child.data_end_exclusive_utc_ms,"source_locator":"fixture:requested-spec.windows.holdout"}}
    exported=adapter.export_advanced_walkforward(run_id=child.run_id,identity=_identity(child.run_id),fence=_fence(child.run_id),
        admission=recipe_current_source_admission(child.execution_profile_id,child.execution_profile_digest),
        fence_validator=lambda _:True,source_windows=source_windows)
    assert exported.receipt.table_rows["trials"]==result["trial_rows"]
    assert_summary_budgets(dict(exported.receipt.summary))
    batches=list(iter_current_source_retention_batches(retained_artifacts=store,receipt=exported.receipt,cursor_secret=b"full03-custody-unit-secret"*2))
    folds=[row["payload"] for batch in batches if batch.table_kind=="FOLD" for row in batch.rows]
    trials=[row["payload"] for batch in batches if batch.table_kind=="TRIAL" for row in batch.rows]
    if method in {"causal-inner","per-fold-decay"}:
        key="causal_selection" if method=="causal-inner" else "fold_selection"
        for fold in folds:
            selected=fold[key]
            assert selected["outer_oos_used_for_selection"] is (method=="per-fold-decay")
            assert len([trial for trial in trials if trial["trial_facts"]["study_id"]==selected["study_id"]])==3
    if method=="three-window-optimized":
        p=exported.receipt.summary["protocol_disclosure"]
        assert p["independent_holdout"]["holdout_used_for_selection"] is False
        assert p["windows"]=={key:{"start_utc_ms":bounds["start_ms"],"end_exclusive_utc_ms":bounds["end_ms"],
            "bar_count":p["windows"][key]["bar_count"]} for key,bounds in source_windows.items()}
        assert len(folds)==1 and len(trials)==3
    # Same native bytes cannot be reinterpreted by a different source interval.
    manifest_path=output/child.run_id/"manifest.json"
    manifest=json.loads(manifest_path.read_text())
    manifest["timeframe"]="1h"
    manifest_path.write_text(json.dumps(manifest))
    with pytest.raises(CurrentSourceArtifactError,match="interval"):
        adapter.export_advanced_walkforward(run_id=child.run_id,identity=_identity(child.run_id),fence=_fence(child.run_id),
            admission=recipe_current_source_admission(child.execution_profile_id,child.execution_profile_digest),fence_validator=lambda _:True)
