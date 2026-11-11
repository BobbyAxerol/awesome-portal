import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { C2B2PreparationCustody, type C2B2AuthorityVerifier, type C2B2Plan } from "../src/execution-v2/c2-b2-custody";

// Test-only transaction simulator. It does not exercise PostgreSQL locks,
// schema, triggers, crash durability, independent authority or a real signer.
type Row = C2B2Plan & { binding_sha256: string; state: string; attempt_id: string | null;
  acceptance_sha256: string | null; seal_sha256: string | null; receipt_sha256: string | null };
class FakeDatabase {
  row: Row | null = null;
  nextUpdateMissing = false;
  onNextConnect?: () => void;
  readonly options = { connectionTimeoutMillis: 5000, query_timeout: 10000 };
  private tail: Promise<void> = Promise.resolve();
  async connect() {
    const callback = this.onNextConnect;
    this.onNextConnect = undefined;
    callback?.();
    let releaseLock: (() => void) | undefined;
    return { release: () => {}, query: async (sql: string, values: unknown[] = []) => {
      if (sql === "BEGIN") {
        const previous = this.tail;
        this.tail = new Promise<void>(resolve => { releaseLock = resolve; });
        await previous; return { rows: [], rowCount: null };
      }
      if (sql === "COMMIT" || sql === "ROLLBACK") { releaseLock?.(); return { rows: [], rowCount: null }; }
      if (sql.startsWith("SET LOCAL ")) return { rows: [], rowCount: null };
      if (sql.startsWith("INSERT")) {
        const inserted = !this.row;
        if (inserted) this.row = { cycle_sha256: values[0] as string, binding_sha256: values[1] as string,
          b1_sha256: values[2] as string, payload_sha256: values[3] as string, signer_spki_sha256: values[4] as string,
          signer_owner_ref_sha256: values[5] as string, state: "PREPARED", attempt_id: null,
          acceptance_sha256: null, seal_sha256: null, receipt_sha256: null };
        return { rows: [], rowCount: inserted ? 1 : 0 };
      }
      if (sql.startsWith("SELECT")) {
        const rows = this.row?.cycle_sha256 === values[0] ? [{ ...this.row }] : [];
        return { rows, rowCount: rows.length };
      }
      if (sql.startsWith("UPDATE") && this.nextUpdateMissing) {
        this.nextUpdateMissing = false; return { rows: [], rowCount: 0 };
      }
      if (sql.includes("SET state='RESERVED'") && this.row) {
        this.row.state = "RESERVED"; this.row.attempt_id = values[1] as string;
        this.row.acceptance_sha256 = values[2] as string; this.row.seal_sha256 = values[3] as string; return { rows: [], rowCount: 1 };
      }
      if (sql.includes("SET state='UNKNOWN'") && this.row) { this.row.state = "UNKNOWN"; return { rows: [], rowCount: 1 }; }
      if (sql.includes("SET state='COMPLETED'") && this.row) {
        this.row.state = "COMPLETED"; this.row.receipt_sha256 = values[1] as string; return { rows: [], rowCount: 1 };
      }
      throw new Error("TEST_SQL_UNEXPECTED");
    } };
  }
  pool() { return this as unknown as Pool; }
}
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
    if (proof !== "TEST_RECEIPT" && proof !== "TEST_CONFLICT") throw new Error("TEST_RECEIPT_REJECTED");
    return operation({ binding_sha256: binding(p), attempt_id: attemptId, receipt_sha256: proof === "TEST_RECEIPT" ? d("2") : d("3") });
  },
};

describe("C2 B2 private unmounted custody state machine", () => {
  it("requires bounded connection/query timeouts before any work", () => {
    expect(() => new C2B2PreparationCustody({ options: {} } as unknown as Pool)).toThrow("C2_B2_POOL_TIMEOUTS_REQUIRED");
    expect(() => new C2B2PreparationCustody({ options: { connectionTimeoutMillis: 5000, query_timeout: 0 } } as unknown as Pool))
      .toThrow("C2_B2_POOL_TIMEOUTS_REQUIRED");
  });
  it("ignores caller booleans when the authority verifier is not installed", async () => {
    const db = new FakeDatabase(), custody = new C2B2PreparationCustody(db.pool()), p = plan();
    expect(await custody.prepare(p)).toEqual({ state: "PREPARED_NOT_AUTHORIZED" });
    await expect(custody.reserve(p, { sealed: true, accepted: true })).rejects.toThrow("C2_B2_AUTHORITY_VERIFIER_NOT_INSTALLED");
    await expect(custody.complete(p, randomUUID(), { verified: true })).rejects.toThrow("C2_B2_RECEIPT_VERIFIER_NOT_INSTALLED");
  });
  it("pins the pool and trusted verifier methods against instance shadowing and later replacement", async () => {
    const original = new FakeDatabase(), other = new FakeDatabase(), p = plan();
    const disabled = new C2B2PreparationCustody(original.pool());
    Object.assign(disabled, { pool: other.pool(), verifier: testOnlyVerifier,
      transaction: async () => ({ state: "RESERVED_NOT_AUTHORIZED", attempt_id: randomUUID() }) });
    await disabled.prepare(p);
    expect(original.row?.state).toBe("PREPARED");
    expect(other.row).toBeNull();
    await expect(disabled.reserve(p, "TEST_RELEASE")).rejects.toThrow("C2_B2_AUTHORITY_VERIFIER_NOT_INSTALLED");

    const db = new FakeDatabase();
    const verifier: C2B2AuthorityVerifier = { ...testOnlyVerifier };
    const custody = new C2B2PreparationCustody(db.pool(), verifier);
    verifier.withVerifiedRelease = async () => { throw new Error("TEST_REPLACED_RELEASE"); };
    verifier.withVerifiedOriginalReceipt = async () => { throw new Error("TEST_REPLACED_RECEIPT"); };
    Object.assign(custody, { verifier: {}, pool: other.pool(), locked: async () => ({}) });
    await custody.prepare(p);
    const reserved = await custody.reserve(p, "TEST_RELEASE");
    expect(await custody.complete(p, reserved.attempt_id, "TEST_RECEIPT")).toEqual({ state: "COMPLETED_NOT_DELIVERED" });
    expect(db.row?.state).toBe("COMPLETED");
    expect(other.row).toBeNull();
  });
  it("allows only one reserve in concurrent test-only verified attempts", async () => {
    const db = new FakeDatabase(), custody = new C2B2PreparationCustody(db.pool(), testOnlyVerifier), p = plan();
    await custody.prepare(p);
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => custody.reserve(p, "TEST_RELEASE")));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(9);
    expect((await custody.inspect(p)).state).toBe("MAY_HAVE_SIGNED_DO_NOT_RETRY");
  });
  it("lost response and a new custody instance never permit a second attempt", async () => {
    const db = new FakeDatabase(), first = new C2B2PreparationCustody(db.pool(), testOnlyVerifier), p = plan();
    await first.prepare(p); const original = await first.reserve(p, "TEST_RELEASE");
    const restarted = new C2B2PreparationCustody(db.pool(), testOnlyVerifier);
    expect(await restarted.inspect(p)).toEqual({ state: "MAY_HAVE_SIGNED_DO_NOT_RETRY", attempt_id: original.attempt_id });
    await expect(restarted.reserve(p, "TEST_RELEASE")).rejects.toThrow("C2_B2_ALREADY_RESERVED_OR_TERMINAL");
    await expect(restarted.markUnknown(p, randomUUID())).rejects.toThrow("C2_B2_ATTEMPT_MISMATCH");
    expect(await restarted.markUnknown(p, original.attempt_id)).toEqual({ state: "UNKNOWN_DO_NOT_RETRY" });
    await expect(restarted.reserve(p, "TEST_RELEASE")).rejects.toThrow("C2_B2_ALREADY_RESERVED_OR_TERMINAL");
  });
  it("binds the original signer key, owner, B1, payload and cycle", async () => {
    const db = new FakeDatabase(), custody = new C2B2PreparationCustody(db.pool(), testOnlyVerifier), p = plan();
    await custody.prepare(p);
    for (const field of ["b1_sha256", "payload_sha256", "signer_spki_sha256", "signer_owner_ref_sha256"] as const)
      await expect(custody.reserve({ ...p, [field]: d("0") }, "TEST_RELEASE")).rejects.toThrow("C2_B2_PLAN_BINDING_MISMATCH");
    await expect(custody.reserve(p, { sealed: true })).rejects.toThrow("TEST_RELEASE_REJECTED");
  });
  it("rejects an internally mismatched verifier binding without reserving", async () => {
    const db = new FakeDatabase(), p = plan();
    const verifier: C2B2AuthorityVerifier = { ...testOnlyVerifier,
      async withVerifiedRelease(_proof, _plan, operation) {
        return operation({ binding_sha256: d("0"), acceptance_sha256: d("f"), seal_sha256: d("1") });
      } };
    const custody = new C2B2PreparationCustody(db.pool(), verifier);
    await custody.prepare(p);
    await expect(custody.reserve(p, "TEST_RELEASE")).rejects.toThrow("C2_B2_AUTHORITY_PROOF_INVALID");
    expect(await custody.inspect(p)).toEqual({ state: "PREPARED_NOT_AUTHORIZED", attempt_id: null });
  });
  it("rejects a corrupted locked row or zero-row transition", async () => {
    const db = new FakeDatabase(), custody = new C2B2PreparationCustody(db.pool(), testOnlyVerifier), p = plan();
    await custody.prepare(p);
    db.nextUpdateMissing = true;
    await expect(custody.reserve(p, "TEST_RELEASE")).rejects.toThrow("C2_B2_UNEXPECTED_ROW_COUNT");
    if (!db.row) throw new Error("TEST_ROW_MISSING");
    db.row.attempt_id = randomUUID();
    await expect(custody.inspect(p)).rejects.toThrow("C2_B2_PLAN_BINDING_MISMATCH");
  });
  it("permits only the same test-verified original receipt; conflicts remain fenced", async () => {
    const db = new FakeDatabase(), custody = new C2B2PreparationCustody(db.pool(), testOnlyVerifier), p = plan();
    await custody.prepare(p); const original = await custody.reserve(p, "TEST_RELEASE");
    await custody.markUnknown(p, original.attempt_id);
    await expect(custody.complete(p, original.attempt_id, { verified: true })).rejects.toThrow("TEST_RECEIPT_REJECTED");
    expect(await custody.complete(p, original.attempt_id, "TEST_RECEIPT")).toEqual({ state: "COMPLETED_NOT_DELIVERED" });
    expect(await custody.complete(p, original.attempt_id, "TEST_RECEIPT")).toEqual({ state: "COMPLETED_NOT_DELIVERED" });
    await expect(custody.complete(p, original.attempt_id, "TEST_CONFLICT")).rejects.toThrow("C2_B2_RECEIPT_CONFLICT");
    await expect(custody.reserve(p, "TEST_RELEASE")).rejects.toThrow("C2_B2_ALREADY_RESERVED_OR_TERMINAL");
  });
  it("pins verified release and receipt facts before waiting for the database", async () => {
    const db = new FakeDatabase(), p = plan();
    const release = { binding_sha256: binding(p), acceptance_sha256: d("f"), seal_sha256: d("1") };
    let receipt: { binding_sha256: string; attempt_id: string; receipt_sha256: string };
    const verifier: C2B2AuthorityVerifier = {
      async withVerifiedRelease(_proof, _plan, operation) {
        db.onNextConnect = () => { release.acceptance_sha256 = d("0"); release.seal_sha256 = d("0"); };
        return operation(release);
      },
      async withVerifiedOriginalReceipt(_proof, _plan, attemptId, operation) {
        receipt = { binding_sha256: binding(p), attempt_id: attemptId, receipt_sha256: d("2") };
        db.onNextConnect = () => { receipt.receipt_sha256 = d("0"); };
        return operation(receipt);
      },
    };
    const custody = new C2B2PreparationCustody(db.pool(), verifier);
    await custody.prepare(p);
    const reserved = await custody.reserve(p, "TEST_RELEASE");
    expect(db.row?.acceptance_sha256).toBe(d("f"));
    expect(db.row?.seal_sha256).toBe(d("1"));
    await custody.complete(p, reserved.attempt_id, "TEST_RECEIPT");
    expect(db.row?.receipt_sha256).toBe(d("2"));
  });
});
