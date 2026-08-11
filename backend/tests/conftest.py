from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.config import Settings
from backend.app.main import create_app


@pytest.fixture
def client(tmp_path: Path):
    settings = Settings(
        database_path=tmp_path / "portal-test.db",
        portal_file=Path(__file__).resolve().parents[2] / "quant_trading_ecosystem_architecture_migration_portal_vi.html",
        discord_webhook_url=None,
        portal_url="http://testserver",
        default_actor="test-user",
        cors_origins=("http://testserver",),
        webhook_max_attempts=3,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client
