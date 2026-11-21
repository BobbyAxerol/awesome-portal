import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { progressTruthComponents } from "../tooling/generate-research-progress-truth.mjs";
const fixture = JSON.parse(readFileSync(new URL("../fixtures/research-w5-navigation.valid.json", import.meta.url), "utf8"));
const schemas = (file: string) => JSON.parse(JSON.stringify(JSON.parse(readFileSync(new URL(`../openapi/${file}.openapi.json`, import.meta.url), "utf8")).components.schemas).replaceAll("#/components/schemas/", "#/$defs/"));
const progress = schemas("research-progress"), rc = schemas("research-release-candidate");
const ajv = new Ajv2020({ strict: false, allErrors: true, allowUnionTypes: true, unicodeRegExp: false });
const handoff = ajv.compile({ $defs: progress, ...progress.ProgressSnapshot.properties.claim.properties.handoff_cursor });
const selected = ajv.compile({ $defs: rc, $ref: "#/$defs/SelectedParams" });
describe("W5 published public navigation and existing RC number", () => {
  it("accepts study-local cursor and scoped RC, without a duplicate RC ordinal", () => {
    expect(handoff(fixture.handoff_cursor)).toBe(true);expect(selected(fixture.selected_params)).toBe(true);
    expect(rc.SelectedParams.properties).not.toHaveProperty("selected_trial_ordinal");
    expect(rc.SelectedParams.properties.selected_trial_number_scope).toBeDefined();
  });
  it("keeps private source cursors unchanged and old public captures readable", () => {
    const old = { fold: 2, trial: 6, params_digest: fixture.handoff_cursor.params_digest };
    expect(handoff(old)).toBe(true);expect(progress.ProgressHandoffCursor.properties).not.toHaveProperty("trial_scope");
    expect(handoff(null)).toBe(true);
  });
  it("rejects invented/private fields and zero navigation ordinals", () => {
    expect(handoff({ ...fixture.handoff_cursor, source_locator: "/private" })).toBe(false);
    expect(handoff({ ...fixture.handoff_cursor, trial: 0 })).toBe(false);
    expect(selected({ ...fixture.selected_params, selected_trial_number_scope: "P11_COUNTER" })).toBe(false);
  });
  it("retains deterministic generator output", () => {
    const document = JSON.parse(readFileSync(new URL("../openapi/research-progress.openapi.json", import.meta.url), "utf8"));
    for (const [name, schema] of Object.entries(progressTruthComponents(document))) expect(schema).toEqual(document.components.schemas[name]);
  });
});
