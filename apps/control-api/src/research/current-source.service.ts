/** RS-02 retained-current-source named BFF projection service. */

import { Buffer } from "node:buffer";
import { Inject, Injectable } from "@nestjs/common";
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
  ResearchCurrentSourceReplayTransitionsResponseSchema,
  ResearchCurrentSourceReplayChildAuditResponseSchema,
  ResearchCurrentSourceSearchResponseSchema,
  ResearchCurrentSourceSplitResponseSchema,
  ResearchCurrentSourceNotApplicableResponseSchema,
  type ResearchCurrentSourceNotApplicableResponse,
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
  type CurrentSourceFacts,
  type CurrentSourceReplaySummary,
} from "./current-source.payload";
import { P04_FIXED_QUALIFICATION_PROFILE_ID, RS02_DELTA_WFO_GLOBAL_PROFILE_ID } from "./delta-wfo.profile";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST } from "./p04-delta.binding";
import { sha256ResearchJson } from "./preflight.service";

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
    const value = {
      schema_version: "research.current-source-freeze.v1" as const,
      ...this.common("freeze", seal),
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
    assertDenseWindow(page.rows, seal.tableRows.OBSERVATION);
    const selectedOrdinal = this.selectedOrdinal(scope.workspaceId, runId, currentRevision, "OBSERVATION", query);
    const selected = selectedOrdinal === null ? null : page.rows.find((row) => row.sourceOrdinal === selectedOrdinal) ?? null;
    const selectedObservation = selected ? asObservation(selected) : null;
    const summary = parseSummary(seal);
    const ledger = summary.replay ?? null;
    const value = {
      schema_version: "research.current-source-replay.v1" as const,
      ...this.common("replay", seal),
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
      execution: this.replayExecution(scope.workspaceId, runId, currentRevision, ledger, summary.source_facts ?? null),
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
    const common = { ...this.common("replay", seal) };
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
        segments: (ledger?.fold_segments ?? []).map((segment) => ({
          ...segment,
          start_cursor: this.playbackCursor(workspaceId, runId, currentRevision, "OBSERVATION", segment.first_ordinal),
        })),
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
