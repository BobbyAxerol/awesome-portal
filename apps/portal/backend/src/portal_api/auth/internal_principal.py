"""Verify the bounded Control-API internal principal header.

This mirrors the HMAC-SHA256/base64url envelope emitted by the TypeScript
``PrincipalService``.  It is intentionally only for private Portal API routes
called by the Control API; it never turns a browser header into an identity.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import time
from dataclasses import dataclass
from typing import Mapping

_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$")
_USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,128}$")
_BASE64URL_RE = re.compile(r"^[A-Za-z0-9_-]{1,8192}$")


class InternalPrincipalError(ValueError):
    """The private principal header is missing, expired or malformed."""


@dataclass(frozen=True, slots=True)
class InternalPortalPrincipal:
    principal_id: str
    username: str
    role: str
    expires_at: int
    authn_methods: tuple[str, ...]


def require_internal_principal(headers: Mapping[str, str]) -> InternalPortalPrincipal:
    secret = os.getenv("INTERNAL_PRINCIPAL_SECRET")
    if not secret or len(secret.encode("utf-8")) < 16:
        raise InternalPrincipalError("internal principal verification is not configured")
    token = headers.get("x-portal-principal")
    if not token:
        raise InternalPrincipalError("internal principal is required")
    encoded, separator, signature = token.partition(".")
    if (
        not encoded
        or not separator
        or not signature
        or "." in signature
        or not _BASE64URL_RE.fullmatch(encoded)
        or not _BASE64URL_RE.fullmatch(signature)
    ):
        raise InternalPrincipalError("internal principal is malformed")
    expected = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), encoded.encode("ascii"), hashlib.sha256).digest()
    ).decode("ascii").rstrip("=")
    if not hmac.compare_digest(expected, signature):
        raise InternalPrincipalError("internal principal signature is invalid")
    try:
        padded = encoded + "=" * (-len(encoded) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError, binascii.Error):
        raise InternalPrincipalError("internal principal payload is invalid") from None
    if not isinstance(payload, dict):
        raise InternalPrincipalError("internal principal payload is invalid")
    principal_id = payload.get("principalId")
    username = payload.get("username")
    role = payload.get("role")
    expires_at = payload.get("exp")
    authn_methods = payload.get("authnMethods")
    if (
        payload.get("policyVersion") != "auth-policy-v1"
        or not isinstance(principal_id, str)
        or not _ID_RE.fullmatch(principal_id)
        or not isinstance(username, str)
        or not _USERNAME_RE.fullmatch(username)
        or role not in {"ADMIN", "USER"}
        or not isinstance(authn_methods, list)
        or not authn_methods
        or len(authn_methods) > 8
        or any(
            not isinstance(method, str)
            or not re.fullmatch(r"[a-z][a-z0-9_:-]{1,63}", method)
            for method in authn_methods
        )
        or not isinstance(expires_at, int)
        or isinstance(expires_at, bool)
        or expires_at < int(time.time())
    ):
        raise InternalPrincipalError("internal principal is expired or structurally invalid")
    return InternalPortalPrincipal(
        principal_id=principal_id,
        username=username,
        role=role,
        expires_at=expires_at,
        authn_methods=tuple(authn_methods),
    )


__all__ = ["InternalPortalPrincipal", "InternalPrincipalError", "require_internal_principal"]
