from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

import pytest

from portal_api.services.artifact_store import (
    ArtifactCommitError,
    ContentAddressedArtifactStore,
    sha256_file,
)
from portal_api.services.durable_runs import (
    AttemptRegistry,
    DurableRunError,
    RunIntent,
    STANDARD_FAILURE_CODES,
)
from portal_api.services.job_broker import InMemoryJobBroker
from portal_api.workers.durable_worker import DurableQuantWorker


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _intent(run_id: str) -> RunIntent:
    return RunIntent(
        run_id=run_id,
        run_spec_sha256="a" * 64,
        workspace_id="ws_test",
        created_at="2026-08-16T00:00:00Z",
        payload={"protocol": "three_window_decay"},
    )


# -------------------------------------------------------- attempt lifecycle


def test_attempt_claim_heartbeat_and_terminal_transitions(tmp_path: Path) -> None:
    registry = AttemptRegistry(tmp_path / "runs")
    registry.create_run_intent(_intent("run_1"))

    attempt = registry.create_attempt("run_1")
    assert attempt.status == "QUEUED"

    claimed = registry.claim(attempt, lease_seconds=5)
    assert claimed.status == "CLAIMED"
    assert claimed.lease_token is not None

    with pytest.raises(DurableRunError, match="already claimed"):
        registry.claim(claimed, lease_seconds=5)

    heartbeat = registry.heartbeat(claimed, lease_token=claimed.lease_token, lease_seconds=5)
    assert heartbeat.heartbeat_count == 1

    succeeded = registry.transition(heartbeat, to="SUCCEEDED", lease_token=heartbeat.lease_token)
    assert succeeded.status == "SUCCEEDED"
    assert succeeded.completed_at is not None

    with pytest.raises(DurableRunError, match="terminal"):
        registry.transition(succeeded, to="FAILED")


def test_attempt_history_is_append_only_and_retry_creates_new_attempt(tmp_path: Path) -> None:
    registry = AttemptRegistry(tmp_path / "runs")
    registry.create_run_intent(_intent("run_2"))

    first = registry.create_attempt("run_2")
    registry.claim(first, lease_seconds=5)
    registry.transition(first, to="FAILED", failure_code="ENGINE_ERROR")

    second = registry.create_attempt("run_2")
    assert second.run_attempt_id != first.run_attempt_id

    attempts = registry.attempts("run_2")
    assert [attempt.status for attempt in attempts] == ["FAILED", "QUEUED"]
    assert len(attempts[0].history) >= 3


def test_expired_lease_can_be_reclaimed_and_marks_lease_lost(tmp_path: Path) -> None:
    registry = AttemptRegistry(tmp_path / "runs")
    registry.create_run_intent(_intent("run_3"))

    attempt = registry.create_attempt("run_3")
    claimed = registry.claim(attempt, lease_seconds=0.05)
    time.sleep(0.1)

    assert not registry.verify_lease(claimed, lease_token=claimed.lease_token)
    reclaimed = registry.claim(claimed, lease_seconds=5)
    assert reclaimed.status == "CLAIMED"

    with pytest.raises(DurableRunError, match="non-standard"):
        registry.transition(reclaimed, to="FAILED", failure_code="NOT_A_CODE")


# ------------------------------------------------------ content addressing


def test_bundle_commit_reopen_and_tamper_detection(tmp_path: Path) -> None:
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    temp = store.temp_dir("run_4", "ra_1")
    (temp / "metrics.json").write_text('{"sharpe": 1.2}', encoding="utf-8")
    (temp / "series").mkdir()
    (temp / "series" / "is.parquet").write_bytes(b"parquet-bytes")

    bundle = store.commit_bundle(
        run_id="run_4",
        attempt_id="ra_1",
        temp_dir=temp,
        required_files=("metrics.json",),
        manifest_extra={"engine": {"version": "1.0.8"}},
    )
    assert bundle.bundle_sha256 == bundle.manifest_sha256
    manifest = store.open_bundle("run_4", "ra_1", bundle.bundle_sha256)
    assert manifest["artifact_schema_version"] == "2.0.0"
    assert manifest["files"]["metrics.json"] == sha256_file(temp / "metrics.json")

    blob = store.blobs_dir / manifest["files"]["metrics.json"]
    blob.write_text('{"sharpe": 9.9}', encoding="utf-8")
    with pytest.raises(ArtifactCommitError, match="corrupt"):
        store.open_bundle("run_4", "ra_1", bundle.bundle_sha256)


def test_bundle_requires_files_and_reconcile_reports_orphans(tmp_path: Path) -> None:
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    temp = store.temp_dir("run_5", "ra_2")
    with pytest.raises(ArtifactCommitError, match="required"):
        store.commit_bundle(
            run_id="run_5", attempt_id="ra_2", temp_dir=temp, required_files=("audit.json",)
        )

    (temp / "audit.json").write_text("{}", encoding="utf-8")
    store.commit_bundle(
        run_id="run_5", attempt_id="ra_2", temp_dir=temp, required_files=("audit.json",)
    )
    orphan = store.blobs_dir / ("f" * 64)
    orphan.write_bytes(b"orphan")
    report = store.reconcile()
    assert report == {"orphan_blobs": 1, "corrupt_bundles": 0}


def test_legacy_import_is_explicit_and_verifiable(tmp_path: Path) -> None:
    legacy = tmp_path / "legacy-run"
    legacy.mkdir()
    (legacy / "manifest.json").write_text('{"status": "COMPLETED"}', encoding="utf-8")
    (legacy / "config.json").write_text("{}", encoding="utf-8")

    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    bundle = store.import_legacy_artifacts(
        run_id="run_6",
        attempt_id="ra_3",
        legacy_run_dir=legacy,
        required_files=("legacy/manifest.json",),
    )
    manifest = store.open_bundle("run_6", "ra_3", bundle.bundle_sha256)
    assert manifest["imported_from"] == "legacy-prototype-v1"
    assert "legacy/manifest.json" in manifest["files"]
    assert "config.json" in manifest["files"]


# ------------------------------------------------------- worker + broker


async def _fake_executor(
    request_json: dict, run_id: str, artifact_root: Path
) -> dict:
    del request_json
    run_dir = artifact_root / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "status.json").write_text(
        json.dumps({"state": "COMPLETED"}), encoding="utf-8"
    )
    (run_dir / "manifest.json").write_text(
        json.dumps({"status": "COMPLETED", "artifact_schema_version": "1"}),
        encoding="utf-8",
    )
    return {"status": "COMPLETED"}


@pytest.mark.anyio
async def test_worker_executes_redelivers_as_noop_and_retries_new_attempt(
    tmp_path: Path,
) -> None:
    broker = InMemoryJobBroker()
    registry = AttemptRegistry(tmp_path / "runs")
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    registry.create_run_intent(_intent("run_7"))
    attempt = registry.create_attempt("run_7")

    worker = DurableQuantWorker(
        broker=broker,
        registry=registry,
        artifact_store=store,
        executor=_fake_executor,
    )
    await worker.start()

    job = {"run_id": "run_7", "run_attempt_id": attempt.run_attempt_id, "request_json": {}}
    await broker.publish("quant.run.requested", job)
    await broker.publish("quant.run.requested", job)  # redelivery -> no-op
    await broker.publish("quant.run.requested", job)  # again -> no-op

    attempts = registry.attempts("run_7")
    assert [item.status for item in attempts] == ["SUCCEEDED"]
    assert attempts[0].artifacts_sha256 is not None
    events = [payload for subject, payload in broker.published if subject == "quant.run.succeeded"]
    assert len(events) == 1

    manifest = store.open_bundle("run_7", attempts[0].run_attempt_id, attempts[0].artifacts_sha256)
    assert manifest["run_id"] == "run_7"

    # Retry request with a fresh attempt identity executes again with history.
    await broker.publish("quant.run.requested", {
        "run_id": "run_7",
        "run_attempt_id": "ra_retry",
        "request_json": {},
    })
    attempts = registry.attempts("run_7")
    assert [item.status for item in attempts] == ["SUCCEEDED", "SUCCEEDED"]

    await worker.stop()


@pytest.mark.anyio
async def test_worker_failure_maps_standard_codes_and_publishes_failed_event(
    tmp_path: Path,
) -> None:
    broker = InMemoryJobBroker()
    registry = AttemptRegistry(tmp_path / "runs")
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    registry.create_run_intent(_intent("run_8"))
    attempt = registry.create_attempt("run_8")

    async def failing_executor(request_json, run_id, artifact_root):
        raise ValueError("dataset eth-1d is missing")

    worker = DurableQuantWorker(
        broker=broker,
        registry=registry,
        artifact_store=store,
        executor=failing_executor,
    )
    await worker.start()
    await broker.publish("quant.run.requested", {
        "run_id": "run_8",
        "run_attempt_id": attempt.run_attempt_id,
        "request_json": {},
    })

    attempts = registry.attempts("run_8")
    assert attempts[0].status == "FAILED"
    assert attempts[0].failure_code == "DATASET_NOT_FOUND"
    assert attempts[0].failure_code in STANDARD_FAILURE_CODES
    failed_events = [
        payload for subject, payload in broker.published if subject == "quant.run.failed"
    ]
    assert len(failed_events) == 1
    assert failed_events[0]["failure_code"] == "DATASET_NOT_FOUND"

    await worker.stop()


@pytest.mark.anyio
async def test_worker_cancel_is_cooperative_and_terminal(tmp_path: Path) -> None:
    broker = InMemoryJobBroker()
    registry = AttemptRegistry(tmp_path / "runs")
    store = ContentAddressedArtifactStore(tmp_path / "artifacts")
    registry.create_run_intent(_intent("run_9"))
    attempt = registry.create_attempt("run_9")

    async def cancellable_executor(request_json, run_id, artifact_root):
        await asyncio.sleep(30)
        return {"status": "COMPLETED"}

    worker = DurableQuantWorker(
        broker=broker,
        registry=registry,
        artifact_store=store,
        executor=cancellable_executor,
    )
    await worker.start()
    task = asyncio.create_task(
        broker.publish("quant.run.requested", {
            "run_id": "run_9",
            "run_attempt_id": attempt.run_attempt_id,
            "request_json": {},
        })
    )
    await asyncio.sleep(0.2)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

    stored = registry.attempt("run_9", attempt.run_attempt_id)
    assert stored is not None
    assert stored.status in {"CANCELLED", "FAILED"}

    await worker.stop()
