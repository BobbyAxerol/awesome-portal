# Review 2 / 03 — Design-system consistency and upgrade audit (Execution Loop V2 HIFI)

Read: hifi.css/js, m01-m10, c1-c4 (full source), design/README.md (UI1-3, S2, D9, C1-4), DESIGN_GRAMMAR_V3.md, DESIGN_SYSTEM_EXECUTION.md, execution.css type scale, tokens.css carbon block, h01/h03/h09-v15.png, cg/c1-a, c2-0, c3-0, c4-0. Nothing rendered by me. Only 14 of the 30 screens exist as HIFI; the other 16 (gates, stage screens, incident, blotter, replay...) are inferred from the rules below. Screenshots are v15; hifi.css has moved since, so "verify" marks items to re-shoot.

## 0. Verdict
- The kit is coherent at the CSS layer (radius 0 everywhere, 0 `border-radius` hits, IBM Plex via tokens, mono numbers, one KPI size on m01-m10, text diet passes). It is NOT coherent at the component layer: each page re-implements drawers, menus, tables, bars, chips and "big numbers" in a page-local `<style>` (about 36k chars of page-local CSS across 13 files, much of it copies: `.rs/.pt/.pop/.tri/.kv` pasted twice in m02/m04, `.why/.back/.two` in m05/m06).
- The kit cannot ship as is: `--series*`, `--flag-*`, `--panel/--sunken/--cell` and `color-mix()` do not exist in `styles/tokens.css` (grep = 0) and `tokens.test.ts` bans `color-mix(` and `rgba(`. hifi.css flags use color-mix on every flag.
- Status signalling is the weakest link: 159 dot+word statuses versus 182 `.tagu`; UI2 (glyph flags) is applied to flags only, never to health, and the same state renders two ways (see 2.2 F1).
- Palette semantics collide: orange = drawdown = loss bars = recall flag = returned pin = 3rd compare series = canary; green/red text sits beside blue/orange bars.
- Window (UI3) works only because `hifi.js` rewrites markup after load (markup says 30D; JS forces 90D, appends ALL, regex-rewrites "30D" text). m06/m08/m09/c3 fail it outright.

## 1. Component inventory

### 1.1 Pattern map (where defined / how many implementations)
| Pattern | Defined in | Implementations found | Verdict |
|---|---|---|---|
| Panel + header strip | hifi.css `.panel/.ph` | also `details.d>summary`, `.rc .rh`, `.col>header`, `.sec` (m08/m09), `.fig .l`/`.auth .l`/`.kpi .l` (sans, old style) | 1 + 5 copies; promote Panel(header) |
| KPI strip | hifi.css `.kpis/.kpi` | big-number copies: `.big` (m05,m06), `.fig .v`, `.auth`, c3 `.facts b` 18/24, `.nd .nm` 24/28, `.card .c3`, chart `.rd b` 18/24 | 1 + 6; unify on `Kpi` + `Readout` |
| Seg / tabs | hifi.css `.seg`, `.tabs` | tabs wrap at 660 (m04) vs scroll (m05,m06,c3); "More" = 3 variants (m04 details menu, m05 JS button menu, m02 `.pop`); c4 `.seg` with counts | 1 + 3 |
| Flags | hifi.css `.tagu[data-k]` + JS regex in hifi.js | c3 `.st` (own glyphs ✓●✕○), c2 `flagSvg` (SVG clone), c4 manual `data-g` (glyph "!" for partial, "⊘" for paused; JS gives ◐ and ❚❚), `.tagu.warn/.good/.bad` tone classes still live beside `data-k` | 4 systems; must become one `Flag` |
| Status dot + word | `.dot` | 159 uses (health, runtime, recon, orders) | colour-only glyph; keep only for freshness |
| Stage mark | `.stage` | c2 `.blk`, c3 board header, m05 `.xs`, c3 `.band`, c1 treemap hatch | same encoding (hatch=simulated, hollow=canary) drawn 5 ways |
| Chips | `.chipx` | `.chp` (c3 toggle), `.pk` (c2 picker), `.kd`, `.gchip`, `.who`, `.kbd`/`kbd`, `.blk` | 8 chip-likes; 3 toggle semantics |
| Tables | hifi.css base (6/12, h32) | `.pt` (m02/m04: 6/6, th 10px, h36, `.compact` 28), m08/m09/m10 6/8, drawer tables 4/0 h28, c4 `.vt`, `.rc` h26. Sort glyph: CSS triangle (m02/m04), text "⇅" (m03), none (m09). Hierarchy: `tr.grp`, `tr.kid`+`&nbsp;` indent (m04), `.tri`, "↳" (m03) | 6 densities, 3 sort cues, 3 tree cues |
| Drawer | hifi.css `.drawer` (380, left 3px accent) | m03 peek column, m05 sticky column, m08/m09 grid column, m04 `.dr` fixed overlay (`top:81px` magic number), c4 `.rail`, c1 `.pal` modal, c4 `.help` modal | 4 layout models; DS §8 says 470-490 docked, full-screen under 720 |
| Popover / tooltip | `.tip` (hifi.css) | c2 `.tip` override, c3 `.hc` hover card, `title=` tooltips on disabled buttons, `.pop .menu`, `.tabs .menu`, `.morew .menu` | 3 tooltips + 3 menus; filter buttons ("Portfolio ▾") have no menu at all |
| Meters / bars | `.sla`, `.bar`, `.leg` | `.bar` 8px stacked (m02/m04) vs 6px single (m05); `.band` (m05 score) vs `.band` (c3 stage); `.mt` (c3), `.meter` (c4), `.quo` (c4), `.xs`+`.br` (m05) | stage durations drawn by both `.xs` (m05) and `.band` (c3) |
| Key/value | `.kv`(m02,m04), `.dl`(m06), `.facts`(m09 grid, c3 flex), table-as-kv (m05 evidence, `td.n` holding prose) | 4 |
| Charts | hifi.js `equityChart`, `spark`, `divBars` | c1 treemap (page-local), c2 sankey + `drawCmp` (second axes/crosshair/readout/end-pill engine), c3 ribbon (DOM overlay hard-coding equityChart's margins `l:60 r:78`; `equityChart` already has an `events` strip), c3 board, m04 stacked concentration bar | 3 chart engines |
| Command/context | c1 only: `.cmdbtn`, `.ov/.pal`, `.ctxrail` | m01-m10 still carry per-screen env/window segs, so C1 "context follows you" is not applied | page-local |
| Empty/unavailable | `.na`, `.empty`, `.banner`, `.why` | `.why` defined in m05/m06/m07 (same) and redefined in c3/c4 with other meaning (red decision message); `.ph0`/`.fut`/`.facet` dashed placeholders | no `EmptyState` component |

### 1.2 Class-name collisions (will break when pages are merged into one app)
`.sp` (spacer m02/c2 vs sparkline host m03) · `.pk` (peek aside m03 vs picker chip c2) · `.cards` (mobile cards m02 vs board cards c3) · `.ev` (marker button c3 vs evidence grid c4) · `.q` (c3 text vs c4 queue) · `.band` (m05 vs c3) · `.bar` (m04 vs m05) · `.meta` (m05 mono vs c4) · `.facts` (m09 vs c3) · `.menu` (m04 vs m05) · `.tab` (m09 pane) vs `.tabs` · `.strip` (preview bar vs c4 override) · `.why` · `.blk` (c2 chip vs c3 `.st.blk`).

### 1.3 Canonical kit (promote; props are the contract)
P0 = duplicated in 3+ screens today. All in Execution `.exec-surface`, tokens only.
| Component | Props | Replaces | Pri |
|---|---|---|---|
| `Flag` | `kind` (pending/recall/partial/unknown/applied/rejected/reconciling/stale/paused/approval/incident/operation/not_available/simulated), `label`, `size=sm|md`; glyph + tint from ONE table, no text-regex, no tone classes | `.tagu`, `.st`, `flagSvg`, `.dot`+word for non-freshness | P0 |
| `Freshness` | `state=ok|aging|stale|unknown`, `age` | `.fresh/.dot` | P0 |
| `NotAvailable` / `EmptyState` | `reason`, `kind=na|permission|not_computed|not_applicable|policy_pending|nodata|loading`, `link?` | `.na`+`.why`+`.rs`+`.empty`+`—`/Unavailable/None published | P0 |
| `DisabledAction` (D9) | `label`, `reason` (1 line, visible), `href` (M10 link) | `disabled`+`title=` | P0 |
| `ContextBar` + `WindowSeg` | `env`, `window=7D|30D|90D|ALL` (default 90D), `currency`, `scope`, `asOf`; panels read it; `WindowLabel` replaces regex rewrite | m01-m05 segs, labelWin() | P0 |
| `PageHeader` | `title`, `subtitle<=60`, `meta[]`, `actions`, `fresh`, `back` | `.mast`, `.back`, `.path`, `.meta` | P0 |
| `Panel` | `title`, `aside`, `tone`, `bleed`(table-only), `collapsible` | `.panel/.ph`, `details.d`, `.rc`, `.col` | P0 |
| `KpiStrip` / `Kpi` | `label`, `value` or `NotAvailable`, `unit`, `note`, `tone`, `cols` (2 at 660) | `.kpi/.big/.fig/.auth/.facts b/.nd .nm` | P0 |
| `DataTable` | `cols[{key,align,kind=num|id|text|flag|spark,sort,hideAt}]`, `density=compact|regular`, `group`, `tree`, `selectable`, `mobile=cards|scroll`, `stickyFirst` | `.pt`, `.vt`, drawer tables, sort/tree variants | P0 |
| `Drawer` | `mode=docked|overlay`, `width`, `title`, `flag`, `sections[]`, `actions` | `.drawer`, `.dr`, `.rail`, `.pal` shell | P0 |
| `Menu` | `trigger`, `items[{label,href,disabledReason}]`, `align` | `.pop`, `.tabs .menu`, `.morew`, filter "▾" buttons | P0 |
| `Tabs` | `items[{key,label,count}]`, `overflow=scroll|more`, `more[]` | `.tabs` variants | P0 |
| `Chip` / `ToggleChip` | `label`, `removable`, `pressed`, `swatch`, `disabledReason` | `.chipx/.chp/.pk/.kd/.gchip` | P1 |
| `FactList` | `rows[{k,v}]`, `cols=1|2` | `.kv/.dl/.facts` | P1 |
| `Meter` | `segments[{v,tone,hatch}]`, `max`, `label`, `variant=bar|sla|steps|quorum` | `.sla/.bar/.mt/.meter/.quo/.xs` | P1 |
| `StageMark` + `StageBand` | `stage`, `simulated`, `canary`; `stages[{start,end}]`, `simulatedUntil` | `.stage/.blk/.xs/.band` | P1 |
| `JourneySpine` (c3-A) | `nodes[{gate,state,days,met,total,decides}]`, `current`, `blockedWhy`; compact variant for gate header | c3 `.nds/.cmp` | P1 |
| `TimeSeriesChart` | `series[]`, `mode=pnl|ret|eq`, `window` (from context), readout bar, hi/lo flags, `pins[]` (flows), `events[]` (lanes = ribbon), `band`, `ghost`, `simulatedRegion`, `drawdown`, `compare` (2-4 series, end pills) | equityChart + drawCmp + c3 ribbon overlay | P1 |
| `Sparkline` | `points`, `tone=up|down|flat|na`, `window` | `spark()` with hex | P1 |
| `Treemap`, `Sankey`, `DivergingBars`, `BoardColumns` | per c1/c2/c3/m01 data shapes; one `HoverCard` | page-local | P2 (hero screens) |
| `ChartCaption` | DS §5 envelope: window, interval, currency, as_of, source, formula_version, samples | `.cap` (today lacks as_of and formula_version) | P1 |
| `CommandBar` (⌘K) | `sources[]`, keeps context | c1 | P2 |
| Governance: `QueueList`, `VerdictBanner`, `QuorumMeter`, `ReceiptCard`, `Checklist`, `DecisionRail` | c4 | page-local | P2 |

## 2. Conformance

### 2.1 Pass/fail (✓ pass · ~ partial · ✗ fail · . n/a)
| Rule | m01 | m02 | m03 | m04 | m05 | m06 | m07 | m08 | m09 | m10 | c1 | c2 | c3 | c4 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| R1 radius 0, no pill | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| R2 token-only colour | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ~ | ~ | ✗ |
| R3 IBM Plex only | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| R4 one KPI size | ~ | ✓ | . | ~ | ~ | ~ | ✓ | ✓ | ✓ | ✓ | . | . | ✗ | ~ |
| R5 hard borders | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| R6 flags with glyph | ~ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ~ | ~ | ~ | ✓ | ✓ | ~ | ~ |
| R7 chart weight/palette | ✓ | . | ✗ | ~ | ✓ | ✓ | . | ~ | . | . | ~ | ~ | ✓ | ✓ |
| R8 text diet (<=60 sub, <=4 long) | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| R9 "Not available" wording | ✗ | ✗ | ~ | ✗ | ~ | ✓ | ✓ | ~ | ~ | ~ | ✓ | ✓ | ~ | ~ |
| R10 90D default + ALL | ~ | ~ | ~ | ✗ | ~ | ✗ | . | ✗ | ✗ | . | ✓ | ~ | ✗ | . |
| R11 U+2212 minus | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| R12 mono right-aligned numbers | ✓ | ✓ | ~ | ✓ | ~ | ✓ | . | ~ | ✓ | . | . | ✓ | ~ | ✓ |
| R13 660px behaviour | ~ | ✓ | ✗ | ~ | ~ | ~ | ✓ | ✗ | ✗ | ~ | ~ | ~ | ~ | ✓ |
| R14 D9 disabled+reason+M10 link | . | ✗ | ✗ | ~ | . | . | . | ~ | ~ | . | . | . | . | ✓ |
Global fails (all screens): `--series*/--flag-*/--panel/--sunken/--cell` missing in tokens.css; `color-mix()` in flag CSS; side nav `display:none` <=1100 with no menu trigger (DS §8 wants an overlay); breakpoints 660/1100/1000/1250/860 vs DS ladder 640/768/900/1024/1280; `th{font:10px}` in `.pt` and `.bl` 10px are below the 11px load-bearing floor (prod `th` role = 11/16).

### 2.2 Findings and concrete fixes
- F1 Same state, two looks. "Unknown" order: m05 Orders = red `.dot`+word; m09 = dashed magenta `?` flag. Fix: Flag(kind=unknown) everywhere; dot allowed only for Freshness.
- F2 Flag inference is wrong in places. JS regex order makes "Recall pending" = pending (◔) not recall (↩); "Needs attention" = rejected (✕); "Accepted" tagu.warn turns teal ✓ (applied) so an accepted-not-applied receipt looks done (m04 Activity); "Approved"/"Open"/"Shared"/"Locked"/"Submitted" get no glyph. Fix: explicit `kind` prop, delete regex + tone classes, one glyph table (c4 "!" and "⊘" must match: partial ◐, paused ❚❚).
- F3 Glyph + dot duplicated in m09/m10/m08 markup (`<span class=tagu><i class=dot>`); v15 screenshot shows "✓ ■ APPLIED". hifi.css now hides `.dot` inside `[data-k]`; verify and strip the `<i class=dot>` from markup.
- F4 m09 primary row action is clipped at 1440: table (6 nowrap flag columns) inside a 760px panel, so "Next" (Check original request) scrolls out of view. Fix: merge Intent/Receipt/Reconciliation into one 3-state `Pipeline` cell (see 3.3), drop Intent column, make Next sticky-right.
- F5 m01: at 90D the LOW flag and the `+120k` flow pin overlap and the HIGH flag touches the end pill (h01-v15). Fix in equityChart: collision pass for flags/pins/end pill (nudge, or move pins to the ribbon lane).
- F6 Hard-coded hex: m03 `spark()` colours (8), c1 treemap + legend (26, incl. `#4c4c4c`, `#6f6f6f`), c2/c3 `#0b0b0c` pill ink, c4 49 hex in its own light remap + `.dark` panel. Fix: tokens (`--on-accent`/`--on-danger` exist) and Sparkline `tone`.
- F7 Window: m04 shows two controls (7D/30D/90D/ALL masthead + 1W/1M/3M/ALL chart) that disagree; m06 equity is fixed n=31 with "30D" captions and no control; m08 no control; m09 24H/7D/30D (spec: 24H default but 7D/30D/90D/ALL); c3 ribbon 7D/30D/70D; c2 Sankey column "PNL (30D)" fixed; m03 sparkline always 24 points. Fix: ContextBar owns window; panels show `WindowLabel`; gate evidence charts are policy-fixed and say "Fixed by policy · 60D".
- F8 Absence wording has 10+ variants for "no data": "—" (m01), "None published" (m02), "Unavailable" (m04 x3, m02 text), "Not available yet" (m10), "Not computed", "Not shown", "Not evaluated", "Not a balance", "Not provisioned". Keep a closed set: Not available (+reason) / Not applicable / Not computed (derived, scope mismatch) / Not shown (permission) / Pending (policy not set).
- F9 "Pending" fills one whole column (QBTS on 214 Fleet rows, Score on M02/M04) and 1 of 5 KPIs on m01/m04. Noise, not information. See decision D-UI-7.
- F10 Type scale drift vs execution.css roles: `.sub` 12/16 (role subtitle 14/20); `.rd b`/`.facts b`/`.vd h2` 18/24-26 (no role); c3 `.nd .nm` 24/28 (kpi is 24/32); `.kpi .v` 20px at <=660 (one KPI size); `.pt th` 10px; `.v.na` 16px sans (acceptable, add role `kpi-na`); `.btn` is sans while DS §7 says mono controls; page h1 400/24 vs DS §7/Grammar §6 300/22. Pick one set and add roles `readout`, `kpi-na`.
- F11 Docs conflict, not code: DESIGN_GRAMMAR_V3 §1/§2 (borderless panels, radius 8 KPI/banner, Inter+JetBrains) is superseded by UI1 + hifi V1.5 + tokens (hard borders, radius 0, Plex). hifi.css header comment still says "panels borderless". Mark Grammar V3 §1-2 superseded so nobody builds to it.
- F12 Sidebar vanishes <=1100 with no menu button: at 660px the user has no navigation on any screen.
- F13 660px: KPI strips go to 1 column (5 tall cards on m01/m04/m05); use 2 columns. Tabs wrap in m04 but scroll in m05/m06/c3. Only m02 has a card layout; m03 (10 cols), m08, m09 do not. Drawers fall below the table instead of becoming overlays.
- F14 D9: disabled controls carry only `title=` (m02 Export, m03 Export/Recall, m04 Export) or a reason without the M10 link (m04 drawer, m08, m09). Only c4 has reason + "Why?" -> M10.
- F15 Touch/pointer floors (DS §8 >=30px): `.btn.sm` 22px (m09), `.chp` 22px, `.pk` 26px, ribbon markers 13px, Sankey labels ~9px at 1440 (1200-unit viewBox scaled).
- F16 Selected-row fill (`--accent-soft` #001d6c) is very saturated against #1d1d1d (m03, m09); on a long table it dominates. Use a 3px left bar + `--cell` fill; keep navy for the active drawer item only.
- F17 Possible CSS bug (verify): `th.n{font-family:sans}` (0,1,1) outranks V1.5 `thead th{font-family:mono}` (0,0,2), so numeric headers are sans and text headers mono in the same row.
- F18 c4 uses `Iowan Old Style/Georgia` serif (not bundled, not in tokens) and a page-local light theme; tokens.css says `operations-carbon-light` was deleted (EL-V2-01b) and `--font-display` is sans. See D-UI-3.

## 3. Visual hierarchy and beauty

### 3.1 Where it still reads as tables of boxes
m02 (13-column table, nothing to look at), m03 (table + 24px sparkline), m06 (three panels of 24px number + dl), m08 and m09 (table + drawer of tables), m10 (two tables of flags), m04 Overview (KPI + chart + a 12-row Capital table), m01 (blank space under the Capital table; three small tables below the chart). The concepts solve this with one memorable object per screen (Sankey, spine, board, ribbon, treemap, cockpit) but the m-screens did not receive any of it.

### 3.2 Visual signature (8 rules, apply to all 30 screens)
1. Readout-first charts: legend row, then a readout bar (UTC date · value · Δ window · drawdown) that follows hover/arrow keys; HIGH/LOW flags; end pill; floating tooltips only for Sankey/treemap.
2. One context: env, window, currency, scope live in the ContextBar (C1). Panels show the window as a label chip ("90D"); local pinning is explicit.
3. Flag grammar: any non-numeric state = glyph + word + tint + 3px left bar; glyph table is fixed; dots mean freshness only; unknown = dashed, pending = hatched.
4. Texture grammar: solid = real-funded, purple hatch = simulated, dashed outline = not available/not started, hollow = canary. Same on charts, bars, treemap cells, board columns, table rows (hatched left edge).
5. Markers on any time axis: flows = teal pin `+k` / orange `−k`, events = lane squares (stage, decision, incident, recall, flow). One implementation, `events[]` on TimeSeriesChart.
6. One hero per screen, in the first panel, then the table. Hero occupies >=50% of the first viewport; tables are the second read.
7. Number typography: KPI mono 24/32, tabular, signed, U+2212, right-aligned; labels mono 11 uppercase tracked; "Not available" sans 16 faint with a one-line reason; gain/loss text colours fixed (D-UI-1).
8. Panel anatomy: sunken mono header strip (title left, scope/window right), 1px `--line-strong` frame, 16px body, 24px gap; only three panel types: Panel, Panel+hero, FactPanel.

### 3.3 Hero visual per screen
| Screen | Hero today | Proposed hero (from concepts) | Priority |
|---|---|---|---|
| M01 Overview | equity chart + Capital table | keep chart; fill the blank under Capital with C1 digest ("since last visit"); Fleet heat map as second row replacing the 3 small tables | high |
| M02 Portfolios | none | inline bars in cells: stacked allocated/recalling bar in Capital column, HHI bar, 30D sparkline; optional heat strip row above the table | high |
| M03 Fleet | table | Table|Board toggle (c3-B) + heat map (c1) as view; default stays table with tokenised sparkline | med |
| M04 Portfolio 360 | chart + Capital table | Capital flow Sankey (c2) in Allocations; Overview Capital panel becomes a 3-column mini flow (funds → capital → budget); ribbon on chart | high |
| M05 Alpha 360 | KPIs + chart + cross-stage table | JourneySpine (c3-A) under masthead; ribbon on Performance chart; cross-stage `.xs` becomes StageBand | high |
| M06 Account 360 | 3 big-number panels | "balance bridge": internal ledger / native custody / PM capital as aligned bars with the shared-binding share of sleeves (stacked, hatched = not attributed) | med |
| M07 Deployment hdr | placeholder + `.jr` text | JourneySpine compact (c3 `.cmp`) | med |
| M08 Archived | table + drawer | obligations drain meter per row (open items 5 -> 0) and before/after (real -> paper monitor) ribbon in drawer | med |
| M09 Operations | table of flags | `Pipeline` cell: intent -> receipt -> reconciliation as a 3-step glyph rail; unknown row gets the "stuck" step highlighted | high |
| M10 Access | 2 tables of flags | access matrix (areas x see/do) as glyph grid; "seeing never grants doing" visible as two columns | low |
| Gates / Exit / R1-R2 / Live review | none yet | C4 cockpit shell, evidence chart with band + ghost, verdict banner | high |
| Paper/Sandbox/Canary/Live stages | none yet | Fleet board lane + stage chart with ribbon | med |
| Incident, Trade Replay | none yet | ribbon (incident timeline); replay stays log until candles exist (S7) | low |
| Blotter, Admin actions | none yet | no hero; density and keyboard first | n/a |
Fix first in concepts: Sankey labels are 10-11px on 1200-unit canvas with text over bands (low contrast); treemap drops labels on narrow cells (the narrow Satellite cell is unlabelled in cg/c1-a.jpg); ribbon markers 13px; compare series 3 is orange (= drawdown).

## 4. Decisions Bobby must take (UI)
| ID | Question | Options | Recommendation | UX consequence |
|---|---|---|---|---|
| D-UI-1 | Gain/loss and series colours | A: signed text green/red, chart series blue, orange only for drawdown/negative bars. B: blue/orange everywhere incl. text. C: green/red everywhere incl. charts | A, plus remove orange from recall flag, returned pin, compare series 3 (compare palette: blue, teal, gold, magenta; purple stays simulated-only) | Traders keep instant green/red reading; charts stay colour-blind safe; orange gets ONE meaning. Needs `--series*`/`--flag-*` added to tokens.css |
| D-UI-2 | Context bar vs per-screen controls (C1 vs m01-m10) | A: ContextBar only (env/window/currency/scope), panels show label. B: both | A; chart-local zoom allowed, gate evidence + Operations 24H are "fixed" and show a lock chip | One switch changes every panel (no 90D here / 30D there); you lose per-panel window freedom except by explicit pin |
| D-UI-3 | Governance light cockpit (S2/C4) vs tokens | A: light cockpit, tokenised `operations-carbon-light` restored, sans only. B: dark Carbon cockpit. C: light with Georgia/Iowan as built | A (S2 is already your decision; c4 as built is page-local hex + unbundled serif and cannot ship) | Reviewer screens feel different from ops screens by design; costs a theme + baselines. B is cheaper and more "one product" but reverses S2 |
| D-UI-4 | Status marker | A: every status is a glyph Flag. B: dot only for freshness/liveness, Flag for the rest | B | Health columns gain glyph+word; tables get ~15% wider; dots stop being used as health |
| D-UI-5 | <=1100px navigation and 660px tables | Nav: overlay drawer from a menu button vs top tabs. Tables: cards (m02 pattern) vs h-scroll with sticky first column | Overlay drawer; cards for browse lists (M02, M03, M08, Ops queue), h-scroll for ledgers/blotters | Phone/tablet users can navigate and act; 3 more card layouts to build and baseline |
| D-UI-6 | Drawer model | A: docked 380 (today). B: docked 480 (DS §8). C: docked only when the table still fits, else overlay | C (m09 already clips at 380) | Ops/Fleet tables keep their action column; below ~1500px detail covers the table |
| D-UI-7 | "Pending" score placeholder | A: keep column/KPI. B: one chip in masthead "Score: pending, policy not set" and hide column/KPI until the policy exists | B | Removes 1 of 5 KPIs and a whole column of "Pending"; future layout stays reachable in drawer (D1) |
| D-UI-8 | Hero ambition | A: full set (Sankey, board, ribbon, heat map, spine) in the build. B: ship m-screens first, concepts as phase 2 | A for M04, M05, M09 (high rows in 3.3); B for the rest | Screens start to look like one product at launch; adds chart components (Sankey/treemap) and their baselines |
| D-UI-9 | Type scale | Adopt execution.css roles as law and add `readout` 18/24 + `kpi-na` 16; h1 400/24 or 300/22 | Add the two roles; keep 400/24 (prod title role) and update DS §7 | One size per role; removes 6 big-number variants |
