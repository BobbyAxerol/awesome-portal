# CG-FG-S03-01 — admitted planned-fold windows on Progress

Status: BACKEND_ACCEPTED at 4ad9ac59; S03 frontend binding/browser receipt pending.

The same workspace-scoped P11 Progress read now projects `run.planned_folds` from the immutable P08 `preflight_manifests.topology.folds`. It returns bounded outer-OOS `fold`, `test_start_utc_ms`, `test_end_utc_ms` and a typed `NOT_PUBLISHED` when a historical manifest never declared a plan. The already-published `declared_folds.count` remains unchanged. A malformed JSON plan, invalid date range or count mismatch fails closed with `RESEARCH_PROGRESS_CONFLICT`; no HMD scan or additional source call occurs.

These are **admitted planned boundaries**, not source-observed fold execution. The source-reported `progress.folds[]` remains the execution fact; Screen 03 may overlay the two only with their distinct labels. P08 legitimately emits `fold_000` for the fixed run; the public `fold` ordinal is the 1-based Progress display position, not a rewritten source ID.

Contract: `ProgressRunIdentity.planned_folds` is required in the regenerated `research-progress.d.ts`. Canonical fixture: `packages/contracts/fixtures/research-progress.planned-folds.valid.json`. Claude should bind the Gantt planned rail to this field and preserve existing reported-fold visuals; no frontend code changed here.

Focused proof: Control API repository/service 25/25, contracts 6/6, Control API build pass. The repository test covers real `fold_000` shape and malformed/count-mismatch refusal. Full hook: contracts 203/203; Control API 1390 pass/1 skip.

Exact-HEAD isolated preview Control API image `sha256:987cc537d3bc0eca45ae50e8133b69631b1984b9f182b506ac8037964d5d0980` at `4ad9ac59`: authenticated GET Progress on real R-WFO-020 (`rrun_3258a4c450816129d2d285f25b801061`) returned HTTP 200, `run.declared_folds.count=9` and `run.planned_folds.state=AVAILABLE` with nine admitted UTC windows. The first window starts 1780272000000 and the last ends 1785456000000; source-reported fold count was separately nine. No synthetic row or source restart was used.
