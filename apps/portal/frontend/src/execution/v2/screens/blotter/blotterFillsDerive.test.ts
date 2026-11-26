// @vitest-environment node
/**
 * D2 (stable v1.5 acceptance): the Edge orders carry no avg_price / fee / filled columns, so the Blotter derives them from the
 * order's OWN fills when the fills read is complete, says "partial: n of m fills read" when it is not, and never prints a figure it
 * did not read (never 0 from null). The funnel counts the status the row states.
 */
import { describe, expect, it } from "vitest";

import { deriveFromFills, pageFunnel, readExact, withFillsBasis, type BlotterFill, type BlotterOrder, type FillsPopulation } from "./blotterModel";

const E = readExact;
const order = (over: Partial<BlotterOrder> = {}): BlotterOrder => ({
  orderId: "1", clientOrderId: "c1", venueOrderId: "v1", alphaId: null, accountId: null, deploymentId: null, deploymentName: null, mode: "paper",
  sessionId: null, venue: "OKX", symbol: "BTC", side: "BUY", orderType: "MARKET", timeInForce: null, quantity: E("3"), price: E(null),
  triggerPrice: E(null), filledQuantity: E(null), status: "FILLED", averageFillPrice: E(null), fee: E(null), feeCurrency: null,
  submittedAt: null, updatedAt: null, errorCode: null, errorMessage: null, riskGrantId: null, intent: null, ...over,
} as BlotterOrder);
const fill = (id: string, client: string, price: string, quantity: string, commission: string, ccy: string | null = "USDT"): BlotterFill => ({
  fillId: id, tradeId: null, clientOrderId: client, venueOrderId: null, symbol: null, side: null, price: E(price), quantity: E(quantity),
  commission: E(commission), commissionCurrency: ccy, liquiditySide: null, tradeTime: null,
});
const complete: FillsPopulation = { read: true, complete: true, returned: 3, total: 3 };

describe("deriveFromFills", () => {
  it("sums quantity and fee exactly and weights the price, with no display rounding", () => {
    const d = deriveFromFills([fill("a", "c1", "100.5", "1", "0.0501000000000000"), fill("b", "c1", "101.25", "2", "0.123456789012345678")]);
    expect(d.filled).toEqual({ kind: "value", text: "3" });
    expect(d.average).toEqual({ kind: "value", text: "101" });
    expect(d.fee).toEqual({ kind: "value", text: "0.173556789012345678" });
    expect(d.feeCurrency).toBe("USDT");
  });
  it("cuts a non-terminating average at 18 places", () => {
    const d = deriveFromFills([fill("a", "c1", "1", "1", "0"), fill("b", "c1", "2", "2", "0")]);
    expect(d.average).toEqual({ kind: "value", text: "1.666666666666666666" });
  });
  it("sums no fee across currencies", () => {
    const d = deriveFromFills([fill("a", "c1", "1", "1", "1", "USDT"), fill("b", "c1", "1", "1", "1", "BNB")]);
    expect(d.fee).toEqual({ kind: "absent" });
    expect(d.filled).toEqual({ kind: "value", text: "2" });
  });
});

describe("withFillsBasis", () => {
  const fills = [fill("a", "c1", "100", "1", "0.5"), fill("b", "c1", "110", "2", "0.25"), fill("c", "other", "1", "1", "1")];
  it("derives from this order's fills when the fills read is complete", () => {
    const o = withFillsBasis(order(), fills, complete);
    expect(o.filledQuantity).toEqual({ kind: "value", text: "3" });
    expect(o.fee).toEqual({ kind: "value", text: "0.75" });
    expect(o.fillsBasis).toMatchObject({ kind: "derived", fillCount: 2 });
  });
  it("derives nothing from a partial fills read and says n of m", () => {
    const o = withFillsBasis(order(), fills, { read: true, complete: false, returned: 100, total: 160 });
    expect(o.filledQuantity.kind).toBe("absent");
    expect(o.fee.kind).toBe("absent");
    expect(o.fillsBasis?.kind).toBe("partial");
    expect(o.fillsBasis?.note).toContain("100 of 160 fills read");
  });
  it("says so when the fills read is unavailable or holds no fill for the order", () => {
    expect(withFillsBasis(order(), fills, { read: false, complete: false, returned: 0, total: null }).fillsBasis?.kind).toBe("unread");
    const none = withFillsBasis(order({ clientOrderId: "zzz", venueOrderId: null }), fills, complete);
    expect(none.fillsBasis?.kind).toBe("none");
    expect(none.filledQuantity.kind).toBe("absent");
  });
  it("keeps the order row's own figures when it publishes any", () => {
    const own = order({ filledQuantity: E("3") });
    expect(withFillsBasis(own, fills, complete)).toBe(own);
  });
});

describe("pageFunnel", () => {
  it("counts FILLED rows as filled even where no quantity was derived", () => {
    const rows = [order(), order({ orderId: "2" }), order({ orderId: "3", status: "REJECTED" })];
    expect(pageFunnel(rows).find((s) => s.id === "filled")?.count).toBe(2);
  });
});
