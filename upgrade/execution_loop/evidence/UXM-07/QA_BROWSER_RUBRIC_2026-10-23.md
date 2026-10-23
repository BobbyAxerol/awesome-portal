# Browser acceptance rubric (Bobby, 2026-10-23): "UI, UX, data, font size, components must be inspected in the browser, carefully, every screen, flows clear"

A reviewer does NOT count cells and does NOT trust earlier reports. A reviewer LOOKS at the screenshots (Read tool on the PNG tiles), compares them with the design image of the same screen, and reads the measured numbers next to the picture. A finding is valid only with evidence: screenshot path + a pixel/tile location + what is wrong + what the design shows. "Looks fine" without naming what was compared is not a review.

## Inputs
- Screenshots of the LIVE review preview (http://127.0.0.1:8095, fixture lane) by `scripts/layout-audit.mjs`: folder given in your brief: `shots-qa1/<route>-<width>.png` (findings are outlined red) and `findings-qa1.json` (per route and width: overflowPx, clipped[], wrapped[], fontOutliers[] with selector, measured size, text excerpt). Tall pages are cropped for you into tiles `tiles/<route>-<width>-tNN.png` of 1440x1000 (legible text): view the tiles, not only the downscaled full page.
- Design images: /tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/artifact/<screen>-mgr.jpg (manager view = target), -nq (source not qualified), -res (researcher), hl-*.jpg (highlights), and `_highlights.json` captions.
- The earlier audit checklist for the screen: upgrade/execution_loop/evidence/UXM-07/PREVIEW_VS_ARTIFACT_AUDIT_2026-10-23.md section 2 (use it as a starting list, then verify by eye).

## Checks per screen and width (answer each: OK / ISSUE(evidence) / N/A)
A. DATA: every region the design fills with figures is filled; where the page prints "Not available / Not published / No source" ask: does a contract place exist (then it is a FIXTURE gap) or not (then it is a CONTRACT gap, name it)? Values plausible and consistent with other regions of the same screen (totals tie, same ids, same currency labels, dates ordered).
B. TYPOGRAPHY: within one table all body cells share one size; figures are mono, right-aligned, tabular; placeholders match the size of the figures they replace; headings, KPI numbers, captions follow the design hierarchy; nothing visibly larger/smaller than its neighbours without a design reason; no text below 11px; no mixed fonts in a row.
C. LAYOUT: no horizontal page scroll; no clipped or overlapping text; no figure broken over two lines; no orphan empty bands or giant gaps; row heights consistent; sticky headers/columns behave; tables that scroll inside their own wrapper show the scroll affordance and keep the identity column visible; spacing/density consistent with sibling screens.
D. COMPONENTS: every component of the design image is present (name each missing one); controls are real (no dead disabled controls: a disabled control must say why next to it), selectors/tabs/segments/chips/drawers/menus open and work; badges, flags, bars, sparklines, charts have the right shape, scale, labels, colours (tokens), legends; icons present.
E. STATES AND FLOWS: the links and buttons visible on the screen lead somewhere sensible (list the ones you could click through with Playwright and what happened); back links; the context bar, search field, sidebar badges; deep links; no console errors beyond the known retained-review 404.
F. RESPONSIVE: 1440, 1024, 660 (cards layout): nothing lost silently, no overflow, touch-sized controls, tables turn into cards cleanly.
G. HONESTY: simulated data is not presented as real (the fixture banner stays); no figure summed across currencies or economic domains; no client-computed score; typed absence has a reason.

## Output (one markdown per reviewer group, in the lane docs path given in the brief)
1. Header: reviewer id, preview bundle (curl http://127.0.0.1:8095/execution | grep index-), date, screens covered.
2. A table per screen: check A-G x width with OK/ISSUE and the ISSUE ids.
3. ISSUE list: id, severity (BLOCKER = wrong/misleading/unusable; MAJOR = visibly off the design; MINOR = polish), screen, width, evidence (screenshot tile path + location), what is wrong, what the design shows, the likely owner WP (A fleet, B operations, C alpha/replay/compare, D shell, E approvals/access/admin/users, F1 overview/portfolios, F2 account/accounts/blotter, F3 workbench/stages, K contracts, P fixture world), and whether it needs a contract (CONTRACT) or is fixable in the frontend/fixture (FE/FIXTURE).
4. A short "what is good" list (so owners keep it).
5. What you could not check and why.
You may run small Playwright probes (one chromium, against the preview on 8095, read-only GETs only; never click anything that submits, applies, approves or commits) to open drawers, tabs, menus and the command bar (Ctrl+K), and to take extra screenshots into your own scratch folder.
