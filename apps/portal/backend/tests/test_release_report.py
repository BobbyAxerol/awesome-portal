from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT = REPO_ROOT / "apps" / "portal" / "scripts" / "export_release_report.py"
REPORT = REPO_ROOT / "upgrade" / "backend" / "bar16" / "release-report.json"


def _module():
    spec = importlib.util.spec_from_file_location("export_release_report", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_release_report_is_typed_and_credential_free() -> None:
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    encoded = REPORT.read_text(encoding="utf-8").lower()

    assert report["schema_version"] == "bar16.release.v1"
    assert set(report) == {
        "schema_version",
        "generated_at",
        "git_commit",
        "protected_strategy_sha256",
        "m0_freeze_manifest_digest",
        "openapi_digest",
        "backup_commands",
        "restore_checklist",
        "hygiene",
    }
    # No credential VALUES or host paths; documented env-var placeholders
    # (e.g. $CONTROL_DATABASE_URL) are intentional runbook references.
    for marker in ("/home/", "/srv/", "-----BEGIN", "AKIA", "ghp_"):
        assert marker not in encoded, f"release report leaks {marker}"
    assert report["protected_strategy_sha256"].startswith("sha256:")
    assert report["m0_freeze_manifest_digest"].startswith("sha256:")


def test_release_report_documents_dr_runbook_and_backup_commands() -> None:
    report = json.loads(REPORT.read_text(encoding="utf-8"))

    assert "control_postgres" in report["backup_commands"]
    assert "planning_sqlite" in report["backup_commands"]
    assert "object_store" in report["backup_commands"]
    assert any("smoke" in item for item in report["restore_checklist"])
    assert any("reconciliation" in item for item in report["restore_checklist"])


def test_hygiene_scan_is_clean_and_detects_planted_secrets(tmp_path: Path) -> None:
    module = _module()

    findings = module.hygiene_scan()
    assert findings == []

    planted = tmp_path / "leak.py"
    planted.write_text("api_key = \"sk-live-1234567890abcdefghij\"\n", encoding="utf-8")
    prose = tmp_path / "safe.md"
    prose.write_text("paper order-risk-order-fill-position-PnL path\n", encoding="utf-8")
    original = module.REPO_ROOT
    module.REPO_ROOT = tmp_path
    try:
        findings = module.hygiene_scan()
    finally:
        module.REPO_ROOT = original
    assert any("leak.py" in finding["path"] for finding in findings)
    assert not any("safe.md" in finding["path"] for finding in findings)


def test_protected_strategy_hash_matches_freeze_manifest() -> None:
    import hashlib

    report = json.loads(REPORT.read_text(encoding="utf-8"))
    manifest = json.loads(
        (REPO_ROOT / "upgrade" / "backend" / "bar05" / "m0-freeze-manifest.json").read_text()
    )
    strategy = REPO_ROOT / "apps" / "portal" / "strategy" / "main.py"
    digest = f"sha256:{hashlib.sha256(strategy.read_bytes()).hexdigest()}"
    assert report["protected_strategy_sha256"] == digest
    assert manifest["file_digests"]["protected_kernel_main"] == digest
