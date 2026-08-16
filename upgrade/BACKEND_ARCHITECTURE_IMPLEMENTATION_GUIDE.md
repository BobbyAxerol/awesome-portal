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
2. [Unified Implementation Plan](./UNIFIED_IMPLEMENTATION_PLAN.md), especially
   the active phase and its exit gate.
3. [Architecture and UIUX v0.4](./quantbt_portal_architecture_uiux_final_v0.4_vi.md)
   for target topology, domain lifecycle, API and UX semantics.
4. This guide for backend sequencing and handoff discipline.
5. [Current FastAPI architecture](../apps/portal/backend/ARCHITECTURE.md) for
   implementation facts in the existing service.
6. For Historical Market Data only, the operator contract at
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

BAR-01 (BE1–BE6), BAR-02 (BE1–BE3), BAR-03, BAR-04 and BAR-05 are complete:
registry/summary/links contracts and API, the parity snapshot freeze,
additive artifact provenance, the cross-link sidecar, the operational ingress
boundary, the thin identity BFF with the security matrix, and the M0
reproducibility freeze (digest manifest, credential-free environment report,
Planning export count/hash report, executable golden gate). The BFF still
owns no routing authority; the gateway remains the single public entry until
U10.

Deep dives:

- [`upgrade/backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md`](./backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md)
- [`upgrade/backend/BAR_02_COMPATIBILITY_BOUNDARIES_AND_PARITY_FREEZE.md`](./backend/BAR_02_COMPATIBILITY_BOUNDARIES_AND_PARITY_FREEZE.md)
- [`upgrade/backend/BAR_03_OPERATIONAL_INGRESS_BOUNDARY.md`](./backend/BAR_03_OPERATIONAL_INGRESS_BOUNDARY.md)
- [`upgrade/backend/BAR_04_THIN_IDENTITY_BFF.md`](./backend/BAR_04_THIN_IDENTITY_BFF.md)
- [`upgrade/backend/BAR_05_REPRODUCIBILITY_FREEZE.md`](./backend/BAR_05_REPRODUCIBILITY_FREEZE.md)

The next backend task is BAR-06, the shared contract authority for U09:
canonical schemas for IDs, UTC timestamps, decimal values, RFC 7807 errors,
idempotency, optimistic concurrency and event envelopes; snapshot the FastAPI
compatibility OpenAPI and generate clients/types; add breaking-change CI and
cross-language fixture compilation; and resolve ADR-001 (npm-to-pnpm) and
ADR-002 (opaque ID format) before one JavaScript workspace/lock authority is
chosen.
