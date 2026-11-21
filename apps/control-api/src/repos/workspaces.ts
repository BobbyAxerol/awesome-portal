import { Inject, Injectable, Optional } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { CONTROL_API_POOL, CONTROL_API_CONFIG } from "../tokens";
import type { ControlApiConfig } from "../config";
import { retainedReview } from "../execution/retained-read-profile";

export interface Workspace {
  workspaceId: string;
  name: string;
  ownerUserId: string;
  createdAt: Date;
}

interface WorkspaceRow {
  workspace_id: string;
  name: string;
  owner_user_id: string;
  created_at: Date;
}

@Injectable()
export class WorkspacesRepository {
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool | PoolClient,
    @Optional() @Inject(CONTROL_API_CONFIG) private readonly config?: ControlApiConfig) {}

  async findByMembership(userId: string): Promise<Workspace[]> {
    const result = await this.pool.query<WorkspaceRow>(
      `SELECT w.* FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.workspace_id
       WHERE m.user_id = $1
       ORDER BY w.created_at`,
      [userId],
    );
    return result.rows.map((row) => ({
      workspaceId: row.workspace_id,
      name: row.name,
      ownerUserId: row.owner_user_id,
      createdAt: row.created_at,
    }));
  }

  async personalWorkspace(userId: string): Promise<Workspace | null> {
    const memberships = await this.findByMembership(userId);
    const owned = memberships.find((item) => item.ownerUserId === userId);
    if (owned) return owned;
    return null;
  }

  async createPersonal(userId: string, username: string): Promise<Workspace> {
    const workspaceId = await this.ensurePersonal(userId, username);
    const result = await this.pool.query<WorkspaceRow>(
      `SELECT * FROM workspaces WHERE workspace_id = $1`,
      [workspaceId],
    );
    const row = result.rows[0];
    return {
      workspaceId: row.workspace_id,
      name: row.name,
      ownerUserId: row.owner_user_id,
      createdAt: row.created_at,
    };
  }

  async ensurePersonal(userId: string, username: string): Promise<string> {
    const { newUlid } = await import("../id");
    const existing = await this.personalWorkspace(userId);
    if (existing) return existing.workspaceId;
    const workspaceId = newUlid("ws");
    // One statement is atomic for both a Pool and a caller-owned PoolClient:
    // a membership refusal must not leave a committed owner-only workspace.
    // This does not change personal-workspace selection, deduplicate concurrent
    // provisioning, or establish an actor/session-generation authority fence.
    const result = await this.pool.query<{ workspace_id: string }>(
      `WITH created AS (
         INSERT INTO workspaces (workspace_id, name, owner_user_id)
         VALUES ($1, $2, $3)
         RETURNING workspace_id
       ), member AS (
         INSERT INTO workspace_members (workspace_id, user_id, role)
         SELECT workspace_id, $3, 'OWNER' FROM created
         RETURNING workspace_id
       )
       SELECT workspace_id FROM member`,
      [workspaceId, `${username}'s workspace`, userId],
    );
    return result.rows[0].workspace_id;
  }

  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  /** GET authority only. Never use this for Research, Governance decide or writes. */
  async canReadExecution(workspaceId: string, userId: string, environment?: string): Promise<boolean> {
    if (!retainedReview(this.config)) return this.isMember(workspaceId, userId);
    if (workspaceId !== this.config!.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID ||
      (environment !== undefined && !["paper", "sandbox", "live", "all", "canary"].includes(environment))) return false;
    const result = await this.pool.query(`SELECT 1 FROM portal_users u WHERE u.user_id=$2
      AND u.status='ACTIVE' AND NOT u.must_change_password AND (
        EXISTS(SELECT 1 FROM portal_owner_anchor a WHERE a.anchor_id='PORTAL_OWNER' AND a.user_id=u.user_id)
        OR EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=$1 AND m.user_id=u.user_id)
        OR EXISTS(SELECT 1 FROM execution_retained_review_access g WHERE g.workspace_id=$1 AND g.user_id=u.user_id
          AND g.revoked_at IS NULL AND g.expires_at>now()))`,[workspaceId,userId]);
    return Boolean(result.rowCount);
  }
}
