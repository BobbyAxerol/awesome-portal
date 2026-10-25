/** Source-only byte/SQL admission tests; no PostgreSQL or throughput/SLO claim. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { assertHistorySelectionBytes, assertPaperResponseBytes, HistoryByteBudgetError,
  validateHistoryByteBudget, validatePaperHistoryBytePolicy } from "../src/execution/history-byte-budget";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";

describe("history byte budgets preserve the selected population", () => {
  it("uses exact bytes and bigint statistics, including zero and exact-boundary values", () => {
    expect(() => assertHistorySelectionBytes("100", "40", { maximumBytes: 100, maximumRowBytes: 40 })).not.toThrow();
    expect(() => assertHistorySelectionBytes("0", "0", { maximumBytes: 100, maximumRowBytes: 40 })).not.toThrow();
    expect(() => assertHistorySelectionBytes("101", "40", { maximumBytes: 100, maximumRowBytes: 40 }))
      .toThrow("N33_HISTORY_RESPONSE_TOO_LARGE");
    expect(() => assertHistorySelectionBytes("100", "41", { maximumBytes: 100, maximumRowBytes: 40 }))
      .toThrow("N33_HISTORY_ROW_TOO_LARGE");
    expect(() => assertHistorySelectionBytes("90071992547409930000", "1", { maximumBytes: 100, maximumRowBytes: 40 }))
      .toThrow("N33_HISTORY_RESPONSE_TOO_LARGE");
  });
  it("rejects malformed census/configuration instead of interpreting it as no data", () => {
    for (const value of [undefined, null, 0, "", "1e3", "-1", "1.0", "01"]) {
      expect(() => assertHistorySelectionBytes(value, "0", { maximumBytes: 100, maximumRowBytes: 40 }))
        .toThrow("HISTORY_BYTE_CENSUS_INVALID");
    }
    for (const budget of [{ maximumBytes: 0, maximumRowBytes: 1 }, { maximumBytes: 1, maximumRowBytes: 2 },
      { maximumBytes: Number.MAX_SAFE_INTEGER + 1, maximumRowBytes: 1 }, { maximumBytes: 10, maximumRowBytes: 0.5 }]) {
      expect(() => validateHistoryByteBudget(budget)).toThrow("HISTORY_BYTE_BUDGET_INVALID");
    }
    expect(() => validatePaperHistoryBytePolicy({ maximum_history_bytes: 10, maximum_row_bytes: 1,
      maximum_response_bytes: 9 })).toThrow("HISTORY_BYTE_BUDGET_INVALID");
  });
  it("checks the complete UTF8 JSON envelope, not JavaScript character count", () => {
    const body = { note: "ệ😀" }, bytes = Buffer.byteLength(JSON.stringify(body), "utf8");
    expect(bytes).toBeGreaterThan(JSON.stringify(body).length);
    expect(() => assertPaperResponseBytes(body, bytes)).not.toThrow();
    expect(() => assertPaperResponseBytes(body, bytes - 1)).toThrow(HistoryByteBudgetError);
  });
  it.each([false, true])("refuses %s dense history before fetching oversized fields and rolls back its same-cut read", async dense => {
    const sql: string[] = [];
    const client = { release: vi.fn(), query: vi.fn(async (statement: string) => {
      sql.push(statement);
      if (statement.includes("count(*)::text AS n")) return { rows: [{ n: dense ? "10" : "1", k: "1",
        t0: "2026-10-01T00:00:00Z", t1: "2026-10-02T00:00:00Z" }] };
      if (statement.includes("AS total_bytes")) return { rows: [{ total_bytes: "101", largest_row_bytes: "1" }] };
      return { rows: [] };
    }) };
    const pool = { connect: vi.fn(async () => client), query: vi.fn() };
    const repository = new ExecutionProfileProjectionRepository(pool as unknown as Pool);
    await expect(repository.timeSeriesHistoryDownsampled("TEST_ONLY-ws", "paper", "TEST_ONLY-profile",
      "manager.performance:account_equity_snapshots", { from: "2026-10-01T00:00:00Z",
        seriesField: "account_id", valueField: "equity", targetPoints: 2,
        byteBudget: { maximumBytes: 100, maximumRowBytes: 40 } }))
      .rejects.toThrow("N33_HISTORY_RESPONSE_TOO_LARGE");
    expect(sql[0]).toBe("BEGIN");
    expect(sql[1]).toBe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");
    expect(sql.at(-1)).toBe("ROLLBACK");
    expect(sql.filter(statement => statement.includes("AS total_bytes"))).toHaveLength(1);
    expect(sql.some(statement => statement.includes("ORDER BY ts ASC, row_id ASC"))).toBe(false);
    expect(sql.some(statement => /\bLIMIT\b/.test(statement))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
