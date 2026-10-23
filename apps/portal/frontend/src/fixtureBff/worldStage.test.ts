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
    for (const row of live.positions.typed.rows) expect(row.mark).toBe(MARKS[row.symbol]);
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

  it("the Canary page of a canary rollout (dep_b3, and its harness id dep_canary_01) states the same book; caps follow the allocation", async () => {
    const a = await get(`${E}/deployments/dep_b3/canary`);
    const b = await get(`${E}/deployments/dep_canary_01/canary`);
    for (const page of [a, b]) {
      expect(page.deployment.account_id).toBe("acc_bnc_core");
      expect(kpi(page, "gross_notional")).toBe(grossNotional("dep_b3"));
      const rows = page.envelope_compliance.rows as Body[];
      const gross = rows.find((r) => r.cap === "gross_notional");
      expect(gross.consumed.value).toBe(grossNotional("dep_b3").replace(/\.?0+$/, "") || "0");
      expect(toCents(page.envelope.limits.capital_cap)).toBe(toCents("30000"));
      expect(Number(rows.find((r) => r.cap === "gross_notional").approved)).toBeGreaterThanOrEqual(Number(grossNotional("dep_b3")));
    }
  });

  it("days in stage on the Fleet are the alpha's stage history, as the stage screens date it", async () => {
    const fleet = await get(`${E}/manager/fleet?environment=live&limit=200`);
    const rows = fleet.items.filter((r: Body) => r.current_stage === "LIVE" && r.days_in_stage !== null);
    expect(rows.length).toBeGreaterThan(5);
    for (const row of rows) expect(row.days_in_stage).toBe(lifecycleOf(row.alpha_id).liveDays);
  });
});
