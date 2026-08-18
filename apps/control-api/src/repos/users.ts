import { Pool } from "pg";
import { PortalUser, Role, UserStatus } from "../domain";

interface UserRow {
  user_id: string;
  username: string;
  display_name: string;
  role: Role;
  status: UserStatus;
  must_change_password: boolean;
  failed_login_count: number;
  locked_until: Date | null;
  session_version: number;
  created_at: Date;
  updated_at: Date;
  disabled_at: Date | null;
}

function toUser(row: UserRow): PortalUser {
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    mustChangePassword: row.must_change_password,
    failedLoginCount: row.failed_login_count,
    lockedUntil: row.locked_until,
    sessionVersion: row.session_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    disabledAt: row.disabled_at,
  };
}

export class UsersRepository {
  constructor(private readonly pool: Pool) {}

  async findByUsername(username: string): Promise<PortalUser | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT * FROM portal_users WHERE username = $1`,
      [username],
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  async findById(userId: string): Promise<PortalUser | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT * FROM portal_users WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  async list(): Promise<PortalUser[]> {
    const result = await this.pool.query<UserRow>(
      `SELECT * FROM portal_users ORDER BY username`,
    );
    return result.rows.map(toUser);
  }

  async create(input: {
    userId: string;
    username: string;
    displayName: string;
    role: Role;
  }): Promise<PortalUser> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
       VALUES ($1, $2, $3, $4, 'INVITED', true)
       RETURNING *`,
      [input.userId, input.username, input.displayName, input.role],
    );
    return toUser(result.rows[0]);
  }

  async update(input: {
    userId: string;
    displayName?: string;
    role?: Role;
    status?: UserStatus;
    mustChangePassword?: boolean;
  }): Promise<PortalUser | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (input.displayName !== undefined) {
      values.push(input.displayName);
      sets.push(`display_name = $${values.length}`);
    }
    if (input.role !== undefined) {
      values.push(input.role);
      sets.push(`role = $${values.length}`);
    }
    if (input.status !== undefined) {
      values.push(input.status);
      sets.push(`status = $${values.length}`);
      if (input.status === "DISABLED") {
        sets.push(`disabled_at = now()`);
      } else if (input.status === "ACTIVE") {
        sets.push(`disabled_at = NULL`);
      }
    }
    if (input.mustChangePassword !== undefined) {
      values.push(input.mustChangePassword);
      sets.push(`must_change_password = $${values.length}`);
    }
    if (sets.length === 0) {
      return this.findById(input.userId);
    }
    sets.push(`updated_at = now()`);
    values.push(input.userId);
    const result = await this.pool.query<UserRow>(
      `UPDATE portal_users SET ${sets.join(", ")} WHERE user_id = $${values.length}
       RETURNING *`,
      values,
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  async recordFailedLogin(userId: string, lockAtAttempts: number): Promise<number> {
    const result = await this.pool.query<{ failed_login_count: number }>(
      `UPDATE portal_users
         SET failed_login_count = failed_login_count + 1,
             updated_at = now(),
             locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + interval '15 minutes' ELSE locked_until END
       WHERE user_id = $1
       RETURNING failed_login_count`,
      [userId, lockAtAttempts],
    );
    return result.rows[0]?.failed_login_count ?? 0;
  }

  async resetLoginCounters(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE portal_users SET failed_login_count = 0, locked_until = NULL, updated_at = now()
       WHERE user_id = $1`,
      [userId],
    );
  }

  async bumpSessionVersion(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE portal_users SET session_version = session_version + 1, updated_at = now()
       WHERE user_id = $1`,
      [userId],
    );
  }
}
