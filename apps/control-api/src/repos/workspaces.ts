import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { CONTROL_API_POOL } from "../tokens";

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
  constructor(@Inject(CONTROL_API_POOL) private readonly pool: Pool) {}

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
    await this.pool.query(
      `INSERT INTO workspaces (workspace_id, name, owner_user_id)
       VALUES ($1, $2, $3)`,
      [workspaceId, `${username}'s workspace`, userId],
    );
    await this.pool.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, 'OWNER')`,
      [workspaceId, userId],
    );
    return workspaceId;
  }

  async isMember(workspaceId: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    );
    return result.rowCount !== null && result.rowCount > 0;
  }
}
