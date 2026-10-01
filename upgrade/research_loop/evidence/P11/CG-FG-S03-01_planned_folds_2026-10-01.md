# CG-FG-S03-01 — admitted planned-fold windows on Progress

Status: backend candidate; exact-HEAD preview receipt and full hook pending.

The same workspace-scoped P11 Progress read now projects `run.planned_folds` from the immutable P08 `preflight_manifests.topology.folds`. It returns bounded outer-OOS `fold`, `test_start_utc_ms`, `test_end_utc_ms` and a typed `NOT_PUBLISHED` when a historical manifest never declared a plan. The already-published `declared_folds.count` remains unchanged. A malformed JSON plan, invalid date range or count mismatch fails closed with `RESEARCH_PROGRESS_CONFLICT`; no HMD scan or additional source call occurs.

These are **admitted planned boundaries**, not source-observed fold execution. The source-reported `progress.folds[]` remains the execution fact; Screen 03 may overlay the two only with their distinct labels. P08 legitimately emits `fold_000` for the fixed run; the public `fold` ordinal is the 1-based Progress display position, not a rewritten source ID.

Contract: `ProgressRunIdentity.planned_folds` is required in the regenerated `research-progress.d.ts`. Canonical fixture: `packages/contracts/fixtures/research-progress.planned-folds.valid.json`. Claude should bind the Gantt planned rail to this field and preserve existing reported-fold visuals; no frontend code changed here.

Focused proof: Control API repository/service 25/25, contracts 6/6, Control API build pass. The repository test covers real `fold_000` shape and malformed/count-mismatch refusal. Full-hook and exact-HEAD real-run values will be appended after commit.
