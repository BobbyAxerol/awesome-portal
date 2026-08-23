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
