/** Isolated correctness implementation; runtime provider remains unqualified.
 * Source-dark Core transport correlation/history, never a second capital ledger.
 * Current action/report authority and final response fences belong to the
 * coordinator; this store never contacts PM or refreshes a human credential. */
import type { Pool, PoolClient, QueryConfig, QueryResult } from "pg";
import { randomUUID } from "node:crypto";
import { accessDigest } from "./access-policy";
import { executionEnvironment } from "./foundation.contract";
import { PendingControlError, pendingControlId, pendingControlIntent, pendingControlResource,
  pendingControlStatus, pendingText, type PendingControlIntent, type PendingControlStatus } from "./pending-control.contract";
import { pendingControlAuthorization, assertPendingAuthorizationIdentity, assertPendingStatusProgress,
  boundedPendingJson, type PendingControlAuthorization } from "./pending-control.trust";

export interface PendingCandidate {
  id: string; workspace: string; actor: string; hash: string; key_hash: string;
  intent: unknown; authorization: unknown; status: unknown; attempt: string | null;
  created_at_ms: number; updated_at_ms: number;
}
export interface PendingRecord {
  id: string; actor: string; hash: string; intent: PendingControlIntent;
  authorization: PendingControlAuthorization; status: PendingControlStatus; attempt: string | null;
}
export type PendingTarget = Pick<PendingControlIntent, "resource" | "environment">;

const attemptPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}(?![\s\S])/u;
const versionKeys = ["budget", "source", "parent", "book", "command"] as const;
const commandColumns = `command_id,workspace_id,actor_user_id,key_hash,intent_hash,
  intent,authorization_fact,status,attempt_id,created_at_ms,updated_at_ms`;

/** Narrow immutable target extraction ONLY, before current report authority.
 * No status/proof/actor decode may turn a hidden malformed row into a503 oracle. */
export function pendingTarget(row: PendingCandidate): PendingTarget {
  const raw = row.intent !== null && typeof row.intent === "object" && !Array.isArray(row.intent)
    ? row.intent as Record<string, unknown> : {};
  const resource = pendingControlResource.safeParse(raw.resource);
  const environment = executionEnvironment.safeParse(raw.environment);
  if (!resource.success || !environment.success) throw new PendingControlError("PENDING_CONTROL_NOT_FOUND", 404);
  return { resource: resource.data, environment: environment.data };
}

/** ONLY after current exact-target audit authority, or internal service recovery.
 * Original expiry/source enablement is integrity history, NOT today's read ACL.
 * This validates persisted correlation; parsing cannot authenticate source bytes. */
export function pendingRecord(row: PendingCandidate, workspace: string, id: string, target: PendingTarget): PendingRecord {
  try {
    boundedPendingJson(row.intent); boundedPendingJson(row.authorization); boundedPendingJson(row.status);
    const intent = pendingControlIntent.parse(row.intent), status = pendingControlStatus.parse(row.status);
    const authorization = pendingControlAuthorization.parse(row.authorization);
    pendingControlId.parse(id); pendingText.parse(row.actor); pendingText.parse(workspace);
    const same = (resource: { kind: string; id: string }) =>
      resource.kind === target.resource.kind && resource.id === target.resource.id;
    const known = status.business.state !== "UNKNOWN";
    if (row.workspace !== workspace || row.id !== id || intent.workspace_id !== workspace ||
      !same(intent.resource) || intent.environment !== target.environment || status.command_id !== id ||
      !same(status.resource) || status.environment !== target.environment ||
      status.operation !== intent.business_payload.operation || status.original_recall_id !== intent.business_payload.command_id ||
      status.profile_ref !== authorization.profile_ref || status.authority !== authorization.qualification ||
      (status.delivery === "ACKNOWLEDGED") !== known ||
      status.next_action !== (known ? status.business.state === "WAITING_ENCUMBRANCE" ? "QUERY_SAME_INTENT" : "REVIEW_RECEIPT" :
        status.delivery === "FAILED_BEFORE_SEND" ? "REVIEW_BLOCKER" : "QUERY_SAME_INTENT") ||
      row.key_hash !== accessDigest(intent.business_payload.idempotency_key) ||
      !Number.isSafeInteger(row.created_at_ms) || row.created_at_ms < 0 ||
      !Number.isSafeInteger(row.updated_at_ms) || row.updated_at_ms < row.created_at_ms ||
      status.created_at_ms !== row.created_at_ms || status.updated_at_ms !== row.updated_at_ms ||
      row.attempt !== null && (typeof row.attempt !== "string" || !attemptPattern.test(row.attempt)) ||
      (status.delivery === "SENDING") !== (row.attempt !== null)) throw new Error("PENDING_STORED_IDENTITY_CHANGED");
    assertPendingAuthorizationIdentity(authorization, row.actor, intent, row.hash);
    assertPendingStatusProgress(status, status);
    const receipt = status.business.receipt;
    if (receipt !== null && (receipt.original_payload_sha256 !== authorization.original_payload_sha256 ||
      receipt.control_receipt_id === receipt.latest_receipt_id &&
        (receipt.latest_operation_availability !== "AVAILABLE" || receipt.latest_operation !== intent.business_payload.operation) ||
      versionKeys.some(key => BigInt(receipt.versions[key]) < BigInt(authorization.expected_versions[key]))))
      throw new Error("PENDING_STORED_RECEIPT_CHANGED");
    return { id, actor: row.actor, hash: row.hash, intent, authorization, status, attempt: row.attempt };
  } catch { throw new PendingControlError("PENDING_CONTROL_RECEIPT_UNVERIFIED", 503); }
}

function candidate(row: Record<string, any>): PendingCandidate {
  return { id: row.command_id, workspace: row.workspace_id, actor: row.actor_user_id,
    hash: row.intent_hash, key_hash: row.key_hash, intent: row.intent, authorization: row.authorization_fact,
    status: row.status, attempt: row.attempt_id, created_at_ms: Number(row.created_at_ms), updated_at_ms: Number(row.updated_at_ms) };
}
/** pg supports query_timeout on the actual Query config, although @types/pg's
 * QueryConfig omits it. No Promise.race abandoning an active query/connection. */
function query(db: PoolClient, text: string, values: unknown[] = []): Promise<QueryResult> {
  const config: QueryConfig & { query_timeout: number } = { text, values, query_timeout: 6_000 };
  return db.query(config);
}

export class PendingControlStore {
  constructor(private readonly pool: Pool) {
    // A real finite pool checkout timeout is needed BEFORE the first client.
    // The existing Core pool is5s. Do not replace its identity pool or race a
    // checkout promise and leak the client which eventually arrives.
    const timeout = pool.options.connectionTimeoutMillis;
    if (!Number.isSafeInteger(timeout) || Number(timeout) < 1 || Number(timeout) > 5_000)
      throw new PendingControlError("PENDING_CONTROL_UNAVAILABLE", 503);
  }
  async recoveryClock(): Promise<number> {
    return this.transaction(true, db => this.now(db));
  }
  async candidate(workspace: string, id: string): Promise<PendingCandidate | null> {
    return this.transaction(true, async db => {
      // Migration144 MUST impose<=32768 bytes per JSONB and finite scalars.
      // One genuine private row<=96KiB JSON; no eager decoder before authority.
      const row = (await query(db, `SELECT ${commandColumns} FROM execution_pending_recall_commands
        WHERE workspace_id=$1 AND command_id=$2`, [workspace, id])).rows[0];
      return row ? candidate(row) : null;
    });
  }
  async keyed(db: PoolClient, workspace: string, key: string): Promise<PendingCandidate | null> {
    await this.bounds(db);
    const row = (await query(db, `SELECT ${commandColumns} FROM execution_pending_recall_commands
      WHERE workspace_id=$1 AND key_hash=$2 FOR UPDATE`, [workspace, accessDigest(key)])).rows[0];
    return row ? candidate(row) : null;
  }
  /** Caller owns the current exact action/session/step-up/Core boundary AND
   * portal-access-v2:<workspace> transaction advisory lock. No source I/O here. */
  async insert(db: PoolClient, actor: string, intent: PendingControlIntent, hash: string,
    authorization: PendingControlAuthorization): Promise<PendingRecord> {
    const prior = await this.keyed(db, intent.workspace_id, intent.business_payload.idempotency_key);
    if (prior) {
      if (prior.actor !== actor || prior.hash !== hash) throw new PendingControlError("PENDING_CONTROL_IDEMPOTENCY_CONFLICT");
      return pendingRecord(prior, intent.workspace_id, prior.id, { resource: intent.resource, environment: intent.environment });
    }
    // Duplicate replay is above the finite new-key admission cap. WAITING is
    // already ACKNOWLEDGED source business, not an unsent local obligation.
    const counts = (await query(db, `SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status->>'delivery' IN ('PREPARED','SENDING','DELIVERY_UNKNOWN'))::int AS pending
      FROM execution_pending_recall_commands WHERE workspace_id=$1`, [intent.workspace_id])).rows[0];
    if (!Number.isSafeInteger(counts?.total) || !Number.isSafeInteger(counts?.pending) ||
      counts.total < 0 || counts.pending < 0 || counts.pending > counts.total)
      throw new PendingControlError("PENDING_CONTROL_UNAVAILABLE", 503);
    if (counts.pending >= 100 || counts.total >= 1024) throw new PendingControlError("PENDING_CONTROL_CAPACITY_EXCEEDED", 503);
    assertPendingAuthorizationIdentity(authorization, actor, intent, hash);
    const now = await this.now(db), id = `ecm_${randomUUID().replaceAll("-", "")}`;
    const status = pendingControlStatus.parse({ schema_version: "portal.execution.pending-recall-status.v1",
      family: "PENDING_RECALL_CONTROL", command_id: id, operation: intent.business_payload.operation,
      original_recall_id: intent.business_payload.command_id, resource: intent.resource, environment: intent.environment,
      profile_ref: authorization.profile_ref, delivery: "PREPARED",
      business: { state: "UNKNOWN", business_applied: null, amounts: null, receipt: null, blockers: [] },
      economic_cash_changed: false, physical_transfer_performed: false, projection: "UNKNOWN", venue: "NOT_APPLICABLE",
      next_action: "QUERY_SAME_INTENT", authority: authorization.qualification, created_at_ms: now, updated_at_ms: now });
    const record = pendingRecord({ id, workspace: intent.workspace_id, actor, hash,
      key_hash: accessDigest(intent.business_payload.idempotency_key), intent, authorization, status,
      attempt: null, created_at_ms: now, updated_at_ms: now }, intent.workspace_id, id,
    { resource: intent.resource, environment: intent.environment });
    await query(db, `INSERT INTO execution_pending_recall_commands
      (command_id,workspace_id,actor_user_id,key_hash,intent_hash,intent,authorization_fact,status,created_at_ms,updated_at_ms)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`, [id, intent.workspace_id, actor,
      accessDigest(intent.business_payload.idempotency_key), hash, record.intent, record.authorization, record.status, now]);
    await this.event(db, record); return record;
  }
  async claim(db: PoolClient, record: PendingRecord): Promise<string | null> {
    await this.bounds(db);
    if (record.status.delivery !== "PREPARED") return null;
    const row = (await query(db, `SELECT ${commandColumns} FROM execution_pending_recall_commands
      WHERE workspace_id=$1 AND command_id=$2 FOR UPDATE`, [record.intent.workspace_id, record.id])).rows[0];
    if (!row) throw new PendingControlError("PENDING_CONTROL_NOT_FOUND", 404);
    const raw = candidate(row), current = pendingRecord(raw, record.intent.workspace_id, record.id,
      { resource: record.intent.resource, environment: record.intent.environment });
    if (accessDigest([current.actor, current.hash, current.intent, current.authorization]) !==
      accessDigest([record.actor, record.hash, record.intent, record.authorization]))
      throw new PendingControlError("PENDING_CONTROL_RECEIPT_UNVERIFIED", 503);
    if (current.status.delivery !== "PREPARED") return null;
    const attempt = randomUUID(), now = await this.now(db);
    if (now < current.status.updated_at_ms) throw new PendingControlError("PENDING_CONTROL_UNAVAILABLE", 503);
    const status = pendingControlStatus.parse({ ...current.status, delivery: "SENDING", updated_at_ms: now });
    assertPendingStatusProgress(current.status, status); boundedPendingJson(status);
    const changed = await query(db, `UPDATE execution_pending_recall_commands
      SET attempt_id=$3,status=$4,updated_at_ms=$5
      WHERE workspace_id=$1 AND command_id=$2 AND attempt_id IS NULL AND status->>'delivery'='PREPARED'`,
    [record.intent.workspace_id, record.id, attempt, status, now]);
    if (changed.rowCount !== 1) throw new PendingControlError("PENDING_CONTROL_UNAVAILABLE", 503);
    await this.event(db, { ...current, status, attempt }); return attempt;
  }
  /** Exact CAS including null: null is NOT a recovery wildcard. Service lookup
   * passes its original snapshot attempt; it cannot clear a later sender. */
  async update(workspace: string, id: string, attempt: string | null,
    transform: (old: PendingRecord) => PendingControlStatus): Promise<PendingRecord> {
    return this.transaction(false, async db => {
      const lock = await query(db, "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired", [`portal-access-v2:${workspace}`]);
      if (lock.rows[0]?.acquired !== true) throw new PendingControlError("PENDING_CONTROL_UNAVAILABLE", 503);
      const row = (await query(db, `SELECT ${commandColumns} FROM execution_pending_recall_commands
        WHERE workspace_id=$1 AND command_id=$2 FOR UPDATE`, [workspace, id])).rows[0];
      if (!row) throw new PendingControlError("PENDING_CONTROL_NOT_FOUND", 404);
      const raw = candidate(row), old = pendingRecord(raw, workspace, id, pendingTarget(raw));
      if (attempt !== old.attempt) return old;
      // The transform cannot mutate the original baseline used for monotonicity
      // checks. These validated objects contain only finite JSON data.
      const detached: PendingRecord = { ...old, intent: pendingControlIntent.parse(old.intent),
        authorization: pendingControlAuthorization.parse(old.authorization), status: pendingControlStatus.parse(old.status) };
      const status = pendingControlStatus.parse(transform(detached));
      // Source observations/caller timestamps never become Portal update time.
      status.updated_at_ms = old.status.updated_at_ms;
      assertPendingStatusProgress(old.status, status);
      const proposed = pendingRecord({ ...raw, status,
        attempt: status.delivery === "SENDING" ? old.attempt : null }, workspace, id, pendingTarget(raw));
      if (accessDigest(proposed.status) === accessDigest(old.status)) return old;
      if (status.delivery === "PREPARED" || status.delivery === "SENDING")
        throw new PendingControlError("PENDING_CONTROL_RECEIPT_UNVERIFIED", 503);
      status.updated_at_ms = await this.now(db);
      if (status.updated_at_ms < old.status.updated_at_ms) throw new PendingControlError("PENDING_CONTROL_UNAVAILABLE", 503);
      assertPendingStatusProgress(old.status, status); boundedPendingJson(status);
      const next = pendingRecord({ ...raw, status, attempt: null, updated_at_ms: status.updated_at_ms }, workspace, id, pendingTarget(raw));
      const changed = await query(db, `UPDATE execution_pending_recall_commands
        SET status=$3,updated_at_ms=$4,attempt_id=NULL
        WHERE workspace_id=$1 AND command_id=$2 AND attempt_id IS NOT DISTINCT FROM $5::uuid`,
      [workspace, id, status, status.updated_at_ms, attempt]);
      if (changed.rowCount !== 1) throw new PendingControlError("PENDING_CONTROL_UNAVAILABLE", 503);
      await this.event(db, next); return next;
    });
  }
  private async bounds(db: PoolClient): Promise<void> {
    await query(db, "SET LOCAL lock_timeout='1500ms'");
    await query(db, "SET LOCAL statement_timeout='5000ms'");
    await query(db, "SET LOCAL idle_in_transaction_session_timeout='5000ms'");
  }
  private async transaction<T>(readOnly: boolean, body: (db: PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect(); let complete = false;
    try {
      await query(db, readOnly ? "BEGIN READ ONLY" : "BEGIN"); await this.bounds(db);
      const value = await body(db); await query(db, "COMMIT"); complete = true; return value;
    } catch (error) {
      try { await query(db, "ROLLBACK"); } catch { /* fixed coordinator mapping, no SQL diagnostics */ }
      throw error;
    } finally { db.release(!complete); }
  }
  private async now(db: PoolClient): Promise<number> {
    const now = Number((await query(db, "SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0]?.ms);
    if (!Number.isSafeInteger(now) || now < 0) throw new PendingControlError("PENDING_CONTROL_UNAVAILABLE", 503);
    return now;
  }
  private async event(db: PoolClient, record: PendingRecord): Promise<void> {
    const event = randomUUID(); boundedPendingJson(record.status);
    await query(db, `INSERT INTO execution_pending_recall_events(command_id,event_id,status,attempt_id,recorded_at_ms)
      VALUES($1,$2,$3,$4,$5)`, [record.id, event, record.status, record.attempt, record.status.updated_at_ms]);
    await query(db, `INSERT INTO product_audit_events
      (event_id,actor_user_id,event_type,workspace_id,aggregate_type,aggregate_id,result,metadata_json)
      VALUES($1,$2,'execution_pending_recall_control',$3,'execution_pending_recall_control',$4,'SUCCESS',$5)`,
    [event, record.actor, record.intent.workspace_id, record.id,
      { intent_hash: record.hash, operation: record.status.operation, delivery: record.status.delivery,
        business: record.status.business.state, authority: record.status.authority }]);
  }
}
