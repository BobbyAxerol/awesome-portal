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

  it("E12: publishes canonical v3 Journey availability and historical identity response fixtures", () => {
    const fixture = (name: string) => JSON.parse(readFileSync(join(ROOT, "fixtures", name), "utf8")) as Record<string, any>;
    const journey = fixture("research-foundation.journey-v3.valid.json");
    expect(journey.descriptor).toMatchObject({ revision: 3, content_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    /* E12: revision 3 declares no PLANNED card — every redesign screen the map names is mounted. */
    expect(journey.descriptor.phases.flatMap((phase: any) => phase.cards).filter((card: any) => card.availability === "PLANNED")).toHaveLength(0);
    expect(journey.descriptor.phases.flatMap((phase: any) => phase.cards)).toHaveLength(28);
    expect(journey.descriptor.mapping).toHaveLength(6);
    const byId = Object.fromEntries(journey.descriptor.phases.flatMap((phase: any) => phase.cards).map((card: any) => [card.card_id, card]));
    for (const cardId of ["execute-replay", "attempt-lineage", "compare", "release-candidate", "run-report"]) {
      expect(byId[cardId].availability).toBe("AVAILABLE");
    }
    expect(journey.inspection.codec).toBe("p02-cursor.v2");
    const historical = fixture("research-foundation.historical-identity.valid.json");
    expect(historical).toMatchObject({ selected_release_kind: "HISTORICAL", atlas: null,
      historical_identity: { release_id: "er_quantbt_108", facts_state: "NOT_PUBLISHED" } });
    const current = fixture("research-foundation.atlas-current.valid.json");
    expect(current).toMatchObject({ selected_release_kind: "CURRENT", historical_identity: null,
      atlas: { manifest_revision: 7, modes: expect.any(Array), routes: expect.any(Array) } });
    expect(current.atlas.modes).toHaveLength(5);
    expect(current.atlas.routes).toHaveLength(14);
    expect(current.atlas.claims).toHaveLength(7);
  });

  it("W4 CG-P04-04/06/07: publishes OOS states, route engine facts, claim qualifiers, terms and weights", () => {
    const current = JSON.parse(readFileSync(join(ROOT, "fixtures", "research-foundation.atlas-current.valid.json"), "utf8")) as Record<string, any>;
    const atlas = current.atlas;
    const states = atlas.modes.flatMap((mode: any) => mode.facts.schedules.map((fact: any) => `${mode.mode_id}|${fact.schedule}|${fact.oos_use_state}`));
    expect(states).toEqual(expect.arrayContaining([
      "mode_1_decay|per_fold_decay|SELECTION_INPUT",
      "mode_1_decay|global|RETROSPECTIVE",
      "mode_2_sbb|global|REPORT_ONLY",
      "mode_4_is_only_robust|per_fold_causal|WITHHELD_UNTIL_S4",
      "mode_5_full_robust|global|NOT_APPLICABLE",
    ]));
    for (const route of atlas.routes) {
      expect(route.engine_facts.description.length).toBeGreaterThan(0);
      expect(["wfo", "tape", "single_pass"]).toContain(route.engine_facts.method);
      expect(route.status_word).toMatch(/^[A-Z0-9/]{1,16}$/);
    }
    const byId = Object.fromEntries(atlas.routes.map((route: any) => [route.route_id, route]));
    expect(byId.signal_notional.status_word).toBe("DEFAULT");
    expect(byId.options.status_word).toBe("DEFERRED");
    expect(byId.arbitrage.engine_facts.support_matrix).toMatchObject({ function: "arbitrage_support_matrix", executable: 6, total: 9 });
    expect(byId.arbitrage.status_word).toBe("6/9");
    expect(byId.fill_replay.engine_facts.method).toBe("tape");
    expect(byId.portfolio.engine_facts.route_params.group).toBe("portfolio");
    for (const claim of atlas.claims) expect(claim.qualifier.level_description).toMatch(/^[a-z_]+$/);
    const weights = atlas.modes.filter((mode: any) => mode.mode_id !== "mode_1_decay")
      .map((mode: any) => mode.facts.objective.weights.length);
    expect(weights.every((count: number) => count > 0)).toBe(true);
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of ["AtlasRouteEngineFacts", "AtlasSupportMatrix", "AtlasRouteParams", "WITHHELD_UNTIL_S4", "ENGINE_DERIVES_OTHER_LEVEL"]) {
      expect(generated).toContain(needle);
    }
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
