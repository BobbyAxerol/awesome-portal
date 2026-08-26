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
| EX-BE-06 SSE | `FOUNDATION_COMPLETE / ACTIVATION_EVIDENCE_PENDING` | real snapshot/resume/gap parity, h2 and source-loss evidence |
| EX-BE-07a analytics | `FOUNDATION_COMPLETE` | current Claude series/tile additions and source parity |
| EX-BE-07b screen APIs | `INTEGRATION_COMPLETE / SOURCE_ACTIVATION_EVIDENCE_PENDING` | active source, load/soak and independent screen promotion |
| EX-BE-08a | `OFFLINE_FOUNDATION_COMPLETE / LIVE_EVIDENCE_PENDING` | real-source parity, fault/load/soak/restore/rollback |
| PRE-IAM-01…06 | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | no reopening; later phases consume their contracts/evidence |

### 2.4 Product-screen backend state

| Product phase | Screen | Backend state | Primary remaining dependency |
|---:|---|---|---|
| 0 | Shell/registry | `CONTRACT_COMPLETE` | no backend blocker for fixture navigation |
| 1 | Approval Inbox | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-31/35; activation |
| 2 | Gate R1 | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-36/37; activation |
| 3 | Gate R2 | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-30 lineage/passport completion |
| 4 | Paper Workbench | `FOUNDATION_COMPLETE` | narrow screen API, BR-EX-34 and qualified Paper source |
| 5 | Paper Exit Review | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | Paper source facts and activation |
| 6 | Admin Action Drawer | `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE` | published routes + EX-BE-05b live relay |
| 7 | Operations Queue | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | BR-EX-32/33 and published ops sources |
| 8 | Incident Detail | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | published alerts/dead-letter/trace sources |
| 9 | Command Center | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | real source composition + SSE |
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
**Status:** `PORTAL_REQUEST_VERIFIER_COMPLETE / OWNER_PACK_PENDING / RUNTIME_V1_LOCKED`.  
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

**Claude parallel lane:** prepare UI for typed gap/resync/retention/completeness only; no live source.

### N03 — Trading-System-owned incremental source implementation

**Mapping:** D4-OPT-02.  
**Status:** `PORTAL_ACCEPTANCE_HARNESS_COMPLETE / N02_OWNER_PACK_PENDING / EXTERNAL_IMPLEMENTATION_PENDING`.  
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
**Status:** `OPERATIONAL_EVIDENCE_PENDING / N02_N03_WIRE_AND_OWNER_WINDOW_BLOCKED`.  
**Priority:** P0.

**Goal**

Prove correctness and resource safety before any reader consumes an ACTIVE epoch.

**Stages**

1. finite fresh BUILDING shadow window;
2. baseline and delta semantic parity against sealed corpus;
3. source loss/recovery, restart, duplicate, gap, expiry and tombstone drills;
4. cross-cell load/fault/restore/rollback tests;
5. 24-hour steady-state Paper soak with incremental source behavior;
6. owner review and separate read-profile promotion decision.

**Required metrics**

- p50/p95/p99 latency by route/query class;
- rows scanned/returned, source bytes and requests/minute;
- Rust RSS/CPU, queue depth, drops/backpressure and lease state;
- projection lag, data age, gaps/divergence and rebuild time;
- PostgreSQL size, IOPS, WAL and restore time;
- zero source mutation and zero secret/business payload in evidence.

**Exit gate**

All evidence is tied to exact source/edge/proxy image digests, contract revision, dataset scope and
owner window. Acceptance does not itself change a registry profile.

**Claude parallel lane:** run parity harness on sanitized accepted shadow artifacts; do not select
the source reader until N07 promotion.

### N07 — Projection, Query, analytics and narrow screen APIs in shadow

**Mapping:** EX-BE-03 → EX-BE-04b → EX-BE-07b.  
**Status:** `FOUNDATION_COMPLETE / SOURCE_ACTIVATION_PENDING`.  
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

**Claude parallel lane:** switch only the named screen through registry data, compare fixture/shadow,
and preserve visible `ProfileBadge` plus all unavailable states.

### N08 — SSE real-source activation

**Mapping:** EX-BE-06.  
**Status:** `FOUNDATION_COMPLETE / SOURCE_ACTIVATION_EVIDENCE_PENDING`.  
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
| _next: BR-EX-41_ | — | — | — | — | — | — | — | — | — | — | — | — | `RECEIVED` | — | none until approved | — |

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
5. N04's source-dark core/fencing and **N05** retention/recovery are complete. Import and verify
   exact N02/N03 owner bytes before the N04 thin wire adapter or **N06**; do not infer the wire.
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
| Shared frontend/backend board | `upgrade_frontend_plan_hifi/hifi_execution_loop/PHASE_TRACKER.md` |
| D4 finite acceptance | `backend/EX_BE_02_LIVE_D4_PAPER_READ_SHADOW_ACCEPTANCE.md` |
| D4 runtime optimization | `backend/EX_BE_02_D4_SOURCE_FACADE_RUNTIME_OPTIMIZATION.md` |
| Projection/Query/SSE/analytics | `backend/EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md`, `backend/EX_BE_04B_RUST_PROJECTION_QUERY_PRIMITIVES.md`, `backend/EX_BE_06_MULTIPLEXED_SSE_RESUME_BACKPRESSURE.md`, `backend/EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md` |
| Source qualification | `backend/EX_BE_08A_OFFLINE_SOURCE_QUALIFICATION.md` |
| Retention/recovery/cleanup | `backend/EX_BE_03_N05_RETENTION_RECOVERY_CLEANUP.md` |
| Dual-cell supplement | `RESEARCH_EXECUTION_DUAL_CELL_AND_INSTITUTIONAL_UIUX_ADJUSTMENT_GUIDE_v0.5_vi.md` |
| Paper-to-Live supplement | `PAPER_TO_LIVE_EXECUTION_PORTAL_BACKEND_UIUX_ADJUSTMENT_SPEC_v0.6_vi.md` |
| Trading schema guide | `DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md` |

---

## 13. Change log

| Date | Change | Evidence/status effect |
|---|---|---|
| 2026-08-25 | Initial unified plan: current D1–D4 truth, N00–N17, H/A/BR-EX-01…40 and future Claude intake | documentation only; no runtime/profile/source/command change |
