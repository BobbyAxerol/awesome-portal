# F4 · S04_AN — D-AN-01 on the hub + window disclosure

Base 999be160. Files: `EvidenceFlow.tsx`, `evidenceClient.ts`, `EvidenceCharts.tsx` (additive), NEW `analyticsV2.tsx`, tests `evidenceFlow.{test,f1,f1b,rf05}.test.tsx` (moved), NEW `evidenceFlow.s04an.test.tsx` (13).
Screenshots (outside git): `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/f4/s04an/` (before-/after-, 1440 and 660, R-WFO-017 old seal, R-WFO-020 v2, R-P04-018; Summary + Claim). No horizontal overflow anywhere.

| # | Item | Status |
|---|---|---|
| 1 | "Strategy vs benchmark — all time" (rebased 100) + Beta/Corr/Sharpe/Sortino (+ benchmark return) cells | DONE — `StrategyBenchmarkFigure`, `strategyBenchmarkOption`. Tests s04an "replaces the rolling panel", "draws both rebased curves". Benchmark curve absent -> typed line with the fact's code. |
| 2 | Rolling-63 panel gone, series not requested | DONE — `RollingFigure/RollingHalf` deleted, rolling links removed from `retainedSeriesLinks`, kinds removed from `SERIES_KINDS`. Rolling-20 was already removed in F3 (AN-18). Old RF-05/E11 rolling tests rewritten to assert absence + no request. |
| 3 | Five hero tiles; WFO Sharpe all-time, fold mean as the foot | DONE — `HERO_TILES = 5`; foot "all time · engine-direct · fold mean 1.36". The other ten tiles are not drawn when retained or v2 present. Hub lane without v2 keeps its tiles. |
| 4 | Behavior block all-time, origin + scope in tooltip | DONE — `BehaviorV2`: Sortino, CAGR, PF, volatility, long/short hit, DD duration (+ "open"), skew, kurtosis, Sharpe decay, turnover, exposure L/S/F, episodes win rate/payoff/hold/max consec loss ("episodes — not audited trades"). Origin printed as served (engine-direct or portal-derived); `title` + `aria-label` per cell. |
| 5 | Old seal -> one typed line with served code | DONE — `AnalyticsAbsentLine` (R-WFO-017 shows `PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL`, served via `source_absences.benchmark`); v1 behavior facts that have a value stay. |
| 6 | `core.window_disclosure` in claim-window table (04-W) | DONE — IS "Σ N bars", OOS "n/m folds Σ N bars", Holdout "bars — denied" + code; per-fold list and "may overlap" in tooltip. Real: R-WFO-020 IS Σ 12,744 / OOS Σ 1,440 (9/9 folds); P04 Σ 1,464 / Σ 744. |
| 7 | Net OOS return tile = `net_oos_return` | ALREADY FIXED (F1; tests evidenceFlow.f1 "binds the served ... net_oos_return"). Verified in browser (+1.28% engine-direct). |

Value test uses the published `research-retained-analytics-v2.fixed.valid.json` and `research-evidence.window-disclosure.valid.json` (no copied real response). Absence path: the real retained capture (no v2), typed-absent facts (`AN29_RETAINED_MARKET_CLOSE_NOT_PUBLISHED`), absent/missing disclosure.

Decisions: v2 read from the retained lane first, else the Hub's `summary_analytics_v2`. Hub-lane runs with no v2 keep their old cells (their v3 facts are real).

Not done / notes
- Summary tab subtitle "5 of 15 metrics · 6 series" still counts the Hub's own metrics (pre-existing, `tabSub`); misleading on a retained run. Needs a one-line owner decision.
- R-WFO-020: `turnover_notional` and `sharpe_decay` come back typed absent from v2 while v1 had turnover 11,646.76; see backend request.
- P04 R-P04-018 Hub serves no v2 yet.

## Backend requests
- Endpoint/field: Evidence Hub (P04 lane) `summary_analytics_v2` for fixed-profile runs; Lý do UI: figure + Behavior all-time on S04 for P04; Ảnh hưởng: R-P04-018 shows old cells; Đề xuất: publish as on Current Source; Hiện FE: binds it as soon as present.
- Current Source v2 `behaviour.turnover_notional` / `metrics.sharpe_decay` on R-WFO-020 are NOT_PUBLISHED although v1 has turnover; Đề xuất: same source as v1 or a reason code; Hiện FE: typed absence with the served code.
