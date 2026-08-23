#!/usr/bin/env python3
"""Fail-closed, read-only AWS inventory verification for Execution D1/D2.

Run this on the AWS-HK EC2 host with an instance role. The report deliberately
omits AWS response metadata and credentials. It is safe to retain as private
mode-0600 operational evidence, but exact infrastructure identifiers must not
be committed to Git.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterable


INSTANCE_ID_RE = re.compile(r"^i-[0-9a-f]{8,17}$")
GROUP_ID_RE = re.compile(r"^sg-[0-9a-f]{8,17}$")
RULE_ID_RE = re.compile(r"^sgr-[0-9a-f]{8,17}$")
VPC_ID_RE = re.compile(r"^vpc-[0-9a-f]{8,17}$")
SUBNET_ID_RE = re.compile(r"^subnet-[0-9a-f]{8,17}$")
EIP_ALLOCATION_ID_RE = re.compile(r"^eipalloc-[0-9a-f]{8,17}$")
ROUTE_TABLE_ID_RE = re.compile(r"^rtb-[0-9a-f]{8,17}$")


class VerificationError(RuntimeError):
    """A live AWS fact contradicted the owner-approved inventory."""


@dataclass(frozen=True)
class ExpectedInventory:
    account_id: str
    region: str
    role_name: str
    instance_id: str
    public_ip: str
    security_group_id: str
    vpc_id: str
    subnet_id: str
    eip_allocation_id: str
    route_table_id: str
    sgp_cidr: str
    wireguard_rule_id: str
    wireguard_port: int = 51820


def _expect(condition: bool, message: str) -> None:
    if not condition:
        raise VerificationError(message)


def _one(items: list[dict[str, Any]], label: str) -> dict[str, Any]:
    _expect(len(items) == 1, f"expected exactly one {label}; observed {len(items)}")
    return items[0]


def _validate_expected(expected: ExpectedInventory) -> None:
    _expect(re.fullmatch(r"[0-9]{12}", expected.account_id) is not None, "invalid account ID")
    _expect(bool(expected.region), "region is required")
    _expect(bool(expected.role_name), "role name is required")
    _expect(INSTANCE_ID_RE.fullmatch(expected.instance_id) is not None, "invalid instance ID")
    _expect(GROUP_ID_RE.fullmatch(expected.security_group_id) is not None, "invalid security group ID")
    _expect(RULE_ID_RE.fullmatch(expected.wireguard_rule_id) is not None, "invalid SG rule ID")
    _expect(VPC_ID_RE.fullmatch(expected.vpc_id) is not None, "invalid VPC ID")
    _expect(SUBNET_ID_RE.fullmatch(expected.subnet_id) is not None, "invalid subnet ID")
    _expect(
        EIP_ALLOCATION_ID_RE.fullmatch(expected.eip_allocation_id) is not None,
        "invalid EIP allocation ID",
    )
    _expect(
        ROUTE_TABLE_ID_RE.fullmatch(expected.route_table_id) is not None,
        "invalid route table ID",
    )
    public_ip = ipaddress.ip_address(expected.public_ip)
    _expect(public_ip.version == 4 and not public_ip.is_private, "public IP must be public IPv4")
    sgp_network = ipaddress.ip_network(expected.sgp_cidr, strict=True)
    _expect(sgp_network.version == 4 and sgp_network.prefixlen == 32, "SGP source must be IPv4 /32")
    _expect(1 <= expected.wireguard_port <= 65535, "invalid WireGuard port")


def _rule_covers_port(rule: dict[str, Any], port: int) -> bool:
    if rule.get("IsEgress", False):
        return False
    protocol = str(rule.get("IpProtocol", ""))
    if protocol == "-1":
        return True
    if protocol not in {"udp", "17"}:
        return False
    from_port = rule.get("FromPort")
    to_port = rule.get("ToPort")
    if from_port is None or to_port is None:
        return True
    return int(from_port) <= port <= int(to_port)


def _is_exact_wireguard_rule(
    rule: dict[str, Any], *, port: int, expected_cidr: str
) -> bool:
    return (
        not rule.get("IsEgress", False)
        and str(rule.get("IpProtocol", "")) in {"udp", "17"}
        and rule.get("FromPort") == port
        and rule.get("ToPort") == port
        and rule.get("CidrIpv4") == expected_cidr
        and not rule.get("CidrIpv6")
        and not rule.get("PrefixListId")
        and not rule.get("ReferencedGroupInfo")
    )


def audit_wireguard_rules(
    rules: Iterable[dict[str, Any]], *, port: int, expected_cidr: str, expected_rule_id: str
) -> dict[str, Any]:
    relevant = [rule for rule in rules if _rule_covers_port(rule, port)]
    exact = [
        rule
        for rule in relevant
        if _is_exact_wireguard_rule(rule, port=port, expected_cidr=expected_cidr)
    ]
    unsafe = [rule for rule in relevant if rule not in exact]

    _expect(len(exact) == 1, f"expected one exact WireGuard ingress rule; observed {len(exact)}")
    _expect(not unsafe, f"observed {len(unsafe)} duplicate, foreign or overly broad WireGuard rule(s)")
    _expect(
        exact[0].get("SecurityGroupRuleId") == expected_rule_id,
        "the exact WireGuard rule ID differs from the rollback record",
    )

    return {
        "port": port,
        "expected_source_cidr": expected_cidr,
        "relevant_rule_count": len(relevant),
        "exact_rule_count": len(exact),
        "unsafe_rule_count": len(unsafe),
        "exact_rule_id": exact[0]["SecurityGroupRuleId"],
    }


def _effective_route_table(ec2: Any, *, vpc_id: str, subnet_id: str) -> dict[str, Any]:
    explicit = ec2.describe_route_tables(
        Filters=[{"Name": "association.subnet-id", "Values": [subnet_id]}]
    )["RouteTables"]
    if explicit:
        return _one(explicit, "subnet-associated route table")
    main = ec2.describe_route_tables(
        Filters=[
            {"Name": "vpc-id", "Values": [vpc_id]},
            {"Name": "association.main", "Values": ["true"]},
        ]
    )["RouteTables"]
    return _one(main, "main VPC route table")


def verify_live_inventory(sts: Any, ec2: Any, expected: ExpectedInventory) -> dict[str, Any]:
    _validate_expected(expected)

    identity = sts.get_caller_identity()
    _expect(identity.get("Account") == expected.account_id, "STS account mismatch")
    expected_role_fragment = f":assumed-role/{expected.role_name}/"
    _expect(expected_role_fragment in str(identity.get("Arn", "")), "STS role mismatch")

    reservations = ec2.describe_instances(InstanceIds=[expected.instance_id])["Reservations"]
    instances = [instance for reservation in reservations for instance in reservation["Instances"]]
    instance = _one(instances, "EC2 instance")
    _expect(instance.get("State", {}).get("Name") == "running", "EC2 instance is not running")
    _expect(instance.get("VpcId") == expected.vpc_id, "instance VPC mismatch")
    _expect(instance.get("SubnetId") == expected.subnet_id, "instance subnet mismatch")
    _expect(instance.get("PublicIpAddress") == expected.public_ip, "instance public IP mismatch")
    attached_groups = {group["GroupId"] for group in instance.get("SecurityGroups", [])}
    _expect(expected.security_group_id in attached_groups, "expected security group is not attached")

    vpc = _one(ec2.describe_vpcs(VpcIds=[expected.vpc_id])["Vpcs"], "VPC")
    _expect(vpc.get("State") == "available", "VPC is not available")
    subnet = _one(ec2.describe_subnets(SubnetIds=[expected.subnet_id])["Subnets"], "subnet")
    _expect(subnet.get("State") == "available", "subnet is not available")
    _expect(subnet.get("VpcId") == expected.vpc_id, "subnet VPC mismatch")
    group = _one(
        ec2.describe_security_groups(GroupIds=[expected.security_group_id])["SecurityGroups"],
        "security group",
    )
    _expect(group.get("VpcId") == expected.vpc_id, "security group VPC mismatch")

    address = _one(ec2.describe_addresses(PublicIps=[expected.public_ip])["Addresses"], "EIP")
    _expect(address.get("AllocationId") == expected.eip_allocation_id, "EIP allocation mismatch")
    _expect(address.get("InstanceId") == expected.instance_id, "EIP is not associated with the instance")
    _expect(address.get("Domain") == "vpc", "EIP is not VPC-scoped")

    route_table = _effective_route_table(ec2, vpc_id=expected.vpc_id, subnet_id=expected.subnet_id)
    _expect(
        route_table.get("RouteTableId") == expected.route_table_id,
        "effective route table differs from the owner record",
    )

    rules = ec2.describe_security_group_rules(
        Filters=[{"Name": "group-id", "Values": [expected.security_group_id]}]
    )["SecurityGroupRules"]
    wireguard_audit = audit_wireguard_rules(
        rules,
        port=expected.wireguard_port,
        expected_cidr=expected.sgp_cidr,
        expected_rule_id=expected.wireguard_rule_id,
    )

    metadata = instance.get("MetadataOptions", {})
    profile_arn = instance.get("IamInstanceProfile", {}).get("Arn")
    d2_blockers: list[str] = []
    if profile_arn:
        d2_blockers.append("INSTANCE_PROFILE_ATTACHED")
    if metadata.get("HttpTokens") != "required":
        d2_blockers.append("IMDSV2_NOT_REQUIRED")
    if int(metadata.get("HttpPutResponseHopLimit", 0)) > 1:
        d2_blockers.append("IMDS_HOP_LIMIT_EXCEEDS_ONE")

    return {
        "schema_version": 1,
        "status": "IAM_INVENTORY_VERIFIED",
        "checked_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "identity": {
            "account_id": identity["Account"],
            "arn": identity["Arn"],
            "role_name": expected.role_name,
        },
        "infrastructure": {
            "region": expected.region,
            "instance_id": instance["InstanceId"],
            "instance_type": instance.get("InstanceType"),
            "availability_zone": instance.get("Placement", {}).get("AvailabilityZone"),
            "vpc_id": vpc["VpcId"],
            "subnet_id": subnet["SubnetId"],
            "security_group_id": group["GroupId"],
            "eip_allocation_id": address["AllocationId"],
            "route_table_id": route_table["RouteTableId"],
        },
        "wireguard_ingress": wireguard_audit,
        "instance_identity_boundary": {
            "instance_profile_attached": bool(profile_arn),
            "metadata_http_tokens": metadata.get("HttpTokens"),
            "metadata_hop_limit": metadata.get("HttpPutResponseHopLimit"),
            "d2_blockers": d2_blockers,
        },
        "verified_api_actions": [
            "sts:GetCallerIdentity",
            "ec2:DescribeInstances",
            "ec2:DescribeVpcs",
            "ec2:DescribeSubnets",
            "ec2:DescribeSecurityGroups",
            "ec2:DescribeAddresses",
            "ec2:DescribeRouteTables",
            "ec2:DescribeSecurityGroupRules",
        ],
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-account", required=True)
    parser.add_argument("--region", required=True)
    parser.add_argument("--expected-role-name", required=True)
    parser.add_argument("--instance-id", required=True)
    parser.add_argument("--public-ip", required=True)
    parser.add_argument("--security-group-id", required=True)
    parser.add_argument("--vpc-id", required=True)
    parser.add_argument("--subnet-id", required=True)
    parser.add_argument("--expected-eip-allocation-id", required=True)
    parser.add_argument("--expected-route-table-id", required=True)
    parser.add_argument("--expected-sgp-cidr", required=True)
    parser.add_argument("--expected-wireguard-rule-id", required=True)
    parser.add_argument("--wireguard-port", type=int, default=51820)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        import boto3  # Imported lazily so fixture tests need no AWS dependency.

        expected = ExpectedInventory(
            account_id=args.expected_account,
            region=args.region,
            role_name=args.expected_role_name,
            instance_id=args.instance_id,
            public_ip=args.public_ip,
            security_group_id=args.security_group_id,
            vpc_id=args.vpc_id,
            subnet_id=args.subnet_id,
            eip_allocation_id=args.expected_eip_allocation_id,
            route_table_id=args.expected_route_table_id,
            sgp_cidr=args.expected_sgp_cidr,
            wireguard_rule_id=args.expected_wireguard_rule_id,
            wireguard_port=args.wireguard_port,
        )
        report = verify_live_inventory(
            boto3.client("sts", region_name=args.region),
            boto3.client("ec2", region_name=args.region),
            expected,
        )
    except VerificationError as exc:
        print(json.dumps({"status": "IAM_INVENTORY_REJECTED", "reason": str(exc)}), file=sys.stderr)
        return 1
    except Exception as exc:  # SDK errors are redacted to type + stable service code only.
        error = getattr(exc, "response", {}).get("Error", {})
        reason = error.get("Code") or type(exc).__name__
        print(json.dumps({"status": "IAM_INVENTORY_ERROR", "reason": reason}), file=sys.stderr)
        return 2

    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
