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
const fixture = load("fixtures/governance-review-context.synthetic.valid.json");

describe("Governance action context canonical and generated contracts", () => {
  it("accepts labelled synthetic examples with unrecorded currency kept null", () => {
    expect(fixture.lane).toBe("SYNTHETIC_CONTRACT_EXAMPLE_NOT_PRODUCT_RECEIPT");
    expect(decision(fixture.r1), JSON.stringify(decision.errors)).toBe(true);
    expect(decision(fixture.r2), JSON.stringify(decision.errors)).toBe(true);
    expect(capture(fixture.capture), JSON.stringify(capture.errors)).toBe(true);
    expect(fixture.capture.candidates[0].currency).toBeNull();
  });
  it("rejects R2 aliases, duplicate/unbound evidence and upstream side effects", () => {
    expect(decision({ ...fixture.r2, command_type: "GOVERNANCE_R1_DECISION" })).toBe(false);
    expect(decision({ ...fixture.r2, evidence_hashes: fixture.r1.evidence_hashes })).toBe(false);
    expect(decision({ ...fixture.r1, evidence_hashes: null })).toBe(false);
    expect(decision({ ...fixture.r1, evidence_hashes: [...fixture.r1.evidence_hashes, ...fixture.r1.evidence_hashes] })).toBe(false);
    expect(decision({ ...fixture.r1, source_side_effect_requested: true })).toBe(false);
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
});
