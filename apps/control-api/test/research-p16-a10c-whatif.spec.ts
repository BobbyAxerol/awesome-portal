/**
 * W5a · A10c — the Screen-07 what-if lane (Control API).
 *
 * P16-T06 grid lookup/snap without interpolation · P16-T07 dedup + budget ·
 * P16-T12 clamp mapping + unique evaluations + sparse never filled ·
 * P16-T13 GET/mount/slider never spawn a job, explicit compute idempotent ·
 * P16-T14 ΔJ scope (objective/seed/engine/dataset) and fixed runs disabled.
 */

import { describe, expect, it, vi } from "vitest";

import { notYet, type ArtifactByteVerification } from "../src/research/artifact-verify.contract";
import {
  buildWhatIfGrid,
  canonicalDecimal,
  evaluationKey,
  subtractDecimal,
} from "../src/research/whatif.grid";
import { WHATIF_PROFILE_DIGEST, whatIfProfileDigest } from "../src/research/whatif.profile";
import { WhatIfSchema } from "../src/research/whatif.contract";
import { inertWhatIf, ResearchWhatIfService, type WhatIfBasis } from "../src/research/whatif.service";
import type { WhatIfJobRow, WhatIfParentFacts } from "../src/research/whatif.repository";
import { DELTA_WFO_PROFILE_DIGEST } from "../src/research/delta-wfo.profile";

const scope = { workspaceId: "ws_w5a", actorUserId: "usr_w5a" };
const SPACE = {
  rvol: { minimum: "1", maximum: "2.5", step: "0.1" },
  slpercent: { minimum: "0.7", maximum: "2.5", step: "0.1" },
};
const EVAL_SCOPE = {
  dataset_binding_digest: "e".repeat(64),
  requested_spec_digest: "c".repeat(64),
  engine_release_id: "er_quantbt_111",
  random_seed: 42,
};
// The real W1 preview θ* (trial 0): rvol 1.2 and slpercent 2.3 sit near their bounds.
const THETA = {
  window: "34", rsi_l: "30", signalLength: "16", len_atr1: "14",
  len_atr2: "30", rvol: "1.2", len_vol: "8", slpercent: "2.3",
};

describe("A10c · grid geometry and evaluation identity", () => {
  it("pins the profile digest (TS twin of research_whatif_profile.py)", () => {
    expect(whatIfProfileDigest()).toBe(WHATIF_PROFILE_DIGEST);
    expect(WHATIF_PROFILE_DIGEST).toBe("3c29160abf214a0ef1c20c630048442ef131aadc1d00849f69ae428d0ff513bc");
  });

  it("P16-T12: 81 cells, θ* ± 4 steps, clamped at the declaration; clamped cells share one evaluation", () => {
    const grid = buildWhatIfGrid("rrun_parent", THETA, SPACE, EVAL_SCOPE);
    expect(grid.cells).toHaveLength(81);
    expect(grid.axes[0].values).toEqual(["1", "1", "1", "1.1", "1.2", "1.3", "1.4", "1.5", "1.6"]);
    expect(grid.axes[0].clamped).toEqual([true, true, false, false, false, false, false, false, false]);
    expect(grid.axes[1].values).toEqual(["1.9", "2", "2.1", "2.2", "2.3", "2.4", "2.5", "2.5", "2.5"]);
    // 7 distinct rvol × 7 distinct slpercent: 49 unique evaluations, never 81 jobs.
    expect(grid.unique).toHaveLength(49);
    expect(new Set(grid.cells.map((cell) => cell.evaluation_key)).size).toBe(49);
    const x0y0 = grid.cells.find((cell) => cell.cell_id === "x0y0")!;
    const x2y0 = grid.cells.find((cell) => cell.cell_id === "x2y0")!;
    expect(x0y0.evaluation_key).toBe(x2y0.evaluation_key);
    // x0 is clamped onto the declared minimum; its evaluation is the real node x2.
    expect(x0y0.clamped).toBe(true);
    expect(x2y0.clamped).toBe(false);
    expect(x0y0.canonical_cell_id).toBe("x2y0");
    expect(x2y0.canonical_cell_id).toBe("x2y0");
    const base = grid.cells.find((cell) => cell.is_base)!;
    expect(base.cell_id).toBe("x4y4");
    expect(base.evaluation_key).toBe(grid.base_evaluation_key);
    expect(base.configuration).toEqual(THETA);
  });

  it("the evaluation key binds params + dataset + objective + seed + engine + profile", () => {
    const key = evaluationKey(THETA, EVAL_SCOPE);
    expect(evaluationKey({ ...THETA }, EVAL_SCOPE)).toBe(key);
    expect(evaluationKey({ ...THETA, rvol: "1.3" }, EVAL_SCOPE)).not.toBe(key);
    expect(evaluationKey(THETA, { ...EVAL_SCOPE, random_seed: 7 })).not.toBe(key);
    expect(evaluationKey(THETA, { ...EVAL_SCOPE, dataset_binding_digest: "f".repeat(64) })).not.toBe(key);
    expect(evaluationKey(THETA, { ...EVAL_SCOPE, engine_release_id: "er_other" })).not.toBe(key);
  });

  it("exact decimal arithmetic: canonical text and ΔJ without binary drift", () => {
    expect(canonicalDecimal("1.20")).toBe("1.2");
    expect(canonicalDecimal("2.0")).toBe("2");
    expect(canonicalDecimal("-0.0")).toBe("0");
    expect(subtractDecimal("-1.4025", "-1.4435308120735202")).toBe("0.0410308120735202");
    expect(subtractDecimal("0.1", "0.3")).toBe("-0.2");
  });

  it("the grid key moves with θ* and with the parent, never with a viewer", () => {
    const a = buildWhatIfGrid("rrun_parent", THETA, SPACE, EVAL_SCOPE).grid_key;
    expect(buildWhatIfGrid("rrun_parent", THETA, SPACE, EVAL_SCOPE).grid_key).toBe(a);
    expect(buildWhatIfGrid("rrun_other", THETA, SPACE, EVAL_SCOPE).grid_key).not.toBe(a);
    expect(buildWhatIfGrid("rrun_parent", { ...THETA, window: "36" }, SPACE, EVAL_SCOPE).grid_key).not.toBe(a);
  });
});

function parent(overrides: Partial<WhatIfParentFacts> = {}): WhatIfParentFacts {
  return {
    runId: "rrun_parent",
    attemptId: "ratt_parent",
    actorUserId: "usr_owner",
    preflightToken: "rpft_parent",
    alphaId: "delta-rsi-polynomial-alpha",
    alphaVersionId: "av_delta_rsi_polynomial_alpha_1_0_0",
    executionAdapterId: "p04.delta-rsi.v1",
    adapterContractDigest: "9ade757b5c1cd87681a2efb49011c84a96211939710dcd32c9fd1c7777e95784",
    requestedSpecDigest: "c".repeat(64),
    effectiveSpecDigest: "d".repeat(64),
    datasetBindingDigest: "e".repeat(64),
    manifestDigest: "f".repeat(64),
    snapshotId: "dss_0123456789abcdef0123456789abcdef",
    snapshotContentHash: "a".repeat(64),
    executionProfileDigest: DELTA_WFO_PROFILE_DIGEST,
    engineReleaseId: "er_quantbt_111",
    runState: "READY",
    requestedSpec: { random_seed: 42 },
    randomSeed: 42,
    legacyStrategyId: "delta-rsi-polynomial-alpha",
    legacyDatasetId: "crypto-binance-1m",
    legacyProtocol: "advanced",
    ...overrides,
  };
}

function basis(bytes: ArtifactByteVerification = notYet("NOT_VERIFIED", "P16_ARTIFACT_BYTES_NOT_VERIFIED_YET")): WhatIfBasis {
  return {
    runId: "rrun_parent",
    frozen: THETA,
    trials: [
      // θ* itself, as the parent retained it (decimal text as QuantBT wrote it).
      { trialId: "0", state: "COMPLETE", objective: "-1.4435308120735202", parameters: { ...THETA, rvol: "1.20" } },
      { trialId: "1", state: "COMPLETE", objective: "-3.947864414203043", parameters: { ...THETA, window: "44" } },
      // A parent trial exactly on a grid node (rvol 1.4).
      { trialId: "2", state: "COMPLETE", objective: "-2.1", parameters: { ...THETA, rvol: "1.4" } },
    ],
    bytes,
  };
}

function service(options: {
  enabled?: boolean;
  jobs?: WhatIfJobRow[];
  sealed?: Map<string, { runId: string; trialId: string; state: string; objective: string | null }>;
  parentFacts?: WhatIfParentFacts | null;
} = {}) {
  const repository = {
    parentFacts: vi.fn().mockResolvedValue(options.parentFacts === undefined ? parent() : options.parentFacts),
    jobs: vi.fn().mockResolvedValue(options.jobs ?? []),
    sealedResults: vi.fn().mockResolvedValue(options.sealed ?? new Map()),
  };
  const metadata = {
    createOrReplayWhatIfIntent: vi.fn(),
    claimNextDurableJob: vi.fn(),
    recordRunProducerClaim: vi.fn(),
    recordRunProducerDispatched: vi.fn(),
  };
  const proxy = { handleWrite: vi.fn() };
  const config = {
    FEATURE_RESEARCH_WHATIF: options.enabled === false ? "false" : "true",
    RESEARCH_RUN_PRODUCER_LEASE_SECONDS: 60,
  };
  return {
    repository,
    metadata,
    proxy,
    service: new ResearchWhatIfService(repository as never, metadata as never, proxy as never, config as never),
  };
}

describe("A10c · the read (inside the current-source freeze GET)", () => {
  it("P16-T06/T12: only exact existing evaluations fill cells; everything else is MISSING, never 0", async () => {
    const { service: whatIf, metadata, proxy } = service();
    const read = WhatIfSchema.parse(await whatIf.read(scope, basis()));
    expect(read.state).toBe("AVAILABLE");
    expect(read.grid!.cells).toHaveLength(81);
    const base = read.grid!.cells.find((cell) => cell.is_base)!;
    expect(base).toMatchObject({ state: "EVALUATED", objective: "-1.4435308120735202", delta_j: "0", source: "PARENT_TRIAL", source_ref: "trial:0" });
    const node = read.grid!.cells.find((cell) => cell.cell_id === "x6y4")!; // rvol 1.4, slpercent 2.3
    expect(node).toMatchObject({ state: "EVALUATED", objective: "-2.1", delta_j: "-0.6564691879264798" });
    const missing = read.grid!.cells.filter((cell) => cell.state === "MISSING");
    expect(missing).toHaveLength(79);
    for (const cell of missing) {
      expect(cell.objective).toBeNull();
      expect(cell.delta_j).toBeNull();
    }
    expect(read.coverage).toMatchObject({ evaluated_cells: 2, total_cells: 81, evaluated_unique: 2, unique_evaluations: 49, label: "2 / 81" });
    expect(read.actions.evaluate_grid).toMatchObject({ state: "AVAILABLE", may_submit: true, missing_evaluations: 47 });
    expect(read.definition).toMatchObject({
      objective_kind: "MODE_1_DECAY_J", objective_scope: "GLOBAL_STUDY_IS_FOLDS", random_seed: 42,
      engine_release_id: "er_quantbt_111", preview_only: true, interpolation: "NONE_SNAP_TO_NODE",
    });
    // P16-T13: a read enqueues, claims and dispatches nothing.
    expect(metadata.createOrReplayWhatIfIntent).not.toHaveBeenCalled();
    expect(metadata.claimNextDurableJob).not.toHaveBeenCalled();
    expect(proxy.handleWrite).not.toHaveBeenCalled();
  });

  it("a sealed diagnostic grid fills its keys; a pruned evaluation is NOT_DEFINED, not 0", async () => {
    const grid = buildWhatIfGrid("rrun_parent", THETA, SPACE, EVAL_SCOPE);
    const key = (id: string) => grid.cells.find((cell) => cell.cell_id === id)!.evaluation_key;
    const sealed = new Map([
      [key("x5y5"), { runId: "rrun_diag", trialId: "7", state: "COMPLETE", objective: "-1.2" }],
      [key("x3y3"), { runId: "rrun_diag", trialId: "8", state: "PRUNED", objective: null }],
    ]);
    const read = await service({ sealed }).service.read(scope, basis());
    const x5y5 = read.grid!.cells.find((cell) => cell.cell_id === "x5y5")!;
    expect(x5y5).toMatchObject({ state: "EVALUATED", delta_j: "0.2435308120735202", source: "DIAGNOSTIC_GRID", source_ref: "rrun_diag:trial:7" });
    expect(read.grid!.cells.find((cell) => cell.cell_id === "x3y3")).toMatchObject({ state: "NOT_DEFINED", objective: null, delta_j: null });
  });

  it("while an admitted job covers a key its cells are QUEUED and the action is IN_FLIGHT", async () => {
    const grid = buildWhatIfGrid("rrun_parent", THETA, SPACE, EVAL_SCOPE);
    const jobs: WhatIfJobRow[] = [{
      runId: "rrun_diag", gridKey: grid.grid_key, evaluationKeys: grid.unique.map((entry) => entry.evaluation_key),
      state: "RUNNING", requestedAtUtcMs: 1_790_000_000_000, sealed: false,
    }];
    const read = await service({ jobs }).service.read(scope, basis());
    expect(read.grid!.cells.filter((cell) => cell.state === "QUEUED")).toHaveLength(79);
    expect(read.actions.evaluate_grid).toMatchObject({ state: "IN_FLIGHT", may_submit: false });
    expect(read.job).toMatchObject({ run_id: "rrun_diag", state: "RUNNING", progress_href: "/research/quantbt/runs/rrun_diag/progress" });
  });

  it("corrupt sealed bytes BLOCK both the evaluate action and the sibling fork", async () => {
    const blocked: ArtifactByteVerification = { ...notYet("NOT_VERIFIED", "X"), state: "MISMATCH", reason_code: "P16_ARTIFACT_BYTES_DIFFER_FROM_SEALED_DIGEST" };
    const read = await service().service.read(scope, basis(blocked));
    expect(read.actions.evaluate_grid).toMatchObject({ state: "BLOCKED", may_submit: false });
    expect(read.actions.sibling_draft).toMatchObject({ state: "BLOCKED", may_create: false, href_template: null });
  });

  it("dark flag and unregistered parents answer typed inert cards (fixed runs keep the card, disabled)", async () => {
    expect((await service({ enabled: false }).service.read(scope, basis())).state).toBe("NOT_ENABLED");
    const unregistered = await service({ parentFacts: parent({ executionProfileDigest: "0".repeat(64) }) }).service.read(scope, basis());
    expect(unregistered).toMatchObject({ state: "NOT_PUBLISHED", sliders: [], grid: null, coverage: null });
    expect(unregistered.actions.evaluate_grid.may_submit).toBe(false);
    expect(WhatIfSchema.parse(inertWhatIf("rrun_p04"))).toMatchObject({ state: "NOT_ENABLED", sliders: [] });
  });

  it("the sibling href is Screen 02's fork of this run (a new intent, never this run edited)", async () => {
    const read = await service().service.read(scope, basis());
    expect(read.actions.sibling_draft).toMatchObject({
      state: "AVAILABLE", may_create: true, href_template: "/research/quantbt/runs/new?from=rrun_parent&fork={cell_id}",
    });
  });
});

describe("A10c · the explicit evaluate action", () => {
  const user = { userId: "usr_w5a", username: "w5a", role: "ADMIN" } as never;

  it("refuses a stale grid key (409) instead of re-targeting a different grid", async () => {
    const { service: whatIf, metadata } = service();
    await expect(whatIf.evaluate(user, scope, basis(), "0".repeat(64), "req")).rejects.toMatchObject({ code: "RESEARCH_WHATIF_GRID_CHANGED", status: 409 });
    expect(metadata.createOrReplayWhatIfIntent).not.toHaveBeenCalled();
  });

  it("P16-T07: one bounded job with ONLY the missing unique evaluations, dispatched once", async () => {
    const grid = buildWhatIfGrid("rrun_parent", THETA, SPACE, EVAL_SCOPE);
    const harness = service();
    const created = { runId: "rrun_diag", jobId: "rjob_diag", dispatchState: "PENDING", legacyRequest: { run_id: "rrun_diag" } };
    harness.metadata.createOrReplayWhatIfIntent.mockResolvedValue({ producer: created, replayed: false });
    harness.metadata.claimNextDurableJob.mockResolvedValue({ jobId: "rjob_diag", runId: "rrun_diag", workerAttemptId: "rwa_1", leaseEpoch: 1 });
    harness.proxy.handleWrite.mockResolvedValue({ status: 202, body: { run_id: "rrun_diag" }, idempotencyKey: "k", replayed: false });
    harness.repository.jobs
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ runId: "rrun_diag", gridKey: grid.grid_key, evaluationKeys: ["x"], state: "QUEUED", requestedAtUtcMs: 1, sealed: false }]);
    const answer = await harness.service.evaluate(user, scope, basis(), grid.grid_key, "req-1");
    expect(answer).toMatchObject({ outcome: "ADMITTED", job: { run_id: "rrun_diag", state: "QUEUED" } });
    const input = harness.metadata.createOrReplayWhatIfIntent.mock.calls[0]![1];
    // 49 unique − θ* and the rvol-1.4 node already evaluated by the parent = 47.
    expect(input.evaluations).toHaveLength(47);
    expect(new Set(input.evaluations.map((entry: { evaluation_key: string }) => entry.evaluation_key)).size).toBe(47);
    expect(input.evaluations.every((entry: { parameters: Record<string, string> }) => Object.keys(entry.parameters).length === 8)).toBe(true);
    expect(input.parentActorUserId).toBe("usr_owner"); // the parent's preflight binding
    expect(input.legacyRequest.research).toMatchObject({
      intent_kind: "DIAGNOSTIC", execution_profile_id: "p16.delta-whatif-grid.v1", execution_profile_digest: WHATIF_PROFILE_DIGEST,
    });
    expect(harness.proxy.handleWrite).toHaveBeenCalledTimes(1);
    expect(harness.proxy.handleWrite.mock.calls[0]![0]).toMatchObject({ method: "POST", path: "/api/runs", idempotencyKey: "research-whatif:rrun_diag" });
  });

  it("a second click for the same grid replays the in-flight job (dedup by key), creating nothing", async () => {
    const grid = buildWhatIfGrid("rrun_parent", THETA, SPACE, EVAL_SCOPE);
    const harness = service({
      jobs: [{ runId: "rrun_diag", gridKey: grid.grid_key, evaluationKeys: ["x"], state: "RUNNING", requestedAtUtcMs: 1, sealed: false }],
    });
    const answer = await harness.service.evaluate(user, scope, basis(), grid.grid_key, "req-2");
    expect(answer).toMatchObject({ outcome: "REPLAYED", job: { run_id: "rrun_diag", state: "RUNNING" } });
    expect(harness.metadata.createOrReplayWhatIfIntent).not.toHaveBeenCalled();
    expect(harness.proxy.handleWrite).not.toHaveBeenCalled();
  });

  it("nothing missing → NOTHING_TO_EVALUATE and no job", async () => {
    const grid = buildWhatIfGrid("rrun_parent", THETA, SPACE, EVAL_SCOPE);
    const sealed = new Map(grid.unique.map((entry, index) => [entry.evaluation_key, { runId: "rrun_old", trialId: String(index), state: "COMPLETE", objective: "-1" }]));
    const harness = service({ sealed });
    const answer = await harness.service.evaluate(user, scope, basis(), grid.grid_key, "req-3");
    expect(answer.outcome).toBe("NOTHING_TO_EVALUATE");
    expect(harness.metadata.createOrReplayWhatIfIntent).not.toHaveBeenCalled();
  });

  it("corrupt bytes refuse the job (409 BLOCKED) before anything is created", async () => {
    const blocked: ArtifactByteVerification = { ...notYet("NOT_VERIFIED", "X"), state: "MISSING", reason_code: "P16_ARTIFACT_BYTES_MISSING_FROM_RETAINED_STORE" };
    const grid = buildWhatIfGrid("rrun_parent", THETA, SPACE, EVAL_SCOPE);
    const harness = service();
    await expect(harness.service.evaluate(user, scope, basis(blocked), grid.grid_key, "req-4")).rejects.toMatchObject({ code: "RESEARCH_WHATIF_BLOCKED", status: 409 });
    expect(harness.metadata.createOrReplayWhatIfIntent).not.toHaveBeenCalled();
  });

  it("the dark flag refuses with 503 and creates nothing", async () => {
    const harness = service({ enabled: false });
    await expect(harness.service.evaluate(user, scope, basis(), "0".repeat(64), "req-5")).rejects.toMatchObject({ status: 503 });
  });
});
