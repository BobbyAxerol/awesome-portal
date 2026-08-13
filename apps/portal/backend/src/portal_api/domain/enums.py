from __future__ import annotations

from enum import StrEnum


class RunProtocol(StrEnum):
    THREE_WINDOW_DECAY = "three_window_decay"
    ADVANCED_WALK_FORWARD = "advanced_walk_forward"


class OptimizationMode(StrEnum):
    NONE = "none"
    MODE_1_DECAY = "mode_1_decay"
    MODE_2_SBB = "mode_2_sbb"
    MODE_3_FLAT_MINIMA = "mode_3_flat_minima"
    MODE_4_IS_ONLY_ROBUST = "mode_4_is_only_robust"
    MODE_5_FULL_ROBUST = "mode_5_full_robust"


class OptimizationSchedule(StrEnum):
    GLOBAL = "global"
    PER_FOLD_DECAY = "per_fold_decay"
    PER_FOLD_CAUSAL = "per_fold_causal"


class RunState(StrEnum):
    QUEUED = "QUEUED"
    VALIDATING_DATA = "VALIDATING_DATA"
    WARMING_KERNEL = "WARMING_KERNEL"
    OPTIMIZING_IS = "OPTIMIZING_IS"
    RANKING_IS_CANDIDATES = "RANKING_IS_CANDIDATES"
    REPLAYING_CANDIDATES_ON_OOS = "REPLAYING_CANDIDATES_ON_OOS"
    SELECTING_PARAMS = "SELECTING_PARAMS"
    FREEZING_PARAMS = "FREEZING_PARAMS"
    BACKTESTING_IS = "BACKTESTING_IS"
    BACKTESTING_OOS = "BACKTESTING_OOS"
    BACKTESTING_HOLDOUT_LIVE = "BACKTESTING_HOLDOUT_LIVE"
    BUILDING_ARTIFACTS = "BUILDING_ARTIFACTS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
