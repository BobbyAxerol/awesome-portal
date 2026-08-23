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
- **EX-BE-02-LIVE D2 admission checkpoint (2026-08-23):** a new live,
  aggregate-only host gate locks minimum available memory/disk, maximum CPU/
  memory/I/O pressure, NTP, prohibited listeners, Portal-container absence and
  runtime ownership. SG verification independently proves zero rule covering
  5432/8443/8444. Current status is
  `D2_ADMISSION_REJECTED / APPLICATION_DARK`: I/O full-pressure exceeded 5%
  and two historical OOMs await Bobby's explicit disposition; the attached
  D1 role/IMDS and image-publication gates also remain. No service started.
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

**Remaining backend work — phase-scoped (NOT open requests; wait for owner
activation or the phase):**

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
- **SSE migrate through the façade** (BAR-07): nginx still passthroughs
  `/api/runs/*/events`; façade returns `SSE_NOT_MIGRATED` by design.
- **Command Center authoritative read model** (U10) — replaces summary
  proxy passthrough; unlocks history/cross-filter.
- **Workspace tenancy real UI** (U10) — `/api/workspaces` exists as a
  convenience path.
- **Maintenance/external-access screen wiring** (U07 production).
- **BAR-17→20** (dual-cell), **U18** Planning/PostgreSQL cutover, **U19**
  DR/game-day — per §14 above; the v0.5 §8.2 audit matrix + §8.3
  discrepancies (compose.production, publish-images, deploy.yml
  environments) are binding review items before BAR-17 starts.
