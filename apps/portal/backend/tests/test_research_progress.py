from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from portal_api.services import research_progress as progress_module
from portal_api.services import research_progress_relay as relay_module
from portal_api.services.research_progress import ResearchProgressError, ResearchProgressJournal
from portal_api.services.research_progress_recovery import ResearchProgressRecovery
from portal_api.services.research_progress_relay import ResearchProgressRelay


_DIGEST = "a" * 64
_USAGE = {
    "peak_rss_bytes": 1024,
    "cpu_seconds": 1,
    "scratch_bytes": 0,
    "fd_peak": 4,
}


def _journal(tmp_path: Path) -> ResearchProgressJournal:
    return ResearchProgressJournal(
        tmp_path / "durable",
        run_id="run_p11",
        attempt_id="ra_p11",
        lease_epoch=7,
        planned_trials=2,
    )


def test_progress_journal_is_structured_sealed_and_reopenable(tmp_path: Path) -> None:
    journal = _journal(tmp_path)
    journal.emit("run_started")
    journal.emit("stage_started", {"stage": "S1"})
    journal.emit("trial_completed", {
        "fold": 1,
        "trial": 1,
        "overall_pct": 50,
        "tqdm_line": "fold 1 · trial 1/2",
        "console": {"tone": "INFO", "text": "trial started", "fold": 1, "trial": 1},
    })
    journal.emit("fold_completed", {"fold": 1})
    journal.emit("stage_completed", {"stage": "S1"})
    journal.emit("stage_started", {"stage": "S5"})
    journal.emit("seal_started")
    journal.emit("artifact_writing", {"name": "research/progress-receipt.json"})
    journal.mark_mandatory_sealed(bundle_digest=_DIGEST, bundle_bytes=12)
    journal.emit("artifact_sealed", {
        "name": "research/progress-receipt.json",
        "size": "12",
        "digest": _DIGEST,
        "reader_href": None,
    })
    journal.emit("stage_completed", {"stage": "S5"})
    journal.emit("run_completed", {"usage": _USAGE})

    snapshot = journal.snapshot()
    assert snapshot["status"] == "COMPLETED"
    assert snapshot["readiness"]["mandatory"] == "SEALED"
    assert snapshot["claim"]["state"] == "NOT_ISSUED"
    assert snapshot["claim"]["methodology_certificate"] == {
        "state": "NOT_PUBLISHED",
        "grade": None,
        "issued_at_utc_ms": None,
        "reason_code": "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE",
    }
    # `trial_completed` / `fold_completed` are whole-fold lifecycle facts.
    # They must not be re-labelled as Search/OOS/freeze methodology merely
    # because the fixed P04 adapter knows the run has progressed.
    assert snapshot["folds"][0]["state"] == "DONE"
    assert snapshot["folds"][0]["fold_timeline"] == {
        "state": "NOT_PUBLISHED",
        "reason_code": "SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS",
        "segments": [],
    }
    assert snapshot["artifacts"][0]["state"] == "SEALED"
    assert snapshot["latest_sequence"] == 11
    assert journal.events_after(0)["events"][-1]["event_type"] == "run_completed"

    reopened = _journal(tmp_path)
    assert reopened.snapshot()["latest_sequence"] == 11
    with pytest.raises(ResearchProgressError, match="terminal"):
        reopened.emit("heartbeat")


def test_completion_is_rejected_before_mandatory_seal(tmp_path: Path) -> None:
    journal = _journal(tmp_path)
    journal.emit("run_started")
    with pytest.raises(ResearchProgressError, match="mandatory seal"):
        journal.emit("run_completed", {"usage": _USAGE})
    assert journal.snapshot()["status"] == "RUNNING"


def test_source_journal_rejects_unknown_payloads_before_they_can_replay(tmp_path: Path) -> None:
    journal = _journal(tmp_path)
    with pytest.raises(ResearchProgressError, match="payload shape"):
        journal.emit("run_started", {"source_path": "/private"})
    with pytest.raises(ResearchProgressError, match="terminal usage"):
        journal.emit("run_failed", {
            "code": "ENGINE_ERROR",
            "message": "failed",
            "usage": {"peak_rss_bytes": 1},
        })
    with pytest.raises(ResearchProgressError, match="reader link is unavailable"):
        journal.emit("artifact_sealed", {
            "name": "research/private.json",
            "size": "1",
            "digest": _DIGEST,
            "reader_href": "/internal/worker/private.json",
        })
    assert journal.snapshot()["latest_sequence"] == 0


def test_fold_segments_and_methodology_certificate_are_source_facts_not_claim_parsing(tmp_path: Path) -> None:
    journal = _journal(tmp_path)
    journal.emit("run_started")
    journal.emit("fold_segment_observed", {
        "fold": 1,
        "kind": "search",
        "state": "DONE",
        "started_at_utc_ms": 100,
        "completed_at_utc_ms": 120,
    })
    journal.emit("fold_segment_observed", {
        "fold": 1,
        "kind": "oos",
        "state": "DONE",
        "started_at_utc_ms": 121,
        "completed_at_utc_ms": 140,
    })
    journal.emit("fold_segment_observed", {
        "fold": 1,
        "kind": "freeze_tick",
        "state": "DONE",
        "started_at_utc_ms": 141,
        "completed_at_utc_ms": 141,
    })
    snapshot = journal.snapshot()
    assert snapshot["folds"][0]["fold_timeline"]["state"] == "COMPLETE"
    assert snapshot["folds"][0]["fold_timeline"]["reason_code"] is None
    assert [item["kind"] for item in snapshot["folds"][0]["fold_timeline"]["segments"]] == [
        "search", "oos", "freeze_tick",
    ]

    journal.emit("stage_started", {"stage": "S5"})
    journal.emit("seal_started")
    journal.mark_mandatory_sealed(bundle_digest=_DIGEST, bundle_bytes=12)
    journal.emit("stage_completed", {"stage": "S5"})
    journal.emit("run_completed", {
        "usage": _USAGE,
        "claim": {
            "state": "ISSUED",
            "text": "STRICT_OUTER_OOS_AFTER_FROZEN_SELECTION",
            "cursor": "cursor_1",
            "methodology_certificate": {
                "state": "ISSUED",
                "grade": "B",
                "issued_at_utc_ms": 142,
                "reason_code": None,
            },
        },
    })
    completed = journal.snapshot()
    assert completed["claim"]["methodology_certificate"] == {
        "state": "ISSUED",
        "grade": "B",
        "issued_at_utc_ms": 142,
        "reason_code": None,
    }

    rejected = _journal(tmp_path / "rejected")
    with pytest.raises(ResearchProgressError, match="running fold segment"):
        rejected.emit("fold_segment_observed", {
            "fold": 1,
            "kind": "search",
            "state": "RUNNING",
            "started_at_utc_ms": 100,
            "completed_at_utc_ms": 101,
        })
    with pytest.raises(ResearchProgressError, match="issued shape"):
        rejected.emit("run_completed", {
            "usage": _USAGE,
            "claim": {
                "state": "ISSUED",
                "text": "claim",
                "cursor": None,
                "methodology_certificate": {
                    "state": "ISSUED",
                    "grade": None,
                    "issued_at_utc_ms": 1,
                    "reason_code": None,
                },
            },
        })


def test_source_journal_rejects_duplicate_start_and_malformed_reopen(tmp_path: Path) -> None:
    journal = _journal(tmp_path)
    journal.emit("run_started")
    with pytest.raises(ResearchProgressError, match="only from the queued"):
        journal.emit("run_started")

    snapshot_path = journal.root / "snapshot.json"
    malformed = json.loads(snapshot_path.read_text(encoding="utf-8"))
    malformed.pop("overall")
    snapshot_path.write_text(json.dumps(malformed), encoding="utf-8")
    with pytest.raises(ResearchProgressError, match="invalid shape"):
        _journal(tmp_path)


def test_compact_snapshot_budget_rejects_before_appending_an_event(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journal = _journal(tmp_path)
    journal.emit("run_started")
    # This isolates the invariant rather than allocating a giant synthetic
    # artifact list: once the compact projection budget is exhausted, the next
    # source fact must not leave an unprojectable orphan in the segment log.
    monkeypatch.setattr(progress_module, "_MAX_SNAPSHOT_BYTES", 1)
    with pytest.raises(ResearchProgressError, match="snapshot exceeds"):
        journal.emit("heartbeat")
    assert journal.snapshot()["latest_sequence"] == 1
    assert [event["sequence"] for event in journal.events_after(0)["events"]] == [1]


def test_retention_floor_is_explicit_after_bounded_segment_rotation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(progress_module, "_SEGMENT_EVENTS", 2)
    monkeypatch.setattr(progress_module, "_MAX_SEGMENTS", 1)
    journal = _journal(tmp_path)
    journal.emit("run_started")
    for _ in range(4):
        journal.emit("heartbeat")

    page = journal.events_after(0)
    assert page["latest_sequence"] == 5
    assert page["retention_floor_sequence"] == 4
    assert [item["sequence"] for item in page["events"]] == [5]


def test_relay_replays_only_fsynced_journal_events_and_persists_its_ack(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journal = _journal(tmp_path)
    journal.emit("run_started")
    journal.emit("heartbeat")
    received: list[dict[str, object]] = []
    relay = ResearchProgressRelay(
        journal=journal,
        job_id="job_p11",
        workspace_id="workspace_p11",
        endpoint="https://control.internal.example",
        secret="x" * 32,
    )

    def accepted(body: dict[str, object]) -> None:
        received.append(body)

    monkeypatch.setattr(relay, "_post", accepted)

    # The Codex test sandbox deliberately blocks asyncio's default executor
    # (plain ThreadPoolExecutor still works), while production invokes the
    # bounded 1.5s private HTTP call in that executor.  Exercise the relay's
    # page/ACK semantics synchronously here instead of making a sandbox quirk
    # look like a source-delivery failure.
    async def inline_to_thread(function: object, /, *args: object, **kwargs: object) -> object:
        assert callable(function)
        return function(*args, **kwargs)

    monkeypatch.setattr(relay_module.asyncio, "to_thread", inline_to_thread)
    assert asyncio.run(relay.flush()) is True
    assert [item["event"]["sequence"] for item in received] == [1, 2]
    assert json.loads((journal.root / "relay-ack.json").read_text(encoding="utf-8")) == {
        "last_acknowledged_sequence": 2,
    }
    # An acknowledged page does not cause a duplicate post on the next loop.
    assert asyncio.run(relay.flush()) is True
    assert len(received) == 2


def test_restart_recovery_discovers_only_a_valid_bounded_p10_journal(tmp_path: Path) -> None:
    journal = _journal(tmp_path)
    journal.emit("run_started")
    intent = journal.root.parents[1] / "run-intent.json"
    intent.write_text(json.dumps({
        "payload": {
            "job_id": "job_p11",
            "workspace_id": "workspace_p11",
            "lease_epoch": 7,
        },
    }), encoding="utf-8")
    recovery = ResearchProgressRecovery(tmp_path / "durable")
    descriptors = recovery._discover()
    assert [(item.run_id, item.attempt_id, item.lease_epoch, item.planned_trials) for item in descriptors] == [
        ("run_p11", "ra_p11", 7, 2),
    ]
