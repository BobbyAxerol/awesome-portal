import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

// WP-K slice 7 (inbox D->K 1): the command bar's entity search index. Contract only: no producer, nothing serves the route.
const root = resolve(__dirname, "..");
const load = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const schema = load("schemas/execution-entity-search.v1.schema.json");
const api = load("openapi/execution-entity-search.openapi.json");
const check = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const LANE = "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT";

describe("WP-K slice 7: entity search", () => {
  it("publishes one named read whose 200 body is the schema, with the closed query and no producer", () => {
    const op = api.paths["/api/v1/execution/search"].get;
    expect(op.operationId).toBe("executionEntitySearchGetV1");
    expect(op.description).toContain("CONTRACT ONLY");
    expect(op.parameters.map((p: { name: string }) => p.name)).toEqual(["q", "kinds", "limit", "workspace_id"]);
    expect(op.parameters.filter((p: { required: boolean }) => p.required).map((p: { name: string }) => p.name)).toEqual(["q"]);
    expect(api.components.schemas.EntitySearch).toEqual(Object.fromEntries(Object.entries(schema).filter(([k]) => !["$schema", "$id"].includes(k))));
  });
  it.each(["hit", "none"])("the %s fixture is TEST_ONLY and conforms", name => {
    const sample = load(`fixtures/execution-entity-search.${name}.synthetic.valid.json`);
    expect(sample.lane).toBe(LANE);
    expect(check(sample.value), JSON.stringify(check.errors)).toBe(true);
  });
  it("a true zero count, an uncounted group (null) and a group with rows are three different answers; the six kinds are the whole vocabulary", () => {
    const { groups } = load("fixtures/execution-entity-search.hit.synthetic.valid.json").value;
    expect(groups.map((g: any) => [g.kind, g.total_matched, g.rows.length])).toEqual([["alpha", 4, 2], ["portfolio", 0, 0], ["operation", null, 1]]);
    expect(schema.properties.query.properties.kinds.items.enum).toEqual(["alpha", "portfolio", "account", "operation", "incident", "approval"]);
  });
  const rule = load("fixtures/execution-entity-search.synthetic.negative.json");
  it.each(rule.cases.map((c: any) => [c.id, c]))("%s is refused", (_id, c: any) => {
    const body = structuredClone(load(`fixtures/${rule.bases[c.base]}`).value);
    for (const op of c.ops) {
      const holder = op.path.slice(0, -1).reduce((node: any, key: string | number) => node[key], body);
      if (op.op === "delete") delete holder[op.path.at(-1)]; else holder[op.path.at(-1)] = op.value;
    }
    expect(check(body)).toBe(false);
  });
});
