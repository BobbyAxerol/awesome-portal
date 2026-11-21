/** Private C5 proposal; existing contracts AJV/Vitest harness, NOT_RUN. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { workflowCriteriaCapsules, workflowRecordedPortal } from "../../../apps/control-api/src/execution-v2/workflow.contract";
const root = resolve(__dirname, ".."), load = (p: string) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
const schema = load("schemas/execution-workflows.v1.schema.json"), api = load("openapi/execution-workflows.openapi.json");
const fixture = load("fixtures/execution-workflows.synthetic.valid.json");
const ajv = new Ajv2020({ strict: false, allErrors: true }); ajv.addSchema(schema);
const validate = (name: string, value: unknown) => ajv.getSchema(`${schema.$id}#/$defs/${name}`)!(value);
const story = (key: string) => structuredClone(fixture.cases.find((v: any) => v.id === key).response);
const runtime = { WorkflowCriteriaCapsules: workflowCriteriaCapsules, WorkflowRecordedPortal: workflowRecordedPortal };
const both = (name: keyof typeof runtime, value: unknown, expected: boolean) => {
  expect(validate(name, value)).toBe(expected); expect(runtime[name].safeParse(value).success).toBe(expected);
};

describe("C5 schema-only consumer handoff", () => {
  it("retains no mounted endpoint and TEST_ONLY authority", () => {
    expect(api.paths).toEqual({}); expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(fixture.production_config).toBe(false);
    for (const name of Object.keys(runtime)) expect(api.components.schemas[name]).toBeDefined();
  });
  it.each(fixture.cases.filter((v: any) => v.id.startsWith("W08-C5-")))(
    "$id validates against the SAME generated and runtime finite contract", (v: any) => {
      both(v.schema, v.response, true);
      both(v.schema, { ...v.response, response_json: {} }, false);
    });
  it("rejects Paper display relabel, private scalar, panel coverage and absent-reason forgery in both consumers", () => {
    const base = story("W08-C5-CRITERIA-paper_exit");
    for (const display_class of ["CAUTION", "FAIL", "STALE", "NO_VERDICT"])
      both("WorkflowCriteriaCapsules", { ...base, criteria: [{ ...base.criteria[0], display_class }, ...base.criteria.slice(1)] }, false);
    const money = structuredClone(base); money.criteria[0].threshold_value.value = "0.000000000000000001";
    both("WorkflowCriteriaCapsules", money, false);
    const badPoll = structuredClone(base); badPoll.panels[1].poll_interval_ms = 1000;
    both("WorkflowCriteriaCapsules", badPoll, false);
    const missing = story("W08-C5-CRITERIA-r2");
    both("WorkflowCriteriaCapsules", { ...missing, reason_code: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" }, false);
    both("WorkflowCriteriaCapsules", { ...base, universal_denominator: 7 }, false);
  });
  it("Sandbox exact seven-step set is local to Sandbox and no evidence is fabricated", () => {
    const base = story("W08-C5-CRITERIA-sandbox");
    const duplicate = structuredClone(base); duplicate.criteria[1].original.step_key = duplicate.criteria[0].original.step_key;
    both("WorkflowCriteriaCapsules", duplicate, false);
    const missing = structuredClone(base); missing.criteria.pop(); both("WorkflowCriteriaCapsules", missing, false);
    const forged = structuredClone(base); forged.criteria[6].original.evidence_id = "TEST_ONLY:invented";
    both("WorkflowCriteriaCapsules", forged, false);
    const stale = structuredClone(base); stale.criteria[0].display_class = "STALE";
    both("WorkflowCriteriaCapsules", stale, false);
    const evidence = structuredClone(base); evidence.criteria[6].evidence = {
      availability: "AVAILABLE", kind: "PORTAL_EVIDENCE_ID", value: "TEST_ONLY:invented", reason_code: null };
    both("WorkflowCriteriaCapsules", evidence, false);
    for (const count of [0, 1, 8]) {
      const p = story("W08-C5-CRITERIA-paper_exit");
      p.criteria = Array.from({ length: count }, (_, i) => ({ ...p.criteria[0], original: {
        ...p.criteria[0].original, finding_id: "TEST_ONLY:f" + i, ordinal: i } }));
      both("WorkflowCriteriaCapsules", p, true);
    }
  });
  it("recorded-root structural invariants survive generation", () => {
    const s = story("W08-C5-RECORDED-sandbox"); s.certification.submitted_at_ms = null;
    both("WorkflowRecordedPortal", s, false);
    const p = story("W08-C5-RECORDED-paper_exit_extended"); p.review.extension_days = null;
    both("WorkflowRecordedPortal", p, false);
    const c = story("W08-C5-RECORDED-canary"); c.envelope.previous_envelope_id = "TEST_ONLY:parent";
    both("WorkflowRecordedPortal", c, false);
    const r = story("W08-C5-RECORDED-r2"); r.approval.gate = "PAPER_EXIT";
    both("WorkflowRecordedPortal", r, false);
    both("WorkflowRecordedPortal", { ...r, dispatch_enabled: true }, false);
  });
  it("preserves code-point text bounds and safe integer time/version limits", () => {
    const base = story("W08-C5-CRITERIA-paper_exit");
    both("WorkflowCriteriaCapsules", { ...base, evaluation_formula_version: "😀".repeat(191) }, true);
    both("WorkflowCriteriaCapsules", { ...base, evaluation_formula_version: "😀".repeat(192) }, false);
    both("WorkflowCriteriaCapsules", { ...base, evaluation_formula_version: "TEST_ONLY:\u0000" }, false);
    const r = story("W08-C5-RECORDED-r2"); r.approval.approval_version = 0;
    both("WorkflowRecordedPortal", r, false);
    r.approval.approval_version = 1; r.observed_at_ms = Number.MAX_SAFE_INTEGER + 1;
    both("WorkflowRecordedPortal", r, false);
  });
  it("documents genuine runtime-only equality/joins/time comparisons without a false parity claim", () => {
    const p = story("W08-C5-CRITERIA-paper_exit"); p.criteria[0].original.panel_id = "TEST_ONLY:unknown";
    const s = story("W08-C5-CRITERIA-sandbox"); s.criteria[0].evidence.value = "TEST_ONLY:wrong-evidence";
    const r = story("W08-C5-RECORDED-r2"); r.approval.updated_at_ms = r.approval.created_at_ms - 1;
    for (const [name, value] of [["WorkflowCriteriaCapsules", p], ["WorkflowCriteriaCapsules", s], ["WorkflowRecordedPortal", r]] as const) {
      expect(runtime[name].safeParse(value).success).toBe(false);
      expect(validate(name, value)).toBe(true); // Ordinary JSON Schema has no sibling equality/join.
      expect(api.components.schemas[name].$comment).toContain("Runtime additionally");
    }
  });
});
