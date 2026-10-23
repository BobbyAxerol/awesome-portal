import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { managerSeriesQuery, managerSeriesResponse } from "../../../apps/control-api/src/execution-v2/manager-series.contract";
import { managerSeriesPublication } from "../../../apps/control-api/src/execution-v2/manager-series-publication.contract";

// WP-K slice 1: ALPHA subjects and the DRAWDOWN metric in Zod, JSON Schema, OpenAPI and the new canonical fixtures.
const root = resolve(__dirname, "..");
const load = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const schema = load("schemas/execution-manager-series.v1.schema.json");
const api = load("openapi/execution-manager-series.openapi.json");
const ajv = new Ajv2020({ strict: true, allErrors: true });
const check = ajv.compile(schema);
const checkStored = ajv.compile({ ...api.components.schemas.ManagerSeriesPublication, $id: "https://schemas.primusspark.com/portal/execution-manager-series-publication.wpk.json" });
const LANE = "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT";
const fixture = (name: string) => load(`fixtures/execution-manager-series${name}.synthetic.valid.json`);
const apply = (body: any, ops: Array<{ path: Array<string | number>; value: unknown }>) => {
  for (const op of ops) op.path.slice(0, -1).reduce((node, key) => node[key], body)[op.path.at(-1) as string] = op.value;
  return body;
};

describe("WP-K slice 1: the published vocabulary", () => {
  it("the schema, OpenAPI and Zod name DRAWDOWN and ALPHA, nothing else added", () => {
    expect(schema.properties.metric.enum).toEqual(["NAV", "NET_PNL", "RETURN", "DRAWDOWN"]);
    expect(schema.properties.series.items.properties.subject.properties.subject_type.enum).toEqual(["FUND", "PORTFOLIO", "ALPHA"]);
    expect(api.components.schemas.ManagerSeriesQuery.properties.metric.enum).toEqual(["NAV", "NET_PNL", "RETURN", "DRAWDOWN"]);
    expect(api.components.schemas.ManagerSeriesQuery.properties.subjects.items.properties.subject_type.enum).toEqual(["FUND", "PORTFOLIO", "ALPHA"]);
    expect(api.components.schemas.ManagerSeriesPublication.properties.binding.properties.subject_type.enum).toEqual(["portfolio", "manager_book", "alpha"]);
  });
});

describe("WP-K slice 1: the new canonical fixtures", () => {
  it.each(["alpha", "drawdown"])("the %s fixture passes Zod and JSON Schema and is TEST_ONLY", name => {
    const sample = fixture("." + name);
    expect(sample.lane).toBe(LANE);
    expect(check(sample.value), JSON.stringify(check.errors)).toBe(true);
    expect(managerSeriesResponse.parse(sample.value)).toEqual(sample.value);
  });
  it("the alpha fixture is two ALPHA subjects aligned in one USDT partition, with the second one's stated gap", () => {
    const { series, comparison } = fixture(".alpha").value;
    expect(series.map((s: any) => [s.subject.subject_type, s.state, s.currency])).toEqual([["ALPHA", "AVAILABLE", "USDT"], ["ALPHA", "AVAILABLE", "USDT"]]);
    expect(comparison).toMatchObject({ state: "ALIGNED" });
    expect(series[1].gaps).toEqual([expect.objectContaining({ reason: "SOURCE_GAP" })]);
  });
  it("the drawdown fixture is a RATIO with a stated scale and no currency, points at or below zero, an alpha beside a portfolio", () => {
    const sample = fixture(".drawdown").value;
    expect(sample.metric).toBe("DRAWDOWN");
    expect(sample.series.map((s: any) => s.subject.subject_type)).toEqual(["ALPHA", "PORTFOLIO"]);
    for (const s of sample.series) {
      expect(s).toMatchObject({ unit: "RATIO", currency: null, ratio_scale: "FRACTION" });
      for (const p of s.points) expect(p.value === "0" || p.value.startsWith("-")).toBe(true);
    }
    expect(sample.comparison).toMatchObject({ state: "ALIGNED", common: { unit: "RATIO", ratio_scale: "FRACTION", currency: null } });
  });
  it("the stored drawdown publication binds an alpha and passes both validators", () => {
    const sample = load("fixtures/execution-manager-series-publication.drawdown.synthetic.valid.json");
    expect(sample.value.binding).toMatchObject({ subject_type: "alpha", metric: "DRAWDOWN" });
    expect(managerSeriesPublication.parse(sample.value)).toEqual(sample.value);
    expect(checkStored(sample.value), JSON.stringify(checkStored.errors)).toBe(true);
  });
  it("the published queries pass Zod", () => {
    const { cases } = load("fixtures/execution-manager-series-query.alpha-drawdown.synthetic.valid.json");
    expect(cases).toHaveLength(2);
    for (const c of cases) expect(managerSeriesQuery.safeParse(c).success).toBe(true);
    expect(cases[1].subjects.map((s: any) => s.subject_type)).toEqual(["ALPHA", "PORTFOLIO"]);
  });
});

describe("WP-K slice 1: the drawdown rules are refused by Zod and by the JSON Schema", () => {
  const rule = load("fixtures/execution-manager-series.drawdown.synthetic.negative.json");
  const bases = { dd: fixture(".drawdown").value, pubDd: load("fixtures/execution-manager-series-publication.drawdown.synthetic.valid.json").value };
  it("is TEST_ONLY and names a code for every case", () => {
    expect(rule.lane).toBe(LANE);
    expect([...rule.cases, ...rule.stored_cases].map((c: any) => c.id)).toEqual([
      "WP-K/drawdown-above-zero", "WP-K/drawdown-as-money", "WP-K/drawdown-without-a-scale", "WP-K/stored-drawdown-above-zero", "WP-K/stored-drawdown-as-money"]);
  });
  it.each(rule.cases.map((c: any) => [c.id, c]))("%s (response)", (_id, c: any) => {
    const body = apply(structuredClone((bases as any)[c.base]), c.ops);
    const zod = managerSeriesResponse.safeParse(body);
    expect(zod.success).toBe(false);
    expect(!zod.success && zod.error.issues.map(i => i.message)).toContain(c.code);
    expect(check(body)).toBe(false);
  });
  it.each(rule.stored_cases.map((c: any) => [c.id, c]))("%s (stored)", (_id, c: any) => {
    const body = apply(structuredClone((bases as any)[c.base]), c.ops);
    const zod = managerSeriesPublication.safeParse(body);
    expect(zod.success).toBe(false);
    expect(!zod.success && zod.error.issues.map(i => i.message)).toContain(c.code);
    expect(checkStored(body)).toBe(false);
  });
  it("a zero and a negative drawdown pass the schema pattern; an unsigned positive does not", () => {
    for (const value of ["0", "0.000", "-0.0123", "-1"]) {
      const body = structuredClone(bases.dd); body.series[0].points[1].value = value;
      expect(check(body), value + JSON.stringify(check.errors)).toBe(true);
    }
    for (const value of ["0.0123", "1", "+0.5"]) {
      const body = structuredClone(bases.dd); body.series[0].points[1].value = value;
      expect(check(body), value).toBe(false);
    }
  });
});
