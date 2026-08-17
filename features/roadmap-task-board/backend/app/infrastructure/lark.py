"""Lark (Feishu) custom-bot delivery through the persisted webhook outbox.

Custom-bot signature (https://open.larksuite.com/document/.../custom-bot):
    string_to_sign = f"{timestamp}\\n{secret}"
    sign = base64(hmac_sha256(key=secret, msg=string_to_sign))
The sign secret lives only in environment configuration, never in source.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from typing import Any, Dict, Optional

import httpx

from backend.app.config import Settings
from backend.app.infrastructure.repository import PortalRepository


class LarkWebhookService:
    CHANNEL = "lark"

    def __init__(self, repository: PortalRepository, settings: Settings):
        self.repository = repository
        self.settings = settings
        self.logger = logging.getLogger("portal.lark")

    @staticmethod
    def _load(value: Optional[str]) -> Dict[str, Any]:
        return json.loads(value) if value else {}

    @classmethod
    def _sign(cls, timestamp: str, secret: str) -> str:
        string_to_sign = f"{timestamp}\n{secret}".encode("utf-8")
        digest = hmac.new(string_to_sign, digestmod=hashlib.sha256).digest()
        return base64.b64encode(digest).decode("ascii")

    def _mention(self, owner: str) -> str:
        open_id = self.settings.lark_mention_map.get(str(owner).strip())
        if not open_id:
            return ""
        return f"<at user_id=\"{open_id}\">{owner}</at>"

    def _text(self, delivery: Dict[str, Any]) -> str:
        before = self._load(delivery.get("before_json"))
        after = self._load(delivery.get("after_json"))
        item = after.get("item", {})
        previous_item = before.get("item", {})
        from_status = str(previous_item.get("status", "—"))
        to_status = str(item.get("status", "—"))
        task_id = str(item.get("id", delivery["entity_id"]))
        title = str(item.get("title", "Untitled task"))
        owner = str(item.get("owner", "") or "Unassigned")
        workstream = str(item.get("workstream", "") or "General")
        portal = self.settings.portal_url
        mention = self._mention(owner)
        mention_line = f"{mention}\n" if mention else ""
        return (
            f"Task Board — nhiệm vụ chuyển trạng thái\n"
            f"`{task_id}` — {title}\n"
            f"Trạng thái: {from_status} -> {to_status}\n"
            f"Owner: {owner} · Workstream: {workstream}\n"
            f"{mention_line}{portal}/roadmap-task-board"
        )

    def _payload(self, delivery: Dict[str, Any]) -> Dict[str, Any]:
        timestamp = str(int(time.time()))
        return {
            "timestamp": timestamp,
            "sign": self._sign(timestamp, self.settings.lark_webhook_sign_secret or ""),
            "msg_type": "text",
            "content": {"text": self._text(delivery)},
        }

    def flush_pending(self, limit: int = 20) -> int:
        """Deliver due Lark notifications. A failure never rolls back task state."""
        if not self.settings.lark_webhook_url:
            return 0
        delivered = 0
        with httpx.Client(timeout=5.0) as client:
            for delivery in self.repository.claim_due_deliveries(
                limit=limit,
                lease_seconds=self.settings.webhook_lease_seconds,
                channel=self.CHANNEL,
            ):
                try:
                    response = client.post(
                        self.settings.lark_webhook_url, json=self._payload(delivery)
                    )
                    response.raise_for_status()
                    body = response.json()
                    if body.get("code", 0) != 0:
                        raise httpx.HTTPError(f"lark rejected payload: {body.get('msg')}")
                except httpx.HTTPError as exc:
                    accepted = self.repository.mark_delivery_failed(
                        delivery["id"],
                        str(exc),
                        self.settings.webhook_max_attempts,
                        retry_base_seconds=self.settings.webhook_retry_base_seconds,
                        claim_token=delivery["claim_token"],
                    )
                    self.logger.warning(
                        "lark_delivery_failed",
                        extra={"delivery_id": delivery["id"], "accepted": accepted, "attempt": delivery["attempt_count"] + 1},
                    )
                else:
                    if self.repository.mark_delivery_sent(delivery["id"], delivery["claim_token"]):
                        delivered += 1
        return delivered
