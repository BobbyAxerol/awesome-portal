from __future__ import annotations

import base64
import hashlib
import hmac
import json
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
    assert "Người thao tác: bobby" in payload["content"]["text"]
    assert "Task: `" in payload["content"]["text"]
    assert "Mô tả: Chưa có mô tả" in payload["content"]["text"]
    assert "Giao lúc:" in payload["content"]["text"]
    assert "Deadline: Chưa đặt · Chưa tính được" in payload["content"]["text"]
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


def test_lark_malformed_success_response_is_retried(client, monkeypatch):
    _queue_notification(client)

    def post(_self, url, *, json):
        return httpx.Response(200, text="not-json", request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.Client, "post", post)
    settings = replace(
        client.app.state.settings,
        lark_webhook_url="https://open.larksuite.com/open-apis/bot/v2/hook/test",
        lark_webhook_sign_secret="sign-secret",
        notification_channels=("discord", "lark"),
    )
    service = LarkWebhookService(client.app.state.repository, settings)

    assert service.flush_pending() == 0
    connection = client.app.state.repository._read()
    try:
        delivery = connection.execute(
            "SELECT status, attempt_count FROM webhook_deliveries WHERE channel = 'lark'"
        ).fetchone()
    finally:
        connection.close()
    assert delivery["status"] == "failed"
    assert delivery["attempt_count"] == 1


def test_lark_mentions_owner_when_mapped(client, monkeypatch):
    client.app.state.repository.notification_channels = ("discord", "lark")
    created = client.post(
        "/api/v1/tasks",
        json={"title": "Mention task", "owner": "Bobby", "workstream": "Research"},
    ).json()
    client.post(
        f"/api/v1/tasks/{created['item']['id']}/transition",
        json={"status": "Done", "expected_version": created["version"]},
        headers={"X-Portal-Actor": "bobby"},
    )
    sent_payloads = []

    def post(_self, url, *, json):
        sent_payloads.append(json)
        return httpx.Response(200, json={"code": 0, "msg": "success"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.Client, "post", post)
    settings = replace(
        client.app.state.settings,
        lark_webhook_url="https://open.larksuite.com/open-apis/bot/v2/hook/test",
        lark_webhook_sign_secret="sign-secret",
        lark_mention_map={"Bobby": "ou_00000000000000000000000000000000", "Thanh Vuong": "ou_11111111111111111111111111111111"},
    )
    service = LarkWebhookService(client.app.state.repository, settings)
    assert service.flush_pending() == 1
    text = sent_payloads[0]["content"]["text"]
    assert '<at user_id="ou_00000000000000000000000000000000">Bobby</at>' in text
    assert "Thanh Vuong" not in text


def test_lark_mentions_assignee_across_safe_name_aliases(client, monkeypatch):
    client.app.state.repository.notification_channels = ("lark",)
    created = client.post(
        "/api/v1/tasks",
        json={
            "title": "Alias mention task",
            "owner": "Thanh Vuong",
            "notes": "Verify the stable Lark message contract.",
            "created": "2026-08-27T09:00:00Z",
            "weeks": "Week 35",
        },
    ).json()
    client.post(
        f"/api/v1/tasks/{created['item']['id']}/transition",
        json={"status": "In Progress", "expected_version": created["version"]},
        headers={"X-Portal-Actor": "bobby"},
    )
    sent_payloads = []

    def post(_self, url, *, json):
        sent_payloads.append(json)
        return httpx.Response(200, json={"code": 0}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.Client, "post", post)
    settings = replace(
        client.app.state.settings,
        lark_webhook_url="https://open.larksuite.com/open-apis/bot/v2/hook/test",
        lark_mention_map={"thanhvuong": "ou_11111111111111111111111111111111"},
        notification_channels=("lark",),
    )
    assert LarkWebhookService(client.app.state.repository, settings).flush_pending() == 1
    text = sent_payloads[0]["content"]["text"]
    assert '<at user_id="ou_11111111111111111111111111111111">Thanh Vuong</at>' in text
    assert "Mô tả: Verify the stable Lark message contract." in text
    assert "Giao lúc: 2026-08-27T09:00:00Z" in text
    assert "Timeline: Week 35" in text


def test_lark_never_mentions_unknown_owner(client, monkeypatch):
    client.app.state.repository.notification_channels = ("discord", "lark")
    created = client.post(
        "/api/v1/tasks",
        json={"title": "No mention task", "owner": "Someone Else"},
    ).json()
    client.post(
        f"/api/v1/tasks/{created['item']['id']}/transition",
        json={"status": "Done", "expected_version": created["version"]},
        headers={"X-Portal-Actor": "bobby"},
    )
    sent_payloads = []

    def post(_self, url, *, json):
        sent_payloads.append(json)
        return httpx.Response(200, json={"code": 0, "msg": "success"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.Client, "post", post)
    settings = replace(
        client.app.state.settings,
        lark_webhook_url="https://open.larksuite.com/open-apis/bot/v2/hook/test",
        lark_webhook_sign_secret="sign-secret",
        lark_mention_map={"Bobby": "ou_00000000000000000000000000000000"},
    )
    service = LarkWebhookService(client.app.state.repository, settings)
    assert service.flush_pending() == 1
    text = sent_payloads[0]["content"]["text"]
    assert "<at" not in text


def test_lark_escapes_user_supplied_mention_markup(client):
    settings = replace(
        client.app.state.settings,
        lark_mention_map={"bobby": "ou_00000000000000000000000000000000"},
        portal_url="https://portal.example/roadmap-task-board",
    )
    delivery = {
        "entity_id": "T-ESCAPE",
        "actor": "bobby",
        "before_json": '{"item":{"status":"Ready"}}',
        "after_json": (
            '{"item":{"id":"T-ESCAPE","status":"In Progress",'
            '"title":"<at user_id=\\"all\\">all</at>","owner":"Unknown"}}'
        ),
    }
    text = LarkWebhookService(client.app.state.repository, settings)._text(delivery)
    assert '<at user_id="all">' not in text
    assert "‹at user_id=" in text
    assert text.count("https://portal.example/roadmap-task-board") == 1
    assert "/roadmap-task-board/roadmap-task-board" not in text


def test_lark_card_uses_bounded_safe_fields_and_configured_mention_only(client):
    settings = replace(
        client.app.state.settings,
        lark_message_format="card",
        lark_mention_map={"bobby": "ou_00000000000000000000000000000000"},
        portal_url="https://portal.example",
    )
    delivery = {
        "entity_id": "T-CARD",
        "actor": "bobby",
        "before_json": '{"item":{"status":"Validating"}}',
        "after_json": (
            '{"item":{"id":"T-CARD","status":"Done",'
            '"title":"<at user_id=\\"all\\">all</at>",'
            '"description":"A safe compact card","owner":"Bobby",'
            '"workstream":"Planning","weeks":"Week 35"}}'
        ),
    }

    payload = LarkWebhookService(client.app.state.repository, settings)._payload(delivery)
    encoded = json.dumps(payload, ensure_ascii=False)

    assert payload["msg_type"] == "interactive"
    assert "content" not in payload
    assert payload["card"]["header"]["template"] == "green"
    assert "Backlog › Ready › In Progress › Validating › Done" in encoded
    assert '<at user_id=\\"all\\">' not in encoded
    assert '‹at user_id=\\"all\\"›all‹/at›' in encoded
    assert '<at user_id=\\"ou_00000000000000000000000000000000\\">Bobby</at>' in encoded
    assert "https://portal.example/roadmap-task-board" in encoded


def test_lark_card_success_marks_same_delivery_sent(client, monkeypatch):
    _queue_notification(client)
    sent_payloads = []

    def post(_self, url, *, json):
        sent_payloads.append(json)
        return httpx.Response(200, json={"code": 0}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.Client, "post", post)
    settings = replace(
        client.app.state.settings,
        lark_webhook_url="https://open.larksuite.com/open-apis/bot/v2/hook/test",
        lark_message_format="card",
        notification_channels=("lark",),
    )

    assert LarkWebhookService(client.app.state.repository, settings).flush_pending() == 1
    assert [payload["msg_type"] for payload in sent_payloads] == ["interactive"]


def test_lark_card_rejection_falls_back_to_text_in_same_attempt(client, monkeypatch):
    _queue_notification(client)
    sent_payloads = []

    def post(_self, url, *, json):
        sent_payloads.append(json)
        body = (
            {"code": 19001, "msg": "invalid card"}
            if json["msg_type"] == "interactive"
            else {"code": 0}
        )
        return httpx.Response(200, json=body, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.Client, "post", post)
    settings = replace(
        client.app.state.settings,
        lark_webhook_url="https://open.larksuite.com/open-apis/bot/v2/hook/test",
        lark_message_format="card",
        notification_channels=("lark",),
    )
    repository = client.app.state.repository

    assert LarkWebhookService(repository, settings).flush_pending() == 1
    assert [payload["msg_type"] for payload in sent_payloads] == ["interactive", "text"]
    connection = repository._read()
    try:
        delivery = connection.execute(
            "SELECT status, attempt_count, last_error FROM webhook_deliveries WHERE channel = 'lark'"
        ).fetchone()
    finally:
        connection.close()
    assert delivery["status"] == "sent"
    assert delivery["attempt_count"] == 1
    assert delivery["last_error"] is None
