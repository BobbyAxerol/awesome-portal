import { readFileSync } from "node:fs";
import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
const root = join(__dirname, "..");
const read = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
describe("B6 UI-first enrichment contract", () => {
  it.each(["healthy", "partial-month", "no-benchmark"])("validates canonical %s", name => {
    const validate = new Ajv2020({ strict: true }).compile(read("schemas/research-enriched-analysis.v1.schema.json"));
    const block = read(`fixtures/research-enriched-analysis.${name}.valid.json`);
    if (!validate(block)) throw new Error(JSON.stringify(validate.errors));
    expect(block.basis).toBe("ALL_TIME"); expect(block.rolling).toBeNull();
    expect(block.return_distribution.buckets.every((row: {count: number}) => Number.isInteger(row.count))).toBe(true);
    expect(validate({ ...block, basis: "LAST_30D" })).toBe(false);
  });
  it("publishes generated types on all four named read surfaces without removing compatibility", () => {
    for (const name of ["research-evidence", "research-current-source", "research-run-library", "research-report"]) {
      const generated = readFileSync(join(root, `generated/${name}.d.ts`), "utf8");
      expect(generated).toContain("EnrichedAnalysis");
      expect(generated).toContain(name === "research-run-library" ? "analytics_all_time?" : "enriched_analysis?");
      const schemas = read(`openapi/${name}.openapi.json`).components.schemas;
      const dto = schemas[{"research-evidence":"EvidenceHub", "research-current-source":"Evidence", "research-run-library":"RunLibraryItem", "research-report":"ReportDetail"}[name]!];
      const properties = dto.properties ?? dto.allOf.find((s: {properties?: unknown}) => s.properties).properties;
      const field = name === "research-run-library" ? "analytics_all_time" : "enriched_analysis";
      expect(properties[field].$ref).toContain("EnrichedAnalysis");
      expect(schemas.Availability?.properties?.enriched_analysis).toBeUndefined();
      if (name !== "research-run-library") {
        expect(properties.enriched_analysis_availability.$ref).toBe("#/components/schemas/EnrichedAnalysisAvailability");
        expect(generated).toContain("SEALED_ENRICHMENT_NOT_COMPUTED");
      }
    }
    expect(read("fixtures/research-enriched-analysis.old-seal-absent.valid.json").enriched_analysis).toBeNull();
  });
});
