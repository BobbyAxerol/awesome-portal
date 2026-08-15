from __future__ import annotations


TASK_STATUSES = ("Backlog", "Ready", "In Progress", "Validating", "Done")


def _task(task_id: str, status: str) -> dict[str, object]:
    return {
        "id": task_id,
        "title": f"private title for {task_id}",
        "status": status,
        "notes": f"private notes for {task_id}",
    }


def _roadmap(phase_id: str, start: int) -> dict[str, object]:
    return {
        "id": phase_id,
        "name": f"private name for {phase_id}",
        "start": start,
        "end": start + 1,
        "outcome": f"private outcome for {phase_id}",
    }


def test_planning_summary_empty_contract_is_bounded_and_read_only(client) -> None:
    before = client.get("/api/v1/export").json()
    before.pop("exported_at")

    response = client.get("/api/v1/summary")

    assert response.status_code == 200
    assert response.json() == {
        "schema_version": "planning.summary.v1",
        "observed_at": response.json()["observed_at"],
        "total_tasks": 0,
        "task_counts": {status: 0 for status in TASK_STATUSES},
        "roadmap_phase_count": 0,
        "recent_tasks": [],
        "recent_roadmap": [],
    }
    assert response.json()["observed_at"].endswith("Z")
    after = client.get("/api/v1/export").json()
    after.pop("exported_at")
    assert after == before


def test_planning_summary_counts_current_statuses_without_private_content(client) -> None:
    created = []
    for index, status in enumerate((*TASK_STATUSES, "Backlog")):
        created.append(
            client.post(
                "/api/v1/tasks",
                json=_task(f"TASK-{index}", status),
            ).json()
        )
    deleted = client.delete(
        "/api/v1/tasks/TASK-5",
        params={"expected_version": created[5]["version"]},
    )
    assert deleted.status_code == 200
    for index in range(2):
        assert client.post(
            "/api/v1/roadmap",
            json=_roadmap(f"PHASE-{index}", index + 1),
        ).status_code == 201

    response = client.get("/api/v1/summary", params={"recent_limit": 3})
    payload = response.json()

    assert response.status_code == 200
    assert payload["total_tasks"] == 5
    assert payload["task_counts"] == {status: 1 for status in TASK_STATUSES}
    assert payload["roadmap_phase_count"] == 2
    assert len(payload["recent_tasks"]) == 3
    assert len(payload["recent_roadmap"]) == 2
    assert all(set(item) == {"id", "status", "updated_at"} for item in payload["recent_tasks"])
    assert all(set(item) == {"id", "updated_at"} for item in payload["recent_roadmap"])
    serialized = response.text
    assert "private title" not in serialized
    assert "private notes" not in serialized
    assert "private name" not in serialized
    assert "private outcome" not in serialized
    assert "TASK-5" not in serialized


def test_planning_summary_rejects_unbounded_limit_and_has_no_mutation_method(client) -> None:
    assert client.get("/api/v1/summary", params={"recent_limit": 0}).status_code == 422
    assert client.get("/api/v1/summary", params={"recent_limit": 6}).status_code == 422
    assert client.post("/api/v1/summary", json={}).status_code >= 400
