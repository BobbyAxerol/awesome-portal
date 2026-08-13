from __future__ import annotations


def test_roadmap_phase_can_be_created_rescheduled_reordered_deleted_and_restored(client):
    created = client.post(
        "/api/v1/roadmap",
        json={"id": "P0", "name": "Acquire", "start": 1, "end": 2, "owner": "Ops", "tone": "blue", "outcome": "Stable"},
        headers={"X-Portal-Actor": "bobby"},
    )
    assert created.status_code == 201
    phase = created.json()
    assert phase["item"]["id"] == "P0"

    updated = client.patch(
        "/api/v1/roadmap/P0",
        json={"start": 2, "end": 4, "expected_version": phase["version"]},
        headers={"X-Portal-Actor": "bobby"},
    )
    assert updated.status_code == 200
    phase = updated.json()
    assert phase["item"]["start"] == 2
    assert phase["item"]["end"] == 4

    moved = client.post(
        "/api/v1/roadmap/P0/move",
        json={"position": 0, "expected_version": phase["version"]},
        headers={"X-Portal-Actor": "bobby"},
    )
    assert moved.status_code == 200
    phase = moved.json()

    deleted = client.delete(f"/api/v1/roadmap/P0?expected_version={phase['version']}")
    assert deleted.status_code == 200
    assert client.get("/api/v1/roadmap").json() == {"items": []}

    deleted_phase = client.get("/api/v1/roadmap/P0?include_deleted=true").json()
    restored = client.post("/api/v1/roadmap/P0/restore", json={"expected_version": deleted_phase["version"]})
    assert restored.status_code == 200
    assert restored.json()["deleted_at"] is None

    activity = client.get("/api/v1/roadmap/P0/activity").json()["items"]
    assert [event["type"] for event in activity] == [
        "roadmap_phase.restored",
        "roadmap_phase.deleted",
        "roadmap_phase.reordered",
        "roadmap_phase.rescheduled",
        "roadmap_phase.created",
    ]
