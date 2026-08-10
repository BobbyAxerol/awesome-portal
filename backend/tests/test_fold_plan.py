"""Fold plan parity tests (v0.1.1) — portal's deterministic fold timeline
must match QuantBT's real fold_table exactly for every supported config.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest

from golden_fixture import build_market_frame
from portal_api.adapters.market_data import DatasetDescriptor, InMemoryMarketDataProvider
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.domain.enums import OptimizationMode, OptimizationSchedule
from portal_api.domain.requests import (
    AccountConfig,
    AdvancedWalkForwardConfig,
    ExecutionConfig,
    OptimizationConfig,
    ParameterSpaceConfig,
    ParameterSpec,
    PortalRunRequest,
)
from portal_api.services.advanced_walkforward_runner import _config_fields
from portal_api.services.fold_plan import compute_advanced_fold_plan, compute_run_fold_plan
from portal_api.services.three_window_runner import _account_kwargs
from portal_api.strategies import StrategyRegistry
from strategy.delta_rsi import build_walkforward_signal
from strategy.specification import DELTA_RSI_SPECIFICATION

_PARAM_RANGES = {k: (v[0], v[1], v[2]) for k, v in DELTA_RSI_SPECIFICATION.parameter_space.items()}


def _run_fold_table(config: AdvancedWalkForwardConfig) -> pd.DataFrame:
    frame = build_market_frame()
    fields = _config_fields(config)
    from quantbt.walkforward import WalkForwardConfig

    gw = QuantBTGateway()
    endpoint, wf = gw.run_advanced_walkforward(
        strategy_fn=build_walkforward_signal,
        data=frame,
        wf_config=WalkForwardConfig(**fields),
        optimization_config=dict(fields),
        param_ranges=_PARAM_RANGES,
        fixed_params=None,
        account_kwargs=_account_kwargs(AccountConfig(), ExecutionConfig()),
    )
    return wf["fold_table"]


CONFIGS = [
    ("weekly-expanding", dict(split_mode="2024-01-08", split_frequency="weekly", window_mode="expanding")),
    ("weekly-rolling", dict(split_mode="2024-01-08", split_frequency="weekly", window_mode="rolling", train_window="7D")),
    ("quarterly-expanding", dict(split_mode="2024-01-08", split_frequency="quarterly", window_mode="expanding")),
    ("monthly-expanding", dict(split_mode="2024-01-08", split_frequency="monthly", window_mode="expanding")),
    ("weekly-expanding-minbars", dict(split_mode="2024-01-08", split_frequency="weekly", window_mode="expanding", min_train_bars=30)),
]


@pytest.mark.parametrize("name,overrides", CONFIGS, ids=[item[0] for item in CONFIGS])
def test_fold_plan_matches_quantbt_fold_table(name, overrides) -> None:
    frame = build_market_frame()
    config = AdvancedWalkForwardConfig(
        optimization_mode=OptimizationMode.MODE_1_DECAY,
        optimization_schedule=OptimizationSchedule.GLOBAL,
        optuna_trials=4,
        random_seed=42,
        optimization=OptimizationConfig(min_trades_per_year=50.0, trade_penalty_factor=0.5),
        **overrides,
    )
    plan = compute_advanced_fold_plan(config, frame.index)
    fold_table = _run_fold_table(config)

    assert len(plan) == len(fold_table), f"{name}: fold count mismatch"
    for row, plan_fold in zip(fold_table.to_dict(orient="records"), plan, strict=True):
        assert int(plan_fold["fold_id"]) == int(row["fold_id"])
        assert pd.Timestamp(plan_fold["train_start"]) == pd.Timestamp(row["train_start"])
        assert pd.Timestamp(plan_fold["train_end"]) == pd.Timestamp(row["train_end"])
        assert pd.Timestamp(plan_fold["test_start"]) == pd.Timestamp(row["test_start"])
        assert pd.Timestamp(plan_fold["test_end"]) == pd.Timestamp(row["test_end"])


def test_run_fold_plan_three_window_shapes() -> None:
    frame = build_market_frame()
    index = frame.index
    from portal_api.domain.requests import (
        ParameterSpaceConfig,
        ParameterSpec,
        PortalRunRequest,
        ThreeWindowConfig,
    )

    request = PortalRunRequest(
        strategy_id="delta-rsi-polynomial-alpha",
        dataset_id="g",
        symbol="ETHUSDT",
        timeframe="1h",
        protocol="three_window_decay",
        parameter_space=ParameterSpaceConfig(
            {
                key: ParameterSpec(
                    kind="float_range" if isinstance(low, float) else "int_range",
                    low=low,
                    high=high,
                    step=step,
                )
                for key, (low, high, step) in DELTA_RSI_SPECIFICATION.parameter_space.items()
            }
        ),
        calibration=ThreeWindowConfig(
            is_start=index[0],
            is_end_exclusive=index[140],
            oos_start=index[140],
            oos_end_exclusive=index[300],
            holdout_start=index[300],
            holdout_end_exclusive=None,
            optuna_trials=4,
            random_seed=42,
        ),
        account=AccountConfig(),
        execution=ExecutionConfig(),
    )
    plan = compute_run_fold_plan(request, index)
    assert [fold["role"] for fold in plan["folds"]] == ["IS", "OOS", "Holdout Live"]
    assert plan["folds"][0]["start"] == str(index[0])
    assert plan["folds"][2]["end"] == str(index[-1])


def test_fold_plan_rejects_bad_split_mode() -> None:
    frame = build_market_frame()
    config = AdvancedWalkForwardConfig(
        split_mode="2020-01-01",
        split_frequency="weekly",
        optimization_mode=OptimizationMode.MODE_1_DECAY,
        optimization_schedule=OptimizationSchedule.GLOBAL,
        optuna_trials=4,
        random_seed=42,
    )
    with pytest.raises(ValueError, match="after the first data timestamp"):
        compute_advanced_fold_plan(config, frame.index)


def test_preflight_fold_config_error_is_422_not_500() -> None:
    """v0.1.1 bugfix: a fold plan that cannot be built (e.g. data_start after
    split_mode) must surface as a clean validation error, never a 500."""
    from portal_api.domain.errors import DataSchemaError
    from portal_api.domain.requests import PortalRunRequest, ThreeWindowConfig
    from portal_api.services.preflight import PreflightService

    frame = build_market_frame()
    index = frame.index
    provider = InMemoryMarketDataProvider(
        {
            "g": (
                DatasetDescriptor(dataset_id="g", symbol="ETHUSDT", venue="BINANCE", timeframe="1h"),
                frame,
            )
        }
    )
    # analysis starts 2024-01-15 while the first OOS fold is 2022-01-01.
    request = PortalRunRequest(
        strategy_id="delta-rsi-polynomial-alpha",
        dataset_id="g",
        symbol="ETHUSDT",
        timeframe="1h",
        protocol="advanced_walk_forward",
        parameter_space=ParameterSpaceConfig(
            {
                key: ParameterSpec(
                    kind="float_range" if isinstance(low, float) else "int_range",
                    low=low,
                    high=high,
                    step=step,
                )
                for key, (low, high, step) in DELTA_RSI_SPECIFICATION.parameter_space.items()
            }
        ),
        calibration=AdvancedWalkForwardConfig(
            data_start=index[350],
            split_mode="2022-01-01",
            split_frequency="weekly",
            optimization_mode=OptimizationMode.MODE_1_DECAY,
            optimization_schedule=OptimizationSchedule.GLOBAL,
            optuna_trials=4,
            random_seed=42,
        ),
        account=AccountConfig(),
        execution=ExecutionConfig(),
    )
    preflight = PreflightService(provider=provider, strategies=StrategyRegistry(), quantbt_gateway=None)
    with pytest.raises(DataSchemaError, match="fold configuration"):
        preflight.run(request)
