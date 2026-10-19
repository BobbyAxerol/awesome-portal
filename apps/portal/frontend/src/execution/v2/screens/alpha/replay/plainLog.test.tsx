/**
 * The trade log in plain words (UXM-07 R-B2 / R-B3 / R-B4 / R-B7): the V1
 * replay panel, opened with `plain`, prints "Entry filled" and "Waiting for the
 * price" for the codes the source sends, keeps every raw code beside the word,
 * tags each cell with its label so the table can stack as cards, and puts the
 * provenance behind a disclosure. Off, the panel is the V1 panel.
 */
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TradeReplayEvents, buildLog, pairRoundTrips, readReplayFills, readReplayOrders } from "../../../../components/TradeReplayEvents";
import { ORDER_TYPE_WORD, orderTypeWord, plainRow, plainTime } from "../../../../components/tradeReplayWords";

vi.mock("../../../../components/ReplayCandleChart", async () => {
  const React = await import("react");
  return { ReplayCandleChart: React.forwardRef(() => React.createElement("div", { "data-testid": "chart" })) };
});
afterEach(cleanup);

const ACCT = "acct_binance_02";
const order = (o: Record<string, unknown>) => ({
  account_id: ACCT, symbol: "BTCUSDT", side: "SELL", order_type: "MARKET", status: "NEW", price: null, trigger_price: null, quantity: "0.5",
  reduce_only: false, post_only: false, time_in_force: "GTC", venue_order_id: "v1", error_code: null, submitted_at: "2026-10-16T20:01:30.000Z", updated_at: "2026-10-16T20:01:31.000Z", ...o,
});
const ORDERS = [
  order({ order_id: "ord_004", client_order_id: "brk-aa-en0", status: "FILLED", side: "BUY", venue_order_id: "vv" }),
  order({ order_id: "ord_005", client_order_id: "brk-aa-tp1", order_type: "TAKE_PROFIT_MARKET", status: "NEW", trigger_price: "68500.00", reduce_only: true }),
  order({ order_id: "ord_006", client_order_id: "brk-aa-st0", order_type: "STOP_MARKET", status: "CANCELED", trigger_price: "66100.00", reduce_only: true }),
  order({ order_id: "ord_007", client_order_id: "limit-1", order_type: "LIMIT", status: "PARTIALLY_FILLED", price: "67000.00", side: "BUY", venue_order_id: null }),
  order({ order_id: "ord_008", client_order_id: "rj-1", status: "RISK_REJECTED", error_code: "RISK_MAX_NOTIONAL", venue_order_id: null }),
];
const FILLS = [
  { fill_id: "fill_003", account_id: ACCT, instrument_id: "BTCUSDT.BINANCE", side: "BUY", price: "67193.00", quantity: "0.5", trade_time: "2026-10-16T20:01:30.500Z", client_order_id: "brk-aa-en0", realized_pnl: "0", commission: "1.20", commission_currency: "USDT", liquidity_side: "TAKER", trade_id: "t1" },
];
const orders = readReplayOrders(ORDERS);
const fills = readReplayFills(FILLS);
const log = buildLog(orders, fills, pairRoundTrips(fills, orders));
const byRef = (ref: string) => plainRow(log.find((r) => r.ref === ref)!);

describe("plainRow: the codes the source sends, in words, with the code kept", () => {
  it("words the entry fill, the armed leg, the cancelled leg, the partly filled limit and the reject", () => {
    expect(byRef("fill_003")).toMatchObject({ event: "Fill", leg: "Entry", type: "Market", result: "Entry filled", statusCode: null });
    expect(byRef("ord_005")).toMatchObject({ event: "Armed", leg: "Take profit", type: "Take profit", result: "Waiting for the price", statusCode: "NEW", fee: "No fill yet" });
    expect(byRef("ord_006")).toMatchObject({ event: "Cancel", leg: "Stop loss", type: "Stop", result: "Cancelled", statusCode: "CANCELED", fee: "No fill" });
    expect(byRef("ord_007")).toMatchObject({ event: "Submit", type: "Limit", side: "Buy", result: "Partly filled", statusCode: "PARTIALLY_FILLED", fee: "On the fill rows" });
    expect(byRef("ord_008")).toMatchObject({ event: "Reject", result: "Rejected by the venue", detail: "RISK_MAX_NOTIONAL" });
  });

  it("keeps time in force and reduce-only beside the type, and never drops an unknown code", () => {
    expect(byRef("ord_005").flags).toBe("GTC · reduce only");
    expect(orderTypeWord("TAKE_PROFIT_MARKET")).toBe("Take profit");
    expect(orderTypeWord("SOMETHING_NEW")).toBe("Something new");
    expect(Object.keys(ORDER_TYPE_WORD)).toContain("STOP_MARKET");
    const odd = { ...log.find((r) => r.ref === "ord_004")!, status: "BRAND_NEW_STATE", event: "SUBMIT" as const };
    expect(plainRow(odd).result).toBe("Status: BRAND_NEW_STATE");
  });

  it("prints the time on one line with the date and a Z", () => {
    expect(plainTime(Date.parse("2026-10-16T20:01:30.500Z"))).toBe("16 Oct 20:01:30Z");
  });
});

describe("TradeReplayEvents with plain", () => {
  const panel = (plain: boolean) =>
    render(<TradeReplayEvents orders={orders} fills={fills} candles={{ state: "UNAVAILABLE", reason: null }} asOf={null} accounts={[ACCT]} plain={plain} />);

  it("prints nine labelled columns in words, the raw status as a chip and the raw type on a title", () => {
    const { container } = panel(true);
    const table = container.querySelector("table.exec-rp-table")!;
    expect([...table.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual(["Time (UTC)", "Event", "Order", "Leg", "Type · Side", "Qty", "Price / Trigger", "Fee", "Result"]);
    const armed = [...table.querySelectorAll("tbody tr")].find((tr) => tr.textContent?.includes("ord_005"))!;
    const cells = [...armed.querySelectorAll("td")];
    expect(cells.map((td) => td.getAttribute("data-l"))).toEqual(["Time (UTC)", "Event", "Order", "Leg", "Type · Side", "Qty", "Price / Trigger", "Fee", "Result"]);
    expect(cells[1].textContent).toBe("Armed");
    expect(cells[4].getAttribute("title")).toBe("TAKE_PROFIT_MARKET");
    expect(cells[4].textContent).toContain("GTC · reduce only");
    expect(cells[8].textContent).toContain("Waiting for the price");
    expect(cells[8].textContent).toContain("NEW");
    expect(cells[7].textContent).toBe("No fill yet");
    expect(cells[0].textContent).toBe("16 Oct 20:01:30Z");
  });

  it("puts the provenance behind 'How this is built' and leaves one legend row", () => {
    const { container } = panel(true);
    const how = container.querySelector("details[data-how]")!;
    expect(within(how as HTMLElement).getByText("How this is built")).toBeTruthy();
    expect(how.textContent).toContain("order_brackets not published");
    expect(how.textContent).toContain("charting:");
    expect(container.querySelector(".exec-rp-legend")?.textContent).not.toContain("order_brackets");
    expect(container.querySelector(".exec-rp-legend")?.textContent).toContain("long entry");
  });

  it("is the V1 panel when plain is off", () => {
    const { container } = panel(false);
    expect(container.querySelector("table[data-plain]")).toBeNull();
    expect(container.querySelector("details[data-how]")).toBeNull();
    expect(container.querySelector("table.exec-rp-table")!.textContent).toContain("STOP_MARKET GTC reduce_only");
    expect(container.querySelector(".exec-rp-foot")).not.toBeNull();
  });
});
