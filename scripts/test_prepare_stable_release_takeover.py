#!/usr/bin/env python3
"""Focused offline tests for the stable runtime takeover preflight."""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts/prepare-stable-release-takeover.py"
PROJECT = "portal-stable-v1-0-1"
PORT = 18081


def env(**overrides: str) -> list[str]:
    values = {
        "AUTH_MODE": "cloudflare_access_local_password",
        "DATABASE_URL": "postgres://portal:fixture-password@portal-postgres:5432/portal_control",
        "PORTAL_ENV": "research",
        "PORTAL_SSE_CONNECT_TIMEOUT_MS": "3000",
        "INTERNAL_PRINCIPAL_SECRET": "fixture-principal-secret-at-least-thirty-two-bytes",
        "QUERY_CURSOR_ACTIVE_KEY_ID": "query-k1",
        "QUERY_CURSOR_KEYS_JSON": '{"query-k1":"fixture-query-key-at-least-thirty-two-bytes"}',
        "GOVERNANCE_APPLY_ACTIVE_KEY_ID": "governance-k1",
        "GOVERNANCE_APPLY_KEYS_JSON": '{"governance-k1":"fixture-governance-key-at-least-32-bytes"}',
        "GOVERNANCE_PLAN_TTL_SECONDS": "300",
        "CLOUDFLARE_TEAM_DOMAIN": "https://team.cloudflareaccess.com",
        "CLOUDFLARE_ACCESS_ISSUER": "https://team.cloudflareaccess.com",
        "CLOUDFLARE_ACCESS_AUD": "fixture-aud",
        "CLOUDFLARE_ACCESS_JWKS_URI": "https://team.cloudflareaccess.com/cdn-cgi/access/certs",
        "CLOUDFLARE_ALLOWED_EMAIL_DOMAIN": "example.test",
        "PORTAL_PUBLIC_ORIGIN": "https://portal.example.test",
        "QUERY_CURSOR_TTL_SECONDS": "900",
        "EXECUTION_REALTIME_AUTHORITY_MODE": "manager_projection",
        "EXECUTION_MARKET_CANDLES_SOURCE": "data_layer",
        "EXECUTION_EDGE_ORIGIN": "https://10.70.0.2:8443",
        "EXECUTION_EDGE_ENVIRONMENT": "paper",
        "EXECUTION_EDGE_MANAGER_V2_PROFILE_ID": "PAPER_BINANCE_USDM",
        "EXECUTION_EDGE_PROJECTION_WORKSPACE_ID": "workspace_execution_manager",
        "EXECUTION_EDGE_KEY_ID": "execution-k1",
        "EXECUTION_EDGE_DELEGATION_ISSUER": "portal-control-api",
        "EXECUTION_EDGE_DELEGATION_AUDIENCE": "portal-execution-edge-paper",
        "EXECUTION_EDGE_DELEGATION_TTL_SECONDS": "45",
        "EXECUTION_EDGE_PAPER_ORIGIN": "https://10.70.0.2:8443",
        "EXECUTION_EDGE_PAPER_PROFILE_ID": "PAPER_BINANCE_USDM",
        "EXECUTION_EDGE_PAPER_AUDIENCE": "portal-execution-edge-paper",
        "EXECUTION_EDGE_SANDBOX_ORIGIN": "https://10.70.0.3:8443",
        "EXECUTION_EDGE_SANDBOX_PROFILE_ID": "SANDBOX_BINANCE_USDM",
        "EXECUTION_EDGE_SANDBOX_AUDIENCE": "portal-execution-edge-sandbox",
        "EXECUTION_EDGE_LIVE_ORIGIN": "https://10.70.0.4:8443",
        "EXECUTION_EDGE_LIVE_PROFILE_ID": "LIVE_BINANCE_USDM",
        "EXECUTION_EDGE_LIVE_AUDIENCE": "portal-execution-edge-live",
        "EXECUTION_EDGE_CONNECT_TIMEOUT_MS": "3000",
        "EXECUTION_EDGE_CURRENT_SOURCE_REQUEST_TIMEOUT_MS": "5000",
        "EXECUTION_EDGE_CURRENT_SOURCE_MAX_RESPONSE_BYTES": "2097152",
        "EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_CONCURRENCY": "64",
        "EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_QUEUE": "128",
        "EXECUTION_EDGE_CURRENT_SOURCE_QUEUE_TIMEOUT_MS": "250",
        "EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND": "15",
        "EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_PACE_WAIT_MS": "1000",
        "EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID": "workspace_execution_manager",
        "EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS": "15000",
        "EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS": "120000",
        "EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS": "300000",
        "EXECUTION_LOCAL_PROJECTION_JOURNAL_RETENTION_SECONDS": "86400",
        "EXECUTION_LOCAL_PROJECTION_MAXIMUM_JOURNAL_ENTRIES": "10000",
    }
    for feature in (
        "EDGE", "REALTIME_SSE", "ANALYTICS_QUERY", "SHADOW_QUERY", "PAPER_WORKBENCH_SHADOW",
        "COMMAND_CENTER_SNAPSHOT", "LOCAL_R0_TASKS", "CURRENT_SOURCE_PAPER",
        "CURRENT_SOURCE_PAPER_DNSE", "CURRENT_SOURCE_SANDBOX", "CURRENT_SOURCE_LIVE",
        "MARKET_CONTEXT", "LOCAL_PROJECTION", "DURABLE_MIRROR", "DURABLE_MIRROR_READS",
        "PUBLIC_MARKET_CANDLES",
    ):
        values[f"FEATURE_EXECUTION_{feature}"] = "true" if feature not in {"SHADOW_QUERY", "PAPER_WORKBENCH_SHADOW"} else "false"
    values["FEATURE_EXECUTION_COMMAND_RELAY"] = "false"
    values.update(overrides)
    return [f"{key}={value}" for key, value in values.items()]


def base(service: str, environment: list[str] | None = None) -> dict:
    config_files = ",".join((
        "/home/bobby/portal-stable-v1.0.1/compose.yaml",
        "/home/bobby/portal-stable-v1.0.1/deploy/compose.execution-current-source.yaml",
        "/home/bobby/portal-stable-v1.0.1/deploy/compose.execution-local-projection.yaml",
        "/home/bobby/portal-stable-v1.0.1/deploy/compose.execution-manager-analytics.yaml",
        "/home/bobby/portal-stable-v1.0.1/deploy/compose.execution-manager-realtime.yaml",
    ))
    return {
        "Name": f"/{PROJECT}-{service}-1",
        "Config": {
            "Labels": {
                "com.docker.compose.project": PROJECT,
                "com.docker.compose.service": service,
                "com.docker.compose.project.config_files": config_files,
            },
            "Env": environment or [],
        },
        "State": {"Running": True},
        "HostConfig": {"GroupAdd": []},
        "Mounts": [],
        "NetworkSettings": {"Ports": {}},
    }


def fixture() -> dict:
    containers = {service: base(service) for service in (
        "portal-api", "roadmap-task-board-api", "portal-web", "control-api",
        "portal-postgres", "portal-nats", "portal-minio", "quant-worker-py",
    )}
    containers["control-api"] = base("control-api", env())
    containers["control-api"]["HostConfig"]["GroupAdd"] = ["987"]
    containers["control-api"]["Mounts"] = [
        {"Type": "bind", "Source": "/srv/primus/control-api/control-api-secrets", "Destination": "/run/secrets/control-api", "RW": False},
        {"Type": "bind", "Source": "/srv/primus/control-api/execution-edge-secrets", "Destination": "/run/secrets/execution-edge", "RW": False},
    ]
    containers["portal-api"] = base("portal-api", env(
        PORTAL_HISTORICAL_DATA_MODE="required",
        PORTAL_CRYPTO_RESAMPLE_ENGINE="duckdb",
        PORTAL_SUMMARY_DEADLINE_MS="500",
        PORTAL_ENVIRONMENT="research",
        PORTAL_PLANNING_SUMMARY_MODE="api",
        PORTAL_PLANNING_SUMMARY_TIMEOUT_MS="500",
        PORTAL_PLANNING_SUMMARY_MAX_BYTES="65536",
    ))
    containers["portal-api"]["HostConfig"]["GroupAdd"] = ["996"]
    containers["portal-api"]["Mounts"] = [
        {"Type": "volume", "Name": f"{PROJECT}_portal-artifacts", "Destination": "/var/lib/portal/artifacts", "RW": True},
        {"Type": "bind", "Source": "/srv/primus/historical-market-data/storage", "Destination": "/data", "RW": False},
    ]
    containers["roadmap-task-board-api"] = base("roadmap-task-board-api", env(
        PORTAL_PUBLIC_URL="https://portal.example.test/roadmap-task-board",
        PORTAL_DEFAULT_ACTOR="portal-service",
        PORTAL_LOG_LEVEL="INFO",
        LARK_MESSAGE_FORMAT="text",
        PORTAL_NOTIFY_CHANNELS="lark",
    ))
    containers["roadmap-task-board-api"]["Mounts"] = [
        {"Type": "volume", "Name": f"{PROJECT}_roadmap-task-board-data", "Destination": "/var/lib/roadmap-task-board", "RW": True},
    ]
    containers["portal-web"] = base("portal-web", env(PORTAL_WEB_UPSTREAM="control-api:4000"))
    containers["portal-web"]["NetworkSettings"]["Ports"] = {"80/tcp": [{"HostIp": "127.0.0.1", "HostPort": str(PORT)}]}
    containers["portal-postgres"] = base("portal-postgres", env(POSTGRES_USER="portal", POSTGRES_PASSWORD="fixture-db-password", POSTGRES_DB="portal_control"))
    containers["portal-postgres"]["Mounts"] = [{"Type": "volume", "Name": f"{PROJECT}_portal-postgres-data", "Destination": "/var/lib/postgresql/data", "RW": True}]
    containers["portal-nats"]["Mounts"] = [{"Type": "volume", "Name": f"{PROJECT}_portal-nats-data", "Destination": "/var/lib/nats", "RW": True}]
    containers["portal-minio"] = base("portal-minio", env(MINIO_ROOT_USER="portal", MINIO_ROOT_PASSWORD="fixture-minio-password"))
    containers["portal-minio"]["Mounts"] = [{"Type": "volume", "Name": f"{PROJECT}_portal-minio-data", "Destination": "/data", "RW": True}]
    containers["quant-worker-py"] = base("quant-worker-py", env(
        PORTAL_HISTORICAL_DATA_MODE="disabled",
        PORTAL_WORKER_LEASE_SECONDS="60",
        PORTAL_WORKER_GRACE_SECONDS="10",
    ))
    return {"containers": containers}


class StableTakeoverTest(unittest.TestCase):
    def run_helper(self, fixture_payload: dict, *, check: bool = False) -> tuple[subprocess.CompletedProcess[str], pathlib.Path]:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = pathlib.Path(temporary.name)
        fixture_path = root / "fixture.json"
        fixture_path.write_text(json.dumps(fixture_payload), encoding="utf-8")
        deployment = root / "portal"
        if check:
            deployment.mkdir()
        command = [sys.executable, str(SCRIPT), "--fixture", str(fixture_path), "--deployment-path", str(deployment)]
        if check:
            command.append("--check")
        return subprocess.run(command, text=True, capture_output=True, check=False), deployment

    def test_writes_private_env_and_sanitized_state(self):
        result, deployment = self.run_helper(fixture())
        self.assertEqual(result.returncode, 0, result.stderr)
        env_path = deployment / ".env.production"
        self.assertEqual(env_path.stat().st_mode & 0o777, 0o600)
        contents = env_path.read_text()
        self.assertIn("PORTAL_STACK_NAME='portal-stable-v1-0-1'", contents)
        self.assertIn("CONTROL_API_QUERY_CURSOR_KEYS_JSON=", contents)
        state = json.loads((deployment / "transition/stable-takeover-state.json").read_text())
        self.assertEqual(state["decision"], "STABLE_RELEASE_TAKEOVER_PREFLIGHT_PASSED")
        self.assertNotIn("fixture-password", json.dumps(state))
        self.assertFalse(state["command_relay"])

    def test_rejects_command_relay_and_wrong_volume(self):
        unsafe = fixture()
        control = unsafe["containers"]["control-api"]
        control["Config"]["Env"] = env(FEATURE_EXECUTION_COMMAND_RELAY="true")
        result, _ = self.run_helper(unsafe)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("command relay", result.stderr)

        unsafe = fixture()
        unsafe["containers"]["portal-postgres"]["Mounts"][0]["Name"] = "unexpected-volume"
        result, _ = self.run_helper(unsafe)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("volume identity", result.stderr)

    def test_check_never_creates_environment(self):
        result, deployment = self.run_helper(fixture(), check=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((deployment / ".env.production").exists())


if __name__ == "__main__":
    unittest.main()
