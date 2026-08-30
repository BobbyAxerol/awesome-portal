# Execution Loop Backend Unified Plan and Guide

> **Backend owner:** Codex  
> **Frontend owner:** Claude  
> **Product/release owner:** Bobby  
> **Baseline:** `dev` at `06c658f`; N13B–N17B phase head `7f67068`, 2026-08-30  
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

All known external dependencies are now consolidated in
[`TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md`](./backend/TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md).
It remains the only consolidated document sent to the Trading System owner and covers
N02/N03 source publication, N06 operational evidence, N11 reads, N12 commands,
N15 Event/Artifact authority and the N13–N17 promotion/release/emergency/DR
evidence ladder. Component request directories are machine annexes, not
separate owner asks. Older D4 and Claude request prose is audit-only.

From the 2026-08-29 rebaseline onward, this owner campaign is a capability and
evidence catalogue, not a global prerequisite for Portal delivery. Returned
contracts are preferred when present. Otherwise Portal uses the current
Manager-v2 relations/projections, current Gateway APIs, current market/data
services and Portal-owned derivations behind versioned compatibility adapters.
Future owner publications replace an adapter revision; they do not require a
Portal screen-contract rewrite.

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
seven proxy guard locations still return 503. The owner implemented within the
single campaign worktree. No older root-level packet or D4 v1 runtime is an
active instruction/source dependency. Real activation still requires the exact
capability gate below, but an incomplete future-facing owner contract no longer
parks unrelated current capabilities.

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

**Status:** `N18_COMPLETE / N19_COMPLETE_SOURCE_DARK / N20_READY_NOT_STARTED / NO_RUNTIME_EFFECT`.  
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

#### N21 — Shared admission, cache and freshness

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

#### N22 — Full Paper read activation

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

#### N23 — Sandbox and Live read profiles

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
| BR-EX-68 | 2026-08-30 | Admin Action Drawer `/administration/actions` | The owner's WF 1i hi-fi (CLI catalog, 2026-08-30) turns the drawer from a read-only listing into the operator's command surface: six task groups × 24 curated commands, registry-picked parameters, a read path that streams transcripts, and PLAN → APPLY (step-up) → VERIFY with a two-man-rule admin key for OPERATOR actors. All interaction ships as a declared demo (`adminCli.smoke.ts`) because catalogue rev 2 publishes relay `DISABLED` + `portal_reachable: false` on all 64 entries | (1) operator-task catalog: additive `task_group` + `task_title` + `cli_form` + `params[]` (`{key, source_registry, constraint}`) on `execution.command-catalog` entries, or a parallel `execution.command-tasks.v1` keyed by the same `noun/verb`; (2) read execution: `POST /commands/{key}/run` (R0 only, no step-up) returning verbatim transcript lines + exit code; (3) mutation flow: `POST /commands/{key}/plan` → plan id, TTL, preflight rows (server-side checks incl. approval ref, expected revision, concentration warn), `POST /plans/{id}/apply` (step-up enforced; DANGER requires typed confirm word) → operation id, `GET /operations/{id}/verify` timeline (202-not-success semantics, VERIFIED/PARTIAL terminal, residue rows); (4) two-man rule: `POST /plans/{id}/key-request` → admin-issued single-use key bound to the plan, TTL, audit row | catalog `PORTAL_CONTROL`; transcripts/preflight/verify `EXECUTION` (authoritative ACKs only — 202 is never success); grants `PORTAL_CONTROL` audit | mutations up to R4 — the entire reason the relay is DISABLED today; two-man rule + step-up + typed confirm words are the containment; read path R0 only | catalog ≤64 tasks · params ≤8/command · transcript ≤200 lines · preflight ≤10 rows · verify ≤20 rows | `execution.command-catalog` rev 2 (delivered, EX-BE-05b/F0) · F0 plan endpoint (refusal semantics stay for unreachable keys) · step-up (U07) | relay stays DISABLED → drawer stays a declared demo (current state); a key without `task_group` renders under the server group as today; PARTIAL never renders green; a plan whose TTL expired is a refusal, not a retry | schema + fixtures per endpoint; verify-timeline fixture for VERIFIED and PARTIAL; grant lifecycle fixture (request → issue → expiry); frontend `adminCli.test.tsx` (28 cases) is the interaction reference | Codex | EX-BE-05b/F0 (catalogue) · U07 step-up | `RECEIVED` | `AdminActionDrawer` WF 1i drawer — smoke `adminCli.smoke.ts` deleted on delivery | none until approved | hi-fi WF 1i owner copy 2026-08-30; full spec §7.10 |
| BR-EX-69 | 2026-08-30 | New approval request `/governance/approvals/new` | The loop had no entry UI: the Inbox reviews requests nothing in the portal can create. The owner-commissioned entry screen ships as a declared demo (`NEW_REQUEST` smoke) — registry-picked alpha/run/claim, required summary, SoD + SLA preview | `POST /api/v1/execution/approvals` `{ gate: "R1", alpha_id, evidence_run_id, methodology_claim_id, summary }` → PENDING approval row (id, SLA start, artifact digest pinned from the run); pick lists served from existing registries (alphas, run library, claims); typed 422 per missing field; requester recorded for SoD (can never approve own row) | `PORTAL_CONTROL` (governance write) | write · low-medium: creates review work, never capital — SoD + R1 gate contain it | pick lists ≤200 alphas / ≤500 runs (cursor); summary ≤2,000 chars | approvals store (BR-EX-30/35 stream) · run library registry | endpoint absent → screen stays a declared demo with its exact copy; duplicate open request for same alpha+run → typed 409 pointing at the existing row | create → row appears in inbox fixture; SoD negative (requester approve → 403); duplicate 409 | Codex | N09 | `RECEIVED` | `NewApprovalRequestScreen` — smoke `NEW_REQUEST` deleted on delivery | none until approved | ROADMAP §H.2.1; spec §7.11.1 |
| BR-EX-70 | 2026-08-30 | Gate LIVE review `/governance/approvals/{id}/live` | LIVE_GATE rows reviewed real-money promotion on the R2 capital composition; the new review room needs the canary evidence it actually rests on — today those panels are declared smoke (`LIVE_GATE` frames) over the r2-review backbone | `governance.live-review.v1` (or additive on r2-review for gate LIVE_GATE): `canary_ref` (deployment, window from/to, twin deployment), `kpis` (fills, reject rate, fill_delta_bp, slippage p95 vs model, envelope_breaches, incidents), `drift_series` (canary vs paper twin under `chart-series.rules.v1`), `gate_criteria[]` vs versioned `gate_live` policy (server-computed verdicts — same rule as BR-EX-67), `capital_step` (current, step, target, ledger movement) | evidence `EXECUTION` (canary telemetry) · criteria/policy `PORTAL_CONTROL` · drift `DERIVED` (`drift.v1`) | read-only · high leverage: this is the last gate before live capital — verdicts server-side only | drift ≤400 pts · criteria ≤20 · kpis ≤12 | r2-review (backbone, delivered) · canary telemetry (BR-EX-57/59 family) · `chart-series.rules.v1` (BR-EX-64) · gate policy registry (BR-EX-67) | payload absent → panels stay declared smoke with honest copy; backbone still real (eligibility/quorum/SLA/decide against r2-review) | schema+fixture; verdict-recompute negative; frontend `governanceAdditions.test` renders it | Codex | N09 · N10 | `RECEIVED` | `GateLiveReview` — smoke `LIVE_GATE` deleted on delivery | none until approved | ROADMAP §H.2.2; spec §7.11.2 |
| BR-EX-71 | 2026-08-30 | Waivers & Conditions `/governance/waivers` | Conditions are created at R1/R2 and resurface only on their own deployment's exit review — no surface answers "what does the fund owe fleet-wide, and what expires next"; the register ships as declared smoke (`WAIVER_ROWS`) mirroring the cast's existing conditions | `governance.conditions-register.v1`: keyset list of `{ condition_id, text, source { approval_id, gate }, deployment_id?, stage, due { kind: CLOCK\|EVENT\|POLICY, at?/event?/policy_rev? }, state OPEN\|WAIVED\|SATISFIED\|EXPIRING\|LAPSED, owner, created_at }`; server-side filters (state, stage, owner, deployment); counts per state; EXPIRING/LAPSED are SERVER transitions feeding the CC attention stream (BR-EX-43) | `PORTAL_CONTROL` (governance records) | read-only · medium: a lapsed condition quietly missing is a governance failure — LAPSED is a blocking finding, never a default | ≤500 open conditions · keyset 50/page | approvals + exit-review condition stores · CC attention (BR-EX-43) | endpoint absent → register stays declared smoke; filters stay client-side over demo rows and say so | schema+fixtures incl. one row per state; lapse transition fixture; frontend `governanceAdditions.test` | Codex | N09 | `RECEIVED` | `WaiversRegisterScreen` — smoke `WAIVER_ROWS` deleted on delivery | none until approved | ROADMAP §H.2.3; spec §7.11.3 |
| _next: BR-EX-72_ | — | — | — | — | — | — | — | — | — | — | — | — | `RECEIVED` | — | none until approved | — |

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

N13A–N17A and the exact current-source N13B–N17B campaign are closed. Continue
without reopening those phase labels:

1. review and merge the N13B–N17B branch into `dev`; do not promote
   `main`/stable;
2. integrate Claude's UI branch against the updated `dev` and resolve the
   shared tracker deliberately;
3. start a new backend campaign from updated `dev`, beginning with the
   canonical workspace/resource-scoped Paper screen API (`TD-EX-01`);
4. move current-source compatibility ownership to the canonical Rust Edge
   route and enforce an Edge-global/per-profile source quota before any
   multi-replica rollout (`TD-EX-02`/`TD-EX-03`);
5. publish a signed dev image and activate one Paper screen/profile in a
   bounded dev window, leaving stable, Sandbox, Live and Command dark;
6. run product-path auth/load/fault/rollback/soak evidence and claim an SLO
   only from that deployed result;
7. deliver BR-EX-41…67 in deduplicated screen slices, then widen reads Paper →
   Sandbox → Live; keep Event/Artifact and every command independently gated.

The exact open gates, owners and containment are authoritative in
[`EX_BE_N13_N17_DEBT_CLOSEOUT.md`](./backend/EX_BE_N13_N17_DEBT_CLOSEOUT.md).

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
