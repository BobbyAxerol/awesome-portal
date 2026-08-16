from __future__ import annotations

import os
import sys
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Request

from portal_api import __version__
from portal_api.api.ingress import ingress_request_id, ingress_traceparent
from portal_api.domain.enums import OptimizationMode, OptimizationSchedule, RunProtocol
from portal_api.domain.errors import PortalDomainError
from portal_api.domain.requests import PortalRunRequest
from portal_api.domain.requests import (
    AccountConfig,
    AdvancedWalkForwardConfig,
    ExecutionConfig,
    OptimizationConfig,
    ThreeWindowConfig,
)
from portal_api.domain.responses import (
    DependenciesReport,
    DependencyState,
    DiagnosticsResponse,
    HealthResponse,
    HistoricalDataDependency,
    IngressDiagnostics,
    PlanningSummaryDependency,
    PreflightResponse,
    ReadinessResponse,
    RegistryDependency,
    StrategyResponse,
    WorkerDependency,
)

router = APIRouter(prefix="/api")


def _strategy_response(adapter) -> StrategyResponse:
    spec = adapter.specification
    return StrategyResponse(
        strategy_id=spec.strategy_id,
        display_name=spec.display_name,
        version=spec.version,
        default_timeframe=spec.default_timeframe,
        required_columns=spec.required_columns,
        structural_contract=spec.structural_contract,
        parameter_space={
            key: {"low": value[0], "high": value[1], "step": value[2]}
            for key, value in spec.parameter_space.items()
        },
    )


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="portal-api",
        version=__version__,
        quantbt_loaded="quantbt" in sys.modules,
    )


@router.get("/ready", response_model=ReadinessResponse)
async def ready(request: Request) -> ReadinessResponse:
    registry = request.app.state.portal_registry_service.document
    return ReadinessResponse(
        status="ready",
        service="portal-api",
        version=__version__,
        registry_schema_version=registry.schema_version,
        registry_revision=registry.revision,
        registry_digest=registry.content_digest,
    )


@router.get("/diagnostics", response_model=DiagnosticsResponse)
async def diagnostics(request: Request) -> DiagnosticsResponse:
    """Dependency diagnostics without topology, path or secret exposure."""
    state = request.app.state
    registry = state.portal_registry_service.document

    mode = os.getenv("PORTAL_HISTORICAL_DATA_MODE", "disabled").strip().lower()
    provider = state.market_data_provider
    try:
        descriptors = provider.list_datasets()
    except Exception:  # noqa: BLE001 - diagnostics degrade, never leak
        descriptors = ()
    historical_available = sum(
        1 for item in descriptors if item.availability == "available"
    )

    planning_adapter = state.planning_summary_adapter
    try:
        state.quantbt_gateway.version()
        engine_state: Literal["available", "unavailable"] = "available"
    except Exception:  # noqa: BLE001
        engine_state = "unavailable"
    report = DependenciesReport(
        registry=RegistryDependency(
            state="ready",
            detail=None,
            digest=registry.content_digest,
        ),
        artifact_store=DependencyState(
            state=(
                "available"
                if state.artifact_repository.root.is_dir()
                else "unavailable"
            ),
            detail=None,
        ),
        historical_data=HistoricalDataDependency(
            state=(
                "disabled"
                if mode == "disabled"
                else "available"
                if historical_available > 0
                else "unavailable"
            ),
            detail=None,
            mode=mode,
            datasets=historical_available,
        ),
        quantbt_engine=DependencyState(
            state=engine_state,
            detail=None,
        ),
        planning_summary=PlanningSummaryDependency(
            state="available" if planning_adapter.mode == "api" else "disabled",
            detail=None,
            mode=planning_adapter.mode,
        ),
        run_worker=WorkerDependency(
            state="available",
            detail=None,
            max_workers=state.run_manager.max_workers,
        ),
    )
    return DiagnosticsResponse(
        status="ok",
        service="portal-api",
        version=__version__,
        checked_at=datetime.now(UTC),
        request_id=ingress_request_id(request),
        traceparent=ingress_traceparent(request),
        ingress=IngressDiagnostics(
            forwarded_proto=request.headers.get("x-forwarded-proto"),
            forwarded_for_present="x-forwarded-for" in request.headers,
        ),
        dependencies=report,
    )


@router.get("/strategies", response_model=list[StrategyResponse])
async def strategies(request: Request) -> list[StrategyResponse]:
    return [_strategy_response(adapter) for adapter in request.app.state.strategy_registry.list()]


@router.get("/strategies/{strategy_id}", response_model=StrategyResponse)
async def strategy(strategy_id: str, request: Request) -> StrategyResponse:
    try:
        adapter = request.app.state.strategy_registry.get(strategy_id)
    except PortalDomainError as exc:
        raise HTTPException(status_code=404, detail=f"unknown strategy: {strategy_id}") from exc
    return _strategy_response(adapter)


@router.get("/datasets")
async def datasets(request: Request) -> list[dict[str, object]]:
    return [
        {
            "dataset_id": item.dataset_id,
            "symbol": item.symbol,
            "venue": item.venue,
            "timeframe": item.timeframe,
            "dynamic_query": item.dynamic_query,
            "supported_timeframes": list(item.supported_timeframes),
            "source_class": item.source_class,
            "data_kind": item.data_kind,
            "availability": item.availability,
            "unavailable_reason": item.unavailable_reason,
            "usage_scopes": list(item.usage_scopes),
            "excluded_scopes": list(item.excluded_scopes),
            "source_timezone": item.source_timezone,
        }
        for item in request.app.state.market_data_provider.list_datasets()
    ]


@router.get("/capabilities/walk-forward")
async def walkforward_capabilities(request: Request) -> list[dict[str, object]]:
    return request.app.state.quantbt_gateway.walkforward_capabilities()


@router.get("/config/options")
async def config_options() -> dict[str, object]:
    """Curated UI contract backed by the same validated domain defaults."""
    return {
        "schema_version": "1",
        "protocols": [item.value for item in RunProtocol],
        "target_modes": ["pct_equity"],
        "optimization_modes": [item.value for item in OptimizationMode],
        "optimization_schedules": [item.value for item in OptimizationSchedule],
        "split_frequencies": [
            "single",
            "yearly",
            "semi_yearly",
            "quarterly",
            "monthly",
            "weekly",
        ],
        "window_modes": ["expanding", "rolling"],
        "position_boundary_policies": ["carry"],
        "candidate_selection_metrics": [
            "robust_decay",
            "mean_oos_sharpe",
            "mean_is_sharpe",
            "is_plateau_robust",
            "is_only_robust",
            "full_robust",
            "full_plateau_robust",
            "full_temporal_robust",
            "full_best",
        ],
        "compatibility": {
            "per_fold_decay": {"optimization_mode": "mode_1_decay", "selection_metric": "robust_decay"},
            "per_fold_causal": {"optimization_mode": "mode_4_is_only_robust", "selection_metric": "is_only_robust"},
            "mode_2_sbb": {"scoring_backend": "proxy"},
        },
        "defaults": {
            "account": AccountConfig().model_dump(mode="json"),
            "execution": ExecutionConfig().model_dump(mode="json"),
            "optimization": OptimizationConfig().model_dump(mode="json"),
            "three_window": ThreeWindowConfig().model_dump(mode="json"),
            "advanced_walk_forward": AdvancedWalkForwardConfig().model_dump(mode="json"),
        },
    }


@router.post("/runs/preflight", response_model=PreflightResponse)
async def preflight(payload: PortalRunRequest, request: Request) -> PreflightResponse:
    return request.app.state.preflight_service.run(payload)
