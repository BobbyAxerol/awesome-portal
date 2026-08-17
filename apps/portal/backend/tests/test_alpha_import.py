"""Alpha import quarantine pipeline tests (U14 slice / BAR-21 foundation)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from portal_api.services.alpha_import import AlphaImportError, AlphaImportService
from portal_api.services.alpha_registry import ALPHAS_FILE

REPO_ROOT = Path(__file__).resolve().parents[4]
REGISTRY_ROOT = REPO_ROOT / "apps" / "portal" / "registry"


def _registry_root(tmp_path: Path) -> Path:
    """Minimal registry tree with the alpha schema, like the real layout."""
    import shutil

    root = tmp_path / "registry"
    root.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        REGISTRY_ROOT / "schemas",
        root / "schemas",
    )
    shutil.copy(
        REGISTRY_ROOT / ALPHAS_FILE,
        root / ALPHAS_FILE,
    )
    return root


def _service(tmp_path: Path):
    return AlphaImportService(_registry_root(tmp_path), tmp_path / "imports")


def _manifest(alpha_id: str = "synthetic-alpha", version: str = "0.1.0", digest: str | None = None) -> dict:
    payload = json.loads(
        (REGISTRY_ROOT / ALPHAS_FILE).read_text(encoding="utf-8")
    )
    template = payload["alphas"][0]
    return {
        "schema_version": template["schema_version"],
        "alpha_id": alpha_id,
        "version": version,
        "name": "Synthetic Alpha",
        "owner": {"team": "research", "maintainers": ["research-team"]},
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


def test_import_quarantines_digest_matching_alpha(tmp_path: Path) -> None:
    service = _service(tmp_path)
    manifest = _manifest()
    record = service.submit(manifest, b"wheel-bytes")

    assert record.state == "QUARANTINED"
    assert record.digest_ok is True
    assert record.alpha_id == "synthetic-alpha"
    assert record.reason is None

    stored = service.get("synthetic-alpha", "0.1.0")
    assert stored is not None and stored.state == "QUARANTINED"
    assert (tmp_path / "imports" / "synthetic-alpha" / "0.1.0" / "artifact.bin").read_bytes() == b"wheel-bytes"


def test_import_rejects_digest_mismatch_without_storing(tmp_path: Path) -> None:
    service = _service(tmp_path)
    manifest = _manifest(digest="sha256:" + "0" * 64)
    record = service.submit(manifest, b"different-bytes")

    assert record.state == "DIGEST_MISMATCH"
    assert record.digest_ok is False
    assert "mismatch" in (record.reason or "")
    stored = service.get("synthetic-alpha", "0.1.0")
    assert stored is not None and stored.state == "DIGEST_MISMATCH"


def test_import_rejects_invalid_manifest(tmp_path: Path) -> None:
    service = _service(tmp_path)
    bad = _manifest()
    bad["artifact"]["digest"] = "not-a-digest"
    record = service.submit(bad, b"x")
    assert record.state == "INVALID_MANIFEST"
    assert record.digest_ok is False


def test_import_rejects_already_registered_alpha(tmp_path: Path) -> None:
    service = _service(tmp_path)
    template = json.loads(
        (REGISTRY_ROOT / ALPHAS_FILE).read_text(encoding="utf-8")
    )["alphas"][0]
    manifest = _manifest(alpha_id=template["alpha_id"], version=template["version"])
    record = service.submit(manifest, b"whatever")
    assert record.state == "ALREADY_REGISTERED"


def test_import_rejects_duplicate_pending_import(tmp_path: Path) -> None:
    service = _service(tmp_path)
    manifest = _manifest()
    assert service.submit(manifest, b"wheel-bytes").state == "QUARANTINED"
    record = service.submit(_manifest(), b"wheel-bytes")
    assert record.state == "ALREADY_REGISTERED"
    assert "already exists" in (record.reason or "")


def test_import_requires_alpha_id_and_version(tmp_path: Path) -> None:
    service = _service(tmp_path)
    with pytest.raises(AlphaImportError):
        service.submit({"name": "no identity"}, b"x")


def test_list_sorts_by_received_at_descending(tmp_path: Path) -> None:
    service = _service(tmp_path)
    service.submit(_manifest(alpha_id="alpha-1"), b"wheel-bytes")
    service.submit(_manifest(alpha_id="alpha-2"), b"wheel-bytes")
    records = service.list()
    assert [item.alpha_id for item in records] == ["alpha-2", "alpha-1"]


@pytest.mark.anyio
async def test_import_endpoint_multipart_flow(tmp_path: Path, monkeypatch) -> None:
    """End-to-end: multipart POST lands in quarantine, GET /imports lists it."""
    import httpx

    from portal_api.main import create_app

    monkeypatch.setenv("PORTAL_ALPHA_IMPORT_ROOT", str(tmp_path / "imports"))
    app = create_app()
    try:
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
        ) as client:
            manifest = _manifest()
            files = {
                "manifest": ("manifest.json", json.dumps(manifest).encode("utf-8"), "application/json"),
                "artifact": ("artifact.bin", b"wheel-bytes", "application/octet-stream"),
            }
            response = await client.post("/api/v1/alphas/import", files=files)
            listing = await client.get("/api/v1/alphas/imports")
    finally:
        app.state.run_manager.shutdown()

    assert response.status_code == 200
    body = response.json()
    assert body["state"] == "QUARANTINED"
    assert body["digest_ok"] is True
    assert listing.status_code == 200
    assert [item["alpha_id"] for item in listing.json()] == ["synthetic-alpha"]


@pytest.fixture
def anyio_backend():
    return "asyncio"
