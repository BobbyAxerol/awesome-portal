# Chart life wave — EVIDENCE group (2026-10-02)

Files: src/research/EvidenceCharts.tsx (+414/-), EvidenceFlow.tsx (+85/-, MonthlyHeat + span wiring), enrichedAnalysis.ts (+30, DrawdownSpan/deepestSpan), evidenceCharts.life.test.tsx (new, 13 tests).
Diff (tracked): 3 files, 470 insertions, 59 deletions.

Interactive now
- Equity / underwater / strategy-vs-benchmark / rolling / rolling Sharpe: 600ms cubicOut draw-in on first mount only (chartMotion + entryAnimation gate; reduced-motion and smokeMotionAllowed -> animation:false); inside dataZoom (drag pan, shift+wheel, pinch); keyboard (+ - arrows 0); "Reset zoom" only when zoomed; focusable group with aria-label; snapping cross-hair.
- Link groups via echarts.connect: evidence-equity (equity + underwater), evidence-curves (strategy/benchmark + underwater strip). One crosshair, one zoom window per group.
- Tooltips list every series at the hovered x (equity: OOS/IS/pre-OOS + OOS drawdown), U+2212, mono, typed absence "not published".
- Deepest published drawdown episode shaded (markArea, depth label) on equity, underwater, strategy curve; tooltip names its dates while inside it.
- Rolling Sharpe zero line. Histogram: bars grow in, hover emphasis, typed absence line for mean/median/VaR.
- Monthly strip: cells fade in once (WAAPI, motion-gated), hover/focus/tap tooltip (month, value, exact, coverage), best/worst served month ringed.
- Exports for other groups: chartMotion(), entryAnimation(), axisTooltipHtml(), zoomWindow(), CHART_GROUP, deepestSpan().

Gates: tsc (portal frontend) clean; vitest src/research src/styles src/execution/disabledReason.test.ts = 141 files / 2984 tests pass.

NEEDS-SHARED: none strictly. (Linking finds the chart instance via echarts.getInstanceByDom because charts/EChart.tsx exposes no group/onReady prop; an optional `group` prop there would be cleaner.)
NEEDS-BACKEND: histogram mean / median / VaR are not published; rolling Sharpe/return series are not mounted on the S04 hub page (components exist, updated, unused there).
Not done: no screenshots (no browser run); visual baselines not run.
