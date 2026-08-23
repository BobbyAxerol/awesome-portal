#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest


MODULE_PATH = pathlib.Path(__file__).with_name("execution-iam-verify.py")
SPEC = importlib.util.spec_from_file_location("execution_iam_verify", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def rule(
    rule_id: str = "sgr-0123456789abcdef0",
    *,
    protocol: str = "udp",
    from_port: int | None = 51820,
    to_port: int | None = 51820,
    cidr: str = "203.0.113.9/32",
) -> dict[str, object]:
    return {
        "SecurityGroupRuleId": rule_id,
        "IsEgress": False,
        "IpProtocol": protocol,
        "FromPort": from_port,
        "ToPort": to_port,
        "CidrIpv4": cidr,
    }


class WireGuardRuleAuditTest(unittest.TestCase):
    def test_accepts_one_exact_rule_and_ignores_unrelated_tcp(self) -> None:
        report = MODULE.audit_wireguard_rules(
            [rule(), rule("sgr-11111111111111111", protocol="tcp", from_port=22, to_port=22)],
            port=51820,
            expected_cidr="203.0.113.9/32",
            expected_rule_id="sgr-0123456789abcdef0",
        )
        self.assertEqual(report["exact_rule_count"], 1)
        self.assertEqual(report["unsafe_rule_count"], 0)

    def test_rejects_duplicate_exact_rule(self) -> None:
        with self.assertRaisesRegex(MODULE.VerificationError, "expected one exact"):
            MODULE.audit_wireguard_rules(
                [rule(), rule("sgr-11111111111111111")],
                port=51820,
                expected_cidr="203.0.113.9/32",
                expected_rule_id="sgr-0123456789abcdef0",
            )

    def test_rejects_overly_broad_cidr(self) -> None:
        with self.assertRaisesRegex(MODULE.VerificationError, "overly broad"):
            MODULE.audit_wireguard_rules(
                [rule(cidr="0.0.0.0/0"), rule()],
                port=51820,
                expected_cidr="203.0.113.9/32",
                expected_rule_id="sgr-0123456789abcdef0",
            )

    def test_rejects_udp_port_range_and_all_traffic(self) -> None:
        for unsafe in (
            rule(from_port=50000, to_port=60000),
            rule(protocol="-1", from_port=None, to_port=None, cidr="203.0.113.9/32"),
        ):
            with self.subTest(unsafe=unsafe):
                with self.assertRaisesRegex(MODULE.VerificationError, "overly broad"):
                    MODULE.audit_wireguard_rules(
                        [rule(), unsafe],
                        port=51820,
                        expected_cidr="203.0.113.9/32",
                        expected_rule_id="sgr-0123456789abcdef0",
                    )

    def test_rejects_rule_id_drift(self) -> None:
        with self.assertRaisesRegex(MODULE.VerificationError, "rollback record"):
            MODULE.audit_wireguard_rules(
                [rule()],
                port=51820,
                expected_cidr="203.0.113.9/32",
                expected_rule_id="sgr-11111111111111111",
            )


class ProhibitedIngressAuditTest(unittest.TestCase):
    def test_accepts_no_rule_covering_private_service_ports(self) -> None:
        report = MODULE.audit_prohibited_ingress(
            [rule(protocol="tcp", from_port=22, to_port=22)],
            prohibited_ports=(5432, 8443, 8444),
        )
        self.assertEqual(report["covering_rule_count"], 0)

    def test_rejects_exact_range_and_all_traffic_rules(self) -> None:
        unsafe_rules = (
            rule(protocol="tcp", from_port=8443, to_port=8443),
            rule(protocol="tcp", from_port=8000, to_port=9000),
            rule(protocol="-1", from_port=None, to_port=None),
        )
        for unsafe in unsafe_rules:
            with self.subTest(unsafe=unsafe):
                with self.assertRaisesRegex(MODULE.VerificationError, "prohibited D2"):
                    MODULE.audit_prohibited_ingress(
                        [unsafe], prohibited_ports=(5432, 8443, 8444)
                    )


if __name__ == "__main__":
    unittest.main()
