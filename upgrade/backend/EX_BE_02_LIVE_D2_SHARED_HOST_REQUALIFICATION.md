# EX-BE-02-LIVE — D2 shared-host requalification

> Status: `HOST_PREFLIGHT_ACCEPTED / IAM_ISOLATION_NOT_AUTHORIZED / LIVE_D2_UNAUTHORIZED`  
> Evidence date: 2026-08-23 UTC  
> Scope: aggregate-only AWS-HK host inspection and EC2 authorization DryRun  
> Runtime impact: none; no Portal service or Trading System route was started

## 1. Outcome

The owner-approved existing-host placement is viable for the bounded D2 dark
stack. The schema-v2 host gate ran directly on AWS-HK and returned
`D2_HOST_ADMISSION_ACCEPTED` with zero blockers:

- 8 logical CPUs;
- about 8.5 GiB memory available before Portal startup;
- about 57.5 GiB Docker disk available;
- CPU PSI `some` avg10/avg60 about 3.91%/4.65%;
- memory PSI `full` avg10/avg60 0%;
- I/O PSI `full` avg10/avg60 about 7.59%/7.66%, retained as the visible shared
  Trading System baseline rather than misattributed to Portal;
- 34 running non-Portal containers and zero Execution Portal container;
- zero listener collision on 5432/8443/8444;
- NTP synchronized and all Portal runtime ownership checks accepted.

Warnings were `ELEVATED_SHARED_HOST_IO_BASELINE`, `NO_SWAP` and
`SHARED_HOST_HAS_AT_LEAST_30_RUNNING_CONTAINERS`. They do not bypass the
observation gate: D2 must still retain at least 4 GiB available memory and stay
inside the bounded CPU/memory/I/O deltas during its 15-minute soak.

This diagnostic baseline was not saved as deployment evidence and expires
after 30 minutes. A new mode-0600 baseline from the same boot is mandatory in
the real change window.

## 2. IAM isolation result

The live instance still uses the expected temporary D1 operator profile, with
IMDSv2 tokens required and response hop-limit two. There is exactly one active
instance-profile association.

`ModifyInstanceMetadataOptions` with `DryRun=true` for hop-limit one returned
`UnauthorizedOperation` and the stable reason that no identity-based policy
allows the action. Therefore the D2 isolation policy is not effective on the
actual role used by the instance. The policy must be attached to the existing
role `PrimusPortalExecutionD1Operator-v1`; creating a separate role or attaching
it only to another role/profile does not satisfy D2.

`DisassociateIamInstanceProfile` was deliberately not called. That API has no
safe DryRun input, and detachment is reserved for the bounded D2 change window
after publication, workload identity staging and a fresh admitted baseline.

The owner reported attaching the policy and Codex re-ran the exact check at
`2026-08-23T08:36:20Z`. STS proved that the caller is the expected
`PrimusPortalExecutionD1Operator-v1` session on the exact instance and EC2
proved the expected profile association remains stable. The DryRun still
returned `UnauthorizedOperation` with AWS' explicit reason that no identity-
based policy allows `ec2:ModifyInstanceMetadataOptions` on the exact instance.
Read-only IAM policy listing and authorization-message decode are not granted
to the instance role, so they cannot distinguish an unattached policy from a
Permissions boundary or a condition mismatch. Detachment remains prohibited.

Codex repeated the check at `2026-08-23T10:48:40Z` after the owner reported a
new policy attachment. SSH and IMDSv2 resolved the exact running instance
`i-00a12daa5535dc225`; STS resolved the caller to the instance session of
`PrimusPortalExecutionD1Operator-v1`; EC2 returned the single expected stable
association and hop limit two. The repository verifier was streamed to
`python3` without installing a CLI or writing a remote file. The exact
hop-limit-one request again returned `UnauthorizedOperation`. The local private
policy digest was
`sha256:694603b2c3aeb331216f27808d03d786466ee2cd2c7a64e587c6237504a224f1`;
its action, exact instance ARN, region and metadata condition keys are aligned
with the request. The role still cannot list attached/inline policies, inspect
its permissions boundary or decode the denial, so the remaining owner-side
checks are: attach it under the role's **Permissions policies**, make the new
managed-policy version the default if the document was edited, and verify that
neither a permissions boundary nor an Organizations SCP denies the action.
No EC2 setting, profile association, service or network state changed.

A further pair of exact retries at `2026-08-23T11:22:22Z`, including time for
IAM propagation, still returned `UnauthorizedOperation`. The request-parameter
conditions were therefore removed from the private Allow while retaining the
exact instance ARN, exact two actions and `ap-east-1` boundary. The resulting
mode-0600 revision-2 policy has digest
`sha256:bca3ee7d9aa7cc3d27318ce3e27d4e655becd9d7bea5a0b674768c62066fb476`.
It must replace the attached policy document and, for a managed policy, become
the default version before the next DryRun. Status is now
`IAM_POLICY_REVISION_2_REQUIRED / LIVE_D2_UNAUTHORIZED`; no detach or runtime
change occurred. Detail:
[`EX_BE_02_D2_IAM_POLICY_REVISION_2.md`](./EX_BE_02_D2_IAM_POLICY_REVISION_2.md).

## 3. Required order

1. attach the reviewed private D2 isolation policy to the exact existing D1
   operator role under **Permissions policies** (not only as the Permissions
   boundary), then verify the policy attachment in the IAM console;
2. re-run the IMDS hop-limit-one DryRun and require `DryRunOperation`;
3. merge the verified feature through `dev` and the release-ready `main` PR;
4. publish and verify immutable signed Edge/Proxy images;
5. stage workload PKI/JWKS and complete the private D2 owner input;
6. open the bounded change window and capture a fresh same-boot preflight;
7. set IMDS hop-limit one, detach the exact profile association, prove the
   absence of workload credentials, then start only the dark D2 stack;
8. run repeated observation/Trading System health checks for 15 minutes and
   complete the rollback rehearsal.

No D3, D4, frontend live consumer, source read, projection ingestion, Query,
SSE, analytics, command or Trading System mutation is authorized by this
requalification.

## 4. Executable isolation preparation

The ordered change is now implemented by
[`execution-d2-isolation.py`](../../scripts/execution-d2-isolation.py) rather
than left as two independent console actions. `verify` accepts only the exact
IMDS hardening `DryRunOperation`. `activate` requires an explicit confirmation
token and current <=2-hour UTC window, checks the exact running instance,
profile ARN and association ID, waits for hop-limit one, detaches only that
association and then requires the IMDS role-credential endpoint to disappear.

Five fixture tests cover accepted/unauthorized DryRun, association drift,
window bounds and the harden-before-detach-before-absence order. Status is
`D2_ISOLATION_EXECUTABLE_PREPARED / LIVE_D2_UNAUTHORIZED`; no EC2 change was
made by preparation.
