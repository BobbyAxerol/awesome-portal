# F5a POLISH2 record (2026-10-01) — S02 polish on the current code

Base: worktree detached at `71aed3e6` (contains `fedfac44`, the S02 data-declaration rewrite). The brief's fallback `999be160` predates that rewrite, so it was not used.

## Items
1. **DONE** Required-field errors only after edit/leave. `NewRun.tsx`: `engaged` set (step edited through `stepPatch`, or left); step errors, pills and the rail show a step's problems only when engaged; Review lists every problem; `blocking` (preflight guard) unchanged. `stepCaption` got an additive `unfinished` argument: reached + problem + not engaged = "in progress"; unvisited = "not visited"; "needs attention" after leaving. Symbol input is red only when the error is shown. The release-default adoption in `WindowsStep` goes through a separate `adopt` prop so it does not count as a reader edit.
   Tests: `newRun.f1.test.tsx` (unvisited-step test changed deliberately; new "typing ... leaving ... Review always lists it"; new "not visited stays not visited; preflight guard still sees every problem"; D6 4h-vs-1h test now leaves and returns first), `newRun.f3.test.tsx` (caption walk), `newRun.test.tsx` (marks a step with a problem).
2. **DONE** `WindowPrefillNote` one line `Prefilled from <dataset> · <symbol> · <span>` (about 65 -> 9 words); timezone/edges/"left empty" sentences in the `title`; kept-bounds case `Your bounds kept · coverage <span>` with the old sentence as `title`. `data-prefill-edges` / `data-prefill-interior` removed. `coveragePrefill.test.tsx` updated deliberately (`tip()` helper).
3. **DONE** Review rail: `parameter_space` "not declared" when no declaration was read (ALREADY FIXED before this batch; now pinned by `newRun.polish2.test.tsx`); empty timeframe "not declared" (was a blank after the last ` · `); unset stop/seed "not set" (trials stays "not declared"; `dataDeclaration.test.tsx` two assertions changed deliberately); walk-forward guards placeholder = served `temporal_guards.release_default`; inner-folds placeholder = served `min_folds_release_default`, no placeholder attribute when the atlas does not publish `inner_folds`.
4. **DONE** `emptyDraft().timeframe = ""`. `NewRunRoute.tsx`: once a version is chosen and the field is empty, take the FIRST served declared timeframe (never overwrites a copied or picked value; a version that publishes none leaves it empty). `validateData`: "A timeframe is required." (after the symbol check, before the declaration check). Review prints "not declared". Added (not in the brief, needed to avoid a dead end): `timeframeChips(..., scratch)` — a scratch run (`bound=false`) has no declaration to wait for, so the dataset's own timeframes are enabled; otherwise a scratch run could never fill the now-required field.
   Tests: `newRun.polish2.test.tsx` (unit, component, real route with a 2-timeframe registry, no-version, none-published, scratch chips).

## Verification
- `npx vitest run src/research`: 103 files, 2315 tests passed. Targeted (`newRun*`, `coveragePrefill`, `dataDeclaration`, `w4`, `runDraft`): 7 files, 267 passed (new file `newRun.polish2.test.tsx` included).
- `npx tsc -b --noEmit` (excluding features/roadmap-task-board): clean.
- Browser (Vite dev server, real API 8095, claude-preview) at 1440 and 660: fresh Market data step has no red text, caption "in progress"; `?av=` version picks `1h` (the version's first declared; chips `4h`/`1d` enabled); after leaving the step the pills read "needs attention"; no-version Review: `crypto-binance-1m · not declared · not declared`, `not declared · not set · not set`; prefilled windows note `Prefilled from crypto-binance-1m · BTCUSDT · 2020-01 → 2026-10 · 82 months` (title carries the rest). No horizontal overflow at either width. Screenshots (outside git): `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/f5polish2/` (after only; the BEFORE shots were not taken).

## Shared files
None of `researchFormat.ts`, `screenRoutes.ts`, `state.ts`, `styles/*`, `QuantBTModule.tsx` touched. `dataDeclaration.ts`: additive optional parameter. `stepCaption` (exported from NewRun.tsx): additive optional argument.

## Not changed
`runDraft.ts` serializer fallbacks (`inner.minFolds || "2"`, `asNumber(optunaTrials) ?? 1`) are not displayed text. Trials stay "not declared".

## Backend requests
None.
