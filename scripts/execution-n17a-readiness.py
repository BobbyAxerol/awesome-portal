#!/usr/bin/env python3
"""N17A source-dark readiness verifier and isolated evidence sealer."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import stat
import sys
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parent.parent
PROFILE = ROOT / "packages/contracts/fixtures/execution-production-readiness.source-dark.valid.json"
CORPUS = ROOT / "packages/contracts/fixtures/execution-production-readiness.game-day-corpus.valid.json"
OPENAPI = ROOT / "packages/contracts/openapi/execution-production-readiness.openapi.json"
GENERATED = ROOT / "packages/contracts/generated/execution-production-readiness.d.ts"
DEPLOY = ROOT / "deploy/execution-readiness"
RUST = ROOT / "services/portal-execution-edge-rs/crates/production-readiness/src/lib.rs"
SCENARIOS = (
    "NETWORK_PARTITION",
    "AUTH_LOSS",
    "SOURCE_LOSS",
    "COMMAND_CONTAINMENT",
    "CONTROL_DATABASE_PITR",
    "PROJECTION_REBUILD",
    "RELEASE_ROLLBACK",
    "CREDENTIAL_COMPROMISE",
)
DIGEST = re.compile(r"sha256:[0-9a-f]{64}")
PRIVATE_IPV4 = re.compile(r"\b(?:10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)")
PUBLIC_IPV4 = re.compile(r"\b(?:[1-9]\d{0,2}\.){3}[1-9]\d{0,2}\b")


class ReadinessError(ValueError):
    """Fail-closed N17A contract rejection."""


def duplicate_safe(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ReadinessError(f"duplicate JSON key rejected: {key}")
        value[key] = item
    return value


def read_json(path: pathlib.Path) -> Any:
    metadata = path.lstat()
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise ReadinessError(f"artifact must be a regular non-symlink: {path}")
    if metadata.st_size <= 0 or metadata.st_size > 4 * 1024 * 1024:
        raise ReadinessError(f"artifact size outside bound: {path}")
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=duplicate_safe)


def exact(value: dict[str, Any], keys: set[str], label: str) -> None:
    if set(value) != keys:
        raise ReadinessError(f"{label} keys are not exact")


def verify_static() -> None:
    profile = read_json(PROFILE)
    exact(
        profile,
        {
            "schema_version", "profile_id", "source_dark", "production_active",
            "network_authorized", "source_call_authorized", "command_authorized",
            "production_slo_claimed", "game_day_frequency_days", "budgets",
            "error_budget", "recovery", "rotations", "capacity",
        },
        "readiness profile",
    )
    if profile["schema_version"] != "portal.execution.production-readiness.v1" or profile["profile_id"] != "n17a-source-dark":
        raise ReadinessError("readiness identity drifted")
    if profile["source_dark"] is not True or any(
        profile[key] is not False
        for key in (
            "production_active", "network_authorized", "source_call_authorized",
            "command_authorized", "production_slo_claimed",
        )
    ):
        raise ReadinessError("N17A widened production/source/command authority")
    expected_budgets = {
        "CURRENT_STATE_SAME_CELL": 200,
        "CROSS_CELL_BFF": 500,
        "CACHED_CHART": 500,
        "UNCACHED_MEDIUM_CHART": 1500,
        "FIRST_EVENT": 2000,
        "CORRELATION_FRESHNESS": 300000,
        "COMMAND_PLAN_ACKNOWLEDGEMENT": 500,
    }
    actual_budgets = {item["class"]: item["maximum_p95_milliseconds"] for item in profile["budgets"]}
    if actual_budgets != expected_budgets or len(profile["budgets"]) != len(expected_budgets):
        raise ReadinessError("provisional product budget catalogue drifted")
    if any(
        item.get("authority") != "PROVISIONAL_QUALIFICATION_ONLY"
        or item.get("production_slo_claimed") is not False
        for item in profile["budgets"]
    ):
        raise ReadinessError("qualification budget became a production SLO")
    if profile["error_budget"] != {
        "mode": "NOT_MEASURED",
        "availability_target_basis_points": None,
        "production_window_open": False,
        "burn_alert_active": False,
    }:
        raise ReadinessError("N17A invented an availability/error budget")
    if {item["component"] for item in profile["recovery"]} != {
        "PORTAL_CONTROL_DATABASE", "PROJECTION_DATABASE", "OBJECT_EVIDENCE",
    } or len(profile["recovery"]) != 3:
        raise ReadinessError("recovery catalogue is incomplete")
    if any(
        item.get("production_rpo_seconds") is not None
        or item.get("production_rto_seconds") is not None
        or item.get("owner_approval_required") is not True
        for item in profile["recovery"]
    ):
        raise ReadinessError("N17A invented production RPO/RTO")
    if {item["identity"] for item in profile["rotations"]} != {
        "MTLS_READ", "MTLS_COMMAND", "DELEGATED_JWT_SIGNER",
        "PORTAL_SESSION_SIGNER", "PROJECTION_DATABASE",
    } or len(profile["rotations"]) != 5:
        raise ReadinessError("rotation catalogue is incomplete")
    if any(
        item.get("runtime_identity_bound") is not False
        or item.get("secret_material_present") is not False
        or item.get("revoke_old_after_verify") is not True
        or item.get("compromise_disables_commands_first") is not True
        for item in profile["rotations"]
    ):
        raise ReadinessError("rotation template contains runtime authority or secrets")
    if profile["capacity"] != {
        "six_month_order_fill_rows": 182000,
        "initial_concurrent_sse_clients": 100,
        "source_burst_events_per_minute": 140,
        "maximum_chart_points": 5000,
        "maximum_correlation_assets": 150,
        "backup_daily_copies": 7,
        "backup_weekly_copies": 4,
        "monthly_cost_budget_usd": None,
        "cost_owner_approval_required": True,
    }:
        raise ReadinessError("capacity/retention/cost budget drifted")

    corpus = read_json(CORPUS)
    if corpus.get("fixture_only") is not True or corpus.get("production_active") is not False:
        raise ReadinessError("game-day corpus is not a source-dark fixture")
    cases = corpus.get("cases", [])
    if tuple(item.get("scenario") for item in cases) != SCENARIOS:
        raise ReadinessError("game-day scenario order/catalogue drifted")
    if any(
        item.get("isolated") is not True
        or item.get("expected_outcome") != "PASS"
        or item.get("expected_source_request_sent") is not False
        or item.get("expected_command_dispatched") is not False
        or item.get("expected_network_attempts") != 0
        for item in cases
    ):
        raise ReadinessError("game-day case crossed the isolated boundary")

    openapi = read_json(OPENAPI)
    if openapi.get("paths") != {} or openapi.get("servers") != []:
        raise ReadinessError("N17A component contract mounted a route/server")
    for key in ("x-runtime-mounted", "x-production-active", "x-production-slo-claimed"):
        if openapi.get(key) is not False:
            raise ReadinessError(f"N17A OpenAPI widened {key}")
    generated = GENERATED.read_text(encoding="utf-8")
    for token in (
        "ReadinessProfile", "ProvisionalBudget", "RecoveryPolicy",
        "RotationPolicy", "GameDayCase", "QualificationResult",
    ):
        if token not in generated:
            raise ReadinessError(f"generated TypeScript lost {token}")

    deploy_files = [
        DEPLOY / "capacity-retention-cost.source-dark.json",
        DEPLOY / "rotation-inventory.source-dark.json",
        DEPLOY / "owner-matrix.source-dark.json",
        DEPLOY / "game-day-plan.source-dark.json",
        DEPLOY / "grafana-dashboard.source-dark.json",
    ]
    deploy_values = [read_json(path) for path in deploy_files]
    if any(value.get("source_dark") is not True for value in deploy_values[:4]):
        raise ReadinessError("deploy blueprint lost source-dark marker")
    if any(value.get("production_active") is not False for value in (deploy_values[0], deploy_values[2], deploy_values[3])):
        raise ReadinessError("deploy blueprint claimed production activation")
    if deploy_values[0]["cost"]["monthly_budget_usd"] is not None or deploy_values[0]["cost"]["production_resource_creation_allowed"] is not False:
        raise ReadinessError("N17A cost blueprint created production authority")
    if deploy_values[1].get("secret_material_present") is not False or deploy_values[1].get("runtime_identity_bound") is not False:
        raise ReadinessError("rotation inventory contains runtime material")
    if deploy_values[2].get("final_release_authority") != "BOBBY":
        raise ReadinessError("owner matrix lost final owner authority")
    if deploy_values[3].get("network_mode") != "ISOLATED_DOCKER_NETWORK_ONLY" or any(
        deploy_values[3].get(key) is not True
        for key in ("abort_on_network_attempt", "abort_on_source_request", "abort_on_command_dispatch")
    ):
        raise ReadinessError("game-day plan is not fail-closed")
    if deploy_values[4]["templating"]["list"][0].get("query") != "NOT_BOUND_N17A":
        raise ReadinessError("dashboard gained a bound datasource")

    alerts = (DEPLOY / "slo-alerts.source-dark.yml").read_text(encoding="utf-8")
    for token in (
        "PortalExecutionUnexpectedProductionAuthority", "PortalExecutionProjectionGap",
        "PortalExecutionCommandUncertain", "PortalExecutionCertificateExpiring",
        "activation_required: N17B",
    ):
        if token not in alerts:
            raise ReadinessError(f"alert template lost {token}")
    combined = "\n".join(
        [json.dumps(profile), json.dumps(corpus), *(json.dumps(value) for value in deploy_values), alerts]
    ).lower()
    for forbidden in (
        "-----begin", "authorization: bearer", "client_secret", "private_key",
        "postgres://", "redis://", "proxy_pass", "remote_write", "api_key",
    ):
        if forbidden in combined:
            raise ReadinessError(f"N17A blueprint contains secret/network-shaped material: {forbidden}")
    if PRIVATE_IPV4.search(combined) or PUBLIC_IPV4.search(combined):
        raise ReadinessError("N17A blueprint contains a concrete network address")
    rust = RUST.read_text(encoding="utf-8")
    for forbidden in ("reqwest", "TcpListener", "TcpStream", "aws_sdk", "cloudflare_api"):
        if forbidden in rust:
            raise ReadinessError(f"pure readiness authority gained network/cloud dependency: {forbidden}")


def seal_evidence(output: pathlib.Path, generated_at: int, drills: list[str]) -> None:
    parsed: dict[str, str] = {}
    for value in drills:
        if "=" not in value:
            raise ReadinessError("--drill must be SCENARIO=sha256:<digest>")
        scenario, digest = value.split("=", 1)
        if scenario in parsed or scenario not in SCENARIOS or DIGEST.fullmatch(digest) is None:
            raise ReadinessError("drill scenario/digest is invalid or duplicated")
        parsed[scenario] = digest
    if tuple(parsed) != SCENARIOS or generated_at <= 0:
        raise ReadinessError("exact ordered eight-scenario evidence is required")
    rows = [
        {
            "scenario": scenario,
            "outcome": "PASSED",
            "isolated": True,
            "source_request_sent": False,
            "command_dispatched": False,
            "network_attempts": 0,
            "evidence_digest": parsed[scenario],
        }
        for scenario in SCENARIOS
    ]
    canonical = json.dumps(
        {"generated_at_epoch_seconds": generated_at, "drills": rows},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    payload = {
        "schema_version": "portal.execution.production-readiness-evidence.v1",
        "evidence_class": "OFFLINE_ISOLATED_QUALIFICATION",
        "source_dark": True,
        "production_active": False,
        "production_slo_claimed": False,
        "production_rpo_rto_claimed": False,
        "generated_at_epoch_seconds": generated_at,
        "drills": rows,
        "manifest_digest": "sha256:" + hashlib.sha256(canonical).hexdigest(),
    }
    output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    verify_evidence(output)


def verify_evidence(path: pathlib.Path) -> None:
    payload = read_json(path)
    exact(
        payload,
        {
            "schema_version", "evidence_class", "source_dark", "production_active",
            "production_slo_claimed", "production_rpo_rto_claimed",
            "generated_at_epoch_seconds", "drills", "manifest_digest",
        },
        "readiness evidence",
    )
    if payload["schema_version"] != "portal.execution.production-readiness-evidence.v1" or payload["evidence_class"] != "OFFLINE_ISOLATED_QUALIFICATION":
        raise ReadinessError("evidence identity is invalid")
    if payload["source_dark"] is not True or any(
        payload[key] is not False
        for key in ("production_active", "production_slo_claimed", "production_rpo_rto_claimed")
    ):
        raise ReadinessError("offline evidence claimed production authority")
    rows = payload["drills"]
    if tuple(row.get("scenario") for row in rows) != SCENARIOS:
        raise ReadinessError("evidence drill catalogue is incomplete")
    for row in rows:
        exact(
            row,
            {
                "scenario", "outcome", "isolated", "source_request_sent",
                "command_dispatched", "network_attempts", "evidence_digest",
            },
            "drill evidence",
        )
        if (
            row["outcome"] != "PASSED"
            or row["isolated"] is not True
            or row["source_request_sent"] is not False
            or row["command_dispatched"] is not False
            or row["network_attempts"] != 0
            or DIGEST.fullmatch(row["evidence_digest"]) is None
        ):
            raise ReadinessError("drill evidence crossed an isolated boundary")
    canonical = json.dumps(
        {"generated_at_epoch_seconds": payload["generated_at_epoch_seconds"], "drills": rows},
        sort_keys=True,
        separators=(",", ":"),
    ).encode()
    expected = "sha256:" + hashlib.sha256(canonical).hexdigest()
    if payload["manifest_digest"] != expected:
        raise ReadinessError("readiness evidence manifest digest mismatch")


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    commands = root.add_subparsers(dest="command", required=True)
    commands.add_parser("verify-static")
    seal = commands.add_parser("seal-evidence")
    seal.add_argument("--output", type=pathlib.Path, required=True)
    seal.add_argument("--generated-at", type=int, required=True)
    seal.add_argument("--drill", action="append", default=[])
    verify = commands.add_parser("verify-evidence")
    verify.add_argument("--evidence", type=pathlib.Path, required=True)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "verify-static":
            verify_static()
            print(json.dumps({
                "decision": "N17A_STATIC_SOURCE_DARK_VALID",
                "production_active": False,
                "production_slo_claimed": False,
                "network_attempts": 0,
            }, separators=(",", ":"), sort_keys=True))
        elif args.command == "seal-evidence":
            seal_evidence(args.output, args.generated_at, args.drill)
        else:
            verify_evidence(args.evidence)
            print(json.dumps({
                "decision": "N17A_OFFLINE_EVIDENCE_VALID",
                "production_active": False,
                "production_rpo_rto_claimed": False,
                "network_attempts": 0,
            }, separators=(",", ":"), sort_keys=True))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ReadinessError) as exc:
        print(f"N17A readiness verification failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
