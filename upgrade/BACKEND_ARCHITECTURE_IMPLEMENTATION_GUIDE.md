# Portal Backend Architecture Implementation Guide

> **Version:** 0.1<br>
> **Status:** Architecture runway for staged implementation<br>
> **Updated:** 2026-08-15<br>
> **Scope:** Backend and cross-service contracts from U02 through U13<br>
> **Not a replacement for:** the v0.4 architecture/UIUX guide or Unified Plan

## 1. Purpose

This document turns the target architecture into an implementation runway for
backend agents. It resolves sequencing and boundary questions that should not
be rediscovered in each phase. It does not authorize implementing later-phase
infrastructure early.

Architecture work may run ahead to define contracts, state machines, failure
semantics and rollback. Production code must still follow the phase order and
exit gates in the Unified Plan.

The immediate rule after U01-BE is:

```text
define the backend contract needed by U02/U03
  -> keep current FastAPI authorities stable
  -> integrate current features with parity
  -> establish secure identity and reproducibility
  -> create shared contracts
  -> introduce the Control API façade
  -> isolate durable compute and artifacts
  -> expand engine and data capabilities
```

## 2. Authority and required reading

When documents appear to disagree, use this order:

1. [Portal agent rules](../AGENTS.md) and the closest domain `AGENTS.md`.
2. The v0.5 adjustment guide
   [Research–Execution Dual-Cell & Institutional UI/UX](./RESEARCH_EXECUTION_DUAL_CELL_AND_INSTITUTIONAL_UIUX_ADJUSTMENT_GUIDE_v0.5_vi.md)
   for dual-cell topology, release flow and UI synthesis from `Design/`.
   It supplements, never replaces, v0.4.
3. From the paper flow onwards, the two non-replacing supplements:
   [PAPER_TO_LIVE_EXECUTION_PORTAL_BACKEND_UIUX_ADJUSTMENT_SPEC_v0.6_vi.md](./PAPER_TO_LIVE_EXECUTION_PORTAL_BACKEND_UIUX_ADJUSTMENT_SPEC_v0.6_vi.md)
   (paper→live backend/UIUX spec) and
   [DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md](./DB_ALPHA_PORTFOLIO_ACCOUNT_SCHEMA_GUIDE.md)
   (trading DB schema guide).
4. [Unified Implementation Plan](./UNIFIED_IMPLEMENTATION_PLAN.md), especially
   the active phase and its exit gate.
5. [Architecture and UIUX v0.4](./quantbt_portal_architecture_uiux_final_v0.4_vi.md)
   for target topology, domain lifecycle, API and UX semantics.
6. This guide for backend sequencing and handoff discipline.
7. [Current FastAPI architecture](../apps/portal/backend/ARCHITECTURE.md) for
   implementation facts in the existing service.
8. For Historical Market Data only, the operator contract at
   `/home/bobby/pool_alpha/HISTORICAL_MARKET_DATA_CONSUMER_GUIDE.md`.

The active phase owns implementation authority. A future target diagram is not
permission to add a service, datastore or package before its phase.

## 3. Current and target topology must not be confused

### 3.1 Current deployable topology

```text
browser
  -> portal-web gateway
       -> portal-api FastAPI
            -> local ProcessPool worker
            -> named artifact volume
            -> approved Historical reader + read-only host data
       -> roadmap-task-board-api FastAPI
            -> SQLite volume
```

Current facts:

- FastAPI owns QuantBT request/preflight/run compatibility semantics.
- The process worker and SSE path work, but run state, queueing and artifacts
  are not yet durable distributed platform authorities.
- Roadmap & Task Board remains a private companion service with SQLite.
- Historical data is a bounded read-only input for backtest/research only.
- The gateway is the only public service.

### 3.2 Target topology

The target from [§5–§6](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#5-kiến-trúc-triển-khai-mục-tiêu)
is introduced incrementally:

```text
browser
  -> portal-web
  -> control-api-ts
       -> PostgreSQL + transactional outbox
       -> NATS JetStream
       -> object storage
       -> private compatibility adapters
  -> quant-worker-py
  -> optional Rust query/realtime fast paths only after evidence gates
```

Do not label the target topology as deployed until its phase-specific tests and
operations gates pass.

## 4. Locked architecture decisions

| Concern | Locked decision | Earliest implementation authority |
|---|---|---|
| Browser control boundary | REST/JSON + OpenAPI through one Control API | Thin auth BFF in U07, full façade in U10 |
| Current QuantBT backend | Preserve FastAPI behavior behind adapters; no rewrite-first migration | U03–U10 strangler path |
| Compute language | Python worker using public `quantbt-engine==1.0.8` contract | Existing local worker; durable isolation U11 |
| Control language | NestJS/Fastify TypeScript modular monolith | U07 thin auth slice, expanded U10 |
| Durable metadata | PostgreSQL, SQL-first access and migrations | Identity tables U07; product authority U10 |
| Async jobs/events | NATS JetStream, explicit ack, at-least-once consumers | U11 |
| Immutable bulk data | S3-compatible object storage; MinIO for local/CI | U11 |
| Run progress | SSE for one-way durable progress | Compatibility now; normalized durable stream U10/U11 |
| Live operations | WebSocket with authorization snapshot and cursor | U16; never reuse run SSE as live authority |
| Historical data | Approved installed reader, bounded query, immutable provenance | U01-BE, expanded U13 |
| Realtime data | Separate freshness/subscription contract | Later dedicated data/realtime phase |
| Paper execution/state | Separate execution, ledger and reconciliation contract | U15 |
| Numerical truth | QuantBT artifact; never recomputed by browser/Control API | All phases |
| Rust | Extract measured query/realtime fast paths only | U17 evidence gate |
| Planning authority | Keep private SQLite compatibility until planned migration | U05 compatibility, U18 migration |

Changing a locked decision requires an ADR, migration/rollback impact and owner
review. Adding a library inside a locked stack does not automatically require
an ADR unless it creates a second authority or changes a public contract.

## 5. Backend architecture runway

The `BAR-*` slices below refine, but do not renumber, Unified Plan phases.

### BAR-00 — Close U01-BE deployment gates

Maps to: [U01-BE](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u01-be--historical-market-data-consumer-boundary--real-reader-smoke)

Deliverables:

- Configure the checksum-locked reader wheel publishing secret.
- Repair and verify the canonical storage reader-group ACL/GID.
- Run production-identity doctor, fixed-window real smoke and read-only mount
  inspection without granting writer or Docker privileges to the API user.

Do not expand Historical families here. That belongs to U13.

### BAR-01 — Display and capability contracts for the mother shell

Maps to: [U02](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u02--shared-foundations--figma-ready-design-system)
and [U03](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u03--unified-shell-feature-registry--command-center).

Detailed contract:
[BAR-01 — Feature Registry and Command Center Summary](./backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md).

Goal: give the shell truthful, typed metadata without creating a new backend
authority.

Backend deliverables:

- Versioned source-controlled schemas for `FeatureDescriptor`,
  `ScreenDescriptor`, `ConcernDescriptor` and `CapabilityAvailability`.
- Display metadata fields: unit, timezone, segment, freshness/as-of,
  provenance, permission requirement and source digest.
- Read-only summary adapters over current services. Missing authority returns
  `unavailable` with a reason; never numeric zero or a healthy fixture.
- Schema validation in tests and at application startup for source-controlled
  registry data.

Forbidden in this slice:

- PostgreSQL/NATS/MinIO introduction.
- A fake Command Center database.
- Browser-side inference of backend health, permission or financial state.

Gate: a commissioned feature can be registered without a route-handler edit,
and every displayed operational value identifies its authority and freshness.

### BAR-02 — Compatibility boundaries and parity freeze

Maps to: [U04](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u04--quantbt-research-embedding--parity)
and [U05](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u05--planning-embedding--featuretask-cross-link).

Backend deliverables:

- Snapshot current OpenAPI, run request, artifact and Planning API contracts.
- Keep QuantBT and Planning services private and unchanged in authority.
- Add only additive compatibility metadata and validated link sidecars.
- Define legacy-route and future façade adapters without dual-writing state.
- Record artifact schema version and producer provenance on all new output.

Gate: shell embedding passes golden API/artifact parity; protected strategy
hash and existing Planning state remain unchanged.

### BAR-03 — Operational ingress boundary

Maps to: [U06](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u06--secure-edge--loopback-origin-topology).

Backend deliverables:

- Distinguish liveness, readiness and dependency diagnostics.
- Propagate or create `request_id`, W3C trace context and safe ingress metadata.
- Preserve SSE buffering/timeouts through the proxy.
- Redact topology, filesystem paths, tokens and identity assertions from
  health/error responses.

Gate: wrong origin/AUD/certificate fails closed and stopping the tunnel never
exposes the origin publicly.

### BAR-04 — Thin identity BFF as the first Control API slice

Maps to: [U07](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u07--identity-local-login-session--rbac).

Backend deliverables:

- Scaffold one NestJS/Fastify application with only identity/session/admin
  modules required by U07.
- PostgreSQL migrations for users, external bindings, activation credentials,
  sessions and auth audit.
- Verify Cloudflare JWT/JWKS issuer, audience, time and allowed identity before
  local binding/login.
- Use opaque secure session cookies, CSRF/origin checks, Argon2id, rate limits,
  session revocation and forced first-password change.
- Overwrite and sign internal principal context. Raw JWT, password and browser
  session never reach Python services.

Do not add run/data/alpha authority to the BFF in U07.

Gate: the complete identity/RBAC matrix passes, including forged headers,
cross-user access, expiry, key rotation and session revocation.

### BAR-05 — Reproducibility freeze through the real entry point

Maps to: [U08](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u08--m0-reproducibility-freeze).

Backend deliverables:

- Freeze exact commits, images, package/wheel hashes, OpenAPI, configuration
  fingerprints and artifact schemas.
- Produce a credential-free environment report.
- Run deterministic QuantBT golden routes through authenticated ingress.
- Document tolerances and rollback to the last known-good image set.

Gate: a clean rebuild reproduces the accepted hashes/tolerances and reopens an
existing artifact.

### BAR-06 — Shared contract authority

Maps to: [U09](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u09--contract-foundation--monorepo-platform-tooling).

Backend deliverables:

- Canonical schemas for IDs, UTC timestamps, decimal values, RFC 7807 errors,
  idempotency, optimistic concurrency and event envelopes.
- Snapshot FastAPI compatibility OpenAPI and generate clients/types.
- Add breaking-change CI and cross-language fixture compilation.
- Choose one JavaScript workspace/lock authority through ADR before migration.

Gate: an incompatible schema/OpenAPI change fails CI before application tests.

### BAR-07 — Expand the BFF into the Control API façade

Maps to: [U10](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u10--typescript-control-api-façade).

Backend deliverables:

- Add modular boundaries for workspaces/projects, run registry/read models,
  audit and transactional outbox.
- Proxy current services first; migrate route authority one vertical slice at a
  time behind feature flags.
- Every write records actor, workspace, request, idempotency and expected
  aggregate version.
- Command Center reads authoritative summaries with freshness metadata.

Gate: all browser calls enter the Control API, permission/cross-workspace
attacks fail server-side, parity and rollback flags pass.

### BAR-08 — Durable worker and immutable artifact authority

Maps to: [U11](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u11--durable-quant-worker--immutable-artifacts).

Backend deliverables:

- Introduce NATS JetStream, object storage and isolated non-root workers.
- Separate immutable `run` intent from `run_attempt`, `study` and `trial`.
- Implement claim lease, heartbeat, cooperative cancel, hard-kill grace,
  retry/redelivery idempotency and standardized failure codes.
- Commit artifacts temp → checksums → manifest → content-addressed bundle.
- Reconcile orphan/corrupt bundles and import legacy artifacts explicitly.

Gate: worker kill/restart/redelivery cannot duplicate a successful run; cancel,
retry, checksum, reopen and numerical parity all pass.

### BAR-09 — Engine capability authority

Maps to: [U12](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u12--engine-capability-registry--full-quantbt-ui).

Backend deliverables:

- Build an inspector from the public QuantBT API and exact installed wheel.
- Register signed/hashed capability manifests and certification state.
- Perform actor/quota/alpha/data/methodology/backend/resource preflight.
- Reject unadvertised or uncertified capability even if a crafted request is
  syntactically valid.

Gate: a new certified synthetic capability appears through schema/manifest
without editing core backend dispatch code.

### BAR-10 — Data Catalog and immutable snapshot authority

Maps to: [U13](./UNIFIED_IMPLEMENTATION_PLAN.md#phase-u13--data-catalog-immutable-snapshots--query-foundation).

Backend deliverables:

- Add Dataset, Universe, Instrument, Snapshot and Quality identities.
- Wrap approved Historical reader output; never replace it with filesystem
  scanning or mutable `latest` paths.
- Keep candle, matrix, metrics and order-book schemas separate and versioned.
- Add quality-blocking preflight, repair-as-new-snapshot and digest-keyed query
  contracts with pagination/downsampling metadata.
- Design realtime availability separately; do not infer it from Historical
  release health.

Gate: crafted submission cannot bypass data quality; snapshot lineage/hash and
reopen pass for every activated family.

## 6. Contract rules that apply to every backend phase

### 6.1 IDs and timestamps

- IDs are opaque strings at public boundaries; clients never parse prefixes or
  timestamps from IDs.
- Select the physical UUID/ULID strategy once in U09 ADR; do not mix formats
  inside one aggregate.
- API/event timestamps are timezone-aware UTC ISO 8601 with explicit precision.
- Venue/session timezone remains metadata and is never silently discarded.

### 6.2 Commands and concurrency

Every mutating request eventually carries:

```text
request_id
actor_id
workspace_id
idempotency_key
expected aggregate version / If-Match
command payload schema version
```

- Repeating the same idempotency key and semantically identical request returns
  the original outcome.
- Reusing a key with a different payload is a conflict.
- Stale aggregate versions return a typed conflict; no last-write-wins for
  workflow, approval, deployment or incident transitions.

### 6.3 Errors

- Use RFC 7807-compatible problem documents at the browser control boundary.
- Stable machine `type/code` is separate from safe user-facing detail.
- Include `request_id`; never include stack, secret, host path or raw upstream
  assertion.
- Preserve domain failures instead of collapsing them into HTTP 500.

### 6.4 Availability and display metadata

Availability is not a boolean. The minimum contract is:

```text
state: available | unavailable | degraded | stale | denied | commissioned
reason_code
safe detail
as_of / checked_at
source authority
provenance digest when applicable
retryability
```

Missing data never becomes zero. A fixture must carry explicit fixture source
and must not satisfy a real-environment gate.

### 6.5 Events and consistency

- Database state and outbound durable events use transactional outbox.
- Consumers assume at-least-once delivery and are idempotent by event identity
  plus aggregate version.
- Events describe committed facts; commands express requested intent.
- Schema version, producer, workspace, trace and occurrence time are mandatory.
- Progress may be coalesced; orders, fills, approvals, incidents and audit facts
  must not be silently dropped.

Use the canonical envelope in
[§6.7](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#67-nats-và-event-semantics)
rather than creating a phase-local envelope.

### 6.6 Read models

- Read models name their source authority and expose `updated_at`, source
  cursor/version and staleness.
- Catalog/list endpoints are paginated and bounded from their first durable
  implementation.
- Large series/tables use columnar artifacts, bounded queries or signed object
  URLs; never unlimited JSON through Node/FastAPI.
- Cache keys include authority version/content digest and query semantics.

## 7. Domain and dependency boundaries

The future TypeScript Control API is a modular monolith, not a directory of
controllers sharing repositories:

```text
module/
  domain/          entities, value objects, policies, transitions
  application/     commands, queries and ports
  infrastructure/  PostgreSQL, NATS, object/external adapters
  api/             DTOs, controllers, guards
  contracts/       public schemas and events
```

Rules:

- Domain code imports no web framework, ORM, message client or service SDK.
- A module never imports another module's infrastructure/repository internals.
- Cross-module mutation uses an application command or committed event.
- Cross-module reads use an exported query contract or denormalized read model.
- Python QuantBT services own numerical execution, not user/session policy.
- The browser owns no authorization, numerical or execution truth.

The current FastAPI dependency direction remains:

```text
api -> services -> domain
                -> strategies/adapters/repositories
```

New compatibility work must strengthen this seam rather than introduce route
handler imports across domains.

## 8. Run, artifact and data invariants

### 8.1 Run identity

- `run` is immutable intent; retry does not erase prior execution history.
- Each retry creates a `run_attempt` or an explicit cloned run with lineage.
- A terminal successful artifact remains immutable and addressable by digest.
- Approval/promotion references exact run, attempt and artifact digest.

Use the state model and artifact protocol in
[§8.1–§8.6](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#81-tách-run-run_attempt-study-trial).

### 8.2 Data separation

```text
Historical snapshot -> backtest/research input
Realtime feed       -> current market observation/subscription
Paper execution     -> simulated order/fill/position/account ledger
Live execution      -> private risk/execution/reconciliation authority
```

No arrow above is a fallback for another. A service may join their outputs only
through typed identifiers, timestamps and provenance.

### 8.3 Artifact commit

- Write into an attempt-scoped temporary location.
- Validate schema and reconcile required files.
- Compute checksums before the final manifest.
- Finalize to a content-addressed location.
- Register the exact bundle digest transactionally.
- Reconciler marks missing/checksum-invalid success as corrupt and blocks
  approval.

## 9. Security, observability and performance baseline

### Security

- Services are private unless the approved topology explicitly exposes them.
- Worker runs non-root with resource limits and no live/broker secret.
- Principal context is created by the trusted BFF, not forwarded from arbitrary
  browser headers.
- Logs and evidence redact credentials, cookies, JWTs, activation material,
  filesystem paths and user-supplied secrets.
- Server-side authorization is checked on both command and query resource.

### Observability

- Carry `request_id`, trace context and relevant aggregate IDs through service,
  worker and event boundaries.
- Log state transitions as structured facts, not unbounded raw payloads.
- Expose separate liveness/readiness and dependency capability state.
- Add SLI only when its measuring boundary exists; do not publish invented SLO
  compliance from fixtures.

### Performance

- API startup and lightweight routes do not import QuantBT/Numba kernels.
- Heavy compute never runs in the HTTP event loop.
- Historical and artifact queries are explicitly bounded.
- Pagination, projection and cancellation are part of the initial query
  contract, not a later optimization.
- Rust extraction requires benchmark evidence from
  [§15](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#15-performance-architecture).

## 10. Migration and rollback discipline

Every authority migration uses a strangler slice:

1. Freeze the current request/response/state/artifact behavior.
2. Add the new contract and adapter without changing authority.
3. Shadow-read or compare deterministic output where safe.
4. Route one bounded vertical slice behind a server-side feature flag.
5. Verify parity, failure, audit, security and performance gates.
6. Record the rollback trigger and last compatible schema/image.
7. Move authority only after evidence; then remove the old path in a later
   coherent change.

Never dual-write two authorities without a declared owner, idempotency key,
reconciliation algorithm and rollback procedure.

## 11. Required test gates

Each backend slice selects the applicable layers:

- Pure domain/state-machine tests.
- Schema and serialization round-trip tests.
- Port/adapter contract tests with injected fakes.
- OpenAPI and generated-client compatibility tests.
- Repository migration/constraint/concurrency tests.
- Idempotency, optimistic concurrency and duplicate-event tests.
- Authentication/authorization and cross-workspace negative tests.
- Process/service integration tests.
- Fault injection for timeout, redelivery, lease loss, partial artifact and
  dependency unavailable.
- Golden QuantBT numerical/artifact parity.
- Real-environment smoke only when the exact external dependency is present;
  otherwise explicit skip/unavailable, never fixture substitution.

The detailed platform matrix remains authoritative at
[§31](./quantbt_portal_architecture_uiux_final_v0.4_vi.md#31-testing-strategy-và-acceptance-gates).

## 12. ADR queue and deferred choices

These decisions are intentionally not guessed by an implementation agent:

| ADR | Decision | Required by | Current status |
|---|---|---|---|
| ADR-001 | npm-to-pnpm workspace migration and task graph | U09 | Open |
| ADR-002 | Physical opaque ID format and generation ownership | U09 | Open |
| ADR-003 | PostgreSQL migration/query libraries for Control API | U07 | Open before scaffold |
| ADR-004 | Production object-store provider and retention/object-lock profile | U11 | Open |
| ADR-005 | Durable event schema encoding and registry process | U09/U11 | Open |
| ADR-006 | Worker isolation/supervision mechanism on current VPS | U11 | Open |
| ADR-007 | Feature flag authority and emergency rollback operation | U10 | Open |
| ADR-008 | Planning SQLite-to-PostgreSQL cutover strategy | U18 | Deferred |

An ADR must state context, decision, rejected alternatives, security/operations
impact, migration, rollback and acceptance evidence.

## 13. Agent execution and handoff protocol

Before coding, the assigned agent must report:

```text
Unified phase + BAR slice
current authority being preserved
contract being added or changed
files/services in scope
explicit non-goals
tests and rollback evidence
open ADR/dependency blockers
```

During implementation:

- Work on a branch from current `dev` unless the owner specifies an existing
  feature branch.
- Change one authority boundary per coherent commit.
- Update schema/contract/tests before or with implementation.
- Keep future capability unavailable/commissioned rather than simulating it.
- Commit each validated coherent change immediately.

Handoff must include:

```text
commits
contract/schema versions
state/authority changes
commands and exact test results
performance/security evidence
feature flags and rollback command/path
remaining gates and technical debt
whether anything was pushed or deployed
```

## 14. Next backend architecture task

The complete BAR runway is now delivered: BAR-00 through BAR-16 (U01-BE →
U19 foundations). Delivered authorities:
registry/summary/links contracts and API, the parity snapshot freeze,
additive artifact provenance, the cross-link sidecar, the operational ingress
boundary, the thin identity BFF with the security matrix, and the M0
reproducibility freeze (digest manifest, credential-free environment report,
Planning export count/hash report, executable golden gate), and the shared
contract authority (`packages/contracts/` canonical schemas, generated
OpenAPI types, breaking-change gate, ADR-001/002/005 proposals), and the
Control API façade foundation (workspaces, run read models, product audit,
transactional outbox, ADMIN-first authenticated proxy with signed principal,
idempotent writes, feature-flag rollback), and the durable worker +
immutable artifact authority (run/attempt separation, claim-lease/heartbeat,
standardized failure codes, content-addressed bundles, NATS JetStream +
MinIO private services, ADR-004/006), and the engine capability authority
(source-controlled capability manifest, installed-wheel inspector, typed
capability preflight, read-only capabilities endpoint), and the Data
Catalog + immutable snapshot authority (family identities, quality gate,
digest-addressed snapshots, bounded query contract, read-only data
endpoints). The gateway keeps routing legacy paths until the façade cutover
is exercised.

Deep dives:

- [`upgrade/backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md`](./backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md)
- [`upgrade/backend/BAR_02_COMPATIBILITY_BOUNDARIES_AND_PARITY_FREEZE.md`](./backend/BAR_02_COMPATIBILITY_BOUNDARIES_AND_PARITY_FREEZE.md)
- [`upgrade/backend/BAR_03_OPERATIONAL_INGRESS_BOUNDARY.md`](./backend/BAR_03_OPERATIONAL_INGRESS_BOUNDARY.md)
- [`upgrade/backend/BAR_04_THIN_IDENTITY_BFF.md`](./backend/BAR_04_THIN_IDENTITY_BFF.md)
- [`upgrade/backend/BAR_05_REPRODUCIBILITY_FREEZE.md`](./backend/BAR_05_REPRODUCIBILITY_FREEZE.md)
- [`upgrade/backend/BAR_06_SHARED_CONTRACT_AUTHORITY.md`](./backend/BAR_06_SHARED_CONTRACT_AUTHORITY.md)
- [`upgrade/backend/BAR_07_CONTROL_API_FACADE.md`](./backend/BAR_07_CONTROL_API_FACADE.md)
- [`upgrade/backend/BAR_08_DURABLE_QUANT_WORKER_AND_IMMUTABLE_ARTIFACTS.md`](./backend/BAR_08_DURABLE_QUANT_WORKER_AND_IMMUTABLE_ARTIFACTS.md)
- [`upgrade/backend/BAR_09_ENGINE_CAPABILITY_AUTHORITY.md`](./backend/BAR_09_ENGINE_CAPABILITY_AUTHORITY.md)
- [`upgrade/backend/BAR_10_DATA_CATALOG_AND_IMMUTABLE_SNAPSHOTS.md`](./backend/BAR_10_DATA_CATALOG_AND_IMMUTABLE_SNAPSHOTS.md)
- [`upgrade/backend/BAR_11_ALPHA_REGISTRY_AND_RESEARCH_PLATFORM.md`](./backend/BAR_11_ALPHA_REGISTRY_AND_RESEARCH_PLATFORM.md)
- [`upgrade/backend/BAR_12_APPROVAL_PROMOTION_PAPER_SANDBOX.md`](./backend/BAR_12_APPROVAL_PROMOTION_PAPER_SANDBOX.md)
- [`upgrade/backend/BAR_13_LIVE_CONTROL_AND_OPERATIONAL_SAFETY.md`](./backend/BAR_13_LIVE_CONTROL_AND_OPERATIONAL_SAFETY.md)
- [`upgrade/backend/BAR_14_RUST_FAST_PATHS_GATE.md`](./backend/BAR_14_RUST_FAST_PATHS_GATE.md)
- [`upgrade/backend/BAR_15_PLANNING_POSTGRES_CUTOVER.md`](./backend/BAR_15_PLANNING_POSTGRES_CUTOVER.md)
- [`upgrade/backend/BAR_16_RELEASE_DR_HARDENING.md`](./backend/BAR_16_RELEASE_DR_HARDENING.md)
- [`upgrade/backend/BAR_21_STRATEGY_IMPORT.md`](./backend/BAR_21_STRATEGY_IMPORT.md)

The v0.5 adjustment guide extends the runway with four dual-cell slices —
**BAR-17** Dual-Cell Deployment & Release Authority, **BAR-18** Inter-Cell
Gateway & Contract Authority, **BAR-19** Single-Domain Routing & Emergency
Operations, **BAR-20** Production Activation, DR & Documentation
Reconciliation. Its §8 audit matrix and §8.3 discrepancies are binding review
items before BAR-17 starts.

The original runway is complete. Remaining platform work continues as
phase-scoped slices: the Control API façade cutover (gateway rewiring and
per-route migrations behind flags), the Planning PostgreSQL production
adapter with a real cutover run, Rust extraction only if heavier-path
profiling crosses the §15.6 gate, and the owner-operational release/DR
execution from the BAR-16 report. Any new authority must follow the same
deep-dive → ADR → slice → evidence discipline documented above.

### 14.1 Current backend state (tracking snapshot — 2026-08-17)

**Delivered since the runway note above** (commits on
`chore/v1.1-roadmap-taskboard`):

- Backend requests R1–R15 from `apps/portal/registry/FRONTEND_HANDOFF.md`
  §8.3 are **all closed** — the authoritative list lives there. Highlights:
  typed alpha/capabilities schemas; series envelope (`source_rows`,
  `returned_rows`, `downsample_stride`); `lifecycle_stages[].personas`;
  `RowEnvelope` on wfo/trials+candidates+folds; `fold-plan`
  `producer.as_of`/`source_artifact_digest`; completed + RUNNING run
  fixtures; alpha import is **source-reference only** (R11, no browser
  upload, no SSRF); per-gate preflight `checks` (R14) + public
  `determinism` on `AlphaSummary` (R15).
- **Gateway wire is ON** (`deploy/nginx/portal.conf`): every `/api/` (except
  health/ready/SSE) goes through the Control API façade — session required;
  reads open to all authenticated users (including cross-user runs); **all
  mutations ADMIN-only**. Rollback: `PORTAL_WEB_UPSTREAM=portal-api:8000`.
  Separate one-shot Control API migration and bootstrap services complete before
  the long-lived API serves; bootstrap users remain declared in
  `deploy/control-api/bootstrap-users.yaml`. The API has database-backed
  readiness, a read-only root filesystem and least-privilege container settings.
- `control-api` suite: 34 tests; Portal backend regression 396 passed,
  1 skipped; contracts/parity/M0 snapshots regenerated.
- **PR #35 CI remediation (2026-08-18):** the shared-contract and Control API
  clean-container installers now use `npm ci` with a writable unprivileged
  npm cache, removing the runner-only `EACCES`/exit-243 failure. The façade
  now validates an origin-only `PORTAL_API_BASE_URL`, confines request paths
  to `/api`, rejects encoded traversal/authority tricks and checks the final
  scheme/host/port before `fetch`; this addresses the CodeQL SSRF finding
  without suppressing it. Local evidence: contracts 6/6, Control API 49/49,
  TypeScript typecheck/build, actionlint 1.7.7 and `portal verify` all passed.
  The composed-smoke trap now tears down an explicitly scoped project even
  when `compose up` fails partway, preventing stale containers from breaking
  retries; the full stack passed on isolated project `portal-smoke-pr35` at
  port 18081 and removed its containers/volumes afterward.
  Remote GitHub CodeQL/CI confirmation remains required after the fix branch
  is merged into `dev`.
- **PR #36 clean-run remediation (2026-08-18):** BAR-09 no longer hashes the
  installer-mutated RECORD file verbatim. pip and uv reorder rows and add
  local metadata/bytecode for the same `quantbt-engine==1.0.8` wheel; the
  inspector now hashes canonical sorted wheel-owned rows only. pip target,
  uv archive and uv venv all converge on `0963c05b…73c9`; payload-row drift
  still changes the fingerprint and fails closed.
- **Rust execution scope clarification (owner decision, 2026-08-18):** when
  the Rust backend runway is activated, its product focus is the heavy,
  latency-sensitive **Paper → Sandbox → Live Canary → Live** Execution Cell
  path (market/order/fill streams, risk/execution read paths, reconciliation
  and realtime fan-out). TypeScript remains the approval/workflow/control
  authority and Python remains research/QuantBT compute. This focus does not
  waive BAR-14: each Rust extraction still needs profiling evidence, parity,
  shadow comparison and rollback before it becomes authoritative.
- **Stable v1.0.1 Planning identity/Lark hotfix (2026-08-19):** the embedded
  Planning client now ships in server-backed `v1` mode instead of silently
  stopping at browser `localStorage`. `/roadmap-task-board/api/*` enters a
  dedicated Control API façade guarded by Portal session, origin, CSRF and
  explicit RBAC: authenticated USER may read/create/edit/transition tasks;
  import/delete/restore and Roadmap mutations remain ADMIN-only. The façade
  overwrites any client actor with the authenticated user's display name before
  the private SQLite compatibility service records immutable activity and its
  Lark outbox delivery. Lark copy now distinguishes transition actor from task
  owner. Bodyless DELETE requests no longer advertise JSON, so Fastify reaches
  the CSRF/RBAC controller instead of rejecting ADMIN deletes in its parser.
  Evidence: Control API 62/62, Planning backend 30/30, Planning frontend
  80/80 + build, Portal frontend 381 passed/3 skipped + build. This is a
  compatibility hotfix; it does not replace BAR-15/U18 PostgreSQL cutover.
- **Stable Lark delivery repair (2026-08-27):** deployment configuration now
  fails closed when `PORTAL_NOTIFY_CHANNELS` enables Lark without an approved
  HTTPS bot URL, and the stable release gate also requires its signing secret.
  The message contract identifies the session-derived actor and provides
  bounded task/assignee/timing context while escaping task-supplied Lark
  markup. Mention resolution is an explicit three-person runtime alias map;
  missing identities degrade to names, never guessed identifiers. The
  2026-08-28 follow-up makes tenant organization `user_id` the owner-managed
  input and resolves it through the Lark Contacts API to an app-scoped
  `open_id`. Resolution is cached and fail-closed; no ID/token/response body is
  logged. Text and interactive-card renderers use their distinct official
  mention markup. The retired `LARK_MENTION_MAP` is no longer accepted.
- **Stable Bobby activation repair (2026-08-27):** activation login now
  atomically consumes the one-time credential and binds its identifier to the
  newly created session. Frame 01C verifies the submitted current credential
  against that exact consumed activation proof instead of an older Argon2id
  password row. Active-account reset accepts only the new activation token,
  ordinary login remains password-only, and successful rotation revokes all
  activation records and sessions without persisting plaintext credentials.
- **v1.0.1 HMD reader-permission remediation (2026-08-19):** WFO/three-window
  failures were traced to numeric identity drift, not Parquet or QuantBT:
  canonical storage grants its named reader ACL to host GID `996`, while the
  Portal stack was recreated with `PORTAL_HMD_READER_GID=10001`. The API could
  traverse `/data` but could not read the `0640` release manifest. The
  source-managed launcher now validates the rendered read-only bind and
  effective POSIX ACL/GID before `up`/`run`; `hmd-doctor` executes the
  installed-reader doctor under the exact Compose identity. Runtime repair
  uses the host reader GID and never weakens storage permissions.
- **Execution Loop contract and architecture lock (2026-08-21):** registry
  revision 3 landed at `e78a597` with all 17 canonical Execution routes
  (53 focused registry/API/handoff tests plus root verify). The authoritative
  plan is now
  [`EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md`](./EXECUTION_LOOP_PORTAL_BACKEND_AND_HIFI_MASTER_PLAN.md):
  it maps every screen to endpoint/source/authority/freshness, aligns backend
  gates to the shared 19 frontend phases, and rules on all 15 `BR-EX-*`.
  Boundary clarification supersedes any broader reading of the older Rust
  scope note: Portal Rust is an AWS-HK compatibility/projection/query/SSE/
  command-relay edge only. Trading System remains the exclusive Paper→Live
  execution/risk/fill/accounting authority and Portal agents must not modify
  it. TypeScript remains Portal workflow/security authority; Python remains
  Research/QuantBT compute. No production integration has been activated.
- **Execution Loop review reconciliation (2026-08-21):** frontend review
  `BACKEND_PLAN_REVIEW.md` F-1–F-9 and BR-EX-16–22 are absorbed by master-plan
  revision 2. Governance/query work is split into TypeScript `EX-BE-04a/05a`
  and starts without AWS; Rust `EX-BE-01→02→03→04b→06` remains authoritative
  for the Portal AWS-HK compatibility/projection/query/realtime fast path from
  its first slice. The older BAR-14 profiling gate continues to govern optional
  extraction from existing Research Python paths; it does not postpone this
  explicitly approved Execution edge. `EX-BE-00R4` adds visible per-screen
  delivery profiles before shadow/live wiring. Runtime probes/contract pack win
  over schema prose or rollout checklists (currently 94 tables/2 views at runtime
  versus 88 in the guide, and command journal observed OFF/ACK false/DEAD).
  Portal requests versioned HTTP capabilities from Trading System and never
  compensates with direct PostgreSQL, Redis, broker, shell or CLI access.
- **EX-BE-00R4 delivery-profile contract (2026-08-21):** registry revision 4
  is implemented across authored schema, immutable domain projection,
  fail-closed repository invariants, public fixture, OpenAPI and generated
  TypeScript types. Every commissioned/blocked screen must publish a profile
  plus policy revision; all 17 Execution screens begin at `fixture` with query,
  projection ingestion, SSE, Paper, Sandbox, Live-protective and
  Live-risk-increasing flags false. Fixture cannot enable runtime capability;
  shadow cannot enable commands; SSE requires query+projection; Paper/Sandbox
  cannot exceed their command boundary. This unlocks Claude's ProfileBadge and
  fixture/shadow wiring but does not activate a real Execution authority.
- **EX-BE-04a control-plane query primitives (2026-08-21):** TypeScript now
  provides bidirectional HMAC-signed keyset cursors, canonical allowlisted
  filter/sort parsing, immutable-ID tie-break, exact total/filtered counts and
  public-column-only reads in one `REPEATABLE READ READ ONLY` PostgreSQL
  snapshot. Workspace scope/RBAC are not client filters; cursor replay across
  resource/workspace/direction/query fails closed; telemetry carries no actor,
  cursor or filter values. Canonical `keyset-page.v1` matches Claude's adapter.
  Evidence: 14 focused tests at 182,000 PostgreSQL rows, Control API 76/76 and
  contracts 8/8. Status is `FOUNDATION_COMPLETE`; by design this slice stopped
  before approval/evidence integration, which `EX-BE-05a` below now supplies.
  Deep dive:
  [`EX_BE_04A_CONTROL_PLANE_QUERY_PRIMITIVES.md`](./backend/EX_BE_04A_CONTROL_PLANE_QUERY_PRIMITIVES.md).
- **EX-BE-05a governance/evidence/approval (2026-08-21):** TypeScript and
  Portal PostgreSQL now implement Approval Inbox and Gate R1 without AWS, Rust
  or Trading System access: append-only evidence/findings/decisions, evidence
  manifest integrity, reviewer eligibility/SoD, request-key idempotent
  plan→apply→poll, optimistic approval versions, quorum/conditions, CSRF/RBAC,
  and atomic audit/outbox. Apply authorization uses a dedicated rotatable HMAC
  keyring independent from query cursors; HTTP 202 remains non-terminal and the
  operation poll is authoritative. External panels and the registry profile
  stay honestly `unavailable`/`fixture`. The fresh PostgreSQL 16 gate is green:
  13 suites/117 tests, including governance repository/API 18/18 at 182,000
  rows, keyring configuration fail-closed tests and database readiness. The
  isolated public-gateway gate also proves CSRF denial, canonical
  plan→apply→poll and exact 1:1:1 decision/audit/outbox atomicity. SGP runtime
  uses non-dev auth and independent file-backed keyrings. Phase 1/2 backend is
  `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`; wider EX-BE-08 cross-cell/load/
  soak/DR evidence remains separate. Deep dive and Claude mapping:
  [`EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md`](./backend/EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md).
  Operational closeout:
  [`EX_BE_05A_SGP_PHASE_1_2_CLOSEOUT.md`](./backend/EX_BE_05A_SGP_PHASE_1_2_CLOSEOUT.md).
- **PRE-IAM-02 Paper Exit Review (2026-08-22):** TypeScript and Portal
  PostgreSQL now own the source-safe Phase 5 review aggregate, immutable
  artifact/R1/R2/policy/evidence lineage, four source-attributed panels,
  deterministic fail-closed evaluation and canonical read/plan/apply/poll.
  Missing/partial/stale/unavailable/error remain distinct; exact decimals stay
  strings; WATCH is non-blocking and non-blocking insufficient data carries to
  Sandbox Certification. `PROMOTE` creates only a scoped Portal authority grant
  and cannot command Trading System or activate Sandbox. Fresh PostgreSQL is
  green at 14 suites/129 tests (Paper Exit 12/12), contracts at 20/20, and SGP
  migration/public-gateway/auth runtime gates pass. Status is
  `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`; registry/source/command flags
  remain dark and Claude's Phase 5 contract mapping remains required. Evidence:
  [`PRE_IAM_02_PAPER_EXIT_REVIEW_CLOSEOUT.md`](./backend/PRE_IAM_02_PAPER_EXIT_REVIEW_CLOSEOUT.md).
- **EX-BE-01 Rust contracts and compatibility adapter (2026-08-21):** the
  Portal-owned Execution edge now has a Rust 1.85.1 library workspace with
  canonical exact-decimal/source/freshness envelopes, a pinned Trading System
  v1 wire snapshot and a strictly allowlisted GET-only response adapter. The
  build embeds and verifies the complete 22-enum/91-CHECK vocabulary evidence;
  unknown tokens remain raw and unsupported, revision/header mismatches fail
  closed, and non-JSON 5xx becomes explicit unavailable state. The immutable
  pack identity, Cargo dependencies and CI base-image digest are pinned. Docker
  evidence is 14/14 tests plus `rustfmt` and strict Clippy. This is
  `CONTRACT_COMPLETE`, not a running integration: HTTP transport, mTLS,
  delegated auth, capability negotiation and read-only live probes remain
  `EX-BE-02`. Deep dive:
  [`EX_BE_01_RUST_CONTRACTS_AND_TS_ADAPTER.md`](./backend/EX_BE_01_RUST_CONTRACTS_AND_TS_ADAPTER.md).
- **EX-BE-02 mTLS/delegated auth and read boundary (2026-08-21):** Rust now
  provides a deployable AWS-HK-only edge with mandatory TLS 1.3 mTLS, local
  JWKS RS256 verification, exact audience/environment/resource scope and a
  maximum 60-second delegated-read TTL. Its exact-origin source client has
  bounded queue/concurrency/timeouts/body/retry policy, never follows redirects
  or environment proxies, and can call only the seven EX-BE-01 GET blueprints.
  Digest and v1 contract negotiation fail closed before route probes; public
  probes carry no API key and alpha reads refuse to run without a dedicated
  service credential. Capability state is per route, not global. Evidence:
  27/27 Rust tests, strict Clippy/rustfmt, fresh-PostgreSQL Control API suite,
  TypeScript production build, 32.1 MB non-root production image and AWS
  Compose render. Status is `FOUNDATION_COMPLETE / CROSS_CELL_EVIDENCE_PENDING`:
  no approved WireGuard endpoint/PKI/credentials exist locally, so no live
  SGP↔AWS success is claimed and every production registry flag remains false.
  Deep dive:
  [`EX_BE_02_MTLS_DELEGATED_AUTH_AND_PROBES.md`](./backend/EX_BE_02_MTLS_DELEGATED_AUTH_AND_PROBES.md).
- **EX-BE-03 projection/replay/freshness foundation (2026-08-21):** Rust now
  owns a pure idempotent reducer, structured tuple source cursor, explicit
  `EVENT_SOURCED`/`POLL_BOUNDED`/`UNKNOWN` completeness, deterministic replay,
  complete-versus-partial snapshot semantics, semantic parity digest and
  `BUILDING→ACTIVE→RETAINED` epoch cutover with overlap plus server jitter.
  Freshness is server-computed from immutable versioned policy; `PAUSED` is not
  `STALE`, future source time is `UNKNOWN`, and age remains distinct from
  nullable observable projection lag. Embedded SQLx migration and repository
  atomically persist idempotency/current state/journal/checkpoint/gap, dead
  letters are redacted, immutable evidence is DB-enforced, and unresolved
  gaps/dead letters block activation. Evidence is 42 Rust tests against fresh
  PostgreSQL 16, strict Clippy/rustfmt and a 182,000-observation replay corpus.
  Status is `FOUNDATION_COMPLETE / SOURCE_INGESTION_INTEGRATION_PENDING`:
  projection runtime remains off pending approved AWS database placement and
  real source/cross-cell evidence. Deep dive and ADR:
  [`EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md`](./backend/EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md),
  [`ADR-007`](./backend/adr/ADR-007-PORTAL-PROJECTION-EPOCH-CURSOR-AND-FRESHNESS.md).
- **EX-BE-04b Rust projection query foundation (2026-08-21):** a pure
  `query-api` crate now owns HMAC-rotatable bidirectional cursors bound to
  workspace/environment/active epoch/resource/query/direction, closed
  filter/sort allowlists, exact full-set count and currency-bucket aggregates,
  string-only decimals, and the inclusive six-rung/5,000-point adaptive series
  contract. The PostgreSQL repository runs count/aggregate/page in one
  read-only repeatable-read snapshot and adds exact pre-aggregated series plus
  immutable typed retention snapshots. Evidence is 47 Rust tests, strict
  Clippy/rustfmt, PostgreSQL 16 migration and a 182,000-row insert/eviction/
  reverse-navigation corpus plus a 2,881-point 18-decimal series. Status is
  `FOUNDATION_COMPLETE / SCREEN_API_AND_SOURCE_INTEGRATION_PENDING`; generic
  primitives are intentionally not exposed as a broad public endpoint and no
  Trading System storage/command authority was touched. Deep dive:
  [`EX_BE_04B_RUST_PROJECTION_QUERY_PRIMITIVES.md`](./backend/EX_BE_04B_RUST_PROJECTION_QUERY_PRIMITIVES.md).
- **EX-BE-06 multiplexed SSE foundation (2026-08-21):** Rust now owns a
  bounded screen-level fan-out, exact `{epoch}:{sequence}` SSE IDs, retained
  replay and typed `history_evicted`/`epoch_changed`/source-discontinuity/
  slow-consumer recovery. One PostgreSQL journal poller serves all clients;
  per-client queues are bounded and lag terminates into resnapshot. TypeScript
  exposes only a session-guarded same-origin route and multiplexes its private
  streams over one mTLS HTTP/2 session; delegated JWTs remain server-only and
  expire within 60 seconds. The PostgreSQL/Rust gate passes 51 tests; the
  Control API production build and 102/102 tests also pass. Its cursor verifier
  additionally rejects non-canonical Base64URL encodings before HMAC comparison.
  Status is `FOUNDATION_COMPLETE /
  SOURCE_AND_ACTIVATION_EVIDENCE_PENDING`; both feature flags and every registry
  SSE flag remain false. Deep dive:
  [`EX_BE_06_MULTIPLEXED_SSE_RESUME_BACKPRESSURE.md`](./backend/EX_BE_06_MULTIPLEXED_SSE_RESUME_BACKPRESSURE.md).
- **EX-BE-07a pure analytics contract foundation (2026-08-21):** the Rust
  `analytics` crate now owns currency-isolated exact-decimal capital preview,
  explicit four-stage order funnels, 64-item portfolio-bound insight batches,
  packed correlation through 150 entities with ranked fallback above the cap,
  full-binding exposure with population completeness, and reconciled immutable
  capital-ledger projections. Every result identifies `DERIVED` authority,
  formula version, oldest/worst input freshness and explicit partiality. The
  crate has 21 focused tests; the complete locked Rust/PostgreSQL gate passes
  72 tests, the 182,000-row corpus, rustfmt and strict Clippy. Status is
  `FOUNDATION_COMPLETE / SOURCE_REPOSITORY_AND_SCREEN_API_PENDING`: no endpoint,
  runtime flag, direct Trading System store access or execution authority was
  added. Deep dive and Claude field map:
  [`EX_BE_07A_ANALYTICS_CONTRACTS_AND_PURE_ENGINE.md`](./backend/EX_BE_07A_ANALYTICS_CONTRACTS_AND_PURE_ENGINE.md).
- **EX-BE-07b source-backed screen integration (2026-08-22):** six typed
  PostgreSQL repositories now bind the EX-BE-07a engines to active-epoch,
  profile/capability/adapter-pinned source snapshots in one read-only
  repeatable-read transaction. Six narrow private Rust routes are exposed only
  through a session-guarded TypeScript same-origin BFF over reusable mTLS
  HTTP/2 and exact-resource delegated JWTs. Counts, fact kinds, source
  authority, freshness and decimal precision fail closed; there is no generic
  evaluator or Trading System DB/Redis/CLI access. OpenAPI, generated types and
  a canonical fixture are committed. Status is `INTEGRATION_COMPLETE /
  SOURCE_ACTIVATION_AND_OPERATIONAL_EVIDENCE_PENDING`: all registry profiles
  stay `fixture` and both runtime flags stay false. Deep dive and Claude
  handoff:
  [`EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md`](./backend/EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md).
- **EX-BE-02-LIVE dual-cell D0 (2026-08-22):** sanitized AWS-HK and SGP
  inventories are `D0_EVIDENCE_COMPLETE / D1_OWNER_DECISION_PENDING`; no
  package, network, key, firewall, container, database, source or runtime flag
  changed. Contract compatibility is proven, with explicit runtime-image drift.
  The topology is locked to SGP TypeScript → WireGuard/H2 TLS 1.3 mTLS +
  delegated RS256 JWT → AWS Portal Edge, while an AWS-local Portal Source Proxy
  alone calls exact GET routes on the TS loopback gateway. SSH remains operator
  access only. AWS OOM/I/O admission, stable endpoints, SG/routes, PKI, dedicated
  TS read identity, private PostgreSQL, observability and backup ownership block
  D1/D2. D1 network, D2 dark services, D3 public/auth probes and D4 Paper
  BUILDING-epoch evidence each need a separate gate; no delivery profile is
  activated. Evidence and decision sheet:
  [`EX_BE_02_LIVE_D0_RECONCILIATION_AND_D1_DECISION_PLAN.md`](./backend/EX_BE_02_LIVE_D0_RECONCILIATION_AND_D1_DECISION_PLAN.md).
- **EX-BE-02-LIVE D1 offline preparation (2026-08-22):** versioned owner
  input, fail-closed preflight, host-to-host `/30` WireGuard templates,
  separate mTLS/JWT workload identities, an AWS-local exact-GET Source Proxy,
  dark Edge/Proxy Compose overlay and an exact rollback procedure are now
  committed and CI-gated. The real Trading System read identity is confined to
  Source Proxy; no browser, SGP or Edge process receives it. Status is
  `OFFLINE_PREPARATION_COMPLETE / D1_OWNER_EXECUTION_PENDING`: no package,
  route, SG/firewall rule, key, container, source read, runtime flag or Trading
  System state changed. `AWS_EIP_ALLOCATION_ID` and `AWS_ROUTE_TABLE_ID` remain
  D1 warnings but are mandatory production stop-gates. Deep dive:
  [`EX_BE_02_LIVE_D1_OFFLINE_PREPARATION.md`](./backend/EX_BE_02_LIVE_D1_OFFLINE_PREPARATION.md).
- **EX-BE-02-LIVE D1 execution checkpoint (2026-08-22, accepted
  2026-08-23):** owner-input v1,
  bounded authorization window, exact package versions, separate root-only
  WireGuard identities and validated `portal0` configs are staged on both
  cells. Scoped IAM verified the exact AWS inventory; one UDP
  51820-from-SGP-`/32` rule was privately recorded by `sgr-...`; both activation
  preflights, bidirectional handshake, public-port denial and link-loss
  containment passed without changing Trading System health. Both units are
  enabled and status is `D1_NETWORK_ACCEPTED / APPLICATION_DARK`. D2 remains
  separately blocked by operator-instance-role isolation plus image, identity,
  resource, database and owner-window gates. Evidence:
  [`EX_BE_02_LIVE_D1_EXECUTION_EVIDENCE.md`](./backend/EX_BE_02_LIVE_D1_EXECUTION_EVIDENCE.md).
- **EX-BE-02-LIVE IAM verification and D1 revalidation (2026-08-23):** the
  scoped instance role passed the actual STS/EC2 inventory calls and matched
  the private EIP allocation, effective route table, VPC/subnet/SG and exact
  rollback rule. A fail-closed verifier rejects duplicate, ranged, wildcard or
  wrong-ID WireGuard ingress. Both peers remain active with current handshake,
  peer-only reachability and public 8443/8444 denial; no Portal workload is
  running and Trading System public health remains green. Status is
  `IAM_VERIFIED / D1_REVALIDATED / APPLICATION_DARK`. The attached temporary
  instance profile and IMDS hop-limit two remain explicit D2 stop-gates.
  Evidence:
  [`EX_BE_02_LIVE_IAM_VERIFICATION_AND_D1_REVALIDATION.md`](./backend/EX_BE_02_LIVE_IAM_VERIFICATION_AND_D1_REVALIDATION.md).
- **EX-BE-02-LIVE D2 hardening checkpoint (2026-08-23):** dark Edge startup no
  longer performs initial or periodic source probes; Source Proxy has seven
  exact 503 guards and no Trading System read credential before D4. D2 now owns
  a private pinned PostgreSQL 16 boundary with TLS/SCRAM, separate non-superuser
  migration/runtime roles and a one-shot Rust migrator. Local integration
  proves bootstrap, migration, runtime check, no-DDL/no-plaintext and Edge
  readiness without a source. Status remains `D2_HARDENED /
  LIVE_DEPLOYMENT_BLOCKED` pending operator-role isolation, signed images,
  workload identities, pressure admission and a new window. Evidence:
  [`EX_BE_02_LIVE_D2_HARDENING_CHECKPOINT.md`](./backend/EX_BE_02_LIVE_D2_HARDENING_CHECKPOINT.md).
  The publication path now has a bounded `execution-d2` dispatch that emits
  digest-bound provenance/SBOM, Trivy evidence and OIDC Cosign sign+verify
  evidence; preparation is not publication, and HIGH findings retain an owner
  disposition gate.
- **EX-BE-02-LIVE D2 shared-host admission (2026-08-23):** a live,
  aggregate-only host gate locks minimum available memory/disk, current
  emergency pressure, NTP, prohibited listeners, Portal-container ownership
  and exact container count. The admitted preflight becomes a baseline; the
  15-minute soak is evaluated against bounded CPU/memory/I/O deltas instead of
  rejecting the existing Trading System workload at an arbitrary absolute I/O
  number. SG verification independently proves zero public rule covering
  5432/8443/8444. Both historical OOMs were non-Portal 256 MiB workers and
  Bobby accepted that attribution. Status is
  `D2_SHARED_HOST_REALIGNMENT_COMPLETE / LIVE_D2_UNAUTHORIZED`; the attached
  D1 role/IMDS, signed-image, identity and live-window gates remain. No Portal
  service has started.
  Evidence:
  [`EX_BE_02_LIVE_D2_ADMISSION_CHECKPOINT.md`](./backend/EX_BE_02_LIVE_D2_ADMISSION_CHECKPOINT.md).
- **EX-BE-02-LIVE D2 authorization contract (2026-08-23):** a versioned
  owner-input schema and fail-closed validator separate readiness from live
  activation. They bind exact commit/evidence digests, image/identity reviews,
  admitted host/OOM/resource state, named operators/owners, the temporary
  profile association, IMDS hardening and a <=2-hour window. Activation also
  requires proof of profile detachment and hop-limit one. Every source,
  ingestion, Query, analytics, SSE, profile, command and Trading System change
  flag remains false. Status is
  `D2_AUTHORIZATION_CONTRACT_PREPARED / LIVE_D2_UNAUTHORIZED`; no runtime state
  changed. Evidence:
  [`EX_BE_02_LIVE_D2_AUTHORIZATION_CONTRACT.md`](./backend/EX_BE_02_LIVE_D2_AUTHORIZATION_CONTRACT.md).
  Requalification at 05:43 UTC confirmed that existing source/stream writes
  establish a material I/O baseline and that two 256 MiB non-Portal candidate
  workers genuinely exited OOM. The old operator role also failed the initial
  IMDS-hardening DryRun; a scoped D2 policy is now a separate predecessor.
- **EX-BE-02-LIVE D2 placement decision (2026-08-23):** Bobby selected the
  existing AWS-HK Trading System host for only the bounded Source Proxy, Rust
  Edge and private dark projection boundary. The full Portal, Control API and
  browser-facing backend remain on SGP. No new EC2/EIP or D1B carrier is part of
  D2. Peak D2 hard ceiling is 5.00 vCPU / 5,632 MiB; long-running hard ceiling
  is 4.00 vCPU / 4,608 MiB. These are not steady-state reservations. Future D4 business projections require encrypted storage
  attached to the same host; they must not silently reuse the root volume.
  Status is `D2_SHARED_HOST_REALIGNMENT_COMPLETE / LIVE_D2_UNAUTHORIZED`.
  Detail:
  [`EX_BE_02_D2_PLACEMENT_DECISION.md`](./backend/EX_BE_02_D2_PLACEMENT_DECISION.md).
- **EX-BE-02-LIVE D2 shared-host requalification (2026-08-23):** the revised
  gate accepted the live AWS-HK host with zero blockers and retained elevated
  existing I/O as a warning/baseline. The ephemeral diagnostic is not valid
  change-window evidence. The IMDS hop-limit-one DryRun still failed because
  the D2 isolation policy is not effective on the actual D1 operator role.
  Status is `HOST_PREFLIGHT_ACCEPTED / IAM_ISOLATION_NOT_AUTHORIZED /
  LIVE_D2_UNAUTHORIZED`; no Portal service started. Evidence:
  [`EX_BE_02_LIVE_D2_SHARED_HOST_REQUALIFICATION.md`](./backend/EX_BE_02_LIVE_D2_SHARED_HOST_REQUALIFICATION.md).
  A tested operator tool now enforces the exact IMDS harden, profile detach and
  credential-absence order. Status is `D2_ISOLATION_EXECUTABLE_PREPARED /
  LIVE_D2_UNAUTHORIZED`; preparation made no EC2 change. A second exact DryRun
  after the owner-reported policy attachment still returned the AWS reason
  that no identity-based policy permits the action. Caller identity and profile
  association are correct, so IAM console attachment/boundary placement remains
  the stop-gate and no detach was attempted.
  Two further exact retries remained unauthorized after the first reported
  attachment. The private policy was revised to exact two actions, exact
  instance and region, without the metadata request-parameter conditions. Bobby
  then made revision 2 the default permissions-policy version on the exact role
  and confirmed there is no permissions boundary. The 2026-08-24 exact verifier
  passed with `D2_ISOLATION_AUTHORITY_VERIFIED`; EC2 returned the required
  `DryRunOperation`. Status is `IAM_EFFECTIVE_ALLOW_VERIFIED /
  LIVE_D2_UNAUTHORIZED`. No EC2 setting/profile association changed, and the
  role is retained until the bounded D2 window rather than detached as a bypass.
  Evidence:
  [`EX_BE_02_D2_IAM_POLICY_REVISION_2.md`](./backend/EX_BE_02_D2_IAM_POLICY_REVISION_2.md).
- **EX-BE-02-LIVE D2 CVE applicability checkpoint (2026-08-24):** immutable-
  image inspection shows the Rust Edge does not link OpenSSL and uses `rustls`.
  The Source Proxy links OpenSSL 3.5.7, but the CVE requires an OpenSSL QUIC
  server listener while the D2 contract has exactly one bridge-only TLS/TCP
  listener. Preflight now rejects QUIC, HTTP/3, Alt-Svc and extra listeners,
  including a negative mutation test. Status is `TRIGGER_NOT_REACHABLE /
  OWNER_DISPOSITION_PENDING / LIVE_D2_UNAUTHORIZED`; only Bobby may accept the
  temporary mitigation or keep D2 closed until a patched base is published.
  Evidence:
  [`EX_BE_02_D2_CVE_2026_14456_APPLICABILITY.md`](./backend/EX_BE_02_D2_CVE_2026_14456_APPLICABILITY.md).
- **EX-BE-02-LIVE D2 release-gate remediation (2026-08-24):** main CI exposed
  floating Python 3.12 patch drift, while the image publisher rejected four
  CRITICAL findings from unused Debian-slim `perl-base`/`zlib` packages and a
  subsequent republish rejected two fixed OpenSSL findings in the old Source
  Proxy base before any signature or deployment. CI/BAR-05/Python images now
  lock 3.12.14, the Rust Edge runtime is pinned shell-less Distroless and Source
  Proxy pins official NGINX 1.31.4 / Alpine 3.24 slim. An exact published D3
  Control API scan also found npm's build-only vulnerable `node-tar`; the final
  image now pins Node 22.23.2 / Alpine 3.24 and removes npm/npx/Yarn/Corepack.
  Full Python regression, D2 database/source-dark integration, zero-CRITICAL
  D2 scans and a zero-HIGH/CRITICAL Control API scan pass.
  Status is `D2_RELEASE_CANDIDATE_REMEDIATED / LIVE_D2_UNAUTHORIZED`; IAM,
  main CI/signing and the live change window remain predecessors. Evidence:
  [`EX_BE_02_D2_RELEASE_GATE_REMEDIATION.md`](./backend/EX_BE_02_D2_RELEASE_GATE_REMEDIATION.md).
- **EX-BE-02-LIVE D3 offline preparation (2026-08-23):** a separate probe-only
  overlay now opens exactly three public contract/health source routes while
  four alpha routes remain 503 and ingestion/query/SSE/analytics/command stay
  false/`fixture`. Preflight distinguishes dark, credential-free
  `contract-probe` and future credentialed `paper-read`; private env files are
  mode 0600. The canonical TypeScript delegation issuer produces a 45-second
  positive RS256 assertion plus a mode-0600 negative corpus, and the redacted
  live harness enforces H2/TLS1.3 mTLS, ten JWT rejection classes, latency and
  fail-closed route/method behavior. D3's Control API publication scope also
  adds provenance/SBOM/Trivy/OIDC-Cosign evidence. Status is
  `D3_OFFLINE_PREPARATION_COMPLETE / LIVE_D3_UNAUTHORIZED`; it unlocks no
  frontend or source profile. Evidence:
  [`EX_BE_02_LIVE_D3_OFFLINE_PREPARATION.md`](./backend/EX_BE_02_LIVE_D3_OFFLINE_PREPARATION.md).
- **EX-BE-02-LIVE D4 offline authorization preparation (2026-08-23):** a
  credential-free owner/evidence contract and tested fail-closed validator now
  bind accepted D2/D3 predecessors, exact commit, dedicated Paper read identity,
  route/cursor/completeness/resync digests and encrypted approved storage. The
  current optional-key alpha reads and incomplete paging/event semantics are
  explicitly incompatible with D4. Qualification is BUILDING-epoch-only and
  keeps registry `fixture`, activation, Query, analytics, SSE, commands and
  Trading System changes false. Status is
  `D4_OFFLINE_AUTHORIZATION_PREPARED / D3_PREDECESSOR_ACCEPTED /
  LIVE_D4_INPUTS_BLOCKED`; no business source
  route, service or network was touched. Evidence:
  [`EX_BE_02_LIVE_D4_OFFLINE_AUTHORIZATION_PREPARATION.md`](./backend/EX_BE_02_LIVE_D4_OFFLINE_AUTHORIZATION_PREPARATION.md).
- **EX-BE-02-LIVE D3 identity-drift rejection (2026-08-24):** the first live
  D3 candidate was rejected before delegated-auth probes because the immutable
  Edge lock named gateway digest `sha256:4f63...`, while the compatible runtime
  gateway is `sha256:8a81...`. Source Proxy mTLS and exact public/business route
  guards passed, all projection counts remained zero, and rollback restored
  accepted D2 without restart/OOM or source traffic. The lock now names the
  observed runtime revision and preflight rejects stale identity before
  Compose mutation, but D3 remains closed until a protected-main
  build/scan/sign/verify cycle publishes a new immutable Edge image. Detail:
  [`EX_BE_02_LIVE_D3_GATEWAY_IDENTITY_REMEDIATION.md`](./backend/EX_BE_02_LIVE_D3_GATEWAY_IDENTITY_REMEDIATION.md).
- **EX-BE-02-LIVE D3 transport acceptance (2026-08-24):** protected-main
  images passed real SGP→AWS-HK HTTP/2, TLS 1.3 mTLS, delegated-JWT positive/
  negative cases, bounded latency and Source Proxy loss/recovery. Safe logs
  contained only the three public source paths, projection business state
  stayed empty and unchanged-D2 rollback passed with zero restart/OOM. Status
  is `D3_TRANSPORT_ACCEPTED / BUSINESS_SOURCE_DARK / D2_RUNTIME_RESTORED`.
  This accepts the transport predecessor only; D4 inputs and all frontend live
  profiles remain closed. Evidence:
  [`EX_BE_02_LIVE_D3_TRANSPORT_ACCEPTANCE.md`](./backend/EX_BE_02_LIVE_D3_TRANSPORT_ACCEPTANCE.md).
- **EX-BE-02-LIVE D4 readiness audit (2026-08-24):** D2/D3 predecessors are
  accepted, but current alpha auth is optional, list paging/event completeness/
  resync are insufficient and the only AWS-HK Portal PostgreSQL volume is on
  the unencrypted D2 root filesystem. No source read occurred. Status is
  `D4_READINESS_AUDITED / LIVE_D4_INPUTS_BLOCKED / NO_SOURCE_READ`. The owner
  request fixes the exact mandatory identity, four GET routes, cursor and
  encrypted-storage inputs required before mapper implementation. Evidence:
  [`EX_BE_02_LIVE_D4_READINESS_AUDIT_AND_OWNER_REQUEST.md`](./backend/EX_BE_02_LIVE_D4_READINESS_AUDIT_AND_OWNER_REQUEST.md).
- **EX-BE-02-LIVE D4 mapper-core hardening (2026-08-24):** Rust now has typed
  exact-decimal normalization for orders/fills/positions/events, mandatory
  alpha-scope reconciliation, cursor-bearing events, bounded partial-page
  semantics and a digest-sealed synthetic corpus. Fresh PostgreSQL evidence
  writes/replays the four resources in a `BUILDING` epoch that is absent from
  ACTIVE realtime watermarks. Edge readiness now separates store health from
  mapper health, so a database ping cannot claim ingestion readiness. Status is
  `D4_MAPPER_CORE_OFFLINE_COMPLETE / RUNTIME_FAIL_CLOSED /
  LIVE_INPUTS_BLOCKED`; live pagination/resync, dedicated identity and
  encrypted storage remain owner-gated. Evidence:
  [`EX_BE_02_LIVE_D4_MAPPER_CORE_HARDENING.md`](./backend/EX_BE_02_LIVE_D4_MAPPER_CORE_HARDENING.md).
- **EX-BE-02-LIVE D4 encrypted-storage boundary (2026-08-24):** the Portal now
  has a credential-free storage decision schema, read-only host preflight and
  a D4-only Compose overlay that can bind PostgreSQL only to a separately
  mounted, encrypted and owner-approved filesystem. It rejects the AWS-HK root
  filesystem, the D2 `v1` volume, missing EBS/KMS evidence, filesystem-UUID
  drift and weak mount ownership/options. No volume was provisioned and no
  source call occurred. Status: `D4_ENCRYPTED_STORAGE_BOUNDARY_PREPARED /
  LIVE_VOLUME_NOT_PROVISIONED / NO_SOURCE_READ`. Evidence:
  [`EX_BE_02_LIVE_D4_ENCRYPTED_STORAGE_BOUNDARY.md`](./backend/EX_BE_02_LIVE_D4_ENCRYPTED_STORAGE_BOUNDARY.md).
- **EX-BE-02-LIVE D4 owner action packet (2026-08-24):** the exact encrypted
  gp3 owner procedure and a bounded Trading System-agent implementation request
  now exist. The packet keeps storage writer authority separate from the
  source API read identity, forbids direct DB/Redis/CLI/broker access and
  returns only digests/metadata. Status: `D4_OWNER_ACTION_PACKET_PREPARED /
  OWNER_ACTIONS_PENDING / NO_SOURCE_READ`. Evidence:
  [`EX_BE_02_LIVE_D4_OWNER_ACTION_PACKET.md`](./backend/EX_BE_02_LIVE_D4_OWNER_ACTION_PACKET.md).
- **EX-BE-02-LIVE D4 source/storage reconciliation (2026-08-24):** the owner-
  published dedicated facade and encrypted gp3 host preparation are now pinned
  as sanitized evidence. Authorization schema v2 replaces the unrelated
  Gateway digest with the exact facade image, binds source implementation and
  runtime-acceptance commits, freezes scope/runtime bounds, requires revoked-
  key and loopback evidence, and makes Source Proxy delivery an explicit
  pre-read stop gate. Artifact import, the production Rust ingestor and live
  BUILDING-epoch qualification remain pending. Status:
  `D4_SOURCE_AND_STORAGE_INPUTS_RECONCILED /
  CONTRACT_ARTIFACT_IMPORT_PENDING / NO_PORTAL_SOURCE_TRAFFIC`. Detail:
  [`EX_BE_02_LIVE_D4_SOURCE_AND_STORAGE_RECONCILIATION.md`](./backend/EX_BE_02_LIVE_D4_SOURCE_AND_STORAGE_RECONCILIATION.md).
- **EX-BE-02-LIVE D4 contract import (2026-08-25):** five non-secret
  Paper-read artifacts are imported as exact bytes and locked to Trading System
  runtime-acceptance commit `99e912f` plus observed HEAD `4ad8f87`. A bounded
  source diff was empty and every acceptance/HEAD/Portal SHA-256 matched. This
  was re-verified read-only against current source HEAD `6049a73`: the same
  five-path diff remains empty and every acceptance/current/Portal SHA-256
  still matches. The dedicated import commit `fdd1f34` remains earlier than
  all Rust adapter/transport/ingestor/writer commits. This is contract metadata
  only: no Source Proxy activation, credential, source call, epoch or registry
  change occurred during import or re-verification. Status:
  `CONTRACT_IMPORT_COMPLETE / ADAPTER_PENDING / NO_SOURCE_CALL`. Detail:
  [`EX_BE_02_LIVE_D4_CONTRACT_IMPORT.md`](./backend/EX_BE_02_LIVE_D4_CONTRACT_IMPORT.md).
- **EX-BE-02-LIVE D4 Rust source-contract adapter (2026-08-25):** a dedicated
  crate now build-locks all five source artifacts and rejects route, method,
  scope, identity, authority or proxy-template widening. Enum-only requests,
  strict unknown-field denial, exact decimals, snapshot echo/completeness,
  bounded opaque tokens and ordered full-record delta/tombstone validation form
  the offline D4 adapter. Evidence is 11/11 tests plus rustfmt and strict
  Clippy. No HTTP transport, credential, Source Proxy change, source call,
  epoch or registry flag exists. Status: `SOURCE_CONTRACT_ADAPTER_COMPLETE /
  TRANSPORT_PENDING / NO_SOURCE_CALL`. Detail:
  [`EX_BE_02_LIVE_D4_SOURCE_CONTRACT_ADAPTER.md`](./backend/EX_BE_02_LIVE_D4_SOURCE_CONTRACT_ADAPTER.md).
- **EX-BE-02-LIVE D4 bounded Source Proxy transport (2026-08-25):** a separate
  Rust client now accepts only enum-derived D4 requests and pins a pathless
  HTTPS origin, TLS 1.3, workload mTLS, HTTP/2, no redirect/system proxy,
  bounded queue/time/concurrency/body and contract-owned response parsing. It
  has no Trading System read-key field and never retries a cursor implicitly.
  Evidence is 5/5 tests plus rustfmt and strict Clippy. No source call, Source
  Proxy/runtime change, writer, epoch or registry flag exists. Status:
  `BOUNDED_TRANSPORT_COMPLETE / INGESTOR_PENDING / NO_SOURCE_CALL`. Detail:
  [`EX_BE_02_LIVE_D4_BOUNDED_SOURCE_TRANSPORT.md`](./backend/EX_BE_02_LIVE_D4_BOUNDED_SOURCE_TRANSPORT.md).
- **EX-BE-02-LIVE D4 BUILDING-only ingestion state machine (2026-08-25):** the
  new Rust coordinator persists the snapshot/watermark lease before paging,
  verifies all three immutable populations, gates baseline/event cursor
  movement behind explicit durable ACKs and makes `410` require a fresh
  BUILDING epoch. Exact-decimal records and typed tombstones map into bounded
  projection writes without reusing Gateway-v1 semantics. Evidence is 8/8
  tests plus rustfmt/strict Clippy. PostgreSQL writer, source call, runtime and
  activation remain absent. Status: `INGESTION_STATE_MACHINE_COMPLETE /
  PG_WRITER_PENDING / NO_SOURCE_CALL`. Detail:
  [`EX_BE_02_LIVE_D4_BUILDING_INGESTION_STATE_MACHINE.md`](./backend/EX_BE_02_LIVE_D4_BUILDING_INGESTION_STATE_MACHINE.md).
- **EX-BE-02-LIVE D4 PostgreSQL BUILDING writer (2026-08-25):** the durable
  writer now locks BUILDING authority and atomically persists snapshot lease,
  exact baseline, complete event page and next cursor. Projection semantics
  distinguish the source's global sequence from per-entity ordering and make
  DELETE journalled/replayable while removing visible state. Opaque tokens are
  redacted, exact retries are idempotent and a proven cross-page gap preserves
  the previous cursor while failing the epoch into `REBUILD_REQUIRED`.
  Fresh-PostgreSQL restart/replay/gap evidence, 131 Rust tests and strict
  Clippy are green; the restore signature now includes D4 checkpoint/failure
  state. No Source Proxy, credential, source call, ACTIVE epoch, Query/SSE or
  registry change occurred. Status: `D4_BUILDING_WRITER_OFFLINE_COMPLETE /
  LIVE_QUALIFICATION_PENDING / NO_SOURCE_CALL`. Detail:
  [`EX_BE_02_LIVE_D4_POSTGRES_BUILDING_WRITER.md`](./backend/EX_BE_02_LIVE_D4_POSTGRES_BUILDING_WRITER.md).
- **EX-BE-02-LIVE D4 qualification runtime entrypoint (2026-08-25):** the
  interrupted store patch was completed as an idempotent explicit-UUID
  BUILDING preparation transaction plus two separate one-shot Edge commands.
  Runtime admission revalidates the <=2-hour owner window, immutable
  deployment/mapper identity, accepted D2/D3, dedicated read/source/storage
  digests and all permanent false authority flags. The profile-gated qualifier
  has no listener, cannot hold the Trading System read key and caps transport,
  request, retry, elapsed and owner-window budgets. Evidence is 142 Rust tests,
  strict Clippy/rustfmt, fresh PostgreSQL replay/restart/gap/load and
  dump/restore plus exact-route Nginx/Compose gates. No live source call or
  projection epoch occurred. Status: `D4_RUNTIME_ENTRYPOINT_OFFLINE_ACCEPTED /
  LIVE_WINDOW_PENDING / NO_SOURCE_CALL`. Detail:
  [`EX_BE_02_LIVE_D4_QUALIFICATION_RUNTIME_ENTRYPOINT.md`](./backend/EX_BE_02_LIVE_D4_QUALIFICATION_RUNTIME_ENTRYPOINT.md).
- **EX-BE-02-LIVE D4 first qualification attempt (2026-08-25):** the accepted
  D3 predecessor admitted a finite mandatory-auth Paper read attempt into a
  separately encrypted PostgreSQL BUILDING epoch. It failed closed first on
  an undersized Nginx pagination burst and then on exact scientific decimal
  strings at the Portal compatibility boundary; neither attempt committed a
  complete baseline or enabled Query/analytics/SSE/commands/activation. The
  proxy now retains the 120/minute sustained bound with a one-minute bounded
  burst, the Rust adapter normalizes exact scientific notation without float
  conversion, and the PostgreSQL bootstrap executable boundary is preflighted.
  Offline gates are green and accepted D2 dark is restored. Status:
  `D4_LIVE_ATTEMPT_FAIL_CLOSED / PORTAL_COMPATIBILITY_REMEDIATED /
  SIGNED_REPUBLISH_REQUIRED / D2_DARK_RESTORED`. D4 closes only after the
  remediated artifacts are signed from protected main and a fresh finite
  BUILDING-only window passes. Detail:
  [`EX_BE_02_LIVE_D4_QUALIFICATION_ATTEMPT_AND_REMEDIATION.md`](./backend/EX_BE_02_LIVE_D4_QUALIFICATION_ATTEMPT_AND_REMEDIATION.md).
- **EX-BE-02-LIVE D4 Paper read-shadow acceptance (2026-08-25):** protected-
  main signed Edge and Source Proxy images completed one fresh finite owner
  window against the dedicated mandatory-auth Paper facade. The exact four GET
  resources reached a separately encrypted BUILDING-only PostgreSQL epoch;
  replay parity, freshness, source-loss/recovery, PostgreSQL restart,
  idempotency, bounded load and encrypted dump/restore passed. The accepted D2
  dark runtime was restored with zero OOM/restarts, while the D4 volume, backup
  and BUILDING evidence were retained. Registry remains `fixture`; Query,
  analytics, SSE, commands, activation and Trading System changes remain
  disabled. Status: `D4_PAPER_READ_SHADOW_ACCEPTED / BUILDING_ONLY /
  D2_DARK_RESTORED / BUSINESS_READER_STILL_DARK`. Detail:
  [`EX_BE_02_LIVE_D4_PAPER_READ_SHADOW_ACCEPTANCE.md`](./backend/EX_BE_02_LIVE_D4_PAPER_READ_SHADOW_ACCEPTANCE.md).
- **EX-BE-02-LIVE D4 source-facade runtime audit (2026-08-25):** the finite
  acceptance above remains valid, but it does not qualify the Trading
  System-owned compatibility facade for continuous operation. Read-only
  inspection found a 500 ms unconditional full-scope capture and approximately
  2.4–3.3 MiB/s idle database traffic with no Portal consumer. The facade is
  therefore `QUALIFICATION_BRIDGE_ONLY / STEADY_STATE_NOT_ACCEPTED /
  OWNER_WINDOW_REQUIRED`; it must be dormant outside approved windows and
  requires a published incremental cursor, consumer lease, bounded retention,
  backpressure and 24-hour soak before read-profile promotion. No Trading
  System edit or runtime change is authorized by this finding. Detail:
  [`EX_BE_02_D4_SOURCE_FACADE_RUNTIME_OPTIMIZATION.md`](./backend/EX_BE_02_D4_SOURCE_FACADE_RUNTIME_OPTIMIZATION.md).
- **EX-BE-02 / N01 D4 dormant closeout (2026-08-25):** offline lifecycle
  implementation is accepted. A host-side exact-label guard enforces the
  finite owner window, closes on qualifier completion/missed start/revocation/
  expiry, stops only the dedicated D4 path and restores the accepted D2 dark
  Source Proxy without pulling an image. Production acceptance still requires
  one future owner-window drill and sanitized proof of zero source sessions,
  SELECT delta and byte delta. Registry remains `fixture`; all reader,
  analytics, SSE, command and activation authority stays dark. Detail:
  [`EX_BE_02_D4_DORMANT_CLOSEOUT_DISCIPLINE.md`](./backend/EX_BE_02_D4_DORMANT_CLOSEOUT_DISCIPLINE.md).
- **EX-BE-02 / N02 incremental source contract (2026-08-25):** Portal's
  request-only v2 schema, exact owner publication envelope and fail-closed
  verifier are complete with 15 synthetic semantic/security cases. Read-only
  discovery found no Trading-System-owned v2 publication, so runtime remains
  locked to `d4.paper-read.v1`, Lane B remains dark and the external owner gate
  is still pending. Detail:
  [`EX_BE_02_N02_INCREMENTAL_SOURCE_CONTRACT_REVISION.md`](./backend/EX_BE_02_N02_INCREMENTAL_SOURCE_CONTRACT_REVISION.md).
- **EX-BE-02 / N03 owner incremental implementation gate (2026-08-25):**
  Portal's acceptance boundary now chains an immutable Trading-System-owned
  commit/image and five sanitized evidence files to accepted N02 bytes. Fifteen
  verifier tests lock zero idle source activity, no delta full scan, fixed
  scope/read identity, query/resource bounds and recovery. The owner has not
  published N02/N03, so runtime stays v1/dormant and N04 remains blocked. Detail:
  [`EX_BE_02_N03_TRADING_SYSTEM_INCREMENTAL_SOURCE_IMPLEMENTATION.md`](./backend/EX_BE_02_N03_TRADING_SYSTEM_INCREMENTAL_SOURCE_IMPLEMENTATION.md).
- **EX-BE-03 / N04–N07 plus EX-BE-06 / N08 Portal continuation
  (2026-08-26):** the lease-fenced shared consumer, retention/recovery policy,
  real-source evidence authority and first deployment-scoped Paper Workbench
  APIs are complete on the Portal side. N06 now distinguishes a full-safety
  30-minute Paper-fast profile from separate extended 24-hour confidence.
  Bobby approved the Paper-fast, N07 shadow and N08 SSE promotions; those owner
  decisions must not be requested again. N08 adds an exact accepted manifest
  bound to N06, the still-active N07 epoch/manifest, immutable images/contracts
  and nine evidence hashes; it exposes an exact snapshot-before-stream path
  through the reusable mTLS/H2/JWT BFF and closes EventSource on terminal or
  generic errors. Status is `PORTAL_IMPLEMENTATION_COMPLETE /
  OWNER_PROMOTION_APPROVED / RUNTIME_FAIL_CLOSED /
  REAL_SOURCE_EVIDENCE_PENDING`: source-owner `d4.paper-read.v2` bytes remain
  the one external dependency, all runtime/registry flags stay false and no
  Trading System state was changed. Detail:
  [`N06`](./backend/EX_BE_03_N06_REAL_SOURCE_QUALIFICATION_AND_SOAK.md),
  [`N07`](./backend/EX_BE_03_N07_PROJECTION_QUERY_ANALYTICS_SHADOW.md),
  [`N08`](./backend/EX_BE_06_N08_SSE_REAL_SOURCE_ACTIVATION.md).
- **EX-BE-02 Manager-v2 Paper read handoff (2026-08-28, complete / private
  Paper route qualified / no product consumer):** the Portal worktree imports
  the owner pack at
  `services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1/` and
  hash-locks every byte. A distinct `manager-paper-read` Source Proxy mode
  renders only its separate six-location include: one internal mTLS token
  issuer plus five exact Manager GET routes, TLS 1.3 on both hops and no
  V1/API-key fallback. The static gate rejects hash/secret/route drift and
  confirms the 24 N11-v1 entries remain unavailable; offline and image-backed
  isolated gates passed. In the approved private window, exactly the two new
  loopback Manager containers were started and only Source Proxy was recreated.
  Real mTLS route, method/unknown/no-client denial, issuer/facade
  loss/recovery and exact D2-dark rollback/reapply proof passed. Execution
  Edge, projection PostgreSQL, D4/V1 config and all ingestion/query/SSE/
  command flags remain unchanged/false. This is neither public, D4 activation,
  HA, Sandbox, Canary, Live nor production-authoritative evidence; it also
  did not add a Rust Manager client, projection or UI feature at the time of
  route handoff. Detail:
  [`EX_BE_02_MANAGER_V2_PAPER_READ_HANDOFF.md`](./backend/EX_BE_02_MANAGER_V2_PAPER_READ_HANDOFF.md).
- **EX-BE-02 Manager-v2 backend consumer (2026-08-28, complete / backend only
  / no runtime activation):** the additive sealed Rust contract/client pair is
  now independent of V1 `ts-transport`, imports/hash-pins the owner DTO/runtime
  overlay and can issue only the five qualified private Paper GET requests
  through Source Proxy using workload mTLS. It enforces the runtime contract
  header/revision, catalogue-bound relation/cursor/key handling, exact decimal
  values, a 200-row/1-MiB envelope and typed unavailability. Isolated 11-test,
  rustfmt, strict Clippy and offline D2 gates passed. It does not add an Edge service route,
  browser/UI, cache/projection, PostgreSQL change, poller, Source Proxy/D4/V1
  modification, command/Event/SSE/replay or runtime activation. Detail:
  [`EX_BE_02_MANAGER_V2_BACKEND_CONSUMER.md`](./backend/EX_BE_02_MANAGER_V2_BACKEND_CONSUMER.md).
- **EX-BE-02A Manager-v2 Edge read-through API (2026-08-28, backend complete /
  Paper runtime activation prepared):** the existing private Rust Edge now
  exposes four authenticated internal Paper catalogue/capability/projection/
  relation-page reads through the sealed Manager-v2 client. They are protected
  by private-server mTLS plus the exact delegated
  `execution:manager-v2:read` resource and a default-off gate; no V1
  admission/API key is passed to the Manager client. Responses preserve the
  owner snapshot authority/as-of/freshness/trace with bounded pagination and
  do not invent a global sequence. There is no browser/UI, cache/projection,
  direct Trading DB, V1/D4/Source Proxy change, command/Event/SSE/replay or
  runtime deployment. Rust 18+6+6 tests, rustfmt, strict Clippy and D2-dark
  gates passed. The owner has now approved a separate narrow release and the
  exact Control API resource/Compose overlay/local candidate are validated.
  The owner installed the approved SGP operator identity; strict SSH verifies
  the private host pin, and the existing D3 signer modulus/mTLS client match
  the active Edge JWKS/CA. Both long-running SGP Control APIs stayed
  feature-dark; a network-disabled one-shot candidate signer qualified four
  Manager routes plus no-JWT/wrong-resource denials over HTTP/2, then was
  removed. Exactly one AWS Edge was recreated for private Paper read-through;
  Source Proxy, Manager, Trading System, V1/D4, projection, events, SSE and
  commands remain unchanged/dark. Detail:
  [`EX_BE_02A_MANAGER_V2_EDGE_READTHROUGH_API.md`](./backend/EX_BE_02A_MANAGER_V2_EDGE_READTHROUGH_API.md).
- **EX-BE-02B Manager-v2 multi-profile read readiness (2026-08-28, implemented
  / private read-ready / no Live trading traffic):** the historical Paper
  Manager-v2 route remains compatible and active, while the same bounded
  read-only surface is now exact-bound for
  `PAPER_BINANCE_USDM`, `SANDBOX_BINANCE_USDM` and `LIVE_BINANCE_USDM`.
  Trading System policy, certificate-bound issuer JWT, facade predicate,
  response/cursor and Portal Rust decoder all require the same deployed
  profile; the Control API assertion carries it only for the exact
  `execution:manager-v2:read` resource. A new `manager-profile-read` Source
  Proxy mode derives its six-location configuration from the byte-locked
  Paper template and can change only the dedicated facade/issuer loopback
  ports. It retains TLS 1.3 mTLS, the five GET routes, 200-row/1-MiB bounds,
  catalogue validation and safe-field redaction; no direct DB/SQL, V1/D4,
  command, broker, Redis, Event/replay, cache/projection or browser/UI route
  was added. Private Sandbox and Live projects use isolated ports
  `8123/8124` and `8223/8224`; their Compose inputs/rendering, profile
  mismatch denials and isolated Nginx/Edge/PostgreSQL test path passed. A
  read-only actual source check observed Sandbox data and zero canonical Live
  rows, so Live is ready but truthfully empty until data exists. No active
  service was restarted or automatically deployed. Detail:
  [`EX_BE_02B_MANAGER_V2_MULTI_PROFILE_READ.md`](./backend/EX_BE_02B_MANAGER_V2_MULTI_PROFILE_READ.md).
- **Execution backend hardening H1–H3 (2026-08-22):** SSE ownership now follows
  the downstream response and session lease; the Rust poller retries startup,
  fails readiness closed and keeps one cursor per ACTIVE epoch so BUILDING
  history cannot be skipped or emitted as live traffic. Epoch activation emits
  the existing typed cutover recovery, and realtime freshness is evaluated
  server-side with an explicit policy version and venue state. Evidence is
  Delegated assertions now preserve the immutable Portal-session `auth_time`;
  Capital Preview is ADMIN-only and bound by an append-only composite-FK R2
  workspace/portfolio/currency scope. H3 additionally verifies ordered
  analytics fact digests, full-fact venue-aware quality and bounded source
  payloads; the TypeScript analytics transport now has an independent timeout,
  FIFO concurrency/queue bulkhead and fail-closed HTTP/2 response lifecycle.
  Evidence is 75/75 Rust/PostgreSQL tests plus strict Clippy/rustfmt and a
  fresh-PG Control API build with 111/111 tests. The hardening stop-gate is
  closed; all runtime flags and registry profiles remain off/`fixture`. Detail:
  [`EX_BE_HARDENING_CHECKPOINT.md`](./backend/EX_BE_HARDENING_CHECKPOINT.md).
- **Execution frontend contract reconciliation (2026-08-22):** the same-origin
  SSE proxy now treats a newer `Last-Event-ID` as authoritative over the stale
  URL cursor that native EventSource retains. `auth.expiring` publishes the
  verified short delegated-assertion expiry (not a Portal session expiry), and
  gap fields remain nullable unless their reason supplies the fact. The Rust
  page contract aligns to the published keyset field names and carries exact
  currency aggregates plus `UNKNOWN` retention when no source policy/time range
  can classify a page. A read-only, workspace-bound R2 review route supplies
  immutable `portfolio_id` and `currency`. No generic order evaluator, browser
  aggregate substitute, source capability, activation, or Trading System access
  was added; BR-EX-24/26/27 therefore remain owner decisions. In the same audit
  pass `DecimalString` switched to exact parsing so over-precision fails rather
  than rounds, and the canonical Inbox chip selector is explicitly `view`
  (`filter` returns a fail-closed query error).
- **EX-BE-08a offline source qualification (2026-08-22):** a pure Rust gate now
  seals captured observations to corpus schema, source gateway, contract,
  adapter and capability identity; enforces count/byte/identifier/time bounds;
  compares live-order reduction with immutable-journal replay and a frozen
  semantic digest; and emits only a bounded redacted report. Gaps remain
  blockers and even a passing report carries `activation_authorized=false`.
  The full locked Rust/PostgreSQL gate passes 81 tests plus strict Clippy and
  rustfmt. Status is `OFFLINE_FOUNDATION_COMPLETE /
  LIVE_SOURCE_AND_CROSS_CELL_EVIDENCE_PENDING`: no AWS endpoint, credential,
  production mapper, runtime flag or registry profile changed. Detail:
  [`EX_BE_08A_OFFLINE_SOURCE_QUALIFICATION.md`](./backend/EX_BE_08A_OFFLINE_SOURCE_QUALIFICATION.md).
- **PRE-IAM-03 / PRE-IAM-04 / PRE-IAM-05 / PRE-IAM-06 closeout
  (2026-08-22):** the dark Command Center
  snapshot, offline contract/load/replay/restore hardening, D2 dark image/config/
  preflight/rollback preparation and cross-team tracking reconciliation are
  `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`. The D2 renderer now assigns the
  configured runtime group before atomic publication; the target order is
  render → `root:<portal-runtime-gid>` ownership → readiness preflight. No
  network, source, runtime or Trading System authority is implied.
- **EX-BE-05b/F0 catalogue revision 2 hardening (2026-08-23):** the 64-entry
  catalogue is ADMIN-only and scoped by workspace, actor, environment, entity,
  requested risk, capability and freshness. Observed non-GET routes can never
  remain R0, require owner review, and every R1–R4 command requires plan plus
  apply. Command payloads are bounded and sensitive-key rejected before a
  digest is computed; durable plans declare `HASH_ONLY_NO_RAW` and store no raw
  payload. PostgreSQL retries only `40001`/`40P01`, at most three fresh
  serializable attempts; real concurrent duplicate and drift API tests prove
  one immutable replay versus typed conflict. JSON Schema/OpenAPI/Zod and
  generated declarations carry the same scope, counts, condition semantics and
  payload policy. Evidence: contracts 39/39 and fresh-PG Control API 149/149;
  the complete Rust and D2 gates are recorded by the final audit closeout.
- **EX-BE-05b/F1a Operations Queue (2026-08-23):** the SGP TypeScript Control
  API now owns an ADMIN/workspace-bound, exact-count operations queue over
  Portal-created F0 records. Signed/expiring bidirectional keysets qualify at
  182,000 rows. Acknowledge and resolve are ordered, optimistic, idempotent and
  audited in PostgreSQL; source identity/status/verification are immutable and
  no outbox/source request is produced. Evidence: contracts 41/41 and fresh-PG
  Control API 155/155 plus dump/restore. Status is
  `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`; profile remains `fixture`,
  source integration remains `UNAVAILABLE`. F1b Incident Detail is closed in
  the next checkpoint.
- **EX-BE-05b/F1b Incident Detail (2026-08-23):** the SGP TypeScript Control
  API now owns forward-only OPEN→MITIGATED→RESOLVED incidents,
  acknowledgement, workspace-member assignment, append-only redacted operator
  notes, hash-only evidence references, same-workspace operation correlation
  and bounded exact-count collections. Mitigate requires acknowledgement,
  assignment and stored mitigation evidence; resolve requires MITIGATED, stored
  clean-dry-run evidence and reason, and can never resume a deployment.
  Idempotency, optimistic versions, source-field immutability and audit/event
  atomicity are PostgreSQL-enforced; no outbox exists. Four source panels remain
  typed unavailable. Evidence: contracts 44/44, fresh-PG Control API 159/159
  and dump/restore. Status is `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`.
- **EX-BE-05b/F2 Sandbox Certification (2026-08-23):** the SGP TypeScript
  Control API now owns DRAFT→IN_REVIEW→APPROVED|DENIED certification state,
  exactly seven ordered authority-labelled steps, append-only evidence and
  findings, deterministic evidence-set hashes, optimistic/idempotent writes
  and submitter/approver separation of duties. Submit and approval require 7/7
  verified, unexpired PASS evidence and no blocking finding. CANARY promotion
  plans remain durably `BLOCKED`; no public source-evidence route, outbox,
  AWS-HK/source request, runtime activation or promotion execution exists.
  Evidence: contracts 45/45, fresh-PG Control API 163/163, eleven migrations
  and dump/restore. Status is `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`;
  profile remains `fixture/UNAVAILABLE`.
- **EX-BE-05b/F3 Canary Control Room (2026-08-23):** the SGP TypeScript
  Control API now owns append-only, exact-decimal DRAFT capital-envelope
  revisions bound to an approved/current F2 evidence set and its exact blocked
  CANARY promotion plan. Database and serializable application gates enforce
  monotonic revision, exact predecessor, idempotent replay, payload-drift
  refusal and atomic audit. The read model retains five KPI and all source
  panels as `fixture/UNAVAILABLE`, runtime state null and exact counts unknown.
  `BROKER_STALE_BLOCKS_SCALE_ONLY` preserves the future protective/scale
  asymmetry, while both action groups remain invisible/disabled. No source
  ingestion, outbox, activation or command endpoint exists. Status is
  `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`. Evidence is contracts 47/47,
  fresh-PG Control API 167/167 and twelve-migration dump/restore.
- **EX-BE-05b/F4 Live Full Operations (2026-08-23):** the SGP TypeScript
  Control API composes the latest immutable Canary predecessor into a read-only
  Phase 12 source-dark response. The predecessor is not active Live authority;
  runtime, five KPIs, source panels, positions/orders/incidents, exact open-
  order footer, series, continuity, rollback and realtime are unavailable.
  Broker data is schema-suppressed and source gaps are typed R4 blockers while
  `BROKER_MISMATCH_SUPPRESSES_VALUES_AND_SOURCE_GAP_BLOCKS_R4` remains the
  canonical future guard and
  both R3/R4 actions remain invisible/disabled. No source, outbox, activation,
  SSE or command route exists. Status is
  `INTEGRATION_COMPLETE / PRODUCTION_INACTIVE`; contracts 49/49 and Control API
  169/169 plus restore are green.

**Remaining backend work — phase-scoped (NOT open requests; wait for owner
activation or the phase):**

- **N11 external read boundary (2026-08-26):** Portal's consolidated
  24-capability request, byte-bound owner verifier and source-dark Rust
  compatibility gate are complete. Source adapters remain production-inactive
  until an accepted Trading System owner pack supplies exact schemas, fixtures,
  semantic rulings and evidence. No direct DB/Redis/CLI/broker substitute is
  allowed. See
  [`EX_BE_01_N11_EXTERNAL_READ_CAPABILITIES_AND_ADAPTERS.md`](./backend/EX_BE_01_N11_EXTERNAL_READ_CAPABILITIES_AND_ADAPTERS.md).

- **N12 command boundary (2026-08-26):** Portal's consolidated nine-capability
  owner request, byte-bound publication verifier and Rust pre-dispatch/journal
  gate are complete. Command identity is distinct from read identity; Paper,
  Sandbox, R3, R4 and the command kill switch remain independent. HTTP 202 is
  non-terminal and `UNCERTAIN` survives restart, blocks same-target R4 and
  permits only owner-proven monotonic/idempotent protection. Owner publication
  and every runtime command flag remain pending/false. See
  [`EX_BE_05B_N12_LIVE_COMMAND_RELAY.md`](./backend/EX_BE_05B_N12_LIVE_COMMAND_RELAY.md).

- **N13A staged activation foundation (2026-08-26):** TypeScript and isolated
  Portal PostgreSQL now implement seven independent source-dark capabilities,
  the legal delivery-profile graph and authenticated plan/apply/verify with
  RBAC, CSRF, idempotency, optimistic versions, atomic audit/outbox and bounded
  per-capability rollback. Immutable owner references remain structurally valid
  but unaccepted/untrusted. Database constraints keep effective profile
  `fixture`, source/runtime false and kill switches engaged; N13A can apply only
  a rollback to fixture. Current-source mapping and real promotion remain N13B. See
  [`EX_BE_08_N13A_SOURCE_DARK_STAGED_ACTIVATION.md`](./backend/EX_BE_08_N13A_SOURCE_DARK_STAGED_ACTIVATION.md).

- **N14A Portal release authority (2026-08-26):** an exact six-service
  `image@sha256` manifest now binds the protected-main Portal commit,
  source-dark compatibility/profile matrix, migration chain, candidate
  evidence and rollback runbook. BuildKit SBOM/SLSA, Trivy and keyless Cosign
  evidence cover all six images; production requires the exact candidate run,
  reviewed manifest digest, vulnerability acceptance and a separately signed
  `ACCEPT_SOURCE_DARK` decision. Stable SGP uses project `portal-stable`, port
  18081, distinct volumes and digest-only service images; dev remains project
  `portal`, port 8080 and isolated state. Seventeen security/release tests,
  actionlint and a real three-volume PostgreSQL backup/restore/forward-fix
  rehearsal pass. N14A status is `N14A_COMPLETE_SOURCE_DARK`; no source/Query/SSE/command flag,
  AWS-HK or Trading System route changed. See
  [`EX_BE_17_N14A_PORTAL_RELEASE_AUTHORITY_SOURCE_DARK.md`](./backend/EX_BE_17_N14A_PORTAL_RELEASE_AUTHORITY_SOURCE_DARK.md).

- **N15A source-dark four-interface gateway (2026-08-26):** Query, Command,
  Event and Artifact now have independent semantic version/rollback authority,
  distinct read/command workload identities, exact-resource delegated
  assertions and bounded TLS1.3/HTTP2 transport blueprints. Rust owns Event
  replay/gap/epoch rules, Artifact metadata/reference validation and local
  partition/replay/expiry/schema/source-loss doubles. Component OpenAPI has no
  paths/servers and tests prove `network_attempts=0`. Status is
  `N15A_COMPLETE_SOURCE_DARK / SUPERSEDED_BY_N15B_CURRENT_ACCEPTANCE /
  PRODUCTION_INACTIVE`; no origin, credential, source or runtime changed. See
  [`EX_BE_18_N15A_SOURCE_DARK_FOUR_INTERFACE_GATEWAY.md`](./backend/EX_BE_18_N15A_SOURCE_DARK_FOUR_INTERFACE_GATEWAY.md).

- **N16A source-dark same-domain emergency routing (2026-08-27):** the exact
  Portal origin and `/ops/emergency/*` prefix, server-side-only origin
  isolation, five-minute session, phishing-resistant step-up, break-glass
  ceremony, command-independent health, typed dependency/failover states and
  immutable SHA-256 audit chain are now pure Rust/contracts/templates tested
  against local doubles. The component OpenAPI has no paths/servers and the
  unmounted Nginx template has no forwarding directive. N12 R3 publication,
  dedicated command identity and every PLAN/APPLY/VERIFY flag remain false;
  R4 resume/scale is structurally forbidden and `network_attempts=0`. Status is
  `N16A_COMPLETE_SOURCE_DARK /
  SUPERSEDED_BY_N16B_CURRENT_PRIMITIVE_ACCEPTANCE /
  PRODUCTION_INACTIVE`. See
  [`EX_BE_19_N16A_SOURCE_DARK_ROUTING_AND_EMERGENCY_POLICY.md`](./backend/EX_BE_19_N16A_SOURCE_DARK_ROUTING_AND_EMERGENCY_POLICY.md).

- **N17A source-dark production/DR preparation (2026-08-27):** canonical
  contracts and pure Rust now own provisional SLO/error-budget semantics,
  control/projection/object recovery, five distinct identity rotation families,
  capacity/retention/cost gates and digest-sealed isolated game-day evidence.
  Prometheus/Grafana and operations files are unmounted and have no datasource,
  origin or secret. The operational harness passed actual internal-only WAL
  PITR to a selected LSN, ephemeral encrypted logical backup restore,
  deterministic projection rebuild, rotation/compromise, rollback and eight
  complete fault scenarios with external `network_attempts=0`. Production SLO,
  error budget, RPO/RTO and cost remain unclaimed. Status is
  `N17A_COMPLETE_SOURCE_DARK / N17B_READY_FOR_EXACT_SET_ACCEPTANCE /
  LIVE_MUTATION_WAITING_EXACT_OWNER_WINDOW`. See
  [`EX_BE_20_N17A_SOURCE_DARK_PRODUCTION_DR_PREPARATION.md`](./backend/EX_BE_20_N17A_SOURCE_DARK_PRODUCTION_DR_PREPARATION.md).

- **N13B–N17B source-as-is rebaseline (2026-08-29):** the master owner return
  is now a preferred capability/evidence catalogue rather than a global Portal
  blocker. B phases adapt bounded Manager-v2 relations/projections, current
  Gateway read/command primitives, current market/data services and
  Portal-owned control/derivation sources into stable N11/N12/BR screen
  contracts. Capabilities qualify independently; missing Event/Artifact or
  ideal one-for-one endpoints cannot block unrelated Query screens. Read and
  command identities, mutation approval, stable release and Live risk gates
  remain independent and fail closed. This is a documentation/status decision;
  no runtime/source/profile/route/credential/command changed. The operative
  phase detail is §3.5 and N13B–N17B of
  [`EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`](./EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md).
- **N13B current-source implementation accepted (2026-08-29):** a
  machine-readable Rust compatibility map now binds 20 Execution screens to
  exact current Manager-v2/Gateway/market/Portal sources and one of four honest
  delivery classifications. Rust Edge reads are exact screen/source/relation,
  profile/cursor bound and GET-only. TypeScript exposes a same-origin BFF with
  independent Paper/Sandbox/Live mTLS/JWT identities; Canary joins Portal
  governance to Live facts. Owner publication and real Paper runtime
  qualification manifests are digest-pinned. No profile runtime, command or
  registry data mode is active; N14B owns the immutable profile candidate and
  first screen promotion. See
  [`EX_BE_08_N13B_CURRENT_SOURCE_STAGED_ACTIVATION.md`](./backend/EX_BE_08_N13B_CURRENT_SOURCE_STAGED_ACTIVATION.md).
- **N14B immutable current-source compatibility accepted (2026-08-29):** a
  separate adjunct re-verifies the complete signed N14A candidate and binds
  the first Paper target to the N13B source map, qualification pins, exact
  profile, thirteen adapter/config digests, three immutable service-image
  digests and rollback/previous-adjunct chain. Candidate and rollback Compose
  renders, negative tests, publication gates and the full Portal gate pass.
  The compatibility decision is not a deployment or activation decision:
  runtime, registry, source, Query, SSE, command and Trading System release
  authority remain false. Status is `N14B_PORTAL_COMPATIBILITY_ACCEPTED /
  PROFILE_RUNTIME_NOT_ACTIVATED`; its bounded candidate is consumed by N15B. See
  [`EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md`](./backend/EX_BE_17_N14B_IMMUTABLE_CURRENT_SOURCE_RELEASE_COMPATIBILITY.md).
- **N15B current-capability inter-cell gateway accepted (2026-08-29):** the
  exact Paper Query slice is now a strict digest-bound contract enforced in
  both Rust Edge and TypeScript BFF before transport. Only
  `PAPER_TRADING_SCREEN` and its positions/execution-quality/sessions reads are
  accepted. Command is separately deferred to N16B; Event and Artifact are
  typed absent and cannot be inferred from Query health. Existing immutable D3
  and Manager runtime evidence is revalidated, while candidate deployment,
  product BFF, registry, SSE, command and Trading System change remain false.
  Status is `N15B_CURRENT_QUERY_ACCEPTED / PRODUCT_RUNTIME_DARK`; see
  [`EX_BE_18_N15B_CURRENT_CAPABILITY_INTERCELL_GATEWAY_ACCEPTANCE.md`](./backend/EX_BE_18_N15B_CURRENT_CAPABILITY_INTERCELL_GATEWAY_ACCEPTANCE.md).
- **N16B current-primitive protective-path compatibility accepted
  (2026-08-29):** source-as-is inspection proves one complete current command
  lifecycle, `live.emergency-close`, and accepts it only for
  `LIVE_FULL / ACCOUNT / BINANCE / USD_M`. A strict digest-bound contract,
  Rust command authority and TypeScript BFF reject read identities, widened
  targets, malformed intents, R4 inheritance and premature runtime activation.
  Five other commands are supported-but-inactive and three are source-absent.
  The public route, command transport, source call and Live mutation remain
  false; real acknowledgement/verification requires the exact N17B Account and
  owner window. Status is
  `N16B_CURRENT_PRIMITIVE_COMPATIBILITY_ACCEPTED / PRODUCT_RUNTIME_DARK`; see
  [`EX_BE_19_N16B_CURRENT_PRIMITIVE_PROTECTIVE_PATH_ACCEPTANCE.md`](./backend/EX_BE_19_N16B_CURRENT_PRIMITIVE_PROTECTIVE_PATH_ACCEPTANCE.md).

- **N17B exact current-set production acceptance (2026-08-29):** the Portal
  Control API now adapts the exact Paper screen contract to the current
  Manager-v2 capabilities/relation routes instead of requiring unpublished
  screen-native Edge routes. The server-only adapter enforces four source
  aliases/seven relations, the exact Manager read resource and a burst-free
  15 r/s ceiling below the observed Source Proxy 20 r/s boundary. The real
  private route passed 25/25 paced reads with HTTP/2, TLS 1.3 mTLS and delegated
  JWT plus 401/403/405 negative checks. A strict JSON/Rust/CI record binds all
  N13B–N17A evidence and rollback. Status is
  `N17B_EXACT_CURRENT_SET_ACCEPTED / PAPER_PRIVATE_QUERY_QUALIFIED /
  SIGNED_PRODUCT_IMAGE_NOT_PUBLISHED / LIVE_MUTATION_INACTIVE`; no public
  runtime, Sandbox/Live read, command transport or Trading System change was
  made. See
  [`EX_BE_20_N17B_EXACT_SET_PRODUCTION_ACCEPTANCE.md`](./backend/EX_BE_20_N17B_EXACT_SET_PRODUCTION_ACCEPTANCE.md).

- **N13B–N17B debt closeout (2026-08-30):** the accepted private Paper
  compatibility path has no open merge blocker, but product runtime remains
  inactive. The canonical debt register separates resource/workspace-scoped
  screen payloads, multi-replica admission, canonical Rust compatibility
  ownership, signed dev publication and post-deploy soak as activation gates;
  missing Event/Artifact, market/calendar and wider command capabilities are
  future-contract limitations. BR-EX-41…67 remains the next delivery backlog,
  not hidden N17B work. See
  [`EX_BE_N13_N17_DEBT_CLOSEOUT.md`](./backend/EX_BE_N13_N17_DEBT_CLOSEOUT.md).

- **Manager Surface Expansion campaign planned (2026-08-30):** N18–N29 is the
  finite follow-on campaign for maximum semantically valid current Trading
  System coverage across Paper, Sandbox and Live. N18 freezes all 96 Manager
  relations, published reads/commands and Claude BR-EX-41–71 before code;
  N19–N27 deliver the versioned Rust compatibility plane, TypeScript screen
  BFF, shared scale controls, full profile reads, durable projection,
  analytics/SSE and typed Admin Action Drawer. N28 alone consolidates genuinely
  absent owner semantics; N29 closes product/release evidence without unnamed
  debt. The direction is approved, but each phase begins only when Bobby names
  it. This tracking update changes no runtime, source, profile, route,
  credential, command or stable deployment.

- **N18 Manager relation/capability census complete (2026-08-30):** the
  source-dark, SHA-256-bound census freezes all 96 Manager relations, five
  Manager primitives, 104 Gateway operations, 64 CLI actions, 27 Portal read
  capabilities, nine requested commands and BR-EX-41–71. Every item has one
  source/profile state/owner/consumer/delivery phase; all 96 relations are
  classified and no business rows are retained. Paper/Sandbox/Live adapter
  truth remains explicit and product runtime remains dark. N19 is approved as
  the canonical Rust Manager-v2 compatibility boundary. See
  [`EX_BE_21_N18_MANAGER_RELATION_CAPABILITY_CENSUS.md`](./backend/EX_BE_21_N18_MANAGER_RELATION_CAPABILITY_CENSUS.md).

- **N19 Rust Manager-v2 compatibility authority complete (2026-08-30):** the
  Edge loads a SHA-256-bound N18/N19 authority at startup and accepts exactly
  96 relations, five sealed Manager GET primitives, seven projections and the
  Paper/Sandbox/Live profile/resource bindings. Only Paper is currently
  transport-qualified; Sandbox and Live are recognized but fail closed until
  their independent qualification phases. Complete catalogue and
  capability responses are validated before use; relation/key/cursor and
  projection requests can only be built from the authenticated catalogue.
  Current and simulated-future adapters have explicit qualification/rollback
  semantics, while the simulated adapter cannot bind in production. TLS 1.3
  mTLS, delegated JWT and fixed transport bounds remain in the sealed client.
  No source or product runtime changed; `TD-EX-03` is closed and N20 is ready
  but not started. See
  [`EX_BE_22_N19_RUST_MANAGER_V2_COMPATIBILITY_AUTHORITY.md`](./backend/EX_BE_22_N19_RUST_MANAGER_V2_COMPATIBILITY_AUTHORITY.md).

- **N20–N23 Manager product-read foundation complete (2026-08-30):** N20
  freezes the canonical workspace/resource screen BFF boundary; N21 adds
  PostgreSQL-coordinated profile admission, request coalescing, scoped cache
  and preserved source freshness; N22 activates the complete currently valid
  Paper read set; N23 extends the same authority to independently isolated
  Sandbox and Live profiles. Canary remains Portal governance over Live facts.
  Valid zero-row Live is `empty/COMPLETE`, while source loss remains
  `partial/unavailable`; raw Manager envelopes, arbitrary relations and fake
  rows never cross the browser boundary. Sandbox and Live have separate
  delegated audiences, cache/quota identity and rollback flags. Projection,
  SSE, analytics and command authority remain outside N23. Current status is
  `N23_COMPLETE / SANDBOX_LIVE_READ_RELEASE_QUALIFIED / N24_READY`; contracts
  102/102, focused profile reads 29/29, immutable release 4/4 and the fresh-PG
  Control API 236/236 plus dump/restore and independent Compose rollback pass;
  see
  [`EX_BE_26_N23_SANDBOX_LIVE_READ_PROFILES.md`](./backend/EX_BE_26_N23_SANDBOX_LIVE_READ_PROFILES.md).

- **N24 durable Portal projection runtime v5 qualified (2026-09-01):** a dedicated
  no-port Rust worker consumes only the exact N19 Manager-v2 boundary and
  persists 13 bounded current-state feeds as eight combined snapshots for each isolated
  Paper/Sandbox/Live profile. Truthful empty Live, database-time leases,
  fencing, idempotency, tombstones, immutable cycle evidence, parity-gated
  ACTIVE cutover, operator-gated singleton rebuild, DB-clock retained
  rollback, collection-time memory bounds, bounded cleanup and
  fresh-PostgreSQL restore all pass. Poll changes remain
  `PORTAL_PROJECTION_DELTA`; no source
  event authority is invented. Adapter v5 enforces the owner pagination shape,
  derives durable identities from validated catalogue key columns rather than
  short-lived opaque retrieval cursors, and excludes unbounded oldest-first
  history without an incremental contract. Its per-fact idempotency digest is
  the same semantic fact value, so newer receipt metadata cannot collide with
  an unchanged semantic ingestion ID; freshness remains a bounded heartbeat.
  Per-cycle entity-kind membership references reused semantic snapshots and
  preserves the exact eight-kind seal without duplicate fact writes.
  Query/SSE/analytics/commands and stable runtime
  remain dark. Status: `N24_COMPLETE / TD-EX-05_CLOSED / N25_READY`; see
  [`EX_BE_27_N24_DURABLE_PORTAL_PROJECTION.md`](./backend/EX_BE_27_N24_DURABLE_PORTAL_PROJECTION.md).

- **N25–N29 + BR-EX-72 release candidate complete (2026-08-31):** the
  query/analytics plane, projection-backed SSE, Admin Action Drawer command
  plane, genuine-gap registry and product consumer acceptance are complete.
  BR-EX-72 adds bounded Alpha Fleet and Accounts & Bindings list/detail BFF
  contracts over exact current Manager-v2 Portal projections, one canonical
  Live Review fixture and truthful registry revision 6. Source credentials,
  arbitrary relations and external references remain outside the browser;
  `venue_credentials` is rejected at the source boundary. Status is
  `RELEASE_CANDIDATE_READY_PROTECTED_RELEASE_PENDING / NO_RUNTIME_EFFECT`;
  only `N29-REL-01` remains. See
  [`EX_BE_33_BR_EX_72_MANAGER_LISTS_REGISTRY_CLOSEOUT.md`](./backend/EX_BE_33_BR_EX_72_MANAGER_LISTS_REGISTRY_CLOSEOUT.md).

- **N26 Manager replay selection hardened and dev-accepted (2026-09-01):** the first bounded
  Paper SSE probe proved mTLS/JWT snapshot access but exposed that resume still
  read the legacy journal after Manager authority selection. The product BFF
  flag stayed false, Paper reverted to analytics-only and Sandbox/Live SSE were
  never opened. `RealtimeResumePolicy` now carries the selected authority into
  the repository read; focused/static tests plus full Rust, Clippy,
  fresh-PostgreSQL and restore gates pass. Commit `771715b` / image
  `sha256:47ea4d78099347706710879bf26e46a15cfaf80e4ef7ac22879f0a71f12c3077`
  then passed exact Paper/Sandbox/Live snapshot→resume, no-JWT and
  no-client-certificate probes over the real dual-cell path. Paper same-origin
  BFF stream is active; Sandbox/Live remain separately exact-bound at the Edge.
  `current-source-realtime-up/config` now makes the accepted SGP composition
  reproducible; ordinary `current-source-up` remains its SSE rollback. Command
  relay and Live mutation remain false. See
  [`EX_BE_29_N26_REALTIME_SSE_ACTIVATION.md`](./backend/EX_BE_29_N26_REALTIME_SSE_ACTIVATION.md).

- **Execution Edge release image inputs closed (2026-09-01):** the pinned
  Rust/Distroless release Dockerfile now carries every repository-owned input
  embedded at compile time by the N13B–N29 authorities. The static publication
  gate rejects omission of shared fixtures, release manifests, D3 evidence or
  the Trading System contract pack. These are build-stage inputs only; the
  runtime layer remains the single non-root Edge binary and this change grants
  no source, command or stable-release authority.

- **Paper same-origin operational bridge (2026-09-01):** the mother Portal
  helper owns the exact `compose.execution-current-source.yaml` composition
  through `current-source-up/config`; direct ad-hoc Compose is unnecessary.
  The non-root Control API receives only the numeric `portal-runtime`
  supplementary group required to read SGP mTLS/delegation files. Profile
  flags remain independent and command relay is still forced false.
  Dev runtime qualification passed over the real SGP↔AWS-HK path for Edge
  revision `f014b772c621373e1215163f8053477d86db157d`: HTTP/2 Manager metadata,
  a bounded projection, the exact Paper screen and one bounded relation are
  200; missing JWT, wrong scope and missing client certificate fail closed.
  The projection DB was backed up before migration, and only its dedicated
  migration identity could apply DDL. Sandbox/Live/SSE remain independently
  dark because their distinct private origins/ACTIVE projection evidence do
  not yet pass preflight; commands and stable authority remain false.

- **D2/D3/D4 AWS-HK lane:** only minimal Rust Edge/Source Proxy/projection

- **Alpha Fleet current-source v2 (2026-09-01):** the global fleet entry screen
  now projects the already-published Manager strategy, deployment, account,
  balance, portfolio, allocation, current-position and reconciliation facts
  across Paper/Sandbox/Live. The server owns exact-decimal per-currency
  aggregation, multi-stage membership, health, counts, filters, sort and signed
  keysets; the browser owns presentation only. Historical equity/drawdown is
  typed unavailable because no bounded latest-window source selector exists.
  See [`EX_BE_35_ALPHA_FLEET_CURRENT_SOURCE_V2.md`](./backend/EX_BE_35_ALPHA_FLEET_CURRENT_SOURCE_V2.md).

- **D2/D3/D4 AWS-HK lane:** only minimal Rust Edge/Source Proxy/projection
  PostgreSQL/migrator on the existing host; IAM isolation and signed-image/
  workload-identity/window gates precede D2, then authenticated transport and
  Paper BUILDING-epoch evidence. Full Portal remains on SGP.
- **Execution product lane:** Command Center real-source snapshot/SSE parity,
  Paper/VNM projections, Sandbox real-source adapter/parity, Canary real-source
  parity/activation, Live Full,
  authenticated live relay and cross-cell fault/soak/restore/DR.
- **U14 certification slice** (BAR-21 continuation): quarantine → hermetic
  build → lock/SBOM/secret/license scan → contract/determinism/no-lookahead/
  QuantBT smoke → signed publication; lifecycle/promotion transitions
  versioned + audited. Unblocks Alpha Pool (`ALPHA_POOL` maturity change)
  and runtime execution of imported alphas.
- **Capability expansion of quantbt-engine** (BAR-09/U12): only
  `three_window_decay` + `advanced_walk_forward` are certified today; the
  engine (1.0.8 from PyPI) also ships event-driven, multi-symbol portfolio
  and options engines — expose them through the same manifest → preflight →
  runner → artifact pattern when prioritized.
- **QuantBT run SSE façade cutover** (BAR-07/U10) — delivered 2026-08-24:
  Nginx routes `/api/runs/{run_id}/events` through the session-guarded
  TypeScript façade, which signs the internal principal and pipes the fixed-
  origin Python SSE without buffering. Connect timeout, canonical run-ID path,
  downstream cancellation, non-SSE refusal and the one-line gateway rollback
  are tested. U11 still owns the durable committed event source.
- **Command Center authoritative read model** (U10) — replaces summary
  proxy passthrough; unlocks history/cross-filter.
- **Workspace tenancy real UI** (U10) — `/api/workspaces` exists as a
  convenience path.
- **Maintenance/external-access screen wiring** (U07 production).
- **BAR-17→20** (dual-cell), **U18** Planning/PostgreSQL cutover, **U19**
  DR/game-day — per §14 above; the v0.5 §8.2 audit matrix + §8.3
  discrepancies (compose.production, publish-images, deploy.yml
  environments) are binding review items before BAR-17 starts.
