# B10 IS_FACTS (base 8fc17a03, not committed)

Bound: optional `enriched_analysis.by_window.is` (return, Sharpe, max DD) on S04 hub (metrics tiles beside OOS tiles; `?window=is` shows the IS panel) and S09 (three IS cells in the all-time facts list). Each carries served scope/definition in its title (half-open bounds, coverage, source table, return_basis, origin, locator, digest). Never summed or substituted.
Typed absence: omitted IS (historical/WFO) -> `readIsFacts` returns the served `windows.is` state/reason; S04 IS window keeps the existing WindowAbsent; S09 adds no cell (baselines unchanged), exposes `data-is-facts="absent"` + `data-is-reason`.
Refused: malformed IS payload is refused locally (IS only; OOS block untouched).
IS Sharpe / decay: the IS payload has no decay field; none shown, none computed.
analyticsV2.tsx: no change (Behavior is OOS-only; no IS field). RunLibrary.tsx: NEEDS-SHARED (library card carries the by_window type; not shown, not mine).
Tests: src/research/enrichedIs.b10.test.tsx (canonical fixed-is + healthy fixtures).
Not mine: searchF2 + searchQaS06 pool frozen-at tests fail at this base (SearchDetail owner).
