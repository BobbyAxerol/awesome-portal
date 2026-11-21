# WP-C completion: Alpha 360, Trade replay, Compare (2026-10-23)

Lane FIXTURE_LAB. Owner: Bobby's directive of 2026-10-23 (fill the UI with rule-bound fixture data where the real API has none, record every simulated fact, keep the real API going in parallel). Nothing here is source acceptance. Audit baseline: `PREVIEW_VS_ARTIFACT_AUDIT_2026-10-23.md` sections 5, 6, 14 and 6(d) A6, A7, A11, B4, B5. Simulated facts: register section `## 2c-wpc` in `SIMULATED_DATA_REGISTER_2026-10-22.md`.

Design names: `alpha-mgr` (Alpha 360 wire/v1), `hl-alpha-spine`, `hl-alpha-ribbon`, `trade-replay-mgr`, `hl-replay`, `hl-replay-none`, `compare-mgr`, `hl-compare`.

## 1. What changed, in one table per screen

| Screen | What is now on the screen | Where it comes from |
|---|---|---|
| Alpha 360 spine | R1, R2, Paper, Sandbox, Canary, Live with "Approved 28 May / By bjones", "29 days in stage, 7 of 7 criteria met, Exit 12 Jul · lnguyen", Live "15 days in stage, No exit gate, Decides: Manager"; the Live / In Sandbox / Blocked toggle (Live is the alpha's own; the other two are a labelled preview) | open partition keys `life_*` of the ALPHA dataset row (register 2c-wpc); read by `screens/alpha/lifecycleModel.ts`; absent keys leave the old "Not published (FE-027/028)" note |
| Alpha 360 tiles | Return, Max drawdown (already wired, now served for the default subjects), Regime fit (ratio or typed `Insufficient data`, "Separate from score", Open link), QBTS (WP-A's `score` + `qbts_*` keys through `qbtsOf` / `QbtsCell`; the header chip and the Score drawer print the same published figures) | dataset keys; no figure computed on the page |
| Alpha 360 chart | the event ribbon (Stage, Decision, Incident, Recall, Flow lanes, kind chips with counts, stage bands from the published spans) pinned on the Performance chart, the same ribbon on Activity & Decisions; drawdown strip as a typed absence (`Not published (FE-025)`); Events table now carries actor (receipt stays typed) | `evt_*` keys + the observed timeline (command-journal rows on the Decision lane) |
| Alpha 360 panels | cost drag (fees, funding, slippage with its typed absence) and Forward observation (forward days) from the dataset; "Manifest conditions" disclosure (typed) | existing keys, now served for alpha_a, alpha_btc_trend and the other native ids |
| Trade Replay | its own screen at the same address (`?tab=replay`, deep links with `focus=` unchanged): own title, "Fills on candles" subtitle, alpha / deployment / account chips; STAGE / DECISION / INCIDENT lanes under the chart with "n of m fills in this window" and "k events in this window"; the "Design preview: Candles available / not available" toggle reaches the honest candles-not-available state (banner, log and lanes stay); order ids in the log are links to Orders & Fills (`focus=order:<id>`); the price axis is the candles' own because the review-lane candles now cover the band the trades print in | `ReplayLanes`, `ReplayView`, `AlphaReplay`; `wpcCandles` (review lane only) |
| Compare | Portfolios / Alphas subject tabs; overlay draws for comparable pairs (aligned series per partition, end tags, readout, basis line) and ends on the number the table prints (the table now asks the page window); metrics table NAV, Net PnL, Return, Max drawdown, Score (the register's published `portfolio_score` with band and evidence); best-in-row square by exact decimal comparison; freshness chip; subtitle `2 to 4 · USDT · <methodology>` when the series published a common basis. Incomparable pairs keep the typed state | `review-manager.ts` WP-C section (series shaped per subject), `AlphaCompare.tsx`, `bestIndexes` |
| Default audit subjects | `alpha_a`, `alpha_btc_trend`, `alpha_b`, `alpha_c`, `alpha_d`, `pf_TEST_ONLY_core`, `_satellite`, `_canary`, `_yen`, `_empty` answer on the review lane (medium and large scale) instead of a 404; an environment with no deployment is a 200 with no rows | WP-C section of `fixture-bff/review-manager.ts` |

## 2. Element table (board section 4)

State: DATA (figure or structure drawn from a published reader; FIXTURE_LAB where the register says so), TYPED (absence is legal and typed), BLOCKED (named blocker).

### 2.1 Alpha 360 (32 elements)

| # | Element | State | Note |
|---|---|---|---|
| 1 | Context bar (env, window, basis, scope) | BLOCKED | FILE_OWNED_BY_OTHER_WP: shell (WP-D). Request already on the board (B to D); WP-C did not touch `shell/**` |
| 2 | Back link | DATA | |
| 3 | Title + version chip | TYPED | `Not available: Name, Version, Run, Evidence` (the resource publishes none; FE-066 / FE-029) |
| 4 | Not-scored chip | DATA | `QBTS 82.8 · Good` from the dataset when published, else `Not scored · policy not set` |
| 5 | Owner / run / evidence revision / portfolio meta | TYPED | owner and portfolio drawn; run and evidence typed (FE-029) |
| 6 | Freshness chip | DATA | |
| 7 | Journey spine, six stage cards | DATA | `life_*` keys, FIXTURE_LAB |
| 8 | Days in stage per stage | DATA | |
| 9 | Criteria meter | DATA | 7 of 7 for a completed stage |
| 10 | Who decides / exit date and actor | DATA | |
| 11 | Stage-state tabs Live / In Sandbox / Blocked | DATA | the other two states are a labelled preview of how the spine reads |
| 12 | "Live now" panel | DATA | |
| 13 | KPI Net PnL actual | DATA | |
| 14 | KPI Return | DATA | `return_30d_pct` per partition |
| 15 | KPI Max drawdown | DATA | |
| 16 | KPI Regime fit | DATA | ratio, or typed `Insufficient data` for one alpha in three |
| 17 | Tabs | DATA | |
| 18 | Basis tabs Actual / Forward simulated / Research OOS | DATA | |
| 19 | Equity chart with end tag | DATA | 120 daily closes on the review lane |
| 20 | Chart drawdown strip | TYPED | `Not published (FE-025)`; request to K (drawdown series) |
| 21 | Event ribbon on the default Performance view | DATA | |
| 22 | Ribbon kind chips with counts | DATA | |
| 23 | Five lanes with pinned markers | DATA | a kind with no source is a named gap line (`Not published (FE-031)`) |
| 24 | Stage band under the chart | DATA | from the published exit and days; a band narrower than its word prints no clipped word |
| 25 | Events table with actor and receipt link | DATA | actor drawn; the receipt link stays `Not published (FE-021)` (CONTRACT, request to K) |
| 26 | Contribution by venue bars | BLOCKED | CONTRACT: per-venue split (summing deployments per venue on the client is forbidden); request to K posted |
| 27 | Cost drag fees / funding | DATA | |
| 28 | Cost drag slippage | DATA | one row in four is the typed absence |
| 29 | Forward observation 70D/10D bars | TYPED | forward days drawn; actual days, mixed return and mixed score typed |
| 30 | Mixed return / Mixed score rows | TYPED | |
| 31 | Manifest conditions disclosure | TYPED | disclosure drawn, content `Not published (FE-029)` |
| 32 | "n charts not available yet" footer | DATA | |

Counts: DATA 24 (2, 4, 6-19, 21-25, 27, 28, 32), TYPED 6 (3, 5, 20, 29, 30, 31), BLOCKED 2 (1, 26).

### 2.2 Trade Replay (18 elements)

| # | Element | State | Note |
|---|---|---|---|
| 1 | Own screen with title and "Fills on candles" subtitle | DATA | |
| 2 | Context bar | BLOCKED | FILE_OWNED_BY_OTHER_WP: shell (WP-D) |
| 3 | Context links chips (alpha, deployment, account) | DATA | |
| 4 | Freshness chip | DATA | |
| 5 | Design-preview toggles | BLOCKED | DESIGN_DECISION: "Candles available / not available" is drawn and works; the State row (Normal, Loading, Empty, Partial, Stale) is a design aid whose states are reached by real reads; Bobby decides whether the row is wanted as a control |
| 6 | Symbol select | DATA | |
| 7 | Interval select | DATA | |
| 8 | Marker legend | DATA | |
| 9 | Last candle / fills in view / step hint | DATA | the panel prints bars, fills, legs, the mark price and the step hint; the design's separate "Last candle" figure is the mark here |
| 10 | Candlestick chart with fill markers | DATA | axis is the candles' own (see section 4) |
| 11 | TP/SL lines and position boxes | DATA | off-scale TP/SL are pinned to the edge with their value |
| 12 | Event lanes STAGE / DECISION / INCIDENT | DATA | |
| 13 | Chart footer counts | DATA | "n of m fills in this window", "k events in this window" |
| 14 | Trade log table | DATA | |
| 15 | Order id chips linking to orders | DATA | |
| 16 | Show all N events / Showing newest 10 | DATA | the log's own "n of m events shown, newest first" and "show older events" |
| 17 | "How this is built" disclosure | DATA | |
| 18 | Candles-not-available state | DATA | reachable from the preview toggle |

Counts: DATA 16, TYPED 0, BLOCKED 2.

### 2.3 Compare (15 elements)

| # | Element | State | Note |
|---|---|---|---|
| 1 | Context bar | BLOCKED | FILE_OWNED_BY_OTHER_WP: shell (WP-D) |
| 2 | Title + subtitle | DATA | subtitle when the series published a common basis |
| 3 | Freshness chip + Back to Portfolios | DATA | |
| 4 | Subject tabs Portfolios / Alphas | DATA | Alphas overlay is typed (request to K) |
| 5 | Metric tabs | DATA | NAV, Net PnL, Return |
| 6 | Candidate chips | DATA | |
| 7 | Overlaid multi-line chart with end tags | DATA | comparable pairs; INCOMPARABLE and mixed-domain pairs get the typed state |
| 8 | End-value readout line | DATA | |
| 9 | Chart footer | DATA | basis line and envelope caption |
| 10-14 | Metrics table NAV, Net PnL, Return, Max drawdown, Score | DATA | the page window is asked, so table and chart agree |
| 15 | Best-in-row square | DATA | exact decimal comparison |

Counts (the audit numbers rows 10-14 one each): DATA 14, TYPED 0, BLOCKED 1 (1).

### 2.4 Totals (65 elements)

DATA 54, TYPED 6, BLOCKED 5 (context bar x3 FILE_OWNED_BY_OTHER_WP, contribution by venue CONTRACT, preview State row DESIGN_DECISION). Audit baseline for the same 65: DATA 19, TYPED 17, PARTIAL 19, MISSING 10.

## 3. Fixture section and files touched in shared code

`apps/portal/fixture-bff/review-manager.ts`, section `// ===== WP-C begin/end` at the end of the file. Shared functions touched, one expression each: `seriesAnswer` (the known-portfolio map, one call after `entry.gaps`), `rowsFor` (optional last parameter `only`), `datasetAnswer` (the `rowsFor` call and the 404 test), `answerReviewManager` (one wrapper chain). WP-A's `components` parameter of `rowsFor` was kept; the rebase conflict was resolved by adding `only` after it. Other shared files, additive: `blocks/JourneySpine.tsx` (a completed running stage prints its days, criteria meter and exit line; gate cards unchanged), `components/TradeReplayEvents.tsx` (optional `lanes` and `orderLink`), `charts/EventRibbon.tsx` (a band prints its word only when it fits), `scripts/layout-audit.mjs` (five route lines), `css/alpha.css` and `css/compare.css` (own screens).

The e2e doubles and their golden are untouched (`wpcCandles` and `wpcEquity` run on the review lane only); the small scale keeps its pinned SUITE answer.

## 4. Replay axis, and why the candles were squashed

The audit saw candles in the bottom band of an axis from 67,150 to 67,450. The doubles' candles walk around 67,190 while the book's trades print up to 67,411, so a fill sat 200 above the candles and the autoscale stretched to hold it. The cause is the data, not the chart: a fill must lie on its candle. The review lane now serves candles that wander (mean-reverting integer cents) around the band the trades print in; TP 68,500 and SL 66,100 stay off-scale and are pinned to the edge with their value, as the V1 chart already does for levels with candles on.

## 5. Tests (exact commands and counts are in the final report)

New: `fixtureBff/wpcFixture.test.ts` (16), `alpha/lifecycleModel.test.ts`, `alpha/alpha.preview.test.tsx` (7), `blocks/journeySpineDone.test.tsx` (3), `compare/compare.preview.test.tsx` (5), additions to `compare/model.test.ts` and `charts/EventRibbon.test.tsx`. Updated: `alpha.test.tsx`, `alpha.scoped.test.tsx`, `replay/replay.test.tsx`, `compare/compare.test.tsx` (the behaviours that changed on purpose: replay is its own page, the Performance chart reads the timeline and draws a typed drawdown pane, Compare has the subject tabs and the freshness chip).

## 6. Not verified / open

- Real Edge answers: nothing here proves what the control-api returns for any of the open keys.
- Visual baselines were not recorded (board rule); layout numbers are from the local audit stack, not the preview.
- The Alphas tab overlay, the drawdown pane, the receipt link, per-venue contribution and the shell context bar wait on the requests in BOARD section 5.

## 7. Layout numbers (scripts/layout-audit.mjs, widths 1440/1280/1024/660/390)

Cell format: overflowPx / clipped / wrapped figures / font outliers. Before = the running preview (port 8095, read only, `--base-url`), label `wpc-before`; after = a local build of this branch with the fixture BFF, label `wpc-final`. Findings JSON and screenshots are in the session scratchpad (`wpc-layout/`), not in the repo.

| Route | Before (all widths) | After (all widths) |
|---|---|---|
| alpha-360 (`alpha_a`) | 0/0/0/1, 390: 0/0/1/1 | 0/0/0/1, 390: 0/0/1/1 |
| alpha-360-btc | 0/0/0/1, 390: 0/0/1/1 | same |
| alpha-activity | 0/0/0/0, 390: 0/0/1/0 | same |
| alpha-replay, alpha-replay-btc | 0/0/0/0 | 0/0/0/0 |
| alpha-orders | 0/0/0/3 (660, 390: 2) | 0/0/0/0 |
| alpha-deployments | 0/0/0/1 | 0/0/0/0 |
| compare (Core + Satellite) | 0/0/0/12 | 0/0/0/2 |
| compare-pair (Satellite + a generated USDT book) | 0/0/0/12 (no series then) | 0/0/0/2 |
| compare-alphas (new tab) | not drawn | 0/0/0/0 |

What the remaining numbers are: the one font outlier on the Alpha 360 routes is the "Not available" button of the Return/Windowed absence that existed before; the 390 wrapped figure is the chart readout "Change across the plotted points +812.00 USDT" (existing). The two outliers on Compare are the State flag chip "Active" at the flag size (11px), a chip by design in every table. Along the way the audit found and this branch fixed: stage-band words clipped on the ribbon (now printed only when the band fits), end tags cut off at the right of the Compare overlay for money series (the margin now follows the longest tag), typed absences at the caption size inside the Compare table (now 13px like the figures beside them), partition tags at 12px in the Alpha 360 figure tables, and the Alphas tab lines running together.

## 8. Tests run (this branch, worktree /home/bobby/portal/.claude/worktrees/agent-a41bebe538f3a7aa8)

See the final report of the agent for the exact commands and counts; `npx tsc --noEmit -p .` exits 0 (run separately, with the roadmap-task-board node_modules linked). Known red on the lane tip, not WP-C: `titleAbsence.test.ts` names three Fleet titles (WP-A files); `fleet/fleetStream.test.tsx` "flag off" failed once under load and passes alone.
