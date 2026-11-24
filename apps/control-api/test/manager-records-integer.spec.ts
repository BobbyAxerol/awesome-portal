import { describe, expect, it } from "vitest";
import { managerIntegerOrder, managerPage } from "../src/paper-read/manager-records";

describe("Manager INTEGER scalars remain lossless and numerically orderable", () => {
  it("normalizes safe numbers and decimal strings without rounding", () => {
    expect(managerIntegerOrder(9)).toBe(9n);
    expect(managerIntegerOrder("10")).toBe(10n);
    expect(managerIntegerOrder("10000000000000000")).toBe(10000000000000000n);
    expect(managerIntegerOrder("-10")).toBe(-10n);
    expect(managerIntegerOrder("10")! > managerIntegerOrder("9")!).toBe(true);
    for (const invalid of [Number.MAX_SAFE_INTEGER + 1, "01", "1e2", "1.0", " 1", "1\n", "9".repeat(97), null])
      expect(managerIntegerOrder(invalid)).toBeNull();
  });

  it("preserves the original JSON INTEGER representation through the Manager reader", () => {
    const response = (value: unknown) => ({
      profile_id: "PAPER_BINANCE_USDM", source_environment: "paper", source: {
        profile_id: "PAPER_BINANCE_USDM", authority: "EXECUTION_CELL", availability: "AVAILABLE",
        freshness: "FRESH", completeness: "COMPLETE", data: {
          relation: { schema: "public", relation: "account_equity_snapshots" }, next_cursor: null,
          items: [{ relation: { schema: "public", relation: "account_equity_snapshots" }, fields: { id: { kind: "INTEGER", value } } }],
        },
      },
    });
    for (const id of [9, "10", "10000000000000000"])
      expect(managerPage(response(id), "account_equity_snapshots", ["id"]).items[0]?.id).toBe(id);
    expect(() => managerPage(response(Number.MAX_SAFE_INTEGER + 1), "account_equity_snapshots", ["id"])).toThrow();
  });
});
