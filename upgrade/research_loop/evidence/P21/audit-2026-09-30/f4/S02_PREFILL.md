# S02_PREFILL — the coverage prefill starts on the verified bar index

Base: `494c539a` (detached). The brief's fallback `999be160` (what the worktree's first checkout gave) has none of the B7 files; `494c539a` exists and was checked out. Not committed.

## Items

| # | Item | Status | Where / tests |
|---|---|---|---|
| 1 | Exact bar edges when the v2 catalog serves `coverage_by_timeframe` for the chosen timeframe | DONE | `runDraft.ts` `planCoverage(catalog, dataset, symbol, timeframe = "")` + `exactEdges`: lower = `first_bar_utc_ms`, upper-exclusive = `indexed_end_exclusive_utc_ms` (the last closed bar's end, as served; never `last + resolution` computed here), UTC text `YYYY-MM-DDTHH:mm`. `CoverageSource.exact` (additive, optional). Tests `coveragePrefill.exact.test.tsx` "the pure plan". |
| 2 | Month prefill stays the fallback | DONE | v1 catalog, no timeframe, no entry for it, a `NOT_PUBLISHED` entry (its typed numbers are dropped by the reader), a dataset clock other than UTC, a sub-minute instant, a range that does not run forward, a missing served end: all return the month plan unchanged. Existing `coveragePrefill.test.tsx` untouched and green. |
| 3 | Re-run on timeframe change, never over edited bounds | DONE | `NewRun.tsx` `pickTimeframe` (re-places only when a prefill is already placed) and `NewRunRoute.tsx` timeframe-adoption effect (version's first declared timeframe replaces a month prefill with exact edges). Both go through `applyCoveragePrefill`, so the existing `placed`/`touched` provenance rule holds. Tests "what a timeframe change may touch" (re-place, month -> exact -> month, edited bound kept, untouched end moves), "Screen 02 re-prefills when the timeframe changes", "the route re-places a month prefill ... when the version's timeframe is adopted". |
| 4 | Warmup: no client date | DONE (no client arithmetic added) | Nothing computes a start from warmup x resolution. The existing `bar-metadata` wiring answers; its typed absence stays. See Finding 1. |
| 5 | One-line note | DONE | `Prefilled from crypto-binance-1m · BTCUSDT · 2020-01-01 00:00 → 2026-10-01 22:00 (1h)` (first bar → last bar, UTC, timeframe). Field captions: `first 1h bar` / `end of the last 1h bar`. Tooltip: exact edges, UTC, end exclusive, warmup answered by the index, not computed. Month wording unchanged on the fallback. |
| 6 | Tests with canonical fixtures | DONE | `coveragePrefill.exact.test.tsx` reads `research-dataset-catalog.v2.healthy.valid.json` and the v1 `research-preflight.dataset-catalog.valid.json` with `readFileSync`. Last bar earlier than the month end: fixture 1h = 2026-07-01 00:00 → 2026-07-03 00:00 against month edge 2026-10-01. Fails without the fix (8 of 14 fail when `exactEdges` is disabled). |
| 7 | Timeline "data" bar | SKIPPED | `coverageRange` (`dataDeclaration.ts`, outside this group's files) still draws the month envelope, so a bound before the first bar but in the same month raises no coverage warning. Follow-up for the owner of that file: read `source.exact`. |

## Findings on the real preview (127.0.0.1:8095, Vite 5395)

1. A first window that asks for warmup at the first indexed bar is refused by the server. Probed: BTCUSDT 1h, IS `[2020-01-01, 2023-05-17)`: no warmup -> `AVAILABLE`, 29,568 bars; `warmup_bars=32` -> `NOT_PUBLISHED / WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE` (also at first+1d); at first+2d -> AVAILABLE. The alpha declares `warmup_bars=300`, so the exact prefill's IS start (the first bar) shows `bars — not published` and `warmup — not published` by design of the server; typing IS start 2020-01-20 shows `29,112 bars` and `warmup 300`. The UI does not move the start: that would be a date computed from warmup x resolution.
2. 1h and 4h have different exact edges (1h end 2026-10-01 23:00, 4h end 20:00; last bars 22:00 / 16:00).
3. Interior bounds (IS end, OOS start/end, Holdout start) stay empty by the D4 rule (no server rule splits coverage); OOS shows a count only after the reader types both of its bounds. The browser check typed them (2023-05-17, 2025-01-23).

## Before / after, real preview (BTCUSDT, 1h, IS end 2023-05-17, OOS 2023-05-17 → 2025-01-23, Holdout start 2025-01-23)

| Window | Before (month prefill) | After (exact edges) |
|---|---|---|
| IS (start prefilled) | `2020-01-01 → 2023-05-17` · bars — not published | `2020-01-01 → 2023-05-17` · bars — not published (warmup 300 before the first bar, Finding 1); with IS start 2020-01-20: 29,112 bars |
| OOS | 14,808 bars | 14,808 bars |
| Holdout (end prefilled) | `→ 2026-11-01` · bars — not published | `→ 2026-10-01T23:00` · 14,807 bars |
| Warmup | warmup — not published | warmup — not published at the first bar; `warmup 300` at 2020-01-20 |

Prefilled values: before `2020-01-01T00:00` / `2026-11-01T00:00`; after `2020-01-01T00:00` / `2026-10-01T23:00` (1h), `2026-10-01T20:00` (4h). Note line before: `... · 2020-01 → 2026-10 · 82 months`; after: `... · 2020-01-01 00:00 → 2026-10-01 22:00 (1h)`.

Words on the screen: the note line is the same length class (one line); captions swap `first day of 2020-01` for `first 1h bar`; no new line added.

Screenshots (outside git), 1440 and 660, overflow 0 at both, no console noise on the final runs (an earlier 1440 run logged `504 Outdated Optimize Dep` from the Vite dev server's first dependency scan, not from the page): `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/s02p_shots/` (`before-*`, `after-*`, `after-typedstart-*`, `after-4h-*`; `-data-` = Market data step, `-windows-` = Walk-forward step).

## Backend requests (for Codex)

1. Endpoint/field: `bar-metadata` first window with `warmup_bars`, or `coverage_by_timeframe[]`. Reason UI: the exact prefill's IS start (the first bar) can never answer when the version declares warmup; the UI may not compute a date from warmup. Now: `NOT_PUBLISHED / WINDOW_EXCEEDS_VERIFIED_METADATA_RANGE` with `bars: null`, `warmup_bars_available_before_start: null`. Smallest: add `earliest_start_with_full_warmup_utc_ms` (or per request `warmup_bars` a served `first_start_utc_ms_with_warmup`) to the per-timeframe coverage or to the refusal; alternatively answer `AVAILABLE` with `warmup_bars_available_before_start` < required. FE now: `bars — not published` + `warmup — not published`, code in the tooltip.
2. Still open from S02_B7: unaligned-bounds refusal code; whether `warmup_bars_available_before_start` is capped at the request.

## Shared files touched

None of the shared modules (`researchFormat.ts`, `screenRoutes.ts`, `state.ts`, styles, `QuantBTModule.tsx`). Edited: `runDraft.ts`, `NewRun.tsx`, `NewRunRoute.tsx`; new: `coveragePrefill.exact.test.tsx`. `dataDeclarationV2.ts`, `useWindowMetadata.ts`, `PlannedWindows.tsx` unchanged (`runDraft.ts` now imports `coverageFor` from `dataDeclarationV2.ts`, no cycle: that file imports types only).
