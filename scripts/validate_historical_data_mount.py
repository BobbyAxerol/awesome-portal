#!/usr/bin/env python3
"""Fail-fast host preflight for the Portal Historical Market Data mount.

Docker bind mounts preserve host numeric ownership and POSIX ACLs.  A path can
therefore exist in the container while the non-root Portal user still cannot
read the accepted release manifest.  This checker consumes rendered Compose
JSON, verifies the read-only /data bind and evaluates host mode/ACL access for
the exact supplementary groups configured on ``portal-api``.

It never reads manifest contents or prints environment values/secrets.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import stat
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


PORTAL_RUNTIME_UID = 10001
PORTAL_RUNTIME_GID = 10001
HISTORICAL_TARGET = "/data"
MANIFEST_RELATIVE_PATH = Path("_primus_metadata/release_manifest.json")
_ACL_RE = re.compile(r"^(user|group|mask|other):([^:]*):([rwx-]{3})(?:\s+#effective:([rwx-]{3}))?$")


class HistoricalMountConfigError(RuntimeError):
    """Rendered Compose/HMD permissions cannot satisfy the reader contract."""


@dataclass(frozen=True)
class AclEntry:
    kind: str
    qualifier: int | None
    permissions: str


def _numeric_groups(values: object) -> set[int]:
    groups = {PORTAL_RUNTIME_GID}
    for value in values if isinstance(values, list) else []:
        text = str(value).strip()
        if not text.isdigit():
            raise HistoricalMountConfigError(
                f"portal-api group_add must contain numeric GIDs; got {text!r}"
            )
        groups.add(int(text))
    return groups


def _parse_acl(path: Path) -> list[AclEntry] | None:
    executable = shutil.which("getfacl")
    if executable is None:
        return None
    result = subprocess.run(
        [executable, "-ncp", str(path)],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    entries: list[AclEntry] = []
    for raw in result.stdout.splitlines():
        match = _ACL_RE.match(raw.strip())
        if not match:
            continue
        kind, qualifier_text, declared, effective = match.groups()
        qualifier = int(qualifier_text) if qualifier_text.isdigit() else None
        entries.append(AclEntry(kind, qualifier, effective or declared))
    return entries


def _mode_permissions(path: Path, *, uid: int, gids: set[int]) -> str:
    info = path.stat()
    mode = info.st_mode
    if uid == info.st_uid:
        bits = (mode >> 6) & 0b111
    elif info.st_gid in gids:
        bits = (mode >> 3) & 0b111
    else:
        bits = mode & 0b111
    return "".join(
        character if bits & bit else "-"
        for character, bit in (("r", 0b100), ("w", 0b010), ("x", 0b001))
    )


def _acl_permissions(path: Path, *, uid: int, gids: set[int]) -> str:
    entries = _parse_acl(path)
    if entries is None:
        return _mode_permissions(path, uid=uid, gids=gids)
    info = path.stat()

    owner = next((entry.permissions for entry in entries if entry.kind == "user" and entry.qualifier is None), "---")
    if uid == info.st_uid:
        return owner

    named_user = next((entry.permissions for entry in entries if entry.kind == "user" and entry.qualifier == uid), None)
    if named_user is not None:
        return named_user

    candidates: list[str] = []
    if info.st_gid in gids:
        candidates.extend(entry.permissions for entry in entries if entry.kind == "group" and entry.qualifier is None)
    candidates.extend(
        entry.permissions
        for entry in entries
        if entry.kind == "group" and entry.qualifier in gids
    )
    if candidates:
        return "".join(
            character if any(character in permissions for permissions in candidates) else "-"
            for character in "rwx"
        )

    return next((entry.permissions for entry in entries if entry.kind == "other"), "---")


def _require_access(path: Path, *, uid: int, gids: set[int], permission: str) -> None:
    permissions = _acl_permissions(path, uid=uid, gids=gids)
    if permission not in permissions:
        configured = ",".join(str(value) for value in sorted(gids))
        raise HistoricalMountConfigError(
            f"portal-api UID {uid} with PORTAL_HMD_READER_GID={configured} "
            f"cannot {('read' if permission == 'r' else 'traverse')} {path}; "
            "set PORTAL_HMD_READER_GID to the numeric host reader-group GID "
            "(for example: getent group primus-market-data-readers | cut -d: -f3), "
            "then recreate portal-api; do not make market data world-readable"
        )


def validate_compose_config(config: dict[str, Any]) -> dict[str, object]:
    try:
        service = config["services"]["portal-api"]
    except (KeyError, TypeError) as exc:
        raise HistoricalMountConfigError("rendered Compose config has no portal-api service") from exc
    environment = service.get("environment") or {}
    mode = str(environment.get("PORTAL_HISTORICAL_DATA_MODE", "disabled")).strip().lower()
    if mode == "disabled":
        return {"status": "skipped", "mode": mode, "reason": "historical data disabled"}
    if mode not in {"optional", "required"}:
        raise HistoricalMountConfigError(f"unsupported PORTAL_HISTORICAL_DATA_MODE={mode!r}")

    mounts = [
        item
        for item in service.get("volumes") or []
        if isinstance(item, dict) and str(item.get("target")) == HISTORICAL_TARGET
    ]
    if len(mounts) != 1:
        raise HistoricalMountConfigError("portal-api must have exactly one bind mount at /data")
    mount = mounts[0]
    if mount.get("type") != "bind":
        raise HistoricalMountConfigError("portal-api /data must be a host bind mount")
    if not bool(mount.get("read_only")):
        raise HistoricalMountConfigError("portal-api /data mount must be read-only")

    source = Path(str(mount.get("source", ""))).resolve()
    manifest = source / MANIFEST_RELATIVE_PATH
    if not source.is_dir():
        raise HistoricalMountConfigError(f"historical storage root does not exist: {source}")
    if not manifest.is_file():
        raise HistoricalMountConfigError(f"historical release manifest does not exist: {manifest}")

    gids = _numeric_groups(service.get("group_add"))
    metadata_dir = manifest.parent
    for directory in (source, metadata_dir):
        _require_access(directory, uid=PORTAL_RUNTIME_UID, gids=gids, permission="x")
    _require_access(manifest, uid=PORTAL_RUNTIME_UID, gids=gids, permission="r")
    return {
        "status": "pass",
        "mode": mode,
        "mount": HISTORICAL_TARGET,
        "read_only": True,
        "portal_uid": PORTAL_RUNTIME_UID,
        "supplementary_gids": sorted(gids - {PORTAL_RUNTIME_GID}),
        "manifest": str(MANIFEST_RELATIVE_PATH),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Portal historical-data bind permissions")
    parser.add_argument("config", nargs="?", default="-", help="rendered Compose JSON path or '-' for stdin")
    args = parser.parse_args()
    raw = sys.stdin.read() if args.config == "-" else Path(args.config).read_text(encoding="utf-8")
    try:
        result = validate_compose_config(json.loads(raw))
    except (json.JSONDecodeError, OSError, HistoricalMountConfigError) as exc:
        print(f"Historical data mount preflight failed: {exc}", file=sys.stderr)
        raise SystemExit(78) from exc
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
