# EX-BE-02-LIVE — D2 IAM policy revision 2

> Status: `IAM_POLICY_REVISION_2_REQUIRED / LIVE_D2_UNAUTHORIZED`  
> Evidence time: 2026-08-23T11:22:22Z  
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
sha256:bca3ee7d9aa7cc3d27318ce3e27d4e655becd9d7bea5a0b674768c62066fb476
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

