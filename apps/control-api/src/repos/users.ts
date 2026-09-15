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

  /**
   * A4-F07 · the lock duration is the configured one.
   *
   * `LOGIN_LOCK_SECONDS` existed in the config schema and was read by nothing:
   * a repo-wide search found exactly one occurrence, its own declaration. The
   * duration was the SQL literal `interval '15 minutes'` here, which happens
   * to equal the default — so setting the environment variable changed
   * nothing, silently. The sibling `LOGIN_LOCK_ATTEMPTS` was already honoured
   * as a bind parameter, which is why the mismatch was easy to miss.
   *
   * This repository has no access to config (its constructor takes only a
   * Pool), so the duration arrives the same way the threshold does — as a bind
   * parameter supplied by the caller that does hold config.
   */
  async recordFailedLogin(
    userId: string,
    lockAtAttempts: number,
    lockSeconds: number,
  ): Promise<number> {
    /*
     * A4-1 · the counter is a run of failures, not a lifetime total.
     *
     * It used to be a lifetime total that nothing but a successful login could
     * reset, and the lock check returns before the increment — so a locked
     * account parked at exactly the threshold. Once the lock aged out, ONE
     * further wrong guess satisfied `count + 1 >= threshold` again and bought
     * another full lock window. Against the single Portal owner that is a
     * permanent lockout for the price of one request every fifteen minutes,
     * and with owner-only administration there is no one left who can undo it.
     *
     * An expired lock now ends the run: the count restarts at 1 and
     * `locked_until` is cleared, so re-locking costs the whole threshold
     * again. The account still locks exactly as before within a single run.
     */
    const result = await this.pool.query<{ failed_login_count: number }>(
      `UPDATE portal_users AS u
          SET failed_login_count = run.attempts,
              updated_at = now(),
              locked_until = CASE
                WHEN run.attempts >= $2 THEN now() + make_interval(secs => $3)
                WHEN u.locked_until IS NOT NULL AND u.locked_until <= now() THEN NULL
                ELSE u.locked_until
              END
         FROM (
           SELECT user_id,
                  CASE WHEN locked_until IS NOT NULL AND locked_until <= now()
                       THEN 1
                       ELSE failed_login_count + 1 END AS attempts
             FROM portal_users
            WHERE user_id = $1
         ) AS run
        WHERE u.user_id = run.user_id
       RETURNING u.failed_login_count`,
      [userId, lockAtAttempts, lockSeconds],
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
