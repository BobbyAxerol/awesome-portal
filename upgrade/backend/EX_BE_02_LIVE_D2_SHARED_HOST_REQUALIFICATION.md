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
observation gate: D2 must still retain at least 6 GiB available memory and stay
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

## 3. Required order

1. attach the reviewed private D2 isolation policy to the exact existing D1
   operator role;
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
