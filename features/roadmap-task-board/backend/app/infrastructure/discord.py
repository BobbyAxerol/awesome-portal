"""Discord delivery through the persisted webhook outbox."""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

import httpx

from backend.app.config import Settings
from backend.app.infrastructure.repository import PortalRepository


class DiscordWebhookService:
    def __init__(self, repository: PortalRepository, settings: Settings):
        self.repository = repository
        self.settings = settings
        self.logger = logging.getLogger("portal.discord")

    @staticmethod
    def _load(value: Optional[str]) -> Dict[str, Any]:
        return json.loads(value) if value else {}

    def _payload(self, delivery: Dict[str, Any]) -> Dict[str, Any]:
        before = self._load(delivery.get("before_json"))
        after = self._load(delivery.get("after_json"))
        item = after.get("item", {})
        previous_item = before.get("item", {})
        from_status = previous_item.get("status", "—")
        to_status = item.get("status", "—")
        task_id = str(item.get("id", delivery["entity_id"]))[:120]
        title = str(item.get("title", "Untitled task"))[:512]

        def field_value(value: Any, fallback: str) -> str:
            return str(value if value not in (None, "") else fallback)[:1024]

        fields = [
            {"name": "Task", "value": f"`{task_id}` — {title}", "inline": False},
            {"name": "Transition", "value": f"{from_status} → **{to_status}**", "inline": True},
            {"name": "Owner", "value": field_value(item.get("owner"), "Unassigned"), "inline": True},
            {"name": "Workstream", "value": field_value(item.get("workstream"), "General"), "inline": True},
            {"name": "Actor", "value": field_value(delivery.get("actor"), "system"), "inline": True},
        ]
        return {
            "username": "Quant Ecosystem Portal",
            # Never let task content turn into a Discord mention or ping.
            "allowed_mentions": {"parse": []},
            "embeds": [
                {
                    "title": f"Task moved to {to_status}",
                    "url": self.settings.portal_url,
                    "color": 0x1E7B4F if to_status == "Done" else 0x0F4C5C,
                    "fields": fields,
                    "footer": {"text": f"activity {delivery['activity_id']}"},
                    "timestamp": delivery.get("occurred_at"),
                }
            ],
        }

    def flush_pending(self, limit: int = 20) -> int:
        """Deliver due notifications. A failure never rolls back task state."""
        if not self.settings.discord_webhook_url:
            return 0
        delivered = 0
        with httpx.Client(timeout=5.0) as client:
            for delivery in self.repository.claim_due_deliveries(
                limit=limit, lease_seconds=self.settings.webhook_lease_seconds
            ):
                try:
                    response = client.post(self.settings.discord_webhook_url, json=self._payload(delivery))
                    response.raise_for_status()
                except httpx.HTTPError as exc:
                    accepted = self.repository.mark_delivery_failed(
                        delivery["id"],
                        str(exc),
                        self.settings.webhook_max_attempts,
                        retry_base_seconds=self.settings.webhook_retry_base_seconds,
                        claim_token=delivery["claim_token"],
                    )
                    self.logger.warning(
                        "discord_delivery_failed",
                        extra={"delivery_id": delivery["id"], "accepted": accepted, "attempt": delivery["attempt_count"] + 1},
                    )
                else:
                    if self.repository.mark_delivery_sent(delivery["id"], delivery["claim_token"]):
                        delivered += 1
        return delivered
