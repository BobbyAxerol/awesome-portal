from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, RootModel, field_validator, model_validator

from .enums import OptimizationMode, OptimizationSchedule, RunProtocol


def _utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


class PortalModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, validate_default=True)


class ParameterSpec(PortalModel):
    kind: Literal["fixed", "int_range", "float_range", "categorical"]
    value: Any | None = None
    low: int | float | None = None
    high: int | float | None = None
    step: int | float | None = None
    values: tuple[Any, ...] | None = None

    @model_validator(mode="after")
    def validate_shape(self) -> "ParameterSpec":
        if self.kind == "fixed":
            if self.value is None:
                raise ValueError("fixed parameter requires value")
            if any(item is not None for item in (self.low, self.high, self.step, self.values)):
                raise ValueError("fixed parameter cannot define range or values")
            return self

        if self.kind == "categorical":
            if not self.values:
                raise ValueError("categorical parameter requires non-empty values")
            if any(item is not None for item in (self.value, self.low, self.high, self.step)):
                raise ValueError("categorical parameter cannot define fixed/range fields")
            return self

        if self.low is None or self.high is None or self.step is None:
            raise ValueError(f"{self.kind} requires low, high and step")
        if self.low > self.high:
            raise ValueError("parameter low must be <= high")
        if self.step <= 0:
            raise ValueError("parameter step must be > 0")
        if self.value is not None or self.values is not None:
            raise ValueError(f"{self.kind} cannot define fixed/categorical fields")
        if self.kind == "int_range" and not all(
            isinstance(item, int) and not isinstance(item, bool)
            for item in (self.low, self.high, self.step)
        ):
            raise ValueError("int_range low, high and step must be integers")
        return self


class ParameterSpaceConfig(RootModel[dict[str, ParameterSpec]]):
    model_config = ConfigDict(frozen=True)

    @model_validator(mode="after")
    def require_parameters(self) -> "ParameterSpaceConfig":
        if not self.root:
            raise ValueError("parameter_space cannot be empty")
        return self


class AccountConfig(PortalModel):
    initial_capital: Annotated[float, Field(gt=0)] = 20_000.0
    leverage: Annotated[float, Field(gt=0)] = 1.0
    maintenance_ratio: Annotated[float, Field(ge=0, lt=1)] = 0.005
    contract_size: Annotated[float, Field(gt=0)] = 1.0
    alloc_per_trade: Annotated[float, Field(gt=0)] = 0.5
    canonical_one_way_fee_rate: Annotated[float, Field(ge=0, lt=1)] = 0.0005
    funding_enabled: bool = True
    funding_rate: float = 0.0001
    use_pyramiding: bool = False


class ExecutionConfig(PortalModel):
    slippage: Annotated[float, Field(ge=0, lt=1)] = 0.0001
    target_mode: str = "pct_equity"
    backend: str = "auto"


class OptimizationConfig(PortalModel):
    top_is_fraction: Annotated[float, Field(gt=0, le=1)] = 0.10
    top_is_k: Annotated[int | None, Field(gt=0)] = None
    decay_lambda: Annotated[float, Field(ge=0)] = 0.5
    decay_gamma: Annotated[float, Field(ge=0)] = 0.5
    candidate_decay_lambda: Annotated[float | None, Field(ge=0)] = None
    candidate_decay_gamma: Annotated[float | None, Field(ge=0)] = None
    candidate_selection_metric: str = "robust_decay"
    flat_top_fraction: Annotated[float, Field(gt=0, le=1)] = 0.10
    flat_eps: Annotated[float, Field(gt=0)] = 0.15
    flat_min_samples: Annotated[int, Field(gt=0)] = 3
    flat_selector: Literal["medoid", "centroid"] = "medoid"
    plateau_quantile: Annotated[float, Field(ge=0, le=1)] = 0.25
    plateau_median_weight: Annotated[float, Field(ge=0)] = 0.25
    plateau_std_penalty: Annotated[float, Field(ge=0)] = 0.50
    plateau_size_bonus: Annotated[float, Field(ge=0)] = 0.01
    is_subperiods: Annotated[int, Field(gt=0)] = 6
    q25_weight: Annotated[float, Field(ge=0)] = 0.30
    dispersion_penalty: Annotated[float, Field(ge=0)] = 0.50
    temporal_weight: Annotated[float, Field(ge=0)] = 0.65
    plateau_weight: Annotated[float, Field(ge=0)] = 0.35
    use_bootstrap_penalty: bool = False
    use_complexity_penalty: bool = False
    sbb_samples: Annotated[int, Field(gt=0)] = 256
    sbb_block_length: Annotated[int, Field(gt=0)] = 20
    sbb_decay_lambda: Annotated[float, Field(ge=0)] = 0.5
    sbb_std_penalty: Annotated[float, Field(ge=0)] = 0.1
    sbb_simulation: Literal["stationary", "regime", "stress", "garch"] = "stationary"
    regime_count: Annotated[int, Field(ge=2)] = 3
    regime_lookback: Annotated[int, Field(gt=0)] = 20
    regime_weights: dict[str, float] | None = None
    stress_vol_multiplier: Annotated[float, Field(gt=0)] = 1.0
    garch_p: Annotated[int, Field(gt=0)] = 1
    garch_q: Annotated[int, Field(gt=0)] = 1
    garch_dist: Literal["normal", "gaussian", "t", "studentst"] = "t"
    garch_vol_multiplier: Annotated[float, Field(gt=0)] = 1.0
    scoring_backend: Literal["proxy", "endpoint"] = "endpoint"
    scoring_trading_days: Annotated[int, Field(gt=0)] = 365
    min_trades_per_year: Annotated[float | None, Field(ge=0)] = 100.0
    trade_penalty_factor: Annotated[float | None, Field(ge=0)] = 0.5
    use_numba: bool = True


class ThreeWindowConfig(PortalModel):
    is_start: datetime = datetime(2020, 1, 1, tzinfo=UTC)
    is_end_exclusive: datetime = datetime(2024, 1, 1, tzinfo=UTC)
    oos_start: datetime = datetime(2024, 1, 1, tzinfo=UTC)
    oos_end_exclusive: datetime = datetime(2025, 7, 1, tzinfo=UTC)
    holdout_start: datetime = datetime(2025, 7, 1, tzinfo=UTC)
    holdout_end_exclusive: datetime | None = None
    optimization_mode: Literal[OptimizationMode.MODE_1_DECAY] = OptimizationMode.MODE_1_DECAY
    optimization_schedule: Literal[OptimizationSchedule.GLOBAL] = OptimizationSchedule.GLOBAL
    optuna_trials: Annotated[int, Field(gt=0)] = 400
    optuna_early_stopping: Annotated[int | None, Field(gt=0)] = 200
    random_seed: int | None = 42
    optimization: OptimizationConfig = OptimizationConfig()

    @field_validator(
        "is_start",
        "is_end_exclusive",
        "oos_start",
        "oos_end_exclusive",
        "holdout_start",
        "holdout_end_exclusive",
        mode="after",
    )
    @classmethod
    def normalize_timestamps(cls, value: datetime | None) -> datetime | None:
        return None if value is None else _utc_datetime(value)

    @model_validator(mode="after")
    def validate_windows(self) -> "ThreeWindowConfig":
        if self.is_start >= self.is_end_exclusive:
            raise ValueError("IS window must have positive duration")
        if self.is_end_exclusive != self.oos_start:
            raise ValueError("IS end must equal OOS start")
        if self.oos_start >= self.oos_end_exclusive:
            raise ValueError("OOS window must have positive duration")
        if self.oos_end_exclusive != self.holdout_start:
            raise ValueError("OOS end must equal Holdout Live start")
        if self.holdout_end_exclusive is not None and self.holdout_start >= self.holdout_end_exclusive:
            raise ValueError("Holdout Live window must have positive duration")
        if self.optimization.candidate_selection_metric != "robust_decay":
            raise ValueError("three-window protocol requires robust_decay selection")
        return self


class AdvancedWalkForwardConfig(PortalModel):
    data_start: datetime | None = None
    data_end_exclusive: datetime | None = None
    split_mode: str | int | datetime = "walk_forward_2022"
    split_frequency: Literal["single", "yearly", "semi_yearly", "quarterly", "monthly", "weekly"] = "quarterly"
    window_mode: Literal["expanding", "rolling"] = "expanding"
    train_window: str | None = None
    min_train_bars: Annotated[int, Field(gt=0)] = 1
    min_test_bars: Annotated[int, Field(gt=0)] = 1
    fill_value: float = 0.0
    optimization_mode: OptimizationMode = OptimizationMode.NONE
    optimization_schedule: OptimizationSchedule = OptimizationSchedule.GLOBAL
    fold_boundary_position_policy: Literal["carry"] = "carry"
    optuna_trials: Annotated[int, Field(ge=0)] = 0
    optuna_early_stopping: Annotated[int | None, Field(gt=0)] = None
    random_seed: int | None = 42
    optimization: OptimizationConfig = OptimizationConfig()

    @field_validator("data_start", "data_end_exclusive", mode="after")
    @classmethod
    def normalize_data_timestamps(cls, value: datetime | None) -> datetime | None:
        return None if value is None else _utc_datetime(value)

    @model_validator(mode="after")
    def validate_schedule(self) -> "AdvancedWalkForwardConfig":
        if (
            self.data_start is not None
            and self.data_end_exclusive is not None
            and self.data_start >= self.data_end_exclusive
        ):
            raise ValueError("advanced data window must have positive duration")
        if self.window_mode == "rolling" and not self.train_window:
            raise ValueError("rolling window_mode requires train_window")
        if self.optimization_schedule == OptimizationSchedule.PER_FOLD_DECAY:
            if self.optimization_mode != OptimizationMode.MODE_1_DECAY:
                raise ValueError("per_fold_decay requires mode_1_decay")
            if self.optimization.candidate_selection_metric != "robust_decay":
                raise ValueError("per_fold_decay requires robust_decay")
        if self.optimization_schedule == OptimizationSchedule.PER_FOLD_CAUSAL:
            if self.optimization_mode != OptimizationMode.MODE_4_IS_ONLY_ROBUST:
                raise ValueError("per_fold_causal requires mode_4_is_only_robust")
        if self.optimization_schedule != OptimizationSchedule.GLOBAL and self.optuna_trials <= 0:
            raise ValueError("per-fold schedules require optuna_trials > 0")
        if self.optimization_mode == OptimizationMode.MODE_2_SBB and self.optimization.scoring_backend != "proxy":
            raise ValueError("mode_2_sbb requires proxy scoring")
        return self


class PortalRunRequest(PortalModel):
    strategy_id: str
    dataset_id: str
    symbol: str
    timeframe: str
    protocol: RunProtocol = RunProtocol.THREE_WINDOW_DECAY
    parameter_space: ParameterSpaceConfig
    calibration: ThreeWindowConfig | AdvancedWalkForwardConfig
    account: AccountConfig = AccountConfig()
    execution: ExecutionConfig = ExecutionConfig()

    @model_validator(mode="after")
    def match_protocol_and_calibration(self) -> "PortalRunRequest":
        expected = (
            ThreeWindowConfig
            if self.protocol == RunProtocol.THREE_WINDOW_DECAY
            else AdvancedWalkForwardConfig
        )
        if not isinstance(self.calibration, expected):
            raise ValueError(f"{self.protocol} requires {expected.__name__}")
        return self

    def config_hash(self) -> str:
        """Deterministic hash of the full submitted configuration."""
        canonical = self.model_dump(mode="json", exclude_none=False)
        return hashlib.sha256(
            json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
