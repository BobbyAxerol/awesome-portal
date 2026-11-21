import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import Ajv from "ajv/dist/2020.js";
import { amendW1Presentation } from "../tooling/generate-research-w1-presentation.mjs";

const root = join(__dirname, "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");
describe("W1 additive public presentation contracts", () => {
  it.each(["research-current-source", "research-evidence"])("is idempotent and generated on %s", name => {
    const original = read(`openapi/${name}.openapi.json`);
    expect(amendW1Presentation(original, name)).toBe(original);
    const types = read(`generated/${name}.d.ts`);
    expect(types).toContain(name === "research-evidence" ? "failed_at?:" : "selected_trial_ordinal?:");
  });
  it("accepts public ordinal examples but keeps private causal selection schema unchanged", () => {
    const schemas = JSON.parse(read("openapi/research-current-source.openapi.json")).components.schemas;
    expect(schemas.CausalSelection.properties).not.toHaveProperty("selected_trial_ordinal");
    expect(schemas.Fold.properties.causal_selection.$ref).toBe("#/components/schemas/DisplayCausalSelection");
    const fixture = JSON.parse(read("fixtures/research-w1.selected-trial-presentation.fixture.json"));
    const validate = new Ajv({ strict: false }).compile({ type: "object", additionalProperties: false,
      required: ["selected_trial_id", "selected_trial_ordinal", "selected_trial_ordinal_scope", "selected_trial_ordinal_reason_code"],
      properties: { selected_trial_id: { type: "string" },
        ...Object.fromEntries(Object.entries(schemas.Selection.properties).filter(([key]) => key.startsWith("selected_trial_ordinal"))) } });
    for (const key of ["global", "causal", "unmapped"]) expect(validate(fixture[key]), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...fixture.global, selected_trial_ordinal: 0 })).toBe(false);
  });
});
