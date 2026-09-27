/** P12 server-side mapping from persisted Research rows to Screen-01 DTOs. */

import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig, querySigningKeys } from "../config";
import { KeysetCursorCodec, QueryContractError, queryFingerprint } from "../query";
import type { AppliedSort, NormalizedFilter } from "../query/contracts";
import { CONTROL_API_CONFIG } from "../tokens";
import * as metricRegistry from "./evidence-metric-registry";
import type { ResearchMetricDefinition, ResearchMetricRegistryVersion } from "./evidence-metric-registry";
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
import { runDisplayLabel, runDisplayOrdinal } from "./run-display-label";
import { failedAt, failedAtLabel, parseTerminalReason } from "./run-state";
import {
  type RunLibraryBoundary,
  type RunLibraryRetainedFacts,
  type RunLibraryRow,
  type RunLibrarySparklineSource,
  ResearchRunLibraryRepository,
} from "./run-library.repository";
import type { ResearchScope } from "./contracts";

/**
 * E11 (HiFi audit 01-7) — what a COMPLETED card reads from the retained
 * RS-02 lane when the P13 hub published nothing for the run.
 *
 * Every field is a value QuantBT itself retained; the only arithmetic is the
 * sum of the published per-fold OOS trade counts, and that sum is withheld
 * unless every fold published one (a partial sum would be a smaller number
 * wearing the run's name).
 */
export interface RetainedCardFacts {
  /** `rs02` artifact revision of the newest seal. */
  artifactRevision: number;
  /** QuantBT's mean OOS Sharpe across folds for the selected trial. */
  meanOosSharpe: string | null;
  /** QuantBT's mean decay across folds for the selected trial. */
  meanDecay: string | null;
  /** Σ per-fold `oos_trade_count`, only when every fold published one. */
  oosTrades: number | null;
  /** Why the trade sum is absent, when it is. */
  oosTradesReason: string | null;
  /** OBSERVATION rows the seal declares. */
  observationCount: number;
}

/** The three definition ids Screen 10 already publishes for these values. */
const RETAINED_DEFINITION = {
  oosSharpe: "research.current-source.v1.selected-trial-mean-oos-sharpe",
  decay: "research.current-source.v1.selected-trial-mean-decay",
  trades: "research.current-source.v1.sum-of-published-fold-oos-trade-counts",
} as const;

const EXACT_DECIMAL_TEXT = /^-?(0|[1-9][0-9]{0,29})(\.[0-9]{1,30})?$/;

/** E11: the retained tape is bucketed to this many rows before display reduction. */
const RETAINED_SPARKLINE_READ_LIMIT = 192;

/** A retained row from the repository, read into the card's own shape. */
export function retainedCardFacts(row: RunLibraryRetainedFacts): RetainedCardFacts | null {
  const revision = Number(row.artifact_revision);
  if (!Number.isSafeInteger(revision) || revision < 0) return null;
  const metrics = asObject(row.metrics);
  const decimal = (value: unknown): string | null =>
    typeof value === "string" && value.length <= 192 && EXACT_DECIMAL_TEXT.test(value) ? value : null;
  const folds = Number(row.fold_count);
  const counted = Number(row.trade_fold_count);
  const sum = row.trade_sum === null ? null : Number(row.trade_sum);
  const complete =
    Number.isSafeInteger(folds) && folds > 0 && counted === folds && sum !== null && Number.isSafeInteger(sum) && sum >= 0;
  const observations = Number(row.observation_count);
  return {
    artifactRevision: revision,
    meanOosSharpe: decimal(metrics?.mean_oos_sharpe),
    meanDecay: decimal(metrics?.mean_decay),
    oosTrades: complete ? sum : null,
    oosTradesReason: complete
      ? null
      : folds === 0
        ? "RS02_SEAL_RETAINED_NO_FOLD_ROWS"
        : "QUANTBT_DID_NOT_RETAIN_EVERY_FOLD_OOS_TRADE_COUNT",
    observationCount: Number.isSafeInteger(observations) && observations >= 0 ? observations : 0,
  };
}

const RESOURCE_ID = "research.run-library.v1";
// mapRow validates each card once, also for the P19 consumer. Validate the
// envelope separately instead of cloning/validating the same cards again.
// This is not a data/auth cache or a weaker public contract: both schemas
// still come from the canonical response and all item/array bounds apply.
const RunLibraryEnvelopeSchema = ResearchRunLibraryResponseSchema.omit({ items: true });
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
  if (!progress && row.effective_status === "CANCELLED") {
    // CG-P12-05: a run cancelled before its source published anything will
    // never receive a snapshot.  It is not pending and not "unpublished yet".
    return unavailable("NOT_PUBLISHED", "CANCELLED_BEFORE_SOURCE");
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

const EXACT_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const EVIDENCE_REVISION = /^p13r[0-9]+_[0-9a-f]{64}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const RELEASE_CANDIDATE_ID = /^rc_[0-9A-HJKMNP-TV-Z]{26}$/;
const RELEASE_CANDIDATE_DRAFT_ID = /^rcd_[0-9A-HJKMNP-TV-Z]{26}$/;
const DELIVERY_STATES = new Set(["NOT_DELIVERED", "PENDING", "DELIVERED", "UNKNOWN"]);
const APPROVAL_STATES = new Set(["NOT_APPROVED", "PENDING", "APPROVED", "REJECTED", "UNKNOWN"]);
const CURSOR_TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}(?:[0-9]{3})?Z$/;
export const RUN_LIBRARY_SPARKLINE_MAXIMUM_POINTS = 24;

type StatRole = "OOS_SHARPE" | "DECAY" | "TRADE_COUNT";

/**
 * Registry keys behind each COMPLETED-card cell.  TRADE_COUNT is a base
 * (v1/v2) registry fact read from `projection.direct`; OOS Sharpe and the
 * IS→OOS Sharpe decay are CG-P13-03 performance (v3) facts read from
 * `projection.oos_analytics.metrics` under the exact rule the Screen-04 Hub
 * applies.  Values are never computed here.
 */
export const RUN_LIBRARY_STAT_ROLE_METRIC_KEYS: Readonly<Record<StatRole, string>> = Object.freeze({
  OOS_SHARPE: "OOS_SHARPE",
  DECAY: "OOS_SHARPE_DECAY",
  TRADE_COUNT: "TRADE_COUNT",
});

/** Structural view of a CG-P13-03 performance definition. */
interface PerformanceMetricDefinitionLike {
  key: string;
  sourceField: string;
  scope: string;
  origin: string;
  definitionId: string;
  sourceLocator: string | null;
}

/**
 * Read through the module namespace so the Library compiles and degrades to
 * a typed absence on a registry that predates CG-P13-03, and picks the v3
 * definitions up with no Library change once they exist.
 */
function performanceMetricDefinitions(): readonly PerformanceMetricDefinitionLike[] {
  const value = (metricRegistry as unknown as { RESEARCH_PERFORMANCE_METRIC_DEFINITIONS?: unknown })
    .RESEARCH_PERFORMANCE_METRIC_DEFINITIONS;
  return Array.isArray(value) ? value as PerformanceMetricDefinitionLike[] : [];
}

/** Mirrors the Hub's source-absence code for a projection sealed before OOS analytics. */
const PREDATES_OOS_ANALYTICS = "P13_SOURCE_PREDATES_OOS_ANALYTICS";

type MetricScope = "OOS" | "IS_PLUS_OOS" | "CHILD_TAPE";

function metricScope(definition: ResearchMetricDefinition): MetricScope | null {
  const scope = definition.scope as string;
  return scope === "OOS" || scope === "IS_PLUS_OOS" || scope === "CHILD_TAPE" ? scope : null;
}

/**
 * Extract every exact decimal the persisted projection publishes, keyed by
 * registry key.  R1/R2 fields map exactly as the Screen-04 Hub maps them;
 * an explicit `metrics` map/array or any further scalar under `direct`/
 * `derived` is accepted under its upper-cased name.  Nothing is computed.
 */
export function projectionMetricValues(projection: Record<string, unknown> | null): Map<string, string> {
  const values = new Map<string, string>();
  if (!projection) return values;
  const put = (key: unknown, raw: unknown) => {
    if (typeof key !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) return;
    const normalizedKey = key.toUpperCase();
    const value = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : raw;
    if (typeof value !== "string" || value.length > 192 || !EXACT_DECIMAL.test(value)) return;
    if (!values.has(normalizedKey)) values.set(normalizedKey, value);
  };
  const record = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const metrics = projection.metrics;
  if (Array.isArray(metrics)) {
    for (const entry of metrics) {
      const item = record(entry);
      if (item) put(item.key, item.value);
    }
  } else if (record(metrics)) {
    for (const [key, entry] of Object.entries(record(metrics)!)) put(key, record(entry) ? record(entry)!.value : entry);
  }
  const direct = record(projection.direct);
  const derived = record(projection.derived);
  put("INITIAL_EQUITY", direct?.initial_equity);
  put("FINAL_EQUITY", direct?.final_equity);
  put("TRADE_COUNT", direct?.num_trades);
  put("BARS_PROCESSED", direct?.bars);
  put("NET_RETURN_FRACTION", derived?.net_return_fraction);
  put("MAX_DRAWDOWN_FRACTION", derived?.max_drawdown_fraction);
  for (const group of [derived, direct]) {
    for (const [key, value] of Object.entries(group ?? {})) put(key, value);
  }
  return values;
}

/**
 * Deterministic extrema-preserving reduction to at most `maximum` points.
 * The first and last points are always kept; the interior is split into
 * contiguous buckets and each bucket keeps its minimum and maximum, so the
 * global minimum and maximum always survive.  Flat buckets keep one point,
 * so the bucket count grows while the result still fits the budget.  Order
 * is preserved; values are never interpolated.
 */
export function extremaPreservingSample<T>(
  points: readonly T[],
  valueOf: (point: T) => number,
  maximum = RUN_LIBRARY_SPARKLINE_MAXIMUM_POINTS,
): { points: T[]; sampled: boolean } {
  if (maximum < 4) throw new RangeError("extrema-preserving sample needs at least four points");
  if (points.length <= maximum) return { points: [...points], sampled: false };
  const values = points.map(valueOf);
  const interior = points.length - 2;
  const select = (buckets: number): Set<number> => {
    const keep = new Set<number>([0, points.length - 1]);
    for (let bucket = 0; bucket < buckets; bucket += 1) {
      const start = 1 + Math.floor((bucket * interior) / buckets);
      const end = 1 + Math.floor(((bucket + 1) * interior) / buckets);
      if (start >= end) continue;
      let minimum = start;
      let maximumIndex = start;
      for (let index = start; index < end; index += 1) {
        if (values[index]! < values[minimum]!) minimum = index;
        if (values[index]! > values[maximumIndex]!) maximumIndex = index;
      }
      keep.add(minimum);
      keep.add(maximumIndex);
    }
    return keep;
  };
  let best = select(Math.floor((maximum - 2) / 2));
  for (let buckets = Math.floor((maximum - 2) / 2) + 1; buckets <= interior; buckets += 1) {
    const candidate = select(buckets);
    if (candidate.size > maximum) break;
    best = candidate;
  }
  return { points: [...best].sort((left, right) => left - right).map((index) => points[index]!), sampled: true };
}

/** Code-point-ordered canonical JSON; identical to the P13 series digest identity. */
function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
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
    /*
     * E11 (audit 01-7): a run whose evidence the P13 hub never published is
     * not a run without evidence — a Delta walk-forward seals its evidence in
     * the retained RS-02 lane, which Screen 04 and Screen 10 already read.
     * One bounded read covers the whole page; a hub-published run is not
     * asked about, so nothing changes for the runs that already worked.
     */
    const retained = page.retainedFacts === undefined
      ? await this.retainedFor(scope, page.rows)
      : new Map(page.retainedFacts.flatMap((fact) => {
        const mapped = retainedCardFacts(fact);
        return mapped ? [[fact.run_id, mapped] as const] : [];
      }));
    const items = page.rows.map((row) => this.mapRow(row, retained.get(row.run_id)));
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
      status_counts: {
        COMPLETED: page.statusCounts.completed,
        RUNNING: page.statusCounts.running,
        FAILED: page.statusCounts.failed,
        QUEUED: page.statusCounts.queued,
        DRAFT: page.statusCounts.draft,
        CANCELLED: page.statusCounts.cancelled,
        RECOVERY_REQUIRED: page.statusCounts.recoveryRequired,
      },
      claim_ledger: {
        issued: page.claimLedger.issued,
        not_issued: page.claimLedger.notIssued,
        pending_source: page.claimLedger.pendingSource,
        failed: page.claimLedger.failed,
        cancelled_before_source: page.claimLedger.cancelledBeforeSource,
        legacy_metadata_only: page.claimLedger.legacyMetadataOnly,
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
    const { items: validatedItems, ...envelope } = response;
    const parsed = RunLibraryEnvelopeSchema.safeParse(envelope);
    if (!parsed.success || validatedItems.length > 50) {
      throw new ResearchRunLibraryError(
        "RESEARCH_RUN_LIBRARY_UNAVAILABLE",
        "Run Library could not form a compatible persisted response.",
        503,
      );
    }
    return { ...parsed.data, items: validatedItems };
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
    const sequence = typeof row.source_latest_sequence === "number"
      ? row.source_latest_sequence
      : Number(row.source_latest_sequence);
    const progressRevision = Number.isSafeInteger(sequence) && sequence >= 0 ? `p11-seq-${sequence}` : null;
    const absent = (availability: Availability, revision: string | null = progressRevision) => ({
      schema_version: "research.run-sparkline.v1" as const,
      run_id: row.run_id,
      values: [] as string[],
      availability,
      source_revision: revision,
      source: null,
    });
    let response: unknown;
    if (row.source_kind === "LEGACY_1_0_8_METADATA") {
      response = absent(unavailable("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_DOES_NOT_PUBLISH_SPARKLINE_SERIES"));
    } else if (safeStatus(row.effective_status) !== "COMPLETED") {
      const progress = this.progress(row.progress_snapshot);
      response = absent(progress && sourceActual(progress)
        ? unavailable("NOT_PUBLISHED", "P12_DOES_NOT_READ_ARTIFACT_OR_PARQUET_SERIES")
        : sourceAvailability(row, progress));
    } else {
      const equity = this.equityAvailability(row.evidence_revision, row.equity_availability_state, row.equity_reason_code);
      if (equity.state === "AVAILABLE") {
        response = this.equitySparkline(row);
      } else {
        /* E11: the hub published no series for a retained walk-forward run.
           Its sealed OBSERVATION tape is the card's curve — the same tape
           Screen 04 draws — reduced in the database to <=24 display points. */
        const lane = this.evidenceEnabled()
          ? (await this.repository.retainedFacts(scope, [runId])).map(retainedCardFacts).find((fact) => fact !== null) ?? null
          : null;
        response = lane && lane.observationCount >= 2
          ? await this.retainedSparkline(scope, runId, lane)
          : absent(equity, this.evidenceRevision(row.evidence_revision) ?? progressRevision);
      }
    }
    const parsed = ResearchRunLibrarySparklineResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchRunLibraryError("RESEARCH_RUN_LIBRARY_UNAVAILABLE", "Run sparkline response is incompatible.", 503);
    }
    return parsed.data;
  }

  /**
   * Reduce the persisted P13 EQUITY_OOS series (already bounded to <=192
   * points by P13) to <=24 display values.  The series is integrity-checked
   * against its stored digest exactly as the P13 reader does; a mismatch is a
   * 503, never a silently different curve.
   */
  private equitySparkline(row: RunLibrarySparklineSource) {
    const incompatible = () => new ResearchRunLibraryError(
      "RESEARCH_RUN_LIBRARY_UNAVAILABLE",
      "Persisted evidence series is incompatible with the Run Library sparkline.",
      503,
    );
    const revision = this.evidenceRevision(row.evidence_revision);
    let payload: unknown = row.equity_series_payload;
    try {
      if (typeof payload === "string") payload = JSON.parse(payload);
    } catch {
      throw incompatible();
    }
    if (!revision || !Array.isArray(payload) || payload.length === 0 || payload.length > 192
        || typeof row.equity_series_digest !== "string" || !DIGEST.test(row.equity_series_digest)) {
      throw incompatible();
    }
    const emitted = Number(row.equity_emitted_point_count);
    if (!Number.isSafeInteger(emitted) || emitted !== payload.length) throw incompatible();
    if (createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex") !== row.equity_series_digest) {
      throw incompatible();
    }
    const points = payload.map((entry) => {
      const point = entry && typeof entry === "object" && !Array.isArray(entry) ? entry as Record<string, unknown> : null;
      const at = point?.at_utc_ms;
      const equity = point?.equity;
      if (typeof at !== "number" || !Number.isSafeInteger(at) || at < 0
          || typeof equity !== "string" || !EXACT_DECIMAL.test(equity)) {
        throw incompatible();
      }
      return { at, equity, numeric: Number(equity) };
    });
    const sample = extremaPreservingSample(points, (point) => point.numeric);
    const observed = row.equity_source_observation_count === null ? null : Number(row.equity_source_observation_count);
    return {
      schema_version: "research.run-sparkline.v1" as const,
      run_id: row.run_id,
      values: sample.points.map((point) => point.equity),
      availability: available(),
      source_revision: revision,
      source: {
        series_kind: "EQUITY_OOS" as const,
        value_field: "equity" as const,
        projection_revision: revision,
        series_digest: row.equity_series_digest,
        source_observation_count: observed !== null && Number.isSafeInteger(observed) && observed >= 0 ? observed : null,
        source_sampling: row.equity_sampling,
        persisted_point_count: points.length,
        display_sampling: sample.sampled ? "EXTREMA_BUCKET_24_V1" as const : "FULL" as const,
        first_at_utc_ms: points[0]!.at,
        last_at_utc_ms: points[points.length - 1]!.at,
      },
    };
  }

  /**
   * E11: the card's curve for a retained walk-forward run.
   *
   * The reduction happens in the database (first, last, min and max of each
   * bucket) and again here, so a 1,056-row tape becomes <=24 display values
   * without losing an extremum. The lane's `rs02_` revision is reported as
   * the source revision, so the card names the lane it read, not the hub.
   */
  private async retainedSparkline(scope: ResearchScope, runId: string, lane: RetainedCardFacts) {
    const rows = await this.repository.findRetainedSparklineValues(
      scope,
      runId,
      lane.artifactRevision,
      lane.observationCount,
      RETAINED_SPARKLINE_READ_LIMIT,
    );
    const points = rows.flatMap((row) => {
      const at = Number(row.at_utc_ms);
      return typeof row.equity === "string" && EXACT_DECIMAL.test(row.equity)
        && Number.isSafeInteger(at) && at >= 0
        ? [{ at, equity: row.equity, numeric: Number(row.equity) }]
        : [];
    });
    if (points.length < 2) {
      return {
        schema_version: "research.run-sparkline.v1" as const,
        run_id: runId,
        values: [] as string[],
        availability: unavailable("NOT_PUBLISHED", "RS02_RETAINED_OBSERVATIONS_DO_NOT_FORM_A_SERIES"),
        source_revision: `rs02r${lane.artifactRevision}`,
        source: null,
      };
    }
    const sample = extremaPreservingSample(points, (point) => point.numeric);
    return {
      schema_version: "research.run-sparkline.v1" as const,
      run_id: runId,
      values: sample.points.map((point) => point.equity),
      availability: available(),
      source_revision: `rs02r${lane.artifactRevision}`,
      source: {
        lane: "PORTAL_RETAINED_CURRENT_SOURCE" as const,
        series_kind: "EQUITY" as const,
        value_field: "equity" as const,
        projection_revision: `rs02r${lane.artifactRevision}`,
        series_digest: null,
        source_observation_count: lane.observationCount,
        source_sampling: lane.observationCount > RETAINED_SPARKLINE_READ_LIMIT
          ? "OBSERVATION_EXTREMA_BUCKET_V2"
          : "FULL",
        persisted_point_count: points.length,
        display_sampling: sample.sampled ? "EXTREMA_BUCKET_24_V1" as const : "FULL" as const,
        first_at_utc_ms: points[0]!.at,
        last_at_utc_ms: points[points.length - 1]!.at,
      },
    };
  }

  private evidenceEnabled(): boolean {
    return this.config.FEATURE_RESEARCH_EVIDENCE === "true";
  }

  private evidenceRevision(value: string | null): string | null {
    return typeof value === "string" && EVIDENCE_REVISION.test(value) ? value : null;
  }

  /** Availability of the COMPLETED-card equity series from the persisted P13 lane. */
  private equityAvailability(revision: string | null, state: string | null, reason: string | null): Availability {
    if (!this.evidenceEnabled()) return unavailable("NOT_PUBLISHED", "P13_EVIDENCE_READER_DISABLED");
    if (!this.evidenceRevision(revision)) return unavailable("NOT_PUBLISHED", "P13_SOURCE_EVIDENCE_NOT_PUBLISHED");
    if (state === "AVAILABLE") return available();
    return unavailable(
      "NOT_PUBLISHED",
      typeof reason === "string" && /^[A-Z][A-Z0-9_]{2,159}$/.test(reason) ? reason : "P13_EQUITY_OOS_SERIES_NOT_PUBLISHED",
    );
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
      // Exact PostgreSQL microsecond text (CG-P12-08).  A pre-fix
      // millisecond cursor is still accepted until its short TTL expires.
      if (!CURSOR_TIMESTAMP.test(timestamp) || !Number.isSafeInteger(new Date(timestamp).getTime())) {
        throw new Error("invalid cursor timestamp");
      }
      return { createdAt: timestamp, runId, direction };
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
      boundary: [row.created_at_cursor, row.run_id],
    });
  }

  /**
   * One Library row as Screen 01 shows it.  Public for the P19 lineage reader
   * (W6b CG-P19-05/13): Screen 10's per-attempt certificate, claim, OOS
   * Sharpe, decay and rc are this exact mapping, so 01 and 10 cannot disagree.
   */
  /**
   * E11: the retained facts of every page row that the P13 hub did not
   * publish. Only COMPLETED durable rows are asked about — a running or
   * failed card shows lifecycle cells, not evidence — and a row that already
   * has a hub projection keeps it, so the hub stays the first authority.
   */
  private async retainedFor(
    scope: ResearchScope,
    rows: readonly RunLibraryRow[],
  ): Promise<ReadonlyMap<string, RetainedCardFacts>> {
    if (!this.evidenceEnabled()) return new Map();
    const wanted = rows
      .filter((row) =>
        row.source_kind === "RESEARCH_DURABLE"
        && safeStatus(row.effective_status) === "COMPLETED"
        && !this.evidenceRevision(row.evidence_revision))
      .map((row) => row.run_id);
    if (wanted.length === 0) return new Map();
    const facts = new Map<string, RetainedCardFacts>();
    for (const found of await this.repository.retainedFacts(scope, wanted)) {
      const mapped = retainedCardFacts(found);
      if (mapped) facts.set(found.run_id, mapped);
    }
    return facts;
  }

  mapRow(row: RunLibraryRow, retained?: RetainedCardFacts): ResearchRunLibraryItem {
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
      // D1: server-derived, never minted here as an identity — see
      // run-display-label.ts. `null` stays distinct from a label.
      display_label: runDisplayLabel(row.display_profile_id, runDisplayOrdinal(row.display_ordinal)),
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
      status_basis: this.statusBasis(row, status),
      mode: this.mode(row, requested, legacy),
      strategy_id: this.strategy(row, requested, legacy),
      binding,
      binding_availability: this.bindingAvailability(row, binding),
      ...this.releaseCandidate(row),
      instrument: this.instrument(row, requested),
      created_at_utc_ms: utcMs(row.created_at, "created timestamp"),
      certificate: this.certificate(progress, source),
      claim: this.claim(progress, source),
      stages: this.stages(progress, source, status),
      stats: this.stats(row, progress, source, retained),
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
        // unavailable placeholder as OOS equity.  An unmonitored legacy
        // QUEUED/RUNNING record is not a live search either.
        kind: row.source_kind === "LEGACY_1_0_8_METADATA" && (status === "RUNNING" || status === "QUEUED")
          ? null
          : status === "RUNNING"
            ? "search_progress"
            : status === "FAILED" ? "failed" : status === "COMPLETED" ? "oos_equity" : null,
        availability: row.source_kind === "LEGACY_1_0_8_METADATA"
          ? unavailable("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_DOES_NOT_PUBLISH_SPARKLINE_SERIES")
          : status === "COMPLETED"
            /* E11: a retained run has a sealed equity tape even though the hub
               published none, so the card may ask for it. */
            ? retained && retained.observationCount >= 2
              ? available()
              : this.equityAvailability(row.evidence_revision, row.evidence_equity_state, row.evidence_equity_reason)
            /* Same rule as the lazy /sparkline read: a run that never received a
               source (e.g. cancelled before it) says so, rather than blaming
               the reader for a series that could not exist. */
            : progress && sourceActual(progress)
              ? unavailable("NOT_PUBLISHED", "P12_DOES_NOT_READ_ARTIFACT_OR_PARQUET_SERIES")
              : source,
      },
      evidence_revision: this.evidenceEnabled() ? this.evidenceRevision(row.evidence_revision) : null,
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

  /**
   * CG-P12-04: the chip is `optimization_mode · optimization_schedule`
   * (spec 01 §76).  `key` is the mode only; a protocol is carried
   * separately and is never offered as a mode.
   */
  private mode(
    row: RunLibraryRow,
    spec: ResearchRequestedSpec | null,
    legacy: Record<string, unknown> | null,
  ): ResearchRunLibraryItem["mode"] {
    if (spec) {
      return {
        display: `${spec.optimization_mode} · ${spec.optimization_schedule}`,
        key: spec.optimization_mode,
        schedule: spec.optimization_schedule,
        protocol: spec.protocol,
        availability: available(),
      };
    }
    const rawProtocol = typeof legacy?.protocol === "string" ? legacy.protocol : null;
    const protocol = rawProtocol && rawProtocol.length <= 120 ? rawProtocol : null;
    if (row.source_kind === "LEGACY_1_0_8_METADATA") {
      return {
        display: protocol,
        key: null,
        schedule: null,
        protocol,
        availability: unavailable("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_RECORDS_PROTOCOL_NOT_OPTIMIZATION_MODE"),
      };
    }
    return {
      display: protocol,
      key: null,
      schedule: null,
      protocol,
      availability: unavailable("NOT_PUBLISHED", "REQUESTED_SPEC_DOES_NOT_PUBLISH_OPTIMIZATION_MODE"),
    };
  }

  /** CG-P12-07: legacy status is a recorded 1.0.8 value, not a monitored lifecycle. */
  private statusBasis(row: RunLibraryRow, status: ResearchRunLibraryItem["status"]): ResearchRunLibraryItem["status_basis"] {
    if (row.source_kind === "RESEARCH_DURABLE") return { kind: "DURABLE_LIFECYCLE", availability: available() };
    return {
      kind: "LEGACY_RECORDED_STATUS",
      availability: unavailable(
        "LEGACY_METADATA_ONLY",
        status === "QUEUED" || status === "RUNNING"
          ? "LEGACY_1_0_8_NON_TERMINAL_STATUS_NOT_MONITORED"
          : "LEGACY_1_0_8_RECORDED_STATUS",
      ),
    };
  }

  /** CG-P12-07: a durable scratch run is a declared fact; a legacy row has no binding fact. */
  private bindingAvailability(row: RunLibraryRow, binding: ResearchRunLibraryItem["binding"]) {
    if (binding) return available();
    if (row.source_kind === "LEGACY_1_0_8_METADATA") {
      return unavailable("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_DOES_NOT_PUBLISH_ALPHA_BINDING");
    }
    return row.alpha_filter_key === "scratch"
      ? available()
      : unavailable("NOT_PUBLISHED", "ALPHA_BINDING_NOT_PUBLISHED");
  }

  /**
   * CG-P12-06: rc only from a persisted P21 relation.  A Portal-local sealed
   * pack (workspace-visible) wins; otherwise the viewer's own draft.  An
   * unexpected identifier/state shape is a typed absence, not a 503.
   */
  private releaseCandidate(row: RunLibraryRow): Pick<ResearchRunLibraryItem, "rc" | "rc_availability"> {
    if (row.source_kind === "LEGACY_1_0_8_METADATA") {
      return { rc: null, rc_availability: unavailable("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_HAS_NO_RELEASE_CANDIDATE_RELATION") };
    }
    if (this.config.FEATURE_RESEARCH_RELEASE_CANDIDATES !== "true") {
      return { rc: null, rc_availability: unavailable("NOT_PUBLISHED", "P21_RELEASE_CANDIDATE_READER_DISABLED") };
    }
    if (row.rc_release_candidate_id !== null) {
      const sealedAt = Number(row.rc_sealed_at_utc_ms);
      if (!RELEASE_CANDIDATE_ID.test(row.rc_release_candidate_id)
          || !DELIVERY_STATES.has(row.rc_delivery_state ?? "") || !APPROVAL_STATES.has(row.rc_approval_state ?? "")
          || !Number.isSafeInteger(sealedAt) || sealedAt < 0) {
        return { rc: null, rc_availability: unavailable("NOT_PUBLISHED", "P21_RELEASE_CANDIDATE_REF_INCOMPATIBLE") };
      }
      return {
        rc: {
          kind: "LOCAL_SEAL",
          release_candidate_id: row.rc_release_candidate_id,
          draft_id: null,
          delivery_state: row.rc_delivery_state as NonNullable<ResearchRunLibraryItem["rc"]>["delivery_state"],
          approval_state: row.rc_approval_state as NonNullable<ResearchRunLibraryItem["rc"]>["approval_state"],
          sealed_at_utc_ms: sealedAt,
        },
        rc_availability: available(),
      };
    }
    if (row.rc_draft_id !== null && RELEASE_CANDIDATE_DRAFT_ID.test(row.rc_draft_id)) {
      return {
        rc: {
          kind: "ACTOR_DRAFT", release_candidate_id: null, draft_id: row.rc_draft_id,
          delivery_state: null, approval_state: null, sealed_at_utc_ms: null,
        },
        rc_availability: available(),
      };
    }
    return { rc: null, rc_availability: unavailable("NOT_PUBLISHED", "P21_NO_PERSISTED_RELEASE_CANDIDATE") };
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

  /**
   * CG-P12-09: the same persisted Stage-5 claim the Screen-04 Hub prints —
   * state and sentence verbatim, whatever the state.  Only its absence is
   * typed; a NOT_ISSUED sentence is still the source's sentence.  The
   * sentence is shown only once its source is AVAILABLE (as the Hub does);
   * a pending or otherwise unavailable source carries no text.
   */
  private claim(progress: ResearchProgressSnapshot | null, source: Availability): ResearchRunLibraryItem["claim"] {
    if (!progress) {
      return {
        state: null,
        text: null,
        availability: source.state === "AVAILABLE" ? unavailable("NOT_PUBLISHED", "SOURCE_CLAIM_NOT_PUBLISHED") : source,
      };
    }
    if (source.state !== "AVAILABLE") return { state: progress.claim.state, text: null, availability: source };
    const text = progress.claim.text.length > 0 ? progress.claim.text : null;
    return {
      state: progress.claim.state,
      text,
      availability: text === null ? unavailable("NOT_PUBLISHED", "SOURCE_CLAIM_TEXT_EMPTY") : available(),
    };
  }

  private stages(
    progress: ResearchProgressSnapshot | null,
    source: Availability,
    status: ResearchRunLibraryItem["status"],
  ): ResearchRunLibraryItem["stages"] {
    const sourceStages = new Map(progress?.stages.map((stage) => [stage.key, stage]) ?? []);
    // E10: P11 publishes only PENDING/RUNNING/DONE per stage. A FAILED run's
    // stopping point is derived — by the one rule Run Progress also publishes
    // as `current.failed_at` — from its lifecycle status and last persisted
    // snapshot, and labelled derived, never as a source narrative.
    const failed = status === "FAILED" && source.state === "AVAILABLE" ? failedAt(progress) : null;
    return ["S1", "S2", "S3", "S4", "S5"].map((key) => {
      const stage = sourceStages.get(key as "S1" | "S2" | "S3" | "S4" | "S5");
      if (stage && source.state === "AVAILABLE") {
        if (failed?.stage === key) {
          return {
            key,
            state: "blocked" as const,
            tip: failed.basis === "SOURCE_RUNNING_STAGE"
              ? `The run failed during ${key}${failed.fold === null ? "" : ` at fold ${failed.fold}`}; persisted ${key} state: ${stage.state}.`
              : `The run failed before ${key} started; persisted ${key} state: ${stage.state}.`,
            tooltip_source: "DERIVED_FROM_PERSISTED_STATE" as const,
            availability: available(),
          };
        }
        return {
          key,
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

  /**
   * CG-P12-02 / CG-P13-03: the Hub's `oosPerformance` rule for one fact.  A
   * value is shown only when the analytics block and the metric are
   * AVAILABLE, the definition is ENGINE_DIRECT and the stored receipt locator
   * equals the registry locator; every other case keeps the Hub's reason.
   */
  private performanceValue(
    projection: Record<string, unknown> | null,
    definition: PerformanceMetricDefinitionLike,
  ): { value: string | null; availability: Availability } {
    const reason = (value: unknown, fallback: string) =>
      typeof value === "string" && /^[A-Z][A-Z0-9_]{2,159}$/.test(value) ? value : fallback;
    const analytics = asObject((projection?.oos_analytics ?? null) as Record<string, unknown> | null);
    if (!analytics) return { value: null, availability: unavailable("NOT_PUBLISHED", PREDATES_OOS_ANALYTICS) };
    if (analytics.state !== "AVAILABLE") {
      return { value: null, availability: unavailable("NOT_PUBLISHED", reason(analytics.reason_code, PREDATES_OOS_ANALYTICS)) };
    }
    const metrics = asObject((analytics.metrics ?? null) as Record<string, unknown> | null);
    const raw = asObject((metrics?.[definition.sourceField] ?? null) as Record<string, unknown> | null);
    const incompatible = { value: null, availability: unavailable("NOT_PUBLISHED", "P13_OOS_ANALYTICS_METRIC_INCOMPATIBLE") };
    if (!raw || !["AVAILABLE", "NOT_APPLICABLE", "NOT_PUBLISHED"].includes(String(raw.state))
        || Object.keys(raw).some((field) => !["state", "reason_code", "value", "locator"].includes(field))) {
      return incompatible;
    }
    if (raw.state !== "AVAILABLE") {
      // The Library availability vocabulary has no NOT_APPLICABLE; the
      // source reason code is kept verbatim so the card can say why.
      return { value: null, availability: unavailable("NOT_PUBLISHED", reason(raw.reason_code, "P13_OOS_ANALYTICS_METRIC_INCOMPATIBLE")) };
    }
    if (definition.origin !== "ENGINE_DIRECT" || raw.locator !== definition.sourceLocator) {
      return { value: null, availability: unavailable("NOT_PUBLISHED", "P13_ENGINE_LOCATOR_MISMATCH") };
    }
    if (typeof raw.value !== "string" || raw.value.length > 192 || !EXACT_DECIMAL.test(raw.value)) return incompatible;
    return { value: raw.value, availability: available() };
  }

  private stats(
    row: RunLibraryRow,
    progress: ResearchProgressSnapshot | null,
    source: Availability,
    retained?: RetainedCardFacts,
  ): ResearchRunLibraryItem["stats"] {
    const metric = (
      key: string,
      label: string,
      role: ResearchRunLibraryItem["stats"][number]["role"],
      value: string | null,
      availability: Availability,
      tone: "DEFAULT" | "BAD" | "ACCENT" = "DEFAULT",
      scope: MetricScope | null = null,
      definitionId: string | null = null,
    ) => ({ key, label, role, value, availability, tone, scope, definition_id: definitionId });
    const status = safeStatus(row.effective_status);
    if (status === "RUNNING" && progress && source.state === "AVAILABLE") {
      return [
        metric("progress", "progress", "PROGRESS", `${progress.overall.pct}%`, available(), "ACCENT"),
        metric("trials", "trials", "TRIALS", `${progress.overall.trials_done} / ${progress.overall.trials_declared}`, available()),
        metric("elapsed", "elapsed", "ELAPSED", `${progress.overall.elapsed_s} s`, available()),
      ] as ResearchRunLibraryItem["stats"];
    }
    if (status === "FAILED") {
      // E10 / HiFi S01: "failed at" names where the run stopped (`fold 2 · S2`),
      // and the reason is the source's failure code, else the typed code the
      // scheduler recorded when it closed the job (P06_RETRY_NOT_DISPATCHED…).
      const readable = progress !== null && source.state === "AVAILABLE";
      const where = readable ? failedAt(progress) : null;
      const reasonCode = (readable ? progress.failure?.code : undefined)
        ?? parseTerminalReason(row.job_terminal_reason)?.code
        ?? null;
      return [
        metric("failed_at", "failed at", "FAILED_AT", where ? failedAtLabel(where) : null,
          where ? available() : unavailable("NOT_PUBLISHED", "P11_FAILED_STAGE_NOT_PUBLISHED"), "BAD"),
        metric("failure_reason", "reason", "FAILURE_REASON", reasonCode,
          reasonCode ? available() : unavailable("NOT_PUBLISHED", "SOURCE_FAILURE_REASON_NOT_PUBLISHED"), "BAD"),
        metric("runtime", "runtime", "RUNTIME", readable ? `${progress.overall.elapsed_s} s` : null,
          readable ? available() : source, "BAD"),
      ] as ResearchRunLibraryItem["stats"];
    }
    if (status === "COMPLETED") {
      const cells: Array<[string, string, StatRole]> = [
        ["oos_sharpe", "OOS sharpe", "OOS_SHARPE"],
        ["decay", "Δ decay", "DECAY"],
        ["trade_count", "trades", "TRADE_COUNT"],
      ];
      if (row.source_kind === "LEGACY_1_0_8_METADATA") {
        const missing = unavailable("LEGACY_METADATA_ONLY", "LEGACY_1_0_8_DOES_NOT_PUBLISH_EXACT_OOS_METRICS");
        return cells.map(([key, label, role]) => metric(key, label, role, null, missing)) as ResearchRunLibraryItem["stats"];
      }
      const revision = this.evidenceRevision(row.evidence_revision);
      if (!this.evidenceEnabled() || !revision) {
        /*
         * E11 (audit 01-7): before printing the hub's absence, read the
         * retained lane. `P13_SOURCE_EVIDENCE_NOT_PUBLISHED` describes the
         * hub, not the run — Screen 04 shows OOS Sharpe −5.35 and decay 3.91
         * for the very run whose card said "not published" three times.
         *
         * The two means are QuantBT's own, from the selected trial's
         * candidate row — the same values, with the same definition ids,
         * that Screen 10 publishes (W6b CG-P19-05), so 01 and 10 cannot
         * disagree. Trades are the sum of the published per-fold OOS counts
         * and are withheld unless every fold published one.
         */
        if (retained) {
          return [
            retained.meanOosSharpe !== null
              ? metric("oos_sharpe", "OOS sharpe", "OOS_SHARPE", retained.meanOosSharpe, available(), "DEFAULT", "OOS", RETAINED_DEFINITION.oosSharpe)
              : metric("oos_sharpe", "OOS sharpe", "OOS_SHARPE", null, unavailable("NOT_PUBLISHED", "QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS")),
            retained.meanDecay !== null
              ? metric("decay", "Δ decay", "DECAY", retained.meanDecay, available(), "DEFAULT", "OOS", RETAINED_DEFINITION.decay)
              : metric("decay", "Δ decay", "DECAY", null, unavailable("NOT_PUBLISHED", "QUANTBT_DID_NOT_RETAIN_SELECTED_TRIAL_FOLD_METRICS")),
            retained.oosTrades !== null
              ? metric("trade_count", "trades", "TRADE_COUNT", String(retained.oosTrades), available(), "DEFAULT", "OOS", RETAINED_DEFINITION.trades)
              : metric("trade_count", "trades", "TRADE_COUNT", null,
                unavailable("NOT_PUBLISHED", retained.oosTradesReason ?? "QUANTBT_DID_NOT_RETAIN_EVERY_FOLD_OOS_TRADE_COUNT")),
          ] as ResearchRunLibraryItem["stats"];
        }
        const missing = unavailable(
          "NOT_PUBLISHED",
          this.evidenceEnabled() ? "P13_SOURCE_EVIDENCE_NOT_PUBLISHED" : "P13_EVIDENCE_READER_DISABLED",
        );
        return cells.map(([key, label, role]) => metric(key, label, role, null, missing)) as ResearchRunLibraryItem["stats"];
      }
      const projection = asObject(row.evidence_projection);
      const values = projectionMetricValues(projection);
      const rawVersion = projection?.metric_registry_version;
      const definitions = metricRegistry.researchMetricDefinitions(
        (typeof rawVersion === "string" ? rawVersion : "research.metric-registry.v1") as ResearchMetricRegistryVersion,
      );
      const performance = performanceMetricDefinitions();
      return cells.map(([key, label, role]) => {
        const registryKey = RUN_LIBRARY_STAT_ROLE_METRIC_KEYS[role];
        const performanceDefinition = performance.find((entry) => entry.key === registryKey);
        if (performanceDefinition) {
          const resolved = this.performanceValue(projection, performanceDefinition);
          const scope = performanceDefinition.scope === "OOS" ? "OOS" as const : null;
          return resolved.value !== null
            ? metric(key, label, role, resolved.value, available(), "DEFAULT", scope, performanceDefinition.definitionId)
            : metric(key, label, role, null, resolved.availability);
        }
        const definition = definitions.find((entry) => entry.key === registryKey);
        if (!definition || definition.origin === "NOT_PUBLISHED") {
          return metric(key, label, role, null, unavailable("NOT_PUBLISHED", `P13_METRIC_REGISTRY_DOES_NOT_DEFINE_${role}`));
        }
        const scope = metricScope(definition);
        if (role === "OOS_SHARPE" && scope !== "OOS") {
          return metric(key, label, role, null, unavailable("NOT_PUBLISHED", "P13_METRIC_REGISTRY_DOES_NOT_DEFINE_OOS_SHARPE"));
        }
        const value = values.get(registryKey);
        return value !== undefined
          ? metric(key, label, role, value, available(), "DEFAULT", scope, definition.definitionId)
          : metric(key, label, role, null, unavailable("NOT_PUBLISHED", `P13_PROJECTION_DOES_NOT_PUBLISH_${role}`));
      }) as ResearchRunLibraryItem["stats"];
    }
    return [
      metric("progress", "progress", "PROGRESS", null, source),
      metric("trials", "trials", "TRIALS", null, source),
      metric("elapsed", "elapsed", "ELAPSED", null, source),
    ] as ResearchRunLibraryItem["stats"];
  }
}
