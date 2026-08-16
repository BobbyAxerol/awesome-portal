#!/usr/bin/env python3
"""Build the BAR-05 M0 freeze manifest.

Produces ``upgrade/backend/bar05/m0-freeze-manifest.json``: sha256 digests
over every frozen source, pin, OpenAPI, golden fixture and configuration
file, plus the documented golden tolerances and rollback note. Regeneration
must be byte-identical to the committed manifest; drift fails CI.

    python apps/portal/scripts/export_m0_freeze.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_ROOT = REPO_ROOT / "upgrade" / "backend" / "bar05"

FROZEN_FILES = {
    "protected_kernel_main": "apps/portal/strategy/main.py",
    "protected_kernel_hash": "apps/portal/strategy/PROTECTED_SHA256",
    "registry_source": "apps/portal/registry/registry.json",
    "links_sidecar": "apps/portal/registry/links.v1.json",
    "constraints_portal": "constraints/portal.txt",
    "portal_backend_pyproject": "apps/portal/backend/pyproject.toml",
    "openapi_portal": "apps/portal/registry/openapi/portal-api.openapi.json",
    "openapi_portal_snapshot": "upgrade/backend/bar02/snapshots/portal-api.openapi.json",
    "openapi_planning_snapshot": "upgrade/backend/bar02/snapshots/planning-api.openapi.json",
    "run_request_schema": "upgrade/backend/bar02/snapshots/run-request.schema.json",
    "golden_market": "apps/portal/backend/tests/fixtures/golden_market.parquet",
    "golden_signals": "apps/portal/backend/tests/fixtures/golden_signals.parquet",
    "golden_metadata": "apps/portal/backend/tests/fixtures/golden_metadata.json",
    "compose": "compose.yaml",
    "compose_production": "deploy/compose.production.yaml",
    "nginx_portal_conf": "deploy/nginx/portal.conf",
    "env_template": ".env.example",
    "control_api_package": "apps/control-api/package.json",
    "control_api_package_lock": "apps/control-api/package-lock.json",
    "control_api_tsconfig": "apps/control-api/tsconfig.json",
    "control_api_migrations": "apps/control-api/migrations/1723680000000_init-identity.sql",
    "portal_frontend_package": "apps/portal/frontend/package.json",
    "portal_frontend_lock": "apps/portal/frontend/package-lock.json",
    "planning_frontend_package": "features/roadmap-task-board/frontend/package.json",
    "planning_frontend_lock": "features/roadmap-task-board/frontend/package-lock.json",
    "planning_requirements": "features/roadmap-task-board/backend/requirements.txt",
    "planning_requirements_dev": "features/roadmap-task-board/backend/requirements-dev.txt",
}

PYTHON_PINS = {
    "quantbt_engine": "quantbt-engine==1.0.8",
    "historical_market_data_reader": "primus-historical-market-data==0.1.0rc3",
}

ARTIFACT_SCHEMA_VERSIONS = {
    "engine_manifest": "1",
    "portal_artifacts": "1",
    "portal_producer": "portal-api",
}

GOLDEN_TOLERANCES = {
    "pos_weight": "exact",
    "exit_type": "exact",
    "exit_price": {"rtol": 1e-9, "atol": 1e-12},
}


def _digest(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


def _git_commit() -> str:
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def _registry_digest() -> str:
    registry = json.loads((REPO_ROOT / "apps/portal/registry/registry.json").read_text())
    # The public digest is computed by the loader; the source registry never
    # carries it. Freeze the source digest instead (stable, secret-free).
    encoded = json.dumps(registry, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return _digest_of(encoded.encode("utf-8"))


def _digest_of(payload: bytes) -> str:
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


def build_manifest() -> dict[str, Any]:
    return {
        "schema_version": "bar05.freeze.v1",
        "frozen_at_commit": _git_commit(),
        "registry_source_digest": _registry_digest(),
        "python_pins": PYTHON_PINS,
        "artifact_schema_versions": ARTIFACT_SCHEMA_VERSIONS,
        "golden_tolerances": GOLDEN_TOLERANCES,
        "file_digests": {
            name: _digest(REPO_ROOT / relative)
            for name, relative in sorted(FROZEN_FILES.items())
        },
        "rollback": {
            "last_known_good_images": [
                "local/portal-portal-api:dev",
                "local/portal-portal-web:dev",
                "local/portal-roadmap-task-board-api:dev",
                "local/portal-control-api:dev",
            ],
            "procedure": (
                "docker compose down; restore the previous image tags (or redeploy "
                "the freeze commit); ./scripts/portal smoke"
            ),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=OUTPUT_ROOT,
        help="freeze directory (default: upgrade/backend/bar05)",
    )
    args = parser.parse_args(argv)
    args.output_root.mkdir(parents=True, exist_ok=True)
    target = args.output_root / "m0-freeze-manifest.json"
    target.write_text(
        json.dumps(build_manifest(), ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
