"""SQLite connection and forward-only schema management for the portal."""
from __future__ import annotations

import sqlite3
from pathlib import Path


BASE_SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    status TEXT NOT NULL,
    position INTEGER NOT NULL,
    version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_active_order ON tasks (deleted_at, status, position, id);

CREATE TABLE IF NOT EXISTS roadmap_phases (
    id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    position INTEGER NOT NULL,
    version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_roadmap_active_order ON roadmap_phases (deleted_at, position, id);

CREATE TABLE IF NOT EXISTS activity_events (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    type TEXT NOT NULL,
    actor TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    metadata_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_events (entity_type, entity_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id TEXT PRIMARY KEY,
    activity_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    next_attempt_at TEXT,
    claim_token TEXT,
    lease_expires_at TEXT,
    channel TEXT NOT NULL DEFAULT 'discord',
    created_at TEXT NOT NULL,
    sent_at TEXT,
    FOREIGN KEY(activity_id) REFERENCES activity_events(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_delivery_activity ON webhook_deliveries (activity_id);
CREATE INDEX IF NOT EXISTS idx_webhook_due ON webhook_deliveries (status, next_attempt_at, created_at);
"""


MIGRATION_INITIAL = "0001_initial"
MIGRATION_DELIVERY_CLAIMS = "0002_delivery_claims"
MIGRATION_LARK_CHANNEL = "0003_lark_channel"


def connect(path: Path) -> sqlite3.Connection:
    """Open a short-lived connection; callers own commit/rollback boundaries."""
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(path), timeout=10, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA synchronous = NORMAL")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


def _has_column(connection: sqlite3.Connection, table: str, column: str) -> bool:
    return any(row["name"] == column for row in connection.execute(f"PRAGMA table_info({table})"))


def _ensure_column(connection: sqlite3.Connection, table: str, definition: str) -> None:
    column = definition.split(maxsplit=1)[0]
    if not _has_column(connection, table, column):
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {definition}")


def initialize(path: Path) -> None:
    """Apply idempotent forward migrations to new and pre-Phase-4 databases.

    The original backend created its schema with ``CREATE TABLE IF NOT EXISTS``
    and did not record a version.  Initialising therefore first establishes the
    baseline, then adds Phase-4 delivery-claim fields when opening an existing
    database.  No migration rewrites user task or audit data.
    """
    connection = connect(path)
    try:
        connection.executescript(BASE_SCHEMA)
        connection.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))",
            (MIGRATION_INITIAL,),
        )
        _ensure_column(connection, "webhook_deliveries", "claim_token TEXT")
        _ensure_column(connection, "webhook_deliveries", "lease_expires_at TEXT")
        connection.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))",
            (MIGRATION_DELIVERY_CLAIMS,),
        )
        _ensure_column(connection, "webhook_deliveries", "channel TEXT NOT NULL DEFAULT 'discord'")
        connection.execute("DROP INDEX IF EXISTS idx_webhook_delivery_activity")
        connection.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_delivery_activity_channel "
            "ON webhook_deliveries (activity_id, channel)"
        )
        connection.execute(
            "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))",
            (MIGRATION_LARK_CHANNEL,),
        )
        # Keep a restored/migrated file self-contained before an operational
        # command atomically moves it into place.  Normal request traffic uses
        # WAL as usual; this only runs during initialization.
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    finally:
        connection.close()
