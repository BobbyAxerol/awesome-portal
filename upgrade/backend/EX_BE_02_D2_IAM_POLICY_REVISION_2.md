# EX-BE-02-LIVE — D2 IAM policy revision 2

> Status: `IAM_EFFECTIVE_ALLOW_VERIFIED / LIVE_D2_UNAUTHORIZED`  
> Evidence time: 2026-08-24T10:09:47Z  
> Runtime impact: none

## Result

The owner reported attaching the first D2 isolation policy to the existing
`PrimusPortalExecutionD1Operator-v1` role. Codex then ran the exact repository
verifier twice through that instance session, including a retry after IAM
propagation time. Both `ModifyInstanceMetadataOptions(DryRun=true)` calls were
rejected with `UnauthorizedOperation`. The expected instance, profile ARN and
single stable profile association were unchanged. No metadata option, instance
profile, service, network route or Trading System state was changed.

The first private policy combined the exact-instance Allow with request-
parameter conditions for `HttpTokens=required` and hop limit `1`. Because the
live DryRun did not produce an effective Allow, the private policy has been
revised to keep only:

- the two required EC2 actions;
- the exact AWS-HK instance ARN;
- `aws:RequestedRegion=ap-east-1`.

There is still no wildcard instance resource and no permission to start, stop,
terminate, tag, network, volume or inspect Trading System resources. Parameter
ordering remains fail-closed in the tested operator tool: apply IMDSv2/hop
limit one, verify it, detach the exact association, prove credential absence,
then and only then permit the dark deployment preflight.

Private revision-2 policy:

```text
/home/bobby/secure/portal-execution-d2-isolation-policy.json
sha256:a940447f0f96959e9980c86e16fe7786ec7a1c0e37931fd7cc84ea6be601fd9d
```

The file remains mode `0600` and outside Git.

## Owner action

Update the policy document already attached under the role's **Permissions
policies**. If it is a managed policy, make the revision-2 document the default
version; editing a non-default version is insufficient. Do not set this policy
as a permissions boundary and do not create a replacement role or instance
profile.

After the update, Codex must re-run the exact DryRun and accept only
`DryRunOperation`. If the same denial remains, the owner must inspect the
role's permissions boundary and the account/Organization SCP before any live
D2 work. Instance-profile detachment is still forbidden outside the bounded
change window.

## 2026-08-24 exact recheck

After the owner reported attaching revision 2, Codex streamed the repository
verifier to the existing AWS-HK instance session and repeated the exact
`ModifyInstanceMetadataOptions(DryRun=true)` request against the bound instance,
profile ARN and association ID. AWS again returned `UnauthorizedOperation`.

No IMDS option, profile association, service, network or Trading System state
changed. Revision 2 is therefore syntactically reviewed but still not proven
effective. The owner-side check is now precise:

1. confirm this policy is under the existing role's **Permissions policies**,
   not only a permissions boundary and not on a similarly named replacement;
2. if managed, confirm revision 2 is the **default** policy version;
3. inspect the role permissions boundary and Organization SCP for an explicit
   deny of `ec2:ModifyInstanceMetadataOptions`;
4. do not delete the role or detach its profile merely to bypass this check.

The next backend action remains the same read-only DryRun. Detachment is still
reserved for the approved D2 change window after image, identity and fresh-host
admission gates pass.

## 2026-08-24 revision-2 acceptance

Bobby confirmed that revision 2 is the default version of the permissions
policy attached to the exact existing role, with no permissions boundary. Codex
then streamed the repository verifier to the AWS-HK instance and repeated the
exact request using:

- region `ap-east-1`;
- instance `i-00a12daa5535dc225`;
- association `iip-assoc-080fb4d501260d3da`; and
- profile `PrimusPortalExecutionD1Operator-v1`.

The verifier exited zero with `D2_ISOLATION_AUTHORITY_VERIFIED`. Its only write-
class EC2 call had `DryRun=true`; AWS returned the required `DryRunOperation`.
The instance remained running with IMDSv2 tokens required, hop limit two and the
single expected profile association. No EC2 setting, profile association,
Portal service, network route or Trading System state changed.

`BE-V2-A` is accepted. This is permission evidence only: live D2 remains
unauthorized until signed-image, workload-identity, fresh shared-host admission,
owner-input and bounded change-window gates pass. In particular, profile
detachment and IMDS hop-limit one remain reserved for the separately authorized
activation sequence.
