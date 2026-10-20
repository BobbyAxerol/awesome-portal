/** S3-U4: the Paper workbench publishes Long/Short/Gross by side from the rows it already fetched. */
import { describe, expect, it } from "vitest";
import { PaperReadService } from "../src/paper-read/paper-read.service";
import { testConfig } from "./harness";

type Row = Record<string, string | number | boolean | null>;
const tagged = (value: string | number | boolean | null) => value === null ? { kind: "NULL", value }
  : typeof value === "boolean" ? { kind: "BOOLEAN", value } : typeof value === "number" ? { kind: "INTEGER", value }
  : /^\d{4}-\d{2}-\d{2}T/.test(value) ? { kind: "TIMESTAMP", value } : { kind: "TEXT", value };
const page = (relation: string, rows: Row[], completeness: "COMPLETE" | "PARTIAL" = "COMPLETE") => ({
  schema_version: "portal.execution.current-source-bff.v2", source_environment: "paper", profile_id: "PAPER_BINANCE_USDM",
  source: { contract_version: "x", authority: "EXECUTION_CELL", profile_id: "PAPER_BINANCE_USDM", availability: "AVAILABLE", freshness: "FRESH",
    completeness, as_of: "2026-10-20T00:00:00Z",
    data: { relation: { schema: "public", relation }, next_cursor: null, items: rows.map((fields, index) => ({
      relation: { schema: "public", relation }, record_key: `opaque-${index}`,
      fields: Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, tagged(value)])) })) } },
});
const DEPLOYMENT: Row = { deployment_id: "dep_1", strategy_id: "s1", account_id: "a1", mode: "paper", venue: "BINANCE", portfolio_id: "pf" };

function service(positions: Row[] | "fail", completeness: "COMPLETE" | "PARTIAL" = "COMPLETE") {
  const source = {
    relation: async (_p: unknown, _e: string, _s: string, _src: string, relation: string) => {
      if (relation === "positions_v2" && positions === "fail") throw new Error("source detail must not escape");
      return page(relation, relation === "strategy_deployments" ? [DEPLOYMENT] : relation === "positions_v2" ? positions as Row[] : [],
        relation === "positions_v2" ? completeness : "COMPLETE");
    },
    resolveDeploymentScope: async () => ({ state: "FOUND", reasonCode: null, deployment: DEPLOYMENT,
      scope: { deploymentId: "dep_1", strategyId: "s1", accountId: "a1", mode: "paper", venue: "BINANCE", portfolioId: "pf", externalAccountRef: null, tupleUnique: true } }),
  };
  return new PaperReadService(source as never, testConfig());
}
const principal = { user: { userId: "u", username: "u", role: "ADMIN" }, session: {}, workspaceId: "w" } as never;
const read = async (svc: PaperReadService, vnm = false) => (await svc.workbench(principal, "dep_1", vnm) as any).data;

describe("workbench positions_by_side", () => {
  it("derives per-instrument long/short/gross quantity and refuses notional", async () => {
    const data = await read(service([
      { position_id: "p1", instrument_id: "BTCUSDT", side: "LONG", quantity: "0.91", account_id: "a1", mode: "paper", venue: "BINANCE" },
      { position_id: "p2", instrument_id: "BTCUSDT", side: "SHORT", quantity: "0.52", account_id: "a1", mode: "paper", venue: "BINANCE", notional: "35053.05" },
    ]));
    expect(data.positions_by_side).toEqual({
      state: "AVAILABLE", reason_code: null, basis: "OPEN_POSITION_ROWS_QUANTITY_BY_SIDE_PER_INSTRUMENT",
      rows: [{ instrument_id: "BTCUSDT", long_quantity: "0.91", short_quantity: "0.52", gross_quantity: "1.43", position_count: 2 }],
      excluded: { flat_rows: 0, closed_rows: 0, unclassified_rows: 0, no_instrument_rows: 0 },
      notional: { state: "UNAVAILABLE", reason_code: "E5_POSITION_CURRENCY_AND_MARK_LINEAGE_UNQUALIFIED" },
    });
    // The source notional is a row fact and stays on the row; it is not summed into a side total.
    expect(JSON.stringify(data.positions_by_side)).not.toContain("35053");
    expect(data.positions[1].notional).toBe("35053.05");
  });

  it("a partial positions window is PARTIAL with the source reason, never a complete-looking total", async () => {
    const data = await read(service([{ position_id: "p1", instrument_id: "BTCUSDT", side: "LONG", quantity: "1", account_id: "a1", mode: "paper", venue: "BINANCE" }], "PARTIAL"));
    expect(data.positions_by_side).toMatchObject({ state: "PARTIAL", reason_code: "SOURCE_POSITIONS_PARTIAL" });
  });

  it("an unreadable positions relation is a typed unavailable on the block while the rest of the profile serves", async () => {
    const data = await read(service("fail"));
    expect(data.positions_by_side).toMatchObject({ state: "UNAVAILABLE", reason_code: "POSITIONS_NOT_PUBLISHED", rows: [] });
    expect(data.deployment).toMatchObject({ deployment_id: "dep_1" });
  });

  it("the VN market variant carries the same block", async () => {
    const data = await read(service([]), true);
    expect(data.positions_by_side).toMatchObject({ state: "EMPTY", reason_code: null, rows: [] });
  });
});
