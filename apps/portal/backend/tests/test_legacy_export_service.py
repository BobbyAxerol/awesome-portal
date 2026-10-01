"""Regression for atomic preparation of the legacy audit archive."""

from __future__ import annotations

from pathlib import Path

import pytest

from portal_api.repositories import ArtifactRepository
from portal_api.services import export_service


def test_failed_rebuild_keeps_last_complete_bundle(tmp_path: Path, monkeypatch) -> None:
    artifacts = ArtifactRepository(tmp_path / "runs")
    run_id = "run_export_atomic"
    artifacts.write_json(run_id, "manifest.json", {"status": "COMPLETED"})
    original = export_service.export_bundle(artifacts, run_id)
    original_bytes = original.read_bytes()
    series = artifacts.run_directory(run_id) / "series" / "oos.parquet"
    series.parent.mkdir(parents=True, exist_ok=True)
    series.write_bytes(b"test source")

    def fail_read(_: Path):
        raise RuntimeError("source read failed")

    monkeypatch.setattr(export_service.pd, "read_parquet", fail_read)
    with pytest.raises(RuntimeError, match="source read failed"):
        export_service.export_bundle(artifacts, run_id)
    assert original.read_bytes() == original_bytes
    assert not list(artifacts.run_directory(run_id).glob(".export-build-*"))
