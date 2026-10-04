/** P14 Split / chronology projection builder and same-origin reader. */

import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";
import { readRunDeclaration } from "./run-declaration.read";

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

const THREE_WINDOW_NOT_APPLICABLE = {
  purge: "P14_THREE_WINDOW_PROTOCOL_HAS_NO_PURGE",
  embargo: "P14_THREE_WINDOW_PROTOCOL_HAS_NO_EMBARGO",
  inner_folds: "P14_THREE_WINDOW_PROTOCOL_HAS_NO_INNER_FOLDS",
} as const;
const HOLDOUT_BARS_REASON = "P10_HOLDOUT_BARS_NOT_COUNTED_OUTSIDE_CHILD_TAPE";

/**
 * Bump when the published representation changes for an unchanged immutable
 * revision, so a validator issued for an older representation cannot 304.
 */
const SPLIT_REPRESENTATION_VERSION = "research.split-detail.v1+rf05.1";

function notApplicable(reasonCode: string) {
  return {
    state: "NOT_APPLICABLE" as const,
    reason_code: reasonCode,
    availability: availability("NOT_APPLICABLE", reasonCode),
  };
}

type AbsenceIndexEntry = { key: string; pointer: string; state: "NOT_PUBLISHED" | "NOT_ASSERTED" | "NOT_APPLICABLE" };

/** RF-05 CG-P14-06: one pointer per absent fact, into the field that owns it. */
const PROJECTED_ABSENCE_POINTERS: ReadonlyArray<readonly [string, string]> = [
  ["strict_outer_oos", "/protocol/selection/strict_outer_oos"],
  ["fold_plan", "/protocol/fold_plan"],
  ["inner_folds", "/protocol/inner_folds"],
  ["purge", "/protocol/purge"],
  ["embargo", "/protocol/embargo"],
  ["theta_per_fold", "/protocol/theta_per_fold"],
  ["gap_scan", "/protocol/gap_scan"],
  ["holdout_seal", "/windows/holdout/source_seal"],
  ["holdout_unlock", "/windows/holdout/unlock"],
  ["holdout_bars", "/windows/holdout/bars_absence"],
];
/** Without a projection every window is itself the absent fact; its unlock is subsumed. */
const ABSENT_DETAIL_POINTERS: ReadonlyArray<readonly [string, string]> = [
  ["strict_outer_oos", "/protocol/selection/strict_outer_oos"],
  ["fold_plan", "/protocol/fold_plan"],
  ["inner_folds", "/protocol/inner_folds"],
  ["purge", "/protocol/purge"],
  ["embargo", "/protocol/embargo"],
  ["theta_per_fold", "/protocol/theta_per_fold"],
  ["gap_scan", "/protocol/gap_scan"],
  ["warmup", "/windows/warmup"],
  ["is", "/windows/is"],
  ["outer_oos", "/windows/outer_oos"],
  ["holdout", "/windows/holdout"],
];

function absenceIndex(body: unknown, pointers: ReadonlyArray<readonly [string, string]>): AbsenceIndexEntry[] {
  const entries: AbsenceIndexEntry[] = [];
  for (const [key, pointer] of pointers) {
    const node = pointer.split("/").slice(1).reduce<unknown>(
      (value, part) => (value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined),
      body,
    );
    const state = node && typeof node === "object" ? (node as { state?: unknown }).state : undefined;
    if (state === "NOT_PUBLISHED" || state === "NOT_ASSERTED" || state === "NOT_APPLICABLE") {
      entries.push({ key, pointer, state });
    }
  }
  return entries;
}

/**
 * RF-05 CG-P14-04/CG-P13-13 (Astra A06): the HTTP validator names the exact
 * published representation, not only the immutable content revision. With
 * `as_of_utc_ms` now a stored source time, the body is deterministic.
 */
function representationEtag(body: { etag: string | null }): string {
  const { etag: _etag, ...representation } = body;
  return `"p14r1_${sha256ResearchJson({ representation_version: SPLIT_REPRESENTATION_VERSION, representation })}"`;
}

const DatasetBindingPublicSchema = z.object({
  dataset_id: z.string().min(1).max(191),
  symbol: z.string().min(1).max(64),
  timeframe: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/),
}).passthrough();

const INTERVAL_UNIT_MS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

function barIntervalMs(timeframe: string): number | null {
  const match = /^([1-9][0-9]{0,3})([mhdw])$/.exec(timeframe);
  if (!match) return null;
  const value = Number(match[1]) * INTERVAL_UNIT_MS[match[2]!]!;
  return Number.isSafeInteger(value) && value <= 31_536_000_000 ? value : null;
}

/**
 * RF-05 CG-P14-05: the dataset/timeframe fact comes from the P08 binding
 * that P10 pinned by digest, so it exists before the source callback. The
 * binding is published only when its canonical digest equals the producer's.
 */
function datasetFact(row: SplitHubRow, fallback: Availability) {
  const absent = (state: "NOT_PUBLISHED" | "PENDING_SOURCE_CALLBACK" | "LEGACY_METADATA_ONLY", reasonCode: string) => ({
    state,
    dataset_id: null,
    symbol: null,
    timeframe: null,
    bar_interval_ms: null,
    provenance: "NONE" as const,
    reason_code: reasonCode,
    availability: availability(state, reasonCode),
  });
  if (row.kind === "LEGACY") {
    return absent("LEGACY_METADATA_ONLY", fallback.reason_code ?? "LEGACY_1_0_8_DOES_NOT_PUBLISH_P14_SPLIT_TRUTH");
  }
  if (!row.datasetBinding || !row.datasetBindingDigest) {
    return absent("NOT_PUBLISHED", "P14_DATASET_BINDING_NOT_PUBLISHED");
  }
  if (sha256ResearchJson(row.datasetBinding) !== row.datasetBindingDigest) {
    return absent("NOT_PUBLISHED", "P14_DATASET_BINDING_DIGEST_MISMATCH");
  }
  const parsed = DatasetBindingPublicSchema.safeParse(row.datasetBinding);
  if (!parsed.success) return absent("NOT_PUBLISHED", "P14_DATASET_BINDING_TIMEFRAME_NOT_PUBLISHED");
  const interval = barIntervalMs(parsed.data.timeframe);
  return {
    state: "AVAILABLE" as const,
    dataset_id: parsed.data.dataset_id,
    symbol: parsed.data.symbol,
    timeframe: parsed.data.timeframe,
    bar_interval_ms: interval,
    provenance: "P08_DATASET_BINDING" as const,
    reason_code: interval === null ? "P14_TIMEFRAME_HAS_NO_FIXED_BAR_INTERVAL" : null,
    availability: availability("AVAILABLE", null),
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

  async detail(scope: ResearchScope, runId: string, signal?: AbortSignal): Promise<ResearchSplitResponse> {
    this.requireEnabled();
    const row = await this.repository.hub(scope, runId, signal);
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
    // RF-05 CG-P14-03: a three-window request has no field that could carry a
    // purge, an embargo or inner folds, so those facts do not apply to it.
    // The immutable source row keeps its original wording; only the reader's
    // classification changes, and `revision` still names the same source.
    const threeWindow = source.protocol.kind === "THREE_WINDOW_CURRENT";
    const protocolFact = (key: keyof typeof THREE_WINDOW_NOT_APPLICABLE, value: SourceAbsence) =>
      threeWindow ? notApplicable(THREE_WINDOW_NOT_APPLICABLE[key]) : sourceAbsence(value);
    const absences = {
      purge: protocolFact("purge", source.absences.purge),
      embargo: protocolFact("embargo", source.absences.embargo),
      inner_folds: protocolFact("inner_folds", source.absences.inner_folds),
      theta_per_fold: sourceAbsence(source.absences.theta_per_fold),
      gap_scan: sourceAbsence(source.absences.gap_scan),
      holdout_unlock: sourceAbsence(source.absences.holdout_unlock),
    };
    const available = availability("AVAILABLE", null);
    const warmup = source.windows.warmup.state === "AVAILABLE"
      ? { ...source.windows.warmup, availability: available }
      : { ...source.windows.warmup, availability: availability("NOT_APPLICABLE", source.windows.warmup.reason_code) };
    const body = {
      schema_version: "research.split-detail.v1",
      run_declaration: readRunDeclaration(row.runDeclarationInputs ?? {}),
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: row.runId,
      revision: row.revision,
      etag: null as string | null,
      availability: available,
      readiness: row.readiness ?? "PARTIAL",
      as_of_utc_ms: row.sourceAsOfUtcMs,
      as_of_basis: row.sourceAsOfBasis,
      dataset: datasetFact(row, fallback),
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
          bars_absence: sourceAbsence({ state: "NOT_PUBLISHED", reason_code: HOLDOUT_BARS_REASON }),
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
      absence_authority: "FIELD_LOCAL",
      absence_index: [] as AbsenceIndexEntry[],
      source_absences: absences,
    };
    body.absence_index = absenceIndex(body, PROJECTED_ABSENCE_POINTERS);
    if (row.revision) body.etag = representationEtag(body);
    return body;
  }

  private absentDetail(row: SplitHubRow, fallback: Availability): unknown {
    const unavailable = {
      state: "NOT_PUBLISHED" as const,
      reason_code: fallback.reason_code ?? "P14_SOURCE_SPLIT_RECEIPT_NOT_PUBLISHED",
      availability: fallback,
    };
    const body = {
      schema_version: "research.split-detail.v1",
      run_declaration: readRunDeclaration(row.runDeclarationInputs ?? {}),
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: row.runId,
      revision: null,
      etag: null,
      availability: fallback,
      readiness: "NOT_READY",
      as_of_utc_ms: row.sourceAsOfUtcMs,
      as_of_basis: row.sourceAsOfBasis,
      dataset: datasetFact(row, fallback),
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
      absence_authority: "FIELD_LOCAL",
      absence_index: [] as AbsenceIndexEntry[],
      source_absences: {
        fold_plan: unavailable, strict_outer_oos: unavailable, inner_folds: unavailable, purge: unavailable,
        embargo: unavailable, theta_per_fold: unavailable, gap_scan: unavailable, holdout_unlock: unavailable,
      },
    };
    body.absence_index = absenceIndex(body, ABSENT_DETAIL_POINTERS);
    return body;
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
