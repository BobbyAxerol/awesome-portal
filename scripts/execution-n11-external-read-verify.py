#!/usr/bin/env python3
"""Verify the consolidated N11 Trading System read publication fail-closed."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import stat
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parent.parent
REQUEST_DIR = ROOT / "services/portal-execution-edge-rs/contracts/n11-external-read-v1-request"
REQUEST_REVISION = "portal.execution.external-read-request.v1"
PACK_FILES = {
    "capability-catalogue.json",
    "semantic-rulings.json",
    "golden-corpus-index.json",
    "acceptance-results.json",
}
MAX_METADATA_FILE_BYTES = 2 * 1024 * 1024
SHA256 = re.compile(r"sha256:[0-9a-f]{64}")
COMMIT = re.compile(r"[0-9a-f]{40}")
ZERO_DIGEST = "sha256:" + "0" * 64
ZERO_COMMIT = "0" * 40

EXPECTED = {
    "orders.list": ("/portal/execution/v1/orders", 200, 8_388_608),
    "orders.trace": ("/portal/execution/v1/orders/{resource_id}/trace", 200, 2_097_152),
    "orders.legs": ("/portal/execution/v1/order-groups/{resource_id}/legs", 8, 524_288),
    "orders.fills": ("/portal/execution/v1/orders/{resource_id}/fills", 200, 8_388_608),
    "deployments.positions": ("/portal/execution/v1/deployments/{resource_id}/positions", 500, 8_388_608),
    "deployments.execution-quality": ("/portal/execution/v1/deployments/{resource_id}/execution-quality", 12, 2_097_152),
    "deployments.contribution": ("/portal/execution/v1/deployments/{resource_id}/contribution", 400, 2_097_152),
    "bindings.snapshot": ("/portal/execution/v1/broker-bindings/{resource_id}", 50, 2_097_152),
    "bindings.exposure-verdict": ("/portal/execution/v1/broker-bindings/{resource_id}/exposure-verdict", 50, 2_097_152),
    "portfolios.correlation-samples": ("/portal/execution/v1/portfolios/{resource_id}/correlation-samples", 5_000, 8_388_608),
    "venues.calendar": ("/portal/execution/v1/venues/{resource_id}/calendar", 400, 2_097_152),
    "market.ticks": ("/portal/execution/v1/market/ticks", 50, 524_288),
    "market.candles": ("/portal/execution/v1/market/candles", 2_000, 8_388_608),
    "accounts.current": ("/portal/execution/v1/accounts/{resource_id}", 50, 2_097_152),
    "sessions.current": ("/portal/execution/v1/sessions/{resource_id}", 50, 2_097_152),
    "reconciliation.current": ("/portal/execution/v1/reconciliation", 200, 4_194_304),
    "ops.command-journal": ("/portal/execution/v1/ops/command-journal", 200, 4_194_304),
    "ops.findings": ("/portal/execution/v1/ops/findings", 200, 4_194_304),
    "ops.alerts": ("/portal/execution/v1/ops/alerts", 200, 2_097_152),
    "ops.dead-letters": ("/portal/execution/v1/ops/dead-letters", 200, 4_194_304),
    "ops.trace-order": ("/portal/execution/v1/ops/trace-order/{resource_id}", 500, 4_194_304),
    "ops.streams": ("/portal/execution/v1/ops/streams", 200, 2_097_152),
    "ops.alpha-activity": ("/portal/execution/v1/ops/alpha-activity", 200, 4_194_304),
    "ops.redis-retention": ("/portal/execution/v1/ops/redis-retention", 200, 2_097_152),
}

ACCEPTANCE_CASES = {
    "all_published_routes_exact_get_only",
    "mtls_and_delegated_jwt_positive",
    "identity_and_scope_negative_matrix",
    "contract_and_schema_digest_drift_denied",
    "keyset_forward_backward_context_expiry",
    "exact_decimal_and_currency_separation",
    "total_and_filtered_counts_full_population",
    "funnel_and_order_bucket_semantics",
    "binding_exposure_fail_closed",
    "correlation_sample_count_packing",
    "vnm_calendar_session_order_type_semantics",
    "response_count_byte_time_bounds",
    "partial_stale_unavailable_no_false_zero",
    "source_loss_recovery_and_no_blind_retry",
    "no_database_redis_cli_broker_command_authority",
    "rollback_removes_only_n11_locations",
}


class PublicationError(ValueError):
    """Stable N11 owner-publication rejection."""


def _exact(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        raise PublicationError(f"{label} schema keys are not exact")


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise PublicationError(f"{label} must be an object")
    return value


def _no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise PublicationError("JSON contains a duplicate object key")
        result[key] = value
    return result


def read_json(
    path: pathlib.Path, *, maximum_bytes: int = MAX_METADATA_FILE_BYTES
) -> dict[str, Any]:
    try:
        metadata = path.lstat()
    except OSError as exc:
        raise PublicationError(f"required file is missing: {path.name}") from exc
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
        raise PublicationError("owner files must be regular non-symlinks")
    if metadata.st_size <= 0 or metadata.st_size > maximum_bytes:
        raise PublicationError("owner file size is outside the declared bound")
    try:
        value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=_no_duplicates)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PublicationError(f"invalid JSON: {path.name}") from exc
    return _object(value, path.name)


def digest(path: pathlib.Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def _owner_artifact(pack_dir: pathlib.Path, relative_name: str) -> pathlib.Path:
    relative = pathlib.PurePosixPath(relative_name)
    if relative.is_absolute() or ".." in relative.parts or len(relative.parts) != 2:
        raise PublicationError("golden corpus artifact path is unsafe")
    directory = pack_dir / relative.parts[0]
    try:
        metadata = directory.lstat()
    except OSError as exc:
        raise PublicationError("golden corpus artifact directory is missing") from exc
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
        raise PublicationError("golden corpus artifact directory must be a real directory")
    return pack_dir / relative_name


def _reject_secret_shaped_keys(value: Any) -> None:
    forbidden = {
        "password", "secret", "api_key", "private_key", "access_token",
        "refresh_token", "dsn", "database_url", "redis_url",
        "broker_credential", "key_material",
    }
    if isinstance(value, dict):
        for key, child in value.items():
            if key.lower() in forbidden:
                raise PublicationError("positive fixture contains a secret-shaped field")
            _reject_secret_shaped_keys(child)
    elif isinstance(value, list):
        for child in value:
            _reject_secret_shaped_keys(child)


def _validate_positive_fixture(payload: dict[str, Any]) -> None:
    required = {
        "authority", "as_of", "source_sequence", "freshness", "completeness",
        "projection_lag_ms", "trace_id", "data",
    }
    if not required.issubset(payload):
        raise PublicationError("positive fixture lacks the common source envelope")
    if payload["authority"] != "EXECUTION_CELL":
        raise PublicationError("positive fixture authority is not Execution Cell")
    if not isinstance(payload["as_of"], str) or not payload["as_of"].strip():
        raise PublicationError("positive fixture as_of is invalid")
    if type(payload["source_sequence"]) is not int or payload["source_sequence"] < 0:
        raise PublicationError("positive fixture source sequence is invalid")
    if payload["freshness"] not in {"FRESH", "DEGRADED", "STALE", "UNAVAILABLE"}:
        raise PublicationError("positive fixture freshness is invalid")
    if payload["completeness"] not in {"COMPLETE", "PARTIAL", "UNKNOWN"}:
        raise PublicationError("positive fixture completeness is invalid")
    if type(payload["projection_lag_ms"]) is not int or payload["projection_lag_ms"] < 0:
        raise PublicationError("positive fixture projection lag is invalid")
    if not isinstance(payload["trace_id"], str) or not payload["trace_id"].strip():
        raise PublicationError("positive fixture trace ID is invalid")
    _reject_secret_shaped_keys(payload)


def _valid_digest(value: Any, *, allow_zero: bool) -> bool:
    return isinstance(value, str) and SHA256.fullmatch(value) is not None and (
        allow_zero or value != ZERO_DIGEST
    )


def validate_catalogue(payload: dict[str, Any], mode: str) -> dict[str, dict[str, Any]]:
    _exact(
        payload,
        {
            "schema_version", "request_revision", "source_contract_revision",
            "source_contract_commit", "owner_id", "owner_accepted",
            "partial_publication", "authority", "capabilities",
        },
        "capability catalogue",
    )
    if payload["schema_version"] != "trading-system.portal-read-publication.v1" or payload["request_revision"] != REQUEST_REVISION:
        raise PublicationError("capability catalogue identity mismatch")
    if not isinstance(payload["owner_id"], str) or not payload["owner_id"].strip():
        raise PublicationError("owner identity is missing")
    if not isinstance(payload["partial_publication"], bool):
        raise PublicationError("partial publication flag is invalid")
    if mode == "template":
        if payload["owner_accepted"] is not False or payload["source_contract_revision"] != "UNPUBLISHED" or payload["source_contract_commit"] != ZERO_COMMIT:
            raise PublicationError("request template must remain non-authoritative")
    else:
        if not isinstance(payload["source_contract_revision"], str) or payload["source_contract_revision"] in {"", "UNPUBLISHED"}:
            raise PublicationError("source contract revision is not published")
        if not isinstance(payload["source_contract_commit"], str) or COMMIT.fullmatch(payload["source_contract_commit"]) is None or payload["source_contract_commit"] == ZERO_COMMIT:
            raise PublicationError("source contract commit is invalid")
        if mode == "acceptance" and payload["owner_accepted"] is not True:
            raise PublicationError("owner has not accepted the publication")

    authority = _object(payload["authority"], "publication authority")
    expected_authority = {
        "read_only": True,
        "portal_database_credential": False,
        "portal_redis_authority": False,
        "portal_cli_authority": False,
        "portal_broker_authority": False,
        "command_or_mutation": False,
    }
    if authority != expected_authority:
        raise PublicationError("publication widened Portal authority")

    rows = payload["capabilities"]
    if not isinstance(rows, list) or not rows:
        raise PublicationError("capability catalogue is empty")
    capabilities: dict[str, dict[str, Any]] = {}
    for row_value in rows:
        row = _object(row_value, "capability")
        _exact(
            row,
            {
                "id", "method", "path_template", "authentication", "pagination",
                "maximum_page_rows", "maximum_response_bytes", "response_schema_sha256",
                "positive_fixture_sha256", "published", "portal_reachable",
            },
            "capability",
        )
        identifier = row["id"]
        if identifier not in EXPECTED or identifier in capabilities:
            raise PublicationError("capability is unknown or duplicated")
        path, maximum_rows, maximum_bytes = EXPECTED[identifier]
        if (
            row["method"] != "GET"
            or row["path_template"] != path
            or row["authentication"] != "MTLS_AND_DELEGATED_JWT"
            or row["pagination"] not in {"NONE", "KEYSET"}
            or type(row["maximum_page_rows"]) is not int
            or not 0 < row["maximum_page_rows"] <= maximum_rows
            or type(row["maximum_response_bytes"]) is not int
            or not 0 < row["maximum_response_bytes"] <= maximum_bytes
        ):
            raise PublicationError(f"capability route/auth/bounds drifted: {identifier}")
        allow_zero = mode == "template" or not row["published"]
        if not _valid_digest(row["response_schema_sha256"], allow_zero=allow_zero) or not _valid_digest(row["positive_fixture_sha256"], allow_zero=allow_zero):
            raise PublicationError(f"capability evidence digest is invalid: {identifier}")
        if mode == "template" and (row["published"] is not False or row["portal_reachable"] is not False):
            raise PublicationError("request template cannot publish a capability")
        if mode == "acceptance" and (row["published"] is not True or row["portal_reachable"] is not True):
            raise PublicationError("accepted capability is not published and reachable")
        if row["portal_reachable"] and not row["published"]:
            raise PublicationError("unpublished capability cannot be Portal reachable")
        capabilities[identifier] = row
    if not payload["partial_publication"] and set(capabilities) != set(EXPECTED):
        raise PublicationError("complete publication is missing capabilities")
    if mode == "template" and set(capabilities) != set(EXPECTED):
        raise PublicationError("request template must enumerate all capabilities")
    return capabilities


def validate_semantics(payload: dict[str, Any], mode: str) -> None:
    _exact(
        payload,
        {
            "schema_version", "request_revision", "owner_accepted", "order_status_buckets",
            "order_funnel", "binding_exposure", "packed_correlation", "vnm_calendar",
        },
        "semantic rulings",
    )
    if payload["schema_version"] != "trading-system.portal-read-semantic-rulings.v1" or payload["request_revision"] != REQUEST_REVISION:
        raise PublicationError("semantic ruling identity mismatch")
    if mode == "template" and payload["owner_accepted"] is not False:
        raise PublicationError("semantic request template cannot be accepted")
    if mode == "acceptance" and payload["owner_accepted"] is not True:
        raise PublicationError("semantic rulings lack owner acceptance")

    buckets = _object(payload["order_status_buckets"], "order buckets")
    groups = _object(buckets.get("buckets"), "order bucket groups")
    expected_groups = {
        "FILLED": ["FILLED"],
        "PARTIAL": ["PARTIALLY_FILLED"],
        "REJECTED": ["REJECTED", "DENIED"],
        "OPEN": ["INITIALIZED", "SUBMITTED", "ACCEPTED", "PENDING_UPDATE", "PENDING_CANCEL", "TRIGGERED"],
    }
    if groups != expected_groups or buckets.get("all_only") != ["CANCELED", "EXPIRED"]:
        raise PublicationError("order bucket semantics drifted")
    if mode == "acceptance" and buckets.get("ruling") != "OWNER_ACCEPTED":
        raise PublicationError("order bucket ruling is unresolved")

    funnel = _object(payload["order_funnel"], "order funnel")
    if funnel.get("stages") != ["SUBMIT", "SOURCE_ACK", "BROKER_ACK", "FILL"] or funnel.get("signal_intent_require_identity_timestamp_order_binding_completeness") is not True:
        raise PublicationError("funnel semantics are unsafe")
    if mode == "acceptance" and funnel.get("ruling") not in {"FOUR_STAGE_AUTHORITATIVE", "SOURCE_FACTS_PUBLISHED"}:
        raise PublicationError("funnel ruling is unresolved")

    exposure = _object(payload["binding_exposure"], "binding exposure")
    if exposure.get("verdicts") != ["OK", "EXCEEDED", "UNKNOWN"] or exposure.get("missing_or_stale_is_unknown") is not True or exposure.get("per_currency_no_fx_inference") is not True:
        raise PublicationError("binding exposure semantics are unsafe")
    if mode == "acceptance" and exposure.get("ruling") != "FULL_POPULATION_SERVER_VERDICT":
        raise PublicationError("binding exposure ruling is unresolved")

    correlation = _object(payload["packed_correlation"], "packed correlation")
    if correlation.get("allowed_diagonal_semantics") != ["SELF_PAIR_SAMPLE_COUNT", "NULLABLE_DIAGONAL"] or correlation.get("sample_counts_parallel_to_values") is not True:
        raise PublicationError("correlation packing semantics are unsafe")
    if mode == "acceptance" and correlation.get("selected_diagonal_semantics") not in {"SELF_PAIR_SAMPLE_COUNT", "NULLABLE_DIAGONAL"}:
        raise PublicationError("correlation diagonal semantics are unresolved")

    calendar = _object(payload["vnm_calendar"], "VNM calendar")
    if calendar.get("timezone") != "Asia/Ho_Chi_Minh" or calendar.get("order_types_verbatim") != ["LO", "ATO", "ATC", "MP"] or calendar.get("lot_size_and_tick_rules_versioned") is not True or calendar.get("settlement_policy_versioned") is not True:
        raise PublicationError("VNM calendar/order semantics are unsafe")
    if mode == "acceptance" and calendar.get("ruling") != "OWNER_PUBLISHED":
        raise PublicationError("VNM calendar ruling is unresolved")


def validate_corpus(
    payload: dict[str, Any],
    mode: str,
    capabilities: dict[str, dict[str, Any]],
    pack_dir: pathlib.Path | None = None,
) -> None:
    _exact(payload, {"schema_version", "request_revision", "synthetic_non_business_data", "contains_secret_or_credential", "required_capability_ids", "required_negative_cases", "files"}, "golden corpus index")
    if payload["schema_version"] != "trading-system.portal-read-golden-corpus-index.v1" or payload["request_revision"] != REQUEST_REVISION or payload["synthetic_non_business_data"] is not True or payload["contains_secret_or_credential"] is not False:
        raise PublicationError("golden corpus identity/redaction is invalid")
    if set(payload["required_capability_ids"]) != set(EXPECTED):
        raise PublicationError("golden corpus request does not cover all capabilities")
    if len(payload["required_negative_cases"]) < 19 or len(set(payload["required_negative_cases"])) != len(payload["required_negative_cases"]):
        raise PublicationError("negative corpus is incomplete or duplicated")
    files = _object(payload["files"], "golden corpus files")
    if mode == "template":
        if files:
            raise PublicationError("request corpus template must not contain owner files")
        return
    published = {identifier for identifier, row in capabilities.items() if row["published"]}
    if set(files) != published:
        raise PublicationError("golden corpus files do not match published capabilities")
    for identifier, value in files.items():
        entry = _object(value, "golden corpus entry")
        expected_schema_file = f"schemas/{identifier}.schema.json"
        expected_fixture_file = f"fixtures/{identifier}.valid.json"
        expected_entry = {
            "response_schema_file": expected_schema_file,
            "response_schema_sha256": capabilities[identifier]["response_schema_sha256"],
            "positive_fixture_file": expected_fixture_file,
            "positive_fixture_sha256": capabilities[identifier]["positive_fixture_sha256"],
        }
        if entry != expected_entry:
            raise PublicationError("golden corpus digest differs from capability catalogue")
        if pack_dir is None:
            raise PublicationError("golden corpus pack directory is missing")
        schema_path = _owner_artifact(pack_dir, expected_schema_file)
        fixture_path = _owner_artifact(pack_dir, expected_fixture_file)
        schema = read_json(schema_path)
        fixture = read_json(
            fixture_path,
            maximum_bytes=capabilities[identifier]["maximum_response_bytes"],
        )
        if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema" or schema.get("type") != "object":
            raise PublicationError("published response schema is not JSON Schema 2020-12 object")
        _validate_positive_fixture(fixture)
        if digest(schema_path) != entry["response_schema_sha256"] or digest(fixture_path) != entry["positive_fixture_sha256"]:
            raise PublicationError("golden corpus artifact bytes do not match published digest")


def validate_results(payload: dict[str, Any], mode: str) -> None:
    _exact(payload, {"schema_version", "request_revision", "synthetic_example", "cases"}, "acceptance results")
    if payload["schema_version"] != "trading-system.portal-read-acceptance-results.v1" or payload["request_revision"] != REQUEST_REVISION:
        raise PublicationError("acceptance result identity mismatch")
    if mode == "template" and payload["synthetic_example"] is not True:
        raise PublicationError("request acceptance results must remain synthetic")
    if mode != "template" and payload["synthetic_example"] is not False:
        raise PublicationError("owner acceptance results cannot be the synthetic example")
    rows = payload["cases"]
    if not isinstance(rows, list) or {row.get("name") for row in rows if isinstance(row, dict)} != ACCEPTANCE_CASES:
        raise PublicationError("acceptance result cases are incomplete")
    for row in rows:
        _exact(row, {"name", "passed", "evidence_sha256"}, "acceptance case")
        if mode == "acceptance" and (row["passed"] is not True or not _valid_digest(row["evidence_sha256"], allow_zero=False)):
            raise PublicationError("acceptance evidence did not pass")
        if mode == "template" and (row["passed"] is not False or row["evidence_sha256"] != ZERO_DIGEST):
            raise PublicationError("request template contains acceptance evidence")


def validate_manifest(payload: dict[str, Any], mode: str, pack_dir: pathlib.Path) -> None:
    _exact(payload, {"schema_version", "request_revision", "source_contract_revision", "source_contract_commit", "source_image_digest", "owner_id", "owner_accepted", "owner_acceptance_evidence_sha256", "capability_catalogue_sha256", "semantic_rulings_sha256", "golden_corpus_index_sha256", "acceptance_results_sha256", "authority"}, "owner publication manifest")
    if payload["schema_version"] != "trading-system.portal-read-publication-manifest.v1" or payload["request_revision"] != REQUEST_REVISION:
        raise PublicationError("owner manifest identity mismatch")
    expected_hashes = {
        "capability_catalogue_sha256": digest(pack_dir / "capability-catalogue.json"),
        "semantic_rulings_sha256": digest(pack_dir / "semantic-rulings.json"),
        "golden_corpus_index_sha256": digest(pack_dir / "golden-corpus-index.json"),
        "acceptance_results_sha256": digest(pack_dir / "acceptance-results.json"),
    }
    if any(payload[key] != value for key, value in expected_hashes.items()):
        raise PublicationError("owner manifest file digest mismatch")
    if not isinstance(payload["source_contract_commit"], str) or COMMIT.fullmatch(payload["source_contract_commit"]) is None or payload["source_contract_commit"] == ZERO_COMMIT or not _valid_digest(payload["source_image_digest"], allow_zero=False):
        raise PublicationError("owner manifest source identity is invalid")
    authority = _object(payload["authority"], "owner manifest authority")
    if authority != {
        "publication_evidence_only": True, "portal_activation": False, "network_change": False,
        "database_credential_handoff": False, "redis": False, "cli": False, "broker": False,
        "command": False, "mutation": False, "sandbox": False, "canary": False, "live": False,
    }:
        raise PublicationError("owner manifest widened authority")
    if mode == "acceptance" and (payload["owner_accepted"] is not True or not _valid_digest(payload["owner_acceptance_evidence_sha256"], allow_zero=False)):
        raise PublicationError("owner acceptance evidence is missing")


def validate_template() -> dict[str, Any]:
    catalogue = read_json(REQUEST_DIR / "capability-catalogue.example.json")
    capabilities = validate_catalogue(catalogue, "template")
    validate_semantics(read_json(REQUEST_DIR / "semantic-rulings.example.json"), "template")
    validate_corpus(
        read_json(REQUEST_DIR / "golden-corpus-index.example.json"),
        "template",
        capabilities,
    )
    validate_results(read_json(REQUEST_DIR / "acceptance-results.example.json"), "template")
    manifest = read_json(REQUEST_DIR / "owner-publication.manifest.example.json")
    if manifest["owner_accepted"] is not False or manifest["authority"]["portal_activation"] is not False:
        raise PublicationError("request manifest is not fail-closed")
    return {"request_revision": REQUEST_REVISION, "decision": "N11_REQUEST_TEMPLATE_VALID", "capability_count": len(capabilities), "owner_accepted": False, "runtime_active": False}


def validate_pack(pack_dir: pathlib.Path, mode: str) -> dict[str, Any]:
    if not pack_dir.is_dir():
        raise PublicationError("owner pack directory is missing")
    missing = [name for name in PACK_FILES | {"owner-publication.manifest.json"} if not (pack_dir / name).is_file()]
    if missing:
        raise PublicationError("owner pack is incomplete")
    catalogue = read_json(pack_dir / "capability-catalogue.json")
    capabilities = validate_catalogue(catalogue, mode)
    semantics = read_json(pack_dir / "semantic-rulings.json")
    validate_semantics(semantics, mode)
    validate_corpus(
        read_json(pack_dir / "golden-corpus-index.json"),
        mode,
        capabilities,
        pack_dir,
    )
    validate_results(read_json(pack_dir / "acceptance-results.json"), mode)
    manifest = read_json(pack_dir / "owner-publication.manifest.json")
    validate_manifest(manifest, mode, pack_dir)
    if manifest["owner_id"] != catalogue["owner_id"] or manifest["source_contract_revision"] != catalogue["source_contract_revision"] or manifest["source_contract_commit"] != catalogue["source_contract_commit"] or manifest["owner_accepted"] != catalogue["owner_accepted"]:
        raise PublicationError("owner manifest and catalogue identity differ")
    return {
        "request_revision": REQUEST_REVISION,
        "source_contract_revision": catalogue["source_contract_revision"],
        "decision": "N11_OWNER_PUBLICATION_ACCEPTED" if mode == "acceptance" else "N11_OWNER_PUBLICATION_CANDIDATE_VALID",
        "published_capability_count": sum(row["published"] for row in capabilities.values()),
        "partial_publication": catalogue["partial_publication"],
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
                raise PublicationError("template mode does not accept an owner pack")
            result = validate_template()
        else:
            if args.pack_dir is None:
                raise PublicationError("candidate/acceptance mode requires --pack-dir")
            result = validate_pack(args.pack_dir, args.mode)
    except PublicationError as exc:
        print(json.dumps({"decision": "NO_GO", "reason": str(exc)}, sort_keys=True))
        return 1
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
