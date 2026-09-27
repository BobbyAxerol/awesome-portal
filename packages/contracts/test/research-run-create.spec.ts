import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import type { components } from "../generated/research-run-create";

const root = join(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const fixture: components["schemas"]["RunCreateRequest"] = load("fixtures/research-run-create.reproduction.valid.json");
const base = "https://schemas.primusspark.com/portal/openapi/research-run-create.openapi.json";
function rewrite(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(rewrite);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) =>
    [key, key === "$ref" && typeof item === "string" ? item.replace("#/components/schemas/", "#/$defs/") : rewrite(item)]));
  return value;
}
// OpenAPI component fragments omit independent `type` in conditionals; this
// validates their JSON Schema semantics, not OpenAPI-specific lint keywords.
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
for (const version of ["v1", "v2"]) {
  const path = `../schemas/research-requested-spec.${version}.schema.json`;
  ajv.addSchema(load(`schemas/research-requested-spec.${version}.schema.json`), new URL(path, base).href);
}
ajv.addSchema({ $id: base, $defs: rewrite(load("openapi/research-run-create.openapi.json").components.schemas) });
const validate = ajv.getSchema(`${base}#/$defs/RunCreateRequest`)!;

describe("E13 canonical reproduction contract", () => {
  it("admits only the explicit reproduction intent and parent pairing", () => {
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
    for (const invalid of [
      { ...fixture, lineage: undefined },
      { ...fixture, intent_kind: undefined },
      { ...fixture, intent_kind: "NEW" },
      { ...fixture, lineage: { relation: "CLONE_OF", parent_run_id: "rrun_e13_fixture_parent" } },
      { ...fixture, lineage: { ...fixture.lineage, work_digest: "a".repeat(64) } },
    ]) expect(validate(invalid)).toBe(false);
  });

  it("keeps pre-existing NEW and parent-bound clone requests valid", () => {
    expect(validate({ ...fixture, intent_kind: "NEW", lineage: undefined })).toBe(true);
    expect(validate({ ...fixture, intent_kind: "CLONE_FOR_EXPERIMENT",
      lineage: { relation: "CLONE_OF", parent_run_id: "rrun_e13_fixture_parent" } })).toBe(true);
  });

  it("generates a named relation and safe conflict, not browser-supplied runtime pins", () => {
    const generated = readFileSync(join(root, "generated/research-run-create.d.ts"), "utf8");
    expect(generated).toContain('relation: "REPRODUCTION_OF"');
    expect(generated).toContain("RESEARCH_RUN_REPRODUCTION_CONFLICT");
    for (const key of ["work_digest", "snapshot_path", "parent_attempt_id", "worker_identity"]) {
      expect(validate({ ...fixture, [key]: "forged" })).toBe(false);
    }
  });
});
