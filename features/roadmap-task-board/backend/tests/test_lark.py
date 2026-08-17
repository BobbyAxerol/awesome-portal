from __future__ import annotations

import base64
import hashlib
import hmac
from dataclasses import replace

import httpx

from backend.app.infrastructure.lark import LarkWebhookService


def _queue_notification(client, channel: str = "lark"):
    client.app.state.repository.notification_channels = ("discord", "lark")
    created = client.post(
        "/api/v1/tasks",
        json={"title": "Lark webhook task", "owner": "Bobby", "workstream": "Research"},
    ).json()
    task_id = created["item"]["id"]
    client.post(
        f"/api/v1/tasks/{task_id}/transition",
        json={"status": "Done", "expected_version": created["version"]},
        headers={"X-Portal-Actor": "bobby"},
    )
    return task_id


def _expected_sign(timestamp: str, secret: str) -> str:
    string_to_sign = f"{timestamp}\n{secret}".encode("utf-8")
    digest = hmac.new(string_to_sign, digestmod=hashlib.sha256).digest()
    return base64.b64encode(digest).decode("ascii")


def test_signature_matches_feishu_custom_bot_algorithm():
    assert LarkWebhookService._sign("1700000000", "secret") == _expected_sign("1700000000", "secret")


def test_lark_success_marks_outbox_delivery_sent(client, monkeypatch):
    _queue_notification(client)
    sent_payloads = []

    def post(_self, url, *, json):
        sent_payloads.append((url, json))
        return httpx.Response(
            200, json={"code": 0, "msg": "success"}, request=httpx.Request("POST", url)
        )

    monkeypatch.setattr(httpx.Client, "post", post)
    settings = replace(
        client.app.state.settings,
        lark_webhook_url="https://open.larksuite.com/open-apis/bot/v2/hook/test",
        lark_webhook_sign_secret="sign-secret",
        notification_channels=("discord", "lark"),
    )
    repository = client.app.state.repository
    service = LarkWebhookService(repository, settings)

    assert service.flush_pending() == 1
    assert len(sent_payloads) == 1
    url, payload = sent_payloads[0]
    assert url == "https://open.larksuite.com/open-apis/bot/v2/hook/test"
    assert payload["msg_type"] == "text"
    assert payload["sign"] == _expected_sign(payload["timestamp"], "sign-secret")
    assert "Done" in payload["content"]["text"]
    remaining = client.app.state.repository.due_deliveries()
    assert len(remaining) == 1
    assert remaining[0]["channel"] == "discord"


def test_lark_delivery_is_isolated_from_discord_channel(client, monkeypatch):
    _queue_notification(client)
    sent = []

    def post(_self, url, *, json):
        sent.append(url)
        return httpx.Response(
            200, json={"code": 0, "msg": "success"}, request=httpx.Request("POST", url)
        )

    monkeypatch.setattr(httpx.Client, "post", post)
    settings = replace(
        client.app.state.settings,
        lark_webhook_url="https://open.larksuite.com/open-apis/bot/v2/hook/test",
        lark_webhook_sign_secret="sign-secret",
        notification_channels=("discord", "lark"),
    )
    repository = client.app.state.repository
    service = LarkWebhookService(repository, settings)

    assert service.flush_pending() == 1
    assert len(sent) == 1
    remaining = client.app.state.repository.due_deliveries()
    assert len(remaining) == 1
    assert remaining[0]["channel"] == "discord"


def test_lark_disabled_without_url_returns_zero(client, monkeypatch):
    _queue_notification(client)
    service = LarkWebhookService(client.app.state.repository, client.app.state.settings)
    assert service.flush_pending() == 0


def test_lark_failure_marks_delivery_for_retry(client, monkeypatch):
    _queue_notification(client)

    def post(_self, _url, *, json):
        raise httpx.ConnectError("network unavailable", request=httpx.Request("POST", "https://open.larksuite.com/open-apis/bot/v2/hook/test"))

    monkeypatch.setattr(httpx.Client, "post", post)
    settings = replace(
        client.app.state.settings,
        lark_webhook_url="https://open.larksuite.com/open-apis/bot/v2/hook/test",
        lark_webhook_sign_secret="sign-secret",
        notification_channels=("discord", "lark"),
    )
    repository = client.app.state.repository
    service = LarkWebhookService(repository, settings)

    assert service.flush_pending() == 0
    connection = client.app.state.repository._read()
    try:
        delivery = connection.execute(
            "SELECT status, attempt_count, last_error FROM webhook_deliveries WHERE channel = 'lark'"
        ).fetchone()
    finally:
        connection.close()
    assert delivery["status"] == "failed"
    assert delivery["attempt_count"] == 1
    assert "network unavailable" in delivery["last_error"]