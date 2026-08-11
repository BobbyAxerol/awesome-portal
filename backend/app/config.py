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

    @classmethod
    def from_environment(cls) -> "Settings":
        database_path = Path(os.getenv("PORTAL_DATABASE_PATH", str(DEFAULT_DATABASE_FILE))).expanduser()
        portal_file = Path(os.getenv("PORTAL_FILE", str(DEFAULT_PORTAL_FILE))).expanduser()
        return cls(
            database_path=database_path,
            portal_file=portal_file,
            discord_webhook_url=os.getenv("DISCORD_WEBHOOK_URL") or None,
            portal_url=os.getenv("PORTAL_PUBLIC_URL", "http://127.0.0.1:8000"),
            default_actor=os.getenv("PORTAL_DEFAULT_ACTOR", "local-user"),
            cors_origins=_csv(
                os.getenv(
                    "PORTAL_CORS_ORIGINS",
                    "http://127.0.0.1:8000,http://localhost:8000,http://127.0.0.1:5173,http://localhost:5173",
                )
            ),
            webhook_max_attempts=max(1, int(os.getenv("DISCORD_WEBHOOK_MAX_ATTEMPTS", "5"))),
        )
