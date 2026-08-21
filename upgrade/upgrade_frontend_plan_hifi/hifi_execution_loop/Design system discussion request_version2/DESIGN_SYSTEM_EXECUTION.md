# DESIGN_SYSTEM_EXECUTION.md
> Design system for the Execution cluster (Gates R1/R2 + Paper → Sandbox → Canary → Live).
> Extends — never forks — the Fund Paper token authority in `apps/portal/frontend/src/styles/tokens.css`.
> Status: v1 DRAFT (hi-fi in progress). Companion: `EXECUTION_CLUSTER_GUIDE.md` (D1–D6 locked decisions, nav graph, backend shape).

## 1. Theme & density defaults (decision D1)
| Surface | data-theme | data-density |
|---|---|---|
| Governance (Approval Inbox, R1, R2) | research (light) | comfortable |
| R2 capital/ops preview strip | operations vocabulary inside a light page (dark panel, mono, AuthorityBadge) | — |
| All Deployments screens (Paper/Sandbox/Canary/Live, Alpha 360°, Account 360°) | operations (dark) | operational |
| Portfolio 360° | user preference (default light for Manager persona) | compact |
User may override both; **no safety meaning rides on theme** — safety = text + icon + border + badge.

## 2. Token patch (additive to tokens.css — no existing value changes)
All raw literals stay in tokens.css; these are the proposed additions, light / operations values:

```css
/* Canary & guard (D2: no new hue — canary borrows the live red) */
--guard:            var(--env-live);
--guard-bg:         #f7e8e8;            /* ops: #331b1b */
--env-canary:       var(--env-live);    /* label differentiates: "LIVE · CANARY" */
--lifecycle-canary: var(--env-live);

/* Authority (who owns this number) */
--authority-research:  #0f4c5c;   /* ops: #7fb3c4 */
--authority-execution: #1c2532;   /* ops: #e3e9f1 */
--authority-broker:    #9a6a1f;   /* ops: #d4a75e */
--authority-derived:   #77839a;   /* ops: #8b97a8 */

/* Freshness (age vs per-venue policy — threshold lives in venue registry, not CSS) */
--fresh-ok:    var(--good);
--fresh-aging: var(--state-degraded);
--fresh-stale: var(--state-stale);

/* Runtime state (Trading System vocabulary ≠ availability vocabulary) */
--run-active:   var(--good);
--run-reducing: #b4772f;          /* ops: #d49b5e */
--run-halted:   #6f7a8c;          /* ops: #8b97a8 */
--run-archived: var(--ink-faint);
--sync-mismatch:    var(--bad);
--sync-mismatch-bg: var(--bad-bg);
```

## 3. Typography in the operations world
- Serif (Newsreader): **page title only**. Panel titles = `.subsection-title` (mono 11px uppercase). Research keeps serif panel titles.
- All numerics: JetBrains Mono, `tabular-nums`, right-aligned in tables, never abbreviated in blotters; precision per instrument metadata.
- Column headers: prose face micro-labels (existing `.table-wrap thead th` rule) — not mono.
- Every value panel carries currency chip when venue currency ≠ portfolio currency (USDT/USDC/VND — never summed without FX policy).

## 4. Component contracts (new, promoted per spec §15.4 rule: ≥2 screens + domain semantics)
| Component | Anatomy | Used by |
|---|---|---|
| **AuthorityBadge** | `[AUTHORITY] · as_of hh:mm:ssZ · age` — color from `--authority-*`, glyph per authority; standard slot = panel/header right | every data panel, all screens |
| **EnvironmentBadge** | outline chip, `--env-*` color + stage text; live/canary variants swap to GuardBand | topbar + workbench headers |
| **GuardBand** | full-width band: shield glyph + `LIVE` / `LIVE · CANARY` text + double (canary) or solid (live) `--guard` border | 1e, 1f, 1g (live accounts) |
| **VenueScope** | chip-row or select fed by venue registry; multi-select on aggregate screens, single where identity = one account; renders future venues automatically | 2a, 2b, 1h/3a, lists |
| **FreshnessIndicator** | dot + age text; threshold per venue policy; stale state adds banner, never silently | all ops panels |
| **ObservationProgress** | n/m bars (days/trades/cycles) + gate rule line; drives Exit-Review CTA enabled state | 1c, 1d, 1e |
| **BrokerStateDiff** | 3 columns Internal / Physical / Difference + findings table (status·severity·identity·local·broker·action) | 1d, 1g, reconciliation |
| **LifecycleRail** | R1→R2→Paper→Sandbox→Canary→Live stepper, current stage emphasized, approvals as links | 2a, passport, exit reviews |
| **CommandPlanDrawer** | PLAN→APPLY→VERIFY stepper · before/after · policy checks · Equivalent CLI (read-only) · reason · step-up apply; PARTIAL never green | every mutation (1i) |
| **ConditionList** | typed conditions: text · owner · deadline · expiry · blocking flag | R1/R2, passports, exits |
| **InsightClaim** | claim_code · metrics · window/samples/coverage · formula version · grade · evidence refs; LLM may only paraphrase it | 3a, 2b |
Reuse as-is from base.css/shell.css: `.panel .panel-head .panel-body`, `.metric-cell/.metric-value/.metric-strip`, `.badge-state/.badge-env/.badge-maturity(-dashed)`, `.chip`, `.navtab`, `.btn-primary/.btn-ghost`, `.table-wrap`, `.definition-list`, `.callout`, `.stepper`, `.field/.input`.

## 5. Chart envelope contract (every chart, no exceptions)
Rendered caption row: `window · interval · currency · as_of · source authority · formula_version · samples/coverage`. Rules: no smoothing that moves extrema; gaps stay gaps; stages differ by line style + label (never color alone); benchmark = secondary line; orders/fills/incidents = annotation layers; `INSUFFICIENT_DATA` is a rendered state.

## 6. State rendering rules
- 4 separate fields, never merged: runtime state · promotion stage · readiness · broker sync.
- `STALE / MISMATCH / DENIED / UNAVAILABLE / PARTIAL / INSUFFICIENT_DATA` are visible states with text + tone, never `0`, never green.
- Stage names verbatim: `PAPER_OBSERVATION · SANDBOX_VALIDATION · LIVE_CANARY · LIVE_FULL`.
- Mutation buttons render only for Operator Admin scope; disabled ≠ hidden for other roles only when policy says visible-but-inert.

## 7. v2 restyle — owner direction (2026-08-19)
Owner rejected the Fund-Paper-derived dark (`#101720` blue-tinted) as characterless. Operations Dark is now an **IBM Carbon black identity** (per `Design/ibm_design.md`), applied in `HiFi Paper Workbench.dc.html`:

```css
/* Operations Dark v2 — carbon black, flat geometry (border-radius: 0 everywhere) */
--ops-canvas:  #161616;  --ops-sunken: #101010;  --ops-panel: #1d1d1d;  --ops-field: #262626;
--ops-line:    #393939;  --ops-line-soft: #2a2a2a;
--ops-ink:     #f4f4f4;  --ops-ink-soft: #c6c6c6;  --ops-ink-faint: #8d8d8d;  --ops-ink-mute: #6f6f6f;
--ops-accent:  #78a9ff;  /* links, active nav rail (3px left border), active tab, chart primary */
--ops-action:  #0f62fe;  /* the ONE solid button color (primary/admin actions) */
--ops-good:    #42be65;  --ops-good-bg: #071f11;
--ops-bad:     #fa4d56;  --ops-bad-bg:  #2d0709;
--ops-warn:    #f1c21b;  --ops-warn-bg: #302608;   /* STALE, PARTIAL, watch */
--ops-paper:   #be95ff;  /* PAPER env; sandbox #f1c21b; live/canary guard #fa4d56 */
```
Typography v2 (mono-forward, personality from the wireframes): **IBM Plex Mono** carries labels, nav badges, buttons, tabs, IDs, all numerics, lineage strip, table headers; **IBM Plex Sans** carries body prose and the page title at **weight 300** (IBM light-display signature). No serif in the operations world. Flat geometry: square corners, 1px hairlines, KPI strip = cells separated by 1px gap on hairline background (no cards floating). Buttons square; exactly one solid-color button per screen (`--ops-action`).

## 8. Responsive & scaling contract (WF 4f — how to read hi-fi sizes)
**The hi-fi mocks are ONE viewport sample (~1440px), not a pixel spec. Do NOT hardcode their absolute sizes.** Scale by the repo's existing shell conventions (`apps/portal/frontend/src/styles/shell.css` is the authority — reuse its classes/vars instead of inventing new breakpoints):

- **Shell**: topbar `var(--topbar-h)` + rail sidebar. Sidebar renders only ≥1024px (`@media (min-width:1024px) .portal-rail{display:block}`), below that: hidden, opened as overlay; collapsed rail = `var(--sidebar-collapsed-w)`. Content column = `max-width: var(--content-max)`, centered, `padding: var(--space-5) var(--content-gutter)`. Page NEVER scrolls horizontally.
- **Breakpoint ladder** (the only ones shell.css uses — stick to them): 640 · 768 · 900 · 1024 · 1280. Examples already in repo: metric grids `2 → 3 (768) → 5 (1280)` cols; two-pane detail `1fr → 1fr/380px (1280)`; form grids `1 → 2 (640) → 3`.
- **Panels/KPIs**: prefer `repeat(auto-fit, minmax(0-based min, 1fr))` or the repo's stepped `repeat(n, minmax(0,1fr))` ladders; paired panels (2fr/1fr etc.) collapse to 1 column below 1024. No orphan grid cells — last row must fill (flex-wrap + `flex:1 1 <min>` where auto-fit would orphan).
- **Tables/blotters**: `overflow-x:auto` inside the panel with a `min-width` on the table (repo uses ~880px), sticky header; virtualize + keyset cursor for long lists.
- **Drawers**: side drawer ~470–490px docked right ≥720px; full-screen overlay below 720px.
- **Type/hit floors**: load-bearing text ≥11px, captions may be 10px mono; interactive targets ≥30px height (repo navitem min-height 30px).
- **Judgment rule for the agent**: when a hi-fi width conflicts with these rules at another viewport, the rules win — keep the hi-fi's *proportions and hierarchy*, let the shell's grid decide actual pixels. Anything genuinely fixed (badge paddings, 1px rules, chip sizes) is already a token or repo class; everything else is fluid.

## 9. Component ↔ screen matrix (which screen uses what — implement once, mount per row)
| Component | Variant | Screens |
|---|---|---|
| AuthorityBadge | EXECUTION | all workbenches, 360°s, Blotter, Ops Queue |
| AuthorityBadge | BROKER (+digest, age) | Sandbox Cert, Live Full, Account 360°, Incident |
| AuthorityBadge | DERIVED (+formula ver) | Portfolio 360° corr panels, Alpha 360° insights, diff columns |
| LifecycleRail | full labels | Paper WB, Paper VNM, Sandbox Cert, Canary CR, Live Full (under header band; icons-only <900px) |
| Guard band | double red + shield `LIVE · CANARY` | Canary CR, canary rows anywhere |
| Guard band | solid red `LIVE` | Live Full, Account 360° (live), Incident (live scope) |
| VenueScope | multi-select | Alpha 360°, Blotter, Portfolio 360° |
| VenueScope | single (identity) | workbenches, Account 360° |
| FreshnessIndicator | per-venue policy | every broker-sync surface; paused-by-calendar variant only VNM |
| StatusChip | FILLED/PARTIAL/REJECTED/OPEN | Blotter, Alpha 360° Orders, workbench blotters |
| StatusChip | VERIFIED/PARTIAL/AWAITING_APPLY | Ops Queue, Action Drawer, Incident, audit tabs |
| CommandPlanDrawer | plan→apply→verify | Action Drawer (owner), launched from Incident, Account 360°, workbenches |
| EvidencePanel | check ✓/!/✗ + link | R1, R2, Exit Reviews, Sandbox Cert |
| SLA cell | age / budget + OVERDUE | Approval Inbox, Command Center triage |
| Triage row | rank + type chip + action link | Command Center only |
| ChartTile | envelope caption mandatory | Alpha 360° insights, Portfolio 360°, workbench equity |
| Empty/DENIED/LOADING states | per §4g | every screen; DENIED reference = role lens (WF 5c) |

Canonical sample data: `CANONICAL_CAST.md` — screens must not invent ids outside it.
Notes: (1) LifecycleRail is screen-level on workbenches only; on Alpha/Portfolio 360° lifecycle is **per-deployment** (deployment map rows carry stage) — do not add a screen-level rail there. (2) The §4g state set (LOADING skeleton / DENIED / UNAVAILABLE / empty) applies to EVERY panel of every screen even where the hi-fi shows only the happy path; DENIED reference = role lens WF 5c.

## 10. Screen theme matrix & wireframe lineage
Every hi-fi file must declare its wireframe id (chip `WF <id>` in header + in chat).
See `EXECUTION_CLUSTER_GUIDE.md` §3 (wireframe ids) and §6 (non-negotiables). Hi-fi files land as `HiFi <Screen>.dc.html`, one per screen, all reading this document.
