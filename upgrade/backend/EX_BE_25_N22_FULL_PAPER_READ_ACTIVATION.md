# EX-BE-25 — N22 Full Paper Read Activation

**Status:** `COMPLETE / PAPER_PRODUCT_READ_RELEASE_QUALIFIED / SIGNED_DEV_DEPLOYMENT_PENDING`  
**Date:** 2026-08-30  
**Branch:** `feat/execution-manager-campaign`  
**Runtime effect:** no stable, Trading System, Sandbox, Live or command mutation

## 1. Goal and result

N22 converts the complete currently supported Paper read set from internal
Manager-v2 transport into four session-guarded Portal product APIs. The
browser never chooses a source relation and never receives a raw Manager
envelope.

```text
Portal browser
  -> TypeScript session/workspace product BFF
  -> N21 shared admission/cache/freshness authority
  -> H2 + TLS 1.3 mTLS + delegated JWT
  -> Rust Manager-v2 compatibility authority
  -> Paper Source Proxy
  -> Trading System current relations (read-only)
```

The four commissioned Paper contracts are:

| Screen | Product API | Current source result |
| --- | --- | --- |
| Paper Overview | `GET /api/v1/execution/screens/paper` | 6 bounded relation reads |
| Paper Workbench | `GET /api/v1/execution/screens/paper/{deploymentId}` | 7 bounded relation reads, deployment-scoped |
| VN Paper Workbench | `GET /api/v1/execution/screens/paper/{deploymentId}/vn-market` | same current facts; calendar/candles typed unavailable |
| Full Blotter | `GET /api/v1/execution/screens/blotter` | 7 bounded relation reads and signed forward cursor |

All routes return `ready`, `empty`, `stale`, `partial` or `unavailable` from
source truth. Missing N25 analytics/exact-query and N28 candle/calendar
capabilities remain explicit typed branches rather than fixture data.

## 2. Exact source-as-is boundary

The server-owned N22 binding accepts exactly four screen IDs, seven current
capabilities and nine Manager source aliases. It maps those aliases only to
the required Paper relations:

- deployments, positions and execution sessions;
- orders, fills and conditional order group/leg facts;
- performance, account-equity and portfolio-equity snapshots;
- reconciliation findings and the command journal.

The field allowlists were reconciled against the runtime-verified Trading
System `db-schema.json` at source commit
`9081397de9e981c43b4e0f67fabe747e7ed964c7`. Position, session and the three
snapshot families use their actual source columns; opaque record keys,
relation metadata, JSON objects, raw request/response fields and secret-shaped
fields are discarded. A non-empty source record that becomes empty after
narrowing is rejected as source-contract drift.

Every explicit `mode` field must be `paper`. The Manager envelope must also
carry `PAPER_BINANCE_USDM` and `EXECUTION_CELL`; a cross-profile row is removed
from the result and its relation becomes typed unavailable.

## 3. Product composition and bounds

- Fan-out is fixed per screen and uses `Promise.allSettled`; there is never a
  request per row.
- Manager pages are capped at 200 rows and source cursors at 4096 bytes.
- Full Blotter wraps the opaque Manager cursor in the existing signed Portal
  cursor bound to workspace, resource, direction and limit.
- Workbench data is scoped by deployment identity and, where appropriate,
  portfolio identity. An exhausted deployment page returns a real 404; a
  bounded non-exhausted page returns a typed partial lookup branch.
- Source errors are sanitized. The response exposes no source URL, mTLS/JWT
  material, raw payload, relation selector or opaque source key.
- N21 continues to own multi-replica source/profile admission, coalescing,
  short cache and provenance preservation.

## 4. Versioned contract

`execution-paper-read.v1` is published as strict JSON Schema, OpenAPI,
generated TypeScript and eight canonical fixtures:

- Paper Overview: ready, empty, stale, partial and unavailable;
- Paper Workbench, VN Workbench and Full Blotter: source-backed partial
  examples with the unavailable future branches made explicit.

The existing screen catalogue now marks exactly these four product contracts
`AVAILABLE`. Raw browser current-source routes remain HTTP 410. Frontend smoke
may be retired field-by-field only after the dev product response reaches
consumer parity; N22 does not delete approved visual fallbacks pre-emptively.

## 5. Release and rollback

The immutable release helper binds the N22 files and Paper profile to the
existing verified N14A/N14B lineage, exact source commit and digest-pinned
Control API/Edge images. The candidate enables only:

- `FEATURE_EXECUTION_CURRENT_SOURCE_PAPER=true`;
- `EDGE_MANAGER_V2_READ_ENABLED=true`.

Sandbox, Live, projection ingestion, realtime SSE, analytics query and command
relay remain false. Rollback is one Paper feature flag plus the prior image
digest and requires no database/source restore because N22 writes no Trading
System or projection state.

The current branch is release-qualified source. Actual dev runtime activation
occurs only after review/merge publishes immutable images from this commit;
stable/main is outside this phase.

## 6. Verification

- source-as-is relation/field parity and secret/raw stripping: pass;
- auth/session/workspace and foreign-workspace rejection: pass;
- Paper profile/authority and cross-profile negative cases: pass;
- ready/empty/stale/partial/unavailable and source-loss behavior: pass;
- deployment scoping and signed cursor context binding: pass;
- 20 concurrent overview requests: exactly 120 bounded calls, every page
  `<=200`, every product response `<1 MiB`: pass;
- JSON Schema/OpenAPI/generated-type parity and 96 contract fixtures: pass;
- immutable release lineage, Paper-only Compose render and one-flag rollback:
  pass;
- full Control API build/tests with fresh PostgreSQL plus dump/restore: pass.

## 7. Debt closeout and next phase

N22 has no open internal technical debt. N25 exact totals/filters/aggregates,
N28 candles/calendar, N24 durable projection/SSE and N23 Sandbox/Live profiles
are explicit later capabilities, not hidden N22 omissions.

Next backend phase is N23: reuse these stable product contracts with isolated
Sandbox and Live profile bindings, truthful empty Live state and no command
activation.
