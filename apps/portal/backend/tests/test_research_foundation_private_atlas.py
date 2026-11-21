"""P09 private Engine Atlas route boundary proof.

This covers only the Control-API-to-Portal private contract boundary.  It does
not start QuantBT work, read historical data, or expose a browser route.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

import httpx
import pytest

from portal_api.main import create_app


def signed_internal_principal(secret: str) -> str:
    payload = {
        "principalId": "p09-control-api",
        "username": "p09-control-api",
        "accessSubject": None,
        "accessEmail": None,
        "role": "ADMIN",
        "authnMethods": ["portal_session", "research_foundation"],
        "sessionId": "p09-session",
        "mustChangePassword": False,
        "issuedAt": "2026-09-20T00:00:00.000Z",
        "exp": int(time.time()) + 60,
        "policyVersion": "auth-policy-v1",
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("ascii").rstrip("=")
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest()
    ).decode("ascii").rstrip("=")
    return f"{encoded}.{signature}"


@pytest.mark.anyio
async def test_p09_private_atlas_requires_hmac_and_never_mounts_a_browser_equivalent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "p09-test-principal-secret-0123456789"
    monkeypatch.setenv("INTERNAL_PRINCIPAL_SECRET", secret)
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            denied = await client.get("/internal/research/engine-atlas")
            allowed = await client.get(
                "/internal/research/engine-atlas",
                headers={"x-portal-principal": signed_internal_principal(secret)},
            )
            browser_equivalent = await client.get(
                "/api/v1/research/engine-atlas",
                headers={"x-portal-principal": signed_internal_principal(secret)},
            )
    finally:
        app.state.run_manager.shutdown()

    assert denied.status_code == 401
    assert allowed.status_code == 200
    document = allowed.json()
    assert document["schema_version"] == "research-engine-atlas.v1"
    assert len(document["routes"]) == 14
    assert len(document["modes"]) == 5
    assert len(document["claims"]) == 7
    assert "factory" not in allowed.text
    assert browser_equivalent.status_code == 404


@pytest.fixture
def anyio_backend():
    return "asyncio"
