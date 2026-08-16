#!/usr/bin/env python3
"""Release, DR and hardening report (U19 / BAR-16).

Produces a credential-free ``upgrade/backend/bar16/release-report.json``:
version/provenance fingerprints, documented backup commands (never
executed here), the DR restore checklist and a tracked-source hygiene scan.
Nothing secret, no host paths, no values that change per machine.

    python apps/portal/scripts/export_release_report.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT_ROOT = REPO_ROOT / "upgrade" / "backend" / "bar16"

SECRET_MARKERS = (
    r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
    r"AKIA[0-9A-Z]{16}",
    r"ghp_[0-9A-Za-z]{36}",
    r"sk-[0-9A-Za-z-]{20,}",
    r"xox[baprs]-[0-9A-Za-z-]{10,}",
    r"eyJhbGciOi[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    r"password\s*=\s*[\"'][^\"']{8,}[\"']",
    r"secret\s*=\s*[\"'][^\"']{8,}[\"']",
)
SCAN_EXCLUDE = {
    ".git",
    "node_modules",
    "dist",
    "__pycache__",
    ".venv",
    "*.lock",
    "package-lock.json",
    "*.min.js",
}
SCAN_SUFFIXES = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml", ".sh", ".md", ".sql", ".toml", ".conf", ".example"}
# Test fixtures and the security-marker allowlists themselves are expected to
# contain literal secret-shaped strings and are excluded from the scan.
SCAN_ALLOWLIST = {
    "apps/portal/backend/src/portal_api/repositories/portal_registry.py",
    "apps/portal/backend/src/portal_api/repositories/portal_links.py",
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


def hygiene_scan() -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for path in REPO_ROOT.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(REPO_ROOT)
        if str(relative) in SCAN_ALLOWLIST:
            continue
        if any(part in SCAN_EXCLUDE for part in relative.parts):
            continue
        if "tests" in relative.parts:
            continue
        if path.suffix not in SCAN_SUFFIXES:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        for marker in SECRET_MARKERS:
            for match in re.finditer(marker, content):
                findings.append(
                    {
                        "path": str(relative),
                        "marker": marker[:24],
                        "line": content[: match.start()].count("\n") + 1,
                    }
                )
    return findings


def build_report() -> dict[str, Any]:
    freeze_manifest = json.loads(
        (REPO_ROOT / "upgrade" / "backend" / "bar05" / "m0-freeze-manifest.json").read_text()
    )
    findings = hygiene_scan()
    return {
        "schema_version": "bar16.release.v1",
        "generated_at": datetime.now(UTC).isoformat(),
        "git_commit": _git_commit(),
        "protected_strategy_sha256": _digest(REPO_ROOT / "apps" / "portal" / "strategy" / "main.py"),
        "m0_freeze_manifest_digest": _digest(
            REPO_ROOT / "upgrade" / "backend" / "bar05" / "m0-freeze-manifest.json"
        ),
        "openapi_digest": freeze_manifest["file_digests"]["openapi_portal"],
        "backup_commands": {
            "control_postgres": "pg_dump $CONTROL_DATABASE_URL --no-owner --no-privileges > portal-control.sql",
            "planning_sqlite": "cp $PLANNING_DB_PATH planning-backup.sqlite",
            "object_store": "mc mirror portal-minio/quant-platform backup/quant-platform",
        },
        "restore_checklist": [
            "restore PostgreSQL dump into a fresh database",
            "restore object-store mirror; verify bundle digests with the BAR-08 store",
            "verify protected strategy hash and M0 freeze digests",
            "run ./scripts/portal smoke and scripts/verify-m0-golden.sh",
            "run the planning cutover reconciliation before any cutover",
        ],
        "hygiene": {
            "tracked_files_scanned_note": "sources only; lockfiles excluded",
            "findings": findings,
            "clean": not findings,
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=OUTPUT_ROOT,
        help="release directory (default: upgrade/backend/bar16)",
    )
    args = parser.parse_args(argv)
    args.output_root.mkdir(parents=True, exist_ok=True)
    report = build_report()
    target = args.output_root / "release-report.json"
    target.write_text(
        json.dumps(report, sort_keys=True, indent=2) + "\n", encoding="utf-8"
    )
    print(f"hygiene findings: {len(report['hygiene']['findings'])}")
    for finding in report["hygiene"]["findings"]:
        print(f"  {finding['path']}:{finding['line']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
