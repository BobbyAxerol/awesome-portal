#!/usr/bin/env python3
"""Fail-closed D4 Paper-shadow readiness and qualification validator.

The input contains only decisions, bounded identifiers and evidence digests.
No source credential or business payload belongs in it. Passing either mode
never activates an epoch, registry profile, Query/SSE/analytics or commands.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import stat
import sys
from datetime import datetime, timezone


class AuthorizationError(ValueError):
    """Stable D4 authorization rejection."""


ALLOWED_KEYS = {
    "INPUT_VERSION",
    "OWNER",
    "OWNER_CONFIRMED_AT_UTC",
    "D4_AUTHORIZED",
    "D4_CHANGE_WINDOW_ID",
    "D4_CHANGE_WINDOW_START_UTC",
    "D4_CHANGE_WINDOW_END_UTC",
    "SOURCE_OWNER",
    "ROLLBACK_OWNER",
    "BACKUP_OWNER",
    "OBSERVABILITY_OWNER",
    "D2_STATUS",
    "D3_STATUS",
    "DEPLOYMENT_COMMIT",
    "SOURCE_IMPLEMENTATION_COMMIT",
    "SOURCE_RUNTIME_ACCEPTANCE_COMMIT",
    "SOURCE_AUTH_CONTRACT_REVISION",
    "SOURCE_SCOPE",
    "SOURCE_ENVIRONMENT",
    "SOURCE_VENUE",
    "SOURCE_PAGE_SIZE",
    "SOURCE_RESPONSE_MAX_BYTES",
    "SOURCE_RATE_LIMIT_RPM",
    "SOURCE_SNAPSHOT_TTL_SECONDS",
    "SOURCE_SNAPSHOT_MAX_ROWS",
    "SOURCE_RETAINED_EVENTS",
    "DEDICATED_PAPER_READ_IDENTITY_ID_SHA256",
    "SOURCE_IDENTITY_DEDICATED",
    "SOURCE_IDENTITY_READ_ONLY",
    "SOURCE_MISSING_CREDENTIAL_REJECTED",
    "SOURCE_WRONG_CREDENTIAL_REJECTED",
    "SOURCE_REVOKED_CREDENTIAL_REJECTED",
    "SOURCE_MUTATION_METHODS_DENIED",
    "SOURCE_RUNTIME_LOOPBACK_ONLY",
    "SOURCE_PROXY_SECRET_DELIVERED",
    "SOURCE_PROXY_EXACT_ROUTES_CONFIGURED",
    "SOURCE_EXACT_GET_ROUTES_SHA256",
    "SOURCE_OPENAPI_SHA256",
    "SOURCE_FACADE_IMAGE_DIGEST",
    "SOURCE_GUIDE_SHA256",
    "SOURCE_TEST_EVIDENCE_SHA256",
    "SOURCE_RUNTIME_ACCEPTANCE_SHA256",
    "CAPABILITY_SNAPSHOT_SHA256",
    "EVENT_CURSOR_CONTRACT_SHA256",
    "EVENT_COMPLETENESS_CONTRACT_SHA256",
    "RESYNC_CONTRACT_SHA256",
    "MAPPER_SOURCE_COMMIT",
    "MAPPER_ARTIFACT_SHA256",
    "SEALED_CORPUS_SHA256",
    "BUILDING_EPOCH_ID",
    "BUILDING_EPOCH_STATUS",
    "PROJECTION_STORAGE_ENCRYPTED",
    "PROJECTION_STORAGE_EVIDENCE_SHA256",
    "PROJECTION_BACKUP_RESTORE_EVIDENCE_SHA256",
    "PROJECTION_STORAGE_APPROVED",
    "REPLAY_EVIDENCE_SHA256",
    "PARITY_EVIDENCE_SHA256",
    "FRESHNESS_EVIDENCE_SHA256",
    "GAP_RESYNC_EVIDENCE_SHA256",
    "RESTART_EVIDENCE_SHA256",
    "LOAD_EVIDENCE_SHA256",
    "RESTORE_EVIDENCE_SHA256",
    "D4_EVIDENCE_ACCEPTED",
    "REGISTRY_DELIVERY_PROFILE",
    "ACTIVATION_AUTHORIZED",
    "ALLOW_QUERY",
    "ALLOW_ANALYTICS",
    "ALLOW_SSE",
    "ALLOW_COMMANDS",
    "ALLOW_TRADING_SYSTEM_CHANGES",
}
BOOLEAN_KEYS = {
    "D4_AUTHORIZED",
    "SOURCE_IDENTITY_DEDICATED",
    "SOURCE_IDENTITY_READ_ONLY",
    "SOURCE_MISSING_CREDENTIAL_REJECTED",
    "SOURCE_WRONG_CREDENTIAL_REJECTED",
    "SOURCE_REVOKED_CREDENTIAL_REJECTED",
    "SOURCE_MUTATION_METHODS_DENIED",
    "SOURCE_RUNTIME_LOOPBACK_ONLY",
    "SOURCE_PROXY_SECRET_DELIVERED",
    "SOURCE_PROXY_EXACT_ROUTES_CONFIGURED",
    "PROJECTION_STORAGE_ENCRYPTED",
    "PROJECTION_STORAGE_APPROVED",
    "D4_EVIDENCE_ACCEPTED",
    "ACTIVATION_AUTHORIZED",
    "ALLOW_QUERY",
    "ALLOW_ANALYTICS",
    "ALLOW_SSE",
    "ALLOW_COMMANDS",
    "ALLOW_TRADING_SYSTEM_CHANGES",
}
PERMANENT_FALSE_KEYS = {
    "ACTIVATION_AUTHORIZED",
    "ALLOW_QUERY",
    "ALLOW_ANALYTICS",
    "ALLOW_SSE",
    "ALLOW_COMMANDS",
    "ALLOW_TRADING_SYSTEM_CHANGES",
}
SOURCE_SECURITY_TRUE_KEYS = {
    "SOURCE_IDENTITY_DEDICATED",
    "SOURCE_IDENTITY_READ_ONLY",
    "SOURCE_MISSING_CREDENTIAL_REJECTED",
    "SOURCE_WRONG_CREDENTIAL_REJECTED",
    "SOURCE_REVOKED_CREDENTIAL_REJECTED",
    "SOURCE_MUTATION_METHODS_DENIED",
    "SOURCE_RUNTIME_LOOPBACK_ONLY",
    "SOURCE_PROXY_SECRET_DELIVERED",
    "SOURCE_PROXY_EXACT_ROUTES_CONFIGURED",
}
READINESS_DIGEST_KEYS = {
    "DEDICATED_PAPER_READ_IDENTITY_ID_SHA256",
    "SOURCE_EXACT_GET_ROUTES_SHA256",
    "SOURCE_OPENAPI_SHA256",
    "SOURCE_FACADE_IMAGE_DIGEST",
    "SOURCE_GUIDE_SHA256",
    "SOURCE_TEST_EVIDENCE_SHA256",
    "SOURCE_RUNTIME_ACCEPTANCE_SHA256",
    "CAPABILITY_SNAPSHOT_SHA256",
    "EVENT_CURSOR_CONTRACT_SHA256",
    "EVENT_COMPLETENESS_CONTRACT_SHA256",
    "RESYNC_CONTRACT_SHA256",
    "MAPPER_ARTIFACT_SHA256",
    "SEALED_CORPUS_SHA256",
    "PROJECTION_STORAGE_EVIDENCE_SHA256",
    "PROJECTION_BACKUP_RESTORE_EVIDENCE_SHA256",
}
RECONCILIATION_DIGEST_KEYS = READINESS_DIGEST_KEYS - {
    "SOURCE_RUNTIME_ACCEPTANCE_SHA256",
    "MAPPER_ARTIFACT_SHA256",
    "SEALED_CORPUS_SHA256",
    "PROJECTION_BACKUP_RESTORE_EVIDENCE_SHA256",
}
QUALIFICATION_DIGEST_KEYS = {
    "REPLAY_EVIDENCE_SHA256",
    "PARITY_EVIDENCE_SHA256",
    "FRESHNESS_EVIDENCE_SHA256",
    "GAP_RESYNC_EVIDENCE_SHA256",
    "RESTART_EVIDENCE_SHA256",
    "LOAD_EVIDENCE_SHA256",
    "RESTORE_EVIDENCE_SHA256",
}
SAFE_VALUE = re.compile(r"[A-Za-z0-9_./:@+-]*")
HEX_64 = re.compile(r"(?:sha256:)?[0-9a-f]{64}")
COMMIT = re.compile(r"[0-9a-f]{40}")
UUID = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
)
WINDOW_ID = re.compile(r"d4-[a-z0-9][a-z0-9._-]{2,63}")
REVISION = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")

LOCKED_SOURCE_VALUES = {
    "SOURCE_AUTH_CONTRACT_REVISION": "d4.paper-read.v1",
    "SOURCE_SCOPE": "PAPER_BINANCE_USDM",
    "SOURCE_ENVIRONMENT": "paper",
    "SOURCE_VENUE": "BINANCE",
    "SOURCE_PAGE_SIZE": "250",
    "SOURCE_RESPONSE_MAX_BYTES": "1048576",
    "SOURCE_RATE_LIMIT_RPM": "120",
    "SOURCE_SNAPSHOT_TTL_SECONDS": "300",
    "SOURCE_SNAPSHOT_MAX_ROWS": "10000",
    "SOURCE_RETAINED_EVENTS": "10000",
}


def parse_input(path: pathlib.Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw or raw.startswith("#"):
            continue
        if "=" not in raw:
            raise AuthorizationError("owner input contains a malformed line")
        key, value = raw.split("=", 1)
        if key not in ALLOWED_KEYS:
            raise AuthorizationError("owner input contains an unknown key")
        if key in values:
            raise AuthorizationError("owner input contains a duplicate key")
        if not SAFE_VALUE.fullmatch(value):
            raise AuthorizationError("owner input contains an unsafe value")
        values[key] = value
    if values.keys() != ALLOWED_KEYS:
        raise AuthorizationError("owner input schema keys are incomplete")
    return values


def _timestamp(raw: str) -> datetime:
    if not raw.endswith("Z"):
        raise AuthorizationError("timestamps must be UTC Z values")
    try:
        return datetime.fromisoformat(raw[:-1] + "+00:00")
    except ValueError as exc:
        raise AuthorizationError("timestamp is malformed") from exc


def validate(values: dict[str, str], *, mode: str, now: datetime | None = None) -> None:
    if mode not in {"template", "reconciliation", "readiness", "qualification"}:
        raise AuthorizationError("unsupported D4 authorization mode")
    if values["INPUT_VERSION"] != "portal.execution-d4.owner-input.v2":
        raise AuthorizationError("input version mismatch")
    for key in BOOLEAN_KEYS:
        if values[key] not in {"true", "false"}:
            raise AuthorizationError(f"{key} must be true or false")
    for key in PERMANENT_FALSE_KEYS:
        if values[key] != "false":
            raise AuthorizationError(f"{key} must remain false during D4")
    if values["REGISTRY_DELIVERY_PROFILE"] != "fixture":
        raise AuthorizationError("D4 qualification cannot activate a registry profile")
    if values["BUILDING_EPOCH_STATUS"] != "BUILDING":
        raise AuthorizationError("D4 is limited to a BUILDING projection epoch")
    for key, expected in LOCKED_SOURCE_VALUES.items():
        if values[key] != expected:
            raise AuthorizationError(f"{key} differs from the locked source contract")

    if mode == "template":
        if values["D4_AUTHORIZED"] != "false":
            raise AuthorizationError("template must remain unauthorized")
        return

    if mode == "reconciliation":
        if values["D4_AUTHORIZED"] != "false":
            raise AuthorizationError("reconciliation must remain unauthorized")
        if values["D2_STATUS"] != "D2_DARK_ACCEPTED":
            raise AuthorizationError("accepted D2 dark predecessor is missing")
        if values["D3_STATUS"] != "D3_TRANSPORT_ACCEPTED":
            raise AuthorizationError("accepted D3 transport predecessor is missing")
        if not COMMIT.fullmatch(values["SOURCE_IMPLEMENTATION_COMMIT"]):
            raise AuthorizationError("source implementation commit is malformed")
        if not COMMIT.fullmatch(values["SOURCE_RUNTIME_ACCEPTANCE_COMMIT"]):
            raise AuthorizationError("source runtime acceptance commit is malformed")
        if not REVISION.fullmatch(values["SOURCE_AUTH_CONTRACT_REVISION"]):
            raise AuthorizationError("source auth contract revision is malformed")
        for key in SOURCE_SECURITY_TRUE_KEYS - {
            "SOURCE_PROXY_SECRET_DELIVERED",
            "SOURCE_PROXY_EXACT_ROUTES_CONFIGURED",
        }:
            if values[key] != "true":
                raise AuthorizationError(f"{key} is not proven")
        for key in (
            "SOURCE_PROXY_SECRET_DELIVERED",
            "SOURCE_PROXY_EXACT_ROUTES_CONFIGURED",
        ):
            if values[key] != "false":
                raise AuthorizationError(f"{key} must remain false during reconciliation")
        if values["PROJECTION_STORAGE_ENCRYPTED"] != "true":
            raise AuthorizationError("D4 projection storage is not proven encrypted")
        if values["PROJECTION_STORAGE_APPROVED"] != "true":
            raise AuthorizationError("D4 projection storage is not owner-approved")
        for key in RECONCILIATION_DIGEST_KEYS:
            if not HEX_64.fullmatch(values[key]):
                raise AuthorizationError(f"{key} is not a canonical SHA-256 digest")
        if values["D4_EVIDENCE_ACCEPTED"] != "false":
            raise AuthorizationError("reconciliation cannot pre-accept D4 evidence")
        return

    required_owners = (
        "OWNER",
        "SOURCE_OWNER",
        "ROLLBACK_OWNER",
        "BACKUP_OWNER",
        "OBSERVABILITY_OWNER",
    )
    if any(not values[key] for key in required_owners):
        raise AuthorizationError("D4 ownership is incomplete")
    if values["D4_AUTHORIZED"] != "true":
        raise AuthorizationError("D4 is not authorized")
    if values["D2_STATUS"] != "D2_DARK_ACCEPTED":
        raise AuthorizationError("accepted D2 dark predecessor is missing")
    if values["D3_STATUS"] != "D3_TRANSPORT_ACCEPTED":
        raise AuthorizationError("accepted D3 transport predecessor is missing")
    if not WINDOW_ID.fullmatch(values["D4_CHANGE_WINDOW_ID"]):
        raise AuthorizationError("D4 change-window ID is malformed")

    current = now or datetime.now(timezone.utc)
    confirmed = _timestamp(values["OWNER_CONFIRMED_AT_UTC"])
    start = _timestamp(values["D4_CHANGE_WINDOW_START_UTC"])
    end = _timestamp(values["D4_CHANGE_WINDOW_END_UTC"])
    if confirmed > current or not start <= current <= end:
        raise AuthorizationError("D4 validation is outside the approved window")
    if end <= start or (end - start).total_seconds() > 2 * 60 * 60:
        raise AuthorizationError("D4 window must be positive and no longer than two hours")

    if not COMMIT.fullmatch(values["DEPLOYMENT_COMMIT"]):
        raise AuthorizationError("deployment commit is malformed")
    if not COMMIT.fullmatch(values["SOURCE_IMPLEMENTATION_COMMIT"]):
        raise AuthorizationError("source implementation commit is malformed")
    if not COMMIT.fullmatch(values["SOURCE_RUNTIME_ACCEPTANCE_COMMIT"]):
        raise AuthorizationError("source runtime acceptance commit is malformed")
    if values["MAPPER_SOURCE_COMMIT"] != values["DEPLOYMENT_COMMIT"]:
        raise AuthorizationError("mapper source commit differs from deployment commit")
    if not REVISION.fullmatch(values["SOURCE_AUTH_CONTRACT_REVISION"]):
        raise AuthorizationError("source auth contract revision is malformed")
    if not UUID.fullmatch(values["BUILDING_EPOCH_ID"]):
        raise AuthorizationError("BUILDING epoch ID is malformed")
    for key in SOURCE_SECURITY_TRUE_KEYS:
        if values[key] != "true":
            raise AuthorizationError(f"{key} is not proven")
    if values["PROJECTION_STORAGE_ENCRYPTED"] != "true":
        raise AuthorizationError("D4 projection storage is not proven encrypted")
    if values["PROJECTION_STORAGE_APPROVED"] != "true":
        raise AuthorizationError("D4 projection storage is not owner-approved")
    for key in READINESS_DIGEST_KEYS:
        if not HEX_64.fullmatch(values[key]):
            raise AuthorizationError(f"{key} is not a canonical SHA-256 digest")

    if mode == "qualification":
        for key in QUALIFICATION_DIGEST_KEYS:
            if not HEX_64.fullmatch(values[key]):
                raise AuthorizationError(f"{key} is not a canonical SHA-256 digest")
        if values["D4_EVIDENCE_ACCEPTED"] != "true":
            raise AuthorizationError("D4 qualification evidence is not accepted")
    elif values["D4_EVIDENCE_ACCEPTED"] != "false":
        raise AuthorizationError("readiness cannot pre-accept D4 evidence")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=pathlib.Path, required=True)
    parser.add_argument(
        "--mode",
        choices=("template", "reconciliation", "readiness", "qualification"),
        required=True,
    )
    args = parser.parse_args(argv)
    try:
        if args.mode != "template":
            if args.input.is_symlink() or stat.S_IMODE(args.input.stat().st_mode) & 0o077:
                raise AuthorizationError("private D4 input must be non-symlink mode-0600")
        validate(parse_input(args.input), mode=args.mode)
    except (AuthorizationError, OSError) as exc:
        print(f"D4 authorization {args.mode} REJECTED: {exc}", file=sys.stderr)
        return 1
    print(f"D4 authorization {args.mode} PASSED. No state changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
