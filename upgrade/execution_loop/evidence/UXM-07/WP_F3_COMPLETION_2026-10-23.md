# WP-F3 completion: Paper workbench, Sandbox, Canary, Live (2026-10-23)

Lane FIXTURE_LAB, not acceptance evidence. Scope: audit sections 9, 11, 12, 13 of `PREVIEW_VS_ARTIFACT_AUDIT_2026-10-23.md`, item B9 of 6(d), highlights 13 to 16. Rule from Bobby: where the real API has no data, the fixture lane fills the design through the same routes and readers (register `## 2f3`); a member with no published place is a typed gap plus a request to the contracts lane (board section 5, row F3 to K). No schema widened, no command or Live flag enabled, no component prints a figure it computed.

## What changed

- `e2e/bffSimulatedStage.ts` (new): lit Paper, Sandbox, Canary and Live bodies for the stage deployments, wired by one marked call line in `e2e/bffSimulated.ts`. States are reached by deployment id: `_dark`, `_mismatch`, `_stale`, `_gap`, `_breach`, `_halted`, `_vn` (and `dep_b2` mismatch, `dep_c1` halted in the review universe). Live "Broker mismatch hides broker values" is reachable at `/deployments/live/dep_live_01_mismatch`; the broker side is absent from the body itself.
- Spine ticks (R1, R2, Paper, Sandbox, Canary) on all four screens: `screens/stage/useStageLifecycle.ts` reads WP-C's `life_*` keys of the alpha dataset through the same port; nothing is drawn done without a published exit.
- Canary: KPI caption is the server's share of the approved cap; the duration row prints the published trial day; drill says Passed; stale broker blocker sentence.
- Live: Broker equity caption from the server's difference ("Matches internal"); mismatch adds the risk-increasing blocker line.
- Workbench: named by the alpha when its name is published, the design's question line, VN market chip linking `/vn-market` when the plain profile publishes a VN calendar (answers D to F3), 13px table body in the kv panels.
- CSS (own files): rollback flag never breaks mid-word, Triad rows keep figure and unit whole and wrap the row, sandbox code list wraps, chart readout figures not split (`charts.css` one rule and one class on `EquityPanel.tsx`, WP-C's file, additive).
- `scripts/layout-audit.mjs`: 23 added routes (other tabs and every state above).

## Element table

States: DATA, TYPED (absence is legal), BLOCKED with blocker (CONTRACT = row F3 to K, WP-D = shell file owned by D).

### 9 Deployment (Paper)
| # | Element | State |
|---|---|---|
| 1 | Context bar (env switch, basis, scope, window buttons) | BLOCKED WP-D (shell) |
| 2 | Breadcrumb | DATA |
| 3 | Title: alpha name | DATA (FE-066 name published in the lit body) |
| 3b | Title: alpha version | BLOCKED CONTRACT (7) |
| 4 | Subtitle question | DATA |
| 5 | Portfolio, account, alpha line | DATA |
| 6 | Alpha / Account / Operations links; VN chip | DATA |
| 7 | Runtime | DATA |
| 8 | Display freshness | DATA |
| 9 | Reconciliation (1 open finding, 1 unknown order) | DATA |
| 10 | Lifecycle ticks R1, R2 | DATA |
| 10b | "3 of 7 criteria" | BLOCKED CONTRACT (5) |
| 11 | Request exit review + reason | DATA |
| 12 | Tabs Overview, Orders, Fills, Positions, Sessions (populated) | DATA |
| 13 | Equity chart, simulated hatch | DATA |
| 13b | Approved band | BLOCKED CONTRACT (4) |
| 14 | High / Low markers (low at the first point is not marked by the chart) | DATA |
| 15 | Drawdown strip | BLOCKED CONTRACT (4) |
| 16 | Exit gate observation days, trades | DATA |
| 17 | Exit gate drift, fills reconcile, cost drift | BLOCKED CONTRACT (5) |
| 18 | Open exit review | DATA |
| 19, 20 | Runtime health rows, provenance | DATA |
| 21 | Accounting | DATA |
| 22 | Funding | TYPED |
| 23 | Execution quality tiles | DATA |
| 24 | Latency | TYPED (request 6 posted) |
| 25 | "On scroll" strip (sticky at the bottom of the viewport; a full-page capture draws it mid-page: capture artifact, intended pin kept, e2e F-4 rule) | DATA |

### 11 Sandbox
| # | Element | State |
|---|---|---|
| 1 | Context bar | BLOCKED WP-D |
| 2, 3 | Breadcrumb, chip, title, subtitle | DATA |
| 4, 5, 6 | Runtime, freshness, reconciliation chips | DATA |
| 7 | Stage chips with ticks, Sandbox failed | DATA |
| 8 | Source-partial banner (only when a panel did not report) | DATA |
| 9 to 14 | Tabs, five KPIs | DATA |
| 15 | Internal / Broker / Difference | DATA |
| 16 to 19 | Findings, exit review, submit, request | DATA |
| 20 | What exit needs, provenance | DATA |
| 21 | Review note form (server rule: 8 characters; design says 24: deviation recorded, rule is the server's) | DATA |
| 22, 23 | Seven steps, lineage | DATA |

### 12 Canary
| # | Element | State |
|---|---|---|
| 1 | Context bar | BLOCKED WP-D |
| 2, 3, 4 | Guard frame, breadcrumb, Real capital at risk | DATA |
| 5 | Title and subtitle (alpha) | DATA |
| 6, 7, 8 | Runtime, freshness, reconciliation | DATA |
| 9 | Stage chips with ticks | DATA |
| 10 | Trial day 6 of 14, started, review opens | DATA |
| 11 to 15 | Five KPIs | DATA |
| 16 | Live series | DATA |
| 16b | Paper and Backtest series | BLOCKED CONTRACT (3) |
| 17 | Promotion decision (closed, with reasons) | DATA |
| 18 | Tabs | DATA |
| 19 | Envelope verdict | DATA |
| 20 | Cap, limit, approved | DATA |
| 21 | Consumed, used bar and percent (four caps) | DATA |
| 21b | Duration row limit and used | BLOCKED CONTRACT (1) |
| 22 | Before scale-up | DATA |
| 23 | Rollback readiness (four checks) | DATA |

### 13 Live
| # | Element | State |
|---|---|---|
| 1 | Context bar | BLOCKED WP-D |
| 2, 3, 4 | Guard frame, breadcrumb, tag, title | DATA |
| 5, 6, 7 | Runtime, freshness, reconciliation (Matched or Mismatch) | DATA |
| 8 | Stage chips with ticks | DATA |
| 9 | Source banner (dark variant) | DATA |
| 10 to 14 | Five KPIs | DATA |
| 10b | Capital "Allocated", gross "% of capital", open orders limit | BLOCKED CONTRACT (8) |
| 15 | Live series with high and low | DATA |
| 15b | Drawdown strip | BLOCKED CONTRACT (4, deployment subject) |
| 16 | Protective ladder | DATA |
| 17 | What is blocking | DATA |
| 18 | Tabs | DATA |
| 19 | Internal / Broker / Difference, and the MISMATCH state | DATA |
| 20 | Positions and orders rows | DATA |
| 20b | Leverage, ack latency columns | BLOCKED CONTRACT (2) |

Counts: DATA 83, TYPED 2, BLOCKED 14 (WP-D 4, CONTRACT 10).

## Tests (all run in this worktree)
- `vitest run` canary, live, sandbox, workbench, stage, titleAbsence, v2Hygiene, uxm10Css, budgets, testHygiene, disabledReason: 36 files passed, 3680 tests passed, 5 skipped (0 failed).
- `vitest run` fixtureBff, charts, blocks: 40 files passed, 841 tests passed, 1 skipped.
- New: `fixtureBff/stageLitScreens.test.tsx` (25, the four screens on the lit lane, every state), `stageLit.test.ts` (6), `stageLitFigures.test.ts` (10, integer invariants), `canary/canary.wpf3.test.ts` (6), `live/live.wpf3.test.ts` (6), `stage/useStageLifecycle.test.tsx` (9).
- Two existing assertions changed on purpose: workbench "no question line" now expects it; canary duration Consumed expects the published day.
- `npx tsc --noEmit -p .` ran separately: clean (before the last CSS-only edits; no TS changed after).

## Layout (`scripts/layout-audit.mjs`, 1440/1280/1024/660/390; overflow / clipped / wrapped / font outliers)
- Before (original code, 4 default routes): paper 3 font outliers at every width and 1 wrapped at 390; sandbox, canary, live 0.
- After (28 routes: 4 defaults, 7 other tabs, 10 state variants, 4 dark/variant checks): every route and width 0/0/0/0 except Paper (default and `_dark`): 0/0/0/2 at every width. The two are the kv panel's "3 of 14 days" and "30 of 60 trades" (13px mono) judged against a column whose mode is the 11px state flags in the same column (heuristic; the figures are 13px like every table body).
- Mid-run findings fixed: triad figure and unit spilling at 1280 (6 to 17px), sandbox plan code list spilling (58 to 85px), rollback READY breaking mid-word, chart readout wrapping at 390.

## Not verified
- Context bar chips on these routes (WP-D lands them); the real Edge (all lit values are fixture); Playwright, visual baselines, `e2e` specs (not run: board rule); the chart's Low marker at the first point; Low label overlapping an x tick in the Live chart (charts, WP-C).

## QA1 fixes (R5 Canary and Live, R4 Paper and Sandbox)

Reproduced on the QA1 review's own evidence (the bodies and shots it names), fixed, re-measured with `scripts/layout-audit.mjs` at 1440/1280/1024/660/390 (label wpf3-qa1 and wpf3-qa1b: every route and width 0/0/0/0 except Paper 0/0/0/2, the flag-versus-figure column-mode heuristic). Tests: `stageLitQa1.test.ts` (10), plus the updated suites; tsc clean.

| Id | State | How and evidence |
|---|---|---|
| R5-07 | FIXED | one lifecycle record (`STAGE_OF`, `stageOf`, `reached`): `/deployments/dep_canary_01/live` answers the dark body, not a lit Live page; `/deployments/dep_live_01/canary` is a finished trial dated before the activation (STOPPED, LIVE_FULL, banner "does not declare the Canary stage"). Chips to a stage not reached are not links (`JourneySpine lockAhead`, used by Canary, Sandbox, Paper). Test: "R5-07 one lifecycle record". |
| R5-05 | FIXED | one banner component with a tone: stale amber, halted and breach red with their own sentence; halted is its own fixture (HALTED, broker FRESH, since now - 3 h) and stale is its own (RUNNING, broker STALE, series cut at the stamp); breach adds the red banner and the red BREACH flag. Shot canary-breach-1440. |
| R5-03 | FIXED (limit stays typed) | duration row Used prints "Day 6 of 14" from the published day and duration; no ratio. Limit stays Not available: CONTRACT request (1) (no duration cap row). |
| R5-04 | FIXED | Canary gross notional 6,100.00 = 1.2 x 3,490.5 + 10 x 191.14; Daily PnL -38.60 = last series point minus the point 24 h earlier (series 150.1 to 111.5); Live gross 39,109.95 = the four positions at marks, daily PnL -530.25 from its series. Asserted in `stageLitQa1.test.ts`. |
| R5-09 | FIXED | Promotion decision prints what each does, its closed button and its reason, "Opens at day 14 · exit review 26 Oct 08:00Z" for Request scale, and a "How promotion works" disclosure. Two tests changed on purpose (one My access per decision). |
| R5-08 | FIXED as columns, values typed | Leverage and Ack latency are columns again (Canary and Live), each cell a typed Not available with the server's reason; no place carries a value (the typed rows pin both null; K delivered no row for it). Canary Orders gained Status. CONTRACT (2) stands. |
| R5-10 | FIXED | the chart's right margin grows to hold the latest-value label, so it no longer covers the last points (`EquityPanel.tsx`, WP-C's file, small). |
| R5-11 | FIXED | a Low flag that would sit over the axis ticks is drawn above its point. |
| R5-12, R5-13 | FIXED | Used column: fixed text width, flexible bar, so every bar and 80% mark has one length; fixture ratios have at most four places so every readout has two (asserted). |
| R5-14 | FIXED | at 1360px and below every Triad row stacks label over figure in every column (one baseline); above, one line. |
| R5-15 | NOT FIXED | the repeated "Deployment series" sub-title is inside `EquityPanel` (needs a prop on WP-C's chart); cosmetic. |
| R5-16 | FIXED | the alpha id in the sub-line is the id size. |
| R5-17, R5-28 | NOT FIXED | "Allocated", "68% of capital", "2 limit" need server values (CONTRACT 8); the filler "Execution figure" stays as the figure's authority. |
| R5-18 | FIXED | one quantity column, one number of places (`stage/padDecimals.ts`, formatting only). |
| R5-19 | FIXED | a continuous feed that names no affected source says "None". |
| R5-20 | PARTLY | predecessor status is Active and active for Live; the reader (`liveFull.ts`, shared) carries three caps, so open orders is not listed. |
| R5-21 | FIXED | Mismatch flag is red (rejected kind). |
| R5-22 | FIXED | a sentence says the Scale-up and Protective columns are the rule's effect and Now is the present state. |
| R5-23 | FIXED | R1 and R2 chips carry their own approval (`?sel=AP-118`, `?sel=AP-152`). |
| R5-24 | FIXED as far as an id exists | "Open operations for this deployment" goes to `/execution/operations?target_id=<deployment>`; the dry-run link likewise; no operation id is published, so it is the filtered list, not one item. |
| R5-26 | FIXED | at 660 buttons, links and the "?" buttons have 44px height (negative margin keeps the layout). |
| R5-27 | FIXED | canary Positions and orders links to the deployment's blotter. |
| R5-30 | FIXED | an empty Exposure tab says why. |
| R5-01, R5-06 | NOT FIXED | CONTRACT (3) Paper and Backtest series, (4) drawdown and window delta; typed and honest. |
| R5-02, R5-29 | PARTLY | every lit instant is an offset from one `STAGE_NOW_ISO` (WP-P swaps it); a stale body no longer sends newer data. Month and rebase drift is WP-P's. |
| R5-31 | WP-D | not touched. |
| I16 | PARTLY | Lifecycle panel draws "Request exit review" disabled with the gate's reason (the working control stays in the Exit gate); "Paper · N of M criteria" consumes `getAlphaLifecycle` criteria when the Paper stage is CURRENT (no review alpha has it current, so typed); approved band, drawdown and per-criterion verdicts: CONTRACT (4), (5) (K's lifecycle `criteria.items` carry no observed value in the fixture). |
| I17 | FIXED | kv panel labels in sentence case, figures 13px. |
| I25, I26 | FIXED | the sandbox mismatch has its own finding "Equity differs by 46.87 USDT" and 3 open findings. |
| I18, I11 (dates) | WP-P | ids and time anchoring. |

## QA3 round (R5 Canary and Live, R4 Paper and Sandbox)

FIXED: R5-04 (the verdict is derived from the rows: any consumed above approved is BREACH; policy limit >= approved), R5-05 (the predecessor is the alpha's own canary deployment from the world, else none: lineage UNAVAILABLE and no predecessor envelope), R5-07 (halted: the flatten plan is not ready, so the roll-up header agrees), R4-01 (one findings list drives chip, KPI and step; fees Difference -0.01 and, in the mismatch variant, equity Difference -46.87 beside the finding), R4-03 (timeline holds the creation by a named person; no submit while blocked), R4-02 for my bodies (steps, findings and the plan are dated between creation and the page's own as-of), R4-06 (venue from the deployment), R4-16 (no empty eighth step cell), R4-07 for my screens (sub-line prints the alpha name, the id in its title; plan, session and actor ids are names or short codes), R5-16 (Internal, Broker and Difference rows stack label over figure in every column at every width). Tests: stageLitQa3.test.ts (10, on the positive scenario).
NOT FIXED: R5-01/02/06/08/09/15 and R4-04/10 (world: WP-P), R5-03 (blotter data: WP-P/F2), R5-12 (CONTRACT 3 and 4), R5-13 and FE-NNN in copy (the `Not published (FE-nnn)` wording is the shared `blocks/notPublished` renderer asserted by thousands of tests across screens: a decision for the primary), R5-11 (not reproduced on the current bodies), R5-17 (server values), R5-18a (matches the design's hidden-chart box), R4-17/18/19 (Paper: band/drawdown CONTRACT; counts come from the world; font heuristic).
