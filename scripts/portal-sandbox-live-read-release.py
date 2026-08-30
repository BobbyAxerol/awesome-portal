#!/usr/bin/env python3
"""Build and verify the immutable N23 Sandbox/Live read release adjunct.

The adjunct chains to a verified N22 pack, binds every N23 source/contract byte
and qualifies independently reversible read profiles. It never deploys,
contacts a source or authorizes a command.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import pathlib
import re
import sys
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT_NAME = "sandbox-live-read-release.json"
N22_OUTPUT = "full-paper-read-release.json"
PROFILE_REL = "deploy/manifests/sandbox-live-read-release-profile.v1.json"
RUNBOOK_REL = "deploy/runbooks/portal-n23-sandbox-live-read-release-and-rollback.md"
SOURCE_MAP_REL = "services/portal-execution-edge-rs/contracts/current-source-v1/capability-source-map.json"
ZERO_DIGEST = "sha256:" + "0" * 64
SHA256 = re.compile(r"sha256:[0-9a-f]{64}")

N23_FILES = (
    "apps/control-api/src/app.module.ts",
    "apps/control-api/src/execution/current-source.proxy.ts",
    "apps/control-api/src/paper-read/manager-records.ts",
    "apps/control-api/src/profile-read/contracts.ts",
    "apps/control-api/src/profile-read/profile-read.controller.ts",
    "apps/control-api/src/profile-read/profile-read.service.ts",
    "apps/control-api/src/sandbox/sandbox-certification.controller.ts",
    "apps/control-api/src/sandbox/sandbox-certification.service.ts",
    "apps/control-api/src/canary/canary.controller.ts",
    "apps/control-api/src/canary/canary.service.ts",
    "apps/control-api/src/live/live-operations.controller.ts",
    "apps/control-api/src/live/live-operations.service.ts",
    "apps/control-api/src/governance/governance.controller.ts",
    "apps/control-api/src/governance/governance.service.ts",
    "apps/control-api/src/screen-bff/catalogue.ts",
    "packages/contracts/schemas/execution-profile-read.v1.schema.json",
    "packages/contracts/schemas/governance-live-review.v1.schema.json",
    "packages/contracts/openapi/execution-profile-read.openapi.json",
    "packages/contracts/generated/execution-profile-read.d.ts",
    PROFILE_REL,
    RUNBOOK_REL,
)


class N23ReleaseError(ValueError):
    pass


def load_n22() -> Any:
    path = ROOT / "scripts/portal-full-paper-read-release.py"
    spec = importlib.util.spec_from_file_location("portal_full_paper_read_release_n23", path)
    if spec is None or spec.loader is None:
        raise N23ReleaseError("N22 verifier cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def digest(path: pathlib.Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise N23ReleaseError(f"invalid or missing JSON: {path.name}") from exc
    if not isinstance(value, dict):
        raise N23ReleaseError("release JSON must be an object")
    return value


def target_from_source_map(source_map: dict[str, Any]) -> dict[str, Any]:
    source_screens = [
        "EXECUTION_CANARY_CONTROL_ROOM_SCREEN",
        "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
        "EXECUTION_SANDBOX_CERTIFICATION_SCREEN",
        "LIVE_OPERATIONS_SCREEN",
        "SANDBOX_TRADING_SCREEN",
    ]
    by_screen = {row.get("screen_id"): row for row in source_map.get("screens", [])}
    if any(screen not in by_screen for screen in source_screens):
        raise N23ReleaseError("canonical N23 source screen set is incomplete")
    declared = sorted({
        capability for screen in source_screens
        for capability in by_screen[screen].get("read_capabilities", [])
    })
    by_capability = {row.get("id"): row for row in source_map.get("capabilities", [])}
    if any(capability not in by_capability for capability in declared):
        raise N23ReleaseError("N23 capability catalogue is incomplete")
    unavailable = sorted(capability for capability in declared
                         if by_capability[capability].get("classification") == "SUPPORTED_BUT_NOT_ACTIVATED")
    portal_join = sorted(capability for capability in declared
                         if any(str(binding).startswith("portal.") for binding in by_capability[capability].get("source_bindings", []))
                         and capability.startswith("portal."))
    activated = sorted(set(declared) - set(unavailable) - set(portal_join))
    sources = sorted({
        binding for capability in activated
        for binding in by_capability[capability].get("source_bindings", [])
        if str(binding).startswith("manager.")
    })
    expected = {
        "activated": [
            "accounts.current", "deployments.positions", "ops.alerts", "orders.fills",
            "orders.list", "reconciliation.current", "sessions.current",
        ],
        "portal_join": ["portal.activation", "portal.governance"],
        "unavailable": ["market.ticks"],
        "sources": [
            "manager.accounts", "manager.deployments", "manager.fills", "manager.orders",
            "manager.positions", "manager.reconciliation", "manager.sessions",
        ],
    }
    actual = {"activated": activated, "portal_join": portal_join, "unavailable": unavailable, "sources": sources}
    if actual != expected:
        raise N23ReleaseError("N23 source-as-is scope drifted")
    return actual


def validated_profile(target: dict[str, Any]) -> dict[str, Any]:
    profile = read_json(ROOT / PROFILE_REL)
    if profile.get("schema_version") != "portal.sandbox-live-read-release-profile.v1" or profile.get("phase") != "N23":
        raise N23ReleaseError("N23 profile revision drifted")
    if profile.get("activated_read_capability_ids") != target["activated"] or profile.get("portal_join_capability_ids") != target["portal_join"] or profile.get("typed_unavailable_capability_ids") != target["unavailable"] or profile.get("source_binding_ids") != target["sources"]:
        raise N23ReleaseError("N23 profile/source map mismatch")
    profiles = profile.get("profiles")
    if profiles != {
        "sandbox": {
            "environment": "sandbox", "manager_profile_id": "SANDBOX_BINANCE_USDM",
            "delegation_audience": "portal-execution-edge-sandbox",
            "screen_ids": ["EXECUTION_SANDBOX_CERTIFICATION_SCREEN", "SANDBOX_TRADING_SCREEN"],
        },
        "live": {
            "environment": "live", "manager_profile_id": "LIVE_BINANCE_USDM",
            "delegation_audience": "portal-execution-edge-live",
            "screen_ids": ["EXECUTION_CANARY_CONTROL_ROOM_SCREEN", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "LIVE_OPERATIONS_SCREEN"],
        },
    }:
        raise N23ReleaseError("N23 profile identity or audience drifted")
    if profile.get("canary") != {
        "trading_system_mode": None,
        "source_profile": "LIVE_BINANCE_USDM",
        "composition": "PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS",
    }:
        raise N23ReleaseError("N23 Canary composition drifted")
    flags = profile.get("candidate_flags")
    if flags != {
        "control_api_current_source_paper": True,
        "control_api_current_source_sandbox": True,
        "control_api_current_source_live": True,
        "edge_manager_v2_read": True,
        "edge_projection_ingestion": False,
        "edge_realtime_sse": False,
        "edge_analytics_query": False,
        "edge_command_relay": False,
    }:
        raise N23ReleaseError("N23 candidate flags widened authority")
    if profile.get("independent_rollback") != {
        "sandbox": "CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX=false",
        "live": "CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_LIVE=false",
        "database_action": "NONE",
    }:
        raise N23ReleaseError("N23 independent rollback drifted")
    authorization = profile.get("phase_authorization", {})
    if authorization.get("live_command_or_mutation_authorized") is not False or authorization.get("trading_system_change_authorized") is not False:
        raise N23ReleaseError("N23 authorization widened")
    return profile


def file_bindings() -> list[dict[str, str]]:
    rows = []
    for relative in N23_FILES:
        path = ROOT / relative
        if not path.is_file() or path.is_symlink():
            raise N23ReleaseError(f"N23 release file is missing or unsafe: {relative}")
        rows.append({"file": relative, "sha256": digest(path)})
    return rows


def verify_n22(n22_pack: pathlib.Path, n14b_pack: pathlib.Path, n14a_pack: pathlib.Path) -> dict[str, Any]:
    try:
        return load_n22().verify(n22_pack, n14b_pack, n14a_pack)
    except Exception as exc:
        raise N23ReleaseError(f"N22 lineage rejected: {exc}") from exc


def write_pack(path: pathlib.Path, payload: dict[str, Any]) -> None:
    path.mkdir(parents=True, exist_ok=False)
    target = path / OUTPUT_NAME
    target.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    (path / "SHA256SUMS").write_text(f"{digest(target).split(':', 1)[1]}  {OUTPUT_NAME}\n", encoding="utf-8")


def generate(args: argparse.Namespace) -> dict[str, Any]:
    n22 = verify_n22(args.n22_pack_dir.resolve(), args.n14b_pack_dir.resolve(), args.n14a_pack_dir.resolve())
    target = target_from_source_map(read_json(ROOT / SOURCE_MAP_REL))
    profile = validated_profile(target)
    previous = args.previous_release_sha256
    if not isinstance(previous, str) or SHA256.fullmatch(previous) is None:
        raise N23ReleaseError("previous N23 release digest is invalid")
    payload = {
        "schema_version": "portal.sandbox-live-read-release.v1",
        "phase": "N23",
        "decision": "N23_SANDBOX_LIVE_READ_RELEASE_QUALIFIED",
        "portal_source_commit": n22["portal_source_commit"],
        "n22_lineage": {"file": N22_OUTPUT, "sha256": digest(args.n22_pack_dir.resolve() / N22_OUTPUT)},
        "image_bindings": n22["image_bindings"],
        "source_map": {"file": SOURCE_MAP_REL, "sha256": digest(ROOT / SOURCE_MAP_REL)},
        "profile": profile,
        "file_bindings": file_bindings(),
        "authority": {
            "sandbox_read_qualified": True, "live_read_qualified": True,
            "runtime_deployed": False, "command_or_mutation": False,
            "projection_writer": False, "trading_system_change": False,
        },
        "rollback": {
            **profile["independent_rollback"],
            "runbook": RUNBOOK_REL,
            "runbook_sha256": digest(ROOT / RUNBOOK_REL),
            "previous_release_sha256": previous,
        },
    }
    write_pack(args.output_dir.resolve(), payload)
    verify(args.output_dir.resolve(), args.n22_pack_dir.resolve(), args.n14b_pack_dir.resolve(), args.n14a_pack_dir.resolve())
    return {"decision": payload["decision"], "profile_count": 2, "runtime_deployed": False, "sha256": digest(args.output_dir.resolve() / OUTPUT_NAME)}


def verify(pack: pathlib.Path, n22_pack: pathlib.Path, n14b_pack: pathlib.Path, n14a_pack: pathlib.Path) -> dict[str, Any]:
    payload = read_json(pack / OUTPUT_NAME)
    n22 = verify_n22(n22_pack, n14b_pack, n14a_pack)
    target = target_from_source_map(read_json(ROOT / SOURCE_MAP_REL))
    profile = validated_profile(target)
    if set(payload) != {"schema_version", "phase", "decision", "portal_source_commit", "n22_lineage", "image_bindings", "source_map", "profile", "file_bindings", "authority", "rollback"}:
        raise N23ReleaseError("N23 release keys drifted")
    if payload.get("schema_version") != "portal.sandbox-live-read-release.v1" or payload.get("phase") != "N23" or payload.get("decision") != "N23_SANDBOX_LIVE_READ_RELEASE_QUALIFIED":
        raise N23ReleaseError("N23 release identity drifted")
    if payload.get("portal_source_commit") != n22["portal_source_commit"] or payload.get("image_bindings") != n22["image_bindings"]:
        raise N23ReleaseError("N23 immutable image/source lineage drifted")
    if payload.get("n22_lineage") != {"file": N22_OUTPUT, "sha256": digest(n22_pack / N22_OUTPUT)}:
        raise N23ReleaseError("N22 manifest reference drifted")
    if payload.get("source_map") != {"file": SOURCE_MAP_REL, "sha256": digest(ROOT / SOURCE_MAP_REL)} or payload.get("profile") != profile:
        raise N23ReleaseError("N23 current-source scope drifted")
    if payload.get("file_bindings") != file_bindings():
        raise N23ReleaseError("N23 bound bytes drifted")
    if payload.get("authority") != {"sandbox_read_qualified": True, "live_read_qualified": True, "runtime_deployed": False, "command_or_mutation": False, "projection_writer": False, "trading_system_change": False}:
        raise N23ReleaseError("N23 authority widened")
    rollback = payload.get("rollback", {})
    if rollback.get("sandbox") != profile["independent_rollback"]["sandbox"] or rollback.get("live") != profile["independent_rollback"]["live"] or rollback.get("database_action") != "NONE" or rollback.get("runbook_sha256") != digest(ROOT / RUNBOOK_REL) or SHA256.fullmatch(rollback.get("previous_release_sha256", "")) is None:
        raise N23ReleaseError("N23 rollback contract drifted")
    expected_sum = f"{digest(pack / OUTPUT_NAME).split(':', 1)[1]}  {OUTPUT_NAME}\n"
    if (pack / "SHA256SUMS").read_text(encoding="utf-8") != expected_sum:
        raise N23ReleaseError("N23 checksum drifted")
    return payload


def parser() -> argparse.ArgumentParser:
    cli = argparse.ArgumentParser(description=__doc__)
    commands = cli.add_subparsers(dest="command", required=True)
    for name in ("generate", "verify"):
        command = commands.add_parser(name)
        command.add_argument("--n14a-pack-dir", type=pathlib.Path, required=True)
        command.add_argument("--n14b-pack-dir", type=pathlib.Path, required=True)
        command.add_argument("--n22-pack-dir", type=pathlib.Path, required=True)
        command.add_argument("--" + ("output-dir" if name == "generate" else "pack-dir"), type=pathlib.Path, required=True)
        if name == "generate":
            command.add_argument("--previous-release-sha256", default=ZERO_DIGEST)
    return cli


def main() -> int:
    args = parser().parse_args()
    try:
        result = generate(args) if args.command == "generate" else {
            "decision": verify(args.pack_dir.resolve(), args.n22_pack_dir.resolve(), args.n14b_pack_dir.resolve(), args.n14a_pack_dir.resolve())["decision"],
            "runtime_deployed": False,
            "sha256": digest(args.pack_dir.resolve() / OUTPUT_NAME),
        }
    except N23ReleaseError as exc:
        print(f"N23_REJECTED: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
