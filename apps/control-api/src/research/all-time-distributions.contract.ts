import { z } from "zod";

const Decimal = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const Utc = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Count = z.number().int().nonnegative().max(2_000_000);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable();

export const ResearchMonthlyPointSchema = z.object({
  month_start_utc_ms: Utc, return_fraction: Decimal,
  partial: z.boolean().optional(), observation_count: Count.optional(),
  basis: z.enum(["FIRST_OOS_CLOSE", "PREVIOUS_OBSERVED_MONTH_CLOSE"]).optional(),
  base_at_utc_ms: Utc.optional(), close_at_utc_ms: Utc.optional(),
}).strict();

const Bucket = z.object({ lower_inclusive: Decimal, upper: Decimal,
  upper_inclusive: z.enum(["true", "false"]), count: z.string().regex(/^[0-9]+$/).max(7) }).strict();
export const ResearchAllTimeDistributionsSchema = z.object({
  schema_version: z.literal("research.all-time-distributions.v1"),
  origin: z.literal("PORTAL_DERIVED"), scope: z.literal("OOS"),
  scope_locator: z.string().min(1).max(256), input_digest: z.string().regex(/^[0-9a-f]{64}$/),
  oos_observation_count: Count.min(2),
  monthly_definition: z.literal("OOS_MONTH_CLOSE_OVER_FIRST_OOS_OR_PREVIOUS_OBSERVED_MONTH_CLOSE_V1"),
  distribution_definition: z.literal("ALL_TIME_SOURCE_UTC_DAILY_RETURNS_12_BIN_V1"),
  monthly_returns: z.object({
    state: z.enum(["AVAILABLE", "NOT_APPLICABLE"]), reason_code: Reason,
    source_observation_count: Count, emitted_point_count: Count.max(32), total_period_count: Count,
    omitted_leading_period_count: Count, omitted_transport_period_count: Count,
    sampling: z.enum(["FULL", "TAIL_WINDOW_V1"]),
    values: z.array(ResearchMonthlyPointSchema.required()).max(32),
  }).strict(),
  return_distribution: z.object({
    state: z.enum(["AVAILABLE", "NOT_APPLICABLE"]), reason_code: Reason,
    source_observation_count: Count, emitted_point_count: Count.max(12),
    sampling: z.enum(["FULL_RETURN_HISTOGRAM_V2", "NOT_APPLICABLE"]),
    values: z.array(Bucket).max(12),
  }).strict(),
}).strict().superRefine((block, context) => {
  const monthly = block.monthly_returns;
  const histogram = block.return_distribution;
  let valid = monthly.source_observation_count === block.oos_observation_count
    && monthly.emitted_point_count === monthly.values.length
    && monthly.total_period_count === monthly.values.length + monthly.omitted_transport_period_count
    && (monthly.sampling === "FULL") === (monthly.omitted_transport_period_count === 0)
    && histogram.emitted_point_count === histogram.values.length
    && histogram.source_observation_count <= block.oos_observation_count
    && Buffer.byteLength(JSON.stringify(block), "utf8") <= 16_384;
  for (const series of [monthly, histogram]) {
    valid &&= (series.state === "AVAILABLE") === (series.values.length > 0)
      && (series.state === "AVAILABLE") === (series.reason_code === null);
  }
  for (let i = 0; i < monthly.values.length; i += 1) {
    const point = monthly.values[i]!;
    valid &&= point.observation_count > 0 && point.base_at_utc_ms <= point.close_at_utc_ms
      && point.close_at_utc_ms >= point.month_start_utc_ms
      && (i === 0 || point.month_start_utc_ms > monthly.values[i - 1]!.month_start_utc_ms);
  }
  if (histogram.state === "AVAILABLE") {
    valid &&= histogram.values.length === 12 && histogram.sampling === "FULL_RETURN_HISTOGRAM_V2"
      && histogram.values.reduce((sum, bucket) => sum + Number(bucket.count), 0) === histogram.source_observation_count;
    for (let i = 0; i < histogram.values.length; i += 1) {
      const bucket = histogram.values[i]!;
      valid &&= Number.isFinite(Number(bucket.lower_inclusive)) && Number.isFinite(Number(bucket.upper))
        && Number(bucket.lower_inclusive) < Number(bucket.upper)
        && bucket.upper_inclusive === (i === 11 ? "true" : "false")
        && (i === 0 || bucket.lower_inclusive === histogram.values[i - 1]!.upper);
    }
  } else valid &&= histogram.sampling === "NOT_APPLICABLE";
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: "OOS distribution provenance/counts/shape are inconsistent" });
});

export type ResearchAllTimeDistributions = z.infer<typeof ResearchAllTimeDistributionsSchema>;
