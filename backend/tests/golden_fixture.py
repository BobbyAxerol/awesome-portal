"""Golden Delta-RSI fixture for Phase P0 parity certification.

The fixture is the frozen contract between the protected kernel
(``strategy.main``) and any future replacement implementation: rebuild it only
when the kernel behavior is intentionally recertified, then re-run the parity
suite.

Covered scenarios (each is a labeled segment of the hourly frame):

1. ``trend_up``      - sustained rise with normal volume;
2. ``trend_down``    - sustained fall with normal volume;
3. ``high_vol_reversal`` - wide alternating swings with volume above the
   relative-volume filter;
4. ``low_volume``    - tiny moves with volume below ``rvol * SMA(volume)`` so
   the filter blocks entries;
5. ``hard_sl``       - a clean long entry followed by a gap-like bar that
   pierces the stop loss (``exit_type == 1``).

Parity tolerance policy (documented contract, used by ``compare_to_golden``):

- ``pos_weight`` and ``exit_type``: exact float equality;
- ``exit_price``: ``np.allclose(rtol=1e-9, atol=1e-12)``.

The fixture is fully deterministic: no random number generator is used, only
closed-form waves, so regeneration is bitwise reproducible on a given
platform.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Callable

import numpy as np
import pandas as pd

from strategy.main import generate_delta_rsi_signals

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
MARKET_PATH = FIXTURES_DIR / "golden_market.parquet"
SIGNALS_PATH = FIXTURES_DIR / "golden_signals.parquet"
METADATA_PATH = FIXTURES_DIR / "golden_metadata.json"

# Canonical calibration surface used for the fixture. Mirrors the values used
# by the existing adapter test so the search surface stays representative.
GOLDEN_PARAMS = {
    "window": 32,
    "rsi_l": 20,
    "signalLength": 9,
    "len_atr1": 10,
    "len_atr2": 42,
    "rvol": 1.6,
    "len_vol": 16,
    "slpercent": 1.3,
}

# Half-open hour offsets for the five scenario segments. Order is deliberate:
# each active segment opens with a short down-drift that parks Delta-RSI below
# its signal line, so the entry cross fires at the start of the following
# convex jump while the volume-burst filter window is still open.
SEGMENTS = {
    "low_volume": (0, 100),
    "hard_sl": (100, 160),
    "trend_down": (160, 260),
    "high_vol_reversal": (260, 360),
    "trend_up": (360, 500),
}

_TOTAL_BARS = max(segment[1] for segment in SEGMENTS.values())


def build_market_frame() -> pd.DataFrame:
    """Deterministic hourly OHLCV frame covering all five scenarios.

    Active segments follow the pattern *calm drift -> volatility+volume burst
    -> directional move*. A burst makes ``ATR(fast) > ATR(slow)`` and
    ``volume > rvol * SMA(volume)`` true for roughly 8-12 bars, which is the
    kernel's entry window; calm windows keep both filters false.
    """
    n = _TOTAL_BARS
    close = np.empty(n)
    high = np.empty(n)
    low = np.empty(n)
    volume = np.empty(n)

    def drift(start: int, end: int, price0: float, slope: float, vol: float) -> None:
        idx = np.arange(start, end, dtype=np.float64) - start
        close[start:end] = price0 + slope * idx + 0.25 * np.sin(idx / 9.0 + start)
        high[start:end] = close[start:end] * 1.003
        low[start:end] = close[start:end] * 0.997
        volume[start:end] = vol * (1.0 + 0.05 * np.sin(idx / 7.0))

    def burst(start: int, end: int, price0: float, slope: float, amp: float) -> None:
        idx = np.arange(start, end, dtype=np.float64) - start
        close[start:end] = price0 + slope * idx + amp * np.sin(idx / 3.5 + start)
        high[start:end] = close[start:end] * 1.015
        low[start:end] = close[start:end] * 0.985
        volume[start:end] = 2600.0 + 150.0 * np.sin(idx / 4.0)

    # 1. Low volume (0-100): tiny moves, flat volume. Volume equals its own
    # SMA so the relative-volume filter is always false. Cold start, no
    # entries, guarantees every later segment starts flat.
    drift(0, 100, 115.0, 0.0, 1000.0)

    # 2. Hard-SL (100-160): accelerating down-drift long enough for RSI to
    # turn (parks Delta-RSI clearly below its signal line from any prior
    # state), convex jump (cross above the signal, long enters inside the
    # volume-burst window), then one violent -10% spike pierces the stop.
    down_acc = np.cumsum(np.array([0.05, 0.1, 0.15, 0.22, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], dtype=np.float64))
    close[100:112] = 115.0 - down_acc
    high[100:112] = close[100:112] * 1.004
    low[100:112] = close[100:112] * 0.996
    volume[100:112] = 1000.0
    j_idx = np.arange(112, 124, dtype=np.float64) - 112
    close[112:124] = close[111] - 0.5 + 0.80 * j_idx + 0.5 * np.sin(j_idx / 3.0)
    high[112:124] = close[112:124] * 1.012
    low[112:124] = close[112:124] * 0.988
    volume[112:124] = 6500.0 + 250.0 * np.sin(j_idx / 5.0)
    close[124] = close[123] * 0.90
    high[124] = close[123] * 1.002
    low[124] = close[124] * 0.998
    volume[124] = 7000.0
    drift(125, 160, close[124] * 1.02, 0.01, 900.0)

    # 3. Trend down (160-260): same entry pattern, then a sustained decline
    # that carries the long below its stop loss.
    down_acc = np.cumsum(np.array([0.05, 0.1, 0.15, 0.22, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], dtype=np.float64))
    close[160:172] = close[159] - down_acc
    high[160:172] = close[160:172] * 1.004
    low[160:172] = close[160:172] * 0.996
    volume[160:172] = 1000.0
    j_idx = np.arange(172, 184, dtype=np.float64) - 172
    close[172:184] = close[171] - 0.5 + 0.80 * j_idx + 0.5 * np.sin(j_idx / 3.0)
    high[172:184] = close[172:184] * 1.012
    low[172:184] = close[172:184] * 0.988
    volume[172:184] = 6500.0 + 250.0 * np.sin(j_idx / 5.0)
    drift(184, 260, close[183], -0.45, 1200.0)

    # 4. High-vol reversal (260-360): the same down-drift + convex jump
    # entry, a flat middle, then a downward burst that stop-losses the long,
    # and a calm tail.
    down_acc = np.cumsum(np.array([0.05, 0.1, 0.15, 0.22, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], dtype=np.float64))
    close[260:272] = close[259] - down_acc
    high[260:272] = close[260:272] * 1.004
    low[260:272] = close[260:272] * 0.996
    volume[260:272] = 1000.0
    j_idx = np.arange(272, 284, dtype=np.float64) - 272
    close[272:284] = close[271] - 0.5 + 0.80 * j_idx + 0.5 * np.sin(j_idx / 3.0)
    high[272:284] = close[272:284] * 1.012
    low[272:284] = close[272:284] * 0.988
    volume[272:284] = 6500.0 + 250.0 * np.sin(j_idx / 5.0)
    drift(284, 306, close[283], 0.0, 1000.0)
    burst(306, 316, close[305], -1.0, 1.3)
    drift(316, 360, close[315], 0.0, 1000.0)

    # 5. Trend up (360-500): rise (Delta-RSI decays below its signal line),
    # flat pause, then a convex jump that starts the volume burst and crosses
    # Delta-RSI above the signal; the position rides the sustained rise.
    drift(360, 400, close[359] + 0.5, 0.105, 900.0)
    close[400:408] = close[399]
    high[400:408] = close[400:408] * 1.003
    low[400:408] = close[400:408] * 0.997
    volume[400:408] = 920.0
    jump = np.array([0.35, 1.15, 1.05, 0.95, 0.85, 0.75, 0.65, 0.55], dtype=np.float64)
    close[408:416] = close[399] + np.cumsum(jump)
    close[408:416] += 0.12 * np.sin(np.arange(408, 416) / 3.0)
    high[408:416] = close[408:416] * 1.015
    low[408:416] = close[408:416] * 0.985
    volume[408:416] = 6500.0 + 250.0 * np.sin(np.arange(408, 416) / 3.0)
    drift(416, 500, close[415], 0.35, 1100.0)

    open_ = np.empty(n)
    open_[0] = close[0]
    open_[1:] = close[:-1]

    index = pd.date_range("2024-01-01", periods=n, freq="1h", tz="UTC")
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=index,
    )


def kernel_sha256() -> str:
    kernel = Path(__file__).resolve().parents[2] / "strategy" / "main.py"
    return hashlib.sha256(kernel.read_bytes()).hexdigest()


def generate_golden_signals(
    frame: pd.DataFrame, params: dict[str, Any] | None = None
) -> pd.DataFrame:
    return generate_delta_rsi_signals(frame, dict(params or GOLDEN_PARAMS))


def rebuild() -> dict[str, Any]:
    """Regenerate and write the committed fixture files. Returns the metadata."""
    import os

    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    market = build_market_frame()
    signals = generate_golden_signals(market, GOLDEN_PARAMS)
    market.to_parquet(MARKET_PATH, index=True)
    signals.to_parquet(SIGNALS_PATH, index=True)
    metadata = {
        "fixture": "delta-rsi-golden-v1",
        "params": GOLDEN_PARAMS,
        "segments": {name: list(bounds) for name, bounds in SEGMENTS.items()},
        "bars": _TOTAL_BARS,
        "timeframe": "1h",
        "kernel_sha256": kernel_sha256(),
        "tolerance_policy": {
            "pos_weight": "exact",
            "exit_type": "exact",
            "exit_price": {"rtol": 1e-9, "atol": 1e-12},
        },
        "generated_at": "2026-08-10T00:00:00Z",
        "source": "backend/tests/golden_fixture.py (python backend/tests/golden_fixture.py)",
    }
    METADATA_PATH.write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return metadata


def load_golden() -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    market = pd.read_parquet(MARKET_PATH)
    signals = pd.read_parquet(SIGNALS_PATH)
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    return market, signals, metadata


def compare_to_golden(generate_fn: Callable[[pd.DataFrame, dict[str, Any]], pd.DataFrame]) -> list[str]:
    """Compare a candidate signal generator against the golden contract.

    ``generate_fn`` must accept (market frame, params) and return a frame
    carrying ``pos_weight``, ``exit_type`` and ``exit_price``. Returns a list
    of human-readable mismatches; an empty list means full parity.
    """
    market, golden, metadata = load_golden()
    params = metadata["params"]
    candidate = generate_fn(market, params)

    diffs: list[str] = []
    for column in ("pos_weight", "exit_type", "exit_price"):
        if column not in candidate.columns:
            diffs.append(f"missing column {column!r}")
            continue
        actual = candidate[column].to_numpy(dtype=np.float64)
        expected = golden[column].to_numpy(dtype=np.float64)
        if column == "exit_price":
            if not np.allclose(actual, expected, rtol=1e-9, atol=1e-12):
                mask = ~np.isclose(actual, expected, rtol=1e-9, atol=1e-12)
                first = int(np.argmax(mask))
                diffs.append(
                    f"{column} mismatch at row {first}: expected={expected[first]!r} "
                    f"actual={actual[first]!r}"
                )
        elif not np.array_equal(actual, expected):
            mask = actual != expected
            first = int(np.argmax(mask))
            diffs.append(
                f"{column} mismatch at row {first}: expected={expected[first]!r} "
                f"actual={actual[first]!r}"
            )
    if not candidate.index.equals(market.index):
        diffs.append("candidate index does not match market index")
    return diffs


if __name__ == "__main__":
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    metadata = rebuild()
    print(json.dumps(metadata, indent=2))
