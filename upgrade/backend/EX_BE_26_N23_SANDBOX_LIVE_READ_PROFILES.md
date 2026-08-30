# EX-BE-26 — N23 Sandbox and Live Read Profiles

**Status:** `COMPLETE / SANDBOX_LIVE_READ_RELEASE_QUALIFIED / SIGNED_DEV_DEPLOYMENT_PENDING`  
**Date:** 2026-08-30  
**Branch:** `feat/execution-manager-campaign`  
**Runtime effect:** no stable runtime, Trading System, projection, SSE or command mutation

## 1. Goal and result

N23 reuses the accepted N19–N22 Manager-v2 read boundary for isolated Sandbox
and Live product reads. It adds no Trading System Canary mode. Canary remains
a Portal governance stage composed server-side over Live-profile facts.

```text
Portal browser
  -> TypeScript session/workspace BFF and Portal governance
  -> N21 profile-scoped admission/cache/freshness
  -> H2 + TLS 1.3 mTLS + profile-specific delegated JWT
  -> Rust Manager-v2 compatibility authority
  -> exact Sandbox or Live Source Proxy profile
  -> Trading System current read relations
```

## 2. Product contracts

| Product | API | Source profile | Result |
| --- | --- | --- | --- |
| Sandbox Overview | `GET /api/v1/execution/screens/sandbox` | `SANDBOX_BINANCE_USDM` | bounded current facts |
| Sandbox Certification | `GET /api/v1/execution/deployments/{id}/certification` | Sandbox plus Portal certification | joined read-only detail |
| Live Overview | `GET /api/v1/execution/screens/live` | `LIVE_BINANCE_USDM` | truthful ready/empty/partial/unavailable |
| Canary | `GET /api/v1/execution/deployments/{id}/canary` | Live plus Portal Canary envelope | no fabricated Canary source mode |
| Live Full | `GET /api/v1/execution/deployments/{id}/live` | Live plus Portal lineage | current facts; future branches typed |
| Live Gate | `GET /api/v1/execution/governance/approvals/{id}/live` | Live plus existing R2 backbone | read-only gate detail |

The server owns every screen-to-source relation binding. Browser input is
limited to workspace and opaque product resource IDs; it cannot choose a
Manager relation, profile, audience, origin or arbitrary upstream path.

## 3. Source-as-is scope and truth model

N23 consumes the current source without requiring a Trading System change:

- deployments, positions, sessions and reconciliation;
- accounts, account/margin balances and effective account/broker sync;
- orders and fills on Live Full.

Only explicit scalar allowlists cross the product boundary. Opaque record
keys, raw/JSON objects, source topology and secret-shaped fields are removed.
Rows with a conflicting explicit `mode` are rejected and that capability is
marked unavailable.

Live with a valid envelope and zero rows is `empty/COMPLETE`; it is not a
failure. Source loss, invalid contract, cross-profile rows or partial source
pages remain `partial` or `unavailable`. Failures are never converted to an
empty dashboard and no fake Live row is generated.

## 4. Isolation and scale

- Sandbox and Live use different exact Manager profile IDs and delegated JWT
  audiences.
- Process-local bulkhead and burst-free limiter instances are keyed by
  profile; N21 shared admission/cache keys already include profile, workspace,
  principal, role, adapter revision and exact request path.
- Manager cursors remain opaque and profile-bound at the Edge. N23 screen
  responses do not expose a generic cursor or raw relation browser.
- Fan-out is fixed by screen and uses `Promise.allSettled`; there is no N+1
  call per returned row.
- Each relation is capped at 100 or 200 rows and every response remains under
  the existing 1 MiB product bound in load evidence.
- Sandbox and Live have separate release flags and can roll back independently
  without a database restore.

## 5. Versioned contract and compatibility

`execution-profile-read.v1` ships as strict JSON Schema, OpenAPI, generated
TypeScript and three canonical truth fixtures. `governance-live-review.v1`
composes the existing immutable R2 response with the canonical Live facts and
hard-codes source side effects and production commands to false.

The existing Sandbox Certification, Canary and Live Full contracts accept an
optional `current_source`. Their root delivery state changes to
`SOURCE_BACKED` only when that source result is not unavailable. With profile
flags dark or source loss, prior `fixture/UNAVAILABLE` behavior remains intact.
This makes code deployment safe before profile activation.

Market ticks and the N24/N25-derived Live Gate branches remain explicitly
typed unavailable. They are named later-phase capabilities, not hidden N23
debt.

## 6. Immutable release and rollback

The N23 adjunct re-verifies the N22/N14 immutable source-and-image lineage and
binds all N23 source, contract, manifest and runbook bytes. Candidate render
enables the Sandbox and Live read flags while keeping Paper unchanged and
projection, SSE, analytics and command false.

Rollback Sandbox with
`CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX=false`; rollback Live
with `CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_LIVE=false`. The other
profiles remain unchanged and database restore is forbidden because N23 owns
no durable source/projection write.

## 7. Verification

- exact profile/screen/relation matrix and Canary→Live composition: pass;
- cross-profile row and screen/profile negative matrix: pass;
- valid empty Live and source-loss-not-empty semantics: pass;
- source loss/recovery and 20-request bounded fan-out/load: pass;
- deployment/account scoping and raw/secret stripping: pass;
- strict contract fixtures, generated paths and read-only Live Gate: pass;
- immutable N22 lineage, byte tamper and authority widening rejection: pass;
- independent Sandbox/Live rollback contract: pass;
- TypeScript typecheck and focused Control API unit suites: 29/29 pass;
- strict shared-contract suite: 102/102 pass;
- fresh PostgreSQL Control API regression: 26 files, 236/236 pass;
- PostgreSQL dump/restore drill: pass;
- immutable release/rollback unit suite: 4/4 pass;
- Docker Compose candidate and independent Sandbox/Live rollback render: pass.

The full Docker-backed gate used a fresh PostgreSQL instance and removed its
temporary dependencies after completion. These results qualify the source and
release profile; they do not claim that a signed dev image has been deployed.

## 8. Debt closeout and next phase

N23 has no open internal technical debt. N24 durable projection, N25 query and
analytics, N26 SSE, and N28 genuinely absent market semantics retain their own
named scope. The next backend phase is N24 — durable Portal projection across
the active profile set, with replay/rebuild/retention/restore and no direct
Trading System database or Redis access.
