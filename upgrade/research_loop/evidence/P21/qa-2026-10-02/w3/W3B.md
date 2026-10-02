# W3B — mobile: hub, Progress, stage screens (base ba605889)

Files: `EvidenceFlow.tsx` (cursor bar summary toggle, tab-strip scroll-into-view), `researchScreen.css` (phone rules, one 720px block + two harmless base rules), tests `evidenceFlow.w3b.test.tsx`, `researchScreenMobile.w3b.test.ts`.
No change to RunProgress / Split / Search / Freeze / Execute TSX: their hooks (`data-action`, `data-claims`, `data-console-box`, `data-fold-row`, `data-screen`) already exist, so the rules are CSS-only and scoped to the six `data-screen` roots.

## Measured (vite build, flags LOCAL_ONLY=true PREVIEW=false, the 14 visual cells; elements = `main` links/buttons/tabs/selects/inputs; box+halo)
| cell (390) | <24px before to after | <44px before to after |
|---|---|---|
| S03 search | 6 to 0 | 7 to 4 |
| S04 retained WFO | 25 to 0 | 29 to 17 |
| S04 fixed P04 | 18 to 0 | 22 to 10 |
| S05 freeze | 10 to 0 | 11 to 8 |
| S06 split | 11 to 1 | 13 to 7 |
| S07/S08 execute | 23 to 0 | 37 to 34 |
360 gives the same picture. scrollWidth == viewport on all 14 cells at 390 and 360, before and after.
Hit areas: stage links and prev/next are 44px tall boxes; breadcrumb/cursor links 24px boxes; plain links get an invisible `::after` halo (inset -6px -2px, so 13px lines reach 25px); buttons/selects/summaries get min-height 24 (buttons min-width 24).

S04 interaction (390 and 360): cursor bar collapsed 39px with `fold 3 · trial 1 · window OOS`; open it is static (not sticky). The Promotion cell is not displayed; tab FREEZE clickable, strip scrolled to centre it (scrollLeft 232). Fold stepper ‹ › 24x24 (was 13x14).

## Laptop (1440x900) and 1280x800, before vs after, PIL
14 cells at 1440: 12 byte-identical, 2 differ by 9 and 11 pixels (max channel delta 2, sidebar/antialias noise, same size as the earlier host run-to-run noise). 1280: 14 cells compared, 9 byte-identical, 5 differ by 10–35 pixels (same noise class). No layout change at >=721px: the only non-media rules are `[data-cursor-toggle]{display:none}` and wrap-on-overflow for causal fold words.

## Not reproduced / not done
- S07 causal fold rows: the lane fixtures do not serve `fold_ordering` on the freeze route (a fetch-injection attempt rendered the fixed-profile ordering), so the clip at 1280/390 was not reproduced. Defensive CSS only: `[data-fold-row]` words get `min-width:0; overflow-wrap:anywhere` at all widths (no effect when they fit). Needs a real causal run to confirm.
- S03 claim chip at 360: no fixture reproduces the 3px; chips now wrap (`white-space: normal`), console wraps. Unconfirmed.
- `div[role=log]` focusability, S07 nested-interactive: W5 items, untouched.
- Library S1-S5 chips, zoom controls (S09), compare checkbox, wizard pills: W3C files.
- Top bar 129-153px to 56px, Display menu, sidebar chips: W3A (top bar still 132/156 here).

## NEEDS-SHARED
- The sticky offset of `[data-stage-card]` is measured from `.portal-topbar` (useTopbarOffset), so it follows W3A's 56px bar without change.
- `researchScreen.css` is also appended by W3C: both append inside the same block; expect a trivial merge.
