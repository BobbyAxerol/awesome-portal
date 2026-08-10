from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from portal_api.adapters.market_data import (
    CryptoBinanceMarketDataProvider,
    ManifestMarketDataProvider,
    MarketDataProvider,
)
from portal_api.adapters.quantbt import QuantBTGateway
from portal_api.api.routes import router
from portal_api.api.routes_runs import router as router_runs
from portal_api.domain.errors import PortalDomainError
from portal_api.repositories import ArtifactRepository
from portal_api.services import PreflightService
from portal_api.services.run_service import RunManager
from portal_api.strategies import StrategyRegistry


def _default_provider() -> MarketDataProvider:
    manifest = os.getenv("PORTAL_DATASET_MANIFEST")
    if manifest:
        return ManifestMarketDataProvider(Path(manifest))
    pool_alpha_root = Path(__file__).resolve().parents[4]
    loader_root = Path(
        os.getenv(
            "PORTAL_CRYPTO_DATA_ROOT",
            str(pool_alpha_root / "alphas_storage" / "_get_data"),
        )
    )
    return CryptoBinanceMarketDataProvider(
        loader_root,
        engine=os.getenv("PORTAL_CRYPTO_RESAMPLE_ENGINE", "duckdb"),
    )


def create_app(
    *,
    market_data_provider: MarketDataProvider | None = None,
    strategy_registry: StrategyRegistry | None = None,
    quantbt_gateway: QuantBTGateway | None = None,
    artifact_repository: ArtifactRepository | None = None,
) -> FastAPI:
    app = FastAPI(
        title="QuantBT Backtest Portal API",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url=None,
    )
    app.state.market_data_provider = market_data_provider or _default_provider()
    app.state.strategy_registry = strategy_registry or StrategyRegistry()
    app.state.quantbt_gateway = quantbt_gateway or QuantBTGateway()
    app.state.artifact_repository = artifact_repository or ArtifactRepository(
        Path(os.getenv("PORTAL_ARTIFACT_ROOT", "artifacts/runs"))
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
    app.include_router(router_runs)
    return app


app = create_app()
