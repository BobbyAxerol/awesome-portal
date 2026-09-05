# Execution Loop Backend Unified Plan and Guide

> **Backend owner:** Codex  
> **Frontend owner:** Claude  
> **Product/release owner:** Bobby  
> **Baseline:** `feat/execution-data-activation` at `6f6503e`, 2026-09-04; the
> accepted E7 return pack is pinned by `maximum-data-return-v1/MANIFEST.sha256`  
> **Document status:** `COORDINATION_AUTHORITY_ACTIVE / EDS_BACKEND_CAMPAIGN_PLANNED /
> EDS_00_AND_EDS_01_COMPLETE`  
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

The N02–N08/N11 rows above preserve the ideal v2/full-capability lane. They are
not global blockers for the N17B exact current Paper adapter accepted on
2026-08-29. The debt and activation boundary for that accepted slice is §3.6.

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
| 18 | Hardening | `PAPER_PRIVATE_QUERY_QUALIFIED / PRODUCTION_INACTIVE / OPERATIONAL_EVIDENCE_PENDING` | signed dev product image, resource-scoped screen activation and post-deploy load/fault/soak/SLO evidence |

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
 +--> N11 external read adapters (published routes or current-source compatibility mappings)
 +--> N12 command relay prep (independent gate; never unlocked by reads)

Portal/source-dark lane (may continue while Trading System works):
N13A -> N14A -> N15A -> N16A -> N17A

Source-as-is B lane (requires the matching A exit gate and authority only for
the real boundary being touched):
N13B -> N14B -> N15B -> N16B -> N17B
```

An `A` lane is Portal-owned, source-dark and safe to implement with contracts,
fixtures, isolated PostgreSQL and offline transport doubles. A `B` lane binds
real current sources or touches a real inter-cell/runtime boundary. Completing
an A lane never implies that its B lane, source, screen or command is active.
The B lane proceeds capability by capability against the best currently
published source; it does not wait for a future ideal Trading System contract
when a bounded, authenticated current source can satisfy the Portal contract.

### 3.2 What may run now without IAM/network/source activation

- N00 document/status reconciliation.
- N01 dormant lifecycle and fail-closed runbook changes.
- Portal-owned N09 contracts/repositories/APIs.
- N10 schemas, pure analytics, fixtures, OpenAPI and source-dark screen APIs.
- Adapter skeletons for an already published contract, without source credentials or calls.
- tests for failure, unavailable, gap, retention, replay, restore and rollback.

### 3.3 What still requires external authority

- runtime credentials, PKI/JWT material and a bounded change window for the
  exact AWS-HK profile being activated;
- every Trading System mutation, broker action or risk-increasing command;
- any source field/capability that genuinely does not exist in the current
  Manager-v2, Gateway, market/data service or Portal-owned control plane;
- stable/production publication and Live risk activation, including the exact
  rollback and final owner decision.

Portal implementation, current-source adapters, read-only Paper/Sandbox/Live
qualification and per-screen shadow wiring do **not** wait for a global Trading
System upgrade. A missing ideal N11/N12 route is not itself a blocker when an
existing bounded source or command primitive has equivalent semantics. The
adapter must record the mapping and must not invent broader semantics.

### 3.4 Single official Trading System owner request and compatibility catalogue

All genuine remaining external dependencies are now consolidated in
[`TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md`](./backend/TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md).
It remains the only document sent to the Trading System owner. Revision v3 is
the N28 source-as-is result: 13 needs are handled by Portal adapters, three are
intentional exclusions, and only MC-01…MC-09 are owner gaps. Older D4,
N02/N03/N11/N12/N15 and Claude request prose is audit-only, not an active ask.

From the 2026-08-29 rebaseline onward, this owner campaign is a capability and
evidence catalogue, not a global prerequisite for Portal delivery. Returned
contracts are preferred when present. Otherwise Portal uses the current
Manager-v2 relations/projections, current Gateway APIs, current market/data
services and Portal-owned derivations behind versioned compatibility adapters.
Future owner publications replace an adapter revision; they do not require a
Portal screen-contract rewrite.

Any genuinely new product capability or incompatible owner contract change
amends this master revision instead of creating a phase-local request file.

**Historical owner campaign checkpoint — 2026-08-27.** Revision v2 was built
by `scripts/build-trading-system-owner-campaign-pack.sh` at that time. Portal commit
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
seven proxy guard locations still return 503. The owner implemented within the
single campaign worktree. No older root-level packet or D4 v1 runtime is an
active instruction/source dependency. Real activation still requires the exact
capability gate below, but an incomplete future-facing owner contract no longer
parks unrelated current capabilities.

**Current owner request — 2026-08-31.** The pack builder now emits revision
`portal.execution.trading-system-owner-request.v3` plus the N28 registry and
return schema only. Publication remains evidence-only and does not activate
Portal.

### 3.5 Source-as-is compatibility decision — 2026-08-29

This decision supersedes the former **global** `MASTER_OWNER_RETURN_PENDING`
interpretation for N13B–N17B. Git history retains the earlier contract-first
baseline; this section and the rebaselined B phases below are the operative
plan.

**Current source classes**

1. `MANAGER_V2`: bounded read-only relations/projections for Paper, Sandbox and
   Live, protected by mTLS and delegated JWT.
2. `GATEWAY_CURRENT`: existing bounded Trading System read and command
   primitives for orders, fills, positions, account/portfolio state,
   reconciliation, halt/resume/reduce/cancel/emergency-close and supported
   rebalance operations.
3. `MARKET_DATA_CURRENT`: current realtime market service plus Historical/QDL
   sources for chart history where their authority is explicit.
4. `PORTAL_CONTROL`: approval, certification, lifecycle, promotion, audit and
   operator workflow owned by TypeScript/PostgreSQL in SGP.
5. `PORTAL_DERIVED`: deterministic server-side analytics computed from one or
   more current sources with `formula_version`, provenance, freshness and
   completeness.

N11 schemas remain stable Portal-facing output contracts; they are not required
to be one-for-one upstream HTTP endpoints. Rust adapters translate current
source revisions into those contracts, and TypeScript exposes narrow
screen-oriented APIs. Canary is a Portal governance stage joined to Live-profile
read facts; Portal must not invent a Trading System `mode=canary`.

Every screen field and action must resolve to exactly one delivery state:

- `CONNECTED` — served directly from a bounded current source;
- `DERIVED_FROM_EXISTING_SOURCE` — computed server-side with declared formula
  and provenance;
- `SUPPORTED_BUT_NOT_ACTIVATED` — source/primitive exists but the exact runtime
  or command gate is still closed;
- `SOURCE_DOES_NOT_CURRENTLY_EXIST` — honestly unavailable, never replaced by a
  fake zero, fixture presented as real, dead button or indefinite `SOON` state.

Read and command identities stay separate. A read-profile success never grants
mutation authority. Unsupported command target scopes are hidden or returned
as typed unavailable; Portal does not broaden the semantics of an existing
primitive.

### 3.6 N13B–N17B debt closeout — 2026-08-30

N17B closes the exact current Paper compatibility/transport set; it does not
claim a product-visible screen, a signed dev deployment, an ACTIVE projection,
authoritative owner events or a Live command. The residual work is classified
in the single canonical register
[`EX_BE_N13_N17_DEBT_CLOSEOUT.md`](./backend/EX_BE_N13_N17_DEBT_CLOSEOUT.md).

There is no open `MERGE_BLOCKER`. Resource/workspace-scoped screen payloads,
multi-replica admission, canonical Rust compatibility ownership, signed dev
publication, projection-backed analytics, profile activation and post-deploy
soak are explicit `ACTIVATION_BLOCKER` items. Missing Event/Artifact, market,
calendar and command capabilities remain typed `FUTURE_CONTRACT` limitations.
BR-EX-41…67 is a delivery backlog for the next backend campaign, not hidden
N17B debt.

N01–N08 and N11/N12 retain their ideal-contract and full-capability value, but
their missing future owner bytes do not reopen or globally block the accepted
N17B Paper current-source set. A later owner revision replaces a versioned
adapter behind stable Portal output contracts.

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
**Status:** `N13A_COMPLETE_SOURCE_DARK / N13B_PORTAL_IMPLEMENTATION_ACCEPTED / CURRENT_SOURCE_SET_PINNED / PROFILE_RUNTIME_DARK`.  
**Priority:** P1 after foundations.

N13 activates only capabilities mapped to current bounded sources. It does not
require another Trading System feature request or a globally complete owner
return. Real credentials, runtime changes and mutations remain independently
gated.

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

#### N13B — Current-source staged activation

**Ready when:** Bobby approves this rebaselined phase; N13A is already complete.
The phase starts read-only and requires only the exact credentials/change window
for the profile being qualified. Commands do not inherit read approval.

**Goal:** serve the maximum honest Portal experience supported by the current
Trading System without waiting for future ideal endpoints, while preserving a
versioned adapter boundary for later upgrades.

- freeze a machine-readable capability-to-source matrix covering every current
  Execution screen field and action;
- pin the exact current Trading System commit/service revision, Manager-v2
  catalogue/profile revision and Portal adapter revision used by each mapping;
- implement versioned Rust adapters for `MANAGER_V2`, `GATEWAY_CURRENT` and
  `MARKET_DATA_CURRENT`; keep upstream shapes outside Portal-facing contracts;
- implement TypeScript narrow screen APIs over the Rust adapters,
  `PORTAL_CONTROL` and `PORTAL_DERIVED` producers;
- qualify Paper, Sandbox and Live read profiles independently; represent Canary
  as Portal promotion/governance joined with Live-profile facts;
- migrate each screen from fixture to shadow/current source independently and
  update its registry `data_mode` only after that screen's gate passes;
- preserve explicit freshness, completeness, provenance and typed
  unavailable/denied/stale/partial states;
- collect per-capability load, fault, auth, audit, restart and rollback
  evidence; roll back only the failed mapping/profile.

**Order**

1. publish the capability-to-source matrix and prove cursor/profile isolation;
2. Paper read: Manager-v2 plus current orders/fills/positions/performance and
   market/history sources;
3. Sandbox read: Manager-v2 plus current reconciliation/account/order facts;
4. Live read: Manager-v2 plus current positions/orders/fills/broker-sync facts;
5. Canary read: Portal governance/promotion state joined to Live read facts;
6. screen-by-screen fixture retirement and honest unavailable cleanup;
7. only then qualify current protective/risk commands as separate capability
   slices under N16B.

Each screen and capability promotes independently. There is no global green switch.

**Exit gate per step**

Source mapping, contract compatibility, auth, profile-bound cursor behavior,
freshness/completeness, load, fault, security, audit, restart/restore, rollback
and UI honest states pass for the exact capability. No screen contains a fake
zero, smoke fixture presented as real, indefinite `SOON` label or enabled dead
action. A failed gate rolls back only the affected profile/capability and
preserves operator visibility.

**Claude parallel lane:** run the seven-state, role, breakpoint, accessibility, interaction and visual
acceptance matrix for the exact promoted screen/profile.

**Completed 2026-08-29:** N13B now pins the current Trading System/Manager
source set in a machine-readable Rust contract (4 profiles, 16 sources, 29
capabilities, 20 screens), exposes exact screen/source/relation reads through
the private Edge, and provides a session-bound TypeScript BFF with independent
Paper/Sandbox/Live flags. Canary is a bounded Live-profile join, not a source
mode. Owner publication and real Paper runtime qualification manifests are
digest-bound; Sandbox source rows and an honestly empty Live source were
already proven by the imported Manager-v2 evidence. No runtime flag or registry
`data_mode` changed. Detail:
[`EX_BE_08_N13B_CURRENT_SOURCE_STAGED_ACTIVATION.md`](./backend/EX_BE_08_N13B_CURRENT_SOURCE_STAGED_ACTIVATION.md).

### N14 — Deployment and release authority

**Mapping:** BAR-17.  
**Status:** `N14A_COMPLETE_SOURCE_DARK / N14B_PORTAL_COMPATIBILITY_ACCEPTED / PROFILE_RUNTIME_NOT_ACTIVATED`.  
**Priority:** P2 before formal release.

N14 releases the exact current capability set accepted by N13B. An existing
Trading System service/image may be pinned as-is; N14 does not require a new
owner image or endpoint merely to satisfy an idealized release shape.

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

#### N14B — Immutable current-source release compatibility

**Ready after:** N13B accepts at least one exact read capability/profile set.

- bind the exact current Trading System commit/service revision, deployed image
  where available, Manager/Gateway/market contract revision, Portal adapter
  revision and profile config into the release compatibility matrix;
- package one digest-pinned Portal Edge image with independent Paper, Sandbox
  and Live profile configuration; do not fork business code per environment;
- prove SGP dev/stable database, image, route and secret isolation;
- execute profile-scoped preflight, deploy, rollback and forward-fix rehearsal;
- record Portal owner approval for the exact environment/capability set and
  Trading System owner approval only where its runtime/config is changed.

**Combined N14 exit gate:** compatibility manifest, signature/SBOM evidence,
isolated-state deploy/rollback/forward-fix rehearsal and exact required owner
decision pass. No unavailable future upstream feature is added to the release
set.

**Completed 2026-08-29:** N14B consumes and re-verifies the exact signed N14A
candidate, then emits a separate immutable compatibility adjunct for the first
bounded Paper target (`PAPER_BINANCE_USDM` / `PAPER_TRADING_SCREEN`). The
adjunct binds the N13B map, qualification pins, profile configuration, thirteen
adapter/config files, exact Control API/Edge/Source Proxy image digests,
rollback runbook and previous-adjunct chain. Eleven unit/negative tests, real
Docker Compose candidate/rollback renders, publication tests, actionlint and
the full Portal gate pass. This is compatibility/release evidence only:
deployment, registry promotion, source/Query/SSE/command activation, Trading
System release and database copy all remain false. Detail:
[`EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md`](./backend/EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md).

### N15 — Formal inter-cell gateway authority

**Mapping:** BAR-18.  
**Status:** `N15A_COMPLETE_SOURCE_DARK / N15B_CURRENT_QUERY_ACCEPTED / PRODUCT_RUNTIME_DARK`.  
**Priority:** P2.

**Goal**

Formalize four independent interfaces: Query, Command, Event and Artifact.
D1–D4 and Manager-v2 provide the read foundation. Each interface is accepted
independently against current capability; absence of Event or Artifact
publication does not block an unrelated Query screen. Commands remain on their
own identity and gate.

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

#### N15B — Current-capability inter-cell gateway acceptance

**Ready after:** N13B publishes the exact source map and N14B pins the candidate
release. No global four-interface owner publication is required.

- `Query`: bind Manager-v2 relations/projections and existing Gateway/market
  reads through bounded Rust adapters into N11 Portal output contracts;
- `Command`: expose only current primitives with equivalent semantics and exact
  supported target scope; keep a separate command identity and N16B gate;
- `Event`: use a published incremental stream when available; otherwise a
  bounded snapshot-diff feed may be exposed only as
  `PORTAL_PROJECTION_DELTA`, never mislabeled as an authoritative Trading
  System event;
- `Artifact`: accept digest/schema/size-bound references only where a current
  owner source exists; otherwise return typed unavailable without blocking
  Query/Command/Event;
- negotiate and record compatibility per capability/source revision;
- run WAN partition, retry/no-retry, cursor-profile crossing, replay,
  duplicate, out-of-order, expiry, schema-drift, source-loss and rollback tests
  applicable to each accepted interface;
- publish end-to-end trace/correlation and measured SLO evidence without
  exposing generic host, PostgreSQL, Redis, CLI or broker authority.

**Exit gate per interface/capability:** version negotiation, identity,
bounds, SLO, observability, failure semantics and rollback pass for that exact
mapping. The overall phase closes when every Portal-required capability is
classified in one of the four delivery states from §3.5; it does not pretend
all four upstream interfaces exist.

**Completed 2026-08-29:** N15B independently classifies all four interfaces
against the current source. Query is accepted only for the immutable
`paper / PAPER_BINANCE_USDM / PAPER_TRADING_SCREEN` target and its three read
capabilities; Rust Edge and the TypeScript BFF both reject every other mapped
screen/profile before transport. Command is deferred to N16B under a separate
identity. Event and Artifact are honestly `SOURCE_DOES_NOT_CURRENTLY_EXIST`;
Portal snapshot deltas may never be relabelled as owner events. The contract
binds unchanged N13B/N14B, Manager qualification and D3 transport evidence;
focused Rust, TypeScript, schema, auth/scope/drift/rollback and full workspace
gates pass. Candidate deployment, product flag, registry promotion, SSE,
Command and Trading System change remain false. Detail:
[`EX_BE_18_N15B_CURRENT_CAPABILITY_INTERCELL_GATEWAY_ACCEPTANCE.md`](./backend/EX_BE_18_N15B_CURRENT_CAPABILITY_INTERCELL_GATEWAY_ACCEPTANCE.md).

### N16 — Same-domain routing and emergency operations

**Mapping:** BAR-19.  
**Status:** `N16A_COMPLETE_SOURCE_DARK / N16B_CURRENT_PRIMITIVE_COMPATIBILITY_ACCEPTED / PRODUCT_RUNTIME_DARK`.  
**Priority:** P2.

The Trading System dependency is the current supported command primitive set
plus current operational facts. N12 remains the Portal command/output
contract; a one-for-one N12 upstream route is preferred but not mandatory when
an existing primitive has equivalent, narrower semantics. Same-domain routing
and break-glass ceremony remain Portal/Cloudflare work.

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

#### N16B — Current-primitive protective-path acceptance

**Ready after:** N15B has classified Command separately and the current primitive
inventory is evidence-bound. A dedicated command identity is mandatory; read
identities are forbidden. Compatibility acceptance may remain source-dark, while
an owner change window is mandatory before any real mutation in N17B.

- map `halt`, `resume`, `reduce`, bounded cancel-open-orders,
  emergency-close and supported portfolio rebalance/scale operations to current
  Trading System primitives;
- constrain every N12 target type to semantics actually supported by the
  primitive; hide or return typed unavailable for unsupported target scopes;
- implement plan → apply → verify, idempotency, terminal reconciliation and
  partial-failure reporting around multi-step current primitives;
- exercise same-domain emergency read/protective flow while Research is
  degraded or unavailable;
- prove observed Trading System acknowledgement and terminal reconciliation;
- verify stronger access policy, no browser-visible internal hostname/token,
  immutable audit and capability-scoped rollback;
- confirm resume/scale/risk-increasing operations cannot inherit the
  protective break-glass path or approval.

**Combined N16 exit gate:** every enabled command has exact source primitive,
target scope, authorization, idempotency and reconciliation evidence; no
emergency path bypasses Trading System authority or audit; public/auth/source
loss is visibly degraded and recoverable. Unsupported commands remain absent
or explicitly unavailable, never enabled dead buttons.

**Completed 2026-08-29:** the current source has one complete protective
lifecycle: `live.emergency-close` through plan, apply, operation status and
verify. N16B accepts only `LIVE_FULL / ACCOUNT / BINANCE / USD_M` behind the
dedicated `portal-execution-command` identity, WebAuthn, two distinct approvals,
a 60-second one-operation assertion and a no-retry-after-dispatch journal. The
other eight N12 commands are classified honestly as supported-but-inactive or
source-absent; `resume` and `scale` cannot inherit R3. Rust is the transport
authority and TypeScript exposes only a sanitized, blocked BFF plan. Every
runtime/source/public-route/Live-mutation flag remains false, so observed source
acknowledgement and terminal verification are N17B activation evidence rather
than fabricated N16B evidence. Detail:
[`EX_BE_19_N16B_CURRENT_PRIMITIVE_PROTECTIVE_PATH_ACCEPTANCE.md`](./backend/EX_BE_19_N16B_CURRENT_PRIMITIVE_PROTECTIVE_PATH_ACCEPTANCE.md).

### N17 — Production activation, SLO, DR and owner operations

**Mapping:** BAR-20 + product phase 18.  
**Status:** `N17A_COMPLETE_SOURCE_DARK / N17B_EXACT_CURRENT_SET_ACCEPTED / PAPER_PRIVATE_QUERY_QUALIFIED / LIVE_MUTATION_INACTIVE`.  
**Priority:** final.

N17 accepts the exact capability set delivered by N13B–N16B, including honest
unavailable classifications. It does not wait for absent future features, but
it never promotes an unqualified read or command.

#### N17A — Source-dark production/DR preparation

- SLO/error-budget schema, dashboards, alert rules and evidence collectors;
- encrypted backup/PITR/rebuild/restore automation for Portal-owned state;
- key/certificate/credential rotation and compromise runbooks;
- capacity/retention/cost budgets and quarterly game-day plan;
- owner matrix, incident/rollback responsibilities and release checklist;
- simulated partition, auth-loss, source-loss and command-containment corpus.

**N17A exit gate:** offline/isolated restore, rollback, rotation dry-run and
evidence validation pass without production activation.

#### N17B — Exact-set production acceptance

**Ready after:** N13B–N16B produce the exact read/command/interface capability
set and immutable release manifest. Read profiles may qualify independently;
the accepted Live emergency primitive additionally requires an exact Account,
bounded owner window, abort/rollback owner and Bobby's final mutation sign-off.

- activate only the approved `CONNECTED`, `DERIVED_FROM_EXISTING_SOURCE` and
  explicitly approved `SUPPORTED_BUT_NOT_ACTIVATED -> CONNECTED` transitions;
- keep `SOURCE_DOES_NOT_CURRENTLY_EXIST` honest and non-actionable without
  failing unrelated product acceptance;
- measure SLO/error budgets, resource capacity, retention and cost under real
  bounded traffic for Paper, Sandbox and Live read profiles independently;
- run backup/restore, WAN partition, auth/source loss, cursor/epoch recovery,
  command containment and capability-scoped rollback game day;
- prove a future Trading System contract revision can switch adapters behind
  unchanged Portal contracts and roll back to the pinned current adapter;
- record RPO/RTO, rotation, compatibility and owner/SRE evidence;
- require Bobby's final sign-off for the exact production capability set,
  especially every Live mutation.

**Combined N17 exit gate:** all current Trading System capabilities required by
the accepted Portal release are served or honestly classified; there are no
fake-real fixtures, dead actions or unbounded source paths. Bobby signs the
exact production acceptance record after successful restore, rollback,
source-loss, auth-loss and command-containment rehearsals.

**Closeout 2026-08-29:** N17B accepts the exact current Paper Query set through
a Portal-owned adapter to the already-published Manager-v2 routes. A burst-free
Portal pacer caps admission at 15 r/s below the source's observed 20 r/s
boundary. The real private route passed 25/25 paced reads plus 401/403/405
negative authentication/method checks. N17A recovery evidence is retained;
the adapter is stateless, creates no projection data and rolls back by the
Paper feature flag/session close. The signed product image is not yet
published, stable is unchanged, and every Sandbox/Live/Command mutation flag
remains false. Detail:
[`EX_BE_20_N17B_EXACT_SET_PRODUCTION_ACCEPTANCE.md`](./backend/EX_BE_20_N17B_EXACT_SET_PRODUCTION_ACCEPTANCE.md).
The merge/activation/future-contract boundary is closed in
[`EX_BE_N13_N17_DEBT_CLOSEOUT.md`](./backend/EX_BE_N13_N17_DEBT_CLOSEOUT.md);
no open item in that register silently reopens N17B.

### N18–N29 — Manager Surface Expansion campaign

**Status:** `N18_N29_BACKEND_COMPLETE / FRONTEND_CONSUMER_ACCEPTED / BR_EX_72_COMPLETE / RELEASE_CANDIDATE_READY / PROTECTED_SIGNED_RELEASE_PENDING / NO_RUNTIME_EFFECT`.  
**Scope:** all current Manager-v2 relations, current external read and command
catalogues, BR-EX-41 onward, and the Paper/Sandbox/Live internal Portal.  
**Non-goal:** changing Trading System execution authority, bypassing its
published semantics or exposing arbitrary database/Redis/shell access.

The campaign is finite. N18 records the complete known surface; N19–N27
deliver it; N28 contains only capabilities proved absent from current sources;
N29 closes product and release evidence. A known exit gate may not be deferred
into an unnamed follow-up phase.

#### N18 — Capability and data coverage census

**Goal:** create the one authoritative relation → source capability → Portal
capability → screen/BR-EX coverage matrix.

**Deliverables**

- inventory all 96 Manager relations and every published read/command
  capability without copying or retaining business rows;
- record Paper/Sandbox/Live availability as `NONEMPTY`, `EMPTY`, `UNAVAILABLE`
  or `NOT_APPLICABLE`, with evidence time, authority and freshness;
- classify each relation as `SCREEN_BOUND`, `PROJECTION_INPUT`, `AUDIT_ONLY`
  or `INTERNAL_ONLY`; never create 96 raw table pages;
- deduplicate every current Claude request, including BR-EX-68 Admin Action
  Drawer and BR-EX-69–71 governance additions, against existing backend
  contracts and assign exactly one delivery phase;
- freeze source, catalogue, relation, capability and command digests plus the
  corrected current N17B six-relation baseline.

**Non-goals:** no source activation, schema migration, product endpoint or
screen implementation.

**Tests/evidence:** sanitized census fixture, completeness verifier, duplicate
request detector, digest drift test and no-business-row scan.

**N18 exit gate:** 100% of relations, capabilities, commands and commissioned
requests have one source, profile state, owner, consumer and delivery phase;
there is no ambiguous, duplicated or unclassified known work.

**Closeout 2026-08-30:** N18 is
`N18_CAPABILITY_DATA_COVERAGE_CENSUS_COMPLETE / SOURCE_DARK / N19_READY`.
The digest-bound census freezes 96 relations, five Manager primitives, 104
Gateway operations, 64 CLI actions, 27 Portal reads, nine requested commands
and BR-EX-41–71. All relations are classified; Paper/Sandbox/Live states are
explicit; the corrected N17B baseline contains exactly six relations. The
canonical request ledger now includes BR-EX-68–71 and has one 17-column row
and one N19–N29 delivery phase per request. The verifier retains no business
rows and rejects duplicates, missing profiles, authority widening, secrets
and source digest drift. No source, endpoint, migration, credential, runtime
or stable deployment changed. Detail:
[`EX_BE_21_N18_MANAGER_RELATION_CAPABILITY_CENSUS.md`](./backend/EX_BE_21_N18_MANAGER_RELATION_CAPABILITY_CENSUS.md).

#### N19 — Rust Manager-v2 compatibility authority

**Goal:** make Rust Edge the canonical versioned compatibility boundary for
the complete current Manager read surface.

**Deliverables**

- consume all five published Manager GET primitives and all N18-approved
  relation/key/cursor selections as safe server-side source primitives;
- bind environment/profile/resource before transport and keep relation
  selection out of browser and TypeScript policy code;
- version adapters by owner contract revision and publish coexistence,
  forward-compatibility and rollback mappings;
- enforce TLS 1.3 mTLS, delegated JWT, exact origin/method, row/body/cursor
  bounds, exact decimals, typed source errors and redirect-free transport;
- forbid arbitrary URL, header, relation, field or method passthrough.

**Non-goals:** no browser-facing raw Manager endpoint and no Trading System
database/Redis access.

**Tests/evidence:** full catalogue contract and negative matrix; wrong
profile/resource/revision/cursor tests; current plus simulated-future adapter
switch/rollback; bounded transport/load test.

**N19 exit gate:** the complete current catalogue passes compatibility and
negative tests behind unchanged Portal-facing primitives; adapter upgrade and
rollback work without screen-contract changes. `TD-EX-03` is closed.

**Closeout 2026-08-30:** N19 is
`N19_RUST_MANAGER_COMPATIBILITY_AUTHORITY_COMPLETE / SOURCE_DARK / N20_READY`.
The digest-bound Rust authority accepts exactly the N18 96-relation set, five
Manager GET primitives, seven projections and the three deployment/profile
bindings. Only Paper is currently transport-qualified; the exact Sandbox and
Live bindings remain dormant and fail closed until their named qualification
phases. It constructs relation, opaque key/cursor and projection requests
only from the authenticated catalogue; Edge catalogue/capability/relation/
projection and current-source paths now pass through that authority. The
current deployable adapter and non-deployable future simulation have an
explicit rollback mapping. TLS 1.3 mTLS, delegated JWT, GET/origin/header,
200-row/1-MiB/4-KiB/two-concurrency bounds, exact decimals and redirect-free
transport remain enforced by the sealed Manager client. The static gate,
8 Rust authority tests, 25 Edge tests and zero-warning Clippy pass. No source,
product route, profile, database, credential, image or runtime changed.
`TD-EX-03` is closed; N20 is ready but has not started. Detail:
[`EX_BE_22_N19_RUST_MANAGER_V2_COMPATIBILITY_AUTHORITY.md`](./backend/EX_BE_22_N19_RUST_MANAGER_V2_COMPATIBILITY_AUTHORITY.md).

#### N20 — Canonical screen BFF contracts

**Goal:** expose workspace/resource-scoped TypeScript APIs for all commissioned
Execution screens without relaying raw Manager envelopes to the browser.

**Deliverables**

- deliver deduplicated BR-EX screen slices, including BR-EX-68–71, with
  schema/OpenAPI/generated types, fixtures, source authority, freshness,
  completeness and typed seven-state UI behavior;
- join Trading System facts with Portal governance/control state only through
  a declared server-side contract;
- keep verdicts, counts, filtering, sorting, SLA, policy and permission
  decisions server-owned;
- provide Claude one fixture/error/state/enable-point handoff per closed
  screen slice and remove matching smoke data only when real parity passes.

**Non-goals:** no broad generic query endpoint and no browser-side source joins
or policy inference.

**Tests/evidence:** schema and generated-type parity; fresh PostgreSQL;
auth/RBAC/workspace isolation; canonical success/empty/stale/partial/
unavailable/error fixtures; frontend consumer tests.

**N20 exit gate:** every commissioned Execution screen has a stable versioned
API or one explicit typed unavailable branch, and no screen depends on raw
source envelopes or an undocumented fixture. `TD-EX-01` is closed.

**Closeout 2026-08-30:** N20 is
`N20_CANONICAL_SCREEN_BFF_CONTRACTS_COMPLETE / SOURCE_DARK /
TD-EX-01_CLOSED / N21_READY_NOT_STARTED`. The session-guarded TypeScript BFF
publishes exactly 23 workspace/resource-scoped screen contracts covering all
31 requests BR-EX-41…71: 10 existing narrow APIs and 13 honest
`TYPED_UNAVAILABLE` branches. BR-EX-55, BR-EX-58 and BR-EX-61 are explicitly
mapped as cross-screen/stage/Sandbox dependencies. JSON Schema, OpenAPI,
generated types, fixtures, a strict frontend consumer and seven canonical UI
states are versioned together. The former browser current-source routes return
typed HTTP 410; Manager selection remains internal to the Rust authority.
Auth, RBAC, workspace/resource isolation, fresh PostgreSQL, frontend build and
consumer tests pass. No source/runtime/stable deployment changed. Detail:
[`EX_BE_23_N20_CANONICAL_SCREEN_BFF_CONTRACTS.md`](./backend/EX_BE_23_N20_CANONICAL_SCREEN_BFF_CONTRACTS.md).

#### N21 — Shared admission, cache and freshness

**Status (2026-08-30):** `COMPLETE / DUAL_CELL_SHARED_AUTHORITY /
TD-EX-02_CLOSED / N22_READY`.

**Goal:** make N19/N20 horizontally scalable without exceeding Trading System
or Source Proxy budgets.

**Deliverables**

- shared per-source and per-profile quota/admission across multiple Edge/BFF
  replicas;
- bounded request coalescing, short source-aware cache/ETag, concurrency
  bulkhead, timeout budget and no automatic retry after ambiguous dispatch;
- preserved `as_of`, authority, freshness, completeness, profile/workspace and
  adapter revision through cache and composition;
- bounded pagination/body/series sizes and verified no-N+1 composition.

**Non-goals:** no long-lived source-of-truth cache and no cross-profile cache
sharing.

**Tests/evidence:** multi-replica load/fairness, source-rate cap, cache
isolation, stampede, timeout, loss/recovery and rollback tests.

**N21 exit gate:** all replicas stay within declared source budgets, cache and
coalescing never cross security boundaries, and loss/recovery/rollback are
bounded. `TD-EX-02` is closed.

**Closeout:** SGP BFF replicas coordinate source/profile admission,
request-flight coalescing and short cache through Control PostgreSQL; AWS-HK
Rust Edge replicas coordinate source/profile permits and catalogue cache
through projection PostgreSQL. Both use DB time, expiring leases, exact
profile/revision scope and no retry after ambiguous dispatch. Report:
[`EX_BE_24_N21_SHARED_ADMISSION_CACHE_FRESHNESS.md`](./backend/EX_BE_24_N21_SHARED_ADMISSION_CACHE_FRESHNESS.md).

#### N22 — Full Paper read activation

**Status (2026-08-30):** `COMPLETE / PAPER_PRODUCT_READ_RELEASE_QUALIFIED /
SIGNED_DEV_DEPLOYMENT_PENDING / N23_READY`.

**Goal:** activate every N18-classified current read capability valid for
Paper, not only the first bounded N17B slice.

**Deliverables**

- immutable digest-pinned dev images and exact Paper read profile bindings;
- source-backed screen/API activation capability by capability;
- matching fixture/smoke retirement only after real canonical parity;
- per-route auth, freshness, empty/stale/partial/source-loss and rollback
  behavior.

**Non-goals:** no Sandbox/Live activation and no command mutation.

**Tests/evidence:** positive and negative auth, current-source parity, bounded
load, stale/empty/source-loss, restart, rollback and Paper-fast soak.

**N22 exit gate:** every Paper screen branch is real or honestly typed
unavailable; no fake-real fixture or dead read action remains; product-path SLO
and rollback pass without source mutation.

**Closeout:** four session/workspace-scoped product BFFs now compose the entire
currently supported Paper read set through the N21 shared path and Rust
Manager-v2 authority. The server owns exact screen-to-relation bindings,
runtime-verified source field allowlists, deployment scoping and signed cursor
wrapping. Current facts expose honest ready/empty/stale/partial/unavailable
states; N25 analytics/exact query and N28 candles/calendar remain typed future
branches. Contract schema, OpenAPI, generated types, eight fixtures,
source-loss/profile/auth/load tests, immutable image lineage, Paper-only
Compose render and one-flag rollback pass. No source, Sandbox, Live, command or
stable runtime changed. Signed dev images are published only by the normal
post-merge workflow. Detail:
[`EX_BE_25_N22_FULL_PAPER_READ_ACTIVATION.md`](./backend/EX_BE_25_N22_FULL_PAPER_READ_ACTIVATION.md).

#### N23 — Sandbox and Live read profiles

**Status (2026-08-30):** `COMPLETE / SANDBOX_LIVE_READ_RELEASE_QUALIFIED /
SIGNED_DEV_DEPLOYMENT_PENDING / N24_READY`.

**Goal:** reuse stable Portal contracts for Sandbox and Live and represent
valid empty data truthfully, without inventing a Trading System Canary mode.

**Deliverables**

- isolated Sandbox and Live Manager/Proxy/Edge profile bindings;
- real current Sandbox reads and honest `EMPTY` Live responses where the
  profile has no rows;
- Canary as Portal governance/promotion state joined to Live-profile facts;
- independent profile JWT, cursor, cache, quota, projection and rollback
  boundaries.

**Non-goals:** no Live mutation; no fake rows to make a screen appear active.

**Tests/evidence:** cross-profile negative matrix, empty/live truth fixtures,
load, source loss/recovery, cache/cursor isolation and independent rollback.

**N23 exit gate:** Sandbox and Live reads pass positive/negative matrices and
independent rollback; empty Live state is visible and truthful; no profile
leakage exists.

**Closeout:** two isolated Manager-v2 profile bindings now serve Sandbox and
Live current facts through six session/workspace-scoped product compositions.
Canary remains Portal governance over `LIVE_BINANCE_USDM`, never a fabricated
Trading System mode. Exact scalar allowlists, cross-profile row rejection,
per-profile admission/cache identity, fixed fan-out, valid-empty Live truth,
source loss/recovery and independent rollback pass. Existing details retain
`fixture/UNAVAILABLE` while a profile is dark; projection, SSE, analytics,
commands and Trading System remain unchanged. Contract, release and evidence:
contracts 102/102, focused profile reads 29/29, immutable release 4/4,
fresh-PostgreSQL Control API 236/236 plus dump/restore and Compose rollback.
[`EX_BE_26_N23_SANDBOX_LIVE_READ_PROFILES.md`](./backend/EX_BE_26_N23_SANDBOX_LIVE_READ_PROFILES.md).

#### N24 — Durable Portal projection

**Goal:** build Portal-owned durable read models from current orders, fills,
sessions, snapshots and catalogue-accessible event facts.

**Deliverables**

- ingestion only through N19, never direct Trading System DB/Redis access;
- checkpoint/lease, idempotent reducer, dedupe, tombstone, out-of-order/gap,
  epoch, snapshot, rebuild and active-epoch cutover;
- `PORTAL_PROJECTION_DELTA` labeling for polled/snapshot-derived changes unless
  an authoritative owner event contract exists;
- retention/cleanup, encrypted backup/PITR, projection restore and rollback.

**Non-goals:** no Trading System event authority invented from polling and no
unbounded raw event archive.

**Tests/evidence:** parity, duplicate/gap/reorder, lease failover, restart,
rebuild, retention, restore, RPO/RTO and rollback across active profiles.

**N24 exit gate:** projection parity and recovery tests pass for all active
profiles with declared RPO/RTO and bounded storage. `TD-EX-05` is closed.

**Runtime amendment (2026-09-01):** `COMPLETE /
CURRENT_SOURCE_RUNTIME_V5_QUALIFIED / CONTENT_ADDRESSED_DEV_AUTHORIZED /
N25_READY`. Rust collects exactly 13 bounded current-state Manager-v2 feeds
into eight complete Portal-owned snapshots for each Paper/Sandbox/Live profile, including
truthful empty Live. Database-time leases and fencing, idempotent immutable
cycle evidence, explicit tombstones, parity-gated atomic epoch cutover,
explicit operator-gated same-identity rebuild, DB-clock 15-minute
previous-epoch rollback, retained cleanup gates and PostgreSQL dump/restore
all pass. Page collection enforces the 20,000/feed and 80,000/cycle memory
bounds before allocation growth. Poll-derived facts are labelled
`PORTAL_PROJECTION_DELTA`; no Trading System event sequence was invented.
Adapter v5 follows the owner pagination contract (`PARTIAL* -> COMPLETE`,
monotonic per-page `as_of`) and deliberately excludes oldest-first historical
tables that lack a snapshot token/latest-window/incremental watermark.
The 2026-09-01 runtime hardening separates semantic source identity from both
transport receipt timestamps and the owner's randomized five-minute retrieval
cursor. Entity IDs use the exact validated catalogue key columns plus relation
ID. Per-fact idempotency uses the same semantic value as snapshot identity,
excluding receipt timestamps and retrieval cursors; a mixed snapshot appends
only facts whose business state changed. Per-cycle membership references
unchanged semantic snapshots while retaining an exact eight-kind seal. Repeat unchanged polls update one
bounded per-epoch heartbeat and do not amplify immutable cycles/journal rows.
Lease TTL scales from 60 to 900 seconds by the already bounded record count,
and the large Paper dev profile polls every 60 seconds. Existing immutable
history is preserved for audited retention rather than manually deleted.
Declared healthy-source objectives are RPO 10s, worker restart RTO 120s,
local rebuild RTO 15m and encrypted backup/PITR restore RTO 60m. Query,
analytics, SSE, commands, Trading System and stable runtime remain unchanged.
`TD-EX-05` is closed. Evidence and operations:
[`EX_BE_27_N24_DURABLE_PORTAL_PROJECTION.md`](./backend/EX_BE_27_N24_DURABLE_PORTAL_PROJECTION.md).

#### N25 — Query and analytics plane

**Goal:** serve every currently derivable BR-EX query, series and insight from
N24 projections and bounded current sources.

**Deliverables**

- exact counts/aggregates and bidirectional keyset queries;
- exposure, execution quality, contribution, order funnel, equity/drawdown,
  correlation, replay and BR-EX-70 canary-drift series;
- exact decimal and currency partitions, formula version/provenance,
  completeness, adaptive server downsampling and `chart-series.rules.v1`;
- Rust heavy query/series computation with TypeScript product/control
  composition.

**Non-goals:** no browser-recomputed financial truth and no N+1 source query
per chart or row.

**Tests/evidence:** golden correctness, 182k-row keyset, declared large-series
and correlation load, no-N+1, retention error and deterministic rebuild tests.

**N25 exit gate:** all derivable commissioned analytics have bounded,
reproducible, source-attributed output and pass correctness/load/rebuild gates.

**Runtime amendment (2026-09-01):** `COMPLETE /
CURRENT_SOURCE_QUERY_ANALYTICS_QUALIFIED / CONTENT_ADDRESSED_DEV_AUTHORIZED /
N26_READY`. The Rust plane now loads one ACTIVE subject snapshot with one
PostgreSQL statement, enforces exact relation/currency partitions and bounded
series/correlation/replay outputs, and exposes four strict session-guarded BFF
routes. Projection adapter v5 requires the exact 13 current-state feeds;
historical v1/v2 receipts remain immutable evidence. Historical series and
execution-session quality are typed unavailable under stable N25 source-gap
codes rather than produced by an unbounded scan. Market candles, benchmark
rho, cross-profile canary drift and broker ACK latency remain typed unavailable
under stable N28 source-gap codes. No internal N25 implementation debt remains.
Evidence and operations:
[`EX_BE_28_N25_QUERY_AND_ANALYTICS_PLANE.md`](./backend/EX_BE_28_N25_QUERY_AND_ANALYTICS_PLANE.md).

#### N26 — Realtime SSE activation

**Goal:** provide authenticated snapshot → cursor/epoch → delta delivery from
the N24/N25 Portal projection for all active profiles.

**Deliverables**

- cursor resume, retention/gap/cursor-ahead/epoch-change resnapshot;
- bounded fan-out, shared journal polling, backpressure and slow-consumer
  termination;
- terminal/auth error events that close the client stream and prevent infinite
  reconnect loops;
- independent realtime flags and rollback from snapshot Query.

**Non-goals:** no invented Live deltas and no SSE transport for command
success semantics.

**Tests/evidence:** multi-client/multi-replica HTTP/2 SSE, auth expiry,
disconnect/reconnect, gap/restart/backpressure/source-loss/load and rollback
for Paper, Sandbox and Live.

**N26 exit gate:** active profiles pass resume/recovery/load gates; a valid
empty Live profile emits authenticated snapshot/heartbeat truth only; terminal
errors cannot retry forever.

**Closeout amended (2026-09-01):** `COMPLETE /
MANAGER_REPLAY_FIXED / THREE_PROFILE_DEV_SSE_ACCEPTED`.
Migration `0014` assigns one contiguous cursor only when a complete
Manager cycle seals, so partial per-feed writes never leak as realtime deltas.
Rust Edge serves exact Paper/Sandbox/Live profile snapshots and resumes from a
shared PostgreSQL complete-cycle journal with bounded local fan-out. Empty
Live emits `EMPTY_VALID` plus heartbeats. Session expiry and projection gaps
are terminal and require browser `EventSource.close()`; slow consumers cannot
grow memory without bound. Realtime rollback is independent from projection
and Query. The first bounded Paper probe found and safely rolled back a legacy
journal selection in the Manager resume path before the BFF flag was enabled.
The authority-aware fix passes focused/static tests and the complete
Rust/Clippy/fresh-PostgreSQL/restore suite. Fixed commit `771715b` then passed
exact Paper/Sandbox/Live mTLS/JWT snapshot→resume plus negative-auth probes on
the real dual-cell path; Paper same-origin BFF snapshot/stream also pass.
`current-source-realtime-up/config` reproduces the exact Paper BFF composition
and `current-source-up` remains the explicit SSE rollback. Command and Live
mutation remain false.
Evidence and operations:
[`EX_BE_29_N26_REALTIME_SSE_ACTIVATION.md`](./backend/EX_BE_29_N26_REALTIME_SSE_ACTIVATION.md).

#### N27 — Admin Action Drawer command plane

**Goal:** make every semantically compatible published Trading System Admin
API/CLI operation available as a typed Portal operator command.

**Deliverables**

- map the owner-published command catalogue source-as-is to BR-EX-68 task
  groups, forms and enable points;
- use plan/apply/verify where available and a controlled direct-apply wrapper
  where that is the real owner semantic;
- command-specific RBAC, step-up, approval/SoD where declared, idempotency,
  optimistic conflict, actor/reason, immutable audit and operation journal;
- bounded transcript/status reads, then Paper/Sandbox commands and Live
  protective commands under exact policy and rollback windows;
- classify every catalogue entry as `CONNECTED`,
  `SUPPORTED_BUT_INACTIVE` or `SEMANTICALLY_INCOMPATIBLE` with a factual
  reason.

**Non-goals:** no raw shell/SQL, generic URL, arbitrary payload, hidden retry
or HTTP 202 treated as command success.

**Tests/evidence:** catalogue/schema fixtures; plan/apply/verify and
direct-apply state machines; TTL, step-up, typed confirm, two-man key,
uncertain/restart/idempotency/negative auth, audit and containment tests.

**N27 exit gate:** every published operation is classified and every enabled
control has authoritative terminal verification; no dead Admin Drawer control
or unbounded command path remains.

**Closeout (2026-08-30):** `COMPLETE / CURRENT_SOURCE_CLASSIFIED /
SOURCE_COMMAND_DARK / N28_READY`. The ADMIN/session/workspace-scoped API now
publishes exactly 24 typed tasks in six groups and classifies all 64 owner
catalogue entries. Current truth is 0 `CONNECTED`, 14
`SUPPORTED_BUT_INACTIVE` and 10 `SEMANTICALLY_INCOMPATIBLE`; the accepted N16B
emergency-close primitive is compatible but remains command-identity-dark and
two-person/step-up protected. Run and plan paths enforce bounded primitive
parameters, payload safety, idempotency/conflict, actor/reason and hash-only
audit/plan persistence; no outbox message or source side effect occurs. Thus
there is no dead enabled control and no fabricated command success. Evidence:
[`EX_BE_30_N27_ADMIN_ACTION_DRAWER_COMMAND_PLANE.md`](./backend/EX_BE_30_N27_ADMIN_ACTION_DRAWER_COMMAND_PLANE.md).

#### N28 — Genuine missing-capability adapters and owner packet

**Goal:** handle only capabilities N18/N19/N27 prove current sources cannot
supply after all adaptable current capabilities are consumed.

**Deliverables**

- cover genuinely absent market ticks/candles, venue calendar,
  authoritative Event/Artifact and command/semantic fields;
- prefer an existing Gateway, Historical/QDL or Portal-derived authority when
  semantically correct;
- consolidate remaining Trading System changes into one versioned owner
  request with exact schema, auth, bounds, compatibility and fixtures;
- retain typed unavailable product behavior until returned bytes pass
  verification.

**Non-goals:** no request for convenience-only one-to-one endpoints and no
phase-local request fragments.

**Tests/evidence:** absence proof against the N18 census, alternative-source
semantic tests, owner-pack manifest/hash verifier and returned-contract
compatibility fixtures when available.

**N28 exit gate:** each genuine gap has a working versioned adapter or exactly
one consolidated owner contract entry; no loose Trading System request remains.

**Closeout (2026-08-31):** `COMPLETE / 13_CURRENT_SOURCE_ADAPTERS /
9_GENUINE_OWNER_GAPS / 3_INTENTIONAL_EXCLUSIONS / SOURCE_DARK / N29_READY`.
Seven immutable source artifacts prove the classification. The Rust N28
authority supplies bounded tick/candle/calendar/partial-event adapters, exact
cross-profile drift and five source-dark N27 reclassification candidates. It
contains no HTTP client and cannot dispatch the two mutation candidates. The
only active owner request is revision v3 with MC-01…MC-09 and a strict returned
publication schema; the pending template is rejected for activation. Direct
Redis and destructive reset actions are permanently outside Portal. Evidence:
[`EX_BE_31_N28_GENUINE_MISSING_CAPABILITY_ADAPTERS.md`](./backend/EX_BE_31_N28_GENUINE_MISSING_CAPABILITY_ADAPTERS.md).

#### N29 — Product acceptance and release closeout

**Goal:** close the finite campaign as an internal, scalable Execution
Manager—not merely a collection of backend foundations.

**Deliverables**

- end-to-end UI → TypeScript BFF → Rust Edge → source/projection and command
  evidence for the accepted capability set;
- multi-replica capacity, WAN/auth/source loss, retention, restore, command
  containment, adapter rollback and version-upgrade rehearsals;
- signed immutable images, exact compatibility matrix, dashboards,
  SLO/error-budget, DR and owner/SRE runbooks;
- normal dev-to-stable release handoff only after accepted scope is proven.

**Non-goals:** no automatic main/stable merge, no unapproved Live mutation and
no known debt hidden as “future polish”.

**Tests/evidence:** full contract/security/UI consumer suite, real accepted
profile smoke, load/fault/restore/rollback/game-day evidence, signed release
manifest and debt register.

**N29 exit gate:** every N18 entry and Claude request is served, intentionally
internal, or honestly unavailable with a versioned N28 record; every visible
action works; evidence and rollback pass; no known campaign debt is deferred
into an unnamed phase. N30 is created only for genuinely new product scope or
a new owner contract revision.

**Closeout (amended 2026-08-31):** `BACKEND_ACCEPTED / BR_EX_72_COMPLETE /
RELEASE_CANDIDATE_READY_PROTECTED_RELEASE_PENDING /
ZERO_INTERNAL_TECHNICAL_DEBT / NO_RUNTIME_EFFECT`. N29 closes the missing R1 approval-creation and stateful
conditions/waivers APIs, pins research evidence server-side, enforces
serializable idempotent creation and publishes exact bounded condition queries.
The digest-bound Python and Rust authorities prove the complete 96-relation,
31-request, 27-read and nine-command disposition. The same-origin frontend
consumer is accepted. BR-EX-72 closes the bounded Fleet/Bindings entry APIs,
canonical Live Review fixture and registry revision 6. The candidate now waits
only for protected-main signed image evidence (`N29-REL-01`). Evidence:
[`EX_BE_32_N29_PRODUCT_ACCEPTANCE_AND_RELEASE_CLOSEOUT.md`](./backend/EX_BE_32_N29_PRODUCT_ACCEPTANCE_AND_RELEASE_CLOSEOUT.md)
and [`EX_BE_33_BR_EX_72_MANAGER_LISTS_REGISTRY_CLOSEOUT.md`](./backend/EX_BE_33_BR_EX_72_MANAGER_LISTS_REGISTRY_CLOSEOUT.md).

### N29-RTA — Runtime truth reset and data-first product closeout (2026-09-02)

**Current product verdict:** `PRODUCT_NO_GO / DATA_PLANE_PARTIAL /
UI_INTEGRATION_BLOCKED / MAIN_AND_STABLE_UNCHANGED`.

This audit supersedes the product interpretation of the historical N29
closeout without erasing its valid contract, repository, security and test
evidence. In particular:

- `CONTRACT_COMPLETE`, `FOUNDATION_COMPLETE` and a green fixture suite do not
  mean the commissioned product route is runtime-complete;
- a commissioned screen is not complete when its primary product data remains
  `TYPED_UNAVAILABLE`, `SOURCE_DARK`, disabled or supplied only by a test
  double;
- a fast local SSE fan-out does not make a 60-second source snapshot real-time;
- product acceptance requires an authenticated deployed route, source-backed
  data with correct profile lineage, the reviewed rich composition and a real
  browser journey. Panel-local optional data may be empty or unavailable, but
  it must not replace the whole screen.

#### Runtime facts observed on 2026-09-02

The audit was read-only. It retained no credentials or business rows.

| Surface | Observed deployed truth | Product implication |
|---|---|---|
| Paper overview | HTTP 200 `partial`; 43 deployments, 20 positions and bounded non-empty session/performance/equity populations; two capabilities available, three partial, two unavailable | Useful source data exists, but the screen is not complete and must expose panel-local completeness/freshness |
| Sandbox overview | HTTP 200 `ready`; 35 deployments, three reconciliation rows and honest empty positions/sessions | Sandbox can render a rich, sparse state; an empty transactional panel is not a whole-screen failure |
| Live overview | HTTP 200 `ready`; no Live deployment/position/session/account rows, but 85 balances included a Paper-scoped account identity | **High-priority profile-isolation defect.** The response cannot be accepted as authoritative Live truth until lineage/filtering is corrected |
| Blotter | HTTP 200 `partial`; bounded non-empty order/fill/session/command-journal populations; four partial, three empty and one unavailable capability | The current source can support a real rich Blotter, with explicit per-panel gaps |
| Alpha Fleet | HTTP 200 with 48 rows | Fleet list is source-backed and should remain the rich navigation spine |
| Alpha 360 | Fleet identity exists and analytics endpoint is HTTP 200 | Analytics is additive; failure/absence of one analytics branch must never replace the entire detail screen |
| Accounts & Bindings | List HTTP 200 with 43 rows; binding detail HTTP 200 | List and binding drill-down are usable now |
| Account/Broker 360 | Current narrow account route rejects the request; registry still classifies the full exposure population as unavailable | Screen BFF and truthful composition remain unfinished |
| Paper Workbench | HTTP 200 `partial`; unscoped deployment population plus scoped position/fill facts, while several branches remain unavailable | Scope normalization and panel-level data contracts remain unfinished |
| Sandbox Certification | A real current-source deployment returns `SANDBOX_CERTIFICATION_NOT_FOUND` | Certification is still coupled to missing Portal-control records instead of composing actual source facts plus governance truth |
| Command Center | Snapshot route returns `COMMAND_CENTER_SNAPSHOT_DISABLED` | Command Center backend is not activated |
| Admin Action Drawer | Catalogue/tasks return HTTP 200, relay is `DISABLED`, 24 tasks and zero connected commands | UI may show the catalogue, but no command may be presented as executable yet |
| Operations / approvals / waivers | Routes return HTTP 200 with empty populations | Empty may be truthful, but workflows require real create/transition evidence before product acceptance |

The rich UI source was not lost. Product routes still select the reviewed rich
containers for the major Execution screens. Sparse or whole-screen unavailable
output is primarily caused by incomplete/disabled BFF branches, bad profile
truth and some frontend composition branches treating an additive error as the
screen-level authority. This is a joint integration defect, not a reason to
replace the rich composition with a generic envelope.

#### Current refresh, persistence and stream behavior

The runtime is currently a hybrid of two different read paths:

| Layer | Current deployed interval/behavior | Consequence |
|---|---|---|
| AWS-HK Paper/Sandbox/Live projection workers | `EDGE_MANAGER_PROJECTION_POLL_INTERVAL_MS=60000`; one worker per profile | Trading System source truth can be up to about 60 seconds old before a new committed cycle |
| Projection commit | Thirteen bounded feeds become eight semantic snapshots in profile-isolated PostgreSQL; unchanged state updates a bounded heartbeat instead of rewriting full facts/cycles/journal | Correct durable base and bounded write amplification |
| AWS-HK realtime Edge | `EDGE_REALTIME_POLL_INTERVAL_MS=100`, `EDGE_REALTIME_SSE_ENABLED=true` | A newly committed projection cycle reaches local SSE quickly, but 100 ms journal polling does not improve 60-second source freshness |
| Current-source shared cache | `EDGE_MANAGER_SHARED_CACHE_TTL_MS=750` with shared admission/coalescing | Repeated reads inside 750 ms coalesce; a later page refresh can still cause a new cross-cell source fan-out |
| Fleet/Bindings Portal snapshot | committed Portal-control snapshot, five-second max age, stale-while-refresh | Better UI latency, but refresh still drains current source in the background |
| TypeScript profile/Paper BFFs | several screens issue a fixed bounded relation fan-out on each HTTP request | A browser refresh can indirectly call AWS-HK/Trading System; bounded, but not the desired scalable product hot path |

The desired invariant is therefore:

> A browser refresh or new tab reads an SGP-local read model and never creates
> a fresh Trading System fan-out. Cross-region source work is driven by a
> bounded shared ingestion/projection service, independent of tab count.

#### Data-first target architecture

```text
Trading System current contracts (AWS-HK)
    -> Rust source adapter: initial snapshot + incremental/delta polling
    -> profile-isolated operational PostgreSQL projection (AWS-HK)
    -> atomic cursor/epoch + journal/outbox
    -> authenticated bounded inter-cell delivery
    -> Portal read-model PostgreSQL/cache (SGP)
    -> TypeScript same-origin screen BFF
    -> browser initial snapshot + SSE deltas
```

Rules:

1. AWS-HK remains the Trading System compatibility/source boundary; Portal
   never reads Trading System SQL, Redis, shell or arbitrary relations.
2. SGP stores only sanitized Portal domain/read models needed by commissioned
   screens, not a replica of all 96 raw relations.
3. Each projection row carries profile, workspace, source revision, cursor or
   epoch, `as_of`, `received_at`, completeness and lineage. Paper/Sandbox/Live
   cannot share an unqualified cache key or result set.
4. Bootstrap uses a bounded snapshot. Normal operation uses incremental
   changes where the current contract supports them, plus periodic
   reconciliation snapshots. A whole 13-feed snapshot every second is not an
   acceptable substitute for a delta path.
5. Cross-cell outage serves the last committed SGP read model with visible
   `STALE` age until its bounded stale ceiling; it never invents freshness.
6. Browser SSE subscribes to the SGP-local journal/fan-out. Browser tab count
   affects only local fan-out capacity, not AWS-HK query volume.
7. Direct cross-cell BFF reads remain an operator-only diagnostic/fallback and
   are removed from normal product navigation after parity is proven.

Initial freshness budgets to validate under load:

| Data class | Target ingestion mode | Initial target |
|---|---|---|
| orders, fills, positions, execution/risk events | event/incremental feed when published; otherwise bounded delta poll | 0.1–2 s with events, 1–5 s with polling |
| accounts, deployments, balances, reconciliation | changed-key/delta poll plus reconciliation snapshot | 5–15 s |
| strategy/catalogue/config metadata | bounded batch | 30–60 s |
| historical chart/report/archive data | asynchronous batches | minute/hour according to the screen SLA |

These are target budgets, not claims about current runtime. The current source
snapshot interval remains 60 seconds until N30/N31 produce measured load,
change-rate and correctness evidence.

#### Storage decision: PostgreSQL hot; Parquet/DuckDB cold

- **Hot operational truth:** PostgreSQL remains the authority for projection
  state, exact decimals, cursor/epoch, idempotency, outbox/journal, state
  transitions and concurrent screen reads. Optional Redis or bounded in-memory
  caches may accelerate derived views/fan-out, but are never the authority.
- **Warm history:** time/range-partitioned PostgreSQL tables retain the recent
  operational window required for replay, investigation and near-term charts.
- **Cold history and heavy analytics:** append-only orders/fills/equity/events
  may be compacted asynchronously into date/profile/venue-partitioned Parquet
  in object storage. DuckDB is appropriate for offline/ad-hoc jobs and report
  generation; Rust Arrow/DataFusion may serve bounded historical queries.
- **Not allowed:** DuckDB as a shared concurrent hot service, Parquet rewrites
  for every tick/state transition, or browser queries directly against files.

Parquet/DuckDB therefore complement the architecture but do not solve the hot
path. Using them for live operational screens would weaken transactional
correctness, cursor continuity and small-update latency.

#### Confirmed unfinished work

1. Correct Live profile lineage/filtering and prove no Paper/Sandbox row can
   cross into Live.
2. Move normal Paper/Sandbox/Live product reads from request-time cross-cell
   fan-out to the SGP-local projection/read model.
3. Activate the read-only subset of the thirteen N28 existing adapters where
   current sources already exist; retain genuinely absent capabilities as one
   versioned owner gap. Mutation adapters remain separately gated.
4. Complete Account/Broker 360, Sandbox Certification, Canary/Live detail,
   Command Center and governance/workflow BFF composition.
5. Populate query/analytics from the durable projection and activate SSE from
   the local committed journal; prove snapshot/resume/gap/stale behavior.
6. Connect only the exact currently supported Admin Action Drawer commands
   through the existing approval/step-up/idempotency/verify boundary. All
   unsupported or unapproved commands remain visibly disabled.
7. Preserve rich compositions in every state. Missing additive data becomes a
   panel-local empty/unavailable/stale state, never a generic whole-screen
   replacement when the identity spine is available.
8. Run authenticated, real-source, route-by-route browser acceptance without
   fixture/double substitution for Product GO.
9. Reconcile Git/runtime provenance: this campaign checkout is ahead of
   `origin/dev`; dev deployment must be rebuilt only from the reviewed merged
   `dev` commit. `main` and stable remain untouched until owner acceptance.

#### Finite corrective campaign (data first, UI integration second)

**Direction:** `APPROVED_DATA_FIRST_ORDER / INDIVIDUAL_PHASE_EXECUTION_REQUIRES_OWNER_NAMING`.
No phase may close with a newly discovered in-scope debt deferred to an unnamed
phase.

| Phase | Goal and exit gate | Layer |
|---|---|---|
| N30 — Data truth and profile isolation | Freeze an exact relation/capability/screen population matrix from deployed data; fix Live leakage; prove profile/workspace/cache-key isolation and row lineage for Paper/Sandbox/Live | Rust + PostgreSQL |
| N31 — Projection-first dual-cell read path | Deliver snapshot + incremental/reconciliation ingestion, atomic outbox/cursor and an SGP-local Portal read model; ordinary page refresh causes zero AWS-HK requests; pass WAN-loss, restart, replay, duplicate and stale-serving tests | Rust + PostgreSQL; TypeScript consumes local BFF only |
| N32 — Existing-source adapter activation | Activate the semantically valid read-only N28 adapters already backed by present sources; exact bounds/auth/version negotiation and source-loss behavior pass; retain only genuinely absent owner gaps | Rust compatibility authority |
| N33 — Screen BFF data completion | Complete Account/Broker 360, Certification, Canary/Live, Command Center and governance composition over N31/N32; each route has canonical schema, real-source evidence and truthful empty/partial states | TypeScript BFF + Portal-control PostgreSQL |
| N34 — Exact command activation | Connect the supported Admin Action Drawer subset only; plan/apply/verify, approval, step-up, idempotency, audit and rollback pass. No arbitrary CLI/shell/raw command passthrough | TypeScript governance + Rust command relay |
| N35 — Backend/UI rich integration acceptance | Claude retains design authority; bind every rich panel to the canonical BFF, keep additive failures local, remove fake-real product fixtures and pass real browser journeys for every commissioned route | Claude frontend + Codex backend integration |
| N36 — Product/release closeout | Full auth/load/fault/replay/restore/rollback/retention evidence; reconcile feature head -> protected `dev`, rebuild one dev stack, owner UI acceptance, then separately promote signed images/SBOM/provenance through protected `main` | Release/operations |

**Claude frontend-lead review slot:** Claude may append its screen-by-screen
composition findings, density/state-machine concerns and proposed panel
bindings under this subsection or in the linked frontend handoff. Claude must
not rewrite the runtime facts above. Backend gaps must name the exact screen,
BFF contract, field/freshness requirement and behavior for empty, partial,
stale, denied and unavailable states. N35 begins only after N30–N33 establish
the real data spine needed by the reviewed UI.

##### Claude frontend-lead review — composition findings and backend asks (2026-09-02, appended in the reserved slot)

Read-only assessment for the owner and Codex. I audited `feat/execution-data-activation`
head against my recomposition tip (`c5dbbe8`), the approved UI/UX freeze
(showcase worktree at `cb60d13`, running on :8081 for side-by-side review), and
Codex's runtime facts above, which I accept as stated.

**1. Frontend-code integrity — nothing was lost.** `git diff c5dbbe8..HEAD --
apps/portal/frontend` is 13 files, +511/−151, and every hunk is additive or a
correct strengthening: whole-screen early returns in the overview/fleet/bindings
screens became in-frame `sourceStatus` panels (chrome preserved, state local —
the exact recomposition doctrine); Alpha Fleet gained the v2 summary
(per-currency exposure/PnL, stage counts, working stage filters); Alpha 360's
container now joins the Fleet v2 identity spine with analytics as an additive
branch, so an analytics failure can no longer blank the screen. The rich
screens (PaperWorkbench, both 360s, Blotter, all governance/triage screens),
the demo/lab layer, the boundary gate, the console guard and the journeys
suite are untouched. I endorse all of it.

One UI-authority note, accepted as interim rather than flagged as a defect:
Fleet's columns changed from the approved hi-fi's *30d* aggregates
(`net pnl · 30d`, `max dd`, `equity 30d` spark) to *current* facts
(`position pnl · current`, `exposure · current`, `account balance`). Honest
today; the approved design needs the 30d rollups back once N31's durable
projection can serve them — listed in the asks below so it does not silently
become the new normal.

**2. Screen-by-screen: what 100% of the approved UI needs.** Reference for
"100%" is the frozen showcase (`cb60d13`). Per screen: contract · missing
fields/branches · motion (tính động) source · state notes. Every field below
must arrive with `as_of`/`received_at` lineage and render empty/partial/stale/
denied/unavailable per branch, never per screen.

| Screen | Contract | Missing for 100% approved UI | Motion source | State notes |
|---|---|---|---|---|
| Paper Overview | `execution.paper-overview.v1` | per-deployment board row: alpha label/link, portfolio, account, allocation+ccy, observation gate (`met`, days/trades progress, per-day cells), drift verdict + spark series, win/rej/fees, net PnL, next-gate link; KPI strip (in-observation, gate-met, next-gate ETA, paper capital per-ccy, drift alerts); derived-insight series (cumulative return per deployment, order funnel 7d) | SSE deltas on deployment rows + funnel counters; poll fallback 5–15 s | 43 real deployments exist — board can be real now; gate/drift/insight branches each carry their own reason until published |
| Paper Workbench (+VNM) | `execution.paper-workbench.v1` | scope normalization (deployment-scoped rows only — Codex's own finding); identity: alpha label, account, venue, stage/readiness; lineage chips (R1/R2/artifact digest/account); KPI strip; observation gate items + unmet criteria; equity series + research band (`equity_projection.v1`); drift rows (server verdicts); runtime/accounting/contribution facts; sessions; VNM: venue calendar + venue-local time; `market.candles` for the overlay | SSE order/fill/position deltas (0.1–2 s class); projection-age ticker from `as_of` | screen already renders every absence honestly; exit CTA must keep naming the unpublished gate until it ships |
| Sandbox Overview | `execution.sandbox-overview.v1` | certification progress per row (7-step segments, status word, in-stage duration, next step), halted/findings KPIs, test-fund equity per-ccy, broker-sync age vs policy | poll 5–15 s; SSE optional | 35 deployments + recon rows already real; empty transactional panels stay panel-local (agreed) |
| Sandbox Certification | certification contract | decouple from missing Portal-control record (`SANDBOX_CERTIFICATION_NOT_FOUND` today): compose source facts + governance truth so a real deployment always renders; step evidence, findings, recon streak, action plans | poll; step transitions via SSE later | N33 item — screen exists and is states-first, needs the composed read |
| Live Overview | `execution.live-overview.v1` | **blocked on the Live profile-leakage fix (N30) before any field is trusted**; then: per-row stage chip (FULL/CANARY), session PnL, dd, health verdict, pulse spark, live tape events | SSE tape + row deltas (0.1–2 s class) | a valid empty Live must stay empty — leakage is the one defect that can fake it |
| Live Full / Canary Control Room | live-full + canary contracts | real room documents for current-source deployments (today only `.unavailable` canonical exists): envelope caps + usage, positions/orders, recon streak, incidents, canary: trial timeline, gates vs policy, drift-vs-twin series, marginal contribution | SSE positions/PnL; countdowns client-side off server anchors | rooms are rich and states-first already; they need their documents |
| Full Blotter | `execution.full-blotter.v1` | keyset `page` (cursor paging — today null), `exact_total`, per-ccy `aggregates` (M7), server-side filter application + counts, row fields (venue, deployment, times ms, type/side/status/fee), cross-filter contract | SSE append of new orders/fills; age ticks client-side | bounded real orders/fills exist per audit — wire them through the page shape; funnel-on-expand already real |
| Alpha Fleet | `execution.alpha-fleet-list.v2` | 30d rollups per alpha (net PnL, max dd) + 30d equity spark series; owner; portfolio links; health→next-gate sentence | snapshot ≤5 s (already) + SSE row deltas later | v2 spine endorsed; keep exact decimals per currency, never FX-mix |
| Alpha 360 | fleet spine + `execution.query-analytics-envelope.v1` | populate the 12 analytics branches from the durable projection (density heatmap, fill quality, slippage, reject taxonomy, latency, session PnL, exposure, turnover, paper-vs-live drift, fees, win profile, capacity); equity-by-stage series joined by artifact digest; per-venue scope queries (so the scope selects re-enable); positions/orders/audit pages; trade-replay candles (N28 `market.candles`) | SSE for positions/orders; analytics refresh per projection cycle | tiles already render one typed state per branch — each branch lights up independently as it ships |
| Portfolio 360 | analytics + correlation + capital-ledger (both live) | holdings structure rows (alpha→deployment→account, alloc/exposure/%/stage/health + FX note), KPI strip, ρ-timeline + drawdown-overlap series (BR-EX-65 slots are drawn and waiting), leaders, insight sentence, approvals-touching-portfolio, incidents, audit journal | poll 5–15 s; SSE later | correlation matrix + ledger already bind — visible proof the pattern works |
| Accounts & Bindings | `execution.bindings-list.v1` | per-binding physical equity, Σ virtual + headroom (invariant line), accounts count, sync age vs per-venue policy, health verdict, credential expiring detail (state word only); virtual-account child rows | ws/rest sync ages via SSE or 5 s poll | list is real today; the capital invariant is the screen's heart — needs N28 exposure population |
| Binding Detail | `execution.binding-detail.v1` | capital-invariant bar segments (per-deployment virtual allocations), credential/session facts (alias, expiry, rate use), sync policy + history window, findings | poll 5 s | frame + facts render now; the bar is the missing centerpiece |
| Account/Broker 360 | `execution.account-broker-360.v1` (typed-unavailable) | the whole composed read: internal vs broker columns + difference rows w/ envelope+digest, linked accounts, aggregate headroom verdict + exposure population, sync history (server-counted total), findings, dry-run/sync receipts | SSE sync ticks; poll fallback | today the reviewed frame renders all-absent (correct); this is N33's largest single item |
| Command Center | `execution.command-center-snapshot.v1` | **activate the snapshot route** (`COMMAND_CENTER_SNAPSHOT_DISABLED`); needs-you ranked rows with server hrefs + SLA anchors, fleet matrix counts, pinned rows, today panel; then the realtime stream contract (snapshot→SSE, `auth.expired`/`projection.gap` terminal semantics — frontend already implements close+resnapshot) | SSE from SGP-local journal (the N26 machinery Codex just built) — this screen is the motion flagship | frontend passes no SSE factory today by design; I will wire it in N35 the moment the stream contract is served |
| Operations Queue / Incident | queue + incident contracts | real operation/incident populations (routes are 200-empty today) with workflow versions, `filtered_count` probes, incident refs on rows (BR-EX-33) so the disabled "Open incident" link can become real | SSE queue deltas; elapsed clocks client-side off server `read_at` | triage acknowledge/resolve paths already consume the contract |
| Approval Inbox / R1 / R2 / LIVE / Exit / Waivers | governance contracts | real create→decide→condition lifecycle evidence (routes 200-empty); R1 evidence series + policy chip (BR-EX-67), R2 portfolio-fit/criteria/stage-eligibility branches, LIVE's four derived canary branches + capital step (BR-EX-70), waiver state transitions feeding CC | inbox Mine/SLA tick off server anchors; SSE on decision/condition events later | every one of these panels already renders its typed gap with the right BR-EX id on screen |
| Admin Action Drawer | `execution.command-tasks.v1` + catalogue | flip the exact supported subset to `CONNECTED` through approval/step-up/idempotency/verify (N34); relay receipts; plan/apply/verify walk per WF 1i | operation poll walk (202→verify) | UI already refuses to enable anything not CONNECTED — no change needed to stay safe |

**3. Routes and links — verdict: chuẩn.** All 23 catalogue `uiRoute`s match the
frontend router 1:1; registry revision 6 owns every reviewed route
(`EXTRA_ROUTES` correctly empty); feature roots map to the right list screens
(fleet, bindings) after Codex's requalify. Cross-screen links verified in code:
fleet row→Alpha 360→workbench/account; bindings→binding detail→Account 360;
workbench→exit review (`?from=` context return)→inbox; canary→gate LIVE;
queue/incident→drawer (`?operation=` answered honestly); every internal href
passes `canonicalHref`. Two small route asks: (a) add the two list roots
(`/deployments/alphas`, `/deployments/accounts`) as first-class rows in the
screen-bff catalogue so screen-contracts discovery is symmetric with the
registry; (b) `/governance/exit-reviews` root still defaults to one review —
an exit-review LIST contract remains the only unrouted approved surface.

**4. Recommendations, in Codex's own phase order (I endorse data-first):**

1. **N30 first, nothing before it**: the Live leakage row (Paper account
   identity inside Live balances) is the only finding that can make the UI
   *lie*; every other gap renders as an honest absence. Ship the
   lineage/cache-key proof before widening any population.
2. **N31 defines the motion contract once** — my ask: one SSE envelope shape
   for all screens (`snapshot_cursor`, `delta`, `heartbeat`, terminal
   `auth.expired`/`projection.gap`), served SGP-local. The frontend's
   subscription machinery (gap→close→resnapshot, stale ceilings) already
   exists and is tested; give me one contract, not per-screen dialects.
   Publish per-class freshness budgets in each envelope so screens can print
   honest age against policy instead of a constant.
3. **N32/N33 sequencing by UI value**: (1) Command Center snapshot activation
   — it is the daily entry screen and its motion is the product's heartbeat;
   (2) Account/Broker 360 composed read — largest all-absent surface;
   (3) workbench scope normalization + observation gate; (4) blotter page/
   aggregates; (5) certification decoupling; (6) analytics branch population;
   (7) Fleet 30d rollups (restore the approved columns). Governance lifecycle
   evidence can run in parallel — it is write-path, not read-spine.
4. **Keep every gap panel-local and versioned** (rule 7 above) — the frontend
   is already structured so each branch lights up independently; deliver
   branches in any order and the reviewed UI absorbs them without another
   recomposition.
5. **N35 protocol**: when a branch ships, hand me contract + canonical
   fixture + one deployed sample read; I bind the panel, extend the BFF
   double, and re-record only the touched baselines. No fixture ever
   substitutes on a product route; the showcase (:8081, frozen `cb60d13`)
   stays the visual acceptance reference for what "100%" means per panel.

*Assessment only — no code changed in this pass. Appended by Claude
(frontend lead) at the owner's request; runtime facts above are Codex's and
were not edited.*

#### Phase 1 delivery specification — Data Truth, Projection & Realtime Foundation

**Owner authorization (2026-09-02):** Bobby approved immediate implementation
of the complete Phase 1 scope, combining N30–N32. This is one coherent backend
phase on `feat/execution-data-activation`; it must not be split into unnamed
follow-ups. UI composition, commands, `main` and stable are outside this phase.

**Target status:** `DATA_TRUTH_ACCEPTED / SGP_LOCAL_READ_MODEL_ACTIVE /
CURRENT_SOURCE_READ_ADAPTERS_ACCEPTED / UNIFIED_REALTIME_ACCEPTED /
PHASE_2_READY`.

##### P1-A — Profile and lineage truth

- derive Paper/Sandbox/Live scope from the authenticated accepted resource and
  server-owned profile binding, never from an arbitrary browser field;
- require profile/workspace/source-revision lineage on every normalized row,
  cached document, projection cycle and realtime envelope;
- partition uniqueness, cache keys, leases, cursors and reads by the complete
  scope; reject a row whose embedded mode/profile conflicts with its accepted
  profile;
- reproduce and eliminate the observed Paper-balance-in-Live defect;
- prove the same relation/key cannot be returned through another profile even
  under concurrent refresh, stale cache, replay, restart or adapter rollback.

##### P1-B — Projection-first SGP read path

- retain the existing bounded Rust compatibility/projection authority at
  AWS-HK and consume it through the accepted mTLS + delegated-JWT boundary;
- add one shared, lease-controlled ingestion path independent of browser tab
  count: initial bounded snapshot, changed-cycle refresh and periodic
  reconciliation;
- persist sanitized screen/domain documents in SGP PostgreSQL with profile,
  workspace, source contract revision, source epoch/cursor, `as_of`,
  `received_at`, completeness, payload digest and last successful refresh;
- make the normal TypeScript screen BFF read SGP-local committed documents
  only. A cache miss is typed and fail-closed; it must not trigger synchronous
  cross-cell read-through;
- serve the last committed document as `STALE` only inside its declared
  ceiling. Refresh errors never erase the last valid document;
- keep a separately authorized diagnostic path for bounded direct source
  comparison and parity evidence; product navigation cannot call it.

##### P1-C — Existing-source read adapter activation

- activate only semantically valid read-only N28 alternatives whose present
  source and exact bounds are proven (market ticks/candles, calendar,
  benchmark, cross-profile comparison, partial lifecycle/health/inspect/
  performance/broker-read families as applicable);
- bind every adapter to a versioned source operation, profile, venue, symbol or
  resource allowlist, row/body/time bounds and typed failure behavior;
- keep mutation candidates and genuinely absent MC owner capabilities dark;
- never expose arbitrary upstream URLs, headers, relations or payloads to
  TypeScript or the browser.

##### P1-D — One realtime contract

- publish one versioned envelope for every screen topic with exactly these
  semantic kinds: initial `snapshot`, ordered `delta`, bounded `heartbeat`,
  terminal `auth.expired` and terminal `projection.gap`;
- include profile/workspace, source epoch, cursor/sequence, `as_of`,
  `received_at`, completeness, freshness class/budget and payload digest;
- browser SSE is served from the SGP-local committed journal/fan-out. One new
  tab creates no AWS-HK subscription or Trading System request;
- reconnect resumes from a bounded cursor when continuity exists; gap or
  retention loss closes the stream and requires a fresh local snapshot;
- enforce bounded queues, replay pages, heartbeat cadence and slow-consumer
  eviction without losing the durable cursor authority.

##### Phase 1 required evidence and exit gate

1. Schema/migration/restore tests for the SGP read model, lease, cursor,
   idempotency, payload digest and retention boundary.
2. Unit/contract tests for profile mismatch, cache-key isolation, row-lineage
   rejection, exact decimals, adapter allowlists and typed errors.
3. Integration proof that repeated and concurrent page refreshes create zero
   AWS-HK requests while one shared ingestion cycle remains bounded.
4. Snapshot/delta/reconciliation tests covering duplicate, out-of-order,
   cursor-ahead, epoch replacement, restart, replay and stale retention.
5. SSE tests for the five envelope kinds, resume, terminal close, backpressure,
   authentication loss and profile isolation.
6. Real sanitized Paper/Sandbox/Live smoke proving no cross-profile row,
   correct source age and truthful empty populations.
7. WAN/source-loss drill proving local stale service and clean recovery without
   deleting or relabeling the last accepted document.
8. Load evidence proving source traffic is determined by ingestion cadence and
   profile count—not browser tabs or Control API replica count.
9. Tracking/evidence report, generated contracts and rollback instructions
   committed with the implementation. No source/runtime claim may rely on a
   fixture-only result.

**Phase 1 exit gate:** all nine evidence classes pass; normal product BFF reads
are SGP-local; the direct source comparison path remains diagnostic-only; Live
profile leakage is impossible by contract and storage constraint; accepted
read adapters are active and bounded; the unified realtime stream preserves
scope and continuity. Otherwise Phase 1 remains `IMPLEMENTATION_IN_PROGRESS`
and Phase 2 must not start.

##### Phase 1 implementation result — accepted 2026-09-02

Status: `DATA_TRUTH_ACCEPTED / SGP_LOCAL_READ_MODEL_ACTIVE /
CURRENT_SOURCE_READ_ADAPTERS_ACCEPTED / UNIFIED_REALTIME_ACCEPTED /
PHASE_2_READY`.

P1-A through P1-D and all nine evidence classes are closed. The implementation
uses one lease-controlled ingestion cycle per exact Paper/Sandbox/Live profile,
SGP PostgreSQL atomic snapshots and replay journal, local-only product BFF
reads, four bounded present-source adapter families and one five-kind SSE
contract. The real sanitized dev smoke checked 2,500 projected rows with zero
lineage or embedded-mode mismatch; real projection ages were 0.1–5.0 seconds.
One current Paper relation is truthfully typed unavailable by the source and
does not block the other 18 Paper relations.

Full implementation, runtime, test, image and rollback evidence:
[Phase 1 closeout](backend/EX_BE_PHASE1_DATA_TRUTH_PROJECTION_REALTIME_FOUNDATION.md).

#### Phase 2 delivery specification — Complete Screen BFF & Controlled Command Plane

**Owner authorization (2026-09-02):** Bobby approved immediate implementation
of the complete Phase 2 scope, combining N33 and N34 on
`feat/execution-data-activation`. Phase 2 must close every Portal-owned gap in
the screen BFF and command-control boundary; it must not infer mutation
authority from a CLI name, an observed HTTP route or an internal-only Portal
decision. The approved rich frontend composition is read-only input to this
phase and must not be rewritten.

**Target status:** `COMPLETE_SCREEN_BFF_ACCEPTED /
CURRENT_COMMAND_SET_CONTROLLED / R0_LOCAL_TASKS_CONNECTED /
UNPUBLISHED_MUTATIONS_FAIL_CLOSED / PHASE_3_READY`.

##### P2-A — Canonical screen composition over the SGP-local projection

- make every commissioned product route use a stable, versioned, same-origin
  BFF contract; a browser never sees Manager relation selectors, database
  names, AWS-HK origins or source credentials;
- compose source facts from the Phase 1 local snapshot only. Portal governance,
  approval, condition, incident and user-owned records remain TypeScript /
  Portal-control PostgreSQL authority and are joined server-side;
- retain one identity spine whenever the requested resource is known. An
  additive branch failure becomes a capability-local
  `EMPTY/PARTIAL/STALE/DENIED/UNAVAILABLE` state and may never replace the
  complete screen with a generic envelope;
- publish complete per-screen metadata: `schema_version`, record/source
  authority, profile/workspace/resource lineage, `read_at`, `as_of`, freshness,
  completeness, branch capability state and stable reason code;
- close the BFF catalogue asymmetry: list and detail roots, route templates,
  operation IDs and response contracts must match the frontend router exactly.

##### P2-B — Finite screen worklist and priority

The worklist is finite and must close in this phase in the order below:

1. activate Command Center snapshot composition from local projection plus
   Portal governance/operations; keep needs-you ranking, fleet/today/pinned
   panels and source status honest; bind its motion to the Phase 1 local SSE;
2. deliver `execution.account-broker-360.v1` from bindings, account/balance,
   venue-account and reconciliation facts, including truthful internal/broker
   differences and headroom/availability branches;
3. normalize Paper Workbench rows to the requested deployment and add the
   observation-gate branch without cross-deployment fall-through;
4. finish Full Blotter keyset navigation, exact total and bounded server-side
   aggregates/filter/sort metadata over the committed hot projection;
5. decouple Sandbox Certification identity/source facts from the optional
   Portal-control certification record so a real deployment always renders;
6. populate all analytically derivable branches that the hot projection can
   prove; genuinely absent series/cold-history stays named per branch;
7. restore Alpha Fleet 30-day columns only where the projection contains a
   complete window; otherwise retain the current exact facts with a typed
   rollup branch state;
8. finish Canary/Live and governance/operations composition using real source
   facts where rows exist and truthful empty states where they do not.

No item may be declared complete by merely changing catalogue metadata or a
feature flag. It needs a contract test, a local-projection sample and a
same-origin route test. No fake fixture may substitute for a product response.

##### P2-C — Controlled command plane for the exact current source set

- classify the complete operator task catalogue from immutable current
  evidence on every release. `CONNECTED` is capability authority, not route
  discovery;
- connect the bounded R0 inspect task subset to Phase 1 local adapters. These
  reads run inside SGP, return bounded typed output and audit a digest; they do
  not use the mutation relay or open an AWS-HK request per click;
- preserve the TypeScript intent path for mutations:
  `validate -> plan -> approval/step-up/SoD -> apply -> verify -> terminal
  receipt`; bind request key, operation ID, actor, workspace, environment,
  target version, payload hash, capability revision and expiry;
- require session, workspace membership, ADMIN role, allowed Origin and CSRF
  for every plan/apply mutation. R3/R4 also require an exact owner-published
  capability, dedicated command identity, phishing-resistant step-up and the
  capability's distinct-approver policy;
- persist hash-only intent, immutable audit/outbox/operation state and
  sanitized relay/verify receipts. Never persist a credential, raw CLI,
  arbitrary URL, shell, SQL or free-form source command;
- an HTTP 202 is `ACCEPTED`, never success. Ambiguous/timeout outcomes become
  `UNCERTAIN`, are never automatically retried and require source
  reconciliation before risk-increasing work on the same target;
- while the owner publication has zero `portal_reachable=true` mutation
  capabilities, all mutation tasks remain visibly
  `SUPPORTED_BUT_INACTIVE/SEMANTICALLY_INCOMPATIBLE`; plan/apply sends zero
  source requests. This is the accepted exact current set, not hidden Portal
  debt. A later signed owner publication can activate one capability without
  changing the browser contract or widening any other task.

##### P2-D — Runtime, observability and rollback

- separate screen-read, realtime, R0 local-task and mutation-relay flags;
  rollback of one plane cannot disable or widen another;
- publish bounded per-route concurrency, response bytes, page/row counts,
  freshness ceiling and cache/profile keys; record sanitized latency, state,
  reason code, projection age and command lifecycle counters;
- preserve the last valid BFF document during source loss inside the declared
  stale ceiling; commands always fail closed on capability, auth, version,
  approval, step-up, target-state or verification uncertainty;
- rollback is one prior content-addressed Control API image plus independent
  feature flags. Projection, audit, operation and journal evidence is retained.

##### Phase 2 required evidence and exit gate

1. **Catalogue/contract:** every commissioned route maps to exactly one BFF
   operation/contract; schema/OpenAPI/generated types/fixtures stay in parity.
2. **Screen matrix:** real local-projection sample for every screen family;
   identity and branch states prove ready, empty, partial, stale, denied and
   unavailable without whole-screen loss.
3. **Data isolation:** Paper/Sandbox/Live and workspace/resource filters,
   cache keys, exact decimals and deployment/account joins pass negative tests.
4. **Query:** blotter cursor/filter/sort/count/aggregate bounds and workbench
   scoping pass replay, invalid-cursor and truncation tests.
5. **Realtime:** Command Center snapshot/resume/gap/auth-expired behavior uses
   the Phase 1 local journal and creates no cross-cell tab fan-out.
6. **R0 tasks:** allowlist, bounds, local-only transport, audit digest,
   sensitive-value rejection and role/workspace negatives pass.
7. **Mutation safety:** request-key replay/conflict, expected-version conflict,
   approval/step-up/SoD, expiry, 202/terminal/uncertain, kill switch and zero
   dispatch for unpublished capabilities pass.
8. **Fault/load:** concurrent screen reads, source outage, stale ceiling,
   database restart and command ambiguity remain bounded and fail closed.
9. **Runtime/restore:** fresh PostgreSQL migration, dump/restore signature,
   rebuilt dev image, authenticated same-origin smoke and rollback rehearsal
   pass; `main` and stable remain unchanged.
10. **Debt audit:** every in-scope finding is fixed or explicitly proven to be
    immutable external source truth with owner/evidence reference. No unnamed
    Portal technical debt may cross the gate.

**Phase 2 exit gate:** all ten evidence classes pass. Screen BFFs are complete
for the current data population, R0 tasks are genuinely local and connected,
and mutation controls are fully implemented but only owner-published exact
capabilities can dispatch. Phase 3 must not begin while a Portal-owned screen
or command-control defect remains.

##### Phase 2 implementation result — accepted 2026-09-02

Status: `COMPLETE_SCREEN_BFF_ACCEPTED / CURRENT_COMMAND_SET_CONTROLLED /
R0_LOCAL_TASKS_CONNECTED / UNPUBLISHED_MUTATIONS_FAIL_CLOSED /
PHASE_3_READY`.

All eight finite screen slices and all ten evidence classes are closed. The
catalogue has 23/23 available same-origin Screen BFF roots. Four exact R0 tasks
run only against the SGP projection and emit digest-bound audit evidence; all
source mutation paths remain fail-closed. The rebuilt dev Control API passed an
authenticated real-projection smoke over Paper, Sandbox, Live, Alpha Fleet,
Command Center and R0 inspect. `main`, stable and the approved rich UI source
were not changed.

Full contract, runtime, test, image and rollback evidence:
[Phase 2 closeout](backend/EX_BE_PHASE2_COMPLETE_SCREEN_BFF_CONTROLLED_COMMAND.md).

#### Phase 3 delivery specification — Rich UI integration, product acceptance & release

**Start condition:** Phase 2 is accepted and Claude's approved rich
composition/review packet is pinned by commit. Bobby authorized this phase on
2026-09-02. This phase combines N35 and N36.

**Target status:** `RICH_UI_BFF_INTEGRATION_ACCEPTED /
AUTHENTICATED_PRODUCT_GO / DEV_RELEASE_ACCEPTED /
PROTECTED_MAIN_PROMOTION_READY`.

##### P3-A — Panel-by-panel rich UI binding

- Claude retains visual/design-system authority; Codex owns BFF correctness,
  runtime composition and release evidence;
- bind every approved panel to its canonical same-origin BFF branch; preserve
  layout/density in empty, partial, stale, denied and unavailable states;
- remove product-route fixture/double substitution. Fixture Lab remains a
  separately routed visual/e2e corpus and can never answer a product request;
- wire the single realtime contract where motion is useful; terminal auth/gap
  closes the stream and performs a bounded resnapshot, never an infinite
  EventSource retry loop;
- enable an Admin Action Drawer control only when the server catalogue returns
  `CONNECTED`; render plan/apply/verify/uncertain receipts exactly as served.

##### P3-B — Authenticated product acceptance

- execute authenticated browser journeys for all catalogue routes and cross-
  screen links using real dev BFF data, including truthful sparse Live/Sandbox
  populations;
- prove no browser request leaves same origin, no React/DOM warning appears,
  no console/network error is hidden and no unavailable additive branch erases
  its screen;
- verify keyboard, focus, responsive density, reduced-motion, terminal stream,
  session expiry, CSRF/role denial and stale/conflict operator journeys;
- have Bobby review the resulting dev-portal screen matrix against the pinned
  rich UI reference and record all findings before release promotion.

##### P3-C — Product and release closeout

- run full contract, TypeScript, Rust, frontend, browser, auth, load, fault,
  replay, retention, restore and rollback gates from one reviewed commit;
- reconcile feature head into protected `dev`, rebuild only the canonical dev
  worktree/runtime and record Git/image/config/database provenance;
- after owner UI acceptance, promote `dev -> protected main` through review;
  only the main workflow may produce signed immutable images, SBOM and
  provenance. Stable runtime is changed only by a separately approved release;
- publish one closeout report containing screen/command acceptance, source
  truth, known external gaps, exact rollback and the next version boundary.

##### Phase 3 exit gate

Phase 3 closes only when every commissioned route has an authenticated real-
data journey, every connected command has a terminal/uncertain journey, the
approved rich UI remains intact, dev provenance is singular and Bobby records
Product GO. Missing Trading System capabilities remain versioned external
requests; no Portal defect or UI/backend integration gap may be relabeled as
an external dependency.

Implementation and pre-release evidence:
[Phase 3 closeout](backend/EX_BE_PHASE3_RICH_UI_PRODUCT_ACCEPTANCE.md).
The implementation is `OWNER_UI_REVIEW_READY`; `AUTHENTICATED_PRODUCT_GO`
remains intentionally pending until Bobby reviews the rebuilt dev runtime.

#### Phase 4 delivery specification — Owner-findings closeout and production streaming (2026-09-02)

**Authorship note:** Bobby granted Claude backend scope on 2026-09-02; this
phase is specified by Claude (frontend lead, now backend co-implementer) from
a read-only investigation of the rebuilt Phase 3 dev runtime — projection
PostgreSQL content, BFF/service source and the deployed configuration. It
records Bobby's dev-review findings against the Phase 3 candidate and the
finite corrective plan. Runtime facts below were measured, not inferred.

**Owner authorization:** Bobby ordered on 2026-09-02: resolve every cause
"triệt để", including configuration, and drive straight toward production
streaming — no deferred debt.

##### P4-0 — Measured findings register (root causes, verified)

Projection truth at measurement time (dev, 2026-09-02 15:46 UTC): all three
profiles refresh continuously (snapshot age 1–29 s); Paper holds 19 relations
including 400-row bounded windows for `execution_sessions`,
`performance_snapshots`, `account_equity_snapshots` and `command_journal`,
364 orders, 55 fills, 48 strategies, 43 accounts/deployments, 42
balances/allocations, 20 positions and **2 real portfolios**
(`portfolio_types_pool`, `portfolio_types_pool_VN`). The data plane is rich;
the losses are at the seam and in policy constants.

| # | Finding (owner symptom) | Verified root cause | Layer |
|---|---|---|---|
| F1 | Portfolio 360 renders whole-screen "Nothing to show … PF-CRYPTO was not present in the current-source Fleet" | (a) frontend route defaults `params.portfolioId ?? "PF-CRYPTO"` — a hi-fi canonical-cast id that no real source contains (`ExecutionPreviewRoute.tsx:172,258`); (b) the container's identity spine is Fleet-only and never consults the projected `manager.portfolios:portfolios` relation (2 real rows exist); (c) no portfolio LIST surface exists, so the sidebar can only deep-link a guessed id | FE route + BFF spine |
| F2 | Alpha 360 insight tiles show "Insufficient data — the branch answered with no series for this window" and "Unavailable — PARTIAL" over a projection that has 400-point equity/performance windows and 20 positions | the frontend tile mapper (recomposeContainers `analyticsTiles`) is a N29-era stopgap: it hardcodes AVAILABLE→`insufficient_data` and prints the capability STATE word as the reason; it never binds the per-capability `chart_series`/`source_facts` the local analytics BFF already returns (BR-EX-75). The BFF side is correct | FE tile binding |
| F3 | Alpha Fleet header pinned `STALE` while data is seconds old | `SNAPSHOT_MAX_AGE_MS = 5_000` hardcoded in `manager-lists.service.ts` — a 5 s FRESH ceiling under a 15 s SGP poll (and stale-while-refresh) makes STALE the steady state. Freshness must be classified against the declared ingestion-class budget carried in the envelope, with an AGING tier, not a constant | BFF policy const |
| F4 | Fleet/360/Blotter/Command Center "chưa đủ động" — static until reload | only the three profile overview containers subscribe to `useProfileRealtime`; Fleet, Alpha/Portfolio 360, Blotter and the Command Center container have no stream binding. The hook itself only bumps `refreshKey` (full refetch per delta) — correct at today's cadence, a refetch storm at production delta rates | FE realtime coverage + delta application |
| F5 | Orders/fills/balances marked `PARTIAL · N30_PROFILE_LINEAGE_REJECTED` (364/55/42 rows survive) | `enforceProfileLineage` drops child rows whose parent (account/strategy/deployment) is not in the profile's accepted parent set. With a single `PAPER_BINANCE_USDM` profile, every non-BINANCE-USDM paper parent (e.g. the DNSE/VN market family) is structurally rejected — correct fail-closed behavior, wrong profile taxonomy. There is no rejected-row diagnostic, so nobody can see *which* parents are missing | Rust/TS profile taxonomy + observability |
| F6 | History panels thin | time-series relations are hard-capped at 400 rows (`SOURCE_PARTIAL`) — a bounded snapshot window, no warm-history path; 30d rollups/sparks for Fleet remain typed-dark because no window aggregation exists | ingestion window policy |
| F7 | `portfolio_equity_snapshots` = `MANAGER_V2_SOURCE_CONTRACT_REJECTED` | genuine owner-side contract gap (recorded); meanwhile portfolio equity is derivable server-side from `account_equity_snapshots` × allocations as a declared `DERIVED` formula | owner gap + DERIVED candidate |
| F8 | Raw exact decimals rendered verbatim (`28,579.60574880000000` USDT; `0.002500000000000000` qty) | no display-precision rule exists. Exact strings are the correct wire/storage form; the UI lacks a single formatting authority | FE design system |
| F9 | VNM workbench dark | no `PAPER_DNSE_VNM` (or equivalent) profile exists; venue calendar capability typed-dark — same taxonomy decision as F5 | profile taxonomy + owner |
| F10 | Several relations truthfully empty (`venue_accounts`, `broker_account_sync_effective`, `reconciliation_findings`, all Live transactional rows) | must stay empty-as-fact; each screen must show the empty state with the relation's own name so an operator can distinguish "no findings" from "not consumed" | verification only |

The unifying diagnosis for "màn không hiện hết dữ liệu Edge cung cấp": the
Edge→SGP data plane already delivers; the losses are (i) two frontend binding
seams (F1, F2), (ii) three policy constants/coverage gaps (F3, F4, F6) and
(iii) one profile-taxonomy decision (F5/F9). Nothing requires a new
Trading System capability except the already-recorded F7 owner gap.

##### P4-A — Portfolio identity, list surface and route truth (TS BFF + FE)

- extend the manager-lists (or profile-read) plane with a bounded
  `portfolios` list read over the projected `manager.portfolios:portfolios`
  relation (id, name, owner, state, base currency, per-profile membership,
  allocation/deployment counts), all profiles combined like Fleet v2;
- Portfolio 360 spine = `portfolios` relation ∪ Fleet allocations; an id
  present in either renders the full rich screen; an id in neither renders
  the existing typed empty with the real available ids listed;
- frontend: `/deployments/portfolios` root becomes the real portfolio list in
  the reviewed list grammar; the sidebar/route default derives from data,
  never from a canonical-cast constant; remove every remaining `PF-CRYPTO`
  route default (fixture ids stay lab-only).

Status 2026-09-02: `INTEGRATION_COMPLETE` — `GET /api/v1/execution/portfolios`
(additive `execution.portfolio-list.v1`: schema/fixture/OpenAPI/types) serves
the all-profile identity list with per-environment branch states, N30 lineage
and exact allocated capital; `/deployments/portfolios` renders the register in
the reviewed exec-af grammar and both `PF-CRYPTO` defaults are removed;
Portfolio 360 identity spine = portfolios ∪ Fleet allocations, unknown ids
name the real available ids. N29 authority advanced with BR-EX-76 pins (route
set, schema authority, 100-row bound, consumer tokens). Dev journey: 2 real
portfolios, 77 allocations / 77 deployments, `22220000 USDT` exact, three
AVAILABLE profile branches, envelope COMPLETE/FRESH.

##### P4-B — Per-capability series/facts binding and display formatting (FE, Claude)

- replace the stopgap tile mapper: each of the 12 analytics capabilities binds
  its own `chart_series`/`source_facts` branch; state renders from the
  capability's `state` + `reason_code` (never the state word as prose);
  AVAILABLE with data draws the real chart; EMPTY/PARTIAL/UNAVAILABLE keep
  the reviewed tile frame with the served reason;
- Fleet gains its equity spark and PnL/exposure columns from the same
  analytics facts where the projection window suffices (F6 ladder below);
- one formatting authority in the design system (`formatExact` family):
  exact decimal strings are never mutated; display precision is a per-unit
  class (money: currency display scale, default 2 dp for USDT-class; qty:
  instrument step precision; pct/ratio: 2–4 dp), trailing zeros trimmed to
  the class floor, thousands grouped, full-precision original always
  available on hover/copy, tabular mono everywhere, and blotter/ledger
  columns keep the §8 no-abbreviation invariant.

Status 2026-09-02: `INTEGRATION_COMPLETE` (Fleet spark deferred to the P4-D
window ladder it depends on) — the stopgap index-mapped tile mapper is
replaced by per-capability-id binding: every one of the twelve published
analytics capabilities renders its own branch (stage-equity series;
exact-query/position-exposure/execution-quality/contribution/order-funnel/
replay-journal fact bodies with real numbers; the unavailable tail keeps the
reviewed frame with the served state + reason code). `formatExact` is the one
display authority (exact string in, half-up BigInt rounding, per-unit class
floors, grouping, no abbreviation, full precision on hover); Fleet's local
`exactDisplay` and the portfolio register delegate to it. Fleet PnL/exposure
columns were already served by Fleet v2; its 30d equity spark honestly waits
on the F6 window ladder (metricsAvailability already states the reason).

##### P4-C — Freshness truth and motion coverage (TS + FE)

- replace the 5 s constant with envelope-declared freshness budgets per
  ingestion class (transactional / account-state / metadata per the N29-RTA
  budget table); classify FRESH/AGING/STALE against the budget and render the
  age beside the class; the manager-lists envelope carries its budget;
- extend the one profile-realtime contract to the remaining read surfaces
  (Fleet, Alpha/Portfolio 360, Blotter, Command Center container) — one
  subscription per screen, snapshot-then-SSE, existing terminal semantics;
- upgrade delta handling from refetch-per-delta to bounded coalescing
  (single in-flight refresh, ≥1 s coalesce window at current cadence) and,
  once measured rates justify it, targeted branch refresh keyed by the
  delta's relation set — never a per-event full-screen refetch at
  production rates.


Status 2026-09-02: `INTEGRATION_COMPLETE` (delta payload application stays
snapshot-revalidate by design; true in-place delta merge remains a P4-E
refinement) — F3: manager-list freshness follows the ingestion-class budget
(FRESH ≤ 2× poll, AGING ≤ 4×, STALE beyond) and every envelope declares
`freshness_budget_ms`; additive AGING tier across manager-lists v1 / fleet
v2 / portfolio-list v1. F4: Fleet, Alpha 360, Portfolio 360 and the
portfolio register bind the union of the three profile streams; bursts
coalesce to ≤1 re-read/s with a trailing edge, heartbeats never re-read, and
revalidation keeps the rich tree mounted (no loading flash). Dev runtime
serves SSE enabled (`FEATURE_EXECUTION_REALTIME_SSE=true` effective).

##### P4-D — Profile taxonomy, lineage observability and window ladder (Rust + TS + owner)

- owner decision (Bobby): the profile set. Recommendation: add
  `PAPER_DNSE_VNM` (and future venue/settle families) so every real parent
  has exactly one home; keep strict rejection for true cross-profile rows;
- add rejected-row diagnostics: per relation, count rejects by missing-parent
  key class, exported in the snapshot envelope + a bounded operator view, so
  a lineage storm is visible instead of silently PARTIAL;
- window ladder per relation class replacing the flat 400: transactional
  relations move to delta/journal ingestion with reconciliation snapshots;
  time-series relations get a declared window (e.g. 30 d @ 1 h + 48 h @ raw)
  persisted in warm SGP tables so Fleet 30 d rollups and history charts are
  computable locally; every window states itself in the envelope caption;
- implement F7's `DERIVED` portfolio-equity formula (declared
  `formula_version`, provenance) while the owner gap stays typed.

Status 2026-09-03: `INTEGRATION_COMPLETE` except the owner decision —
`PAPER_DNSE_VNM` taxonomy remains `OWNER_DECISION_PENDING` (Bobby), with
strict cross-profile rejection retained and pinned by the lineage negatives.
Delivered: (1) lineage observability — the guard counts rejects by
missing-parent class; the counts ride the paper-read capability
(`lineage_rejects`, additive) and the projection snapshot envelope, so the
R0 projection-inspect operator view sees them; (2) the window ladder for
time-series relations — each refresh merges the previous committed window
(dedup by row id, 30 d horizon, 5,000-row cap, ascending), the relation
envelope declares `window {days, max_rows, basis, truncated}`, and the
served snapshot stays one atomic read (no second table, no restore-parity
delta); transactional delta/journal ingestion stays a P4-E edge item;
(3) F7 — `portfolio-equity-derived.v1`: a portfolio subject's equity series
is the exact-decimal forward-filled sum of member-account equity, points
begin only when every member has reported, single-currency only (no FX
mixing), authority `DERIVED`, while `manager.portfolio_equity` stays typed
rejected.

##### P4-E — Production streaming configuration and promotion (config + release)

- configuration matrix (dev measured → production target), each row a named
  env with owner and rollback:
  `EDGE_MANAGER_PROJECTION_POLL_INTERVAL_MS` 60000 → per-class (1–5 s
  transactional delta poll, 5–15 s account-state, 30–60 s metadata);
  `EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS` 15000 → replaced by edge
  journal push/tail (SGP pull remains reconciliation fallback);
  `EDGE_MANAGER_SHARED_CACHE_TTL_MS` 750 → validated under load;
  manager-lists 5 s constant → envelope budget (P4-C);
  `EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS` 300000 → per-class ceilings;
  SSE heartbeat/queue/eviction bounds re-proven at target rates;
- load/soak evidence per §8 (ingestion cadence, not tab count, drives source
  traffic; SSE fan-out at N tabs; delta coalescing verified);
- then the unchanged N36/Phase 3 release train: Bobby dev review → protected
  `dev` merge → signed `main` images. No new release mechanism.

Status 2026-09-03: `CONFIG_MATRIX_PUBLISHED / PRODUCTION_ACTIVATION_NOT_
AUTHORIZED` — the full matrix (dev measured → production target, owner,
rollback per row), the P4-C client budgets and the measured dev load table
(20-way concurrency per route + 10-stream SSE fan-out hold) are published in
`deploy/execution-phase4/production-streaming-config.md`. Remaining before
GO, named there: Rust per-class poll ceilings + journal push/tail, a soak at
target cadence, the F17 chain on a real eligible evidence run, and Bobby's
taxonomy decision + visual review + release train. Production flags remain
untouched; command relay and Live mutation stay false.

New finding F18 (named, non-blocking): under heavy host load, two concurrent
`POST /governance/approvals` with the same request key can race the
unique-violation re-read before the winner commits and return a typed 409
(`REQUEST_KEY_PAYLOAD_CONFLICT`) instead of the replayed 201 — fail-closed
and retry-safe, observed once in a loaded gate run and unreproducible in
three unloaded rounds (4/4 each). Fix direction: retry the replay lookup
once after a short backoff inside the 23505/40001 branch.

##### Phase 4 evidence and exit gate

Per §8 classes: contract parity for every new/changed envelope field
(freshness budget, reject counters, portfolio list, per-capability series);
fresh-PG migration/restore where warm-history tables land; negative tests for
profile taxonomy (a DNSE parent must never enter `PAPER_BINANCE_USDM`);
frontend unit + boundary + console gates; authenticated real-data browser
journeys re-run for Portfolio (real id), Alpha 360 tiles (real charts),
Fleet (FRESH within budget, motion on), Blotter and Command Center;
formatting rule covered by unit tests and applied across screens in one pass.

**Exit gate:** every F1–F10 row is closed or explicitly converted to a named
owner gap with an id; a coverage test proves every projected relation is
consumed by at least one screen or classified `AUDIT_ONLY/INTERNAL_ONLY`;
freshness chips reflect declared budgets; production configuration matrix is
applied on dev first with measured evidence. Phase 4 items follow §5
vocabulary; no bare DONE.

##### P4-0b — Full-flow authenticated sweep addendum (2026-09-02, second pass)

Bobby ordered a no-screen-left-behind sweep and, with Codex out of quota,
assigned the complete Phase 4 execution to Claude. A loopback ephemeral ADMIN
session (created and deleted inside one probe window, zero rows retained)
exercised every sidebar flow against the live dev BFF. New verified findings:

| # | Finding (flow) | Verified root cause | Layer |
|---|---|---|---|
| F11 | Orders are invisible EVERYWHERE (Blotter main table `orders:0`, Workbench Orders tab empty) while the projection holds 364 accepted orders | `source.orders` = `UNAVAILABLE · N22_ORDER_STATUS_NOT_ACCEPTED`: the real source vocabulary is `FILLED / CANCELED / RISK_REJECTED` (measured by SQL over the projection) while the Portal canonical union expects `CANCELLED / REJECTED`; the vocabulary guard fail-closes the whole branch on the first unknown word. Correct fix is adapter-level word mapping (`CANCELED→CANCELLED`, `RISK_REJECTED→REJECTED` with the source word preserved in a sub-field) and per-row quarantine for genuinely unknown words — never branch-wide refusal, never silent relabeling without provenance | TS adapter vocabulary |
| F12 | Command Center renders an empty shell | authenticated snapshot returns `needs_you/fleet/pinned/today = null` — the Phase 2 "activated" composition emits the envelope but populates no panel (governance/ops sources are empty AND the fleet/today panels are not joined to the fleet summary/journal that already exist) | TS composition |
| F13 | Workbench `workbench.analytics` = `UNAVAILABLE · ANALYTICS_IDENTIFIER_INVALID` | the workbench passes the composite deployment id in a form the analytics subject resolver rejects — identifier normalization bug at the BFF seam | TS |
| F14 | Blotter `blotter.exact-query` = `UNAVAILABLE · PHASE2_LOCAL_EXACT_QUERY_NOT_ACTIVE`; `page` cursors and `exact_total` null | the local exact-query/keyset/aggregate path is present but not activated on the dev runtime — flag/wiring gap despite the Phase 2 acceptance line | TS + config |
| F15 | Paper overview `paper.derived-insights` = `N25_DERIVED_ANALYTICS_NOT_ACTIVE` | the overview never switched to the local analytics service that already computes these series (`FEATURE_EXECUTION_ANALYTICS_QUERY=true`) | TS wiring |
| F16 | Workbench observation gate `PARTIAL · PHASE2_OBSERVATION_POLICY_NOT_PUBLISHED` | Portal-control owns this policy record and has simply never published one; a versioned observation policy (days/trades thresholds per stage) unlocks the gate panel and the exit-review criteria chain | Portal-control data |
| F17 | Governance/operations flows all zero rows (Inbox, R1/R2/LIVE, Waivers, Exit Reviews, Operations Queue, Incidents) | truthful emptiness: no lifecycle records exist yet. The write path exists (`POST /governance/approvals` and the decision plane are live code); nothing has ever created real records on dev. Operations/incident records additionally need their declared feed (command journal, R0 receipts, reconciliation findings) joined into Portal ops records | lifecycle data + TS joins |

Confirmed healthy in the same sweep (no action): Sandbox overview (35 real
deployments), Live overview (truthful empty), Account/Broker 360 now returns a
real composed `partial` document with 9 capability branches, Fleet/Bindings
lists 200 with real rows, command tasks 24 = 4 `CONNECTED` + 13 inactive + 7
incompatible, alpha analytics carries 15 `source_facts` families incl. 400-row
sessions/performance/equity/journal and one real equity chart series.

##### P4-F — Order-status vocabulary compatibility (closes F11)

Versioned word-map in the order adapter (source→canonical, provenance kept),
per-row quarantine counter for unknown words surfaced in the envelope, branch
state derived from surviving rows. Regression: Blotter table and Workbench
Orders tab render the 364 real orders with exact decimals.

Status 2026-09-02: `INTEGRATION_COMPLETE` — commits `92fd124` (normalize +
quarantine + envelope counters) and `7a04443` (shared versioned map
`order-status-map.v1`); verified on the rebuilt dev runtime: blotter serves
the full 364-order population with `status=REJECTED` /
`source_status=RISK_REJECTED` provenance.

##### P4-G — Seam activation set (closes F13, F14, F15)

Fix the workbench analytics identifier normalization; activate the local
exact-query/keyset/aggregate blotter plane (cursors, `exact_total`, per-ccy
aggregates over the committed projection); switch Paper overview insights to
the local analytics series. Each lands with contract test + authenticated
route test.

Status 2026-09-02: `INTEGRATION_COMPLETE` — F13 composite analytics ids admit
`:`-joined deployment identity (`7a04443`); F14 was a downstream casualty of
F11 (one RISK_REJECTED row erased the whole orders branch and with it
exact_total/aggregates) — closed by the same normalization and pinned by a
dedicated regression (`6b972b8`); F15 Paper overview now serves a versioned
`derived_insights` block (7-day order funnel + per-deployment cumulative
return, additive contract) computed from already-fetched relations
(`2f2ce9a`). Rebuilt dev runtime probe: `blotter.exact-query AVAILABLE`,
`exact_total=364`, real per-status aggregates, `kc1.` keyset cursors, and
`status_bucket=REJECTED` filters 316 rows through the canonical map.

##### P4-H — Command Center real composition (closes F12)

Populate `needs_you` (governance SLA + reconciliation findings + operational
alerts as published), `fleet` (per-stage counts from the fleet summary),
`today` (bounded journal window), `pinned` (user-owned store); bind the CC
container to the Phase 1 journal SSE. An empty ranked list with real zero
sources renders QUIET — as designed — but panels are never null.

Status 2026-09-02: `INTEGRATION_COMPLETE` — one atomic projection read now
feeds fleet health, a reconciliation-findings needs-you source and a bounded
24 h command-journal Today window (additive enum widening:
`EXECUTION_RECONCILIATION`/`EXECUTION_JOURNAL` sources, `RECONCILIATION`
triage kind, `JOURNAL_COMMAND` today kind). With the projection off, needs_you
honestly reports PARTIAL coverage instead of a false green. The product CC
container now passes a live EventSource factory and the bounded
`/command-center/realtime-snapshot` resume fetch, so the published stream
actually opens; fixing that path surfaced and closed a latent hook bug (an
inline `() => new Date()` default parameter in the effect dependency list
cycled the stream once per render). Real zeroes still render QUIET.

##### P4-I — Governance and operations lifecycle realness (closes F16, F17)

Publish the versioned observation policy (Portal-control record + gate
computation); verify the real create→R1→R2→conditions→exit chain end-to-end
on dev with Bobby's session (no seeded fakes — records created through the
product write path are real governance facts); join command journal + R0
receipts + reconciliation findings into the operations queue/incident records
per their existing contracts.


Status 2026-09-02 (F16): `INTEGRATION_COMPLETE` — Portal-control publishes
`execution.observation-policy.v1` (Paper: 30 observed days / 300 trades, the
reviewed hi-fi cast; 14 d is the canary trial's window, a different stage);
the workbench gate computes MET/NOT_MET on an unbounded window and an honest
PARTIAL (`N22_OBSERVATION_WINDOW_BOUNDED`) while the flat projection cap
truncates fills — the bound lifts with the P4-D window ladder. The panel
renders real progress against real targets. F17 continues below.

Status 2026-09-02 (F17): write-path liveness `VERIFIED / chain
EXTERNAL_EVIDENCE_PENDING` — the authenticated product write path is live on
dev end-to-end: origin policy, CSRF double-submit, session auth and payload
schema all passed, and `POST /governance/approvals` then refused the only
real research run with a typed 422 (`EVIDENCE_RUN_NOT_FOUND`/eligibility —
the run is QUEUED with no methodology claim and no artifact creator), with
zero rows persisted. Inbox/queue/waivers/history serve 200 with exact zero
totals — truthful emptiness, no seeded fakes. The end-to-end
create→R1→R2→conditions→exit chain closes the day a real COMPLETED evidence
run with a methodology claim exists; that external research-cell dependency
is the named remaining gate, carried into the P4-E release-evidence run.
The journal/receipt/finding joins landed at the Command Center (P4-H);
receipts already ride the operation contract (`relay_receipt`), and a
findings→incident feed stays a named non-blocking residual under P4-D/E.

##### Phase 4 goal-execution order (owner may set as one goal)

1. **P4-F + P4-G** — pure seam bugs; the fastest large data win (orders,
   blotter plane, workbench analytics, overview insights);
2. **P4-A + P4-B** — portfolio truth + per-capability tile binding + the
   `formatExact` display rule;
3. **P4-H** — Command Center composition + stream;
4. **P4-C** — freshness budgets + SSE coverage + delta coalescing;
5. **P4-I** — lifecycle realness for governance/operations flows;
6. **P4-D** — profile taxonomy (needs Bobby's decision on `PAPER_DNSE_VNM`),
   lineage counters, window ladder, DERIVED portfolio equity;
7. **P4-E** — production streaming configuration matrix, load evidence, then
   the unchanged release train.

**Assignment note (2026-09-02):** Bobby assigned the whole Phase 4 to Claude
(Codex quota exhausted); Claude follows this file's §5/§8/§9 discipline and
the existing commit/verification gates unchanged.

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
| BR-EX-55 | 2026-08-26 | Every Execution screen — breadcrumb tail and masthead names | Names come from a hardcoded fixture map (`av_2041 → Grid v2.1`) or from the screen id, which is how a list route showed a fixture entity in its breadcrumb; other ids render raw | Facts (read): `entity-names.v1` batch resolver — id → kind, label, sub, href, env for alpha/deployment/account/binding/portfolio/incident/approval/exit_review | PORTAL_PROJECTION over `strategies`/`alphas`, `strategy_deployments`, `accounts`, `venue_accounts`, `portfolios`, Portal-owned incidents/approvals/exit reviews | read-only · low (display only; ids stay the keys) | ≤50 ids per call; ETag cached | Portal registries and Portal-owned records; any viewer | unknown id → `label:null` → raw id, never invented | fixture `execution-entity-names.valid.json`; frontend breadcrumb tests per route | Codex | N09 | `RECEIVED` | `ExecutionPreviewRoute` entity map deleted on delivery | none | cross-screen; appendix A.55 |
| BR-EX-56 | 2026-08-26 | Live `/deployments/live` (entry screen WF 1f/1e) | No live overview: operator cannot see live capital Σ, session pnl, gross exposure, which deployment is fail-closed, ladder state, broker sync, per-deployment pulse and the live tape | Facts + aggregates (read): `live-overview.v1` — summary, KPI strip, filter/venue counts, rows (stage, venue·account·portfolio, alloc, exposure, session pnl live, dd, pulse 60m, health, note), tape (≤20 + SSE `live.tape`) | PORTAL_PROJECTION (allocations/exposure) · DERIVED (session pnl, pulse) · PORTAL_CONTROL (fail-closed, ladder, conditions) · BROKER (sync) · TRADING_SYSTEM (fills tape, tick) | read-only · high visibility: FAIL_CLOSED must never read READY; canary scale-up blocked while a sibling is fail-closed is a server rule shown as note | ≤50 rows; tape ≤20; tick ≤1/1.4s | BR-EX-43 tick; incidents/approvals/conditions (Portal); `strategy_deployments`, `positions_v2`, `execution_sessions`, `fills`, `broker_account_sync_snapshots` | route absent → unavailable; sync absent → health DEGRADED, never READY | fixture `execution-live-overview.valid.json`; health-state rule tests; frontend `liveOverview.test` | Codex | N09 · N08 (tape) · N11 | `RECEIVED` | `LiveOverview` — smoke `live.smoke.ts` deleted on delivery | none until approved | hi-fi "Live Overview (entry)"; appendix A.56 |
| BR-EX-57 | 2026-08-26 | Live Full Operations `/deployments/live/{id}` | Hi-fi 1f masthead/meta/lifecycle strip, 5-cell KPI, broker & reconciliation truth (incl. mismatch object), open exposure table, protective ladder + last operation, 30d contribution bars are not in v1 | Additive fields on `live-full.v1` → v1.1 (BR-EX-57) | as v1 + DERIVED contrib.v1 | read-only (actions unchanged, ADMIN step-up) | 1 deployment; positions ≤200; bars 30 | existing contract; decision ids | missing → v1 rendering | fixture update; lifecycle decision-id consistency; frontend `liveFull.test` | Codex | N09 · N10 | `RECEIVED` | `LiveFullOperationsScreen` — `live.smoke.ts.full` deleted on delivery | none | hi-fi "Live Full Operations (WF 1f)"; appendix A.57 |
| BR-EX-58 | 2026-08-26 | Stage workbenches (Paper/Sandbox/Canary/Live) — Guard rail | Blocker codes arrive raw from 3–4 sources; no human label, owner, since, resolution link or ordering — the rail reads as a log dump | Facts (read): `blocker-catalog.v1` (code → label, severity, owner, resolves_via href template, doc, rank) + stage contracts carry `blockers[{code, since, source, ref}]` instead of bare `blockerCodes[]` | PORTAL_CONTROL (catalog, Portal-owned) · each source keeps its codes | read-only · low | ≤200 codes; ETag | Portal blocker catalogue; any viewer | code missing from catalog → raw code shown, never invented | fixture `execution-blocker-catalog.valid.json`; all stage-fixture codes ∈ catalog test | Codex | N09 | `RECEIVED` | `ExecutionContextRail` blockers | none | appendix L.7 |
| BR-EX-59 | 2026-08-26 | Canary Control Room `/deployments/live/{id}/canary` | Hi-fi 1e masthead (trial day, exit-review countdown, GUARDED/DEGRADED), lineage + lifecycle strips, 5-cell KPI, live-vs-paper-vs-backtest lines on one digest, envelope bars with at-cap, positions with ACK latency, incidents/recon, 14-day trial timeline with recorded checkpoints, exit-readiness gates (server mirror), marginal contribution, promotion decision options are not in v1 | Additive fields on `canary-control-room.v1` → v1.1 (BR-EX-59) | PORTAL_CONTROL (trial, gates, checkpoints, decision) · DERIVED (equity_projection.v1, marginal.v1) · TRADING_SYSTEM (positions, orders, ack) · BROKER (sync) | read-only + existing governed actions · high: "elapsed time alone never promotes" — gates are server-enforced, screen mirrors | 1 deployment; 3 series ≤400 pts; timeline ≤30 days | existing contract; approvals/conditions; exit reviews; paper twin dep_94; backtest run | missing → v1 rendering; sync STALE → readiness DEGRADED + scale blocked | fixture update; gate-mirror + timeline consistency tests; frontend `canary.test` | Codex | N09 · N10 | `RECEIVED` | `CanaryControlRoomScreen` — smoke `canary.smoke.ts` deleted on delivery | none | hi-fi "Canary Control Room (WF 1e)"; appendix A.59 |
| BR-EX-60 | 2026-08-28 | Sandbox `/deployments/sandbox` (entry screen WF 1d) | No sandbox overview: operator cannot see what is in certification, how far each deployment got, which step is holding it, whether a certification has been stalled for weeks, testnet order-journal counts, venue connectivity baselines, or what has been certified in the last 90d | Facts + aggregates (read): `sandbox-overview.v1` — summary, KPI strip (in certification, halted by finding vs by operator, open findings with worst severity, test-fund equity flagged `enters_portfolio_nav:false`, broker sync age vs policy), rows (alpha·deployment, venue·account, portfolio → target + pending approval, seven `certification.steps[]` with `passed`/`current_step`, runtime_state + halt_reason, `in_stage_days` + `stalled`, next_step with action_key + blocker_codes, lineage r1/r2/paper_exit, note), 7d order journal per deployment (orders/filled/rejected/expired/success_pct exact) + normalized executed order types with `required`/`certified` + reject reasons, 24h connectivity (ACK/fill p50-p95, ws reconnects, rate-limit hits, baseline vs SLO rule), recently certified 90d with promotion target | PORTAL_PROJECTION over `strategy_deployments(mode='sandbox')` ⋈ `accounts` ⋈ `venue_accounts` ⋈ `portfolio_allocations`; certification state from the PORTAL certification machine (overview re-reads, never recomputes); `orders`/`fills`/`domain_events` TRADING_SYSTEM; `broker_account_sync_current_state` BROKER; DERIVED success_pct/latency | read-only · medium: test-fund equity must never enter portfolio NAV, and a stalled certification must surface rather than expire silently | ≤50 deployments in certification; journal window 7d exact counts; connectivity 24h; as_of per second | registry feature `SANDBOX_TRADING` (screen still `data_mode: NONE` — codex flips it on delivery); BR-EX-43 alerts summary | source unreadable → `panel_state: "unavailable"` per branch, never an empty array read as clean; `runtime_state` absent stays null (screen renders "runtime not stated") | fixture `execution-sandbox-overview.valid.json`; tests: `passed == count(PASS)`, `current_step` = first non-PASS, `success_pct == filled/orders` exact, `test_fund_equity.enters_portfolio_nav == false` and absent from every portfolio NAV, `stalled ⇒ meta.stalled_rule != null`; frontend `sandbox.test` | Codex | N09 (Portal projection) · N10 (derivations) · N11 (order/fill adapters) | `RECEIVED` | `SandboxOverview` — smoke `sandbox.smoke.ts` (overview half) deleted on delivery | none until approved | hi-fi "Sandbox Overview (entry for WF 1d)"; **full spec §7.4.2**; UI rationale appendix O.2 |
| BR-EX-61 | 2026-08-28 | Sandbox Certification `/deployments/sandbox/{id}` (WF 1d) | v1 publishes steps, findings, source panels, promotion plans and timeline, but not what the hi-fi workbench decides on: identity + credential status, broker REST freshness vs policy, the internal/broker/difference triptych as an authoritative diff, findings rows with local/broker values and the action each one takes, order-type certification (including the types the alpha requires in production but has never exercised), execution quality with INSUFFICIENT_DATA, the bounded smoke plan, the cleanup checklist, the four actions with their blockers, and the peers in certification | Additive fields on `sandbox-certification.v1` → v1.1: `identity`, `broker_freshness`, `reconciliation_view{internal,broker,difference}` (diff.v1, server-computed), `findings_rows[]`, `order_type_certification{rows[],blocking,blocking_rule}`, `execution_quality` (ack/fill p50-p95, slippage state, reject rate), `smoke_plan` (bounded: qty, capital cap, timebox, on_expiry, approved_by, state), `cleanup{rows[],exit_rule}`, `actions[]{key,label,enabled,risk_tier,blocker_codes}`, `peers[]`; plus command routes `sandbox.broker_sync` / `sandbox.reconcile_dry_run` / `sandbox.smoke_open` / `sandbox.request_exit_review` as plan → apply → verify | PORTAL_CONTROL (certification machine, smoke plan, command policy) · BROKER (`broker_account_sync_current_state`) · TRADING_SYSTEM (`orders`, `fills`, `positions_v2`, `order_pending_exposure`, `domain_events`) · DERIVED (diff.v1, execution_quality.v1) | read + four governed mutations (ADMIN step-up) · high: certification is the gate before real capital — `enabled:true` must be a deliberate decision, fail-closed by default | 1 deployment/screen; findings ≤200 keyset; peers ≤20 | existing `sandbox-certification.v1` (additive, no field retyped); BR-EX-58 blocker catalog; BR-EX-41 stage telemetry | any missing branch → v1 rendering; broker STALE / CRITICAL finding / cleanup pending ⇒ smoke + exit actions disabled with codes; slippage under min samples ⇒ INSUFFICIENT_DATA, never 0 | fixtures `execution-sandbox-certification.dep_77.v1_1.valid.json` + `.dep_91.v1_1.valid.json` (CRITICAL branch); tests: CRITICAL OPEN ⇒ recon step FAIL + smoke BLOCKED + `actions[smoke_open].enabled==false` with non-empty codes; `slippage.state=='INSUFFICIENT_DATA'` carries no `value`; a `required:true` order type not CERTIFIED ⇒ `progress.eligible==false`; v1 suite re-runs unchanged; frontend `sandbox.test` | Codex | N09 · N10 · N11 · N13 (activation for the four actions) | `RECEIVED` | `SandboxCertificationScreen` — smoke `sandbox.smoke.ts` (certification half) deleted on delivery | four `sandbox.*` actions are activation-gated (ADMIN step-up, plan → apply → verify) | hi-fi "Sandbox Certification (WF 1d)"; **full spec §7.4.3**, decisions §7.4.6; UI rationale appendix O.3 · O.5 |
| BR-EX-62 | 2026-08-28 | Paper Workbench `/deployments/paper/:id` and its VN variant `…/vn-market` (WF 1c · 4h) | The contract publishes the figures but not the drawing: no equity band against the approved run, no candle overlay with order/fill markers, no rolling-correlation series, no venue session shading, and no way to reach the other deployments in paper without already being on one | Additive on `paper-workbench.v1` → v1.1: `peers[]`, `equity_band` (backtest + paper + ±1σ band, joined by artifact digest, with the drawdown annotation), `order_markers` (venue OHLC + BUY/SELL/FILL markers each carrying its order/fill id), `correlation_series` (`corr.v1` vs portfolio and benchmark), `session_shading` (venue closed windows and the frozen-at instant), `report{available,reason}`; plus new `GET /api/v1/execution/paper` → `paper-list.v1` | DERIVED (`equity_projection.v1`, `corr.v1`) · TRADING_SYSTEM (candles, orders, fills) · PORTAL_PROJECTION (peers, gate) · venue calendar | read-only · medium: a backtest joined to a paper series by anything but the artifact digest is the exact failure this panel exists to expose | ≤20 deployments in paper; band and correlation ≤720 pts; candles 120–500; markers ≤500/window; freshness = the projection's own `as_of`, paused against the venue calendar | existing `paper-workbench.v1`; `venues.trading_sessions`; BR-EX-41 stage telemetry; same OHLC question as BR-EX-50 | a missing branch renders the honest state the screen already has; no series ⇒ the panel says so and the KPI strip stands alone; a closed window is published, never inferred from missing points | fixtures `execution-paper-list.valid.json`, `execution-paper-workbench.dep_74.v1_1.valid.json`, `…dep_102.v1_1.valid.json`; tests §7.5.4 (1)–(5); frontend `paper.test`, `vnm.test`, `paperMatrix.test` re-run unchanged | Codex | N09 (projection) · N10 (derivations) · N11 (candles/journal) | `RECEIVED` | `PaperWorkbench` — smoke `paper.smoke.ts` (workbench half) deleted on delivery | none until approved | hi-fi "Paper Workbench (WF 1c)" + "Paper Workbench VNM (WF 4h)"; **full spec §7.5.1**, decisions §7.5.5 |
| BR-EX-63 | 2026-08-28 | Paper Exit Review `/governance/exit-reviews/:id` (WF 4b) | The review shows the evidence but not the pack it was read from, and offers no reviewer note — so the sentence a reviewer wants recorded beside their decision has nowhere to go | Additive on `paper-exit-review.v1` → v1.1: `evidence_pack{pack_id,digest,href,built_at}` and `reviewer_note{supported,max_length,recorded_with_decision,value}` | PORTAL_CONTROL | read + the existing decision write · medium: a note the reviewer believes was saved and was not is worse than no field | 1 review/screen; note ≤2,000 chars | existing contract | note unsupported ⇒ the field is not rendered rather than rendered and dropped; the digest a review decided against never changes when the pack is rebuilt | fixture update; tests §7.5.4 (6)(7); frontend `paperExit.test` re-run unchanged | Codex | N09 | `RECEIVED` | `PaperExitReview` — smoke `paper.smoke.ts` (exit half) deleted on delivery | none | hi-fi "Paper Exit Review (WF 4b)"; **full spec §7.5.2**, decisions §7.5.5 |
| BR-EX-64 | 2026-08-28 | Cross-screen — every charted series (Paper 62 · Replay 50 · Live 56/57 · Canary 59 · stage telemetry 41) | The chart rules were being written once per appendix and drifting: pre-scaled coordinates instead of points, totals that disagree with their bars, markers with no journal id, annotations floating off their day, lines interpolated through closed venues | One shared schema fragment `chart-series.rules.v1` ($ref-ed by every charted series): numeric points + ISO UTC timestamps; exact-decimal money; explicit gaps for closed venues; printed totals equal exact sums; every marker carries its journal id; annotations equal the series value at their bucket; caps + extrema-preserving downsample declared; tooltip provenance (authority · as_of · formula_version) required; multi-stage overlays share one `join_digest`; one owner for OHLC | rules bind each series' own authority (PORTAL_PROJECTION / TRADING_SYSTEM / BROKER / DERIVED) | read-only · medium: these are the honesty rules — a chart that disagrees with its caption is worse than no chart | no new endpoints; caps per BR-EX-41 | BR-EX-41/50/56/57/59/62; decision §7.5.5(1) (OHLC owner) escalated — two screens block on it | a series failing a rule fails schema validation, never gets repaired by the portal | fixture linter over every charted `execution-*` fixture; sum/annotation/marker-id/digest/gap checks per §7.6.4; frontend renders each canonical fixture through `marketChart` | Codex | N10 (schema fragment) · N09/N11 (producers) | `RECEIVED` | `components/marketChart.tsx` (CandlesChart · LinesChart · BarsChart) — smoke generators in `paper.smoke.ts`/`canary.smoke.ts` are the reference fixtures, deleted with their parent rows | none | **full spec §7.6**; amendments to 57/59/62 in §7.6.2 |
| BR-EX-65 | 2026-08-29 | Portfolio 360 `/deployments/portfolios/{id}` — Structure & Correlation, corr.v1 disclosure | The published correlation contract is a point-in-time matrix: the operator cannot see *when* correlation rose or whether alphas draw down together — the two questions the matrix exists to answer; both frames ship as labeled smoke since 2026-08-28 | Two read series under `chart-series.rules.v1` (§7.6.1): `rho-timeline` — rolling ρ(portfolio NAV, benchmark NAV), window/interval server-chosen (30d/1d today), points `[t, rho]`, server publishes `threshold` (0.6 today, config — never client-hardcoded) and `breaches[]` (from/to/peak) for sustained ρ > threshold (the breach raises the attention finding — the browser draws, never detects); `drawdown-overlap` — per-alpha episodes as intervals `{from,to,depth_pct}` (peak-to-recovery, exact decimal), never a resampled line, per-alpha `INSUFFICIENT_DATA` with days observed, `joint_windows[]` (≥2 alphas in drawdown, server-derived) each optionally carrying `regime_label` under its own `regime.v1` formula — label absent = absent, never inferred | DERIVED (`corr.v1` over NAV snapshots · `drawdown_overlap.v1` · optional `regime.v1`) · threshold `PORTAL_CONTROL` config | read-only · medium: a mis-derived joint window claims a diversification failure that did not happen — episode boundaries are server truth, the browser never intersects intervals | ρ ≤400 pts/window; episodes ≤40 per alpha·window; alphas ≤20; joint windows ≤10; freshness = as_of of the NAV snapshot join | NAV series from BR-EX-34's engines (closed N10 — **this row is new scope: 34 shipped equity/drawdown/approved-band only and is not reopened**); benchmark id from BR-EX-51; rules fragment BR-EX-64 | series absent → the panel returns to its honest "not published" state (the pre-2026-08-28 code path is kept); partial coverage → per-alpha INSUFFICIENT_DATA rows, never dropped | fixtures `execution-portfolio-360.rho-timeline.valid.json` / `.drawdown-overlap.valid.json`; rule-6 equality on breach peaks; from ≤ to and depth < 0 per episode; every joint window ⊆ union of member episodes; frontend renders both through `marketChart` (`LinesChart` thresholdLine · `EpisodesChart`) | Codex | N10 (derivations) · N09 (projection route) | `RECEIVED` | `PortfolioThreeSixty` corr.v1 disclosure + structure panels — smoke `PF_CHARTS.rho`/`PF_CHARTS.ddOverlap` in `portfolio360.smoke.ts` are the reference fixtures, deleted on delivery | none until approved | corrects §7.6.6(1) — these series live here, not in closed BR-EX-34; full spec §7.7; BR-EX-51/64 |
| BR-EX-66 | 2026-08-29 | Portfolio 360 header — `Rebalance plan ▾` · `Report pack` | Allocation changes go through the Admin Action Drawer with no portfolio-scoped plan preview, and report assembly is manual; since 2026-08-28 both header controls are live and open plan previews whose Apply/Generate buttons are disabled awaiting exactly this route | `rebalance-plan`: POST plan (dry-run — echoes the preview's KV grid: operation · targets per alpha alloc from→to as exact decimals · writes = capital-ledger entries only, positions move only by the deployments' own orders · governance = ADMIN step-up + dual approval; returns plan_id + digest + TTL) · POST apply (plan_id + step-up token → operation_id in the ops queue; PARTIAL never renders green) · GET verify (operation_id → per-entry applied/failed + post-state digest). `report-pack`: POST generate (window + section list: live strip/KPIs · equity vs benchmark by era · matrix + influence · drawdown overlap · ledger window · approvals — each section pinned to the digest it was read at) → artifact id; GET status/download | rebalance `PORTAL_CONTROL` command (ledger writes, approvals); report assembly `PORTAL_PROJECTION` read-only over published contracts | WRITE (rebalance) · high: a mis-applied plan moves real capital allocation — step-up, dual approval and verify are the row, not decoration; report-pack read-only · low | plan ≤20 target lines; report ≤8 sections, artifact ≤20MB; TTL/step-up per command catalogue revision 2 (handoff §8.8) | BR-EX-51 (`portfolio-360.v1.1` fields echoed in the plan); command catalogue rev 2; approvals BR-EX-30/35; what-if `marginal.v1` — targets seeded from it stay labeled estimates | plan expired → typed 409, re-plan; apply without step-up → typed 403; verify PARTIAL → chip + per-entry list, never green; report section failure → typed error naming the section | plan/apply/verify state-machine tests incl. expiry and dual-approval negatives; apply idempotent by plan digest; report digest-pinning test (section digest ≠ live digest → marked stale-at-generation); frontend button coverage exists in `analytics360.test` | Codex | N12 (commands) · N09 | `RECEIVED` | the two header controls + preview panels in `PortfolioThreeSixty` (commit 9709679) — `Apply`/`Generate` are the single enable points | **command — activation gated on Bobby approval + operational evidence, separately from every read row** | BR-EX-51 ("actions later" resolves here); full spec §7.8 |
| BR-EX-67 | 2026-08-30 | Gate R1 `/governance/approvals/{id}/r1` · Gate R2 `/governance/approvals/{id}/r2` | The reviewer decides against panels the contracts do not publish: R1's evidence charts (equity across window roles, WFO Sharpe per fold) and R2's portfolio fit, gate-criteria verdicts and stage-eligibility chips ship as labeled smoke since 2026-08-30 — and the hi-fi's own backend note says criteria are POLICY DATA, never UI constants | Additive fields: `governance.r1-review.v1` gains `evidence_series` (window-role equity — per-role point arrays IS/OOS/holdout with role boundaries fixed by the methodology claim, plus `wfo_folds[]` with per-fold Sharpe, threshold, median/min/dispersion — all under `chart-series.rules.v1`) and `gate_policy_ref` (`gate_r1` rev + effective date + registry link); `governance.r2-review.v1` gains `portfolio_fit` (target weight, corr estimate + window + formula, marginal risk, diversification benefit, symbol overlap — labeled research estimates), `gate_criteria[]` (criterion · threshold from the versioned `gate_r2` policy rev · observed from the evidence run · **server-computed verdict** PASS/WAIVERABLE/FAIL · note) and `stage_eligibility[]` (stage · eligible/needs · detail — each derived from that stage's gate policy against today's evidence) | evidence series `RESEARCH` (run digest); thresholds/verdicts/eligibility `PORTAL_CONTROL` policy records (admin-declared, versioned — a rev change re-evaluates open requests); fit estimates `DERIVED` (`corr.v1`, `marginal.v1`) | read-only · medium: a browser-derived verdict would let a stale policy rev approve capital — verdicts are computed server-side only | R1 series ≤400 pts/role · folds ≤64; R2 criteria ≤20 · stages ≤6; freshness = evidence run as_of + policy rev effective date | `governance.r1-review.v1`/`r2-review.v1` (N09, delivered) · `chart-series.rules.v1` (BR-EX-64) · gate policy registry (new, PORTAL_CONTROL) | fields absent → panels return to honest not-published states (pre-2026-08-30 code paths kept); a criterion whose policy rev no longer matches the open request → verdict STALE_POLICY, never silently re-evaluated client-side | schema + canonical fixtures (`execution-governance.r1-review` gains evidence_series variant; `.r2-review` gains criteria/fit/stages variant); rule-6 check on the max-DD annotation; verdict-recompute negative (client hash of policy rev must match); frontend `governanceChain.test` renders both | Codex | N09 (payload) · N10 (series rules) | `RECEIVED` | `GateR1Review` evidence slot + checklist policy chip · `GateR2Review` Gate criteria tab + Portfolio fit + stage chips — smoke `governance.smoke.ts` deleted on delivery | none until approved | hi-fi 1a/1b owner copies 2026-08-30 (Gate criteria + Stage eligibility are new vs the disk corpus); full spec §7.9 |
| BR-EX-68 | 2026-08-30 | Admin Action Drawer `/administration/actions` | The owner's WF 1i hi-fi (CLI catalog, 2026-08-30) turns the drawer from a read-only listing into the operator's command surface: six task groups × 24 curated commands, registry-picked parameters, a read path that streams transcripts, and PLAN → APPLY (step-up) → VERIFY with a two-man-rule admin key for OPERATOR actors. All interaction ships as a declared demo (`adminCli.smoke.ts`) because catalogue rev 2 publishes relay `DISABLED` + `portal_reachable: false` on all 64 entries | (1) operator-task catalog: additive `task_group` + `task_title` + `cli_form` + `params[]` (`{key, source_registry, constraint}`) on `execution.command-catalog` entries, or a parallel `execution.command-tasks.v1` keyed by the same `noun/verb`; (2) read execution: `POST /commands/{key}/run` (R0 only, no step-up) returning verbatim transcript lines + exit code; (3) mutation flow: `POST /commands/{key}/plan` → plan id, TTL, preflight rows (server-side checks incl. approval ref, expected revision, concentration warn), `POST /plans/{id}/apply` (step-up enforced; DANGER requires typed confirm word) → operation id, `GET /operations/{id}/verify` timeline (202-not-success semantics, VERIFIED/PARTIAL terminal, residue rows); (4) two-man rule: `POST /plans/{id}/key-request` → admin-issued single-use key bound to the plan, TTL, audit row | catalog `PORTAL_CONTROL`; transcripts/preflight/verify `EXECUTION` (authoritative ACKs only — 202 is never success); grants `PORTAL_CONTROL` audit | mutations up to R4 — the entire reason the relay is DISABLED today; two-man rule + step-up + typed confirm words are the containment; read path R0 only | catalog ≤64 tasks · params ≤8/command · transcript ≤200 lines · preflight ≤10 rows · verify ≤20 rows | `execution.command-catalog` rev 2 (delivered, EX-BE-05b/F0) · F0 plan endpoint (refusal semantics stay for unreachable keys) · step-up (U07) | relay stays DISABLED → drawer stays a declared demo (current state); a key without `task_group` renders under the server group as today; PARTIAL never renders green; a plan whose TTL expired is a refusal, not a retry | schema + fixtures per endpoint; verify-timeline fixture for VERIFIED and PARTIAL; grant lifecycle fixture (request → issue → expiry); frontend `adminCli.test.tsx` (28 cases) is the interaction reference | Codex | EX-BE-05b/F0 (catalogue) · U07 step-up | `INTEGRATION_COMPLETE / SOURCE_COMMAND_DARK` | `AdminActionDrawer` WF 1i drawer — smoke `adminCli.smoke.ts` deleted on delivery | none until approved | hi-fi WF 1i owner copy 2026-08-30; full spec §7.10 |
| BR-EX-69 | 2026-08-30 | New approval request `/governance/approvals/new` | The loop had no entry UI: the Inbox reviews requests nothing in the portal can create. The owner-commissioned entry screen ships as a declared demo (`NEW_REQUEST` smoke) — registry-picked alpha/run/claim, required summary, SoD + SLA preview | `POST /api/v1/execution/approvals` `{ gate: "R1", alpha_id, evidence_run_id, methodology_claim_id, summary }` → PENDING approval row (id, SLA start, artifact digest pinned from the run); pick lists served from existing registries (alphas, run library, claims); typed 422 per missing field; requester recorded for SoD (can never approve own row) | `PORTAL_CONTROL` (governance write) | write · low-medium: creates review work, never capital — SoD + R1 gate contain it | pick lists ≤200 alphas / ≤500 runs (cursor); summary ≤2,000 chars | approvals store (BR-EX-30/35 stream) · run library registry | endpoint absent → screen stays a declared demo with its exact copy; duplicate open request for same alpha+run → typed 409 pointing at the existing row | create → row appears in inbox fixture; SoD negative (requester approve → 403); duplicate 409 | Codex | N09 | `INTEGRATION_COMPLETE` | `NewApprovalRequestScreen` — smoke `NEW_REQUEST` deleted on delivery | none until approved | ROADMAP §H.2.1; spec §7.11.1 |
| BR-EX-70 | 2026-08-30 | Gate LIVE review `/governance/approvals/{id}/live` | LIVE_GATE rows reviewed real-money promotion on the R2 capital composition; the new review room needs the canary evidence it actually rests on — today those panels are declared smoke (`LIVE_GATE` frames) over the r2-review backbone | `governance.live-review.v1` (or additive on r2-review for gate LIVE_GATE): `canary_ref` (deployment, window from/to, twin deployment), `kpis` (fills, reject rate, fill_delta_bp, slippage p95 vs model, envelope_breaches, incidents), `drift_series` (canary vs paper twin under `chart-series.rules.v1`), `gate_criteria[]` vs versioned `gate_live` policy (server-computed verdicts — same rule as BR-EX-67), `capital_step` (current, step, target, ledger movement) | evidence `EXECUTION` (canary telemetry) · criteria/policy `PORTAL_CONTROL` · drift `DERIVED` (`drift.v1`) | read-only · high leverage: this is the last gate before live capital — verdicts server-side only | drift ≤400 pts · criteria ≤20 · kpis ≤12 | r2-review (backbone, delivered) · canary telemetry (BR-EX-57/59 family) · `chart-series.rules.v1` (BR-EX-64) · gate policy registry (BR-EX-67) | payload absent → panels stay declared smoke with honest copy; backbone still real (eligibility/quorum/SLA/decide against r2-review) | schema+fixture; verdict-recompute negative; frontend `governanceAdditions.test` renders it | Codex | N09 · N10 | `INTEGRATION_COMPLETE` | `GateLiveReview` — smoke `LIVE_GATE` deleted on delivery | none until approved | ROADMAP §H.2.2; spec §7.11.2 |
| BR-EX-71 | 2026-08-30 | Waivers & Conditions `/governance/waivers` | Conditions are created at R1/R2 and resurface only on their own deployment's exit review — no surface answers "what does the fund owe fleet-wide, and what expires next"; the register ships as declared smoke (`WAIVER_ROWS`) mirroring the cast's existing conditions | `governance.conditions-register.v1`: keyset list of `{ condition_id, text, source { approval_id, gate }, deployment_id?, stage, due { kind: CLOCK\|EVENT\|POLICY, at?/event?/policy_rev? }, state OPEN\|WAIVED\|SATISFIED\|EXPIRING\|LAPSED, owner, created_at }`; server-side filters (state, stage, owner, deployment); counts per state; EXPIRING/LAPSED are SERVER transitions feeding the CC attention stream (BR-EX-43) | `PORTAL_CONTROL` (governance records) | read-only · medium: a lapsed condition quietly missing is a governance failure — LAPSED is a blocking finding, never a default | ≤500 open conditions · keyset 50/page | approvals + exit-review condition stores · CC attention (BR-EX-43) | endpoint absent → register stays declared smoke; filters stay client-side over demo rows and say so | schema+fixtures incl. one row per state; lapse transition fixture; frontend `governanceAdditions.test` | Codex | N09 | `INTEGRATION_COMPLETE` | `WaiversRegisterScreen` — smoke `WAIVER_ROWS` deleted on delivery | none until approved | ROADMAP §H.2.3; spec §7.11.3 |
| BR-EX-72 | 2026-08-31 | Alpha Fleet `/deployments/alphas`; Accounts & Bindings `/deployments/accounts` + `?binding=`; Gate LIVE fixture; Portal registry | N29-FE-01 proved the product consumer path, but the two entry screens remained typed unavailable, two test doubles composed Live Review independently, and registry delivery metadata did not describe the same-origin BFF product | One freeze-sanctioned package: bounded keyset `execution.alpha-fleet-list.v1`; bounded keyset `execution.bindings-list.v1`; narrow `execution.binding-detail.v1`; canonical schema-validated `governance.live-review.v1` fixture consumed by both doubles; additive registry revision with New Approval, Gate LIVE and Waivers screens plus Waivers navigation and truthful delivery metadata | Fleet/bindings `PORTAL_PROJECTION` over current qualified source + `PORTAL_CONTROL`; Live Review `PORTAL_CONTROL` + current Live profile; registry `PORTAL_CONTROL` | read-only except already-published approval creation; medium because binding state and stage routing stay server-owned; no credential material | list limit ≤50, server keyset/filter/sort and exact counts; binding detail is one binding with bounded accounts; freshness/as_of/completeness explicit | N19 compatibility authority, N21 admission, N24 projection, N28 MC-05 typed gap, N29 same-origin consumer | source population absent → honest empty; source invalid/incomplete → typed fail-closed; MC-05 branches remain unavailable; registry metadata never grants runtime authority | schema/OpenAPI/generated types; 28-file/253-test fresh-PG repository/API isolation; exact mapping/source-boundary tests; canonical fixture drift test; registry revision 6 source/public-fixture parity; 1,785-test frontend same-origin suite and clean production build | Codex + Claude consumer parity | N29 closeout amendment follow-up | `INTEGRATION_COMPLETE` | Product renders Fleet/Bindings through same-origin BFF; both doubles consume one canonical fixture; no fixture producer leaks into the product graph | `N29-BE-72` resolved; no source/command/runtime activation; only `N29-REL-01` remains | `CLAUDE_TO_CODEX_N29_CONSOLIDATED_BACKEND_REQUEST.md`; `EX_BE_33_BR_EX_72_MANAGER_LISTS_REGISTRY_CLOSEOUT.md` |
| BR-EX-73 | 2026-09-01 | Alpha Fleet `/deployments/alphas` | The v1 Fleet contract populated only strategy/deployment identity, leaving the reviewed operational composition mostly empty; an initial all-profile refresh also exceeded the shared N21 15 r/s admission budget | Additive `execution.alpha-fleet-list.v2`: combine accepted Paper/Sandbox/Live profiles; current owner, portfolios, allocations, all balances, position PnL/exposure, reconciliation health and multi-stage membership; preserve the rich composition; batch profiles through shared source admission | source facts `TRADING_SYSTEM`; durable/query projection `PORTAL_PROJECTION` | read-only · medium; exact decimal values remain separated by currency, browser never aggregates capital | ≤50 rows/page; source pages bounded by existing BR-EX-72 drain; Paper → Sandbox → Live profile batches; stale committed snapshot served while one refresh is coalesced | BR-EX-72 base routes; N19 current-source compatibility; N21 shared admission; N24 durable projection | source row absent → typed empty; historical 30d selector absent → panel-local `SOURCE_LATEST_WINDOW_NOT_PUBLISHED`; admission exhaustion → fail closed, never relax limit | v2 schema/OpenAPI/generated fixture; 28-file/257-test fresh-PG + restore; 113 contract tests; 1,795 frontend tests + build; real BFF 48 alpha/78 deployment smoke; Chromium 48 rows, BFF 200, 0 console issues | Codex | post-N29 dev integration | `DEV_ACCEPTED` | `AlphaFleetRichContainer` + reviewed `AlphaFleet`; filter uses every `stages[]` member; drill-down normalizes stage case | dev read only; command and Live mutation unchanged | `EX_BE_35_ALPHA_FLEET_CURRENT_SOURCE_V2.md`; supersedes only the Fleet payload of BR-EX-72, not bindings/live-review |
| BR-EX-74 | 2026-09-01 | Alpha 360 `/deployments/alphas/{id}` | Optional analytics was incorrectly used as the whole-screen status authority; the dev BFF also delegated the user's Portal workspace to a projection stored under the execution-cell workspace, producing `N25_PROJECTION_CYCLE_NOT_FOUND` over a healthy ACTIVE epoch | Keep Fleet v2 as the current-source identity/deployment spine; make N25 analytics additive; require one explicit validated projection workspace for only the private Manager Query/SSE assertion; accept both bounded Rust problem-envelope revisions without forwarding messages | Fleet facts `TRADING_SYSTEM`; analytics `PORTAL_PROJECTION`; session/RBAC `PORTAL_CONTROL` | read-only · medium; browser never selects Edge workspace and legacy shadow retains Portal-workspace scoping | exact Fleet search ≤50; analytics response ≤2 MiB; existing N25 bulkhead/timeout; one fixed projection workspace per Manager runtime | BR-EX-73 Fleet v2; N25 Query analytics; N26 Manager projection SSE; N21 admission | Fleet miss → whole-screen typed empty; analytics loss → 12 local unavailable tiles while identity/deployments remain; no invented series | 257/257 Control API fresh-PG + restore; 1,797 frontend tests + build; real browser Fleet click-through with exact Fleet/analytics HTTP 200, 10 tabs, 4 deployment controls, 6 KPI cells, 12 tiles, 0 console issues | Codex | post-N29 dev integration | `DEV_ACCEPTED` | `AlphaThreeSixtyRichContainer` preserves reviewed `AlphaThreeSixty`; no product fixture | dev read only; command, Live mutation, main and stable unchanged | `EX_BE_36_ALPHA_360_CURRENT_SOURCE_COMPOSITION.md` |
| BR-EX-75 | 2026-09-02 | Alpha 360 `/deployments/alphas/:alphaId` · Portfolio 360 `/deployments/portfolios/:portfolioId` | Owner review found that real local-projection facts were discarded at the rich-screen composition seam: Alpha child tabs received `null`/empty props and Portfolio treated optional analytics as whole-screen authority | Add backward-compatible bounded `analytics.source_facts` from the same atomic local projection read; map positions, orders/fills, event replay, sessions, accounting, reconciliation, risk, contribution and equity into the reviewed Alpha tabs; keep Fleet v2 as multi-profile Portfolio identity/holdings spine; render typed empty/unavailable inside only the missing panel | facts `TRADING_SYSTEM` retained by `PORTAL_PROJECTION`; derived series `DERIVED`; UI composition `PORTAL` | read-only · medium; no new AWS-HK request and no browser aggregation of financial totals | one repository query; ≤1,000 facts/relation and existing 2 MiB BFF ceiling; current projection freshness ceiling; exact decimal strings preserved | Phase 1 projection, N25 query analytics, BR-EX-73 Fleet v2, Claude rich composition | no fact row → panel-local `EMPTY`; missing market candles/correlation/ledger history → typed panel-local unavailable; optional analytics loss never erases Alpha/Portfolio identity | 115 contract tests; 281 Control API fresh-PG + restore; 1,805 frontend tests and clean Docker build; regression clicks all ten Alpha tabs and proves Portfolio identity/holdings under analytics loss; dev images healthy on canonical Compose stack | Codex | Phase 3 owner-finding correction | `DEV_RUNTIME_REBUILT / OWNER_REVIEW_PENDING` | Existing `AlphaThreeSixty` and `PortfolioThreeSixty` visual components retained; only BFF reader/container props changed | dev read-only; command, Live mutation, main and stable unchanged | `backend/EX_BE_PHASE3_RICH_UI_PRODUCT_ACCEPTANCE.md` §8 |
| BR-EX-76 | 2026-09-02 | Portfolio 360 + `/deployments/portfolios` root | Owner review: PF-CRYPTO default 404s the whole screen; no portfolio list exists; 2 real portfolios sit unconsumed in the projection | Bounded portfolios list read (all profiles) + Portfolio 360 spine = portfolios ∪ Fleet; route/sidebar defaults derive from data | facts `TRADING_SYSTEM` via `PORTAL_PROJECTION` | read-only · low | ≤100 portfolios; existing snapshot cadence | Phase 1 projection; Fleet v2 | unknown id → typed empty naming real ids | contract + fresh-PG + journey on real id | Claude (backend co-impl) | Phase 4 / P4-A | `INTEGRATION_COMPLETE` (2026-09-02) | Portfolio list + `PortfolioThreeSixtyRichContainer` | dev read only | Phase 4 §P4-A; finding F1 |
| BR-EX-77 | 2026-09-02 | Fleet/lists freshness + realtime coverage | Fleet chip pinned STALE (5 s constant vs 15–60 s cadence); Fleet/360/Blotter/CC have no stream binding; delta handling is refetch-per-event | Envelope-declared freshness budgets per ingestion class with AGING tier; extend profile-realtime to remaining read screens; bounded delta coalescing | `PORTAL_PROJECTION` envelopes | read-only · low | existing SSE bounds; coalesce ≥1 s | Phase 1 five-kind contract | budget absent → UNKNOWN never fake-FRESH | unit + SSE + journey with motion assertions | Claude (backend co-impl) | Phase 4 / P4-C | `RECEIVED` | all rich read screens | dev read only | Phase 4 §P4-C; findings F3/F4 |
| BR-EX-78 | 2026-09-02 | Profile taxonomy + lineage observability + window ladder | N30 lineage guard structurally rejects non-BINANCE paper parents (DNSE/VN) with no diagnostics; flat 400-row windows block 30 d rollups/history | Owner profile-set decision (recommend `PAPER_DNSE_VNM`); reject counters by missing-parent class in envelope; per-class ingestion windows + warm SGP history; DERIVED portfolio-equity while MC gap stays typed | `TRADING_SYSTEM` via `PORTAL_PROJECTION`; derived `DERIVED` | read-only · medium (taxonomy touches isolation proofs) | window ladder per N29-RTA budget table | Phase 1 lineage guard; owner decision | strict rejection retained; counters bounded | taxonomy negatives + migration/restore + parity | Codex + Claude | Phase 4 / P4-D | `APPROVED_IMPLEMENTATION_IN_PROGRESS` (2026-09-03, Bobby approved `PAPER_DNSE_VNM`) | VNM workbench, Fleet rollups, history charts | dev read only | Phase 4 §P4-D; findings F5/F6/F7/F9 |
| BR-EX-79 | 2026-09-03 | Source publication set for full-data screens | Live sweep: equity/performance relations empty (`SOURCE_PARTIAL`, 0 rows), `portfolio_equity` contract-rejected since Phase 1, live balances published without live accounts, cross-family rows in the BINANCE paper feed, `venue_accounts`/margin/sync zero, candles/benchmark/twin-join not activated, no ≥30 d retention | Detailed publication request to the Execution Cell agent: `upgrade/backend/EXECUTION_SOURCE_PUBLICATION_REQUEST_2026-09-03.md` (13 items P0–P2 + 1 question; restates MC-01…09; DNSE deferred by owner) | `TRADING_SYSTEM` / Execution Cell | read-only · none Portal-side | per-item bounds in the request | none (Portal seams delivered Phase 4) | typed states stay until verified | live projection inventory before/after | Execution Cell agent | Phase 4 follow-on | `EXTERNAL_CONTRACT_PENDING` | every data-bearing screen | n/a | request doc §0 table |
| _next: BR-EX-80_ | — | — | — | — | — | — | — | — | — | — | — | — | `RECEIVED` | — | none until approved | — |

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

### 7.5 BR-EX-62 / BR-EX-63 — full specification (Paper Workbench, its VN variant, Paper Exit Review)

Written here for the same reason as §7.4: §7 says a request is schedulable only once it lives in
this file.

These two rows are **much smaller than the Sandbox pair**, and the reason is worth stating: the
Paper contract already publishes almost everything its hi-fi shows. KPIs, lineage, the lifecycle
rail, the observation gate and its unmet criteria, drift vs the approved run, runtime health,
accounting, portfolio contribution, orders, fills, positions and sessions all reach the screen
through `paper-workbench.v1` today. The frontend rebuilt the three screens on 2026-08-28 against
that data; what it could not get from the contract is listed below, and nothing else.

#### 7.5.1 BR-EX-62 — `paper-workbench.v1` → v1.1 (additive)

Four branches, and one new list route.

```json
{
  "peers": [
    { "deployment_id": "dep_74", "alpha": "Carry v3.2", "venue": "BINANCE", "progress": "12/30", "gate_met": false, "href": "/deployments/paper/dep_74" },
    { "deployment_id": "dep_94", "alpha": "Grid v2.1", "venue": "DERIBIT", "progress": "30/30", "gate_met": true, "exit_review_id": "EX-771" },
    { "deployment_id": "dep_102", "alpha": "VnMomo v0.9", "venue": "VN MARKET", "progress": "6/30", "gate_met": false, "session_aware": true }
  ],
  "equity_band": {
    "formula": "equity_projection.v1", "window": "30d", "interval": "1h", "currency": "USDT",
    "joined_run_id": "run_5512", "join_basis": "artifact_digest",
    "backtest": [ { "t": "…", "v": "1.0000" } ],
    "paper":    [ { "t": "…", "v": "1.0000" } ],
    "expected_band": [ { "t": "…", "lo": "0.98", "hi": "1.02" } ],
    "annotations": [ { "kind": "MAX_DRAWDOWN", "t": "2026-08-12T00:00:00Z", "v": "-0.0214", "label": "DD −2.14%" } ]
  },
  "order_markers": {
    "symbol": "BTCUSDT", "interval": "1h", "snapshot_id": "ds_5512",
    "candles": [ { "t": "…", "o": "…", "h": "…", "l": "…", "c": "…" } ],
    "markers": [ { "kind": "BUY", "t": "…", "price": "61240.50", "order_id": "ord_9a01" },
                 { "kind": "FILL", "t": "…", "price": "61240.50", "qty": "0.0200", "fill_id": "fl_1" } ]
  },
  "correlation_series": {
    "formula": "corr.v1", "window": "30d", "samples": 720, "coverage": "0.994", "covariance_id": "cov_30d_v2",
    "vs_portfolio": [ { "t": "…", "rho": "0.31" } ],
    "vs_benchmark": [ { "t": "…", "rho": "0.18" } ]
  },
  "session_shading": {
    "venue": "VN MARKET", "timezone": "Asia/Ho_Chi_Minh",
    "closed_windows": [ { "from": "2026-08-20T14:45:00+07:00", "to": "2026-08-21T09:00:00+07:00" } ],
    "frozen_at": "2026-08-21T14:45:00+07:00"
  },
  "report": { "available": false, "reason": "REPORT_ROUTE_UNPUBLISHED" },
  "runtime_state": "ACTIVE"
}
```

`runtime_state` was added on 2026-08-28 after the hi-fi review. The hi-fi
masthead carries `● ACTIVE` beside `✓ READY`: the first is the deployment's
runtime, the second its readiness, and they are different axes — a deployment
can be READY and stopped. `paper-workbench.v1` publishes readiness and freshness
but no runtime, so the frontend renders the chip **absent** rather than deriving
it from readiness, which would tell an operator a stopped deployment is running.
Null stays null and the chip stays absent.

**Amended 2026-08-28 (same day):** the owner delivered the missing hi-fi — "Paper Overview (entry
for WF 1c/4h)" — and the entry screen is now that full overview, not a bare list. `paper-list.v1`
grows into `paper-overview.v1` (one contract; the switcher reads the same rows):

```json
{
  "kpis": {
    "in_observation": { "count": 3, "by_kind": { "crypto": 2, "vn": 1 } },
    "gate_met": { "count": 1, "reviews": [ { "review_id": "EX-771", "state": "PENDING" } ] },
    "next_gate_eta": { "date": "2026-09-15", "deployment_id": "dep_74", "basis": "at current pace" },
    "capital": [ { "ccy": "USDT/USDC", "value": "120000" }, { "ccy": "VND", "value": "1000000000", "summable": false } ],
    "drift_alerts": { "watch": 1, "fail": 0, "band": "1sigma" }
  },
  "funnel_7d": [ { "deployment_id": "dep_74", "signals": 96, "orders": 71, "fills": 64, "rejected": 5, "reject_reason_top": "RISK_CAP", "skipped": 20, "skip_reason_top": "MIN_QTY", "queued": 0 } ],
  "runway": [ { "deployment_id": "dep_74", "days": [ { "d": "2026-08-14", "pnl_sign": 1 } ], "window": 30, "today_live": true, "eta": "2026-09-15" } ],
  "left_paper_90d": [ { "alpha": "Grid v2.1", "venue": "BINANCE", "exit_review_id": "PX-22", "then": [ { "stage": "SANDBOX", "ref": "SX-14" }, { "stage": "CANARY", "deployment_id": "dep_88", "day": 9, "total": 14 } ] } ]
}
```

Rules added by the amendment: `capital[]` entries with different currencies are **never summed**
(`summable:false` is the wire form of the hi-fi's "VND — never summed"); `runway[].days[].pnl_sign`
is a sign, not a PnL figure — the cells are colored by direction and the money stays in the
workbench; `funnel_7d` reject/skip reasons are the top typed reason with counts, because "paper
exists to prove the funnel, not the PnL"; and `left_paper_90d` keeps rejected exits (`RSI v1.4`)
with their verdicts — a promotion history that hides its rejections is marketing. Sources:
`orders`/`fills` grouped 7d for the funnel; `account_equity_snapshots` day-signs for the runway;
Portal exit reviews for gate/left-paper; ETA is the server's pace model, published with its basis.

`GET /api/v1/execution/paper` → `paper-list.v1` for the switcher (the same rows as `peers`, so a
deployment can be reached without already being on one).

**Source mapping**

| field | table · column |
|---|---|
| `peers[]` / `paper-list.v1` | `strategy_deployments` WHERE `mode='paper'` ⋈ `strategies` ⋈ `accounts`; `progress` and `gate_met` from the observation-policy evaluator that already backs `observation` in v1 |
| `equity_band.paper` | `account_equity_snapshots(equity, ts)` for the deployment, normalised |
| `equity_band.backtest` / `expected_band` | the approved run in `alpha_ledger` joined **by `artifact_digest`**, never by name or by time; the band is the run's own ±1σ envelope |
| `equity_band.annotations` | the max-drawdown point the projection already computes for the KPI — the chart must not recompute it |
| `order_markers.candles` | venue OHLC for `symbol` at `interval` (the data-layer snapshot named in `snapshot_id`) |
| `order_markers.markers[]` | `orders(submitted_at, side, price)` and `fills(trade_time, price, quantity)`, each carrying its own id so a marker drills into the journal |
| `correlation_series` | DERIVED `corr.v1` over `performance_snapshots` for the deployment and its portfolio/benchmark |
| `session_shading` | `venues.trading_sessions` + the venue holiday calendar — the same source the freshness clock already pauses against |
| `runtime_state` | `strategy_deployments(runtime_state)` — published or null, never derived from readiness |

**Server rules**

1. **The join is the digest.** `equity_band` may only join a backtest to a paper series through
   `artifact_digest`; `join_basis` must say so. Two series joined by name is the failure this panel
   exists to make visible.
2. **A marker carries its id.** Every entry in `order_markers.markers[]` names the `order_id` or
   `fill_id` it came from; a marker that cannot be drilled into is decoration.
3. **Session shading is the venue's calendar, not a gap in the data.** A closed window is published
   as a window; the browser must never infer "closed" from missing points.
4. `peers[].progress` is the same string the workbench's own rail prints for that deployment, so the
   switcher can never contradict the page it sits on.
5. `report.available:false` must carry a reason. The screen renders a preview of what the pack would
   contain and disables the control with that reason.

#### 7.5.2 BR-EX-63 — `paper-exit-review.v1` → v1.1 (additive)

Two branches only:

```json
{
  "evidence_pack": { "pack_id": "ep_4471", "digest": "e9a2…", "href": "/governance/exit-reviews/EX-771/pack", "built_at": "…" },
  "reviewer_note": { "supported": true, "max_length": 2000, "recorded_with_decision": true, "value": null }
}
```

**Server rules**

1. The reviewer note is **recorded with the decision**, never on its own: there is no endpoint that
   stores a note without an outcome, and the field says so, because a note the reviewer believes was
   saved and was not is worse than no field at all.
2. `evidence_pack.digest` is the digest of the evidence as read for **this** review. If the pack is
   rebuilt, the review keeps the digest it decided against.

#### 7.5.3 Definition of Ready (§5.1), pre-filled

| Package | Owner · env | Authority & scope R/W | Schema rev · compat | Scale / freshness / completeness | Auth / RBAC / SoD | Failure / unavailable / rollback | Dependency | Test corpus & exit evidence |
|---|---|---|---|---|---|---|---|---|
| **BR-EX-62** | Codex · `dev` fixture→shadow | READ; PORTAL_PROJECTION (peers, gate) · DERIVED (`equity_projection.v1`, `corr.v1`) · TRADING_SYSTEM (candles, orders, fills) · venue calendar | `paper-workbench.v1` → v1.1 additive + new `paper-list.v1` | ≤20 deployments in paper; band and correlation ≤720 points each; candles 120–500; markers ≤500/window | any Execution viewer; no write | a missing branch renders the honest state the screen already has; no series ⇒ the panel says so and the KPI strip stands alone | existing `paper-workbench.v1`; `venues.trading_sessions`; BR-EX-41 telemetry | fixtures `execution-paper-list.valid.json`, `execution-paper-workbench.dep_74.v1_1.valid.json`, `…dep_102.v1_1.valid.json`; tests 7.5.4 (1)–(5); frontend `paper.test`, `vnm.test`, `paperMatrix.test` re-run unchanged |
| **BR-EX-63** | Codex · `dev` | READ + the existing decision write | `paper-exit-review.v1` → v1.1 additive | 1 review/screen | reviewer read; decide = existing eligibility + SoD | note unsupported ⇒ the field is not rendered, rather than rendered and dropped | existing contract | fixture update; tests 7.5.4 (6)(7); frontend `paperExit.test` re-run unchanged |

OpenAPI paths:

```yaml
paths:
  /api/v1/execution/paper:                       # GET -> paper-list.v1                (BR-EX-62)
  /api/v1/execution/paper/{deployment_id}:       # v1.1 additive                       (BR-EX-62)
  /api/v1/execution/exit-reviews/{review_id}:    # v1.1 additive                       (BR-EX-63)
```

#### 7.5.4 Required tests

1. `equity_band.join_basis == "artifact_digest"` and the backtest run's digest equals the
   deployment's — a fixture whose digests differ must fail the schema, not render.
2. Every `order_markers.markers[]` entry resolves to an `order_id` or `fill_id` present in the same
   fixture's journal.
3. `session_shading.closed_windows` never overlaps a published equity point.
4. `peers[].progress` for the deployment being read equals the workbench's own `railDetail`.
5. `report.available == false ⇒ report.reason != null`.
6. `reviewer_note.recorded_with_decision == true`, and no route accepts a note without an outcome.
7. `evidence_pack.digest` is stable across a pack rebuild for an already-decided review.

#### 7.5.5 Decisions codex must confirm (not guess)

1. **Which venue owns the candles.** `order_markers.candles` is venue OHLC; is it served from the
   data-layer snapshot (`ds_*`) the Paper screen already names, or from the Trading System's market
   route? This is the same question BR-EX-50 asked for Trade Replay — one answer for both.
2. **Benchmark identity for `corr.v1`.** The screen prints "vs Crypto Core v3" and "vs VN-Index";
   the benchmark id must be a field, not a label baked into the derivation.
3. **The `paper-list.v1` route name.** `/api/v1/execution/paper` collides with the workbench's own
   prefix; codex picks the final shape.
4. **Reviewer-note retention.** Is the note part of the immutable decision record, or a separate
   revisable annotation? The frontend renders the first reading today.

#### 7.5.6 Delivery order and what the frontend retires

- **BR-EX-62 lands:** frontend deletes the workbench half of `paper.smoke.ts` (`PAPER_PEERS`,
  `crypto`, `vnm`, `usePaperTick`), and re-records `el-v2-06-paper-vnm` and the paper baselines.
- **BR-EX-63 lands:** the exit half goes and `paper.smoke.ts` is deleted with it.

---

### 7.6 BR-EX-64 — chart series contract (cross-screen), written after the real-chart pass

On 2026-08-28 the frontend replaced every hand-drawn SVG chart stand-in on the Paper, Canary and
Live surfaces with real ECharts panels (`apps/portal/frontend/src/execution/components/marketChart.tsx`:
candlesticks with journal markers, multi-line with ±band / venue-closed areas / stage markers,
signed daily bars). That pass is early validation for codex — **the requested shapes in §7.4/§7.5,
BR-EX-41/50/56/57/59 are now proven renderable end-to-end** — and it surfaced a set of rules that
apply to *every* charted series, not to one contract. They were being written once per appendix;
this row states them once, the way BR-EX-58 did for blocker codes.

**Applies to:** `stage-equity.v1` (41.1), `replay.v1` candles/markers (50), `live-overview.v1`
pulse (56), `live-full.v1.1` `contribution_30d` (57), `canary-control-room.v1.1` `stage_lines`
(59), `paper-overview.v1` returns/funnel/runway (62), `paper-workbench.v1.1` `equity_band` /
`order_markers` / `correlation_series` / `session_shading` (62), and any future charted series.

#### 7.6.1 The ten rules

1. **Numeric points, ISO-8601 UTC timestamps — never coordinates.** A series arrives as
   `[{t, v}]` (or OHLC rows); the portal owns scaling and axes. Pre-scaled x/y pairs cannot be
   hovered, re-windowed or verified, and are rejected at schema.
2. **Money is exact-decimal strings; ratios and normalized series are numbers.** Which one each
   field is, the schema declares — a consumer must not guess from the magnitude.
3. **A closed venue is a gap, not a segment.** For session-aware venues the series either omits
   the closed buckets and publishes `gaps: [{from, to, reason: "VENUE_CLOSED"}]` (matching
   `session_shading`), or carries explicit nulls. The portal draws a break; it never interpolates
   across a shut market, and it never infers "closed" from missing points (§7.5.1 rule 3 —
   restated here because it now binds every session-aware series, not only Paper's).
4. **A printed total equals the exact sum of its series.** `contribution_30d.total == Σ days[].pnl`
   (exact decimal); funnel counts are monotonic (`signals ≥ orders ≥ fills`, rejected + skipped +
   queued accounted); a runway's cell count equals its window. Server-verified, fixture-tested —
   a chart that disagrees with its own caption is worse than no chart, and the frontend currently
   has to *scale smoke bars* to keep this true, which is exactly the kind of lie BR-EX delivery
   removes.
5. **Every marker carries the journal id it came from.** BUY/SELL → `order_id`; FILL →
   `fill_id`; reject → its typed reason + `order_id`; bracket legs → `bracket_group_id`. The
   portal renders hover = that record and links it; a marker without an id is decoration and is
   rejected at schema. (Shared with BR-EX-50's marker↔log consistency test — one rule, two
   consumers.)
6. **An annotation owns its bucket.** A published annotation (max drawdown, canary start, frozen
   at close) is `{t, v, kind, label}`, and `v` must equal the series value at `t` (fixture rule).
   The chart repeats the projection's own statement; it never recomputes it — the frontend found
   this the hard way when a DD label said Aug 12 while sitting on Jul 25.
7. **Point caps and honest downsampling.** Per BR-EX-41: ≤5,000 points/series, panels typically
   ≤720; when the server downsamples it keeps extrema (min/max or LTTB) and declares
   `downsample: {method, stride}` so the envelope caption can say so.
8. **Tooltip provenance is part of the series envelope.** `authority`, `as_of`,
   `formula_version` are required on every charted series; the portal prints them in every
   tooltip (§12 chart production contract). A series without them renders as unavailable, not as
   an anonymous line.
9. **Multi-stage overlays share one digest.** `stage_lines` and any backtest/paper/live overlay
   carry `join_digest`; series with different digests must not be returned in one overlay
   response. Line style differentiates stage; colour never carries the difference alone.
10. **One owner for OHLC.** `order_markers.candles` (62) and `replay.v1` candles (50) must come
    from the same source with the same bucket rules — the data-layer snapshot (`ds_*`) or the
    Trading System market route, but one answer. This is decision §7.5.5(1) = J.4, escalated:
    two screens now block on it.

#### 7.6.2 Additions to already-filed rows (additive, no retype)

- **BR-EX-62 `paper-overview.v1`** — each `runway[]` row also carries its drift mini-series:
  `drift_spark: [{t, v}]` (≤26 pts, pt units vs expected) and `drift_now_pt: string` (exact
  decimal, signed) with `drift_state: WITHIN_BAND|WATCH|FAIL|INSUFFICIENT_DATA` — the row's
  sparkline and headline number currently come from the same stand-in generator.
- **BR-EX-62 `equity_band`** — `annotations[]` entries follow rule 6 (`{t, v, kind:
  "MAX_DRAWDOWN", label}`); the KPI strip's max-drawdown figure and the chart's annotation must
  be the same published fact.
- **BR-EX-59 `stage_lines`** — `canary_start_at` must fall on a bucket boundary of the published
  interval; normalization base is 1.0 at the window start and is stated in the envelope
  (`normalized_to: 1.0`), so three stages are comparable without the client rebasing.
- **BR-EX-57 `contribution_30d`** — shape confirmed as `{days: [{d, pnl}], total, cost_drag,
  formula: "contrib.v1"}` with rule 4 binding `total`.

#### 7.6.3 Definition of Ready (§5.1)

| Package | Owner · env | Authority & scope | Schema rev · compat | Scale | Failure | Dependency | Test corpus |
|---|---|---|---|---|---|---|---|
| **BR-EX-64** | Codex · `dev` schema-first | READ; rules bind existing series producers (PORTAL_PROJECTION / TRADING_SYSTEM / BROKER / DERIVED per their own rows) | new `chart-series.rules.v1` — a shared schema fragment (`$ref`-ed by 41/50/56/57/59/62 series), additive everywhere | no new endpoints; caps per BR-EX-41 | a series failing a rule fails schema validation, not rendering — the portal never repairs data | BR-EX-41/50/56/57/59/62; decision §7.5.5(1) for rule 10 | fixture linter: every `execution-*` fixture with a charted series passes rules 1–9; sum-consistency and annotation-equality checks generated per fixture; frontend `marketChart` renders each canonical fixture in a smoke test |

#### 7.6.4 Required tests

1. Rule 4 on every fixture with a total beside a series (contribution, funnel, runway).
2. Rule 5: schema rejects a marker without its journal id; every marker id in a fixture resolves
   inside the same fixture's journal.
3. Rule 6: for every annotation, `v == series[t]` exactly.
4. Rule 9: mixed-digest overlay is rejected.
5. Rule 3: a session-aware fixture with a closed window either omits those buckets + publishes
   `gaps[]`, or carries nulls — a continuous line through a closed window fails.
6. Rule 7: a downsampled fixture keeps the window's min and max and declares its method.

#### 7.6.5 What the frontend retires on delivery

Nothing directly — BR-EX-64 has no endpoint of its own. Its value is that every series delivered
under 41/50/56/57/59/62 arrives chart-ready: the generators in `paper.smoke.ts` /
`canary.smoke.ts` (paperCandles, researchBand, corrSeries, vnSessions, overviewReturns,
canaryStageSeries) are the reference fixtures for what the components consume, and they delete
with their parent rows.

#### 7.6.6 Amendment 2026-08-28 (Portfolio pass) — additive to BR-EX-34 and BR-EX-51

The Portfolio 360 fix pass (frontend commit `9709679`) replaced the last SVG stand-ins on
that screen with `marketChart` components. Three consequences for already-filed rows, all
additive — no retype:

1. **BR-EX-34 gains two named series consumers.** `PF_CHARTS.rho` (30×1d ρ(NAV, benchmark)
   points with `threshold: 0.6` and a breach window 2026-08-12→14 peaking 0.63) and
   `PF_CHARTS.ddOverlap` (per-alpha drawdown episodes `{from,to,depthPct}` + a joint window
   with its regime label, `INSUFFICIENT_DATA` as an explicit row state) in
   `portfolio360.smoke.ts` are the reference fixtures for the ρ-timeline and drawdown-overlap
   series. **Correction 2026-08-29:** BR-EX-34 closed on 2026-08-26 with equity/drawdown/
   approved-band only — these two series are new scope and now live in **BR-EX-65** (§7.7),
   which does not reopen 34. When BR-EX-65 publishes them, the shapes must match: episodes are intervals with a
   depth, never a resampled line; the joint window is server-derived (≥2 alphas in drawdown),
   never recomputed in the browser; both carry `chart-series.rules.v1` (§7.6.1) — the
   threshold/annotation obey rule 6, the timeline obeys rules 1/7/8.
2. **BR-EX-51 actions have their UI anchor points.** `Rebalance plan ▾` and `Report pack` on
   `PortfolioThreeSixty` are now active controls opening plan-preview panels; the `Apply` /
   `Generate` buttons inside are the single enable points for the plan → apply → verify route
   and the report-pack export. The preview's KV grid (operation · targets · writes ·
   governance) is the exact field list the plan endpoint should echo back; targets shown today
   are labeled estimates from the what-if panel (`marginal.v1`).
3. **The influence map consumes the published matrix only.** `InfluenceMap` derives nodes
   (radius = exposure share) and edges (|ρ| ≥ threshold) from the packed correlation matrix
   already published — no new series requested; `PF_CHARTS.influence` on the Structure
   overview panel is presentation smoke and deletes with BR-EX-51.


### 7.7 BR-EX-65 — portfolio correlation-risk series (filed 2026-08-29)

The corr.v1 disclosure ships two smoke frames (2026-08-28) whose shapes are the request. Both
series `$ref` `chart-series.rules.v1` (§7.6.1) in full.

**`rho-timeline`** — `GET /api/v1/portal/portfolios/{id}/rho-timeline?window=30d`

```jsonc
{
  "envelope": { "authority": "DERIVED", "as_of": "...", "formula_version": "corr.v1" },
  "benchmark_id": "bm_204",          // the id portfolio-360 already names
  "window": { "from": "...", "to": "...", "interval": "1d" },  // server-chosen
  "threshold": "0.6",                 // PORTAL_CONTROL config — the portal never hardcodes it
  "points": [["2026-07-24T00:00:00Z", "0.31"], ...],   // ≤400, rule 1/7/8
  "breaches": [{ "from": "...", "to": "...", "peak": "0.63" }]  // sustained ρ > threshold;
  // the breach is what raises the attention finding — server detects, browser draws (rule 6:
  // each breach peak equals the series value at its bucket)
}
```

**`drawdown-overlap`** — `GET /api/v1/portal/portfolios/{id}/drawdown-overlap?window=30d`

```jsonc
{
  "envelope": { "authority": "DERIVED", "as_of": "...", "formula_version": "drawdown_overlap.v1" },
  "window": { "from": "...", "to": "..." },
  "alphas": [
    { "id": "av_...", "label": "Grid", "state": "OK",
      "episodes": [{ "from": "...", "to": "...", "depth_pct": "-2.1" }] },   // peak-to-recovery
    { "id": "av_...", "label": "MM", "state": "INSUFFICIENT_DATA", "days_observed": 9,
      "episodes": [] }                                                        // a state, not a zero
  ],
  "joint_windows": [{ "from": "...", "to": "...",
    "regime_label": { "text": "high-vol panic (BTC -6.2%)", "formula_version": "regime.v1" } }]
  // joint = ≥2 alphas in drawdown, server-derived; regime_label optional — absent means absent
}
```

Episodes are intervals with a depth — never a resampled line. The browser never intersects
intervals to find joint windows and never classifies regimes.

**DoR (§5.1):** schema + the two canonical fixtures (`execution-portfolio-360.rho-timeline.valid.json`,
`.drawdown-overlap.valid.json`) + error/unavailable examples before any route work.

**Required tests:** rule-6 equality for every breach peak; `from ≤ to`, `depth_pct < 0` per
episode; every joint window ⊆ the union of its members' episodes; threshold change in config
reflected in payload without portal redeploy; fixture linter of §7.6.4 over both fixtures.

**Frontend retires on delivery:** `PF_CHARTS.rho` and `PF_CHARTS.ddOverlap` in
`portfolio360.smoke.ts`; the corr.v1 disclosure's SMOKE caption; re-record
`el-v2-08-portfolio-*`. The honest "not published" code path stays for the absent-series case.

### 7.8 BR-EX-66 — portfolio actions: rebalance plan → apply → verify · report pack (filed 2026-08-29)

The two header controls are live since commit `9709679`; their previews are the contract sketch,
and `Apply`/`Generate` inside them are the only two places this row enables.

**Rebalance** — the state machine BR-EX-51 deferred as "actions later":

| Step | Route | Semantics |
|---|---|---|
| plan | `POST /api/v1/portal/portfolios/{id}/rebalance/plan` | Dry-run. Echoes the preview's KV grid — `operation`, `targets[]` (per-alpha `alloc_from`/`alloc_to`, exact decimals; seeded from `marginal.v1` estimates and labeled so), `writes` (capital-ledger entries only — positions move only by the deployments' own orders), `governance` (ADMIN step-up · dual approval). Returns `plan_id`, `plan_digest`, `expires_at`. No state changes. |
| apply | `POST .../rebalance/apply` | `plan_id` + step-up token → `operation_id` in the operations queue, dual approval attached. Idempotent by `plan_digest`. Expired plan → typed 409 (re-plan); missing step-up → typed 403. |
| verify | `GET .../rebalance/verify/{operation_id}` | Per-entry applied/failed + post-state digest. `PARTIAL` renders as a chip with the per-entry list — never green. |

**Report pack** — `POST /api/v1/portal/portfolios/{id}/report-pack` (window + section list: live
strip/KPIs · equity vs benchmark by era · matrix + influence map · drawdown overlap · ledger
window · approvals) → `artifact_id`; `GET .../report-pack/{artifact_id}` for status/download.
Every section is pinned to the digest it was read at; a section whose digest no longer matches
live is marked `stale_at_generation`, never silently refreshed. Read-only assembly over
published contracts — no new derivation.

**DoR:** command-catalogue entries (revision 2 grammar, handoff §8.8) + schema + fixtures for
plan/apply/verify and generate/status, including the 409/403/PARTIAL negatives, before route work.

**Required tests:** full state-machine walk incl. expiry and dual-approval negatives; apply
idempotency by digest; PARTIAL propagation to verify; report digest-pinning
(`stale_at_generation` on drift); artifact size cap.

**Frontend retires on delivery:** the `disabled` + BR-EX-51-reason on `Apply`/`Generate`;
nothing else — the previews become the real plan echo.

**Activation:** command row — activation is gated on Bobby approval and operational evidence,
separately from every read row. Until then the routes may exist dark; the portal keeps the
buttons preview-only.

### 7.9 BR-EX-67 — governance review evidence and policy-verdict data (filed 2026-08-30)

The owner's 2026-08-30 hi-fi copies of Gate R1/R2 add panels the disk corpus did not have:
R2's **Gate criteria — policy vs evidence** table and **Stage eligibility** chips. R1's evidence
charts also stop being honest-state frames. All ship as labeled smoke in
`governance.smoke.ts`; the shapes there are this row's reference until backend delivery.

**R1 — `governance.r1-review.v1` additive fields**

```jsonc
{
  "gate_policy_ref": { "policy_id": "gate_r1", "rev": 4, "effective": "2026-06-15" },
  "evidence_series": {
    "run_id": "run_5512",
    "roles": [
      { "role": "IS", "points": [["2019-01-01", "1.0000"]] },
      { "role": "OOS", "points": [] },
      { "role": "HOLDOUT", "points": [] }
    ],
    "boundaries": [
      { "role": "OOS", "at": "2022-05-01" },
      { "role": "HOLDOUT", "at": "2024-09-01" }
    ],
    "max_drawdown": { "at": "2023-05-01", "value": "1.3810", "pct": "-11.4" },
    "wfo": {
      "threshold": "1.0", "median": "1.34", "min": "0.71", "dispersion": "PASS",
      "folds": [{ "fold": 1, "sharpe": "1.28" }]
    }
  }
}
```

Every series obeys `chart-series.rules.v1`. Window roles come from the methodology claim,
gaps remain gaps, and the max-drawdown annotation must equal the point at its bucket.

**R2 — `governance.r2-review.v1` additive fields**

```jsonc
{
  "portfolio_fit": {
    "target_weight_pct": "8.0",
    "corr_estimate": { "value": "0.18", "window": "90d backtest", "formula_version": "corr.v1" },
    "expected_marginal_risk_pct": "+5.2",
    "diversification_benefit": "+0.07",
    "symbol_overlap": "NONE_WITH_LIVE"
  },
  "gate_criteria": {
    "policy": { "policy_id": "gate_r2", "rev": 7, "effective": "2026-07-01", "declared_by": "Risk admin" },
    "rows": [
      { "criterion": "Sharpe (net, 1y)", "threshold": ">= 1.20", "observed": "1.74", "verdict": "PASS" }
    ],
    "summary": { "pass": 4, "waiverable": 1, "fail": 0 },
    "evidence": ["run_5512", "ep_4409"]
  },
  "stage_eligibility": [
    { "stage": "PAPER", "state": "ELIGIBLE", "detail": "this approval" },
    { "stage": "SANDBOX", "state": "NEEDS", "detail": "obs 30d/300 trades + slippage >= 30 fills" },
    { "stage": "CANARY", "state": "NEEDS", "detail": "sandbox cert 7/7 · dual approval" }
  ]
}
```

Thresholds, verdicts and eligibility are versioned `PORTAL_CONTROL` policy data. The server
computes them; the browser only renders them. A criterion evaluated against a superseded policy
revision is `STALE_POLICY`, never a silently recomputed PASS. Portfolio-fit values remain labeled
research estimates until replaced by Paper observation.

**DoR:** amended schemas, canonical fixture variants and typed absent/error examples before route
work. Required tests cover chart rule 6, role boundaries, policy-revision mismatch, server verdict
recomputation and unchanged honest not-published behavior.

**Frontend retires on delivery:** `governance.smoke.ts`, the SMOKE notes on both screens and the
R1/R2 smoke baselines. The honest not-published path remains for absent additive fields.

---

### 7.10 BR-EX-68 — Admin Action Drawer WF 1i: operator-task catalog + command relay flow (filed 2026-08-30)

> **Detailed spec (2026-08-30): `upgrade/BR_EX_68_ADMIN_ACTION_DRAWER_SPEC.md`** — six
> contracts A–F with schemas, error semantics, staged delivery F1–F4 and the five open
> decisions. This section stays as the filed summary; the file above is the authority for
> implementation detail.

The owner's WF 1i hi-fi (2026-08-30) specifies the drawer the relay will one day serve. The
frontend ships the full interaction as a DECLARED DEMO on `adminCli.smoke.ts` — that file is this
row's reference for every shape below — while the published F0 truth (rev 2, 64 entries, relay
`DISABLED`, nothing reachable) stays quoted on screen and rendered in full underneath.

**(1) Operator-task catalog.** The hi-fi groups by operator task (Read & inspect · Portfolio &
capital · Deployment & risk · Account · Broker sync & reconciliation · Emergency & destructive),
not by system domain. F0 settled that the server's `group` wins for the published listing; the
task view therefore needs its own server-declared fields — additive on the existing entries or a
parallel `execution.command-tasks.v1` joined on `noun/verb`:

```jsonc
{
  "key": "account/policy",
  "task_group": "ACCOUNT",            // the six WF 1i groups, server-declared
  "task_title": "Account policy",
  "cli_form": "cli account policy … --reason \"hedge mode\"",
  "params": [                          // registry-picked, never free-typed
    { "key": "account_id", "source_registry": "accounts", "constraint": null },
    { "key": "--position-accounting-mode", "source_registry": null, "constraint": "NET | HEDGE" },
    { "key": "--reason", "source_registry": null, "constraint": "required · audit" }
  ]
}
```

Two hi-fi commands (`System health`, `Change allocation`) have no rev-2 key — the drawer says
"not in published catalogue rev 2" today; this row must either add them or name their keys.

**(2) Read path.** `POST /api/v1/execution/commands/{key}/run` for R0 entries only: no step-up,
verbatim transcript lines and exit code (`adminCli.smoke.ts` `CLI_OUT` shows the seven expected
transcripts). Freshness belongs to the row (`WATCH` re-runs client-side); the endpoint never
caches away a stale read.

**(3) Mutation flow.** PLAN → APPLY (step-up) → VERIFY, exactly the F0 verbs with the refusal
semantics kept for unreachable keys:

- `POST /commands/{key}/plan` → `{ plan_id, ttl_s, preflight: [{check, verdict: OK|WARN|FAIL,
  detail}] }` — preflight is SERVER-side (identity/lineage digest, approval ref validity,
  cell health, expected revision, concentration, idempotency key), the browser renders verdicts
  and never computes one;
- `POST /plans/{plan_id}/apply` — step-up enforced; DANGER tier requires the typed confirm word
  in the payload (`CLOSE`, `BINANCE_TESTNET_ONLY`); response is `202 + operation_id` and 202 is
  NOT success;
- `GET /operations/{operation_id}/verify` → timeline rows with authoritative ACKs; terminal
  `VERIFIED` or `PARTIAL` (+ residue rows and a re-apply pointer with the SAME idempotency key).
  PARTIAL never renders green and the drawer waits for terminal state.

**(4) Two-man rule.** For OPERATOR actors: `POST /plans/{plan_id}/key-request` → admin issues a
single-use key bound to that plan id with a TTL; issuance and use land in the audit log. ADMIN
actors apply without a key; VIEWER actors hold no command grant (the catalog stays visible —
visibility ≠ authority — and reads remain available).

**Retire on delivery:** `adminCli.smoke.ts`, the SMOKE cases in `adminCli.test.tsx`, the
"declared demo" copy in the drawer, and the `?role=/?outcome=` demo addresses.

### 7.11 BR-EX-69/70/71 — the owner-commissioned governance additions (filed 2026-08-30)

Three screens closing the gaps ROADMAP_FRONTEND §H.2 named, shipped 2026-08-30 as declared
demos on `governance.smoke.ts` (`NEW_REQUEST` · `LIVE_GATE` · `WAIVER_ROWS`) — those frames are
the reference shapes. Frontend acceptance: `governanceAdditions.test.tsx` (9 cases).

**7.11.1 — BR-EX-69, loop entry.** `POST /approvals` creates the R1 request the Inbox reviews.
Pick lists are the EXISTING registries; the request pins the run's artifact digest at submit and
records the requester for separation-of-duty. Duplicate (alpha, run) open request → typed 409.

**7.11.2 — BR-EX-70, live-gate payload.** The review room's backbone (eligibility, quorum, SLA,
optimistic version, decide verbs) already runs on `governance.r2-review.v1` — unchanged. This row
adds the canary evidence: twin-drift series (`chart-series.rules.v1`), canary KPIs, `gate_live`
criteria with SERVER-computed verdicts (BR-EX-67's rule), and the capital step. Frontend routes
`LIVE_GATE` inbox rows to `/governance/approvals/{id}/live` since 2026-08-30.

**7.11.3 — BR-EX-71, conditions register.** One keyset list over every condition any decision
created, with server-side state transitions (EXPIRING → LAPSED feeds the Command Center
attention stream). LAPSED is a blocking finding; nothing lapses silently.

**Registry rows** for the three routes are requested in HOTFIX_REQUEST_2026-08-30 §2 (frontend
claims the paths via its preview mechanism until then).

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

Phase 1 and Phase 2 are accepted. The first Phase 3 dev candidate failed owner
review at the rich-screen data composition seam. BR-EX-75 corrects that defect
in source and has passed offline/full-stack gates; its dev-only rebuild and
owner screen review remain. Continue without reopening N13–N29 or
reintroducing the former direct-browser/source path:

1. rebuild the canonical dev runtime from the reviewed Phase 3 commit;
2. Bobby reviews the complete dev screen matrix and records Product GO or
   concrete findings;
3. fix any owner finding and repeat the same acceptance matrix from one commit;
4. merge through protected `dev`, then propose `dev -> protected main` only
   after Product GO; stable remains a separate owner-approved release and
   rollback window.

The exact Phase 3 start/exit conditions are §4 above. The historical N13–N17
containment remains available in
[`EX_BE_N13_N17_DEBT_CLOSEOUT.md`](./backend/EX_BE_N13_N17_DEBT_CLOSEOUT.md)
but no longer describes the current next implementation step.

---

## 12. Evidence and detailed-reference index

Read these only when entering the mapped phase; this plan is the everyday overview.

| Topic | Detailed authority/evidence |
|---|---|
| Architecture and original phase mapping | `EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md` |
| Backend completed-slice index | `backend/README.md` |
| Claude original request/review | `upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_BACKEND_PLAN_REQUEST.md`, `BACKEND_PLAN_REVIEW.md` |
| Claude scale/current BR requests | `upgrade_frontend_plan_hifi/hifi_execution_loop/EXECUTION_SCALE_AND_REFINE.md` |
| **BR-EX-64 — chart series contract** | **§7.6 of this file** (the ten rules every charted series obeys, the DoR, the fixture-linter tests, and the additive amendments to 57/59/62 it carries). |
| **BR-EX-62/63 — full specification** | **§7.5 of this file** (Paper Workbench v1.1 + `paper-list.v1`, Paper Exit Review v1.1; deliberately small because the Paper contract already carries most of its hi-fi). |
| **BR-EX-60/61 — full specification** | **§7.4 of this file** (domain, both response shapes, source mapping to real columns, server rules, command routes and typed errors, DoR, required tests, open decisions, delivery order). The frontend document below carries the same content with screenshots and per-field UI rationale; **§7.4 wins on disagreement.** |
| **Hi-fi V2 requests BR-EX-41…63 — field-level detail** (types/enums/examples, DoR §5.1 pre-filled per package, OpenAPI path stubs, typed error/state examples, delivery order and per-package smoke retirement) | `upgrade_frontend_plan_hifi/hifi_execution_loop/BACKEND_REQUEST_HIFI_V2_2026-08-25.md` (appendices A–O; G/H/I = full JSON examples, derivation rules, errors, live events and required tests for BR-EX-49/50/51; J = source mapping and open decisions; K = BR-EX-52/53/54 bindings/accounts; L = BR-EX-56/57 live overview/full; M = BR-EX-59 canary; N = screen ↔ request coverage matrix and remaining gaps; O = BR-EX-60/61 sandbox overview + certification v1.1, with the seven certification steps mapped to real columns, the fail-closed rules, the four `sandbox.*` command routes and the five decisions codex must confirm); verbatim copy of the §7.2 rows: `…/BACKEND_PLAN_7_2_ROWS_2026-08-25.md` |
| UI/UX authority for those requests — what each screen must show and why | hi-fi files `…/Design system discussion request_version2/HiFi *.dc.html` + owner screenshots 2026-08-25; grammar and per-screen smoke table `…/DESIGN_GRAMMAR_V3.md` (§8); audit `…/AUDIT_DENSITY_AND_INSIGHT_2026-08-25.md` |
| Frontend smoke modules to delete on delivery (one per screen, contract at file head) | `apps/portal/frontend/src/execution/{commandCenter,incident,operationsQueue,blotter,stage,alpha360}.smoke.ts` |
| Shared frontend/backend board | `upgrade_frontend_plan_hifi/hifi_execution_loop/PHASE_TRACKER.md` |
| D4 finite acceptance | `backend/EX_BE_02_LIVE_D4_PAPER_READ_SHADOW_ACCEPTANCE.md` |
| D4 runtime optimization | `backend/EX_BE_02_D4_SOURCE_FACADE_RUNTIME_OPTIMIZATION.md` |
| Projection/Query/SSE/analytics | `backend/EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md`, `backend/EX_BE_04B_RUST_PROJECTION_QUERY_PRIMITIVES.md`, `backend/EX_BE_06_MULTIPLEXED_SSE_RESUME_BACKPRESSURE.md`, `backend/EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md` |
| **Phase 1 data truth/projection/realtime closeout** | **`backend/EX_BE_PHASE1_DATA_TRUTH_PROJECTION_REALTIME_FOUNDATION.md`** |
| **Phase 2 complete Screen BFF/controlled command closeout** | **`backend/EX_BE_PHASE2_COMPLETE_SCREEN_BFF_CONTROLLED_COMMAND.md`** |
| **Phase 3 rich UI/product/dev-release closeout** | **`backend/EX_BE_PHASE3_RICH_UI_PRODUCT_ACCEPTANCE.md`** |
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
| 2026-09-03 | **First AUTHENTICATED end-to-end payload probe (viewer user `claude-probe`, USER role, tự tạo qua bootstrap CLI — không đụng credential owner)**: sự thật từng route. TỐT: alpha 360 analytics serve equity 1,540 điểm phủ đúng 05/08→04/09 downsample khai báo (source 10,119 rows); correlation AVAILABLE 66 cặp/43 alpha; drawdown AVAILABLE 43 alpha + 6 cửa sổ trùng; workbench 1,540+1,699 điểm windows khai báo. HỎNG — đích danh: (1) **/screens/paper overview chỉ serve 200 rows equity thô** (cap 200/relation của screens BFF, 43 account trộn ≈ 5 điểm/account) → chart overview không thể ra hồn, phải build DERIVED-sum series từ mirror phía server; (2) **payload khổng lồ**: workbench 5.9MB, alpha analytics 2.4MB (rows đầy đủ fields thay vì series (t,v)) — xác nhận R2 perf; (3) completeness PARTIAL toàn cục do 5 trang nóng transactional bounded-by-design + portfolio_equity typed-rejected → 'stage-equity' PARTIAL, polish 'ready' tắt — cần tách 'serving completeness' (window đã giao đủ, truncated khai báo) khỏi 'population completeness'; (4) workbench orders/fills=0 cho deployment probe (trang nóng 400 không chứa) — Lane E2 | curl + cookie session thật, files scratchpad paper/alpha/wb.json; kế tiếp: Fix A (overview series từ mirror) + Fix C (completeness semantics) |
| 2026-09-03 | **Owner question "hiệu ứng động showcase biến mất trên dev-portal?" — investigated, NOTHING was removed**: HEAD chứa NHIỀU code hiệu ứng hơn nhánh showcase (287 vs 279 match; cả 2 nhánh showcase đều là tổ tiên của nhánh hiện tại; image portal-web:dev build 02:34 SAU commit FE cuối). Nguyên nhân thật: (1) **51 animation rule đều gate theo data-state đúng thiết kế hi-fi D4** — dot thở chỉ khi FRESH, pulse chỉ khi bad/CRITICAL/overdue, flash chỉ khi delta tick; showcase chạy fixture dàn dựng đủ trạng thái nên mọi effect nổ, dev chạy dữ liệu thật (không incident CRITICAL, không SLA overdue → im lặng là ĐÚNG); (2) hiệu ứng grow-on-mount chỉ chạy lần đầu vì P4-C giữ cây mounted khi revalidate (chủ đích chống loading-flash); (3) envelope PARTIAL toàn cục (portfolio_equity typed-rejected) ghìm polish "ready" ở mọi màn — sẽ tự hết khi release-kit/acceptance dọn trạng thái đó. Muốn effects nổ lại đúng cách: un-halt (tick/flash CC có delta thật) + dọn PARTIAL, KHÔNG phải bỏ gating | git diff/grep evidence hai nhánh + execution.css lines 1653-5094; không đổi code |
| 2026-09-03 | **Owner question "gai là do dữ liệu hay do vẽ?" — answered with forensics, BOTH, each named**: (a) phần lớn band lởm chởm cũ = trộn account (đã sửa bằng DERIVED sum); (b) một phần gai là DỮ LIỆU NGUỒN THẬT — `signalcombine00230m` ping-pong ±1.5-2% equity mỗi ~90s do `unrealized_pnl` flip giữa hai mức mark (đối chiếu row-for-row với bảng HK: trùng khớp tuyệt đối, ids 3790924-3791526); các account nhỏ `combine_weight_*` cùng pattern ở ±10-20% base; mirror không trùng row, không méo. Ghi thành BR-EX-79 item 1.5 (câu hỏi marking cho trading owner) | SQL forensics cả hai DB trong changelog + BR-EX-79 1.5; không đổi code — Portal đang render đúng sự thật |
| 2026-09-03 | **§14 Lane E1 first slice LIVE — the two N25 insight tiles compute locally**: `portfolio-correlation` (Pearson over overlapping daily returns, per-strategy daily closes = last close per account per day forward-filled from common start, exact-decimal sums) and `portfolio-drawdown-overlap` (per-alpha drawdown series + max-dd markers + merged co-drawdown windows) now serve from the history mirror; capability states flip AVAILABLE only when ≥10 overlapping days exist, thinner pairs keep the honest N25 code. New repository read `timeSeriesDailyCloses` (one real row per strategy/account/day). Live mirror check: 10 alphas with 48-66 days of closes each → up to 45 correlation pairs light up on Alpha/Fleet 360 | control gate 321/321 (+3 regressions incl. the anti-phase-vs-monotone correlation trap); dev rebuilt, runtime green |
| 2026-09-03 | **Owner-caught chart serving defects closed (Paper screen review)**: (1) the "30D" equity chart rendered two days — the mirror depth read paged ASC with a 2,000-row cap and returned the oldest slice; new `timeSeriesHistoryDownsampled` covers the whole range with per-series bucket extrema + closing row (real rows only, extrema survive by construction, downsample declared on the envelope; sparse ranges exact), wired into both mirror consumers. (2) Needle spikes — `equitySeries` interleaved raw multi-account points into one line; any multi-account subject now serves the forward-filled exact-decimal sum declared DERIVED (`equity-account-sum.v1`). Owner's storage-and-append ask confirmed already live (history mirror + tail-follow) — these fixes are the serving layer over it | control gate 318/318 (+4 regressions: whole-range coverage, extrema survival, real-rows-only, exact path, entity filter, 9000-vs-110 spike scenario → 9100→9110); dev rebuilt, mirror tail-following (572k rows to 15:00Z) |
| 2026-09-03 | **Question Q closed by investigation (owner-granted trading-core read-only scope)**: the 17-day trading silence is a deliberate operator kill-switch — Redis `system:trading_state:*` = HALTED (writable only via the gateway admin endpoint), set in a 30/08 wind-down sequence (halt 12:20 → runner stops 13:46 → host off ~23:54 → boot 03/09 06:27). Items 1.2 and Q collapse into one owner decision: when to un-halt. Post-boot health flags recorded for the un-halt check (`paper_execution` boot loop error, `market_data` heartbeat BAD) | findings + timeline committed HK-side (`BR_EX_79_SOURCE_FINDINGS_2026-09-03.md`); BR-EX-79 Q updated in place |
| 2026-09-03 | **HK paper read-plane deploy (owner-approved rule-12)**: cursor-TTL 48 h image LIVE (old catalogue, digest unchanged; one self-healed wave of expiring 5-min cursors). Scoped-balances catalogue attempt **failed closed and rolled back in ~8 minutes** — discovered the Edge compiles an exact-set N18 relation census into its binary (`manager-compat-authority` `include_str!` + digest const), so any additive catalogue change rejects every relation until the edge is rebuilt; Portal carry-forward preserved all windows through the outage. Release kit staged for one coordinated window (inert DB view live; validated regeneration tool `regen-catalogue-scoped-balances.py` committed HK-side; edge census+digest bump + SGP rebind documented). BR-EX-79 1.4 RESOLVED; items 4+5 blocked on that window | steady state verified: 0 non-portfolio relation failures over multiple cycles, cursors advancing, windows 2000/2000 intact |
| 2026-09-03 | **BR-EX-79 source-side verification pass (owner-directed, on the HK host, read-only)**: every P0/P1 item now carries a measured answer — 1.2 is NOT a producer defect (last fill anywhere 17/08 04:24Z, 0 open positions → instrument cadence correctly idle; collapses into sharpened Q for the owner); 1.3 is unscopeable by data reality (portfolios span modes/venues → Portal DERIVED sum stays authoritative); items 4+5 share one root cause (`account_balances` has no mode/venue; scoped-view fix prepared, awaiting catalogue/policy ceremony + rule-12 restart); items 6-7 relations are genuinely empty at source. Findings committed in the trading worktree (`BR_EX_79_SOURCE_FINDINGS_2026-09-03.md`) + journal; SGP request file statuses updated in place | HK commits on `fix/manager-cursor-ttl-tail-follow`; live DB measurements quoted in both files |
| 2026-09-03 | **Data activation VERIFIED COMPLETE + workbench depth**: equity mirror caught the source's hourly tail live (571,424 rows, newest 10:30Z same-day; performance 129,178 = 100% of what the source holds, ends 2026-08-17 where the instrument producer died — BR-EX-79 1.2). Paper screen windows hold 2,000 fresh points each with zero wipes after the TTL fix. Per owner directive ("hiển thị nhiều nhất để phân tích"), the per-deployment workbench now serves the full 30-day series (~720 hourly points) from the history mirror, declared `history_windows{basis: PORTAL_SGP_HISTORY_MIRROR}`, snapshot rows as fallback; overview embeds widen to the 200-row source-page bound. Deliberately NOT raised: the 2,000-row hot-snapshot invariant — raising it is part of the owner's planned capacity-upgrade phase, not a quick constant bump | gate 315/315; dev deployed clean (0 errors post-restart); runtime verified same-hour tail-follow |
| 2026-09-03 | **Tail-follow cursor-TTL loop: found, root-caused and closed on both sides**: the facade codec mints page cursors with `exp = iat + 5 min` and a tail page mints none, so the held tail cursor always rotted -> `CURSOR_EXPIRED` -> `MANAGER_V2_SOURCE_CONTRACT_REJECTED` -> the old error path wiped the accumulated window and restarted the full oldest-first backfill (observed live 09:01Z on `performance_snapshots` minutes after its window first filled). Closed SGP-side in `b000d0d`: (a) the drain re-reads the final page with `limit K−1` each cycle to force a fresh cursor issue (one extra bounded request, inside the read contract), and (b) a failed ladder refresh now carries the accumulated window forward marked `N31_LADDER_REFRESH_DEFERRED` instead of erasing it (a relation that never delivered rows keeps its honest UNAVAILABLE). Additionally the HK worktree carries branch `fix/manager-cursor-ttl-tail-follow` (`99515e8`, Bobby identity): TTL 5 min -> 48 h at the codec — now **optional** (the workaround unblocks everything); deploying it would remove the extra request but needs rule-12 recreate approval (rollback image `2e80ad38`). BR-EX-79 gains item 1.4 + §5.1 | gates 312/312 then 314/314; worker logs (`ladder_drained` 10k rows/cycle; `relation_failed` 09:01Z); facade code `exp=iat+5min`; live history: performance mirror COMPLETE 129,178 rows to the source's last cut (08-17 04:24), equity past 250k/571k at ~4k rows/min |
| 2026-09-03 | **Full-depth time-series history store (owner directive: "lấy hết dữ liệu phục vụ phân tích, không cắt 30d")**: new `execution_timeseries_history` table keeps EVERY lineage-accepted drained row exactly (append-only, idempotent), filled as a side effect of the resumable drain; new authenticated read `GET /api/v1/execution/history/:environment/:relationKey` (keyset (ts,id) paging, range + entity filters, declared coverage, authority `PORTAL_SGP_HISTORY_MIRROR`). The snapshot ladder stays the bounded screen embed and its cap is corrected 5000→2000 to match the projection document's own 2,000-row relation invariant (at 5000 the ladder could never have committed once full — latent commit-breaker). Ladder cursors reset once so the store backfills from the head of each stream | control gate + new regressions (worker persists full depth incl. pre-window rows, ghost-lineage rows excluded; history read paging/range/filter/coverage + error contract); dev rebuild pending |
| 2026-09-03 | **F6 root cause closed (owner-directed, both sides)**: verified on the source DB that equity data was never missing (690,254 rows, hourly, newest same-day) — the Manager pages time-series by `(ts,id)` ASC from row one and the SGP drain restarted every cycle, so the portal forever re-read the oldest 400 rows. SGP fix deployed: persisted per-relation resume cursors, ten-page ladder budget, tail-follow (no full re-pass), rotted-cursor recovery. HK side (branch `fix/manager-read-restart-policy`, commit `b24bc8c`, Bobby identity, unpushed): manager-read compose gains `restart: unless-stopped` after the reboot outage; runtime containers updated to match. BR-EX-79 items 1.1–1.3 upgraded to exact verified diagnoses (1.1 closed Portal-side; 1.2 = instrument producer dead since 08-17; 1.3 = `profile_columns: []` unqualified policy entry) | profile-projection 13/13 fresh-PG; control gate 310/310 + restore parity; dev rebuilt; catch-up ~30 min then hourly tail-follow |
| 2026-09-03 | **Incident + fix (AWS-HK, owner-authorized edge scope)**: host rebooted ~06:29Z; the six portal manager-read containers (paper/sandbox/live × issuer+read) had no restart policy and stayed down → token issuer :8024 refused → source-proxy auth 502 → every edge N24 cycle failed closed and the portal fed frozen pre-reboot state. Claude started exactly those six containers (`docker start`, no recreate; rollback = stop). First cycle recommitted with 8,797 records; source-proxy 0 errors; SGP sequences advanced (2868→2870/2871/2879). Follow-ups: (a) add `restart: unless-stopped` to those six on the HK side; (b) BR-EX-79 P0 stands — equity relations still publish 0 rows even with the Manager plane healthy, root inside the trading system (performance plane), pending owner scope extension | verified live end-to-end at 06:46Z; blast radius = six stopped containers only; no config, image or data change on either side |
| 2026-09-03 | Claude: full source-side sweep published as BR-EX-79 — `upgrade/backend/EXECUTION_SOURCE_PUBLICATION_REQUEST_2026-09-03.md` (13 prioritized publication items + 1 question for the Execution Cell agent; equity/performance resumption is P0, parent-set integrity findings P0, MC-01…09 restated, `PAPER_DNSE_VNM` deferred per owner). Owner also waived the R1 APPROVE exercise — the F17 chain evidence stands at the real PENDING approval | verified live against projection snapshots + worker logs on 2026-09-03; documentation only — no runtime, flag, profile or command change |
| 2026-09-03 | **Bobby decisions (recorded)**: (1) `PAPER_DNSE_VNM` taxonomy **APPROVED** — Portal-side implementation authorized, flag off until the Edge publishes the profile origin; (2) Rust edge per-class polls + journal push/tail groundwork authorized to be written in-repo now (AWS-HK deploy remains Bobby's activation); (3) Claude to investigate the QUEUED research run `d734e2c443d14a92` and complete it through the real path if possible to unlock the F17 chain; (4) release: Bobby reviews the dev runtime visually before any PR to protected `dev` | owner decision via interactive session; P4-D taxonomy row moves `OWNER_DECISION_PENDING` → `APPROVED_IMPLEMENTATION_IN_PROGRESS` |
| 2026-09-03 | Claude: P4-E published — production streaming configuration matrix (per-row owner/rollback), client delta budgets, measured dev load + SSE fan-out evidence (`deploy/execution-phase4/production-streaming-config.md`); named the remaining pre-GO items; recorded F18 (same-key concurrent create can 409 instead of replay under load — fail-closed, retry-safe) | load probe measured on the rebuilt dev runtime (table in the doc); FE production build exit 0; full control gate re-run; no flag, profile or command change; production activation stays with the unchanged release train |
| 2026-09-03 | Claude: P4-D closed except the owner taxonomy decision (`PAPER_DNSE_VNM` → `OWNER_DECISION_PENDING`) — lineage reject counters on capability + snapshot envelope, merged-snapshot 30 d window ladder with declared truncation, exact DERIVED portfolio equity (`portfolio-equity-derived.v1`) | paper-read 16/16, execution-analytics 14/14, profile-projection 11/11 incl. ladder merge regressions; additive contract widening (`lineage_rejects`); full control gate re-run; one-atomic-read invariant preserved |
| 2026-09-03 | Claude: P4-I/F17 — dev write-path liveness verified (typed fail-closed 422 on the only real, ineligible research run; zero rows persisted; honest-empty governance/ops reads), end-to-end chain waits on a real eligible evidence run (named external gate → P4-E evidence run) | authenticated probes through the gateway with full mutation security; no record seeded, no flag/profile/command change |
| 2026-09-02 | Claude: P4-C closed (F3 freshness budgets + AGING tier + envelope-declared budget; F4 realtime coverage for Fleet/360s/register + ≤1 s delta coalescing + in-place revalidation) and P4-I/F16 closed (versioned observation policy + honest gate verdict) | profileIntegration 8/8, manager-lists 11/11 fresh-PG, paper-read 15/15, contracts gate pass, control-api 291/291 + restore parity, frontend 96 files green; additive schema widening only; no flag/profile/command change |
| 2026-09-02 | Claude: P4-H closed (`INTEGRATION_COMPLETE`) — CC needs_you gains reconciliation findings, Today gains the bounded 24 h journal window (one atomic projection read), product route opens the published CC stream; latent stream-cycling hook bug fixed | command-center spec 11/11 fresh-PG incl. the projection-join regression and honest-partial expectations; commandCenterStream spec 21/21 incl. container connect/refusal; contracts additive enum widening regenerated; full gates re-run green; read-only, no flag/profile/command change |
| 2026-09-02 | Claude: P4-B closed (`INTEGRATION_COMPLETE`; Fleet equity spark deferred to the P4-D window ladder) — per-capability tile binding by id across all 12 analytics branches, `formatExact` display authority, Fleet/register formatting delegated | brEx72 spec 11/11 incl. a 12-capability binding regression; formatExact 6/6; full frontend Vitest suite green; frontend tsc clean; presentation-only — no contract, flag, profile or command change |
| 2026-09-02 | Claude: P4-A closed (`INTEGRATION_COMPLETE`) — BR-EX-76 portfolio identity list (`execution.portfolio-list.v1`), portfolio register route truth (PF-CRYPTO defaults removed), Portfolio 360 spine = portfolios ∪ Fleet | manager-lists 10/10 fresh-PG incl. degraded-profile + lineage negatives; contracts gate pass; full frontend Vitest exit 0; N29 verifier extended (route set + BR-EX-76 pins) and green; authenticated dev journey returned 2 real portfolios with exact capital and three AVAILABLE profile branches; read-only, no flag/profile/command change |
| 2026-09-02 | Claude: P4-F and P4-G closed (`INTEGRATION_COMPLETE`) — order-status normalization with quarantine counters, shared versioned status map, composite analytics ids, blotter exact-query plane active, Paper overview `derived_insights` (additive contract) | commits `92fd124`/`7a04443`/`2f2ce9a`/`6b972b8`; control-api gate 31 suites / 285 tests with fresh PostgreSQL + dump/restore parity; contracts workspace gate pass; dev control-api image rebuilt and probed authenticated: 364-order blotter with exact totals, real aggregates, bidirectional keyset cursors and canonical REJECTED filtering; no flag, profile or command change |
| 2026-09-02 | Claude (backend co-impl per owner grant): Phase 4 owner-findings closeout and production-streaming specification + measured findings register F1–F10 + BR-EX-76/77/78 | read-only investigation of the rebuilt dev runtime (projection SQL, BFF source, deployed env); root causes verified at the seam (route default, tile mapper, 5 s freshness constant, realtime coverage, lineage taxonomy, 400-row windows); no code, runtime, flag or schema changed by this entry |
| 2026-09-02 | Corrected and rebuilt Phase 3 owner finding BR-EX-75 at the Alpha/Portfolio rich-screen composition seam | one atomic SGP projection response now carries bounded screen facts to all ten Alpha tabs; Portfolio keeps Fleet identity/holdings when optional analytics fails; contracts 115/115, Control API 281/281 plus restore, 1,805 frontend tests and clean Docker build pass; canonical dev images are healthy and owner review is pending, main/stable unchanged |
| 2026-09-02 | Accepted Phase 3 rich UI/BFF implementation and pre-release gates | Claude's rich compositions remain mounted across 23 same-origin Screen BFF roots; real Paper/Sandbox/Live/profile/analytics facts, bounded SSE and four local R0 receipts are wired; 1,803 frontend + 281 Control API + 115 contract assertions, full Rust/Clippy, browser interaction/visual and dependency gates pass; canonical dev rebuild and Bobby Product GO are the remaining owner review step; main/stable unchanged |
| 2026-09-02 | Accepted Phase 2 complete Screen BFF and controlled command plane | 23/23 same-origin screen roots, eight finite screen slices and four SGP-local R0 tasks pass 113 contract + 280 Control API tests, full monorepo verification and authenticated real dev smoke; command relay/main/stable/rich UI unchanged; Phase 3 ready |
| 2026-09-02 | Accepted Phase 1 data truth, local projection and unified realtime foundation | real dev Paper/Sandbox/Live projection is active from one lease-controlled cadence; 2,500 real rows show zero lineage/mode mismatch; local BFF, four bounded adapters and five-kind SSE contract pass 272 tests plus PostgreSQL restore; one source-rejected Paper relation stays typed unavailable without disabling its profile; Phase 2 ready, commands/main/stable unchanged |
| 2026-09-02 | Authorized and specified complete Phase 1 (N30–N32) | one data-first implementation phase now owns profile/lineage truth, SGP-local projection-only product reads, bounded activation of present-source read adapters and one five-kind realtime envelope; exact nine-class evidence gate recorded; UI/commands/main/stable unchanged |
| 2026-09-02 | Added N29-RTA runtime truth reset and finite N30–N36 data-first closeout plan | supersedes the product interpretation—not the valid contract evidence—of N29; records real deployed screen/BFF states, 60 s source projection / 100 ms local journal / 750 ms direct cache behavior, Live profile leakage, remaining disabled/source-dark paths, projection-first dual-cell target and PostgreSQL-hot/Parquet-cold storage decision; `PRODUCT_NO_GO`, main/stable unchanged |
| 2026-09-01 | Closed Alpha 360 current-source composition and projection-workspace integration | Fleet v2 remains the rich screen spine; N25 analytics is additive; private Query/SSE delegation maps to one exact execution-cell projection workspace without widening Portal RBAC; real Fleet click-through and both BFF reads pass; command/Live mutation/main/stable unchanged |
| 2026-09-01 | Closed Alpha Fleet current-source v2 implementation | expanded BR-EX-72 to the existing strategy/deployment/account/balance/portfolio/allocation/position/reconciliation source set; global multi-profile projection, exact decimals, multi-stage filter/drill-down and rich-screen regression gates pass; bounded 30-day source window remains typed unavailable; dev runtime acceptance is the only slice-local gate |
| 2026-09-01 | Added exact Paper/Sandbox/Live current-source runtime activation authority | preserved historical N19; bound N22/N23/N29 release profiles and sanitized multi-profile mTLS evidence; Sandbox real rows and Live authoritative empty qualified; rich UI stays mounted with panel-local truth; command/Live mutation remain separate and false |
| 2026-08-30 | N13B–N17B Debt Closeout and BR-EX-67 canonical intake | no open merge blocker; stale N13/phase-18/next-phase wording reconciled; activation debt and future-contract limitations receive IDs, owners and exact gates; BR-EX-67 R1/R2 evidence/policy-verdict scope is canonical and the next request is BR-EX-68; no runtime/profile/source/command change |
| 2026-08-29 | Accepted N16B current-primitive protective-path compatibility | exactly one current primitive, `live.emergency-close`, is accepted for `LIVE_FULL / ACCOUNT / BINANCE / USD_M`; Rust and TypeScript reject identity, target, payload, R4 and runtime widening; the other eight N12 commands are typed inactive/absent; public route, transport, source call and Live mutation remain false pending N17B exact owner window |
| 2026-08-29 | Accepted N17B exact current set | Portal adapts the exact Paper screen to current Manager-v2 routes, hard-caps source admission at 15 r/s, and records 25/25 paced private reads plus 401/403/405 negatives; N17A recovery/rollback is retained; signed product image, public BFF, Sandbox/Live reads and Live mutation remain inactive |
| 2026-08-29 | Accepted N15B current-capability inter-cell gateway for the bounded Paper Query slice | Rust Edge and TypeScript BFF enforce the exact Paper screen/profile before transport; Command is deferred N16B, Event/Artifact typed absent, immutable D3/Manager evidence revalidated; product/runtime/registry/SSE/command/Trading-System-change flags remain false |
| 2026-08-29 | Accepted N14B immutable current-source release compatibility for the first bounded Paper target | exact signed N14A candidate plus N13B source/qualification/profile pins, adapter/config digests, three immutable service image digests and rollback/forward-fix chain are bound in a separate adjunct; all runtime/profile/registry/source/Query/SSE/command/Trading-System-release flags remain false; N15B Query acceptance is next |
| 2026-08-29 | Rebaselined N13B–N17B from global contract-first blocking to source-as-is, capability-by-capability compatibility | documentation/decision only; N13A–N17A evidence preserved; Manager-v2/current Gateway/current market and Portal derivations become valid bounded sources behind versioned adapters; read/command identities and production gates remain separate; no runtime/profile/source/command change |
| 2026-08-29 | Accepted N13B Portal current-source implementation and exact source set | 4 profiles / 16 sources / 29 capabilities / 20 screens; owner publication and real Paper Manager qualification manifests pinned; Rust exact read boundary plus TypeScript multi-profile BFF added; all runtime/profile/command flags and registry data modes remain unchanged pending N14B |
| 2026-08-25 | Initial unified plan: current D1–D4 truth, N00–N17, H/A/BR-EX-01…40 and future Claude intake | documentation only; no runtime/profile/source/command change |
| 2026-08-25 | Claude: §7.2 BR-EX-41…59 appended (`RECEIVED`) — hi-fi V2 Command Center 5a / Incident 4d / stage workbenches; schema appendix in `hifi_execution_loop/BACKEND_REQUEST_HIFI_V2_2026-08-25.md` | documentation only; no runtime/profile/source/command change; codex triages per §7.1 |
| 2026-08-26 | N09 BR-EX-30/31/32/33/35/36/37/38 closed | Portal contracts/repository/API/codegen complete; registry write policy false; production/source/command inactive |
| 2026-08-26 | N10 BR-EX-34/39/40 closed | Rust pure engines + schema/OpenAPI/generated TS + canonical fixtures complete; routes/source/SSE/registry/commands inactive |
| 2026-08-26 | N11 Portal publication gate + adapters closed | one 24-capability owner request, byte-bound schema/fixture verifier and strict Rust GET adapter complete; owner publication/source/runtime pending |
| 2026-08-26 | N14A Portal release authority closed | six digest-pinned images, CI-bound SBOM/SLSA/Trivy/signature evidence, owner acceptance contract, dev/stable isolation and PostgreSQL restore/forward-fix rehearsal complete; N14B owner binding pending, source/runtime inactive |
| 2026-08-26 | N15A four-interface gateway authority closed | independent Query/Command/Event/Artifact negotiation, split identities, bounded transports, Event continuity, Artifact reference policy and local fault doubles complete; N15B owner publication pending, network/source/runtime inactive |
| 2026-08-27 | N16A same-domain emergency-routing authority closed | same-origin/origin-isolation templates, short session/WebAuthn ceremony, typed health/failure states, immutable audit and local Research/Cloudflare/origin/rollback drills complete; R3 unpublished, R4 forbidden, N16B pending, public route/source/runtime inactive |
| 2026-08-28 | Claude: §7.2 BR-EX-60/61 appended (`RECEIVED`) and specified in full in §7.4 — Sandbox Overview `sandbox-overview.v1` (new) + Sandbox Certification v1.1 (additive) with four `sandbox.*` command routes | documentation only; no runtime/profile/source/command change; five decisions listed in §7.4.6 are codex's to confirm; frontend screens are built and running on smoke until delivery |
| 2026-08-28 | Claude: §7.2 BR-EX-62/63 appended (`RECEIVED`) and specified in full in §7.5 — Paper Workbench v1.1 + `paper-list.v1`, Paper Exit Review v1.1 | documentation only; no runtime/profile/source/command change; the Paper contract already carries most of its hi-fi, so these two rows are deliberately small; four decisions in §7.5.5 are codex's to confirm | · amended same day for the delivered Paper Overview hi-fi (`paper-overview.v1` supersedes the bare `paper-list.v1`, §7.5.1)
| 2026-08-28 | Claude: §7.2 BR-EX-64 appended (`RECEIVED`) and specified in §7.6 — the chart series contract, written after the real-chart pass replaced every SVG stand-in on Paper/Canary/Live; §7.6.2 carries additive amendments to BR-EX-57/59/62 and escalates the OHLC-owner decision (§7.5.5(1)) now blocking two screens | documentation only; no runtime/profile/source/command change |
| 2026-08-28 | Claude: §7.6.6 appended — Portfolio 360 pass names `PF_CHARTS.rho`/`PF_CHARTS.ddOverlap` as reference fixtures for BR-EX-34's ρ-timeline and drawdown-overlap series, and records the now-active Rebalance plan / Report pack controls as BR-EX-51's enable points | documentation only; no runtime/profile/source/command change |
| 2026-08-29 | Claude: §7.2 BR-EX-65/66 appended (`RECEIVED`) + specs §7.7/§7.8 — the ρ-timeline and drawdown-overlap series get their own row (correcting §7.6.6(1), which had attached them to BR-EX-34, closed 2026-08-26 without them), and the now-live Rebalance plan / Report pack controls get their command row (plan → apply → verify · digest-pinned report pack) | documentation only; no runtime/profile/source/command change |
| 2026-08-30 | Claude: §7.2 BR-EX-67 appended (`RECEIVED`) + spec §7.9 — R1/R2 evidence series, portfolio-fit estimates, versioned gate-policy criteria/verdicts and stage eligibility are specified as server-owned additive fields | documentation only; no runtime/profile/source/command change |
## 14. P4-G — Data-exploitation plan (owner request 2026-09-03: "xử lý hết vấn đề hiện tại, khai thác hết dữ liệu")

Written after a full-screen investigation on the live dev runtime at
2026-09-03 ~15:30Z. Every state below was measured (snapshot envelopes,
history-mirror counts, capability reason codes), not inferred. This section
is the plan of record for closing the remaining data gaps; the change log
tracks execution.

### 14.1 Measured residual problems, screen by screen

| Screen | What is wrong today | Root cause (verified) | Fixable where |
|---|---|---|---|
| Alpha/Deployment 360 — insight charts | Of 12 declared capabilities, 4 are dead tiles: `market-candles` UNAVAILABLE (N28), `portfolio-drawdown-overlap` UNAVAILABLE (N25), `portfolio-correlation` EMPTY (N25), `portfolio-rho-timeline` UNAVAILABLE (benchmark), `canary-drift` UNAVAILABLE (twin join). `contribution` uses fills only (no time dimension). `stage-equity`/workbench now serve full range (fixed today) but performance series data ends 2026-08-17 (halt) | N25 reason codes predate the history mirror — the mirror now holds 8+ alphas × ~50k equity points over 65 days, which is exactly the "multi-alpha history" N25 says is missing. Candles/benchmark/twin-join are genuinely source-side (N28/MC-01..09) | **SGP, now** (N25 pair + contribution); source later (candles/benchmark/twin) |
| Paper Trading / Workbench | Charts good after today's fixes; performance (per-instrument) series frozen at 17/08 | Trading halted 30/08 (kill-switch), no fills since 17/08 — producer idle by design | Owner un-halt |
| Full Blotter | Orders 364 / fills 55 / journal 400 rows = the bounded snapshot page only; scale target is 10^5-10^7 rows with keyset paging | orders/fills/command_journal are NOT ladder relations — no mirror, no resume; every cycle re-reads the newest bounded page | **SGP, now** (extend mirror to transactional relations) |
| Accounts/Bindings | balances rejected per lineage on live (orphans) and cross-family rows on paper; venue_accounts/margin/sync all 0 | Verified at source: `account_balances` has no mode/venue; live `accounts` don't exist; the three zero tables are genuinely empty | Release kit (staged, HK) + trading features |
| Sandbox Certification | sessions 0, margin 0, sync 0 — screen is skeleton-only | Sessions exist only in the shared table with mode scoping — sandbox never ran sessions; margin/sync empty at source | Trading side (run sandbox cycles) |
| Live Full Operations | Everything 0 except strategies/portfolios | No live accounts/deployments exist; live intentionally HALTED at risk gate | By design until live activation |
| Portfolio 360 | equity = DERIVED sum (correct); rho-timeline dead | portfolio_equity unscopeable (verified: portfolios span modes/venues); benchmark source not activated | DERIVED stays; benchmark = MC |
| Command Center | Healthy | — | — |

### 14.2 The plan — four lanes in priority order

**Lane E1 — exploit the mirror for insight charts (SGP-only, no dependencies, do first)**
1. `portfolio-correlation` (formula `portfolio-correlation-returns.v1`): compute
   pairwise correlation of daily returns across all alphas from the equity
   mirror (per-strategy forward-filled daily closes over the mirror span, not
   just 30 d); serve matrix + per-pair sample counts; state EMPTY→AVAILABLE
   with declared window and row counts. Kill reason code N25 where the mirror
   depth suffices; keep it only when a pair has <10 overlapping days.
2. `portfolio-drawdown-overlap` (`drawdown_overlap.v1`): per-alpha drawdown
   series from the same daily closes; overlap = co-drawdown windows across
   alphas; serve as chart series + summary stats.
3. `contribution` upgrade: time-dimension contribution from the equity mirror
   (per-deployment share of summed equity over the window) alongside the
   existing fills-based exact totals.
4. Per-alpha insight extras now free from the mirror: rolling 7d/30d return,
   max drawdown + date, equity high-water mark, per-account series option
   (series per account, honestly labeled, instead of only the DERIVED sum).
   Every new series declares formula_version + window + downsample envelope.
   Gate: analytics spec regressions per formula with exact-decimal fixtures.

**Lane E2 — extend the history mirror to transactional relations (SGP-only)**
1. Add `orders`, `fills`, `command_journal`, `execution_sessions` to the
   mirror classes (append-only, id-keyed, same resumable drain; serving keys
   verified against the manager catalogue before enabling each).
2. Blotter/workbench read keyset pages from the mirror (10^5+ rows scale per
   §8 scale-refine), snapshot page stays the hot fallback.
3. Retention policy: mirror is append-only forever for time-series; for
   transactional relations declare a retention floor (e.g. 180 d) in the
   envelope; add the pg index budget note to the perf matrix.
   Gate: fresh-PG regressions (resume, idempotency, keyset pages) + control gate.

**Lane E3 — unlocks that need the owner or the HK release window (queued, not blocked on code)**
1. Owner: un-halt paper/sandbox (3 Redis keys) → performance producer resumes
   within one open-exposure cycle; then re-verify `paper_execution_service`
   (boot loop error) and `market_data` heartbeat.
2. HK release window: ship the staged scoped-balances kit (edge N18 census +
   digest bump + edge image + facade catalogue/policy `.new` files + SGP
   rebind) — closes items 4+5 (balances lineage rejects on all profiles).
3. Source activations MC-01..09 (candles, benchmark, ticks, calendar,
   twin-join) — the four remaining dead insight tiles light up here;
   BR-EX-79 already carries the exact asks.
4. DNSE family activation when the owner schedules it (groundwork landed).

**Lane E4 — hygiene and scale evidence**
1. Soak the per-class poll targets + re-run the §3 load table (P4-E matrix)
   including mirror-backed chart routes and downsampled reads.
2. Visual baseline re-run after E1 series land (46 operations-theme
   snapshots).
3. History-mirror observability: per-relation coverage row (rows, span,
   tail age) on the operator/CC view so backfill state is a glance, not a
   psql query.

### 14.3 Order and closure conditions

E1 closes when: correlation + drawdown-overlap + contribution serve AVAILABLE
with declared formulas on the live dev runtime for at least 3 alphas, N25
reason codes appear only on genuinely thin pairs, and the control gate is
green with the new regressions. E2 closes when the blotter pages 10^5 rows
from the mirror under the §8 budgets. E3 items close on the owner's two
decisions plus the HK window (each already fully staged). E4 closes with the
soak + visual baseline evidence rows in this file.

## 15. Toàn cảnh trạng thái 2026-09-03 tối + đề xuất restructure cách làm (owner yêu cầu)

Viết theo yêu cầu Bobby: "báo cáo toàn bộ trạng thái để tôi restructure lại
cách làm". Mọi con số đo lúc ~17:00Z. Phần A-C là sự thật; phần D là nhận
định thẳng về cách làm; phần E là phương án — Bobby chọn, không tự áp.

### 15.A Backend — cái gì ĐANG CHẠY, cái gì CHƯA

ĐANG CHẠY trên dev (nhánh `feat/execution-data-activation`, đã push origin):
- Data plane: cursor-resume + tail-follow + carry-forward + K−1 refresh;
  history mirror 572k+ rows equity (đủ 30/06→hôm nay, bám đuôi theo giờ),
  129k rows performance (đủ tới 17/08 — nơi trading halt).
- Serving: chart full-range downsample giữ extrema; đường tổng multi-account
  DERIVED; correlation + drawdown-overlap tính từ mirror (10 alphas × 48-66
  ngày); endpoint history full-depth cho phân tích.
- HK: TTL cursor 48h live; restart-policy fix; 2 nhánh đã sẵn (chờ Bobby push
  vì classifier chặn push remote).
- Gates hôm nay: 310→312→314→318→321/321, không lần nào đỏ khi commit.

CHƯA XONG (đúng như Bobby cảm nhận — liệt kê thẳng):
1. **Perf — lý do chính "chưa mượt"**: snapshot Paper phình **974 kB** (2×2000
   rows ladder trong payload) → mọi read /screens/paper compose từ đó; số đo
   P4-E cũ đã 2.5s p50 / 4s p95 ở 315KB — giờ nặng hơn ~3×, CHƯA đo lại,
   CHƯA có gate perf. Root: kiến trúc "một document lớn cho cả màn" + ladder
   items nhúng thẳng vào snapshot thay vì chart series đã ép mỏng.
2. Blotter vẫn 400 rows snapshot (Lane E2 chưa làm).
3. 3 tile insight còn chết chờ nguồn (candles/benchmark/twin — MC-01..09).
4. Bug được phát hiện bằng MẮT BOBBY (chart 30D/2 ngày, gai kim) — nghĩa là
   thiếu lớp gate tự động trên dữ liệu thật; cái sửa hôm nay là sửa ĐUỔI.
5. Trading halted (chủ đích) + release-kit scoped-balances chờ cửa sổ deploy.

### 15.B Frontend — KHÔNG mất gì

Kiểm bằng git: 7 ngày qua chỉ 2 file FE bị xoá, đều chính đáng (probe spec
cũ; `PaperList.tsx` được thay bằng Paper Overview hi-fi mới trong `0b82a56`).
Working tree FE sạch. Toàn bộ code FE của Claude còn nguyên và nằm trong
nhánh đã push. FE không được đụng tới từ 09-01 (commit FE gần nhất `b8fa8f7`
P4-C) — mọi việc từ đó là backend.

### 15.C Vận hành song song — nguồn hỗn loạn có thật

Hôm nay có lúc **3 agent cùng sửa repo** (2 phiên Claude + codex): đụng nhau
ở `profile-projection.worker.ts`, hook commit kẹt/va nhau, changelog trùng
mục phải hợp nhất tay, và nguy cơ deploy dính WIP chưa commit của người
khác (edge Rust WIP vẫn đang treo trong working tree). Không mất dữ liệu
lần nào, nhưng đó là may + tốn công đối soát — không phải quy trình.

### 15.D Chẩn đoán thẳng về CÁCH LÀM hiện tại

1. **Không có single-writer**: nhiều phiên cùng goal, cùng file, không phân
   làn → race, trùng việc, khó truy vết ai làm gì.
2. **Thiếu gate nhìn-thấy-được**: unit/contract gate dày (321 test xanh)
   nhưng KHÔNG có gate "màn hình đúng trên dữ liệu thật" (visual/e2e chạy
   với mirror thật) và KHÔNG có gate perf (p95/payload budget) → bug chỉ lộ
   khi owner nhìn, perf tụt không ai chặn.
3. **Dev runtime vừa là chỗ agent deploy liên tục vừa là chỗ owner review**
   → owner đang nhìn thì bên dưới đổi.
4. **Fix đuổi theo triệu chứng từng màn** thay vì chốt data-contract per
   screen trước (màn này cần series gì, độ phân giải nào, budget bao nhiêu).

### 15.E Phương án restructure (Bobby chọn từng dòng)

| # | Đề xuất | Chi phí | Hiệu quả |
|---|---|---|---|
| R1 | **Một phiên agent / một làn**: Claude(1 phiên duy nhất)=control-api+FE, codex=edge Rust+trading; giao tiếp qua CODEX_TO_CLAUDE/BR-EX files như rule sẵn có. Bobby tắt các phiên thừa | 0 | Hết race, hết trùng |
| R2 | **Perf budget thành gate**: đo lại bảng P4-E ngay (trước/sau), cap payload /screens/* (vd ≤300KB), snapshot KHÔNG nhúng ladder items thô — composer ép thành chart series mỏng ngay trong worker; route nào vượt budget = gate đỏ | 1-2 ngày | Trực tiếp vào "mượt + nhanh" |
| R3 | **Visual/e2e gate trên dữ liệu thật**: mỗi màn 1 e2e screenshot chạy với mirror seeded thật (không fixture bịa), chạy trong control gate; bug thấy bằng mắt = viết test đỏ TRƯỚC khi fix | 2-3 ngày dựng nền | Bug kiểu "30D/2 ngày" không tái diễn |
| R4 | **Tách review khỏi dev**: runtime `review` (compose project thứ 2, image pin theo tag Bobby chọn) — agent chỉ deploy `dev`, Bobby duyệt trên `review` | nửa ngày | Owner review không bị đổi dưới chân |
| R5 | **Data-contract per screen trước khi code**: mỗi màn 1 bảng (relation → series → resolution → budget) trong EXECUTION_SCALE_AND_REFINE.md, code chỉ chạy sau khi bảng chốt | quy trình | Hết fix đuổi |

Thứ tự đề nghị nếu Bobby duyệt cả gói: R1 ngay lập tức → R2 (kèm đo lại
P4-E làm bằng chứng trước/sau) → R4 → R3 → R5 áp cho mọi màn từ E2 trở đi.

## 16. Audit gap 3 chiều: yêu cầu showcase ↔ dữ liệu thật ↔ render hiện tại (owner order 2026-09-03 tối)

Một lượt điều tra trọn vẹn theo yêu cầu Bobby. **Mọi ô "đang render" đều đo
bằng session đăng nhập thật** (user probe `claude-probe`/USER, curl từng
route, kích thước byte thật) — không suy đoán từ code. "Yêu cầu showcase" =
hi-fi cluster D1-D6 + fixture dàn dựng của nhánh showcase; "dữ liệu thật" =
đo trên mirror SGP + bảng nguồn HK hôm nay.

### 16.1 Bảng gap từng màn

| Màn | Showcase yêu cầu | Dữ liệu thật có | Đang render (đo byte thật) | GAP + phía sửa |
|---|---|---|---|---|
| **Paper Overview** (`/screens/paper`) | Equity band 30d theo stage, funnel, freshness dot thở, staged reveal | Mirror equity ĐỦ 30d+ (572k rows, 43 account, bám đuôi giờ) | **200 rows THÔ** (cap 200/relation BFF; ≈5 điểm/account trộn lẫn) → chart vỡ; 539KB; PARTIAL | **GAP LỚN NHẤT** — overview chưa hề đọc mirror. Fix A (SGP): server build DERIVED-sum series full-range như alpha 360 đã có. Lane E1 |
| **Paper Workbench** (`/screens/paper/:dep`) | Chart equity+performance full depth per deployment, tabs orders/fills, VNM shading | Mirror per-deployment 10,119 rows equity | **1.540 + 1.699 điểm, windows+downsample khai báo ĐÚNG** ✅ nhưng payload **5,9MB** (rows đủ fields thay vì series (t,v)); orders/fills=0 (trang nóng 400 không chứa dep này); VNM shading chờ calendar N28 | Chart OK; Fix R2 ép series gọn (SGP); orders/fills → Lane E2 mirror; calendar → MC-06 nguồn |
| **Alpha 360 insight** (`/alphas/:id/query-analytics`) | 12 tile: equity, funnel, quality, contribution, replay+candles, correlation, drawdown… | Mirror đủ cho 9/12; candles/benchmark/twin chưa activate (N28); fills ít (trading gần idle) | **equity 1.540 điểm phủ đúng 05/08→04/09** ✅; **correlation AVAILABLE 66 cặp/43 alpha** ✅; **drawdown 43 alpha + 6 overlap** ✅; contribution EMPTY (fills không khớp trang nóng); 3 tile UNAVAILABLE (N28) đúng sự thật; payload 2,4MB | Còn: contribution đọc mirror (E1 slice 2) + ép payload (R2). 3 tile chết = việc nguồn MC-01..09 |
| **Full Blotter** (`/screens/blotter`) | 10⁵-10⁷ dòng keyset, virtualized, số exact | Nguồn: orders ~1.2k, fills 79 từ 17/08 (trading gần idle + halt 30/08) — population thật NHỎ | 93 orders + 63 fills + 100 sessions + 100 journal (240KB, PARTIAL) — trang nóng bounded ĐÚNG thiết kế | Gap kiến trúc (E2 mirror transactional + keyset) nhưng **không phải gap dữ liệu hôm nay** — population thật đang nhỏ vì trading halt/idle (owner un-halt) |
| **Portfolio 360** | Equity nguồn, rho-benchmark, correlation, capital-ledger timeline | portfolio_equity KHÔNG THỂ scope (§BR-EX-79 1.3, đã chứng minh); benchmark chưa activate; allocations có | DERIVED sum đúng đắn ✅; correlation giờ AVAILABLE (dùng chung); rho UNAVAILABLE trung thực | rho/benchmark = MC; ledger timeline = MC-01 event stream. Phía nguồn |
| **Account/Broker 360 + Bindings** | Balances/margin/sync/venue accounts | balances 85 (không mode/venue → lineage reject); margin/sync/venue = **0 rows THẬT ở nguồn** | Reject + empty trung thực | Balances → release-kit đã staged; 3 bảng rỗng → trading chưa sản xuất dữ liệu. Phía nguồn |
| **Sandbox Certification** | Sessions + margin + sync evidence | Sandbox CHƯA TỪNG chạy session; margin/sync rỗng nguồn | `ready/COMPLETE` 35 deployments, 0 sessions (15KB) — khung đúng, ruột chờ | Trading chạy sandbox cycles. Phía nguồn/owner |
| **Live Full Operations** | Orders/fills live, tick panel | live accounts = 0 (chưa activate), HALTED by design | `empty/COMPLETE` trung thực (2KB) | Đúng thiết kế tới khi live activation. Owner |
| **Command Center** | Tick flash realtime, funnel grow, SLA pulse | Có sessions/journal; KHÔNG có delta thật (halt → không fills) | 5,7KB compact ✅; flash im vì không có tick thật | Un-halt là hết. Owner |
| **Canary** | Drift tile paper-vs-live | twin join chưa activate + không có live | UNAVAILABLE trung thực | MC nguồn + live activation |

### 16.2 Gap "hiệu ứng động" (đã điều tra riêng, tóm tắt)

Code hiệu ứng KHÔNG bị xoá (HEAD 287 match > showcase 279; showcase ⊂ HEAD;
bundle build sau commit FE cuối). 51 rule đều gate theo state đúng hi-fi D4.
Showcase nổ hiệu ứng vì fixture DÀN DỰNG đủ trạng thái (CRITICAL, overdue,
FRESH, remount mỗi điều hướng); dev im vì (i) dữ liệu thật không có
incident/overdue (im ĐÚNG), (ii) P4-C giữ cây mounted (grow chỉ chạy lần
đầu — chủ đích chống loading-flash), (iii) PARTIAL toàn cục ghìm polish
'ready' (xem 16.3). Không sửa gating; sửa nguồn trạng thái.

### 16.3 Gap ngữ nghĩa completeness — vì sao "không bao giờ đóng"

Equity/performance đã COMPLETE. Kéo PARTIAL toàn cục là 5 relation
transactional (trang nóng 400-row *by design* nhưng nhãn mô tả population
nguồn) + portfolio_equity typed-rejected (đã có DERIVED chính thức). Nhãn
đang trộn "đã giao đủ SERVING khai báo" với "đã chứa TOÀN BỘ nguồn".
**Fix C**: tách `serving completeness` (COMPLETE khi mọi relation giao đủ
window khai báo, `truncated` vẫn khai trung thực) khỏi population; relation
có substitute DERIVED khai báo không kéo tụt rollup. FE gate chrome theo
serving completeness. Không nói dối — window truncated vẫn hiện.

### 16.4 Tổng kết gap theo phía chịu trách nhiệm

- **SGP làm được ngay (map vào §14)**: Fix A overview-series-từ-mirror (E1);
  Fix C completeness semantics; R2 payload (5,9MB→~chục KB bằng series
  (t,v)); contribution từ mirror (E1); E2 mirror transactional.
- **Đã staged chờ cửa sổ deploy HK**: scoped-balances release kit.
- **Phía trading/nguồn**: un-halt (mở CC flash + performance + blotter
  population); sandbox cycles; live activation; MC-01..09 (candles,
  benchmark, ticks, calendar, twin); marking oscillation (1.5);
  3 bảng rỗng (venue/margin/sync).
- **Bobby quyết**: un-halt; cửa sổ release-kit; restructure §15 (R1-R5).

## 17. EDS campaign — Maximum-data BFF, durable mirror, streaming and frozen-frontend delivery (2026-09-04)

### 17.1 Authority, inputs and supersession rule

This section is the active backend sequence for the next Execution Portal
campaign. It applies the architecture and product rules in
[`EXECUTION_DURABLE_STREAMING_FROZEN_FRONTEND_INTEGRATION_AND_FINANCIAL_CHART_PLAN_v1.1.md`](./EXECUTION_DURABLE_STREAMING_FROZEN_FRONTEND_INTEGRATION_AND_FINANCIAL_CHART_PLAN_v1.1.md)
to the source facts returned by
[`PORTAL_EXECUTION_EDGE_MAXIMUM_DATA_HANDOFF.md`](../PORTAL_EXECUTION_EDGE_MAXIMUM_DATA_HANDOFF.md).
It does not copy those documents. Agents must read them and the accepted
`services/portal-execution-edge-rs/contracts/maximum-data-return-v1/` pack
before changing code.

Where older N/P4/BR-EX prose conflicts with the accepted E7 pack, the order is:

```text
runtime evidence
→ E7 machine contract and manifest
→ source code/tests at the named commit
→ durable-streaming v1.1 guide
→ this section's execution order
→ older status notes
```

The first implementation branch must start from the accepted feature head or
its later reviewed merge base. Do not fold unrelated dirty P4-E cadence work
into an EDS commit. The five locally modified P4-E files observed during this
planning pass are protected work-in-progress until their owner commits or
withdraws them.

### 17.2 Accepted source truth at campaign start

The following is fact, not a target claim:

| Item | Accepted truth |
|---|---|
| Portal source head | `6f6503ea21327bc39946f48c697b4287c673f12c` |
| Execution Edge image | `sha256:47ea4d78099347706710879bf26e46a15cfaf80e4ef7ac22879f0a71f12c3077` |
| Source contract | `trading-system.portal-execution.manager-v2.runtime.v1` |
| Profiles | `PAPER_BINANCE_USDM`, `SANDBOX_BINANCE_USDM`, `LIVE_BINANCE_USDM` |
| Private resource | GET-only `execution:manager-v2:read` |
| Catalogue | 96 readable relations; census covers 99 relations / 1,387 columns |
| Frozen field map | 34: 22 direct, 5 Portal-derived, 6 field-level owner gaps, 1 Canary incompatibility |
| Detailed source gaps | 18 typed gaps, retained exactly as E7 facts |
| Page bounds | 1–200 rows, at most 1 MiB, opaque relation/profile-bound source continuation |
| Measured concurrency | Paper 1, Sandbox 1, Live 2 named pages until requalified |
| Availability semantics | `AVAILABLE+COMPLETE+0 rows` is authoritative empty; 503 is not empty |
| History semantics | current/range pages only; no global event sequence, correction journal, replay cursor or retention-floor proof |
| Runtime status | Manager-v2 read active on the three profiles; Edge projection remains intentionally disabled/read-through |

The source can immediately support fixed server-side current/range reads for
deployments, positions, sessions, orders, fills, accounts, balances, margin,
account/broker sync, venue bindings, reconciliation, command-journal metadata,
dead-letter summaries, risk grants, sizing decisions, account equity,
performance and instrument reference. The Portal can immediately derive the
named source-health, execution-quality, conditional-leg, portfolio-capital and
alpha-activity operations when all required inputs are present.

These remain typed, never fabricated: market candles/latest observations,
venue session calendar, VNM constraints, authoritative trade replay, signed
research-artifact linkage and Canary twin/drift comparison. A detailed gap can
also limit otherwise available current data, such as mark provenance,
acknowledgement clocks or correction history.

### 17.3 Target runtime and the no-amplification rule

```text
Browser
  → same-origin TypeScript Screen BFF (session/RBAC/CSRF; named operation only)
  → SGP local read model when a committed compatible revision exists
  → bounded shared server read-through only during bootstrap/degradation
  → private AWS-HK Rust Edge /internal/v2/manager/*
  → Edge-owned Source Proxy boundary
  → Trading System authority
```

The TypeScript Control API already owns HTTP/2 transport, TLS 1.3 mTLS,
deployment-bound environment/profile/audience, short-lived delegated JWT,
bulkheads, pacing, coalescing and typed upstream errors. EDS reuses and seals
that path; it does not create a second generic client.

The Rust Edge already owns Manager-v2 validation and the digest-bound E5
adapter. Rust becomes the SGP ingest/query/realtime authority only after the
corresponding EDS phase passes. Python is not part of this path.

One browser request must never become one AWS-HK source read indefinitely.
Before the durable mirror is active, the existing shared-read lease/cache and
profile concurrency limits are mandatory. After mirror cutover, browsers read
only a committed SGP revision. A source continuation is never returned to the
browser; a public BFF cursor is Portal-owned, operation/resource/profile bound,
and resolves server-side to source or local continuation state.

PostgreSQL is the hot/current/history authority for Portal reads. Parquet is a
later cold/archive format and DuckDB an offline/research query tool only after
measured retention/storage pressure justifies archival; neither sits in the
interactive or realtime request path.

### 17.4 Campaign-wide rules and closure gates

1. Adapt what Manager-v2 publishes now before commissioning a new Trading
   System capability.
2. Browser routes expose one named product operation/DTO, never a relation,
   SQL fragment, source URL, profile selector, JWT, certificate or source
   cursor.
3. Preserve `availability`, `freshness`, `completeness`, `as_of_ms`, profile,
   catalogue/contract revision, exact decimal strings and typed error class.
4. Preserve 400/401/403/404/502/503 faithfully. No automatic retry hides a
   source failure; only an explicitly budgeted background coordinator may
   retry with jitter and a visible stale state.
5. Current rows are current rows. Retained snapshots are snapshots. Neither is
   relabelled as an event journal or full replay.
6. `READY + null`, partial-as-exact, missing-as-zero and heuristic financial
   joins are release blockers.
7. Canary consumes the Live source profile plus Portal-owned Canary control
   state; it is not invented as a fourth Trading System profile.
8. Read and command authority remain separate. This campaign may display the
   redacted command journal; it does not activate or widen commands.
9. Every phase uses the frozen product screen composition. Missing data changes
   the relevant panel state, not the whole screen layout.
10. Every phase commits its implementation, tests and journal update together.
    A source-only or backend-only result is not product-complete.

Every implementation phase closes only after these gates:

| Gate | Required evidence |
|---|---|
| G0 Source | E7/E5 operation or one explicit typed external gap |
| G1 Contract | schema, DTO, decoder and digest agree |
| G2 Security | session/RBAC plus private mTLS/delegation/profile negatives |
| G3 Data | identity, precision, freshness, completeness and cursor tests |
| G4 Runtime | immutable candidate with exact config/image/contract pins |
| G5 Consumer | existing frozen screen consumes the real BFF payload |
| G6 Browser | authenticated route/network/visual evidence on deployed image |
| G7 Operations | metrics, rollback and cleanup evidence |

Status ladder is mandatory:

```text
PLANNED → CONTRACT_LOCKED → SOURCE_ACTIVE → BFF_READY
→ FRONTEND_CONSUMED → DEPLOYED_IMAGE_VERIFIED → PHASE_ACCEPTED
```

### 17.5 Phase summary and dependency graph

| Phase | Result | Depends on | Can close with current source? |
|---|---|---|---|
| EDS-00 | intake, hashes and frozen baseline | E7 handoff | complete; immutable planning gate closed |
| EDS-01 | sealed private client + named E5 BFF operations | EDS-00 | complete; fixed E5 deployment BFF authority closed |
| EDS-02 | generated screen/action/panel/time contracts | EDS-01 | complete; 25 classified screens, 34 fields and 12 actions; no runtime mutation |
| EDS-03 | Paper/Sandbox/Live current-stage screens | EDS-02 | yes, with typed gaps |
| EDS-04 | Alpha/Portfolio/Account/Bindings resource screens | EDS-03 | yes, with typed gaps |
| EDS-05 | governance/operations and five Portal derivations | EDS-04 | yes, with typed gaps |
| EDS-06 | durable SGP current/range mirror and exact resource indexes | EDS-05 + owner runtime window | yes for observed pages; no replay claim |
| EDS-07 | equity/performance/risk/chart query plane | EDS-06 | yes for retained source range |
| EDS-08 | authoritative event/continuity acquisition | EDS-00; external source work | no, external gate |
| EDS-09 | Rust snapshot+tail append store and reducers | EDS-08 | no |
| EDS-10 | full lifecycle replay and market-context chart plane | EDS-09 + typed market source | no |
| EDS-11 | complete screen BFF/action graph and local SSE | EDS-03–10 as applicable | partial before EDS-08/10; exact typed state required |
| EDS-12 | failure/DR/performance/product release | all accepted preceding scope | yes per accepted capability set |

EDS-03 through EDS-07 must not wait for EDS-08. This is the key
adapt-first decision: current source delivers the maximum honest product now;
event/replay work advances in a separate dependency lane.

### EDS-00 — Return-pack intake and immutable baseline

**Status:** `CONTRACT_LOCKED / SERVER_BASELINE_COMPLETE / NO_RUNTIME_MUTATION`
on 2026-09-04.

**Goal:** establish one reproducible authority before implementation.

**Work completed for planning:**

- fast-forwarded `feat/execution-data-activation` to `6f6503e` without
  overwriting the existing P4-E worktree changes;
- read the handoff, EX-DP-07 closure, E5/E6, owner response, event-continuity
  ruling, Manager profile activation and the v1.1 frozen-frontend plan;
- ran the dependency-free E7 validator: 34 capabilities, 18 genuine gaps,
  three measured profiles;
- verified every entry in `maximum-data-return-v1/MANIFEST.sha256`;
- repaired the isolated Control API test-cell packaging so the newly received
  EX-DP contract suites can read that sanitized pack through one narrow,
  read-only mount rather than a repository-wide or runtime mount;
- inspected the existing Control API transport/BFF/projection/realtime paths,
  Rust Manager-v2 client/adapter and frozen frontend consumers.

**Implemented closure:**

- created the isolated consumer branch `feat/eds-current-bff`, leaving the
  dirty P4-E worktree untouched;
- added the authenticated, workspace-bound
  `GET /api/v1/execution/runtime-manifest` Control API endpoint;
- compiled the E7 source/Edge/catalogue/serving-policy/E5/E6 pins, profile
  capacity, page bounds and explicit external gates into a sanitized
  in-image baseline (`maximum-data-intake.ts`), which cannot infer runtime
  truth from a URL or current configuration;
- made the endpoint state `EDS_00_BASELINE_ONLY` and
  `named_portal_operation=NOT_YET_PUBLISHED`, so intake cannot claim that a
  source query or product release happened;
- added a focused contract test that compares the baseline against the
  accepted E5/E7/owner/deployed-return artifacts, verifies session/workspace
  enforcement, and scans the emitted metadata for raw source/secret material;
- recorded the phase evidence and retained boundary in
  [`EDS_00_RETURN_PACK_INTAKE_AND_IMMUTABLE_BASELINE.md`](./backend/EDS_00_RETURN_PACK_INTAKE_AND_IMMUTABLE_BASELINE.md).

The pre-existing E3 contract test remains the generated inventory drift gate:
it compares all 23 frozen screens, operations and capabilities to the return
pack rather than duplicating a second mutable inventory.

**Tests:** E7 validator, full manifest check, isolated Control API/EX-DP
contract suites, link check, dirty-worktree guard, screen inventory drift test
and secret/path redaction scan.

**Exit:** no unknown authority or unclassified frozen field; all later phase
dependencies reference one digest-bound matrix. The runtime-manifest is
metadata-only, authenticated, workspace-bound and explicitly non-probing.
There is no EDS-00 implementation debt. The four E7 owner gates remain
machine-readable external requirements, not a deferred Portal task.

**Next:** EDS-01.

### EDS-01 — Sealed Manager-v2 consumer and fixed E5 operation authority

**Status:** `BFF_AUTHORITY_COMPLETE / CONTRACT_FAIL_CLOSED / NO_RUNTIME_MUTATION`
on 2026-09-04.

**Goal:** make the existing private source callable only through stable named
Portal operations.

**Backend work:**

- reuse `ExecutionCurrentSourceProxy`; do not introduce another generic
  transport;
- pin each profile to its exact origin, audience and profile ID; issue only
  short-lived `execution:manager-v2:read` assertions;
- implement a compile-time/frozen `MaximumDataOperationRegistry` mapping each
  accepted E5 logical operation to its private relation and allowed fields;
- expose server-only clients for catalogue, capabilities, projections and
  relation pages; no user-controlled relation/schema/path;
- enforce Paper/Sandbox concurrency 1 and Live concurrency 2, page <=200,
  body <=1 MiB, cursor <=4 KiB, no redirects and no automatic retries;
- translate source envelopes without flattening their semantics;
- store/bind source continuation server-side and issue only Portal opaque
  operation cursors externally;
- use the Rust E5 fixtures/operation descriptors as compatibility evidence;
  do not make browser-visible Rust/source DTOs the product DTO.

**Implemented vertical:** `maximumDataDeploymentPageV1` is now the fixed,
authenticated same-origin `GET /api/v1/execution/manager/deployments`
operation. It uses a server-only frozen registry for
`manager.deployments/public.strategy_deployments`, exact Paper/Sandbox/Live
profile binding, the existing mTLS/delegated-JWT proxy, and Portal-bound
opaque `mdc1.*` continuations. It emits normalized, allowlisted deployment
records with availability/freshness/completeness/as-of metadata, UTC epoch
milliseconds and truthful empty/partial/stale states. Raw Manager relation,
cursor, trace and record keys cannot cross the browser boundary.

The implementation adds no runtime activation or frontend composition.
EDS-02 owns generated product contracts and EDS-03 owns rich screen
composition; that deliberate layering is not deferred EDS-01 debt. The
runtime-manifest was updated from `EDS_00_BASELINE_ONLY` to
`EDS_01_FIXED_E5_OPERATION_PUBLISHED` so it cannot claim the operation is
absent, while remaining source-non-probing.

**Tests:** positive Paper/Sandbox/Live empty/populated/partial cases; wrong
audience/profile/resource; expired JWT; absent/bad certificate; relation/path
injection; cursor rebind; 400/401/403/404/502/503; body/row/concurrency bounds;
one/ten/one-hundred browser coalescing with constant upstream requests.

**Verification completed:** E7 validator and return-pack manifest verification;
full isolated Control API fresh-PG/migration/restore gate (**39 test files /
341 tests**); focused fixed E5
Paper/Sandbox/Live, source contract, continuation, injection, refusal and
shared-admission/coalescing tests. The detailed evidence is
[`EDS_01_SEALED_MANAGER_V2_E5_DEPLOYMENT_BFF.md`](./backend/EDS_01_SEALED_MANAGER_V2_E5_DEPLOYMENT_BFF.md).
The N29 acceptance source-boundary pin and its manifest are regenerated for
this intentional tightening; N29's release decision and authority stay
unchanged.

**Exit:** no browser-accessible raw Manager route; the server-side E5
deployment operation is closed and fail-closed. Immutable dev-image/browser
composition is an EDS-03 delivery proof, not falsely claimed by this
server-side-only phase.

**Next:** EDS-02.

### EDS-02 — Generated screen, panel, action and UTC/exact-value contracts

**Goal:** give Control API and the frozen frontend one generated contract
authority.

**Status:** `CONTRACT_AUTHORITY_COMPLETE / FRONTEND_COMPATIBLE /
NO_RUNTIME_MUTATION` on 2026-09-05.

**Implemented closure:**

- added a deterministic E3/E5 source compiler, generated source authority,
  generated Screen Data Manifest/Action Manifest, public evidence digest and
  authenticated workspace-scoped
  `GET /api/v1/execution/contract-authority`;
- retained the immutable 23-screen E3 inventory and registered two explicit
  BR-EX-72 Portal list extensions, making the current authority 25 screens,
  34 field definitions and 12 semantic actions without hiding the inventory
  distinction;
- defined browser-renderable `UtcEpochMs` wires and separate
  event/source-published/received/ingested/processed/as-of/read clocks;
- sealed opaque strings for identifiers and sequence values and exact decimal
  strings with currency/scale validation; no floating-point coercion occurs;
- defined and runtime-validated
  `READY/EMPTY/PARTIAL/STALE/UNAVAILABLE/DENIED/ERROR`, complete coverage,
  history semantics, readiness/delivery separation and formula lineage;
- generated JSON Schema, OpenAPI and TypeScript types, and reused the existing
  Rust E4 `UtcEpochMs(i64)`/`ExactDecimal` inter-cell DTOs because this
  metadata-only phase adds no Rust boundary; the Portal BFF explicitly clamps
  values to the browser `Date` range instead of silently narrowing them;
- defined semantic actions only, while the frozen frontend route registry owns
  all URL/rendering choices and rejects any source/URL leakage.

**Frontend closure:** generated contract types are available through
`@portal/contracts-screen-data`. UTC display and runtime decoders now reject
malformed clocks, coverage, formula lineage, action graph and raw-source
leakage, with no approved layout or rich-screen composition changed.

**Verification completed:** E7 validation passed (**34 capabilities, 18
genuine source gaps, three measured profiles**); every return-pack manifest
entry verified; generator reproducibility/digest equality passed; contract
workspace passed **117/117**; fresh PostgreSQL Control API build/test/restore
passed **40 files / 348 tests**; and the clean Portal-plus-embedded-Planning
frontend gate passed **590 suites, 1,826 passed, 0 failed, 3 skipped** followed
by a production build. Focused coverage includes epoch-ms/DST/browser-timezone
semantics, exact decimals, large ID coercion, every panel state, route/action
graph and production fixture-import guard. Detailed evidence is
[`EDS_02_GENERATED_SCREEN_PANEL_ACTION_CONTRACTS.md`](./backend/EDS_02_GENERATED_SCREEN_PANEL_ACTION_CONTRACTS.md).

**Exit:** every frozen field/action is classified; `READY + null` is rejected;
the generated digest is visible in runtime evidence; authenticated frontend
code formats only UTC milliseconds; and the public contract cannot expose raw
source access. There is no EDS-02 implementation debt. Runtime/source/profile/
command activation, Edge changes, containers and network remain intentionally
out of scope rather than deferred work.

**Next:** EDS-03.

### EDS-03 — Maximum current truth for Paper, Sandbox and Live stage screens

**Goal:** fill stage overview/workbench screens with all current Manager data
that already exists, while preserving honest gaps.

**Named operations:** deployment, position, session, order, fill, account,
balance, margin, sync, broker-sync, venue-account, reconciliation, equity,
performance and source-health reads.

**Backend work:**

- compose exact profile-bound operations for Paper Overview/Workbench/VNM,
  Sandbox Overview/Certification and Live Overview/Full Operations;
- resolve resource identity server-side; never fetch a bounded global page and
  filter it for detail;
- preserve current-state versus retained-range meaning per branch;
- serve Live complete zero-row source as typed `EMPTY`, not unavailable;
- bind Canary requests to the declared Live source profile but keep Canary
  comparison typed incompatible until EDS-05 qualifies it;
- do not activate commands, candles/latest/calendar/VNM constraints.

**Frontend proof:** each rich screen stays mounted; each populated branch uses
real data and only the missing panel shows a typed state/reason.

**Tests:** out-of-first-page deployment, cross-profile and cross-resource
isolation, authoritative empty, source partial/stale/unavailable, exact
decimal/time mapping, all tabs, direct-source network prohibition and
authenticated screenshot/network evidence for six stage routes.

**Exit:** every accepted direct current/range field used by these screens is
visible; no generic unavailable whole-screen replacement; every remaining gap
has the exact E7 reason.

**Next:** EDS-04.

### EDS-04 — Alpha, Portfolio, Account and Binding resource BFFs

**Goal:** make all 360/list/detail screens exact-resource operations rather
than thin envelopes or client-side joins.

**Backend work:**

- implement named Alpha Fleet/list, Alpha 360, Portfolio list/360, Account 360,
  Accounts & Bindings list and Binding detail DTOs;
- use explicit strategy/deployment/portfolio/account/binding keys from the
  source census; forbid `portfolio_id`-only and “two of four” heuristics;
- compose positions, account/balance/margin/sync/binding, equity/performance,
  risk/sizing and reconciliation branches;
- paginate with Portal cursors and exact local/source coverage metadata;
- use owner-approved entity-name registry for display labels, never expose
  source handles/hashes as primary UI labels;
- preserve mark/valuation provenance limitations as panel warnings.

**Frontend proof:** current rich tabs/components remain intact; Alpha/Fleet,
Portfolio and Account/Binding routes render real branches and typed gaps at
panel granularity.

**Tests:** identity property tests, parent/orphan checks, duplicate resource
keys, deep-page lookup, mixed currency fail-closed, empty binding/margin/sync,
all resource tabs and authenticated browser traversal.

**Exit:** no detail screen filters a global bounded page; field coverage for
these screens is 100% direct/derived/typed-gap and visible on the deployed dev
image.

**Next:** EDS-05.

### EDS-05 — Portal derivations, governance and operational composition

**Goal:** activate all five permitted Portal derivations and join operational
truth without inventing source history.

**Backend work:**

- implement the named `source_health`, `execution_quality`,
  `conditional_legs`, `portfolio_capital` and `alpha_activity` operations;
- publish formula version, source inputs, population/completeness, input
  revision/digest and exact currency policy;
- compose Approval, R1/R2/Live Review, Exit Review, Waivers, Operations Queue,
  Incident Detail, Command Center and Admin Drawer read surfaces from
  Portal-owned workflow plus accepted Manager facts;
- show redacted command-journal metadata only; do not widen N27 command
  authority;
- qualify Canary control-over-Live comparison only if exact inputs produce a
  named DTO; otherwise preserve `E5_CANARY_TWIN_COMPARISON_NOT_QUALIFIED`;
- do not infer candles/replay/research linkage.

**Tests:** formula golden vectors, partial/stale propagation, exact denominator,
currency mismatch, cross-workspace isolation, redaction, governance revision
consistency and browser proof for every governance/operations route.

**Exit:** all five derivations are source-backed and reproducible or a phase
test fails; governance/operations screens consume one composite revision;
commands remain unchanged and fail closed.

**Next:** EDS-06.

### EDS-06 — Durable SGP current/range mirror and exact resource indexes

**Goal:** remove browser-driven cross-cell amplification and giant JSONB
snapshots using only semantics the current source actually proves.

**Approval boundary:** requires a separate owner-approved storage/migration and
runtime activation window. It does not require a Trading System code change.

**Backend/Rust/storage work:**

- create typed PostgreSQL tables for source observations, retained fill/equity/
  performance snapshots, current entities, source continuations, batches,
  gaps and read-model revisions;
- label periodically observed mutable pages as Portal observations, not source
  lifecycle events;
- ingest all accepted pages through one lease-aware coordinator per profile;
  use server-side cursors and the measured concurrency limits;
- commit rows, continuation/checkpoint and revision atomically; dedupe by exact
  source keys/digest and quarantine key/digest conflicts;
- build exact indexes by resource/time and Portal-owned keyset cursors;
- dual-read/compare against the current projection, then cut one screen at a
  time;
- remove raw ladder arrays from giant per-profile JSONB responses; keep the
  old projection only as a bounded compatibility path during observation;
- define retention by data class from measured storage growth. No magic total
  history cap; no Parquet/DuckDB activation without an archival decision.

**Tests:** fresh-PostgreSQL migration, idempotency, crash between row/offset,
resume, duplicate/different digest incident, lease loss, stale cursor,
partition/profile isolation, query plans, payload budgets, backup/restore and
old/new browser parity.

**Exit:** browser concurrency causes zero additional AWS-HK reads; migrated
screens read one committed local revision; rollback selects the previous real
read path without deleting mirror data.

**Next:** EDS-07; EDS-08 may run in parallel.

### EDS-07 — Retained equity/performance/risk queries and financial chart API

**Goal:** use all honestly retained source range to power fast financial views,
without claiming an unknown retention floor as total history.

**Backend/Rust work:**

- exact range/keyset queries for account/deployment/portfolio equity,
  performance, risk grants and sizing decisions;
- server-side subject scoping, aggregation, drawdown, execution quality and
  contribution with exact formula/currency/input coverage;
- viewport-aware min/max/last downsampling that preserves gaps/extrema/markers;
- chart DTO with `UtcEpochMs`, decimal strings, source/returned counts,
  sampling algorithm, scale decision and visible coverage boundary;
- benchmark series stays typed unavailable until a named market authority is
  published; frontend must not synthesize it;
- optional range cache is revision-keyed and may be enabled only after a
  measured invalidation test.

**Frontend handoff:** `PrimusFinancialChart`/approved renderer consumes this
DTO in the existing chart shell; backend does not alter the visual design.

**Tests:** raw-versus-downsample population, extrema/gap/marker properties,
log/linear rules, large range, per-account/all-account scope, no float-derived
business result, payload/render budget and browser chart evidence on Alpha,
Portfolio, Account and stage screens.

**Exit:** no 2,000-row total-history presentation cap; every chart states the
actual available range and completeness; real chart payload is consumed on
the deployed image.

**Next:** EDS-09 for streaming-enabled source classes; EDS-11 for local
current-revision SSE.

### EDS-08 — Source continuity and authoritative event contract lane

**Goal:** obtain only the missing semantics required for true replay and
append-all source history.

**Portal work now:**

- translate the 18 E7 gaps into one deduplicated owner packet, grouped by
  event, market, valuation, operations, command, artifact and research owner;
- define required event envelope, epoch/sequence, snapshot high-watermark,
  correction/tombstone, retention floor, resnapshot and causal identifiers;
- provide machine validation, fixtures and compatibility tests to the source
  owner; do not prescribe Trading System internals;
- keep product panels typed while the owner task is open.

**External completion needed:** a source-owned journal/outbox/CDC/exact tail
that proves ordering and retention for each activated class. Current
`domain_events` without `source_sequence` is not accepted as that authority.

**Tests:** schema/digest compatibility, duplicate/gap/correction/tombstone,
epoch reset, retention boundary, cross-profile rejection and snapshot+tail
fixtures supplied by the owner.

**Exit:** each history-bearing class is either `EVENT_SOURCE_ACCEPTED` or
remains a named external gap. EDS-08 may close contract preparation without
falsely unblocking EDS-09; runtime source acceptance is recorded separately.

**Next:** EDS-09 only for accepted classes.

### EDS-09 — Rust snapshot+tail, append store, reducers and durable ACK

**Goal:** make Rust the authoritative Portal ingest path for source classes
accepted in EDS-08.

**Backend/Rust/storage work:**

- implement bounded H2+mTLS frames with checksum/compression and separate
  live/current/history lanes;
- snapshot at high watermark, backfill `<=W`, tail from `W+1`;
- commit append facts/events and offsets atomically, then ACK;
- dedupe, detect gaps, quarantine integrity mismatch and request explicit
  resnapshot;
- maintain typed current reducers and replay checkpoints;
- enforce bounded queues/unacked bytes/spool, backpressure and live-lane
  priority over backfill;
- publish local durable journal entries only after committed revision.

**Tests:** 2x measured peak, live+backfill, 1/5/30-minute partition, process/DB
restart, slow consumer, spool/disk pressure, corrupt frame, epoch change,
duplicate and late correction; zero accepted-event loss and zero visible
duplicates.

**Exit:** Rust path is active per accepted relation/profile, old polling is
disabled only for that exact scope, and a source event reaches a frozen screen
with one trace and committed revision.

**Next:** EDS-10 and EDS-11.

### EDS-10 — Full lifecycle replay and market-context query plane

**Goal:** activate Trade Replay and complete chart context only when the
authoritative sources exist.

**Backend/Rust work:**

- append signal/sizing/risk/command/order/fill/accounting/reconciliation
  lifecycle events and causal edges;
- exact trace/order/deployment/session cursors plus checkpoint seek and state
  digest;
- expose pre-capture/retention limits, gaps, corrections and late arrivals;
- bind typed candle/latest/calendar/VNM/benchmark sources by venue,
  instrument, interval, revision and UTC clock;
- produce viewport-sized candle/marker windows and an export cursor, never an
  unbounded response;
- keep each unavailable market or lifecycle branch typed independently.

**Tests:** partial fill, cancel/replace/reject, out-of-order receipt, correction,
checkpoint determinism, deep pagination, market revision mismatch, VNM session
boundary and browser seek/virtualization.

**Exit:** Trade Replay has no `.slice(-200)` total cap, no synthetic history
and no smoke fallback; available lifecycle is replayable and unavailable
pre-capture history is visibly bounded.

**Next:** EDS-11.

### EDS-11 — Complete screen BFF/action graph and local realtime activation

**Goal:** finish every frozen screen, tab, panel, filter and button using local
committed revisions and one resumable realtime channel.

**Backend work:**

- complete named screen operations for the full E3 screen inventory;
- server-side filter/sort/count/aggregate and resource composition;
- emit semantic action states/resources/reasons, never arbitrary hrefs;
- local snapshot → ordered deltas → Last-Event-ID resume → gap/resync SSE;
- one journal tail fans out to many browsers; source reads remain constant;
- panel deltas carry operation/resource/revision and never source cursor;
- a stale/gap/source-error changes only affected panel/read revision;
- preserve command activation as the separate N27 authority.

**Frontend proof:** all existing rich compositions remain; large tables and
replay timelines are virtualized; charts update incrementally without
recreating the renderer; every route/button is traversed.

**Tests:** screen-field/action coverage 100%, dead route 0, product fixture
import 0, 1/10/100 SSE clients, auth expiry terminal frame, reconnect/resume,
gap/resync, slow client, no React/DOM warnings, visual snapshots and browser
performance traces.

**Exit:** every screen is real-data or exact typed-gap at panel level; every
available action resolves correctly; no browser-driven source amplification;
deployed image passes the complete route graph.

**Next:** EDS-12.

### EDS-12 — Failure/DR, product acceptance and immutable release

**Goal:** qualify the exact capability set as an operable release, without
waiting for unrelated external gaps.

**Backend/release work:**

- freeze accepted operations, external gaps and profile matrix;
- run source/network/Edge/SGP DB/disk/cursor/epoch/schema/failure matrix;
- prove backup/restore, reader rollback, projection rebuild and source-dark
  degradation;
- publish commit, image, SBOM/provenance, contract/manifest, migration,
  frontend bundle and source compatibility digests;
- stage per operation/screen/profile: Paper, Sandbox, Canary-over-Live, Live;
- remove expired adapters only after zero-use observation;
- record any remaining external capability as a versioned next-campaign input,
  not hidden technical debt.

**Tests:** full contracts/Rust/TypeScript/frontend gates; authenticated browser
matrix for ready/empty/partial/stale/unavailable/denied/error; performance and
memory soak; rollback/restore rehearsal; security/redaction/profile isolation;
exact deployed-image verification.

**Exit:** all accepted-source scope is `PRODUCT_ACTIVE` and
`OPERATIONS_QUALIFIED`; zero P0/P1 integrity issues; rollback evidence exists;
owner signs visual/data/action parity. Protected-main merge and stable release
remain explicit Bobby actions.

### 17.6 Frontend collaboration lanes

Claude can work in parallel without source/runtime authority:

| Backend phase | Claude-safe parallel work |
|---|---|
| EDS-01 | consumer fixture/decoder for one named deployment operation; error-state visuals |
| EDS-02 | generated-type migration, UTC formatter, semantic route registry, no visual redesign |
| EDS-03 | panel-level loading/empty/partial/stale/unavailable states on stage screens |
| EDS-04 | preserve and bind rich Alpha/Portfolio/Account/Binding components |
| EDS-05 | display derivation lineage/completeness and governance/ops states |
| EDS-06 | old/new revision diagnostics and local-mirror parity test harness |
| EDS-07 | `PrimusFinancialChart`, accessible table and exact tooltip display |
| EDS-08/09 | event fixtures only from frozen contract; no synthetic product replay |
| EDS-10 | virtualized replay/candlestick renderer after contract acceptance |
| EDS-11 | incremental updates, virtualization, full route/action Playwright |
| EDS-12 | visual regression, browser failure matrix and owner review packet |

Claude must not replace a rich screen with an envelope page, derive business
truth in React or import smoke fixtures as runtime fallback. Codex must not
change approved screen hierarchy/visual composition while implementing the
server path.

### 17.7 Next approved implementation order

Unless Bobby changes priority, execute one campaign branch in this order:

```text
EDS-01 → EDS-02 → EDS-03 → EDS-04 → EDS-05 → EDS-06 → EDS-07
                              ↘ EDS-08 → EDS-09 → EDS-10 ↗
                                                   EDS-11 → EDS-12
```

The immediate next phase is **EDS-03 — Maximum current truth for Paper,
Sandbox and Live stage screens**. EDS-02 is closed with one generated,
role/workspace-scoped product authority shared by Control API and the frozen
frontend; EDS-03 may now widen only named, server-side BFF DTOs into the
already-approved rich stage panels.
