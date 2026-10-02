# Chart life wave - GROUP=REPORT (S09)

Base e9c64d1c. Not committed. Files: ReportAllTime.tsx, ReportDetail.tsx, reportCharts.life.test.tsx (new),
enrichedAnalysis.b6.test.tsx and reportDetail.qa.test.tsx (polyline counts: drawdown strip added).
analyticsV2.tsx: unchanged (it only lays out cells; the S04 chart arrives as a node, owned by EvidenceCharts).

Decision: S09 stays static SVG/DOM (spec 09 §18: a sheet that prints, no chart library on this route). Life is
added in SVG/HTML; no echarts import, route chunk unchanged.

Interactive now
- Equity (ReportDetail): entry reveal (clip, 600ms cubicOut, first mount only); existing probe crosshair now also
  spans the underwater strip; +/- keys and Zoom in/out buttons on a shared time window (equity + underwater);
  Shift+Arrow pans; Reset zoom appears only when zoomed; caption states the zoomed range; sr table keeps all points.
- All-time curve: reveal; one crosshair over strategy / benchmark (own scale) / served drawdown strip; tooltip = UTC
  time, strategy, benchmark (nearest sample date if different), drawdown, episode; focusable, arrows/Home/End/Esc,
  +/- zoom, Shift+Arrow pan, Reset zoom only when zoomed; drawdown episodes shaded start to recovery, hovered/focused
  table row lights its band; new served-curve drawdown strip.
- Distribution: bars grow once (staggered); pointer / arrow-key tooltip with exact edges + count; dimmed siblings.
- Months: fade-in stagger; best / worst full month ringed + named in the sub-line (selection of served values).
- Motion off under reduced-motion / smokeMotionAllowed(); CSS also guards prefers-reduced-motion and print.

NEEDS-SHARED: none.
NEEDS-BACKEND: return_distribution publishes no mean / median / VaR (histogram markers); drawdown_episodes carry
no per-episode label/regime; no served IS/OOS/holdout bands on the all-time curve (windows.* are state only).
Not done: touch pinch / drag-brush zoom (buttons + keys only); screenshots not taken.
