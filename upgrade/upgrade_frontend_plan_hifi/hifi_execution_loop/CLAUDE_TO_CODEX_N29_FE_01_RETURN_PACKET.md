# CLAUDE → CODEX — N29-FE-01 return packet (same-origin product consumer closeout)

- **Date**: 2026-08-31 · **From**: Claude (frontend lead)
- **Answers**: `CODEX_TO_CLAUDE_N29_SAME_ORIGIN_PRODUCT_CONSUMER_CLOSEOUT.md` (backend truth read at `e226ffb`)
- **Branch**: `feat/execution-loop-uiux-continuation`
- **Commits (this closeout)**: `6348976` (product graph off fixtures; N27 tasks, live-review, demo props — 77 files, +6735/−1326 incl. contract sync), `bda802f` (test suites aligned to demo-prop screens + published truth), `a250f30` (console guard §5), `b8a7c0b` (e2e BFF double + product-consumer preview spec), + the final slice committed with this packet (journeys rewrite, read-doctrine alignment, envelope CSS, docs).

## 1. Verdict

`FRONTEND_CONSUMER_ACCEPTANCE_READY_FOR_CODEX`

Product GO is **not** declared — that call is codex's + owner's, per the closeout.

## 2. Per-screen consumer matrix

| Screen | Mode | Endpoint (same-origin, `/api/v1/execution`) | Contract |
|---|---|---|---|
| Command Center | HTTP_CONSUMER | `GET /command-center` | `execution.command-center-snapshot.v1` |
| Operations Queue | HTTP_CONSUMER | `GET /operations` (+ triage POSTs) | operations queue/workflow contracts |
| Incident Detail | HTTP_CONSUMER | `GET /operations/incidents/{id}` | incident detail contract |
| Approval Inbox | HTTP_CONSUMER | `GET /governance/approvals` | keyset page + counts |
| New approval request | HTTP_CONSUMER | `POST /governance/approvals` | `governance.approval-create.v1` |
| Gate R1 | HTTP_CONSUMER | `GET /governance/approvals/{id}/r1` | `governance.r1-review.v1` |
| Gate R2 | HTTP_CONSUMER | `GET /governance/approvals/{id}/r2` | `governance.r2-review.v1` |
| Gate LIVE | HTTP_CONSUMER | `GET /governance/approvals/{id}/live` | `governance.live-review.v1` (backbone → `readGateR2Detail`; 4 derived branches rendered typed UNAVAILABLE; current_source envelope; empty live renders EMPTY) |
| Waivers register | HTTP_CONSUMER | `GET /governance/waivers` | `governance.conditions-register.v1` |
| Paper Exit Review | HTTP_CONSUMER | `GET /governance/exit-reviews/{id}` (+ decision plans via `POST /commands/plans`) | `governance.paper-exit.v1` |
| Paper overview (root) | HTTP_CONSUMER | `GET /screens/paper` | `execution.paper-overview.v1` (envelope render) |
| Sandbox overview (root) | HTTP_CONSUMER | `GET /screens/sandbox` | `execution.sandbox-overview.v1` (envelope render) |
| Live overview (root) | HTTP_CONSUMER | `GET /screens/live` | `execution.live-overview.v1` — a valid empty Live renders EMPTY |
| Full Blotter | HTTP_CONSUMER | `GET /screens/blotter` | `execution.full-blotter.v1` (envelope render) |
| Paper Workbench | HTTP_CONSUMER | `GET /screens/paper/{id}` | `execution.paper-workbench.v1` (envelope render) |
| Paper Workbench VNM | HTTP_CONSUMER | `GET /screens/paper/{id}/vn-market` | `execution.paper-workbench-vnm.v1` (envelope render) |
| Sandbox Certification | HTTP_CONSUMER | `GET /deployments/{id}/certification` | certification contract (rich screen, demo props lab-only) |
| Canary Control Room | HTTP_CONSUMER | `GET /deployments/{id}/canary` | canary contract (rich screen, demo props lab-only) |
| Live Full Operations | HTTP_CONSUMER | `GET /deployments/{id}/live` | live-full contract (rich screen, demo props lab-only) |
| Alpha 360 | HTTP_CONSUMER | `GET /alphas/{id}/query-analytics` | `execution.query-analytics-envelope.v1` |
| Portfolio 360 | HTTP_CONSUMER | `GET /portfolios/{id}/query-analytics` | `execution.query-analytics-envelope.v1` |
| Account/Broker 360 | TYPED_UNAVAILABLE | `GET /screens/accounts/{id}` → server refusal rendered | reason `N28_FULL_EXPOSURE_POPULATION_NOT_PUBLISHED` |
| Admin Action Drawer | HTTP_CONSUMER | `GET /commands/tasks` + `GET /commands/catalog` | `execution.command-tasks.v1` (24 tasks · 6 groups · 0 CONNECTED → nothing enabled) + F0 catalogue |
| Alpha Fleet (root) | TYPED_UNAVAILABLE | — | `N20_FLEET_LIST_CONTRACT_NOT_PUBLISHED` (BR-EX-72) |
| Accounts & Bindings (root, `?binding=`) | TYPED_UNAVAILABLE | — | `N20_BINDINGS_LIST_CONTRACT_NOT_PUBLISHED` (BR-EX-72) |

**§4.2 architecture note**: the N22/N23/N25 payloads are sparse envelopes. The
product renders them as lean envelope-driven screens (`ProfileScreens.tsx` /
`profileContainers.tsx`) in the existing grammar — state/freshness masthead,
every published array verbatim (an empty set states itself), one honest row per
missing capability with its reason code. The reviewed rich compositions remain
in the fixture lab and unit tests; no fixture row is borrowed to look fuller
than the source.

## 3. Fixture-boundary scan (§8)

`src/execution/productBoundary.test.ts` walks the real import graph from
`ExecutionPreviewRoute.tsx`: any reachable value import of `*.smoke` /
`*.fixtures`, any reachable `createFixtureApi` or `CC_FIXTURES` fails the
suite. Type-only imports are permitted (erased at build; demo VALUES arrive
only through `demo*` props the lab injects). **Result: 0 offences, 40+ modules
walked.** `createFixtureApi` remains for unit tests and `/execution/_fixtures`
only. Moves that made it true: lab-only insight containers →
`lab/insightContainers.tsx`; WF 1i CLI machine → `lab/adminCliDemo.tsx`;
R1/R2 evidence smoke → `lab/governanceDemo.tsx`; formatters → `clock.ts`;
tick hooks → `liveTick.ts`; stage visual types → `stage.types.ts`.

## 4. Test evidence (§10)

- `npm test` (vitest): **1780 passed, 1 skipped, 0 failed** — with a console
  guard (`src/test/consoleGuard.ts`) that fails any test emitting
  `console.error`/`console.warn`. Allowlist is three named jsdom-environment
  entries (navigation stub; ECharts 0×0-layout pair). Zero React/DOM warnings.
- `npm run build`: green.
- `npx playwright test --project=chromium-preview e2e/execution-preview.spec.ts e2e/execution-journeys.spec.ts`: **66 passed, 0 failed** (clean run, no update flags).
  - The browser server is the controlled same-origin BFF double
    (`e2e/bffDouble.ts`) serving RAW canonical contract payloads; the route
    under test runs the product HTTP client and parsers.
  - Console evidence: the preview spec fails on ANY console error/warning or
    pageerror across all 27 route mounts; the only allowed line is Chromium's
    own network log for the deliberate N28 503, scoped to that URL.
  - Network evidence: every request URL is captured; the run fails if any
    request leaves the Portal origin — no Rust Edge, AWS-HK, Trading System,
    or database is ever contacted (§7).
  - Journeys/baselines re-recorded to the product truth (envelope screens,
    N27 drawer, honest live gate).

## 5. Read doctrine change (report to codex)

`createHttpApi` no longer pre-blocks READS on registry delivery-policy
metadata (`readBlocked` returns null; doctrine comment in code). Registry
rev 4 still publishes `fixture`/false bits — honoring them would have faked a
refusal the server never made on every legacy-read screen. The server is the
enforcer; its refusals render verbatim. Writes keep their gate. The route
banner states the same-origin transport truth and shows the stale registry
word as drift in the inspector. Registry amendment: BR-EX-72 §4.

## 6. Reuse report

No new visual primitives. Envelope screens reuse: `StatusChip`, `PanelState`,
`ExecutionSectionTitle`, `exec-gov-panel` idiom, `exec-admin-facts`,
`exec-360-sync` tables, `exec-gate-criteriawrap` scroll-wrap, `utcStamp`.
New CSS is one small scoped block (`.exec-envelope*`) after renaming away
from a collision with the existing `.exec-profile` badge class. Lab modules
reuse the existing reviewed components unchanged.

## 7. Consolidated backend request

`BR-EX-72` — see `CLAUDE_TO_CODEX_N29_CONSOLIDATED_BACKEND_REQUEST.md`
(fleet list; bindings list/detail; canonical live-review fixture; registry
metadata amendment carrying HOTFIX_REQUEST_2026-08-30).

## 8. Confirmation of boundaries

- No backend file, `apps/control-api/**`, registry JSON/schema, or `upgrade/**`
  doc outside the frontend carve-out was edited. The consolidated request is
  PROPOSED as BR-EX-72 in the mirror doc — codex's tracking guard pins the
  §7.2 table's `_next: BR-EX-72_`, so the row insertion is codex's to make.
- §12 request-ID mapping corrections are used in frontend tracking only.
- Do-not-mark-GO respected: this packet returns
  `FRONTEND_CONSUMER_ACCEPTANCE_READY_FOR_CODEX` and nothing stronger.
