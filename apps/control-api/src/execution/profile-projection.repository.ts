import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL } from "../tokens";

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
  payload: Record<string, unknown>;
}

export interface ProjectionCommitReceipt {
  changed: boolean;
  projectionEpoch: string;
  projectionSequence: number;
  payloadDigest: string;
}

@Injectable()
export class ExecutionProfileProjectionRepository {
  constructor(@Inject(CONTROL_API_POOL) readonly pool: Pool) {}

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
    input: {
      sourceEpoch: string;
      sourceCursor: string;
      sourceAsOf: Date | null;
      receivedAt: Date;
      completeness: ProjectionCompleteness;
      retentionSeconds: number;
      maximumJournalEntries: number;
    },
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
      if (previous?.payload_digest === payloadDigest) {
        await client.query(
          `UPDATE execution_profile_projection_snapshots SET
             source_epoch=$4, source_cursor=$5, source_as_of=$6, received_at=$7,
             last_successful_refresh_at=$7, completeness=$8, updated_at=clock_timestamp()
           WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`,
          [document.workspace_id, document.environment, document.profile_id,
            input.sourceEpoch, input.sourceCursor, input.sourceAsOf, input.receivedAt,
            input.completeness],
        );
        return {
          changed: false,
          projectionEpoch: previous.projection_epoch,
          projectionSequence: Number(previous.projection_sequence),
          payloadDigest,
        };
      }
      const projectionEpoch = previous?.projection_epoch ?? randomUUID();
      const projectionSequence = previous ? Number(previous.projection_sequence) + 1 : 1;
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
      const changedRelations = relationChanges(previous?.payload, document);
      const eventPayload = {
        schema_version: "portal.execution.profile-projection-delta.v1",
        changed_relations: changedRelations,
        relation_digests: Object.fromEntries(changedRelations.map((key) =>
          [key, digest(document.relations[key] ?? null)])),
      };
      await client.query(
        `INSERT INTO execution_profile_projection_journal
           (workspace_id,environment,profile_id,projection_epoch,projection_sequence,event_kind,
            source_as_of,received_at,completeness,payload_digest,payload)
         VALUES ($1,$2,$3,$4,$5,'delta',$6,$7,$8,$9,$10::jsonb)`,
        [document.workspace_id, document.environment, document.profile_id,
          projectionEpoch, projectionSequence, input.sourceAsOf, input.receivedAt,
          input.completeness, payloadDigest, JSON.stringify(eventPayload)],
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
      return { changed: true, projectionEpoch, projectionSequence, payloadDigest };
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
      payload: Record<string, unknown>;
    }>(
      `SELECT workspace_id,environment,profile_id,projection_epoch::text,
              projection_sequence::text,source_as_of,received_at,completeness,
              payload_digest,payload
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
      completeness: row.completeness, payloadDigest: row.payload_digest, payload: row.payload,
    }));
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
