import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

// WP-K slice 5: the alpha lifecycle sibling read (inbox C->K 3, 4, 5 and per-venue Net PnL). Contract only: no producer, nothing serves the route.
const root = resolve(__dirname, "..");
const load = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const schema = load("schemas/execution-alpha-lifecycle.v1.schema.json");
const api = load("openapi/execution-alpha-lifecycle.openapi.json");
const check = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const fixture = (name: string) => load(`fixtures/execution-alpha-lifecycle.${name}.synthetic.valid.json`);
const LANE = "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT";

describe("WP-K slice 5: alpha lifecycle", () => {
  it("publishes one named read whose 200 body is the schema, and says it has no producer", () => {
    const op = api.paths["/api/v1/execution/alphas/{alpha_id}/lifecycle"].get;
    expect(op.operationId).toBe("executionAlphaLifecycleGetV1");
    expect(op.description).toContain("CONTRACT ONLY");
    expect(op.responses["200"].content["application/json"].schema.$ref).toBe("#/components/schemas/AlphaLifecycle");
    expect(api.components.schemas.AlphaLifecycle).toEqual(Object.fromEntries(Object.entries(schema).filter(([k]) => !["$schema", "$id"].includes(k))));
  });
  it.each(["published", "not-read", "no-source", "regime-absent"])("the %s fixture is TEST_ONLY and conforms", name => {
    const sample = fixture(name);
    expect(sample.lane).toBe(LANE);
    expect(check(sample.value), JSON.stringify(check.errors)).toBe(true);
  });
  it("covers the six stages, criteria with observed values, decider and actor, a receipt, the five event kinds, and Net PnL per venue in its own currency", () => {
    const { stages, events, venue_net_pnl: venues } = fixture("published").value;
    expect(stages.map((s: any) => s.stage)).toEqual(["R1", "R2", "PAPER", "SANDBOX", "CANARY", "LIVE"]);
    expect(stages[4]).toMatchObject({ state: "CURRENT", criteria: { met: 6, total: 7 }, decided_by: null, blocked_reason: "Criterion 7 of 7 is not met" });
    expect(stages[2].criteria.items[0]).toMatchObject({ observed: "70.0", threshold: "60.0", met: true });
    expect(stages[2]).toMatchObject({ decider_role: "Manager", decided_by: "TEST_ONLY:actor-1", receipt_ref: "TEST_ONLY:receipt-paper" });
    expect(new Set(events.items.map((e: any) => e.kind))).toEqual(new Set(["stage", "decision", "incident", "recall", "flow"]));
    expect(venues.map((v: any) => [v.venue, v.currency])).toEqual([["BINANCE", "USDT"], ["OKX", "USDT"], ["DERIBIT", "BTC"]]);
    expect(venues.every((v: any) => typeof v.net_pnl === "string")).toBe(true);
  });
  it("null (source not read) and omitted (no owning source) are different published answers; an absent regime fit carries no number", () => {
    const notRead = fixture("not-read").value, none = fixture("no-source").value, absent = fixture("regime-absent").value;
    for (const key of ["stages", "events", "regime_fit", "venue_net_pnl"]) { expect(notRead[key]).toBeNull(); expect(key in none).toBe(false); }
    expect(absent.regime_fit).toEqual({ state: "NOT_PUBLISHED", ratio_scale: null, value: null, reason_code: "INSUFFICIENT_DATA" });
  });
  const rule = load("fixtures/execution-alpha-lifecycle.synthetic.negative.json");
  it.each(rule.cases.map((c: any) => [c.id, c]))("%s is refused", (_id, c: any) => {
    const body = structuredClone(load(`fixtures/${rule.bases[c.base]}`).value);
    for (const op of c.ops) {
      const holder = op.path.slice(0, -1).reduce((node: any, key: string | number) => node[key], body);
      if (op.op === "delete") delete holder[op.path.at(-1)]; else holder[op.path.at(-1)] = op.value;
    }
    expect(check(body)).toBe(false);
  });
});
