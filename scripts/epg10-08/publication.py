"""Read-only verification of the exact EPG10-08 Core source handoff.

This tool never installs policy, changes Git/index, applies a patch or starts a
service. Apply only in a separately reviewed feature checkout after verification.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_path(root: Path, relative: str) -> Path:
    name = PurePosixPath(relative)
    if (name.is_absolute() or ".." in name.parts
            or str(name) != relative or not relative.startswith("apps/control-api/")
            or name.suffix != ".ts"):
        raise ValueError("SOURCE_PATH_REFUSED")
    path = root
    for part in name.parts:
        path = path / part
        if path.is_symlink():
            raise ValueError("SOURCE_SYMLINK_REFUSED")
    return path


def verify(packet: Path, target: Path) -> dict:
    packet, target = packet.resolve(strict=True), target.resolve(strict=True)
    manifest = json.loads((packet / "manifest.json").read_text())
    patch = packet / "qualified.patch"
    if manifest["schema_version"] != "portal.epg10-08.qualified-source-handoff.v1":
        raise ValueError("MANIFEST_SCHEMA_REFUSED")
    if sha(patch.read_bytes()) != manifest["patch_sha256"]:
        raise ValueError("PATCH_DIGEST_MISMATCH")
    files = manifest["files"]
    if len(files) != 26:
        raise ValueError("SOURCE_SET_MISMATCH")
    before = after = 0
    for relative, pins in files.items():
        path = safe_path(target, relative)
        actual = sha(path.read_bytes()) if path.is_file() else None
        if actual == pins["after_sha256"]:
            after += 1
        elif actual == pins["before_sha256"]:
            before += 1
        else:
            raise ValueError("SOURCE_PREIMAGE_CONFLICT: " + relative)
    if after == len(files):
        return {"status": "ALREADY_APPLIED_EXACT_SOURCE", "files": after,
                "writes": 0, "connected_acceptance": "NOT_MET"}
    if after:
        raise ValueError("PARTIALLY_APPLIED_SOURCE_REFUSED")
    # git apply --check neither writes files nor requires a Git index. Reject
    # a structurally invalid patch even when all preimage hashes match.
    result = subprocess.run(["git", "apply", "--unidiff-zero", "--check", str(patch)],
                            cwd=target, capture_output=True, timeout=15)
    if result.returncode:
        raise ValueError("PATCH_CHECK_FAILED")
    return {"status": "EXACT_PREIMAGE_PATCH_CHECK_PASS", "files": before,
            "writes": 0, "connected_acceptance": "NOT_MET"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--packet", type=Path, required=True)
    parser.add_argument("--target", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = verify(args.packet, args.target)
    except (ValueError, OSError, KeyError, subprocess.TimeoutExpired) as error:
        parser.exit(1, "Source handoff refused: " + str(error) + "\n")
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
