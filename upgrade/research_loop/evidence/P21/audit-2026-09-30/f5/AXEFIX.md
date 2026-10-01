# F5c AXEFIX — measured axe violations on the Research screens

Tree 6e540cda + uncommitted changes (worktree wf_9f1fa27f-1bb-1). Scratch: `scratchpad/f5l/axefix/`.

## Commands and counts
- BEFORE (same tree, atlas.json fixture fixed): `RESEARCH_PROBE_SERVE=preview RESEARCH_PROBE_PORT=5361 npx playwright test -c playwright.research-probe.config.ts e2e/_probe-research-rf04-a11y.spec.ts --workers=1` (old probe, light only): exit 1, 18 passed / 27 failed. color-contrast 84, link-in-text-block 27, heading-order 6, scrollable-region-focusable 2 (matches AXE-input.md).
- AFTER, final: same command with the new probe (two theme passes, strict 4.5:1, nothing accepted): exit 0, 90 passed / 0 failed / 0 skipped (45 Research light + 45 Operations Dark). Receipt `after2/rf04.json` sha256 68e86e402eb205c8.
- Intermediate AFTER (before the dark-token fix): 63 passed / 27 failed — all 27 were Operations Dark cells (new measurement, see item 10), light 45/45 clean.
- `npx vitest run src`: 261 files / 4812 passed / 3 skipped / 0 failed. `npx vitest run src/styles` (token gate): 13/13. `npx tsc --noEmit`: clean.
- Guard test proof: with the `?.` guard reverted, 2 of 3 tests in `newRun.axefix.test.tsx` fail; with it, 3/3 pass.

## Nodes per rule, BEFORE -> AFTER (45 light cells; counted over 3 widths)
color-contrast 84 -> 0 · link-in-text-block 27 -> 0 · heading-order 6 -> 0 · scrollable-region-focusable 2 -> 0. Operations Dark (not measured before): 147 nodes found -> 0.
Every cell that failed (S01-S04, S06, S08, S10, S13, S14) now passes at 1440/1280/660 in both themes. No node left uncleared.

## What was changed (each ours; UI bug unless stated)
1. Opacity-dimmed ink removed: EvidenceFlow "Promotion · SOON · Approval Gate · Paper" container opacity .62 gone, label now `--ink-faint` italic; RunLibrary superseded row opacity .7 -> `--ink-soft` + italic; RunProgress S03 claim text opacity .85 removed (italic already marks the forecast).
2. The "inline" colours were tokens: `--role-is` (#7a8699) and `--state-unavailable` (#6f7a8c) used as text. Text now uses ink tokens: SearchDetail Stage A h2 and WITHHELD chip -> `--ink-faint`, REPORT_ONLY chip -> `--ink-mute`; NewRun S02 timeline IS/span label -> `--ink-faint`. Band fills keep `--role-is` (graphics). #7a8397 was ink-faint under opacity (item 1). Test expectations in searchDetail.test.tsx updated accordingly.
3. `.research-screen --ink-faint` #626d85 -> #5c6780. Ratios (paper · raised · sunken · blue tint #e2edf0 · warn tint #f4ecdb): 5.38 · 5.67 · 5.06 · 4.75 · 4.82.
4. Warn ink, Research scope: `--accent-2` and `--role-holdout` #9a6a1f -> #8f6118: 5.12 · 5.40 · 4.82 · 4.52 · 4.59 (was 4.47 · 4.71 · 4.21 · 3.95 · 4.01).
5. link-in-text-block: `researchScreen.css` underlines `a[data-run-link|data-report-link|data-rc-link]` (1px, offset 2px).
6. Heading order: S08 `ExecuteDetail` Card h3 -> h2; S02 `NewRun` Card title h3 -> h2 (newRun.f3.test.tsx updated). Nothing else changed in markup.
7. `section[data-panel="search-space"]` (3 sites in SearchDetail): `tabIndex={0}`, `aria-label="search space as declared"`; focus ring is the existing `.research-screen :focus-visible`. Test in searchSurface.x2.test.tsx.
8. `NewRunRoute.tsx:476`: `atlas.portal_admission?.profiles ?? null`; tests `newRun.axefix.test.tsx` (absent block, null block, present block). Also re-applied the fixture fix (atlas.json +50 lines, portal_admission + historical_identity: null), lost with the earlier worktree.
9. Probe `_probe-research-rf04-a11y.spec.ts`: D-B1 clause removed (strict 4.5:1, any rule fails), second pass under Operations Dark via `usePreferences`, asserts `<html data-theme>` equals the pass, receipt keys `theme:Sxx@width`. Still a probe, not a gate. `axeReceipt.ts` untouched (other probes use it).
10. Operations Dark (first measurement): Operations palette never defined `--warn` / `--ink-mute`, so the light values (#8e6a00 3.36, #68738a 3.51 on raised) showed on dark (S00 chips and mapping links, S04/S06/S12/S14 chips, S07 what-if rule, S09 warnings, S11 YAML keys, S13 claim chip). Fixed inside `:root[data-theme="operations"] .research-screen`: `--ink-mute` #98a6ba (6.78 on raised), `--warn` #d4a75e (7.57), `--ink-faint` #8696ab (5.98 · 5.56 · 6.23 · 5.06 · 5.45 on paper/raised/sunken/surface-2/surface-3; the earlier #7d8aa0 was 4.37 on surface-2), `--accent-2`/`--role-holdout` restated #d4a75e.
Execution Loop tokens untouched; all edits in the Research block at the end of tokens.css.

## Screenshots at 1440 (outside git; name, sha256 first 16)
before: S01 1c6d7aff7c25b4cd · S04 d4cbf90c8a6e1f76 · S10 a3bbe60f145086f4 · S13 17c889f31d4d175f
after:  S01 8a7161642d771c99 · S04 de29ff2bbcfd27b8 · S10 95aaef32d955a4e4 · S13 36ad8e0f43e4ef75
Pixels changed (channel diff > 8): S01 3,779 (bbox 291,278-1397,774) · S04 2,021 · S10 3,257 · S13 455. Dir: scratchpad/f5l/axefix/{before,after}/.

## Open / for Bobby
- Visual baselines (portal-web-visual) of Research screens will drift (darker faint/warn ink, underlines on Compare links, italics on superseded/promotion text). Not run, not updated; needs the pinned-image visual lane and your approval of the baseline.
- Not re-run: other probes consuming atlas.json; s12 and w5b-s08 axe specs; the S09 print lane; the portal shell sidebar findings (shared Execution tokens, shell decision, unchanged).
- Deviations from HiFi to approve: warn ink #9a6a1f -> #8f6118 and faint ink -> #5c6780 on Research screens; WITHHELD and REPORT_ONLY chips no longer differ from each other by hue greyscale family only (ink-faint vs ink-mute).
