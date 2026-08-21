import { Pool } from "pg";
import { AuthSession } from "../domain";

interface SessionRow {
  session_id: string;
  session_token_hash: string;
  user_id: string;
  access_subject: string | null;
  access_token_expires_at: Date | null;
  state: "ACTIVE" | "REVOKED" | "EXPIRED";
  csrf_secret_hash: string;
  session_version: number;
  created_at: Date;
  last_seen_at: Date;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  revoked_at: Date | null;
  revoke_reason: string | null;
}

function toSession(row: SessionRow): AuthSession & {
  accessSubject: string | null;
  accessTokenExpiresAt: Date | null;
  csrfSecretHash: string;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
} {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    state: row.state,
    sessionVersion: row.session_version,
    idleExpiresAt: row.idle_expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    accessSubject: row.access_subject,
    accessTokenExpiresAt: row.access_token_expires_at,
    csrfSecretHash: row.csrf_secret_hash,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
  };
}

export class SessionsRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: {
    sessionId: string;
    tokenHash: string;
    userId: string;
    accessSubject: string | null;
    accessTokenExpiresAt: Date | null;
    csrfSecretHash: string;
    sessionVersion: number;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_sessions
         (session_id, session_token_hash, user_id, access_subject, access_token_expires_at,
          state, csrf_secret_hash, session_version, idle_expires_at, absolute_expires_at)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7, $8, $9)
       RETURNING session_id`,
      [
        input.sessionId,
        input.tokenHash,
        input.userId,
        input.accessSubject,
        input.accessTokenExpiresAt,
        input.csrfSecretHash,
        input.sessionVersion,
        input.idleExpiresAt,
        input.absoluteExpiresAt,
      ],
    );
  }

  async findByTokenHash(tokenHash: string): Promise<ReturnType<typeof toSession> | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT * FROM auth_sessions WHERE session_token_hash = $1`,
      [tokenHash],
    );
    return result.rows[0] ? toSession(result.rows[0]) : null;
  }

  async markSeen(sessionId: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_sessions SET last_seen_at = now(), idle_expires_at = now() + interval '30 minutes'
       WHERE session_id = $1`,
      [sessionId],
    );
  }

  async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_sessions SET state = 'REVOKED', revoked_at = now(), revoke_reason = $2
       WHERE session_id = $1`,
      [sessionId, reason],
    );
  }

  async revokeAllForUser(userId: string, reason: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_sessions SET state = 'REVOKED', revoked_at = now(), revoke_reason = $2
       WHERE user_id = $1 AND state = 'ACTIVE'`,
      [userId, reason],
    );
  }

  async isActiveLease(
    sessionId: string,
    userId: string,
    sessionVersion: number,
    now: Date,
  ): Promise<boolean> {
    const result = await this.pool.query<{ active: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM auth_sessions
          WHERE session_id = $1 AND user_id = $2 AND session_version = $3
            AND state = 'ACTIVE' AND idle_expires_at > $4 AND absolute_expires_at > $4
       ) AS active`,
      [sessionId, userId, sessionVersion, now],
    );
    return result.rows[0]?.active === true;
  }

  async expireStale(now: Date): Promise<void> {
    await this.pool.query(
      `UPDATE auth_sessions SET state = 'EXPIRED'
       WHERE state = 'ACTIVE' AND (absolute_expires_at <= $1 OR idle_expires_at <= $1)`,
      [now],
    );
  }
}
