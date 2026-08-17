from __future__ import annotations

import importlib.metadata
import json
import shutil
from pathlib import Path
from typing import Callable

import httpx
import pytest

from portal_api.main import create_app
from portal_api.repositories.portal_registry import PortalRegistryRepository
from portal_api.services.engine_capabilities import (
    EngineCapabilityError,
    EngineCapabilityLoadError,
    EngineCapabilityService,
    installed_dist_info_record_hash,
)


PORTAL_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_ROOT = PORTAL_ROOT / "registry"
PINNED_RECORD_SHA256 = "48c09e6b8f26b06c9ab695f9f44467dfa5c7118c9fa9d765b4199a6f5b2db832"


def _load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _root(
    tmp_path: Path,
    mutate: Callable[[dict[str, object]], None] | None = None,
) -> Path:
    root = tmp_path / "registry"
    shutil.copytree(REGISTRY_ROOT, root)
    if mutate is not None:
        source = _load_json(root / "engine-capabilities.v1.json")
        mutate(source)
        (root / "engine-capabilities.v1.json").write_text(
            json.dumps(source, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return root


def _service(registry_root: Path = REGISTRY_ROOT) -> EngineCapabilityService:
    return EngineCapabilityService(registry_root)


# --------------------------------------------------------------- loading


def test_manifest_loads_with_pinned_release_and_capabilities() -> None:
    service = _service()
    manifest = service.manifest

    assert manifest.schema_version == "engine-capabilities.v1"
    assert len(manifest.engine_releases) == 1
    release = manifest.engine_releases[0]
    assert release.package == "quantbt-engine"
    assert release.version == "1.0.8"
    assert release.dist_info_record_sha256 == PINNED_RECORD_SHA256
    assert [capability.protocol for capability in manifest.capabilities] == [
        "three_window_decay",
        "advanced_walk_forward",
    ]
    assert all(capability.certified for capability in manifest.capabilities)


def test_installed_engine_matches_pinned_dist_info_record() -> None:
    assert importlib.metadata.version("quantbt-engine") == "1.0.8"
    assert installed_dist_info_record_hash("quantbt-engine") == PINNED_RECORD_SHA256
    results = _service().verify_installed()
    assert results["er_quantbt_108"]["ok"] is True


@pytest.mark.parametrize(
    "mutate, expected",
    [
        (
            lambda source: source["capabilities"][0].update(
                {"engine_release_id": "er_missing"}
            ),
            "unknown release",
        ),
        (
            lambda source: source["capabilities"].append(
                {**source["capabilities"][0]}
            ),
            "duplicate capability",
        ),
        (
            lambda source: source.update({"schema_version": "engine-capabilities.v2"}),
            "CAPABILITIES_SOURCE_INVALID",
        ),
        (
            lambda source: source["capabilities"][0].update({"certified": "yes"}),
            "CAPABILITIES_SOURCE_INVALID",
        ),
    ],
)
def test_invalid_manifests_fail_closed(tmp_path: Path, mutate, expected: str) -> None:
    with pytest.raises(EngineCapabilityLoadError) as error:
        EngineCapabilityService(_root(tmp_path, mutate))
    assert expected in str(error.value)


def test_invalid_manifest_fails_app_composition(tmp_path: Path) -> None:
    def uncertified(source: dict[str, object]) -> None:
        source["capabilities"][0].update({"certified": "yes"})

    with pytest.raises(EngineCapabilityLoadError):
        create_app(
            portal_registry_repository=PortalRegistryRepository(
                _root(tmp_path, uncertified)
            )
        )


# -------------------------------------------------------------- preflight


def test_preflight_accepts_certified_advertised_protocols() -> None:
    service = _service()
    for protocol in ("three_window_decay", "advanced_walk_forward"):
        result = service.preflight(
            protocol=protocol,
            data_class="historical_market_data",
            optuna_trials=400,
            parameter_space_entries=8,
        )
        assert result.certified is True


def test_preflight_rejects_unadvertised_or_uncertified_protocols(
    tmp_path: Path,
) -> None:
    service = _service()
    with pytest.raises(EngineCapabilityError, match="not an advertised"):
        service.preflight(protocol="crafted_protocol", data_class="historical_market_data")

    def uncertified(source: dict[str, object]) -> None:
        source["capabilities"][1].update({"certified": False})

    gated = EngineCapabilityService(_root(tmp_path, uncertified))
    with pytest.raises(EngineCapabilityError, match="not certified"):
        gated.preflight(
            protocol="advanced_walk_forward", data_class="historical_market_data"
        )


def test_preflight_enforces_resource_profile_bounds() -> None:
    service = _service()
    with pytest.raises(EngineCapabilityError, match="resource profile"):
        service.preflight(
            protocol="three_window_decay",
            data_class="historical_market_data",
            optuna_trials=99999,
        )
    with pytest.raises(EngineCapabilityError, match="resource profile"):
        service.preflight(
            protocol="three_window_decay",
            data_class="historical_market_data",
            parameter_space_entries=999,
        )
    with pytest.raises(EngineCapabilityError, match="data class"):
        service.preflight(
            protocol="three_window_decay", data_class="realtime_feed"
        )


# --------------------------------------------------------- manifest gate


def test_synthetic_certified_capability_passes_preflight_without_code_change(
    tmp_path: Path,
) -> None:
    def add_synthetic(source: dict[str, object]) -> None:
        source["manifest_revision"] = int(source["manifest_revision"]) + 1
        source["capabilities"].append(
            {
                "capability_id": "CAP_SYNTHETIC_PROTOCOL",
                "protocol": "synthetic_protocol",
                "endpoint_id": "walk_forward",
                "engine_release_id": "er_quantbt_108",
                "certified": True,
                "requirements": {
                    "backend": "python",
                    "data_class": ["historical_market_data"],
                    "methodology": "synthetic",
                },
            }
        )

    service = EngineCapabilityService(_root(tmp_path, add_synthetic))
    result = service.preflight(
        protocol="synthetic_protocol", data_class="historical_market_data"
    )
    assert result.capability_id == "CAP_SYNTHETIC_PROTOCOL"
    assert result.certified is True
    public = service.public_document()
    protocols = [item.protocol for item in public.capabilities]
    assert "synthetic_protocol" in protocols


# -------------------------------------------------------------- endpoint


@pytest.mark.anyio
async def test_capabilities_endpoint_is_read_only_and_safe() -> None:
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/v1/portal/capabilities")
            mutation = await client.post("/api/v1/portal/capabilities")
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "engine-capabilities.v1"
    assert payload["installed"]["er_quantbt_108"]["ok"] is True
    assert [item["certified"] for item in payload["capabilities"]] == [True, True]
    encoded = json.dumps(payload)
    assert "dist_info_record_sha256" not in encoded  # digest hidden from public doc
    assert mutation.status_code == 405


@pytest.fixture
def anyio_backend():
    return "asyncio"
