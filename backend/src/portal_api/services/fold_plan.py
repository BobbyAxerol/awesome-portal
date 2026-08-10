"""Deterministic walk-forward fold plan (v0.1.1, Run Progress v2).

Mirrors QuantBT's ``WalkForwardEngine.build_folds`` (read-only reference) so
the portal can render the fold timeline BEFORE and DURING a run — which fold
is being tuned, whether the window is expanding or rolling, and to which
dates. Parity with the real ``fold_table`` is certified by
``backend/tests/test_fold_plan.py``; the artifact is display/UX data, never
audit input.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from portal_api.domain.enums import RunProtocol
from portal_api.domain.requests import (
    AdvancedWalkForwardConfig,
    PortalRunRequest,
    ThreeWindowConfig,
)


def _first_oos_timestamp(split_mode) -> pd.Timestamp:
    if isinstance(split_mode, int):
        ts = pd.Timestamp(year=int(split_mode), month=1, day=1, tz="UTC")
    else:
        raw = str(split_mode)
        if raw.startswith("walk_forward_"):
            raw = raw.replace("walk_forward_", "", 1)
        if raw.isdigit() and len(raw) == 4:
            ts = pd.Timestamp(year=int(raw), month=1, day=1, tz="UTC")
        else:
            ts = pd.Timestamp(raw)
    if ts.tz is None:
        return ts.tz_localize("UTC")
    return ts.tz_convert("UTC")


def _frequency_offset(split_frequency: str) -> pd.DateOffset:
    if split_frequency == "yearly":
        return pd.DateOffset(years=1)
    if split_frequency == "semi_yearly":
        return pd.DateOffset(months=6)
    if split_frequency == "quarterly":
        return pd.DateOffset(months=3)
    if split_frequency == "monthly":
        return pd.DateOffset(months=1)
    if split_frequency == "weekly":
        return pd.DateOffset(weeks=1)
    raise ValueError("unsupported split_frequency")


def compute_advanced_fold_plan(
    config: AdvancedWalkForwardConfig,
    index: pd.DatetimeIndex,
) -> list[dict[str, Any]]:
    """Fold plan for Advanced WFO — same contract as QuantBT build_folds."""
    index = index.tz_localize("UTC") if index.tz is None else index.tz_convert("UTC")
    idx = pd.DatetimeIndex(index)
    folds: list[dict[str, Any]] = []

    if config.optimization_mode.value == "mode_5_full_robust":
        return [
            {
                "fold_id": 0,
                "train_start": str(idx[0]),
                "train_end": str(idx[-1]),
                "test_start": str(idx[0]),
                "test_end": str(idx[-1]),
            }
        ]

    first_oos = _first_oos_timestamp(config.split_mode)
    if first_oos <= idx[0]:
        raise ValueError("first OOS timestamp must be after the first data timestamp")
    if first_oos > idx[-1]:
        raise ValueError("first OOS timestamp is after the available data")

    if config.split_frequency == "single":
        train_start = idx[0] if config.window_mode == "expanding" else first_oos - pd.Timedelta(config.train_window)
        train_index = idx[(idx >= train_start) & (idx < first_oos)]
        test_index = idx[idx >= first_oos]
        if len(train_index) < config.min_train_bars or len(test_index) < config.min_test_bars:
            raise ValueError("train/test split produced too few bars")
        return [
            {
                "fold_id": 0,
                "train_start": str(train_index[0]),
                "train_end": str(train_index[-1]),
                "test_start": str(test_index[0]),
                "test_end": str(test_index[-1]),
            }
        ]

    step = _frequency_offset(config.split_frequency)
    test_start = first_oos
    fold_id = 0
    while test_start <= idx[-1]:
        test_stop = test_start + step
        test_index = idx[(idx >= test_start) & (idx < test_stop)]
        if len(test_index) < config.min_test_bars:
            test_start = test_stop
            continue
        if config.window_mode == "expanding":
            train_start = idx[0]
        else:
            train_start = test_start - pd.Timedelta(config.train_window)
        train_index = idx[(idx >= train_start) & (idx < test_start)]
        if len(train_index) < config.min_train_bars:
            test_start = test_stop
            continue
        folds.append(
            {
                "fold_id": fold_id,
                "train_start": str(train_index[0]),
                "train_end": str(train_index[-1]),
                "test_start": str(test_index[0]),
                "test_end": str(test_index[-1]),
            }
        )
        fold_id += 1
        test_start = test_stop

    if not folds:
        raise ValueError("walk-forward split produced no folds")
    return folds


def compute_run_fold_plan(
    request: PortalRunRequest,
    index: pd.DatetimeIndex,
) -> dict[str, Any]:
    """Unified fold plan artifact for both protocols.

    - three_window_decay: three fixed bands (IS / OOS / Holdout Live).
    - advanced_walk_forward: QuantBT-parity fold rows.
    """
    if request.protocol == RunProtocol.THREE_WINDOW_DECAY and isinstance(request.calibration, ThreeWindowConfig):
        cfg = request.calibration
        segments = [
            ("IS", cfg.is_start, cfg.is_end_exclusive),
            ("OOS", cfg.oos_start, cfg.oos_end_exclusive),
            ("Holdout Live", cfg.holdout_start, cfg.holdout_end_exclusive or index[-1]),
        ]
        return {
            "protocol": request.protocol.value,
            "folds": [
                {"fold_id": fold_id, "role": role, "start": str(start), "end": str(end)}
                for fold_id, (role, start, end) in enumerate(segments)
            ],
        }
    if request.protocol == RunProtocol.ADVANCED_WALK_FORWARD and isinstance(
        request.calibration, AdvancedWalkForwardConfig
    ):
        return {
            "protocol": request.protocol.value,
            "folds": compute_advanced_fold_plan(request.calibration, index),
        }
    raise ValueError(f"unsupported protocol for fold plan: {request.protocol}")
