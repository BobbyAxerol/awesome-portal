from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from portal_api.adapters.planning_summary import (
    PlanningSummaryAdapter,
    PlanningSummaryHTTPClient,
    PlanningSummaryRoutes,
    PlanningSummarySettings,
)
from portal_api.domain.portal_summary import SummaryContext
from portal_api.main import create_app
from portal_api.repositories.portal_registry import PortalRegistryRepository


PORTAL_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_ROOT = PORTAL_ROOT / "registry"
SCHEMA_ROOT = REGISTRY_ROOT / "schemas"
CHECKED_AT = datetime(2026, 8, 15, 17, 0, tzinfo=UTC)
TASK_STATUSES = ("Backlog", "Ready", "In Progress", "Validating", "Done")


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


SOURCE_SCHEMA = _load_json(SCHEMA_ROOT / "portal-registry-source.v1.schema.json")
SUMMARY_SCHEMA = _load_json(SCHEMA_ROOT / "portal-summary.v1.schema.json")
SCHEMA_REGISTRY = Registry().with_resources(
    (
        (SOURCE_SCHEMA["$id"], Resource.from_contents(SOURCE_SCHEMA)),
        (SUMMARY_SCHEMA["$id"], Resource.from_contents(SUMMARY_SCHEMA)),
    )
)


def _validate_section(document: dict[str, object]) -> None:
    validator = Draft202012Validator(
        {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$ref": f"{SUMMARY_SCHEMA['$id']}#/$defs/section",
        },
        registry=SCHEMA_REGISTRY,
        format_checker=FormatChecker(),
    )
    errors = list(validator.iter_errors(document))
    assert not errors, "\n".join(error.message for error in errors)


def _routes() -> PlanningSummaryRoutes:
    registry = PortalRegistryRepository(REGISTRY_ROOT).load().document
    return PlanningSummaryRoutes.from_registry(registry)


def _context() -> SummaryContext:
    return SummaryContext(
        registry_digest=f"sha256:{'2' * 64}",
        environment="research",
        requested_at=CHECKED_AT,
    )


def _source_payload(
    *,
    counts: dict[str, int] | None = None,
    roadmap_count: int = 0,
    recent_tasks: list[dict[str, object]] | None = None,
    recent_roadmap: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    task_counts = counts or {status: 0 for status in TASK_STATUSES}
    return {
        "schema_version": "planning.summary.v1",
        "observed_at": CHECKED_AT.isoformat(),
        "total_tasks": sum(task_counts.values()),
        "task_counts": task_counts,
        "roadmap_phase_count": roadmap_count,
        "recent_tasks": recent_tasks or [],
        "recent_roadmap": recent_roadmap or [],
    }


def _settings(**overrides: object) -> PlanningSummarySettings:
    values: dict[str, object] = {
        "mode": "api",
        "api_base_url": "http://roadmap-task-board-api:8000",
        "request_timeout_seconds": 0.5,
        "max_response_bytes": 64 * 1024,
    }
    values.update(overrides)
    return PlanningSummarySettings(**values)  # type: ignore[arg-type]


async def _collect(
    handler,
    *,
    settings: PlanningSummarySettings | None = None,
    deadline_offset: float = 1,
):
    client = PlanningSummaryHTTPClient(
        settings or _settings(),
        transport=httpx.MockTransport(handler),
    )
    adapter = PlanningSummaryAdapter(
        mode="api",
        reader=client,
        routes=_routes(),
        clock=lambda: CHECKED_AT,
    )
    try:
        contribution = await adapter.collect(
            _context(),
            deadline=asyncio.get_running_loop().time() + deadline_offset,
        )
    finally:
        await adapter.aclose()
    _validate_section(contribution.section.model_dump(mode="json"))
    return contribution


def test_planning_routes_are_derived_from_registry() -> None:
    routes = _routes()

    assert routes.roadmap == "/planning/roadmap"
    assert routes.task_board == "/planning/board"


@pytest.mark.parametrize(
    "base_url",
    [
        "file:///srv/private",
        "http://user:secret@planning:8000",
        "http://planning:8000/private",
        "http://planning:8000?target=other",
        "http://planning:8000#fragment",
    ],
)
def test_http_client_rejects_non_origin_or_credentialed_base_url(base_url: str) -> None:
    with pytest.raises(ValueError):
        PlanningSummaryHTTPClient(_settings(api_base_url=base_url))


def test_settings_reject_invalid_mode_timeout_limit_and_missing_api_url() -> None:
    with pytest.raises(ValueError, match="mode"):
        PlanningSummarySettings(mode="other")  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="base URL"):
        PlanningSummarySettings(mode="api")
    with pytest.raises(ValueError, match="timeout"):
        _settings(request_timeout_seconds=2.1)
    with pytest.raises(ValueError, match="response limit"):
        _settings(max_response_bytes=1000)


@pytest.mark.anyio
async def test_api_empty_state_is_available_with_truthful_zeros() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_source_payload(), request=request)

    contribution = await _collect(handler)
    section = contribution.section

    assert section.availability.state == "available"
    assert section.metrics["total_tasks"].value == 0
    assert section.metrics["tasks_backlog"].value == 0
    assert section.metrics["roadmap_phase_count"].value == 0
    assert section.metrics["current_phase_id"].value is None
    assert (
        section.metrics["current_phase_id"].availability.reason_code
        == "CAPABILITY_NOT_IMPLEMENTED"
    )
    assert section.recent_items == ()
    assert section.warnings == ()
    assert contribution.priority_items == ()


@pytest.mark.anyio
async def test_healthy_counts_and_recent_links_are_exact_bounded_and_content_minimal() -> None:
    counts = {
        "Backlog": 4,
        "Ready": 3,
        "In Progress": 2,
        "Validating": 1,
        "Done": 9,
    }
    recent_tasks = [
        {
            "id": f"TASK-{index}",
            "status": status,
            "updated_at": (CHECKED_AT + timedelta(minutes=index)).isoformat(),
        }
        for index, status in enumerate(TASK_STATUSES)
    ]
    recent_roadmap = [
        {
            "id": f"PHASE-{index}",
            "updated_at": (CHECKED_AT + timedelta(minutes=10 + index)).isoformat(),
        }
        for index in range(2)
    ]

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=_source_payload(
                counts=counts,
                roadmap_count=7,
                recent_tasks=recent_tasks,
                recent_roadmap=recent_roadmap,
            ),
            request=request,
        )

    contribution = await _collect(handler)
    section = contribution.section
    metrics = section.metrics

    assert metrics["total_tasks"].value == 19
    assert metrics["tasks_backlog"].value == 4
    assert metrics["tasks_ready"].value == 3
    assert metrics["tasks_in_progress"].value == 2
    assert metrics["tasks_validating"].value == 1
    assert metrics["tasks_done"].value == 9
    assert metrics["roadmap_phase_count"].value == 7
    assert len(section.recent_items) == 5
    assert section.recent_items[0].id == "planning-roadmap:PHASE-1"
    assert section.recent_items[0].route == "/planning/roadmap"
    assert all("private" not in item.label.lower() for item in section.recent_items)
    assert contribution.priority_items == ()
    forbidden = {"blocker", "incident", "pnl", "deployment", "account", "notes"}
    payload = contribution.model_dump_json().lower()
    assert not any(token in payload for token in forbidden)


@pytest.mark.anyio
async def test_local_mode_never_calls_reader_and_never_guesses_server_counts() -> None:
    class Reader:
        async def read_planning_summary(self, *, deadline: float):
            del deadline
            raise AssertionError("local mode must not call the Planning API")

    adapter = PlanningSummaryAdapter(
        mode="local",
        reader=Reader(),
        routes=_routes(),
        clock=lambda: CHECKED_AT,
    )
    contribution = await adapter.collect(_context(), deadline=0)
    section = contribution.section

    _validate_section(section.model_dump(mode="json"))
    assert section.availability.state == "unavailable"
    assert section.availability.reason_code == "LOCAL_ONLY_STATE"
    assert all(metric.value is None for metric in section.metrics.values())
    assert section.warnings[0].code == "PLANNING_LOCAL_ONLY"
    assert contribution.priority_items == ()


@pytest.mark.anyio
async def test_request_is_fixed_get_without_actor_body_redirect_or_dynamic_host() -> None:
    seen: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=_source_payload(), request=request)

    await _collect(handler)

    assert len(seen) == 1
    request = seen[0]
    assert request.method == "GET"
    assert str(request.url) == (
        "http://roadmap-task-board-api:8000/api/v1/summary?recent_limit=5"
    )
    assert request.content == b""
    assert "X-Portal-Actor" not in request.headers
    assert request.headers["Accept"] == "application/json"


@pytest.mark.anyio
async def test_expired_deadline_does_not_send_request() -> None:
    calls = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=_source_payload(), request=request)

    contribution = await _collect(handler, deadline_offset=-1)

    assert calls == 0
    assert contribution.section.availability.reason_code == "UPSTREAM_TIMEOUT"
    assert contribution.section.metrics["total_tasks"].value is None


@pytest.mark.anyio
async def test_timeout_and_connect_failures_are_safe_unavailable_evidence() -> None:
    async def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("secret at /srv/private", request=request)

    timed_out = await _collect(timeout)
    assert timed_out.section.availability.reason_code == "UPSTREAM_TIMEOUT"
    assert timed_out.section.availability.retryable is True

    async def connect(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("token=secret at planning.internal", request=request)

    unavailable = await _collect(connect)
    payload = unavailable.model_dump_json()
    assert unavailable.section.availability.reason_code == "UPSTREAM_UNAVAILABLE"
    assert unavailable.section.metrics["total_tasks"].value is None
    assert "/srv/private" not in payload
    assert "token=secret" not in payload
    assert "planning.internal" not in payload


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("status_code", "state", "reason_code", "retryable"),
    [
        (403, "denied", "PERMISSION_DENIED", False),
        (404, "unavailable", "INCOMPATIBLE_CONTRACT", False),
        (408, "unavailable", "UPSTREAM_TIMEOUT", True),
        (429, "unavailable", "UPSTREAM_UNAVAILABLE", True),
        (500, "unavailable", "UPSTREAM_UNAVAILABLE", True),
        (504, "unavailable", "UPSTREAM_TIMEOUT", True),
        (503, "unavailable", "UPSTREAM_UNAVAILABLE", True),
    ],
)
async def test_http_status_mapping(
    status_code: int,
    state: str,
    reason_code: str,
    retryable: bool,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            status_code,
            text="secret internal upstream detail",
            request=request,
        )

    contribution = await _collect(handler)
    payload = contribution.model_dump_json()

    assert contribution.section.availability.state == state
    assert contribution.section.availability.reason_code == reason_code
    assert contribution.section.availability.retryable is retryable
    assert "secret internal upstream detail" not in payload


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("content", "content_type"),
    [
        (b"not-json", "application/json"),
        (json.dumps(_source_payload()).encode(), "text/html"),
        (b"\xff", "application/json"),
    ],
)
async def test_malformed_encoding_or_content_type_is_incompatible(
    content: bytes,
    content_type: str,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=content,
            headers={"content-type": content_type},
            request=request,
        )

    contribution = await _collect(handler)

    assert contribution.section.availability.reason_code == "INCOMPATIBLE_CONTRACT"
    assert contribution.section.metrics["total_tasks"].value is None


@pytest.mark.anyio
@pytest.mark.parametrize(
    "mutate",
    [
        lambda payload: payload | {"unexpected": "field"},
        lambda payload: payload | {"schema_version": "planning.summary.v2"},
        lambda payload: payload | {"task_counts": {"Backlog": 0}},
        lambda payload: payload | {"total_tasks": 99},
        lambda payload: payload | {"total_tasks": "0"},
        lambda payload: payload
        | {"task_counts": {status: False for status in TASK_STATUSES}},
        lambda payload: payload | {"observed_at": "2026-08-15T17:00:00"},
        lambda payload: payload
        | {
            "recent_tasks": [
                {
                    "id": "../../unsafe",
                    "status": "Backlog",
                    "updated_at": CHECKED_AT.isoformat(),
                }
            ]
        },
    ],
)
async def test_strict_source_contract_rejects_unknown_or_inconsistent_payload(mutate) -> None:
    payload = mutate(_source_payload())

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload, request=request)

    contribution = await _collect(handler)

    assert contribution.section.availability.reason_code == "INCOMPATIBLE_CONTRACT"
    assert all(metric.value is None for metric in contribution.section.metrics.values())


class ChunkStream(httpx.AsyncByteStream):
    async def __aiter__(self):
        yield b"{"
        yield b"x" * 1024


@pytest.mark.anyio
@pytest.mark.parametrize("declared", [True, False])
async def test_oversized_declared_or_streamed_response_is_incompatible(
    declared: bool,
) -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        if declared:
            return httpx.Response(
                200,
                content=b"x" * 1025,
                headers={"content-type": "application/json"},
                request=request,
            )
        return httpx.Response(
            200,
            stream=ChunkStream(),
            headers={"content-type": "application/json"},
            request=request,
        )

    contribution = await _collect(
        handler,
        settings=_settings(max_response_bytes=1024),
    )

    assert contribution.section.availability.reason_code == "INCOMPATIBLE_CONTRACT"
    assert contribution.section.metrics["total_tasks"].value is None


@pytest.mark.anyio
async def test_client_cancellation_propagates_to_in_flight_request() -> None:
    started = asyncio.Event()
    cancelled = asyncio.Event()
    never = asyncio.Event()

    async def handler(request: httpx.Request) -> httpx.Response:
        del request
        started.set()
        try:
            await never.wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise
        raise AssertionError("unreachable")

    client = PlanningSummaryHTTPClient(
        _settings(),
        transport=httpx.MockTransport(handler),
    )
    adapter = PlanningSummaryAdapter(
        mode="api",
        reader=client,
        routes=_routes(),
        clock=lambda: CHECKED_AT,
    )
    task = asyncio.create_task(
        adapter.collect(
            _context(),
            deadline=asyncio.get_running_loop().time() + 1,
        )
    )
    await started.wait()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await adapter.aclose()

    assert cancelled.is_set()


def test_adapter_has_no_planning_import_sqlite_or_actor_impersonation() -> None:
    source = (
        PORTAL_ROOT
        / "backend/src/portal_api/adapters/planning_summary.py"
    ).read_text(encoding="utf-8")

    assert "backend.app" not in source
    assert "sqlite" not in source.lower()
    assert "X-Portal-Actor" not in source


@pytest.mark.anyio
async def test_be4_stays_internal_in_local_mode_served_through_be5_aggregator(
    monkeypatch,
) -> None:
    monkeypatch.setenv("PORTAL_PLANNING_SUMMARY_MODE", "local")
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/v1/portal/summary")
    finally:
        await app.state.planning_summary_adapter.aclose()
        app.state.run_manager.shutdown()

    assert isinstance(app.state.planning_summary_adapter, PlanningSummaryAdapter)
    assert response.status_code == 200
    sections = {section["source_id"]: section for section in response.json()["sections"]}
    planning = sections["planning_current"]
    assert planning["availability"]["reason_code"] == "LOCAL_ONLY_STATE"
    assert all(metric["value"] is None for metric in planning["metrics"].values())
