/** Display-fix lane D2 + D4 (25/11/2026): the Blotter's fills belong to the page's orders, and an order's
 * deployment is derived only when exactly one deployment matches. Real product source + Paper adapter over
 * stored-row-shaped data; TEST_ONLY authority, not a TS qualification. */
import { describe, expect, it } from "vitest";
import { PaperBlotterQuerySchema } from "../src/paper-read/contracts";
import { PaperReadService } from "../src/paper-read/paper-read.service";
import { productReadFixture } from "./elp2-product-read.fixture";

const AS_OF = "2026-11-25T01:00:00.000Z";
const relation = (name: string, items: Record<string, string | null>[]) => ({
  relation: name, availability: "AVAILABLE", completeness: "COMPLETE", reason_code: null, as_of: AS_OF,
  items: items.map((fields) => ({ fields })),
});
const parse = (value: unknown) => PaperBlotterQuerySchema.parse(value);

const TUPLES = {
  unique: { strategy_id: "strat-unique", account_id: "acct-unique" },
  ambiguous: { strategy_id: "strat-shared", account_id: "acct-shared" },
  none: { strategy_id: "strat-orphan", account_id: "acct-orphan" },
};

/** The retained window lists oldest first: 150 old fills, then the fills of the newest orders. */
function world(options: { extraDeployments?: number; fillsPerNewOrder?: number } = {}) {
  const f = productReadFixture({ legacy: true });
  const relations = f.snapshot.document.relations as Record<string, unknown>;
  const order = (id: string, tuple: { strategy_id: string; account_id: string }, at: string, status = "FILLED") => ({
    order_id: id, client_order_id: `c-${id}`, ...tuple, status, side: "BUY", venue: "OKX", symbol: "BTC-USDT-SWAP",
    quantity: "1", submitted_at: at,
  });
  const fill = (id: string, orderId: string, tuple: { strategy_id: string; account_id: string }, at: string) => ({
    fill_id: id, client_order_id: `c-${orderId}`, ...tuple, instrument_id: "BTC-USDT-SWAP", side: "BUY",
    price: "60000.5", quantity: "1", commission: "0.03", commission_currency: "USDT", trade_time: at,
  });
  const oldOrders = Array.from({ length: 150 }, (_, i) => order(`old-${i}`, TUPLES.unique, `2026-11-24T10:${String(i % 60).padStart(2, "0")}:00.000Z`));
  const newOrders = [
    order("new-unique", TUPLES.unique, "2026-11-25T01:51:00.000Z"),
    order("new-ambiguous", TUPLES.ambiguous, "2026-11-25T01:51:30.000Z"),
    order("new-none", TUPLES.none, "2026-11-25T01:52:00.000Z"),
  ];
  relations["manager.orders:orders"] = relation("orders", [...oldOrders, ...newOrders]);
  const oldFills = oldOrders.map((o, i) => fill(`f-old-${i}`, o.order_id, TUPLES.unique, `2026-11-24T17:${String(i % 60).padStart(2, "0")}:00.000Z`));
  const perNew = options.fillsPerNewOrder ?? 1;
  const newFills = newOrders.flatMap((o, i) => Array.from({ length: perNew }, (_, k) =>
    fill(`f-new-${i}-${k}`, o.order_id, { strategy_id: o.strategy_id, account_id: o.account_id }, `2026-11-25T01:5${i}:${String(k % 60).padStart(2, "0")}.000Z`)));
  relations["manager.fills:fills"] = relation("fills", [...oldFills, ...newFills]);
  const deployments = [
    { deployment_id: "dep-unique", ...TUPLES.unique, mode: "paper", venue: "OKX" },
    { deployment_id: "dep-shared-a", ...TUPLES.ambiguous, mode: "paper", venue: "OKX" },
    { deployment_id: "dep-shared-b", ...TUPLES.ambiguous, mode: "paper", venue: "OKX" },
    ...Array.from({ length: options.extraDeployments ?? 0 }, (_, i) =>
      ({ deployment_id: `dep-extra-${i}`, strategy_id: `strat-extra-${i}`, account_id: `acct-extra-${i}`, mode: "paper", venue: "OKX" })),
  ];
  relations["manager.deployments:strategy_deployments"] = relation("strategy_deployments", deployments);
  const service = new PaperReadService(f.product, f.config);
  const read = async (query: Record<string, unknown> = {}) =>
    await service.blotter(f.principal, parse({ limit: 50, ...query })) as any;
  return { f, read, newOrders, oldOrders };
}

describe("D2 - the Blotter's fills are the page's own", () => {
  it("returns the fills of the newest orders although 150 older fills precede them in the window", async () => {
    const w = world();
    const body = await w.read();
    const orderIds = body.data.orders.map((row: any) => row.client_order_id);
    expect(orderIds).toHaveLength(50);
    expect(orderIds.slice(0, 3)).toEqual(["c-new-none", "c-new-ambiguous", "c-new-unique"]);
    const fills = body.data.fills as any[];
    // The previous read took the first 100 stored fills: all old, none of the page's orders.
    expect(fills.some((row) => String(row.fill_id).startsWith("f-new-"))).toBe(true);
    for (const row of fills) expect(orderIds).toContain(row.client_order_id);
    // Every FILLED order of the page has its fill, with the price, fee and quantity the screen needs.
    const byOrder = new Map(fills.map((row) => [row.client_order_id, row]));
    for (const id of orderIds) expect(byOrder.get(id), id).toMatchObject({ price: "60000.5", quantity: "1", commission: "0.03" });
    expect(body.capabilities).toContainEqual(expect.objectContaining({ capability_id: "source.fills", state: "AVAILABLE" }));
  });

  it("selects fills before the limit, newest first, and never lists a fill of an order that is not on the page", async () => {
    const w = world();
    const body = await w.read({ limit: 2 });
    const orderIds = body.data.orders.map((row: any) => row.client_order_id);
    expect(orderIds).toEqual(["c-new-none", "c-new-ambiguous"]);
    expect((body.data.fills as any[]).map((row) => row.fill_id)).toEqual(["f-new-1-0", "f-new-2-0"].reverse());
  });

  it("says so when one bounded read cannot hold every fill of the page (stated PARTIAL, not a short list)", async () => {
    const w = world({ fillsPerNewOrder: 120 });
    const body = await w.read({ limit: 3 });
    expect(body.data.fills).toHaveLength(200);
    expect(body.capabilities).toContainEqual(expect.objectContaining({
      capability_id: "source.fills", state: "PARTIAL", reason_code: "N22_BLOTTER_FILLS_PAGE_CAPPED",
    }));
  });

  it("an empty orders page gets an honest EMPTY fills relation, not the oldest fills", async () => {
    const w = world();
    const body = await w.read({ symbol: "NO-SUCH-SYMBOL" });
    expect(body.data.orders).toEqual([]);
    expect(body.data.fills).toEqual([]);
    expect(body.capabilities).toContainEqual(expect.objectContaining({ capability_id: "source.fills", state: "EMPTY" }));
  });
});

describe("D4 - Deployment is joined only when exactly one deployment matches", () => {
  const deploymentOf = (body: any, clientOrderId: string) =>
    body.data.orders.find((row: any) => row.client_order_id === clientOrderId).deployment_id;
  const join = (body: any) => body.capabilities.find((item: any) => item.capability_id === "blotter.deployment-join");

  it("joins the unique pair, leaves the ambiguous and the unmatched pair null, and names the reason", async () => {
    const w = world();
    const body = await w.read();
    expect(deploymentOf(body, "c-new-unique")).toBe("dep-unique");
    expect(deploymentOf(body, "c-new-ambiguous") ?? null).toBeNull();
    expect(deploymentOf(body, "c-new-none") ?? null).toBeNull();
    expect(join(body)).toMatchObject({ state: "PARTIAL", reason_code: "N22_DEPLOYMENT_JOIN_AMBIGUOUS", relations: ["strategy_deployments"] });
  });

  it("with only unique pairs on the page the join is AVAILABLE and complete", async () => {
    const w = world();
    const body = await w.read({ symbol: "BTC-USDT-SWAP", limit: 100, sort: "submitted_at_asc" });
    const ids = body.data.orders.map((row: any) => row.client_order_id);
    expect(ids[0]).toBe("c-old-0");
    expect(body.data.orders.slice(0, 100).every((row: any) => row.deployment_id === "dep-unique")).toBe(true);
    expect(join(body)).toMatchObject({ state: "AVAILABLE", reason_code: null });
  });

  it("no deployment at all for the pair is reported as no deployment", async () => {
    const w = world();
    (w.f.snapshot.document.relations as any)["manager.deployments:strategy_deployments"] = relation("strategy_deployments", [
      { deployment_id: "dep-unique", ...TUPLES.unique, mode: "paper", venue: "OKX" }]);
    const body = await w.read({ limit: 3 });
    expect(deploymentOf(body, "c-new-none") ?? null).toBeNull();
    expect(deploymentOf(body, "c-new-ambiguous") ?? null).toBeNull();
    expect(join(body)).toMatchObject({ state: "PARTIAL", reason_code: "N22_DEPLOYMENT_JOIN_NO_DEPLOYMENT" });
  });

  it("an unseen deployment could make a pair ambiguous: an incomplete census joins nothing", async () => {
    const w = world({ extraDeployments: 200 });
    const body = await w.read({ limit: 3 });
    expect(deploymentOf(body, "c-new-unique") ?? null).toBeNull();
    expect(join(body)).toMatchObject({ reason_code: "N22_DEPLOYMENT_JOIN_AMBIGUOUS" });
    // ambiguity is visible in what was read; the unique pair is held back only by the census
    const only = await w.read({ limit: 3, symbol: "BTC-USDT-SWAP", status: "FILLED", sort: "submitted_at_asc" });
    expect(only.data.orders.every((row: any) => row.deployment_id === undefined || row.deployment_id === null)).toBe(true);
  });

  it("never overwrites a deployment id the order already carries", async () => {
    const w = world();
    const orders = (w.f.snapshot.document.relations as any)["manager.orders:orders"].items;
    orders.find((item: any) => item.fields.order_id === "new-unique").fields.deployment_id = "dep-from-source";
    const body = await w.read({ limit: 3 });
    expect(deploymentOf(body, "c-new-unique")).toBe("dep-from-source");
  });

  it("when the deployments read is unavailable the id stays null and the join says UNAVAILABLE", async () => {
    const w = world();
    delete (w.f.snapshot.document.relations as any)["manager.deployments:strategy_deployments"];
    const body = await w.read({ limit: 3 });
    expect(body.data.orders.every((row: any) => row.deployment_id === undefined || row.deployment_id === null)).toBe(true);
    expect(join(body)).toMatchObject({ state: "UNAVAILABLE", reason_code: "N22_DEPLOYMENT_JOIN_DEPLOYMENTS_UNAVAILABLE" });
  });
});
