// @vitest-environment node
/**
 * WP-B2-O: ONE order book. Every order that any room, page or list states is the blotter's record by id (same status, quantity, price, time), and inside
 * each body submit < grant < ack < fills <= the body's own as-of, which is the world clock. Run twice: as the specs see the doubles (no rebase) and as the
 * preview serves them (FIXTURE_REBASE_TIME=1, the whole world moved by whole days).
 */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";
import { NATIVE_ALPHAS, WORLD_NOW_MS, worldAlphas } from "../../e2e/bffWorld";
import { isRetired, PAPER_POLICY_MIN_TRADES, stageWindowOf } from "../../e2e/bffWorldStage";
import { FIRST_PAGE_ROWS, ORDER_BOOK_AS_OF_MS, WORKING_STATES } from "../../e2e/bffWorldOrders";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const E = "/api/v1/execution";
const ms = (text: unknown): number => Date.parse(String(text));

describe("the clock rules are the world's", () => {
  it("the order book is read at the world clock", () => expect(ORDER_BOOK_AS_OF_MS).toBe(WORLD_NOW_MS));
});

describe.each([{ rebase: "0" }, { rebase: "1" }])("one order book (FIXTURE_REBASE_TIME=$rebase)", ({ rebase }) => {
  let server: Server;
  let base = "";
  const get = async (path: string): Promise<Body> => (await fetch(`${base}${path}`)).json();
  let blotter: Body[] = [];
  let blotterFills: Body[] = [];
  let blotterAsOf = 0;

  beforeAll(async () => {
    server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "medium", FIXTURE_REBASE_TIME: rebase }));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    let cursor: string | null = null;
    for (let guard = 0; guard < 40; guard += 1) {
      const page: Body = await get(`${E}/screens/blotter?limit=25${cursor === null ? "" : `&after=${cursor}`}`);
      blotterAsOf = ms(page.as_of);
      expect(ms(page.read_at)).toBe(blotterAsOf);
      blotter.push(...page.data.orders);
      blotterFills.push(...page.data.fills);
      cursor = page.data.page.next_cursor;
      if (cursor === null) break;
    }
    expect((blotterAsOf - WORLD_NOW_MS) % 86_400_000).toBe(0); // the preview moves the whole world by whole days only
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    resetFixtureGlobals();
    resetScenario();
  });

  const book = (): Map<string, Body> => new Map(blotter.map((o) => [String(o.order_id), o]));

  it("the blotter's own clock: submit < ack < fills <= its as-of, per order", () => {
    expect(blotter.length).toBe(300);
    const fillsOf = (o: Body): Body[] => blotterFills.filter((f) => f.client_order_id === o.client_order_id);
    for (const o of blotter) {
      const submitted = ms(o.submitted_at);
      expect(submitted, o.order_id).toBeLessThan(ms(o.updated_at) + 1);
      expect(ms(o.updated_at), o.order_id).toBeLessThanOrEqual(blotterAsOf);
      const fills = fillsOf(o);
      let last = submitted;
      for (const f of fills) {
        const t = ms(f.trade_time);
        expect(t, `${o.order_id} ${f.fill_id} is after its submit and its ack (2 s)`).toBeGreaterThanOrEqual(submitted + 2_000);
        expect(t, `${f.fill_id} is not after the as-of`).toBeLessThanOrEqual(blotterAsOf);
        expect(t, `${f.fill_id} fills in order`).toBeGreaterThan(last === submitted ? submitted : last - 1);
        last = t;
      }
      if (fills.length > 0) expect(ms(o.updated_at), `${o.order_id} updated at its last fill`).toBe(last);
    }
  });

  it("a working order is among the newest rows, and every canary deployment holds exactly one", () => {
    const rows = blotter;
    rows.forEach((o, index) => { if (WORKING_STATES.includes(String(o.status))) expect(index, `${o.order_id} is working but older than the first page`).toBeLessThan(FIRST_PAGE_ROWS); });
    const canaries = worldAlphas().flatMap((a) => a.deployments).filter((d) => d.stage === "CANARY" && !isRetired(d.id));
    expect(canaries.length).toBeGreaterThan(0);
    for (const d of canaries) {
      const mine = rows.filter((o) => o.deployment_id === d.id);
      if (mine.length === 0) continue;
      const index = rows.findIndex((o) => o.deployment_id === d.id);
      if (index >= FIRST_PAGE_ROWS) continue; // a deployment whose newest order is not on the first page holds none (nothing can be scoped to it on the first page)
      expect(mine.filter((o) => WORKING_STATES.includes(String(o.status))).map((o) => `${o.status} ${o.order_type}`), d.id).toEqual(["PARTIALLY_FILLED LIMIT"]);
    }
  });


  it("the book is newest first by submit time", () => {
    for (let i = 1; i < blotter.length; i += 1) expect(ms(blotter[i - 1]!.submitted_at), blotter[i]!.order_id).toBeGreaterThanOrEqual(ms(blotter[i]!.submitted_at));
  });

  it("a retired stage holds nothing after its exit and nothing open; a retired Paper stage holds the gate's minimum fills in the book (B-S handoff)", () => {
    const retired = worldAlphas().flatMap((a) => a.deployments).filter((d) => isRetired(d.id));
    expect(retired.length).toBeGreaterThan(0);
    const shiftMs = blotterAsOf - WORLD_NOW_MS;
    let paperChecked = 0;
    for (const d of retired) {
      const window = stageWindowOf(d.id)!;
      const orders = blotter.filter((o) => o.deployment_id === d.id);
      const fills = blotterFills.filter((f) => orders.some((o) => o.client_order_id === f.client_order_id));
      for (const o of orders) {
        expect(WORKING_STATES.includes(String(o.status)), `${d.id} ${o.order_id} is ${o.status} on a retired stage`).toBe(false);
        expect(ms(o.submitted_at), `${d.id} ${o.order_id} is before the stage began`).toBeGreaterThanOrEqual(window.fromMs + shiftMs);
        expect(ms(o.updated_at), `${d.id} ${o.order_id} is after the exit`).toBeLessThanOrEqual(window.toMs + shiftMs);
      }
      for (const f of fills) expect(ms(f.trade_time), `${d.id} ${f.fill_id} is after the exit`).toBeLessThanOrEqual(window.toMs + shiftMs);
      if (d.environment === "paper" && d.stage === "PAPER") {
        expect(fills.length, `${d.id} fills in the book`).toBeGreaterThanOrEqual(PAPER_POLICY_MIN_TRADES);
        paperChecked += 1;
      }
    }
    expect(paperChecked).toBeGreaterThan(0);
  });

  /** A record of an order anywhere equals the blotter's, on every member it carries. */
  const sameAsBlotter = (where: string, id: string, carried: Record<string, unknown>): void => {
    const row = book().get(id);
    expect(row, `${where}: ${id} is in the blotter`).toBeDefined();
    for (const [key, value] of Object.entries(carried)) {
      const numeric = value !== null && value !== "" && !Number.isNaN(Number(value)) && typeof row[key] !== "undefined" && /^-?\d+(\.\d+)?$/.test(String(value));
      if (numeric) expect(Number(value), `${where}: ${id}.${key}`).toBe(Number(row[key]));
      else expect(String(value), `${where}: ${id}.${key}`).toBe(String(row[key]));
    }
  };

  it("the Live room's open orders are blotter records (id, symbol, side, type, quantity, price, status, time)", async () => {
    const live = await get(`${E}/deployments/dep_live_01/live`);
    const rows = live.orders.typed.rows as Body[];
    const mine = blotter.filter((o) => o.deployment_id === "dep_live_01" && WORKING_STATES.includes(String(o.status)));
    expect(rows.map((r) => r.id).sort()).toEqual(mine.map((o) => o.order_id).sort());
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) sameAsBlotter("live", r.id, { symbol: r.symbol, side: r.side.toUpperCase(), order_type: r.type, quantity: blotterQty(r.id, r.quantity), price: r.price, status: r.status, submitted_at: r.since });
    for (const r of rows) expect(ms(r.since)).toBeLessThanOrEqual(ms(live.orders.envelope.as_of));
  });
  /** A room prints a quantity without the book's trailing places; the value is what must agree. */
  const blotterQty = (id: string, printed: string): string => (Number(printed) === Number(book().get(id)!.quantity) ? String(book().get(id)!.quantity) : printed);

  it("each Canary room's open order exists in the blotter with the same facts (R5-01)", async () => {
    const canaries = worldAlphas().flatMap((a) => a.deployments).filter((d) => d.stage === "CANARY" && !isRetired(d.id) && blotter.some((o) => o.deployment_id === d.id));
    const checked: string[] = [];
    for (const d of canaries) {
      const room = await get(`${E}/deployments/${d.id}/canary`);
      const rows = (room.blotter?.typed?.rows ?? []) as Body[];
      const mine = blotter.filter((o) => o.deployment_id === d.id && WORKING_STATES.includes(String(o.status)));
      expect(rows.map((r) => r.id).sort(), d.id).toEqual(mine.map((o) => o.order_id).sort());
      for (const r of rows) {
        sameAsBlotter(`canary ${d.id}`, r.id, { symbol: r.symbol, side: r.side.toUpperCase(), order_type: r.type, quantity: blotterQty(r.id, r.quantity), price: r.price, status: r.status, submitted_at: r.since });
        expect(ms(r.since)).toBeLessThanOrEqual(ms(room.blotter.envelope.as_of));
        checked.push(r.id);
      }
    }
    expect(checked.length).toBeGreaterThan(0);
  });

  it("the Paper tabs list the blotter's orders and fills of their deployment, none after the page's as-of or before its own submit", async () => {
    const paper = await get(`${E}/screens/paper/dep_paper_01`);
    const asOf = ms(paper.as_of);
    // a Paper stage the alpha has left has no source update after its exit: as-of is the exit, the read is at the world clock
    expect(ms(paper.read_at)).toBe(blotterAsOf);
    expect(asOf).toBeLessThanOrEqual(blotterAsOf);
    const orders = paper.data.orders as Body[];
    expect(orders.length).toBeGreaterThan(0);
    const submitted = new Map<string, number>();
    for (const o of orders) {
      sameAsBlotter("paper", o.order_id, { status: o.status, quantity: o.quantity, price: o.price, submitted_at: o.submitted_at });
      submitted.set(o.order_id, ms(o.submitted_at));
      expect(ms(o.submitted_at)).toBeLessThanOrEqual(asOf);
    }
    for (const f of paper.data.fills as Body[]) {
      expect(ms(f.trade_time), f.fill_id).toBeLessThanOrEqual(asOf);
      expect(ms(f.trade_time), f.fill_id).toBeGreaterThan(submitted.get(f.order_id)!);
      const row = blotterFills.find((x) => x.fill_id === f.fill_id);
      expect(row, f.fill_id).toBeDefined();
      expect(f.trade_time).toBe(row.trade_time);
    }
  });

  it("Alpha 360 orders, fills and the timeline (the Trade Replay's records) are the blotter's, in every environment, and read at the world clock", async () => {
    let seen = 0;
    for (const alpha of NATIVE_ALPHAS) {
      for (const environment of ["live", "paper", "sandbox"]) {
        const orders = await get(`${E}/resources/alphas/${alpha.id}/orders?environment=${environment}`);
        const fills = await get(`${E}/resources/alphas/${alpha.id}/fills?environment=${environment}`);
        if (orders.state !== "AVAILABLE") continue;
        const asOf = orders.projection.source_as_of_ms as number;
        expect(asOf, `${alpha.id} ${environment} orders`).toBe(blotterAsOf);
        expect(fills.projection.source_as_of_ms).toBe(asOf);
        expect(orders.source_health.as_of_ms).toBe(asOf);
        const submitted = new Map<string, number>();
        for (const r of orders.records as Body[]) {
          const v = r.values;
          sameAsBlotter(`${alpha.id}/${environment} orders`, v.order_id, { status: v.status, quantity: v.quantity, price: v.price, submitted_at: v.submitted_at, updated_at: v.updated_at, order_type: v.order_type });
          submitted.set(String(v.client_order_id), ms(v.submitted_at));
          expect(ms(v.updated_at)).toBeLessThanOrEqual(asOf);
          seen += 1;
        }
        expect(orders.coverage.newest_observed_at_ms).toBeLessThanOrEqual(asOf);
        for (const r of fills.records as Body[]) {
          const v = r.values;
          const row = blotterFills.find((x) => x.fill_id === v.fill_id);
          expect(row, `${alpha.id}/${environment} ${v.fill_id} is in the blotter`).toBeDefined();
          expect(v.trade_time, `${v.fill_id} has the blotter's time`).toBe(row.trade_time);
          expect(ms(v.trade_time)).toBeLessThanOrEqual(asOf);
          expect(ms(v.trade_time), `${v.fill_id} after its submit`).toBeGreaterThan(submitted.get(String(v.client_order_id)) ?? 0);
        }
        const timeline = await get(`${E}/views/observed-timeline?subject_id=${alpha.id}&environment=${environment}`);
        const clocks = timeline.observed_timeline.clocks;
        expect(clocks.as_of_ms).toBeLessThanOrEqual(clocks.read_at_ms);
        for (const e of timeline.observed_timeline.data.entries as Body[]) {
          if (e.source_record.kind !== "ORDER") continue;
          expect(e.observed_at_ms, e.source_record.id).toBeLessThanOrEqual(clocks.read_at_ms);
          const row = book().get(e.source_record.id);
          expect(row, `timeline ${e.source_record.id}`).toBeDefined();
          expect(e.observed_at_ms, `timeline ${e.source_record.id} is the order's own updated_at`).toBe(ms(row.updated_at));
          expect(String(row.price)).toBe(String(e.values.price));
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("an account's orders and fills are the blotter's rows of its deployments, stated at the world clock", async () => {
    let seen = 0;
    for (const accountId of ["acc_bnc_core", "acc_bnc_sat", "acc_bnc_can", "acc_pap_sim", "acc_tn_bnc"]) {
      const environment = accountId === "acc_pap_sim" ? "paper" : accountId === "acc_tn_bnc" ? "sandbox" : "live";
      const orders = await get(`${E}/resources/accounts/${accountId}/orders?environment=${environment}&limit=500`);
      const fills = await get(`${E}/resources/accounts/${accountId}/fills?environment=${environment}&limit=500`);
      if (orders.state !== "AVAILABLE") continue;
      const asOf = orders.source_health.as_of_ms as number;
      expect(asOf, accountId).toBe(blotterAsOf);
      for (const r of orders.records as Body[]) {
        const v = r.values;
        sameAsBlotter(`${accountId} orders`, v.order_id, { status: v.status, quantity: v.quantity, price: v.price, submitted_at: v.submitted_at, updated_at: v.updated_at });
        expect(ms(v.submitted_at)).toBeLessThanOrEqual(asOf);
        seen += 1;
      }
      expect(orders.coverage.newest_observed_at_ms).toBeLessThanOrEqual(asOf);
      for (const r of fills.records as Body[]) {
        const row = blotterFills.find((x) => x.fill_id === r.values.fill_id);
        expect(row).toBeDefined();
        expect(r.values.trade_time).toBe(row.trade_time);
        expect(ms(r.values.trade_time)).toBeLessThanOrEqual(asOf);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it("the order path (funnel) hops are the order's own clock: in order, none after the fill, none after the as-of", async () => {
    let checked = 0;
    for (const o of blotter.slice(0, 40)) {
      const body = await get(`${E}/orders/${o.order_id}/funnel`);
      const stages = body.analytics.data.stages as Body[];
      expect(ms(body.read_at), o.order_id).toBe(blotterAsOf);
      const times = stages.flatMap((s) => (s.events as Body[]).map((e) => ms(e.occurred_at)));
      expect(times[0], `${o.order_id} first hop is the submit`).toBe(ms(o.submitted_at));
      for (let i = 1; i < times.length; i += 1) expect(times[i], `${o.order_id} hop ${i}`).toBeGreaterThan(times[i - 1]!);
      const fills = blotterFills.filter((f) => f.client_order_id === o.client_order_id).map((f) => ms(f.trade_time));
      if (stages.length === 4) expect(times[3], o.order_id).toBe(Math.min(...fills));
      for (const t of times) expect(t).toBeLessThanOrEqual(blotterAsOf);
      checked += 1;
    }
    expect(checked).toBe(40);
  });

  it("a scope or a filter never changes an order's facts", async () => {
    const filtered = await get(`${E}/screens/blotter?limit=25&status_bucket=OPEN`);
    for (const o of filtered.data.orders as Body[]) {
      const row = book().get(o.order_id)!;
      expect(o, o.order_id).toEqual(row);
    }
    const bySymbol = await get(`${E}/screens/blotter?limit=25&symbol=BTCUSDT`);
    for (const o of bySymbol.data.orders as Body[]) expect(o).toEqual(book().get(o.order_id));
  });
});
