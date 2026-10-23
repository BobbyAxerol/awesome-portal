# Preview vs artifact audit, 2026-10-23

R0 markdown. Read-only audit: no product code, docker stack, preview stack or Playwright test suite was touched. Fixture data throughout; nothing here is acceptance evidence.

What this compares: the LIVE research-portal preview (http://127.0.0.1:8095, fixture data, populated profile, built from lane commit `40d86acd1`, i.e. before the latest lane work) against Artifact 1 "Execution V2 Screens" (manager view is the target) and Artifact 2 "Execution V2 Concepts".

Read this first, because it is the honest headline:

- Percentages below are percentages of MY element checklist (461 visible elements I listed from the 21 manager images), not of anything Bobby or Codex defined, and not of any acceptance list.
- Only 42.5% of those elements are drawn with fixture values. 17.8% are drawn as honest typed absence ("Not available / Not published" with a reason). 26.0% are PARTIAL (something reduced or different). 13.7% are MISSING.
- All 21 families have a route or a surface, except Incident, which exists only as a drawer over Operations, and Trade replay, which exists only as a tab inside Alpha 360 (More). The Fleet heat map route renders a "Not published (FE-035)" box instead of a map. Ctrl+K opens a navigation-only palette, not the artifact's entity search. There is no persistent context bar in the artifact's sense (environment, window, basis, scope, as-of) on most routes.
- Bobby's observation "many screens missing from the artifact concepts and the new screens absent" is partly right and partly wrong, and the split is in sections 3 to 5. The new screens (Compare, Account 360, Sandbox/Canary/Live frames, New request, Users, Admin) exist and render. What is absent or hollow is the creative content that made them the artifact's concepts: heat map, capital flow diagram, journey spine contents, event ribbon on the main chart, command bar entity search, compare chart, waiver runway, ops drawer, drawdown strips.

## 1. Summary table (per screen family, over my element checklist)

Columns: elements in my checklist; DATA = drawn with fixture values; TYPED = honest typed absence with reason (allowed by the honest-display rule, but not data); PARTIAL = drawn but reduced or different; MISSING = not drawn. "Not missing" = DATA + TYPED + PARTIAL, a generous measure; DATA alone is the strict one.

| # | Screen family | Elements | DATA | TYPED | PARTIAL | MISSING | Not missing |
|---|---|---|---|---|---|---|---|
| 1 | Overview | 22 | 8 (36%) | 2 (9%) | 7 (32%) | 5 (23%) | 77% |
| 2 | Alpha Fleet (table, board, map) | 37 | 13 (35%) | 6 (16%) | 9 (24%) | 9 (24%) | 76% |
| 3 | Portfolios | 24 | 13 (54%) | 2 (8%) | 7 (29%) | 2 (8%) | 92% |
| 4 | Portfolio 360 | 25 | 7 (28%) | 9 (36%) | 7 (28%) | 2 (8%) | 92% |
| 5 | Compare | 15 | 2 (13%) | 6 (40%) | 4 (27%) | 3 (20%) | 80% |
| 6 | Alpha 360 | 32 | 10 (31%) | 11 (34%) | 7 (22%) | 4 (12%) | 88% |
| 7 | Account 360 | 25 | 15 (60%) | 2 (8%) | 6 (24%) | 2 (8%) | 92% |
| 8 | Accounts | 19 | 12 (63%) | 0 (0%) | 6 (32%) | 1 (5%) | 95% |
| 9 | Deployment (paper monitor) | 25 | 11 (44%) | 6 (24%) | 7 (28%) | 1 (4%) | 96% |
| 10 | Blotter | 26 | 14 (54%) | 1 (4%) | 10 (38%) | 1 (4%) | 96% |
| 11 | Sandbox certification | 23 | 17 (74%) | 3 (13%) | 3 (13%) | 0 (0%) | 100% |
| 12 | Canary control room | 23 | 7 (30%) | 12 (52%) | 4 (17%) | 0 (0%) | 100% |
| 13 | Live operations | 20 | 7 (35%) | 11 (55%) | 2 (10%) | 0 (0%) | 100% |
| 14 | Trade replay | 18 | 7 (39%) | 0 (0%) | 8 (44%) | 3 (17%) | 83% |
| 15 | Operations | 22 | 6 (27%) | 3 (14%) | 5 (23%) | 8 (36%) | 64% |
| 16 | Approvals cockpit | 27 | 14 (52%) | 0 (0%) | 7 (26%) | 6 (22%) | 78% |
| 17 | New approval request | 14 | 4 (29%) | 0 (0%) | 7 (50%) | 3 (21%) | 79% |
| 18 | Profile & Access | 15 | 5 (33%) | 3 (20%) | 1 (7%) | 6 (40%) | 60% |
| 19 | Admin Actions | 19 | 13 (68%) | 0 (0%) | 4 (21%) | 2 (11%) | 89% |
| 20 | Users | 17 | 7 (41%) | 3 (18%) | 5 (29%) | 2 (12%) | 88% |
| 21 | Incident | 13 | 4 (31%) | 2 (15%) | 4 (31%) | 3 (23%) | 77% |
| | **All 21 families** | **461** | **196 (42.5%)** | **82 (17.8%)** | **120 (26.0%)** | **63 (13.7%)** | **86.3%** |

Reading the table: the "Not missing" column flatters the preview because PARTIAL includes elements that are drawn only as a shell (for example the six empty lifecycle squares on Alpha 360). Use DATA for "what a manager can read today". TYPED is not data: it is the right way to show an unpublished source, and the artifact's own source-not-qualified states (`overview-nq`, `portfolio-nq`, `fleet-nq`, `operations-nq`) are drawn exactly that way, so TYPED is partial credit by design, but a screen with mostly TYPED cells (Canary 52%, Live 55%, Compare 40%, Portfolio 360 36%, Alpha 360 34%) shows a frame with no figures.

Sensitivity of one family: Portfolio 360 was scored on the audit route `pf_TEST_ONLY_core`, where the manager-overview read answers 404 and nearly everything is TYPED. On `pf_scale_001` (probe screenshot `shots/portfolio-scale001.png`) the same screen draws NAV, Net PnL, Return, Drawdown (4 TYPED become DATA), initial/added/returned/approved budget, a NAV chart with a partial banner and concentration HHI. That would move Portfolio 360 from 28% DATA to about 56% DATA. I scored the audit route as instructed; the fixture population is uneven across subjects, which is itself a finding (a reviewer can open a subject that looks empty).


## 2. Per-screen checklists (manager image elements versus the preview)

Status words: DATA, TYPED_ABSENCE, PARTIAL, MISSING as defined in section 1. Screenshot names refer to the audit set (`audit/*.png`) or my extra shots (`mine/shots/*.png`).

### 1. Overview

Route: `/execution`. Screenshots: overview.png. Elements: 22. DATA 8, TYPED_ABSENCE 2, PARTIAL 7, MISSING 5.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar: environment segmented (Real-funded/Paper/Sandbox) | DATA | drawn, works |
| 2 | Context bar: window segmented 7D/30D/90D/ALL | DATA | drawn |
| 3 | Context bar: basis chip "USDT - one basis" | PARTIAL | basis only stated in a sentence under the title; no chip |
| 4 | Context bar: scope selector "All portfolios" | PARTIAL | scope only stated in the same sentence; no selector |
| 5 | Top bar: Cmd K "Search or jump to" input | MISSING | top bar has workspace/theme/density only; no search field |
| 6 | Top bar: user chip "BOBBY - MANAGER" | MISSING | not drawn |
| 7 | Freshness chip "Fresh 12:04Z" | PARTIAL | text "Read 17 Oct 12:04Z - Not live" plus Refresh button, no chip |
| 8 | Sidebar approval/operations count badges (3, 4) | MISSING | none drawn |
| 9 | KPI NAV | DATA | per-currency value |
| 10 | KPI Net PnL 90D | DATA | JPY/USD/USDT rows |
| 11 | KPI Return 90D | DATA | one currency cell is "Not available" |
| 12 | KPI Drawdown | DATA | per-currency |
| 13 | KPI Open incidents (link to Operations) | DATA | "at least 1" |
| 14 | Chart tabs Net PnL / Return / Equity | PARTIAL | Net PnL and Return only; no Equity |
| 15 | Chart with high/low markers and end-value tag | PARTIAL | line + end tag; no high/low markers |
| 16 | Chart capital added/returned markers | MISSING | none drawn |
| 17 | Drawdown strip under chart | MISSING | not drawn |
| 18 | Capital panel: initial/added/returned/NAV rows | DATA | per currency (3 currencies stacked) |
| 19 | Capital panel: budget used bar (842,300 / 1,100,000) | PARTIAL | "Budget" per-currency numbers, no used/limit bar |
| 20 | Needs attention list (incident/operation/approval, SLA bar, action link) | PARTIAL | typed rows and links drawn; no SLA progress bars |
| 21 | Since your last visit digest | TYPED_ABSENCE | "Not published" |
| 22 | Contributors (Amount/Portfolios bar chart) | TYPED_ABSENCE | "Not published" |

### 2. Alpha Fleet (table, board, map)

Route: `/deployments/alphas (+?view=board, ?view=map)`. Screenshots: fleet.png, fleet-board.png, fleet-map.png. Elements: 37. DATA 13, TYPED_ABSENCE 6, PARTIAL 9, MISSING 9.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar (env, window, basis, scope) | MISSING | strip says "Not applied: Environment, Window"; no env/window/basis/scope controls on this route |
| 2 | Table / Board / Map view toggle | PARTIAL | Table and Board only; Map reachable only by URL |
| 3 | Freshness chip | PARTIAL | "Fleet read - alpha / As of 1 Sep 15:00Z" text chip |
| 4 | KPI Alphas in view | DATA | 40 (label "Alphas") |
| 5 | KPI Need attention | DATA | 11 |
| 6 | KPI Ready for exit review | MISSING | replaced by Deployments/Portfolios/Research only tiles |
| 7 | KPI Archive in progress | MISSING | not drawn |
| 8 | Stage tabs with counts (All/Real-funded/Sandbox/Paper/Archived) | PARTIAL | counts on all but Archived; Real-funded "~28" |
| 9 | Search alpha | DATA | drawn |
| 10 | Portfolio filter | MISSING | not drawn |
| 11 | Owner filter | DATA | drawn |
| 12 | Health filter | DATA | drawn |
| 13 | Group by / Then | TYPED_ABSENCE | "Not available: Group by" |
| 14 | Compare button + "Select 2 to 4 alphas" | TYPED_ABSENCE | "Compare" listed as Not available |
| 15 | Columns menu | DATA | drawn |
| 16 | URL disclosure | DATA | drawn |
| 17 | Row checkbox column | MISSING | none |
| 18 | Alpha + version link | DATA | drawn |
| 19 | Owner column | DATA | drawn |
| 20 | Portfolio column | DATA | drawn |
| 21 | Stage with 7-segment progress | PARTIAL | stage label with dashed unfilled mini bar |
| 22 | Allocation column | TYPED_ABSENCE | every cell "Not available" |
| 23 | Net PnL 90D column | TYPED_ABSENCE | every cell "Not available" |
| 24 | Equity sparkline column | TYPED_ABSENCE | every cell "Not available" |
| 25 | Health badges (OK / STALE / PENDING DRAIN / ARCHIVE REQUESTED, multi) | PARTIAL | READY / NEEDS ATTENTION / RESEARCH ONLY, one badge plus reason text |
| 26 | Export + reason | MISSING | not drawn |
| 27 | Footer "Showing 14 of 14 authorized" | DATA | "40 of 40 alphas" |
| 28 | Board: lanes Paper/Sandbox/Canary/Live with counts | DATA | plus Research lane, loaded/in-scope counts |
| 29 | Board: SIMULATED / REAL-FUNDED lane tag and hatched simulated lanes | MISSING | none |
| 30 | Board: card name/version/owner/portfolio | DATA | drawn |
| 31 | Board: card allocation amount + currency | MISSING | not drawn |
| 32 | Board: card 7-segment progress "5/7" | PARTIAL | tiny dashed bar, no x/7 text |
| 33 | Board: card health badges (incl. EXIT REVIEW READY, ARCHIVE REQUESTED) | PARTIAL | READY/NEEDS ATTENTION only |
| 34 | Board: red frame on Canary and Live lanes | PARTIAL | red top rule only |
| 35 | Map: treemap by portfolio then alpha, Size and Colour selectors, legend | TYPED_ABSENCE | "Map - Not published (FE-035)"; no treemap |
| 36 | Map: real-funded and simulated halves "never summed" | MISSING | not drawn |
| 37 | Row peek drawer (hl-fleet-peek; extracted hl image shows the Alpha 360 page, so peek content was not verifiable from it) | PARTIAL | click on a row opens a drawer: lifecycle squares, identity, portfolios, deployments, readiness "Not published"; Open Alpha 360, Compare "Not published" |

### 3. Portfolios

Route: `/deployments/portfolios`. Screenshots: portfolios.png. Elements: 24. DATA 13, TYPED_ABSENCE 2, PARTIAL 7, MISSING 2.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar (env, window, basis, scope) | PARTIAL | env drawn; "Not applied: Window"; no basis chip, no scope selector |
| 2 | Not-scored chip | TYPED_ABSENCE | "Not available: Score (Not published FE-011)" |
| 3 | Freshness chip | PARTIAL | "As of 17 Oct 12:04Z" text |
| 4 | Search portfolio or manager | DATA | drawn ("or owner") |
| 5 | Filter chips All / Needs attention / Stale | PARTIAL | All / Real-funded / Simulated, plus currency select; no attention/stale chips |
| 6 | Columns menu | DATA | drawn |
| 7 | Compact toggle | DATA | drawn |
| 8 | Export + reason | MISSING | not drawn |
| 9 | Compare bar + Compare button | PARTIAL | "Select 2 to 4 ..." bar, no Compare button until selection (not tested) |
| 10 | Row checkbox | DATA | drawn |
| 11 | Portfolio name + id | DATA | drawn |
| 12 | Manager column | DATA | as "Owner" |
| 13 | Alphas / deployments column | PARTIAL | Allocations and Deployments only; no alphas count |
| 14 | Allocations column | DATA | drawn |
| 15 | NAV column | DATA | drawn; some rows Not available |
| 16 | Allocated capital | DATA | drawn |
| 17 | Net PnL 90D | DATA | drawn; no window label |
| 18 | Return 90D | DATA | drawn |
| 19 | Drawdown 90D | TYPED_ABSENCE | "Not available" in rows checked |
| 20 | Concentration (HHI) | DATA | drawn |
| 21 | Health badge column | PARTIAL | STATE (ACTIVE) badge, no OK/RECALL/STALE/PARTIAL health |
| 22 | Total NAV row for filtered set | MISSING | not drawn |
| 23 | Footer "n portfolios in another currency - Switch basis" | PARTIAL | "25 portfolios" only |
| 24 | Sort and basis rules disclosure | DATA | drawn |

### 4. Portfolio 360

Route: `/deployments/portfolios/pf_TEST_ONLY_core`. Screenshots: portfolio-360.png. Elements: 25. DATA 7, TYPED_ABSENCE 9, PARTIAL 7, MISSING 2.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Title + id/manager/currency | DATA | drawn |
| 2 | Not-scored chip | TYPED_ABSENCE | "Score: Not available" line |
| 3 | Freshness chip | PARTIAL | "As of" text + ACTIVE badge |
| 4 | Report pack + export reason | MISSING | not drawn |
| 5 | Compare with... and Actions buttons | DATA | both drawn |
| 6 | Tabs Overview/Allocations/Alphas/Accounts/Risk & health/People & activity | DATA | six tabs drawn |
| 7 | KPI NAV | TYPED_ABSENCE | "Not available" |
| 8 | KPI Net PnL 90D | TYPED_ABSENCE | "Not published" |
| 9 | KPI Return 90D | TYPED_ABSENCE | "Not published" |
| 10 | KPI Drawdown | TYPED_ABSENCE | "Not published" |
| 11 | KPI Allocated / Deployments (extra) | DATA | drawn, not in manager image |
| 12 | Chart tabs Net PnL/Return/NAV + Table/Expand/Export | PARTIAL | NAV panel shows typed absence; Equity panel has Table/Expand, no Net PnL/Return/NAV tabs, no Export |
| 13 | Chart line with high/low and drawdown strip | PARTIAL | equity line + gap hatch drawn (a different series: account equity); no drawdown strip, no high/low |
| 14 | Capital added/returned marker (+100,000) | PARTIAL | "Flow" lane with markers drawn |
| 15 | Capital panel: Cash flows (initial/added/returned/net external/net PnL/NAV) | TYPED_ABSENCE | every row "Not published" |
| 16 | Capital panel: Budget not cash (approved/allocated/recalling/headroom) | TYPED_ABSENCE | every row "Not published" |
| 17 | Capital panel: allocation bar + By funding source | MISSING | not drawn |
| 18 | Concentration stacked bar + HHI | TYPED_ABSENCE | "Not published ... needs Manager grouping" |
| 19 | Needs attention list (recall pending, stale) | DATA | three typed rows (needs attention, finding open, stale) |
| 20 | Allocations tab: environment summary (accounts, allocated, max, balance, free, locked) | DATA | currency table drawn for Live and Paper |
| 21 | Allocations tab: capital flow diagram (funds in, NAV, "limit, not cash" link, alpha, deployment, exposure/margin/PnL) | TYPED_ABSENCE | "Not available: Capital flow, Ledger receipts"; no diagram |
| 22 | Allocations tab: append-only capital ledger (seq, event, target, basis, amount, receipt) | PARTIAL | ledger drawn with before/after columns; no seq, no receipt column |
| 23 | Allocations tab: simulated block below a divider, own flow and ledger | PARTIAL | SIMULATED section drawn as table; no flow; ledger "published no entry" |
| 24 | Actions drawer: grant / recall / set target / return / lock / deploy with AVAILABLE + Review (preview not recorded) | PARTIAL | drawer opens, six actions all UNAVAILABLE ("Not published FE-020", no preview) |
| 25 | Simulated-capital banner (extra) | DATA | drawn |

### 5. Compare

Route: `/deployments/compare?in=...`. Screenshots: compare.png. Elements: 15. DATA 2, TYPED_ABSENCE 6, PARTIAL 4, MISSING 3.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar (env, window, basis, scope) | PARTIAL | "Not applied: Environment, Window" plus a USDT chip; no controls |
| 2 | Title + "2 to 4 - one currency - Modified Dietz" subtitle | PARTIAL | title only |
| 3 | Freshness chip + Back to Portfolios | PARTIAL | "As of" text and back link |
| 4 | Subject tabs Portfolios / Alphas | MISSING | not drawn (portfolios only) |
| 5 | Metric tabs Return / Net PnL (preview adds NAV) | DATA | NAV/Net PnL/Return drawn |
| 6 | Candidate chips (selected, hatched-unavailable with reason) | DATA | chips with currency and "other currency"/"not comparable" reasons |
| 7 | Overlaid multi-line chart with end tags | TYPED_ABSENCE | "Pick two comparable portfolios" empty frame; Core+Satellite selected yet no lines |
| 8 | Chart end-value readout line (Core -0.56% ...) | MISSING | not drawn |
| 9 | Chart footer (90D 1D UTC Retained snapshots) | PARTIAL | basis line says "no aligned series" |
| 10 | Metrics table: NAV | TYPED_ABSENCE | Not available (both columns) |
| 11 | Metrics table: Net PnL | TYPED_ABSENCE | Not available |
| 12 | Metrics table: Return | TYPED_ABSENCE | Not available |
| 13 | Metrics table: Max drawdown | TYPED_ABSENCE | Not available |
| 14 | Metrics table: Score | TYPED_ABSENCE | Not available |
| 15 | Metrics table: best-in-row square marker | MISSING | not drawn (no values) |

### 6. Alpha 360

Route: `/deployments/alphas/alpha_a (+?tab=orders, ?tab=replay)`. Screenshots: alpha-360.png, alpha-orders.png, trade-replay.png. Elements: 32. DATA 10, TYPED_ABSENCE 11, PARTIAL 7, MISSING 4.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar (env, window, basis, scope) | PARTIAL | env drawn; "Not applied: Window"; no basis chip, no scope selector |
| 2 | Back link | DATA | drawn |
| 3 | Title + version chip | PARTIAL | "alpha_a"; "Not available: Name, Version, Run, Evidence" |
| 4 | Not-scored chip | TYPED_ABSENCE | NOT SCORED - POLICY NOT SET chip drawn |
| 5 | Owner / run / evidence revision / portfolio meta | PARTIAL | owner and portfolio drawn; run and evidence typed absent |
| 6 | Freshness chip | DATA | FRESH chip + As of |
| 7 | Journey spine: six stage cards R1..Live | PARTIAL | six cards drawn as dashed empty frames; Live card highlighted |
| 8 | Spine: days in stage per stage | TYPED_ABSENCE | "Not published: Days in stage, gate criteria and decider" |
| 9 | Spine: criteria meter (7/7 bars) | TYPED_ABSENCE | same absence |
| 10 | Spine: who decides / exit date and actor | TYPED_ABSENCE | same absence |
| 11 | Spine: stage-state tabs Live / In Sandbox / Blocked | MISSING | not drawn |
| 12 | "Live now" panel | DATA | drawn, lists dep_live_01 running, allocation 40,000 |
| 13 | KPI Net PnL actual | DATA | +1,120.80 USDT |
| 14 | KPI Return | TYPED_ABSENCE | Not published |
| 15 | KPI Max drawdown | TYPED_ABSENCE | Not published |
| 16 | KPI Regime fit | TYPED_ABSENCE | Not published, policy not set |
| 17 | Tabs Performance/Deployments/Research evidence/Regime fit/Orders & fills/Activity & decisions/More | DATA | seven tabs |
| 18 | Basis tabs Actual / Forward simulated / Research OOS | DATA | drawn |
| 19 | Equity chart with end tag | DATA | account equity line drawn (different series than Net PnL) |
| 20 | Chart drawdown strip | MISSING | not drawn |
| 21 | Event ribbon on the default (Performance) view | MISSING | no ribbon on the first view of Alpha 360 |
| 22 | Ribbon (Activity & Decisions tab): kind chips with counts | DATA | Stage 0 / Decision 1 / Incident 0 / Recall 0 / Flow 0 chips drawn |
| 23 | Ribbon (Activity & Decisions tab): five lanes with pinned markers | PARTIAL | five lanes drawn, one decision marker; stage, incident, recall, flow "Not published" |
| 24 | Ribbon (Activity & Decisions tab): stage band under chart | DATA | single LIVE band drawn |
| 25 | Ribbon (Activity & Decisions tab): events table with actor and receipt link | PARTIAL | when/kind/target/outcome drawn from orders and fills; actor and receipt "Not published" |
| 26 | Contribution by venue bars | PARTIAL | contribution by deployment bars drawn (different split) |
| 27 | Cost drag: fees / funding bars | TYPED_ABSENCE | Not published |
| 28 | Cost drag: slippage | TYPED_ABSENCE | Not available |
| 29 | Forward observation 70D/10D hatched bars | TYPED_ABSENCE | all rows Not published |
| 30 | Mixed return / Mixed score rows | TYPED_ABSENCE | Not published |
| 31 | Manifest conditions disclosure | MISSING | not drawn |
| 32 | "n charts not available yet" footer | DATA | "Not available: Rolling correlation, Return histogram, ..." line |

### 7. Account 360

Route: `/deployments/accounts/acc_bnc_core`. Screenshots: account-360.png. Elements: 25. DATA 15, TYPED_ABSENCE 2, PARTIAL 6, MISSING 2.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar (env, window, basis, scope) | PARTIAL | env drawn; "Not applied: Window"; no basis chip or scope selector |
| 2 | Back link + title + meta | DATA | drawn |
| 3 | Sleeve / Physical binding toggle | DATA | drawn (plus currency select) |
| 4 | Stale chip | DATA | STALE 14 MIN |
| 5 | Reconciling chip | PARTIAL | BROKER SYNC: SYNCED and ACTIVE chips instead |
| 6 | Shared-account warning banner | PARTIAL | "Shared by 3 sleeves"; sentence "Native figures are not sleeve capital" missing |
| 7 | Logical sleeve panel (name, portfolio, domain, deployments, provenance) | DATA | drawn |
| 8 | Physical binding panel: venue | DATA | BINANCE |
| 9 | Physical binding panel: native account | TYPED_ABSENCE | "Withheld" |
| 10 | Physical binding panel: product | TYPED_ABSENCE | "Not published" |
| 11 | Physical binding panel: margin mode | DATA | CROSS |
| 12 | Physical binding panel: environment with proof time | PARTIAL | "Real-funded", no mainnet/proof time |
| 13 | Physical binding panel: provenance disclosure | MISSING | not drawn (credential chip and open-binding-view button instead) |
| 14 | Tabs Overview/Positions & orders/Allocations/Fees & funding/Reconciliation/Activity | DATA | six tabs |
| 15 | KPI Internal ledger (this sleeve) with unrealized PnL | DATA | drawn |
| 16 | KPI Native custody (whole account) with native equity | DATA | drawn |
| 17 | KPI PM capital used / approved with gross and long/short | DATA | drawn |
| 18 | Sleeves on this binding table | DATA | drawn; native attribution column replaced by portfolio ids |
| 19 | Native attribution "Not available - no source" column | MISSING | column absent |
| 20 | Margin panel (ratio, maintenance, available, coverage, cross margin) | DATA | ratio typed "Not published"; other rows drawn |
| 21 | Reconciliation tab: Internal / Broker / Difference three columns | PARTIAL | drawn; broker and difference mostly "Not computed"/"Not available", "NO VERDICT" chip |
| 22 | Reconciliation tab: sync history table | DATA | drawn (7 rows) |
| 23 | Physical binding view (Open physical binding view / toggle) | DATA | drawn: binding facts, capital invariant table, native custody, sleeves, margin |
| 24 | Account equity chart | PARTIAL | line drawn with a stated gap; no high marker, no drawdown strip inside the panel |
| 25 | Separate drawdown panel (extra) | DATA | drawn |

### 8. Accounts

Route: `/deployments/accounts`. Screenshots: accounts.png. Elements: 19. DATA 12, TYPED_ABSENCE 0, PARTIAL 6, MISSING 1.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar (env, window, basis, scope) | PARTIAL | env drawn; "Not applied: Window"; no basis or scope |
| 2 | Title + subtitle | DATA | drawn |
| 3 | Freshness chip | PARTIAL | AGING chip + as-of text |
| 4 | Tabs All/Issues/Real-funded/Paper/Testnet with counts | PARTIAL | Real-funded 50 / Paper / Sandbox; Issues is a chip, no Testnet, only one count |
| 5 | Search binding or account | DATA | drawn |
| 6 | Venue filter | DATA | drawn |
| 7 | Credential filter | DATA | drawn |
| 8 | Export + reason | DATA | drawn with reason |
| 9 | URL disclosure | MISSING | not drawn |
| 10 | Column Binding - venue | DATA | drawn |
| 11 | Column Account (sleeve count) | DATA | drawn |
| 12 | Column State badge | DATA | drawn |
| 13 | Column Credential badge | DATA | drawn (more states) |
| 14 | Column Physical equity | PARTIAL | drawn for 2 of 50 rows, rest Not available with reason |
| 15 | Column Sum virtual / headroom | PARTIAL | drawn for ~20 rows, rest Not available |
| 16 | Column Check (WITHIN PHYSICAL / EXCEEDED / NOT AVAILABLE) | PARTIAL | WITHIN PHYSICAL on 2 rows, rest NOT AVAILABLE |
| 17 | Column Updated (freshness dot + age) | DATA | drawn |
| 18 | Footer "Showing n of n authorized" | DATA | "50 of 50 bindings" plus partial-read note |
| 19 | Row link to Account 360 | DATA | works |

### 9. Deployment (paper monitor)

Route: `/deployments/paper/dep_paper_01`. Screenshots: deployment.png. Elements: 25. DATA 11, TYPED_ABSENCE 6, PARTIAL 7, MISSING 1.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar | PARTIAL | env chip + "Window: Published window" chip; no env switch, basis, scope, window buttons |
| 2 | Breadcrumb Alpha / Fleet / Alpha / Paper monitor | DATA | drawn |
| 3 | Title (alpha + version) + PAPER chip | DATA | drawn (id-style name "alpha_btc_trend", no version) |
| 4 | Subtitle "Tracking approved evidence? Ready to leave Paper?" | MISSING | not drawn |
| 5 | Portfolio / account / simulated-currency meta | PARTIAL | portfolio and account drawn; alpha "Not available" |
| 6 | Links Alpha / Account (+Operations) | DATA | drawn |
| 7 | Runtime card (RUNNING since) | TYPED_ABSENCE | "Not available: Runtime, Reconciliation" |
| 8 | Display freshness card (Stale 14m + last event) | DATA | FRESH + as-of |
| 9 | Reconciliation card (RECONCILING, unknown order, link) | TYPED_ABSENCE | "Not available: Reconciliation" |
| 10 | Lifecycle stepper with R1/R2 ticks and 3 of 7 criteria | PARTIAL | six empty dashed squares, Paper highlighted, "Not available"; no ticks, no criteria count |
| 11 | Request exit review + blocked reason | PARTIAL | "Request review" button inside Exit gate panel (partly overdrawn in the capture) |
| 12 | Tabs Overview/Orders/Fills/Positions/Sessions | DATA | five tabs |
| 13 | Equity vs approved band chart with simulated hatch | PARTIAL | equity line + hatch drawn; approved band and drawdown "Not available" |
| 14 | Chart low marker | PARTIAL | "High" marker only |
| 15 | Chart drawdown strip | TYPED_ABSENCE | "Not available: Drawdown, Approved band, Window" |
| 16 | Exit gate: observation days | DATA | 3 of 14 days |
| 17 | Exit gate: drift / fills reconcile / cost drift rows with verdict badges | TYPED_ABSENCE | "Not available: Drift vs approved band, Fills reconcile, Cost drift" |
| 18 | Exit gate: Open exit review link | DATA | drawn |
| 19 | Runtime health: mode/venue, open positions, last source update, fills counted | DATA | four rows |
| 20 | Runtime health: provenance | DATA | drawn |
| 21 | Accounting: equity, net PnL, fees, cash free/locked | DATA | drawn |
| 22 | Accounting: funding | TYPED_ABSENCE | Not available |
| 23 | Execution quality: sessions, orders, fills, rejected | DATA | four tiles |
| 24 | Execution quality: latency | TYPED_ABSENCE | "Not available: Latency" |
| 25 | Sticky "On scroll" summary strip | PARTIAL | strip is drawn but in the full-page capture it overprints the chart/exit-gate panels |

### 10. Blotter

Route: `/deployments/blotter`. Screenshots: blotter.png (caught mid-load), blotter-settled.png (re-shot). Elements: 26. DATA 14, TYPED_ABSENCE 1, PARTIAL 10, MISSING 1.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar | PARTIAL | "Window: Current retained window" chip + "Not applied: Environment"; env/window/basis/scope controls absent |
| 2 | Title + subtitle "Orders and fills - 90D" | PARTIAL | title + "As of 17 Oct 12:00:00Z" |
| 3 | Freshness chip | PARTIAL | "As of" text only |
| 4 | Design-preview "Opened from" and state toggles | MISSING | not drawn (design aid) |
| 5 | Scope chips in the URL (stage from context bar, deployment x, Add scope, Clear all) | PARTIAL | one "environment Paper" chip; no Add scope, no Clear all |
| 6 | Symbol / venue / side filters (extra) | DATA | drawn |
| 7 | Status tabs All / Working / Conditional / Filled / Partial / Rejected / Cancelled with counts | PARTIAL | All/Open/Partial/Filled/Rejected with counts; Cancelled has "No chip: Canceled 30" |
| 8 | Columns menu | DATA | drawn |
| 9 | Export + reason | DATA | drawn, enabled ("Exports the 50 loaded rows"); design shows it disabled with a reason |
| 10 | "Showing 50 of n authorized - newest first" | DATA | "Showing 50 of 300" |
| 11 | Table: time (UTC) | DATA | drawn |
| 12 | Table: order with expander and id chip | DATA | "+" expander, id chip, bracket marker |
| 13 | Table: deployment + venue | PARTIAL | deployment id; "Not available" on many rows; venue not shown |
| 14 | Table: symbol | DATA | drawn |
| 15 | Table: side and type | DATA | drawn |
| 16 | Table: price | DATA | drawn |
| 17 | Table: filled / quantity | PARTIAL | quantity drawn; filled is "Not published for this order" on rows seen |
| 18 | Table: average price | PARTIAL | in DOM text for some rows, "Not available" for others; not visible in the settled screenshot |
| 19 | Table: fee (USDT) | PARTIAL | same as average price |
| 20 | Table: status badge | DATA | FILLED / ACCEPTED / PARTIALLY FILLED / REJECTED / CANCELED / SUBMITTED |
| 21 | Pager Newer / Older + "at the newest rows" | DATA | drawn (DOM) |
| 22 | How to read disclosure | DATA | drawn (DOM) |
| 23 | Order funnel (submitted, risk grant, venue acknowledged, filled with percentages) | TYPED_ABSENCE | "Open an order to see its path"; no scope-level funnel numbers |
| 24 | Conditional groups disclosure ("n groups") | DATA | "3 of 3 on this page" table drawn (DOM) |
| 25 | Provenance disclosure | DATA | drawn (DOM) |
| 26 | First audit screenshot (blotter.png) | PARTIAL | captured a loading skeleton; the DOM had loaded. Re-shot after 6 s settle |

### 11. Sandbox certification

Route: `/deployments/sandbox/dep_sandbox_01`. Screenshots: sandbox.png. Elements: 23. DATA 17, TYPED_ABSENCE 3, PARTIAL 3, MISSING 0.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar | PARTIAL | env chip + "Window: Certification run" chip; no basis chip, no scope selector |
| 2 | Breadcrumb | DATA | drawn |
| 3 | SANDBOX chip + title + subtitle | DATA | drawn |
| 4 | Runtime chip | TYPED_ABSENCE | "Not available: Runtime" |
| 5 | Display freshness chip | TYPED_ABSENCE | "Not available - Source unavailable" |
| 6 | Reconciliation chip (2 OPEN) | DATA | drawn |
| 7 | Stage chips R1/R2/Paper/Sandbox/Canary/Live | PARTIAL | six dashed empty squares, Sandbox marked failed; no tick states for prior stages |
| 8 | Source-partial banner (extra) | DATA | drawn |
| 9 | Tabs Reconciliation/Steps (7)/Promotion plans/Timeline | DATA | drawn |
| 10 | KPI Steps passed 4/7 | DATA | drawn |
| 11 | KPI Open findings 2 | DATA | drawn |
| 12 | KPI Critical open | DATA | drawn |
| 13 | KPI Promotion plans | DATA | drawn |
| 14 | KPI Gate BLOCKED | DATA | drawn |
| 15 | Internal / Broker / Difference three-column reconciliation | TYPED_ABSENCE | "Not available: Internal, Broker and Difference figures" |
| 16 | Findings table | DATA | drawn |
| 17 | Exit review panel with blocking reasons | DATA | drawn |
| 18 | Submit for review + reason | DATA | drawn |
| 19 | Request Sandbox exit review + reason | DATA | drawn |
| 20 | What exit needs / provenance disclosures | PARTIAL | "What exit needs" drawn; provenance drawn separately |
| 21 | Record review note form | DATA | drawn (min 8 chars vs 24 in design) |
| 22 | Steps tab: seven certification steps with PASS / FAIL / UNAVAILABLE and evidence line | DATA | seven step cards drawn (opened in probe) |
| 23 | Steps tab: lineage block (research artifact, R1/R2 approval, paper exit review, promotion grant) | DATA | drawn (extra) |

### 12. Canary control room

Route: `/deployments/live/dep_canary_01/canary`. Screenshots: canary.png. Elements: 23. DATA 7, TYPED_ABSENCE 12, PARTIAL 4, MISSING 0.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar | PARTIAL | env chip, "Window: Trial window" chip, USDT chip; no segmented env/scope controls |
| 2 | Red guard frame around header | DATA | drawn |
| 3 | Breadcrumb | DATA | drawn |
| 4 | LIVE - CANARY "Real capital at risk" tag | DATA | drawn |
| 5 | Title + subtitle | PARTIAL | subtitle has "Alpha Not available" |
| 6 | Runtime chip | TYPED_ABSENCE | "Not available: Runtime, Reconciliation" |
| 7 | Display freshness chip | TYPED_ABSENCE | "Not available - Broker source unavailable" |
| 8 | Reconciliation chip | TYPED_ABSENCE | same absence |
| 9 | Stage chips R1..Live with ticks | PARTIAL | six dashed squares, Canary marked, no ticks |
| 10 | Trial day 6 of 14 progress bar + exit review countdown | TYPED_ABSENCE | "Duration 14 days"; "Not available: Trial day, Started, Exit review opens" |
| 11 | KPI Capital consumed (% of approved) | TYPED_ABSENCE | listed in one "Not available" line |
| 12 | KPI Gross notional | TYPED_ABSENCE | same line |
| 13 | KPI Daily PnL | TYPED_ABSENCE | same line |
| 14 | KPI Open orders | TYPED_ABSENCE | same line |
| 15 | KPI Broker equity vs internal | TYPED_ABSENCE | same line |
| 16 | Live vs Paper vs Backtest chart | TYPED_ABSENCE | "Not available: Live, Paper and Backtest series" |
| 17 | Promotion decision: Hold / Reduce / Rollback / Request scale + reasons | DATA | four dashed disabled buttons with one shared reason |
| 18 | Tabs Envelope / Positions & orders / Reconciliation / Guard rule | DATA | drawn |
| 19 | Envelope: status chip "within envelope" | PARTIAL | UNDETERMINED chip (source unavailable) |
| 20 | Envelope table: cap + approved | DATA | proposed values drawn |
| 21 | Envelope table: limit, consumed, used bar and percent | TYPED_ABSENCE | "Not available: Limit, Consumed, Used" |
| 22 | Before scale-up blocker list | DATA | six reasons drawn |
| 23 | Rollback readiness (4 items with READY / PASSED) | TYPED_ABSENCE | "Not available: Flatten plan prepared, ..." |

### 13. Live operations

Route: `/deployments/live/dep_live_01`. Screenshots: live.png. Elements: 20. DATA 7, TYPED_ABSENCE 11, PARTIAL 2, MISSING 0.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar | PARTIAL | env chip + "Window: Since activation" chip; no basis chip, no scope |
| 2 | Red guard frame | DATA | drawn |
| 3 | Breadcrumb | DATA | drawn |
| 4 | LIVE "Real capital at risk" tag + title + subtitle | DATA | drawn |
| 5 | Runtime chip | TYPED_ABSENCE | "Not available: Runtime, Reconciliation" |
| 6 | Display freshness chip | TYPED_ABSENCE | "Not available - Freshness not published" |
| 7 | Reconciliation chip (MATCHED) | TYPED_ABSENCE | same absence |
| 8 | Stage chips with ticks | PARTIAL | six dashed squares, Live marked |
| 9 | Source-not-qualified banner | DATA | "Source not qualified." banner drawn (honest state) |
| 10 | KPI Capital | TYPED_ABSENCE | one "Not available" line lists all five KPIs |
| 11 | KPI Gross notional | TYPED_ABSENCE | same line |
| 12 | KPI Daily PnL | TYPED_ABSENCE | same line |
| 13 | KPI Open orders | TYPED_ABSENCE | same line |
| 14 | KPI Broker equity | TYPED_ABSENCE | same line |
| 15 | Live net PnL chart with drawdown strip | TYPED_ABSENCE | "Live net PnL series" listed as not available; no chart frame |
| 16 | Protective ladder Halt/Reduce/Emergency close | DATA | three steps drawn, disabled with reason |
| 17 | What is blocking list | DATA | nine reasons |
| 18 | Tabs Exposure & orders / Continuity / Predecessor envelope / Guard rules | DATA | drawn |
| 19 | Internal / Broker / Difference mismatch columns | TYPED_ABSENCE | "Not available: Internal, Broker and Difference figures" |
| 20 | Positions table (symbol, side, qty, entry, uPnL, leverage, latency) | TYPED_ABSENCE | "Not available: Position rows, Open order rows"; link to blotter only |

### 14. Trade replay

Route: `/deployments/alphas/alpha_a?tab=replay (a tab of Alpha 360 under MORE, no own route)`. Screenshots: trade-replay.png. Elements: 18. DATA 7, TYPED_ABSENCE 0, PARTIAL 8, MISSING 3.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Own screen "Trade Replay" with title + "Fills on candles - alpha" subtitle | PARTIAL | rendered as a section inside Alpha 360 (More tab); no own title |
| 2 | Context bar (env, window, basis, scope) | PARTIAL | env drawn, "Not applied: Window" |
| 3 | Context links chips (alpha, deployment, account) | PARTIAL | "Book Real-funded / Account acct_binance_02" chips inside the panel |
| 4 | Freshness chip | DATA | FRESH As of |
| 5 | Design-preview toggles (Candles available/not, state Normal/Loading/Empty/Partial/Stale) | MISSING | not drawn (design-preview aid only) |
| 6 | Candles panel: symbol select | DATA | BTCUSDT |
| 7 | Candles panel: interval select | DATA | 1h (derived) |
| 8 | Marker legend (long/short entry/exit, TP line, SL line) | DATA | legend text drawn (more detailed) |
| 9 | Last candle / fills in view / step hint line | PARTIAL | "25 bars - 1h - 3 fills - 2 legs"; mark price shown |
| 10 | Candlestick chart with fill markers | PARTIAL | candles and markers drawn; price axis scaled to off-scale TP/SL so candles are squashed in the bottom band |
| 11 | TP/SL lines and entry-to-TP/SL position boxes | DATA | drawn ("3 position boxes") |
| 12 | Event lanes under chart: STAGE / DECISION / INCIDENT | MISSING | not drawn |
| 13 | Chart footer counts ("14 of 14 fills in this window", events) | PARTIAL | "6 orders loaded" bar plus load-more button |
| 14 | Trade log table (time, event, order, leg, type-side, qty, price/trigger, fee, result) | DATA | all nine columns, 8 rows |
| 15 | Order id chips linking to orders | PARTIAL | plain text ids |
| 16 | Show all 35 events / Showing newest 10 | PARTIAL | "Load more orders" |
| 17 | "How this is built" disclosure | DATA | drawn |
| 18 | Candles-not-available state ("Price candles are not available yet" + log still shown) | MISSING | not reproduced in the audit run; no toggle to reach it |

### 15. Operations

Route: `/execution/operations`. Screenshots: operations.png. Elements: 22. DATA 6, TYPED_ABSENCE 3, PARTIAL 5, MISSING 8.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar | PARTIAL | "Own filter below - Own range below" text, no controls |
| 2 | Title + subtitle "Commands, exceptions and audit" | PARTIAL | title only |
| 3 | Freshness chip | PARTIAL | "Observed 22 Aug 13:00Z" + "Source journal unavailable" |
| 4 | Sidebar Operations count badge | MISSING | none |
| 5 | KPI Unknown outcomes (+ "Check the original request") | DATA | 4 |
| 6 | KPI Pending receipts | TYPED_ABSENCE | Not published |
| 7 | KPI Display catching up | TYPED_ABSENCE | Not available (no projection display state) |
| 8 | KPI Open exceptions | TYPED_ABSENCE | Not published |
| 9 | Source health disclosure "2 of 3 partial" | DATA | "3 of 3 partial" |
| 10 | Tabs Commands / Exceptions / Audit | DATA | drawn (no count on Exceptions) |
| 11 | Lens Needs attention / Mine / All | DATA | drawn; "Mine" typed unavailable |
| 12 | Range 24H/7D/30D/90D/ALL | DATA | drawn |
| 13 | Source All / Commands / Admin journal | MISSING | replaced by Triage/Severity/Verification/Target selects |
| 14 | Operation and Receipt and Display filter dropdowns | PARTIAL | Environment, command key, triage, severity, verification, target; no Receipt or Display dropdown |
| 15 | Command rows (time, target, operation) | MISSING | zero rows: "All 50 loaded rows are older than 24H" |
| 16 | Intent badge column | MISSING | no rows, header only |
| 17 | Receipt badge column (UNKNOWN, PARTIAL, PENDING DRAIN, APPLIED, UNCERTAIN) | MISSING | no rows, header only |
| 18 | Display badge column (RECONCILING, CATCHING UP, CURRENT, NOT APPLICABLE) | MISSING | no rows, header only |
| 19 | Next action (Check original request, Open obligations) | MISSING | no rows, header only |
| 20 | Footer "5 shown" | PARTIAL | "50 of 61 matching - 120 in scope" + Load more + Refresh |
| 21 | Counts-by-status panels (extra, V1) | DATA | triage/verification/source status/severity counts |
| 22 | Row selection -> ops drawer (hl-ops-drawer) | MISSING | not reachable: no rows rendered |

### 16. Approvals cockpit

Route: `/governance/approvals`. Screenshots: approvals.png, approvals2.png. Elements: 27. DATA 14, TYPED_ABSENCE 0, PARTIAL 7, MISSING 6.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar | PARTIAL | env chips + "Not applied: Window"; no window, basis, scope |
| 2 | Title + subtitle "Every decision, sorted by SLA" | PARTIAL | title + counts line "30 pending, 11 overdue, 1 due soon" |
| 3 | Freshness chip | MISSING | not drawn |
| 4 | New request button | DATA | drawn |
| 5 | Keys button | DATA | drawn |
| 6 | Sidebar Approvals count badge | MISSING | none |
| 7 | Queue header "By SLA" | DATA | drawn |
| 8 | Queue lane chips (All, R1, R2, Exit, Live, Archive, Reactivation, Capital, Waiver) with counts | DATA | drawn, plus Open/Needs you/Yours/Closed chips |
| 9 | Queue rows: kind tag, title, subtitle | DATA | drawn |
| 10 | Queue rows: state badges (PENDING 0/2, OVERDUE, BLOCKER, NEEDS YOU, CLOSED, YOURS) | DATA | drawn |
| 11 | Queue rows: SLA bar + "left / past budget" + approvers count | DATA | drawn |
| 12 | Queue "Decided today" disclosure | MISSING | not drawn |
| 13 | Keyboard help footer (J K A R N ?) | DATA | drawn |
| 14 | Detail header: kind tag, title, id chip, requested-by line | PARTIAL | kind tag + title + id; requester line absent ("Ladder: Not published") |
| 15 | Verdict banner ("Can be approved - 2 obligations stay open", checklist 3/4, quorum, time left, segmented bar) | PARTIAL | "R1 approved" verdict only; no checklist/quorum meter |
| 16 | Evidence: prior economic history chart | MISSING | not drawn (Criteria panel "Not published") |
| 17 | "Still open after approval" table (positions, orders, reservations, unknown, settlement) | MISSING | not drawn |
| 18 | Checklist disclosure | MISSING | not drawn |
| 19 | Provenance disclosure | PARTIAL | "What the server offers" disclosure only |
| 20 | Lineage / capital change preview / account and risk plan (preview's own evidence for R2) | DATA | drawn |
| 21 | Decision panel: separation-of-duty line | DATA | drawn |
| 22 | Decision panel: quorum meter "0 of 1 so far" | DATA | "Quorum 0 of 2 approvers" |
| 23 | Decision panel: note field | DATA | drawn |
| 24 | Decision panel: primary Approve button with key hint | PARTIAL | Approve button disabled behind a STEP-UP requirement; no "A" key chip |
| 25 | Decision panel: Other decisions menu | DATA | drawn |
| 26 | Receipt PREVIEW - NOT RECORDED (decision, request, you, counts as, what changes) | PARTIAL | "Receipt" panel: decision none, request id; ladder/call/receipt ref/what changes "Not available" |
| 27 | Preview-build banner (extra) | DATA | "Preview build. Decisions are shown here, not recorded." |

### 17. New approval request

Route: `/governance/approvals/new`. Screenshots: new-approval.png, newreq.png. Elements: 14. DATA 4, TYPED_ABSENCE 0, PARTIAL 7, MISSING 3.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar | PARTIAL | env chips + "Not applied: Window" |
| 2 | Title + subtitle "Research -> R1 gate" | PARTIAL | title only |
| 3 | Route page / Drawer from the queue toggle | MISSING | not drawn (drawer exists in the cockpit via New request) |
| 4 | Freshness chip | MISSING | not drawn |
| 5 | Stepper 1 Declare / 2 R1 / 3 R2 with captions | PARTIAL | three steps without the "you, now / quant reviewer, not you / only after R1" captions |
| 6 | Alpha picker | PARTIAL | "Run Library not available", falls back to typed ids |
| 7 | Evidence run picker + Run library link | PARTIAL | drawn, disabled until alpha picked |
| 8 | Methodology claim | PARTIAL | text "Pick a run first" + id field in "Ids - edit by hand" |
| 9 | Ids - edit by hand disclosure | DATA | drawn (open) |
| 10 | Summary textarea with counter (min 24) | DATA | drawn, min 8 |
| 11 | "What happens next" panel (digest, reviewer, duplicates) | PARTIAL | collapsed disclosure, not a side panel |
| 12 | Still needed bar: INCOMPLETE chip + list of missing fields | DATA | drawn |
| 13 | Submit for R1 review button with hint | DATA | drawn |
| 14 | Preview the result states disclosure | MISSING | not drawn |

### 18. Profile & Access

Route: `/administration/profile-access`. Screenshots: access.png, access2.png. Elements: 15. DATA 5, TYPED_ABSENCE 3, PARTIAL 1, MISSING 6.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar | MISSING | no context bar on this page at all |
| 2 | Title + subtitle "Bobby - Manager" | PARTIAL | title only |
| 3 | Freshness chip | MISSING | not drawn |
| 4 | KPI Signed in as | DATA | "Fixture reviewer usr_..." |
| 5 | KPI Role preset (Manager, read-all - owner) | TYPED_ABSENCE | "Not available - shown by capability (FE-015)" |
| 6 | KPI App sign-in (Active, ends in 7h 12m) | MISSING | replaced by "Owner"/"Capabilities held 14" tiles |
| 7 | KPI Business access (Accepted, membership r19) | TYPED_ABSENCE | "Access policy: Not available" |
| 8 | What you can see: area x scope table | DATA | 12 rows with CAN SEE and basis (scope vocabulary "ALL AUTHORIZED" absent) |
| 9 | What you can do: action / status / why table | DATA | 15 rows, ALLOWED / NOT AVAILABLE YET with reasons |
| 10 | STEP-UP chips on R2 and manage grants | MISSING | not drawn |
| 11 | Granted to you table (who, since, until, state) | TYPED_ABSENCE | "Not available. No workspace is named for this read." |
| 12 | Reason dictionary disclosure | DATA | "Reasons this screen can show" |
| 13 | Manage grants: step-up required chip | DATA | chip drawn on the Manage grants tab |
| 14 | Manage grants: role preset tabs + preset matrix | MISSING | tab opens to "Something went wrong - Could not read the access policy" |
| 15 | Manage grants: account x gate SEE/DECIDE grid | MISSING | not drawn (same error) |

### 19. Admin Actions

Route: `/administration/actions`. Screenshots: admin.png, admin2.png. Elements: 19. DATA 13, TYPED_ABSENCE 0, PARTIAL 4, MISSING 2.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar | PARTIAL | "Not applied: Environment, Window" only |
| 2 | Title + subtitle "Plan, apply and verify. Administrators only." | PARTIAL | title only |
| 3 | Freshness chip | PARTIAL | UNAVAILABLE chip + "Read 17 Oct 12:04Z" |
| 4 | Open in Operations (source: admin) link | DATA | drawn |
| 5 | Design-preview toggles (page and command states) | MISSING | not drawn (design aid) |
| 6 | Filter chips All / Ready / Not enabled / Start elsewhere / Not offered with counts | DATA | drawn; counts differ (Ready 0, Not enabled 12, Not offered 8) |
| 7 | "n of 24 can run now" | DATA | "0 of 24 can run now" |
| 8 | Relay-off authority banner (extra) | DATA | drawn |
| 9 | Group READ (7 actions) with state | DATA | drawn, all NOT ENABLED / NOT OFFERED (design shows 6 ready) |
| 10 | Group PORTFOLIO CAPITAL with START IN PORTFOLIOS + Open | DATA | drawn |
| 11 | Group DEPLOYMENT RISK | DATA | drawn, none ready |
| 12 | Group ACCOUNT | DATA | drawn, none ready |
| 13 | Group SYNC AND RECONCILIATION | DATA | drawn, none ready |
| 14 | Group EMERGENCY | DATA | drawn, none ready |
| 15 | Group descriptive subtitle + "n of m ready" | PARTIAL | "0 of n ready" drawn; the "Look only. Nothing changes." sentence absent |
| 16 | Per-action description + scope + state | DATA | drawn (longer wording) |
| 17 | Action detail pane (what/scope/who/how/state + Run local read form) | MISSING | not drawn (no row selection pane) |
| 18 | Footer "Capital actions are not started here" + link | DATA | drawn |
| 19 | Provenance disclosure | DATA | drawn |

### 20. Users

Route: `/administration/users`. Screenshots: users.png, users2.png. Elements: 17. DATA 7, TYPED_ABSENCE 3, PARTIAL 5, MISSING 2.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Context bar | MISSING | none on this page |
| 2 | Title + subtitle "Accounts and role presets - Administrators only" | PARTIAL | title only |
| 3 | Relay qualified chip + My access link | PARTIAL | "STEP-UP REQUIRED" chip + "Open the current Users screen" link |
| 4 | Design-preview toggles (page and step-up states) | MISSING | not drawn (design aid) |
| 5 | Count tiles (Accounts, Active, Invited, Disabled, Archived, Locked) (extra) | DATA | drawn, not in manager image |
| 6 | Search by name or username | DATA | drawn |
| 7 | Role-preset filter chips with counts (Manager/Researcher/Operator/Reviewer/Viewer) | TYPED_ABSENCE | "Role: all" select; "Not available: Role presets, Last sign-in" |
| 8 | State filter (extra) | DATA | drawn |
| 9 | Invite account button | DATA | drawn, plain (no primary style) |
| 10 | Accounts table: Account name + username chip + "(you)" | PARTIAL | name + username chip, no "(you)" marker |
| 11 | Accounts table: State badge (ACTIVE, DISABLED, INVITED, ARCHIVED) | DATA | drawn plus LOCKED / AWAITING FIRST PASSWORD |
| 12 | Accounts table: Role preset column | TYPED_ABSENCE | every cell "Not available" |
| 13 | Accounts table: Last seen (UTC) | TYPED_ABSENCE | every cell "Not available" |
| 14 | Accounts table: Role (Administrator/User) and Revision (extra) | DATA | drawn |
| 15 | Accounts table: Actions Disable/Enable + reason ("You cannot disable yourself") | PARTIAL | Disable/Enable with "?" help; no inline reason text |
| 16 | Archived row note "Archived accounts stay as they are" | DATA | drawn |
| 17 | Footer "7 of 7" + How accounts work disclosure | PARTIAL | "Showing 50 of 123" + Load more; no "How accounts work" |

### 21. Incident

Route: `no page route; opens as a drawer over Operations at /execution/operations/incidents/inc_fixture_44`. Screenshots: incident-a.png. Elements: 13. DATA 4, TYPED_ABSENCE 2, PARTIAL 4, MISSING 3.

| # | Element in the manager image | Status | Note |
|---|---|---|---|
| 1 | Own page screen (not a drawer over the queue) | PARTIAL | exists only as a right-hand drawer on the Operations page |
| 2 | Context bar | MISSING | queue page shows "Not applied: Window - Own filter below" |
| 3 | INCIDENT tag + title | DATA | "Incident inc_fixture_44" with OPEN - WARNING chip |
| 4 | Id chip, target link, assignee line | PARTIAL | target account link and environment drawn; assignee "Not available" |
| 5 | Freshness chip | MISSING | not drawn |
| 6 | Forward-only stepper Open / Mitigated / Resolved + note | DATA | drawn |
| 7 | Evidence panel with per-source chips (findings, alerts, dead letters, order trace) | TYPED_ABSENCE | "Not available: Evidence" |
| 8 | Operations taken (linked operation + verify state) | TYPED_ABSENCE | "Not available: Operations taken" |
| 9 | Resolution gates list (4 gates, blocked marks) | PARTIAL | only the heading was visible under the overlay; no gate rows seen |
| 10 | Timeline (created, annotated with versions) | PARTIAL | Created/Updated/Version fact rows, no timeline list |
| 11 | Actions: Acknowledge / Assign to me | DATA | drawn, each with a "Not published" reason |
| 12 | Actions: Record exposure mitigated / Attach dry-run evidence | MISSING | not drawn |
| 13 | Actions: Mark mitigated (+ Mark resolved) | DATA | drawn, with reason |


## 3. Artifact 2 "Execution V2 Concepts": what it asks for

Read from the saved artifact HTML (4 concepts, each with images, "Needs from the backend" and a question; "Nothing here is approved"):

| Concept | Asks for | Preview state (measured) |
|---|---|---|
| C1 Command bar and context | Cmd K jumps to any alpha, portfolio, account, operation or approval; context bar (environment, window, currency, scope, as-of) that stays across screens; digest "since your last visit"; fleet heat map (size, health, return) | Ctrl+K opens a palette with "GO TO" route links only and the line "Entity search - Not published (FE-023)". Context bar is a per-screen strip: environment chips, window chips on Overview only, "Not applied: Window" elsewhere, no basis chip, no scope selector. Digest: "Not published". Heat map: "Map - Not published (FE-035)". |
| C2 Capital flow and compare | Capital drawn as a flow (funds in, NAV, dashed "limit, not cash" link, alphas, deployments, exposure/margin/PnL), simulated capital below a divider; Compare overlays 2 to 4 portfolios or alphas with one metric table | Flow diagram: not drawn ("Not available: Capital flow, Ledger receipts"); a capital ledger table and simulated block are drawn on Portfolio 360 Allocations. Compare screen exists (portfolios only, chips, metric table) but the overlay chart is empty on every pair I tried. |
| C3 Lifecycle spine, fleet board, event ribbon | Journey spine (R1, R2, Paper, Sandbox, Canary, Live) with days in stage, criteria meter and who decides; fleet board by stage with readiness per card; one equity chart with a ribbon pinning stage changes, decisions, incidents, recalls and capital flows | Spine: six cards drawn as empty dashed frames ("Not published: days in stage, gate criteria and decider"). Board: drawn (5 lanes) with reduced cards and no readiness. Ribbon: not on the main chart; a five-lane ribbon exists only on the Activity & Decisions tab, one marker, other lanes "Not published". |
| C4 Reviewer decision cockpit | One shell for every gate; queue by SLA, keys J K A R N; evidence diff; drift verdict table; decision receipt that previews first and records after confirm | Cockpit drawn: queue by SLA with lane chips, keys J K A R N footer, decision panel with step-up, receipt panel "None recorded". Evidence diff, drift verdict table and receipt preview fields are "Not published / Not available". |

## 4. Explicit tests

| Test | Result | Evidence |
|---|---|---|
| Does Ctrl+K open a command bar? | PARTIAL. It opens a modal palette with route shortcuts (Command Center, Portal Map, Overview, ... Blotter) and "Entity search - Not published (FE-023)". It is not the artifact's search box: there is no "Search or jump to... Cmd K" field in the top bar, no alpha/approval results. (In the first scripted run the page crashed on the key press once; a second run opened the palette on /execution, so I treat the crash as environmental, but I did not reproduce it again.) | probe script `k.mjs`; text of the dialog captured |
| Is there an event ribbon on Alpha 360? | Not on the default view. On tab Activity & Decisions: yes, reduced (five lanes, kind chips with counts, a stage band, one decision marker; stage/incident/recall/flow "Not published"). | `shots/alpha-btc-activity.png` |
| Does the shell show the persistent context bar (environment, window, basis, scope)? | No. A "CONTEXT" strip is drawn on every execution route, but it shows environment chips (Real-funded/Paper/Sandbox) and, depending on the route, either window chips (Overview), a fixed-window chip (deployment screens), or "Not applied: Window". No basis chip and no scope selector on any route; no as-of chip (as-of is text beside the title). Access, Users and Admin have no strip or a text-only one. Top bar: workspace, RESEARCH, theme and density selects; no search field, no user chip, no crumbs in the artifact's form. | all 23 audit screenshots |
| Sidebar | V1 chrome: Command (Command Center, Portal Map), Execution (6), Administration, Research (QuantBT, Alpha Pool, Alpha Mining, Strategy Composer), Data & Operations, Planning. No count badges on Operations or Approvals. | any screenshot |
| Build flags | The preview bundle's manifest names: fleet, archived, portfolios, alpha, workbench, account, ops, profile, overview, cockpit, shell, compare, blotter, admin, users, replay, sandbox, canary, live, request, scoped, fleet-stream. So the missing shell pieces are not simply "flag off" (I did not find out why, see section 8). | `curl` of the served JS, grep of the manifest |

### "Where each V1 screen went" (Artifact 1 table) versus the preview routes

Portal Command Center and Portal Map are out of scope (still in the sidebar).

| V1 screen | V2 destination | In the preview |
|---|---|---|
| Command Center | Overview | `/execution` exists, renders V2 Overview |
| Operations Queue | Operations | `/execution/operations` exists; table shows zero rows on the default 24H window |
| Incident detail | Incident | No page. Drawer over Operations at `/execution/operations/incidents/<id>` |
| Approval Inbox | Approvals (cockpit) | `/governance/approvals` exists, cockpit layout |
| Gate R1, R2, Live, Exit review | Approvals lanes | Merged: lane chips All/R1/R2/Exit/Live/Waiver/Archive/Reactivation/Capital |
| Waivers | Approvals waiver lane | Waiver chip and an Open/Expiring/Waived/Lapsed sub-filter exist; runway chart not seen |
| New Approval Request | New request | `/governance/approvals/new` exists; drawer from the queue's New request button opens |
| Admin Actions | Admin | `/administration/actions` exists |
| Profile and Access | Access | `/administration/profile-access` exists; Manage grants tab errors |
| Users | Users | `/administration/users` exists |
| Paper, Sandbox, Live lists | Fleet lenses (URLs redirect) | Stage tabs exist on Fleet; redirects not tested |
| Paper Workbench | Deployment | `/deployments/paper/<id>` exists |
| VN-market workbench | Chip on Deployment | Not seen on the deployment screenshot |
| Sandbox, Canary, Live Ops | Sandbox, Canary, Live | all three exist |
| Blotter | Blotter | exists |
| Alpha Fleet | Table, board, map | table and board exist; map renders "Not published" |
| Alpha 360 tabs | Alpha 360 | exists |
| Insight Charts tab | Owning tabs of Alpha 360 | dissolved, nothing to check |
| Trade Replay | Trade replay | only as the "More" tab inside Alpha 360, no own route or title |
| Portfolios, Portfolio 360 | + Compare | all three exist |
| Accounts list | Accounts | exists |
| Binding Detail | Account, Physical binding view | exists as a toggle on Account 360 |
| Account 360 | Account 360 | exists |
| Archived Alphas | Fleet Archived lens | tab exists; "Archived list: Not available" |

## 5. The 28 highlights (hl-* images; the task text said 27, the extracted set and `_highlights.json` list 28)

Status words: PRESENT (drawn, close), PARTIAL, TYPED ABSENCE (frame with honest reason), MISSING, NOT REACHED (state could not be reached in the preview).

| # | Highlight | Status | What I saw |
|---|---|---|---|
| 1 | Cmd K command bar | PARTIAL | Palette with route links; entity search "Not published (FE-023)"; no top-bar field |
| 2 | Context bar + digest | PARTIAL / TYPED ABSENCE | strip without basis/scope; digest "Not published" |
| 3 | Fleet board | PARTIAL | five lanes; cards lack allocation, x/7 text, SIM/REAL tag, hatch, exit-review badge |
| 4 | Heat map | TYPED ABSENCE | "Map - Not published (FE-035)" |
| 5 | Row peek | PARTIAL | drawer opens on row click (lifecycle, identity, deployments); readiness and compare "Not published". The extracted hl-fleet-peek.jpg actually shows the Alpha 360 page, so I could not compare peek content |
| 6 | Capital flow ledger | PARTIAL | ledger table on Allocations; no flow diagram, no seq/receipt column |
| 7 | Capital actions with unrecorded preview | PARTIAL | Actions drawer exists; all six actions UNAVAILABLE; "Preview unavailable (FE-020)" |
| 8 | Compare | PARTIAL | screen, chips, metric table; overlay chart empty; no Alphas tab |
| 9 | Journey spine | PARTIAL | six empty frames |
| 10 | Event ribbon | PARTIAL | Activity tab only, one marker |
| 11 | Account reconciliation | PARTIAL | Internal/Broker/Difference drawn, broker and difference mostly "Not computed"; sync history drawn |
| 12 | Physical binding view | PRESENT | binding facts, capital invariant table, native custody, sleeves, margin |
| 13 | Deployment tabs on top | PRESENT | Overview/Orders/Fills/Positions/Sessions |
| 14 | Sandbox 7 steps | PRESENT | seven step cards (PASS/FAIL/UNAVAILABLE) + lineage |
| 15 | Canary guard frame | PARTIAL | red frame, envelope proposed values, promotion buttons disabled; KPIs and chart typed absent |
| 16 | Live mismatch (broker values hidden) | NOT REACHED | preview shows the source-not-qualified state instead |
| 17 | Replay | PARTIAL | candles, markers, TP/SL boxes, trade log drawn inside Alpha 360; no event lanes |
| 18 | Replay-none | NOT REACHED | no way to reach "candles not available" |
| 19 | Approvals cockpit | PARTIAL | queue, lanes, keys, decision, receipt drawn; evidence chart, obligations table, checklist missing |
| 20 | Waiver runway | MISSING | waiver list exists; no runway chart seen (detail pane stayed on an R2 request) |
| 21 | Receipt preview | PARTIAL | "Receipt: none recorded" with absent fields |
| 22 | New-approval Still-needed bar | PRESENT | INCOMPLETE chip + "Still needed: ..." list, on the route page |
| 23 | New-approval drawer from the queue | PRESENT | New request button opens the same form as a drawer |
| 24 | Ops drawer (intent, receipt, display) | MISSING | no command rows render, so the drawer cannot be opened; only the incident drawer exists |
| 25 | Accounts register | PRESENT | 50 rows, state, credential, check, updated; physical equity on 2 of 50 rows |
| 26 | Blotter | PRESENT | orders table, status chips, pager, groups |
| 27 | Admin by risk tier | PRESENT | six groups; every row non-ready on this profile |
| 28 | Access | PARTIAL | My access drawn with typed gaps; Manage grants errors |

Tally over the 28: PRESENT 8 (rows 12, 13, 14, 22, 23, 25, 26, 27), PARTIAL 15 (rows 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 15, 17, 19, 21, 28), TYPED ABSENCE 1 (row 4), MISSING 2 (rows 20, 24), NOT REACHED 2 (rows 16, 18). "PRESENT" means drawn and close in structure, not that its values match the artifact.


## 6. Lists

### 6(a) Routes that exist but look materially different from the manager image

Shell (every route): no top-bar search or user chip; sidebar still V1 groups (Command Center, Portal Map, Research, Data & Operations, Planning) and no count badges; context strip incomplete (see section 4). Fixture banner on every page.

| Screen | Visible gap (layout, density, wording, charts) |
|---|---|
| Overview | KPI cells stack three currencies (JPY/USD/USDT) so each tile is tall and busy; the design has one USDT figure per tile. Chart has no drawdown strip, no high/low markers, no added/returned markers, no Equity tab. Capital panel has no budget bar. Digest and Contributors are empty boxes. Title is "Overview, bobby" with a long explanatory sentence under it. |
| Fleet table | Row height is uneven because health badges wrap ("NEEDS ATTENTION" breaks mid-word in the table); three money columns are all "Not available"; no portfolio filter, no group-by, no checkbox/compare, no export; the Map toggle is missing. |
| Fleet board | Cards omit allocation, x/7 progress text, SIM/REAL-FUNDED tag, hatched simulated lanes, exit-review badge; lanes are long vertical lists (20 cards in Live) with no per-card money. |
| Fleet map | A dashed box "Not published (FE-035)"; KPI tiles also flip to "Not available" in this view. |
| Portfolios | 25 rows (fixture) instead of 7; the table is wider than 1440 so Return, Drawdown and Concentration are cut off and need horizontal scroll; no Health column; no total row; wrapped two-line money cells ("Real-funded - USDT" over the value). |
| Portfolio 360 | NAV, Net PnL, Return, Drawdown and the whole Capital panel are typed absence on the audit subject; Equity chart is a different series (account equity, with a hatched gap) instead of Net PnL with drawdown strip. |
| Compare | Overlay chart is an empty hatched frame even with two selected portfolios; the chip list shows all 25 portfolios; Portfolios/Alphas tabs missing. |
| Alpha 360 | Spine is six empty dashed cards; KPIs are Net PnL and Exposure (not Return/Drawdown/Regime fit); no drawdown strip; chart is account equity. |
| Account 360 | Close. Gaps: no native-attribution column, no provenance on the physical panel, no high marker on the equity chart. |
| Accounts | Close in structure; only 2 of 50 rows carry physical equity or headroom, so the Check column is "NOT AVAILABLE" on almost every row (HEAD has a later commit, e34ee4d55, that publishes list figures; not in this build). |
| Deployment | Lifecycle is six empty squares with no ticks or criteria count; Runtime and Reconciliation cards absent; the sticky "On scroll" strip overprints the chart in the full-page capture. |
| Sandbox | Close, except header chips for Runtime and Freshness are "Not available" and the stage chips are dashed empties. |
| Canary | Layout frame is right; every number is typed absence; no Live-vs-Paper-vs-Backtest chart; envelope shows proposals only. |
| Live | Same: banner "Source not qualified"; KPI row collapsed into one "Not available:" sentence; no chart, no positions table. |
| Trade replay | Not a screen: a section inside Alpha 360 under More; price axis is scaled to off-scale TP/SL so the candles are squashed to a thin band; no stage/decision/incident lanes. |
| Operations | Zero command rows on the default window ("All 50 loaded rows are older than 24H"), so the Intent/Receipt/Display badge columns, Next actions and the row drawer are not visible; extra "Counts by status" panels not in the design; Source filter replaced by triage/severity selects. |
| Approvals | Close in structure; detail pane shows lineage/capital preview instead of the evidence chart + obligations; queue is 30 rows long. |
| New request | Close; missing step captions, "What happens next" side panel (collapsed), Route page / Drawer toggle, result-state preview. |
| Access | Typed gaps in the first row of tiles; no step-up chips; Manage grants tab shows "Could not read the access policy". |
| Admin | Same six groups and 24 actions; every row non-ready; no detail pane with Run local read. |
| Users | Role-preset column and last-seen are "Not available" on every row; no filter chips by preset. |
| Incident | Drawer, not a page; evidence/operations typed absence; no timeline list, no gate list seen. |

### 6(b) The "new" screens and their state

| Screen | State in the preview |
|---|---|
| Compare | Route exists and loads; candidates, chips and metric table draw; chart empty on every pair tried (real-funded plus simulated books are flagged "not comparable"); Alphas subject tab absent. Reachable only by URL or the portfolio table's compare bar. |
| Trade replay | No own route. Tab "More" on Alpha 360 draws candles, markers, TP/SL boxes and a trade log. |
| New request | Route and drawer both work; fields fall back to typed ids because Run Library is "not available". |
| Incident | Drawer only, reached by URL `/execution/operations/incidents/<id>`; not reachable from the Operations table (no rows). |
| Users | Route exists (owner role); 123 accounts fixture; role presets typed absent. |
| Access | Exists; My access works; Manage grants errors on the access-policy read. |
| Account 360 | Exists and is among the closest to the design, including Physical binding and Reconciliation tabs. |
| Sandbox / Canary / Live frames | All three exist. Sandbox is mostly data (74%); Canary and Live are mostly typed absence. |

### 6(c) The five worst-fidelity screens (judged on visible layout and missing structure, not only on data)

1. Operations: V2 table never shows a single row on the default window (64% not-missing is misleading); intent/receipt/display badges, next-action buttons and the drawer are all invisible; 36% of my elements are MISSING.
2. Profile & Access: 40% MISSING, KPI tiles replaced, no step-up chips, Manage grants fails with an error and leaves a large blank gap.
3. Compare: the whole point of the concept (an overlay chart of 2 to 4 portfolios or alphas) is an empty frame; 40% typed absence, 20% missing, 13% data.
4. Alpha Fleet: heat map absent, board cards stripped, three money columns typed absent, KPI set different, no portfolio filter/group-by/compare checkboxes, context bar not applied; the largest set of elements (37) with 24% missing.
5. Incident: no screen, a drawer; gate list, timeline and two of five actions missing.

Runners-up: Overview (23% missing: shell search, user chip, count badges, drawdown strip, markers, budget bar, Equity tab), Trade replay (no own screen, no lanes, squashed candles), Alpha 360 (empty spine, no ribbon on the main chart).

### 6(d) Prioritized fix list

A. Purely frontend / fixture work (no new published contract needed; owner: Claude lane, can start now)

1. Operations: make rows visible. Either seed the fixture so some commands fall in the 24H window, or default the window to the data's observed range. This also unblocks the Intent/Receipt/Display columns, Next actions and the ops drawer (4 highlights).
2. Shell: replace the V1 palette with the V2 command bar for Execution routes (the code exists: `execution/v2/shell/ExecCommandBar.tsx`, `CommandBar.tsx`, `ContextBar.tsx`); add the top-bar search field; draw basis and scope chips as typed state ("USDT one basis" is a fact of the screen; "Scope: All portfolios" is the default) even where the server cannot apply them; add count badges to Operations and Approvals from reads that already publish counts (queue health, approvals "30 pending"); hide the Research/Planning/Data groups in the Execution V2 build.
3. Fleet: add the Portfolio filter (portfolios are already published per alpha), a typed Group-by control, row checkboxes, a typed Map toggle in the view switch; draw SIM / REAL-FUNDED lane tags and hatching on the board (domain follows stage); fix badge wrapping.
4. Portfolios: fit the table to 1440 without horizontal scroll; add a typed Health column from published state.
5. Incident: promote the drawer to a routed page with the artifact's sections; add the missing action and gate rows as typed.
6. Trade replay: own route and title, the "candles not available" state, and typed STAGE/DECISION/INCIDENT lanes under the chart; fix the price axis so candles are not squashed by off-scale TP/SL.
7. Alpha 360: move the ribbon (already built on the Activity tab) onto the Performance chart; add the Live/In Sandbox/Blocked toggle on the spine.
8. Approvals: add the freshness chip, "Decided today", the verdict banner structure and the Receipt preview layout as typed; New request: step captions, side panel, Route page/Drawer toggle.
9. Access: fix the fixture so the access-policy read succeeds (Manage grants), draw step-up chips, KPI tiles per the design.
10. Admin: add the action detail pane; Users: add "(you)", inline disabled reason, "How accounts work".
11. Fixture population: make Portfolio 360, Compare and Alpha 360 fixtures consistent so the default audit subjects are not the emptiest ones (the 404 on the manager overview read for the TEST_ONLY subjects).
12. Account: add the "Not available - No source" native-attribution column and provenance disclosures (typed).

B. Needs a published contract or Edge input (cannot be honestly drawn from the frontend; client arithmetic is forbidden by the honest-display rule)

1. Fleet heat map (FE-035): per-alpha allocation, return and health payload; also Fleet KPIs "Ready for exit review" and "Archive in progress" and per-alpha allocation, Net PnL and equity sparkline (FE-027/028 readiness, manager time series FE-013).
2. Overview and Portfolio 360: Net PnL, Return and Drawdown series; drawdown strip; capital added/returned markers; budget used and limit; Contributors; "since your last visit" digest (per-user last-visit marker, C1 needs).
3. Capital flow diagram and per-deployment flows, exposure, margin, receipts (C2 needs); Portfolio 360 capital statements (FE-011/FE-020 preview for capital actions).
4. Compare: aligned series per partition for 2 to 4 subjects, alphas included; Score (FE-011, policy not set).
5. Alpha 360 spine: gate criteria source with observed values, days in stage, per-alpha stage history and receipts, event feed (kind, time, actor, receipt) (C3 needs); Return, Max drawdown, Regime fit.
6. Entity search index across alphas, portfolios, accounts, operations, approvals (FE-023, C1 needs).
7. Approvals: evidence-diff payload, obligations still open after approval, quorum and SLA counts, one-call decision with receipt (C4 needs); waiver lapse clocks for the runway.
8. Operations: Pending receipts, Display catching up, Open exceptions, Source filter, command rows with receipt and display axes (published queue health exists at HEAD, FE-CAT-2, not in this build).
9. Canary, Live, Sandbox: qualified broker source for KPIs, charts, positions, reconciliation, rollback readiness; mismatch state needs a published mismatch verdict.
10. Accounts: published list figures for physical equity, headroom and check on every row (HEAD has FE-CAT-4, not in this build); Account 360 native attribution.
11. Users: role presets and last sign-in; Access: role preset, business-access state, "Granted to you" (FE-015).
12. Admin: relay qualification so rows can be Ready.

## 7. Method, files and commands

Method. For each of the 21 families I opened the `<id>-mgr` image (and `-nq` where it exists: overview, fleet, portfolio, operations, approvals; I viewed the first four) with the Read tool, listed every distinct visible element (KPI tile, column, panel, chart, selector, drawer, chip, action), then compared with the 1440-wide full-page audit screenshot of the matching route and, where a tab, drawer or mode had to be opened, with extra screenshots I took. An element is marked DATA if drawn with fixture values, TYPED_ABSENCE if drawn as a typed "Not available/Not published" cell with a reason, PARTIAL if drawn but reduced or different (how stated in the Note column), MISSING if not drawn. An element counts only if I saw it in a screenshot or in the captured DOM text of that same route; DOM-only evidence is flagged in the note. Researcher (`-res`), wireframe and V1 images were not compared.

Limits of the numbers. They are counts over my own checklist: 461 elements, with more elements listed for the busier screens, so the overall percentage weights busy screens more. Another reviewer would list different elements. The preview is fixture data and not acceptance evidence. The DATA percentage depends on which fixture subject the audit route points at (see section 1, Portfolio 360).

Inputs read:
- Artifact 1 images and `_highlights.json` in `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/artifact/`; its text (V1-to-V2 table, flows) from the saved HTML `/home/bobby/.claude/projects/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/tool-results/artifact-f3ceb083-1792312382-0201.html`.
- Artifact 2 (`https://claude.ai/artifact/Ley56v4q8dF1P8C7uPvMrQ`) via the Artifact tool (action read), saved at `/home/bobby/.claude/projects/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/tool-results/artifact-9f2ab576-1792305713-b64b.html`; text extracted with python (images stripped).
- Audit screenshots `scratchpad/audit/*.png` and `scratchpad/audit2.json` (per-route DOM text, h1, `data-screen` roots, 4xx responses). Note: `blotter.png` caught a loading skeleton; the DOM text had loaded, so I re-shot it.
- Earlier notes: `HIFI_LOWFI_GAP_AUDIT_2026-10-22.md` (its "V2 today" column describes an older build and is superseded by this audit where they differ, for example Overview now has a Capital panel and a chart) and `SIMULATED_DATA_REGISTER_2026-10-22.md` (not needed beyond confirming fixture status).

Extra screenshots I took (scratchpad `mine/shots/`): `fleet-after-rowclick`, `blotter-settled`, `sandbox-steps`, `account-physical`, `account-recon`, `portfolio-actions`, `portfolio-scale001`, `compare-scale`, `incident-a`, `approvals2`, `approvals-newreq-drawer`, `approvals-waiver`, `newreq`, `access2`, `access-manage`, `admin2`, `users2`, `alpha-btc-activity`, `pf-core-alloc`, `ops-exceptions`, `ctrlk_execution`.

Scripts and commands (all under `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/mine/`): `probe.mjs`, `probe2.mjs`, `probe3.mjs`, `k.mjs` (Playwright via `node`, one browser at a time, Chromium, 1440x900, against `http://127.0.0.1:8095`; clicks only open tabs, drawers and the palette; nothing was submitted); `txt.py` (prints per-route DOM text from `audit2.json`); `s/*.md` (the 21 element lists); `compile.py` (`python3 -I compile.py` computes the counts and writes the tables below). Flag manifest read with `curl` of the served bundle (`index-gJX3lnBx.js` and the other chunks) and grep for the manifest string. Source read-only: `apps/portal/frontend/src/execution/v2/flags.ts`, `app/PortalRoutes.tsx`, `execution/ExecutionPreviewRoute.tsx`, `execution/v2/shell/`. Worktree reset with `git reset --hard claude/post-land-20261022` (HEAD `09d1d2f2e`; 22 commits after `40d86acd1`, including Operations health strip FE-CAT-2, Accounts list figures FE-CAT-4, Paper-history qualification, pending-control preview).

## 8. What I could not verify

- Why the shell pieces are absent although the bundle manifest names `shell`, `ops`, `profile`, `cockpit`: I read the gating code only far enough to see that the Context strip is mounted under `EXECUTION_V2_SHELL` and Operations under `isV2Screen("ops")`; I did not find the reason the top-bar search, user chip, badges and persistent context bar are not drawn. Needs a look by the lane owner.
- The build commit of the preview (taken from the task text, `40d86acd1`); I did not inspect the image label. The 22 later commits may change Operations and Accounts rows.
- States not reachable in the preview: Live mismatch, Replay-none, ops drawer (no rows), waiver runway detail (the waiver lane's detail pane was not selected), Approvals "Other decisions" menu (button not found), Fleet Archived tab contents, Access Manage grants content (errors), redirect behaviour of the old Paper/Sandbox/Live URLs, the VN-market chip.
- Researcher views, wireframes, V1 images, and the -nq state of Approvals were not compared.
- Pixel-level spacing, type sizes, colour tokens and responsive widths were not measured; the density and wording remarks are visual.
- `hl-fleet-peek.jpg` shows the Alpha 360 page, so I compared the peek only to its caption.
- Hover, focus and keyboard behaviour (J K A R N, step-up) were not exercised.
- One Ctrl+K run crashed the page target; a second run opened the palette, so a repeatable crash was not established.
