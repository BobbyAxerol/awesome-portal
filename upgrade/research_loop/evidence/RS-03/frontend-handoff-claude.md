# RS-03 frontend handoff — rich S04–S08 integration after backend acceptance

**Backend state:** `BACKEND_INDEPENDENT_ACCEPTANCE_COMPLETE · FEATURE_DARK`.
This is a precise consumer handoff. It does not authorize a feature toggle,
deployment, source query, backend rewrite, runtime activation or a generic
replacement screen.

## Read first

1. [RS-03 backend report](./phase-report.md), [RS-02 report](../RS-02/phase-report.md),
   [RS-02 matrix](../RS-02/field-action-coverage-matrix.md), and the Unified
   [RS-03 row](../../../UNIFIED_IMPLEMENTATION_PLAN.md#rl-rs-03).
2. Astra audit §5 RS-03 and original P13–P17 handoffs.
3. Every S04–S08 HiFi HTML/spec in a browser at **1280px and 660px** before
   changing a corresponding product component.

Regenerate and consume only the typed RS-02 named operations:

```bash
npm --prefix packages/contracts run generate:research-current-source
```

`researchCurrentSourceEvidenceGetV1`, `researchCurrentSourceEvidenceSeriesGetV1`,
`researchCurrentSourceSplitGetV1`, `researchCurrentSourceSearchGetV1`,
`researchCurrentSourceFreezeGetV1`, and `researchCurrentSourceReplayGetV1`.

## Required implementation discipline

- Retain the full rich S04–S08 shell, cards, navigation, drawers, dense
  tables, fold anatomy and replay layout. Replace only a panel's contents with
  a typed fact/absence state. Never replace an entire product route with a
  generic unavailable envelope.
- Render backend exact decimal strings and UTC milliseconds faithfully. Do not
  perform financial math, cursor decoding, source fallback, fake timer
  verification or an engine/worker/Execution/Trading-System call in the
  browser.
- Search/Replay cursor failures are a one-time discard-and-refetch event; no
  retry loop. Never send table kind, ordinal, source locator or artifact path.
- Use `MATCH` in S07 only as the documented Portal-retained receipt match;
  never label it source-artifact-byte, causal, broker or strategy certification.
- S08 remains retrospective model data. Local animation must stay within a
  loaded bounded page and never request one frame at a time.
- Keep `NOT_PUBLISHED`, `NOT_APPLICABLE`, pending/legacy, `400/401/403/404/409/503`
  rich and typed inside the affected panel. A missing fact is not a reason to
  create a fixture or hide a source-supported card.

## Browser receipt required before P18

For each S04–S08 route/tab: map `HiFi element / interaction / product
component → generated operation + field → typed state → browser assertion`.
Cover 1280/660, loading, available/partial, source-gap, pending/legacy,
400/401/403/404/409/503, deep link/hard refresh, resource switch,
keyboard/focus/overflow, S06 nonselected pick, S07 integrity label and S08
playback without per-frame requests. Label fixture, synthetic contract corpus,
actual API and pixel evidence separately. Do not re-record global baselines.

When complete, return a single RS-03 packet listing exact commits, operations,
screenshots, test command/results, browser evidence and any source-supported
fact that is truly absent. A missing contract request must be `CG-RS03-*` with
the exact screen field, source locator and expected typed shape; do not alter
RS-02/RS-03 backend files without coordinating first.
