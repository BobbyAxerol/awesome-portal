// @vitest-environment node
/**
 * FIXTURE_SCALE: deterministic volume that stays additive and honest.
 *
 * In process (no socket): the scale is a setting of the doubles, so the doubles are asked directly.
 * Every page of every generated list is judged against the published schema, the keyset walks are
 * exact, and `small` generates nothing (the equivalence test proves the specs' answers unchanged).
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";

import { answerFixtureRequest, V2_OPTIONS } from "../../e2e/bffAnswerer";
import { resetOverviewDouble } from "../../e2e/bffDoubleOverview";
import { SCALES, addDecimal, fixtureScale, scaled, setFixtureNow, setFixtureScale, sumByCurrency, type ScaleName } from "../../e2e/bffScale";
import { disposeSchemaCheck, violationsOf } from "./schemaCheck";
import { SCHEMAS } from "./routeTable";

afterEach(() => {
  setFixtureScale("small");
  resetOverviewDouble();
});
afterAll(disposeSchemaCheck);

type Json = any;

function get(path: string, search = ""): { status: number; body: Json } {
  const answered = answerFixtureRequest({ method: "GET", path, search, headers: {}, body: null }, V2_OPTIONS);
  if (answered === null) throw new Error(`not served: ${path}`);
  return { status: answered.status, body: answered.body };
}

const EX = "/api/v1/execution";
const schemaOf = (key: string) => SCHEMAS[key]!.ref;

/** Every page of a keyset list, judged and collected. */
function walk(path: string, search: string, pick: (body: Json) => { rows: Json[]; next: string | null }, judge?: (body: Json) => void): Json[] {
  const rows: Json[] = [];
  let query = search;
  for (let page = 0; page < 200; page += 1) {
    const { status, body } = get(path, query);
    expect(status, `${path}?${query}`).toBe(200);
    judge?.(body);
    const got = pick(body);
    rows.push(...got.rows);
    if (got.next === null) return rows;
    query = `${search}${search ? "&" : ""}after=${encodeURIComponent(got.next)}`;
  }
  throw new Error(`${path} did not end`);
}

describe("scale", () => {
  it("small generates nothing and says so", () => {
    setFixtureScale("small");
    const universe = scaled();
    expect(universe.alphas).toEqual([]);
    expect(universe.portfolios).toEqual([]);
    expect(universe.bindings).toEqual([]);
    expect(universe.operations).toEqual([]);
    expect(universe.approvals).toEqual([]);
    expect(fixtureScale()).toBe("small");
  });

  it("is the same universe every time: a seed, no clock, no Math.random", () => {
    setFixtureScale("medium");
    const first = JSON.stringify(scaled());
    // A fresh build (the memo is per scale, so switching away and back reuses it): compare with a second scale's build twice.
    setFixtureScale("large");
    const large = JSON.stringify(scaled());
    setFixtureScale("medium");
    expect(JSON.stringify(scaled())).toBe(first);
    expect(large).not.toBe(first);
    const asked = (path: string, search: string) => JSON.stringify(get(path, search).body);
    expect(asked(`${EX}/alphas`, "limit=40")).toBe(asked(`${EX}/alphas`, "limit=40"));
  });

  it("generates no random call and reads no clock", async () => {
    // The generator source is the contract: nothing in it may call these.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const text = readFileSync(resolve(__dirname, "../../e2e/bffScale.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(text).not.toMatch(/Math\.random|Date\.now\(|new Date\(\)/);
  });

  it.each(["medium", "large"] as ScaleName[])("%s: the counts, every page conforming to its schema", (name) => {
    setFixtureScale(name);
    const counts = SCALES[name];

    const fleet = walk(`${EX}/alphas`, "limit=50", (b) => ({ rows: b.page.rows, next: b.page.next_cursor }), (b) => {
      expect(violationsOf(schemaOf("GET /api/v1/execution/alphas"), b).violations.slice(0, 3)).toEqual([]);
    });
    expect(fleet).toHaveLength(counts.alphas);
    expect(new Set(fleet.map((r) => r.alpha_id)).size).toBe(counts.alphas);

    const ops = walk(`${EX}/operations`, "limit=100", (b) => ({ rows: b.page.rows, next: b.page.next_cursor }), (b) => {
      expect(violationsOf(schemaOf("GET /api/v1/execution/operations"), b).violations.slice(0, 3)).toEqual([]);
    });
    expect(ops).toHaveLength(counts.operations);
    expect(new Set(ops.map((r) => r.operation_id)).size).toBe(counts.operations);

    const portfolios = get(`${EX}/portfolios`).body;
    expect(violationsOf(schemaOf("GET /api/v1/execution/portfolios"), portfolios).violations.slice(0, 3)).toEqual([]);
    expect(portfolios.items).toHaveLength(counts.portfoliosShown);
    expect(portfolios.total_portfolios).toBe(counts.portfolios);
    expect(portfolios.truncated).toBe(counts.portfoliosShown < counts.portfolios);

    for (const environment of ["live", "paper", "sandbox"] as const) {
      const rows = walk(`${EX}/broker-bindings`, `environment=${environment}&limit=50`, (b) => ({ rows: b.page.rows, next: b.page.next_cursor }), (b) => {
        expect(violationsOf(schemaOf("GET /api/v1/execution/broker-bindings"), b).violations.slice(0, 3)).toEqual([]);
      });
      expect(rows, environment).toHaveLength(counts.accounts[environment]);
      expect(new Set(rows.map((r) => r.account_id)).size).toBe(rows.length);
    }

    const blotter = walk(`${EX}/screens/blotter`, "limit=200", (b) => ({ rows: b.data.orders, next: b.data.page.next_cursor }));
    expect(blotter).toHaveLength(counts.blotterOrders);
    expect(new Set(blotter.map((o) => o.order_id)).size).toBe(counts.blotterOrders);

    const approvals = walk(`${EX}/governance/approvals`, "limit=40", (b) => ({ rows: b.page.rows, next: b.page.next_cursor }));
    expect(approvals).toHaveLength(counts.approvals);
    expect(new Set(approvals.map((r) => r.id)).size).toBe(counts.approvals);
  });

  it("large: a truncated portfolio register says it is truncated", () => {
    setFixtureScale("large");
    const body = get(`${EX}/portfolios`).body;
    expect(body.items).toHaveLength(60);
    expect(body.total_portfolios).toBe(75);
    expect(body.truncated).toBe(true);
  });

  it.each(["medium", "large"] as ScaleName[])("%s: money is exact and per currency, null stays null", (name) => {
    setFixtureScale(name);
    const decimal = /^-?\d+(\.\d+)?$/;
    const fleet = walk(`${EX}/alphas`, "limit=50", (b) => ({ rows: b.page.rows, next: b.page.next_cursor }));
    const summary = get(`${EX}/alphas`, "limit=1").body.summary;
    const allDeployments = fleet.flatMap((r) => r.deployments as Json[]);
    for (const d of allDeployments) {
      for (const field of ["allocation", "balance_total", "balance_free", "balance_locked", "realized_pnl", "unrealized_pnl", "net_pnl", "exposure"]) {
        expect(d[field], `${d.deployment_id}.${field}`).toMatch(decimal);
        expect(d[field]).not.toBe("-0.00");
      }
      // net is the exact sum of the two parts; locked + free is the total.
      expect(d.net_pnl).toBe(addDecimal(d.realized_pnl, d.unrealized_pnl));
      expect(addDecimal(addDecimal(d.balance_free, d.balance_locked), `-${d.balance_total}`)).toMatch(/^0(\.0+)?$/);
    }
    // The summary line for each currency is the exact sum of the rows, and no currency is merged into another.
    const expectedAllocations = sumByCurrency(fleet.flatMap((r) => r.allocations as { currency: string; value: string }[]));
    expect(summary.allocation_by_currency).toEqual(expectedAllocations);
    expect(new Set(summary.allocation_by_currency.map((e: { currency: string }) => e.currency)).size).toBe(summary.allocation_by_currency.length);
    const pnl = summary.current_position_pnl_by_currency as { currency: string; realized: string; unrealized: string; net: string }[];
    for (const line of pnl) expect(line.net).toBe(addDecimal(line.realized, line.unrealized));
    // Nothing is made up for the unowned and the undeployed.
    for (const row of fleet.filter((r) => r.health === "RESEARCH_ONLY")) {
      expect(row.deployments).toEqual([]);
      expect(row.allocations).toEqual([]);
    }
    // A portfolio's own total is the exact sum of its deployments, in its base currency.
    const portfolios = get(`${EX}/portfolios`).body.items as Json[];
    for (const item of portfolios.filter((p) => p.portfolio_id.startsWith("pf_scale_"))) {
      const mine = allDeployments.filter((d) => d.portfolio_id === item.portfolio_id);
      expect(item.allocated_by_currency).toEqual(sumByCurrency(mine.map((d) => ({ currency: d.currency, value: d.allocation }))));
    }
  });

  it("the generated operations are relative to the fixture clock, with microsecond instants", () => {
    setFixtureNow("2026-10-19T09:00:00Z");
    setFixtureScale("large");
    const newest = Date.parse("2026-10-19T09:00:00Z");
    const generated = scaled().operations;
    expect(generated.length).toBe(SCALES.large.operations - 13);
    for (const op of generated) {
      expect(op.at).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
      expect(Date.parse(op.at)).toBeLessThan(newest);
    }
    setFixtureNow("2026-08-22T13:00:00Z");
  });
});
