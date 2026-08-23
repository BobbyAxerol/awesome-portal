#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest
from datetime import datetime, timedelta, timezone


MODULE_PATH = pathlib.Path(__file__).with_name("execution-d2-isolation.py")
SPEC = importlib.util.spec_from_file_location("execution_d2_isolation", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FakeClientError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class FakeEC2:
    def __init__(self, *, dry_run_code: str = "DryRunOperation") -> None:
        self.dry_run_code = dry_run_code
        self.hop_limit = 2
        self.metadata_state = "applied"
        self.associated = True
        self.modify_calls: list[dict[str, object]] = []
        self.disassociate_calls: list[dict[str, object]] = []

    def describe_instances(self, **kwargs: object) -> dict[str, object]:
        return {
            "Reservations": [
                {
                    "Instances": [
                        {
                            "InstanceId": TARGET.instance_id,
                            "State": {"Name": "running"},
                            "MetadataOptions": {
                                "State": self.metadata_state,
                                "HttpEndpoint": "enabled",
                                "HttpTokens": "required",
                                "HttpPutResponseHopLimit": self.hop_limit,
                            },
                        }
                    ]
                }
            ]
        }

    def describe_iam_instance_profile_associations(
        self, **kwargs: object
    ) -> dict[str, object]:
        rows = []
        if self.associated:
            rows.append(
                {
                    "AssociationId": TARGET.association_id,
                    "State": "associated",
                    "IamInstanceProfile": {"Arn": TARGET.profile_arn},
                }
            )
        return {"IamInstanceProfileAssociations": rows}

    def modify_instance_metadata_options(self, **kwargs: object) -> dict[str, object]:
        self.modify_calls.append(kwargs)
        if kwargs.get("DryRun"):
            raise FakeClientError(self.dry_run_code)
        self.hop_limit = 1
        return {}

    def disassociate_iam_instance_profile(self, **kwargs: object) -> dict[str, object]:
        self.disassociate_calls.append(kwargs)
        self.associated = False
        return {}


TARGET = MODULE.ExpectedTarget(
    "i-0123456789abcdef0",
    "iip-assoc-0123456789abcdef0",
    "arn:aws:iam::123456789012:instance-profile/PrimusPortalExecutionD1Operator-v1",
)


class IsolationTest(unittest.TestCase):
    def test_verify_requires_exact_dry_run_operation(self) -> None:
        client = FakeEC2()
        MODULE.require_attached_target(MODULE.inspect_state(client, TARGET), TARGET)
        MODULE.verify_modify_authority(client, TARGET)
        self.assertEqual(client.modify_calls[0]["HttpPutResponseHopLimit"], 1)
        self.assertEqual(client.modify_calls[0]["HttpEndpoint"], "enabled")

    def test_verify_rejects_unauthorized_policy(self) -> None:
        with self.assertRaisesRegex(MODULE.IsolationError, "UnauthorizedOperation"):
            MODULE.verify_modify_authority(
                FakeEC2(dry_run_code="UnauthorizedOperation"), TARGET
            )

    def test_target_drift_is_rejected(self) -> None:
        wrong = MODULE.ExpectedTarget(
            TARGET.instance_id,
            "iip-assoc-aaaaaaaaaaaaaaaaa",
            TARGET.profile_arn,
        )
        with self.assertRaisesRegex(MODULE.IsolationError, "association drift"):
            MODULE.require_attached_target(MODULE.inspect_state(FakeEC2(), TARGET), wrong)

    def test_window_is_bounded_and_current(self) -> None:
        now = datetime(2026, 8, 23, 12, 0, tzinfo=timezone.utc)
        MODULE.validate_window("2026-08-23T11:55:00Z", "2026-08-23T12:30:00Z", now=now)
        with self.assertRaisesRegex(MODULE.IsolationError, "two hours"):
            MODULE.validate_window(
                "2026-08-23T11:00:00Z", "2026-08-23T14:00:01Z", now=now
            )
        with self.assertRaisesRegex(MODULE.IsolationError, "outside"):
            MODULE.validate_window(
                "2026-08-23T12:01:00Z", "2026-08-23T12:30:00Z", now=now
            )

    def test_activate_orders_hardening_before_detach_and_absence_probe(self) -> None:
        client = FakeEC2()
        calls: list[str] = []

        original_modify = client.modify_instance_metadata_options
        original_disassociate = client.disassociate_iam_instance_profile

        def modify(**kwargs: object) -> dict[str, object]:
            calls.append("dry-run" if kwargs.get("DryRun") else "harden")
            return original_modify(**kwargs)

        def disassociate(**kwargs: object) -> dict[str, object]:
            calls.append("detach")
            return original_disassociate(**kwargs)

        client.modify_instance_metadata_options = modify  # type: ignore[method-assign]
        client.disassociate_iam_instance_profile = disassociate  # type: ignore[method-assign]
        MODULE.verify_modify_authority(client, TARGET)
        MODULE.activate(
            client,
            TARGET,
            credentials_absent=lambda: calls.append("probe") is None,
        )
        self.assertEqual(calls, ["dry-run", "harden", "detach", "probe"])
        self.assertEqual(client.disassociate_calls[0]["AssociationId"], TARGET.association_id)


if __name__ == "__main__":
    unittest.main()
