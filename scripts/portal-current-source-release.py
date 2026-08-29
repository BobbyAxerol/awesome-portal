#!/usr/bin/env python3
"""N14B immutable current-source compatibility adjunct.

The adjunct never edits or widens the N14A release manifest.  It binds one
accepted N13B profile/screen set to the exact signed Portal image set and
current Trading System evidence.  Compatibility is not runtime activation.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import pathlib
import re
import stat
import sys
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parent.parent
MANIFEST_DIR = ROOT / "deploy/manifests"
SOURCE_MAP_REL = "services/portal-execution-edge-rs/contracts/current-source-v1/capability-source-map.json"
PROFILE_REL = "deploy/manifests/current-source-paper-release-profile.v1.json"
RUNBOOK_REL = "deploy/runbooks/portal-n14b-current-source-release-and-rollback.md"
N14A_MANIFEST_REL = "release-manifest.json"
OUTPUT_NAME = "current-source-release-compatibility.json"
ZERO_DIGEST = "sha256:" + "0" * 64
SHA256 = re.compile(r"sha256:[0-9a-f]{64}")
COMMIT = re.compile(r"[0-9a-f]{40}")
IMAGE = re.compile(r"[a-z0-9][a-z0-9._/-]*@(?P<digest>sha256:[0-9a-f]{64})")
MAX_JSON_BYTES = 16 * 1024 * 1024

ADAPTER_FILES = (
    "apps/control-api/src/config.ts",
    "apps/control-api/src/execution/current-source.controller.ts",
    "apps/control-api/src/execution/current-source.proxy.ts",
    "apps/control-api/src/execution/delegation.ts",
    "deploy/compose.execution-current-source.yaml",
    "deploy/compose.execution-edge.yaml",
    "deploy/execution-manager-v2/compose.profile-read.yaml",
    "services/portal-execution-edge-rs/Cargo.lock",
    "services/portal-execution-edge-rs/contracts/current-source-v1/capability-source-map.json",
    "services/portal-execution-edge-rs/crates/current-source-compat/Cargo.toml",
    "services/portal-execution-edge-rs/crates/current-source-compat/src/lib.rs",
    "services/portal-execution-edge-rs/crates/current-source-compat/src/tests.rs",
    "services/portal-execution-edge-rs/crates/edge-service/src/main.rs",
)

AUTHORITY = {
    "current_source_release_compatible": True,
    "runtime_deployed": False,
    "registry_promoted": False,
    "source_activation": False,
    "query_activation": False,
    "sse_activation": False,
    "command_activation": False,
    "trading_system_release": False,
    "database_copy_between_channels": False,
}

ROLLBACK = {
    "scope": "PAPER_PROFILE_ONLY",
    "disable_control_api_flag": "CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_PAPER=false",
    "disable_edge_flag": "EDGE_MANAGER_V2_READ_ENABLED=false",
    "stop_project": "portal-execution-edge-paper",
    "sibling_profiles_unchanged": ["SANDBOX", "LIVE"],
    "database_action": "NONE",
    "forward_fix": "REGENERATE_FROM_NEXT_SIGNED_N14A_MANIFEST",
    "runbook": RUNBOOK_REL,
}

SENSITIVE_KEYS = {
    "password", "secret", "token", "api_key", "private_key", "credential",
    "cookie", "authorization", "database_url", "dsn", "redis_url", "broker_key",
}


class CompatibilityError(ValueError):
    """Stable fail-closed N14B rejection."""


def _duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise CompatibilityError("JSON contains a duplicate object key")
        result[key] = value
    return result


def reject_sensitive(value: Any) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = key.lower().replace("-", "_")
            if normalized in SENSITIVE_KEYS and child not in (False, None, "", "REDACTED"):
                raise CompatibilityError("compatibility pack contains secret-shaped material")
            reject_sensitive(child)
    elif isinstance(value, list):
        for child in value:
            reject_sensitive(child)


def read_json(path: pathlib.Path, maximum: int = MAX_JSON_BYTES) -> dict[str, Any]:
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise CompatibilityError(f"required compatibility artifact is missing: {path.name}") from exc
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise CompatibilityError("compatibility artifacts must be regular non-symlinks")
    if metadata.st_size <= 0 or metadata.st_size > maximum:
        raise CompatibilityError("compatibility artifact size is outside the declared bound")
    try:
        payload = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_duplicates)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CompatibilityError(f"invalid JSON compatibility artifact: {path.name}") from exc
    if not isinstance(payload, dict):
        raise CompatibilityError("compatibility artifact must be an object")
    reject_sensitive(payload)
    return payload


def write_json(path: pathlib.Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def digest(path: pathlib.Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def exact(payload: dict[str, Any], keys: set[str], label: str) -> None:
    if set(payload) != keys:
        raise CompatibilityError(f"{label} schema keys are not exact")


def valid_digest(value: Any, *, allow_zero: bool = False) -> bool:
    return (
        isinstance(value, str)
        and SHA256.fullmatch(value) is not None
        and (allow_zero or value != ZERO_DIGEST)
    )


def load_n14a_module() -> Any:
    path = ROOT / "scripts/portal-release-authority.py"
    spec = importlib.util.spec_from_file_location("portal_release_authority", path)
    if spec is None or spec.loader is None:
        raise CompatibilityError("N14A release authority module cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def accepted_paper_target(source_map: dict[str, Any]) -> dict[str, Any]:
    exact(
        source_map,
        {"contract_version", "phase", "pins", "profiles", "source_bindings", "capabilities", "screens"},
        "current-source map",
    )
    if source_map["contract_version"] != "portal.execution.current-source-map.v1" or source_map["phase"] != "N13B":
        raise CompatibilityError("N13B current-source identity drifted")

    profiles = [row for row in source_map["profiles"] if row.get("profile") == "PAPER"]
    screens = [row for row in source_map["screens"] if row.get("screen_id") == "PAPER_TRADING_SCREEN"]
    if len(profiles) != 1 or len(screens) != 1:
        raise CompatibilityError("exact Paper profile and first screen are required")
    profile = profiles[0]
    if profile != {
        "profile": "PAPER",
        "manager_profile_id": "PAPER_BINANCE_USDM",
        "source_profile": "PAPER",
        "baseline": "CONNECTED",
    }:
        raise CompatibilityError("Paper profile identity drifted")
    screen = screens[0]
    if screen.get("action_capabilities") != []:
        raise CompatibilityError("first Paper release must remain read-only")

    capability_by_id = {row.get("id"): row for row in source_map["capabilities"]}
    capability_ids = screen.get("read_capabilities")
    if not isinstance(capability_ids, list) or any(value not in capability_by_id for value in capability_ids):
        raise CompatibilityError("Paper screen capability set is incomplete")
    capabilities = [capability_by_id[value] for value in capability_ids]
    if any(row.get("kind") != "READ" for row in capabilities):
        raise CompatibilityError("Paper release contains a non-read capability")
    if any(row.get("classification") not in {"CONNECTED", "DERIVED_FROM_EXISTING_SOURCE"} for row in capabilities):
        raise CompatibilityError("Paper release contains an unaccepted source classification")

    source_ids = sorted({source for row in capabilities for source in row.get("source_bindings", [])})
    source_by_id = {row.get("id"): row for row in source_map["source_bindings"]}
    if any(source not in source_by_id for source in source_ids):
        raise CompatibilityError("Paper release source set is incomplete")
    if any(source_by_id[source].get("adapter") != "MANAGER_V2" for source in source_ids):
        raise CompatibilityError("first Paper release must use only qualified Manager-v2 reads")
    if any("PAPER" not in source_by_id[source].get("profiles", []) for source in source_ids):
        raise CompatibilityError("Paper release source is not Paper-scoped")

    return {
        "profile": "PAPER",
        "environment": "paper",
        "manager_profile_id": "PAPER_BINANCE_USDM",
        "delegation_audience": "portal-execution-edge-paper",
        "screen_ids": ["PAPER_TRADING_SCREEN"],
        "capability_ids": capability_ids,
        "source_binding_ids": source_ids,
    }


def validate_profile_definition(payload: dict[str, Any], target: dict[str, Any]) -> dict[str, Any]:
    exact(
        payload,
        {
            "schema_version", "phase", "profile", "environment", "manager_profile_id",
            "delegation_audience", "screen_ids", "capability_ids", "source_binding_ids",
            "candidate_flags", "phase_authorization",
        },
        "current-source profile definition",
    )
    for key, value in target.items():
        if payload.get(key) != value:
            raise CompatibilityError(f"Paper profile definition drifted: {key}")
    if payload["schema_version"] != "portal.current-source-release-profile.v1" or payload["phase"] != "N14B":
        raise CompatibilityError("Paper release profile revision drifted")
    expected_flags = {
        "control_api_current_source_paper": True,
        "control_api_current_source_sandbox": False,
        "control_api_current_source_live": False,
        "edge_manager_v2_read": True,
        "edge_source_probes": False,
        "edge_projection_ingestion": False,
        "edge_realtime_sse": False,
        "edge_analytics_query": False,
        "edge_shadow_query": False,
        "edge_command_relay": False,
    }
    if payload["candidate_flags"] != expected_flags:
        raise CompatibilityError("Paper candidate flags widened authority")
    expected_authorization = {
        "decision": "BOBBY_APPROVED_N14B_IMPLEMENTATION",
        "scope": "PAPER_CURRENT_SOURCE_RELEASE_COMPATIBILITY",
        "runtime_deploy_authorized": False,
        "registry_promotion_authorized": False,
        "trading_system_change_authorized": False,
    }
    if payload["phase_authorization"] != expected_authorization:
        raise CompatibilityError("N14B phase authorization drifted")
    return payload


def adapter_file_bindings() -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for relative in ADAPTER_FILES:
        path = ROOT / relative
        if not path.is_file() or path.is_symlink():
            raise CompatibilityError(f"adapter file is missing or unsafe: {relative}")
        rows.append({"file": relative, "sha256": digest(path)})
    return rows


def validated_n14a(pack: pathlib.Path) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    manifest_path = pack / N14A_MANIFEST_REL
    manifest = read_json(manifest_path)
    module = load_n14a_module()
    try:
        services, _evidence = module.validate_manifest(pack, manifest, "candidate")
    except Exception as exc:  # N14A has its own stable error vocabulary.
        raise CompatibilityError(f"N14A candidate is not accepted: {exc}") from exc
    return manifest, services


def image_binding(row: dict[str, Any]) -> dict[str, str]:
    image = row.get("image")
    match = IMAGE.fullmatch(image) if isinstance(image, str) else None
    if match is None or row.get("image_digest") != match.group("digest"):
        raise CompatibilityError("N14A image binding is not immutable")
    return {"image": image, "digest": match.group("digest")}


def generate(args: argparse.Namespace) -> dict[str, Any]:
    pack = args.n14a_pack_dir.resolve()
    output = args.output_dir.resolve()
    if output.exists() and any(output.iterdir()):
        raise CompatibilityError("N14B output directory must be empty")
    output.mkdir(parents=True, exist_ok=True)

    n14a_manifest, services = validated_n14a(pack)
    source_map_path = ROOT / SOURCE_MAP_REL
    source_map = read_json(source_map_path)
    target = accepted_paper_target(source_map)
    profile_path = ROOT / PROFILE_REL
    profile = validate_profile_definition(read_json(profile_path), target)

    previous = args.previous_compatibility_sha256
    if previous != ZERO_DIGEST and not valid_digest(previous):
        raise CompatibilityError("previous compatibility digest is invalid")

    payload = {
        "schema_version": "portal.current-source-release-compatibility.v1",
        "phase": "N14B",
        "decision": "N14B_COMPATIBLE_NOT_ACTIVATED",
        "portal_source_commit": n14a_manifest["source_commit"],
        "n14a_release_manifest": {"file": N14A_MANIFEST_REL, "sha256": digest(pack / N14A_MANIFEST_REL)},
        "source_map": {
            "file": SOURCE_MAP_REL,
            "sha256": digest(source_map_path),
            "contract_version": source_map["contract_version"],
        },
        "profile_definition": {"file": PROFILE_REL, "sha256": digest(profile_path)},
        "adapter_files": adapter_file_bindings(),
        "image_bindings": {
            service: image_binding(services[service])
            for service in ("control-api", "execution-edge", "source-proxy")
        },
        "source_pins": source_map["pins"],
        "profile": target,
        "candidate_flags": profile["candidate_flags"],
        "authority": AUTHORITY,
        "rollback": {
            **ROLLBACK,
            "runbook_sha256": digest(ROOT / RUNBOOK_REL),
            "previous_compatibility_sha256": previous,
        },
    }
    write_json(output / OUTPUT_NAME, payload)
    (output / "SHA256SUMS").write_text(
        f"{digest(output / OUTPUT_NAME).split(':', 1)[1]}  {OUTPUT_NAME}\n",
        encoding="utf-8",
    )
    verify_pack(output, pack)
    return {
        "decision": payload["decision"],
        "profile": payload["profile"]["profile"],
        "screen_count": len(payload["profile"]["screen_ids"]),
        "capability_count": len(payload["profile"]["capability_ids"]),
        "runtime_deployed": False,
        "sha256": digest(output / OUTPUT_NAME),
    }


def verify_pack(pack: pathlib.Path, n14a_pack: pathlib.Path) -> dict[str, Any]:
    path = pack / OUTPUT_NAME
    payload = read_json(path)
    exact(
        payload,
        {
            "schema_version", "phase", "decision", "portal_source_commit",
            "n14a_release_manifest", "source_map", "profile_definition", "adapter_files",
            "image_bindings", "source_pins", "profile", "candidate_flags", "authority", "rollback",
        },
        "N14B compatibility adjunct",
    )
    if payload["schema_version"] != "portal.current-source-release-compatibility.v1" or payload["phase"] != "N14B" or payload["decision"] != "N14B_COMPATIBLE_NOT_ACTIVATED":
        raise CompatibilityError("N14B compatibility identity drifted")
    if COMMIT.fullmatch(payload["portal_source_commit"] or "") is None:
        raise CompatibilityError("Portal source commit is invalid")

    manifest, services = validated_n14a(n14a_pack)
    manifest_ref = payload["n14a_release_manifest"]
    exact(manifest_ref, {"file", "sha256"}, "N14A manifest reference")
    if manifest_ref != {"file": N14A_MANIFEST_REL, "sha256": digest(n14a_pack / N14A_MANIFEST_REL)}:
        raise CompatibilityError("N14B is not bound to the exact N14A manifest")
    if payload["portal_source_commit"] != manifest["source_commit"]:
        raise CompatibilityError("N14B and N14A source commits differ")

    source_map_path = ROOT / SOURCE_MAP_REL
    source_map = read_json(source_map_path)
    target = accepted_paper_target(source_map)
    expected_source_ref = {
        "file": SOURCE_MAP_REL,
        "sha256": digest(source_map_path),
        "contract_version": source_map["contract_version"],
    }
    if payload["source_map"] != expected_source_ref or payload["source_pins"] != source_map["pins"]:
        raise CompatibilityError("current-source set or owner pins drifted")
    profile_path = ROOT / PROFILE_REL
    profile = validate_profile_definition(read_json(profile_path), target)
    if payload["profile_definition"] != {"file": PROFILE_REL, "sha256": digest(profile_path)}:
        raise CompatibilityError("profile definition digest drifted")
    if payload["profile"] != target or payload["candidate_flags"] != profile["candidate_flags"]:
        raise CompatibilityError("Paper candidate scope drifted")

    if payload["adapter_files"] != adapter_file_bindings():
        raise CompatibilityError("Portal adapter file binding drifted")
    expected_images = {
        service: image_binding(services[service])
        for service in ("control-api", "execution-edge", "source-proxy")
    }
    if payload["image_bindings"] != expected_images:
        raise CompatibilityError("Portal image compatibility binding drifted")
    if payload["authority"] != AUTHORITY:
        raise CompatibilityError("N14B authority widened runtime or external scope")

    rollback = payload["rollback"]
    exact(
        rollback,
        set(ROLLBACK) | {"runbook_sha256", "previous_compatibility_sha256"},
        "N14B rollback",
    )
    if any(rollback[key] != value for key, value in ROLLBACK.items()):
        raise CompatibilityError("profile-scoped rollback contract drifted")
    if rollback["runbook_sha256"] != digest(ROOT / RUNBOOK_REL):
        raise CompatibilityError("profile-scoped rollback runbook drifted")
    if not valid_digest(rollback["previous_compatibility_sha256"], allow_zero=True):
        raise CompatibilityError("previous compatibility digest is invalid")

    sums = (pack / "SHA256SUMS")
    if not sums.is_file() or sums.is_symlink():
        raise CompatibilityError("N14B checksum file is missing or unsafe")
    expected_sum = f"{digest(path).split(':', 1)[1]}  {OUTPUT_NAME}\n"
    if sums.read_text(encoding="utf-8") != expected_sum:
        raise CompatibilityError("N14B checksum file drifted")
    return payload


def rehearse(args: argparse.Namespace) -> dict[str, Any]:
    current = verify_pack(args.pack_dir.resolve(), args.n14a_pack_dir.resolve())
    result = {
        "decision": "N14B_PROFILE_RELEASE_REHEARSAL_PASSED",
        "profile": "PAPER",
        "preflight": "PASS",
        "candidate_render": "PASS",
        "rollback": "PASS",
        "forward_fix": "NOT_SUPPLIED",
        "runtime_deployed": False,
        "source_traffic": False,
    }
    if args.forward_pack_dir is not None:
        if args.forward_n14a_pack_dir is None:
            raise CompatibilityError("forward rehearsal requires the matching N14A pack")
        forward = verify_pack(args.forward_pack_dir.resolve(), args.forward_n14a_pack_dir.resolve())
        current_digest = digest(args.pack_dir.resolve() / OUTPUT_NAME)
        if forward["rollback"]["previous_compatibility_sha256"] != current_digest:
            raise CompatibilityError("forward-fix pack is not chained to the prior compatibility")
        if forward["profile"] != current["profile"] or forward["source_map"] != current["source_map"] or forward["source_pins"] != current["source_pins"]:
            raise CompatibilityError("forward-fix widened or changed the accepted source set")
        if forward["portal_source_commit"] == current["portal_source_commit"]:
            raise CompatibilityError("forward-fix did not advance immutable Portal bytes")
        result["forward_fix"] = "PASS"
    return result


def parser() -> argparse.ArgumentParser:
    cli = argparse.ArgumentParser(description=__doc__)
    sub = cli.add_subparsers(dest="command", required=True)

    generate_cmd = sub.add_parser("generate")
    generate_cmd.add_argument("--n14a-pack-dir", type=pathlib.Path, required=True)
    generate_cmd.add_argument("--output-dir", type=pathlib.Path, required=True)
    generate_cmd.add_argument("--previous-compatibility-sha256", default=ZERO_DIGEST)

    verify_cmd = sub.add_parser("verify")
    verify_cmd.add_argument("--pack-dir", type=pathlib.Path, required=True)
    verify_cmd.add_argument("--n14a-pack-dir", type=pathlib.Path, required=True)

    rehearse_cmd = sub.add_parser("rehearse")
    rehearse_cmd.add_argument("--pack-dir", type=pathlib.Path, required=True)
    rehearse_cmd.add_argument("--n14a-pack-dir", type=pathlib.Path, required=True)
    rehearse_cmd.add_argument("--forward-pack-dir", type=pathlib.Path)
    rehearse_cmd.add_argument("--forward-n14a-pack-dir", type=pathlib.Path)
    return cli


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "generate":
            result = generate(args)
        elif args.command == "verify":
            payload = verify_pack(args.pack_dir.resolve(), args.n14a_pack_dir.resolve())
            result = {
                "decision": payload["decision"],
                "profile": payload["profile"]["profile"],
                "runtime_deployed": payload["authority"]["runtime_deployed"],
                "sha256": digest(args.pack_dir.resolve() / OUTPUT_NAME),
            }
        else:
            result = rehearse(args)
    except CompatibilityError as exc:
        print(f"N14B_REJECTED: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
