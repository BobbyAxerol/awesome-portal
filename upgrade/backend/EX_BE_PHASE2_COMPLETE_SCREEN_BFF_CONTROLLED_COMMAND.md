# Phase 2 — Complete Screen BFF & Controlled Command Plane closeout

Date: 2026-09-02  
Branch: `feat/execution-data-activation`  
Decision: `COMPLETE_SCREEN_BFF_ACCEPTED / CURRENT_COMMAND_SET_CONTROLLED /
R0_LOCAL_TASKS_CONNECTED / UNPUBLISHED_MUTATIONS_FAIL_CLOSED /
PHASE_3_READY`

## 1. Authority and final architecture

Phase 2 completes the Portal-owned read/composition and command-control gaps
over the Phase 1 SGP-local projection. It does not change Trading System data,
open a direct browser-to-AWS path, activate a source mutation, modify the rich
frontend composition, or change `main`/stable.

```text
AWS-HK Trading System
  -> existing exact Manager-v2 GET capabilities
  -> Rust Execution Edge (mTLS + delegated JWT)
  -> Phase 1 lease-controlled SGP PostgreSQL projection
  -> TypeScript Screen BFF / local query / local R0 adapters
  -> same-origin authenticated Portal routes

Mutation intent
  -> TypeScript validate/plan/approval/apply/verify state machine
  -> FEATURE_EXECUTION_COMMAND_RELAY=false
  -> zero source request until an exact owner-published command is activated
```

The browser sees only versioned Portal contracts. Manager relation names,
source origins, credentials and database topology remain server-side. Paper,
Sandbox, Live, Canary and viewer-workspace lineage are enforced before facts
are composed. Exact decimal values stay strings throughout the BFF boundary.

## 2. Finite Screen BFF worklist delivered

| Slice | Delivered behavior |
|---|---|
| Command Center | Composes Portal governance, incidents and operations with local fleet projection; exposes four bounded panels and honest local source status. |
| Account/Broker 360 | Selects Live → Sandbox → Paper deterministically, enforces account/profile identity, derives exact internal/broker differences and suppresses broker truth when sync evidence is missing or mismatched. |
| Paper Workbench | Filters every source branch to the requested deployment and adds typed observation-gate facts without cross-deployment fall-through. |
| Full Blotter | Adds opaque bidirectional cursor, filter/sort allowlists, exact projected total and bounded window aggregates. Invalid or cursor-ahead requests fail with typed errors. |
| Sandbox Certification | Keeps real deployment identity/source facts visible when a Portal certification record does not exist; the seven optional certification steps remain individually typed unavailable. |
| Query/analytics | Adds a one-snapshot local TypeScript composer for deployment, alpha, portfolio and Live-gate subjects. It uses bounded current facts, exact `BigInt` decimal arithmetic and typed insufficiency instead of fabricated history. |
| Alpha Fleet | Uses a complete projected performance window for 30-day columns only when at least 30 days exist; otherwise the metrics stay explicitly partial/unavailable while current facts remain visible. |
| Canary/Live/governance | Composes current sessions, positions, orders, fills, accounting, continuity and Live-review KPIs from the exact local profile. Empty source populations remain valid empty screens; additive failures do not erase screen identity. |

The canonical screen catalogue now contains 23 commissioned screens, 23
`AVAILABLE` operations and zero stale `TYPED_UNAVAILABLE` screen roots. This
means a route/contract exists; it never means that an absent source branch has
been relabeled as populated.

## 3. Controlled command plane

Exactly four present-source read tasks are connected locally:

- `inspect` → `admin.inspect`;
- `capital` → `admin.performance`;
- `performance` → `admin.performance`;
- `broker-read` → `admin.broker-read`.

The adapter applies task parameter aliases/filters before the 200-row bound,
rejects undeclared or credential-like values, preserves profile/workspace
lineage and emits a response digest plus immutable audit record. Runtime
receipts explicitly state `transport=SGP_LOCAL_PROJECTION` and
`source_request_sent=false`.

All other read tasks stay supported-but-inactive or semantically incompatible
with a stable reason. All mutation/danger tasks retain the existing
validate/plan/approval/apply/verify state machine, but command relay remains
false because the current owner publication contains no Portal-reachable
mutation capability. Plan/apply therefore sends zero Trading System requests.
This is the exact current source truth, not hidden Portal debt.

## 4. Contracts, configuration and runtime isolation

Phase 2 synchronizes JSON Schema, OpenAPI and generated TypeScript contracts
for profile reads, Canary, Live Full Operations, governance Live review,
Command Center and operator task results. `LOCAL_R0_ONLY` is an explicit relay
state; it cannot be confused with source command relay.

The following flags remain independently reversible:

| Plane | Dev state | Production default |
|---|---|---|
| Paper/Sandbox/Live source ingestion | enabled | false unless release overlay selects it |
| SGP local projection reads | enabled | false |
| Command Center snapshot | enabled | false |
| Query/analytics | enabled | false |
| Realtime SSE | enabled | false |
| Local R0 tasks | enabled | false |
| Trading System command relay | **false** | **false** |

The dev `.env` permission was tightened to owner-only mode `0600`. HTTP/2
clients now omit TLS SNI when the reviewed WireGuard origin is an IP address,
while keeping CA/client-certificate validation and ALPN `h2`; this removes the
Node IP-SNI deprecation without weakening mTLS.

## 5. Verification evidence

### Automated acceptance

- `./scripts/execution-phase2-screen-command-test.sh`: Screen BFF, local R0,
  mutation fail-closed and provenance checks pass.
- `./scripts/verify-workspace.sh`: the complete monorepo N02–N29, tracking and
  release-isolation verifier passes.
- contracts: 113 fixtures/tests, generated-type parity and command catalogue
  parity pass;
- Control API: 31 files / 280 tests / 0 failures;
- real PostgreSQL migration plus `pg_dump`/`pg_restore` signature drill passes;
- 182k-row governance/operations count and keyset cases pass;
- concurrent serializable replay/conflict, auth/RBAC/CSRF, sensitive-value,
  profile/resource isolation, cursor/aggregate, SSE resume/gap and projection
  fault/recovery cases pass;
- N29 reports 96 classified relations, 27 Portal reads, 9 requested commands,
  31 commissioned requests, 23 screen contracts and zero unnamed internal
  technical debt. The protected-main publication gate remains intentionally
  outside Phase 2.

### Sanitized authenticated dev-runtime smoke

Control API image:
`sha256:13b6ba9d4eae085c88d1af82d6aebb28916ccb6f54308686e150b1db24f8f2cf`

The dev stack was rebuilt from `/home/bobby/portal-dev`; only `control-api` was
recreated. Portal Web and every stable service/image/volume were unchanged.
A short-lived Bobby dev session was inserted only for same-origin smoke and
deleted automatically afterwards.

| Check | Result |
|---|---|
| Health | healthy |
| Screen catalogue | 23/23 `AVAILABLE` |
| Paper overview | `partial`, 43 deployments |
| Sandbox overview | `ready`, 35 deployments |
| Live overview | truthful `empty`, 0 deployments |
| Alpha Fleet | 48 exact rows; bounded page returned 5 |
| Command Center | `QUIET`, four panels |
| Operator tasks | 24 total; four local R0 connected; mutation relay disabled |
| R0 inspect | 154 projected rows; zero source request |

The committed projection census at capture time was:

| Profile | Completeness | Sequence | Relations | Rows | Unavailable |
|---|---:|---:|---:|---:|---:|
| Paper | PARTIAL | 320 | 19 | 2,259 | 1 |
| Sandbox | PARTIAL | 332 | 13 | 191 | 0 |
| Live | PARTIAL | 332 | 15 | 50 | 0 |

The image starts without the former IP-SNI warning and without a projection
cycle failure. The one unavailable Paper relation is still the owner-published
`manager.performance:portfolio_equity_snapshots` rejection; it is isolated and
does not disable the other 18 Paper relations.

## 6. Rollback and next phase

Rollback does not require a data migration:

1. set `CONTROL_API_FEATURE_EXECUTION_LOCAL_R0_TASKS=false` to remove local R0;
2. set `CONTROL_API_FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT=false` to remove
   Command Center reads independently;
3. if necessary set `CONTROL_API_FEATURE_EXECUTION_LOCAL_PROJECTION=false` and
   deploy the prior content-addressed Control API image;
4. retain projection, journal, operation and audit records for evidence;
5. verify `FEATURE_EXECUTION_COMMAND_RELAY=false` throughout rollback.

All ten Phase 2 evidence classes pass. There is no unnamed in-scope Portal
technical debt. Phase 3 is ready but not started: Claude's pinned rich UI must
be bound panel-by-panel to these same-origin contracts and accepted through
authenticated browser journeys before any protected-main release decision.
