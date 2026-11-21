# UX audit A (manager screens), 2026-10-20

FIXTURE_LAB. Not acceptance evidence. Base `e88f0b03` (what the live preview on :8095 was built from).
Screens: Fleet (table, board, lenses, drawer, Archived), Overview, Portfolios, Portfolio 360 (6 tabs), Alpha 360 (6 tabs + More), Accounts, Account 360 (6 tabs), Compare.
Method: host Chromium (Playwright) against the live preview at 1440, 1024 and 390 px; the rendered text was read, not the code. "After" shots come from this tree served by Vite
on :5231 with `/api` proxied to the preview (`vite.audit-a.config.ts`, not committed; web fonts 403 through the symlinked node_modules, so "after" shots use the fallback font).
Before shots: `<screen>-<width>.png`, `*-top.png` (viewport), `<screen>-<tab>-1440.png`, text dumps `<screen>-<tab>.txt`. After shots: `after-*`.
Note: full-page shots show the sticky banner and top bar mid-page; that is the screenshot, not the page.

Flow checked: lens tabs (All, Real-funded, Sandbox, Paper, Archived), Board/Table, row click opens the drawer, Esc closes it and returns focus to the row, Owner/Health/Columns popovers and Esc,
search with no match (Fleet, Portfolios, Accounts: all offer "Clear filters"), Alpha 360 tab strip arrows and roving tabindex, Score drawer open/Esc, More menu, Portfolio 360 and Account 360 tab switches,
Tab order on Fleet (skip link first, 19 shell stops, then the content).

## Defects

| # | Screen | Defect | Fixed? | Where (sha 60ad243b for every "yes") |
|---|---|---|---|---|
| 1 | Fleet | KPI strip at 1024 px: 5 tiles in a 2-column grid, the sixth cell is an empty grey block | yes | `css/blocks.css` (odd last tile spans the row; every KpiStrip) |
| 2 | Fleet | Disabled "Window" and "Compare" buttons in the toolbar, named again by the "Not available:" line (three statements of one gap) | yes, buttons removed, the line stays | `fleet/index.tsx` |
| 3 | Fleet | Archived lens: full filter toolbar, "lens: Archived" chip and "Clear all" over a list that does not exist | yes, toolbar and chips hidden on that lens (the panel says it; the line stays for assistive tech) | `fleet/index.tsx` |
| 4 | Fleet | 1024 px: Portfolios column is one 418 px nowrap line, Stage/Health/Deployments are off-screen (table 1018 px in a 712 px panel) | partly: now 792 px, wraps in its cell; still scrolls inside its panel (LowFi says the table scrolls) | `css/fleet.css` |
| 5 | Fleet | Lane click (Real-funded, Sandbox, Paper) switches to the Manager dataset: "As of 1970-01-01 00:00:01 UTC", STALE, "TEST_ONLY:" rows, 2 rows under a ~28 count | no (fixture data; the screen reports it as given) | - |
| 6 | Fleet | Dataset mode prints a 2-sentence "Counts: Fleet read ... Table: Manager dataset ..." line | no, kept: it is what explains 40 in the strip against 2 rows | - |
| 7 | Overview, Portfolio 360 | Low flag drawn on top of the latest-value callout when the low IS the latest point | yes | `charts/EquityPanel.tsx` |
| 8 | Overview, Portfolio 360, Account 360 | Single-series legend repeats the chart title ("Core equity" under "Core equity . USDT") | yes, drawn only when it says more | `charts/EquityPanel.tsx` |
| 9 | Overview | Source health reads "Paper binance usdm" (id humanised, not a name) | no (needs a display name from the source) | - |
| 10 | Overview | Shell top bar truncates "Execution Command Cen..." at 390 px | no (shell chrome, outside group A) | - |
| 11 | Portfolios | "Export" disabled button plus "Export is not available yet." and a second copy in hidden text | yes, removed (also "Report pack" on Portfolio 360 and "Export" on Accounts) | `portfolios/index.tsx`, `portfolio/index.tsx`, `account/AccountsList.tsx` |
| 12 | Portfolios | Allocated capital: amount left-aligned in rows that carry a chip, right-aligned in the rest | yes | `css/portfolios.css` |
| 13 | Portfolios | The 70-character "Real-funded and Simulated books together" chip on 17 of 25 rows | yes, chip is two words, sentence in title and hidden text | `PortfolioTable.tsx` |
| 14 | Portfolio 360 | NAV tile breaks the date after "2026-" | yes | `Overview.tsx`, `css/portfolios.css` |
| 15 | Portfolio 360 / Allocations | Capital flow diagram of 12 hatched boxes, each "Not published (FE-032)" (id visible), "Real-funded . Real-funded", "Hover or focus a node...", Basis and band sentences, plus a Receipt column of "Not published" | yes, one line "Not available: Capital flow, Ledger receipts"; no diagram, no Receipt column | `Allocations.tsx` |
| 16 | Portfolio 360 / Allocations | Empty ledger prints "Append-only, newest first. Showing 0 of 0." under a sentence that already says it is empty | yes | `Allocations.tsx` |
| 17 | Portfolio 360 / Allocations | Raw `MARGIN_BALANCES_NOT_PUBLISHED` and "Inputs the source did not publish: margin_balances." for one fact | no (shared state boundary prints reason codes as given) | - |
| 18 | Alpha 360 | Request ids visible: "Not published (FE-029)", "(FE-006)", "(FE-011)" (local `Np` printed the id) | yes, same markup as the shared block: id in title and hidden text | `alpha/np.tsx` |
| 19 | Alpha 360 | Header: Name / Version / Run / Evidence each "Not published" | yes, one "Not available:" line | `alpha/index.tsx` |
| 20 | Alpha 360 | KPI strip: 3 of 5 tiles are "Not published" | yes, 2 tiles + one line | `alpha/index.tsx`, `css/alpha.css` |
| 21 | Alpha 360 | Deployments tab: three columns of "Not published" (Dates, Deployed by, Receipts), table 48 px wider than the page at 1440 (horizontal page scroll) | yes, one line under the table, no overflow | `alpha/TableTabs.tsx` |
| 22 | Alpha 360 | Research Evidence and Regime Fit: 7 + 8 rows of "Not published" | yes, one line each | `alpha/TableTabs.tsx` |
| 23 | Alpha 360 | Performance: empty hatched Drawdown panel, "Real-funded book / None / Windowed return / Window" caption, Cost drag and Forward observation panels and "4 charts are not available" all "Not published" | yes, one closing line; the caption keeps only declared gaps | `alpha/PerformanceTab.tsx` |
| 24 | Alpha 360 | Lifecycle detail repeats the spine's "days in stage, criteria, decider" gap in two more lines | yes | `alpha/Lifecycle.tsx` |
| 25 | Alpha 360 | "Request archive/gate review" reasons cut at 390 px ("Archive requests ca...") with the action name printed twice | yes, wraps, no name prefix | `css/alpha.css` |
| 26 | Alpha 360 | More menu does not close on Esc | yes (+ test) | `alpha/index.tsx` |
| 27 | Alpha 360 | Orders: six links all named "Open" | yes, accessible name "Open ord_007 in Trade Replay" | `alpha/OrdersTab.tsx` |
| 28 | Alpha 360 | Spine: four "? UNKNOWN" chips and an underlined, non-link "Stage history" on every stage card | no (shared JourneySpine, used by stage screens; needs a design call) | - |
| 29 | Accounts | "1098 h ago", "1111 h ago" | yes, "46 d ago" past 48 h (+ test) | `account/model.ts` |
| 30 | Account 360 / Reconciliation | "Not computed . SHARED_BINDING" eight times (raw code) | yes, "Not computed", code in title and hidden text | `blocks/Triad.tsx` |
| 31 | Account 360 / Reconciliation | "Not available . NOT_PUBLISHED" in the sync history | no (comes from the boundary's absent-metric copy, shared) | - |
| 32 | all | console: `404 /api/v1/execution/retained-review` on every page, `503 .../correlation` on Portfolio 360 risk | no (fixture does not serve them; not a V2 screen defect) | - |
| 33 | Overview | `11,104.0061` next to 2-decimal amounts | no (exact string as published) | - |

## Gates (touched folders, --maxWorkers=2)

`tsc --noEmit`: no error under `src/execution` (the roadmap-task-board errors are the missing `react` of that feature, unrelated).
`vitest run src/execution/v2 + absentValues + failClosed + testHygiene`: 77,252 passed, 1 failed. v2Hygiene, linkTargets, flagOff, flagOn, uxm10Css, absentValues, failClosed are green. No snapshot was updated.
`testHygiene` was already red at base: `v2/readers/alphaFleetRealtime.conformance.test.ts` lines 83, 111, 210 (`if (!read.ok) return;`).
Replacing them with a throw turns 464 matrix cases red (the reader refuses them on purpose), so it was left to the owner of that file.

## New user-visible text, for approval

All of it is built from labels that were already on screen.

1. Chip "Mixed books" (Portfolios list), replacing "Real-funded and Simulated books together"; the old sentence is its title and hidden text.
2. One "Not available: ..." line, new where it stands: Allocations "Capital flow, Ledger receipts"; Alpha 360 header "Name, Version, Run, Evidence" (Owner when unpublished);
   under the Alpha KPIs "Return, Max drawdown, Regime fit"; Deployments "Dates, Deployed by, Receipts"; Research Evidence "Bound research run, Parameters, Parameter bundle, Evidence, Provenance, Artifact available";
   Regime Fit "Volatility, Trend, Liquidity, Outcome by stage"; Performance end "Fees and funding, Slippage, Forward and actual days, Mixed return, Mixed score, Rolling correlation, Return histogram, Risk utilization, Paper versus live drift";
   Research OOS "Bound run, OOS return, Artifact available".
3. Age format "N d ago" (Accounts) from 48 hours, e.g. "46 d ago".
4. Accessible name only (not drawn): "Open ord_007 in Trade Replay".

Deleted text: the capital-flow notes, "Export is not available yet." x3, "Windowed return / Window / book / basis" caption, Forward observation, Cost drag, "4 charts are not available yet", the three repeated lifecycle gate lines,
the Fleet "Window" and "Compare" buttons, the Archived lens toolbar, legends that repeat a chart title, the "Receipt" column.
