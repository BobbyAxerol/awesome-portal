/**
 * W5a · P16-T02 / P16-T11 — the per-fold ordering block of the Screen-07
 * freeze read.
 *
 * Two axes, never one (HiFi 07 F1):
 *  - DATA TIME: each retained fold's own IS/OOS windows, checked per fold
 *    (the fold's IS ends before its OOS starts, or the fact is typed absent);
 *  - WALL CLOCK: QuantBT publishes no freeze/read clocks on this route, so it
 *    is a typed absence — never a drawn tick.
 *
 * The per-fold causal verdict is derived from QuantBT's own claim facts, never
 * entered and never a PASS a global study cannot earn: a global schedule
 * selects one θ* after reading every outer fold, so every fold is
 * `NOT_CAUSAL_GLOBAL_SELECTION` with the engine's chronological claim as the
 * reason. Only the separately admitted causal-inner profile can earn a
 * data-time causal verdict, from its own retained inner rows and selections.
 *
 * P16-T11: per fold, the out-of-sample generation child of QuantBT's child
 * audit (W5b, P17-T14) is compared with the frozen selection by QuantBT's own
 * candidate identity (`walkforward._strategy_candidate_id`: sha256 of the
 * sorted compact JSON parameter map, first 24 hex). Nothing is re-selected.
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { P11StageEventsSchema, type P11StageEvents } from "./p11-stage-events";

import type { CurrentSourceCausalSelection, CurrentSourceFacts } from "./current-source.payload";
import type { HistoricalProfileBinding } from "./parameter-binding.registry";
import { DELTA_CAUSAL_INNER_PROFILE } from "./delta-causal-inner.profile";
import { sha256ResearchJson } from "./preflight.service";

export const FOLD_ORDERING_RULE = "research.freeze-fold-ordering.v1" as const;
export const QUANTBT_CANDIDATE_IDENTITY_RULE = "QUANTBT_WALKFORWARD_STRATEGY_CANDIDATE_ID_V1" as const;

export const FOLD_ORDERING_REASONS = {
  sealPredatesFacts: "RS02_SEAL_PREDATES_W3_SOURCE_FACTS_V1",
  globalSelection: "SELECTION_SAW_EVERY_OUTER_FOLD",
  perFoldNotAdmitted: "P10_DELTA_WFO_PROFILE_DOES_NOT_ADMIT_PER_FOLD_CAUSAL_SCHEDULE",
  scheduleNotPublished: "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_OPTIMIZATION_SCHEDULE",
  scheduleUnknown: "OPTIMIZATION_SCHEDULE_NOT_IN_FOLD_ORDERING_RULE",
  windowNotPublished: "QUANTBT_FOLD_WINDOW_NOT_PUBLISHED",
  wallClock: "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FREEZE_OR_OOS_READ_CLOCKS",
  childAuditNotRetained: "RS02_SEAL_PREDATES_P17_CHILD_AUDIT",
  noGenerationChild: "QUANTBT_CHILD_AUDIT_HAS_NO_OUT_OF_SAMPLE_GENERATION_RECORD",
  identityNotComputable: "FROZEN_PARAMETERS_NOT_EXACT_NUMERIC_JSON",
  causalSourceMissing: "CAUSAL_FOLD_SELECTION_OR_INNER_ROWS_NOT_RETAINED",
  causalWindowMismatch: "CAUSAL_INNER_WINDOWS_NOT_WITHIN_OUTER_IS",
  causalClaimMismatch: "CAUSAL_SELECTION_SOURCE_CLAIMS_NOT_COMPATIBLE",
  noGlobalCandidate: "LAST_FOLD_DEPLOYMENT_IS_NOT_RUN_GLOBAL_SELECTION",
} as const;

const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const Token = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/);
const UtcMs = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const CandidateId = z.string().regex(/^[0-9a-f]{24}$/);

const WindowSchema = z.object({
  start_utc_ms: UtcMs.nullable(),
  end_utc_ms: UtcMs.nullable(),
}).strict();

export const FoldOrderingRowSchema = z.object({
  fold_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
  source_ordinal: z.number().int().nonnegative(),
  data_time: z.object({
    is: WindowSchema,
    oos: WindowSchema,
    /** This fold's own boundary: its IS ends strictly before its OOS starts. */
    boundary: z.enum(["IS_ENDS_BEFORE_OOS", "IS_OVERLAPS_OOS", "NOT_PUBLISHED"]),
    reason_code: Reason.nullable(),
  }).strict(),
  verdict: z.enum(["NOT_CAUSAL_GLOBAL_SELECTION", "CAUSAL_DATA_TIME_SELECTION", "NOT_EVALUATED", "NOT_PUBLISHED"]),
  reason_code: Reason.nullable(),
  selected_candidate: z.object({
    candidate_id: CandidateId.nullable(), params_digest: z.string().regex(/^[0-9a-f]{64}$/),
    study_id: Token, selected_trial_id: Token, inner_fold_count: z.number().int().min(2).max(16),
  }).strict().optional(),
  oos_generation_child: z.object({
    state: z.enum(["MATCH", "MISMATCH", "NOT_RETAINED", "NOT_PUBLISHED", "NOT_COMPUTABLE"]),
    reason_code: Reason.nullable(),
    audit_ordinal: z.number().int().nonnegative().nullable(),
    candidate_id: CandidateId.nullable(),
  }).strict(),
}).strict();

export const FoldOrderingSchema = z.object({
  schema_version: z.literal(FOLD_ORDERING_RULE),
  axes: z.tuple([z.literal("DATA_TIME"), z.literal("WALL_CLOCK")]),
  selection_scope: z.enum(["GLOBAL", "PER_FOLD", "NOT_PUBLISHED"]),
  optimization_schedule: Token.nullable(),
  source_claims: z.object({
    chronological_claim: Token.nullable(),
    causality_claim: Token.nullable(),
    oos_used_for_selection: z.boolean().nullable(),
  }).strict(),
  wall_clock: z.object({
    state: z.literal("NOT_PUBLISHED"),
    reason_code: Reason,
  }).strict(),
  /** Optional P11 orchestration observations, separate from absent engine clocks above. */
  stage_events: P11StageEventsSchema.optional(),
  frozen_candidate: z.object({
    identity_rule: z.literal(QUANTBT_CANDIDATE_IDENTITY_RULE),
    candidate_id: CandidateId.nullable(),
    reason_code: Reason.nullable(),
  }).strict(),
  counts: z.object({
    folds: z.number().int().nonnegative(),
    not_causal_global_selection: z.number().int().nonnegative(),
    not_evaluated: z.number().int().nonnegative(),
    not_published: z.number().int().nonnegative(),
    causal_data_time_selection: z.number().int().nonnegative().optional(),
    oos_child_match: z.number().int().nonnegative(),
    oos_child_mismatch: z.number().int().nonnegative(),
  }).strict(),
  folds: z.array(FoldOrderingRowSchema).max(256),
}).strict();

export type FoldOrdering = z.infer<typeof FoldOrderingSchema>;

export interface FoldOrderingInput {
  sourceOrdinal: number;
  foldId: string;
  trainStartUtcMs: number | null;
  trainEndUtcMs: number | null;
  testStartUtcMs: number | null;
  testEndUtcMs: number | null;
  /** Child-audit records (W5b); undefined when the seal predates P17-T14. */
  childAudit: ReadonlyArray<{ audit_ordinal: number; candidate_id: string | null; context: string | null }> | undefined;
  causalSelection?: CurrentSourceCausalSelection;
}

const EXACT_JSON_NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

/**
 * QuantBT's candidate identity for a parameter map it produced. The retained
 * map is normalized decimal text, not Python JSON: 1.0 becomes "1" in P05.
 * Restore the scalar kind only from the admitted historical child binding.
 * Python json.dumps writes an integral float as 1.0, not 1; hashing the
 * normalized map otherwise creates a false candidate MISMATCH. Unknown
 * kinds answer null (typed NOT_COMPUTABLE), never borrow a child-audit ID.
 */
export function quantbtCandidateId(
  parameters: Readonly<Record<string, string>>,
  kinds: HistoricalProfileBinding["candidateParameterKinds"],
): string | null {
  const names = Object.keys(parameters).sort();
  if (names.length === 0 || !kinds) return null;
  const parts: string[] = [];
  for (const name of names) {
    const value = parameters[name]!;
    if (!EXACT_JSON_NUMBER.test(value)) return null;
    const kind = kinds[name];
    if (!kind || kind === "int" && !/^-?(?:0|[1-9][0-9]*)$/.test(value)) return null;
    // This pinned positive Delta range uses ordinary fixed-point Python
    // floats (no exponent/negative zero); preserve the source decimal digits.
    const token = kind === "float" && !value.includes(".") ? `${value}.0` : value;
    parts.push(`${JSON.stringify(name)}:${token}`);
  }
  return createHash("sha256").update(`{${parts.join(",")}}`, "utf8").digest("hex").slice(0, 24);
}

function scopeOf(facts: CurrentSourceFacts | undefined): {
  scope: FoldOrdering["selection_scope"];
  verdict: FoldOrdering["folds"][number]["verdict"];
  reason: string;
} {
  if (!facts) return { scope: "NOT_PUBLISHED", verdict: "NOT_PUBLISHED", reason: FOLD_ORDERING_REASONS.sealPredatesFacts };
  const schedule = facts.search.optimization_schedule;
  if (schedule === null) return { scope: "NOT_PUBLISHED", verdict: "NOT_PUBLISHED", reason: FOLD_ORDERING_REASONS.scheduleNotPublished };
  if (schedule === "global") {
    return { scope: "GLOBAL", verdict: "NOT_CAUSAL_GLOBAL_SELECTION", reason: FOLD_ORDERING_REASONS.globalSelection };
  }
  if (schedule === "per_fold_causal") {
    return { scope: "PER_FOLD", verdict: "NOT_EVALUATED", reason: FOLD_ORDERING_REASONS.perFoldNotAdmitted };
  }
  return { scope: "NOT_PUBLISHED", verdict: "NOT_EVALUATED", reason: FOLD_ORDERING_REASONS.scheduleUnknown };
}

function boundaryOf(input: FoldOrderingInput): FoldOrdering["folds"][number]["data_time"] {
  const is = { start_utc_ms: input.trainStartUtcMs, end_utc_ms: input.trainEndUtcMs };
  const oos = { start_utc_ms: input.testStartUtcMs, end_utc_ms: input.testEndUtcMs };
  if (input.trainEndUtcMs === null || input.testStartUtcMs === null) {
    return { is, oos, boundary: "NOT_PUBLISHED", reason_code: FOLD_ORDERING_REASONS.windowNotPublished };
  }
  return {
    is,
    oos,
    boundary: input.trainEndUtcMs < input.testStartUtcMs ? "IS_ENDS_BEFORE_OOS" : "IS_OVERLAPS_OOS",
    reason_code: null,
  };
}

function childOf(input: FoldOrderingInput, frozen: string | null): FoldOrdering["folds"][number]["oos_generation_child"] {
  if (input.childAudit === undefined) {
    return { state: "NOT_RETAINED", reason_code: FOLD_ORDERING_REASONS.childAuditNotRetained, audit_ordinal: null, candidate_id: null };
  }
  const generation = input.childAudit.filter((record) => record.context === "out-of-sample generation");
  if (generation.length !== 1 || generation[0]!.candidate_id === null || !/^[0-9a-f]{24}$/.test(generation[0]!.candidate_id)) {
    return { state: "NOT_PUBLISHED", reason_code: FOLD_ORDERING_REASONS.noGenerationChild, audit_ordinal: null, candidate_id: null };
  }
  const child = generation[0]!;
  if (frozen === null) {
    return { state: "NOT_COMPUTABLE", reason_code: FOLD_ORDERING_REASONS.identityNotComputable, audit_ordinal: child.audit_ordinal, candidate_id: child.candidate_id };
  }
  return {
    state: child.candidate_id === frozen ? "MATCH" : "MISMATCH",
    reason_code: null,
    audit_ordinal: child.audit_ordinal,
    candidate_id: child.candidate_id,
  };
}

export function foldOrdering(
  folds: readonly FoldOrderingInput[],
  facts: CurrentSourceFacts | undefined,
  frozenParameters: Readonly<Record<string, string>>,
  candidateParameterKinds?: HistoricalProfileBinding["candidateParameterKinds"],
  stageEvents?: P11StageEvents,
  sourceProfileId?: string,
): FoldOrdering {
  const { scope, verdict, reason } = scopeOf(facts);
  const frozen = quantbtCandidateId(frozenParameters, candidateParameterKinds);
  const causal = sourceProfileId === DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id && scope === "PER_FOLD";
  const rows = [...folds]
    .sort((a, b) => a.sourceOrdinal - b.sourceOrdinal)
    .map((fold): FoldOrdering["folds"][number] => {
      const selected = causal ? fold.causalSelection : undefined;
      const candidate = causal ? selected ? quantbtCandidateId(selected.parameters, candidateParameterKinds) : null : frozen;
      const dataTime = boundaryOf(fold);
      let actualVerdict = verdict;
      let actualReason: string | null = reason;
      if (causal) {
        actualVerdict = "NOT_EVALUATED";
        actualReason = FOLD_ORDERING_REASONS.causalSourceMissing;
        if (selected) {
          const compatibleClaim = facts?.claims.oos_used_for_selection === false && selected.outer_oos_used_for_selection === false &&
            selected.causality_claim === "strict_nested_fold_local_retraining" && facts.claims.causality_claim === selected.causality_claim;
          const inner = selected.inner_folds;
          const windowsValid = dataTime.boundary === "IS_ENDS_BEFORE_OOS" && fold.trainStartUtcMs !== null && fold.trainEndUtcMs !== null &&
            inner.length === selected.inner_fold_count && inner.length >= selected.inner_validation.inner_min_folds &&
            new Set(inner.map(row => row.inner_fold_id)).size === inner.length && inner.every(row =>
              row.outer_oos_used_for_selection === false && row.train_start_utc_ms >= fold.trainStartUtcMs! &&
              row.train_start_utc_ms <= row.train_end_utc_ms && row.train_end_utc_ms < row.test_start_utc_ms &&
              row.test_start_utc_ms <= row.test_end_utc_ms && row.test_end_utc_ms <= fold.trainEndUtcMs!);
          actualReason = !compatibleClaim ? FOLD_ORDERING_REASONS.causalClaimMismatch : !windowsValid ? FOLD_ORDERING_REASONS.causalWindowMismatch : null;
          if (actualReason === null) actualVerdict = "CAUSAL_DATA_TIME_SELECTION";
        }
      }
      return {
      fold_id: fold.foldId,
      source_ordinal: fold.sourceOrdinal,
      data_time: dataTime,
      verdict: actualVerdict,
      reason_code: actualReason,
      ...(selected ? { selected_candidate: { candidate_id: candidate, params_digest: sha256ResearchJson(selected.parameters),
        study_id: selected.study_id, selected_trial_id: selected.selected_trial_id, inner_fold_count: selected.inner_fold_count } } : {}),
      oos_generation_child: childOf(fold, candidate),
    };
    });
  const count = (predicate: (row: (typeof rows)[number]) => boolean) => rows.filter(predicate).length;
  return {
    schema_version: FOLD_ORDERING_RULE,
    axes: ["DATA_TIME", "WALL_CLOCK"],
    selection_scope: scope,
    optimization_schedule: facts?.search.optimization_schedule ?? null,
    source_claims: {
      chronological_claim: facts?.claims.chronological_validation_claim ?? null,
      causality_claim: facts?.claims.causality_claim ?? null,
      oos_used_for_selection: facts?.claims.oos_used_for_selection ?? null,
    },
    wall_clock: { state: "NOT_PUBLISHED", reason_code: FOLD_ORDERING_REASONS.wallClock },
    ...(stageEvents ? { stage_events: stageEvents } : {}),
    frozen_candidate: {
      identity_rule: QUANTBT_CANDIDATE_IDENTITY_RULE,
      candidate_id: causal ? null : frozen,
      reason_code: causal ? FOLD_ORDERING_REASONS.noGlobalCandidate : frozen === null ? FOLD_ORDERING_REASONS.identityNotComputable : null,
    },
    counts: {
      folds: rows.length,
      not_causal_global_selection: count((row) => row.verdict === "NOT_CAUSAL_GLOBAL_SELECTION"),
      not_evaluated: count((row) => row.verdict === "NOT_EVALUATED"),
      not_published: count((row) => row.verdict === "NOT_PUBLISHED"),
      ...(causal ? { causal_data_time_selection: count(row => row.verdict === "CAUSAL_DATA_TIME_SELECTION") } : {}),
      oos_child_match: count((row) => row.oos_generation_child.state === "MATCH"),
      oos_child_mismatch: count((row) => row.oos_generation_child.state === "MISMATCH"),
    },
    folds: rows,
  };
}
