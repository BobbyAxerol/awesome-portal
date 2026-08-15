from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from portal_api.adapters.market_data import (
    HistoricalMarketDataProvider,
    ManifestMarketDataProvider,
    MarketDataProvider,
    UnavailableHistoricalMarketDataProvider,
)
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.api.routes import router
from portal_api.api.routes_portal import router as router_portal
from portal_api.api.routes_runs import router as router_runs
from portal_api.domain.errors import PortalDomainError
from portal_api.repositories import ArtifactRepository
from portal_api.repositories.portal_registry import PortalRegistryRepository
from portal_api.services import PreflightService
from portal_api.services.portal_registry import PortalRegistryService
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
        yield
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
    app.state.portal_registry_service = PortalRegistryService(
        portal_registry_repository or PortalRegistryRepository(_default_registry_root())
    )
    app.state.preflight_service = PreflightService(
        app.state.market_data_provider,
        app.state.strategy_registry,
        quantbt_gateway=app.state.quantbt_gateway,
    )
    app.state.run_manager = RunManager(artifacts=app.state.artifact_repository)

    @app.exception_handler(PortalDomainError)
    async def domain_error_handler(request: Request, exc: PortalDomainError) -> JSONResponse:
        del request
        return JSONResponse(
            status_code=422,
            content={"error": {"code": exc.code, "message": str(exc)}},
        )

    app.include_router(router)
    app.include_router(router_portal)
    app.include_router(router_runs)
    return app


app = create_app()
