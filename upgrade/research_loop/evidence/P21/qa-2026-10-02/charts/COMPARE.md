# Chart life wave — COMPARE (S13 Compare, S01 Run Library)

Base e9c64d1c. Not committed.

Files (git diff --stat, +643 / -69):
- apps/portal/frontend/src/research/CompareDetail.tsx (+177/-?) — MiniPlot, OverlayPlot (exported)
- apps/portal/frontend/src/research/RunLibrary.tsx (+210/-?) — SparkBars, AllTimeLine (exported)
- apps/portal/frontend/src/research/compareChartLife.tsx (new, 171) — draw-in gate, scrub hook, ScrubLayer
- apps/portal/frontend/src/research/compareChartLife.test.tsx (new, 154) — 9 tests

Design note: these charts are hand-drawn SVG (equitySvg geometry) with the "no number the server did not send" rule, not ECharts,
so life was added on that geometry (no EvidenceCharts.tsx change, no echarts.connect).

Interactive now:
- S13 overlay: clip-path draw-in 600ms cubicOut on first sight of a dataset only; nearest-point crosshair + dots + tooltip
  (UTC minute, both served equity strings, U+2212 minus, mono); pointer/touch-tap or focus + Left/Right/Home/End/Escape;
  sr-only live status; legend is a toggle (aria-pressed, hides line + tooltip row, scale unchanged).
- S13 mini small multiples: same draw-in and scrub (only when every served point has its own vertex).
- S01 all-time polyline: draw-in + scrub (UTC date + served value); S01 24-column bars: grow-in (staggered, capped) +
  scrub ("i of n" + served value; the series carries no per-column time, so none is invented).
- Motion off under prefers-reduced-motion and smokeMotionAllowed() (CSS + shouldDrawIn); polling re-renders never replay (dataset key set).
- Colours via var(--…) only.

Results: tsc (src/ clean; unrelated out-of-tree features/roadmap-task-board errors from missing react types in this env);
vitest compareChartLife + compareDetail* + runLibrary* + src/styles + disabledReason: 21 files, 343 tests pass.

NEEDS-SHARED: none.
NEEDS-BACKEND:
- S01 bars / last_30d: per-column at_utc_ms in /runs/{id}/sparkline so the tooltip can show a date.
- S13 overlay: not done — zoom/brush and a shared cursor (axis labels come from equitySvg, rescaling needs a labelled-window contract from the geometry owner).
- S13 overlay: no annotations (max-DD span, best/worst) — compare payload publishes none per run.
