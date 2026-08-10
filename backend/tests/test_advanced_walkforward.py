"""Advanced walk-forward orchestration + artifact export tests (Phase P3).

Runs the real QuantBT public walk_forward endpoint on the golden fixture with
a tiny Optuna budget, verifies capability-driven validation, artifact reopen
without rerun, and the audit export bundle. QuantBT stays read-only.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from golden_fixture import build_market_frame
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
from portal_api.services.advanced_walkforward_runner import (
    AdvancedWalkForwardError,
    AdvancedWalkForwardRunner,
)
from portal_api.services.export_service import export_bundle, export_run
from portal_api.strategies import StrategyRegistry
from strategy.specification import DELTA_RSI_SPECIFICATION


def _market() -> PreparedMarketData:
    return PreparedMarketData(
        frame=build_market_frame(),
        descriptor=DatasetDescriptor(
            dataset_id="golden-fixture",
            symbol="ETHUSDT",
            venue="BINANCE",
            timeframe="1h",
        ),
        content_hash="golden-fixture",
        missing_bar_count=0,
    )


def _parameter_space() -> ParameterSpaceConfig:
    return ParameterSpaceConfig(
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


def _request(**overrides) -> PortalRunRequest:
    kwargs: dict[str, object] = {
        "strategy_id": "delta-rsi-polynomial-alpha",
        "dataset_id": "golden-fixture",
        "symbol": "ETHUSDT",
        "timeframe": "1h",
        "protocol": "advanced_walk_forward",
        "parameter_space": _parameter_space(),
        "account": AccountConfig(),
        "execution": ExecutionConfig(),
    }
    if "calibration" not in overrides:
        kwargs["calibration"] = AdvancedWalkForwardConfig(
            split_mode="2024-01-08",
            split_frequency="weekly",
            window_mode="expanding",
            optimization_mode=OptimizationMode.MODE_1_DECAY,
            optimization_schedule=OptimizationSchedule.GLOBAL,
            fold_boundary_position_policy="carry",
            optuna_trials=8,
            optuna_early_stopping=None,
            random_seed=42,
            optimization=OptimizationConfig(min_trades_per_year=50.0, trade_penalty_factor=0.5),
        )
    kwargs.update(overrides)
    return PortalRunRequest(**kwargs)


@pytest.fixture
def runner(tmp_path: Path) -> tuple[AdvancedWalkForwardRunner, ArtifactRepository]:
    artifacts = ArtifactRepository(tmp_path / "runs")
    return AdvancedWalkForwardRunner(gateway=QuantBTGateway(), artifacts=artifacts), artifacts


def _read_frame(artifacts: ArtifactRepository, run_id: str, path: str) -> pd.DataFrame:
    return pd.read_parquet(artifacts.run_directory(run_id) / path)


def test_advanced_runner_completes_and_writes_artifacts(runner) -> None:
    service, artifacts = runner
    market = _market()
    summary = service.run(_request(), market, "run_p3_adv")

    assert summary["status"] == "COMPLETED"
    assert summary["protocol"] == "advanced_walk_forward"
    assert summary["n_folds"] >= 2
    assert summary["params_semantics"]
    run_dir = artifacts.run_directory("run_p3_adv")
    for relative in (
        "manifest.json",
        "config.json",
        "metrics.json",
        "selection/selected_params.json",
        "series/stitched.parquet",
        "wfo/folds.parquet",
        "wfo/trials.parquet",
        "wfo/candidates.parquet",
        "wfo/fold_boundary.parquet",
    ):
        assert (run_dir / relative).is_file(), f"missing {relative}"
    # Global schedule performs a single study: fold_selection_table and
    # params_by_fold are legitimately empty (§11.4), only per-fold schedules
    # populate them.

    manifest = artifacts.read_json("run_p3_adv", "manifest.json")
    assert manifest["protocol"] == "advanced_walk_forward"
    assert manifest["artifact_schema_version"] == "1"

    selected = artifacts.read_json("run_p3_adv", "selection/selected_params.json")
    assert selected["params_semantics"]
    assert set(selected["params"]) == set(DELTA_RSI_SPECIFICATION.parameter_space)


def test_capability_gate_rejects_unsupported_target_mode(runner, monkeypatch) -> None:
    service, _ = runner

    def fake_capabilities() -> list[dict[str, object]]:
        return [{"target_mode": "pct_equity", "status": "reserved"}]

    monkeypatch.setattr(service._gateway, "walkforward_capabilities", fake_capabilities)
    with pytest.raises(AdvancedWalkForwardError, match="pct_equity"):
        service.validate_capabilities()


def test_invalid_mode_schedule_combo_rejected_at_request_level() -> None:
    # The typed request contract already fails fast (§8); preflight and the
    # runner can never receive an invalid combo.
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        _request(
            calibration=AdvancedWalkForwardConfig(
                split_mode="2024-01-08",
                split_frequency="weekly",
                optimization_mode=OptimizationMode.MODE_1_DECAY,
                optimization_schedule=OptimizationSchedule.PER_FOLD_CAUSAL,
                optuna_trials=8,
                random_seed=42,
            )
        )


def test_gateway_quantbt_native_validation_rejects_invalid_combos(runner) -> None:
    service, _ = runner
    with pytest.raises((ValueError, NotImplementedError)):
        service._gateway.validate_advanced_walkforward(
            config_fields={
                "split_mode": "2024-01-08",
                "split_frequency": "weekly",
                "optimization_mode": "mode_1_decay",
                "optimization_schedule": "per_fold_causal",
                "optuna_trials": 8,
                "random_seed": 42,
            }
        )


def test_artifact_reopens_without_quantbt_rerun(runner) -> None:
    service, artifacts = runner
    market = _market()
    service.run(_request(), market, "run_p3_reopen")

    manifest = artifacts.read_json("run_p3_reopen", "manifest.json")
    assert manifest["status"] == "COMPLETED"
    folds = _read_frame(artifacts, "run_p3_reopen", "wfo/folds.parquet")
    assert list(folds.columns) == [
        "fold_id",
        "train_start",
        "train_end",
        "test_start",
        "test_end",
        "train_bars",
        "test_bars",
    ]
    selected = artifacts.read_json("run_p3_reopen", "selection/selected_params.json")
    assert selected["params"]
    stitched = _read_frame(artifacts, "run_p3_reopen", "series/stitched.parquet")
    assert {"equity", "returns", "drawdown", "accepted_position"}.issubset(stitched.columns)


def test_export_run_and_bundle_round_trip(runner) -> None:
    service, artifacts = runner
    market = _market()
    service.run(_request(), market, "run_p3_export")

    export_dir = export_run(artifacts, "run_p3_export")
    assert (export_dir / "manifest.json").is_file()
    assert (export_dir / "selection" / "selected_params.json").is_file()
    assert (export_dir / "series" / "stitched.csv").is_file()
    assert (export_dir / "wfo" / "trials.csv").is_file()

    csv = pd.read_csv(export_dir / "series" / "stitched.csv", index_col=0)
    assert {"equity", "returns", "drawdown"}.issubset(csv.columns)

    bundle = export_bundle(artifacts, "run_p3_export")
    assert bundle.name == "run_p3_export-export.zip"
    assert bundle.stat().st_size > 0


def test_export_derives_only_from_artifacts(runner, monkeypatch) -> None:
    service, artifacts = runner
    market = _market()
    service.run(_request(), market, "run_p3_export_src")

    def boom(*args, **kwargs):
        raise AssertionError("export must never touch QuantBT")

    monkeypatch.setattr(service._gateway, "run_advanced_walkforward", boom)
    export_dir = export_run(artifacts, "run_p3_export_src")
    assert (export_dir / "manifest.json").is_file()


def test_fixed_param_mode_requires_all_fixed(runner) -> None:
    service, _ = runner
    market = _market()
    request = _request(
        calibration=AdvancedWalkForwardConfig(
            split_mode="2024-01-08",
            split_frequency="weekly",
            optimization_mode=OptimizationMode.NONE,
            optimization_schedule=OptimizationSchedule.GLOBAL,
            optuna_trials=0,
            random_seed=42,
        )
    )
    with pytest.raises(AdvancedWalkForwardError, match="requires every parameter to be fixed"):
        service.run(request, market, "run_p3_fixed")
