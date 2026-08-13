from __future__ import annotations

from pathlib import Path

import pytest

from backend.app.infrastructure.repository import PortalRepository
from backend.scripts.portal_db import backup_database, database_status, restore_database


def _seed(path: Path) -> None:
    repository = PortalRepository(path)
    repository.initialize()
    repository.create_task({"id": "OPS-1", "title": "Protect backup"}, "test")


def test_backup_and_restore_use_consistent_copy_and_require_explicit_replace(tmp_path: Path):
    source = tmp_path / "live" / "portal.db"
    backup = tmp_path / "backups" / "portal-2026-08-13.db"
    restored = tmp_path / "restore" / "portal.db"
    _seed(source)

    assert backup_database(source, backup) == backup.resolve()
    assert database_status(backup)["tasks"] == 1
    assert restore_database(backup, restored) == restored.resolve()
    assert PortalRepository(restored).get_task("OPS-1")["item"]["title"] == "Protect backup"

    with pytest.raises(FileExistsError):
        backup_database(source, backup)
    with pytest.raises(FileExistsError):
        restore_database(backup, restored)

    assert restore_database(backup, restored, replace=True) == restored.resolve()
