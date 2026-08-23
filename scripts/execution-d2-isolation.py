#!/usr/bin/env python3
"""Verify or apply the bounded D2 EC2 instance-profile isolation sequence.

The verify mode is read-only and requires EC2 to return DryRunOperation for the
exact metadata hardening request. The activate mode is intentionally explicit:
it is valid only inside a <=2-hour UTC window, hardens IMDS first, detaches one
exact instance-profile association second, and finally requires the IMDS role
credential endpoint to become absent. It never starts Portal services.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Callable, Protocol


INSTANCE_ID = re.compile(r"i-[0-9a-f]{8,17}")
ASSOCIATION_ID = re.compile(r"iip-assoc-[0-9a-f]{8,17}")
PROFILE_ARN = re.compile(r"arn:aws:iam::[0-9]{12}:instance-profile/[A-Za-z0-9+=,.@_/-]+")
ACTIVATION_TOKEN = "D2_ISOLATE_TEMPORARY_OPERATOR_PROFILE"
MAXIMUM_WINDOW = timedelta(hours=2)
EXPECTED_REGION = "ap-east-1"


class IsolationError(RuntimeError):
    """Stable operator-facing isolation failure."""


class EC2Client(Protocol):
    def describe_instances(self, **kwargs: object) -> dict[str, object]: ...

    def describe_iam_instance_profile_associations(
        self, **kwargs: object
    ) -> dict[str, object]: ...

    def modify_instance_metadata_options(self, **kwargs: object) -> dict[str, object]: ...

    def disassociate_iam_instance_profile(self, **kwargs: object) -> dict[str, object]: ...


@dataclass(frozen=True)
class ExpectedTarget:
    instance_id: str
    association_id: str
    profile_arn: str


@dataclass(frozen=True)
class IsolationState:
    instance_state: str
    metadata_state: str
    http_endpoint: str
    http_tokens: str
    hop_limit: int
    association_count: int
    association_id: str | None
    association_state: str | None
    profile_arn: str | None


def _error_code(exc: Exception) -> str:
    response = getattr(exc, "response", {})
    if isinstance(response, dict):
        error = response.get("Error", {})
        if isinstance(error, dict):
            code = error.get("Code")
            if isinstance(code, str):
                return code
    return type(exc).__name__


def validate_target(target: ExpectedTarget) -> None:
    if not INSTANCE_ID.fullmatch(target.instance_id):
        raise IsolationError("instance ID is malformed")
    if not ASSOCIATION_ID.fullmatch(target.association_id):
        raise IsolationError("instance-profile association ID is malformed")
    if not PROFILE_ARN.fullmatch(target.profile_arn):
        raise IsolationError("instance-profile ARN is malformed")


def validate_window(start_raw: str, end_raw: str, *, now: datetime | None = None) -> None:
    def parse(raw: str) -> datetime:
        if not raw.endswith("Z"):
            raise IsolationError("change-window timestamps must use UTC Z")
        try:
            return datetime.fromisoformat(raw[:-1] + "+00:00")
        except ValueError as exc:
            raise IsolationError("change-window timestamp is malformed") from exc

    start = parse(start_raw)
    end = parse(end_raw)
    current = now or datetime.now(timezone.utc)
    if end <= start or end - start > MAXIMUM_WINDOW:
        raise IsolationError("change window must be positive and no longer than two hours")
    if not start <= current <= end:
        raise IsolationError("current time is outside the approved change window")


def inspect_state(client: EC2Client, target: ExpectedTarget) -> IsolationState:
    response = client.describe_instances(InstanceIds=[target.instance_id])
    reservations = response.get("Reservations", [])
    instances = [
        instance
        for reservation in reservations
        for instance in reservation.get("Instances", [])
    ]
    if len(instances) != 1:
        raise IsolationError("exactly one target instance was not returned")
    instance = instances[0]
    if instance.get("InstanceId") != target.instance_id:
        raise IsolationError("instance identity drift")

    metadata = instance.get("MetadataOptions", {})
    associations = client.describe_iam_instance_profile_associations(
        Filters=[{"Name": "instance-id", "Values": [target.instance_id]}]
    ).get("IamInstanceProfileAssociations", [])
    association = associations[0] if len(associations) == 1 else None
    return IsolationState(
        instance_state=instance.get("State", {}).get("Name", "unknown"),
        metadata_state=metadata.get("State", "unknown"),
        http_endpoint=metadata.get("HttpEndpoint", "unknown"),
        http_tokens=metadata.get("HttpTokens", "unknown"),
        hop_limit=int(metadata.get("HttpPutResponseHopLimit", 0)),
        association_count=len(associations),
        association_id=association.get("AssociationId") if association else None,
        association_state=association.get("State") if association else None,
        profile_arn=association.get("IamInstanceProfile", {}).get("Arn") if association else None,
    )


def require_attached_target(state: IsolationState, target: ExpectedTarget) -> None:
    if state.instance_state != "running":
        raise IsolationError("target instance is not running")
    if state.association_count != 1:
        raise IsolationError("target must have exactly one attached instance profile")
    if state.association_id != target.association_id:
        raise IsolationError("instance-profile association drift")
    if state.association_state != "associated":
        raise IsolationError("instance-profile association is not stable")
    if state.profile_arn != target.profile_arn:
        raise IsolationError("instance-profile ARN drift")
    if state.http_endpoint != "enabled" or state.http_tokens != "required":
        raise IsolationError("IMDS endpoint/tokens boundary is not hardened")
    if state.hop_limit not in {1, 2}:
        raise IsolationError("unexpected IMDS response hop limit")


def verify_modify_authority(client: EC2Client, target: ExpectedTarget) -> None:
    try:
        client.modify_instance_metadata_options(
            InstanceId=target.instance_id,
            HttpEndpoint="enabled",
            HttpTokens="required",
            HttpPutResponseHopLimit=1,
            DryRun=True,
        )
    except Exception as exc:  # botocore is a lazy runtime dependency.
        code = _error_code(exc)
        if code == "DryRunOperation":
            return
        raise IsolationError(f"metadata hardening DryRun rejected: {code}") from exc
    raise IsolationError("metadata hardening DryRun unexpectedly executed")


def _wait_for(
    inspect: Callable[[], IsolationState],
    predicate: Callable[[IsolationState], bool],
    *,
    attempts: int = 20,
    interval_seconds: float = 1.5,
) -> IsolationState:
    for _ in range(attempts):
        state = inspect()
        if predicate(state):
            return state
        time.sleep(interval_seconds)
    raise IsolationError("EC2 state transition timed out")


def imds_role_credentials_absent(*, timeout_seconds: float = 2.0) -> bool:
    token_request = urllib.request.Request(
        "http://169.254.169.254/latest/api/token",
        method="PUT",
        headers={"X-aws-ec2-metadata-token-ttl-seconds": "60"},
    )
    try:
        with urllib.request.urlopen(token_request, timeout=timeout_seconds) as response:
            token = response.read().decode("utf-8")
        role_request = urllib.request.Request(
            "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
            headers={"X-aws-ec2-metadata-token": token},
        )
        with urllib.request.urlopen(role_request, timeout=timeout_seconds) as response:
            return not bool(response.read().strip())
    except urllib.error.HTTPError as exc:
        return exc.code == 404
    except (OSError, TimeoutError) as exc:
        raise IsolationError("IMDS credential-absence probe failed closed") from exc


def activate(
    client: EC2Client,
    target: ExpectedTarget,
    *,
    credentials_absent: Callable[[], bool] = imds_role_credentials_absent,
) -> None:
    client.modify_instance_metadata_options(
        InstanceId=target.instance_id,
        HttpEndpoint="enabled",
        HttpTokens="required",
        HttpPutResponseHopLimit=1,
    )
    hardened = _wait_for(
        lambda: inspect_state(client, target),
        lambda state: state.metadata_state == "applied"
        and state.http_endpoint == "enabled"
        and state.http_tokens == "required"
        and state.hop_limit == 1,
    )
    require_attached_target(hardened, target)

    client.disassociate_iam_instance_profile(AssociationId=target.association_id)
    _wait_for(
        lambda: inspect_state(client, target),
        lambda state: state.association_count == 0,
    )
    for _ in range(20):
        if credentials_absent():
            return
        time.sleep(1.5)
    raise IsolationError("IMDS still exposes an instance-profile role after detachment")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("verify", "activate"), required=True)
    parser.add_argument("--region", required=True)
    parser.add_argument("--instance-id", required=True)
    parser.add_argument("--association-id", required=True)
    parser.add_argument("--expected-profile-arn", required=True)
    parser.add_argument("--window-start-utc", default="")
    parser.add_argument("--window-end-utc", default="")
    parser.add_argument("--authorize", default="")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    target = ExpectedTarget(args.instance_id, args.association_id, args.expected_profile_arn)
    try:
        validate_target(target)
        if args.region != EXPECTED_REGION:
            raise IsolationError("D2 isolation is restricted to AWS Hong Kong")
        if args.mode == "activate":
            if args.authorize != ACTIVATION_TOKEN:
                raise IsolationError("activation confirmation token mismatch")
            validate_window(args.window_start_utc, args.window_end_utc)

        import boto3  # Lazy so fixture tests need no network SDK.

        client = boto3.client("ec2", region_name=args.region)
        state = inspect_state(client, target)
        require_attached_target(state, target)
        verify_modify_authority(client, target)
        if args.mode == "activate":
            activate(client, target)
    except IsolationError as exc:
        print(
            json.dumps(
                {"status": "D2_ISOLATION_REJECTED", "reason": str(exc)},
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 1
    except Exception as exc:
        print(
            json.dumps(
                {"status": "D2_ISOLATION_ERROR", "reason": _error_code(exc)},
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 2

    status = (
        "D2_INSTANCE_PROFILE_ISOLATED"
        if args.mode == "activate"
        else "D2_ISOLATION_AUTHORITY_VERIFIED"
    )
    print(json.dumps({"status": status, "portal_services_started": False}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
