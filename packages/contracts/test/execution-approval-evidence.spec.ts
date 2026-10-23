import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

// WP-K slice 2: the approval evidence sibling read (inbox E->K 1-5). Contract only: no producer exists, nothing serves the route.
const root = resolve(__dirname, "..");
const load = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const schema = load("schemas/execution-approval-evidence.v1.schema.json");
const api = load("openapi/execution-approval-evidence.openapi.json");
const check = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
const fixture = (name: string) => load(`fixtures/execution-approval-evidence.${name}.synthetic.valid.json`);
const LANE = "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT";

describe("WP-K slice 2: approval evidence", () => {
  it("publishes one named read whose 200 body is the schema, and says it has no producer", () => {
    const op = api.paths["/api/v1/execution/governance/approvals/{approval_id}/evidence"].get;
    expect(op.operationId).toBe("executionApprovalEvidenceGetV1");
    expect(op.description).toContain("CONTRACT ONLY");
    expect(op.responses["200"].content["application/json"].schema.$ref).toBe("#/components/schemas/ApprovalEvidence");
    expect(api.components.schemas.ApprovalEvidence).toEqual(Object.fromEntries(Object.entries(schema).filter(([k]) => !["$schema", "$id"].includes(k))));
  });
  it.each(["published", "not-read", "no-source", "drawdown"])("the %s fixture is TEST_ONLY and conforms", name => {
    const sample = fixture(name);
    expect(sample.lane).toBe(LANE);
    expect(check(sample.value), JSON.stringify(check.errors)).toBe(true);
  });
  it("null (source not read) and omitted (no owning source) are different published answers, and a true zero is a value", () => {
    const published = fixture("published").value, notRead = fixture("not-read").value, none = fixture("no-source").value;
    expect(published.obligations_after_approval.working_orders).toBe(0);
    for (const key of ["prior_economic_history", "evidence_diff", "obligations_after_approval", "receipt_preview"]) {
      expect(notRead[key]).toBeNull();
      expect(key in none).toBe(false);
    }
    expect(published.read_at_ms).toBeGreaterThan(0);
  });
  const rule = load("fixtures/execution-approval-evidence.synthetic.negative.json");
  it.each(rule.cases.map((c: any) => [c.id, c]))("%s is refused", (_id, c: any) => {
    const body = structuredClone(load(`fixtures/${rule.bases[c.base]}`).value);
    for (const op of c.ops) {
      const holder = op.path.slice(0, -1).reduce((node: any, key: string | number) => node[key], body);
      if (op.op === "delete") delete holder[op.path.at(-1)]; else holder[op.path.at(-1)] = op.value;
    }
    expect(check(body)).toBe(false);
  });
});
