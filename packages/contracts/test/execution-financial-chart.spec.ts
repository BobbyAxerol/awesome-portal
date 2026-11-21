/** S3-U3 (BE-P3): the equity-chart wire contract for a deployment subject, and the deployment query-analytics fixture. */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
for (const name of readdirSync(resolve(root, "schemas"))) ajv.addSchema(load(`schemas/${name}`));
const chart = ajv.getSchema("https://schemas.primusspark.com/portal/execution-financial-chart.v1.schema.json")!;
const analytics = ajv.getSchema("https://schemas.primusspark.com/portal/execution-query-analytics.v1.schema.json")!;
const fixture = load("fixtures/execution-financial-chart.synthetic.valid.json");
const named = (name: string) => structuredClone(fixture.cases.find((c: { name: string }) => c.name === name).value);

describe("equity-chart contract, deployment subject", () => {
  it("every canonical case validates", () => {
    expect(fixture.cases.map((c: { name: string }) => c.name)).toEqual([
      "deployment_equity_ready", "deployment_equity_downsampled", "deployment_exposure_long_ready", "deployment_empty",
      "deployment_metric_not_retained", "deployment_mirror_reads_disabled", "deployment_scoped_v2"]);
    for (const c of fixture.cases) expect(chart(c.value), `${c.name} ${JSON.stringify(chart.errors)}`).toBe(true);
  });

  it("refuses the shapes that would turn absence into data", () => {
    const bad: Array<[string, (v: any) => void]> = [
      ["READY without data", (v) => { v.panel.data = null; }],
      ["UNAVAILABLE carrying data", (v) => { v.panel.state = "UNAVAILABLE"; v.panel.reason_code = "X"; }],
      ["UNAVAILABLE without a reason", (v) => { v.panel.state = "UNAVAILABLE"; v.panel.data = null; v.panel.reason_code = null; }],
      ["a gap invented", (v) => { v.panel.coverage.gaps = [{ from_ms: 1, to_ms: 2, reason_code: "SOURCE_GAP" }]; }],
      ["number point", (v) => { v.panel.data.series[0].points[0][1] = 100000; }],
      ["exponent point", (v) => { v.panel.data.series[0].points[0][1] = "1e5"; }],
      ["three-element point", (v) => { v.panel.data.series[0].points[0].push("x"); }],
      ["unknown metric", (v) => { v.metric = "sharpe"; }],
      ["unknown subject kind", (v) => { v.subject.kind = "binding"; }],
      ["claimed preserved gaps", (v) => { v.panel.data.sampling.preserves_gaps = true; }],
      ["stray key", (v) => { v.total = "1"; }],
    ];
    for (const [name, mutate] of bad) {
      const value = named("deployment_equity_ready"); mutate(value);
      expect(chart(value), name).toBe(false);
    }
  });

  it("an unavailable deployment case carries no series and a typed reason", () => {
    for (const name of ["deployment_metric_not_retained", "deployment_mirror_reads_disabled"]) {
      const value = named(name);
      expect(value.panel.data).toBeNull();
      expect(value.panel.coverage.returned_count).toBe(0);
      expect(typeof value.panel.reason_code).toBe("string");
    }
  });

  it("the OpenAPI document points at the schema and lists the strict query", () => {
    const doc = load("openapi/execution-financial-chart.openapi.json");
    const op = doc.paths["/api/v1/execution/views/equity-chart"].get;
    expect(op.parameters.map((p: { name: string }) => p.name)).toEqual(
      ["workspace_id", "environment", "subject_kind", "subject_id", "metric", "from_ms", "to_ms", "viewport_px", "include_benchmark"]);
    expect(op.responses["200"].content["application/json"].schema.$ref).toBe("../schemas/execution-financial-chart.v1.schema.json");
  });
});

describe("deployment query-analytics fixture", () => {
  it("validates as the published N25 envelope for a DEPLOYMENT subject", () => {
    const value = load("fixtures/execution-query-analytics.deployment.valid.json");
    expect(value.analytics.subject_kind).toBe("DEPLOYMENT");
    expect(analytics(value), JSON.stringify(analytics.errors)).toBe(true);
    const doc = load("openapi/execution-query-analytics.openapi.json");
    expect(Object.keys(doc.paths)).toContain("/api/v1/execution/deployments/{subjectId}/query-analytics");
  });
});
