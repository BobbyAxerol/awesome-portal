# WP-F1 completion: Overview, Portfolio 360, Portfolios (2026-10-23)

Directive (Bobby, owner): where the real API has no data, the UI is filled with rule-bound FIXTURE_LAB data (register rows, replaceable) so the whole design is visible and testable; the real API continues in parallel. Level FIXTURE_LAB throughout: nothing here is source acceptance, the fixture banner is unchanged, no baseline was recorded, no command or Live flag was touched, no schema or generated file was widened. Fixture values never wear the word "real".

Worktree `/home/bobby/portal/.claude/worktrees/agent-a9eacf3e2bde81ba6`, rebased on `claude/post-land-20261022` (b0ab1da0c, with WP-F2 and WP-C integrated; the conflict in `answerReviewManager` was resolved by adding `wpF1Answer` to the chain after WP-C's `wpcEquity`). Commits: `feat(overview)`, `feat(portfolio360)`, `feat(portfolios)`, this note.

Inputs read: the board and LOG, the audit sections 1, 3, 4 and 6(d) (A4, A11, B2, B3), the previous Portfolios note (N1 to N5), register sections 2, 2a, 2c, the design images (overview, portfolios, portfolio manager views, hl-portfolio-flow, hl-portfolio-actions) against the live shots, and Artifact 2 concept C2.

## 1. Element table

States: DATA (drawn from fixture or published data), TYPED (typed absence where absence is legal), BLOCKED with its named blocker (CONTRACT = request posted in the board inbox, EDGE_INPUT, DESIGN_DECISION, OTHER_WP = file owned by another WP, request posted). Audit ids are the numbers of the section 2 checklist rows.

### Overview (22)
| # | Element | State | Where / note |
|---|---|---|---|
| 1 | Context bar environment | DATA | shell, existing |
| 2 | Context bar window | DATA | shell, existing |
| 3 | Basis chip "USDT - one basis" | BLOCKED OTHER_WP (WP-D, shell) | the page says the basis in its scope sentence; chip is the context bar's |
| 4 | Scope selector | BLOCKED OTHER_WP (WP-D) | same |
| 5 | Cmd K search field | BLOCKED OTHER_WP (WP-D) | top bar |
| 6 | User chip | BLOCKED OTHER_WP (WP-D) | top bar |
| 7 | Freshness chip | DATA | `Fresh · 12:04Z` always drawn beside the read line (`index.tsx`) |
| 8 | Sidebar count badges | BLOCKED OTHER_WP (WP-D) | sidebar |
| 9 to 13 | KPI NAV, Net PnL, Return, Drawdown, Open incidents | DATA | existing, unchanged |
| 14 | Chart tabs Net PnL / Return / Equity | DATA | `MeasureSeg`: Net PnL (default once served), Return, NAV; the design's "Equity" is the fund NAV series and is named NAV (retained equity is not a certified NAV) |
| 15 | High / low markers and end tag | DATA | the chart's own flags on the published points |
| 16 | Capital added / returned markers | TYPED, CONTRACT | no fund-level capital event is published (the ledger is per portfolio); line "Capital markers: Not published" with its reason; request F1 to K row 2 |
| 17 | Drawdown strip | DATA | the chart's drawdown pane draws the port's DRAWDOWN series (WP-K) of the same fund, environment and window (`series/drawdownInput.ts`, `drawdownInputOf`); a source that is UNAVAILABLE, EMPTY, failed or not asked keeps the typed pane with its reason |
| 18 | Capital panel initial / added / returned / NAV | DATA | existing rows, now at the 13px table rule |
| 19 | Budget used bar | DATA | `BudgetBar`: published `allocation` against `current_budget` per partition, recalling as a second segment; fixture keys (register 2f1) |
| 20 | Needs attention with SLA bar | DATA | a state stripe by the published `sla_state` (no elapsed time is published, so no progress length is drawn; DESIGN note below) |
| 21 | Since your last visit | TYPED, EDGE_INPUT | frame drawn as designed (three kinds of line as placeholders, "No baseline"); a persisted per-user baseline is Edge's; no line is invented |
| 22 | Contributors Amount / Portfolios | DATA | tabs Amount and Portfolios (second read grouped by `portfolio_id`), drawn bars scaled inside one partition, first eight groups with Show all |
Counts: DATA 15, TYPED 2 (capital markers: CONTRACT; digest: EDGE_INPUT), BLOCKED 5 (all WP-D shell). (Follow-up: the drawdown strip moved from TYPED to DATA when WP-K published DRAWDOWN.)

### Portfolios (24)
| # | Element | State | Where / note |
|---|---|---|---|
| 1 | Context bar | DATA + BLOCKED OTHER_WP | environment and window drawn (the window bar is live on this screen since the previous note); basis chip and scope selector are WP-D's. Counted BLOCKED |
| 2 | Not-scored chip | DATA | superseded by the Score column (FIXTURE_LAB policy) |
| 3 | Freshness chip | DATA | `Fresh` chip beside the as-of line |
| 4 | Search | DATA | existing |
| 5 | Chips All / Needs attention / Stale | TYPED, CONTRACT | All / Real-funded / Simulated and the currency select are drawn; Needs attention and Stale need the Health roll-up (N3, board inbox row A to K) |
| 6, 7 | Columns, Compact | DATA | existing |
| 8 | Export + reason | TYPED | "Export: not available yet" disclosure with the D20 sentence and My access |
| 9 | Compare bar and button | DATA | selection bar and Compare link (appears at 2 to 4 picks), existing |
| 10 to 12 | Checkbox, name + id, Manager | DATA | existing |
| 13 | Alphas / Dep. | DATA | optional column (hidden by default to fit 1440) |
| 14 | Allocations | DATA | optional column (hidden by default) |
| 15, 16 | NAV (Economic capital), Allocated | DATA | existing; base-currency figures print bare, unit on the title |
| 17 to 19 | Net PnL, Return, Drawdown | DATA | fixture group metrics; windows in the head |
| 20 | HHI | DATA | optional column (hidden by default) |
| 21 | Health | TYPED, CONTRACT | the published portfolio `state` only; the OK / RECALL / STALE / PARTIAL roll-up is N3 |
| 22 | Total NAV row | DATA | "Scope statement · Economic capital" line: the Manager's own per-partition `current_nav` of the statements, one line each, never a sum of the rows (its title says so) |
| 23 | "n portfolios in another currency" | DATA | count of rows with nothing in the chosen currency, with the way back |
| 24 | Sort and basis rules | DATA | existing |
Counts: DATA 20, TYPED 3 (items 5, 8, 21; 5 and 21 carry the CONTRACT blocker N3), BLOCKED 1 (item 1, shell chips, WP-D).

### Portfolio 360 (25)
| # | Element | State | Where / note |
|---|---|---|---|
| 1 | Title, id, manager, currency | DATA | existing |
| 2 | Not-scored chip | DATA | the score tile (FIXTURE_LAB policy) |
| 3 | Freshness chip | DATA | `Fresh` chip always drawn |
| 4 | Report pack + export reason | TYPED | "Report pack: not available yet" disclosure (D20 sentence) and My access, in the header; "Export: not available yet" in the chart head |
| 5, 6 | Compare / Actions, six tabs | DATA | existing |
| 7 to 10 | KPI NAV, Net PnL, Return, Drawdown | DATA | existing; KPI tiles never narrower than their own 24px figure (the 1024 spill is fixed locally) |
| 11 | KPI Allocated / Deployments | DATA | existing |
| 12 | Chart tabs Net PnL / Return / NAV, Table / Expand / Export | DATA | `PerformanceCard`; Export is the typed sentence |
| 13 | Line with high / low and drawdown strip | DATA | line, flags and the strip from the port's DRAWDOWN series of the same portfolio, environment and window (typed pane when not published) |
| 14 | Capital added / returned marker | DATA | allocation-flow pins from the published ledger in the series' own currency (the ledger records allocations to accounts, not funding, and the caption says so) |
| 15 | Capital panel Cash flows | DATA | initial, added, returned, net external flows, Net PnL, NAV; fixture statement keys |
| 16 | Budget, not cash | DATA | approved, allocated, recalling, headroom |
| 17 | Allocation bar + By funding source | DATA | bar DATA; "By funding source" typed (FE-032) |
| 18 | Concentration stacked bar + HHI | DATA | `ShareBar` from the published `allocation_share_pct` |
| 19 | Needs attention | DATA | existing |
| 20 | Allocations environment summary | DATA | existing |
| 21 | Capital flow diagram per basis, per-deployment flows | DATA | `AllocationFlow`: funds in, NAV, dashed "Limit, not cash" link, alpha, deployment; table with budget, exposure, margin (typed: scale accounts publish none), Net PnL |
| 22 | Capital ledger (seq, event, target, basis, amount, receipt) | DATA | entries as published (fixture ledger for the scale portfolios); seq and receipt are not published (receipts FE-032, one typed line) |
| 23 | Simulated block with its own flow and ledger | DATA | one flow per environment, Paper and Sandbox never in the Real-funded block |
| 24 | Actions with AVAILABLE and Review (preview not recorded) | DATA | "Review available" and Review from the advisory eligibility; PREVIEW, NOT RECORDED of published figures; the result is `Not published (FE-020)`; no apply, submit or reserve |
| 25 | Simulated-capital banner | DATA | existing |
Counts: DATA 24, TYPED 1 (item 4, the report pack sentence), BLOCKED 0. Item 17 counts DATA (its funding-source half is the typed line FE-032).

Tabs per the design: Allocations (above), Risk and Health (drawdown max in window from the published group figure, now typed; margin typed; correlation typed), People and Activity (attribution, operations; activity feed and audit typed, FE-031/FE-021), Alphas and Accounts (existing); Risk, Alphas and People now stack their panels so no table sits behind a scroll fade at 1440.

Totals over the three checklists (71 elements): DATA 59, TYPED 6, BLOCKED 6 (the five Overview shell items and Portfolios 1, all WP-D). The CONTRACT blockers that sit inside TYPED rows are listed in section 4.

## 2. What was built, by design name

- Overview (`screens/overview/**`, `css/overview.css`): "Performance" tabs and drawdown pane (typed), `BudgetBar` in "Capital", "Contributors" with the Portfolios tab, bars and Show all, "Since your last visit" frame, freshness chip, SLA stripe. Shared, additive: `screens/series/ManagerSeriesPanel.tsx` gained optional `drawdown` and `flows` props (no other caller changes).
- Portfolio 360 (`screens/portfolios/portfolio/**`): `Performance.tsx` (card, `flowPins`), `flowModel.ts` and `AllocationFlow.tsx` (capital flow, concept C2: "funds in, NAV, approved budget (limit, not cash), alpha, deployment"), the two-part Capital panel, `ShareBar`, `Rail.tsx` (Review with PREVIEW, NOT RECORDED), `Risk.tsx` (drawdown max from the published group), stacked panels for Risk, Alphas and People.
- Shared by Overview and 360 (`screens/portfolios/`): `capitalModel.ts` (the only arithmetic: a whole-percent fill from two published strings of one partition, bigint), `CapitalBlocks.tsx` (`BudgetBar`, `ShareBar`), `capitalBlocks.css`.
- Portfolios (`screens/portfolios/*`): default columns, `exec-pf-reg` table tightening, bare base-currency figures (`PartitionFigures` `omitUnit`, `MoneyList`), compact score cell, export sentence, scope statement, other-currency count, freshness chip.
- Highlights covered: overview-ctx and overview-cmd (shell parts: BLOCKED WP-D; the page-level freshness chip is drawn), portfolio-flow (done), portfolio-actions (done as Review of published figures).
- Items of audit 6(d): A4 (Portfolios fit 1440 and typed Health) done; A11 (fixture population: scale ledger, statement keys, eligibility done; pf_TEST_ONLY_* rows are WP-C's, their reply says they are committed in their worktree); B2 (Overview and 360 series, drawdown strip, markers, budget, Contributors) done except the contract-only pieces; B3 (capital flow, per-deployment flows, exposure, margin, receipts) flow and exposure done, margin and receipts typed.

## 3. Fixture lane (`apps/portal/fixture-bff/review-manager.ts`, block `// ===== WP-F1 begin/end`)
Functions I added: `wpF1Money`, `wpF1Value`, `wpF1Part`, `addWpF1`, `wpF1Ledger`, `wpF1Eligibility`, `wpF1Answer`. One call line in `datasetAnswer` (`addWpF1(body, groups)` after `addGroupScores`) and `wpF1Answer(...)` in the shared dispatch of `answerReviewManager`. No other function of another WP was touched. Rules, keys, consumers and expected real sources: register section 2f1. Tests: `src/fixtureBff/reviewCapital.test.ts` (11): rules exactly, window independence, reader acceptance, ledger identities, eligibility rows.

Existing tests changed (each for a stated reason, never to silence a real failure): `reviewManager.test.ts` (the original-key list excludes the four WP-F1 keys), `overview.test.tsx`, `measureSegSeries.test.tsx`, `contributors.test.tsx` (Net PnL default tab, NAV tab, digest frame), `portfolios.test.tsx`, `datasetWiring.test.tsx`, `portfolios.conformance.test.tsx`, `registerScreen.test.tsx` (default columns, bare base-currency figures, always-drawn freshness chip, score cell), `portfolio.test.tsx`, `railEligibility.test.tsx` (Performance tabs, capital panel rows, Review instead of an always-off rail).

## 4. Requests and blockers (board inbox rows from F1)
- F1 to K: series metric DRAWDOWN: DONE by WP-K (both strips wired in the follow-up); still open: fund-level capital events (Overview markers), statement keys `allocation`, `headroom`, `recalling`, `net_external_flows` and group `allocation_share_pct` need published homes (N4 family and a share key). The earlier N1 (portfolio-grain sort/filter) and N3 (Health roll-up) are the first inbox row (from A); F1 confirms the register waits on them (INFO row).
- F1 to WP-C: pf_TEST_ONLY_* rows and scale-account margin. WP-C answered in a message: the TEST_ONLY portfolios answer in their worktree (section `// ===== WP-C` of review-manager.ts) and land with their branch; the margin gap in bffScale is not theirs. It stays open for the primary.
- F1 to WP-D: basis chip, scope selector, Cmd K field, user chip, sidebar badges (five Overview items and Portfolios 1).
- EDGE_INPUT: the digest baseline (FE-024), funding source and receipts (FE-032), capital-action preview result (FE-020).
- DESIGN notes for the owner: (1) the hi-fi "Equity" tab is the fund NAV series and is named NAV; (2) the SLA bar is a state stripe, because no elapsed time is published, so a length would be a made-up quantity; (3) a figure in a row's base currency prints without its unit on the Portfolios register (the identity cell names the base; the unit is on the title), which is what lets the register fit 1440; (4) Alphas / Dep., Allocations and HHI are hidden by default for the same reason; the Score column stays visible; (5) "Review available" means the caller's own grant exists (advisory) and opens a read of published figures: it is not a command and enables nothing.

## 5. Layout (chromium, one browser; local vite dev of this worktree + fixture BFF populated/medium, fonts loaded; `scripts/probe-portfolios-layout.mjs`, extended with the Overview and the 360 tabs, `--only`, `--widths`)

| Measure | Before | After |
|---|---|---|
| Portfolios register, scroll width inside its panel past the panel at 1440 / 1280 / 1024 | +556 / +716 / +972 (previous note, 13 columns) | 0 / +159 / +415 (default columns fit 1440; narrower widths scroll inside the panel with the sticky identity, guide 8.3) |
| Portfolio 360 tabs at 1440, scroll regions behind a fade | Alphas +305, Reconciliation +175, Attribution +97, Operations +446 | 0 for Alphas, Risk, People, Allocations (panels stacked); at 1280 Alphas +81; at 1024 Alphas +337, Accounts +91, Operations +94, Allocations ledger +187 and deployments +80 |
| Overview Contributors at 1440 | 9,329px page (50 groups listed) | first eight groups, panel on a full row below 1500px: 0 scroll, 0 past viewport (was +60 inside the panel with the bar column) |
| Document horizontal overflow, every route measured, 1440 / 1280 / 1024 / 660 / 390 | not recorded for the new routes | 0 on every one |
| 360 KPI tiles sticking out of their tile (the 540,000.00 USDT at 1024 case), scale and suite routes, all five widths | 1 at 1024 (audit) | 0 at every width measured (scale route 7 tiles at 1440/1280/1024/660/390; suite route at all five) |
| Table body font sizes (probe) | Contributors 12px, capital tables 12px/14px mixed | 13px in every table body (Portfolios 13px/11px: figure and caption; Contributors 13px; 360 capital 13px) |
| Wrapped figures | 0 | 0 in every table measured; clipped cells 0 |

Numbers come from the probe's output for this worktree (`scripts/probe-portfolios-layout.mjs ... --only ... --widths ...`); the full-stack `scripts/layout-audit.mjs` (vite build) was NOT run: the machine had 5 to 11 GB available and the board asks for one heavy command at a time, so the small probe was used.

## 6. Tests (all from `apps/portal/frontend`, `--maxWorkers=2`)
- `npx vitest run src/execution/v2/screens/overview src/execution/v2/screens/portfolios src/fixtureBff`: 50 files passed, 1 skipped; 963 passed, 1 skipped (final run, on the tree rebased onto the lane tip with WP-C and WP-F2 in; the last small edits, the title wording and the Overview breakpoint, were re-run: `titleAbsence` plus `registerWpf1` 15 passed, probe 0). New files, 76 tests (run together: 8 files, 76 passed): `overviewWpf1.test.tsx` (11), `capitalModel.test.ts` (13), `capitalBlocks.test.tsx` (8), `flowModel.test.ts` (9), `performance.test.tsx` (6), `allocationFlow.test.tsx` (7), `registerWpf1.test.tsx` (11), `reviewCapital.test.ts` (11).
- Hygiene (final tree): `disabledReason`, `testHygiene`, `titleAbsence`, `v2Hygiene`, `uxm10Css`, `flagOn`, `flagOff`, `budgets`, `charts`, `series`, `compare`: 27 files, 559 passed.
- `npx tsc --noEmit -p .` (separately, on the final tree): exit 0, no output.

## 7. Not verified
- No Playwright visual suite, no baseline recording (instructed). Baselines that will differ: Overview, Portfolios, Portfolio 360 every tab, anything mounting the Portfolios list or the 360 chrome.
- Layout was measured on a vite dev server with the fixture BFF in chromium, not on the preview stack and not at the real Edge.
- The pf_TEST_ONLY_* subjects were not re-measured after WP-C's rows (their branch is not integrated here); on the audit route the Overview of those still reads empty until it lands.
- The Review in the Actions rail was looked at on pf_scale_001 with `workspace_id` in the address; a page address without a workspace keeps the old reason sentence (the eligibility read is not asked).

## 8. Follow-up: the DRAWDOWN strips (after WP-K slice 1)
`useManagerSeries` asks metric DRAWDOWN for the same subject, window and environment as each chart, once the NAV read says the port serves it (Overview `index.tsx`; 360 `use360.ts`, `reads.drawdown`). `series/drawdownInput.ts` turns the read into the chart's drawdown pane: a published series is drawn (FRACTION moved to percent in the string, nothing derived), every other state keeps the typed pane. The test double `seriesDouble.testbase.ts` now answers DRAWDOWN as a RATIO (FRACTION, first point a true zero, the rest below it). No fixture key and no register row were added. Tests: `drawdownInput.test.ts` (4); `measureSegSeries.test.tsx` and `performance.test.tsx` assert the DRAWDOWN question (subject, window, environment) and the drawn strip. Final run on the tree reset to lane tip 4230ae2f6: `overview + portfolios + series + fixtureBff` 57 files passed, 1 skipped, 1049 passed, 1 skipped; hygiene and shared (`disabledReason`, `testHygiene`, `titleAbsence`, `v2Hygiene`, `uxm10Css`, `flagOn`, `flagOff`, `budgets`, `compare`, `alpha`, `charts`) 43 files, 979 passed. Still typed, not invented: fund-level capital events (Overview markers) and the four statement keys / `allocation_share_pct` homes, because K delivered neither.

## 9. Follow-up 2: Codex post-freeze review of the Portfolios register (three CHANGES, `fix(portfolios)`)
Source: `CLAUDE_POST_FREEZE_REVIEW_2026-10-23.md` lines 9 to 31 (via `CODEX_SUPPORT_SURVEY_2026-10-23.md` section 2 row 3).
1. Reversed ranges. `RangeFilters.tsx` refuses a minimum above the maximum where it is typed: the text stays, the reason is an `alert` tied to both inputs by `aria-describedby` (`aria-invalid` on both), nothing is committed or written to the address; equal ends are valid and inclusive. `registerMetrics.readRangeState` tells none, range and invalid apart; a deep link with a reversed or unreadable range is an INVALID range: a visible alert (`data-testid="invalid-range"`), a chip "(invalid range)", no row shown, a Clear button; the address is not rewritten. (`parseRange` keeps its old meaning for callers that only need a valid range.)
2. Score quality. `ScoreRead` carries the AVAILABLE metric's caveats (Partial / Incomplete from completeness; Stale / Freshness unknown from freshness; Provisional / Unverified from source confidence; No methodology), its reason code and a maturity sentence that appears only when the owning fact lists `SAMPLE_BELOW_MATURITY`; a typed absence keeps its availability. `ScoreCell` prints each caveat word beside the value with its sentence on the title (the 360 also prints the reason code); a clean source prints none. Provisional alone no longer claims "sample below maturity".
3. Units and domain. `invalidFigure` checks the unit each key is published in (score SCORE, evidence RATIO, Net PnL and NAV MONEY, return and drawdown PERCENT, HHI RATIO), the bounded range (score and components 0 to 100, evidence 0 to 1) and that a MONEY figure is in its partition's currency. A score outside 0 to 100 or in another unit is `invalid` ("Invalid score", reason and the published value on the disclosure), never banded, never a sort or range operand, and counts as missing for the missing-score filter; components and evidence outside their range are dropped. Real-funded and Simulated stay apart by construction: two partitions of one currency in different domains give no single figure, so nothing is sorted or filtered across them. `registerMetrics.test.ts`: the `-3` row is gone from the band table; a -3 now asserts `invalid`.
Tests: new `registerReview.test.tsx`; existing `registerScreen.test.tsx` (unreadable range) and `registerMetrics.test.ts` (-3) updated. No fixture key and no register row were added.

## 10. Follow-up 3: QA1 issues of WP F1 (`QA1_REVIEW_R1`, Overview OV-, Portfolios PF-, Portfolio 360 P3-)
FIXED:
- OV-01 KPI strip: counts keep one figure size (the number) with the words as captions (`KpiCount`: "at least 1", "3 of 214" stay whole text); NAV is the KPI size; Net PnL, Return and Drawdown are coloured by their published sign (`data-tone` on `PartitionFigures`, from the string, no arithmetic; a true zero is neutral) and print the currency as a caption.
- OV-03 chart vs KPI: the fund's NAV, Net PnL and Return series now end exactly on the FUND dataset's own capital-statement figure of the same partition and window (`wpF1ShapeFund`, a noisy deterministic path, no sawtooth); the KPI and the chart read one number; the drawdown strip derives from the same NAV path. Tests in `reviewCapital.test.ts` (7D, 30D, 90D exact).
- OV-05 (score part) the contributors score prints like the register's (two places, truncated, exact on the title; a true zero reads 0.00). OV-06 the page is named Overview. OV-08 contributor alpha and portfolio ids are links (carrying the page context). P3-07 (case) ids print as published in the contributors table.
- PF-01 the base currency is a visible mark beside every portfolio name (a figure in it prints bare, a figure in another currency keeps its unit); PF-02 the id is whole on its own line; PF-03 the Economic capital column is named NAV (hint: economic capital) and stays a default column; the default columns fit 1440 (tighter padding, Health's typed note stacks under its flag), measured: wrapper 1094, content 1094.
- P3-01 the Allocated KPI reads the same statement as the Capital panel and the bar (14,580.00 in the test lane); without a statement it is labelled "Allocated, all books" (the resource's own figure). P3-03 at 1024 the panel head wraps instead of colliding, the side column stacks below 1100px, and the score tile's caveats wrap inside it: 0 figures sticking out of a tile at 1024 and 1440 on the scale and suite routes. P3-05 one unit style (number plus a small currency caption) on the KPI tiles and the capital rows; P3-06 the NAV row's unit is spaced.
- PF-05 (placeholders) "Not available" in a figure cell is the table body size (13px). PF-09 the 660 cards drop the fade mask (changed in CSS; not re-measured at 660).
NOT FIXED, with the owner: OV-02 and P3-02 (dates in the future, the world clock: WP-P; the 360 Equity panel's empty plot and 616,125.00 vs NAV 46,000.00 come with it); OV-04 (three-decimal fixture values: fixture precision); OV-05 (zero amount beside a non-zero return: fixture); OV-07 (deployment counts link to the alpha list: Fleet routes); OV-09 (660 compact KPI); PF-04 (the journey portfolios' figures differ by screen: WP-P/WP-C fixture); PF-05 (two-line column heads), PF-06, PF-08, PF-10; P3-07 (concentration strip position, Needs attention actions, alpha names); P3-08 (alpha names on the 360 are not links); P3-09 (banner wording).
