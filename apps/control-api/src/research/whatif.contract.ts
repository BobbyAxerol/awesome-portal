/**
 * W5a · A10c — the Screen-07 what-if lane (retained Delta WFO runs).
 *
 * The read (`what_if` on the current-source freeze) serves only exact,
 * already-existing evaluations: retained parent trials and sealed diagnostic
 * grids whose evaluation key (params + dataset + objective + seed + engine +
 * profile) equals a cell's. Every other cell is typed MISSING (or QUEUED
 * while a diagnostic job covers it) — never 0, never interpolated. The one
 * explicit POST admits one bounded diagnostic Research job.
 */

import { z } from "zod";

const DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const DecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const ParameterNameSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
const RunIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const WhatIfSliderSchema = z.object({
  parameter: ParameterNameSchema,
  hifi_name: z.enum(["entry_z", "atr_mult"]),
  minimum: DecimalSchema,
  maximum: DecimalSchema,
  step: DecimalSchema,
  base: DecimalSchema,
  radius_steps: z.literal(4),
  /** The nine node values in order, θ* ± 4 declared steps, clamped. */
  values: z.array(DecimalSchema).length(9),
  clamped: z.array(z.boolean()).length(9),
}).strict();

export const WhatIfCellSchema = z.object({
  cell_id: z.string().regex(/^x[0-8]y[0-8]$/),
  x_index: z.number().int().min(0).max(8),
  y_index: z.number().int().min(0).max(8),
  parameters: z.record(ParameterNameSchema, DecimalSchema),
  evaluation_key: DigestSchema,
  canonical_cell_id: z.string().regex(/^x[0-8]y[0-8]$/),
  clamped: z.boolean(),
  is_base: z.boolean(),
  /**
   * EVALUATED — an exact evaluation with this key exists (objective set).
   * NOT_DEFINED — it was evaluated and the engine published no objective (pruned/failed).
   * QUEUED — no evaluation yet; an admitted diagnostic job covers this key.
   * MISSING — no evaluation exists and none is in flight.
   */
  state: z.enum(["EVALUATED", "NOT_DEFINED", "QUEUED", "MISSING"]),
  objective: DecimalSchema.nullable(),
  /** objective − base objective, exact; null unless both are EVALUATED. */
  delta_j: DecimalSchema.nullable(),
  source: z.enum(["PARENT_TRIAL", "DIAGNOSTIC_GRID"]).nullable(),
  source_ref: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/).nullable(),
}).strict();

export const WhatIfJobSchema = z.object({
  run_id: RunIdSchema,
  state: z.enum(["QUEUED", "RUNNING", "SEALING", "READY", "FAILED", "CANCELLED", "RECOVERY_REQUIRED", "DRAFT"]),
  evaluations: z.number().int().min(1).max(81),
  grid_key: DigestSchema,
  requested_at_utc_ms: UtcMsSchema,
  sealed: z.boolean(),
  progress_href: z.string().regex(/^\/research\/quantbt\/runs\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}\/progress$/),
}).strict();

export const WhatIfSchema = z.object({
  schema_version: z.literal("research.freeze-what-if.v1"),
  state: z.enum(["AVAILABLE", "NOT_ENABLED", "NOT_PUBLISHED"]),
  reason_code: ReasonCodeSchema.nullable(),
  definition: z.object({
    profile_id: z.literal("p16.delta-whatif-grid.v1"),
    profile_digest: DigestSchema,
    objective_kind: z.literal("MODE_1_DECAY_J"),
    objective_scope: z.literal("GLOBAL_STUDY_IS_FOLDS"),
    random_seed: z.number().int().nonnegative(),
    engine_release_id: z.string().min(1).max(64),
    dataset_binding_digest: DigestSchema,
    preview_only: z.literal(true),
    interpolation: z.literal("NONE_SNAP_TO_NODE"),
  }).strict().nullable(),
  sliders: z.array(WhatIfSliderSchema).max(2),
  grid: z.object({
    size: z.literal(9),
    grid_key: DigestSchema,
    base_objective: DecimalSchema.nullable(),
    base_source: z.enum(["PARENT_TRIAL", "DIAGNOSTIC_GRID"]).nullable(),
    unique_evaluations: z.number().int().min(1).max(81),
    cells: z.array(WhatIfCellSchema).length(81),
  }).strict().nullable(),
  coverage: z.object({
    evaluated_cells: z.number().int().min(0).max(81),
    total_cells: z.literal(81),
    evaluated_unique: z.number().int().min(0).max(81),
    unique_evaluations: z.number().int().min(0).max(81),
    label: z.string().regex(/^[0-9]{1,2} \/ 81$/),
  }).strict().nullable(),
  job: WhatIfJobSchema.nullable(),
  actions: z.object({
    evaluate_grid: z.object({
      state: z.enum(["AVAILABLE", "IN_FLIGHT", "NOTHING_TO_EVALUATE", "BLOCKED", "NOT_ENABLED", "NOT_APPLICABLE"]),
      may_submit: z.boolean(),
      reason_code: ReasonCodeSchema.nullable(),
      missing_evaluations: z.number().int().min(0).max(81),
    }).strict(),
    sibling_draft: z.object({
      state: z.enum(["AVAILABLE", "BLOCKED", "NOT_APPLICABLE"]),
      may_create: z.boolean(),
      reason_code: ReasonCodeSchema.nullable(),
      /** Screen 02 route; `{cell_id}` is replaced by the chosen node. */
      href_template: z.string().regex(/^\/research\/quantbt\/runs\/new\?from=[A-Za-z0-9._-]+&fork=\{cell_id\}$/).nullable(),
    }).strict(),
  }).strict(),
}).strict();

export type WhatIf = z.infer<typeof WhatIfSchema>;
export type WhatIfCell = z.infer<typeof WhatIfCellSchema>;

export const ResearchWhatIfEvaluateRequestSchema = z.object({
  schema_version: z.literal("research.whatif-evaluate.v1"),
  /** The grid the reader saw; a different current grid is a 409, never a silent re-target. */
  grid_key: DigestSchema,
}).strict();

export const ResearchWhatIfEvaluateResponseSchema = z.object({
  schema_version: z.literal("research.whatif-evaluate-result.v1"),
  run_id: RunIdSchema,
  outcome: z.enum(["ADMITTED", "REPLAYED", "NOTHING_TO_EVALUATE"]),
  grid_key: DigestSchema,
  job: WhatIfJobSchema.nullable(),
}).strict();

export type ResearchWhatIfEvaluateRequest = z.infer<typeof ResearchWhatIfEvaluateRequestSchema>;
export type ResearchWhatIfEvaluateResponse = z.infer<typeof ResearchWhatIfEvaluateResponseSchema>;

/** Private worker → Control API seal of one sealed WHATIF_GRID relation. */
export const ResearchWhatIfGridSealIngressSchema = z.object({
  schema_version: z.literal("research.whatif-grid-seal.v1"),
  workspace_id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/),
  run_id: RunIdSchema,
  job_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/),
  worker_attempt_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/),
  lease_epoch: z.number().int().positive().max(2_147_483_647),
  artifact_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/),
  artifact_revision: z.number().int().positive().max(2_147_483_647),
  manifest_digest: DigestSchema,
  grid_key: DigestSchema,
  results: z.array(z.object({
    evaluation_key: DigestSchema,
    trial_id: z.string().regex(/^[0-9]{1,6}$/),
    state: z.enum(["COMPLETE", "PRUNED", "FAILED"]),
    objective: DecimalSchema.nullable(),
  }).strict()).min(1).max(81),
}).strict();

export type ResearchWhatIfGridSealIngress = z.infer<typeof ResearchWhatIfGridSealIngressSchema>;
