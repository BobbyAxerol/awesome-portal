# SPLIT chart-life notes (2026-10-02, base 267b8934, uncommitted)

Files: apps/portal/frontend/src/research/{SplitDetail.tsx, NewRun.tsx, splitDetail.test.tsx, dataDeclaration.test.tsx}

Interactive now (useReadout: hover, focus, tap):
- S02 Split window timeline: each segment (warmup/IS/outer OOS) is focusable (tabIndex 0, accessible name incl. served role); a reserved 14px line under the track prints label, UTC start -> end, bars, served role (the segment's own title text).
- S02 fold train/test bars: each fold row (button) prints fold id, train and test UTC windows and served counts (fold.anatomy.train_bars/test_bars when AVAILABLE, else "bars not published"; a missing span reads "train/test not published"). Reserved 14px line under the rows. Segments inside the button are not made focusable (nested interactive).
- NewRun data-declaration timeline had no readout: added the same (coverage + IS/OOS/Holdout/span segments focusable; reserved 13px line).
- Layout: the readout line is always rendered at fixed height, nowrap + ellipsis, so no shift.
- Behaviour change: window Links (IS / outer OOS) tabIndex -1 -> 0 so segments are keyboard reachable.

Not done: the hatched holdout segment (HoldoutBlock) keeps its title only, no readout.

NEEDS-BACKEND: none (fold counts come from fold.anatomy; absent = "bars not published").
NEEDS-SHARED: none.

Tests: tsc clean (excluding roadmap-task-board); vitest 16 files / 568 tests pass (split, hubStageSplit, newRun*, chartLife, styles, disabledReason, dataDeclaration).
