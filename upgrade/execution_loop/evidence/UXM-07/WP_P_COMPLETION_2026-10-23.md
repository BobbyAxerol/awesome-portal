# WP-P completion: scenarios, positive default, linked world, journey walker (23 October 2026)

Level: FIXTURE_LAB, not acceptance evidence. Real runtime rules unchanged (a real response with an absent source still renders typed absence); no real command transport touched; command and Live flags stay off.

## 1. Scenario table

`FIXTURE_SCENARIO` (default `positive`), switched in memory by `GET/POST /__fixture/scenario` (also `?set=<name>` from the harness page `/__fixture/review.html`, `{"reset":true}`); `/__fixture/lane` and the `X-Fixture-Scenario` header report it. `sparse-realistic` (legacy profile) ignores it. The full key-by-key matrix is register section 2p.

| scenario | built as |
|---|---|
| positive | baseline: COMPLETE/FRESH/VERIFIED, no gap, All lens complete (Paper, Sandbox, Live), healthy accounts, bindings, portfolio list, source health |
| partial | quality PARTIAL, series gap, Paper partial, legacy variety, doubles `partial` |
| stale | freshness STALE (manager reads), Paper lag, command center and blotter `stale`, accounts keep their own stale sync |
| denied | blotter, admin, users doubles 403 |
| empty | blotter, users empty, command center quiet |
| missing | the former default (everything source-dark), exact |
| zero | AVAILABLE money / percent / ratio figures of the manager reads = exact "0", series points "0" |
| dense | long names (layout-stress suffix); large numbers NOT built |

Tests asserting the former default import `src/fixtureBff/useMissingScenario.ts` (or select `missing` inside the test); none was deleted.

## 2. The world

Not built: a rewrite of the eight id universes on `positiveManagerWorld()`. Codex's survey (CONSUME NOW item 10) says not to wire that scoped-reader graph into the BFF ("replacing existing IDs with it would break routes"), so it is used as the ORACLE: `positiveWorld.test.ts` asserts the world's own tie-out (allocation + realized + unrealized = unique-account balances, shared account once, free + locked = total) next to the same identities on the lane's book.

What is one graph now (the native TEST_ONLY book, `WPC_ALPHAS`, one source):

```
alpha (alpha_a, alpha_b, alpha_c, alpha_d, alpha_btc_trend)
  -> deployment (dep_*; stage, environment, allocation, realized, unrealized)
       -> portfolio (pf_TEST_ONLY_core / satellite / canary)         dataset rows, groups, capital statement (opening = allocation, NAV = opening + realized)
       -> account: live  -> sleeve of the portfolio on the shared binding bnc_main@BINANCE (acc_bnc_core / sat / can; counted once per binding)
                   paper -> acc_pap_sim,  sandbox -> acc_tn_bnc
            Account 360 balance = allocation + realized + unrealized of the deployments booked on it (wpAccountBook), free + locked = total
  -> series: NAV / NET_PNL / RETURN / DRAWDOWN built from ONE NAV by buildPositiveManagerSeries, ending on the statement figures
  -> alpha resource (data.deployments / accounts / balances / allocations / positions) from that alpha's own deployments (was a clone of dep_live_01)
ids that no read served (acc_TEST_ONLY_operational / binance01 / binance02, pf_core / satellite / canary, inc_44) are aliased to served entities.
```

Tests: `positiveWorld.test.ts` (13), `alphaResource.test.ts` (3), `worldClock.test.ts` (16), `scenario.test.ts` (12).

## 3. Typed-absence cells per screen (walker, default `positive`, 1280, leaf cells whose own text is "Not published ...", "Not available", "Unavailable", ...)

First walker run on the rebased tree before any producer change (baseline) vs final:

| screen (journey step) | before | after |
|---|---|---|
| Overview | 5 | 1 |
| Fleet | 10 | 6 |
| Portfolio 360 | 4 | 2 |
| Alpha 360 | 9 | 7 |
| Account 360 | 7 | 12 (see below) |
| Deployment (live) | 2 | 6 (F3's lit variants are different bodies) |
| Approval r2 | 11 | 11 |
| Operations queue | 41 | 35 |
| Incident | 14 | 8 |
| Audit view | not reachable (no link) | 1 |
| total | 103 | 89 |

`missing` (the former default) walks to 109; `stale` 84. The Account 360 count went UP because the positive account now publishes the sleeve rows and the screen draws more labelled fields whose contract place is still empty (A360 product/network proof, margin ratio, "No source" cells); these are the contract gaps below, not degradations. The count is a leaf-text count, not the audit's element table.

## 4. What still has no contract place (list for K and Codex)

- V1 `/alphas` row `metrics_availability.equity_series_30d` / `max_drawdown_30d` have a state but no value field.
- `canary_twin_comparison` and the live-review `source_health` are schema consts UNAVAILABLE; the market-context benchmark (`EDS11R4_MARKET_CONTEXT_NOT_ACTIVATED`).
- Live position `leverage`, order `ack_latency_ms` (pinned null), review-capture capabilities (`SOURCE_OWNED_NOT_PORTAL_AUTHORED`).
- Alpha resource panels margin, account_sync, broker_sync, sessions, orders, fills, performance, journal: EDS04 relations not projected, so no per-alpha rows exist to derive from.
- Operations queue "Not available" x 35 (intent, display axes: OperationalQueueRowV2 is closed), incident evidence-attach and assignee routes.
- Approval evidence/receipt capture panels (`Unavailable` x 5).
- Matrix GAP-25 places (13 of 21 capital statement kinds, score_details, positions_by_side, publication catalogue route) are NOT served by me: not done.

## 5. Walker (`scripts/fixture-journey.mjs`)

Overview -> Fleet -> Portfolio -> Alpha 360 -> Account -> Deployment -> Approval -> Operation -> Incident -> Audit (a tab), following real anchors in the DOM; per screen: API 4xx/5xx (retained-review 404 known, denied 403 expected), console/page errors, back-link, overflow at 1280 and 660, typed-absence count, degraded markers in API bodies, future instants (non-deadline instants later than now+1min, preview-style rebase on), and a sweep of up to N distinct detail links.

Final run (25-link sweep per scenario): problems none in positive, denied, stale, empty, missing, zero. Overflow 0 at 1280 and 660 on all ten screens in all six scenarios; console/page errors 0; future instants 0; back-links OK. Link sweep: positive 25/81 followed, 1 failed (`/execution/operations/incidents/inc_44` from the Overview, since fixed by an alias and not re-walked), denied 2 failed (the same, plus `/governance/approvals/AP-201/r1` no render, expected under denied), stale 1, empty 0, missing 0, zero 1 (the same inc_44).

Earlier runs found and fixed: `acc_TEST_ONLY_*` and `pf_core` links that 404ed (aliases), unknown incident ids rendering (B's `KNOWN_INCIDENT_IDS`, kept), the Compare default pair (`pf_scale_001,pf_scale_006` and `alpha_scale_001,alpha_scale_006` in the harness catalog).

## 6. Not fixed / not done (be exact)

- R5-07 canary-stage deployment linked as a Live page: the link builders are in screens/account, alpha and operations (not mine); F3 answers the dark body now. Posted to F3 (no change on their side).
- Stale stamps older than the data they stamp (Canary "Fresh 11:14Z" vs chart 13:10Z): the F3 stage bodies carry their own clock, untouched.
- Cross-screen contradictions: Portfolios list "Not available" for the native Core/Satellite (they hold Paper, Sandbox and Live books, so they are MIXED domains by construction), Portfolio 360 Allocated 540,000 vs Capital panel, Overview chart vs KPI for the FUND of the double, Portfolio 360 Equity 616,125: only the dataset / statement / series / account / alpha-resource chain is tied; the portfolio double's own panels (`bffDoublePortfolios` resources and equity chart) are still their own world. The walker does not yet compare the same quantity across screens.
- The Account 360 drawer vs table sleeves count, Canary gross notional vs positions, Fleet counts 40/67/51/28/6: not looked at.
- `zero` and `dense` are first versions (no large numbers).
- Section 5 of the command story (in-memory plan/apply/status/retry): NOT built. `resetFixtureTransitions` is the empty hook the selector already calls; no fixture double models a transition I could wrap without inventing one, and the real transport is untouched.
- Matrix GAP-25/27/28 (21 statement kinds, audit breadth with roster actors, pending recall discovery keyed to the world): not done.
- Overlap with Codex WIP in the support lane: `seriesAnswer` (positive series), `capitalStatements` (opening + realized book), `rowsFor` (net PnL = realized). I merged onto Codex's commits and guarded the old behaviours with `legacy()`.

## 7. Round 2 (same day)

1. One universe. In the positive scenario the fleet and fund reads hold the native books (Core, Satellite, Canary) next to the generated ones (medium scale; not at large, where the 100-row page bound would move), so the Portfolios list, groups, capital statements, series and the Portfolio 360 equity line of a native portfolio come from the same rows. The Portfolios list prints the portfolio's own allocation, deployment count and environments (`positivePortfolioBookOf`). The shared binding publishes the sleeves that hold a book (two), counted the same in the table, the drawer and the exposure read. `dep_c1` and `dep_sandbox_01` carry small non-zero PnL (no exact zero in the positive book).
2. Ties. `scripts/fixture-ties.mjs` (run by the walker, and by `src/fixtureBff/ties.test.ts`) reads each quantity through every read that shows it: T1 list allocation = dataset allocation over the environments; T2 Portfolio 360 statement NAV and net PnL = the group figures of the fund read (Portfolios list, Compare, Overview source); T3 NAV and NET_PNL series ends = statement; T4 fund NAV = sum of portfolio NAVs per environment and currency, and the fund NAV series end; T5 allocation + headroom = approved budget; T6 Account 360 table = single sleeve reads = allocation + realized + unrealized of the deployments booked on them, drawer count = table count; T7 alpha resource allocation = Fleet rows; T8 Fleet All lens count = sum of the environments; T9 equity chart end = NAV tile; T10 Recalling = sum of the pending recalls. Final: 69 ties checked, 0 mismatches on `positive`. On `missing` the same ties report the reviewers' defects (fund NAV vs sum of portfolios, drawer 3 vs table 4, alpha resource 40,000 vs Fleet 27,500.50, All lens 51 vs 58), which shows the check detects them.
3. Lifecycle. `stageOf` and the identity keys of the stage screens resolve any deployment id the world emits (`wpDeploymentFact`); idle accounts name no deployment; `stageLifecycle.test.ts` covers every id of Fleet, Account 360 and Alpha 360. The Account 360 allocations table passes the published `stage` to `deploymentHref` (files: `screens/account/model.ts`, `screens/account/panels.tsx`; canary -> /deployments/live/<id>/canary). The alpha deployments tab and the Operations links already pass the stage.
4. Clocks. A stale Live body never draws a series point newer than its stale stamp; `exit_review_opens_at` and other `opens/review/scheduled/planned` keys are deadlines for the rebase; `worldClock.test.ts` checks series against their stamps.
5. Command story. `fixture-bff/command-story.ts`: lane-internal `POST /__fixture/command-story/plan`, `/{operation_id}/apply`, `/retry`, `GET /{operation_id}/status`; one `operation_id`, `command_key`, `request_key`, `receipt_ref`; idempotent plan by request key; UNKNOWN then retry; the audit feed carries PLANNED and APPLIED lines with the same receipt; a scenario switch or reset empties it. Only with `FIXTURE_WRITES=doubles`; the default `refuse` answers 405. Not the product routes, no real transport. It is a harness walk, not a model of a screen flow: no screen reads these routes (matrix GAP-26 waits on the schema-valid receipt).
6. Preview defaults (compose): `FIXTURE_REVIEW_PROFILE` default `populated`, new `FIXTURE_SCENARIO` default `positive`. Nothing rebuilt or restarted.
7. GAP-28 (cheap part): the pending-recall discovery of a native portfolio states one WAITING item whose pending amount is the statement's Recalling, plus an APPLIED and a REJECTED item on Core. Alpha 360 recall lifecycle events do not carry the `recall_id` yet.

Not done in round 2: the alpha double's orders / fills / replay / equity tabs are still clones (not derived from the alpha's own deployments); canary/live gross notional vs positions (F3 bodies) is not tied; Fleet tab / KPI / "How these counts relate" are tied only as far as the All lens count (T8), not in the DOM; GAP-25 (13 statement kinds, score_details, positions_by_side, catalogue route) and GAP-27 (audit breadth with roster actors) not built.

## 8. Round 3: the canonical world (QA2 root cause)

`apps/portal/frontend/e2e/bffWorld.ts` is the ONLY source of these facts in the positive-like scenarios:

| fact | rule | read by |
|---|---|---|
| clock | WORLD_NOW 17 Oct 12:04Z; the preview shifts the WHOLE world by whole days (`worldClockNow`), so one day = one set of dates | time-rebase.ts |
| price | ONE mark per symbol (`MARKS`) | positions, orders, blotter, Paper workbench, candles |
| stage history | per alpha: Paper/Sandbox/Canary/Live days and dates (`lifecycleOf`) | Alpha 360 spine, Fleet 'In stage', Live/Canary/Sandbox/Paper start dates |
| deployment | alpha, portfolio, stage, ONE account, allocation, realized, unrealized; positions that add up to its unrealized (two symbols at their marks, entry = mark -/+ pnl/qty); two working orders; net PnL series ending on realized + unrealized | stage bodies, Alpha 360 resource, blotter |
| account | exactly the deployments booked on it; ledger = allocation + realized; locked = a tenth of the allocation; equity line ends on the ledger; named by the world | Account 360, Accounts, Alpha 360 equity |
| physical binding | wallet = sum of the sleeve ledgers; native equity = wallet + unrealized; virtual used = sum of allocations; sleeve count = sleeves booked | Account 360 native panel, Accounts list, exposure |
| people | roster usr_0001..0006 (bobby, lan, minh, stan, hoa, tuan); audit actors, lifecycle events, incident timelines, Users roster, Access grants, approval requesters, alpha and portfolio owners | Users, Access, audit, approvals, Fleet owner |

Migrated to read it (positive-like scenarios only; owners keep their presentation): the four stage bodies (`bffSimulatedStage.ts` `worldStage`), the blotter orders and the Paper workbench's positions/orders/fills/equity (`bffDoubleOverview.ts` `worldBlotterBooks`, `blotterBookOf`), the account double (names, ledger, equity chart, binding exposure), Alpha 360 (`wpAlphaResource`, orders/fills/equity in `bffDoubleAlpha.ts`), the Alpha Fleet header (`bffDouble.ts` world fleet), the Users roster, the candles, the capital statement drawdown.

DOM ties (`scripts/fixture-dom-ties.mjs`, run by the walker): the Portfolios register row vs the Portfolio 360 tiles (NAV, net PnL, return, drawdown), the 360 tiles vs its Capital panel, Live page vs Alpha 360 (account, allocation of dep_live_01), Account 360 sleeve count vs its table, and a blotter scoped to a deployment holding orders. The walker also fails when a screen's text says ACCOUNT_NOT_FOUND, 'not in the projected population', 'No loaded order matches', undefined, NaN or a *_NOT_FOUND code. First run found real mismatches (the 360 drawdown tile was one constant for every portfolio; the account of dep_live_01 differed): fixed. Final: 100 ties checked (API + DOM), 0 mismatches, 1 skipped (Fleet row not found by text: P5 stays API-tested in `worldStage.test.ts`).

QA2 blockers: R1-01 FIXED (register/360/Compare NAV, drawdown, state from one statement; ties T2, P1); R1-02 FIXED for the Capital panel/tile/Allocated chain (ties T5, P2), the Allocations tab's 'Allocated (current) 460,000 vs approved 270,000' is the portfolio double's own table and was NOT re-derived; R1-03 NOT FIXED (alpha score/return/PnL differ between Overview contributors, Alpha 360 and Compare: three different producers of 'Score' and 'Return'; needs a contract decision on what a contributor row states); R2-01 FIXED (dep_live_01 is one account, one allocation, one start on Alpha 360, Live and Account 360: ties P3); R2-02 NOT FIXED here (presentation: the Alpha 360 headline sums Paper + Sandbox + Live; rule for WP-C: per environment, never summed across economic domains); R2-03 FIXED (Fleet days in stage = Alpha 360 spine); R2-05 FIXED (whole-day clock; newest event not later than now); R4-01 NOT FIXED (registry route, F2/D); R4-02 FIXED (blotter holds orders for the world's deployments; the 'environment Paper' chip on a Live link is a link builder, F2/F3); R4-03/R4-04/R4-06/R4-07 FIXED (account name, ledger = equity line, sleeve count, one price per symbol); R4-05 FIXED (the sandbox account is `acc_tn_bnc`); R4-10 FIXED (bindings updated within hours, physical figures from the sleeves); R5-01 FIXED (live/canary/sandbox breadcrumb accounts are world accounts); R5-02 FIXED for the data (scoped blotter has rows), the Paper scope chip on a Live link NOT FIXED (F2/F3); R5-03 FIXED for the data (a finished trial holds nothing open, dated before the Live activation); R5-04/R5-05 FIXED for allocation, PnL, age (R5-04) and the canary deployment being in its own alpha (dep_canary_01 is dep_b3 of Basis B); the sandbox `dep_canary_01` of SX-14 is F3's lineage link. Not looked at: R4-08 raw ids in copy, R4-09 1024 columns, R4-11 FE-ticket ids in copy, R4-12 blotter table quality, R4-13/R4-14 (Paper band, Sandbox timeline times), R5-06, R5-07 (FE/CONTRACT).
