/**
 * W1 rows A/B (Control API): the locked Delta signal-notional WFO execution
 * profile. P04 admission, legacy request and work digest stay byte-identical;
 * the WFO branch admits exactly the §1.1 object and refuses every deviation.
 */

import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config";
import {
  DELTA_WFO_PROFILE,
  DELTA_WFO_PROFILE_DIGEST,
  DELTA_WFO_PROFILE_ID,
  deltaWfoProfileDigest,
} from "../src/research/delta-wfo.profile";
import { ResearchFreezeResponseSchema } from "../src/research/freeze.contract";
import { ResearchFreezeService } from "../src/research/freeze.service";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST, P04_DELTA_BINDING, P04_DELTA_FIXED_PARAMETERS } from "../src/research/p04-delta.binding";
import type { ResearchRequestedSpec } from "../src/research/preflight.contract";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { ResearchProgressService } from "../src/research/progress.service";
import { ResearchRunAdmissionService } from "../src/research/run-admission.service";
import { ResearchRunCreateError } from "../src/research/run-create.error";
import { ResearchRunCreateService } from "../src/research/run-create.service";
import { ResearchSearchService } from "../src/research/search.service";
import {
  admissionRepository,
  flagConfig,
  manifestFor,
  p04Requested,
  w1Admin,
  w1Scope,
  weeklyTopology,
  wfoRequested,
} from "./research-w1-wfo.fixture";
import { p14SplitSourceFixture } from "./research-split.fixture";

/** Pinned from the pre-W1 release (HEAD run-create.service.ts), not from this code. */
const P04_GOLDEN = {
  runId: "rrun_4564855f624e37b98a1752375f687630",
  workDigest: "e28aeb0adee591cf5d3fea76cf5b08216c99509cb3a339cb03f0a89c07b0625d",
  legacyRequestDigest: "a7fe74aa015f6c3e6a694aa16c9898d8073e4cdb07128ec6c748fdbb8caba70b",
};

async function admit(spec: ResearchRequestedSpec, options: {
  wfo?: boolean;
  manifest?: ReturnType<typeof manifestFor>;
  eligibility?: Record<string, unknown> | null;
} = {}) {
  const manifest = options.manifest ?? manifestFor(spec);
  const repository = options.eligibility === undefined
    ? admissionRepository(manifest)
    : admissionRepository(manifest, options.eligibility);
  const service = new ResearchRunAdmissionService(repository as never, flagConfig(options.wfo ?? true) as never);
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

describe("W1 §1.1 locked profile object", () => {
  it("pins the canonical digest in TS with the P08 canonical hash and binds the installed P04 executor", () => {
    expect(sha256ResearchJson(DELTA_WFO_PROFILE)).toBe("b86c66fa68c41e76c6106bd06a48b5ba1281bc4b168a915ec2fa7e34ec2a6cca");
    expect(deltaWfoProfileDigest()).toBe(DELTA_WFO_PROFILE_DIGEST);
    expect(DELTA_WFO_PROFILE.adapter_contract_digest).toBe(P04_DELTA_ADAPTER_CONTRACT_DIGEST);
    expect(DELTA_WFO_PROFILE.current_source).toEqual({
      source_adapter_id: "rs02.quantbt-signal-notional-wfo.v1",
      profile_id: "rs02.delta-signal-notional-wfo.v1",
    });
  });
});

describe("W1 FEATURE_RESEARCH_WFO_PROFILE startup dependencies", () => {
  const base = {
    NODE_ENV: "test", DATABASE_URL: "postgres://x:y@127.0.0.1:5432/z", PORTAL_ENV: "local", AUTH_MODE: "dev",
    INTERNAL_PRINCIPAL_SECRET: "p11-private-principal-secret-0123456789",
  };
  it("defaults dark and requires producer, progress, retained artifacts and current source", () => {
    expect(loadConfig(base as never).FEATURE_RESEARCH_WFO_PROFILE).toBe("false");
    expect(() => loadConfig({ ...base, FEATURE_RESEARCH_WFO_PROFILE: "true" } as never))
      .toThrow("FEATURE_RESEARCH_WFO_PROFILE=true requires: FEATURE_RESEARCH_RUN_PRODUCER, FEATURE_RESEARCH_PROGRESS, FEATURE_RESEARCH_RETAINED_ARTIFACTS, FEATURE_RESEARCH_CURRENT_SOURCE");
    expect(loadConfig({
      ...base,
      FEATURE_RESEARCH_RUN_PRODUCER: "true",
      FEATURE_RESEARCH_PROGRESS: "true",
      FEATURE_RESEARCH_RETAINED_ARTIFACTS: "true",
      FEATURE_RESEARCH_CURRENT_SOURCE: "true",
      FEATURE_RESEARCH_WFO_PROFILE: "true",
    } as never).FEATURE_RESEARCH_WFO_PROFILE).toBe("true");
  });
});

describe("W1 run admission matrix", () => {
  it("admits the P04 golden unchanged with the flag on or off", async () => {
    for (const wfo of [false, true]) {
      const accepted = await admit(p04Requested(), { wfo });
      expect(accepted.profile).toEqual({ id: "p04.fixed-qualification.v1", digest: null });
      expect(accepted.alpha?.fixedParameters).toEqual(P04_DELTA_FIXED_PARAMETERS);
    }
  });

  it("refuses a future release even when the effective preflight agrees with the request", async () => {
    const spec = p04Requested({ client: { engine_release_id: "er_quantbt_112", config_digest: "a".repeat(64) } });
    for (const wfo of [false, true]) {
      const error = await refusal(admit(spec, { wfo, manifest: manifestFor(spec) }));
      expect(error).toMatchObject({
        code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE",
        status: 409,
        message: "The installed Delta adapter is bound to engine release er_quantbt_111.",
      });
    }
  });

  it("admits the exact §1.1 WFO request only with the flag on", async () => {
    const accepted = await admit(wfoRequested());
    expect(accepted.profile).toEqual({ id: DELTA_WFO_PROFILE_ID, digest: DELTA_WFO_PROFILE_DIGEST });
    expect(accepted.alpha?.fixedParameters).toBeNull();
    // Flag off: the unchanged P04 predicate answers with its historical sentence.
    const dark = await refusal(admit(wfoRequested(), { wfo: false }));
    expect(dark).toMatchObject({
      code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE",
      status: 409,
      message: "The installed Delta adapter currently accepts only the signal-notional three-window profile.",
    });
  });

  const deviations: Array<[string, ResearchRequestedSpec, string, Record<string, unknown>?]> = [
    ["engine release", wfoRequested({ client: { engine_release_id: "er_quantbt_110", config_digest: "a".repeat(64) } }),
      "The Delta walk-forward profile is bound to engine release er_quantbt_111."],
    ["route", wfoRequested({ execution_route: "pct_equity" }),
      "The Delta walk-forward profile accepts only the signal-notional route."],
    ["optimization mode", wfoRequested({ optimization_mode: "mode_2_plateau" }),
      "The Delta walk-forward profile executes only mode_1_decay with the global schedule."],
    ["optimization schedule", wfoRequested({ optimization_schedule: "per_fold" }),
      "The Delta walk-forward profile executes only mode_1_decay with the global schedule."],
    ["parameter override", wfoRequested({ parameter_space_overrides: [{ name: "window", kind: "pin", value: 30 }] }),
      "The Delta walk-forward profile searches only the installed Delta parameter space and accepts no overrides except what-if pins on rvol and slpercent."],
    ["sweep on a what-if axis", wfoRequested({ parameter_space_overrides: [{ name: "rvol", kind: "sweep", low: 1.1, high: 1.3 }] }),
      "The Delta walk-forward profile searches only the installed Delta parameter space and accepts no overrides except what-if pins on rvol and slpercent."],
    ["off-step what-if pin", wfoRequested({ parameter_space_overrides: [{ name: "rvol", kind: "pin", value: 1.45 }] }),
      "The what-if pin rvol must lie on its declared step inside 1–2.5."],
    ["out-of-range what-if pin", wfoRequested({ parameter_space_overrides: [{ name: "slpercent", kind: "pin", value: 2.6 }] }),
      "The what-if pin slpercent must lie on its declared step inside 0.7–2.5."],
    ["optimization config", wfoRequested({ optimization_config: { n_jobs: 2 } }),
      "The Delta walk-forward profile searches only the installed Delta parameter space and accepts no overrides."],
    ["trials", wfoRequested({ optuna_trials: 4 }), "The Delta walk-forward profile runs exactly 3 Optuna trials."],
    ["seed", wfoRequested({ random_seed: 7 }), "The Delta walk-forward profile runs exactly random seed 42."],
    ["null seed", wfoRequested({ random_seed: null }), "The Delta walk-forward profile runs exactly random seed 42."],
    ["early stopping outside study budget", wfoRequested({ early_stopping: 4 }), "Early stopping must be an integer from 1 to the declared trials per study."],
    ["timeframe", wfoRequested({ data: { dataset_id: "crypto-binance-1m", symbol: "BTCUSDT", timeframe: "4h" } }),
      "The Delta walk-forward profile accepts only the 1h timeframe."],
    ["frequency", wfoRequested({}, { frequency: "monthly" }), "The Delta walk-forward profile accepts only weekly expanding folds."],
    ["window mode", wfoRequested({}, { window_mode: "rolling" }), "The Delta walk-forward profile accepts only weekly expanding folds."],
    ["split outside span", wfoRequested({}, { split_mode: "2026-07-20T00:00:00Z" }),
      "The Delta walk-forward first out-of-sample boundary must lie strictly inside the walk-forward span."],
    ["unparseable split", wfoRequested({}, { split_mode: "walk_forward_2026" }),
      "The Delta walk-forward first out-of-sample boundary must lie strictly inside the walk-forward span."],
    ["span above 92 days", wfoRequested({}, { start: "2026-04-01T00:00:00Z", end_exclusive: "2026-07-03T00:00:00Z" }),
      "The Delta walk-forward span exceeds the admitted 92 days."],
    ["one fold", wfoRequested(), "The Delta walk-forward profile admits 2 to 16 weekly expanding folds in the preflight topology.",
      { topology: weeklyTopology(1) }],
    ["seventeen folds", wfoRequested(), "The Delta walk-forward profile admits 2 to 16 weekly expanding folds in the preflight topology.",
      { topology: weeklyTopology(17) }],
    ["three-window topology", wfoRequested(), "The Delta walk-forward profile admits 2 to 16 weekly expanding folds in the preflight topology.",
      { topology: { protocol: "three_window_decay", folds: [] } }],
    ["engine binding drift", wfoRequested(), "The effective preflight engine binding no longer matches the submitted request.",
      { engine: { engine_release_id: "er_quantbt_111", execution_route: "pct_equity" } }],
    ["strategy identity", wfoRequested({ strategy_id: "another-strategy" }),
      "The run strategy identity must equal the explicitly bound AlphaVersion identity."],
  ];

  for (const [label, spec, message, manifestOptions] of deviations) {
    it(`refuses a WFO request whose ${label} deviates from §1.1`, async () => {
      const manifest = manifestFor(spec, manifestOptions ?? {});
      const error = await refusal(admit(spec, { manifest }));
      expect(error).toMatchObject({ code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", status: 409, message });
    });
  }

  it("admits optional patience inside the unchanged legacy study budget", async () => {
    const spec = wfoRequested({ early_stopping: 2 });
    await expect(admit(spec, { manifest: manifestFor(spec) }))
      .resolves.toMatchObject({ profile: { id: DELTA_WFO_PROFILE_ID } });
  });

  it("keeps 92 days inclusive and 16 folds admissible", async () => {
    const edge = wfoRequested({}, { start: "2026-04-14T00:00:00Z", end_exclusive: "2026-07-15T00:00:00Z" });
    await expect(admit(edge, { manifest: manifestFor(edge, { topology: weeklyTopology(16) }) }))
      .resolves.toMatchObject({ profile: { id: DELTA_WFO_PROFILE_ID } });
  });

  it("refuses imported DRAFT and ACTIVE-but-unbound AlphaVersions before any profile", async () => {
    const draft = {
      alphaId: "imported-alpha", alphaVersionId: "av_imported_1", lifecycleState: "DRAFT", declaredContract: {}, binding: null,
    };
    const spec = wfoRequested({
      alpha_binding: { alpha_id: "imported-alpha", alpha_version_id: "av_imported_1" },
      strategy_id: "imported-alpha",
    });
    expect(await refusal(admit(spec, { eligibility: draft }))).toMatchObject({ code: "RESEARCH_RUN_ALPHA_NOT_ACTIVE", status: 409 });
    expect(await refusal(admit(spec, { eligibility: { ...draft, lifecycleState: "ACTIVE" } })))
      .toMatchObject({ code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE", status: 409 });
  });
});

async function created(spec: ResearchRequestedSpec, wfo: boolean) {
  const manifest = manifestFor(spec);
  const captured: Array<Record<string, unknown>> = [];
  const repository = {
    ...admissionRepository(manifest),
    createOrReplayRunProducerIntent: vi.fn(async (_scope: unknown, input: Record<string, unknown>) => {
      captured.push(input);
      return { producer: { ...input, dispatchState: "DISPATCHED" }, replayed: false };
    }),
  };
  const config = flagConfig(wfo);
  const admission = new ResearchRunAdmissionService(repository as never, config as never);
  const service = new ResearchRunCreateService(repository as never, admission, {} as never, config as never);
  const response = await service.create(w1Admin, w1Scope, {
    schema_version: "research.run-create.v1",
    client_intent_id: "w1-golden-intent",
    preflight_token: manifest.preflightToken,
    requested_spec: spec,
    intent_kind: "NEW",
  }, "w1-request");
  return { response, input: captured[0]!, manifest };
}

describe("W1 run-create producer shapes", () => {
  it("keeps the P04 legacy request, work digest, cost and resource class byte-identical to the pre-W1 release", async () => {
    for (const wfo of [false, true]) {
      const { input } = await created(p04Requested(), wfo);
      expect(input.runId).toBe(P04_GOLDEN.runId);
      expect(input.workDigest).toBe(P04_GOLDEN.workDigest);
      expect(sha256ResearchJson(input.legacyRequest)).toBe(P04_GOLDEN.legacyRequestDigest);
      expect(input.cost).toEqual({ memoryBytes: 4 * 1024 ** 3, cpuSeconds: 45, scratchBytes: 64 * 1024 ** 2, ioBytes: 512 * 1024 ** 2 });
      expect(input.resourceClass).toBe("p10-delta-rsi-v1");
      expect(input).toMatchObject({ executionProfileId: "p04.fixed-qualification.v1", executionProfileDigest: null });
      const research = (input.legacyRequest as { research: Record<string, unknown> }).research;
      expect(research).not.toHaveProperty("execution_profile_id");
      expect(research).not.toHaveProperty("execution_profile_digest");
      expect(research.p04_parameters).toEqual(P04_DELTA_FIXED_PARAMETERS);
    }
  });

  it("builds the versioned WFO work digest, cost, resource class and profile-bearing legacy request", async () => {
    const spec = wfoRequested();
    const { input, manifest, response } = await created(spec, true);
    expect(input).toMatchObject({
      executionProfileId: DELTA_WFO_PROFILE_ID,
      executionProfileDigest: DELTA_WFO_PROFILE_DIGEST,
      resourceClass: "p10-delta-wfo-v1",
      cost: { memoryBytes: 4 * 1024 ** 3, cpuSeconds: 120, scratchBytes: 128 * 1024 ** 2, ioBytes: 512 * 1024 ** 2 },
      queueClass: "HEAVY",
    });
    const expectedWork = sha256ResearchJson({
      schema_version: "research.p10.delta-wfo-work.v1",
      requested_spec_digest: manifest.requestedSpecDigest,
      effective_spec_digest: manifest.effectiveSpecDigest,
      dataset_binding_digest: manifest.datasetBindingDigest,
      manifest_digest: manifest.manifestDigest,
      snapshot: { snapshot_id: "dss_0123456789abcdef0123456789abcdef", snapshot_content_hash: "b".repeat(64) },
      alpha: {
        alpha_id: P04_DELTA_BINDING.alphaId,
        alpha_version_id: P04_DELTA_BINDING.alphaVersionId,
        adapter_id: "p04.delta-rsi.v1",
        adapter_contract_digest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
      },
      execution_profile: { profile_id: DELTA_WFO_PROFILE_ID, profile_digest: DELTA_WFO_PROFILE_DIGEST },
      engine_release_id: "er_quantbt_111",
      requested_spec: spec,
    });
    expect(input.workDigest).toBe(expectedWork);
    expect(input.workDigest).not.toBe(P04_GOLDEN.workDigest);
    const legacy = input.legacyRequest as Record<string, unknown> & { research: Record<string, unknown> };
    expect(legacy).toMatchObject({ protocol: "advanced", strategy_id: P04_DELTA_BINDING.alphaId });
    expect(legacy.research).toMatchObject({
      schema_version: "research.run-producer.v1",
      execution_adapter_id: "p04.delta-rsi.v1",
      adapter_contract_digest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
      execution_profile_id: DELTA_WFO_PROFILE_ID,
      execution_profile_digest: DELTA_WFO_PROFILE_DIGEST,
      work_digest: expectedWork,
    });
    expect(legacy.research).not.toHaveProperty("p04_parameters");
    expect(response).toMatchObject({ status: "QUEUED", legacy: { protocol: "advanced" } });
  });
});

describe("W1 P11 ingress binds usage and sidecars to the run execution profile", () => {
  function progressService(profile?: string) {
    const persisted = new Error("persist reached");
    const progress = {
      resolveIngress: vi.fn().mockResolvedValue({
        workspaceId: "ws", actorUserId: "u", jobId: "j", workerAttemptId: "a", leaseEpoch: 1,
        ...(profile ? { executionProfileId: profile } : {}),
      }),
      persistIngress: vi.fn().mockRejectedValue(persisted),
    };
    const service = new ResearchProgressService(
      progress as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { FEATURE_RESEARCH_PROGRESS: "true" } as never,
    );
    return { service, progress, persisted };
  }
  const ingress = (cpu: number, extra: Record<string, unknown> = {}) => ({
    event: { event_type: "run_completed", payload: { usage: { cpu_seconds: cpu, peak_rss_bytes: 1, scratch_bytes: 1, fd_peak: 1 } } },
    ...extra,
  }) as never;

  it("keeps the P04 45 CPU-second cap and admits a WFO attempt up to 120", async () => {
    const p04 = progressService();
    await expect(p04.service.ingest(ingress(46))).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID", status: 400 });
    expect(p04.progress.persistIngress).not.toHaveBeenCalled();
    await expect(p04.service.ingest(ingress(45))).rejects.toBe(p04.persisted);
    const wfo = progressService(DELTA_WFO_PROFILE_ID);
    await expect(wfo.service.ingest(ingress(120))).rejects.toBe(wfo.persisted);
    await expect(wfo.service.ingest(ingress(121))).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
  });

  it("refuses P04 evidence/split sidecars on a WFO attempt before persistence", async () => {
    const wfo = progressService(DELTA_WFO_PROFILE_ID);
    await expect(wfo.service.ingest(ingress(10, { evidence: {} }))).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
    await expect(wfo.service.ingest(ingress(10, { split: {} }))).rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID" });
    expect(wfo.progress.persistIngress).not.toHaveBeenCalled();
  });

  it("refuses malformed split sidecars with a typed error on either fixed source before persistence", async () => {
    for (const profile of [undefined, "p10.vn-stock-daily-observed-fixed.v1"]) {
      const fixed = progressService(profile);
      for (const split of [null, {}, { windows: {} }, { windows: { outer_oos: {} } }]) {
        await expect(fixed.service.ingest(ingress(10, { split })))
          .rejects.toMatchObject({ code: "RESEARCH_PROGRESS_INVALID", status: 400 });
      }
      expect(fixed.progress.persistIngress).not.toHaveBeenCalled();
    }
  });
});

describe("W1 P15/P16 never read a WFO run as the P04 fixed qualification", () => {
  function hubRow(executionProfileId: string) {
    const original = p14SplitSourceFixture();
    const source = {
      ...original,
      protocol: {
        ...original.protocol,
        selection: { ...original.protocol.selection, parameter_bundle_digest: sha256ResearchJson(P04_DELTA_FIXED_PARAMETERS) },
      },
    };
    return {
      kind: "DURABLE" as const,
      runId: "run_w1",
      adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
      executionProfileId,
      requestedSpecDigest: "1".repeat(64),
      effectiveSpecDigest: "2".repeat(64),
      datasetBindingDigest: "3".repeat(64),
      manifestDigest: "b".repeat(64),
      legacyRequest: null,
      progressSnapshot: null,
      jobState: "SUCCEEDED",
      revision: "p14r1_" + "f".repeat(64),
      projection: { schema_version: "research.split-projection.v1", source },
      readiness: "PARTIAL" as const,
      sourceSplitDigest: sha256ResearchJson(source),
      receivedAt: new Date("2026-09-24T00:00:00.000Z"),
      datasetBinding: null,
      sourceAsOfUtcMs: 1_727_000_000_000,
      sourceAsOfBasis: "P14_PROJECTION_RECEIVED_AT" as const,
      asOfUtcMs: 1_727_000_000_000,
    };
  }

  it("P16 answers the typed NOT_APPLICABLE absence for a WFO run even with a P04-shaped projection and shared digest", async () => {
    const freeze = new ResearchFreezeService(
      { hub: vi.fn().mockResolvedValue(hubRow(DELTA_WFO_PROFILE_ID)) } as never,
      { FEATURE_RESEARCH_FREEZE: "true" } as never,
    );
    const detail = await freeze.detail(w1Scope, "run_w1", {});
    expect(ResearchFreezeResponseSchema.safeParse(detail).success).toBe(true);
    expect(detail).toMatchObject({
      revision: null,
      readiness: "NOT_READY",
      availability: { state: "NOT_APPLICABLE", reason_code: "P16_DELTA_WFO_PROFILE_USES_RETAINED_CURRENT_SOURCE_FREEZE" },
      freeze: { integrity: { state: "NOT_PUBLISHED", checks: [] }, frozen_parameters: [] },
    });
    const p04 = new ResearchFreezeService(
      { hub: vi.fn().mockResolvedValue(hubRow("p04.fixed-qualification.v1")) } as never,
      { FEATURE_RESEARCH_FREEZE: "true" } as never,
    );
    expect((await p04.detail(w1Scope, "run_w1", {})).freeze.integrity.state).toBe("PARTIAL");
  });

  it("P15 refuses to project the static P04 parameter map over a WFO run", async () => {
    const search = new ResearchSearchService(
      { hub: vi.fn().mockResolvedValue(hubRow(DELTA_WFO_PROFILE_ID)) } as never,
      { FEATURE_RESEARCH_SEARCH: "true" } as never,
    );
    const detail = await search.detail(w1Scope, "run_w1", {}) as unknown as { availability: { reason_code: string } };
    expect(detail.availability.reason_code).toBe("P15_CURRENT_P04_PROFILE_CONTRACT_MISMATCH");
  });
});
