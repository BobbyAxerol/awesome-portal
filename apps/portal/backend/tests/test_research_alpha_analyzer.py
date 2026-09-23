"""P07 private AST analyser and HMAC boundary tests.

These tests deliberately exercise only the server-side parser route.  They do
not turn P07 into a QuantBT execution test: uploaded source is never called,
imported, written to an artifact path, or permitted to mutate the protected
strategy kernel.
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
from portal_api.services.research_alpha_analyzer import analyze_alpha_source


def valid_source(*, version: str = "0.3.0", marker: str = "baseline") -> str:
    return f'''# {marker}
ALPHA_CONTRACT = {{
    "schema_version": "research.alpha-source.v1",
    "version": "{version}",
    "entrypoint": "generate_signals",
    "timeframes": ["1h"],
    "required_columns": ["open", "high", "low", "close", "volume"],
    "warmup_bars": 32,
    "determinism": {{"seed_required": True}},
    "parameter_space": {{"window": {{"kind": "int_range", "low": 8, "high": 64, "step": 1}}}},
}}
def generate_signals(context):
    return context
'''


def signed_internal_principal(secret: str) -> str:
    payload = {
        "principalId": "p07-user-a",
        "username": "p07-user-a",
        "accessSubject": None,
        "accessEmail": None,
        "role": "ADMIN",
        "authnMethods": ["portal_session", "research_alpha_import"],
        "sessionId": "p07-session",
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


def test_p07_t01_valid_contract_is_parseable_without_executing_strategy_body() -> None:
    source = valid_source().replace(
        "    return context", "    raise RuntimeError('this body must never execute')"
    )
    result = analyze_alpha_source(source, "alpha.py")

    assert result.parse_ok is True
    assert result.gate_facts.contract_complete is True
    assert result.gate_facts.entrypoint_restricted_definition_load is True
    assert result.gate_facts.parameter_space_sane is True
    assert result.gate_facts.no_lookahead_static_scan is True
    assert result.declared_contract["entrypoint"] == "generate_signals"
    assert {"field": "version", "state": "parsed", "value": "0.3.0"} in result.mirror


@pytest.mark.parametrize(
    "source",
    [
        valid_source().replace('"warmup_bars": 32,\n', ""),
        valid_source().replace(
            '"parameter_space": {"window": {"kind": "int_range", "low": 8, "high": 64, "step": 1}}',
            '"parameter_space": {' + ", ".join(
                f'"p{index}": {{"kind": "fixed", "value": {index}}}' for index in range(13)
            ) + "}",
        ),
    ],
)
def test_p07_t02_missing_contract_or_oversized_parameter_space_fails(source: str) -> None:
    result = analyze_alpha_source(source, "alpha.py")
    assert result.parse_ok is True
    assert result.gate_facts.contract_complete is False or result.gate_facts.parameter_space_sane is False


@pytest.mark.parametrize(
    "source",
    [
        "import os\n" + valid_source(),
        "open('/tmp/forbidden', 'w')\n" + valid_source(),
        "subprocess.run(['id'])\n" + valid_source(),
        "x = [0] * 10_000_000\n" + valid_source(),
    ],
)
def test_p07_t03_top_level_side_effect_shapes_are_rejected_without_execution(source: str) -> None:
    result = analyze_alpha_source(source, "alpha.py")
    assert result.parse_ok is True
    assert result.gate_facts.entrypoint_restricted_definition_load is False
    assert "module scope" in result.gate_facts.entrypoint_message.lower() or "imports" in result.gate_facts.entrypoint_message.lower()


def test_p07_t08_static_scan_is_explicitly_not_a_causality_certificate() -> None:
    accepted = analyze_alpha_source(valid_source(), "alpha.py")
    suspicious = analyze_alpha_source(valid_source().replace("return context", "return context.future"), "alpha.py")

    assert "not a runtime causality certificate" in accepted.gate_facts.no_lookahead_message.lower()
    assert suspicious.gate_facts.no_lookahead_static_scan is False
    assert "future-data" in suspicious.gate_facts.no_lookahead_message


@pytest.mark.anyio
async def test_p07_private_route_requires_control_api_hmac_and_never_mounts_under_public_api(monkeypatch) -> None:
    secret = "p07-test-principal-secret-0123456789"
    monkeypatch.setenv("INTERNAL_PRINCIPAL_SECRET", secret)
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        ) as client:
            denied = await client.post(
                "/internal/research/alpha-analysis",
                json={"original_filename": "alpha.py", "source_text": valid_source()},
            )
            allowed = await client.post(
                "/internal/research/alpha-analysis",
                headers={"x-portal-principal": signed_internal_principal(secret)},
                json={"original_filename": "alpha.py", "source_text": valid_source()},
            )
            public = await client.post(
                "/api/v1/research/alpha-analysis",
                headers={"x-portal-principal": signed_internal_principal(secret)},
                json={"original_filename": "alpha.py", "source_text": valid_source()},
            )
    finally:
        app.state.run_manager.shutdown()

    assert denied.status_code == 401
    assert allowed.status_code == 200
    assert allowed.json()["parse_ok"] is True
    assert public.status_code == 404


@pytest.fixture
def anyio_backend():
    return "asyncio"
