import { readFileSync } from "node:fs";
import { join } from "node:path";

import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-run-library.openapi.json");
const generatedPath = join(ROOT, "generated", "research-run-library.d.ts");

describe("P12 published Research Run Library contract", () => {
  it("publishes the named same-origin Screen-01 and alpha catalogue reads", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(openApi.paths)).toEqual([
      "/api/v1/quantbt/runs",
      "/api/v1/quantbt/runs/alpha-catalogue",
      "/api/v1/quantbt/runs/{runId}/sparkline",
    ]);
    expect(Object.keys(openApi.paths["/api/v1/quantbt/runs"])).toEqual(["get"]);
    expect(Object.keys(openApi.paths["/api/v1/quantbt/runs/alpha-catalogue"])).toEqual(["get"]);
    expect(Object.keys(openApi.paths["/api/v1/quantbt/runs/{runId}/sparkline"])).toEqual(["get"]);
  });

  it("generates typed keyset, state and explicit-absence vocabulary", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchRunLibraryListV1", "researchRunLibrarySparklineV1", "researchRunLibraryAlphaCatalogueV1", "RunLibraryAlphaCatalogueResponse", "RunLibraryResponse",
      "RunLibraryItem", "RunSparklineResponse", "CREATED_AT_DESC_RUN_ID_DESC",
      "LEGACY_METADATA_ONLY", "PENDING_SOURCE_CALLBACK", "NOT_PUBLISHED",
      "technical_retry_count", "comparison", "source_updated_at_utc_ms",
    ]) expect(generated).toContain(needle);
    const openApi = readFileSync(openApiPath, "utf8");
    // Generator output intentionally erases JSON-Schema cardinality keywords;
    // pin those bounds at their authoritative OpenAPI source instead of
    // asserting an implementation detail of openapi-typescript.
    expect(openApi).toContain('"maxItems": 50');
    expect(JSON.parse(openApi).components.schemas.RunSparklineResponse.properties.values.maxItems).toBe(24);
  });

  it("does not turn the reader into an artifact/source/worker control surface", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of [
      "artifact_store_path", "source_path", "worker_attempt_id", "lease_epoch",
      "relation_name", "x-portal-principal", "private_key",
    ]) expect(document).not.toContain(forbidden);
    expect(document).toContain("opaque");
    expect(document).toContain("At most 50 rows");
    expect(document).toContain("at most 24");
  });

  it("validates the bounded alpha catalogue synthetic fixture against the published schema", () => {
    const document = JSON.parse(readFileSync(openApiPath, "utf8"));
    const rewrite = (value: unknown): unknown => Array.isArray(value) ? value.map(rewrite)
      : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) =>
        [key, key === "$ref" && typeof item === "string" ? item.replace("#/components/schemas/", "#/$defs/") : rewrite(item)])) : value;
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajv.addSchema({ $id: "library", $defs: rewrite(document.components.schemas) });
    const validate = ajv.getSchema("library#/$defs/RunLibraryAlphaCatalogueResponse")!;
    const fixture = JSON.parse(readFileSync(join(ROOT, "fixtures/research-run-library-alpha-catalogue.synthetic.valid.json"), "utf8"));
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
    expect(validate({ ...fixture, page: { ...fixture.page, limit: 201 } })).toBe(false);
    const negatives = JSON.parse(readFileSync(join(ROOT, "fixtures/research-run-library-alpha-catalogue.synthetic.negative.json"), "utf8"));
    expect(negatives.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    for (const sample of negatives.cases) {
      expect(validate(sample.value), sample.id).toBe(!sample.schema_rejects);
    }
  });
});
