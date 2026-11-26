import { z } from "zod";

// Response/read safety ceilings, not approved source cadence/capacity budgets.
export const STAGE_DRIFT_MAX_ROWS = 20_000;
export const STAGE_DRIFT_MAX_BYTES = 1_048_576;
export const stageDriftDecimal = z.string().max(128)
  .regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$(?![\s\S])/);
export const stageDriftCurrency = z.string().min(1).max(32)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$(?![\s\S])/);
export const stageDriftReason = z.enum([
  "EXECUTION_PROFILE_READ_DISABLED", "PHASE2_PROJECTION_PROFILE_NOT_CONFIGURED",
  "PHASE2_PROJECTION_NOT_READY", "PHASE2_PROJECTION_STALE_CEILING_EXCEEDED",
  "PROFILE_UNAVAILABLE", "NO_DEPLOYMENT_IN_STAGE", "HISTORY_MIRROR_NOT_AVAILABLE",
  "NO_EQUITY_IN_WINDOW", "NO_EQUITY_FOR_DAY", "EQUITY_DECIMAL_INVALID",
  "EQUITY_CURRENCY_NOT_PUBLISHED", "MIXED_CURRENCIES_NOT_AGGREGATED",
]);
export const exactStageSeries = z.object({
  deployed: z.boolean(), reason_code: stageDriftReason.nullable(),
  currency: stageDriftCurrency.nullable(),
  series: z.array(stageDriftDecimal.nullable()).max(STAGE_DRIFT_MAX_ROWS),
  series_reason_codes: z.array(stageDriftReason.nullable()).max(STAGE_DRIFT_MAX_ROWS),
}).strict();
export const exactStageDrift = z.object({
  schema_version: z.literal("portal.execution.alpha-stage-drift.v2"),
  alpha_id: z.string().min(1).max(192).regex(/^[A-Za-z0-9._:@-]+$(?![\s\S])/),
  qualification: z.literal("RETAINED_OBSERVATIONS_NOT_FINANCIAL_CERTIFICATION"),
  window: z.object({ days: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    requested_days: z.number().int().min(2).max(365).nullable(),
    basis: z.literal("PORTAL_SGP_HISTORY_MIRROR"),
    daily_basis: z.literal("LAST_CLOSE_PER_DAY_SUMMED_ACROSS_ACCOUNTS_SAME_CURRENCY"),
  }).strict(),
  calendar: z.array(z.string().date()).max(STAGE_DRIFT_MAX_ROWS),
  stages: z.object({ paper: exactStageSeries, sandbox: exactStageSeries, live: exactStageSeries }).strict(),
  research_binding: z.object({ state: z.literal("UNAVAILABLE"),
    reason_code: z.literal("N28_RESEARCH_EVIDENCE_JOIN_NOT_ACTIVATED"),
    run_id: z.null(), artifact_digest: z.null(),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.calendar.some((day, index) => index > 0 && day <= value.calendar[index - 1]))
    context.addIssue({ code: "custom", path: ["calendar"], message: "CALENDAR_NOT_STRICTLY_ORDERED" });
  for (const [environment, stage] of Object.entries(value.stages)) {
    if (stage.series.length !== value.calendar.length || stage.series_reason_codes.length !== value.calendar.length)
      context.addIssue({ code: "custom", path: ["stages", environment], message: "SERIES_CALENDAR_MISMATCH" });
    stage.series.forEach((point, index) => {
      if ((point === null) !== (stage.series_reason_codes[index] !== null) ||
        (point !== null && (!stage.deployed || stage.currency === null || stage.reason_code !== null)))
        context.addIssue({ code: "custom", path: ["stages", environment, "series", index], message: "VALUE_ABSENCE_MISMATCH" });
    });
  }
});
export type ExactStageDrift = z.infer<typeof exactStageDrift>;
export type StageDriftReason = z.infer<typeof stageDriftReason>;
