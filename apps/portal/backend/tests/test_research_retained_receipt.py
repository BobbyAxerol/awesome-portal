from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from portal_api.services.research_artifacts import ResearchArtifactStore
from portal_api.services.research_retained_receipt import (
    ResearchRetainedReceiptClient,
    ResearchRetainedReceiptError,
)


def _request():
    return SimpleNamespace(
        workspace_id="ws_p05",
        run_id="rrun_p05",
        job_id="rjob_p05",
        worker_attempt_id="rwa_p05",
        lease_epoch=1,
        research=SimpleNamespace(
            alpha_version_id="av_delta_1_0_0",
            adapter_contract_digest="a" * 64,
            requested_spec_digest="b" * 64,
            effective_spec_digest="c" * 64,
            dataset_binding_digest="d" * 64,
        ),
    )


def test_p05_receipt_reserve_write_verify_seal_and_replay(tmp_path: Path, monkeypatch):
    client = ResearchRetainedReceiptClient(
        endpoint="http://control-api:4000", secret="p05-test-principal-secret"
    )
    calls = []

    def private_post(operation, body):
        calls.append((operation, body))
        if operation == "reserve":
            return {
                "schema_version": "research.artifact-reservation.v1",
                "artifact_id": body["artifact_id"],
                "artifact_revision": 1,
                "state": "WRITING",
                "replayed": len(calls) > 1,
            }
        return {"schema_version": "research.artifact-seal.v1", "sealed": True, "replayed": len(calls) > 2}

    monkeypatch.setattr(client, "_post", private_post)
    request = _request()
    receipt = {"schema_version": "research.p10.delta-qualification-receipt.v1", "engine": {"bars": 500}}
    digest = client.retain(
        request=request,
        receipt=receipt,
        artifact_root=tmp_path,
        fence_validator=lambda fence: fence.lease_epoch == 1,
    )
    assert len(digest) == 64
    assert [op for op, _ in calls] == ["reserve", "seal"]
    assert calls[1][1]["total_rows"] == 1
    assert calls[1][1]["parts"][0]["table_kind"] == "run_receipt"
    assert calls[1][1]["parts"][0]["row_count"] == 1
    store = ResearchArtifactStore(tmp_path / "research-retained")
    manifest, verified_digest = store._load_and_verify_manifest(
        calls[0][1]["artifact_id"], verify_parts=True
    )
    assert verified_digest == digest
    assert manifest["tables"][0]["table_kind"] == "run_receipt"
    assert json.loads(
        (store.artifacts_dir / calls[0][1]["artifact_id"] / "documents" / "run_receipt.json").read_text()
    ) == receipt
    assert client.retain(
        request=request,
        receipt=receipt,
        artifact_root=tmp_path,
        fence_validator=lambda fence: True,
    ) == digest
    assert [op for op, _ in calls] == ["reserve", "seal", "reserve", "seal"]


def test_p05_receipt_refuses_stale_fence_before_writing(tmp_path: Path, monkeypatch):
    client = ResearchRetainedReceiptClient(
        endpoint="http://control-api:4000", secret="p05-test-principal-secret"
    )
    monkeypatch.setattr(client, "_post", lambda op, body: {
        "schema_version": "research.artifact-reservation.v1",
        "artifact_id": body["artifact_id"],
        "artifact_revision": 1,
        "state": "WRITING",
    })
    with pytest.raises(Exception, match="FENCE_REJECTED"):
        client.retain(
            request=_request(),
            receipt={"engine": {"bars": 500}},
            artifact_root=tmp_path,
            fence_validator=lambda fence: False,
        )
    assert not list((tmp_path / "research-retained" / "artifacts").iterdir())


def test_p05_retention_requires_explicit_private_binding(monkeypatch):
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS", "false")
    assert ResearchRetainedReceiptClient.from_environment() is None
    monkeypatch.setenv("PORTAL_FEATURE_RESEARCH_RETAINED_ARTIFACTS", "true")
    monkeypatch.delenv("CONTROL_API_INTERNAL_URL", raising=False)
    with pytest.raises(ResearchRetainedReceiptError):
        ResearchRetainedReceiptClient.from_environment()


def test_p05_receipt_seal_body_satisfies_the_control_api_seal_contract(tmp_path: Path, monkeypatch):
    """Preview finding (2026-09-25): every retained P04 run failed with
    `P05 seal was refused (400 RESEARCH_INVALID_INPUT)`. The manifest binds a
    `run_receipt` JSON document whose bytes are in totals.bytes, and part
    sequence bounds must travel as strings — the local fake accepted both."""
    client = ResearchRetainedReceiptClient(endpoint="http://control-api:4000", secret="p05-test-principal-secret")
    calls = []

    def private_post(operation, body):
        calls.append((operation, body))
        if operation == "reserve":
            return {"schema_version": "research.artifact-reservation.v1", "artifact_id": body["artifact_id"],
                    "artifact_revision": 1, "state": "WRITING", "replayed": False}
        return {"schema_version": "research.artifact-seal.v1", "sealed": True, "replayed": False}

    monkeypatch.setattr(client, "_post", private_post)
    client.retain(
        request=_request(),
        receipt={"schema_version": "research.p10.delta-qualification-receipt.v1", "engine": {"bars": 500}},
        artifact_root=tmp_path,
        fence_validator=lambda fence: True,
    )
    seal = calls[1][1]
    documents = seal.get("documents")
    assert documents, "the run_receipt document must be named in the seal"
    assert [document["name"] for document in documents] == ["run_receipt"]
    assert all(document["relative_path"] == f"documents/{document['name']}.json" for document in documents)
    assert seal["total_bytes"] == sum(part["byte_count"] for part in seal["parts"]) + sum(d["byte_count"] for d in documents)
    assert seal["total_rows"] == sum(part["row_count"] for part in seal["parts"])
    for part in seal["parts"]:
        for bound in ("sequence_min", "sequence_max"):
            assert part[bound] is None or isinstance(part[bound], str)
