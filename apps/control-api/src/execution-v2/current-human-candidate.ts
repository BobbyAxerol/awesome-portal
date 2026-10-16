import { randomUUID } from "node:crypto";
import { exportJWK, importJWK, jwtVerify, SignJWT, type KeyLike } from "jose";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { withTransaction } from "../db/pool";
import type { AccessActor } from "./access.contract";
import { accessDigest } from "./access-policy";
import { captureCurrentHumanSnapshot } from "./current-human-snapshot";

const id = z.string().min(1).max(128).regex(/^[^\u0000-\u001f\u007f]+$/).refine(value => value === value.trim());
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().length(71).regex(/^sha256:[a-f0-9]{64}$/);
export const currentHumanBinding = z.object({ workspace_id: id, environment: z.enum(["paper", "sandbox", "live"]),
  workload_id: id, request_digest: digest }).strict();
export type CurrentHumanBinding = z.infer<typeof currentHumanBinding>;
const humanClaims = z.object({ iss: id, aud: id, sub: id, sid: id, jti: id, iat: integer, nbf: integer, exp: integer,
  purpose: z.literal("pma.identity.v1"), principal_kind: z.literal("human"), session_revision: integer,
  authority_revision: integer, workspace_id: id, environment: z.enum(["paper", "sandbox", "live"]),
  workload_id: id, request_digest: digest }).strict();
const sourceAttestation = z.object({ iss: id, aud: id, sub: id, jti: id, iat: integer, nbf: integer, exp: integer,
  purpose: z.literal("pma.current-human-lease.v1"), lease_id: id, attempt_id: id,
  workspace_id: id, environment: z.enum(["paper", "sandbox", "live"]), workload_id: id, request_digest: digest,
  phase: z.enum(["ENTER", "COMMITTED", "ROLLED_BACK", "UNKNOWN"]),
  source_receipt_id: id.nullable(), source_receipt_digest: digest.nullable(),
}).strict().refine(v => ["COMMITTED", "ROLLED_BACK"].includes(v.phase)
  ? v.source_receipt_id !== null && v.source_receipt_digest !== null
  : v.source_receipt_id === null && v.source_receipt_digest === null, "SOURCE_RECEIPT_REQUIRED");

export class CurrentHumanLeaseError extends Error {
  constructor(readonly code: string) { super("The current identity operation is not available."); }
}
export interface CurrentHumanCandidateConfig {
  issuer: string; audience: string; key_id: string; private_key: KeyLike;
  source: { issuer: string; audience: string; key_id: string; public_key: KeyLike; workload_id: string };
  /** Explicit correctness-cell limits, not approved production budgets. */
  limits: { ttl_ms: number; maximum_unresolved: number; maximum_retained: number };
}
type Row = { lease_id: string; authority_revision: string; subject_id: string; session_id: string; session_revision: string;
  workspace_id: string; environment: "paper" | "sandbox" | "live"; workload_id: string; request_digest: string;
  issued_at_ms: string; expires_at_ms: string; phase: string; attempt_id: string | null; terminal_receipt_digest: string | null };

/** UNMOUNTED internal candidate; no HTTP routes/DI registration/config defaults.
 * Requires its explicit isolated SQL installer and injected Ed25519 trust. JWTs
 * are human identity, NEVER workload credentials or TS economic permissions.
 * All Core transactions end before token signing or source/network I/O. */
export class CurrentHumanCandidate {
  private constructor(private readonly pool: Pool, private readonly config: CurrentHumanCandidateConfig,
    private readonly humanPublicKey: KeyLike) {}

  static async create(pool: Pool, input: CurrentHumanCandidateConfig) {
    if ([pool.options.connectionTimeoutMillis, pool.options.query_timeout]
      .some(n => !Number.isSafeInteger(n) || Number(n) < 1 || Number(n) > 60_000))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_POOL_TIMEOUT_REQUIRED");
    const config = { ...input, source: { ...input.source }, limits: { ...input.limits } };
    for (const value of [config.issuer, config.audience, config.key_id, config.source.issuer,
      config.source.audience, config.source.key_id, config.source.workload_id]) id.parse(value);
    const { ttl_ms, maximum_unresolved, maximum_retained } = config.limits;
    if (![ttl_ms, maximum_unresolved, maximum_retained].every(Number.isSafeInteger)
      || ttl_ms < 1000 || ttl_ms > 60_000 || maximum_unresolved < 1 || maximum_unresolved > 128
      || maximum_retained < maximum_unresolved || maximum_retained > 4096)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_LIMITS_INVALID");
    const own = await exportJWK(config.private_key), source = await exportJWK(config.source.public_key);
    if (own.kty !== "OKP" || own.crv !== "Ed25519" || !own.d
      || source.kty !== "OKP" || source.crv !== "Ed25519" || source.d)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_ED25519_TRUST_REQUIRED");
    const { d: _secret, ...publicJwk } = own;
    const publicKey = await importJWK(publicJwk, "EdDSA");
    if (publicKey instanceof Uint8Array) throw new CurrentHumanLeaseError("CURRENT_HUMAN_ED25519_TRUST_REQUIRED");
    return new CurrentHumanCandidate(pool, config, publicKey);
  }

  private async transaction<T>(fn: (db: PoolClient, authority: { revision: string; drain_id: string | null }) => Promise<T>) {
    return withTransaction(this.pool, async db => {
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      const authority = (await db.query("SELECT revision,drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE")).rows[0];
      if (!authority) throw new CurrentHumanLeaseError("CURRENT_HUMAN_CANDIDATE_NOT_INSTALLED");
      return fn(db, authority);
    });
  }

  async issue(actor: AccessActor, untrustedBinding: CurrentHumanBinding): Promise<{ token: string; lease_id: string; expires_at_ms: number }> {
    const binding = currentHumanBinding.parse(untrustedBinding);
    if (binding.workload_id !== this.config.source.workload_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_WORKLOAD_MISMATCH");
    const claims = await this.transaction(async (db, authority) => {
      if (authority.drain_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAINING");
      const current = await captureCurrentHumanSnapshot(db, actor, binding.workspace_id);
      const counts = (await db.query(`SELECT count(*)::int AS retained,
        count(*) FILTER (WHERE phase IN ('ISSUED','ENTERED','UNKNOWN'))::int AS unresolved FROM elp210_candidate.leases`)).rows[0];
      if (counts.unresolved >= this.config.limits.maximum_unresolved || counts.retained >= this.config.limits.maximum_retained)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_CAPACITY_EXHAUSTED");
      const iat = Math.floor(current.now / 1000), exp = Math.floor(Math.min(current.now + this.config.limits.ttl_ms, current.lease_until_ms) / 1000);
      if (exp <= iat) throw new CurrentHumanLeaseError("CURRENT_HUMAN_SESSION_EXPIRING");
      const body = humanClaims.parse({ iss: this.config.issuer, aud: this.config.audience, sub: actor.user_id,
        sid: actor.session_id, jti: randomUUID(), iat, nbf: iat, exp, purpose: "pma.identity.v1", principal_kind: "human",
        session_revision: actor.session_generation, authority_revision: Number(authority.revision), ...binding });
      await db.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
        workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [body.jti, body.authority_revision, body.sub, body.sid,
        body.session_revision, body.workspace_id, body.environment, body.workload_id, body.request_digest,
        current.authority_fingerprint, body.iat * 1000, body.exp * 1000]);
      return body;
    });
    // A concurrent drain can retire this ISSUED lease before signing completes;
    // enter will refuse it. Signing is never performed under a Core lock.
    return { token: await new SignJWT(claims).setProtectedHeader({ alg: "EdDSA", kid: this.config.key_id, typ: "JWT" })
      .sign(this.config.private_key), lease_id: claims.jti, expires_at_ms: claims.exp * 1000 };
  }

  private async attest(token: string) {
    if (typeof token !== "string" || Buffer.byteLength(token) > 8192) throw new CurrentHumanLeaseError("CURRENT_HUMAN_SOURCE_PROOF_INVALID");
    try {
      const verified = await jwtVerify(token, this.config.source.public_key, { algorithms: ["EdDSA"],
        issuer: this.config.source.issuer, audience: this.config.source.audience, maxTokenAge: "60s" });
      if (verified.protectedHeader.kid !== this.config.source.key_id || verified.protectedHeader.typ !== "JWT") throw new Error();
      const body = sourceAttestation.parse(verified.payload);
      if (body.sub !== this.config.source.workload_id || body.workload_id !== body.sub || body.nbf !== body.iat
        || body.exp <= body.iat || body.exp - body.iat > 60) throw new Error();
      return body;
    } catch { throw new CurrentHumanLeaseError("CURRENT_HUMAN_SOURCE_PROOF_INVALID"); }
  }

  /** Source MUST enter once BEFORE borrowing its TS connection. Replayed entry
   * is refused, not permission for a second TS transaction. Lost enter ACK needs
   * the same source attempt's qualified resolution; never blindly retry a write. */
  async enter(humanToken: string, sourceProof: string): Promise<void> {
    const source = await this.attest(sourceProof);
    if (typeof humanToken !== "string" || Buffer.byteLength(humanToken) > 8192)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_TOKEN_INVALID");
    let human: z.infer<typeof humanClaims>;
    try {
      const verified = await jwtVerify(humanToken, this.humanPublicKey, { algorithms: ["EdDSA"],
        issuer: this.config.issuer, audience: this.config.audience, maxTokenAge: "60s" });
      if (verified.protectedHeader.kid !== this.config.key_id || verified.protectedHeader.typ !== "JWT") throw new Error();
      human = humanClaims.parse(verified.payload);
      if (human.exp <= human.iat || human.exp - human.iat > 60 || human.nbf !== human.iat) throw new Error();
    } catch { throw new CurrentHumanLeaseError("CURRENT_HUMAN_TOKEN_INVALID"); }
    if (source.phase !== "ENTER" || source.lease_id !== human.jti) throw new CurrentHumanLeaseError("CURRENT_HUMAN_BINDING_MISMATCH");
    await this.transaction(async (db, authority) => {
      if (authority.drain_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAINING");
      const row = (await db.query<Row>("SELECT * FROM elp210_candidate.leases WHERE lease_id=$1 FOR UPDATE", [human.jti])).rows[0];
      if (!row || row.phase !== "ISSUED") throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      this.bind(row, source);
      if (Number(row.authority_revision) !== human.authority_revision || row.authority_revision !== authority.revision
        || row.subject_id !== human.sub || row.session_id !== human.sid || Number(row.session_revision) !== human.session_revision
        || Number(row.issued_at_ms) !== human.iat * 1000 || Number(row.expires_at_ms) !== human.exp * 1000
        || row.workspace_id !== human.workspace_id || row.environment !== human.environment
        || row.workload_id !== human.workload_id || row.request_digest !== human.request_digest)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_BINDING_MISMATCH");
      const now = Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
      if (now >= Number(row.expires_at_ms)) throw new CurrentHumanLeaseError("CURRENT_HUMAN_EXPIRED");
      await db.query("UPDATE elp210_candidate.leases SET phase='ENTERED',attempt_id=$2 WHERE lease_id=$1", [row.lease_id, source.attempt_id]);
    });
  }

  private bind(row: Row, source: z.infer<typeof sourceAttestation>) {
    if (row.workspace_id !== source.workspace_id || row.environment !== source.environment
      || row.workload_id !== source.workload_id || row.request_digest !== source.request_digest
      || row.attempt_id !== null && row.attempt_id !== source.attempt_id)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_BINDING_MISMATCH");
  }

  /** Only an authenticated source terminal receipt releases a used lease.
   * UNKNOWN persists/quarantines it. Token expiry and local cancellation do not
   * prove that an async COMMIT did not succeed. No TTL-based auto-release. */
  async resolve(sourceProof: string): Promise<{ replayed: boolean; phase: string }> {
    const source = await this.attest(sourceProof);
    if (source.phase === "ENTER") throw new CurrentHumanLeaseError("CURRENT_HUMAN_TERMINAL_REQUIRED");
    return this.transaction(async db => {
      const row = (await db.query<Row>("SELECT * FROM elp210_candidate.leases WHERE lease_id=$1 FOR UPDATE", [source.lease_id])).rows[0];
      if (!row || !["ENTERED", "UNKNOWN", "COMMITTED", "ROLLED_BACK"].includes(row.phase))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_RESOLUTION_NOT_AVAILABLE");
      this.bind(row, source);
      const terminal = source.phase === "UNKNOWN" ? null : accessDigest({ lease_id: source.lease_id, attempt_id: source.attempt_id,
        phase: source.phase, source_receipt_id: source.source_receipt_id, source_receipt_digest: source.source_receipt_digest,
        workspace_id: source.workspace_id, environment: source.environment, workload_id: source.workload_id, request_digest: source.request_digest });
      if (row.phase === source.phase && row.terminal_receipt_digest === terminal) return { replayed: true, phase: row.phase };
      if (["COMMITTED", "ROLLED_BACK"].includes(row.phase)) throw new CurrentHumanLeaseError("CURRENT_HUMAN_TERMINAL_CONFLICT");
      await db.query("UPDATE elp210_candidate.leases SET phase=$2,terminal_receipt_digest=$3 WHERE lease_id=$1",
        [row.lease_id, source.phase, terminal]);
      return { replayed: false, phase: source.phase };
    });
  }

  /** Private operator/provider recovery port, not a browser endpoint. The Core
   * ENTER record survives a PM crash even before it opens its source TX. Hand
   * these exact attempts only to this configured authenticated source provider;
   * no old JWT/session credential or business grant is reconstructed. Reading
   * an attempt never releases it or authorizes another entry/transaction. */
  async recoverableAttempts() {
    return this.transaction(async db => {
      const rows = await db.query<Row>(`SELECT * FROM elp210_candidate.leases
        WHERE workload_id=$1 AND phase IN ('ENTERED','UNKNOWN') ORDER BY issued_at_ms,lease_id LIMIT 128`,
        [this.config.source.workload_id]);
      return rows.rows.map(row => ({ lease_id: row.lease_id, attempt_id: row.attempt_id!, workspace_id: row.workspace_id,
        environment: row.environment, workload_id: row.workload_id, request_digest: row.request_digest,
        human_issuer: this.config.issuer, subject: row.subject_id, session_id: row.session_id,
        session_revision: Number(row.session_revision), authority_revision: Number(row.authority_revision),
        expires_at: Number(row.expires_at_ms) / 1000 }));
    });
  }

  /** Persist drain FIRST, in its own committed short transaction. Do not throw
   * because leases are busy here: doing so would roll back the drain itself. */
  async beginDrain(drainId: string) {
    id.parse(drainId);
    return this.transaction(async (db, authority) => {
      if (authority.drain_id && authority.drain_id !== drainId) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
      await db.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton", [drainId]);
      // Never-used tokens cannot start after drain; retiring these is safe.
      await db.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE phase='ISSUED'");
      return this.drainState(db, drainId, authority.revision);
    });
  }

  private async drainState(db: PoolClient, drainId: string, revision: string) {
    const counts = (await db.query(`SELECT count(*)::int AS pending,
      count(*) FILTER (WHERE phase='UNKNOWN' OR expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000))::int AS unknown
      FROM elp210_candidate.leases WHERE phase IN ('ENTERED','UNKNOWN')`)).rows[0];
    return { drain_id: drainId, authority_revision: Number(revision),
      status: counts.unknown > 0 ? "DRAIN_UNKNOWN" : counts.pending > 0 ? "DRAIN_PENDING" : "DRAIN_READY",
      pending: Number(counts.pending) };
  }

  async drainStatus(drainId: string) {
    return this.transaction(async (db, authority) => {
      if (authority.drain_id !== drainId) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
      return this.drainState(db, drainId, authority.revision);
    });
  }

  /** Call only AFTER the existing authority writer commits. No hidden replay
   * of the mutation; caller must read its actual result before acknowledging. */
  async endDrain(drainId: string, expectedRevision: number) {
    integer.parse(expectedRevision);
    return this.transaction(async (db, authority) => {
      if (authority.drain_id !== drainId || Number(authority.revision) !== expectedRevision)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
      if ((await this.drainState(db, drainId, authority.revision)).status !== "DRAIN_READY") throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_UNRESOLVED");
      await db.query("UPDATE elp210_candidate.authority SET drain_id=NULL WHERE singleton");
    });
  }
}
