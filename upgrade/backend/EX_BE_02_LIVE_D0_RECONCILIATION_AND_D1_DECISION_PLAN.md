# EX-BE-02-LIVE — D0 Reconciliation and D1 Decision Plan

> Status: `D0_EVIDENCE_COMPLETE / D1_OWNER_DECISION_PENDING`  
> Evidence date: 2026-08-22 UTC  
> Scope: Portal-owned SGP↔AWS-HK integration boundary only  
> Production delivery profile: `fixture`; all Execution runtime flags remain `false`

This document reconciles the read-only discovery evidence from both cells and
defines the smallest reversible D1 network bootstrap. It does **not** authorize
D1, deploy a Portal service, read Trading System business data, or change the
Trading System.

The reviewable offline assets for that bootstrap are now complete and remain
unexecuted. See
[EX-BE-02-LIVE D1 offline preparation](./EX_BE_02_LIVE_D1_OFFLINE_PREPARATION.md)
and the linked preflight/rollback runbook. This does not change this document's
`D1_OWNER_DECISION_PENDING` runtime status.

Authoritative inputs:

- [AWS-HK D0 request and response](./EX_BE_02_LIVE_AWS_HK_DISCOVERY_AND_SAFE_BOOTSTRAP_REQUEST.md)
- [EX-BE-02 mTLS/delegated-auth contract](./EX_BE_02_MTLS_DELEGATED_AUTH_AND_PROBES.md)
- [Execution Loop backend master plan](../EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md)
- [EX-BE-08a offline qualification](./EX_BE_08A_OFFLINE_SOURCE_QUALIFICATION.md)
- [D1 offline preparation package](./EX_BE_02_LIVE_D1_OFFLINE_PREPARATION.md)

## 1. D0 result

Evidence collection is complete, but deployment readiness is intentionally
partial. Both cells can support the target boundary after owner decisions and
resource admission; neither cell has been configured for the live link.

| Gate | Result | Meaning |
|---|---|---|
| AWS-HK read-only discovery | `EVIDENCE_COMPLETE / READINESS_PARTIAL` | Contract surface is compatible; endpoint, PKI, DB and resource decisions remain |
| SGP read-only discovery | `EVIDENCE_COMPLETE / READINESS_PARTIAL` | Host has headroom and candidate network values are locally free; tools, keys, route and firewall are absent |
| Trading System compatibility | `COMPATIBLE_WITH_DRIFT` | Public contract/OpenAPI match; runtime image differs from the frozen pack and must remain an explicit adapter identity |
| Cross-cell connectivity | `NOT_ATTEMPTED` | No WireGuard peer, mTLS identity or approved endpoint exists |
| Authenticated source read | `NOT_ATTEMPTED` | Dedicated Portal read identity has not been issued |
| Source/projection activation | `PRODUCTION_INACTIVE` | No mapper, BUILDING epoch, query, SSE or command flag was enabled |

No package, key, directory, route, firewall rule, Docker network, container,
database, DNS record or cloud security-group rule was created or changed during
D0. Exact public IPs and credentials are deliberately absent from Git.

## 2. Sanitized evidence by cell

### 2.1 AWS-HK Execution Cell

- Ubuntu 24.04/x86_64, 8 logical CPUs and approximately 16.5 GB RAM; no swap.
- Current free disk and memory are not sufficient admission evidence by
  themselves: three Trading System candidate containers previously exited 137
  with `OOMKilled=true`, and I/O pressure was elevated at observation time.
- WireGuard kernel support exists; `wg`/`wg-quick` are not installed.
- Candidate `10.70.0.0/30`, UDP 51820, edge TCP 8443 and source-proxy TCP 8444
  showed no local conflict. AWS route tables and security groups were not
  available in D0, so these remain candidates rather than allocations.
- Trading System gateway is loopback-only at `127.0.0.1:8000`. Four public
  health/contract probes succeeded with low local latency; no authenticated
  alpha/account/order/fill/position payload was requested.
- The public OpenAPI and 91-route surface match the frozen pack. Runtime image
  identity drift exists and must be carried in capability/adapter evidence.
- No suitable existing source proxy or Portal projection database exists.
  RDS discovery and backup ownership remain unresolved.

### 2.2 SGP Research Cell

- Ubuntu 22.04/x86_64, 8 logical CPUs, approximately 33.7 GB RAM and 545 GB
  available on the root filesystem at observation time; no swap.
- NTP is synchronized in UTC. CPU, memory and I/O full-pressure metrics were
  zero at the sample, but this is a point-in-time observation, not an SLO.
- The host is shared: 30 of 39 Docker containers were running and concurrent
  test/collector workloads were present. Several relevant containers have no
  Docker CPU or memory limit. D1/D2 therefore need a change window and an
  explicit resource budget even though host headroom was healthy.
- `bobby` has passwordless `sudo`, but is not a direct member of the Docker
  group. Portal operations must keep using scoped `sudo -n docker`; D1 must not
  weaken this boundary.
- WireGuard kernel support exists; `wg`/`wg-quick` are not installed and no
  `/etc/wireguard` directory was present.
- Existing Docker networks occupy `172.17.0.0/16` through `172.21.0.0/16` in
  the observed set. Candidate `10.70.0.0/30` and `172.23.0.0/24` had no local
  host/Docker route conflict.
- UDP 51820 and TCP 8443/8444 were not listening. UFW is active and currently
  allows SSH only; D1 must add the minimum approved peer rule rather than
  disable UFW.
- A stable SGP egress address and the AWS stable endpoint still require owner
  confirmation through a private channel. Their values must not be committed.

## 3. Locked topology

```text
Browser
  │ same-origin HTTPS; Portal session/RBAC/CSRF
  ▼
SGP Portal Web ── TypeScript Control API
                         │
                         │ WireGuard private /30
                         │ HTTP/2 + TLS 1.3 mutual TLS
                         │ RS256 delegated JWT, aud/resource/env bound, <=60 s
                         ▼
AWS-HK Portal Execution Edge :8443
       │ SELECT-only                     │ query/SSE only
       ▼                                 ▼
Portal-owned projection PostgreSQL   canonical Portal response
       ▲
       │ writer-only
AWS-HK Portal Ingestor
       │ TLS 1.3 mTLS on Portal-only bridge :8444
       ▼
AWS-HK Portal Source Proxy
       │ exact GET allowlist + dedicated TS read identity
       ▼
Trading System gateway 127.0.0.1:8000
```

The browser never connects to AWS-HK directly. SGP never connects to Trading
System DB, Redis, CLI or broker endpoints. The Source Proxy is the only Portal
component allowed to reach the Trading System gateway, and only through the
published versioned GET contract. The full Portal codebase does not run in
AWS-HK.

## 4. Identity and authentication separation

| Boundary | Credential | Verification | Rotation/failure rule |
|---|---|---|---|
| Host operator/deploy | Existing SSH identity | OS/SSH policy | Operator only; never copied into a runtime container or reused below |
| SGP↔AWS private route | One WireGuard key pair per host plus optional PSK | Peer public key + exact tunnel address | Independent overlap/rollback; loss closes route |
| TypeScript→Rust edge | Separate client/server mTLS certificates | Private CA, SAN and expiry | TLS 1.3 only; fail closed before HTTP |
| Portal user delegation | SGP-only RS256 signing key; public JWKS at edge | `iss`/`aud`/`env`/`resource`/role/scope/`exp`/`jti`; max 60 s | No symmetric shared secret; KID overlap and deny on unknown/expired key |
| Ingestor→Source Proxy | Separate workload mTLS certificates | Private CA and exact workload identity | Not interchangeable with edge certificates |
| Source Proxy→TS gateway | Dedicated per-environment read-only TS API credential | Exact allowlist and TS gateway auth | Never sent to SGP/edge/browser/logs; revoke independently |
| Portal projection DB | `migrator`, `writer`, `reader` roles | PostgreSQL TLS/private network | Edge is reader; ingestor is writer; no shared superuser |

WireGuard supplies private routing, not application identity. mTLS authenticates
workloads. The delegated JWT carries the already-authenticated Portal principal
and least-privilege request scope. All three layers are required; SSH is not a
substitute for any of them.

## 5. Resource and placement decision

The recommended production choice is private PostgreSQL 16 on RDS (or an
equivalent managed private service) with PITR, separate roles and restore-test
evidence. A local AWS-HK PostgreSQL container may be considered only for a
time-bounded Paper pilot after an explicit owner exception because:

1. the Execution host already demonstrated OOM kills;
2. host I/O contention would couple Portal projection failure to Trading System;
3. backup, restore and disk-growth ownership is not established;
4. the target design requires independently scalable reader/writer storage.

D1 is network-only and can be admitted separately. D2 service deployment is
blocked until the AWS OOM/I/O review assigns CPU/memory/disk budgets and a
database placement.

## 6. Owner decisions required before D1

No secret value belongs in this checklist. Provide endpoints and key material
through the chosen private delivery channel only.

| Decision | Recommended default | Required owner confirmation |
|---|---|---|
| Tunnel addresses | Candidate `10.70.0.0/30` | AWS route-table and both-host conflict review |
| WireGuard listener | AWS UDP 51820 allowlisted from one stable SGP address | AWS stable endpoint/EIP, SGP stable egress and SG owner |
| Edge listener | TCP 8443 bound only to AWS WireGuard IP | Private DNS or approved IP SAN |
| AWS Portal bridge | Candidate `172.23.0.0/24`; proxy :8444 bridge-only | Final Docker/IPAM allocation and firewall owner |
| Projection database | Private PostgreSQL 16 RDS with PITR | Region/AZ, instance/storage budget, retention/RPO/RTO |
| PKI | Private offline root + controlled intermediate; separate workload certs | CA owner, certificate TTL/rotation overlap and expiry alerts |
| Secret delivery | AWS Secrets Manager/SSM on AWS; root/group-readable runtime files on SGP | Named operator and rotation/revocation process |
| JWT | SGP Control API signs RS256; edge receives public JWKS only | issuer/audience names, KID overlap and emergency revoke owner |
| TS source identity | Dedicated Paper read-only credential, exact GET routes | Trading System owner issuance and revocation |
| Observability | Portal-owned logs/metrics with value-free labels and alerts | destination, retention and on-call owner |
| Resource admission | Limits/reservations for every D2 Portal container | AWS OOM/I/O disposition and SGP change window |
| First scope | Paper + BINANCE USD_M | Owner confirmation; no Live/command scope |

## 7. D1 — smallest reversible network bootstrap

> `DO NOT EXECUTE` until every required item in §6 has an owner and Bobby gives
> explicit D1 authorization. D1 carries no Trading System business traffic.

### D1a — Freeze and preflight

1. Record sanitized host/runtime baseline and coordinate the change window.
2. Verify candidate routes, ports, AWS route tables and security groups again.
3. Verify rollback access remains available over the existing SSH path.
4. Pin the WireGuard package version and record package provenance.

### D1b — Install boundaries and deliver identities

1. Install only `wireguard-tools`; do not change kernels.
2. Create root-owned Portal runtime/config directories and a non-login
   `portal-runtime` group without adding broad Docker/sudo authority.
3. Generate or deliver one host-specific WireGuard private key out of band.
4. Deliver mTLS/JWT material separately; D1 may stage it with least privilege
   but must not start edge/source services.

### D1c — Private route and firewall

1. Add the AWS SG rule for UDP 51820 from the single approved SGP source.
2. Configure the `/30` peers with no default route and no broad VPC routes.
3. Keep TCP 8443 reachable only on the AWS tunnel address.
4. Keep UFW enabled; add only the exact required peer rule. Do not expose
   8443/8444 publicly or VPC-wide.

### D1d — Acceptance and rollback

Acceptance proves only:

- peer handshake and exact tunnel-address reachability;
- no route/DNS regression;
- public ports remain closed;
- SSH recovery path remains available;
- link loss fails closed and does not affect Trading System containers.

Rollback disables the WireGuard units, removes the exact new firewall/SG rules
and routes, and removes only empty D1-owned directories/packages after evidence
capture. It never restarts or edits Trading System.

## 8. Gates after D1

| Gate | Scope | Required exit evidence | Forbidden at this gate |
|---|---|---|---|
| D2 | Portal DB, Source Proxy, ingestor and Rust edge dark deployment | signed images/SBOM, limits, least-privilege DB roles, mTLS identity, readiness and rollback | Source activation, public exposure, TS mutation |
| D3 | Cross-cell public contract/auth probes | H2+mTLS, JWT rejection matrix, capability digest, bounded latency/fault evidence, no credential leakage | Business source ingestion or profile change |
| D4 | Dedicated Paper read source and BUILDING epoch | mapper contract, sealed corpus, reducer/replay parity, gap/freshness/restart/load/restore evidence | ACTIVE cutover or `fixture -> shadow` without a separate owner decision |
| Activation | Promote proven BUILDING epoch and delivery profile | explicit owner approval, rollback rehearsal and Claude failure-state readiness | Command/Live authority |

`EX-BE-05b` remains a separate command runway after the Trading System publishes
and proves its command/auth/idempotency/terminal-outcome capability. Read-path D1
through D4 must not silently unlock it.

## 9. D0 verification record

- AWS-HK: contract manifest 84/84, public loopback probes and sanitized safety
  attestation recorded in the source response; no authenticated probe.
- SGP: OS/capacity/pressure/NTP, kernel/tool availability, route/port conflict,
  UFW state, Docker networks/runtime counts and selected OOM/restart/limit facts
  inspected read-only on the host.
- Repository: D0 response secret scan and whitespace check passed before its
  dedicated commit.
- No exact public IP, private key, certificate, JWT, API key, password, account,
  order, fill, position or broker payload is stored in this record.

## 10. Frontend coordination

Claude may continue wiring canonical fixture and explicit
`unavailable`/`stale`/`partial`/`gap`/`resnapshot` states. Claude must not connect
to AWS-HK, create a second realtime transport, bind live topics, change a
delivery profile, or treat D0/D1 status as source availability. The BE column
stays `OPERATIONAL_EVIDENCE_PENDING` until D4 and activation evidence pass.
