/** B6 immutable all-time supplement; computation never happens in a GET. */
import { z } from "zod";
import { ResearchRetainedAnalyticsV2FactSchema, ResearchRetainedAnalyticsV2Schema } from "./retained-analytics-v2.contract";
import { sha256ResearchJson } from "./preflight.service";

const Decimal = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const Digest = z.string().regex(/^[0-9a-f]{64}$/);
const Ms = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Count = z.number().int().nonnegative().max(2_000_000);
const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const Head = z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]), reason_code: Reason.nullable() });
/** B6 follow-up: block absence is a wire fact, not copy invented by a client. */
export const ResearchEnrichedAvailabilitySchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("AVAILABLE"), reason_code: z.null() }).strict(),
  z.object({ state: z.literal("NOT_PUBLISHED"), reason_code: z.enum([
    "SEALED_ENRICHMENT_NOT_COMPUTED", "SOURCE_EVIDENCE_NOT_SEALED",
  ]) }).strict(),
]);
export function enrichedAvailability(block: ResearchEnrichedAnalysis | undefined, sourceSealed = true) {
  return ResearchEnrichedAvailabilitySchema.parse(block
    ? { state: "AVAILABLE", reason_code: null }
    : { state: "NOT_PUBLISHED", reason_code: sourceSealed
      ? "SEALED_ENRICHMENT_NOT_COMPUTED" : "SOURCE_EVIDENCE_NOT_SEALED" });
}
const Derived = Head.extend({ origin: z.literal("PORTAL_DERIVED") });
const Curve = z.array(z.object({ at_utc_ms: Ms, value: Decimal }).strict()).max(64);
const Coverage = z.enum(["FULL_RETAINED_OOS", "SAMPLED_RETAINED_EQUITY"]);
const v2 = ResearchRetainedAnalyticsV2Schema._def.schema.shape;
export const ResearchAnalyticsAllTimeSchema = Head.extend({
  label: z.literal("all time"), basis: z.literal("ALL_TIME"), sparkline: Curve,
  sampling: z.literal("EXTREMA_BUCKET_V1"), source_observation_count: Count,
  coverage: Coverage, return_fraction: Decimal.nullable(), sharpe: ResearchRetainedAnalyticsV2FactSchema,
  max_drawdown_fraction: Decimal.nullable(), input_digest: Digest,
}).strict();
export const ResearchEnrichedAnalysisSchema = z.object({
  schema_version: z.literal("research.enriched-analysis.v1"), service: z.literal("enrich_analysis"), basis: z.literal("ALL_TIME"),
  lane: z.enum(["WFO", "FIXED"]), run_id: z.string().regex(/^rrun_[a-f0-9]{32}$/), input_digest: Digest,
  source_tables: z.array(z.object({ name: z.string().regex(/^[A-Z0-9_]{1,64}$/), row_count: Count, digest: Digest }).strict()).min(1).max(8),
  scope: z.object({ window: z.literal("OOS"), first_at_utc_ms: Ms, last_at_utc_ms: Ms,
    observation_count: Count.min(2), fold_count: Count.min(1).max(32), locator: z.string().min(1).max(256),
    benchmark_locator: z.string().min(1).max(256), coverage: Coverage, source_observation_count: Count.min(2),
  }).strict(),
  windows: z.object({ is: Head.strict(), oos: Head.strict(), holdout: Head.strict() }).strict(),
  facts: z.object({ metrics: v2.metrics, behaviour: v2.behaviour }).strict(),
  curves: z.object({ sampling: z.object({ source_observation_count: Count, emitted_point_count: Count.max(64), method: z.literal("EXTREMA_BUCKET_V1") }).strict(),
    strategy_rebased_100: Curve, benchmark_rebased_100: Curve, drawdown_fraction: Curve }).strict(),
  monthly_returns: Derived.extend({ includes_partial_months: z.literal(true),
    sampling: z.enum(["FULL", "TAIL_WINDOW_V1"]), total_period_count: Count, omitted_transport_period_count: Count,
    definition_id: z.literal("OOS_MONTH_CLOSE_OVER_FIRST_OOS_OR_PREVIOUS_OBSERVED_MONTH_CLOSE_V1"),
    values: z.array(z.object({ month_start_utc_ms: Ms, return_fraction: Decimal, observation_count: Count.positive(),
      expected_observation_count: Count.positive(), partial: z.boolean(), basis: z.enum(["FIRST_OOS_CLOSE", "PREVIOUS_OBSERVED_MONTH_CLOSE"]),
      base_at_utc_ms: Ms, close_at_utc_ms: Ms }).strict()).max(120),
  }).strict(),
  return_distribution: Derived.extend({ sampling: z.literal("UTC_DAY"), observation_count: Count,
    bucket_basis: z.literal("ALL_TIME_SOURCE_UTC_DAILY_RETURNS_12_BIN_V1"),
    buckets: z.array(z.object({ lower_inclusive: Decimal, upper: Decimal, upper_inclusive: z.enum(["true", "false"]), count: Count }).strict()).max(12),
  }).strict(),
  drawdown_episodes: Derived.extend({ total: Count, open_episode_present: z.boolean(), longest_open: z.boolean(),
    values: z.array(z.object({ start_utc_ms: Ms, trough_utc_ms: Ms, recovery_utc_ms: Ms.nullable(), depth_fraction: Decimal,
      duration_seconds: Ms }).strict()).max(10),
  }).strict(),
  library_summary: ResearchAnalyticsAllTimeSchema, rolling: z.null(),
}).strict().superRefine((block, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const scope = block.scope;
  if (scope.first_at_utc_ms >= scope.last_at_utc_ms || scope.observation_count > scope.source_observation_count
    || block.library_summary.input_digest !== block.input_digest || block.library_summary.coverage !== scope.coverage
    || new Set(block.source_tables.map(row => row.name)).size !== block.source_tables.length
    || Buffer.byteLength(JSON.stringify(block), "utf8") > 65_536) bad("enriched source binding/count/byte mismatch");
  for (const fact of [...Object.values(block.facts.metrics), ...Object.values(block.facts.behaviour), block.library_summary.sharpe]) {
    if (fact.input_digest !== block.input_digest) bad("enriched fact input digest mismatch");
  }
  for (const head of [block.windows.is, block.windows.oos, block.windows.holdout,
    block.monthly_returns, block.return_distribution, block.drawdown_episodes, block.library_summary]) {
    if ((head.state === "AVAILABLE") !== (head.reason_code === null)) bad("enriched state/reason mismatch");
  }
  // This version carries only OOS payloads: window metadata cannot claim otherwise.
  if (block.windows.is.state === "AVAILABLE" || block.windows.holdout.state === "AVAILABLE") bad("unsupported window payload");
  for (const curve of [...Object.values(block.curves).filter(Array.isArray), block.library_summary.sparkline] as Array<Array<{at_utc_ms: number}>>) {
    if (curve.some((p, i) => p.at_utc_ms < scope.first_at_utc_ms || p.at_utc_ms > scope.last_at_utc_ms
      || (i > 0 && p.at_utc_ms <= curve[i-1]!.at_utc_ms))) bad("enriched curve chronology/scope mismatch");
  }
  const monthly = block.monthly_returns, histogram = block.return_distribution;
  if (monthly.total_period_count !== monthly.values.length + monthly.omitted_transport_period_count
    || monthly.values.some((p, i) => p.base_at_utc_ms > p.close_at_utc_ms || (i > 0 && p.month_start_utc_ms <= monthly.values[i-1]!.month_start_utc_ms))) bad("enriched month count/scope mismatch");
  if (histogram.state === "AVAILABLE" && (histogram.buckets.length !== 12
    || histogram.buckets.reduce((sum, row) => sum + row.count, 0) !== histogram.observation_count)) bad("enriched daily histogram population mismatch");
  if (histogram.state !== "AVAILABLE" && histogram.buckets.length) bad("absent histogram carries values");
  if (block.drawdown_episodes.values.length !== Math.min(10, block.drawdown_episodes.total)
    || block.drawdown_episodes.longest_open && !block.drawdown_episodes.open_episode_present
    || block.drawdown_episodes.values.some(row => row.trough_utc_ms < row.start_utc_ms || row.trough_utc_ms > scope.last_at_utc_ms
      || (row.recovery_utc_ms !== null && row.recovery_utc_ms < row.trough_utc_ms) || Number(row.depth_fraction) > 0)) bad("enriched episode mismatch");
});
export type ResearchEnrichedAnalysis = z.infer<typeof ResearchEnrichedAnalysisSchema>;

/** Canonical hash and run/source binding are checked before any public projection. */
export function verifiedEnriched(value: unknown, digest: string | null | undefined, runId: string): ResearchEnrichedAnalysis | undefined {
  if (value == null) return undefined;
  const parsed = ResearchEnrichedAnalysisSchema.safeParse(typeof value === "string" ? JSON.parse(value) : value);
  if (!parsed.success || parsed.data.run_id !== runId || sha256ResearchJson(parsed.data) !== digest) {
    throw new Error("Enriched analysis does not match its immutable source binding");
  }
  return parsed.data;
}
