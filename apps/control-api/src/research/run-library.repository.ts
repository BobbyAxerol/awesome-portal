/**
 * P12 persisted Run Library reader.
 *
 * This repository is intentionally a small read-only boundary.  It does not
 * receive an engine, an artifact store, a worker handle, a source database
 * credential, or an Execution relation.  Every list operation is one scoped
 * PostgreSQL transaction with a finite admission queue and a bounded number
 * of fixed aggregate queries; it never issues one query per displayed row.
 */

import { createHash } from "node:crypto";
import { enrichedJoin } from "./enriched-analysis.read";
import { Inject, Injectable } from "@nestjs/common";
import type { Pool, PoolClient } from "pg";

import { CONTROL_API_POOL } from "../tokens";
import { acquireResearchPoolClient, BoundedResearchReadAdmission } from "./bounded-read";
import { RESEARCH_DB_BUDGET, RESEARCH_DB_RUNTIME_ROLE, type ResearchScope } from "./contracts";
import type { ResearchRunLibraryQuery } from "./run-library.contract";
import { ResearchRunLibraryError } from "./run-library.error";
import { runDisplayOrdinalSql } from "./run-display-label";
import { DELTA_CAUSAL_INNER_PROFILE } from "./delta-causal-inner.profile";

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
  enriched_analysis?: JsonColumn;
  enriched_digest?: string | null;
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
  /** E10: why the P06 job closed (`CODE: sentence` for a control-side close). */
  job_terminal_reason?: string | null;
  mode_key: string | null;
  /** Exact microsecond keyset text; see RunLibraryBoundary. */
  created_at_cursor: string;
  /** Latest persisted P13 projection for the producer's worker attempt (durable only). */
  evidence_revision: string | null;
  evidence_projection: JsonColumn;
  evidence_equity_state: string | null;
  evidence_equity_reason: string | null;
  /** E11: immutable RS-02 seal used only when a P13 projection is absent. */
  retained_revision?: string | null;
  retained_summary?: JsonColumn;
  retained_candidate?: JsonColumn;
  retained_folds?: JsonColumn;
  /** Same-snapshot E11 aggregates; never a second service-level read. */
  retained_card_facts?: RunLibraryRetainedFacts | null;
  /** Latest persisted P21 Portal-local sealed pack for the run. */
  rc_release_candidate_id: string | null;
  rc_delivery_state: string | null;
  rc_approval_state: string | null;
  rc_sealed_at_utc_ms: string | number | null;
  /** The viewer's own persisted P21 draft for the run. */
  rc_draft_id: string | null;
  /** D1: the stored execution profile the run's kind token comes from. */
  display_profile_id: string | null;
  /** D1: this run's position among the logical runs of its own kind. */
  display_ordinal: string | number | null;
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
  retained_revision?: string | null;
  retained_source_observation_count?: string | number | null;
  retained_sampling?: string | null;
  retained_series_payload?: JsonRecord[] | string | null;
}

/**
 * E11 (HiFi audit 01-7) — the retained RS-02 facts a COMPLETED card needs.
 *
 * A Delta walk-forward run is never published through the P13 hub, so the
 * `evidence` lateral above finds nothing and the card printed
 * `P13_SOURCE_EVIDENCE_NOT_PUBLISHED` three times while Screen 04 showed the
 * numbers. Screen 10 already reads this lane (W6b CG-P19-05); Screen 01 did
 * not, which is the whole of the disagreement.
 *
 * Read from the newest seal per run: the selected trial's candidate row
 * (QuantBT's own means across folds) and the per-fold OOS trade counts.
 */
export interface RunLibraryRetainedFacts {
  run_id: string;
  artifact_revision: string | number;
  /** `trial_facts.metrics` of the selected trial's candidate row, or null. */
  metrics: JsonColumn;
  /** Sealed D-AN-01 block, null for immutable pre-v2 runs. */
  analytics_v2?: JsonColumn;
  analytics_v2_digest?: string | null;
  /** Folds retained for this seal. */
  fold_count: string | number;
  /** Folds whose `oos_score.oos_trade_count` is published. */
  trade_fold_count: string | number;
  /** Sum of those counts. Meaningless unless it covers every fold. */
  trade_sum: string | number | null;
  /** OBSERVATION rows the seal declares, for the sparkline's bounds. */
  observation_count: string | number;
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

/**
 * D3: status counts over the filtered rows, the HiFi's first summary line
 * ("7 runs · 5 completed · 1 running · 1 failed"). They partition
 * `filteredRows` exactly as the claim ledger does, and they come from the
 * same `effective_status` the cards print, so the line and the cards can
 * never disagree.
 */
export interface RunLibraryStatusCounts {
  completed: number;
  running: number;
  failed: number;
  queued: number;
  draft: number;
  cancelled: number;
  recoveryRequired: number;
}

export interface RunLibraryFilterCatalog {
  alphas: Array<{ alphaId: string; alphaName: string }>;
  modes: Array<{ key: string; display: string }>;
  scratchAvailable: boolean;
}

export interface RunLibraryPage {
  rows: RunLibraryRow[];
  /** Present (including empty) on the current repository's snapshot. */
  retainedFacts?: RunLibraryRetainedFacts[];
  /** PostgreSQL transaction timestamp for every count/page/facet in this DTO. */
  asOfUtcMs: number;
  totalRows: number;
  filteredRows: number;
  hasMore: boolean;
  hasPrevious: boolean;
  counters: RunLibraryCounters;
  claimLedger: RunLibraryClaimLedger;
  statusCounts: RunLibraryStatusCounts;
  filterCatalog: RunLibraryFilterCatalog;
}

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
/** D3: the HiFi's first summary line — status counts over the filtered rows. */
interface StatusCountRow {
  completed: string | number;
  running: string | number;
  failed: string | number;
  queued: string | number;
  draft: string | number;
  cancelled: string | number;
  recovery_required: string | number;
}
interface FilteredSummaryRow extends CountersRow, ClaimLedgerRow, StatusCountRow, FacetsRow, SnapshotTimestampRow {
  total_rows: string | number;
  filtered_rows: string | number;
}
interface AlphaFacetRow { alpha_id: string; alpha_name: string; }
interface ModeFacetRow { mode_key: string; }
interface FacetsRow { alphas: AlphaFacetRow[]; modes: ModeFacetRow[]; scratch_available: boolean; }

interface BuiltFilter {
  fromSql: string;
  whereSql: string;
  params: unknown[];
}
interface PendingPageRead {
  scope: ResearchScope;
  resolve: (page: RunLibraryPage) => void;
  reject: (error: unknown) => void;
}
interface PendingPageBatch {
  query: ResearchRunLibraryQuery;
  boundary: RunLibraryBoundary | null;
  entries: PendingPageRead[];
  timer: NodeJS.Timeout;
}
interface SharedPageRead {
  page: RunLibraryPage;
  members: ReadonlySet<string>;
  drafts: ReadonlyMap<string, string>;
}

// Four Library + four P03 operations leave two of the unchanged ten pooled
// connections for identity/other work. Admit one finite twenty-viewer burst.
export const RUN_LIBRARY_READ_LIMITS = Object.freeze({ maximumActive: 4, maximumQueued: 16 });
/** E11: a page is at most 50 rows plus the keyset probe row. */
const MAXIMUM_RETAINED_FACT_RUNS = 51;

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

function emptyStatusCounts(): RunLibraryStatusCounts {
  return { completed: 0, running: 0, failed: 0, queued: 0, draft: 0, cancelled: 0, recoveryRequired: 0 };
}

/**
 * Exact keyset text.  `to_char(... 'US')` always renders six fractional
 * digits, so the value round-trips through `::timestamptz` without loss.
 */
const CREATED_AT_CURSOR_SQL =
  `to_char(library.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/**
 * P12 has its own four-reader lane so it cannot starve identity, scheduler, or
 * P03 metadata writes in the shared ten-connection pool. Combined with the
 * existing P03 four-operation lane, Research remains below the pool cap even
 * under a Library refresh burst.  The queue is finite by design.
 */
@Injectable()
export class ResearchRunLibraryRepository {
  private readonly readAdmission = new BoundedResearchReadAdmission<ResearchRunLibraryError>({
    ...RUN_LIBRARY_READ_LIMITS,
    waitTimeoutMs: RESEARCH_DB_BUDGET.boundedReadQueueWaitMs,
    unavailable: () => new ResearchRunLibraryError(
      "RESEARCH_RUN_LIBRARY_UNAVAILABLE", "Research Run Library admission is temporarily saturated; retry shortly.", 503,
    ),
  });
  private readonly pendingPages = new Map<string, PendingPageBatch>();
  private pendingPageReaders = 0;

  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

  async list(
    scope: ResearchScope, query: ResearchRunLibraryQuery, boundary: RunLibraryBoundary | null,
  ): Promise<RunLibraryPage> {
    this.assertScope(scope);
    // No cache survives this bounded in-flight batch. One database snapshot
    // serves identical page queries; actor-owned drafts are joined separately
    // under that same snapshot and membership is checked for every actor.
    if (this.pendingPageReaders >= 20) {
      throw new ResearchRunLibraryError(
        "RESEARCH_RUN_LIBRARY_UNAVAILABLE", "Research Run Library admission is temporarily saturated; retry shortly.", 503,
      );
    }
    this.pendingPageReaders += 1;
    const key = JSON.stringify([scope.workspaceId, query, boundary]);
    return new Promise<RunLibraryPage>((resolve, reject) => {
      let batch = this.pendingPages.get(key);
      if (!batch) {
        batch = { query, boundary, entries: [], timer: setTimeout(() => this.flushPageBatch(key), 20) };
        this.pendingPages.set(key, batch);
      }
      batch.entries.push({ scope, resolve, reject });
      if (batch.entries.length === 20) {
        clearTimeout(batch.timer);
        queueMicrotask(() => this.flushPageBatch(key));
      }
    });
  }

  private async flushPageBatch(key: string): Promise<void> {
    const batch = this.pendingPages.get(key);
    if (!batch) return;
    this.pendingPages.delete(key);
    clearTimeout(batch.timer);
    const entries = batch.entries;
    const leader = entries[0]!;
    try {
      if (entries.length === 1) {
        leader.resolve(await this.listOnce(leader.scope, batch.query, batch.boundary));
        return;
      }
      const actors = [...new Set(entries.map((entry) => entry.scope.actorUserId))];
      let shared: SharedPageRead;
      try {
        shared = await this.listOnce(leader.scope, batch.query, batch.boundary, actors);
      } catch (error) {
        // If the elected leader was revoked after controller authorization,
        // preserve every other actor's individual membership decision.
        if (!(error instanceof ResearchRunLibraryError) || error.status !== 403) throw error;
        const settled = await Promise.allSettled(entries.map((entry) =>
          this.listOnce(entry.scope, batch.query, batch.boundary)));
        settled.forEach((result, index) => {
          if (result.status === "fulfilled") entries[index]!.resolve(result.value);
          else entries[index]!.reject(result.reason);
        });
        return;
      }
      for (const entry of entries) {
        if (!shared.members.has(entry.scope.actorUserId)) {
          entry.reject(new ResearchRunLibraryError("RESEARCH_RUN_LIBRARY_FORBIDDEN", "Access denied.", 403));
          continue;
        }
        entry.resolve({
          ...shared.page,
          rows: shared.page.rows.map((row) => ({
            ...row,
            rc_draft_id: shared.drafts.get(`${entry.scope.actorUserId}\0${row.run_id}`) ?? null,
          })),
        });
      }
    } catch (error) {
      for (const entry of entries) entry.reject(error);
    } finally {
      this.pendingPageReaders -= entries.length;
    }
  }

  private async listOnce(
    scope: ResearchScope, query: ResearchRunLibraryQuery, boundary: RunLibraryBoundary | null,
  ): Promise<RunLibraryPage>;
  private async listOnce(
    scope: ResearchScope, query: ResearchRunLibraryQuery, boundary: RunLibraryBoundary | null,
    actors: readonly string[],
  ): Promise<SharedPageRead>;
  private async listOnce(
    scope: ResearchScope, query: ResearchRunLibraryQuery, boundary: RunLibraryBoundary | null,
    actors?: readonly string[],
  ): Promise<RunLibraryPage | SharedPageRead> {
    return this.withScopedRead(scope, async (client) => {
      const filter = this.buildFilter(scope.workspaceId, query);
      // The unfiltered Screen-01 census is exactly the workspace catalog.
      // Reuse one narrow materialized view scan for its facets and counts;
      // filtered searches retain their indexed source and exact predicate.
      const unfiltered = !query.q && query.status.length === 0 && query.mode.length === 0
        && query.alpha.length === 0 && query.ids.length === 0;
      const aggregateSource = unfiltered ? "workspace_catalog library" : filter.fromSql;
      const aggregatePredicate = unfiltered ? "TRUE" : filter.whereSql;
      const claimState = unfiltered ? "library.claim_state" : "library.progress_snapshot->'claim'->>'state'";
      // This is deliberately PostgreSQL's transaction timestamp, rather than
      // the Control API process clock.  The page, counts, facets and this
      // provenance marker are therefore one repeatable-read snapshot even if
      // the host clock changes or a request spans a second boundary.
      const order = boundary?.direction === "before"
        ? "library.created_at ASC, library.run_id ASC"
        : "library.created_at DESC, library.run_id DESC";
      const pageParams = [...filter.params];
      const keyset = this.keysetPredicate(boundary, pageParams);
      pageParams.push(query.limit + 1);

      const rows = await client.query<RunLibraryRow>({
        // Bound the metadata page before any rich lateral readers. Every join
        // below returns at most one row, so this preserves keyset semantics
        // while preventing an older, larger workspace from hydrating history
        // just to sort away all but limit+1 cards.
        ...this.preparedRead(`WITH library_page AS MATERIALIZED (
           SELECT library.* FROM ${filter.fromSql}
            WHERE ${filter.whereSql}${keyset}
            ORDER BY ${order}
            LIMIT $${pageParams.length}
         )
         ${ResearchRunLibraryRepository.selectColumns(!actors)}
           FROM library_page library
           ${ResearchRunLibraryRepository.pageJoins(!actors)}
          ORDER BY ${order}`, pageParams),
      });
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
      // One scan/round-trip for the same filtered set. The failed count is
      // shared by the claim partition and status census: both use precisely
      // effective_status='FAILED'. All other predicates remain independent.
      const summary = await client.query<FilteredSummaryRow>({
        // Materialize only the narrow facet keys, never full row/artifact
        // payloads. Reuse that same workspace census for total + three facets;
        // bounded aggregate results may spill in PostgreSQL, not the API.
        ...this.preparedRead(`WITH workspace_catalog AS MATERIALIZED (
           SELECT alpha_id, alpha_name, source_kind, alpha_filter_key,
                  requested_spec->>'optimization_mode' AS mode_key
                  ${unfiltered ? ", relationship_kind, run_kind, current_worker_ordinal, effective_status, progress_snapshot->'claim'->>'state' AS claim_state" : ""}
             FROM research.run_library_rows_v1 WHERE workspace_id = $1
         )
         SELECT
             floor(extract(epoch FROM transaction_timestamp()) * 1000)::bigint AS as_of_utc_ms,
             (SELECT count(*) FROM workspace_catalog) AS total_rows,
             COALESCE((SELECT jsonb_agg(facet ORDER BY lower(facet.alpha_name), facet.alpha_id) FROM (
               SELECT alpha_id, max(alpha_name) AS alpha_name FROM workspace_catalog
                WHERE alpha_id IS NOT NULL AND alpha_name IS NOT NULL
                GROUP BY alpha_id ORDER BY lower(max(alpha_name)), alpha_id LIMIT 200
             ) facet), '[]'::jsonb) AS alphas,
             COALESCE((SELECT jsonb_agg(facet ORDER BY facet.mode_key) FROM (
               SELECT mode_key FROM workspace_catalog
                WHERE source_kind = 'RESEARCH_DURABLE' AND mode_key IS NOT NULL
                GROUP BY mode_key ORDER BY mode_key LIMIT 32
             ) facet), '[]'::jsonb) AS modes,
             EXISTS(SELECT 1 FROM workspace_catalog
               WHERE alpha_filter_key = 'scratch' AND source_kind = 'RESEARCH_DURABLE') AS scratch_available,
             count(*) AS filtered_rows,
             count(*) FILTER (WHERE library.source_kind = 'LEGACY_1_0_8_METADATA'
                                OR (library.source_kind = 'RESEARCH_DURABLE'
                                    AND library.relationship_kind = 'PRIMARY'
                                    AND library.run_kind = 'PRIMARY')) AS logical_runs,
             count(*) FILTER (WHERE library.source_kind = 'RESEARCH_DURABLE'
                                AND NOT (library.relationship_kind = 'PRIMARY' AND library.run_kind = 'PRIMARY')) AS worker_children,
             COALESCE(sum(GREATEST(COALESCE(library.current_worker_ordinal, 1) - 1, 0))
                        FILTER (WHERE library.source_kind = 'RESEARCH_DURABLE'), 0) AS technical_retries,
             count(*) FILTER (WHERE library.source_kind = 'LEGACY_1_0_8_METADATA') AS legacy_metadata_rows,
             count(*) FILTER (WHERE library.effective_status = 'FAILED') AS failed,
             count(*) FILTER (WHERE library.effective_status <> 'FAILED'
                                AND library.source_kind = 'LEGACY_1_0_8_METADATA') AS legacy_metadata_only,
             count(*) FILTER (WHERE library.effective_status <> 'FAILED'
                                AND library.source_kind = 'RESEARCH_DURABLE'
                                AND ${claimState} = 'ISSUED') AS issued,
             count(*) FILTER (WHERE library.effective_status <> 'FAILED'
                                AND library.source_kind = 'RESEARCH_DURABLE'
                                AND ${claimState} IN ('FORECAST', 'NOT_ISSUED')) AS not_issued,
             count(*) FILTER (WHERE library.effective_status = 'CANCELLED'
                                AND library.source_kind = 'RESEARCH_DURABLE'
                                AND COALESCE(${claimState}, '')
                                    NOT IN ('ISSUED', 'FORECAST', 'NOT_ISSUED')) AS cancelled_before_source,
             count(*) FILTER (WHERE library.effective_status NOT IN ('FAILED', 'CANCELLED')
                                AND library.source_kind = 'RESEARCH_DURABLE'
                                AND COALESCE(${claimState}, '')
                                    NOT IN ('ISSUED', 'FORECAST', 'NOT_ISSUED')) AS pending_source,
             count(*) FILTER (WHERE library.effective_status = 'COMPLETED') AS completed,
             count(*) FILTER (WHERE library.effective_status = 'RUNNING') AS running,
             count(*) FILTER (WHERE library.effective_status = 'QUEUED') AS queued,
             count(*) FILTER (WHERE library.effective_status = 'DRAFT') AS draft,
             count(*) FILTER (WHERE library.effective_status = 'CANCELLED') AS cancelled,
             count(*) FILTER (WHERE library.effective_status = 'RECOVERY_REQUIRED') AS recovery_required
             FROM ${aggregateSource}
            WHERE ${aggregatePredicate}`, filter.params),
      });
      const counter = summary.rows[0];
      const asOfUtcMs = asNonNegativeInteger(counter?.as_of_utc_ms, "snapshot timestamp");
      const claim = counter;
      const status = counter;
      const page: RunLibraryPage = {
        rows: orderedRows,
        retainedFacts: orderedRows.flatMap((row) => row.retained_card_facts ? [row.retained_card_facts] : []),
        asOfUtcMs,
        totalRows: asNonNegativeInteger(counter?.total_rows, "total count"),
        filteredRows: asNonNegativeInteger(counter?.filtered_rows, "filtered count"),
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
        statusCounts: status ? {
          completed: asNonNegativeInteger(status.completed, "completed count"),
          running: asNonNegativeInteger(status.running, "running count"),
          failed: asNonNegativeInteger(status.failed, "failed count"),
          queued: asNonNegativeInteger(status.queued, "queued count"),
          draft: asNonNegativeInteger(status.draft, "draft count"),
          cancelled: asNonNegativeInteger(status.cancelled, "cancelled count"),
          recoveryRequired: asNonNegativeInteger(status.recovery_required, "recovery count"),
        } : emptyStatusCounts(),
        filterCatalog: {
          alphas: (counter?.alphas ?? []).map((row) => ({ alphaId: row.alpha_id, alphaName: row.alpha_name })),
          modes: (counter?.modes ?? []).map((row) => ({ key: row.mode_key, display: row.mode_key })),
          scratchAvailable: counter?.scratch_available === true,
        },
      };
      if (!actors) return page;
      const memberRows = await client.query<{ user_id: string }>(
        "SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND user_id = ANY($2::text[])",
        [scope.workspaceId, actors],
      );
      const members = new Set(memberRows.rows.map((row) => row.user_id));
      const drafts = new Map<string, string>();
      if (page.rows.length > 0 && members.size > 0) {
        const draftRows = await client.query<{ actor_user_id: string; run_id: string; draft_id: string }>(
          `SELECT actor_user_id, run_id, draft_id
             FROM research.release_candidate_drafts_v1
            WHERE workspace_id = $1 AND actor_user_id = ANY($2::text[]) AND run_id = ANY($3::text[])`,
          [scope.workspaceId, [...members], page.rows.map((row) => row.run_id)],
        );
        for (const row of draftRows.rows) drafts.set(`${row.actor_user_id}\0${row.run_id}`, row.draft_id);
      }
      return { page, members, drafts };
    });
  }

  /**
   * E11 (audit 01-7): the retained RS-02 facts of the given runs, in one
   * bounded read of the newest seal per run.
   *
   * The SQL is the one Screen 10 already runs (W6b CG-P19-05,
   * `lineage.repository.ts`), plus the per-fold OOS trade counts and the
   * seal's observation count. Nothing is opened: `current_source_seals_v1`
   * and `current_source_rows_v1` are Portal relations, like every other join
   * on this page.
   *
   * `runIds` is the page (<= 51 rows), so the `= ANY` stays bounded.
   */
  async retainedFacts(scope: ResearchScope, runIds: readonly string[]): Promise<RunLibraryRetainedFacts[]> {
    this.assertScope(scope);
    if (runIds.length === 0) return [];
    if (runIds.length > MAXIMUM_RETAINED_FACT_RUNS) {
      throw new ResearchRunLibraryError(
        "RESEARCH_RUN_LIBRARY_UNAVAILABLE",
        "Run Library retained-fact read exceeds its admitted bound.",
        503,
      );
    }
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<RunLibraryRetainedFacts>(
        `SELECT seal.run_id,
                seal.artifact_revision,
                candidate.payload->'trial_facts'->'metrics' AS metrics,
                COALESCE(seal.summary->'summary_analytics_v2', sidecar.analytics) AS analytics_v2,
                sidecar.analytics_digest AS analytics_v2_digest,
                folds.fold_count,
                folds.trade_fold_count,
                folds.trade_sum,
                COALESCE((seal.table_rows->>'OBSERVATION')::bigint, 0) AS observation_count
           FROM unnest($2::text[]) AS wanted(run_id)
           JOIN LATERAL (
             SELECT source.workspace_id, source.run_id, source.artifact_revision, source.retained_import_digest, source.summary, source.table_rows,
                    source.source_adapter_id, source.profile_id
               FROM research.current_source_seals_v1 source
              WHERE source.workspace_id = $1 AND source.run_id = wanted.run_id
              ORDER BY source.artifact_revision DESC
              LIMIT 1
           ) seal ON TRUE
           LEFT JOIN research.current_source_analytics_sidecars_v2 sidecar
             ON sidecar.workspace_id = seal.workspace_id AND sidecar.run_id = seal.run_id
            AND sidecar.artifact_revision = seal.artifact_revision
            AND sidecar.retained_import_digest = seal.retained_import_digest
           LEFT JOIN LATERAL (
             SELECT row.payload
               FROM research.current_source_rows_v1 row
              WHERE row.workspace_id = seal.workspace_id
                AND row.run_id = seal.run_id
                AND row.artifact_revision = seal.artifact_revision
                AND row.table_kind = 'CANDIDATE'
                -- Causal candidates score INNER validation, not the run's outer OOS.
                AND (seal.source_adapter_id IS DISTINCT FROM '${DELTA_CAUSAL_INNER_PROFILE.current_source.source_adapter_id}'
                  OR seal.profile_id IS DISTINCT FROM '${DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id}')
                AND row.payload->'trial_facts'->>'source_trial_id' = seal.summary->'selection'->>'trial_id'
                AND row.payload->>'objective' IS NOT DISTINCT FROM seal.summary->'selection'->>'objective'
              ORDER BY row.source_ordinal ASC
              LIMIT 1
           ) candidate ON TRUE
           LEFT JOIN LATERAL (
             SELECT count(*) AS fold_count,
                    count(row.payload->'fold_facts'->'oos_score'->>'oos_trade_count') AS trade_fold_count,
                    sum((row.payload->'fold_facts'->'oos_score'->>'oos_trade_count')::numeric) AS trade_sum
               FROM research.current_source_rows_v1 row
              WHERE row.workspace_id = seal.workspace_id
                AND row.run_id = seal.run_id
                AND row.artifact_revision = seal.artifact_revision
                AND row.table_kind = 'FOLD'
           ) folds ON TRUE`,
        [scope.workspaceId, [...runIds]],
      );
      return result.rows;
    });
  }

  /**
   * E11: the retained OBSERVATION equity of one run, bucketed in the database
   * to at most `maximum` rows so the sparkline never reads a whole tape.
   *
   * The bucket rule is the retained lane's own (`OBSERVATION_EXTREMA_BUCKET_V2`
   * in `current-source.repository.ts`) reduced to first/last/min/max per
   * bucket: a sparkline that dropped an extremum would flatten the very shape
   * it exists to show.
   */
  async findRetainedSparklineValues(
    scope: ResearchScope,
    runId: string,
    artifactRevision: number,
    maximum: number,
  ): Promise<Array<{ at_utc_ms: string | number | null; equity: string; oos_count: string | number }>> {
    this.assertScope(scope);
    const buckets = Math.max(1, Math.floor(maximum / 4));
    return this.withScopedRead(scope, async (client) => {
      const result = await client.query<{ at_utc_ms: string | number | null; equity: string; oos_count: string | number }>(
        `WITH scoped AS (
           SELECT observation.source_ordinal, observation.occurred_at_utc_ms,
                  observation.payload->>'equity' AS equity,
                  (observation.payload->>'equity')::numeric AS equity_numeric,
                  row_number() OVER (ORDER BY observation.source_ordinal) - 1 AS oos_ordinal,
                  count(*) OVER () AS oos_count
             FROM research.current_source_rows_v1 observation
            WHERE observation.workspace_id = $1 AND observation.run_id = $2
              AND observation.artifact_revision = $3 AND observation.table_kind = 'OBSERVATION'
              AND EXISTS (
                SELECT 1 FROM research.current_source_rows_v1 fold
                 WHERE fold.workspace_id = observation.workspace_id
                   AND fold.run_id = observation.run_id
                   AND fold.artifact_revision = observation.artifact_revision
                   AND fold.table_kind = 'FOLD'
                   AND observation.occurred_at_utc_ms BETWEEN
                       (fold.payload->>'test_start_utc_ms')::bigint AND
                       (fold.payload->>'test_end_utc_ms')::bigint
              )
         ), obs AS (
           SELECT *, (oos_ordinal * $5::bigint) / oos_count AS bucket FROM scoped
         ), picks AS (
           (SELECT DISTINCT ON (bucket) source_ordinal FROM obs ORDER BY bucket, source_ordinal ASC)
           UNION (SELECT DISTINCT ON (bucket) source_ordinal FROM obs ORDER BY bucket, source_ordinal DESC)
           UNION (SELECT DISTINCT ON (bucket) source_ordinal FROM obs ORDER BY bucket, equity_numeric ASC, source_ordinal ASC)
           UNION (SELECT DISTINCT ON (bucket) source_ordinal FROM obs ORDER BY bucket, equity_numeric DESC, source_ordinal ASC)
         )
         SELECT obs.occurred_at_utc_ms AS at_utc_ms, obs.equity, obs.oos_count
           FROM obs JOIN picks ON picks.source_ordinal = obs.source_ordinal
          ORDER BY obs.source_ordinal ASC
          LIMIT $4`,
        [scope.workspaceId, runId, artifactRevision, maximum, buckets],
      );
      return result.rows;
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
   * P13 metric maps pass through without re-validating private metric keys
   * (CG-P13-03). Full candle/fold payloads belong to their named readers, not
   * to a Library card or the shared P19 card mapping.
   */
  /** Shared with the P19 lineage reader (W6b CG-P19-05), which reads the same rows in its own snapshot. */
  static pageJoins(includeActorDraft = true): string {
    return `LEFT JOIN LATERAL (
             SELECT enrichment.enriched,enrichment.enriched_digest
               FROM (SELECT library.workspace_id,library.run_id) wanted
               ${enrichedJoin("wanted.workspace_id", "wanted.run_id")}
           ) enriched ON true
           LEFT JOIN LATERAL (
             SELECT projection.projection_revision,
                    jsonb_build_object(
                      'metric_registry_version', projection.projection->'metric_registry_version',
                      'metrics', projection.projection->'metrics',
                      'direct', projection.projection->'direct',
                      'derived', projection.projection->'derived',
                      'oos_analytics', projection.projection->'oos_analytics',
                      'summary_analytics_v2', projection.projection->'summary_analytics_v2') AS projection,
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
             SELECT seal.artifact_revision, seal.summary->'selection' AS selection, seal.table_rows,
                    seal.retained_import_digest, seal.summary->'summary_analytics_v2' AS analytics_v2,
                    seal.source_adapter_id, seal.profile_id
               FROM research.current_source_seals_v1 seal
              WHERE library.source_kind = 'RESEARCH_DURABLE'
                AND seal.workspace_id = library.workspace_id
                AND seal.run_id = library.run_id
              ORDER BY seal.artifact_revision DESC
              LIMIT 1
           ) retained ON true
           LEFT JOIN research.current_source_analytics_sidecars_v2 retained_sidecar
             ON retained_sidecar.workspace_id = library.workspace_id
            AND retained_sidecar.run_id = library.run_id
            AND retained_sidecar.artifact_revision = retained.artifact_revision
            AND retained_sidecar.retained_import_digest = retained.retained_import_digest
           LEFT JOIN LATERAL (
             SELECT row.payload->'trial_facts'->'metrics' AS metrics
               FROM research.current_source_rows_v1 row
              WHERE row.workspace_id = library.workspace_id
                AND row.run_id = library.run_id
                AND row.artifact_revision = retained.artifact_revision
                AND row.table_kind = 'CANDIDATE'
                -- Exclude only the exact causal pair; historical/unknown lanes keep their projection.
                AND (retained.source_adapter_id IS DISTINCT FROM '${DELTA_CAUSAL_INNER_PROFILE.current_source.source_adapter_id}'
                  OR retained.profile_id IS DISTINCT FROM '${DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id}')
                AND row.payload->'trial_facts'->>'source_trial_id' = retained.selection->>'trial_id'
                AND row.payload->>'objective' IS NOT DISTINCT FROM retained.selection->>'objective'
              ORDER BY row.source_ordinal ASC
              LIMIT 1
           ) retained_selected ON true
           LEFT JOIN LATERAL (
             SELECT count(*) AS fold_count,
                    count(row.payload->'fold_facts'->'oos_score'->>'oos_trade_count') AS trade_fold_count,
                    sum((row.payload->'fold_facts'->'oos_score'->>'oos_trade_count')::numeric) AS trade_sum
               FROM research.current_source_rows_v1 row
              WHERE evidence.projection_revision IS NULL
                AND row.workspace_id = library.workspace_id
                AND row.run_id = library.run_id
                AND row.artifact_revision = retained.artifact_revision
                AND row.table_kind = 'FOLD'
           ) retained_card_counts ON true
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
           ${includeActorDraft ? `LEFT JOIN LATERAL (
             SELECT draft.draft_id
               FROM research.release_candidate_drafts_v1 draft
              WHERE library.source_kind = 'RESEARCH_DURABLE'
                AND draft.workspace_id = library.workspace_id
                AND draft.run_id = library.run_id
                AND draft.actor_user_id = current_setting('research.actor_user_id', true)
              LIMIT 1
           ) rc_draft ON true` : ""}
           LEFT JOIN research.run_producers label_producer
             ON label_producer.workspace_id = library.workspace_id
            AND label_producer.run_id = library.run_id`;
  }

  static selectColumns(includeActorDraft = true): string {
    return `SELECT library.workspace_id, library.run_id, library.attempt_id, library.source_kind,
              library.run_kind, library.relationship_kind, library.logical_run_key, library.parent_run_id,
              library.created_at, library.updated_at, library.effective_status, library.intent_kind,
              library.alpha_id, library.alpha_name, library.alpha_version_label, library.alpha_version_id,
              library.alpha_code_digest, library.legacy_request, library.requested_spec, library.portal_receipt,
              library.progress_snapshot, library.progress_received_at, library.source_latest_sequence,
              library.retention_floor_sequence, library.job_state, library.current_worker_ordinal,
              library.alpha_filter_key, library.mode_key, library.job_terminal_reason,
              ${CREATED_AT_CURSOR_SQL} AS created_at_cursor,
              evidence.projection_revision AS evidence_revision,
              enriched.enriched AS enriched_analysis, enriched.enriched_digest,
              evidence.projection AS evidence_projection,
              evidence.equity_state AS evidence_equity_state,
              evidence.equity_reason AS evidence_equity_reason,
              CASE WHEN retained.artifact_revision IS NOT NULL AND evidence.projection_revision IS NULL
                        AND library.source_kind = 'RESEARCH_DURABLE' AND library.effective_status = 'COMPLETED'
                   THEN jsonb_build_object('run_id', library.run_id, 'artifact_revision', retained.artifact_revision::text,
                     'metrics', retained_selected.metrics,
                     'analytics_v2', COALESCE(retained.analytics_v2, retained_sidecar.analytics),
                     'analytics_v2_digest', retained_sidecar.analytics_digest,
                     'fold_count', retained_card_counts.fold_count::text,
                     'trade_fold_count', retained_card_counts.trade_fold_count::text,
                     'trade_sum', retained_card_counts.trade_sum::text,
                     'observation_count', COALESCE(retained.table_rows->>'OBSERVATION', '0'))
                   ELSE NULL END AS retained_card_facts,
              rc_pack.release_candidate_id AS rc_release_candidate_id,
              rc_pack.delivery_state AS rc_delivery_state,
              rc_pack.approval_state AS rc_approval_state,
              rc_pack.sealed_at_utc_ms AS rc_sealed_at_utc_ms,
              ${includeActorDraft ? "rc_draft.draft_id" : "NULL::text"} AS rc_draft_id,
              label_producer.execution_profile_id AS display_profile_id,
              ${runDisplayOrdinalSql("library", "label_producer")} AS display_ordinal`;
  }

  private preparedRead(text: string, values: unknown[]): { name: string; text: string; values: unknown[] } {
    // Five optional filter bits and three keyset shapes give <=128 fixed
    // page/census statements per existing pooled connection. Values, actors,
    // workspace IDs and cursors never enter a statement name. This caches SQL
    // parsing, not data: RLS/context/membership still execute on every read.
    return { name: `research_p12_v2_${createHash("sha256").update(text).digest("hex").slice(0, 32)}`, text, values };
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
    const releaseAdmission = await this.readAdmission.acquire();
    let client: PoolClient | undefined;
    let began = false;
    try {
      client = await acquireResearchPoolClient(
        this.pool.connect(), RESEARCH_DB_BUDGET.boundedReadAcquireTimeoutMs,
        () => new ResearchRunLibraryError(
          "RESEARCH_RUN_LIBRARY_UNAVAILABLE", "Run Library database acquisition timed out.", 503,
        ),
      );
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
      await client.query(
        `SELECT set_config('statement_timeout', $1, true),
                set_config('lock_timeout', $2, true),
                set_config('idle_in_transaction_session_timeout', $3, true),
                set_config('research.workspace_id', $4, true),
                set_config('research.actor_user_id', $5, true)`,
        [`${RESEARCH_DB_BUDGET.statementTimeoutMs}ms`, `${RESEARCH_DB_BUDGET.lockTimeoutMs}ms`,
          `${RESEARCH_DB_BUDGET.idleTransactionTimeoutMs}ms`, scope.workspaceId, scope.actorUserId],
      );
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

}
