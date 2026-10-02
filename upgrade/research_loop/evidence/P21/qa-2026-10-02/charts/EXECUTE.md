# Chart life — EXECUTE (S08)

Files: ExecuteCandleReplay.tsx (+94), ExecuteDetail.tsx (+61/-), executeCandleReplay.test.tsx (+53). ExecuteMarkers.tsx and SplitBand.tsx unchanged (marker hover card, glyphs, pulse and reduced-motion already existed).

- Candle replay (lightweight-charts): crosshair readout strip above the chart = UTC, O/H/L/C, accepted position, equity of the bar under the pointer; falls back to the playhead bar (setCrosshairPosition already follows the transport). Fade-in entry once on ready, guarded by smokeMotionAllowed + prefers-reduced-motion. Absent candle = "not published".
- Equity pane (ECharts): 600ms cubicOut via chartMotion() (off for reduced motion / webdriver / _fixtures). Tooltip adds drawdown at the same x. Retained lane draws target-transition triangles at real ordinals; tooltip names the transition.
- Drawdown pane: tooltip with drawdown + equity. Position pane: step lines, tooltip accepted/target, null target = "not published".
- Tests: tsc clean for src/; 9 vitest files (234 tests) incl. src/styles + disabledReason pass.

NEEDS-SHARED: charts/EChart.tsx exposes no echarts.connect group, so equity/drawdown/position share the transport playhead overlay but not a native hover crosshair or dataZoom/Reset zoom; needs a `group` prop on EChart.
NEEDS-BACKEND: none.
