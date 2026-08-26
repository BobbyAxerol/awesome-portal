# Execution Loop Backend Unified Plan and Guide

> **Backend owner:** Codex  
> **Frontend owner:** Claude  
> **Product/release owner:** Bobby  
> **Baseline:** `dev` at `bacbcee`, 2026-08-25  
> **Document status:** `COORDINATION_AUTHORITY_ACTIVE / IMPLEMENTATION_NOT_AUTHORIZED_BY_THIS_FILE`  
> **Scope:** Portal Execution Loop backend, Paper read integration, Trading System compatibility,
> activation, hardening and every current/future Claude backend request.

---

## 0. Why this file exists

This is the one file Bobby needs to read to answer four questions:

1. Backend is actually at which milestone?
2. What remains, in what order, and what may run in parallel?
3. Which request from Claude is closed, still open, externally blocked or awaiting an owner
   decision?
4. What evidence is required before a screen may move from fixture to shadow, Paper, Sandbox,
   Canary or Live?

Older Markdown files remain immutable design/evidence records. They are not deleted and are not
rewritten into this file. Their purpose after this consolidation is:

- published contract and machine evidence;
- detailed implementation notes for a completed slice;
- runbook/evidence for an owner window;
- historical decisions and rejected approaches.

They are **not** separate active roadmaps. From this revision onward, new backend sequencing,
current status and Claude request intake are recorded here first. Repo-required indexes may carry a
short pointer/status line, but this file remains the readable coordination authority.

### 0.1 Authority order

When documents disagree, use this order:

1. observed, sanitized runtime evidence from the exact accepted image/commit/window;
2. published machine-readable Trading System contract and Portal schema/OpenAPI;
3. source code and executable tests at the named commit;
4. architecture guides v0.4, v0.5, v0.6 and the DB schema guide;
5. this unified plan for status, sequencing and request ownership;
6. historical master plans, trackers, roadmaps, reviews and prose handoffs.

The higher authority does not silently override this file. The same change must record the drift,
new evidence and updated status here.

### 0.2 What this file does not authorize

Adding an item or marking a contract complete never authorizes:

- a Trading System code, database, Redis, broker, CLI or host mutation;
- enabling Source Proxy, Query, analytics, SSE or commands;
- changing a registry `delivery_profile`;
- opening AWS/network traffic;
- merging to `dev`/`main` or releasing stable;
- treating a fixture, BUILDING epoch or finite shadow run as production authority.

Only Bobby opens a named change window, approves activation and merges a reviewed branch.

---

## 1. Locked architecture and responsibility boundary

### 1.1 Deployment topology

```text
User browser
    |
    | same-origin HTTPS + Portal session/CSRF
    v
SGP Research Server
    TypeScript Control API / BFF
    PostgreSQL control-plane state
    Portal web, governance, registry, workflow, audit
    |
    | private WireGuard
    | HTTP/2 + TLS 1.3 mTLS
    | delegated short-lived JWT
    v
AWS-HK Execution Cell
    Rust Portal Execution Edge
    Rust projection/query/analytics/realtime/relay boundaries
    encrypted Portal-owned projection storage
    |
    | loopback-only, exact allowlisted contract
    v
Trading-System-owned Source Proxy / Trading System gateway
    |
    v
Trading System authority
```

The full Portal runs on SGP. AWS-HK receives only the minimal Execution Edge, projection boundary
and Source Proxy needed to stay near the Trading System. SSH is an operator channel, never a product
transport.

### 1.2 Language authority

| Layer | Primary language | Authority |
|---|---|---|
| Portal control plane | TypeScript | auth/session/RBAC, users/workspaces, registry, approval/promotion workflow, audit/outbox, same-origin BFF |
| Portal execution data plane | Rust | compatibility contracts, projection reducer/store, query/aggregation, SSE, bounded relay, latency-sensitive paths |
| Quant/research compute | Python | QuantBT adapter/worker, WFO/optimization/research only |
| D4 Python source facade | Python, Trading-System-owned | finite qualification bridge only; **not accepted as steady-state always-on design** |

Python CPU use during quant compute does not make Python the Portal backend authority. The current
D4 facade exists because the published Trading System boundary is Python; Portal neither owns nor
rewrites that implementation.

### 1.3 Data and command authority

- Trading System is the only authority for Paper/Sandbox/Canary/Live orders, fills, positions,
  accounting, risk, reconciliation and broker state.
- Portal projection is a read model, never a second trading ledger.
- Portal owns workflow facts such as approval, promotion request, review evidence, operator
  acknowledgement, assignment, annotation and audit.
- Portal never infers `FILLED`, terminal success, complete history or zero exposure from absence.
- Runtime state, promotion stage, readiness and broker sync are separate fields.
- `STALE`, `MISMATCH`, `DENIED`, `UNAVAILABLE`, `INSUFFICIENT_DATA`, `PARTIAL` and `UNCERTAIN` are
  product states, not exceptional copy to hide.
- Every monetary value is an exact decimal string with currency/precision metadata. Cross-currency
  totals require an explicit FX policy.

### 1.4 Transport and identity

| Boundary | Required control |
|---|---|
| Browser → SGP | same-origin Portal session, RBAC, CSRF for mutation, no delegated service token in browser |
| SGP → AWS-HK Edge | private WireGuard, HTTP/2, TLS 1.3 mTLS, delegated JWT with exact audience/resource and short expiry |
| Edge → Source Proxy | workload mTLS, exact origin/path/method allowlist, bounded timeout/body/concurrency/retry |
| Source Proxy → Trading System | dedicated environment/scope identity; no generic DB/Redis/CLI capability |
| Command relay | separate capability and owner window from reads; plan/apply/verify, idempotency, SoD and audit |

Read activation and command activation are independent. An accepted Paper read path never unlocks a
command route.

---

## 2. Current truth at 2026-08-25

### 2.1 Cross-cell D0–D4

| Gate | Current exact status | What is proven | What is still forbidden |
|---|---|---|---|
| D0 discovery | `EVIDENCE_COMPLETE` | AWS-HK/SGP topology and compatibility discovered read-only | implementation by assumption |
| D1 private network | `D1_NETWORK_ACCEPTED / APPLICATION_DARK` | scoped WireGuard, SG rollback record, link/loss and public-denial evidence | product traffic outside named windows |
| D2 dark runtime | `D2_DARK_ACCEPTED / SOURCE_INACTIVE` | signed bounded services, IAM isolation, IMDS hardening, private PG, rollback/redeploy and admission evidence | source/query/SSE/command/profile activation |
| D3 transport | `D3_TRANSPORT_ACCEPTED / BUSINESS_SOURCE_DARK / D2_RUNTIME_RESTORED` | real H2/TLS1.3 mTLS, delegated-JWT positive/negative matrix, latency and loss/recovery | business reads or projection rows |
| D4 finite Paper read | `D4_PAPER_READ_SHADOW_ACCEPTED / BUILDING_ONLY / D2_DARK_RESTORED / BUSINESS_READER_STILL_DARK` | signed finite mandatory-auth baseline/replay/freshness/loss/restart/load/restore on encrypted storage | ACTIVE epoch, Query, analytics, SSE, commands, Lane B or profile promotion |
| D4 facade audit | `D4_SOURCE_RUNTIME_AUDITED / LOOPBACK_ONLY / PROXY_DISABLED` | exact four-GET boundary and measured resource behavior | always-on facade or unattended source polling |

The D4 finite qualification is accepted. Its steady-state source architecture is **not** accepted.
Read-only inspection found the Python facade performing an unconditional full-scope refresh every
500 ms even with no consumer demand, approximately 2.4–3.3 MiB/s of idle DB traffic and roughly
31–44% of one CPU core. It must stay dormant outside a named owner window until the incremental,
lease-aware design in phases N01–N06 is qualified.

### 2.2 Runtime flags and delivery profile

The authoritative safe state is:

```text
delivery_profile                 = fixture
query_enabled                    = false
projection_ingestion_enabled     = false
sse_enabled                      = false
paper_commands_enabled           = false
sandbox_commands_enabled         = false
live_protective_commands_enabled = false
live_risk_increasing_commands_enabled = false
```

No frontend route may select the D4 BUILDING data. Claude may use canonical fixtures, schemas,
typed unavailable states and sanitized parity artifacts only.

### 2.3 Existing EX-BE foundations

| Slice | Current status | Residual work |
|---|---|---|
| EX-BE-00R4 Registry | `CONTRACT_COMPLETE` | profile promotion evidence; BR-EX-31 separate governance-write policy |
| EX-BE-04a TypeScript query primitives | `FOUNDATION_COMPLETE` | use in remaining control-plane screen APIs |
| EX-BE-05a Governance/R1 | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-30/31/35/36/37 and owner activation |
| EX-BE-01 Rust contracts/adapter | `CONTRACT_COMPLETE` | each new TS revision gets a new adapter/corpus |
| EX-BE-02 auth/transport | `FOUNDATION_COMPLETE`; D1–D4 evidence as §2.1 | steady-state D4 source path |
| EX-BE-03 projection | `FOUNDATION_COMPLETE / SOURCE_INGESTION_INTEGRATION_PENDING` | qualified source ingestion, ACTIVE promotion evidence |
| EX-BE-04b Rust Query | `FOUNDATION_COMPLETE / SOURCE_INTEGRATION_PENDING` | active projection and per-screen shadow rollout |
| EX-BE-05b/F0 | `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE` | published command capabilities and live relay |
| EX-BE-05b/F1a/F1b | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | source facts; BR-EX-32/33; eight unpublished ops routes |
| EX-BE-05b/F2/F3/F4 | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | Sandbox/Canary/Live source, evidence and command gates |
| EX-BE-06 SSE | `PORTAL_IMPLEMENTATION_COMPLETE / OWNER_PROMOTION_APPROVED / REAL_SOURCE_EVIDENCE_PENDING` | one real v2 Paper-fast snapshot/resume/gap/H2/source-loss evidence run; no further Bobby approval |
| EX-BE-07a analytics | `FOUNDATION_COMPLETE` | current Claude series/tile additions and source parity |
| EX-BE-07b screen APIs | `PORTAL_IMPLEMENTATION_COMPLETE / OWNER_PROMOTION_APPROVED / REAL_SOURCE_EVIDENCE_PENDING` | active v2 source and Paper-fast evidence; no further Bobby approval |
| EX-BE-08a | `OFFLINE_FOUNDATION_COMPLETE / LIVE_EVIDENCE_PENDING` | real-source parity, fault/load/soak/restore/rollback |
| PRE-IAM-01…06 | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | no reopening; later phases consume their contracts/evidence |

### 2.4 Product-screen backend state

| Product phase | Screen | Backend state | Primary remaining dependency |
|---:|---|---|---|
| 0 | Shell/registry | `CONTRACT_COMPLETE` | no backend blocker for fixture navigation |
| 1 | Approval Inbox | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-31/35; activation |
| 2 | Gate R1 | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-36/37; activation |
| 3 | Gate R2 | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-30 lineage/passport completion |
| 4 | Paper Workbench | `PORTAL_IMPLEMENTATION_COMPLETE / RUNTIME_FAIL_CLOSED` | qualified real v2 Paper source; owner approval already recorded |
| 5 | Paper Exit Review | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | Paper source facts and activation |
| 6 | Admin Action Drawer | `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE` | published routes + EX-BE-05b live relay |
| 7 | Operations Queue | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-32/33 and published ops sources |
| 8 | Incident Detail | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | published alerts/dead-letter/trace sources |
| 9 | Command Center | `PORTAL_IMPLEMENTATION_COMPLETE / RUNTIME_FAIL_CLOSED` | one qualified real v2 source window before SSE activation |
| 10 | Sandbox Certification | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-38, Sandbox source and certification evidence |
| 11 | Canary Control Room | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | source/rollback evidence and Canary command gates |
| 12 | Live Full Operations | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | Canary exit, source authority and dual-approved commands |
| 13 | Paper Workbench VNM | `INTEGRATION_PENDING` | venue calendar/ATO/ATC/timezone + Paper source |
| 14 | Full Blotter | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-24 source list and source activation |
| 15 | Alpha 360 | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-34/40, source parity/no-N+1 evidence |
| 16 | Portfolio 360 | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-27/34/40, 150×150 source/load evidence |
| 17 | Account/Broker 360 | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-26, full-population source evidence |
| 18 | Hardening | `OPERATIONAL_EVIDENCE_PENDING` | chosen target subset active through soak/restore/rollback |

`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` is not a synonym for product complete. It says the
Portal-owned route/repository/contract exists and is intentionally not reading production authority.

---

## 3. Critical path and parallel lanes

### 3.1 Dependency graph

```text
N00 tracking/request reconciliation
 |
 +--> N01 dormant closeout
 |     |
 |     +--> N02 source contract revision ----> N03 TS owner implementation
 |                                               |
 |                                               v
 |          N04 Rust shared consumer --> N05 retention/recovery
 |                                               |
 |                                               v
 |                                  N06 real-source qualification
 |                                               |
 |                     +-------------------------+------------------+
 |                     v                                            v
 |              N07 Query/analytics shadow                  N08 SSE shadow
 |                     +-------------------------+------------------+
 |                                               v
 |                                    N13 staged activation
 |
 +--> N09 control-plane/product gaps (parallel, SGP/offline)
 +--> N10 series/tile analytics contracts (parallel, source-dark)
 +--> N11 external read adapter prep (only after TS contracts publish)
 +--> N12 command relay prep (independent gate; never unlocked by reads)

N13 -> N14 release authority -> N15 full gateway -> N16 emergency ops -> N17 production/DR
```

### 3.2 What may run now without IAM/network/source activation

- N00 document/status reconciliation.
- N01 dormant lifecycle and fail-closed runbook changes.
- Portal-owned N09 contracts/repositories/APIs.
- N10 schemas, pure analytics, fixtures, OpenAPI and source-dark screen APIs.
- Adapter skeletons for an already published contract, without source credentials or calls.
- tests for failure, unavailable, gap, retention, replay, restore and rollback.

### 3.3 What must wait for external authority

- N03 Trading System source implementation.
- N06 live source qualification window.
- N11 adapters for routes that have not been published.
- N12 real command relay.
- any `fixture -> shadow -> paper -> sandbox -> live_canary -> live_full` promotion.

---

## 4. Unified backend phases

Every phase below has one owner, one output boundary and one explicit exit gate. A phase can produce
multiple commits, but each commit remains coherent and immediately tested.

### N00 — Tracking truth and request reconciliation

**Mapping:** PRE-IAM-06 continuation; this document.  
**Status:** `DOCUMENT_COMPLETE / NO_RUNTIME_EFFECT`.  
**Priority:** P0.

**Goal**

Create one current roadmap that supersedes stale status prose without deleting evidence.

**To do**

- record D2, D3 and D4 accepted truth from exact evidence;
- record the D4 facade steady-state rejection separately from finite D4 acceptance;
- import H-1…12, A-1…7 and BR-EX-01…40;
- establish the future Claude intake and status vocabulary in §§6–7;
- keep future repo-required index updates to short pointers/status lines without duplicating this
  plan.

**Exit evidence**

- Markdown/link/whitespace gate;
- `execution-tracking-test.sh` remains green;
- no runtime, registry, Compose or source change;
- Claude can find every current request in §6.

**Claude parallel lane:** review §6 for missing V2 requests and add new requests only through §7.

### N01 — D4 dormant closeout discipline

**Mapping:** D4-OPT-00.  
**Status:** `OFFLINE_IMPLEMENTATION_ACCEPTED / LIVE_CLOSEOUT_EVIDENCE_PENDING`.  
**Priority:** P0 lifecycle implementation complete; next live owner window must collect evidence.

**Goal**

Make it impossible for the qualification-only source facade to remain unintentionally active.

**Deliverables**

- source facade and D4 business reader default stopped/disabled after a finite owner window;
- preflight proves proxy disabled, no business listener, no source credential use and D2 dark health;
- explicit start deadline, automatic stop, abort-on-owner-window-expiry and resource cleanup;
- redacted evidence proves zero idle source traffic after closeout;
- rollback returns to the exact accepted D2 dark deployment.

**Exit gate**

Offline start/abort/expiry/cleanup/rollback drills pass. The production exit
still requires one future owner-window closeout plus sanitized zero-session,
zero-SELECT-delta and zero-byte-delta evidence. No registry flag or epoch
became active.

**Delivered**

- strict host-side controller with exact Portal/facade Compose-label allowlist;
- missed-start, qualifier-finished, revoked-owner and expired-window automatic
  closeout;
- accepted D2 dark Source Proxy restoration with `--pull never`;
- mode-0600 redacted closeout and source-owner idle evidence contracts;
- non-enabled finite systemd guard template, operator runbook and offline test
  matrix.

**Evidence index:**
[`EX_BE_02_D4_DORMANT_CLOSEOUT_DISCIPLINE.md`](./backend/EX_BE_02_D4_DORMANT_CLOSEOUT_DISCIPLINE.md).

**Claude parallel lane:** keep all Lane B readers disabled; use only typed fixtures/unavailable states.

### N02 — Incremental source contract revision

**Mapping:** D4-OPT-01; Trading System compatibility request.  
**Status:** `PORTAL_REQUEST_VERIFIER_COMPLETE / NARROW_REQUEST_SUPERSEDED /
CONSOLIDATED_READ_PACK_PENDING / RUNTIME_V1_LOCKED`.  
**Priority:** P0.

**Goal**

Replace repeated full-scope refresh semantics with a stable incremental contract that Portal can
consume without changing Trading System authority.

**Required contract facts**

- immutable contract revision/capability digest;
- snapshot watermark and delta cursor with strict ordering semantics;
- insert/update/delete/tombstone representation;
- duplicate and replay behavior;
- gap and cursor-ahead/cursor-expired responses;
- retention floor and earliest recoverable cursor;
- full-resync trigger and descriptor counts;
- entity source completeness: `EVENT_SOURCED`, `POLL_BOUNDED` or `UNKNOWN`;
- bounded page/row/body/rate limits and freshness semantics.

**Exit gate**

Trading System owner publishes machine-readable contract, fixtures, error corpus, compatibility
revision and owner acceptance. Portal does not edit Trading System code to obtain it.

**Delivered on Portal side**

- request-only machine contract for lease, cursor, delta, tombstone, retention, resync,
  completeness, limits and authority;
- exact four-file owner publication envelope with byte digests;
- fail-closed candidate/acceptance verifier and 15-case synthetic security/semantic corpus;
- read-only discovery proving the currently published source contract is still v1;
- Claude handoff for typed UI composition while Lane B remains dark.

The external exit gate is intentionally still open. Detail:
[`EX_BE_02_N02_INCREMENTAL_SOURCE_CONTRACT_REVISION.md`](./backend/EX_BE_02_N02_INCREMENTAL_SOURCE_CONTRACT_REVISION.md).
The historical narrow N02+N03 owner request is retained as
[`TRADING_SYSTEM_D4_PAPER_READ_V2_IMPLEMENTATION_REQUEST.md`](./backend/TRADING_SYSTEM_D4_PAPER_READ_V2_IMPLEMENTATION_REQUEST.md).
It was superseded before implementation; the source owner must wait for the
final capability-negotiated N02/N03/N11 read pack.

**Claude parallel lane:** prepare UI for typed gap/resync/retention/completeness only; no live source.

### N03 — Trading-System-owned incremental source implementation

**Mapping:** D4-OPT-02.  
**Status:** `PORTAL_ACCEPTANCE_HARNESS_COMPLETE / NARROW_REQUEST_SUPERSEDED /
CONSOLIDATED_READ_PACK_PENDING / EXTERNAL_IMPLEMENTATION_PENDING`.  
**Owner:** Trading System owner, not Codex.  
**Priority:** P0 after N02.

**Goal**

Provide either a native outbox/change-watermark source or a demand-driven bounded facade that
implements N02 without unconditional idle full scans.

**Acceptance requested from the owner**

- dedicated Paper read identity and revoked-key test;
- exact GET-only routes and scope;
- no background scan without an active lease;
- retention, rate, memory, query and backpressure bounds;
- restart/replay/duplicate/gap/tombstone corpus;
- source-side metrics sufficient to attribute load.

**Exit gate**

Published implementation commit/image and sanitized evidence match N02. Portal only imports
non-secret contract artifacts.

**Delivered on Portal side**

- exact five-file owner implementation/evidence envelope chained to accepted N02 bytes;
- immutable commit/image and fixed scope/GET-only/read-identity checks;
- zero-idle-source, no-delta-full-scan, query-plan, bounds and recovery evidence model;
- 14-scenario owner acceptance matrix and 15-case fail-closed verifier tests;
- read-only discovery proving the current v1 facade still performs unconditional full refreshes.

The Trading System owner implementation and N02 owner publication remain external dependencies.
Detail:
[`EX_BE_02_N03_TRADING_SYSTEM_INCREMENTAL_SOURCE_IMPLEMENTATION.md`](./backend/EX_BE_02_N03_TRADING_SYSTEM_INCREMENTAL_SOURCE_IMPLEMENTATION.md).

**Claude parallel lane:** none beyond fixture/parity work.

### N04 — Lease-aware Rust shared consumer

**Mapping:** D4-OPT-03; EX-BE-03 source adapter continuation.  
**Status:** `SOURCE_DARK_CORE_COMPLETE / POSTGRESQL_FENCING_COMPLETE /
N02_N03_WIRE_INTEGRATION_PENDING / LIVE_SOURCE_OFF`.  
**Priority:** P0.

**Goal**

One bounded AWS-HK Rust ingestion stream feeds the Portal projection. Screens never poll Trading
System independently.

**Deliverables**

- one workspace/scope lease with fencing token and expiry;
- committed cursor advances atomically with projected facts;
- per-entity snapshot/delta reducer and DELETE handling;
- duplicate/idempotency, out-of-order and gap fail-closed behavior;
- bounded queue/concurrency/body/timeout/retry; no implicit cursor retry;
- demand-aware idle state and source load metrics;
- all source tokens/credentials redacted and unavailable to SGP/browser.

**Exit gate**

Offline corpus, fresh PostgreSQL, restart, duplicate, gap, lease-loss and source-loss tests pass.
Live source remains off until N06.

**Delivered on Portal side**

- pure Rust singleton shared-consumer state machine with demand idle, one in-flight read,
  bounded response/queue/timeout/retry and explicit circuit-open behavior;
- redacted opaque source lease/cursor boundary and typed operational envelope;
- PostgreSQL singleton lease with DB-time expiry and monotonic fencing token;
- facts + DELETE + cursor commit under the exact active fence in one transaction;
- duplicate, out-of-order, gap, source-loss, lease-loss, restart and restore corpus;
- canonical synthetic snapshots for Claude, with no source/business identifiers.

N02/N03 owner bytes are still absent, so the thin wire adapter and all live source traffic remain
blocked. Detail:
[`EX_BE_03_N04_LEASE_AWARE_RUST_SHARED_CONSUMER.md`](./backend/EX_BE_03_N04_LEASE_AWARE_RUST_SHARED_CONSUMER.md).

**Claude parallel lane:** consume canonical snapshot/delta fixtures and exact envelope types.

### N05 — Retention, recovery and cleanup

**Mapping:** D4-OPT-04; EX-BE-03/04b recovery continuation.  
**Status:** `SOURCE_DARK_COMPLETE / RETENTION_RECOVERY_CORE_COMPLETE /
LIVE_POLICY_ACTIVATION_PENDING / N06_LIVE_BLOCKED`.  
**Priority:** P0.

**Goal**

Bound disk/memory and prove that loss, expiry and rollback never become silent empty data.

**Deliverables**

- hot retention, cold-requestable boundary, purge policy and storage budget;
- typed `HOT`, `PARTIAL_HOT`, `COLD_REQUESTABLE`, `PURGED`, `UNKNOWN` response;
- journal compaction only after durable checkpoints;
- cursor expiry/gap forces a new BUILDING epoch, never in-place repair of ACTIVE truth;
- encrypted backup/restore and deterministic rebuild;
- old-epoch overlap, cleanup safety and rollback retention.

**Exit gate**

Retention-floor, disk-pressure, rebuild, restore, rollback and gap-resync drills pass with no stale
profile claim.

**Delivered on Portal side**

- immutable, canonically digested lifecycle/budget policy snapshots;
- integer-safe soft/hard storage pressure and journal ceilings;
- typed five-state retention fixture with no empty-success ambiguity;
- RETAINED overlap enforcement and explicit RETIRED transition;
- full-journal/state archive coverage plus encrypted-archive and restore evidence;
- rollback-window-gated, live-lease-aware, atomic cleanup for RETIRED heavy rows only;
- cursor-expiry/gap/hard-pressure directives that require a new BUILDING epoch;
- deterministic replay, immutable evidence, cleanup idempotency and PostgreSQL dump/restore drills.

Live policy values, backup scheduling, source traffic, registry promotion and production cleanup
remain off. Detail:
[`EX_BE_03_N05_RETENTION_RECOVERY_CLEANUP.md`](./backend/EX_BE_03_N05_RETENTION_RECOVERY_CLEANUP.md).

**Claude parallel lane:** render beyond-retention and rebuild states distinctly from empty results.

### N06 — Real-source qualification and soak

**Mapping:** D4-OPT-05 + live continuation of EX-BE-08a.  
**Status:** `PORTAL_QUALIFICATION_AUTHORITY_COMPLETE /
OWNER_PAPER_FAST_PROFILE_APPROVED / REAL_SOURCE_BYTES_PENDING / SOURCE_DARK`.  
**Priority:** P0.

**Goal**

Prove correctness and resource safety before any reader consumes an ACTIVE epoch.

**Stages**

1. finite fresh BUILDING shadow window;
2. baseline and delta semantic parity against sealed corpus;
3. source loss/recovery, restart, duplicate, gap, expiry and tombstone drills;
4. cross-cell load/fault/restore/rollback tests;
5. Paper-fast acceptance: at least 30 minutes, samples at most 30 seconds apart;
6. extended confidence: a separate 24-hour profile, samples at most 300 seconds apart;
7. owner review and separate read-profile promotion decision.

**Required metrics**

- p50/p95/p99 latency by route/query class;
- rows scanned/returned, source bytes and requests/minute;
- Rust RSS/CPU, queue depth, drops/backpressure and lease state;
- projection lag, data age, gaps/divergence and rebuild time;
- PostgreSQL size, IOPS, WAL and restore time;
- zero source mutation and zero secret/business payload in evidence.

**Exit gate**

All evidence is tied to exact source/edge/proxy image digests, contract revision, dataset scope and
owner window. Both profiles retain the complete parity/fault/load/restore/rollback corpus;
Paper-fast shortens elapsed observation only. Acceptance does not itself change a registry profile.

**Delivered on Portal side**

- Rust-authoritative, exact-schema N06 evidence evaluator and bounded CLI;
- byte binding to accepted N02/N03 manifests plus source/Edge/Proxy/schema identities;
- BUILDING-only baseline/delta/replay parity and exact twelve-drill corpus;
- integer-only per-route latency, amplification, request-rate, Rust and PostgreSQL budgets;
- explicit `PAPER_FAST_ACCEPTANCE` and `EXTENDED_24H` profiles with bounded sampling;
- source-idle, zero-mutation and recovery enforcement in both profiles;
- typed sanitized authority/data-class boundary and post-window owner review;
- template/candidate/acceptance separation with activation permanently false;
- credential-free wrapper/fixture tests and a dedicated Claude state handoff.

Owner promotion for the bounded Paper-fast profile was granted on 2026-08-26 and must not be
requested again. No accepted N02/N03 source bytes or real N06 window exist locally, so real traffic
and the operational Paper-fast evidence remain unavailable; the extended 24-hour profile remains a
later confidence gate, not a prerequisite invented for every development promotion. Detail:
[`EX_BE_03_N06_REAL_SOURCE_QUALIFICATION_AND_SOAK.md`](./backend/EX_BE_03_N06_REAL_SOURCE_QUALIFICATION_AND_SOAK.md).

**Claude parallel lane:** run parity harness on sanitized accepted shadow artifacts; do not select
the source reader until N07 promotion.

### N07 — Projection, Query, analytics and narrow screen APIs in shadow

**Mapping:** EX-BE-03 → EX-BE-04b → EX-BE-07b.  
**Status:** `PORTAL_IMPLEMENTATION_COMPLETE / OWNER_SHADOW_PROMOTION_APPROVED /
REAL_SOURCE_EVIDENCE_PENDING / RUNTIME_FAIL_CLOSED`.  
**Priority:** P1 after N06.

**Goal**

Expose the accepted Portal projection through stable same-origin APIs, one screen/profile at a time.

**Deliverables**

- parity-only epoch activation transaction and compatibility manifest;
- scope-bound read-only Rust Query/analytics services;
- TypeScript session/RBAC BFF with reusable mTLS/H2 pools and delegated JWT;
- signed bidirectional keyset, allowlisted filter/sort, exact counts/aggregates;
- exact decimal, adaptive series, typed retention and server freshness;
- narrow screen endpoints with per-panel authority/warnings/partiality;
- independent flags for projection, Query and each commissioned screen.

**Exit gate**

One named low-risk Paper screen passes fixture-vs-shadow parity, source-loss, auth, load, rollback
and visual honest-state review. Promotion is `fixture -> shadow`, not directly to Paper/live.

**Delivered on Portal side**

- exact-schema N07 compatibility/owner evidence and a private Rust acceptance capability;
- atomic PostgreSQL activation bound to a still-valid immutable manifest and exact semantic digest;
- ACTIVE epoch lookup that revalidates the stored manifest before every screen query;
- deployment-scoped `orders` and `positions` Paper Workbench primitives where server scope is
  cursor-bound and counts/aggregates cannot disclose another deployment;
- Rust-owned freshness, partiality, authority, retention and typed resnapshot/error semantics;
- same-origin TypeScript session BFF over reusable mTLS HTTP/2 and exact delegated resources;
- strict OpenAPI/generated types/canonical fixture plus independent, default-off Query/screen flags;
- opt-in deployment overlay that still leaves analytics, realtime and commands disabled.

The Portal implementation/offline gates and Bobby's owner promotion decision are complete. That
approval is recorded and must not be requested again. Runtime still fails closed because the
current N06 state has no accepted real-source Paper-fast evidence from an owner-published
`d4.paper-read.v2` implementation. Registry therefore remains `fixture`, all N07 flags remain
false and no real source or runtime was touched. Detail:
[`EX_BE_03_N07_PROJECTION_QUERY_ANALYTICS_SHADOW.md`](./backend/EX_BE_03_N07_PROJECTION_QUERY_ANALYTICS_SHADOW.md).

**Claude parallel lane:** consume the N07 Paper Workbench fixture/API in an adapter and run parity
without changing registry delivery. Preserve visible `ProfileBadge`, exact decimals and all honest
states. Do not wire the wider BR-EX-41/49/50 panels to this narrow N07 response.

### N08 — SSE real-source activation

**Mapping:** EX-BE-06.  
**Status:** `PORTAL_IMPLEMENTATION_COMPLETE / OWNER_PROMOTION_APPROVED /
RUNTIME_FAIL_CLOSED / REAL_SOURCE_EVIDENCE_PENDING`.  
**Priority:** P1 after N06; may qualify alongside N07 but activates separately.

**Goal**

Provide bounded same-origin realtime updates without turning a gap or expired session into an
infinite reconnect loop.

**Deliverables**

- snapshot-before-stream contract and Last-Event-ID precedence;
- epoch/gap/cursor-ahead/retention/source-loss typed recovery;
- HTTP/2 at every required hop; no WebSocket in this scope;
- bounded per-session fan-out, slow-consumer backpressure and notification coalescing;
- auth-expiry event or fetch preflight behavior with terminal `close()` on dead session;
- multiplex/shared subscriptions rather than one source poll per screen;
- source loss falls back to bounded polling/unavailable, never fake live.

**Exit gate**

Positive/negative auth, resume, epoch change, gap, 100-client fan-out, slow consumer, link loss and
rollback pass at accepted source scale. `sse_enabled` is promoted independently.

**Delivered on Portal side**

- exact `execution.realtime-activation.v1` candidate/acceptance authority binding N06, the active
  N07 manifest, epoch, source revision, immutable images/contracts, every N08 gate hash and Bobby's
  explicit approval;
- startup and per-request fail-closed checks: a boolean cannot open SSE without the accepted
  manifest and the exact still-ACTIVE N07 epoch;
- canonical snapshot-before-stream endpoints at the Rust edge and same-origin TypeScript BFF;
- bounded 64 KiB exact-schema snapshot parsing over the same reusable TLS 1.3 mTLS/H2 session and
  short delegated JWT used by the stream;
- deterministic Last-Event-ID precedence, replay/gap/epoch/cursor/source-loss behavior, 100-client
  fan-out and slow-consumer termination from the existing Rust realtime core;
- browser terminal-error hardening: generic errors and expired sessions close native EventSource,
  so it cannot retry forever behind the facade;
- all command authority remains false and independent.

Bobby's N08 promotion approval is recorded; no further owner approval is required for this exact
Paper shadow scope. The one remaining external dependency is accepted real `d4.paper-read.v2`
source evidence for N06/N07. Until those bytes exist, the manifest cannot be forged and both SSE
flags remain false. Detail:
[`EX_BE_06_N08_SSE_REAL_SOURCE_ACTIVATION.md`](./backend/EX_BE_06_N08_SSE_REAL_SOURCE_ACTIVATION.md).

**Claude parallel lane:** keep the already-fixed terminal error handling; exercise typed 401/gap/
backpressure/source-loss states against the accepted shadow stream.

### N09 — Portal-owned governance and workflow gaps

**Mapping:** EX-BE-05a/05b control-plane continuation; product phases 1, 2, 3, 7, 10.  
**Status:** `PLANNED`; source-independent parts may start after N00.  
**Priority:** P1.

**Included Claude requests**

- BR-EX-30: R2 R1-lineage, grant, approver role, plan author and evidence manifest;
- BR-EX-31: registry `governance_write_enabled`, independent of command flags;
- BR-EX-32: actor/assignee semantics for Operations Queue `Mine`;
- BR-EX-33: operation-row nullable incident reference;
- BR-EX-35: approval history keyset API;
- BR-EX-36: `REQUEST_CHANGES` product semantics and state transition;
- BR-EX-37: typed R1 `known_limitations[]`;
- BR-EX-38: bounded Sandbox smoke plan.

**Mandatory design rulings before code**

- Bobby defines `REQUEST_CHANGES` lifecycle, expiry/closure and who may resubmit;
- Bobby defines whether `Mine` means assigned, acknowledged or created-by;
- command flags never gate Portal governance writes;
- Sandbox smoke plan remains a plan/evidence object, never runtime execution authority.

**Exit gate**

Schema/OpenAPI/generated types/fixtures, fresh-PG repository/API tests, CSRF/RBAC/SoD/idempotency/
concurrency/audit/outbox and dump/restore pass. Real source and registry activation remain separate.

**Claude parallel lane:** remove compatibility guesses only after generated contracts land; enable
previously disabled controls only when their exact policy is active.

### N10 — Series and insight analytics contracts

**Mapping:** EX-BE-07a/07b extension; product phases 4, 11, 12, 15, 16, 17.  
**Status:** `CONTRACT_PLANNED`.  
**Priority:** P1; source-dark schema/pure engine may start in parallel with N02.

**Included Claude requests**

- BR-EX-34: equity/drawdown/approved-band series with gap, digest/run join and adaptive interval;
- BR-EX-40: `tile_kind` and typed series per insight tile (`line`, `histogram`, `funnel`,
  `waterfall`, `heatmap`, `bar`), including canonical fixtures;
- BR-EX-39: accepted envelope+payload sample per Execution event type and one canonical
  `schema_version` representation.

**Contract rules**

- server selects the finest interval at no more than 5,000 points;
- no interpolation across a source gap;
- research approved bands join by immutable artifact digest and run ID;
- each tile declares formula version, authority, freshness, completeness and sample requirements;
- a chart kind is semantic contract, not a frontend styling suggestion;
- frontend smoke series are deleted only after canonical fixtures and readers land.

**Exit gate**

OpenAPI/Rust/generated TypeScript parity, exact-decimal pure-engine tests, per-kind canonical fixtures,
typed errors and response-size/load bounds pass. Source-backed promotion waits for N06/N07.

**Claude parallel lane:** keep smoke labels explicit; implement renderers against canonical kind/series
fixtures once delivered, without inventing numbers.

### N11 — Published external read capabilities and adapters

**Mapping:** EX-BE-01/07b compatibility continuation.  
**Status:** `EXTERNAL_CONTRACT_PENDING`.  
**Priority:** P1/P2 by screen safety value.

**Requests waiting on Trading System owner**

- BR-EX-24 scope-bound order list for Full Blotter;
- BR-EX-25 ruling/contract for four-stage versus five-hop funnel;
- BR-EX-26 authoritative full-population aggregate exposure verdict;
- BR-EX-27 packed-correlation per-cell `sample_counts`;
- authoritative VNM calendar/session/ATO/ATC capability;
- the eight exact `ops` routes in §6.5.

**Deliverables after publication**

- new contract pack revision and immutable digest;
- Rust compatibility adapter and golden positive/negative corpus;
- bounded authenticated Source Proxy route;
- per-panel unavailable behavior for older/partial capability revisions;
- source parity/load/fault/rollback evidence.

**Exit gate**

No adapter is accepted from handwritten prose alone. Published machine contract, owner identity,
golden corpus and accepted shadow evidence are all required.

**Claude parallel lane:** keep affected controls/panels disabled or unavailable with the request ID;
never sum a visible page or infer missing source facts.

### N12 — Live command relay

**Mapping:** EX-BE-05b live continuation.  
**Status:** `PRODUCTION_INACTIVE / EXTERNAL_COMMAND_CAPABILITY_PENDING`.  
**Priority:** P1 for protective Paper/Sandbox; later for risk-increasing Live.

**Goal**

Connect the existing Portal plan/apply/verify foundation to published Trading System command
authority without moving decision/risk truth into Portal.

**Deliverables**

- published command catalogue/capability/journal contract and terminal corpus;
- target-, environment-, actor-, role- and risk-scoped catalogue;
- immutable hash-only plan, expiry, request key, optimistic concurrency and audit;
- separate R3 protective and R4 risk-increasing paths;
- step-up/WebAuthn/dual approval where policy requires;
- bounded relay, explicit accepted/nonterminal semantics and post-command verification;
- `UNCERTAIN`: no blind retry, incident/reconciliation continues, same-target policy enforced;
- command kill switch independent of read/query/SSE flags.

**Exit gate**

Negative matrix, duplicate/ambiguous/restart/replay, broker/source loss, rollback and owner approval
pass first in Paper, then Sandbox. Live commands are not implied.

**Claude parallel lane:** render the canonical catalogue and terminal; keep unreachable entries hidden/
disabled and never equate HTTP 202 with success.

### N13 — Staged product activation

**Mapping:** product phases 4–18; delivery profile ladder.  
**Status:** `NOT_STARTED / N06_N12_DEPENDENT`.  
**Priority:** P1 after foundations.

**Order**

1. one read-only Paper screen: `fixture -> shadow`;
2. Paper read profile after shadow/soak/owner acceptance;
3. Paper protective command subset;
4. Sandbox certification and bounded smoke;
5. Canary protective subset with small capital envelope;
6. Canary scale/risk-increasing subset after separate evidence;
7. Live Full only after dual approval and rollback rehearsal.

Each screen and capability promotes independently. There is no global green switch.

**Exit gate per step**

Contract compatibility, auth, source freshness/completeness, load, fault, security, audit, restore,
rollback, UI honest states and owner approval. A failed gate rolls back only the affected profile/
capability and preserves operator visibility.

**Claude parallel lane:** run the seven-state, role, breakpoint, accessibility, interaction and visual
acceptance matrix for the exact promoted screen/profile.

### N14 — Deployment and release authority

**Mapping:** BAR-17.  
**Status:** `PLANNED`.  
**Priority:** P2 before formal release.

**Goal and deliverables**

- immutable multi-service release manifest and compatibility matrix;
- signed images/SBOM/vulnerability evidence;
- SGP dev versus main/stable deployment separation;
- migration/preflight/rollback/forward-fix contract;
- release candidate evidence and owner promotion record;
- no dev build can mutate or route stable runtime/database accidentally.

**Exit gate:** deploy/rollback rehearsal on isolated state, signature verification and owner release
approval.

### N15 — Formal inter-cell gateway authority

**Mapping:** BAR-18.  
**Status:** `READ_FOUNDATION_COMPLETE / COMMAND_EVENT_ARTIFACT_AUTHORITY_PENDING`.  
**Priority:** P2.

**Goal**

Formalize four independent interfaces: Query, Command, Event and Artifact. D1–D4 provide the read
foundation; commands, production events and artifact exchange require their own contracts/gates.

**Exit gate:** version/compatibility negotiation, identities, SLOs, observability, failure semantics,
rollback and owner matrix exist for all four without generic host/DB/Redis access.

### N16 — Same-domain routing and emergency operations

**Mapping:** BAR-19.  
**Status:** `PLANNED`.  
**Priority:** P2.

**Goal and deliverables**

- same-domain routing with session/RBAC consistency;
- operator maintenance/degraded modes;
- emergency protective path separate from ordinary risk-increasing commands;
- break-glass reason, expiry, actor, evidence and immutable audit;
- Cloudflare/tunnel/origin failure and rollback drills.

**Exit gate:** no emergency path bypasses Trading System authority or audit; public/auth/source loss
is visibly degraded and recoverable.

### N17 — Production activation, SLO, DR and owner operations

**Mapping:** BAR-20 + product phase 18.  
**Status:** `OPERATIONAL_EVIDENCE_PENDING`.  
**Priority:** final.

**Goal and deliverables**

- measured SLO/error budgets and alerts;
- encrypted backup/PITR/rebuild/restore evidence;
- key/certificate/credential rotation and compromise drill;
- quarterly game day, incident/rollback ownership and RPO/RTO;
- retention/cost/capacity review;
- stable runbook, support matrix and release sign-off.

**Exit gate:** Bobby signs the exact production acceptance record after successful restore, rollback,
source-loss, auth-loss and command-containment rehearsals.

---

## 5. Definition of Ready and Definition of Done

### 5.1 A backend phase is ready only when

- its owner and target environment are named;
- source authority and write/read scope are explicit;
- contract/schema revision and compatibility policy exist;
- scale/cardinality/freshness/completeness requirements are bounded;
- auth/RBAC/SoD/secrets boundary is defined;
- failure/unavailable/rollback behavior is specified;
- required external contract or Bobby decision is actually available;
- test corpus and exit evidence are listed.

### 5.2 Status vocabulary

Use only qualified statuses:

| Status | Meaning |
|---|---|
| `RECEIVED` | request recorded, not yet triaged |
| `NEEDS_CLARIFICATION` | UI/product need is ambiguous |
| `OWNER_DECISION_PENDING` | Bobby/source owner must choose semantics or authority |
| `EXTERNAL_CONTRACT_PENDING` | Trading System/source owner must publish a contract |
| `CONTRACT_PLANNED` | accepted shape is scheduled, code not complete |
| `CONTRACT_COMPLETE` | schema/OpenAPI/types/fixtures validated |
| `FOUNDATION_COMPLETE` | pure domain/repository/transport foundation exists |
| `IMPLEMENTATION_IN_PROGRESS` | code slice active on a feature branch |
| `INTEGRATION_COMPLETE` | repository/API/service path works at its declared source scope |
| `FRONTEND_INTEGRATION_PENDING` | backend contract exists; Claude consumer remains |
| `OPERATIONAL_EVIDENCE_PENDING` | code exists; source/load/fault/soak/restore evidence absent |
| `PRODUCTION_INACTIVE` | intentionally not selected by runtime/profile/flags |
| `ACTIVATION_APPROVED` | Bobby approved an exact profile/capability/window |
| `PRODUCT_COMPLETE` | contract, source, UI, operations and activation evidence all pass |
| `REJECTED` | request violates authority/safety or has a better explicit alternative |

Never write bare `DONE` or `COMPLETE`.

### 5.3 A backend phase is done only when

- contract authority, implementation authority and runtime authority are not conflated;
- schema/OpenAPI/generated types/fixtures are synchronized;
- fresh datastore and migration/restore tests pass where persistence changes;
- negative auth/RBAC/CSRF/SoD/idempotency/concurrency/redaction tests pass;
- scale/load/fault/replay/restore/rollback tests match the phase risk;
- no direct Trading System DB/Redis/CLI escape hatch appears;
- registry/flags remain unchanged unless the activation record explicitly changes them;
- Claude receives the contract/fixture/error/state handoff and records consumer status;
- this file records evidence, residual blockers and the exact next phase;
- the coherent change is committed on a branch from current `dev`.

---

## 6. Claude request register — current backlog

This section answers the user's direct question: **yes, the unified phases now include Claude's
requests, including the later V2 BR-EX-30…40 that were not fully represented in the older phase
list.**

### 6.1 H-series from PRE-IAM hardening

| Request | Current status | Remaining consumer/evidence | Phase |
|---|---|---|---|
| H-1 exact decimal parsing | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` | real-source evidence | N06/N07 |
| H-2 canonical Inbox `view` | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` | Claude consumer review | N09 |
| H-3 epoch recovery deadline | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` | real SSE parity | N08 |
| H-4 sequence-gap reason | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` | real gap corpus | N06/N08 |
| H-5 cursor-ahead reason | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` | retention/replay evidence | N05/N08 |
| H-6 typed analytics errors | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` | Claude mapping | N10 |
| H-7 bounded ledger/funnel | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` | bounded labels + source parity | N07/N11 |
| H-8 distinct cursor failures | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` | Claude recovery mapping | N08 |
| H-9 workflow/verification split | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` | Claude operation mapping | N12 |
| H-10 analytics schema gate | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` | source activation | N07/N10 |
| H-11 Rust/OpenAPI parity | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` | source parity | N06/N07 |
| H-12 six-fixture coverage | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` | Claude consumes fixtures | N10 |

### 6.2 A-series FE/BE audit

| Request | Current status | Phase |
|---|---|---|
| A-1 native EventSource resume precedence | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` | N08 |
| A-2 canonical keyset field names | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` | N07 |
| A-3 exact aggregates by currency | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` | N07/N11 |
| A-4 typed page retention | `CONTRACT_COMPLETE / OWNER_DECISION_PENDING` | N05/N07 |
| A-5 nullable projection-gap facts | `DECISION_COMPLETE / FRONTEND_INTEGRATION_PENDING` | N08 |
| A-6 delegated assertion expiry | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` | N08 |
| A-7 BR-EX-24…27 follow-up | `OWNER_OR_EXTERNAL_CONTRACT_PENDING` | N11 |

### 6.3 BR-EX-01…22 — decisions already locked

| IDs | Backend decision | Current realization |
|---|---|---|
| 01–03 | signed keyset, server filter/sort, exact count | EX-BE-04a/04b foundations complete; source activation N07 |
| 04–05 | adaptive six-rung series, finer-rung re-query, measured latency | query foundation complete; real series N10, evidence N06/N07 |
| 06–07 | capped batched previews; packed correlation through 150 | pure analytics complete; source/load N07/N10 |
| 08–10 | ranked triage, typed grouping, SSE | dark contracts complete; source/SSE N07/N08 |
| 11–15 | cursor continuity, precision, funnel, exposure, portfolio context | foundations complete; external facts N11 |
| 16–19 | completeness, backward cursor, idempotent plan, server age/lag | contracts complete; live parity N06–N08/N12 |
| 20–22 | delivery profile, `UNCERTAIN` safety split, provisional SLOs | decisions/contracts complete; activation/measurement N08/N12/N13 |

### 6.4 BR-EX-23…40 — exact disposition

| ID | Request | Current status | Unified phase |
|---|---|---|---|
| 23 | R2 `portfolio_id` + `currency` | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | N09/N13 |
| 24 | scope-bound order list | `OWNER_DECISION_PENDING / EXTERNAL_CONTRACT_PENDING` | N11 |
| 25 | four-stage versus five-hop funnel | `OWNER_DECISION_PENDING` | N11 |
| 26 | authoritative aggregate exposure verdict | `EXTERNAL_CONTRACT_PENDING` | N11 |
| 27 | packed correlation `sample_counts` | `EXTERNAL_CONTRACT_PENDING` | N11 |
| 28a | canonical command catalogue | `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE` | N12 |
| 28b | allocation risk classification | `OWNER_DECISION_PENDING`, conservative floor R1 | N12 |
| 29 | typed `conditions[]` | `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE` | N09/N12 |
| 30 | R2 lineage/grant/role/author/passport | `CONTRACT_PLANNED` | N09 |
| 31 | independent `governance_write_enabled` | `CONTRACT_PLANNED` | N09 |
| 32 | Operations `Mine` actor/assignee semantics | `OWNER_DECISION_PENDING` | N09 |
| 33 | operation → incident reference | `CONTRACT_PLANNED` | N09 |
| 34 | equity/band/drawdown series | `CONTRACT_PLANNED` | N10 |
| 35 | approval history keyset API | `CONTRACT_PLANNED` | N09 |
| 36 | `REQUEST_CHANGES` verb/lifecycle | `OWNER_DECISION_PENDING` | N09 |
| 37 | typed R1 `known_limitations[]` | `CONTRACT_PLANNED` | N09 |
| 38 | bounded Sandbox smoke plan | `CONTRACT_PLANNED / RUNTIME_INACTIVE` | N09 |
| 39 | event envelope+payload corpus and schema version | `CONTRACT_PLANNED` | N10 then N08 |
| 40 | insight `tile_kind` + per-kind series schema | `CONTRACT_PLANNED` | N10 |

No BR-EX-30…40 row is silently considered implemented because a similarly named fixture or UI field
exists. The generated contract and backend behavior must prove it.

### 6.5 Eight unpublished Trading System operations routes

All remain `EXTERNAL_CONTRACT_PENDING` and `portal_reachable=false`:

| Route/capability | Needed by | Prohibited substitute |
|---|---|---|
| `ops/command-journal` | Operations Queue | direct PostgreSQL/CLI |
| `ops/findings` | Operations Queue | direct PostgreSQL/CLI |
| `ops/alerts` | Incident Detail | direct Redis/CLI |
| `ops/dead-letters` | Incident Detail | direct Redis/CLI |
| `ops/trace-order` | Incident Detail | direct PostgreSQL/Redis/CLI |
| `ops/streams` | Command Center | direct Redis stream access |
| `ops/alpha-activity` | Command Center | direct Redis/CLI |
| `ops/redis-retention` | Operations diagnostics | generic Redis keyspace access |

Generic `redis/get`, `redis/scan`, shell commands and source database reads are rejected Portal
capabilities.

---

## 7. Mandatory intake for every future Claude request

Claude may raise backend needs at any time. A request becomes schedulable only after it is appended
to the table in §7.2 using this template. It must not be hidden inside a frontend closeout paragraph.

### 7.1 Intake workflow

1. **Record:** allocate the next `BR-EX-*` ID and preserve the original user/UI problem.
2. **Classify:** frontend-only, existing contract, additive Portal contract, external Trading System
   contract, owner decision, or rejected escape hatch.
3. **Rule authority:** identify `PORTAL_CONTROL`, `PORTAL_PROJECTION`, `TRADING_SYSTEM`, `BROKER`,
   `RESEARCH` or `DERIVED` for every requested fact/action.
4. **Bound:** record scope, cardinality, freshness, completeness, retention and failure states.
5. **Assign:** map the request to one N-phase and name dependencies/owner.
6. **Contract first:** schema/OpenAPI/generated types/fixtures/error examples before component guesses.
7. **Implement:** repository/service/adapter within the locked authority boundary.
8. **Verify:** negative security, exactness, scale, replay/fault/restore/rollback proportional to risk.
9. **Handoff:** Codex gives Claude exact contract, fixtures, unavailable states and activation flag.
10. **Activate separately:** only after source/operational evidence and Bobby approval.

### 7.2 Future request ledger

Append rows here. Do not create another active request file.

| ID | Date | Screen/route | User problem | Requested behavior | Authority | Read/write + risk | Scale/freshness/completeness | Contract/source dependency | Failure/fallback | Tests/evidence | Owner | Phase | Status | Claude consumer | Activation impact | Supersedes/links |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BR-EX-41 | 2026-08-25 | Paper `/deployments/paper/:id` · Sandbox `/sandbox/:id` · Canary `/live/:id/canary` · Live `/live/:id` | Operator cannot judge a stage from text: no equity by stage, no envelope consumption, no execution quality, no positions, no contribution — every panel reads "not published" | Facts + aggregates (no command): `stage-equity` (lines per stage, normalized, joined by artifact digest), `envelope-consumption` (used/cap/kind cap\|target), `execution-quality` (ACK latency buckets p50/p95, fill latency, slippage bp, reject rate, ceilings), `positions` snapshot, `contribution` daily (Live), `order_types[]` in sandbox-certification, KPI null-fill | series/caps `PORTAL_PROJECTION` from `TRADING_SYSTEM`; positions `BROKER`; contribution/quality `DERIVED` (formula_version) | read-only · risk: misread exposure if server sums wrong — server computes, browser never sums | per deployment: ≤5,000 points/series (server picks interval), ≤5 lines, caps ≤8, buckets ≤12, positions ≤500 keyset; freshness = source as_of; completeness in envelope | extends BR-EX-34 (N10); Trading System routes for positions/contribution (N11); Paper source qualification (N06) | unavailable → honest state per panel (today's behavior); stale/partial → envelope caption + chip; denied → 403 typed; no interpolation across gaps | exact-decimal pure-engine tests; per-kind canonical fixtures (`execution-analytics.stage-equity`, `.envelope-consumption`, `.execution-quality`, `.positions`, `.contribution`); size/load bounds; frontend tests listed in handoff | Codex | N10 (contracts) · N07 (shadow) · N11 (positions/contribution adapters) | `RECEIVED` | `StageLinesChart` `CapGauges` `HistogramChart` `SparkTile` `PositionsTable` `DailyBarsChart` `OrderTypeMatrix` — smoke `stage.smoke.ts` deleted on delivery | none until approved | BR-EX-34/40; detail appendix `hifi_execution_loop/BACKEND_REQUEST_HIFI_V2_2026-08-25.md` |
| BR-EX-42 | 2026-08-25 | Command Center `/execution` · Pinned watchlist | Pinned rows show label twice and no stage/status, so an operator cannot tell READY from HALTED without opening each pin | Facts: `pinned.items[]` + `stage`, `status` (READY\|HALTED\|BLOCKED\|DEGRADED), `figure` (server-formatted string) + `figure_tone`, `venue`, `deployment_id`, `href` | `PORTAL_PROJECTION` (stage/status from lifecycle) · figure `DERIVED` with formula_version | read-only · low | ≤5 pins/user; freshness = snapshot read_at; complete or per-pin `target_available=false` | none external; Portal lifecycle projection | pin target unavailable → dashed row (today) | fixture `execution-command-center.pinned.valid.json` (3 rows per hi-fi 5a) + schema; frontend tests in handoff | Codex | N09 (Portal-owned) · N13 activation | `RECEIVED` | `PinnedWatchlist` — smoke `CC_PIN_EXTRA` deleted | none | hi-fi 5a; appendix as above |
| BR-EX-43 | 2026-08-25 | Shell topbar + sidebar · Incident `/execution/operations/incidents/:id` · Command Center | Operator on any Execution route cannot see open critical alerts; incident screen cannot re-price the unreconciled Δ while capital is frozen | Aggregate: `GET /api/v1/execution/alerts/summary` `{critical, high, as_of, href}` (ETag, no-cache); stream: SSE `alerts.summary` + `market.tick {symbol,last_price,prev_price,as_of}` when realtime enabled | alerts `PORTAL_PROJECTION`; market tick `TRADING_SYSTEM` (published market feed only — never broker order path) | read-only · medium: a stale summary must say stale, never 0 | summary ≤1 req/30s/user; tick ≤1/1.4s per symbol, ≤3 symbols/screen; freshness = tick as_of | N08 SSE real-source activation; market feed contract from Trading System owner (`EXTERNAL_CONTRACT_PENDING` for tick) | stream absent → chip hidden (no number invented); incident band shows last as_of + STALE | typed 401/gap/backpressure tests (existing SSE corpus); summary fixture `execution-alerts-summary.valid.json` | Codex (summary) · Trading System owner (tick) | N09 (summary) · N08 (SSE) | `RECEIVED` | topbar chip, sidebar badge, `useIncidentLive` (smoke `CC_SMOKE_MOTION`/`incident.smoke.ts` deleted) | none until N08 approved | BR-EX-46; appendix |
| BR-EX-44 | 2026-08-25 | Command Center · Fleet health | Fleet cells are bare counts; hi-fi carries the sub-fact that changes triage ("1 HALTED", "d9/14") and tone | Facts: `fleet.cells[]` + `sub` (string), `sub_tone`, `tone` (bad when any Live deployment DEGRADED), `href` to stage list | `PORTAL_PROJECTION` | read-only · low | 6 cells; freshness = snapshot read_at | none | cell unavailable → `—` (today) | fixture update `execution-command-center.busy.valid.json`; frontend tests in handoff | Codex | N09 · N13 | `RECEIVED` | `FleetHealth` — smoke `CC_FLEET_EXTRA` deleted | none | hi-fi 5a; appendix |
| BR-EX-45 | 2026-08-25 | Command Center · Promotion pipeline panel | Owner cannot see how alpha versions move Paper→Sandbox→Canary→Live, conversion per stage, or which version sits where — the funnel and matrix exist only as smoke | Aggregate + facts: `GET /api/v1/execution/promotion-pipeline?window=90d` → `stages[{key, entered, in_stage_now, halted, conversion{num,den}, notes[]}]`, `rows[{alpha_version_id, alpha_label, href, cells{STAGE:{kind done\|current\|none, decision_id, progress_label, venue, paused, href}}}]`, envelope | `PORTAL_PROJECTION` over registry + governance decisions (`PORTAL_CONTROL` ids) | read-only · medium: funnel counts **versions not deployments** — server rule | ≤200 alpha versions/90d, ≤4 stages; keyset if >50 rows; freshness = read_at; completeness flag when a decision id is missing | governance decision ids (BR-EX-30/35 lineage) | partial → rows with `kind:none` + completeness warning; unavailable → panel state | fixture `execution-promotion-pipeline.valid.json` (4 rows per hi-fi 5a); server-side conversion tests | Codex | N09 (Portal-owned workflow projection) | `RECEIVED` | `PromotionPipeline` — smoke `CC_PIPELINE` deleted | none | hi-fi 5a; appendix |
| BR-EX-46 | 2026-08-25 | Incident Detail `/execution/operations/incidents/:id` | While live capital is frozen the operator sees state codes and hashes, not the finding, the sync snapshot pair, blast radius, probable cause, the resolve budget, the market re-pricing the Δ, or the gates in words | Facts + workflow (read): `subject`, `opened_at`, `owner`, `origin`, `sla_ack`, `resolve_budget{seconds,started_at}`, `market{...}` (via BR-EX-43 tick or poll), `evidence_facts[]`, `operations_taken[]` + `apply_plan`, `resolution_gates[]` (worded mirror of `resolution_gate.blocker_codes`, server-enforced), `timeline_lines[]`, `waiting_line`, `resolved{...}`; two demo states OPEN/RESOLVED | incident/gates/timeline `PORTAL_CONTROL`; finding/snapshots/blast radius `TRADING_SYSTEM` (published incident/finding routes); market `TRADING_SYSTEM` feed; Δ money `DERIVED` (`derived_display`) | read-only; gates never unlock from UI · medium | 1 incident/screen; timeline ≤500 keyset; spark ≤48 pts; freshness = read_at + tick as_of | published alerts/findings/trace routes (§6.5, N11); market tick (BR-EX-43) | routes unpublished → source panels unavailable (today); market absent → band hidden; gates fall back to blocker codes | fixtures `execution-incident-detail.open.valid.json` + `.resolved.valid.json`; gate-mirror consistency test; frontend tests in handoff | Codex (Portal fields) · Trading System owner (routes) | N09 (Portal-owned) · N11 (sources) · N08 (tick) | `RECEIVED` | `IncidentDetailScreen` — smoke `incident.smoke.ts` deleted | none | hi-fi WF 4d; BR-EX-43; appendix |
| BR-EX-47 | 2026-08-25 | Operations Queue `/execution/operations` (+ alerts rail) | Operator cannot triage from three raw states: no priority, no plan→apply→verify phase, no detail/next step, no KPI strip or throughput, no escalation/plan-expiry countdown, no alerts rail | Facts + aggregates (read): per-row `priority` (server-computed severity×age×blast radius), `phases[]`, `state_chip`, `age_seconds`, `next_step{label,href}`, `detail_parts[]`, `sub_intents`, `escalate_at`, `plan_expires_at`, `incident_id` (BR-EX-33); root `kpis[]`, `throughput_verified_per_hour[24]`, `source{...}`; `GET /api/v1/execution/alerts?limit=20` typed alert cards | rows `PORTAL_PROJECTION` over `TRADING_SYSTEM` command journal; priority/escalation `DERIVED` (server rule); alerts `PORTAL_PROJECTION` (typed object state changes) | read-only · medium: a wrong priority misorders triage — server rule, browser never ranks | ≤200 rows/24h keyset; alerts ≤20; freshness = journal as_of, live via SSE when N08; countdowns from ISO timestamps | published ops routes (§6.5, N11); BR-EX-32 actor filter for "Mine"; BR-EX-33 incident ref; BR-EX-43 summary | alerts route unpublished → rail shows unavailable (today); missing priority → row without chip, never guessed | fixtures `execution-operations-queue.attention.valid.json` + `execution-alerts.valid.json`; server priority tests; frontend tests in handoff | Codex | N09 (Portal-owned projection) · N11 (ops routes) · N08 (live) | `RECEIVED` | `OperationsQueueScreen` — smoke `operationsQueue.smoke.ts` deleted on delivery | none until approved | hi-fi WF 4e; BR-EX-32/33/43; appendix A.47 |
| BR-EX-48 | 2026-08-25 | Full Blotter `/deployments/blotter` | Operator cannot reconcile against a venue statement from flat rows: no client id, TIF/flags, trigger price/source, OCO/bracket group and legs, fills with lineage and per-hop latency, avg px / slippage / fee-liquidity, live price or last-fill clock | Facts (read): per-row `client_order_id`, `tif`, `flags[]`, extended `order_type`, `trigger_price`, `trigger_source`, `oco_with`, `bracket_group_id`, `risk_grant_id`, `avg_price`, `slippage_bp`, `fee{amount,currency,liquidity}`, `fill_count`, `age_seconds`, `detail`, `reject{gate_id,reason}`; `GET /orders/{group}/legs`; `GET /orders/{id}/fills` (+ lineage = BR-EX-25 five hops); server `counts{working,conditional,brackets,filled,partial,rejected}`; market tick + `last_fill_at` via BR-EX-43 | orders/legs/fills `TRADING_SYSTEM` (orders_v2 + fills_v2); risk grant/reject `PORTAL_CONTROL`; slippage `DERIVED` (`slippage.v1`); trigger distance `DERIVED` display-only | read-only · medium: a rounded qty/price or a cross-currency sum breaks reconciliation — exact decimal strings, never summed across currencies | 10⁵–10⁷ rows keyset ≤200/page, virtualized; legs ≤8/group; fills ≤5,000/order paged; tick ≤1/1.3s | published orders/fills routes (§6.5, N11); BR-EX-24 scoped list; BR-EX-25 funnel hops; BR-EX-43 tick | route unpublished → row fields null, rendered "not published"; tick absent → no price pill | fixture `execution-blotter-orders.hifi.valid.json` (5 rows + legs + fills); exact-decimal tests; frontend tests in handoff | Codex · Trading System owner (routes) | N11 (adapters) · N10 (slippage derivation) · N08 (tick) | `RECEIVED` | `FullBlotter` — smoke `blotter.smoke.ts` deleted on delivery | none until approved | hi-fi WF 4c; BR-EX-24/25/43; appendix A.48 |
| BR-EX-49 | 2026-08-25 | Alpha Fleet `/deployments/alphas` (entry screen WF 2a) | Feature is COMMISSIONED with no data: operator has no fleet view — which alpha is live where, exposure, session pnl, what needs attention, next gate per alpha | Facts + aggregates (read): `fleet-list.v1` — summary, KPI strip (live exposure vs physical, fleet session pnl, deployments by stage, attention counts, portfolios), stage-filter counts, per-alpha rows (stage presence, alloc, 30d pnl per currency, max dd, equity sparkline, health/next gate, note) with nested deployments (venue·mode, stage note, alloc, pnl, dd, account, health, sync age); server sort live-exposure-first then furthest stage | PORTAL_PROJECTION over strategies ⋈ strategy_deployments ⋈ portfolio_allocations ⋈ performance/equity snapshots; DERIVED pnl/spark; PORTAL_CONTROL gates/attention; TRADING_SYSTEM tick for session pnl | read-only · medium: FX-mixing currencies or hiding a BLOCKED row misleads — per-currency values, blocked rows always visible | ≤500 alphas keyset ≤50/page; ≤20 deployments/alpha; spark ≤30 pts (extrema kept); as_of per second; session pnl per tick | registry feature `EXECUTION_ALPHA_FLEET`; BR-EX-43 tick; BR-EX-30/35 decision ids for next gate | route absent → panel unavailable (today); research rows without figures → `—` with reason | fixture `execution-fleet-list.valid.json`; sort-rule + per-currency tests; frontend `alphaFleet.test` | Codex | N09 (Portal projection) · N10 (derivations) | `RECEIVED` | `AlphaFleet` — smoke `alphaFleet.smoke.ts` deleted on delivery | none until approved | hi-fi "Alpha Fleet (list)"; appendix A.49 |
| BR-EX-50 | 2026-08-25 | Alpha 360 `/deployments/alphas/{id}` · Trade Replay tab | Operator cannot read fills against price: no candles, no fill/reject/armed markers, no bracket legs as levels, no round-trip pnl, no replay job, no trade log tied to markers | Facts (read): `replay.v1` — venue 1h OHLC (last bucket live), markers (ENTRY_FILL/EXIT_FILL_TP/EXIT_FILL_SL/EXIT_PARTIAL/BRACKET_ARMED/REJECT) with order/fill/bracket ids, round trips with pnl, legs (TP/SL/TRAILING trigger, flags, filled/total, activation_policy), mark tick, replay job (`execution_replay_jobs`), trade log keyset; deployment/symbol pickers | TRADING_SYSTEM candles/markers/legs/log; DERIVED round trips; PORTAL_CONTROL job; tick via BR-EX-43 | read-only · low-medium: marker time must be fill event ts; a misplaced marker misreads a trade | 120–2,000 candles; markers ≤500/window; log ≤200/page; tick ≤1/1.4s | BR-EX-48 legs/fills; BR-EX-43 tick; §6.5 orders/fills routes (N11) | route absent → tab unavailable; mark absent → no live line | fixture `execution-replay.dep_88.valid.json`; marker↔log id consistency; frontend `alpha360.test` replay cases | Codex · Trading System owner (OHLC) | N11 (adapters) · N08 (tick) | `RECEIVED` | `TradeReplay` — smoke `alphaReplay.smoke.ts` deleted on delivery | none until approved | hi-fi Alpha 360 WF 2a/2b; appendix A.50 |
| BR-EX-51 | 2026-08-25 | Portfolio 360 `/deployments/portfolios/{id}` (Overview + Structure) | Operator sees static KPIs only: no live NAV/today, no performance attributed to configuration revisions, no cross-portfolio comparison, no configuration log tied to operations/approvals, no what-if or symbol-overlap read | Facts + aggregates (read): `portfolio-360.v1.1` — status/facts, live strip (NAV per tick, today, allocated/max/free, exposure, return vs benchmark + α, max dd vs limit, attention), equity vs benchmark by window with revision eras, cross-portfolio rows + cross corr, configuration log (rev ↔ operation_id ↔ approval ↔ since-rev pnl), structure KPIs, what-if (`marginal.v1`), symbol overlap, footer links; actions report-pack / rebalance-plan later | DERIVED (`twr.v1`, `corr.v1`, `marginal.v1`) over snapshots · PORTAL_CONTROL revisions/log/limits/attention · TRADING_SYSTEM tick for NAV | read-only now (actions later, ADMIN step-up) · medium: an era mis-cut misattributes pnl to a configuration — revision boundaries are the ledger's | 3 windows ≤400 pts; log ≤200 keyset; cross ≤20; tick ≤1/1.4s | BR-EX-43 tick; BR-EX-30/35 approval ids; capital ledger (existing) | fields absent → panels unavailable; strip falls back to contract KPIs (today's `<details>`) | fixture `execution-portfolio-360.PF-CRYPTO.v1_1.valid.json`; era↔rev↔operation consistency; per-currency tests; frontend `analytics360.test` | Codex | N09 (projection) · N10 (derivations) · N08 (tick) | `RECEIVED` | `PortfolioThreeSixty` — smoke `portfolio360.smoke.ts` deleted on delivery | none until approved | hi-fi WF 3a; appendix A.51 |
| BR-EX-52 | 2026-08-26 | Accounts & Bindings `/deployments/accounts` (entry screen WF 1g) | No list of bindings: operator cannot see which credentialed external accounts back which virtual accounts, physical equity vs Σ virtual headroom, credential expiry/OTP, sync health per venue policy, open findings | Facts + aggregates (read): `bindings-list.v1` — summary, KPI strip (physical equity live, Σ virtual + headroom, credentials valid/expiring/OTP, findings, sync health), filter counts, binding rows (env, credential state/scopes, physical, Σ virtual, accounts, sync kind/age/policy, health) with nested virtual accounts | PORTAL_CONTROL (bindings, credentials — never secrets) · BROKER (equity, sync snapshots) · PORTAL_PROJECTION (virtual allocation) | read-only · medium: Σ virtual > physical must never read green; test/simulated funds never join NAV | ≤50 bindings; ≤20 virtual/binding; as_of per second; equity per tick | `venue_accounts`, `venue_credentials`, `accounts`, `strategy_deployments`, `broker_account_sync_snapshots`, `venue_rate_limits`, `venues.trading_sessions`; BR-EX-43 tick | route absent → panel unavailable (today); sync age absent → STALE/UNKNOWN, never OK | fixture `execution-bindings-list.valid.json`; invariant tests; frontend `accountsBindings.test` | Codex | N09 · N11 (broker adapters) | `RECEIVED` | `AccountsBindings` — smoke `accounts.smoke.ts` deleted on delivery | none until approved | hi-fi "Accounts & Bindings (list)"; appendix A.52 |
| BR-EX-53 | 2026-08-26 | Binding Detail `/deployments/accounts?binding={id}` | Operator cannot audit a binding: capital invariant bar per virtual account, credential scopes/secret fingerprint/ip allowlist/rotation/rate budget, live sync stream with digests, per-account recon, binding audit | Facts (read) `binding-detail.v1` + action `rotate-credential` (plan → apply → verify, step-up) | PORTAL_CONTROL (credential metadata) · BROKER (sync snapshots) · PORTAL_PROJECTION (capital) · `audit_log` | read + one governed mutation · high on the action (credential), read-only otherwise; **no key material ever in any payload** | stream ≤50 (+SSE `binding.snapshot`), audit ≤200 keyset | `venue_credentials`, `venue_rate_limits`, `broker_account_sync_snapshots`, `reconciliation_findings`, `audit_log`, `operator_operations`; N08 for stream | route absent → unavailable; rotate route absent → button links to Drawer with reason | fixture `execution-binding-detail.binance_main_01.valid.json`; secret-leak test; frontend `bindingDetail.test` | Codex | N09 · N11 · N08 | `RECEIVED` | `BindingDetail` — smoke deleted on delivery | rotate action = activation-gated (ADMIN step-up) | hi-fi "Binding Detail"; appendix A.53 |
| BR-EX-54 | 2026-08-26 | Account/Broker 360 `/deployments/accounts/{id}` | Hi-fi 1g masthead facts (env, sync age, headroom state, margin/settle/rev), cash free / locked, broker source, diff severity, findings history are not in v1 | Additive fields on `account-broker-360.v1` → v1.1 | as v1 | read-only | 1 account/screen | existing contract | missing fields → v1 rendering | fixture update; frontend `account360.test` | Codex | N09 | `RECEIVED` | `AccountBroker360` | none | hi-fi "Account Broker 360"; appendix A.54 |
| BR-EX-55 | 2026-08-26 | Every Execution screen — breadcrumb tail and masthead names | Names come from a hardcoded fixture map (`av_2041 → Grid v2.1`) or from the screen id, which is how a list route showed a fixture entity in its breadcrumb; other ids render raw | Facts (read): `entity-names.v1` batch resolver — id → kind, label, sub, href, env for alpha/deployment/account/binding/portfolio/incident/approval/exit_review | PORTAL_PROJECTION over `strategies`/`alphas`, `strategy_deployments`, `accounts`, `venue_accounts`, `portfolios`, Portal-owned incidents/approvals/exit reviews | read-only · low (display only; ids stay the keys) | ≤50 ids per call; ETag cached | any viewer | unknown id → `label:null` → raw id, never invented | none | fixture `execution-entity-names.valid.json`; frontend breadcrumb tests per route | Codex | N09 | `RECEIVED` | `ExecutionPreviewRoute` entity map deleted on delivery | none | cross-screen; appendix A.55 |
| BR-EX-56 | 2026-08-26 | Live `/deployments/live` (entry screen WF 1f/1e) | No live overview: operator cannot see live capital Σ, session pnl, gross exposure, which deployment is fail-closed, ladder state, broker sync, per-deployment pulse and the live tape | Facts + aggregates (read): `live-overview.v1` — summary, KPI strip, filter/venue counts, rows (stage, venue·account·portfolio, alloc, exposure, session pnl live, dd, pulse 60m, health, note), tape (≤20 + SSE `live.tape`) | PORTAL_PROJECTION (allocations/exposure) · DERIVED (session pnl, pulse) · PORTAL_CONTROL (fail-closed, ladder, conditions) · BROKER (sync) · TRADING_SYSTEM (fills tape, tick) | read-only · high visibility: FAIL_CLOSED must never read READY; canary scale-up blocked while a sibling is fail-closed is a server rule shown as note | ≤50 rows; tape ≤20; tick ≤1/1.4s | BR-EX-43 tick; incidents/approvals/conditions (Portal); `strategy_deployments`, `positions_v2`, `execution_sessions`, `fills`, `broker_account_sync_snapshots` | route absent → unavailable; sync absent → health DEGRADED, never READY | fixture `execution-live-overview.valid.json`; health-state rule tests; frontend `liveOverview.test` | Codex | N09 · N08 (tape) · N11 | `RECEIVED` | `LiveOverview` — smoke `live.smoke.ts` deleted on delivery | none until approved | hi-fi "Live Overview (entry)"; appendix A.56 |
| BR-EX-57 | 2026-08-26 | Live Full Operations `/deployments/live/{id}` | Hi-fi 1f masthead/meta/lifecycle strip, 5-cell KPI, broker & reconciliation truth (incl. mismatch object), open exposure table, protective ladder + last operation, 30d contribution bars are not in v1 | Additive fields on `live-full.v1` → v1.1 (BR-EX-57) | as v1 + DERIVED contrib.v1 | read-only (actions unchanged, ADMIN step-up) | 1 deployment; positions ≤200; bars 30 | existing contract; decision ids | missing → v1 rendering | fixture update; lifecycle decision-id consistency; frontend `liveFull.test` | Codex | N09 · N10 | `RECEIVED` | `LiveFullOperationsScreen` — `live.smoke.ts.full` deleted on delivery | none | hi-fi "Live Full Operations (WF 1f)"; appendix A.57 |
| _next: BR-EX-58_ | — | — | — | — | — | — | — | — | — | — | — | — | `RECEIVED` | — | none until approved | — |

### 7.3 Request quality gate

A request is returned as `NEEDS_CLARIFICATION` if it omits any of:

- the operator/reviewer decision it improves;
- whether it is a fact, aggregate, workflow or command;
- source authority;
- entity/workspace/environment scope;
- expected volume and freshness;
- behavior for unavailable/stale/partial/denied;
- exact frontend screen/interaction blocked.

A request is `REJECTED` when it asks Portal to infer financial truth, bypass typed source contracts,
use generic DB/Redis/CLI access, expose secrets, collapse safety states or enable a command through a
read capability.

---

## 8. Test and evidence matrix

| Change class | Minimum gate |
|---|---|
| Markdown/status only | link/path review, `git diff --check`, tracking test |
| JSON schema/OpenAPI | schema validation, generated TS sync, canonical positive/negative fixtures, breaking-change snapshot |
| TypeScript repository/API | unit + fresh PostgreSQL migrations, RBAC/workspace/CSRF, idempotency/concurrency, audit/outbox, dump/restore |
| Rust pure domain/query | unit/property/golden corpus, exact decimal, rustfmt, strict Clippy, PostgreSQL integration if applicable |
| Compatibility adapter | contract digest, vocabulary parity, route/method allowlist, positive/negative/error corpus |
| Network/auth | mTLS/JWT positive/negative matrix, wrong issuer/audience/resource/KID/expiry, public denial, loss/recovery |
| Projection/replay | snapshot/delta parity, duplicate/out-of-order/gap/tombstone, lease loss, restart, rebuild and epoch rollback |
| Query/analytics | exact counts/aggregates, 182k keyset scale, 150×150 correlation, 5k-point series, no-N+1, typed retention |
| SSE | snapshot/resume, epoch/gap/cursor retention, auth expiry close, fan-out/backpressure/source loss, H2 evidence |
| Command | plan/apply/verify, SoD/step-up/dual approval, idempotency/conflict, 202 nonterminal, uncertain/restart/rollback |
| Activation | exact signed images/contracts, finite window, baseline+delta, load/fault/soak, restore/rollback, owner record |

Evidence must be credential-free and must not contain raw business rows unless the owner explicitly
approves a separately secured location. Git receives only sanitized summaries/digests/fixtures.

---

## 9. Deployment, branch and release discipline

- Start every implementation branch from current `dev`.
- Do not commit directly to `dev` or `main`; only Bobby merges.
- Commit each coherent tested change immediately.
- `dev.portal.primusspark.com` tracks the dev runtime and isolated dev state.
- `portal.primusspark.com` tracks the isolated `main` stable worktree/runtime only.
- A dev build must never reuse stable Compose project names, mutable volumes, ports, tunnel routing
  or database credentials.
- Source/contract migrations must be backward compatible across the documented rollback window.
- Publish immutable image digests and compatibility matrix before a live owner window.
- Do not push `primus-origin` unless Bobby explicitly asks; `origin` is Bobby's canonical remote.

Read profile, realtime and command flags stay separate so rollback can disable one capability without
lying about the others.

---

## 10. Portal-wide backend backlog outside Execution Loop

These are not dropped; they are intentionally outside the Execution Loop critical path:

| Work | Current direction |
|---|---|
| U11 Quant progress durability | replace Python compatibility SSE with committed run/attempt events through the durable worker/control plane |
| U12 QuantBT capabilities | expand only checksum-certified `quantbt-engine==1.0.8` capabilities |
| U14/BAR-21 alpha import continuation | hermetic build, SBOM/scan/certification/signed publication from quarantine |
| U18 Planning persistence | production SQLite → PostgreSQL cutover with reconcile/rollback |
| U19 owner operations | full game day, DR, restore and operational sign-off |

These use the same status/test/branch discipline but must not be mixed into an Execution source or
command commit.

---

## 11. Recommended next sequence

The immediate backend order after Bobby accepts this plan is:

1. **N01 — D4 dormant closeout**: smallest high-value safety change; no source activation.
2. **N09 design rulings + source-independent contracts** for BR-EX-30/31/32/33/35/36/37/38.
3. **N10 contract design** for BR-EX-34/39/40, source-dark and fixture-backed.
4. Send the completed **N02** request/verifier pack to the Trading System owner; Codex waits for
   the exact four-file publication and acceptance result rather than editing Trading System.
5. N04's source-dark core/fencing, **N05** retention/recovery and the Portal-owned **N06**
   qualification authority are complete. Import and verify exact N02/N03 owner bytes before the
   N04 thin wire adapter or real N06 window; do not infer the wire or claim a synthetic soak.
6. Activate read surfaces through **N07**, realtime through **N08**, and commands through **N12**.
7. Promote environments only through **N13**, then close formal release/production runway
   **N14 → N17**.

The first implementation slice after this documentation commit should therefore be N01, unless Bobby
explicitly selects one of the source-independent N09/N10 contracts.

---

## 12. Evidence and detailed-reference index

Read these only when entering the mapped phase; this plan is the everyday overview.

| Topic | Detailed authority/evidence |
|---|---|
| Architecture and original phase mapping | `EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md` |
| Backend completed-slice index | `backend/README.md` |
| Claude original request/review | `upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_BACKEND_PLAN_REQUEST.md`, `BACKEND_PLAN_REVIEW.md` |
| Claude scale/current BR requests | `upgrade_frontend_plan_hifi/hifi_execution_loop/EXECUTION_SCALE_AND_REFINE.md` |
| **Hi-fi V2 requests BR-EX-41…57 — field-level detail** (types/enums/examples, DoR §5.1 pre-filled per package, OpenAPI path stubs, typed error/state examples, delivery order and per-package smoke retirement) | `upgrade_frontend_plan_hifi/hifi_execution_loop/BACKEND_REQUEST_HIFI_V2_2026-08-25.md` (appendices A–L; G/H/I = full JSON examples, derivation rules, errors, live events and required tests for BR-EX-49/50/51; J = source mapping and open decisions; K = BR-EX-52/53/54 bindings/accounts; L = BR-EX-56/57 live overview/full); verbatim copy of the §7.2 rows: `…/BACKEND_PLAN_7_2_ROWS_2026-08-25.md` |
| UI/UX authority for those requests — what each screen must show and why | hi-fi files `…/Design system discussion request_version2/HiFi *.dc.html` + owner screenshots 2026-08-25; grammar and per-screen smoke table `…/DESIGN_GRAMMAR_V3.md` (§8); audit `…/AUDIT_DENSITY_AND_INSIGHT_2026-08-25.md` |
| Frontend smoke modules to delete on delivery (one per screen, contract at file head) | `apps/portal/frontend/src/execution/{commandCenter,incident,operationsQueue,blotter,stage,alpha360}.smoke.ts` |
| Shared frontend/backend board | `upgrade_frontend_plan_hifi/hifi_execution_loop/PHASE_TRACKER.md` |
| D4 finite acceptance | `backend/EX_BE_02_LIVE_D4_PAPER_READ_SHADOW_ACCEPTANCE.md` |
| D4 runtime optimization | `backend/EX_BE_02_D4_SOURCE_FACADE_RUNTIME_OPTIMIZATION.md` |
| Projection/Query/SSE/analytics | `backend/EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md`, `backend/EX_BE_04B_RUST_PROJECTION_QUERY_PRIMITIVES.md`, `backend/EX_BE_06_MULTIPLEXED_SSE_RESUME_BACKPRESSURE.md`, `backend/EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md` |
| Source qualification | `backend/EX_BE_08A_OFFLINE_SOURCE_QUALIFICATION.md` |
| Retention/recovery/cleanup | `backend/EX_BE_03_N05_RETENTION_RECOVERY_CLEANUP.md` |
| Real-source qualification/soak | `backend/EX_BE_03_N06_REAL_SOURCE_QUALIFICATION_AND_SOAK.md` |
| Dual-cell supplement | `RESEARCH_EXECUTION_DUAL_CELL_AND_INSTITUTIONAL_UIUX_ADJUSTMENT_GUIDE_v0.5_vi.md` |
| Paper-to-Live supplement | `PAPER_TO_LIVE_EXECUTION_PORTAL_BACKEND_UIUX_ADJUSTMENT_SPEC_v0.6_vi.md` |
| Trading schema guide | `DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md` |

---

## 13. Change log

| Date | Change | Evidence/status effect |
|---|---|---|
| 2026-08-25 | Initial unified plan: current D1–D4 truth, N00–N17, H/A/BR-EX-01…40 and future Claude intake | documentation only; no runtime/profile/source/command change |
| 2026-08-25 | Claude: §7.2 BR-EX-41…57 appended (`RECEIVED`) — hi-fi V2 Command Center 5a / Incident 4d / stage workbenches; schema appendix in `hifi_execution_loop/BACKEND_REQUEST_HIFI_V2_2026-08-25.md` | documentation only; no runtime/profile/source/command change; codex triages per §7.1 |
