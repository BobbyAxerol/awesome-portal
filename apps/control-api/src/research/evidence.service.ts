/** P13 Evidence Flow Hub projection builder and same-origin reader. */

import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import {
  ResearchEvidenceHubResponseSchema,
  ResearchEvidenceSeriesResponseSchema,
  type ResearchEvidenceHubResponse,
  type ResearchEvidenceSeriesKind,
  type ResearchEvidenceSeriesResponse,
} from "./evidence.contract";
import { ResearchEvidenceError } from "./evidence.error";
import {
  RESEARCH_METRIC_REGISTRY_VERSION,
  RESEARCH_WARNING_DEFINITIONS,
  researchMetricDefinitions,
  type ResearchMetricRegistryVersion,
} from "./evidence-metric-registry";
import {
  ResearchEvidenceRepository,
  type EvidenceHubRow,
  type EvidenceProjectionWrite,
  type EvidenceSeriesRow,
} from "./evidence.repository";
import { sha256ResearchJson } from "./preflight.service";
import { ResearchRequestedSpecSchema } from "./preflight.contract";
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

interface StoredProjection {
  schema_version: "research.evidence-projection.v1";
  source: ResearchEvidenceSource["source"];
  /** Bound into the immutable projection digest; never reconstructed on read. */
  source_evidence_digest?: string;
  transform_revision?: "P13_SOURCE_R1" | "P13_SOURCE_R2";
  metric_registry_version?: ResearchMetricRegistryVersion;
  direct: ResearchEvidenceSource["direct"];
  derived: Pick<ResearchEvidenceSource["derived"], "net_return_fraction" | "max_drawdown_fraction">;
  unavailable: ResearchEvidenceSource["unavailable"];
  series: Record<ResearchEvidenceSeriesKind, Availability>;
  series_identity?: Record<ResearchEvidenceSeriesKind, {
    digest: string;
    source_observation_count: number | null;
    emitted_point_count: number;
    sampling: "FULL" | "EXTREMA_BUCKET_V1" | "TAIL_WINDOW_V1" | "FULL_RETURN_HISTOGRAM_V2" | null;
  }>;
}

const SERIES_KINDS: readonly ResearchEvidenceSeriesKind[] = [
  "EQUITY_OOS", "MONTHLY_RETURNS", "ROLLING_RETURNS_20", "RETURN_DISTRIBUTION",
];

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

const StoredProjectionSchema = z.object({
  schema_version: z.literal("research.evidence-projection.v1"),
  source: z.object({
    execution_adapter_id: z.literal("p04.delta-rsi.v1"),
    engine_version: z.string().regex(/^1\.1\.1$/),
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
  }).strict(),
  source_evidence_digest: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  transform_revision: z.enum(["P13_SOURCE_R1", "P13_SOURCE_R2"]).optional(),
  metric_registry_version: z.enum(["research.metric-registry.v1", RESEARCH_METRIC_REGISTRY_VERSION]).optional(),
  series_identity: z.object({
    EQUITY_OOS: z.object({ digest: z.string().regex(/^[0-9a-f]{64}$/), source_observation_count: z.number().int().positive(), emitted_point_count: z.number().int().nonnegative(), sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]).nullable() }).strict(),
    MONTHLY_RETURNS: z.object({ digest: z.string().regex(/^[0-9a-f]{64}$/), source_observation_count: z.number().int().positive(), emitted_point_count: z.number().int().nonnegative(), sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1", "TAIL_WINDOW_V1"]).nullable() }).strict(),
    ROLLING_RETURNS_20: z.object({ digest: z.string().regex(/^[0-9a-f]{64}$/), source_observation_count: z.number().int().nonnegative(), emitted_point_count: z.number().int().nonnegative(), sampling: z.enum(["FULL", "EXTREMA_BUCKET_V1"]).nullable() }).strict(),
    RETURN_DISTRIBUTION: z.object({ digest: z.string().regex(/^[0-9a-f]{64}$/), source_observation_count: z.number().int().nonnegative(), emitted_point_count: z.number().int().nonnegative(), sampling: z.literal("FULL_RETURN_HISTOGRAM_V2").nullable() }).strict(),
  }).strict().optional(),
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

function sourceAbsenceAvailability(value: { state: "NOT_PUBLISHED" | "NOT_APPLICABLE"; reason_code: string }): Availability {
  return availability(value.state, value.reason_code);
}

@Injectable()
export class ResearchEvidenceService {
  constructor(
    private readonly repository: ResearchEvidenceRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
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
    const write = this.buildWrite(input.run_id, input.event.sequence, source.data, sourceDigest);
    await this.repository.persist(scope, write);
  }

  async hub(scope: ResearchScope, runId: string, signal?: AbortSignal): Promise<ResearchEvidenceHubResponse> {
    this.requireEnabled();
    const row = await this.repository.hub(scope, runId, signal);
    if (!row) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_NOT_FOUND", "Research run was not found.", 404);
    }
    const response = this.mapHub(row);
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
  ): Promise<{ hub: ResearchEvidenceHubResponse; series: Map<ResearchEvidenceSeriesKind, ResearchEvidenceSeriesResponse> }> {
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
      const response = row ? this.mapStoredSeries(runId, row) : this.absentSeries(stored.hub, kind);
      const parsed = ResearchEvidenceSeriesResponseSchema.safeParse(response);
      if (!parsed.success || (row && parsed.data.revision !== parsedHub.data.revision)) {
        throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence bundle is incompatible.", 503);
      }
      values.set(kind, parsed.data);
    }
    return { hub: parsedHub.data, series: values };
  }

  private buildWrite(
    runId: string,
    sourceEventSequence: number,
    source: ResearchEvidenceSource,
    sourceDigest: string,
  ): EvidenceProjectionWrite {
    const distribution = source.derived.return_distribution;
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
        emittedPointCount: source.derived.monthly_returns.length,
        sampling: source.source.series_metadata?.monthly_returns.sampling ?? source.source.chart_sampling,
        values: source.derived.monthly_returns, digest: sha256ResearchJson(source.derived.monthly_returns),
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
    const rolling = series.find((item) => item.kind === "ROLLING_RETURNS_20");
    if (rolling && rolling.values.length === 0) {
      rolling.availabilityState = "NOT_APPLICABLE";
      rolling.reasonCode = "P04_OOS_OBSERVATIONS_BELOW_ROLLING_WINDOW";
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

  private mapHub(row: EvidenceHubRow): unknown {
    const fallback = this.rowAvailability(row);
    const projection = row.projection ? parseProjection(row.projection) : null;
    if (row.projection && !projection) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Stored evidence projection is incompatible.", 503);
    }
    const hubAvailability = projection ? availability("AVAILABLE", null) : fallback;
    const requested = asRecord(row.requestedSpec);
    const data = asRecord(requested?.data);
    const progress = this.progress(row.progressSnapshot);
    const runIdentity = this.runIdentity(row, fallback);
    const foldNavigation = this.foldNavigation(row, progress, fallback);
    const revision = row.revision;
    const sourceAbsences = projection
      ? Object.fromEntries(Object.entries(projection.unavailable).map(([key, value]) => [key, sourceAbsenceAvailability(value)]))
      : {
        benchmark: fallback,
        funding: fallback,
        audited_fills: fallback,
        per_fold_metrics: fallback,
      };
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
        ? sourceAbsences.benchmark as Availability
        : definition.key === "FUNDING_TOTAL"
          ? sourceAbsences.funding as Availability
          : hubAvailability;
      return {
        key: definition.key,
        label: definition.label,
        unit: definition.unit,
        scope: definition.scope,
        frequency: definition.frequency,
        origin: definition.origin,
        definition_id: definition.definitionId,
        value: metricValues[definition.key] ?? null,
        availability: definition.origin === "NOT_PUBLISHED" ? missing : hubAvailability,
      };
    });
    const series = SERIES_KINDS.map((kind) => {
      const item = projection?.series[kind] ?? fallback;
      return {
        kind,
        availability: item,
        href: projection ? `/api/v1/quantbt/runs/${row.runId}/evidence/series?kind=${kind}` : null,
      };
    });
    const warnings = projection ? this.warnings(projection, sourceAbsences) : [];
    const response = {
      schema_version: "research.evidence-hub.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: row.runId,
      revision,
      // `revision` pins immutable evidence vectors.  The Hub also carries
      // current durable identity/progress facts, so its HTTP validator names
      // the full semantic Hub snapshot instead of pretending the projection
      // revision alone covers those fields.
      etag: null,
      availability: hubAvailability,
      readiness: projection ? row.readiness : "NOT_READY",
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
        run_identity: runIdentity,
        fold_navigation: foldNavigation,
      },
      metrics,
      claim: this.claim(progress, hubAvailability),
      stages: this.stages(progress),
      series,
      warnings,
      source_absences: sourceAbsences,
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

  private absentSeries(hub: EvidenceHubRow, kind: ResearchEvidenceSeriesKind) {
    const availability = this.rowAvailability(hub);
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
    return {
      schema_version: "research.evidence-series.v1" as const,
      run_id: runId,
      revision: stored.revision,
      etag: `"${stored.revision}"`,
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
