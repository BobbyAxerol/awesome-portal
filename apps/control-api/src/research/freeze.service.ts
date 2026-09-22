/** P16 source-as-is Freeze / integrity projection and same-origin BFF. */

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
import { ResearchSplitSourceSchema, type ResearchSplitSource } from "./progress.contract";
import {
  ResearchFreezeResponseSchema,
  ResearchFreezeVerificationResponseSchema,
  type ResearchFreezeResponse,
  type ResearchFreezeVerificationResponse,
} from "./freeze.contract";
import { ResearchFreezeError } from "./freeze.error";
import { ResearchSplitError } from "./split.error";
import { ResearchSplitRepository, type SplitHubRow } from "./split.repository";

type AvailabilityState =
  | "AVAILABLE"
  | "NOT_PUBLISHED"
  | "PENDING_SOURCE_CALLBACK"
  | "LEGACY_METADATA_ONLY"
  | "NOT_APPLICABLE";
type Availability = { state: AvailabilityState; reason_code: string | null };
type SourceGapState = "NOT_PUBLISHED" | "NOT_APPLICABLE" | "NOT_ASSERTED" | "NOT_ATTESTED";
type SourceGap = { state: SourceGapState; reason_code: string; availability: Availability };

interface StoredSplitProjection {
  schema_version: "research.split-projection.v1";
  source: ResearchSplitSource;
}

const NO_SELECTION_ARTIFACT = "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_SELECTION_ARTIFACT";
const NO_STRICT_ORDERING = "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_WALL_CLOCK_ORDERING_FACTS";
const NO_DIAGNOSTIC_GRID = "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_EVALUATED_WHAT_IF_GRID";
const NO_DIAGNOSTIC_ADMISSION = "P04_FIXED_PROFILE_DOES_NOT_ACCEPT_DIAGNOSTIC_PARAMETER_OVERRIDES";
const NO_SIBLING_DRAFT = "P04_FIXED_PROFILE_DOES_NOT_ACCEPT_SIBLING_PARAMETER_DRAFTS";
const NO_ARTIFACT_BYTES = "P04_SOURCE_ARTIFACT_BYTES_NOT_PUBLISHED_TO_PORTAL";

function availability(state: AvailabilityState, reasonCode: string | null): Availability {
  return { state, reason_code: reasonCode };
}

function gap(state: SourceGapState, reasonCode: string): SourceGap {
  const availabilityState: AvailabilityState = state === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "NOT_PUBLISHED";
  return { state, reason_code: reasonCode, availability: availability(availabilityState, reasonCode) };
}

function unavailableGap(sourceAvailability: Availability, fallbackReason: string): SourceGap {
  return {
    state: "NOT_PUBLISHED",
    reason_code: sourceAvailability.reason_code ?? fallbackReason,
    availability: sourceAvailability,
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
    throw new ResearchFreezeError("RESEARCH_FREEZE_UNAVAILABLE", "Freeze parameter profile is incompatible.", 503);
  }
  return String(value);
}

function staticParameters() {
  const declared = P04_DELTA_BINDING.declaredContract.parameter_space;
  return Object.entries(P04_DELTA_FIXED_PARAMETERS).map(([name, rawValue]) => {
    const range = declared[name as keyof typeof declared];
    if (!range) {
      throw new ResearchFreezeError("RESEARCH_FREEZE_UNAVAILABLE", "Freeze parameter declaration is incompatible.", 503);
    }
    const value = Number(rawValue);
    const span = range.maximum - range.minimum;
    const position = span > 0 ? Math.round(((value - range.minimum) / span) * 10_000) / 100 : 0;
    if (!Number.isFinite(position) || position < 0 || position > 100 || value < range.minimum || value > range.maximum) {
      throw new ResearchFreezeError("RESEARCH_FREEZE_UNAVAILABLE", "Frozen parameter is outside its declaration.", 503);
    }
    return {
      name,
      kind: "NUMERIC" as const,
      minimum: exactDecimal(range.minimum),
      maximum: exactDecimal(range.maximum),
      step: exactDecimal(range.step),
      frozen_value: exactDecimal(value),
      position_percent: position,
      bound_state: "WITHIN_DECLARED_RANGE" as const,
    };
  });
}

function rowAvailability(row: SplitHubRow): Availability {
  if (row.kind === "LEGACY") return availability("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_DOES_NOT_PUBLISH_P16_FREEZE_TRUTH");
  const pending = row.jobState === "QUEUED" || row.jobState === "CLAIMED" || row.jobState === "RUNNING";
  return pending
    ? availability("PENDING_SOURCE_CALLBACK", "P16_SOURCE_COMPLETION_PENDING")
    : availability("NOT_PUBLISHED", "P16_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED");
}

/**
 * P16 reads the same immutable P14 receipt as P15. It can verify the retained
 * P04/P10/P14 digest binding, but the installed source does not publish the
 * source artifact bytes, a candidate/selection artifact, ordering clocks or
 * a diagnostic evaluation relation. A partial binding match therefore never
 * becomes a full integrity PASS.
 */
@Injectable()
export class ResearchFreezeService {
  constructor(
    private readonly split: ResearchSplitRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async detail(
    scope: ResearchScope,
    runId: string,
    query: { fold?: number },
  ): Promise<ResearchFreezeResponse> {
    this.requireEnabled();
    const row = await this.row(scope, runId);
    const response = this.mapDetail(row, query.fold ?? null);
    const parsed = ResearchFreezeResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchFreezeError("RESEARCH_FREEZE_UNAVAILABLE", "Freeze response is incompatible.", 503);
    }
    return parsed.data;
  }

  async verify(
    scope: ResearchScope,
    runId: string,
    query: { fold?: number },
  ): Promise<ResearchFreezeVerificationResponse> {
    const detail = await this.detail(scope, runId, query);
    const result = detail.freeze.integrity.state === "PARTIAL"
      ? "PARTIAL_MATCH"
      : detail.freeze.integrity.state === "BLOCKED"
        ? "BLOCKED"
        : "NOT_PUBLISHED";
    const response = {
      schema_version: "research.freeze-verification.v1" as const,
      read_authority: "PORTAL_PERSISTED_RESEARCH" as const,
      run_id: detail.run_id,
      freeze_revision: detail.revision,
      verified_at_utc_ms: detail.as_of_utc_ms,
      result,
      integrity: detail.freeze.integrity,
    };
    const parsed = ResearchFreezeVerificationResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchFreezeError("RESEARCH_FREEZE_UNAVAILABLE", "Freeze verification response is incompatible.", 503);
    }
    return parsed.data;
  }

  private async row(scope: ResearchScope, runId: string): Promise<SplitHubRow> {
    try {
      const row = await this.split.hub(scope, runId);
      if (!row) throw new ResearchFreezeError("RESEARCH_FREEZE_NOT_FOUND", "Research run was not found.", 404);
      return row;
    } catch (error) {
      if (error instanceof ResearchFreezeError) throw error;
      if (error instanceof ResearchSplitError) {
        throw new ResearchFreezeError(
          error.code === "RESEARCH_SPLIT_FORBIDDEN" ? "RESEARCH_FREEZE_FORBIDDEN" : "RESEARCH_FREEZE_UNAVAILABLE",
          error.code === "RESEARCH_SPLIT_FORBIDDEN" ? "Access denied." : "Freeze is temporarily unavailable.",
          error.code === "RESEARCH_SPLIT_FORBIDDEN" ? 403 : 503,
        );
      }
      throw error;
    }
  }

  private mapDetail(row: SplitHubRow, requestedFold: number | null): unknown {
    const fallback = rowAvailability(row);
    const projection = row.projection ? parseProjection(row.projection) : null;
    if (row.projection && !projection) {
      throw new ResearchFreezeError("RESEARCH_FREEZE_UNAVAILABLE", "Stored Freeze source is incompatible.", 503);
    }
    if (!projection || row.kind !== "DURABLE") return this.absentDetail(row, fallback, requestedFold);

    const source = projection.source;
    const expectedBundleDigest = sha256ResearchJson(P04_DELTA_FIXED_PARAMETERS);
    const checks = this.checks(row, source, expectedBundleDigest);
    const integrity = this.integrity(checks, source);
    // The P14 receipt can still be inspected when the installed P04 binding
    // differs, but this release must not project its static parameters over a
    // different immutable bundle. A blocked verifier therefore preserves
    // source chronology/absence facts while removing the local parameter map.
    const sourceAvailable = availability("AVAILABLE", null);
    const bindingAvailable = integrity.state === "NOT_PUBLISHED"
      ? availability("NOT_PUBLISHED", "P16_RETAINED_DIGEST_BINDING_INCOMPLETE")
      : sourceAvailable;
    const bindingMatches = integrity.state === "PARTIAL";
    const strictOuterOos = gap("NOT_ASSERTED", source.protocol.selection.strict_outer_oos.reason_code);
    const noSelection = gap("NOT_APPLICABLE", NO_SELECTION_ARTIFACT);
    const noOrdering = gap("NOT_ASSERTED", NO_STRICT_ORDERING);
    const noGrid = gap("NOT_APPLICABLE", NO_DIAGNOSTIC_GRID);
    const noDiagnosticAdmission = gap("NOT_APPLICABLE", NO_DIAGNOSTIC_ADMISSION);
    const noSibling = gap("NOT_APPLICABLE", NO_SIBLING_DRAFT);
    const revision = `p16r1_${sha256ResearchJson({
      p14_revision: row.revision,
      p14_source_split_digest: row.sourceSplitDigest,
      p04_adapter_contract_digest: row.adapterContractDigest,
      source_manifest_digest: source.source.manifest_digest,
      source_parameter_bundle_digest: source.protocol.selection.parameter_bundle_digest,
      checks,
    })}`;
    return {
      schema_version: "research.freeze-detail.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: row.runId,
      revision,
      etag: `"${revision}"`,
      availability: bindingAvailable,
      readiness: bindingMatches ? "PARTIAL" : "NOT_READY",
      as_of_utc_ms: row.asOfUtcMs,
      provenance: {
        source_adapter_id: source.source.execution_adapter_id,
        adapter_contract_digest: row.adapterContractDigest,
        p14_split_revision: row.revision,
        source_split_digest: row.sourceSplitDigest,
        requested_spec_digest: row.requestedSpecDigest,
        effective_spec_digest: row.effectiveSpecDigest,
        dataset_binding_digest: row.datasetBindingDigest,
        manifest_digest: row.manifestDigest,
      },
      freeze: {
        source_profile: {
          state: "FIXED_PROFILE_NO_SELECTION_ARTIFACT",
          reason_code: NO_SELECTION_ARTIFACT,
          availability: sourceAvailable,
        },
        inspection: {
          requested_fold: requestedFold,
          state: "NOT_APPLICABLE",
          availability: availability("NOT_APPLICABLE", "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_FOLD_SELECTIONS"),
        },
        selection: {
          state: "FIXED_PARAMETER_PROFILE",
          selection_artifact_ref: null,
          selected_trial_ref: null,
          selection_sequence: null,
          parameter_bundle_digest: source.protocol.selection.parameter_bundle_digest,
          strict_outer_oos: strictOuterOos,
          availability: sourceAvailable,
        },
        ordering: {
          state: "NOT_ASSERTED",
          reason_code: NO_STRICT_ORDERING,
          wall_clock: noOrdering,
          data_time: {
            state: "AVAILABLE",
            chronology_kind: "THREE_WINDOW_CURRENT",
            is: {
              start_utc_ms: source.windows.is.start_utc_ms,
              end_exclusive_utc_ms: source.windows.is.end_exclusive_utc_ms,
              bars: source.windows.is.bars,
              data_role: source.windows.is.data_role,
              child_input_state: source.windows.is.child_input_state,
              evaluation_state: null,
              availability: sourceAvailable,
            },
            outer_oos: {
              start_utc_ms: source.windows.outer_oos.start_utc_ms,
              end_exclusive_utc_ms: source.windows.outer_oos.end_exclusive_utc_ms,
              bars: source.windows.outer_oos.bars,
              data_role: source.windows.outer_oos.data_role,
              child_input_state: source.windows.outer_oos.child_input_state,
              evaluation_state: source.windows.outer_oos.evaluation_state,
              availability: sourceAvailable,
            },
            holdout: {
              start_utc_ms: source.windows.holdout.start_utc_ms,
              end_exclusive_utc_ms: source.windows.holdout.end_exclusive_utc_ms,
              bars: source.windows.holdout.bars,
              data_role: source.windows.holdout.data_role,
              child_input_state: source.windows.holdout.child_input_state,
              evaluation_state: source.windows.holdout.evaluation_state,
              availability: sourceAvailable,
            },
            availability: sourceAvailable,
          },
          availability: availability("NOT_PUBLISHED", NO_STRICT_ORDERING),
        },
        // An observed bundle digest remains useful evidence, but static
        // values from this release are not evidence for a mismatched bundle.
        frozen_parameters: bindingMatches ? staticParameters() : [],
        integrity,
        what_if: {
          state: "NOT_APPLICABLE",
          reason_code: NO_DIAGNOSTIC_GRID,
          grid: {
            state: "NOT_APPLICABLE",
            effective_cell_count: null,
            objective_definition: null,
            availability: noGrid.availability,
          },
          actions: {
            diagnostic_evaluate: {
              state: "NOT_APPLICABLE",
              may_submit: false,
              href: null,
              availability: noDiagnosticAdmission.availability,
            },
            sibling_draft: {
              state: "NOT_APPLICABLE",
              may_create: false,
              href: null,
              availability: noSibling.availability,
            },
          },
          availability: noGrid.availability,
        },
      },
      source_absences: {
        candidate_pool: noSelection,
        selection_artifact: noSelection,
        strict_ordering: noOrdering,
        source_artifact_bytes: integrity.source_artifact_bytes,
        what_if_grid: noGrid,
        diagnostic_admission: noDiagnosticAdmission,
        sibling_draft: noSibling,
      },
    };
  }

  private checks(
    row: SplitHubRow,
    source: ResearchSplitSource,
    expectedBundleDigest: string,
  ) {
    const check = (
      key: "P04_ADAPTER_CONTRACT" | "P10_MANIFEST_BINDING" | "P04_FIXED_PARAMETER_BUNDLE",
      expected: string | null,
      observed: string | null,
    ) => {
      const state = expected === null || observed === null ? "NOT_PUBLISHED" as const : expected === observed ? "MATCH" as const : "MISMATCH" as const;
      return {
        key,
        state,
        expected_digest: expected,
        observed_digest: observed,
        availability: state === "NOT_PUBLISHED"
          ? availability("NOT_PUBLISHED", `P16_${key}_NOT_PUBLISHED`)
          : availability("AVAILABLE", null),
      };
    };
    return [
      check("P04_ADAPTER_CONTRACT", P04_DELTA_ADAPTER_CONTRACT_DIGEST, row.adapterContractDigest),
      check("P10_MANIFEST_BINDING", row.manifestDigest, source.source.manifest_digest),
      check("P04_FIXED_PARAMETER_BUNDLE", expectedBundleDigest, source.protocol.selection.parameter_bundle_digest),
    ];
  }

  private integrity(
    checks: ReturnType<ResearchFreezeService["checks"]>,
    source: ResearchSplitSource,
  ) {
    const blocked = checks.some((check) => check.state === "MISMATCH");
    const missing = checks.some((check) => check.state === "NOT_PUBLISHED");
    const state = blocked ? "BLOCKED" as const : missing ? "NOT_PUBLISHED" as const : "PARTIAL" as const;
    const availabilityState: AvailabilityState = blocked ? "AVAILABLE" : missing ? "NOT_PUBLISHED" : "AVAILABLE";
    const artifact = gap("NOT_ATTESTED", source.source.physical_io.reason_code || NO_ARTIFACT_BYTES);
    return {
      state,
      verification_scope: state === "NOT_PUBLISHED" ? "NONE" as const : "PORTAL_RETAINED_DIGEST_BINDING_ONLY" as const,
      checks,
      source_artifact_bytes: artifact,
      availability: availability(availabilityState, missing ? "P16_RETAINED_DIGEST_BINDING_INCOMPLETE" : null),
    };
  }

  private absentDetail(row: SplitHubRow, fallback: Availability, requestedFold: number | null): unknown {
    const unavailable = unavailableGap(fallback, "P16_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED");
    return {
      schema_version: "research.freeze-detail.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: row.runId,
      revision: null,
      etag: null,
      availability: fallback,
      readiness: "NOT_READY",
      as_of_utc_ms: row.asOfUtcMs,
      provenance: {
        source_adapter_id: null, adapter_contract_digest: row.adapterContractDigest, p14_split_revision: null,
        source_split_digest: null, requested_spec_digest: row.requestedSpecDigest,
        effective_spec_digest: row.effectiveSpecDigest, dataset_binding_digest: row.datasetBindingDigest,
        manifest_digest: row.manifestDigest,
      },
      freeze: {
        source_profile: {
          state: fallback.state === "PENDING_SOURCE_CALLBACK" ? "PENDING_SOURCE_CALLBACK"
            : fallback.state === "LEGACY_METADATA_ONLY" ? "LEGACY_METADATA_ONLY" : "NOT_PUBLISHED",
          reason_code: fallback.reason_code,
          availability: fallback,
        },
        inspection: { requested_fold: requestedFold, state: "NOT_PUBLISHED", availability: fallback },
        selection: {
          state: "NOT_PUBLISHED", selection_artifact_ref: null, selected_trial_ref: null, selection_sequence: null,
          parameter_bundle_digest: null, strict_outer_oos: unavailable, availability: fallback,
        },
        ordering: {
          state: "NOT_PUBLISHED", reason_code: unavailable.reason_code, wall_clock: unavailable,
          data_time: { state: "NOT_PUBLISHED", chronology_kind: null, is: null, outer_oos: null, holdout: null, availability: fallback },
          availability: fallback,
        },
        frozen_parameters: [],
        integrity: {
          state: "NOT_PUBLISHED", verification_scope: "NONE", checks: [],
          source_artifact_bytes: unavailable, availability: fallback,
        },
        what_if: {
          state: "NOT_PUBLISHED", reason_code: unavailable.reason_code,
          grid: { state: "NOT_PUBLISHED", effective_cell_count: null, objective_definition: null, availability: fallback },
          actions: {
            diagnostic_evaluate: { state: "NOT_PUBLISHED", may_submit: false, href: null, availability: fallback },
            sibling_draft: { state: "NOT_PUBLISHED", may_create: false, href: null, availability: fallback },
          },
          availability: fallback,
        },
      },
      source_absences: {
        candidate_pool: unavailable, selection_artifact: unavailable, strict_ordering: unavailable,
        source_artifact_bytes: unavailable, what_if_grid: unavailable, diagnostic_admission: unavailable,
        sibling_draft: unavailable,
      },
    };
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_FREEZE !== "true") {
      throw new ResearchFreezeError("RESEARCH_FREEZE_UNAVAILABLE", "Research Freeze is not enabled in this environment.", 503);
    }
  }
}
