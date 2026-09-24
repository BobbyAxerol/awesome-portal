/**
 * RS-02 retained current-source row/summary payload schemas.
 *
 * Shared by the private ingest (which refuses an incompatible row before it
 * is retained) and the named BFF readers (which re-validate what they read).
 * The shapes mirror `_portal_retention_row()` and the adapter summary in
 * `apps/portal/backend/.../current_source_artifacts.py`.
 */

import { z } from "zod";

import type { CurrentSourceTableKind } from "./current-source.repository";

export const CurrentSourceDecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
export const CurrentSourceParameterMapSchema = z.record(
  z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/),
  CurrentSourceDecimalSchema,
).superRefine((value, context) => {
  if (Object.keys(value).length > 24) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "current-source parameter map exceeds 24 fields" });
  }
});
export const CurrentSourceSummarySchema = z.object({
  schema_version: z.literal("research.current-source-summary.v1"),
  metrics: z.object({
    initial_equity: CurrentSourceDecimalSchema,
    final_equity: CurrentSourceDecimalSchema,
    net_return_fraction: CurrentSourceDecimalSchema,
    max_drawdown_fraction: CurrentSourceDecimalSchema,
  }).strict(),
  selection: z.object({
    trial_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/).nullable(),
    objective: CurrentSourceDecimalSchema.nullable(),
    parameters: CurrentSourceParameterMapSchema,
  }).strict(),
  data_use: z.object({
    warmup: z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]), reason_code: z.string().nullable() }).strict(),
    purge: z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]), reason_code: z.string().nullable() }).strict(),
    embargo: z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]), reason_code: z.string().nullable() }).strict(),
    strict_outer_oos_selection: z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]), reason_code: z.string().nullable() }).strict(),
  }).strict(),
  // The RS-02 exporter has always written these row counts; a real export
  // could not seal until the schema admitted them (W1 preview receipt).
  counts: z.object({
    folds: z.number().int().positive().max(1_000_000),
    trials: z.number().int().positive().max(1_000_000),
    candidates: z.number().int().nonnegative().max(1_000_000),
  }).strict().optional(),
  derived: z.object({
    monthly_returns: z.object({
      source_observation_count: z.number().int().nonnegative().max(2_000_000),
      emitted_point_count: z.number().int().nonnegative().max(192),
      total_period_count: z.number().int().nonnegative().max(2_000_000),
      omitted_leading_period_count: z.number().int().nonnegative().max(2_000_000),
      omitted_transport_period_count: z.number().int().nonnegative().max(2_000_000),
      sampling: z.enum(["FULL", "TAIL_WINDOW_V1"]),
      values: z.array(z.object({ month_start_utc_ms: z.number().int().nonnegative(), return_fraction: CurrentSourceDecimalSchema }).strict()).max(192),
    }).strict(),
    rolling_returns_20: z.object({
      source_observation_count: z.number().int().nonnegative().max(2_000_000),
      emitted_point_count: z.number().int().nonnegative().max(192),
      window_observations: z.literal(20),
      sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1", "NOT_APPLICABLE"]),
      values: z.array(z.object({ at_utc_ms: z.number().int().nonnegative(), return_fraction: CurrentSourceDecimalSchema }).strict()).max(192),
    }).strict(),
    return_distribution: z.object({
      state: z.enum(["AVAILABLE", "NOT_APPLICABLE"]),
      reason_code: z.string().nullable(),
      source_observation_count: z.number().int().nonnegative().max(2_000_000),
      emitted_point_count: z.number().int().nonnegative().max(192),
      sampling: z.enum(["FULL_RETURN_HISTOGRAM_V2", "NOT_APPLICABLE"]),
      values: z.array(z.object({
        lower_inclusive: CurrentSourceDecimalSchema,
        upper: CurrentSourceDecimalSchema,
        upper_inclusive: z.enum(["true", "false"]),
        count: z.string().regex(/^[0-9]+$/),
      }).strict()).max(192),
    }).strict(),
  }).strict(),
}).strict();

export const CurrentSourceObservationPayloadSchema = z.object({
  source_index_utc: z.string().datetime({ offset: true }),
  at_utc_ms: z.number().int().nonnegative(),
  equity: CurrentSourceDecimalSchema,
  return_fraction: CurrentSourceDecimalSchema,
  accepted_position: CurrentSourceDecimalSchema,
  drawdown_fraction: CurrentSourceDecimalSchema,
  signal_target: CurrentSourceDecimalSchema.nullable(),
}).strict();

export const CurrentSourceFoldPayloadSchema = z.object({
  fold_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
  train_start_utc_ms: z.number().int().nonnegative().nullable(),
  train_end_utc_ms: z.number().int().nonnegative().nullable(),
  test_start_utc_ms: z.number().int().nonnegative().nullable(),
  test_end_utc_ms: z.number().int().nonnegative().nullable(),
}).strict();

export const CurrentSourceTrialPayloadSchema = z.object({
  trial_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
  state: z.string().regex(/^[A-Z][A-Z0-9_]{1,63}$/),
  objective: CurrentSourceDecimalSchema.nullable(),
  parameters: CurrentSourceParameterMapSchema,
}).strict();

export const CurrentSourceCandidatePayloadSchema = z.object({
  candidate_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
  objective: CurrentSourceDecimalSchema.nullable(),
  parameters: CurrentSourceParameterMapSchema,
}).strict();

export const CurrentSourceSelectionPayloadSchema = z.object({
  selection_role: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
  trial_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/).nullable(),
  objective: CurrentSourceDecimalSchema.nullable(),
  parameters: CurrentSourceParameterMapSchema,
}).strict();

/**
 * Validate one retained row's payload and its identity columns exactly as a
 * reader will later re-check them. Returns false for any incompatible row.
 */
export function currentSourceRowMatchesKind(
  tableKind: CurrentSourceTableKind,
  row: { sourceId: string; occurredAtUtcMs: number | null; payload: Record<string, unknown> },
): boolean {
  switch (tableKind) {
    case "OBSERVATION": {
      const parsed = CurrentSourceObservationPayloadSchema.safeParse(row.payload);
      return parsed.success && row.sourceId === parsed.data.source_index_utc && row.occurredAtUtcMs === parsed.data.at_utc_ms;
    }
    case "FOLD": {
      const parsed = CurrentSourceFoldPayloadSchema.safeParse(row.payload);
      return parsed.success && row.sourceId === parsed.data.fold_id && row.occurredAtUtcMs === null;
    }
    case "TRIAL": {
      const parsed = CurrentSourceTrialPayloadSchema.safeParse(row.payload);
      return parsed.success && row.sourceId === parsed.data.trial_id && row.occurredAtUtcMs === null;
    }
    case "CANDIDATE": {
      const parsed = CurrentSourceCandidatePayloadSchema.safeParse(row.payload);
      return parsed.success && row.sourceId === parsed.data.candidate_id && row.occurredAtUtcMs === null;
    }
    case "SELECTION": {
      const parsed = CurrentSourceSelectionPayloadSchema.safeParse(row.payload);
      return parsed.success && row.sourceId === parsed.data.selection_role && row.occurredAtUtcMs === null;
    }
    default:
      return false;
  }
}
