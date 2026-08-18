from __future__ import annotations

import json
import re
from pathlib import Path

import httpx
import pytest

from portal_api.api.ingress import (
    generate_request_id,
    generate_traceparent,
    safe_request_id,
    safe_traceparent,
)
from portal_api.main import create_app


REPO_ROOT = Path(__file__).resolve().parents[4]
NGINX_CONF = REPO_ROOT / "deploy" / "nginx" / "portal.conf"

REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
TRACEPARENT_PATTERN = re.compile(
    r"^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$"
)
REDACTED_MARKERS = (
    "/srv/",
    "/home/",
    "/var/lib/",
    "/opt/portal",
    "token=",
    "secret=",
    "password=",
    "roadmap-task-board-api:8000",
)


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _app():
    app = create_app()
    return app


def _client(app):
    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    )


# ------------------------------------------------------------ sanitization


def test_request_id_and_traceparent_sanitizers() -> None:
    assert REQUEST_ID_PATTERN.fullmatch(generate_request_id())
    assert TRACEPARENT_PATTERN.fullmatch(generate_traceparent())

    assert safe_request_id("abc-123.ABC") == "abc-123.ABC"
    assert safe_request_id(None) != "abc-123.ABC"
    for unsafe in ("../../etc", "a" * 200, "with spaces", "vélo"):
        assert safe_request_id(unsafe) != unsafe

    valid_traceparent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    assert safe_traceparent(valid_traceparent) == valid_traceparent
    for unsafe in ("not-a-trace", "x" * 200, valid_traceparent.upper()):
        assert safe_traceparent(unsafe) != unsafe


# ------------------------------------------------------------- correlation


@pytest.mark.anyio
async def test_middleware_creates_and_echoes_correlation_headers() -> None:
    app = _app()
    try:
        async with _client(app) as client:
            response = await client.get("/api/health")
    finally:
        app.state.run_manager.shutdown()

    request_id = response.headers["x-request-id"]
    traceparent = response.headers["traceparent"]
    assert REQUEST_ID_PATTERN.fullmatch(request_id)
    assert TRACEPARENT_PATTERN.fullmatch(traceparent)


@pytest.mark.anyio
async def test_middleware_propagates_valid_incoming_correlation() -> None:
    app = _app()
    try:
        async with _client(app) as client:
            response = await client.get(
                "/api/health",
                headers={
                    "X-Request-ID": "nginx-request-123",
                    "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
                },
            )
    finally:
        app.state.run_manager.shutdown()

    assert response.headers["x-request-id"] == "nginx-request-123"
    assert (
        response.headers["traceparent"]
        == "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    )


@pytest.mark.anyio
async def test_middleware_replaces_unsafe_incoming_correlation() -> None:
    app = _app()
    try:
        async with _client(app) as client:
            response = await client.get(
                "/api/health",
                headers={
                    "X-Request-ID": "../../etc/passwd",
                    "traceparent": "spoofed",
                },
            )
    finally:
        app.state.run_manager.shutdown()

    assert response.headers["x-request-id"] != "../../etc/passwd"
    assert REQUEST_ID_PATTERN.fullmatch(response.headers["x-request-id"])
    assert TRACEPARENT_PATTERN.fullmatch(response.headers["traceparent"])


# ------------------------------------------------------------- diagnostics


@pytest.mark.anyio
async def test_diagnostics_reports_safe_dependency_states() -> None:
    app = _app()
    try:
        async with _client(app) as client:
            response = await client.get("/api/diagnostics")
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "portal-api"
    assert REQUEST_ID_PATTERN.fullmatch(payload["request_id"])
    assert TRACEPARENT_PATTERN.fullmatch(payload["traceparent"])
    assert payload["request_id"] == response.headers["x-request-id"]

    dependencies = payload["dependencies"]
    assert dependencies["registry"]["state"] == "ready"
    assert dependencies["registry"]["digest"].startswith("sha256:")
    assert dependencies["artifact_store"]["state"] == "available"
    assert dependencies["historical_data"] == {
        "state": "disabled",
        "detail": None,
        "mode": "disabled",
        "datasets": 0,
    }
    assert dependencies["quantbt_engine"]["state"] == "available"
    assert dependencies["planning_summary"]["mode"] == "local"
    assert dependencies["run_worker"]["state"] == "available"
    assert dependencies["run_worker"]["max_workers"] == 1

    encoded = json.dumps(payload)
    for marker in REDACTED_MARKERS:
        assert marker not in encoded


@pytest.mark.anyio
async def test_diagnostics_shows_planning_api_mode_and_ingress_metadata(
    monkeypatch,
) -> None:
    monkeypatch.setenv("PORTAL_PLANNING_SUMMARY_MODE", "api")
    monkeypatch.setenv(
        "PORTAL_PLANNING_API_BASE_URL", "http://roadmap-task-board-api:8000"
    )
    app = _app()
    try:
        async with _client(app) as client:
            response = await client.get(
                "/api/diagnostics",
                headers={
                    "X-Forwarded-Proto": "https",
                    "X-Forwarded-For": "203.0.113.7",
                },
            )
    finally:
        app.state.run_manager.shutdown()

    payload = response.json()
    assert payload["dependencies"]["planning_summary"] == {
        "state": "available",
        "detail": None,
        "mode": "api",
    }
    assert payload["ingress"] == {
        "forwarded_proto": "https",
        "forwarded_for_present": True,
    }


def test_diagnostics_model_rejects_unknown_fields() -> None:
    from portal_api.domain.responses import DiagnosticsResponse

    with pytest.raises(Exception):
        DiagnosticsResponse.model_validate({"unexpected": True})


# ------------------------------------------------------------ error bodies


@pytest.mark.anyio
async def test_domain_validation_error_includes_request_id(run_request) -> None:
    payload = run_request.model_dump(mode="json")
    payload["dataset_id"] = "missing"
    app = _app()
    try:
        async with _client(app) as client:
            response = await client.post("/api/runs/preflight", json=payload)
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 200
    payload = response.json()
    assert payload["valid"] is False
    dataset_check = next(item for item in payload["checks"] if item["id"] == "dataset")
    assert dataset_check["ok"] is False
    # Preflight carries the ingress request_id for correlation even on 200.
    assert REQUEST_ID_PATTERN.fullmatch(payload["request_id"])
    assert payload["request_id"] == response.headers["x-request-id"]


@pytest.mark.anyio
async def test_http_error_and_validation_error_bodies_include_request_id() -> None:
    app = _app()
    try:
        async with _client(app) as client:
            missing = await client.get("/api/runs/does_not_exist")
            invalid = await client.post("/api/runs", json={"not": "a request"})
    finally:
        app.state.run_manager.shutdown()

    assert missing.status_code == 404
    assert missing.json()["detail"] == "run not found"
    assert REQUEST_ID_PATTERN.fullmatch(missing.json()["request_id"])
    assert missing.json()["request_id"] == missing.headers["x-request-id"]

    assert invalid.status_code == 422
    assert isinstance(invalid.json()["detail"], list)
    assert REQUEST_ID_PATTERN.fullmatch(invalid.json()["request_id"])


@pytest.mark.anyio
async def test_summary_internal_failure_body_includes_request_id() -> None:
    from portal_api.domain.portal_summary import (
        AvailabilityAuthority,
        AvailabilityProvenance,
        CapabilityAvailability,
        PortalSummaryContribution,
        PortalSummarySection,
    )
    from portal_api.services.portal_overview import (
        PortalSummaryService,
        PortalSummarySettings,
    )
    from portal_api.services.portal_registry import PortalRegistryService
    from portal_api.repositories.portal_registry import PortalRegistryRepository
    from datetime import UTC, datetime

    PORTAL_ROOT = Path(__file__).resolve().parents[2]
    REGISTRY_ROOT = PORTAL_ROOT / "registry"

    class GarbageAdapter:
        source_id = "garbage_current"

        async def collect(self, context, *, deadline):
            del context, deadline
            return {"not": "a contribution"}

        def unavailable_contribution(self, *, reason_code, checked_at):
            checked = checked_at or datetime.now(UTC)
            return PortalSummaryContribution(
                section=PortalSummarySection(
                    source_id=self.source_id,
                    feature_id="QUANTBT_RESEARCH",
                    label=self.source_id,
                    availability=CapabilityAvailability(
                        state="unavailable",
                        reason_code=reason_code,
                        detail=None,
                        retryable=True,
                        checked_at=checked,
                        as_of=None,
                        stale_after_seconds=None,
                        authority=AvailabilityAuthority(
                            service="portal-api", contract="test.v1", endpoint=None
                        ),
                        provenance=AvailabilityProvenance(
                            source_revision=None, content_digest=None
                        ),
                    ),
                    metrics={},
                    recent_items=(),
                    warnings=(),
                ),
                priority_items=(),
            )

    app = _app()
    app.state.portal_summary_service = PortalSummaryService(
        registry_service=PortalRegistryService(
            PortalRegistryRepository(REGISTRY_ROOT)
        ),
        adapters=(GarbageAdapter(),),
        settings=PortalSummarySettings(deadline_seconds=0.5, environment="research"),
    )
    try:
        async with _client(app) as client:
            response = await client.get("/api/v1/portal/summary")
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 500
    payload = response.json()
    assert payload["error"]["code"] == "SUMMARY_CONTRACT_FAILURE"
    assert REQUEST_ID_PATTERN.fullmatch(payload["request_id"])
    encoded = json.dumps(payload)
    for marker in REDACTED_MARKERS:
        assert marker not in encoded


# -------------------------------------------------------------------- SSE


@pytest.mark.anyio
async def test_sse_endpoint_preserves_streaming_headers() -> None:
    app = _app()
    try:
        async with _client(app) as client:
            response = await client.get("/api/runs/does_not_exist/events")
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-accel-buffering"] == "no"
    assert REQUEST_ID_PATTERN.fullmatch(response.headers["x-request-id"])
    assert "RUN_NOT_FOUND" in response.text


# ---------------------------------------------------------------- gateway


def test_gateway_forward_correlates_and_preserves_sse() -> None:
    conf = NGINX_CONF.read_text(encoding="utf-8")

    assert "proxy_set_header X-Request-ID $request_id;" in conf
    assert "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;" in conf
    assert "proxy_set_header X-Forwarded-Proto $scheme;" in conf
    assert re.search(r"location ~ \^/api/runs/\[\^/\]\+/events\$", conf)
    assert "proxy_buffering off;" in conf
    assert "proxy_cache off;" in conf
    assert "proxy_set_header Connection '';" in conf
    assert "proxy_read_timeout 3600s;" in conf
