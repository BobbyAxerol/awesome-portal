"""Three-window Mode 1 orchestration tests (Phase P2, plan §7.2/§10/§23.3).

Runs the real QuantBT public API against the deterministic golden fixture
with a small Optuna budget. All mutations are applied to copies; the
protected kernel and the read-only QuantBT tree are never touched.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from golden_fixture import build_market_frame
from portal_api.adapters.market_data import DatasetDescriptor, PreparedMarketData
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.requests import (
    AccountConfig,
    ExecutionConfig,
    OptimizationConfig,
    ParameterSpaceConfig,
    ParameterSpec,
    PortalRunRequest,
    ThreeWindowConfig,
)
from portal_api.repositories import ArtifactRepository
from portal_api.services.three_window_runner import (
    ThreeWindowRunner,
    _account_kwargs,
    _quantbt_param_ranges,
)
from portal_api.strategies import StrategyRegistry
from strategy.delta_rsi import build_walkforward_signal, generate_signals
from strategy.specification import DELTA_RSI_SPECIFICATION

TRIALS = 12
SEED = 42

# IS [0,140), OOS [140,300), Holdout Live [300,500) on the 500-bar fixture.
IS_END = 140
OOS_END = 300
HOLDOUT_START = 300


def _market() -> PreparedMarketData:
    frame = build_market_frame()
    return PreparedMarketData(
        frame=frame,
        descriptor=DatasetDescriptor(
            dataset_id="golden-fixture",
            symbol="ETHUSDT",
            venue="BINANCE",
            timeframe="1h",
        ),
        content_hash="golden-fixture",
        missing_bar_count=0,
    )


def _request(market: PreparedMarketData, **overrides) -> PortalRunRequest:
    index = market.frame.index
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
    calibration = overrides.pop("calibration", ThreeWindowConfig(
        is_start=index[0],
        is_end_exclusive=index[IS_END],
        oos_start=index[IS_END],
        oos_end_exclusive=index[OOS_END],
        holdout_start=index[HOLDOUT_START],
        holdout_end_exclusive=None,
        optuna_trials=TRIALS,
        optuna_early_stopping=None,
        random_seed=SEED,
        optimization=OptimizationConfig(min_trades_per_year=50.0, trade_penalty_factor=0.5),
    ))
    return PortalRunRequest(
        strategy_id="delta-rsi-polynomial-alpha",
        dataset_id="golden-fixture",
        symbol="ETHUSDT",
        timeframe="1h",
        protocol="three_window_decay",
        parameter_space=parameter_space,
        calibration=calibration,
        account=AccountConfig(),
        execution=ExecutionConfig(),
        **overrides,
    )


@pytest.fixture
def runner(tmp_path: Path) -> tuple[ThreeWindowRunner, ArtifactRepository]:
    artifacts = ArtifactRepository(tmp_path / "runs")
    return (
        ThreeWindowRunner(
            gateway=QuantBTGateway(),
            strategies=StrategyRegistry(),
            artifacts=artifacts,
        ),
        artifacts,
    )


def _mutate(frame: pd.DataFrame, factor: float = 1.05) -> pd.DataFrame:
    out = frame.copy()
    for column in ("open", "high", "low", "close", "volume"):
        out[column] = out[column] * factor
    return out


def _selected_params(artifacts: ArtifactRepository, run_id: str) -> dict[str, object]:
    return artifacts.read_json(run_id, "selection/selected_params.json")["params"]


def _read_frame(artifacts: ArtifactRepository, run_id: str, path: str) -> pd.DataFrame:
    return pd.read_parquet(artifacts.run_directory(run_id) / path)


def test_quantbt_adapter_preserves_parameter_kinds_and_one_way_fee() -> None:
    ranges = _quantbt_param_ranges(
        {
            "integer": ParameterSpec(kind="int_range", low=2, high=8, step=2),
            "decimal": ParameterSpec(kind="float_range", low=0.1, high=0.5, step=0.1),
            "choice": ParameterSpec(kind="categorical", values=("a", "b")),
            "constant": ParameterSpec(kind="fixed", value=True),
        }
    )
    assert ranges == {
        "integer": (2, 8, 2),
        "decimal": (0.1, 0.5, 0.1),
        "choice": ["a", "b"],
        "constant": True,
    }
    assert all(type(value) is int for value in ranges["integer"])
    assert all(type(value) is float for value in ranges["decimal"])

    account = AccountConfig(canonical_one_way_fee_rate=0.0007)
    kwargs = _account_kwargs(account, ExecutionConfig())
    assert kwargs["fee_rate"] == pytest.approx(0.0007)
    assert "fee" not in kwargs


def test_runner_completes_and_writes_artifacts(runner, tmp_path) -> None:
    service, artifacts = runner
    market = _market()
    summary = service.run(_request(market), market, "run_p2_complete")

    assert summary["status"] == "COMPLETED"
    run_dir = artifacts.run_directory("run_p2_complete")
    expected = [
        "manifest.json",
        "config.json",
        "strategy.json",
        "metrics.json",
        "selection/selected_params.json",
        "selection/selection_trace.json",
        "wfo/trials.parquet",
        "wfo/candidates.parquet",
        "series/is.parquet",
        "series/oos.parquet",
        "series/holdout_live.parquet",
        "presentation/calendar_equity.parquet",
        "presentation/rebased_equity.parquet",
    ]
    for relative in expected:
        assert (run_dir / relative).is_file(), f"missing artifact {relative}"
    # params_by_fold is only produced by per-fold schedules (§11.4); a global
    # Mode 1 study writes the selection trace instead.
    assert summary["selected_params"].keys() == {
        "window", "rsi_l", "signalLength", "len_atr1", "len_atr2", "rvol", "len_vol", "slpercent"
    }

    trials = _read_frame(artifacts, "run_p2_complete", "wfo/trials.parquet")
    assert trials["trial_id"].is_unique
    assert len(trials) <= TRIALS


def test_calibration_tape_excludes_holdout(runner, monkeypatch) -> None:
    service, _ = runner
    market = _market()
    captured: dict[str, object] = {}

    original = service._gateway.run_mode1_calibration

    def capturing(*, strategy_fn, data, oos_start, **kwargs):
        captured["data"] = data
        captured["oos_start"] = oos_start
        return original(strategy_fn=strategy_fn, data=data, oos_start=oos_start, **kwargs)

    monkeypatch.setattr(service._gateway, "run_mode1_calibration", capturing)
    service.run(_request(market), market, "run_p2_tape")

    tape = captured["data"]
    holdout_start = market.frame.index[HOLDOUT_START]
    assert isinstance(tape, pd.DataFrame)
    assert tape.index.max() < holdout_start
    assert captured["oos_start"] == market.frame.index[IS_END]
    assert (tape.index >= holdout_start).sum() == 0


def test_selected_params_match_quantbt_metadata(runner, monkeypatch) -> None:
    service, artifacts = runner
    market = _market()
    captured: dict[str, object] = {}

    original = service._gateway.run_mode1_calibration

    def capturing(*, strategy_fn, data, oos_start, **kwargs):
        result = original(strategy_fn=strategy_fn, data=data, oos_start=oos_start, **kwargs)
        captured["wf"] = result[1]
        return result

    monkeypatch.setattr(service._gateway, "run_mode1_calibration", capturing)
    service.run(_request(market), market, "run_p2_metadata")

    frozen = _selected_params(artifacts, "run_p2_metadata")
    best = captured["wf"]["best_trial"]
    assert frozen == dict(best["params"])


def test_holdout_mutation_never_changes_calibration(runner, tmp_path) -> None:
    service, artifacts = runner
    market = _market()
    service.run(_request(market), market, "run_p2_orig")

    mutated_market = _market()
    mutated_frame = mutated_market.frame.copy()
    mutated_frame.iloc[HOLDOUT_START:] = _mutate(mutated_frame.iloc[HOLDOUT_START:], 1.05)
    mutated_market = PreparedMarketData(
        frame=mutated_frame,
        descriptor=mutated_market.descriptor,
        content_hash="mutated-holdout",
        missing_bar_count=0,
    )
    service.run(_request(mutated_market), mutated_market, "run_p2_mut")

    assert _selected_params(artifacts, "run_p2_mut") == _selected_params(artifacts, "run_p2_orig")

    for relative in ("wfo/trials.parquet", "wfo/candidates.parquet"):
        original = _read_frame(artifacts, "run_p2_orig", relative)
        mutated = _read_frame(artifacts, "run_p2_mut", relative)
        pd.testing.assert_frame_equal(original, mutated, check_freq=False)


def test_oos_mutation_keeps_is_trials_unchanged(runner) -> None:
    service, artifacts = runner
    market = _market()
    service.run(_request(market), market, "run_p2_oos_orig")

    mutated_market = _market()
    frame = mutated_market.frame.copy()
    frame.iloc[IS_END:HOLDOUT_START] = _mutate(frame.iloc[IS_END:HOLDOUT_START], 1.04)
    mutated_market = PreparedMarketData(
        frame=frame,
        descriptor=mutated_market.descriptor,
        content_hash="mutated-oos",
        missing_bar_count=0,
    )
    service.run(_request(mutated_market), mutated_market, "run_p2_oos_mut")

    # IS trial suggestions and IS scores must not change (plan §7.2).
    # ``objective`` is not purely IS (the selected candidate row carries the
    # OOS-informed decay objective), so compare only IS-origin columns.
    original = _read_frame(artifacts, "run_p2_oos_orig", "wfo/trials.parquet")
    mutated = _read_frame(artifacts, "run_p2_oos_mut", "wfo/trials.parquet")
    is_columns = ["trial_id", "params_json", "mean_is_sharpe", "pruned"]
    pd.testing.assert_frame_equal(original[is_columns], mutated[is_columns], check_freq=False)


def test_replay_parity_with_direct_pct_equity(runner) -> None:
    service, artifacts = runner
    market = _market()
    summary = service.run(_request(market), market, "run_p2_parity")

    frozen = summary["selected_params"]
    segment_frame = market.frame.iloc[:IS_END]
    history = market.frame.loc[: segment_frame.index[-1]]
    generated = generate_signals(history, frozen)
    signal = generated["pos_weight"].reindex(segment_frame.index).fillna(0.0).astype(float)

    gateway = QuantBTGateway()
    account = AccountConfig()
    execution = ExecutionConfig()
    endpoint = gateway.run_frozen_replay(
        evaluation_frame=segment_frame,
        signal=signal,
        account_kwargs={
            "initial_capital": account.initial_capital,
            "leverage": account.leverage,
            "maintenance_ratio": account.maintenance_ratio,
            "contract_size": account.contract_size,
            "alloc_per_trade": account.alloc_per_trade,
            "fee_rate": account.canonical_one_way_fee_rate,
            "slippage": execution.slippage,
            "use_funding": account.funding_enabled,
            "funding_rate": account.funding_rate,
            "use_pyramiding": account.use_pyramiding,
        },
    )
    direct = gateway.metrics(endpoint)

    artifact_series = _read_frame(artifacts, "run_p2_parity", "series/is.parquet")
    metrics = artifacts.read_json("run_p2_parity", "metrics.json")["segments"]["is"]
    pd.testing.assert_series_equal(
        artifact_series["equity"],
        endpoint.result.equity.reindex(segment_frame.index),
        check_freq=False,
    )
    for field in ("final_equity", "total_return_pct", "sharpe", "max_drawdown_pct", "num_trades"):
        assert math.isclose(float(metrics[field]), float(direct[field]), rel_tol=1e-9, abs_tol=1e-6), field


def test_market_history_before_declared_is_never_changes_protocol_results(runner) -> None:
    service, artifacts = runner
    market = _market()
    index = market.frame.index
    calibration = ThreeWindowConfig(
        is_start=index[40],
        is_end_exclusive=index[IS_END],
        oos_start=index[IS_END],
        oos_end_exclusive=index[OOS_END],
        holdout_start=index[HOLDOUT_START],
        holdout_end_exclusive=None,
        optuna_trials=TRIALS,
        optuna_early_stopping=None,
        random_seed=SEED,
        optimization=OptimizationConfig(min_trades_per_year=50.0, trade_penalty_factor=0.5),
    )
    request = _request(market, calibration=calibration)
    service.run(request, market, "run_p2_late_is_original")

    changed = market.frame.copy()
    changed.iloc[:40] = _mutate(changed.iloc[:40], factor=7.0)
    mutated = PreparedMarketData(
        frame=changed,
        descriptor=market.descriptor,
        content_hash="mutated-before-protocol",
        missing_bar_count=0,
    )
    service.run(request, mutated, "run_p2_late_is_mutated")

    assert _selected_params(artifacts, "run_p2_late_is_original") == _selected_params(
        artifacts, "run_p2_late_is_mutated"
    )
    for segment in ("is", "oos", "holdout_live"):
        pd.testing.assert_frame_equal(
            _read_frame(artifacts, "run_p2_late_is_original", f"series/{segment}.parquet"),
            _read_frame(artifacts, "run_p2_late_is_mutated", f"series/{segment}.parquet"),
            check_freq=False,
        )


def test_calendar_equity_has_null_breaks_at_boundaries(runner) -> None:
    service, artifacts = runner
    market = _market()
    service.run(_request(market), market, "run_p2_calendar")

    calendar = _read_frame(artifacts, "run_p2_calendar", "presentation/calendar_equity.parquet")
    index = market.frame.index
    assert calendar.index.equals(index)
    assert np.isnan(calendar["is_equity"].loc[index[IS_END]:]).all()
    assert np.isnan(calendar["oos_equity"].loc[: index[IS_END - 1]]).all()
    assert np.isnan(calendar["oos_equity"].loc[index[HOLDOUT_START]:]).all()
    assert np.isnan(calendar["holdout_live_equity"].loc[: index[HOLDOUT_START - 1]]).all()
    assert not np.isnan(calendar["is_equity"].loc[: index[IS_END - 1]]).any()


def test_rebased_equity_starts_at_100_and_never_feeds_metrics(runner) -> None:
    service, artifacts = runner
    market = _market()
    service.run(_request(market), market, "run_p2_rebased")

    rebased = _read_frame(artifacts, "run_p2_rebased", "presentation/rebased_equity.parquet")
    assert rebased["is_equity"].loc[market.frame.index[0]] == pytest.approx(100.0)
    assert rebased["oos_equity"].loc[market.frame.index[IS_END]] == pytest.approx(100.0)
    assert rebased["holdout_live_equity"].loc[market.frame.index[HOLDOUT_START]] == pytest.approx(100.0)

    reconciliation = artifacts.read_json("run_p2_rebased", "metrics.json")["reconciliation"]
    for segment in ("is", "oos", "holdout_live"):
        assert reconciliation[segment]["matches"] is True
        assert reconciliation[segment]["reported_final_equity"] == pytest.approx(
            reconciliation[segment]["last_equity_point"], rel=1e-9
        )


def test_no_timestamp_belongs_to_more_than_one_segment(runner) -> None:
    service, artifacts = runner
    market = _market()
    service.run(_request(market), market, "run_p2_disjoint")

    for segment in ("is", "oos", "holdout_live"):
        series = _read_frame(artifacts, "run_p2_disjoint", f"series/{segment}.parquet")
        assert series.index.has_duplicates is False

    series_is = _read_frame(artifacts, "run_p2_disjoint", "series/is.parquet")
    series_oos = _read_frame(artifacts, "run_p2_disjoint", "series/oos.parquet")
    series_hold = _read_frame(artifacts, "run_p2_disjoint", "series/holdout_live.parquet")
    assert series_is.index.max() < series_oos.index.min()
    assert series_oos.index.max() < series_hold.index.min()


def test_seed_makes_runs_bitwise_reproducible(runner) -> None:
    service, artifacts = runner
    market = _market()
    service.run(_request(market), market, "run_p2_seed_a")
    service.run(_request(market), market, "run_p2_seed_b")

    assert _selected_params(artifacts, "run_p2_seed_a") == _selected_params(artifacts, "run_p2_seed_b")
    for relative in ("wfo/trials.parquet", "series/is.parquet", "series/oos.parquet"):
        pd.testing.assert_frame_equal(
            _read_frame(artifacts, "run_p2_seed_a", relative),
            _read_frame(artifacts, "run_p2_seed_b", relative),
            check_freq=False,
        )
