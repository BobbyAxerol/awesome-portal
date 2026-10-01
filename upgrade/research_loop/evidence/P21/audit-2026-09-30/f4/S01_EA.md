# S01_EA - Library card reads `analytics_all_time` (2026-10-01)

Base: detached `999be160` (worktree HEAD was `53316263`, not `71aed3e6`; checked out `999be160` as instructed).

## Items

| Item | Status | Where / tests |
|---|---|---|
| Client types + guard for optional `analytics_all_time` | DONE | `runLibraryClient.ts` `readAllTime(item)` -> `absent` / `refused{why}` / `summary`. Tests: `runLibrary.ea.test.tsx` (refusal `it.each`, malformed) |
| Card draws all-time sparkline (every served point) + trio, label "all time" | DONE | `RunLibrary.tsx` `AllTime`, `allTimePath`; polyline x by time, y min-max, no point dropped. Test: "draws every served point ... trio" (fixture `library_summary`), "allTimePath keeps every point" |
| Typographic minus, exact decimal in `title` | DONE | max DD `−0.47%`, test asserts no hyphen and title = served decimal |
| Fallback: block absent keeps today's rendering under ITS OWN label | DONE (no change to that path) | Test "no block: ... stitched OOS equity ... nothing says all time" |
| Non-ALL_TIME basis refused (typed absence, never relabelled) | DONE | `AllTimeRefused`: label "all time" + "not published", title `Not drawn: <why>.`, no `data-reason-code` (no FE-invented code). Also refused: non-null `rolling`, missing basis, malformed shape. Tests: 3 `it.each` + malformed |
| Both absent -> typed absence | DONE (unchanged) | existing placeholder `data-sparkline-placeholder` + reason code |
| Server-typed absence in the block | DONE | `state != AVAILABLE` -> "not published" + served `reason_code` in `data-reason-code`, sentence in title; per-figure null / sharpe fact NOT_PUBLISHED keep a typed cell with its code. Tests: two typed-absence tests |
| Lazy per-run sparkline not requested when the block is present | DONE | `useRunLibrary.ts` `requestSparkline` early-returns when `readAllTime(item).kind !== "absent"`. Tests: hook asks 1x without block, 0x with |
| Remove nothing the card shows today except what the block replaces | DONE | Only the sparkline slot is replaced. OOS SHARPE / DELTA DECAY / trades stats, claim, trail all kept |

Surprise / not done: **today's card renders no `last_30d` at all** (the generated Library item declares `last_30d?` but no FE code reads it). So "keep today's `last_30d` rendering" = keep the existing lazy "stitched OOS equity" sparkline with its own caption; I did NOT add a `last_30d` renderer (it would be new rolling UI that Bobby's rule removes). If a `last_30d` card is wanted as fallback, say so.

No decision rows applied (none needed for this slice).

## Words (card, R-WFO-020 at 1440)
Before: `STITCHED OOS EQUITY` (grey placeholder, series not published) + 3 stats = 8 words in the slot.
After (block present): `ALL TIME` / `24 pts` / `RETURN +1.66% SHARPE 4.34 MAX DD −0.47%` = 8 words; no new prose. Refused: `ALL TIME / not published`.

## Verification (run)
- `npx vitest run src/research/runLibrary` : 9 files, 186 tests passed (new file `runLibrary.ea.test.tsx`: 11 tests).
- `npx vitest run src/research` : 94 files, 2222 tests passed.
- `npx tsc -b --noEmit` : no errors outside features/roadmap-task-board.
- Browser (Vite :5332 -> :8095, Playwright `route` injecting the fixture's `library_summary` into R-WFO-020's Library item): 1440 and 660, before/after/refused. No overlap, no horizontal overflow, no empty gap; the card gains ~35 px height from the trio. At 660 the trio sits in the slot beside nothing else, wrapping like the other stats. The per-run `/sparkline` request for R-WFO-020 disappears when the block is injected (3 vs 4 requests at 1440).
- Screenshots (outside git): `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/ea/shots/{before,after,refused}-{1440,660}-{card,page}.png`.
- Not run: visual/lane suites, build, pre-commit hook (per brief).

## Contract notes for the coordinator (fold into the spec)
1. `library_summary` has no sampling descriptor, so the caption says only `N pts` and the tooltip says "points as served". Suggest adding `sampling:{source_observation_count, emitted_point_count, method}` (as in `curves.sampling`) so the card can disclose "N of M pts - extrema kept" like today's card does (CLAUDE.md section 8 invariant: a downsample says so).
2. `return_fraction` and `max_drawdown_fraction` are bare strings with no origin/locator; `sharpe` is a full Fact. For consistent typed absence per figure, suggest all three be Facts (`state/reason_code/value`). FE already handles a null string as "not published" without a code, which hides the reason.
3. Suggest `library_summary.sparkline` exposes `first_at_utc_ms`/`last_at_utc_ms` OR keep as-is (FE reads them from the first/last point).

## Backend requests
- Endpoint/field: `GET /api/v1/quantbt/runs` item `analytics_all_time` (= `enriched_analysis.library_summary`), ER-05 in `ENRICH_ANALYSIS_SERVICE_SPEC_2026-10-01.md`. Reason: S01 card all-time. Current effect: none served; FE keeps today's lazy sparkline. Smallest proposal: as the spec plus notes 1-2 above. FE now: reads it when present, refuses non-ALL_TIME.
