# Codex → Claude — N29 Same-Origin Product Consumer Closeout

**Issued:** 2026-08-31  
**Owner:** Claude — frontend lead  
**Backend authority:** Codex  
**Owner decision:** Bobby approved this frontend closeout before the Codex N29 amendment  
**Frontend worktree:** `/home/bobby/portal-uiux-next`  
**Frontend branch at audit:** `feat/execution-loop-uiux-continuation`  
**Backend evidence worktree:** `/home/bobby/portal-backend-plan`  
**Backend evidence commit:** `e226ffb` (`feat/execution-manager-campaign`)  
**Runtime effect of this task:** none until Bobby merges and deploys the reviewed release

## 1. Goal

Close `N29-FE-01` completely. Production Execution routes must consume the
session-guarded TypeScript same-origin BFF and render the server's canonical
states. This is broader than replacing one `createFixtureApi()` call.

The accepted outcome is:

1. no production Execution route obtains business data from `createFixtureApi`,
   `CC_FIXTURES`, `*.smoke` or `*.fixtures`;
2. every screen with an available BFF route consumes that exact route through
   `credentials: "same-origin"` and the existing typed readers;
3. a screen without a published contract renders an honest typed unavailable
   state and never fills the gap with smoke data;
4. the browser never calls Rust Edge, AWS-HK, Trading System, PostgreSQL or
   Redis directly;
5. all React/DOM warnings are removed from the full frontend test run and the
   reviewed browser journeys;
6. fixtures remain available in unit tests, visual evidence and the dedicated
   fixture lab. They are not deleted merely because product routes stop using
   them.

This task does **not** close N29 itself. After Claude returns the evidence in
section 11, Codex performs the separate N29 closeout amendment, refreshes the
digest-bound evidence and fixes backend catalogue metadata.

## 2. Read this exact backend source of truth

Do not infer endpoints from old comments in `httpApi.ts` or from a smoke file.
Read the following from `/home/bobby/portal-backend-plan` at `e226ffb`:

1. `apps/control-api/src/screen-bff/catalogue.ts`
2. `apps/control-api/src/paper-read/paper-read.controller.ts`
3. `apps/control-api/src/profile-read/profile-read.controller.ts`
4. `apps/control-api/src/command-center/command-center.controller.ts`
5. `apps/control-api/src/operations/incident.controller.ts`
6. `apps/control-api/src/governance/governance.controller.ts`
7. `apps/control-api/src/sandbox/sandbox-certification.controller.ts`
8. `apps/control-api/src/canary/canary.controller.ts`
9. `apps/control-api/src/live/live-operations.controller.ts`
10. `apps/control-api/src/execution/analytics.controller.ts`
11. `apps/control-api/src/execution/realtime.controller.ts`
12. `packages/contracts/generated/`
13. `packages/contracts/fixtures/`
14. `upgrade/backend/EX_BE_23_N20_CANONICAL_SCREEN_BFF_CONTRACTS.md`
15. `upgrade/backend/EX_BE_25_N22_FULL_PAPER_READ_ACTIVATION.md`
16. `upgrade/backend/EX_BE_26_N23_SANDBOX_LIVE_READ_PROFILES.md`
17. `upgrade/backend/EX_BE_28_N25_QUERY_AND_ANALYTICS_PLANE.md`
18. `upgrade/backend/EX_BE_29_N26_REALTIME_SSE_ACTIVATION.md`
19. `upgrade/backend/EX_BE_30_N27_ADMIN_ACTION_DRAWER_COMMAND_PLANE.md`
20. `upgrade/backend/EX_BE_32_N29_PRODUCT_ACCEPTANCE_AND_RELEASE_CLOSEOUT.md`

If the frontend branch has not yet received these files through the reviewed
integration branch, read them from the absolute backend evidence worktree. Do
not copy backend implementation into frontend code and do not modify backend
files from the Claude branch.

## 3. Current product-route defects to remove

The following are product integration defects, not approved preview behavior:

- `ExecutionPreviewRoute.tsx` still falls back to `createFixtureApi()`.
- `?api=http` is a browser-smoke escape rather than the product authority. A
  query parameter must not decide whether production financial data is real.
- Command Center still constructs its snapshot from `CC_FIXTURES.busy`.
- `PaperOverview`, `SandboxOverview`, `LiveOverview`, `AlphaFleet`,
  `AccountsBindings` and `BindingDetail` import smoke data directly.
- `previewControllers.tsx` imports Paper, VN Paper, Blotter, Alpha 360,
  Portfolio 360 and Account 360 fixtures and supplies them to product routes.
- the existing `ExecutionApi`/`createHttpApi` surface covers the older
  governance/operations APIs but does not yet expose every N22/N23/N25 narrow
  screen API;
- Admin Action Drawer's product contract is the N27 task catalogue at
  `GET /api/v1/execution/commands/tasks`; the older
  `GET /api/v1/execution/commands/catalog` is not a substitute for the N27
  24-task classification shown by the reviewed screen;
- the current top-of-file comments still claim that every read uses fixtures.
  Comments, tests and banners must describe the resulting behavior accurately.

Test-only uses of `createFixtureApi()` are allowed. The defect is a fixture
producer reachable from a product route.

## 4. Screen-by-screen route map

### 4.1 Screens already shaped around `ExecutionApi`

Keep their presentational components. Make the route supply the real HTTP
implementation and verify each parser against the canonical fixture for the
endpoint.

| Screen | Browser route | Same-origin BFF | Current frontend action |
|---|---|---|---|
| Operations Queue | `/execution/operations` | `GET /api/v1/execution/operations` | Use HTTP port; preserve keyset, exact counts, stale/partial/unavailable |
| Incident Detail | `/execution/operations/incidents/:incidentId` | `GET /api/v1/execution/operations/incidents/{incidentId}` | Use HTTP port; no fixture incident fallback |
| Approval Inbox | `/governance/approvals` | `GET /api/v1/execution/governance/approvals` | Use HTTP port; preserve view and bidirectional cursor rules |
| Gate R1 | `/governance/approvals/:approvalId/r1` | `GET /api/v1/execution/governance/approvals/{approvalId}/r1` | Use HTTP port; no browser verdict recomputation |
| Gate R2 | `/governance/approvals/:approvalId/r2` | `GET /api/v1/execution/governance/approvals/{approvalId}/r2` | Use HTTP port; capital preview remains its declared POST read-compute call |
| Paper Exit Review | `/governance/exit-reviews/:reviewId` | `GET /api/v1/execution/governance/exit-reviews/{reviewId}` | Use HTTP port; plan/apply/verify remains fail-closed |
| Sandbox Certification | `/deployments/sandbox/:deploymentId` | `GET /api/v1/execution/deployments/{deploymentId}/certification` | Use HTTP port; no smoke certification fallback |
| Canary Control Room | `/deployments/live/:deploymentId/canary` | `GET /api/v1/execution/deployments/{deploymentId}/canary` | Use HTTP port; do not imply command authority |
| Live Full Operations | `/deployments/live/:deploymentId` | `GET /api/v1/execution/deployments/{deploymentId}/live` | Use HTTP port; valid empty Live stays empty, never fixture-filled |
| New Approval Request | `/governance/approvals/new` | `POST /api/v1/execution/governance/approvals` | Use `NewApprovalRequestContainer`; Origin + double-submit CSRF + idempotency key |
| Gate Live Review | `/governance/approvals/:approvalId/live` | `GET /api/v1/execution/governance/approvals/{approvalId}/live` | Use HTTP port; criteria and evidence remain server-owned |
| Waivers & Conditions | `/governance/waivers` | `GET /api/v1/execution/governance/waivers` | Use `WaiversRegisterContainer`; exact count and keyset from server |
| Admin Action Drawer | `/administration/actions` | `GET /api/v1/execution/commands/tasks` | Consume the N27 24-task server catalogue; inactive/incompatible tasks stay disabled |

For Admin Action Drawer, do not enable a command merely because a catalogue
row exists. N27's accepted current state is `0 CONNECTED`,
`14 SUPPORTED_BUT_INACTIVE`, `10 SEMANTICALLY_INCOMPATIBLE`. Plan/run UI may
only follow the exact per-task server state.

### 4.2 Screens that still bypass `ExecutionApi`

Create typed frontend consumers/containers for these routes. Refactor the
existing visual components to receive parsed data and canonical UI state as
props. Do not redesign approved UI/UX in this transport task.

| Screen | Browser route | Same-origin BFF | Fixture path that must leave product runtime |
|---|---|---|---|
| Command Center | `/execution` | `GET /api/v1/execution/command-center` | `CC_FIXTURES.busy` |
| Paper Overview | `/deployments/paper` | `GET /api/v1/execution/screens/paper` | `paper.smoke` in `PaperOverview` |
| Paper Workbench | `/deployments/paper/:deploymentId` | `GET /api/v1/execution/screens/paper/{deploymentId}` | `paper.fixtures` through `PaperWorkbenchPreview` |
| VN Paper Workbench | `/deployments/paper/:deploymentId/vn-market` | `GET /api/v1/execution/screens/paper/{deploymentId}/vn-market` | `vnm.fixtures` through `PaperWorkbenchPreview` |
| Sandbox Overview | `/deployments/sandbox` | `GET /api/v1/execution/screens/sandbox` | `sandbox.smoke` in `SandboxOverview` |
| Live Overview | `/deployments/live` | `GET /api/v1/execution/screens/live` | `live.smoke` in `LiveOverview` |
| Full Blotter | `/deployments/blotter` | `GET /api/v1/execution/screens/blotter` | `blotter.fixtures` through `FullBlotterPreview` |
| Alpha 360 | `/deployments/alphas/:alphaId` | `GET /api/v1/execution/alphas/{alphaId}/query-analytics` | `alpha360.fixtures`, analytics presentation fixtures and `stage.smoke` |
| Portfolio 360 | `/deployments/portfolios/:portfolioId` | `GET /api/v1/execution/portfolios/{portfolioId}/query-analytics` | `portfolio360.fixtures` and `stage.smoke` |
| Account/Broker 360 | `/deployments/accounts/:accountId` | **typed unavailable**: reason `N28_FULL_EXPOSURE_POPULATION_NOT_PUBLISHED` | `account360.fixtures`; render unavailable instead |

The same component can still be rendered with canonical fixtures in tests and
the fixture lab. Production containers must not import those fixture modules.
Move shared domain types out of `*.fixtures.ts` before importing them from a
production component.

### 4.3 Route variants without an exact accepted BFF contract

These current product routes share a screen ID with a detail screen but do not
have their own accepted narrow API in the N20 catalogue:

| Product route | Current component | Required behavior in this task |
|---|---|---|
| `/deployments/alphas` | `AlphaFleet` | Render typed unavailable with a precise backend-contract reason; do not keep `alphaFleet.smoke` and do not call Alpha 360 with an invented ID |
| `/deployments/accounts` | `AccountsBindings` | Render typed unavailable; do not keep `accounts.smoke` |
| `/deployments/accounts?binding=:bindingId` | `BindingDetail` | Render typed unavailable; do not infer a binding detail from Account 360 or use smoke data |

Return these three gaps in one consolidated backend request. Codex will decide
whether the N29 amendment adds separate list/detail BFF routes or keeps a
documented unavailable state. Claude must not add a generic Manager relation
query or direct source call to bypass the gap.

## 5. Realtime behavior

The only browser transport is same-origin:

- snapshot: `GET /api/v1/execution/command-center/realtime-snapshot`;
- stream: `GET /api/v1/execution/command-center/stream`;
- credentials: same-origin session cookie;
- one EventSource per mounted consumer;
- no browser-supplied mTLS/JWT/API key;
- no stream when the server contract says `sse_enabled=false` or
  `stream_available=false`.

On terminal `auth.expired` or terminal `projection.gap`, call `close()`.
`projection.gap` requires a new authenticated snapshot before creating a new
EventSource. Do not leave native EventSource retrying a terminal condition.
Transient transport loss may reconnect only according to the bounded N26
contract and must preserve stale/source-loss UI truth.

## 6. Mutations and commands

- All mutations use same-origin cookies, allowed Origin and
  `x-portal-csrf` matching `__Host-portal_csrf`.
- Preserve server idempotency keys and optimistic versions.
- HTTP `202` is accepted, not success. Poll the operation until a declared
  terminal result.
- `PARTIAL` and `UNCERTAIN` are not success.
- Never retry an ambiguous mutation automatically.
- Never enable source commands while the N27 task state is inactive or
  incompatible.
- Never transform an unavailable command into a simulated success on a product
  route.

## 7. Canonical UI states

Every consumer must visibly distinguish:

`loading / ready / empty / stale / partial / denied / unavailable / error`

Rules:

- absent/null is not zero;
- an empty response explicitly marked complete is a valid empty state;
- partial data remains visible with its missing scopes/reason codes;
- stale data remains visible with `as_of` and age;
- 401/expired session is terminal for the current stream and leads to the
  existing authentication flow;
- 403 is denied, not unavailable;
- 404 for a scoped resource is not an empty collection;
- no client-side financial join, total, verdict, ranking, SLA or permission
  inference;
- do not backfill missing series, rows, labels or metrics from a fixture.

## 8. Product/fixture boundary gate

The following product graph must not import fixture producers, directly or
transitively:

- `ExecutionPreviewRoute.tsx`;
- product containers under `execution/screens/`;
- `previewControllers.tsx` after it is replaced/refactored;
- any module imported only to produce product route data.

Forbidden in that graph:

- `createFixtureApi`;
- `CC_FIXTURES`;
- imports ending in `.fixtures` or `.smoke`;
- locally hard-coded business rows, series, approvals, operations, balances,
  orders, fills, positions, exposure or PnL.

Allowed:

- fixture modules in `*.test.ts[x]`;
- fixture-lab/evidence route `Fixtures.tsx`;
- canonical backend fixtures used as test inputs;
- presentation constants that contain no business facts.

Add an automated boundary test that walks/import-scans the product graph. A
single grep over `ExecutionPreviewRoute.tsx` is not sufficient because the
present leak is transitive through screen and preview-controller modules.

## 9. React/DOM warning closeout

The full test run and reviewed browser journeys must emit zero unexpected
React/DOM warnings. Specifically close the previously observed classes:

- state updates outside `act(...)`;
- duplicate React keys;
- whitespace/text nodes directly under table row/table structures;
- invalid DOM nesting;
- state updates after unmount;
- EventSource/fetch completion after the owning screen unmounts;
- uncontrolled/controlled input transitions.

Add a test setup guard that fails on unexpected `console.error` and
`console.warn`, with a narrow explicit allowlist only for messages the test is
deliberately asserting. Do not hide warnings globally.

## 10. Required tests

Run from `apps/portal/frontend`:

```bash
npm test
npm run build
npx playwright test --project=chromium-preview \
  e2e/execution-preview.spec.ts \
  e2e/execution-journeys.spec.ts
```

Add or update evidence for:

1. each route in sections 4.1 and 4.2 calls only its declared same-origin path;
2. request identifiers and path parameters are encoded;
3. session credentials are present;
4. the seven non-loading result states are rendered honestly where applicable;
5. malformed/incompatible payload fails closed;
6. 401/403/404/409/422/429/502/503 mappings;
7. unmount aborts fetch and closes owned EventSource;
8. terminal SSE events close permanently; gap performs snapshot-first recovery;
9. mutations carry CSRF/idempotency/version and do not retry ambiguity;
10. product graph contains no fixture producer;
11. test and browser console warning count is zero;
12. no request targets AWS-HK, Edge, Trading System, database or Redis.

The preview browser server may use a controlled same-origin BFF test double for
deterministic evidence, but the route under test must use the same HTTP client
and parsers as the product. Do not satisfy the gate by selecting
`createFixtureApi()` again.

## 11. Claude return packet

Commit coherent frontend slices on `feat/execution-loop-uiux-continuation` and
return one report containing:

1. commit SHA(s) and exact files changed;
2. matrix of every screen in section 4: `HTTP_CONSUMER`,
   `TYPED_UNAVAILABLE` or `NOT_APPLICABLE`;
3. exact endpoint exercised by each HTTP consumer;
4. remaining unavailable screens and server reason codes;
5. fixture-boundary scan result;
6. full Vitest count and zero-warning evidence;
7. TypeScript/Vite production build result;
8. Playwright journey result and captured browser console/network evidence;
9. Reuse report required by `CLAUDE.md`;
10. one consolidated backend request for `/deployments/alphas`,
    `/deployments/accounts` and binding detail, plus any contract mismatch found;
11. confirmation that Claude did not edit backend, registry authority, runtime
    flags, Trading System or deployment files.

Update Claude-owned tracking in:

- `apps/portal/registry/FRONTEND_HANDOFF.md`;
- `upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/PHASE_TRACKER.md`.

Do not mark Product GO. Return `FRONTEND_CONSUMER_ACCEPTANCE_READY_FOR_CODEX`
only when every gate above is green. Codex then performs the N29 closeout
amendment and Bobby decides the protected merge.

## 12. Known backend metadata discrepancy — do not fix from frontend

The backend audit found request-ID traceability drift:

- Command Center owns promotion-pipeline request `BR-EX-45`;
- Incident Detail owns `BR-EX-46`;
- Operations Queue owns `BR-EX-47`;
- Approval Inbox must not claim `BR-EX-47`.

Current backend tests check only that the global set `BR-EX-41…71` exists, so
the incorrect per-screen mapping can pass. Codex will fix the catalogue,
per-screen mapping tests, the N29 evidence manifest and the incorrect Account
gap reference (`MC-01` must be `MC-05`) in the later N29 amendment. Claude may
use the corrected mapping for frontend tracking but must not edit backend
authority files.
