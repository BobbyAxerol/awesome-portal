# WP-A completion: Alpha Fleet (2026-10-23)

Level: R0. FIXTURE_LAB; nothing is source acceptance. The narrative, sort/filter rules, needs-contract requests (1 to 7) and layout numbers are in `ALPHA_FLEET_COMPLETION_2026-10-23.md`; this file is the definition-of-done table of the audit section "2. Alpha Fleet" (37 elements).

Counts: PRESENT_DATA 26, PRESENT_TYPED_ABSENCE 5 (6, 7, 14, 17, 26: each a contract or capability gap with a request), BLOCKED 6 (1 FILE_OWNED_BY_OTHER_WP shell; 21, 32, 33 EDGE_INPUT readiness; 31 CONTRACT; 35 DESIGN_DECISION).

| # | Element | State | Note / blocker |
|---|---|---|---|
| 1 | Context bar (env, window, basis, scope) | BLOCKED | FILE_OWNED_BY_OTHER_WP: shell (WP-D, next wave); the Fleet carries its own Basis select |
| 2 | Table / Board / Map toggle | PRESENT_DATA | Map is always drawn; disabled with its typed reason when the dataset is not published |
| 3 | Freshness chip | PRESENT_DATA | As-of time and freshness flag from the dataset |
| 4 | KPI Alphas in view | PRESENT_DATA | fleet summary |
| 5 | KPI Need attention | PRESENT_DATA | fleet summary |
| 6 | KPI Ready for exit review | PRESENT_TYPED_ABSENCE | Not published (FE-027); CONTRACT request 7 in ALPHA_FLEET_COMPLETION |
| 7 | KPI Archive in progress | PRESENT_TYPED_ABSENCE | Not published (FE-034); CONTRACT request 7 |
| 8 | Stage tabs with counts | PRESENT_DATA | Real-funded count is an upper bound (~), Archived uncounted by design |
| 9 | Search alpha | PRESENT_DATA | server `q` |
| 10 | Portfolio filter | PRESENT_DATA | `portfolio_id` EQ / IN |
| 11 | Owner filter | PRESENT_DATA | published population via group read |
| 12 | Health filter | PRESENT_DATA | EQ / IN |
| 13 | Group by / Then | PRESENT_DATA | nine fields offered by the dataset, two levels |
| 14 | Compare + Select 2 to 4 | PRESENT_TYPED_ABSENCE | disabled with reason, Not published (FE-033) |
| 15 | Columns menu | PRESENT_DATA | default and optional columns |
| 16 | URL disclosure | PRESENT_DATA | every control is a URL param |
| 17 | Row checkbox column | PRESENT_TYPED_ABSENCE | disabled boxes, one typed reason via aria-describedby (no capability) |
| 18 | Alpha + version link | PRESENT_DATA | truncates, title carries the name |
| 19 | Owner column | PRESENT_DATA |  |
| 20 | Portfolio column | PRESENT_DATA | badge with the deployments when several |
| 21 | Stage with 7-segment progress | BLOCKED | EDGE_INPUT: readiness x/7 (FE-027, FE-028); the 6-node spine from the published current stage is drawn |
| 22 | Allocation column | PRESENT_DATA | per economic partition |
| 23 | Net PnL column | PRESENT_DATA | per partition, window as published |
| 24 | Equity sparkline column | PRESENT_DATA | scalar chooser + sparkline from the series port (portfolio NAV; CONTRACT request 4 for an alpha subject) |
| 25 | Health badges (multi) | PRESENT_DATA | health flag + lifecycle flag; words the dataset publishes |
| 26 | Export + reason | PRESENT_TYPED_ABSENCE | disabled with reason; CONTRACT request 6 |
| 27 | Footer Showing N of M | PRESENT_DATA | rows over the whole filtered query |
| 28 | Board lanes with counts | PRESENT_DATA |  |
| 29 | Board SIMULATED / REAL-FUNDED tag + hatching | PRESENT_DATA | words, hatch and frame |
| 30 | Board card name/version/owner/portfolio | PRESENT_DATA |  |
| 31 | Board card allocation + currency | BLOCKED | CONTRACT: the board is the fleet read (no money); request 7 |
| 32 | Board card 7-segment progress 5/7 | BLOCKED | EDGE_INPUT: readiness (FE-027) |
| 33 | Board card badges (EXIT REVIEW READY, ARCHIVE REQUESTED) | BLOCKED | EDGE_INPUT: readiness / archive state on the fleet read (FE-027, FE-034) |
| 34 | Board red frame on Canary and Live | PRESENT_DATA | lane frame in the live hue |
| 35 | Map treemap by portfolio then alpha, Size and Colour selectors, legend | BLOCKED | DESIGN_DECISION (Bobby): the Map is a one-partition tile map sized by allocation and coloured by health; nesting by portfolio and the two selectors are not built |
| 36 | Map real-funded and simulated halves never summed | PRESENT_DATA | one partition per map, other environments counted as elsewhere, note printed |
| 37 | Row peek drawer | PRESENT_DATA | identity, figures (QBTS and money per partition), environment |

Shared-file edits: `apps/portal/fixture-bff/review-manager.ts` inside `// ===== WP-A begin/end` (qbtsMetric, addQbts) plus small edits in nulled, aggregate, enrichRow, rowsFor and the options push of datasetAnswer; register section `2a. WP-A`. Contracts inbox: no new request beyond the seven in ALPHA_FLEET_COMPLETION (not widened).

## Follow-up 2026-10-23 (primary's visual review)
- Default columns now fit 1440 without a sideways scroll: Alpha (name, then version and, on an ALL read, the environment tag), Portfolio, Current stage, Alloc, PNL Amount, Health, QBTS. Owner, In stage, Unrealized PNL, Account balance, Equity 30D, Source, Select and (ALL) Environment are optional: one click in the Columns menu, and `cols=owner,in-stage,unrealized,balance,equity,source,select,environment` in the URL. Sticky identity and the scroll affordance stay for narrower widths.
- Measured (layout-audit, Fleet table, ALL lens): scroll overhang at 1440 130 px -> 0 (no scroll container), 1280 157 px, 1024 413 px (the wrap scrolls, focusable, faded edge); page overflow 0, wrapped figures 0, font outliers 0 at all five widths; clipped 50 = alpha names truncated with their full text on the title.
- Row height: a flag is one line (it had broken "NEEDS ATTENTION" letter by letter in a squeezed column), content centres vertically, a one-partition money cell prints no visible tag (figure carries its currency; tag kept for assistive technology and on its title), several partitions keep one visible line each.
- "In stage": the published place is `entered_at_ms` / `days_in_stage` on the row, but the dataset pins `unavailable_fields` and `stage_lifecycle.entry_time` to STAGE_ENTRY_TIME_NOT_PUBLISHED, so serving values would contradict the contract. Request posted to K (inbox row A to K). The column is optional and hidden by default, so the default table is not a wall of "Not published".
- Element 17 (row checkboxes) and 20: the Select column is optional (disabled boxes, one typed reason); the Compare selected button and the reason line stay on the toolbar.
