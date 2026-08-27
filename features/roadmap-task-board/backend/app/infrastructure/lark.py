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
from urllib.parse import urlparse

import httpx

from backend.app.config import Settings
from backend.app.infrastructure.repository import PortalRepository


class LarkResponseError(Exception):
    """The webhook answered, but did not accept a message payload."""


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

    @staticmethod
    def _remaining_colour(deadline: Optional[datetime]) -> Optional[str]:
        if deadline is None:
            return None
        seconds = (deadline - datetime.now(timezone.utc)).total_seconds()
        if seconds < 0:
            return "red"
        return "orange" if seconds < 24 * 60 * 60 else "green"

    @staticmethod
    def _machine_value(value: Any) -> str:
        """Keep service-generated markdown code spans structurally inert."""
        return str(value).replace("`", "´")

    @staticmethod
    def _status_style(status: str) -> tuple[str, str]:
        styles = {
            "backlog": ("grey", "▰▱▱▱▱"),
            "ready": ("blue", "▰▰▱▱▱"),
            "in progress": ("blue", "▰▰▰▱▱"),
            "validating": ("turquoise", "▰▰▰▰▱"),
            "done": ("green", "▰▰▰▰▰"),
            "blocked": ("red", "▰▰✕▱▱"),
            "cancelled": ("red", "▰▰✕▱▱"),
        }
        return styles.get(status.casefold(), ("grey", "▱▱▱▱▱"))

    def _task_board_url(self) -> str:
        portal = self.settings.portal_url.rstrip("/")
        parsed = urlparse(portal)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return ""
        return portal if portal.endswith("/roadmap-task-board") else f"{portal}/roadmap-task-board"

    def _fields(self, delivery: Dict[str, Any]) -> Dict[str, Any]:
        before = self._load(delivery.get("before_json"))
        after = self._load(delivery.get("after_json"))
        item = after.get("item", {})
        previous_item = before.get("item", {})
        raw_owner = str(item.get("owner", "") or "Unassigned")
        deadline_value = item.get("deadline") or item.get("due_at")
        deadline = self._deadline(deadline_value)
        owner = self._single_line(raw_owner, "Unassigned", 160)
        mention = self._mention(raw_owner)
        return {
            "from_status": self._single_line(previous_item.get("status"), "—", 40),
            "to_status": self._single_line(item.get("status"), "—", 40),
            "task_id": self._single_line(item.get("id", delivery["entity_id"]), "task", 120),
            "title": self._single_line(item.get("title"), "Untitled task", 500),
            "description": self._single_line(
                item.get("description") or item.get("notes"), "Chưa có mô tả"
            ),
            "owner": owner,
            "assignee": f"{owner} — {mention}" if mention else owner,
            "mention": mention,
            "workstream": self._single_line(item.get("workstream"), "General", 160),
            "actor": self._single_line(delivery.get("actor"), "System", 160),
            "assigned_at": self._single_line(
                item.get("assigned_at") or item.get("created") or after.get("created_at"),
                "Chưa ghi nhận",
                100,
            ),
            "deadline": self._single_line(deadline_value, "Chưa đặt", 100),
            "remaining": self._remaining(deadline) if deadline else "Chưa tính được",
            "remaining_colour": self._remaining_colour(deadline),
            "timeline": self._single_line(item.get("weeks"), "Chưa đặt", 100),
            "task_board_url": self._task_board_url(),
        }

    def _text(self, delivery: Dict[str, Any]) -> str:
        fields = self._fields(delivery)
        return (
            f"📌 TASK STATUS UPDATED\n"
            f"Người thao tác: {fields['actor']}\n"
            f"Task: `{fields['task_id']}` — {fields['title']}\n"
            f"Mô tả: {fields['description']}\n"
            f"Trạng thái: {fields['from_status']} → {fields['to_status']}\n"
            f"Assignee: {fields['assignee']}\n"
            f"Giao lúc: {fields['assigned_at']}\n"
            f"Deadline: {fields['deadline']} · {fields['remaining']}\n"
            f"Timeline: {fields['timeline']} · Workstream: {fields['workstream']}\n"
            f"Mở task: {fields['task_board_url']}"
        )

    def _card(self, delivery: Dict[str, Any]) -> Dict[str, Any]:
        fields = self._fields(delivery)
        header_template, pipeline_rail = self._status_style(fields["to_status"])
        assignee_element = (
            {"tag": "lark_md", "content": fields["mention"]}
            if fields["mention"]
            else {"tag": "plain_text", "content": fields["owner"]}
        )
        remaining = fields["remaining"]
        if fields["remaining_colour"]:
            remaining = f"<font color='{fields['remaining_colour']}'>{remaining}</font>"
        elements = [
            {
                "tag": "div",
                "text": {
                    "tag": "lark_md",
                    "content": (
                        f"`{self._machine_value(fields['actor'])}` chuyển  "
                        f"`{self._machine_value(fields['from_status'])}` → "
                        f"**`{self._machine_value(fields['to_status'])}`**"
                    ),
                },
            },
            {
                "tag": "note",
                "elements": [
                    {
                        "tag": "plain_text",
                        "content": (
                            f"{pipeline_rail}  Backlog › Ready › In Progress › Validating › Done"
                        ),
                    }
                ],
            },
            {"tag": "hr"},
            {"tag": "div", "text": {"tag": "plain_text", "content": fields["title"]}},
            {
                "tag": "note",
                "elements": [
                    {
                        "tag": "plain_text",
                        "content": f"{fields['task_id']} · {fields['workstream']}",
                    }
                ],
            },
            {
                "tag": "div",
                "text": {
                    "tag": "plain_text",
                    "content": self._single_line(fields["description"], "Chưa có mô tả", 180),
                },
            },
            {"tag": "hr"},
            {
                "tag": "column_set",
                "flex_mode": "bisect",
                "background_style": "default",
                "columns": [
                    {
                        "tag": "column",
                        "width": "weighted",
                        "weight": 1,
                        "vertical_align": "top",
                        "elements": [
                            {
                                "tag": "note",
                                "elements": [{"tag": "plain_text", "content": "ASSIGNEE"}],
                            },
                            {"tag": "div", "text": assignee_element},
                            {
                                "tag": "note",
                                "elements": [
                                    {
                                        "tag": "plain_text",
                                        "content": f"giao {fields['assigned_at']}",
                                    }
                                ],
                            },
                        ],
                    },
                    {
                        "tag": "column",
                        "width": "weighted",
                        "weight": 1,
                        "vertical_align": "top",
                        "elements": [
                            {
                                "tag": "note",
                                "elements": [{"tag": "plain_text", "content": "DEADLINE"}],
                            },
                            {
                                "tag": "div",
                                "text": {"tag": "plain_text", "content": fields["deadline"]},
                            },
                            {
                                "tag": "note",
                                "elements": [{"tag": "lark_md", "content": remaining}],
                            },
                        ],
                    },
                ],
            },
        ]
        if fields["task_board_url"]:
            elements.append(
                {
                    "tag": "action",
                    "actions": [
                        {
                            "tag": "button",
                            "text": {"tag": "plain_text", "content": "Mở task"},
                            "type": "primary",
                            "url": fields["task_board_url"],
                        }
                    ],
                }
            )
        elements.append(
            {
                "tag": "note",
                "elements": [
                    {
                        "tag": "plain_text",
                        "content": (
                            f"Timeline {fields['timeline']} · Workstream {fields['workstream']}"
                        ),
                    }
                ],
            }
        )
        return {
            "config": {"wide_screen_mode": True, "update_multi": False},
            "header": {
                "template": header_template,
                "title": {
                    "tag": "plain_text",
                    "content": f"▨ TASK · {fields['to_status'].upper()}",
                },
            },
            "elements": elements,
        }

    def _payload(
        self, delivery: Dict[str, Any], message_format: Optional[str] = None
    ) -> Dict[str, Any]:
        timestamp = str(int(time.time()))
        selected = message_format or self.settings.lark_message_format
        payload: Dict[str, Any] = {
            "timestamp": timestamp,
            "sign": self._sign(timestamp, self.settings.lark_webhook_sign_secret or ""),
        }
        if selected == "card":
            payload.update({"msg_type": "interactive", "card": self._card(delivery)})
        else:
            payload.update({"msg_type": "text", "content": {"text": self._text(delivery)}})
        return payload

    @staticmethod
    def _assert_accepted(response: httpx.Response) -> None:
        response.raise_for_status()
        try:
            body = response.json()
        except ValueError as exc:
            raise LarkResponseError("lark returned a malformed response") from exc
        if body.get("code", 0) != 0:
            raise LarkResponseError(f"lark rejected payload: {body.get('msg')}")

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
                    try:
                        self._assert_accepted(response)
                    except (httpx.HTTPStatusError, LarkResponseError):
                        if self.settings.lark_message_format != "card":
                            raise
                        self.logger.warning(
                            "lark_card_rejected_falling_back_to_text",
                            extra={"delivery_id": delivery["id"]},
                        )
                        fallback = client.post(
                            self.settings.lark_webhook_url,
                            json=self._payload(delivery, message_format="text"),
                        )
                        self._assert_accepted(fallback)
                except (httpx.HTTPError, LarkResponseError) as exc:
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
