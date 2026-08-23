#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest
from datetime import datetime, timedelta, timezone


MODULE_PATH = pathlib.Path(__file__).with_name("execution-d2-authorization.py")
SPEC = importlib.util.spec_from_file_location("execution_d2_authorization", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def template_values() -> dict[str, str]:
    path = pathlib.Path(__file__).parents[1] / "deploy/execution-d2/owner-input.env.example"
    return MODULE.parse_input(path)


def ready_values(now: datetime) -> dict[str, str]:
    values = template_values()
    values.update(
        {
            "OWNER": "bobby",
            "OWNER_CONFIRMED_AT_UTC": (now - timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "D2_AUTHORIZED": "true",
            "D2_CHANGE_WINDOW_ID": "d2-dark-20260823",
            "D2_CHANGE_WINDOW_START_UTC": (now - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "D2_CHANGE_WINDOW_END_UTC": (now + timedelta(minutes=55)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "AWS_OPERATOR": "bobby",
            "ROLLBACK_OWNER": "bobby",
            "DEPLOYMENT_COMMIT": "a" * 40,
            "D1_REVALIDATED": "true",
            "IMAGE_SOURCE_COMMIT": "a" * 40,
            "IMAGE_PUBLICATION_ARTIFACT_SHA256": "b" * 64,
            "HIGH_FINDINGS_DISPOSITION": "ACCEPTED_NO_CRITICAL",
            "IMAGE_SIGNATURES_VERIFIED": "true",
            "WORKLOAD_IDENTITY_INVENTORY_SHA256": "c" * 64,
            "WORKLOAD_IDENTITIES_VERIFIED": "true",
            "D2_HOST_ADMISSION_EVIDENCE_SHA256": "d" * 64,
            "HOST_ADMISSION_ACCEPTED": "true",
            "HISTORICAL_OOM_REVIEWED": "true",
            "D2_RESOURCE_BUDGET_APPROVED": "true",
            "INSTANCE_PROFILE_ASSOCIATION_ID": "iip-assoc-0123456789abcdef0",
            "INSTANCE_PROFILE_DETACH_APPROVED": "true",
            "IMDS_HARDENING_APPROVED": "true",
            "PROJECTION_DB_PILOT_APPROVED": "true",
            "BACKUP_OWNER": "bobby",
            "OBSERVABILITY_OWNER": "bobby",
        }
    )
    return values


class AuthorizationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.now = datetime(2026, 8, 23, 6, 0, tzinfo=timezone.utc)

    def test_template_is_unauthorized_and_safe(self) -> None:
        MODULE.validate(template_values(), mode="template", now=self.now)

    def test_readiness_accepts_all_predecessor_evidence_but_not_activation(self) -> None:
        values = ready_values(self.now)
        MODULE.validate(values, mode="readiness", now=self.now)
        with self.assertRaisesRegex(MODULE.AuthorizationError, "not proven detached"):
            MODULE.validate(values, mode="activation", now=self.now)

    def test_activation_requires_detach_and_hop_limit_proof(self) -> None:
        values = ready_values(self.now)
        values["INSTANCE_PROFILE_DETACHED"] = "true"
        values["IMDS_HOP_LIMIT_ONE_VERIFIED"] = "true"
        MODULE.validate(values, mode="activation", now=self.now)

    def test_never_accepts_source_query_sse_or_command_authority(self) -> None:
        for key in MODULE.PERMANENT_FALSE_KEYS:
            values = ready_values(self.now)
            values[key] = "true"
            with self.subTest(key=key):
                with self.assertRaisesRegex(MODULE.AuthorizationError, "must remain false"):
                    MODULE.validate(values, mode="readiness", now=self.now)

    def test_rejects_commit_evidence_and_window_drift(self) -> None:
        cases = (
            ("IMAGE_SOURCE_COMMIT", "e" * 40),
            ("IMAGE_PUBLICATION_ARTIFACT_SHA256", "short"),
            ("HIGH_FINDINGS_DISPOSITION", "PENDING"),
            ("INSTANCE_PROFILE_ASSOCIATION_ID", "iip-assoc-any"),
            ("D2_CHANGE_WINDOW_END_UTC", "2026-08-23T10:00:00Z"),
        )
        for key, value in cases:
            values = ready_values(self.now)
            values[key] = value
            with self.subTest(key=key):
                with self.assertRaises(MODULE.AuthorizationError):
                    MODULE.validate(values, mode="readiness", now=self.now)


if __name__ == "__main__":
    unittest.main()
