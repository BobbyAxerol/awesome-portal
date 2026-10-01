/** D-AN-01 Portal-derived all-time facts sealed by the QuantBT child. */
import { z } from "zod";
import { ResearchAllTimeDistributionsSchema } from "./all-time-distributions.contract";

const Decimal = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const Locator = z.string().min(1).max(256);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const UtcMs = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Count = z.number().int().nonnegative().max(2_000_000);

export const ResearchRetainedAnalyticsV2FactSchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: Reason.nullable(),
  value: Decimal.nullable(),
  origin: z.enum(["ENGINE_DIRECT", "PORTAL_DERIVED"]),
  scope: z.literal("OOS"),
  source_locator: Locator,
  input_digest: Digest,
}).strict().superRefine((fact, context) => {
  if ((fact.state === "AVAILABLE") !== (fact.value !== null)
    || (fact.state === "AVAILABLE") === (fact.reason_code !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "analytics v2 fact availability contradicts value/reason" });
  }
});

const Curve = z.array(z.object({ at_utc_ms: UtcMs, value: Decimal }).strict()).max(24)
  .superRefine((points, context) => {
    for (let index = 1; index < points.length; index += 1) {
      if (points[index]!.at_utc_ms <= points[index - 1]!.at_utc_ms) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "analytics v2 curve must be chronological" });
      }
    }
  });

const Metrics = z.object({
  sharpe: ResearchRetainedAnalyticsV2FactSchema,
  sortino: ResearchRetainedAnalyticsV2FactSchema,
  cagr_fraction: ResearchRetainedAnalyticsV2FactSchema,
  profit_factor: ResearchRetainedAnalyticsV2FactSchema,
  long_hit_rate_fraction: ResearchRetainedAnalyticsV2FactSchema,
  short_hit_rate_fraction: ResearchRetainedAnalyticsV2FactSchema,
  volatility_fraction: ResearchRetainedAnalyticsV2FactSchema,
  skew: ResearchRetainedAnalyticsV2FactSchema,
  excess_kurtosis: ResearchRetainedAnalyticsV2FactSchema,
  beta: ResearchRetainedAnalyticsV2FactSchema,
  correlation: ResearchRetainedAnalyticsV2FactSchema,
  benchmark_return_fraction: ResearchRetainedAnalyticsV2FactSchema,
  max_drawdown_duration_days: ResearchRetainedAnalyticsV2FactSchema,
  sharpe_decay: ResearchRetainedAnalyticsV2FactSchema,
}).strict();

const Behaviour = z.object({
  exposure_long_fraction: ResearchRetainedAnalyticsV2FactSchema,
  exposure_short_fraction: ResearchRetainedAnalyticsV2FactSchema,
  exposure_flat_fraction: ResearchRetainedAnalyticsV2FactSchema,
  win_rate: ResearchRetainedAnalyticsV2FactSchema,
  payoff_ratio: ResearchRetainedAnalyticsV2FactSchema,
  average_hold_seconds: ResearchRetainedAnalyticsV2FactSchema,
  max_consecutive_losses: ResearchRetainedAnalyticsV2FactSchema,
  turnover_notional: ResearchRetainedAnalyticsV2FactSchema,
}).strict();

export const ResearchRetainedAnalyticsV2Last30dSchema = z.object({
  label: z.literal("last 30D"),
  window_start_utc_ms: UtcMs,
  window_end_utc_ms: UtcMs,
  partial_window: z.boolean(),
  source_observation_count: Count,
  points: Curve,
  return_fraction: ResearchRetainedAnalyticsV2FactSchema,
  sharpe: ResearchRetainedAnalyticsV2FactSchema,
}).strict();

export const ResearchRetainedAnalyticsV2Schema = z.object({
  schema_version: z.literal("research.retained-analytics.v2"),
  input_digest: Digest,
  scope_locator: Locator,
  benchmark_locator: Locator,
  oos_observation_count: Count.positive(),
  drawdown_recovered: z.boolean(),
  metrics: Metrics,
  behaviour: Behaviour,
  strategy_curve: Curve,
  benchmark_curve: Curve,
  last_30d: ResearchRetainedAnalyticsV2Last30dSchema,
  distributions: ResearchAllTimeDistributionsSchema.optional(),
}).strict().superRefine((block, context) => {
  const facts = [
    ...Object.values(block.metrics), ...Object.values(block.behaviour),
    block.last_30d.return_fraction, block.last_30d.sharpe,
  ];
  if (facts.some((fact) => fact.input_digest !== block.input_digest)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "analytics v2 fact digest differs from block" });
  }
  if (block.last_30d.window_start_utc_ms > block.last_30d.window_end_utc_ms
    || block.last_30d.points.length > block.last_30d.source_observation_count
    || Buffer.byteLength(JSON.stringify(block), "utf8") > 16_384) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "analytics v2 window or byte budget invalid" });
  }
});

export type ResearchRetainedAnalyticsV2 = z.infer<typeof ResearchRetainedAnalyticsV2Schema>;
