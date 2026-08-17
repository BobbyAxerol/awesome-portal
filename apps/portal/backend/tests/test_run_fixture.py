"""Completed-run fixture contract tests (frontend visual baseline, R7).

Verifies that ``registry/fixtures/runs/visual-baseline-run/`` is a fully
completed ``advanced_walk_forward`` run covering every endpoint the frontend
renders, without re-running the runner (the exporter is
``apps/portal/scripts/export_run_fixture.py``).
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

REPO_ROOT = Path(__file__).resolve().parents[4]
FIXTURE = (
    REPO_ROOT
    / "apps"
    / "portal"
    / "registry"
    / "fixtures"
    / "runs"
    / "visual-baseline-run"
)

REQUIRED_FILES = (
    "status.json",
    "config/request.json",
    "config/fold_plan.json",
    "manifest.json",
    "config.json",
    "strategy.json",
    "metrics.json",
    "selection/selected_params.json",
    "selection/selection_trace.json",
    "series/stitched.parquet",
    "wfo/folds.parquet",
    "wfo/trials.parquet",
    "wfo/candidates.parquet",
    "wfo/fold_boundary.parquet",
    "status/console.log",
)


@pytest.fixture(scope="module")
def fixture_root() -> Path:
    assert FIXTURE.is_dir(), "run fixture missing; run scripts/export_run_fixture.py"
    return FIXTURE


def test_fixture_covers_every_frontend_artifact(fixture_root: Path) -> None:
    for relative in REQUIRED_FILES:
        assert (fixture_root / relative).is_file(), f"missing {relative}"


def test_fixture_is_a_completed_advanced_run(fixture_root: Path) -> None:
    status = json.loads((fixture_root / "status.json").read_text(encoding="utf-8"))
    assert status["state"] == "COMPLETED"
    assert status["protocol"] == "advanced_walk_forward"
    assert [event["state"] for event in status["events"]][-1] == "COMPLETED"

    manifest = json.loads((fixture_root / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["status"] == "COMPLETED"
    assert manifest["protocol"] == "advanced_walk_forward"
    assert manifest["random_seed"] == 42
    assert manifest["failure"] is None


def test_series_envelope_downsamples_for_baseline(fixture_root: Path) -> None:
    # The Overview fetches max_points=3000; the fixture must be longer so the
    # "giảm điểm: server stride N" envelope line is real, not a guess.
    stitched = pd.read_parquet(fixture_root / "series" / "stitched.parquet")
    assert len(stitched) > 3000  # source_rows (no max_points) > 3000 cap


def test_trials_artifact_is_populated(fixture_root: Path) -> None:
    trials = pd.read_parquet(fixture_root / "wfo" / "trials.parquet")
    assert len(trials) >= 1
    assert trials["trial_id"].nunique() == len(trials)
    assert (fixture_root / "wfo" / "folds.parquet").is_file()
    folds = pd.read_parquet(fixture_root / "wfo" / "folds.parquet")
    assert len(folds) >= 1


def test_fold_plan_carries_provenance(fixture_root: Path) -> None:
    fold_plan = json.loads(
        (fixture_root / "config" / "fold_plan.json").read_text(encoding="utf-8")
    )
    assert fold_plan["protocol"] == "advanced_walk_forward"
    assert fold_plan["producer"]["as_of"] == "2026-08-17T08:00:00Z"
    assert fold_plan["producer"]["source_artifact_digest"] == "golden-fixture-extended-v1"
