from __future__ import annotations

import functools
import importlib.util
import os
import shutil
import subprocess
import sys
from datetime import UTC, datetime

import numpy as np
import pandas as pd
import pytest

from portal_api.adapters.market_data import DatasetDescriptor, InMemoryMarketDataProvider
from portal_api.domain.requests import (
    AccountConfig,
    ExecutionConfig,
    OptimizationConfig,
    ParameterSpaceConfig,
    ParameterSpec,
    PortalRunRequest,
    ThreeWindowConfig,
)


@pytest.fixture
def market_frame() -> pd.DataFrame:
    index = pd.date_range("2019-12-01", "2026-08-01", freq="1D", tz="UTC")
    trend = np.linspace(100.0, 250.0, len(index))
    wave = 3.0 * np.sin(np.arange(len(index)) / 17.0)
    close = trend + wave
    open_ = close * (1.0 + 0.001 * np.sin(np.arange(len(index)) / 5.0))
    high = np.maximum(open_, close) * 1.01
    low = np.minimum(open_, close) * 0.99
    volume = 1_000.0 + 200.0 * (1.0 + np.sin(np.arange(len(index)) / 11.0))
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": volume},
        index=index,
    )


@pytest.fixture
def provider(market_frame: pd.DataFrame) -> InMemoryMarketDataProvider:
    descriptor = DatasetDescriptor(
        dataset_id="eth-1d",
        symbol="ETHUSDT",
        venue="BINANCE",
        timeframe="1d",
    )
    return InMemoryMarketDataProvider({"eth-1d": (descriptor, market_frame)})


@pytest.fixture
def parameter_space() -> ParameterSpaceConfig:
    values = {
        "window": ParameterSpec(kind="int_range", low=20, high=60, step=2),
        "rsi_l": ParameterSpec(kind="int_range", low=12, high=30, step=1),
        "signalLength": ParameterSpec(kind="int_range", low=3, high=20, step=1),
        "len_atr1": ParameterSpec(kind="int_range", low=5, high=20, step=1),
        "len_atr2": ParameterSpec(kind="int_range", low=25, high=60, step=1),
        "rvol": ParameterSpec(kind="float_range", low=1.0, high=2.5, step=0.1),
        "len_vol": ParameterSpec(kind="int_range", low=8, high=40, step=2),
        "slpercent": ParameterSpec(kind="float_range", low=0.7, high=2.5, step=0.1),
    }
    return ParameterSpaceConfig(values)


@pytest.fixture
def run_request(parameter_space: ParameterSpaceConfig) -> PortalRunRequest:
    return PortalRunRequest(
        strategy_id="delta-rsi-polynomial-alpha",
        dataset_id="eth-1d",
        symbol="ETHUSDT",
        timeframe="1d",
        protocol="three_window_decay",
        parameter_space=parameter_space,
        calibration=ThreeWindowConfig(
            is_start=datetime(2020, 1, 1, tzinfo=UTC),
            is_end_exclusive=datetime(2024, 1, 1, tzinfo=UTC),
            oos_start=datetime(2024, 1, 1, tzinfo=UTC),
            oos_end_exclusive=datetime(2025, 7, 1, tzinfo=UTC),
            holdout_start=datetime(2025, 7, 1, tzinfo=UTC),
            holdout_end_exclusive=datetime(2026, 7, 1, tzinfo=UTC),
            optimization=OptimizationConfig(),
        ),
        account=AccountConfig(),
        execution=ExecutionConfig(),
    )


_SANDBOX_HOW = (
    "the research gate (scripts/research-loop-v11/test-*.sh) runs it with the lockfile-aligned "
    "apps/portal/.venv Python (shared libpython resolvable without LD_LIBRARY_PATH, quantbt-engine "
    "and data_loader installed) on a host that permits `unshare -Urnmpf --mount-proc`"
)


@functools.lru_cache(maxsize=None)
def _missing_for_child_launcher() -> tuple[str, ...]:
    """What the P06 child launcher needs: a runnable Python and namespaces."""

    missing: list[str] = []
    # The child is launched with a scrubbed environment (no LD_LIBRARY_PATH),
    # so libpython must resolve from the default loader configuration.
    try:
        ldd = subprocess.run(
            ["ldd", sys.executable], env={"PATH": os.defpath}, capture_output=True, text=True, timeout=30
        )
        if "not found" in ldd.stdout:
            lines = [line.strip() for line in ldd.stdout.splitlines() if "not found" in line]
            missing.append("a Python whose shared libpython resolves without LD_LIBRARY_PATH (" + "; ".join(lines) + ")")
    except (OSError, subprocess.SubprocessError):
        pass  # no ldd: static Python or unknown; let the real child decide
    unshare = shutil.which("unshare")
    if unshare is None:
        missing.append("the `unshare` binary")
    else:
        try:
            probe = subprocess.run(
                [unshare, "-Urnmpf", "--mount-proc", "true"], capture_output=True, timeout=30
            )
            if probe.returncode != 0:
                missing.append("permission for `unshare -Urnmpf --mount-proc` (user/net/mount namespaces)")
        except (OSError, subprocess.SubprocessError):
            missing.append("a working `unshare -Urnmpf --mount-proc`")
    try:
        from portal_api.adapters.quantbt import QUANTBT_DISTRIBUTION, QUANTBT_ENGINE_VERSION
        from importlib import metadata

        installed = metadata.version(QUANTBT_DISTRIBUTION)
        if installed != QUANTBT_ENGINE_VERSION:
            missing.append(f"{QUANTBT_DISTRIBUTION}=={QUANTBT_ENGINE_VERSION} (found {installed})")
    except Exception:  # not installed, or adapter not importable
        missing.append("an installed quantbt-engine at the pinned version")
    return tuple(missing)


def pytest_collection_modifyitems(config, items):
    """Skip ``research_sandbox`` tests, with a reason, only where the sandbox is absent.

    ``@pytest.mark.research_sandbox`` = real namespace child; add
    ``needs=("data_loader",)`` for tests that import the reader in-process.
    """

    for item in items:
        marker = item.get_closest_marker("research_sandbox")
        if marker is None:
            continue
        missing = list(_missing_for_child_launcher())
        for module in marker.kwargs.get("needs", ()):
            if importlib.util.find_spec(module) is None:
                missing.append(f"an importable `{module}`")
        if missing:
            item.add_marker(pytest.mark.skip(
                reason="research_sandbox: this machine lacks " + ", ".join(missing) + "; " + _SANDBOX_HOW
            ))
