import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const schema = (name: string, component: string) => {
  const components = JSON.parse(read(`openapi/${name}.openapi.json`)).components.schemas;
  const defs = JSON.parse(JSON.stringify(components).replaceAll("#/components/schemas/", "#/$defs/"));
  return new Ajv2020({ strict: false, allowUnionTypes: true }).compile({ $defs: defs, $ref: `#/$defs/${component}` });
};
describe("§31 generated bounded guidance and native rail", () => {
  it("canonical service-generated stale seal has the same refusal/action on both readers", () => {
    const fixture = JSON.parse(read("fixtures/research-release-candidate.stale-seal.valid.json"));
    expect(fixture.lane).toBe("FIXTURE_ONLY");
    expect(schema("research-release-candidate", "ComposeResponseP21")(fixture.composed)).toBe(true);
    expect(schema("research-release-candidate-publication", "PublicationResponse")(fixture.published)).toBe(true);
    expect(fixture.composed.actions.publish).toEqual({ enabled: false,
      blocked_reason: "P22_CURRENT_SOURCE_CHANGED", blocked_action: "CREATE_NEW_RUN_AND_SEAL" });
    expect(fixture.published.blocked_reason).toBe(fixture.composed.actions.publish.blocked_reason);
    expect(fixture.published.blocked_action).toBe(fixture.composed.actions.publish.blocked_action);
    expect(fixture.composed.local_seal.state).toBe("SEALED_LOCAL");
    for (const name of ["research-release-candidate", "research-release-candidate-publication"]) {
      expect(read(`generated/${name}.d.ts`)).toContain("blocked_action?");
      expect(read(`generated/${name}.d.ts`)).toContain('"CREATE_NEW_RUN_AND_SEAL"');
    }
  });
  it("rail ordinal is the existing params ordinal, native and display-only; invalid/mixed nodes fail the canonical DTO", () => {
    const fixture = JSON.parse(read("fixtures/research-release-candidate.trial-rail.valid.json"));
    const node = fixture.rail.find((item: { key: string }) => item.key === "selected_params");
    expect(node.selected_trial_ordinal).toBe(fixture.selected_params.selected_trial_number);
    expect(node.selected_trial_ordinal_scope).toBe(fixture.selected_params.selected_trial_number_scope);
    expect(node.selected_trial_ordinal_reason_code).toBeNull();
    expect(read("generated/research-release-candidate.d.ts")).toContain("selected_trial_ordinal_scope?");
    // ComposeResponse is an older incomplete duplicate, not the canonical
    // named operation response. Do not widen it to make a modern DTO pass.
    for (const component of ["ComposeResponseP21"]) {
      const validate = schema("research-release-candidate", component);
      expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
      for (const patch of [{ selected_trial_ordinal: 0 }, { selected_trial_ordinal_scope: null },
        { selected_trial_ordinal_scope: "CUMULATIVE_PROGRESS" }, { selected_trial_ordinal_reason_code: "SELECTION_HAS_NO_TRIAL" }]) {
        const bad = structuredClone(fixture);
        Object.assign(bad.rail.find((item: { key: string }) => item.key === "selected_params"), patch);
        expect(validate(bad)).toBe(false);
      }
      const wrong = structuredClone(fixture);
      Object.assign(wrong.rail[0], { selected_trial_ordinal: 1, selected_trial_ordinal_scope: "RUN_GLOBAL", selected_trial_ordinal_reason_code: null });
      expect(validate(wrong)).toBe(false);
    }
  });
});
