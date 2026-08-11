from __future__ import annotations


def test_legacy_seed_is_preserved_and_v1_task_lifecycle_is_audited(client):
    assert client.get("/api/health").json()["storage"] == "sqlite"
    assert client.get("/api/tasks").json() == {"initialized": False, "items": []}

    seed = [
        {
            "id": "DATA-001",
            "title": "Freeze data baseline",
            "workstream": "Data",
            "phase": "P0",
            "weeks": "W1",
            "priority": "P0",
            "owner": "Data Lead",
            "status": "Ready",
            "depends": [],
        }
    ]
    response = client.put("/api/tasks", json=seed, headers={"X-Portal-Actor": "importer"})
    assert response.status_code == 200
    assert response.json() == {"ok": True, "saved": 1}
    assert client.get("/api/tasks").json() == {"initialized": True, "items": seed}

    created = client.post(
        "/api/v1/tasks",
        json={"title": "Validate task transition", "workstream": "Platform", "owner": "Bobby"},
        headers={"X-Portal-Actor": "bobby"},
    )
    assert created.status_code == 201
    task = created.json()
    task_id = task["item"]["id"]
    assert task["item"]["status"] == "Backlog"
    assert task["version"] == 1

    edited = client.patch(
        f"/api/v1/tasks/{task_id}",
        json={"notes": "Keep this in the audit trail", "expected_version": task["version"]},
        headers={"X-Portal-Actor": "bobby"},
    )
    assert edited.status_code == 200
    task = edited.json()
    assert task["item"]["notes"] == "Keep this in the audit trail"

    moved = client.post(
        f"/api/v1/tasks/{task_id}/move",
        json={"status": "In Progress", "position": 0, "expected_version": task["version"]},
        headers={"X-Portal-Actor": "bobby"},
    )
    assert moved.status_code == 200
    task = moved.json()
    assert task["item"]["status"] == "In Progress"
    assert task["position"] == 0

    activity = client.get(f"/api/v1/tasks/{task_id}/activity").json()["items"]
    event_types = [event["type"] for event in activity]
    assert event_types == ["task.status_changed", "task.updated", "task.created"]
    transition = activity[0]
    assert transition["before"]["item"]["status"] == "Backlog"
    assert transition["after"]["item"]["status"] == "In Progress"
    assert transition["actor"] == "bobby"

    stale = client.patch(f"/api/v1/tasks/{task_id}", json={"owner": "Other", "expected_version": 1})
    assert stale.status_code == 409

    deleted = client.delete(f"/api/v1/tasks/{task_id}?expected_version={task['version']}")
    assert deleted.status_code == 200
    assert deleted.json()["deleted_at"]
    assert all(item["item"]["id"] != task_id for item in client.get("/api/v1/tasks").json()["items"])

    deleted_task = client.get(f"/api/v1/tasks/{task_id}?include_deleted=true").json()
    restored = client.post(
        f"/api/v1/tasks/{task_id}/restore",
        json={"expected_version": deleted_task["version"]},
    )
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None


def test_backend_serves_current_portal_and_api_documentation(client):
    portal = client.get("/")
    assert portal.status_code == 200
    assert b"Quant Ecosystem Architecture & Migration Portal" in portal.content
    assert client.get("/api/docs").status_code == 200


def test_status_notification_is_persisted_as_an_outbox_delivery(client):
    created = client.post("/api/v1/tasks", json={"title": "Notify when ready"}).json()
    task_id = created["item"]["id"]
    response = client.post(
        f"/api/v1/tasks/{task_id}/transition",
        json={"status": "Validating", "expected_version": created["version"]},
    )
    assert response.status_code == 200
    due = client.app.state.repository.due_deliveries()
    assert len(due) == 1
    assert due[0]["event_type"] == "task.status_changed"

    task = response.json()
    response = client.post(
        f"/api/v1/tasks/{task_id}/transition",
        json={"status": "Done", "expected_version": task["version"]},
    )
    assert response.status_code == 200
    assert len(client.app.state.repository.due_deliveries()) == 2
