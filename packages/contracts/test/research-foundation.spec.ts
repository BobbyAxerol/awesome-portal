import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020";

import { describe, expect, it } from "vitest";
import { amendCausalInnerOpenApi } from "../tooling/generate-research-causal-inner.mjs";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-foundation.openapi.json");
const generatedPath = join(ROOT, "generated", "research-foundation.d.ts");
const admissionFixturePath = join(ROOT,"fixtures/research-foundation.portal-admission-causal-inner.valid.json");
function admissionValidator() {
  const document = JSON.parse(readFileSync(openApiPath,"utf8"));
  return new Ajv2020({allErrors:true,strict:false}).compile(JSON.parse(JSON.stringify({
    ...document.components.schemas.PortalAdmission,$defs:document.components.schemas,
  }).replaceAll("#/components/schemas/","#/$defs/")));
}

describe("P09 published Research foundation contract", () => {
  it("publishes the additive temporal executor without changing the historical v1 example", () => {
    const fixture = JSON.parse(readFileSync(join(ROOT,"fixtures/research-foundation.portal-admission-temporal.valid.json"),"utf8"));
    expect(fixture.profiles).toHaveLength(3);
    expect(fixture.profiles[2]).toMatchObject({profile_id:"p10.delta-signal-notional-wfo.v2",
      requested_spec_versions:["research.requested-spec.v2"], window_modes:["expanding","rolling"],
      seed_policy:"LOCKED", trial_default:3, inner_validation:"NOT_ADMITTED_GLOBAL_RETENTION_ONLY"});
    expect(readFileSync(generatedPath,"utf8")).toContain("requested_spec_versions?:");
  });
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
    const journeyV4 = fixture("research-foundation.journey-v4.valid.json");
    expect(journeyV4.descriptor).toMatchObject({ revision: 4, content_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const v4Cards = journeyV4.descriptor.phases.flatMap((phase: any) => phase.cards);
    expect(v4Cards.filter((card: any) => card.requires_alpha).map((card: any) => card.card_id)).toEqual(["alpha-version"]);
    expect(v4Cards.find((card: any) => card.card_id === "alpha-version")).toMatchObject({
      requires_run: false, requires_alpha: true,
    });
    expect(JSON.parse(readFileSync(openApiPath, "utf8")).components.schemas.JourneyCard.properties.requires_alpha).toMatchObject({
      type: "boolean",
    });
    expect(readFileSync(generatedPath, "utf8")).toContain("requires_alpha?: boolean");
    expect(historical).toMatchObject({ selected_release_kind: "HISTORICAL", atlas: null,
      historical_identity: { release_id: "er_quantbt_108", facts_state: "NOT_PUBLISHED" } });
    const current = fixture("research-foundation.atlas-current.valid.json");
    expect(current).toMatchObject({ selected_release_kind: "CURRENT", historical_identity: null,
      atlas: { manifest_revision: 7, modes: expect.any(Array), routes: expect.any(Array) } });
    expect(current.atlas.modes).toHaveLength(5);
    expect(current.atlas.routes).toHaveLength(14);
    expect(current.atlas.claims).toHaveLength(7);
  });

  it("G-26: validates immutable v3/v4 and current v5 responses against one backward-compatible schema", () => {
    const document = JSON.parse(readFileSync(openApiPath, "utf8"));
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(JSON.stringify({
      ...document.components.schemas.JourneyResponse, $defs: document.components.schemas,
    }).replaceAll("#/components/schemas/", "#/$defs/")));
    for (const revision of [3, 4, 5]) {
      const fixture = JSON.parse(readFileSync(join(ROOT, "fixtures", `research-foundation.journey-v${revision}.valid.json`), "utf8"));
      expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
      const { content_sha256, ...descriptor } = fixture.descriptor;
      const canonical = (value: any): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
        : value && typeof value === "object" ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
        : JSON.stringify(value);
      expect(createHash("sha256").update(canonical(descriptor), "utf8").digest("hex")).toBe(content_sha256);
      expect(fixture.etag).toMatch(/^W\/"research-journey-[0-9a-f]{24}"$/);
      // The older receipts keep their originally recorded ETags. Only v5 is
      // generated by this slice; do not rewrite an immutable historical fixture.
      if (revision === 5) {
        const etag = createHash("sha256").update(`${revision}:${content_sha256}:${fixture.inspection.canonical_query}`, "utf8").digest("hex").slice(0, 24);
        expect(fixture.etag).toBe(`W/"research-journey-${etag}"`);
      }
    }
    expect(readFileSync(generatedPath, "utf8")).toContain("Revision 5 keeps the v1 response shape");
  });

  it("G-26: publishes current canonical links and copy without changing card identity or authority", () => {
    const read = (revision: number) => JSON.parse(readFileSync(join(ROOT, "fixtures", `research-foundation.journey-v${revision}.valid.json`), "utf8")).descriptor;
    const old = read(4), current = read(5);
    const oldCards = old.phases.flatMap((phase: any) => phase.cards), cards = current.phases.flatMap((phase: any) => phase.cards);
    expect(current.revision).toBe(5);
    expect(cards).toHaveLength(28);
    expect(cards.map(({ description: _copy, target_key: _target, ...facts }: any) => facts))
      .toEqual(oldCards.map(({ description: _copy, target_key: _target, ...facts }: any) => facts));
    const byId = Object.fromEntries(cards.map((card: any) => [card.card_id, card]));
    expect(byId["alpha-imports-shipped"].target_key).toBe("alpha_import");
    expect(byId["run-library-shipped"].target_key).toBe("run_library");
    expect(byId["new-run-shipped"].target_key).toBe("new_run");
    expect(byId["run-progress-shipped"].target_key).toBe("run_progress");
    expect(byId["alpha-version"]).toMatchObject({ target_key: "alpha_version_legacy", requires_alpha: true, requires_run: false });
    for (const phase of current.phases) {
      expect(phase.description).not.toMatch(/\bshipped\b/i);
      for (const card of phase.cards) {
        expect(card.description).not.toMatch(/\bshipped\b/i);
        expect(card.target_key).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
    expect(current.mapping).toHaveLength(6);
    expect(current.mapping.map((row: any) => row.shipped).join(" ")).not.toMatch(/\bshipped\b/i);
    expect(cards.filter((card: any) => card.availability === "DEPENDENCY_REQUIRED"))
      .toEqual(oldCards.filter((card: any) => card.availability === "DEPENDENCY_REQUIRED"));
  });

  it("BR-TXT-01: validates legacy/current/historical Atlas capture and additive Portal presentation codes", () => {
    const document = JSON.parse(readFileSync(openApiPath, "utf8"));
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(JSON.parse(JSON.stringify({
      ...document.components.schemas.AtlasResponse, $defs: document.components.schemas,
    }).replaceAll("#/components/schemas/", "#/$defs/")));
    const read = (name: string) => JSON.parse(readFileSync(join(ROOT, "fixtures", `research-foundation.${name}.valid.json`), "utf8"));
    for (const name of ["atlas-current", "historical-identity", "atlas-presented-current", "atlas-presented-historical"]) {
      expect(validate(read(name)), JSON.stringify(validate.errors)).toBe(true);
    }
    const current = read("atlas-presented-current"), original = read("atlas-current");
    current.atlas.modes.forEach((mode: any, index: number) => {
      mode.facts.schedules.forEach((schedule: any, j: number) => {
        const originalSchedule = original.atlas.modes[index].facts.schedules[j];
        expect(schedule.oos_use_condition).toEqual(originalSchedule.oos_use_condition);
        if (typeof originalSchedule.oos_use_condition === "string") {
          expect(schedule.oos_use_condition_code).toBe("ATLAS_SOURCE_OOS_USE_CONDITION");
        } else {
          expect(schedule).not.toHaveProperty("oos_use_condition_code");
        }
        const { reason_code, ...fact } = schedule.cert_cap;
        expect(reason_code).toBe("ATLAS_CERT_CAP_NOT_PUBLISHED");
        expect(fact).toEqual(original.atlas.modes[index].facts.schedules[j].cert_cap);
      });
      const { reason_code, ...fact } = mode.facts.avoid_when;
      expect(reason_code).toBe("ATLAS_AVOID_WHEN_NOT_PUBLISHED");
      expect(fact).toEqual(original.atlas.modes[index].facts.avoid_when);
      expect(mode.facts.objective).toEqual(original.atlas.modes[index].facts.objective);
      expect(mode.facts.reads).toEqual(original.atlas.modes[index].facts.reads);
    });
    expect(read("atlas-presented-historical").historical_identity.facts_reason_code).toBe("ATLAS_HISTORICAL_FACTS_NOT_PUBLISHED");
    expect(current.atlas.manifest_revision).toBe(original.atlas.manifest_revision);
    const invalid = structuredClone(current);
    invalid.atlas.modes[0].facts.avoid_when.reason_code = "ENGINE_CERTIFIED";
    expect(validate(invalid)).toBe(false);
    for (const condition of [null, undefined]) {
      const invalidCondition = structuredClone(current);
      const schedule = invalidCondition.atlas.modes[0].facts.schedules[0];
      schedule.oos_use_condition_code = "ATLAS_SOURCE_OOS_USE_CONDITION";
      if (condition === undefined) delete schedule.oos_use_condition;
      else schedule.oos_use_condition = condition;
      expect(validate(invalidCondition)).toBe(false);
    }
    const unknownCode = structuredClone(current);
    unknownCode.atlas.modes[0].facts.schedules[0].oos_use_condition_code = "OOS_NOT_USED";
    expect(validate(unknownCode)).toBe(false);
    const generated = readFileSync(generatedPath, "utf8");
    expect(generated).toContain('reason_code?: "ATLAS_CERT_CAP_NOT_PUBLISHED"');
    expect(generated).toContain('facts_reason_code?: "ATLAS_HISTORICAL_FACTS_NOT_PUBLISHED"');
    expect(generated).toContain('oos_use_condition_code?: "ATLAS_SOURCE_OOS_USE_CONDITION"');
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
  it("LW-07 separates Portal run admission from immutable QuantBT release facts", () => {
    const document = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      components: { schemas: Record<string, any> };
    };
    const schemas = document.components.schemas;
    expect(schemas.AtlasResponse.oneOf[0].required).toContain("portal_admission");
    expect(schemas.AtlasResponse.oneOf[1].properties.portal_admission).toBeUndefined();
    expect(schemas.PortalAdmission.properties.profiles.maxItems).toBe(5);
    const current = JSON.parse(readFileSync(join(ROOT, "fixtures", "research-foundation.atlas-current.valid.json"), "utf8")) as Record<string, any>;
    expect(current.atlas.current_release.submission_constraints.profile_id).toBe("p10.fixed-qualification.v1");
    expect(current.portal_admission.profiles).toMatchObject([
      { profile_id: "p04.fixed-qualification.v1", trial_count: { min: 1, max: 1 }, random_seed: null },
      { profile_id: "p10.delta-signal-notional-wfo.v1", trial_count: { min: 2, max: 400 }, random_seed: 42 },
    ]);
    expect(readFileSync(generatedPath, "utf8")).toContain("PortalAdmission");
  });
  it("publishes all five canonical admission identities and preserves exact causal profile bounds", () => {
    const fixture = JSON.parse(readFileSync(admissionFixturePath,"utf8"));
    expect(fixture.profiles).toHaveLength(5);
    const document = JSON.parse(readFileSync(openApiPath,"utf8"));
    expect(document.components.schemas.PortalAdmission.properties.profiles.items.properties.profile_id.enum)
      .toEqual(fixture.profiles.map((profile: { profile_id: string }) => profile.profile_id));
    expect(admissionValidator()(fixture)).toBe(true);
    expect(fixture.profiles[3]).toMatchObject({profile_id:"p10.delta-signal-notional-causal-inner.v1",
      optimization_schedule:"per_fold_causal",requested_spec_versions:["research.requested-spec.v2"],
      trial_count:{min:3,max:3},trial_scope:"PER_OUTER_FOLD_STUDY",max_total_trials:48,
      inner_validation:"REQUIRED_ENGINE_NESTED_OUTER_IS_ONLY",max_span_days:92,fold_bounds:{min:2,max:16},
      inner_constraints:{fold_bounds:{min:2,max:16},frequencies:["weekly","monthly","quarterly"],
        window_modes:["expanding","rolling"],train_window_pattern:"^[1-9][0-9]{0,4}(D|h)$"}});
    expect(fixture.profiles[4]).toMatchObject({ profile_id:"p10.vn-stock-daily-observed-fixed.v1",
      state:"DISABLED", reason:"PROFILE_FLAG_OFF", requested_spec_versions:["research.requested-spec.v1"],
      dataset_id:"vn-stock-daily",symbol:"FPT",timeframe:"1d",calendar_authority:"NOT_PUBLISHED" });
    expect(readFileSync(generatedPath,"utf8")).toContain('"p10.delta-signal-notional-causal-inner.v1"');
    expect(readFileSync(generatedPath,"utf8")).toContain('"p10.vn-stock-daily-observed-fixed.v1"');
  });
  it("validates both historical admission examples without widening the causal study", () => {
    const validate = admissionValidator();
    for(const name of ["research-foundation.portal-admission-temporal.valid.json","research-foundation.atlas-current.valid.json"]) {
      const fixture = JSON.parse(readFileSync(join(ROOT,"fixtures",name),"utf8"));
      expect(validate(fixture.portal_admission ?? fixture),JSON.stringify(validate.errors)).toBe(true);
    }
  });
  it("refuses unknown IDs, duplicate identities despite different states, excess rows and out-of-bound inner facts", () => {
    const fixture = JSON.parse(readFileSync(admissionFixturePath,"utf8")),validate=admissionValidator();
    const unknown=structuredClone(fixture);unknown.profiles[3].profile_id="p10.unknown.v1";
    expect(validate(unknown)).toBe(false);
    const duplicate=structuredClone(fixture);
    duplicate.profiles[3]={...duplicate.profiles[0],state:"DISABLED",reason:"RUN_PRODUCER_OFF"};
    expect(validate(duplicate)).toBe(false);
    const excess=structuredClone(fixture);excess.profiles.push(structuredClone(excess.profiles[3]));
    expect(validate(excess)).toBe(false);
    const tooFew=structuredClone(fixture);tooFew.profiles=tooFew.profiles.slice(0,1);
    expect(validate(tooFew)).toBe(false);
    for(const mutate of [(row: any)=>{row.inner_constraints.fold_bounds.min=1;},
      (row: any)=>{row.inner_constraints.fold_bounds.max=17;},(row: any)=>{row.max_total_trials=49;},
      (row: any)=>{row.inner_constraints.frequencies=["yearly"];}]) {
      const invalid=structuredClone(fixture);mutate(invalid.profiles[3]);expect(validate(invalid)).toBe(false);
    }
  });
  it("foundation-only regeneration is stable and repairs the omitted fourth-profile enum/count", () => {
    const original=readFileSync(openApiPath,"utf8");
    expect(amendCausalInnerOpenApi(original,"research-foundation")).toBe(original);
    const stale=JSON.parse(original),profiles=stale.components.schemas.PortalAdmission.properties.profiles;
    profiles.maxItems=3;profiles.items.properties.profile_id.enum.pop();delete profiles.allOf;
    const restored=JSON.parse(amendCausalInnerOpenApi(JSON.stringify(stale,null,2),"research-foundation"));
    expect(restored.components.schemas.PortalAdmission).toEqual(JSON.parse(original).components.schemas.PortalAdmission);
  });
});
