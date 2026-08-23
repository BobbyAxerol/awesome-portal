# EX-BE-02-LIVE — D2 host and cloud admission checkpoint

> Status: `D2_ADMISSION_REJECTED / APPLICATION_DARK`  
> Evidence date: 2026-08-23 UTC  
> Scope: read-only AWS SG/host-capacity admission; no D2 service was started

This checkpoint adds quantitative stop-gates before the first live D2 pull or
container creation. It preserves the accepted D1 carrier and does not touch the
Trading System.

## 1. Accepted controls

The AWS IAM verifier now also rejects any ingress rule covering TCP/UDP 5432,
8443 or 8444, including exact, ranged and all-traffic rules. The live SG had
zero rule covering those ports. Unit coverage now includes seven exact,
duplicate, broad, rollback-drift and prohibited-port cases.

The new [`execution-d2-host-admission.py`](../../scripts/execution-d2-host-admission.py)
gate reads only aggregate host state and does not print container names,
environment variables, mounts or image credentials. The accepted current
facts are:

- 8 logical CPUs;
- more than 8 GiB memory available;
- more than 50 GiB Docker filesystem space available;
- zero current memory full-pressure;
- synchronized NTP;
- no 5432/8443/8444 listener;
- no running Execution Edge, Source Proxy, projection or ingestor container;
- `portal-runtime` and all four D1 runtime directories retain the expected
  root/group ownership and mode.

Its four fixture tests cover parsing, a healthy shared host, combined
capacity/pressure/collision/identity rejection and explicit historical-OOM
review behavior.

## 2. Rejected controls

The live result is deliberately `D2_HOST_ADMISSION_REJECTED` because:

1. I/O full-pressure `avg10` was 8.45%, above the locked 5% D2 gate;
2. two historical OOM-killed containers exist and Bobby has not yet recorded
   the separate `D2_HISTORICAL_OOM_REVIEWED` disposition.

The shared host also has no swap and 30 running containers. Those remain
visible warnings, not hidden pass conditions. The OOM acknowledgement never
overrides live pressure, memory, disk, NTP, listener, identity or ownership
gates.

The cloud identity gate separately remains rejected for D2 workloads because
the temporary D1 instance profile is attached and IMDS hop-limit is two.

## 3. Image and owner-window state

The D2/D3 publication workflow is committed and the deployment branch is
pushed, but the workflow revision is not yet present on the default branch.
Therefore no accepted GHCR Edge/Proxy digest, provenance/SBOM, Trivy report,
HIGH disposition or OIDC Cosign signature exists yet. A green local image gate
does not substitute for that evidence.

D2 has no open owner window. No image was pulled on AWS-HK, no runtime identity
was installed, no role was detached, no IMDS setting was changed and no Docker
network/container/volume was created.

## 4. Exact next gates

1. Bobby merges the reviewed feature flow through `dev` and then the release
   PR to `main`, preserving the repository branch rules.
2. Run **Build and publish Portal images** at the exact deployment commit with
   scope `execution-d2`; review all HIGH findings and retain the artifact.
3. Provision and verify real, separate D2 workload PKI/JWKS.
4. Record Bobby's historical-OOM/resource-budget decision and wait for a fresh
   host admission result below every locked pressure threshold.
5. Open a separate bounded D2 change window; harden IMDS to hop-limit one and
   detach the temporary instance profile before any Portal workload starts.
6. Only then run D2 readiness, dark deployment and rollback rehearsal.

## 5. Frontend coordination

Claude continues only fixture/dark/unavailable/recovery UX. The frontend must
not treat a capacity or IAM result as source availability. Registry profile,
Query, analytics, SSE, Lane B and commands remain off.

## 6. Requalification and root cause — 2026-08-23 05:43 UTC

The repeated live gate remained `D2_HOST_ADMISSION_REJECTED` with I/O
full-pressure 7.93%, current memory full-pressure zero, about 9.3 GB available
memory and no Portal workload/listener collision. This is persistent storage
contention, not a Portal process: a three-second sample attributed about
13 MiB/s of writes to existing source/stream workloads. The single gp3 root
volume is provisioned for 3,000 IOPS; CloudWatch over 30 minutes observed about
122,421 write operations/minute on average (~2,040 IOPS) and a maximum of
181,642/minute (~3,027 IOPS), with average queue length 1.86 and maximum 2.73.

The two historical OOM records are also non-Portal candidate workers. Both had
a hard 256 MiB memory limit, exited 137 with `OOMKilled=true` on 2026-08-22 and
were not restarted. A currently running sibling was observed near that same
limit, so historical review cannot be treated as a harmless stale artifact.
Codex did not stop, resize or reconfigure any of those workloads.

The root volume is not encrypted. D2's locked
`LOCAL_DARK_NO_INGESTION` empty-schema pilot may not contain business data, and
D4 must not store Paper projections there. D4 retains its independently
approved encrypted projection-store boundary.

The IAM role still lacks D2 isolation authority:
`ModifyInstanceMetadataOptions` with `DryRun=true` returned
`UnauthorizedOperation`. `DisassociateIamInstanceProfile` has no DryRun input,
so it was not invoked. A separate exact-instance private policy and an
unauthorized mode-0600 D2 owner-input were prepared outside Git; an AWS admin
must attach/verify that policy before any D2 window. No AWS, Docker, WireGuard,
Trading System or Portal runtime state changed during this requalification.

Safe resolution remains one of the following owner decisions:

1. use a dedicated Portal Execution Edge host/storage boundary in AWS-HK;
2. open D2 only during a demonstrably admitted low-pressure window after the
   Trading System owner reviews the OOM evidence; or
3. let the Trading System/infrastructure owner independently remediate its
   storage and worker budgets, then rerun the unchanged Portal gate.

Codex has no authority to implement option 3 or weaken the 5% admission limit.
