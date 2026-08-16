from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.app.infrastructure.cutover import (
    CUTOVER_STATES,
    CutoverError,
    CutoverState,
    SqliteCutoverTarget,
    checksum_of,
    export_cutover,
    import_cutover,
    reconcile_cutover,
)


class FakeRepository:
    def export_snapshot(self, include_deleted: bool = False):
        del include_deleted
        tasks = [
            {"id": "TASK-1", "title": "First", "status": "Done", "version": 1},
            {"id": "TASK-2", "title": "Second", "status": "Ready", "version": 1},
        ]
        roadmap = [{"id": "PHASE-1", "name": "P1", "status": "active"}]
        return {
            "schema_version": 1,
            "exported_at": "2026-08-16T00:00:00Z",
            "tasks": tasks,
            "roadmap": roadmap,
            "counts": {"tasks": 2, "roadmap": 1},
            "content_hash": "sha256:" + "a" * 64,
        }


def test_export_maps_legacy_ids_with_checksums() -> None:
    payload = export_cutover(FakeRepository())

    assert payload["schema_version"] == "planning-cutover.v1"
    assert payload["counts"] == {"tasks": 2, "roadmap": 1}
    assert len(payload["entities"]) == 3
    for entity in payload["entities"]:
        assert checksum_of(entity["content"]) == entity["checksum"]
        assert entity["legacy_id"]
    kinds = [entity["kind"] for entity in payload["entities"]]
    assert kinds.count("task") == 2
    assert kinds.count("roadmap") == 1


def test_import_is_idempotent_and_rejects_tampered_checksums(tmp_path: Path) -> None:
    payload = export_cutover(FakeRepository())
    target = SqliteCutoverTarget(tmp_path / "target.db")

    first = import_cutover(payload, target)
    assert first == {"imported": 3, "skipped": 0, "rejected": []}

    second = import_cutover(payload, target)
    assert second == {"imported": 0, "skipped": 3, "rejected": []}

    tampered = json.loads(json.dumps(payload))
    tampered["entities"][0]["content"]["title"] = "Tampered"
    third = import_cutover(tampered, target)
    assert third["rejected"] == ["TASK-1"]
    assert third["imported"] == 0

    target.close()


def test_reconciliation_is_exact_after_import(tmp_path: Path) -> None:
    payload = export_cutover(FakeRepository())
    target = SqliteCutoverTarget(tmp_path / "target.db")

    before = reconcile_cutover(payload, target)
    assert before["exact"] is False
    assert before["missing"] == 3

    import_cutover(payload, target)
    after = reconcile_cutover(payload, target)
    assert after["exact"] is True
    assert after["missing"] == 0
    target.close()


def test_cutover_state_machine_is_explicit(tmp_path: Path) -> None:
    state = CutoverState(tmp_path / "cutover.json")
    assert state.state == "NOT_STARTED"

    assert state.transition("EXPORTED") == "EXPORTED"
    assert state.transition("IMPORTED") == "IMPORTED"
    assert state.transition("RECONCILED") == "RECONCILED"
    assert state.transition("ARCHIVED") == "ARCHIVED"

    with pytest.raises(CutoverError, match="not allowed"):
        state.transition("IMPORTED")

    with pytest.raises(CutoverError, match="not allowed"):
        CutoverState(tmp_path / "other.json").transition("RECONCILED")


def test_cutover_states_cover_the_u18_flow() -> None:
    assert CUTOVER_STATES == (
        "NOT_STARTED",
        "EXPORTED",
        "IMPORTED",
        "RECONCILED",
        "ARCHIVED",
    )
