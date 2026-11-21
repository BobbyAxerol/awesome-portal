import "reflect-metadata";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { presentResearchAtlas, RESEARCH_ATLAS_PRESENTATION_REVISION } from "../src/research/atlas-presentation";
import { ResearchEngineAtlasPrivateSchema, ResearchEngineAtlasPublicSchema } from "../src/research/foundation.contract";
import { ResearchFoundationController } from "../src/research/foundation.controller";
import { ResearchFoundationService } from "../src/research/foundation.service";
import { researchPortalAdmission } from "../src/research/portal-admission";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const fixture = (name: string) => JSON.parse(readFileSync(resolve(root, "fixtures", `research-foundation.${name}.valid.json`), "utf8"));
const legacy = fixture("atlas-current");
const privateAtlas = () => ResearchEngineAtlasPrivateSchema.parse(structuredClone(legacy.atlas));
const user = { userId: "atlas_member", username: "Atlas Member", role: "MEMBER", mustChangePassword: false } as never;
const config = { FEATURE_RESEARCH_RUN_PRODUCER: "true", FEATURE_RESEARCH_WFO_PROFILE: "true",
  FEATURE_RESEARCH_PREVIEW_LONG_WFO: "false", FEATURE_RESEARCH_VN_OBSERVED_PROFILE: "false" } as never;
const hash = (value: string) => `W/"research-atlas-${createHash("sha256").update(value, "utf8").digest("hex").slice(0, 24)}"`;
const frozen = <T>(value: T): T => {
  if (value && typeof value === "object") { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
function service(atlas = privateAtlas()) {
  const client = { read: vi.fn(async () => atlas) };
  return { service: new ResearchFoundationService({} as never, client as never, config), client };
}
function withoutCodes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCodes);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "reason_code" && key !== "oos_use_condition_code").map(([key, nested]) => [key, withoutCodes(nested)]));
  return value;
}

describe("BR-TXT-01 Portal-owned Atlas absence presentation", () => {
  it("BR-S02-14 reports only enabled current recipes without rewriting pinned axes", () => {
    const source = frozen(privateAtlas()), bytes = JSON.stringify(source);
    const admission = researchPortalAdmission(config, source.current_release);
    const nativeFlags = { ...(config as object), FEATURE_RESEARCH_FULL06_PROFILE: "true", PORTAL_ENV: "local", AUTH_MODE: "dev" } as never;
    const nativeAdmission = researchPortalAdmission(nativeFlags, source.current_release);
    for (const current of [admission, nativeAdmission]) {
      const presented = presentResearchAtlas(source, current);
      expect(ResearchEngineAtlasPublicSchema.safeParse(presented).success).toBe(true);
      expect(ResearchEngineAtlasPrivateSchema.safeParse(presented).success).toBe(false);
      for (const route of presented.routes) {
        expect(route.axes).toEqual(source.routes.find(r => r.route_id === route.route_id)!.axes);
        expect(route.recipes_enabled).toEqual([...new Set(current.profiles.filter(p => p.state === "ENABLED"
          && p.engine_release_id === source.current_release.release_id && p.execution_route === route.route_id)
          .map(p => p.profile_id))].sort());
        expect(route.axes_scope).toBe("PINNED_ENGINE_CATALOGUE_NOT_RUNTIME_ADMISSION");
      }
      const foreign = { ...current, profiles: current.profiles.map(p => ({ ...p, engine_release_id: "er_other" })) };
      expect(presentResearchAtlas(source, foreign).routes.every(r => r.recipes_enabled!.length === 0)).toBe(true);
    }
    expect(JSON.stringify(source)).toBe(bytes);
  });
  it("adds codes to known absent slots without changing any source fact or manifest byte", () => {
    const source = frozen(privateAtlas()), bytes = JSON.stringify(source);
    const presented = presentResearchAtlas(source);
    expect(JSON.stringify(source)).toBe(bytes);
    for (let i = 0; i < source.modes.length; i++) {
      const before = source.modes[i]!.facts!, after = presented.modes[i]!.facts!;
      expect(withoutCodes(after)).toEqual(withoutCodes(before));
      after.schedules.forEach((schedule, j) => {
        expect(schedule.cert_cap).toEqual({ ...before.schedules[j]!.cert_cap, reason_code: "ATLAS_CERT_CAP_NOT_PUBLISHED" });
      });
      expect(after.avoid_when).toEqual({ ...before.avoid_when, reason_code: "ATLAS_AVOID_WHEN_NOT_PUBLISHED" });
      expect(after.objective).toBe(before.objective);
      expect(after.reads).toBe(before.reads);
    }
    expect(presented.current_release).toBe(source.current_release);
    expect(presented.routes).toBe(source.routes);
    expect(presented.claims).toBe(source.claims);
    expect(presented.evidence_contract).toBe(source.evidence_contract);
    expect(presented.manifest_revision).toBe(source.manifest_revision);
    expect(ResearchEngineAtlasPublicSchema.safeParse(presented).success).toBe(true);
    expect(ResearchEngineAtlasPrivateSchema.safeParse(presented).success).toBe(false);
  });

  it("labels objective/reads absence by slot without parsing prose, guessing a cause or adding a source", () => {
    const source = privateAtlas();
    source.modes[0]!.facts!.objective = { state: "NOT_PUBLISHED", reason: "Unrecognized original diagnostic.", source: null };
    source.modes[0]!.facts!.reads = { state: "NOT_PUBLISHED", reason: "Unrecognized original diagnostic." };
    const projected = presentResearchAtlas(source).modes[0]!.facts!;
    expect(projected.objective).toEqual({ ...source.modes[0]!.facts!.objective, reason_code: "ATLAS_OBJECTIVE_NOT_PUBLISHED" });
    expect(projected.reads).toEqual({ ...source.modes[0]!.facts!.reads, reason_code: "ATLAS_READS_NOT_PUBLISHED" });
    expect(projected.reads).not.toHaveProperty("source");
  });

  it("labels only an existing OOS condition, preserves it verbatim and never infers a claim", () => {
    const source = privateAtlas(), schedules = source.modes[0]!.facts!.schedules;
    schedules[0]!.oos_use_condition = "An unfamiliar source condition, not a Portal selection verdict.";
    schedules[1]!.oos_use_condition = null;
    delete schedules[2]!.oos_use_condition;
    const bytes = JSON.stringify(source), projected = presentResearchAtlas(frozen(source));
    const after = projected.modes[0]!.facts!.schedules;
    expect(after[0]!.oos_use_condition_code).toBe("ATLAS_SOURCE_OOS_USE_CONDITION");
    expect(after[0]!.oos_use_condition).toBe(schedules[0]!.oos_use_condition);
    expect(withoutCodes(after[0])).toEqual(schedules[0]);
    expect(after[1]).not.toHaveProperty("oos_use_condition_code");
    expect(after[2]).not.toHaveProperty("oos_use_condition_code");
    expect(JSON.stringify(source)).toBe(bytes);
    expect(ResearchEngineAtlasPublicSchema.safeParse(projected).success).toBe(true);
    for (const index of [1, 2]) {
      const forged = structuredClone(projected) as any;
      forged.modes[0].facts.schedules[index].oos_use_condition_code = "ATLAS_SOURCE_OOS_USE_CONDITION";
      expect(ResearchEngineAtlasPublicSchema.safeParse(forged).success).toBe(false);
    }
    const forgedSource = privateAtlas() as any;
    forgedSource.modes[0].facts.schedules[0].oos_use_condition_code = "ATLAS_SOURCE_OOS_USE_CONDITION";
    expect(ResearchEngineAtlasPrivateSchema.safeParse(forgedSource).success).toBe(false);
    const unknownCode = structuredClone(projected) as any;
    unknownCode.modes[0].facts.schedules[0].oos_use_condition_code = "OOS_NOT_USED";
    expect(ResearchEngineAtlasPublicSchema.safeParse(unknownCode).success).toBe(false);
  });

  it("does not invent a facts block for a legacy mode or bless source-supplied Portal labels", () => {
    const source = privateAtlas(); delete source.modes[0]!.facts;
    const result = presentResearchAtlas(source);
    expect(result.modes[0]).toBe(source.modes[0]);
    expect(result.modes[0]).not.toHaveProperty("facts");
    expect(ResearchEngineAtlasPublicSchema.safeParse(source).success).toBe(true);
    const forged = privateAtlas() as any;
    forged.modes[0].facts.schedules[0].cert_cap.reason_code = "ATLAS_CERT_CAP_NOT_PUBLISHED";
    expect(ResearchEngineAtlasPrivateSchema.safeParse(forged).success).toBe(false);
  });

  it("rejects an unknown public code and a code incorrectly attached to a published fact", () => {
    const unknown = presentResearchAtlas(privateAtlas()) as any;
    unknown.modes[0].facts.schedules[0].cert_cap.reason_code = "ENGINE_CERTIFIED";
    expect(ResearchEngineAtlasPublicSchema.safeParse(unknown).success).toBe(false);
    const published = presentResearchAtlas(privateAtlas()) as any;
    published.modes[0].facts.objective.reason_code = "ATLAS_OBJECTIVE_NOT_PUBLISHED";
    expect(ResearchEngineAtlasPublicSchema.safeParse(published).success).toBe(false);
  });

  it("serves canonical current projection and changes ETag without changing release/source revision", async () => {
    const { service: api, client } = service(frozen(privateAtlas()));
    const response = await api.atlas(user, {});
    expect(response).toEqual(fixture("atlas-presented-current"));
    expect(response.etag).not.toBe(hash(`${legacy.atlas.manifest_revision}:${legacy.selected_release_id}:::${JSON.stringify((response as any).portal_admission)}`));
    expect(response.etag).not.toBe(hash(`research.atlas-presentation.v1:${legacy.atlas.manifest_revision}:${legacy.selected_release_id}:::${JSON.stringify((response as any).portal_admission)}`));
    expect(response.etag).toBe(hash(`${RESEARCH_ATLAS_PRESENTATION_REVISION}:${legacy.atlas.manifest_revision}:${legacy.selected_release_id}:::${JSON.stringify((response as any).portal_admission)}`));
    expect((await api.atlas(user, {})).etag).toBe(response.etag);
    expect((await api.atlas(user, { route: "signal_notional" })).etag).not.toBe(response.etag);
    expect(client.read).toHaveBeenCalledWith(user);
  });

  it("labels historical facts absence but preserves retained identity and never returns a fabricated Atlas", async () => {
    const source = frozen(privateAtlas()), before = JSON.stringify(source), { service: api } = service(source);
    const response = await api.atlas(user, { release_id: "er_quantbt_108" });
    expect(response).toEqual(fixture("atlas-presented-historical"));
    expect(JSON.stringify(source)).toBe(before);
    expect(response).not.toHaveProperty("portal_admission");
    expect(response.etag).not.toBe(hash(`${source.manifest_revision}:er_quantbt_108:historical-identity`));
    await expect(api.atlas(user, { release_id: "er_quantbt_108", mode: "mode_1_decay" }))
      .rejects.toMatchObject({ status: 404, code: "RESEARCH_FOUNDATION_CAPABILITY_NOT_FOUND" });
  });

  it("rejects unknown release/route/mode before presenting any source absence", async () => {
    const { service: api } = service();
    await expect(api.atlas(user, { release_id: "er_unknown" })).rejects.toMatchObject({ status: 404, code: "RESEARCH_FOUNDATION_RELEASE_NOT_FOUND" });
    await expect(api.atlas(user, { route: "unknown" })).rejects.toMatchObject({ status: 404, code: "RESEARCH_FOUNDATION_ROUTE_NOT_FOUND" });
    await expect(api.atlas(user, { mode: "unknown" })).rejects.toMatchObject({ status: 404, code: "RESEARCH_FOUNDATION_CAPABILITY_NOT_FOUND" });
  });

  it("keeps private revalidation/membership fences and does not return 304 for the pre-projection ETag", async () => {
    const { service: api } = service(), isMember = vi.fn(async () => true);
    const controller = new ResearchFoundationController(api, { isMember } as never);
    const request = { portalUser: user, portalWorkspaceId: "workspace_one", headers: { "if-none-match": legacy.etag } };
    const reply = { header: vi.fn(), code: vi.fn() };
    const response = await controller.atlas(request as never, {}, reply as never);
    expect(response).toEqual(fixture("atlas-presented-current")); expect(reply.code).not.toHaveBeenCalled();
    expect(reply.header).toHaveBeenCalledWith("cache-control", "private, max-age=0, must-revalidate");
    request.headers["if-none-match"] = response!.etag;
    expect(await controller.atlas(request as never, {}, reply as never)).toBeUndefined();
    expect(reply.code).toHaveBeenCalledWith(304);
    isMember.mockResolvedValue(false);
    await expect(controller.atlas(request as never, {}, reply as never)).rejects.toMatchObject({ status: 404 });
  });
});
