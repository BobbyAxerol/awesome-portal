from __future__ import annotations

import ast
from pathlib import Path

import pytest

from portal_api.repositories.artifacts import (
    PORTAL_ARTIFACT_PRODUCER,
    PORTAL_ARTIFACT_SCHEMA_VERSION,
    ArtifactRepository,
    with_portal_provenance,
)
from portal_api.services.run_service import RunManager
from portal_api.workers import run_worker


PORTAL_ROOT = Path(__file__).resolve().parents[2]
BACKEND_SRC = PORTAL_ROOT / "backend" / "src" / "portal_api"

WRITE_SITE_FILES = (
    BACKEND_SRC / "api" / "routes_runs.py",
    BACKEND_SRC / "services" / "run_service.py",
    BACKEND_SRC / "services" / "three_window_runner.py",
    BACKEND_SRC / "services" / "advanced_walkforward_runner.py",
    BACKEND_SRC / "workers" / "run_worker.py",
)

# The engine-owned manifest.json keeps its existing contract: it must NOT gain
# the Portal provenance wrapper.
UNTOUCHED_ARTIFACTS = {"manifest.json"}


def _artifact_writes(source: str) -> list[tuple[str, ast.AST]]:
    tree = ast.parse(source)
    writes: list[tuple[str, ast.AST]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not (isinstance(func, ast.Attribute) and func.attr == "write_json"):
            continue
        if len(node.args) < 3:
            continue
        artifact_arg = node.args[1]
        if not isinstance(artifact_arg, ast.Constant) or not isinstance(
            artifact_arg.value, str
        ):
            continue
        writes.append((artifact_arg.value, node.args[2]))
    return writes


def _is_provenance_wrapped(payload: ast.AST) -> bool:
    return any(
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "with_portal_provenance"
        for node in ast.walk(payload)
    )


def test_provenance_helper_preserves_golden_payload_and_adds_fields() -> None:
    golden = {
        "run_id": "run_p4_cancel",
        "state": "QUEUED",
        "events": [],
        "nested": {"key": [1, 2, 3], "flag": True},
    }
    documented = with_portal_provenance("status.json", golden)

    assert {**golden, "artifact_schema_version": PORTAL_ARTIFACT_SCHEMA_VERSION} | {
        "producer": {
            "service": PORTAL_ARTIFACT_PRODUCER,
            "artifact": "status.json",
            "version": "0.1.0",
        }
    } == documented
    assert documented["nested"] == golden["nested"]
    assert PORTAL_ARTIFACT_SCHEMA_VERSION == "1"
    assert PORTAL_ARTIFACT_PRODUCER == "portal-api"


def test_every_portal_artifact_write_carries_provenance_except_manifest() -> None:
    total = 0
    for path in WRITE_SITE_FILES:
        source = path.read_text(encoding="utf-8")
        for artifact, payload in _artifact_writes(source):
            total += 1
            if artifact in UNTOUCHED_ARTIFACTS:
                assert not _is_provenance_wrapped(payload), (
                    f"{path.name}: {artifact} must keep the engine contract"
                )
            else:
                assert _is_provenance_wrapped(payload), (
                    f"{path.name}: {artifact} write must wrap provenance"
                )
    assert total >= 10


def test_run_submission_persists_provenance_on_status_and_request(
    tmp_path, run_request
) -> None:
    artifacts = ArtifactRepository(tmp_path / "runs")
    manager = RunManager(artifacts=artifacts)
    manager._launcher.submit = lambda *args, **kwargs: None  # type: ignore[method-assign]
    try:
        run_id = manager.submit(run_request)
    finally:
        manager.shutdown()

    status = artifacts.read_json(run_id, "status.json")
    request_document = artifacts.read_json(run_id, "config/request.json")

    for document, artifact in (
        (status, "status.json"),
        (request_document, "request.json"),
    ):
        assert document["artifact_schema_version"] == "1"
        assert document["producer"] == {
            "service": "portal-api",
            "artifact": artifact,
            "version": "0.1.0",
        }

    assert status["run_id"] == run_id
    assert status["state"] == "QUEUED"
    assert status["events"] == [{"state": "QUEUED", "at": status["events"][0]["at"]}]
    assert request_document["strategy_id"] == run_request.strategy_id
    assert request_document["protocol"] == "three_window_decay"


def test_worker_status_writes_carry_provenance(tmp_path) -> None:
    from portal_api.domain.enums import RunState

    artifacts = ArtifactRepository(tmp_path / "runs")
    stages = run_worker.THREE_WINDOW_STAGES
    run_worker._write_status(
        artifacts,
        "run_be2_status",
        state=RunState.VALIDATING_DATA,
        stages=stages,
        extra={"protocol": "three_window_decay", "symbol": "ETHUSDT"},
    )

    status = artifacts.read_json("run_be2_status", "status.json")
    assert status["state"] == "VALIDATING_DATA"
    assert status["stage_index"] == stages.index(RunState.VALIDATING_DATA)
    assert status["stage_count"] == len(stages)
    assert status["symbol"] == "ETHUSDT"
    assert status["artifact_schema_version"] == "1"
    assert status["producer"] == {
        "service": "portal-api",
        "artifact": "status.json",
        "version": "0.1.0",
    }

    run_worker._write_status(
        artifacts,
        "run_be2_status",
        state=RunState.COMPLETED,
        stages=stages,
    )
    updated = artifacts.read_json("run_be2_status", "status.json")
    assert updated["state"] == "COMPLETED"
    assert updated["artifact_schema_version"] == "1"
    assert len(updated["events"]) == 2
