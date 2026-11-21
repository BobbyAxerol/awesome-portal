import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
for (const name of readdirSync(join(root, "schemas"))) ajv.addSchema(load(`schemas/${name}`));
const id = "https://schemas.primusspark.com/portal/execution-governance-review-context.v1.schema.json";
const decision = ajv.compile({ $ref: `${id}#/$defs/DecisionContext` });
const capture = ajv.compile({ $ref: `${id}#/$defs/CaptureContext` });
const paperExit = ajv.compile({ $ref: `${id}#/$defs/PaperExitDecisionContext` });
const fixture = load("fixtures/governance-review-context.synthetic.valid.json");

describe("Governance action context canonical and generated contracts", () => {
  it("accepts labelled synthetic examples with unrecorded currency kept null", () => {
    expect(fixture.lane).toBe("SYNTHETIC_CONTRACT_EXAMPLE_NOT_PRODUCT_RECEIPT");
    expect(decision(fixture.r1), JSON.stringify(decision.errors)).toBe(true);
    expect(decision(fixture.r2), JSON.stringify(decision.errors)).toBe(true);
    expect(decision(fixture.live), JSON.stringify(decision.errors)).toBe(true);
    expect(capture(fixture.capture), JSON.stringify(capture.errors)).toBe(true);
    expect(fixture.capture.candidates[0].currency).toBeNull();
  });
  it("rejects R2 aliases, duplicate/unbound evidence and upstream side effects", () => {
    expect(decision({ ...fixture.r2, command_type: "GOVERNANCE_R1_DECISION" })).toBe(false);
    expect(decision({ ...fixture.r2, request_schema_version: fixture.r1.request_schema_version })).toBe(false);
    expect(decision({ ...fixture.live, availability: { state: "AVAILABLE", reason_code: null } })).toBe(false);
    expect(decision({ ...fixture.r1, evidence_hashes: null })).toBe(false);
    expect(decision({ ...fixture.r1, evidence_hashes: [...fixture.r1.evidence_hashes, ...fixture.r1.evidence_hashes] })).toBe(false);
    expect(decision({ ...fixture.r1, source_side_effect_requested: true })).toBe(false);
  });
  it("publishes distinct request/apply/operation schemas for each Portal gate, not R1 aliases", () => {
    const document = load("schemas/execution-governance-portal-decisions.v1.schema.json");
    const source = load("schemas/execution-governance-approval-workflow.v1.schema.json");
    expect(Object.keys(document.$defs)).toHaveLength(15);
    for (const [prefix, route, command] of [["R1", "r1", "GOVERNANCE_R1_DECISION"],
      ["R2", "r2", "GOVERNANCE_R2_DECISION"], ["Live", "live", "GOVERNANCE_LIVE_DECISION"]]) {
      const validate = ajv.compile({ $ref: `${document.$id}#/$defs/${prefix}DecisionPlanRequest` });
      // Reuse the canonical request example; only the named command changes.
      const request = { schema_version: `governance.${route}-decision-plan-request.v1`, workspace_id: "ws_example",
        request_key: "request_example", command_type: command, command_version: 1,
        target: { approval_id: "apr_example" }, expected_approval_version: 2,
        payload: { decision: "APPROVE", reason: "Independent evidence review", conditions: [], evidence_hashes: fixture.r1.evidence_hashes } };
      expect(validate(request), JSON.stringify(validate.errors)).toBe(true);
      expect(validate({ ...request, command_type: "GOVERNANCE_PAPER_EXIT_DECISION" })).toBe(false);
      const plan = document.$defs[`${prefix}DecisionPlan`];
      expect(plan.properties.command_type.const).toBe(command);
      expect(plan.properties.schema_version.const).toBe(`governance.${route}-decision-plan.v1`);
      if (route !== "r1") expect(plan.properties.source_side_effect_requested.const).toBe(false);
    }
    expect(source.$defs.R1DecisionPlanRequest.properties.command_type.const).toBe("GOVERNANCE_R1_DECISION");
  });
  it("rejects invented AVAILABLE captures and enforces input bounds", () => {
    expect(capture({ ...fixture.capture, candidates: [] })).toBe(false);
    expect(capture({ ...fixture.capture, expected_projection_digest: null })).toBe(false);
    expect(capture({ ...fixture.capture, candidates: Array(51).fill(fixture.capture.candidates[0]) })).toBe(false);
    expect(capture({ ...fixture.capture, candidates: [{ ...fixture.capture.candidates[0], risk_grant_id: null }] })).toBe(false);
    expect(capture({ ...fixture.capture, availability: { state: "BLOCKED", reason_code: "CAPTURE_PROJECTION_STALE" } })).toBe(false);
  });
  it("publishes optional contexts on both established reads without requiring them in old fixtures", () => {
    const r1 = load("schemas/execution-governance-approval-workflow.v1.schema.json").$defs.R1ReviewResponse;
    const r2 = load("schemas/execution-governance-r2-review.v1.schema.json");
    expect(r1.properties.data.properties.decision_context.$ref).toContain("review-context.v1.schema.json");
    expect(r2.$defs.review_data.properties.capture_context.$ref).toContain("review-context.v1.schema.json");
    expect(r1.properties.data.required).not.toContain("decision_context");
    expect(r2.$defs.review_data.required).not.toContain("capture_context");
    const generated = readFileSync(join(root, "generated/execution-governance.d.ts"), "utf8");
    expect(generated).toContain("DecisionContext:"); expect(generated).toContain("CaptureContext:");
    expect(generated).toContain("decision_context?:"); expect(generated).toContain("capture_context?:");
    const profileGenerated = readFileSync(join(root, "generated/execution-profile-read.d.ts"), "utf8");
    expect(profileGenerated).toContain("decision_context?:");
    expect(profileGenerated).toContain("capture_context?:");
  });
  it("accepts only the same-origin R1 backlink with an optional scoped workspace query", () => {
    const validate = ajv.compile({ $ref: "https://schemas.primusspark.com/portal/execution-governance-r2-review.v1.schema.json" });
    const response = load("fixtures/execution-governance.r2-review.valid.json");
    expect(validate(response), JSON.stringify(validate.errors)).toBe(true);
    response.data.r1_reference.href += "?workspace_id=ws_example%3Apart";
    expect(validate(response), JSON.stringify(validate.errors)).toBe(true);
    response.data.r1_reference.href += "&redirect=https://outside.example";
    expect(validate(response)).toBe(false);
  });
  it("publishes a separate, optional Paper Exit context without widening the R1/R2 command schema", () => {
    expect(paperExit(fixture.paper_exit), JSON.stringify(paperExit.errors)).toBe(true);
    expect(decision(fixture.paper_exit)).toBe(false);
    const schema = load("schemas/execution-governance-paper-exit.v1.schema.json").$defs.PaperExitReviewResponse;
    expect(schema.properties.data.properties.decision_context.$ref).toContain("#/$defs/PaperExitDecisionContext");
    expect(schema.properties.data.required).not.toContain("decision_context");
    const response = load("fixtures/execution-governance.paper-exit-review.valid.json");
    const validate = ajv.compile({ $ref: "https://schemas.primusspark.com/portal/execution-governance-paper-exit.v1.schema.json#/$defs/PaperExitReviewResponse" });
    expect(validate(response), JSON.stringify(validate.errors)).toBe(true);
    response.data.decision_context = fixture.paper_exit;
    expect(validate(response), JSON.stringify(validate.errors)).toBe(true);
    const generated = readFileSync(join(root, "generated/execution-governance.d.ts"), "utf8");
    expect(generated).toContain("PaperExitDecisionContext:");
    expect(generated).toContain('command_type: "GOVERNANCE_PAPER_EXIT_DECISION";');
  });
  it("rejects Paper Exit unbound/duplicated/oversize hashes, wrong command and incoherent availability", () => {
    expect(paperExit({ ...fixture.paper_exit, evidence_hashes: null })).toBe(false);
    expect(paperExit({ ...fixture.paper_exit, evidence_hashes: Array(129).fill(fixture.paper_exit.evidence_hashes[0]) })).toBe(false);
    expect(paperExit({ ...fixture.paper_exit, evidence_hashes: [...fixture.paper_exit.evidence_hashes, ...fixture.paper_exit.evidence_hashes] })).toBe(false);
    expect(paperExit({ ...fixture.paper_exit, command_type: "GOVERNANCE_R1_DECISION" })).toBe(false);
    expect(paperExit({ ...fixture.paper_exit, availability: { state: "BLOCKED", reason_code: null } })).toBe(false);
    expect(paperExit({ ...fixture.paper_exit, source_side_effect_requested: true })).toBe(false);
    expect(paperExit({ ...fixture.paper_exit, availability: { state: "BLOCKED", reason_code: "EXIT_REVIEW_EXPIRED" } }), JSON.stringify(paperExit.errors)).toBe(true);
  });
});
