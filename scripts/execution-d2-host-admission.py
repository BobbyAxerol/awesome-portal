#!/usr/bin/env python3
"""Read-only AWS-HK host admission gate for the D2 dark deployment.

Run as root on AWS-HK so Docker state can be inspected. The report contains
only aggregate capacity/runtime facts; it never emits container names,
environment variables, mounts, image credentials or business data.
"""

from __future__ import annotations

import argparse
import grp
import json
import os
import pathlib
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Callable


GIB = 1024**3
MINIMUM_AVAILABLE_MEMORY_BYTES = 8 * GIB
MINIMUM_AVAILABLE_DISK_BYTES = 50 * GIB
MAXIMUM_CPU_SOME_AVG10 = 50.0
MAXIMUM_MEMORY_FULL_AVG10 = 1.0
MAXIMUM_IO_FULL_AVG10 = 5.0
EXPECTED_RUNTIME_PATHS = (
    "/etc/portal",
    "/srv/primus/portal",
    "/srv/primus/portal/execution-edge",
    "/srv/primus/portal/source-proxy",
)
PROHIBITED_LISTENER_PORTS = {5432, 8443, 8444}
PORTAL_CONTAINER_PATTERN = re.compile(
    r"(?:portal-execution-edge|source-proxy|portal-projection|portal-ingestor)"
)


@dataclass(frozen=True)
class HostFacts:
    cpu_count: int
    memory_available_bytes: int
    swap_total_bytes: int
    disk_available_bytes: int
    cpu_some_avg10: float
    memory_full_avg10: float
    io_full_avg10: float
    ntp_synchronized: bool
    running_container_count: int
    historical_oom_count: int
    execution_portal_container_count: int
    prohibited_listener_ports: tuple[int, ...]
    runtime_group_gid: int | None
    invalid_runtime_paths: tuple[str, ...]


def parse_pressure(raw: str, kind: str) -> float:
    for line in raw.splitlines():
        fields = line.split()
        if fields and fields[0] == kind:
            for field in fields[1:]:
                if field.startswith("avg10="):
                    return float(field.split("=", 1)[1])
    raise ValueError(f"pressure record lacks {kind} avg10")


def parse_meminfo(raw: str) -> tuple[int, int]:
    values: dict[str, int] = {}
    for line in raw.splitlines():
        if ":" not in line:
            continue
        key, rest = line.split(":", 1)
        token = rest.strip().split()[0]
        values[key] = int(token) * 1024
    return values["MemAvailable"], values.get("SwapTotal", 0)


def _run(argv: list[str]) -> str:
    completed = subprocess.run(
        argv,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        timeout=15,
    )
    return completed.stdout


def _listener_ports(raw: str) -> tuple[int, ...]:
    observed: set[int] = set()
    for line in raw.splitlines():
        fields = line.split()
        if len(fields) < 4:
            continue
        endpoint = fields[3]
        match = re.search(r":([0-9]+)$", endpoint)
        if match and int(match.group(1)) in PROHIBITED_LISTENER_PORTS:
            observed.add(int(match.group(1)))
    return tuple(sorted(observed))


def collect_host_facts(
    *,
    read_text: Callable[[str], str] | None = None,
    run: Callable[[list[str]], str] = _run,
) -> HostFacts:
    reader = read_text or (lambda path: pathlib.Path(path).read_text(encoding="utf-8"))
    memory_available, swap_total = parse_meminfo(reader("/proc/meminfo"))
    cpu_some = parse_pressure(reader("/proc/pressure/cpu"), "some")
    memory_full = parse_pressure(reader("/proc/pressure/memory"), "full")
    io_full = parse_pressure(reader("/proc/pressure/io"), "full")
    disk = os.statvfs("/var/lib/docker")
    disk_available = disk.f_bavail * disk.f_frsize

    ntp_synchronized = run(
        ["timedatectl", "show", "--property=NTPSynchronized", "--value"]
    ).strip() == "yes"
    running_ids = [line for line in run(["docker", "ps", "--quiet"]).splitlines() if line]
    all_ids = [line for line in run(["docker", "ps", "--all", "--quiet"]).splitlines() if line]
    oom_count = 0
    if all_ids:
        oom_rows = run(["docker", "inspect", "--format", "{{.State.OOMKilled}}", *all_ids])
        oom_count = sum(line.strip() == "true" for line in oom_rows.splitlines())
    running_names = run(["docker", "ps", "--format", "{{.Names}}"]).splitlines()
    portal_count = sum(bool(PORTAL_CONTAINER_PATTERN.search(name)) for name in running_names)
    listeners = _listener_ports(run(["ss", "-H", "-ltn"]))

    try:
        runtime_gid = grp.getgrnam("portal-runtime").gr_gid
    except KeyError:
        runtime_gid = None
    invalid_paths: list[str] = []
    for raw_path in EXPECTED_RUNTIME_PATHS:
        path = pathlib.Path(raw_path)
        try:
            stat = path.stat()
        except OSError:
            invalid_paths.append(raw_path)
            continue
        if path.is_symlink() or not path.is_dir() or (stat.st_mode & 0o777) != 0o750:
            invalid_paths.append(raw_path)
            continue
        if runtime_gid is None or stat.st_gid != runtime_gid or stat.st_uid != 0:
            invalid_paths.append(raw_path)

    return HostFacts(
        cpu_count=os.cpu_count() or 0,
        memory_available_bytes=memory_available,
        swap_total_bytes=swap_total,
        disk_available_bytes=disk_available,
        cpu_some_avg10=cpu_some,
        memory_full_avg10=memory_full,
        io_full_avg10=io_full,
        ntp_synchronized=ntp_synchronized,
        running_container_count=len(running_ids),
        historical_oom_count=oom_count,
        execution_portal_container_count=portal_count,
        prohibited_listener_ports=listeners,
        runtime_group_gid=runtime_gid,
        invalid_runtime_paths=tuple(invalid_paths),
    )


def assess_host(facts: HostFacts, *, historical_oom_reviewed: bool) -> dict[str, object]:
    blockers: list[str] = []
    warnings: list[str] = []
    if facts.cpu_count < 4:
        blockers.append("INSUFFICIENT_CPU_COUNT")
    if facts.memory_available_bytes < MINIMUM_AVAILABLE_MEMORY_BYTES:
        blockers.append("INSUFFICIENT_AVAILABLE_MEMORY")
    if facts.disk_available_bytes < MINIMUM_AVAILABLE_DISK_BYTES:
        blockers.append("INSUFFICIENT_DOCKER_DISK")
    if facts.cpu_some_avg10 > MAXIMUM_CPU_SOME_AVG10:
        blockers.append("CPU_PRESSURE_EXCEEDS_GATE")
    if facts.memory_full_avg10 > MAXIMUM_MEMORY_FULL_AVG10:
        blockers.append("MEMORY_PRESSURE_EXCEEDS_GATE")
    if facts.io_full_avg10 > MAXIMUM_IO_FULL_AVG10:
        blockers.append("IO_PRESSURE_EXCEEDS_GATE")
    if not facts.ntp_synchronized:
        blockers.append("NTP_NOT_SYNCHRONIZED")
    if facts.execution_portal_container_count:
        blockers.append("EXECUTION_PORTAL_ALREADY_RUNNING")
    if facts.prohibited_listener_ports:
        blockers.append("PRIVATE_SERVICE_PORT_COLLISION")
    if facts.runtime_group_gid is None:
        blockers.append("PORTAL_RUNTIME_GROUP_MISSING")
    if facts.invalid_runtime_paths:
        blockers.append("RUNTIME_PATH_OWNERSHIP_INVALID")
    if facts.historical_oom_count and not historical_oom_reviewed:
        blockers.append("HISTORICAL_OOM_REVIEW_REQUIRED")
    elif facts.historical_oom_count:
        warnings.append("HISTORICAL_OOM_OWNER_ACCEPTED_FOR_BOUNDED_DARK_WINDOW")
    if facts.swap_total_bytes == 0:
        warnings.append("NO_SWAP")
    if facts.running_container_count >= 30:
        warnings.append("SHARED_HOST_HAS_AT_LEAST_30_RUNNING_CONTAINERS")

    return {
        "schema_version": 1,
        "status": "D2_HOST_ADMISSION_ACCEPTED" if not blockers else "D2_HOST_ADMISSION_REJECTED",
        "checked_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "limits": {
            "minimum_available_memory_bytes": MINIMUM_AVAILABLE_MEMORY_BYTES,
            "minimum_available_disk_bytes": MINIMUM_AVAILABLE_DISK_BYTES,
            "maximum_cpu_some_avg10": MAXIMUM_CPU_SOME_AVG10,
            "maximum_memory_full_avg10": MAXIMUM_MEMORY_FULL_AVG10,
            "maximum_io_full_avg10": MAXIMUM_IO_FULL_AVG10,
        },
        "facts": asdict(facts),
        "blockers": blockers,
        "warnings": warnings,
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--acknowledge-historical-oom",
        choices=("D2_HISTORICAL_OOM_REVIEWED",),
        help="Owner-reviewed exception; does not override live pressure gates.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        report = assess_host(
            collect_host_facts(),
            historical_oom_reviewed=args.acknowledge_historical_oom
            == "D2_HISTORICAL_OOM_REVIEWED",
        )
    except Exception as exc:
        print(
            json.dumps({"status": "D2_HOST_ADMISSION_ERROR", "reason": type(exc).__name__}),
            file=sys.stderr,
        )
        return 2
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "D2_HOST_ADMISSION_ACCEPTED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
