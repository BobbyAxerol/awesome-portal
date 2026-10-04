/** P13 Evidence Flow Hub projection builder and same-origin reader. */

import { Inject, Injectable, Optional } from "@nestjs/common";
import { readRunDeclaration } from "./run-declaration.read";
import { failedAt } from "./run-state";
import { enrichedAvailability } from "./enriched-analysis.contract";
import { z } from "zod";
import { ResearchRetainedAnalyticsSchema, type ResearchRetainedAnalytics } from "./retained-analytics.contract";
import { ResearchRetainedAnalyticsV2Schema, type ResearchRetainedAnalyticsV2 } from "./retained-analytics-v2.contract";

import { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import { ResearchMethodologyClaimsService, type MethodologyClaim } from "./methodology-claims";
import { ResearchEvidenceCandleOverviewSchema } from "./evidence-candle-overview.contract";
import {
  ResearchEvidenceCandleOverviewSourceSchema,
  ResearchEvidenceHubResponseSchema,
  ResearchEvidenceSeriesResponseSchema,
  type ResearchEvidenceCandleOverviewSource,
  type ResearchEvidenceHubResponse,
  type ResearchEvidenceOosAnalyticsSource,
  type ResearchEvidenceSeriesKind,
  type ResearchEvidenceSeriesResponse,
} from "./evidence.contract";
import { ResearchEvidenceError } from "./evidence.error";
import { isCurrentSourceLanePair } from "./current-source.repository";
import {
  RESEARCH_METRIC_REGISTRY_VERSION,
  RESEARCH_PERFORMANCE_METRIC_DEFINITIONS,
  RESEARCH_PERFORMANCE_METRIC_REGISTRY_VERSION,
  RESEARCH_WARNING_DEFINITIONS,
  researchMetricDefinitions,
  type ResearchMetricRegistryVersion,
} from "./evidence-metric-registry";
import {
  ResearchEvidenceRepository,
  type EvidenceHubRow,
  type EvidenceProjectionWrite,
  type EvidenceRunInputBinding,
  type EvidenceSeriesRow,
} from "./evidence.repository";
import { sha256ResearchJson } from "./preflight.service";
import { ResearchRequestedSpecSchema } from "./preflight.contract";
import { evidenceDatasetCoverage, evidenceWindowDisclosure } from "./evidence.coverage";
import {
  ResearchEvidenceSourceSchema,
  ResearchProgressSnapshotSchema,
  type ResearchEvidenceSource,
  type ResearchProgressIngress,
  type ResearchProgressSnapshot,
} from "./progress.contract";
import type { ProgressIngressScope } from "./progress.repository";

type Availability = {
  state: "AVAILABLE" | "NOT_PUBLISHED" | "PENDING_SOURCE_CALLBACK" | "LEGACY_METADATA_ONLY" | "NOT_APPLICABLE";
  reason_code: string | null;
};

type StoredSeriesIdentity = {
  digest: string;
  source_observation_count: number | null;
  emitted_point_count: number;
  sampling: "FULL" | "EXTREMA_BUCKET_V1" | "TAIL_WINDOW_V1" | "FULL_RETURN_HISTOGRAM_V2" | null;
};

type CoreSeriesKind = "EQUITY_OOS" | "MONTHLY_RETURNS" | "ROLLING_RETURNS_20" | "RETURN_DISTRIBUTION";
type AnalyticsSeriesKind = "ROLLING_SHARPE_63" | "ROLLING_BETA_63";

/** RF-05: the analytics facts a projection keeps (rolling points live in the series table). */
type StoredOosAnalytics = Omit<ResearchEvidenceOosAnalyticsSource, "rolling_sharpe_63" | "rolling_beta_63" | "monthly_leading">;

interface StoredProjection {
  summary_analytics?: ResearchRetainedAnalytics;
  summary_analytics_v2?: ResearchRetainedAnalyticsV2;
  schema_version: "research.evidence-projection.v1";
  source: ResearchEvidenceSource["source"];
  /** Bound into the immutable projection digest; never reconstructed on read. */
  source_evidence_digest?: string;
  transform_revision?: "P13_SOURCE_R1" | "P13_SOURCE_R2";
  metric_registry_version?: ResearchMetricRegistryVersion;
  direct: ResearchEvidenceSource["direct"];
  derived: Pick<ResearchEvidenceSource["derived"], "net_return_fraction" | "max_drawdown_fraction">;
  unavailable: ResearchEvidenceSource["unavailable"];
  series: Record<CoreSeriesKind, Availability> & Partial<Record<AnalyticsSeriesKind, Availability>>;
  series_identity?: Record<CoreSeriesKind, StoredSeriesIdentity> & Partial<Record<AnalyticsSeriesKind, StoredSeriesIdentity>>;
  /**
   * RF-05 CG-P13-11: binds the revision to this run's immutable inputs so two
   * runs with byte-identical evidence still get distinct revisions.
   */
  run_binding?: { run_id: string } & EvidenceRunInputBinding;
  /** RF-05 CG-P13-03: engine OOS performance facts, verbatim from the receipt. */
  oos_analytics?: StoredOosAnalytics;
  /** RF-05 CG-P13-06: present only when the leading-month fact was not prepended. */
  monthly_leading?: { state: "NOT_APPLIED"; reason_code: "P13_LEADING_MONTH_NOT_CONTIGUOUS_WITH_SOURCE_MONTHS" };
  /**
   * E16-R1: the child's bounded OHLC overview, verbatim.  It rides in this
   * jsonb rather than the lazy series table because it is one bounded block
   * with its own envelope, not a sixth chart kind, and the P13 series
   * vocabulary stays exactly the four charts plus RF-05's two.
   */
  candle_overview?: unknown;
}

const SERIES_KINDS: readonly ResearchEvidenceSeriesKind[] = [
  "EQUITY_OOS", "MONTHLY_RETURNS", "ROLLING_RETURNS_20", "RETURN_DISTRIBUTION",
  "ROLLING_SHARPE_63", "ROLLING_BETA_63",
];

/** RF-05 CG-P13-13: bumps every series ETag whenever the read-side body rule changes. */
const EVIDENCE_SERIES_REPRESENTATION_VERSION = "research.evidence-series.v1+rf05.1";

/** RF-05: a projection sealed before the child published `oos_analytics`. */
const PREDATES_OOS_ANALYTICS = "P13_SOURCE_PREDATES_OOS_ANALYTICS";

/**
 * E16-R1 · the two ways a run has no retained OHLC overview.  They stay
 * distinct: the first is every run sealed before the producer retained one
 * (its tape is gone and no backfill can invent it), the second is a stored
 * block this reader can no longer validate.
 */
export const PREDATES_CANDLE_OVERVIEW = "P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW";
export const CANDLE_OVERVIEW_INCOMPATIBLE = "P13_RETAINED_CANDLE_OVERVIEW_IS_INCOMPATIBLE";

/** What `bundle()` publishes about the run's retained OHLC overview. */
export type EvidenceCandleOverview =
  | { state: "AVAILABLE"; reason_code: null; value: ResearchEvidenceCandleOverviewSource }
  | { state: "NOT_PUBLISHED"; reason_code: string; value: null };

/** RF-05 CG-P13-06: an AVAILABLE series never carries zero points. */
const EMPTY_SERIES_REASON: Record<ResearchEvidenceSeriesKind, string> = {
  EQUITY_OOS: "P13_SOURCE_EMITTED_NO_OOS_EQUITY",
  MONTHLY_RETURNS: "P13_OOS_HAS_NO_MONTH_WITH_PRIOR_CALENDAR_CLOSE",
  ROLLING_RETURNS_20: "P04_OOS_OBSERVATIONS_BELOW_ROLLING_WINDOW",
  RETURN_DISTRIBUTION: "P04_SOURCE_DID_NOT_PUBLISH_FINITE_RETURN_OBSERVATIONS",
  ROLLING_SHARPE_63: "P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW",
  ROLLING_BETA_63: "P04_SOURCE_DID_NOT_PUBLISH_BENCHMARK",
};

/**
 * RF-05 CG-P13-10: the run-library wording, derived by the same rule as
 * `research.run_library_rows_v1.effective_status` (job state, else durable).
 */
function displayStatus(jobState: string | null, runState: string | null) {
  const state = jobState ?? runState;
  if (state === null) return null;
  if (state === "SUCCEEDED" || state === "READY") return "COMPLETED" as const;
  if (state === "FAILED") return "FAILED" as const;
  if (state === "CANCELLED") return "CANCELLED" as const;
  if (state === "RUNNING" || state === "CLAIMED" || state === "SEALING" || state === "CANCEL_REQUESTED") return "RUNNING" as const;
  if (state === "DRAFT") return "DRAFT" as const;
  if (state === "RECOVERY_REQUIRED") return "RECOVERY_REQUIRED" as const;
  return "QUEUED" as const;
}

const DURABLE_RUN_STATES = [
  "DRAFT", "QUEUED", "RUNNING", "SEALING", "READY", "FAILED", "CANCELLED", "RECOVERY_REQUIRED",
] as const;

type DurableRunState = typeof DURABLE_RUN_STATES[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function availability(state: Availability["state"], reasonCode: string | null): Availability {
  return { state, reason_code: reasonCode };
}

function notPublished(reason: string): Availability {
  return availability("NOT_PUBLISHED", reason);
}

function notApplicable(reason: string): Availability {
  return availability("NOT_APPLICABLE", reason);
}

function isDurableRunState(value: string | null | undefined): value is DurableRunState {
  return typeof value === "string" && (DURABLE_RUN_STATES as readonly string[]).includes(value);
}

const StoredUnavailableSchema = z.object({
  state: z.enum(["NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/),
}).strict();

const StoredSeriesAvailabilitySchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable(),
}).strict();

const StoredIdentitySchema = (sampling: z.ZodTypeAny) => z.object({
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  source_observation_count: z.number().int().nonnegative().nullable(),
  emitted_point_count: z.number().int().nonnegative(),
  sampling,
}).strict();

const StoredProjectionSchema = z.object({
  schema_version: z.literal("research.evidence-projection.v1"),
  source: z.object({
    execution_adapter_id: z.enum(["p04.delta-rsi.v1", "p17.imported-signal-notional.v1"]),
    engine_version: z.enum(["1.1.0", "1.1.1"]),
    input_scope: z.literal("P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY"),
    oos_observation_count: z.number().int().positive().max(2_000_000),
    emitted_equity_points: z.number().int().positive().max(192),
    chart_sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]),
    source_transform_digest: z.string().regex(/^[0-9a-f]{64}$/),
    evidence_transform_revision: z.literal("P13_SOURCE_R2").optional(),
    /** Deprecated R1 broad label; R2 publishes per-fact scopes below. */
    direct_metrics_scope: z.literal("FULL_CHILD_TAPE").optional(),
    direct_metric_scopes: z.object({
      initial_equity: z.literal("OOS_EQUITY_SERIES"),
      final_equity: z.literal("OOS_EQUITY_SERIES"),
      num_trades: z.literal("FULL_CHILD_TAPE"),
      bars: z.literal("FULL_CHILD_TAPE"),
    }).strict().optional(),
    // The source receipt itself is validated before it reaches this private
    // projection.  Keep the stored reader compatible with additive R2
    // metadata without asking it to fabricate a replacement receipt.
    series_metadata: z.unknown().optional(),
  }).strict(),
  direct: z.object({
    initial_equity: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96),
    final_equity: z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96),
    num_trades: z.string().regex(/^[0-9]+$/).max(24),
    bars: z.string().regex(/^[0-9]+$/).max(24),
  }).strict(),
  derived: z.object({
    net_return_fraction: z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96),
    max_drawdown_fraction: z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96),
  }).strict(),
  unavailable: z.object({
    benchmark: StoredUnavailableSchema,
    funding: StoredUnavailableSchema,
    audited_fills: StoredUnavailableSchema,
    per_fold_metrics: StoredUnavailableSchema,
  }).strict(),
  series: z.object({
    EQUITY_OOS: StoredSeriesAvailabilitySchema,
    MONTHLY_RETURNS: StoredSeriesAvailabilitySchema,
    ROLLING_RETURNS_20: StoredSeriesAvailabilitySchema,
    RETURN_DISTRIBUTION: StoredSeriesAvailabilitySchema,
    ROLLING_SHARPE_63: StoredSeriesAvailabilitySchema.optional(),
    ROLLING_BETA_63: StoredSeriesAvailabilitySchema.optional(),
  }).strict(),
  source_evidence_digest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  transform_revision: z.enum(["P13_SOURCE_R1", "P13_SOURCE_R2"]).optional(),
  metric_registry_version: z.enum(["research.metric-registry.v1", RESEARCH_METRIC_REGISTRY_VERSION]).optional(),
  series_identity: z.object({
    EQUITY_OOS: z.object({ digest: z.string().regex(/^[0-9a-f]{64}$/), source_observation_count: z.number().int().positive(), emitted_point_count: z.number().int().nonnegative(), sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]).nullable() }).strict(),
    MONTHLY_RETURNS: z.object({ digest: z.string().regex(/^[0-9a-f]{64}$/), source_observation_count: z.number().int().positive(), emitted_point_count: z.number().int().nonnegative(), sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1", "TAIL_WINDOW_V1"]).nullable() }).strict(),
    ROLLING_RETURNS_20: z.object({ digest: z.string().regex(/^[0-9a-f]{64}$/), source_observation_count: z.number().int().nonnegative(), emitted_point_count: z.number().int().nonnegative(), sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]).nullable() }).strict(),
    RETURN_DISTRIBUTION: z.object({ digest: z.string().regex(/^[0-9a-f]{64}$/), source_observation_count: z.number().int().nonnegative(), emitted_point_count: z.number().int().nonnegative(), sampling: z.literal("FULL_RETURN_HISTOGRAM_V2").nullable() }).strict(),
    ROLLING_SHARPE_63: StoredIdentitySchema(z.enum(["FULL", "EXTREMA_BUCKET_V1"]).nullable()).optional(),
    ROLLING_BETA_63: StoredIdentitySchema(z.null()).optional(),
  }).strict().optional(),
  run_binding: z.object({
    run_id: z.string().min(1).max(128),
    requested_spec_digest: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    effective_spec_digest: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    dataset_binding_digest: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
    manifest_digest: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  }).strict().optional(),
  oos_analytics: z.object({
    schema_version: z.literal("research.p13.oos-analytics.v1"),
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable(),
    scope_locator: z.string().min(1).max(256).nullable(),
    report_locator: z.string().min(1).max(256).nullable(),
    return_sample: z.unknown(),
    metrics: z.record(z.string(), z.unknown()),
  }).strict().optional(),
  monthly_leading: z.object({
    state: z.literal("NOT_APPLIED"),
    reason_code: z.literal("P13_LEADING_MONTH_NOT_CONTIGUOUS_WITH_SOURCE_MONTHS"),
  }).strict().optional(),
  summary_analytics: ResearchRetainedAnalyticsSchema.optional(),
  summary_analytics_v2: ResearchRetainedAnalyticsV2Schema.optional(),
  /**
   * E16-R1.  Read back loosely on purpose: the block is re-validated against
   * its own schema in `bundle()`, so a stored overview that a later contract
   * would reject degrades to one typed absence instead of failing the whole
   * Hub read that Screens 04 and 08 depend on.
   */
  candle_overview: z.unknown().optional(),
}).strict().superRefine((value, context) => {
  if (value.transform_revision === "P13_SOURCE_R2" && !value.source.direct_metric_scopes) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "P13 R2 projection omits direct metric scope" });
  }
  if (value.metric_registry_version === "research.metric-registry.v2" && value.transform_revision !== "P13_SOURCE_R2") {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "P13 metric registry v2 requires corrected source transform" });
  }
});

function parseProjection(value: unknown): StoredProjection | null {
  const parsed = StoredProjectionSchema.safeParse(value);
  return parsed.success ? parsed.data as StoredProjection : null;
}

function candleOverviewOf(projection: StoredProjection | null): EvidenceCandleOverview {
  const stored = projection?.candle_overview;
  if (stored === undefined) return { state: "NOT_PUBLISHED", reason_code: PREDATES_CANDLE_OVERVIEW, value: null };
  const legacy = ResearchEvidenceCandleOverviewSchema.safeParse(stored);
  // Read already-retained OHLC, never reload/backfill a tape. Legacy numeric
  // transitions counted position changes, not executions; the canonical
  // marker vocabulary must keep them null rather than relabel them as fills.
  const canonical = legacy.success ? {
    ...legacy.data,
    state: "AVAILABLE",
    reason_code: null,
    scope: "OOS_EQUITY_WINDOW",
    values: legacy.data.values.map((bucket) => ({ ...bucket, transitions: null })),
  } : stored;
  const parsed = ResearchEvidenceCandleOverviewSourceSchema.safeParse(canonical);
  if (!parsed.success) return { state: "NOT_PUBLISHED", reason_code: CANDLE_OVERVIEW_INCOMPATIBLE, value: null };
  if (parsed.data.state !== "AVAILABLE") {
    // The child's own reason survives the round trip: "this tape had no
    // priced bar" must not read as "this run predates the overview".
    return { state: "NOT_PUBLISHED", reason_code: parsed.data.reason_code ?? PREDATES_CANDLE_OVERVIEW, value: null };
  }
  return { state: "AVAILABLE", reason_code: null, value: parsed.data };
}

function marketOverviewOf(projection: StoredProjection | null) {
  const overview = candleOverviewOf(projection);
  const value = overview.value;
  const legacy = ResearchEvidenceCandleOverviewSchema.safeParse(projection?.candle_overview);
  const reason = overview.reason_code === PREDATES_CANDLE_OVERVIEW
    ? "P04_SOURCE_PREDATES_E16_CANDLE_OVERVIEW" : overview.reason_code;
  return {
    state: overview.state,
    reason_code: reason,
    semantics: "BOUNDED_SOURCE_OVERVIEW_NOT_PER_BAR_REPLAY" as const,
    data: value ? legacy.success ? legacy.data : {
      source_bar_count: value.source_bar_count!,
      emitted_bucket_count: value.emitted_bucket_count,
      bucket_bars: value.bucket_bars!,
      sampling: value.sampling!,
      envelope: value.envelope!,
      values: value.values,
    } : null,
    availability: overview.state === "AVAILABLE"
      ? availability("AVAILABLE", null) : notPublished(reason!),
  };
}

function sourceAbsenceAvailability(value: { state: "NOT_PUBLISHED" | "NOT_APPLICABLE"; reason_code: string }): Availability {
  return availability(value.state, value.reason_code);
}

@Injectable()
export class ResearchEvidenceService {
  constructor(
    private readonly repository: ResearchEvidenceRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Optional() private readonly methodologyClaims?: ResearchMethodologyClaimsService,
  ) {}

  /** Materialize only the source document bound to a terminal P11 event. */
  async ingest(scope: ProgressIngressScope, input: ResearchProgressIngress): Promise<void> {
    if (input.evidence === undefined) return;
    if (input.event.event_type !== "run_completed") {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INVALID", "Evidence may only accompany a completed Research run.", 400);
    }
    const source = ResearchEvidenceSourceSchema.safeParse(input.evidence);
    if (!source.success) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INVALID", "Research evidence source payload is invalid.", 400);
    }
    const eventDigest = input.event.payload.evidence_digest;
    const sourceDigest = sha256ResearchJson(source.data);
    if (typeof eventDigest !== "string" || eventDigest !== sourceDigest) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_CONFLICT", "Research evidence does not match its terminal source digest.", 409);
    }
    const binding = await this.repository.inputBinding(scope, input.run_id);
    const write = this.buildWrite(input.run_id, input.event.sequence, source.data, sourceDigest, binding);
    await this.repository.persist(scope, write);
  }

  async hub(scope: ResearchScope, runId: string, signal?: AbortSignal, user?: PortalUser): Promise<ResearchEvidenceHubResponse> {
    this.requireEnabled();
    const row = await this.repository.hub(scope, runId, signal);
    if (!row) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_NOT_FOUND", "Research run was not found.", 404);
    }
    const requested = ResearchRequestedSpecSchema.safeParse(row.requestedSpec);
    const claims = user && this.methodologyClaims ? await this.methodologyClaims.read(user, scope, runId, {
      releaseId: requested.success ? requested.data.client.engine_release_id : null,
      mode: requested.success ? requested.data.optimization_mode : null,
      schedule: requested.success ? requested.data.optimization_schedule : null,
      routeId: requested.success ? requested.data.execution_route : null,
    }, row.runState === "READY" || row.jobState === "SUCCEEDED", "EVIDENCE") : undefined;
    const response = this.mapHub(row, claims);
    const parsed = ResearchEvidenceHubResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence Hub response is incompatible.", 503);
    }
    return parsed.data;
  }

  async series(
    scope: ResearchScope,
    runId: string,
    kind: ResearchEvidenceSeriesKind,
    signal?: AbortSignal,
  ): Promise<ResearchEvidenceSeriesResponse> {
    this.requireEnabled();
    // A standalone chart read still gets the same repeatable-read revision
    // fence as Replay.  A missing chart remains a typed source state rather
    // than a misleading 404 on an otherwise valid run.
    const bundle = await this.bundle(scope, runId, [kind], signal);
    const row = bundle.series.get(kind);
    if (!row) {
      // `bundle()` always creates an explicit absence for the requested kind.
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence series bundle is incomplete.", 503);
    }
    const parsed = ResearchEvidenceSeriesResponseSchema.safeParse(row);
    if (!parsed.success) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence series response is incompatible.", 503);
    }
    return parsed.data;
  }

  /**
   * Read a Hub and named series behind one repository revision fence.  Replay
   * and any future multi-panel BFF must use this instead of composing `hub()`
   * and `series()` in separate transactions.
   */
  async bundle(
    scope: ResearchScope,
    runId: string,
    kinds: readonly ResearchEvidenceSeriesKind[],
    signal?: AbortSignal,
  ): Promise<{
    hub: ResearchEvidenceHubResponse;
    series: Map<ResearchEvidenceSeriesKind, ResearchEvidenceSeriesResponse>;
    /** E16-R1: the run's retained OHLC overview, behind the same revision fence. */
    candleOverview: EvidenceCandleOverview;
  }> {
    this.requireEnabled();
    const stored = await this.repository.bundle(scope, runId, kinds, signal);
    if (!stored.hub) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_NOT_FOUND", "Research run was not found.", 404);
    }
    const hub = this.mapHub(stored.hub);
    const parsedHub = ResearchEvidenceHubResponseSchema.safeParse(hub);
    if (!parsedHub.success) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence Hub response is incompatible.", 503);
    }
    const values = new Map<ResearchEvidenceSeriesKind, ResearchEvidenceSeriesResponse>();
    const projection = stored.hub.projection ? parseProjection(stored.hub.projection) : null;
    if (stored.hub.projection && !projection) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence bundle projection is incompatible.", 503);
    }
    if (projection?.source_evidence_digest && projection.source_evidence_digest !== stored.hub.sourceEvidenceDigest) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence bundle source binding is incompatible.", 503);
    }
    for (const kind of kinds) {
      const row = stored.series.get(kind);
      const expectedIdentity = projection?.series_identity?.[kind];
      if (row && expectedIdentity && (
        row.digest !== expectedIdentity.digest
        || row.sourceObservationCount !== expectedIdentity.source_observation_count
        || row.emittedPointCount !== expectedIdentity.emitted_point_count
        || row.sampling !== expectedIdentity.sampling
      )) {
        throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence bundle series binding is incompatible.", 503);
      }
      let response = row ? this.mapStoredSeries(runId, row) : this.absentSeries(stored.hub, kind);
      const enriched = stored.hub.enrichedAnalysis;
      if (enriched && parsedHub.data.revision && (kind === "MONTHLY_RETURNS" || kind === "RETURN_DISTRIBUTION")) {
        const monthly = kind === "MONTHLY_RETURNS";
        const head = monthly ? enriched.monthly_returns : enriched.return_distribution;
        const body = { schema_version: "research.evidence-series.v1" as const, run_id: runId,
          revision: parsedHub.data.revision, kind, availability: availability(head.state, head.reason_code),
          source_sample: { source_observation_count: monthly ? enriched.scope.observation_count : enriched.return_distribution.observation_count,
            emitted_point_count: monthly ? enriched.monthly_returns.values.length : enriched.return_distribution.buckets.length,
            sampling: head.state === "AVAILABLE" ? monthly ? enriched.monthly_returns.sampling : "FULL_RETURN_HISTOGRAM_V2" as const : null },
          values: monthly ? enriched.monthly_returns.values.map(point => ({ month_start_utc_ms: point.month_start_utc_ms, return_fraction: point.return_fraction }))
            : enriched.return_distribution.buckets.map(point => ({ ...point, count: String(point.count) })) };
        response = { ...body, etag: `"p13r1_${sha256ResearchJson(body)}"` };
      }
      const parsed = ResearchEvidenceSeriesResponseSchema.safeParse(response);
      if (!parsed.success || (row && parsed.data.revision !== parsedHub.data.revision)) {
        throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence bundle is incompatible.", 503);
      }
      values.set(kind, parsed.data);
    }
    return { hub: parsedHub.data, series: values, candleOverview: candleOverviewOf(projection) };
  }

  private buildWrite(
    runId: string,
    sourceEventSequence: number,
    source: ResearchEvidenceSource,
    sourceDigest: string,
    binding: EvidenceRunInputBinding | null = null,
  ): EvidenceProjectionWrite {
    const distribution = source.derived.return_distribution;
    const analytics = source.oos_analytics;
    const { months: monthly, note: monthlyLeadingNote } = this.monthlyWithLeadingBoundary(source);
    const series: EvidenceProjectionWrite["series"] = [
      {
        kind: "EQUITY_OOS", availabilityState: "AVAILABLE", reasonCode: null,
        sourceObservationCount: source.source.series_metadata?.equity_oos.source_observation_count
          ?? source.source.oos_observation_count,
        emittedPointCount: source.equity_points.length, sampling: source.source.chart_sampling,
        values: source.equity_points, digest: sha256ResearchJson(source.equity_points),
      },
      {
        kind: "MONTHLY_RETURNS", availabilityState: "AVAILABLE", reasonCode: null,
        sourceObservationCount: source.source.series_metadata?.monthly_returns.source_observation_count
          ?? source.source.oos_observation_count,
        emittedPointCount: monthly.length,
        sampling: source.source.series_metadata?.monthly_returns.sampling ?? source.source.chart_sampling,
        values: monthly, digest: sha256ResearchJson(monthly),
      },
      {
        kind: "ROLLING_RETURNS_20", availabilityState: "AVAILABLE", reasonCode: null,
        sourceObservationCount: source.source.series_metadata?.rolling_returns_20.source_observation_count
          ?? source.source.oos_observation_count,
        emittedPointCount: source.derived.rolling_returns_20_observations.length,
        sampling: source.source.series_metadata?.rolling_returns_20.sampling === "NOT_APPLICABLE"
          ? null
          : source.source.series_metadata?.rolling_returns_20.sampling ?? source.source.chart_sampling,
        values: source.derived.rolling_returns_20_observations,
        digest: sha256ResearchJson(source.derived.rolling_returns_20_observations),
      },
      {
        kind: "RETURN_DISTRIBUTION",
        availabilityState: distribution.state,
        reasonCode: distribution.reason_code,
        sourceObservationCount: source.source.series_metadata?.return_distribution.source_observation_count
          ?? source.source.oos_observation_count,
        emittedPointCount: distribution.buckets.length,
        sampling: source.source.series_metadata?.return_distribution.sampling ?? null,
        values: distribution.buckets,
        digest: sha256ResearchJson(distribution.buckets),
      },
    ];
    if (analytics) {
      const rollingSharpe = analytics.rolling_sharpe_63;
      series.push({
        kind: "ROLLING_SHARPE_63",
        availabilityState: rollingSharpe.state,
        reasonCode: rollingSharpe.reason_code,
        sourceObservationCount: rollingSharpe.source_observation_count,
        emittedPointCount: rollingSharpe.points.length,
        sampling: rollingSharpe.sampling,
        values: rollingSharpe.points,
        digest: sha256ResearchJson(rollingSharpe.points),
      }, {
        kind: "ROLLING_BETA_63",
        availabilityState: analytics.rolling_beta_63.state,
        reasonCode: analytics.rolling_beta_63.reason_code,
        sourceObservationCount: null,
        emittedPointCount: 0,
        sampling: null,
        values: [],
        digest: sha256ResearchJson([]),
      });
    }
    // CG-P13-06: an empty chart is a typed absence, never AVAILABLE/FULL.
    for (const item of series) {
      if (item.availabilityState === "AVAILABLE" && item.values.length === 0) {
        item.availabilityState = "NOT_APPLICABLE";
        item.reasonCode = EMPTY_SERIES_REASON[item.kind];
        item.sampling = null;
      }
    }
    const transformRevision = source.source.evidence_transform_revision ?? "P13_SOURCE_R1";
    const metricRegistryVersion: ResearchMetricRegistryVersion = transformRevision === "P13_SOURCE_R2"
      ? RESEARCH_METRIC_REGISTRY_VERSION
      : "research.metric-registry.v1";
    const projection: StoredProjection = {
      schema_version: "research.evidence-projection.v1",
      source: source.source,
      source_evidence_digest: sourceDigest,
      transform_revision: transformRevision,
      metric_registry_version: metricRegistryVersion,
      direct: source.direct,
      derived: {
        net_return_fraction: source.derived.net_return_fraction,
        max_drawdown_fraction: source.derived.max_drawdown_fraction,
      },
      unavailable: source.unavailable,
      run_binding: {
        run_id: runId,
        requested_spec_digest: binding?.requested_spec_digest ?? null,
        effective_spec_digest: binding?.effective_spec_digest ?? null,
        dataset_binding_digest: binding?.dataset_binding_digest ?? null,
        manifest_digest: binding?.manifest_digest ?? null,
      },
      ...(analytics ? {
        oos_analytics: {
          schema_version: analytics.schema_version,
          state: analytics.state,
          reason_code: analytics.reason_code,
          scope_locator: analytics.scope_locator,
          report_locator: analytics.report_locator,
          return_sample: analytics.return_sample,
          metrics: analytics.metrics,
        },
      } : {}),
      ...(monthlyLeadingNote ? { monthly_leading: monthlyLeadingNote } : {}),
      ...(source.candle_overview ? { candle_overview: source.candle_overview } : {}),
      ...(source.summary_analytics ? { summary_analytics: source.summary_analytics } : {}),
      ...(source.summary_analytics_v2 ? { summary_analytics_v2: source.summary_analytics_v2 } : {}),
      series: Object.fromEntries(series.map((item) => [item.kind, {
        state: item.availabilityState,
        reason_code: item.reasonCode,
      }])) as StoredProjection["series"],
      // A projection revision names exactly these series bytes and their
      // source sampling declarations.  Changing only a chart series must no
      // longer accidentally reuse an older Hub revision.
      series_identity: Object.fromEntries(series.map((item) => [item.kind, {
        digest: item.digest,
        source_observation_count: item.sourceObservationCount,
        emitted_point_count: item.emittedPointCount,
        sampling: item.sampling,
      }])) as StoredProjection["series_identity"],
    };
    const projectionDigest = sha256ResearchJson(projection);
    return {
      runId,
      sourceEvidenceDigest: sourceDigest,
      sourcePayload: source,
      sourceEventSequence,
      projectionRevision: `p13r1_${projectionDigest}`,
      projectionDigest,
      readiness: distribution.state === "AVAILABLE" ? "COMPLETE" : "PARTIAL",
      projection,
      series,
    };
  }

  /**
   * CG-P13-06: prepend the leading OOS month when the child measured it from
   * a true month-boundary close (the previous calendar close, the same rule
   * as every later month).  Nothing is prepended when the transport window is
   * already full or the fact does not reconcile with the OOS series.
   */
  private monthlyWithLeadingBoundary(source: ResearchEvidenceSource): {
    months: ResearchEvidenceSource["derived"]["monthly_returns"];
    note: StoredProjection["monthly_leading"];
  } {
    const months = source.derived.monthly_returns;
    const leading = source.oos_analytics?.monthly_leading;
    const metadata = source.source.series_metadata?.monthly_returns;
    if (!leading || leading.state !== "AVAILABLE" || !leading.point || !metadata) return { months, note: undefined };
    const firstEquity = source.equity_points[0]?.at_utc_ms;
    const next = new Date(leading.point.month_start_utc_ms);
    const nextMonthStart = Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 1);
    // Contradictions: the leading month does not hold the first OOS bar, or
    // the source already sent that month (or an earlier one).
    const contradicts = firstEquity === undefined
      || leading.point.month_start_utc_ms > firstEquity || firstEquity >= nextMonthStart
      || (months.length > 0 && months[0]!.month_start_utc_ms < nextMonthStart);
    if (contradicts) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_INVALID", "Research evidence leading month does not reconcile to its OOS series.", 400);
    }
    if (metadata.sampling !== "FULL" || months.length >= 32 || metadata.omitted_leading_period_count < 1) return { months, note: undefined };
    // The child groups only months with bars: a bar-less month after the
    // leading one leaves months[0] later than expected.  Keep the months as
    // sent and record why, rather than failing the terminal relay.
    if (months.length > 0 && months[0]!.month_start_utc_ms !== nextMonthStart) {
      return { months, note: { state: "NOT_APPLIED", reason_code: "P13_LEADING_MONTH_NOT_CONTIGUOUS_WITH_SOURCE_MONTHS" } };
    }
    return { months: [leading.point, ...months], note: undefined };
  }

  private mapHub(row: EvidenceHubRow, claims?: MethodologyClaim[]): unknown {
    const fallback = this.rowAvailability(row);
    const projection = row.projection ? parseProjection(row.projection) : null;
    if (row.projection && !projection) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Stored evidence projection is incompatible.", 503);
    }
    const requested = asRecord(row.requestedSpec);
    const data = asRecord(requested?.data);
    const progress = this.progress(row.progressSnapshot);
    const retainedReady = !projection && this.retainedSourceReady(row, progress);
    const hubAvailability = projection || retainedReady ? availability("AVAILABLE", null) : fallback;
    // A retained WFO seal proves readiness of that lane, not the presence of
    // P13 fixed-profile vectors. Their missing values stay locally unavailable.
    const projectionAvailability = projection ? hubAvailability : fallback;
    const runIdentity = this.runIdentity(row, fallback);
    const foldNavigation = this.foldNavigation(row, progress, fallback);
    const revision = row.revision;
    const sourceAbsences: Record<string, Availability> = projection
      ? Object.fromEntries(Object.entries(projection.unavailable).map(([key, value]) => [key, sourceAbsenceAvailability(value)]))
      : {
        benchmark: fallback,
        funding: fallback,
        audited_fills: fallback,
        per_fold_metrics: fallback,
      };
    // P04 is one fixed IS/OOS window, not a walk-forward fold population.
    // Preserve the sealed source receipt; correct only this read-side applicability.
    if (projection?.source.execution_adapter_id === "p04.delta-rsi.v1") {
      sourceAbsences.per_fold_metrics = notApplicable("P04_SINGLE_WINDOW_HAS_NO_PER_FOLD_METRICS");
    }
    // D-AN-01: the child now derives the run-bound buy-and-hold benchmark
    // from its already-loaded HMD close. Do not repeat the old source gap.
    const benchmarkV2 = projection?.summary_analytics_v2?.metrics.benchmark_return_fraction;
    if (benchmarkV2) sourceAbsences.benchmark = availability(benchmarkV2.state, benchmarkV2.reason_code);
    const metricValues: Record<string, string | null> = projection ? {
      INITIAL_EQUITY: projection.direct.initial_equity,
      FINAL_EQUITY: projection.direct.final_equity,
      NET_RETURN_FRACTION: projection.derived.net_return_fraction,
      MAX_DRAWDOWN_FRACTION: projection.derived.max_drawdown_fraction,
      TRADE_COUNT: projection.direct.num_trades,
      BARS_PROCESSED: projection.direct.bars,
      BENCHMARK_RETURN_FRACTION: null,
      FUNDING_TOTAL: null,
    } : {};
    const metricRegistryVersion = projection?.metric_registry_version ?? "research.metric-registry.v1";
    const metrics = researchMetricDefinitions(metricRegistryVersion).map((definition) => {
      const missing = definition.key === "BENCHMARK_RETURN_FRACTION"
        // The registry-v1 scalar has no retained value/provenance mapping.
        // A genuine analytics-v2 benchmark clears the source gap, but must
        // not make this distinct null-valued legacy metric AVAILABLE.
        ? benchmarkV2?.state === "AVAILABLE"
          ? notPublished("P13_LEGACY_BENCHMARK_USE_ANALYTICS_V2")
          : sourceAbsences.benchmark as Availability
        : definition.key === "FUNDING_TOTAL"
          ? sourceAbsences.funding as Availability
          : projectionAvailability;
      return {
        key: definition.key,
        label: definition.label,
        unit: definition.unit,
        scope: definition.scope,
        frequency: definition.frequency,
        origin: definition.origin,
        definition_id: definition.definitionId,
        value: metricValues[definition.key] ?? null,
        availability: definition.origin === "NOT_PUBLISHED" ? missing : projectionAvailability,
      };
    });
    const series = SERIES_KINDS.map((kind) => {
      const stored = projection?.series[kind];
      const identity = projection?.series_identity?.[kind];
      const item = !projection
        ? fallback
        : !stored
          ? notPublished(PREDATES_OOS_ANALYTICS)
          : stored.state === "AVAILABLE" && identity?.emitted_point_count === 0
            ? notApplicable(EMPTY_SERIES_REASON[kind])
            : stored;
      return {
        kind,
        availability: item,
        href: projection && stored ? `/api/v1/quantbt/runs/${row.runId}/evidence/series?kind=${kind}` : null,
      };
    });
    const warnings = projection ? this.warnings(projection, sourceAbsences) : [];
    const response = {
      schema_version: "research.evidence-hub.v1",
      run_declaration: readRunDeclaration(row.runDeclarationInputs ?? {}),
      ...(row.enrichedAnalysis ? { enriched_analysis: row.enrichedAnalysis } : {}),
      enriched_analysis_availability: enrichedAvailability(row.enrichedAnalysis, !!projection || retainedReady),
      ...(projection?.summary_analytics ? { summary_analytics: projection.summary_analytics } : {}),
      ...(projection?.summary_analytics_v2 ? { summary_analytics_v2: projection.summary_analytics_v2 } : {}),
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: row.runId,
      revision,
      // `revision` pins immutable evidence vectors.  The Hub also carries
      // current durable identity/progress facts, so its HTTP validator names
      // the full semantic Hub snapshot instead of pretending the projection
      // revision alone covers those fields.
      etag: null,
      availability: hubAvailability,
      readiness: projection ? row.readiness : retainedReady ? "PARTIAL" : "NOT_READY",
      as_of_utc_ms: row.asOfUtcMs,
      metric_registry_version: metricRegistryVersion,
      core: {
        source_adapter_id: projection?.source.execution_adapter_id ?? null,
        engine_version: projection?.source.engine_version ?? null,
        input_scope: projection?.source.input_scope ?? null,
        source_transform_digest: projection?.source.source_transform_digest ?? null,
        requested_spec_digest: row.requestedSpecDigest,
        effective_spec_digest: row.effectiveSpecDigest,
        dataset_binding_digest: row.datasetBindingDigest,
        manifest_digest: row.manifestDigest,
        data: {
          dataset_id: typeof data?.dataset_id === "string" ? data.dataset_id : null,
          symbol: typeof data?.symbol === "string" ? data.symbol : null,
          timeframe: typeof data?.timeframe === "string" ? data.timeframe : null,
          oos_observation_count: projection?.source.oos_observation_count ?? null,
        },
        dataset_coverage: evidenceDatasetCoverage(row.preflightSnapshot),
        window_disclosure: evidenceWindowDisclosure(row.preflightTopology),
        run_identity: runIdentity,
        fold_navigation: foldNavigation,
        market_overview: marketOverviewOf(projection),
      },
      metrics,
      oos_performance: this.oosPerformance(projection, fallback),
      lifecycle: { ...this.lifecycle(row),
        failed_at: displayStatus(row.jobState ?? null, row.runState ?? null) === "FAILED"
          && progress?.run_id === row.runId ? failedAt(progress) : null },
      revision_binding: projection
        ? { value: projection.run_binding ? "RUN_INPUT_BOUND" : "SOURCE_CONTENT_ONLY", availability: availability("AVAILABLE", null) }
        : { value: null, availability: fallback },
      claim: this.claim(progress, hubAvailability),
      stages: this.stages(progress),
      series,
      warnings,
      source_absences: sourceAbsences,
      ...(claims ? { claims } : {}),
    };
    // `as_of_utc_ms` is a transaction-observation timestamp, not a document
    // fact.  A weak validator may omit it while still invalidating whenever
    // any displayed value changes; a strong ETag would be invalid because the
    // timestamp changes even for an identical semantic Hub.
    const { as_of_utc_ms: _asOfUtcMs, etag: _etag, ...semanticSnapshot } = response;
    return {
      ...response,
      etag: `W/"p13h1_${sha256ResearchJson(semanticSnapshot)}"`,
    };
  }

  /**
   * One Hub read supplies its own header facts.  It must not compose Screen
   * 01's list item or a P14/RS-02 split response: those are independently
   * versioned reads and could disagree with this repeatable-read snapshot.
   */
  private runIdentity(row: EvidenceHubRow, fallback: Availability) {
    const durableFallback = row.kind === "DURABLE"
      ? notPublished("P13_DURABLE_RUN_IDENTITY_NOT_PUBLISHED")
      : fallback;
    const requestedParsed = row.kind === "DURABLE"
      ? ResearchRequestedSpecSchema.safeParse(row.requestedSpec)
      : null;
    const requestedAvailability = requestedParsed?.success
      ? availability("AVAILABLE", null)
      : row.kind === "DURABLE"
        ? notPublished("P13_REQUESTED_SPEC_INCOMPATIBLE")
        : fallback;

    const runState = isDurableRunState(row.runState ?? null) ? row.runState : null;
    const statusAvailability = runState ? availability("AVAILABLE", null) : durableFallback;
    const createdAt = row.runCreatedAtUtcMs ?? null;
    const createdAtAvailability = createdAt === null ? durableFallback : availability("AVAILABLE", null);

    const bindingPresent = Boolean(
      row.alphaId && row.alphaName && row.alphaVersionId
      && row.alphaId.length <= 191 && row.alphaName.length <= 240 && row.alphaVersionId.length <= 191,
    );
    const requestedBinding = requestedParsed?.success ? requestedParsed.data.alpha_binding : undefined;
    // `undefined` means P02 did not yield a parseable requested spec, so the
    // durable binding remains the only fact we can evaluate.  `null` is the
    // explicit scratch-run declaration.  Keep those cases distinct: treating
    // either as a generic falsy value could accidentally publish a binding
    // whose immutable requested spec explicitly says there is none.
    const bindingMatchesRequested = requestedBinding === undefined
      ? true
      : requestedBinding === null
        ? false
        : bindingPresent
          && requestedBinding.alpha_id === row.alphaId
          && requestedBinding.alpha_version_id === row.alphaVersionId;
    const bindingAvailability = bindingPresent && bindingMatchesRequested
      ? availability("AVAILABLE", null)
      : requestedBinding === null
        ? notApplicable("P13_SCRATCH_RUN_HAS_NO_PUBLISHABLE_ALPHA_BINDING")
        : bindingPresent
          ? notPublished("P13_ALPHA_BINDING_INCOMPATIBLE")
          : durableFallback;

    const requested = requestedParsed?.success ? requestedParsed.data : null;
    return {
      status: { value: runState, availability: statusAvailability },
      // D1: the short label Screen 04 and its stage screens print instead of
      // the 37-character id. Presentation only; `run_id` is the identity.
      display_label: row.displayLabel ?? null,
      binding: {
        alpha_id: bindingAvailability.state === "AVAILABLE" ? row.alphaId : null,
        alpha_name: bindingAvailability.state === "AVAILABLE" ? row.alphaName : null,
        alpha_version_id: bindingAvailability.state === "AVAILABLE" ? row.alphaVersionId : null,
        availability: bindingAvailability,
      },
      created_at_utc_ms: { value: createdAt, availability: createdAtAvailability },
      mode: {
        value: requested?.optimization_mode ?? null,
        availability: requested ? availability("AVAILABLE", null) : requestedAvailability,
      },
      schedule: {
        value: requested?.optimization_schedule ?? null,
        availability: requested ? availability("AVAILABLE", null) : requestedAvailability,
      },
      route: {
        id: {
          value: requested?.execution_route ?? null,
          availability: requested ? availability("AVAILABLE", null) : requestedAvailability,
        },
        // P02 publishes the selected route ID and validated parameters; it
        // does not publish a distinct route-contract/capability statement.
        contract: {
          value: null,
          availability: notPublished("P13_ROUTE_CONTRACT_NOT_PUBLISHED"),
        },
      },
      config_digest: {
        value: requested?.client.config_digest ?? null,
        availability: requested ? availability("AVAILABLE", null) : requestedAvailability,
      },
      seed: requested
        ? requested.random_seed === null
          ? { value: null, availability: notApplicable("P02_RANDOM_SEED_NOT_SELECTED") }
          : { value: requested.random_seed, availability: availability("AVAILABLE", null) }
        : { value: null, availability: requestedAvailability },
    };
  }

  /**
   * This is an observed P11 fold set, deliberately not a claim that P14 has
   * published the complete planned topology/boundaries.  It gives Screen 04
   * a safe finite selector without teaching it to call another screen's BFF.
   */
  private foldNavigation(
    row: EvidenceHubRow,
    progress: ResearchProgressSnapshot | null,
    fallback: Availability,
  ) {
    if (!progress) {
      return { observed_folds: [], published_fold_count: null, availability: fallback };
    }
    const observedFolds = progress.folds.map((fold) => fold.fold);
    const strictAscending = observedFolds.every((fold, index) => index === 0 || fold > observedFolds[index - 1]!);
    if (!strictAscending) {
      return {
        observed_folds: [], published_fold_count: null,
        availability: notPublished("P13_PROGRESS_FOLD_SET_INCOMPATIBLE"),
      };
    }
    if (observedFolds.length === 0) {
      const pending = progress.status === "QUEUED" || progress.status === "RUNNING" || progress.status === "FINISHING";
      return {
        observed_folds: [], published_fold_count: null,
        availability: pending
          ? availability("PENDING_SOURCE_CALLBACK", "P13_PROGRESS_FOLD_SET_PENDING")
          : notPublished("P13_PROGRESS_FOLD_SET_NOT_PUBLISHED"),
      };
    }
    return {
      observed_folds: observedFolds,
      published_fold_count: observedFolds.length,
      availability: availability("AVAILABLE", null),
    };
  }

  /** CG-P13-03: registry-v3 facts; a receipt locator that differs from the registry is refused. */
  private oosPerformance(projection: StoredProjection | null, fallback: Availability) {
    const analytics = projection?.oos_analytics;
    const blockAvailability = !projection
      ? fallback
      : !analytics
        ? notPublished(PREDATES_OOS_ANALYTICS)
        : analytics.state === "AVAILABLE"
          ? availability("AVAILABLE", null)
          : notPublished(analytics.reason_code ?? PREDATES_OOS_ANALYTICS);
    const sample = z.object({
      kind: z.enum(["DAILY_UTC_EQUITY", "BAR"]),
      observation_count: z.number().int().nonnegative(),
      annualization_periods: z.string(),
    }).strict().safeParse(analytics?.return_sample);
    const metrics = RESEARCH_PERFORMANCE_METRIC_DEFINITIONS.map((definition) => {
      const raw = analytics?.metrics[definition.sourceField];
      const source = z.object({
        state: z.enum(["AVAILABLE", "NOT_APPLICABLE", "NOT_PUBLISHED"]),
        reason_code: z.string().nullable(),
        value: z.string().nullable(),
        locator: z.string().nullable(),
      }).strict().safeParse(raw);
      let metricAvailability: Availability;
      let value: string | null = null;
      let locator: string | null = null;
      if (!analytics || analytics.state !== "AVAILABLE") {
        metricAvailability = blockAvailability;
      } else if (!source.success) {
        metricAvailability = notPublished("P13_OOS_ANALYTICS_METRIC_INCOMPATIBLE");
      } else if (source.data.state === "AVAILABLE") {
        if (definition.origin !== "ENGINE_DIRECT" || source.data.locator !== definition.sourceLocator) {
          metricAvailability = notPublished("P13_ENGINE_LOCATOR_MISMATCH");
        } else {
          metricAvailability = availability("AVAILABLE", null);
          value = source.data.value;
          locator = source.data.locator;
        }
      } else {
        metricAvailability = availability(source.data.state, source.data.reason_code ?? "P13_OOS_ANALYTICS_METRIC_INCOMPATIBLE");
      }
      return {
        key: definition.key,
        label: definition.label,
        unit: definition.unit,
        scope: definition.scope,
        frequency: definition.frequency,
        origin: definition.origin,
        definition_id: definition.definitionId,
        source_locator: locator,
        value,
        availability: metricAvailability,
      };
    });
    return {
      registry_version: RESEARCH_PERFORMANCE_METRIC_REGISTRY_VERSION,
      availability: blockAvailability,
      scope_locator: blockAvailability.state === "AVAILABLE" ? analytics?.scope_locator ?? null : null,
      report_locator: blockAvailability.state === "AVAILABLE" ? analytics?.report_locator ?? null : null,
      return_sample: blockAvailability.state === "AVAILABLE" && sample.success ? sample.data : null,
      metrics,
    };
  }

  /** CG-P13-10/12: published status vocabulary and a typed terminal flag. */
  private lifecycle(row: EvidenceHubRow) {
    if (row.kind === "LEGACY") {
      return {
        vocabulary: "research.run-status-vocabulary.v1" as const,
        durable_status: null, display_status: null, phase: "LEGACY" as const, terminal_outcome: null,
        availability: availability("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_DOES_NOT_PUBLISH_P13_EVIDENCE"),
      };
    }
    const durable = isDurableRunState(row.runState ?? null) ? row.runState as DurableRunState : null;
    const display = displayStatus(row.jobState ?? null, row.runState ?? null);
    if (!display) {
      return {
        vocabulary: "research.run-status-vocabulary.v1" as const,
        durable_status: durable, display_status: null, phase: "NOT_PUBLISHED" as const, terminal_outcome: null,
        availability: notPublished("P13_DURABLE_RUN_IDENTITY_NOT_PUBLISHED"),
      };
    }
    const terminal = display === "COMPLETED" || display === "FAILED" || display === "CANCELLED" ? display : null;
    return {
      vocabulary: "research.run-status-vocabulary.v1" as const,
      durable_status: durable,
      display_status: display,
      phase: terminal ? "TERMINAL" as const : display === "RECOVERY_REQUIRED" ? "ATTENTION_REQUIRED" as const : "IN_PROGRESS" as const,
      terminal_outcome: terminal,
      availability: availability("AVAILABLE", null),
    };
  }

  private absentSeries(hub: EvidenceHubRow, kind: ResearchEvidenceSeriesKind) {
    // A sealed projection without this kind predates RF-05 OOS analytics.
    const availability = hub.projection ? notPublished(PREDATES_OOS_ANALYTICS) : this.rowAvailability(hub);
    return {
      schema_version: "research.evidence-series.v1" as const,
      run_id: hub.runId,
      revision: null,
      etag: null,
      kind,
      availability,
      source_sample: { source_observation_count: null, emitted_point_count: 0, sampling: null },
      values: [],
    };
  }

  private mapStoredSeries(runId: string, stored: EvidenceSeriesRow) {
    const body = this.storedSeriesBody(runId, stored);
    // RF-05: the tag names the representation, not only the revision, so a
    // body whose read-side rule changed (e.g. CG-P13-06 below) never 304s
    // against a copy cached under the bare `"<revision>"` tag.
    return {
      ...body,
      etag: `"p13r1_${sha256ResearchJson({ representation_version: EVIDENCE_SERIES_REPRESENTATION_VERSION, representation: body })}"`,
    };
  }

  private storedSeriesBody(runId: string, stored: EvidenceSeriesRow) {
    // CG-P13-06: rows sealed before RF-05 may say AVAILABLE with no points.
    if (stored.availabilityState === "AVAILABLE" && stored.emittedPointCount === 0) {
      return {
        schema_version: "research.evidence-series.v1" as const,
        run_id: runId,
        revision: stored.revision,
        kind: stored.kind,
        availability: notApplicable(EMPTY_SERIES_REASON[stored.kind]),
        source_sample: { source_observation_count: stored.sourceObservationCount, emitted_point_count: 0, sampling: null },
        values: [],
      };
    }
    return {
      schema_version: "research.evidence-series.v1" as const,
      run_id: runId,
      revision: stored.revision,
      kind: stored.kind,
      availability: availability(stored.availabilityState, stored.reasonCode),
      source_sample: {
        source_observation_count: stored.sourceObservationCount,
        emitted_point_count: stored.emittedPointCount,
        sampling: stored.sampling,
      },
      values: stored.values,
    };
  }

  private rowAvailability(row: EvidenceHubRow): Availability {
    if (row.kind === "LEGACY") return availability("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_DOES_NOT_PUBLISH_P13_EVIDENCE");
    const progress = this.progress(row.progressSnapshot);
    if (!progress || progress.source.coverage !== "ACTUAL_HOOKS") {
      return availability(
        row.jobState === "QUEUED" || row.jobState === "CLAIMED" || row.jobState === "RUNNING"
          ? "PENDING_SOURCE_CALLBACK" : "NOT_PUBLISHED",
        row.jobState === "QUEUED" || row.jobState === "CLAIMED" || row.jobState === "RUNNING"
          ? "P13_SOURCE_COMPLETION_PENDING" : "P13_SOURCE_EVIDENCE_NOT_PUBLISHED",
      );
    }
    return notPublished("P13_SOURCE_EVIDENCE_NOT_PUBLISHED");
  }

  /** Private same-transaction seal + producer + terminal checkpoint proof; never analytics-as-readiness. */
  private retainedSourceReady(row: EvidenceHubRow, progress: ResearchProgressSnapshot | null): boolean {
    const retained = row.retainedSource;
    const digest = /^[0-9a-f]{64}$/;
    return row.kind === "DURABLE" && retained !== undefined
      && retained.runId === row.runId
      && isCurrentSourceLanePair(retained.sourceAdapterId, retained.profileId)
      && Number.isSafeInteger(retained.artifactRevision) && retained.artifactRevision > 0
      && digest.test(retained.retainedImportDigest)
      // RS02 seals name the P05 artifact manifest; P10's manifest names the
      // preflight dataset/spec. Verify each domain against its own authority.
      && digest.test(retained.manifestDigest)
      && retained.sealedArtifact?.state === "SEALED"
      && retained.sealedArtifact.artifactRevision === retained.artifactRevision
      && retained.sealedArtifact.manifestDigest === retained.manifestDigest
      && retained.lifecycleStatus === "COMPLETED" && retained.terminalMaterialized === true
      && row.runState === "READY" && row.jobState === "SUCCEEDED"
      && progress?.run_id === row.runId && progress.status === "COMPLETED"
      && progress.readiness.mandatory === "SEALED" && progress.source.coverage === "ACTUAL_HOOKS"
      && [
        [retained.requestedSpecDigest, row.requestedSpecDigest],
        [retained.effectiveSpecDigest, row.effectiveSpecDigest],
        [retained.datasetBindingDigest, row.datasetBindingDigest],
      ].every(([source, producer]) => typeof source === "string" && digest.test(source) && source === producer);
  }

  private progress(value: unknown): ResearchProgressSnapshot | null {
    const parsed = ResearchProgressSnapshotSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
  }

  private claim(progress: ResearchProgressSnapshot | null, source: Availability) {
    if (!progress) {
      return {
        state: "NOT_PUBLISHED" as const, text: null, cursor: null,
        methodology_certificate: {
          state: "NOT_PUBLISHED" as const, grade: null, issued_at_utc_ms: null,
          reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE",
        },
        availability: source,
      };
    }
    const claim = progress.claim;
    const certificate = claim.methodology_certificate ?? {
      state: "NOT_PUBLISHED" as const, grade: null, issued_at_utc_ms: null,
      reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE",
    };
    return {
      state: claim.state,
      text: claim.text,
      cursor: claim.cursor,
      methodology_certificate: certificate,
      availability: source,
    };
  }

  private stages(progress: ResearchProgressSnapshot | null) {
    const current = new Map(progress?.stages.map((stage) => [stage.key, stage]));
    return (["S1", "S2", "S3", "S4", "S5"] as const).map((key) => current.get(key) ?? {
      key, state: "PENDING" as const, started_at_utc_ms: null, completed_at_utc_ms: null,
    });
  }

  private warnings(projection: StoredProjection, absences: Record<string, Availability>) {
    const values: Array<Record<string, unknown>> = [];
    if (projection.source.chart_sampling === "EXTREMA_BUCKET_V1") {
      values.push({ ...RESEARCH_WARNING_DEFINITIONS.sampledSeries, state: "ACTIVE", reason_code: "P13_EXTREMA_BUCKET_SAMPLE" });
    }
    for (const [key, definition] of [["benchmark", RESEARCH_WARNING_DEFINITIONS.benchmark], ["funding", RESEARCH_WARNING_DEFINITIONS.funding]] as const) {
      const absence = absences[key];
      if (absence?.state === "NOT_PUBLISHED") {
        values.push({ ...definition, state: "ACTIVE", reason_code: absence.reason_code });
      }
    }
    const distribution = projection.series.RETURN_DISTRIBUTION;
    if (distribution.reason_code === "P04_RETURN_DISTRIBUTION_ZERO_VARIANCE") {
      values.push({ ...RESEARCH_WARNING_DEFINITIONS.zeroVarianceDistribution, state: "ACTIVE", reason_code: distribution.reason_code });
    }
    return values.map((value) => ({
      definition_id: value.definitionId,
      state: value.state,
      reason_code: value.reason_code,
      copy: value.copy,
    }));
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_EVIDENCE !== "true") {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Research evidence is not enabled in this environment.", 503);
    }
  }
}
