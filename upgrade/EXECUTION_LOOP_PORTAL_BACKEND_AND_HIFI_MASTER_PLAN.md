# Execution Loop — Portal Backend and HiFi Master Plan

> Status: architecture and delivery plan, review revision 2  
> Baseline date: 2026-08-21  
> Branch: `feat/execution_loop`  
> Registry baseline: revision 4 (`EX-BE-00R4`); revision 3 route baseline at `e78a597`  
> Scope: Portal backend contracts, Portal-owned AWS edge, and the backend slices needed by the 17 Execution Loop screens  
> Non-scope: Trading System, QuantBT engine, broker adapters, matching, risk, fills, accounting, and frontend visual implementation

This document is the backend authority for the Execution Loop upgrade. It turns the
screen needs into a safe dual-cell integration plan; it does not replace the visual
specifications or restate their layouts.

## Reading index

Read these sources before implementing a slice:

1. [Backend request](upgrade_frontend_plan_hifi/hifi_execution_loop/CODEX_BACKEND_PLAN_REQUEST.md) — deliverables, scale locks, and coordination rules.
2. [Execution scale and refine](upgrade_frontend_plan_hifi/hifi_execution_loop/EXECUTION_SCALE_AND_REFINE.md) — BR-EX requests and screen-specific scaling risks.
3. [Phase tracker](upgrade_frontend_plan_hifi/hifi_execution_loop/PHASE_TRACKER.md) — shared FE/BE state.
4. [Implementation phases](upgrade_frontend_plan_hifi/hifi_execution_loop/Design%20system%20discussion%20request_version2/IMPLEMENTATION_PHASES.md) — canonical 19-phase order and routes.
5. [Execution cluster guide](upgrade_frontend_plan_hifi/hifi_execution_loop/Design%20system%20discussion%20request_version2/EXECUTION_CLUSTER_GUIDE.md), [design system](upgrade_frontend_plan_hifi/hifi_execution_loop/Design%20system%20discussion%20request_version2/DESIGN_SYSTEM_EXECUTION.md), and [canonical cast](upgrade_frontend_plan_hifi/hifi_execution_loop/Design%20system%20discussion%20request_version2/CANONICAL_CAST.md) — screen semantics, not backend ownership.
6. [Alpha Pool to Live v0.7](upgrade_frontend_plan_hifi/hifi_execution_loop/Design%20system%20discussion%20request_version2/uploads/ALPHA_POOL_TO_LIVE_PORTFOLIO_PORTAL_DESIGN_SPEC_v0.7_vi.md) §§17–25 — authority, SLOs, additive backend gaps, and APX delivery.
7. [Trading System compatibility discovery](TRADING_SYSTEM_PORTAL_COMPATIBILITY_DISCOVERY_HANDOFF.md) and the immutable [contract pack](upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/CONNECTOR-CONTRACT.md) — the only evidence for the current external boundary.
8. [Trading System database schema guide](DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md) — entity relationships, exact numeric/accounting invariants, current-state projections and maintenance governance; it is not authorization for direct Portal DB access.
9. [Trading System unified implementation plan](upgrade_frontend_plan_hifi/hifi_execution_loop/Design%20system%20discussion%20request_version2/uploads/TRADING_SYSTEM_UNIFIED_IMPLEMENTATION_PLAN.md) — target boundaries, V1 compatibility, journal/recovery and latest rollout evidence. Its planned or locally implemented state is not assumed deployed.
10. [Frontend review](upgrade_frontend_plan_hifi/hifi_execution_loop/BACKEND_PLAN_REVIEW.md) — F-1–F-9 and BR-EX-16–22; dispositions are recorded in §15.4.
11. [Backend architecture guide](BACKEND_ARCHITECTURE_IMPLEMENTATION_GUIDE.md) and [backend index](backend/README.md) — existing Portal control-plane foundation and status vocabulary.
12. [Dual-cell D0 reconciliation and D1 decision plan](backend/EX_BE_02_LIVE_D0_RECONCILIATION_AND_D1_DECISION_PLAN.md) — sanitized two-cell evidence, locked topology, separate identities and the smallest reversible owner-gated bootstrap.

The wireframes remain the visual authority. This plan is authoritative for data
ownership, endpoint shape, compatibility, security, freshness, sequencing, and
backend exit gates.

## 1. Authority and prohibited-change rules

### 1.1 Authority map

| Plane | Authority | Owns | Must not own |
|---|---|---|---|
| Portal TypeScript control plane, SGP | Portal | identity/session/RBAC; approval and promotion workflow; commissioned feature registry; command authorization; evidence links; audit; idempotency; operation state; owner decisions | broker credentials; execution truth; fills; accounting; Trading System risk decisions |
| `portal-execution-edge-rs`, AWS HK | Portal integration edge | external-contract adapters; capability negotiation; read projections; query/aggregation/downsampling; freshness evaluation; SSE fan-out; authenticated command relay | independent trading decisions; direct broker access; rewriting Trading System data |
| Trading System, AWS HK | Trading System | runtime state; orders/fills; broker sync; risk; accounting; reconciliation; command acceptance and terminal outcome | Portal user/session identity; Portal approval policy; Portal promotion stage |
| Python compute/adapters, Research cell | Quant compute plane | strategy/alpha implementation; `quantbt-engine==1.0.8`; research/backtest/WFO; narrowly scoped compatibility adapters that require Python | Portal CRUD/control plane; live authority; high-volume query/realtime transport |
| Frontend | presentation | route rendering, state presentation, human confirmation | inventing authority, freshness, totals, terminal outcomes, or permission decisions |

Every panel value must carry `source_authority`:

- `RESEARCH`: research registry/artifact result owned by the Research plane.
- `EXECUTION`: authoritative value returned by Trading System or broker through Trading System.
- `BROKER`: broker-observed value relayed by Trading System; never synthesized by Portal.
- `DERIVED`: a Portal-computed transformation/aggregation with a non-empty
  `formula_version` and source timestamp. A pass-through fact stored in a Portal
  projection retains `EXECUTION` or `BROKER`; storage location never changes authority.

Portal workflow records have a separate `owner_plane: PORTAL`; they are not a fifth
`AuthorityBadge` value. Any numeric/data panel nested in a workflow screen still
uses exactly `RESEARCH | EXECUTION | BROKER | DERIVED`. This distinction keeps
“who owns this approval record?” separate from “who owns this number?”.

### 1.2 Prohibited changes

Portal agents and services must never:

- edit Trading System or QuantBT source, schema, Redis, database rows, broker state,
  deployment state, risk rules, matcher, or accounting;
- connect a browser directly to the AWS execution cell;
- read broker secrets or turn a Portal session into a broker credential;
- infer `FILLED` from requested quantity, infer terminal success from HTTP `202`,
  or collapse `PARTIAL`/`UNCERTAIN` into success;
- merge runtime state, promotion stage, readiness, and broker sync into one status;
- emit a synthetic Trading-System `source_sequence` when none exists;
- add unlike currencies, hide stale/partial/unavailable states as `0`, or make a
  destructive command available because the read projection merely looks healthy.

Any external capability absent from the contract pack is a request to the Trading
System owner, not permission for a Portal-side workaround.

## 2. Current-state reconciliation

### 2.1 Verified external baseline

| Evidence | Finding | Consequence |
|---|---|---|
| Contract-pack coverage | 15/15 covered; redaction audit PASS | Discovery is sufficient to plan, not to enable production writes |
| Runtime identity | Running gateway digest begins `sha256:4f63dc9949f8`; running image differs from Git HEAD | Pin compatibility to digest/capabilities, never assume repository HEAD |
| HTTP surface | 104 operations; OpenAPI lacks reliable bodies, responses, and security | Generate Rust wire models from `extract/` evidence and contract fixtures, not blind OpenAPI generation |
| Data model | 94 tables, 2 views, 1,291 columns, zero reported drift | Preserve exact vocabulary and decimal types; do not duplicate the schema in Portal |
| Numerics | PostgreSQL numeric values arrive as JSON strings | Use `rust_decimal::Decimal`; never `f64` for money, quantity, price, PnL, or risk |
| Events | Runtime exposes only `ORDER_STATUS`; 1,179 rows; no SSE/WS/global sequence | Build bounded poll/projection first and expose Portal SSE from its own ordered projection |
| Commands | Journal exists, rollout off; acknowledgement false; 430/430 observed DEAD | No command production activation until Trading System evidence and owner gate pass |
| Paging | Offset-style source surfaces and incomplete source contract | Portal Query API exposes keyset paging; edge adapters absorb source limitations |

### 2.1.1 Evidence precedence and known documentation drift

The connector resolves disagreement in this strict order:

1. read-only probes and the signed contract pack from the running image;
2. the running gateway's `/v1/contracts`, revision headers, capability and health responses;
3. the immutable deployed image/tag manifest and migration ledger;
4. generated schemas/fixtures tied to that exact revision;
5. implementation logs in the Trading System unified plan;
6. schema/design prose and target architecture.

This prevents two concrete errors:

- the schema guide heading still summarizes 88 tables/2 views while the runtime extract records
  94 tables/2 views and 1,291 columns; runtime inventory wins, while the guide remains useful for
  entity invariants and migration-41 current-state projections;
- the Trading System plan records durable-journal engineering and release work, but the delivered
  contract pack observes rollout `OFF`, acknowledgement false and 430/430 DEAD. Portal therefore
  keeps command integration disabled until a new runtime pack proves otherwise.

No endpoint, event type, table, rollout state or command capability is inferred from an
implementation-plan checkbox. The edge publishes the evidence source and capability snapshot used
for every decision.

### 2.2 Vocabulary ownership

| Vocabulary | Owner | Canonical values / rule |
|---|---|---|
| `TradingMode` | Trading System | `backtest`, `live`, `paper`, `replay`, `sandbox`; Execution UI uses the relevant subset |
| `RuntimeState` | Trading System | `ACTIVE`, `ARCHIVED`, `HALTED`, `REDUCING` |
| `BrokerSync` | Trading System | `ERROR`, `MISMATCH`, `OK`, `STALE`; Portal may add `UNKNOWN` only as an explicit not-yet-observed projection state |
| order, fill, command-journal states and reason codes | Trading System | Preserve wire value; translate only through versioned adapters |
| `PromotionStage` | Portal | `PAPER_OBSERVATION`, `SANDBOX_VALIDATION`, `LIVE_CANARY`, `LIVE_FULL`; absent from all discovered TS tables |
| readiness, approval state, evidence completeness, operation presentation state | Portal | Versioned Portal contracts; never written back as execution truth |
| freshness state | Portal policy over source facts | `OK`, `AGING`, `STALE`, `PAUSED`, `UNKNOWN` |
| panel state | Portal presentation contract | `loading`, `ok`, `empty`, `partial`, `stale`, `denied`, `unavailable`, `insufficient_data`, `terminal` |

The complete 22-enum/91-CHECK reconciliation is an EX-BE-01 exit artifact. Unknown
external enum values must deserialize to an explicit unsupported value, raise a
compatibility alert, and preserve the raw token; they must not crash the stream or
silently map to a known state.

### 2.3 Capacity lock

The initial design is sized for 3–5 portfolios, 150–500 deployments, 5 venues,
1,000 orders plus fills per day, approximately 182,000 six-month rows, 0.7 events
per minute average and 14 per minute burst, a normal 100-asset correlation view
with a qualification/contract cap of 150×150, and charts capped at 5,000 points.
These are qualification fixtures, not permission to write N+1 queries or load the
full blotter into a browser.

## 3. Dual-cell architecture

```text
Browser
  │ Cloudflare Access + same-origin HTTPS
  ▼
SGP Research cell
  Portal Web ── TypeScript Control API ── Portal PostgreSQL / audit / outbox
                         │
                         │ WireGuard/private routing + TLS 1.3 mTLS
                         │ short-lived asymmetric delegated JWT
                         ▼
AWS HK execution cell
  portal-execution-edge-rs ── Trading System versioned HTTP API contract
       │          │                         │
       │          └── Portal-owned projection PostgreSQL
       └── query/aggregation + SSE          └── Trading System-owned stores/brokers
```

The full Portal codebase does not need to run in AWS HK. A narrowly scoped Rust
edge is deployed there because it is close to the execution authority, absorbs
contract/version differences, and maintains a read projection. TypeScript remains
the business control plane in SGP. Browser traffic never bypasses TypeScript.

### 3.1 Read path

1. Browser requests the same-origin TypeScript API.
2. TypeScript checks session/RBAC and forwards a constrained read request with a
   short-lived audience-bound delegation token.
3. Rust queries its Portal-owned projection or bounded Trading System read API.
4. Rust returns the canonical envelope with authority, timestamps, sequence facts,
   freshness, warnings, and explicit partiality.
5. TypeScript applies field/action policy, records relevant access audit, and
   returns the contract without fabricating freshness.

The three route namespaces are intentionally different:

| Boundary | Namespace | Purpose |
|---|---|---|
| Browser → Portal | `/api/v1/execution/*` | stable same-origin Portal product contract |
| TypeScript → Rust edge | private versioned edge contract | normalized query/SSE/relay contract; never publicly routable |
| Rust edge → Trading System | discovered `/v1/*` V1 routes | exact adapter-bound source contract such as health/contracts/orders/fills/positions/accounts/portfolio/events |

The edge may call only routes proven by the selected adapter and current capability snapshot. It
never consumes Trading System Redis Streams directly, never shells into a Trading System host, and
never turns CLI documentation into a hidden transport. Missing HTTP capability stays disabled or
becomes an explicit request in §15.2.

### 3.2 Command path

1. TypeScript validates role, separation of duties, scope, environment, and approval evidence.
2. `plan` creates an immutable Portal operation with payload hash, idempotency key,
   expiry, blockers, authority target, and required approvers.
3. `apply` requires fresh authentication according to risk tier and uses an
   audience-bound one-operation delegation token.
4. Rust validates the token and capability, translates the command to the pinned
   Trading System contract, then records a relay receipt without claiming success.
5. `verify` observes Trading System state until a terminal/uncertain/expired result;
   `202` remains non-terminal.

The relay maps a Portal operation to one exact Trading System V1/admin command contract. It sends
the Portal operation/idempotency reference in a supported correlation/idempotency field or adapter
header, but never bypasses Gateway/Risk through Redis, database writes or broker SDK calls.

### 3.3 Failure containment

- SGP→AWS link failure makes execution panels `UNAVAILABLE` or `STALE`; Research
  and Roadmap remain available.
- Rust edge failure cannot mutate Trading System without a valid, unexpired,
  idempotent command delegation.
- Projection lag disables state-changing UI according to action policy; it never
  disables Trading System safety controls.
- Version incompatibility opens an incident and blocks affected capabilities only.
- The Portal projection database is disposable and replayable; Portal workflow and
  audit records are durable and are not reconstructed from Trading System.

## 4. Rust compatibility, query, and realtime architecture

### 4.1 Service and crate boundaries

One deployable `portal-execution-edge-rs` starts as a modular monolith to keep
operations simple. Crates enforce future extraction boundaries:

| Crate | Responsibility |
|---|---|
| `execution-contracts` | canonical Portal read/event/command envelopes and exact decimal/time/ID types |
| `ts-contract-v1` | generated/snapshotted wire structs from the immutable contract pack |
| `ts-adapter-v1` | Trading System capability discovery, wire mapping, error normalization |
| `projection-core` | idempotent reducers, source cursors, epochs, replay and gap state |
| `projection-store-pg` | Portal-owned PostgreSQL repositories and migrations |
| `query-api` | keyset queries, server filter/sort, exact counts, preflight/capabilities |
| `analytics` | downsampling, correlation, clustering, aggregates, funnel reconstruction |
| `realtime-sse` | one ordered multiplexed SSE stream per client screen |
| `command-relay` | scoped plan receipt validation, relay, acknowledgement and verification |
| `telemetry` | traces, metrics, structured/redacted logs and compatibility alerts |

Implementation baseline: Tokio, Axum, Reqwest, Serde, SQLx, `rust_decimal`, Chrono,
tracing and OpenTelemetry. Exact versions are pinned only when EX-BE-01 creates
`Cargo.lock`; this plan does not guess versions.

### 4.2 Performance rules

- Async bounded pools and explicit upstream timeouts; no unbounded task spawning.
- Prepared SQL, covering indexes, keyset cursors, and server-side aggregates.
- No N+1 request per deployment/account/order.
- JSON is default; Arrow may be added only for measured matrix/tabular paths behind
  content negotiation. Browser contracts remain stable.
- Charts use the server-selected supported ladder `1m → 5m → 15m → 1h → 4h → 1d`.
  The server selects the finest interval whose inclusive bucket count is ≤5,000; it returns the
  chosen interval, source/returned row counts and coverage. The 5m rung preserves 4–17 day
  incident/review resolution that the former fixed brackets unnecessarily lost.
- Zooming into a range that supports a finer rung triggers a server round-trip for that exact
  range/intent. The browser never interpolates or reshapes an already aggregated series as if finer
  observations existed. Responses are abortable/cacheable so rapid zoom does not create stale race
  wins.
- Correlation returns a packed triangle plus order/labels through 150 assets; beyond
  that, return ranked pairs/clusters and an explicit cap notice.
- Query list default 100, hard maximum 250; frontend residency target at most 2,000.
- One SSE connection per screen multiplexes channels; no WebSocket in this scope.

### 4.3 Compatibility policy

The edge is anti-corruption middleware, not a fork of Trading System. On startup it:

1. calls the proven health/contracts surfaces, records gateway digest, contract/revision headers,
   database migration/schema version, and per-capability rollout state;
2. selects an exact adapter from a tested compatibility matrix;
3. runs read-only semantic probes;
4. exposes only capabilities proven by adapter plus probes;
5. refuses unsupported command capabilities while keeping compatible reads alive.

If `/v1/contracts` is absent or incomplete, the edge may use the pinned contract-pack adapter only
for the exact known image digest. It must not downgrade silently to a “closest” adapter. Capability
snapshots retain `source_revision`, `observed_runtime_revision`, probe timestamps and reason codes
so Portal can distinguish contract compatibility from deployment activation.

Supporting a new Trading System contract means adding a versioned adapter and
golden corpus, not changing frontend contracts or modifying Trading System.

## 5. TypeScript control-plane modules

These modules extend the existing NestJS/Fastify control plane. They own business
policy and call the Rust edge through an internal typed client.

| Module | Owns | Durable records |
|---|---|---|
| `execution-registry` | commissioned routes, feature visibility, venue/freshness/action policies | registry revisions and policy versions |
| `execution-governance` | approval inbox, R1/R2 decisions, separation of duties, promotion state | requests, decisions, conditions, signatures |
| `execution-evidence` | evidence manifests and immutable artifact references | content hashes, provenance, retention class |
| `execution-actions` | plan/apply/verify orchestration and idempotency | operations, attempts, receipts, terminal/uncertain state |
| `execution-delegation` | short-lived signed claims for the Rust edge | key IDs and audit references, never reusable bearer material |
| `execution-audit` | append-only human and service actions | actor, session, reason, target, before/after refs, trace ID |
| `execution-proxy` | same-origin query/SSE proxy and field-level authorization | no execution truth; bounded connection metadata only |
| `execution-incidents` | Portal incident workflow, acknowledgements and resolution notes | incident links and ownership; source findings remain attributed |
| `execution-watchlist` | user/team view preferences | non-authoritative filters and saved views |

### 5.1 Transaction rules

- Approval, operation, audit, and outbox writes occur in one PostgreSQL transaction.
- Outbox delivery is at least once; consumers and relays are idempotent.
- A command operation is append-only after apply. Corrections are linked operations.
- An approval cannot be granted by the requester when separation-of-duties policy
  requires two people; bypass is an explicit audited owner-only action, not a role leak.
- Evidence references are immutable hashes. Replacing evidence creates a new version.
- TypeScript never caches a positive authorization decision beyond the request.

## 6. Version adapters and capability negotiation

### 6.1 Compatibility identity

Each edge response includes an internal diagnostic identity:

```json
{
  "adapter_id": "ts-v1",
  "source_gateway_digest": "sha256:…",
  "source_schema_version": "…",
  "capability_snapshot_id": "cap_…",
  "contract_checked_at": "RFC3339"
}
```

This block is logged and available to administrators but does not clutter normal
screen payloads. The public envelope carries `capability_snapshot_id` so a rendered
decision can be tied back to the exact compatibility observation.

### 6.2 Capability states

Each capability is one of `SUPPORTED`, `READ_ONLY`, `SHADOW_ONLY`, `DISABLED`, or
`INCOMPATIBLE`, with a reason and last probe time. A global green flag is forbidden:
read orders may remain supported while a command path is disabled.

Negotiation combines:

- static adapter range;
- gateway digest and schema version;
- contract-pack expectations;
- safe read probes;
- deployment profile and Portal feature flag;
- owner approval for any command activation.

Unknown versions fail closed for commands. Reads fail explicitly with
`INCOMPATIBLE`, never with a fabricated empty result.

### 6.3 Adapter release gate

A new adapter requires golden request/response fixtures, unknown-enum tests, decimal
round-trip tests, timestamp/timezone tests, source error mapping, replay parity,
performance evidence, and rollback to the preceding adapter. Trading System source
changes are not part of this gate.

## 7. Query, Command, Event, and Artifact contracts

### 7.1 Canonical read envelope

All Execution Query API responses use snake_case and include:

```json
{
  "source_authority": "RESEARCH|EXECUTION|BROKER|DERIVED",
  "as_of": "RFC3339 source observation time",
  "read_at": "RFC3339 Portal read time",
  "source_cursor": {"event_ts": "…", "created_at": "…", "event_id": "…"},
  "source_sequence": null,
  "projection_epoch": "uuid",
  "projection_sequence": 42,
  "source_completeness": "EVENT_SOURCED|POLL_BOUNDED|UNKNOWN",
  "poll_interval_ms": null,
  "freshness_state": "OK|AGING|STALE|PAUSED|UNKNOWN",
  "age_seconds": 12,
  "lag_ms": null,
  "formula_version": null,
  "capability_snapshot_id": "cap_…",
  "delivery_profile": "fixture|shadow|paper|sandbox|live_canary|live_full",
  "panel_state": "ok|partial|stale|denied|unavailable|insufficient_data|…",
  "warnings": [],
  "data": {}
}
```

`as_of` and `read_at` are never interchangeable. `source_sequence` is nullable until
Trading System supplies one. `projection_sequence` orders only the Portal projection
within a `projection_epoch`; it must never be labelled as a source sequence.

The edge computes `age_seconds = read_at - as_of` using its trusted clock. A future
`as_of` outside clock-skew tolerance produces `UNKNOWN` plus a warning, not a clamped zero.
`lag_ms` means observable projection processing lag from edge source-read receipt to committed
projection visibility; it is nullable when those timestamps cannot be compared. It is not source
age and does not prove that a polled transition was never missed.

`source_completeness` states the stronger limitation explicitly. `EVENT_SOURCED` means the selected
entity class is covered by the proven event contract; `POLL_BOUNDED` includes the effective poll
interval and can only claim states observed at polls; `UNKNOWN` blocks continuity-sensitive claims.
At the current runtime, only proven `ORDER_STATUS` coverage may be event-sourced. Runtime, risk,
account, fill and reconciliation classes remain `POLL_BOUNDED` or `UNKNOWN` until a later contract
pack proves broader event coverage.

### 7.2 List and analytical query contract

- Bidirectional keyset pagination: mutually exclusive opaque signed `after`/`before`, stable
  sort plus immutable-ID tie-break, exact `total_count`, forward/backward availability,
  `next_cursor`, and `prev_cursor`. Reverse scans restore evicted pages without restarting from
  the first row or violating the 2,000-row browser residency budget.
- Filters and sort are allowlisted server-side and echoed in response metadata.
- Precision and rounding are server-owned and returned as decimal strings plus
  currency/instrument metadata.
- Aggregates are computed over the full filtered dataset, never only the page.
- Multi-currency results return currency buckets. A base-currency total is absent
  unless an explicit versioned FX policy and rates-as-of are provided.
- Derived metrics include `formula_version`, inputs-as-of, population/sample count,
  and insufficient-data reason where applicable.

### 7.3 Command contract

Command APIs expose three steps:

```text
POST /api/v1/execution/commands/plans
POST /api/v1/execution/operations/{operation_id}/apply
GET  /api/v1/execution/operations/{operation_id}
```

A plan request requires a client-generated, opaque `request_key`. Its idempotency scope is actor,
workspace, environment, command type and target. Repeating the same key plus payload hash while the
plan is valid returns the existing operation; reusing it with a different hash returns `409`, and a
new intent after expiry requires a new key.

A plan contains command type/version, normalized target and expected state/version,
payload hash, risk tier, blockers, warnings, required approvals, fresh-auth demand,
expiry, and one-time apply token reference. Apply returns `202` plus operation ID and
receipt only. Verification reports `PENDING`, `ACKNOWLEDGED`, `SUCCEEDED`, `FAILED`,
`DENIED`, `PARTIAL`, `UNCERTAIN`, or `EXPIRED` without coercion.

`UNCERTAIN` is terminal for the automatic retry loop but non-terminal for operational truth. It
never ages into `EXPIRED`: the external effect may have happened. On the verification deadline,
Portal keeps `UNCERTAIN`, opens/escalates an incident and continues bounded reconciliation until
authoritative evidence resolves it. Risk-increasing commands against the same serialized target
are blocked. A protective desired-state command is not blanket-blocked: the server replans against
fresh authority and may allow it only when the upstream operation is provably idempotent or the new
plan is a safe monotonic protection; non-idempotent close/quantity actions remain blocked pending
reconciliation. `EXPIRED` applies to unapplied plans or operations proven never dispatched.

### 7.4 Realtime event contract

The Browser uses `GET /api/v1/execution/command-center/stream` over same-origin SSE.
Each event contains:

- SSE `id = {projection_epoch}:{projection_sequence}`;
- `event_type`, `schema_version`, entity key, source authority, source cursor,
  nullable source sequence, `as_of`, projected time, freshness, and payload;
- heartbeat and capability/freshness transitions as typed events;
- no batching of distinct domain events into an opaque array.

On reconnect, `Last-Event-ID` resumes only within a retained epoch. Missing history,
epoch mismatch, or detected source-cursor discontinuity emits `projection.gap`, marks
affected views stale, and requires a bounded snapshot before deltas resume.

Contiguous projection IDs prove edge→browser delivery only. They do not prove source→edge
completeness for `POLL_BOUNDED` entities. An epoch cutover retains the preceding epoch read-only for
a bounded overlap and emits a server-assigned `resnapshot_not_before` jitter deadline. Clients keep
the old snapshot visibly aging until that deadline, then fetch the new epoch under server rate
limits; they do not all hit a cold projection simultaneously.

### 7.5 Artifact contract

Evidence and large immutable reports are represented by metadata, never embedded
arbitrarily in commands:

```text
artifact_id, kind, sha256, size_bytes, media_type, schema_version,
source_authority, created_at, retention_class, access_policy, signed_read_url_expiry
```

Portal object storage owns Portal evidence. Trading System evidence is referenced
through source IDs and hashes. Signed URLs are short lived and actor-scoped.

## 8. Projection, storage, and freshness

### 8.1 Projection model

The Rust edge maintains a Portal-owned PostgreSQL projection using idempotent
reducers. Initial ingestion combines scoped `/v1/events` polling, the documented
synthetic order-lifecycle replay, and bounded authoritative snapshot reconciliation.
Direct access to Trading System PostgreSQL is not assumed.

Adapters prefer compact authoritative/current HTTP projections over raw historical snapshots:
`account_sync_current_state`/`broker_account_sync_current_state` semantics, effective sync state,
orders/fills/positions, execution sessions, reconciliation findings, performance/equity snapshots
and broker valuation current state. These schema names describe required meaning, not permission to
query tables. If the running V1 API does not expose a required projection, the capability is
`DISABLED`/`PARTIAL` and becomes an explicit Trading System HTTP request; Portal does not open a DB
backdoor. Immutable `domain_events` remain order/fill/bracket audit/recovery evidence, not a claim
of complete market-data or all-entity event history.

Projection tables are purpose-built read models, not copies of all 94 source tables:

- deployment/runtime/account/broker-binding summaries;
- order/fill/funnel and command-operation projections;
- approval linkage and promotion observation references;
- freshness/capability state;
- aggregate time buckets and correlation caches;
- projection checkpoints, epochs, dead letters, and replay audit.

Account identity is the Trading System internal `account_id`, scoped by its strategy,
mode and venue semantics; `external_account_ref` is a broker-binding dimension, not a
unique account key. Multiple internal accounts may share one external binding, so
Account 360 preserves each account while binding exposure aggregates the complete
filtered set. Current/change-only sync projections are used for present state; immutable
orders, fills, capital-ledger entries, source operator operations and relevant domain
events remain evidence/history and are never overwritten to make a current view agree.

Every row retains source identifiers, timestamps, authority, adapter version, and
last projection sequence. Rebuilding swaps to a new epoch atomically after parity.

### 8.2 Freshness and panel-state model

Freshness thresholds live in versioned Portal registry policy per venue, dataset,
and panel class. They are not client constants. Evaluation distinguishes:

- `OK`: observation inside expected budget;
- `AGING`: observation has crossed the warning threshold but not the stale threshold;
- `PAUSED`: authoritative venue calendar says closed/paused;
- `STALE`: source is expected but late;
- `UNKNOWN`: no trustworthy observation/freshness basis exists yet.

Freshness is orthogonal to panel state. Source integrity `BROKEN`, unreachable or
unsupported capabilities, too-small samples, and subset responses map respectively
to explicit `unavailable`, `insufficient_data`, or `partial` panel states plus a
warning; they are not overloaded into the freshness enum. The v0.7 example value
`FRESH` is normalized to frontend-canonical `OK` at the Portal contract boundary.

For VNM, the current data-layer calendar baseline is ICT Monday–Friday,
09:00–11:30 and 13:00–14:30. The Portal consumes a versioned venue-calendar
capability; it must not permanently encode those hours in the browser. A closed
market is `PAUSED`, not `STALE`.

### 8.3 Retention and recovery

- Raw projected events: six months minimum for the agreed workload, partitioned.
- Aggregated time series: retention by interval and product policy.
- Operation/audit/approval records: durable per security/financial retention policy.
- SSE replay buffer: bounded; snapshot is the recovery mechanism beyond retention.
- Point-in-time PostgreSQL recovery and encrypted backups are mandatory before any
  production command profile activates.

The projection may be discarded and rebuilt. Portal workflow, audit, and idempotency
records may not.

Queries outside hot retention never return an ordinary empty collection. They return a typed
availability block such as `COLD_REQUESTABLE` with hot boundary, requested range, authority,
retention policy version and an authorized access-request link; `PURGED` and `UNKNOWN` remain
distinct. Cold restore/import is an administrator workflow with immutable evidence, never an
automatic full-history scan on an interactive request.

## 9. Authentication and security

### 9.1 Trust boundaries

| Hop | Authentication | Authorization / controls |
|---|---|---|
| User → Portal | Cloudflare Access plus Portal session; secure same-site cookie | TypeScript RBAC/ABAC, CSRF for mutations, session/device policy |
| TypeScript → Rust edge | WireGuard/private route + TLS 1.3 mTLS + short-lived asymmetric JWT | audience, issuer, scope, environment, portfolio/account/entity constraints |
| Rust edge → Trading System | dedicated least-privilege service credential per environment | capability allowlist; separate read and command identities requested |
| Rust edge → projection DB | workload identity / rotated secret | Portal-owned schema only; least privilege |

The current optional `X-API-Key` on some Trading System alpha endpoints is not an
end-user security boundary. The Rust edge is the only Trading System client and the
TypeScript control plane is the only user identity authority.

### 9.2 Risk tiers

| Tier | Examples | Minimum control |
|---|---|---|
| R0 | reads, filters, exports | normal session and role/scope check |
| R1 | Paper operational command | reason, fresh projection, idempotency, audit; step-up by policy |
| R2 | Sandbox promotion/cert action | fresh auth, evidence gate, separation of duties |
| R3 | Live protective action such as halt/reduce | phishing-resistant step-up, dual approval where policy permits without delaying emergency protection, one-operation token |
| R4 | Live capital expansion/enable full | WebAuthn, dual approval, envelope constraints, cooling/expiry policy, verified rollback plan |

Protective emergency commands and risk-increasing commands have distinct policy;
the latter can never inherit an emergency bypass intended for the former.

### 9.3 Security invariants

- Delegation JWT lifetime is minutes, audience is the exact edge, and claims bind
  command hash, operation ID, actor, environment, scope, risk tier, and expiry.
- mTLS keys and service credentials reside in secret management, not repository or
  frontend; rotation supports overlap and explicit revocation.
- Sensitive logs are structured and redacted; request payload hashes replace broker
  secrets or excessive position details.
- Rate limits exist per user, role, route, command target, and upstream capability.
- SSE uses the existing session via same-origin proxy; no long-lived credential is
  placed in a query string.
- Administrative access is separately audited. Direct database reads are never an
  implicit bypass around API policy.

## 10. Backend contract for the 17 HiFi screens

The screen copy/layout/components stay in the HiFi package. The contracts below
define the minimum backend truth needed to replace fixtures. All responses use the
envelope in §7.1 and all money/quantity fields are decimal strings.

### 10.1 Approval Inbox — `/governance/approvals`

- Query: `GET /api/v1/execution/governance/approvals` with keyset, exact count,
  allowlisted filter/sort, SLA state, requester, gate, scope, environment, and
  evidence completeness.
- Commands: none inline; opening a review is navigation, not approval.
- Ownership: approval/SLA/evidence linkage is a Portal workflow record; linked data
  panels retain `RESEARCH`/`EXECUTION`/`BROKER`/`DERIVED` authority and freshness.
- Failure state: inbox can remain available with linked facts `PARTIAL` or `STALE`.

### 10.2 Gate R1 Review — `/governance/approvals/:approvalId/r1`

- Query: approval detail, immutable evidence manifest, reproducibility/readiness
  findings, source-linked runtime facts, conditions, approver eligibility.
- Command: Portal-owned approval decision through plan/apply with reason, expected
  approval version, evidence hashes, and separation-of-duties check.
- Ownership: governance verdict is Portal-owned; research evidence is `RESEARCH`,
  execution observations are `EXECUTION`/`BROKER`, and computed checks are `DERIVED`.

### 10.3 Gate R2 Review — `/governance/approvals/:approvalId/r2`

- Query: R1 chain, capital preview, account/broker-binding scope, risk envelope,
  rollback evidence, and freshness of each source fact.
- Command: R2 approve/deny/condition through immutable operation.
- Ownership: decision is Portal-owned; capital/risk/account facts `EXECUTION` or `BROKER`;
  preview calculations `DERIVED` with formula version.

### 10.4 Paper Workbench — `/deployments/paper/:deploymentId`

- Query: `GET /api/v1/execution/query/deployments/{id}` plus `/series`; selected
  server interval, at most 5,000 points, runtime/readiness/broker sync separated.
- Command: only catalogued Paper R1 actions, through plan/apply/verify.
- Authority: order/fill/runtime/accounting `EXECUTION`; broker observations `BROKER`;
  charts/ratios `DERIVED`; promotion stage is a Portal-owned vocabulary.

### 10.5 Paper Exit Review — `/governance/exit-reviews/:reviewId`

- Query: observation-window progress, server-evaluated gate criteria, breaches,
  evidence hashes, missing evidence, canonical `PAPER_OBSERVATION` lifecycle
  stage and recommended next eligible action.
- Command: record review decision through canonical plan/apply/poll. `PROMOTE`
  creates only a Portal-owned scoped authority grant; a distinct later
  operation must consume it and no Paper Exit decision commands Trading System.
- Ownership: criteria/decision are Portal workflow records; inputs are attributed
  per source and evaluation result is `DERIVED` with policy/formula version.

### 10.6 Admin Action Drawer — `/administration/actions`

- Query: `GET /api/v1/execution/commands/catalog` scoped to actor, entity,
  environment, capabilities, freshness, and risk tier.
- Commands: generic plan/apply/verify contract; complete blocker list, payload diff,
  expiry and approval requirements before apply.
- Ownership: command availability/policy is Portal-owned workflow metadata;
  eventual execution result is only `EXECUTION`.

### 10.7 Operations Queue — `/execution/operations`

- Query: keyset/exact-count operation list with server filtering/sorting/grouping,
  source state, Portal state, age/SLA, actor, target and trace correlation.
- Command: acknowledgement is distinct from resolution; both are audited Portal
  workflow actions and cannot rewrite execution result.
- Ownership: operation workflow is Portal-owned; relay/source outcome is `EXECUTION`.

### 10.8 Incident Detail — `/execution/operations/incidents/:incidentId`

- Query: incident summary, typed findings, correlated operations/events/entities,
  evidence, freshness/capability timeline and owner notes.
- Command: acknowledge, assign, annotate, resolve with expected version; resolution
  requires evidence and never changes Trading System facts.
- Ownership: incident workflow is Portal-owned; underlying data panels retain one
  of the four canonical source authorities.

### 10.9 Command Center — `/execution`

- Query: `GET /api/v1/execution/command-center` returns a ranked, capped triage
  snapshot; SSE sends ordered deltas for the same normalized entities.
- Realtime: one multiplexed SSE connection; reconnect/gap semantics per §7.4.
- Authority: every row/panel supplies its own authority; ranking is `DERIVED` with
  formula version and its input freshness floor.

### 10.10 Sandbox Certification — `/deployments/sandbox/:deploymentId`

- Query: certification state machine, check results, evidence links, unmet gates,
  account/binding scope, and source capabilities.
- Command: submit/approve/deny certification and separately plan promotion.
- Ownership: certification is Portal-owned; sandbox runtime `EXECUTION`; broker validation
  `BROKER`; scored checks `DERIVED`.

### 10.11 Canary Control Room — `/deployments/live/:deploymentId/canary`

- Query: deployment facts, versioned capital envelope, consumed/headroom buckets,
  guard bands, series, rollback readiness, broker sync and active operations.
- Command: initially no risk-increasing command. Later R3 protective commands and
  tightly scoped canary progression only after production activation gates.
- Authority: runtime/risk/accounting `EXECUTION`; broker facts `BROKER`; headroom
  calculation `DERIVED`; envelope approval/promotion stage is Portal-owned.

### 10.12 Live Full Operations — `/deployments/live/:deploymentId`

- Query: live runtime, orders/fills/positions/accounting, risk envelope, series,
  incidents and operation status with projection continuity visible.
- Command: disabled in initial profiles; R3 protection precedes R4 risk-increasing
  actions. A source/projection gap blocks R4 and marks affected facts stale.
- Authority: execution truth `EXECUTION`, broker observations `BROKER`, derived
  analytics `DERIVED`; workflow records are Portal-owned.

### 10.13 Paper Workbench VNM — `/deployments/paper/:deploymentId/vn-market`

- Query: Paper Workbench contract plus venue session, lunch break/market phase,
  instrument precision, and auction capability.
- Command: Paper-only catalogue constrained by venue phase/capability.
- Authority: venue phase from authoritative calendar/source, runtime `EXECUTION`;
  Portal maps closed sessions to `PAUSED`. ATO/ATC remains disabled until owner and
  Trading System contract decisions are explicit.

### 10.14 Full Blotter — `/deployments/blotter`

- Query: keyset/exact-count orders and fills, server filter/sort, immutable IDs,
  decimal precision, source state, and aggregate header independent of the page.
- Drill-down: `GET /api/v1/execution/query/blotter/orders/{id}/funnel` returns the
  ordered submit→ack→broker→fill lifecycle with missing stages explicit.
- Authority: lifecycle facts `EXECUTION`/`BROKER`; duration/aggregate `DERIVED`.

### 10.15 Alpha 360° — `/deployments/alphas/:alphaId`

- Query: alpha identity and lineage, deployment summaries, server-selected series,
  per-portfolio allocation, readiness/promotion links, and batched insight previews.
- Batch: preview endpoint accepts a capped list to prevent one request per card.
- Authority: registry/research lineage `RESEARCH`;
  execution observations `EXECUTION`; analytics `DERIVED`. `portfolio_id` is required
  and echoed on portfolio-dependent metrics.

### 10.16 Portfolio 360° — `/deployments/portfolios/:portfolioId`

- Query: allocation/runtime/account facts, capital ledger, series, correlation and
  concentration. Server returns a packed matrix through 150×150 or ranked
  pairs/clusters beyond that contract cap.
- Currency: return independent buckets unless a versioned FX conversion is present.
- Authority: capital/accounting `EXECUTION`; broker exposure `BROKER`; correlation,
  headroom and concentration `DERIVED`; portfolio governance is Portal-owned.

### 10.17 Account/Broker 360° — `/deployments/accounts/:accountId`

- Query: virtual-account detail and broker binding; binding aggregate endpoint sums
  across the complete filtered population, not the current page.
- Result: per-currency used/reserved/available/headroom, account count, source
  timestamps, partiality and formula version.
- Authority: account/risk/allocation `EXECUTION`; broker balance/sync `BROKER`;
  cross-account aggregate/headroom `DERIVED`.

## 11. Screen → endpoint → source → authority matrix

This matrix is the wiring index. `TS` means the immutable Trading System contract
through a Rust adapter; `Projection` is Portal-owned and replayable; `CP DB` is the
durable TypeScript control-plane PostgreSQL database.

| Phase / screen | Primary Portal endpoint(s) | Immediate store/source | Number authority |
|---|---|---|---|
| 1 Approval Inbox | `/governance/approvals` | CP DB + linked projection facts | Portal record; linked RESEARCH/EXECUTION/BROKER/DERIVED panels |
| 2 Gate R1 | `/governance/approvals/{id}/r1`, command plan | CP DB + artifact metadata | Portal record; RESEARCH/DERIVED evidence panels |
| 3 Gate R2 | `/governance/approvals/{id}/r2`, `/capital-preview` | CP DB + projection | Portal record; DERIVED/EXECUTION/BROKER panels |
| 4 Paper Workbench | `/query/deployments/{id}`, `/series` | Projection ← TS | EXECUTION/BROKER/DERIVED |
| 5 Paper Exit | `/governance/exit-reviews/{id}` | CP DB + projection + artifacts | Portal record; DERIVED plus source panels |
| 6 Admin Drawer | `/commands/catalog`, `/commands/plans`, `/operations/{id}` | CP DB → Rust relay → TS | Portal policy record; EXECUTION result |
| 7 Operations Queue | `/operations` | CP DB + relay receipts + projection | Portal record; EXECUTION outcome |
| 8 Incident Detail | `/incidents/{id}` | CP DB + correlated projection | Portal record plus source-attributed panels |
| 9 Command Center | `/command-center`, `/command-center/stream` | Projection + CP DB | per-row source; DERIVED rank |
| 10 Sandbox | `/query/deployments/{id}/certification` | CP DB + projection ← TS | Portal record; EXECUTION/BROKER/DERIVED panels |
| 11 Canary | `/query/deployments/{id}/canary` | Projection ← TS + CP DB envelope | EXECUTION/BROKER/DERIVED panels; Portal envelope record |
| 12 Live Full | `/query/deployments/{id}/live` | Projection ← TS | EXECUTION/BROKER/DERIVED |
| 13 VNM Paper | `/query/deployments/{id}`, `/query/venues/{venue}/session` | Projection + venue capability | EXECUTION + calendar source/DERIVED |
| 14 Blotter | `/query/blotter`, `/blotter/orders/{id}/funnel` | Projection ← TS | EXECUTION/BROKER/DERIVED |
| 15 Alpha 360 | `/query/alphas/{id}`, `/insight-previews` | registry/artifacts + projection | RESEARCH/EXECUTION/DERIVED |
| 16 Portfolio 360 | `/query/portfolios/{id}`, `/correlation`, `/capital-ledger` | Projection + analytics | EXECUTION/BROKER/DERIVED |
| 17 Account/Broker 360 | `/query/accounts/{id}`, `/broker-bindings/{ref}/exposure` | Projection + analytics | EXECUTION/BROKER/DERIVED |

The public prefix for every abbreviated endpoint above is `/api/v1/execution`.
Per-panel envelopes are retained when a composed screen response contains values
with different authorities or freshness; the outer response must not erase them.

## 12. Phase priorities, dependencies, and exit gates aligned to all 19 phases

### 12.1 Shared backend runway

The frontend phase order remains unchanged. Backend foundations are shared slices,
so one slice may unlock several screens without inventing a second product roadmap.

| Slice | Priority | Deliverable | Unlocks |
|---|---:|---|---|
| EX-BE-00 | P0 | Registry revision 3 and canonical routes | Phase 0 navigation and routing for 1–17 |
| EX-BE-00R4 | P0 / delivered | Registry revision 4 adds per-screen delivery profile/policy, echoed by composed envelopes | fixture/shadow truth for all screens, especially 11–12 |
| EX-BE-04a | P0 / delivered | TypeScript bidirectional keyset/filter/sort/exact-count primitives over control-plane PostgreSQL | phases 1, 2 and Portal-owned portions of 5/7/8 |
| EX-BE-05a | P0 / fresh-PG gate green | TypeScript governance/evidence/approval workflow and audit, with external panels allowed unavailable | phases 1–2 on real Portal data without AWS |
| EX-BE-01 | P0 / contract complete | Rust workspace, canonical contracts, `ts-contract-v1`, vocabulary reconciliation and golden corpus | all real-source screen contracts |
| EX-BE-02 | P0 / foundation complete; D1 hosts staged, exact AWS owner SG rule pending | mTLS/delegated-auth boundary, capability negotiation, bounded read-only transport, exact-GET Source Proxy, preflight and rollback; `portal0` stays down and production flags stay false until SG identity plus real SGP↔AWS evidence | safe AWS integration |
| EX-BE-03 | P0 / foundation complete; source ingestion integration pending | projection schema, reducer, cursor/epoch/replay/snapshot and freshness evaluator; production ingestion flag remains false | phases 4, 9–17 |
| EX-BE-04b | P1 / foundation complete; screen API/source integration pending | Rust projection query primitives: bidirectional keyset, filter/sort/count, adaptive series ladder, exact decimals and typed cold retention | phases 4, 9, 11–17 |
| EX-BE-05b | P1 | TypeScript operations/plan/apply/verify plus authenticated Rust relay | phases 6–12 mutation/operation paths |
| EX-BE-06 | P1 | multiplexed SSE, gap recovery, backpressure and same-origin proxy | phase 9 and live screens |
| EX-BE-07a | P2 / foundation complete | pure correlation, exposure, funnel, capital-ledger and batched preview analytics | phases 3, 14–17 contracts |
| EX-BE-07b | P2 / integration complete; source activation evidence pending | active-epoch source repositories and six narrow authenticated screen APIs | phases 3, 14–17 integration |
| EX-BE-08 | P2 / offline qualification foundation complete; live evidence pending | security/load/soak/DR/rollback evidence and production profiles | phase 18 and production activation |

### 12.1.1 Six-phase pre-IAM SGP runway

AWS IAM and the owner Security Group change remain prerequisites for D1 live
cross-cell activation, but they do not block Portal-owned work on SGP. The
following six bounded phases are the canonical pre-IAM queue. Their order keeps
authority dark while producing evidence that will still be useful after the AWS
window opens.

| ID | Goal | Backend scope | Claude parallel lane | Exit gate | Status |
|---|---|---|---|---|---|
| PRE-IAM-01 | Close Execution phases 1–2 on SGP | Approval Inbox + R1 detail + plan/apply/poll, non-local keyring delivery, auth/RBAC/Origin/CSRF/SoD and SGP Compose smoke; no AWS call | correct canonical mutation paths and CSRF transport; keep product route/profile inactive until policy review | fresh PG corpus + isolated public-gateway smoke + runtime research-mode readiness + audit/outbox atomicity | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` — SGP backend gate green 2026-08-22 |
| PRE-IAM-02 | Complete Paper Exit Review | Portal-owned exit-review repository, deterministic policy/evidence evaluation and source-unavailable semantics | finish Phase 5 screen states/lineage against the published contract | missing/stale/partial evidence cases; immutable decision/audit tests; no execution command | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` — fresh PG, contract and SGP runtime gates green 2026-08-22 |
| PRE-IAM-03 | Build Command Center snapshot API dark | bounded snapshot composition over existing projection contracts; no SSE/profile activation | consume snapshot, empty, partial, stale, unavailable fixtures and wire the component without client re-ranking | response budget, per-panel authority/freshness, exact counts and fail-closed source gaps | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` — fresh PG 139/139 and contracts 26/26 green 2026-08-22 |
| PRE-IAM-04 | Offline operational hardening | close confirmed H-series contract/security issues, load/replay/restore/rollback evidence that needs no AWS source | consume only published fixtures/contracts; keep failure states visible | focused regression + workspace gates; credential-free evidence report | `PLANNED` |
| PRE-IAM-05 | Prepare D2 dark deployment | image/config/service manifests for AWS Portal Edge + Source Proxy with interfaces/routes/source reads still off | no AWS/live UI activation; continue fixture work | offline render, non-root/read-only image checks, preflight and rollback rehearsal | `PLANNED` |
| PRE-IAM-06 | Tracking cleanup | reconcile Master Plan, backend README/guide, shared tracker and request ledger; classify every blocker by owner | reconcile FE status/evidence and close superseded requests | no contradictory status, no bare `COMPLETE`, exact next dependency/owner per row | `PLANNED` |

`PRE-IAM-01` has closed only the backend lane of product phases 1–2. It does not
change registry revision 4, does not enable `query_enabled` or any command flag,
and does not redefine a Portal governance decision as a Trading System Paper
command. Public product activation requires a reviewed registry policy that can
express Portal-owned governance writes independently, plus Claude's canonical
route/CSRF integration. Qualification evidence and the exact residual boundary
are recorded in
[`EX_BE_05A_SGP_PHASE_1_2_CLOSEOUT.md`](backend/EX_BE_05A_SGP_PHASE_1_2_CLOSEOUT.md).

`PRE-IAM-02` has closed only the backend lane of product phase 5. Its
`PROMOTE` outcome produces a Portal `promotion_authority_grant`, not a Sandbox
activation. Registry/source/command flags remain false. Acceptance evidence and
the exact Claude handoff are recorded in
[`PRE_IAM_02_PAPER_EXIT_REVIEW_CLOSEOUT.md`](backend/PRE_IAM_02_PAPER_EXIT_REVIEW_CLOSEOUT.md).

`PRE-IAM-03` closes the dark backend snapshot lane of product phase 9. Real
Portal governance and user-owned pins are available; uncommissioned Execution
incident, operation and Fleet sources remain unavailable, so composite totals
are null and the mode is degraded rather than falsely empty/healthy. Snapshot
cursor/epoch/sequence remain null, SSE remains unavailable and registry/source/
command flags remain false. Acceptance evidence and Claude's exact five-state
handoff are recorded in
[`PRE_IAM_03_DARK_COMMAND_CENTER_SNAPSHOT_CLOSEOUT.md`](backend/PRE_IAM_03_DARK_COMMAND_CENTER_SNAPSHOT_CLOSEOUT.md).

Claude request `BR-EX-28` is now a tracked cross-queue input. Its 2026-08-22
contract-pack audit correctly found that eight `ops` actions inherit the same
emergency-close handler paths even though OpenAPI exposes only the four
emergency-close paths. The real gap is therefore fifteen actions: seven known
without HTTP plus eight falsely classified as reachable. Phase 6 still needs
one canonical catalogue; phases 7–9 need purpose-built read contracts,
including `streams` and `alpha-activity` for Command Center. Generic Redis
`get`/`scan` remain prohibited. The six-phase queue order is unchanged and this
work is not fabricated inside PRE-IAM-03.

EX-BE-04a→05a has delivered the Portal-owned control-plane foundation without an AWS, Rust,
Trading System or projection dependency. It supplies Approval Inbox and Gate R1 from real
control-plane data while linked execution panels honestly render unavailable. In parallel, the
cross-cell runway has delivered EX-BE-01→02→03→04b and continues with EX-BE-06;
EX-BE-05b follows canonical command/auth contracts and a proven Trading System capability.
EX-BE-07 follows the appropriate 04a/04b query primitive. This preserves the frontend phase order
while removing an unrelated infrastructure approval from the first useful backend screens.

`EX-BE-00R4` is delivered as a registry-only contract: all 17 Execution screens expose
`delivery_profile=fixture`, policy revision 1 and seven independently disabled runtime
flags. Source schema, immutable Pydantic projection, repository invariants, public fixture,
OpenAPI and generated TypeScript types move together. This unlocks Claude's profile wiring
without claiming that any real query, projection, SSE or command capability exists.

`EX-BE-04a` is delivered as a reusable TypeScript foundation in `apps/control-api`.
It provides HMAC-signed/expiring bidirectional cursors bound to resource, workspace,
direction and canonical query; allowlisted filters/sorts; immutable-ID tie-break;
exact counts and `limit + 1` keyset reads inside one `REPEATABLE READ READ ONLY`
PostgreSQL snapshot; explicit public-column projection; bounded timeout, RBAC/scope
guard and value-free telemetry. The canonical `keyset-page.v1` contract matches the
frontend adapter. Evidence is 14 focused tests on a real 182,000-row PostgreSQL 16
corpus and 76/76 Control API tests. This is `FOUNDATION_COMPLETE`: no approval table,
endpoint or delivery-profile activation exists until `EX-BE-05a`.

`EX-BE-05a` now implements those control-plane tables and endpoints: Approval
Inbox, R1 immutable evidence/detail, eligibility/SoD, evidence-bound idempotent
decision plans, apply/poll, quorum/conditions, optimistic concurrency and atomic
audit/outbox. Query and apply tokens use separate rotatable keyrings. External
Research/Execution panels remain complete `unavailable` envelopes and registry
delivery remains `fixture`; there is no AWS/Rust/Trading-System dependency or
authority claim. The fresh PostgreSQL 16 gate is green at 117/117 tests across
13 suites, including 18 governance repository/API tests on 182,000 rows, and the
isolated public-gateway Compose path passes login/password rotation, Inbox/R1,
CSRF denial, plan→apply→poll and exact 1:1:1 decision/audit/outbox atomicity.
The SGP research runtime is healthy in non-dev auth mode with two independent
file-backed keyrings and no inline key material. Phase 1/2 backend status is
`INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`; wider EX-BE-08 cross-cell/load/
soak/DR evidence remains pending. Detailed
evidence and frontend mapping are in
[`EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md`](backend/EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md).

`EX-BE-07a` now delivers the pure Rust analytics contract half of EX-BE-07:
exact/currency-isolated capital preview, explicit order funnel, bounded batched
insights, packed/ranked correlation, reconciled capital ledger and complete-
population binding exposure. It remains `FOUNDATION_COMPLETE` because no source
repository or screen API is activated. EX-BE-07b owns that integration. Evidence
is 21 focused analytics tests and a 72-test locked Rust/PostgreSQL workspace gate;
the Claude field map is in
[`EX_BE_07A_ANALYTICS_CONTRACTS_AND_PURE_ENGINE.md`](backend/EX_BE_07A_ANALYTICS_CONTRACTS_AND_PURE_ENGINE.md).

`EX-BE-07b` now binds that pure engine to Portal-owned PostgreSQL source
snapshots. Six repositories read the active epoch in one repeatable-read,
read-only transaction and require exact source profile, capability snapshot,
adapter identity and declared fact count. Six narrow Rust routes are reachable
only through the session-guarded TypeScript same-origin BFF over reusable mTLS
HTTP/2 and exact-resource delegated JWTs. Canonical OpenAPI/generated types and
a fixture freeze the public contract. Status is `INTEGRATION_COMPLETE /
SOURCE_ACTIVATION_AND_OPERATIONAL_EVIDENCE_PENDING`: registry profiles remain
`fixture`, runtime flags remain false and no Trading System private storage or
command surface is touched. Detail:
[`EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md`](backend/EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md).

The offline portion of `EX-BE-08a` now seals captured canonical observations to
contract/gateway/adapter/capability identity, runs live-order reduction plus
independent journal replay, compares a frozen semantic digest, and emits only a
bounded redacted report with explicit gap blockers. Its locked Rust/PostgreSQL
gate passes 81 tests, including a 5,000-observation bounded qualification unit
and the existing 182,000-observation/row corpora. This is
`OFFLINE_FOUNDATION_COMPLETE / LIVE_SOURCE_AND_CROSS_CELL_EVIDENCE_PENDING`,
not source activation or a latency claim. D1–D4, real source mapping/parity,
cross-cell load/fault/soak/restore evidence and an explicit owner decision still
precede `fixture -> shadow`. Detail:
[`EX_BE_08A_OFFLINE_SOURCE_QUALIFICATION.md`](backend/EX_BE_08A_OFFLINE_SOURCE_QUALIFICATION.md).

### 12.2 Per-phase backend slices

Statuses use the architecture vocabulary, never bare `COMPLETE`:

- `CONTRACT_COMPLETE`: a validated contract/registry exists; no real authority implied.
- `FOUNDATION_COMPLETE`: reusable Portal foundation exists; screen integration remains.
- `INTEGRATION_COMPLETE`: screen-shaped source/repository/API path exists, but
  source activation and production evidence may still be pending.
- `INTEGRATION_PENDING`: screen needs a real adapter/query/workflow slice.
- `PRODUCTION_INACTIVE`: integrated shape exists or is planned but mutation/realtime authority remains disabled.
- `OPERATIONAL_EVIDENCE_PENDING`: implementation exists but load/security/soak/DR evidence is incomplete.
- `PRODUCT_COMPLETE`: all product and operational gates passed. None is claimed here.

| Phase | Goal | Endpoints / events | Authority + freshness | Status | Depends on | Exit gate |
|---:|---|---|---|---|---|---|
| 0 Shell/shared | Registry renders all 17 canonical routes and explicit delivery profiles without data coupling | `/api/v1/portal/registry` rev 4 | Portal registry; no execution freshness | `CONTRACT_COMPLETE` | none | 17 unique `EXECUTION_*` screens; fixture policy fail-closed; schema/API/OpenAPI/generated-type sync and root verify |
| 1 Approval Inbox | scalable approval queue | `GET /governance/approvals` | Portal record; linked source facts keep their own envelopes | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | EX-BE-04a/05a; Claude route/policy integration for activation | 182k exact-count/keyset corpus, RBAC and public-gateway SGP smoke green; registry remains fixture |
| 2 Gate R1 | immutable evidence and valid SoD approval | `GET /governance/approvals/{id}/r1`; plan/apply/poll decision | Portal decision; evidence source-attributed | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | EX-BE-05a; Claude CSRF/canonical-route + reviewed governance-write policy for activation | SoD/evidence/version/expiry/quorum/audit tests and public-gateway 1:1:1 atomicity smoke green; no AWS dependency |
| 3 Gate R2 | safe capital preview and R2 decision | R2 detail, `/capital-preview`, command plan | Portal decision; EXECUTION/BROKER inputs; DERIVED preview | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | EX-BE-03/05a/07b; EX-BE-08 activation evidence | source-backed exact-decimal preview, profile/capability/count mismatch refusal; dual-approval and activation tests remain |
| 4 Paper Workbench | real Paper observation without client aggregation | deployment summary/series; operation status | EXECUTION/BROKER/DERIVED; per-panel policy | `FOUNDATION_COMPLETE` | EX-BE-03/04b; M7 gate evidence | 500-deployment corpus, adaptive ≤5k chart points, Paper action disabled unless verified |
| 5 Paper Exit Review | server evaluates observation exit evidence | exit-review read + canonical plan/apply/poll decision | Portal record; DERIVED with source-attributed inputs; grant-only promotion | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | PRE-IAM-02; Claude HTTP/eligibility mapping; later source activation | fresh PG 129/129, contract 20/20, deterministic missing/partial/stale/unavailable/error, immutable audit/outbox/grant and no execution command |
| 6 Admin Action Drawer | generic safe plan→apply→verify | command catalog, plan, apply, operation poll | Portal policy record; EXECUTION terminal outcome | `FOUNDATION_COMPLETE` | EX-BE-02/05b; TS command capability | plan `request_key`, blocker completeness, duplicate/uncertain reconciliation tests; production flag remains off |
| 7 Operations Queue | scalable, typed operations triage | `GET /operations`; ack/resolve | Portal workflow record plus EXECUTION result | `INTEGRATION_PENDING` | EX-BE-04a/05b | 182k bidirectional keyset tests, ack≠resolve tests, exact count |
| 8 Incident Detail | correlated evidence and explicit incident workflow | incident detail, assign/ack/annotate/resolve | Portal workflow record; source-attributed findings | `FOUNDATION_COMPLETE` | EX-BE-05a/05b/06 | completeness badges, optimistic concurrency, evidence-required resolution and redaction tests |
| 9 Command Center | ranked snapshot plus loss-detectable realtime | command-center snapshot and SSE | mixed per row; DERIVED ranking; epoch/sequence freshness | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | PRE-IAM-03 dark snapshot; BR-EX-28 §8.1 typed `streams`/`alpha-activity`; real source activation + EX-BE-06 parity evidence | bounded snapshot, five failure states, 20k exact-observed corpus and response budget pass; source contracts, snapshot/SSE parity, overlap+jitter resnapshot, slow-consumer and auth-expiry remain |
| 10 Sandbox Certification | auditable certification state machine | certification read/decide/promote plan | Portal record; EXECUTION/BROKER/DERIVED panels | `FOUNDATION_COMPLETE` | EX-BE-03/05a/05b; TS sandbox capabilities | state-transition/property tests, stale evidence denial, command production inactive |
| 11 Canary Control Room | observe versioned envelope and guarded live canary | canary query/series; later protective operations | EXECUTION/BROKER/DERIVED panels; Portal envelope record | `PRODUCTION_INACTIVE` | EX-BE-00R4/03/04b/05b/06; owner live-canary gate | profile-labelled read shadow parity, envelope/rollback tests, dual approval, explicit activation decision |
| 12 Live Full Operations | continuous live truth with gap visibility | live query/series/SSE; later R3/R4 operations | EXECUTION/BROKER/DERIVED; gaps become stale | `PRODUCTION_INACTIVE` | phase 11 evidence + EX-BE-00R4/08 | no-gap soak, ambiguous-result drills, capital envelope and rollback rehearsal |
| 13 Paper Workbench VNM | venue-aware Paper behavior | deployment query + venue session | EXECUTION plus authoritative venue calendar | `INTEGRATION_PENDING` | EX-BE-03/04b; venue contract; ATO/ATC decision | open/lunch/closed/holiday/timezone fixtures; server age/precision contract; no browser clock inference |
| 14 Full Blotter | 182k-row scalable blotter and lifecycle | blotter page/aggregate/funnel | EXECUTION/BROKER/DERIVED | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | EX-BE-03/04b/07b; EX-BE-08 activation evidence | source-backed typed funnel delivered; full-filter load/source parity remains |
| 15 Alpha 360 | portfolio-specific alpha execution view | alpha detail/series/batched previews | RESEARCH/EXECUTION/DERIVED | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | EX-BE-03/04b/07b; EX-BE-08 activation evidence | source-backed capped portfolio-bound batch delivered; source parity/no-N+1 load remains |
| 16 Portfolio 360 | scalable portfolio analytics without false totals | portfolio detail/correlation/capital ledger | EXECUTION/BROKER/DERIVED | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | EX-BE-03/04b/07b; EX-BE-08 activation evidence | source-backed correlation/ledger delivered; 150×150 cross-cell load remains |
| 17 Account/Broker 360 | binding-wide exposure over full population | account detail + binding exposure | EXECUTION/BROKER/DERIVED | `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE` | EX-BE-03/04b/07b; EX-BE-08 activation evidence | source-backed population-count exposure delivered; 500-account source parity/load remains |
| 18 Hardening | release evidence, observability, rollback and DR | health/capabilities/metrics/admin diagnostics | all authority preserved | `OPERATIONAL_EVIDENCE_PENDING` | phases 1–17 target subset + EX-BE-08 | contract/integration/replay/load/security gates, SLO burn test, restore and rollback rehearsal |

### 12.3 Delivery profiles and stop gates

Every screen moves independently through:

1. `fixture`: frontend and canonical contract fixtures only;
2. `shadow`: real reads compared with captured/golden truth; no commands;
3. `paper`: Paper reads and separately approved R1 commands;
4. `sandbox`: sandbox capabilities after certification evidence;
5. `live_canary`: live reads first, then tightly scoped protective commands;
6. `live_full`: only after owner approval, operational evidence, and rollback rehearsal.

Registry revision 4 is the authority for the active profile and policy of every
commissioned screen. Every backend envelope echoes `delivery_profile`; a composed
screen may return a stricter profile on an individual panel. `fixture` and `shadow`
must be visibly labelled by the frontend's `ProfileBadge`. A shadow response contains
real observations but is never rendered or audited as live authority. A registry/
envelope mismatch is fail-closed and makes the affected panel `UNAVAILABLE`.

Feature flags are separate for query, projection ingestion, SSE, Paper commands,
Sandbox commands, Live protective commands, and Live risk-increasing commands.
Disabling one does not require disabling unrelated Research services.

Stop immediately on unrecognized schema/vocabulary, decimal loss, authority loss,
cursor/epoch ambiguity, unverifiable terminal result, secret exposure, failed SoD,
unbounded query/cardinality, projection divergence, or any need to modify Trading
System to make a Portal test pass.

## 13. Contract, integration, replay, load, and security tests

### 13.1 Required test layers

| Layer | Required evidence |
|---|---|
| Registry/contracts | schema validation, route/ID uniqueness, revision compatibility, generated fixture parity, unknown-enum handling, Decimal and RFC3339 round trips |
| Adapter | golden source requests/responses/errors for every supported digest/schema; capability probe snapshots; incompatible-version fail-closed |
| Projection | reducer property tests, duplicate/out-of-order input, cursor collision, epoch swap, dead-letter replay, snapshot+delta parity, six-month rebuild |
| Query | bidirectional keyset stability under inserts/eviction, filter/sort allowlist, exact counts, full-population aggregate, currency isolation, adaptive ≤5,000-point ladder with zoom re-query, typed cold-retention and missing/partial data |
| Realtime | snapshot/SSE convergence, source-completeness labels, reconnect within retention, overlapping epoch cutover with server jitter, injected gaps, heartbeats, slow consumer, bounded buffers, token expiry/revocation |
| Commands | plan `request_key` replay/hash conflict/expiry, stale expected version, SoD, idempotent apply, duplicate delivery, timeout, 202 non-terminal, DEAD/PARTIAL/UNCERTAIN target-lock matrix, reconciliation, verify and rollback |
| Security | RBAC/ABAC matrix, CSRF, mTLS failure, JWT audience/scope/replay, secret/log redaction, artifact URL expiry, rate-limit and privilege escalation tests |
| Operational | server-age/clock-skew and nullable lag semantics, profile propagation, cold-retention response, SLO metrics, trace propagation SGP→AWS→TS, backup restore, projection rebuild, adapter rollback, network partition and dependency degradation |

### 13.2 Performance qualification

Use deterministic synthetic/captured-redacted corpora at the locked scale:

- 500 deployments, 5 portfolios, 5 venues;
- 182,000 six-month order/fill rows with concurrent inserts;
- ~100 accounts per broker binding for aggregate correctness;
- event burst 14/min plus explicit 10× safety burst for buffer behavior;
- 100-asset normal correlations, 150×150 qualification cap, and >150 fallback corpus;
- worst-window chart requests proving hard cap 5,000;
- 100 concurrent SSE clients initially, then measure before setting production cap.

Targets are measured at the Portal edge, not asserted from unit tests: query p50/p95/
p99, upstream time, rows scanned, memory/RSS, allocation pressure, projection lag,
SSE queue depth/drops/reconnects, and TypeScript proxy overhead.

The provisional product budgets from the v0.7 design spec apply until measured,
owner-approved baselines replace them:

| Query class | Provisional p95 budget |
|---|---:|
| Current-state read inside one cell | <200 ms |
| Cross-cell Browser/BFF read | <500 ms |
| Cached chart | <500 ms |
| Uncached medium chart | <1.5 s |
| First Portal event after an authoritative source commit | <2 s target, only for an event-supported source class |
| Correlation snapshot age | <5 minutes by default |
| Command-plan acknowledgement | <500 ms |

There is deliberately no invented end-to-end command-completion SLO: it depends on
the source command, broker and reconciliation contract. These are interaction budgets,
not availability promises. Qualification records p50/p95/p99, upstream time, RSS,
rows scanned and the exact corpus/revision. A budget may be replaced only by measured
evidence and an owner decision; p99 and RSS remain release evidence even when p95 passes.

### 13.3 CI gates

Pull requests touching contracts or backend run:

1. formatting/lint/static analysis for TypeScript, Rust, Python boundaries;
2. schema and generated-artifact drift checks;
3. unit/property/contract tests;
4. Testcontainers integration for Portal PostgreSQL and mTLS boundary;
5. golden adapter/replay corpus;
6. dependency/license/secret/container scanning and SBOM generation;
7. root `./scripts/portal verify` and existing Research regression gates.

Nightly/release gates run the six-month replay, load, fault injection, backup restore,
and long-lived SSE/command soak. No gate is reported passed when its dependency
(including Docker) was unavailable.

## 14. AWS/SGP deployment, CI, rollback, and disaster recovery

### 14.1 Deployment units

| Cell | Unit | Exposure | State |
|---|---|---|---|
| SGP | Portal Web | Cloudflare-protected public origin | stateless build |
| SGP | TypeScript Control API | same-origin/internal | Portal PostgreSQL, audit/outbox |
| SGP | Python quant workers | private queue only | research artifacts |
| AWS HK | `portal-execution-edge-rs` | private WireGuard/mTLS from SGP only | stateless API plus projection access |
| AWS HK | Portal projection PostgreSQL | edge-private only | replayable read model/checkpoints |

Separate security groups deny browser ingress to the Rust edge and deny all Portal
access to broker networks except the explicit Trading System API path. Environments
have separate identities, databases, keys, flags, and audit streams.

#### 14.1.1 D0-locked private topology and live-delivery gates

The 2026-08-22 read-only D0 is `EVIDENCE_COMPLETE / READINESS_PARTIAL`, not a
deployment or source-availability claim. The locked topology is:

```text
Browser -> SGP TypeScript Control API
  -> WireGuard + HTTP/2 TLS 1.3 mTLS + <=60 s delegated RS256 JWT
  -> AWS-HK Portal Execution Edge :8443
  -> Portal-owned projection PostgreSQL

AWS-HK Portal Ingestor
  -> mTLS Portal-only Source Proxy :8444
  -> exact GET allowlist + dedicated read identity
  -> Trading System gateway 127.0.0.1:8000
```

The browser never reaches AWS-HK directly. SGP never reaches Trading System DB,
Redis, CLI or broker endpoints. Only the Portal-owned Source Proxy may call the
published Trading System GET API; the Trading System remains unchanged. SSH is
operator/deploy access only and is never reused for WireGuard, mTLS, JWT, source
API or database authentication.

D0 found contract compatibility but not operational readiness: AWS-HK has recent
OOM-killed Trading System candidate containers and elevated I/O evidence; SGP is
a shared host with no swap and concurrent unlimited containers. Both kernels
support WireGuard, while its CLI/configuration is absent. Candidate tunnel/bridge
CIDRs and ports were locally free, but stable endpoints, AWS route/SG authority,
PKI, dedicated source identity, Portal DB, observability and backup ownership are
unresolved.

Delivery therefore advances through separate stop gates:

1. **D1 network-only:** owner-approved stable endpoints, `/30`, WireGuard,
   minimum firewall/SG rules and rollback; no business traffic.
2. **D2 dark services:** resource-admitted Portal DB, Source Proxy, ingestor and
   edge with signed images, least-privilege roles and mTLS; no source activation.
3. **D3 public contract/auth:** cross-cell H2/mTLS/JWT rejection, capability and
   fault/latency evidence; no business ingestion.
4. **D4 Paper read shadow:** dedicated read identity, production mapper,
   BUILDING epoch, parity/restart/gap/load/restore evidence.
5. **Activation:** separate owner decision for ACTIVE cutover and
   `fixture -> shadow`; command and Live authority remain separate.

The detailed evidence, recommended defaults, decision sheet and rollback are in
[`EX_BE_02_LIVE_D0_RECONCILIATION_AND_D1_DECISION_PLAN.md`](backend/EX_BE_02_LIVE_D0_RECONCILIATION_AND_D1_DECISION_PLAN.md).

Browser→Cloudflare/origin production qualification must prove HTTP/2 or HTTP/3 for
the same-origin SSE route and ordinary fetches. An HTTP/1.1 downgrade is a failed
realtime gate because per-origin connection limits can let long-lived streams starve
queries. The application opens at most one multiplexed SSE connection per active
screen, exposes the negotiated protocol in diagnostics, and continuously probes
snapshot/fetch latency while that stream is open. Private TypeScript→Rust transport
uses independently pooled authenticated connections and cannot consume the browser's
connection budget.

### 14.2 Release sequence

1. Build reproducible signed images with SBOM and provenance.
2. Migrate Portal-owned databases with expand/contract-compatible migrations.
3. Deploy edge in read-only/shadow with commands compiled/configured off.
4. Run compatibility probes and shadow comparison against pinned source digest.
5. Enable projection, then Query API, then SSE independently.
6. Enable Paper command capability only after command-journal evidence and owner gate.
7. Promote Sandbox, Live protective, and Live scale through separate approvals.

Blue/green or canary rollout pins old and new adapters concurrently. TypeScript sends
an explicit contract version; it does not discover behavior by trial on a mutation.

### 14.3 Rollback

- Query/SSE rollback: switch traffic to prior signed image/adapter, preserve prior
  projection epoch, and mark incompatible new data unavailable.
- Projection rollback: stop consumers, restore checkpoint or rebuild a new epoch;
  never edit Trading System state.
- Command rollback: disable the relevant capability flag first. In-flight operations
  remain visible and are verified; they are not falsely cancelled locally.
- Database rollback uses forward fixes or compatible down migration proven in staging;
  destructive reversal is not the first response.
- Frontend/TypeScript/Rust versions publish a compatibility matrix so one unit can
  roll back without silently changing command semantics.

### 14.4 Disaster recovery and observability

- Portal control DB: PITR, encrypted cross-zone backup, quarterly restore evidence.
- Projection DB: backup optional for recovery speed, but full deterministic rebuild
  and time-to-recover must be proven.
- Object evidence: versioning, retention lock where required, hash verification.
- Key loss/compromise: revoke KID, rotate mTLS/service identities, disable commands,
  preserve audit, and re-establish trust through runbook.
- Core signals: request/error/duration, projection lag/gaps/divergence, adapter
  capability state, source errors, SSE clients/queue/drop, command stage/age/uncertain,
  audit/outbox lag, DB pool and query cardinality.
- Trace context crosses TypeScript→Rust→Trading System where accepted; otherwise the
  edge records a hashed source correlation ID and documents the break.

Recovery objectives and final SLO numbers require owner approval after measured
baseline. Until then, §13.2 budgets guide UX and qualification but are not production
availability guarantees.

## 15. BR-EX rulings and explicit Trading System requests

### 15.1 Decisions on all twenty-two frontend requests

| Request | Ruling | Backend contract and reason | Unblocks |
|---|---|---|---|
| BR-EX-01 keyset pagination | **ACCEPT** | opaque signed cursor, stable ID tie-break, default 100/max 250; prevents offset drift at 182k rows | 1, 7, 14 |
| BR-EX-02 server filter/sort | **ACCEPT** | allowlisted filters/sorts execute before count/page/aggregate and are echoed; browser filtering is not truth | 1, 7, 14 |
| BR-EX-03 exact counts | **ACCEPT** | exact `total_count` for workflow/blotter safety surfaces; never “loaded row count” | 1, 14 |
| BR-EX-04 chart downsampling | **MODIFY** | client requests range/intent; server selects the `1m/5m/15m/1h/4h/1d` ladder's finest interval at ≤5,000 points and returns it | 4, 11, 12, 15 |
| BR-EX-05 zoom/performance | **ACCEPT + MODIFY** | zoom that admits a finer rung re-queries the server; qualify p95 at edge and record p50/p99/RSS/rows scanned at a named source/scale | 4, 11, 12, 15, hardening |
| BR-EX-06 batched previews | **ACCEPT** | one capped typed batch with per-item errors/freshness; eliminates N+1 | 15 |
| BR-EX-07 correlation payload | **MODIFY** | packed triangle + labels/clusters through 150; ranked pairs/clusters above cap, never an unbounded square JSON matrix | 16 |
| BR-EX-08 ranked triage | **ACCEPT** | PRE-IAM-03 now server-ranks the capped dark snapshot and returns formula/version/input freshness; real Execution sources remain inactive | 9 |
| BR-EX-09 typed operation grouping | **ACCEPT** | group fields are typed/server-owned; acknowledgement and resolution remain separate transitions | 7, 8 |
| BR-EX-10 realtime transport | **ACCEPT** | EX-BE-06 transport exists dark; PRE-IAM-03 advertises `stream_available=false` until snapshot/resume/gap parity is proven; no WebSocket in this scope | 9 |
| BR-EX-11 source sequence continuity | **MODIFY** | Portal cannot fabricate TS sequence. Return nullable `source_sequence`, exact source cursor, edge `projection_epoch` + `projection_sequence`, and documented gap/resnapshot | 12 |
| BR-EX-12 server precision | **ACCEPT** | Decimal strings plus instrument/currency precision and rounding policy; browser does not choose | 13, 14 |
| BR-EX-13 order funnel | **ACCEPT** | server reconstructs ordered lifecycle with source IDs/times and explicit missing/partial stages | 14 |
| BR-EX-14 binding aggregate exposure | **ACCEPT** | aggregate across all virtual accounts behind a binding and full filter population, bucketed by currency, independent of page | 17 |
| BR-EX-15 portfolio context | **ACCEPT** | `portfolio_id` required and echoed for portfolio-dependent alpha metrics/cache keys | 15 |
| BR-EX-16 source completeness | **ACCEPT** | each entity class is `EVENT_SOURCED`, `POLL_BOUNDED` with interval, or `UNKNOWN`; projection sequence cannot overclaim source completeness | 8, 11, 12 |
| BR-EX-17 bidirectional keyset | **ACCEPT** | mutually exclusive `after`/`before` plus `next_cursor`/`prev_cursor`, stable sort and immutable-ID tie-break | 1, 7, 14 |
| BR-EX-18 idempotent plan | **ACCEPT** | client `request_key` deduplicates same intent within plan validity; mismatched reuse is `409` | 6 |
| BR-EX-19 server age and lag | **ACCEPT** | server computes `age_seconds`; `lag_ms` is nullable observable projection-processing lag, never source completeness | 3, 13 |
| BR-EX-20 delivery profile | **ACCEPT** | registry revision 4 carries per-screen profile; every envelope echoes it and panels may be stricter | 0, 11, 12 |
| BR-EX-21 uncertain outcome | **ACCEPT with safety split** | automatic retry stops, reconciliation/incident continues, risk-increasing same-target commands block; only freshly replanned provably safe protective desired state may proceed | 6, 8, 11, 12 |
| BR-EX-22 provisional SLOs | **ACCEPT** | §13.2 adopts v0.7 §21.4 budgets until measured owner-approved baselines replace them | 1–18 |

These twenty-two decisions remove BR-EX design uncertainty. They do not mark production
integration complete; each phase still depends on the implementation and evidence
listed in §12.

### 15.2 Requests for the Trading System owner

Portal does not implement these inside Trading System. They are compatibility and
production-activation requests, prioritized as follows:

| Priority | Request | Why Portal needs it | Safe behavior while absent |
|---:|---|---|---|
| P0 | mandatory auth on every gateway route; dedicated per-environment read and command credentials | current optional `X-API-Key` is insufficient as an external boundary | private edge only; commands disabled |
| P0 | complete runtime `/v1/contracts`/revision/capability identity tied to image digest and schema | deterministic adapter selection and rollout truth | pin known digest and fail closed on mismatch |
| P0 | command-journal rollout evidence, acknowledgement semantics, idempotency and terminal-state corpus | all observed journal rows are DEAD and ack false | read/shadow only; no production command activation |
| P0 | global monotonic event/delta contract or equivalent cursor guarantee | loss detection and efficient realtime projection | use tuple cursor + snapshots; show gaps/staleness explicitly |
| P1 | event coverage beyond `ORDER_STATUS` for runtime/risk/account/fill/reconciliation changes | accurate low-lag Command Center and live screens | bounded polling/snapshot; affected panels PARTIAL |
| P1 | server-side keyset/source paging and change-watermark reads | scalable projection and lower upstream load | edge keyset over local projection; bounded source polls |
| P1 | compact authenticated HTTP reads for current account/broker-sync state, performance/equity, risk, reconciliation and valuation projections | avoid expensive raw-history polling and preserve schema-guide semantics | mark capability partial/unavailable; never query source tables directly |
| P1 | trace/correlation IDs and operational metrics | end-to-end diagnosis and SLO attribution | edge correlation plus documented trace break |
| P1 | HTTP equivalents for any CLI-only read/command gaps | typed, authenticated, observable integration | capability disabled; no shelling into TS hosts |
| P1 | authoritative venue calendar/session/auction capability, including ATO/ATC decision | correct VNM PAUSED/open/action policy | calendar display with source label; auction actions disabled |
| P2 | jointly reviewed versioned HTTP projection endpoint if existing V1 reads cannot meet verified SLO/correctness | preserve the API boundary while reducing source load | remain API-only; no direct DB assumption |

Any granted request becomes a new contract-pack revision, adapter fixture, threat-model
update, compatibility test, and owner activation decision. It does not silently
change Portal behavior.

### 15.3 Owner decisions still required before production integration

D0 evidence is complete. Before D1, the owner must resolve the exact values and
named owners in the [D1 decision sheet](backend/EX_BE_02_LIVE_D0_RECONCILIATION_AND_D1_DECISION_PLAN.md#6-owner-decisions-required-before-d1); endpoint and credential values are delivered privately and never committed.

1. Approve stable SGP/AWS endpoints, candidate WireGuard `/30` and UDP port,
   AWS SG/UFW ownership, private DNS/SAN and the D1 change/rollback window.
2. Approve separate WireGuard, workload mTLS, delegated RS256/JWKS, dedicated
   Trading System read and PostgreSQL identities plus their delivery/rotation owners.
3. Approve private PostgreSQL 16 RDS placement, retention, PITR/restore test,
   RPO/RTO and cost. Local AWS PostgreSQL is only an explicit bounded-Paper exception.
4. Resolve AWS-HK OOM/I/O admission and assign CPU/memory/disk limits before D2.
5. Confirm Paper/BINANCE USD_M as the first real integration scope.
6. Confirm risk-tier/SoD/WebAuthn policy, especially emergency protection versus
   risk-increasing live actions.
7. Decide VNM authoritative calendar source and ATO/ATC scope.
8. Approve command-journal readiness evidence from the Trading System owner.
9. Approve SLOs and activation profiles after measured shadow/load baselines.
10. Choose the default display timezone. Wire/storage remains RFC3339 UTC; user
   preferences use an IANA timezone, and venue-session labels additionally show the
   venue timezone. Freshness is always server-computed, never derived from browser time.
11. Approve HTTP/2/HTTP/3 production evidence for the public same-origin SSE path.

Until these decisions and their phase gates pass, the correct backend posture is
contracts, fixtures, adapters, shadow reads, and explicit `PRODUCTION_INACTIVE` —
not an undocumented shortcut into the Trading System.

### 15.4 Disposition of `BACKEND_PLAN_REVIEW.md`

| Finding | Disposition | Plan change |
|---|---|---|
| F-1 governance behind Rust/AWS | **ACCEPT** | split EX-BE-04a/04b and EX-BE-05a/05b; 04a→05a starts without AWS |
| F-2 missing 5m rung | **ACCEPT** | adaptive six-rung ladder, finest interval at ≤5,000 points |
| F-3 no backward cursor | **ACCEPT** | bidirectional keyset in §7.2 |
| F-4 projection sequence overclaim | **ACCEPT** | source-completeness classification and edge→browser-only continuity claim |
| F-5 epoch thundering herd | **ACCEPT** | previous-epoch overlap plus server-assigned resnapshot jitter |
| F-6 non-idempotent plan | **ACCEPT** | client request key and payload-conflict semantics |
| F-7 age/lag ambiguity | **ACCEPT** | trusted-server age and explicit nullable processing-lag definition |
| F-8 profile invisible | **ACCEPT** | EX-BE-00R4, registry authority and envelope propagation |
| F-9 uncertain follow-up | **ACCEPT with safety split** | no blind retry/expiry; incident/reconciliation plus target-aware command policy |
| Smaller: 100 vs 150 | **ACCEPT** | 100 normal view, 150 contract/qualification cap, fallback above |
| Smaller: HTTP/2 | **ACCEPT** | protocol becomes an explicit realtime deployment gate |
| Smaller: cold retention | **ACCEPT** | typed `COLD_REQUESTABLE`, never an ordinary empty result |
| Smaller: timezone | **OWNER DECISION** | UTC wire, IANA user preference and venue-zone labels are the proposed rule |

This reconciliation changes only Portal contracts, sequencing and integration requests.
It does not authorize a Trading System change or direct access to its PostgreSQL,
Redis, broker network, host shell or CLI. A future Trading System contract revision is
absorbed by a new Rust adapter and golden corpus behind the stable Portal contract.
