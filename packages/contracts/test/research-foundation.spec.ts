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
      "ENGINE_SUPPORTED", "P04_BASELINE_ONLY", "ClaimDescriptor", "research-run-evidence.v1",
      "AtlasOptimizerDefaults", "research.optimizer-defaults.v1", "LOCKED",
      "p10.fixed-qualification.v1", "trial_ceiling",
      "CursorStage", "p02-cursor.v2",
      "AtlasModeFacts", "AtlasScheduleFact", "AtlasSourceLocator", "AtlasNotPublishedFact",
      "AtlasWalkForwardOptions", "research.walk-forward-options.v1",
    ]) expect(generated).toContain(needle);
    // RF01-B4: `stage` is the only closed-set cursor key.
    expect(generated).toContain('CursorStage: "summary" | "split" | "search" | "freeze" | "execute" | "claim" | "atlas";');
  });

  it("keeps P09 Atlas facts as the exact P04 shapes rather than loose objects", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      components: { schemas: Record<string, unknown> };
    };
    const schemas = openApi.components.schemas as Record<string, {
      properties?: Record<string, unknown>;
      items?: { $ref?: string };
    }>;
    expect(schemas.Atlas.properties?.claims).toEqual(expect.objectContaining({
      items: { $ref: "#/components/schemas/ClaimDescriptor" },
    }));
    expect(schemas.Atlas.properties?.evidence_contract).toEqual({
      $ref: "#/components/schemas/EvidenceContract",
    });
    expect(schemas.CapabilityAxes.properties?.engine).toEqual({
      enum: ["ENGINE_SUPPORTED", "ENGINE_PARTIAL", "ENGINE_DEFERRED"],
    });
    expect(schemas.AtlasRelease.properties).toEqual(expect.objectContaining({
      trial_ceiling: { type: "integer", minimum: 1, maximum: 100000 },
      optimizer_defaults: { $ref: "#/components/schemas/AtlasOptimizerDefaults" },
      submission_constraints: { $ref: "#/components/schemas/AtlasSubmissionConstraints" },
    }));
  });

  it("RF-03: sizes the manifest catalogue and distinguishes current facts from historical identity", () => {
    const document = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      components: { schemas: Record<string, any> };
    };
    const schemas = document.components.schemas;
    expect(schemas.Atlas.properties.routes).toMatchObject({ minItems: 1, maxItems: 32 });
    expect(schemas.Atlas.properties.modes).toMatchObject({ minItems: 1, maxItems: 8 });
    expect(schemas.Atlas.properties.claims).toMatchObject({ minItems: 1, maxItems: 16 });
    expect(schemas.AtlasResponse.oneOf[0].properties).toMatchObject({
      selected_release_kind: { const: "CURRENT" },
      atlas: { $ref: "#/components/schemas/Atlas" },
      historical_identity: { type: "null" },
    });
    expect(schemas.AtlasResponse.oneOf[1].properties).toMatchObject({
      selected_release_kind: { const: "HISTORICAL" },
      atlas: { type: "null" },
      historical_identity: { $ref: "#/components/schemas/AtlasHistoricalIdentity" },
    });
    expect(schemas.AtlasHistoricalIdentity.properties.facts_state).toEqual({ const: "NOT_PUBLISHED" });
  });

  it("RF-03: types engine-supported but Portal-not-admitted schedules with a sourced reason", () => {
    const document = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      components: { schemas: Record<string, any> };
    };
    expect(document.components.schemas.AtlasMode.properties.invalid_schedules).toMatchObject({
      items: { required: ["schedule", "admission", "reason", "source"], properties: {
        admission: { const: "NOT_ADMITTED" },
      } },
    });
    expect(readFileSync(generatedPath, "utf8")).toContain("invalid_schedules?:");
  });

  it("RF-03: publishes canonical v2 Journey and historical identity response fixtures", () => {
    const fixture = (name: string) => JSON.parse(readFileSync(join(ROOT, "fixtures", name), "utf8")) as Record<string, any>;
    const journey = fixture("research-foundation.journey-v2.valid.json");
    expect(journey.descriptor).toMatchObject({ revision: 2, content_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(journey.descriptor.phases.flatMap((phase: any) => phase.cards)).toHaveLength(28);
    expect(journey.descriptor.mapping).toHaveLength(6);
    expect(journey.inspection.codec).toBe("p02-cursor.v2");
    const historical = fixture("research-foundation.historical-identity.valid.json");
    expect(historical).toMatchObject({ selected_release_kind: "HISTORICAL", atlas: null,
      historical_identity: { release_id: "er_quantbt_108", facts_state: "NOT_PUBLISHED" } });
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
