/**
 * M7 — aggregates_by_currency read from the canonical contract fixture, not a
 * hand-typed object. Three counts stay apart; decimals stay strings.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readAggregatesByCurrency } from "./blotterAggregates";
import { AGGREGATES_BY_CURRENCY_RAW } from "./blotter.fixtures";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(here, "../../../../../packages/contracts/fixtures/execution-projection-page.valid.json"), "utf8")) as unknown;
function find(o: unknown): unknown {
  if (Array.isArray(o)) for (const v of o) { const r = find(v); if (r) return r; }
  if (o && typeof o === "object") {
    const rec = o as Record<string, unknown>;
    if ("aggregates_by_currency" in rec) return rec.aggregates_by_currency;
    for (const v of Object.values(rec)) { const r = find(v); if (r) return r; }
  }
  return undefined;
}

describe("readAggregatesByCurrency", () => {
  it("reads the canonical projection-page fixture with the three counts kept apart and decimals verbatim", () => {
    const parsed = readAggregatesByCurrency(find(FIXTURE))!;
    expect(parsed).not.toBeNull();
    expect(parsed.length).toBeGreaterThan(0);
    const usdt = parsed.find((a) => a.currency === "USDT")!;
    expect(usdt.rowCount).toBe(45500);
    expect(usdt.quantityCount).toBe(45500);
    expect(usdt.notionalCount).toBe(45500);
    // 18 decimal places survive untouched — Number() would have destroyed them.
    expect(usdt.quantity).toBe("125000.250000000000000001");
    expect(usdt.notional).toBe("4875000.750000000000000001");
    expect(usdt.invalidNumericCount).toBe(0);
  });
  it("the blotter fixture is a verbatim copy of the contract fixture", () => {
    expect(JSON.parse(JSON.stringify(AGGREGATES_BY_CURRENCY_RAW))).toEqual(find(FIXTURE));
  });
  it("rejects a non-decimal string and keeps counts null rather than zero", () => {
    const parsed = readAggregatesByCurrency([{ currency: "VND", row_count: 3, quantity: "1,000", notional: "12.5" }])!;
    expect(parsed[0].quantity).toBeNull();
    expect(parsed[0].notional).toBe("12.5");
    expect(parsed[0].quantityCount).toBeNull();
    expect(parsed[0].invalidNumericCount).toBeNull();
    expect(readAggregatesByCurrency({})).toBeNull();
  });
});
