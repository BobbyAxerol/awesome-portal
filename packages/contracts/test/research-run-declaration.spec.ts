import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { amendRunDeclaration } from "../tooling/generate-research-run-declaration.mjs";
const root = join(__dirname, ".."), read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));

describe("P24 immutable declarations and honest sampler scope", () => {
  it.each(["available", "historical-absent"])("validates %s declaration without promoting missing source", kind => {
    const validate = new Ajv2020({ strict: true, allowUnionTypes: true }).compile(read("schemas/research-run-declaration.v1.schema.json"));
    const fixture = read(`fixtures/research-run-declaration.${kind}.valid.json`);
    if (!validate(fixture)) throw new Error(JSON.stringify(validate.errors));
    expect(validate({ ...fixture, state: "AVAILABLE", declaration: null })).toBe(false);
    expect(validate({ ...fixture, source_locator: "research.private_table" })).toBe(false);
    expect(validate({ ...fixture, source_ref: "postgres://private" })).toBe(false);
  });
  it("keeps sampler request configuration distinct from a source-unpublished trace", () => {
    const validate = new Ajv2020({ strict: true, allowUnionTypes: true }).compile(read("schemas/research-sampler-evidence.v1.schema.json"));
    const fixture = read("fixtures/research-sampler-evidence.valid.json");
    if (!validate(fixture)) throw new Error(JSON.stringify(validate.errors));
    expect(validate({ ...fixture, internal_trace: { ...fixture.internal_trace, state: "AVAILABLE" } })).toBe(false);
    expect(validate({ ...fixture, requested_configuration: { ...fixture.requested_configuration, state: "NOT_PUBLISHED" } })).toBe(false);
    for (const key of ["requested_configuration", "internal_trace", "observed_trials"]) {
      expect(validate({ ...fixture, [key]: { ...fixture[key], source_locator: "research.private_table" } })).toBe(false);
      expect(validate({ ...fixture, [key]: { ...fixture[key], source_ref: "postgres://private" } })).toBe(false);
    }
  });
  it.each(["research-progress", "research-evidence", "research-split", "research-current-source"])(
    "publishes optional generated immutable declaration in %s, idempotently", name => {
      const original = readFileSync(join(root, `openapi/${name}.openapi.json`), "utf8");
      expect(amendRunDeclaration(original, name)).toBe(original);
      const generated = readFileSync(join(root, `generated/${name}.d.ts`), "utf8");
      expect(generated).toContain('run_declaration?: components["schemas"]["RunDeclaration"]');
      expect(generated).not.toMatch(/\s+\$defs:/);
      expect(generated).toContain('"research.run-declaration.v1"');
      expect(generated).toContain("requested_overrides");
      expect(documentPublicRefs(name)).not.toContain("source_locator");
      if (name === "research-current-source") {
        expect(generated).toContain('sampler_evidence?: components["schemas"]["SamplerEvidence"]');
        expect(generated).toContain("RETAINED_SOURCE_TRIAL_ROWS_NOT_SAMPLER_INTERNAL_TRACE");
      }
    });
});

function documentPublicRefs(name: string) {
  const document = read(`openapi/${name}.openapi.json`);
  return JSON.stringify([document.components.schemas.RunDeclaration, document.components.schemas.SamplerEvidence]);
}
