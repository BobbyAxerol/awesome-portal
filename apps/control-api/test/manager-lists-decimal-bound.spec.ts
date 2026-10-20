import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "@nestjs/common";
import type { Pool } from "pg";
import type { ExecutionProductReadSource } from "../src/execution/product-read-source";
import type {
  ManagerListsRepository, PortfolioProjectionRecord, ProjectionSnapshot,
} from "../src/manager-lists/manager-lists.repository";
import { ManagerListsService, type ManagerListPrincipal } from "../src/manager-lists/manager-lists.service";
import { testConfig } from "./harness";

// Exercise the public producer and real source/lineage/aggregation code. The
// repository double replaces persistence only; no database or private helper is
// needed to establish the exact decimal boundary.
function producer(amounts: readonly (string | null | undefined)[]) {
  let snapshot: ProjectionSnapshot | null = null;
  let rows: readonly PortfolioProjectionRecord[] = [];
  const repository = {
    pool: {} as Pool,
    snapshot: async () => snapshot,
    portfolioRows: async () => rows,
    replacePortfolios: vi.fn(async (input: Parameters<ManagerListsRepository["replacePortfolios"]>[0]) => {
      rows = input.rows;
      snapshot = {
        sourceAsOf: input.sourceAsOf, sourceCompleteness: input.completeness,
        rowCount: rows.length, refreshedAt: new Date(), summary: input.summary,
      };
    }),
  };
  const source = {
    relation: async (_principal: unknown, environment: string, _screen: string, _source: string, relation: string) => {
      const records = relation === "portfolios"
        ? [{ portfolio_id: "pf_decimal", name: "Decimal boundary", base_currency: "USDT", state: "ACTIVE" }]
        : amounts.map((value, index) => ({
          allocation_id: `alloc_${index}`, portfolio_id: "pf_decimal", currency: "USDT",
          ...(value === undefined ? {} : { allocated_capital: value }),
        }));
      const profileId = `${environment.toUpperCase()}_BINANCE_USDM`;
      return {
        schema_version: "portal.execution.current-source-bff.v2", source_environment: environment, profile_id: profileId,
        source: {
          authority: "EXECUTION_CELL", profile_id: profileId, availability: "AVAILABLE",
          freshness: "FRESH", completeness: "COMPLETE", as_of: "2026-10-19T12:00:00Z",
          data: {
            relation: { schema: "public", relation }, next_cursor: null,
            items: records.map((record, index) => ({
              relation: { schema: "public", relation }, record_key: `source_${index}`,
              fields: Object.fromEntries(Object.entries(record).map(([key, value]) => [
                key, { kind: value === null ? "NULL" : "TEXT", value },
              ])),
            })),
          },
        },
      };
    },
  };
  const service = new ManagerListsService(
    repository as unknown as ManagerListsRepository,
    source as unknown as ExecutionProductReadSource,
    testConfig(),
  );
  const principal: ManagerListPrincipal = {
    workspaceId: "ws_decimal",
    user: {
      userId: "usr_decimal", username: "decimal", displayName: "Decimal", role: "ADMIN", status: "ACTIVE",
      mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
      createdAt: new Date(0), updatedAt: new Date(0), disabledAt: null,
    },
    session: {
      sessionId: "ses_decimal", userId: "usr_decimal", state: "ACTIVE", sessionVersion: 1,
      authenticationTime: new Date(), idleExpiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 60_000),
    },
  };
  return {
    read: () => service.portfolios(principal, { environment: "paper" }),
    replace: repository.replacePortfolios,
  };
}

describe("FE-049 public manager-list producer exact decimal bound", () => {
  beforeEach(() => { vi.spyOn(Logger.prototype, "warn").mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each([
    ["128 positive digits", "9".repeat(128), "9".repeat(128)],
    ["minus sign inside 128 characters", `-${"9".repeat(127)}`, `-${"9".repeat(127)}`],
    ["decimal point inside 128 characters", `0.${"1".repeat(126)}`, `0.${"1".repeat(126)}`],
    ["long leading and trailing zeroes", `${"0".repeat(256)}12.34${"0".repeat(256)}`, "12.34"],
    ["long normalized boundary", `${"0".repeat(256)}${"9".repeat(128)}.${"0".repeat(256)}`, "9".repeat(128)],
    ["negative zero remains canonical zero", `-${"0".repeat(256)}.${"0".repeat(256)}`, "0"],
  ])("publishes %s without losing precision", async (_name, input, expected) => {
    const { read, replace } = producer([input]);
    const response = await read();
    expect(response.items[0].allocated_by_currency).toEqual([{ currency: "USDT", value: expected }]);
    expect(replace).toHaveBeenCalledOnce();
  });

  it.each([
    ["129 positive digits", "9".repeat(129)],
    ["minus sign makes 129 characters", `-${"9".repeat(128)}`],
    ["decimal point makes 129 characters", `0.${"1".repeat(127)}`],
  ])("rejects %s before publishing a projection", async (_name, input) => {
    const { read, replace } = producer([input]);
    await expect(read()).rejects.toMatchObject({ code: "BR72_SOURCE_DECIMAL_INVALID", status: 502 });
    expect(replace).not.toHaveBeenCalled();
  });

  it("rejects a positive aggregate carry beyond 128 characters", async () => {
    const { read, replace } = producer(["9".repeat(128), "1"]);
    await expect(read()).rejects.toMatchObject({ code: "BR72_SOURCE_DECIMAL_INVALID", status: 502 });
    expect(replace).not.toHaveBeenCalled();
  });

  it("rejects a negative aggregate carry including its sign", async () => {
    const { read, replace } = producer([`-${"9".repeat(127)}`, "-1"]);
    await expect(read()).rejects.toMatchObject({ code: "BR72_SOURCE_DECIMAL_INVALID", status: 502 });
    expect(replace).not.toHaveBeenCalled();
  });

  it("sums exact boundary values without floating-point conversion", async () => {
    const response = await producer(["1".repeat(128), "-1"]).read();
    expect(response.items[0].allocated_by_currency).toEqual([
      { currency: "USDT", value: `${"1".repeat(127)}0` },
    ]);
  });

  it("preserves missing versus explicit-null source behavior", async () => {
    for (const amount of [undefined, null]) {
      const response = await producer([amount]).read();
      expect(response.items[0].allocated_by_currency).toEqual([{ currency: "USDT", value: "0" }]);
    }
    const empty = await producer([]).read();
    expect(empty.items[0].allocated_by_currency).toEqual([]);
  });
});
