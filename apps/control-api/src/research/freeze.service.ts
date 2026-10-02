/** P16 source-as-is Freeze / integrity projection and same-origin BFF. */

import { Inject, Injectable, Optional } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import { importedAlphaReadBinding } from "./imported-alpha.read-binding";
import { IMPORTED_ALPHA_PROFILE_ID } from "./imported-alpha.profile";
import {
  DEFAULT_PARAMETER_BINDING_REGISTRY,
  declaredParameterRows,
  RESEARCH_PARAMETER_BINDINGS,
  ResearchParameterBindingRegistry,
  type HistoricalParameterBinding,
} from "./parameter-binding.registry";
import { sha256ResearchJson } from "./preflight.service";
import { bytesBlockChain, notYet, type ArtifactByteVerification } from "./artifact-verify.contract";
import { ArtifactVerifyStoreError } from "./artifact-verify.repository";
import { BYTE_VERIFY_NOT_ENABLED, ResearchArtifactVerifyService } from "./artifact-verify.service";
import { P04_FIXED_QUALIFICATION_PROFILE_ID } from "./delta-wfo.profile";
import { VN_OBSERVED_FIXED_PROFILE_ID } from "./vn-observed-fixed.profile";
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
import { fixedStage4Binding, parameterAuthority } from "./stage4-binding";

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
const HISTORICAL_BINDING_NOT_REGISTERED = "P16_HISTORICAL_PARAMETER_BINDING_NOT_REGISTERED";
const WFO_PROFILE_NOT_P04_FREEZE = "P16_DELTA_WFO_PROFILE_USES_RETAINED_CURRENT_SOURCE_FREEZE";

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

/**
 * A10b: the frozen table is the run's own historical binding — looked up by
 * the exact adapter digest its immutable producer row names — never the
 * constants compiled into this release.
 */
function historicalParameters(binding: HistoricalParameterBinding) {
  const rows = declaredParameterRows(binding.parameterSpace, binding.fixedParameters);
  if (rows === null) {
    throw new ResearchFreezeError("RESEARCH_FREEZE_UNAVAILABLE", "Frozen parameter is outside its declaration.", 503);
  }
  return rows.map((row) => ({
    name: row.name,
    kind: "NUMERIC" as const,
    minimum: row.minimum,
    maximum: row.maximum,
    step: row.step,
    frozen_value: row.value,
    position_percent: row.position_percent,
    bound_state: "WITHIN_DECLARED_RANGE" as const,
    bound_warning: row.bound_warning,
  }));
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
    @Optional() @Inject(RESEARCH_PARAMETER_BINDINGS)
    private readonly bindings: ResearchParameterBindingRegistry = DEFAULT_PARAMETER_BINDING_REGISTRY,
    @Optional() @Inject(ResearchArtifactVerifyService)
    private readonly bytes?: ResearchArtifactVerifyService,
  ) {}

  async detail(
    scope: ResearchScope,
    runId: string,
    query: { fold?: number },
  ): Promise<ResearchFreezeResponse> {
    this.requireEnabled();
    const row = await this.row(scope, runId);
    // A10a: the newest durable byte receipt; a GET never re-reads bytes.
    const bytes = await this.latestBytes(scope, runId);
    const response = this.mapDetail(row, query.fold ?? null, bytes);
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
    this.requireEnabled();
    // A10a: the explicit action re-reads the sealed P05 bytes FIRST and
    // persists its receipt; the snapshot below is then read against it.
    const bytes = await this.verifyBytes(scope, runId);
    const detail = await this.detail(scope, runId, query);
    const hub = detail.freeze.integrity.state;
    const bytesMatch = bytes.state === "MATCH";
    const result = bytesBlockChain(bytes) || hub === "BLOCKED"
      ? "BLOCKED"
      : hub === "PARTIAL" || bytesMatch
        ? "PARTIAL_MATCH"
        : "NOT_PUBLISHED";
    const verificationScope = bytesMatch
      ? hub === "PARTIAL" ? "PORTAL_RETAINED_DIGEST_BINDING_AND_P05_ARTIFACT_BYTES" : "P05_ARTIFACT_BYTES_ONLY"
      : detail.freeze.integrity.verification_scope;
    const response = {
      schema_version: "research.freeze-verification.v1" as const,
      read_authority: "PORTAL_PERSISTED_RESEARCH" as const,
      run_id: detail.run_id,
      freeze_revision: detail.revision,
      verified_at_utc_ms: bytes.verified_at_utc_ms ?? detail.as_of_utc_ms,
      result,
      verification_scope: verificationScope,
      integrity: detail.freeze.integrity,
      artifact_bytes: bytes,
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

  private async latestBytes(scope: ResearchScope, runId: string): Promise<ArtifactByteVerification> {
    if (!this.bytes) return notYet("NOT_ENABLED", BYTE_VERIFY_NOT_ENABLED);
    try {
      return await this.bytes.latest(scope, runId);
    } catch (error) {
      if (error instanceof ArtifactVerifyStoreError && error.code === "FORBIDDEN") {
        throw new ResearchFreezeError("RESEARCH_FREEZE_FORBIDDEN", "Access denied.", 403);
      }
      throw error;
    }
  }

  private async verifyBytes(scope: ResearchScope, runId: string): Promise<ArtifactByteVerification> {
    if (!this.bytes) return notYet("NOT_ENABLED", BYTE_VERIFY_NOT_ENABLED);
    // The run must exist in this workspace before any private read happens.
    await this.row(scope, runId);
    try {
      return await this.bytes.verify(scope, runId);
    } catch (error) {
      if (error instanceof ArtifactVerifyStoreError && error.code === "FORBIDDEN") {
        throw new ResearchFreezeError("RESEARCH_FREEZE_FORBIDDEN", "Access denied.", 403);
      }
      throw new ResearchFreezeError("RESEARCH_FREEZE_UNAVAILABLE", "Artifact verification is temporarily unavailable.", 503);
    }
  }

  private mapDetail(row: SplitHubRow, requestedFold: number | null, bytes: ArtifactByteVerification): unknown {
    if (row.kind === "DURABLE" && (row.executionProfileId ?? P04_FIXED_QUALIFICATION_PROFILE_ID) !== P04_FIXED_QUALIFICATION_PROFILE_ID && row.executionProfileId !== IMPORTED_ALPHA_PROFILE_ID && row.executionProfileId !== VN_OBSERVED_FIXED_PROFILE_ID) {
      // W1: a Delta WFO run shares the P04 executor digest but has no P04
      // fixed-parameter bundle to verify; its freeze truth is the retained
      // RS-02 current-source lane. Answer the existing typed absence.
      return this.absentDetail(row, availability("NOT_APPLICABLE", WFO_PROFILE_NOT_P04_FREEZE), requestedFold, bytes);
    }
    const fallback = rowAvailability(row);
    const projection = row.projection ? parseProjection(row.projection) : null;
    if (row.projection && !projection) {
      throw new ResearchFreezeError("RESEARCH_FREEZE_UNAVAILABLE", "Stored Freeze source is incompatible.", 503);
    }
    if (!projection || row.kind !== "DURABLE") return this.absentDetail(row, fallback, requestedFold, bytes);

    const source = projection.source;
    // A10b: the run's own historical binding, by its exact adapter digest.
    const imported = importedAlphaReadBinding(row);
    if (row.executionProfileId === IMPORTED_ALPHA_PROFILE_ID && source.source.execution_adapter_id !== "p17.imported-signal-notional.v1") {
      throw new ResearchFreezeError("RESEARCH_FREEZE_UNAVAILABLE", "Stored Freeze adapter does not match the imported run.", 503);
    }
    const binding = row.executionProfileId === IMPORTED_ALPHA_PROFILE_ID
      ? imported?.numeric ?? null : this.bindings.byAdapterDigest(row.adapterContractDigest);
    const checks = this.checks(row, source, binding);
    if (row.executionProfileId === IMPORTED_ALPHA_PROFILE_ID) {
      const expected = imported?.public.source_digest ?? null;
      const observed = source.source.imported_source_digest ?? null;
      checks.push({ key: "IMPORTED_SOURCE_CODE", expected_digest: expected, observed_digest: observed,
        state: expected === null || observed === null ? "NOT_PUBLISHED" : expected === observed ? "MATCH" : "MISMATCH",
        availability: expected === null || observed === null
          ? availability("NOT_PUBLISHED", "E17_IMPORTED_SOURCE_BYTE_IDENTITY_NOT_PUBLISHED") : availability("AVAILABLE", null) });
    }
    const bindingIntegrity = this.integrity(checks, source);
    // A10a: a durable receipt that found corrupt or missing sealed bytes
    // BLOCKS the chain — it never warns, and never rebaselines the binding.
    const integrity = bytesBlockChain(bytes) && bindingIntegrity.state !== "NOT_PUBLISHED"
      ? { ...bindingIntegrity, state: "BLOCKED" as const }
      : bindingIntegrity;
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
    const profileReason = (reason: string) => imported ? reason.replace(/^P04_/, "E17_IMPORTED_")
      : row.executionProfileId === VN_OBSERVED_FIXED_PROFILE_ID ? reason.replace(/^P04_/, "VN_OBSERVED_") : reason;
    const noSelection = gap("NOT_APPLICABLE", profileReason(NO_SELECTION_ARTIFACT));
    const noOrdering = gap("NOT_ASSERTED", profileReason(NO_STRICT_ORDERING));
    const noGrid = gap("NOT_APPLICABLE", profileReason(NO_DIAGNOSTIC_GRID));
    const noDiagnosticAdmission = gap("NOT_APPLICABLE", profileReason(NO_DIAGNOSTIC_ADMISSION));
    const noSibling = gap("NOT_APPLICABLE", profileReason(NO_SIBLING_DRAFT));
    const revision = `p16r1_${sha256ResearchJson({
      p14_revision: row.revision,
      p14_source_split_digest: row.sourceSplitDigest,
      p04_adapter_contract_digest: row.adapterContractDigest,
      source_manifest_digest: source.source.manifest_digest,
      source_parameter_bundle_digest: source.protocol.selection.parameter_bundle_digest,
      checks,
      artifact_bytes: { receipt_id: bytes.receipt_id, state: bytes.state },
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
      engine_pin: {
        state: "AVAILABLE",
        engine_version: source.source.engine_version,
        execution_adapter_id: source.source.execution_adapter_id,
        adapter_contract_digest: row.adapterContractDigest,
        availability: sourceAvailable,
      },
      freeze: {
        source_profile: {
          state: "FIXED_PROFILE_NO_SELECTION_ARTIFACT",
          reason_code: profileReason(NO_SELECTION_ARTIFACT),
          availability: sourceAvailable,
        },
        inspection: {
          requested_fold: requestedFold,
          state: "NOT_APPLICABLE",
          availability: availability("NOT_APPLICABLE", profileReason("P04_FIXED_PROFILE_DOES_NOT_PUBLISH_FOLD_SELECTIONS")),
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
        frozen_parameters: bindingMatches && binding ? historicalParameters(binding) : [],
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
      artifact_bytes: bytes,
      ...(imported ? { imported_alpha: imported.public } : {}),
      stage4_binding: imported ? fixedStage4Binding({
        lane: "IMPORTED_FIXED_QUALIFICATION", expectedBundleDigest: imported.public.parameter_bundle_digest,
        observedBundleDigest: source.protocol.selection.parameter_bundle_digest,
        expectedAdapterDigest: sha256ResearchJson({ source_digest: imported.public.source_digest, adapter_contract_digest: row.adapterContractDigest }),
        observedAdapterDigest: source.source.imported_source_digest
          ? sha256ResearchJson({ source_digest: source.source.imported_source_digest, adapter_contract_digest: row.adapterContractDigest }) : null,
        missingReason: "E17_IMPORTED_SOURCE_BYTE_IDENTITY_NOT_PUBLISHED",
      }) : this.stage4(checks, HISTORICAL_BINDING_NOT_REGISTERED),
      parameter_authority: imported ? {
        schema_version: "research.parameter-authority.v1", state: "NOT_PUBLISHED",
        reason_code: "E17_CODE_FIXED_VALUES_NOT_DECLARED", declared: { hash_scope: "PARAMS_DIGEST", names: imported.public.parameters.map((parameter) => parameter.name) },
        code_fixed: { state: "NOT_PUBLISHED", reason_code: "E17_CODE_FIXED_VALUES_NOT_DECLARED", values: [],
          hash_scope: "SOURCE_CODE_SHA256", code_digest: imported.public.source_digest,
          specification_digest: null, adapter_contract_digest: row.adapterContractDigest },
      } : parameterAuthority({
        names: Object.keys(binding?.parameterSpace ?? {}),
        codeFixed: binding?.codeFixed,
        adapterContractDigest: binding?.adapterContractDigest ?? null,
      }),
    };
  }

  /** CG-P16-02 on the P04 lane: the two pairs its checks already compare, as the F4 rows. */
  private stage4(checks: ReturnType<ResearchFreezeService["checks"]>, missingReason: string) {
    const find = (key: string) => checks.find((check) => check.key === key);
    const bundle = find("P04_FIXED_PARAMETER_BUNDLE");
    const adapter = find("P04_ADAPTER_CONTRACT");
    return fixedStage4Binding({
      expectedBundleDigest: bundle?.expected_digest ?? null,
      observedBundleDigest: bundle?.observed_digest ?? null,
      expectedAdapterDigest: adapter?.expected_digest ?? null,
      observedAdapterDigest: adapter?.observed_digest ?? null,
      missingReason,
    });
  }

  private checks(
    row: SplitHubRow,
    source: ResearchSplitSource,
    binding: HistoricalParameterBinding | null,
  ) {
    const check = (
      key: "P04_ADAPTER_CONTRACT" | "P10_MANIFEST_BINDING" | "P04_FIXED_PARAMETER_BUNDLE" | "IMPORTED_SOURCE_CODE" | "EXECUTION_ADAPTER_CONTRACT" | "DECLARED_PARAMETER_BUNDLE",
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
          ? availability("NOT_PUBLISHED", binding === null && key !== "P10_MANIFEST_BINDING"
            ? HISTORICAL_BINDING_NOT_REGISTERED
            : `P16_${key}_NOT_PUBLISHED`)
          : availability("AVAILABLE", null),
      };
    };
    return [
      // Expected = the registered historical binding for this exact digest.
      // A release that installs a newer binding does not change this answer.
      check(row.executionProfileId === IMPORTED_ALPHA_PROFILE_ID ? "EXECUTION_ADAPTER_CONTRACT" : "P04_ADAPTER_CONTRACT", binding?.adapterContractDigest ?? this.bindings.newestAdapterDigest(), row.adapterContractDigest),
      check("P10_MANIFEST_BINDING", row.manifestDigest, source.source.manifest_digest),
      check(row.executionProfileId === IMPORTED_ALPHA_PROFILE_ID ? "DECLARED_PARAMETER_BUNDLE" : "P04_FIXED_PARAMETER_BUNDLE", binding?.fixedBundleDigest ?? null, source.protocol.selection.parameter_bundle_digest),
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

  private absentDetail(
    row: SplitHubRow,
    fallback: Availability,
    requestedFold: number | null,
    bytes: ArtifactByteVerification,
  ): unknown {
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
      engine_pin: {
        state: "NOT_PUBLISHED",
        engine_version: null,
        execution_adapter_id: null,
        adapter_contract_digest: row.adapterContractDigest,
        availability: fallback,
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
      artifact_bytes: bytes,
      stage4_binding: this.stage4([], unavailable.reason_code),
      parameter_authority: parameterAuthority({
        names: [],
        codeFixed: this.bindings.byAdapterDigest(row.adapterContractDigest)?.codeFixed,
        adapterContractDigest: row.adapterContractDigest,
      }),
    };
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_FREEZE !== "true") {
      throw new ResearchFreezeError("RESEARCH_FREEZE_UNAVAILABLE", "Research Freeze is not enabled in this environment.", 503);
    }
  }
}
