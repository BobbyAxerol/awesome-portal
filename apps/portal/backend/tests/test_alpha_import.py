"""Alpha import quarantine pipeline tests (U14 slice / BAR-21 foundation).

R11: ingest is source-reference only — the browser never uploads code. The
server reads a reviewed artifact already staged in the ingest inbox
(``PORTAL_ALPHA_ARTIFACT_ROOT``) next to its ``manifest.json`` and verifies
the digest.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from portal_api.services.alpha_import import (
    AlphaImportError,
    AlphaImportRequest,
    AlphaImportService,
)
from portal_api.services.alpha_registry import ALPHAS_FILE

REPO_ROOT = Path(__file__).resolve().parents[4]
REGISTRY_ROOT = REPO_ROOT / "apps" / "portal" / "registry"


def _registry_root(tmp_path: Path) -> Path:
    import shutil

    root = tmp_path / "registry"
    root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(REGISTRY_ROOT / "schemas", root / "schemas")
    shutil.copy(REGISTRY_ROOT / ALPHAS_FILE, root / ALPHAS_FILE)
    return root


def _service(tmp_path: Path):
    return AlphaImportService(
        _registry_root(tmp_path),
        tmp_path / "imports",
        tmp_path / "inbox",
    )


def _manifest(alpha_id: str = "synthetic-alpha", version: str = "0.1.0", digest: str | None = None):
    template = json.loads((REGISTRY_ROOT / ALPHAS_FILE).read_text(encoding="utf-8"))["alphas"][0]
    return {
        "schema_version": template["schema_version"],
        "alpha_id": alpha_id,
        "version": version,
        "name": "Synthetic Alpha",
        "owner": template["owner"],
        "entrypoint": "synthetic_pkg:Adapter",
        "artifact": {
            "type": "python-wheel",
            "digest": digest or f"sha256:{hashlib.sha256(b'wheel-bytes').hexdigest()}",
        },
        "strategy": template["strategy"],
        "data_requirements": template["data_requirements"],
        "parameters": template["parameters"],
        "lifecycle": {"stage": "DRAFT", "quarantined": False},
    }


def _stage_inbox(tmp_path: Path, *, artifact: bytes = b"wheel-bytes", alpha_id="synthetic-alpha", version="0.1.0", digest=None) -> str:
    """Place artifact + manifest in the inbox; returns the artifact_relpath."""
    box = tmp_path / "inbox" / alpha_id / version
    box.mkdir(parents=True, exist_ok=True)
    box.joinpath("artifact.bin").write_bytes(artifact)
    box.joinpath("manifest.json").write_text(json.dumps(_manifest(alpha_id, version, digest)))
    return f"{alpha_id}/{version}/artifact.bin"


def _req(**overrides) -> AlphaImportRequest:
    relpath = overrides.pop("artifact_relpath", "synthetic-alpha/0.1.0/artifact.bin")
    expected = overrides.pop(
        "expected_digest", f"sha256:{hashlib.sha256(b'wheel-bytes').hexdigest()}"
    )
    return AlphaImportRequest(
        alpha_id=overrides.pop("alpha_id", "synthetic-alpha"),
        version=overrides.pop("version", "0.1.0"),
        artifact_relpath=relpath,
        expected_digest=expected,
        **overrides,
    )


def test_import_quarantines_digest_matching_alpha(tmp_path: Path) -> None:
    service = _service(tmp_path)
    _stage_inbox(tmp_path)
    record = service.submit(_req())

    assert record.state == "QUARANTINED"
    assert record.digest_ok is True
    assert record.reason is None

    stored = service.get("synthetic-alpha", "0.1.0")
    assert stored is not None and stored.state == "QUARANTINED"
    assert (
        tmp_path / "imports" / "synthetic-alpha" / "0.1.0" / "artifact.bin"
    ).read_bytes() == b"wheel-bytes"


def test_import_rejects_digest_mismatch_without_promoting(tmp_path: Path) -> None:
    service = _service(tmp_path)
    _stage_inbox(tmp_path, artifact=b"different-bytes")
    record = service.submit(_req())

    assert record.state == "DIGEST_MISMATCH"
    assert record.digest_ok is False
    assert "mismatch" in (record.reason or "")
    assert service.get("synthetic-alpha", "0.1.0") is None


def test_import_requires_manifest_digest_to_agree(tmp_path: Path) -> None:
    service = _service(tmp_path)
    _stage_inbox(tmp_path, digest="sha256:" + "0" * 64)
    record = service.submit(_req())
    assert record.state == "DIGEST_MISMATCH"
    assert record.digest_ok is False


def test_import_rejects_invalid_manifest(tmp_path: Path) -> None:
    service = _service(tmp_path)
    box = tmp_path / "inbox" / "synthetic-alpha" / "0.1.0"
    box.mkdir(parents=True, exist_ok=True)
    box.joinpath("artifact.bin").write_bytes(b"wheel-bytes")
    bad = _manifest()
    bad["artifact"]["digest"] = "not-a-digest"
    box.joinpath("manifest.json").write_text(json.dumps(bad))
    record = service.submit(_req())
    assert record.state == "INVALID_MANIFEST"


def test_import_rejects_missing_inbox_reference(tmp_path: Path) -> None:
    service = _service(tmp_path)
    record = service.submit(_req(artifact_relpath="nope/0.1.0/artifact.bin"))
    assert record.state == "INVALID_MANIFEST"
    assert "does not exist" in (record.reason or "")


def test_import_rejects_path_traversal(tmp_path: Path) -> None:
    service = _service(tmp_path)
    record = service.submit(_req(artifact_relpath="../../etc/passwd"))
    assert record.state == "INVALID_MANIFEST"
    assert "does not exist" in (record.reason or "")


def test_import_rejects_already_registered_alpha(tmp_path: Path) -> None:
    service = _service(tmp_path)
    template = json.loads((REGISTRY_ROOT / ALPHAS_FILE).read_text(encoding="utf-8"))["alphas"][0]
    _stage_inbox(
        tmp_path,
        alpha_id=template["alpha_id"],
        version=template["version"],
        artifact=b"whatever",
    )
    record = service.submit(
        _req(
            alpha_id=template["alpha_id"],
            version=template["version"],
            artifact_relpath=f"{template['alpha_id']}/{template['version']}/artifact.bin",
            expected_digest=f"sha256:{hashlib.sha256(b'whatever').hexdigest()}",
        )
    )
    assert record.state == "ALREADY_REGISTERED"


def test_import_rejects_duplicate_pending_import(tmp_path: Path) -> None:
    service = _service(tmp_path)
    _stage_inbox(tmp_path)
    assert service.submit(_req()).state == "QUARANTINED"
    record = service.submit(_req())
    assert record.state == "ALREADY_REGISTERED"
    assert "already exists" in (record.reason or "")


def test_list_sorts_by_received_at_descending(tmp_path: Path) -> None:
    service = _service(tmp_path)
    for alpha_id in ("alpha-1", "alpha-2"):
        _stage_inbox(tmp_path, alpha_id=alpha_id)
        service.submit(
            _req(
                alpha_id=alpha_id,
                artifact_relpath=f"{alpha_id}/0.1.0/artifact.bin",
                expected_digest=f"sha256:{hashlib.sha256(b'wheel-bytes').hexdigest()}",
            )
        )
    records = service.list()
    assert [item.alpha_id for item in records] == ["alpha-2", "alpha-1"]


@pytest.mark.anyio
async def test_import_endpoint_source_reference_flow(tmp_path: Path, monkeypatch) -> None:
    """End-to-end: JSON source-reference POST lands in quarantine."""
    import httpx

    from portal_api.main import create_app

    _stage_inbox(tmp_path)
    monkeypatch.setenv("PORTAL_ALPHA_IMPORT_ROOT", str(tmp_path / "imports"))
    monkeypatch.setenv("PORTAL_ALPHA_ARTIFACT_ROOT", str(tmp_path / "inbox"))
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            response = await client.post(
                "/api/v1/alphas/import",
                json={
                    "alpha_id": "synthetic-alpha",
                    "version": "0.1.0",
                    "artifact_relpath": "synthetic-alpha/0.1.0/artifact.bin",
                    "expected_digest": f"sha256:{hashlib.sha256(b'wheel-bytes').hexdigest()}",
                    "git_ref": "refs/heads/dev",
                },
            )
            listing = await client.get("/api/v1/alphas/imports")
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "QUARANTINED"
    assert body["digest_ok"] is True
    assert listing.status_code == 200
    assert [item["alpha_id"] for item in listing.json()] == ["synthetic-alpha"]


@pytest.mark.anyio
async def test_import_endpoint_rejects_browser_style_upload(tmp_path: Path, monkeypatch) -> None:
    """The old multipart shape must not be accepted anymore (R11)."""
    import httpx

    from portal_api.main import create_app

    monkeypatch.setenv("PORTAL_ALPHA_IMPORT_ROOT", str(tmp_path / "imports"))
    monkeypatch.setenv("PORTAL_ALPHA_ARTIFACT_ROOT", str(tmp_path / "inbox"))
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            files = {
                "manifest": ("m.json", json.dumps(_manifest()).encode(), "application/json"),
                "artifact": ("a.bin", b"wheel-bytes", "application/octet-stream"),
            }
            response = await client.post("/api/v1/alphas/import", files=files)
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 422  # multipart no longer a valid contract


@pytest.fixture
def anyio_backend():
    return "asyncio"
