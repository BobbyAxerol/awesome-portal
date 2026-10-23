import { Pool, PoolClient } from "pg";
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
  account_revision: number;
  archived_at: Date | null;
}

/** Roster-only display fact, never part of identity/session authorization. */
export interface RosterUser extends PortalUser {
  lastSignInAt?: Date;
}

type RosterUserRow = UserRow & { last_sign_in_at?: Date | null };

function toRosterUser(row: RosterUserRow): RosterUser {
  const user: RosterUser = toUser(row);
  // Audit retention does not prove an account never signed in. No retained
  // successful interactive event means unavailable, not a published null.
  if (row.last_sign_in_at instanceof Date && Number.isFinite(row.last_sign_in_at.getTime())
      && row.last_sign_in_at.getTime() >= 0) user.lastSignInAt = row.last_sign_in_at;
  return user;
}

/** Only a successful interactive login is a sign-in. Research commissioning
 * and preview auto-sessions must not overwrite a human's sign-in timestamp. */
export const ROSTER_LAST_SIGN_IN_SQL = `(SELECT max(a.occurred_at)
  FROM auth_audit_events a
  WHERE a.event_type = 'login_succeeded' AND a.result = 'SUCCESS'
    AND a.actor_user_id = page.user_id AND a.target_user_id = page.user_id
    AND a.reason_code IS DISTINCT FROM 'PREVIEW_AUTO_LOGIN')`;

interface RosterCountsSql {
  total_count: number; matching_count: number;
  n_invited: number; n_active: number; n_disabled: number; n_archived: number;
  n_admin: number; n_user: number; n_locked: number; n_awaiting: number;
}

export interface RosterCountsRow {
  total: number;
  matching: number;
  byState: { INVITED: number; ACTIVE: number; DISABLED: number; ARCHIVED: number };
  byRole: { ADMIN: number; USER: number };
  locked: number;
  awaitingFirstPassword: number;
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
    accountRevision: row.account_revision,
    archivedAt: row.archived_at,
  };
}

/** The filter shared by the count pass and the page, written once so the two cannot drift. `a` is the table alias. */
const rosterMatchSql = (a: string): string =>
  `(($2::text IS NULL OR position(lower($2::text) IN lower(${a}.username)) > 0
                     OR position(lower($2::text) IN lower(${a}.display_name)) > 0)
    AND ($3::text IS NULL OR ${a}.role = $3::text)
    AND ($4::text IS NULL OR (CASE WHEN ${a}.archived_at IS NOT NULL THEN 'ARCHIVED' ELSE ${a}.status END) = $4::text))`;

/**
 * BE-P23 · the exact statement `rosterPage` executes. Parameters: $1 after-username, $2 search, $3 role,
 * $4 state, $5 row limit (page size + 1), $6 the one instant. Exported so the PG spec explains THIS text.
 * `f` feeds only the aggregate; `page` reads `portal_users` directly so its ORDER BY ... LIMIT can use the unique index.
 */
export const ROSTER_PAGE_SQL = `WITH f AS (
         SELECT u.role, u.must_change_password,
                CASE WHEN u.archived_at IS NOT NULL THEN 'ARCHIVED' ELSE u.status END AS acct_state,
                (u.locked_until IS NOT NULL AND u.locked_until > $6::timestamptz) AS is_locked,
                ${rosterMatchSql("u")} AS is_match
           FROM portal_users u
       ), agg AS (
         SELECT count(*)::int AS total_count,
                count(*) FILTER (WHERE is_match)::int AS matching_count,
                count(*) FILTER (WHERE acct_state = 'INVITED')::int AS n_invited,
                count(*) FILTER (WHERE acct_state = 'ACTIVE')::int AS n_active,
                count(*) FILTER (WHERE acct_state = 'DISABLED')::int AS n_disabled,
                count(*) FILTER (WHERE acct_state = 'ARCHIVED')::int AS n_archived,
                count(*) FILTER (WHERE role = 'ADMIN')::int AS n_admin,
                count(*) FILTER (WHERE role = 'USER')::int AS n_user,
                count(*) FILTER (WHERE is_locked)::int AS n_locked,
                count(*) FILTER (WHERE must_change_password AND acct_state <> 'ARCHIVED')::int AS n_awaiting
           FROM f
       ), page AS (
         SELECT u.* FROM portal_users u
          WHERE ${rosterMatchSql("u")} AND ($1::text IS NULL OR u.username > $1::text)
          ORDER BY u.username
          LIMIT $5::int
       )
       SELECT agg.*, page.user_id, page.username, page.display_name, page.role, page.status,
              page.must_change_password, page.failed_login_count, page.locked_until, page.session_version,
              page.created_at, page.updated_at, page.disabled_at, page.account_revision, page.archived_at,
              ${ROSTER_LAST_SIGN_IN_SQL} AS last_sign_in_at
         FROM agg LEFT JOIN page ON true
        ORDER BY page.username`;

export class UsersRepository {
  constructor(private readonly pool: Pool | PoolClient) {}

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

  /** One read snapshot for own-profile's final post-source authority boundary.
   * Do not assemble a positive session/user/workspace proof from three reads
   * that can straddle a revoke. No locks or source I/O in this repository. */
  async findCurrentSessionInWorkspace(input: {
    userId: string; sessionId: string; sessionVersion: number; workspaceId: string;
  }): Promise<PortalUser | null> {
    const result = await this.pool.query<UserRow>(`SELECT u.* FROM portal_users u
      JOIN auth_sessions s ON s.user_id=u.user_id
      JOIN workspace_members m ON m.user_id=u.user_id AND m.workspace_id=$4
      WHERE u.user_id=$1 AND s.session_id=$2 AND u.session_version=$3 AND s.session_version=$3
        AND u.status='ACTIVE' AND u.archived_at IS NULL AND NOT u.must_change_password
        AND s.state='ACTIVE' AND s.idle_expires_at>clock_timestamp()
        AND s.absolute_expires_at>clock_timestamp()`,
    [input.userId, input.sessionId, input.sessionVersion, input.workspaceId]);
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  /** Transaction-only identity fence; never infer ownership from a name. */
  async lockById(userId: string): Promise<PortalUser | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT * FROM portal_users WHERE user_id = $1 FOR UPDATE`, [userId],
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
  }

  async list(): Promise<PortalUser[]> {
    const result = await this.pool.query<UserRow>(
      `SELECT * FROM portal_users ORDER BY username`,
    );
    return result.rows.map(toUser);
  }

  /** Owner roster only. Keep lifecycle audit projections and generic identity
   * reads unchanged; the timestamp comes from the same statement snapshot. */
  async listRoster(): Promise<RosterUser[]> {
    const result = await this.pool.query<RosterUserRow>(
      `SELECT page.*, ${ROSTER_LAST_SIGN_IN_SQL} AS last_sign_in_at
       FROM portal_users page ORDER BY page.username`,
    );
    return result.rows.map(toRosterUser);
  }

  /**
   * BE-P23 · one keyset page of the roster plus its exact counts, from ONE statement.
   *
   * A single SQL statement is a single snapshot, so `counts` and `rows` can never
   * disagree about the same instant (no REPEATABLE READ transaction needed, no
   * second round trip). Order is `username`, which is `UNIQUE` (a total order,
   * so there is no tie to break) and already indexed by `portal_users_username_key`.
   * The page is read from the base table, not from the counting relation: with no
   * filter it is an index range scan that stops after `limit + 1` rows; with a filter
   * it walks the same index until `limit + 1` rows match (measured, not assumed:
   * see the EXPLAIN ANALYZE case in the PG spec). The counts are one aggregate pass
   * over the table (cost O(accounts), no rows leave the database).
   *
   * `locked` uses the instant the caller passes, and the caller hands that same
   * instant to `projectAccount`, so a count and the rows it counts cannot straddle an expiry.
   * The state is derived exactly as `accountStateOf` does (archived wins over status).
   */
  async rosterPage(input: {
    limit: number;
    afterUsername: string | null;
    q: string | null;
    role: Role | null;
    state: "INVITED" | "ACTIVE" | "DISABLED" | "ARCHIVED" | null;
    now: Date;
  }): Promise<{ counts: RosterCountsRow; rows: RosterUser[] }> {
    const result = await this.pool.query<RosterUserRow & RosterCountsSql>(
      ROSTER_PAGE_SQL,
      [input.afterUsername, input.q, input.role, input.state, input.limit + 1, input.now],
    );
    const first = result.rows[0];
    if (!first) throw new Error("roster page statement returned no aggregate row");
    const counts: RosterCountsRow = {
      total: first.total_count,
      matching: first.matching_count,
      byState: { INVITED: first.n_invited, ACTIVE: first.n_active, DISABLED: first.n_disabled, ARCHIVED: first.n_archived },
      byRole: { ADMIN: first.n_admin, USER: first.n_user },
      locked: first.n_locked,
      awaitingFirstPassword: first.n_awaiting,
    };
    return { counts, rows: result.rows.filter((row) => row.user_id !== null).map(toRosterUser) };
  }

  /**
   * A4-2 · the only way an owner lifecycle operation changes an account.
   *
   * The expected revision is part of the WHERE clause, not a check done
   * beforehand: reading the row, deciding, then writing leaves a window in
   * which a second owner — or the same owner in a second tab — applies a
   * different decision to the same account and both believe they won. Here the
   * database decides, once, and a stale caller gets no row back.
   *
   * `null` therefore means "not applied", and the caller must distinguish a
   * missing account from a stale revision by reading afterwards. That is
   * deliberate: conflating them would let the UI tell an owner their colleague
   * deleted an account that is merely one revision ahead.
   */
  async applyLifecycleChange(input: {
    userId: string;
    expectedRevision: number;
    displayName?: string;
    role?: Role;
    status?: UserStatus;
    mustChangePassword?: boolean;
    /** `true` archives, `false` clears the marker; omitted leaves it alone. */
    archived?: boolean;
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
      // `disabled_at` follows the status the same way `update` maintains it,
      // so the two paths cannot disagree about when access was withdrawn.
      sets.push(
        input.status === "DISABLED" ? `disabled_at = now()` : `disabled_at = NULL`,
      );
    }
    if (input.mustChangePassword !== undefined) {
      values.push(input.mustChangePassword);
      sets.push(`must_change_password = $${values.length}`);
    }
    if (input.archived !== undefined) {
      sets.push(input.archived ? `archived_at = now()` : `archived_at = NULL`);
    }
    sets.push(`account_revision = account_revision + 1`);
    sets.push(`updated_at = now()`);
    values.push(input.userId);
    const userIdParam = values.length;
    values.push(input.expectedRevision);
    const result = await this.pool.query<UserRow>(
      `UPDATE portal_users SET ${sets.join(", ")}
        WHERE user_id = $${userIdParam} AND account_revision = $${values.length}
       RETURNING *`,
      values,
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
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

  /**
   * Transaction-safe invitation creation.  A concurrent owner request for the
   * same username is a normal `USERNAME_TAKEN` result for the caller, not a
   * PostgreSQL error that leaves the surrounding operation transaction
   * aborted before it can form a truthful response.
   */
  async createIfAbsent(input: {
    userId: string;
    username: string;
    displayName: string;
    role: Role;
  }): Promise<PortalUser | null> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO portal_users (user_id, username, display_name, role, status, must_change_password)
       VALUES ($1, $2, $3, $4, 'INVITED', true)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [input.userId, input.username, input.displayName, input.role],
    );
    return result.rows[0] ? toUser(result.rows[0]) : null;
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
