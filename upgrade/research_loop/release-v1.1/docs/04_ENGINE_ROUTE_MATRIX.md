# 04 · Engine route matrix, formulas, params — quantbt v1.1.1

Portal reads all of this from the installed release (`er_quantbt_1_1_1`); support matrices are runtime truth (`arbitrage_support_matrix()`, `nautilus_support_matrix()`). A route absent from the matrix is never offered; a refused route renders disabled WITH the engine's reason.

## 1. Execution routes (screens 02 grid · 12 tab 2 · 08 panels)

| route | family | contract | backend | status | portal panels |
|---|---|---|---|---|---|
| signal_notional | signal | close_target_v2 | native_vectorized | DEFAULT | 04–09 core; orders/fills not_applicable |
| pct_equity | signal | legacy | vectorized | LEGACY | comparability only |
| intrabar_bracket | bracket | intrabar_bracket_v1 | numba · rust auto-promoted | RUST | 08 SL/TP lines, ⚠ ambiguity + same_bar_policy |
| dca_ladder | bracket | ladder (legacy) | vectorized | OK | 08 rung-by-rung basket chain |
| reactive | event | native_event_strategy | R0–R3B parity-certified | RUST | 08 wake-trace strip (audit_mode) |
| event_driven | event | event_lifecycle_v2/v3 facade | facade | OK | profiles research/optimize/audit |
| native_event_lifecycle | event | event_lifecycle_v2_next_bar_close · v3_next_open | event engine | OK | 08 OCO/parent-group chain |
| orders | tape | native_event v1 | event engine | OK | tape replay; Methodology collapses to tape span |
| fill_replay | tape | fill_replay_v1/v2 | numba · rust | OK | accounting-only banner |
| basket | multi | native_event package | event engine | OK | per-leg, frozen hedge ratio |
| arbitrage | multi | native_event package | event engine | 6/9 | 6 executable specs; 3 schema-only refused w/ reason |
| portfolio | multi | native_portfolio | matrix engine | OK | 6 modes × 8 sizing; exposure/margin in 09 |
| nautilus_dca_grid | validation | nautilus | adapter | EXP | parity vs dca_ladder |
| options | multi | native_option | — | DEFERRED | no portal params this round (decision) |

Cross-cutting metadata always rendered: `execution_contract`, `runtime authority` (resolved backend + promotion-table reason — never assumed from wheel presence), `report_level` (minimal/standard/audit/score — a missing fill ledger says WHY), `RuntimeBudgetV1` + fail-closed error codes (03).

## 2. Contract → engine cert (12 tab 3)

close_target_v2 L2 · intrabar_bracket_v1 L2 · fill_replay L1 (accounting) · event_lifecycle L2 · reactive R1–R3B L3 (parity vs R0) · native_portfolio L2 · nautilus L4 (external). Each row carries a **never-claims** clause (e.g. close_target_v2 never claims intrabar fills; fill_replay never claims signal quality).

## 3. WFO mode objectives (06 panel B2 · 12 tab 1 — rendered in KaTeX)

- mode_1_decay: `d_k(θ)=S_IS,k−S_OOS,k · J₁=S̄_OOS−λσ_d−γ·max(0,d̄) · λ=γ=0.5` — suspect: σ_d≫0 under pretty S̄_OOS; d̄<0 everywhere smells like leakage. Artifacts: SelectionTraceV1.fold_decay[], top_parameter_frequency.
- mode_2_sbb: `J₂=μ_boot−λ_sbb·max(0,d_boot)−η_sbb·σ_boot` (256 stationary paths, block 24; λ=.5, η=.25) — IS-only; never an OOS proof; backend proxy (forced).
- mode_3_flat_minima: `P_C=Q_C+w_m·M_C−w_s·V_C+w_n·log(1+|C|)` (ε=0.12) — medoid = real trial, centroid may be unevaluated; `fallback_reasons ≠ []` is a surface red flag.
- mode_4_is_only_robust: `T=M_T+w_q·Q_T−w_d·D_T · J₄=w_T·T+w_P·P−B−C` (6 IS shards; B/C flag-off render 0.000) — suspect: fine M_T, fat D_T.
- mode_5_full_robust: `J₅=robustness(full sample) · train≡test` — calibration only; `full_sample_used_for_selection=true` travels with every number; the string "OOS" may not appear anywhere on a mode-5 run.

## 4. Mode × schedule → claim (claim strip, 02 forecast, 06 header)

| schedule | claim | ceiling |
|---|---|---|
| per_fold_causal | STRICT_OUTER_OOS (nested inner folds; outer OOS read once after freeze) | B (A only via audited holdout unlock) |
| per_fold_decay | SELECTION_ADJUSTED_OOS (frozen pool ranked on OOS) | C |
| global | retrospective / compat (mode 5: NONE_FULL_SAMPLE_CALIBRATION) | C (mode 5: D) |

Invalid schedule × mode combos render struck-through with the reason — never hidden. OOS column is 4-state: selection input / retrospective / report only / withheld (+ n/a for mode 5).

## 5. Parameter declaration — sweep/pin (02 Parameters)

- Per param: **sweep** (low/high within declared bounds; narrowing allowed, exceeding refused) or **pin** (single value in bounds; step —; categorical pins a level).
- Sweep-dims ceiling 8 counts SWEPT params only; pinning frees room. >8 swept = blocking error.
- Kinds: suggest_int / suggest_float (step) / dynamic float (grid unbounded — shown as such, GridSampler refusal reason surfaced) / categorical.
- Attempts own their space: every attempt carries `space signature` `Np · k swept · m pinned` (10 spec lines); param ranges are per-attempt, never per-alpha.

## 6. Fold plan (02 preview · server-authoritative)

`N ≈ months(splitMode→dataEnd) / months(frequency)` for monthly/quarterly/semiannual/yearly; windowMode expanding|rolling. N<2 degenerate (red); N>20 budget warning (engine time, not screen space — portal renders 20–40 folds via compact gantt + windowed ledgers). Review rail always says "server derives the authoritative plan at preflight".

## 7. Optimizer full surface (docs/optimization.md, v1.1.1) — what 02's accordion declares

- **OptimizationConfig**: n_trials · early_stopping_rounds · early_stopping_min_trials (exploration floor) · seed (null = intentional unseeded TPE; int = audit-reproducible) · directions (multi-objective tuples, e.g. maximize/minimize/minimize) · show_progress_bar · **n_jobs = 1 LOCKED** (parallel rejected until dedupe is certified thread-safe).
- **SamplerConfig**: name ∈ {tpe, random, grid, cmaes, nsgaii} · kwargs {n_startup_trials, multivariate, group} · **constraint_mode="post_filter" REQUIRED** for random/grid/cmaes with formal constraints; tpe/nsgaii pass native. Grid refuses unbounded dynamic floats (reason surfaced).
- **Objectives**: SharpeObjective · ReportMetricObjective(value_metrics, constraints) — STRICT: a missing objective metric raises MissingOptimizationMetricError, never a silent 0.0 fallback.
- **Formal constraints** (Optuna convention ≤0 feasible): min_trades_constraint(100) · max_drawdown_constraint(25.0) — preferred over ad-hoc penalties; plus min_trades_per_year + trade_penalty_factor (trade-count overfit tax).
- **Evaluators**: GenericEndpointEvaluator (build_run_inputs + run_func) · PreparedSignalEvaluator · PreparedIntrabarEvaluator (IntrabarIntentTape.from_frame — no implicit shifting) · PreparedPortfolioEvaluator · Arbitrage/GridDCA/OptionPackage generic fallbacks. Prepared contexts are run-local, never global caches.
- **CandidateSelector**: best (diagnostic) · feasible_best · pareto_first · robust_plateau + RobustSelectionConfig {top_quantile .10, min_trades 100, max_drawdown_pct 25, neighborhood_radius .10, min_neighbor_count 8, seed_consensus 3, instability_penalty .25, worst_weight .25, drawdown_penalty 0}. With constraints and NO selector: best_params = raw Optuna, selected_params = None — infeasible high scores never become production params.
- **MultiSeedOptimization**: seeds (None, 41, 42, 43, 44); trial metadata quantbt_seed; robust_plateau can demand seed_consensus.
- **Warm start**: initial_trials evaluated first (tag quantbt_source=warm_start); baseline floor — selection worse than best feasible baseline ⇒ selected_params reset to baseline + search_regression=true (UI banner on 06). effective_params_builder for semantic dedupe of inactive branches.

## 8. WFO mode config topology (defaults the UI shows collapsed)

- shared: scoring_backend=endpoint (proxy only where forced) · candidate_selection_metric per mode · top_is_fraction 0.10 · optuna_trials · random_seed · optimization_schedule ∈ {per_fold_causal, per_fold_decay, global} (validity per mode).
- mode_1_decay: decay_lambda 0.5 · decay_gamma 0.5 · candidate_decay_* · selector robust_decay.
- mode_2_sbb: sbb_samples 256 · sbb_block_length 24 · sbb_simulation ∈ {stationary, regime, stress, garch} · λ_sbb 0.5 · η_sbb 0.25 · backend proxy (forced).
- mode_3_flat_minima: flat_top_fraction 0.10 · flat_eps 0.12 · flat_min_samples · flat_selector ∈ {medoid, centroid} · plateau_quantile 0.25.
- mode_4_is_only_robust: is_subperiods 6 · q25_weight 0.5 · dispersion_penalty 1.0 · temporal_weight 0.7 · plateau_weight 0.3 · bootstrap/complexity flags (off ⇒ rendered 0.000).
- mode_5_full_robust: sub-selector ∈ {full_robust, full_plateau_robust, full_temporal_robust, full_best} · full_sample_used_for_selection=true mandatory disclosure.
- Train-only selectors also available: is_plateau_robust · is_only_robust.

## 9. Result surface the portal renders (never recomputes)

result.show_metrics(scope=auto|full) · full_report() · tearsheet() · order_report / fills_report / export_orders / export_fills · search_diagnostics {top_parameter_frequency, baseline_rank, seed data} · robust_candidates (ranked plateaus: neighbor count, seed consensus, dispersion, medoid trial) · seed_results · baseline_trials · search_regression. Report bundle files: account/orders/fills/positions_report.csv, trade_log.csv, fill_log.txt, equity_curve.csv, returns.csv, metrics_summary.json, run_manifest.json, config.json, optional quantstats_daily.html — these are the artifact names screens 08/09/11 cite.
