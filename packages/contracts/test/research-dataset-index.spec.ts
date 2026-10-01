import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import type { components } from "../generated/research-dataset-index";
const root = join(__dirname, "..");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const doc = read("openapi/research-dataset-index.openapi.json");
describe("B7 named metadata contracts", () => {
  it.each(["healthy", "partial-quality", "multi-dataset", "symbol-absent"])("accepts canonical synthetic %s", name => {
    const validate = new Ajv2020({ strict: true }).compile(JSON.parse(JSON.stringify({ ...doc.components.schemas.DatasetCatalogV2, $defs: doc.components.schemas }).replaceAll("#/components/schemas/", "#/$defs/")));
    const fixture: components["schemas"]["DatasetCatalogV2"] = read(`fixtures/research-dataset-catalog.v2.${name}.valid.json`);
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...fixture, broker: {} })).toBe(false);
    expect(JSON.stringify(fixture)).not.toContain("source_path");
  });
  it("has three generated operations, preserves V1 and exposes no source query or job control", () => {
    expect(Object.keys(doc.paths)).toHaveLength(3);
    const generated = readFileSync(join(root, "generated/research-dataset-index.d.ts"), "utf8");
    for (const name of ["researchDatasetCatalogGetV2", "researchDatasetSymbolsGetV1", "researchDatasetBarMetadataGetV1"])
      expect(generated).toContain(name);
    expect(read("openapi/research-preflight.openapi.json").components.schemas.DatasetCatalog.properties.schema_version.const).toBe("research.dataset-catalog.v1");
    expect(doc.info.description).toContain("GET does not build/scan HMD");
    expect(generated).not.toContain("source_path");
    expect(generated).toContain("INDEX_METADATA_ONLY_NOT_PREFLIGHT_ADMISSION");
  });
});
