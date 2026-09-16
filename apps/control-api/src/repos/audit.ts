import { Pool } from "pg";
import { randomId } from "../domain";

export type AuditResult = "SUCCESS" | "FAILURE" | "DENIED";

/**
 * A4-1 · the security-decision event family.
 *
 * Named here rather than spelled at each call site so the set is reviewable in
 * one place and a typo becomes a compile error instead of an event nobody ever
 * queries. §20.5 item 6 requires these four lifecycles to be auditable:
 * activation recovery, owner step-up, the reset/lock lifecycle, and
 * authorization denials.
 */
export const SECURITY_AUDIT_EVENTS = [
  /** A bound identity reached a `must_change_password` account with nothing left to log in with. */
  "activation_recovery_required",
  /** A login attempt against such an account — the response stays generic; this row is why. */
  "login_denied_activation_unusable",
  /** An owner-only route admitted the owner (the step-up that authorized a mutation). */
  "owner_step_up_granted",
  /** An owner-only route refused a caller, with the stage that refused. */
  "owner_step_up_denied",
  /** The failed-login threshold locked an account. */
  "account_locked",
  /** An owner reset cleared the lock and the failure counter. */
  "account_lock_cleared",
  /**
   * A4-2 · an owner account lifecycle operation was applied.
   *
   * The full record — what changed, from what, and how to undo it — lives in
   * `account_lifecycle_operations`. This row exists so that
   * `auth_audit_events` remains one readable identity trail: a reader asking
   * "what has happened to this account" should not have to know that half the
   * answer is in a different table.
   */
  "account_lifecycle_applied",
  /** An owner account lifecycle operation was refused, with the stage. */
  "account_lifecycle_refused",
] as const;

export type SecurityAuditEvent = (typeof SECURITY_AUDIT_EVENTS)[number];

/**
 * Metadata keys that must never reach an audit row.
 *
 * The realistic leak is not an exotic one: it is a developer writing
 * `metadata: { activationToken: token }` while debugging and shipping it. The
 * key a developer chooses is the most reliable signal of what the value is, so
 * that is what this matches.
 */
const FORBIDDEN_METADATA_KEY =
  /(token|secret|password|credential|assertion|jwt|bearer|cookie|authoriz|source_ip|ip_addr|user_agent|email)/i;

/**
 * Values shaped like a secret, whatever they are called.
 *
 * A bare 64-hex string is a sha256; a long unbroken base64url run is a random
 * token. `params_digest` and friends survive because they carry a `sha256:`
 * prefix, so they are not a bare hash.
 */
const SECRET_SHAPED_VALUE = /^(?:[0-9a-f]{64}|[A-Za-z0-9_-]{40,})$/;
const EMAIL_SHAPED_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REDACTED = "[REDACTED]";

/**
 * Strip anything secret-shaped, and say so in the row.
 *
 * This REDACTS rather than throws on purpose. An audit write happens inside
 * login and inside authorization denial; making it throw would turn a
 * developer's metadata mistake into a 500 on the login path — trading a
 * logging defect for an outage. Redacting keeps the rule true in production,
 * and the `[REDACTED]` marker in the row is what tells a reviewer it happened.
 */
export function redactAuditMetadata(
  value: unknown,
  keyHint?: string,
  depth = 0,
): unknown {
  if (depth > 6) return REDACTED;
  if (keyHint && FORBIDDEN_METADATA_KEY.test(keyHint)) return REDACTED;
  if (typeof value === "string") {
    return SECRET_SHAPED_VALUE.test(value) || EMAIL_SHAPED_VALUE.test(value)
      ? REDACTED
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactAuditMetadata(entry, undefined, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactAuditMetadata(entry, key, depth + 1);
    }
    return out;
  }
  return value;
}

export class AuditRepository {
  constructor(private readonly pool: Pool) {}

  async record(input: {
    eventType: string;
    actorUserId?: string | null;
    targetUserId?: string | null;
    accessSubject?: string | null;
    requestId?: string | null;
    sourceIp?: string | null;
    userAgentHash?: string | null;
    result: AuditResult;
    reasonCode?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_audit_events
         (event_id, event_type, actor_user_id, target_user_id, access_subject,
          request_id, source_ip, user_agent_hash, result, reason_code, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        randomId("evt"),
        input.eventType,
        input.actorUserId ?? null,
        input.targetUserId ?? null,
        input.accessSubject ?? null,
        input.requestId ?? null,
        input.sourceIp ?? null,
        input.userAgentHash ?? null,
        input.result,
        input.reasonCode ?? null,
        input.metadata ? JSON.stringify(redactAuditMetadata(input.metadata)) : null,
      ],
    );
  }

  /**
   * A4-1 · record a security decision with no channel for a secret.
   *
   * This signature is the enforcement. `record` accepts `sourceIp`,
   * `accessSubject` and `userAgentHash`, which §20.5 item 6 forbids for this
   * family; the way to make that hold is not a comment asking callers to be
   * careful, it is a function that has nowhere to put them. What remains is
   * exactly what an owner needs to reconstruct the decision: who, about whom,
   * which way it went, why, and which request it belonged to.
   */
  async recordSecurityDecision(input: {
    eventType: SecurityAuditEvent;
    actorUserId?: string | null;
    targetUserId?: string | null;
    result: AuditResult;
    reasonCode: string;
    requestId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.record({
      eventType: input.eventType,
      actorUserId: input.actorUserId ?? null,
      targetUserId: input.targetUserId ?? null,
      result: input.result,
      reasonCode: input.reasonCode,
      requestId: input.requestId ?? null,
      metadata: input.metadata,
    });
  }
}
