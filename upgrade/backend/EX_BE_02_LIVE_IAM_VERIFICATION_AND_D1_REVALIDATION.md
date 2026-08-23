# EX-BE-02-LIVE — IAM verification and D1 revalidation

> Status: `IAM_VERIFIED / D1_REVALIDATED / APPLICATION_DARK`  
> Evidence date: 2026-08-23 UTC  
> Scope: read-only AWS control-plane inventory plus peer-only D1 checks  
> Trading System impact: none; only its public loopback health endpoint was read

This checkpoint requalified the already-accepted D1 carrier after the owner
attached the scoped IAM policy. It did not create, modify or revoke an AWS
rule, restart WireGuard, start a Portal service, query a business endpoint or
change the Trading System.

## 1. IAM evidence

The new [`execution-iam-verify.py`](../../scripts/execution-iam-verify.py)
utility ran on AWS-HK through the instance role and accepted all of the
following against the private mode-0600 owner record:

- `sts:GetCallerIdentity` returned the expected AWS account and the scoped D1
  operator role for the expected instance;
- the instance is running in the expected region/AZ, VPC and subnet with the
  expected Security Group;
- the Elastic IP is a VPC EIP, has the expected allocation ID and is associated
  with the expected instance;
- the subnet's effective route table matches the recorded route-table ID;
- the Security Group contains exactly one ingress rule covering UDP 51820;
  that rule is the privately recorded rollback rule, has the exact port and
  exact SGP `/32`, with zero duplicate, wildcard, ranged or foreign rules;
- all eight required STS/EC2 read APIs succeeded through the real role.

The exact account, IP, instance, VPC, subnet, SG, EIP, route-table and rule IDs
remain outside Git. The verifier strips SDK response metadata and never reads,
prints or stores credentials. Its rule-audit fixture suite covers exact,
duplicate, broad-CIDR, broad-port/all-traffic and rollback-ID drift cases.

`AWS_EIP_ALLOCATION_ID` and `AWS_ROUTE_TABLE_ID` are now populated in the
private owner input, which remains a non-symlink mode-0600 Bobby-owned file.

## 2. D1 two-cell revalidation

Both SGP and AWS-HK currently report `wg-quick@portal0` active and enabled.
The two peers have current handshakes, use only the locked `/30` addresses and
passed three peer-only ICMP probes in each direction with zero loss and roughly
35 ms observed round-trip time. The connected route is only the Portal `/30`;
no default or broad VPC route was introduced.

From SGP, the AWS public address rejected TCP 8443 and 8444. AWS-HK had no
8443/8444 listener. Neither cell had a running Execution Edge, Source Proxy,
projection or ingestor container. The Trading System public loopback health
endpoint remained HTTP 200 after the peer test. No account, alpha, order, fill,
position, event, DB, Redis, CLI or broker route was called.

This proves only `D1_NETWORK_ACCEPTED / APPLICATION_DARK`; it is not D2, D3 or
source availability evidence.

## 3. D2 stop-gates discovered by the same verifier

The live report intentionally surfaced two blockers rather than hiding them:

1. the temporary D1 operator instance profile is still attached to the shared
   AWS-HK host;
2. IMDSv2 is required, but the metadata response hop limit is still two.

Before D2 starts any host-network or bridge workload, the operator profile must
be detached and the post-detach absence of workload credentials re-proven. A
hop limit of one is the preferred independent defense. D2 also still requires
signed immutable Edge/Proxy images, accepted HIGH-vulnerability dispositions,
real workload PKI/JWKS, admitted host/DB/backup/observability budgets and a
separate owner change window.

## 4. Verification record

- IAM verifier fixture tests: 5 passed;
- live STS/EC2 verifier: `IAM_INVENTORY_VERIFIED`;
- relevant WireGuard ingress rules: 1 exact, 0 unsafe;
- SGP→AWS and AWS→SGP peer probes: 3/3 each, 0% loss;
- public 8443/8444: denied;
- AWS private 8443/8444 listeners: absent;
- Execution Portal containers: absent on both cells;
- Trading System public health: HTTP 200.

## 5. Frontend coordination

Claude continues fixture/dark/unavailable/auth-denied/recovery states only.
The frontend must keep `source_available=false`, `stream_available=false`, the
delivery profile `fixture`, EventSource/commands off and must not poll AWS-HK.
No consumer change is unlocked by IAM or D1 revalidation.
