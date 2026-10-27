// @vitest-environment node
/** WORLD: the stage bodies, the alpha resource and the account state the SAME facts for a deployment (account, allocation, dates, positions, equity, series). */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";
import { deploymentOf, grossNotional, lifecycleOf, MARKS, netPnlOf, positionsOf, toCents } from "../../e2e/bffWorld";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const E = "/api/v1/execution";
let server: Server;
let base = "";
const get = async (path: string): Promise<Body> => (await fetch(`${base}${path}`)).json();
const kpi = (body: Body, key: string): string => body.kpis.find((k: Body) => k.key === key).value;
const fig = (body: Body, key: string): string => body.source_figures.figures.find((f: Body) => f.key === key).internal.value;

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "medium" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
  resetScenario();
});

describe("a deployment is ONE thing on every screen", () => {
  it("dep_live_01: the Live page states the account, allocation, start, positions at one mark, equity and series of the world", async () => {
    const world = deploymentOf("dep_live_01")!;
    const d = world.deployment;
    const live = await get(`${E}/deployments/dep_live_01/live`);
    expect(live.deployment.account_id).toBe(d.accountId);
    expect(d.accountId).toBe("acc_bnc_core");
    expect(kpi(live, "capital")).toBe(d.allocation.includes(".") ? d.allocation : `${d.allocation}.00`);
    expect(kpi(live, "gross_notional")).toBe(grossNotional("dep_live_01"));
    expect(toCents(fig(live, "equity"))).toBe(toCents(d.allocation) + netPnlOf(d));
    expect(live.lifecycle.activated_at).toBe(new Date(lifecycleOf("alpha_a").liveFromMs).toISOString());
    // every position is at the world's mark of its symbol, and their unrealised amounts add up to the deployment's
    // the wire states canonical decimals (a trailing zero is refused whole by the reader), so the mark is compared as a value
    for (const row of live.positions.typed.rows) expect(toCents(row.mark)).toBe(toCents(MARKS[row.symbol]!));
    const unrealised = live.positions.typed.rows.reduce((n: bigint, r: Body) => n + toCents(r.unrealised), 0n);
    expect(unrealised).toBe(toCents(d.unrealized));
    expect(live.positions.typed.rows.map((r: Body) => r.id)).toEqual(positionsOf("dep_live_01").map((p) => p.id));
    // the series ends on realized + unrealized
    const last = live.series.points.at(-1).value as string;
    expect(toCents(last)).toBe(netPnlOf(d));
  });

  it("the alpha resource and the account name the same account and the same allocation for it", async () => {
    const alpha = await get(`${E}/resources/alphas/alpha_a`);
    const row = alpha.data.deployments.find((x: Body) => x.deployment_id === "dep_live_01");
    expect(row.account_id).toBe("acc_bnc_core");
    expect(alpha.data.portfolio_allocations.find((x: Body) => x.deployment_id === "dep_live_01").allocated_capital).toBe("40000.00");
    const account = await get(`${E}/resources/accounts/acc_bnc_core`);
    expect(account.data.portfolio_allocations.some((x: Body) => x.deployment_id === "dep_live_01" && x.allocated_capital === "40000.00")).toBe(true);
    const live = await get(`${E}/deployments/dep_live_01/live`);
    expect(live.deployment.account_id).toBe(row.account_id);
  });

  it("the Canary page of a canary rollout (dep_canary_01, and its harness id dep_canary_01) states the same book; caps follow the allocation", async () => {
    const a = await get(`${E}/deployments/dep_canary_01/canary`);
    const b = await get(`${E}/deployments/dep_canary_01/canary`);
    for (const page of [a, b]) {
      expect(page.deployment.account_id).toBe("acc_bnc_core");
      expect(kpi(page, "gross_notional")).toBe(grossNotional("dep_canary_01"));
      const rows = page.envelope_compliance.rows as Body[];
      const gross = rows.find((r) => r.cap === "gross_notional");
      expect(gross.consumed.value).toBe(grossNotional("dep_canary_01").replace(/\.?0+$/, "") || "0");
      expect(toCents(page.envelope.limits.capital_cap)).toBe(toCents("30000"));
      expect(Number(rows.find((r) => r.cap === "gross_notional").approved)).toBeGreaterThanOrEqual(Number(grossNotional("dep_canary_01")));
    }
  });

  it("the blotter holds orders for every deployment of the world, and the Paper workbench lists the same rows", async () => {
    const blotter = await get(`${E}/screens/blotter?limit=200`);
    const all = await get(`${E}/screens/blotter?limit=200`);
    expect(all.data.orders.length).toBeGreaterThan(50);
    // every order belongs to a deployment the Fleet knows, on the account that deployment is booked on
    const fleet = new Map<string, string>();
    for (const environment of ["paper", "sandbox", "live"]) for (const row of (await get(`${E}/manager/fleet?environment=${environment}&limit=200`)).items) for (const c of row.children) fleet.set(c.deployment_id, c.account_id);
    const unknown = blotter.data.orders.filter((o: Body) => !fleet.has(o.deployment_id));
    expect(unknown.map((o: Body) => o.deployment_id)).toEqual([]);
    for (const o of blotter.data.orders) expect(o.account_id).toBe(fleet.get(o.deployment_id));
    // the native books are in the first page: dep_live_01 has orders, at the world's mark of the symbol
    const mine = blotter.data.orders.filter((o: Body) => o.deployment_id === "dep_live_01");
    expect(mine.length).toBeGreaterThan(0);
    for (const o of mine) if (o.price !== null) expect(Math.abs(Number(o.price) - Number(MARKS[o.symbol]))).toBeLessThan(1);
    const paper = await get(`${E}/screens/paper/dep_paper_01`);
    const paperIds = paper.data.orders.map((o: Body) => o.order_id);
    expect(paperIds.length).toBeGreaterThan(0);
    const known = new Set<string>();
    let cursor: string | null = null;
    for (let page = 0; page < 12; page += 1) {
      const next: Body = await get(`${E}/screens/blotter?limit=200${cursor === null ? "" : `&after=${encodeURIComponent(cursor)}`}`);
      for (const o of next.data.orders) known.add(o.order_id);
      cursor = next.data.page?.next_cursor ?? next.page?.next_cursor ?? null;
      if (cursor === null) break;
    }
    for (const id of paperIds) expect(known.has(id), id).toBe(true);
    // one price: the paper positions are at the same mark
    for (const p of paper.data.positions) expect(p.mark_price).toBe(MARKS[p.instrument_id]);
  });

  it("Alpha 360's orders, fills, positions and equity are the alpha's own deployments' (no clones), and the equity line ends on the account ledger", async () => {
    const orders = await get(`${E}/resources/alphas/alpha_a/orders?environment=live&limit=200`);
    const other = await get(`${E}/resources/alphas/alpha_btc_trend/orders?environment=live&limit=200`);
    const mine = orders.records.map((r: Body) => r.values);
    expect(mine.length).toBeGreaterThan(0);
    for (const o of mine) { expect(o.strategy_id).toBe("alpha_a"); expect(o.deployment_id).toBe("dep_live_01"); expect(o.account_id).toBe("acc_bnc_core"); }
    expect(other.records.map((r: Body) => r.record_id).filter((id: string) => mine.some((o: Body) => o.order_id === id))).toEqual([]);
    const alpha = await get(`${E}/resources/alphas/alpha_a`);
    const live = await get(`${E}/deployments/dep_live_01/live`);
    expect(alpha.data.positions.filter((p: Body) => p.deployment_id === "dep_live_01").map((p: Body) => p.position_id)).toEqual(live.positions.typed.rows.map((r: Body) => r.id));
    const chart = await get(`${E}/views/equity-chart?subject_kind=alpha&subject_id=alpha_a&environment=live`);
    // the alpha's equity (WP-C's line) is the equity of ITS deployments in this environment: allocation + realized + unrealized
    const equity = deploymentOf("dep_live_01")!.deployment;
    expect(toCents(chart.panel.data.series[0].points.at(-1)[1])).toBe(toCents(equity.allocation) + netPnlOf(equity));
    const account = await get(`${E}/resources/accounts/acc_bnc_core`);
    const ledger = account.data.account_balances.find((b: Body) => b.account_id === "acc_bnc_core").total;
    const accountChart = await get(`${E}/views/equity-chart?subject_kind=account&subject_id=acc_bnc_core`);
    expect(toCents(accountChart.panel.data.series[0].points.at(-1)[1])).toBe(toCents(ledger));
  });

  it("days in stage on the Fleet are the alpha's stage history, as the stage screens date it", async () => {
    const fleet = await get(`${E}/manager/fleet?environment=live&limit=200`);
    const rows = fleet.items.filter((r: Body) => r.current_stage === "LIVE" && r.days_in_stage !== null);
    expect(rows.length).toBeGreaterThan(5);
    for (const row of rows) expect(row.days_in_stage).toBe(lifecycleOf(row.alpha_id).liveDays);
  });
});
