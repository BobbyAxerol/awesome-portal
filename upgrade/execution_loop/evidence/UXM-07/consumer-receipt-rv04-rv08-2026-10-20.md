# UXM-07 — Consumer receipt: RV-04 (chart cursor) and RV-08 (Table / Expand), 2026-10-20

Writer: Claude (FE writer). Source: `CLAUDE_FULLSTACK_REVIEW_2026-10-20.md` rows RV-04 and RV-08 (read only). This is the consumer's record, not an ACK of Bobby.
`FRONTEND_BACKEND_SYNC.md` and `UNIFIED_IMPLEMENTATION_PLAN.md` are not edited. Tier: **R1 only, R2 pending** (§10.10): focused vitest + `tsc` + one scratch Playwright run on a private port. No Docker, no visual suite, no baseline re-recorded.

## RV-04 · cursor kept by instant

| Item | Result |
| --- | --- |
| Reproduced | Yes, in jsdom: `EquityPanel` long to short with the readout pinned past the new end throws `TypeError: Cannot read properties of undefined (reading 's')` in render. Same for a Portfolio Overview series swap. A series that grows at the front moved the readout to another instant silently. A browser crash is **not** claimed: not run in a browser before the fix |
| Rule | `resolveCursor` (`charts/model.ts`): same instant keeps its place; an instant the new series skips but spans snaps to the nearest point (earlier on a tie); an instant outside the new extent releases the readout to the latest point. Why not plain reset: a keyboard user loses their place on every refresh. Why not clamp to an edge: it shows a point they never chose |
| Live region | Derived from the series on screen, not stored: a replaced value is re-said, a released cursor says nothing, Escape still says the latest |
| Tests | `charts/cursorStability.test.tsx` (15, written first: 13 red on the old code) + one Portfolio Overview series-swap test (red on old). Covers long to short, window, metric/unit, data replaced pinned and keyboard-driven, empty and back, unordered, front growth, Compare add/remove |
| Commit | `462a495d` |

## RV-08 · Table / Expand

| Item | Result |
| --- | --- |
| Component | `charts/ChartTools.tsx` + `charts/chartTable.ts` + `css/charts.css` (`exec-ct*`); exported from the barrel. Wraps any chart; the chart stays mounted (readout and width observer keep working) |
| Table | The SAME `SeriesPoint`s the chart draws (validated by `buildSeries`), one row per instant, newest first, one column per series, value = `showDecimal` of the published string (unit and currency as the chart prints it), exact string in `title`. A gap row says "No published value", an instant a series lacks says "No point at this time", an unreadable one says "Unreadable value". No new metric, unit, total or denominator; series are never summed. An unordered series is refused as the chart refuses it |
| Row cap | 50 first, "Show more" adds 50, bounded at 1,000 rows in the page; the count line reads "Showing N of M rows" (aria-live). Last page moves focus to the table region |
| Expand | Modal dialog over a scrim (full viewport on a phone), named by the chart label; Tab trapped; Esc closes (also from the plot), scrim click closes, focus returns to the Expand button; page scroll lock released on close and unmount |
| Mobile 390 | The table lives in a focusable named region (`role=region`, `tabindex=0`) that scrolls on its own when the columns do not fit (Compare, several series); the single Equity column fits at 322 px with no scroll; page overflow 0 measured. Horizontal scrolling of a multi-column table at 390 is covered by structure only, not by a browser run |
| Wired | Portfolio detail: Equity and NAV cards; Overview: fund Performance panel (`ManagerSeriesPanel tools`); Compare: the overlay (columns = the series drawn, none when the overlay is unavailable). Other chart panels opt in by wrapping with `ChartTools` (not touched: other writers' screens) |
| Browser (scratch, port 4196, BFF double) | Enter and Space on Table/Expand, Tab stays inside 14 presses, Esc returns focus, resize while expanded re-measures the chart (svg width <= dialog) at 1440 and 390; screenshots compared by eye with the HiFi (`portfolio.html` Table/Expand, rendered the same way). Deviation from HiFi: Expand is a modal over the page rather than widening the grid cell; no Export button (HiFi shows it disabled; this screen has none) |
| Gates | `tsc --noEmit` 0; vitest `charts` + `screens/{portfolios,series,compare,overview}`; v2Hygiene, failClosed, disabledReason, absentValues green |

## Not run

Visual suite and baselines (NOT_RUN, R2). Real-browser crash reproduction of RV-04 (NOT_RUN).
