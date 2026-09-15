import { Pool } from "pg";

export interface PasswordCredential {
  credentialId: string;
  userId: string;
  passwordHash: string;
  algorithm: "argon2id";
  parametersJson: Record<string, unknown>;
  createdAt: Date;
  changedAt: Date | null;
}

export interface ActivationCredential {
  activationId: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

interface PasswordRow {
  credential_id: string;
  user_id: string;
  password_hash: string;
  algorithm: "argon2id";
  parameters_json: Record<string, unknown>;
  created_at: Date;
  changed_at: Date | null;
}

interface ActivationRow {
  activation_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
}

export class CredentialsRepository {
  constructor(private readonly pool: Pool) {}

  async findPassword(userId: string): Promise<PasswordCredential | null> {
    const result = await this.pool.query<PasswordRow>(
      `SELECT * FROM password_credentials WHERE user_id = $1`,
      [userId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      credentialId: row.credential_id,
      userId: row.user_id,
      passwordHash: row.password_hash,
      algorithm: row.algorithm,
      parametersJson: row.parameters_json,
      createdAt: row.created_at,
      changedAt: row.changed_at,
    };
  }

  async upsertPassword(input: {
    credentialId: string;
    userId: string;
    passwordHash: string;
    parametersJson: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO password_credentials (credential_id, user_id, password_hash, algorithm, parameters_json, created_at, changed_at)
       VALUES ($1, $2, $3, 'argon2id', $4, now(), now())
       ON CONFLICT (user_id) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             parameters_json = EXCLUDED.parameters_json,
             changed_at = now()`,
      [
        input.credentialId,
        input.userId,
        input.passwordHash,
        JSON.stringify(input.parametersJson),
      ],
    );
  }

  async createActivation(input: {
    activationId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string | null;
  }): Promise<ActivationCredential> {
    const result = await this.pool.query<ActivationRow>(
      `INSERT INTO activation_credentials
         (activation_id, user_id, token_hash, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.activationId, input.userId, input.tokenHash, input.expiresAt, input.createdBy],
    );
    return {
      activationId: result.rows[0].activation_id,
      userId: result.rows[0].user_id,
      tokenHash: result.rows[0].token_hash,
      expiresAt: result.rows[0].expires_at,
      usedAt: result.rows[0].used_at,
      revokedAt: result.rows[0].revoked_at,
    };
  }

  async findUsableActivation(
    userId: string,
    tokenHash: string,
  ): Promise<ActivationCredential | null> {
    const result = await this.pool.query<ActivationRow>(
      `SELECT * FROM activation_credentials
       WHERE user_id = $1 AND token_hash = $2
         AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
       ORDER BY expires_at DESC
       LIMIT 1`,
      [userId, tokenHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      activationId: row.activation_id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      revokedAt: row.revoked_at,
    };
  }

  /**
   * A4-1 · is there any activation this account could still log in with?
   *
   * Deliberately the SAME predicate as `findUsableActivation` minus the token
   * hash: unused, unrevoked, unexpired. Asking it without a token is what lets
   * the server distinguish "you typed the wrong thing" from "there is nothing
   * left to type", which is the whole difference between a retry and a dead
   * end. It returns a boolean and never the row, so no caller can be tempted
   * to read a token hash out of a liveness check.
   */
  async hasUsableActivation(userId: string): Promise<boolean> {
    const result = await this.pool.query<{ usable: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM activation_credentials
          WHERE user_id = $1
            AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
       ) AS usable`,
      [userId],
    );
    return result.rows[0]?.usable === true;
  }

  async consumeUsableActivation(
    userId: string,
    tokenHash: string,
  ): Promise<ActivationCredential | null> {
    const result = await this.pool.query<ActivationRow>(
      `UPDATE activation_credentials
          SET used_at = now()
        WHERE activation_id = (
          SELECT activation_id
            FROM activation_credentials
           WHERE user_id = $1 AND token_hash = $2
             AND used_at IS NULL AND revoked_at IS NULL AND expires_at > now()
           ORDER BY expires_at DESC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING *`,
      [userId, tokenHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      activationId: row.activation_id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      expiresAt: row.expires_at,
      usedAt: row.used_at,
      revokedAt: row.revoked_at,
    };
  }

  async matchesConsumedActivation(input: {
    activationId: string;
    userId: string;
    tokenHash: string;
  }): Promise<boolean> {
    const result = await this.pool.query<{ matches: boolean }>(
      `SELECT EXISTS (
         SELECT 1
           FROM activation_credentials
          WHERE activation_id = $1 AND user_id = $2 AND token_hash = $3
            AND used_at IS NOT NULL AND revoked_at IS NULL
       ) AS matches`,
      [input.activationId, input.userId, input.tokenHash],
    );
    return result.rows[0]?.matches === true;
  }

  async revokeActivationCredentials(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE activation_credentials SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }
}
