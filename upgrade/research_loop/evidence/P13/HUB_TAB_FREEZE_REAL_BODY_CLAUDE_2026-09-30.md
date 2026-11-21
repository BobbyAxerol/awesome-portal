# Hub tab Freeze — real body (Claude, 2026-09-30)

Base: `784bb19d` (integrate/research-loop-2026-09-30). Uncommitted worktree change, merged by the coordinator.

## Defect

Screen 04 (`/research/quantbt/runs/:runId/evidence#stage=freeze`) rendered `StagePreviewTab` for Stage 3. It drew a stage row and two boxes that said the panel was "not published — the Evidence Hub publishes this stage's timeline, not its content. Screen 07 reads it."

That statement is false. Screen 07 reads and draws that exact data (ordering, frozen θ*, digest chain, F4 binding, inspection). HiFi 04 `isFreeze` draws the full freeze body inside the tab.

## Fix (reuse, no rewrite)

- `FreezeDetail.tsx`: `FreezeScreen` takes a new optional `embedded` prop.
  - When it is set, the screen skips `SCREEN_FRAME`/`max-w-[1440px]`, the breadcrumb nav, the h1 and subtitle, and the header actions (copy evidence link and propose new attempt). The root carries `data-embedded="hub"`.
  - Everything else is unchanged: the blocked banner, strip, provenance, the freeze `ResearchPanel` body and the rules footer.
  - When `embedded` is false the output is identical to before (no new attribute or class).
- `FreezeRoute.tsx` takes `{ embedded? }`. When embedded it drops `RouteCursorNotice` (the hub already shows its own) and passes `embedded` through. It uses the same `useParams` runId, the same `useEvidenceCursor({stage:"freeze"})` hash cursor and the same `useFreeze`/`useRunIdentity` reads.
- New file `src/research/hubStageFreeze.tsx` exports `HubFreezeBody`, which is `<FreezeRoute embedded />` wrapped in a `data-hub-stage-body="freeze"` element.
- `EvidenceFlow.tsx` changes only in a local branch of the tab switch, `cursor.stage === "freeze"`:
  - It keeps the HiFi h2 `TabHeading` ("Stage 3 · Freeze — the hinge between Search and Execute") and the `open deep dive → 07 Freeze` link.
  - It then renders `<HubFreezeBody />`.
  - `StagePreviewTab` is unchanged for the other stages.

## Tests

- New `hubStageFreeze.test.tsx` (2 tests) runs on the canonical foundation fixtures (`e2e/research-foundation/evidence-hub.json`, `freeze-detail.json`, series; current-source refused as in `e2e/fixtures.ts`).
  - Hub on `#stage=freeze&fold=1`: `ordering`, `frozen-parameters`, `digest-chain` and `inspection` render inside `[data-panel='freeze']`. There is no breadcrumb, h1 or header actions. The heading and deep-dive link are present. The "publishes this stage's timeline" sentence and the stage shells are gone.
  - Standalone `/freeze`: no `data-embedded`, the `max-w-[1440px]` frame is there, and the breadcrumb, h1 and header actions render.
- `evidenceFlow.test.tsx` FE-S04-13 used to assert the two freeze placeholder shells. It now asserts that the shells are gone and the embedded body is mounted. The test is now async and lets the embedded read settle, as the console guard requires.
- Run: `hubStageFreeze`, `freezeDetail`, `freezeBinding.x2`, `evidenceFlow`, `evidenceFlow.rf05` gave **5 files, 220/220 passed**. The same result came back on two runs.
- `npx tsc -b --noEmit`: 0 errors outside `features/roadmap-task-board`.
- Not run: build, visual and lane suites, hook (out of scope for this task).

## Browser (Vite :5243 → preview API :8095, auto-login)

| Run | Width | Blocks in tab | Placeholder | SHA-256 (16) |
|---|---|---|---|---|
| R-WFO-017 `rrun_17f76212…` | 1440 | ordering, frozen-parameters, digest-chain, stage4-binding | gone | `d116caf0008e9d63` (top `83e81610c32431aa`) |
| R-WFO-017 | 660 | same, no horizontal overflow | gone | `39707657b4b8fe2f` (top `e74b89f6bbf82eba`) |
| R-P04-018 `rrun_464bf9c3dd8979af87e44388ea6910ef` | 1440 | ordering, frozen-parameters, digest-chain, inspection, stage4-binding | gone | `eb5a2bd59549863b` (top `ef45d0eee4372aff`) |
| R-P04-018 | 660 | same, no horizontal overflow | gone | `a68bcf0bf136ca19` (top `71fa86acf9ccd9e2`) |
| Deep dive `/freeze` WFO / P04 | 1440 | h1 "S3 · Freeze — ordering & integrity", breadcrumb, not embedded | — | `6e90c8d0b9a8d5ea` / `15f9a49354c39dc6` |
| HiFi 04 Freeze tab | 1440 | — | — | `16604ade447c09fb` |

The P04 run id given in the task (`rrun_464bf9c38b3cfb3fd8a36ce6d82ea68d`) does not exist. The run list returned `rrun_464bf9c3dd8979af87e44388ea6910ef`.

## Remaining differences vs HiFi

- HiFi shows three wall-clock timestamps with "✓ ORDER VERIFIED". Real runs publish no freeze or OOS-read clocks (`QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FREEZE_OR_OOS_READ_CLOCKS`, or NOT_ASSERTED on P04). The tab therefore draws the data-time axis with the typed absence, the same as Screen 07. This is a source gap, not a UI gap.
- The tab body is Screen 07's full body, which is longer than the HiFi tab. It adds the provenance strip, retained custody, the F4 binding, the what-if card, fold inspection, source absences and the "rules of this screen" footer. The HiFi's compact three-card layout is not reproduced; this fix reuses the deep dive and does not fork it.
- HiFi's "parameter / search range / range position / frozen θ* / what-if θ′" table maps to Screen 07's frozen-parameters table. The what-if column lives in the separate what-if card, as it does on Screen 07.
