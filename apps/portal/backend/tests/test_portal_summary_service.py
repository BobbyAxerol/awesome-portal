from __future__ import annotations

import asyncio
import json
import shutil
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Callable

import httpx
import pytest
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import ValidationError
from referencing import Registry, Resource

from portal_api.adapters.planning_summary import (
    PlanningSummaryAdapter,
    PlanningSummaryHTTPClient,
    PlanningSummaryRoutes,
    PlanningSummarySettings,
)
from portal_api.adapters.quantbt_summary import (
    HistoricalCapabilityReader,
    QuantBTSummaryAdapter,
    QuantBTSummaryRoutes,
)
from portal_api.domain.portal_summary import (
    AvailabilityAuthority,
    AvailabilityProvenance,
    CapabilityAvailability,
    CurrentRunInventory,
    CurrentRunSnapshot,
    EvidenceValue,
    HistoricalCapabilitySnapshot,
    PortalSummaryContribution,
    PortalSummarySection,
    PortalSummaryV1,
    PriorityItem,
    SummaryContext,
    SummaryLinkItem,
)
from portal_api.main import create_app
from portal_api.repositories.portal_registry import PortalRegistryRepository
from portal_api.services.portal_overview import (
    PortalSummaryContractError,
    PortalSummaryService,
    PortalSummarySettings,
)
from portal_api.services.portal_registry import PortalRegistryService


PORTAL_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_ROOT = PORTAL_ROOT / "registry"
SCHEMA_ROOT = REGISTRY_ROOT / "schemas"
CHECKED_AT = datetime(2026, 8, 15, 18, 0, tzinfo=UTC)
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


def _validate_summary(document: dict[str, object]) -> None:
    validator = Draft202012Validator(
        SUMMARY_SCHEMA,
        registry=SCHEMA_REGISTRY,
        format_checker=FormatChecker(),
    )
    errors = list(validator.iter_errors(document))
    assert not errors, "\n".join(error.message for error in errors)


def _registry_service(registry_root: Path = REGISTRY_ROOT) -> PortalRegistryService:
    return PortalRegistryService(PortalRegistryRepository(registry_root))


def _availability(
    *,
    state: str,
    checked_at: datetime = CHECKED_AT,
    reason_code: str | None = None,
    retryable: bool = False,
) -> CapabilityAvailability:
    return CapabilityAvailability(
        state=state,
        reason_code=reason_code,
        detail=None,
        retryable=retryable,
        checked_at=checked_at,
        as_of=checked_at if state in {"available", "degraded", "stale"} else None,
        stale_after_seconds=None,
        authority=AvailabilityAuthority(
            service="portal-api", contract="test.v1", endpoint=None
        ),
        provenance=AvailabilityProvenance(source_revision=None, content_digest=None),
    )


def _section(
    source_id: str,
    *,
    state: str = "available",
    reason_code: str | None = None,
    metrics: dict[str, EvidenceValue] | None = None,
    feature_id: str = "QUANTBT_RESEARCH",
    recent_items: tuple[SummaryLinkItem, ...] = (),
) -> PortalSummarySection:
    return PortalSummarySection(
        source_id=source_id,
        feature_id=feature_id,
        label=source_id,
        availability=_availability(state=state, reason_code=reason_code),
        metrics=metrics or {},
        recent_items=recent_items,
        warnings=(),
    )


def _contribution(
    section: PortalSummarySection,
    priorities: tuple[PriorityItem, ...] = (),
) -> PortalSummaryContribution:
    return PortalSummaryContribution(section=section, priority_items=priorities)


class FakeAdapter:
    """Deterministic in-memory adapter honoring the PortalSummaryAdapter port."""

    def __init__(
        self,
        source_id: str,
        contribution: PortalSummaryContribution,
        *,
        feature_id: str = "QUANTBT_RESEARCH",
    ) -> None:
        self.source_id = source_id
        self._contribution = contribution
        self._feature_id = feature_id
        self.calls = 0
        self.last_context: SummaryContext | None = None
        self.last_deadline: float | None = None

    async def collect(
        self,
        context: SummaryContext,
        *,
        deadline: float,
    ) -> PortalSummaryContribution:
        self.calls += 1
        self.last_context = context
        self.last_deadline = deadline
        await asyncio.sleep(0)
        return self._contribution

    def unavailable_contribution(
        self,
        *,
        reason_code: str,
        checked_at: datetime,
    ) -> PortalSummaryContribution:
        return _contribution(
            _section(
                self.source_id,
                state="unavailable",
                reason_code=reason_code,
                feature_id=self._feature_id,
            )
        )


class EventfulAdapter:
    """Adapter that records lifecycle events for concurrency/deadline tests."""

    def __init__(
        self,
        source_id: str,
        contribution: PortalSummaryContribution,
        *,
        feature_id: str = "PLANNING",
        started: asyncio.Event | None = None,
        wait_on: asyncio.Event | None = None,
        delay: float = 0,
        on_cancel: asyncio.Event | None = None,
        record_end: list[float] | None = None,
        loop: asyncio.AbstractEventLoop,
    ) -> None:
        self.source_id = source_id
        self._contribution = contribution
        self._feature_id = feature_id
        self._started = started
        self._wait_on = wait_on
        self._delay = delay
        self._on_cancel = on_cancel
        self._record_end = record_end
        self._loop = loop

    async def collect(
        self,
        context: SummaryContext,
        *,
        deadline: float,
    ) -> PortalSummaryContribution:
        del context, deadline
        if self._started is not None:
            self._started.set()
        try:
            if self._wait_on is not None:
                await self._wait_on.wait()
            if self._delay:
                await asyncio.sleep(self._delay)
        except asyncio.CancelledError:
            if self._on_cancel is not None:
                self._on_cancel.set()
            raise
        if self._record_end is not None:
            self._record_end.append(self._loop.time())
        return self._contribution

    def unavailable_contribution(
        self,
        *,
        reason_code: str,
        checked_at: datetime,
    ) -> PortalSummaryContribution:
        return _contribution(
            _section(
                self.source_id,
                state="unavailable",
                reason_code=reason_code,
                feature_id=self._feature_id,
            )
        )


class StubRunPort:
    def __init__(self, result=()) -> None:
        self.result = result

    def read_current_runs(self, *, limit: int):
        if isinstance(self.result, BaseException):
            raise self.result
        if isinstance(self.result, CurrentRunInventory):
            return self.result
        ordered = tuple(
            sorted(
                self.result,
                key=lambda run: run.observed_at.timestamp()
                if run.observed_at
                else float("-inf"),
                reverse=True,
            )
        )
        return CurrentRunInventory(
            total_runs=len(ordered),
            state_counts=Counter(run.status for run in ordered),
            recent_runs=ordered[:limit],
            truncated=len(ordered) > limit,
        )


class StubHistoricalPort:
    def __init__(self, result: object | None = None) -> None:
        self.result = result or HistoricalCapabilitySnapshot(
            state="available",
            dataset_count=1,
            dataset_ids=("crypto-binance-1m",),
            source_revision="0.1.0rc3",
        )

    def read_historical_capability(self):
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


def _run(run_id: str, status: str, *, minutes: int) -> CurrentRunSnapshot:
    created_at = CHECKED_AT + timedelta(minutes=minutes)
    completed_at = (
        created_at + timedelta(seconds=30)
        if status in {"COMPLETED", "FAILED", "CANCELLED"}
        else None
    )
    return CurrentRunSnapshot(
        run_id=run_id,
        status=status,
        protocol="three_window_decay",
        strategy_id="delta-rsi-polynomial-alpha",
        symbol="ETHUSDT",
        timeframe="1h",
        created_at=created_at,
        completed_at=completed_at,
    )


def _quantbt_adapter(
    runs=(),
    historical: object | None = None,
) -> QuantBTSummaryAdapter:
    return QuantBTSummaryAdapter(
        run_reader=StubRunPort(runs),
        historical_reader=StubHistoricalPort(historical),
        routes=QuantBTSummaryRoutes.from_registry(
            _registry_service().document
        ),
        clock=lambda: CHECKED_AT,
    )


def _planning_source_payload(
    *,
    counts: dict[str, int] | None = None,
    roadmap_count: int = 0,
) -> dict[str, object]:
    task_counts = counts or {status: 0 for status in TASK_STATUSES}
    return {
        "schema_version": "planning.summary.v1",
        "observed_at": CHECKED_AT.isoformat(),
        "total_tasks": sum(task_counts.values()),
        "task_counts": task_counts,
        "roadmap_phase_count": roadmap_count,
        "recent_tasks": [],
        "recent_roadmap": [],
    }


def _planning_adapter(
    handler,
    *,
    settings: PlanningSummarySettings | None = None,
) -> PlanningSummaryAdapter:
    client = PlanningSummaryHTTPClient(
        settings
        or PlanningSummarySettings(
            mode="api",
            api_base_url="http://roadmap-task-board-api:8000",
            request_timeout_seconds=0.5,
            max_response_bytes=64 * 1024,
        ),
        transport=httpx.MockTransport(handler),
    )
    return PlanningSummaryAdapter(
        mode="api",
        reader=client,
        routes=PlanningSummaryRoutes.from_registry(_registry_service().document),
        clock=lambda: CHECKED_AT,
    )


def _service(
    *adapters,
    registry_service: PortalRegistryService | None = None,
    settings: PortalSummarySettings | None = None,
) -> PortalSummaryService:
    return PortalSummaryService(
        registry_service=registry_service or _registry_service(),
        adapters=adapters,
        settings=settings
        or PortalSummarySettings(deadline_seconds=0.5, environment="research"),
        clock=lambda: CHECKED_AT,
    )


async def _healthy_adapters() -> tuple[QuantBTSummaryAdapter, PlanningSummaryAdapter]:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_planning_source_payload(), request=request)

    return _quantbt_adapter(), _planning_adapter(handler)


async def _collect(*adapters, settings=None):
    service = _service(*adapters, settings=settings)
    try:
        return await service.collect_summary(requested_at=CHECKED_AT)
    finally:
        await service.aclose()


def _registry_root(
    tmp_path: Path,
    mutate: Callable[[dict[str, object]], None] | None = None,
) -> Path:
    root = tmp_path / "registry"
    shutil.copytree(REGISTRY_ROOT, root)
    source = _load_json(REGISTRY_ROOT / "registry.json")
    if mutate is not None:
        mutate(source)
    (root / "registry.json").write_text(
        json.dumps(source, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return root


# ---------------------------------------------------------------- settings


def test_settings_enforce_deadline_range_and_environment() -> None:
    with pytest.raises(ValueError, match="deadline"):
        PortalSummarySettings(deadline_seconds=0.05)
    with pytest.raises(ValueError, match="deadline"):
        PortalSummarySettings(deadline_seconds=2.5)
    with pytest.raises(ValueError, match="environment"):
        PortalSummarySettings(environment="production")  # type: ignore[arg-type]

    assert PortalSummarySettings(deadline_seconds=0.1).deadline_seconds == 0.1
    assert PortalSummarySettings(deadline_seconds=2.0).deadline_seconds == 2.0


def test_settings_read_environment_with_safe_defaults(monkeypatch) -> None:
    monkeypatch.setenv("PORTAL_SUMMARY_DEADLINE_MS", "700")
    monkeypatch.setenv("PORTAL_ENVIRONMENT", "paper")
    settings = PortalSummarySettings.from_environment()

    assert settings.deadline_seconds == 0.7
    assert settings.environment == "paper"

    monkeypatch.delenv("PORTAL_SUMMARY_DEADLINE_MS")
    monkeypatch.delenv("PORTAL_ENVIRONMENT")
    defaults = PortalSummarySettings.from_environment()
    assert defaults.deadline_seconds == 0.5
    assert defaults.environment == "research"

    monkeypatch.setenv("PORTAL_SUMMARY_DEADLINE_MS", "fast")
    with pytest.raises(ValueError, match="integer"):
        PortalSummarySettings.from_environment()


# ------------------------------------------------- healthy and empty paths


@pytest.mark.anyio
async def test_healthy_sources_produce_available_schema_valid_summary() -> None:
    quantbt, planning = await _healthy_adapters()
    summary = await _collect(quantbt, planning)

    assert isinstance(summary, PortalSummaryV1)
    assert summary.schema_version == "portal.summary.v1"
    assert summary.registry_digest == _registry_service().document.content_digest
    assert summary.environment == "research"
    assert summary.requested_at == CHECKED_AT
    assert summary.overall_availability.state == "available"
    assert [section.source_id for section in summary.sections] == [
        "quantbt_current",
        "planning_current",
    ]
    assert all(
        section.availability.state == "available" for section in summary.sections
    )
    assert summary.registry_counts.by_maturity["AVAILABLE"] == 2
    assert summary.registry_counts.by_maturity["PROTOTYPE"] == 2
    assert summary.registry_counts.by_maturity["COMMISSIONED"] == 18
    assert summary.registry_counts.blocking_concerns == 5
    payload = summary.model_dump(mode="json")
    _validate_summary(payload)
    assert len(json.dumps(payload).encode("utf-8")) < 50 * 1024


@pytest.mark.anyio
async def test_empty_authoritative_sources_are_available_with_truthful_zeros() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_planning_source_payload(), request=request)

    summary = await _collect(_quantbt_adapter(()), _planning_adapter(handler))

    assert summary.overall_availability.state == "available"
    quantbt = next(
        section for section in summary.sections if section.source_id == "quantbt_current"
    )
    planning = next(
        section for section in summary.sections if section.source_id == "planning_current"
    )
    assert quantbt.metrics["total_runs"].value == 0
    assert planning.metrics["total_tasks"].value == 0
    _validate_summary(summary.model_dump(mode="json"))


# ------------------------------------------------- planning failure mapping


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("handler", "expected_reason"),
    [
        (
            "timeout",
            "UPSTREAM_TIMEOUT",
        ),
        (
            "connect",
            "UPSTREAM_UNAVAILABLE",
        ),
        (
            "status_500",
            "UPSTREAM_UNAVAILABLE",
        ),
        (
            "malformed",
            "INCOMPATIBLE_CONTRACT",
        ),
        (
            "oversized",
            "INCOMPATIBLE_CONTRACT",
        ),
    ],
)
async def test_planning_failures_preserve_healthy_quantbt_evidence(
    handler: str,
    expected_reason: str,
) -> None:
    def make_handler(kind: str):
        async def inner(request: httpx.Request) -> httpx.Response:
            if kind == "timeout":
                raise httpx.ReadTimeout("secret at /srv/private", request=request)
            if kind == "connect":
                raise httpx.ConnectError(
                    "token=secret at planning.internal", request=request
                )
            if kind == "status_500":
                return httpx.Response(
                    500, text="secret internal upstream detail", request=request
                )
            if kind == "malformed":
                return httpx.Response(
                    200,
                    content=b"not-json",
                    headers={"content-type": "application/json"},
                    request=request,
                )
            return httpx.Response(
                200,
                content=b"x" * 1025,
                headers={"content-type": "application/json"},
                request=request,
            )

        return inner

    planning = _planning_adapter(
        make_handler(handler),
        settings=PlanningSummarySettings(
            mode="api",
            api_base_url="http://roadmap-task-board-api:8000",
            request_timeout_seconds=0.5,
            max_response_bytes=1024 if handler == "oversized" else 64 * 1024,
        ),
    )
    summary = await _collect(_quantbt_adapter(), planning)

    assert summary.overall_availability.state == "degraded"
    quantbt = next(
        section for section in summary.sections if section.source_id == "quantbt_current"
    )
    failed = next(
        section for section in summary.sections if section.source_id == "planning_current"
    )
    assert quantbt.availability.state == "available"
    assert quantbt.metrics["total_runs"].value == 0
    assert failed.availability.state == "unavailable"
    assert failed.availability.reason_code == expected_reason
    assert all(metric.value is None for metric in failed.metrics.values())
    payload = summary.model_dump(mode="json")
    _validate_summary(payload)
    assert "/srv/private" not in json.dumps(payload)
    assert "token=secret" not in json.dumps(payload)
    assert "planning.internal" not in json.dumps(payload)
    assert "secret internal upstream detail" not in json.dumps(payload)


@pytest.mark.anyio
async def test_planning_healthy_quantbt_unavailable_keeps_planning_counts() -> None:
    counts = {
        "Backlog": 4,
        "Ready": 3,
        "In Progress": 2,
        "Validating": 1,
        "Done": 9,
    }

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=_planning_source_payload(counts=counts, roadmap_count=7),
            request=request,
        )

    unavailable = HistoricalCapabilitySnapshot(
        state="unavailable",
        dataset_count=0,
        dataset_ids=(),
        source_revision="0.1.0rc3",
    )
    quantbt = _quantbt_adapter(
        (),
        historical=None,
    )
    summary = await _collect(
        QuantBTSummaryAdapter(
            run_reader=StubRunPort(RuntimeError("run source failed")),
            historical_reader=StubHistoricalPort(unavailable),
            routes=QuantBTSummaryRoutes.from_registry(_registry_service().document),
            clock=lambda: CHECKED_AT,
        ),
        _planning_adapter(handler),
    )

    assert summary.overall_availability.state == "degraded"
    quantbt_section = next(
        section for section in summary.sections if section.source_id == "quantbt_current"
    )
    planning = next(
        section for section in summary.sections if section.source_id == "planning_current"
    )
    assert quantbt_section.availability.state == "unavailable"
    assert quantbt_section.metrics["total_runs"].value is None
    assert planning.availability.state == "available"
    assert planning.metrics["total_tasks"].value == 19
    assert planning.metrics["tasks_done"].value == 9
    _validate_summary(summary.model_dump(mode="json"))


@pytest.mark.anyio
async def test_all_sources_unavailable_still_schema_valid() -> None:
    quantbt = QuantBTSummaryAdapter(
        run_reader=StubRunPort(RuntimeError("failed")),
        historical_reader=StubHistoricalPort(RuntimeError("failed")),
        routes=QuantBTSummaryRoutes.from_registry(_registry_service().document),
        clock=lambda: CHECKED_AT,
    )
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down", request=request)

    summary = await _collect(quantbt, _planning_adapter(handler))

    assert summary.overall_availability.state == "unavailable"
    assert summary.overall_availability.reason_code == "UPSTREAM_UNAVAILABLE"
    assert all(
        section.availability.state == "unavailable" for section in summary.sections
    )
    assert all(
        metric.value is None
        for section in summary.sections
        for metric in section.metrics.values()
    )
    _validate_summary(summary.model_dump(mode="json"))


# ------------------------------------------------------- local and denied


@pytest.mark.anyio
async def test_local_only_state_is_never_zero() -> None:
    adapter = PlanningSummaryAdapter(
        mode="local",
        reader=None,
        routes=PlanningSummaryRoutes.from_registry(_registry_service().document),
        clock=lambda: CHECKED_AT,
    )
    summary = await _collect(_quantbt_adapter(), adapter)

    planning = next(
        section for section in summary.sections if section.source_id == "planning_current"
    )
    assert planning.availability.state == "unavailable"
    assert planning.availability.reason_code == "LOCAL_ONLY_STATE"
    assert all(metric.value is None for metric in planning.metrics.values())
    assert summary.overall_availability.state == "degraded"
    _validate_summary(summary.model_dump(mode="json"))


@pytest.mark.anyio
async def test_denied_mapping_flows_into_partial_response() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, text="denied", request=request)

    summary = await _collect(_quantbt_adapter(), _planning_adapter(handler))

    planning = next(
        section for section in summary.sections if section.source_id == "planning_current"
    )
    assert planning.availability.state == "denied"
    assert planning.availability.reason_code == "PERMISSION_DENIED"
    assert summary.overall_availability.state == "degraded"
    _validate_summary(summary.model_dump(mode="json"))


# ------------------------------------------- concurrency, deadline, cancel


@pytest.mark.anyio
async def test_collection_is_concurrent_without_head_of_line_blocking() -> None:
    loop = asyncio.get_running_loop()
    slow_started = asyncio.Event()
    slow_end: list[float] = []
    fast_end: list[float] = []

    slow = EventfulAdapter(
        "quantbt_current",
        _contribution(_section("quantbt_current")),
        feature_id="QUANTBT_RESEARCH",
        started=slow_started,
        delay=0.25,
        record_end=slow_end,
        loop=loop,
    )

    class FastAdapter(EventfulAdapter):
        async def collect(self, context, *, deadline):
            del context, deadline
            await slow_started.wait()
            fast_end.append(loop.time())
            return self._contribution

    fast = FastAdapter(
        "planning_current",
        _contribution(_section("planning_current", feature_id="PLANNING")),
        feature_id="PLANNING",
        loop=loop,
    )
    summary = await _collect(slow, fast, settings=PortalSummarySettings(deadline_seconds=2.0))

    assert [section.source_id for section in summary.sections] == [
        "quantbt_current",
        "planning_current",
    ]
    assert fast_end[0] < slow_end[0] - 0.1


@pytest.mark.anyio
async def test_hard_deadline_bounds_stuck_adapter_and_preserves_healthy_evidence() -> None:
    loop = asyncio.get_running_loop()
    started = asyncio.Event()
    on_cancel = asyncio.Event()
    stuck = EventfulAdapter(
        "planning_current",
        _contribution(_section("planning_current", feature_id="PLANNING")),
        feature_id="PLANNING",
        started=started,
        wait_on=asyncio.Event(),
        on_cancel=on_cancel,
        loop=loop,
    )
    healthy = _quantbt_adapter()
    service = _service(
        healthy,
        stuck,
        settings=PortalSummarySettings(deadline_seconds=0.2, environment="research"),
    )
    begin = loop.time()
    try:
        summary = await service.collect_summary(requested_at=CHECKED_AT)
    finally:
        await service.aclose()
    elapsed = loop.time() - begin

    assert elapsed >= 0.15
    assert elapsed < 0.6
    assert on_cancel.is_set()
    quantbt = next(
        section for section in summary.sections if section.source_id == "quantbt_current"
    )
    stuck_section = next(
        section for section in summary.sections if section.source_id == "planning_current"
    )
    assert quantbt.availability.state == "available"
    assert quantbt.metrics["total_runs"].value == 0
    assert stuck_section.availability.state == "unavailable"
    assert stuck_section.availability.reason_code == "UPSTREAM_TIMEOUT"
    _validate_summary(summary.model_dump(mode="json"))


@pytest.mark.anyio
async def test_each_adapter_receives_one_remaining_budget_deadline() -> None:
    quantbt = _quantbt_adapter()
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_planning_source_payload(), request=request)

    planning = _planning_adapter(handler)
    first = FakeAdapter(
        "probe_first",
        _contribution(_section("probe_first", feature_id="PORTAL_MAP")),
        feature_id="PORTAL_MAP",
    )
    probe_second = FakeAdapter(
        "probe_second",
        _contribution(_section("probe_second", feature_id="PORTAL_MAP")),
        feature_id="PORTAL_MAP",
    )
    loop = asyncio.get_running_loop()
    service = _service(
        quantbt,
        planning,
        first,
        probe_second,
        settings=PortalSummarySettings(deadline_seconds=0.5, environment="research"),
    )
    try:
        begin_collect = loop.time()
        await service.collect_summary(requested_at=CHECKED_AT)
    finally:
        await service.aclose()

    expected_deadline = begin_collect + 0.5
    for probe in (first, probe_second):
        assert probe.last_deadline is not None
        assert abs(probe.last_deadline - expected_deadline) < 0.05
        context = probe.last_context
        assert context is not None
        assert context.registry_digest == _registry_service().document.content_digest
        assert context.environment == "research"
        assert context.requested_at == CHECKED_AT
        assert context.requested_at.tzinfo is not None


@pytest.mark.anyio
async def test_client_cancellation_cancels_pending_upstream_work() -> None:
    loop = asyncio.get_running_loop()
    started = asyncio.Event()
    on_cancel = asyncio.Event()
    stuck = EventfulAdapter(
        "planning_current",
        _contribution(_section("planning_current", feature_id="PLANNING")),
        feature_id="PLANNING",
        started=started,
        wait_on=asyncio.Event(),
        on_cancel=on_cancel,
        loop=loop,
    )
    service = _service(
        _quantbt_adapter(),
        stuck,
        settings=PortalSummarySettings(deadline_seconds=2.0, environment="research"),
    )
    task = asyncio.create_task(service.collect_summary(requested_at=CHECKED_AT))
    await asyncio.wait_for(started.wait(), timeout=1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    await service.aclose()

    assert on_cancel.is_set()


# ------------------------------------------------------------- merging


@pytest.mark.anyio
async def test_section_ordering_is_stable_and_registry_derived() -> None:
    quantbt = _quantbt_adapter()
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_planning_source_payload(), request=request)

    planning = _planning_adapter(handler)
    extra = FakeAdapter(
        "zeta_current",
        _contribution(_section("zeta_current", feature_id="PORTAL_MAP")),
        feature_id="PORTAL_MAP",
    )
    summary = await _collect(extra, planning, quantbt)

    assert [section.source_id for section in summary.sections] == [
        "quantbt_current",
        "planning_current",
        "zeta_current",
    ]


@pytest.mark.anyio
async def test_priority_ordering_follows_deep_dive_with_deterministic_tie_break() -> None:
    failed_older = _run("failed-older", "FAILED", minutes=3)
    failed_newer = _run("failed-newer", "FAILED", minutes=7)
    unavailable_historical = HistoricalCapabilitySnapshot(
        state="unavailable",
        dataset_count=0,
        dataset_ids=(),
        source_revision="0.1.0rc3",
    )
    quantbt = QuantBTSummaryAdapter(
        run_reader=StubRunPort((failed_older, failed_newer)),
        historical_reader=StubHistoricalPort(unavailable_historical),
        routes=QuantBTSummaryRoutes.from_registry(_registry_service().document),
        clock=lambda: CHECKED_AT,
    )
    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_planning_source_payload(), request=request)

    summary = await _collect(quantbt, _planning_adapter(handler))

    priorities = summary.priority_items
    types = [item.type for item in priorities]
    assert types == [
        "RUN_FAILED",
        "RUN_FAILED",
        "HISTORICAL_DATA_UNAVAILABLE",
        *(["REGISTRY_BLOCKING_CONCERN"] * 5),
    ]
    run_failed = [item for item in priorities if item.type == "RUN_FAILED"]
    assert run_failed[0].resource_id == "failed-newer"
    assert run_failed[1].resource_id == "failed-older"
    concerns = [item for item in priorities if item.type == "REGISTRY_BLOCKING_CONCERN"]
    assert [item.id for item in concerns] == sorted(item.id for item in concerns)
    assert all(item.route.startswith("/") for item in priorities)
    assert len(priorities) <= 50
    _validate_summary(summary.model_dump(mode="json"))


# --------------------------------------------------------- registry counts


def test_registry_counts_exact_for_default_source() -> None:
    summary_counts = _service()._registry_counts()

    assert dict(summary_counts.by_maturity) == {
        "AVAILABLE": 2,
        "PROTOTYPE": 2,
        "COMMISSIONED": 18,
        "BLOCKED": 0,
        "HIDDEN": 0,
        "DEPRECATED": 0,
    }
    assert summary_counts.blocking_concerns == 5


def test_registry_counts_follow_hidden_and_deprecated_invariants(tmp_path: Path) -> None:
    def mutate(source: dict[str, object]) -> None:
        source["revision"] = int(source["revision"]) + 1
        features = source["features"]
        assert isinstance(features, list)
        planning = next(feature for feature in features if feature["id"] == "PLANNING")
        planning["maturity"] = "HIDDEN"
        planning["navigation"]["show_in_sidebar"] = False
        planning["navigation"]["show_in_command_palette"] = False
        planning["concern_ids"].append("CONCERN_HIDDEN_ONLY")
        concerns = source["concerns"]
        assert isinstance(concerns, list)
        concerns.append(
            {
                "id": "CONCERN_HIDDEN_ONLY",
                "category": "SOURCE_OF_TRUTH",
                "status": "OPEN",
                "severity": "BLOCKING",
                "statement": "Hidden-only blocking concern must not count.",
                "feature_ids": ["PLANNING"],
                "screen_ids": [],
                "evidence_refs": [],
                "task_ids": [],
                "activation_gate": None,
                "reviewed_at": "2026-08-15T00:00:00Z",
            }
        )

    service = _service(registry_service=_registry_service(_registry_root(tmp_path, mutate)))
    counts = service._registry_counts()

    assert counts.by_maturity["AVAILABLE"] == 1
    assert counts.by_maturity["HIDDEN"] == 0
    assert counts.blocking_concerns == 5
    priorities = service._registry_blocking_concern_priorities()
    assert all("CONCERN_HIDDEN_ONLY" not in item.id for item in priorities)


# ------------------------------------------------------------ payload caps


@pytest.mark.anyio
async def test_healthy_payload_stays_under_target_and_caps_are_contract_failures() -> None:
    quantbt, planning = await _healthy_adapters()
    summary = await _collect(quantbt, planning)
    encoded = summary.model_dump_json().encode("utf-8")
    assert len(encoded) < 50 * 1024

    many = tuple(
        FakeAdapter(
            f"overflow_{index}",
            _contribution(_section(f"overflow_{index}", feature_id="PORTAL_MAP")),
            feature_id="PORTAL_MAP",
        )
        for index in range(33)
    )
    with pytest.raises(PortalSummaryContractError, match="sections"):
        await _collect(*many)


@pytest.mark.anyio
async def test_payload_hard_ceiling_is_a_typed_internal_contract_failure() -> None:
    available = _availability(state="available")
    huge_metrics = {
        f"metric_{index}": EvidenceValue(
            availability=available,
            value="x" * 500,
            unit=None,
            timezone=None,
            segment=None,
            source_artifact_digest=None,
        )
        for index in range(64)
    }
    bloated = tuple(
        FakeAdapter(
            f"bloat_{index}",
            _contribution(
                _section(
                    f"bloat_{index}",
                    metrics=huge_metrics,
                    feature_id="PORTAL_MAP",
                )
            ),
            feature_id="PORTAL_MAP",
        )
        for index in range(4)
    )
    with pytest.raises(PortalSummaryContractError, match="ceiling"):
        await _collect(*bloated)


@pytest.mark.anyio
async def test_priority_cap_is_a_contract_failure() -> None:
    priorities = tuple(
        PriorityItem(
            id=f"quantbt:run-failed:run-{index}",
            type="RUN_FAILED",
            severity="warning",
            title=f"Review failed run run-{index}",
            feature_id="QUANTBT_RESEARCH",
            resource_id=f"run-{index}",
            observed_at=CHECKED_AT,
            authority="quantbt_current",
            route="/research/quantbt/runs/run-1/overview",
            evidence_digest=None,
        )
        for index in range(51)
    )
    adapter = FakeAdapter(
        "quantbt_current",
        _contribution(_section("quantbt_current"), priorities=priorities),
    )
    with pytest.raises(PortalSummaryContractError, match="priority"):
        await _collect(adapter)


@pytest.mark.anyio
async def test_adapter_returning_garbage_is_a_typed_contract_failure() -> None:
    class GarbageAdapter:
        source_id = "garbage_current"

        async def collect(self, context, *, deadline):
            del context, deadline
            return {"not": "a contribution"}

        def unavailable_contribution(self, *, reason_code, checked_at):
            return _contribution(_section(self.source_id))

    with pytest.raises(PortalSummaryContractError, match="invalid contribution"):
        await _collect(GarbageAdapter())


# ------------------------------------------------------------- endpoint


def _endpoint_app(*adapters, settings=None):
    app = create_app()
    app.state.portal_summary_service = _service(*adapters, settings=settings)
    return app


@pytest.mark.anyio
async def test_endpoint_serves_200_with_dynamic_cache_headers_and_readonly_contract() -> None:
    quantbt, planning = await _healthy_adapters()
    app = _endpoint_app(quantbt, planning)
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/v1/portal/summary")
            mutation = await client.post("/api/v1/portal/summary")
            registry = await client.get("/api/v1/portal/registry")
    finally:
        await app.state.portal_summary_service.aclose()
        app.state.run_manager.shutdown()

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["vary"] == "Authorization, Cookie"
    payload = response.json()
    assert payload["schema_version"] == "portal.summary.v1"
    assert payload["overall_availability"]["state"] == "available"
    _validate_summary(payload)
    assert mutation.status_code == 405
    assert registry.status_code == 200
    operation = app.openapi()["paths"]["/api/v1/portal/summary"]
    assert set(operation) == {"get"}
    assert all(parameter["in"] != "query" for parameter in operation["get"].get("parameters", []))


@pytest.mark.anyio
async def test_default_app_endpoint_returns_truthful_partial_summary(monkeypatch) -> None:
    monkeypatch.setenv("PORTAL_PLANNING_SUMMARY_MODE", "local")
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/v1/portal/summary")
    finally:
        await app.state.portal_summary_service.aclose()
        app.state.run_manager.shutdown()

    assert response.status_code == 200
    payload = response.json()
    _validate_summary(payload)
    assert payload["overall_availability"]["state"] == "degraded"
    sections = {section["source_id"]: section for section in payload["sections"]}
    assert sections["quantbt_current"]["availability"]["state"] == "degraded"
    planning = sections["planning_current"]
    assert planning["availability"]["state"] == "unavailable"
    assert planning["availability"]["reason_code"] == "LOCAL_ONLY_STATE"
    assert all(
        metric["value"] is None for metric in planning["metrics"].values()
    )


@pytest.mark.anyio
async def test_internal_contract_failure_maps_to_typed_500() -> None:
    class GarbageAdapter:
        source_id = "garbage_current"

        async def collect(self, context, *, deadline):
            del context, deadline
            return {"not": "a contribution"}

        def unavailable_contribution(self, *, reason_code, checked_at):
            return _contribution(_section(self.source_id))

    app = _endpoint_app(GarbageAdapter())
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/v1/portal/summary")
    finally:
        await app.state.portal_summary_service.aclose()
        app.state.run_manager.shutdown()

    assert response.status_code == 500
    assert response.json()["error"]["code"] == "SUMMARY_CONTRACT_FAILURE"


# ----------------------------------------------------------- safety gates


@pytest.mark.anyio
async def test_summary_never_emits_forbidden_metrics_or_leaks() -> None:
    quantbt = QuantBTSummaryAdapter(
        run_reader=StubRunPort(RuntimeError("failed at /srv/private?token=secret")),
        historical_reader=StubHistoricalPort(RuntimeError("down")),
        routes=QuantBTSummaryRoutes.from_registry(_registry_service().document),
        clock=lambda: CHECKED_AT,
    )
    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError(
            "token=secret at planning.internal", request=request
        )

    summary = await _collect(quantbt, _planning_adapter(handler))
    payload = summary.model_dump(mode="json")
    encoded = json.dumps(payload)

    metric_keys = {key for section in summary.sections for key in section.metrics}
    forbidden = {
        "pnl",
        "equity",
        "sharpe",
        "drawdown",
        "profit",
        "eta",
        "incident",
        "deployment",
        "account",
        "return",
    }
    assert not any(token in key for key in metric_keys for token in forbidden)
    assert {item.type for item in summary.priority_items} <= {
        "RUN_FAILED",
        "HISTORICAL_DATA_UNAVAILABLE",
        "REGISTRY_BLOCKING_CONCERN",
    }
    assert "/srv/private" not in encoded
    assert "token=secret" not in encoded
    assert "planning.internal" not in encoded


def test_unsafe_link_and_priority_routes_are_rejected_by_domain_contract() -> None:
    with pytest.raises(ValidationError):
        SummaryLinkItem(
            id="bad",
            label="bad link",
            route="https://evil.example/phish",
            resource_id=None,
            observed_at=CHECKED_AT,
            authority="test",
        )
    with pytest.raises(ValidationError):
        PriorityItem(
            id="bad",
            type="RUN_FAILED",
            severity="warning",
            title="bad priority",
            feature_id="QUANTBT_RESEARCH",
            resource_id=None,
            observed_at=CHECKED_AT,
            authority="test",
            route="//internal.example/run",
            evidence_digest=None,
        )
