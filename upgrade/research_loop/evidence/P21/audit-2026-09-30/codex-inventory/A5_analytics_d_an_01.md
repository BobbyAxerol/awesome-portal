# Slice: Class F analytics under D-AN-01 (verified @ f7c76bae, read-only)

Paths are abbreviated as follows:
- RA = `apps/portal/backend/src/portal_api/services/research_retained_analytics.py`
- EM = `.../services/research_evidence_metrics.py`
- CSA = `.../services/current_source_artifacts.py`
- CH = `.../workers/research_child.py`
- AWF = `.../services/advanced_walkforward_runner.py`
- EF = `apps/portal/frontend/src/research/EvidenceFlow.tsx`
- RC2 = `apps/control-api/src/research/report-core-v2.ts`
- CS = `apps/control-api/src/research/current-source.service.ts`
- CMP = `apps/control-api/src/research/compare.service.ts`
- RL = `apps/control-api/src/research/run-library.service.ts`
- FGR = `upgrade/research_loop/evidence/FG/FG-backend-requests.md`
- U = `upgrade/UNIFIED_IMPLEMENTATION_PLAN.md`

**Ground facts that matter for every row:**
- **The data is already in the workers.**
  - Both workers hold the run's own market frame, so the benchmark needs no new HMD read:
    - WFO: `active_market.frame`, with `close`, at AWF:228-235. `_stitched_series` already writes `close`, `accepted_position`, `equity` and `returns` to `series/stitched.parquet` (AWF:607-623).
    - P04/P13 child: `market` (CH:547), with OHLC columns (CH:497).
  - These inputs are all in scope wherever `retained_analytics()` runs (RA:84-160): `scoped.equity`, `scoped.returns`, `scoped.daily_returns`, `scoped.positions`, `scoped.diagnostics.turnover` and `full_report(scoped)`.
- **Two lanes, uneven coverage.**
  - P04/P13 fixed lane: publishes Sharpe, Sortino, CAGR, bar profit factor and long/short hit rate ENGINE_DIRECT through `oos_analytics` (EM:54-61, 156-246; CH:657).
  - WFO retained lane (the default QuantBT lane): has only `retained_analytics.v1` (AWF:233). Its S04 tiles OOS_SORTINO, OOS_CAGR_FRACTION, OOS_PROFIT_FACTOR and OOS_LONG/SHORT_HIT_RATE fall to `default:` with `UI_RETAINED_LANE_HAS_NO_FIELD` (EF:2908, 3027-3028, TILE_ORDER EF:1404-1420). RA:106 already computes `report = full_report(scoped)` and throws those fields away.
- **Contract is not ready.**
  - `origin` enum is `ENGINE_DIRECT|SOURCE_DERIVED` only (`packages/contracts/schemas/research-retained-analytics.v1.schema.json:47`); there is no `PORTAL_DERIVED`.
  - Block budget is 16 KiB (RA:25); P13 receipt budget is 24 KiB (CH:58).
- **The ticket D-AN-01 points to does not exist.**
  - D-AN-01 is **untracked** (`git status`: `?? upgrade/research_loop/D-AN-01_PORTAL_ANALYTICS_ALL_TIME.md`).
  - Its ticket `BR-AN-01` in `CODEX_BACKEND_GAPS_2026-09-30.md` is not in the tree, and `research_portal_analytics.py` does not exist.
  - Nothing on the §13 board references D-AN-01.
- **Owner conflict.** D-AN-01 §4 assigns the backend to Codex. Memory "Research Loop P01–P21 ownership" says Claude owns FE+BE ≤P21. D-AN-01 is the later, explicit owner decision, so rows propose **Codex BE (BR-AN-01) · Claude FE**. Bobby should confirm.
- **Engine field set.** `full_report` fields include sharpe, sortino, cagr_pct, profit_factor, long/short_hitrate_pct, calmar, omega, drawdown_duration and avg_win_loss. It has **no** skew, kurtosis, beta, win rate or holding time (checked in the installed record copy `/tmp/quantbt-record-*/quantbt/metrics/performance.py:272-545`; that copy is 1.0.8, the pin is 1.1.1, and EM:54 relies on the same names).

**Formula conventions:**
- **Scope.** All formulas run on `scoped` (WFO: `scoped_result(scope='oos')`; FIXED: `oos_scoped_result` from P08.OOS.start). That is the same scope as `net_oos_return`, and it is "all time".
- **Returns.** `r_d` = UTC-daily equity returns (`scoped.daily_returns`); annualisation is 365.
- **Absences.** Each missing fact gets a typed `PORTAL_ANALYTICS_*` reason, never 0.
- **S01 exception.** Cards use last-30D: the same formulas on the trailing 30 UTC days of the OOS scope, labelled "last 30D".

## Table

| id | title | class | phase | status verified (evidence) | minimal fix | acceptance test/receipt | FE consumer (screen·field) | proposed owner |
|---|---|---|---|---|---|---|---|---|
| AN-01 | All-time OOS Sharpe on the WFO lane (hero) | F | P13 (S04), P18 (S09) | OPEN on WFO. The hero shows the fold **mean** (EF:2982-2990, "OOS Sharpe · fold mean"). The all-time value is computed at RA:106 but not emitted. P04 has it ENGINE_DIRECT (EM:190-195). Replaces CG-P13-03 (DELIVERED P04 only, `b1f76bd3`) and CG-FG-S04-05. | In v2, emit `metrics.sharpe` from `report` (keep ENGINE_DIRECT), using EM `engine_oos_metrics(scoped)` sentinel guards (reuse the function as is). | Unit: a known daily-return fixture gives the exact Sharpe; zero-variance and n<2 give typed absence. Contract fixture v2. FE: the WFO tile shows the all-time value, with the fold mean as foot. | S04 hero `OOS_SHARPE`; S09 headline `OOS_SHARPE` (RC2:561) | Codex BE · Claude FE |
| AN-02 | Sortino | F | P13, P18 | OPEN on WFO (`UI_RETAINED_LANE_HAS_NO_FIELD`, EF:3027). P04 AVAILABLE (EM:197-204). The S09 metric list has no Sortino on either lane (RC2:548-556). | Emit `report.sortino` with the EM guard (no downside gives `PORTAL_ANALYTICS_NO_DOWNSIDE_RETURNS`). | Fixture with no downside, fixture with known downside deviation; v2 schema test. | S04 tile `OOS_SORTINO`; S04 Behavior (D-AN-01 §3); S09 metrics | Codex BE · Claude FE |
| AN-03 | CAGR | F | P13, P18 | OPEN on WFO (EF:3027). P04 AVAILABLE with a clamp guard (EM:215-226). | Emit `report.cagr_pct/100` with the <1-day and clamp guards. Formula: `(E_end/E_start)^(365·86400/Δs)−1`. | Span <1 day gives an absence; clamp gives an absence; exact value on a 2-point fixture. | S04 tile `OOS_CAGR_FRACTION`; S09 | Codex BE · Claude FE |
| AN-04 | Profit factor (bar-return) | F | P13, P18 | OPEN on WFO. P04 AVAILABLE (EM:206-212). Note: the engine PF is Σ gains/|Σ losses| of **bar returns**. The episode PF is AN-14; the label must say which. | Emit `report.profit_factor` with the no-loss guard, labelled "bar returns". | No-loss fixture gives an absence; known ratio fixture. | S04 `OOS_PROFIT_FACTOR`; S04 Behavior PF; S09 | Codex BE · Claude FE |
| AN-05 | Hit rate long-bar / short-bar | F | P13, P18 | OPEN on WFO. P04 AVAILABLE (EM:228-237). The FE already says "per-bar hit rate, not trade win rate" (EF:1467). | Emit from `report` with the EM per-column guards. Formula: share of bars with pos>0 (or <0) where `pos_{t-1}·r_t>0`. | Fixture with no short bars gives `…NO_SHORT_EXPOSURE_BARS`; exact fraction. | S04 `OOS_LONG/SHORT_HIT_RATE_FRACTION`; Behavior | Codex BE · Claude FE |
| AN-06 | Annualised volatility | F | P13, P18 | Not published anywhere (grep: no `volatility` field in RA, EM or contracts). | `std(r_d, ddof=1)·√365`, PORTAL_DERIVED. | Known-σ fixture; n<2 gives an absence. | S04 Behavior; S09 metrics | Codex BE · Claude FE |
| AN-07 | Max drawdown duration / recovery | F | P13, P18 | MDD exists (`passport.max_drawdown_fraction` CS:397; P13 `derived.max_drawdown_fraction` CH:633). Duration is not published; the engine has `drawdown_duration` in `full_report`. | Prefer engine `drawdown_duration` (ENGINE_DIRECT). Otherwise longest peak-to-recovery span in days on `scoped.equity`; still underwater at the end gives `recovered=false`. | Fixture that recovers and one that never recovers. | S04 Behavior; S09 | Codex BE · Claude FE |
| AN-08 | Skew | F | P13 | Not published. HiFi tile "skew" is a placeholder (EF:3130-3138). With `summary` present, the tile set drops skew/kurt entirely (EF:3165). | `m3/m2^1.5` on `r_d` (population, bias-uncorrected; state the formula id). n<3 gives `PORTAL_ANALYTICS_TOO_FEW_DAILY_RETURNS`. | Symmetric fixture gives 0; known skewed fixture. | S04 Behavior "skew" | Codex BE · Claude FE |
| AN-09 | Excess kurtosis | F | P13 | Not published (as AN-08). | `m4/m2²−3` on `r_d`; n<4 gives an absence. | Normal-like fixture ≈0; known fixture. | S04 Behavior "excess kurtosis" | Codex BE · Claude FE |
| AN-10 | Beta and correlation vs benchmark (all-time) | F | P13, P18 | OPEN. WFO: `source_absences.benchmark = QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_BENCHMARK_SERIES` (CS:407), with seal coverage `benchmark: SOURCE_UNSUPPORTED_CONFIRMED` (CSA:725). P04: `P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK` (CH:641; EM:375,412). The FE tiles show those codes (EF:3156-3161, 3165). The inputs are **already in the worker**: `market.close` (CH:547) / `active_market.frame.close` (AWF:616-619), and the same frame is persisted in stitched.parquet. Replaces CG-FG-S04-05 (benchmark) and CG-P13-04 (beta half, never delivered). | Benchmark is buy-and-hold of the run's symbol/timeframe: `b_d` = UTC-daily close returns on the same `scoped` index. Beta = `cov(r_d,b_d)/var(b_d)`; corr = Pearson. Emit `benchmark_locator` (dataset/snapshot id, symbol, timeframe, close column, scope). Missing close, or `var(b)=0`, gives a typed absence. | Fixture where the strategy equals 2× the benchmark: beta=2, corr=1. Index-alignment test (same UTC days). No HMD call in the worker (reads the snapshot frame). | S04 Behavior "beta vs benchmark" / "corr vs benchmark"; new S04 "Strategy vs benchmark — all time" | Codex BE · Claude FE |
| AN-11 | Benchmark return + rebased curve | F | P13, P18 | OPEN. Hub metric `BENCHMARK_RETURN_FRACTION` is registry `origin: NOT_PUBLISHED` (`evidence-metric-registry.ts:39-40`); the WFO tile falls to `laneAbsence(benchmark)` (EF:3001-3002). No curve exists. | `close_last/close_first−1` over the scope. Curve: benchmark and strategy both rebased to 100, extrema-sampled to ≤24 points (reuse `extrema_indices`, EM:249). Registry v3 entry gets PORTAL_DERIVED. | Exact endpoint return; the curve keeps first/last/min/max; fits the 16 KiB/24 KiB budgets. | S04 tile `BENCHMARK_RETURN_FRACTION`; replaces S04 EChart 3; S09 metric | Codex BE · Claude FE |
| AN-12 | Exposure long / short / flat | F | P13 | PARTIAL. Only `exposure_fraction` (non-zero share) exists, labelled SOURCE_DERIVED (RA:122-133). The FE tile is "exposure" (EF:3143); HiFi wants "exposure L/S/F" (EF:3136). | Three fractions over `scoped.positions`: >0, <0, ==0. They must sum to 1. | Fixture with a known L/S/F mix; the sum-to-1 invariant. | S04 Behavior "exposure L/S/F" | Codex BE · Claude FE |
| AN-13 | Turnover | F (done, relabel only) | P13 | DONE: `turnover_notional` = Σ `diagnostics.turnover` over OOS (RA:134-142), bound (EF:3142). | Keep. Under v2 set origin to PORTAL_DERIVED, or keep SOURCE_DERIVED because the engine emits the per-bar series. Optionally add turnover/avg-equity per year. | Existing tests. | S04 Behavior "turnover" | Codex BE |
| AN-14 | Win rate, payoff, avg holding, max consecutive losses (episodes) | F | P13, P18, P20 | OPEN. RA:118-121 hard-types all four `QUANTBT_ROUTE_PUBLISHES_NO_AUDITED_TRADE_LEDGER`. S09 headline `WIN_RATE` absent on both lanes: RC2:565 (`QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS`) and RC2:789 (`P04_SOURCE_DID_NOT_PUBLISH_WIN_RATE`). The S13 common-window win rate is N/A (CMP:572). | Derive **position episodes** from `scoped.positions`: an episode runs from a sign change away from 0 until a return to 0 or a flip. Per episode: Π(1+r)−1 and duration. Win rate = share >0; payoff = mean win / |mean loss|; avg hold = mean duration in seconds; max consecutive losses = longest run of losing episodes. Label: "episodes, not audited trades". An episode open at scope end is flagged (excluded or counted per a stated rule). | Hand-built positions/returns fixture with known episodes, including a flip, a still-open episode and no episodes (absence). | S04 Behavior (win rate/payoff/avg holding/max consec loss); S09 headline `WIN_RATE`; S13 `WIN_RATE_FRACTION` | Codex BE · Claude FE |
| AN-15 | P04 Sharpe decay (IS→OOS) | F | P13 | OPEN and **stale-coded**. EM:245 still hard-codes `P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT`, but the IS boundary is now threaded into the child (`research_run_producer.py:478,491` → CH:773,943 → RA:150, where `in_sample_equity` is AVAILABLE). The FE shows the code (8 hits). | Compute IS Sharpe with engine `full_report` on the `[is_start, oos_start)` slice (same scoping helper), then decay = S_IS−S_OOS (the ENGINE_DIRECT inputs are descriptive). If `is_start` is missing, keep the absence. | P04 receipt shows decay AVAILABLE when `is_start_utc_ms` is present; absent otherwise. | S04 tile `OOS_SHARPE_DECAY` (P04 lane); S09 `DECAY_MEAN` (RC2:786, still `P04_SOURCE_DID_NOT_PUBLISH_DECAY_MEAN`) | Codex BE · Claude FE |
| AN-16 | Drop rolling Sharpe(63) | F (removal) | P13 | Delivered and bound, now superseded. RA:149, EM:292-326 and the S04 EChart 3 slot (EF:1897-1933), `SERIES_KINDS ROLLING_SHARPE_63` (`evidenceClient.ts:115`); `rolling_sharpe` absence (CS:414-416). Old id CG-P13-04 plus E11 (U:3782). | v2 omits it; v1 stays readable. FE replaces EChart 3 with "Strategy vs benchmark — all time" plus Beta/Corr/Sharpe/Sortino cells. | FE unit: no ROLLING_SHARPE_63 request on a v2 hub; v1 seal still renders. | S04 EChart 3 | Claude FE (BE: Codex v2 omit) |
| AN-17 | Drop rolling beta(63) | F (removal) | P13 | Never delivered: always a typed absence (EM:375,412; EF:1917-1920, 3100-3101). | Remove the kind from the FE list and the hub; beta becomes all-time (AN-10). | As AN-16. | S04 EChart 3 | Claude FE · Codex contract |
| AN-18 | Drop rolling 20-observation return | F (removal) | P13 | Delivered: CH:636, CSA:1796-1878; FE EF:3089, 3108, 3441-3445. | Hide EChart 5. Keep the server series for v1 compatibility, or deprecate it in the contract. | FE: panel absent; no series call. | S04 EChart 5 | Claude FE |
| AN-19 | S01 card last-30D sparkline + chips | F | P12 (S01) | OPEN. The sparkline is full OOS equity reduced to ≤24 points (`run-library.contract.ts:304-330`; FE `SPARK_LABEL` "stitched OOS equity", `RunLibrary.tsx:434`). The stats are OOS Sharpe/decay/trades over the full scope (RL:1180-1250). There is no "last 30D" label. | Add `last_30d` to v2 (equity points for the trailing 30 UTC days, return, Sharpe if n≥2). Library reads it. Label "last 30D". | Library read returns `last_30d`; a fixture run shorter than 30 days gives a stated partial window or an absence; card label visible. | S01 card sparkline + stat chips | Codex BE · Claude FE |
| AN-20 | S09 metric block reads the same v2 facts | F | P18 | OPEN. The S09 metric list on the WFO lane is 8 fixed rows (RC2:548-556). The P04 lane maps `hub.metrics` only (RC2:771-778), not the v3 performance metrics. D-AN-01 §3 wants the S04-equal all-time set. | Append the v2 facts (AN-01…AN-15) to `metrics[]` with their definition ids and PORTAL_DERIVED/ENGINE_DIRECT origin. | Report JSON/CSV export contains the facts; values equal S04 for the same revision. | S09 metric grid, headline | Codex BE (RC2 is control-api) · Claude FE |
| AN-21 | S09 P04 headline OOS Sharpe hard-coded absent | C | P18 | OPEN bug. RC2:785 returns `P04_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE` although the hub carries v3 `OOS_SHARPE` from `oos_analytics` (`evidence.service.ts:910-913`). | Read the v3 performance metric like RL:1233-1240 does. | P04 report headline equals the hub's `OOS_SHARPE`. | S09 headline `OOS_SHARPE` (P04) | Codex BE |
| AN-22 | S13 P04 OOS Sharpe shown absent | C | P20 | OPEN (confirms `8_visual_sweep…md:118`). CMP:366-370 returns a constant `P20_SOURCE_DID_NOT_PUBLISH_OOS_SHARPE`, while the Library shows the v3 value. | Bind the v3 `OOS_SHARPE` from the P13 projection. | Compare row equals the Library value for the same run. | S13 run row OOS Sharpe | Codex BE |
| AN-23 | S13 common-window Sharpe | F | P20 | OPEN, deliberately N/A: `P20_COMMON_WINDOW_SHARPE_NEEDS_SOURCE_ANNUALIZATION` (CMP:571). Under D-AN-01 Portal owns the annualisation (365). | Sharpe of the matched raw daily returns per side over the common window, PORTAL_DERIVED, 365. | Two-run fixture with a known common window. | S13 common-window `OOS_SHARPE` | Codex BE · Claude FE |
| AN-24 | Per-fold metrics | F (small) / closed | P13 | WFO: DONE. `fold_verdicts` carry S_OOS, decay and trades (engine) plus Portal path MDD and worst return (`current-source-facts.ts:148-166`; CG-P13-08 `b621c5af`). P04: structurally one IS/OOS window, so `P04_SOURCE_DID_NOT_PUBLISH_PER_FOLD_METRICS` (CH:644) is a design fact, not a gap. | Optional: per-fold return/vol/hit rate from observations × fold test windows. Relabel the P04 reason `NOT_APPLICABLE_SINGLE_WINDOW`. | Existing fold tests. | S04 per-fold table | Codex BE (optional) |
| AN-25 | WFO selected-candidate in-sample equity | E | P13 | OPEN, source limit. `QUANTBT_WFO_HAS_NO_SELECTED_CANDIDATE_IS_ACCOUNT` (RA:53-55; CS:413). A per-candidate IS account is engine output (re-running θ* is PnL, which D-AN-01 §1.4 forbids Portal to recompute). | QuantBT must publish the selected candidate's IS account, or keep the absence. | — | S04 EChart 1 IS leg | QuantBT (Bobby decides) |
| AN-26 | FIXED in-sample equity | closed | P13 | DONE. `_is_curve` AVAILABLE when `is_start_utc_ms` is threaded (RA:45-72; E11 accepted, U:3782). | — | — | S04 EChart 1 IS leg | — |
| AN-27 | S06 per-candidate max drawdown / pool | E (outside D-AN-01) | P15 | OPEN. `QUANTBT_CANDIDATE_LEDGER_DOES_NOT_PUBLISH_DRAWDOWN` (`current-source-pool.ts:48`; `SearchStageB.tsx:46,400`). D-AN-01 §3 keeps this with the engine (optimizer internals). | Engine publishes per-candidate DD in its ledger. | — | S06 pool/candidate DD | QuantBT |
| AN-28 | v2 contract + provenance fields | F (enabler) | P13 | OPEN. Schema v1 lacks `PORTAL_DERIVED`, `input_digest` per fact, `benchmark_locator` and `last_30d`. | `research.retained-analytics.v2` schema, OpenAPI, generated d.ts, canonical fixture. `origin: PORTAL_DERIVED`; per-fact `scope` + `source_locator`; block-level `input_digest` (already present at RA:152-156); typed `PORTAL_ANALYTICS_*` codes. v1 stays readable. | `contracts-test.sh` (regenerate, never hand-edit d.ts); size-budget test ≤16 KiB. | all of the above | Codex BE |
| AN-29 | Existing seals (v1 only) | F | P13 | OPEN. Old runs will lack v2. `stitched.parquet` already holds close, position, equity and returns for WFO runs (AWF:607-623), so a bounded one-shot backfill is possible. | Either a typed FE absence `PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL` (D-AN-01 §4), or an admin backfill job that writes `retained_analytics.v2.json` beside v1 without resealing. | FE unit on a v1 seal; if backfill: before/after digest unchanged for v1. | S04/S09/S01 on old runs | Claude FE; backfill = Bobby decision |

## STALE ledger rows

1. **CG-FG-S04-03 `EQUITY_IS`** (U:3701 "OPEN — request mới 2026-09-28"; `1_backend.md:73` "NOT STARTED").
   - FIXED is delivered through E11 `in_sample_equity` (RA:45-72).
   - WFO is a source limit (AN-25, class E).
   - Close as SUPERSEDED by E11 (agrees with `2_wiring.md:266`).
2. **CG-FG-S04-04 per-fold metrics** (U:3701 OPEN).
   - WFO is delivered by CG-P13-08 `b621c5af`/`29c607c8`.
   - P04 has a single window by design.
   - Close; relabel the P04 code as NOT_APPLICABLE.
3. **CG-FG-S04-05 benchmark/rolling/distribution/behaviour** (U:3701 OPEN, owner "Codex, source").
   - Wrong framing and owner under D-AN-01. Distribution and rolling Sharpe are delivered; rolling beta and rolling-20 are dropped.
   - Benchmark and behaviour become Portal-computed (AN-10…AN-14). Replace with BR-AN-01.
4. **CG-P13-04** (`CODEX_REQUESTS_FROM_CLAUDE_P11_P15.md:76` "DELIVERED `b1f76bd3` · CONSUMED").
   - Only rolling Sharpe(63) was delivered; beta was never delivered (EM:375).
   - Both are now superseded by D-AN-01. Mark it that way instead of DELIVERED.
5. **E11 row** (U:3782), which accepts "engine rolling Sharpe63" as a product surface: superseded by D-AN-01 (AN-16). Add an addendum.
6. **Benchmark absence codes attributed to the source** (the codes are stale; the table has no id for them):
   - `QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_BENCHMARK_SERIES` (CS:407).
   - `benchmark: SOURCE_UNSUPPORTED_CONFIRMED` (CSA:725).
   - `P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK` (CH:641, EM:375/412).
   - The benchmark input (the run's own close) is in the worker, so these become `PORTAL_ANALYTICS_*` or AVAILABLE.
7. **EM:245 `P13_IS_BOUNDARY_NOT_IN_CHILD_RECEIPT`**: the premise is false now that `is_start_utc_ms` is threaded (research_run_producer.py:478). See AN-15.
8. **`2_wiring.md:96,268`** ("S04-05 … the rest is bound"): incomplete. On the WFO lane, Sortino/CAGR/PF/hit-rate tiles are `UI_RETAINED_LANE_HAS_NO_FIELD` (EF:3027) although RA:106 computes them (AN-01…05).
9. **`1_backend.md:73`** "CG-FG-S04-01…07 NOT STARTED": 03 and 04 are done (items 1 and 2), and 05 is superseded.
10. **D-AN-01 itself is not on the ledger.**
    - The file is untracked.
    - `CODEX_BACKEND_GAPS_2026-09-30.md` / BR-AN-01 do not exist in the tree, and the §13 board has no BR-AN-01 row.
    - The owner split conflicts with the "Claude owns ≤P21 BE" memory rule; Bobby must confirm.
11. **FE copy**: "behavior — engine-published, UI renders" (EF:3175) and "segment OOS" contradict D-AN-01 (portal-derived, all time). Claude should change them when binding v2.
