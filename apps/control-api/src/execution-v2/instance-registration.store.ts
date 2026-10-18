/** Separate source-dark Core transport metadata; never registry/economic authority. */
import type { Pool, PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { withTransaction } from "../db/pool";
import { accessDigest } from "./access-policy";
import { executionEnvironment } from "./foundation.contract";
import { InstanceRegistrationError, instanceRegistrationId, instanceRegistrationIntent, instanceRegistrationStatus, registrationText,
  type InstanceRegistrationIntent, type InstanceRegistrationStatus } from "./instance-registration.contract";
import { instanceRegistrationAuthorization, assertRegistrationAuthorizationIdentity, boundedRegistrationJson,
  type InstanceRegistrationAuthorization } from "./instance-registration.trust";

export interface RegistrationCandidate {
  id: string; workspace: string; actor: string; hash: string; key_hash: string;
  intent: unknown; authorization: unknown; status: unknown; attempt: string | null;
  created_at_ms: number; updated_at_ms: number;
}
export interface RegistrationRecord {
  id: string; actor: string; hash: string; intent: InstanceRegistrationIntent;
  authorization: InstanceRegistrationAuthorization; status: InstanceRegistrationStatus; attempt: string | null;
}
export type RegistrationTarget = Pick<InstanceRegistrationIntent, "resource" | "environment">;
/** Only immutable target extraction before current report authority. Invalid
 * target is uniform404, not an authorized-corruption oracle for hidden rows. */
export function registrationTarget(row: RegistrationCandidate): RegistrationTarget {
  const raw = row.intent && typeof row.intent === "object" && !Array.isArray(row.intent)
    ? row.intent as Record<string, unknown> : {};
  const resource = instanceRegistrationIntent.shape.resource.safeParse(raw.resource);
  const environment = executionEnvironment.safeParse(raw.environment);
  if (!resource.success || !environment.success) throw new InstanceRegistrationError("REGISTRATION_NOT_FOUND", 404);
  return { resource: resource.data, environment: environment.data };
}
/** Called ONLY after exact current target authority (or by internal recovery).
 * Original new-send expiry/current provider enablement is NOT a report ACL. */
export function registrationRecord(row: RegistrationCandidate, workspace: string, id: string,
  target: RegistrationTarget): RegistrationRecord {
  try {
    const intent = instanceRegistrationIntent.parse(row.intent), status = instanceRegistrationStatus.parse(row.status);
    const authorization = instanceRegistrationAuthorization.parse(row.authorization);
    instanceRegistrationId.parse(id); registrationText.parse(row.actor);
    const same = (resource: { kind: string; id: string }) =>
      resource.kind === target.resource.kind && resource.id === target.resource.id;
    if (row.workspace !== workspace || row.id !== id || intent.workspace_id !== workspace ||
      intent.environment !== target.environment || !same(intent.resource) || status.command_id !== id ||
      !same(status.resource) || status.environment !== target.environment ||
      status.profile_ref !== authorization.profile_ref || status.authority !== authorization.qualification ||
      status.projection !== "UNKNOWN" ||
      (status.delivery === "ACKNOWLEDGED") !== (status.business.state === "APPLIED") ||
      status.business.receipt !== null && status.business.receipt.version !== "1" ||
      status.next_action !== (status.business.state === "APPLIED" ? "REVIEW_RECEIPT" :
        status.delivery === "FAILED_BEFORE_SEND" ? "REVIEW_BLOCKER" : "QUERY_SAME_INTENT") ||
      row.key_hash !== accessDigest(intent.business_payload.idempotency_key) ||
      !Number.isSafeInteger(row.created_at_ms) || !Number.isSafeInteger(row.updated_at_ms) ||
      status.created_at_ms !== row.created_at_ms || status.updated_at_ms !== row.updated_at_ms ||
      row.attempt !== null && !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}(?![\s\S])/u.test(row.attempt) ||
      status.delivery === "SENDING" && row.attempt === null ||
      status.delivery !== "SENDING" && row.attempt !== null) throw new Error("INVALID_REGISTRATION_RECORD");
    assertRegistrationAuthorizationIdentity(authorization, row.actor, intent, row.hash);
    boundedRegistrationJson(status);
    return { id, actor: row.actor, hash: row.hash, intent, authorization, status, attempt: row.attempt };
  } catch { throw new InstanceRegistrationError("REGISTRATION_RECEIPT_UNVERIFIED", 503); }
}
function candidate(row: Record<string, any>): RegistrationCandidate {
  return { id: row.command_id, workspace: row.workspace_id, actor: row.actor_user_id,
    hash: row.intent_hash, key_hash: row.key_hash, intent: row.intent, authorization: row.authorization_fact,
    status: row.status, attempt: row.attempt_id, created_at_ms: Number(row.created_at_ms), updated_at_ms: Number(row.updated_at_ms) };
}
export class InstanceRegistrationStore {
  constructor(private readonly pool: Pool) {}
  async recoveryClock(): Promise<number> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN READ ONLY"); await db.query("SET LOCAL statement_timeout='5000ms'");
      const now = await this.now(db); await db.query("COMMIT"); return now;
    } catch (error) { try { await db.query("ROLLBACK"); } catch { /* fixed caller mapping */ } throw error; }
    finally { db.release(); }
  }
  async candidate(workspace: string, id: string): Promise<RegistrationCandidate | null> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN READ ONLY"); await db.query("SET LOCAL statement_timeout='5000ms'");
      // Migration143 must impose <=32768 bytes on EACH of the three JSONB
      // fields and finite scalar bounds. One genuine row is <=96KiB private
      // JSON, no unbounded eager collection/private decoder before authority.
      const row = (await db.query(`SELECT command_id,workspace_id,actor_user_id,key_hash,intent_hash,
        intent,authorization_fact,status,attempt_id,created_at_ms,updated_at_ms
        FROM execution_instance_registration_commands WHERE workspace_id=$1 AND command_id=$2`, [workspace, id])).rows[0];
      await db.query("COMMIT"); return row ? candidate(row) : null;
    } catch (error) { try { await db.query("ROLLBACK"); } catch { /* preserve fixed caller mapping */ } throw error; }
    finally { db.release(); }
  }
  async keyed(db: PoolClient, workspace: string, key: string): Promise<RegistrationCandidate | null> {
    const row = (await db.query(`SELECT * FROM execution_instance_registration_commands
      WHERE workspace_id=$1 AND key_hash=$2 FOR UPDATE`, [workspace, accessDigest(key)])).rows[0];
    return row ? candidate(row) : null;
  }
  /** Caller holds actual current Core workspace/advisory command boundary. */
  async insert(db: PoolClient, actor: string, intent: InstanceRegistrationIntent, hash: string,
    authorization: InstanceRegistrationAuthorization): Promise<RegistrationRecord> {
    const prior = await this.keyed(db, intent.workspace_id, intent.business_payload.idempotency_key);
    if (prior) {
      if (prior.actor !== actor || prior.hash !== hash) throw new InstanceRegistrationError("REGISTRATION_IDEMPOTENCY_CONFLICT");
      return registrationRecord(prior, intent.workspace_id, prior.id, { resource: intent.resource, environment: intent.environment });
    }
    const counts = (await db.query(`SELECT count(*)::int AS total,
      count(*) FILTER (WHERE status->'business'->>'state'='UNKNOWN')::int AS pending
      FROM execution_instance_registration_commands WHERE workspace_id=$1`, [intent.workspace_id])).rows[0];
    if (counts.pending >= 100 || counts.total >= 1024) throw new InstanceRegistrationError("REGISTRATION_CAPACITY_EXCEEDED", 503);
    boundedRegistrationJson(intent); boundedRegistrationJson(authorization);
    assertRegistrationAuthorizationIdentity(authorization, actor, intent, hash);
    const now = await this.now(db), id = `ecm_${randomUUID().replaceAll("-", "")}`;
    const status = instanceRegistrationStatus.parse({ schema_version: "portal.execution.instance-registration-status.v1",
      family: "INSTANCE_REGISTRATION", command_id: id, operation: "REGISTER_INSTANCE", resource: intent.resource,
      environment: intent.environment, profile_ref: authorization.profile_ref, delivery: "PREPARED",
      business: { state: "UNKNOWN", business_applied: null, receipt: null, source_instance_ref: null },
      canonical_identity: { availability: "NOT_PUBLISHED", reason_code: "SOURCE_CANONICAL_ACCOUNT_DEPLOYMENT_PAIR_NOT_PUBLISHED",
        account_id: null, deployment_id: null }, projection: "UNKNOWN", venue: "NOT_APPLICABLE",
      next_action: "QUERY_SAME_INTENT", authority: authorization.qualification, created_at_ms: now, updated_at_ms: now });
    boundedRegistrationJson(status);
    await db.query(`INSERT INTO execution_instance_registration_commands
      (command_id,workspace_id,actor_user_id,key_hash,intent_hash,intent,authorization_fact,status,created_at_ms,updated_at_ms)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`, [id, intent.workspace_id, actor,
      accessDigest(intent.business_payload.idempotency_key), hash, intent, authorization, status, now]);
    const record = { id, actor, hash, intent, authorization, status, attempt: null };
    await this.event(db, record); return record;
  }
  async claim(db: PoolClient, record: RegistrationRecord): Promise<string | null> {
    if (record.status.delivery !== "PREPARED") return null;
    const attempt = randomUUID(), now = await this.now(db);
    const status = instanceRegistrationStatus.parse({ ...record.status, delivery: "SENDING", updated_at_ms: now });
    const result = await db.query(`UPDATE execution_instance_registration_commands
      SET attempt_id=$3,status=$4,updated_at_ms=$5 WHERE workspace_id=$1 AND command_id=$2 AND status->>'delivery'='PREPARED'`,
    [record.intent.workspace_id, record.id, attempt, status, now]);
    if (!result.rowCount) return null;
    await this.event(db, { ...record, status, attempt }); return attempt;
  }
  async update(workspace: string, id: string, attempt: string | null,
    change: (old: RegistrationRecord) => InstanceRegistrationStatus): Promise<RegistrationRecord> {
    return withTransaction(this.pool, async db => {
      const row = (await db.query(`SELECT * FROM execution_instance_registration_commands
        WHERE workspace_id=$1 AND command_id=$2 FOR UPDATE`, [workspace, id])).rows[0];
      if (!row) throw new InstanceRegistrationError("REGISTRATION_NOT_FOUND", 404);
      const raw = candidate(row), old = registrationRecord(raw, workspace, id, registrationTarget(raw));
      if (attempt !== null && attempt !== old.attempt) return old;
      const status = instanceRegistrationStatus.parse(change(old));
      if (status.command_id !== id || status.profile_ref !== old.status.profile_ref || status.authority !== old.status.authority ||
        accessDigest(status.resource) !== accessDigest(old.status.resource) || status.environment !== old.status.environment ||
        status.created_at_ms !== old.status.created_at_ms || status.projection !== "UNKNOWN" ||
        old.status.business.state === "APPLIED" && accessDigest(status.business) !== accessDigest(old.status.business))
        throw new InstanceRegistrationError("REGISTRATION_RECEIPT_UNVERIFIED", 503);
      if (accessDigest({ ...status, updated_at_ms: 0 }) === accessDigest({ ...old.status, updated_at_ms: 0 })) return old;
      // The store is the only clock writer; no source timestamp masquerades as
      // Portal transport time. New terminal updates atomically clear claim.
      status.updated_at_ms = await this.now(db);
      if (status.updated_at_ms < old.status.updated_at_ms)
        throw new InstanceRegistrationError("REGISTRATION_UNAVAILABLE", 503);
      instanceRegistrationStatus.parse(status); boundedRegistrationJson(status);
      if (status.delivery === "PREPARED" || status.delivery === "SENDING")
        throw new InstanceRegistrationError("REGISTRATION_RECEIPT_UNVERIFIED", 503);
      await db.query(`UPDATE execution_instance_registration_commands SET status=$3,updated_at_ms=$4,attempt_id=NULL
        WHERE workspace_id=$1 AND command_id=$2`, [workspace, id, status, status.updated_at_ms]);
      const next = { ...old, status, attempt: null }; await this.event(db, next); return next;
    });
  }
  private async now(db: PoolClient): Promise<number> {
    const now = Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
    if (!Number.isSafeInteger(now) || now < 0) throw new InstanceRegistrationError("REGISTRATION_UNAVAILABLE", 503);
    return now;
  }
  private async event(db: PoolClient, record: RegistrationRecord): Promise<void> {
    const event = randomUUID();
    await db.query(`INSERT INTO execution_instance_registration_events(command_id,event_id,status,recorded_at_ms)
      VALUES($1,$2,$3,$4)`, [record.id, event, record.status, record.status.updated_at_ms]);
    await db.query(`INSERT INTO product_audit_events
      (event_id,actor_user_id,event_type,workspace_id,aggregate_type,aggregate_id,result,metadata_json)
      VALUES($1,$2,'execution_instance_registration',$3,'execution_instance_registration',$4,'SUCCESS',$5)`,
    [event, record.actor, record.intent.workspace_id, record.id,
      { intent_hash: record.hash, delivery: record.status.delivery, business: record.status.business.state,
        authority: record.status.authority }]);
  }
}
