from __future__ import annotations

from importlib import metadata
from pathlib import Path

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
