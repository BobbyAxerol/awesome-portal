import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { observedOverviewQuery, observedReadResponse } from "../../../apps/control-api/src/execution-v2/observed-read.contract";
import type { components } from "../generated/execution-observed-read";

const load = (path: string) => JSON.parse(readFileSync(resolve(__dirname, "..", path), "utf8"));
const schema = load("schemas/execution-observed-read.v1.schema.json");
const api = load("openapi/execution-observed-read.openapi.json");
const fixtures = load("fixtures/execution-observed-read.synthetic.valid.json");
const invalid = load("fixtures/execution-observed-read.synthetic.invalid.json");
const standalone = new Ajv2020({ strict: false, allErrors: true }).compile(schema);
const served = new Ajv2020({ strict: false, allErrors: true }).compile(api.components.schemas.ObservedOverview);
type Body = components["schemas"]["ObservedOverview"];
const cases = fixtures.cases as Record<string, Body>;
function valid(value: unknown) {
  const a = Boolean(standalone(value)), b = Boolean(served(value));
  expect(a, "standalone/OpenAPI drift").toBe(b);
  expect(observedReadResponse.safeParse(value).success, "server/schema drift").toBe(a);
  return a;
}
describe("Execution observed read publication", () => {
  it("publishes one authenticated closed read, not a qualified Manager replacement", () => {
    expect(Object.keys(api.paths)).toEqual(["/api/v1/execution/observed/overview"]);
    const operation = api.paths["/api/v1/execution/observed/overview"].get;
    expect(operation.operationId).toBe("executionObservedOverviewGetV1");
    expect(operation.security).toEqual([{ PortalSession: [] }]);
    expect(operation["x-strict-query-keys"]).toEqual(["workspace_id", "environment"]);
    expect(operation.parameters.map((p: { name: string }) => p.name)).toEqual(["environment", "workspace_id"]);
    expect(Object.keys(operation.responses).sort()).toEqual(["200", "400", "401", "403", "404", "409", "503"]);
    expect(operation.responses["200"].headers["Cache-Control"].schema.const).toBe("private, no-store");
    expect(operation.description).toContain("feature defaults OFF");
    expect(api.paths["/api/v1/execution/observed/overview"].post).toBeUndefined();
  });
  it.each(Object.keys(cases))("accepts canonical %s without upgrading source trust", name => {
    expect(fixtures.runtime_qualified).toBe(false);
    expect(valid(cases[name]), JSON.stringify(standalone.errors)).toBe(true);
    expect(cases[name].trust.qualified).toBe(false);
    expect(cases[name].source_authority).toBe("EDGE_SNAPSHOT_VIA_CORE");
  });
  it.each(invalid.cases as { name: string; value: unknown }[])("refuses $name across server and wire validators", ({ value }) => {
    expect(valid(value)).toBe(false);
  });
  it("keeps arithmetic and uniqueness checks explicit instead of pretending JSON Schema compares siblings", () => {
    const malformed = [
      (v: Body) => { v.figures[0].accounts_reported = v.figures[0].accounts_total + 1; },
      (v: Body) => { v.figures.push(structuredClone(v.figures[0])); },
      (v: Body) => { v.figures[0].window = { from_ts_ms: 2, to_ts_ms: 1 }; },
      (v: Body) => { v.figures[0].oldest_ts_ms = 2; v.figures[0].newest_ts_ms = 1; },
    ];
    for (const change of malformed) {
      const value = structuredClone(cases.paper); change(value);
      expect(observedReadResponse.safeParse(value).success).toBe(false);
    }
    expect(schema["x-server-invariants"]).toContain("DUPLICATE_FIGURE_PARTITION");
    expect(schema["x-server-invariants"]).toContain("RESPONSE_TOO_LARGE");
  });
  it("refuses unknown/history/URL/query-array selectors and invalid workspace text", () => {
    expect(observedOverviewQuery.parse({})).toEqual({ environment: "paper" });
    for (const query of [{ as_of_ms: 1 }, { url: "https://not-used.invalid" }, { environment: ["paper"] },
      { workspace_id: "ws\nother" }, { environment: "PAPER" }])
      expect(observedOverviewQuery.safeParse(query).success).toBe(false);
  });
});
