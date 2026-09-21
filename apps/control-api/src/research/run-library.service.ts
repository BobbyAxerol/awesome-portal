/** P12 server-side mapping from persisted Research rows to Screen-01 DTOs. */

import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig, querySigningKeys } from "../config";
import { KeysetCursorCodec, QueryContractError, queryFingerprint } from "../query";
import type { AppliedSort, NormalizedFilter } from "../query/contracts";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchProgressSnapshotSchema, type ResearchProgressSnapshot } from "./progress.contract";
import { ResearchRequestedSpecSchema, type ResearchRequestedSpec } from "./preflight.contract";
import {
  ResearchRunIdSchema,
  ResearchRunLibraryItemSchema,
  ResearchRunLibraryResponseSchema,
  ResearchRunLibrarySparklineResponseSchema,
  type ResearchRunLibraryItem,
  type ResearchRunLibraryQuery,
  type ResearchRunLibraryResponse,
} from "./run-library.contract";
import { ResearchRunLibraryError } from "./run-library.error";
import {
  type RunLibraryBoundary,
  type RunLibraryRow,
  ResearchRunLibraryRepository,
} from "./run-library.repository";
import type { ResearchScope } from "./contracts";

const RESOURCE_ID = "research.run-library.v1";
const ORDER: readonly AppliedSort[] = [
  { field: "created_at", direction: "desc" },
  { field: "run_id", direction: "desc" },
];

const STATUSES = new Set([
  "COMPLETED", "RUNNING", "FAILED", "QUEUED", "DRAFT", "CANCELLED", "RECOVERY_REQUIRED",
]);

type AvailabilityState = "AVAILABLE" | "NOT_PUBLISHED" | "LEGACY_METADATA_ONLY" | "PENDING_SOURCE_CALLBACK";
type Availability = { state: AvailabilityState; reason_code: string | null };

function available(): Availability {
  return { state: "AVAILABLE", reason_code: null };
}

function unavailable(state: Exclude<AvailabilityState, "AVAILABLE">, reason: string): Availability {
  return { state, reason_code: reason };
}

function asObject(value: Record<string, unknown> | string | null): Record<string, unknown> | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function utcMs(value: Date, label: string): number {
  const numeric = value.getTime();
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new ResearchRunLibraryError("RESEARCH_RUN_LIBRARY_UNAVAILABLE", `Run Library ${label} is invalid.`, 503);
  }
  return numeric;
}

function positiveOrdinal(value: string | number | null): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 1);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : 1;
}

function sourceActual(progress: ResearchProgressSnapshot | null): boolean {
  return progress?.source.coverage === "ACTUAL_HOOKS";
}

function sourceAvailability(
  row: Pick<RunLibraryRow, "source_kind" | "effective_status">,
  progress: ResearchProgressSnapshot | null,
): Availability {
  if (row.source_kind === "LEGACY_1_0_8_METADATA") {
    return unavailable("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_DOES_NOT_PUBLISH_PROGRESS");
  }
  if (!progress) {
    return unavailable(
      row.effective_status === "RUNNING" || row.effective_status === "QUEUED"
        ? "PENDING_SOURCE_CALLBACK"
        : "NOT_PUBLISHED",
      row.effective_status === "RUNNING" || row.effective_status === "QUEUED"
        ? "P11_PROGRESS_CALLBACK_NOT_YET_MATERIALIZED"
        : "P11_PROGRESS_SNAPSHOT_NOT_PUBLISHED",
    );
  }
  if (!sourceActual(progress)) {
    return unavailable("PENDING_SOURCE_CALLBACK", "P11_SOURCE_COVERAGE_PENDING_CALLBACK");
  }
  return available();
}

function safeStatus(value: string): ResearchRunLibraryItem["status"] {
  return STATUSES.has(value) ? value as ResearchRunLibraryItem["status"] : "RECOVERY_REQUIRED";
}

function safeRelationship(row: RunLibraryRow): ResearchRunLibraryItem["relationship"]["kind"] {
  const known = new Set<ResearchRunLibraryItem["relationship"]["kind"]>([
    "PRIMARY", "AUDIT_OF_SELECTION", "DIAGNOSTIC_OF_RUN", "REPRODUCTION_OF_RUN",
    "EXPORT_OF_RUN", "VERIFY_OF_RUN", "PROJECTION_OF_RUN", "LEGACY_UNKNOWN",
  ]);
  return known.has(row.relationship_kind as ResearchRunLibraryItem["relationship"]["kind"])
    ? row.relationship_kind as ResearchRunLibraryItem["relationship"]["kind"]
    : "LEGACY_UNKNOWN";
}

function rowKind(row: RunLibraryRow): ResearchRunLibraryItem["row_kind"] {
  if (row.source_kind === "LEGACY_1_0_8_METADATA") return "LEGACY_RUN";
  switch (row.run_kind) {
    case "PRIMARY": return "LOGICAL_RUN";
    case "AUDIT": return "AUDIT_CHILD";
    case "REPRODUCTION": return "REPRODUCTION_CHILD";
    default: return "WORKER_CHILD";
  }
}

function canonicalComparisonKey(row: RunLibraryRow, spec: ResearchRequestedSpec | null): string | null {
  if (!spec || !spec.alpha_binding || !row.alpha_version_id || row.alpha_id === null) return null;
  // The browser compares an opaque, server-defined compatibility key.  It
  // cannot manufacture "same alpha" eligibility by comparing labels or
  // hashes itself; any future change here gets a versioned server contract.
  const canonical = JSON.stringify({
    alpha_id: row.alpha_id,
    alpha_version_id: row.alpha_version_id,
    strategy_id: spec.strategy_id,
    symbol: spec.data.symbol,
    timeframe: spec.data.timeframe,
    execution_route: spec.execution_route,
    protocol: spec.protocol,
  });
  return `rck1_${createHash("sha256").update(canonical, "utf8").digest("base64url")}`;
}

function filtersFor(query: ResearchRunLibraryQuery): NormalizedFilter[] {
  const values: NormalizedFilter[] = [];
  if (query.q) values.push({ field: "q", op: "contains", value: query.q, values: [query.q] });
  if (query.status.length > 0) values.push({ field: "status", op: "in", value: query.status.join(","), values: query.status });
  if (query.mode.length > 0) values.push({ field: "mode", op: "in", value: query.mode.join(","), values: query.mode });
  if (query.alpha.length > 0) values.push({ field: "alpha", op: "in", value: query.alpha.join(","), values: query.alpha });
  if (query.ids.length > 0) values.push({ field: "ids", op: "in", value: query.ids.join(","), values: query.ids });
  return values;
}

/**
 * P12 exposes no raw progress/event field through this reader.  The named
 * Screen-01 DTO stays valid when P11 is dark or a historical row predates it.
 */
@Injectable()
export class ResearchRunLibraryService {
  private readonly cursors: KeysetCursorCodec;

  constructor(
    private readonly repository: ResearchRunLibraryRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {
    this.cursors = new KeysetCursorCodec({
      activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
      keys: querySigningKeys(config),
      ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS,
    });
  }

  async list(scope: ResearchScope, query: ResearchRunLibraryQuery): Promise<ResearchRunLibraryResponse> {
    this.requireEnabled();
    const fingerprint = queryFingerprint({
      resourceId: RESOURCE_ID,
      limit: query.limit,
      filters: filtersFor(query),
      sort: ORDER,
    });
    const boundary = this.decodeBoundary(query, scope.workspaceId, fingerprint);
    const page = await this.repository.list(scope, query, boundary);
    const items = page.rows.map((row) => this.mapRow(row));
    const first = page.rows[0];
    const last = page.rows[page.rows.length - 1];
    const response = {
      schema_version: "research.run-library.v1" as const,
      read_authority: "PORTAL_PERSISTED_RESEARCH" as const,
      items,
      page: {
        limit: query.limit,
        total_rows: page.totalRows,
        filtered_rows: page.filteredRows,
        next_cursor: page.hasMore && last
          ? this.encodeBoundary(scope.workspaceId, "after", fingerprint, last)
          : null,
        prev_cursor: page.hasPrevious && first
          ? this.encodeBoundary(scope.workspaceId, "before", fingerprint, first)
          : null,
        has_more: page.hasMore,
        has_previous: page.hasPrevious,
        order: "CREATED_AT_DESC_RUN_ID_DESC" as const,
      },
      counters: {
        logical_runs: page.counters.logicalRuns,
        worker_children: page.counters.workerChildren,
        technical_retries: page.counters.technicalRetries,
        legacy_metadata_rows: page.counters.legacyMetadataRows,
      },
      claim_ledger: {
        issued: page.claimLedger.issued,
        not_issued: page.claimLedger.notIssued,
        pending_source: page.claimLedger.pendingSource,
        failed: page.claimLedger.failed,
      },
      filter_catalog: {
        alphas: page.filterCatalog.alphas.map((alpha) => ({
          alpha_id: alpha.alphaId,
          alpha_name: alpha.alphaName,
        })),
        modes: page.filterCatalog.modes,
        scratch_available: page.filterCatalog.scratchAvailable,
      },
      // The repository supplies the database transaction timestamp shared by
      // the page, totals, facets and counters.  Do not substitute the API
      // host clock: callers use this as provenance, not a render timestamp.
      as_of_utc_ms: page.asOfUtcMs,
    };
    const parsed = ResearchRunLibraryResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchRunLibraryError(
        "RESEARCH_RUN_LIBRARY_UNAVAILABLE",
        "Run Library could not form a compatible persisted response.",
        503,
      );
    }
    return parsed.data;
  }

  async sparkline(scope: ResearchScope, runId: string) {
    this.requireEnabled();
    if (!ResearchRunIdSchema.safeParse(runId).success) {
      throw new ResearchRunLibraryError("RESEARCH_RUN_LIBRARY_INVALID", "Invalid Research run identifier.", 400);
    }
    const row = await this.repository.findSparklineSource(scope, runId);
    if (!row) {
      throw new ResearchRunLibraryError("RESEARCH_RUN_LIBRARY_NOT_FOUND", "Research run was not found.", 404);
    }
    const progress = this.progress(row.progress_snapshot);
    const availability = row.source_kind === "LEGACY_1_0_8_METADATA"
      ? unavailable("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_DOES_NOT_PUBLISH_SPARKLINE_SERIES")
      : progress && sourceActual(progress)
        ? unavailable("NOT_PUBLISHED", "P12_DOES_NOT_READ_ARTIFACT_OR_PARQUET_SERIES")
        : sourceAvailability(row, progress);
    const sequence = typeof row.source_latest_sequence === "number"
      ? row.source_latest_sequence
      : Number(row.source_latest_sequence);
    const response = {
      schema_version: "research.run-sparkline.v1" as const,
      run_id: row.run_id,
      values: [],
      availability,
      source_revision: Number.isSafeInteger(sequence) && sequence >= 0 ? `p11-seq-${sequence}` : null,
    };
    const parsed = ResearchRunLibrarySparklineResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchRunLibraryError("RESEARCH_RUN_LIBRARY_UNAVAILABLE", "Run sparkline response is incompatible.", 503);
    }
    return parsed.data;
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_RUN_LIBRARY !== "true") {
      throw new ResearchRunLibraryError(
        "RESEARCH_RUN_LIBRARY_UNAVAILABLE",
        "Research Run Library is not enabled in this deployment.",
        503,
      );
    }
  }

  private decodeBoundary(
    query: ResearchRunLibraryQuery,
    workspaceId: string,
    fingerprint: string,
  ): RunLibraryBoundary | null {
    const token = query.cursor ?? query.before;
    if (!token) return null;
    const direction = query.cursor ? "after" : "before";
    try {
      const values = this.cursors.decode(token, {
        resourceId: RESOURCE_ID,
        workspaceId,
        direction,
        queryFingerprint: fingerprint,
        boundarySize: 2,
      });
      const [timestamp, runId] = values;
      if (typeof timestamp !== "string" || typeof runId !== "string" || !ResearchRunIdSchema.safeParse(runId).success) {
        throw new Error("invalid cursor boundary");
      }
      const createdAt = new Date(timestamp);
      if (!Number.isSafeInteger(createdAt.getTime()) || createdAt.toISOString() !== timestamp) {
        throw new Error("invalid cursor timestamp");
      }
      return { createdAt, runId, direction };
    } catch (error) {
      if (error instanceof ResearchRunLibraryError) throw error;
      const message = error instanceof QueryContractError && error.code === "CURSOR_EXPIRED"
        ? "Run Library cursor expired; reload the current library page."
        : "Run Library cursor is invalid for this workspace, filter or sort.";
      throw new ResearchRunLibraryError("RESEARCH_RUN_LIBRARY_CURSOR_INVALID", message, 400);
    }
  }

  private encodeBoundary(
    workspaceId: string,
    direction: "after" | "before",
    fingerprint: string,
    row: RunLibraryRow,
  ): string {
    return this.cursors.encode({
      resource_id: RESOURCE_ID,
      workspace_id: workspaceId,
      direction,
      query_fingerprint: fingerprint,
      boundary: [row.created_at.toISOString(), row.run_id],
    });
  }

  private mapRow(row: RunLibraryRow): ResearchRunLibraryItem {
    const requested = this.requestedSpec(row.requested_spec);
    const progress = this.progress(row.progress_snapshot);
    const source = sourceAvailability(row, progress);
    const legacy = asObject(row.legacy_request);
    const binding = this.binding(row);
    const comparisonKey = canonicalComparisonKey(row, requested);
    const currentOrdinal = positiveOrdinal(row.current_worker_ordinal);
    const sourceUpdated = row.progress_received_at ?? row.updated_at;
    const status = safeStatus(row.effective_status);
    const item = {
      run_id: row.run_id,
      attempt_id: row.attempt_id,
      source_kind: row.source_kind,
      row_kind: rowKind(row),
      relationship: {
        kind: safeRelationship(row),
        logical_run_key: row.logical_run_key,
        parent_run_id: row.parent_run_id,
        technical_retry_count: Math.max(0, currentOrdinal - 1),
      },
      status,
      mode: this.mode(row, requested, legacy),
      strategy_id: this.strategy(row, requested, legacy),
      binding,
      binding_availability: binding ? available() : row.alpha_filter_key === "scratch"
        ? available()
        : unavailable("NOT_PUBLISHED", "ALPHA_BINDING_NOT_PUBLISHED"),
      rc: null,
      instrument: this.instrument(row, requested),
      created_at_utc_ms: utcMs(row.created_at, "created timestamp"),
      certificate: this.certificate(progress, source),
      claim: this.claim(progress, source),
      stages: this.stages(progress, source),
      stats: this.stats(row, progress, source),
      superseded_note: currentOrdinal > 1 && row.source_kind === "RESEARCH_DURABLE"
        ? `Technical worker retry ${currentOrdinal} of the same durable job; it is not another logical research run.`
        : null,
      comparison: comparisonKey
        ? { key: comparisonKey, availability: available() }
        : { key: null, availability: unavailable(
          row.source_kind === "LEGACY_1_0_8_METADATA" ? "LEGACY_METADATA_ONLY" : "NOT_PUBLISHED",
          row.source_kind === "LEGACY_1_0_8_METADATA"
            ? "LEGACY_1_0_8_DOES_NOT_PUBLISH_COMPARISON_COMPATIBILITY"
            : "P12_COMPARE_KEY_REQUIRES_PERSISTED_ALPHA_AND_REQUESTED_SPEC",
        ) },
      sparkline: {
        // A queued/draft/cancelled/recovery row has no equity or search curve
        // fact.  `null` keeps the existing card layout without labelling an
        // unavailable placeholder as OOS equity.
        kind: status === "RUNNING"
          ? "search_progress"
          : status === "FAILED" ? "failed" : status === "COMPLETED" ? "oos_equity" : null,
        availability: row.source_kind === "LEGACY_1_0_8_METADATA"
          ? unavailable("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_DOES_NOT_PUBLISH_SPARKLINE_SERIES")
          : unavailable("NOT_PUBLISHED", "P12_DOES_NOT_READ_ARTIFACT_OR_PARQUET_SERIES"),
      },
      source_updated_at_utc_ms: utcMs(sourceUpdated, "source update timestamp"),
    };
    const parsed = ResearchRunLibraryItemSchema.safeParse(item);
    if (!parsed.success) {
      throw new ResearchRunLibraryError("RESEARCH_RUN_LIBRARY_UNAVAILABLE", "Persisted Run Library row is incompatible.", 503);
    }
    return parsed.data;
  }

  private requestedSpec(value: RunLibraryRow["requested_spec"]): ResearchRequestedSpec | null {
    const raw = asObject(value);
    const parsed = raw ? ResearchRequestedSpecSchema.safeParse(raw) : null;
    return parsed?.success ? parsed.data : null;
  }

  private progress(value: RunLibraryRow["progress_snapshot"]): ResearchProgressSnapshot | null {
    const raw = asObject(value);
    const parsed = raw ? ResearchProgressSnapshotSchema.safeParse(raw) : null;
    return parsed?.success ? parsed.data : null;
  }

  private binding(row: RunLibraryRow): ResearchRunLibraryItem["binding"] {
    if (!row.alpha_id || !row.alpha_name || !row.alpha_version_id || !row.alpha_version_label || !row.alpha_code_digest) {
      return null;
    }
    if (!/^[a-z][a-z0-9-]{2,63}$/.test(row.alpha_id) || !/^[0-9a-f]{64}$/.test(row.alpha_code_digest)) {
      return null;
    }
    return {
      alpha_id: row.alpha_id,
      alpha_name: row.alpha_name,
      alpha_version_id: row.alpha_version_id,
      av: row.alpha_version_label,
      digest: row.alpha_code_digest,
    };
  }

  private mode(
    row: RunLibraryRow,
    spec: ResearchRequestedSpec | null,
    legacy: Record<string, unknown> | null,
  ): ResearchRunLibraryItem["mode"] {
    if (spec) {
      return { display: `${spec.optimization_mode} · ${spec.protocol}`, key: spec.optimization_mode, availability: available() };
    }
    const protocol = typeof legacy?.protocol === "string" ? legacy.protocol : row.mode_key;
    if (protocol) {
      return {
        display: protocol,
        key: protocol,
        availability: unavailable("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_PROTOCOL_METADATA_ONLY"),
      };
    }
    return { display: null, key: null, availability: sourceAvailability(row, null) };
  }

  private strategy(
    row: RunLibraryRow,
    spec: ResearchRequestedSpec | null,
    legacy: Record<string, unknown> | null,
  ): ResearchRunLibraryItem["strategy_id"] {
    if (spec) return { value: spec.strategy_id, availability: available() };
    const strategy = typeof legacy?.strategy_id === "string" ? legacy.strategy_id : null;
    if (strategy) return { value: strategy, availability: unavailable("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_STRATEGY_METADATA_ONLY") };
    return { value: null, availability: sourceAvailability(row, null) };
  }

  private instrument(row: RunLibraryRow, spec: ResearchRequestedSpec | null): ResearchRunLibraryItem["instrument"] {
    if (spec) return { display: `${spec.data.symbol} · ${spec.data.timeframe}`, availability: available() };
    return {
      display: null,
      availability: unavailable(
        row.source_kind === "LEGACY_1_0_8_METADATA" ? "LEGACY_METADATA_ONLY" : "NOT_PUBLISHED",
        row.source_kind === "LEGACY_1_0_8_METADATA"
          ? "LEGACY_DATASET_ID_DOES_NOT_DECLARE_SYMBOL_TIMEFRAME"
          : "REQUESTED_SPEC_DOES_NOT_PARSE_AS_RESEARCH_REQUESTED_SPEC_V1",
      ),
    };
  }

  private certificate(progress: ResearchProgressSnapshot | null, source: Availability): ResearchRunLibraryItem["certificate"] {
    const certificate = progress?.claim.methodology_certificate;
    if (source.state === "AVAILABLE" && certificate?.state === "ISSUED" && certificate.grade) {
      return { grade: certificate.grade, availability: available() };
    }
    return {
      grade: null,
      availability: source.state === "AVAILABLE"
        ? unavailable("NOT_PUBLISHED", certificate?.reason_code ?? "SOURCE_METHODOLOGY_CERTIFICATE_NOT_ISSUED")
        : source,
    };
  }

  private claim(progress: ResearchProgressSnapshot | null, source: Availability): ResearchRunLibraryItem["claim"] {
    if (source.state === "AVAILABLE" && progress?.claim.state === "ISSUED") {
      return { text: progress.claim.text, availability: available() };
    }
    return {
      text: null,
      availability: source.state === "AVAILABLE"
        ? unavailable("NOT_PUBLISHED", "SOURCE_CLAIM_NOT_ISSUED")
        : source,
    };
  }

  private stages(progress: ResearchProgressSnapshot | null, source: Availability): ResearchRunLibraryItem["stages"] {
    const sourceStages = new Map(progress?.stages.map((stage) => [stage.key, stage]) ?? []);
    return ["S1", "S2", "S3", "S4", "S5"].map((key) => {
      const stage = sourceStages.get(key as "S1" | "S2" | "S3" | "S4" | "S5");
      if (stage && source.state === "AVAILABLE") {
        return {
          key,
          // P11 only publishes PENDING/RUNNING/DONE at the stage level.  A
          // run-level failure must not be projected onto an individual stage
          // as a fabricated `blocked` fact.
          state: stage.state === "DONE" ? "done" : stage.state === "RUNNING" ? "run" : "pend",
          tip: `Persisted ${key} state: ${stage.state}.`,
          tooltip_source: "DERIVED_FROM_PERSISTED_STATE" as const,
          availability: available(),
        };
      }
      return {
        key,
        state: "pend" as const,
        tip: null,
        tooltip_source: "NOT_PUBLISHED" as const,
        availability: source,
      };
    }) as ResearchRunLibraryItem["stages"];
  }

  private stats(
    row: RunLibraryRow,
    progress: ResearchProgressSnapshot | null,
    source: Availability,
  ): ResearchRunLibraryItem["stats"] {
    const metric = (
      key: string,
      label: string,
      role: ResearchRunLibraryItem["stats"][number]["role"],
      value: string | null,
      availability: Availability,
      tone: "DEFAULT" | "BAD" | "ACCENT" = "DEFAULT",
    ) => ({ key, label, role, value, availability, tone });
    const status = safeStatus(row.effective_status);
    if (status === "RUNNING" && progress && source.state === "AVAILABLE") {
      return [
        metric("progress", "progress", "PROGRESS", `${progress.overall.pct}%`, available(), "ACCENT"),
        metric("trials", "trials", "TRIALS", `${progress.overall.trials_done} / ${progress.overall.trials_declared}`, available()),
        metric("elapsed", "elapsed", "ELAPSED", `${progress.overall.elapsed_s} s`, available()),
      ] as ResearchRunLibraryItem["stats"];
    }
    if (status === "FAILED" && progress && source.state === "AVAILABLE") {
      return [
        metric("failed_at", "failed at", "FAILED_AT", new Date(progress.updated_at_utc_ms).toISOString(), available(), "BAD"),
        metric("failure_reason", "reason", "FAILURE_REASON", progress.failure?.code ?? null,
          progress.failure?.code ? available() : unavailable("NOT_PUBLISHED", "SOURCE_FAILURE_REASON_NOT_PUBLISHED"), "BAD"),
        metric("runtime", "runtime", "RUNTIME", `${progress.overall.elapsed_s} s`, available(), "BAD"),
      ] as ResearchRunLibraryItem["stats"];
    }
    if (status === "COMPLETED") {
      const missing = unavailable(
        row.source_kind === "LEGACY_1_0_8_METADATA" ? "LEGACY_METADATA_ONLY" : "NOT_PUBLISHED",
        row.source_kind === "LEGACY_1_0_8_METADATA"
          ? "LEGACY_1_0_8_DOES_NOT_PUBLISH_EXACT_OOS_METRICS"
          : "P12_DOES_NOT_INFER_FINAL_METRICS_FROM_PROGRESS_OR_ARTIFACTS",
      );
      return [
        metric("oos_sharpe", "OOS sharpe", "OOS_SHARPE", null, missing),
        metric("decay", "Δ decay", "DECAY", null, missing),
        metric("trade_count", "trades", "TRADE_COUNT", null, missing),
      ] as ResearchRunLibraryItem["stats"];
    }
    return [
      metric("progress", "progress", "PROGRESS", null, source),
      metric("trials", "trials", "TRIALS", null, source),
      metric("elapsed", "elapsed", "ELAPSED", null, source),
    ] as ResearchRunLibraryItem["stats"];
  }
}
