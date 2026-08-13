from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from portal_api.domain.requests import (
    AdvancedWalkForwardConfig,
    OptimizationConfig,
    ParameterSpec,
    ThreeWindowConfig,
)


def test_default_three_window_contract_is_canonical() -> None:
    config = ThreeWindowConfig()

    assert config.is_start == datetime(2020, 1, 1, tzinfo=UTC)
    assert config.is_end_exclusive == config.oos_start
    assert config.oos_end_exclusive == config.holdout_start
    assert config.optimization_mode == "mode_1_decay"
    assert config.optimization_schedule == "global"
    assert config.optimization.candidate_selection_metric == "robust_decay"


def test_three_window_rejects_overlap_or_gap() -> None:
    with pytest.raises(ValidationError, match="IS end must equal OOS start"):
        ThreeWindowConfig(oos_start=datetime(2024, 1, 2, tzinfo=UTC))

    with pytest.raises(ValidationError, match="OOS end must equal Holdout Live start"):
        ThreeWindowConfig(holdout_start=datetime(2025, 7, 2, tzinfo=UTC))


def test_three_window_rejects_non_decay_selector() -> None:
    with pytest.raises(ValidationError, match="requires robust_decay"):
        ThreeWindowConfig(
            optimization=OptimizationConfig(candidate_selection_metric="mean_oos_sharpe")
        )


def test_advanced_schedule_compatibility_is_explicit() -> None:
    valid = AdvancedWalkForwardConfig(
        optimization_mode="mode_1_decay",
        optimization_schedule="per_fold_decay",
        optuna_trials=10,
    )
    assert valid.optimization_schedule == "per_fold_decay"

    with pytest.raises(ValidationError, match="per_fold_decay requires mode_1_decay"):
        AdvancedWalkForwardConfig(
            optimization_mode="mode_4_is_only_robust",
            optimization_schedule="per_fold_decay",
            optuna_trials=10,
        )


def test_parameter_specs_reject_ambiguous_shapes() -> None:
    with pytest.raises(ValidationError, match="requires low, high and step"):
        ParameterSpec(kind="float_range", low=1.0, high=2.0)
    with pytest.raises(ValidationError, match="must be integers"):
        ParameterSpec(kind="int_range", low=1, high=5, step=0.5)
    with pytest.raises(ValidationError, match="non-empty values"):
        ParameterSpec(kind="categorical", values=())
