import { describe, expect, it, vi } from "vitest";
import { RetainedDataFlights } from "../src/execution/retained-data-flights";

describe("bounded in-flight retained DATA, not authority/result caching", () => {
  it("twenty identical scoped reads share one query; next read is fresh", async () => {
    let done!: (value: { rows: unknown[] }) => void;
    const query = vi.fn().mockImplementationOnce(() => new Promise(r => { done = r; }))
      .mockResolvedValue({ rows: [{ value: "2" }] });
    const pool = { query } as never, flights = new RetainedDataFlights();
    const reads = Array.from({ length: 20 }, () => flights.query(pool, "SELECT data", ["ws", "paper", "profile"]));
    expect(query).toHaveBeenCalledTimes(1); done({ rows: [{ value: "1" }] });
    expect((await Promise.all(reads)).every(r => r.rows[0].value === "1")).toBe(true);
    expect((await flights.query(pool, "SELECT data", ["ws", "paper", "profile"])).rows[0].value).toBe("2");
    expect(query).toHaveBeenCalledTimes(2);
  });
  it("scope/profile/range/currency are never conflated, errors are not retained", async () => {
    const query = vi.fn().mockRejectedValueOnce(new Error("OUTAGE")).mockResolvedValue({ rows: [] });
    const pool = { query } as never, flights = new RetainedDataFlights();
    await expect(flights.query(pool, "SELECT data", ["ws1"])).rejects.toThrow("OUTAGE");
    await Promise.all(["ws1", "ws2", "paper", "sandbox", "range1", "range2", "USDT", "VND"]
      .map(scope => flights.query(pool, "SELECT data", [scope])));
    expect(query).toHaveBeenCalledTimes(9);
  });
  it("bounds followers at64, cleans a rejected leader and permits recovery", async () => {
    let fail!: (e: Error) => void;
    const query = vi.fn().mockImplementationOnce(() => new Promise((_r, reject) => { fail = reject; }))
      .mockResolvedValue({ rows: [] });
    const pool = { query } as never, flights = new RetainedDataFlights();
    const pending = Array.from({ length: 64 }, () => flights.query(pool, "SELECT data", []));
    await expect(flights.query(pool, "SELECT data", [])).rejects.toMatchObject({ code: "EXECUTION_POOL_BUSY" });
    const settled = Promise.allSettled(pending); fail(new Error("OUTAGE"));
    expect((await settled).every(r => r.status === "rejected")).toBe(true);
    await flights.query(pool, "SELECT data", []); expect(query).toHaveBeenCalledTimes(2);
  });
  it("keeps at most16 keys, distinct excess uses the original bounded pool", async () => {
    const releases: (() => void)[] = [];
    const query = vi.fn().mockImplementation(() => new Promise(r => releases.push(() => r({ rows: [] }))));
    const pool = { query } as never, flights = new RetainedDataFlights();
    const pending = Array.from({ length: 17 }, (_, i) => flights.query(pool, "SELECT data", [i]));
    expect(query).toHaveBeenCalledTimes(17);
    const repeat = flights.query(pool, "SELECT data", [0]); expect(query).toHaveBeenCalledTimes(17);
    releases.forEach(r => r()); await Promise.all([...pending, repeat]);
  });
});
