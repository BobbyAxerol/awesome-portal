from __future__ import annotations

import httpx
import pandas as pd
import pytest

from portal_api.adapters.market_data import (
    CRYPTO_BINANCE_DATASET_ID,
    CryptoBinanceMarketDataProvider,
)
from portal_api.main import create_app


class FakeQuantBTGateway:
    def walkforward_capabilities(self):
        return [{"target_mode": "pct_equity", "status": "supported"}]


class ApiCryptoLoader:
    def __init__(self, frame: pd.DataFrame) -> None:
        self._frame = frame

    def load_resampled(self, symbol: str, **kwargs: object) -> pd.DataFrame:
        del kwargs
        frame = self._frame.reset_index(names="time")
        frame.insert(1, "symbol", symbol)
        return frame


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_control_plane_and_preflight(provider, run_request) -> None:
    app = create_app(
        market_data_provider=provider,
        quantbt_gateway=FakeQuantBTGateway(),
    )
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        health = await client.get("/api/health")
        assert health.status_code == 200
        assert health.json()["status"] == "ok"

        strategies = await client.get("/api/strategies")
        assert strategies.status_code == 200
        assert strategies.json()[0]["strategy_id"] == "delta-rsi-polynomial-alpha"

        datasets = await client.get("/api/datasets")
        assert datasets.json()[0]["dataset_id"] == "eth-1d"
        assert datasets.json()[0]["dynamic_query"] is False
        assert datasets.json()[0]["supported_timeframes"] == []

        capabilities = await client.get("/api/capabilities/walk-forward")
        assert capabilities.json()[0]["target_mode"] == "pct_equity"

        preflight = await client.post(
            "/api/runs/preflight",
            json=run_request.model_dump(mode="json"),
        )
        assert preflight.status_code == 200, preflight.text
        payload = preflight.json()
        assert payload["valid"] is True
        assert [item["role"] for item in payload["windows"]] == ["IS", "OOS", "HOLDOUT_LIVE"]
        assert all(item["bars"] > 0 for item in payload["windows"])


@pytest.mark.anyio
async def test_preflight_rejects_dataset_symbol_mismatch(provider, run_request) -> None:
    app = create_app(market_data_provider=provider, quantbt_gateway=FakeQuantBTGateway())
    payload = run_request.model_dump(mode="json")
    payload["symbol"] = "BTCUSDT"

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.post("/api/runs/preflight", json=payload)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "DATA_SCHEMA_INVALID"


@pytest.mark.anyio
async def test_dynamic_crypto_catalog_and_preflight(market_frame, run_request) -> None:
    provider = CryptoBinanceMarketDataProvider(
        "/unused/in/api/test",
        loader_factory=lambda: ApiCryptoLoader(market_frame),
    )
    app = create_app(market_data_provider=provider, quantbt_gateway=FakeQuantBTGateway())
    payload = run_request.model_dump(mode="json")
    payload.update(
        {
            "dataset_id": CRYPTO_BINANCE_DATASET_ID,
            "symbol": "ETHUSDT",
            "timeframe": "1d",
        }
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        catalog = await client.get("/api/datasets")
        response = await client.post("/api/runs/preflight", json=payload)

    assert catalog.status_code == 200
    assert catalog.json()[0]["dataset_id"] == CRYPTO_BINANCE_DATASET_ID
    assert catalog.json()[0]["dynamic_query"] is True
    assert catalog.json()[0]["symbol"] is None
    assert response.status_code == 200, response.text
    quality = response.json()["data_quality"]
    assert quality["load_metadata"]["provider"] == "CryptoBinance1m"
    assert quality["load_metadata"]["requested_timeframe"] == "1d"
