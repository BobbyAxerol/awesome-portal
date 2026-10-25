/**
 * BE-P16 (ELP2-05/06, ELP2-REQ-06-002): the durable half of the Manager series writer.
 *
 * Three tables (migration 147): a revision marker per observed Manager revision, the observations, and one checkpoint per scope.
 * Writers:
 *  - LIVE: `recordRevision` runs inside the Manager projection transaction (the caller owns BEGIN/COMMIT and has already fenced the
 *    lease through `persistManagerProjection`), so a revision and its observations commit together or not at all;
 *  - BACKFILL: `backfill` replays revisions that were retained before the writer was installed (or whose live write was refused),
 *    a bounded number per call, each in its own lease-fenced transaction, resumable by a keyset cursor after a restart.
 * RECOVERY (CR-02): a refused LIVE write never fails the financial revision, but it REOPENS a COMPLETE backfill (`recordFailure` flips
 * COMPLETE -> IN_PROGRESS in the same transaction, keeping the keyset cursor). The next idle ticks then replay only the retained revisions
 * AFTER the cursor that still have no series row, 1..16 per tick, and `finish` closes the backfill again and moves the cursor to the newest
 * retained revision. While nothing failed, an idle tick is one checkpoint point-read. A revision whose repair is refused as well becomes a
 * stated gap (cursor passes it) after SERIES_REPAIR_ATTEMPTS refusals; it is never retried forever. The refusals spent are kept PER REVISION
 * (`repair_attempts`, migration 148, pure rules in manager-series-repair.ts), not in the single `last_error_*` diagnostic: a later live failure of
 * another revision overwrites the diagnostic but neither resets nor consumes the budget of the revision being repaired. A `DIGEST_MISMATCH` is recorded as `SERIES_DIGEST_MISMATCH` (it does NOT reopen
 * anything: the stored rows stay as they are).
 * Both are idempotent: the primary keys make a repeat a no-op, and a repeat with different content is reported
 * (`DIGEST_MISMATCH`), never overwritten (the tables are append-only).
 */
import { performance } from "node:perf_hooks";
import type { Pool, PoolClient } from "pg";
import { accessDigest } from "./access-policy";
import { fenceManagerProjection, ManagerProjectionLeases, type ManagerLeaseScope, type ManagerProjectionLease } from "./manager-lease";
import { managerModelDocument, managerPartition } from "./manager-model.contract";
import { deriveSeriesObservationsWithEconomicSource, MANAGER_SERIES_CALCULATION_REVISION, type DerivedSeriesRevision, type SeriesAbsence, type SeriesConfidence,
  type SeriesObservation, type SeriesRevisionMarker, type SeriesSubjectType, type DerivedSeriesMetric } from "./manager-series-observation";
import type { SeriesHistory } from "./manager-series-materializer";
import { parseRepairEntries, refuse, SERIES_REPAIR_ATTEMPTS, type RepairEntry } from "./manager-series-repair";
import type { ManagerEconomicSourceRuntime } from "./manager-economic-source-runtime";

export { SERIES_REPAIR_ATTEMPTS };

const keyOf = (s: ManagerLeaseScope) => [s.workspace_id, s.environment, s.profile_id];
const num = (v: string | number | null): number | null => {
  if (v === null) return null;
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error("MANAGER_SERIES_ROW_INVALID");
  return n;
};
export const SERIES_DIGEST_MISMATCH = "SERIES_DIGEST_MISMATCH";
/** SQL: the checkpoint's repair_attempts array without the entry of the revision bound to `param` (only that revision's budget is cleared). */
const repairWithout = (param: string) => `COALESCE((SELECT jsonb_agg(t.e ORDER BY t.o) FROM jsonb_array_elements(execution_manager_series_checkpoints.repair_attempts)
  WITH ORDINALITY AS t(e,o) WHERE t.e->>'revision' <> ${param}),'[]'::jsonb)`;
const SERIES_REPAIR_RETRY_PREFIX = "SERIES_REPAIR_RETRY_";
export type SeriesRecordState = "RECORDED" | "DUPLICATE" | "DIGEST_MISMATCH";
export interface SeriesBackfillInput { lease: ManagerProjectionLease; signal: AbortSignal; deadline_ms: number; transaction_timeout_ms: number;
  lease_ttl_ms: number; maximum_revisions: number; }
export interface SeriesBackfillResult { state: "COMPLETE" | "PROGRESS" | "TIME_LIMIT" | "NO_WORK"; processed: number; failed: number; }
export interface SeriesCheckpoint { head_revision: string | null; head_as_of_ms: number | null; backfill_state: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
  backfill_processed: number; last_absence_revision: string | null; last_absences: SeriesAbsence[]; last_error_code: string | null; last_error_revision: string | null;
  /** Repair refusals already spent per revision still being repaired (CR-02; independent of the last_error diagnostic). */
  repair_attempts: RepairEntry[]; }

export class ManagerSeriesStore {
  private readonly leases: ManagerProjectionLeases;
  constructor(private readonly pool: Pool, private readonly economic?: ManagerEconomicSourceRuntime) { this.leases = new ManagerProjectionLeases(pool); }

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
      derived.observations.length, derived.observation_digest, m.calculation_revision ?? MANAGER_SERIES_CALCULATION_REVISION]);
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
        repair_attempts=${repairWithout("$4")},
        writer_fencing_token=EXCLUDED.writer_fencing_token,updated_at=clock_timestamp()`,
    [...key, m.revision, m.as_of_ms, JSON.stringify(derived.absences)]);
    return "RECORDED";
  }

  /** After a refused live write (ROLLBACK TO SAVEPOINT) or an explicit disposition: remember why, in the caller's transaction. Never throws a
   * second time. `reopen` (default) turns a COMPLETE backfill back into IN_PROGRESS so the revisions after its cursor are revisited. */
  async recordFailure(client: PoolClient, scope: ManagerLeaseScope, revision: string, code: string, options: { reopen?: boolean } = {}): Promise<void> {
    const safe = /^[A-Z][A-Z0-9_]{2,127}$/.test(code) ? code : "SERIES_RECORD_REFUSED";
    await client.query(`INSERT INTO execution_manager_series_checkpoints(workspace_id,environment,profile_id,last_error_code,last_error_revision)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(workspace_id,environment,profile_id) DO UPDATE SET last_error_code=EXCLUDED.last_error_code,
      last_error_revision=EXCLUDED.last_error_revision,
      backfill_state=CASE WHEN $6::boolean AND execution_manager_series_checkpoints.backfill_state='COMPLETE' THEN 'IN_PROGRESS'
        ELSE execution_manager_series_checkpoints.backfill_state END,updated_at=clock_timestamp()`, [...keyOf(scope), safe, revision, options.reopen !== false]);
  }

  /** The live path: records the revision inside the caller's transaction and turns the non-throwing `DIGEST_MISMATCH` into an explicit
   * disposition (nothing was written for it; the stored rows are never overwritten nor treated as a compatible replay). */
  async recordLive(client: PoolClient, scope: ManagerLeaseScope, derived: DerivedSeriesRevision): Promise<SeriesRecordState> {
    const state = await this.recordRevision(client, scope, derived);
    if (state === "DIGEST_MISMATCH") await this.recordFailure(client, scope, derived.marker.revision, SERIES_DIGEST_MISMATCH, { reopen: false });
    return state;
  }

  async checkpoint(scope: ManagerLeaseScope): Promise<SeriesCheckpoint | null> {
    const r = (await this.pool.query(`SELECT head_revision,head_as_of_ms::text,backfill_state,backfill_processed::text,last_absence_revision,last_absences,
      last_error_code,last_error_revision,repair_attempts FROM execution_manager_series_checkpoints WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`, keyOf(scope))).rows[0];
    return r ? { head_revision: r.head_revision, head_as_of_ms: num(r.head_as_of_ms), backfill_state: r.backfill_state, backfill_processed: Number(r.backfill_processed),
      last_absence_revision: r.last_absence_revision, last_absences: r.last_absences, last_error_code: r.last_error_code, last_error_revision: r.last_error_revision,
      repair_attempts: parseRepairEntries(r.repair_attempts) } : null;
  }

  /** Bounded read of what a window needs: the revision chain and the observations from `floor_ms` up to `to_ms`, plus the last revision
   * before the floor AND its observations (CR-03: a marker alone proves the chain reaches the window start, not that the key was observed). `maximum_rows` + 1 rows are returned at most: the caller
   * sees the overflow and publishes nothing rather than a truncated history. */
  async history(scope: ManagerLeaseScope, input: { floor_ms: number; to_ms: number; exclude_revision: string; maximum_rows: number }): Promise<SeriesHistory> {
    const key = keyOf(scope), cap = input.maximum_rows + 1;
    const revisions = await this.pool.query(`(SELECT revision,supersedes_revision,source_epoch,projection_generation,as_of_ms::text,qualification,doc_completeness,doc_freshness,calculation_revision
        FROM execution_manager_series_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND as_of_ms<$4 AND revision<>$6
        ORDER BY as_of_ms DESC,revision DESC LIMIT 1)
      UNION ALL (SELECT revision,supersedes_revision,source_epoch,projection_generation,as_of_ms::text,qualification,doc_completeness,doc_freshness,calculation_revision
        FROM execution_manager_series_revisions WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND as_of_ms>=$4 AND as_of_ms<=$5 AND revision<>$6
        ORDER BY as_of_ms,revision LIMIT $7)`, [...key, input.floor_ms, input.to_ms, input.exclude_revision, cap]);
    const rows = await this.pool.query(`SELECT revision,subject_type,subject_id,metric,partition_key,economic_partition,population_digest,as_of_ms::text,point_ts_ms::text,value,
        reason_code,currency,basis,methodology_ref,origin_ms::text,source_confidence,input_digest
      FROM execution_manager_series_observations WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND revision<>$6
        AND ((as_of_ms>=$4 AND as_of_ms<=$5) OR revision=(SELECT revision FROM execution_manager_series_revisions
          WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND as_of_ms<$4 AND revision<>$6 ORDER BY as_of_ms DESC,revision DESC LIMIT 1))
      ORDER BY as_of_ms,revision,subject_type,subject_id,metric,partition_key LIMIT $7`, [...key, input.floor_ms, input.to_ms, input.exclude_revision, cap]);
    return {
      revisions: revisions.rows.map((r): SeriesRevisionMarker => ({ revision: r.revision, supersedes_revision: r.supersedes_revision, source_epoch: r.source_epoch,
        projection_generation: r.projection_generation, as_of_ms: num(r.as_of_ms)!, qualification: r.qualification, doc_completeness: r.doc_completeness,
        // Preserve the stored calculator even when the CURRENT runtime has no
        // mapper: stripping it would relabel old economic points as legacy.
        doc_freshness: r.doc_freshness, calculation_revision: r.calculation_revision ?? MANAGER_SERIES_CALCULATION_REVISION })),
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
      if (!row) return await this.finish(input, scope, cursor) ? { ...out, state: "COMPLETE" } : { ...out, state: "PROGRESS" };
      if (!await this.leases.renew(input.lease, input.lease_ttl_ms)) throw new Error("MANAGER_LEASE_LOST");
      let failure: string | null = null, derived: DerivedSeriesRevision | null = null;
      try { // deterministic refusals: the same bytes would be refused again, so the revision becomes a stated gap at once
        const doc = managerModelDocument.parse(row.payload);
        if (accessDigest(doc) !== row.payload_digest) failure = "SERIES_PAYLOAD_DIGEST_MISMATCH";
        else derived = deriveSeriesObservationsWithEconomicSource(doc, this.economic);
      } catch { failure = "SERIES_REPLAY_REFUSED"; }
      let state: SeriesRecordState | null = null;
      if (derived) {
        try { state = await this.replay(input, scope, derived, row); }
        catch (error) {
          if (input.signal.aborted || (error instanceof Error && error.message === "MANAGER_LEASE_LOST")) throw error;
          // The write itself was refused (possibly transiently, e.g. the fault that refused the live write). Bounded retry: one attempt per tick,
          // the cursor stays; the attempt is charged to THIS revision's own budget (not to the shared last_error diagnostic, which a live failure
          // of another revision overwrites) and shown as a typed disposition; the last of SERIES_REPAIR_ATTEMPTS makes the revision a stated gap.
          if (!await this.chargeRefusal(input, scope, row.revision)) return { ...out, state: "PROGRESS" };
          failure = "SERIES_REPLAY_REFUSED";
        }
      }
      cursor = { at: row.created_at, revision: row.revision };
      if (state === "DIGEST_MISMATCH") out.failed++; // the disposition and the cursor were written by `replay`
      else if (failure) { out.failed++; await this.skip(input, scope, row, failure); } else out.processed++;
    }
    return { ...out, state: "PROGRESS" };
  }

  /** Charges one refused repair to the revision's own budget and, in the same lease-fenced transaction, shows it as `SERIES_REPAIR_RETRY_n`.
   * Returns true when the budget is exhausted: nothing is written then, the caller states the gap (and `skip` clears the entry). */
  private async chargeRefusal(input: SeriesBackfillInput, scope: ManagerLeaseScope, revision: string): Promise<boolean> {
    return this.withFencedTransaction(input, scope, async client => {
      const stored = (await client.query(`SELECT repair_attempts FROM execution_manager_series_checkpoints
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 FOR UPDATE`, keyOf(scope))).rows[0];
      const refusal = refuse(parseRepairEntries(stored?.repair_attempts), revision);
      if (refusal.exhausted) return true;
      await this.recordFailure(client, scope, revision, `${SERIES_REPAIR_RETRY_PREFIX}${refusal.attempt}`);
      await client.query(`UPDATE execution_manager_series_checkpoints SET repair_attempts=$4::jsonb
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`, [...keyOf(scope), JSON.stringify(refusal.entries)]);
      return false;
    });
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

  /** Returns the record state. A mismatch is recorded as an explicit disposition AND the cursor passes the revision, in one transaction. */
  private async replay(input: SeriesBackfillInput, scope: ManagerLeaseScope, derived: DerivedSeriesRevision, row: { created_at: string; revision: string }): Promise<SeriesRecordState> {
    return this.withFencedTransaction(input, scope, async client => {
      const state = await this.recordRevision(client, scope, derived);
      if (state === "DIGEST_MISMATCH") await this.recordFailure(client, scope, row.revision, SERIES_DIGEST_MISMATCH, { reopen: false });
      // Only THIS revision's budget (and, when it was repaired, its disposition) ends here: another revision's last_error or budget is left as it is.
      await client.query(`UPDATE execution_manager_series_checkpoints SET repair_attempts=${repairWithout("$4")},
        last_error_code=CASE WHEN $6::boolean AND last_error_revision=$4 AND last_error_code<>$5 THEN NULL ELSE last_error_code END,
        last_error_revision=CASE WHEN $6::boolean AND last_error_revision=$4 AND last_error_code<>$5 THEN NULL ELSE last_error_revision END,
        updated_at=clock_timestamp() WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`, [...keyOf(scope), row.revision, SERIES_DIGEST_MISMATCH, state === "RECORDED"]);
      await this.moveCursor(client, scope, row, "IN_PROGRESS", state === "RECORDED" ? 1 : 0);
      return state;
    });
  }

  private async skip(input: SeriesBackfillInput, scope: ManagerLeaseScope, row: { created_at: string; revision: string }, code: string) {
    await this.withFencedTransaction(input, scope, async client => {
      await this.recordFailure(client, scope, row.revision, code);
      await client.query(`UPDATE execution_manager_series_checkpoints SET repair_attempts=${repairWithout("$4")}
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`, [...keyOf(scope), row.revision]);   // a stated gap ends the budget
      await this.moveCursor(client, scope, row, "IN_PROGRESS", 0);
    });
  }

  /** Closes the backfill only when, under the same lock the live writer takes, no retained revision after the cursor lacks a series row;
   * then the cursor moves to the newest retained revision so a later reopen scans only what is newer. False = a hole appeared: keep going. */
  private async finish(input: SeriesBackfillInput, scope: ManagerLeaseScope, cursor: { at: string; revision: string } | null): Promise<boolean> {
    return this.withFencedTransaction(input, scope, async client => {
      const key = keyOf(scope);
      const hole = await client.query(`SELECT 1 FROM execution_manager_model_revisions r
        LEFT JOIN execution_manager_series_revisions s USING(workspace_id,environment,profile_id,revision)
        WHERE r.workspace_id=$1 AND r.environment=$2 AND r.profile_id=$3 AND s.revision IS NULL
          AND ($4::timestamptz IS NULL OR (r.created_at,r.revision)>($4::timestamptz,$5)) LIMIT 1`, [...key, cursor?.at ?? null, cursor?.revision ?? null]);
      if (hole.rows.length) return false;
      const newest = (await client.query<{ created_at: string; revision: string }>(`SELECT created_at::text,revision FROM execution_manager_model_revisions
        WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 ORDER BY created_at DESC,revision DESC LIMIT 1`, key)).rows[0];
      const at = newest?.created_at ?? cursor?.at ?? null, revision = newest?.revision ?? cursor?.revision ?? null;
      await client.query(`INSERT INTO execution_manager_series_checkpoints(workspace_id,environment,profile_id,backfill_state,backfill_cursor_created_at,backfill_cursor_revision)
        VALUES($1,$2,$3,'COMPLETE',$4::timestamptz,$5) ON CONFLICT(workspace_id,environment,profile_id) DO UPDATE SET backfill_state='COMPLETE',
        backfill_cursor_created_at=EXCLUDED.backfill_cursor_created_at,backfill_cursor_revision=EXCLUDED.backfill_cursor_revision,updated_at=clock_timestamp()`,
      [...key, at, revision]);
      return true;
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
