# EX-BE-36 — Alpha 360 current-source composition closeout

**Date:** 2026-09-01  
**Request:** BR-EX-74  
**Verdict:** `DEV_ACCEPTED / SOURCE_BACKED / RICH_COMPOSITION_PRESERVED`  
**Runtime authority:** read-only dev; command relay and Live mutation remain off

## 1. Symptom and ownership

Opening `/deployments/alphas/adaptive_hma_cpp_00115m` replaced the complete
Alpha 360 composition with `ANALYTICS_DISABLED`/`Unavailable`.

The primary defect was Portal backend/runtime integration: the dev Control API
had not commissioned N25 analytics, and after commissioning it the delegated
JWT carried the authenticated user's Portal workspace while the AWS-HK Manager
projection is deliberately stored under `workspace_execution_manager`. The
Rust Edge therefore returned `N25_PROJECTION_CYCLE_NOT_FOUND` despite an ACTIVE
Paper epoch and continuously committed projection cycles.

The secondary defect was frontend composition: the Alpha 360 container used
the optional analytics branch as the whole-screen status authority. One
analytics refusal consequently erased the current-source identity, deployment,
account and portfolio composition.

## 2. Closed implementation

- Alpha Fleet v2 is the Alpha 360 identity/deployment spine. The detail route
  performs one bounded exact search and maps owner, portfolios, stages,
  accounts, deployments, balances, allocations, position PnL and exposure.
- N25 Query analytics is additive. A branch failure produces twelve local
  typed unavailable insight tiles; it cannot replace the screen.
- The Control API now requires an explicit
  `EXECUTION_EDGE_PROJECTION_WORKSPACE_ID` whenever Manager projection analytics
  is enabled. Portal authentication and RBAC continue to use the session's
  Portal workspace; only the private delegated Manager Query/SSE assertion is
  translated to the execution-cell projection workspace.
- Legacy shadow analytics/realtime retains the Portal workspace without any
  translation. The mapping is bounded, identifier-validated and unavailable
  to the browser.
- Both N25 and N26 overlays require the exact projection workspace binding.
- Rust canonical problem envelopes `{error:{code,message}}` are reduced to an
  allowlisted code plus HTTP status. Upstream messages are never forwarded.

No Trading System code, source database, projection data, command path, Live
mutation, `main` or stable runtime was changed.

## 3. Runtime evidence

AWS-HK read-only inspection proved:

- the Paper projection epoch is ACTIVE;
- the worker continues committing complete cycles;
- the projection workspace is `workspace_execution_manager`;
- the source-backed alpha has Paper and Sandbox deployments.

After the fix, the same-origin BFF returned HTTP 200 for both:

- `GET /api/v1/execution/alphas?search=adaptive_hma_cpp_00115m&limit=50`;
- `GET /api/v1/execution/alphas/adaptive_hma_cpp_00115m/query-analytics`.

The analytics response reported an active runtime, 68 source facts, one
repository query and the current active epoch. A five-minute dev-only session
was created for the acceptance and deleted immediately after every probe.

## 4. Acceptance gates

- Control API build, fresh PostgreSQL, restore drill: **28 files / 257 tests**.
- Frontend full suite: **94 files / 1,797 passed / 1 intentional skip**.
- Frontend production build: **PASS**.
- Chromium product journey, not a direct route-only probe:
  - opened Alpha Fleet;
  - found and clicked `adaptive_hma_cpp_00115m`;
  - Fleet exact search: HTTP 200;
  - Alpha analytics: HTTP 200;
  - rich Alpha 360 marker present;
  - 10 tabs, 4 deployment controls, 6 KPI cells and 12 insight tiles;
  - zero console warnings/errors and zero cross-origin product request.

## 5. Rollback and remaining truth

Rollback is limited to disabling the existing analytics/SSE dev overlay or
reverting BR-EX-74. Current-source Fleet remains usable even if analytics is
disabled again because the UI is now branch-local.

Equity history, stage-comparison series and other unpublished historical
analytics remain honest panel-local empty/unavailable states. They are source
capability gaps, not a reason to hide the Alpha 360 screen. N29-REL-01 remains
the separate protected-main signed publication gate.
