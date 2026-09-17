import { Pool, PoolClient } from "pg";

import { PortalCapability, isPortalCapability } from "./owner-access";

/**
 * A4-3 · Portal-owned Governance delegation.
 *
 * Two shapes live here. `portal_capability_grants` is the current answer to
 * "what may this person do"; `portal_capability_grant_events` is the immutable
 * record of how that answer got there, including the times it did not change.
 *
 * There is deliberately **no cache**. §20.5 item 1 requires a grant change to
 * take effect immediately for HTTP and SSE, and the cheapest way to be sure of
 * that is to have nothing to invalidate: every authorization decision reads the
 * grants at the moment it decides. If that ever becomes a measured problem, the
 * fix is a cache with an explicit invalidation path and a test that proves a
 * revoke lands inside one request — not a quiet TTL.
 */

export interface CapabilityGrant {
  grantId: string;
  granteeUserId: string;
  capability: PortalCapability;
  /** `null` means every workspace the grantee is already a member of. */
  workspaceId: string | null;
  state: "ACTIVE" | "REVOKED";
  grantRevision: number;
  issuedBy: string;
  issuedAt: Date;
  revokedBy: string | null;
  revokedAt: Date | null;
}

interface GrantRow {
  grant_id: string;
  grantee_user_id: string;
  capability: string;
  workspace_id: string | null;
  state: "ACTIVE" | "REVOKED";
  grant_revision: number;
  issued_by: string;
  issued_at: Date;
  revoked_by: string | null;
  revoked_at: Date | null;
}

function toGrant(row: GrantRow): CapabilityGrant {
  return {
    grantId: row.grant_id,
    granteeUserId: row.grantee_user_id,
    // The column has its own CHECK, but a row written by anything other than
    // this service is still read through the same narrow door as everything
    // else: an unrecognised capability is dropped, never trusted.
    capability: row.capability as PortalCapability,
    workspaceId: row.workspace_id,
    state: row.state,
    grantRevision: row.grant_revision,
    issuedBy: row.issued_by,
    issuedAt: row.issued_at,
    revokedBy: row.revoked_by,
    revokedAt: row.revoked_at,
  };
}

export type GrantOutcome = "APPLIED" | "REPLAYED" | "CONFLICT" | "DENIED";

export interface GrantEvent {
  eventId: string;
  idempotencyKey: string;
  grantId: string | null;
  granteeUserId: string;
  capability: string;
  action: "GRANT" | "REVOKE";
  actorUserId: string;
  expectedRevision: number;
  resultingRevision: number | null;
  /** The digest of what was asked, so a reused key with a different payload is
   * a caller bug rather than an answerable retry. */
  requestFingerprint: string;
  outcome: GrantOutcome;
  reasonCode: string | null;
  stateBefore: Record<string, unknown> | null;
  stateAfter: Record<string, unknown> | null;
  stepUpUsed: boolean;
  occurredAt: Date;
}

interface EventRow {
  event_id: string;
  idempotency_key: string;
  grant_id: string | null;
  grantee_user_id: string;
  capability: string;
  action: "GRANT" | "REVOKE";
  actor_user_id: string;
  expected_revision: number;
  resulting_revision: number | null;
  request_fingerprint: string;
  outcome: GrantOutcome;
  reason_code: string | null;
  state_before: Record<string, unknown> | null;
  state_after: Record<string, unknown> | null;
  step_up_used: boolean;
  occurred_at: Date;
}

function toEvent(row: EventRow): GrantEvent {
  return {
    eventId: row.event_id,
    idempotencyKey: row.idempotency_key,
    grantId: row.grant_id,
    granteeUserId: row.grantee_user_id,
    capability: row.capability,
    action: row.action,
    actorUserId: row.actor_user_id,
    expectedRevision: row.expected_revision,
    resultingRevision: row.resulting_revision,
    requestFingerprint: row.request_fingerprint,
    outcome: row.outcome,
    reasonCode: row.reason_code,
    stateBefore: row.state_before,
    stateAfter: row.state_after,
    stepUpUsed: row.step_up_used,
    occurredAt: row.occurred_at,
  };
}

export class GovernanceGrantsRepository {
  /** See AccountLifecycleRepository: mutation services pass a transaction client. */
  constructor(private readonly pool: Pool | PoolClient) {}

  // ------------------------------------------------------------- reading

  /**
   * Every live grant a person holds.
   *
   * Fails CLOSED on a database error the way `OwnerAccessRepository` does: a
   * fact you could not read is not a fact you may assume, and the cost of
   * guessing here is somebody deciding a Governance gate they were never
   * granted.
   */
  async activeGrantsFor(granteeUserId: string): Promise<CapabilityGrant[]> {
    try {
      const result = await this.pool.query<GrantRow>(
        `SELECT * FROM portal_capability_grants
          WHERE grantee_user_id = $1 AND state = 'ACTIVE'
          ORDER BY capability`,
        [granteeUserId],
      );
      return result.rows.map(toGrant).filter((g) => isPortalCapability(g.capability));
    } catch {
      return [];
    }
  }

  /** The whole policy surface, for the owner's Profile & Access screen. */
  async listGrants(input: { granteeUserId?: string; includeRevoked?: boolean } = {}):
    Promise<CapabilityGrant[]> {
    const where: string[] = [];
    const values: unknown[] = [];
    if (input.granteeUserId) {
      values.push(input.granteeUserId);
      where.push(`grantee_user_id = $${values.length}`);
    }
    if (!input.includeRevoked) where.push(`state = 'ACTIVE'`);
    const result = await this.pool.query<GrantRow>(
      `SELECT * FROM portal_capability_grants
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY grantee_user_id, capability`,
      values,
    );
    return result.rows.map(toGrant);
  }

  async findActive(input: {
    granteeUserId: string;
    capability: PortalCapability;
    workspaceId: string | null;
  }): Promise<CapabilityGrant | null> {
    const result = await this.pool.query<GrantRow>(
      `SELECT * FROM portal_capability_grants
        WHERE grantee_user_id = $1 AND capability = $2
          AND coalesce(workspace_id, '*') = coalesce($3, '*')
          AND state = 'ACTIVE'`,
      [input.granteeUserId, input.capability, input.workspaceId],
    );
    return result.rows[0] ? toGrant(result.rows[0]) : null;
  }

  // ------------------------------------------------------------- writing

  /**
   * Create a live grant.
   *
   * The partial unique index is what makes "already granted" impossible rather
   * than merely unlikely: a duplicate raises instead of producing a second row
   * the revoke would then only half remove. The caller turns that into a typed
   * refusal.
   */
  async insertGrant(input: {
    grantId: string;
    granteeUserId: string;
    capability: PortalCapability;
    workspaceId: string | null;
    issuedBy: string;
  }): Promise<CapabilityGrant> {
    const result = await this.pool.query<GrantRow>(
      `INSERT INTO portal_capability_grants
         (grant_id, grantee_user_id, capability, workspace_id, state, issued_by)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)
       RETURNING *`,
      [input.grantId, input.granteeUserId, input.capability, input.workspaceId, input.issuedBy],
    );
    return toGrant(result.rows[0]);
  }

  /**
   * The transaction-safe sibling of `insertGrant`.
   *
   * An active-grant uniqueness race must be a normal typed refusal, not a
   * driver error that aborts the transaction after unrelated work has started.
   * `ON CONFLICT DO NOTHING` leaves the transaction usable so the caller can
   * append its immutable refusal event in that same commit.
   */
  async insertGrantIfAbsent(input: {
    grantId: string;
    granteeUserId: string;
    capability: PortalCapability;
    workspaceId: string | null;
    issuedBy: string;
  }): Promise<CapabilityGrant | null> {
    const result = await this.pool.query<GrantRow>(
      `INSERT INTO portal_capability_grants
         (grant_id, grantee_user_id, capability, workspace_id, state, issued_by)
       VALUES ($1, $2, $3, $4, 'ACTIVE', $5)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [input.grantId, input.granteeUserId, input.capability, input.workspaceId, input.issuedBy],
    );
    return result.rows[0] ? toGrant(result.rows[0]) : null;
  }

  /**
   * Revoke, pinned to the revision the caller believed was current.
   *
   * `null` means the guarded UPDATE matched nothing — the grant is gone, or
   * somebody else changed it first. The caller distinguishes those by reading,
   * because "revoked by your colleague" and "never existed" are different
   * things to tell an owner.
   */
  async revokeGrant(input: {
    grantId: string;
    expectedRevision: number;
    revokedBy: string;
  }): Promise<CapabilityGrant | null> {
    const result = await this.pool.query<GrantRow>(
      `UPDATE portal_capability_grants
          SET state = 'REVOKED',
              revoked_by = $3,
              revoked_at = now(),
              grant_revision = grant_revision + 1,
              updated_at = now()
        WHERE grant_id = $1 AND grant_revision = $2 AND state = 'ACTIVE'
       RETURNING *`,
      [input.grantId, input.expectedRevision, input.revokedBy],
    );
    return result.rows[0] ? toGrant(result.rows[0]) : null;
  }

  async findById(grantId: string): Promise<CapabilityGrant | null> {
    const result = await this.pool.query<GrantRow>(
      `SELECT * FROM portal_capability_grants WHERE grant_id = $1`,
      [grantId],
    );
    return result.rows[0] ? toGrant(result.rows[0]) : null;
  }

  // -------------------------------------------------------------- lineage

  async findEventByKey(idempotencyKey: string): Promise<GrantEvent | null> {
    const result = await this.pool.query<EventRow>(
      `SELECT * FROM portal_capability_grant_events WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    return result.rows[0] ? toEvent(result.rows[0]) : null;
  }

  async recordEvent(input: {
    eventId: string;
    idempotencyKey: string;
    grantId: string | null;
    granteeUserId: string;
    capability: string;
    action: "GRANT" | "REVOKE";
    actorUserId: string;
    expectedRevision: number;
    resultingRevision: number | null;
    requestFingerprint: string;
    outcome: GrantOutcome;
    reasonCode?: string | null;
    stateBefore?: Record<string, unknown> | null;
    stateAfter?: Record<string, unknown> | null;
    requestId?: string | null;
    stepUpUsed: boolean;
  }): Promise<GrantEvent> {
    const result = await this.pool.query<EventRow>(
      `INSERT INTO portal_capability_grant_events
         (event_id, idempotency_key, grant_id, grantee_user_id, capability, action,
          actor_user_id, expected_revision, resulting_revision, request_fingerprint,
          outcome, reason_code, state_before, state_after, request_id, step_up_used)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        input.eventId,
        input.idempotencyKey,
        input.grantId,
        input.granteeUserId,
        input.capability,
        input.action,
        input.actorUserId,
        input.expectedRevision,
        input.resultingRevision,
        input.requestFingerprint,
        input.outcome,
        input.reasonCode ?? null,
        input.stateBefore ? JSON.stringify(input.stateBefore) : null,
        input.stateAfter ? JSON.stringify(input.stateAfter) : null,
        input.requestId ?? null,
        input.stepUpUsed,
      ],
    );
    return toEvent(result.rows[0]);
  }

  async eventsFor(granteeUserId: string, limit = 100): Promise<GrantEvent[]> {
    const result = await this.pool.query<EventRow>(
      `SELECT * FROM portal_capability_grant_events
        WHERE grantee_user_id = $1
        ORDER BY occurred_at DESC
        LIMIT $2`,
      [granteeUserId, limit],
    );
    return result.rows.map(toEvent);
  }
}
