# Screen 04 · Execute tab draws Screen 08's body (Claude, 2026-09-30)

Base: `784bb19d` (integrate/research-loop-2026-09-30). Uncommitted. The coordinator merges it alongside the split, search and freeze tabs.

## Defect

On `/research/quantbt/runs/:runId/evidence#stage=execute`, the Evidence Hub rendered `StagePreviewTab`. It showed four boxes (candle replay, event ledger, event inspector, why these params?), and each said "not published — the Evidence Hub publishes this stage's timeline, not its content. Screen 08 reads it." HiFi 04 (`isExecute`, `QuantBT 04 Evidence Flow.dc.html` around L580) draws the full stage body inside the tab. The sentence was also untrue, because Screen 08 reads and draws that same data.

## Fix (reuse only; nothing is inferred)

- `ExecuteDetail.tsx`: `ExecuteScreen` takes a new optional `embedded` prop. When it is set, the screen skips `SCREEN_FRAME` and `max-w-[1440px]`, the breadcrumb `nav`, the h1 and subtitle, and the copy-evidence-link header. Everything else is unchanged: the same reads, the same blocks and the same `data-*` attributes. The only addition is `data-embedded="hub"` on the root. With `embedded=false` the deep-dive route renders exactly as before.
- `ExecuteRoute.tsx`: `ExecuteContainer` is now exported and takes `embedded`, `hubFold` and `onHubFold`. The two fold props keep the hub's fold and the replay's fold in step. The hub keeps its own copy of the cursor, and the container writes the hash with `replaceState`, so neither would otherwise hear the other.
  - When the hub's fold stepper moves, the container calls `controller.retainedFold(segment)`. This is the same single read the body's own fold chips send.
  - When the body moves to a fold by itself (a fold chip, or play across folds), it calls the hub's `onFold`.
  - On the deep-dive route both props are absent, so both effects do nothing.
- New `src/research/hubStageExecute.tsx`: exports `HubExecuteBody({ runId?, fold?, onFold? })`, which renders `<ExecuteContainer embedded … />` keyed by run.
- `EvidenceFlow.tsx`: one import, plus one `cursor.stage === "execute"` branch at the tab switch. The branch keeps the HiFi h2 "Stage 4 · Execute — candle replay" and its subtitle, keeps the "open deep dive → 08 Execute" link, and then renders `HubExecuteBody`. `StagePreviewTab` is untouched and still renders split, search and freeze.

## Tests

- New `src/research/hubStageExecute.test.tsx`: **5/5 pass**. It uses canonical fixtures only: `research-current-source.replay.fold0`, `replay-transitions`, `replay-child-audit.fold0`, `research-replay.p04-real.first-window`, and `w3RealWfo` / `w3bRealWfo` (`hub_evidence`, `split`, `progress`, `requested_spec`). It covers:
  - On the retained WFO lane, `[data-panel='execute']` contains the candle chart and the transitions ledger, has no breadcrumb, h1 or header actions, has no `data-stage-shells`, and no longer contains the timeline sentence.
  - The P04 hub lane shows the route contract, the replay window, sample rows and the event ledger.
  - A hub fold step sends exactly one more `current-source/replay` read.
  - The deep-dive route still renders its breadcrumb, h1, header actions and frame, with no `data-embedded`.
  - The split tab does not mount the execute body.
- Run together with `executeReplay`, `executeCandleReplay`, `executePlayAcrossFolds`, `evidenceFlow` and `evidenceFlow.rf05`: **6 files, 267/267 pass**.
- `npx tsc -b --noEmit`: clean (outside `features/roadmap-task-board`).
- Not run, as instructed: build, visual and lane suites, pre-commit hook.

## Browser (Vite 5244 → preview API 8095, auto-login)

| shot | run | width | sha256[:16] |
|---|---|---|---|
| hub execute tab | R-WFO-017 `rrun_17f762128acf8c998ac7cc44d13f663f` | 1440 | `ff25a27ed908b7c3` |
| hub execute tab | R-WFO-017 | 660 | `a2032693164c499e` |
| hub execute tab | R-P04-018 `rrun_464bf9c3dd8979af87e44388ea6910ef` | 1440 | `e42d2a321c5ec9c2` |
| hub execute tab | R-P04-018 | 660 | `1a287a13c223843b` |
| deep dive `/execute` (unchanged header) | R-WFO-017 | 1440 | `85e669c816bb139e` |
| HiFi 04 Execute tab | file:// | 1440 | `5f541d1757838de0` |

- The P04 id in the task (`rrun_464bf9c38b3cfb3fd8a36ce6d82ea68d`) was wrong. The run list gives `rrun_464bf9c3dd8979af87e44388ea6910ef` for R-P04-018.
- There was no horizontal scroll at either width and no console errors.
- Fold sync was checked both ways in the browser. Moving the hub from fold_01 to fold_02 changed the body's window from 721–888 to 889–1056. Clicking the body's fold_01 chip set the hash back to fold=1 and the pill to fold_01.

## What the tab now shows vs HiFi

Present, drawn from real reads:

- execution contract and route contract notice
- stitched-account overview
- IS / OOS / HOLDOUT band
- candle replay with transition markers, position pane and equity pane
- transport with speeds, play across folds and causal reveal
- bar readout
- tiles: orders · fills · trades, transitions, fees, rejected, fold capital
- target transition ledger
- trade anatomy
- child audit
- trade blotter, MAE×MFE, cost timeline and route-aware facts, each with its reason code

On P04, the tab shows the retrospective-equity chart and drawdown, the sample ledger, and a panel for each absent capability.

Remaining differences vs HiFi:

1. HiFi puts the fold navigator and the layers column on the left of the chart. The body instead uses fold chips above the chart plus the hub's cursor pill. This is the existing Screen 08 layout.
2. HiFi's "execution contract" route picker (close_target_v2 / intrabar_bracket_v1 / event_lifecycle_v2) is a picker. Here it is a single published route chip, because a run has one route.
3. HiFi's "event inspector" and "why these params?" cards are not in the body. They were not in Screen 08 before this change either. The trade anatomy fills the inspector's role.
4. The body's "rules of this screen" footer still renders inside the tab. The task said to keep everything except the frame and header.
5. The body is still long. At 1440 it is about 2 screens for WFO; HiFi fits in about 1.2.
6. The body's route states "denied" (`StageDenied`) would still render the full-page denial inside the tab. This case was not seen on either run.
