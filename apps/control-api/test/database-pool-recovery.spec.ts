import { Logger } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPool } from "../src/db/pool";
afterEach(() => vi.restoreAllMocks());
describe("P23 DB outage process survival", () => {
  it("handles idle disconnect without leaking error/DSN and bounds warning bursts", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const pool = buildPool("postgres://test:never-log-this@127.0.0.1:1/p23-pool-recovery");
    try {
      expect(pool.options.max).toBe(10);
      expect(pool.options.connectionTimeoutMillis).toBe(5000);
      const lost = Object.assign(new Error("postgres://secret:password@private-host/db"), { code: "57P01" });
      expect(() => pool.emit("error", lost)).not.toThrow();
      for (let i = 0; i < 20; i++) pool.emit("error", lost);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('{"event":"DATABASE_IDLE_CONNECTION_LOST","code":"57P01"}');
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret|password|private-host|postgres:\/\//);
    } finally { await pool.end(); }
  });
});
