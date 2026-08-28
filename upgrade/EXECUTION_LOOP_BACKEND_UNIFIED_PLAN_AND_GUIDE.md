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

Portal/source-dark lane (may continue while Trading System works):
N13A -> N14A -> N15A -> N16A -> N17A

Owner/live lane (requires the master owner return and the matching A exit gate):
N13B -> N14B -> N15B -> N16B -> N17B
```

An `A` lane is Portal-owned, source-dark and safe to implement with contracts,
fixtures, isolated PostgreSQL and offline transport doubles. A `B` lane imports
owner-published bytes or touches a real inter-cell/runtime boundary. Completing
an A lane never implies that its B lane, source, screen or command is active.

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

### 3.4 Single official Trading System owner request

All known external dependencies are now consolidated in
[`TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md`](./backend/TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md).
It is the only active document to send to the Trading System owner and covers
N02/N03 source publication, N06 operational evidence, N11 reads, N12 commands,
N15 Event/Artifact authority and the N13–N17 promotion/release/emergency/DR
evidence ladder. Component request directories are machine annexes, not
separate owner asks. Older D4 and Claude request prose is audit-only.

Current inspection found no additional known Trading System feature request
after this master campaign. N13–N17 use the same contracts with independently
reviewed evidence/profile promotions. A genuinely new product capability or an
incompatible owner contract change amends the master revision instead of
creating another phase-local request file.

**Owner campaign consolidation checkpoint — 2026-08-27.** The only active
owner input is revision `portal.execution.trading-system-owner-request.v2`,
built by `scripts/build-trading-system-owner-campaign-pack.sh`. Portal commit
`d6609c8` produced the manifest-bound input; AWS-HK imported it at Trading
System commit `d900265` on branch
`feat/portal-execution-owner-campaign-v2`, worktree
`/home/bobby/.worktrees/trading-system-portal-execution-owner-v2/`. Historical
D1/D4/N02/N03/discovery packets were moved without deletion to the private,
hash-verified archive
`/home/bobby/.local/state/portal-execution/archive/20260827-consolidation-v2/`.
The legacy D4 v1 full-snapshot poller was stopped cleanly because it had no
connected client while refreshing every 500 ms. The canonical Rust Edge,
Source Proxy and projection PostgreSQL remain healthy and source-dark; all
seven proxy guard locations still return 503. The owner now implements within
the single campaign worktree. No older root-level packet or D4 v1 runtime is an
active instruction/source dependency, and no B-lane activation is implied.

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
**Status:** `PORTAL_REQUEST_VERIFIER_COMPLETE / MASTER_OWNER_REQUEST_READY /
OWNER_PUBLICATION_PENDING / RUNTIME_V1_LOCKED`.  
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
It was superseded before implementation and is audit-only. The source owner
uses the single official master request in §3.4; N02 remains its machine annex.

**Claude parallel lane:** prepare UI for typed gap/resync/retention/completeness only; no live source.

### N03 — Trading-System-owned incremental source implementation

**Mapping:** D4-OPT-02.  
**Status:** `PORTAL_ACCEPTANCE_HARNESS_COMPLETE / MASTER_OWNER_REQUEST_READY /
OWNER_IMPLEMENTATION_PENDING / EXTERNAL_IMPLEMENTATION_PENDING`.  
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

The Trading System owner implementation and N02 owner publication remain external dependencies,
but they are requested once through the §3.4 master campaign rather than a phase-local handoff.
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
**Status:** `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`.  
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

**Locked design rulings**

- `REQUEST_CHANGES` closes the current immutable attempt as `CHANGES_REQUESTED`; only a future
  trusted-intake flow may create a linked replacement through `supersedes_approval_id`;
- `Mine` means explicitly assigned; acknowledge atomically self-assigns only an unassigned item;
- command flags never gate Portal governance writes;
- Sandbox smoke plan remains a plan/evidence object, never runtime execution authority.

**Exit gate**

Schema/OpenAPI/generated types/fixtures, fresh-PG repository/API tests, CSRF/RBAC/SoD/idempotency/
concurrency/audit/outbox and dump/restore pass. Real source and registry activation remain separate.

**Claude parallel lane:** remove compatibility guesses only after generated contracts land; enable
previously disabled controls only when their exact policy is active.

**Delivered:** migration/repositories/APIs, canonical schema/OpenAPI/fixtures/generated types,
registry revision 5/policy revision 2 and fresh-PG/dump-restore/regression evidence are complete.
All new policy flags remain false. Detail:
[`EX_BE_05_N09_PORTAL_GOVERNANCE_WORKFLOW_GAPS.md`](./backend/EX_BE_05_N09_PORTAL_GOVERNANCE_WORKFLOW_GAPS.md).

### N10 — Series and insight analytics contracts

**Mapping:** EX-BE-07a/07b extension; product phases 4, 11, 12, 15, 16, 17.  
**Status:** `CONTRACT_COMPLETE / PRODUCTION_INACTIVE`.  
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
typed errors and response-size/load bounds pass. Source-backed promotion waits for N06/N07/N11.

**Delivered:** adaptive equity/drawdown/band engine, six semantic tile kinds, twelve-tile Alpha
catalogue, canonical string `execution.event.v1`, ten-event envelope/payload corpus, source-dark
OpenAPI and generated TypeScript. Both response contracts keep `runtime_active=false`; no route,
source, SSE, registry or command authority changed. Detail:
[`EX_BE_07_N10_SERIES_AND_INSIGHT_ANALYTICS_CONTRACTS.md`](./backend/EX_BE_07_N10_SERIES_AND_INSIGHT_ANALYTICS_CONTRACTS.md).

**Claude parallel lane:** keep smoke labels explicit; implement renderers against canonical kind/series
fixtures once delivered, without inventing numbers.

### N11 — Published external read capabilities and adapters

**Mapping:** EX-BE-01/07b compatibility continuation.  
**Status:** `PORTAL_REQUEST_GATE_AND_ADAPTER_COMPLETE / OWNER_PUBLICATION_PENDING / PRODUCTION_INACTIVE`.  
**Priority:** P1/P2 by screen safety value.

**Requests waiting on Trading System owner**

- BR-EX-24 scope-bound order list for Full Blotter;
- BR-EX-25 ruling/contract for four-stage versus five-hop funnel;
- BR-EX-26 authoritative full-population aggregate exposure verdict;
- BR-EX-27 packed-correlation per-cell `sample_counts`;
- authoritative VNM calendar/session/ATO/ATC capability;
- the eight exact `ops` routes in §6.5.

These are not sent as an independent N11 request. The N11 catalogue is the
external-read machine annex of the official master request in §3.4.

**Portal deliverables complete**

- one consolidated revision-1 request enumerating 24 exact GET capabilities;
- immutable owner catalogue/semantic/corpus/results/manifest shapes;
- fail-closed verifier for template, candidate and accepted owner packs;
- Rust compatibility gate, exact path/query allowlists, resource/scope checks,
  response-header/schema binding and typed denied/retryable/unavailable/incompatible outcomes;
- actual schema/fixture byte verification; a hash without its regular non-symlink artifact fails;
- partial publication remains per-capability unavailable and cannot become a false zero.

**Deliverables after owner publication**

- new contract pack revision and immutable digest;
- Rust compatibility adapter and golden positive/negative corpus;
- bounded authenticated Source Proxy route;
- per-panel unavailable behavior for older/partial capability revisions;
- source parity/load/fault/rollback evidence.

**Exit gate**

No adapter is accepted from handwritten prose alone. Published machine contract, owner identity,
golden corpus and accepted shadow evidence are all required.

Portal-side exit evidence is complete. The source-backed portion stays closed until the Trading
System owner returns the accepted pack; no runtime/profile/source flag is changed by N11. Detail:
[`EX_BE_01_N11_EXTERNAL_READ_CAPABILITIES_AND_ADAPTERS.md`](./backend/EX_BE_01_N11_EXTERNAL_READ_CAPABILITIES_AND_ADAPTERS.md).

**Claude parallel lane:** keep affected controls/panels disabled or unavailable with the request ID;
never sum a visible page or infer missing source facts.

### N12 — Live command relay

**Mapping:** EX-BE-05b live continuation.  
**Status:** `PORTAL_COMMAND_PUBLICATION_GATE_AND_RELAY_COMPLETE / OWNER_PUBLICATION_PENDING / PRODUCTION_INACTIVE`.  
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

Portal-side publication verification, independent flag/kill-switch policy and
restart-safe Rust journal are complete. Owner command routes/identity/corpus
have not been published, so TypeScript apply and every runtime command lane
remain disabled. Detail:
[`EX_BE_05B_N12_LIVE_COMMAND_RELAY.md`](./backend/EX_BE_05B_N12_LIVE_COMMAND_RELAY.md).

N12 is the independently gated command annex of the official master request in
§3.4, not another owner campaign.

**Claude parallel lane:** render the canonical catalogue and terminal; keep unreachable entries hidden/
disabled and never equate HTTP 202 with success.

### N13 — Staged product activation

**Mapping:** product phases 4–18; delivery profile ladder.  
**Status:** `N13A_COMPLETE_SOURCE_DARK / N13B_MASTER_OWNER_RETURN_PENDING`.  
**Priority:** P1 after foundations.

N13 requires accepted owner bytes and environment-specific evidence from the
master campaign; it does not require another Trading System feature request.

#### N13A — Source-dark staged activation foundation

**Can start now. Owner:** Portal.

- implement the delivery-profile state machine and legal transition graph;
- persist profile/capability state, immutable evidence references and
  compatibility requirements in isolated Portal PostgreSQL;
- expose TypeScript plan/apply/verify APIs with RBAC, CSRF, idempotency,
  optimistic concurrency, audit and outbox;
- keep Query, SSE and R1/R2/R3/R4 flags independent and default false;
- implement atomic promotion/rollback plans and affected-capability-only
  rollback;
- validate signed contract/image/schema/evidence references without importing
  or trusting an owner candidate;
- provide canonical fixture, denied, incompatible, stale, partial, rollback
  and restart test states for Claude.

**N13A exit gate:** fresh-PostgreSQL migration/repository/API/security tests,
duplicate/conflict/restart/rollback corpus and fixture-only end-to-end tests
pass. Every runtime/source/command flag remains false.

**Completed 2026-08-26:** the TypeScript control plane, thirteen-migration
Portal PostgreSQL model, immutable evidence/compatibility references,
plan/apply/verify APIs, seven-state Claude corpus and affected-capability-only
fixture rollback are implemented. Database constraints keep effective profile
`fixture`, source/runtime false and kill switches engaged. See
[`EX_BE_08_N13A_SOURCE_DARK_STAGED_ACTIVATION.md`](./backend/EX_BE_08_N13A_SOURCE_DARK_STAGED_ACTIVATION.md).

#### N13B — Owner-backed staged activation

**Blocked until:** accepted master owner return, N06 Paper evidence and N13A.

- import exact accepted owner bytes and immutable identities;
- run candidate/acceptance verification and real Paper shadow parity;
- promote one read-only Paper capability at a time;
- qualify Paper protective commands, then Sandbox, Live Canary protective,
  Live Canary risk-increasing and finally Live Full;
- collect per-step load/fault/auth/audit/restore/rollback evidence;
- roll back only the failed capability/profile.

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
**Status:** `N14A_COMPLETE_SOURCE_DARK / N14B_OWNER_RELEASE_EVIDENCE_PENDING`.  
**Priority:** P2 before formal release.

Trading System contributes immutable compatibility/evidence under the master
campaign. N14 does not open a new endpoint request.

#### N14A — Portal release authority, source-dark

- immutable multi-service Portal release manifest and compatibility matrix;
- signed Portal images, SBOM and vulnerability evidence;
- isolated SGP dev versus main/stable deployment state;
- migration/preflight/rollback/forward-fix contracts;
- release-candidate evidence schema and owner-decision record;
- tests proving a dev build cannot route to or mutate stable state.

**N14A exit gate:** isolated deploy/rollback rehearsal, signature verification,
database restore and branch/runtime separation pass without Trading System
traffic.

**Completed 2026-08-26:** the exact six-service digest manifest,
source-dark compatibility/profile contracts, CI-bound signatures/SBOM/SLSA/
Trivy evidence, production owner-decision gate and stable digest-only Compose
path are implemented. A real three-volume PostgreSQL rehearsal proves
dev/stable isolation, pre-migration restore and expand/forward-fix behavior.
Seventeen release/security tests and actionlint pass with no AWS-HK or Trading
System traffic. The production keyless candidate is emitted only from a
successful protected-main CI commit. See
[`EX_BE_17_N14A_PORTAL_RELEASE_AUTHORITY_SOURCE_DARK.md`](./backend/EX_BE_17_N14A_PORTAL_RELEASE_AUTHORITY_SOURCE_DARK.md).

#### N14B — Joint immutable release compatibility

**Blocked until:** accepted owner contracts/images and N13B target profile.

- bind exact Trading System source/gateway commit, image, config and contract
  digests into the release compatibility matrix;
- execute joint preflight, deploy, rollback and forward-fix rehearsal;
- record owner release approval for the exact environment/capability set.

**Combined N14 exit gate:** deploy/rollback rehearsal on isolated state,
signature verification and owner release approval.

**Exact next action for N14B:** after N13B selects one accepted target profile,
import the owner-published source/gateway commit, image, config and contract
digests into a new compatibility revision; then run joint preflight,
deploy/rollback/forward-fix and obtain exact Portal + Trading System owner
approval. N14A templates/candidates cannot satisfy this gate.

### N15 — Formal inter-cell gateway authority

**Mapping:** BAR-18.  
**Status:** `N15A_COMPLETE_SOURCE_DARK / N15B_OWNER_PUBLICATION_PENDING`.  
**Priority:** P2.

**Goal**

Formalize four independent interfaces: Query, Command, Event and Artifact. D1–D4 provide the read
foundation; commands, production events and artifact exchange require their own contracts/gates.
All four owner-side publications are already requested by the master campaign:
N11 Query, N12 Command, N02/N03 Event coverage and the master Artifact ruling.

#### N15A — Source-dark four-interface gateway contract

- formalize independent Query, Command, Event and Artifact version ranges;
- capability negotiation, incompatible/unavailable outcomes and rollback
  selection;
- separate read/command identities and delegated-resource policy;
- bounded transport blueprints, pools, timeouts, retry/no-retry rules and
  redacted observability;
- Event replay/gap/epoch fixtures using N02 semantics;
- Artifact digest/schema/size/access-policy fixtures and rejection corpus;
- local transport doubles for partition, duplicate, out-of-order, expiry and
  forged assertion tests.

**N15A exit gate:** contract/codegen/parity/security/fault tests pass with no
real endpoint, credential or source call.

**Completed 2026-08-26:** the Portal now owns one source-dark four-interface
authority with independent Query, Command, Event and Artifact version ranges,
rollback selection, identity/transport policy, Event continuity, Artifact
metadata/reference policy and local fault doubles. The OpenAPI contains only
components and no paths/servers; tests prove `network_attempts=0`, no source
call and no activation. See
[`EX_BE_18_N15A_SOURCE_DARK_FOUR_INTERFACE_GATEWAY.md`](./backend/EX_BE_18_N15A_SOURCE_DARK_FOUR_INTERFACE_GATEWAY.md).

#### N15B — Real inter-cell gateway acceptance

**Blocked until:** accepted N02/N03/N11/N12/N15 owner artifacts and N15A.

- wire exact mTLS/JWT identities and owner-published route locations;
- prove Query, Command, Event and Artifact compatibility independently;
- run WAN partition, replay, duplicate, out-of-order, expiry, schema-drift,
  source-loss and rollback tests;
- publish end-to-end trace/correlation and measured SLO evidence.

**Exit gate:** version/compatibility negotiation, identities, SLOs, observability, failure semantics,
rollback and owner matrix exist for all four without generic host/DB/Redis access.

### N16 — Same-domain routing and emergency operations

**Mapping:** BAR-19.  
**Status:** `N16A_COMPLETE_SOURCE_DARK / N16B_R3_OWNER_ACCEPTANCE_PENDING`.  
**Priority:** P2.

The Trading System dependency is the existing N12 R3 protective contract plus
N11 operational facts. Same-domain routing and break-glass ceremony remain
Portal/Cloudflare work; no hidden second command request is allowed.

#### N16A — Source-dark routing and emergency policy

- same-domain route/profile configuration and origin-isolation templates;
- consistent session/RBAC plus stronger emergency step-up/short-session policy;
- minimal emergency UI states, typed unavailable/degraded behavior and
  command-independent health;
- break-glass reason, expiry, actor, approvals and immutable Portal audit;
- simulated Research/Cloudflare/origin loss and rollback drills;
- no emergency control when the N12 R3 catalogue is unpublished.

**N16A exit gate:** routing/auth/audit/fixture/failover tests pass against local
doubles; no public route or Trading System command becomes active.

#### N16B — Real protective-path acceptance

**Blocked until:** accepted N12 R3 routes, dedicated command identity, N15B and
an owner change window.

- exercise same-domain emergency read/protective flow while Research is
  degraded or unavailable;
- prove observed Trading System acknowledgement and terminal reconciliation;
- verify stronger access policy, no browser-visible internal hostname/token,
  immutable audit and rollback;
- confirm R4 resume/scale cannot inherit the emergency path.

**Combined N16 exit gate:** no emergency path bypasses Trading System authority
or audit; public/auth/source loss is visibly degraded and recoverable.

### N17 — Production activation, SLO, DR and owner operations

**Mapping:** BAR-20 + product phase 18.  
**Status:** `N17A_COMPLETE_SOURCE_DARK / N17B_JOINT_PRODUCTION_ACCEPTANCE_PENDING`.  
**Priority:** final.

Trading System participates in measured SLO, rollback, rotation and game-day
evidence requested by the master campaign. No new feature route is expected.

#### N17A — Source-dark production/DR preparation

- SLO/error-budget schema, dashboards, alert rules and evidence collectors;
- encrypted backup/PITR/rebuild/restore automation for Portal-owned state;
- key/certificate/credential rotation and compromise runbooks;
- capacity/retention/cost budgets and quarterly game-day plan;
- owner matrix, incident/rollback responsibilities and release checklist;
- simulated partition, auth-loss, source-loss and command-containment corpus.

**N17A exit gate:** offline/isolated restore, rollback, rotation dry-run and
evidence validation pass without production activation.

#### N17B — Joint production acceptance

**Blocked until:** N13B–N16B accepted for the exact profile and owner window.

- activate the approved production capability set only;
- measure SLO/error budgets and capacity under real bounded traffic;
- run joint backup/restore, WAN partition, auth/source loss, command
  containment and rollback game day;
- record RPO/RTO, rotation and owner/SRE evidence;
- require Bobby's final exact release sign-off.

**Combined N17 exit gate:** Bobby signs the exact production acceptance record
after successful restore, rollback, source-loss, auth-loss and
command-containment rehearsals.

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
| 28a | canonical command catalogue | `PORTAL_COMMAND_GATE_COMPLETE / OWNER_PUBLICATION_PENDING / PRODUCTION_INACTIVE` | N12 |
| 28b | allocation risk classification | `OWNER_DECISION_PENDING`, conservative floor R1 | N12 |
| 29 | typed `conditions[]` | `FOUNDATION_COMPLETE / PRODUCTION_INACTIVE` | N09/N12 |
| 30 | R2 lineage/grant/role/author/passport | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | N09 |
| 31 | independent `governance_write_enabled` | `CONTRACT_COMPLETE / POLICY_FALSE` | N09 |
| 32 | Operations `Mine` actor/assignee semantics | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | N09 |
| 33 | operation → incident reference | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | N09 |
| 34 | equity/band/drawdown series | `CONTRACT_COMPLETE / PRODUCTION_INACTIVE` | N10 |
| 35 | approval history keyset API | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | N09 |
| 36 | `REQUEST_CHANGES` verb/lifecycle | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | N09 |
| 37 | typed R1 `known_limitations[]` | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | N09 |
| 38 | bounded Sandbox smoke plan | `INTEGRATION_COMPLETE / RUNTIME_INACTIVE` | N09 |
| 39 | event envelope+payload corpus and schema version | `CONTRACT_COMPLETE / SSE_INTEGRATION_PENDING` | N10 then N08/N11 |
| 40 | insight `tile_kind` + per-kind series schema | `CONTRACT_COMPLETE / FRONTEND_INTEGRATION_PENDING` | N10 |

No BR-EX-30…40 row is silently considered implemented because a similarly named fixture or UI field
exists. N09 rows above are complete only because generated contracts, backend behavior and fresh-PG
tests prove them; N10 rows are contract-complete but remain production-inactive until their explicit
source and frontend integration gates pass.

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
| BR-EX-58 | 2026-08-26 | Stage workbenches (Paper/Sandbox/Canary/Live) — Guard rail | Blocker codes arrive raw from 3–4 sources; no human label, owner, since, resolution link or ordering — the rail reads as a log dump | Facts (read): `blocker-catalog.v1` (code → label, severity, owner, resolves_via href template, doc, rank) + stage contracts carry `blockers[{code, since, source, ref}]` instead of bare `blockerCodes[]` | PORTAL_CONTROL (catalog, Portal-owned) · each source keeps its codes | read-only · low | ≤200 codes; ETag | any viewer | code missing from catalog → raw code shown, never invented | none | fixture `execution-blocker-catalog.valid.json`; all stage-fixture codes ∈ catalog test | Codex | N09 | `RECEIVED` | `ExecutionContextRail` blockers | none | appendix L.7 |
| BR-EX-59 | 2026-08-26 | Canary Control Room `/deployments/live/{id}/canary` | Hi-fi 1e masthead (trial day, exit-review countdown, GUARDED/DEGRADED), lineage + lifecycle strips, 5-cell KPI, live-vs-paper-vs-backtest lines on one digest, envelope bars with at-cap, positions with ACK latency, incidents/recon, 14-day trial timeline with recorded checkpoints, exit-readiness gates (server mirror), marginal contribution, promotion decision options are not in v1 | Additive fields on `canary-control-room.v1` → v1.1 (BR-EX-59) | PORTAL_CONTROL (trial, gates, checkpoints, decision) · DERIVED (equity_projection.v1, marginal.v1) · TRADING_SYSTEM (positions, orders, ack) · BROKER (sync) | read-only + existing governed actions · high: "elapsed time alone never promotes" — gates are server-enforced, screen mirrors | 1 deployment; 3 series ≤400 pts; timeline ≤30 days | existing contract; approvals/conditions; exit reviews; paper twin dep_94; backtest run | missing → v1 rendering; sync STALE → readiness DEGRADED + scale blocked | fixture update; gate-mirror + timeline consistency tests; frontend `canary.test` | Codex | N09 · N10 | `RECEIVED` | `CanaryControlRoomScreen` — smoke `canary.smoke.ts` deleted on delivery | none | hi-fi "Canary Control Room (WF 1e)"; appendix A.59 |
| BR-EX-60 | 2026-08-28 | Sandbox `/deployments/sandbox` (entry screen WF 1d) | No sandbox overview: operator cannot see what is in certification, how far each deployment got, which step is holding it, whether a certification has been stalled for weeks, testnet order-journal counts, venue connectivity baselines, or what has been certified in the last 90d | Facts + aggregates (read): `sandbox-overview.v1` — summary, KPI strip (in certification, halted by finding vs by operator, open findings with worst severity, test-fund equity flagged `enters_portfolio_nav:false`, broker sync age vs policy), rows (alpha·deployment, venue·account, portfolio → target + pending approval, seven `certification.steps[]` with `passed`/`current_step`, runtime_state + halt_reason, `in_stage_days` + `stalled`, next_step with action_key + blocker_codes, lineage r1/r2/paper_exit, note), 7d order journal per deployment (orders/filled/rejected/expired/success_pct exact) + normalized executed order types with `required`/`certified` + reject reasons, 24h connectivity (ACK/fill p50-p95, ws reconnects, rate-limit hits, baseline vs SLO rule), recently certified 90d with promotion target | PORTAL_PROJECTION over `strategy_deployments(mode='sandbox')` ⋈ `accounts` ⋈ `venue_accounts` ⋈ `portfolio_allocations`; certification state from the PORTAL certification machine (overview re-reads, never recomputes); `orders`/`fills`/`domain_events` TRADING_SYSTEM; `broker_account_sync_current_state` BROKER; DERIVED success_pct/latency | read-only · medium: test-fund equity must never enter portfolio NAV, and a stalled certification must surface rather than expire silently | ≤50 deployments in certification; journal window 7d exact counts; connectivity 24h; as_of per second | registry feature `SANDBOX_TRADING` (screen still `data_mode: NONE` — codex flips it on delivery); BR-EX-43 alerts summary | source unreadable → `panel_state: "unavailable"` per branch, never an empty array read as clean; `runtime_state` absent stays null (screen renders "runtime not stated") | fixture `execution-sandbox-overview.valid.json`; tests: `passed == count(PASS)`, `current_step` = first non-PASS, `success_pct == filled/orders` exact, `test_fund_equity.enters_portfolio_nav == false` and absent from every portfolio NAV, `stalled ⇒ meta.stalled_rule != null`; frontend `sandbox.test` | Codex | N09 (Portal projection) · N10 (derivations) · N11 (order/fill adapters) | `RECEIVED` | `SandboxOverview` — smoke `sandbox.smoke.ts` (overview half) deleted on delivery | none until approved | hi-fi "Sandbox Overview (entry for WF 1d)"; **full spec §7.4.2**; UI rationale appendix O.2 |
| BR-EX-61 | 2026-08-28 | Sandbox Certification `/deployments/sandbox/{id}` (WF 1d) | v1 publishes steps, findings, source panels, promotion plans and timeline, but not what the hi-fi workbench decides on: identity + credential status, broker REST freshness vs policy, the internal/broker/difference triptych as an authoritative diff, findings rows with local/broker values and the action each one takes, order-type certification (including the types the alpha requires in production but has never exercised), execution quality with INSUFFICIENT_DATA, the bounded smoke plan, the cleanup checklist, the four actions with their blockers, and the peers in certification | Additive fields on `sandbox-certification.v1` → v1.1: `identity`, `broker_freshness`, `reconciliation_view{internal,broker,difference}` (diff.v1, server-computed), `findings_rows[]`, `order_type_certification{rows[],blocking,blocking_rule}`, `execution_quality` (ack/fill p50-p95, slippage state, reject rate), `smoke_plan` (bounded: qty, capital cap, timebox, on_expiry, approved_by, state), `cleanup{rows[],exit_rule}`, `actions[]{key,label,enabled,risk_tier,blocker_codes}`, `peers[]`; plus command routes `sandbox.broker_sync` / `sandbox.reconcile_dry_run` / `sandbox.smoke_open` / `sandbox.request_exit_review` as plan → apply → verify | PORTAL_CONTROL (certification machine, smoke plan, command policy) · BROKER (`broker_account_sync_current_state`) · TRADING_SYSTEM (`orders`, `fills`, `positions_v2`, `order_pending_exposure`, `domain_events`) · DERIVED (diff.v1, execution_quality.v1) | read + four governed mutations (ADMIN step-up) · high: certification is the gate before real capital — `enabled:true` must be a deliberate decision, fail-closed by default | 1 deployment/screen; findings ≤200 keyset; peers ≤20 | existing `sandbox-certification.v1` (additive, no field retyped); BR-EX-58 blocker catalog; BR-EX-41 stage telemetry | any missing branch → v1 rendering; broker STALE / CRITICAL finding / cleanup pending ⇒ smoke + exit actions disabled with codes; slippage under min samples ⇒ INSUFFICIENT_DATA, never 0 | fixtures `execution-sandbox-certification.dep_77.v1_1.valid.json` + `.dep_91.v1_1.valid.json` (CRITICAL branch); tests: CRITICAL OPEN ⇒ recon step FAIL + smoke BLOCKED + `actions[smoke_open].enabled==false` with non-empty codes; `slippage.state=='INSUFFICIENT_DATA'` carries no `value`; a `required:true` order type not CERTIFIED ⇒ `progress.eligible==false`; v1 suite re-runs unchanged; frontend `sandbox.test` | Codex | N09 · N10 · N11 · N13 (activation for the four actions) | `RECEIVED` | `SandboxCertificationScreen` — smoke `sandbox.smoke.ts` (certification half) deleted on delivery | four `sandbox.*` actions are activation-gated (ADMIN step-up, plan → apply → verify) | hi-fi "Sandbox Certification (WF 1d)"; **full spec §7.4.3**, decisions §7.4.6; UI rationale appendix O.3 · O.5 |
| _next: BR-EX-60_ | — | — | — | — | — | — | — | — | — | — | — | — | `RECEIVED` | — | none until approved | — |

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

### 7.4 BR-EX-60 / BR-EX-61 — full specification (Sandbox Overview + Sandbox Certification v1.1)

Written into this file rather than left in a frontend appendix: §7 says a request becomes
schedulable only when it lives here. The frontend hi-fi document carries the same content with
screenshots and the per-field UI rationale; if the two ever disagree, **this section wins**.

Frontend state at 2026-08-28: both screens are built and running on
`apps/portal/frontend/src/execution/sandbox.smoke.ts`, which prints a smoke warning on every page
and carries the deletion contract at its file head. Delivering these two rows retires that module.

#### 7.4.1 Domain — what a sandbox certification is

Sandbox is not "paper with more realism". It is the **venue-integration certification gate**: proof
that this exact `(alpha artifact, venue, credential, account binding)` can place a real testnet
order, fill it, cancel it, and that internal state matches broker state — before any real capital is
allocated. Seven ordered steps, and the **server owns the order**; the browser never computes which
step is current.

| # | `step_key` | Meaning | Source of truth |
|---|---|---|---|
| 1 | `account` | virtual account exists for `(strategy_id, account_id, mode='sandbox', venue)` | `accounts` ⋈ `strategy_deployments` |
| 2 | `binding` | binding to the physical account is verified | `venue_accounts(external_account_ref)` + `venue_credentials(status)` |
| 3 | `broker_sync` | REST/ws snapshot is fresh against the venue policy | `broker_account_sync_current_state(synced_at, status)` |
| 4 | `recon_dry_run` | dry-run reconcile is clean — **fail-closed** on any OPEN CRITICAL finding | `reconciliation_findings(mode='sandbox', status='OPEN')` |
| 5 | `smoke` | a bounded smoke plan is approved and applied | Portal smoke plan `sp_*` + `operator_operations` |
| 6 | `cleanup` | no open order, no residual position, reservations released, final sync done | `orders`, `positions_v2`, `order_pending_exposure` |
| 7 | `exit_review` | Sandbox Exit Review `SX-*` requested and approved | Portal exit reviews |

Three domain laws the UI must never invent, so the server must carry them explicitly:

1. **Test funds never enter portfolio NAV.** Testnet equity is certification evidence, not capital.
   It is published on its own branch with `enters_portfolio_nav: false`, and it must not appear in
   any portfolio NAV total.
2. **A stalled certification never expires silently.** A large `in_stage_days` (36d in the current
   cast) is a signal, not a rendering bug. The server marks `stalled` against its own threshold and
   publishes that threshold; the browser has no timeout of its own.
3. **Certification requires every order type the alpha uses in production.** An alpha whose exit path
   uses `REDUCE_ONLY` and has never sent one on testnet is not certified, however well its other
   orders filled.

#### 7.4.2 BR-EX-60 — `GET /api/v1/execution/sandbox/overview` → `sandbox-overview.v1`

```json
{
  "as_of": "2026-08-28T04:54:32Z",
  "meta": { "stalled_rule": "no VERIFIED operator_operation in 7d and in stage > 14d" },
  "summary": { "in_certification": 2, "venues": 2, "test_funds_only": true },
  "kpis": {
    "in_certification": { "value": 2, "note": "certification = 7-step gate to canary" },
    "halted": { "value": 2, "by_finding": 1, "by_operator": 1 },
    "open_findings": { "value": 1, "worst_severity": "CRITICAL", "ref": { "kind": "deployment", "id": "dep_91" } },
    "test_fund_equity": { "value": "20000", "ccy": "USDT", "enters_portfolio_nav": false },
    "broker_sync": { "age_seconds": 10, "policy_seconds": 60, "state": "OK", "detail": "OKX rest · BIN-T1 ws OK" }
  },
  "rows": [
    {
      "deployment_id": "dep_77", "alpha": "Carry v3.2", "alpha_version_id": "av_2103",
      "venue": "OKX_TESTNET", "account_id": "acct-sbx-carry-okx",
      "portfolio_id": "PF-CRYPTO", "target_portfolio_id": "PF-MAIN",
      "target_approval": { "id": "AP-352", "status": "PENDING" },
      "certification": { "passed": 5, "total": 7, "current_step": "smoke", "steps": [
        { "key": "account", "state": "PASS" }, { "key": "binding", "state": "PASS" },
        { "key": "broker_sync", "state": "PASS" }, { "key": "recon_dry_run", "state": "PASS" },
        { "key": "smoke", "state": "PENDING" }, { "key": "cleanup", "state": "NOT_STARTED" },
        { "key": "exit_review", "state": "NOT_STARTED" } ] },
      "runtime_state": "HALTED", "halt_reason": "OPERATOR",
      "in_stage_days": 9, "stalled": false,
      "next_step": { "label": "run smoke activation", "action_key": "sandbox.smoke_open", "enabled": false, "blocker_codes": [] },
      "lineage": { "r1_id": "AP-101", "r2_id": "AP-207", "paper_exit_id": "PX-29" },
      "note": "smoke plan approved, awaiting apply · cleanup + exit review remain"
    },
    {
      "deployment_id": "dep_91", "alpha": "Grid v2.1", "alpha_version_id": "av_2041",
      "venue": "OKX_TESTNET", "account_id": "acct-sbx-grid-okx",
      "portfolio_id": "PF-CRYPTO", "target_portfolio_id": null, "target_approval": null,
      "certification": { "passed": 3, "total": 7, "current_step": "recon_dry_run", "steps": [
        { "key": "account", "state": "PASS" }, { "key": "binding", "state": "PASS" },
        { "key": "broker_sync", "state": "PASS" }, { "key": "recon_dry_run", "state": "FAIL" },
        { "key": "smoke", "state": "BLOCKED" }, { "key": "cleanup", "state": "NOT_STARTED" },
        { "key": "exit_review", "state": "NOT_STARTED" } ] },
      "runtime_state": "HALTED", "halt_reason": "FINDING",
      "in_stage_days": 36, "stalled": true,
      "next_step": { "label": "resolve finding → re-run dry-run", "action_key": "sandbox.reconcile_dry_run", "enabled": false, "blocker_codes": ["CRITICAL_FINDING_OPEN"] },
      "lineage": { "r1_id": "AP-118", "r2_id": "AP-152", "paper_exit_id": "PX-22" },
      "note": "CRITICAL: position mismatch BTC-USDT-SWAP local 0.0000 vs broker 0.0300 · certification fail-closed at step 4"
    }
  ],
  "order_journal": {
    "window_days": 7, "exact": true,
    "rows": [
      { "deployment_id": "dep_77", "alpha": "Carry", "orders": 151, "filled": 142, "rejected": 6, "expired": 3, "success_pct": "0.940" },
      { "deployment_id": "dep_91", "alpha": "Grid", "orders": 96, "filled": 81, "rejected": 14, "expired": 1, "success_pct": "0.844" }
    ],
    "order_types": [
      { "type": "LIMIT", "count": 148, "certified": true }, { "type": "MARKET", "count": 42, "certified": true },
      { "type": "STOP_MARKET", "count": 21, "certified": true }, { "type": "POST_ONLY", "count": 30, "certified": true },
      { "type": "OCO", "count": 4, "certified": false, "required_min": 10 },
      { "type": "REDUCE_ONLY", "count": 0, "certified": false, "required": true }
    ],
    "reject_reasons": [ { "code": "POST_ONLY_CROSS", "count": 11 }, { "code": "MIN_NOTIONAL", "count": 5 }, { "code": "RATE_LIMIT", "count": 4 } ]
  },
  "connectivity": {
    "window_hours": 24,
    "ack_latency_ms": { "p50": 40, "p95": 125 }, "fill_latency_ms": { "p50": 123, "p95": 321 },
    "ws_reconnects": 3, "rate_limit_hits": 4,
    "baseline_note": "testnet sets the baseline expectation, not the production SLO",
    "finding_rule": "sustained p95 > 2x baseline raises a finding"
  },
  "recently_certified": [
    { "at": "2026-07-30", "alpha": "Grid v2.1", "venue": "BINANCE", "verdict": "certified", "passed": 7, "total": 7, "exit_review_id": "SX-14", "promoted_to": { "stage": "CANARY", "deployment_id": "dep_88" } },
    { "at": "2026-07-18", "alpha": "MM v1.1", "venue": "BINANCE", "verdict": "certified", "passed": 7, "total": 7, "exit_review_id": "SX-11", "promoted_to": { "stage": "CANARY", "deployment_id": "dep_63", "day": 2, "total_days": 14 } }
  ]
}
```

**Source mapping (`DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md`, 88 tables):**

| field | table · column |
|---|---|
| `rows[]` | `strategy_deployments` WHERE `mode='sandbox'` AND stage `SANDBOX_VALIDATION` — the list derives from the registry; a new sandbox deployment must appear with zero code |
| `rows[].alpha`, `alpha_version_id` | `strategies` ⋈ `alpha_ledger(artifact_digest)` |
| `rows[].venue`, `account_id` | `accounts(account_id, mode, venue)` ⋈ `venue_accounts(external_account_ref)` |
| `rows[].portfolio_id`, `target_portfolio_id` | `portfolio_allocations` (current) + Portal approval `AP-352` (proposed target) |
| `rows[].certification.steps[]` | the Portal certification state machine already behind `sandbox-certification.v1` — the overview **re-reads** it, it does not recompute |
| `rows[].runtime_state`, `halt_reason` | `strategy_deployments(runtime_state)` + `operator_operations(operation_type='deployment.halt', reason)`; `FINDING` when a CRITICAL `reconciliation_findings` row is OPEN |
| `rows[].in_stage_days`, `stalled` | now − `strategy_deployments(stage_entered_at)`; threshold is the server's and is published in `meta.stalled_rule` |
| `kpis.test_fund_equity` | Σ `account_equity_snapshots(equity)` for `mode='sandbox'` accounts — the `enters_portfolio_nav:false` flag is mandatory |
| `kpis.broker_sync` | `broker_account_sync_current_state(synced_at, status)` vs `account_policies`/venue policy |
| `order_journal.rows[]` | `orders` WHERE `mode='sandbox'` AND `submitted_at >= now()-7d`, grouped by `strategy_id`; `filled` = `status='FILLED'`; `rejected` = `status IN ('REJECTED','RISK_REJECTED')`; `expired` = `status='EXPIRED'` |
| `order_journal.order_types[]` | `orders(order_type, post_only, reduce_only)` — `POST_ONLY`/`REDUCE_ONLY` are **flags, not `order_type` values**, so the server must publish one normalised "types exercised" list; `required` comes from the alpha's production manifest |
| `order_journal.reject_reasons[]` | `orders(error_code)` + `raw_response` |
| `connectivity.ack_latency_ms` | `domain_events` ACK − SUBMIT per `client_order_id` (gateway timestamps) |
| `connectivity.fill_latency_ms` | first `fills(trade_time)` − `orders(submitted_at)` |
| `connectivity.ws_reconnects`, `rate_limit_hits` | `service_heartbeats` / `venue_rate_limits`, 24h |
| `recently_certified[]` | Portal exit reviews `SX-*` with a CERTIFIED verdict in 90d ⋈ `strategy_deployments` after promotion |

**Server rules (the browser is not allowed to derive any of these):**

1. `certification.passed == count(steps[].state == 'PASS')`, and `current_step` is the first
   non-PASS step. If those two disagree it is a server bug, not something the frontend softens.
2. `runtime_state` is a published value or `null`. An absence is **not** translated into `HALTED`;
   the screen renders `runtime not stated`.
3. `success_pct` is an exact decimal (`filled / orders`), not rounded at the server and rounded again
   at the client.
4. `order_types[].certified` is a server decision (enough samples, no unexplained rejects), never
   `count > 0`.
5. `stalled` must be accompanied by the threshold used, in `meta.stalled_rule`.
6. Empty is not clean: when a source cannot be read, that branch is `panel_state: "unavailable"`
   rather than an empty array.

#### 7.4.3 BR-EX-61 — `sandbox-certification.v1` → v1.1 (additive) + `sandbox.*` commands

Ten additive branches; no existing field is renamed or retyped.

```json
{
  "identity": { "alpha": "Carry v3.2", "venue": "OKX TESTNET", "credential": { "id": "OKX-01", "status": "VALID" }, "external_account_ref": "okx_main_01" },
  "broker_freshness": { "source": "REST", "age_seconds": 40, "policy_seconds": 60, "state": "FRESH", "as_of": "2026-08-28T04:55:02Z" },
  "reconciliation_view": {
    "internal": { "positions": 0, "open_orders": 0, "equity": "10000.00", "reservations": 0, "authority": "EXECUTION" },
    "broker": { "positions": 0, "open_orders": 0, "balance": "10000.84", "source": "REST snapshot", "as_of": "2026-08-28T10:41:20Z", "digest": "8c1a…" },
    "difference": { "positions": "MATCH", "open_orders": "MATCH", "balance": { "state": "DELTA", "value": "0.84", "severity": "INFO", "explanation": "testnet faucet interest" }, "formula": "diff.v1" }
  },
  "findings_rows": [
    { "finding_id": "…", "status": "OPEN", "severity": "INFO", "identity": "balance USDT", "local": "10000.00", "broker": "10000.84", "action": { "kind": "ACCEPT", "label": "accept — testnet faucet interest", "href": null } }
  ],
  "order_type_certification": {
    "venue_scope": "OKX perp",
    "rows": [
      { "type": "MARKET", "state": "CERTIFIED", "evidence": "4/4 smoke fills" },
      { "type": "LIMIT", "state": "CERTIFIED", "evidence": "place/amend/cancel" },
      { "type": "STOP", "state": "PENDING", "evidence": "venue trigger semantics unverified" },
      { "type": "TAKE_PROFIT", "state": "UNTESTED", "evidence": null },
      { "type": "TIF", "state": "CERTIFIED", "evidence": "GTC · IOC" }
    ],
    "blocking": false,
    "blocking_rule": "strategy uses MARKET + LIMIT only — STOP/TP certification not blocking for this deployment"
  },
  "execution_quality": {
    "ack_latency_ms": { "p50": 210, "p95": 480, "samples": 9 },
    "fill_latency_ms": { "p50": 340, "samples": 4 },
    "slippage": { "state": "INSUFFICIENT_DATA", "min_samples": 30, "samples": 4 },
    "reject_rate": { "rejected": 0, "total": 9 },
    "formula": "execution_quality.v1", "source": "command journal decision→ACK→fill"
  },
  "smoke_plan": {
    "plan_id": "sp_07", "bounded": true, "quantity": "0.0010", "instrument": "BTC-USDT-SWAP",
    "capital_cap": { "value": "50.00", "ccy": "USDT" }, "timebox_minutes": 30, "on_expiry": "AUTO_HALT",
    "operator": "Stan", "approved_by": "AP-207", "state": "APPROVED_AWAITING_APPLY"
  },
  "cleanup": {
    "rows": [
      { "key": "no_open_order", "ok": true }, { "key": "no_residual_position", "ok": true },
      { "key": "reservations_released", "ok": true }, { "key": "final_sync_and_clean_recon", "ok": false }
    ],
    "exit_rule": "clean exposure → final sync → clean dry-run → return HALTED"
  },
  "actions": [
    { "key": "sandbox.broker_sync", "label": "Sync broker", "enabled": true, "risk_tier": "T1", "blocker_codes": [] },
    { "key": "sandbox.reconcile_dry_run", "label": "Dry-run reconcile", "enabled": true, "risk_tier": "T1", "blocker_codes": [] },
    { "key": "sandbox.smoke_open", "label": "Open smoke window", "enabled": true, "risk_tier": "T2", "blocker_codes": [] },
    { "key": "sandbox.request_exit_review", "label": "Request Sandbox Exit Review", "enabled": false, "risk_tier": "T2", "blocker_codes": ["CLEANUP_PENDING"] }
  ],
  "peers": [ { "deployment_id": "dep_91", "alpha": "Grid v2.1", "venue": "OKX TESTNET", "passed": 3, "total": 7, "halt_reason": "FINDING" } ]
}
```

**Source mapping:**

| field | table · column |
|---|---|
| `identity.credential` | `venue_credentials(status, rotated_at)` — status only; **no key material in any payload** |
| `broker_freshness` | `broker_account_sync_current_state(synced_at, status, source)` vs venue policy |
| `reconciliation_view.internal` | `positions_v2`, `orders(status IN ACCEPTED/PARTIALLY_FILLED)`, `account_equity_snapshots(equity)`, `order_pending_exposure` |
| `reconciliation_view.broker` | `broker_account_sync_current_state(positions, open_orders, balances, execution_state_digest)` |
| `reconciliation_view.difference` | DERIVED `diff.v1` — the **server** computes it; the browser only colours it |
| `findings_rows[]` | `reconciliation_findings(mode='sandbox', account_id)` ⋈ `details` (local/broker values) |
| `order_type_certification` | `orders(order_type, post_only, reduce_only, status)` for `mode='sandbox'` + the alpha's production manifest |
| `execution_quality` | `domain_events` (decision→ACK), `fills(trade_time)`, `orders(status)` |
| `smoke_plan` | Portal smoke plan `sp_*` + approval scope `AP-207` + `operator_operations(status)` |
| `cleanup.rows[]` | `orders`, `positions_v2`, `order_pending_exposure`, `broker_account_sync_current_state` |
| `actions[].enabled` | Portal command policy — fail-closed by default; `enabled:true` must be a deliberate decision |
| `peers[]` | the same query as BR-EX-60's `rows[]`, limited to deployments in certification |

**Server rules:**

1. **Fail-closed is an invariant, not a style.** `actions[].enabled` for `sandbox.smoke_open` and
   `sandbox.request_exit_review` must be `false` when `broker_freshness.state != FRESH`, **or** a
   CRITICAL finding is OPEN, **or** any `cleanup.rows[].ok` is false. The frontend hides such an
   action rather than disabling it: an absent control is the honest answer to "cannot".
2. `slippage.state = "INSUFFICIENT_DATA"` when `samples < min_samples`, with **no** `value` field.
   Never 0, never a provisional number.
3. `difference` is not three words the client derives. `MATCH` / `DELTA` / `MISMATCH` is an
   authoritative conclusion with a `severity`; an unreadable source makes that branch `unavailable`,
   never `MATCH`.
4. `order_type_certification.blocking: false` must carry `blocking_rule` saying **why** it does not
   block. A flag without a reason is a flag nobody can check.
5. `peers[]` must not carry `runtime_state` unless the server publishes it — the frontend switcher
   already dropped the word HALTED for this reason.
6. v1.1 is additive: every existing field keeps its name and type.

**Command routes (plan → apply → verify, ADMIN step-up, delivered with BR-EX-61):**

```
POST /api/v1/execution/sandbox/{deployment_id}/plan   { action_key }                  -> plan.v1
POST /api/v1/execution/sandbox/{deployment_id}/apply  { plan_id, idempotency_key }    -> operation.v1
GET  /api/v1/execution/operations/{operation_id}                                      -> verify state
```

Typed errors the screens already render:

| Situation | Response | Frontend behaviour |
|---|---|---|
| certification blocked | `409 {"error":{"code":"CERTIFICATION_BLOCKED","blocker_codes":["CRITICAL_FINDING_OPEN"]}}` | the action is **not** a disabled button; it becomes text naming the blocker |
| broker snapshot too old | `409 {"error":{"code":"BROKER_STALE","age_seconds":88,"policy_seconds":60}}` | STALE chip with the real age; smoke/exit blocked, sync and dry-run stay open |
| second smoke window | `409 {"error":{"code":"SMOKE_WINDOW_OPEN","plan_id":"sp_07"}}` | points at the open window instead of opening another |
| step-up missing | `428 {"error":{"code":"STEP_UP_REQUIRED"}}` | step-up drawer; no apply |
| verify returns PARTIAL | `operation.v1 {"status":"PARTIAL"}` | **never rendered green** — PARTIAL is a third state, not "nearly done" |

#### 7.4.4 Definition of Ready (§5.1), pre-filled

| Package | Owner · env | Authority & scope R/W | Schema rev · compat | Scale / freshness / completeness | Auth / RBAC / SoD | Failure / unavailable / rollback | Dependency | Test corpus & exit evidence |
|---|---|---|---|---|---|---|---|---|
| **BR-EX-60** | Codex · Portal `dev` fixture→shadow | READ; PORTAL_PROJECTION over `strategy_deployments(mode='sandbox')` ⋈ accounts ⋈ venue_accounts ⋈ allocations · TRADING_SYSTEM (`orders`/`fills`/`domain_events`) · BROKER (sync) · DERIVED (success_pct, latency) | new `sandbox-overview.v1` | ≤50 deployments in certification; journal 7d exact counts; connectivity 24h; freshness = `as_of` per second | any Execution viewer; no write | unreadable source → `panel_state:"unavailable"` per branch; an empty array is never read as clean; `runtime_state` null stays null | registry screen `SANDBOX_TRADING_SCREEN` is still `data_mode: NONE` → **[codex decides]**; BR-EX-43 alerts summary | fixture `execution-sandbox-overview.valid.json`; tests 7.4.5 (1)(2)(3)(8); frontend `sandbox.test` |
| **BR-EX-61** | Codex · `dev` | READ + four governed mutations; PORTAL_CONTROL (certification machine, smoke plan, command policy) · BROKER · TRADING_SYSTEM · DERIVED (`diff.v1`, `execution_quality.v1`) | `sandbox-certification.v1` → v1.1 additive + four `sandbox.*` routes | 1 deployment/screen; findings ≤200 keyset; peers ≤20 | viewer read; four actions ADMIN step-up, plan → apply → verify, fail-closed by default | missing additive branch → v1 rendering; broker STALE / CRITICAL finding / cleanup pending ⇒ smoke + exit disabled with codes; slippage under the sample floor ⇒ INSUFFICIENT_DATA, never 0 | existing `sandbox-certification.v1`; BR-EX-58 blocker catalog; BR-EX-41 stage telemetry; **[codex decides]** 7.4.6 (2)–(5) | fixtures `execution-sandbox-certification.dep_77.v1_1.valid.json` + `.dep_91.v1_1.valid.json`; tests 7.4.5 (4)–(7); frontend `sandbox.test`, `certification.test` re-run unchanged |

OpenAPI paths (names are codex's to finalise):

```yaml
paths:
  /api/v1/execution/sandbox/overview:              # GET  -> sandbox-overview.v1        (BR-EX-60)
  /api/v1/execution/sandbox/{deployment_id}:       # GET  -> sandbox-certification.v1.1 (BR-EX-61)
  /api/v1/execution/sandbox/{deployment_id}/plan:  # POST {action_key}                  (BR-EX-61)
  /api/v1/execution/sandbox/{deployment_id}/apply: # POST {plan_id, idempotency_key}    (BR-EX-61)
```

#### 7.4.5 Required tests

Fixtures: `execution-sandbox-overview.valid.json`,
`execution-sandbox-certification.dep_77.v1_1.valid.json`,
`execution-sandbox-certification.dep_91.v1_1.valid.json` (the CRITICAL branch).

1. `passed == count(state=='PASS')` and `current_step` is the first non-PASS step, on both fixtures.
2. `test_fund_equity.enters_portfolio_nav == false`, and that value appears in no `portfolio-360` NAV.
3. `success_pct == filled / orders` (exact decimal) for every journal row.
4. dep_91 fixture: a CRITICAL OPEN finding ⇒ `steps.recon_dry_run.state == 'FAIL'`,
   `smoke.state == 'BLOCKED'`, `actions[smoke_open].enabled == false` with non-empty `blocker_codes`.
5. `slippage.state == 'INSUFFICIENT_DATA'` when `samples < min_samples`, and no `value` field beside it.
6. an order type with `required: true` that is not CERTIFIED ⇒ `progress.eligible == false`.
7. v1.1 additive: the whole `sandbox-certification.v1` suite re-runs unmodified.
8. `stalled == true` ⇒ `meta.stalled_rule` is not null.

#### 7.4.6 Decisions codex must confirm (not guess)

1. **Entry-screen route.** The registry has `SANDBOX_TRADING_SCREEN` at `/deployments/sandbox`
   (COMMISSIONED, `data_mode: NONE`) and `EXECUTION_SANDBOX_CERTIFICATION_SCREEN` at
   `/deployments/sandbox/:deploymentId`. The frontend mounts the overview on the feature's canonical
   route. On delivery, codex flips `data_mode` and points that screen at the new contract.
2. **`POST_ONLY` / `REDUCE_ONLY` are flags, not `order_type` values.** The normalised "types
   exercised" list and the source of `required` (alpha manifest or deployment config) need one rule.
3. **The `stalled` threshold.** Proposed: > 14d with no progress; codex confirms and publishes it in
   `meta.stalled_rule`.
4. **Testnet venue naming.** `OKX_TESTNET` versus `OKX` + `testnet: true` — either is fine, but it
   must be one, because Account/Broker 360 and the Blotter read the same field.
5. **Where the smoke plan lives.** Is `sp_*` a new Portal table, or `operator_operations` with
   `operation_type='sandbox.smoke'`? This also decides how the Admin Action Drawer lists it.

#### 7.4.7 Delivery order and what the frontend retires

- **BR-EX-60 lands:** frontend deletes the overview half of `sandbox.smoke.ts`
  (`SANDBOX_SMOKE_DATA`, `useSandboxTick`), codex flips the registry `data_mode`, and the
  `el-v2-08-sandbox-overview` baseline is recorded.
- **BR-EX-61 lands:** frontend deletes the certification half (`CERT_SMOKE_DATA`, `useCertTick`) and
  the module itself, re-records `execution-sandbox-certification-1d-*` and
  `el-v2-06-sandbox-dep-77`, and wires the four `sandbox.*` actions to plan → apply → verify once
  N13 approves activation.

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

All Portal-owned A lanes N13A–N17A are complete:

1. Keep N13B–N17B parked until the single master Trading System owner return is
   accepted for one exact profile.
2. Resume in order from **N13B**, never by jumping directly to a later B phase
   or relabelling source-dark evidence as production acceptance.

The exact A result and matching B next action are recorded in every completed
phase report and the shared `PHASE_TRACKER.md`; completing A never changes a
source/profile/command flag.

---

## 12. Evidence and detailed-reference index

Read these only when entering the mapped phase; this plan is the everyday overview.

| Topic | Detailed authority/evidence |
|---|---|
| Architecture and original phase mapping | `EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md` |
| Backend completed-slice index | `backend/README.md` |
| Claude original request/review | `upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_BACKEND_PLAN_REQUEST.md`, `BACKEND_PLAN_REVIEW.md` |
| Claude scale/current BR requests | `upgrade_frontend_plan_hifi/hifi_execution_loop/EXECUTION_SCALE_AND_REFINE.md` |
| **BR-EX-60/61 — full specification** | **§7.4 of this file** (domain, both response shapes, source mapping to real columns, server rules, command routes and typed errors, DoR, required tests, open decisions, delivery order). The frontend document below carries the same content with screenshots and per-field UI rationale; **§7.4 wins on disagreement.** |
| **Hi-fi V2 requests BR-EX-41…61 — field-level detail** (types/enums/examples, DoR §5.1 pre-filled per package, OpenAPI path stubs, typed error/state examples, delivery order and per-package smoke retirement) | `upgrade_frontend_plan_hifi/hifi_execution_loop/BACKEND_REQUEST_HIFI_V2_2026-08-25.md` (appendices A–O; G/H/I = full JSON examples, derivation rules, errors, live events and required tests for BR-EX-49/50/51; J = source mapping and open decisions; K = BR-EX-52/53/54 bindings/accounts; L = BR-EX-56/57 live overview/full; M = BR-EX-59 canary; N = screen ↔ request coverage matrix and remaining gaps; O = BR-EX-60/61 sandbox overview + certification v1.1, with the seven certification steps mapped to real columns, the fail-closed rules, the four `sandbox.*` command routes and the five decisions codex must confirm); verbatim copy of the §7.2 rows: `…/BACKEND_PLAN_7_2_ROWS_2026-08-25.md` |
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
| 2026-08-25 | Claude: §7.2 BR-EX-41…59 appended (`RECEIVED`) — hi-fi V2 Command Center 5a / Incident 4d / stage workbenches; schema appendix in `hifi_execution_loop/BACKEND_REQUEST_HIFI_V2_2026-08-25.md` | documentation only; no runtime/profile/source/command change; codex triages per §7.1 |
| 2026-08-26 | N09 BR-EX-30/31/32/33/35/36/37/38 closed | Portal contracts/repository/API/codegen complete; registry write policy false; production/source/command inactive |
| 2026-08-26 | N10 BR-EX-34/39/40 closed | Rust pure engines + schema/OpenAPI/generated TS + canonical fixtures complete; routes/source/SSE/registry/commands inactive |
| 2026-08-26 | N11 Portal publication gate + adapters closed | one 24-capability owner request, byte-bound schema/fixture verifier and strict Rust GET adapter complete; owner publication/source/runtime pending |
| 2026-08-26 | N14A Portal release authority closed | six digest-pinned images, CI-bound SBOM/SLSA/Trivy/signature evidence, owner acceptance contract, dev/stable isolation and PostgreSQL restore/forward-fix rehearsal complete; N14B owner binding pending, source/runtime inactive |
| 2026-08-26 | N15A four-interface gateway authority closed | independent Query/Command/Event/Artifact negotiation, split identities, bounded transports, Event continuity, Artifact reference policy and local fault doubles complete; N15B owner publication pending, network/source/runtime inactive |
| 2026-08-27 | N16A same-domain emergency-routing authority closed | same-origin/origin-isolation templates, short session/WebAuthn ceremony, typed health/failure states, immutable audit and local Research/Cloudflare/origin/rollback drills complete; R3 unpublished, R4 forbidden, N16B pending, public route/source/runtime inactive |
| 2026-08-28 | Claude: §7.2 BR-EX-60/61 appended (`RECEIVED`) and specified in full in §7.4 — Sandbox Overview `sandbox-overview.v1` (new) + Sandbox Certification v1.1 (additive) with four `sandbox.*` command routes | documentation only; no runtime/profile/source/command change; five decisions listed in §7.4.6 are codex's to confirm; frontend screens are built and running on smoke until delivery |
