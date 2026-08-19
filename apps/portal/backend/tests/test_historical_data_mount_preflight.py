from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[4]
SCRIPT = ROOT / "scripts" / "validate_historical_data_mount.py"
SPEC = importlib.util.spec_from_file_location("validate_historical_data_mount", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


def compose_config(storage_root: Path, *, mode: str = "required", gid: int | None = None, read_only: bool = True):
    return {
        "services": {
            "portal-api": {
                "environment": {
                    "PORTAL_HISTORICAL_DATA_MODE": mode,
                    "HISTORICAL_MARKET_DATA_ROOT": "/data",
                },
                "group_add": [str(os.getgid() if gid is None else gid)],
                "volumes": [
                    {
                        "type": "bind",
                        "source": str(storage_root),
                        "target": "/data",
                        "read_only": read_only,
                    }
                ],
            }
        }
    }


def readable_storage(tmp_path: Path) -> Path:
    root = tmp_path / "storage"
    metadata = root / "_primus_metadata"
    metadata.mkdir(parents=True)
    manifest = metadata / "release_manifest.json"
    manifest.write_text("{}", encoding="utf-8")
    root.chmod(0o750)
    metadata.chmod(0o750)
    manifest.chmod(0o640)
    return root


def test_required_mount_passes_for_matching_numeric_reader_gid(tmp_path: Path) -> None:
    result = module.validate_compose_config(compose_config(readable_storage(tmp_path)))

    assert result["status"] == "pass"
    assert result["mode"] == "required"
    assert result["read_only"] is True


def test_required_mount_rejects_wrong_reader_gid_with_actionable_message(tmp_path: Path) -> None:
    config = compose_config(readable_storage(tmp_path), gid=99999)

    with pytest.raises(module.HistoricalMountConfigError, match="PORTAL_HMD_READER_GID"):
        module.validate_compose_config(config)


def test_required_mount_rejects_writable_data_bind(tmp_path: Path) -> None:
    config = compose_config(readable_storage(tmp_path), read_only=False)

    with pytest.raises(module.HistoricalMountConfigError, match="read-only"):
        module.validate_compose_config(config)


def test_disabled_mode_skips_absent_local_placeholder(tmp_path: Path) -> None:
    result = module.validate_compose_config(
        compose_config(tmp_path / "absent", mode="disabled", gid=10001)
    )

    assert result == {
        "status": "skipped",
        "mode": "disabled",
        "reason": "historical data disabled",
    }
