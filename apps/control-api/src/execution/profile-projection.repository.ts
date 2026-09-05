import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL, EXECUTION_DURABLE_MIRROR_WRITER } from "../tokens";
import type {
  DurableMirrorRelationCursor,
  DurableMirrorRetainedRangeRows,
  DurableMirrorWriter,
} from "./durable-mirror.contract";
import {
  PROFILE_OBSERVATION_OPERATION_ID,
  profileObservationAffectedScreens,
} from "./profile-projection.catalog";

export type ProjectionEnvironment = "paper" | "sandbox" | "live";
export type ProjectionCompleteness = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type ProjectionFreshness = "FRESH" | "AGING" | "STALE" | "UNKNOWN";
export type ProjectionScalar = string | number | boolean | null | readonly (string | number | boolean | null)[];

export interface ProjectionRow {
  lineage: {
    workspace_id: string;
    profile_id: string;
    source_contract_revision: string;
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
  items: ProjectionRow[];
  /** P4-D window ladder: a time-series relation states its merged window. */
  window?: { days: number; max_rows: number; basis: "MERGED_SNAPSHOT_LADDER"; truncated: boolean };
  /** P4-D lineage observability: rejects by missing-parent class, when any. */
  lineage_rejects?: Readonly<Record<string, number>>;
}

export interface ProfileProjectionDocument {
  schema_version: "portal.execution.profile-projection.v1";
  workspace_id: string;
  environment: ProjectionEnvironment;
  profile_id: string;
  source_contract_revision: string;
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
}

@Injectable()
export class ExecutionProfileProjectionRepository {
  constructor(
    @Inject(CONTROL_API_POOL) readonly pool: Pool,
    @Optional() @Inject(EXECUTION_DURABLE_MIRROR_WRITER)
    private readonly durableMirror?: DurableMirrorWriter,
  ) {}

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
    query: {
      from?: string | null;
      to?: string | null;
      after?: { ts: string; rowId: string } | null;
      entity?: { field: string; value: string } | null;
      limit: number;
    },
  ): Promise<{ rows: Array<{ rowId: string; ts: string; fields: Record<string, ProjectionScalar> }>; hasMore: boolean }> {
    const conditions = ["workspace_id=$1", "environment=$2", "profile_id=$3", "relation_key=$4"];
    const values: unknown[] = [workspaceId, environment, profileId, relationKey];
    if (query.from) { values.push(query.from); conditions.push(`ts >= $${values.length}::timestamptz`); }
    if (query.to) { values.push(query.to); conditions.push(`ts <= $${values.length}::timestamptz`); }
    if (query.after) {
      values.push(query.after.ts, query.after.rowId);
      conditions.push(`(ts, row_id) > ($${values.length - 1}::timestamptz, $${values.length})`);
    }
    if (query.entity) {
      values.push(query.entity.field, query.entity.value);
      conditions.push(`fields->>($${values.length - 1}) = $${values.length}`);
    }
    values.push(query.limit + 1);
    const result = await this.pool.query<{ row_id: string; ts: string; fields: Record<string, ProjectionScalar> }>(
      `SELECT row_id, to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ts, fields
         FROM execution_timeseries_history
        WHERE ${conditions.join(" AND ")}
        ORDER BY ts ASC, row_id ASC
        LIMIT $${values.length}`,
      values,
    );
    const hasMore = result.rows.length > query.limit;
    return {
      rows: result.rows.slice(0, query.limit).map((row) => ({ rowId: row.row_id, ts: row.ts, fields: row.fields })),
      hasMore,
    };
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
    },
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
    const base = ["workspace_id=$1", "environment=$2", "profile_id=$3", "relation_key=$4", "ts >= $5::timestamptz"];
    const values: unknown[] = [workspaceId, environment, profileId, relationKey, query.from];
    if (query.to) { values.push(query.to); base.push(`ts <= $${values.length}::timestamptz`); }
    if (query.entity) {
      values.push(query.entity.field, query.entity.value);
      base.push(`fields->>($${values.length - 1}) = $${values.length}`);
    }
    values.push(query.valueField);
    base.push(`fields->>($${values.length}) ~ '^-?[0-9]+(\\.[0-9]+)?$'`);
    const valueParam = values.length;
    values.push(query.seriesField);
    const seriesParam = values.length;
    const meta = await this.pool.query<{ n: string; k: string; t0: string | null; t1: string | null }>(
      `SELECT count(*)::text AS n,
              count(DISTINCT fields->>($${seriesParam}))::text AS k,
              to_char(min(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS t0,
              to_char(max(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS t1
         FROM execution_timeseries_history WHERE ${base.join(" AND ")}`,
      values,
    );
    const inputRows = Number(meta.rows[0]?.n ?? 0);
    const seriesCount = Math.max(1, Number(meta.rows[0]?.k ?? 0));
    if (inputRows === 0) return { rows: [], sourceRows: 0, downsample: null };
    if (inputRows <= query.targetPoints) {
      const exact = await this.timeSeriesHistory(workspaceId, environment, profileId, relationKey, {
        from: query.from, to: query.to ?? null, entity: query.entity ?? null, limit: query.targetPoints,
      });
      return { rows: exact.rows, sourceRows: inputRows, downsample: null };
    }
    const spanSeconds = Math.max(1,
      (Date.parse(meta.rows[0]!.t1!) - Date.parse(meta.rows[0]!.t0!)) / 1000);
    const bucketsPerSeries = Math.max(1, Math.floor(query.targetPoints / (3 * seriesCount)));
    const bucketSeconds = Math.max(1, Math.ceil(spanSeconds / bucketsPerSeries));
    values.push(bucketSeconds);
    const bucketParam = values.length;
    const result = await this.pool.query<{ row_id: string; ts: string; fields: Record<string, ProjectionScalar> }>(
      `SELECT row_id, to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ts, fields FROM (
         SELECT row_id, ts, fields,
                row_number() OVER (PARTITION BY fields->>($${seriesParam}), floor(extract(epoch FROM ts) / $${bucketParam})
                                   ORDER BY (fields->>($${valueParam}))::numeric ASC, ts, row_id) AS rn_min,
                row_number() OVER (PARTITION BY fields->>($${seriesParam}), floor(extract(epoch FROM ts) / $${bucketParam})
                                   ORDER BY (fields->>($${valueParam}))::numeric DESC, ts, row_id) AS rn_max,
                row_number() OVER (PARTITION BY fields->>($${seriesParam}), floor(extract(epoch FROM ts) / $${bucketParam})
                                   ORDER BY ts DESC, row_id DESC) AS rn_last
           FROM execution_timeseries_history WHERE ${base.join(" AND ")}
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
    query: { from: string; valueField: string },
  ): Promise<Array<{ strategyId: string; accountId: string; day: string; value: string }>> {
    const result = await this.pool.query<{ strategy_id: string; account_id: string; day: string; value: string }>(
      `SELECT DISTINCT ON (fields->>'strategy_id', fields->>'account_id', date_trunc('day', ts))
              fields->>'strategy_id' AS strategy_id,
              fields->>'account_id' AS account_id,
              to_char(date_trunc('day', ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
              fields->>($6) AS value
         FROM execution_timeseries_history
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND relation_key=$4
          AND ts >= $5::timestamptz
          AND fields->>'strategy_id' IS NOT NULL AND fields->>'account_id' IS NOT NULL
          AND fields->>($6) ~ '^-?[0-9]+(\\.[0-9]+)?$'
        ORDER BY fields->>'strategy_id', fields->>'account_id', date_trunc('day', ts), ts DESC, row_id DESC`,
      [workspaceId, environment, profileId, relationKey, query.from, query.valueField],
    );
    return result.rows.map((row) => ({
      strategyId: row.strategy_id, accountId: row.account_id, day: row.day, value: row.value,
    }));
  }

  async timeSeriesHistoryCoverage(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
    relationKey: string,
  ): Promise<{ rowCount: number; oldestTs: string | null; newestTs: string | null }> {
    const result = await this.pool.query<{ row_count: string; oldest_ts: string | null; newest_ts: string | null }>(
      `SELECT count(*)::text AS row_count,
              to_char(min(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS oldest_ts,
              to_char(max(ts) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS newest_ts
         FROM execution_timeseries_history
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND relation_key=$4`,
      [workspaceId, environment, profileId, relationKey],
    );
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
        projection_epoch: string; projection_sequence: string; payload_digest: string;
        payload: ProfileProjectionDocument;
      }>(
        `SELECT projection_epoch::text, projection_sequence::text, payload_digest, payload
           FROM execution_profile_projection_snapshots
          WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3
          FOR UPDATE`,
        [document.workspace_id, document.environment, document.profile_id],
      );
      const previous = existing.rows[0];
      const changed = previous?.payload_digest !== payloadDigest;
      const projectionEpoch = previous?.projection_epoch ?? randomUUID();
      const projectionSequence = previous ? Number(previous.projection_sequence) + (changed ? 1 : 0) : 1;
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
        await client.query(
          `UPDATE execution_profile_projection_snapshots SET
             source_epoch=$4, source_cursor=$5, source_as_of=$6, received_at=$7,
             last_successful_refresh_at=$7, completeness=$8, updated_at=clock_timestamp()
           WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`,
          [document.workspace_id, document.environment, document.profile_id,
            input.sourceEpoch, input.sourceCursor, input.sourceAsOf, input.receivedAt,
            input.completeness],
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
           (workspace_id,environment,profile_id,source_contract_revision,source_epoch,
            source_cursor,source_as_of,received_at,last_successful_refresh_at,completeness,
            projection_epoch,projection_sequence,payload_digest,payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9,$10,$11,$12,$13::jsonb)
         ON CONFLICT (workspace_id,environment,profile_id) DO UPDATE SET
           source_contract_revision=EXCLUDED.source_contract_revision,
           source_epoch=EXCLUDED.source_epoch, source_cursor=EXCLUDED.source_cursor,
           source_as_of=EXCLUDED.source_as_of, received_at=EXCLUDED.received_at,
           last_successful_refresh_at=EXCLUDED.last_successful_refresh_at,
           completeness=EXCLUDED.completeness, projection_epoch=EXCLUDED.projection_epoch,
           projection_sequence=EXCLUDED.projection_sequence,
           payload_digest=EXCLUDED.payload_digest, payload=EXCLUDED.payload,
           updated_at=clock_timestamp()`,
        [document.workspace_id, document.environment, document.profile_id,
          document.source_contract_revision, input.sourceEpoch, input.sourceCursor,
          input.sourceAsOf, input.receivedAt, input.completeness, projectionEpoch,
          projectionSequence, payloadDigest, JSON.stringify(document)],
      );
      await this.persistRelationCursors(client, document, input.relationCursors ?? []);
      const changedRelations = relationChanges(previous?.payload, document);
      const observationPayload = {
        schema_version: "portal.execution.observation-revision.v1",
        observation_authority: "PORTAL_OBSERVATION",
        observation_semantics: "BOUNDED_CURRENT_PAGE",
        operation_id: PROFILE_OBSERVATION_OPERATION_ID,
        // Source relation selectors remain inside the server-side durable
        // mirror.  Browser-facing revision ticks name only frozen Portal
        // screens, so this channel cannot become a generic Manager reader.
        affected_screen_ids: profileObservationAffectedScreens(document.environment, changedRelations),
      };
      await client.query(
        `INSERT INTO execution_profile_projection_journal
           (workspace_id,environment,profile_id,projection_epoch,projection_sequence,event_kind,
            source_as_of,received_at,completeness,payload_digest,observation_authority,
            observation_semantics,source_contract_revision,payload)
         VALUES ($1,$2,$3,$4,$5,'delta',$6,$7,$8,$9,'PORTAL_OBSERVATION',
                 'BOUNDED_CURRENT_PAGE',$10,$11::jsonb)`,
        [document.workspace_id, document.environment, document.profile_id,
          projectionEpoch, projectionSequence, input.sourceAsOf, input.receivedAt,
          input.completeness, payloadDigest, document.source_contract_revision,
          JSON.stringify(observationPayload)],
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

  async snapshot(
    workspaceId: string,
    environment: ProjectionEnvironment,
    profileId: string,
  ): Promise<ProfileProjectionSnapshot | null> {
    const result = await this.pool.query<{
      payload: ProfileProjectionDocument; source_epoch: string; source_cursor: string;
      source_as_of: Date | null; received_at: Date; last_successful_refresh_at: Date;
      completeness: ProjectionCompleteness; projection_epoch: string;
      projection_sequence: string; payload_digest: string;
    }>(
      `SELECT payload, source_epoch, source_cursor, source_as_of, received_at,
              last_successful_refresh_at, completeness, projection_epoch::text,
              projection_sequence::text, payload_digest
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
      payload: Record<string, unknown>;
    }>(
      `SELECT workspace_id,environment,profile_id,projection_epoch::text,
              projection_sequence::text,source_as_of,received_at,completeness,
              payload_digest,observation_authority,observation_semantics,
              source_contract_revision,payload
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
  const expectedPrefix = `${document.environment.toUpperCase()}_`;
  if (
    document.schema_version !== "portal.execution.profile-projection.v1" ||
    !document.profile_id.startsWith(expectedPrefix) ||
    document.workspace_id.trim() === "" ||
    document.source_contract_revision.trim() === "" ||
    Object.keys(document.relations).length === 0 ||
    Object.entries(document.relations).some(([key, relation]) =>
      key !== `${relation.source_id}:${relation.relation}` ||
      !["AVAILABLE", "UNAVAILABLE"].includes(relation.availability) ||
      (relation.reason_code !== null && !/^[A-Z][A-Z0-9_]{1,95}$/.test(relation.reason_code)) ||
      (relation.availability === "UNAVAILABLE" && (
        relation.items.length !== 0 ||
        typeof relation.reason_code !== "string" ||
        relation.reason_code.length === 0
      )) ||
      relation.items.length > 2_000 ||
      relation.items.some((row) =>
        row.lineage.workspace_id !== document.workspace_id ||
        row.lineage.profile_id !== document.profile_id ||
        row.lineage.source_contract_revision !== document.source_contract_revision
      )
    )
  ) throw new Error("N31_PROFILE_PROJECTION_DOCUMENT_INVALID");
}
