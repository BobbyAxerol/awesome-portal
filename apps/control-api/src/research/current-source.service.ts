/** RS-02 retained-current-source named BFF projection service. */

import { Buffer } from "node:buffer";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { enrichedAvailability } from "./enriched-analysis.contract";
import { z } from "zod";

import { ControlApiConfig, querySigningKeys } from "../config";
import { KeysetCursorCodec, QueryContractError, queryFingerprint } from "../query";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import {
  CURRENT_SOURCE_MAXIMUM_TRIAL_ROWS,
  ResearchCurrentSourceEvidenceResponseSchema,
  ResearchCurrentSourceEvidenceSeriesResponseSchema,
  ResearchCurrentSourceFreezeResponseSchema,
  ResearchCurrentSourceReplayResponseSchema,
  ResearchCurrentSourceReplayTransitionsResponseSchema,
  ResearchCurrentSourceReplayChildAuditResponseSchema,
  ResearchCurrentSourceSearchResponseSchema,
  ResearchCurrentSourceSplitResponseSchema,
  ResearchCurrentSourceNotApplicableResponseSchema,
  ResearchCurrentSourceSplitTerminalAbsenceResponseSchema,
  type ResearchCurrentSourceNotApplicableResponse,
  type ResearchCurrentSourceSplitTerminalAbsenceResponse,
  type ResearchCurrentSourceOperation,
  type ResearchCurrentSourceEvidenceResponse,
  type ResearchCurrentSourceEvidenceSeriesResponse,
  type ResearchCurrentSourcePageQuery,
  type ResearchCurrentSourceReplayResponse,
  type ResearchCurrentSourceReplayTransitionsResponse,
  type ResearchCurrentSourceReplayChildAuditResponse,
  type ResearchCurrentSourceChildAuditQuery,
  type ResearchCurrentSourceTransitionsQuery,
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
import { splitGapScan, splitStitch } from "./current-source-split-integrity";
import { POOL_FREEZE_CLOCK_ABSENT } from "./p11-stage-events";
import { trainTestDisjoint } from "./train-test-disjoint";
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
  type CurrentSourceBar,
  type CurrentSourceCausalSelection,
  type CurrentSourceFacts,
  type CurrentSourceReplaySummary,
} from "./current-source.payload";
import { P04_FIXED_QUALIFICATION_PROFILE_ID, RS02_DELTA_WFO_GLOBAL_PROFILE_ID } from "./delta-wfo.profile";
import { DELTA_CAUSAL_INNER_PROFILE } from "./delta-causal-inner.profile";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST } from "./p04-delta.binding";
import { IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST, IMPORTED_ALPHA_PROFILE_ID } from "./imported-alpha.profile";
import { sha256ResearchJson } from "./preflight.service";
import { ResearchRequestedSpecSchema } from "./preflight.contract";
import { notYet, type ArtifactByteVerification } from "./artifact-verify.contract";
import { inertWhatIf, ResearchWhatIfService, type WhatIfBasis } from "./whatif.service";
import { foldOrdering } from "./fold-ordering";
import { declaredSpace, runGlobalCausalSurface, searchStudySurfaces, searchSurface, type SearchStudySurface, type SurfaceTrial } from "./current-source-surface";
import { candidateDrawdown, searchPool } from "./current-source-pool";
import { parameterAuthority, retainedStage4Binding } from "./stage4-binding";
import { DEFAULT_PARAMETER_BINDING_REGISTRY } from "./parameter-binding.registry";
import type { WhatIf } from "./whatif.contract";
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
/** The read bound on trial rows (`current-source.contract.ts`): 64 sealed by RS-02, 400 by the preview long WFO. */
const MAXIMUM_TRIAL_ROWS = CURRENT_SOURCE_MAXIMUM_TRIAL_ROWS;

type Availability = {
  state: "AVAILABLE" | "PENDING_RETENTION" | "NOT_RETAINED_LEGACY" | "NOT_PUBLISHED" | "NOT_APPLICABLE";
  reason_code: string | null;
};

function isSeal(value: CurrentSourceSealRow | ResearchCurrentSourceNotApplicableResponse | ResearchCurrentSourceSplitTerminalAbsenceResponse): value is CurrentSourceSealRow {
  return "artifactRevision" in value;
}

function available(): Availability { return { state: "AVAILABLE", reason_code: null }; }
function fact(state: "AVAILABLE" | "NOT_PUBLISHED" | "NOT_APPLICABLE", reasonCode: string | null) {
  const outer = state === "AVAILABLE" ? available() : { state, reason_code: reasonCode } as Availability;
  return { state, reason_code: reasonCode, availability: outer };
}

function sourceGap(reasonCode: string) { return fact("NOT_PUBLISHED", reasonCode); }

/**
 * The digest every retained read revision (`rs02_<kind>_<digest>`) carries.
 * Exported so P21 names exactly the revisions Screens 04–08 serve (W7).
 */
export function currentSourceSealDigest(seal: Pick<CurrentSourceSealRow,
  "artifactRevision" | "manifestDigest" | "sourceTransformDigest" | "retainedImportDigest" | "tableRows" | "summary">): string {
  return sha256ResearchJson({
    artifact_revision: seal.artifactRevision,
    manifest_digest: seal.manifestDigest,
    source_transform_digest: seal.sourceTransformDigest,
    retained_import_digest: seal.retainedImportDigest,
    table_rows: seal.tableRows,
    summary: seal.summary,
  });
}

function revision(kind: string, seal: CurrentSourceSealRow): string {
  if (seal.enrichedAnalysis && ["evidence", "evidence-monthly_returns", "evidence-return_distribution"].includes(kind)) {
    return `rs02_${kind}_${sha256ResearchJson({ seal_digest: currentSourceSealDigest(seal),
      enrichment: sha256ResearchJson(seal.enrichedAnalysis) })}`;
  }
  if (seal.distributionsSidecar && ["evidence", "evidence-monthly_returns", "evidence-return_distribution"].includes(kind)) {
    return `rs02_${kind}_${sha256ResearchJson({ seal_digest: currentSourceSealDigest(seal),
      ...(kind === "evidence" && seal.analyticsSidecar ? { analytics_sidecar_digest: seal.analyticsSidecar.digest } : {}),
      distributions_digest: seal.distributionsSidecar.digest })}`;
  }
  if (kind === "evidence" && seal.analyticsSidecar) {
    return `rs02_evidence_${sha256ResearchJson({ seal_digest: currentSourceSealDigest(seal),
      analytics_sidecar_digest: seal.analyticsSidecar.digest })}`;
  }
  return `rs02_${kind}_${currentSourceSealDigest(seal)}`;
}

function isCausalSeal(seal: CurrentSourceSealRow): boolean {
  return seal.profileId === DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id
    && seal.sourceAdapterId === DELTA_CAUSAL_INNER_PROFILE.current_source.source_adapter_id;
}

function parseSummary(seal: CurrentSourceSealRow) {
  const analytics = seal.analyticsSidecar?.analytics ?? seal.summary.summary_analytics_v2;
  const supplemented = analytics && seal.distributionsSidecar
    ? { ...(analytics as Record<string, unknown>), distributions: seal.distributionsSidecar.distributions }
    : analytics;
  // A historic v2 block is immutable too. A full 32-month companion can
  // exceed its 16-KiB budget; keep that block intact and serve distributions
  // from their existing named reads, rather than break an otherwise valid Hub.
  const boundedAnalytics = supplemented && Buffer.byteLength(JSON.stringify(supplemented), "utf8") <= 16_384
    ? supplemented : analytics;
  const parsed = SummarySchema.safeParse(analytics
    ? { ...seal.summary, summary_analytics_v2: boundedAnalytics }
    : seal.summary);
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

/** W5b · the reason every W5b fact carries on a seal retained before the bar ledger. */
const SEAL_PREDATES_BAR_LEDGER = "RS02_SEAL_PREDATES_W5B_REPLAY_BAR_LEDGER";
/** P17-T14 · a W5b seal whose source tree had no strategy lifecycle table. */
const SEAL_PREDATES_CHILD_AUDIT = "RS02_SEAL_PREDATES_P17_CHILD_AUDIT";

/**
 * P17-T04 · a replay window is a contiguous run of dense sealed ordinals. A
 * hole (a row lost after the seal) is refused with a typed code instead of
 * being played through as if the missing bar never existed.
 */
function assertDenseWindow(rows: readonly CurrentSourceStoredRow[], sealedCount: number): void {
  for (let index = 0; index < rows.length; index += 1) {
    const ordinal = rows[index]!.sourceOrdinal;
    if (ordinal >= sealedCount || (index > 0 && ordinal !== rows[index - 1]!.sourceOrdinal + 1)) {
      throw new ResearchCurrentSourceError(
        "RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP",
        "A retained replay window is missing a sealed observation; no row is invented to close the gap.",
        503,
      );
    }
  }
}

function replayBar(bar: CurrentSourceBar | undefined) {
  if (!bar) return null;
  return {
    candle: bar.candle,
    fee: bar.fee,
    turnover: bar.turnover,
    funding: bar.funding,
    rejected_orders: bar.rejected_orders,
    position_before: bar.position_before,
    transition: bar.transition,
    fold_id: bar.fold_id,
    checkpoint: bar.checkpoint,
  };
}

function signOf(value: string | null): -1 | 0 | 1 {
  if (value === null) return 0;
  const numeric = Number(value);
  return numeric > 0 ? 1 : numeric < 0 ? -1 : 0;
}

function sideOf(value: string): "LONG" | "SHORT" | "FLAT" {
  const sign = signOf(value);
  return sign > 0 ? "LONG" : sign < 0 ? "SHORT" : "FLAT";
}

/** A target transition named by the sign change it makes; never a trade pairing. */
function transitionKind(before: string | null, after: string): "ENTRY" | "EXIT" | "FLIP" | "RESIZE" {
  const from = signOf(before);
  const to = signOf(after);
  if (from === 0) return "ENTRY";
  if (to === 0) return "EXIT";
  return from !== to ? "FLIP" : "RESIZE";
}

function equityContinuity(policy: string | null): "CONTINUOUS_ACROSS_FOLDS" | "RESET_PER_FOLD" | "NOT_ASSERTED" {
  // QuantBT `FoldAccountPolicyV1`: carry_position and close_at_boundary run
  // one stitched account; reset_flat runs a fresh account per fold.
  if (policy === "carry_position" || policy === "close_at_boundary") return "CONTINUOUS_ACROSS_FOLDS";
  if (policy === "reset_flat") return "RESET_PER_FOLD";
  return "NOT_ASSERTED";
}

/**
 * W5b · what the signal-notional route publishes, fact by fact. A record
 * QuantBT counted as zero is NOT_PUBLISHED with that count as its reason; a
 * capability the run's own configuration turns off is NOT_APPLICABLE.
 */
function replayCapabilities(ledger: CurrentSourceReplaySummary | null, facts: CurrentSourceFacts | null) {
  if (ledger === null) {
    const legacy = sourceGap(SEAL_PREDATES_BAR_LEDGER);
    return {
      model_positions: fact("AVAILABLE", null),
      returns: fact("AVAILABLE", null),
      orders: sourceGap("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_EXECUTION_ORDER_LEDGER"),
      fills: sourceGap("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS"),
      candles: legacy,
      transitions: legacy,
      fees: legacy,
      funding: legacy,
      fold_capital: legacy,
      trades: legacy,
      partial_fills: legacy,
      oco: legacy,
      multi_leg: legacy,
      sl_tp: legacy,
      mae_mfe: legacy,
      execution_events: legacy,
      child_audit: legacy,
    };
  }
  const contract = ledger.account_contract;
  const counted = (count: number | null, zero: string, retained: string) =>
    count === 0 ? sourceGap(zero) : sourceGap(count === null ? zero : retained);
  const engine = facts?.execution.engine_id ?? null;
  return {
    model_positions: fact("AVAILABLE", null),
    returns: fact("AVAILABLE", null),
    orders: counted(contract.orders_published, "QUANTBT_ROUTE_EMITTED_NO_ORDER_RECORDS", "RS02_ORDER_RECORDS_NOT_RETAINED"),
    fills: counted(contract.fills_published, "QUANTBT_ROUTE_EMITTED_NO_FILL_RECORDS", "RS02_FILL_RECORDS_NOT_RETAINED"),
    trades: counted(contract.trades_published, "QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS", "RS02_TRADE_RECORDS_NOT_RETAINED"),
    candles: ledger.candle_overview ? fact("AVAILABLE", null) : sourceGap("QUANTBT_STITCHED_SERIES_HAS_NO_OHLC"),
    transitions: fact("AVAILABLE", null),
    fees: ledger.totals.fee === null ? sourceGap("QUANTBT_FINAL_ACCOUNT_DID_NOT_PUBLISH_FEES") : fact("AVAILABLE", null),
    funding: contract.use_funding === false
      ? fact("NOT_APPLICABLE", "QUANTBT_RUN_CONFIG_USE_FUNDING_FALSE")
      : ledger.totals.funding === null ? sourceGap("QUANTBT_FINAL_ACCOUNT_DID_NOT_PUBLISH_FUNDING") : fact("AVAILABLE", null),
    fold_capital: ledger.fold_capital.policy === null
      ? sourceGap("QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FOLD_ACCOUNT_POLICY")
      : fact("AVAILABLE", null),
    partial_fills: contract.allow_partial_fill === false
      ? fact("NOT_APPLICABLE", "QUANTBT_EXECUTION_ALLOW_PARTIAL_FILL_FALSE")
      : sourceGap("QUANTBT_ROUTE_EMITTED_NO_FILL_RECORDS"),
    oco: engine === "close_target_v2"
      ? fact("NOT_APPLICABLE", "QUANTBT_CLOSE_TARGET_V2_HAS_NO_CONTINGENT_ORDERS")
      : sourceGap("QUANTBT_ROUTE_EMITTED_NO_ORDER_RECORDS"),
    multi_leg: contract.oms_mode === "netting"
      ? fact("NOT_APPLICABLE", "QUANTBT_SINGLE_SYMBOL_NETTING_ACCOUNT_HAS_NO_LEGS")
      : sourceGap("QUANTBT_ROUTE_EMITTED_NO_ORDER_RECORDS"),
    sl_tp: contract.intrabar_exit_model === "none"
      ? fact("NOT_APPLICABLE", "QUANTBT_INTRABAR_EXIT_MODEL_NONE")
      : sourceGap("QUANTBT_ROUTE_EMITTED_NO_ORDER_RECORDS"),
    mae_mfe: sourceGap("QUANTBT_ROUTE_EMITTED_NO_TRADE_RECORDS"),
    execution_events: sourceGap("QUANTBT_CLOSE_TARGET_ROUTE_PUBLISHES_TRANSITIONS_NOT_AN_EVENT_TAPE"),
    child_audit: ledger.child_audit ? fact("AVAILABLE", null) : sourceGap(SEAL_PREDATES_CHILD_AUDIT),
  };
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
    @Optional() @Inject(ResearchWhatIfService)
    private readonly whatIf?: ResearchWhatIfService,
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
      ...(seal.enrichedAnalysis ? { enriched_analysis: seal.enrichedAnalysis } : {}),
      enriched_analysis_availability: enrichedAvailability(seal.enrichedAnalysis),
      ...(summary.summary_analytics ? { summary_analytics: summary.summary_analytics } : {}),
      ...(summary.summary_analytics_v2 ? { summary_analytics_v2: summary.summary_analytics_v2 } : {}),
      ...(summary.source_series_artifact ? { source_series_artifact: summary.source_series_artifact } : {}),
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
        availability: this.seriesAvailability(summary, kind, seal),
        href: `/api/v1/quantbt/runs/${runId}/current-source/evidence/series?kind=${kind}`,
      })),
      source_absences: {
        route_ledger: sourceGap("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_ROUTE_LEDGER"),
        audited_fills: sourceGap("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS"),
        benchmark: summary.summary_analytics_v2?.metrics.benchmark_return_fraction.state === "AVAILABLE"
          ? fact("AVAILABLE", null)
          : sourceGap(summary.summary_analytics_v2?.metrics.benchmark_return_fraction.reason_code
            ?? "PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL"),
        /* E11: named so Screen 04 can state them instead of leaving EChart 1
           one legend entry short and EChart 3 half empty with a UI-authored
           code. Both are structural facts of this lane, not this run. */
        in_sample_account: sourceGap("QUANTBT_ADVANCED_WFO_RETAINED_NO_IN_SAMPLE_ACCOUNT"),
        ...(summary.summary_analytics?.rolling_sharpe_63.state === "AVAILABLE" ? {} : {
          rolling_sharpe: sourceGap(summary.summary_analytics?.rolling_sharpe_63.reason_code
            ?? "RS02_SOURCE_PREDATES_RETAINED_ANALYTICS"),
        }),
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
            ...(seal.profileId === DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id && fold.causal_selection
              ? { selectedParameters: fold.causal_selection.parameters, causalSelection: fold.causal_selection } : {}),
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

  async split(scope: ResearchScope, runId: string, signal?: AbortSignal): Promise<ResearchCurrentSourceSplitResponse | ResearchCurrentSourceNotApplicableResponse | ResearchCurrentSourceSplitTerminalAbsenceResponse> {
    const seal = await this.requireSeal(scope, runId, "split", signal);
    if (!isSeal(seal)) return seal;
    const summary = parseSummary(seal);
    const page = await this.repository.rows(scope, runId, seal.artifactRevision, "FOLD", { limit: 256 }, signal);
    if (page.totalRows !== seal.tableRows.FOLD || page.hasMore || page.hasPrevious) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained fold plan exceeds its admitted bound.", 503);
    }
    const folds = page.rows.map((row) => {
      // W6a: the W5b child-audit block is served by its own bounded read
      // (replay/child-audit); a W5b-retained fold row must not leak it
      // into the strict split DTO (which then answered 503).
      const { fold_facts: foldFacts, child_audit: _childAudit, ...fold } = asFold(row);
      return { source_ordinal: row.sourceOrdinal, ...fold, anatomy: foldAnatomy(foldFacts), score: foldScore(foldFacts) };
    });
    // E14 · 5.11/5.12: boundary integrity and stitched OOS provenance, both
    // read from the W5b replay ledger this same seal holds.
    const windows = folds.map((fold) => ({
      fold_id: fold.fold_id,
      test_start_utc_ms: fold.test_start_utc_ms,
      test_end_utc_ms: fold.test_end_utc_ms,
    }));
    const retainedInnerCount = seal.profileId === DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id &&
      folds.every(fold => fold.causal_selection !== undefined) && folds.length > 0
      ? folds.reduce((count, fold) => count + fold.causal_selection!.inner_folds.length, 0) : undefined;
    const temporalGuards = splitGuards(summary.source_facts, retainedInnerCount);
    const value = {
      schema_version: "research.current-source-split.v1" as const,
      ...this.common("split", seal),
      fold_plan: {
        state: "AVAILABLE" as const,
        folds,
        chronology: "SOURCE_OBSERVED_ADVANCED_WFO" as const,
        availability: available(),
      },
      data_use: {
        warmup: this.summaryFact(summary.data_use.warmup),
        purge: this.summaryFact(summary.data_use.purge),
        embargo: this.summaryFact(summary.data_use.embargo),
        strict_outer_oos_selection: this.summaryFact(summary.data_use.strict_outer_oos_selection),
      },
      guards: {
        ...temporalGuards,
        train_test_disjoint: trainTestDisjoint(
          folds,
          temporalGuards.purge_bars,
          temporalGuards.embargo_bars,
        ),
      },
      gap_scan: splitGapScan(summary.replay, windows),
      stitch: splitStitch(summary.replay, windows),
    };
    return this.valid(ResearchCurrentSourceSplitResponseSchema, value);
  }

  async search(
    scope: ResearchScope,
    runId: string,
    query: ResearchCurrentSourcePageQuery | ResearchCurrentSourceSearchQuery,
    signal?: AbortSignal,
  ): Promise<ResearchCurrentSourceSearchResponse | ResearchCurrentSourceNotApplicableResponse> {
    this.requireEnabled();
    const retained = await this.repository.searchForRead(scope, runId, signal);
    if (!retained) return this.noSealForRead(scope, runId, "search", signal);
    const { seal, inputs } = retained;
    const summary = parseSummary(seal);
    const facts = summary.source_facts;
    const ledgerMode = facts?.search.trial_ledger_mode ?? null;
    const currentRevision = `rs02_search_${sha256ResearchJson({
      base: revision("search", seal), stage_events: inputs.stageEvents,
    })}`;
    const fold = "fold" in query ? query.fold ?? null : null;
    // A fold filter binds its own cursors: a page minted for fold 1 is
    // refused for fold 2 (the operation string is part of the fingerprint).
    const operation = fold === null ? "research.current-source.search.v1" : `research.current-source.search.v1:fold=${fold}`;
    let page: CurrentSourcePage;
    let matchedRows: number;
    if (fold === null) {
      page = this.pageInMemory(scope.workspaceId, runId, currentRevision, operation, inputs.trials, query);
      matchedRows = seal.tableRows.TRIAL;
    } else {
      const folds = inputs.folds;
      if (!folds.some((row) => row.sourceId === fold)) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "The fold filter names no retained fold of this run.", 400);
      }
      const all = inputs.trials;
      const matched = all.filter((row) => trialCoversFold(asTrial(row).trial_facts, fold));
      matchedRows = matched.length;
      page = this.pageInMemory(scope.workspaceId, runId, currentRevision, operation, matched, query);
    }
    // X2 · B3: the surface is every retained trial (≤ 64), whatever page the ledger shows.
    const allTrials = inputs.trials;
    let space = declaredSpace(seal.profileId, summary.selection.parameters);
    const roles = selectionRoles(facts, summary.selection);
    const surfaceTrials: SurfaceTrial[] = allTrials.map((row) => {
      const trial = asTrial(row);
      return {
        sourceOrdinal: row.sourceOrdinal,
        trialId: trial.trial_id,
        state: typedTrialState(trial.state),
        objective: trial.objective,
        parameters: trial.parameters,
      };
    });
    let studySurfaces: SearchStudySurface[] | undefined;
    if (isCausalSeal(seal)) {
      // The native local trial number repeats across studies. Join the actual
      // source study_id AND outer fold_id, never parse a qualified display id.
      const outer = [...inputs.folds].sort((left, right) => left.sourceOrdinal - right.sourceOrdinal).map(asFold);
      const last = outer.at(-1);
      if (outer.length < 2 || outer.length > 16 || allTrials.length !== outer.length * 3
        || summary.selection.scope !== "LAST_FOLD_DEPLOYMENT" || !last?.causal_selection
        || summary.selection.fold_id !== last.fold_id) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Causal study populations or last-fold deployment were not retained exactly.", 503);
      }
      try {
        const studies = outer.map(outerFold => {
          const selected = outerFold.causal_selection;
          if (!selected) throw new RangeError("An outer study selection was not retained.");
          const members = allTrials.flatMap((row, index) => {
            const trial = asTrial(row), trialFacts = trial.trial_facts;
            if (trialFacts?.study_id !== selected.study_id || trialFacts.fold_scope.fold_id !== outerFold.fold_id) return [];
            if (!["FOLD", "PER_FOLD_STUDY"].includes(trialFacts.fold_scope.kind)
              || trialFacts.stage !== "is_search" || trialFacts.objective_kind !== "IS_MEAN_SHARPE") {
              throw new RangeError("Causal surface requires the study's actual Stage-A IS ledger.");
            }
            return [surfaceTrials[index]!];
          });
          return { foldId: outerFold.fold_id, studyId: selected.study_id, selectedTrialId: selected.selected_trial_id,
            selectedParameters: selected.parameters, trials: members };
        });
        studySurfaces = searchStudySurfaces(seal.profileId, studies);
        // Declared ranges are common; this singleton's values belong only to
        // the final deployment, not a run-global theta used by earlier folds.
        space = { ...space, selection_scope: "LAST_FOLD_DEPLOYMENT", fold_id: last.fold_id, study_id: last.causal_selection.study_id };
      } catch {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Causal study surfaces do not match exact retained fold and trial identities.", 503);
      }
    }
    const firstFacts = allTrials.length > 0 ? asTrial(allTrials[0]!).trial_facts : undefined;
    // E5: the pool and θ*'s per-fold decay read every retained trial and fold row.
    const poolFolds = inputs.folds;
    const pool = searchPool({
      facts,
      sourceAdapterId: seal.sourceAdapterId,
      sourceProfileId: seal.profileId,
      trials: allTrials.map((row) => {
        const trial = asTrial(row);
        return { trialId: trial.trial_id, state: typedTrialState(trial.state), objective: trial.objective, facts: trial.trial_facts };
      }),
      candidates: inputs.candidates.map((row) => {
        const candidate = asCandidate(row);
        return { candidateId: candidate.candidate_id, objective: candidate.objective, facts: candidate.trial_facts };
      }),
      folds: poolFolds.map((row) => {
        const fold = asFold(row);
        return { foldId: fold.fold_id, sourceOrdinal: row.sourceOrdinal, facts: fold.fold_facts, causalSelection: fold.causal_selection };
      }),
      selectedTrialId: summary.selection.trial_id,
    });
    const contract = searchContract(facts);
    const rawRequest = inputs.requestedSpec;
    const admitted = rawRequest === null ? null : ResearchRequestedSpecSchema.safeParse(rawRequest);
    if (admitted !== null && !admitted.success) {
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained P08 request is incompatible.", 503);
    }
    const requestSeed = admitted?.data.random_seed ?? null;
    const seedAvailability = admitted === null ? fact("NOT_PUBLISHED", "P08_REQUESTED_SPEC_NOT_RETAINED").availability
      : requestSeed === null ? fact("NOT_APPLICABLE", "P08_RANDOM_SEED_NOT_SELECTED").availability : available();
    const value = {
      schema_version: "research.current-source-search.v1" as const,
      ...this.common("search", seal, currentRevision),
      selection: {
        state: "AVAILABLE" as const,
        selected_trial_id: summary.selection.trial_id,
        objective: summary.selection.objective,
        parameters: summary.selection.parameters,
        availability: available(),
        objective_kind: facts ? summary.selection.scope === "LAST_FOLD_DEPLOYMENT" ? "INNER_VALIDATION_DECAY_J" as const : "MODE_1_DECAY_J" as const : "NOT_PUBLISHED" as const,
        ...(summary.selection.scope ? { scope: summary.selection.scope, fold_id: summary.selection.fold_id } : {}),
        roles,
      },
      // E5 · 6.7: K from the retained pool when QuantBT's own rule agrees; otherwise the configured value (null stays null).
      search_contract: {
        ...contract, top_is_k: pool.top_is_k.value ?? contract.top_is_k,
        requested_seed: { value: requestSeed, scope: "ADMITTED_RUN_REQUEST_BASE_SEED" as const, availability: seedAvailability },
      },
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
            params_digest: sha256ResearchJson(trial.parameters),
            params_digest_source: "PORTAL_CANONICAL_TRIAL_PARAMETERS_V1" as const,
            facts: trialFacts(rowFacts, ledgerMode, isCausalSeal(seal)),
            playback_cursor: this.playbackCursor(scope.workspaceId, runId, currentRevision, "TRIAL", row.sourceOrdinal),
          };
        }),
        page: this.page(scope.workspaceId, runId, currentRevision, "TRIAL", query.limit, page, operation),
        availability: available(),
        fold_filter: { fold_id: fold, rule: "TRIAL_FOLD_SCOPE_COVERS_FOLD" as const, matched_rows: matchedRows },
      },
      candidates: {
        source_candidate_count: seal.tableRows.CANDIDATE,
        rows: inputs.candidates.map((row) => {
          const { trial_facts: rowFacts, ...candidate } = asCandidate(row);
          return {
            source_ordinal: row.sourceOrdinal,
            ...candidate,
            facts: trialFacts(rowFacts, ledgerMode, isCausalSeal(seal)),
            max_drawdown: candidateDrawdown({
              candidate: { candidateId: candidate.candidate_id, objective: candidate.objective, facts: rowFacts },
              selection: summary.selection,
              schedule: facts?.search.optimization_schedule ?? null,
              passportMaxDrawdown: summary.metrics.max_drawdown_fraction,
            }),
          };
        }),
        availability: available(),
      },
      diagnostics: searchDiagnostics(facts),
      declared_space: space,
      surface: isCausalSeal(seal) ? runGlobalCausalSurface(allTrials.length,
        surfaceTrials.filter(trial => trial.state === "COMPLETE" && trial.objective !== null).length) : searchSurface({
        trials: surfaceTrials,
        space,
        selectedTrialId: summary.selection.trial_id,
        bestIsTrialId: roles.raw_best_is.trial_id,
        objectiveKind: firstFacts?.objective_kind ?? "NOT_PUBLISHED",
      }),
      ...(studySurfaces ? { surfaces_by_study: studySurfaces } : {}),
      pool: {
        ...pool,
        frozen_at_utc_ms: null,
        frozen_at_source: null,
        frozen_at_reason_code: POOL_FREEZE_CLOCK_ABSENT,
      },
      stage_events: inputs.stageEvents,
    };
    return this.valid(ResearchCurrentSourceSearchResponseSchema, value);
  }

  async freeze(scope: ResearchScope, runId: string, signal?: AbortSignal): Promise<ResearchCurrentSourceFreezeResponse | ResearchCurrentSourceNotApplicableResponse> {
    const seal = await this.requireSeal(scope, runId, "freeze", signal);
    if (!isSeal(seal)) return seal;
    const summary = parseSummary(seal);
    const stageEvents = await this.repository.stageEventClocks(scope, seal, signal);
    const observedImportDigest = await this.repository.verifyRetainedImport(scope, seal, signal);
    const integrityState = observedImportDigest === seal.retainedImportDigest ? "MATCH" as const : "MISMATCH" as const;
    // A10a: the newest durable byte receipt (a GET never re-reads bytes).
    const byteVerification = await this.latestBytes(scope, runId);
    // A10c: exact existing evaluations around θ*; nothing is evaluated here.
    const whatIf = await this.whatIfFor(scope, await this.basisFrom(scope, runId, seal, summary, byteVerification, signal));
    const common = this.common("freeze", seal);
    let space = declaredSpace(seal.profileId, summary.selection.parameters);
    const binding = DEFAULT_PARAMETER_BINDING_REGISTRY.byRetainedLaneProfile(seal.profileId);
    // P16-T02/T11: per-fold ordering from the sealed FOLD rows (immutable
    // under the seal revision, so it cannot move the ETag on its own).
    const foldRows = (await this.boundedRows(scope, runId, seal, "FOLD", 256, signal)).map((row) => ({ row, fold: asFold(row) }));
    if (isCausalSeal(seal)) {
      const deployment = foldRows.find(({ fold }) => fold.fold_id === summary.selection.fold_id)?.fold;
      if (!deployment?.causal_selection || summary.selection.scope !== "LAST_FOLD_DEPLOYMENT") {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Last-fold deployment scope was not retained.", 503);
      }
      space = { ...space, selection_scope: "LAST_FOLD_DEPLOYMENT", fold_id: deployment.fold_id, study_id: deployment.causal_selection.study_id };
    }
    const ordering = foldOrdering(
      foldRows.map(({ row }) => {
        const fold = asFold(row);
        return {
          sourceOrdinal: row.sourceOrdinal,
          foldId: fold.fold_id,
          trainStartUtcMs: fold.train_start_utc_ms,
          trainEndUtcMs: fold.train_end_utc_ms,
          testStartUtcMs: fold.test_start_utc_ms,
          testEndUtcMs: fold.test_end_utc_ms,
          childAudit: fold.child_audit?.records,
          causalSelection: fold.causal_selection,
        };
      }),
      summary.source_facts,
      summary.selection.parameters,
      binding?.candidateParameterKinds,
      stageEvents,
      seal.profileId,
    );
    // The ETag must move when a new receipt, a job state or a sealed grid
    // lands, or a 304 would hide it.
    const freezeRevision = `rs02_freeze_${sha256ResearchJson({
      base: common.revision,
      byte_receipt: byteVerification.receipt_id,
      byte_state: byteVerification.state,
      fold_ordering: ordering,
      what_if: {
        state: whatIf.state,
        coverage: whatIf.coverage?.label ?? null,
        job: whatIf.job ? { run_id: whatIf.job.run_id, state: whatIf.job.state, sealed: whatIf.job.sealed } : null,
        evaluate: whatIf.actions.evaluate_grid.state,
      },
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
        ...(summary.selection.scope ? { scope: summary.selection.scope, fold_id: summary.selection.fold_id } : {}),
      },
      what_if: whatIf,
      fold_ordering: ordering,
      declared_space: space,
      stage4_binding: retainedStage4Binding(
        summary.selection.parameters,
        Object.keys(summary.selection.parameters).length > 0 ? sha256ResearchJson(summary.selection.parameters) : null,
        [...foldRows]
          .sort((left, right) => left.row.sourceOrdinal - right.row.sourceOrdinal)
          .map(({ fold }) => ({ foldId: fold.fold_id, records: fold.child_audit?.records,
            ...(seal.profileId === DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id
              ? { selectedParameters: fold.causal_selection?.parameters ?? null } : {}) })),
        binding?.candidateParameterKinds,
      ),
      parameter_authority: parameterAuthority({
        names: space.parameters.map((parameter) => parameter.name),
        codeFixed: binding?.codeFixed,
        adapterContractDigest: binding?.adapterContractDigest ?? null,
      }),
    };
    return this.valid(ResearchCurrentSourceFreezeResponseSchema, value);
  }

  /**
   * A10c: the facts the what-if lane is built from — the sealed θ*, the
   * retained parent trials and the newest byte receipt. Read-only; used by
   * the freeze GET and by the explicit evaluate action alike.
   */
  async whatIfBasis(scope: ResearchScope, runId: string, signal?: AbortSignal): Promise<WhatIfBasis> {
    const seal = await this.requireSeal(scope, runId, "freeze", signal);
    if (!isSeal(seal)) {
      throw new ResearchCurrentSourceError(
        "RESEARCH_CURRENT_SOURCE_CONFLICT",
        "This run froze a fixed profile — no evaluated neighbourhood exists.",
        409,
      );
    }
    return this.basisFrom(scope, runId, seal, parseSummary(seal), await this.latestBytes(scope, runId), signal);
  }

  private async basisFrom(
    scope: ResearchScope,
    runId: string,
    seal: CurrentSourceSealRow,
    summary: ReturnType<typeof parseSummary>,
    bytes: ArtifactByteVerification,
    signal?: AbortSignal,
  ): Promise<WhatIfBasis> {
    const trials = (await this.boundedRows(scope, runId, seal, "TRIAL", MAXIMUM_TRIAL_ROWS, signal)).map((row) => {
      const trial = asTrial(row);
      return {
        trialId: trial.trial_id,
        state: trial.state,
        objective: trial.objective,
        parameters: trial.parameters,
      };
    });
    return { runId, frozen: summary.selection.parameters, trials, bytes };
  }

  private async whatIfFor(scope: ResearchScope, basis: WhatIfBasis): Promise<WhatIf> {
    if (this.whatIf) return this.whatIf.read(scope, basis);
    return inertWhatIf(basis.runId);
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
    assertDenseWindow(page.rows, seal.tableRows.OBSERVATION);
    const selectedOrdinal = this.selectedOrdinal(scope.workspaceId, runId, currentRevision, "OBSERVATION", query);
    const selected = selectedOrdinal === null ? null : page.rows.find((row) => row.sourceOrdinal === selectedOrdinal) ?? null;
    const selectedObservation = selected ? asObservation(selected) : null;
    const summary = parseSummary(seal);
    const ledger = summary.replay ?? null;
    const perFoldSelections = seal.profileId === DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id
      ? new Map((await this.boundedRows(scope, runId, seal, "FOLD", 256, signal)).map(row => {
        const fold = asFold(row);
        if (!fold.causal_selection) throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Causal replay selection was not retained for an outer fold.", 503);
        return [fold.fold_id, fold.causal_selection] as const;
      })) : undefined;
    const value = {
      schema_version: "research.current-source-replay.v1" as const,
      ...this.common("replay", seal, currentRevision),
      replay: {
        source_observation_count: seal.tableRows.OBSERVATION,
        rows: page.rows.map((row) => {
          const observation = asObservation(row);
          return {
            source_ordinal: row.sourceOrdinal,
            source_index_utc: observation.source_index_utc,
            at_utc_ms: observation.at_utc_ms,
            equity: observation.equity,
            return_fraction: observation.return_fraction,
            accepted_position: observation.accepted_position,
            drawdown_fraction: observation.drawdown_fraction,
            signal_target: observation.signal_target,
            bar: replayBar(observation.bar),
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
          bar: replayBar(selectedObservation.bar),
          semantics: "RESEARCH_MODEL_SAMPLE_NOT_BROKER_EXECUTION_STATE" as const,
          availability: available(),
        } : {
          state: "NOT_SELECTED" as const,
          source_ordinal: null,
          at_utc_ms: null,
          accepted_position: null,
          equity: null,
          bar: null,
          semantics: "NO_SELECTED_PLAYHEAD" as const,
          availability: available(),
        },
      },
      route_capabilities: replayCapabilities(ledger, summary.source_facts ?? null),
      execution: this.replayExecution(
        scope.workspaceId, runId, currentRevision, ledger, summary.source_facts ?? null,
        Object.keys(summary.selection.parameters).length > 0
          ? sha256ResearchJson(summary.selection.parameters) : null,
        perFoldSelections,
      ),
    };
    return this.valid(ResearchCurrentSourceReplayResponseSchema, value);
  }

  /**
   * W5b (P17) · the close-target transition ledger. Keyset over the original
   * observation ordinal of each transition bar; every row seeks the replay
   * relation with the same playback cursor the replay rows carry.
   */
  async replayTransitions(
    scope: ResearchScope,
    runId: string,
    query: ResearchCurrentSourceTransitionsQuery,
    signal?: AbortSignal,
  ): Promise<ResearchCurrentSourceReplayTransitionsResponse | ResearchCurrentSourceNotApplicableResponse> {
    const seal = await this.requireSeal(scope, runId, "replay_transitions", signal);
    if (!isSeal(seal)) return seal;
    const ledger = parseSummary(seal).replay ?? null;
    const operation = "research.current-source.replay-transitions.v1";
    const currentRevision = revision("replay", seal);
    const resourceId = `${operation}:${runId}:${currentRevision}:OBSERVATION`;
    const fingerprint = queryFingerprint({ resourceId, limit: query.limit, filters: [], sort: [] });
    const common = { ...this.common("replay", seal, currentRevision) };
    const emptyPage = {
      limit: query.limit, next_cursor: null, prev_cursor: null, has_more: false, has_previous: false,
      order: "SOURCE_TABLE_ORDINAL_ASC" as const,
    };
    if (ledger === null) {
      return this.valid(ResearchCurrentSourceReplayTransitionsResponseSchema, {
        schema_version: "research.current-source-replay-transitions.v1",
        ...common,
        availability: { state: "NOT_RETAINED_LEGACY", reason_code: SEAL_PREDATES_BAR_LEDGER },
        semantics: "TARGET_TRANSITION_SETTLED_AT_CLOSE_NOT_A_FILL",
        availability_reason: SEAL_PREDATES_BAR_LEDGER,
        source_transition_count: null,
        rows: [],
        page: emptyPage,
      });
    }
    let afterOrdinal: number | undefined;
    let beforeOrdinal: number | undefined;
    if (query.cursor) afterOrdinal = this.decodeCursor(scope.workspaceId, resourceId, fingerprint, "after", query.cursor);
    if (query.before) beforeOrdinal = this.decodeCursor(scope.workspaceId, resourceId, fingerprint, "before", query.before);
    const page = await this.repository.transitions(scope, runId, seal.artifactRevision, {
      ...(afterOrdinal === undefined ? {} : { afterOrdinal }),
      ...(beforeOrdinal === undefined ? {} : { beforeOrdinal }),
      limit: query.limit,
    }, signal);
    if (page.totalRows !== ledger.totals.transitions) {
      throw new ResearchCurrentSourceError(
        "RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP",
        "Retained transition rows do not match the sealed transition count; no row is invented to close the gap.",
        503,
      );
    }
    const rows = page.rows.map((row) => {
      const observation = asObservation(row);
      const bar = observation.bar;
      if (!bar || !bar.transition) {
        throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Retained transition row is incompatible.", 503);
      }
      const after = observation.accepted_position;
      return {
        source_ordinal: row.sourceOrdinal,
        source_index_utc: observation.source_index_utc,
        at_utc_ms: observation.at_utc_ms,
        transition_number: bar.checkpoint.transition_count,
        fold_id: bar.fold_id,
        kind: transitionKind(bar.position_before, after),
        side_after: sideOf(after),
        position_before: bar.position_before,
        position_after: after,
        close: bar.candle?.close ?? null,
        turnover: bar.turnover,
        fee: bar.fee,
        equity: observation.equity,
        playback_cursor: this.playbackCursor(scope.workspaceId, runId, currentRevision, "OBSERVATION", row.sourceOrdinal),
      };
    });
    const first = page.rows[0]?.sourceOrdinal;
    const last = page.rows.at(-1)?.sourceOrdinal;
    return this.valid(ResearchCurrentSourceReplayTransitionsResponseSchema, {
      schema_version: "research.current-source-replay-transitions.v1",
      ...common,
      semantics: "TARGET_TRANSITION_SETTLED_AT_CLOSE_NOT_A_FILL",
      availability_reason: null,
      source_transition_count: ledger.totals.transitions,
      rows,
      page: {
        limit: query.limit,
        next_cursor: page.hasMore && last !== undefined ? this.encodeCursor(scope.workspaceId, resourceId, fingerprint, "after", last) : null,
        prev_cursor: page.hasPrevious && first !== undefined ? this.encodeCursor(scope.workspaceId, resourceId, fingerprint, "before", first) : null,
        has_more: page.hasMore,
        has_previous: page.hasPrevious,
        order: "SOURCE_TABLE_ORDINAL_ASC" as const,
      },
    });
  }

  /**
   * P17-T14 · one fold's child audit: the retained FOLD row read by its
   * original fold id (one indexed row), its QuantBT isolation records in
   * QuantBT's own order. No compute; nothing is inferred from positions.
   */
  async replayChildAudit(
    scope: ResearchScope,
    runId: string,
    query: ResearchCurrentSourceChildAuditQuery,
    signal?: AbortSignal,
  ): Promise<ResearchCurrentSourceReplayChildAuditResponse | ResearchCurrentSourceNotApplicableResponse> {
    const seal = await this.requireSeal(scope, runId, "replay_child_audit", signal);
    if (!isSeal(seal)) return seal;
    const summary = parseSummary(seal).replay?.child_audit ?? null;
    const common = this.common("replay", seal);
    const absent = (reason: string) => this.valid(ResearchCurrentSourceReplayChildAuditResponseSchema, {
      schema_version: "research.current-source-replay-child-audit.v1",
      ...common,
      availability: { state: "NOT_RETAINED_LEGACY", reason_code: reason },
      fold_id: query.fold,
      reason_code: reason,
      policy: null,
      records_dropped_by_source: null,
      source_run_fingerprint: null,
      source_record_count: null,
      truncated: false,
      records: [],
    });
    if (summary === null) {
      return absent(parseSummary(seal).replay ? SEAL_PREDATES_CHILD_AUDIT : SEAL_PREDATES_BAR_LEDGER);
    }
    const row = await this.repository.rowBySourceId(scope, runId, seal.artifactRevision, "FOLD", query.fold, signal);
    if (!row) throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_NOT_FOUND", "This run has no retained fold with that id.", 404);
    const fold = asFold(row);
    const block = fold.child_audit;
    if (!block) return absent(SEAL_PREDATES_CHILD_AUDIT);
    return this.valid(ResearchCurrentSourceReplayChildAuditResponseSchema, {
      schema_version: "research.current-source-replay-child-audit.v1",
      ...common,
      fold_id: fold.fold_id,
      reason_code: null,
      policy: summary.policy,
      records_dropped_by_source: summary.records_dropped_by_source,
      source_run_fingerprint: summary.source_run_fingerprint,
      source_record_count: block.source_record_count,
      truncated: block.truncated,
      records: block.records,
    });
  }

  private replayExecution(
    workspaceId: string,
    runId: string,
    currentRevision: string,
    ledger: CurrentSourceReplaySummary | null,
    facts: CurrentSourceFacts | null,
    selectedParamsDigest: string | null,
    perFoldSelections?: ReadonlyMap<string, CurrentSourceCausalSelection>,
  ) {
    const execution = facts?.execution ?? null;
    const contract = ledger?.account_contract ?? null;
    const capital = ledger?.fold_capital ?? null;
    const policy = capital?.policy ?? execution?.fold_account_policy ?? null;
    return {
      schema_version: "research.current-source-replay-execution.v1" as const,
      state: ledger ? "AVAILABLE" as const : "NOT_RETAINED_LEGACY" as const,
      reason_code: ledger ? null : SEAL_PREDATES_BAR_LEDGER,
      route: {
        engine_id: execution?.engine_id ?? null,
        signal_phase: execution?.signal_phase ?? null,
        fill_phase: execution?.fill_phase ?? null,
        accounting_certified: execution?.accounting_certified ?? null,
        fill_price_policy: contract?.fill_price_policy ?? null,
        target_intent_kind: contract?.target_intent_kind ?? null,
        intrabar_exit_model: contract?.intrabar_exit_model ?? null,
        same_bar_policy: contract?.same_bar_policy ?? null,
        allow_partial_fill: contract?.allow_partial_fill ?? null,
        oms_mode: contract?.oms_mode ?? null,
        margin_mode: contract?.margin_mode ?? null,
        report_level: contract?.report_level ?? null,
        fee_rate_oneway: contract?.fee_rate_oneway ?? null,
        slippage_bps: contract?.slippage_bps ?? null,
        use_funding: contract?.use_funding ?? null,
      },
      counts: {
        bars: ledger?.totals.bars ?? null,
        orders_published: contract?.orders_published ?? null,
        fills_published: contract?.fills_published ?? null,
        trades_published: contract?.trades_published ?? null,
        transitions: ledger?.totals.transitions ?? null,
        bars_with_turnover: ledger?.totals.bars_with_turnover ?? null,
        rejected_orders: ledger?.totals.rejected_orders ?? null,
      },
      totals: {
        fee: ledger?.totals.fee ?? null,
        turnover: ledger?.totals.turnover ?? null,
        funding: ledger?.totals.funding ?? null,
      },
      fold_capital: {
        policy,
        account_execution: capital?.account_execution ?? execution?.account_execution ?? null,
        boundary_position_policy: capital?.boundary_position_policy ?? execution?.fold_boundary_position_policy ?? null,
        equity_continuity: equityContinuity(policy),
        reason_code: policy === null ? "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_FOLD_ACCOUNT_POLICY" : null,
        segments: (ledger?.fold_segments ?? []).map((segment) => {
          const selected = perFoldSelections?.get(segment.fold_id);
          if (perFoldSelections && !selected) throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_UNAVAILABLE", "Replay segment has no exact retained outer-fold selection.", 503);
          const digest = selected ? sha256ResearchJson(selected.parameters) : selectedParamsDigest;
          return {
          ...segment,
          ...(selected ? { parameters: selected.parameters, selection_scope: selected.scope,
            selected_trial_id: selected.selected_trial_id, study_id: selected.study_id } : {}),
          params_digest: digest,
          params_digest_reason_code: digest === null ? "RS02_SEAL_DID_NOT_RETAIN_SELECTED_PARAMETERS" : null,
          start_cursor: this.playbackCursor(workspaceId, runId, currentRevision, "OBSERVATION", segment.first_ordinal),
        };
        }),
        boundary_events: capital?.boundary_events ?? [],
      },
      candle_overview: ledger?.candle_overview ?? null,
      child_audit: ledger?.child_audit ? {
        state: "AVAILABLE" as const,
        reason_code: null,
        policy: ledger.child_audit.policy,
        records_dropped_by_source: ledger.child_audit.records_dropped_by_source,
        source_record_count: ledger.child_audit.source_record_count,
        source_run_fingerprint: ledger.child_audit.source_run_fingerprint,
      } : {
        state: "NOT_PUBLISHED" as const,
        reason_code: ledger ? SEAL_PREDATES_CHILD_AUDIT : SEAL_PREDATES_BAR_LEDGER,
        policy: null,
        records_dropped_by_source: null,
        source_record_count: null,
        source_run_fingerprint: null,
      },
      sequence: {
        order: "SOURCE_TABLE_ORDINAL_ASC" as const,
        density: "DENSE_SEALED_ORDINALS" as const,
        gap_policy: "REFUSE_RESEARCH_CURRENT_SOURCE_SEQUENCE_GAP" as const,
        cross_stream_order: "NOT_ASSERTED" as const,
      },
    };
  }

  private requireSeal(scope: ResearchScope, runId: string, operation: "split", signal?: AbortSignal): Promise<CurrentSourceSealRow | ResearchCurrentSourceNotApplicableResponse | ResearchCurrentSourceSplitTerminalAbsenceResponse>;
  private requireSeal(scope: ResearchScope, runId: string, operation: Exclude<ResearchCurrentSourceOperation, "split">, signal?: AbortSignal): Promise<CurrentSourceSealRow | ResearchCurrentSourceNotApplicableResponse>;
  private async requireSeal(
    scope: ResearchScope,
    runId: string,
    operation: ResearchCurrentSourceOperation,
    signal?: AbortSignal,
  ): Promise<CurrentSourceSealRow | ResearchCurrentSourceNotApplicableResponse | ResearchCurrentSourceSplitTerminalAbsenceResponse> {
    this.requireEnabled();
    const seal = await this.repository.sealForRead(scope, runId, signal);
    if (seal) return seal;
    return this.noSealForRead(scope, runId, operation, signal);
  }

  private noSealForRead(scope: ResearchScope, runId: string, operation: "split", signal?: AbortSignal): Promise<ResearchCurrentSourceNotApplicableResponse | ResearchCurrentSourceSplitTerminalAbsenceResponse>;
  private noSealForRead(scope: ResearchScope, runId: string, operation: Exclude<ResearchCurrentSourceOperation, "split">, signal?: AbortSignal): Promise<ResearchCurrentSourceNotApplicableResponse>;
  private noSealForRead(scope: ResearchScope, runId: string, operation: ResearchCurrentSourceOperation, signal?: AbortSignal): Promise<ResearchCurrentSourceNotApplicableResponse | ResearchCurrentSourceSplitTerminalAbsenceResponse>;
  private async noSealForRead(
    scope: ResearchScope, runId: string, operation: ResearchCurrentSourceOperation, signal?: AbortSignal,
  ): Promise<ResearchCurrentSourceNotApplicableResponse | ResearchCurrentSourceSplitTerminalAbsenceResponse> {
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
      if (operation === "split") {
        const lane = {
          state: "NOT_RETAINED_TERMINAL" as const,
          operation,
          effective_status: state.effectiveStatus,
          execution_profile_id: state.executionProfileId ?? null,
          run_adapter_contract_digest: state.adapterContractDigest ?? null,
          reason_code: "RS02_TERMINAL_SPLIT_NOT_RETAINED" as const,
        };
        const schemaVersion = "research.current-source-split-terminal-absence.v1";
        const revisionValue = `rs02_terminal-split_${sha256ResearchJson({ schema_version: schemaVersion, run_id: runId, lane })}`;
        return this.valid(ResearchCurrentSourceSplitTerminalAbsenceResponseSchema, {
          schema_version: schemaVersion,
          read_authority: "PORTAL_RETAINED_CURRENT_SOURCE",
          run_id: runId,
          revision: revisionValue,
          etag: `"${revisionValue}"`,
          availability: { state: "NOT_PUBLISHED", reason_code: lane.reason_code },
          lane,
        });
      }
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
    const imported = executionProfileId === IMPORTED_ALPHA_PROFILE_ID &&
      adapterContractDigest === IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST;
    const p04 = executionProfileId === P04_FIXED_QUALIFICATION_PROFILE_ID &&
      adapterContractDigest === P04_DELTA_ADAPTER_CONTRACT_DIGEST;
    if (!p04 && !imported) return null;
    const reason = imported
      ? "RS02_RETAINED_WFO_LANE_NOT_APPLICABLE_TO_IMPORTED_FIXED_QUALIFICATION"
      : P04_FIXED_PROFILE_NOT_RETAINABLE_REASON;
    const revisionValue = `rs02_not-applicable_${sha256ResearchJson({
      schema_version: "research.current-source-not-applicable.v1",
      run_id: runId,
      operation,
      run_adapter_contract_digest: adapterContractDigest,
      reason_code: reason,
    })}`;
    return this.valid(ResearchCurrentSourceNotApplicableResponseSchema, {
      schema_version: "research.current-source-not-applicable.v1",
      read_authority: "PORTAL_RETAINED_CURRENT_SOURCE",
      run_id: runId,
      revision: revisionValue,
      etag: `"${revisionValue}"`,
      availability: { state: "NOT_APPLICABLE", reason_code: reason },
      lane: {
        state: "NOT_APPLICABLE",
        operation,
        run_profile: imported ? "IMPORTED_FIXED_QUALIFICATION" : "P04_FIXED_QUALIFICATION",
        run_adapter_contract_digest: adapterContractDigest,
        // Byte-stable: P04 N/A keeps naming the original Advanced-WFO lane.
        retainable_profile_id: RS02_DELTA_WFO_GLOBAL_PROFILE_ID,
        reason_code: reason,
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

  private common(kind: string, seal: CurrentSourceSealRow, alreadyComputedRevision?: string) {
    // One request already computed the exact same immutable seal revision
    // for its signed cursor. Reuse that value, not a cross-request cache.
    const value = alreadyComputedRevision ?? revision(kind, seal);
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
    if (seal.enrichedAnalysis && (kind === "MONTHLY_RETURNS" || kind === "RETURN_DISTRIBUTION")) {
      const enriched = seal.enrichedAnalysis;
      const source = kind === "MONTHLY_RETURNS" ? enriched.monthly_returns : enriched.return_distribution;
      const values = kind === "MONTHLY_RETURNS" ? enriched.monthly_returns.values.map(({ expected_observation_count: _expected, ...row }) => row)
        : enriched.return_distribution.buckets.map(row => ({ ...row, count: String(row.count) }));
      return { availability: { state: source.state, reason_code: source.reason_code },
        source_sample: { source_observation_count: kind === "MONTHLY_RETURNS" ? enriched.scope.observation_count : enriched.return_distribution.observation_count,
          emitted_point_count: values.length, sampling: source.state === "AVAILABLE" ? kind === "MONTHLY_RETURNS" ? enriched.monthly_returns.sampling : "FULL_RETURN_HISTOGRAM_V2" : "NOT_APPLICABLE", envelope: null,
          derivation: { origin: "PORTAL_DERIVED", scope: "OOS", input_digest: enriched.input_digest, source_locator: enriched.scope.locator,
            definition_id: kind === "MONTHLY_RETURNS" ? enriched.monthly_returns.definition_id : enriched.return_distribution.bucket_basis,
            grain: kind === "MONTHLY_RETURNS" ? "UTC_CALENDAR_MONTH" : "UTC_DAY", oos_observation_count: enriched.scope.observation_count,
            ...(kind === "MONTHLY_RETURNS" ? { total_period_count: enriched.monthly_returns.total_period_count,
              omitted_transport_period_count: enriched.monthly_returns.omitted_transport_period_count } : {}) } }, values };
    }
    const distributions = seal.distributionsSidecar?.distributions ?? summary.summary_analytics_v2?.distributions;
    if (distributions && (kind === "MONTHLY_RETURNS" || kind === "RETURN_DISTRIBUTION")) {
      const source = kind === "MONTHLY_RETURNS" ? distributions.monthly_returns : distributions.return_distribution;
      return {
        availability: { state: source.state, reason_code: source.reason_code },
        source_sample: {
          source_observation_count: source.source_observation_count,
          emitted_point_count: source.emitted_point_count, sampling: source.sampling, envelope: null,
          derivation: { origin: distributions.origin, scope: distributions.scope,
            input_digest: distributions.input_digest, source_locator: distributions.scope_locator,
            definition_id: kind === "MONTHLY_RETURNS" ? distributions.monthly_definition : distributions.distribution_definition,
            grain: kind === "MONTHLY_RETURNS" ? "UTC_CALENDAR_MONTH" : "UTC_DAY",
            oos_observation_count: distributions.oos_observation_count,
            ...(kind === "MONTHLY_RETURNS" ? {
              total_period_count: distributions.monthly_returns.total_period_count,
              omitted_transport_period_count: distributions.monthly_returns.omitted_transport_period_count,
            } : {}) },
        },
        values: source.values,
      };
    }
    const derivedAvailability = this.seriesAvailability(summary, kind, seal);
    if (derivedAvailability.state === "NOT_PUBLISHED") {
      const sourceCount = kind === "MONTHLY_RETURNS"
        ? summary.derived.monthly_returns.source_observation_count
        : kind === "ROLLING_RETURNS_20"
          ? summary.derived.rolling_returns_20.source_observation_count
          : summary.derived.return_distribution.source_observation_count;
      return {
        availability: derivedAvailability,
        source_sample: {
          source_observation_count: sourceCount, emitted_point_count: 0,
          sampling: "NOT_APPLICABLE", envelope: null,
        },
        values: [],
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
    seal?: CurrentSourceSealRow,
  ): Availability {
    if (kind === "EQUITY" || kind === "RETURNS" || kind === "POSITIONS") return available();
    if (seal?.enrichedAnalysis && (kind === "MONTHLY_RETURNS" || kind === "RETURN_DISTRIBUTION")) {
      const source = kind === "MONTHLY_RETURNS" ? seal.enrichedAnalysis.monthly_returns : seal.enrichedAnalysis.return_distribution;
      return { state: source.state, reason_code: source.reason_code };
    }
    const distributions = seal?.distributionsSidecar?.distributions ?? summary.summary_analytics_v2?.distributions;
    if (distributions && (kind === "MONTHLY_RETURNS" || kind === "RETURN_DISTRIBUTION")) {
      const source = kind === "MONTHLY_RETURNS" ? distributions.monthly_returns : distributions.return_distribution;
      return { state: source.state, reason_code: source.reason_code };
    }
    // Immutable older seals used the entire stitched tape, including pre-OOS
    // bars. Preserve their raw rows, but never label those compact facts OOS.
    if (summary.derived_scope !== "OUTER_TEST_UNION_INCLUSIVE_V1") {
      return { state: "NOT_PUBLISHED", reason_code: "PORTAL_DERIVED_SERIES_SCOPE_NOT_OOS" };
    }
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
