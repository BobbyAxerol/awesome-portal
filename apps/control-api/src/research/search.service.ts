/** P15 source-as-is Search/ledger/diagnostics projection and BFF. */

import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import {
  P04_DELTA_ADAPTER_CONTRACT_DIGEST,
  P04_DELTA_BINDING,
  P04_DELTA_FIXED_PARAMETERS,
} from "./p04-delta.binding";
import { sha256ResearchJson } from "./preflight.service";
import { P04_FIXED_QUALIFICATION_PROFILE_ID } from "./delta-wfo.profile";
import { ResearchSplitSourceSchema, type ResearchSplitSource } from "./progress.contract";
import { ResearchSearchResponseSchema, type ResearchSearchResponse } from "./search.contract";
import { ResearchSearchError } from "./search.error";
import { ResearchSplitError } from "./split.error";
import { ResearchSplitRepository, type SplitHubRow } from "./split.repository";

type AvailabilityState =
  | "AVAILABLE"
  | "NOT_PUBLISHED"
  | "PENDING_SOURCE_CALLBACK"
  | "LEGACY_METADATA_ONLY"
  | "NOT_APPLICABLE";
type Availability = { state: AvailabilityState; reason_code: string | null };
type SourceGapState = "NOT_PUBLISHED" | "NOT_APPLICABLE" | "NOT_ASSERTED";
type SourceGap = { state: SourceGapState; reason_code: string; availability: Availability };

interface StoredSplitProjection {
  schema_version: "research.split-projection.v1";
  source: ResearchSplitSource;
}

const FIXED_PROFILE_REASON = "P04_FIXED_PROFILE_DOES_NOT_CREATE_OPTIMIZER_STUDY";
const FIXED_DIAGNOSTIC_REASON = "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_SEARCH_DIAGNOSTICS";
const STRICT_OOS_REASON = "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_STRICT_OUTER_OOS_SELECTION_FACTS";
const CANDIDATE_SELECTION_METRIC_REASON = "P15_DECLARED_REQUEST_DID_NOT_BIND_CANDIDATE_SELECTION_METRIC";
const REQUESTED_OPTIMIZER_NOT_PUBLISHED_REASON = "P10_REQUESTED_OPTIMIZER_DECLARATION_NOT_PUBLISHED";
const NO_VALIDATION_CLAIM_REASON = "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_VALIDATION_CLAIM";
const NO_CHRONOLOGICAL_CLAIM_REASON = "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_CHRONOLOGICAL_CLAIM";
const NO_SCORING_BACKEND_REASON = "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_SCORING_BACKEND";
const NOT_DECLARED_CLAIM_REASON = "P15_NO_OPTIMIZER_DECLARED_NO_MODE_CLAIM";

/** Bump when the representation changes for an unchanged content revision. */
const SEARCH_REPRESENTATION_VERSION = "research.search-detail.v1+rf05.1";

/**
 * RF-05 CG-P15-02 (Astra A06): `revision` names the immutable content and is
 * fold-independent; the HTTP validator names the exact representation,
 * including `inspection.requested_fold`, so another fold's ETag cannot 304.
 */
function representationEtag(body: { etag: string | null }): string {
  const { etag: _etag, ...representation } = body;
  return `"p15r1_${sha256ResearchJson({ representation_version: SEARCH_REPRESENTATION_VERSION, representation })}"`;
}

function absentClaim(state: "NOT_APPLICABLE" | "NOT_PUBLISHED", reasonCode: string, parent?: Availability) {
  return {
    state,
    value: null,
    provenance: "NONE" as const,
    reason_code: reasonCode,
    availability: parent ?? availability(state, reasonCode),
  };
}

/**
 * RF-05 CG-P15-05. A declared-but-unexecuted optimizer has no mode claim;
 * the only run-sourced fact is P14's outer-OOS evaluation state.
 */
function currentClaimRow(
  optimizer: { mode: string | null; schedule: string | null },
  declaredBackend: "proxy" | "endpoint" | null,
  source: ResearchSplitSource,
  strictOosReason: string,
) {
  const declared = optimizer.mode !== null && optimizer.schedule !== null;
  const claimReason = (reason: string) => (declared ? reason : NOT_DECLARED_CLAIM_REASON);
  return {
    basis: declared ? "DECLARED_NOT_EXECUTED" as const : "NOT_DECLARED" as const,
    validation_claim: absentClaim("NOT_APPLICABLE", claimReason(NO_VALIDATION_CLAIM_REASON)),
    chronological_claim: absentClaim("NOT_APPLICABLE", claimReason(NO_CHRONOLOGICAL_CLAIM_REASON)),
    oos_used_for_selection: {
      state: "NOT_ASSERTED" as const,
      value: null,
      provenance: "NONE" as const,
      reason_code: strictOosReason,
      availability: availability("NOT_PUBLISHED", strictOosReason),
    },
    oos_column: {
      state: "REPORT_ONLY" as const,
      source_evaluation_state: source.windows.outer_oos.evaluation_state,
      provenance: "P14_SOURCE_RECEIPT" as const,
      reason_code: null,
      availability: availability("AVAILABLE", null),
    },
    scoring_backend: {
      state: "NOT_APPLICABLE" as const,
      declared_value: declaredBackend,
      provenance: declaredBackend ? "RUN_REQUESTED_SPEC" as const : "NONE" as const,
      reason_code: claimReason(NO_SCORING_BACKEND_REASON),
      availability: availability("NOT_APPLICABLE", claimReason(NO_SCORING_BACKEND_REASON)),
    },
    mode_reference: declared ? {
      mode: optimizer.mode!,
      schedule: optimizer.schedule!,
      operation_id: "researchEngineAtlasGetV1" as const,
      relation: "DECLARED_MODE_RELEASE_METADATA_NOT_RUN_EVIDENCE" as const,
    } : null,
  };
}

/** Pending/legacy/mismatch: every claim fact keeps the envelope's own availability. */
function absentClaimRow(sourceAvailability: Availability, reason: string) {
  return {
    basis: "NOT_PUBLISHED" as const,
    validation_claim: absentClaim("NOT_PUBLISHED", reason, sourceAvailability),
    chronological_claim: absentClaim("NOT_PUBLISHED", reason, sourceAvailability),
    oos_used_for_selection: absentClaim("NOT_PUBLISHED", reason, sourceAvailability),
    oos_column: {
      state: "NOT_PUBLISHED" as const,
      source_evaluation_state: null,
      provenance: "NONE" as const,
      reason_code: reason,
      availability: sourceAvailability,
    },
    scoring_backend: {
      state: "NOT_PUBLISHED" as const,
      declared_value: null,
      provenance: "NONE" as const,
      reason_code: reason,
      availability: sourceAvailability,
    },
    mode_reference: null,
  };
}

function availability(state: AvailabilityState, reasonCode: string | null): Availability {
  return { state, reason_code: reasonCode };
}

function gap(state: SourceGapState, reasonCode: string): SourceGap {
  const availabilityState: AvailabilityState = state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "NOT_PUBLISHED";
  return { state, reason_code: reasonCode, availability: availability(availabilityState, reasonCode) };
}

/**
 * A pending callback and a legacy retained row are distinct from a current
 * receipt that simply did not publish a fact. Retain that distinction inside
 * nested absence panels as well as on the outer envelope, otherwise a client
 * could render an old row as if its source had completed and omitted a study.
 */
function unavailableGap(sourceAvailability: Availability, fallbackReason: string): SourceGap {
  return {
    state: "NOT_PUBLISHED",
    reason_code: sourceAvailability.reason_code ?? fallbackReason,
    availability: sourceAvailability,
  };
}

function candidateSelectionMetric(availabilityValue: Availability, declared: boolean) {
  const reasonCode = declared
    ? CANDIDATE_SELECTION_METRIC_REASON
    : availabilityValue.reason_code ?? REQUESTED_OPTIMIZER_NOT_PUBLISHED_REASON;
  return {
    state: "NOT_PUBLISHED" as const,
    value: null,
    provenance: "NONE" as const,
    reason_code: reasonCode,
    availability: availability(
      availabilityValue.state === "AVAILABLE" ? "NOT_PUBLISHED" : availabilityValue.state,
      reasonCode,
    ),
  };
}

function candidateSelectionMetricGap(metric: ReturnType<typeof candidateSelectionMetric>): SourceGap {
  return {
    state: "NOT_PUBLISHED",
    reason_code: metric.reason_code,
    // Preserve pending/legacy parent availability rather than flattening a
    // source outage into the stronger claim that the metric was inspected and
    // omitted from a completed receipt.
    availability: metric.availability,
  };
}

function parseProjection(value: unknown): StoredSplitProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schema_version !== "research.split-projection.v1") return null;
  const source = ResearchSplitSourceSchema.safeParse(record.source);
  return source.success ? { schema_version: "research.split-projection.v1", source: source.data } : null;
}

function exactDecimal(value: number): string {
  if (!Number.isFinite(value)) {
    throw new ResearchSearchError("RESEARCH_SEARCH_UNAVAILABLE", "Search parameter profile is incompatible.", 503);
  }
  return String(value);
}

function requestedSpecRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const research = (value as Record<string, unknown>).research;
  if (!research || typeof research !== "object" || Array.isArray(research)) return null;
  const requestedSpec = (research as Record<string, unknown>).requested_spec;
  if (!requestedSpec || typeof requestedSpec !== "object" || Array.isArray(requestedSpec)) return null;
  return requestedSpec as Record<string, unknown>;
}

/** The scoring backend the request declared, if any; a declaration, not an executed fact. */
function declaredScoringBackend(value: unknown): "proxy" | "endpoint" | null {
  const config = requestedSpecRecord(value)?.optimization_config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const backend = (config as Record<string, unknown>).scoring_backend;
  return backend === "proxy" || backend === "endpoint" ? backend : null;
}

function requestedOptimizer(value: unknown): { mode: string | null; schedule: string | null } {
  const record = requestedSpecRecord(value);
  if (!record) return { mode: null, schedule: null };
  const valid = (candidate: unknown): string | null =>
    typeof candidate === "string" && /^[A-Za-z0-9_:-]{1,120}$/.test(candidate) ? candidate : null;
  return {
    mode: valid(record.optimization_mode),
    schedule: valid(record.optimization_schedule),
  };
}

function staticParameters() {
  const declared = P04_DELTA_BINDING.declaredContract.parameter_space;
  return Object.entries(P04_DELTA_FIXED_PARAMETERS).map(([name, rawValue]) => {
    const range = declared[name as keyof typeof declared];
    if (!range) {
      throw new ResearchSearchError("RESEARCH_SEARCH_UNAVAILABLE", "Search parameter declaration is incompatible.", 503);
    }
    const value = Number(rawValue);
    const span = range.maximum - range.minimum;
    const position = span > 0 ? Math.round(((value - range.minimum) / span) * 10_000) / 100 : 0;
    if (!Number.isFinite(position) || position < 0 || position > 100 || value < range.minimum || value > range.maximum) {
      throw new ResearchSearchError("RESEARCH_SEARCH_UNAVAILABLE", "Search parameter profile is outside its declaration.", 503);
    }
    return {
      name,
      kind: "NUMERIC" as const,
      minimum: exactDecimal(range.minimum),
      maximum: exactDecimal(range.maximum),
      step: exactDecimal(range.step),
      effective_value: exactDecimal(value),
      position_percent: position,
      bound_state: "WITHIN_DECLARED_RANGE" as const,
    };
  });
}

function rowAvailability(row: SplitHubRow): Availability {
  if (row.kind === "LEGACY") return availability("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_DOES_NOT_PUBLISH_P15_SEARCH_TRUTH");
  const pending = row.jobState === "QUEUED" || row.jobState === "CLAIMED" || row.jobState === "RUNNING";
  return pending
    ? availability("PENDING_SOURCE_CALLBACK", "P15_SOURCE_COMPLETION_PENDING")
    : availability("NOT_PUBLISHED", "P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED");
}

/**
 * P15 consumes the immutable P14 source receipt rather than reading a
 * worker/artifact/Parquet path. P04 did not run an optimizer, so this service
 * has no study, trial index, sampler, candidate pool or diagnostic data to
 * persist. Its central invariant is that it must expose those absences, never
 * convert P11's one progress notification into a historical search ledger.
 */
@Injectable()
export class ResearchSearchService {
  constructor(
    private readonly split: ResearchSplitRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async detail(
    scope: ResearchScope,
    runId: string,
    query: { fold?: number },
  ): Promise<ResearchSearchResponse> {
    this.requireEnabled();
    let row: SplitHubRow | null;
    try {
      row = await this.split.hub(scope, runId);
    } catch (error) {
      if (error instanceof ResearchSplitError) {
        throw new ResearchSearchError(
          error.code === "RESEARCH_SPLIT_FORBIDDEN" ? "RESEARCH_SEARCH_FORBIDDEN" : "RESEARCH_SEARCH_UNAVAILABLE",
          error.code === "RESEARCH_SPLIT_FORBIDDEN" ? "Access denied." : "Search is temporarily unavailable.",
          error.code === "RESEARCH_SPLIT_FORBIDDEN" ? 403 : 503,
        );
      }
      throw error;
    }
    if (!row) throw new ResearchSearchError("RESEARCH_SEARCH_NOT_FOUND", "Research run was not found.", 404);
    const response = this.mapDetail(row, query.fold ?? null);
    const parsed = ResearchSearchResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchSearchError("RESEARCH_SEARCH_UNAVAILABLE", "Search response is incompatible.", 503);
    }
    return parsed.data;
  }

  private mapDetail(row: SplitHubRow, requestedFold: number | null): unknown {
    const fallback = rowAvailability(row);
    const projection = row.projection ? parseProjection(row.projection) : null;
    if (row.projection && !projection) {
      throw new ResearchSearchError("RESEARCH_SEARCH_UNAVAILABLE", "Stored Search source is incompatible.", 503);
    }
    if (!projection || row.kind !== "DURABLE") return this.absentDetail(row, fallback, requestedFold);

    const source = projection.source;
    const expectedBundleDigest = sha256ResearchJson(P04_DELTA_FIXED_PARAMETERS);
    // W1: gate on the immutable execution profile too; the Delta WFO profile
    // shares the P04 executor digest but is not the fixed qualification.
    const compatible = (row.executionProfileId ?? P04_FIXED_QUALIFICATION_PROFILE_ID) === P04_FIXED_QUALIFICATION_PROFILE_ID
      && row.adapterContractDigest === P04_DELTA_ADAPTER_CONTRACT_DIGEST
      && source.protocol.selection.state === "FIXED_PROFILE_NO_SEARCH"
      && source.protocol.selection.parameter_bundle_digest === expectedBundleDigest;
    if (!compatible) {
      // A static P04 declaration may not be projected over an immutable run
      // bound to another adapter/profile. Keep its retained P14 source usable,
      // but do not quietly reinterpret it as this release's parameter map.
      return this.absentDetail(
        row,
        availability("NOT_PUBLISHED", "P15_CURRENT_P04_PROFILE_CONTRACT_MISMATCH"),
        requestedFold,
      );
    }

    const available = availability("AVAILABLE", null);
    const optimizer = requestedOptimizer(row.legacyRequest);
    const declared = optimizer.mode && optimizer.schedule;
    const declaredOptimizer = Boolean(declared);
    const metric = candidateSelectionMetric(available, declaredOptimizer);
    const strictOos = gap("NOT_ASSERTED", source.protocol.selection.strict_outer_oos.reason_code || STRICT_OOS_REASON);
    const fixedGap = gap("NOT_APPLICABLE", FIXED_PROFILE_REASON);
    const diagnosticGap = gap("NOT_APPLICABLE", FIXED_DIAGNOSTIC_REASON);
    const selectionTrace = gap("NOT_APPLICABLE", "P04_FIXED_PROFILE_HAS_NO_ENGINE_SELECTION_TRACE");
    const sourceAbsences = {
      study: fixedGap,
      trial_ledger: fixedGap,
      trial_detail: fixedGap,
      trial_jump: fixedGap,
      candidate_pool: fixedGap,
      objective_components: fixedGap,
      selection_trace: selectionTrace,
      sampler_seed_warm_start: fixedGap,
      scatter: diagnosticGap,
      distributions: diagnosticGap,
      parameter_frequency: diagnosticGap,
      progression: diagnosticGap,
      prune_reasons: diagnosticGap,
      importance: diagnosticGap,
      interactions: diagnosticGap,
      search_fold: fixedGap,
      strict_outer_oos: strictOos,
      candidate_selection_metric: candidateSelectionMetricGap(metric),
    };
    const revisionPayload = {
      schema_version: "research.search-projection.v1",
      p14_revision: row.revision,
      source_split_digest: row.sourceSplitDigest,
      source_manifest_digest: source.source.manifest_digest,
      adapter_contract_digest: row.adapterContractDigest,
      parameter_bundle_digest: source.protocol.selection.parameter_bundle_digest,
      requested_optimizer: optimizer,
    };
    const revision = `p15r1_${sha256ResearchJson(revisionPayload)}`;
    const body = {
      schema_version: "research.search-detail.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: row.runId,
      revision,
      etag: null as string | null,
      availability: available,
      readiness: "PARTIAL",
      as_of_utc_ms: row.sourceAsOfUtcMs,
      as_of_basis: row.sourceAsOfBasis,
      provenance: {
        source_adapter_id: source.source.execution_adapter_id,
        adapter_contract_digest: row.adapterContractDigest,
        engine_version: source.source.engine_version,
        input_scope: source.source.input_scope,
        source_transform_digest: source.source.source_transform_digest,
        requested_spec_digest: row.requestedSpecDigest,
        effective_spec_digest: row.effectiveSpecDigest,
        dataset_binding_digest: row.datasetBindingDigest,
        manifest_digest: row.manifestDigest,
      },
      source_profile: {
        state: "FIXED_PROFILE_NO_SEARCH",
        reason_code: FIXED_PROFILE_REASON,
        availability: available,
      },
      requested_optimizer: {
        mode: optimizer.mode,
        schedule: optimizer.schedule,
        state: declaredOptimizer ? "DECLARED_NOT_EXECUTED" : "NOT_PUBLISHED",
        candidate_selection_metric: metric,
        availability: declaredOptimizer ? available : availability("NOT_PUBLISHED", REQUESTED_OPTIMIZER_NOT_PUBLISHED_REASON),
      },
      claim_row: currentClaimRow(optimizer, declaredScoringBackend(row.legacyRequest), source, strictOos.reason_code),
      fixed_profile: {
        state: "FIXED_PROFILE_NO_SEARCH",
        adapter_contract_digest: row.adapterContractDigest,
        parameter_bundle_digest: source.protocol.selection.parameter_bundle_digest,
        parameters: staticParameters(),
        strict_outer_oos: strictOos,
        availability: available,
      },
      selection: {
        state: "FIXED_PARAMETER_PROFILE",
        selected_trial_ref: null,
        parameter_bundle_digest: source.protocol.selection.parameter_bundle_digest,
        selection_trace: selectionTrace,
        availability: available,
      },
      inspection: {
        requested_fold: requestedFold,
        state: "NOT_APPLICABLE",
        availability: availability("NOT_APPLICABLE", FIXED_PROFILE_REASON),
      },
      ledger: {
        state: "NOT_APPLICABLE",
        reason_code: FIXED_PROFILE_REASON,
        total_rows: null,
        sampled_rows: null,
        page: null,
        availability: availability("NOT_APPLICABLE", FIXED_PROFILE_REASON),
      },
      diagnostics: {
        state: "NOT_APPLICABLE",
        availability: availability("NOT_APPLICABLE", FIXED_DIAGNOSTIC_REASON),
        scatter: diagnosticGap,
        distributions: diagnosticGap,
        parameter_frequency: diagnosticGap,
        progression: diagnosticGap,
        prune_reasons: diagnosticGap,
        importance: diagnosticGap,
        interactions: diagnosticGap,
      },
      source_absences: sourceAbsences,
    };
    body.etag = representationEtag(body);
    return body;
  }

  private absentDetail(row: SplitHubRow, sourceAvailability: Availability, requestedFold: number | null): unknown {
    const sourceState = sourceAvailability.state === "PENDING_SOURCE_CALLBACK"
      ? "PENDING_SOURCE_CALLBACK"
      : sourceAvailability.state === "LEGACY_METADATA_ONLY"
        ? "LEGACY_METADATA_ONLY"
        : "NOT_PUBLISHED";
    const reason = sourceAvailability.reason_code ?? "P15_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED";
    const unavailable = unavailableGap(sourceAvailability, reason);
    const metric = candidateSelectionMetric(sourceAvailability, false);
    return {
      schema_version: "research.search-detail.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: row.runId,
      revision: null,
      etag: null,
      availability: sourceAvailability,
      readiness: "NOT_READY",
      as_of_utc_ms: row.sourceAsOfUtcMs,
      as_of_basis: row.sourceAsOfBasis,
      provenance: {
        source_adapter_id: null,
        adapter_contract_digest: null,
        engine_version: null,
        input_scope: null,
        source_transform_digest: null,
        requested_spec_digest: row.requestedSpecDigest,
        effective_spec_digest: row.effectiveSpecDigest,
        dataset_binding_digest: row.datasetBindingDigest,
        manifest_digest: row.manifestDigest,
      },
      source_profile: { state: sourceState, reason_code: reason, availability: sourceAvailability },
      requested_optimizer: {
        mode: null,
        schedule: null,
        state: "NOT_PUBLISHED",
        candidate_selection_metric: metric,
        availability: sourceAvailability,
      },
      claim_row: absentClaimRow(sourceAvailability, reason),
      fixed_profile: {
        state: "NOT_PUBLISHED",
        adapter_contract_digest: null,
        parameter_bundle_digest: null,
        parameters: [],
        strict_outer_oos: unavailable,
        availability: sourceAvailability,
      },
      selection: {
        state: "NOT_PUBLISHED",
        selected_trial_ref: null,
        parameter_bundle_digest: null,
        selection_trace: unavailable,
        availability: sourceAvailability,
      },
      inspection: { requested_fold: requestedFold, state: "NOT_PUBLISHED", availability: sourceAvailability },
      ledger: {
        state: "NOT_PUBLISHED",
        reason_code: reason,
        total_rows: null,
        sampled_rows: null,
        page: null,
        availability: sourceAvailability,
      },
      diagnostics: {
        state: "NOT_PUBLISHED",
        availability: sourceAvailability,
        scatter: unavailable,
        distributions: unavailable,
        parameter_frequency: unavailable,
        progression: unavailable,
        prune_reasons: unavailable,
        importance: unavailable,
        interactions: unavailable,
      },
      source_absences: {
        study: unavailable,
        trial_ledger: unavailable,
        trial_detail: unavailable,
        trial_jump: unavailable,
        candidate_pool: unavailable,
        objective_components: unavailable,
        selection_trace: unavailable,
        sampler_seed_warm_start: unavailable,
        scatter: unavailable,
        distributions: unavailable,
        parameter_frequency: unavailable,
        progression: unavailable,
        prune_reasons: unavailable,
        importance: unavailable,
        interactions: unavailable,
        search_fold: unavailable,
        strict_outer_oos: unavailable,
        candidate_selection_metric: candidateSelectionMetricGap(metric),
      },
    };
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_SEARCH !== "true") {
      throw new ResearchSearchError("RESEARCH_SEARCH_UNAVAILABLE", "Research Search is not enabled in this deployment.", 503);
    }
  }
}
