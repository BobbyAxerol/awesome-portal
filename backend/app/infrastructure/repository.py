"""Repository implementing transactional state plus append-only audit history."""
from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Mapping, Optional, Sequence, Tuple

from backend.app.domain.constants import ENTITY_ROADMAP_PHASE, ENTITY_TASK, NOTIFY_STATUSES, TASK_STATUSES
from backend.app.domain.errors import NotFoundError, ValidationError, VersionConflictError
from backend.app.infrastructure.database import connect, initialize


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _load(value: Optional[str], default: Any) -> Any:
    return json.loads(value) if value else default


def _identifier(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


TASK_STATUS_ORDER_SQL = """CASE status
    WHEN 'Backlog' THEN 0
    WHEN 'Ready' THEN 1
    WHEN 'In Progress' THEN 2
    WHEN 'Validating' THEN 3
    WHEN 'Done' THEN 4
    ELSE 99 END"""


def _future(seconds: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")


class PortalRepository:
    """A small repository, intentionally without cross-aggregate task relationships."""

    def __init__(self, database_path: Path):
        self.database_path = database_path

    def initialize(self) -> None:
        initialize(self.database_path)

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        connection = connect(self.database_path)
        try:
            connection.execute("BEGIN IMMEDIATE")
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _read(self) -> sqlite3.Connection:
        return connect(self.database_path)

    @staticmethod
    def _task_snapshot(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "item": _load(row["payload_json"], {}),
            "version": row["version"],
            "position": row["position"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "deleted_at": row["deleted_at"],
        }

    @staticmethod
    def _roadmap_snapshot(row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "item": _load(row["payload_json"], {}),
            "version": row["version"],
            "position": row["position"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "deleted_at": row["deleted_at"],
        }

    @staticmethod
    def _public(snapshot: Dict[str, Any]) -> Dict[str, Any]:
        return dict(snapshot)

    @staticmethod
    def _legacy(snapshot: Dict[str, Any]) -> Dict[str, Any]:
        return dict(snapshot["item"])

    @staticmethod
    def _validate_task(payload: Mapping[str, Any]) -> Dict[str, Any]:
        item = dict(payload)
        item_id = str(item.get("id", "")).strip()
        title = str(item.get("title", "")).strip()
        status = str(item.get("status", "Backlog")).strip()
        if not item_id:
            raise ValidationError("task id is required")
        if not title:
            raise ValidationError("task title is required")
        if status not in TASK_STATUSES:
            raise ValidationError("invalid task status")
        item["id"] = item_id
        item["title"] = title
        item["status"] = status
        depends = item.get("depends", [])
        if not isinstance(depends, list) or not all(isinstance(value, str) for value in depends):
            raise ValidationError("depends must be a list of strings")
        item["depends"] = depends
        return item

    @staticmethod
    def _validate_roadmap(payload: Mapping[str, Any]) -> Dict[str, Any]:
        item = dict(payload)
        item_id = str(item.get("id", "")).strip()
        name = str(item.get("name", "")).strip()
        if not item_id:
            raise ValidationError("roadmap phase id is required")
        if not name:
            raise ValidationError("roadmap phase name is required")
        try:
            start, end = int(item["start"]), int(item["end"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValidationError("roadmap start and end must be integers") from exc
        if start < 1 or end < start:
            raise ValidationError("roadmap range is invalid")
        item["id"] = item_id
        item["name"] = name
        item["start"] = start
        item["end"] = end
        return item

    @staticmethod
    def _assert_version(row: sqlite3.Row, expected_version: Optional[int]) -> None:
        if expected_version is not None and row["version"] != expected_version:
            raise VersionConflictError("This item changed elsewhere. Refresh before saving.")

    @staticmethod
    def _event(
        connection: sqlite3.Connection,
        *,
        entity_type: str,
        entity_id: str,
        event_type: str,
        actor: str,
        before: Optional[Dict[str, Any]],
        after: Optional[Dict[str, Any]],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        event_id = _identifier("evt")
        occurred_at = _now()
        connection.execute(
            """
            INSERT INTO activity_events
                (id, entity_type, entity_id, type, actor, occurred_at, before_json, after_json, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                entity_type,
                entity_id,
                event_type,
                actor,
                occurred_at,
                _dump(before) if before is not None else None,
                _dump(after) if after is not None else None,
                _dump(metadata or {}),
            ),
        )
        return event_id

    @staticmethod
    def _queue_notification(
        connection: sqlite3.Connection,
        *,
        activity_id: str,
        status: str,
        created_at: str,
    ) -> None:
        if status not in NOTIFY_STATUSES:
            return
        connection.execute(
            """
            INSERT OR IGNORE INTO webhook_deliveries
                (id, activity_id, event_type, status, attempt_count, created_at, next_attempt_at)
            VALUES (?, ?, ?, 'pending', 0, ?, ?)
            """,
            (_identifier("whd"), activity_id, "task.status_changed", created_at, created_at),
        )

    def _fetch_task(self, connection: sqlite3.Connection, task_id: str, include_deleted: bool = False) -> sqlite3.Row:
        condition = "" if include_deleted else " AND deleted_at IS NULL"
        row = connection.execute(f"SELECT * FROM tasks WHERE id = ?{condition}", (task_id,)).fetchone()
        if row is None:
            raise NotFoundError("task not found")
        return row

    def _fetch_roadmap(self, connection: sqlite3.Connection, phase_id: str, include_deleted: bool = False) -> sqlite3.Row:
        condition = "" if include_deleted else " AND deleted_at IS NULL"
        row = connection.execute(f"SELECT * FROM roadmap_phases WHERE id = ?{condition}", (phase_id,)).fetchone()
        if row is None:
            raise NotFoundError("roadmap phase not found")
        return row

    def _reindex_tasks(
        self, connection: sqlite3.Connection, status: str, ordered_ids: Sequence[str], now: str
    ) -> None:
        """Make a board column contiguous and invalidate stale positions.

        Moving one card changes the position of its neighbours too.  Those rows
        therefore receive a new version even though they do not get their own
        activity event; a stale client cannot silently overwrite an order that
        has changed underneath it.
        """
        rows = {
            row["id"]: row
            for row in connection.execute(
                "SELECT id, position FROM tasks WHERE status = ? AND deleted_at IS NULL", (status,)
            ).fetchall()
        }
        for position, task_id in enumerate(ordered_ids):
            row = rows.get(task_id)
            if row is not None and row["position"] != position:
                connection.execute(
                    "UPDATE tasks SET position = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                    (position, now, task_id),
                )

    def _reindex_roadmap(self, connection: sqlite3.Connection, ordered_ids: Sequence[str], now: str) -> None:
        rows = {
            row["id"]: row
            for row in connection.execute(
                "SELECT id, position FROM roadmap_phases WHERE deleted_at IS NULL"
            ).fetchall()
        }
        for position, phase_id in enumerate(ordered_ids):
            row = rows.get(phase_id)
            if row is not None and row["position"] != position:
                connection.execute(
                    "UPDATE roadmap_phases SET position = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                    (position, now, phase_id),
                )

    def task_count(self) -> int:
        connection = self._read()
        try:
            return int(connection.execute("SELECT COUNT(*) FROM tasks WHERE deleted_at IS NULL").fetchone()[0])
        finally:
            connection.close()

    def roadmap_count(self) -> int:
        connection = self._read()
        try:
            return int(connection.execute("SELECT COUNT(*) FROM roadmap_phases WHERE deleted_at IS NULL").fetchone()[0])
        finally:
            connection.close()

    def list_tasks(self, include_deleted: bool = False) -> List[Dict[str, Any]]:
        connection = self._read()
        try:
            where = "" if include_deleted else "WHERE deleted_at IS NULL"
            rows = connection.execute(
                f"SELECT * FROM tasks {where} ORDER BY {TASK_STATUS_ORDER_SQL}, position, id"
            ).fetchall()
            return [self._public(self._task_snapshot(row)) for row in rows]
        finally:
            connection.close()

    def get_task(self, task_id: str, include_deleted: bool = False) -> Dict[str, Any]:
        connection = self._read()
        try:
            return self._public(self._task_snapshot(self._fetch_task(connection, task_id, include_deleted)))
        finally:
            connection.close()

    def create_task(self, values: Mapping[str, Any], actor: str) -> Dict[str, Any]:
        item = dict(values)
        item["id"] = item.get("id") or _identifier("task")
        item.setdefault("status", "Backlog")
        item = self._validate_task(item)
        with self._transaction() as connection:
            if connection.execute("SELECT 1 FROM tasks WHERE id = ?", (item["id"],)).fetchone():
                raise ValidationError("task id already exists")
            requested_position = item.pop("position", None)
            ordered_ids = [
                value[0]
                for value in connection.execute(
                    "SELECT id FROM tasks WHERE status = ? AND deleted_at IS NULL ORDER BY position, id",
                    (item["status"],),
                ).fetchall()
            ]
            position = len(ordered_ids) if requested_position is None else min(max(0, int(requested_position)), len(ordered_ids))
            now = _now()
            connection.execute(
                """
                INSERT INTO tasks (id, payload_json, status, position, version, created_at, updated_at, deleted_at)
                VALUES (?, ?, ?, ?, 1, ?, ?, NULL)
                """,
                (item["id"], _dump(item), item["status"], position, now, now),
            )
            ordered_ids.insert(position, item["id"])
            self._reindex_tasks(connection, item["status"], ordered_ids, now)
            row = self._fetch_task(connection, item["id"])
            after = self._task_snapshot(row)
            self._event(
                connection,
                entity_type=ENTITY_TASK,
                entity_id=item["id"],
                event_type="task.created",
                actor=actor,
                before=None,
                after=after,
            )
            return self._public(after)

    def update_task(
        self, task_id: str, changes: Mapping[str, Any], actor: str, expected_version: Optional[int] = None
    ) -> Dict[str, Any]:
        with self._transaction() as connection:
            row = self._fetch_task(connection, task_id)
            self._assert_version(row, expected_version)
            before = self._task_snapshot(row)
            item = dict(before["item"])
            item.update(changes)
            item["id"] = task_id
            item["status"] = before["item"]["status"]
            item = self._validate_task(item)
            changed_fields = sorted(
                key for key in changes.keys() if item.get(key) != before["item"].get(key)
            )
            if not changed_fields:
                return self._public(before)
            now = _now()
            connection.execute(
                "UPDATE tasks SET payload_json = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                (_dump(item), now, task_id),
            )
            after = self._task_snapshot(self._fetch_task(connection, task_id))
            self._event(
                connection,
                entity_type=ENTITY_TASK,
                entity_id=task_id,
                event_type="task.updated",
                actor=actor,
                before=before,
                after=after,
                metadata={"changed_fields": changed_fields},
            )
            return self._public(after)

    def move_task(
        self, task_id: str, status: str, position: int, actor: str, expected_version: Optional[int] = None
    ) -> Dict[str, Any]:
        with self._transaction() as connection:
            row = self._fetch_task(connection, task_id)
            self._assert_version(row, expected_version)
            return self._move_task_in_transaction(connection, task_id, status, position, actor, row=row)

    def _move_task_in_transaction(
        self,
        connection: sqlite3.Connection,
        task_id: str,
        status: str,
        position: int,
        actor: str,
        *,
        row: sqlite3.Row,
    ) -> Dict[str, Any]:
        if status not in TASK_STATUSES:
            raise ValidationError("invalid task status")
        before = self._task_snapshot(row)
        old_status = row["status"]
        old_ids = [
            value[0]
            for value in connection.execute(
                "SELECT id FROM tasks WHERE status = ? AND deleted_at IS NULL ORDER BY position, id", (old_status,)
            ).fetchall()
            if value[0] != task_id
        ]
        target_ids = old_ids if status == old_status else [
            value[0]
            for value in connection.execute(
                "SELECT id FROM tasks WHERE status = ? AND deleted_at IS NULL ORDER BY position, id", (status,)
            ).fetchall()
        ]
        destination = min(max(0, position), len(target_ids))
        target_ids.insert(destination, task_id)
        item = dict(before["item"])
        item["status"] = status
        now = _now()
        connection.execute(
            "UPDATE tasks SET payload_json = ?, status = ?, position = ?, updated_at = ?, version = version + 1 WHERE id = ?",
            (_dump(item), status, destination, now, task_id),
        )
        if status != old_status:
            self._reindex_tasks(connection, old_status, old_ids, now)
        self._reindex_tasks(connection, status, target_ids, now)
        after = self._task_snapshot(self._fetch_task(connection, task_id))
        event_type = "task.status_changed" if status != old_status else "task.reordered"
        event_id = self._event(
            connection,
            entity_type=ENTITY_TASK,
            entity_id=task_id,
            event_type=event_type,
            actor=actor,
            before=before,
            after=after,
            metadata={"from_status": old_status, "to_status": status},
        )
        if status != old_status:
            self._queue_notification(connection, activity_id=event_id, status=status, created_at=now)
        return self._public(after)

    def transition_task(
        self, task_id: str, status: str, actor: str, expected_version: Optional[int] = None
    ) -> Dict[str, Any]:
        with self._transaction() as connection:
            row = self._fetch_task(connection, task_id)
            self._assert_version(row, expected_version)
            return self._move_task_in_transaction(
                connection, task_id, status, row["position"], actor, row=row
            )

    def delete_task(self, task_id: str, actor: str, expected_version: Optional[int] = None) -> Dict[str, Any]:
        with self._transaction() as connection:
            row = self._fetch_task(connection, task_id)
            self._assert_version(row, expected_version)
            before = self._task_snapshot(row)
            now = _now()
            connection.execute(
                "UPDATE tasks SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?", (now, now, task_id)
            )
            remaining = [
                value[0]
                for value in connection.execute(
                    "SELECT id FROM tasks WHERE status = ? AND deleted_at IS NULL ORDER BY position, id", (row["status"],)
                ).fetchall()
            ]
            self._reindex_tasks(connection, row["status"], remaining, now)
            after = self._task_snapshot(self._fetch_task(connection, task_id, include_deleted=True))
            self._event(
                connection,
                entity_type=ENTITY_TASK,
                entity_id=task_id,
                event_type="task.deleted",
                actor=actor,
                before=before,
                after=after,
            )
            return self._public(after)

    def restore_task(self, task_id: str, actor: str, expected_version: Optional[int] = None) -> Dict[str, Any]:
        with self._transaction() as connection:
            row = self._fetch_task(connection, task_id, include_deleted=True)
            if row["deleted_at"] is None:
                raise ValidationError("task is not deleted")
            self._assert_version(row, expected_version)
            before = self._task_snapshot(row)
            status = row["status"]
            position = int(
                connection.execute(
                    "SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE status = ? AND deleted_at IS NULL", (status,)
                ).fetchone()[0]
            )
            now = _now()
            connection.execute(
                "UPDATE tasks SET deleted_at = NULL, position = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                (position, now, task_id),
            )
            after = self._task_snapshot(self._fetch_task(connection, task_id))
            self._event(
                connection,
                entity_type=ENTITY_TASK,
                entity_id=task_id,
                event_type="task.restored",
                actor=actor,
                before=before,
                after=after,
            )
            return self._public(after)

    def list_roadmap(self, include_deleted: bool = False) -> List[Dict[str, Any]]:
        connection = self._read()
        try:
            where = "" if include_deleted else "WHERE deleted_at IS NULL"
            rows = connection.execute(f"SELECT * FROM roadmap_phases {where} ORDER BY position, id").fetchall()
            return [self._public(self._roadmap_snapshot(row)) for row in rows]
        finally:
            connection.close()

    def get_roadmap_phase(self, phase_id: str, include_deleted: bool = False) -> Dict[str, Any]:
        connection = self._read()
        try:
            return self._public(self._roadmap_snapshot(self._fetch_roadmap(connection, phase_id, include_deleted)))
        finally:
            connection.close()

    def create_roadmap_phase(self, values: Mapping[str, Any], actor: str) -> Dict[str, Any]:
        item = dict(values)
        item["id"] = item.get("id") or _identifier("phase")
        item = self._validate_roadmap(item)
        with self._transaction() as connection:
            if connection.execute("SELECT 1 FROM roadmap_phases WHERE id = ?", (item["id"],)).fetchone():
                raise ValidationError("roadmap phase id already exists")
            requested_position = item.pop("position", None)
            ordered_ids = [
                value[0]
                for value in connection.execute(
                    "SELECT id FROM roadmap_phases WHERE deleted_at IS NULL ORDER BY position, id"
                ).fetchall()
            ]
            position = len(ordered_ids) if requested_position is None else min(max(0, int(requested_position)), len(ordered_ids))
            now = _now()
            connection.execute(
                """
                INSERT INTO roadmap_phases (id, payload_json, position, version, created_at, updated_at, deleted_at)
                VALUES (?, ?, ?, 1, ?, ?, NULL)
                """,
                (item["id"], _dump(item), position, now, now),
            )
            ordered_ids.insert(position, item["id"])
            self._reindex_roadmap(connection, ordered_ids, now)
            after = self._roadmap_snapshot(self._fetch_roadmap(connection, item["id"]))
            self._event(
                connection,
                entity_type=ENTITY_ROADMAP_PHASE,
                entity_id=item["id"],
                event_type="roadmap_phase.created",
                actor=actor,
                before=None,
                after=after,
            )
            return self._public(after)

    def update_roadmap_phase(
        self, phase_id: str, changes: Mapping[str, Any], actor: str, expected_version: Optional[int] = None
    ) -> Dict[str, Any]:
        with self._transaction() as connection:
            row = self._fetch_roadmap(connection, phase_id)
            self._assert_version(row, expected_version)
            before = self._roadmap_snapshot(row)
            item = dict(before["item"])
            item.update(changes)
            item["id"] = phase_id
            item = self._validate_roadmap(item)
            changed_fields = sorted(
                key for key in changes.keys() if item.get(key) != before["item"].get(key)
            )
            if not changed_fields:
                return self._public(before)
            now = _now()
            connection.execute(
                "UPDATE roadmap_phases SET payload_json = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                (_dump(item), now, phase_id),
            )
            after = self._roadmap_snapshot(self._fetch_roadmap(connection, phase_id))
            event_type = "roadmap_phase.rescheduled" if {"start", "end"}.intersection(changes) else "roadmap_phase.updated"
            self._event(
                connection,
                entity_type=ENTITY_ROADMAP_PHASE,
                entity_id=phase_id,
                event_type=event_type,
                actor=actor,
                before=before,
                after=after,
                metadata={"changed_fields": changed_fields},
            )
            return self._public(after)

    def move_roadmap_phase(
        self, phase_id: str, position: int, actor: str, expected_version: Optional[int] = None
    ) -> Dict[str, Any]:
        with self._transaction() as connection:
            row = self._fetch_roadmap(connection, phase_id)
            self._assert_version(row, expected_version)
            before = self._roadmap_snapshot(row)
            ordered_ids = [
                value[0]
                for value in connection.execute("SELECT id FROM roadmap_phases WHERE deleted_at IS NULL ORDER BY position, id").fetchall()
                if value[0] != phase_id
            ]
            destination = min(max(0, position), len(ordered_ids))
            ordered_ids.insert(destination, phase_id)
            now = _now()
            connection.execute(
                "UPDATE roadmap_phases SET position = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                (destination, now, phase_id),
            )
            self._reindex_roadmap(connection, ordered_ids, now)
            after = self._roadmap_snapshot(self._fetch_roadmap(connection, phase_id))
            self._event(
                connection,
                entity_type=ENTITY_ROADMAP_PHASE,
                entity_id=phase_id,
                event_type="roadmap_phase.reordered",
                actor=actor,
                before=before,
                after=after,
            )
            return self._public(after)

    def delete_roadmap_phase(self, phase_id: str, actor: str, expected_version: Optional[int] = None) -> Dict[str, Any]:
        with self._transaction() as connection:
            row = self._fetch_roadmap(connection, phase_id)
            self._assert_version(row, expected_version)
            before = self._roadmap_snapshot(row)
            now = _now()
            connection.execute(
                "UPDATE roadmap_phases SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                (now, now, phase_id),
            )
            ordered_ids = [
                value[0]
                for value in connection.execute("SELECT id FROM roadmap_phases WHERE deleted_at IS NULL ORDER BY position, id").fetchall()
            ]
            self._reindex_roadmap(connection, ordered_ids, now)
            after = self._roadmap_snapshot(self._fetch_roadmap(connection, phase_id, include_deleted=True))
            self._event(
                connection,
                entity_type=ENTITY_ROADMAP_PHASE,
                entity_id=phase_id,
                event_type="roadmap_phase.deleted",
                actor=actor,
                before=before,
                after=after,
            )
            return self._public(after)

    def restore_roadmap_phase(self, phase_id: str, actor: str, expected_version: Optional[int] = None) -> Dict[str, Any]:
        with self._transaction() as connection:
            row = self._fetch_roadmap(connection, phase_id, include_deleted=True)
            if row["deleted_at"] is None:
                raise ValidationError("roadmap phase is not deleted")
            self._assert_version(row, expected_version)
            before = self._roadmap_snapshot(row)
            position = int(connection.execute("SELECT COALESCE(MAX(position), -1) + 1 FROM roadmap_phases WHERE deleted_at IS NULL").fetchone()[0])
            now = _now()
            connection.execute(
                "UPDATE roadmap_phases SET deleted_at = NULL, position = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                (position, now, phase_id),
            )
            after = self._roadmap_snapshot(self._fetch_roadmap(connection, phase_id))
            self._event(
                connection,
                entity_type=ENTITY_ROADMAP_PHASE,
                entity_id=phase_id,
                event_type="roadmap_phase.restored",
                actor=actor,
                before=before,
                after=after,
            )
            return self._public(after)

    def activity(self, entity_type: str, entity_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        limit = min(max(1, limit), 200)
        connection = self._read()
        try:
            rows = connection.execute(
                """
                SELECT * FROM activity_events
                WHERE entity_type = ? AND entity_id = ?
                ORDER BY occurred_at DESC, id DESC
                LIMIT ?
                """,
                (entity_type, entity_id, limit),
            ).fetchall()
            return [
                {
                    "id": row["id"],
                    "entity_type": row["entity_type"],
                    "entity_id": row["entity_id"],
                    "type": row["type"],
                    "actor": row["actor"],
                    "occurred_at": row["occurred_at"],
                    "before": _load(row["before_json"], None),
                    "after": _load(row["after_json"], None),
                    "metadata": _load(row["metadata_json"], {}),
                }
                for row in rows
            ]
        finally:
            connection.close()

    def replace_tasks_snapshot(self, items: Sequence[Mapping[str, Any]], actor: str) -> List[Dict[str, Any]]:
        validated = [self._validate_task(item) for item in items]
        ids = [item["id"] for item in validated]
        if len(ids) != len(set(ids)):
            raise ValidationError("task ids must be unique")
        with self._transaction() as connection:
            existing_rows = {row["id"]: row for row in connection.execute("SELECT * FROM tasks").fetchall()}
            now = _now()
            positions_by_status: Dict[str, int] = {}
            for item in validated:
                position = positions_by_status.get(item["status"], 0)
                positions_by_status[item["status"]] = position + 1
                existing = existing_rows.get(item["id"])
                if existing is None:
                    connection.execute(
                        """
                        INSERT INTO tasks (id, payload_json, status, position, version, created_at, updated_at, deleted_at)
                        VALUES (?, ?, ?, ?, 1, ?, ?, NULL)
                        """,
                        (item["id"], _dump(item), item["status"], position, now, now),
                    )
                    after = self._task_snapshot(self._fetch_task(connection, item["id"]))
                    self._event(
                        connection,
                        entity_type=ENTITY_TASK,
                        entity_id=item["id"],
                        event_type="task.created",
                        actor=actor,
                        before=None,
                        after=after,
                        metadata={"source": "legacy_snapshot"},
                    )
                else:
                    before = self._task_snapshot(existing)
                    is_unchanged = (
                        existing["payload_json"] == _dump(item)
                        and existing["status"] == item["status"]
                        and existing["position"] == position
                        and existing["deleted_at"] is None
                    )
                    if is_unchanged:
                        continue
                    connection.execute(
                        """
                        UPDATE tasks
                        SET payload_json = ?, status = ?, position = ?, deleted_at = NULL,
                            updated_at = ?, version = version + 1
                        WHERE id = ?
                        """,
                        (_dump(item), item["status"], position, now, item["id"]),
                    )
                    after = self._task_snapshot(self._fetch_task(connection, item["id"]))
                    self._event(
                        connection,
                        entity_type=ENTITY_TASK,
                        entity_id=item["id"],
                        event_type="task.snapshot_replaced",
                        actor=actor,
                        before=before,
                        after=after,
                        metadata={"source": "legacy_snapshot", "changed_fields": ["snapshot"]},
                    )
            for task_id, existing in existing_rows.items():
                if task_id in ids or existing["deleted_at"] is not None:
                    continue
                before = self._task_snapshot(existing)
                connection.execute(
                    "UPDATE tasks SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                    (now, now, task_id),
                )
                after = self._task_snapshot(self._fetch_task(connection, task_id, include_deleted=True))
                self._event(
                    connection,
                    entity_type=ENTITY_TASK,
                    entity_id=task_id,
                    event_type="task.deleted",
                    actor=actor,
                    before=before,
                    after=after,
                    metadata={"source": "legacy_snapshot"},
                )
            connection.execute(
                "INSERT INTO app_state (key, value, updated_at) VALUES ('tasks_initialized', 'true', ?) ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = excluded.updated_at",
                (now,),
            )
            rows = connection.execute(
                f"SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY {TASK_STATUS_ORDER_SQL}, position, id"
            ).fetchall()
            return [self._legacy(self._task_snapshot(row)) for row in rows]

    def replace_roadmap_snapshot(self, items: Sequence[Mapping[str, Any]], actor: str) -> List[Dict[str, Any]]:
        validated = [self._validate_roadmap(item) for item in items]
        ids = [item["id"] for item in validated]
        if len(ids) != len(set(ids)):
            raise ValidationError("roadmap phase ids must be unique")
        with self._transaction() as connection:
            existing_rows = {row["id"]: row for row in connection.execute("SELECT * FROM roadmap_phases").fetchall()}
            now = _now()
            for position, item in enumerate(validated):
                existing = existing_rows.get(item["id"])
                if existing is None:
                    connection.execute(
                        """
                        INSERT INTO roadmap_phases (id, payload_json, position, version, created_at, updated_at, deleted_at)
                        VALUES (?, ?, ?, 1, ?, ?, NULL)
                        """,
                        (item["id"], _dump(item), position, now, now),
                    )
                    after = self._roadmap_snapshot(self._fetch_roadmap(connection, item["id"]))
                    self._event(
                        connection,
                        entity_type=ENTITY_ROADMAP_PHASE,
                        entity_id=item["id"],
                        event_type="roadmap_phase.created",
                        actor=actor,
                        before=None,
                        after=after,
                        metadata={"source": "legacy_snapshot"},
                    )
                else:
                    before = self._roadmap_snapshot(existing)
                    is_unchanged = (
                        existing["payload_json"] == _dump(item)
                        and existing["position"] == position
                        and existing["deleted_at"] is None
                    )
                    if is_unchanged:
                        continue
                    connection.execute(
                        """
                        UPDATE roadmap_phases
                        SET payload_json = ?, position = ?, deleted_at = NULL, updated_at = ?, version = version + 1
                        WHERE id = ?
                        """,
                        (_dump(item), position, now, item["id"]),
                    )
                    after = self._roadmap_snapshot(self._fetch_roadmap(connection, item["id"]))
                    self._event(
                        connection,
                        entity_type=ENTITY_ROADMAP_PHASE,
                        entity_id=item["id"],
                        event_type="roadmap.snapshot_replaced",
                        actor=actor,
                        before=before,
                        after=after,
                        metadata={"source": "legacy_snapshot", "changed_fields": ["snapshot"]},
                    )
            for phase_id, existing in existing_rows.items():
                if phase_id in ids or existing["deleted_at"] is not None:
                    continue
                before = self._roadmap_snapshot(existing)
                connection.execute(
                    "UPDATE roadmap_phases SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?",
                    (now, now, phase_id),
                )
                after = self._roadmap_snapshot(self._fetch_roadmap(connection, phase_id, include_deleted=True))
                self._event(
                    connection,
                    entity_type=ENTITY_ROADMAP_PHASE,
                    entity_id=phase_id,
                    event_type="roadmap_phase.deleted",
                    actor=actor,
                    before=before,
                    after=after,
                    metadata={"source": "legacy_snapshot"},
                )
            connection.execute(
                "INSERT INTO app_state (key, value, updated_at) VALUES ('roadmap_initialized', 'true', ?) ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = excluded.updated_at",
                (now,),
            )
            rows = connection.execute("SELECT * FROM roadmap_phases WHERE deleted_at IS NULL ORDER BY position, id").fetchall()
            return [self._legacy(self._roadmap_snapshot(row)) for row in rows]

    def legacy_tasks(self) -> Tuple[bool, List[Dict[str, Any]]]:
        connection = self._read()
        try:
            initialized = connection.execute("SELECT value FROM app_state WHERE key = 'tasks_initialized'").fetchone()
            rows = connection.execute(
                f"SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY {TASK_STATUS_ORDER_SQL}, position, id"
            ).fetchall()
            return bool(initialized and initialized[0] == "true"), [self._legacy(self._task_snapshot(row)) for row in rows]
        finally:
            connection.close()

    def legacy_roadmap(self) -> Tuple[bool, List[Dict[str, Any]]]:
        connection = self._read()
        try:
            initialized = connection.execute("SELECT value FROM app_state WHERE key = 'roadmap_initialized'").fetchone()
            rows = connection.execute("SELECT * FROM roadmap_phases WHERE deleted_at IS NULL ORDER BY position, id").fetchall()
            return bool(initialized and initialized[0] == "true"), [self._legacy(self._roadmap_snapshot(row)) for row in rows]
        finally:
            connection.close()

    def export_snapshot(self, include_deleted: bool = False) -> Dict[str, Any]:
        """Produce a portable data-only backup; webhook configuration is never exported."""
        return {
            "schema_version": 1,
            "exported_at": _now(),
            "tasks": [snapshot["item"] for snapshot in self.list_tasks(include_deleted=include_deleted)],
            "roadmap": [snapshot["item"] for snapshot in self.list_roadmap(include_deleted=include_deleted)],
        }

    def readiness(self) -> Dict[str, Any]:
        connection = self._read()
        try:
            connection.execute("SELECT 1").fetchone()
            migrations = [
                row["version"]
                for row in connection.execute("SELECT version FROM schema_migrations ORDER BY version").fetchall()
            ]
            return {"ok": True, "migrations": migrations, "outbox": self.delivery_summary(connection)}
        finally:
            connection.close()

    def delivery_summary(self, connection: Optional[sqlite3.Connection] = None) -> Dict[str, int]:
        owns_connection = connection is None
        active_connection = connection or self._read()
        try:
            rows = active_connection.execute(
                "SELECT status, COUNT(*) AS count FROM webhook_deliveries GROUP BY status"
            ).fetchall()
            return {row["status"]: int(row["count"]) for row in rows}
        finally:
            if owns_connection:
                active_connection.close()

    def due_deliveries(self, limit: int = 20) -> List[Dict[str, Any]]:
        now = _now()
        connection = self._read()
        try:
            rows = connection.execute(
                """
                SELECT d.*, e.entity_id, e.before_json, e.after_json, e.actor, e.occurred_at
                FROM webhook_deliveries d
                JOIN activity_events e ON e.id = d.activity_id
                WHERE d.status IN ('pending', 'failed')
                  AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= ?)
                ORDER BY d.created_at ASC
                LIMIT ?
                """,
                (now, limit),
            ).fetchall()
            return [dict(row) for row in rows]
        finally:
            connection.close()

    def claim_due_deliveries(self, limit: int, lease_seconds: int) -> List[Dict[str, Any]]:
        """Claim deliveries atomically so concurrent workers cannot post twice.

        A lease makes a delivery recoverable if a worker dies between claiming
        and posting.  ``claim_token`` is checked again while finalising so an
        expired worker cannot overwrite a newer attempt.
        """
        limit = min(max(1, limit), 100)
        now = _now()
        lease_expires_at = _future(lease_seconds)
        with self._transaction() as connection:
            candidates = connection.execute(
                """
                SELECT id FROM webhook_deliveries
                WHERE (
                    status IN ('pending', 'failed')
                    AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
                ) OR (
                    status = 'processing'
                    AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
                )
                ORDER BY created_at ASC
                LIMIT ?
                """,
                (now, now, limit),
            ).fetchall()
            claims: Dict[str, str] = {}
            for candidate in candidates:
                delivery_id = candidate["id"]
                claim_token = _identifier("claim")
                updated = connection.execute(
                    """
                    UPDATE webhook_deliveries
                    SET status = 'processing', claim_token = ?, lease_expires_at = ?
                    WHERE id = ? AND (
                        (status IN ('pending', 'failed') AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
                        OR (status = 'processing' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
                    )
                    """,
                    (claim_token, lease_expires_at, delivery_id, now, now),
                )
                if updated.rowcount:
                    claims[delivery_id] = claim_token
            if not claims:
                return []
            placeholders = ", ".join("?" for _ in claims)
            rows = connection.execute(
                f"""
                SELECT d.*, e.entity_id, e.before_json, e.after_json, e.actor, e.occurred_at
                FROM webhook_deliveries d
                JOIN activity_events e ON e.id = d.activity_id
                WHERE d.id IN ({placeholders})
                ORDER BY d.created_at ASC
                """,
                tuple(claims),
            ).fetchall()
            return [dict(row) for row in rows]

    def mark_delivery_sent(self, delivery_id: str, claim_token: Optional[str] = None) -> bool:
        with self._transaction() as connection:
            if claim_token is None:
                updated = connection.execute(
                    """
                    UPDATE webhook_deliveries
                    SET status = 'sent', attempt_count = attempt_count + 1, sent_at = ?, last_error = NULL,
                        claim_token = NULL, lease_expires_at = NULL
                    WHERE id = ?
                    """,
                    (_now(), delivery_id),
                )
            else:
                updated = connection.execute(
                    """
                    UPDATE webhook_deliveries
                    SET status = 'sent', attempt_count = attempt_count + 1, sent_at = ?, last_error = NULL,
                        claim_token = NULL, lease_expires_at = NULL
                    WHERE id = ? AND status = 'processing' AND claim_token = ?
                    """,
                    (_now(), delivery_id, claim_token),
                )
            return bool(updated.rowcount)

    def mark_delivery_failed(
        self,
        delivery_id: str,
        error: str,
        max_attempts: int,
        retry_base_seconds: int = 60,
        claim_token: Optional[str] = None,
    ) -> bool:
        with self._transaction() as connection:
            if claim_token is None:
                row = connection.execute(
                    "SELECT attempt_count FROM webhook_deliveries WHERE id = ?", (delivery_id,)
                ).fetchone()
            else:
                row = connection.execute(
                    "SELECT attempt_count FROM webhook_deliveries WHERE id = ? AND status = 'processing' AND claim_token = ?",
                    (delivery_id, claim_token),
                ).fetchone()
            if row is None:
                return False
            attempt = row["attempt_count"] + 1
            status = "failed" if attempt < max_attempts else "abandoned"
            backoff_seconds = min(3600, retry_base_seconds * (2 ** min(attempt - 1, 6)))
            next_attempt = None if status == "abandoned" else _future(backoff_seconds)
            if claim_token is None:
                updated = connection.execute(
                    """
                    UPDATE webhook_deliveries
                    SET status = ?, attempt_count = ?, last_error = ?, next_attempt_at = ?,
                        claim_token = NULL, lease_expires_at = NULL
                    WHERE id = ?
                    """,
                    (status, attempt, error[:1000], next_attempt, delivery_id),
                )
            else:
                updated = connection.execute(
                    """
                    UPDATE webhook_deliveries
                    SET status = ?, attempt_count = ?, last_error = ?, next_attempt_at = ?,
                        claim_token = NULL, lease_expires_at = NULL
                    WHERE id = ? AND status = 'processing' AND claim_token = ?
                    """,
                    (status, attempt, error[:1000], next_attempt, delivery_id, claim_token),
                )
            return bool(updated.rowcount)
