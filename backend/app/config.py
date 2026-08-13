"""Runtime configuration kept outside source control."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple


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
    environment: str = "development"
    webhook_retry_base_seconds: int = 60
    webhook_lease_seconds: int = 60
    log_level: str = "INFO"

    @classmethod
    def from_environment(cls) -> "Settings":
        database_path = Path(os.getenv("PORTAL_DATABASE_PATH", str(DEFAULT_DATABASE_FILE))).expanduser()
        portal_file = Path(os.getenv("PORTAL_FILE", str(DEFAULT_PORTAL_FILE))).expanduser()
        environment = _environment()
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
            discord_webhook_url=os.getenv("DISCORD_WEBHOOK_URL") or None,
            portal_url=os.getenv("PORTAL_PUBLIC_URL", "http://127.0.0.1:8000").rstrip("/"),
            default_actor=os.getenv("PORTAL_DEFAULT_ACTOR", "local-user"),
            cors_origins=cors_origins,
            webhook_max_attempts=_positive_int("DISCORD_WEBHOOK_MAX_ATTEMPTS", 5),
            environment=environment,
            webhook_retry_base_seconds=_positive_int("DISCORD_WEBHOOK_RETRY_BASE_SECONDS", 60),
            webhook_lease_seconds=_positive_int("DISCORD_WEBHOOK_LEASE_SECONDS", 60),
            log_level=os.getenv("PORTAL_LOG_LEVEL", "INFO").strip().upper() or "INFO",
        )
