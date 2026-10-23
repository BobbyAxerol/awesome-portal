# Portfolios and Portfolio 360 completion (2026-10-23)

Directive (Bobby, owner): where the real API has no data yet, the UI is filled with rule-bound FIXTURE_LAB data (recorded, replaceable) so the whole design can be seen and the layout tested; Alpha Fleet and Portfolios must sort and filter on the metrics and show the score. This note is the PORTFOLIOS side (Fleet is another agent's).

Level: FIXTURE_LAB. Nothing here is source acceptance. The fixture banner is unchanged. Visual baselines were not recorded.
Inputs read: Manager UX Guide v1.1 sections 6.2 to 8.2, 11; Score spec v1.1 (11.2 bands, direct PortfolioScore); the M02 row of `HIFI_LOWFI_GAP_AUDIT_2026-10-22.md`; the Portfolios and Portfolio 360 design images and the live-preview screenshots of 2026-10-22. `REVIEW_DECISIONS_AND_PM_DELTA_v1.2_VI.md` line 19 (it sits at `upgrade/execution_loop/`, not under `evidence/ELP2-10/`) describes the two lowfi sheets (Overview with Initial/Added Funds, Fleet columns); it names no Portfolios column, so the M02 columns come from the gap audit's M02 row and the guide.

## 1. What was added, per guide row (guide section, element, state)

| Guide / audit row | Element on the register | State now |
|---|---|---|
| 7 (directory), M02 | Manager (published `owner`) | DELIVERED, typed absence "owner not published" |
| 7, M02 | Alphas / Dep. | DELIVERED_FIXTURE: alpha rows = published `unique_row_count` of the portfolio group (selected environment), deployments = published read count (all environments); the two scopes are said on the cell title; `Not available / n` when the group is not served |
| 7 | Allocations | DELIVERED (unchanged) |
| 7, 4.2 | Domain | DELIVERED, optional column (hidden by default, the Domain control already says it) |
| 6.3, M02 "Economic capital" | Economic capital = group `current_nav` per partition | DELIVERED_FIXTURE; budget and exposure are not shown here (other figures) |
| 6.3, M02 "Allocated capital" | exact per-currency list, mixed-books flag | DELIVERED (unchanged) |
| 7, M02 "Net PnL 90D" | Net PnL, header names the window (`Net PnL · 90D`) | DELIVERED_FIXTURE, group `net_pnl`; `ALL` is the typed window gap |
| 7 | Return, Drawdown (window in the head) | DELIVERED_FIXTURE, group `return_30d_pct`, `max_drawdown_pct` |
| 11.4 | HHI, separate from the score | DELIVERED_FIXTURE, group `concentration_hhi`; no band; its help text says it is a diagnostic |
| 11.1, 11.2, 11.3 | PORTFOLIO SCORE (direct from the portfolio NAV): value truncated to two places, band (Weak, Neutral, Fair, Good, Very good from the exact value, 74.999 stays Fair), evidence coverage, `Provisional` badge when `source_confidence` is PROVISIONAL, policy label (`policy_revision`), methodology and exact string on the title | DELIVERED_FIXTURE. Absent score: "Insufficient evidence" (typed code, disclosure) with the evidence it still publishes; no band, never 0. True zero is a value (Weak). Not served: `Not published (FE-011)` |
| 7 | Health | the published portfolio `state` flag, renamed Health. A dedicated health roll-up is NEEDS-CONTRACT (section 4, N3) |
| 8.2 | Server-side sort via `sort_fields` | NEEDS-CONTRACT for portfolio grain (section 4, N1). Done locally, said on screen |
| 8.2 | Header asc/desc (CardsTable `aria-sort`), exact decimal order, null-last in both directions, Unallocated always last | DELIVERED on the loaded portfolios and their published group figures. Money sorts inside one currency (header is not a control until `ccy` is picked, with the reason); a portfolio with several partitions and no `ccy` has no single figure and sorts as "none" |
| 8.2 | Numeric range filters with unit and inclusive ends: Net PnL, Return, Drawdown, Score, Allocated capital | DELIVERED (Filters popover, `f_pnl`, `f_ret`, `f_dd`, `f_score`, `f_alloc` = `min..max`, either end open, exact decimals, text refused where typed). A money range needs the page currency: the field is not drawn without it and a sentence says why |
| 8.2 | "missing / insufficient evidence" for the score | DELIVERED (`score_state=missing`): the typed absences and the portfolios with no group |
| 8.3 | Filter chips, clear-one and clear-all | DELIVERED |
| 8.3 | Column chooser: default vs optional | DELIVERED: every column but Portfolio is optional; Domain is the only one hidden by default; help text per column |
| 8.3 | Sticky identity, horizontal-scroll affordance | DELIVERED: Compare box and Portfolio are sticky at 661px and above; the existing fade mask and keyboard scroll of the wrap are kept; below 660px the cards stack |
| audit M02 | Window selector 7D / 30D / 90D / ALL, basis text | DELIVERED: `windowLockFor` no longer locks the bar on Portfolios and Portfolio 360 (both reads already took the window; the bar said "Not applied: Window"). Basis line: environment, "one economic partition per figure, one currency each, never summed", which columns follow the window |
| 11, M04 | Portfolio 360: score block | DELIVERED_FIXTURE: KPI tile with value, band, P / R / B, evidence, provisional, policy, window |
| 6.4 / M04 | Portfolio 360: Contributors table (Amount, Return, Score per alpha) | DELIVERED_FIXTURE: PORTFOLIO surface grouped by `alpha_id`, the Overview's own `contributorsView` and body (one line per partition, never summed; alpha ids, no display names: a name needs the group to carry it) |
| 6.3, M04 | Capital flow / ledger per basis | NOT CHANGED: the screen already has the Capital statements card, the flow ribbon on the equity chart and the Allocations ledger. Rows that stay `Not published (FE-017)`: Net external flows, Recalling, Headroom (N4) |

One currency per figure: every partition is its own line (label only when a portfolio has several), nothing is summed across currencies or domains.

## 2. Fixture lane (rule-bound, recorded)

Additive in `apps/portal/fixture-bff/review-manager.ts`: one block (`addGroupScores` and helpers, +78 lines with the drawdown rule) and one call line after `applyWindow`. Keys, rules, consumers and expected real sources are rows in `SIMULATED_DATA_REGISTER_2026-10-22.md` section 2c: `portfolio_score`, `portfolio_score_p`, `_r`, `_b`, `portfolio_score_evidence` on the groups by `portfolio_id`, and `score` on the groups by `alpha_id`. Cases present on the populated medium lane: high (very good), good, mid (neutral), low (weak), provisional (fair, PROVISIONAL), insufficient evidence (typed absence), true zero; `score = (45P + 30R + 25B)/100` exact on the published components (asserted); `ALL` is the window gap. No schema or generated file was touched.

Places the contract does not offer, said once: no key for the band, eligibility, policy version or observed days. The band is derived from the value on the page, eligibility is `availability` + `reason_code`, provisional is `source_confidence`, the policy is `policy_revision`.

Two small fixture fixes found by looking at the screen (both in the same file, recorded in the register): the group drawdown seed carried only the partition, so every USDT portfolio drew the same value and all were absent (now seeded with the group's row keys, one in five absent); and the suite portfolios `pf_TEST_ONLY_core`, `_satellite`, `_canary`, `_yen`, `_empty` have no dataset rows at the medium scale (the lane's rows use `pf_scale_*` ids), so those register rows read "No live figures are published for this portfolio" in every measure column. That is an id-universe gap in the lane (rowsFor), not a screen defect; it was left alone because the rows function is shared with Fleet (the other agent's area).

## 3. Layout (jsdom cannot judge it; chromium, one browser, local vite of this worktree + fixture BFF populated/medium, fonts loaded)

Script: `apps/portal/frontend/scripts/probe-portfolios-layout.mjs <origin> [out.json]` (not a Playwright project, not part of vitest). Before = `3d51f188e` rebuilt and measured; after = this commit.

| Measure | Before | After |
|---|---|---|
| Register, document horizontal overflow at 1440 / 1280 / 1024 / 660 / 390 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| Register wrapper scroll width past the viewport at 1440 / 1280 / 1024 / 660 / 390 | +307 / +467 / +723 / 0 / 0 | +556 / +716 / +972 / 0 / 0 (13 columns now, with the identity sticky and the fade mask) |
| Cells with a figure or text sticking out of the cell, all widths | 0 | 0 (one found at 390 during the work, a long money figure in a card, fixed: the figure may break before its unit in cards) |
| Numeric-cell font sizes in the register | 14px (157), 11px (159), 12px (43): three | 14px (211), 11px (206): two (figure, caption) |
| Figures that wrap onto a second line | 0 | 0 at 1440 to 660; 1 at 390 (the card layout may break before the unit, by design) |
| 360 KPI figure sizes (scale lane, 1280) | 24px (3), 12px (4), 11px (4): Net PnL, Return, Drawdown printed at 12px beside 24px NAV | 24px for all 7 tiles' figures; 11px captions; 12px only on one "Not published" note |
| 360 KPI figures sticking out of their tile | 1 at 1024 (scale), 4 at 1024 (suite) | 0 at every width |
| 360 Capital rows | label stacked above the value on some rows, inline on others (uneven heights) | one shape: label left, partition caption over the right-aligned figure |
| 360 KPI tile heights | 122/104 | 122/104/90 across rows (score tile is taller; rows stretch to fill, no empty cell) |

Not measured as clean: Portfolio 360 `pf_TEST_ONLY_core` probe runs are slow and a run sometimes reported "nothing measurable" for it (a 20s timeout in the probe, not a layout fault); the successful runs show 0 sticking, 0 overflow.

Changes: partition caption and "Not available" in figure cells use the caption token (they used a raw 11px and the meta token); KPI partition figures use the KPI token when one partition (they used the data token); NAV prints value at the KPI size and the currency as the small unit; "Not available" never wraps; names and ids end in an ellipsis with the full text on the title; the compare column head is a screen-reader name only.

## 4. Needs-contract, with the exact backend request

N1 (sort and filter at portfolio grain, server-side). `GET /api/v1/execution/manager/fleet` accepts `sort` and `filters` over ROWS (alpha x version x portfolio); the portfolio groups (`group_by=portfolio_id`) are returned unordered and cannot be filtered or sorted by their own metrics, and `GET /portfolios` has no query. Request: (a) `group_sort: [{metric_key, partition_ref?, direction}]` and `group_filters: [{metric_key, op GTE|LTE|IS_NULL, value}]` on the dataset, null-last both directions, evaluated inside one economic partition (`economic_partition` already pins it), the group keys and `page.authorized_filtered_count` of groups answering that order; or (b) `sort`, `filters` and a cursor on `GET /portfolios` over the published `portfolio-list` metrics. Until then the screen sorts and filters the loaded portfolios and says so (`Filters cover the N loaded portfolios only`), and no control claims to be server-side. Multi-sort priority is not drawn: the register has one sort key; it comes with N1.

N2 (the score contract places). The dataset's `scores` block carries one scope-level `direct_nav` slot; per-portfolio and per-alpha scores need a published place. Request: publish `portfolio_score` (+ `_p`, `_r`, `_b`, evidence coverage, eligibility reason, provisional flag, `policy_revision`, `calibration_id`) as group metrics of `group_by=portfolio_id`, and the raw alpha score under `score` of `group_by=alpha_id` (the Overview already reads that key); the row-level `score` key is in the closed enum, a group map is open. Add `observed_days` and the band edges version if the band must not be derived on the page.

N3 (Health). `portfolio-list` publishes `state` only. Request: a portfolio health roll-up (typed, with source) in the list or in a group metric, so Health is not the lifecycle state.

N4 (capital rows). `capital_statements` has initial, added, returned, current NAV, budget, pending; "Net external flows", "Recalling" and "Headroom" have no key (the page will not derive them). Request: `net_external_flows`, `recalling`, `headroom` statement metrics per partition.

N5 (names). Contributor groups carry only the alpha id; request `alpha_name` (or a label) beside the group key.

## 5. Tests (all from `apps/portal/frontend`, `--maxWorkers=2`; `npx tsc --noEmit -p .` printed nothing)

- `npx vitest run src/execution/v2/screens/portfolios`: 14 files, 324 passed (54 are new: `registerMetrics.test.ts` 30, `registerScreen.test.tsx` 18, `portfolio/scoreAndContributors.test.tsx` 6). They cover: band edges (0, 39.9999, 40, 74.999, 75, 90, 100), truncation, evidence percent, score states (value, absent, true zero, none), partition choice and no cross-partition figure, range parsing and inclusive exact comparison (9 vs 100 is numeric), sort order and null-last in both directions, money sort inside a currency, Unallocated last, the exact wire of the dataset question (`/manager/fleet`, `environment`, `window` `"7D"`, `group_by=portfolio_id`, `limit=1`; and the 360 `group_by=alpha_id` read), no extra request when sorting or filtering, chips with clear-one and clear-all, popover validation, the honest Not published column when no group publishes the score, the 360 score tile (value, band, P/R/B, provisional) and the Contributors table.
- `npx vitest run src/fixtureBff`: 17 files passed, 1 skipped, 413 passed (8 new in `reviewScores.test.ts`: identity 0.45P+0.30R+0.25B on published components, every case present, same case across windows and on the 360 read, determinism, `ALL` gap, production reader accepts the keys, no row-level or statement-level key). The existing drawdown test still holds (absence is non-zero).
- Hygiene and shell: `v2Hygiene`, `titleAbsence`, `uxm10Css`, `testHygiene`, `disabledReason`, `flagOn`, `v2/shell`: 21 files, 438 passed. `src/execution/v2/readers` and `v2/fieldcoverage` also ran green (readers are unchanged).
- Existing tests updated for the new labels (Manager, Health, Economic capital, HHI, window in the head, Alphas / Dep.): `portfolios.test.tsx`, `datasetWiring.test.tsx`, `portfolios.conformance.test.tsx`. One `portfolio.test.tsx` run once printed React `act` warnings (the console guard failed it); it passed in 2 later runs alone and in the folder runs. Not chased: it is timing, not an assertion.

## 6. Visual baselines that will differ (not recorded)

Portfolios list at 1440 and every other width (new columns, sticky identity, chips line, basis line, window selector now drawn in the bar, one-line absences). Portfolio 360 Overview at every width (score tile, KPI figures at one size, Capital rows, Contributors panel, window selector in the bar). Anything that mounts the Portfolios list or 360 chrome (Compare launcher from the list). Overview, Fleet and Accounts are not touched by this commit. Recording is the baseline step's (forced `=all`, contact sheets reviewed), not this commit's.

## 7. Not verified

- No run of the Playwright visual suite and no baseline recording (instructed).
- Layout was measured in chromium on a vite dev server with the fixture BFF, not on the preview stack (8095) and not at the real Edge; sticky behaviour was measured as `position: sticky` and by screenshots at 1440, not at every width.
- Multi-sort priority, server-side sort and filter, and the Health roll-up are not delivered (N1, N3).
- The lowfi sheets themselves were not looked at; the audit row and the decision file's description were used.
- `apps/portal/frontend/scripts/probe-portfolios-layout.mjs` is plain Node, so `tsc` does not check it; it was run.
