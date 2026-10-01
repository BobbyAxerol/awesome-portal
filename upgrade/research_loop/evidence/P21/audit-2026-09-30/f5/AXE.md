# F5 AXE (tree 6e540cda, worktree wf_4883795e-af4-2)

## Commands
1. `RESEARCH_PROBE_SERVE=preview RESEARCH_SHOT_DIR=<scratch>/axe RESEARCH_A11Y_RECEIPT=<scratch>/axe/rf04-a11y-receipt.json npx playwright test -c playwright.research-probe.config.ts e2e/_probe-research-rf04-a11y.spec.ts --workers=1` (fixture lane, vite build of this tree + vite preview :4361, reduced motion). Needed `npm ci` in features/roadmap-task-board/frontend first (build failed to resolve "mermaid" before).
   - Run 1 (before fixture fix): 18 passed / 27 failed, exit 1. Run 2 (after): 18 passed / 27 failed, exit 1 (S02 moved from "does not render" to 4 real findings).
   - Receipt run 2 sha256 241af3a347bde05a.
2. `X2_BASE_URL=http://localhost:5231 npx playwright test -c playwright.research-x2.config.ts e2e/_probe-research-x2-gaps.spec.ts -g "P04 report|OVERLAY . S09"` against vite dev proxied to preview :8095: 4 passed / 0 failed, exit 0.
Only rf04 and x2-gaps call axe in a way this group needed; s12 and w5b-s08 also use axe but were not run.
rf04 only marks a node accepted when fg == #939db0 (D-B1). Under .research-screen ink-faint is now #626d85 / #7d8aa0, so nothing is "accepted"; every node below counts as a failure in the cell.

## Result per screen (unique nodes per width; 1440 / 1280 / 660), all impacts
S00 0 · S01 4/4/4 · S02 4/4/4 · S03 2/2/2 · S04 8/6/5 · S05 0 · S06 4/5/4 · S07 0 · S08 1/1/1 · S09 0 · S10 8/8/8 · S11 0 · S12 0 · S13 9/9/9 · S14 1/1/1.
Passing cells: S00, S05, S07, S09, S11, S12 (18). Failing: S01-S04, S06, S08, S10, S13, S14 (27).
Totals over 45 cells by rule: color-contrast 84, link-in-text-block 27, heading-order 6, scrollable-region-focusable 2. Earlier audit: 2,389 color-contrast nodes.

## Remaining color-contrast (fg on bg, ratio)
- #9ea4b3 on #fff 2.49: S04 "SOON" chip and "Approval Gate · Paper" (EvidenceFlow.tsx ~1198, var(--ink-faint) but lighter than #626d85, so a dimmed ancestor/opacity)
- #9199aa on #fff 2.86: S01 superseded row (RunLibrary.tsx ~1866: ink-faint + opacity 0.7)
- #9199a5 on #fff 2.87: S04 timeline label (ink-faint with opacity)
- #7a8699 on #faf9f5 3.49: S04/S06 Stage A h2 (inline colour, 11px bold)
- #7a8699 on #fff 3.68: S02 timeline row "is" 9.5px mono
- #7a8397 on #fff 3.80: S03 claim text (11px mono)
- #9a6a1f on #f4ecdb 4.01: S01 R-WFO-118/120 stage cell S2 (warn ink on warn tint)
- #6f7a8c on #fff 4.34: S04/S06 outer-OOS chip
- #626d85 on #e2edf0 4.35 (8 nodes): --ink-faint on the blue sunken tint: S02 step caption + current step, S03 fold note, S04 search tab sub, S10 att_01 head/cfg/metric absent, S14 tab sub. This tint was below the 4.64-4.93 quoted range.
- #626d85 on #f4ecdb 4.41 (5 nodes): S10 pick-fact absent/reason/source on warn tint
- #9a6a1f on #faf9f5 4.47 (5 nodes): S02 chip, S04/S06 Stage B h2 and freeze chip
Decision input for Bobby: (a) ink-faint light a little darker (about #5c6780 clears 4.5 on #e2edf0); (b) opacity dimming on ink-faint rows (S01, S04); (c) hard-coded inline #7a8699 / #6f7a8c / #7a8397 (not tokens); (d) warn ink #9a6a1f on faint/tinted backgrounds. All 45 cells are light theme; Operations Dark was not measured by this probe.

## Non-contrast violations
- S13 link-in-text-block (serious), 9 nodes per width: a[data-run-link|data-report-link|data-rc-link="run-w6a-*"] (3 links x 3 runs); 1.83 link/text contrast, no non-colour cue. UI (ours), needs decision (underline vs colour).
- S08 heading-order (moderate): `section[aria-label="execution contract"] h3`; S02 heading-order: `.text-[12px]` heading. UI (ours), not changed.
- S04 1280, S06 1280 scrollable-region-focusable (serious): `section[data-panel="search-space"]` scrolls but is not keyboard focusable. UI (ours), not changed.

## S09 print (real data, x2 probe)
REAL P04 report + OVERLAY (real WFO run with wfo/failed/32-fold report bodies): 4/4 pass. Print Letter 816 / A4 794: sheet width = paper width, no overflowing .rr-sheet nodes, no .no-print visible, 0 px page overflow; PDFs written. Page-wide axe at 660: 2 nodes (#939db0 shell: .portal-workspace, kbd). At 1440: 42 nodes, all in the portal shell (sidebar labels/badges on #f4f2ec), none in the report root; shared Execution tokens outside .research-screen (shell decision). rf04 S09 root: 0 nodes at 3 widths (fixture). Print pages are not axe-scanned.
Artifacts (scratchpad/f5l/axe/x2, sha256 first 16): print-wfo-letter.pdf 3be966b5a5e80865, print-wfo-a4.pdf 69d60028330c55e0, print-failed-letter.pdf 459659c4bbcbb1e7, print-folds32-a4.pdf dfbb12294885cfe7, real-p04-report-1440.png e68499c709e78087, overlay-report-wfo-1440.png 889f0bfdd7a77bcc.

## Fixed (ours) / open
- FIXED, stub-fixture drift: `e2e/research-foundation/atlas.json` lacked `portal_admission` and `historical_identity` required by the contract (research-foundation.atlas-current.valid.json), so S02 threw `Cannot read properties of undefined (reading 'profiles')` (NewRunRoute.tsx:476) and never rendered in the fixture lane. Added both from the contract fixture (+50 lines). Proof: S02 rendered at 3 widths in run 2 and was axed. Other probes consuming atlas.json were not re-run.
- OPEN: NewRunRoute.tsx:476 dereferences `atlas.portal_admission.profiles` unguarded (contract makes it required); not changed.
- OPEN for Bobby: every finding above. D-B1 acceptance in the probe is obsolete for Research screens.
