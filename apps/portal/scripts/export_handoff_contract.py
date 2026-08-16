#!/usr/bin/env python3
"""Build the BAR-01-BE6 frontend handoff artifacts.

Produces, from the validated registry and the real BAR-01 adapter/service
code paths:

- ``registry/openapi/portal-api.openapi.json``: the committed Portal API
  OpenAPI 3.1 document, regenerable and generator-ready.
- ``registry/fixtures/registry.public.json``: the public registry document.
- ``registry/fixtures/summary.*.json``: canonical Command Center summary
  states (healthy, empty, partial, stale, denied, unavailable).

Every fixture is validated against its canonical Draft 2020-12 JSON Schema
before it is written. Run from the Portal backend environment:

    PYTHONPATH=backend/src:. python scripts/export_handoff_contract.py
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Callable

PORTAL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PORTAL_ROOT / "backend" / "src"))
sys.path.insert(0, str(PORTAL_ROOT))

import httpx
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource

from portal_api.adapters.planning_summary import (
    PlanningSummaryAdapter,
    PlanningSummaryHTTPClient,
    PlanningSummaryRoutes,
    PlanningSummarySettings,
)
from portal_api.adapters.quantbt_summary import (
    QuantBTSummaryAdapter,
    QuantBTSummaryRoutes,
)
from portal_api.domain.portal_summary import (
    CurrentRunInventory,
    CurrentRunSnapshot,
    HistoricalCapabilitySnapshot,
)
from portal_api.main import create_app
from portal_api.repositories.portal_registry import PortalRegistryRepository
from portal_api.services.portal_overview import (
    PortalSummaryService,
    PortalSummarySettings,
)
from portal_api.services.portal_registry import PortalRegistryService

CHECKED_AT = datetime(2026, 8, 15, 18, 0, tzinfo=UTC)
TASK_STATUSES = ("Backlog", "Ready", "In Progress", "Validating", "Done")


class StubRunPort:
    def __init__(self, result: object = ()) -> None:
        self.result = result

    def read_current_runs(self, *, limit: int) -> CurrentRunInventory:
        if isinstance(self.result, BaseException):
            raise self.result
        if isinstance(self.result, CurrentRunInventory):
            return self.result
        runs = self.result
        assert isinstance(runs, tuple)
        ordered = tuple(
            sorted(
                runs,
                key=lambda run: run.observed_at.timestamp()
                if run.observed_at
                else float("-inf"),
                reverse=True,
            )
        )
        return CurrentRunInventory(
            total_runs=len(ordered),
            state_counts=Counter(run.status for run in ordered),
            recent_runs=ordered[:100],
            truncated=len(ordered) > 100,
        )


class StubHistoricalPort:
    def __init__(self, result: object | None = None) -> None:
        self.result = result or HistoricalCapabilitySnapshot(
            state="available",
            dataset_count=1,
            dataset_ids=("crypto-binance-1m",),
            source_revision="0.1.0rc3",
        )

    def read_historical_capability(self) -> HistoricalCapabilitySnapshot:
        if isinstance(self.result, BaseException):
            raise self.result
        assert isinstance(self.result, HistoricalCapabilitySnapshot)
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


def _planning_payload(
    *,
    counts: dict[str, int] | None = None,
    roadmap_count: int = 0,
    recent_tasks: list[dict[str, Any]] | None = None,
    recent_roadmap: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
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


def _planning_settings() -> PlanningSummarySettings:
    return PlanningSummarySettings(
        mode="api",
        api_base_url="http://roadmap-task-board-api:8000",
        request_timeout_seconds=0.5,
        max_response_bytes=64 * 1024,
    )


def _quantbt_adapter(
    runs: object = (),
    historical: object | None = None,
    registry_service: PortalRegistryService | None = None,
) -> QuantBTSummaryAdapter:
    registry_service = registry_service or PortalRegistryService(
        PortalRegistryRepository(PORTAL_ROOT / "registry")
    )
    return QuantBTSummaryAdapter(
        run_reader=StubRunPort(runs),
        historical_reader=StubHistoricalPort(historical),
        routes=QuantBTSummaryRoutes.from_registry(registry_service.document),
        clock=lambda: CHECKED_AT,
    )


def _planning_adapter(
    handler: Callable[[httpx.Request], httpx.Response],
    registry_service: PortalRegistryService,
) -> PlanningSummaryAdapter:
    client = PlanningSummaryHTTPClient(
        _planning_settings(),
        transport=httpx.MockTransport(handler),
    )
    return PlanningSummaryAdapter(
        mode="api",
        reader=client,
        routes=PlanningSummaryRoutes.from_registry(registry_service.document),
        clock=lambda: CHECKED_AT,
    )


def _local_planning_adapter(
    registry_service: PortalRegistryService,
) -> PlanningSummaryAdapter:
    return PlanningSummaryAdapter(
        mode="local",
        reader=None,
        routes=PlanningSummaryRoutes.from_registry(registry_service.document),
        clock=lambda: CHECKED_AT,
    )


def _healthy_planning_handler() -> Callable[[httpx.Request], httpx.Response]:
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
            json=_planning_payload(
                counts=counts,
                roadmap_count=7,
                recent_tasks=recent_tasks,
                recent_roadmap=recent_roadmap,
            ),
            request=request,
        )

    return handler


async def _collect_service(
    registry_service: PortalRegistryService,
    *adapters: Any,
) -> dict[str, Any]:
    service = PortalSummaryService(
        registry_service=registry_service,
        adapters=adapters,
        settings=PortalSummarySettings(deadline_seconds=0.5, environment="research"),
        clock=lambda: CHECKED_AT,
    )
    try:
        summary = await service.collect_summary(requested_at=CHECKED_AT)
    finally:
        await service.aclose()
    return summary.model_dump(mode="json")


def _stale_section(summary: dict[str, Any]) -> dict[str, Any]:
    """Synthesize the contract-example stale state; current sources emit none."""
    from portal_api.domain.portal_summary import (
        AvailabilityAuthority,
        AvailabilityProvenance,
        CapabilityAvailability,
    )

    stale_availability = CapabilityAvailability(
        state="stale",
        reason_code="STALE_OBSERVATION",
        detail="Source observation is older than its freshness contract.",
        retryable=False,
        checked_at=CHECKED_AT,
        as_of=CHECKED_AT - timedelta(hours=2),
        stale_after_seconds=3600,
        authority=AvailabilityAuthority(
            service="portal-api",
            contract="quantbt-summary-contribution.v1",
            endpoint=None,
        ),
        provenance=AvailabilityProvenance(
            source_revision="BAR-01-BE3",
            content_digest=None,
        ),
    )
    sections = [
        {
            **section,
            "availability": stale_availability.model_dump(mode="json"),
        }
        if section["source_id"] == "quantbt_current"
        else section
        for section in summary["sections"]
    ]
    summary["sections"] = sections
    summary["overall_availability"] = {
        "state": "degraded",
        "reason_code": "PARTIAL_SOURCE_FAILURE",
        "detail": "One or more current summary sources are unavailable.",
        "retryable": True,
        "checked_at": CHECKED_AT.isoformat(),
        "as_of": CHECKED_AT.isoformat(),
        "stale_after_seconds": None,
        "authority": {
            "service": "portal-api",
            "contract": "portal.summary.v1",
            "endpoint": "/api/v1/portal/summary",
        },
        "provenance": {"source_revision": "BAR-01-BE5", "content_digest": None},
    }
    return summary


def build_openapi(registry_root: Path | None = None) -> dict[str, Any]:
    repository = (
        PortalRegistryRepository(registry_root) if registry_root is not None else None
    )
    app = create_app(portal_registry_repository=repository)
    try:
        return app.openapi()
    finally:
        app.state.run_manager.shutdown()


def build_links_fixture(registry_root: Path) -> dict[str, Any]:
    from portal_api.repositories.portal_links import PortalLinksRepository
    from portal_api.services.portal_links import PortalLinksService

    registry_service = PortalRegistryService(PortalRegistryRepository(registry_root))
    return PortalLinksService(
        PortalLinksRepository(registry_root), registry_service.document
    ).response_document()


async def build_fixtures(
    registry_service: PortalRegistryService,
) -> dict[str, dict[str, Any]]:
    registry_fixture = registry_service.response_document()

    healthy_quantbt = _quantbt_adapter(
        (
            _run("completed-1", "COMPLETED", minutes=4),
            _run("queued-2", "QUEUED", minutes=2),
            _run("completed-3", "COMPLETED", minutes=1),
        ),
        registry_service=registry_service,
    )
    healthy_planning = _planning_adapter(
        _healthy_planning_handler(), registry_service
    )
    empty_quantbt = _quantbt_adapter((), registry_service=registry_service)

    async def empty_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_planning_payload(), request=request)

    empty_planning = _planning_adapter(empty_handler, registry_service)

    async def denied_handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, text="denied", request=request)

    denied_planning = _planning_adapter(denied_handler, registry_service)

    async def connect_failure(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("unreachable", request=request)

    down_planning = _planning_adapter(connect_failure, registry_service)
    down_quantbt = _quantbt_adapter(
        RuntimeError("run source unavailable"),
        historical=RuntimeError("historical unavailable"),
        registry_service=registry_service,
    )

    fixtures: dict[str, dict[str, Any]] = {
        "registry.public.json": registry_fixture,
        "summary.healthy.json": await _collect_service(
            registry_service, healthy_quantbt, healthy_planning
        ),
        "summary.empty.json": await _collect_service(
            registry_service, empty_quantbt, empty_planning
        ),
        "summary.partial.json": await _collect_service(
            registry_service, healthy_quantbt, _local_planning_adapter(registry_service)
        ),
        "summary.denied.json": await _collect_service(
            registry_service, healthy_quantbt, denied_planning
        ),
        "summary.unavailable.json": await _collect_service(
            registry_service, down_quantbt, down_planning
        ),
    }
    fixtures["summary.stale.json"] = _stale_section(
        json.loads(json.dumps(fixtures["summary.healthy.json"]))
    )
    return fixtures


def _load_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        document = json.load(handle)
    assert isinstance(document, dict)
    return document


def validate_fixtures(
    registry_root: Path, fixtures: dict[str, dict[str, Any]]
) -> None:
    schemas = {
        "portal-registry-source.v1": _load_json(
            registry_root / "schemas" / "portal-registry-source.v1.schema.json"
        ),
        "portal-registry.v1": _load_json(
            registry_root / "schemas" / "portal-registry.v1.schema.json"
        ),
        "portal-summary.v1": _load_json(
            registry_root / "schemas" / "portal-summary.v1.schema.json"
        ),
        "portal-links.v1": _load_json(
            registry_root / "schemas" / "portal-links.v1.schema.json"
        ),
    }
    schema_registry = Registry().with_resources(
        (schema["$id"], Resource.from_contents(schema))
        for schema in schemas.values()
    )
    schema_ids = {
        "registry.public.json": (
            "https://schemas.primusspark.com/portal/portal-registry.v1.schema.json"
        ),
        "links.public.json": (
            "https://schemas.primusspark.com/portal/portal-links.v1.schema.json"
        ),
    }
    for name, document in fixtures.items():
        basename = name.rsplit("/", 1)[-1]
        schema_id = schema_ids.get(
            basename,
            "https://schemas.primusspark.com/portal/portal-summary.v1.schema.json",
        )
        validator = Draft202012Validator(
            {"$schema": "https://json-schema.org/draft/2020-12/schema", "$ref": schema_id},
            registry=schema_registry,
            format_checker=FormatChecker(),
        )
        errors = list(validator.iter_errors(document))
        if errors:
            raise SystemExit(
                f"fixture {name} failed its schema: "
                + "; ".join(error.message for error in errors)
            )

    registry_digest = fixtures["fixtures/registry.public.json"]["content_digest"]
    for name, document in fixtures.items():
        if "/summary." in name:
            if document["registry_digest"] != registry_digest:
                raise SystemExit(
                    f"fixture {name} registry digest does not match the registry fixture"
                )
            size = len(json.dumps(document, ensure_ascii=False).encode("utf-8"))
            if size > 50 * 1024:
                raise SystemExit(f"fixture {name} exceeds the 50 KB target: {size}")


def build_artifacts(registry_root: Path) -> dict[str, dict[str, Any]]:
    registry_service = PortalRegistryService(PortalRegistryRepository(registry_root))
    artifacts: dict[str, dict[str, Any]] = {
        "openapi/portal-api.openapi.json": build_openapi(registry_root),
    }
    artifacts.update(
        {
            f"fixtures/{name}": document
            for name, document in asyncio.run(build_fixtures(registry_service)).items()
        }
    )
    artifacts["fixtures/links.public.json"] = build_links_fixture(registry_root)
    validate_fixtures(
        registry_root,
        {name: document for name, document in artifacts.items() if name != "openapi/portal-api.openapi.json"},
    )
    return artifacts


def write_artifacts(registry_root: Path, artifacts: dict[str, dict[str, Any]]) -> None:
    for relative, document in artifacts.items():
        target = registry_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(document, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"wrote {target.relative_to(registry_root.parent)}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--registry-root",
        type=Path,
        default=PORTAL_ROOT / "registry",
        help="registry sidecar directory (default: apps/portal/registry)",
    )
    args = parser.parse_args(argv)
    write_artifacts(args.registry_root, build_artifacts(args.registry_root))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
