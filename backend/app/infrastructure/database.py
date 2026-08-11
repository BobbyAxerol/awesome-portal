"""SQLite connection and schema management for the portal."""
from __future__ import annotations

import sqlite3
from pathlib import Path


SCHEMA = """
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
    created_at TEXT NOT NULL,
    sent_at TEXT,
    FOREIGN KEY(activity_id) REFERENCES activity_events(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_delivery_activity ON webhook_deliveries (activity_id);
CREATE INDEX IF NOT EXISTS idx_webhook_due ON webhook_deliveries (status, next_attempt_at, created_at);
"""


def connect(path: Path) -> sqlite3.Connection:
    """Open a short-lived connection; callers own commit/rollback boundaries."""
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(path), timeout=10, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA busy_timeout = 5000")
    return connection


def initialize(path: Path) -> None:
    connection = connect(path)
    try:
        connection.executescript(SCHEMA)
    finally:
        connection.close()
