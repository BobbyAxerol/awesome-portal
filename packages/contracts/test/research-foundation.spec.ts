import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-foundation.openapi.json");
const generatedPath = join(ROOT, "generated", "research-foundation.d.ts");

describe("P09 published Research foundation contract", () => {
  it("publishes exactly two read-only same-origin operations", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(openApi.paths)).toEqual([
      "/api/v1/research/journey",
      "/api/v1/research/quantbt/atlas",
    ]);
    for (const operations of Object.values(openApi.paths)) {
      expect(Object.keys(operations)).toEqual(["get"]);
    }
  });

  it("generates the Journey/Atlas clients and all typed P02/manifest refusal paths", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchJourneyGetV1", "researchEngineAtlasGetV1", "JourneyResponse", "AtlasResponse",
      "RESEARCH_FOUNDATION_CURSOR_STUDY_REQUIRED", "RESEARCH_FOUNDATION_RELEASE_NOT_FOUND",
      "RESEARCH_FOUNDATION_ROUTE_NOT_FOUND", "RESEARCH_FOUNDATION_CAPABILITY_NOT_FOUND",
      "INSPECTION_ONLY", "HISTORICAL_IDENTITY_RETAINED",
    ]) expect(generated).toContain(needle);
  });

  it("does not publish a private adapter, raw data, worker or executable engine surface", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of [
      "internal/research", "x-portal-principal", "PORTAL_API_BASE_URL", "engine_handle",
      "source_path", "market_rows", "worker_claim",
    ]) expect(document).not.toContain(forbidden);
    expect(document).toContain("same-origin");
    expect(document).toContain("private Atlas");
  });
});
