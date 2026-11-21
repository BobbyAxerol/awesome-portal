# CROSS audit — Research S00–S14 (2026-10-02, base b965741e, live preview :8095)

Screens/evidence: `/home/bobby/portal-research-qa-2026-10-02/audit-final/CROSS/` (sweep.json, copy.json, vis.json, perf.json, kb.json, *.png, montage-*.png).
Runs used: R-WFO-023 (`rrun_3d56…`) for every run-scoped screen; alpha `delta-rsi-polynomial-alpha` for S10/S13. R-WFO-027 not separately walked (same templates; only S01 card seen). Nothing mutated.

## 1. Coverage
- Done: axe (wcag2a/aa/21aa + best-practice, @axe-core/playwright present) on all 15 screens in Research Light and Operations Dark (full page, then main-content-only); keyboard walk shell + S01/S02/S04/S08/S09; 390 and 360 sweeps of all screens; touch tap on S04/S08/S09/S06 charts; rendered-text copy scan of all 15 screens; computed-style type/chip/radius census; PIL montages; load timing + CLS with and without +500 ms API latency; titles/breadcrumbs/prev-next links; cursor Back/Forward chain S04→S05→S06→S07→S08→S09.
- Not done: failed/cancelled/denied/not-found states (other groups); R-WFO-027 screens individually; screen-reader pass (only aria inspected); Esc inside every popover (only palette, mobile drawer tested).

## 2. Flow tables

### Keyboard (desktop 1440)
| step | action | result | verdict | evidence |
|---|---|---|---|---|
| 1 | Tab from load | first stop "Skip to content"; Enter moves focus to `main` (tabindex -1) on S01/02/04/08/09 | OK | kb.json |
| 2 | Tab order | shell = 31-32 stops before first main control; skip link is the mitigation | UX P3 | kb.json |
| 3 | Focus ring | every one of ~430 stops sampled has outline/shadow (0 without ring) | OK | kb-S04-chart-focus.png |
| 4 | Roving tabs S04 evidence tablist | tabindex 0/-1, ArrowRight/End/Home move+select | OK | |
| 5 | Chart keyboard S04 | group tabindex=0, aria-label says "+/- zoom, arrows pan, 0 resets"; works, Reset zoom button appears | OK | kb-S04-chart-pan.png |
| 6 | Chart keyboard S08 (candles), S09 (equity svg), S06 scatter | S08 container has no role/label/tabindex; S09 svg role=img only (no focus, no title/desc, hover-only tooltip); keyboard users cannot read values | ISSUE | |
| 7 | Ctrl+K palette, Esc | opens `role=dialog`, Esc closes, focus returns to body (not to the Search button) | ISSUE P3 | kb-search-palette.png |
| 8 | Mobile nav drawer | focus stays on "Open navigation"; Tab leaves the drawer into page behind scrim; no visible close button; Esc closes | ISSUE P2 | kb-mobile-nav-open.png |
| 9 | Trap check | S02 ends on BODY after 37 tabs; no trap found on any walked screen | OK | |

### Cursor / Back (S04 `#fold=5&trial=351`)
| step | action | URL after | fwd | back | cursor kept | verdict |
|---|---|---|---|---|---|---|
| 1 | S04 → "S1 split" | split#stage=split&fold=5&trial=351 | yes | yes | yes | OK |
| 2 | next S2 / S3 / S4 | search/freeze/execute, fold+trial kept | yes | yes | yes | OK |
| 3 | next Run Report | report#stage=execute&fold=5&trial=351 | yes | yes | stage=execute is stale on the report | ISSUE P3 |
| 4 | browser Back x3 / Forward | execute, freeze, search, freeze — exact | | | yes | OK |
| 5 | S09 "← Hub · Stage 5 Claim" | evidence#stage=claim&fold=5 (trial dropped) | | | partial | ISSUE P3 |
| 6 | S11 → "Evidence Flow" (fresh load) | evidence#stage=claim&fold=1 | | | n/a (default) | note: S03 hand-off defaults fold=9/trial=351, every other screen defaults fold=1 |

### Mobile 390 / 360
| screen | h-scroll 390 | h-scroll 360 | notes |
|---|---|---|---|
| all but S03@360 | none | none | |
| S03 | none | **363 > 360** (3 px) | BUG P2, `div[role=log]`/header row |
| S04 | none | none | tables 476/485 px wide are NOT in a scroll wrapper (rows 968/64) but page does not scroll → content clipped (sr-only table is fine; the 64-row one is visible) — verify |
| S05 | none | none | table min-w-760 sits in its own scroller: OK |
| S08, S09, S13 | none | none | tables scroll inside own region: OK |
| S13 | | | sticky `TH` 32 px wide inside 1764 px table: OK but see §4 |

## 3. Findings (sorted by severity)

### P1
1. **UX/A11Y mobile – sticky chrome eats 16-37 % of the viewport.** Top bar is `position:sticky` 129 px (S03-S09, S11) or 153 px (S00-S02, S10, S12-S14) at 390 wide = 16-19 % of 800 px; it wraps into 3 rows (brand/breadcrumb, Search+Theme, Density+"Planned modules"). On S04 the Evidence Cursor card is a second sticky (214 px at 390; 165 px visible under the bar) → ~300 px of 800 px permanently covered, and it overlays content as it scrolls (`mob-S04-scrolled.png`, `touch-S04eq-after.png`). Better: topbar non-sticky on <640 px (or one row: hamburger + title + overflow menu), move Theme/Density/"Planned modules" into the drawer; cursor card collapsible, sticky only as a 36 px chip row.
2. **A11Y/BUG – S13 mode switch `aria-pressed` on non-button role** (axe aria-allowed-attr, critical, 3 nodes: `button[data-mode-option]`), and **S13 link-in-text-block 1.67:1 light / 1.31:1 dark** (`.foot a[data-action=open-lineage]`). File: CompareDetail (search `data-mode-option`).
3. **A11Y – S06 135 `span[aria-label]` without role** (aria-prohibited-attr; `span[aria-label="rvol 1 … 1.125: 298 trials"]`) — the histogram bars announce nothing and axe flags all 135. Give the strip `role="img"` with one label or `role="list"/listitem`.
4. **UX – charts not touch/keyboard-complete.** S09 equity svg: hover works on desktop (`hover-S09-equity.png`), tap shows nothing (`touch-S09-after.png`), no tabindex, no `<title>/<desc>`. S08 candle chart: no role/label/tabindex; readout only on mouse; S04 is the only chart with keyboard + touch (tap shows tooltip, good). Rubric 7/8.
5. **Layout shift when data arrives (CLS, normal latency):** S05 0.79, S09 0.69, S04 0.45, S11 0.37, S08 0.33, S06 0.16, S03 0.11 (poor ≥0.25). Cause: content placeholder is a few lines, then the full page (S09 239→51,920 chars in one frame; S05 3 stages of growth). Reserve the hero/section heights or render section skeletons. perf.json.

### P2
6. **TEXT/DATA – three renderings of the same server value.** `walk_forward_oos` / `not_causal_multi_fold_global_calibration` appear as `walk forward oos` (S04,S08,S09), `walk_forward_oos` (S03,S11), `WALK_FORWARD_OOS` + "QUANTBT" source chip (S06), `NOT_CAUSAL_MULTI_FOLD_GLOBAL_CALIBRATION` (S06, S13 x22 `WALK_FORWARD_OOS_COMPATIBILITY`). Pick one display form (humanised sentence-case via one util) and drop the repeated "QUANTBT" suffix chips.
7. **TEXT – raw reason codes shown as the reason** (rubric 1: "server's reason" but unreadable): S08 `QUANTBT_ROUTE_EMITTED_NO_ORDER_RECORDS` ×3, `QUANTBT_CLOSE_TARGET_ROUTE_PUBLISHES_TRANSITIONS_NOT_AN_EVENT_TAPE`, S09 `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS`, S05 `QUANTBT_SCHEDULE_HAS_NO_NESTED_INNER_VALIDATION`, S06 `QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_POOL_FREEZE_CLOCK`, S10 `P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK`, S11 `P22_NO_PUBLISHED_PREDECESSOR`, S13 `P20_P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_OOS_SHARPE` ×34 (li), S09 certification box `P18_NO_SOURCE_PUBLISHES_A_CERTIFICATION_GRADE` clipped to `P18_NO_SOURCE_PUBLISHES_A_` (`montage-not-published.png` S09). Show a one-line sentence ("Source did not publish audited fills") and keep the code in a `title`/copy-on-click.
8. **TEXT – "not published" without/with different form, 108× on S01 and 108× on S06.** S01: every card prints "rc — not published", "Δ DECAY not published", "OOS FOLD TRADES not published" (also "PROGRESS pending source" ×3 on queued cards). S06: one per trial row. Collapse: one footer per list ("rc: none published for 49 runs") or hide the field. Styles differ on every screen (italic plain S01/S03/S04; dashed box S06/S10/S11; bold S10/S11; amber frame S09; "cert not published" chip S10/S13) — `montage-not-published.png`. Certification absence is rendered 7 times across screens in 5 styles.
9. **TEXT – S02 repeats "NO VERSION CHOSEN" 3×, "not declared" ×6, "not visited" ×7** in a screen that is mostly empty (`S02-desktop-research.png`); step labels say "not visited" for every step. Delete the review rail until a version is bound, or show one line "Pick an alpha version to start".
10. **DATA/UX – S08 visible raw float** `pos 0.03386197520287556` in the candle readout (and `0.03386197520287556` ×309 + `…Z` ISO in the sr-only table; S04 sr-only table 968 rows of 20-digit floats, S09 sr-only 859 rows, all announced by screen readers). Format server value once (e.g. `+3.39 %`), keep full precision in `title`. File: ExecuteCandleReplay readout.
11. **A11Y contrast.** Main-content only: S05 16 nodes (`button[data-theta-lane]`, 2.52:1 light / 3.76:1 dark), S04 1 node (PASS chip, 4.4:1), S06 dark 3.77:1. Shell (every screen): `kbd` ⌘K 2.59:1 and nav-group labels 2.59:1 (#939db0 on #faf9f5) in light; dark nav labels/maturity badges 4.18:1 (#738095 on #161e2a). 
12. **A11Y – S07 nested-interactive** (`.grid-cols-9`: a role-button/group containing focusable descendants); **S03 scrollable-region-focusable** (`div[role=log]` has no tabindex → keyboard users cannot scroll the log); S07 at 390 also `ol` scroller.
13. **A11Y/UX – no page heading on the Hub:** S04 has no h1/h2 (first heading is "PER-FOLD VERDICT" h3) and no visible title; S09/S10/S11/S13 use h2 as the page title (0 h1). S09 serif title is 27 px while other titles are 22 px.
14. **UX – S03 3 px horizontal overflow at 360.**
15. **UX – mobile tap targets <40 px on primary actions (390):** shell: hamburger/collapse 28×28, Search 118×28, Theme/Density selects 24 px high, "Planned modules" checkbox 13×13; S01 `+ NEW RUN · PREFLIGHT FIRST` 238×28, filter input 24, "OPEN EVIDENCE →" 13 px high, "attempt lineage →"/"journey map ↗" 13 px; S02 "← Run Library" 68×12, "Import a version" 12 px; S03/S05-S08 "next: … →" / "← S1 Split" links 13 px high (the main way to move between stages!), "COPY EVIDENCE LINK" 21 px; S09 links 18 px, Export buttons ~26; S10 "rc & publish →", "compare →" 15 px; S11 "RUN REPORT"/"LINEAGE" 27 px; S13 mode buttons 26 px; S14 "next: New Run →" 13 px. Count of <40 px interactive elements at 390: S01 362, S06 442, S04 58, S05 47, S07 109, S08 83, S13 110 (many are table/trial rows). Make prev/next a 44 px-high bar on <640 px.
16. **UX – Drawer (mobile):** no close affordance, focus not moved/trapped (see §2).

### P3
17. **TEXT/UX – date/time formats (5 shapes).** `2026-10-02 17:02Z` (S01, S09 sealed, S11, S13), `2026-10-01 13:43 UTC` (S03, S06, S07), `2026-10-01T…Z` ISO (S07 `2026-06-01T00:00:00Z`; S08 table `…000Z`; S04 sr-only), `2026-07-01 03:00Z` (chart tooltips), bare `2026-10-01` (S05/S08/S09 table). Choose `YYYY-MM-DD HH:mm UTC` everywhere, date-only when time is 00:00.
18. **TEXT – number formats.** Sharpe `4.34` (S04) vs `4.337` (S09) vs `4.14` fold-mean; `2208 retained model observations` (S09) vs `2,208` elsewhere; IS Sharpe `=-0.304` in S03 log (hyphen-minus, 3 dp) vs `−0.54` U+2212 elsewhere; J shown `-0.537`/`−0.54`. Minus is U+2212 in all visible UI except S03 log lines and sr-only tables.
19. **TEXT – double punctuation/odd text.** S14: `drop one .py file`, `choose or drop a .py file`, `one .py — contract + code` (leading " ." reads as stray punctuation; use "a Python file"); S00 card: `binds alpha · av_ (or scratch = NOT_PUBLISHABLE)` raw enum in marketing copy; `… .py contract, 7 fail-closed gates, DRAFT→ACTIVE registry — feeds`. S04 `HOLDOUT_STATE n/a` (S09 says `not applicable` + code, S04 says `n/a`, S08 "not applicable") — three words for one absence; "n/a" is the forbidden form.
20. **TEXT – hard-coded/redundant words per screen.** S01 header: `attempt lineage → · journey map ↗` (two lower-case links of unrelated type next to the primary CTA); CTA text "+ NEW RUN · PREFLIGHT FIRST" (7 words, uppercase). S01 filter strip: `49 of 49 runs` + `49 runs · 25 completed · 21 failed · 1 queued · 2 cancelled` + claim ledger `49 runs · 0 issued · 25 not issued · …` (3 summaries of the same count). S04 cursor row: chips `seq none selected`, `schedule global`, `window OOS`, `trial #351 · global`, `params a7487281` + link row `↗ S1 split S2 search S3 freeze S4 replay report promotion runs journey ↗` duplicating the tab strip right above it. S04 Stage-5 card repeats "NOT_ISSUED" (card, tab sub-line `claim NOT_ISSUED`, S01 chip on every run). S06 "executed · retained search contract", S08 chips `signal bar close`, `fill same close @ close`, `accounting certified by QuantBT`, `readiness ready` (tautology). Shell: `Planned modules` checkbox + `SOON` badge on 17 nav rows + `PROTOTYPE` badges.
21. **UX – button/link vocabulary.** Forward: `next: Evidence Flow →` (S03), `next: S2 Search →`, `next: S3 Freeze →`, `next: S4 Execute →`, `next: Run Report →` (S08), `Release Candidate & Publish →` (S09, no "next:"), `rc & publish →` (S10), `RUN REPORT` (S11), `OPEN EVIDENCE →` / `WATCH PROGRESS →` / `OPEN PROGRESS →` (S01), `OPEN EVIDENCE FLOW →` (S03), `DECLARE →`, `RUNS IN MODE →` (S12). Copy: `COPY EVIDENCE LINK`, `copy θ* digest`, `copy yaml`, `Copy` icon. Create: `+ NEW RUN · PREFLIGHT FIRST`, `New Run →`, `new run →`, `PROPOSE NEW ATTEMPT →`, `create sibling attempt →`. Casing: UPPER (S01 CTA, S07 PROPOSE…) vs Title vs lower (S10). Names: "Evidence Flow" (crumb) / "Hub · Stage 5 Claim" (S09) / "Summary" (topbar). "Stage 1" vs "S1" vs "S1 SPLIT". Stage titles: S05 "Split — how time was divided", S06 "Search & Selection", S07 "S3 · Freeze — ordering & integrity", S08 "S4 · Execute Replay" (S3/S4 have the numeric prefix, S1/S2 do not).
22. **UX – Document titles inconsistent.** `QuantBT — Journey Map` (S00,S01,S02,S10,S12,S13,S14 pattern A) vs `QuantBT Evidence Flow — R-WFO-023`, `QuantBT Stage 1 — Split & Windows — R-WFO-023` (no dash after QuantBT; S04-S08) vs `Backtest Evidence Report — R-WFO-023` (S09, no product) vs `QuantBT — Run Progress — R-WFO-023` (S03) vs `QuantBT — Release Candidate & Publish — R-WFO-023` (S11). S10 `QuantBT — Attempt Lineage` and S13 `QuantBT — Compare` do not name the alpha (the on-page h2 does). Use `<Screen> · <R-label|alpha> · QuantBT`.
23. **UX – breadcrumb/header chrome has 5 variants** (`montage-headers.png`): `Runs / R-WFO-023 / Progress · next …` (S03); chip-header no title (S04); `Evidence Flow / R-WFO-023 / Stage N · X · ← prev · next: …` over a 22 px serif h1 (S05-S08); button/link bar `← Hub · Stage 5 Claim · ← Execute replay · Release Candidate & Publish → · Attempt lineage / Run Report` + Print/Export buttons (S09); `Runs / Attempt Lineage — …` (S10, S13); `Evidence Flow / R-WFO-023 / Release Candidate & Publish` (S11); `Journey Map / Engine Atlas` (S12); `Journey / Alpha Import · next: New Run →` (S14). Top-bar shell breadcrumb duplicates the in-page one on every screen ("Research / QuantBT Backtest / R-WFO-023 / Stage 2 · Search" directly above "Evidence Flow / R-WFO-023 / Stage 2 · Search & Selection"). Back to Run Library is a crumb on S03/S10/S13 but a ↗ link on S08 and missing on S04/S09/S11. S03 has no "previous"; S04 hub has no "← Progress" and no "next" except tab strip; S09 has no Run Library link.
24. **UX – flash of raw id:** breadcrumb/title show `rrun_3d5633d2` for ~0.4-0.5 s on S04-S07, S10, S11 before it flips to `R-WFO-023` (perf.json, delay-500 sequences). Show "Run" or a skeleton until the label arrives.
25. **UX – loading vocabulary.** First paint is plain text "Loading module…" (15 chars) on every route; then per-screen mix of spinner (S00,S03,S06-S13), "reading…" inline (S04), skeleton (S01), nothing (S02, S05 progressive in 3 steps). Pick skeletons shaped like the final layout (also fixes CLS).
26. **HIFI/visual – type scale.** Visible body text sizes in use: 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 17, 22, 27 px (`vis.json`). 85-92 % of characters are ≤10.5 px on S01/S03/S06/S08/S12/S13 (S01: 15,362 of 17,000 chars ≤10 px). Mono (JetBrains) carries 80-98 % of text nodes on S03/S06/S08/S12/S13. Half-pixel sizes are unnecessary variants of the same role; collapse to 10/11/12/14/22.
27. **HIFI/visual – card chrome / chips.** Card radius 8 px on S01/S07/S08/S10/S11/S13 but 6 px on S04 (24 cards), S09 (22) and S12 partial; 10 px on S07; "0 0 6 6" joins on S04/S06. Chip height 16/17/18/19/20/21 px with font 8.5-11 px and radius 999/9999 (S01 17 px/10 px; S03 16-18; S10 16-19; S14 17/20). Verdict chips: S04 outlined PASS pill, S08 rectangular "orders/fills" chips, S11 `SEALED` filled green, S01 `COMPLETED` filled green; "claim" chips: S04 plain text, S06 amber frame, S07 outlined box, S09 amber panel.
28. **Arrow/icon usage.** `→` forward, `←` back, `↗` external/cross-screen (S04, S08 "Split ↗", "Run Library ↗" are same-app links), `▸/▾` toggles, `⚠` (S07), `◈ ◫` glyph tabs, `⇄` fold separators, `●`/`○` status; mixed in the same header (S08 `← S3 Freeze · next: Run Report →`, then `Split ↗ Run Library ↗`).
29. **S09 mobile:** x-axis tick labels collide (`2026062026-07-012026-08…`), +/- zoom buttons overlap legend (`touch-S09-after.png`).
30. **S08 readout overlap:** date label overlaps a "last bars" caption at the left edge of the readout strip (`hover-S08-candles.png`).
31. **Dark theme:** primary line of S04 equity chart (dark teal on navy) and axis labels have low luminance contrast (`dark-S04.png`); verify with token swap (series colour should lighten in dark).
32. **Focus after Esc:** palette closes to BODY rather than to the trigger.

## 4. Visual-consistency proof
- `montage-headers.png` – 12 screen headers stacked: 5 chrome variants, 3 title treatments.
- `montage-not-published.png` – 13 screens' first "not published": 8 styles.
- `montage-copy-buttons.png` – COPY EVIDENCE LINK vs copy θ* digest vs copy yaml.
- `vis.json` – per-screen font-size census, card radii, chip geometry.

## 5. Performance feel (desktop, local API; +500 ms API in brackets)
Time to first meaningful content (main text >60 chars): 124-498 ms on all 15 (first main frame 1.1-1.3 s with delay). Network idle 0.65-2.3 s (S06 2.3 s, S04 1.6 s, S05 1.6 s). Full-data frame: S09 455 ms, S06 845 ms, S08 1153 ms, S04 962 ms. No flash of a wrong *state* (empty/failed) observed; the only wrong-looking frame is the raw run id in crumbs (#24) and S08/S05 partial progressive fills.

## 6. Genuinely good
- Skip link + `main` focus, 100 % focus rings, roving tabs on the hub, S04 chart keyboard/touch/reset-zoom.
- Evidence cursor survives 5 stage hops and 3 Backs/1 Forward exactly.
- No page-level horizontal scroll at 390 on any screen; wide tables (S05, S08, S09, S13) scroll in their own region.
- Typed absences carry a reason on most screens; U+2212 minus is used consistently in visible UI.

## 7. Top-10 changes for overall UX
1. Mobile shell: one-row, non-sticky (or 48 px) top bar; move Theme/Density/Planned modules into drawer; make the S04 cursor card collapsible (#1, #15, #16).
2. One header component for S03-S14: crumb + h1 + `← prev · next →` (44 px on mobile) + one copy-link icon; remove the duplicate topbar breadcrumb; add h1 to S04/S09-S13 (#13, #21, #22, #23).
3. One "absence" component: sentence from the server reason (code in tooltip), one style, collapsed on lists (S01 ×108, S06 ×108) (#7, #8, #9, #19).
4. One value formatter: humanised enum (#6), `YYYY-MM-DD HH:mm UTC`, 2/3-dp rules, U+2212, no raw floats (S08 readout, sr-only tables → format + `title` full) (#10, #17, #18).
5. Skeletons that reserve final heights; kill raw-id crumb flash (CLS 0.79/0.69/0.45) (#5, #24, #25).
6. Charts: S08/S09/S06 get role/label/tabindex, keyboard stepping and tap-to-show tooltip like S04 (#4, #29, #30).
7. Fix axe criticals: S13 aria-pressed + link contrast, S06 135 aria-label spans, S07 nested-interactive, S03 log focusable, S05 theta-lane contrast, shell kbd/nav-label contrast (#2, #3, #11, #12).
8. Collapse type scale to ≤6 sizes (min 11 px on mobile) and unify radius 8 / chip 18 px (#26, #27).
9. Trim redundant text: S01 triple summary, S04 cursor chips + duplicate stage links, S02 "NO VERSION CHOSEN/not declared", S08 tautology chips, S14 copy (#9, #19, #20).
10. Drawer a11y + Esc focus return + 44 px tap targets for prev/next, primary CTAs, and filter chips (#15, #16, #32).
