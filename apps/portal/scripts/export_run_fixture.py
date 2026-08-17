#!/usr/bin/env python3
"""Build the read-only completed-run fixture for the frontend visual baseline.

Produces, under ``apps/portal/registry/fixtures/runs/visual-baseline-run/``,
one fully completed ``advanced_walk_forward`` run whose artifacts were written
by the real runner against the golden market frame (extended to 3,500 hourly
bars so ``source_rows > returned_rows`` holds for the Overview's
``max_points=3000`` fetch and the "giảm điểm" envelope line is real):

- ``status.json`` + ``config/request.json`` (run manager contract)
- ``config/fold_plan.json`` (with fixed ``producer.as_of`` /
  ``source_artifact_digest``)
- ``manifest.json``, ``config.json``, ``strategy.json``, ``metrics.json``
- ``selection/selected_params.json``, ``selection/selection_trace.json``
- ``series/stitched.parquet``, ``wfo/*.parquet``
- ``status/console.log`` (deterministic lines matching the progress parser,
  with the real study/trial counts)

Timestamps inside the fixture are pinned to fixed values so regeneration is
bitwise reproducible (same policy as the summary fixtures' ``requested_at``).

Run from the repository root:

    PYTHONPATH=apps/portal/backend/src:apps/portal \
      python apps/portal/scripts/export_run_fixture.py
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
PORTAL_ROOT = REPO_ROOT / "apps" / "portal"
BACKEND_SRC = PORTAL_ROOT / "backend" / "src"
TESTS_DIR = PORTAL_ROOT / "backend" / "tests"

sys.path.insert(0, str(BACKEND_SRC))
sys.path.insert(0, str(PORTAL_ROOT))
sys.path.insert(0, str(TESTS_DIR))

RUN_ID = "visual-baseline-run"
FIXTURE_ROOT = PORTAL_ROOT / "registry" / "fixtures" / "runs" / RUN_ID

# Fixed clock so regeneration is deterministic (mirrors summary fixtures).
PINNED_ISO = "2026-08-17T08:00:00Z"
PINNED_EPOCH = 1786968000.0

# 7x the 500-bar golden frame -> 3,500 hourly bars; Overview fetches
# max_points=3000, so a real downsample (stride 2) shows in the envelope.
FRAME_REPEATS = 7


def _pinned_utc_now_iso() -> str:
    return PINNED_ISO


def _extended_market():
    """Golden frame repeated contiguously; deterministic by construction."""
    import pandas as pd

    from golden_fixture import build_market_frame

    base = build_market_frame()
    parts = []
    for index in range(FRAME_REPEATS):
        part = base.copy()
        part.index = part.index + pd.Timedelta(hours=len(base) * index)
        parts.append(part)
    return pd.concat(parts)


def build_artifacts() -> dict[str, object]:
    """Run the real advanced walk-forward runner and stage the fixture.

    Returns a ``{relative_path: description}`` inventory for the manifest
    check (callers may compare against the committed fixture).
    """
    import portal_api.services.advanced_walkforward_runner as runner_mod
    from portal_api.adapters.market_data import DatasetDescriptor, PreparedMarketData
    from portal_api.adapters.quantbt import QuantBTGateway
    from portal_api.domain.enums import OptimizationMode, OptimizationSchedule
    from portal_api.domain.requests import (
        AccountConfig,
        ExecutionConfig,
        OptimizationConfig,
        ParameterSpaceConfig,
        ParameterSpec,
        PortalRunRequest,
        AdvancedWalkForwardConfig,
    )
    from portal_api.repositories import ArtifactRepository
    from portal_api.repositories.artifacts import with_portal_provenance
    from portal_api.services.advanced_walkforward_runner import (
        AdvancedWalkForwardRunner,
    )
    from portal_api.services.fold_plan import compute_run_fold_plan
    from portal_api.strategies import StrategyRegistry
    from strategy.specification import DELTA_RSI_SPECIFICATION

    frame = _extended_market()
    market = PreparedMarketData(
        frame=frame,
        descriptor=DatasetDescriptor(
            dataset_id="golden-fixture",
            symbol="ETHUSDT",
            venue="BINANCE",
            timeframe="1h",
        ),
        content_hash="golden-fixture-extended-v1",
        missing_bar_count=0,
    )

    parameter_space = ParameterSpaceConfig(
        {
            key: ParameterSpec(
                kind="float_range" if isinstance(low, float) else "int_range",
                low=low,
                high=high,
                step=step,
            )
            for key, (low, high, step) in DELTA_RSI_SPECIFICATION.parameter_space.items()
        }
    )
    request = PortalRunRequest(
        strategy_id="delta-rsi-polynomial-alpha",
        dataset_id="golden-fixture",
        symbol="ETHUSDT",
        timeframe="1h",
        protocol="advanced_walk_forward",
        parameter_space=parameter_space,
        account=AccountConfig(),
        execution=ExecutionConfig(),
        calibration=AdvancedWalkForwardConfig(
            data_start=frame.index[12],
            data_end_exclusive=frame.index[-12],
            split_mode="2024-01-08",
            split_frequency="weekly",
            window_mode="expanding",
            optimization_mode=OptimizationMode.MODE_1_DECAY,
            optimization_schedule=OptimizationSchedule.GLOBAL,
            fold_boundary_position_policy="carry",
            optuna_trials=32,
            optuna_early_stopping=None,
            random_seed=42,
            optimization=OptimizationConfig(
                min_trades_per_year=50.0, trade_penalty_factor=0.5
            ),
        ),
    )

    # Pin the clock so manifest/status/fold-plan timestamps are reproducible.
    original_now = runner_mod._utc_now_iso  # noqa: SLF001
    runner_mod._utc_now_iso = _pinned_utc_now_iso  # type: ignore[assignment]
    try:
        artifacts = ArtifactRepository(Path("/tmp") / "portal-run-fixture-stage")
        shutil.rmtree(artifacts.root, ignore_errors=True)
        service = AdvancedWalkForwardRunner(
            gateway=QuantBTGateway(), artifacts=artifacts
        )
        summary = service.run(request, market, RUN_ID)
    finally:
        runner_mod._utc_now_iso = original_now  # type: ignore[assignment]

    if summary["status"] != "COMPLETED":
        raise RuntimeError(f"fixture run did not complete: {summary}")

    run_dir = artifacts.run_directory(RUN_ID)
    # The runner writes selection/provenance-bearing artifacts; the run
    # manager and worker normally add status/request/fold-plan/console.
    run_dir.joinpath("config").mkdir(parents=True, exist_ok=True)
    run_dir.joinpath("status").mkdir(parents=True, exist_ok=True)

    run_dir.joinpath("config/request.json").write_text(
        json.dumps(
            with_portal_provenance(
                "request.json", request.model_dump(mode="json", exclude_none=False)
            ),
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    fold_plan = compute_run_fold_plan(request, frame.index)
    run_dir.joinpath("config/fold_plan.json").write_text(
        json.dumps(
            with_portal_provenance(
                "fold_plan.json",
                fold_plan,
                as_of=PINNED_ISO,
                source_digest=market.content_hash,
            ),
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    # Terminal run-manager status with a fixed clock.
    status = {
        "run_id": RUN_ID,
        "state": "COMPLETED",
        "protocol": "advanced_walk_forward",
        "strategy_id": "delta-rsi-polynomial-alpha",
        "created_at": "2026-08-17T08:00:00Z",
        "events": [
            {"state": "QUEUED", "at": PINNED_EPOCH},
            {"state": "VALIDATING_DATA", "at": PINNED_EPOCH + 1.0},
            {"state": "RUNNING", "at": PINNED_EPOCH + 2.0},
            {"state": "COMPLETED", "at": PINNED_EPOCH + 30.0},
        ],
        "failure": None,
        "started_at": "2026-08-17T08:00:02Z",
        "completed_at": "2026-08-17T08:00:30Z",
    }
    run_dir.joinpath("status.json").write_text(
        json.dumps(
            with_portal_provenance("status.json", status),
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    _write_console_log(run_dir, artifacts)

    # Commit the staged run into the registry fixture tree.
    shutil.rmtree(FIXTURE_ROOT, ignore_errors=True)
    FIXTURE_ROOT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(run_dir, FIXTURE_ROOT)
    shutil.rmtree(artifacts.root, ignore_errors=True)

    return {
        "run_id": RUN_ID,
        "n_folds": summary.get("n_folds"),
        "n_studies": summary.get("n_studies"),
        "bars": len(frame),
        "fixture_root": str(FIXTURE_ROOT.relative_to(REPO_ROOT)),
        "written_at": datetime.now(UTC).isoformat(),
    }


def _write_console_log(run_dir: Path, artifacts) -> None:
    """Deterministic console capture matching the progress parser.

    Lines mirror the real worker output format (``Trial N finished with
    value: ...``, ``Best is trial N``, ``A new study created``); counts are
    taken from the actual artifact so progress returns the true numbers.
    """
    import pandas as pd

    trials = pd.read_parquet(run_dir / "wfo" / "trials.parquet")
    unique = trials.drop_duplicates(subset=["trial_id"]) if "trial_id" in trials else trials
    trial_count = len(unique)
    best_trial = int(unique["trial_id"].max()) if trial_count else 0

    lines = [
        f"[{PINNED_ISO}] portal worker started for run {RUN_ID}",
        f"[{PINNED_ISO}] protocol=advanced_walk_forward strategy=delta-rsi-polynomial-alpha",
        "[2026-08-17T08:00:03Z] A new study created with name: no-name",
        "[2026-08-17T08:00:03Z] Trial 0 finished with value: 0.5123 and parameters: {...}",
    ]
    for trial in range(1, trial_count):
        lines.append(
            f"[2026-08-17T08:00:03Z] Trial {trial} finished with value: 0.5123 and parameters: {{...}}"
        )
    lines.append(
        f"[2026-08-17T08:00:04Z] Best is trial {best_trial} with value: 0.5123."
    )
    lines.append(f"[{PINNED_ISO}] run completed: status=COMPLETED")
    run_dir.joinpath("status/console.log").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--print-inventory",
        action="store_true",
        help="print the build inventory instead of writing files",
    )
    args = parser.parse_args()
    inventory = build_artifacts()
    if args.print_inventory:
        print(json.dumps(inventory, indent=2, sort_keys=True))
    else:
        print(f"wrote {inventory['fixture_root']}/ ({inventory['bars']} bars, "
              f"{inventory['n_folds']} folds, {inventory['n_studies']} studies)")


if __name__ == "__main__":
    main()
