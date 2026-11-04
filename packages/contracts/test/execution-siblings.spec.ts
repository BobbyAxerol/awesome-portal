import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

// WP-K second pass: twelve small additive sibling reads (GAP-3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15, 16), generated from one definition each.
// Four routes have a source-dark HTTP refusal; none has a positive producer.
// Other siblings remain contract-only. This suite judges PUBLISHED files.
const root = resolve(__dirname, "..");
const load = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const index = load("fixtures/execution-siblings.index.json").siblings as Array<{ name: string; gap: string; schema: string; route: string; valid: string[]; post: string | null }>;
const LANE = "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT";
const apply = (body: any, ops: Array<{ op: string; path: Array<string | number>; value?: unknown }>) => {
  for (const op of ops) {
    const holder = op.path.slice(0, -1).reduce((node: any, key) => node[key], body);
    if (op.op === "delete") delete holder[op.path.at(-1) as string]; else holder[op.path.at(-1) as string] = op.value;
  }
  return body;
};

describe("WP-K siblings: the index", () => {
  it("names the fourteen reads and the gaps they answer", () => {
    expect(index.map((s) => s.gap)).toEqual(["GAP-3", "GAP-4", "GAP-5", "GAP-6", "GAP-9", "GAP-11", "GAP-12", "GAP-15", "GAP-13", "GAP-14", "GAP-16", "GAP-2", "GAP-10", "GAP-10"]);
  });
});

describe.each(index.map((s) => [s.name, s] as const))("%s", (name, entry) => {
  const schema = load(`schemas/${entry.schema}`);
  const api = load(`openapi/execution-${name}.openapi.json`);
  const check = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  it("publishes one named GET whose 200 body matches its schema and producer disposition", () => {
    const op = api.paths[entry.route].get;
    const dark = ["order-detail", "account-profile", "reconciliation", "obligations"].includes(name);
    expect(op.description).toContain(name === "account-profile" ? "native HTTP custody" : dark ? "Source-dark route" : "CONTRACT ONLY");
    if (dark) expect(op.responses["403"]).toBeDefined();
    if (name === "account-profile") expect(op.responses["409"]).toBeDefined();
    expect(op.responses["200"].content["application/json"].schema.$ref).toMatch(/^#\/components\/schemas\//);
    expect(Object.values(api.components.schemas).some((s) => JSON.stringify(s) === JSON.stringify(Object.fromEntries(Object.entries(schema).filter(([k]) => !["$schema", "$id"].includes(k)))))).toBe(true);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.schema_version.const).toBe(`portal.execution.${name}.v1`);
    expect(schema.properties.record_authority.const).toBe("PORTAL_PROJECTION");
  });
  it.each(entry.valid)("the %s fixture is TEST_ONLY and conforms", (variant) => {
    const sample = load(`fixtures/execution-${name}.${variant}.synthetic.valid.json`);
    expect(sample.lane).toBe(LANE);
    expect(check(sample.value), JSON.stringify(check.errors)).toBe(true);
  });
  const rule = load(`fixtures/execution-${name}.synthetic.negative.json`);
  it.each(rule.cases.map((c: any) => [c.id, c]))("refuses %s", (_id, c: any) => {
    const body = apply(structuredClone(load(`fixtures/${rule.bases[c.base]}`).value), c.ops);
    if (c.refused_by === "READER_ONLY") expect(c.refused_by).toBe("READER_ONLY");
    else expect(check(body)).toBe(false);
  });
});
