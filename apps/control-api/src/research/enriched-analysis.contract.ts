/** B6 immutable all-time supplement; computation never happens in a GET. */
import { z } from "zod";
import { ExactJsonCalculationMemo } from "./exact-json-calculation-memo";
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
const WindowHead = Head.extend({
  start_ms: Ms.optional(), end_ms: Ms.optional(), source_locator: z.string().min(1).max(256).optional(),
  bounds_semantics: z.literal("START_INCLUSIVE_END_EXCLUSIVE").optional(),
}).strict();
const DistributionPolicy = z.object({
  quantile_method: z.literal("LINEAR_TYPE_7"), probability: z.literal("0.95"),
  risk_variable: z.literal("LOSS_FRACTION_NEGATIVE_RETURN"), risk_sign: z.literal("SIGNED_LOSS_FRACTION"),
  tail: z.literal("LOSS_GTE_VAR_INCLUSIVE"), minimum_observations: z.literal(2),
}).strict();
const RegimeAbsence = z.object({
  state: z.literal("NOT_PUBLISHED"), reason_code: z.literal("SOURCE_DID_NOT_PUBLISH_MARKET_REGIME"), value: z.null(),
  source_locator: z.string().min(1).max(256), input_digest: Digest,
}).strict();
const Curve = z.array(z.object({ at_utc_ms: Ms, value: Decimal }).strict()).max(64);
/** Source-time IS only. The legacy v2 Fact intentionally remains OOS-only. */
const ISFact = z.object({ state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: Reason.nullable(), value: Decimal.nullable(), origin: z.enum(["ENGINE_DIRECT", "PORTAL_DERIVED"]),
  scope: z.literal("IS"), source_locator: z.string().min(1).max(256), input_digest: Digest,
}).strict().superRefine((fact, ctx) => {
  if ((fact.state === "AVAILABLE") !== (fact.value !== null)
    || (fact.state === "AVAILABLE") === (fact.reason_code !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "IS fact availability contradicts value/reason" });
  }
});
const ISPayload = z.object({ state: z.literal("AVAILABLE"), reason_code: z.null(), basis: z.literal("ALL_TIME"),
  scope: z.object({ window: z.literal("IS"), coverage: z.literal("FULL_SOURCE_IS"),
    start_ms: Ms, end_ms: Ms, source_locator: z.string().min(1).max(256),
    bounds_semantics: z.literal("START_INCLUSIVE_END_EXCLUSIVE"), first_at_utc_ms: Ms, last_at_utc_ms: Ms,
    observation_count: Count.min(2), source_table: z.literal("OBSERVATION_IS"), locator: z.string().min(1).max(256),
  }).strict(),
  facts: z.object({ metrics: z.object({ sharpe: ISFact, return_fraction: ISFact, max_drawdown_fraction: ISFact }).strict() }).strict(),
  return_basis: z.object({ definition_id: z.literal("FIRST_LAST_DECLARED_IS_EQUITY_V1"),
    start_equity: Decimal, end_equity: Decimal, first_at_utc_ms: Ms, last_at_utc_ms: Ms,
    source_locator: z.string().min(1).max(256),
  }).strict(),
  benchmark: Head.extend({ definition_id: z.literal("DECLARED_IS_SOURCE_CLOSE_REBASED_100_V1"),
    source_locator: z.string().min(1).max(256), input_digest: Digest,
  }).strict(),
  curves: z.object({ sampling: z.object({ source_observation_count: Count.min(2), emitted_point_count: Count.min(2).max(24),
    method: z.literal("EXTREMA_BUCKET_V1") }).strict(), strategy_rebased_100: Curve,
    benchmark_rebased_100: Curve, drawdown_fraction: Curve }).strict(),
  return_distribution: Derived.extend({ sampling: z.literal("UTC_DAY"), observation_count: Count,
    bucket_basis: z.literal("ALL_TIME_SOURCE_UTC_DAILY_RETURNS_12_BIN_V1"), statistics_policy: DistributionPolicy,
    mean: ISFact, median: ISFact, var_95: ISFact, cvar_95: ISFact,
    buckets: z.array(z.object({ lower_inclusive: Decimal, upper: Decimal,
      upper_inclusive: z.enum(["true", "false"]), count: Count }).strict()).max(12),
  }).strict(),
}).strict();
const Coverage = z.enum(["FULL_RETAINED_OOS", "SAMPLED_RETAINED_EQUITY"]);
const v2 = ResearchRetainedAnalyticsV2Schema._def.schema.shape;
export const ResearchAnalyticsAllTimeSchema = Head.extend({
  label: z.literal("all time"), basis: z.literal("ALL_TIME"), sparkline: Curve,
  sampling: z.literal("EXTREMA_BUCKET_V1"), source_observation_count: Count,
  coverage: Coverage, return_fraction: Decimal.nullable(), sharpe: ResearchRetainedAnalyticsV2FactSchema,
  return_basis: z.object({ definition_id: z.literal("FIRST_LAST_RETAINED_OOS_EQUITY_V1"),
    scope: z.literal("RETAINED_OOS_OBSERVATIONS"), first_at_utc_ms: Ms, last_at_utc_ms: Ms,
    start_equity: Decimal, end_equity: Decimal, source_locator: z.string().min(1).max(256),
  }).strict().optional(),
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
  windows: z.object({ is: WindowHead, oos: WindowHead, holdout: WindowHead }).strict(),
  by_window: z.object({ is: ISPayload }).strict().optional(),
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
    // Optional as a group: legacy immutable v1 bodies must retain identical bytes.
    statistics_policy: DistributionPolicy.optional(),
    mean: ResearchRetainedAnalyticsV2FactSchema.optional(), median: ResearchRetainedAnalyticsV2FactSchema.optional(),
    var_95: ResearchRetainedAnalyticsV2FactSchema.optional(), cvar_95: ResearchRetainedAnalyticsV2FactSchema.optional(),
    buckets: z.array(z.object({ lower_inclusive: Decimal, upper: Decimal, upper_inclusive: z.enum(["true", "false"]), count: Count }).strict()).max(12),
  }).strict(),
  drawdown_episodes: Derived.extend({ total: Count, open_episode_present: z.boolean(), longest_open: z.boolean(),
    values: z.array(z.object({ start_utc_ms: Ms, trough_utc_ms: Ms, recovery_utc_ms: Ms.nullable(), depth_fraction: Decimal,
      duration_seconds: Ms, label: z.string().min(1).max(96).optional(), regime: RegimeAbsence.optional() }).strict()).max(10),
  }).strict(),
  library_summary: ResearchAnalyticsAllTimeSchema, rolling: z.null(),
}).strict().superRefine((block, ctx) => {
  const bad = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  const scope = block.scope;
  if (scope.first_at_utc_ms >= scope.last_at_utc_ms || scope.observation_count > scope.source_observation_count
    || block.library_summary.input_digest !== block.input_digest || block.library_summary.coverage !== scope.coverage
    || new Set(block.source_tables.map(row => row.name)).size !== block.source_tables.length
    || Buffer.byteLength(JSON.stringify(block), "utf8") > 65_536) bad("enriched source binding/count/byte mismatch");
  const returnBasis = block.library_summary.return_basis;
  if (returnBasis && (returnBasis.first_at_utc_ms !== scope.first_at_utc_ms
    || returnBasis.last_at_utc_ms !== scope.last_at_utc_ms || returnBasis.source_locator !== scope.locator
    || Number(returnBasis.start_equity) <= 0 || Number(returnBasis.end_equity) <= 0
    || !Number.isFinite(Number(returnBasis.start_equity)) || !Number.isFinite(Number(returnBasis.end_equity))
    || block.library_summary.return_fraction === null)) bad("enriched return basis/scope mismatch");
  for (const fact of [...Object.values(block.facts.metrics), ...Object.values(block.facts.behaviour), block.library_summary.sharpe]) {
    if (fact.input_digest !== block.input_digest) bad("enriched fact input digest mismatch");
  }
  const statistics = [block.return_distribution.mean, block.return_distribution.median,
    block.return_distribution.var_95, block.return_distribution.cvar_95];
  if ([block.return_distribution.statistics_policy, ...statistics].some(value => value !== undefined)
    && [block.return_distribution.statistics_policy, ...statistics].some(value => value === undefined)) bad("enriched distribution statistics/policy incomplete");
  for (const fact of statistics) {
    if (fact && (fact.input_digest !== block.input_digest || fact.origin !== "PORTAL_DERIVED")) bad("enriched distribution fact binding/origin mismatch");
    if (fact?.state === "AVAILABLE" && (scope.coverage !== "FULL_RETAINED_OOS" || block.return_distribution.observation_count < 2)) bad("enriched distribution statistics require a complete daily population");
  }
  for (const head of [block.windows.is, block.windows.oos, block.windows.holdout,
    block.monthly_returns, block.return_distribution, block.drawdown_episodes, block.library_summary]) {
    if ((head.state === "AVAILABLE") !== (head.reason_code === null)) bad("enriched state/reason mismatch");
  }
  // Metadata alone cannot enable IS; no version of this supplement evaluates holdout.
  const is = block.by_window?.is;
  if ((block.windows.is.state === "AVAILABLE") !== Boolean(is)
    || block.windows.holdout.state === "AVAILABLE") bad("unsupported or missing window payload");
  if (is) {
    const s = is.scope, bound = block.windows.is, table = block.source_tables.find(row => row.name === s.source_table);
    const rb = is.return_basis, c = is.curves, hist = is.return_distribution;
    if (block.lane !== "FIXED" || scope.coverage !== "FULL_RETAINED_OOS"
      || !table || table.row_count !== s.observation_count || s.start_ms >= s.end_ms
      || s.first_at_utc_ms >= s.last_at_utc_ms || s.first_at_utc_ms < s.start_ms || s.last_at_utc_ms >= s.end_ms
      || s.end_ms > scope.first_at_utc_ms || bound.start_ms !== s.start_ms || bound.end_ms !== s.end_ms
      || bound.source_locator !== s.source_locator || bound.bounds_semantics !== s.bounds_semantics
      || block.windows.oos.start_ms !== undefined && block.windows.oos.start_ms !== s.end_ms
      || c.sampling.source_observation_count !== s.observation_count
      || c.sampling.emitted_point_count !== c.strategy_rebased_100.length
      || c.sampling.emitted_point_count > s.observation_count) bad("IS source/window/count binding mismatch");
    if (rb.first_at_utc_ms !== s.first_at_utc_ms || rb.last_at_utc_ms !== s.last_at_utc_ms || rb.source_locator !== s.locator
      || !Number.isFinite(Number(rb.start_equity)) || !Number.isFinite(Number(rb.end_equity))
      || Number(rb.start_equity) <= 0 || Number(rb.end_equity) <= 0
      || is.facts.metrics.return_fraction.state !== "AVAILABLE"
      || is.facts.metrics.max_drawdown_fraction.state !== "AVAILABLE"
      || Number(is.facts.metrics.max_drawdown_fraction.value) > 0) bad("IS return/drawdown basis mismatch");
    const isStatistics = [hist.mean, hist.median, hist.var_95, hist.cvar_95];
    for (const fact of [...Object.values(is.facts.metrics), ...isStatistics]) {
      if (fact.input_digest !== block.input_digest) bad("IS fact digest mismatch");
    }
    if (is.facts.metrics.sharpe.origin !== "ENGINE_DIRECT" || is.facts.metrics.max_drawdown_fraction.origin !== "ENGINE_DIRECT"
      || is.facts.metrics.return_fraction.origin !== "PORTAL_DERIVED" || isStatistics.some(f => f.origin !== "PORTAL_DERIVED"
        || f.state === "AVAILABLE" && hist.observation_count < 2)) bad("IS fact origin/population mismatch");
    for (const head of [is.benchmark, hist]) {
      if ((head.state === "AVAILABLE") !== (head.reason_code === null)) bad("IS state/reason mismatch");
    }
    if (is.benchmark.input_digest !== block.input_digest
      || (is.benchmark.state === "AVAILABLE") !== (c.benchmark_rebased_100.length >= 2)) bad("IS benchmark availability/binding mismatch");
    for (const curve of [c.strategy_rebased_100, c.benchmark_rebased_100, c.drawdown_fraction]) {
      if (curve.length > 24 || curve.length > s.observation_count
        || curve.some((p, i) => p.at_utc_ms < s.first_at_utc_ms || p.at_utc_ms > s.last_at_utc_ms
          || i > 0 && p.at_utc_ms <= curve[i - 1]!.at_utc_ms)
        || curve.length && (curve[0]!.at_utc_ms !== s.first_at_utc_ms || curve.at(-1)!.at_utc_ms !== s.last_at_utc_ms)) bad("IS curve chronology/endpoints mismatch");
    }
    if (c.drawdown_fraction.length < 2 || Number(c.strategy_rebased_100[0]?.value) !== 100
      || c.benchmark_rebased_100.length && Number(c.benchmark_rebased_100[0]!.value) !== 100
      || c.drawdown_fraction.some(p => Number(p.value) > 0)) bad("IS curve normalization mismatch");
    if (hist.state === "AVAILABLE" && (hist.buckets.length !== 12
      || hist.buckets.reduce((sum, row) => sum + row.count, 0) !== hist.observation_count)
      || hist.state !== "AVAILABLE" && hist.buckets.length) bad("IS histogram population mismatch");
  } else if (block.source_tables.some(row => row.name === "OBSERVATION_IS")) bad("IS source table without source-time payload");
  for (const [kind, window] of Object.entries(block.windows)) {
    const bounds = [window.start_ms, window.end_ms, window.source_locator, window.bounds_semantics];
    if (bounds.some(value => value !== undefined)) {
      if (bounds.some(value => value === undefined) || window.start_ms! >= window.end_ms!) bad("enriched window bounds incomplete/invalid");
      if (kind === "oos" && (window.start_ms! > scope.first_at_utc_ms || window.end_ms! <= scope.last_at_utc_ms)) bad("enriched OOS bounds do not contain source scope");
    }
  }
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
  if (block.drawdown_episodes.values.some(row => row.regime && row.regime.input_digest !== block.input_digest)) bad("enriched regime source binding mismatch");
});
export type ResearchEnrichedAnalysis = z.infer<typeof ResearchEnrichedAnalysisSchema>;

/** Canonical hash and run/source binding are checked before any public projection. */
const verifiedObjects = new WeakMap<object, {
  digest: string; runId: string; parsed: ResearchEnrichedAnalysis;
}>();
const verifiedCalculations = new ExactJsonCalculationMemo<ResearchEnrichedAnalysis>();

function freezeJson(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const nested of Object.values(value)) freezeJson(nested);
  Object.freeze(value);
}

export function verifiedEnriched(value: unknown, digest: string | null | undefined, runId: string): ResearchEnrichedAnalysis | undefined {
  if (value == null) return undefined;
  // Coalesced Library pages share the same DB-returned supplement object.
  // Verify it once, not once per viewer/card. This is NOT a data/authority
  // cache: a fresh DB object's exact bytes/binding are always checked before
  // pure verification work is reused. Weak keys retain no history.
  const object = typeof value === "object" ? value : undefined;
  const cached = object ? verifiedObjects.get(object) : undefined;
  if (cached) {
    if (cached.digest !== digest || cached.runId !== runId) {
      throw new Error("Enriched analysis does not match its immutable source binding");
    }
    return cached.parsed;
  }
  const verified = verifiedCalculations.calculate({ value, digest, runId }, () => {
    const result = ResearchEnrichedAnalysisSchema.safeParse(typeof value === "string" ? JSON.parse(value) : value);
    if (!result.success || result.data.run_id !== runId || sha256ResearchJson(result.data) !== digest) {
      throw new Error("Enriched analysis does not match its immutable source binding");
    }
    return result.data;
  });
  // Preserve the former per-DB-object identity boundary; only exact-byte
  // calculation work is shared, not mutable projection objects or authority.
  const parsed = structuredClone(verified);
  if (object) {
    freezeJson(object);
    freezeJson(parsed);
    verifiedObjects.set(object, { digest: digest!, runId, parsed });
  }
  return parsed;
}
