import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { managerSeriesQuery, managerSeriesResponse, managerSeriesEntry, managerSeriesComparison } from "../../../apps/control-api/src/execution-v2/manager-series.contract";
import { canonicalManagerZero } from "../../../apps/control-api/src/execution-v2/manager-dataset-invariants";
import { managerSeriesPublication } from "../../../apps/control-api/src/execution-v2/manager-series-publication.contract";

// BE-P4 / FE-013 + FE-033: the Manager series read in Zod, JSON Schema, OpenAPI and canonical fixtures.
const root = resolve(__dirname, "..");
const load = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const api = load("openapi/execution-manager-series.openapi.json");
const schema = load("schemas/execution-manager-series.v1.schema.json");
const ajv = new Ajv2020({ strict: true, allErrors: true });
const check = ajv.compile(schema);
const fixture = (name: string) => load(`fixtures/execution-manager-series${name}.synthetic.valid.json`);
const LANE = "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT";

describe("BE-P4 FE-013/FE-033 generated Manager series contract", () => {
  it("publishes one closed named read with the schema as its 200 body", () => {
    const op = api.paths["/api/v1/execution/manager/series"].get;
    expect(op.operationId).toBe("executionManagerSeriesGetV1");
    expect(op.responses["200"].content["application/json"].schema.$ref).toBe("#/components/schemas/ManagerSeries");
    expect(op.parameters.map((p: { name: string }) => p.name)).toEqual(["environment", "workspace_id", "metric", "subjects", "window", "economic_partition"]);
    expect(op.parameters.filter((p: { required: boolean }) => p.required).map((p: { name: string }) => p.name)).toEqual(["environment", "metric", "subjects", "window"]);
    expect(Object.keys(op.responses).sort()).toEqual(["200", "400", "401", "404", "409", "503"]);
    expect(api.components.schemas.ManagerSeries).toEqual(Object.fromEntries(Object.entries(schema).filter(([k]) => !["$schema", "$id"].includes(k))));
    expect(api.components.schemas.ManagerSeriesEntry.properties.state.enum).toEqual(["AVAILABLE", "EMPTY", "UNAVAILABLE"]);
  });

  it.each(["populated", "empty", "unavailable", "currency-mixed"])("the %s fixture passes Zod and JSON Schema and is TEST_ONLY", name => {
    const sample = fixture("." + name);
    expect(sample.lane).toBe(LANE);
    expect(check(sample.value), JSON.stringify(check.errors)).toBe(true);
    expect(managerSeriesResponse.parse(sample.value)).toEqual(sample.value);
  });

  it("covers every state the FE must draw: aligned, empty, source-not-published, currency-mixed", () => {
    expect(fixture(".populated").value.comparison).toMatchObject({ state: "ALIGNED", transform: "NONE_NO_REBASE_NO_CROSS_CURRENCY_SUM" });
    expect(fixture(".empty").value.series[0]).toMatchObject({ state: "EMPTY", reason_code: "NO_POINTS_PUBLISHED_IN_WINDOW", points: [] });
    const u = fixture(".unavailable").value;
    expect(u.series_source).toEqual({ state: "NOT_PUBLISHED", reason_code: "FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED" });
    expect(u.series.map((s: { reason_code: string }) => s.reason_code)).toEqual(["SERIES_SOURCE_NOT_PUBLISHED", "SERIES_SOURCE_NOT_PUBLISHED"]);
    const m = fixture(".currency-mixed").value;
    expect(m.comparison).toMatchObject({ state: "INCOMPARABLE", reason_code: "CURRENCY_MIXED", common: null, axis_ms: null });
    expect(m.series.map((s: { currency: string }) => s.currency)).toEqual(["USDT", "VND"]);
  });

  it("every populated value is an exact decimal string and carries methodology, window and one currency", () => {
    const { series } = fixture(".populated").value;
    for (const s of series) {
      expect(s.methodology_ref).toBeTruthy(); expect(s.window.from_ms).toBeLessThan(s.window.to_ms); expect(s.currency).toBe("USDT");
      for (const p of s.points) expect(p.value).toMatch(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/);
    }
    expect(series[0].points[0].value).toBe("100.000000000000000001");
  });

  describe("the same tampering is refused by Zod and by the published JSON Schema", () => {
    const base = () => structuredClone(fixture(".populated").value) as any;
    it.each([
      ["a float value", (v: any) => { v.series[0].points[0].value = 100.5; }],
      ["an exponent value", (v: any) => { v.series[0].points[0].value = "1e5"; }],
      ["an AVAILABLE series with no points", (v: any) => { v.series[0].points = []; }],
      ["an AVAILABLE series with a reason", (v: any) => { v.series[0].reason_code = "SERIES_SOURCE_NOT_PUBLISHED"; }],
      ["an AVAILABLE series with no methodology", (v: any) => { v.series[0].methodology_ref = null; }],
      ["an AVAILABLE series with no window", (v: any) => { v.series[0].window = null; }],
      ["MONEY with no currency", (v: any) => { v.series[0].currency = null; }],
      ["a rebase marker", (v: any) => { v.comparison.transform = "REBASED_TO_100"; }],
      ["ALIGNED with a reason", (v: any) => { v.comparison.reason_code = "CURRENCY_MIXED"; }],
      ["ALIGNED without an axis", (v: any) => { v.comparison.axis_ms = null; }],
      ["a source flagged NOT_PUBLISHED with no reason", (v: any) => { v.series_source = { state: "NOT_PUBLISHED", reason_code: null }; }],
      ["a PUBLISHED source with a reason", (v: any) => { v.series_source.reason_code = "FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED"; }],
      ["a fifth subject", (v: any) => { v.series = [...v.series, ...v.series, v.series[0]]; }],
      ["no subject", (v: any) => { v.series = []; }],
      ["an unknown field", (v: any) => { v.series[0].nav_total = "1"; }],
      ["a point as a bare number", (v: any) => { v.series[0].points[0] = 1; }],
    ])("rejects %s", (_name, mutate) => {
      const v = base(); mutate(v);
      expect(managerSeriesResponse.safeParse(v).success).toBe(false);
      expect(check(v)).toBe(false);
    });
    // MD-5 (owner decision C, 2026-10-20): canonical zero on emit. A response that carries a signed zero is refused by both
    // validators; the stored publication (a source document) is not changed and still admits it.
    it.each(["-0", "-0.0", "-0.000000000000000000"])("MD-5 rejects a signed zero point %s in both validators", zero => {
      for (const index of [0, 1]) {
        const v = base(); v.series[1].points[index].value = zero;
        const parsed = managerSeriesResponse.safeParse(v);
        expect(parsed.success).toBe(false);
        expect(!parsed.success && parsed.error.issues.some(i => i.message === "MANAGER_DECIMAL_NEGATIVE_ZERO")).toBe(true);
        expect(check(v)).toBe(false);
      }
    });
    it("MD-5 leaves other points alone and does not change the stored publication", () => {
      for (const value of ["0", "0.00", "-0.5", "-100", "-0.000000000000000001"]) {
        const v = base(); v.series[0].points[1].value = value;
        expect(managerSeriesResponse.safeParse(v).success, value).toBe(true); expect(check(v), value).toBe(true);
      }
      const stored = structuredClone(fixture("-publication").value); stored.series.points[0].value = "-0.00";
      expect(managerSeriesPublication.safeParse(stored).success).toBe(true);
      expect(api.components.schemas.ManagerSeriesPublication.properties.series.properties.points.items.properties.value.pattern)
        .not.toBe(schema.properties.series.items.properties.points.items.properties.value.pattern);
    });
    it("MD-5 publishes the negative cases and the emit examples, judged as stated", () => {
      const negative = load("fixtures/execution-manager-series.negative-zero.synthetic.negative.json");
      expect(negative.lane).toBe(LANE); expect(negative.base).toBe("execution-manager-series.populated.synthetic.valid.json");
      expect(negative.cases.map((c: any) => c.id)).toEqual(["MD-5/negative-zero-point", "MD-5/negative-zero-point-with-a-scale"]);
      for (const c of negative.cases) {
        const v = base();
        for (const op of c.ops) op.path.slice(0, -1).reduce((node: any, key: any) => node[key], v)[op.path.at(-1)] = op.value;
        expect(managerSeriesResponse.safeParse(v).success, c.id).toBe(false); expect(check(v), c.id).toBe(false);
      }
      for (const { source, emitted } of negative.emit_examples) {
        expect(canonicalManagerZero(source), source).toBe(emitted); expect(canonicalManagerZero(emitted), emitted).toBe(emitted);
      }
      expect(schema.properties.series.items.properties.points.items.properties.value.description).toMatch(/Canonical zero/);
    });
    it("rejects NOT_PUBLISHED beside an AVAILABLE series (both validators)", () => {
      const v = base(); v.series_source = { state: "NOT_PUBLISHED", reason_code: "FINANCIAL_NORMALIZED_SERIES_SOURCE_NOT_PUBLISHED" };
      expect(managerSeriesResponse.safeParse(v).success).toBe(false); expect(check(v)).toBe(false);
    });
    // Arithmetic JSON Schema can not state: Zod alone refuses these, so a consumer must run the validator, not only the schema.
    it.each([
      ["descending points", (v: any) => { v.series[0].points.reverse(); }],
      ["a point outside the window", (v: any) => { v.series[0].points[0].ts_ms = v.series[0].window.from_ms - 1; }],
      ["a currency that is not the partition's", (v: any) => { v.series[0].currency = "VND"; }],
      ["a comparison that is not the derived one", (v: any) => { v.comparison.axis_ms = v.comparison.axis_ms.slice(1); }],
      ["mixed currencies called ALIGNED", (v: any) => { const w = v.series[1]; w.currency = "VND"; w.partition.currency = "VND"; }],
    ])("Zod-only: rejects %s", (_name, mutate) => {
      const v = base(); mutate(v);
      expect(managerSeriesResponse.safeParse(v).success).toBe(false);
    });
  });

  it("the entry and the comparison have standalone components that carry the same state rules", () => {
    const entry = ajv.compile(api.components.schemas.ManagerSeriesEntry), comparison = ajv.compile(api.components.schemas.ManagerSeriesComparison);
    const populated = fixture(".populated").value, unavailable = fixture(".unavailable").value;
    expect(entry(populated.series[0])).toBe(true); expect(managerSeriesEntry.safeParse(populated.series[0]).success).toBe(true);
    expect(comparison(populated.comparison)).toBe(true); expect(managerSeriesComparison.safeParse(populated.comparison).success).toBe(true);
    const lying = { ...unavailable.series[0], points: populated.series[0].points };
    expect(entry(lying)).toBe(false); expect(managerSeriesEntry.safeParse(lying).success).toBe(false);
    for (const bad of [{ ...populated.comparison, state: "INCOMPARABLE" }, { ...populated.comparison, state: "UNAVAILABLE" }]) {
      expect(comparison(bad)).toBe(false); expect(managerSeriesComparison.safeParse(bad).success).toBe(false);
    }
  });

  describe("FE-013: the metric fixes the unit and a ratio states its scale", () => {
    const negative = load("fixtures/execution-manager-series.metric-unit.synthetic.negative.json");
    const pub = ajv.compile(api.components.schemas.ManagerSeriesPublication);
    const apply = (body: any, ops: any[]) => { for (const op of ops) op.path.slice(0, -1).reduce((node: any, key: any) => node[key], body)[op.path.at(-1)] = op.value; return body; };
    const messages = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => r.success ? [] : r.error!.issues.map(i => i.message);
    it.each(["return", "return-scale-mixed", "return-scale-not-published"])("the %s fixture passes Zod and JSON Schema", name => {
      const sample = fixture("." + name);
      expect(sample.lane).toBe(LANE); expect(sample.value.metric).toBe("RETURN");
      expect(check(sample.value), JSON.stringify(check.errors)).toBe(true); expect(managerSeriesResponse.parse(sample.value)).toEqual(sample.value);
    });
    it("says what it means: RETURN states its scale, a mixed scale is refused an axis, an unscaled source is typed absence", () => {
      const r = fixture(".return").value;
      expect(r.series.map((s: any) => [s.unit, s.currency, s.ratio_scale])).toEqual([["RATIO", null, "FRACTION"], ["RATIO", null, "FRACTION"]]);
      expect(r.comparison).toMatchObject({ state: "ALIGNED", common: { unit: "RATIO", ratio_scale: "FRACTION", currency: null } });
      expect(fixture(".return-scale-mixed").value.comparison).toMatchObject({ state: "INCOMPARABLE", reason_code: "RATIO_SCALE_MIXED", common: null, axis_ms: null });
      expect(fixture(".return-scale-not-published").value.series[0]).toMatchObject({ state: "UNAVAILABLE", reason_code: "RATIO_SCALE_NOT_PUBLISHED", ratio_scale: null, unit: null, points: [] });
      for (const name of [".populated", ".empty", ".currency-mixed"]) for (const e of fixture(name).value.series) expect(e.ratio_scale).toBeNull();
      expect(schema.properties.series.items.properties.ratio_scale.anyOf[0].enum).toEqual(["FRACTION", "PERCENT"]);
    });
    it("publishes the scale vocabulary in the negative fixture", () => {
      expect(negative.lane).toBe(LANE); expect(Object.keys(negative.scales)).toEqual(["FRACTION", "PERCENT"]);
      expect(negative.cases.map((c: any) => c.id)).toContain("FE-013/nav-as-ratio");
    });
    it.each(JSON.parse(readFileSync(resolve(root, "fixtures/execution-manager-series.metric-unit.synthetic.negative.json"), "utf8")).cases.map((c: any) => [c.id, c]))(
      "response case %s is refused by Zod with its code, and by JSON Schema where it is expressible", (_id: string, c: any) => {
        const v = apply(structuredClone(load(`fixtures/${negative.bases[c.base]}`).value), c.ops);
        expect(messages(managerSeriesResponse.safeParse(v)), c.id).toContain(c.code);
        expect(check(v) === false, c.id).toBe(c.refused_by === "SCHEMA_AND_PRODUCER");
      });
    it.each(JSON.parse(readFileSync(resolve(root, "fixtures/execution-manager-series.metric-unit.synthetic.negative.json"), "utf8")).stored_cases.map((c: any) => [c.id, c]))(
      "stored case %s is refused by Zod with its code and by JSON Schema", (_id: string, c: any) => {
        const v = apply(structuredClone(load(`fixtures/${negative.bases[c.base]}`).value), c.ops);
        expect(messages(managerSeriesPublication.safeParse(v)), c.id).toContain(c.code);
        expect(pub(v), c.id).toBe(false);
      });
    it("the stored RETURN publication passes both validators; an unscaled ratio is admitted only when empty", () => {
      const v = load("fixtures/execution-manager-series-publication.return.synthetic.valid.json").value;
      expect(pub(v), JSON.stringify(pub.errors)).toBe(true); expect(managerSeriesPublication.safeParse(v).success).toBe(true);
      const empty = apply(structuredClone(v), [{ path: ["series", "ratio_scale"], value: null }, { path: ["series", "points"], value: [] }]);
      expect(pub(empty)).toBe(true); expect(managerSeriesPublication.safeParse(empty).success).toBe(true);
    });
    it("the standalone entry component carries the scale rules", () => {
      const entry = ajv.compile(api.components.schemas.ManagerSeriesEntry), r = fixture(".return").value.series[0];
      expect(entry(r)).toBe(true); expect(managerSeriesEntry.safeParse(r).success).toBe(true);
      for (const bad of [{ ...r, ratio_scale: null }, { ...r, currency: "USDT" }, { ...fixture(".populated").value.series[0], ratio_scale: "FRACTION" }]) {
        expect(entry(bad)).toBe(false); expect(managerSeriesEntry.safeParse(bad).success).toBe(false);
      }
    });
    it("a metric-unit mismatch is the same refusal in both validators, whatever the metric", () => {
      for (const [metric, unit] of [["NAV", "RATIO"], ["NET_PNL", "RATIO"], ["RETURN", "MONEY"]] as const) {
        const v = structuredClone(fixture(metric === "RETURN" ? ".return" : ".populated").value);
        v.metric = metric; v.series.forEach((s: any) => { s.unit = unit; s.currency = unit === "MONEY" ? "USDT" : null; s.ratio_scale = unit === "RATIO" ? "FRACTION" : null; });
        expect(managerSeriesResponse.safeParse(v).success, metric + unit).toBe(false); expect(check(v), metric + unit).toBe(false);
      }
    });
  });

  describe("query", () => {
    const q = ajv.compile(api.components.schemas.ManagerSeriesQuery);
    it("accepts the canonical cases in both validators", () => {
      for (const c of fixture("-query").cases) { expect(q(c), JSON.stringify(q.errors)).toBe(true); expect(managerSeriesQuery.safeParse(c).success).toBe(true); }
    });
    it.each([
      ["no window", { environment: "paper", metric: "NAV", subjects: [{ subject_type: "FUND" }] }],
      ["an unknown metric", { environment: "paper", metric: "SHARPE", window: "30D", subjects: [{ subject_type: "FUND" }] }],
      ["no subject", { environment: "paper", metric: "NAV", window: "30D", subjects: [] }],
      ["five subjects", { environment: "paper", metric: "NAV", window: "30D", subjects: ["a", "b", "c", "d", "e"].map(subject_id => ({ subject_type: "PORTFOLIO", subject_id })) }],
      ["a fund with an id", { environment: "paper", metric: "NAV", window: "30D", subjects: [{ subject_type: "FUND", subject_id: "x" }] }],
      ["a portfolio without an id", { environment: "paper", metric: "NAV", window: "30D", subjects: [{ subject_type: "PORTFOLIO" }] }],
      ["an as_of_ms", { environment: "paper", metric: "NAV", window: "30D", subjects: [{ subject_type: "FUND" }], as_of_ms: 1 }],
      ["an unknown subject kind", { environment: "paper", metric: "NAV", window: "30D", subjects: [{ subject_type: "STRATEGY", subject_id: "a" }] }],
    ])("rejects %s", (_name, query) => {
      expect(q(query)).toBe(false); expect(managerSeriesQuery.safeParse(query).success).toBe(false);
    });
  });

  describe("stored publication (what a producer must supply)", () => {
    const pub = ajv.compile(api.components.schemas.ManagerSeriesPublication);
    const sample = () => structuredClone(fixture("-publication").value) as any;
    it("the canonical publication passes both validators", () => {
      expect(fixture("-publication").lane).toBe(LANE);
      expect(pub(sample()), JSON.stringify(pub.errors)).toBe(true); expect(managerSeriesPublication.safeParse(sample()).success).toBe(true);
    });
    it.each([
      ["a missing methodology", (v: any) => { delete v.series.methodology_ref; }, true],
      ["a float", (v: any) => { v.series.points[0].value = 1.5; }, true],
      ["an unknown metric", (v: any) => { v.binding.metric = "SHARPE"; }, true],
      ["descending points", (v: any) => { v.series.points.reverse(); }, false],
      ["a MONEY series in a currency other than its partition's", (v: any) => { v.series.currency = "VND"; }, false],
      ["values from a TEST_ONLY source", (v: any) => { v.provenance.source_qualification = "TEST_ONLY"; }, false],
      ["a window ending after the cutoff", (v: any) => { v.binding.window_end_ms = v.provenance.source_as_of_ms + 1; }, false],
    ])("rejects %s", (_name, mutate, jsonToo) => {
      const v = sample(); mutate(v);
      expect(managerSeriesPublication.safeParse(v).success).toBe(false);
      if (jsonToo) expect(pub(v)).toBe(false);
    });
  });
});
