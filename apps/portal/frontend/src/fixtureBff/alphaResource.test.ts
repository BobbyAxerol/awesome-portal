// @vitest-environment node
/** WP-P (R2-02, R3 I-15): an alpha resource is derived from that alpha's own rows, and an unknown incident is the typed 404. */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const E = "/api/v1/execution";
let server: Server;
let base = "";
const get = async (path: string): Promise<{ status: number; body: Body }> => { const r = await fetch(`${base}${path}`); return { status: r.status, body: await r.json() }; };
const cents = (v: string): bigint => { const n = v.startsWith("-"); const [w, f = ""] = v.replace("-", "").split("."); const x = BigInt(w + `${f}00`.slice(0, 2)); return n ? -x : x; };

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

describe("alpha resources are not clones", () => {
  it("two alphas answer with their own deployments, accounts and allocations", async () => {
    const a = (await get(`${E}/resources/alphas/alpha_scale_001`)).body;
    const b = (await get(`${E}/resources/alphas/alpha_scale_006`)).body;
    const ids = (body: Body): string[] => body.data.deployments.map((d: Body) => d.deployment_id);
    expect(ids(a)).not.toContain("dep_live_01");
    expect(ids(a).some((id: string) => ids(b).includes(id))).toBe(false);
    expect(a.data.alpha.alpha_id).toBe("alpha_scale_001");
    expect(a.data.accounts.map((x: Body) => x.account_id)).not.toEqual(b.data.accounts.map((x: Body) => x.account_id));
  });

  it("the resource's allocated capital is the Fleet row's allocation of the same alpha and environment", async () => {
    const fleet = (await get(`${E}/manager/fleet?environment=live&limit=200`)).body;
    const rows = fleet.items.filter((item: Body) => item.alpha_id === "alpha_scale_001");
    expect(rows.length).toBeGreaterThan(0);
    const resource = (await get(`${E}/resources/alphas/alpha_scale_001`)).body;
    const allocated = resource.data.portfolio_allocations.reduce((sum: bigint, r: Body) => sum + cents(r.allocated_capital), 0n);
    const metric = (key: string): bigint => rows.reduce((sum: bigint, row: Body) => sum + cents(row.economic_partitions[0].metrics[key].value), 0n);
    expect(allocated).toBe(metric("allocation"));
    // balance = allocation + realized + unrealized PnL of the same deployments (the account's equity), free + locked = total
    const balance = resource.data.account_balances.reduce((sum: bigint, r: Body) => sum + cents(r.total), 0n);
    expect(balance - allocated).toBe(metric("net_pnl") + metric("unrealized_pnl"));
    for (const r of resource.data.account_balances) expect(cents(r.free) + cents(r.locked)).toBe(cents(r.total));
  });
});

describe("incidents", () => {
  it("an id the owning source does not hold is the typed 404; a listed one answers", async () => {
    expect((await get(`${E}/operations/incidents/inc_never_existed`)).status).toBe(404);
    expect((await get(`${E}/operations/incidents/inc_TEST_ONLY_fx_budget`)).status).toBe(200);
  });
});
