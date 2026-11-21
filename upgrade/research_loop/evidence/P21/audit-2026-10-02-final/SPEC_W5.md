# SPEC_W5 — A11y, chart interaction contract, evidence-cursor consistency

Base `9a2571db` (FE code identical to the preview at `:8095`; the base only adds docs on top of `1bcee81a`). Source: `FRONTEND_AUDIT_2026-10-02.md` §5 W5 (items 23–25), reports CROSS, FLOW_B, DOCS_A. Paths are under `apps/portal/frontend/src/` unless prefixed. Measured on 2026-10-02 by `spec-w5/axe.mjs` (axe-core via `@axe-core/playwright` 4.13, tags wcag2a/aa/21a/21aa/best-practice, full page) and `spec-w5/probe*.mjs`, on the live preview. Nothing was mutated. Scripts and raw probe output are in `spec-w5/`.

Direction applied: fewer words. Every accessible name that is added is one short phrase; explanations stay in `title`/sr-only summary, not inline.

## 0. Corrections to the first-pass reports (measured, not assumed)

| First-pass claim | Measured on `9a2571db` | Consequence |
|---|---|---|
| S09 equity has no focus / hover only | `ReportDetail.tsx:947-975` is `role=group tabindex=0`, arrows, +/-, Esc. All-time curve (`ReportAllTime.tsx:356`) and return histogram (`:562`) the same. Months (`:679`) and episodes (`:767`) are per-item tab stops | S09 keyboard exists. Real S09 gaps: **touch** (equity has `onPointerMove` only, no `onPointerDown`; all-time/hist clear on `onPointerLeave`, which touch fires right after lift) and no Home/End/summary. 390 px probe: tap on equity, hist, months, episodes changed nothing in 4 of 4 |
| S06 scatter "no role/label/tabindex" | `SearchSurface.tsx:253-308` is `role=group` + roving-tabindex `<button>` per point + arrows/Enter/Esc | Scatter is the best chart on the product; only its tap/hit-area and one-stop budget are open |
| "S06 135 aria-label spans" | 135 = 96 histogram bins (`SearchSurface.tsx:535-545`, `span tabindex=0 aria-label`) + 39 pool-plane dots (`SearchStageB.tsx:403-418`) on R-WFO-023; R-WFO-027 (causal) has only the 96 bins | Same fix class, two files |
| Step pills "unnamed at 390" | `NewRun.tsx:404-411`: all 8 have an accessible name at 390 (`"Strategy — not visited"` …). Pill 1 reads `"1Contextno version chosen"` (no aria-label when `showText`) | Not an axe issue. Fix pill 1 name only (§1 row 14); pills are 32x37 px (≥24 OK, <44) |
| S13 link contrast 1.67 / 1.31 needs a token | axe message: link `#0f4c5c` vs surrounding text `#5c6780` (dark: `#7fb3c4` vs `#8696ab`). Both colours are already AA on their surface; the rule asks for a non-colour cue | Fix is an underline, not a token (§1 row 2). No token value can make a link 3:1 against its own paragraph and 4.5:1 against the page |
| S04 404 "missing h1/h2" | 404 branch has an h1 (`EvidenceFlow.tsx:4604`); it fails on nested `<main>` (`:4594`) and duplicate `main`. The **normal hub** has no h1 (axe `page-has-heading-one`, S04 both runs) | Two separate fixes |

## 1. Axe re-measure (R-WFO-023 and R-WFO-027, S00–S14 + S04 404, 1440 and 390, Research Light and Operations Dark)

48 + 24 cells scanned, 0 script errors. The theme switch was verified (`data-theme` read back on every cell). Counts are nodes **per cell** (same in all four cells unless a column says otherwise).

### 1.1 Table: rule · screen · selector · count · file:line · fix

| # | Rule (impact) | Screen | Selector | Count | file:line | Fix |
|---|---|---|---|---|---|---|
| 1 | `aria-allowed-attr` (**critical**) | S13 | `button[data-mode-option]` (attempts/markets/pair) | 3 x 4 cells | `CompareDetail.tsx:1022` (`aria-pressed` on `role=tab`); CSS `:350` keys on `[aria-pressed="true"]` | Delete `aria-pressed`; keep `aria-selected`. CSS `:350` and tests (`compareDetail.test.tsx`, `compareChartLife.test.tsx`, any `[aria-pressed` on `data-mode-option`) key on `[aria-selected="true"]`. `data-mode-option` stays |
| 2 | `link-in-text-block` (serious) | S13, 1440 only, both themes | `.foot > a[data-action=open-lineage]` | 1 | `CompareDetail.tsx:1678` (link in `.cp-tcard > .foot`, css `:455`); same pattern `:1073` (`.cp-meta`), `:1709` | 1.67:1 light / 1.31:1 dark is link vs paragraph colour. Add `.cp-page .foot a, .cp-page .cp-meta a, .cp-page p a { text-decoration: underline; text-underline-offset: 2px; }` next to css `:329`. Axe exempts underlined links. No token change |
| 3 | `aria-prohibited-attr` (serious) | S06 | `span[aria-label]` histogram bins | 96 (both runs) | `SearchSurface.tsx:535-545` | Bins become decorative (`aria-hidden`, no `tabIndex`, no `aria-label`). The container (`:531`, already `role=img` + label) becomes the chart-contract region (§2): one tab stop, arrows walk bins, readout via the existing `useReadout` + sr-only live text |
| 4 | same | S06 (R-WFO-023 only) | `span.absolute.rounded-full[data-plane-point]` | 39 | `SearchStageB.tsx:403-418` | Same: dots `aria-hidden`, container `:392-396` (`role=img`) becomes a contract region over `placed[]`; arrows step through candidates in published order; readout = the `words` string already built at `:403` |
| 5 | `nested-interactive` (serious) | S07 | `.grid-cols-9` | 1 | `WhatIfCard.tsx:383` (`role="img"` around 81 `<button>` cells) | `role="img"` -> `role="group"` + same `aria-label`. Cells keep `aria-label`. Raise cell hit area 14x14 -> 24x24 via 24 px grid track (`grid-cols-[repeat(9,24px)]`), no visual change to the dot (`::before`) |
| 6 | `scrollable-region-focusable` (serious) | S03 | `div[role="log"]` | 1 (all cells) | `RunProgress.tsx:1533` | Add `tabIndex={0}` (the log is `aria-label="Trial console"`; keep `role=log`, `aria-live=polite`). Focus ring via existing outline rule |
| 7 | same | S07, 390 only | `ol.max-h-[320px].overflow-y-auto` | 1 | `FreezeDetail.tsx:1395` | `tabIndex={0}` + `role="region"` + `aria-label="trial pool"` (<=3 words; match the card title) |
| 8 | `color-contrast` (serious) | S05 | `button[data-theta-lane=2..9] [data-theta-is]` label `<span>` and `[data-theta-oos]` label | 16 light (`#959ca8` on `#f2f5f6` = **2.52**; white on `#638b95` = 3.71); 16 dark (`#6f7987` on `#161f2b` = 3.76; `#121519` on `#5a7f8e` = 4.23) | `SplitDetail.tsx:2470` and `:2487` (`opacity: active ? 1 : 0.6 / 0.65` on the bar *including its text*) | Root cause is opacity on the label, not the label colour. Move the fade to the fill only: `background: color-mix(in srgb, var(--surface-3) 60%, transparent)` / `role-oos` the same; remove `opacity` from the element. Measured: `--ink-soft #4e5a6e` at full opacity on `#f2f5f6` = 6.36 (at 0.6 = 2.66). OOS label: `--accent-contrast` on solid `--role-oos` (light `#0f4c5c`) = 9.51; dark `#101010` on `#7fb3c4` = 8.29 |
| 9 | `color-contrast` (serious) | S04 (both runs, 1440+390) | `[data-verdict-chip="PASS"]` in the selected `tr` | 1 | `EvidenceFlow.tsx:2670` | `--good #1e7b4f` on row bg `--accent-soft #e2edf0` = **4.40**. Give the chip its own fill `--good-bg #e3f1e9` (= 4.50, borderline) or `--paper-raised` (= 5.25). Use `--paper-raised` |
| 10 | `color-contrast` (serious) | S06, 1 node | `.px-1.5` red text (`#ce817f` on paper = 2.81 at 1440 light; `#bd5151` = 4.46 at 390 light; `#975154` = 3.10 dark 390) | 1 | not located (selector is only `.px-1\.5`; red + reduced opacity suggests a `--bad` chip drawn with `opacity`) | Agent B: find with `page.locator("[class*='px-1.5']")` filtered by `getComputedStyle(color)`; same rule as row 8 (no opacity on text; fade the fill) |
| 11 | `color-contrast` (serious, **shell on all 15 screens**) | S00–S14 | `.portal-navgroup-label` (`#939db0` on `#f4f2ec` = 2.43), `.portal-workspace` (`#939db0` on `#faf9f5` = 2.59), `kbd` (`#939db0` on `#fff` = 2.73; dark `#738095` on `#161e2a` = 4.19), nav items `COMMISSIONED` (label `#949aa3` on `#f4f2ec` = 2.53, badge `#acb2bc` = 1.90; dark 3.8 / 2.9), `badge-maturity[PROTOTYPE]` (`#9a6a1f` on `#f4f2ec` = 4.21) | 984 light + 696 dark nodes at 1440; 48 / 24 at 390 | `styles/shell.css:204` (navgroup label), `:113` (`.portal-search-btn kbd`), nav item/badge rules, `styles/tokens.css:26` (`--ink-faint`), `:322` (dark) | Token fix, see 1.2. COMMISSIONED items: if they are inert, mark `aria-disabled="true"` (axe exempts inactive controls) **and** drop their opacity; else give them `--ink-mute`. PROTOTYPE badge text `#9a6a1f` -> `#8a5f1a` (5.03 on `#f4f2ec`) |
| 12 | `landmark-main-is-top-level`, `landmark-no-duplicate-main` (moderate) | S04 404 | `.mx-auto` / `#portal-content` | 1 each | `EvidenceFlow.tsx:4594` (`<main>` inside `PortalShell` `<main id=portal-content>`, `app/PortalShell.tsx:147`) | `<main>` -> `<div>` (keep all `data-*`). h1 already present (`:4604`) |
| 13 | `page-has-heading-one` (moderate) | S04 (hub), S09, S10, S11, S13 | `html` | 1 | S04: no h1/h2 (`EvidenceFlow.tsx`, first heading is h3); S09 `ReportDetail.tsx` title is h2; S10 `LineageDetail.tsx`; S11 `ReleaseCandidateDetail.tsx`; S13 `CompareDetail.tsx:995` (`<h2 className="cp-title">`) | S09/S10/S11/S13: promote the existing title `h2` -> `h1` (same class). S04 hub: add one visible `h1` (`Evidence Flow · {R-label}`) in the header block; this is also the W4 header item, so the same `h1` serves both. S04 hub already has the label chips; do not add a second line |
| 14 | `landmark-unique` (moderate) | S01, S05–S08, S10–S14, S04 404 | `nav.portal-breadcrumbs`, `#portal-content` | 1 | `app/TopBar.tsx:82` (`aria-label="Breadcrumb"`) duplicates in-page `nav aria-label="Breadcrumb"` (`CompareDetail.tsx:988`, `RunLibrary.tsx`, `EvidenceFlow.tsx:4596` `"Research breadcrumbs"` is unique, others are not) | One breadcrumb nav per page. Preferred (fewer words): delete the in-page crumb where the TopBar already prints `Research / Runs / R-xxx`; else rename the in-page one to `aria-label="Run path"`. Agent F decides per screen; acceptance is axe `landmark-unique` = 0 |
| 15 | (not axe) | S02 | `[data-step-pill=context]` | 1 | `NewRun.tsx:409` (`aria-label` only when `!showText`) | Always set `aria-label={`${step.label} — ${caption}`}` so pill 1 reads like the others |

Rules that remained **0** in all cells: `aria-roles`, `button-name`, `link-name`, `label`, `image-alt`, `duplicate-id`, `heading-order`, `region`, `scrollable-region-focusable` on S04–S06/S08–S13, `target-size` (not in the default tag set; measured separately in W3).

### 1.2 Token proposal (this is D-B1; the only axe exception still carried in `e2e/axeReceipt.ts:INK_FAINT`)

`--ink-faint` is `#939db0` (light) / `#738095` (operations dark). Numbers computed with the WCAG relative-luminance formula (`spec-w5/c2.py`):

| Token | Now | Contrast now (paper / raised / sunken / accent-soft / line-soft) | Proposed | Contrast proposed (same surfaces) |
|---|---|---|---|---|
| light `--ink-faint` (`tokens.css:26`) | `#939db0` | 2.59 / 2.73 / 2.44 / 2.29 / 2.33 | **`#5f6b80`** | **5.11 / 5.38 / 4.81 / 4.51 / 4.59** (>=4.5 on every light surface in use) |
| light `--ink-mute` (`:29`) | `#68738a` | 4.52 / 4.76 / 4.26 / 3.99 / 4.06 | **`#566278`** | 5.84 / 6.15 / 5.49 / 5.16 / 5.24 (must stay stronger than faint, weaker than `--ink-soft #4e5a6e` = 6.62 / 6.97 / 6.23 / 5.85 / 5.95) |
| dark `--ink-faint` (`:322`) | `#738095` | 4.51 / 4.19 / 4.70 / 3.82 (surface-2) / 3.65 (accent-soft) | **`#8a98ac`** | **6.15 / 5.72 / 6.42 / 5.21 / 4.98** |
| dark `--ink-mute` (`:678`) | `#98a6ba` | 7.29 / 6.78 / 7.61 / 6.18 / 5.91 | unchanged | ramp stays ordered: soft 8.76 > mute 7.29 > faint 6.15 (dark paper) |

Why not `#667085` (4.72 on paper): it passes paper/raised/sunken but is 4.17 on `--accent-soft`, where S05's lit θ-lane and chips draw `--ink-faint` text. `#5f6b80` is the lightest grey that clears 4.5 on all five surfaces.
Cost: light hierarchy compresses to soft 6.6 / mute 5.8 / faint 5.1. This is a shared token, so it moves every baseline; per `tracker D-B1` and memory ("token changes become their own step"), it is its own commit and Bobby runs the recorder. `tokens.test.ts:323-366` pins the ramp only for `operations-carbon`; add the same ordered-ramp + 4.5 test for `research` and `operations` (the test already reads `tokens.css` by theme).
`e2e/axeReceipt.ts` `INK_FAINT`/`accepted: "D-B1"`: delete after the token lands so the exception cannot hide a regression.

## 2. Chart interaction contract

### 2.1 Contract (one document; applies to any chart that draws more than one data point the reader may need)

1. **One tab stop per chart.** The region is `role="group"`, `tabIndex={0}`, `aria-roledescription="chart"`, `aria-label="<what> — <unit/scope>"` (one phrase, <=8 words, no key help inside it), `aria-describedby` -> the sr-only summary. Points/bins/dots inside are `aria-hidden` and **not** tabbable. Exception kept as-is: S06 scatter (400 points) keeps its roving-tabindex buttons (already a single stop) and its own spatial arrows; it adopts everything else below.
2. **Keys** (when the region is focused; ignore with Ctrl/Meta/Alt; `preventDefault` only for handled keys):
   - `ArrowLeft/Right`: previous/next point (readout moves). `ArrowUp/Down`: only on 2-D plots (scatter) via the existing `neighbourInDirection`.
   - `Shift+Arrow`: jump 10 points; when zoomed and the plot is time-based, **pan** by 25 % of the window (matches `ReportDetail.tsx:966-968` and `ReportAllTime.tsx:330`; S04 moves from "arrows pan" to this).
   - `Home` / `End`: first / last point. `PageUp/PageDown`: previous / next *event* where the chart has events (S08 transitions); otherwise unused.
   - `Escape`: clear the readout, keep focus. (S08: readout falls back to the playhead; scatter: clears the pick, existing.)
   - `+` / `=` zoom in, `-` / `_` zoom out, `0` reset - **only** where the chart zooms (S04, S08, S09 equity, S09 all-time). Zoom steps reuse the existing pure `zoomWindow` (`EvidenceCharts.tsx:140`, ratios 0.7 / 1.4, min 2 %, >=95 % snaps to full).
   - `Enter` / `Space`: activate the point when the chart has an action (scatter pick, S08 seek-to-marker). Never on charts without an action.
3. **Readout.** Every move (key, tap, hover) sets one string: **the same string as the point's `title`** (the server's own text; the UI computes nothing). It is shown in the chart's tooltip/readout line and written to one `role="status" aria-live="polite" class="sr-only"` node owned by the hook. Hover updates the tooltip but **not** the live node (no screen-reader chatter); key and tap updates do.
4. **Touch.** `pointerdown` (any pointer type) sets the readout and **pins** it. `pointerleave` / `onBlur` clear only when `pointerType === "mouse"`. A touch readout is dismissed by a tap outside the region (document `pointerdown` listener, removed on unmount), by Escape, or by tapping the same point. Plot uses `touch-action: pan-y` so a vertical drag scrolls the page and a horizontal drag scrubs. For dense plots (scatter, pool plane, histogram) a tap snaps to the nearest point within 24 px (WCAG 2.5.8) instead of requiring a 5-9 px hit.
5. **sr-only summary** (`<p id class="sr-only">`, one sentence, composed only of served strings): `"<noun> chart, <n> <points>, <first label> to <last label>. Arrow keys read a point."` Where the screen already prints a sr-only data table (S04 968 rows, S09 859 rows, S08 309 rows - CROSS #10), the table is replaced by this summary + the keyboard readout when rows > 120; the full table moves behind a visible "Data" `<details>` (W4 owns number formatting inside it).
6. **Reduced motion.** Entry animation only through `useEntryAnimation`/`useEntryRef` (`chartLife.ts:40-62`), `useDrawIn` (`compareChartLife.tsx:38`), ECharts `entryAnimation()` (`EvidenceCharts.tsx:121`) - all gate on `smokeMotionAllowed()` (reduce + fixtures + `navigator.webdriver`). The hook itself never animates: crosshair/tooltip move instantly; zoom applies without easing. Every `@keyframes` class used by a chart has an `@media (prefers-reduced-motion: reduce)` neutraliser (present at `ReportAllTime.tsx:129`, `ExecuteCandleReplay.tsx:477`, `CompareDetail.tsx:502`, `researchScreen.css:134`; **add** for `[data-entry]` WAAPI marks is unnecessary because they never start). Polling is not motion (memory rule): data refresh must not replay an entry.
7. **Focus ring.** The region uses the existing `outline-offset-2 focus-visible:outline` pair (`EvidenceCharts.tsx:277`) - same everywhere.

### 2.2 Reuse vs. new

Reuse (do not rewrite): `chartLife.ts` (`useEntryRef`, `useEntryAnimation`, `useReadout`, `entryAllowed`), `compareChartLife.tsx` (`useDrawIn`, `ScrubLayer`, `nearestIndex`, `tipMinus`, `datasetKey`), `EvidenceCharts.tsx` (`zoomWindow`, `chartMotion`, `entryAnimation`, `ChartShell` for ECharts), `neighbourInDirection` (`SearchSurface.tsx`), `nextWindow` (`ReportAllTime.tsx:37`).

**New shared hook**: `research/chartContract.tsx`, one file, three exports:

```ts
export interface ChartContract {
  /** spread on the region element: role, tabIndex, aria-*, key + pointer handlers */
  regionProps: HTMLAttributes<HTMLElement>;
  /** current point index, or null when no readout */
  index: number | null;
  setIndex(i: number | null): void;
  /** the readout string (== the point's title) or null */
  text: string | null;
  /** <ChartLive/> and <ChartSummary/> render the two sr-only nodes */
}
export function useChartContract(o: {
  label: string;                        // aria-label, no key help
  noun: string;                         // "point" | "bar" | "bucket" | "candidate"
  count: number;                        // 0 => not focusable; caller renders its typed absence
  describe(i: number): string;          // == title text
  summary: string;                      // sr-only sentence
  xs?: readonly number[];               // plot x in %, enables pointer nearest-point snapping
  zoom?: { zoomIn(): void; zoomOut(): void; pan(dir: -1 | 1): void; reset(): void };
  events?: { prev(): void; next(): void };      // PageUp/PageDown
  onActivate?(i: number): void;         // Enter/Space
  onIndex?(i: number | null): void;     // S08 -> transport.seek, S06 -> setRoving
  controlledIndex?: number | null;      // S08: the playhead owns the index
}): ChartContract;
export function ChartLive(p: { text: string | null }): JSX.Element;       // role=status sr-only
export function ChartSummary(p: { id: string; text: string }): JSX.Element; // sr-only
```

`compareChartLife.useScrub(xs)` becomes a 6-line wrapper over `useChartContract` (same return `{index, handlers}`) so `RunLibrary.tsx:857,929` and `CompareDetail.tsx:924,2169` keep compiling; its pointer handlers gain the touch rule (it currently clears on `onPointerLeave` unconditionally, `:94`). `ChartShell`/`useChartLink` (`EvidenceCharts.tsx:193-281`) call the hook for keys and add ECharts `dispatchAction({type:"showTip", seriesIndex:0, dataIndex})` + `highlight` so a keyboard index shows the same tooltip a hover shows. S09's private handlers (`ReportDetail.tsx:953-975`, `ReportAllTime.tsx:360-364,566-570`) are replaced by the hook.

### 2.3 Application per chart (current state measured -> change)

| Chart | file:line | Today (measured) | Change |
|---|---|---|---|
| S06 scatter | `SearchSurface.tsx:253-308` | group + roving buttons + arrows/Enter/Esc; tabstops on S06 = **717** overall (page); 5-9 px hit; tap sets readout (`readout.bind`) but nothing nearest-snaps | Keep roving. Add: tap snaps to nearest placed point within 24 px (`xs`/`ys` of `placed`), hook for live text (the existing `aria-live` span at `:317` is the live node; keep one), drop `aria-pressed` on dots (not a toggle group; use `aria-current` on the picked one), shorten per-dot `aria-label` to `trial 351 · IS 1.23` (full text stays in `title`) |
| S06 histogram | `SearchSurface.tsx:501-560` | 96 bins `tabindex=0` (96 tab stops), `aria-prohibited-attr` x96 | One group per parameter (`role=group`, label `"<param> distribution"`), arrows over bins, readout = existing `readout.bind` text (`:548`) via live node; bins `aria-hidden`. Tab stops: 96 -> 8-ish |
| S06 pool plane | `SearchStageB.tsx:385-420` | 39 dots `tabindex=0 aria-label` | Contract region over `placed[]`; dots `aria-hidden`; arrows in published order |
| S06 study selector | `SearchSurface.tsx:730-760` | `aria-pressed` buttons; local `useState` | Bound to cursor (§3.4) |
| S08 candle/equity panes | `ExecuteCandleReplay.tsx:733` (`host` `aria-hidden=true`, lightweight-charts canvas), readout `:716-731`, transport keys `ExecuteDetail.tsx:1977-1993` + `replayTransport.ts:196` | Canvas not focusable; arrows/Space are a **window-level** listener (hijacks page scroll from any focus on the page); tap works (readout shows, measured); no role/label | Wrapper `div` around host gets `regionProps` (`controlledIndex` = transport index, `onIndex` = `transport.seek`); arrows step the bar, `Shift` 10 (`JUMP`), `Home/End` ends of the loaded window, `PageUp/PageDown` previous/next transition (the existing previous/next-transition handlers (`ExecuteCandleReplay.tsx:1340,1356`)), `+/-/0` call `chart.timeScale().setVisibleLogicalRange` (x0.7 / x1.4 / fit), `Space` toggles play only while focus is inside the stitched section. Move `useTransportInput` from `window` to `onKeyDown` on `section[aria-label="stitched account replay"]` (`:2134`, give it `tabIndex={-1}`); this is the WCAG 2.1.4 fix for the Space key. Summary sentence from served first/last bar times and `rows.length`. Readout line `:716` already prints OHLC+pos+equity: wire it into `ChartLive` (`aria-live` off while playing: update the live node only on rest, same moment `seq` is written) |
| S08 IS panel | `ExecuteCandleReplay.tsx:1104` | `svg role=img` + per-bucket `<title>` | Static: keep. Add summary sentence only |
| S09 equity | `ReportDetail.tsx:947-980` | group, keys, +/-, Esc, **no touch** | Replace handlers with hook; add `pointerdown`; add Home/End; tip shows on tap |
| S09 all-time curve + strip | `ReportAllTime.tsx:356-372` | group, `onPointerMove/Down/Leave`, keys | Hook; drop unconditional `onPointerLeave` clear for touch |
| S09 return histogram | `ReportAllTime.tsx:562-572` | group + keys | Hook (no zoom) |
| S09 monthly | `ReportAllTime.tsx:679-686` | one `span tabindex=0 aria-label` per month (12-24 stops) | Strip becomes one region (`label "monthly returns"`, `noun "month"`), months `aria-hidden`; readout = existing `title` text |
| S09 episodes | `ReportAllTime.tsx:767-775` | `tr tabindex=0` + `aria-label` per row (<=5), focus drives `onActive` band highlight | Keep (a table row stop is the right pattern at <=5 rows). Drop duplicated `aria-label` on `tr` (name comes from cells) - fewer words |
| S13 overlay | `CompareDetail.tsx:2169-2208` | group + arrows/Esc + legend toggles `role=button` | Hook for touch pin; legend untouched |
| S13 fold chart | `CompareDetail.tsx:1424-1480` | legend `span tabindex=0` (no role/name beyond text) at `:1449` | `<button type="button" aria-pressed>`, same class |
| S04 ECharts | `EvidenceCharts.tsx:256-282` | group + zoom/pan keys (arrows pan), tap shows tooltip (good) | Hook: arrows move readout (`showTip`), `Shift+Arrow`/`PageUp/Down` pan; label stays `"<what>. Plus and minus zoom, arrow keys pan, 0 resets."` -> `"<what>"` + summary node (words saved) |

### 2.4 Acceptance

Per chart (probe P2/P3 in §4): focus is one Tab stop in and one Tab stop out; `ArrowRight` changes `ChartLive` text to a non-empty string equal to the tooltip string; `Home/End` reach first/last; `Escape` clears; where zoom exists `+` shrinks the visible range and `0` restores it; touch tap leaves a readout visible 600 ms later and a tap outside hides it; with `reducedMotion: "reduce"` no running animation on the chart (`el.getAnimations()` length 0); axe on the page has no `aria-prohibited-attr`, `nested-interactive`, `scrollable-region-focusable`.

## 3. Evidence-cursor consistency

### 3.1 Model decisions (the rules every builder follows)

- The cursor is one hash; `window` moves into it. `window` is an **FE view key**, declared in `evidenceCursor.ts` only (`EvidenceCursor.window: "is"|"oos"|"holdout"|null`, null = reader never chose, written only when named - same rule as today, `evidenceWindow.ts:27-39`). It is stripped from the hash **before** `decodeInspectionCursor` and re-added in `serializeCursor`, so `p02-cursor.v2` (shared with the journey read, `inspectionCursor.ts:30-45`) and the server contract do not change, and `JourneyMap.tsx:417` never sends it. Legacy `?window=` is read once on arrival and rewritten into the hash with `replaceState` (old links keep working).
- Two `withWindow` implementations exist today with different defaults (`evidenceWindow.ts:36` omits null, `executeWindows.ts:34` omits `oos`). Both are deleted; `useEvidenceWindow` and `useExecuteWindow` become thin readers of `cursor.window`. History: a window change pushes one entry (as S08 does today, `executeWindows.ts` push; the hub's replace, `evidenceWindow.ts:73`, is the odd one out), implemented in `useEvidenceCursor.update` next to the existing fold push (`evidenceCursor.ts:338,366`).
- **One link builder**, `research/runScreenHref.ts` (new): `runScreenHref(runId, screen, cursor, over?)`; `screen` in `hub|split|search|freeze|execute|report|release-candidate|progress`. It owns the path table and a keys-by-screen table (§3.2 last column). `deepDiveHref` stays exported (compat) and is re-implemented on it. All builders in §3.2 migrate to it; no component may concatenate `/runs/${id}/...#` itself.
- Keys by destination: stage screens (hub, S05-S08): `stage` (the destination's own), `fold`, `trial`, `params`, `schedule`, `route`, `window`, carried (`study`, `pick`, `mode`, ...); `seq` only to S08 and hub#execute. S09/S11: `fold`, `trial`, `params`, `stage=claim` only (no `window`, no `seq`). Library, Lineage, Compare, Atlas, Journey: no cursor. Lineage takes `?av=`, `?attempt=` and the new `?run=` (select the attempt whose child runs contain it - the progress read strips `attempt_id`, `progressClient.ts:11`, so the run id is what S03/S07/S09/S11 know).

### 3.2 Link builders x cursor fields (current -> required)

Legend: Y carried; N dropped; D hard-coded default; (q) in query, not hash.

| # | Builder | file:line | fold | trial | params | seq | window | attempt | Verdict / change |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `deepDiveHref` / `serializeCursor` | `evidenceCursor.ts:262,275` | Y | Y | Y | Y | N | n/a | add `window`; becomes `runScreenHref` core |
| 2 | `withWindow` (hub) | `evidenceWindow.ts:36` | - | - | - | - | (q) | - | delete |
| 3 | `withWindow` (S08, omits default) | `executeWindows.ts:34` | - | - | - | - | (q) | - | delete |
| 4 | Progress stage chips | `RunProgress.tsx:411,422,540-560` | Y | Y (selection/handoff) | Y | N | N | n/a | keep keys; fix targets (§3.6) |
| 5 | Progress "open evidence flow" | `RunProgress.tsx:2537` | Y | Y | Y | N | N | n/a | OK |
| 6 | Progress hash writer | `useRunProgress.ts:698,713` | writes `#fold=` only | N | N | N | N | n/a | OK (Progress is not a cursor screen) but read back garbage with notice (§3.7) |
| 7 | Hub "reset to θ*" | `evidenceCursor.ts:459`, `EvidenceFlow.tsx:1527` | **D (1)** | **N** | **N** | N | N (kept? currently `?window` kept, hash reset) | n/a | §3.3 |
| 8 | Hub copy link | `EvidenceFlow.tsx:1336` | Y | Y | Y | Y | Y (q) | n/a | single URL incl. window in hash |
| 9 | Hub stage nav + dives | `EvidenceFlow.tsx:1502,3043,3052,3916,4553` | Y | Y | Y | Y | Y (q) | n/a | migrate |
| 10 | Hub per-fold verdict rows | `EvidenceFlow.tsx:2689,2698` | Y (row fold) | Y | Y | Y | Y via `NamedWindowContext` | n/a | context deleted; window in cursor |
| 11 | S05 -> S06/hub/S08 | `SplitDetail.tsx:109,1745,1762,2240,2273` | Y | Y | Y | Y | **N** except `:109` | n/a | `:109` only builder that takes a window; rest drop it -> IS->S05->crumb returns to OOS |
| 12 | S06 -> hub/S05/S07 | `SearchDetail.tsx:2009,2021,2030,2520,2545`; copy link `:1864` | Y | Y (`:1876` sets `trial: null`, rewrites `params`) | Y | Y | **N** | n/a | window carried; copy link keeps its intentional trial/params rewrite |
| 13 | S07 -> hub/S06/S08 | `FreezeDetail.tsx:1649,1663,1673,1892,1923` | Y | Y | Y | Y | **N** | **N** (`:1685` lineage gets `av` only) | window; lineage `?run=` |
| 14 | S08 -> hub/S07/S09/S05 | `ExecuteDetail.tsx:1550,1564,1573,1591` | Y | Y | Y | Y | Y (q) | n/a | migrate; `:1573` -> report carries fold/trial/params only |
| 15 | S08 candle -> split | `ExecuteCandleReplay.tsx:2061` | Y (computed) | **D (null)** | **D (null)** | N | Y (q) | n/a | uses `DEFAULT_CURSOR`; take the arriving cursor and override fold only |
| 16 | S09 -> hub/S08 | `ReportDetail.tsx:493,501`, lineage `:520` | Y (`ReportRoute.tsx:29` reads hash **once**) | Y | Y | Y | N | N (`av` only) | window not carried (Report ignores it; carry for round-trip); `?run=` on lineage |
| 17 | S11 -> hub | `ReleaseCandidateDetail.tsx:526` (`DEFAULT_CURSOR`), `:810` (search pick), `:661` lineage, `:2486` evidence | **D (1)** | N | N | N | N | N | reads no cursor at all: add arrival read (`parseCursor(hash)` once, as `ReportRoute.tsx:29`) and pass it to `hubHref`; no hard-coded fold 1 |
| 18 | S10 Lineage -> run | `LineageDetail.tsx:650,654,1936` | N | N | N | N | N | `?attempt=` read once (`LineageRoute.tsx:20`), mirrored with replace | no cursor by design (cross-run). Add `?run=` read |
| 19 | S13 Compare -> run | `CompareDetail.tsx:605,609` | N | N | N | N | N | `data-attempt` only | no cursor by design |
| 20 | Library -> hub | `RunLibrary.tsx:1782,1813` | N | N | N | N | N | n/a | OK: no hash; hub resolves the hand-off itself (§3.3) so it lands on the same cursor as Progress |
| 21 | Journey -> hub | `JourneyMap.tsx:417,435` | from server cursor | Y | Y | Y | N | n/a | OK |
| 22 | Alpha import / New run -> lineage | `AlphaImport.tsx:720,1484`, `NewRun.tsx:617,3318` | n/a | n/a | n/a | n/a | n/a | `av` | OK |

### 3.3 Reset-to-θ* vs the Progress hand-off

Today: Progress links to fold 9 / trial 351 / params `a74872…` from `claim.handoff_cursor` (`RunProgress.tsx:2535-2537`, picker `:422-444`); the hub's `reset` is `setCursor(seed)` with `seed = DEFAULT_CURSOR` (fold 1, `evidenceCursor.ts:459`); and a hub opened with no hash (Library) also opens on fold 1. Two defaults for one run.
Change:
1. New `research/handoffCursor.ts`: move `evidenceCursor()` (`RunProgress.tsx:422-444`) and its helpers there, export `cursorForHandoff(progress): {fold,trial,params}|null` and `useHandoffCursor(runId)`, which reads `progressApi.read` through the same cache `retainedLane.ts:70` already keeps (`identities` map, key `${workspaceId}|${runId}`), so no new request when Progress or the hub already loaded it. `RunProgress.tsx` imports it.
2. `useEvidenceCursor(defaults, { handoff })` (`evidenceCursor.ts:316`): if the arriving hash names no `fold` and a hand-off exists, seed from it (`replaceState`, no push). If the hand-off arrives after first paint and the reader has not touched the cursor (`touched` ref set by any `update` that is not a mount write), apply it once with replace. If the hash names a fold, the hash wins.
3. `reset()` -> `setCursor({ ...handoffCursor, stage: current.stage, window: current.window })`; with no hand-off (P04: `handoff_cursor` null) it falls back to `seed` as today. Keep the button label `reset to θ*` (3 words); tooltip becomes `fold 9 · trial 351` when a hand-off exists, `fold 1` otherwise; `aria-disabled` when the cursor already equals the target (`EvidenceFlow.tsx:1527`).
4. `EvidenceFlowRoute.tsx:31` passes `handoff`. S05/S06/S07/S08 routes stay on their existing seeds (they are arrived at with a hash from the hub/Progress); no change.
Acceptance: Progress -> hub `#fold=9&trial=351&params=…`; change fold to 3; reset -> same hash as the arrival; Library -> hub with no hash -> URL becomes the hand-off (one `replaceState`, Back leaves the hub).

### 3.4 S06 causal study selector bound to the cursor (0-/1-based)

Measured: R-WFO-027, `search#stage=search&fold=2` -> `[data-study-pick]` = `0:true, 1:false, 2:false`, title `INNER_VALIDATION_OUTER_STUDY · outer fold 0` (header "STUDY 0 · OUTER FOLD 0"), trial `study_2.trial_1`. Hash `fold` is 1-based; `study.fold_id` is the engine's 0-based string ("0","1","2"); `foldLabel()` (`researchFormat.ts:165`) already turns `"0"` into `fold_01`.
Change in `SearchSurface.tsx:696-781` (`StudySurfaces`) and its caller `SearchDetail.tsx:2438`:
1. Drop `useState chosen` (`:714`); add props `foldOrdinal: number` (= `cursor.fold`) and `onFold(n: number)`. `active = studies.find(s => Number(s.fold_id) + 1 === foldOrdinal) ?? studies[0]`. A fold outside `1..studies.length` is clamped by the existing `replaceFold(…, "OUT_OF_RANGE")` (`evidenceCursor.ts` controller, already wired at `SearchRoute.tsx:27`).
2. Button text `foldLabel(study.fold_id)` (`fold_01`), `title` = `study ${study_id} · ${scope}` (engine ids live in the tooltip only). Header label `:726` -> `foldLabel(active.fold_id)`; remove the words "study" and "outer fold" from the visible line (fewer words; the group's `aria-label` stays `"outer fold"`). Replace `aria-pressed` by `aria-current="true"` on the active button (it is a selector of one, not a toggle set).
3. Click -> `onFold(Number(study.fold_id) + 1)` via `update({fold})` (pushes one history entry, as every fold change does). The "pick in another study moves selector" effect (`:718-720`) calls `update({fold}, {replace:true})`.
4. No `study` key is written: it is derivable from `fold`, and a second key could disagree. The codec still carries a foreign `study` verbatim.
Acceptance: `#fold=2` -> `fold_02` active, header `fold_02`, ledger rows of that study; click `fold_03` -> hash `fold=3`, Back -> `fold=2`.

### 3.5 `?window=` -> hash, `seq` on rest, P04 `seq=1`

- `window`: §3.1. Files: `evidenceCursor.ts` (field, parse, serialize, push rule), `evidenceWindow.ts` / `executeWindows.ts` (reduce to readers; `useExecuteWindow` unreadable-value cleanup `executeWindows.ts:42-52` moves into the cursor notice, §3.7), call sites in `EvidenceFlow.tsx` (12 uses), `ExecuteDetail.tsx` (5), `ExecuteCandleReplay.tsx` (2), `ExecuteRoute.tsx` (2). Tests asserting `?window=` (14 files, listed in §4.1) are updated to the hash.
- `seq` on replay rest: `ExecuteRoute.tsx:110-119` derives `restingSeq` only from `controller.replay.equity_replay.items[snapshot.index]` (hub lane), so the retained (WFO) lane never writes. Define `seq` per lane: hub lane = `playback_ordinal + 1` (unchanged); retained lane = `row.source_ordinal + 1` of `retained.replay.rows[snapshot.index]` (the readout already prints "source bar n", `ExecuteCandleReplay.tsx:1335`). Write only when (`!snapshot.playing`) and (the transport has moved since arrival or the arriving hash already named `seq`). Add `moved: boolean` to the `ReplayTransport` snapshot (`replayTransport.ts`), set by `step/seek/setSpeed/toggle`. On arrival with `seq` on the retained lane, after the window loads, seek to the row with that `source_ordinal`; if not in the loaded window, show the cursor notice (§3.7) and drop `seq`.
- P04 `seq=1`: caused by the same effect firing on mount with `snapshot.index = 0`; the `moved` gate removes it. The hub chip text `seq none selected` / `hub-lane-has-no-event-seq` (`EvidenceFlow.tsx:1458-1467`) stays for P04.

### 3.6 Progress chip convention

`RunProgress.tsx:397-409` `stageTarget`: S1 -> `/split`, S2 -> `/search`, S3 -> `/freeze` (deep dives) but S4 -> `/evidence#stage=execute` and S5 -> `/evidence#stage=claim` (hub). Rule: **a chip opens the stage's own screen where one exists, else the hub tab.** S4 -> `/execute` (S08 exists); S5 stays `/evidence#stage=claim` (no S5 deep dive; the report is a separate button). The `aria-label` at `:524` says "open deep dive" for all five: use `Stage N <label>` only (the destination is the title; fewer words). Keys: unchanged (`fold`, `trial`, `params`, plus `stage` for the hub case).

### 3.7 Hand-edited garbage notice

Measured on `/execute` (FLOW_B #14): `fold=99` -> clamped silently to 9; `fold=abc` -> 9; `stage=nope` -> `execute`; `trial=zzz`, `seq=999999` kept verbatim. `ExecuteRoute.tsx` renders no notice at all (only Hub, S05, S06, S07 do: `RouteCursorNotice` in `EvidenceFlowRoute`, `SplitRoute`, `SearchRoute`, `FreezeRoute`), and Progress ignores a bad `#fold=` silently (`useRunProgress.ts:197`).
Change:
1. `evidenceCursor.ts:180-222` `readHash`: a `trial`/`seq` that is a valid identifier but not a positive integer (`:200-203` carries it today) adds `CURSOR_VALUE_UNREADABLE` for that key (code exists, `inspectionCursor.ts`, used only for `fold`) and **does not carry it**. Add two notes to `CursorNote` (`evidenceCursor.ts:94`): `CURSOR_TRIAL_NOT_FOUND {value}` (hub/S06 when the published trial list lacks it) and `CURSOR_SEQ_OUT_OF_RANGE {from,to}` (S08, against the loaded window).
2. Notice copy (shortened, `cursorNoteText`/`cursorProblemText`): `Link value ignored: trial “zzz”.` / `Link value ignored: bar 999999 (last 1,488).` / existing fold text shortened to `Fold 99 not in this run; fold 9 shown.` Same `role="status"` panel (`CursorNotice.tsx`), no new component.
3. After the notice is computed the offending keys are removed from the address with `replaceState`, so "copy link" does not re-share the garbage (hash is rewritten by the mount effect, `evidenceCursor.ts:341-348`, once `readHash` stops carrying them).
4. Render `RouteCursorNotice` in `ExecuteRoute.tsx` (return value at `:133`), `ReportRoute.tsx`, `RunProgressRoute.tsx` (fold only).

## 4. Test plan and Playwright probes

### 4.1 Vitest (jsdom), new and changed

New: `chartContract.test.tsx` (keys, Home/End, Esc, zoom ratios via `zoomWindow`, touch pin/unpin with `pointerType: "touch"`, outside-tap dismiss, live node only updates on key/tap, reduced motion = no WAAPI when `matchMedia(reduce)` and when `navigator.webdriver` stubbed false), `runScreenHref.test.ts` (table-driven: every row of §3.2 -> exact hash; window in hash; seq only to S08/hub#execute; Report/RC carry fold/trial/params only), `handoffCursor.test.tsx` (seed, async arrival, touched guard, reset target, P04 fallback), `cursorNotice.garbage.test.tsx` (the four garbage inputs, key stripped from hash), `studySelector.cursor.test.tsx` (0/1-based mapping, click writes fold, Back), `replaySeq.test.tsx` (retained-lane rest writes `seq=source_ordinal+1`, P04 mount writes none, `moved` gate), `tokens.test.ts` additions (ramp order + 4.5 floor for `research` and `operations`).
Changed (key on `aria-selected`, hash window, new link shape, one tab stop): `compareDetail.test.tsx`, `compareChartLife.test.tsx`, `evidenceCharts.test.tsx`, `searchSurface.b9.test.tsx`, `searchStageB.e5.test.tsx`, `executeCandleReplay.test.tsx`, `executePlayAcrossFolds.test.tsx`, `executeQaS08.test.tsx`, `executeMarkers.test.tsx`, `evidenceFlow.test.tsx`, `evidenceFlow.f2b.test.tsx`, `evidenceFlow.ea.test.tsx`, `evidenceCursor.qa04.test.tsx`, `splitDetail.test.tsx`, `searchDetail.test.tsx`, `freezeDetail.test.tsx`, `composition.test.tsx`, `w4.test.tsx`, `runLibrary.f4.test.tsx`, Progress chip tests (`stageTarget`), `declarationEstimate.test.tsx` (window text). 14 of these assert `?window=` today.

### 4.2 Playwright probes (lane: `playwright.research-preview.config.ts`, real API on `:8095`; stub lane `e2e/research-qualification/` for deterministic CI). New spec `e2e/research-w5.spec.ts`, helper reuse `e2e/axeReceipt.ts` (`analyze`, `recordRow`).

| Probe | Steps | Assert |
|---|---|---|
| P1 axe matrix | `spec-w5/axe.mjs` loop (S00-S14 + S04 404; 023 and 027; 1440/390; research/operations) | 0 critical, 0 serious; moderate only in an allow-list that must be empty after W5; receipt row per cell |
| P2 chart keyboard | per chart in §2.3: `locator.focus()`; `ArrowRight`; `Home`; `End`; `Escape`; `+`,`0` where zoom exists | live node text non-empty and equal to tooltip/readout text; Tab leaves in one press (count `tabindex=0` inside the region = 0); S06 page tab stops < 120 (was 717); S07 < 80 (was 130) |
| P3 touch | `hasTouch` context 390x844: tap S06 scatter / histogram / pool plane, S08 candle, S09 equity / all-time / hist / month, S13 overlay | readout visible after 600 ms; tap on body hides it; page did not horizontally scroll |
| P4 reduced motion | `emulateMedia({reducedMotion:"reduce"})`, load S06/S08/S09 | `document.getAnimations().length === 0` on the chart subtree after 1.5 s; no `.s08-chart-in` animation |
| P5 window in hash | (as built) S08 choose IS (`[data-window-switch] [data-window=is]`; the hub has no window switch) -> back-to-hub -> S2 Search tab -> S6 -> back-to-hub -> S4 tab -> S8 -> `data-next=run-report` -> Report -> its `back-to-hub` | every URL has `window=is` in the hash (none in `search`), `Back` x3 / `Forward` x1 restore, copy link in a fresh page restores window+fold+trial |
| P6 hand-off | Progress (R-WFO-023) -> "open evidence flow"; pick fold 3; reset | URL equals arrival hash; Library -> hub (no hash) -> URL = hand-off; R-P04-022 observes ONE fold: `fold-next` is disabled and `reset-cursor` is `aria-disabled` at arrival, so the probe asserts it is inert and the fold stays 1 (the fold-3 premise cannot be exercised on that run) |
| P7 causal study | R-WFO-027 `search#stage=search&fold=2`; click `fold_03`; Back | active `fold_02`, then `fold_03` with `fold=3`, then `fold_02` |
| P8 seq | R-WFO-023 S08: step 5 bars, wait for rest | URL gains `seq`; fresh page on that URL shows the same bar (retained lane waits for the fold window, arrival is not consumed by a hub answer whose route is `NOT_PUBLISHED`); R-P04-022 S08 fresh load -> no `seq` key (P04 has two enabled step-forward transports — stitched equity sample and OOS observation — so "step controls absent" was a wrong guess; the assertion is that transports are present and nothing is written) |
| P9 garbage | `#trial=zzz&seq=999999&fold=abc&stage=nope` on hub, S06, S08, Progress (`#fold=abc`); rule chosen: `seq` only has meaning on stage `execute`, anywhere else it is dropped with a notice | `[data-cursor-notice]` visible; keys stripped from the address; page still renders |
| P10 Progress chips | Progress hrefs S1-S5 | `/split`, `/search`, `/freeze`, `/execute`, `/evidence#…stage=claim`; each keeps `fold/trial/params` |

Gate to close W5: P1-P10 green; `npm test` (vitest) green; `./scripts/portal-web-visual.sh` (pinned image) run **after** the token commit and re-recorded by Bobby (memory: `--update` is classifier-denied for Claude; the token step is its own commit); `verify-workspace` per the standing hook.

## 5. Size and split

Estimated (LOC = lines added + changed): new `chartContract.tsx` 260, `runScreenHref.ts` 90, `handoffCursor.ts` 110, hook edits in `evidenceCursor.ts` 140, chart edits S04/S06/S08/S09/S13 ~700, axe fixes ~120, cursor link migration ~260, S06 study 70, seq/transport 90, notices 80, tokens/shell 40, tests ~1,300 (vitest) + ~420 (Playwright). Total ~3,600 LOC across ~40 files; 2 agent waves, ~6-8 agent-hours, plus 1 integration pass and the Bobby-run visual re-baseline.

Order: **Wave 0** (one agent, serial, ~1 h): A and E-API merge first because everyone imports them. **Wave 1** (parallel, disjoint files): B, C, D, F, G. **Integration**: lead merges, runs the hook, deploys, re-runs `spec-w5/axe.mjs` and the probes.

| Agent | Files owned (disjoint; nobody else edits them) | Work | Depends on |
|---|---|---|---|
| **A · contract + S04** | `research/chartContract.tsx` (new), `chartLife.ts`, `compareChartLife.tsx`, `EvidenceCharts.tsx`, tests `chartContract.test.tsx`, `compareChartLife.test.tsx`, `evidenceCharts.test.tsx` | §2.1-2.2, S04 row | - |
| **E · cursor core + hub** | `evidenceCursor.ts`, `evidenceWindow.ts`, `inspectionCursor.ts` (comment only), `runScreenHref.ts` (new), `handoffCursor.ts` (new), `CursorNotice.tsx`, `EvidenceFlow.tsx`, `EvidenceFlowRoute.tsx`, `hubStage*.tsx` if they import `withWindow`, tests `runScreenHref.test.ts`, `handoffCursor.test.tsx`, `cursorNotice.garbage.test.tsx`, `evidenceFlow*.test.tsx`, `evidenceCursor.qa04.test.tsx` | §3.1, 3.3, 3.5 (window), 3.7, S04 h1 + 404 `main` (rows 12, 13), S04 PASS chip (row 9), `landmark-unique` on hub | - (A and E do not share files) |
| **B · S06** | `SearchSurface.tsx`, `SearchStageB.tsx`, `SearchDetail.tsx`, `SearchRoute.tsx`, tests `searchSurface.b9.test.tsx`, `searchStageB.e5.test.tsx`, `searchDetail.test.tsx`, new `studySelector.cursor.test.tsx` | rows 3, 4, 10; §2.3 S06 rows; §3.4; migrate own links to `runScreenHref` + window (row 12) | A, E |
| **C · S08** | `ExecuteCandleReplay.tsx`, `ExecuteDetail.tsx`, `ExecuteRoute.tsx`, `replayTransport.ts`, `useReplay.ts`, `executeWindows.ts`, tests `executeCandleReplay.test.tsx`, `executePlayAcrossFolds.test.tsx`, `executeQaS08.test.tsx`, `executeMarkers.test.tsx`, new `replaySeq.test.tsx` | §2.3 S08 rows (scoped transport keys), §3.5 seq + P04, window reader, link rows 14-15, notice in `ExecuteRoute` | A, E |
| **D · S09 + S13** | `ReportDetail.tsx`, `ReportAllTime.tsx`, `ReportRoute.tsx`, `CompareDetail.tsx`, tests `compareDetail.test.tsx`, report tests | rows 1, 2, 13 (S09, S13 h1); §2.3 S09/S13 rows; link row 16 | A, E |
| **F · other screens** | `SplitDetail.tsx`, `FreezeDetail.tsx`, `WhatIfCard.tsx`, `RunProgress.tsx`, `useRunProgress.ts`, `RunProgressRoute.tsx`, `ReleaseCandidateDetail.tsx`, `LineageDetail.tsx`, `LineageRoute.tsx`, `lineageClient.ts`, `RunLibrary.tsx`, `NewRun.tsx`, tests `splitDetail.test.tsx`, `freezeDetail.test.tsx`, progress/RC/lineage tests | rows 5-8, 13 (S10, S11), 14, 15; links 11, 13, 17, 18; §3.6 chips; garbage notice on Progress | E |
| **G · tokens + shell + gate** | `styles/tokens.css`, `styles/tokens.ts`, `styles/tokens.test.ts`, `styles/shell.css`, `app/TopBar.tsx`, `e2e/axeReceipt.ts`, `e2e/research-w5.spec.ts` (new) | §1.2 (own commit, flagged for Bobby's baseline step), row 11, probes P1-P10 | none (token commit waits for Bobby) |

Disjointness check: the only cross-file coupling is the API of A (`useChartContract`, `ChartLive`, `ChartSummary`) and E (`runScreenHref`, `useHandoffCursor`, `EvidenceCursor.window`); both are fixed in §2.2 / §3.1-3.3 above so B-F can code against the signatures before A/E merge (stub export, same names).

## 6. Decisions needed from Bobby (only these)

1. D-B1 token step: `--ink-faint` light `#939db0` -> `#5f6b80`, `--ink-mute` light `#68738a` -> `#566278`, dark `--ink-faint` `#738095` -> `#8a98ac` (numbers in §1.2). Changes every baseline; ship as its own commit and you run the recorder.
2. `window` into the hash and removal of the `?window=` query (old links keep working through a one-time rewrite).
3. Scoping the S08 Space/Arrow transport keys to the stitched-replay section instead of the whole page (stops Space scrolling/toggling from anywhere on the page).
4. In-page breadcrumb nav on S01/S05-S08/S10-S14: remove (TopBar already prints the path) or rename to `Run path`.
