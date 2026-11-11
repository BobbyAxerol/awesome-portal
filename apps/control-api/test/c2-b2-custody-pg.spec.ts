import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { C2B2PreparationCustody, type C2B2AuthorityVerifier, type C2B2Plan } from "../src/execution-v2/c2-b2-custody";

// Disposable dedicated DB only; do not run this on an app/source database.
const enabled = process.env.C2_B2_TEST_DISPOSABLE === "TEST_ONLY_C2_B2_DEDICATED_DATABASE"
  && !!process.env.TEST_DATABASE_URL;
const d = (letter: string) => letter.repeat(64);
const plan = (): C2B2Plan => ({ cycle_sha256: d("a"), b1_sha256: d("b"), payload_sha256: d("c"),
  signer_spki_sha256: d("d"), signer_owner_ref_sha256: d("e") });
const binding = (p: C2B2Plan) => createHash("sha256").update(JSON.stringify([
  "portal.c2-b2-plan-binding.v1", p.cycle_sha256, p.b1_sha256, p.payload_sha256,
  p.signer_spki_sha256, p.signer_owner_ref_sha256])).digest("hex");
const testOnlyVerifier: C2B2AuthorityVerifier = {
  async withVerifiedRelease(proof, p, operation) {
    if (proof !== "TEST_RELEASE") throw new Error("TEST_RELEASE_REJECTED");
    return operation({ binding_sha256: binding(p), acceptance_sha256: d("f"), seal_sha256: d("1") });
  },
  async withVerifiedOriginalReceipt(proof, p, attemptId, operation) {
    if (proof !== "TEST_RECEIPT") throw new Error("TEST_RECEIPT_REJECTED");
    return operation({ binding_sha256: binding(p), attempt_id: attemptId, receipt_sha256: d("2") });
  },
};

describe.skipIf(!enabled)("C2 B2 custody PG — dedicated disposable DB only", () => {
  let pool: Pool, installed = false;
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 12, connectionTimeoutMillis: 5000, query_timeout: 10000 });
    const db = await pool.query<{ name: string; existing: string | null }>(
      "SELECT current_database() AS name, to_regnamespace('elp210_c2_preparation')::text AS existing");
    if (!/^portal_c2_b2_[a-f0-9]{8}$/.test(db.rows[0]?.name ?? "") || db.rows[0]?.existing !== null)
      throw new Error("C2_B2_TEST_DATABASE_NOT_DEDICATED_OR_SCHEMA_EXISTS");
    await pool.query(await readFile(join(process.cwd(), "src/execution-v2/c2-b2-custody.sql"), "utf8"));
    installed = true;
  });
  afterAll(async () => {
    if (pool) {
      if (installed) await pool.query("DROP SCHEMA elp210_c2_preparation CASCADE");
      await pool.end();
    }
  });
  it("serializes competing reserves and preserves UNKNOWN original across pool restart", async () => {
    const p = plan(), first = new C2B2PreparationCustody(pool, testOnlyVerifier);
    await first.prepare(p);
    const attempts = await Promise.allSettled(Array.from({ length: 10 }, () => first.reserve(p, "TEST_RELEASE")));
    const wins = attempts.filter((a): a is PromiseFulfilledResult<{ state: "RESERVED_NOT_AUTHORIZED"; attempt_id: string }> => a.status === "fulfilled");
    expect(wins).toHaveLength(1);
    const original = wins[0]!.value.attempt_id;
    const restartedPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 2, connectionTimeoutMillis: 5000, query_timeout: 10000 });
    try {
      const restarted = new C2B2PreparationCustody(restartedPool, testOnlyVerifier);
      expect(await restarted.inspect(p)).toEqual({ state: "MAY_HAVE_SIGNED_DO_NOT_RETRY", attempt_id: original });
      await expect(restarted.reserve(p, "TEST_RELEASE")).rejects.toThrow("C2_B2_ALREADY_RESERVED_OR_TERMINAL");
      await expect(restarted.markUnknown(p, randomUUID())).rejects.toThrow("C2_B2_ATTEMPT_MISMATCH");
      await restarted.markUnknown(p, original);
      await expect(restarted.reserve(p, "TEST_RELEASE")).rejects.toThrow("C2_B2_ALREADY_RESERVED_OR_TERMINAL");
      await restarted.complete(p, original, "TEST_RECEIPT");
      expect(await restarted.complete(p, original, "TEST_RECEIPT")).toEqual({ state: "COMPLETED_NOT_DELIVERED" });
    } finally { await restartedPool.end(); }
  });
  it("database trigger denies reset, tamper, delete and truncate", async () => {
    await expect(pool.query("UPDATE elp210_c2_preparation.b2_attempts SET state='PREPARED' WHERE cycle_sha256=$1", [plan().cycle_sha256])).rejects.toThrow();
    await expect(pool.query("UPDATE elp210_c2_preparation.b2_attempts SET payload_sha256=$2 WHERE cycle_sha256=$1", [plan().cycle_sha256,d("0")])).rejects.toThrow();
    await expect(pool.query("DELETE FROM elp210_c2_preparation.b2_attempts WHERE cycle_sha256=$1", [plan().cycle_sha256])).rejects.toThrow();
    await expect(pool.query("TRUNCATE elp210_c2_preparation.b2_attempts")).rejects.toThrow();
  });
  it("allows alternate unsigned plans but only one signing attempt per B1 across different signer and cycle", async () => {
    const first: C2B2Plan = {cycle_sha256:d("6"),b1_sha256:d("7"),payload_sha256:d("8"),
      signer_spki_sha256:d("9"),signer_owner_ref_sha256:d("a")};
    const second: C2B2Plan = {...first,cycle_sha256:d("0"),signer_spki_sha256:d("1"),signer_owner_ref_sha256:d("2")};
    const custody = new C2B2PreparationCustody(pool, testOnlyVerifier);
    await custody.prepare(first);
    await custody.prepare(second);
    const attempts = await Promise.allSettled([custody.reserve(first,"TEST_RELEASE"),custody.reserve(second,"TEST_RELEASE")]);
    expect(attempts.filter(a=>a.status==="fulfilled")).toHaveLength(1);
    const retained = await pool.query(`SELECT cycle_sha256 FROM elp210_c2_preparation.b2_attempts
      WHERE b1_sha256=$1 AND state IN ('RESERVED','UNKNOWN','COMPLETED')`,[first.b1_sha256]);
    expect(retained.rowCount).toBe(1);
    const blocked=retained.rows[0].cycle_sha256===first.cycle_sha256?second:first;
    await expect(custody.reserve(blocked,"TEST_RELEASE")).rejects.toThrow("C2_B2_B1_ALREADY_ATTEMPTED");
    expect((await custody.inspect(blocked)).state).toBe("PREPARED_NOT_AUTHORIZED");
  });
});
