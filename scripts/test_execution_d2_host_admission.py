#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("execution-d2-host-admission.py")
SPEC = importlib.util.spec_from_file_location("execution_d2_host_admission", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def healthy(**overrides: object):
    values = {
        "cpu_count": 8,
        "memory_available_bytes": 10 * MODULE.GIB,
        "swap_total_bytes": 0,
        "disk_available_bytes": 60 * MODULE.GIB,
        "cpu_some_avg10": 10.0,
        "memory_full_avg10": 0.0,
        "io_full_avg10": 1.0,
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
                io_full_avg10=5.01,
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

    def test_historical_oom_requires_explicit_owner_review(self) -> None:
        rejected = MODULE.assess_host(healthy(historical_oom_count=2), historical_oom_reviewed=False)
        accepted = MODULE.assess_host(healthy(historical_oom_count=2), historical_oom_reviewed=True)
        self.assertIn("HISTORICAL_OOM_REVIEW_REQUIRED", rejected["blockers"])
        self.assertEqual(accepted["status"], "D2_HOST_ADMISSION_ACCEPTED")
        self.assertIn("HISTORICAL_OOM_OWNER_ACCEPTED_FOR_BOUNDED_DARK_WINDOW", accepted["warnings"])


if __name__ == "__main__":
    unittest.main()
