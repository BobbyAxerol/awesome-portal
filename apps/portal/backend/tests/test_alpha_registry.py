from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Callable

import httpx
import pytest

from portal_api.main import create_app
from portal_api.repositories.portal_registry import PortalRegistryRepository
from portal_api.services.alpha_registry import (
    AlphaRegistry,
    AlphaRegistryError,
    AlphaRegistryLoadError,
    LIFECYCLE_ORDER,
)


PORTAL_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_ROOT = PORTAL_ROOT / "registry"


def _load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _root(
    tmp_path: Path,
    mutate: Callable[[dict[str, object]], None] | None = None,
) -> Path:
    root = tmp_path / "registry"
    shutil.copytree(REGISTRY_ROOT, root)
    if mutate is not None:
        source = _load_json(root / "alphas.v1.json")
        mutate(source)
        (root / "alphas.v1.json").write_text(
            json.dumps(source, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return root


def _registry(registry_root: Path = REGISTRY_ROOT) -> AlphaRegistry:
    return AlphaRegistry(registry_root)


# ------------------------------------------------------------- registry


def test_delta_rsi_alpha_is_registered_with_locked_identity() -> None:
    alpha = _registry().get("delta-rsi-polynomial")

    assert alpha.alpha_id == "delta-rsi-polynomial"
    assert alpha.version == "1.0.0"
    assert alpha.entrypoint == "strategy.delta_rsi:DeltaRsiStrategyAdapter"
    assert alpha.artifact.digest == (
        "sha256:4117b87006525d576aef7559c001002f18ea9f78e9fa83c64187d2776f4e9d18"
    )
    assert alpha.strategy.family == "momentum"
    assert alpha.strategy.determinism == {"seed_required": True, "external_io": False}
    assert alpha.data_requirements.columns == ("open", "high", "low", "close", "volume")
    assert "signalLength" in alpha.parameters.manager_exposed
    assert alpha.lifecycle.stage == "RESEARCH"
    assert alpha.lifecycle.quarantined is False
    assert alpha.lifecycle.certification == "golden-parity-v1"


def test_unregistered_alpha_fails_closed() -> None:
    with pytest.raises(AlphaRegistryError, match="not registered"):
        _registry().get("crafted-alpha")
    with pytest.raises(AlphaRegistryError, match="not registered"):
        _registry().get_version("delta-rsi-polynomial", "9.9.9")


@pytest.mark.parametrize(
    "mutate, expected",
    [
        (
            lambda source: source["alphas"][0].update({"alpha_id": "Bad_Alpha"}),
            "ALPHAS_SOURCE_INVALID",
        ),
        (
            lambda source: source["alphas"][0]["artifact"].update(
                {"digest": "sha256:nothex"}
            ),
            "ALPHAS_SOURCE_INVALID",
        ),
        (
            lambda source: source["alphas"][0]["lifecycle"].update(
                {"stage": "PRODUCTION"}
            ),
            "ALPHAS_SOURCE_INVALID",
        ),
        (
            lambda source: source["alphas"].append({**source["alphas"][0]}),
            "duplicate alpha version",
        ),
    ],
)
def test_invalid_alpha_registry_fails_closed(tmp_path: Path, mutate, expected: str) -> None:
    with pytest.raises(AlphaRegistryLoadError) as error:
        AlphaRegistry(_root(tmp_path, mutate))
    assert expected in str(error.value)


# ------------------------------------------------------- lifecycle/quarantine


def test_quarantine_blocks_any_promotion_or_run(tmp_path: Path) -> None:
    def quarantine(source: dict[str, object]) -> None:
        source["alphas"][0]["lifecycle"].update(
            {"quarantined": True, "quarantine_reason": "artifact digest drift"}
        )

    registry = AlphaRegistry(_root(tmp_path, quarantine))
    with pytest.raises(AlphaRegistryError, match="quarantined"):
        registry.quarantine_block("delta-rsi-polynomial")

    clean = _registry()
    clean.quarantine_block("delta-rsi-polynomial")  # must not raise


def test_lifecycle_order_is_strict() -> None:
    assert LIFECYCLE_ORDER == (
        "DRAFT",
        "REGISTERED",
        "CANDIDATE",
        "RESEARCH",
        "PAPER",
        "SANDBOX",
        "LIVE",
    )
    assert LIFECYCLE_ORDER.index("RESEARCH") < LIFECYCLE_ORDER.index("LIVE")


# ----------------------------------------------------------- digest verify


def test_artifact_verification_matches_protected_strategy_package() -> None:
    result = _registry().verify_artifact("delta-rsi-polynomial", "1.0.0")

    assert result["matches"] is True
    assert result["registered_digest"] == result["computed_digest"]


def test_artifact_verification_detects_drift(tmp_path: Path) -> None:
    def drift(source: dict[str, object]) -> None:
        source["alphas"][0]["artifact"]["digest"] = "sha256:" + "a" * 64

    registry = AlphaRegistry(_root(tmp_path, drift))
    result = registry.verify_artifact("delta-rsi-polynomial", "1.0.0")
    assert result["matches"] is False


# -------------------------------------------------------------- endpoints


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_alpha_endpoints_are_read_only_and_safe() -> None:
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            listing = await client.get("/api/v1/alphas")
            detail = await client.get(
                "/api/v1/alphas/delta-rsi-polynomial/versions/1.0.0"
            )
            verify = await client.get(
                "/api/v1/alphas/delta-rsi-polynomial/versions/1.0.0/verify"
            )
            missing = await client.get("/api/v1/alphas/nope/versions/1.0.0")
            mutation = await client.post("/api/v1/alphas")
    finally:
        app.state.run_manager.shutdown()

    assert listing.status_code == 200
    assert listing.json()["alphas"][0]["alpha_id"] == "delta-rsi-polynomial"
    assert detail.status_code == 200
    assert detail.json()["version"] == "1.0.0"
    assert detail.json()["lifecycle"]["stage"] == "RESEARCH"
    assert verify.status_code == 200
    assert verify.json()["matches"] is True
    assert missing.status_code == 404
    assert mutation.status_code == 405


def test_public_document_never_leaks_owner_internals_or_paths() -> None:
    document = _registry().public_document()
    encoded = json.dumps(document)
    assert "/srv/" not in encoded
    assert "maintainers" not in encoded
    assert "lock_digest" not in encoded
    assert "immutable_for_live" not in encoded
