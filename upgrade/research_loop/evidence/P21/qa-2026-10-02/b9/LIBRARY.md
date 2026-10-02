# B9 LIBRARY (S01) - handoff item 2
- SparkBars (24 columns): tooltip/live region now names the served UTC date per column. Source: last_30d.points[].at_utc_ms, or /sparkline `points` when one-for-one with `values` (same order and spelling; else ignored). Absent -> "i of n" unchanged.
- AllTimeLine already carried served at_utc_ms (unchanged).
- `analytics_all_time.return_basis`: parsed (malformed -> ignored); a short "first→last" tag beside the "return" label, title = served definition_id + scope, start/end equity, span, "not the last-30D return and not the final account". Three numbers never merged. Absent -> baseline-identical.
- Tests: runLibrary.b9.test.tsx (fixture-derived).
- NEEDS-SHARED / NEEDS-BACKEND: none. compareChartLife.tsx needed no change.
