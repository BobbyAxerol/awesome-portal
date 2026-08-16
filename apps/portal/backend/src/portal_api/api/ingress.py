"""Ingress correlation middleware (BAR-03, U06).

A pure ASGI middleware that gives every Portal API request a safe
``X-Request-ID`` and a W3C ``traceparent``:

- accept only request IDs matching ``^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$``
  (nginx ``$request_id`` hex values qualify) and W3C traceparent values;
  anything else is replaced by a freshly generated value;
- attach both to ``request.state`` for handlers and to every response as
  headers;
- never touch response bodies, so SSE streaming is preserved.

It deliberately does not log per-request records, import QuantBT kernels or
read identity headers; identity/AUD enforcement stays U07 work.
"""

from __future__ import annotations

import re
import secrets
from typing import Any

_REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
_TRACEPARENT_PATTERN = re.compile(
    r"^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$"
)
REQUEST_ID_HEADER = "X-Request-ID"
TRACEPARENT_HEADER = "traceparent"


def generate_request_id() -> str:
    return secrets.token_hex(16)


def generate_traceparent() -> str:
    return f"00-{secrets.token_hex(16)}-{secrets.token_hex(8)}-01"


def safe_request_id(value: str | None) -> str:
    if value is not None and _REQUEST_ID_PATTERN.fullmatch(value):
        return value
    return generate_request_id()


def safe_traceparent(value: str | None) -> str:
    if value is not None and _TRACEPARENT_PATTERN.fullmatch(value):
        return value
    return generate_traceparent()


class IngressContextMiddleware:
    """Pure ASGI request/response correlation without body interception."""

    def __init__(self, app: Any) -> None:
        self._app = app

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return

        headers = {
            key.decode("latin-1").lower(): value
            for key, value in scope.get("headers", [])
        }
        request_id = safe_request_id(
            headers.get(REQUEST_ID_HEADER.lower())
            and headers[REQUEST_ID_HEADER.lower()].decode("latin-1")
        )
        traceparent = safe_traceparent(
            headers.get(TRACEPARENT_HEADER)
            and headers[TRACEPARENT_HEADER].decode("latin-1")
        )
        state = scope.setdefault("state", {})
        state["request_id"] = request_id
        state["traceparent"] = traceparent

        async def send_with_correlation(message: Any) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [
                    *message["headers"],
                    (REQUEST_ID_HEADER.lower().encode("latin-1"), request_id.encode("latin-1")),
                    (TRACEPARENT_HEADER.encode("latin-1"), traceparent.encode("latin-1")),
                ]
            await send(message)

        await self._app(scope, receive, send_with_correlation)


def ingress_request_id(request: Any) -> str:
    """Return the correlated request ID for the current request."""
    value = getattr(request.state, "request_id", None)
    return value or generate_request_id()


def ingress_traceparent(request: Any) -> str:
    """Return the correlated W3C traceparent for the current request."""
    value = getattr(request.state, "traceparent", None)
    return value or generate_traceparent()


__all__ = [
    "IngressContextMiddleware",
    "REQUEST_ID_HEADER",
    "TRACEPARENT_HEADER",
    "generate_request_id",
    "generate_traceparent",
    "ingress_request_id",
    "ingress_traceparent",
    "safe_request_id",
    "safe_traceparent",
]
