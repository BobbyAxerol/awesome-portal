"""W5a · A10a: the private P05 byte observation Control API verifies against.

The observation never judges and never repairs: it reports what the bytes on
disk hash to, and the Control API compares that with the digests it stored
when the artifact was sealed.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from portal_api.api import routes_research_internal
from portal_api.services.research_artifacts import (
    ResearchArtifactError,
    ResearchArtifactStore,
    build_control_api_seal_request,
    observe_sealed_artifact_bytes,
)

from test_research_artifacts import _seal  # type: ignore[import-not-found]


def _sealed(tmp_path: Path, artifact_id: str = "art_a10a"):
    store = ResearchArtifactStore(tmp_path / "research-retained")
    candidate = _seal(store, artifact_id)
    seal = build_control_api_seal_request(store, candidate)
    return store, candidate, seal


def test_a10a_observation_matches_the_sealed_digests_on_untouched_bytes(tmp_path: Path) -> None:
    store, candidate, seal = _sealed(tmp_path)
    observed = observe_sealed_artifact_bytes(
        store.root, artifact_id=candidate.artifact_id, part_paths=[part["relativePath"] for part in seal["parts"]],
    )
    assert observed["manifest_state"] == "PRESENT"
    assert observed["manifest_digest"] == seal["manifestDigest"]
    assert [part["observed_digest"] for part in observed["parts"]] == [part["partDigest"] for part in seal["parts"]]
    assert observed["documents"] and all(doc["observed_digest"] == doc["recorded_digest"] for doc in observed["documents"])


def test_a10a_a_flipped_byte_is_observed_as_a_different_digest_and_nothing_is_repaired(tmp_path: Path) -> None:
    store, candidate, seal = _sealed(tmp_path)
    part_path = store.artifacts_dir / candidate.artifact_id / seal["parts"][0]["relativePath"]
    original = part_path.read_bytes()
    with part_path.open("r+b") as handle:
        handle.seek(len(original) // 2)
        byte = handle.read(1)
        handle.seek(len(original) // 2)
        handle.write(bytes([byte[0] ^ 0xFF]))
    observed = observe_sealed_artifact_bytes(
        store.root, artifact_id=candidate.artifact_id, part_paths=[part["relativePath"] for part in seal["parts"]],
    )
    assert observed["parts"][0]["observed_digest"] != seal["parts"][0]["partDigest"]
    # The manifest itself is untouched, so its digest still matches: the
    # observation isolates the corrupt part rather than failing wholesale.
    assert observed["manifest_digest"] == seal["manifestDigest"]
    # Observation is read-only: the corrupt bytes are still there.
    assert part_path.read_bytes() != original


def test_a10a_missing_manifest_and_part_are_reported_not_raised(tmp_path: Path) -> None:
    store, candidate, seal = _sealed(tmp_path)
    artifact_dir = store.artifacts_dir / candidate.artifact_id
    (artifact_dir / seal["parts"][0]["relativePath"]).unlink()
    (artifact_dir / "manifest.json").unlink()
    observed = observe_sealed_artifact_bytes(
        store.root, artifact_id=candidate.artifact_id, part_paths=[part["relativePath"] for part in seal["parts"]],
    )
    assert observed["manifest_state"] == "MISSING"
    assert observed["manifest_digest"] is None
    assert observed["parts"][0]["observed_digest"] is None


def test_a10a_rejects_traversal_and_unbounded_requests(tmp_path: Path) -> None:
    store, candidate, _ = _sealed(tmp_path)
    with pytest.raises(ResearchArtifactError):
        observe_sealed_artifact_bytes(store.root, artifact_id="../escape", part_paths=["a.parquet"])
    with pytest.raises(ResearchArtifactError):
        observe_sealed_artifact_bytes(store.root, artifact_id=candidate.artifact_id, part_paths=["../../etc/passwd"])
    with pytest.raises(ResearchArtifactError):
        observe_sealed_artifact_bytes(store.root, artifact_id=candidate.artifact_id, part_paths=["p.parquet"] * 257)


def test_a10a_private_route_requires_the_verify_principal(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    store, candidate, seal = _sealed(tmp_path)
    monkeypatch.setenv("PORTAL_RESEARCH_RETAINED_ROOT", str(store.root))
    app = FastAPI()
    app.include_router(routes_research_internal.router)
    client = TestClient(app)
    body = {"artifact_id": candidate.artifact_id, "part_paths": [part["relativePath"] for part in seal["parts"]]}
    assert client.post("/internal/research/artifacts/observe", json=body).status_code == 401

    class Principal:
        role = "ADMIN"
        authn_methods = ("portal_session",)

    monkeypatch.setattr(routes_research_internal, "require_internal_principal", lambda _headers: Principal())
    assert client.post("/internal/research/artifacts/observe", json=body).status_code == 403
    Principal.authn_methods = ("portal_session", "research_artifact_verify")
    response = client.post("/internal/research/artifacts/observe", json=body)
    assert response.status_code == 200
    assert response.json()["manifest_digest"] == seal["manifestDigest"]
    assert client.post(
        "/internal/research/artifacts/observe", json={**body, "artifact_id": "../x"},
    ).status_code == 422
    assert os.environ["PORTAL_RESEARCH_RETAINED_ROOT"] == str(store.root)
