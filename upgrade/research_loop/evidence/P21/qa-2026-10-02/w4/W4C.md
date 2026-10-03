# W4C — S05 Split, S06 Search, S07 Freeze, S08 Execute (fewer words)

Base bfbf5ca4. No commit. Primitives (`Absence.tsx`, `humanise.ts`, `formatValue.ts`) were absent in the base, so they were created here with the W4A signatures (marked `// W4A owns; identical contract`) and re-exported by `w4ShimW4C.ts`. On merge take W4A's versions.

## Words (main.innerText, 1440, preview data through a local vite proxy; before = :8095 build)
| Screen | R-WFO-023 | R-WFO-027 | R-P04-022 | R-P04-020 FAILED |
|---|---|---|---|---|
| S05 Split | 685 -> 557 (target 560) | 560 -> 487 | 343 -> 301 | 248 -> 214 |
| S06 Search | 4145 -> 2681 (target 2150) | 1005 -> 829 | 322 -> 289 | 321 -> 300 |
| S07 Freeze | 772 -> 531 (target 560) | 676 -> 503 | 411 -> 410 | 52 -> 51 |
| S08 Execute | 3027 -> 2010 (target 2750) | 2059 -> 1716 | 2128 -> 2045 | 309 -> 234 |

S06 residual is data: 100 ledger rows (id, S_IS, 8 parameter values) and 39 candidate rows; P04-022 S08 residual is the 744-observation sr-only table.

## Ledger
- S06 trial ledger uniform columns: done (seed / state / OOS caption line, params values-only under names, digest in row tooltip, `more` button).
- S06 candidate ledger: done (uniform note and equal "from trial" dropped, count printed once).
- S08 P04/FAILED single block: done (`Not published by this source`, 5 empty cards and disclosure removed, PnL card gone on every lane).
- Reason codes to tooltips: mostly done (Split Absent/NotApplicable/Guard/LaneAbsent, S06 gap/claim, S07 TypedAbsence keeps ONE sentence, S08 capability gaps/tiles/chips, orchestration clocks). Remaining: a few `P04_*` sentences from the server's own copy.
- S08 raw floats: done (`positionText`, 4 dp, exact in title); browser window fee sum and charged-bar count removed (`sumDecimalStrings` deleted). The sr-only candle table still carries served exact strings (not formatted).
- S05 theta flow per-fold S/trades: done (hidden data hooks only). Params chips to tooltip: done.
- S07 F1 repeated badge/candidate: done (printed once when identical). Child audit: S08 owns (collapsed details), S07 shows `child audit -> S4`.
- B1 pool freeze: done (orchestration clocks to one tooltip line, K printed once, feasible row dropped when n/a).
- Run failed banner: S08 done; S05/S06/S07 extended through `StageRunBar` (progress read gives the stage; "Run failed at S4 Execute."), active when the screen is in the "source has not reported" state. Not verified on the preview for S05-S07 (the build was measured before this last change).
- Fixed-profile wording: partly (one banner kept, 3 duplicates removed).
- Provenance strip once per screen: not changed (shared `ProvenanceStrip`, already once per screen; collapsing across screens is W4A/shared).
- S06 header: done (humanised claim labels, 30-word sentence and fold sentences to tooltips/one line).
- Transport keys: done (`[data-replay-section]`, tabbable, listener ignores everything else).
- Humanise on enums: done on all my files except `foldLabel` (`fold_01`, shared in researchFormat).

## Tests
`npx tsc -b --noEmit` clean (excluding roadmap-task-board). `vitest run src/styles src/execution/disabledReason.test.ts src/research`: 3316 tests, all pass; two unrelated tests (searchQaS06 D1, foundation Atlas) failed once under load and pass alone. New: `executeKeys.w4c.test.tsx`, a FAILED banner case in `splitDetail.w1.test.tsx`. About 70 assertions were rewritten to the new wording (listed by file in the diff).

## Expected visual baseline changes
Split (theta flow lanes, feeds-forward card gone, boundary card), Search (claim row, ledger, B1), Freeze (strip, F1 rows), Execute (contract card, tiles, absence block, child audit collapsed, blotter line). Laptop layout otherwise unchanged. Needs the pinned-image run by Bobby.

## NEEDS-SHARED
- `researchFormat.foldLabel` (`fold_01` -> `F1`), `ProvenanceStrip` collapse, `RunExitBar` banner copy ("Run failed at ..." could live in `runTerminalState`).
- Replace local primitives with W4A's.
