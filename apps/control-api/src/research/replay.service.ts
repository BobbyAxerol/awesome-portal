/** P17 route-aware, current-source replay projection and same-origin BFF. */

import { Buffer } from "node:buffer";

import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig, querySigningKeys } from "../config";
import { KeysetCursorCodec, QueryContractError, queryFingerprint } from "../query";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import {
  ResearchEvidenceSeriesKindSchema,
  type ResearchEvidenceHubResponse,
  type ResearchEvidenceSeriesResponse,
} from "./evidence.contract";
import { ResearchEvidenceError } from "./evidence.error";
import {
  CANDLE_OVERVIEW_INCOMPATIBLE,
  ResearchEvidenceService,
  type EvidenceCandleOverview,
} from "./evidence.service";
import {
  ResearchReplayResponseSchema,
  type ResearchReplayReadQuery,
  type ResearchReplayResponse,
} from "./replay.contract";
import { ResearchReplayError } from "./replay.error";
import { sha256ResearchJson } from "./preflight.service";

const PAGE_RESOURCE = "research.replay.equity-window.v1";
const PLAYHEAD_RESOURCE = "research.replay.state-at-cursor.v1";
const RESPONSE_MAX_BYTES = 1_048_576;
/**
 * E16-R1 · the overview rides on the same sealed evidence as the equity
 * samples, so when that evidence is not readable the overview is not either.
 * It keeps its own reason so the screen never implies the run lacked bars.
 */
const RETAINED_CANDLE_OVERVIEW_UNREADABLE = "P13_EVIDENCE_NOT_READABLE_FOR_RETAINED_CANDLE_OVERVIEW";

type Availability = {
  state: "AVAILABLE" | "NOT_PUBLISHED" | "PENDING_SOURCE_CALLBACK" | "LEGACY_METADATA_ONLY" | "NOT_APPLICABLE";
  reason_code: string | null;
};
type SourceGap = { state: "NOT_PUBLISHED" | "NOT_APPLICABLE" | "NOT_ASSERTED"; reason_code: string; availability: Availability };
type EquitySample = { at_utc_ms: number; equity: string; drawdown_fraction: string };

interface PageSelection {
  start: number;
  end: number;
  selectedOrdinal: number | null;
}

function availability(state: Availability["state"], reasonCode: string | null): Availability {
  return { state, reason_code: reasonCode };
}

function notPublished(reasonCode: string): Availability {
  return availability("NOT_PUBLISHED", reasonCode);
}

function gap(state: SourceGap["state"], reasonCode: string, source?: Availability): SourceGap {
  const fallback = state === "NOT_APPLICABLE"
    ? availability("NOT_APPLICABLE", reasonCode)
    : notPublished(reasonCode);
  return { state, reason_code: reasonCode, availability: source ?? fallback };
}

function responseAvailability(value: { state: Availability["state"]; reason_code: string | null }): Availability {
  return { state: value.state, reason_code: value.reason_code };
}

/**
 * P17 is deliberately a reader over P13's sealed source receipt. It does not
 * read Python worker output, artifact paths, raw market data, source DBs or
 * execution systems. A cursor is signed by the Portal's existing keyring and
 * is bound to the exact workspace/run/evidence revision so it cannot become a
 * browser-selectable source query or survive a changed immutable receipt.
 */
@Injectable()
export class ResearchReplayService {
  private readonly cursors: KeysetCursorCodec;

  constructor(
    private readonly evidence: ResearchEvidenceService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {
    this.cursors = new KeysetCursorCodec({
      activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
      keys: querySigningKeys(config),
      ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS,
    });
  }

  async detail(
    scope: ResearchScope,
    runId: string,
    query: ResearchReplayReadQuery,
    signal?: AbortSignal,
  ): Promise<ResearchReplayResponse> {
    this.requireEnabled();
    const { hub, series, candleOverview } = await this.readEvidence(scope, runId, signal);
    const response = this.mapResponse(scope, runId, query, hub, series, candleOverview);
    const parsed = ResearchReplayResponseSchema.safeParse(response);
    if (!parsed.success || Buffer.byteLength(JSON.stringify(response), "utf8") > RESPONSE_MAX_BYTES) {
      throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE", "Replay response is incompatible or exceeds its bounded budget.", 503);
    }
    return parsed.data;
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_REPLAY !== "true") {
      throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE", "Research Replay is not enabled in this deployment.", 503);
    }
  }

  private async readEvidence(
    scope: ResearchScope,
    runId: string,
    signal?: AbortSignal,
  ): Promise<{
    hub: ResearchEvidenceHubResponse;
    series: ResearchEvidenceSeriesResponse;
    candleOverview: EvidenceCandleOverview;
  }> {
    try {
      const bundle = signal
        ? await this.evidence.bundle(scope, runId, [ResearchEvidenceSeriesKindSchema.enum.EQUITY_OOS], signal)
        : await this.evidence.bundle(scope, runId, [ResearchEvidenceSeriesKindSchema.enum.EQUITY_OOS]);
      const hub = bundle.hub;
      const series = bundle.series.get(ResearchEvidenceSeriesKindSchema.enum.EQUITY_OOS);
      if (!series || series.revision !== hub.revision) {
        throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE", "Replay evidence revision is incompatible.", 503);
      }
      return { hub, series, candleOverview: bundle.candleOverview };
    } catch (error) {
      if (error instanceof ResearchReplayError) throw error;
      if (error instanceof ResearchEvidenceError) {
        const code = error.code === "RESEARCH_EVIDENCE_NOT_FOUND"
          ? "RESEARCH_REPLAY_NOT_FOUND"
          : "RESEARCH_REPLAY_UNAVAILABLE";
        const status = error.status === 404 ? 404 : 503;
        throw new ResearchReplayError(
          code,
          status === 404 ? "Research run was not found." : "Replay source is temporarily unavailable.",
          status,
        );
      }
      throw error;
    }
  }

  private mapResponse(
    scope: ResearchScope,
    runId: string,
    query: ResearchReplayReadQuery,
    hub: ResearchEvidenceHubResponse,
    series: ResearchEvidenceSeriesResponse,
    candleOverview: EvidenceCandleOverview,
  ): unknown {
    const sourceAvailability = responseAvailability(series.availability);
    const sourceAdapterId = hub.core.source_adapter_id;
    const sourceIsCurrentP04 = sourceAdapterId === "p04.delta-rsi.v1";
    const sourceReason = (reason: string) => sourceAdapterId === "p17.imported-signal-notional.v1"
      ? reason.replace(/^P04_SOURCE_/, "E17_IMPORTED_SOURCE_") : reason;
    const sourceIsSupported = sourceIsCurrentP04 || sourceAdapterId === "p17.imported-signal-notional.v1";
    const sourceIsAvailable = sourceIsSupported && series.availability.state === "AVAILABLE";
    // A persisted series may be individually available while its adapter is
    // outside this deliberately narrow P17 reader. Do not surface that as an
    // available P17 replay window (or turn it into a 503); return a stable
    // typed compatibility absence instead.
    const compatibilityAvailability = !sourceIsSupported && sourceAvailability.state === "AVAILABLE"
      ? notPublished("P17_SOURCE_ADAPTER_NOT_SUPPORTED")
      : sourceAvailability;
    const samples = sourceIsAvailable ? this.samples(series) : [];
    if (sourceIsAvailable && (!hub.revision || !series.revision)) {
      throw new ResearchReplayError(
        "RESEARCH_REPLAY_UNAVAILABLE",
        "Replay evidence revision is incompatible.",
        503,
      );
    }
    const revision = sourceIsAvailable && hub.revision && series.revision
      ? `p17r1_${sha256ResearchJson({
        p13_hub_revision: hub.revision,
        p13_equity_revision: series.revision,
        source_adapter_id: sourceAdapterId,
        source_transform_digest: hub.core.source_transform_digest,
      })}`
      : null;
    const routeAvailability = sourceIsAvailable
      ? availability("AVAILABLE", null)
      : compatibilityAvailability;
    const routeState = sourceIsAvailable
      ? "RETROSPECTIVE_EQUITY_ONLY" as const
      : sourceAvailability.state === "PENDING_SOURCE_CALLBACK"
        ? "PENDING_SOURCE_CALLBACK" as const
        : sourceAvailability.state === "LEGACY_METADATA_ONLY"
          ? "LEGACY_METADATA_ONLY" as const
          : "NOT_PUBLISHED" as const;
    const replayAvailability = sourceIsAvailable ? availability("AVAILABLE", null) : compatibilityAvailability;
    const executionStateGap = gap(
      "NOT_PUBLISHED",
      sourceReason("P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE_SNAPSHOTS"),
      sourceIsAvailable ? undefined : compatibilityAvailability,
    );
    const sampling = series.source_sample.sampling;
    const sourceObservationCount = series.source_sample.source_observation_count;
    if (
      sourceIsAvailable
      && (
        (sampling !== "FULL" && sampling !== "EXTREMA_BUCKET_V1")
        || !sourceObservationCount
        || sourceObservationCount < samples.length
      )
    ) {
      throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE", "Replay evidence source sampling is incompatible.", 503);
    }
    const replaySampling = sampling === "FULL" || sampling === "EXTREMA_BUCKET_V1" ? sampling : null;
    const window = sourceIsAvailable && revision && replaySampling && sourceObservationCount
      ? this.window(
        scope.workspaceId, runId, revision, query, samples, sourceObservationCount, replaySampling, executionStateGap,
      )
      : this.absentWindow(query.limit, replayAvailability, executionStateGap);
    const hubOverview = hub.core.market_overview;
    const overviewAvailable = sourceIsCurrentP04
      && hubOverview?.state === "AVAILABLE"
      && hubOverview.data !== null;
    const overviewReason = sourceIsCurrentP04
      ? hubOverview?.reason_code ?? "P04_SOURCE_PREDATES_E16_CANDLE_OVERVIEW"
      : sourceIsSupported ? "E17_IMPORTED_SOURCE_DID_NOT_PUBLISH_CANDLE_OVERVIEW" : "P17_SOURCE_ADAPTER_NOT_SUPPORTED";
    const marketOverview = overviewAvailable
      ? {
        state: "AVAILABLE" as const,
        reason_code: null,
        semantics: "BOUNDED_SOURCE_OVERVIEW_NOT_PER_BAR_REPLAY" as const,
        data: hubOverview.data,
        availability: availability("AVAILABLE", null),
      }
      : {
        state: "NOT_PUBLISHED" as const,
        reason_code: overviewReason,
        semantics: "BOUNDED_SOURCE_OVERVIEW_NOT_PER_BAR_REPLAY" as const,
        data: null,
        availability: sourceIsCurrentP04 ? notPublished(overviewReason) : compatibilityAvailability,
      };
    const absenceAvailability = sourceIsAvailable ? undefined : compatibilityAvailability;
    const routeCapabilities = {
      orders: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_ORDER_LEDGER"), absenceAvailability),
      fills: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS"), absenceAvailability),
      trades: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_TRADE_LEDGER"), absenceAvailability),
      positions: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_POSITION_STATE_SNAPSHOTS"), absenceAvailability),
      execution_events: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_EVENT_STREAM"), absenceAvailability),
      candle_windows: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS"), absenceAvailability),
      sl_tp_ambiguity: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_INTRABAR_SL_TP_AMBIGUITY"), absenceAvailability),
      oco_tree: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_OCO_PARENT_CHILD_RELATIONSHIPS"), absenceAvailability),
      multi_leg: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_MULTI_LEG_EXECUTION_FACTS"), absenceAvailability),
      funding: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_FUNDING"), absenceAvailability),
      mae_mfe: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_MAE_MFE_INPUTS"), absenceAvailability),
      fold_capital: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_FOLD_CAPITAL_CONVENTION"), absenceAvailability),
      child_audit_provenance: this.routeGap(sourceReason("P04_SOURCE_DID_NOT_PUBLISH_CHILD_AUDIT_REPLAY_PROVENANCE"), absenceAvailability),
    };
    const sourceAbsences = {
      execution_state: executionStateGap,
      order_ledger: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_ORDER_LEDGER"), absenceAvailability),
      fill_ledger: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_AUDITED_FILLS"), absenceAvailability),
      trade_ledger: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_TRADE_LEDGER"), absenceAvailability),
      position_snapshots: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_POSITION_STATE_SNAPSHOTS"), absenceAvailability),
      event_stream: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_EXECUTION_EVENT_STREAM"), absenceAvailability),
      candles: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS"), absenceAvailability),
      sl_tp_ambiguity: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_INTRABAR_SL_TP_AMBIGUITY"), absenceAvailability),
      oco_tree: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_OCO_PARENT_CHILD_RELATIONSHIPS"), absenceAvailability),
      multi_leg: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_MULTI_LEG_EXECUTION_FACTS"), absenceAvailability),
      funding: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_FUNDING"), absenceAvailability),
      mae_mfe: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_MAE_MFE_INPUTS"), absenceAvailability),
      fold_capital: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_FOLD_CAPITAL_CONVENTION"), absenceAvailability),
      child_audit_provenance: gap("NOT_PUBLISHED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_CHILD_AUDIT_REPLAY_PROVENANCE"), absenceAvailability),
      cross_stream_order: gap("NOT_ASSERTED", sourceReason("P04_SOURCE_DID_NOT_PUBLISH_CROSS_STREAM_EXECUTION_ORDER"), absenceAvailability),
    };
    return {
      schema_version: "research.replay.v1",
      read_authority: "PORTAL_PERSISTED_RESEARCH",
      run_id: runId,
      revision,
      etag: revision ? `"${revision}"` : null,
      availability: routeAvailability,
      readiness: sourceIsAvailable ? "PARTIAL" : "NOT_READY",
      as_of_utc_ms: hub.as_of_utc_ms,
      provenance: {
        source_adapter_id: sourceAdapterId,
        evidence_revision: hub.revision,
        source_transform_digest: hub.core.source_transform_digest,
        input_scope: hub.core.input_scope,
      },
      route: {
        id: sourceIsSupported ? "signal_notional" : null,
        state: routeState,
        replay_contract: sourceIsAvailable ? (sourceIsCurrentP04 ? "P17_CURRENT_P04_EQUITY_SAMPLE_V1" : "P17_IMPORTED_FIXED_EQUITY_SAMPLE_V1") : null,
        availability: routeAvailability,
      },
      equity_replay: window,
      market_overview: marketOverview,
      candle_overview: this.candleOverview(candleOverview, sourceIsAvailable, compatibilityAvailability),
      route_capabilities: routeCapabilities,
      source_absences: sourceAbsences,
    };
  }

  /**
   * E16-R1.  The overview is served verbatim from the sealed P13 projection:
   * this reader never re-buckets, never interpolates and never fills a gap.
   * A run whose child did not retain one keeps its own reason code — there is
   * nothing to backfill, because the producer deleted its tape.
   */
  private candleOverview(
    overview: EvidenceCandleOverview,
    sourceIsAvailable: boolean,
    compatibilityAvailability: Availability,
  ) {
    const absent = (reasonCode: string) => ({
      state: "NOT_PUBLISHED" as const,
      reason_code: reasonCode,
      scope: null,
      source_bar_count: null,
      emitted_bucket_count: null,
      bucket_bars: null,
      sampling: null,
      envelope: null,
      values: [],
      availability: sourceIsAvailable ? notPublished(reasonCode) : compatibilityAvailability,
    });
    if (!sourceIsAvailable) return absent(RETAINED_CANDLE_OVERVIEW_UNREADABLE);
    // Fail closed as a typed absence, never as an untyped 500: an evidence
    // reader that published no overview field at all is the same kind of
    // unreadable as a stored block this contract can no longer validate.
    if (!overview) return absent(CANDLE_OVERVIEW_INCOMPATIBLE);
    if (overview.state !== "AVAILABLE") return absent(overview.reason_code);
    const value = overview.value;
    return {
      state: "AVAILABLE" as const,
      reason_code: null,
      scope: value.scope,
      source_bar_count: value.source_bar_count,
      emitted_bucket_count: value.emitted_bucket_count,
      bucket_bars: value.bucket_bars,
      sampling: value.sampling,
      envelope: value.envelope,
      values: value.values,
      availability: availability("AVAILABLE", null),
    };
  }

  private samples(series: ResearchEvidenceSeriesResponse): EquitySample[] {
    if (series.kind !== "EQUITY_OOS" || series.availability.state !== "AVAILABLE") {
      throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE", "Replay evidence is incompatible.", 503);
    }
    const samples = series.values.map((value) => {
      if (!("at_utc_ms" in value) || !("equity" in value) || !("drawdown_fraction" in value)) {
        throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE", "Replay evidence is incompatible.", 503);
      }
      return {
        at_utc_ms: value.at_utc_ms,
        equity: value.equity,
        drawdown_fraction: value.drawdown_fraction,
      };
    });
    if (samples.length === 0 || samples.length > 192) {
      throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE", "Replay evidence is incompatible.", 503);
    }
    for (let index = 1; index < samples.length; index += 1) {
      if (samples[index]!.at_utc_ms <= samples[index - 1]!.at_utc_ms) {
        throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE", "Replay evidence chronology is incompatible.", 503);
      }
    }
    return samples;
  }

  private window(
    workspaceId: string,
    runId: string,
    revision: string,
    query: ResearchReplayReadQuery,
    samples: readonly EquitySample[],
    sourceObservationCount: number,
    sampling: "FULL" | "EXTREMA_BUCKET_V1",
    executionStateGap: SourceGap,
  ) {
    const selection = this.selection(workspaceId, runId, revision, query, samples.length);
    const pageResource = `${PAGE_RESOURCE}:${runId}:${revision}`;
    const pageFingerprint = queryFingerprint({ resourceId: pageResource, limit: query.limit, filters: [], sort: [] });
    const items = samples.slice(selection.start, selection.end).map((sample, index) => {
      const ordinal = selection.start + index;
      return {
        playback_ordinal: ordinal,
        at_utc_ms: sample.at_utc_ms,
        equity: sample.equity,
        drawdown_fraction: sample.drawdown_fraction,
        playback_cursor: this.encodePlayhead(workspaceId, runId, revision, ordinal),
      };
    });
    const selected = selection.selectedOrdinal === null ? null : samples[selection.selectedOrdinal]!;
    return {
      state: "AVAILABLE" as const,
      source_observation_count: sourceObservationCount,
      emitted_point_count: samples.length,
      sampling,
      items,
      page: {
        limit: query.limit,
        next_cursor: selection.end < samples.length
          ? this.encodePage(workspaceId, pageResource, pageFingerprint, "after", selection.end - 1)
          : null,
        prev_cursor: selection.start > 0
          ? this.encodePage(workspaceId, pageResource, pageFingerprint, "before", selection.start)
          : null,
        has_more: selection.end < samples.length,
        has_previous: selection.start > 0,
        order: "SOURCE_CHRONOLOGICAL_SAMPLE_ORDINAL_ASC" as const,
      },
      state_at_cursor: selected
        ? {
          state: "AVAILABLE_RETROSPECTIVE_EQUITY_SAMPLE" as const,
          semantics: "RETROSPECTIVE_EQUITY_NOT_EXECUTION_STATE" as const,
          playback_ordinal: selection.selectedOrdinal,
          at_utc_ms: selected.at_utc_ms,
          equity: selected.equity,
          drawdown_fraction: selected.drawdown_fraction,
          source_sampling: sampling,
          execution_state: executionStateGap,
          availability: availability("AVAILABLE", null),
        }
        : {
          state: "NOT_SELECTED" as const,
          semantics: "NO_SELECTED_PLAYHEAD" as const,
          playback_ordinal: null,
          at_utc_ms: null,
          equity: null,
          drawdown_fraction: null,
          source_sampling: null,
          execution_state: executionStateGap,
          availability: availability("AVAILABLE", null),
        },
      availability: availability("AVAILABLE", null),
    };
  }

  private absentWindow(limit: number, sourceAvailability: Availability, executionStateGap: SourceGap) {
    if (sourceAvailability.state === "AVAILABLE") {
      throw new ResearchReplayError("RESEARCH_REPLAY_UNAVAILABLE", "Replay evidence availability is incompatible.", 503);
    }
    return {
      state: "NOT_PUBLISHED" as const,
      source_observation_count: null,
      emitted_point_count: null,
      sampling: null,
      items: [],
      page: {
        limit,
        next_cursor: null,
        prev_cursor: null,
        has_more: false,
        has_previous: false,
        order: "SOURCE_CHRONOLOGICAL_SAMPLE_ORDINAL_ASC" as const,
      },
      state_at_cursor: {
        state: "NOT_PUBLISHED" as const,
        semantics: "SOURCE_DID_NOT_PUBLISH_EXECUTION_STATE" as const,
        playback_ordinal: null,
        at_utc_ms: null,
        equity: null,
        drawdown_fraction: null,
        source_sampling: null,
        execution_state: executionStateGap,
        availability: sourceAvailability,
      },
      availability: sourceAvailability,
    };
  }

  private selection(
    workspaceId: string,
    runId: string,
    revision: string,
    query: ResearchReplayReadQuery,
    count: number,
  ): PageSelection {
    if (query.at_ordinal !== undefined) {
      this.assertOrdinal(query.at_ordinal, count);
      const half = Math.floor(query.limit / 2);
      const start = Math.max(0, Math.min(query.at_ordinal - half, Math.max(0, count - query.limit)));
      return { start, end: Math.min(count, start + query.limit), selectedOrdinal: query.at_ordinal };
    }
    if (query.at) {
      const ordinal = this.decodePlayhead(workspaceId, runId, revision, query.at);
      this.assertOrdinal(ordinal, count);
      const half = Math.floor(query.limit / 2);
      const start = Math.max(0, Math.min(ordinal - half, Math.max(0, count - query.limit)));
      return { start, end: Math.min(count, start + query.limit), selectedOrdinal: ordinal };
    }
    if (query.cursor || query.before) {
      const direction = query.cursor ? "after" : "before";
      const pageResource = `${PAGE_RESOURCE}:${runId}:${revision}`;
      const fingerprint = queryFingerprint({ resourceId: pageResource, limit: query.limit, filters: [], sort: [] });
      const ordinal = this.decodePage(workspaceId, pageResource, fingerprint, direction, query.cursor ?? query.before!);
      this.assertOrdinal(ordinal, count);
      if (direction === "after") {
        const start = ordinal + 1;
        return { start, end: Math.min(count, start + query.limit), selectedOrdinal: null };
      }
      const end = ordinal;
      return { start: Math.max(0, end - query.limit), end, selectedOrdinal: null };
    }
    return { start: 0, end: Math.min(count, query.limit), selectedOrdinal: null };
  }

  private assertOrdinal(ordinal: number, count: number): void {
    if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= count) {
      throw new ResearchReplayError("RESEARCH_REPLAY_CURSOR_INVALID", "Replay cursor is invalid for this immutable evidence revision.", 400);
    }
  }

  private decodePage(
    workspaceId: string,
    resourceId: string,
    fingerprint: string,
    direction: "after" | "before",
    token: string,
  ): number {
    try {
      const values = this.cursors.decode(token, {
        resourceId,
        workspaceId,
        direction,
        queryFingerprint: fingerprint,
        boundarySize: 1,
      });
      const [ordinal] = values;
      if (typeof ordinal !== "number") throw new Error("invalid replay page cursor");
      return ordinal;
    } catch (error) {
      if (error instanceof ResearchReplayError) throw error;
      throw this.cursorError(error);
    }
  }

  private encodePage(
    workspaceId: string,
    resourceId: string,
    fingerprint: string,
    direction: "after" | "before",
    ordinal: number,
  ): string {
    return this.cursors.encode({
      resource_id: resourceId,
      workspace_id: workspaceId,
      direction,
      query_fingerprint: fingerprint,
      boundary: [ordinal],
    });
  }

  private decodePlayhead(workspaceId: string, runId: string, revision: string, token: string): number {
    const resourceId = `${PLAYHEAD_RESOURCE}:${runId}:${revision}`;
    const fingerprint = queryFingerprint({ resourceId, limit: 1, filters: [], sort: [] });
    try {
      const values = this.cursors.decode(token, {
        resourceId,
        workspaceId,
        direction: "after",
        queryFingerprint: fingerprint,
        boundarySize: 1,
      });
      const [ordinal] = values;
      if (typeof ordinal !== "number") throw new Error("invalid replay playhead cursor");
      return ordinal;
    } catch (error) {
      throw this.cursorError(error);
    }
  }

  private encodePlayhead(workspaceId: string, runId: string, revision: string, ordinal: number): string {
    const resourceId = `${PLAYHEAD_RESOURCE}:${runId}:${revision}`;
    const fingerprint = queryFingerprint({ resourceId, limit: 1, filters: [], sort: [] });
    return this.cursors.encode({
      resource_id: resourceId,
      workspace_id: workspaceId,
      direction: "after",
      query_fingerprint: fingerprint,
      boundary: [ordinal],
    });
  }

  private cursorError(error: unknown): ResearchReplayError {
    if (error instanceof QueryContractError && error.code === "CURSOR_EXPIRED") {
      return new ResearchReplayError(
        "RESEARCH_REPLAY_CURSOR_EXPIRED",
        "Replay cursor expired; discard it and refetch the canonical page or use at_ordinal.",
        409,
      );
    }
    return new ResearchReplayError(
      "RESEARCH_REPLAY_CURSOR_INVALID",
      "Replay cursor is invalid for this workspace, run, revision or window.",
      400,
    );
  }

  private routeGap(reasonCode: string, unavailable?: Availability) {
    const fieldAvailability = unavailable ?? notPublished(reasonCode);
    return {
      state: "NOT_PUBLISHED" as const,
      // The field reason remains stable even if the parent evidence reader is
      // temporarily unavailable. Consumers can therefore distinguish a
      // genuine source capability gap from the reader's current availability.
      reason_code: reasonCode,
      availability: fieldAvailability,
    };
  }
}
