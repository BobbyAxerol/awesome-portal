from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import pytest

from backend.app.config import Settings
from backend.app.infrastructure.database import connect, initialize
from backend.app.infrastructure.discord import DiscordWebhookService


def _task(title: str, task_id: str) -> dict[str, object]:
    return {"id": task_id, "title": title, "status": "Backlog"}


def test_legacy_snapshot_is_idempotent_and_keeps_column_positions(client):
    items = [
        {**_task("First backlog", "T-1"), "status": "Backlog"},
        {**_task("Ready task", "T-2"), "status": "Ready"},
        {**_task("Second backlog", "T-3"), "status": "Backlog"},
    ]
    assert client.put("/api/tasks", json=items).json() == {"ok": True, "saved": 3}
    first_versions = {entry["item"]["id"]: entry["version"] for entry in client.get("/api/v1/tasks").json()["items"]}
    assert client.put("/api/tasks", json=items).json() == {"ok": True, "saved": 3}
    after = client.get("/api/v1/tasks").json()["items"]
    assert {entry["item"]["id"]: entry["version"] for entry in after} == first_versions
    assert [(entry["item"]["id"], entry["position"]) for entry in after] == [
        ("T-1", 0),
        ("T-3", 1),
        ("T-2", 0),
    ]


def test_reorder_invalidates_shifted_tasks_and_transition_is_one_atomic_command(client):
    created = [client.post("/api/v1/tasks", json=_task(f"Task {index}", f"T-{index}")).json() for index in range(1, 4)]
    original_second_version = created[1]["version"]
    moved = client.post(
        "/api/v1/tasks/T-3/move",
        json={"status": "Backlog", "position": 0, "expected_version": created[2]["version"]},
    )
    assert moved.status_code == 200
    assert [entry["item"]["id"] for entry in client.get("/api/v1/tasks").json()["items"]] == ["T-3", "T-1", "T-2"]
    stale = client.patch("/api/v1/tasks/T-2", json={"owner": "Other", "expected_version": original_second_version})
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "version_conflict"

    latest = client.get("/api/v1/tasks/T-3").json()
    transitioned = client.post(
        "/api/v1/tasks/T-3/transition",
        json={"status": "Done", "expected_version": latest["version"]},
    )
    assert transitioned.status_code == 200
    assert transitioned.json()["item"]["status"] == "Done"
    assert client.get("/api/v1/tasks/T-3/activity").json()["items"][0]["type"] == "task.status_changed"


def test_unchanged_transition_does_not_add_audit_noise_or_bump_version(client):
    created = client.post("/api/v1/tasks", json=_task("Already ready", "T-ready") | {"status": "Ready"}).json()
    unchanged = client.post(
        "/api/v1/tasks/T-ready/transition",
        json={"status": "Ready", "expected_version": created["version"]},
    )
    assert unchanged.status_code == 200
    assert unchanged.json()["version"] == created["version"]
    assert [event["type"] for event in client.get("/api/v1/tasks/T-ready/activity").json()["items"]] == ["task.created"]


def test_error_envelope_readiness_and_export_do_not_expose_runtime_secrets(client):
    invalid = client.post("/api/v1/tasks", json={"title": "", "extra": "not allowed"})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "validation_error"
    assert invalid.headers["X-Request-ID"] == invalid.json()["request_id"]

    missing = client.get("/api/v1/tasks/missing")
    assert missing.status_code == 404
    assert missing.json()["error"] == {"code": "not_found", "message": "task not found"}

    ready = client.get("/api/ready")
    assert ready.status_code == 200
    assert ready.json()["ok"] is True
    assert "0002_delivery_claims" in ready.json()["migrations"]

    client.post("/api/v1/tasks", json=_task("Exportable", "T-export"))
    exported = client.get("/api/v1/export").json()
    assert exported["schema_version"] == 1
    assert exported["tasks"][0]["id"] == "T-export"
    assert exported["tasks"][0]["title"] == "Exportable"
    assert "DISCORD_WEBHOOK_URL" not in str(exported)


def test_import_requires_explicit_replacement_confirmation(client):
    rejected = client.post("/api/v1/tasks/import", json={"items": [_task("Imported", "T-import")]})
    assert rejected.status_code == 422
    accepted = client.post(
        "/api/v1/tasks/import",
        json={"items": [_task("Imported", "T-import")], "confirm_replace": True},
    )
    assert accepted.status_code == 200
    assert accepted.json()["replaced"] == 1


def test_legacy_database_is_migrated_without_losing_rows(tmp_path: Path):
    database_path = tmp_path / "legacy.db"
    # Simulate the old database created before delivery claim fields existed.
    connection = connect(database_path)
    try:
        connection.executescript(
            """
            CREATE TABLE webhook_deliveries (
              id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, event_type TEXT NOT NULL,
              status TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0,
              last_error TEXT, next_attempt_at TEXT, created_at TEXT NOT NULL, sent_at TEXT
            );
            INSERT INTO webhook_deliveries (id, activity_id, event_type, status, attempt_count, created_at)
            VALUES ('old-delivery', 'evt-1', 'task.status_changed', 'pending', 0, '2026-01-01T00:00:00Z');
            """
        )
    finally:
        connection.close()

    initialize(database_path)
    migrated = connect(database_path)
    try:
        columns = {row["name"] for row in migrated.execute("PRAGMA table_info(webhook_deliveries)")}
        assert {"claim_token", "lease_expires_at"}.issubset(columns)
        assert migrated.execute("SELECT id FROM webhook_deliveries").fetchone()["id"] == "old-delivery"
    finally:
        migrated.close()


def test_delivery_claim_prevents_duplicate_post_with_concurrent_workers(client, monkeypatch):
    created = client.post("/api/v1/tasks", json=_task("Notify once", "T-notify")).json()
    client.post(
        "/api/v1/tasks/T-notify/transition",
        json={"status": "Done", "expected_version": created["version"]},
    )
    calls: list[dict[str, object]] = []

    def post(_self, _url, *, json):
        calls.append(json)
        return httpx.Response(204, request=httpx.Request("POST", "https://discord.example/webhook"))

    monkeypatch.setattr(httpx.Client, "post", post)
    settings = Settings(
        database_path=client.app.state.settings.database_path,
        portal_file=client.app.state.settings.portal_file,
        discord_webhook_url="https://discord.example/webhook",
        portal_url="http://testserver",
        default_actor="test-user",
        cors_origins=(),
        webhook_max_attempts=3,
        environment="test",
        webhook_retry_base_seconds=1,
        webhook_lease_seconds=60,
    )
    first = DiscordWebhookService(client.app.state.repository, settings)
    second = DiscordWebhookService(client.app.state.repository, settings)
    with ThreadPoolExecutor(max_workers=2) as workers:
        results = list(workers.map(lambda service: service.flush_pending(), [first, second]))
    assert sum(results) == 1
    assert len(calls) == 1
    assert calls[0]["allowed_mentions"] == {"parse": []}


def test_production_config_requires_explicit_cors_and_https_webhook(monkeypatch, tmp_path: Path):
    monkeypatch.setenv("PORTAL_ENV", "production")
    monkeypatch.setenv("PORTAL_DATABASE_PATH", str(tmp_path / "portal.db"))
    monkeypatch.delenv("PORTAL_CORS_ORIGINS", raising=False)
    monkeypatch.delenv("DISCORD_WEBHOOK_URL", raising=False)
    production = Settings.from_environment()
    assert production.cors_origins == ()

    monkeypatch.setenv("PORTAL_CORS_ORIGINS", "*")
    with pytest.raises(ValueError, match="explicit allowlist"):
        Settings.from_environment()

    monkeypatch.setenv("PORTAL_CORS_ORIGINS", "https://portal.example")
    monkeypatch.setenv("DISCORD_WEBHOOK_URL", "http://discord.example/webhook")
    with pytest.raises(ValueError, match="HTTPS"):
        Settings.from_environment()
