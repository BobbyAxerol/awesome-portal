# F4 · GROUP MISC (S03, S06, S10, S13, S14)

Base 999be160. Screenshots (outside git): scratchpad `misc_shots_after/` at 1440 and 660 (no BEFORE set taken; overflow 0 on every page).

| Item | Status | Where / tests |
|---|---|---|
| (a) S03 planned_folds | DONE | `PlannedWindows.tsx` (rail above Gantt, cell colour = observed fold state; NOT_PUBLISHED = "not published" + server reason code; older server = absence). `runProgress.misc.test.tsx` (canonical planned-folds fixture) |
| (a) S03 rate_trials_per_s | DONE | `RunProgress.tsx` ProgressCard (`{rate} trials/s`, exact string; null/absent = "not published"); live `trial_completed` rate via `useRunProgress.liveRate` (+ Route prop). Same test file. Real runs are old seals, so only the absence path was seen in browser; value path is test-only |
| (b) S14 next_cursor | DONE | `alphaImportClient.registry(…, cursor)`, `useAlphaImport` (registryNext/More, epoch guard, dedupe by alpha_version_id), `AlphaImport.tsx` load-more row, Route wiring. `alphaImport.misc.test.tsx`. "top N / total" kept. Cursor never parsed or printed |
| (c) S10 CLONE/REPRODUCTION | DONE | `isTracedChild`/`isHideableProbe` (intent_kind CLONE_FOR_EXPERIMENT / REPRODUCE_EXISTING never hidden; toggle count + band "+N probes" count only hideable). `lineageDetail.misc.test.tsx`; W6b-U02 updated. Real alpha: 38 hideable of 40 (no clone probes), so toggle is not defeated |
| (c) S10 dim | DONE | ABANDONED rows `color: var(--ink-soft)`, no opacity (`lineageDetail.test.tsx` S10-U12 updated). Axe not re-run |
| (d) S13 single OOS window | DONE (value path test-only) | `CompareDetail.tsx` FoldChart + `compareFoldBars.ts` consts: P04 attempt with a published OOS_SHARPE becomes one bar "single OOS window" (ordinal -1, left of fold_01; skipped when >=8 real folds). No value = existing typed absence. Real P04 runs publish none, so browser still shows absence (see request 1). `compareDetail.misc.test.tsx` |
| (d) S13 ladder >12 | ALREADY OK | connector lives inside each step (CSS clip, FG-04a); structural test with 14 attempts. Not visually checked with 14 cards |
| (e) S06 one word | DONE | `RetainedOosColumn` takes the strip's Atlas reading; RETROSPECTIVE -> chip "retrospective" (browser: WFO run chip = retrospective, P04 = report only). Tests appended to `searchFoldStrip.g8.test.tsx` |
| (f) S14 IMPORT_META | ALREADY FIXED | endpoint family only; asserted in `alphaImport.misc.test.tsx` |
| (g) other DECISION rows | SKIPPED | D-B1 ink-faint token step (own baseline step); VD-FG-01-17 shell crumb (shell router, not my files); S14-C1 already resolved (F1b); 04-E/V cap policy (not mine) |

## Backend requests (for Codex)
1. **S13 P04 per-fold/OOS Sharpe** · Endpoint: compare `original_metrics[OOS_SHARPE]` and `fold_series` for `lane=P04_FIXED_PROFILE` · UI: the single-OOS-window bar needs a value; today 30 of 40 attempts say `P20_P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_OOS_SHARPE` · Smallest: publish the P04 outer-OOS Sharpe as OOS_SHARPE (scope naming the window) · FE now: absence + code.
2. **S03 rate on a fresh WFO** · none in contract; need a fresh run (old journals null) to see a real rate.
3. **Data conditions in Run (Bobby's main point)**: not in my files; see NewRun/Preflight groups.

## Surprises
- searchF2 (2 tests) timed out once under the parallel batch run, passed alone (13/13).
- `features/roadmap-task-board/frontend` needed `npm ci` for Vite to start (untracked node_modules).
