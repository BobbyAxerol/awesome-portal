import { Pool, PoolClient } from "pg";

import { PortalUser, accountStateOf } from "../domain";
import { ACCESS_STEP_UP_PROOFS, COMMAND_STEP_UP_PROOFS, STEP_UP_FAMILIES, type StepUpFamily } from "../execution-v2/step-up-family";

/**
 * A4-2 · the owner account control plane's own state.
 *
 * Two things live here, and both exist so that an operation can be *exact*
 * rather than merely successful: a short-lived proof that the owner
 * re-authenticated in this session, and an immutable record of what every
 * operation was asked to do, what it changed, and how to undo it.
 */

export const LIFECYCLE_ACTIONS = [
  "CREATE_INVITED",
  "UPDATE_PROFILE",
  "ISSUE_ACTIVATION",
  "REVOKE_SESSIONS",
  "DISABLE",
  "ENABLE",
  "ARCHIVE",
] as const;

export type LifecycleAction = (typeof LIFECYCLE_ACTIONS)[number];

export type LifecycleOutcome = "APPLIED" | "REPLAYED" | "CONFLICT" | "DENIED";

/**
 * Destructive actions require a fresh step-up; the rest do not.
 *
 * `UPDATE_PROFILE` is absent on purpose: renaming somebody should not demand a
 * password, and demanding one for every edit is how a step-up prompt becomes a
 * thing people click through without reading.
 */
export const STEP_UP_ACTIONS: ReadonlySet<LifecycleAction> = new Set<LifecycleAction>([
  "ISSUE_ACTIVATION",
  "REVOKE_SESSIONS",
  "DISABLE",
  "ENABLE",
  "ARCHIVE",
]);

/**
 * The account as an audit row is allowed to see it.
 *
 * Built field by field rather than by serialising a `PortalUser`, because the
 * difference between those two is exactly how a password hash or a Cloudflare
 * subject ends up in a log that is kept forever. §20.2 rule 7.
 */
export interface AccountProjection {
  user_id: string;
  username: string;
  display_name: string;
  role: string;
  account_state: string;
  must_change_password: boolean;
  account_revision: number;
  locked: boolean;
}

export function projectAccount(user: PortalUser): AccountProjection {
  return {
    user_id: user.userId,
    username: user.username,
    display_name: user.displayName,
    role: user.role,
    account_state: accountStateOf(user),
    must_change_password: user.mustChangePassword,
    account_revision: user.accountRevision,
    locked: user.lockedUntil !== null && user.lockedUntil > new Date(),
  };
}

export interface LifecycleOperationRecord {
  operationId: string;
  idempotencyKey: string;
  action: LifecycleAction;
  targetUserId: string;
  actorUserId: string;
  expectedRevision: number;
  resultingRevision: number | null;
  requestFingerprint: string;
  outcome: LifecycleOutcome;
  reasonCode: string | null;
  stateBefore: AccountProjection;
  stateAfter: AccountProjection | null;
  rollbackDescription: string;
  stepUpUsed: boolean;
  occurredAt: Date;
}

interface OperationRow {
  operation_id: string;
  idempotency_key: string;
  action: LifecycleAction;
  target_user_id: string;
  actor_user_id: string;
  expected_revision: number;
  resulting_revision: number | null;
  request_fingerprint: string;
  outcome: LifecycleOutcome;
  reason_code: string | null;
  state_before: AccountProjection;
  state_after: AccountProjection | null;
  rollback_description: string;
  step_up_used: boolean;
  occurred_at: Date;
}

function toOperation(row: OperationRow): LifecycleOperationRecord {
  return {
    operationId: row.operation_id,
    idempotencyKey: row.idempotency_key,
    action: row.action,
    targetUserId: row.target_user_id,
    actorUserId: row.actor_user_id,
    expectedRevision: row.expected_revision,
    resultingRevision: row.resulting_revision,
    requestFingerprint: row.request_fingerprint,
    outcome: row.outcome,
    reasonCode: row.reason_code,
    stateBefore: row.state_before,
    stateAfter: row.state_after,
    rollbackDescription: row.rollback_description,
    stepUpUsed: row.step_up_used,
    occurredAt: row.occurred_at,
  };
}

/** Which kind of actor a step-up proof was issued to: the pure vocabulary lives in execution-v2/step-up-family.ts
 * (importable by the contract tooling without a database); callers of this repository get it re-exported. */
export { ACCESS_STEP_UP_PROOFS, COMMAND_STEP_UP_PROOFS, STEP_UP_FAMILIES, type StepUpFamily };
/** Capital proof ids start with this; every other id (the historical `stp_...` and test ids) is ACCESS_ADMIN. */
export const CAPITAL_STEP_UP_ID_PREFIX = "stpcap_";
export const stepUpFamilyOfId = (stepUpId: string): StepUpFamily =>
  stepUpId.startsWith(CAPITAL_STEP_UP_ID_PREFIX) ? "CAPITAL_COMMAND" : "ACCESS_ADMIN";
/** The same rule in SQL (left(), not LIKE, because `_` is a LIKE wildcard). Keep in lock-step with stepUpFamilyOfId. */
const FAMILY_SQL = `(CASE WHEN left(step_up_id, ${CAPITAL_STEP_UP_ID_PREFIX.length}) = '${CAPITAL_STEP_UP_ID_PREFIX}'
  THEN 'CAPITAL_COMMAND' ELSE 'ACCESS_ADMIN' END)`;
const validFamilies = (families: readonly StepUpFamily[]): boolean =>
  Array.isArray(families) && families.length > 0 && families.every(family => STEP_UP_FAMILIES.includes(family));

export class AccountLifecycleRepository {
  /**
   * A pool for ordinary work, or the caller's client while a named owner
   * operation is being committed.  Keeping repositories transaction-aware is
   * what prevents an account/grant state change from becoming visible without
   * its idempotency and audit lineage.
   */
  constructor(private readonly pool: Pool | PoolClient) {}

  // ------------------------------------------------------------- step-up

  /**
   * Record that this actor re-entered their OWN password in THIS session.
   *
   * `family` says which kind of actor the proof was issued to (execution-v2/step-up-family.ts). It lives in the
   * proof id itself (capital proofs carry the `stpcap_` prefix) so no schema change is needed, and the id is
   * VALIDATED here: a caller can neither tag an access proof as capital nor the reverse. A proof is not a
   * capability; every consumer re-checks its own authority at the moment of use.
   */
  async grantStepUp(input: {
    stepUpId: string;
    sessionId: string;
    userId: string;
    ttlSeconds: number;
    family?: StepUpFamily;
  }): Promise<Date> {
    const family = input.family ?? "ACCESS_ADMIN";
    if (!STEP_UP_FAMILIES.includes(family) || stepUpFamilyOfId(input.stepUpId) !== family)
      throw new Error("STEP_UP_FAMILY_ID_MISMATCH");
    const result = await this.pool.query<{ expires_at: Date }>(
      `INSERT INTO owner_step_up_grants (step_up_id, session_id, user_id, expires_at)
            VALUES ($1, $2, $3, now() + make_interval(secs => $4))
         RETURNING expires_at`,
      [input.stepUpId, input.sessionId, input.userId, input.ttlSeconds],
    );
    return result.rows[0].expires_at;
  }

  /**
   * When this session's step-up stops being valid for the given proof families, or `null` if it has none.
   *
   * Scoped to the session, not the user: a step-up performed in one browser
   * must not silently authorize a destructive action in another. The row is
   * cascaded with the session, so revoking sessions revokes step-up with them.
   * `families` is deliberately REQUIRED: every caller states which proofs it accepts, and an empty or unknown
   * list answers `null` (fail closed).
   */
  async activeStepUpExpiry(sessionId: string, families: readonly StepUpFamily[]): Promise<Date | null> {
    if (!validFamilies(families)) return null;
    const result = await this.pool.query<{ expires_at: Date }>(
      `SELECT expires_at FROM owner_step_up_grants
        WHERE session_id = $1 AND revoked_at IS NULL AND expires_at > now()
          AND ${FAMILY_SQL} = ANY($2::text[])
        ORDER BY expires_at DESC
        LIMIT 1`,
      [sessionId, [...families]],
    );
    return result.rows[0]?.expires_at ?? null;
  }

  /** Mutation fence: the proof belongs to this actor AND this active session AND an accepted family. */
  async lockActiveStepUpExpiry(sessionId: string, userId: string, families: readonly StepUpFamily[]): Promise<Date | null> {
    if (!validFamilies(families)) return null;
    const result = await this.pool.query<{ expires_at: Date }>(
      `SELECT expires_at FROM owner_step_up_grants
        WHERE session_id = $1 AND user_id = $2 AND revoked_at IS NULL
          AND expires_at > clock_timestamp()
          AND ${FAMILY_SQL} = ANY($3::text[])
        ORDER BY expires_at DESC
        LIMIT 1 FOR UPDATE`,
      [sessionId, userId, [...families]],
    );
    return result.rows[0]?.expires_at ?? null;
  }

  async revokeStepUpsForUser(userId: string, client?: PoolClient): Promise<void> {
    const runner = client ?? this.pool;
    await runner.query(
      `UPDATE owner_step_up_grants SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }

  // ---------------------------------------------------------- operations

  /** The prior result for an idempotency key, for answering a replay. */
  async findByIdempotencyKey(key: string): Promise<LifecycleOperationRecord | null> {
    const result = await this.pool.query<OperationRow>(
      `SELECT * FROM account_lifecycle_operations WHERE idempotency_key = $1`,
      [key],
    );
    return result.rows[0] ? toOperation(result.rows[0]) : null;
  }

  async record(input: {
    operationId: string;
    idempotencyKey: string;
    action: LifecycleAction;
    targetUserId: string;
    actorUserId: string;
    expectedRevision: number;
    resultingRevision: number | null;
    requestFingerprint: string;
    outcome: LifecycleOutcome;
    reasonCode?: string | null;
    stateBefore: AccountProjection;
    stateAfter: AccountProjection | null;
    rollbackDescription: string;
    requestId?: string | null;
    stepUpUsed: boolean;
  }): Promise<LifecycleOperationRecord> {
    const result = await this.pool.query<OperationRow>(
      `INSERT INTO account_lifecycle_operations
         (operation_id, idempotency_key, action, target_user_id, actor_user_id,
          expected_revision, resulting_revision, request_fingerprint, outcome,
          reason_code, state_before, state_after, rollback_description,
          request_id, step_up_used)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        input.operationId,
        input.idempotencyKey,
        input.action,
        input.targetUserId,
        input.actorUserId,
        input.expectedRevision,
        input.resultingRevision,
        input.requestFingerprint,
        input.outcome,
        input.reasonCode ?? null,
        JSON.stringify(input.stateBefore),
        input.stateAfter ? JSON.stringify(input.stateAfter) : null,
        input.rollbackDescription,
        input.requestId ?? null,
        input.stepUpUsed,
      ],
    );
    return toOperation(result.rows[0]);
  }

  /** The action history one account has accumulated, newest first. */
  async historyFor(targetUserId: string, limit = 50): Promise<LifecycleOperationRecord[]> {
    const result = await this.pool.query<OperationRow>(
      `SELECT * FROM account_lifecycle_operations
        WHERE target_user_id = $1
        ORDER BY occurred_at DESC
        LIMIT $2`,
      [targetUserId, limit],
    );
    return result.rows.map(toOperation);
  }
}
