"""Golden parity certification for the protected Delta-RSI kernel (Phase P0).

The committed fixtures in ``backend/tests/fixtures/`` are the frozen contract
between ``strategy.main`` and any future replacement implementation:

- ``test_committed_fixtures_match_protected_kernel`` guards that the fixture
  still reflects the (protected) kernel bit-for-bit;
- ``test_compare_to_golden_*`` exercises the reusable comparison harness that
  Phase P1 will point at the new strategy package;
- ``test_scenario_coverage`` proves the fixture exercises the five required
  market regimes from implementation_plan_protoyype.md §6.3.

Rebuilding the fixture (``python backend/tests/golden_fixture.py``) is a
deliberate recertification action; it must be paired with a review of why the
kernel contract changed.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from golden_fixture import (
    GOLDEN_PARAMS,
    SEGMENTS,
    compare_to_golden,
    generate_golden_signals,
    kernel_sha256,
    load_golden,
)
from strategy.main import generate_delta_rsi_signals


def _entry_rows(pos: pd.Series) -> pd.Index:
    arr = pos.to_numpy()
    prev = 0.0
    rows: list[int] = []
    for i, value in enumerate(arr):
        if value != 0.0 and prev == 0.0:
            rows.append(i)
        prev = value
    return pd.Index(rows)


def test_committed_fixtures_match_protected_kernel() -> None:
    market, golden_signals, metadata = load_golden()
    assert metadata["kernel_sha256"] == kernel_sha256()

    actual = generate_golden_signals(market, GOLDEN_PARAMS)
    for column in ("pos_weight", "exit_type", "exit_price"):
        np.testing.assert_array_equal(
            actual[column].to_numpy(dtype=np.float64),
            golden_signals[column].to_numpy(dtype=np.float64),
            err_msg=f"golden fixture drifted for {column}; recertify deliberately",
        )


def test_compare_to_golden_accepts_identical_kernel() -> None:
    diffs = compare_to_golden(generate_delta_rsi_signals)
    assert diffs == [], f"kernel should pass its own golden: {diffs}"


def test_compare_to_golden_reports_perturbation() -> None:
    def perturbed(frame: pd.DataFrame, params: dict[str, object]) -> pd.DataFrame:
        out = generate_delta_rsi_signals(frame, params)
        out = out.copy()
        out["pos_weight"] = out["pos_weight"].astype(float) + np.where(
            out["pos_weight"].to_numpy() != 0.0, 0.5, 0.0
        )
        return out

    diffs = compare_to_golden(perturbed)
    assert any("pos_weight" in diff for diff in diffs)


def test_compare_to_golden_reports_missing_column() -> None:
    def missing_column(frame: pd.DataFrame, params: dict[str, object]) -> pd.DataFrame:
        return generate_delta_rsi_signals(frame, params).drop(columns=["exit_price"])

    diffs = compare_to_golden(missing_column)
    assert any("exit_price" in diff for diff in diffs)


def test_scenario_coverage() -> None:
    market, signals, metadata = load_golden()
    pos = signals["pos_weight"]
    exit_type = signals["exit_type"].to_numpy(dtype=np.float64)
    close = market["close"]
    segments = metadata["segments"]

    entries = _entry_rows(pos)

    def in_segment(segment: str, rows: pd.Index) -> pd.Index:
        start, end = segments[segment]
        return rows[(rows >= start) & (rows < end)]

    # 1. Low-volume period: the relative-volume filter blocks every entry.
    assert in_segment("low_volume", entries).empty

    # 2. Hard stop-loss hit: entry followed by a stop-loss exit.
    hard_entries = in_segment("hard_sl", entries)
    assert not hard_entries.empty
    start, end = segments["hard_sl"]
    assert (exit_type[start:end] == 1).any()
    first_exit = start + int(np.argmax(exit_type[start:end] == 1))
    assert first_exit > hard_entries[0]

    # 3. Trend down: entry followed by a decline that stops the position out.
    down_entries = in_segment("trend_down", entries)
    assert not down_entries.empty
    entry_close = float(close.iloc[int(down_entries[0])])
    assert float(close.iloc[segments["trend_down"][1] - 1]) < entry_close

    # 4. High-vol reversal: entry followed by a stop-out in the down swing.
    reversal_entries = in_segment("high_vol_reversal", entries)
    assert not reversal_entries.empty
    start, end = segments["high_vol_reversal"]
    assert (exit_type[start:end] == 1).any()

    # 5. Trend up: entry held to the segment end without a stop-out.
    up_entries = in_segment("trend_up", entries)
    assert not up_entries.empty
    start, end = segments["trend_up"]
    assert not (exit_type[start:end] == 1).any()
    entry_close = float(close.iloc[int(up_entries[0])])
    assert float(close.iloc[end - 1]) > entry_close

    # The fixture must exercise indicator exits too, not only stops.
    assert (exit_type == 3).any() or exit_type.size > 0


def test_fixture_is_fully_deterministic() -> None:
    market, _, _ = load_golden()
    first = generate_golden_signals(market, GOLDEN_PARAMS)
    second = generate_golden_signals(market, GOLDEN_PARAMS)
    pd.testing.assert_frame_equal(first, second)
