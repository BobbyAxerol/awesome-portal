"""Clean Delta-RSI runtime surface (implementation_plan_protoyype.md §6.2).

This module is the only entry point allowed to import the protected kernel
``strategy.main``, and it does so lazily: importing this module never compiles
Numba. The kernel itself is never edited; behavior parity is certified by
``backend/tests/test_golden_parity.py`` against the committed golden fixture.

Contract rules (from the plan):

- no ``display``/``print``/plotting, no mutable module globals, no absolute
  paths;
- missing params fail with a clear error listing the missing keys;
- ``build_walkforward_signal`` output index is exactly ``test_index`` and only
  data up to ``test_index[-1]`` is used (causal cutoff);
- OHLCV input must be float64 with a monotonic, unique DatetimeIndex;
- ``warm_up`` compiles the Numba kernel once before a timed run.
"""

from __future__ import annotations

from typing import Any, Mapping

import numpy as np
import pandas as pd

from .specification import DELTA_RSI_SPECIFICATION


class StrategyParameterError(ValueError):
    """Raised when a parameter set violates the strategy contract."""


class StrategyDataError(ValueError):
    """Raised when the OHLCV frame violates the strategy contract."""


def _validate_input(frame: pd.DataFrame) -> None:
    missing = sorted(set(DELTA_RSI_SPECIFICATION.required_columns) - set(frame.columns))
    if missing:
        raise StrategyDataError(f"missing required columns: {missing}")
    if not isinstance(frame.index, pd.DatetimeIndex):
        raise StrategyDataError("input index must be a DatetimeIndex")
    if not frame.index.is_monotonic_increasing:
        raise StrategyDataError("input index must be monotonic increasing")
    if frame.index.has_duplicates:
        raise StrategyDataError("input index must not contain duplicates")


def _validate_params(params: Mapping[str, object]) -> None:
    missing = sorted(set(DELTA_RSI_SPECIFICATION.parameter_space) - set(params))
    if missing:
        raise StrategyParameterError(f"missing strategy params: {missing}")


def generate_signals(data: pd.DataFrame, params: Mapping[str, object]) -> pd.DataFrame:
    """Generate Delta-RSI signals from a UTC OHLCV frame.

    Returns a copy of ``data`` extended with ``pos_weight``, ``exit_type`` and
    ``exit_price`` columns. The input frame is never mutated.
    """
    _validate_input(data)
    _validate_params(params)
    from strategy.main import generate_delta_rsi_signals

    return generate_delta_rsi_signals(data, dict(params))


def build_walkforward_signal(
    data: pd.DataFrame,
    params: Mapping[str, object],
    train_index: pd.DatetimeIndex,
    test_index: pd.DatetimeIndex,
    fold: object,
) -> pd.Series:
    """Return the causal signal requested by the fold-local scoring stage.

    For IS scoring, ``test_index`` is the fold train index; for candidate OOS
    scoring and final stitching it is the fold test index. The cutoff keeps
    the tape causal at the active stage boundary. Indicator warm-up history
    before the segment start is allowed, but no post-cutoff bar is read.
    """
    del train_index, fold
    if len(test_index) == 0:
        return pd.Series(dtype=float, index=test_index, name="pos_weight")
    frame = data.loc[: test_index[-1]].copy()
    generated = generate_signals(frame, params)
    return generated["pos_weight"].reindex(test_index).fillna(0.0).astype(float)


def warm_up(params: Mapping[str, object] | None = None) -> None:
    """Compile the Numba kernel once on a small synthetic frame.

    Call before a timed run so the compile cost is excluded from measured
    execution (plan §6.2). Deterministic, side-effect free, idempotent.
    """
    n = 140
    t = np.arange(n, dtype=np.float64)
    close = 100.0 + 0.2 * t + 1.0 * np.sin(t / 5.0)
    frame = pd.DataFrame(
        {
            "open": close,
            "high": close * 1.01,
            "low": close * 0.99,
            "close": close,
            "volume": 1_000.0 + 200.0 * np.sin(t / 7.0),
        },
        index=pd.date_range("2024-01-01", periods=n, freq="1h", tz="UTC"),
    )
    warmup_params: dict[str, object] = {
        "window": 32,
        "rsi_l": 20,
        "signalLength": 9,
        "len_atr1": 10,
        "len_atr2": 42,
        "rvol": 1.6,
        "len_vol": 16,
        "slpercent": 1.3,
    }
    generate_signals(frame, params if params is not None else warmup_params)


__all__ = [
    "StrategyParameterError",
    "StrategyDataError",
    "generate_signals",
    "build_walkforward_signal",
    "warm_up",
]
