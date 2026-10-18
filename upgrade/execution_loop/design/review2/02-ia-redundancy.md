# Review 2 / 02 — IA redundancy and overlap audit (Execution Loop V2)

Scope read: README (D1-D9, S1-S7, C1-C4, UI1-3), V1_SCREEN_REVIEW, V1_SUBSCREEN_DISPOSITION, UXM-01, guide §4-§6,
hifi m01-m10, concepts c1-c4 (text/structure extracted; sample values ignored). Read-only critic; nothing else edited.
Role letters: M manager, R researcher, A approver/reviewer, O operator, Ad admin.

## 0. Headline findings
1. **Decisions live in four places at once**: Governance sidebar group (Inbox / Waivers / Exit Reviews) + M09 "Decisions" tab (S3) + C4 cockpit ("main review experience") + M01 APPROVAL rows. S3 and C4 contradict; the hifi sidebar still shows the old group while c1 already dropped it.
2. **"What needs me now" exists five times** (M01 Needs attention, M09 Exceptions, M09 Commands UNKNOWN KPIs, c1 digest, ⌘K results) with no stated ownership.
3. **Fleet has three presentations of one dataset** (table, board, heat map) plus M01 "My alphas"/"Portfolios" panels and M02 and Compare re-listing the same rows.
4. **Stage/journey is drawn four ways** (spine, M07 strip, stage pills, "Where it runs" matrix) over one data set (stage history + deployments).
5. **Activity/audit feed is re-implemented per entity** (M09 Audit, M06 Audit, M04 People & Activity, M05 Activity & Decisions, ribbon, cross-stage table).
6. **Context controls are duplicated**: shell env/window/ccy chips (c1 "context follows you") AND per-page env + 7D/30D/90D chips (every hifi header) AND per-panel windows (UI3). Also env (Live/Paper/Sandbox) and Fleet stage tabs (All/Live/Canary/Sandbox/Paper) look like the same control but mean different things.

## 1. Overlap matrix (X = surfaces the same facts; C = canonical owner)
| Concern | M01 | M02 | M03 | M04 | M05 | M06 | M07 | M08 | M09 | Cockpit | Concept widgets | Sidebar/⌘K |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Needs-attention / exceptions | X (Needs attention) | | X (Health col) | X (Incidents tab) | | X (banner) | X (Operations chip) | X (obligations) | **C** (Exceptions) | | digest, ⌘K "Operation" | ⌘K "Go to Exceptions" |
| Pending approvals | X (APPROVAL row) | | | X (Approvals tab) | X (Activity & Decisions) | | | X (Archive requested) | X (Decisions tab, "Needs my approval") | **C** | ⌘K "Approval" | Inbox/Waivers/Exit items |
| Capital panel / flow / ledger | X (Capital panel) | X (Allocated cap col) | | **C** (Allocations + Sankey + ledger) | | X (PM capital, Allocations) | | | X (receipts w/ amounts) | X (capital preview) | c2 flow, c2 ledger | |
| Alpha list | X (My alphas) | | **C** | X (Alphas tab) | X (Deployments) | X (alloc table) | | X (list) | | X (queue rows) | board, heat map, Compare | ⌘K Alpha |
| Portfolio list | X (Portfolios panel) | **C** | X (Portfolio col/group) | X (header) | | | | | | | Compare, heat map groups | ⌘K Portfolio |
| Stage / journey | | | X (stage pills) | | X (pills, Where it runs, cross-stage table) | | X (strip) | X (previous stage) | | X (gate header) | **C** spine (c3A) | |
| Event/activity/audit feed | | | | X (People & Activity) | X (Activity & Decisions, Audit) | X (Audit) | | | X (Audit) | X (notes) | ribbon, digest | |
| Performance numbers | X (KPI + table) | X (cols) | X (cols) | **C** portfolio | **C** alpha | X (equity) | | X (paper monitor) | | X (evidence diff) | Compare, heat map | |
| Permissions / why disabled | banner | | | disabled btns | disabled btns | | | disabled btn | disabled | disabled | | |
| Context (env/window/ccy) | X | X | X | X | X | X | | | X | | c1 context rail **C** | |

## 2. Canonical vs duplicate decisions
### 2.1 Attention family
| Item | Verdict | Rule |
|---|---|---|
| M09 Exceptions + Commands | **Canonical** for open operational problems (ack/resolve/Mine live only here) | Only place with write verbs on exceptions. |
| M01 Needs attention | **Derived view**: top 5-7 of {open exceptions, UNKNOWN/pending commands, approvals assigned to me}, ranked severity -> SLA -> age | No actions except the deep-link verb ("Investigate", "Verify", "Review"); "All" = M09 with preset filter. Remove any second ranking logic. |
| M09 KPI trio (UNKNOWN / Pending / Open exceptions) | Keep as filter chips of the tab, not a third source | Same counts as M01 header badge; one count service. |
| Digest "since last visit" | **Keep, but history not state**: shows events that CHANGED since T (resolved, decided, applied, new, stage moves). Items still open appear only as one line "N still open -> Needs attention" | Prevents duplicate rows vs Needs attention. Placement: top of M01 only (collapsible); shell bell shows count and opens the same card. |
| ⌘K results | **Navigator, not a list**: entities (alpha/portfolio/account/operation/approval) open at their canonical screen; "Action" rows only prefill the owning flow | Never render attention/decision lists inside the palette. |
| Incident drawer (S3) | Keep; M04 Incidents tab and M06 banner = same drawer, scope-filtered | |

### 2.2 Decisions family
| Item | Verdict |
|---|---|
| C4 cockpit | **Canonical** for approving anything (R1, R2, Exit, Live, Archive, reactivation, capital approvals, waivers). One `GateReviewShell`; Gate/Exit pages are deep links (`?req=`). |
| Sidebar Approval Inbox / Waivers / Exit Reviews | **Merge into one "Decisions" item**; they become queue filters (type chips) of the cockpit. Waivers = a type + a "due-date timeline" view tab. |
| M09 "Decisions" tab (S3) | **Remove**; M09 keeps Commands / Exceptions / Audit. A command row "Awaiting approval" links to the cockpit request (already done in hifi: "Review request"). |
| M04 Approvals tab, M05 Activity & Decisions | Scoped embeds of the cockpit queue/history (read-only), "Open in Decisions" link. No own content. |
| New Approval Request | Button inside cockpit header only. |
| M01 APPROVAL rows | Part of Needs attention (derived). |
| M10 "Approve stage exits" rows | Capability register; links to cockpit; do not repeat gate lists. |
| Theme (S2 Governance light) | **Supersede**: cockpit is Carbon dark; one theme (V1 problem #1). |

### 2.3 Fleet / portfolio family
| Item | Verdict |
|---|---|
| M03 Table | **Canonical** alpha grain. Board and Heat map = `view=table|board|map` of the SAME query/URL (`group`, `sort`, filters shared). Not separate widgets/screens. |
| Heat map | Move off the home concept into Fleet third view (size/colour toggles kept). M01 keeps Contributors (top/bottom list) with link. |
| M01 Portfolios panel + My alphas table | **Cut**: replace by one Contributors panel with `Portfolios | Alphas` toggle (guide §6.4 already wants contributors + portfolio drill list; M02/M03 own the full lists). Researcher "My alphas" = same panel, own-slice. |
| M01 "All performance rows" table | Keep only as the metric-dictionary disclosure (it maps the stakeholder's rows, guide §6.2); remove duplicate KPI repeats (NAV/PnL/Return/DD/Score appear as cards AND table rows). Cards = headline, table = definitions/methods. |
| M02 | **Canonical** portfolio list + sort. Compare = action on selected rows (2-4) in M02/M03, route `/compare?ids=`; the Compare tab inside Portfolio 360 (c2) becomes a prefilled entry ("Compare with…"), not a peer tab. |
| M05 Deployments tab vs Fleet expandable children vs M07 | **Canonical: M05 Deployments tab**. Fleet children/peek = compact link-outs; M07 = detail of one row. Remove "Where it runs" matrix as a separate block (spine nodes carry the same counts). |

### 2.4 Journey family
| Item | Verdict |
|---|---|
| Journey spine (c3A) | **Canonical component** `JourneySpine`, three variants: full (Alpha 360 header; nodes carry deployment count/active state = "Where it runs"), compact (M07 header, GateReviewShell header, sticky on scroll), mini (Fleet row/peek). |
| M07 strip (R11) | **Replace** by compact spine; don't ship a second implementation. |
| Stage pills in M05 header; M03 `stage_presence` | Header pills **remove** (spine replaces). Fleet column pills **keep** (a filterable set, not a journey). |
| Gate headers (c3 gate header, R1/R2/Exit/Live pages) | Same compact spine; header text only adds gate-specific "criteria 5/7, 12D in stage, Manager decides". |
| M05 cross-stage table + StageLines chart + event ribbon | One panel, three layers of the same data: stage bands/periods (from spine history) drawn on the chart; ribbon = Activity feed filtered to lifecycle kinds; the per-stage return table stays as the chart's legend table ("Stage breakdown", D2). No separate "timeline" section. |

### 2.5 Capital family
| Item | Verdict |
|---|---|
| M01 Capital panel | **Summary** (fund scope, 6 lines + budget-used bar); each line links to M04 Allocations. D6 "By funding source" disclosure: keep once, in M04 only (remove from M01 until attribution exists). |
| M04 Capital flow (Sankey) + Allocations + Ledger | **Canonical**. Flow is the visual of the ledger's current state, ledger is the append-only history; same block per domain (Real-funded / Simulated, S6). Place flow on top of Allocations, not a peer tab. |
| M06 PM capital/Allocations | Account-scope view of the same budget; link to M04, no flow chart here. |
| M09 Commands vs ledger | **Both stay, different facts**: Commands = intent + receipt lifecycle (incl. rejected, UNKNOWN, preview); Ledger = booked outcome. Cross-link by `cmd id` (already a column). Never show "Applied" in Commands unless it ties to a ledger seq. |
| C4 capital-change preview vs M04 Actions-rail preview | One `CapitalPreview` component, labelled "Derived, not applied". |
| Admin Actions history | Journal belongs in M09 Commands (`source=admin` chip); Admin Actions route keeps only compose/plan->apply->verify. |

### 2.6 Alpha 360 performance / evidence
| Item | Verdict |
|---|---|
| Performance tab | **Canonical** for equity, drawdown, contribution, cost drag, stage breakdown. |
| Orders & Fills | Owns execution-quality KPIs, funnel, density; Blotter = same table, global scope. |
| Compare / Evidence diff (c4) | Evidence diff is gate-specific (observed vs approved band); reuse the same chart primitive as Performance, not a new chart. Compare is cross-entity, separate. |
| Research Evidence vs Regime Fit vs cockpit evidence | Cockpit renders an excerpt of Research Evidence with link "Open in Alpha 360"; do not recompute. |

### 2.7 Feeds (audit/activity)
One `EventFeed(scope, kinds)` component. Instances: M09 Audit (scope=all), M05 Activity & Decisions (alpha), M04 People & Activity (portfolio), M06 Audit (account; keep Reconciliation separate), digest (since T), ribbon (lifecycle kinds). **Remove** per-entity "Audit" tabs where they only filter this feed (M05 already merged; fix M06 by renaming to Activity inside Reconciliation/Overview or keep tab name "Activity").

### 2.8 Permissions and disabled reasons
| Item | Verdict |
|---|---|
| M10 "What you can do" | **Canonical register**: one row per capability, status, reason, how to get it, request-access link. |
| Per-screen disabled button + 1-line reason (D9) | **Pointer, same string**: copy generated from one capability->reason dictionary (FE-015); the button's link opens M10 anchored to the capability row. No hand-written reasons. |
| "Your slice only" banner | Keep once per page, shortened, linking to M10 "What you can see". |
| M10 SEE table | Collapses by role to one table per role; remove the repeated "Not available / Not loaded" third variant on healthy views. |
| Global "source not qualified" banner vs per-cell "Not available · reason" | Banner owns the explanation; cells show "Not available" plus tooltip, not a repeated sentence. |

### 2.9 Sidebar vs ⌘K vs context
- Sidebar = permanent destinations only (one per top-level screen, role-filtered). ⌘K "Go to" generated from the same route registry (one source), exposes **presets** (Fleet Live, Operations Exceptions, Decisions mine) that the sidebar does not. No hand-written ⌘K list (c1 list is hard-coded and already differs from the sidebar).
- Context bar (c1) is the only place for env + default window + ccy + scope; page headers drop their copies. Per-panel window override remains (UI3) as a visible "local" chip; "Equity 30D" stays a fixed label.
- Rename env chips to the domain they actually switch (Real-funded / Simulated pair or Live/Paper/Sandbox partition) and keep Fleet stage tabs visually distinct (they are a filter, not a partition).

## 3. Proposed final navigation
```
Execution
  Overview            (M01)
  Portfolios          (M02 -> M04)
  Alpha Fleet         (M03 Table|Board|Map -> M05 -> M07)   [Archived = status tab "Active | Archived" here, route kept]
  Accounts            (list -> M06)
  Operations          (M09: Commands | Exceptions | Audit)   badge = unknown+open
  Decisions           (cockpit; types R1 R2 Exit Live Archive Waiver)   badge = my SLA items
Administration       (role-gated)
  Admin Actions   · Users   · Profile & Access (M10)  [My access visible to everyone]
Not in sidebar: Compare (row action + ⌘K), Blotter (scoped link from Orders & Fills, Account, Operations; ⌘K), Incident (drawer), New Request (cockpit button)
```
Sidebar entries: V2-as-drawn 12 (Overview, Portfolios, Alpha Fleet, Accounts, Archived, Operations, Governance x3 + header, Admin header, Profile) -> **9** (6 + 3 admin, Admin items role-gated so a manager sees 7).

### Minimal canonical screen list (16)
| # | Screen | Purpose (<=8 words) | Roles |
|---|---|---|---|
| 1 | Overview (M01) | Fund state, attention, drill-in start | M, R (own slice) |
| 2 | Portfolios (M02) | Compare portfolios on one basis | M, R |
| 3 | Portfolio 360 (M04) | Capital, allocations, risk, actions | M, R |
| 4 | Alpha Fleet (M03) | Find, filter, group, scan all alphas | M, R, A |
| 5 | Alpha 360 (M05) | Performance, evidence, stages, deployments of one alpha | M, R, A |
| 6 | Accounts (list) | Logical sleeves and physical bindings | M, O |
| 7 | Account 360 (M06) | Sleeve vs physical balance, reconciliation | M, O |
| 8 | Deployment detail (M07) | One deployment, bodies: Paper/Sandbox/Canary-Live | M, O, A |
| 9 | Archived (M08) | Archived alphas, obligations, paper monitors | M, R |
| 10 | Operations (M09) | Command receipts, exceptions, audit | O, M, Ad |
| 11 | Decisions (cockpit) | Decide gate/exit/archive requests with evidence | A, M |
| 12 | Compare | Side-by-side 2-4 portfolios or alphas | M |
| 13 | Blotter | Scoped order and fill search | O, M |
| 14 | Profile & Access (M10) | What I see, can do, why not | all |
| 15 | Admin Actions | Plan, apply, verify admin tasks | Ad |
| 16 | Users | Manage users and grants | Ad |

Counts: **V1 = 30 registry screens** (+35 tabs, 47 captured states). **V2 as currently drawn = ~26 pages/surfaces**: M01-M10 (10) plus 16 more (Approval Inbox, Waivers, Exit Reviews, Gate R1/R2/Live, New Request, Incident, Cockpit, Compare, Paper Workbench, Sandbox Cert, Canary, Live Ops, Blotter, Admin Actions). **Proposed = 16 screens** (-10 vs V2-as-drawn, -14 vs V1); drawers (peek, Incident, Explain score, receipt, capital preview) are not screens. Tabs: Alpha 360 = 6 + More(3: Trade Replay, Positions & Risk, Reconciliation); Portfolio 360 = 6 + 0 (Approvals/Incidents become scoped embeds under Activity).

## 4. Decisions Bobby must take
| # | Decision | Options | Recommendation | UX consequence |
|---|---|---|---|---|
| X1 | Where does Decisions live (S3 vs C4 conflict) | (a) M09 tab (S3) (b) own sidebar item = cockpit (c) keep Governance group | (b) | Reviewers get a dedicated queue and badge; operators' M09 stays 3 tabs; S3 amended. |
| X2 | Governance light theme (S2) | keep light for full pages / one Carbon theme | One Carbon theme | Cockpit and gate deep links match the rest; removes V1 problem #1; code lanes stay dark-only. |
| X3 | Archived Alphas as sidebar item | keep / status tab on Fleet (route kept) | Tab on Fleet (D8 still holds: not in "All") | -1 sidebar item; researchers find archives where alphas are; Fleet gets a lifecycle switch. |
| X4 | Heat map location | M01 panel / Fleet 3rd view / both | Fleet 3rd view only | Overview stays compact; one Fleet dataset and URL; heat map reached via view toggle. |
| X5 | Compare entry | tab in M04 / row action + route | Row action + route; M04 gets "Compare with…" | Works for alphas as well; no half-empty tab per entity. |
| X6 | Context controls | per-page chips / shell context bar + local override chip | Shell bar + local override | Fewer repeated chips; every page header shortens; windows never silently diverge. |
| X7 | Blotter in nav | sidebar / link-only | Link-only + ⌘K | Keeps sidebar short; risk: power users hunt for it; mitigate with ⌘K recent. |
| X8 | Admin action journal | keep on Admin Actions / merge into M09 `source=admin` | Merge into M09 | One audit trail for receipts; Admin page shrinks to compose + verify. |
| X9 | M01 panel set | keep Portfolios + My alphas + Contributors / single Contributors with toggle | Single toggle panel | Shorter M01, less scroll; drill-down moves to M02/M03 where it already exists. |
| X10 | ⌘K "Go to" content | hand list / generated from routes + presets | Generated | Palette never drifts from sidebar; permission filtering is free. |
| X11 | Portfolio 360 More tabs (R6) | keep Approvals/Incidents tabs / scoped links only | Scoped embeds under Activity, no separate tabs | -2 tabs; same list component as Decisions/Exceptions. |

## 5. Things to cut (with what replaces them)
1. Sidebar Governance group (3 items + header) -> one "Decisions" item.
2. M09 Decisions tab (S3 text) -> cockpit link.
3. M01 Portfolios panel and "My alphas" table -> Contributors toggle.
4. M01 KPI/table duplication (cards AND "All performance rows" repeating the same 5 numbers) -> cards headline, table = definitions only.
5. M01 "By funding source Not available" row -> M04 only (D6 disclosure single copy).
6. M05 header stage pills and "Where it runs" matrix -> JourneySpine (full variant).
7. M07 own journey strip implementation -> compact spine.
8. Per-page env/window chips -> shell context bar (local override chip only where needed).
9. Per-entity "Audit" tabs that only filter the feed (M06) -> EventFeed scope.
10. M04 Compare as peer tab -> row action; M04 Approvals/Incidents tabs -> scoped embeds.
11. Concept pages as screens: c1 (palette/rail/digest/heat map), c2, c3, c4 are components, not screens; do not ship "Lifecycle" (c3) or "Capital flow and compare" (c2) as routes.
12. Repeated "Source not qualified / Not available" sentences per card -> one banner + short cell state.
13. Hand-written disabled reasons -> one capability->reason dictionary; M10 SEE table "Not loaded" variants.
14. Admin Actions history list -> M09 filter.
15. Hard-coded ⌘K destination list in c1 -> generated.
