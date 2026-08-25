#!/usr/bin/env python3
"""Offline tests for N01 D4 dormant closeout discipline."""

from __future__ import annotations

import importlib.util
import json
import pathlib
import stat
import subprocess
import sys
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone


SCRIPT = pathlib.Path(__file__).with_name("execution-d4-dormant-closeout.py")
SPEC = importlib.util.spec_from_file_location("execution_d4_dormant_closeout", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FakeHost:
    def __init__(self, containers=None, facade=None):
        self.containers = list(containers or [])
        self.facade_container = facade
        self.actions: list[str] = []

    def portal_d4_containers(self, project):
        return list(self.containers)

    def facade(self, name):
        return self.facade_container

    def stop(self, container, timeout):
        self.actions.append(f"stop:{container.service or 'dedicated-source-facade'}:{timeout}")
        self.containers = [
            replace(item, running=False) if item.container_id == container.container_id else item
            for item in self.containers
        ]
        if self.facade_container and self.facade_container.container_id == container.container_id:
            self.facade_container = replace(self.facade_container, running=False)

    def remove_ephemeral(self, container):
        self.actions.append(f"remove:{container.service}")
        self.containers = [
            item for item in self.containers if item.container_id != container.container_id
        ]

    def restore_d2_dark(self, config):
        self.actions.append("restore:d2-dark-source-proxy")
        return self.d2_source_proxy(config.portal_project)

    def d2_source_proxy(self, project):
        return container(
            "d2-proxy",
            "portal-execution-edge-source-proxy-1",
            "source-proxy",
            running=True,
            phase=None,
            health="healthy",
        )


def container(identifier, name, service, *, running=True, phase=MODULE.D4_PHASE_LABEL, health="none"):
    labels = {
        "com.docker.compose.project": "portal-execution-edge",
        "com.docker.compose.service": service,
    }
    if phase is not None:
        labels["com.primusspark.portal.execution-phase"] = phase
    return MODULE.Container(identifier, name, running, health, labels)


def facade(*, running=True, project="ts_d4_source_read", service="portal_paper_read"):
    return MODULE.Container(
        "facade-id",
        "ts_d4_source_read-portal_paper_read-1",
        running,
        "none",
        {
            "com.docker.compose.project": project,
            "com.docker.compose.service": service,
        },
    )


class DormantCloseoutTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temporary.name)
        self.owner = self.root / "owner.env"
        self.d2 = self.root / "d2.env"
        self.state = self.root / "state"
        self.source_evidence = self.root / "source-evidence.json"
        self.config_path = self.root / "closeout.env"
        self.start = datetime(2026, 8, 25, 1, 0, tzinfo=timezone.utc)
        self.end = self.start + timedelta(hours=1)
        self._write_owner()
        self._private(self.d2, "SOURCE_PROXY_SOURCE_MODE=dark\n")
        self._write_config()
        self.config = MODULE.load_config(self.config_path)

    def tearDown(self):
        self.temporary.cleanup()

    @staticmethod
    def _private(path, value):
        path.write_text(value, encoding="utf-8")
        path.chmod(0o600)

    def _write_owner(self, *, authorized="true"):
        values = {
            "INPUT_VERSION": "portal.execution-d4.owner-input.v2",
            "D4_AUTHORIZED": authorized,
            "D4_CHANGE_WINDOW_ID": "d4-test-window",
            "D4_CHANGE_WINDOW_START_UTC": self.start.isoformat().replace("+00:00", "Z"),
            "D4_CHANGE_WINDOW_END_UTC": self.end.isoformat().replace("+00:00", "Z"),
            "REGISTRY_DELIVERY_PROFILE": "fixture",
            "ACTIVATION_AUTHORIZED": "false",
            "ALLOW_QUERY": "false",
            "ALLOW_ANALYTICS": "false",
            "ALLOW_SSE": "false",
            "ALLOW_COMMANDS": "false",
            "ALLOW_TRADING_SYSTEM_CHANGES": "false",
        }
        self._private(self.owner, "".join(f"{key}={value}\n" for key, value in values.items()))

    def _write_config(self, *, extra="", mode=0o600):
        values = {
            "INPUT_VERSION": MODULE.SCHEMA_VERSION,
            "OWNER_INPUT_FILE": str(self.owner),
            "D2_ACCEPTED_RUNTIME_ENV_FILE": str(self.d2),
            "PORTAL_COMPOSE_PROJECT": "portal-execution-edge",
            "SOURCE_FACADE_CONTAINER": "ts_d4_source_read-portal_paper_read-1",
            "SOURCE_FACADE_COMPOSE_PROJECT": "ts_d4_source_read",
            "SOURCE_FACADE_COMPOSE_SERVICE": "portal_paper_read",
            "STATE_DIRECTORY": str(self.state),
            "SOURCE_SESSION_EVIDENCE_FILE": str(self.source_evidence),
            "POLL_INTERVAL_SECONDS": "1",
            "START_DEADLINE_SECONDS": "300",
            "STOP_TIMEOUT_SECONDS": "15",
            "D2_HEALTH_TIMEOUT_SECONDS": "60",
            "MIN_IDLE_OBSERVATION_SECONDS": "60",
        }
        self.config_path.write_text(
            "".join(f"{key}={value}\n" for key, value in values.items()) + extra,
            encoding="utf-8",
        )
        self.config_path.chmod(mode)

    def _write_source_evidence(self, *, sessions=0, bytes_delta=0, observed_at=None):
        payload = {
            "schema_version": MODULE.SOURCE_EVIDENCE_VERSION,
            "change_window_id": "d4-test-window",
            "observed_at_utc": (observed_at or self.end).isoformat().replace("+00:00", "Z"),
            "source_facade_container": "ts_d4_source_read-portal_paper_read-1",
            "source_facade_running": False,
            "source_db_sessions": sessions,
            "source_selects_delta": 0,
            "source_bytes_delta": bytes_delta,
            "observation_seconds": 60,
            "sanitized": True,
            "producer": "trading-system-owner",
        }
        self._private(self.source_evidence, json.dumps(payload))

    def test_repository_template_is_valid_without_private_runtime_files(self):
        path = SCRIPT.parent.parent / "deploy/execution-d4/dormant-closeout.env.example"
        config = MODULE.load_config(path, template=True)
        self.assertEqual(config.portal_project, "portal-execution-edge")
        self.assertEqual(config.stop_timeout, 15)

    def test_config_is_exact_private_and_non_traversing(self):
        self._write_config(extra="UNKNOWN=value\n")
        with self.assertRaisesRegex(MODULE.CloseoutError, "unknown key"):
            MODULE.load_config(self.config_path)
        self._write_config(mode=0o644)
        with self.assertRaisesRegex(MODULE.CloseoutError, "mode-0600"):
            MODULE.load_config(self.config_path)

    def test_audit_alerts_only_when_source_path_outlives_window(self):
        host = FakeHost(
            [container("qualifier", "qualifier", "paper-read-qualifier")], facade()
        )
        inside = MODULE.audit(self.config, host, now=self.start + timedelta(minutes=1))
        outside = MODULE.audit(self.config, host, now=self.end)
        self.assertEqual(inside["decision"], "D4_WINDOW_ACTIVE")
        self.assertEqual(outside["decision"], "D4_DORMANT_VIOLATION")
        self.assertEqual(outside["active_portal_services"], ["paper-read-qualifier"])

    def test_closeout_is_ordered_bounded_and_restores_d2(self):
        host = FakeHost(
            [
                container("proxy", "proxy", "source-proxy"),
                container("qualifier", "qualifier", "paper-read-qualifier"),
            ],
            facade(),
        )
        result = MODULE.closeout(self.config, host, reason="test", now=self.end)
        self.assertEqual(
            host.actions,
            [
                "stop:paper-read-qualifier:15",
                "remove:paper-read-qualifier",
                "stop:source-proxy:15",
                "stop:portal_paper_read:15",
                "restore:d2-dark-source-proxy",
            ],
        )
        self.assertEqual(result["decision"], "D4_DORMANT_CLOSEOUT_COMPLETE")
        self.assertFalse(result["activation_authorized"])
        self.assertEqual(result["registry_delivery_profile"], "fixture")
        evidence = self.state / "latest-closeout.json"
        self.assertEqual(stat.S_IMODE(evidence.stat().st_mode), 0o600)
        self.assertNotIn("credential", evidence.read_text(encoding="utf-8").lower())

    def test_unexpected_portal_service_fails_before_mutation(self):
        host = FakeHost([container("edge", "edge", "execution-edge")], facade())
        with self.assertRaisesRegex(MODULE.CloseoutError, "unexpected D4 service"):
            MODULE.closeout(self.config, host, reason="test", now=self.end)
        self.assertEqual(host.actions, [])

    def test_facade_compose_identity_mismatch_fails_before_mutation(self):
        host = FakeHost([container("proxy", "proxy", "source-proxy")], facade(project="other"))
        with self.assertRaisesRegex(MODULE.CloseoutError, "project identity mismatch"):
            MODULE.closeout(self.config, host, reason="test", now=self.end)
        self.assertEqual(host.actions, [])

    def test_d2_restore_failure_never_writes_false_closeout_evidence(self):
        class FailingHost(FakeHost):
            def restore_d2_dark(self, config):
                self.actions.append("restore:d2-dark-source-proxy")
                raise MODULE.CloseoutError("synthetic D2 restore failure")

        host = FailingHost([container("proxy", "proxy", "source-proxy")], facade())
        with self.assertRaisesRegex(MODULE.CloseoutError, "synthetic D2 restore failure"):
            MODULE.closeout(self.config, host, reason="test", now=self.end)
        self.assertFalse((self.state / "latest-closeout.json").exists())
        self.assertIn("stop:portal_paper_read:15", host.actions)

    def test_guard_aborts_a_missed_start_deadline(self):
        host = FakeHost([], facade(running=False))
        moments = iter([self.start, self.start + timedelta(minutes=6)])
        result = MODULE.guard(
            self.config,
            host,
            now=lambda: next(moments),
            sleep=lambda _: None,
        )
        self.assertEqual(result["reason"], "qualification-start-deadline-missed")
        self.assertEqual(host.actions, ["restore:d2-dark-source-proxy"])

    def test_guard_closes_immediately_after_qualifier_finishes(self):
        host = FakeHost([container("qualifier", "qualifier", "paper-read-qualifier")], facade())
        calls = 0

        def sleeper(_):
            nonlocal calls
            calls += 1
            host.containers = []

        moments = iter([self.start + timedelta(minutes=1), self.start + timedelta(minutes=2)])
        result = MODULE.guard(self.config, host, now=lambda: next(moments), sleep=sleeper)
        self.assertEqual(result["reason"], "qualification-finished")
        self.assertIn("stop:portal_paper_read:15", host.actions)
        self.assertEqual(calls, 1)

    def test_guard_closes_on_expiry_and_revocation(self):
        host = FakeHost([container("proxy", "proxy", "source-proxy")], facade())
        expired = MODULE.guard(
            self.config,
            host,
            now=lambda: self.end,
            sleep=lambda _: self.fail("expired guard must not sleep"),
        )
        self.assertEqual(expired["reason"], "owner-window-expired")

        self._write_owner(authorized="false")
        host = FakeHost([], facade(running=False))
        revoked = MODULE.guard(
            self.config,
            host,
            now=lambda: self.start,
            sleep=lambda _: self.fail("revoked guard must not sleep"),
        )
        self.assertEqual(revoked["reason"], "owner-authorization-revoked")

    def test_source_idle_evidence_requires_zero_traffic_after_closeout(self):
        self._write_source_evidence(sessions=1)
        with self.assertRaisesRegex(MODULE.CloseoutError, "non-zero source traffic"):
            MODULE.validate_source_idle_evidence(self.config, closeout_at=self.start)
        self._write_source_evidence(bytes_delta=1)
        with self.assertRaisesRegex(MODULE.CloseoutError, "non-zero source traffic"):
            MODULE.validate_source_idle_evidence(self.config, closeout_at=self.start)
        self._write_source_evidence()
        result = MODULE.validate_source_idle_evidence(self.config, closeout_at=self.start)
        self.assertEqual(result["source_db_sessions"], 0)

    def test_verify_binds_dormant_runtime_to_owner_idle_evidence(self):
        host = FakeHost([], facade(running=False))
        MODULE.closeout(self.config, host, reason="test", now=self.start + timedelta(minutes=30))
        self._write_source_evidence(observed_at=self.end)
        result = MODULE.verify(self.config, host, now=self.end + timedelta(minutes=1))
        self.assertEqual(result["decision"], "D4_DORMANT_VERIFIED")
        self.assertEqual(result["source_db_sessions"], 0)
        self.assertEqual(result["d2_dark_source_proxy_health"], "healthy")
        self.assertRegex(result["source_idle_evidence_sha256"], r"^sha256:[0-9a-f]{64}$")

    def test_systemd_guard_is_finite_and_not_enabled(self):
        unit = (
            SCRIPT.parent.parent
            / "deploy/execution-d4/systemd/portal-execution-d4-window-guard.service.example"
        ).read_text(encoding="utf-8")
        self.assertIn("--mode guard", unit)
        self.assertIn("Type=oneshot", unit)
        self.assertNotIn("\nWantedBy=", unit)
        self.assertNotIn("docker.sock:", unit)

    def test_d2_restore_uses_local_immutable_image_only(self):
        host = MODULE.DockerHost(SCRIPT.parent.parent, sleep=lambda _: None)
        commands = []

        def run(args, *, check=True):
            commands.append(args)
            return subprocess.CompletedProcess(args, 0, "", "")

        host._run = run
        host._project_service = lambda project, service: [
            container(
                "d2-proxy",
                "portal-execution-edge-source-proxy-1",
                "source-proxy",
                phase=None,
                health="healthy",
            )
        ]
        host.restore_d2_dark(self.config)
        compose = next(command for command in commands if command[:2] == ["docker", "compose"])
        self.assertIn("--force-recreate", compose)
        self.assertEqual(compose[compose.index("--pull") + 1], "never")
        self.assertNotIn("down", compose)


if __name__ == "__main__":
    unittest.main()
