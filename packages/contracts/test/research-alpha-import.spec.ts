import { readFileSync } from "node:fs";
import { join } from "node:path";

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const schemaPath = join(ROOT, "schemas", "research-alpha-import.v1.schema.json");
const openApiPath = join(ROOT, "openapi", "research-alpha-import.openapi.json");
const generatedPath = join(ROOT, "generated", "research-alpha-import.d.ts");

function json(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("P07 published Research Alpha Import contract", () => {
  it("E6-BR-01 binds truthful import absence to Alpha source, not signed release images", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const schema = json(schemaPath);
    ajv.addSchema(schema);
    const validate = ajv.getSchema(schema.$id as string)!;
    const registration = json(join(ROOT, "fixtures", "research-alpha-import.registration.valid.json"));
    const fact = registration.import_attestation as Record<string, unknown>;
    expect(fact.source_digest).toBe(registration.source_digest);
    expect(validate(registration)).toBe(true);
    expect(validate({ ...registration, import_attestation: { ...fact, scope: "SIGNED_RELEASE_IMAGE" } })).toBe(false);
    expect(validate({ ...registration, import_attestation: { ...fact, signature: {
      state: "AVAILABLE", signature: "image-signature-is-not-alpha-signature",
    } } })).toBe(false);
    expect(validate({ ...registration, import_attestation: { ...fact, sbom: {
      state: "AVAILABLE", locator: "release-image-sbom.json",
    } } })).toBe(false);
    const old = { ...registration }; delete old.import_attestation;
    expect(validate(old)).toBe(true); // Additive compatibility, not a false signed status.
    expect(readFileSync(generatedPath, "utf8")).toContain("ResearchAlphaImportAttestationV1");
  });

  it("validates one canonical fixture for every public success response", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const schema = json(schemaPath);
    ajv.addSchema(schema);
    const validate = ajv.getSchema(schema.$id as string);
    expect(validate).toBeDefined();

    for (const file of [
      "research-alpha-import.source.valid.json",
      "research-alpha-import.gates.valid.json",
      "research-alpha-import.registry.valid.json",
      "research-alpha-import.registration.valid.json",
      "research-alpha-import.activation.valid.json",
    ]) {
      const document = json(join(ROOT, "fixtures", file));
      if (!validate!(document)) throw new Error(`${file}: ${JSON.stringify(validate!.errors)}`);
    }
  });

  it("publishes exactly the five P07 browser operations and no legacy replacement", () => {
    const openApi = json(openApiPath) as { paths: Record<string, unknown> };
    expect(Object.keys(openApi.paths)).toEqual([
      "/api/v1/research/alphas",
      "/api/v1/research/alphas/import/parse",
      "/api/v1/research/alphas/import/gates",
      "/api/v1/research/alphas/import/register",
      "/api/v1/research/alphas/{alpha_version_id}/activate",
    ]);
    expect(JSON.stringify(openApi)).not.toContain('"/api/v1/alphas"');

    const generated = readFileSync(generatedPath, "utf8");
    for (const operation of [
      "researchAlphaRegistryListV1",
      "researchAlphaImportParseV1",
      "researchAlphaImportGatesV1",
      "researchAlphaImportRegisterV1",
      "researchAlphaActivateV1",
    ]) expect(generated).toContain(operation);
    for (const schemaName of [
      "ResearchAlphaSourceV1",
      "ResearchAlphaImportGatesV1",
      "ResearchAlphaAnalysisV1",
      "ResearchAlphaRegistryV1",
    ]) expect(generated).toContain(schemaName);
    expect(generated).toContain("RESEARCH_ALPHA_IMPORT_ADMISSION_SATURATED");
    expect(generated).toContain("RESEARCH_ALPHA_IMPORT_VERSION_CONFLICT");
  });

  it("keeps source bytes out of every success schema", () => {
    const schema = JSON.stringify(json(schemaPath));
    expect(schema).not.toContain('"source_text"');
    expect(schema).not.toContain('"source_bytes"');
  });

  it("requires caller-specific activation admission on DRAFT registration and registry rows", () => {
    const schema = JSON.stringify(json(schemaPath));
    expect(schema).toContain('"may_activate"');

    const generated = readFileSync(generatedPath, "utf8");
    expect(generated).toContain("may_activate: boolean");
    expect(generated).toContain("may_activate_reason?");
    expect(generated).toContain("run_admission?");
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const contract = json(schemaPath);
    ajv.addSchema(contract);
    const validate = ajv.getSchema(contract.$id as string)!;
    const registry = json(join(ROOT, "fixtures", "research-alpha-import.registry.valid.json"));
    expect(validate(registry)).toBe(true);
    const entries = registry.entries as Record<string, unknown>[];
    expect(validate({ ...registry, entries: [{ ...entries[0], may_activate_reason: "MADE_UP" }] })).toBe(false);
    expect(generated).toContain('supersedes_state?: "RECORDED" | "HISTORICAL_NOT_RECORDED"');
    expect(generated).toContain('supersedes?: components["schemas"]["AlphaVersionId"] | null');
  });

  it("publishes only the bounded Alpha declaration Screen 02 may validate", () => {
    const schema = json(schemaPath) as { $defs: Record<string, { properties?: Record<string, unknown> }> };
    const declaration = schema.$defs.AlphaVersionDeclaration;
    expect(declaration.properties).toEqual(expect.objectContaining({
      schema_version: { const: "research.alpha-version-declaration.v1" },
      determinism: expect.any(Object),
      parameter_space: expect.any(Object),
    }));
    expect(declaration.properties).not.toHaveProperty("source_file_ref");
    expect(declaration.properties).not.toHaveProperty("protected_kernel_sha256");

    const generated = readFileSync(generatedPath, "utf8");
    expect(generated).toContain("AlphaVersionDeclaration");
    expect(generated).toContain("declaration:");
  });
});
