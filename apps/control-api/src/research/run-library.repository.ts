/**
 * P12 persisted Run Library reader.
 *
 * This repository is intentionally a small read-only boundary.  It does not
 * receive an engine, an artifact store, a worker handle, a source database
 * credential, or an Execution relation.  Every list operation is one scoped
 * PostgreSQL transaction with a finite admission queue and a bounded number
 * of fixed aggregate queries; it never issues one query per displayed row.
 */

import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { CONTROL_API_POOL } from "../tokens";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import type { ResearchRunLibraryQuery } from "./run-library.contract";
import { ResearchRunLibraryError } from "./run-library.error";

type JsonRecord = Record<string, unknown>;
type JsonColumn = JsonRecord | string | null;

export interface RunLibraryBoundary {
  /**
   * PostgreSQL's exact microsecond UTC timestamp text
   * (`YYYY-MM-DDTHH:MM:SS.ffffffZ`).  A JS Date truncates to milliseconds;
   * a truncated `before` boundary admitted the boundary row itself and so
   * repeated one row and skipped another (CG-P12-08).
   */
  createdAt: string;
  runId: string;
  direction: "after" | "before";
}

export interface RunLibraryRow {
  workspace_id: string;
  run_id: string;
  attempt_id: string | null;
  source_kind: "RESEARCH_DURABLE" | "LEGACY_1_0_8_METADATA";
  run_kind: string;
  relationship_kind: string;
  logical_run_key: string | null;
  parent_run_id: string | null;
  created_at: Date;
  updated_at: Date;
  effective_status: string;
  intent_kind: string | null;
  alpha_id: string | null;
  alpha_name: string | null;
  alpha_version_label: string | null;
  alpha_version_id: string | null;
  alpha_code_digest: string | null;
  legacy_request: JsonColumn;
  requested_spec: JsonColumn;
  portal_receipt: JsonColumn;
  progress_snapshot: JsonColumn;
  progress_received_at: Date | null;
  source_latest_sequence: string | number | null;
  retention_floor_sequence: string | number | null;
  job_state: string | null;
  current_worker_ordinal: string | number | null;
  alpha_filter_key: string;
  mode_key: string | null;
  /** Exact microsecond keyset text; see RunLibraryBoundary. */
  created_at_cursor: string;
  /** Latest persisted P13 projection for the producer's worker attempt (durable only). */
  evidence_revision: string | null;
  evidence_projection: JsonColumn;
  evidence_equity_state: string | null;
  evidence_equity_reason: string | null;
  /** Latest persisted P21 Portal-local sealed pack for the run. */
  rc_release_candidate_id: string | null;
  rc_delivery_state: string | null;
  rc_approval_state: string | null;
  rc_sealed_at_utc_ms: string | number | null;
  /** The viewer's own persisted P21 draft for the run. */
  rc_draft_id: string | null;
}

export interface RunLibrarySparklineSource {
  run_id: string;
  source_kind: RunLibraryRow["source_kind"];
  effective_status: string;
  source_latest_sequence: string | number | null;
  progress_snapshot: JsonColumn;
  evidence_revision: string | null;
  equity_availability_state: string | null;
  equity_reason_code: string | null;
  equity_source_observation_count: string | number | null;
  equity_emitted_point_count: string | number | null;
  equity_sampling: string | null;
  equity_series_payload: JsonRecord[] | string | null;
  equity_series_digest: string | null;
}

export interface RunLibraryCounters {
  logicalRuns: number;
  workerChildren: number;
  technicalRetries: number;
  legacyMetadataRows: number;
}

export interface RunLibraryClaimLedger {
  issued: number;
  notIssued: number;
  pendingSource: number;
  failed: number;
  cancelledBeforeSource: number;
  legacyMetadataOnly: number;
}

export interface RunLibraryFilterCatalog {
  alphas: Array<{ alphaId: string; alphaName: string }>;
  modes: Array<{ key: string; display: string }>;
  scratchAvailable: boolean;
}

export interface RunLibraryPage {
  rows: RunLibraryRow[];
  /** PostgreSQL transaction timestamp for every count/page/facet in this DTO. */
  asOfUtcMs: number;
  totalRows: number;
  filteredRows: number;
  hasMore: boolean;
  hasPrevious: boolean;
  counters: RunLibraryCounters;
  claimLedger: RunLibraryClaimLedger;
  filterCatalog: RunLibraryFilterCatalog;
}

interface CountRow { count: string | number; }
interface SnapshotTimestampRow { as_of_utc_ms: string | number; }
interface CountersRow {
  logical_runs: string | number;
  worker_children: string | number;
  technical_retries: string | number;
  legacy_metadata_rows: string | number;
}
interface ClaimLedgerRow {
  issued: string | number;
  not_issued: string | number;
  pending_source: string | number;
  failed: string | number;
  cancelled_before_source: string | number;
  legacy_metadata_only: string | number;
}
interface AlphaFacetRow { alpha_id: string; alpha_name: string; }
interface ModeFacetRow { mode_key: string; }
interface ScratchFacetRow { scratch_available: boolean; }

interface BuiltFilter {
  fromSql: string;
  whereSql: string;
  params: unknown[];
}

const MAXIMUM_CONCURRENT_LIBRARY_READS = 2;
const MAXIMUM_QUEUED_LIBRARY_READS = 8;

function asNonNegativeInteger(value: string | number | null | undefined, label: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new ResearchRunLibraryError(
      "RESEARCH_RUN_LIBRARY_UNAVAILABLE",
      `Run Library ${label} is incompatible with its persisted read model.`,
      503,
    );
  }
  return numeric;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function emptyCounters(): RunLibraryCounters {
  return { logicalRuns: 0, workerChildren: 0, technicalRetries: 0, legacyMetadataRows: 0 };
}

function emptyLedger(): RunLibraryClaimLedger {
  return { issued: 0, notIssued: 0, pendingSource: 0, failed: 0, cancelledBeforeSource: 0, legacyMetadataOnly: 0 };
}

/**
 * Exact keyset text.  `to_char(... 'US')` always renders six fractional
 * digits, so the value round-trips through `::timestamptz` without loss.
 */
const CREATED_AT_CURSOR_SQL =
  `to_char(library.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/**
 * P12 has its own two-reader lane so it cannot starve identity, scheduler, or
 * P03 metadata writes in the shared ten-connection pool.  Combined with the
 * existing P03 four-operation lane, Research remains below the pool cap even
 * under a Library refresh burst.  The queue is finite by design.
 */
@Injectable()
export class ResearchRunLibraryRepository {
  private activeReads = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async list(
    scope: ResearchScope,
    query: ResearchRunLibraryQuery,
    boundary: RunLibraryBoundary | null,
  ): Promise<RunLibraryPage> {
    this.assertScope(scope);
    return this.withScopedRead(scope, async (client) => {
      const filter = this.buildFilter(scope.workspaceId, query);
      // This is deliberately PostgreSQL's transaction timestamp, rather than
      // the Control API process clock.  The page, counts, facets and this
      // provenance marker are therefore one repeatable-read snapshot even if
      // the host clock changes or a request spans a second boundary.
      const snapshotTimestamp = await client.query<SnapshotTimestampRow>(
        "SELECT floor(extract(epoch FROM transaction_timestamp()) * 1000)::bigint AS as_of_utc_ms",
      );
      const asOfUtcMs = asNonNegativeInteger(snapshotTimestamp.rows[0]?.as_of_utc_ms, "snapshot timestamp");
      const order = boundary?.direction === "before"
        ? "library.created_at ASC, library.run_id ASC"
        : "library.created_at DESC, library.run_id DESC";
      const pageParams = [...filter.params];
      const keyset = this.keysetPredicate(boundary, pageParams);
      pageParams.push(query.limit + 1);

      const rows = await client.query<RunLibraryRow>(
        `${this.selectColumns()}
           FROM ${filter.fromSql}
           ${this.pageJoins()}
          WHERE ${filter.whereSql}${keyset}
          ORDER BY ${order}
          LIMIT $${pageParams.length}`,
        pageParams,
      );
      const pageRows = rows.rows.slice(0, query.limit);
      const orderedRows = boundary?.direction === "before" ? pageRows.reverse() : pageRows;
      let hasMore = false;
      let hasPrevious = false;
      if (orderedRows.length > 0) {
        if (boundary?.direction === "before") {
          // This ascending fetch has already looked one row farther toward
          // newer history.  The opposite edge must be checked explicitly:
          // an old cursor can survive while its boundary row changes filter
          // membership, so `true because a cursor existed` is not accurate.
          hasPrevious = rows.rows.length > query.limit;
          hasMore = await this.hasRowBeyond(client, filter, orderedRows[orderedRows.length - 1], "after");
        } else {
          hasMore = rows.rows.length > query.limit;
          hasPrevious = boundary?.direction === "after"
            ? await this.hasRowBeyond(client, filter, orderedRows[0], "before")
            : false;
        }
      }

      // Counts and bounded facets are evaluated under the same REPEATABLE
      // READ snapshot as the page.  They are fixed-number aggregate queries,
      // never a per-card fan-out and never an artifact/Parquet scan.
      // One PostgreSQL client serializes commands.  Do not wrap these in
      // Promise.all: recent pg versions rightly warn about concurrent calls
      // on one active client, and separate pool connections would lose the
      // same-snapshot guarantee.  This is still a bounded fixed query count.
      const total = await client.query<CountRow>(
        "SELECT count(*) AS count FROM research.run_library_rows_v1 WHERE workspace_id = $1",
        [scope.workspaceId],
      );
      const filtered = await client.query<CountRow>(
        `SELECT count(*) AS count FROM ${filter.fromSql} WHERE ${filter.whereSql}`,
        filter.params,
      );
      const counters = await client.query<CountersRow>(
        `SELECT
             count(*) FILTER (WHERE library.source_kind = 'LEGACY_1_0_8_METADATA'
                                OR (library.source_kind = 'RESEARCH_DURABLE'
                                    AND library.relationship_kind = 'PRIMARY'
                                    AND library.run_kind = 'PRIMARY')) AS logical_runs,
             count(*) FILTER (WHERE library.source_kind = 'RESEARCH_DURABLE'
                                AND NOT (library.relationship_kind = 'PRIMARY' AND library.run_kind = 'PRIMARY')) AS worker_children,
             COALESCE(sum(GREATEST(COALESCE(library.current_worker_ordinal, 1) - 1, 0))
                        FILTER (WHERE library.source_kind = 'RESEARCH_DURABLE'), 0) AS technical_retries,
             count(*) FILTER (WHERE library.source_kind = 'LEGACY_1_0_8_METADATA') AS legacy_metadata_rows
             FROM ${filter.fromSql}
            WHERE ${filter.whereSql}`,
        filter.params,
      );
      // CG-P12-05: the six buckets partition the filtered rows.  A legacy
      // 1.0.8 row never had a source claim to wait for, and a durable run
      // cancelled before its source published a claim will never receive one;
      // neither is "pending".  A claim value outside the known vocabulary
      // stays pending rather than being guessed into issued/not-issued.
      const ledger = await client.query<ClaimLedgerRow>(
        `SELECT
             count(*) FILTER (WHERE library.effective_status = 'FAILED') AS failed,
             count(*) FILTER (WHERE library.effective_status <> 'FAILED'
                                AND library.source_kind = 'LEGACY_1_0_8_METADATA') AS legacy_metadata_only,
             count(*) FILTER (WHERE library.effective_status <> 'FAILED'
                                AND library.source_kind = 'RESEARCH_DURABLE'
                                AND library.progress_snapshot->'claim'->>'state' = 'ISSUED') AS issued,
             count(*) FILTER (WHERE library.effective_status <> 'FAILED'
                                AND library.source_kind = 'RESEARCH_DURABLE'
                                AND library.progress_snapshot->'claim'->>'state' IN ('FORECAST', 'NOT_ISSUED')) AS not_issued,
             count(*) FILTER (WHERE library.effective_status = 'CANCELLED'
                                AND library.source_kind = 'RESEARCH_DURABLE'
                                AND COALESCE(library.progress_snapshot->'claim'->>'state', '')
                                    NOT IN ('ISSUED', 'FORECAST', 'NOT_ISSUED')) AS cancelled_before_source,
             count(*) FILTER (WHERE library.effective_status NOT IN ('FAILED', 'CANCELLED')
                                AND library.source_kind = 'RESEARCH_DURABLE'
                                AND COALESCE(library.progress_snapshot->'claim'->>'state', '')
                                    NOT IN ('ISSUED', 'FORECAST', 'NOT_ISSUED')) AS pending_source
             FROM ${filter.fromSql}
            WHERE ${filter.whereSql}`,
        filter.params,
      );
      const alphas = await client.query<AlphaFacetRow>(
        `SELECT alpha_id, max(alpha_name) AS alpha_name
             FROM research.run_library_rows_v1
            WHERE workspace_id = $1 AND alpha_id IS NOT NULL AND alpha_name IS NOT NULL
            GROUP BY alpha_id
            ORDER BY lower(max(alpha_name)) ASC, alpha_id ASC
            LIMIT 200`,
        [scope.workspaceId],
      );
      // CG-P12-04: the mode facet lists optimization modes only.  The view's
      // `mode_key` falls back to a protocol for legacy/unparsed rows, which is
      // not a mode, so the facet reads the requested spec directly.
      const modes = await client.query<ModeFacetRow>(
        `SELECT requested_spec->>'optimization_mode' AS mode_key
             FROM research.run_library_rows_v1
            WHERE workspace_id = $1 AND source_kind = 'RESEARCH_DURABLE'
              AND requested_spec->>'optimization_mode' IS NOT NULL
            GROUP BY requested_spec->>'optimization_mode'
            ORDER BY requested_spec->>'optimization_mode' ASC
            LIMIT 32`,
        [scope.workspaceId],
      );
      // CG-P12-07: a legacy row is unbound history, not a scratch run.
      const scratch = await client.query<ScratchFacetRow>(
        `SELECT EXISTS(
             SELECT 1 FROM research.run_library_rows_v1
              WHERE workspace_id = $1 AND alpha_filter_key = 'scratch'
                AND source_kind = 'RESEARCH_DURABLE'
           ) AS scratch_available`,
        [scope.workspaceId],
      );

      const counter = counters.rows[0];
      const claim = ledger.rows[0];
      return {
        rows: orderedRows,
        asOfUtcMs,
        totalRows: asNonNegativeInteger(total.rows[0]?.count, "total count"),
        filteredRows: asNonNegativeInteger(filtered.rows[0]?.count, "filtered count"),
        hasMore,
        hasPrevious,
        counters: counter ? {
          logicalRuns: asNonNegativeInteger(counter.logical_runs, "logical run count"),
          workerChildren: asNonNegativeInteger(counter.worker_children, "child run count"),
          technicalRetries: asNonNegativeInteger(counter.technical_retries, "technical retry count"),
          legacyMetadataRows: asNonNegativeInteger(counter.legacy_metadata_rows, "legacy row count"),
        } : emptyCounters(),
        claimLedger: claim ? {
          issued: asNonNegativeInteger(claim.issued, "issued claim count"),
          notIssued: asNonNegativeInteger(claim.not_issued, "not-issued claim count"),
          pendingSource: asNonNegativeInteger(claim.pending_source, "pending claim count"),
          failed: asNonNegativeInteger(claim.failed, "failed claim count"),
          cancelledBeforeSource: asNonNegativeInteger(claim.cancelled_before_source, "cancelled claim count"),
          legacyMetadataOnly: asNonNegativeInteger(claim.legacy_metadata_only, "legacy claim count"),
        } : emptyLedger(),
        filterCatalog: {
          alphas: alphas.rows.map((row) => ({ alphaId: row.alpha_id, alphaName: row.alpha_name })),
          modes: modes.rows.map((row) => ({ key: row.mode_key, display: row.mode_key })),
          scratchAvailable: scratch.rows[0]?.scratch_available === true,
        },
      };
    });
  }

  /**
   * CG-P12-03: one bounded read of the persisted P13 EQUITY_OOS series for
   * the run's latest projection revision (<=192 points, <=32 KiB).  It
   * never opens an artifact, a worker path or Parquet.
   */
  async findSparklineSource(scope: ResearchScope, runId: string): Promise<RunLibrarySparklineSource | null> {
    this.assertScope(scope);
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<RunLibrarySparklineSource>(
        `SELECT library.run_id, library.source_kind, library.effective_status,
                library.source_latest_sequence, library.progress_snapshot,
                equity.projection_revision AS evidence_revision,
                equity.availability_state AS equity_availability_state,
                equity.reason_code AS equity_reason_code,
                equity.source_observation_count AS equity_source_observation_count,
                equity.emitted_point_count AS equity_emitted_point_count,
                equity.sampling AS equity_sampling,
                equity.series_payload AS equity_series_payload,
                equity.series_digest AS equity_series_digest
           FROM research.run_library_rows_v1 library
           LEFT JOIN LATERAL (
             SELECT projection.projection_revision, series.availability_state, series.reason_code,
                    series.source_observation_count, series.emitted_point_count, series.sampling,
                    series.series_payload, series.series_digest
               FROM research.run_producers producer
               JOIN research.run_evidence_projections_v1 projection
                 ON projection.workspace_id = producer.workspace_id
                AND projection.run_id = producer.run_id
                AND projection.worker_attempt_id = producer.worker_attempt_id
               LEFT JOIN research.run_evidence_series_v1 series
                 ON series.workspace_id = projection.workspace_id
                AND series.run_id = projection.run_id
                AND series.worker_attempt_id = projection.worker_attempt_id
                AND series.projection_revision = projection.projection_revision
                AND series.series_kind = 'EQUITY_OOS'
              WHERE library.source_kind = 'RESEARCH_DURABLE'
                AND producer.workspace_id = library.workspace_id
                AND producer.run_id = library.run_id
              ORDER BY projection.received_at DESC, projection.projection_revision DESC
              LIMIT 1
           ) equity ON true
          WHERE library.workspace_id = $1 AND library.run_id = $2`,
        [scope.workspaceId, runId],
      );
      return result.rows[0] ?? null;
    });
  }

  /**
   * Bounded per-selected-row joins (the page is <= 51 rows).  Both read only
   * persisted Portal relations: the P13 projection that the Screen-04 Hub
   * reads (same producer attempt, same newest-revision order) and the P21
   * release-candidate relations.  They never touch an artifact or worker.
   * The P13 projection is passed through without re-validating its private
   * schema so that additive metric keys (CG-P13-03) flow to the service.
   */
  private pageJoins(): string {
    return `LEFT JOIN LATERAL (
             SELECT projection.projection_revision,
                    (projection.projection - 'series_identity' - 'source') AS projection,
                    series.availability_state AS equity_state,
                    series.reason_code AS equity_reason
               FROM research.run_producers producer
               JOIN research.run_evidence_projections_v1 projection
                 ON projection.workspace_id = producer.workspace_id
                AND projection.run_id = producer.run_id
                AND projection.worker_attempt_id = producer.worker_attempt_id
               LEFT JOIN research.run_evidence_series_v1 series
                 ON series.workspace_id = projection.workspace_id
                AND series.run_id = projection.run_id
                AND series.worker_attempt_id = projection.worker_attempt_id
                AND series.projection_revision = projection.projection_revision
                AND series.series_kind = 'EQUITY_OOS'
              WHERE library.source_kind = 'RESEARCH_DURABLE'
                AND producer.workspace_id = library.workspace_id
                AND producer.run_id = library.run_id
              ORDER BY projection.received_at DESC, projection.projection_revision DESC
              LIMIT 1
           ) evidence ON true
           LEFT JOIN LATERAL (
             SELECT pack.release_candidate_id, delivery.delivery_state, delivery.approval_state,
                    floor(extract(epoch FROM pack.sealed_at) * 1000)::bigint AS sealed_at_utc_ms
               FROM research.release_candidate_packs_v1 pack
               JOIN research.release_candidate_delivery_states_v1 delivery
                 ON delivery.workspace_id = pack.workspace_id
                AND delivery.release_candidate_id = pack.release_candidate_id
              WHERE library.source_kind = 'RESEARCH_DURABLE'
                AND pack.workspace_id = library.workspace_id
                AND pack.run_id = library.run_id
              ORDER BY pack.sealed_at DESC, pack.release_candidate_id DESC
              LIMIT 1
           ) rc_pack ON true
           LEFT JOIN LATERAL (
             SELECT draft.draft_id
               FROM research.release_candidate_drafts_v1 draft
              WHERE library.source_kind = 'RESEARCH_DURABLE'
                AND draft.workspace_id = library.workspace_id
                AND draft.run_id = library.run_id
                AND draft.actor_user_id = current_setting('research.actor_user_id', true)
              LIMIT 1
           ) rc_draft ON true`;
  }

  private selectColumns(): string {
    return `SELECT library.workspace_id, library.run_id, library.attempt_id, library.source_kind,
              library.run_kind, library.relationship_kind, library.logical_run_key, library.parent_run_id,
              library.created_at, library.updated_at, library.effective_status, library.intent_kind,
              library.alpha_id, library.alpha_name, library.alpha_version_label, library.alpha_version_id,
              library.alpha_code_digest, library.legacy_request, library.requested_spec, library.portal_receipt,
              library.progress_snapshot, library.progress_received_at, library.source_latest_sequence,
              library.retention_floor_sequence, library.job_state, library.current_worker_ordinal,
              library.alpha_filter_key, library.mode_key,
              ${CREATED_AT_CURSOR_SQL} AS created_at_cursor,
              evidence.projection_revision AS evidence_revision,
              evidence.projection AS evidence_projection,
              evidence.equity_state AS evidence_equity_state,
              evidence.equity_reason AS evidence_equity_reason,
              rc_pack.release_candidate_id AS rc_release_candidate_id,
              rc_pack.delivery_state AS rc_delivery_state,
              rc_pack.approval_state AS rc_approval_state,
              rc_pack.sealed_at_utc_ms AS rc_sealed_at_utc_ms,
              rc_draft.draft_id AS rc_draft_id`;
  }

  private buildFilter(workspaceId: string, query: ResearchRunLibraryQuery): BuiltFilter {
    const clauses = ["library.workspace_id = $1"];
    const params: unknown[] = [workspaceId];
    let fromSql = "research.run_library_rows_v1 library";
    const parameter = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };
    if (query.q) {
      // P12 owns a trigger-maintained, GIN-indexed document for the real
      // historical search path.  Starting this exact identity join from the
      // search projection lets PostgreSQL use the trigram index rather than
      // evaluating a computed view expression for every durable/legacy row.
      // The projection key is unique, so this cannot duplicate a Library row.
      fromSql = `research.run_library_search_documents search
        JOIN research.run_library_rows_v1 library
          ON library.workspace_id = search.workspace_id
         AND library.source_kind = search.source_kind
         AND library.run_id = search.run_id`;
      clauses.push(`search.search_document ILIKE ${parameter(`%${escapeLike(query.q)}%`)} ESCAPE '\\'`);
    }
    if (query.status.length > 0) clauses.push(`library.effective_status = ANY(${parameter(query.status)}::text[])`);
    // CG-P12-04: filter on the optimization mode itself, never the legacy
    // protocol fallback that the view's `mode_key` carries.
    if (query.mode.length > 0) {
      clauses.push(`library.requested_spec->>'optimization_mode' = ANY(${parameter(query.mode)}::text[])`);
    }
    // CG-P12-07: an unbound legacy row is neither an alpha run nor scratch.
    if (query.alpha.length > 0) {
      clauses.push(`library.alpha_filter_key = ANY(${parameter(query.alpha)}::text[])`);
      clauses.push("library.source_kind = 'RESEARCH_DURABLE'");
    }
    if (query.ids.length > 0) clauses.push(`library.run_id = ANY(${parameter(query.ids)}::text[])`);
    return { fromSql, whereSql: clauses.join(" AND "), params };
  }

  private keysetPredicate(boundary: RunLibraryBoundary | null, params: unknown[]): string {
    if (!boundary) return "";
    params.push(boundary.createdAt, boundary.runId);
    const createdAt = `$${params.length - 1}::timestamptz`;
    const runId = `$${params.length}`;
    if (boundary.direction === "after") {
      return ` AND (library.created_at < ${createdAt} OR (library.created_at = ${createdAt} AND library.run_id < ${runId}))`;
    }
    return ` AND (library.created_at > ${createdAt} OR (library.created_at = ${createdAt} AND library.run_id > ${runId}))`;
  }

  /** One fixed edge probe keeps `has_*` truthful across concurrent updates. */
  private async hasRowBeyond(
    client: PoolClient,
    filter: BuiltFilter,
    row: Pick<RunLibraryRow, "created_at_cursor" | "run_id">,
    direction: "after" | "before",
  ): Promise<boolean> {
    const params = [...filter.params, row.created_at_cursor, row.run_id];
    const createdAt = `$${params.length - 1}::timestamptz`;
    const runId = `$${params.length}`;
    const predicate = direction === "after"
      ? `(library.created_at < ${createdAt} OR (library.created_at = ${createdAt} AND library.run_id < ${runId}))`
      : `(library.created_at > ${createdAt} OR (library.created_at = ${createdAt} AND library.run_id > ${runId}))`;
    const result = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM ${filter.fromSql}
          WHERE ${filter.whereSql} AND ${predicate}
       ) AS exists`,
      params,
    );
    return result.rows[0]?.exists === true;
  }

  private assertScope(scope: ResearchScope): void {
    if (!scope.workspaceId?.trim() || !scope.actorUserId?.trim()) {
      throw new ResearchRunLibraryError(
        "RESEARCH_RUN_LIBRARY_FORBIDDEN",
        "Authenticated Portal workspace scope is required.",
        403,
      );
    }
  }

  private async withScopedRead<T>(scope: ResearchScope, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const releaseAdmission = await this.acquireAdmission();
    let client: PoolClient | undefined;
    let began = false;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      began = true;
      try {
        await client.query(`SET LOCAL ROLE ${RESEARCH_DB_RUNTIME_ROLE}`);
      } catch {
        throw new ResearchRunLibraryError(
          "RESEARCH_RUN_LIBRARY_UNAVAILABLE",
          "Research Run Library authority is not configured.",
          503,
        );
      }
      await client.query("SELECT set_config('statement_timeout', $1, true)", [
        `${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`,
      ]);
      await client.query("SELECT set_config('lock_timeout', $1, true)", [
        `${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`,
      ]);
      await client.query("SELECT set_config('idle_in_transaction_session_timeout', $1, true)", [
        `${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`,
      ]);
      await client.query("SELECT set_config('research.workspace_id', $1, true)", [scope.workspaceId]);
      await client.query("SELECT set_config('research.actor_user_id', $1, true)", [scope.actorUserId]);
      const membership = await client.query(
        "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
        [scope.workspaceId, scope.actorUserId],
      );
      if (membership.rowCount !== 1) {
        throw new ResearchRunLibraryError("RESEARCH_RUN_LIBRARY_FORBIDDEN", "Access denied.", 403);
      }
      const result = await work(client);
      await client.query("COMMIT");
      began = false;
      return result;
    } catch (error) {
      if (began && client) await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof ResearchRunLibraryError) throw error;
      const code = typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
      if (code === "40001" || code === "40P01") {
        throw new ResearchRunLibraryError(
          "RESEARCH_RUN_LIBRARY_UNAVAILABLE",
          "Run Library changed concurrently; retry from the current page.",
          503,
        );
      }
      const wrapped = new ResearchRunLibraryError(
        "RESEARCH_RUN_LIBRARY_UNAVAILABLE",
        "Research Run Library is temporarily unavailable.",
        503,
      );
      // HTTP receives only the stable typed refusal, while structured server
      // logging and isolated tests retain the causal database error.  Do not
      // concatenate database text into the public message.
      (wrapped as Error & { cause?: unknown }).cause = error;
      throw wrapped;
    } finally {
      client?.release();
      releaseAdmission();
    }
  }

  private async acquireAdmission(): Promise<() => void> {
    if (this.activeReads < MAXIMUM_CONCURRENT_LIBRARY_READS) {
      this.activeReads += 1;
      return () => this.releaseAdmission();
    }
    if (this.waiters.length >= MAXIMUM_QUEUED_LIBRARY_READS) {
      throw new ResearchRunLibraryError(
        "RESEARCH_RUN_LIBRARY_UNAVAILABLE",
        "Research Run Library admission is temporarily saturated; retry shortly.",
        503,
      );
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    return () => this.releaseAdmission();
  }

  private releaseAdmission(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.activeReads -= 1;
  }
}
