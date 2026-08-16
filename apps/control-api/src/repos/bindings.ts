import { Pool } from "pg";
import { ExternalIdentityBinding, normalizeEmail } from "../domain";

interface BindingRow {
  binding_id: string;
  user_id: string;
  provider: "cloudflare_access";
  issuer: string;
  subject: string;
  normalized_email: string;
  email_verified: boolean;
  bound_at: Date;
  last_seen_at: Date | null;
}

function toBinding(row: BindingRow): ExternalIdentityBinding {
  return {
    bindingId: row.binding_id,
    userId: row.user_id,
    provider: row.provider,
    issuer: row.issuer,
    subject: row.subject,
    normalizedEmail: row.normalized_email,
    emailVerified: row.email_verified,
    boundAt: row.bound_at,
    lastSeenAt: row.last_seen_at,
  };
}

export class BindingsRepository {
  constructor(private readonly pool: Pool) {}

  async findByProviderIdentity(
    issuer: string,
    subject: string,
  ): Promise<ExternalIdentityBinding | null> {
    const result = await this.pool.query<BindingRow>(
      `SELECT * FROM external_identity_bindings
       WHERE provider = 'cloudflare_access' AND issuer = $1 AND subject = $2`,
      [issuer, subject],
    );
    return result.rows[0] ? toBinding(result.rows[0]) : null;
  }

  async findByProviderEmail(
    issuer: string,
    email: string,
  ): Promise<ExternalIdentityBinding | null> {
    const result = await this.pool.query<BindingRow>(
      `SELECT * FROM external_identity_bindings
       WHERE provider = 'cloudflare_access' AND issuer = $1 AND normalized_email = $2`,
      [issuer, normalizeEmail(email)],
    );
    return result.rows[0] ? toBinding(result.rows[0]) : null;
  }

  async create(input: {
    bindingId: string;
    userId: string;
    issuer: string;
    subject: string;
    email: string;
  }): Promise<ExternalIdentityBinding> {
    const result = await this.pool.query<BindingRow>(
      `INSERT INTO external_identity_bindings
         (binding_id, user_id, provider, issuer, subject, normalized_email, email_verified)
       VALUES ($1, $2, 'cloudflare_access', $3, $4, $5, true)
       RETURNING *`,
      [
        input.bindingId,
        input.userId,
        input.issuer,
        input.subject,
        normalizeEmail(input.email),
      ],
    );
    return toBinding(result.rows[0]);
  }

  async touch(bindingId: string): Promise<void> {
    await this.pool.query(
      `UPDATE external_identity_bindings SET last_seen_at = now() WHERE binding_id = $1`,
      [bindingId],
    );
  }
}
