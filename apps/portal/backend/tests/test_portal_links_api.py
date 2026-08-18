from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Callable

import httpx
import pytest
from jsonschema import Draft202012Validator, FormatChecker

from portal_api.domain.portal_links import PortalLinksDocument
from portal_api.main import create_app
from portal_api.repositories.portal_links import (
    PortalLinksLoadError,
    PortalLinksRepository,
    links_source_digest,
)
from portal_api.repositories.portal_registry import PortalRegistryRepository
from portal_api.services.portal_links import PortalLinksService
from portal_api.services.portal_registry import PortalRegistryService


PORTAL_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_ROOT = PORTAL_ROOT / "registry"


def _load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _links_root(
    tmp_path: Path,
    mutate: Callable[[dict[str, object]], None] | None = None,
) -> Path:
    root = tmp_path / "registry"
    shutil.copytree(REGISTRY_ROOT, root)
    if mutate is not None:
        source = _load_json(root / "links.v1.json")
        mutate(source)
        (root / "links.v1.json").write_text(
            json.dumps(source, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    return root


def _service(registry_root: Path = REGISTRY_ROOT) -> PortalLinksService:
    registry_service = PortalRegistryService(PortalRegistryRepository(registry_root))
    return PortalLinksService(PortalLinksRepository(registry_root), registry_service.document)


# ------------------------------------------------------------------ loading


def test_links_sidecar_loads_with_cross_checked_registry_references() -> None:
    service = _service()
    document = service.document

    assert document.schema_version == "portal.links.v1"
    assert document.links_revision == 1
    assert len(document.entries) == 17
    assert document.integrity.status == "valid"
    assert document.integrity.dangling_links == 0
    assert document.integrity.features_linked == 4
    assert document.integrity.screens_linked == 8
    assert document.integrity.concerns_linked == 5
    assert document.integrity.planning_tasks_referenced == 4


def test_links_document_round_trips_through_domain_models() -> None:
    document = _service().document
    validated = PortalLinksDocument.model_validate(document.model_dump(mode="json"))
    assert validated == document


@pytest.mark.parametrize(
    "mutate, expected",
    [
        (
            lambda source: source["entries"][0].update({"feature_id": "MISSING_FEATURE"}),
            "unknown feature",
        ),
        (
            lambda source: source["entries"].append(
                {**source["entries"][0], "id": source["entries"][0]["id"]}
            ),
            "duplicate link entry",
        ),
        (
            lambda source: source["entries"][0].update(
                {
                    "feature_id": None,
                    "screen_id": None,
                    "concern_id": None,
                }
            ),
            "references no feature",
        ),
        (
            lambda source: source["entries"][0].update(
                {"prototype_route": "https://evil.example/route"}
            ),
            "LINKS_SOURCE_INVALID",
        ),
        (
            lambda source: source["entries"][0].update(
                {"activation_gate": "read token=secret from /srv/private"}
            ),
            "unsafe metadata",
        ),
        (
            lambda source: source["entries"][0].update(
                {"planning_task_ids": ["../../unsafe", "../../unsafe"]}
            ),
            "LINKS_SOURCE_INVALID",
        ),
        (
            lambda source: source.update({"schema_version": "portal.links.v2"}),
            "LINKS_SOURCE_INVALID",
        ),
    ],
)
def test_invalid_links_sidecar_fails_closed(tmp_path: Path, mutate, expected: str) -> None:
    registry_service = PortalRegistryService(PortalRegistryRepository(REGISTRY_ROOT))
    with pytest.raises(PortalLinksLoadError) as error:
        PortalLinksRepository(_links_root(tmp_path, mutate)).load(
            registry_service.document
        )
    assert expected in str(error.value)


def test_missing_links_file_fails_closed(tmp_path: Path) -> None:
    registry_service = PortalRegistryService(PortalRegistryRepository(REGISTRY_ROOT))
    with pytest.raises(PortalLinksLoadError) as error:
        PortalLinksRepository(tmp_path / "missing").load(registry_service.document)
    assert error.value.code == "LINKS_FILE_UNAVAILABLE"


def test_invalid_links_fails_app_composition(tmp_path: Path) -> None:
    with pytest.raises(PortalLinksLoadError):
        create_app(
            portal_registry_repository=PortalRegistryRepository(
                _links_root(
                    tmp_path,
                    lambda source: source["entries"][0].update(
                        {"feature_id": "MISSING_FEATURE"}
                    ),
                )
            )
        )


# ------------------------------------------------------------------- endpoint


@pytest.mark.anyio
async def test_links_endpoint_serves_document_with_etag_and_304() -> None:
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/v1/portal/links")
            etag = response.headers["etag"]
            cached = await client.get(
                "/api/v1/portal/links",
                headers={"If-None-Match": etag},
            )
            wildcard = await client.get(
                "/api/v1/portal/links",
                headers={"If-None-Match": "*"},
            )
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache, must-revalidate"
    assert response.headers["vary"] == "Authorization, Cookie"
    payload = response.json()
    assert payload["schema_version"] == "portal.links.v1"
    assert payload["integrity"]["dangling_links"] == 0
    assert cached.status_code == 304
    assert wildcard.status_code == 304
    assert etag == _service().etag
    operation = app.openapi()["paths"]["/api/v1/portal/links"]
    assert set(operation) == {"get"}
    assert all(
        parameter["in"] != "query" for parameter in operation["get"].get("parameters", [])
    )


@pytest.mark.anyio
async def test_links_endpoint_is_read_only() -> None:
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            mutation = await client.post("/api/v1/portal/links")
    finally:
        app.state.run_manager.shutdown()

    assert mutation.status_code == 405


def test_links_schema_validates_committed_sidecar() -> None:
    schema = _load_json(REGISTRY_ROOT / "schemas" / "portal-links.v1.schema.json")
    document = _load_json(REGISTRY_ROOT / "links.v1.json")
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = list(validator.iter_errors(document))
    assert not errors, "\n".join(error.message for error in errors)


# ------------------------------------------------- legacy and facade parity


def test_portal_summary_and_links_services_never_mutate_upstream() -> None:
    overview = (
        PORTAL_ROOT / "backend/src/portal_api/services/portal_overview.py"
    ).read_text(encoding="utf-8")
    adapters = (
        PORTAL_ROOT / "backend/src/portal_api/adapters/quantbt_summary.py"
    ).read_text(encoding="utf-8")
    planning = (
        PORTAL_ROOT / "backend/src/portal_api/adapters/planning_summary.py"
    ).read_text(encoding="utf-8")
    links = (
        PORTAL_ROOT / "backend/src/portal_api/services/portal_links.py"
    ).read_text(encoding="utf-8")

    for source, label in (
        (overview, "portal_overview.py"),
        (planning, "planning_summary.py"),
        (links, "portal_links.py"),
    ):
        assert "write_json" not in source, f"{label} must not write artifacts"
        assert 'method="POST"' not in source, f"{label} must not POST"
        assert "X-Portal-Actor" not in source, f"{label} must not impersonate actors"
    assert "backend.app" not in planning
    assert "sqlite" not in planning.lower()
    assert "open(" not in links, "links service must not touch files at request time"
