#!/usr/bin/env python3
"""Fail-closed verifier for the N12 Trading System command publication pack."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import stat
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parent.parent
REQUEST_DIR = ROOT / "services/portal-execution-edge-rs/contracts/n12-command-relay-v1-request"
REQUEST_REVISION = "portal.execution.command-publication-request.v1"
ZERO_DIGEST = "sha256:" + "0" * 64
ZERO_COMMIT = "0" * 40
SHA256 = re.compile(r"sha256:[0-9a-f]{64}")
COMMIT = re.compile(r"[0-9a-f]{40}")
MAX_FILE_BYTES = 2 * 1024 * 1024
VERIFY_PATH = "/portal/execution/v1/command-operations/{source_operation_id}"

EXPECTED = {
    "paper.halt": (["PAPER"], "R1_PAPER_MUTATION", "PROTECTIVE", ["DEPLOYMENT", "PORTFOLIO"], "/portal/execution/v1/commands/paper/halt", True, True, False, False),
    "paper.cancel-open-orders": (["PAPER"], "R1_PAPER_MUTATION", "PROTECTIVE", ["ACCOUNT", "DEPLOYMENT", "PORTFOLIO"], "/portal/execution/v1/commands/paper/cancel-open-orders", True, True, False, False),
    "sandbox.halt": (["SANDBOX"], "R2_SANDBOX", "PROTECTIVE", ["DEPLOYMENT", "PORTFOLIO"], "/portal/execution/v1/commands/sandbox/halt", True, True, True, False),
    "sandbox.cancel-open-orders": (["SANDBOX"], "R2_SANDBOX", "PROTECTIVE", ["ACCOUNT", "DEPLOYMENT", "PORTFOLIO"], "/portal/execution/v1/commands/sandbox/cancel-open-orders", True, True, True, False),
    "live.halt": (["LIVE_CANARY", "LIVE_FULL"], "R3_LIVE_PROTECTIVE", "PROTECTIVE", ["DEPLOYMENT", "PORTFOLIO"], "/portal/execution/v1/commands/live/halt", True, True, True, False),
    "live.reduce": (["LIVE_CANARY", "LIVE_FULL"], "R3_LIVE_PROTECTIVE", "PROTECTIVE", ["ACCOUNT", "DEPLOYMENT", "PORTFOLIO"], "/portal/execution/v1/commands/live/reduce", False, False, True, False),
    "live.emergency-close": (["LIVE_CANARY", "LIVE_FULL"], "R3_LIVE_PROTECTIVE", "PROTECTIVE", ["ACCOUNT", "DEPLOYMENT", "PORTFOLIO"], "/portal/execution/v1/commands/live/emergency-close", False, False, True, False),
    "live.resume": (["LIVE_CANARY", "LIVE_FULL"], "R4_LIVE_RISK_INCREASING", "RISK_INCREASING", ["DEPLOYMENT", "PORTFOLIO"], "/portal/execution/v1/commands/live/resume", True, False, True, True),
    "live.scale": (["LIVE_CANARY", "LIVE_FULL"], "R4_LIVE_RISK_INCREASING", "RISK_INCREASING", ["ACCOUNT", "DEPLOYMENT", "PORTFOLIO"], "/portal/execution/v1/commands/live/scale", True, False, True, True),
}

ACCEPTANCE_CASES = {
    "exact_routes_and_bounded_transport",
    "mtls_and_one_operation_jwt_positive",
    "identity_scope_audience_expiry_negative_matrix",
    "risk_step_up_sod_and_dual_approval_matrix",
    "request_key_duplicate_and_payload_conflict",
    "accepted_202_is_nonterminal",
    "terminal_status_and_receipt_corpus",
    "timeout_disconnect_unknown_become_uncertain",
    "uncertain_same_target_policy",
    "restart_replay_and_reconciliation",
    "broker_source_loss_and_recovery",
    "independent_command_kill_switch",
    "no_database_redis_cli_or_broker_authority",
    "rollback_revokes_command_identity_only",
}

NEGATIVE_CASES = {
    "missing_mtls", "wrong_command_identity", "read_identity_used_for_command",
    "expired_delegated_jwt", "wrong_audience", "wrong_operation_id",
    "wrong_payload_hash", "wrong_workspace", "wrong_environment", "wrong_target",
    "stale_expected_version", "missing_step_up", "same_actor_dual_approval",
    "request_key_payload_conflict", "duplicate_delivery", "accepted_202_nonterminal",
    "timeout_uncertain", "disconnect_uncertain", "unknown_status_uncertain",
    "restart_replay", "same_target_r4_blocked_by_uncertain",
    "unsafe_protective_blocked_by_uncertain", "broker_or_source_loss",
    "redirect_denied", "request_over_limit", "response_over_limit",
    "command_kill_switch", "rollback_command_identity_revoked",
}


class PublicationError(ValueError):
    """Stable N12 publication rejection."""


def _duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise PublicationError("JSON contains a duplicate object key")
        result[key] = value
    return result


def read_json(path: pathlib.Path, maximum_bytes: int = MAX_FILE_BYTES) -> dict[str, Any]:
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise PublicationError(f"required file is missing: {path.name}") from exc
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise PublicationError("owner artifacts must be regular non-symlinks")
    if metadata.st_size <= 0 or metadata.st_size > maximum_bytes:
        raise PublicationError("owner artifact size is outside the declared bound")
    try:
        value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_duplicates)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PublicationError(f"invalid JSON: {path.name}") from exc
    if not isinstance(value, dict):
        raise PublicationError(f"{path.name} must be an object")
    return value


def digest(path: pathlib.Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def exact(value: dict[str, Any], keys: set[str], label: str) -> None:
    if set(value) != keys:
        raise PublicationError(f"{label} schema keys are not exact")


def valid_digest(value: Any, allow_zero: bool) -> bool:
    return isinstance(value, str) and SHA256.fullmatch(value) is not None and (allow_zero or value != ZERO_DIGEST)


def validate_catalogue(payload: dict[str, Any], mode: str) -> dict[str, dict[str, Any]]:
    exact(payload, {"schema_version", "request_revision", "source_contract_revision", "source_contract_commit", "owner_id", "owner_accepted", "partial_publication", "authority", "capabilities"}, "catalogue")
    if payload["schema_version"] != "trading-system.portal-command-publication.v1" or payload["request_revision"] != REQUEST_REVISION:
        raise PublicationError("catalogue identity mismatch")
    if not isinstance(payload["owner_id"], str) or not payload["owner_id"].strip():
        raise PublicationError("owner identity is missing")
    if type(payload["partial_publication"]) is not bool:
        raise PublicationError("partial publication flag is invalid")
    if mode == "template":
        if payload["owner_accepted"] is not False or payload["source_contract_revision"] != "UNPUBLISHED" or payload["source_contract_commit"] != ZERO_COMMIT:
            raise PublicationError("template must remain non-authoritative")
    else:
        if payload["source_contract_revision"] in {"", "UNPUBLISHED"} or not isinstance(payload["source_contract_revision"], str):
            raise PublicationError("source contract revision is unpublished")
        if not isinstance(payload["source_contract_commit"], str) or COMMIT.fullmatch(payload["source_contract_commit"]) is None or payload["source_contract_commit"] == ZERO_COMMIT:
            raise PublicationError("source contract commit is invalid")
        if mode == "acceptance" and payload["owner_accepted"] is not True:
            raise PublicationError("owner has not accepted the publication")
    if payload["authority"] != {
        "dedicated_command_identity": True,
        "separate_from_read_identity": True,
        "portal_database_credential": False,
        "portal_redis_authority": False,
        "portal_cli_authority": False,
        "portal_broker_authority": False,
    }:
        raise PublicationError("command publication authority widened or reused read identity")
    rows = payload["capabilities"]
    if not isinstance(rows, list) or not rows:
        raise PublicationError("command catalogue is empty")
    result: dict[str, dict[str, Any]] = {}
    row_keys = {"id", "environments", "risk_tier", "effect", "target_types", "apply_method", "apply_path", "verify_method", "verify_path", "authentication", "source_idempotent", "monotonic_protection", "requires_webauthn", "requires_dual_approval", "maximum_request_bytes", "maximum_response_bytes", "request_schema_sha256", "receipt_schema_sha256", "published", "portal_reachable"}
    for item in rows:
        if not isinstance(item, dict):
            raise PublicationError("capability must be an object")
        exact(item, row_keys, "capability")
        identifier = item["id"]
        if identifier not in EXPECTED or identifier in result:
            raise PublicationError("capability is unknown or duplicated")
        expected = EXPECTED[identifier]
        actual = (item["environments"], item["risk_tier"], item["effect"], item["target_types"], item["apply_path"], item["source_idempotent"], item["monotonic_protection"], item["requires_webauthn"], item["requires_dual_approval"])
        if actual != expected:
            raise PublicationError(f"capability safety semantics drifted: {identifier}")
        if item["apply_method"] != "POST" or item["verify_method"] != "GET" or item["verify_path"] != VERIFY_PATH or item["authentication"] != "MTLS_AND_ONE_OPERATION_DELEGATED_JWT":
            raise PublicationError(f"capability route/auth drifted: {identifier}")
        if type(item["maximum_request_bytes"]) is not int or not 0 < item["maximum_request_bytes"] <= 65_536 or type(item["maximum_response_bytes"]) is not int or not 0 < item["maximum_response_bytes"] <= 1_048_576:
            raise PublicationError(f"capability transport bound is invalid: {identifier}")
        allow_zero = mode == "template" or not item["published"]
        if not valid_digest(item["request_schema_sha256"], allow_zero) or not valid_digest(item["receipt_schema_sha256"], allow_zero):
            raise PublicationError(f"capability schema digest is invalid: {identifier}")
        if item["portal_reachable"] and not item["published"]:
            raise PublicationError("unpublished command cannot be reachable")
        if mode == "template" and (item["published"] or item["portal_reachable"]):
            raise PublicationError("template cannot publish a command")
        if mode == "acceptance" and item["published"] != item["portal_reachable"]:
            raise PublicationError("accepted published command must be reachable")
        result[identifier] = item
    if set(result) != set(EXPECTED):
        raise PublicationError("catalogue must declare all requested capabilities")
    published = {key for key, value in result.items() if value["published"]}
    if mode != "template" and not published:
        raise PublicationError("owner publication contains no command")
    if mode != "template" and (published != set(EXPECTED)) != payload["partial_publication"]:
        raise PublicationError("partial publication declaration is inconsistent")
    return result


def artifact_path(pack: pathlib.Path, relative: str) -> pathlib.Path:
    posix = pathlib.PurePosixPath(relative)
    if posix.is_absolute() or ".." in posix.parts or len(posix.parts) != 2 or posix.parts[0] not in {"schemas", "fixtures"}:
        raise PublicationError("corpus artifact path is unsafe")
    directory = pack / posix.parts[0]
    try:
        metadata = directory.lstat()
    except OSError as exc:
        raise PublicationError("corpus artifact directory is missing") from exc
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
        raise PublicationError("corpus artifact directory must be real")
    return pack / relative


def validate_fixture(kind: str, capability: dict[str, Any], payload: dict[str, Any]) -> None:
    forbidden = {"password", "secret", "api_key", "private_key", "access_token", "refresh_token", "dsn", "database_url", "redis_url", "broker_credential"}
    if forbidden.intersection(key.lower() for key in payload):
        raise PublicationError("fixture contains a secret-shaped field")
    identifier = capability["id"]
    if payload.get("capability_id") != identifier:
        raise PublicationError("fixture capability identity mismatch")
    if kind == "request":
        required = {"schema_version", "capability_id", "operation_id", "request_key", "payload_hash", "environment", "target_type", "target_id", "expected_target_version", "actor_id", "risk_tier", "expires_at"}
        if set(payload) != required or not valid_digest(payload.get("payload_hash"), False) or payload.get("risk_tier") != capability["risk_tier"] or payload.get("environment") not in capability["environments"] or payload.get("target_type") not in capability["target_types"]:
            raise PublicationError("request fixture is not exact")
    elif kind == "accepted":
        required = {"schema_version", "capability_id", "source_operation_id", "status", "accepted_at", "trace_id"}
        if set(payload) != required or payload.get("status") != "ACCEPTED_NONTERMINAL":
            raise PublicationError("accepted fixture must remain nonterminal")
    else:
        required = {"schema_version", "capability_id", "source_operation_id", "status", "terminal_at", "trace_id"}
        if set(payload) != required or payload.get("status") not in {"SUCCEEDED", "FAILED", "DENIED", "PARTIAL"}:
            raise PublicationError("terminal fixture status is invalid")


def validate_corpus(pack: pathlib.Path, payload: dict[str, Any], capabilities: dict[str, dict[str, Any]], mode: str) -> None:
    required = {"schema_version", "request_revision", "synthetic_non_business_data", "contains_secret_or_credential", "accepted_is_nonterminal", "terminal_statuses", "uncertain_requires_reconciliation", "required_capability_ids", "required_negative_cases", "files"}
    exact(payload, required, "terminal corpus")
    if payload["schema_version"] != "trading-system.portal-command-terminal-corpus-index.v1" or payload["request_revision"] != REQUEST_REVISION or payload["synthetic_non_business_data"] is not True or payload["contains_secret_or_credential"] is not False or payload["accepted_is_nonterminal"] is not True or payload["uncertain_requires_reconciliation"] is not True:
        raise PublicationError("terminal corpus safety identity is invalid")
    if payload["terminal_statuses"] != ["SUCCEEDED", "FAILED", "DENIED", "PARTIAL"] or set(payload["required_capability_ids"]) != set(EXPECTED) or set(payload["required_negative_cases"]) != NEGATIVE_CASES:
        raise PublicationError("terminal or negative corpus coverage drifted")
    files = payload["files"]
    if not isinstance(files, dict):
        raise PublicationError("terminal corpus files must be an object")
    published = {key for key, value in capabilities.items() if value["published"]}
    if mode == "template":
        if files:
            raise PublicationError("template corpus cannot claim files")
        return
    if set(files) != published:
        raise PublicationError("corpus files do not match published commands")
    file_keys = {"request_schema_file", "request_schema_sha256", "receipt_schema_file", "receipt_schema_sha256", "request_fixture_file", "request_fixture_sha256", "accepted_fixture_file", "accepted_fixture_sha256", "terminal_fixture_file", "terminal_fixture_sha256"}
    for identifier, index in files.items():
        if not isinstance(index, dict):
            raise PublicationError("corpus index entry must be an object")
        exact(index, file_keys, "corpus index entry")
        capability = capabilities[identifier]
        for prefix in ("request_schema", "receipt_schema", "request_fixture", "accepted_fixture", "terminal_fixture"):
            path = artifact_path(pack, index[f"{prefix}_file"])
            read_json(path)
            actual = digest(path)
            if actual != index[f"{prefix}_sha256"]:
                raise PublicationError("corpus artifact digest mismatch")
        if index["request_schema_sha256"] != capability["request_schema_sha256"] or index["receipt_schema_sha256"] != capability["receipt_schema_sha256"]:
            raise PublicationError("catalogue/schema digest mismatch")
        validate_fixture("request", capability, read_json(artifact_path(pack, index["request_fixture_file"])))
        validate_fixture("accepted", capability, read_json(artifact_path(pack, index["accepted_fixture_file"])))
        validate_fixture("terminal", capability, read_json(artifact_path(pack, index["terminal_fixture_file"])))


def validate_results(payload: dict[str, Any], mode: str) -> None:
    exact(payload, {"schema_version", "request_revision", "synthetic_example", "cases"}, "acceptance results")
    if payload["schema_version"] != "trading-system.portal-command-acceptance-results.v1" or payload["request_revision"] != REQUEST_REVISION:
        raise PublicationError("acceptance results identity mismatch")
    cases = payload["cases"]
    if not isinstance(cases, list) or {case.get("name") for case in cases if isinstance(case, dict)} != ACCEPTANCE_CASES or len(cases) != len(ACCEPTANCE_CASES):
        raise PublicationError("acceptance case coverage is incomplete")
    for case in cases:
        exact(case, {"name", "passed", "evidence_sha256"}, "acceptance case")
        if type(case["passed"]) is not bool or not valid_digest(case["evidence_sha256"], mode != "acceptance"):
            raise PublicationError("acceptance evidence is invalid")
        if mode == "acceptance" and case["passed"] is not True:
            raise PublicationError("required acceptance case did not pass")
    if mode == "template" and (payload["synthetic_example"] is not True or any(case["passed"] for case in cases)):
        raise PublicationError("template acceptance results are authoritative")
    if mode == "acceptance" and payload["synthetic_example"] is not False:
        raise PublicationError("synthetic acceptance evidence is not accepted")


def validate_manifest(pack: pathlib.Path, payload: dict[str, Any], catalogue: dict[str, Any], mode: str) -> None:
    keys = {"schema_version", "request_revision", "source_contract_revision", "source_contract_commit", "source_image_digest", "owner_id", "owner_accepted", "owner_acceptance_evidence_sha256", "command_capability_catalogue_sha256", "terminal_corpus_index_sha256", "acceptance_results_sha256", "authority"}
    exact(payload, keys, "manifest")
    if payload["schema_version"] != "trading-system.portal-command-publication-manifest.v1" or payload["request_revision"] != REQUEST_REVISION:
        raise PublicationError("manifest identity mismatch")
    if payload["source_contract_revision"] != catalogue["source_contract_revision"] or payload["source_contract_commit"] != catalogue["source_contract_commit"] or payload["owner_id"] != catalogue["owner_id"] or payload["owner_accepted"] != catalogue["owner_accepted"]:
        raise PublicationError("manifest/catalogue identity mismatch")
    if payload["authority"] != {"publication_evidence_only": True, "portal_activation": False, "network_change": False, "read_identity_unchanged": True, "database": False, "redis": False, "cli": False, "broker": False, "paper_runtime": False, "sandbox_runtime": False, "live_runtime": False}:
        raise PublicationError("manifest widened runtime authority")
    if mode == "template":
        for key in keys:
            if key.endswith("sha256") and payload[key] != ZERO_DIGEST:
                raise PublicationError("template manifest digest must be zero")
        return
    hashes = {
        "command_capability_catalogue_sha256": "command-capability-catalogue.json",
        "terminal_corpus_index_sha256": "terminal-corpus-index.json",
        "acceptance_results_sha256": "acceptance-results.json",
    }
    for field, name in hashes.items():
        if payload[field] != digest(pack / name):
            raise PublicationError("manifest file digest mismatch")
    for field in ("source_image_digest", "owner_acceptance_evidence_sha256"):
        if not valid_digest(payload[field], mode != "acceptance"):
            raise PublicationError("manifest evidence digest is invalid")
    if mode == "acceptance" and payload["owner_accepted"] is not True:
        raise PublicationError("manifest owner acceptance is missing")


def validate_template() -> dict[str, Any]:
    catalogue = read_json(REQUEST_DIR / "command-capability-catalogue.example.json")
    capabilities = validate_catalogue(catalogue, "template")
    validate_corpus(REQUEST_DIR, read_json(REQUEST_DIR / "terminal-corpus-index.example.json"), capabilities, "template")
    validate_results(read_json(REQUEST_DIR / "acceptance-results.example.json"), "template")
    validate_manifest(REQUEST_DIR, read_json(REQUEST_DIR / "owner-publication.manifest.example.json"), catalogue, "template")
    return {"decision": "N12_REQUEST_TEMPLATE_VALID", "capability_count": len(capabilities), "owner_accepted": False, "portal_activation": False}


def validate_pack(pack: pathlib.Path, mode: str) -> dict[str, Any]:
    catalogue = read_json(pack / "command-capability-catalogue.json")
    capabilities = validate_catalogue(catalogue, mode)
    validate_corpus(pack, read_json(pack / "terminal-corpus-index.json"), capabilities, mode)
    validate_results(read_json(pack / "acceptance-results.json"), mode)
    validate_manifest(pack, read_json(pack / "owner-publication.manifest.json"), catalogue, mode)
    return {
        "decision": "N12_OWNER_PUBLICATION_ACCEPTED" if mode == "acceptance" else "N12_OWNER_PUBLICATION_CANDIDATE_VALID",
        "published_capability_count": sum(1 for value in capabilities.values() if value["published"]),
        "owner_accepted": catalogue["owner_accepted"],
        "portal_activation": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("template", "candidate", "acceptance"), required=True)
    parser.add_argument("--pack-dir", type=pathlib.Path)
    args = parser.parse_args()
    try:
        if args.mode == "template":
            if args.pack_dir is not None:
                raise PublicationError("template mode does not accept --pack-dir")
            result = validate_template()
        else:
            if args.pack_dir is None:
                raise PublicationError("candidate/acceptance mode requires --pack-dir")
            result = validate_pack(args.pack_dir.resolve(), args.mode)
    except PublicationError as exc:
        print(json.dumps({"decision": "NO_GO", "reason": str(exc)}, sort_keys=True))
        return 1
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
