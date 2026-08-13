#!/usr/bin/env python3
"""Safe, small operational commands for the portal SQLite database.

This is intentionally dependency-free.  It uses SQLite's online backup API,
which produces a consistent copy even while the FastAPI process is serving
requests.  Restore is deliberately opt-in with ``--replace`` and writes a
temporary sibling file before atomically replacing the target.
"""
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import uuid
from pathlib import Path
from typing import Sequence


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from backend.app.infrastructure.database import initialize  # noqa: E402
from backend.app.infrastructure.repository import PortalRepository  # noqa: E402


def _readonly_connection(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise FileNotFoundError(f"Database not found: {path}")
    return sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True)


def _copy(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    source_connection = _readonly_connection(source)
    target_connection = sqlite3.connect(str(target))
    try:
        source_connection.backup(target_connection)
    finally:
        target_connection.close()
        source_connection.close()


def backup_database(database_path: Path, output_path: Path, *, replace: bool = False) -> Path:
    """Create an atomic consistent backup and return its resolved path."""
    database_path = database_path.expanduser().resolve()
    output_path = output_path.expanduser().resolve()
    if database_path == output_path:
        raise ValueError("Backup output must not be the live database")
    if output_path.exists() and not replace:
        raise FileExistsError(f"Backup already exists: {output_path} (pass --replace to overwrite it)")
    temporary = output_path.with_name(f".{output_path.name}.{uuid.uuid4().hex}.tmp")
    try:
        _copy(database_path, temporary)
        os.replace(temporary, output_path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return output_path


def restore_database(input_path: Path, database_path: Path, *, replace: bool = False) -> Path:
    """Restore a backup atomically; existing targets require explicit consent."""
    input_path = input_path.expanduser().resolve()
    database_path = database_path.expanduser().resolve()
    if input_path == database_path:
        raise ValueError("Restore input must not be the live database")
    if database_path.exists() and not replace:
        raise FileExistsError(f"Target exists: {database_path} (pass --replace only after taking a backup)")
    temporary = database_path.with_name(f".{database_path.name}.{uuid.uuid4().hex}.restore")
    try:
        _copy(input_path, temporary)
        # Bring an older backup forward before making it live.
        initialize(temporary)
        database_path.parent.mkdir(parents=True, exist_ok=True)
        os.replace(temporary, database_path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return database_path


def database_status(database_path: Path) -> dict[str, object]:
    database_path = database_path.expanduser().resolve()
    repository = PortalRepository(database_path)
    repository.initialize()
    return {
        "database": str(database_path),
        "tasks": repository.task_count(),
        "roadmap": repository.roadmap_count(),
        **repository.readiness(),
    }


def parser() -> argparse.ArgumentParser:
    command_parser = argparse.ArgumentParser(description="Roadmap & Task Board SQLite operations")
    commands = command_parser.add_subparsers(dest="command", required=True)

    status = commands.add_parser("status", help="check schema, counts and pending deliveries")
    status.add_argument("--database", required=True, type=Path)

    backup = commands.add_parser("backup", help="create a consistent SQLite backup")
    backup.add_argument("--database", required=True, type=Path)
    backup.add_argument("--output", required=True, type=Path)
    backup.add_argument("--replace", action="store_true", help="allow replacing an existing backup file")

    restore = commands.add_parser("restore", help="restore a backup into a database path")
    restore.add_argument("--input", required=True, type=Path)
    restore.add_argument("--database", required=True, type=Path)
    restore.add_argument("--replace", action="store_true", help="required when the target database already exists")
    return command_parser


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "status":
            print(json.dumps(database_status(args.database), ensure_ascii=False, indent=2, sort_keys=True))
        elif args.command == "backup":
            print(json.dumps({"backup": str(backup_database(args.database, args.output, replace=args.replace))}, ensure_ascii=False))
        elif args.command == "restore":
            print(json.dumps({"database": str(restore_database(args.input, args.database, replace=args.replace))}, ensure_ascii=False))
    except (FileNotFoundError, FileExistsError, ValueError, sqlite3.Error) as error:
        print(f"portal-db: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
