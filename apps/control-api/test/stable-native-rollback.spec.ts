/** TEST_ONLY. Focused withTransaction compatibility; no DB/authority/network. */
import type { Pool, PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { withTransaction } from "../src/db/pool";

function fixture(failures: Partial<Record<"BEGIN"|"COMMIT"|"ROLLBACK",unknown>> = {}) {
  const query = vi.fn(async (text: string) => {
    if (Object.prototype.hasOwnProperty.call(failures,text)) throw failures[text as keyof typeof failures];
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const connect = vi.fn(async () => client), end = vi.fn();
  const pool = { connect, end } as unknown as Pool;
  return { pool, client, query, release, connect, end };
}
describe("TEST_ONLY stable native transaction rollback custody", () => {
  it("returns success after COMMIT and releases normally", async () => {
    const f=fixture(), result={value:"TEST_ONLY"}, fn=vi.fn(async () => result);
    expect(await withTransaction(f.pool,fn)).toBe(result);
    expect(fn).toHaveBeenCalledOnce(); expect(fn).toHaveBeenCalledWith(f.client);
    expect(f.query.mock.calls.map(c=>c[0])).toEqual(["BEGIN","COMMIT"]);
    expect(f.release).toHaveBeenCalledTimes(1); expect(f.release).toHaveBeenCalledWith(); expect(f.end).not.toHaveBeenCalled();
  });
  it("preserves the callback error after acknowledged ROLLBACK", async () => {
    const f=fixture(), original=new Error("TEST_ONLY_BODY_FAILURE");
    await expect(withTransaction(f.pool,async()=>{throw original;})).rejects.toBe(original);
    expect(f.query.mock.calls.map(c=>c[0])).toEqual(["BEGIN","ROLLBACK"]);
    expect(f.release).toHaveBeenCalledTimes(1); expect(f.release).toHaveBeenCalledWith(); expect(f.end).not.toHaveBeenCalled();
  });
  it("preserves the callback error and discards only its client after failed ROLLBACK ACK", async () => {
    const rollback=new Error("TEST_ONLY_ROLLBACK_ACK_LOST"), f=fixture({ROLLBACK:rollback});
    const original=new Error("TEST_ONLY_BODY_FAILURE"), fn=vi.fn(async()=>{throw original;});
    await expect(withTransaction(f.pool,fn)).rejects.toBe(original);
    expect(fn).toHaveBeenCalledOnce();
    expect(f.query.mock.calls.map(c=>c[0])).toEqual(["BEGIN","ROLLBACK"]);
    expect(f.release).toHaveBeenCalledTimes(1); expect(f.release).toHaveBeenCalledWith(true); expect(f.end).not.toHaveBeenCalled();
  });
  it("does not call the body when BEGIN fails and preserves that error if rollback also fails", async () => {
    const original=new Error("TEST_ONLY_BEGIN_ACK_LOST"), f=fixture({BEGIN:original,ROLLBACK:new Error("TEST_ONLY_ROLLBACK_FAILED")});
    const fn=vi.fn(async()=>1);
    await expect(withTransaction(f.pool,fn)).rejects.toBe(original);
    expect(fn).not.toHaveBeenCalled(); expect(f.release).toHaveBeenCalledTimes(1); expect(f.release).toHaveBeenCalledWith(true);
    expect(f.connect).toHaveBeenCalledOnce(); expect(f.end).not.toHaveBeenCalled();
  });
  it("preserves ambiguous COMMIT failure if rollback also fails, without retrying the body", async () => {
    const original=new Error("TEST_ONLY_COMMIT_ACK_LOST"), f=fixture({COMMIT:original,ROLLBACK:new Error("TEST_ONLY_ROLLBACK_FAILED")});
    const fn=vi.fn(async()=>7);
    await expect(withTransaction(f.pool,fn)).rejects.toBe(original);
    expect(fn).toHaveBeenCalledOnce();
    expect(f.query.mock.calls.map(c=>c[0])).toEqual(["BEGIN","COMMIT","ROLLBACK"]);
    expect(f.release).toHaveBeenCalledTimes(1); expect(f.release).toHaveBeenCalledWith(true); expect(f.end).not.toHaveBeenCalled();
  });
  it("keeps acknowledged-rollback release behavior after COMMIT failure without claiming rollback proves absence", async () => {
    const original=new Error("TEST_ONLY_COMMIT_ACK_LOST"), f=fixture({COMMIT:original});
    await expect(withTransaction(f.pool,async()=>8)).rejects.toBe(original);
    expect(f.query.mock.calls.map(c=>c[0])).toEqual(["BEGIN","COMMIT","ROLLBACK"]);
    expect(f.release).toHaveBeenCalledTimes(1); expect(f.release).toHaveBeenCalledWith(); expect(f.end).not.toHaveBeenCalled();
  });
  it("does not release or retry when pool.connect itself fails", async () => {
    const f=fixture(), original=new Error("TEST_ONLY_CONNECT_FAILED"), fn=vi.fn(async()=>0);
    f.connect.mockRejectedValueOnce(original);
    await expect(withTransaction(f.pool,fn)).rejects.toBe(original);
    expect(f.connect).toHaveBeenCalledOnce(); expect(fn).not.toHaveBeenCalled();
    expect(f.query).not.toHaveBeenCalled(); expect(f.release).not.toHaveBeenCalled();
    expect(f.end).not.toHaveBeenCalled();
  });
  it("preserves a primitive original failure instead of replacing it with rollback failure", async () => {
    const f=fixture({ROLLBACK:new Error("TEST_ONLY_ROLLBACK_FAILED")});
    await expect(withTransaction(f.pool,async()=>{throw "TEST_ONLY_PRIMITIVE";})).rejects.toBe("TEST_ONLY_PRIMITIVE");
    expect(f.release).toHaveBeenCalledTimes(1); expect(f.release).toHaveBeenCalledWith(true);
  });
  it("leaves a healthy later borrower usable instead of flushing or ending the pool", async () => {
    const bad=fixture({ROLLBACK:new Error("TEST_ONLY_ROLLBACK_FAILED")}), good=fixture();
    const pool={connect:vi.fn().mockResolvedValueOnce(bad.client).mockResolvedValueOnce(good.client),end:vi.fn()} as unknown as Pool;
    const original=new Error("TEST_ONLY_BODY_FAILURE");
    await expect(withTransaction(pool,async()=>{throw original;})).rejects.toBe(original);
    expect(await withTransaction(pool,async()=>42)).toBe(42);
    expect(bad.release).toHaveBeenCalledTimes(1); expect(bad.release).toHaveBeenCalledWith(true);
    expect(good.release).toHaveBeenCalledTimes(1); expect(good.release).toHaveBeenCalledWith();
    expect(pool.connect).toHaveBeenCalledTimes(2); expect(pool.end).not.toHaveBeenCalled();
  });
});
