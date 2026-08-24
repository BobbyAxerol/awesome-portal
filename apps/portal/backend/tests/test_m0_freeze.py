from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[4]
PORTAL_ROOT = REPO_ROOT / "apps" / "portal"
FREEZE_ROOT = REPO_ROOT / "upgrade" / "backend" / "bar05"
FREEZE_EXPORTER = PORTAL_ROOT / "scripts" / "export_m0_freeze.py"
REPORT_EXPORTER = PORTAL_ROOT / "scripts" / "export_environment_report.py"
MANIFEST_PATH = FREEZE_ROOT / "m0-freeze-manifest.json"
REPORT_PATH = FREEZE_ROOT / "environment-report.json"
CI_WORKFLOW_PATH = REPO_ROOT / ".github" / "workflows" / "ci.yml"
PYTHON_IMAGE_PATHS = (
    REPO_ROOT / "deploy" / "images" / "portal-api.Dockerfile",
    REPO_ROOT / "deploy" / "images" / "roadmap-task-board-api.Dockerfile",
)

FORBIDDEN_MARKERS = (
    "password",
    "secret",
    "token",
    "credential",
    "database_url",
    "/home/",
    "/srv/",
    "/root",
    "primus_historical_market_data-",
)


def _load_json(path: Path) -> dict[str, object]:
    return json.loads(path.read_text(encoding="utf-8"))


def _digest(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


def _regenerate_manifest() -> dict[str, object]:
    spec = importlib.util.spec_from_file_location("export_m0_freeze", FREEZE_EXPORTER)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.build_manifest()  # type: ignore[no-any-return]


# ------------------------------------------------------------- freeze manifest


def test_freeze_manifest_digests_verify_every_frozen_file() -> None:
    manifest = _load_json(MANIFEST_PATH)
    digests = manifest["file_digests"]
    assert isinstance(digests, dict)
    assert len(digests) >= 27
    mapping = {
        "golden_market": "apps/portal/backend/tests/fixtures/golden_market.parquet",
        "golden_signals": "apps/portal/backend/tests/fixtures/golden_signals.parquet",
        "golden_metadata": "apps/portal/backend/tests/fixtures/golden_metadata.json",
        "compose": "compose.yaml",
        "nginx_portal_conf": "deploy/nginx/portal.conf",
        "protected_kernel_main": "apps/portal/strategy/main.py",
        "registry_source": "apps/portal/registry/registry.json",
    }
    for name, relative in mapping.items():
        assert digests[name] == _digest(REPO_ROOT / relative)


def test_freeze_manifest_regenerates_identically() -> None:
    committed = _load_json(MANIFEST_PATH)
    regenerated = _regenerate_manifest()

    assert regenerated["file_digests"] == committed["file_digests"]
    assert regenerated["python_pins"] == committed["python_pins"]
    assert regenerated["artifact_schema_versions"] == committed["artifact_schema_versions"]
    assert regenerated["golden_tolerances"] == committed["golden_tolerances"]
    assert regenerated["schema_version"] == "bar05.freeze.v1"
    # frozen_at_commit records the commit that froze the files; it advances
    # only when the freeze is intentionally refreshed, so it is not part of
    # the stable regeneration comparison. It must remain a full sha1.
    assert len(committed["frozen_at_commit"]) == 40
    assert len(regenerated["frozen_at_commit"]) == 40


def test_freeze_manifest_locks_pins_and_tolerances() -> None:
    manifest = _load_json(MANIFEST_PATH)

    assert manifest["python_pins"]["quantbt_engine"] == "quantbt-engine==1.0.8"
    assert (
        manifest["python_pins"]["historical_market_data_reader"]
        == "primus-historical-market-data==0.1.0rc3"
    )
    assert manifest["artifact_schema_versions"]["engine_manifest"] == "1"
    assert manifest["artifact_schema_versions"]["portal_artifacts"] == "1"
    assert manifest["golden_tolerances"] == {
        "pos_weight": "exact",
        "exit_type": "exact",
        "exit_price": {"rtol": 1e-9, "atol": 1e-12},
    }


def test_freeze_manifest_carries_no_credentials_or_host_paths() -> None:
    encoded = MANIFEST_PATH.read_text(encoding="utf-8").lower()
    for marker in FORBIDDEN_MARKERS:
        assert marker not in encoded, f"freeze manifest leaks {marker}"


def test_freeze_manifest_matches_golden_fixture_tolerance_policy() -> None:
    golden_fixture = (
        PORTAL_ROOT / "backend" / "tests" / "golden_fixture.py"
    ).read_text(encoding="utf-8")
    assert "rtol=1e-9, atol=1e-12" in golden_fixture
    assert "pos_weight" in golden_fixture
    assert "exit_type" in golden_fixture


# --------------------------------------------------------- environment report


def test_environment_report_is_credential_free_and_typed() -> None:
    report = _load_json(REPORT_PATH)

    assert report["schema_version"] == "bar05.env-report.v1"
    assert set(report) == {
        "schema_version",
        "git_commit",
        "python_version",
        "platform",
        "packages",
        "control_api_version",
        "modes",
    }
    encoded = REPORT_PATH.read_text(encoding="utf-8").lower()
    for marker in FORBIDDEN_MARKERS:
        assert marker not in encoded, f"environment report leaks {marker}"
    assert report["platform"] in {"linux", "darwin", "win32"}
    assert report["packages"]["quantbt-engine"] == "1.0.8"
    assert report["packages"]["portal-api"] == "0.1.0"
    assert report["control_api_version"] == "0.1.0"


def test_environment_report_stable_subset_is_deterministic() -> None:
    spec = importlib.util.spec_from_file_location(
        "export_environment_report", REPORT_EXPORTER
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    regenerated = module.build_report()  # type: ignore[no-any-return]

    committed = _load_json(REPORT_PATH)
    assert regenerated["packages"] == committed["packages"]
    assert regenerated["python_version"] == committed["python_version"]
    assert regenerated["platform"] == committed["platform"]
    assert regenerated["control_api_version"] == committed["control_api_version"]


def test_environment_report_python_patch_matches_ci_and_runtime_images() -> None:
    report = _load_json(REPORT_PATH)
    python_version = report["python_version"]
    assert isinstance(python_version, str)

    ci_workflow = CI_WORKFLOW_PATH.read_text(encoding="utf-8")
    assert f'python-version: "{python_version}"' in ci_workflow
    for dockerfile_path in PYTHON_IMAGE_PATHS:
        dockerfile = dockerfile_path.read_text(encoding="utf-8")
        assert f"FROM python:{python_version}-slim@sha256:" in dockerfile


# -------------------------------------------------------------- golden gate


def test_m0_golden_gate_script_exists_and_runs_expected_suites() -> None:
    script = (REPO_ROOT / "scripts" / "verify-m0-golden.sh").read_text(
        encoding="utf-8"
    )
    assert "strategy/PROTECTED_SHA256" in script
    assert "test_golden_parity.py" in script
    assert "test_protected_sources.py" in script
    assert "test_three_window_runner.py" in script
    assert "golden fixture digests OK" in script


# ----------------------------------------------------------- planning export


def test_planning_export_contract_freezes_counts_and_hash_fields() -> None:
    repository = (
        REPO_ROOT
        / "features/roadmap-task-board/backend/app/infrastructure/repository.py"
    ).read_text(encoding="utf-8")
    assert '"counts": {"tasks": len(tasks), "roadmap": len(roadmap)}' in repository
    assert '"content_hash": f"sha256:{hashlib.sha256(encoded).hexdigest()}"' in repository
    assert "webhook configuration is never exported" in repository
