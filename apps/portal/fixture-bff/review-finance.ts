/** Positive FIXTURE_LAB source facts, not production financial derivations.
 * The generated deployment graph owns allocation, currency and gross exposure.
 * This synthetic PM statement declares a 10% margin budget requirement, a
 * further 500 units of approved headroom, and alternating long/short books.
 * It does NOT equate capital allocation with risk budget or venue equity.
 */
import { scaled, addDecimal } from "../frontend/e2e/bffScale";
import { answerFixtureRequest, V2_OPTIONS } from "../frontend/e2e/bffAnswerer";

type Obj = Record<string, any>;
const object = (x: unknown): x is Obj => x !== null && typeof x === "object" && !Array.isArray(x);
type Deployment = ReturnType<typeof scaled>["alphas"][number]["deployments"][number];
const indexes = new WeakMap<object, Map<string, { deployment: Deployment; alphaName: string; short: boolean }>>();
function index() {
  const graph = scaled();
  let result = indexes.get(graph);
  if (!result) {
    result = new Map();
    for (const alpha of graph.alphas) alpha.deployments.forEach((deployment, n) => {
      result!.set(deployment.id, { deployment, alphaName: alpha.label, short: n % 2 === 1 });
    });
    indexes.set(graph, result);
  }
  return result;
}
// Exact decimal /10, including JPY and fine-grained quote currencies.
const tenth = (value: string) => {
  const [whole, fraction = ""] = value.split(".");
  return `${whole!.slice(0, -1) || "0"}.${whole!.slice(-1)}${fraction}`;
};

export function linkedReviewFinance(path: string, body: unknown): unknown {
  if (path === "/api/v1/execution/screens/blotter") return linkedOrderFacts(body);
  const match = /^\/api\/v1\/execution\/resources\/accounts\/([^/]+)$/.exec(path);
  if (!match || !object(body) || "error" in body || !object(body.data)) return body;
  const account = decodeURIComponent(match[1]!);
  const binding = scaled().bindings.find(b => b.accountId === account);
  if (!binding || ["EXPIRED", "NOT_PUBLISHED"].includes(binding.credentialState)) return body;
  const enrich = (row: Obj, allocation: boolean): Obj => {
    const source = index().get(row.deployment_id);
    if (!source) return row;
    const d = source.deployment;
    // A matching id alone is insufficient: preserve all account/environment,
    // portfolio and currency boundaries of the already-selected fixture row.
    if (d.accountId !== account || d.environment !== binding.environment || row.account_id !== account ||
        row.portfolio_id !== d.portfolioId || row.mode !== d.environment ||
        (allocation && row.currency !== d.currency)) return row;
    const named = { ...row, portfolio_name: d.portfolioName, strategy_name: source.alphaName,
      deployment_name: `${source.alphaName} · ${d.environment} · ${d.id}` };
    if (!allocation) return named;
    const used = tenth(d.exposure);
    return { ...named, budget_used: used, budget_approved: addDecimal(used, "500"),
      exposure_long: source.short ? "0" : d.exposure,
      exposure_short: source.short ? d.exposure : "0", exposure_gross: d.exposure,
      updated_at: d.updatedAt };
  };
  return { ...body, data: { ...body.data,
    ...(Array.isArray(body.data.deployments) ? { deployments: body.data.deployments.map((r: Obj) => enrich(r, false)) } : {}),
    ...(Array.isArray(body.data.portfolio_allocations) ? { portfolio_allocations: body.data.portfolio_allocations.map((r: Obj) => enrich(r, true)) } : {}),
  } };
}

/** The legacy double caps its fills array at100 independently of the orders
 * page. Reuse its existing exact VWAP/fee helper on bounded25-order pages
 * (at most75 fills), never calculate totals from a truncated fill population.
 * In-process fixture reads only; no network or product adapter is invoked.
 */
function linkedOrderFacts(body: unknown): unknown {
  if (!object(body) || "error" in body || !object(body.data) || !Array.isArray(body.data.orders) ||
      !Array.isArray(body.data.fills) || body.data.fills.length < 100) return body;
  const wanted = new Set(body.data.orders.map((order: Obj) => order.order_id));
  const facts = new Map<string, Obj>();
  let cursor: string | null = null;
  for (let pages = 0; pages < 60; pages++) {
    const query = new URLSearchParams({ limit: "25" });
    if (cursor) query.set("after", cursor);
    const response = answerFixtureRequest({ method: "GET", path: "/api/v1/execution/screens/blotter",
      search: query.toString(), headers: {}, body: null }, { ...V2_OPTIONS, simulated: true });
    const source = response?.body as Obj;
    if (response?.status !== 200 || !object(source?.data) || !Array.isArray(source.data.orders)) break;
    for (const order of source.data.orders) if (wanted.has(order.order_id)) facts.set(order.order_id, order);
    cursor = source.data.page?.next_cursor ?? null;
    if (!cursor || facts.size === wanted.size) break;
  }
  const keys = ["average_fill_price", "filled_quantity", "fee", "fee_currency"];
  return { ...body, data: { ...body.data, orders: body.data.orders.map((order: Obj) => {
    const source = facts.get(order.order_id);
    const out = { ...order };
    for (const key of keys) delete out[key];
    if (!source || source.account_id !== order.account_id || source.mode !== order.mode ||
        source.venue !== order.venue || source.client_order_id !== order.client_order_id) return out;
    for (const key of keys) if (key in source) out[key] = source[key];
    return out;
  }) } };
}
