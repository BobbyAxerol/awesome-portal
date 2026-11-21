/** TEST_ONLY: no DB/authority/network. Original errors remain exact. See C7 receipt. */
import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { withTransaction } from "../src/db/pool";
function fixture(failures: Partial<Record<"BEGIN" | "COMMIT" | "ROLLBACK", unknown>> = {}) {
  const query = vi.fn(async (text: string) => { if (Object.hasOwn(failures, text)) throw failures[text as keyof typeof failures];
    return { rows: [], rowCount: 0 }; });
  const release = vi.fn(), client = { query, release } as unknown as PoolClient;
  const connect = vi.fn(async () => client), end = vi.fn(), pool = { connect, end } as unknown as Pool;
  return { pool, client, query, release, connect, end };
}
describe("TEST_ONLY transaction rollback custody", () => {
  it("returns committed result and releases normally", async () => {
    const f = fixture(), result = { value: "TEST_ONLY" }, fn = vi.fn(async () => result);
    expect(await withTransaction(f.pool, fn)).toBe(result); expect(fn).toHaveBeenCalledExactlyOnceWith(f.client);
    expect(f.query.mock.calls.map(c => c[0])).toEqual(["BEGIN", "COMMIT"]); expect(f.release).toHaveBeenCalledExactlyOnceWith(); expect(f.end).not.toHaveBeenCalled();
  });
  it("preserves callback error after acknowledged rollback", async () => {
    const f = fixture(), original = new Error("TEST_ONLY_BODY_FAILURE");
    await expect(withTransaction(f.pool, async () => { throw original; })).rejects.toBe(original);
    expect(f.query.mock.calls.map(c => c[0])).toEqual(["BEGIN", "ROLLBACK"]); expect(f.release).toHaveBeenCalledExactlyOnceWith();
  });
  it("preserves callback error and destroys only failed-rollback borrower", async () => {
    const f = fixture({ ROLLBACK: new Error("TEST_ONLY_ROLLBACK_ACK_LOST") }), original = new Error("TEST_ONLY_BODY_FAILURE"), fn = vi.fn(async () => { throw original; });
    await expect(withTransaction(f.pool, fn)).rejects.toBe(original); expect(fn).toHaveBeenCalledOnce();
    expect(f.query.mock.calls.map(c => c[0])).toEqual(["BEGIN", "ROLLBACK"]); expect(f.release).toHaveBeenCalledExactlyOnceWith(true); expect(f.end).not.toHaveBeenCalled();
  });
  it("does not enter body after failed BEGIN and preserves original on failed rollback", async () => {
    const original = new Error("TEST_ONLY_BEGIN_ACK_LOST"), f = fixture({ BEGIN: original, ROLLBACK: Error("TEST_ONLY_ROLLBACK") }), fn = vi.fn(async () => 1);
    await expect(withTransaction(f.pool, fn)).rejects.toBe(original); expect(fn).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("preserves COMMIT ACK ambiguity on failed rollback without retrying body or commit", async () => {
    const original = new Error("TEST_ONLY_COMMIT_ACK_LOST"), f = fixture({ COMMIT: original, ROLLBACK: Error("TEST_ONLY_ROLLBACK") }), fn = vi.fn(async () => 7);
    await expect(withTransaction(f.pool, fn)).rejects.toBe(original); expect(fn).toHaveBeenCalledOnce();
    expect(f.query.mock.calls.map(c => c[0])).toEqual(["BEGIN", "COMMIT", "ROLLBACK"]); expect(f.release).toHaveBeenCalledExactlyOnceWith(true); expect(f.end).not.toHaveBeenCalled();
  });
  it("does not interpret acknowledged rollback after COMMIT failure as proof of absence", async () => {
    const original = new Error("TEST_ONLY_COMMIT_ACK_LOST"), f = fixture({ COMMIT: original }), fn = vi.fn(async () => 8);
    await expect(withTransaction(f.pool, fn)).rejects.toBe(original); expect(fn).toHaveBeenCalledOnce();
    expect(f.query.mock.calls.map(c => c[0])).toEqual(["BEGIN", "COMMIT", "ROLLBACK"]); expect(f.release).toHaveBeenCalledExactlyOnceWith();
  });
  it("does not release/query/retry when connect itself fails", async () => {
    const f = fixture(), original = new Error("TEST_ONLY_CONNECT_FAILED"), fn = vi.fn(async () => 0); f.connect.mockRejectedValueOnce(original);
    await expect(withTransaction(f.pool, fn)).rejects.toBe(original); expect(f.connect).toHaveBeenCalledOnce(); expect(fn).not.toHaveBeenCalled();
    expect(f.query).not.toHaveBeenCalled(); expect(f.release).not.toHaveBeenCalled();
  });
  it("preserves primitive thrown value, not rollback exception", async () => {
    const f = fixture({ ROLLBACK: new Error("TEST_ONLY_ROLLBACK") });
    await expect(withTransaction(f.pool, async () => { throw "TEST_ONLY_PRIMITIVE"; })).rejects.toBe("TEST_ONLY_PRIMITIVE"); expect(f.release).toHaveBeenCalledExactlyOnceWith(true);
  });
  it("keeps healthy later borrower without ending/flushing pool", async () => {
    const bad = fixture({ ROLLBACK: Error("TEST_ONLY_ROLLBACK") }), good = fixture(), original = Error("TEST_ONLY_BODY_FAILURE");
    const pool = { connect: vi.fn().mockResolvedValueOnce(bad.client).mockResolvedValueOnce(good.client), end: vi.fn() } as unknown as Pool;
    await expect(withTransaction(pool, async () => { throw original; })).rejects.toBe(original); expect(await withTransaction(pool, async () => 42)).toBe(42);
    expect(bad.release).toHaveBeenCalledExactlyOnceWith(true); expect(good.release).toHaveBeenCalledExactlyOnceWith(); expect(pool.connect).toHaveBeenCalledTimes(2); expect(pool.end).not.toHaveBeenCalled();
  });
});
