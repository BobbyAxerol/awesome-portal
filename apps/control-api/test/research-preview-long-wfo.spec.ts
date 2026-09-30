/**
 * Research preview only (Bobby 2026-09-30): FEATURE_RESEARCH_PREVIEW_LONG_WFO
 * lets the Delta WFO profile run 2..400 Optuna trials with 1800/3600 s child
 * limits. Off, every refusal, cost and cap is the locked W1 behaviour.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { CURRENT_SOURCE_MAXIMUM_OBJECTIVE_ROWS, ResearchCurrentSourceSearchResponseSchema } from "../src/research/current-source.contract";

import { loadConfig } from "../src/config";
import { ResearchCurrentSourceRepository } from "../src/research/current-source.repository";
import {
  DELTA_WFO_PREVIEW_LONG_LIMITS,
  DELTA_WFO_PROFILE_DIGEST,
  DELTA_WFO_PROFILE_ID,
} from "../src/research/delta-wfo.profile";
import { ADMISSION_REASON_FIELD_PATHS } from "../src/research/preflight-gates";
import type { ResearchRequestedSpec } from "../src/research/preflight.contract";
import { ResearchProgressService } from "../src/research/progress.service";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { ResearchRunCreateError } from "../src/research/run-create.error";
import { ResearchRunCreateService } from "../src/research/run-create.service";
import {
  admissionRepository,
  flagConfig,
  manifestFor,
  w1Admin,
  w1Scope,
  wfoRequested,
} from "./research-w1-wfo.fixture";

const LOCKED_TRIALS = "The Delta walk-forward profile runs exactly 3 Optuna trials.";
const PREVIEW_TRIALS = "The preview long walk-forward profile admits 2 to 400 Optuna trials.";
const LOCKED_SEED = "The Delta walk-forward profile runs exactly random seed 42.";

function config(previewLong: boolean) {
  return { ...flagConfig(true), FEATURE_RESEARCH_PREVIEW_LONG_WFO: previewLong ? "true" : "false" };
}

async function admit(spec: ResearchRequestedSpec, previewLong: boolean) {
  const manifest = manifestFor(spec);
  const service = new ResearchRunAdmissionService(admissionRepository(manifest) as never, config(previewLong) as never);
  return service.require(w1Admin, w1Scope, manifest.preflightToken, spec);
}

async function refusal(promise: Promise<unknown>): Promise<ResearchRunCreateError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ResearchRunCreateError);
    return error as ResearchRunCreateError;
  }
  throw new Error("expected a typed P10 refusal");
}

describe("FEATURE_RESEARCH_PREVIEW_LONG_WFO startup guard", () => {
  const base = {
    DATABASE_URL: "postgres://portal:portal@localhost:5432/portal_control",
    INTERNAL_PRINCIPAL_SECRET: "local-dev-principal-secret-0123456789",
  };
  const wfoLanes = {
    FEATURE_RESEARCH_RUN_PRODUCER: "true",
    FEATURE_RESEARCH_PROGRESS: "true",
    FEATURE_RESEARCH_RETAINED_ARTIFACTS: "true",
    FEATURE_RESEARCH_CURRENT_SOURCE: "true",
    FEATURE_RESEARCH_WFO_PROFILE: "true",
  };

  it("defaults off", () => {
    expect(loadConfig({ ...base, AUTH_MODE: "dev", PORTAL_ENV: "local" }).FEATURE_RESEARCH_PREVIEW_LONG_WFO).toBe("false");
  });

  it("is accepted only with AUTH_MODE=dev, PORTAL_ENV=local and the WFO profile", () => {
    expect(loadConfig({
      ...base, ...wfoLanes, AUTH_MODE: "dev", PORTAL_ENV: "local", FEATURE_RESEARCH_PREVIEW_LONG_WFO: "true",
    }).FEATURE_RESEARCH_PREVIEW_LONG_WFO).toBe("true");
    expect(() => loadConfig({
      ...base, AUTH_MODE: "dev", PORTAL_ENV: "local", FEATURE_RESEARCH_PREVIEW_LONG_WFO: "true",
    })).toThrow("FEATURE_RESEARCH_PREVIEW_LONG_WFO=true requires FEATURE_RESEARCH_WFO_PROFILE=true");
  });

  it("refuses any non-preview deployment at startup", () => {
    const cloudflare = {
      CLOUDFLARE_TEAM_DOMAIN: "t", CLOUDFLARE_ACCESS_ISSUER: "https://t", CLOUDFLARE_ACCESS_AUD: "a",
      CLOUDFLARE_ACCESS_JWKS_URI: "https://t/certs",
      QUERY_CURSOR_KEYS_JSON: JSON.stringify({ k1: "q".repeat(40) }),
      QUERY_CURSOR_ACTIVE_KEY_ID: "k1",
      GOVERNANCE_APPLY_KEYS_JSON: JSON.stringify({ g1: "g".repeat(40) }),
      GOVERNANCE_APPLY_ACTIVE_KEY_ID: "g1",
    };
    for (const env of [
      { AUTH_MODE: "cloudflare_access_local_password", PORTAL_ENV: "local" },
      { AUTH_MODE: "cloudflare_access_local_password", PORTAL_ENV: "research" },
    ]) {
      expect(() => loadConfig({ ...base, ...cloudflare, ...wfoLanes, ...env, FEATURE_RESEARCH_PREVIEW_LONG_WFO: "true" }))
        .toThrow("FEATURE_RESEARCH_PREVIEW_LONG_WFO is only allowed with AUTH_MODE=dev and PORTAL_ENV=local");
    }
  });
});

describe("preview long WFO run admission", () => {
  it("flag off: refuses 400 trials with the locked sentence and admits exactly 3", async () => {
    const error = await refusal(admit(wfoRequested({ optuna_trials: 400 }), false));
    expect(error).toMatchObject({ code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", message: LOCKED_TRIALS });
    const accepted = await admit(wfoRequested(), false);
    expect(accepted.profile).toEqual({ id: DELTA_WFO_PROFILE_ID, digest: DELTA_WFO_PROFILE_DIGEST });
  });

  it("flag on: admits 2..400 under the unchanged profile identity", async () => {
    for (const trials of [2, 3, 400]) {
      const accepted = await admit(wfoRequested({ optuna_trials: trials }), true);
      expect(accepted.profile).toEqual({ id: DELTA_WFO_PROFILE_ID, digest: DELTA_WFO_PROFILE_DIGEST });
      expect(accepted.requestedSpec?.optuna_trials).toBe(trials);
    }
  });

  it("flag on: refuses 401 and 1 trials, and any seed other than 42", async () => {
    for (const trials of [1, 401]) {
      expect(await refusal(admit(wfoRequested({ optuna_trials: trials }), true)))
        .toMatchObject({ code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", message: PREVIEW_TRIALS });
    }
    expect(await refusal(admit(wfoRequested({ optuna_trials: 400, random_seed: 43 }), true)))
      .toMatchObject({ message: LOCKED_SEED });
  });

  it("maps the preview refusal onto the optuna_trials field", () => {
    expect(ADMISSION_REASON_FIELD_PATHS[PREVIEW_TRIALS]).toEqual(["optuna_trials"]);
  });
});

describe("preview long WFO run-create cost", () => {
  it("declares the preview child CPU cap only when the flag is on", async () => {
    for (const [previewLong, cpuSeconds] of [[false, 120], [true, DELTA_WFO_PREVIEW_LONG_LIMITS.cpu_seconds]] as const) {
      const spec = wfoRequested({ optuna_trials: previewLong ? 400 : 3 });
      const manifest = manifestFor(spec);
      const captured: Array<Record<string, unknown>> = [];
      const repository = {
        ...admissionRepository(manifest),
        createOrReplayRunProducerIntent: vi.fn(async (_scope: unknown, input: Record<string, unknown>) => {
          captured.push(input);
          return { producer: { ...input, dispatchState: "DISPATCHED" }, replayed: false };
        }),
      };
      const flags = config(previewLong);
      const admission = new ResearchRunAdmissionService(repository as never, flags as never);
      const service = new ResearchRunCreateService(repository as never, admission, {} as never, flags as never);
      await service.create(w1Admin, w1Scope, {
        schema_version: "research.run-create.v1",
        client_intent_id: `preview-long-${previewLong}`,
        preflight_token: manifest.preflightToken,
        requested_spec: spec,
        intent_kind: "NEW",
      }, "preview-long-request");
      expect(captured[0]).toMatchObject({
        executionProfileId: DELTA_WFO_PROFILE_ID,
        executionProfileDigest: DELTA_WFO_PROFILE_DIGEST,
        resourceClass: "p10-delta-wfo-v1",
        cost: { memoryBytes: 4 * 1024 ** 3, cpuSeconds, scratchBytes: 128 * 1024 ** 2, ioBytes: 512 * 1024 ** 2 },
      });
    }
  });
});

describe("preview long WFO progress usage cap", () => {
  function progressService(previewLong: boolean) {
    const persisted = new Error("persist reached");
    const progress = {
      resolveIngress: vi.fn().mockResolvedValue({
        workspaceId: "ws", actorUserId: "u", jobId: "j", workerAttemptId: "a", leaseEpoch: 1,
        executionProfileId: DELTA_WFO_PROFILE_ID,
      }),
      persistIngress: vi.fn().mockRejectedValue(persisted),
    };
    const service = new ResearchProgressService(
      progress as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { FEATURE_RESEARCH_PROGRESS: "true", FEATURE_RESEARCH_PREVIEW_LONG_WFO: previewLong ? "true" : "false" } as never,
    );
    return { service, persisted };
  }
  const ingress = (cpu: number) => ({
    event: { event_type: "run_completed", payload: { usage: { cpu_seconds: cpu, peak_rss_bytes: 1, scratch_bytes: 1, fd_peak: 1 } } },
  }) as never;

  it("keeps 120 off and admits up to 1800 on", async () => {
    const off = progressService(false);
    await expect(off.service.ingest(ingress(120))).rejects.toBe(off.persisted);
    await expect(off.service.ingest(ingress(121))).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID", status: 400 });
    const on = progressService(true);
    await expect(on.service.ingest(ingress(1_800))).rejects.toBe(on.persisted);
    await expect(on.service.ingest(ingress(1_801))).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
  });
});

describe("preview long WFO RS-02 seal ceiling", () => {
  const scope = { workspaceId: "ws_preview", actorUserId: "usr_preview" };
  const seal = (trials: number) => ({
    runId: "rrun_preview", artifactRevision: 1, manifestDigest: "a".repeat(64), sourceTransformDigest: "b".repeat(64),
    requestedSpecDigest: "1".repeat(64), effectiveSpecDigest: "2".repeat(64), datasetBindingDigest: "3".repeat(64),
    sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1", profileId: "rs02.delta-signal-notional-wfo.v1",
    tableRows: { OBSERVATION: 2, FOLD: 2, TRIAL: trials, CANDIDATE: 1, SELECTION: 1 },
    totalRows: 6 + trials, summary: {},
  });
  const repository = (previewLong: boolean, pool: unknown) =>
    new ResearchCurrentSourceRepository(pool as never, previewLong ? config(true) as never : undefined);

  it("refuses more than 64 TRIAL rows before a connection unless the flag is on", async () => {
    const dark = { connect: vi.fn() };
    await expect(repository(false, dark).seal(scope, seal(65) as never))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    expect(dark.connect).not.toHaveBeenCalled();

    const over = { connect: vi.fn() };
    await expect(repository(true, over).seal(scope, seal(401) as never))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    expect(over.connect).not.toHaveBeenCalled();

    const custody = { connect: vi.fn().mockRejectedValue(new Error("no database in unit lane")) };
    await expect(repository(true, custody).seal(scope, seal(400) as never))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_UNAVAILABLE" });
    expect(custody.connect).toHaveBeenCalledTimes(1);
  });
});

describe("LW-01 preview long-WFO Search response", () => {
  it("accepts the 400-trial plus 64-candidate probe while keeping the response under 1 MiB", () => {
    const fixturePath = resolve(
      process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"),
      "fixtures/research-current-source.search-surface.valid.json",
    );
    const source = JSON.parse(readFileSync(fixturePath, "utf8"));
    const trial = source.ledger.trials[0];
    const point = source.surface.points[0];
    source.ledger.source_trial_count = 400;
    source.ledger.returned_rows = 200;
    source.ledger.trials = Array.from({ length: 200 }, (_, ordinal) => ({
      ...trial, source_ordinal: ordinal, trial_id: String(ordinal),
    }));
    source.surface.source_trial_count = 400;
    source.surface.complete_trial_count = 400;
    source.surface.emitted_point_count = 400;
    source.surface.points = Array.from({ length: 400 }, (_, ordinal) => ({
      ...point, source_ordinal: ordinal, trial_id: String(ordinal),
    }));
    source.diagnostics.probe.objective_rows = CURRENT_SOURCE_MAXIMUM_OBJECTIVE_ROWS;
    source.diagnostics.probe.objective_rows_recomposed = CURRENT_SOURCE_MAXIMUM_OBJECTIVE_ROWS;
    const openapiPath = resolve(
      process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"),
      "openapi/research-current-source.openapi.json",
    );
    const search = JSON.parse(readFileSync(openapiPath, "utf8")).components.schemas.Search;
    const probe = search.allOf[1].properties.diagnostics.properties.probe.properties;
    expect(probe.objective_rows.maximum).toBe(CURRENT_SOURCE_MAXIMUM_OBJECTIVE_ROWS);
    expect(probe.objective_rows_recomposed.maximum).toBe(CURRENT_SOURCE_MAXIMUM_OBJECTIVE_ROWS);
    expect(source.diagnostics.probe.objective_rows_recomposed).toBe(464);
    expect(Buffer.byteLength(JSON.stringify(source))).toBeLessThan(1_048_576);
    expect(ResearchCurrentSourceSearchResponseSchema.safeParse(source).success).toBe(true);
    source.diagnostics.probe.objective_rows += 1;
    expect(ResearchCurrentSourceSearchResponseSchema.safeParse(source).success).toBe(false);
  });
});
