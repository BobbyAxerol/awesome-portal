# Execution V2 layout-quality audit, 2026-10-23

Lane: FIXTURE_LAB (fixture BFF, `FIXTURE_REVIEW_PROFILE=populated`). Not acceptance evidence: it shows how screens look with data of this shape.

## Method

`node scripts/layout-audit.mjs --build` (the header comment lists every option). It builds this checkout (vite, V2 manifest with 19 screen keys) and the fixture BFF, serves both from a throwaway node server on free ports (no docker, nothing on 8095), and visits 24 routes x 5 widths (1440, 1280, 1024, 660, 390) in one chromium. Per route and width it records:

1. page overflow: max(documentElement, main) scrollWidth - clientWidth.
2. clipping: elements with overflow hidden/auto/scroll whose content is wider than the box (scrolling containers are listed as intended `scroll`, e.g. `.exec-cards-wrap`; hidden or ellipsis without a title is "clipped"), plus `spills-out-of-box` (visible overflow wider than the box by more than 5px) and `escapes-viewport`. 1px visually-hidden (sr-only) boxes are excluded; the journey-spine chevron (a `::after` on the seam) is a known benign spill and is excluded.
3. wrapped figures: text of at most 40 chars containing a digit (not prose) that renders on more than one line.
4. font consistency over every text leaf: off the type scale, differs from its table column mode, number not mono while its column is mono, non-numeric sub-label larger than a mono primary in the same cell, label larger than its KPI figure. The skip link is excluded.

Findings are outlined magenta in screenshots (1440/1024/390) in `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/layout/shots-before/` and `shots-after/`. Full JSON: `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/layout/findings-before.json` and `findings-after.json`. Caveat: "before" was measured before the spine exclusion was added to the script, so its 5 spine spills per alpha screen at 1440/1280 (15 of the 43 clipped) are an artefact of the script change, not a fix.

## Type scale found

`src/execution/execution.css` roles over `styles/tokens.css` (`--text-2xs..2xl` = 10, 11, 12, 13, 15, 18, 23, 30 px). Allowed computed sizes used by the audit: 10, 11, 12, 13, 14, 15, 18, 22, 23, 24, 30. Roles: title 24, subtitle 14, section 15, body 13, control 13, th 11, data 12, num 14 mono, kpi 24 mono, meta 12, id 12 mono, term 12 mono, caption 11, display 22, label 11 mono. Result: no off-scale size and no non-mono number inside a mono column on any V2 screen (the only off-scale hit was the shell skip link, 16px, not V2). Outside the tokens, `screens/portfolios/partitionFigures.css:3` hardcodes `font-size: 11px` (not touched, owned elsewhere). The `caption` comment in execution.css says "mono 10/14" while the token is 400 11px/14px body.

## Summary (overflowPx / clipped+spill / wrapped figures / font outliers), before -> after

| screen | 1440 | 1280 | 1024 | 660 | 390 |
|---|---|---|---|---|---|
| overview | 0/0/65/5 -> **0/0/0/5** | 0/0/70/5 -> **0/0/1/5** | 0/0/0/5 | 0/0/0/5 | 0/0/66/5 -> **0/0/1/5** |
| fleet-table | 0/0/0/20 | 0/0/0/20 | 0/0/13/20 | 0/0/0/20 | 0/0/0/20 |
| fleet-board | 0/0/0/0 | 0/0/0/0 | 86/0/0/0 | 0/0/0/0 | 0/0/0/0 |
| fleet-map | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 |
| portfolios | 0/0/0/92 | 0/0/0/92 | 0/0/0/92 | 0/0/0/92 | 0/0/0/92 |
| portfolio-360 | 0/1/0/0 | 0/1/0/0 | 0/1/0/0 | 0/0/0/0 | 0/0/1/0 |
| compare | 0/0/0/12 | 0/0/0/12 | 0/0/0/12 | 0/0/0/12 | 0/0/0/12 |
| alpha-360 | 0/5/0/1 -> **0/0/0/1** | 0/5/0/1 -> **0/0/0/1** | 0/0/0/1 | 0/0/0/1 | 0/0/1/1 |
| alpha-orders | 0/5/0/3 -> **0/0/0/3** | 0/5/0/3 -> **0/0/0/3** | 0/0/0/3 | 0/0/0/2 | 0/0/0/2 |
| alpha-deployments | 0/5/0/1 -> **0/0/0/1** | 0/5/0/1 -> **0/0/0/1** | 0/0/0/1 | 0/0/0/1 | 0/0/0/1 |
| alpha-replay | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 |
| accounts | 0/0/0/17 | 0/0/0/17 | 0/0/0/17 | 0/0/0/17 | 0/0/0/17 |
| account-360 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/2/0 |
| paper | 0/0/0/3 | 0/0/0/3 | 0/0/0/3 | 0/0/0/3 | 0/0/1/3 |
| sandbox, canary, live, operations | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 |
| blotter | 0/0/0/59 | 0/0/0/59 | 0/0/0/59 | 0/0/0/12 | 0/10/0/12 |
| approvals | 0/0/2/0 | 0/0/3/0 | 0/0/0/0 | 0/0/0/0 | 0/0/3/0 |
| new-approval, profile-access | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 | 0/0/0/0 |
| admin-actions | 0/0/0/4 | 0/0/0/4 | 0/0/0/4 | 0/0/0/4 | 0/0/0/4 |
| users | 0/0/0/5 | 0/0/41/5 -> **0/0/0/5** | 0/0/41/5 -> **0/0/0/5** | 0/0/0/5 | 0/0/0/5 |

Totals over 24 screens x 5 widths: clipped/spill 43 -> 13 (15 of the 30 removed are the script artefact above), wrapped figures 309 -> 28, font outliers 1014 -> 1014 (not targeted), screen-widths with page overflow 1 -> 1 (fleet-board 1024).

## Top 25 findings (before)

| # | screen | widths | kind | selector | measured | n | screenshot (under shots-before/) |
|---|---|---|---|---|---|---|---|
| 1 | overview | 1440,1280,390 | wrapped-figure | `table.exec-ov-contrib td.exec-ov-contrib-num > span.exec-mgr-num` | "+4.4027%" on 2 lines | 136 | overview-1440.png |
| 2 | users | 1280,1024 | wrapped-figure | `span.exec-usr-name > span.exec-usr-display` | "Account 10" on 2 lines | 82 | users-1024.png |
| 3 | overview | 1440,1280,390 | wrapped-figure | `table.exec-ov-contrib > tbody > tr > th` | "alpha_scale_001" on 2 lines | 63 | overview-1440.png |
| 4 | blotter | 390 | spills-out-of-box | `div.exec-cards-wrap > table.exec-blt2-table td` | "Not published for this order" by 17px | 10 | blotter-390.png |
| 5-7 | alpha-360 / orders / deployments | 1440,1280 | spills (benign chevron) | `ol.exec-blk-spine-list > li.exec-blk-spine-node` | by 10px | 10 each | alpha-360-1440.png |
| 8 | fleet-table | 1024 | wrapped-figure | `table.exec-cards td > span.exec-cards-v` | "Gamma Book 03" on 2 lines | 13 | fleet-table-1024.png |
| 9 | fleet-board | 1024 | page-overflow | `documentElement` | 86px | 1 | fleet-board-1024.png |
| 10 | approvals | 1440,1280,390 | wrapped-figure | `table.exec-ck-kv th` | "Capture R2 review" on 2 lines | 6 | approvals-1440.png |
| 11 | portfolios | all | col-size-differs | `span.exec-pf-na > span.exec-blk-why > button.exec-blk-why-btn` | "Not available" 12px vs column mode 11px | 200 | portfolios-1440.png |
| 12 | portfolios | all | sublabel-bigger | `ul.exec-part > li.exec-part-line > span.exec-mgr-num` | "42,973.65 USDT" 14px mono | 170 | portfolios-1440.png |
| 13 | blotter | all | sublabel-bigger | `span.exec-blt2-ordercell > a.exec-blt2-idlink` | "ord_00300" 12px mono next to 11px "+" | 170 | blotter-1440.png |
| 14 | portfolio-360 | 1440,1280,1024 | spills-out-of-box | `dl.exec-pf-kpis dd.exec-pf-kpi-body > span.exec-pf-kpi-value` | "540,000.00 USDT" by 14px | 3 | portfolio-360-1440.png |
| 15 | portfolios | all | sublabel-bigger | `li.exec-part-line > span.exec-blk-why.exec-mgr-na > button` | "Not available" 14px | 75 | portfolios-1440.png |
| 16 | accounts | all | col-size-differs | `span.exec-blk-metric > span.exec-blk-num` | "10.00" 14px mono vs mode 12px | 70 | accounts-1440.png |
| 17 | fleet-table | all | sublabel-bigger | `span.exec-fleet-stagecell > span.exec-fleet-reasons` | 12px body beside 11px chip | 55 | fleet-table-1440.png |
| 18 | compare | all | col-size-differs | `span.exec-blk-why > button.exec-blk-why-btn` | "Not available" 12px vs mode 14px | 50 | compare-1440.png |
| 19 | fleet-table | all | sublabel-bigger | `span.exec-fleet-stageline > span.exec-fleet-also` | "also Canary" 12px | 45 | fleet-table-1440.png |
| 20 | approvals | 1280,390 | wrapped-figure | `table.exec-ck-table td` | "concentration top-3" on 2 lines | 2 | approvals-390.png |
| 21 | users | all | col-size-differs | `span.exec-usr-meta` | 12px vs mode 13px | 25 | users-1440.png |
| 22 | blotter | all | sublabel-bigger | `span.exec-blt2-na` | "◇" 12px | 22 | blotter-1440.png |
| 23 | overview | all | col-size-differs | `table.exec-ov-contrib td` | "Real-funded · USDT" 12px vs mode 13px | 20 | overview-1440.png |
| 24 | admin-actions | all | sublabel-bigger | `span.exec-adm-state > a.exec-adm-link` | "Open" 13px (control role) | 20 | admin-actions-1440.png |
| 25 | alpha-orders | all | col-size-differs | `span.exec-cards-v > span.exec-blk-na` | "Not available" 12px vs mode 14px | 11 | alpha-orders-1440.png |

## Fixed (CSS only, V2 css, existing tokens only)

1. `css/overview.css` `.exec-ov-contrib`: `overflow-wrap: anywhere` let the table shrink figure columns to nothing, so "+4.4027%" and "ALPHA_SCALE_001" broke across two lines (rows 1 and 3). Now `tbody th`, figure cells and their children are `white-space: nowrap; overflow-wrap: normal`. For room: `.exec-ov-grid3` columns `1fr 1fr 1.9fr` (was 3 x 1fr); at max-width 1400px the third panel (Contributors) spans a full row of a 2-column grid; single column from 1100px as before; at max-width 600px the table scrolls inside its panel (`display:block; overflow-x:auto`). A first attempt without the 600px rule made the page 24px wider at 390 and was caught by the re-run. Result: overview wrapped 65/70/66 -> 0/1/1 (1280: "at least 1" KPI; 390: "+40.80 USDT" readout).
2. `css/users.css` `.exec-usr-display`: `white-space: nowrap`. At 1280 and 1024 every roster row stacked "Account" over "10" and doubled its height (41 rows). Now 0.

## Left (not fixed)

| screen | finding | why not fixed | recommendation | needs |
|---|---|---|---|---|
| fleet-board 1024 | page overflows by 86px | `screens/fleet` owned by another agent | find the lane/tile min-width at 1024 | CSS (fleet owner) |
| fleet-table 1024 | "Gamma Book 03" wraps (13 rows) | fleet owner | nowrap on the name cell | CSS (fleet owner) |
| portfolio-360 1440-1024 | KPI "540,000.00 USDT" at 24px spills 14px out of its tile | portfolios owner; tile sizing | clamp KPI font or widen tile | design |
| portfolios, compare, alpha-orders, alpha-360, paper | "Not available"/"Not published" (12px meta) sits in columns of 14px mono figures (rows 11, 15, 18, 25) | by design (placeholder = meta role, figure = num role); one placeholder size would change blocks.css and every baseline | decide one placeholder role | design |
| overview | Capital NAV figure is 14px mono boxed while sibling partition figures are 12px; KPI strip mixes 12-14px figures with 24px "at least 1" / "3 of 214" | emphasis vs consistency is a design call | unify the KPI tile value role | design |
| accounts | metric figures 14px mono vs 12px neighbours | num vs data role | none unless design wants one role | design |
| blotter 390 | "Not published for this order" spills 17px in the mobile card layout (10 rows) | needs a layout change | wrap the note inside the card | layout |
| approvals | "Capture R2 review", "concentration top-3" wrap | prose labels, acceptable | none | - |
| portfolios | 92 font outliers (part-line 14px figures beside 12px names) | `screens/portfolios` owned elsewhere | decide figure role | owner |
| all | no text clipped without a title found at any width; `.exec-cards-wrap` scroll is intended | - | - | - |

Several font "outliers" (sub-label rows 13, 17, 19, 22, 24) are role differences by design (control 13, label 11, meta 12) that the heuristic flags; they are reported, not defects.

## Pixel baselines that will differ (not recorded)

Overview at every width (Contributors panel and grid), Users at 1280 and 1024 (roster row heights).

## Tests run

`npx vitest run src/execution/v2/uxm10Css.test.ts src/execution/v2/v2Hygiene.test.ts src/styles --maxWorkers=2`: 3 files, 187 tests passed. `npx vitest run src/execution/v2/screens/overview src/execution/v2/screens/users --maxWorkers=2`: 9 files, 383 tests passed. `tsc` not run (no TypeScript changed). No visual suite.
