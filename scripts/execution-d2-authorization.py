#!/usr/bin/env python3
"""Validate D2 owner authority without sourcing or printing private inputs."""

from __future__ import annotations

import argparse
import pathlib
import re
import stat
import sys
from datetime import datetime, timezone


KEYS = (
    "INPUT_VERSION",
    "OWNER",
    "OWNER_CONFIRMED_AT_UTC",
    "D2_AUTHORIZED",
    "D2_CHANGE_WINDOW_ID",
    "D2_CHANGE_WINDOW_START_UTC",
    "D2_CHANGE_WINDOW_END_UTC",
    "AWS_OPERATOR",
    "ROLLBACK_OWNER",
    "DEPLOYMENT_COMMIT",
    "D1_STATUS",
    "IAM_STATUS",
    "D1_REVALIDATED",
    "IMAGE_SOURCE_COMMIT",
    "IMAGE_PUBLICATION_ARTIFACT_SHA256",
    "HIGH_FINDINGS_DISPOSITION",
    "IMAGE_SIGNATURES_VERIFIED",
    "WORKLOAD_IDENTITY_INVENTORY_SHA256",
    "WORKLOAD_IDENTITIES_VERIFIED",
    "D2_HOST_ADMISSION_EVIDENCE_SHA256",
    "HOST_ADMISSION_ACCEPTED",
    "HISTORICAL_OOM_REVIEWED",
    "D2_RESOURCE_BUDGET_APPROVED",
    "INSTANCE_PROFILE_ASSOCIATION_ID",
    "INSTANCE_PROFILE_DETACH_APPROVED",
    "INSTANCE_PROFILE_DETACHED",
    "IMDS_HOP_LIMIT_TARGET",
    "IMDS_HARDENING_APPROVED",
    "IMDS_HOP_LIMIT_ONE_VERIFIED",
    "PROJECTION_DB_MODE",
    "PROJECTION_DB_PILOT_APPROVED",
    "PROJECTION_INGESTION_ENABLED",
    "BACKUP_OWNER",
    "OBSERVABILITY_OWNER",
    "ALLOW_SOURCE_READ",
    "ALLOW_QUERY",
    "ALLOW_ANALYTICS",
    "ALLOW_SSE",
    "ALLOW_COMMANDS",
    "ALLOW_DELIVERY_PROFILE_ACTIVATION",
    "ALLOW_TRADING_SYSTEM_CHANGES",
)
BOOLEAN_KEYS = (
    "D2_AUTHORIZED",
    "D1_REVALIDATED",
    "IMAGE_SIGNATURES_VERIFIED",
    "WORKLOAD_IDENTITIES_VERIFIED",
    "HOST_ADMISSION_ACCEPTED",
    "HISTORICAL_OOM_REVIEWED",
    "D2_RESOURCE_BUDGET_APPROVED",
    "INSTANCE_PROFILE_DETACH_APPROVED",
    "INSTANCE_PROFILE_DETACHED",
    "IMDS_HARDENING_APPROVED",
    "IMDS_HOP_LIMIT_ONE_VERIFIED",
    "PROJECTION_DB_PILOT_APPROVED",
    "PROJECTION_INGESTION_ENABLED",
    "ALLOW_SOURCE_READ",
    "ALLOW_QUERY",
    "ALLOW_ANALYTICS",
    "ALLOW_SSE",
    "ALLOW_COMMANDS",
    "ALLOW_DELIVERY_PROFILE_ACTIVATION",
    "ALLOW_TRADING_SYSTEM_CHANGES",
)
PERMANENT_FALSE_KEYS = (
    "PROJECTION_INGESTION_ENABLED",
    "ALLOW_SOURCE_READ",
    "ALLOW_QUERY",
    "ALLOW_ANALYTICS",
    "ALLOW_SSE",
    "ALLOW_COMMANDS",
    "ALLOW_DELIVERY_PROFILE_ACTIVATION",
    "ALLOW_TRADING_SYSTEM_CHANGES",
)
SAFE_VALUE = re.compile(r"^[A-Za-z0-9._:/,@+ -]*$")
HEX_64 = re.compile(r"^[a-f0-9]{64}$")
COMMIT = re.compile(r"^[a-f0-9]{40}$")
ASSOCIATION = re.compile(r"^iip-assoc-[0-9a-f]{8,17}$")
WINDOW_ID = re.compile(r"^d2-[a-z0-9][a-z0-9-]{2,62}$")


class AuthorizationError(RuntimeError):
    pass


def parse_input(path: pathlib.Path) -> dict[str, str]:
    if not path.is_file() or path.is_symlink():
        raise AuthorizationError("owner input must be a non-symlink regular file")
    values: dict[str, str] = {}
    allowed = set(KEYS)
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise AuthorizationError(f"invalid syntax at line {line_number}")
        key, value = line.split("=", 1)
        if key not in allowed:
            raise AuthorizationError(f"unknown key at line {line_number}")
        if key in values:
            raise AuthorizationError(f"duplicate key at line {line_number}")
        if not SAFE_VALUE.fullmatch(value) or any(
            token in value for token in ("$(", "${", "`", "'", '"')
        ):
            raise AuthorizationError(f"unsafe value at line {line_number}")
        values[key] = value
    missing = allowed - values.keys()
    if missing:
        raise AuthorizationError("owner input is missing schema keys")
    return values


def _timestamp(raw: str) -> datetime:
    if not raw.endswith("Z"):
        raise AuthorizationError("timestamps must be UTC Z values")
    try:
        return datetime.fromisoformat(raw[:-1] + "+00:00")
    except ValueError as exc:
        raise AuthorizationError("timestamp is malformed") from exc


def validate(values: dict[str, str], *, mode: str, now: datetime | None = None) -> None:
    if values["INPUT_VERSION"] != "portal.execution-d2.owner-input.v1":
        raise AuthorizationError("input version mismatch")
    for key in BOOLEAN_KEYS:
        if values[key] not in {"true", "false"}:
            raise AuthorizationError(f"{key} must be true or false")
    for key in PERMANENT_FALSE_KEYS:
        if values[key] != "false":
            raise AuthorizationError(f"{key} must remain false during D2")
    if values["D1_STATUS"] != "D1_NETWORK_ACCEPTED" or values["IAM_STATUS"] != "IAM_VERIFIED":
        raise AuthorizationError("D1/IAM predecessor status mismatch")
    if values["IMDS_HOP_LIMIT_TARGET"] != "1":
        raise AuthorizationError("D2 requires IMDS hop-limit target one")
    if values["PROJECTION_DB_MODE"] != "LOCAL_DARK_NO_INGESTION":
        raise AuthorizationError("D2 authorization is limited to local empty-schema dark DB")

    if mode == "template":
        if values["D2_AUTHORIZED"] != "false":
            raise AuthorizationError("template must remain unauthorized")
        return

    required = (
        "OWNER",
        "OWNER_CONFIRMED_AT_UTC",
        "D2_CHANGE_WINDOW_ID",
        "D2_CHANGE_WINDOW_START_UTC",
        "D2_CHANGE_WINDOW_END_UTC",
        "AWS_OPERATOR",
        "ROLLBACK_OWNER",
        "BACKUP_OWNER",
        "OBSERVABILITY_OWNER",
    )
    if any(not values[key] for key in required):
        raise AuthorizationError("D2 owner/operator/window ownership is incomplete")
    if values["D2_AUTHORIZED"] != "true":
        raise AuthorizationError("D2 is not authorized")
    if not WINDOW_ID.fullmatch(values["D2_CHANGE_WINDOW_ID"]):
        raise AuthorizationError("change-window ID is malformed")

    current = now or datetime.now(timezone.utc)
    confirmed = _timestamp(values["OWNER_CONFIRMED_AT_UTC"])
    start = _timestamp(values["D2_CHANGE_WINDOW_START_UTC"])
    end = _timestamp(values["D2_CHANGE_WINDOW_END_UTC"])
    if confirmed > current or not start <= current <= end:
        raise AuthorizationError("D2 preflight is outside the approved window")
    if end <= start or (end - start).total_seconds() > 2 * 60 * 60:
        raise AuthorizationError("D2 window must be positive and no longer than two hours")

    if not COMMIT.fullmatch(values["DEPLOYMENT_COMMIT"]):
        raise AuthorizationError("deployment commit is not a full SHA")
    if values["IMAGE_SOURCE_COMMIT"] != values["DEPLOYMENT_COMMIT"]:
        raise AuthorizationError("published image source commit mismatch")
    for key in (
        "IMAGE_PUBLICATION_ARTIFACT_SHA256",
        "WORKLOAD_IDENTITY_INVENTORY_SHA256",
        "D2_HOST_ADMISSION_EVIDENCE_SHA256",
    ):
        if not HEX_64.fullmatch(values[key]):
            raise AuthorizationError(f"{key} is not a SHA-256 digest")
    if values["HIGH_FINDINGS_DISPOSITION"] != "ACCEPTED_NO_CRITICAL":
        raise AuthorizationError("image vulnerability disposition is not accepted")
    for key in (
        "D1_REVALIDATED",
        "IMAGE_SIGNATURES_VERIFIED",
        "WORKLOAD_IDENTITIES_VERIFIED",
        "HOST_ADMISSION_ACCEPTED",
        "HISTORICAL_OOM_REVIEWED",
        "D2_RESOURCE_BUDGET_APPROVED",
        "INSTANCE_PROFILE_DETACH_APPROVED",
        "IMDS_HARDENING_APPROVED",
        "PROJECTION_DB_PILOT_APPROVED",
    ):
        if values[key] != "true":
            raise AuthorizationError(f"{key} is not approved")
    if not ASSOCIATION.fullmatch(values["INSTANCE_PROFILE_ASSOCIATION_ID"]):
        raise AuthorizationError("instance-profile association ID is malformed")

    if mode == "activation":
        if values["INSTANCE_PROFILE_DETACHED"] != "true":
            raise AuthorizationError("instance profile is not proven detached")
        if values["IMDS_HOP_LIMIT_ONE_VERIFIED"] != "true":
            raise AuthorizationError("IMDS hop-limit one is not proven")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=pathlib.Path)
    parser.add_argument("--mode", required=True, choices=("template", "readiness", "activation"))
    args = parser.parse_args(argv)
    try:
        if args.mode != "template":
            permissions = stat.S_IMODE(args.input.stat().st_mode)
            if permissions & 0o077:
                raise AuthorizationError("private D2 input must have no group/world bits")
        validate(parse_input(args.input), mode=args.mode)
    except (AuthorizationError, OSError) as exc:
        print(f"D2 authorization {args.mode} REJECTED: {exc}", file=sys.stderr)
        return 1
    print(f"D2 authorization {args.mode} PASSED. No state changed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
