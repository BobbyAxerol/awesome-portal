# HIFI / lowfi vs the V2 screens now running — gap audit (2026-10-22)

Inputs read: Bobby's two lowfi sheets (`ChatGPT Image Oct 15 …37 PM` = Portfolio Overview, `…58 PM` = Alpha Fleet), the chosen HIFI `design/hifi/m01…m10`, Manager UX Guide v1.1 §5–§8, and the V2 baselines (`v2-overview/portfolios/fleet-1440`). Fixture preview only; nothing here is a connected-source claim.

## 1. What the HIFI/lowfi require (manager view) vs what V2 shows

| Screen | HIFI / lowfi / guide requires | V2 today | Verdict |
|---|---|---|---|
| **M01 Overview** | KPI row NAV · Net PnL 90D · Return 90D · Drawdown · Portfolio Score (Pending); Live/Paper/Sandbox + 7D/30D/90D/ALL; Net PnL/Return/Equity chart with drawdown strip; **Capital panel** (Initial funds, Added funds, Returned, Current NAV, budget used); Contributors (Amount/Return/Score); Portfolios table (NAV, 90D, health). Guide §6.2: "do not drop the lowfi rows; show unavailable with a reason" | NAV, Open incidents, Needs attention; NAV chart; Current by currency; Fleet by stage; Today; Source health. One line "Not available: Net PnL, Return, Drawdown, Capital, … Contributors". No window selector, no domain selector, no Capital panel, no Contributors, no Portfolios table | **DEVIATES** |
| **M02 Portfolios** | Columns: Portfolio · Manager · Alphas/Dep · Allocations · Domain · Economic capital · Allocated capital · Net PnL 90D · Return 90D · Drawdown · HHI · Score · Health; 7D/30D/90D/ALL; Basis; per-cell "Not available + reason" | Compare · Portfolio · Owner · State · Allocations · Deployments · Allocated capital. One header line lists what is missing | **DEVIATES** |
| **M03 Alpha Fleet** (lowfi 2) | Tabs All/Live/Canary/Sandbox/Paper; columns Alpha/Version · Owner/Portfolio · Stage presence · Alloc · PNL amount · Unrealized · Account balance · Equity 30D (sparkline) · Health/Source · QBTS; window; Group by; Export | Tabs All/Real-funded/Sandbox/Paper/Archived; columns Alpha · Owner · Portfolios · Stage · Health · Deployments. No Alloc/PnL/Unrealized/Balance/Equity30D/QBTS columns, no window, Group by and Map removed (DEBT-048) | **DEVIATES** |
| **M08 Archived Alphas** | Own screen: lifecycle watchlist, obligations, paper monitor, reactivation review | Not built. Fleet's "Archived" tab says "Archived list: Not available" | **MISSING** |
| **Sidebar** | Overview · Portfolios · Alpha Fleet · Accounts · Archived Alphas · Operations · Governance (Approval Inbox, Waivers, Exit Reviews) · Profile & Access | Overview · Portfolios · Alpha Fleet · Accounts · Operations · Approvals · Profile & Access (Waivers/Exit Reviews are inside Approvals; no Archived Alphas) | **DEVIATES** |
| M04–M07, M09, M10 | Portfolio 360, Alpha 360, Account 360, deployment header, Operations & decisions, Profile & access | Built (Portfolio 360, Alpha 360, Account 360, Workbench/Live/Canary/Sandbox, Operations, Profile & Access). Not compared cell-by-cell in this audit | **NOT AUDITED here** |

## 2. Why (honest)

1. **Data:** Net PnL, Return, Drawdown, capital statement (initial/added funds), contributors, Allocation/Balance/Equity30D per alpha and QBTS score are not in any published, qualified contract today (financial source MISSING, PM/TS mapping open, Score policy not set — Codex C5/C-7 returns). V2 renders only what a contract serves; it does not invent figures (CLAUDE.md §3.3).
2. **The deviation is mine, not the data's:** the guide (§6.2, §8.1) and the HIFI itself ("SOURCE NOT READY" tab, per-cell "Not available · reason") say to **keep the rows and columns and mark each cell unavailable with its reason**. I instead collapsed them into one "Not available:" line and dropped columns. That removes the manager layout Bobby drew.
3. **Not tracked:** none of this was in the debt register until now (grep of the register found no entry), so it never reached Bobby as a decision. That is a reporting failure on my side.
4. New screens reachable only by drill-down or URL (not in the sidebar): Blotter, Compare, Account 360, Workbench/Live/Canary/Sandbox, Trade replay, Users, Admin actions.

## 3. Limits for the owner (Bobby) on research-portal today

- Sidebar is built from the registry: the 6 Execution entries + Profile & Access only.
- Flags: `command` OFF (no command / Live actions; "Request review"/"Request archive" shut with a reason); `scoped`, `fleet-stream` ON in the preview; fixture overlay (banner "FIXTURE DATA").
- Data limits: every cell above is "Not available" until its source is qualified; Users/Admin actions need the owner role (Bobby has it).
- Not a permission limit: the missing manager columns/rows are a layout gap, not a role restriction.

## 4. Proposed fix (needs Bobby's go; fixture-only, no new authority)

1. Overview: restore the M01 layout (KPI row, window + domain selectors, chart shell, Capital panel, Contributors, Portfolios table) with **per-cell "Not available · reason"** and "Pending · policy not set" for score.
2. Portfolios and Fleet: restore all HIFI columns as columns with per-cell unavailable reasons; window selector; Fleet tabs All/Live/Canary/Sandbox/Paper.
3. Build M08 Archived Alphas and add Archived Alphas / Waivers / Exit Reviews to the sidebar.
4. Keep it fixture-only; values appear only when a contract serves them.

## 5. Correction and comparison with Bobby's two artifacts (added 2026-10-22, later read)

Read in full: claude.ai/artifact/X7Aqzz9rEA4Q51C7ifnKAQ ("Execution V2 Screens", 20 screens x wireframe/Manager/Researcher/Source-not-qualified/V1) and claude.ai/artifact/Ley56v4q8dF1P8C7uPvMrQ ("Execution V2 Concepts", C1-C4, marked "nothing here is approved"). Compared with the V2 baselines of Overview, Fleet and Portfolios at 1440.

**Corrections to sections 1-2 above (they used the older HIFI M01-M10 set):**
- M08 Archived Alphas is not a separate screen in the V2 Screens artifact: "Archived Alphas -> Fleet Archived lens (Folded)". DEBT-UXM07-050 was wrong to call it missing. What is missing is the Archived tab content ("Archived list: Not available").
- Waivers and Exit Reviews are "Merged" into Approvals lanes. The sidebar (Overview, Portfolios, Alpha Fleet, Accounts, Operations, Approvals, then Administration: Profile & Access) matches the artifact. Not a deviation.

**What the artifact draws and V2 does not (confirmed on images):**
| Screen | Artifact | V2 today |
|---|---|---|
| Shell | Top bar with Search or jump (Cmd K) and user chip; persistent context bar: Real-funded/Paper/Sandbox, 7D/30D/90D/ALL, "USDT one basis", "Scope: All portfolios" | Context bar folds to "Not applied: Environment, Window" on Overview and Fleet; Portfolios shows the environment chips only. Window, basis and scope selectors are absent |
| Overview | 5 KPI tiles (NAV, Net PnL 90D, Return 90D, Drawdown, Open incidents); chart with Net PnL/Return/Equity tabs and drawdown strip; Capital panel (Initial, Added, Returned, NAV, Budget used); Needs attention; Since your last visit; Contributors | 3 tiles; one "Not available: ..." line; NAV chart; Needs attention; Current by currency; Fleet by stage; Today; Source health. No Capital panel, no Since your last visit, no Contributors |
| Source not qualified variant (overview-nq, fleet-nq) | Same layout kept; every KPI, Capital row, Contributors and Fleet cell reads "Not available" with a one-line reason ("Source not qualified", "Fees incomplete", "Method not certified", "Needs a NAV series") | Layout dropped instead of kept |
| Portfolios | Search, All/Needs attention/Stale filters, Export, Columns, Compact; columns Portfolio, Manager, Alphas/Deploy., Allocations, NAV, Allocated capital, Net PnL 90D, Return 90D, Drawdown 90D, Concentration, Health; totals row | Compare, Portfolio, Owner, State, Allocations, Deployments, Allocated capital; one "Not available: NAV, Net PnL, ..." line |
| Alpha Fleet | Table/Board/Map; 4 KPI tiles; tabs All/Real-funded/Sandbox/Paper/Archived; filters Portfolio, Owner, Health, Group, Then; columns Alpha, Owner, Portfolio, Stage with 6-step meter, Allocation, Net PnL 90D, Equity sparkline, Health | Table/Board; 5 KPI tiles; filters Owner, Health, Sort; columns Alpha, Owner, Portfolios, Stage, Health, Deployments; "Not available: Group by, Map, Window, Readiness, Compare, Archived list" |

**Honest cause.** Reusable parts exist in the code (CommandBar, ContextBar, CapitalFlow, JourneySpine, DivBars, a Contributors model) but the three screens render them only when a read carries the data, and DEBT-048 removed controls that did nothing. The artifact's own "Source not qualified" variant shows the intended answer: keep the control or cell, mark it unavailable with the reason. So the layout gap is a build decision of mine, not a data limit and not a permission limit on bobby. The Concepts artifact is explicitly "not approved"; the Screens artifact adopts Cmd K, fleet board/map, capital flow, spine, ribbon and cockpit as highlights, so the adopted scope needs Bobby's confirmation per item.

DEBT-UXM07-049 stands. DEBT-UXM07-050 is narrowed to: Fleet Archived tab content, Fleet Map view, Since your last visit digest.
