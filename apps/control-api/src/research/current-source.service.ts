/** RS-02 retained-current-source named BFF projection service. */

import { Buffer } from "node:buffer";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { z } from "zod";

import { ControlApiConfig, querySigningKeys } from "../config";
import { KeysetCursorCodec, QueryContractError, queryFingerprint } from "../query";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import {
  ResearchCurrentSourceEvidenceResponseSchema,
  ResearchCurrentSourceEvidenceSeriesResponseSchema,
  ResearchCurrentSourceFreezeResponseSchema,
  ResearchCurrentSourceReplayResponseSchema,
  ResearchCurrentSourceSearchResponseSchema,
  ResearchCurrentSourceSplitResponseSchema,
  ResearchCurrentSourceNotApplicableResponseSchema,
  type ResearchCurrentSourceNotApplicableResponse,
  type ResearchCurrentSourceOperation,
  type ResearchCurrentSourceEvidenceResponse,
  type ResearchCurrentSourceEvidenceSeriesResponse,
  type ResearchCurrentSourcePageQuery,
  type ResearchCurrentSourceReplayResponse,
  type ResearchCurrentSourceSearchQuery,
  type ResearchCurrentSourceSearchResponse,
  type ResearchCurrentSourceSplitResponse,
  type ResearchCurrentSourceFreezeResponse,
} from "./current-source.contract";
import { ResearchCurrentSourceError } from "./current-source.error";
import {
  claimStrip,
  foldAnatomy,
  foldScore,
  foldVerdicts,
  searchContract,
  searchDiagnostics,
  selectionRoles,
  splitGuards,
  trialCoversFold,
  trialFacts,
} from "./current-source-facts";
import {
  ResearchCurrentSourceRepository,
  type CurrentSourcePage,
  type CurrentSourceSealRow,
  type CurrentSourceStoredRow,
  type CurrentSourceTableKind,
} from "./current-source.repository";
import {
  CurrentSourceCandidatePayloadSchema as CandidatePayloadSchema,
  CurrentSourceFoldPayloadSchema as FoldPayloadSchema,
  CurrentSourceObservationPayloadSchema as ObservationPayloadSchema,
  CurrentSourceSummarySchema as SummarySchema,
  CurrentSourceTrialPayloadSchema as TrialPayloadSchema,
} from "./current-source.payload";
import { P04_FIXED_QUALIFICATION_PROFILE_ID, RS02_DELTA_WFO_GLOBAL_PROFILE_ID } from "./delta-wfo.profile";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST } from "./p04-delta.binding";
import { sha256ResearchJson } from "./preflight.service";
import { notYet, type ArtifactByteVerification } from "./artifact-verify.contract";
import { ArtifactVerifyStoreError } from "./artifact-verify.repository";
import { BYTE_VERIFY_NOT_ENABLED, ResearchArtifactVerifyService } from "./artifact-verify.service";

/** RF-05 CG-P13-09: the P04 fixed qualification can never be sealed into the RS-02 lane. */
const P04_FIXED_PROFILE_NOT_RETAINABLE_REASON = "RS02_RETAINED_LANE_NOT_APPLICABLE_TO_P04_FIXED_QUALIFICATION";

const RESPONSE_MAX_BYTES = 1_048_576;
/**
 * W3 · CG-P13-05 (A02): the observation series serve every retained row up
 * to this bound (spec 04 pitfall 7: "server downsample ≤ 2000"), and past it
 * an extrema-preserving bucket sample with a whole-relation envelope.
 */
const OBSERVATION_SERIES_LIMIT = 2_000;
/** The RS-02 admitted bound on trial rows (`current-source.contract.ts` ledger). */
const MAXIMUM_TRIAL_ROWS = 64;

type Availability = {
  state: "AVAILABLE" | "PENDING_RETENTION" | "NOT_RETAINED_LEGACY" | "NOT_PUBLISHED" | "NOT_APPLICABLE";
  reason_code: string | null;
};

function isSeal(value: CurrentSourceSealRow | ResearchCurrentSourceNotApplicableResponse): value is CurrentSourceSealRow {
  return "artifactRevision" in value;
}

function available(): Availability { return { state: "AVAILABLE", reason_code: null }; }
function fact(state: "AVAILABLE" | "NOT_PUBLISHED" | "NOT_APPLICABLE", reasonCode: string | null) {
  const outer = state === "AVAILABLE" ? available() : { state, reason_code: reasonCode } as Availability;
  return { state, reason_code: reasonCode, availability: outer };
}

function sourceGap(reasonCode: string) { return fact("NOT_PUBLISHED", reasonCode); }

function revision(kind: string, seal: CurrentSourceSealRow): string {
  return `rs02_${kind}_${sha256ResearchJson({
    artifact_revision: seal.artifactRevision,
    manifest_digest: seal.manifestDigest,
    source_transform_digest: seal.sourceTransformDigest,
    retained_import_digest: seal.retainedImportDigest,
    table_rows: seal.tableRows,
    summary: seal.summary,
  })}`;
}

function parseSummary(seal: CurrentSourceSealRow) {
  const parsed = SummarySchema.safeParse(seal.summary);
  if (!parsed.success) {
    throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained current-source summary is incompatible.", 503);
  }
  return parsed.data;
}

function asObservation(row: CurrentSourceStoredRow) {
  const parsed = ObservationPayloadSchema.safeParse(row.payload);
  if (!parsed.success || row.sourceId !== parsed.data.source_index_utc || row.occurredAtUtcMs !== parsed.data.at_utc_ms) {
    throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained observation row is incompatible.", 503);
  }
  return parsed.data;
}

function asFold(row: CurrentSourceStoredRow) {
  const parsed = FoldPayloadSchema.safeParse(row.payload);
  if (!parsed.success || row.sourceId !== parsed.data.fold_id) {
    throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained fold row is incompatible.", 503);
  }
  return parsed.data;
}

function asTrial(row: CurrentSourceStoredRow) {
  const parsed = TrialPayloadSchema.safeParse(row.payload);
  if (!parsed.success || row.sourceId !== parsed.data.trial_id) {
    throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained trial row is incompatible.", 503);
  }
  return parsed.data;
}

function asCandidate(row: CurrentSourceStoredRow) {
  const parsed = CandidatePayloadSchema.safeParse(row.payload);
  if (!parsed.success || row.sourceId !== parsed.data.candidate_id) {
    throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained candidate row is incompatible.", 503);
  }
  return parsed.data;
}

const TYPED_TRIAL_STATES = ["COMPLETE", "PRUNED", "FAIL", "RUNNING", "WAITING"] as const;

/** W3 · CG-P15-03: a retained trial state outside Optuna's own set is an incompatible row. */
function typedTrialState(state: string): (typeof TYPED_TRIAL_STATES)[number] {
  if ((TYPED_TRIAL_STATES as readonly string[]).includes(state)) return state as (typeof TYPED_TRIAL_STATES)[number];
  throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained trial state is not a typed trial state.", 503);
}

function compareDecimal(left: string, right: string): number {
  // Exact enough for ordering retained decimal text: both parse to the
  // nearest double; ties fall back to the text so the choice is stable.
  const difference = Number(left) - Number(right);
  return difference !== 0 ? difference : left.localeCompare(right);
}

/**
 * CG-P13-05 envelope of the emitted observation rows. When the rows are the
 * whole relation (FULL) or an extrema-preserving sample, the extrema here are
 * the relation's own: the sampler keeps every bucket's minimum/maximum
 * equity and minimum drawdown, and the first and last row.
 */
function observationEnvelope(
  rows: Array<{ at_utc_ms: number; equity: string; drawdown_fraction: string }>,
  extremaEmitted: boolean,
) {
  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last) return null;
  let minEquity = first;
  let maxEquity = first;
  let minDrawdown = first;
  for (const row of rows) {
    if (compareDecimal(row.equity, minEquity.equity) < 0) minEquity = row;
    if (compareDecimal(row.equity, maxEquity.equity) > 0) maxEquity = row;
    if (compareDecimal(row.drawdown_fraction, minDrawdown.drawdown_fraction) < 0) minDrawdown = row;
  }
  return {
    first_at_utc_ms: first.at_utc_ms,
    last_at_utc_ms: last.at_utc_ms,
    first_equity: first.equity,
    last_equity: last.equity,
    min_equity: minEquity.equity,
    min_equity_at_utc_ms: minEquity.at_utc_ms,
    max_equity: maxEquity.equity,
    max_equity_at_utc_ms: maxEquity.at_utc_ms,
    min_drawdown_fraction: minDrawdown.drawdown_fraction,
    min_drawdown_at_utc_ms: minDrawdown.at_utc_ms,
    extrema_emitted: extremaEmitted,
  };
}

@Injectable()
export class ResearchCurrentSourceService {
  private readonly cursors: KeysetCursorCodec;

  constructor(
    private readonly repository: ResearchCurrentSourceRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Optional() @Inject(ResearchArtifactVerifyService)
    private readonly bytes?: ResearchArtifactVerifyService,
  ) {
    this.cursors = new KeysetCursorCodec({
      activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
      keys: querySigningKeys(config),
      ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS,
    });
  }

  async evidence(scope: ResearchScope, runId: string, signal?: AbortSignal): Promise<ResearchCurrentSourceEvidenceResponse | ResearchCurrentSourceNotApplicableResponse> {
    const seal = await this.requireSeal(scope, runId, "evidence", signal);
    if (!isSeal(seal)) return seal;
    const summary = parseSummary(seal);
    const facts = summary.source_facts;
    const foldRows = await this.boundedRows(scope, runId, seal, "FOLD", 256, signal);
    const candidateRows = await this.boundedRows(scope, runId, seal, "CANDIDATE", 64, signal);
    const selectedCandidate = candidateRows.map(asCandidate).find((candidate) =>
      candidate.trial_facts?.source_trial_id === summary.selection.trial_id
      && candidate.objective === summary.selection.objective) ?? null;
    const value = {
      schema_version: "research.current-source-evidence.v1" as const,
      ...this.common("evidence", seal),
      passport: {
        artifact_table_rows: {
          observations: seal.tableRows.OBSERVATION,
          folds: seal.tableRows.FOLD,
          trials: seal.tableRows.TRIAL,
          candidates: seal.tableRows.CANDIDATE,
          selection: seal.tableRows.SELECTION,
        },
        initial_equity: summary.metrics.initial_equity,
        final_equity: summary.metrics.final_equity,
        net_return_fraction: summary.metrics.net_return_fraction,
        max_drawdown_fraction: summary.metrics.max_drawdown_fraction,
        retained_position_count: seal.tableRows.OBSERVATION,
      },
      series: (["EQUITY", "RETURNS", "POSITIONS", "MONTHLY_RETURNS", "ROLLING_RETURNS_20", "RETURN_DISTRIBUTION"] as const).map((kind) => ({
        kind,
        availability: this.seriesAvailability(summary, kind),
        href: `/api/v1/quantbt/runs/${runId}/current-source/evidence/series?kind=${kind}`,
      })),
      source_absences: {
        route_ledger: sourceGap("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_ROUTE_LEDGER"),
        audited_fills: sourceGap("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS"),
        benchmark: sourceGap("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_BENCHMARK_SERIES"),
      },
      claim: claimStrip(facts),
      fold_verdicts: foldVerdicts(
        foldRows.map((row) => {
          const fold = asFold(row);
          return {
            sourceOrdinal: row.sourceOrdinal,
            foldId: fold.fold_id,
            testStartUtcMs: fold.test_start_utc_ms,
            testEndUtcMs: fold.test_end_utc_ms,
            facts: fold.fold_facts,
          };
        }),
        facts,
        {
          meanOosSharpe: selectedCandidate?.trial_facts?.metrics.mean_oos_sharpe ?? null,
          meanDecay: selectedCandidate?.trial_facts?.metrics.mean_decay ?? null,
        },
      ),
    };
    return this.valid(ResearchCurrentSourceEvidenceResponseSchema, value);
  }

  async evidenceSeries(
    scope: ResearchScope,
    runId: string,
    kind: "EQUITY" | "RETURNS" | "POSITIONS" | "MONTHLY_RETURNS" | "ROLLING_RETURNS_20" | "RETURN_DISTRIBUTION",
    signal?: AbortSignal,
  ): Promise<ResearchCurrentSourceEvidenceSeriesResponse | ResearchCurrentSourceNotApplicableResponse> {
    const seal = await this.requireSeal(scope, runId, "evidence_series", signal);
    if (!isSeal(seal)) return seal;
    const summary = parseSummary(seal);
    const source = await this.seriesValues(scope, runId, seal, summary, kind, signal);
    const value = {
      schema_version: "research.current-source-evidence-series.v1" as const,
      ...this.common(`evidence-${kind.toLowerCase()}`, seal),
      kind,
      availability: source.availability,
      source_sample: source.source_sample,
      values: source.values,
    };
    return this.valid(ResearchCurrentSourceEvidenceSeriesResponseSchema, value);
  }

  async split(scope: ResearchScope, runId: string, signal?: AbortSignal): Promise<ResearchCurrentSourceSplitResponse | ResearchCurrentSourceNotApplicableResponse> {
    const seal = await this.requireSeal(scope, runId, "split", signal);
    if (!isSeal(seal)) return seal;
    const summary = parseSummary(seal);
    const page = await this.repository.rows(scope, runId, seal.artifactRevision, "FOLD", { limit: 256 }, signal);
    if (page.totalRows !== seal.tableRows.FOLD || page.hasMore || page.hasPrevious) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained fold plan exceeds its admitted bound.", 503);
    }
    const value = {
      schema_version: "research.current-source-split.v1" as const,
      ...this.common("split", seal),
      fold_plan: {
        state: "AVAILABLE" as const,
        folds: page.rows.map((row) => {
          const { fold_facts: foldFacts, ...fold } = asFold(row);
          return { source_ordinal: row.sourceOrdinal, ...fold, anatomy: foldAnatomy(foldFacts), score: foldScore(foldFacts) };
        }),
        chronology: "SOURCE_OBSERVED_ADVANCED_WFO" as const,
        availability: available(),
      },
      data_use: {
        warmup: this.summaryFact(summary.data_use.warmup),
        purge: this.summaryFact(summary.data_use.purge),
        embargo: this.summaryFact(summary.data_use.embargo),
        strict_outer_oos_selection: this.summaryFact(summary.data_use.strict_outer_oos_selection),
      },
      guards: splitGuards(summary.source_facts),
    };
    return this.valid(ResearchCurrentSourceSplitResponseSchema, value);
  }

  async search(
    scope: ResearchScope,
    runId: string,
    query: ResearchCurrentSourcePageQuery | ResearchCurrentSourceSearchQuery,
    signal?: AbortSignal,
  ): Promise<ResearchCurrentSourceSearchResponse | ResearchCurrentSourceNotApplicableResponse> {
    const seal = await this.requireSeal(scope, runId, "search", signal);
    if (!isSeal(seal)) return seal;
    const summary = parseSummary(seal);
    const facts = summary.source_facts;
    const ledgerMode = facts?.search.trial_ledger_mode ?? null;
    const currentRevision = revision("search", seal);
    const fold = "fold" in query ? query.fold ?? null : null;
    // A fold filter binds its own cursors: a page minted for fold 1 is
    // refused for fold 2 (the operation string is part of the fingerprint).
    const operation = fold === null ? "research.current-source.search.v1" : `research.current-source.search.v1:fold=${fold}`;
    let page: CurrentSourcePage;
    let matchedRows: number;
    if (fold === null) {
      page = await this.readPage(scope, runId, seal, "TRIAL", query, currentRevision, operation, signal);
      matchedRows = seal.tableRows.TRIAL;
    } else {
      const folds = await this.boundedRows(scope, runId, seal, "FOLD", 256, signal);
      if (!folds.some((row) => row.sourceId === fold)) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "The fold filter names no retained fold of this run.", 400);
      }
      const all = await this.boundedRows(scope, runId, seal, "TRIAL", MAXIMUM_TRIAL_ROWS, signal);
      const matched = all.filter((row) => trialCoversFold(asTrial(row).trial_facts, fold));
      matchedRows = matched.length;
      page = this.pageInMemory(scope.workspaceId, runId, currentRevision, operation, matched, query);
    }
    const candidates = await this.repository.rows(scope, runId, seal.artifactRevision, "CANDIDATE", { limit: 64 }, signal);
    if (candidates.totalRows !== seal.tableRows.CANDIDATE || candidates.hasMore || candidates.hasPrevious) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained candidate ledger exceeds its admitted bound.", 503);
    }
    const value = {
      schema_version: "research.current-source-search.v1" as const,
      ...this.common("search", seal),
      selection: {
        state: "AVAILABLE" as const,
        selected_trial_id: summary.selection.trial_id,
        objective: summary.selection.objective,
        parameters: summary.selection.parameters,
        availability: available(),
        objective_kind: facts ? "MODE_1_DECAY_J" as const : "NOT_PUBLISHED" as const,
        roles: selectionRoles(facts, summary.selection),
      },
      search_contract: searchContract(facts),
      ledger: {
        source_trial_count: seal.tableRows.TRIAL,
        returned_rows: page.rows.length,
        trials: page.rows.map((row) => {
          const { trial_facts: rowFacts, ...trial } = asTrial(row);
          return {
            source_ordinal: row.sourceOrdinal,
            trial_id: trial.trial_id,
            state: typedTrialState(trial.state),
            objective: trial.objective,
            parameters: trial.parameters,
            facts: trialFacts(rowFacts, ledgerMode),
            playback_cursor: this.playbackCursor(scope.workspaceId, runId, currentRevision, "TRIAL", row.sourceOrdinal),
          };
        }),
        page: this.page(scope.workspaceId, runId, currentRevision, "TRIAL", query.limit, page, operation),
        availability: available(),
        fold_filter: { fold_id: fold, rule: "TRIAL_FOLD_SCOPE_COVERS_FOLD" as const, matched_rows: matchedRows },
      },
      candidates: {
        source_candidate_count: seal.tableRows.CANDIDATE,
        rows: candidates.rows.map((row) => {
          const { trial_facts: rowFacts, ...candidate } = asCandidate(row);
          return { source_ordinal: row.sourceOrdinal, ...candidate, facts: trialFacts(rowFacts, ledgerMode) };
        }),
        availability: available(),
      },
      diagnostics: searchDiagnostics(facts),
    };
    return this.valid(ResearchCurrentSourceSearchResponseSchema, value);
  }

  async freeze(scope: ResearchScope, runId: string, signal?: AbortSignal): Promise<ResearchCurrentSourceFreezeResponse | ResearchCurrentSourceNotApplicableResponse> {
    const seal = await this.requireSeal(scope, runId, "freeze", signal);
    if (!isSeal(seal)) return seal;
    const summary = parseSummary(seal);
    const observedImportDigest = await this.repository.verifyRetainedImport(scope, seal, signal);
    const integrityState = observedImportDigest === seal.retainedImportDigest ? "MATCH" as const : "MISMATCH" as const;
    // A10a: the newest durable byte receipt (a GET never re-reads bytes).
    const byteVerification = await this.latestBytes(scope, runId);
    const common = this.common("freeze", seal);
    // The ETag must move when a new receipt lands, or a 304 would hide it.
    const freezeRevision = `rs02_freeze_${sha256ResearchJson({
      base: common.revision,
      byte_receipt: byteVerification.receipt_id,
      byte_state: byteVerification.state,
    })}`;
    const value = {
      schema_version: "research.current-source-freeze.v1" as const,
      ...common,
      revision: freezeRevision,
      etag: `"${freezeRevision}"`,
      integrity: {
        state: integrityState,
        expected_manifest_digest: seal.manifestDigest,
        observed_manifest_digest: seal.manifestDigest,
        expected_retained_import_digest: seal.retainedImportDigest,
        observed_retained_import_digest: observedImportDigest,
        retained_row_count: seal.totalRows,
        verification_scope: "PORTAL_RETAINED_MANIFEST_ROW_COUNTS_AND_BATCH_RECEIPT" as const,
        availability: available(),
      },
      source_artifact_bytes: sourceGap("P05_SOURCE_BYTES_WERE_VERIFIED_AT_IMPORT_BUT_A_GET_NEVER_REOPENS_PRIVATE_ARTIFACT_BYTES"),
      byte_verification: byteVerification,
      frozen_selection: {
        selected_trial_id: summary.selection.trial_id,
        objective: summary.selection.objective,
        parameters: summary.selection.parameters,
        availability: available(),
      },
      what_if: {
        state: "NOT_PUBLISHED" as const,
        reason_code: "RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET" as const,
        availability: { state: "NOT_PUBLISHED" as const, reason_code: "RS02_DOES_NOT_ENQUEUE_EVALUATION_FROM_A_GET" },
      },
    };
    return this.valid(ResearchCurrentSourceFreezeResponseSchema, value);
  }

  async replay(
    scope: ResearchScope,
    runId: string,
    query: ResearchCurrentSourcePageQuery,
    signal?: AbortSignal,
  ): Promise<ResearchCurrentSourceReplayResponse | ResearchCurrentSourceNotApplicableResponse> {
    const seal = await this.requireSeal(scope, runId, "replay", signal);
    if (!isSeal(seal)) return seal;
    const currentRevision = revision("replay", seal);
    const page = await this.readPage(scope, runId, seal, "OBSERVATION", query, currentRevision, "research.current-source.replay.v1", signal);
    const selectedOrdinal = this.selectedOrdinal(scope.workspaceId, runId, currentRevision, "OBSERVATION", query);
    const selected = selectedOrdinal === null ? null : page.rows.find((row) => row.sourceOrdinal === selectedOrdinal) ?? null;
    const selectedObservation = selected ? asObservation(selected) : null;
    const value = {
      schema_version: "research.current-source-replay.v1" as const,
      ...this.common("replay", seal),
      replay: {
        source_observation_count: seal.tableRows.OBSERVATION,
        rows: page.rows.map((row) => {
          const observation = asObservation(row);
          return {
            source_ordinal: row.sourceOrdinal,
            ...observation,
            playback_cursor: this.playbackCursor(scope.workspaceId, runId, currentRevision, "OBSERVATION", row.sourceOrdinal),
          };
        }),
        page: this.page(scope.workspaceId, runId, currentRevision, "OBSERVATION", query.limit, page, "research.current-source.replay.v1"),
        state_at_cursor: selected && selectedObservation ? {
          state: "AVAILABLE_RETAINED_MODEL_SAMPLE" as const,
          source_ordinal: selected.sourceOrdinal,
          at_utc_ms: selectedObservation.at_utc_ms,
          accepted_position: selectedObservation.accepted_position,
          equity: selectedObservation.equity,
          semantics: "RESEARCH_MODEL_SAMPLE_NOT_BROKER_EXECUTION_STATE" as const,
          availability: available(),
        } : {
          state: "NOT_SELECTED" as const,
          source_ordinal: null,
          at_utc_ms: null,
          accepted_position: null,
          equity: null,
          semantics: "NO_SELECTED_PLAYHEAD" as const,
          availability: available(),
        },
      },
      route_capabilities: {
        model_positions: fact("AVAILABLE", null),
        returns: fact("AVAILABLE", null),
        orders: sourceGap("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_EXECUTION_ORDER_LEDGER"),
        fills: sourceGap("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS"),
        candles: sourceGap("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_REPLAY_CANDLES"),
      },
    };
    return this.valid(ResearchCurrentSourceReplayResponseSchema, value);
  }

  private async requireSeal(
    scope: ResearchScope,
    runId: string,
    operation: ResearchCurrentSourceOperation,
    signal?: AbortSignal,
  ): Promise<CurrentSourceSealRow | ResearchCurrentSourceNotApplicableResponse> {
    this.requireEnabled();
    const seal = await this.repository.sealForRead(scope, runId, signal);
    if (seal) return seal;
    const state = await this.repository.runState(scope, runId, signal);
    if (!state) throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_NOT_FOUND", "Research run was not found.", 404);
    const refuse = (laneState: NonNullable<ResearchCurrentSourceError["details"]>["lane_state"], message: string): never => {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", message, 409, {
        lane_state: laneState,
        effective_status: state.effectiveStatus,
      });
    };
    if (state.sourceKind === "LEGACY_1_0_8_METADATA") {
      return refuse("NOT_RETAINED_LEGACY", "This historical run is NOT_RETAINED_LEGACY; it has no current-source bytes.");
    }
    const notApplicable = this.notApplicable(
      runId, operation, state.adapterContractDigest ?? null, state.executionProfileId ?? null,
    );
    if (notApplicable) return notApplicable;
    if (state.effectiveStatus === "COMPLETED") {
      return refuse("PENDING_RETENTION", "Current QuantBT output is PENDING_RETENTION; a sealed retained artifact is required.");
    }
    if (state.effectiveStatus === "CANCELLED" || state.effectiveStatus === "FAILED") {
      return refuse("NOT_RETAINED_TERMINAL", "This run ended without a retained current-source artifact.");
    }
    return refuse("PENDING_SOURCE", "Current QuantBT output is not yet retained.");
  }

  /**
   * RF-05 CG-P13-09. A run admitted under the P04 fixed qualification can
   * never be sealed into the RS-02 Advanced-WFO lane, whatever its status;
   * answer that as a typed 200 instead of a retryable-looking 409. The test
   * is the run's immutable P10 execution profile AND adapter-contract
   * digest, not a name or mode: the W1 Delta WFO profile shares the P04
   * executor digest, and such a run is pending a seal, never not-applicable.
   */
  private notApplicable(
    runId: string,
    operation: ResearchCurrentSourceOperation,
    adapterContractDigest: string | null,
    executionProfileId: string | null,
  ): ResearchCurrentSourceNotApplicableResponse | null {
    if (executionProfileId !== P04_FIXED_QUALIFICATION_PROFILE_ID) return null;
    if (adapterContractDigest !== P04_DELTA_ADAPTER_CONTRACT_DIGEST) return null;
    const revisionValue = `rs02_not-applicable_${sha256ResearchJson({
      schema_version: "research.current-source-not-applicable.v1",
      run_id: runId,
      operation,
      run_adapter_contract_digest: adapterContractDigest,
      reason_code: P04_FIXED_PROFILE_NOT_RETAINABLE_REASON,
    })}`;
    return this.valid(ResearchCurrentSourceNotApplicableResponseSchema, {
      schema_version: "research.current-source-not-applicable.v1",
      read_authority: "PORTAL_RETAINED_CURRENT_SOURCE",
      run_id: runId,
      revision: revisionValue,
      etag: `"${revisionValue}"`,
      availability: { state: "NOT_APPLICABLE", reason_code: P04_FIXED_PROFILE_NOT_RETAINABLE_REASON },
      lane: {
        state: "NOT_APPLICABLE",
        operation,
        run_profile: "P04_FIXED_QUALIFICATION",
        run_adapter_contract_digest: adapterContractDigest,
        // Byte-stable: P04 N/A keeps naming the original Advanced-WFO lane.
        retainable_profile_id: RS02_DELTA_WFO_GLOBAL_PROFILE_ID,
        reason_code: P04_FIXED_PROFILE_NOT_RETAINABLE_REASON,
      },
    });
  }

  private async latestBytes(scope: ResearchScope, runId: string): Promise<ArtifactByteVerification> {
    if (!this.bytes) return notYet("NOT_ENABLED", BYTE_VERIFY_NOT_ENABLED);
    try {
      return await this.bytes.latest(scope, runId);
    } catch (error) {
      if (error instanceof ArtifactVerifyStoreError && error.code === "FORBIDDEN") {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_FORBIDDEN", "Access denied.", 403);
      }
      throw error;
    }
  }

  private common(kind: string, seal: CurrentSourceSealRow) {
    const value = revision(kind, seal);
    return {
      read_authority: "PORTAL_RETAINED_CURRENT_SOURCE" as const,
      run_id: seal.runId,
      revision: value,
      etag: `"${value}"`,
      availability: available(),
      as_of_utc_ms: seal.retainedAtUtcMs,
      provenance: {
        source_adapter_id: seal.sourceAdapterId,
        profile_id: seal.profileId,
        engine_version: "1.1.1" as const,
        source_manifest_digest: seal.manifestDigest,
        source_transform_digest: seal.sourceTransformDigest,
        retained_import_digest: seal.retainedImportDigest,
        requested_spec_digest: seal.requestedSpecDigest,
        effective_spec_digest: seal.effectiveSpecDigest,
        dataset_binding_digest: seal.datasetBindingDigest,
        retained_at_utc_ms: seal.retainedAtUtcMs,
      },
    };
  }

  private summaryFact(value: { state: "AVAILABLE" | "NOT_PUBLISHED" | "NOT_APPLICABLE"; reason_code: string | null }) {
    return fact(value.state, value.reason_code);
  }

  private async readPage(
    scope: ResearchScope,
    runId: string,
    seal: CurrentSourceSealRow,
    tableKind: CurrentSourceTableKind,
    query: ResearchCurrentSourcePageQuery,
    currentRevision: string,
    operation: string,
    signal?: AbortSignal,
  ): Promise<CurrentSourcePage> {
    const resourceId = `${operation}:${runId}:${currentRevision}:${tableKind}`;
    const fingerprint = queryFingerprint({ resourceId, limit: query.limit, filters: [], sort: [] });
    let afterOrdinal: number | undefined;
    let beforeOrdinal: number | undefined;
    if (query.cursor) afterOrdinal = this.decodeCursor(scope.workspaceId, resourceId, fingerprint, "after", query.cursor);
    if (query.before) beforeOrdinal = this.decodeCursor(scope.workspaceId, resourceId, fingerprint, "before", query.before);
    const atOrdinal = this.selectedOrdinal(scope.workspaceId, runId, currentRevision, tableKind, query);
    return this.repository.rows(scope, runId, seal.artifactRevision, tableKind, {
      ...(afterOrdinal === undefined ? {} : { afterOrdinal }),
      ...(beforeOrdinal === undefined ? {} : { beforeOrdinal }),
      ...(atOrdinal === null ? {} : { atOrdinal }),
      limit: query.limit,
    }, signal);
  }

  private async seriesValues(
    scope: ResearchScope,
    runId: string,
    seal: CurrentSourceSealRow,
    summary: ReturnType<typeof parseSummary>,
    kind: "EQUITY" | "RETURNS" | "POSITIONS" | "MONTHLY_RETURNS" | "ROLLING_RETURNS_20" | "RETURN_DISTRIBUTION",
    signal?: AbortSignal,
  ): Promise<{ availability: Availability; source_sample: Record<string, unknown>; values: unknown[] }> {
    if (kind === "EQUITY" || kind === "RETURNS" || kind === "POSITIONS") {
      const sample = await this.repository.observationSeries(
        scope, runId, seal.artifactRevision, seal.tableRows.OBSERVATION, OBSERVATION_SERIES_LIMIT, signal,
      );
      const rows = sample.rows;
      return {
        availability: available(),
        source_sample: {
          source_observation_count: seal.tableRows.OBSERVATION,
          emitted_point_count: rows.length,
          sampling: sample.sampling,
          envelope: observationEnvelope(rows.map(asObservation), sample.extremaEmitted),
        },
        values: rows.map((row) => {
          const observation = asObservation(row);
          return {
            at_utc_ms: observation.at_utc_ms,
            equity: observation.equity,
            return_fraction: observation.return_fraction,
            accepted_position: observation.accepted_position,
            drawdown_fraction: observation.drawdown_fraction,
            signal_target: observation.signal_target,
          };
        }),
      };
    }
    if (kind === "MONTHLY_RETURNS") {
      const source = summary.derived.monthly_returns;
      return {
        availability: available(),
        source_sample: {
          source_observation_count: source.source_observation_count,
          emitted_point_count: source.emitted_point_count,
          sampling: source.sampling,
          envelope: null,
        },
        values: source.values,
      };
    }
    if (kind === "ROLLING_RETURNS_20") {
      const source = summary.derived.rolling_returns_20;
      const availability = source.sampling === "NOT_APPLICABLE"
        ? { state: "NOT_APPLICABLE" as const, reason_code: "QUANTBT_ADVANCED_WFO_OBSERVATIONS_BELOW_ROLLING_WINDOW" }
        : available();
      return {
        availability,
        source_sample: {
          source_observation_count: source.source_observation_count,
          emitted_point_count: source.emitted_point_count,
          sampling: source.sampling,
          envelope: null,
        },
        values: source.values,
      };
    }
    const source = summary.derived.return_distribution;
    const availability = source.state === "AVAILABLE" ? available() : {
      state: "NOT_APPLICABLE" as const,
      reason_code: source.reason_code,
    };
    return {
      availability,
      source_sample: {
        source_observation_count: source.source_observation_count,
        emitted_point_count: source.emitted_point_count,
        sampling: source.sampling,
        envelope: null,
      },
      values: source.values,
    };
  }

  /** A whole bounded relation (FOLD ≤ 256, TRIAL/CANDIDATE ≤ 64) that must match its sealed count. */
  private async boundedRows(
    scope: ResearchScope,
    runId: string,
    seal: CurrentSourceSealRow,
    tableKind: "FOLD" | "TRIAL" | "CANDIDATE",
    limit: number,
    signal?: AbortSignal,
  ): Promise<CurrentSourceStoredRow[]> {
    const page = await this.repository.rows(scope, runId, seal.artifactRevision, tableKind, { limit }, signal);
    if (page.totalRows !== seal.tableRows[tableKind] || page.hasMore || page.hasPrevious) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", `Retained ${tableKind.toLowerCase()} relation exceeds its admitted bound.`, 503);
    }
    return page.rows;
  }

  /** Keyset paging over an already-bounded, already-filtered row set (the S06 fold filter). */
  private pageInMemory(
    workspaceId: string,
    runId: string,
    currentRevision: string,
    operation: string,
    rows: CurrentSourceStoredRow[],
    query: ResearchCurrentSourcePageQuery | ResearchCurrentSourceSearchQuery,
  ): CurrentSourcePage {
    const resourceId = `${operation}:${runId}:${currentRevision}:TRIAL`;
    const fingerprint = queryFingerprint({ resourceId, limit: query.limit, filters: [], sort: [] });
    const ordered = [...rows].sort((left, right) => left.sourceOrdinal - right.sourceOrdinal);
    let window: CurrentSourceStoredRow[];
    if (query.cursor) {
      const after = this.decodeCursor(workspaceId, resourceId, fingerprint, "after", query.cursor);
      window = ordered.filter((row) => row.sourceOrdinal > after).slice(0, query.limit);
    } else if (query.before) {
      const before = this.decodeCursor(workspaceId, resourceId, fingerprint, "before", query.before);
      window = ordered.filter((row) => row.sourceOrdinal < before).slice(-query.limit);
    } else {
      const at = this.selectedOrdinal(workspaceId, runId, currentRevision, "TRIAL", query);
      window = ordered.filter((row) => at === null || row.sourceOrdinal >= at).slice(0, query.limit);
    }
    const first = window[0]?.sourceOrdinal;
    const last = window.at(-1)?.sourceOrdinal;
    return {
      rows: window,
      hasMore: last !== undefined && ordered.some((row) => row.sourceOrdinal > last),
      hasPrevious: first !== undefined && ordered.some((row) => row.sourceOrdinal < first),
      totalRows: ordered.length,
    };
  }

  private seriesAvailability(
    summary: ReturnType<typeof parseSummary>,
    kind: "EQUITY" | "RETURNS" | "POSITIONS" | "MONTHLY_RETURNS" | "ROLLING_RETURNS_20" | "RETURN_DISTRIBUTION",
  ): Availability {
    if (kind === "ROLLING_RETURNS_20" && summary.derived.rolling_returns_20.sampling === "NOT_APPLICABLE") {
      return { state: "NOT_APPLICABLE", reason_code: "QUANTBT_ADVANCED_WFO_OBSERVATIONS_BELOW_ROLLING_WINDOW" };
    }
    if (kind === "RETURN_DISTRIBUTION" && summary.derived.return_distribution.state !== "AVAILABLE") {
      return { state: "NOT_APPLICABLE", reason_code: summary.derived.return_distribution.reason_code };
    }
    return available();
  }

  private page(
    workspaceId: string,
    runId: string,
    currentRevision: string,
    tableKind: CurrentSourceTableKind,
    limit: number,
    page: CurrentSourcePage,
    operation: string,
  ) {
    const resourceId = `${operation}:${runId}:${currentRevision}:${tableKind}`;
    const fingerprint = queryFingerprint({ resourceId, limit, filters: [], sort: [] });
    const first = page.rows[0]?.sourceOrdinal;
    const last = page.rows.at(-1)?.sourceOrdinal;
    return {
      limit,
      next_cursor: page.hasMore && last !== undefined
        ? this.encodeCursor(workspaceId, resourceId, fingerprint, "after", last) : null,
      prev_cursor: page.hasPrevious && first !== undefined
        ? this.encodeCursor(workspaceId, resourceId, fingerprint, "before", first) : null,
      has_more: page.hasMore,
      has_previous: page.hasPrevious,
      order: "SOURCE_TABLE_ORDINAL_ASC" as const,
    };
  }

  private playbackCursor(workspaceId: string, runId: string, currentRevision: string, tableKind: CurrentSourceTableKind, ordinal: number): string {
    const resourceId = this.playbackResource(runId, currentRevision, tableKind);
    const fingerprint = queryFingerprint({ resourceId, limit: 1, filters: [], sort: [] });
    return this.encodeCursor(workspaceId, resourceId, fingerprint, "after", ordinal);
  }

  private selectedOrdinal(
    workspaceId: string,
    runId: string,
    currentRevision: string,
    tableKind: CurrentSourceTableKind,
    query: ResearchCurrentSourcePageQuery,
  ): number | null {
    if (!query.at) return null;
    const resourceId = this.playbackResource(runId, currentRevision, tableKind);
    return this.decodeCursor(
      workspaceId,
      resourceId,
      queryFingerprint({ resourceId, limit: 1, filters: [], sort: [] }),
      "after",
      query.at,
    );
  }

  private playbackResource(runId: string, currentRevision: string, tableKind: CurrentSourceTableKind): string {
    return `research.current-source.playback.v1:${runId}:${currentRevision}:${tableKind}`;
  }

  private encodeCursor(workspaceId: string, resourceId: string, fingerprint: string, direction: "after" | "before", ordinal: number): string {
    return this.cursors.encode({ resource_id: resourceId, workspace_id: workspaceId, direction, query_fingerprint: fingerprint, boundary: [ordinal] });
  }

  private decodeCursor(workspaceId: string, resourceId: string, fingerprint: string, direction: "after" | "before", token: string): number {
    try {
      const boundary = this.cursors.decode(token, { resourceId, workspaceId, direction, queryFingerprint: fingerprint, boundarySize: 1 });
      if (typeof boundary[0] !== "number" || !Number.isSafeInteger(boundary[0]) || boundary[0] < 0) throw new Error("invalid boundary");
      return boundary[0];
    } catch (error) {
      if (error instanceof QueryContractError && error.code === "CURSOR_EXPIRED") {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CURSOR_EXPIRED", "Current-source cursor expired; discard it and refetch a fresh opaque playhead.", 409);
      }
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Current-source cursor is invalid for this workspace, run, revision or operation.", 400);
    }
  }

  private valid<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success || Buffer.byteLength(JSON.stringify(value), "utf8") > RESPONSE_MAX_BYTES) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Current-source response is incompatible or exceeds its bounded budget.", 503);
    }
    return parsed.data;
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_CURRENT_SOURCE !== "true") {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained current-source reads are not enabled in this deployment.", 503);
    }
  }
}
