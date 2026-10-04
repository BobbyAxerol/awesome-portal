import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import { ENGINE_110_QUALIFICATION_BINDING as binding, ENGINE_110_QUALIFICATION_BINDING_DIGEST as digest,
  engine110QualificationEnabled } from "../src/research/engine-qualification.profile";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { admissionRepository, flagConfig, manifestFor, w1Admin, w1Scope, wfoRequested } from "./research-w1-wfo.fixture";
import { ResearchRequestedSpecSchema } from "../src/research/preflight.contract";

const fixed = (release = "er_quantbt_110") => ResearchRequestedSpecSchema.parse({ ...wfoRequested(),
  protocol: "three_window_decay", walk_forward: undefined,
  windows: { is: { start: "2026-06-01T00:00", end_exclusive: "2026-06-08T00:00" },
    oos: { start: "2026-06-08T00:00", end_exclusive: "2026-06-15T00:00" },
    holdout: { start: "2026-06-15T00:00", end_exclusive: "2026-06-17T00:00" } },
  optuna_trials: 1, random_seed: null, client: { ...wfoRequested().client, engine_release_id: release } });
const local = { ...flagConfig(true), PORTAL_ENV: "local", AUTH_MODE: "dev", RESEARCH_ENGINE_QUALIFICATION_VERSION: "1.1.0" };

describe("P23 exact isolated engine compatibility binding", () => {
  it("pins published110 without changing the111 production/default authority", () => {
    expect(digest).toBe(sha256ResearchJson(binding));
    expect(binding.production_admission).toBe(false);
    expect(engine110QualificationEnabled(local)).toBe(true);
    expect(engine110QualificationEnabled({ ...local, PORTAL_ENV: "research" })).toBe(false);
    expect(engine110QualificationEnabled({ ...local, RESEARCH_ENGINE_QUALIFICATION_VERSION: undefined })).toBe(false);
    expect(() => loadConfig({ DATABASE_URL: "postgres://test:test@127.0.0.1/test", AUTH_MODE: "dev", PORTAL_ENV: "research", RESEARCH_ENGINE_QUALIFICATION_VERSION: "1.1.0" }))
      .toThrow("isolated-only");
  });
  it("requires exact local opt-in at P08 capability and P10 write admission", async () => {
    for (const [config, allowed] of [[local, true], [flagConfig(true), false], [{ ...local, PORTAL_ENV: "live" }, false]] as const) {
      const spec = fixed(), manifest = manifestFor(spec);
      const service = new ResearchRunAdmissionService(admissionRepository(manifest) as never, config as never);
      expect(await service.mayCreate(w1Admin, w1Scope, manifest.preflightToken)).toBe(allowed);
      if (allowed) expect((await service.require(w1Admin, w1Scope, manifest.preflightToken, spec)).profile)
        .toEqual({ id: "p04.fixed-qualification.v1", digest: null });
    }
  });
  it("does not let a qualification flag admit an unknown version, WFO, or altered fixed parameters", async () => {
    for (const spec of [fixed("er_quantbt_109"), wfoRequested({ client: { ...wfoRequested().client, engine_release_id: "er_quantbt_110" } }),
      { ...fixed(), optuna_trials: 2 }]) {
      const manifest = manifestFor(spec), service = new ResearchRunAdmissionService(admissionRepository(manifest) as never, local as never);
      expect(await service.mayCreate(w1Admin, w1Scope, manifest.preflightToken)).toBe(false);
    }
  });
});
