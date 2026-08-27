"""Runtime configuration kept outside source control."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional, Tuple
from urllib.parse import urlparse


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PORTAL_FILE = REPOSITORY_ROOT / "quant_trading_ecosystem_architecture_migration_portal_vi.html"
DEFAULT_DATABASE_FILE = REPOSITORY_ROOT / "data" / "portal.db"


def _csv(value: str) -> Tuple[str, ...]:
    return tuple(part.strip() for part in value.split(",") if part.strip())


def _positive_int(name: str, default: int, minimum: int = 1) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if value < minimum:
        raise ValueError(f"{name} must be at least {minimum}")
    return value


def _environment() -> str:
    value = os.getenv("PORTAL_ENV", "development").strip().lower()
    aliases = {"dev": "development", "prod": "production", "test": "test"}
    value = aliases.get(value, value)
    if value not in {"development", "test", "production"}:
        raise ValueError("PORTAL_ENV must be development, test, or production")
    return value


def _discord_webhook_url() -> Optional[str]:
    value = os.getenv("DISCORD_WEBHOOK_URL", "").strip()
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("DISCORD_WEBHOOK_URL must be an absolute HTTPS URL")
    return value


def _lark_webhook_url() -> Optional[str]:
    value = os.getenv("LARK_WEBHOOK_URL", "").strip()
    if not value:
        return None
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.netloc != "open.larksuite.com":
        raise ValueError("LARK_WEBHOOK_URL must be an HTTPS open.larksuite.com bot URL")
    return value


def _notification_channels() -> Tuple[str, ...]:
    value = os.getenv("PORTAL_NOTIFY_CHANNELS", "").strip()
    channels = _csv(value) if value else ("discord",)
    unknown = sorted(set(channels) - {"discord", "lark"})
    if unknown:
        raise ValueError(f"PORTAL_NOTIFY_CHANNELS supports discord/lark only, got: {unknown}")
    if not channels:
        raise ValueError("PORTAL_NOTIFY_CHANNELS must not be empty")
    return channels


def _lark_mention_map() -> Dict[str, str]:
    """Team member name -> Lark open_id used for @-mentions in notifications.

    Only the Portal team is mentioned; unknown owners are never mentioned.
    Open IDs are runtime configuration (LARK_MENTION_MAP JSON), not secrets,
    but the map must never be echoed into logs or UI payloads.
    """
    raw = os.getenv("LARK_MENTION_MAP", "").strip()
    if not raw:
        return {}
    try:
        mapping = json.loads(raw)
    except ValueError as exc:
        raise ValueError("LARK_MENTION_MAP must be a JSON object of name -> open_id") from exc
    if not isinstance(mapping, dict) or not all(
        isinstance(k, str) and isinstance(v, str) and v.startswith("ou_") for k, v in mapping.items()
    ):
        raise ValueError("LARK_MENTION_MAP values must be Lark open_ids (ou_...)")
    return {str(name).strip(): open_id for name, open_id in mapping.items() if str(name).strip()}


def _lark_message_format() -> str:
    value = os.getenv("LARK_MESSAGE_FORMAT", "text").strip().lower()
    if value not in {"text", "card"}:
        raise ValueError("LARK_MESSAGE_FORMAT must be text or card")
    return value


@dataclass(frozen=True)
class Settings:
    """Only configuration that belongs to environment/runtime, never task data."""

    database_path: Path
    portal_file: Path
    discord_webhook_url: Optional[str]
    portal_url: str
    default_actor: str
    cors_origins: Tuple[str, ...]
    webhook_max_attempts: int
    lark_webhook_url: Optional[str] = None
    lark_webhook_sign_secret: Optional[str] = None
    lark_mention_map: Dict[str, str] = field(default_factory=dict)
    lark_message_format: str = "text"
    notification_channels: Tuple[str, ...] = ("discord",)
    environment: str = "development"
    webhook_retry_base_seconds: int = 60
    webhook_lease_seconds: int = 60
    log_level: str = "INFO"

    @classmethod
    def from_environment(cls) -> "Settings":
        database_path = Path(os.getenv("PORTAL_DATABASE_PATH", str(DEFAULT_DATABASE_FILE))).expanduser()
        portal_file = Path(os.getenv("PORTAL_FILE", str(DEFAULT_PORTAL_FILE))).expanduser()
        environment = _environment()
        notification_channels = _notification_channels()
        lark_webhook_url = _lark_webhook_url()
        if "lark" in notification_channels and not lark_webhook_url:
            raise ValueError(
                "LARK_WEBHOOK_URL is required when PORTAL_NOTIFY_CHANNELS enables lark"
            )
        configured_origins = os.getenv("PORTAL_CORS_ORIGINS")
        cors_origins = _csv(configured_origins) if configured_origins is not None else (
            _csv("http://127.0.0.1:8000,http://localhost:8000,http://127.0.0.1:5173,http://localhost:5173")
            if environment in {"development", "test"}
            else ()
        )
        if "*" in cors_origins:
            raise ValueError("PORTAL_CORS_ORIGINS must be an explicit allowlist; '*' is not permitted")
        return cls(
            database_path=database_path,
            portal_file=portal_file,
            discord_webhook_url=_discord_webhook_url(),
            lark_webhook_url=lark_webhook_url,
            lark_webhook_sign_secret=os.getenv("LARK_WEBHOOK_SIGN_SECRET", "").strip() or None,
            lark_mention_map=_lark_mention_map(),
            lark_message_format=_lark_message_format(),
            portal_url=os.getenv("PORTAL_PUBLIC_URL", "http://127.0.0.1:8000").rstrip("/"),
            default_actor=os.getenv("PORTAL_DEFAULT_ACTOR", "local-user"),
            cors_origins=cors_origins,
            notification_channels=notification_channels,
            webhook_max_attempts=_positive_int("DISCORD_WEBHOOK_MAX_ATTEMPTS", 5),
            environment=environment,
            webhook_retry_base_seconds=_positive_int("DISCORD_WEBHOOK_RETRY_BASE_SECONDS", 60),
            webhook_lease_seconds=_positive_int("DISCORD_WEBHOOK_LEASE_SECONDS", 60),
            log_level=os.getenv("PORTAL_LOG_LEVEL", "INFO").strip().upper() or "INFO",
        )
