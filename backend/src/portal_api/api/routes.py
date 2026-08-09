from __future__ import annotations

import sys

from fastapi import APIRouter, Request

from portal_api import __version__
from portal_api.domain.requests import PortalRunRequest
from portal_api.domain.responses import HealthResponse, PreflightResponse, StrategyResponse

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="quantbt-portal-backend",
        version=__version__,
        quantbt_loaded="quantbt" in sys.modules,
    )


@router.get("/strategies", response_model=list[StrategyResponse])
async def strategies(request: Request) -> list[StrategyResponse]:
    records = []
    for adapter in request.app.state.strategy_registry.list():
        spec = adapter.specification
        records.append(
            StrategyResponse(
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
        )
    return records


@router.get("/datasets")
async def datasets(request: Request) -> list[dict[str, str]]:
    return [
        {
            "dataset_id": item.dataset_id,
            "symbol": item.symbol,
            "venue": item.venue,
            "timeframe": item.timeframe,
        }
        for item in request.app.state.market_data_provider.list_datasets()
    ]


@router.get("/capabilities/walk-forward")
async def walkforward_capabilities(request: Request) -> list[dict[str, object]]:
    return request.app.state.quantbt_gateway.walkforward_capabilities()


@router.post("/runs/preflight", response_model=PreflightResponse)
async def preflight(payload: PortalRunRequest, request: Request) -> PreflightResponse:
    return request.app.state.preflight_service.run(payload)
