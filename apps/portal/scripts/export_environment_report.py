#!/usr/bin/env python3
"""Build the BAR-05 credential-free environment report.

Produces ``upgrade/backend/bar05/environment-report.json``: version
identifiers, mode names and digests only — never credentials, host paths or
secret values. The stable subset (everything except the git commit) must be
deterministic for a given environment.

    PYTHONPATH=apps/portal/backend/src:apps/portal \
      python apps/portal/scripts/export_environment_report.py
"""

from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import platform
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_ROOT = REPO_ROOT / "upgrade" / "backend" / "bar05"

PACKAGES = (
    "portal-api",
    "quantbt-engine",
    "duckdb",
    "pandas",
    "numpy",
    "pyarrow",
    "fastapi",
    "httpx",
    "jsonschema",
)

# `python_version` in BAR-05 is the declared CI/runtime interpreter contract,
# not whichever interpreter happened to render this source-controlled receipt.
# This keeps the report deterministic on a developer host while the workflow
# and pinned runtime images remain the authority for the deployed patch level.
PINNED_RUNTIME_PYTHON_VERSION = "3.12.14"


def _version(distribution: str) -> str | None:
    try:
        return importlib.metadata.version(distribution)
    except importlib.metadata.PackageNotFoundError:
        return None


def _git_commit() -> str:
    result = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def _control_api_version() -> str | None:
    package = json.loads(
        (REPO_ROOT / "apps/control-api/package.json").read_text(encoding="utf-8")
    )
    return str(package.get("version"))


def build_report() -> dict[str, Any]:
    target_python_version = os.getenv(
        "PORTAL_TARGET_PYTHON_VERSION", PINNED_RUNTIME_PYTHON_VERSION
    )
    return {
        "schema_version": "bar05.env-report.v1",
        "git_commit": _git_commit(),
        "python_version": target_python_version,
        "platform": sys.platform,
        "packages": {
            distribution: _version(distribution) for distribution in PACKAGES
        },
        "control_api_version": _control_api_version(),
        "modes": {
            "portal_environment": None,
            "historical_data_mode": None,
            "planning_summary_mode": None,
            "control_api_auth_mode": None,
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
    target = args.output_root / "environment-report.json"
    target.write_text(
        json.dumps(build_report(), ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
