/** P14 Split / chronology projection builder and same-origin reader. */

import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import { sha256ResearchJson } from "./preflight.service";
import {
  ResearchSplitSourceSchema,
  type ResearchProgressIngress,
  type ResearchSplitSource,
} from "./progress.contract";
import type { ProgressIngressScope } from "./progress.repository";
import { ResearchSplitError } from "./split.error";
import { ResearchSplitResponseSchema, type ResearchSplitResponse } from "./split.contract";
import { ResearchSplitRepository, type SplitHubRow, type SplitProjectionWrite } from "./split.repository";

type Availability = {
  state: "AVAILABLE" | "NOT_PUBLISHED" | "PENDING_SOURCE_CALLBACK" | "LEGACY_METADATA_ONLY" | "NOT_APPLICABLE";
  reason_code: string | null;
};

interface StoredProjection {
  schema_version: "research.split-projection.v1";
  source: ResearchSplitSource;
}

const StoredProjectionSchema = z.object({
  schema_version: z.literal("research.split-projection.v1"),
  source: ResearchSplitSourceSchema,
}).strict();

function availability(state: Availability["state"], reasonCode: string | null): Availability {
  return { state, reason_code: reasonCode };
}

type SourceAbsence = { state: "NOT_PUBLISHED" | "NOT_ASSERTED"; reason_code: string };

/**
 * Preserve the source fact's stronger semantic state.  Availability remains
 * a UI/readiness classification, where a non-asserted fact is still not a
 * published capability; clients must not collapse it into a made-up pass.
 */
function sourceAbsence(value: SourceAbsence) {
  return {
    state: value.state,
    reason_code: value.reason_code,
    availability: availability("NOT_PUBLISHED", value.reason_code),
  };
}

function parseProjection(value: unknown): StoredProjection | null {
  const parsed = StoredProjectionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * P14 materialises a source-issued terminal receipt into an immutable small
 * projection. It does not calculate a split from requested browser input,
 * read a snapshot/Parquet file, infer strict selection, or add holdout unlock
 * authority.
 */
@Injectable()
export class ResearchSplitService {
  constructor(
    private readonly repository: ResearchSplitRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async ingest(scope: ProgressIngressScope, input: ResearchProgressIngress): Promise<void> {
    if (input.split === undefined) return;
    if (input.event.event_type !== "run_completed") {
      throw new ResearchSplitError("RESEARCH_SPLIT_INVALID", "Split receipt may only accompany a completed Research run.", 400);
    }
    const source = ResearchSplitSourceSchema.safeParse(input.split);
    if (!source.success) {
      throw new ResearchSplitError("RESEARCH_SPLIT_INVALID", "Research split source payload is invalid.", 400);
    }
    const eventDigest = input.event.payload.split_digest;
    const sourceDigest = sha256ResearchJson(source.data);
    if (typeof eventDigest !== "string" || eventDigest !== sourceDigest) {
      throw new ResearchSplitError("RESEARCH_SPLIT_CONFLICT", "Split receipt does not match its terminal source digest.", 409);
    }
    await this.repository.persist(scope, this.buildWrite(input.run_id, input.event.sequence, source.data, sourceDigest));
  }

  async detail(scope: ResearchScope, runId: string): Promise<ResearchSplitResponse> {
    this.requireEnabled();
    const row = await this.repository.hub(scope, runId);
    if (!row) {
      throw new ResearchSplitError("RESEARCH_SPLIT_NOT_FOUND", "Research run was not found.", 404);
    }
    const response = this.mapDetail(row);
    const parsed = ResearchSplitResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchSplitError("RESEARCH_SPLIT_UNAVAILABLE", "Split response is incompatible.", 503);
    }
    return parsed.data;
  }

  private buildWrite(
    runId: string,
    sourceEventSequence: number,
    source: ResearchSplitSource,
    sourceDigest: string,
  ): SplitProjectionWrite {
    const projection: StoredProjection = {
      schema_version: "research.split-projection.v1",
      source,
    };
    const projectionDigest = sha256ResearchJson(projection);
    return {
      runId,
      sourceSplitDigest: sourceDigest,
      sourceManifestDigest: source.source.manifest_digest,
      sourcePayload: source,
      sourceEventSequence,
      projectionRevision: `p14r1_${projectionDigest}`,
      projectionDigest,
      readiness: "PARTIAL",
      projection,
    };
  }

  private mapDetail(row: SplitHubRow): unknown {
    const fallback = this.rowAvailability(row);
    const projection = row.projection ? parseProjection(row.projection) : null;
    if (row.projection && !projection) {
      throw new ResearchSplitError("RESEARCH_SPLIT_UNAVAILABLE", "Stored split projection is incompatible.", 503);
    }
    if (!projection) return this.absentDetail(row, fallback);

    const source = projection.source;
    const absences = {
      purge: sourceAbsence(source.absences.purge),
      embargo: sourceAbsence(source.absences.embargo),
      inner_folds: sourceAbsence(source.absences.inner_folds),
      theta_per_fold: sourceAbsence(source.absences.theta_per_fold),
      gap_scan: sourceAbsence(source.absences.gap_scan),
      holdout_unlock: sourceAbsence(source.absences.holdout_unlock),
    };
    const available = availability("AVAILABLE", null);
    const warmup = source.windows.warmup.state === "AVAILABLE"
      ? { ...source.windows.warmup, availability: available }
      : { ...source.windows.warmup, availability: availability("NOT_APPLICABLE", source.windows.warmup.reason_code) };
    return {
      schema_version: "research.split-detail.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: row.runId,
      revision: row.revision,
      etag: row.revision ? `"${row.revision}"` : null,
      availability: available,
      readiness: row.readiness ?? "PARTIAL",
      as_of_utc_ms: row.asOfUtcMs,
      provenance: {
        source_adapter_id: source.source.execution_adapter_id,
        engine_version: source.source.engine_version,
        input_scope: source.source.input_scope,
        source_transform_digest: source.source.source_transform_digest,
        requested_spec_digest: row.requestedSpecDigest,
        effective_spec_digest: row.effectiveSpecDigest,
        dataset_binding_digest: row.datasetBindingDigest,
        manifest_digest: row.manifestDigest,
      },
      timeline: source.timeline,
      protocol: {
        kind: source.protocol.kind,
        selection: {
          state: source.protocol.selection.state,
          parameter_bundle_digest: source.protocol.selection.parameter_bundle_digest,
          strict_outer_oos: sourceAbsence(source.protocol.selection.strict_outer_oos),
        },
        fold_plan: sourceAbsence(source.protocol.fold_plan),
        inner_folds: absences.inner_folds,
        purge: absences.purge,
        embargo: absences.embargo,
        theta_per_fold: absences.theta_per_fold,
        gap_scan: absences.gap_scan,
      },
      windows: {
        warmup,
        is: { ...source.windows.is, availability: available },
        outer_oos: { ...source.windows.outer_oos, availability: available },
        holdout: {
          ...source.windows.holdout,
          physical_io: source.source.physical_io,
          source_seal: sourceAbsence({ state: "NOT_PUBLISHED", reason_code: "P04_SOURCE_DID_NOT_PUBLISH_HOLDOUT_SEAL" }),
          unlock: absences.holdout_unlock,
          availability: available,
        },
      },
      actions: {
        holdout_unlock: {
          state: "NOT_PUBLISHED",
          href: null,
          availability: absences.holdout_unlock.availability,
        },
      },
      source_absences: absences,
    };
  }

  private absentDetail(row: SplitHubRow, fallback: Availability): unknown {
    const unavailable = {
      state: "NOT_PUBLISHED" as const,
      reason_code: fallback.reason_code ?? "P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED",
      availability: fallback,
    };
    return {
      schema_version: "research.split-detail.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: row.runId,
      revision: null,
      etag: null,
      availability: fallback,
      readiness: "NOT_READY",
      as_of_utc_ms: row.asOfUtcMs,
      provenance: {
        source_adapter_id: null, engine_version: null, input_scope: null, source_transform_digest: null,
        requested_spec_digest: row.requestedSpecDigest,
        effective_spec_digest: row.effectiveSpecDigest,
        dataset_binding_digest: row.datasetBindingDigest,
        manifest_digest: row.manifestDigest,
      },
      timeline: null,
      protocol: {
        kind: null,
        selection: { state: "NOT_PUBLISHED", parameter_bundle_digest: null, strict_outer_oos: unavailable },
        fold_plan: unavailable, inner_folds: unavailable, purge: unavailable, embargo: unavailable,
        theta_per_fold: unavailable, gap_scan: unavailable,
      },
      windows: { warmup: unavailable, is: unavailable, outer_oos: unavailable, holdout: unavailable },
      actions: { holdout_unlock: { state: "NOT_PUBLISHED", href: null, availability: fallback } },
      source_absences: {
        fold_plan: unavailable, strict_outer_oos: unavailable, inner_folds: unavailable, purge: unavailable,
        embargo: unavailable, theta_per_fold: unavailable, gap_scan: unavailable, holdout_unlock: unavailable,
      },
    };
  }

  private rowAvailability(row: SplitHubRow): Availability {
    if (row.kind === "LEGACY") {
      return availability("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_DOES_NOT_PUBLISH_P14_SPLIT_TRUTH");
    }
    const pending = row.jobState === "QUEUED" || row.jobState === "CLAIMED" || row.jobState === "RUNNING";
    return pending
      ? availability("PENDING_SOURCE_CALLBACK", "P14_SOURCE_COMPLETION_PENDING")
      : availability("NOT_PUBLISHED", "P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED");
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_SPLIT !== "true") {
      throw new ResearchSplitError("RESEARCH_SPLIT_UNAVAILABLE", "Research split truth is not enabled in this environment.", 503);
    }
  }
}
