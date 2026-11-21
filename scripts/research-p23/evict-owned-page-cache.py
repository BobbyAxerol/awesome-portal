#!/usr/bin/env python3
"""Measure/evict only the stopped P23 cell's PostgreSQL/artifact page cache.

Never calls drop_caches, scans a shared data mount, or changes file bytes.
Run with sudo after stopping the exact P23 containers.
"""

import json
import os
import stat
import subprocess
import sys
from pathlib import Path


PROJECT = "portal-research-p23-ol12"
ROOTS = (
    ("postgres", "portal-postgres-data"),
    ("artifacts", "portal-artifacts"),
)
STOPPED_SERVICES = (
    "portal-web", "control-api", "quant-worker-py", "portal-api", "portal-postgres"
)
MAX_FILES = 10000
MAX_BYTES = 512 * 1024 * 1024


def docker(*arguments: str) -> str:
    return subprocess.check_output(("docker", *arguments), text=True, timeout=15).strip()


def exact_files() -> tuple[list[Path], dict[str, int]]:
    files: list[Path] = []
    sizes: dict[str, int] = {}
    for label, volume in ROOTS:
        name = f"{PROJECT}_{volume}"
        expected = Path(f"/var/lib/docker/volumes/{name}/_data")
        actual = Path(docker("volume", "inspect", name, "--format", "{{.Mountpoint}}"))
        if actual != expected or expected.is_symlink() or not expected.is_dir():
            raise RuntimeError("EXACT_P23_VOLUME_REQUIRED")
        device = expected.stat().st_dev
        size = 0
        for directory, subdirs, names in os.walk(expected, followlinks=False):
            for subdir in subdirs:
                path = Path(directory, subdir)
                if path.is_symlink() or path.stat().st_dev != device:
                    raise RuntimeError("P23_VOLUME_TREE_MUST_NOT_ESCAPE")
            for filename in names:
                path = Path(directory, filename)
                metadata = path.lstat()
                if not stat.S_ISREG(metadata.st_mode) or metadata.st_dev != device:
                    raise RuntimeError("P23_REGULAR_VOLUME_FILE_REQUIRED")
                files.append(path)
                size += metadata.st_size
                if len(files) > MAX_FILES or sum(sizes.values()) + size > MAX_BYTES:
                    raise RuntimeError("P23_CACHE_SCOPE_EXCEEDS_BOUND")
        sizes[label] = size
    return files, sizes


def resident_bytes(files: list[Path]) -> int:
    resident = 0
    for offset in range(0, len(files), 150):
        chunk = files[offset : offset + 150]
        output = subprocess.check_output(
            ("fincore", "--bytes", "--noheadings", "--output", "RES,SIZE", *(str(p) for p in chunk)),
            text=True,
            timeout=30,
        )
        rows = [line.split() for line in output.splitlines() if line.strip()]
        if len(rows) != len(chunk) or any(len(row) != 2 for row in rows):
            raise RuntimeError("P23_FINCORE_INCOMPLETE")
        resident += sum(int(row[0]) for row in rows)
    return resident


def main() -> None:
    if os.geteuid() != 0 or sys.argv[1:] not in (["--measure"], ["--evict"]):
        raise RuntimeError("ROOT_AND_EXACT_MODE_REQUIRED")
    mode = sys.argv[1]
    if mode == "--evict":
        for service in STOPPED_SERVICES:
            name = f"{PROJECT}-{service}-1"
            metadata = json.loads(docker("inspect", name))
            if len(metadata) != 1 or metadata[0]["Config"]["Labels"].get("com.docker.compose.project") != PROJECT:
                raise RuntimeError("EXACT_P23_CONTAINER_REQUIRED")
            if metadata[0]["State"]["Running"] is not False:
                raise RuntimeError("P23_WRITERS_MUST_BE_STOPPED")
    files, sizes = exact_files()
    before = resident_bytes(files)
    if mode == "--evict":
        for path in files:
            fd = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
            try:
                os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)
            finally:
                os.close(fd)
    after = resident_bytes(files)
    print(json.dumps({
        "schema_version": "research.p23-owned-page-cache.v1",
        "project": PROJECT,
        "mode": mode[2:],
        "file_count": len(files),
        "total_file_bytes": sum(sizes.values()),
        "volume_bytes": sizes,
        "resident_before_bytes": before,
        "resident_after_bytes": after,
        "host_drop_caches_used": False,
        "file_bytes_modified": False,
    }, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"P23 owned cache operation refused: {error}", file=sys.stderr)
        sys.exit(1)
