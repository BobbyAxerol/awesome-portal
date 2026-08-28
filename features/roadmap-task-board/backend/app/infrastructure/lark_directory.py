"""Fail-closed Lark organization user_id to app open_id resolution."""
from __future__ import annotations

import re
import time
from typing import Dict, Optional
from urllib.parse import quote

import httpx

from backend.app.config import Settings


class LarkDirectoryError(Exception):
    """The configured Lark identity could not be resolved safely."""


class LarkDirectoryResolver:
    TOKEN_URL = "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal"
    USER_URL = "https://open.larksuite.com/open-apis/contact/v3/users"
    OPEN_ID_PATTERN = re.compile(r"ou_[A-Za-z0-9_-]{1,128}")

    def __init__(self, settings: Settings) -> None:
        self._app_id = settings.lark_app_id
        self._app_secret = settings.lark_app_secret
        self._open_ids: Dict[str, str] = {}
        self._tenant_token: Optional[str] = None
        self._tenant_token_expires_at = 0.0

    def _token(self, client: httpx.Client) -> str:
        now = time.monotonic()
        if self._tenant_token and now < self._tenant_token_expires_at:
            return self._tenant_token
        if not self._app_id or not self._app_secret:
            raise LarkDirectoryError("lark directory credentials are unavailable")

        try:
            response = client.post(
                self.TOKEN_URL,
                json={"app_id": self._app_id, "app_secret": self._app_secret},
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise LarkDirectoryError("lark tenant token request failed") from exc

        if not isinstance(payload, dict):
            raise LarkDirectoryError("lark tenant token was rejected")
        token = payload.get("tenant_access_token")
        if payload.get("code", 0) != 0 or not isinstance(token, str) or not token:
            raise LarkDirectoryError("lark tenant token was rejected")
        expires_in = payload.get("expire", 7200)
        if not isinstance(expires_in, int) or expires_in <= 0:
            expires_in = 7200
        self._tenant_token = token
        self._tenant_token_expires_at = now + max(30, expires_in - 60)
        return token

    def resolve(self, organization_user_id: str, client: httpx.Client) -> str:
        cached = self._open_ids.get(organization_user_id)
        if cached:
            return cached

        token = self._token(client)
        user_url = f"{self.USER_URL}/{quote(organization_user_id, safe='')}"
        try:
            response = client.get(
                user_url,
                params={"user_id_type": "user_id"},
                headers={"Authorization": f"Bearer {token}"},
            )
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise LarkDirectoryError("lark directory lookup failed") from exc

        if not isinstance(payload, dict):
            raise LarkDirectoryError("lark directory returned no valid open_id")
        data = payload.get("data")
        user = data.get("user", {}) if isinstance(data, dict) else {}
        open_id = user.get("open_id") if isinstance(user, dict) else None
        if (
            payload.get("code", 0) != 0
            or not isinstance(open_id, str)
            or not self.OPEN_ID_PATTERN.fullmatch(open_id)
        ):
            raise LarkDirectoryError("lark directory returned no valid open_id")

        self._open_ids[organization_user_id] = open_id
        return open_id
