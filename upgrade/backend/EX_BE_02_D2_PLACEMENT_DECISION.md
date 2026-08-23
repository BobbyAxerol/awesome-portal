# EX-BE-02-LIVE — D2 shared-host minimal Edge decision

> Status: `D2_SHARED_HOST_REALIGNMENT_COMPLETE / LIVE_D2_UNAUTHORIZED`  
> Owner decision: 2026-08-23  
> Runtime state: `D1_NETWORK_ACCEPTED / APPLICATION_DARK`

## 1. Locked placement

The full Portal remains on the SGP Research server. AWS-HK runs only the
Portal-owned compatibility and projection boundary required to communicate
with the Trading System:

```text
SGP Portal Web + TypeScript Control API
  -> WireGuard + TLS 1.3 mTLS + delegated JWT
  -> AWS-HK shared execution host
       -> Rust Execution Edge
       -> Portal Source Proxy
       -> Portal projection PostgreSQL + one-shot migrator
       -> Trading System loopback gateway (exact published routes only)
```

`DEDICATED_SPLIT_PORTAL_CELL` is withdrawn. No new EC2 instance, EIP, D1B
carrier or second Portal deployment is authorized or required. The future
AWS-HK emergency UI profile from v0.5 is deferred and is not part of D2-D4.

The Source Proxy remains on the existing host because the Trading System
publishes its Portal-compatible gateway only on `127.0.0.1:8000`. It is Portal
code, uses a read-only filesystem and exact route allowlist, and never grants
Portal direct PostgreSQL, Redis, CLI, SSH or broker access.

## 2. Resource decision

The two historical OOM exits were non-Portal candidate workers with 256 MiB
hard limits. No Portal D2 service had been started. They are retained as owner-
reviewed shared-host evidence, not attributed to the Portal.

The D2 resource envelope is deliberately large enough for the minimal Edge but
still bounded so an Edge fault cannot consume Trading System headroom:

| Service | CPU ceiling | Memory ceiling | Long-running reservation |
|---|---:|---:|---:|
| Rust Execution Edge | 2.00 | 2,048 MiB | 0.75 CPU / 512 MiB |
| Projection PostgreSQL | 1.50 | 2,048 MiB | 0.50 CPU / 512 MiB |
| Source Proxy | 0.50 | 512 MiB | 0.10 CPU / 128 MiB |
| One-shot migrator | 1.00 | 1,024 MiB | none after completion |

Peak startup ceiling is 5.00 CPU and 5,632 MiB. Long-running ceiling is 4.00
CPU and 4,608 MiB. These are per-container hard ceilings, not expected steady-
state consumption or reservations; raising them prevents an artificial small
container limit from becoming the OOM cause while the baseline/delta gate still
protects Trading System headroom. The last read-only inventory observed 8 CPUs, about 16 GiB
RAM and about 9.3 GiB available; D2 observation must retain at least 4 GiB.

## 3. Baseline/delta admission

The former absolute `io.full avg10 <= 5%` admission is retired for D2. The
shared host already sustained roughly 7.4-7.9% before Portal existed, so an
absolute threshold could not attribute impact to the change under review.

D2 now has two machine-checked stages:

1. `preflight` records the accepted shared-host baseline before any Portal
   container exists. Elevated I/O remains a visible warning. Capacity,
   memory-pressure, NTP, listener, ownership and historical-OOM review remain
   hard gates.
2. `observation` compares the running dark stack with that exact baseline.
   It rejects a different host boot or a baseline older than 30 minutes, and
   requires the expected Edge/Proxy/PostgreSQL count, at least 4 GiB available
   memory and bounded positive CPU/memory/I/O PSI deltas. Any Trading System
   health or latency regression remains an immediate manual rollback trigger
   even if the aggregate pressure delta passes.

Canonical commands:

```bash
sudo -n python3 scripts/execution-d2-host-admission.py \
  --acknowledge-historical-oom D2_NON_PORTAL_OOM_REVIEWED \
  > /secure/path/d2-preflight.json

sudo -n python3 scripts/execution-d2-host-admission.py \
  --mode observation \
  --baseline-report /secure/path/d2-preflight.json \
  --expected-portal-containers 3 \
  --acknowledge-historical-oom D2_NON_PORTAL_OOM_REVIEWED
```

The runbook takes repeated observations during a bounded soak. One passing
sample is not production evidence.

## 4. Storage decision

D2 remains `LOCAL_DARK_NO_INGESTION`: it stores schema only and no Trading
System business data. The existing unencrypted root volume is therefore not
accepted for D4 Paper projections.

Before D4, attach a separately approved encrypted gp3 EBS volume to the same
EC2 instance (or use another explicitly approved encrypted PostgreSQL
boundary), move the Portal projection volume there, and prove backup/restore,
capacity and I/O ownership. This is storage isolation, not a new Portal host.

## 5. IAM lifecycle

Keep the D1 operator policy and add the exact-instance D2 isolation policy to
the same temporary role for the bounded change window. Before any D2 pull:

1. verify `ModifyInstanceMetadataOptions` authorization;
2. require IMDSv2 tokens and apply the reviewed hop-limit;
3. disassociate the temporary instance profile;
4. prove no Portal workload, including host-network Source Proxy, can obtain
   instance-profile credentials.

[`execution-d2-isolation.py`](../../scripts/execution-d2-isolation.py) makes
this order executable. Its verify mode accepts only EC2 `DryRunOperation` and
changes nothing. Its activate mode requires an explicit <=2-hour UTC window
and confirmation token, validates the exact instance/profile/association,
waits for hop-limit one to be applied, detaches only that association and then
requires the IMDS role-credential endpoint to be absent. A failure starts no
Portal service and cannot silently reattach or widen IAM authority.

The existing D1 IAM role may remain dormant for audit/rollback after its D2
isolation policy has been added; it must not be deleted merely to deploy D2.
The instance profile
must not remain attached while Portal workloads run.

## 6. Remaining gates

1. publish signed Edge/Proxy images from the exact reviewed commit;
2. stage separate workload mTLS/JWKS identities;
3. pass D2 readiness authorization, IAM isolation and preflight baseline;
4. deploy source-dark services inside an explicit change window;
5. run the baseline/delta soak and rollback rehearsal;
6. open D3 and D4 only through their separate owner gates.

Claude keeps every Execution delivery profile at `fixture`, all source/stream/
query/command flags false and Lane B inactive until accepted activation
evidence is published.
