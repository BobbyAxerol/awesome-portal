# Reader conformance over the fixtures, 28 Oct 2026 (step B-T2)

Why: the last browser round found two blockers of the same class that no test caught. The fixture served a body that the screen's own CLOSED V2 reader
refuses, so the page printed "Unavailable: ... could not be read" (the portfolio register after the health-basis change; the Operations queue for
`?target_id=dep_live_01_mismatch`). The cross-page ties (`worldTies.test.ts`) read the served JSON; they never ran the screens' readers.

## The guard

`apps/portal/frontend/src/fixtureBff/readerConformance.test.ts` starts the real fixture server in-process (populated profile, positive scenario, medium scale, the
way `worldTies.test.ts` does) and points the screens' own port at it: `createHttpApi` (`src/execution/api/httpApi.ts`), with `fetch` redirected to the server. Every
port method parses the served body with the screen's closed reader (`v2/readers/*`, the `api/*` adapters) and answers `ok:false`, or an `unsupported` answer, when
the reader refuses. The test calls the port for every V2 screen read, with the query shapes taken from the screens' hooks (see below) and with the ids the served
bodies link to (a crawl), and asserts the answer is accepted. It edits no double and no reader.

Run: `cd apps/portal/frontend && nice -n 10 npx vitest run src/fixtureBff/readerConformance.test.ts --maxWorkers=2` (about 50 s). `READER_CONFORMANCE_REPORT=/path.json`
writes every verdict (group, call, reason, the URLs it fetched with their status).

What counts as a rejection:

- `ok:false` whose reason says the body could not be read (`could not be read`, `MALFORMED`, `HTTP_5xx`, `not one the Portal accepts`, a thrown error), or an `unsupported` answer (`V2_MALFORMED`, an unknown `schema_version`).
- A typed refusal that carries the server's own code (404 `ACCOUNT_NOT_FOUND`, 503 `ANALYTICS_UPSTREAM_ROUTE_ABSENT`) is the reader working: it is accepted and listed as a refusal, except on the target of a link (Fleet row to Alpha 360, any crawled href, the incident drawer's root), where a refusal is a dead link and counts as red.
- The N22 refusal (a blotter stage other than PAPER) must come back as a typed refusal; a body or a "could not be read" is red.

## Mechanism for a red (same as `OPEN_TIES`)

`OPEN_GROUPS` at the top of the test: one defect, one group, so a known red never hides a new one. A listed group runs as `it.fails`; it passes while red and fails
with `now green: delete <ID> from OPEN_GROUPS` once fixed. A red group not listed fails as a regression. A listed group that reads nothing fails.

## Where the query shapes come from

Read from the hooks, not guessed: portfolios register `portfolios/index.tsx` (FLEET, `group_by=portfolio_id`, `limit 1`, the URL window) and `listPortfolios`; fleet
`fleet/useFleetDataset.ts`, `fleetDatasetModel.ts`, `useFleetOptions.ts`, `useFleetSparks.ts`; alpha `alpha/useAlphaReads.ts`, `DatasetFigures.tsx`,
`stage/useStageLifecycle.ts`; portfolio 360 `portfolios/portfolio/use360.ts` (statements and contributors groupings, NAV / Net PnL / Return series); compare
`compare/useCompareDatasets.ts`, `AlphaCompare.tsx`; operations `operations/index.tsx` (`queryFor`), `IncidentRootDrawer.tsx`, `IncidentPage.tsx`, `AuditPanel.tsx`,
`PendingRecalls.tsx`; approvals `screens/containers.tsx`, `cockpit/EvidenceFrame.tsx`, `evidenceExtra.tsx`; blotter `blotter/index.tsx`, `ports.ts BlotterQuery`;
accounts `account/reads.ts`; users `users/rosterReader.ts`; overview `overview/useOverviewReads.ts`, `useVisitDigest.ts`; shell `shell/entitySearch.ts`, `navCounts.tsx`,
`access/useRootCapitalEligibility.ts`. Links: every `href` (and route-looking string) of every 200 body the run read, normalised with the screens' own `canonicalHref`
(`execution/links.ts`), mapped to the reads of the target screen; 173 distinct hrefs, 22 without a read of their own (tab lists, `/approvals`, `/governance/approvals/new`, ...);
route templates with `:param` (from the screen catalogue) are excluded.

## Coverage (2,251 reads, 23 groups)

| Group | Reads (route x reader) | Result |
|---|---|---|
| W110 | `getManagerDataset` FLEET `group_by=portfolio_id`, 3 environments x 3 windows x 2 page sizes | GREEN 18 |
| W110k | `listPortfolios` (`GET /portfolios`), with and without `workspace_id` | RED (known, B-A3) 2 of 2 |
| W111 | `getAlphaFleet` (plain, search, stage x4, owner, health), `getManagerDataset` FLEET (4 scopes incl. ALL, filters, group_by alpha, q, stage_filter), `getEquitySparklines` | GREEN 31 |
| W112 | per Fleet alpha (45): `getAlpha360ResourceVersioned`, `getAlphaLifecycle`, ALPHA datasets, `getAlpha360Resource`, `getSubjectActivityVersioned`, `getFinancialChart`, `getAlphaActivity`, `getObservedTimeline`, `getStageDrift`; `getMarketCandles` | GREEN 522 (4 typed refusals: sandbox equity 503) |
| W113 | per portfolio (30): `getPortfolio360Resource`, PORTFOLIO datasets (3 environments x 2 groupings); series NAV / Net PnL / Return, capital, ledger, correlation, cross-equity (6); FUND datasets and series x 3 x 3; compare series | GREEN 277 (15 typed refusals: correlation 503, documented) |
| W114 | `listOperationalQueueV2` (plain, `limit 1`, triage lens, 10 filters, every target the queue lists, the base target ids), `getIncidentRootV2`, `getIncidentChildren`, `getOperationsAudit`, composition `operations` | GREEN 66 |
| W114k | the same queue read for `dep_*_mismatch`, `_gap`, `_stale`, `_dark` (every Live and Canary deployment), and the links the variant rooms emit | RED (known, B-S3) 35 of 119 |
| W115 | `listApprovals` (4 filters x 2 workspaces), `getApprovalHistory`, per queue row (40): `getGateR1`, `getGateR2`, `getLiveReview`, `getGovernanceParent` in 3 workspaces, `getApprovalEvidence`; `getWaivers`, `getReviewCaptureCapabilities`, `getPaperExitParent` | GREEN 41 |
| W116 | `getBlotterProfile`: unscoped, filters, deployment / alpha / account scoped (incl. variant ids), `stage=PAPER` (+ deployment, + alpha), the N22 refusal for SANDBOX / CANARY / LIVE; `getScreenProfile`, `getOrderFunnel`, `getConditionalGroup` | GREEN 72 |
| W117 | `getBindings` (3 environments, search), `getBindingDetail` / `Resource` / `Exposure` (18 bindings), `getAccount360Resource`, `getAccountBroker360`, `getSubjectActivity`, `getObservedTimeline` for 5 accounts | GREEN 80 |
| W118 | `readRosterPageFromServer` (10 query shapes), `readDetailFromServer` | GREEN 17 |
| W119 | every Fleet deployment (80) and every variant the screen defines: `getPaperWorkbenchProfile` (+ vnm), `getSandboxCertificationVersioned`, `getCanaryVersioned`, `getLiveFullVersioned` (home and `ws_TEST_ONLY`), the legacy room readers, `getDeploymentQuality` | GREEN 812 |
| W120 | `getOperationalComposition` command-center, `getCommandCenterSnapshot`, `getVisitDigest`, `getSourceHealth*`, `getOperatorTasks` | GREEN 10 |
| W121 | `getRunLibraryAlphaCataloguePage` (FE-069) | GREEN 1 |
| W122 | `getSelfContext`, `getSelfEligibilityBatch`, `getStageActionEligibility`, `getCommandCatalogue`, manifest, contracts, activation, mirror integrity, composition `admin-action-drawer` | GREEN 13 (1 typed refusal) |
| W123 | crawl, per link kind: alpha 360 (resource, lifecycle, dataset), portfolio 360, account, Paper / Sandbox / Canary / Live rooms, blotter scope, operations queue, incident root and children, approval R1 / R2 / Live, exit review | GREEN 112 |
| W124 | text scan of every 200 body the run read for `undefined`, `null`, `NaN`, `[object Object]` as an id, a link segment or a label | GREEN (no hit) |
| W126 | informational: `getIncident` (the V1 detail the drawer asks for best effort) is refused for all 6 incident ids | INFO 6 of 6 |
| W127 to W131 | the new reds below | RED (new) |

## Reds

Known (kept as named known-red groups): 

- W110k, `GET /portfolios` -> `listPortfolios` (closed list reader): "The portfolio register response could not be read." Served with HTTP 200 in both workspaces. B-A3.
- W114k, `GET /operations?target_id=dep_live_01_mismatch` (and `_gap`, `_stale`, `_dark`, and the same for every Live / Canary deployment, e.g. `dep_scale_001_mismatch`) -> `listOperationalQueueV2` (`readOperationalQueueV2`): "The operations queue response could not be read." Served with HTTP 200. The plain `target_id=dep_live_01` is accepted. B-S3.

New (found by this guard on the tip, each registered as its own open group; owners are proposals):

| ID | Route | Reader | Reason | Owner |
|---|---|---|---|---|
| W127 | `GET /search?q=carry` (and `core`, `AP-352`; `workspace_id=ws_TEST_ONLY`) | `readEntitySearchV1` via `searchEntities` | HTTP 200 body refused: the `approval` group repeats a hit id (`AP-352` twice; `AP-101` also) and the reader rejects a duplicate id inside a group (ES-3). Cmd K shows "could not be read" for every query that reaches the approval group. | B-A |
| W128 | `GET /pending-recalls?resource_kind=PORTFOLIO&resource_id=pf_TEST_ONLY_core&environment=live` | `readPendingRecallDiscoveryV1` via `getPendingRecallDiscovery` | HTTP 200 body refused and not valid against its published schema: `items[1]` has `amounts`, `versions`, `latest_receipt_id`, `last_known_command_id` where the schema wants null, a null `unresolved_command_id` where it wants a string, and a `state` outside the enum. The other 7 targets are accepted. | B-O |
| W129 | `GET /resources/alphas/{alpha}?workspace_id=ws_TEST_SCOPED_V2` (every alpha: 39 of 40 read, 3 asked in the final run) | `readAlphaResourceByVersion` (v2) via `getAlpha360ResourceVersioned` | HTTP 200, `schema_version execution.alpha-resource.v2`, answered `unsupported: V2_MALFORMED`. Only in the scoped workspace lane (`ws_TEST_SCOPED_V2`). | B-S |
| W130 | `GET /deployments/{id}_dark/certification` and `/canary` with `workspace_id=ws_TEST_SCOPED_V2` (22 ids: `dep_c1_dark`, `dep_sandbox_01_dark`, `dep_canary_01_dark`, `dep_scale_005_dark`, ...) | `getSandboxCertificationVersioned`, `getCanaryVersioned` | HTTP 500 "The request failed." from the fixture server for the `_dark` variant in the scoped workspace; the non-variant ids and the `_dark` ids in the home workspace are fine. | B-S |
| W131 | `GET /resources/alphas/alpha_e`, `/alphas/alpha_e/lifecycle`, `/manager/alphas/alpha_e/overview` | `getAlpha360ResourceVersioned`, `getAlphaLifecycle`, `getManagerDataset` ALPHA | `alpha_e` is a row of `GET /alphas` (the Fleet links to it) and all three answer 404 `EXECUTION_READ_NOT_AVAILABLE` ("not in the selected universe"): the Fleet row opens a dead Alpha 360. | B-A (Fleet) / B-S |

Observations that are not reds (listed so nobody re-discovers them): `getCorrelation` answers a typed 503 for every portfolio (documented in `ROUTES.md`: no source route);
`getFinancialChart` for the four sandbox alphas answers 503 "The sandbox equity history is not reachable"; the root eligibility batch answers 404 for a root the grants do not
name (the Access screen only asks when a grant names a root); `getIncident` (V1 detail) refuses all six incident bodies, which the drawer tolerates by design (W126).

## What this does not cover

- It runs the closed reader over the served body; it does not render the screen. A body the reader accepts can still be shown wrongly (that is the DOM walker's and the screenshots' job).
- Reads that exist only as writes (approval create, decisions, command plans, acknowledge / resolve) are not called: the fixture stores nothing.
- Query shapes were taken from the hooks by reading; a screen that builds a query this file does not mirror is not covered until it is added (the crawl covers every link a body emits).
- Streams (`/stream` event bodies) are not read.
- The first 45 Fleet alphas, 30 portfolios, 40 approvals, 80 deployments and 12 incidents are read per run.
