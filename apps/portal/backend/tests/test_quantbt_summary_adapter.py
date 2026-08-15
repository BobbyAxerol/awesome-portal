from __future__ import annotations

import asyncio
import json
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
from jsonschema import Draft202012Validator, FormatChecker
from pydantic import ValidationError
from referencing import Registry, Resource

from portal_api.adapters.market_data import DatasetDescriptor
from portal_api.adapters.quantbt_summary import (
    CurrentRunSummaryReader,
    HistoricalCapabilityReader,
    QuantBTSummaryAdapter,
    QuantBTSummaryContractError,
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
    SummaryContext,
)
from portal_api.main import create_app
from portal_api.repositories.portal_registry import PortalRegistryRepository


PORTAL_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_ROOT = PORTAL_ROOT / "registry"
SCHEMA_ROOT = REGISTRY_ROOT / "schemas"
CHECKED_AT = datetime(2026, 8, 15, 15, 0, tzinfo=UTC)


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


def _validate_definition(name: str, document: dict[str, object]) -> None:
    validator = Draft202012Validator(
        {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$ref": f"{SUMMARY_SCHEMA['$id']}#/$defs/{name}",
        },
        registry=SCHEMA_REGISTRY,
        format_checker=FormatChecker(),
    )
    errors = list(validator.iter_errors(document))
    assert not errors, "\n".join(error.message for error in errors)


def _routes() -> QuantBTSummaryRoutes:
    registry = PortalRegistryRepository(REGISTRY_ROOT).load().document
    return QuantBTSummaryRoutes.from_registry(registry)


def _context() -> SummaryContext:
    return SummaryContext(
        registry_digest=f"sha256:{'1' * 64}",
        environment="research",
        requested_at=CHECKED_AT,
    )


def _run(
    run_id: str,
    status: str,
    *,
    minutes: int,
    protocol: str | None = "three_window_decay",
    strategy_id: str | None = "delta-rsi-polynomial-alpha",
) -> CurrentRunSnapshot:
    created_at = CHECKED_AT + timedelta(minutes=minutes)
    completed_at = (
        created_at + timedelta(seconds=30)
        if status in {"COMPLETED", "FAILED", "CANCELLED"}
        else None
    )
    return CurrentRunSnapshot(
        run_id=run_id,
        status=status,
        protocol=protocol,
        strategy_id=strategy_id,
        symbol="ETHUSDT",
        timeframe="1h",
        created_at=created_at,
        completed_at=completed_at,
    )


class StubRunPort:
    def __init__(self, result=()) -> None:
        self.result = result
        self.calls = 0
        self.limit: int | None = None

    def read_current_runs(self, *, limit: int):
        self.calls += 1
        self.limit = limit
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
        self.calls = 0

    def read_historical_capability(self):
        self.calls += 1
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


async def _collect(run_port: StubRunPort, historical_port: StubHistoricalPort):
    adapter = QuantBTSummaryAdapter(
        run_reader=run_port,
        historical_reader=historical_port,
        routes=_routes(),
        clock=lambda: CHECKED_AT,
    )
    contribution = await adapter.collect(
        _context(),
        deadline=asyncio.get_running_loop().time() + 1,
    )
    section = contribution.section.model_dump(mode="json")
    _validate_definition("section", section)
    for priority in contribution.priority_items:
        _validate_definition("priorityItem", priority.model_dump(mode="json"))
    return contribution


def test_routes_are_derived_from_registry_and_reject_unsafe_run_id() -> None:
    routes = _routes()

    assert routes.new_run == "/research/quantbt/new"
    assert routes.run_library == "/research/quantbt/runs"
    assert routes.run_detail("run_123") == "/research/quantbt/runs/run_123/overview"
    with pytest.raises(QuantBTSummaryContractError, match="linked safely"):
        routes.run_detail("../../unsafe")


def test_current_run_reader_returns_typed_bounded_snapshots() -> None:
    class Source:
        def list_runs(self):
            return [
                {
                    "run_id": f"run-{index}",
                    "status": "COMPLETED",
                    "protocol": "three_window_decay",
                    "strategy_id": "delta-rsi-polynomial-alpha",
                    "symbol": "ETHUSDT",
                    "timeframe": "1h",
                    "created_at": CHECKED_AT.isoformat(),
                    "completed_at": CHECKED_AT.isoformat(),
                }
                for index in range(101)
            ]

    inventory = CurrentRunSummaryReader(Source()).read_current_runs(limit=100)

    assert inventory.total_runs == 101
    assert len(inventory.recent_runs) == 100
    assert inventory.truncated is True
    assert inventory.state_counts == {"COMPLETED": 101}
    assert isinstance(inventory.recent_runs[0], CurrentRunSnapshot)
    with pytest.raises(ValueError, match="between 1 and 100"):
        CurrentRunSummaryReader(Source()).read_current_runs(limit=101)


@pytest.mark.parametrize(
    ("descriptors", "expected_state", "expected_count"),
    [
        (
            (
                DatasetDescriptor(
                    dataset_id="crypto-binance-1m",
                    symbol=None,
                    venue="BINANCE",
                    timeframe=None,
                    source_class="historical_market_data",
                    availability="available",
                    usage_scopes=("backtest", "research"),
                ),
            ),
            "available",
            1,
        ),
        (
            (
                DatasetDescriptor(
                    dataset_id="crypto-binance-1m",
                    symbol=None,
                    venue="BINANCE",
                    timeframe=None,
                    source_class="historical_market_data",
                    availability="unavailable",
                    unavailable_reason="/srv/private must never escape",
                    usage_scopes=("backtest", "research"),
                ),
            ),
            "unavailable",
            0,
        ),
        (
            (
                DatasetDescriptor(
                    dataset_id="fixture",
                    symbol="ETHUSDT",
                    venue="TEST",
                    timeframe="1h",
                    source_class="fixture",
                ),
            ),
            "unavailable",
            0,
        ),
    ],
)
def test_historical_reader_exposes_only_safe_capability_metadata(
    descriptors: tuple[DatasetDescriptor, ...],
    expected_state: str,
    expected_count: int,
) -> None:
    class Provider:
        def list_datasets(self):
            return descriptors

    snapshot = HistoricalCapabilityReader(Provider()).read_historical_capability()

    assert snapshot.state == expected_state
    assert snapshot.dataset_count == expected_count
    assert "/srv/" not in snapshot.model_dump_json()


@pytest.mark.anyio
async def test_empty_run_library_is_available_with_truthful_zero() -> None:
    contribution = await _collect(StubRunPort(()), StubHistoricalPort())
    section = contribution.section

    assert section.availability.state == "available"
    assert section.metrics["total_runs"].value == 0
    assert section.metrics["total_runs"].availability.state == "available"
    assert section.metrics["latest_run_id"].value is None
    assert section.metrics["historical_dataset_count"].value == 1
    assert section.recent_items == ()
    assert section.warnings == ()
    assert contribution.priority_items == ()
    with pytest.raises(TypeError):
        section.metrics["total_runs"] = section.metrics["total_runs"]  # type: ignore[index]


@pytest.mark.anyio
async def test_active_completed_failed_and_cancelled_runs_are_mapped_without_metrics() -> None:
    runs = (
        _run("queued", "QUEUED", minutes=1),
        _run("active", "OPTIMIZING_IS", minutes=2),
        _run("completed", "COMPLETED", minutes=3),
        _run("cancelled", "CANCELLED", minutes=4),
        _run("failed", "FAILED", minutes=5),
    )
    contribution = await _collect(StubRunPort(runs), StubHistoricalPort())
    metrics = contribution.section.metrics

    assert metrics["total_runs"].value == 5
    assert metrics["active_runs"].value == 2
    assert metrics["queued_runs"].value == 1
    assert metrics["completed_runs"].value == 1
    assert metrics["failed_runs"].value == 1
    assert metrics["cancelled_runs"].value == 1
    assert metrics["runs_state_optimizing_is"].value == 1
    assert metrics["runs_state_warming_kernel"].value == 0
    assert metrics["latest_run_id"].value == "failed"
    assert metrics["latest_run_status"].value == "FAILED"
    assert metrics["latest_run_observed_at"].value == (
        CHECKED_AT + timedelta(minutes=5, seconds=30)
    ).isoformat()
    assert contribution.priority_items[0].type == "RUN_FAILED"
    assert contribution.priority_items[0].route.endswith("/failed/overview")
    assert contribution.section.warnings[0].code == "RUN_FAILED"
    forbidden = {"pnl", "equity", "sharpe", "drawdown", "profit", "return"}
    assert not any(token in key for key in metrics for token in forbidden)


@pytest.mark.anyio
async def test_historical_unavailable_degrades_section_and_never_becomes_zero() -> None:
    unavailable = HistoricalCapabilitySnapshot(
        state="unavailable",
        dataset_count=0,
        dataset_ids=(),
        source_revision="0.1.0rc3",
    )
    contribution = await _collect(StubRunPort(()), StubHistoricalPort(unavailable))
    section = contribution.section
    historical = section.metrics["historical_dataset_count"]

    assert section.availability.state == "degraded"
    assert section.metrics["total_runs"].value == 0
    assert historical.availability.state == "unavailable"
    assert historical.availability.reason_code == "SOURCE_DATA_UNAVAILABLE"
    assert historical.value is None
    assert contribution.priority_items[0].type == "HISTORICAL_DATA_UNAVAILABLE"
    assert contribution.priority_items[0].route == "/research/quantbt/new"


@pytest.mark.anyio
async def test_run_source_failure_preserves_healthy_historical_evidence_and_is_safe() -> None:
    contribution = await _collect(
        StubRunPort(RuntimeError("failed at /srv/private?token=secret")),
        StubHistoricalPort(),
    )
    payload = contribution.model_dump_json()

    assert contribution.section.availability.state == "degraded"
    assert contribution.section.metrics["total_runs"].value is None
    assert (
        contribution.section.metrics["total_runs"].availability.reason_code
        == "UPSTREAM_UNAVAILABLE"
    )
    assert contribution.section.metrics["historical_dataset_count"].value == 1
    assert "RUN_SUMMARY_UNAVAILABLE" in payload
    assert "/srv/private" not in payload
    assert "token=secret" not in payload


@pytest.mark.anyio
async def test_historical_reader_failure_preserves_truthful_empty_run_library() -> None:
    contribution = await _collect(
        StubRunPort(()),
        StubHistoricalPort(RuntimeError("cannot read /home/private?secret=value")),
    )
    historical = contribution.section.metrics["historical_dataset_count"]
    payload = contribution.model_dump_json()

    assert contribution.section.availability.state == "degraded"
    assert contribution.section.metrics["total_runs"].value == 0
    assert historical.value is None
    assert historical.availability.reason_code == "UPSTREAM_UNAVAILABLE"
    assert contribution.priority_items[0].type == "HISTORICAL_DATA_UNAVAILABLE"
    assert "/home/private" not in payload
    assert "secret=value" not in payload


@pytest.mark.anyio
async def test_recent_failed_evidence_is_bounded_to_five_items() -> None:
    runs = tuple(
        _run(f"failed-{index}", "FAILED", minutes=index) for index in range(7)
    )
    contribution = await _collect(StubRunPort(runs), StubHistoricalPort())

    assert contribution.section.metrics["failed_runs"].value == 7
    assert len(contribution.section.recent_items) == 5
    assert len(contribution.section.warnings) == 5
    assert len(contribution.priority_items) == 5


@pytest.mark.anyio
async def test_unknown_run_state_is_an_incompatible_contract_not_a_count() -> None:
    contribution = await _collect(
        StubRunPort((_run("future", "FUTURE_STATE", minutes=1),)),
        StubHistoricalPort(),
    )
    total = contribution.section.metrics["total_runs"]

    assert contribution.section.availability.state == "degraded"
    assert total.value is None
    assert total.availability.reason_code == "INCOMPATIBLE_CONTRACT"


@pytest.mark.anyio
async def test_expired_deadline_does_not_call_sources_and_returns_unavailable() -> None:
    run_port = StubRunPort(())
    historical_port = StubHistoricalPort()
    adapter = QuantBTSummaryAdapter(
        run_reader=run_port,
        historical_reader=historical_port,
        routes=_routes(),
        clock=lambda: CHECKED_AT,
    )

    contribution = await adapter.collect(
        _context(),
        deadline=asyncio.get_running_loop().time() - 1,
    )

    assert run_port.calls == 0
    assert historical_port.calls == 0
    assert contribution.section.availability.state == "unavailable"
    assert contribution.section.availability.reason_code == "UPSTREAM_TIMEOUT"
    assert contribution.section.metrics["total_runs"].value is None
    assert contribution.section.metrics["historical_dataset_count"].value is None


def test_evidence_contract_rejects_unavailable_numeric_zero_and_naive_time() -> None:
    with pytest.raises(ValidationError, match="timezone"):
        SummaryContext(
            registry_digest=f"sha256:{'1' * 64}",
            environment="research",
            requested_at=datetime(2026, 8, 15, 15, 0),
        )

    unavailable = CapabilityAvailability(
        state="unavailable",
        reason_code="SOURCE_DATA_UNAVAILABLE",
        detail="Data unavailable.",
        retryable=True,
        checked_at=CHECKED_AT,
        as_of=None,
        stale_after_seconds=None,
        authority=AvailabilityAuthority(
            service="portal-api",
            contract="historical-capability.v1",
            endpoint="/api/datasets",
        ),
        provenance=AvailabilityProvenance(
            source_revision="0.1.0rc3",
            content_digest=None,
        ),
    )
    with pytest.raises(ValidationError, match="must be null"):
        EvidenceValue(
            availability=unavailable,
            value=0,
            unit="datasets",
            timezone="UTC",
            segment=None,
            source_artifact_digest=None,
        )


@pytest.mark.anyio
async def test_be3_stays_an_internal_adapter_served_through_be5_aggregator() -> None:
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.get("/api/v1/portal/summary")
    finally:
        app.state.run_manager.shutdown()

    assert isinstance(app.state.quantbt_summary_adapter, QuantBTSummaryAdapter)
    assert isinstance(app.state.portal_summary_service, object)
    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "portal.summary.v1"
    sections = {section["source_id"]: section for section in payload["sections"]}
    assert "quantbt_current" in sections
