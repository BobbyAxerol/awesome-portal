import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

// WP-K slice 3 (inbox B->K 3 and 5): the incident detail and the operations audit feed, two sibling reads. Contract only: no producer, nothing serves the routes.
const root = resolve(__dirname, "..");
const load = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const detailSchema = load("schemas/execution-incident-children.v1.schema.json");
const auditSchema = load("schemas/execution-operations-audit.v1.schema.json");
const checks: Record<string, ReturnType<typeof ajv.compile>> = { detail: ajv.compile(detailSchema), audit: ajv.compile(auditSchema) };
const LANE = "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT";
const strip = (schema: Record<string, unknown>) => Object.fromEntries(Object.entries(schema).filter(([k]) => !["$schema", "$id"].includes(k)));

describe("WP-K slice 3: incident detail and operations audit", () => {
  it("each publishes one named read whose 200 body is its schema and says it has no producer", () => {
    const detail = load("openapi/execution-incident-children.openapi.json"), audit = load("openapi/execution-operations-audit.openapi.json");
    const d = detail.paths["/api/v1/execution/operations/incidents/{incident_id}/children"].get, a = audit.paths["/api/v1/execution/operations/audit"].get;
    expect([d.operationId, a.operationId]).toEqual(["executionIncidentChildrenGetV1", "executionOperationsAuditGetV1"]);
    expect(d.description).toContain("CONTRACT ONLY");
    expect(a.description).toContain("CONTRACT ONLY");
    expect(a.parameters.map((p: { name: string }) => p.name)).toEqual(["workspace_id", "limit", "after", "incident_id"]);
    expect(detail.components.schemas.IncidentChildren).toEqual(strip(detailSchema));
    expect(audit.components.schemas.OperationsAudit).toEqual(strip(auditSchema));
  });
  it.each([["detail", "incident-children.published"], ["detail", "incident-children.eligible"], ["detail", "incident-children.not-read"], ["detail", "incident-children.no-source"],
    ["audit", "operations-audit.page"], ["audit", "operations-audit.last"], ["audit", "operations-audit.empty"]])("the %s fixture %s is TEST_ONLY and conforms", (kind, name) => {
    const sample = load(`fixtures/execution-${name}.synthetic.valid.json`);
    expect(sample.lane).toBe(LANE);
    expect(checks[kind](sample.value), JSON.stringify(checks[kind].errors)).toBe(true);
  });
  it("null (not read) and omitted (no source) differ; a true zero blocker list is published when eligible; an audit row may have no receipt", () => {
    const published = load("fixtures/execution-incident-children.published.synthetic.valid.json").value;
    const notRead = load("fixtures/execution-incident-children.not-read.synthetic.valid.json").value;
    const none = load("fixtures/execution-incident-children.no-source.synthetic.valid.json").value;
    for (const key of ["evidence", "assigned_to", "resolution_gate", "timeline", "linked_operations"]) { expect(notRead[key]).toBeNull(); expect(key in none).toBe(false); }
    expect(published.linked_operations[1].original_target).toBeNull();
    expect(load("fixtures/execution-incident-children.eligible.synthetic.valid.json").value.resolution_gate).toEqual({ eligible: true, blocker_codes: [] });
    expect(load("fixtures/execution-operations-audit.page.synthetic.valid.json").value.items[1].receipt_ref).toBeNull();
  });
  const rule = load("fixtures/execution-incident-audit.synthetic.negative.json");
  it.each(rule.cases.map((c: any) => [c.id, c]))("%s is refused", (_id, c: any) => {
    const body = structuredClone(load(`fixtures/${rule.bases[c.base]}`).value);
    for (const op of c.ops) {
      const holder = op.path.slice(0, -1).reduce((node: any, key: string | number) => node[key], body);
      if (op.op === "delete") delete holder[op.path.at(-1)]; else holder[op.path.at(-1)] = op.value;
    }
    expect(checks[c.schema](body)).toBe(false);
  });
});
