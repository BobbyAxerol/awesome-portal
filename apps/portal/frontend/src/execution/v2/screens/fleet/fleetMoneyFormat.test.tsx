/**
 * Fleet-read money is printed by the same boundary formatter as the Manager dataset cells (grouping, the formatter's precision, the currency
 * after a space, a plus on a positive PnL), never as the raw source decimals; the model keeps the exact string and the title shows it.
 * Rows come from the published fixture through the real reader.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { readAlphaFleet, type AlphaFleetItem } from "../../../api/profileRead";
import { toFleetRow } from "./fleetModel";
import { FleetTable, moneyText } from "./FleetTable";

afterEach(cleanup);

const FIXTURE = resolve(__dirname, "../../../../../../../../packages/contracts/fixtures/execution-alpha-fleet-list.v2.valid.json");
const item = readAlphaFleet(JSON.parse(readFileSync(FIXTURE, "utf8")))!.page.rows[0]!;

function cells(patch: Partial<AlphaFleetItem>) {
  const { container } = render(<FleetTable rows={[toFleetRow({ ...item, ...patch })]} onOpen={() => undefined} />);
  const text = (label: string) => container.querySelector(`td[data-l="${label}"]`)?.textContent ?? "";
  const numbers = (label: string) => [...(container.querySelector(`td[data-l="${label}"]`)?.querySelectorAll(".exec-mgr-num") ?? [])];
  return { text, numbers };
}

describe("fleet-read money is formatted, never raw", () => {
  it("prints the fixture's allocation, net PnL and balance through the boundary formatter", () => {
    const c = cells({});
    // before: "20000 USDT", "123.19605 USDT", "20123.19605 USDT" (the source decimals, verbatim)
    expect(c.numbers("Allocation").map((n) => n.textContent)).toEqual(["20,000.00 USDT"]);
    expect(c.numbers("Net PnL").map((n) => n.textContent)).toEqual(["+123.1961 USDT"]);
    expect(c.numbers("Equity").map((n) => n.textContent)).toEqual(["20,123.1961 USDT"]);
    // the exact published string is still on the title, and the honest label is still there
    expect(c.numbers("Net PnL")[0]!.getAttribute("title")).toContain("123.19605 USDT");
    expect(c.numbers("Equity")[0]!.getAttribute("title")).toContain("20123.19605 USDT");
    expect(c.text("Net PnL")).toContain("Source-reported, not TS-qualified");
    for (const label of ["Allocation", "Net PnL", "Equity"]) expect(c.text(label)).not.toMatch(/\d\.\d{5,}/);
  });

  it("a negative figure keeps its sign and no plus; an eight-decimal source value is rounded for display only", () => {
    const c = cells({
      positionPnl: [{ currency: "USDT", realized: "-1234.56789012", unrealized: "0", net: "-1234.56789012" }],
      balances: [{ currency: "USDT", total: "0.12345678", free: "0.12345678", locked: "0" }],
    });
    expect(c.numbers("Net PnL").map((n) => n.textContent)).toEqual(["-1,234.5679 USDT"]);
    expect(c.numbers("Net PnL")[0]!.getAttribute("title")).toContain("-1234.56789012 USDT");
    expect(c.numbers("Equity").map((n) => n.textContent)).toEqual(["0.1235 USDT"]);
    expect(c.numbers("Equity")[0]!.getAttribute("title")).toContain("0.12345678 USDT");
    expect(moneyText("-0.00000001", "USDT", true)).not.toMatch(/^\+/);
  });

  it("two currencies are two lines; nothing is summed", () => {
    const c = cells({ allocations: [{ currency: "USDT", value: "1000.5" }, { currency: "EUR", value: "2.25" }] });
    expect(c.numbers("Allocation").map((n) => n.textContent)).toEqual(["1,000.50 USDT", "2.25 EUR"]);
  });

  it("a null or absent figure stays Not available, never a formatted 0", () => {
    const none = cells({ allocations: [], balances: [], positionPnl: [] });
    for (const label of ["Allocation", "Net PnL", "Equity"]) {
      expect(none.text(label), label).toMatch(/^Not available/);
      expect(none.numbers(label), label).toHaveLength(0);
    }
    const marked = cells({
      metricsAvailability: { ...item.metricsAvailability, current_position_pnl: { state: "UNAVAILABLE", reasonCode: "SOURCE_LATEST_WINDOW_NOT_PUBLISHED" } },
    });
    expect(marked.text("Net PnL")).toMatch(/^Not available/);
    expect(marked.numbers("Net PnL")).toHaveLength(0);
  });
});
