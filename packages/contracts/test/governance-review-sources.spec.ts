/** Synthetic schema examples, not a deployed/browser receipt. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const fixture = read("fixtures/governance-review-sources.synthetic.valid.json");
const workflow = read("schemas/execution-governance-approval-workflow.v1.schema.json");
const library = read("openapi/research-run-library.openapi.json");
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const checklist = ajv.compile({ ...workflow.$defs.R1ChecklistItem, $defs: workflow.$defs });
const properties = library.components.schemas.RunLibraryItem.properties;
const claims = ajv.compile(JSON.parse(JSON.stringify({
  type: "object", required: ["eligible_methodology_claim_ids", "methodology_claims", "methodology_claims_availability"],
  properties: Object.fromEntries(["eligible_methodology_claim_ids", "methodology_claims", "methodology_claims_availability"]
    .map(key => [key, properties[key]])), $defs: library.components.schemas,
}).replaceAll("#/components/schemas/", "#/$defs/")));

describe("§56 generated optional Governance sources", () => {
  it("accepts historical checklist fields, truthful pointers and typed null references", () => {
    for (const value of [{}, fixture.linked_checklist, fixture.absent_checklist]) {
      expect(checklist(value), JSON.stringify(checklist.errors)).toBe(true);
    }
    for (const value of [
      { evidence_ref: null, evidence_ref_reason: null },
      { ...fixture.linked_checklist, evidence_ref_reason: "R1_FINDING_SOURCE_NOT_RECORDED" },
      { evidence_ref: fixture.linked_checklist.evidence_ref },
      { ...fixture.linked_checklist, evidence_ref: { ...fixture.linked_checklist.evidence_ref, run_id: "../private" } },
    ]) expect(checklist(value)).toBe(false);
  });
  it("publishes nullable bounded claims without promising grade/state from an id alone", () => {
    for (const value of [fixture.claims, fixture.absent_claims, fixture.empty_claims]) {
      expect(claims(value), JSON.stringify(claims.errors)).toBe(true);
    }
    expect(claims({ ...fixture.claims, eligible_methodology_claim_ids: Array(65).fill("claim_1") })).toBe(false);
    expect(claims({ ...fixture.claims, eligible_methodology_claim_ids: ["../private"] })).toBe(false);
    expect(claims({ ...fixture.claims, methodology_claims: [{ ...fixture.claims.methodology_claims[0], grade: "Z" }] })).toBe(false);
    const required = library.components.schemas.RunLibraryItem.required;
    expect(required).not.toContain("methodology_claims");
    expect(required).not.toContain("eligible_methodology_claim_ids");
  });
  it("exposes typed source metadata on existing operations only", () => {
    const governanceTypes = readFileSync(join(root, "generated/execution-governance.d.ts"), "utf8");
    const libraryTypes = readFileSync(join(root, "generated/research-run-library.d.ts"), "utf8");
    expect(governanceTypes).toContain("R1EvidenceReference:");
    expect(governanceTypes).toContain("evidence_ref_reason?");
    expect(libraryTypes).toContain("RunMethodologyClaim:");
    expect(libraryTypes).toContain("eligible_methodology_claim_ids?");
    expect(Object.keys(library.paths)).toHaveLength(2);
  });
});
