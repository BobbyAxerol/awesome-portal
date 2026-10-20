/**
 * BE-P16 (ELP2-05/06, ELP2-REQ-06-002): the durable half of the Manager series writer.
 *
 * Three tables (migration 147): a revision marker per observed Manager revision, the observations, and one checkpoint per scope.
 * Writers:
 *  - LIVE: `recordRevision` runs inside the Manager projection transaction (the caller owns BEGIN/COMMIT and has already fenced the
 *    lease through `persistManagerProjection`), so a revision and its observations commit together or not at all;
 *  - BACKFILL: `backfill` replays revisions that were retained before the writer was installed (or whose live write was refused),
 *    a bounded number per call, each in its own lease-fenced transaction, resumable by a keyset cursor after a restart.
 * Both are idempotent: the primary keys make a repeat a no-op, and a repeat with different content is reported
 * (`DIGEST_MISMATCH`), never overwritten (the tables are append-only).
 */
import { performance } from "node:perf_hooks";
import type { Pool, PoolClient } from "pg";
import { accessDigest } from "./access-policy";
import { fenceManagerProjection, ManagerProjectionLeases, type ManagerLeaseScope, type ManagerProjectionLease } from "./manager-lease";
import { managerModelDocument, managerPartition } from "./manager-model.contract";
import { deriveSeriesObservations, MANAGER_SERIES_CALCULATION_REVISION, type DerivedSeriesRevision, type SeriesAbsence, type SeriesConfidence,
  type SeriesObservation, type SeriesRevisionMarker, type SeriesSubjectType, type DerivedSeriesMetric } from "./manager-series-observation";
import type { SeriesHistory } from "./manager-series-materializer";

const keyOf = (s: ManagerLeaseScope) => [s.workspace_id, s.environment, s.profile_id];
const num = (v: string | number | null): number | null => {
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error("MANAGER_SERIES_ROW_INVALID");
  return n;
};
export type SeriesRecordState = "RECORDED" | "DUPLICATE" | "DIGEST_MISMATCH";
export interface SeriesBackfillInput { lease: ManagerProjectionLease; signal: AbortSignal; deadline_ms: number; transaction_timeout_ms: number;
  lease_ttl_ms: number; maximum_revisions: number; }
export interface SeriesBackfillResult { state: "COMPLETE" | "PROGRESS" | "TIME_LIMIT" | "NO_WORK"; processed: number; failed: number; }
export interface SeriesCheckpoint { head_revision: string | null; head_as_of_ms: number | null; backfill_state: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
  backfill_processed: number; last_absence_revision: string | null; last_absences: SeriesAbsence[]; last_error_code: string | null; last_error_revision: string | null; }

export class ManagerSeriesStore {
  private readonly leases: ManagerProjectionLeases;
  constructor(private readonly pool: Pool) { this.leases = new ManagerProjectionLeases(pool); }

  /** Caller owns the transaction (and has fenced the lease). Idempotent on (scope, revision). */
  async recordRevision(client: PoolClient, scope: ManagerLeaseScope, derived: DerivedSeriesRevision): Promise<SeriesRecordState> {
    const key = keyOf(scope), m = derived.marker;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify(["manager-series", ...key])]);
    const old = (await client.query<{ observation_digest: string }>(`SELECT observation_digest FROM execution_manager_series_revisions
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND revision=$4`, [...key, m.revision])).rows[0];
    if (old) return old.observation_digest === derived.observation_digest ? "DUPLICATE" : "DIGEST_MISMATCH";
    await client.query(`INSERT INTO execution_manager_series_revisions
      (workspace_id,environment,profile_id,revision,supersedes_revision,source_epoch,projection_generation,as_of_ms,qualification,doc_completeness,
       doc_freshness,observation_count,observation_digest,calculation_revision,writer_fencing_token)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
        (SELECT fencing_token FROM execution_manager_consumer_fences WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3))`,
    [...key, m.revision, m.supersedes_revision, m.source_epoch, m.projection_generation, m.as_of_ms, m.qualification, m.doc_completeness, m.doc_freshness,
      derived.observations.length, derived.observation_digest, MANAGER_SERIES_CALCULATION_REVISION]);
    if (derived.observations.length) await client.query(`INSERT INTO execution_manager_series_observations
      (workspace_id,environment,profile_id,revision,subject_type,subject_id,metric,partition_key,economic_partition,population_digest,as_of_ms,point_ts_ms,value,
       reason_code,currency,basis,methodology_ref,origin_ms,source_confidence,input_digest)
      SELECT $1::text,$2::text,$3::text,$4::text,x.subject_type,x.subject_id,x.metric,x.partition_key,x.economic_partition,x.population_digest,x.as_of_ms,x.point_ts_ms,x.value,
        x.reason_code,x.currency,x.basis,x.methodology_ref,x.origin_ms,x.source_confidence,x.input_digest
      FROM jsonb_to_recordset($5::jsonb) AS x(subject_type text,subject_id text,metric text,partition_key text,economic_partition jsonb,population_digest text,
        as_of_ms bigint,point_ts_ms bigint,value text,reason_code text,currency text,basis text,methodology_ref text,origin_ms bigint,
        source_confidence text,input_digest text)`, [...key, m.revision, JSON.stringify(derived.observations.map(({ partition, ...o }) => ({ ...o, economic_partition: partition })))]);
    await client.query(`INSERT INTO execution_manager_series_checkpoints
      (workspace_id,environment,profile_id,head_revision,head_as_of_ms,last_absence_revision,last_absences,last_error_code,last_error_revision,writer_fencing_token)
      VALUES($1,$2,$3,$4,$5,$4,$6::jsonb,NULL,NULL,(SELECT fencing_token FROM execution_manager_consumer_fences WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3))
      ON CONFLICT(workspace_id,environment,profile_id) DO UPDATE SET
        head_revision=CASE WHEN execution_manager_series_checkpoints.head_as_of_ms IS NULL OR EXCLUDED.head_as_of_ms>=execution_manager_series_checkpoints.head_as_of_ms
          THEN EXCLUDED.head_revision ELSE execution_manager_series_checkpoints.head_revision END,
        head_as_of_ms=GREATEST(COALESCE(execution_manager_series_checkpoints.head_as_of_ms,0),EXCLUDED.head_as_of_ms),
        last_absence_revision=CASE WHEN execution_manager_series_checkpoints.head_as_of_ms IS NULL OR EXCLUDED.head_as_of_ms>=execution_manager_series_checkpoints.head_as_of_ms
          THEN EXCLUDED.last_absence_revision ELSE execution_manager_series_checkpoints.last_absence_revision END,
        last_absences=CASE WHEN execution_manager_series_checkpoints.head_as_of_ms IS NULL OR EXCLUDED.head_as_of_ms>=execution_manager_series_checkpoints.head_as_of_ms
          THEN EXCLUDED.last_absences ELSE execution_manager_series_checkpoints.last_absences END,
        writer_fencing_token=EXCLUDED.writer_fencing_token,updated_at=clock_timestamp()`,
    [...key, m.revision, m.as_of_ms, JSON.stringify(derived.absences)]);
    return "RECORDED";
  }

  /** After a refused live write (ROLLBACK TO SAVEPOINT): remember why, in the caller's transaction. Never throws a second time. */
  async recordFailure(client: PoolClient, scope: ManagerLeaseScope, revision: string, code: string): Promise<void> {
    const safe = /^[A-Z][A-Z0-9_]{2,127}$/.test(code) ? code : "SERIES_RECORD_REFUSED";
    await client.query(`INSERT INTO execution_manager_series_checkpoints(workspace_id,environment,profile_id,last_error_code,last_error_revision)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,environment,profile_id) DO UPDATE SET last_error_code=EXCLUDED.last_error_code,
      last_error_revision=EXCLUDED.last_error_revision,updated_at=clock_timestamp()`, [...keyOf(scope), safe, revision]);
  }

  async checkpoint(scope: ManagerLeaseScope): Promise<SeriesCheckpoint | null> {
    const r = (await this.pool.query(`SELECT head_revision,head_as_of_ms::text,backfill_state,backfill_processed::text,last_absence_revision,last_absences,
      last_error_code,last_error_revision FROM execution_manager_series_checkpoints WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`, keyOf(scope))).rows[0];
    return r ? { head_revision: r.head_revision, head_as_of_ms: num(r.head_as_of_ms), backfill_state: r.backfill_state, backfill_processed: Number(r.backfill_processed),
      last_absence_revision: r.last_absence_revision, last_absences: r.last_absences, last_error_code: r.last_error_code, last_error_revision: r.last_error_revision } : null;
  }

  /** Bounded read of what a window needs: the revision chain and the observations from `floor_ms` up to `to_ms`, plus the last revision
   * before the floor (it proves the history reaches back to the window start). `maximum_rows` + 1 rows are returned at most: the caller
   * sees the overflow and publishes nothing rather than a truncated history. */
  async history(scope: ManagerLeaseScope, input: { floor_ms: number; to_ms: number; exclude_revision: string; maximum_rows: number }): Promise<SeriesHistory> {
    const key = keyOf(scope), cap = input.maximum_rows + 1;
    const revisions = await this.pool.query(`(SELECT revision,supersedes_revision,source_epoch,projection_generation,as_of_ms::text,qualification,doc_completeness,doc_freshness
        FROM execution_manager_series_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND as_of_ms<$4 AND revision<>$6
        ORDER BY as_of_ms DESC,revision DESC LIMIT 1)
      UNION ALL (SELECT revision,supersedes_revision,source_epoch,projection_generation,as_of_ms::text,qualification,doc_completeness,doc_freshness
        FROM execution_manager_series_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND as_of_ms>=$4 AND as_of_ms<=$5 AND revision<>$6
        ORDER BY as_of_ms,revision LIMIT $7)`, [...key, input.floor_ms, input.to_ms, input.exclude_revision, cap]);
    const rows = await this.pool.query(`SELECT revision,subject_type,subject_id,metric,partition_key,economic_partition,population_digest,as_of_ms::text,point_ts_ms::text,value,
        reason_code,currency,basis,methodology_ref,origin_ms::text,source_confidence,input_digest
      FROM execution_manager_series_observations WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND as_of_ms>=$4 AND as_of_ms<=$5 AND revision<>$6
      ORDER BY as_of_ms,revision,subject_type,subject_id,metric,partition_key LIMIT $7`, [...key, input.floor_ms, input.to_ms, input.exclude_revision, cap]);
    return {
      revisions: revisions.rows.map((r): SeriesRevisionMarker => ({ revision: r.revision, supersedes_revision: r.supersedes_revision, source_epoch: r.source_epoch,
        projection_generation: r.projection_generation, as_of_ms: num(r.as_of_ms)!, qualification: r.qualification, doc_completeness: r.doc_completeness,
        doc_freshness: r.doc_freshness })),
      observations: rows.rows.map((r): SeriesObservation => ({ revision: r.revision, subject_type: r.subject_type as SeriesSubjectType, subject_id: r.subject_id,
        metric: r.metric as DerivedSeriesMetric, partition_key: r.partition_key, partition: managerPartition.parse(r.economic_partition), population_digest: r.population_digest,
        as_of_ms: num(r.as_of_ms)!, point_ts_ms: num(r.point_ts_ms), value: r.value, reason_code: r.reason_code, currency: r.currency, basis: r.basis,
        methodology_ref: r.methodology_ref, origin_ms: num(r.origin_ms), source_confidence: r.source_confidence as SeriesConfidence | null, input_digest: r.input_digest })),
    };
  }

  /**
   * Replays retained revisions the writer has not seen, oldest first, at most `maximum_revisions` per call. Each revision is its own
   * lease-fenced transaction; a revision that cannot be replayed (payload no longer matches its digest, or no longer parses) is skipped
   * with `last_error_code` and becomes a stated gap, it never blocks the revisions after it. Resumes from the keyset cursor.
   */
  async backfill(input: SeriesBackfillInput): Promise<SeriesBackfillResult> {
    const scope: ManagerLeaseScope = { workspace_id: input.lease.workspace_id, environment: input.lease.environment, profile_id: input.lease.profile_id };
    const key = keyOf(scope), out: SeriesBackfillResult = { state: "NO_WORK", processed: 0, failed: 0 };
    const check = () => { if (input.signal.aborted) throw input.signal.reason ?? new Error("MANAGER_SERIES_ABORTED"); };
    const cp = (await this.pool.query(`SELECT backfill_state,backfill_cursor_created_at::text,backfill_cursor_revision FROM execution_manager_series_checkpoints
      WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`, key)).rows[0];
    if (cp?.backfill_state === "COMPLETE") return out;
    let cursor: { at: string; revision: string } | null = cp?.backfill_cursor_created_at ? { at: cp.backfill_cursor_created_at, revision: cp.backfill_cursor_revision } : null;
    while (out.processed + out.failed < input.maximum_revisions) {
      check();
      if (performance.now() >= input.deadline_ms) return { ...out, state: "TIME_LIMIT" };
      const row = (await this.pool.query<{ revision: string; payload: unknown; payload_digest: string; created_at: string }>(
        `SELECT r.revision,r.payload,r.payload_digest,r.created_at::text FROM execution_manager_model_revisions r
         LEFT JOIN execution_manager_series_revisions s USING(workspace_id,environment,profile_id,revision)
         WHERE r.workspace_id=$1 AND r.environment=$2 AND r.profile_id=$3 AND s.revision IS NULL
           AND ($4::timestamptz IS NULL OR (r.created_at,r.revision)>($4::timestamptz,$5))
         ORDER BY r.created_at,r.revision LIMIT 1`, [...key, cursor?.at ?? null, cursor?.revision ?? null])).rows[0];
      if (!row) {
        await this.finish(input, scope, "COMPLETE", cursor);
        return { ...out, state: "COMPLETE" };
      }
      if (!await this.leases.renew(input.lease, input.lease_ttl_ms)) throw new Error("MANAGER_LEASE_LOST");
      let failure: string | null = null;
      try {
        const doc = managerModelDocument.parse(row.payload);
        if (accessDigest(doc) !== row.payload_digest) failure = "SERIES_PAYLOAD_DIGEST_MISMATCH";
        else await this.replay(input, scope, deriveSeriesObservations(doc), row);
      } catch (error) {
        if (input.signal.aborted || (error instanceof Error && error.message === "MANAGER_LEASE_LOST")) throw error;
        failure = "SERIES_REPLAY_REFUSED";
      }
      cursor = { at: row.created_at, revision: row.revision };
      if (failure) { out.failed++; await this.skip(input, scope, row, failure); } else out.processed++;
    }
    return { ...out, state: "PROGRESS" };
  }

  private async withFencedTransaction<T>(input: SeriesBackfillInput, scope: ManagerLeaseScope, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const timeout = Math.max(1, Math.min(input.transaction_timeout_ms, Math.floor(input.deadline_ms - performance.now())));
    const client = await this.pool.connect(); let committed = false;
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", [`${timeout}ms`]);
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify(["manager-model", ...keyOf(scope)])]);
      await fenceManagerProjection(client, input.lease, scope);
      const result = await work(client);
      await client.query("COMMIT"); committed = true; return result;
    } catch (error) { if (!committed) await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  private async replay(input: SeriesBackfillInput, scope: ManagerLeaseScope, derived: DerivedSeriesRevision, row: { created_at: string; revision: string }) {
    await this.withFencedTransaction(input, scope, async client => {
      const state = await this.recordRevision(client, scope, derived);
      await this.moveCursor(client, scope, row, "IN_PROGRESS", state === "RECORDED" ? 1 : 0);
    });
  }

  private async skip(input: SeriesBackfillInput, scope: ManagerLeaseScope, row: { created_at: string; revision: string }, code: string) {
    await this.withFencedTransaction(input, scope, async client => {
      await this.recordFailure(client, scope, row.revision, code);
      await this.moveCursor(client, scope, row, "IN_PROGRESS", 0);
    });
  }

  private async finish(input: SeriesBackfillInput, scope: ManagerLeaseScope, state: "COMPLETE", cursor: { at: string; revision: string } | null) {
    await this.withFencedTransaction(input, scope, async client => {
      await client.query(`INSERT INTO execution_manager_series_checkpoints(workspace_id,environment,profile_id,backfill_state,backfill_cursor_created_at,backfill_cursor_revision)
        VALUES($1,$2,$3,$4,$5::timestamptz,$6) ON CONFLICT(workspace_id,environment,profile_id) DO UPDATE SET backfill_state=EXCLUDED.backfill_state,updated_at=clock_timestamp()`,
      [...keyOf(scope), state, cursor?.at ?? null, cursor?.revision ?? null]);
    });
  }

  private async moveCursor(client: PoolClient, scope: ManagerLeaseScope, row: { created_at: string; revision: string }, state: "IN_PROGRESS", counted: number) {
    await client.query(`INSERT INTO execution_manager_series_checkpoints(workspace_id,environment,profile_id,backfill_state,backfill_cursor_created_at,
      backfill_cursor_revision,backfill_processed) VALUES($1,$2,$3,$4,$5::timestamptz,$6,$7)
      ON CONFLICT(workspace_id,environment,profile_id) DO UPDATE SET backfill_state=EXCLUDED.backfill_state,
      backfill_cursor_created_at=EXCLUDED.backfill_cursor_created_at,backfill_cursor_revision=EXCLUDED.backfill_cursor_revision,
      backfill_processed=execution_manager_series_checkpoints.backfill_processed+$7,updated_at=clock_timestamp()`,
    [...keyOf(scope), state, row.created_at, row.revision, counted]);
  }
}
