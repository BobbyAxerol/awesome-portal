#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone


MODULE_PATH = pathlib.Path(__file__).with_name("execution-d2-host-admission.py")
SPEC = importlib.util.spec_from_file_location("execution_d2_host_admission", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def healthy(**overrides: object):
    values = {
        "host_boot_id_sha256": "a" * 64,
        "cpu_count": 8,
        "memory_available_bytes": 10 * MODULE.GIB,
        "swap_total_bytes": 0,
        "disk_available_bytes": 60 * MODULE.GIB,
        "cpu_some_avg10": 10.0,
        "cpu_some_avg60": 8.0,
        "memory_full_avg10": 0.0,
        "memory_full_avg60": 0.0,
        "io_full_avg10": 1.0,
        "io_full_avg60": 1.0,
        "ntp_synchronized": True,
        "running_container_count": 20,
        "historical_oom_count": 0,
        "execution_portal_container_count": 0,
        "prohibited_listener_ports": (),
        "runtime_group_gid": 987,
        "invalid_runtime_paths": (),
    }
    values.update(overrides)
    return MODULE.HostFacts(**values)


class ParsingTest(unittest.TestCase):
    def test_parses_pressure_and_meminfo(self) -> None:
        self.assertEqual(
            MODULE.parse_pressure(
                "some avg10=1.25 avg60=0.50 total=1\nfull avg10=0.75 avg60=0.10 total=1\n",
                "full",
            ),
            0.75,
        )
        self.assertEqual(
            MODULE.parse_pressure(
                "some avg10=1.25 avg60=0.50 total=1\nfull avg10=0.75 avg60=0.10 total=1\n",
                "full",
                "avg60",
            ),
            0.10,
        )
        available, swap = MODULE.parse_meminfo("MemAvailable: 1024 kB\nSwapTotal: 2048 kB\n")
        self.assertEqual(available, 1024 * 1024)
        self.assertEqual(swap, 2048 * 1024)


class AdmissionTest(unittest.TestCase):
    def test_accepts_healthy_host_with_visible_warnings(self) -> None:
        report = MODULE.assess_host(healthy(running_container_count=30), historical_oom_reviewed=False)
        self.assertEqual(report["status"], "D2_HOST_ADMISSION_ACCEPTED")
        self.assertIn("NO_SWAP", report["warnings"])
        self.assertIn("SHARED_HOST_HAS_AT_LEAST_30_RUNNING_CONTAINERS", report["warnings"])

    def test_rejects_pressure_capacity_collision_and_identity_gaps(self) -> None:
        report = MODULE.assess_host(
            healthy(
                memory_available_bytes=7 * MODULE.GIB,
                disk_available_bytes=49 * MODULE.GIB,
                cpu_some_avg10=75.01,
                memory_full_avg10=2.01,
                ntp_synchronized=False,
                execution_portal_container_count=1,
                prohibited_listener_ports=(8443,),
                runtime_group_gid=None,
                invalid_runtime_paths=("/etc/portal",),
            ),
            historical_oom_reviewed=False,
        )
        self.assertEqual(report["status"], "D2_HOST_ADMISSION_REJECTED")
        self.assertGreaterEqual(len(report["blockers"]), 8)

    def test_elevated_shared_io_is_a_visible_preflight_baseline(self) -> None:
        report = MODULE.assess_host(
            healthy(io_full_avg10=8.45, io_full_avg60=7.9),
            historical_oom_reviewed=False,
        )
        self.assertEqual(report["status"], "D2_HOST_ADMISSION_ACCEPTED")
        self.assertIn("ELEVATED_SHARED_HOST_IO_BASELINE", report["warnings"])

    def test_observation_accepts_bounded_delta_and_four_gib_memory_floor(self) -> None:
        baseline = healthy(io_full_avg10=8.45, io_full_avg60=7.9)
        observed = healthy(
            memory_available_bytes=4 * MODULE.GIB,
            cpu_some_avg60=17.0,
            io_full_avg10=9.0,
            io_full_avg60=8.4,
            execution_portal_container_count=3,
        )
        report = MODULE.assess_host(
            observed,
            historical_oom_reviewed=True,
            mode="observation",
            baseline=baseline,
        )
        self.assertEqual(report["status"], "D2_HOST_ADMISSION_ACCEPTED")
        self.assertEqual(report["pressure_deltas"]["io_full_avg60"], 0.5)

    def test_observation_rejects_below_four_gib_even_when_deltas_are_bounded(self) -> None:
        report = MODULE.assess_host(
            healthy(
                memory_available_bytes=4 * MODULE.GIB - 1,
                execution_portal_container_count=3,
            ),
            historical_oom_reviewed=True,
            mode="observation",
            baseline=healthy(),
        )
        self.assertIn("INSUFFICIENT_AVAILABLE_MEMORY", report["blockers"])

    def test_observation_rejects_portal_pressure_delta_and_container_drift(self) -> None:
        baseline = healthy(io_full_avg10=8.0, io_full_avg60=7.5)
        observed = healthy(
            cpu_some_avg60=24.0,
            memory_full_avg60=0.75,
            io_full_avg10=12.0,
            io_full_avg60=9.0,
            execution_portal_container_count=2,
        )
        report = MODULE.assess_host(
            observed,
            historical_oom_reviewed=True,
            mode="observation",
            baseline=baseline,
        )
        self.assertEqual(report["status"], "D2_HOST_ADMISSION_REJECTED")
        self.assertIn("CPU_PRESSURE_DELTA_EXCEEDS_GATE", report["blockers"])
        self.assertIn("MEMORY_PRESSURE_DELTA_EXCEEDS_GATE", report["blockers"])
        self.assertIn("IO_PRESSURE_DELTA_EXCEEDS_GATE", report["blockers"])
        self.assertIn("EXECUTION_PORTAL_CONTAINER_COUNT_UNEXPECTED", report["blockers"])

    def test_observation_rejects_rebooted_host(self) -> None:
        report = MODULE.assess_host(
            healthy(host_boot_id_sha256="b" * 64, execution_portal_container_count=3),
            historical_oom_reviewed=True,
            mode="observation",
            baseline=healthy(),
        )
        self.assertIn("HOST_BOOT_CHANGED_SINCE_PREFLIGHT", report["blockers"])

    def test_baseline_must_be_recent_accepted_same_schema(self) -> None:
        now = datetime(2026, 8, 23, 12, 0, tzinfo=timezone.utc)
        payload = {
            "schema_version": 2,
            "mode": "preflight",
            "status": "D2_HOST_ADMISSION_ACCEPTED",
            "checked_at_utc": (now - timedelta(minutes=5)).isoformat(),
            "facts": MODULE.asdict(healthy()),
        }
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "baseline.json"
            path.write_text(json.dumps(payload), encoding="utf-8")
            self.assertEqual(
                MODULE.load_baseline_report(path, now=now).host_boot_id_sha256,
                "a" * 64,
            )
            payload["checked_at_utc"] = (now - timedelta(minutes=31)).isoformat()
            path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "stale"):
                MODULE.load_baseline_report(path, now=now)

    def test_historical_oom_requires_explicit_owner_review(self) -> None:
        rejected = MODULE.assess_host(healthy(historical_oom_count=2), historical_oom_reviewed=False)
        accepted = MODULE.assess_host(healthy(historical_oom_count=2), historical_oom_reviewed=True)
        self.assertIn("HISTORICAL_OOM_REVIEW_REQUIRED", rejected["blockers"])
        self.assertEqual(accepted["status"], "D2_HOST_ADMISSION_ACCEPTED")
        self.assertIn("HISTORICAL_OOM_OWNER_ACCEPTED_FOR_BOUNDED_DARK_WINDOW", accepted["warnings"])


if __name__ == "__main__":
    unittest.main()
