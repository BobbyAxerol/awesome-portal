/**
 * Trade Replay, L2 scale and L3 negative, through the real HTTP client, the
 * real subject-records reader, the real replay readers and the REAL V1 trade
 * log (only the candle chart, which needs a canvas, is stubbed).
 *
 * FIXTURE STATUS: the contracts behind this screen (alpha-resource.v1,
 * subject-records, observed-timeline, market-candles) have NO published
 * canonical fixture (the one in packages/contracts is TEST_ONLY_SYNTHETIC and
 * is not a product receipt). Every body here is therefore derived from the
 * hand-written double `e2e/bffDoubleAlpha.ts` (`answerAlpha`), cloned and
 * mutated. Passing here proves the screen against that double, not against the
 * Trading System; real-API acceptance is separate.
 *
 * The screen asks for 200 records per relation per page and keeps the server's
 * keyset cursor. The V1 log shows 200 events at a time. What these tests hold
 * the line on: counts are exact, nothing is dropped without being counted on
 * screen, a body that cannot be read is never shown as an empty or a whole log,
 * and a missing value is never printed as 0.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALPHA_DOUBLE_ID, answerAlpha } from "../../../../../../e2e/bffDoubleAlpha";
import { V2_ROLE_PRESETS } from "../../../shell/roleNav";
import { alphaHttpApi, serveAlphaDouble, sessionOf, type Override } from "../testApi";
import AlphaReplay from "./index";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../../auth/session", () => ({ useSession: () => session.current }));
vi.mock("../../../../components/ReplayCandleChart", async () => {
  const React = await import("react");
  return { ReplayCandleChart: React.forwardRef(() => React.createElement("div", { "data-testid": "chart" })) };
});

beforeEach(() => { session.current = sessionOf(V2_ROLE_PRESETS.manager); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

type Rec = Record<string, unknown>;
const T0 = Date.UTC(2026, 9, 16, 14, 0);
const iso = (ms: number) => new Date(ms).toISOString();

const fill = (i: number, over: Rec = {}): Rec => ({
  fill_id: `fill_${String(i).padStart(5, "0")}`, client_order_id: `co_${i}`, execution_session_id: "session_live_01", strategy_id: ALPHA_DOUBLE_ID,
  account_id: "acct_binance_02", instrument_id: "BTCUSDT.BINANCE", symbol: "BTCUSDT", side: "BUY", price: "67000.00", quantity: "0.10",
  trade_time: iso(T0 + i * 60_000), realized_pnl: "0", commission: "0.50", commission_currency: "USDT", liquidity_side: "MAKER", trade_id: `trd_${i}`, ...over,
});
const order = (i: number, over: Rec = {}): Rec => ({
  order_id: `ord_${String(i).padStart(5, "0")}`, client_order_id: `oc_${i}`, execution_session_id: "session_live_01", strategy_id: ALPHA_DOUBLE_ID,
  account_id: "acct_binance_02", instrument_id: "BTCUSDT.BINANCE", symbol: "BTCUSDT", side: "BUY", order_type: "LIMIT", status: "NEW", price: "66500.00",
  quantity: "0.10", submitted_at: iso(T0 + i * 60_000), updated_at: iso(T0 + i * 60_000 + 4_000), reduce_only: false, post_only: false, time_in_force: "GTC", ...over,
});
const fills = (n: number, over?: (i: number) => Rec): Rec[] => Array.from({ length: n }, (_, i) => fill(i, over?.(i)));

type Body = Rec & { page: Rec; coverage: Rec; records: unknown[] };
interface Served { fills?: Rec[]; orders?: Rec[]; fillsBody?: (body: Body) => void; ordersBody?: (body: Body) => void; ignoreLimit?: boolean }

/** Serves one relation as keyset pages (`after` = `k:<offset>`), the way the BFF does; the rest comes from the double. */
function relations(served: Served): Override {
  return (path, query) => {
    const relation = path.endsWith("/fills") ? "fills" : path.endsWith("/orders") ? "orders" : null;
    if (relation === null) return undefined;
    const rows = (relation === "fills" ? served.fills : served.orders) ?? [];
    const base = answerAlpha("GET", path, query)!;
    const body = structuredClone(base.body) as Body;
    const limit = served.ignoreLimit ? rows.length || 1 : Math.min(500, Math.max(1, Number(query.get("limit") ?? 200)));
    const after = query.get("after");
    const offset = after === null ? 0 : Number(after.replace("k:", ""));
    const slice = rows.slice(offset, offset + limit);
    const more = offset + limit < rows.length;
    const idKey = relation === "fills" ? "fill_id" : "order_id";
    body.records = slice.map((values, i) => ({ record_id: String(values[idKey] ?? `rec_${offset + i}`), values }));
    body.page = { limit, maximum_page_rows: 500, returned_count: slice.length, has_more: more, next_cursor: more ? `k:${offset + limit}` : null };
    body.coverage.retained_row_count = rows.length;
    (relation === "fills" ? served.fillsBody : served.ordersBody)?.(body);
    return { status: 200, body };
  };
}

function mount(served: Served, entry = "/replay") {
  const double = serveAlphaDouble(relations(served));
  const view = render(
    <MemoryRouter initialEntries={[entry]}>
      <AlphaReplay api={alphaHttpApi()} alphaId={ALPHA_DOUBLE_ID} />
    </MemoryRouter>,
  );
  return { ...double, view };
}

const logHead = () => document.querySelector<HTMLElement>("section[aria-label='Trade log'] .exec-rp-win");
const logRows = () => document.querySelectorAll("table.exec-rp-table tbody tr");
const logWords = () => (logHead()?.textContent ?? "").split(" · ")[0];
const shortfall = () => screen.queryByTestId("replay-shortfall");
async function ready() {
  await screen.findByRole("region", { name: "Trade log" }, { timeout: 15_000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
}
const press = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole("button", { name })); await new Promise((r) => setTimeout(r, 30)); }); };

/* ═════════════════════════ L2 · scale ═════════════════════════ */
describe("L2 · 199, 200, 201 and 500 events", () => {
  it("199 fills: one page, every event, no shortfall notice", async () => {
    const { callsTo } = mount({ fills: fills(199) });
    await ready();
    expect(logWords()).toBe("199 events");
    expect(logRows()).toHaveLength(199);
    expect(shortfall()).toBeNull();
    expect(new URL(callsTo("/fills")[0], "http://x").searchParams.get("limit")).toBe("200");
    expect(callsTo("/fills")).toHaveLength(1);
  });

  it("200 fills: exactly the cap, exactly one page, no shortfall notice (the cap is not a truncation)", async () => {
    mount({ fills: fills(200) });
    await ready();
    expect(logWords()).toBe("200 events");
    expect(logRows()).toHaveLength(200);
    expect(shortfall()).toBeNull();
    expect(screen.queryByText(/older events/)).toBeNull();
  });

  it("201 fills: the first page holds 200, the screen says the Portal holds more, and Load more brings the 201st", async () => {
    const { callsTo } = mount({ fills: fills(201) });
    await ready();
    expect(logWords()).toBe("200 events");
    expect(logRows()).toHaveLength(200);
    const note = shortfall()!;
    expect(note.textContent).toContain("200 fills loaded; the Portal holds more. The log and chart show only what is loaded.");
    await press("Load more fills");
    // The cursor is the server's own, passed back unchanged.
    expect(new URL(callsTo("/fills")[1], "http://x").searchParams.get("after")).toBe("k:200");
    expect(logHead()?.textContent).toContain("200 of 201 events shown · newest first");
    expect(shortfall()).toBeNull();
    await press("show 1 older events");
    expect(logWords()).toBe("201 events");
    expect(logRows()).toHaveLength(201);
  });

  it("500 fills: three keyset pages 200, 200, 100; the count is exact after each, and the notice goes only when the last page is in", async () => {
    mount({ fills: fills(500) });
    await ready();
    expect(shortfall()!.textContent).toContain("200 fills loaded");
    await press("Load more fills");
    expect(shortfall()!.textContent).toContain("400 fills loaded");
    expect(logHead()?.textContent).toContain("200 of 400 events shown · newest first");
    await press("Load more fills");
    expect(shortfall()).toBeNull();
    expect(logHead()?.textContent).toContain("200 of 500 events shown · newest first");
    expect(screen.getByText(/300 older not shown — the chart still draws every event/)).toBeTruthy();
    await press("show 200 older events");
    expect(logHead()?.textContent).toContain("400 of 500 events shown");
    await press("show 100 older events");
    expect(logWords()).toBe("500 events");
    expect(logRows()).toHaveLength(500);
  });

  it("orders and fills page independently: 250 orders and 120 fills offer one Load more, for orders", async () => {
    mount({ orders: Array.from({ length: 250 }, (_, i) => order(i)), fills: fills(120) });
    await ready();
    expect(screen.getByRole("button", { name: "Load more orders" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more fills" })).toBeNull();
    expect(shortfall()!.textContent).toContain("200 orders loaded");
    expect(shortfall()!.textContent).not.toContain("fills loaded");
  });

  it("10,000 events in one page: the log shows 200 and says 200 of 10000; the DOM stays under budget", async () => {
    const { view } = mount({ fills: fills(10_000), ignoreLimit: true });
    await ready();
    expect(logHead()?.textContent).toContain("200 of 10000 events shown · newest first");
    expect(logRows()).toHaveLength(200);
    expect(screen.getByText(/9800 older not shown — the chart still draws every event/)).toBeTruthy();
    expect(view.container.querySelectorAll("*").length).toBeLessThan(6_000);
  });

  it("a failed later page keeps what is shown, says which relation failed, and offers to try again", async () => {
    let calls = 0;
    const served = relations({ fills: fills(300) });
    const double = serveAlphaDouble((path, query) => (path.endsWith("/fills") && query.get("after") !== null && (calls += 1) === 1 ? { status: 503, body: { error: { code: "UPSTREAM_UNAVAILABLE", message: "page down" } } } : served(path, query)));
    void double;
    render(<MemoryRouter initialEntries={["/replay"]}><AlphaReplay api={alphaHttpApi()} alphaId={ALPHA_DOUBLE_ID} /></MemoryRouter>);
    await ready();
    await press("Load more fills");
    expect(shortfall()!.textContent).toContain("The next page of fills could not be read");
    expect(logRows()).toHaveLength(200);
    await press("Try again: fills");
    expect(logHead()?.textContent).toContain("200 of 300 events shown");
    expect(shortfall()).toBeNull();
  });
});

/* ═════════════════════════ L3 · negative ═════════════════════════ */
describe("L3 · records that cannot be read are counted, never dropped quietly", () => {
  const three = () => fills(3);

  it.each([
    ["a null price", (r: Rec[]) => { r[1].price = null; }],
    ["a price that is an object", (r: Rec[]) => { r[1].price = { value: "67000" }; }],
    ["no fill_id in the values", (r: Rec[]) => { delete r[1].fill_id; }],
    ["an empty fill_id", (r: Rec[]) => { r[1].fill_id = ""; }],
    ["a fill_id that repeats", (r: Rec[]) => { r[1].fill_id = r[0].fill_id; }],
    ["no trade_time and no updated_at", (r: Rec[]) => { delete r[1].trade_time; }],
  ])("%s: 2 of 3 fills are drawn and the screen says 1 of 3 fill records could not be read", async (_name, hurt) => {
    const rows = three();
    hurt(rows);
    mount({ fills: rows });
    await ready();
    expect(logWords()).toBe("2 events");
    expect(shortfall()!.textContent).toContain("1 of 3 fill records could not be read");
    expect(shortfall()!.textContent).toContain("left out of the log and chart");
  });

  it("a JSON number price is refused, not stringified: 2 of 3 fills are drawn and the screen says 1 could not be read (DEBT-UXM07-013)", async () => {
    // The contract publishes prices as exact decimal strings. A JS number has already lost digits, and String(0.1 + 0.2) would print
    // 0.30000000000000004 as if the source had said it. decimalText refuses it, so the fill is counted as unreadable.
    const rows = three();
    rows[1].price = 67000.5;
    mount({ fills: rows });
    await ready();
    expect(logWords()).toBe("2 events");
    expect(shortfall()!.textContent).toContain("1 of 3 fill records could not be read");
  });

  it("a null price is never printed as 0 and never becomes a row", async () => {
    const rows = three();
    rows[1].price = null;
    mount({ fills: rows });
    await ready();
    const prices = [...logRows()].map((tr) => tr.querySelector("td[data-l='Price / Trigger']")?.textContent ?? "");
    expect(prices).toHaveLength(2);
    for (const price of prices) expect(price).toMatch(/67,?000/);
    expect(prices.some((p) => /^0(\.0+)?$/.test(p.trim()))).toBe(false);
  });

  it("a fill with a time that does not parse is read but placed on neither the log nor the chart, and the screen says so", async () => {
    const rows = three();
    rows[2].trade_time = "last tuesday";
    mount({ fills: rows });
    await ready();
    expect(logWords()).toBe("2 events");
    expect(shortfall()!.textContent).toContain("1 record has no time that can be read, so it is on neither the log nor the chart.");
  });

  it("a null quantity is not printed as 0", async () => {
    const rows = three();
    rows[0].quantity = null;
    mount({ fills: rows });
    await ready();
    const qty = [...logRows()].map((tr) => (tr.querySelector("td[data-l='Qty']")?.textContent ?? "").trim());
    expect(qty).toHaveLength(3);
    expect(qty.filter((q) => /^0(\.0+)?$/.test(q))).toEqual([]);
  });

  it("a null price on an order is not printed as 0 either", async () => {
    mount({ orders: [order(1, { price: null }), order(2)], fills: [] });
    await ready();
    const prices = [...logRows()].map((tr) => (tr.querySelector("td[data-l='Price / Trigger']")?.textContent ?? "").trim());
    expect(prices).toHaveLength(2);
    expect(prices.filter((p) => /^0(\.0+)?$/.test(p))).toEqual([]);
  });

  it("records that are not objects (null, a number, text, an array) are counted from the page's own returned_count", async () => {
    mount({ orders: [order(1)], fills: three(), fillsBody: (body) => { body.records = [null, 5, "x", []]; body.page.returned_count = 4; } });
    await ready();
    // Orders from the double are still there, so the log is the orders; the fills relation is said to be unreadable.
    expect(shortfall()!.textContent).toContain("4 of 4 fill records could not be read");
  });

  it.each([["an object", { 0: {} }], ["a string", "rows"], ["null", null], ["a number", 7]])(
    "a records container that is %s is not an empty log: the page's returned_count of 3 is said to be unreadable",
    async (_name, container) => {
      mount({ orders: [order(1)], fills: three(), fillsBody: (body) => { body.records = container as never; body.page.returned_count = 3; } });
      await ready();
      expect(shortfall()!.textContent).toContain("3 of 3 fill records could not be read");
    },
  );

  it("with no order and no readable fill the book is Unavailable with the counts, not 'no order or fill is present'", async () => {
    mount({ orders: [], fills: three(), fillsBody: (body) => { body.records = "rows" as never; body.page.returned_count = 3; } });
    expect(await screen.findByText(/3 of 3 fill records could not be read/, undefined, { timeout: 15_000 })).toBeTruthy();
    expect(screen.queryByText(/No order or fill of this alpha is present/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Trade log" })).toBeNull();
  });

  it.each([["UNAVAILABLE"], ["SOMETHING_NEW"]])("a page state of %s with no rows is not an empty log", async (word) => {
    mount({ orders: [], fills: [], fillsBody: (body) => { body.state = word; } });
    expect(await screen.findByText(new RegExp(`reported the fill read as ${word.toLowerCase().replace(/_/g, " ")}`), undefined, { timeout: 15_000 })).toBeTruthy();
    expect(screen.queryByText(/No order or fill of this alpha is present/)).toBeNull();
  });

  it("a proven empty book (AUTHORITATIVE_EMPTY) is still the empty statement", async () => {
    mount({ orders: [], fills: [], fillsBody: (body) => { body.state = "AUTHORITATIVE_EMPTY"; }, ordersBody: (body) => { body.state = "AUTHORITATIVE_EMPTY"; } });
    expect(await screen.findByText(/No order or fill of this alpha is present/, undefined, { timeout: 15_000 })).toBeTruthy();
  });

  it("a body that is not JSON-shaped (HTML, an array) is a stated failure of that relation, and the other relation stays", async () => {
    const double = serveAlphaDouble((path, query) => (path.endsWith("/fills") ? { status: 200, body: "<html>502</html>" as never } : relations({ orders: [order(1), order(2)] })(path, query)));
    void double;
    render(<MemoryRouter initialEntries={["/replay"]}><AlphaReplay api={alphaHttpApi()} alphaId={ALPHA_DOUBLE_ID} /></MemoryRouter>);
    expect(await screen.findByText(/Fills could not be read/, undefined, { timeout: 15_000 })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Trade log" })).toBeTruthy();
  });
});

describe("L3 · hostile text stays text", () => {
  const BIDI = "BTC‮USDT‬";
  const hostileLabels = [BIDI, "<img src=x onerror=alert(1)>", "bell\u0007 nul\u0000 zero​width", " line sep"];

  it.each(hostileLabels.map((label) => [JSON.stringify(label), label]))("a symbol of %s is drawn as text, never as markup, and no event is lost", async (_name, label) => {
    const rows = fills(3, () => ({ symbol: label, instrument_id: `${label}.BINANCE` }));
    const { view } = mount({ fills: rows, orders: [] });
    await ready();
    expect(view.container.querySelector("img, script")).toBeNull();
    expect(logRows()).toHaveLength(3);
    expect(shortfall()).toBeNull();
    expect(logHead()?.textContent).toContain(label);
  });

  it("70,000 characters in a client order id and an error message do not break the log, and the header count stays exact", async () => {
    const big = "x".repeat(70_000);
    const { view } = mount({ orders: [order(1, { client_order_id: big, status: "REJECTED", error_code: "E", error_message: big }), order(2)], fills: fills(2) });
    await ready();
    expect(logWords()).toBe("4 events");
    expect(logRows()).toHaveLength(4);
    expect(view.container.textContent).toContain(big);
  });

  it("an unknown order status and side are named as received, not mapped to a known one", async () => {
    mount({ orders: [order(1, { status: "BRAND_NEW_STATE", side: "SIDEWAYS" })], fills: [] });
    await ready();
    const row = logRows()[0];
    expect(row.textContent).toContain("BRAND_NEW_STATE");
    expect(row.textContent).not.toMatch(/Entry filled|Filled|Cancelled/);
  });
});

/* ═════════════════════════ paging: deep link, unreadable first page, focus, PARTIAL, ceiling ═════════════════════════ */
describe("deep link into a page that is not loaded yet", () => {
  const banner = () => screen.getAllByRole("status").find((el) => !el.hasAttribute("aria-label") && /^(Order|Fill|Opened)/.test(el.textContent ?? ""))?.textContent ?? "";

  it("an order on page 2 is 'not among the 200 loaded orders; the Portal holds more', not 'not in the retained window'; Load more finds it", async () => {
    mount({ orders: Array.from({ length: 300 }, (_, i) => order(i)), fills: [] }, "/replay?focus=order:ord_00250");
    await ready();
    const text = banner();
    expect(text).toContain("is not among the 200 loaded orders; the Portal holds more. Load more orders below to look further.");
    expect(text).not.toContain("retained window");
    await press("Load more orders");
    expect(screen.getByText(/Opened at order/)).toBeTruthy();
    expect(screen.queryByText(/is not among the/)).toBeNull();
  });

  it("a fill on page 3 stays 'not among the loaded fills' after page 2, and is 'not in the retained window' once no page is left", async () => {
    mount({ fills: fills(450), orders: [] }, "/replay?focus=fill:fill_99999");
    await ready();
    expect(banner()).toContain("is not among the 200 loaded fills");
    await press("Load more fills");
    expect(banner()).toContain("is not among the 400 loaded fills");
    await press("Load more fills");
    expect(banner()).toContain("is not in the retained window of this book.");
    expect(banner()).not.toContain("is not among");
  });

  it("a page that failed to load says so, with the way to try again", async () => {
    const served = relations({ fills: fills(300), orders: [] });
    serveAlphaDouble((path, query) => (path.endsWith("/fills") && query.get("after") !== null ? { status: 503, body: { error: { code: "UPSTREAM_UNAVAILABLE", message: "page down" } } } : served(path, query)));
    render(<MemoryRouter initialEntries={["/replay?focus=fill:fill_00250"]}><AlphaReplay api={alphaHttpApi()} alphaId={ALPHA_DOUBLE_ID} /></MemoryRouter>);
    await ready();
    await press("Load more fills");
    expect(banner()).toContain("the next page of fills could not be read (");
    expect(banner()).toContain("Try again below.");
  });
});

describe("a first page of nothing but unreadable records", () => {
  const unreadableFirstPage = (body: Body) => { if (body.page.next_cursor === "k:200") { body.records = Array.from({ length: 200 }, () => null); body.page.returned_count = 200; } };

  it("is Unavailable, says the Portal holds more, and still offers Load more; the next page reads and focus lands on the notice", async () => {
    mount({ fills: fills(300), orders: [], fillsBody: unreadableFirstPage });
    await screen.findByText(/200 of 200 fill records could not be read/, undefined, { timeout: 15_000 });
    expect(screen.queryByRole("region", { name: "Trade log" })).toBeNull();
    const button = screen.getByRole("button", { name: "Load more fills" });
    button.focus();
    await press("Load more fills");
    expect(logRows().length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /more fills/ })).toBeNull();
    // The 200 unreadable records are still counted, so the notice stays, and it takes focus from the button that went away.
    expect(shortfall()!.textContent).toContain("200 of 300 fill records could not be read");
    expect(document.activeElement).toBe(shortfall());
  });
});

describe("focus after the last page", () => {
  it("moves from the Load more button that unmounts to a status line that says everything is loaded", async () => {
    mount({ fills: fills(201), orders: [] });
    await ready();
    screen.getByRole("button", { name: "Load more fills" }).focus();
    await press("Load more fills");
    expect(shortfall()).toBeNull();
    const done = screen.getByTestId("replay-loaded");
    expect(done.textContent).toContain("Every page the Portal holds is loaded: 0 orders and 201 fills.");
    expect(document.activeElement).toBe(done);
  });

  it("does not steal focus when it is already somewhere else", async () => {
    mount({ fills: fills(201), orders: [] });
    await ready();
    const other = document.createElement("input");
    document.body.appendChild(other);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Load more fills" })); other.focus(); await new Promise((r) => setTimeout(r, 30)); });
    expect(document.activeElement).toBe(other);
    other.remove();
  });
});

describe("a page the source marked PARTIAL is not 'ok'", () => {
  it("shows the log and says in the panel's own state that the window is not known to be the whole book", async () => {
    mount({ fills: fills(3), orders: [], fillsBody: (body) => { body.state = "PARTIAL"; } });
    await ready();
    expect(logWords()).toBe("3 events");
    expect(screen.getByText(/The source marked the fills read partial/)).toBeTruthy();
  });

  it("an AVAILABLE page carries no such sentence", async () => {
    mount({ fills: fills(3), orders: [], fillsBody: (body) => { body.state = "AVAILABLE"; } });
    await ready();
    expect(screen.queryByText(/marked the fills read partial/)).toBeNull();
  });

  it("a PARTIAL page with no record is not proof of an empty book", async () => {
    mount({ fills: [], orders: [], fillsBody: (body) => { body.state = "PARTIAL"; } });
    expect(await screen.findByText(/does not prove that none exist/, undefined, { timeout: 15_000 })).toBeTruthy();
  });
});

describe("the ceiling on loaded records", () => {
  it("2,100 fills: Load more is offered nine times, then stops at 2,000 with a stated reason and no button", async () => {
    mount({ fills: fills(2_100), orders: [] });
    await ready();
    for (let page = 1; page < 10; page += 1) await press("Load more fills");
    const note = shortfall()!;
    expect(note.textContent).toContain("2,000 fills loaded; the Portal holds more. Loading stops at 2,000 fills: narrow the replay window to see the rest.");
    expect(screen.queryByRole("button", { name: /more fills/ })).toBeNull();
    expect(logHead()?.textContent).toContain("of 2000 events shown");
  }, 60_000);

  it("a deep link past the ceiling says loading stops, not that more can be loaded", async () => {
    mount({ fills: fills(2_100), orders: [] }, "/replay?focus=fill:fill_02050");
    await ready();
    for (let page = 1; page < 10; page += 1) await press("Load more fills");
    expect(screen.getByText(/is not among the 2,000 loaded fills; the Portal holds more, and loading stops at 2,000 fills\. Narrow the replay window to look further\./)).toBeTruthy();
  }, 60_000);
});
