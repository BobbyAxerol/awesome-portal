import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";

/** A source-only custody design, NOT a signer, route, migration, approval or
 * guarantee of exactly-once signature. RESERVED and UNKNOWN always prohibit
 * another attempt. After a crash, RESERVED is treated as UNKNOWN. */
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const planSchema = z.object({ cycle_sha256: digest, b1_sha256: digest, payload_sha256: digest,
  signer_spki_sha256: digest, signer_owner_ref_sha256: digest }).strict();
export type C2B2Plan = z.infer<typeof planSchema>;
type Evidence = Readonly<{ binding_sha256: string; acceptance_sha256: string; seal_sha256: string }>;
type Receipt = Readonly<{ binding_sha256: string; attempt_id: string; receipt_sha256: string }>;

/** Trusted server composition, never deserialized from an HTTP body. Its
 * implementation must authenticate current owner/delegation, A2 acceptance,
 * source C2_SEALED and signer ownership, keep a source authority lease held
 * throughout the callback and abort it on revoke/expiry. A receipt verifier
 * must authenticate the *original signer result* for the identical attempt.
 * No such production verifier is installed here. */
export interface C2B2AuthorityVerifier {
  withVerifiedRelease<T>(proof: unknown, plan: C2B2Plan, operation: (evidence: Evidence) => Promise<T>): Promise<T>;
  withVerifiedOriginalReceipt<T>(proof: unknown, plan: C2B2Plan, attemptId: string,
    operation: (receipt: Receipt) => Promise<T>): Promise<T>;
}
const fail = (code: string): never => { throw new Error(code); };
const binding = (plan: C2B2Plan): string => createHash("sha256").update(JSON.stringify([
  "portal.c2-b2-plan-binding.v1", plan.cycle_sha256, plan.b1_sha256, plan.payload_sha256,
  plan.signer_spki_sha256, plan.signer_owner_ref_sha256,
])).digest("hex");
const rowSchema = planSchema.extend({ binding_sha256: digest,
  state: z.enum(["PREPARED", "RESERVED", "UNKNOWN", "COMPLETED"]), attempt_id: z.string().uuid().nullable(),
  acceptance_sha256: digest.nullable(), seal_sha256: digest.nullable(), receipt_sha256: digest.nullable() }).strict().refine(row =>
  row.state === "PREPARED" ? row.attempt_id === null && row.acceptance_sha256 === null && row.seal_sha256 === null && row.receipt_sha256 === null
    : row.attempt_id !== null && row.acceptance_sha256 !== null && row.seal_sha256 !== null
      && (row.state === "COMPLETED" ? row.receipt_sha256 !== null : row.receipt_sha256 === null));
type Row = z.infer<typeof rowSchema>;

/** Pool and verifier are private process dependencies, not caller data. The
 * no-verifier configuration permits only untrusted plan preparation; it never
 * reserves or completes a signing attempt, even for {sealed:true}. */
export class C2B2PreparationCustody {
  readonly #pool: Pool;
  readonly #verifiedRelease?: C2B2AuthorityVerifier["withVerifiedRelease"];
  readonly #verifiedReceipt?: C2B2AuthorityVerifier["withVerifiedOriginalReceipt"];
  constructor(pool: Pool, verifier?: C2B2AuthorityVerifier) {
    const options = pool?.options;
    const bounded = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 30_000;
    if (!options || !bounded(options.connectionTimeoutMillis) || !bounded(options.query_timeout))
      fail("C2_B2_POOL_TIMEOUTS_REQUIRED");
    this.#pool = pool;
    // Pin the trusted composition itself and the methods selected at startup.
    // TypeScript `private` alone is writable from JavaScript; shadowing a
    // property must not install a verifier or redirect custody after startup.
    const release = verifier?.withVerifiedRelease, receipt = verifier?.withVerifiedOriginalReceipt;
    this.#verifiedRelease = typeof release === "function" ? release.bind(verifier) : undefined;
    this.#verifiedReceipt = typeof receipt === "function" ? receipt.bind(verifier) : undefined;
  }
  async #transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect(); let discard = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '3000ms'");
      await client.query("SET LOCAL statement_timeout = '8000ms'");
      const result = await fn(client); await client.query("COMMIT"); return result;
    }
    catch (error) { try { await client.query("ROLLBACK"); } catch { discard = true; } throw error; }
    finally { client.release(discard); }
  }
  async #locked(client: PoolClient, plan: C2B2Plan): Promise<Row> {
    const result = await client.query<Row>(`SELECT cycle_sha256,binding_sha256,b1_sha256,payload_sha256,signer_spki_sha256,
      signer_owner_ref_sha256,state,attempt_id,acceptance_sha256,seal_sha256,receipt_sha256
      FROM elp210_c2_preparation.b2_attempts WHERE cycle_sha256=$1 FOR UPDATE`, [plan.cycle_sha256]);
    const decoded = rowSchema.safeParse(result.rows[0]);
    if (result.rowCount !== 1 || result.rows.length !== 1 || !decoded.success) return fail("C2_B2_PLAN_BINDING_MISMATCH");
    const row = decoded.data;
    if (row.cycle_sha256 !== plan.cycle_sha256
      || row.binding_sha256 !== binding(plan) || row.b1_sha256 !== plan.b1_sha256 || row.payload_sha256 !== plan.payload_sha256
      || row.signer_spki_sha256 !== plan.signer_spki_sha256 || row.signer_owner_ref_sha256 !== plan.signer_owner_ref_sha256)
      return fail("C2_B2_PLAN_BINDING_MISMATCH");
    return row;
  }
  async prepare(raw: unknown): Promise<{ state: "PREPARED_NOT_AUTHORIZED" }> {
    const parsed = planSchema.safeParse(raw); if (!parsed.success) return fail("C2_B2_PLAN_INVALID");
    const plan = parsed.data;
    return this.#transaction(async client => {
      const inserted = await client.query(`INSERT INTO elp210_c2_preparation.b2_attempts
        (cycle_sha256,binding_sha256,b1_sha256,payload_sha256,signer_spki_sha256,signer_owner_ref_sha256,state)
        VALUES ($1,$2,$3,$4,$5,$6,'PREPARED') ON CONFLICT DO NOTHING`,
      [plan.cycle_sha256,binding(plan),plan.b1_sha256,plan.payload_sha256,plan.signer_spki_sha256,plan.signer_owner_ref_sha256]);
      if (inserted.rowCount !== 0 && inserted.rowCount !== 1) return fail("C2_B2_UNEXPECTED_ROW_COUNT");
      const row = await this.#locked(client, plan);
      if (row.state !== "PREPARED") return fail("C2_B2_PLAN_ALREADY_ATTEMPTED");
      return { state: "PREPARED_NOT_AUTHORIZED" };
    });
  }
  async reserve(raw: unknown, sourceProof: unknown): Promise<{ state: "RESERVED_NOT_AUTHORIZED"; attempt_id: string }> {
    const parsed = planSchema.safeParse(raw); if (!parsed.success) return fail("C2_B2_PLAN_INVALID");
    if (!this.#verifiedRelease) return fail("C2_B2_AUTHORITY_VERIFIER_NOT_INSTALLED");
    const plan = Object.freeze(parsed.data);
    return this.#verifiedRelease(sourceProof, plan, async evidence => {
      // Never hold a verifier-owned mutable object across pool acquisition or
      // a transaction: the facts checked here must be exactly those written.
      if (!evidence) return fail("C2_B2_AUTHORITY_PROOF_INVALID");
      const verified = Object.freeze({ binding_sha256: evidence.binding_sha256,
        acceptance_sha256: evidence.acceptance_sha256, seal_sha256: evidence.seal_sha256 });
      if (verified.binding_sha256 !== binding(plan) || !digest.safeParse(verified.acceptance_sha256).success
        || !digest.safeParse(verified.seal_sha256).success) return fail("C2_B2_AUTHORITY_PROOF_INVALID");
      try { return await this.#transaction(async client => {
        const row = await this.#locked(client, plan);
        if (row.state !== "PREPARED") return fail("C2_B2_ALREADY_RESERVED_OR_TERMINAL");
        const attempt = randomUUID();
        const updated = await client.query(`UPDATE elp210_c2_preparation.b2_attempts SET state='RESERVED',attempt_id=$2,
          acceptance_sha256=$3,seal_sha256=$4 WHERE cycle_sha256=$1`,
        [plan.cycle_sha256,attempt,verified.acceptance_sha256,verified.seal_sha256]);
        if (updated.rowCount !== 1) return fail("C2_B2_UNEXPECTED_ROW_COUNT");
        return { state: "RESERVED_NOT_AUTHORIZED", attempt_id: attempt };
      }); } catch (error) {
        if (error && typeof error === "object" && "code" in error && "constraint" in error &&
          error.code === "23505" && error.constraint === "b2_one_attempt_per_b1")
          return fail("C2_B2_B1_ALREADY_ATTEMPTED");
        throw error;
      }
    });
  }
  /** After a lost response/restart RESERVED is deliberately reported as
   * MAY_HAVE_SIGNED, never as permission to retry or evidence of a signature. */
  async inspect(raw: unknown): Promise<{ state: "PREPARED_NOT_AUTHORIZED" | "MAY_HAVE_SIGNED_DO_NOT_RETRY" | "COMPLETED_NOT_DELIVERED";
    attempt_id: string | null }> {
    const parsed = planSchema.safeParse(raw); if (!parsed.success) return fail("C2_B2_PLAN_INVALID");
    return this.#transaction(async client => {
      const row = await this.#locked(client, parsed.data);
      return { state: row.state === "PREPARED" ? "PREPARED_NOT_AUTHORIZED" : row.state === "COMPLETED"
        ? "COMPLETED_NOT_DELIVERED" : "MAY_HAVE_SIGNED_DO_NOT_RETRY", attempt_id: row.attempt_id };
    });
  }
  /** Conservative local timeout/crash disposition: no re-reservation. */
  async markUnknown(raw: unknown, attemptId: string): Promise<{ state: "UNKNOWN_DO_NOT_RETRY" }> {
    const parsed = planSchema.safeParse(raw);
    if (!parsed.success || !z.string().uuid().safeParse(attemptId).success) return fail("C2_B2_PLAN_INVALID");
    return this.#transaction(async client => {
      const row = await this.#locked(client, parsed.data);
      if (row.attempt_id !== attemptId || !["RESERVED", "UNKNOWN"].includes(row.state)) return fail("C2_B2_ATTEMPT_MISMATCH");
      if (row.state === "RESERVED") {
        const updated = await client.query("UPDATE elp210_c2_preparation.b2_attempts SET state='UNKNOWN' WHERE cycle_sha256=$1", [parsed.data.cycle_sha256]);
        if (updated.rowCount !== 1) return fail("C2_B2_UNEXPECTED_ROW_COUNT");
      }
      return { state: "UNKNOWN_DO_NOT_RETRY" };
    });
  }
  async complete(raw: unknown, attemptId: string, receiptProof: unknown): Promise<{ state: "COMPLETED_NOT_DELIVERED" }> {
    const parsed = planSchema.safeParse(raw);
    if (!parsed.success || !z.string().uuid().safeParse(attemptId).success) return fail("C2_B2_PLAN_INVALID");
    if (!this.#verifiedReceipt) return fail("C2_B2_RECEIPT_VERIFIER_NOT_INSTALLED");
    const plan = Object.freeze(parsed.data);
    return this.#verifiedReceipt(receiptProof, plan, attemptId, async receipt => {
      if (!receipt) return fail("C2_B2_RECEIPT_PROOF_INVALID");
      const verified = Object.freeze({ binding_sha256: receipt.binding_sha256,
        attempt_id: receipt.attempt_id, receipt_sha256: receipt.receipt_sha256 });
      if (verified.binding_sha256 !== binding(plan) || verified.attempt_id !== attemptId
        || !digest.safeParse(verified.receipt_sha256).success) return fail("C2_B2_RECEIPT_PROOF_INVALID");
      return this.#transaction(async client => {
        const row = await this.#locked(client, plan);
        if (row.attempt_id !== attemptId) return fail("C2_B2_ATTEMPT_MISMATCH");
        if (row.state === "COMPLETED") {
          if (row.receipt_sha256 !== verified.receipt_sha256) return fail("C2_B2_RECEIPT_CONFLICT");
          return { state: "COMPLETED_NOT_DELIVERED" };
        }
        if (!["RESERVED", "UNKNOWN"].includes(row.state)) return fail("C2_B2_ATTEMPT_MISMATCH");
        const updated = await client.query("UPDATE elp210_c2_preparation.b2_attempts SET state='COMPLETED',receipt_sha256=$2 WHERE cycle_sha256=$1",
          [plan.cycle_sha256,verified.receipt_sha256]);
        if (updated.rowCount !== 1) return fail("C2_B2_UNEXPECTED_ROW_COUNT");
        return { state: "COMPLETED_NOT_DELIVERED" };
      });
    });
  }
}
