import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-run-library.openapi.json");
const generatedPath = join(ROOT, "generated", "research-run-library.d.ts");

describe("P12 published Research Run Library contract", () => {
  it("publishes exactly the two named same-origin Screen-01 read operations", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(openApi.paths)).toEqual([
      "/api/v1/quantbt/runs",
      "/api/v1/quantbt/runs/{runId}/sparkline",
    ]);
    expect(Object.keys(openApi.paths["/api/v1/quantbt/runs"])).toEqual(["get"]);
    expect(Object.keys(openApi.paths["/api/v1/quantbt/runs/{runId}/sparkline"])).toEqual(["get"]);
  });

  it("generates typed keyset, state and explicit-absence vocabulary", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchRunLibraryListV1", "researchRunLibrarySparklineV1", "RunLibraryResponse",
      "RunLibraryItem", "RunSparklineResponse", "CREATED_AT_DESC_RUN_ID_DESC",
      "LEGACY_METADATA_ONLY", "PENDING_SOURCE_CALLBACK", "NOT_PUBLISHED",
      "technical_retry_count", "comparison", "source_updated_at_utc_ms",
    ]) expect(generated).toContain(needle);
    const openApi = readFileSync(openApiPath, "utf8");
    // Generator output intentionally erases JSON-Schema cardinality keywords;
    // pin those bounds at their authoritative OpenAPI source instead of
    // asserting an implementation detail of openapi-typescript.
    expect(openApi).toContain('"maxItems": 50');
    expect(openApi).toContain('"maxItems": 24');
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
});
