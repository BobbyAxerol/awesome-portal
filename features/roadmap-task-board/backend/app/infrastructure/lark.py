"""Lark (Feishu) custom-bot delivery through the persisted webhook outbox.

Custom-bot signature (https://open.larksuite.com/document/.../custom-bot):
    signing_key = f"{timestamp}\\n{secret}"
    sign = base64(hmac_sha256(key=signing_key, msg=b""))
The sign secret lives only in environment configuration, never in source.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime, timezone
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
        self._warned_missing_url = False

    @staticmethod
    def _load(value: Optional[str]) -> Dict[str, Any]:
        return json.loads(value) if value else {}

    @classmethod
    def _sign(cls, timestamp: str, secret: str) -> str:
        signing_key = f"{timestamp}\n{secret}".encode("utf-8")
        digest = hmac.new(signing_key, digestmod=hashlib.sha256).digest()
        return base64.b64encode(digest).decode("ascii")

    @staticmethod
    def _member_key(value: Any) -> str:
        """Match the three-person team safely across display-name variants."""
        return "".join(character for character in str(value).casefold() if character.isalnum())

    @staticmethod
    def _single_line(value: Any, fallback: str = "—", limit: int = 600) -> str:
        text = " ".join(str(value if value not in (None, "") else fallback).split())
        # Task content is untrusted text. Only the service-generated assignee
        # token below may use Lark's <at ...> markup.
        text = text.replace("<", "‹").replace(">", "›")
        return text if len(text) <= limit else f"{text[: limit - 1]}…"

    def _mention(self, owner: str) -> str:
        normalized = self._member_key(owner)
        open_id = next(
            (
                configured_id
                for configured_name, configured_id in self.settings.lark_mention_map.items()
                if self._member_key(configured_name) == normalized
            ),
            None,
        )
        if not open_id:
            return ""
        label = self._single_line(owner, "Assignee", 160)
        return f"<at user_id=\"{open_id}\">{label}</at>"

    @staticmethod
    def _deadline(value: Any) -> Optional[datetime]:
        if value in (None, ""):
            return None
        try:
            parsed = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    @staticmethod
    def _remaining(deadline: datetime) -> str:
        delta_seconds = int((deadline - datetime.now(timezone.utc)).total_seconds())
        overdue = delta_seconds < 0
        total_minutes = max(0, abs(delta_seconds) // 60)
        days, remainder = divmod(total_minutes, 24 * 60)
        hours, minutes = divmod(remainder, 60)
        parts = []
        if days:
            parts.append(f"{days} ngày")
        if hours and len(parts) < 2:
            parts.append(f"{hours} giờ")
        if not parts:
            parts.append(f"{minutes} phút")
        duration = " ".join(parts)
        return f"Quá hạn {duration}" if overdue else f"Còn {duration}"

    def _text(self, delivery: Dict[str, Any]) -> str:
        before = self._load(delivery.get("before_json"))
        after = self._load(delivery.get("after_json"))
        item = after.get("item", {})
        previous_item = before.get("item", {})
        from_status = str(previous_item.get("status", "—"))
        to_status = str(item.get("status", "—"))
        task_id = self._single_line(item.get("id", delivery["entity_id"]), "task", 120)
        title = self._single_line(item.get("title"), "Untitled task", 500)
        description = self._single_line(
            item.get("description") or item.get("notes"), "Chưa có mô tả"
        )
        raw_owner = str(item.get("owner", "") or "Unassigned")
        owner = self._single_line(raw_owner, "Unassigned", 160)
        workstream = self._single_line(item.get("workstream"), "General", 160)
        actor = self._single_line(delivery.get("actor"), "System", 160)
        assigned_at = self._single_line(
            item.get("assigned_at") or item.get("created") or after.get("created_at"),
            "Chưa ghi nhận",
            100,
        )
        deadline_value = item.get("deadline") or item.get("due_at")
        deadline = self._deadline(deadline_value)
        deadline_text = self._single_line(deadline_value, "Chưa đặt", 100)
        remaining = self._remaining(deadline) if deadline else "Chưa tính được"
        timeline = self._single_line(item.get("weeks"), "Chưa đặt", 100)
        portal = self.settings.portal_url.rstrip("/")
        task_board_url = (
            portal if portal.endswith("/roadmap-task-board") else f"{portal}/roadmap-task-board"
        )
        mention = self._mention(raw_owner)
        assignee = f"{owner} — {mention}" if mention else owner
        return (
            f"📌 TASK STATUS UPDATED\n"
            f"Người thao tác: {actor}\n"
            f"Task: `{task_id}` — {title}\n"
            f"Mô tả: {description}\n"
            f"Trạng thái: {from_status} → {to_status}\n"
            f"Assignee: {assignee}\n"
            f"Giao lúc: {assigned_at}\n"
            f"Deadline: {deadline_text} · {remaining}\n"
            f"Timeline: {timeline} · Workstream: {workstream}\n"
            f"Mở task: {task_board_url}"
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
            if "lark" in self.settings.notification_channels and not self._warned_missing_url:
                self.logger.warning("lark_disabled_no_url")
                self._warned_missing_url = True
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
                except (httpx.HTTPError, ValueError) as exc:
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
