#!/usr/bin/env python3
"""Build the BAR-02 parity-freeze snapshot inventory.

Produces, under ``upgrade/backend/bar02/snapshots/``:

- ``portal-api.openapi.json`` — full Portal API OpenAPI 3.1 document.
- ``planning-api.openapi.json`` — private Planning API OpenAPI 3.1 document.
- ``run-request.schema.json`` — the frozen run request JSON Schema extracted
  from the Portal OpenAPI ``PortalRunRequest`` component.
- ``manifest.json`` — sha256 digests of every snapshot plus exporter metadata.

The committed snapshots are the U04/U05 parity freeze; CI compares them with a
fresh regeneration. Run from the repository root:

    PYTHONPATH=apps/portal/backend/src:apps/portal \
      python apps/portal/scripts/export_compat_snapshots.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
PORTAL_ROOT = REPO_ROOT / "apps" / "portal"
PLANNING_ROOT = REPO_ROOT / "features" / "roadmap-task-board"
SNAPSHOT_ROOT = REPO_ROOT / "upgrade" / "backend" / "bar02" / "snapshots"

sys.path.insert(0, str(PORTAL_ROOT / "backend" / "src"))
sys.path.insert(0, str(PORTAL_ROOT))
sys.path.insert(0, str(PLANNING_ROOT))

RUN_REQUEST_COMPONENT = "PortalRunRequest"

SNAPSHOT_NAMES = (
    "portal-api.openapi.json",
    "planning-api.openapi.json",
    "run-request.schema.json",
)


def _dump(document: Any) -> str:
    return json.dumps(document, ensure_ascii=False, sort_keys=True, indent=2) + "\n"


def _digest(payload: str) -> str:
    return f"sha256:{hashlib.sha256(payload.encode('utf-8')).hexdigest()}"


_REF_PREFIX = "#/components/schemas/"


def _bundle_schema(schemas: dict[str, Any], name: str) -> Any:
    """Inline every ``#/components/schemas/*`` reference recursively.

    The extracted run-request snapshot must be a standalone JSON Schema so
    consumers never depend on the surrounding OpenAPI document.
    """
    memo: dict[str, Any] = {}

    def resolve(current: Any) -> Any:
        if isinstance(current, dict):
            ref = current.get("$ref")
            if isinstance(ref, str):
                if not ref.startswith(_REF_PREFIX):
                    raise SystemExit(f"unsupported $ref in {name}: {ref}")
                target = ref[len(_REF_PREFIX):]
                if target not in schemas:
                    raise SystemExit(f"dangling $ref in {name}: {ref}")
                if target not in memo:
                    memo[target] = {}
                    memo[target] = resolve(schemas[target])
                resolved = memo[target]
                siblings = {
                    key: resolve(value)
                    for key, value in current.items()
                    if key != "$ref"
                }
                return {**resolved, **siblings} if siblings else resolved
            return {key: resolve(value) for key, value in current.items()}
        if isinstance(current, list):
            return [resolve(item) for item in current]
        return current

    return resolve(schemas[name])


def build_snapshots() -> dict[str, Any]:
    from portal_api.main import create_app as create_portal_app

    portal_app = create_portal_app()
    try:
        portal_openapi = portal_app.openapi()
    finally:
        portal_app.state.run_manager.shutdown()

    from backend.app.main import create_app as create_planning_app

    planning_app = create_planning_app()
    planning_openapi = planning_app.openapi()

    schemas = portal_openapi.get("components", {}).get("schemas", {})
    if RUN_REQUEST_COMPONENT not in schemas:
        raise SystemExit(
            f"{RUN_REQUEST_COMPONENT} is missing from the Portal OpenAPI components"
        )
    return {
        "portal-api.openapi.json": portal_openapi,
        "planning-api.openapi.json": planning_openapi,
        "run-request.schema.json": _bundle_schema(schemas, RUN_REQUEST_COMPONENT),
    }


def build_manifest(snapshots: dict[str, Any]) -> dict[str, Any]:
    entries = {}
    for name in SNAPSHOT_NAMES:
        encoded = _dump(snapshots[name])
        entries[name] = {
            "digest": _digest(encoded),
            "bytes": len(encoded.encode("utf-8")),
        }
    return {
        "schema_version": "bar02.snapshots.v1",
        "generated_at": datetime.now(UTC).isoformat(),
        "producer": "export_compat_snapshots.py",
        "run_request_component": RUN_REQUEST_COMPONENT,
        "snapshots": entries,
    }


def build_artifacts() -> dict[str, dict[str, Any]]:
    snapshots = build_snapshots()
    return {
        **snapshots,
        "manifest.json": build_manifest(snapshots),
    }


def write_artifacts(root: Path, artifacts: dict[str, dict[str, Any]]) -> None:
    root.mkdir(parents=True, exist_ok=True)
    for name, document in artifacts.items():
        (root / name).write_text(_dump(document), encoding="utf-8")
        print(f"wrote {root / name}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=SNAPSHOT_ROOT,
        help="snapshot directory (default: upgrade/backend/bar02/snapshots)",
    )
    args = parser.parse_args(argv)
    write_artifacts(args.output_root, build_artifacts())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
