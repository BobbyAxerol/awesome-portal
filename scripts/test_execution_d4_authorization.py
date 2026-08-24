#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest
from datetime import datetime, timezone


MODULE_PATH = pathlib.Path(__file__).with_name("execution-d4-authorization.py")
SPEC = importlib.util.spec_from_file_location("execution_d4_authorization", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


NOW = datetime(2026, 8, 23, 12, 0, tzinfo=timezone.utc)


def valid_values() -> dict[str, str]:
    values = {key: "" for key in MODULE.ALLOWED_KEYS}
    values.update(
        {
            "INPUT_VERSION": "portal.execution-d4.owner-input.v2",
            "OWNER": "bobby",
            "OWNER_CONFIRMED_AT_UTC": "2026-08-23T11:55:00Z",
            "D4_AUTHORIZED": "true",
            "D4_CHANGE_WINDOW_ID": "d4-paper-shadow-001",
            "D4_CHANGE_WINDOW_START_UTC": "2026-08-23T11:50:00Z",
            "D4_CHANGE_WINDOW_END_UTC": "2026-08-23T12:40:00Z",
            "SOURCE_OWNER": "trading-system-owner",
            "ROLLBACK_OWNER": "bobby",
            "BACKUP_OWNER": "bobby",
            "OBSERVABILITY_OWNER": "bobby",
            "D2_STATUS": "D2_DARK_ACCEPTED",
            "D3_STATUS": "D3_TRANSPORT_ACCEPTED",
            "DEPLOYMENT_COMMIT": "a" * 40,
            "SOURCE_IMPLEMENTATION_COMMIT": "c" * 40,
            "SOURCE_RUNTIME_ACCEPTANCE_COMMIT": "d" * 40,
            "MAPPER_SOURCE_COMMIT": "a" * 40,
            "BUILDING_EPOCH_ID": "018f8f3e-7b4c-7cc1-8a4f-123456789abc",
            "BUILDING_EPOCH_STATUS": "BUILDING",
            "REGISTRY_DELIVERY_PROFILE": "fixture",
        }
    )
    for key in MODULE.BOOLEAN_KEYS:
        values[key] = "false"
    values.update(MODULE.LOCKED_SOURCE_VALUES)
    values["D4_AUTHORIZED"] = "true"
    for key in MODULE.SOURCE_SECURITY_TRUE_KEYS:
        values[key] = "true"
    values["PROJECTION_STORAGE_ENCRYPTED"] = "true"
    values["PROJECTION_STORAGE_APPROVED"] = "true"
    for key in MODULE.READINESS_DIGEST_KEYS | MODULE.QUALIFICATION_DIGEST_KEYS:
        values[key] = "sha256:" + "b" * 64
    return values


class D4AuthorizationTest(unittest.TestCase):
    def test_template_stays_inactive(self) -> None:
        values = valid_values()
        values["D4_AUTHORIZED"] = "false"
        MODULE.validate(values, mode="template", now=NOW)

    def test_template_cannot_drift_from_locked_source_contract(self) -> None:
        values = valid_values()
        values["D4_AUTHORIZED"] = "false"
        values["SOURCE_PAGE_SIZE"] = "1000"
        with self.assertRaisesRegex(MODULE.AuthorizationError, "locked source"):
            MODULE.validate(values, mode="template", now=NOW)

    def test_readiness_accepts_hardened_source_and_encrypted_store(self) -> None:
        MODULE.validate(valid_values(), mode="readiness", now=NOW)

    def test_reconciliation_accepts_owner_inputs_without_live_authority(self) -> None:
        values = valid_values()
        values["D4_AUTHORIZED"] = "false"
        values["SOURCE_OWNER"] = ""
        values["ROLLBACK_OWNER"] = ""
        values["BACKUP_OWNER"] = ""
        values["OBSERVABILITY_OWNER"] = ""
        values["SOURCE_PROXY_SECRET_DELIVERED"] = "false"
        values["SOURCE_PROXY_EXACT_ROUTES_CONFIGURED"] = "false"
        values["SOURCE_RUNTIME_ACCEPTANCE_SHA256"] = ""
        values["MAPPER_ARTIFACT_SHA256"] = ""
        values["SEALED_CORPUS_SHA256"] = ""
        values["PROJECTION_BACKUP_RESTORE_EVIDENCE_SHA256"] = ""
        MODULE.validate(values, mode="reconciliation", now=NOW)

    def test_reconciliation_cannot_deliver_source_proxy_or_accept_evidence(self) -> None:
        for key in (
            "SOURCE_PROXY_SECRET_DELIVERED",
            "SOURCE_PROXY_EXACT_ROUTES_CONFIGURED",
            "D4_EVIDENCE_ACCEPTED",
        ):
            values = valid_values()
            values["D4_AUTHORIZED"] = "false"
            values["SOURCE_PROXY_SECRET_DELIVERED"] = "false"
            values["SOURCE_PROXY_EXACT_ROUTES_CONFIGURED"] = "false"
            values["D4_EVIDENCE_ACCEPTED"] = "false"
            values[key] = "true"
            with self.assertRaises(MODULE.AuthorizationError):
                MODULE.validate(values, mode="reconciliation", now=NOW)

    def test_current_optional_source_credential_contract_is_rejected(self) -> None:
        values = valid_values()
        values["SOURCE_MISSING_CREDENTIAL_REJECTED"] = "false"
        with self.assertRaisesRegex(MODULE.AuthorizationError, "not proven"):
            MODULE.validate(values, mode="readiness", now=NOW)

    def test_revoked_credential_and_loopback_runtime_are_mandatory(self) -> None:
        for key in (
            "SOURCE_REVOKED_CREDENTIAL_REJECTED",
            "SOURCE_RUNTIME_LOOPBACK_ONLY",
        ):
            values = valid_values()
            values[key] = "false"
            with self.assertRaisesRegex(MODULE.AuthorizationError, "not proven"):
                MODULE.validate(values, mode="readiness", now=NOW)

    def test_source_proxy_delivery_is_a_pre_read_stop_gate(self) -> None:
        for key in (
            "SOURCE_PROXY_SECRET_DELIVERED",
            "SOURCE_PROXY_EXACT_ROUTES_CONFIGURED",
        ):
            values = valid_values()
            values[key] = "false"
            with self.assertRaisesRegex(MODULE.AuthorizationError, "not proven"):
                MODULE.validate(values, mode="readiness", now=NOW)

    def test_locked_source_scope_and_bounds_cannot_drift(self) -> None:
        for key, value in (
            ("SOURCE_AUTH_CONTRACT_REVISION", "d4.paper-read.v2"),
            ("SOURCE_SCOPE", "ALL_PAPER"),
            ("SOURCE_PAGE_SIZE", "1000"),
            ("SOURCE_RESPONSE_MAX_BYTES", "8388608"),
            ("SOURCE_RATE_LIMIT_RPM", "10000"),
        ):
            values = valid_values()
            values[key] = value
            with self.assertRaisesRegex(MODULE.AuthorizationError, "locked source"):
                MODULE.validate(values, mode="readiness", now=NOW)

    def test_source_and_runtime_acceptance_commits_are_pinned(self) -> None:
        for key in (
            "SOURCE_IMPLEMENTATION_COMMIT",
            "SOURCE_RUNTIME_ACCEPTANCE_COMMIT",
        ):
            values = valid_values()
            values[key] = "not-a-commit"
            with self.assertRaisesRegex(MODULE.AuthorizationError, "commit is malformed"):
                MODULE.validate(values, mode="readiness", now=NOW)

    def test_unencrypted_projection_store_is_rejected(self) -> None:
        values = valid_values()
        values["PROJECTION_STORAGE_ENCRYPTED"] = "false"
        with self.assertRaisesRegex(MODULE.AuthorizationError, "not proven encrypted"):
            MODULE.validate(values, mode="readiness", now=NOW)

    def test_d4_cannot_activate_registry_query_or_commands(self) -> None:
        for key, value in (
            ("REGISTRY_DELIVERY_PROFILE", "shadow"),
            ("ACTIVATION_AUTHORIZED", "true"),
            ("ALLOW_QUERY", "true"),
            ("ALLOW_COMMANDS", "true"),
        ):
            values = valid_values()
            values[key] = value
            with self.assertRaises(MODULE.AuthorizationError):
                MODULE.validate(values, mode="readiness", now=NOW)

    def test_qualification_requires_all_evidence_and_owner_acceptance(self) -> None:
        values = valid_values()
        values["D4_EVIDENCE_ACCEPTED"] = "true"
        MODULE.validate(values, mode="qualification", now=NOW)
        values["GAP_RESYNC_EVIDENCE_SHA256"] = ""
        with self.assertRaisesRegex(MODULE.AuthorizationError, "GAP_RESYNC"):
            MODULE.validate(values, mode="qualification", now=NOW)

    def test_readiness_cannot_preaccept_evidence(self) -> None:
        values = valid_values()
        values["D4_EVIDENCE_ACCEPTED"] = "true"
        with self.assertRaisesRegex(MODULE.AuthorizationError, "pre-accept"):
            MODULE.validate(values, mode="readiness", now=NOW)

    def test_window_and_predecessors_are_fail_closed(self) -> None:
        values = valid_values()
        values["D3_STATUS"] = "PLANNED"
        with self.assertRaisesRegex(MODULE.AuthorizationError, "D3"):
            MODULE.validate(values, mode="readiness", now=NOW)
        values = valid_values()
        values["D4_CHANGE_WINDOW_END_UTC"] = "2026-08-23T14:00:01Z"
        with self.assertRaisesRegex(MODULE.AuthorizationError, "two hours"):
            MODULE.validate(values, mode="readiness", now=NOW)


if __name__ == "__main__":
    unittest.main()
