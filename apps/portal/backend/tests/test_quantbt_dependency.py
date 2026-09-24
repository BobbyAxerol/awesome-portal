from __future__ import annotations

from importlib import metadata
from pathlib import Path

import pandas as pd
import pytest

from portal_api.adapters.quantbt import (
    QUANTBT_DISTRIBUTION,
    QUANTBT_ENGINE_VERSION,
    QuantBTGateway,
)


def test_gateway_uses_the_pinned_pypi_quantbt_distribution() -> None:
    """The importable ``quantbt`` module must resolve from the pinned package."""
    gateway = QuantBTGateway()
    distribution = metadata.distribution(QUANTBT_DISTRIBUTION)
    module = gateway._module()

    assert metadata.version(QUANTBT_DISTRIBUTION) == QUANTBT_ENGINE_VERSION
    assert gateway.version() == QUANTBT_ENGINE_VERSION
    assert hasattr(module, "QuantBTEndpoint")
    assert Path(module.__file__).resolve().is_relative_to(
        Path(distribution.locate_file("quantbt")).resolve()
    )
    assert gateway.walkforward_capabilities()


def test_gateway_rejects_unadmitted_walkforward_target_before_engine_call() -> None:
    gateway = QuantBTGateway()
    with pytest.raises(ValueError, match="not Portal-allowlisted"):
        gateway.run_advanced_walkforward(
            strategy_fn=None,
            data=pd.DataFrame(),
            wf_config=None,
            optimization_config={},
            param_ranges=None,
            fixed_params=None,
            account_kwargs={},
            target_mode="orders",  # type: ignore[arg-type]
        )


def test_gateway_rejects_target_missing_from_source_capabilities(monkeypatch) -> None:
    gateway = QuantBTGateway()
    monkeypatch.setattr(gateway, "walkforward_capabilities", lambda: [])
    with pytest.raises(RuntimeError, match="does not support walk-forward target"):
        gateway.run_advanced_walkforward(
            strategy_fn=None,
            data=pd.DataFrame(),
            wf_config=None,
            optimization_config={},
            param_ranges=None,
            fixed_params=None,
            account_kwargs={},
            target_mode="signal_notional",
        )
