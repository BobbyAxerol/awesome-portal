"""Discord delivery through the persisted webhook outbox."""
from __future__ import annotations

import json
from typing import Any, Dict, Optional

import httpx

from backend.app.config import Settings
from backend.app.infrastructure.repository import PortalRepository


class DiscordWebhookService:
    def __init__(self, repository: PortalRepository, settings: Settings):
        self.repository = repository
        self.settings = settings

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
        task_id = item.get("id", delivery["entity_id"])
        title = item.get("title", "Untitled task")
        fields = [
            {"name": "Task", "value": f"`{task_id}` — {title}", "inline": False},
            {"name": "Transition", "value": f"{from_status} → **{to_status}**", "inline": True},
            {"name": "Owner", "value": str(item.get("owner", "Unassigned")), "inline": True},
            {"name": "Workstream", "value": str(item.get("workstream", "General")), "inline": True},
            {"name": "Actor", "value": delivery["actor"], "inline": True},
        ]
        return {
            "username": "Quant Ecosystem Portal",
            "embeds": [
                {
                    "title": f"Task moved to {to_status}",
                    "url": self.settings.portal_url,
                    "color": 0x1E7B4F if to_status == "Done" else 0x0F4C5C,
                    "fields": fields,
                    "footer": {"text": f"activity {delivery['activity_id']}"},
                }
            ],
        }

    def flush_pending(self, limit: int = 20) -> int:
        """Deliver due notifications. A failure never rolls back task state."""
        if not self.settings.discord_webhook_url:
            return 0
        delivered = 0
        with httpx.Client(timeout=5.0) as client:
            for delivery in self.repository.due_deliveries(limit=limit):
                try:
                    response = client.post(self.settings.discord_webhook_url, json=self._payload(delivery))
                    response.raise_for_status()
                except httpx.HTTPError as exc:
                    self.repository.mark_delivery_failed(
                        delivery["id"], str(exc), self.settings.webhook_max_attempts
                    )
                else:
                    self.repository.mark_delivery_sent(delivery["id"])
                    delivered += 1
        return delivered
