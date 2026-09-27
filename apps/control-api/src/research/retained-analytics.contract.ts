/** E11/E14 bounded source-time engine analytics; old seals omit the block. */
import { z } from "zod";

const Decimal = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const UtcMs = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Count = z.number().int().nonnegative().max(2_000_000);
const Locator = z.string().min(1).max(256);
const State = z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]);

export const ResearchRetainedAnalyticsFactSchema = z.object({
  state: State, reason_code: Reason.nullable(), value: Decimal.nullable(),
  source_locator: Locator, scope: z.enum(["OOS", "CHILD_TAPE"]),
  origin: z.enum(["ENGINE_DIRECT", "SOURCE_DERIVED"]),
}).strict().superRefine((value, context) => {
  if ((value.state === "AVAILABLE") !== (value.value !== null)
    || (value.state === "AVAILABLE") === (value.reason_code !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "retained metric state and value disagree" });
  }
});

const Curve = z.object({
  state: State, reason_code: Reason.nullable(),
  scope: z.enum(["DECLARED_IS", "SELECTED_CANDIDATE_IS"]), source_locator: Locator,
  start_utc_ms: UtcMs.nullable(), end_exclusive_utc_ms: UtcMs.nullable(),
  source_observation_count: Count, emitted_point_count: Count.max(24),
  sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]).nullable(),
  points: z.array(z.object({ at_utc_ms: UtcMs, equity: Decimal }).strict()).max(24),
}).strict().superRefine((value, context) => {
  if ((value.state === "AVAILABLE") !== (value.points.length > 0)
    || (value.state === "AVAILABLE") === (value.reason_code !== null)
    || value.emitted_point_count !== value.points.length
    || value.points.length > value.source_observation_count
    || (value.sampling === null) !== (value.points.length === 0)
    || (value.sampling === "FULL" && value.points.length !== value.source_observation_count)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "retained IS curve coverage disagrees" });
  }
  if (value.state === "AVAILABLE" && (value.start_utc_ms === null || value.end_exclusive_utc_ms === null
    || value.start_utc_ms >= value.end_exclusive_utc_ms)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "available IS curve requires immutable boundaries" });
  }
  value.points.forEach((point, index) => {
    if ((value.start_utc_ms !== null && point.at_utc_ms < value.start_utc_ms)
      || (value.end_exclusive_utc_ms !== null && point.at_utc_ms >= value.end_exclusive_utc_ms)
      || (index > 0 && point.at_utc_ms <= value.points[index - 1]!.at_utc_ms)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "IS curve must preserve source chronology and exclude OOS" });
    }
  });
});

const Rolling = z.object({
  state: State, reason_code: Reason.nullable(), window_days: z.literal(63),
  daily_return_count: Count.nullable(), locator: Locator.nullable(),
  source_observation_count: Count, omitted_non_finite_count: Count, emitted_point_count: Count.max(12),
  sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]).nullable(),
  points: z.array(z.object({ at_utc_ms: UtcMs, sharpe: Decimal }).strict()).max(12),
}).strict().superRefine((value, context) => {
  if ((value.state === "AVAILABLE") !== (value.points.length > 0)
    || (value.state === "AVAILABLE") === (value.reason_code !== null)
    || value.emitted_point_count !== value.points.length
    || value.points.length > value.source_observation_count
    || (value.sampling === null) !== (value.points.length === 0)
    || (value.sampling === "FULL" && value.points.length !== value.source_observation_count)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "retained rolling Sharpe coverage disagrees" });
  }
  for (let index = 1; index < value.points.length; index++) {
    if (value.points[index]!.at_utc_ms <= value.points[index - 1]!.at_utc_ms) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "rolling Sharpe source chronology is invalid" });
    }
  }
});

export const ResearchRetainedAnalyticsSchema = z.object({
  schema_version: z.literal("research.retained-analytics.v1"),
  input_digest: z.string().regex(/^[0-9a-f]{64}$/), scope_locator: Locator,
  oos_observation_count: Count.positive(), trade_ledger_record_count: Count,
  net_oos_return: ResearchRetainedAnalyticsFactSchema,
  total_trade_count: ResearchRetainedAnalyticsFactSchema,
  rolling_sharpe_63: Rolling, in_sample_equity: Curve,
  behaviour: z.object({
    win_rate: ResearchRetainedAnalyticsFactSchema,
    payoff_ratio: ResearchRetainedAnalyticsFactSchema,
    average_hold_seconds: ResearchRetainedAnalyticsFactSchema,
    max_consecutive_losses: ResearchRetainedAnalyticsFactSchema,
    turnover_notional: ResearchRetainedAnalyticsFactSchema,
    exposure_fraction: ResearchRetainedAnalyticsFactSchema,
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.net_oos_return.scope !== "OOS" || value.total_trade_count.scope !== "CHILD_TAPE"
    || value.net_oos_return.origin !== "ENGINE_DIRECT" || value.total_trade_count.origin !== "ENGINE_DIRECT"
    || Object.values(value.behaviour).some((fact) => fact.scope !== "OOS")) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "retained fact scopes must remain explicit" });
  }
  if (value.total_trade_count.state === "AVAILABLE" && !/^(?:0|[1-9][0-9]*)$/.test(value.total_trade_count.value!)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "total trade count must be an engine integer" });
  }
  const exposure = value.behaviour.exposure_fraction;
  if (exposure.state === "AVAILABLE" && (Number(exposure.value) < 0 || Number(exposure.value) > 1)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "bar exposure must lie inside zero to one" });
  }
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 16_384) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "retained analytics block exceeds its byte budget" });
  }
});

export type ResearchRetainedAnalytics = z.infer<typeof ResearchRetainedAnalyticsSchema>;
