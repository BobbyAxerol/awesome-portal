/**
 * E5 · Screen 06 Stage B (HiFi audit rows 6.7, 6.8, 6.10, 6.11) — the pool a
 * retained Delta WFO run froze, the per-fold decay of θ*, and each
 * candidate's max drawdown, from the sealed ledger and nothing else.
 *
 * What QuantBT records, and therefore what this module may publish
 * (quantbt-engine 1.0.8 and 1.1.1, `walkforward.py`):
 *
 *  - The top-IS pool is `ranked[:K]` over the completed IS trials (not
 *    pruned, finite objective), with `K = top_is_k` when configured, else
 *    `⌈n × top_is_fraction⌉` capped to `[1, n]` (`_candidate_count`). The
 *    engine records no K; it records the pool itself — every pool member is
 *    re-scored as one `oos_candidate_selection` candidate row. For the modes
 *    whose candidate list is exactly the pool (Mode 1 with a ranking
 *    selector) the retained candidate rows are therefore K. Anywhere else the
 *    ledger does not isolate the pool, and K is a typed absence.
 *  - K is published only when the retained pool size agrees with QuantBT's
 *    own rule applied to published inputs. The rule is evaluated the way the
 *    engine evaluates it (float64 `ceil(n × fraction)`), so a disagreement
 *    means the ledger and the rule do not describe the same pool — and then
 *    nothing is published, rather than either number.
 *  - The walk-forward Optuna study is created without a constraints function,
 *    so "feasible (constraint ≤ 0)" does not arise on this lane: a typed
 *    NOT_APPLICABLE, never a count equal to the trial count.
 *  - Candidate records carry per-fold Sharpe, decay and trade counts, and no
 *    drawdown. The one drawdown on the lane is the stitched OOS path of the
 *    selected parameters (the run passport); under the `global` schedule
 *    that is exactly the selected candidate's own path, so it is published
 *    for that candidate alone, tagged with its source.
 */

import { z } from "zod";
import { POOL_FREEZE_CLOCK_ABSENT } from "./p11-stage-events";
import { DELTA_CAUSAL_INNER_PROFILE } from "./delta-causal-inner.profile";

import type { CurrentSourceFacts, CurrentSourceFoldFacts, CurrentSourceTrialFacts } from "./current-source.payload";
import { RS02_ROW_PREDATES_FACTS, RS02_SEAL_PREDATES_SOURCE_FACTS, WALK_FORWARD_HAS_NO_CONSTRAINTS } from "./current-source-facts";

export const SEARCH_POOL_RULE = "research.current-source-search-pool.v1" as const;

export const POOL_REASONS = {
  sealPredatesFacts: RS02_SEAL_PREDATES_SOURCE_FACTS,
  rowPredatesFacts: RS02_ROW_PREDATES_FACTS,
  noConstraints: WALK_FORWARD_HAS_NO_CONSTRAINTS,
  poolNotIsolated: "QUANTBT_CANDIDATE_LEDGER_DOES_NOT_ISOLATE_THE_TOP_IS_POOL",
  poolRuleNotPublished: "QUANTBT_DID_NOT_PUBLISH_THE_TOP_IS_POOL_RULE",
  poolDisagrees: "RETAINED_POOL_SIZE_DISAGREES_WITH_THE_QUANTBT_POOL_RULE",
  noSelection: "QUANTBT_DID_NOT_PUBLISH_A_SELECTION",
  noFoldScore: "QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS",
  candidateDrawdown: "QUANTBT_CANDIDATE_LEDGER_DOES_NOT_PUBLISH_DRAWDOWN",
  pathNotThisCandidate: "STITCHED_OOS_PATH_IS_NOT_ONE_CANDIDATE_UNDER_THIS_SCHEDULE",
  perFoldStudies: "PER_FOLD_STUDIES_HAVE_NO_SINGLE_RUN_GLOBAL_POOL",
} as const;

/** Mode 1 selectors that rank the pool and return it unchanged (`_select_is_candidate_records` → `top`). */
const POOL_IS_CANDIDATE_LIST_MODES = new Set(["mode_1_decay"]);
const SELECTORS_THAT_PREPEND_A_PICK = new Set(["is_only_robust", "is_plateau_robust"]);

const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const Decimal = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const FoldId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/);
const Count = z.number().int().nonnegative().max(1_000_000);
const State = z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]);

export const PoolCountSchema = z.object({
  state: State,
  value: Count.nullable(),
  reason_code: Reason.nullable(),
  source: z.enum(["RETAINED_TRIAL_LEDGER", "RETAINED_CANDIDATE_LEDGER", "RETAINED_SELECTION"]).nullable(),
}).strict();

export const PoolRuleSchema = z.object({
  state: State,
  reason_code: Reason.nullable(),
  /** Which of QuantBT's two branches sized the pool. */
  expression: z.enum(["CEIL_N_TIMES_TOP_IS_FRACTION", "CONFIGURED_TOP_IS_K"]).nullable(),
  /** n: completed IS trials the pool is ranked from. */
  n: Count.nullable(),
  top_is_fraction: Decimal.nullable(),
  configured_top_is_k: Count.nullable(),
  /** The rule's K; equal to the retained pool when `state` is AVAILABLE. */
  k: Count.nullable(),
}).strict();

export const FoldDecaySchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: Reason.nullable(),
  basis: z.literal("QUANTBT_SELECTED_TRIAL_FOLD_METRICS_V1").nullable(),
  rows: z.array(z.object({
    fold_id: FoldId,
    source_ordinal: z.number().int().nonnegative().max(2_000_000),
    is_sharpe: Decimal.nullable(),
    oos_sharpe: Decimal.nullable(),
    /** QuantBT's own `d = S_IS − S_OOS` for this fold, verbatim. */
    decay: Decimal.nullable(),
  }).strict()).max(256),
}).strict();

export const SearchPoolSchema = z.object({
  schema_version: z.literal(SEARCH_POOL_RULE),
  /** Legacy shape: P11 S4 completion is not an engine pool-freeze clock. */
  frozen_at_utc_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  frozen_at_source: z.literal("P11_STAGE_COMPLETED_S4_EVENT").nullable().optional(),
  frozen_at_reason_code: z.enum(["P11_S4_COMPLETION_EVENT_NOT_RETAINED", POOL_FREEZE_CLOCK_ABSENT]).nullable().optional(),

  trials_evaluated: PoolCountSchema,
  /** Completed, unpruned IS trials with an objective: what the pool is ranked from. */
  scored_unpruned: PoolCountSchema,
  feasible: PoolCountSchema,
  top_is_k: PoolCountSchema,
  rule: PoolRuleSchema,
  reevaluated: PoolCountSchema,
  /** Where the re-evaluation read: every outer fold, one fold, or not published. */
  reevaluation_scope: z.enum(["ALL_OUTER_FOLDS", "FOLD", "PER_FOLD_STUDY", "NOT_PUBLISHED"]),
  selected: PoolCountSchema,
  per_fold_decay: FoldDecaySchema,
}).strict();

export const CandidateDrawdownSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  value: Decimal.nullable(),
  reason_code: Reason.nullable(),
  source: z.literal("RETAINED_STITCHED_OOS_PATH").nullable(),
}).strict();

export type SearchPool = z.infer<typeof SearchPoolSchema>;
export type CandidateDrawdown = z.infer<typeof CandidateDrawdownSchema>;

export interface PoolTrial { trialId: string; state: string; objective: string | null; facts: CurrentSourceTrialFacts | undefined }
export interface PoolCandidate { candidateId: string; objective: string | null; facts: CurrentSourceTrialFacts | undefined }
export interface PoolFold {
  foldId: string; sourceOrdinal: number; facts: CurrentSourceFoldFacts | undefined;
  causalSelection?: { scope: "OUTER_FOLD_SELECTION"; study_id: string; selected_trial_id: string; parameters: Record<string, string> };
}

function count(value: number, source: NonNullable<z.infer<typeof PoolCountSchema>["source"]>) {
  return { state: "AVAILABLE" as const, value, reason_code: null, source };
}

function absent(state: "NOT_PUBLISHED" | "NOT_APPLICABLE", reason: string) {
  return { state, value: null, reason_code: reason, source: null };
}

/** QuantBT `_candidate_count`, evaluated as the engine does (float64 ceil). */
export function quantbtPoolSize(n: number, fraction: string | null, configuredK: number | null): number | null {
  if (n <= 0) return 0;
  if (configuredK !== null) return Math.max(1, Math.min(n, configuredK));
  if (fraction === null) return null;
  return Math.max(1, Math.min(n, Math.ceil(n * Number(fraction))));
}

function isSearchTrial(trial: PoolTrial): boolean {
  // A pre-W3 row carries no stage; the trial ledger holds Optuna trials only.
  return trial.facts === undefined || trial.facts.stage === "is_search";
}

function scoredUnpruned(trial: PoolTrial): boolean {
  const pruned = trial.facts?.pruned ?? trial.state === "PRUNED";
  return !pruned && trial.state === "COMPLETE" && trial.objective !== null;
}

export function searchPool(input: {
  sourceAdapterId?: string;
  sourceProfileId?: string;
  facts: CurrentSourceFacts | undefined;
  trials: readonly PoolTrial[];
  candidates: readonly PoolCandidate[];
  folds: readonly PoolFold[];
  selectedTrialId: string | null;
}): SearchPool {
  const { facts, trials, candidates, folds } = input;
  const search = facts?.search;
  const perFoldStudies = search?.optimization_schedule === "per_fold_causal";
  const searched = trials.filter(isSearchTrial);
  const eligible = searched.filter(scoredUnpruned);
  const rowsHaveFacts = trials.every((trial) => trial.facts !== undefined);

  const trialsEvaluated = count(searched.length, "RETAINED_TRIAL_LEDGER");
  const scored = rowsHaveFacts ? count(eligible.length, "RETAINED_TRIAL_LEDGER") : absent("NOT_PUBLISHED", POOL_REASONS.rowPredatesFacts);
  const feasible = facts ? absent("NOT_APPLICABLE", POOL_REASONS.noConstraints) : absent("NOT_PUBLISHED", POOL_REASONS.sealPredatesFacts);

  const pooled = candidates.filter((candidate) => candidate.facts?.stage === "oos_candidate_selection");
  const sourceIds = new Set(pooled.map((candidate) => candidate.facts?.source_trial_id).filter((id): id is string => typeof id === "string"));
  const reevaluated = candidates.length > 0 && pooled.length === candidates.length
    ? count(pooled.length, "RETAINED_CANDIDATE_LEDGER")
    : candidates.every((candidate) => candidate.facts === undefined)
      ? absent("NOT_PUBLISHED", POOL_REASONS.rowPredatesFacts)
      : absent("NOT_PUBLISHED", POOL_REASONS.poolNotIsolated);
  const scopes = new Set(pooled.map((candidate) => candidate.facts?.fold_scope.kind ?? "NOT_PUBLISHED"));
  const nativeScope = scopes.size === 1 ? ([...scopes][0] as SearchPool["reevaluation_scope"]) : "NOT_PUBLISHED";
  // QuantBT's native FOLD token identifies an outer study, while its
  // candidate objective was evaluated on INNER validation. Name that public
  // scope only for the exact admitted pair and retained study/fold join.
  const causalPair = input.sourceAdapterId === DELTA_CAUSAL_INNER_PROFILE.current_source.source_adapter_id
    && input.sourceProfileId === DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id;
  const retainedInnerStudies = pooled.length > 0 && pooled.every(candidate => candidate.facts !== undefined
    && candidate.facts.study_id !== null && candidate.facts.fold_scope.fold_id !== null
    && folds.some(fold => fold.foldId === candidate.facts!.fold_scope.fold_id
      && fold.causalSelection?.scope === "OUTER_FOLD_SELECTION"
      && fold.causalSelection.study_id === candidate.facts!.study_id));
  const reevaluationScope = causalPair && perFoldStudies && nativeScope === "FOLD" && retainedInnerStudies
    ? "PER_FOLD_STUDY" as const : nativeScope;

  // K: the retained pool, published only when it is the whole pool and QuantBT's rule agrees.
  let topIsK: SearchPool["top_is_k"];
  let rule: SearchPool["rule"];
  const fraction = search?.top_is_fraction ?? null;
  const configured = search?.top_is_k ?? null;
  const expression = configured !== null ? "CONFIGURED_TOP_IS_K" as const : fraction !== null ? "CEIL_N_TIMES_TOP_IS_FRACTION" as const : null;
  const ruleK = rowsHaveFacts ? quantbtPoolSize(eligible.length, fraction, configured) : null;
  const ruleBase = { expression, n: rowsHaveFacts ? eligible.length : null, top_is_fraction: fraction, configured_top_is_k: configured, k: ruleK };
  const isolated = search !== undefined
    && search.optimization_mode !== null && POOL_IS_CANDIDATE_LIST_MODES.has(search.optimization_mode)
    && !(search.candidate_selection_metric !== null && SELECTORS_THAT_PREPEND_A_PICK.has(search.candidate_selection_metric))
    && reevaluated.state === "AVAILABLE"
    && sourceIds.size === pooled.length
    && [...sourceIds].every((id) => eligible.some((trial) => trial.trialId === id));
  if (perFoldStudies) {
    // Each outer study freezes its own inner-validation pool. ceil(total N
    // * fraction) is not the engine's per-study rule, nor is summed K one K.
    topIsK = absent("NOT_PUBLISHED", POOL_REASONS.perFoldStudies);
    rule = { state: "NOT_PUBLISHED", reason_code: POOL_REASONS.perFoldStudies,
      expression: null, n: null, top_is_fraction: fraction, configured_top_is_k: configured, k: null };
  } else if (!facts) {
    topIsK = absent("NOT_PUBLISHED", POOL_REASONS.sealPredatesFacts);
    rule = { state: "NOT_PUBLISHED", reason_code: POOL_REASONS.sealPredatesFacts, ...ruleBase };
  } else if (!isolated) {
    topIsK = absent("NOT_PUBLISHED", reevaluated.state === "AVAILABLE" ? POOL_REASONS.poolNotIsolated : reevaluated.reason_code ?? POOL_REASONS.poolNotIsolated);
    rule = { state: "NOT_PUBLISHED", reason_code: topIsK.reason_code, ...ruleBase };
  } else if (expression === null || ruleK === null) {
    topIsK = absent("NOT_PUBLISHED", POOL_REASONS.poolRuleNotPublished);
    rule = { state: "NOT_PUBLISHED", reason_code: POOL_REASONS.poolRuleNotPublished, ...ruleBase };
  } else if (ruleK !== pooled.length) {
    topIsK = absent("NOT_PUBLISHED", POOL_REASONS.poolDisagrees);
    rule = { state: "NOT_PUBLISHED", reason_code: POOL_REASONS.poolDisagrees, ...ruleBase };
  } else {
    topIsK = count(pooled.length, "RETAINED_CANDIDATE_LEDGER");
    rule = { state: "AVAILABLE", reason_code: null, ...ruleBase };
  }

  const selected = perFoldStudies ? folds.length > 0
    && new Set(folds.map(fold => fold.foldId)).size === folds.length
    && new Set(folds.map(fold => fold.causalSelection?.study_id)).size === folds.length
    && folds.every((fold) => fold.causalSelection?.scope === "OUTER_FOLD_SELECTION"
      && fold.causalSelection.study_id.length > 0 && fold.causalSelection.selected_trial_id.length > 0
      && Object.keys(fold.causalSelection.parameters).length > 0)
    ? count(folds.length, "RETAINED_SELECTION") : absent("NOT_PUBLISHED", POOL_REASONS.noSelection)
    : input.selectedTrialId !== null ? count(1, "RETAINED_SELECTION") : absent("NOT_PUBLISHED", POOL_REASONS.noSelection);

  const scores = [...folds].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal);
  const perFoldDecay: SearchPool["per_fold_decay"] = scores.length > 0 && scores.every((fold) => fold.facts?.oos_score)
    ? {
        state: "AVAILABLE",
        reason_code: null,
        basis: "QUANTBT_SELECTED_TRIAL_FOLD_METRICS_V1",
        rows: scores.map((fold) => ({
          fold_id: fold.foldId,
          source_ordinal: fold.sourceOrdinal,
          is_sharpe: fold.facts!.oos_score!.is_sharpe,
          oos_sharpe: fold.facts!.oos_score!.oos_sharpe,
          decay: fold.facts!.oos_score!.decay,
        })),
      }
    : {
        state: "NOT_PUBLISHED",
        reason_code: scores.some((fold) => fold.facts === undefined) ? POOL_REASONS.rowPredatesFacts : POOL_REASONS.noFoldScore,
        basis: null,
        rows: [],
      };

  return {
    schema_version: SEARCH_POOL_RULE,
    trials_evaluated: trialsEvaluated,
    scored_unpruned: scored,
    feasible,
    top_is_k: topIsK,
    rule,
    reevaluated,
    reevaluation_scope: reevaluationScope,
    selected,
    per_fold_decay: perFoldDecay,
  };
}

/**
 * One candidate's max drawdown. The selected candidate under the `global`
 * schedule is the only candidate whose OOS path is retained (the stitched
 * passport path); every other candidate is a typed absence.
 */
export function candidateDrawdown(input: {
  candidate: PoolCandidate;
  selection: { trial_id: string | null; objective: string | null };
  schedule: string | null;
  passportMaxDrawdown: string;
}): CandidateDrawdown {
  const { candidate, selection } = input;
  if (!candidate.facts) return { state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.rowPredatesFacts, source: null };
  const isSelected = selection.trial_id !== null
    && candidate.facts.source_trial_id === selection.trial_id
    && candidate.objective === selection.objective;
  if (!isSelected) return { state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.candidateDrawdown, source: null };
  if (input.schedule !== "global" || candidate.facts.fold_scope.kind !== "ALL_OUTER_FOLDS") {
    return { state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.pathNotThisCandidate, source: null };
  }
  return { state: "AVAILABLE", value: input.passportMaxDrawdown, reason_code: null, source: "RETAINED_STITCHED_OOS_PATH" };
}
