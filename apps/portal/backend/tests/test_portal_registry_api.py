from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Callable

import httpx
import pytest
from pydantic import ValidationError

from portal_api.main import create_app
from portal_api.repositories.portal_registry import (
    PortalRegistryLoadError,
    PortalRegistryRepository,
    canonical_digest,
)


PORTAL_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = PORTAL_ROOT.parents[1]
REGISTRY_ROOT = PORTAL_ROOT / "registry"


def _source() -> dict[str, object]:
    return json.loads((REGISTRY_ROOT / "registry.json").read_text(encoding="utf-8"))


def _registry_root(
    tmp_path: Path,
    mutate: Callable[[dict[str, object]], None] | None = None,
) -> Path:
    root = tmp_path / "registry"
    shutil.copytree(REGISTRY_ROOT, root)
    source = _source()
    if mutate is not None:
        mutate(source)
    (root / "registry.json").write_text(
        json.dumps(source, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return root


def _client(registry_root: Path):
    app = create_app(
        portal_registry_repository=PortalRegistryRepository(registry_root),
    )
    return app, httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


def test_repository_returns_one_immutable_deterministic_snapshot() -> None:
    repository = PortalRegistryRepository(REGISTRY_ROOT)

    first = repository.load()
    second = repository.load()

    assert first is second
    assert isinstance(first.document.features, tuple)
    public = first.document.model_dump(mode="json")
    digest = public.pop("content_digest")
    assert digest == canonical_digest(public)
    assert first.document.content_digest == digest
    with pytest.raises(ValidationError, match="frozen"):
        first.document.revision = 999  # type: ignore[misc]


@pytest.mark.anyio
async def test_registry_endpoint_serves_validated_document_and_cache_headers() -> None:
    app, client = _client(REGISTRY_ROOT)
    try:
        async with client:
            response = await client.get("/api/v1/portal/registry")
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "portal.registry.v1"
    assert payload["registry_id"] == "portal-default"
    assert payload["revision"] == 6
    execution = next(
        screen
        for screen in payload["screens"]
        if screen["screen_id"] == "EXECUTION_COMMAND_CENTER_SCREEN"
    )
    assert execution["delivery_profile"] == "fixture"
    assert execution["delivery_policy"] == {
        "policy_revision": 2,
        "query_enabled": False,
        "projection_ingestion_enabled": False,
        "sse_enabled": False,
        "governance_write_enabled": False,
        "paper_commands_enabled": False,
        "sandbox_commands_enabled": False,
        "live_protective_commands_enabled": False,
        "live_risk_increasing_commands_enabled": False,
    }
    assert response.headers["etag"] == f'"{payload["content_digest"]}"'
    assert response.headers["cache-control"] == "no-cache, must-revalidate"
    assert response.headers["vary"] == "Authorization, Cookie"
    without_digest = {key: value for key, value in payload.items() if key != "content_digest"}
    assert payload["content_digest"] == canonical_digest(without_digest)


@pytest.mark.anyio
@pytest.mark.parametrize("conditional", ["exact", "weak", "list", "wildcard"])
async def test_registry_endpoint_honors_if_none_match(conditional: str) -> None:
    app, client = _client(REGISTRY_ROOT)
    try:
        async with client:
            initial = await client.get("/api/v1/portal/registry")
            etag = initial.headers["etag"]
            values = {
                "exact": etag,
                "weak": f"W/{etag}",
                "list": f'"sha256:{"0" * 64}", {etag}',
                "wildcard": "*",
            }
            response = await client.get(
                "/api/v1/portal/registry",
                headers={"If-None-Match": values[conditional]},
            )
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 304
    assert response.content == b""
    assert response.headers["etag"] == etag
    assert response.headers["cache-control"] == "no-cache, must-revalidate"


@pytest.mark.anyio
async def test_stale_etag_and_request_path_input_cannot_change_registry_source() -> None:
    app, client = _client(REGISTRY_ROOT)
    try:
        async with client:
            stale = await client.get(
                "/api/v1/portal/registry",
                headers={"If-None-Match": f'"sha256:{"0" * 64}"'},
            )
            attempted_override = await client.get(
                "/api/v1/portal/registry",
                params={"path": "/tmp/untrusted/registry.json"},
            )
    finally:
        app.state.run_manager.shutdown()

    assert stale.status_code == 200
    assert attempted_override.status_code == 200
    assert attempted_override.json() == stale.json()
    operation = app.openapi()["paths"]["/api/v1/portal/registry"]["get"]
    assert all(parameter["in"] != "query" for parameter in operation.get("parameters", []))


@pytest.mark.anyio
async def test_readiness_is_tied_to_validated_registry_snapshot() -> None:
    app, client = _client(REGISTRY_ROOT)
    try:
        async with client:
            registry = await client.get("/api/v1/portal/registry")
            readiness = await client.get("/api/ready")
            liveness = await client.get("/api/health")
    finally:
        app.state.run_manager.shutdown()

    assert liveness.status_code == 200
    assert readiness.status_code == 200
    assert readiness.json() == {
        "status": "ready",
        "service": "portal-api",
        "version": "0.1.0",
        "registry_schema_version": "portal.registry.v1",
        "registry_revision": registry.json()["revision"],
        "registry_digest": registry.json()["content_digest"],
    }


def test_invalid_or_missing_registry_fails_app_composition(tmp_path: Path) -> None:
    missing = tmp_path / "missing-registry"
    with pytest.raises(PortalRegistryLoadError) as missing_error:
        create_app(portal_registry_repository=PortalRegistryRepository(missing))
    assert missing_error.value.code == "REGISTRY_FILE_UNAVAILABLE"

    def unknown_major(source: dict[str, object]) -> None:
        source["schema_version"] = "portal.registry.v2"

    invalid = _registry_root(tmp_path, unknown_major)
    with pytest.raises(PortalRegistryLoadError) as invalid_error:
        create_app(portal_registry_repository=PortalRegistryRepository(invalid))
    assert invalid_error.value.code == "REGISTRY_SOURCE_INVALID"


@pytest.mark.parametrize(
    "failure",
    [
        "dangling",
        "route_collision",
        "screen_route_collision",
        "navigation_collision",
        "unsafe_route",
        "unsafe_metadata",
        "missing_delivery_profile",
        "fixture_capability",
        "shadow_command",
        "sse_without_projection",
        "delivery_before_revision",
        "delivery_before_contract_revision",
    ],
)
def test_cross_reference_invariants_fail_closed(tmp_path: Path, failure: str) -> None:
    def mutate(source: dict[str, object]) -> None:
        features = source["features"]
        assert isinstance(features, list)
        if failure == "dangling":
            features[0]["screen_ids"].append("MISSING_SCREEN")
        elif failure == "route_collision":
            features[1]["canonical_route"] = features[0]["canonical_route"]
        elif failure == "screen_route_collision":
            screens = source["screens"]
            assert isinstance(screens, list)
            screens[1]["route"] = screens[0]["route"]
        elif failure == "navigation_collision":
            features[1]["navigation"]["order"] = features[0]["navigation"]["order"]
        elif failure == "unsafe_route":
            features[0]["canonical_route"] = "//internal.example/portal"
        elif failure == "unsafe_metadata":
            features[0]["description"] = "Read metadata from /srv/private/portal."
        else:
            screens = source["screens"]
            assert isinstance(screens, list)
            screen = next(
                item
                for item in screens
                if item["screen_id"] == "EXECUTION_COMMAND_CENTER_SCREEN"
            )
            if failure == "missing_delivery_profile":
                del screen["delivery_profile"]
            elif failure == "fixture_capability":
                screen["delivery_policy"]["query_enabled"] = True
            elif failure == "shadow_command":
                screen["delivery_profile"] = "shadow"
                screen["delivery_policy"]["query_enabled"] = True
                screen["delivery_policy"]["paper_commands_enabled"] = True
            elif failure == "sse_without_projection":
                screen["delivery_profile"] = "shadow"
                screen["delivery_policy"]["query_enabled"] = True
                screen["delivery_policy"]["sse_enabled"] = True
            elif failure == "delivery_before_revision":
                source["revision"] = 3
            else:
                screen["contract_revision"] = 1

    root = _registry_root(tmp_path, mutate)
    with pytest.raises(PortalRegistryLoadError) as error:
        PortalRegistryRepository(root).load()

    assert error.value.code == "REGISTRY_SOURCE_INVALID"
    expected = {
        "dangling": "dangling screen_ids",
        "route_collision": "feature route collision",
        "screen_route_collision": "screen route collision",
        "navigation_collision": "duplicate visible navigation positions",
        "unsafe_route": "unsafe route",
        "unsafe_metadata": "unsafe metadata",
        "missing_delivery_profile": "delivery_profile",
        "fixture_capability": "fixture profile must disable runtime capabilities",
        "shadow_command": "shadow profile must disable commands",
        "sse_without_projection": "SSE requires query and projection ingestion",
        "delivery_before_revision": "delivery metadata requires registry revision 4",
        "delivery_before_contract_revision": "delivery metadata requires contract revision 2",
    }[failure]
    assert expected in error.value.detail


def test_hidden_metadata_is_removed_and_public_digest_is_recomputed(tmp_path: Path) -> None:
    def hide_planning(source: dict[str, object]) -> None:
        features = source["features"]
        assert isinstance(features, list)
        planning = next(feature for feature in features if feature["id"] == "PLANNING")
        planning["maturity"] = "HIDDEN"
        planning["navigation"]["show_in_sidebar"] = False
        planning["navigation"]["show_in_command_palette"] = False

    loaded = PortalRegistryRepository(_registry_root(tmp_path, hide_planning)).load()
    public = loaded.document.model_dump(mode="json")

    assert "PLANNING" not in {feature["id"] for feature in public["features"]}
    assert not any(screen["feature_id"] == "PLANNING" for screen in public["screens"])
    assert not any("PLANNING" in concern["feature_ids"] for concern in public["concerns"])
    assert not any(
        "PLANNING" in stage["feature_ids"] for stage in public["lifecycle_stages"]
    )
    assert loaded.source_digest != loaded.document.content_digest


@pytest.mark.anyio
async def test_commissioned_feature_is_added_through_registry_data_only(
    tmp_path: Path,
) -> None:
    def add_feature(source: dict[str, object]) -> None:
        source["revision"] = int(source["revision"]) + 1
        features = source["features"]
        assert isinstance(features, list)
        features.append(
            {
                "id": "RISK_LAB",
                "group": "research",
                "label": "Risk Lab",
                "description": "Commissioned risk research workspace.",
                "canonical_route": "/research/risk-lab",
                "legacy_routes": [],
                "maturity": "COMMISSIONED",
                "data_mode": "NONE",
                "permissions": ["quantbt.research.read"],
                "environments": ["local", "research"],
                "source_module": None,
                "prototype_frame_id": None,
                "roadmap_epic_id": "U03-RISK-LAB",
                "default_task_id": None,
                "screen_ids": [],
                "concern_ids": [],
                "lifecycle_stage_ids": [],
                "summary_source_ids": [],
                "hidden_for_roles": [],
                "activation_gate": "Risk authority and screen contract must be approved.",
                "navigation": {
                    "order": 99,
                    "icon_key": "shield-check",
                    "show_in_sidebar": True,
                    "show_in_command_palette": True,
                },
            }
        )

    app, client = _client(_registry_root(tmp_path, add_feature))
    try:
        async with client:
            response = await client.get("/api/v1/portal/registry")
            feature_route = await client.get("/research/risk-lab")
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 200
    by_id = {feature["id"]: feature for feature in response.json()["features"]}
    assert by_id["RISK_LAB"]["maturity"] == "COMMISSIONED"
    assert feature_route.status_code == 404


def test_registry_is_packaged_without_a_frontend_source_duplicate() -> None:
    dockerfile = (REPO_ROOT / "deploy/images/portal-api.Dockerfile").read_text(
        encoding="utf-8"
    )
    assert "COPY apps/portal/registry ./registry" in dockerfile
    assert "PORTAL_REGISTRY_ROOT=/opt/portal/registry" in dockerfile
    assert "PORTAL_ARTIFACT_ROOT=/var/lib/portal/artifacts/runs" in dockerfile

    frontend_root = PORTAL_ROOT / "frontend/src"
    assert not list(frontend_root.rglob("registry.json"))
    feature_ids = {feature["id"] for feature in _source()["features"]}
    for path in frontend_root.rglob("*"):
        if path.suffix not in {".ts", ".tsx", ".js", ".jsx", ".json"}:
            continue
        tokens = set(re.findall(r"\b[A-Z][A-Z0-9_]{2,63}\b", path.read_text("utf-8")))
        assert not feature_ids.issubset(tokens), f"duplicate feature registry in {path}"
