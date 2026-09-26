/**
 * W3 (P13–P15 on real WFO data) · pure mappings from retained RS-02 fact
 * blocks to the named screen DTO parts: the S04 claim strip and per-fold
 * verdicts, the S05 fold anatomy and guards, the S06 trial facts, selection
 * roles and search probe.
 *
 * Nothing here reads a database or QuantBT. Every value is either copied
 * verbatim from a retained fact block, or — for the fold verdict only — the
 * output of the versioned server rule `research.fold-verdict.v1` (spec 04
 * §24) applied to retained facts. A fact the source did not publish becomes a
 * typed absence, never a zero.
 */

import type {
  CurrentSourceFacts,
  CurrentSourceFoldFacts,
  CurrentSourceTrialFacts,
} from "./current-source.payload";

type State = "AVAILABLE" | "NOT_PUBLISHED" | "NOT_APPLICABLE";

/** A seal retained before W3 has no fact blocks; every derived fact names that. */
export const RS02_SEAL_PREDATES_SOURCE_FACTS = "RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1";
export const RS02_ROW_PREDATES_FACTS = "RS02_RETAINED_ROW_PREDATES_W3_FACT_BLOCK_V1";
/** QuantBT's walk-forward Optuna study declares no constraints (E5). */
export const WALK_FORWARD_HAS_NO_CONSTRAINTS = "QUANTBT_WALK_FORWARD_STUDY_DECLARES_NO_CONSTRAINTS";

function outer(state: State, reasonCode: string | null) {
  return state === "AVAILABLE" ? { state, reason_code: null } : { state, reason_code: reasonCode };
}

export function namedFact(state: State, reasonCode: string | null) {
  const reason = state === "AVAILABLE" ? null : reasonCode;
  return { state, reason_code: reason, availability: outer(state, reason) };
}

function claimFact(value: string | boolean | null, sourceKey: string, missingReason: string, facts: CurrentSourceFacts | undefined) {
  if (!facts) return { value: null, source_key: sourceKey, ...namedFact("NOT_PUBLISHED", RS02_SEAL_PREDATES_SOURCE_FACTS) };
  if (value === null) return { value: null, source_key: sourceKey, ...namedFact("NOT_PUBLISHED", missingReason) };
  return { value, source_key: sourceKey, ...namedFact("AVAILABLE", null) };
}

/** CG-P13-07 (A11): the eight-chip claim strip, verbatim engine tokens. */
export function claimStrip(facts: CurrentSourceFacts | undefined) {
  const claims = facts?.claims;
  const execution = facts?.execution;
  return {
    schema_version: "research.current-source-claim-strip.v1" as const,
    validation_claim: claimFact(claims?.validation_claim ?? null, "walk_forward.validation_claim",
      "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_VALIDATION_CLAIM", facts),
    chronological_claim: claimFact(claims?.chronological_validation_claim ?? null, "walk_forward.chronological_validation_claim",
      "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_CHRONOLOGICAL_CLAIM", facts),
    causality_claim: claimFact(claims?.causality_claim ?? null, "walk_forward.causality_claim",
      "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_CAUSALITY_CLAIM", facts),
    oos_used_for_selection: claimFact(claims?.oos_used_for_selection ?? null, "walk_forward.oos_used_for_selection",
      "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_OOS_USE", facts),
    // The P10 Delta WFO profile tapes IS + OOS only (W1 design §2 row D):
    // there is no holdout segment to seal, so this is a declaration, not a gap.
    holdout: {
      value: null,
      source_key: "p10.delta_wfo_profile.segments",
      ...namedFact("NOT_APPLICABLE", "P10_DELTA_WFO_PROFILE_HAS_NO_HOLDOUT_SEGMENT"),
    },
    execution_contract: {
      ...claimFact(execution?.engine_id ?? null, "final_account.execution_contract.engine_id",
        "QUANTBT_FINAL_ACCOUNT_DID_NOT_PUBLISH_EXECUTION_CONTRACT", facts),
      signal_phase: execution?.signal_phase ?? null,
      fill_phase: execution?.fill_phase ?? null,
      accounting_certified: execution?.accounting_certified ?? null,
      execution_clock: execution?.execution_clock ?? null,
    },
    runtime_authority: {
      ...claimFact(execution?.final_account_backend ?? null, "final_account.backend",
        "QUANTBT_FINAL_ACCOUNT_DID_NOT_PUBLISH_RUNTIME_BACKEND", facts),
      final_account_runtime: execution?.final_account_runtime ?? null,
      scoring_backend: execution?.scoring_backend ?? null,
      native_prepared_wfo_policy: execution?.native_prepared_wfo_policy ?? null,
      // QuantBT decides native promotion internally but does not publish the
      // decision's reason on the walk-forward route.
      promotion_reason: namedFact("NOT_PUBLISHED", "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_NATIVE_PROMOTION_REASON"),
    },
  };
}

/** Spec 04 §24, versioned. Thresholds travel in the response so FE never holds them. */
export const FOLD_VERDICT_RULE = {
  version: "research.fold-verdict.v1" as const,
  pass: { oos_sharpe_min: "0.6", decay_max: "0.35", max_drawdown_min: "-0.15" },
  warn: { oos_sharpe_min: "0.3", decay_max: "0.6", max_drawdown_min: "-0.22" },
  score_basis: "QUANTBT_SELECTED_TRIAL_FOLD_METRICS_V1" as const,
  path_basis: "RETAINED_STITCHED_OBSERVATIONS_V1" as const,
};

type Criterion = "OOS_SHARPE" | "DECAY" | "MAX_DRAWDOWN";
type Verdict = "PASS" | "WARN" | "DRAG" | "NOT_EVALUATED";

export interface FoldVerdictInput {
  sourceOrdinal: number;
  foldId: string;
  testStartUtcMs: number | null;
  testEndUtcMs: number | null;
  facts: CurrentSourceFoldFacts | undefined;
}

/**
 * PASS: every criterion meets its pass bound. WARN: exactly one criterion
 * misses its pass bound and stays inside its warn bound. DRAG: anything else.
 * drag_target names the stage that owns the worst cause: decay → search,
 * otherwise drawdown → execute, an OOS-Sharpe-only drag → none.
 */
export function evaluateFold(oosSharpe: number, decay: number, maxDrawdown: number): {
  verdict: Exclude<Verdict, "NOT_EVALUATED">; failed: Criterion[]; dragTarget: "search" | "execute" | null;
} {
  const pass = FOLD_VERDICT_RULE.pass;
  const warn = FOLD_VERDICT_RULE.warn;
  const checks: Array<{ criterion: Criterion; passes: boolean; withinWarn: boolean }> = [
    { criterion: "OOS_SHARPE", passes: oosSharpe >= Number(pass.oos_sharpe_min), withinWarn: oosSharpe >= Number(warn.oos_sharpe_min) },
    { criterion: "DECAY", passes: decay <= Number(pass.decay_max), withinWarn: decay <= Number(warn.decay_max) },
    { criterion: "MAX_DRAWDOWN", passes: maxDrawdown >= Number(pass.max_drawdown_min), withinWarn: maxDrawdown >= Number(warn.max_drawdown_min) },
  ];
  const failed = checks.filter((check) => !check.passes);
  if (failed.length === 0) return { verdict: "PASS", failed: [], dragTarget: null };
  const criteria = failed.map((check) => check.criterion);
  if (failed.length === 1 && failed[0]!.withinWarn) return { verdict: "WARN", failed: criteria, dragTarget: null };
  const dragTarget = criteria.includes("DECAY") ? "search" : criteria.includes("MAX_DRAWDOWN") ? "execute" : null;
  return { verdict: "DRAG", failed: criteria, dragTarget };
}

const VERDICT_ORDER: Record<Verdict, number> = { DRAG: 0, WARN: 1, PASS: 2, NOT_EVALUATED: 3 };

export function foldVerdicts(
  folds: FoldVerdictInput[],
  facts: CurrentSourceFacts | undefined,
  selectedMeans: { meanOosSharpe: string | null; meanDecay: string | null },
) {
  const rows = folds.map((fold) => {
    const score = fold.facts?.oos_score ?? null;
    const path = fold.facts?.oos_path ?? null;
    const base = {
      source_ordinal: fold.sourceOrdinal,
      fold_id: fold.foldId,
      test_start_utc_ms: fold.testStartUtcMs,
      test_end_utc_ms: fold.testEndUtcMs,
      oos_sharpe: score?.oos_sharpe ?? null,
      is_sharpe: score?.is_sharpe ?? null,
      decay: score?.decay ?? null,
      oos_trades: score?.oos_trade_count ?? null,
      max_drawdown_fraction: path?.max_drawdown_fraction ?? null,
      return_fraction: path?.return_fraction ?? null,
      worst_return_fraction: path?.worst_return_fraction ?? null,
      worst_at_utc_ms: path?.worst_at_utc_ms ?? null,
      observation_count: path?.observation_count ?? null,
    };
    if (!fold.facts) {
      return { ...base, verdict: "NOT_EVALUATED" as const, failed_criteria: [], drag_target: null, reason_code: RS02_ROW_PREDATES_FACTS };
    }
    if (base.oos_sharpe === null || base.decay === null) {
      return { ...base, verdict: "NOT_EVALUATED" as const, failed_criteria: [], drag_target: null,
        reason_code: "QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS" };
    }
    if (base.max_drawdown_fraction === null) {
      return { ...base, verdict: "NOT_EVALUATED" as const, failed_criteria: [], drag_target: null,
        reason_code: "RETAINED_OBSERVATIONS_DO_NOT_COVER_FOLD_TEST_WINDOW" };
    }
    const evaluated = evaluateFold(Number(base.oos_sharpe), Number(base.decay), Number(base.max_drawdown_fraction));
    return { ...base, verdict: evaluated.verdict, failed_criteria: evaluated.failed, drag_target: evaluated.dragTarget, reason_code: null };
  });
  rows.sort((left, right) => VERDICT_ORDER[left.verdict] - VERDICT_ORDER[right.verdict]
    || (left.oos_sharpe === null ? 1 : right.oos_sharpe === null ? -1 : Number(left.oos_sharpe) - Number(right.oos_sharpe))
    || left.source_ordinal - right.source_ordinal);
  const count = (verdict: Verdict) => rows.filter((row) => row.verdict === verdict).length;
  const anyEvaluated = rows.some((row) => row.verdict !== "NOT_EVALUATED");
  const reason = !facts ? RS02_SEAL_PREDATES_SOURCE_FACTS
    : anyEvaluated ? null : "QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS";
  const state = anyEvaluated ? "AVAILABLE" as const : "NOT_PUBLISHED" as const;
  return {
    state,
    reason_code: reason,
    availability: outer(state, reason),
    rule: FOLD_VERDICT_RULE,
    order: "WORST_FIRST" as const,
    counts: {
      folds: rows.length,
      pass: count("PASS"),
      warn: count("WARN"),
      drag: count("DRAG"),
      not_evaluated: count("NOT_EVALUATED"),
    },
    mean_oos_sharpe: selectedMeans.meanOosSharpe,
    mean_decay: selectedMeans.meanDecay,
    rows,
  };
}

function windowFact(window: { bars: number | null; start_utc_ms: number | null; end_utc_ms: number | null } | undefined, reason: string) {
  if (!window || window.bars === null) {
    return { state: "NOT_PUBLISHED" as const, reason_code: reason, bars: null, start_utc_ms: null, end_utc_ms: null };
  }
  return { state: "AVAILABLE" as const, reason_code: null, bars: window.bars, start_utc_ms: window.start_utc_ms, end_utc_ms: window.end_utc_ms };
}

/** CG-P14-02 (A03/A09): one fold's QuantBT data-use windows. */
export function foldAnatomy(facts: CurrentSourceFoldFacts | undefined) {
  if (!facts || !facts.guards) {
    const reason = !facts ? RS02_ROW_PREDATES_FACTS : "QUANTBT_FOLD_TABLE_DID_NOT_PUBLISH_DATA_USE_WINDOWS";
    const absent = windowFact(undefined, reason);
    return {
      state: "NOT_PUBLISHED" as const,
      reason_code: reason,
      train_bars: facts?.train_bars ?? null,
      test_bars: facts?.test_bars ?? null,
      warmup: absent, label_horizon: absent, purge: absent, embargo: absent, validation: absent,
      cutoff_utc_ms: null,
      account_policy: null,
    };
  }
  const guards = facts.guards;
  const missing = "QUANTBT_FOLD_TABLE_DID_NOT_PUBLISH_THIS_WINDOW";
  return {
    state: "AVAILABLE" as const,
    reason_code: null,
    train_bars: facts.train_bars,
    test_bars: facts.test_bars,
    warmup: windowFact(guards.warmup, missing),
    label_horizon: windowFact(guards.label_horizon, missing),
    purge: windowFact(guards.purge, missing),
    embargo: windowFact(guards.embargo, missing),
    validation: windowFact(guards.validation, missing),
    cutoff_utc_ms: guards.cutoff_utc_ms,
    account_policy: guards.account_policy,
  };
}

function guardFact(value: number | string | boolean | null, facts: CurrentSourceFacts | undefined, missingReason: string) {
  if (!facts) return { value: null, state: "NOT_PUBLISHED" as const, reason_code: RS02_SEAL_PREDATES_SOURCE_FACTS };
  if (value === null) return { value: null, state: "NOT_PUBLISHED" as const, reason_code: missingReason };
  return { value, state: "AVAILABLE" as const, reason_code: null };
}

/** Run-level temporal guards and the inner-fold (nested validation) fact. */
export function splitGuards(facts: CurrentSourceFacts | undefined) {
  const guards = facts?.temporal_guards;
  let innerFolds: { value: number | string | boolean | null; state: State; reason_code: string | null };
  if (!facts || !guards) {
    innerFolds = { value: null, state: "NOT_PUBLISHED", reason_code: RS02_SEAL_PREDATES_SOURCE_FACTS };
  } else if (guards.inner_validation) {
    innerFolds = guards.inner_validation.inner_min_folds === null
      ? { value: null, state: "NOT_PUBLISHED", reason_code: "QUANTBT_INNER_VALIDATION_DID_NOT_PUBLISH_FOLD_COUNT" }
      : { value: guards.inner_validation.inner_min_folds, state: "AVAILABLE", reason_code: null };
  } else if (guards.inner_validation_published) {
    // QuantBT published `inner_validation: null`: nested validation is only
    // used by Mode 1 per_fold_causal, so this schedule has no inner folds.
    innerFolds = { value: null, state: "NOT_APPLICABLE", reason_code: "QUANTBT_SCHEDULE_HAS_NO_NESTED_INNER_VALIDATION" };
  } else {
    innerFolds = { value: null, state: "NOT_PUBLISHED", reason_code: "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_INNER_VALIDATION" };
  }
  return {
    label_horizon_bars: guardFact(guards?.label_horizon_bars ?? null, facts, "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_LABEL_HORIZON"),
    purge_bars: guardFact(guards?.purge_bars ?? null, facts, "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_PURGE_CONVENTION"),
    embargo_bars: guardFact(guards?.embargo_bars ?? null, facts, "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_EMBARGO_CONVENTION"),
    warmup_policy: guardFact(guards?.warmup_policy ?? null, facts, "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_WARMUP_CONVENTION"),
    // QuantBT publishes `warmup_bars: null` when the policy is `none`.
    warmup_bars: guards && guards.warmup_bars === null && guards.warmup_policy === "none"
      ? { value: null, state: "NOT_APPLICABLE" as const, reason_code: "QUANTBT_WARMUP_POLICY_IS_NONE" }
      : guardFact(guards?.warmup_bars ?? null, facts, "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_WARMUP_BARS"),
    inner_folds: innerFolds,
    oos_used_for_selection: guardFact(facts?.claims.oos_used_for_selection ?? null, facts,
      "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_OOS_USE"),
  };
}

/** S05 fold table: QuantBT's per-fold score of the selected parameters. */
export function foldScore(facts: CurrentSourceFoldFacts | undefined) {
  const score = facts?.oos_score ?? null;
  if (!score) {
    return {
      state: "NOT_PUBLISHED" as const,
      reason_code: facts ? "QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS" : RS02_ROW_PREDATES_FACTS,
      is_sharpe: null, oos_sharpe: null, decay: null, oos_trades: null,
    };
  }
  return {
    state: "AVAILABLE" as const,
    reason_code: null,
    is_sharpe: score.is_sharpe,
    oos_sharpe: score.oos_sharpe,
    decay: score.decay,
    oos_trades: score.oos_trade_count,
  };
}

function metric(value: string | null | undefined, reason: string | null) {
  return value === null || value === undefined
    ? { value: null, reason_code: reason ?? "QUANTBT_TRIAL_ROW_DID_NOT_PUBLISH_THIS_METRIC" }
    : { value, reason_code: null };
}

/** CG-P15-03/04: one ledger row's facts, typed absence for a pre-W3 row. */
export function trialFacts(facts: CurrentSourceTrialFacts | undefined, _ledgerMode: string | null) {
  // E5 correction (was: "the compact ledger drops per-fold constraint rows"):
  // QuantBT's walk-forward creates its Optuna study with no constraints
  // function (quantbt-engine 1.0.8/1.1.1 `walkforward.py`), so no trial on
  // this lane has a constraint or a feasibility to publish — the question
  // does not arise, whatever the ledger mode.
  const constraintReason = WALK_FORWARD_HAS_NO_CONSTRAINTS;
  if (!facts) {
    const absent = { value: null, reason_code: RS02_ROW_PREDATES_FACTS };
    return {
      state: "NOT_PUBLISHED" as const,
      reason_code: RS02_ROW_PREDATES_FACTS,
      stage: null,
      objective_kind: "NOT_PUBLISHED" as const,
      fold_scope: { kind: "NOT_PUBLISHED" as const, fold_id: null, reason_code: RS02_ROW_PREDATES_FACTS },
      source_trial_id: null,
      pruned: null,
      oos_seen_by_optuna: null,
      metrics: { mean_is_sharpe: absent, mean_oos_sharpe: absent, mean_decay: absent, std_decay: absent, temporal_score: absent },
      constraints: namedFact("NOT_PUBLISHED", RS02_ROW_PREDATES_FACTS),
      feasible: namedFact("NOT_PUBLISHED", RS02_ROW_PREDATES_FACTS),
      objective_components: { state: "NOT_PUBLISHED" as const, reason_code: RS02_ROW_PREDATES_FACTS, formula: null, terms: [] },
    };
  }
  const metrics = facts.metrics;
  return {
    state: "AVAILABLE" as const,
    reason_code: null,
    stage: facts.stage,
    objective_kind: facts.objective_kind,
    fold_scope: facts.fold_scope,
    source_trial_id: facts.source_trial_id,
    pruned: facts.pruned,
    oos_seen_by_optuna: facts.oos_seen_by_optuna,
    metrics: {
      mean_is_sharpe: metric(metrics.mean_is_sharpe, null),
      mean_oos_sharpe: metric(metrics.mean_oos_sharpe, metrics.oos_reason_code),
      mean_decay: metric(metrics.mean_decay, metrics.oos_reason_code),
      std_decay: metric(metrics.std_decay, metrics.oos_reason_code),
      temporal_score: metric(metrics.temporal_score, metrics.temporal_reason_code),
    },
    constraints: namedFact("NOT_APPLICABLE", constraintReason),
    feasible: namedFact("NOT_APPLICABLE", constraintReason),
    objective_components: facts.objective_components,
  };
}

/** Whether a trial's published fold scope covers `foldId` (the S06 fold filter). */
export function trialCoversFold(facts: CurrentSourceTrialFacts | undefined, foldId: string): boolean {
  if (!facts) return false;
  if (facts.fold_scope.kind === "ALL_OUTER_FOLDS") return true;
  return facts.fold_scope.kind === "FOLD" && facts.fold_scope.fold_id === foldId;
}

const CENTROID_SELECTORS = new Set(["is_plateau_robust", "full_plateau_robust", "plateau", "flat"]);

/** Raw IS best vs the selected candidate vs a centroid (CG-P15-03). */
export function selectionRoles(facts: CurrentSourceFacts | undefined, selection: { trial_id: string | null; objective: string | null }) {
  const search = facts?.search;
  const selected = {
    state: "AVAILABLE" as const,
    reason_code: null,
    trial_id: selection.trial_id,
    objective: selection.objective,
    objective_kind: facts ? "MODE_1_DECAY_J" as const : "NOT_PUBLISHED" as const,
  };
  if (!facts || !search) {
    const absent = { state: "NOT_PUBLISHED" as const, reason_code: RS02_SEAL_PREDATES_SOURCE_FACTS, trial_id: null, objective: null, objective_kind: "NOT_PUBLISHED" as const };
    return { raw_best_is: absent, selected, centroid: absent, raw_best_is_equals_selected: null, candidate_source_trial_ids: [] };
  }
  const rawBest = search.raw_best_is_trial_id === null
    ? { state: "NOT_PUBLISHED" as const, reason_code: "QUANTBT_LEDGER_HAS_NO_SCORED_IS_SEARCH_TRIAL", trial_id: null, objective: null, objective_kind: "NOT_PUBLISHED" as const }
    : { state: "AVAILABLE" as const, reason_code: null, trial_id: search.raw_best_is_trial_id, objective: search.raw_best_is_objective, objective_kind: "IS_MEAN_SHARPE" as const };
  const metric = search.candidate_selection_metric;
  const centroid = metric !== null && CENTROID_SELECTORS.has(metric)
    ? { state: "NOT_PUBLISHED" as const, reason_code: "QUANTBT_DID_NOT_PUBLISH_THE_PLATEAU_CENTROID", trial_id: null, objective: null, objective_kind: "NOT_PUBLISHED" as const }
    : { state: "NOT_APPLICABLE" as const, reason_code: "QUANTBT_SELECTOR_HAS_NO_CENTROID", trial_id: null, objective: null, objective_kind: "NOT_PUBLISHED" as const };
  return {
    raw_best_is: rawBest,
    selected,
    centroid,
    raw_best_is_equals_selected: search.raw_best_is_trial_id === null || selection.trial_id === null
      ? null : search.raw_best_is_trial_id === selection.trial_id,
    candidate_source_trial_ids: search.candidate_source_trial_ids,
  };
}

export function searchContract(facts: CurrentSourceFacts | undefined) {
  const search = facts?.search;
  return {
    optimization_mode: search?.optimization_mode ?? null,
    optimization_schedule: search?.optimization_schedule ?? null,
    n_studies: search?.n_studies ?? null,
    optuna_trials_scope: search?.optuna_trials_scope ?? null,
    optuna_trials_per_study: search?.optuna_trials_per_study ?? null,
    trial_ledger_mode: search?.trial_ledger_mode ?? null,
    candidate_selection_metric: search?.candidate_selection_metric ?? null,
    top_is_fraction: search?.top_is_fraction ?? null,
    top_is_k: search?.top_is_k ?? null,
    validation_claim: facts?.claims.validation_claim ?? null,
    chronological_claim: facts?.claims.chronological_validation_claim ?? null,
    oos_used_for_selection: facts?.claims.oos_used_for_selection ?? null,
    scoring_backend: facts?.execution.scoring_backend ?? null,
    availability: facts ? { state: "AVAILABLE" as const, reason_code: null }
      : { state: "NOT_PUBLISHED" as const, reason_code: RS02_SEAL_PREDATES_SOURCE_FACTS },
  };
}

/** CG-P15-04: diagnostics from a capability probe of the retained source. */
export function searchDiagnostics(facts: CurrentSourceFacts | undefined) {
  const search = facts?.search;
  const probe = search?.objective_probe;
  const objectiveComponents = !facts ? namedFact("NOT_PUBLISHED", RS02_SEAL_PREDATES_SOURCE_FACTS)
    : probe && probe.rows > 0 && probe.verified_rows === probe.rows ? namedFact("AVAILABLE", null)
      : probe && probe.verified_rows > 0 ? namedFact("AVAILABLE", null)
        : namedFact("NOT_PUBLISHED", "QUANTBT_OBJECTIVE_DID_NOT_RECOMPOSE_FROM_PUBLISHED_TERMS");
  const pruned = search?.pruned_trial_count ?? null;
  const pruneReasons = !facts ? namedFact("NOT_PUBLISHED", RS02_SEAL_PREDATES_SOURCE_FACTS)
    : pruned === 0 ? namedFact("NOT_APPLICABLE", "NO_TRIAL_WAS_PRUNED")
      : namedFact("NOT_PUBLISHED", "QUANTBT_PUBLISHES_A_PRUNED_FLAG_WITHOUT_A_REASON");
  return {
    candidates: namedFact("AVAILABLE", null),
    objective_components: objectiveComponents,
    prune_reasons: pruneReasons,
    importance: namedFact("NOT_PUBLISHED", "QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_PARAMETER_IMPORTANCE"),
    probe: {
      schema_version: "research.current-source-search-probe.v1" as const,
      objective_rows: probe?.rows ?? 0,
      objective_rows_recomposed: probe?.verified_rows ?? 0,
      pruned_trial_count: pruned,
      decay_lambda: search?.decay_lambda ?? null,
      decay_gamma: search?.decay_gamma ?? null,
      sampler: namedFact("NOT_PUBLISHED", "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_SAMPLER_TRACE"),
      warm_start: namedFact("NOT_PUBLISHED", "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_WARM_START_OR_BASELINE_TRIALS"),
      // QuantBT's DuplicatePruner prunes a repeated parameter set; it records
      // the pruned flag only, so a dedupe cannot be told apart from a prune.
      dedupe: namedFact("NOT_PUBLISHED", "QUANTBT_DUPLICATE_PRUNER_DOES_NOT_PUBLISH_A_DEDUPE_REASON"),
    },
  };
}
