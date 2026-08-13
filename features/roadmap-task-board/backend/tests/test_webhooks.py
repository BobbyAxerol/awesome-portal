from __future__ import annotations

from dataclasses import replace

import httpx

from backend.app.infrastructure.discord import DiscordWebhookService


def _queue_notification(client):
    created = client.post("/api/v1/tasks", json={"title": "Webhook task", "owner": "Bobby"}).json()
    task_id = created["item"]["id"]
    client.post(
        f"/api/v1/tasks/{task_id}/transition",
        json={"status": "Done", "expected_version": created["version"]},
        headers={"X-Portal-Actor": "bobby"},
    )
    return task_id


def test_discord_success_marks_the_persisted_outbox_delivery_sent(client, monkeypatch):
    _queue_notification(client)
    sent_payloads = []

    def post(_self, url, *, json):
        sent_payloads.append((url, json))
        return httpx.Response(204, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.Client, "post", post)
    settings = replace(client.app.state.settings, discord_webhook_url="https://discord.example/webhook")
    service = DiscordWebhookService(client.app.state.repository, settings)

    assert service.flush_pending() == 1
    assert len(sent_payloads) == 1
    assert sent_payloads[0][1]["embeds"][0]["title"] == "Task moved to Done"
    assert client.app.state.repository.due_deliveries() == []


def test_discord_failure_keeps_task_state_and_marks_delivery_for_retry(client, monkeypatch):
    task_id = _queue_notification(client)

    def post(_self, _url, *, json):
        raise httpx.ConnectError("network unavailable", request=httpx.Request("POST", "https://discord.example/webhook"))

    monkeypatch.setattr(httpx.Client, "post", post)
    settings = replace(client.app.state.settings, discord_webhook_url="https://discord.example/webhook")
    service = DiscordWebhookService(client.app.state.repository, settings)

    assert service.flush_pending() == 0
    assert client.get(f"/api/v1/tasks/{task_id}").json()["item"]["status"] == "Done"
    connection = client.app.state.repository._read()
    try:
        delivery = connection.execute("SELECT status, attempt_count, last_error FROM webhook_deliveries").fetchone()
    finally:
        connection.close()
    assert delivery["status"] == "failed"
    assert delivery["attempt_count"] == 1
    assert "network unavailable" in delivery["last_error"]
