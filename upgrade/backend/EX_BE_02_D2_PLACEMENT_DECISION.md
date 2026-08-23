# EX-BE-02-LIVE — D2 placement decision after repeated AWS-HK rejection

> Status: `D2_PLACEMENT_OWNER_DECISION_REQUIRED / APPLICATION_DARK`  
> Evidence date: 2026-08-23 UTC  
> Scope: Portal-owned infrastructure only; no Trading System implementation,
> container, database, Redis, CLI, broker or business-data change

## 1. Why placement must be decided now

Three live admission observations found the same shared-host condition: I/O
full-pressure remained approximately 7.4–7.9%, above the locked 5% gate. The
single 3,000-IOPS gp3 volume is effectively saturated by existing source/
stream writes, and two non-Portal 256 MiB candidate workers genuinely exited
OOM. The current root volume is also unencrypted, so it cannot hold D4 Paper
projection data.

This is not a reason to weaken the gate or alter Trading System workloads. It
means D2 placement is now an owner architecture/cost decision rather than an
operator timing detail.

## 2. Non-negotiable topology facts

- Trading System publishes the Portal-compatible gateway only on
  `127.0.0.1:8000`.
- The browser never reaches AWS-HK directly.
- SGP Control API reaches only the Rust Execution Edge over WireGuard plus
  HTTP/2/TLS 1.3 mTLS and delegated JWT.
- Only a Portal-owned Source Proxy may reach the Trading System loopback
  gateway, with exact GET routes and a dedicated read identity beginning D4.
- SSH is operator access, never a runtime tunnel or application credential.
- D2 is source-dark; D3 opens only public contract/health probes; D4 is the
  first Paper business-data read.

Consequently, moving every Portal component to a new EC2 host is **not** viable
unless the Trading System owner separately publishes a private, authenticated
gateway contract. No such endpoint exists today.

## 3. Owner choices

### Option A — current shared host

Keep the accepted D1 carrier and original host-local topology:

```text
SGP -> WireGuard -> Edge + projection PG + ingestor
                            -> Source Proxy -> TS loopback
```

Admission requirements remain unchanged:

1. I/O full-pressure below 5% at the immediate preflight and through the dark
   observation window;
2. explicit OOM/resource-budget review;
3. exact-instance IMDS hardening and temporary-profile detachment;
4. signed immutable images and verified workload identities;
5. local projection DB remains empty and ingestion false in D2;
6. a later encrypted DB decision is mandatory before D4.

This has the smallest network change, but repeated evidence makes scheduling
unpredictable and preserves a shared failure domain. It is acceptable only as
a bounded Paper pilot, not the target production placement.

### Option B — dedicated split Portal cell (**recommended**)

Provision a dedicated Portal Execution Edge host in the same AWS-HK VPC and a
private encrypted PostgreSQL/RDS boundary. Keep only the minimal Source Proxy
beside the Trading System loopback:

```text
SGP
  -> WireGuard on dedicated Portal EC2
  -> Rust Edge / ingestor
  -> encrypted private projection PostgreSQL
  -> mTLS over exact VPC peer rule
  -> Source Proxy on existing TS host
  -> 127.0.0.1:8000
```

The Source Proxy is Portal code, not a Trading System change. It has no
persistent volume, no business credential in D2/D3, a read-only filesystem,
all capabilities dropped, <=128 MiB memory, <=0.25 CPU, bounded PIDs/logs and
exact route guards. It may bind only the existing host's private VPC address
and accept 8444 solely from the dedicated Portal host security group via mTLS.

The dedicated host owns:

- the stable WireGuard endpoint and exact SGP `/32` ingress;
- Edge/ingestor containers and Portal-only observability;
- no broad instance profile; workload identities are separately scoped;
- encrypted storage and an independently admitted resource budget;
- no public 8443/8444, database or application ingress.

Minimum Paper-pilot admission is 4 vCPU, 8 GiB RAM, encrypted root storage and
an encrypted private PostgreSQL boundary. Final instance/database class,
storage/IOPS, backup/PITR and RPO/RTO are selected from the measured D4 load
budget, not guessed from D2 idle usage.

This option requires a new D1B migration window because the accepted
WireGuard endpoint changes. Old D1 remains intact until the new peer passes SG,
handshake, route, public-denial and link-loss gates. Rollback restores the old
peer and removes only the new exact SG rules/resources.

### Option C — all Portal components on a dedicated host

Rejected with the current contract. A remote Source Proxy cannot reach
`127.0.0.1:8000`. SSH forwarding, host routing tricks, direct DB/Redis access or
binding the Trading System gateway publicly are prohibited substitutes. This
option becomes reviewable only after the Trading System owner publishes a
versioned private gateway with its own mTLS/auth/rollback contract.

## 4. Required owner decision

Record exactly one value:

```text
D2_PLACEMENT=SHARED_HOST_BOUNDED_PILOT
# or
D2_PLACEMENT=DEDICATED_SPLIT_PORTAL_CELL
```

Choosing the recommended split option also authorizes planning only. Creating
billable EC2/RDS/EIP resources, changing the WireGuard peer or adding the exact
private Source Proxy SG rule still requires a separately bounded D1B change
window and an explicit resource budget.

## 5. Work that remains common to both choices

1. merge the feature flow through `dev` to `main` and publish signed D2/D3
   images from the exact deployment commit;
2. make the exact-instance D2 isolation policy effective and verify IMDS
   DryRun before mutation;
3. provision separate mTLS workload identities and the SGP delegated-JWT key/
   JWKS boundary;
4. run D2 dark deployment and rollback with all source/query/realtime/command
   flags false;
5. open a separate D3 probe window;
6. obtain the Trading System's dedicated Paper read identity before D4;
7. keep activation and Command runway as later independent owner gates.

## 6. Frontend coordination

Placement is invisible to frontend contracts. Claude keeps registry profile
`fixture`, `source_available=false`, `stream_available=false`, Lane B closed
and all Query/analytics/SSE/command controls inactive until Codex publishes an
accepted D2/D3/D4 evidence handoff.
