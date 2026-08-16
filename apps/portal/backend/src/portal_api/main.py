from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from portal_api.adapters.market_data import (
    HistoricalMarketDataProvider,
    ManifestMarketDataProvider,
    MarketDataProvider,
    UnavailableHistoricalMarketDataProvider,
)
from portal_api.adapters.planning_summary import (
    PlanningSummaryAdapter,
    PlanningSummaryHTTPClient,
    PlanningSummaryRoutes,
    PlanningSummarySettings,
)
from portal_api.adapters.quantbt_summary import (
    CurrentRunSummaryReader,
    HistoricalCapabilityReader,
    QuantBTSummaryAdapter,
    QuantBTSummaryRoutes,
)
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.api.routes import router
from portal_api.api.ingress import IngressContextMiddleware, ingress_request_id
from portal_api.api.routes_portal import router as router_portal
from portal_api.api.routes_alphas import router as router_alphas
from portal_api.api.routes_data import router as router_data
from portal_api.api.routes_runs import router as router_runs
from portal_api.domain.errors import PortalDomainError
from portal_api.repositories import ArtifactRepository
from portal_api.repositories.portal_links import PortalLinksRepository
from portal_api.repositories.portal_registry import PortalRegistryRepository
from portal_api.services import PreflightService
from portal_api.services.alpha_registry import AlphaRegistry
from portal_api.services.data_catalog import DataCatalogService, SnapshotStore
from portal_api.services.engine_capabilities import EngineCapabilityService
from portal_api.services.portal_links import PortalLinksService
from portal_api.services.portal_registry import PortalRegistryService
from portal_api.services.portal_overview import (
    PortalSummaryContractError,
    PortalSummaryService,
    PortalSummarySettings,
)
from portal_api.services.run_service import RunManager
from portal_api.strategies import StrategyRegistry


def _default_provider() -> MarketDataProvider:
    manifest = os.getenv("PORTAL_DATASET_MANIFEST")
    if manifest:
        return ManifestMarketDataProvider(Path(manifest))
    mode = os.getenv("PORTAL_HISTORICAL_DATA_MODE", "disabled").strip().lower()
    if mode not in {"disabled", "optional", "required"}:
        raise RuntimeError(
            "PORTAL_HISTORICAL_DATA_MODE must be disabled, optional or required"
        )
    if mode == "disabled":
        return UnavailableHistoricalMarketDataProvider(
            "historical backtest/research data is disabled in this environment"
        )
    try:
        return HistoricalMarketDataProvider(
            engine=os.getenv("PORTAL_CRYPTO_RESAMPLE_ENGINE", "duckdb"),
        )
    except Exception as exc:
        if mode == "required":
            raise RuntimeError(
                f"required historical market-data capability failed: {exc}"
            ) from exc
        return UnavailableHistoricalMarketDataProvider(str(exc))


def _default_registry_root() -> Path:
    configured = os.getenv("PORTAL_REGISTRY_ROOT")
    if configured:
        return Path(configured)
    module_path = Path(__file__).resolve()
    candidates = (
        module_path.parents[3] / "registry",
        module_path.parents[2] / "registry",
    )
    return next(
        (candidate for candidate in candidates if (candidate / "registry.json").is_file()),
        candidates[0],
    )


def create_app(
    *,
    market_data_provider: MarketDataProvider | None = None,
    strategy_registry: StrategyRegistry | None = None,
    quantbt_gateway: QuantBTGateway | None = None,
    artifact_repository: ArtifactRepository | None = None,
    portal_registry_repository: PortalRegistryRepository | None = None,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        try:
            yield
        finally:
            try:
                await application.state.portal_summary_service.aclose()
            finally:
                application.state.run_manager.shutdown()

    app = FastAPI(
        title="QuantBT Backtest Portal API",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.market_data_provider = market_data_provider or _default_provider()
    app.state.strategy_registry = strategy_registry or StrategyRegistry()
    app.state.quantbt_gateway = quantbt_gateway or QuantBTGateway()
    app.state.artifact_repository = artifact_repository or ArtifactRepository(
        Path(os.getenv("PORTAL_ARTIFACT_ROOT", "artifacts/runs"))
    )
    registry_repository = (
        portal_registry_repository
        or PortalRegistryRepository(_default_registry_root())
    )
    app.state.portal_registry_service = PortalRegistryService(registry_repository)
    app.state.portal_links_service = PortalLinksService(
        PortalLinksRepository(registry_repository.registry_root),
        app.state.portal_registry_service.document,
    )
    quantbt_summary_routes = QuantBTSummaryRoutes.from_registry(
        app.state.portal_registry_service.document
    )
    planning_summary_routes = PlanningSummaryRoutes.from_registry(
        app.state.portal_registry_service.document
    )
    planning_summary_settings = PlanningSummarySettings.from_environment()
    planning_summary_reader = (
        PlanningSummaryHTTPClient(planning_summary_settings)
        if planning_summary_settings.mode == "api"
        else None
    )
    app.state.engine_capabilities = EngineCapabilityService(
        registry_repository.registry_root
    )
    app.state.data_catalog = DataCatalogService(registry_repository.registry_root)
    app.state.alpha_registry = AlphaRegistry(registry_repository.registry_root)
    app.state.snapshot_store = SnapshotStore(
        Path(os.getenv("PORTAL_SNAPSHOT_ROOT", str(Path(os.getenv("PORTAL_ARTIFACT_ROOT", "artifacts/runs")) / "snapshots")))
    )
    app.state.preflight_service = PreflightService(
        app.state.market_data_provider,
        app.state.strategy_registry,
        quantbt_gateway=app.state.quantbt_gateway,
        capabilities=app.state.engine_capabilities,
    )
    app.state.run_manager = RunManager(artifacts=app.state.artifact_repository)
    app.state.quantbt_summary_adapter = QuantBTSummaryAdapter(
        run_reader=CurrentRunSummaryReader(app.state.run_manager),
        historical_reader=HistoricalCapabilityReader(app.state.market_data_provider),
        routes=quantbt_summary_routes,
    )
    app.state.planning_summary_adapter = PlanningSummaryAdapter(
        mode=planning_summary_settings.mode,
        reader=planning_summary_reader,
        routes=planning_summary_routes,
    )
    app.state.portal_summary_service = PortalSummaryService(
        registry_service=app.state.portal_registry_service,
        adapters=(
            app.state.quantbt_summary_adapter,
            app.state.planning_summary_adapter,
        ),
        settings=PortalSummarySettings.from_environment(),
    )

    @app.exception_handler(PortalDomainError)
    async def domain_error_handler(request: Request, exc: PortalDomainError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {"code": exc.code, "message": str(exc)},
                "request_id": ingress_request_id(request),
            },
        )

    @app.exception_handler(PortalSummaryContractError)
    async def summary_contract_error_handler(
        request: Request, exc: PortalSummaryContractError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={
                "error": {"code": exc.code, "message": str(exc)},
                "request_id": ingress_request_id(request),
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "request_id": ingress_request_id(request),
            },
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        from fastapi.encoders import jsonable_encoder

        return JSONResponse(
            status_code=422,
            content={
                "detail": jsonable_encoder(exc.errors()),
                "request_id": ingress_request_id(request),
            },
        )

    app.add_middleware(IngressContextMiddleware)
    app.include_router(router)
    app.include_router(router_portal)
    app.include_router(router_runs)
    app.include_router(router_data)
    app.include_router(router_alphas)
    return app


app = create_app()
