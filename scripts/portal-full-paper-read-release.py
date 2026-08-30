#!/usr/bin/env python3
"""N22 immutable full-Paper-read release adjunct.

The adjunct chains to verified N14A/N14B bytes, pins the same immutable image
set and binds all N22 product BFF/contract files. It qualifies a Paper-only
candidate; it never deploys a container or contacts a source.
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
N14B_OUTPUT = "current-source-release-compatibility.json"
OUTPUT_NAME = "full-paper-read-release.json"
PROFILE_REL = "deploy/manifests/full-paper-read-release-profile.v1.json"
RUNBOOK_REL = "deploy/runbooks/portal-n22-full-paper-read-release-and-rollback.md"
SOURCE_MAP_REL = "services/portal-execution-edge-rs/contracts/current-source-v1/capability-source-map.json"
ZERO_DIGEST = "sha256:" + "0" * 64
SHA256 = re.compile(r"sha256:[0-9a-f]{64}")

N22_FILES = (
    "apps/control-api/src/app.module.ts",
    "apps/control-api/src/execution/current-source.proxy.ts",
    "apps/control-api/src/http-error.filter.ts",
    "apps/control-api/src/paper-read/contracts.ts",
    "apps/control-api/src/paper-read/manager-records.ts",
    "apps/control-api/src/paper-read/paper-read.controller.ts",
    "apps/control-api/src/paper-read/paper-read.service.ts",
    "apps/control-api/src/screen-bff/catalogue.ts",
    "packages/contracts/schemas/execution-paper-read.v1.schema.json",
    "packages/contracts/openapi/execution-paper-read.openapi.json",
    "packages/contracts/generated/execution-paper-read.d.ts",
    PROFILE_REL,
    RUNBOOK_REL,
)


class N22ReleaseError(ValueError):
    pass


def load_n14b() -> Any:
    path = ROOT / "scripts/portal-current-source-release.py"
    spec = importlib.util.spec_from_file_location("portal_current_source_release_n22", path)
    if spec is None or spec.loader is None:
        raise N22ReleaseError("N14B verifier cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def digest(path: pathlib.Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def read_json(path: pathlib.Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise N22ReleaseError(f"invalid or missing JSON: {path.name}") from exc
    if not isinstance(value, dict):
        raise N22ReleaseError("release JSON must be an object")
    return value


def target_from_source_map(source_map: dict[str, Any]) -> dict[str, Any]:
    screen_ids = [
        "EXECUTION_FULL_BLOTTER_SCREEN",
        "EXECUTION_PAPER_WORKBENCH_SCREEN",
        "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN",
        "PAPER_TRADING_SCREEN",
    ]
    by_screen = {row.get("screen_id"): row for row in source_map.get("screens", [])}
    if any(screen_id not in by_screen for screen_id in screen_ids):
        raise N22ReleaseError("canonical N22 screen set is incomplete")
    declared = sorted({
        capability
        for screen_id in screen_ids
        for capability in by_screen[screen_id].get("read_capabilities", [])
    })
    if any(by_screen[screen_id].get("action_capabilities") != [] for screen_id in screen_ids):
        raise N22ReleaseError("N22 screen set must remain read-only")
    by_capability = {row.get("id"): row for row in source_map.get("capabilities", [])}
    if any(capability not in by_capability for capability in declared):
        raise N22ReleaseError("N22 capability catalogue is incomplete")
    activated = sorted(capability for capability in declared if by_capability[capability].get("classification") in {"CONNECTED", "DERIVED_FROM_EXISTING_SOURCE"})
    unavailable = sorted(set(declared) - set(activated))
    if unavailable != ["market.candles"]:
        raise N22ReleaseError("typed-unavailable N22 capability set drifted")
    sources = sorted({
        source
        for capability in activated
        for source in by_capability[capability].get("source_bindings", [])
    })
    if any(not source.startswith("manager.") for source in sources):
        raise N22ReleaseError("N22 activated source set must remain Manager-v2 only")
    return {
        "profile": "PAPER",
        "environment": "paper",
        "manager_profile_id": "PAPER_BINANCE_USDM",
        "delegation_audience": "portal-execution-edge-paper",
        "screen_ids": screen_ids,
        "activated_capability_ids": activated,
        "typed_unavailable_capability_ids": unavailable,
        "source_binding_ids": sources,
    }


def validated_profile(target: dict[str, Any]) -> dict[str, Any]:
    profile = read_json(ROOT / PROFILE_REL)
    expected_keys = set(target) | {"schema_version", "phase", "candidate_flags", "phase_authorization"}
    if set(profile) != expected_keys or any(profile.get(key) != value for key, value in target.items()):
        raise N22ReleaseError("N22 profile scope drifted")
    if profile["schema_version"] != "portal.full-paper-read-release-profile.v1" or profile["phase"] != "N22":
        raise N22ReleaseError("N22 profile revision drifted")
    flags = profile["candidate_flags"]
    if flags != {
        "control_api_current_source_paper": True,
        "control_api_current_source_sandbox": False,
        "control_api_current_source_live": False,
        "edge_manager_v2_read": True,
        "edge_projection_ingestion": False,
        "edge_realtime_sse": False,
        "edge_analytics_query": False,
        "edge_command_relay": False,
    }:
        raise N22ReleaseError("N22 candidate flags widened authority")
    if profile["phase_authorization"] != {
        "decision": "BOBBY_APPROVED_N22_IMPLEMENTATION_AND_PAPER_ACTIVATION",
        "scope": "FULL_CURRENT_SOURCE_PAPER_READ",
        "paper_read_release_authorized": True,
        "sandbox_or_live_read_authorized": False,
        "command_or_mutation_authorized": False,
        "trading_system_change_authorized": False,
    }:
        raise N22ReleaseError("N22 authorization drifted")
    return profile


def file_bindings() -> list[dict[str, str]]:
    rows = []
    for relative in N22_FILES:
        path = ROOT / relative
        if not path.is_file() or path.is_symlink():
            raise N22ReleaseError(f"N22 release file is missing or unsafe: {relative}")
        rows.append({"file": relative, "sha256": digest(path)})
    return rows


def verify_n14b(n14b_pack: pathlib.Path, n14a_pack: pathlib.Path) -> dict[str, Any]:
    module = load_n14b()
    try:
        return module.verify_pack(n14b_pack, n14a_pack)
    except Exception as exc:
        raise N22ReleaseError(f"N14B lineage rejected: {exc}") from exc


def write_pack(path: pathlib.Path, payload: dict[str, Any]) -> None:
    path.mkdir(parents=True, exist_ok=False)
    target = path / OUTPUT_NAME
    target.write_text(json.dumps(payload, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    (path / "SHA256SUMS").write_text(f"{digest(target).split(':', 1)[1]}  {OUTPUT_NAME}\n", encoding="utf-8")


def generate(args: argparse.Namespace) -> dict[str, Any]:
    n14b_pack = args.n14b_pack_dir.resolve()
    n14a_pack = args.n14a_pack_dir.resolve()
    lineage = verify_n14b(n14b_pack, n14a_pack)
    source_map = read_json(ROOT / SOURCE_MAP_REL)
    target = target_from_source_map(source_map)
    profile = validated_profile(target)
    previous = args.previous_release_sha256
    if not isinstance(previous, str) or SHA256.fullmatch(previous) is None:
        raise N22ReleaseError("previous N22 release digest is invalid")
    payload = {
        "schema_version": "portal.full-paper-read-release.v1",
        "phase": "N22",
        "decision": "N22_FULL_PAPER_READ_RELEASE_QUALIFIED",
        "portal_source_commit": lineage["portal_source_commit"],
        "n14b_lineage": {"file": N14B_OUTPUT, "sha256": digest(n14b_pack / N14B_OUTPUT)},
        "image_bindings": lineage["image_bindings"],
        "source_map": {"file": SOURCE_MAP_REL, "sha256": digest(ROOT / SOURCE_MAP_REL)},
        "profile": target,
        "candidate_flags": profile["candidate_flags"],
        "file_bindings": file_bindings(),
        "authority": {
            "paper_read_release_qualified": True,
            "runtime_deployed": False,
            "sandbox_or_live_read": False,
            "command_or_mutation": False,
            "projection_writer": False,
            "trading_system_change": False,
        },
        "rollback": {
            "scope": "PAPER_PROFILE_ONLY",
            "control_api_flag": "CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_PAPER=false",
            "edge_flag": "EDGE_MANAGER_V2_READ_ENABLED=false",
            "database_action": "NONE",
            "runbook": RUNBOOK_REL,
            "runbook_sha256": digest(ROOT / RUNBOOK_REL),
            "previous_release_sha256": previous,
        },
    }
    write_pack(args.output_dir.resolve(), payload)
    verify(args.output_dir.resolve(), n14b_pack, n14a_pack)
    return {"decision": payload["decision"], "screen_count": 4, "runtime_deployed": False, "sha256": digest(args.output_dir.resolve() / OUTPUT_NAME)}


def verify(pack: pathlib.Path, n14b_pack: pathlib.Path, n14a_pack: pathlib.Path) -> dict[str, Any]:
    payload = read_json(pack / OUTPUT_NAME)
    lineage = verify_n14b(n14b_pack, n14a_pack)
    source_map = read_json(ROOT / SOURCE_MAP_REL)
    target = target_from_source_map(source_map)
    profile = validated_profile(target)
    expected = {
        "schema_version", "phase", "decision", "portal_source_commit", "n14b_lineage", "image_bindings",
        "source_map", "profile", "candidate_flags", "file_bindings", "authority", "rollback",
    }
    if set(payload) != expected or payload["schema_version"] != "portal.full-paper-read-release.v1" or payload["phase"] != "N22" or payload["decision"] != "N22_FULL_PAPER_READ_RELEASE_QUALIFIED":
        raise N22ReleaseError("N22 release identity or keys drifted")
    if payload["portal_source_commit"] != lineage["portal_source_commit"] or payload["image_bindings"] != lineage["image_bindings"]:
        raise N22ReleaseError("immutable N14B image/source lineage drifted")
    if payload["n14b_lineage"] != {"file": N14B_OUTPUT, "sha256": digest(n14b_pack / N14B_OUTPUT)}:
        raise N22ReleaseError("N14B manifest reference drifted")
    if payload["source_map"] != {"file": SOURCE_MAP_REL, "sha256": digest(ROOT / SOURCE_MAP_REL)} or payload["profile"] != target:
        raise N22ReleaseError("N22 current-source scope drifted")
    if payload["candidate_flags"] != profile["candidate_flags"] or payload["file_bindings"] != file_bindings():
        raise N22ReleaseError("N22 flags or bound bytes drifted")
    if payload["authority"] != {"paper_read_release_qualified": True, "runtime_deployed": False, "sandbox_or_live_read": False, "command_or_mutation": False, "projection_writer": False, "trading_system_change": False}:
        raise N22ReleaseError("N22 authority widened")
    rollback = payload["rollback"]
    if rollback.get("scope") != "PAPER_PROFILE_ONLY" or rollback.get("database_action") != "NONE" or rollback.get("runbook_sha256") != digest(ROOT / RUNBOOK_REL) or SHA256.fullmatch(rollback.get("previous_release_sha256", "")) is None:
        raise N22ReleaseError("N22 rollback contract drifted")
    expected_sum = f"{digest(pack / OUTPUT_NAME).split(':', 1)[1]}  {OUTPUT_NAME}\n"
    if (pack / "SHA256SUMS").read_text(encoding="utf-8") != expected_sum:
        raise N22ReleaseError("N22 checksum drifted")
    return payload


def parser() -> argparse.ArgumentParser:
    cli = argparse.ArgumentParser(description=__doc__)
    commands = cli.add_subparsers(dest="command", required=True)
    generate_command = commands.add_parser("generate")
    generate_command.add_argument("--n14a-pack-dir", type=pathlib.Path, required=True)
    generate_command.add_argument("--n14b-pack-dir", type=pathlib.Path, required=True)
    generate_command.add_argument("--output-dir", type=pathlib.Path, required=True)
    generate_command.add_argument("--previous-release-sha256", default=ZERO_DIGEST)
    verify_command = commands.add_parser("verify")
    verify_command.add_argument("--n14a-pack-dir", type=pathlib.Path, required=True)
    verify_command.add_argument("--n14b-pack-dir", type=pathlib.Path, required=True)
    verify_command.add_argument("--pack-dir", type=pathlib.Path, required=True)
    return cli


def main() -> int:
    args = parser().parse_args()
    try:
        result = generate(args) if args.command == "generate" else {
            "decision": verify(args.pack_dir.resolve(), args.n14b_pack_dir.resolve(), args.n14a_pack_dir.resolve())["decision"],
            "runtime_deployed": False,
            "sha256": digest(args.pack_dir.resolve() / OUTPUT_NAME),
        }
    except N22ReleaseError as exc:
        print(f"N22_REJECTED: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
