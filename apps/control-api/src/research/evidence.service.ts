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
  RESEARCH_METRIC_DEFINITIONS,
  RESEARCH_METRIC_REGISTRY_VERSION,
  RESEARCH_WARNING_DEFINITIONS,
} from "./evidence-metric-registry";
import {
  ResearchEvidenceRepository,
  type EvidenceHubRow,
  type EvidenceProjectionWrite,
} from "./evidence.repository";
import { sha256ResearchJson } from "./preflight.service";
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
  direct: ResearchEvidenceSource["direct"];
  derived: Pick<ResearchEvidenceSource["derived"], "net_return_fraction" | "max_drawdown_fraction">;
  unavailable: ResearchEvidenceSource["unavailable"];
  series: Record<ResearchEvidenceSeriesKind, Availability>;
}

const SERIES_KINDS: readonly ResearchEvidenceSeriesKind[] = [
  "EQUITY_OOS", "MONTHLY_RETURNS", "ROLLING_RETURNS_20", "RETURN_DISTRIBUTION",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function availability(state: Availability["state"], reasonCode: string | null): Availability {
  return { state, reason_code: reasonCode };
}

function notPublished(reason: string): Availability {
  return availability("NOT_PUBLISHED", reason);
}

const StoredUnavailableSchema = z.object({
  state: z.enum(["NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/),
}).strict();

const StoredSeriesAvailabilitySchema = z.object({
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/).nullable(),
}).strict();

/**
 * The durable projection deliberately omits source vectors.  Do not validate
 * it by fabricating a miniature source receipt: that would silently change
 * its actual OOS count/sampling declaration during a reader rollout.
 */
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
}).strict();

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

  async hub(scope: ResearchScope, runId: string): Promise<ResearchEvidenceHubResponse> {
    this.requireEnabled();
    const row = await this.repository.hub(scope, runId);
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
  ): Promise<ResearchEvidenceSeriesResponse> {
    this.requireEnabled();
    // Check logical visibility first, including a durable run whose source
    // callback has not arrived. A missing chart is a typed source state, not
    // a misleading 404 on a valid run.
    const hub = await this.repository.hub(scope, runId);
    if (!hub) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_NOT_FOUND", "Research run was not found.", 404);
    }
    const stored = await this.repository.series(scope, runId, kind);
    const response = stored
      ? {
        schema_version: "research.evidence-series.v1" as const,
        run_id: runId,
        revision: stored.revision,
        etag: `"${stored.revision}"`,
        kind,
        availability: availability(stored.availabilityState, stored.reasonCode),
        source_sample: {
          source_observation_count: stored.sourceObservationCount,
          emitted_point_count: stored.emittedPointCount,
          sampling: stored.sampling,
        },
        values: stored.values,
      }
      : this.absentSeries(hub, kind);
    const parsed = ResearchEvidenceSeriesResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchEvidenceError("RESEARCH_EVIDENCE_UNAVAILABLE", "Evidence series response is incompatible.", 503);
    }
    return parsed.data;
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
        sourceObservationCount: source.source.oos_observation_count,
        emittedPointCount: source.equity_points.length, sampling: source.source.chart_sampling,
        values: source.equity_points, digest: sha256ResearchJson(source.equity_points),
      },
      {
        kind: "MONTHLY_RETURNS", availabilityState: "AVAILABLE", reasonCode: null,
        sourceObservationCount: source.source.oos_observation_count,
        emittedPointCount: source.derived.monthly_returns.length, sampling: source.source.chart_sampling,
        values: source.derived.monthly_returns, digest: sha256ResearchJson(source.derived.monthly_returns),
      },
      {
        kind: "ROLLING_RETURNS_20", availabilityState: "AVAILABLE", reasonCode: null,
        sourceObservationCount: source.source.oos_observation_count,
        emittedPointCount: source.derived.rolling_returns_20_observations.length, sampling: source.source.chart_sampling,
        values: source.derived.rolling_returns_20_observations,
        digest: sha256ResearchJson(source.derived.rolling_returns_20_observations),
      },
      {
        kind: "RETURN_DISTRIBUTION",
        availabilityState: distribution.state,
        reasonCode: distribution.reason_code,
        sourceObservationCount: source.source.oos_observation_count,
        emittedPointCount: distribution.buckets.length,
        sampling: null,
        values: distribution.buckets,
        digest: sha256ResearchJson(distribution.buckets),
      },
    ];
    const rolling = series.find((item) => item.kind === "ROLLING_RETURNS_20");
    if (rolling && rolling.values.length === 0) {
      rolling.availabilityState = "NOT_APPLICABLE";
      rolling.reasonCode = "P04_OOS_OBSERVATIONS_BELOW_ROLLING_WINDOW";
    }
    const projection: StoredProjection = {
      schema_version: "research.evidence-projection.v1",
      source: source.source,
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
    const metrics = RESEARCH_METRIC_DEFINITIONS.map((definition) => {
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
    return {
      schema_version: "research.evidence-hub.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: row.runId,
      revision,
      etag: revision ? `"${revision}"` : null,
      availability: hubAvailability,
      readiness: projection ? row.readiness : "NOT_READY",
      as_of_utc_ms: row.asOfUtcMs,
      metric_registry_version: RESEARCH_METRIC_REGISTRY_VERSION,
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
      },
      metrics,
      claim: this.claim(progress, hubAvailability),
      stages: this.stages(progress),
      series,
      warnings,
      source_absences: sourceAbsences,
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
