# R-C consumers: equity projection on the existing charts (2026-10-29)

Agent B-P2, branch `claude/ft-fe` on `claude/slice-followthrough@02cc16b91`. Lane: FIXTURE_LAB. Not a real-API, browser or acceptance receipt. Codex handoff: `CODEX_TO_CLAUDE_RB_RC_FOLLOWTHROUGH_2026-10-29.md`, R-C item 3 and the reader-URL paragraph.

## 1. The reader URL now carries the workspace

- `equityProjectionUrl` / `EquityProjectionQuery.workspaceId`: optional, validated `^[A-Za-z0-9._-]{1,128}$`, sent as `workspace_id` after `window` and `intent`; an invalid one sends nothing (`INVALID_REQUEST`). The body carries no workspace, so the boundary is the request; the port passes the page's workspace (`?workspace_id` of the URL, else the screen prop).
- Fixture route (`fixture-bff/equity-projection.ts`): `workspace_id` is accepted for the home (`ws_TEST_ONLY`) and scoped (`ws_TEST_SCOPED_V2`) workspaces with the same body; `ws_TEST_DENIED` is 403 `ACCESS_DENIED` (checked before the deployment, so a denied workspace learns nothing about an id); any other workspace is 404 `EXECUTION_DEPLOYMENT_NOT_FOUND` (not this deployment's, no existence oracle); a malformed id is 400. Denial is simulated, not a live authorization or revoke receipt.

## 2. Screens that now consume the projection

Existing components only (`ChartTools` + `EquityPanel`; no component, layout or token change). New: `screens/series/useEquityProjection.ts`, `equityProjectionModel.ts`, `EquityProjectionSection.tsx` (an adapter, not a chart), mounted once in each screen:

| Screen | Where | Asked for |
|---|---|---|
| Live room | under the chart slot, in the main column | `deploymentId`, page workspace; NOT asked while the page hides its chart (broker/internal mismatch, gap) |
| Canary control room | under the Deployment series panel | `deploymentId`, workspace (URL wins) |
| Paper workbench (Overview tab) | under the Overview body | the deployment, workspace from the URL |
| Alpha 360 (Performance, Actual view) | under the Performance tab | the deployment the link names (`?deployment_id`), else the only deployment of the book in view; with several nothing is asked (no pick, no sum) |

Rendering: equity line from the reader's output (a null equity is a gap, never zero); drawdown pane from the projection's own fraction moved to percent in the text; the panel's band is one lo..hi pair, so the time-varying band is drawn as its range over the window, only when the body carries a band joined to the series' run id and digest. Every projection is labelled `Fixture projection` (panel head flag, chart name, caption) with a note that it is not a source reading; the band is named `Illustrative band (fixture), not an approved band`. The V1 reader refuses `runtime_active: true`, so a real-source body cannot be shown here.
Answers: `idle` / `loading` / 404 / 501 / 5xx / network / port without the method: nothing new (the screen keeps its own typed absence); 403: `Not shown: Fixture projection ... denied`; another deployment or window: `MISMATCH`; band of another run, an unreadable body or `runtime_active` true: `UNREADABLE` with the named refusal (e.g. `[band_lineage]`); another contract version: `UNSUPPORTED_SHAPE`.

The e2e double (`e2e/bffDouble.ts`, `WP-R-C` markers, 5 lines) answers the source-dark route with the real API's typed 404, so the browser cells (which fail on any 501 gap) keep the typed absence they have today.

## 3. Tests (all green)

| Scope | Result |
|---|---|
| `live.projection.test.tsx`, `canary.projection.test.tsx`, `workbench.projection.test.tsx`, `alpha.projection.test.tsx` (new). Each: populated, no-band body, missing (404, 501, network, throwing client), unauthorized, mismatch (deployment id; band lineage), real-source body refused, long series (5,000 points: at most 400 extra DOM nodes over a 6-point panel, under 1,200 in the panel). Live also: hidden chart asks nothing; Canary: request shape; Alpha: several deployments ask none, a single-deployment book asks for it, other tabs ask nothing | live 10, canary 9, workbench 8, alpha 12 passed |
| `equityProjection.conformance.test.ts`: workspace in URL and fetch | 61 passed (+3) |
| `src/fixtureBff/equityProjection.test.ts`: workspace boundary (home/scoped same body, denied 403 before lookup, other 404, malformed 400) and the double's 404 | 16 passed (+5) |
| `readerConformance.test.ts` W125 with the workspace query shapes (none, home, scoped) per Fleet deployment | 28 passed |
| Combined run: `src/fixtureBff`, screens live/canary/workbench/alpha/series, `v2/charts`, `equityProjection.conformance`, titleAbsence, ticketGuard, v2Hygiene, boundary, absentValues, failClosed, productBoundary, disabledReason | 124 files (2 skipped), 4,369 passed, 6 skipped; the one failure was a 20 s timeout of the all-deployments route test under load, fixed with an explicit timeout and re-run alone: 16 passed |
| `tsc --noEmit -p .` (one complete background run) | no error outside `features/roadmap-task-board` (worktree dependency noise) |

## 4. Visual cells (`e2e/execution-v2-visual.spec.ts` CELLS), not re-recorded

The spec stubs the BFF with `bffDouble`, which now answers 404: no pixel changes in the CELLS. On the fixture BFF lane (preview) the panel appears, so these cells would change there: `live` (`/deployments/live/dep_live_01`), `canary` (`/deployments/live/dep_canary_01/canary`), `workbench-paper` (`/deployments/paper/dep_paper_01`), and the alpha cells only if the book in view holds one deployment or a link names one: `alpha-360-overview` (`alpha_btc_trend`, Performance) is not affected by default. If the cells are ever run against the fixture BFF, these three baselines need review, not blind re-recording.

## 5. Not covered

No browser or visual run; no real API (the real route is source-dark and returns 404/501, shown as the existing typed absence); the band is drawn as a window range, not per bucket (the existing panel takes one lo..hi pair; a per-bucket band needs a component change that was not requested); Alpha 360 asks nothing for a book of several deployments; Sandbox, Portfolio and Account screens are not consumers; workspace denial is simulated.
