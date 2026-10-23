// @vitest-environment node
/**
 * WP-F2 (FIXTURE_LAB): the Blotter fixture never totals from a partial fill population. The legacy double returns at most 100 fills
 * beside up to 200 orders; a page that hit that cap states no filled quantity, average price or fee for the orders whose fills may
 * be missing (typed absence), and never a false "0". Checked deep in a 1500-order book and on the FILLED + ETHUSDT filter, against
 * the totals of the same orders read in pages small enough never to be capped.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { answerExecutionBff, type BffDoubleOptions } from "../../../../../e2e/bffDouble";
import { fixtureScale, setFixtureScale } from "../../../../../e2e/bffScale";
import { setSimulatedMixedFeeCurrencies } from "../../../../../e2e/bffSimulated";

const ON: BffDoubleOptions = { operationsV2: true, screensV2: true, simulated: true };
type Obj = Record<string, unknown>;
const read = (query: Record<string, string>): { orders: Obj[]; fills: Obj[]; next: string | null } => {
  const body = answerExecutionBff("GET", "/api/v1/execution/screens/blotter", new URLSearchParams(query), ON).body as { data: { orders: Obj[]; fills: Obj[]; page: { next_cursor: string | null } } };
  return { orders: body.data.orders, fills: body.data.fills, next: body.data.page.next_cursor };
};

const before = fixtureScale();
beforeAll(() => setFixtureScale("large"));
afterAll(() => { setFixtureScale(before); setSimulatedMixedFeeCurrencies(false); });

/** Ground truth: every order of the book read in pages of 25 (at most 75 fills, so never capped). */
function truth(extra: Record<string, string> = {}): Map<string, Obj> {
  const out = new Map<string, Obj>();
  let after: string | null = null;
  for (let guard = 0; guard < 80; guard += 1) {
    const page = read({ limit: "25", ...extra, ...(after ? { after } : {}) });
    for (const order of page.orders) out.set(String(order.order_id), order);
    after = page.next;
    if (after === null) break;
  }
  return out;
}

const KEYS = ["filled_quantity", "average_fill_price", "fee", "fee_currency"] as const;

function check(pages: { orders: Obj[] }[], book: Map<string, Obj>): { stated: number; absent: number } {
  let stated = 0;
  let absent = 0;
  for (const page of pages) {
    for (const order of page.orders) {
      const traded = order.status === "FILLED" || order.status === "PARTIALLY_FILLED";
      if (traded) expect(order.filled_quantity, `${order.order_id} is traded: never a false zero`).not.toBe("0");
      const real = book.get(String(order.order_id))!;
      for (const key of KEYS) {
        if (key in order) {
          stated += 1;
          expect(order[key], `${order.order_id}.${key} equals the uncapped read`).toBe(real[key]);
        } else if (traded) absent += 1;
      }
    }
  }
  return { stated, absent };
}

describe("fills cap", () => {
  it("pages of 200 orders deep in a 1500-order book (past 1300) agree with the uncapped totals; a capped page degrades to a typed absence", () => {
    const book = truth();
    expect(book.size).toBe(1500);
    const pages: { orders: Obj[] }[] = [];
    let after: string | null = null;
    for (let guard = 0; guard < 12; guard += 1) {
      const page = read({ limit: "200", ...(after ? { after } : {}) });
      pages.push(page);
      after = page.next;
      if (after === null) break;
    }
    expect(pages.flatMap((p) => p.orders).length).toBe(1500);
    const deep = pages.slice(-2);
    expect(deep.flatMap((p) => p.orders).some((o) => String(o.order_id) === "ord_00100" || Number(String(o.order_id).slice(4)) <= 200)).toBe(true);
    const all = check(pages, book);
    expect(all.stated).toBeGreaterThan(0);
    expect(all.absent).toBeGreaterThan(0); // the cap is hit on 200-order pages: some traded orders are typed absent, not zero
  });

  it("the FILLED + ETHUSDT filter agrees with the uncapped totals", () => {
    const filter = { status_bucket: "FILLED", symbol: "ETHUSDT" };
    const book = truth(filter);
    expect(book.size).toBeGreaterThan(100);
    const pages: { orders: Obj[] }[] = [];
    let after: string | null = null;
    for (let guard = 0; guard < 12; guard += 1) {
      const page = read({ limit: "200", ...filter, ...(after ? { after } : {}) });
      pages.push(page);
      after = page.next;
      if (after === null) break;
    }
    check(pages, book);
    // Every FILLED order that states a fill states it exactly; none states zero.
    expect(pages.flatMap((p) => p.orders).every((o) => o.status === "FILLED")).toBe(true);
  });

  it("the default page of 50 is never capped: every traded order states all of its totals or a typed fee absence", () => {
    const page = read({ limit: "50" });
    expect(page.fills.length).toBeLessThan(100);
    for (const order of page.orders.filter((o) => o.status === "FILLED" || o.status === "PARTIALLY_FILLED")) {
      expect(order.filled_quantity).toBeDefined();
      expect(order.average_fill_price).toBeDefined();
    }
  });
});

describe("opt-in mixed fee currencies (FIXTURE_LAB variant, default off)", () => {
  it("off: one fee currency per order; on: an order whose fills settle in two currencies has no fee at all", () => {
    const feeless = (orders: Obj[], fills: Obj[]) => orders.filter((order) => {
      const mine = fills.filter((f) => f.client_order_id === order.client_order_id);
      return new Set(mine.map((f) => f.commission_currency)).size > 1;
    });
    const off = read({ limit: "50" });
    expect(feeless(off.orders, off.fills)).toHaveLength(0);
    setSimulatedMixedFeeCurrencies(true);
    try {
      const on = read({ limit: "50" });
      const mixed = feeless(on.orders, on.fills);
      expect(mixed.length).toBeGreaterThan(0);
      for (const order of mixed) {
        expect(order.fee, `${order.order_id} has no fee`).toBeUndefined();
        expect(order.fee_currency).toBeUndefined();
        expect(order.filled_quantity).not.toBe("0");
      }
    } finally {
      setSimulatedMixedFeeCurrencies(false);
    }
  });
});
