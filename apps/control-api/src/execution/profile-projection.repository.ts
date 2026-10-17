import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import type { QueryResult, QueryResultRow } from "pg";
import { RetainedDataFlights } from "./retained-data-flights";
import { EXECUTION_DATA_POOL, CONTROL_API_CONFIG, EXECUTION_DURABLE_MIRROR_WRITER } from "../tokens";
import type { ControlApiConfig } from "../config";
import type {
  DurableMirrorRelationCursor,
  DurableMirrorRetainedRangeRows,
  DurableMirrorWriter,
} from "./durable-mirror.contract";
import {
  PROFILE_OBSERVATION_OPERATION_ID,
  profileObservationAffectedScreens,
  profileObservationRevalidation,
} from "./profile-projection.catalog";
import { durableMirrorReadEnabled } from "./durable-mirror-mode";
import { retainedReview, RETAINED_DATA_VIEW_CACHE_MAXIMUM_SERIALIZED_BYTES } from "./retained-read-profile";
import { retainedSnapshot, retainedRevision } from "./retained-snapshot";
import { withTransaction } from "../db/pool";
import { projectionScopeSql } from "../execution-v2/read-projection";
import { assertExecutionReadScope, ExecutionReadScopeError, scopeReadPopulation, scopeAllowsQueryField,
  type AuthorizedExecutionReadScope } from "../execution-v2/read-scope";

export type ProjectionEnvironment = "paper" | "sandbox" | "live";
export type ProjectionCompleteness = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type ProjectionFreshness = "FRESH" | "AGING" | "STALE" | "UNKNOWN";
export type ProjectionScalar = string | number | boolean | null | readonly (string | number | boolean | null)[];

export interface ProjectionHistoryQuery {
  from?: string | null;
  to?: string | null;
  after?: { ts: string; rowId: string } | null;
  entity?: { field: string; value: string } | null;
  limit: number;
  order?: "ASC" | "DESC";
  /** Internal capability only; never deserialized from browser input. */
  scope?: AuthorizedExecutionReadScope;
}

export interface ProjectionRow {
  lineage: {
    workspace_id: string;
    profile_id: string;
    source_contract_revision: string;
    /**
     * The accepted Manager catalogue identity under which this row entered
     * the Portal projection.  It is contract provenance, not a source-event
     * sequence or an assertion that the row is replayable.
     */
    source_catalogue_sha256?: string;
  };
  fields: Record<string, ProjectionScalar>;
}

export interface ProjectionRelation {
  source_id: string;
  relation: string;
  availability: "AVAILABLE" | "UNAVAILABLE";
  reason_code: string | null;
  as_of: string | null;
  freshness: ProjectionFreshness;
  completeness: ProjectionCompleteness;
  /** Additive R3 contract provenance; absent only on pre-R3 retained rows. */
  source_catalogue_sha256?: string;
  items: ProjectionRow[];
  /** P4-D window ladder: a time-series relation states its merged window. */
  window?: { days: number; max_rows: number; basis: "MERGED_SNAPSHOT_LADDER"; truncated: boolean };
  /** P4-D lineage observability: rejects by missing-parent class, when any. */
  lineage_rejects?: Readonly<Record<string, number>>;
  /** Rows that belong to another profile — the filter working, not a loss. */
  lineage_scoped_out?: Readonly<Record<string, number>>;
}

export interface ProfileProjectionDocument {
  schema_version: "portal.execution.profile-projection.v1";
  workspace_id: string;
  environment: ProjectionEnvironment;
  profile_id: string;
  source_contract_revision: string;
  /** Additive R3 contract provenance; legacy documents remain honestly null. */
  source_catalogue_sha256?: string;
  relations: Record<string, ProjectionRelation>;
}

export interface ProfileProjectionSnapshot {
  document: ProfileProjectionDocument;
  sourceEpoch: string;
  sourceCursor: string;
  sourceAsOf: Date | null;
  receivedAt: Date;
  lastSuccessfulRefreshAt: Date;
  completeness: ProjectionCompleteness;
  projectionEpoch: string;
  projectionSequence: number;
  payloadDigest: string;
  /** Exact persisted source catalogue digest, null only for pre-R3 snapshots. */
  sourceCatalogueSha256: string | null;
}

/**
 * Operational state for one source coordinator.  It intentionally says
 * nothing about Trading System event authority or row history: it records
 * only whether the Portal should wait before its next bounded current-page
 * refresh after a transient source failure.
 */
export type ProjectionRefreshState = "HEALTHY" | "RECOVERING";

export interface ProfileProjectionRefreshHealth {
  state: ProjectionRefreshState;
  consecutiveFailures: number;
  /** Present only while recovering; it is a sanitized Portal error code. */
  reasonCode: string | null;
  lastFailureAt: Date | null;
  retryNotBefore: Date | null;
  lastRecoveredAt: Date | null;
}

export interface ProfileProjectionJournalEntry {
  workspaceId: string;
  environment: ProjectionEnvironment;
  profileId: string;
  projectionEpoch: string;
  projectionSequence: number;
  sourceAsOf: Date | null;
  receivedAt: Date;
  completeness: ProjectionCompleteness;
  payloadDigest: string;
  /** Always Portal-local; never a Trading System lifecycle Event authority. */
  observationAuthority: "PORTAL_OBSERVATION";
  /** The current read plane has no history/replay/correction semantics. */
  observationSemantics: "BOUNDED_CURRENT_PAGE";
  /** Null only for pre-EDS-09b retained journal rows; never inferred. */
  sourceContractRevision: string | null;
  /** Null only for pre-R3 retained journal rows; never inferred. */
  sourceCatalogueSha256: string | null;
  payload: Record<string, unknown>;
}

export interface ProjectionCommitReceipt {
  outcome: "COMMITTED" | "QUARANTINED";
  changed: boolean;
  reasonCode: "EDS09B_DURABLE_OBSERVATION_QUARANTINED" | null;
  /** Internal diagnostic coordinates only. They are never emitted to a browser on quarantine. */
  projectionEpoch: string;
  projectionSequence: number;
  payloadDigest: string;
}

export interface ProjectionCommitInput {
  sourceEpoch: string;
  sourceCursor: string;
  sourceAsOf: Date | null;
  receivedAt: Date;
  completeness: ProjectionCompleteness;
  retentionSeconds: number;
  maximumJournalEntries: number;
  /** Raw source checkpoints remain server-only and now share the commit transaction. */
  relationCursors?: readonly DurableMirrorRelationCursor[];
  /** Raw accepted range rows stay out of the bounded compatibility JSONB snapshot. */
  retainedRangeRows?: DurableMirrorRetainedRangeRows;
  /** Optional qualified new-family projection, applied with the same checkpoint transaction. No runtime producer installs it yet. */
  managerModel?: import("../execution-v2/manager-model.store").PreparedManagerProjection;
}

@Injectable()
export class ExecutionProfileProjectionRepository {
  constructor(
    @Inject(EXECUTION_DATA_POOL) readonly pool: Pool,
    @Optional() @Inject(EXECUTION_DURABLE_MIRROR_WRITER)
    private readonly durableMirror?: DurableMirrorWriter,
    @Optional() @Inject(CONTROL_API_CONFIG)
    private readonly config?: Pick<
      ControlApiConfig,
      "FEATURE_EXECUTION_DURABLE_MIRROR" | "FEATURE_EXECUTION_DURABLE_MIRROR_READS"
    > & { EXECUTION_READ_PROFILE?: string },
  ) {}

  /**
   * The one place that decides which store a retained-history read comes from.
   *
   * EDS-06 introduced the mirror while `execution_timeseries_history` was still
   * live, and nothing declared which one wins. The two cutovers must not be
   * conflated: `FEATURE_EXECUTION_DURABLE_MIRROR` begins the writer path, while
   * `FEATURE_EXECUTION_DURABLE_MIRROR_READS` is the separately qualified read
   * cutover. In between, the worker dual-writes and this repository continues
   * to read the compatible history table.
   *
   * Both tables carry the same columns for every predicate these reads use
   * (`workspace_id, environment, profile_id, relation_key, row_id, ts, fields`),
   * so the read switch is a name, chosen once, and every history reader follows
   * it. Relations the mirror keeps as current entities are not range rows in
   * either store, so this swap adds no row a caller could not already see.
   */
  private historyTable(): string {
    return this.config && durableMirrorReadEnabled(this.config)
      ? "execution_durable_mirror_range_rows"
      : "execution_timeseries_history";
  }

  async tryAcquireLease(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    ownerId: string,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO execution_profile_projection_leases
         (workspace_id, environment, profile_id, owner_id, lease_expires_at)
       VALUES ($1,$2,$3,$4,clock_timestamp() + ($5::text || ' milliseconds')::interval)
       ON CONFLICT (workspace_id, environment, profile_id) DO UPDATE SET
         owner_id = EXCLUDED.owner_id,
         lease_expires_at = EXCLUDED.lease_expires_at,
         updated_at = clock_timestamp()
       WHERE execution_profile_projection_leases.lease_expires_at <= clock_timestamp()
          OR execution_profile_projection_leases.owner_id = EXCLUDED.owner_id
       RETURNING owner_id`,
      [workspaceId, environment, profileId, ownerId, ttlMs],
    );
    return result.rowCount === 1;
  }

  async releaseLease(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    ownerId: string,
  ): Promise<void> {
    await this.pool.query(
      `DELETE FROM execution_profile_projection_leases
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND owner_id=$4`,
      [workspaceId, environment, profileId, ownerId],
    );
  }

  /**
   * Read the durable recovery decision for one profile.  A missing row is
   * deliberately healthy: operational status is created only after the first
   * committed refresh or transient failure, and must never make a profile
   * without a snapshot appear ready.
   */
  async refreshHealth(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
  ): Promise<ProfileProjectionRefreshHealth> {
    return await this.refreshHealthObservation(workspaceId, environment, profileId) ?? healthyRefreshHealth();
  }

  /** Scalar persisted observation. Unlike the legacy scheduler convenience
   * reader above, absence is never converted into an observed HEALTHY fact. */
  async refreshHealthObservation(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
  ): Promise<ProfileProjectionRefreshHealth | null> {
    const result = await this.pool.query<{
      state: ProjectionRefreshState;
      consecutive_failures: number;
      last_failure_code: string | null;
      last_failure_at: Date | null;
      retry_not_before: Date | null;
      last_recovered_at: Date | null;
    }>(
      `SELECT state, consecutive_failures, last_failure_code, last_failure_at,
              retry_not_before, last_recovered_at
         FROM execution_profile_projection_refresh_health
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`,
      [workspaceId, environment, profileId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      state: row.state,
      consecutiveFailures: row.consecutive_failures,
      // A past failure is useful operationally, but must not be emitted as a
      // current reason after recovery.
      reasonCode: row.state === "RECOVERING" ? row.last_failure_code : null,
      lastFailureAt: row.last_failure_at,
      retryNotBefore: row.retry_not_before,
      lastRecoveredAt: row.last_recovered_at,
    };
  }

  /** Persist one bounded recovery delay after a transient source rejection. */
  async deferRefresh(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    input: { reasonCode: string; failedAt: Date; retryNotBefore: Date },
  ): Promise<void> {
    if (!/^[A-Z][A-Z0-9_]{1,95}$/.test(input.reasonCode)) {
      throw new Error("N31_REFRESH_HEALTH_REASON_INVALID");
    }
    if (!Number.isFinite(input.failedAt.valueOf()) ||
        !Number.isFinite(input.retryNotBefore.valueOf()) ||
        input.retryNotBefore.valueOf() <= input.failedAt.valueOf()) {
      throw new Error("N31_REFRESH_HEALTH_RETRY_INVALID");
    }
    await this.pool.query(
      `INSERT INTO execution_profile_projection_refresh_health
         (workspace_id,environment,profile_id,state,consecutive_failures,
          last_failure_code,last_failure_at,retry_not_before,updated_at)
       VALUES ($1,$2,$3,'RECOVERING',1,$4,$5,$6,clock_timestamp())
       ON CONFLICT (workspace_id,environment,profile_id) DO UPDATE SET
         state='RECOVERING',
         consecutive_failures=LEAST(64, execution_profile_projection_refresh_health.consecutive_failures + 1),
         last_failure_code=EXCLUDED.last_failure_code,
         last_failure_at=EXCLUDED.last_failure_at,
         retry_not_before=EXCLUDED.retry_not_before,
         updated_at=clock_timestamp()`,
      [workspaceId, environment, profileId, input.reasonCode, input.failedAt, input.retryNotBefore],
    );
  }

  /** A committed local snapshot clears only the temporary recovery gate. */
  async confirmRefreshHealthy(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO execution_profile_projection_refresh_health
         (workspace_id,environment,profile_id,state,consecutive_failures,last_recovered_at,updated_at)
       VALUES ($1,$2,$3,'HEALTHY',0,clock_timestamp(),clock_timestamp())
       ON CONFLICT (workspace_id,environment,profile_id) DO UPDATE SET
         state='HEALTHY',
         consecutive_failures=0,
         retry_not_before=NULL,
         last_recovered_at=clock_timestamp(),
         updated_at=clock_timestamp()
       WHERE execution_profile_projection_refresh_health.state <> 'HEALTHY'`,
      [workspaceId, environment, profileId],
    );
  }

  /**
   * P4-D follow-on: the persisted resume point for one relation's source
   * drain. Null cursor = the next cycle starts a fresh full pass.
   */
  async relationCursor(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    relationKey: string,
  ): Promise<string | null> {
    const result = await this.pool.query<{ source_cursor: string | null }>(
      `SELECT source_cursor FROM execution_profile_relation_cursors
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND relation_key=$4`,
      [workspaceId, environment, profileId, relationKey],
    );
    return result.rows[0]?.source_cursor ?? null;
  }

  async saveRelationCursor(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    relationKey: string,
    sourceCursor: string | null,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO execution_profile_relation_cursors
         (workspace_id, environment, profile_id, relation_key, source_cursor)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (workspace_id, environment, profile_id, relation_key) DO UPDATE SET
         source_cursor = EXCLUDED.source_cursor,
         pass_started_at = CASE WHEN EXCLUDED.source_cursor IS NULL
                                THEN clock_timestamp()
                                ELSE execution_profile_relation_cursors.pass_started_at END,
         updated_at = clock_timestamp()`,
      [workspaceId, environment, profileId, relationKey, sourceCursor],
    );
  }

  /**
   * Full-depth time-series store (owner directive 2026-09-03): every accepted
   * drained row is kept exactly, append-only, keyed by the relation's own id.
   * Conflict-ignore keeps the write idempotent across overlapping tail pages.
   */
  async appendTimeSeriesHistory(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    relationKey: string,
    rows: ReadonlyArray<{ rowId: string; ts: string; fields: Record<string, ProjectionScalar> }>,
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await this.pool.query(
      `INSERT INTO execution_timeseries_history
         (workspace_id, environment, profile_id, relation_key, row_id, ts, fields)
       SELECT $1, $2, $3, $4, entry.row_id, entry.ts::timestamptz, entry.fields
         FROM jsonb_to_recordset($5::jsonb) AS entry(row_id text, ts text, fields jsonb)
       ON CONFLICT (workspace_id, environment, profile_id, relation_key, row_id) DO NOTHING`,
      [workspaceId, environment, profileId, relationKey,
        JSON.stringify(rows.map((row) => ({ row_id: row.rowId, ts: row.ts, fields: row.fields })))],
    );
    return result.rowCount ?? 0;
  }

  async timeSeriesHistory(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    relationKey: string,
    query: ProjectionHistoryQuery,
    reader?: PoolClient,
  ): Promise<{ rows: Array<{ rowId: string; ts: string; fields: Record<string, ProjectionScalar> }>; hasMore: boolean }> {
    const conditions = ["workspace_id=$1", "environment=$2", "profile_id=$3", "relation_key=$4"];
    const values: unknown[] = [workspaceId, environment, profileId, relationKey];
    if (query.scope) {
      this.assertHistoryScope(query.scope, workspaceId, environment, profileId, relationKey, query);
      const predicate = projectionScopeSql(query.scope, "fields", values.length + 1);
      conditions.push(predicate.sql); values.push(...predicate.values);
    }
    if (query.from) { values.push(query.from); conditions.push(`ts >= $${values.length}::timestamptz`); }
    if (query.to) { values.push(query.to); conditions.push(`ts ${query.scope?.mode === "SCOPED_V2" ? "<" : "<="} $${values.length}::timestamptz`); }
    const order = query.order ?? "ASC";
    if (query.after) {
      values.push(query.after.ts, query.after.rowId);
      conditions.push(`(ts, row_id) ${order === "ASC" ? ">" : "<"} ($${values.length - 1}::timestamptz, $${values.length})`);
    }
    if (query.entity) {
      values.push(query.entity.field, query.entity.value);
      conditions.push(`fields->>($${values.length - 1}) = $${values.length}`);
    }
    values.push(query.limit + 1);
    const text = `SELECT row_id, to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.${query.scope?.mode === "SCOPED_V2" ? "US" : "MS"}"Z"') AS ts, fields
         FROM ${this.historyTable()}
        WHERE ${conditions.join(" AND ")}
        ORDER BY ts ${order}, row_id ${order}
        LIMIT $${values.length}`;
    const result = reader
      ? await reader.query<{ row_id: string; ts: string; fields: Record<string, ProjectionScalar> }>(text, values)
      : await this.retainedDataQuery<{ row_id: string; ts: string; fields: Record<string, ProjectionScalar> }>(text, values);
    const hasMore = result.rows.length > query.limit;
    return {
      rows: result.rows.slice(0, query.limit).map((row) => ({ rowId: row.row_id, ts: row.ts, fields: row.fields })),
      hasMore,
    };
  }

  /** One SQL snapshot for authorized rows AND exact authorized count/bounds.
   * No cross-scope completed-response cache or independent pooled-query race. */
  async scopedTimeSeriesHistory(workspaceId: string, environment: ProjectionEnvironment, profileId: string,
    relationKey: string, query: ProjectionHistoryQuery & { scope: AuthorizedExecutionReadScope }) {
    return withTransaction(this.pool, async reader => {
      await reader.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await reader.query("SET LOCAL statement_timeout='5000ms'");
      this.assertHistoryScope(query.scope, workspaceId, environment, profileId, relationKey, query);
      if (query.scope.mode === "SCOPED_V2") {
        const metadata = await this.snapshotMetadata(workspaceId, environment, profileId, reader);
        const binding = scopeReadPopulation(query.scope).binding;
        if (!metadata || !binding?.projection_generation || metadata.payloadDigest !== binding.source_revision ||
            metadata.projectionEpoch !== binding.projection_generation || metadata.sourceCatalogueSha256 !== binding.catalogue_revision)
          throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      }
      const page = await this.timeSeriesHistory(workspaceId, environment, profileId, relationKey, query, reader);
      const coverage = await this.timeSeriesHistoryCoverage(workspaceId, environment, profileId, relationKey,
        query.entity, query, reader);
      return { page, coverage };
    });
  }

  private assertHistoryScope(scope: AuthorizedExecutionReadScope, workspace: string, environment: ProjectionEnvironment,
    profile: string, relation: string, range: { from?: string | null; to?: string | null }) {
    assertExecutionReadScope(scope);
    if (scope.workspaceId !== workspace || scope.environment !== environment || scope.profileId !== profile)
      throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_REQUIRED");
    if (scope.mode === "LEGACY_COMPATIBILITY") return;
    const binding = scopeReadPopulation(scope).binding;
    const window = range.from && range.to ? { from_ms: Date.parse(range.from), to_ms: Date.parse(range.to) } : null;
    if (!binding || binding.dataset_id !== `history:${relation}` ||
      JSON.stringify(binding.window) !== JSON.stringify(window))
      throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_REQUIRED");
  }

  /**
   * Full-range chart read (owner directive 2026-09-03): when the range holds
   * more rows than a chart can carry, return per-series bucket extrema plus
   * the bucket-closing row — every returned row is a REAL source row, the
   * whole range is covered, and minima/maxima survive by construction. Small
   * ranges return exact rows with no downsampling at all.
   */
  async timeSeriesHistoryDownsampled(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    relationKey: string,
    query: {
      from: string;
      to?: string | null;
      entity?: { field: string; value: string } | null;
      seriesField: string;
      valueField: string;
      targetPoints: number;
      scope?: AuthorizedExecutionReadScope;
    },
    reader?: PoolClient,
  ): Promise<{
    rows: Array<{ rowId: string; ts: string; fields: Record<string, ProjectionScalar> }>;
    sourceRows: number;
    downsample: {
      method: "PER_SERIES_BUCKET_EXTREMA";
      bucket_seconds: number;
      series_count: number;
      input_rows: number;
      output_rows: number;
    } | null;
  }> {
    if (query.scope && !reader) return withTransaction(this.pool, async client => {
      await client.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await client.query("SET LOCAL statement_timeout = '5s'");
      return this.timeSeriesHistoryDownsampled(workspaceId, environment, profileId, relationKey, query, client);
    });
    const base = ["workspace_id=$1", "environment=$2", "profile_id=$3", "relation_key=$4", "ts >= $5::timestamptz"];
    const values: unknown[] = [workspaceId, environment, profileId, relationKey, query.from];
    if (query.scope) {
      this.assertHistoryScope(query.scope, workspaceId, environment, profileId, relationKey, query);
      for (const field of [query.valueField, query.seriesField, ...(query.entity ? [query.entity.field] : [])])
        if (query.scope.mode === "SCOPED_V2" && !scopeAllowsQueryField(query.scope, field))
          throw new ExecutionReadScopeError("EXECUTION_READ_FIELD_POLICY_PENDING", 503);
      const predicate = projectionScopeSql(query.scope, "fields", values.length + 1);
      base.push(predicate.sql); values.push(...predicate.values);
    }
    if (query.to) { values.push(query.to); base.push(`ts ${query.scope?.mode === "SCOPED_V2" ? "<" : "<="} $${values.length}::timestamptz`); }
    if (query.entity) {
      values.push(query.entity.field, query.entity.value);
      base.push(`fields->>($${values.length - 1}) = $${values.length}`);
    }
    values.push(query.valueField);
    base.push(`fields->>($${values.length}) ~ '^-?[0-9]+(\\.[0-9]+)?$'`);
    const valueParam = values.length;
    values.push(query.seriesField);
    const seriesParam = values.length;
    const meta = await (reader ?? this.pool).query<{ n: string; k: string; t0: string | null; t1: string | null }>(
      `SELECT count(*)::text AS n,
              count(DISTINCT fields->>($${seriesParam}))::text AS k,
              to_char(min(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS t0,
              to_char(max(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS t1
         FROM ${this.historyTable()} WHERE ${base.join(" AND ")}`,
      values,
    );
    const inputRows = Number(meta.rows[0]?.n ?? 0);
    const seriesCount = Math.max(1, Number(meta.rows[0]?.k ?? 0));
    if (inputRows === 0) return { rows: [], sourceRows: 0, downsample: null };
    if (inputRows <= query.targetPoints) {
      const exact = await this.timeSeriesHistory(workspaceId, environment, profileId, relationKey, {
        from: query.from, to: query.to ?? null, entity: query.entity ?? null, limit: query.targetPoints, scope: query.scope,
      }, reader);
      return { rows: exact.rows, sourceRows: inputRows, downsample: null };
    }
    const spanSeconds = Math.max(1,
      (Date.parse(meta.rows[0]!.t1!) - Date.parse(meta.rows[0]!.t0!)) / 1000);
    const bucketsPerSeries = Math.max(1, Math.floor(query.targetPoints / (3 * seriesCount)));
    const bucketSeconds = Math.max(1, Math.ceil(spanSeconds / bucketsPerSeries));
    values.push(bucketSeconds);
    const bucketParam = values.length;
    const result = await (reader ?? this.pool).query<{ row_id: string; ts: string; fields: Record<string, ProjectionScalar> }>(
      `SELECT row_id, to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ts, fields FROM (
         SELECT row_id, ts, fields,
                row_number() OVER (PARTITION BY fields->>($${seriesParam}), floor(extract(epoch FROM ts) / $${bucketParam})
                                   ORDER BY (fields->>($${valueParam}))::numeric ASC, ts, row_id) AS rn_min,
                row_number() OVER (PARTITION BY fields->>($${seriesParam}), floor(extract(epoch FROM ts) / $${bucketParam})
                                   ORDER BY (fields->>($${valueParam}))::numeric DESC, ts, row_id) AS rn_max,
                row_number() OVER (PARTITION BY fields->>($${seriesParam}), floor(extract(epoch FROM ts) / $${bucketParam})
                                   ORDER BY ts DESC, row_id DESC) AS rn_last
           FROM ${this.historyTable()} WHERE ${base.join(" AND ")}
       ) ranked
       WHERE rn_min = 1 OR rn_max = 1 OR rn_last = 1
       ORDER BY ts ASC, row_id ASC`,
      values,
    );
    return {
      rows: result.rows.map((row) => ({ rowId: row.row_id, ts: row.ts, fields: row.fields })),
      sourceRows: inputRows,
      downsample: {
        method: "PER_SERIES_BUCKET_EXTREMA",
        bucket_seconds: bucketSeconds,
        series_count: seriesCount,
        input_rows: inputRows,
        output_rows: result.rows.length,
      },
    };
  }

  /**
   * §14 E1: per-(strategy, account) daily closes from the mirror — the
   * bounded statistical feed for cross-alpha correlation and drawdown
   * analytics. One real row per account per day (the last of the day).
   */
  async timeSeriesDailyCloses(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    relationKey: string,
    query: { from: string; valueField: string; strategyIds?: readonly string[]; scope?: AuthorizedExecutionReadScope },
  ): Promise<Array<{ strategyId: string; accountId: string; day: string; value: string }>> {
    if (query.scope) {
      this.assertHistoryScope(query.scope, workspaceId, environment, profileId, relationKey, query);
      for (const field of [query.valueField, "strategy_id", "account_id"])
        if (query.scope.mode === "SCOPED_V2" && !scopeAllowsQueryField(query.scope, field))
          throw new ExecutionReadScopeError("EXECUTION_READ_FIELD_POLICY_PENDING", 503);
    }
    const predicate = query.scope ? projectionScopeSql(query.scope, "fields", 8) : { sql: "TRUE", values: [] };
    const result = await this.retainedDataQuery<{ strategy_id: string; account_id: string; day: string; value: string }>(
      `SELECT DISTINCT ON (fields->>'strategy_id', fields->>'account_id', date_trunc('day', ts))
              fields->>'strategy_id' AS strategy_id,
              fields->>'account_id' AS account_id,
              to_char(date_trunc('day', ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              fields->>($6) AS value
         FROM ${this.historyTable()}
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND relation_key=$4
          AND ts >= $5::timestamptz
          AND ${predicate.sql}
          AND fields->>'strategy_id' IS NOT NULL AND fields->>'account_id' IS NOT NULL
          AND ($7::text[] IS NULL OR fields->>'strategy_id' = ANY($7::text[]))
          AND fields->>($6) ~ '^-?[0-9]+(\\.[0-9]+)?$'
        ORDER BY fields->>'strategy_id', fields->>'account_id', date_trunc('day', ts), ts DESC, row_id DESC`,
      [workspaceId, environment, profileId, relationKey, query.from, query.valueField, query.strategyIds ?? null, ...predicate.values],
    );
    return result.rows.map((row) => ({
      strategyId: row.strategy_id, accountId: row.account_id, day: row.day, value: row.value,
    }));
  }

  /**
   * Phase 1: the cross-portfolio standing of every portfolio in one query.
   *
   * The browser used to compute this by draining the whole relation — 35 pages
   * and 37 seconds on dev for 6,918 rows — which left two panels in `loading`
   * long after the reader had given up. The aggregate belongs here: the store
   * can answer it with two index walks.
   *
   * Grouped by **(portfolio, currency)**, not by portfolio. `portfolio_types_pool`
   * publishes both a USDT and a VND series on dev, so a per-portfolio group
   * would take its first equity from one currency and its last from the other
   * and call the pair a comparison. The panel's own caption promises the
   * opposite ("never summed across currencies"); this keeps that promise.
   *
   * No arithmetic: first equity, last equity and the source's own `net_pnl`
   * travel as the published decimal strings.
   */
  async portfolioEquityStandings(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    relationKey: string,
    scope?: AuthorizedExecutionReadScope,
  ): Promise<Array<{
    portfolioId: string; currency: string | null;
    firstEquity: string; lastEquity: string; netPnl: string | null;
    points: number; firstTs: string; lastTs: string;
  }>> {
    if (scope) {
      this.assertHistoryScope(scope, workspaceId, environment, profileId, relationKey, {});
      for (const field of ["portfolio_id", "currency", "equity", "net_pnl"])
        if (scope.mode === "SCOPED_V2" && !scopeAllowsQueryField(scope, field))
          throw new ExecutionReadScopeError("EXECUTION_READ_FIELD_POLICY_PENDING", 503);
    }
    const predicate = scope ? projectionScopeSql(scope, "fields", 5) : { sql: "TRUE", values: [] };
    const result = await this.retainedDataQuery<{
      portfolio_id: string; currency: string | null;
      first_equity: string; last_equity: string; net_pnl: string | null;
      points: string; first_ts: Date; last_ts: Date;
    }>(
      `WITH scoped AS (
         SELECT fields->>'portfolio_id' AS portfolio_id,
                fields->>'currency' AS currency,
                fields->>'equity' AS equity,
                fields->>'net_pnl' AS net_pnl,
                ts, row_id
           FROM ${this.historyTable()}
          WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND relation_key=$4
            AND ${predicate.sql}
            AND fields->>'portfolio_id' IS NOT NULL
            AND fields->>'equity' ~ '^-?[0-9]+(\\.[0-9]+)?$'
       ),
       oldest AS (
         SELECT DISTINCT ON (portfolio_id, currency) portfolio_id, currency, equity, ts
           FROM scoped ORDER BY portfolio_id, currency, ts ASC, row_id ASC
       ),
       newest AS (
         SELECT DISTINCT ON (portfolio_id, currency) portfolio_id, currency, equity, net_pnl, ts
           FROM scoped ORDER BY portfolio_id, currency, ts DESC, row_id DESC
       ),
       counted AS (
         SELECT portfolio_id, currency, count(*) AS points FROM scoped GROUP BY 1, 2
       )
       SELECT counted.portfolio_id, counted.currency, counted.points::text AS points,
              oldest.equity AS first_equity, oldest.ts AS first_ts,
              newest.equity AS last_equity, newest.net_pnl, newest.ts AS last_ts
         FROM counted
         JOIN oldest ON oldest.portfolio_id = counted.portfolio_id
                    AND oldest.currency IS NOT DISTINCT FROM counted.currency
         JOIN newest ON newest.portfolio_id = counted.portfolio_id
                    AND newest.currency IS NOT DISTINCT FROM counted.currency
        ORDER BY counted.points DESC, counted.portfolio_id ASC, counted.currency ASC`,
      [workspaceId, environment, profileId, relationKey, ...predicate.values],
    );
    return result.rows.map((row) => ({
      portfolioId: row.portfolio_id,
      currency: row.currency,
      firstEquity: row.first_equity,
      lastEquity: row.last_equity,
      netPnl: row.net_pnl,
      points: Number(row.points),
      firstTs: row.first_ts.toISOString(),
      lastTs: row.last_ts.toISOString(),
    }));
  }

  async timeSeriesHistoryCoverage(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    relationKey: string,
    entity: { field: string; value: string } | null = null,
    range: { from?: string | null; to?: string | null; scope?: AuthorizedExecutionReadScope } = {},
    reader?: PoolClient,
  ): Promise<{ rowCount: number; oldestTs: string | null; newestTs: string | null }> {
    const conditions = ["workspace_id=$1", "environment=$2", "profile_id=$3", "relation_key=$4"];
    const values: unknown[] = [workspaceId, environment, profileId, relationKey];
    if (range.scope) {
      this.assertHistoryScope(range.scope, workspaceId, environment, profileId, relationKey, range);
      const predicate = projectionScopeSql(range.scope, "fields", values.length + 1);
      conditions.push(predicate.sql); values.push(...predicate.values);
    }
    if (range.from) { values.push(range.from); conditions.push(`ts >= $${values.length}::timestamptz`); }
    if (range.to) { values.push(range.to); conditions.push(`ts ${range.scope?.mode === "SCOPED_V2" ? "<" : "<="} $${values.length}::timestamptz`); }
    if (entity) {
      values.push(entity.field, entity.value);
      conditions.push(`fields->>($${values.length - 1}) = $${values.length}`);
    }
    const text = `SELECT count(*)::text AS row_count,
              to_char(min(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS oldest_ts,
              to_char(max(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS newest_ts
         FROM ${this.historyTable()}
        WHERE ${conditions.join(" AND ")}`;
    const result = reader
      ? await reader.query<{ row_count: string; oldest_ts: string | null; newest_ts: string | null }>(text, values)
      : await this.retainedDataQuery<{ row_count: string; oldest_ts: string | null; newest_ts: string | null }>(text, values);
    const row = result.rows[0];
    return { rowCount: Number(row?.row_count ?? 0), oldestTs: row?.oldest_ts ?? null, newestTs: row?.newest_ts ?? null };
  }

  async commit(
    document: ProfileProjectionDocument,
    input: ProjectionCommitInput,
  ): Promise<ProjectionCommitReceipt> {
    validateDocument(document);
    const payloadDigest = digest(document);
    return this.transaction(async (client) => {
      const existing = await client.query<{
        projection_epoch: string; projection_sequence: string; payload_digest: string; source_epoch: string;
        payload: ProfileProjectionDocument;
      }>(
        `SELECT projection_epoch::text, projection_sequence::text, payload_digest, source_epoch, payload
           FROM execution_profile_projection_snapshots
          WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3
          FOR UPDATE`,
        [document.workspace_id, document.environment, document.profile_id],
      );
      const previous = existing.rows[0];
      // A changed source epoch means a new accepted catalogue/contract
      // boundary.  Never let a client resume an old local revision stream
      // through that boundary, even if a payload happens to canonicalize to
      // the same bytes.  It receives a typed epoch gap and bootstraps again.
      const sourceEpochChanged = previous !== undefined && previous.source_epoch !== input.sourceEpoch;
      const changed = previous?.payload_digest !== payloadDigest || sourceEpochChanged;
      const projectionEpoch = !previous || sourceEpochChanged ? randomUUID() : previous.projection_epoch;
      const projectionSequence = !previous || sourceEpochChanged
        ? 1
        : Number(previous.projection_sequence) + (changed ? 1 : 0);
      const mirrorResult = await this.durableMirror?.commitAcceptedProjection(client, {
        document,
        sourceEpoch: input.sourceEpoch,
        sourceCursor: input.sourceCursor,
        sourceAsOf: input.sourceAsOf,
        receivedAt: input.receivedAt,
        completeness: input.completeness,
        projectionEpoch,
        projectionSequence,
        payloadDigest,
        relationCursors: input.relationCursors ?? [],
        retainedRangeRows: input.retainedRangeRows ?? {},
      });
      if (mirrorResult?.outcome === "QUARANTINED") {
        // The durable writer already persisted the forensic quarantine in this
        // transaction.  Do not advance the compatibility snapshot, source
        // checkpoint or local journal: a same-key/different-digest range row
        // is not an accepted Portal observation.
        return {
          outcome: "QUARANTINED",
          changed: false,
          reasonCode: mirrorResult.reasonCode,
          projectionEpoch,
          projectionSequence,
          payloadDigest,
        };
      }
      if (!changed) {
        if (input.managerModel) await this.persistManagerModel(client, document, input.sourceEpoch, input.managerModel);
        await client.query(
          `UPDATE execution_profile_projection_snapshots SET
             source_catalogue_sha256=$4, source_epoch=$5, source_cursor=$6, source_as_of=$7, received_at=$8,
             last_successful_refresh_at=$8, completeness=$9, updated_at=clock_timestamp()
           WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`,
          [document.workspace_id, document.environment, document.profile_id,
            document.source_catalogue_sha256 ?? null, input.sourceEpoch, input.sourceCursor,
            input.sourceAsOf, input.receivedAt, input.completeness],
        );
        await this.persistRelationCursors(client, document, input.relationCursors ?? []);
        return {
          outcome: "COMMITTED",
          changed: false,
          reasonCode: null,
          projectionEpoch,
          projectionSequence,
          payloadDigest,
        };
      }
      await client.query(
        `INSERT INTO execution_profile_projection_snapshots
           (workspace_id,environment,profile_id,source_contract_revision,source_catalogue_sha256,source_epoch,
            source_cursor,source_as_of,received_at,last_successful_refresh_at,completeness,
            projection_epoch,projection_sequence,payload_digest,payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,$12,$13,$14::jsonb)
         ON CONFLICT (workspace_id,environment,profile_id) DO UPDATE SET
           source_contract_revision=EXCLUDED.source_contract_revision,
           source_catalogue_sha256=EXCLUDED.source_catalogue_sha256,
           source_epoch=EXCLUDED.source_epoch, source_cursor=EXCLUDED.source_cursor,
           source_as_of=EXCLUDED.source_as_of, received_at=EXCLUDED.received_at,
           last_successful_refresh_at=EXCLUDED.last_successful_refresh_at,
           completeness=EXCLUDED.completeness, projection_epoch=EXCLUDED.projection_epoch,
           projection_sequence=EXCLUDED.projection_sequence,
           payload_digest=EXCLUDED.payload_digest, payload=EXCLUDED.payload,
           updated_at=clock_timestamp()`,
        [document.workspace_id, document.environment, document.profile_id,
          document.source_contract_revision, document.source_catalogue_sha256 ?? null,
          input.sourceEpoch, input.sourceCursor, input.sourceAsOf, input.receivedAt,
          input.completeness, projectionEpoch, projectionSequence, payloadDigest,
          JSON.stringify(document)],
      );
      await this.persistRelationCursors(client, document, input.relationCursors ?? []);
      const changedRelations = relationChanges(previous?.payload, document);
      const affectedScreenIds = profileObservationAffectedScreens(document.environment, changedRelations);
      const observationPayload = {
        schema_version: "portal.execution.observation-revision.v1",
        observation_authority: "PORTAL_OBSERVATION",
        observation_semantics: "BOUNDED_CURRENT_PAGE",
        operation_id: PROFILE_OBSERVATION_OPERATION_ID,
        // Source relation selectors remain inside the server-side durable
        // mirror.  Browser-facing revision ticks name only frozen Portal
        // screens, so this channel cannot become a generic Manager reader.
        affected_screen_ids: affectedScreenIds,
        // This is a fixed, browser-safe revalidation hint.  It binds the
        // named Portal operations to this committed revision without leaking
        // the Manager relation or raw source checkpoint that caused it.
        revalidation: profileObservationRevalidation(affectedScreenIds, {
          projectionEpoch,
          projectionSequence,
          payloadDigest,
        }),
      };
      await client.query(
        `INSERT INTO execution_profile_projection_journal
           (workspace_id,environment,profile_id,projection_epoch,projection_sequence,event_kind,
            source_as_of,received_at,completeness,payload_digest,observation_authority,
            observation_semantics,source_contract_revision,source_catalogue_sha256,payload)
         VALUES ($1,$2,$3,$4,$5,'delta',$6,$7,$8,$9,'PORTAL_OBSERVATION',
                 'BOUNDED_CURRENT_PAGE',$10,$11,$12::jsonb)`,
        [document.workspace_id, document.environment, document.profile_id,
          projectionEpoch, projectionSequence, input.sourceAsOf, input.receivedAt,
          input.completeness, payloadDigest, document.source_contract_revision,
          document.source_catalogue_sha256 ?? null, JSON.stringify(observationPayload)],
      );
      await client.query(
        `DELETE FROM execution_profile_projection_journal
          WHERE created_at < clock_timestamp() - ($1::text || ' seconds')::interval`,
        [input.retentionSeconds],
      );
      await client.query(
        `DELETE FROM execution_profile_projection_journal j
          WHERE j.workspace_id=$1 AND j.environment=$2 AND j.profile_id=$3
            AND j.projection_epoch=$4
            AND j.projection_sequence <= $5::bigint - $6::bigint`,
        [document.workspace_id, document.environment, document.profile_id,
          projectionEpoch, projectionSequence, input.maximumJournalEntries],
      );
      if (input.managerModel) await this.persistManagerModel(client, document, input.sourceEpoch, input.managerModel);
      await client.query("SELECT pg_notify('execution_profile_projection', $1)", [JSON.stringify({
        workspace_id: document.workspace_id,
        environment: document.environment,
        profile_id: document.profile_id,
        projection_epoch: projectionEpoch,
        projection_sequence: projectionSequence,
      })]);
      return {
        outcome: "COMMITTED",
        changed: true,
        reasonCode: null,
        projectionEpoch,
        projectionSequence,
        payloadDigest,
      };
    });
  }

  private async persistManagerModel(client: PoolClient, document: ProfileProjectionDocument, sourceEpoch: string,
    model: import("../execution-v2/manager-model.store").PreparedManagerProjection) {
    const value = model.document;
    if (value.workspace_id !== document.workspace_id || value.environment !== document.environment || value.profile_id !== document.profile_id)
      throw new Error("MANAGER_PARENT_PROFILE_MISMATCH");
    // A private adapter may only couple snapshots from the same accepted
    // source epoch/catalogue. The legacy projection UUID and Manager's source
    // generation are different namespaces, never silently compared as cursors.
    if (value.source_epoch !== sourceEpoch || value.catalogue_digest !== document.source_catalogue_sha256)
      throw new Error("MANAGER_PARENT_SOURCE_MISMATCH");
    const { persistManagerProjection } = await import("../execution-v2/manager-model.store");
    await persistManagerProjection(client, model);
  }

  async snapshot(
    workspaceId: string, environment: ProjectionEnvironment, profileId: string,
    reader: Pick<PoolClient, "query"> = this.pool,
  ): Promise<ProfileProjectionSnapshot | null> {
    // Transactional review capture must read its own transaction, never a shared read.
    if (reader !== this.pool) return this.readSnapshot(workspaceId, environment, profileId, reader);
    const key = JSON.stringify([workspaceId,environment,profileId]);
    // Preview source writers are off. Share immutable data (NOT authority)
    // briefly across the many panels of one rich-screen mount. No cache/job
    // table writes; every HTTP request still rechecks Core access/session.
    if (retainedReview(this.config)) {
      const cached=this.retainedViews.get(key);if(cached&&cached.expiresAt>Date.now())return cached.snapshot;
    }
    const pending = this.snapshotFlights.get(key);
    if (pending) return pending;
    if (this.snapshotFlights.size >= 16) throw new Error("N31_LOCAL_READ_CAPACITY");
    const read = (async()=>{
      if(!retainedReview(this.config))return this.readSnapshot(workspaceId,environment,profileId,reader);
      const revision=await retainedRevision(this.pool,workspaceId,environment,profileId);
      const cached=this.retainedViews.get(key);
      if(revision && cached?.revision===revision){
        // A successful database validation renews DATA TTL only. A DB failure
        // never renews this entry or its original clocks; auth is not cached.
        cached.expiresAt=Date.now()+2000;return cached.snapshot;
      }
      this.retainedViews.delete(key);
      const raw=await this.readSnapshot(workspaceId,environment,profileId,reader);
      const snapshot=raw?await retainedSnapshot(this.pool,raw,workspaceId,environment,profileId):null;
      if(!snapshot)return null;
      // Mixed inputs observed across a concurrent writer must not be retained
      // as a validated view. The next request reads again, not a stale token.
      const stableRevision=revision===await retainedRevision(this.pool,workspaceId,environment,profileId)?revision:null;
      if(!stableRevision)return snapshot;
      const bytes=Buffer.byteLength(JSON.stringify(snapshot));
      // Shared with the published context and strict consumer. The budget
      // bounds ALL retained views together, not each of the three entries.
      // HTTP data remains bounded independently by each named BFF.
      const cacheBudgetBytes=RETAINED_DATA_VIEW_CACHE_MAXIMUM_SERIALIZED_BYTES;
      if(bytes<=cacheBudgetBytes){
        this.expireRetainedResources();
        while(this.retainedResources.size && this.retainedCachedBytes()+bytes>cacheBudgetBytes)
          this.retainedResources.delete(this.retainedResources.keys().next().value!);
        const total=()=>[...this.retainedViews.values()].reduce((n,entry)=>n+entry.bytes,0);
        while(this.retainedViews.size && (this.retainedViews.size>=3 || total()+bytes>cacheBudgetBytes)) this.retainedViews.delete(this.retainedViews.keys().next().value!);
        this.retainedViews.set(key,{snapshot,bytes,revision:stableRevision,expiresAt:Date.now()+2000});
      }
      return snapshot;
    })();
    this.snapshotFlights.set(key,read);
    try {
      return await read;
    } finally { if (this.snapshotFlights.get(key) === read) this.snapshotFlights.delete(key); }
  }

  private readonly snapshotFlights = new Map<string, Promise<ProfileProjectionSnapshot | null>>();
  private readonly retainedDataFlights = new RetainedDataFlights();
  private retainedDataQuery<T extends QueryResultRow>(text: string, values: unknown[]): Promise<QueryResult<T>> {
    return retainedReview(this.config) ? this.retainedDataFlights.query<T>(this.pool, text, values) : this.pool.query<T>(text, values);
  }
  private readonly retainedViews = new Map<string,{snapshot:ProfileProjectionSnapshot;bytes:number;revision:string;expiresAt:number}>();
  private readonly retainedResources = new Map<string,{data:Record<string,unknown>;bytes:number;expiresAt:number;
    sources:readonly WeakRef<ProfileProjectionSnapshot>[]}>();

  /** Internal DATA-only representation of an already-loaded exact document.
   * Callers must load/validate the snapshots first and bind their identities
   * and metadata in the key. Authority/actor/current read clocks are excluded.
   * Documents + at most4 prepared DTOs share ONE published16MiB budget.
   */
  retainedResourceTemplate(key: string): Record<string,unknown> | undefined {
    if (!retainedReview(this.config)) return undefined;
    const entry=this.retainedResources.get(key);
    if(entry&&entry.expiresAt<=Date.now()){
      // Lookup follows loading CURRENT snapshots. Only their successful DB
      // revision validation may renew DATA, as in snapshot() above. Ordinary
      // hits, evicted/changed documents and authority/DB failures never renew.
      const validatedUntil=this.resourceSourceDeadline(entry.sources);
      if(validatedUntil>entry.expiresAt&&validatedUntil>Date.now())entry.expiresAt=validatedUntil;
    }
    this.expireRetainedResources();
    return this.retainedResources.get(key)?.data;
  }
  retainResourceTemplate(key: string, data: Record<string,unknown>, snapshots:readonly ProfileProjectionSnapshot[]=[]): void {
    if (!retainedReview(this.config)) return;
    if ('actor' in data || data.read_at_ms !== 0) throw new Error('RETAINED_RESOURCE_DATA_ONLY_REQUIRED');
    this.expireRetainedResources(); this.retainedResources.delete(key);
    const bytes=Buffer.byteLength(key)+Buffer.byteLength(JSON.stringify(data));
    if(bytes>1024*1024)return;
    while(this.retainedResources.size && (this.retainedResources.size>=4
      || this.retainedCachedBytes()+bytes>RETAINED_DATA_VIEW_CACHE_MAXIMUM_SERIALIZED_BYTES))
      this.retainedResources.delete(this.retainedResources.keys().next().value!);
    if(this.retainedCachedBytes()+bytes>RETAINED_DATA_VIEW_CACHE_MAXIMUM_SERIALIZED_BYTES)return;
    const seen=new WeakSet<object>();
    const freeze=(value:unknown):void=>{if(!value||typeof value!=='object'||seen.has(value))return;
      seen.add(value);for(const child of Object.values(value))freeze(child);Object.freeze(value);};
    freeze(data);
    const sources=snapshots.map(snapshot=>new WeakRef(snapshot));
    const validatedUntil=this.resourceSourceDeadline(sources);
    this.retainedResources.set(key,{data,bytes,sources,
      expiresAt:Math.min(Date.now()+2000,validatedUntil||Date.now()+2000)});
  }
  private resourceSourceDeadline(sources:readonly WeakRef<ProfileProjectionSnapshot>[]): number {
    if(!sources.length)return 0;
    const entries=[...this.retainedViews.values()];let until=Number.MAX_SAFE_INTEGER;
    for(const weak of sources){const snapshot=weak.deref(),entry=snapshot&&entries.find(e=>e.snapshot===snapshot);
      if(!entry)return 0;until=Math.min(until,entry.expiresAt);}
    return until;
  }
  private expireRetainedResources(): void {
    const now=Date.now();for(const [key,entry] of this.retainedResources)
      if(entry.expiresAt<=now)this.retainedResources.delete(key);
  }
  private retainedCachedBytes(): number {
    return [...this.retainedViews.values(),...this.retainedResources.values()].reduce((n,entry)=>n+entry.bytes,0);
  }

  /** Persisted DATA only. V2 adapters bind this exact revision to a qualified
   * publication; retained compatibility augmentation has a different identity
   * and must not be substituted underneath that authority proof. */
  async rawSnapshot(workspaceId:string,environment:ProjectionEnvironment,profileId:string):Promise<ProfileProjectionSnapshot|null> {
    return withTransaction(this.pool,async reader=>{
      await reader.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
      await reader.query("SET LOCAL statement_timeout='5000ms'");
      return this.readSnapshot(workspaceId,environment,profileId,reader);
    });
  }

  private async readSnapshot(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    reader: Pick<PoolClient, "query"> = this.pool,
  ): Promise<ProfileProjectionSnapshot | null> {
    const result = await reader.query<{
      payload: ProfileProjectionDocument; source_epoch: string; source_cursor: string;
      source_as_of: Date | null; received_at: Date; last_successful_refresh_at: Date;
      completeness: ProjectionCompleteness; projection_epoch: string;
      projection_sequence: string; payload_digest: string; source_catalogue_sha256: string | null;
    }>(
      `SELECT payload, source_epoch, source_cursor, source_as_of, received_at,
              last_successful_refresh_at, completeness, projection_epoch::text,
              projection_sequence::text, payload_digest, source_catalogue_sha256
         FROM execution_profile_projection_snapshots
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`,
      [workspaceId, environment, profileId],
    );
    const row = result.rows[0];
    return row ? {
      document: row.payload, sourceEpoch: row.source_epoch, sourceCursor: row.source_cursor,
      sourceAsOf: row.source_as_of, receivedAt: row.received_at,
      lastSuccessfulRefreshAt: row.last_successful_refresh_at,
      completeness: row.completeness, projectionEpoch: row.projection_epoch,
      projectionSequence: Number(row.projection_sequence), payloadDigest: row.payload_digest,
      sourceCatalogueSha256: row.source_catalogue_sha256,
    } : null;
  }

  /** Hot tail: scalar columns only. Never de-TOAST/decode the profile JSONB. */
  async snapshotMetadata(workspaceId: string, environment: ProjectionEnvironment, profileId: string, reader?: PoolClient) {
    const query = {
      text: `SELECT source_as_of,received_at,last_successful_refresh_at,completeness,
        projection_epoch::text,projection_sequence::text,payload_digest,source_catalogue_sha256
        FROM execution_profile_projection_snapshots
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`,
      values: [workspaceId,environment,profileId], query_timeout: 2_000,
    };
    const result = await (reader ?? this.pool).query(query);
    const row = result.rows[0];
    return row ? {
      sourceAsOf: row.source_as_of as Date | null, receivedAt: row.received_at as Date,
      lastSuccessfulRefreshAt: row.last_successful_refresh_at as Date,
      completeness: row.completeness as ProjectionCompleteness,
      projectionEpoch: row.projection_epoch as string, projectionSequence: Number(row.projection_sequence),
      payloadDigest: row.payload_digest as string, sourceCatalogueSha256: row.source_catalogue_sha256 as string | null,
    } : null;
  }

  async journalAfter(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    projectionEpoch: string,
    sequence: number,
    limit: number,
  ): Promise<ProfileProjectionJournalEntry[]> {
    const result = await this.pool.query<{
      workspace_id: string; environment: ProjectionEnvironment; profile_id: string;
      projection_epoch: string; projection_sequence: string; source_as_of: Date | null;
      received_at: Date; completeness: ProjectionCompleteness; payload_digest: string;
      observation_authority: "PORTAL_OBSERVATION"; observation_semantics: "BOUNDED_CURRENT_PAGE";
      source_contract_revision: string | null;
      source_catalogue_sha256: string | null;
      payload: Record<string, unknown>;
    }>(
      `SELECT workspace_id,environment,profile_id,projection_epoch::text,
              projection_sequence::text,source_as_of,received_at,completeness,
              payload_digest,observation_authority,observation_semantics,
              source_contract_revision,source_catalogue_sha256,payload
         FROM execution_profile_projection_journal
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3
          AND projection_epoch=$4 AND projection_sequence>$5
        ORDER BY projection_sequence ASC LIMIT $6`,
      [workspaceId, environment, profileId, projectionEpoch, sequence, limit],
    );
    return result.rows.map((row) => ({
      workspaceId: row.workspace_id, environment: row.environment, profileId: row.profile_id,
      projectionEpoch: row.projection_epoch, projectionSequence: Number(row.projection_sequence),
      sourceAsOf: row.source_as_of, receivedAt: row.received_at,
      completeness: row.completeness, payloadDigest: row.payload_digest,
      observationAuthority: row.observation_authority,
      observationSemantics: row.observation_semantics,
      sourceContractRevision: row.source_contract_revision,
      sourceCatalogueSha256: row.source_catalogue_sha256,
      payload: row.payload,
    }));
  }

  private async persistRelationCursors(
    client: PoolClient,
    document: ProfileProjectionDocument,
    cursors: readonly DurableMirrorRelationCursor[],
  ): Promise<void> {
    const unique = new Map(cursors.map((cursor) => [cursor.relationKey, cursor.sourceCursor]));
    for (const [relationKey, sourceCursor] of [...unique.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      if (!(relationKey in document.relations)) {
        throw new Error("EDS06_RELATION_CURSOR_NOT_IN_DOCUMENT");
      }
      await client.query(
        `INSERT INTO execution_profile_relation_cursors
           (workspace_id, environment, profile_id, relation_key, source_cursor)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (workspace_id, environment, profile_id, relation_key) DO UPDATE SET
           source_cursor = EXCLUDED.source_cursor,
           pass_started_at = CASE WHEN EXCLUDED.source_cursor IS NULL
                                  THEN clock_timestamp()
                                  ELSE execution_profile_relation_cursors.pass_started_at END,
           updated_at = clock_timestamp()`,
        [document.workspace_id, document.environment, document.profile_id, relationKey, sourceCursor],
      );
    }
  }

  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await action(client);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export function projectionDigest(value: unknown): string { return digest(value); }

function healthyRefreshHealth(): ProfileProjectionRefreshHealth {
  return {
    state: "HEALTHY",
    consecutiveFailures: 0,
    reasonCode: null,
    lastFailureAt: null,
    retryNotBefore: null,
    lastRecoveredAt: null,
  };
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

function relationChanges(
  previous: ProfileProjectionDocument | undefined,
  current: ProfileProjectionDocument,
): string[] {
  const keys = new Set([
    ...Object.keys(previous?.relations ?? {}),
    ...Object.keys(current.relations),
  ]);
  return [...keys].filter((key) =>
    digest(previous?.relations[key] ?? null) !== digest(current.relations[key] ?? null),
  ).sort();
}

function validateDocument(document: ProfileProjectionDocument): void {
  const detail = documentInvalidReason(document);
  if (detail !== null) throw Object.assign(new Error("N31_PROFILE_PROJECTION_DOCUMENT_INVALID"), { detail });
}

/**
 * The first reason a projection document would be refused, or null. Named so a
 * refused refresh is a readable fact in the worker log rather than a bare
 * code (dev 2026-09-07: the paper projection was refused every cycle for an
 * hour before anyone could say why). The checks are the ones the write path
 * has always applied; only the reporting is new.
 */
export function documentInvalidReason(document: ProfileProjectionDocument): string | null {
  const expectedPrefix = `${document.environment.toUpperCase()}_`;
  const catalogue = document.source_catalogue_sha256;
  const hasCatalogue = catalogue !== undefined;
  if (document.schema_version !== "portal.execution.profile-projection.v1") return "schema_version";
  if (!document.profile_id.startsWith(expectedPrefix)) return "profile_id does not match the environment";
  if (document.workspace_id.trim() === "") return "workspace_id empty";
  if (document.source_contract_revision.trim() === "") return "source_contract_revision empty";
  if (hasCatalogue && !isSha256(catalogue)) return "source_catalogue_sha256 malformed";
  if (Object.keys(document.relations).length === 0) return "no relations";
  for (const [key, relation] of Object.entries(document.relations)) {
    const at = `relation ${key}`;
    if (key !== `${relation.source_id}:${relation.relation}`) return `${at}: key mismatch`;
    if (!["AVAILABLE", "UNAVAILABLE"].includes(relation.availability)) return `${at}: availability`;
    if (hasCatalogue && !isSha256(relation.source_catalogue_sha256)) return `${at}: relation catalogue missing under a catalogued document`;
    if (!hasCatalogue && relation.source_catalogue_sha256 !== undefined) return `${at}: relation catalogue present under an uncatalogued document`;
    if (relation.reason_code !== null && !/^[A-Z][A-Z0-9_]{1,95}$/.test(relation.reason_code)) return `${at}: reason_code format`;
    if (relation.availability === "UNAVAILABLE" && (relation.items.length !== 0 || typeof relation.reason_code !== "string" || relation.reason_code.length === 0)) return `${at}: UNAVAILABLE with rows or without a reason`;
    if (relation.items.length > 2_000) return `${at}: ${relation.items.length} rows over the 2000 cap`;
    let foreign = 0;
    let provenance = 0;
    for (const row of relation.items) {
      if (row.lineage.workspace_id !== document.workspace_id || row.lineage.profile_id !== document.profile_id || row.lineage.source_contract_revision.trim() === "") foreign += 1;
      else if ((hasCatalogue && !isSha256(row.lineage.source_catalogue_sha256)) || (!hasCatalogue && row.lineage.source_catalogue_sha256 !== undefined)) provenance += 1;
    }
    if (foreign > 0) return `${at}: ${foreign} rows with foreign lineage`;
    if (provenance > 0) return `${at}: ${provenance} rows whose lineage catalogue does not fit the document (${hasCatalogue ? "catalogued document, rows without a catalogue" : "uncatalogued document, rows with one"})`;
  }
  return null;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}
