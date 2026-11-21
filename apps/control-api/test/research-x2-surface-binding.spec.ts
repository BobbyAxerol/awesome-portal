/**
 * X2 · B3 (declared space + Screen-06 trial surface on the WFO lane) and
 * B4 (CG-P16-02 binding down to Stage 4, CG-P16-03 code-fixed hash scope,
 * P16-T14 "fixed params sit in the right hash scope").
 *
 * Fixtures: the W5b real signal-notional WFO seal (child audit retained) and
 * the W3 real WFO seal (retained before P17-T14 — no child audit).
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { mockSearchRepository } from "./research-search-inputs.fixture";
import { p11StageEvents } from "../src/research/p11-stage-events";

import { positionPercent } from "../src/research/bound-warning";
import {
  ResearchCurrentSourceFreezeResponseSchema,
  ResearchCurrentSourceSearchResponseSchema,
  type ResearchCurrentSourceFreezeResponse,
  type ResearchCurrentSourceNotApplicableResponse,
  type ResearchCurrentSourceSearchResponse,
} from "../src/research/current-source.contract";
import type { CurrentSourceSealRow, CurrentSourceStoredRow } from "../src/research/current-source.repository";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import {
  SURFACE_POINT_LIMIT,
  SURFACE_REASONS,
  SearchSurfaceSchema,
  declaredSpace,
  searchSurface,
  type SurfaceTrial,
} from "../src/research/current-source-surface";
import { quantbtCandidateId } from "../src/research/fold-ordering";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST, P04_DELTA_DECLARED_CONTRACT, P04_DELTA_FIXED_PARAMETERS } from "../src/research/p04-delta.binding";
import { ResearchFreezeService } from "../src/research/freeze.service";
import { p14SplitSourceFixture } from "./research-split.fixture";
import { DELTA_WFO_PROFILE } from "../src/research/delta-wfo.profile";
import { DEFAULT_PARAMETER_BINDING_REGISTRY, bundleDigest } from "../src/research/parameter-binding.registry";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { STAGE4_REASONS, fixedStage4Binding, parameterAuthority, retainedStage4Binding } from "../src/research/stage4-binding";
import { openApiValidator } from "./research-rf05-openapi";

type Kind = "OBSERVATION" | "FOLD" | "TRIAL" | "CANDIDATE" | "SELECTION";
interface Fixture {
  run_id: string;
  table_rows: Record<Kind, number>;
  manifest_digest: string;
  source_transform_digest: string;
  summary: Record<string, any>;
  rows: Record<Kind, CurrentSourceStoredRow[]>;
}

const w5b = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8")) as Fixture;
const w3 = JSON.parse(readFileSync(join(__dirname, "research-w3-real-hmd-seal.fixture.json"), "utf8")) as Fixture;
const scope = { workspaceId: "ws-x2", actorUserId: "usr-x2" };
const config = {
  FEATURE_RESEARCH_CURRENT_SOURCE: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
  QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
  QUERY_CURSOR_TTL_SECONDS: 900,
};
const LANE_PROFILE = "rs02.delta-signal-notional-wfo.v1";
const searchValidator = openApiValidator("research-current-source.openapi.json", "Search");
const freezeValidator = openApiValidator("research-current-source.openapi.json", "Freeze");
const hubFreezeValidator = openApiValidator("research-freeze.openapi.json", "FreezeDetail");
const hubStage4Validator = openApiValidator("research-freeze.openapi.json", "Stage4Binding");

function serviceFor(fixture: Fixture, rows: Partial<Record<Kind, CurrentSourceStoredRow[]>> = fixture.rows, profileId = LANE_PROFILE) {
  const seal: CurrentSourceSealRow = {
    runId: fixture.run_id,
    artifactRevision: 1,
    sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1",
    profileId,
    manifestDigest: fixture.manifest_digest,
    sourceTransformDigest: fixture.source_transform_digest,
    retainedImportDigest: "f".repeat(64),
    requestedSpecDigest: "1".repeat(64),
    effectiveSpecDigest: "2".repeat(64),
    datasetBindingDigest: "3".repeat(64),
    tableRows: fixture.table_rows,
    totalRows: Object.values(fixture.table_rows).reduce((sum, count) => sum + count, 0),
    summary: fixture.summary,
    retainedAtUtcMs: 1_790_269_236_911,
  };
  const sorted = (kind: Kind) => [...(rows[kind] ?? [])].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal);
  const repository = {
    sealForRead: vi.fn().mockResolvedValue(seal),
    runState: vi.fn(),
    stageEventClocks: vi.fn().mockResolvedValue(p11StageEvents("a".repeat(64), { s4_completed_utc_ms: 1_790_269_230_000 })),
    admittedRequestedSpec: vi.fn().mockResolvedValue(null),
    rows: vi.fn(async (_s: unknown, _r: string, _v: number, kind: Kind, selection: { limit: number }) => {
      const all = sorted(kind);
      return { rows: all.slice(0, selection.limit), hasMore: all.length > selection.limit, hasPrevious: false, totalRows: all.length };
    }),
    verifyRetainedImport: vi.fn().mockResolvedValue("f".repeat(64)),
  };
  return new ResearchCurrentSourceService(mockSearchRepository(repository) as never, config as never);
}

function sealed<T>(value: T | ResearchCurrentSourceNotApplicableResponse): T {
  expect((value as { schema_version?: string }).schema_version).not.toBe("research.current-source-not-applicable.v1");
  return value as T;
}

async function search(service: ResearchCurrentSourceService, runId: string, limit = 100) {
  const value = sealed<ResearchCurrentSourceSearchResponse>(await service.search(scope, runId, { limit } as never));
  expect(ResearchCurrentSourceSearchResponseSchema.safeParse(value).success).toBe(true);
  searchValidator.assert(value);
  return value;
}

async function freeze(service: ResearchCurrentSourceService, runId: string) {
  const value = sealed<ResearchCurrentSourceFreezeResponse>(await service.freeze(scope, runId));
  expect(ResearchCurrentSourceFreezeResponseSchema.safeParse(value).success).toBe(true);
  freezeValidator.assert(value);
  return value;
}

const theta = w5b.summary.selection.parameters as Record<string, string>;

describe("B3 · the WFO lane serves the declared space it searched, so DR-02 works on S06 and S07", () => {
  it("resolves the historical binding by the retained lane profile — the Delta WFO declaration, never this build's constants", async () => {
    const space = (await search(serviceFor(w5b), w5b.run_id)).declared_space;
    expect(space.state).toBe("AVAILABLE");
    expect(space.binding).toEqual({
      profile_id: DELTA_WFO_PROFILE.profile_id,
      profile_digest: expect.stringMatching(/^[0-9a-f]{64}$/),
      adapter_contract_digest: DELTA_WFO_PROFILE.adapter_contract_digest,
      installed_in_release: "research-loop-v1.1/W1",
    });
    expect(space.parameters.map((p) => p.name)).toEqual(Object.keys(theta));
    for (const parameter of space.parameters) {
      const declared = P04_DELTA_DECLARED_CONTRACT.parameter_space[parameter.name as keyof typeof P04_DELTA_DECLARED_CONTRACT.parameter_space];
      expect([parameter.minimum, parameter.maximum, parameter.step]).toEqual([String(declared.minimum), String(declared.maximum), String(declared.step)]);
      expect(parameter.value).toBe(theta[parameter.name]);
      expect(parameter.position_percent).toBe(positionPercent(theta[parameter.name]!, parameter.minimum, parameter.maximum));
      expect(parameter.hash_scope).toBe("PARAMS_DIGEST");
    }
  });

  it("the real θ* sits on its bounds: rsi_l 30 and len_vol 8 are AT_BOUND, len_atr2 and slpercent are NEAR_BOUND — the warning DR-02 exists for", async () => {
    const rows = Object.fromEntries((await search(serviceFor(w5b), w5b.run_id)).declared_space.parameters.map((p) => [p.name, p]));
    expect(rows.rsi_l!.bound_warning).toMatchObject({ state: "AT_BOUND", side: "UPPER" });
    expect(rows.len_vol!.bound_warning).toMatchObject({ state: "AT_BOUND", side: "LOWER" });
    expect(rows.len_atr2!.bound_warning).toMatchObject({ state: "NEAR_BOUND", side: "LOWER" });
    expect(rows.slpercent!.bound_warning).toMatchObject({ state: "NEAR_BOUND", side: "UPPER" });
    expect(rows.window!.bound_warning).toMatchObject({ state: "INTERIOR", side: null });
    // Exact levels: (max − min) / step + 1.
    expect(rows.window!.levels).toBe(21);
    expect(rows.rvol!.levels).toBe(16);
    expect(rows.slpercent!.levels).toBe(19);
  });

  it("the freeze read carries the same declared rows (S07 prints the same warning as S06)", async () => {
    const service = serviceFor(w5b);
    expect((await freeze(service, w5b.run_id)).declared_space).toEqual((await search(service, w5b.run_id)).declared_space);
  });

  it("an unregistered lane profile answers a typed absence, never the current constants", () => {
    const space = declaredSpace("rs02.delta-wfo-global.v1", theta);
    expect(space).toMatchObject({ state: "NOT_PUBLISHED", reason_code: SURFACE_REASONS.bindingNotRegistered, binding: null, parameters: [] });
    const outside = declaredSpace(LANE_PROFILE, { ...theta, rvol: "9.9" });
    expect(outside).toMatchObject({ state: "NOT_PUBLISHED", reason_code: SURFACE_REASONS.selectionOutsideDeclaration });
  });
});

describe("B3 · the S06 trial surface is derived on the server from every retained trial", () => {
  it("every retained trial is a point placed by the server; nothing was sampled away; roles and best-so-far are published", async () => {
    const response = await search(serviceFor(w5b), w5b.run_id, 1);
    const surface = response.surface;
    // The ledger shows a page of one; the surface still covers all three trials.
    expect(response.ledger.returned_rows).toBe(1);
    expect(surface).toMatchObject({
      state: "AVAILABLE", source_trial_count: 3, complete_trial_count: 3, emitted_point_count: 3,
      point_limit: SURFACE_POINT_LIMIT, sampling: "ALL_RETAINED_TRIALS", objective_kind: "IS_MEAN_SHARPE",
      selected_trial_id: "0", best_is_trial_id: "0",
    });
    expect(surface.axes).toEqual(Object.keys(theta));
    const byId = Object.fromEntries(surface.points.map((point) => [point.trial_id, point]));
    for (const row of w5b.rows.TRIAL) {
      const payload = row.payload as { parameters: Record<string, string>; objective: string };
      const point = byId[row.sourceId]!;
      expect(point.objective).toBe(payload.objective);
      expect(point.source_ordinal).toBe(row.sourceOrdinal);
      expect(point.parameters).toEqual(payload.parameters);
      expect(sha256ResearchJson(point.parameters)).toBe(sha256ResearchJson(payload.parameters));
      for (const parameter of response.declared_space.parameters) {
        expect(point.positions[parameter.name]).toBe(positionPercent(payload.parameters[parameter.name]!, parameter.minimum, parameter.maximum));
      }
    }
    expect(byId["0"]).toMatchObject({ selected: true, best_is: true });
    // The hi-fi ramp: count of quintile thresholds each objective lies above (−3.95 < −2.48 < −1.44).
    expect([byId["1"]!.objective_bucket, byId["2"]!.objective_bucket, byId["0"]!.objective_bucket]).toEqual([0, 2, 4]);
    // Best so far in source order: trial 0 first, and it stays best.
    expect(surface.points.map((point) => point.best_so_far)).toEqual(["-1.4435308120735202", "-1.4435308120735202", "-1.4435308120735202"]);
    expect(surface.objective_ramp).toMatchObject({ minimum: "-3.947864414203043", maximum: "-1.4435308120735202" });
  });

  it("A4 · twelve regions per parameter over the declared range; counts sum to the complete trials; means are exact", async () => {
    const surface = (await search(serviceFor(w5b), w5b.run_id)).surface;
    for (const distribution of surface.distributions.parameters) {
      expect(distribution.bins).toHaveLength(12);
      expect(distribution.bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(3);
      expect(distribution.regions_sampled).toBe(distribution.bins.filter((bin) => bin.count > 0).length);
      expect(distribution.bins[0]!.lower).toBe(distribution.minimum);
      expect(distribution.bins[11]!.upper).toBe(distribution.maximum);
      for (const bin of distribution.bins) expect(bin.count === 0).toBe(bin.mean_objective === null);
    }
    const rvol = surface.distributions.parameters.find((d) => d.name === "rvol")!;
    // rvol 1.2 in trials 0 and 2 → one region; their exact mean; 1.3 alone in the next.
    const shared = rvol.bins.find((bin) => bin.count === 2)!;
    expect(shared.mean_objective).toBe("-1.963054060545"); // −1.96305406054468925, half away from zero
    expect(rvol.regions_sampled).toBe(2);
  });

  it("S06 grid bins every retained COMPLETE trial into a named 6×6 mean-IS-objective rule, even when ledger page is one", async () => {
    const response = await search(serviceFor(w5b), w5b.run_id, 1);
    const grid = response.surface.grid;
    expect(grid).toMatchObject({
      state: "AVAILABLE", rule: "COMPLETE_TRIAL_MEAN_IS_OBJECTIVE_2D_6X6_V1",
      x_param: "window", y_param: "rvol", bins_per_axis: 6, included_trial_count: 3,
    });
    expect(grid?.cells).toHaveLength(36);
    expect(grid?.cells.reduce((sum, cell) => sum + cell.n, 0)).toBe(3);
    expect(grid?.cells.find((cell) => cell.x === 1 && cell.y === 0)).toMatchObject({
      n: 1, mean_is_objective: "-2.482577309016",
    });
    expect(grid?.cells.find((cell) => cell.x === 2 && cell.y === 0)).toMatchObject({
      n: 1, mean_is_objective: "-1.443530812074",
    });
    expect(grid?.cells.find((cell) => cell.x === 0 && cell.y === 0)).toMatchObject({ n: 0, mean_is_objective: null });
  });

  it("B4 · top-decile share at θ*, and A5's Spearman proxy is NOT_APPLICABLE under 8 complete trials", async () => {
    const surface = (await search(serviceFor(w5b), w5b.run_id)).surface;
    expect(surface.parameter_frequency).toMatchObject({ state: "AVAILABLE", pool_count: 1 });
    for (const row of surface.parameter_frequency.parameters) expect(row).toMatchObject({ matching: 1, share_percent: 100 });
    expect(surface.importance).toMatchObject({ state: "NOT_APPLICABLE", reason_code: SURFACE_REASONS.tooFewForImportance });
  });

  it("the Spearman |ρ| proxy is the rank correlation of each parameter with the IS objective (ties averaged)", () => {
    const space = declaredSpace(LANE_PROFILE, theta);
    const trials: SurfaceTrial[] = Array.from({ length: 10 }, (_, index) => ({
      sourceOrdinal: index,
      trialId: String(index),
      state: "COMPLETE" as const,
      objective: String(index - 5),
      parameters: { ...theta, window: String(20 + 2 * index), rvol: index % 2 === 0 ? "1.2" : "1.3", len_atr1: String(20 - index) },
    }));
    const importance = searchSurface({ trials, space, selectedTrialId: "0", bestIsTrialId: "9", objectiveKind: "IS_MEAN_SHARPE" }).importance;
    const byName = Object.fromEntries(importance.parameters.map((row) => [row.name, row]));
    expect(importance.state).toBe("AVAILABLE");
    expect(byName.window!.rho).toBe("1.0000");
    expect(byName.len_atr1!.rho).toBe("-1.0000");
    expect(byName.rvol!.rho).toBe("0.1741");
    expect(byName.rsi_l).toMatchObject({ state: "NOT_APPLICABLE", reason_code: SURFACE_REASONS.constantParameter, rho: null });
  });

  it("beyond 600 trials the surface samples by stride and always keeps the selected and best-IS trials", () => {
    const space = declaredSpace(LANE_PROFILE, theta);
    const trials: SurfaceTrial[] = Array.from({ length: 1_000 }, (_, index) => ({
      sourceOrdinal: index, trialId: `t${index}`, state: "COMPLETE" as const, objective: String(index % 97), parameters: theta,
    }));
    const surface = searchSurface({ trials, space, selectedTrialId: "t999", bestIsTrialId: "t501", objectiveKind: "IS_MEAN_SHARPE" });
    expect(surface.sampling).toBe("STRIDE_KEEPING_SELECTED_AND_BEST_V1");
    expect(surface.emitted_point_count).toBeLessThanOrEqual(SURFACE_POINT_LIMIT);
    expect(surface.points.map((point) => point.trial_id)).toEqual(expect.arrayContaining(["t999", "t501"]));
    expect(surface.source_trial_count).toBe(1_000);
  });

  it("carries every sampled point's exact source-ordinal map, without rounding or guessing selected/best", () => {
    const space = declaredSpace(LANE_PROFILE, theta);
    const trials: SurfaceTrial[] = Array.from({ length: 1_000 }, (_, index) => ({
      sourceOrdinal: index, trialId: `t${index}`, state: index % 9 === 0 ? "PRUNED" : "COMPLETE",
      objective: index % 9 === 0 ? null : String(index % 97),
      parameters: { ...theta, rvol: "2.4000000000000004", window: String(20 + index % 21) },
    }));
    const before = structuredClone(trials);
    const surface = searchSurface({ trials: [...trials].reverse(), space, selectedTrialId: "t999", bestIsTrialId: "t501", objectiveKind: "IS_MEAN_SHARPE" });
    expect(SearchSurfaceSchema.safeParse(surface).success).toBe(true);
    expect(surface.emitted_point_count).toBe(surface.points.length);
    expect(surface.points.some(point => point.selected && point.trial_id === "t999")).toBe(true);
    expect(surface.points.some(point => point.best_is && point.trial_id === "t501")).toBe(true);
    for (const point of surface.points) {
      const source = trials[point.source_ordinal]!;
      expect(point.trial_id).toBe(source.trialId);
      expect(point.parameters).toEqual(source.parameters);
      expect(point.parameters?.rvol).toBe("2.4000000000000004");
      expect(sha256ResearchJson(point.parameters)).toBe(sha256ResearchJson(source.parameters));
    }
    expect(trials).toEqual(before);
    const legacy = structuredClone(surface);
    for (const point of legacy.points) delete point.parameters;
    expect(SearchSurfaceSchema.safeParse(legacy).success).toBe(true);
    const invalid = structuredClone(surface);
    invalid.points[0]!.parameters = { rvol: "2e0" };
    expect(SearchSurfaceSchema.safeParse(invalid).success).toBe(false);
  });

  it("a 400-point surface supplies selected/best parameters beyond the ledger's first 100 rows", async () => {
    const fixture = structuredClone(w5b);
    const template = fixture.rows.TRIAL[0]!;
    fixture.rows.TRIAL = Array.from({ length: 400 }, (_, ordinal) => ({ ...structuredClone(template),
      sourceOrdinal: ordinal, sourceId: String(ordinal), payload: { ...structuredClone(template.payload), trial_id: String(ordinal),
        parameters: { ...theta, rvol: ordinal === 350 ? "2.4000000000000004" : "1.2" } } }));
    fixture.table_rows.TRIAL = 400;
    fixture.summary.selection.trial_id = "350";
    fixture.summary.source_facts.search.raw_best_is_trial_id = "311";
    const service = serviceFor(fixture);
    const small = await search(service, fixture.run_id, 100);
    const large = await search(service, fixture.run_id, 200);
    expect(small.ledger.trials).toHaveLength(100);
    expect(small.ledger.page.has_more).toBe(true);
    expect(small.surface.points).toHaveLength(400);
    expect(small.surface).toEqual(large.surface);
    expect(small.surface.points.find(point => point.selected)).toMatchObject({ trial_id: "350", source_ordinal: 350,
      parameters: fixture.rows.TRIAL[350]!.payload.parameters });
    expect(small.surface.points.find(point => point.best_is)).toMatchObject({ trial_id: "311", source_ordinal: 311,
      parameters: fixture.rows.TRIAL[311]!.payload.parameters });
    for (const row of small.ledger.trials) {
      const point = small.surface.points.find(point => point.source_ordinal === row.source_ordinal)!;
      expect(point.parameters).toEqual(row.parameters);
      expect(sha256ResearchJson(point.parameters)).toBe(row.params_digest);
    }
    expect(Buffer.byteLength(JSON.stringify(large))).toBeLessThan(1_048_576);
  });
});

describe("B4 · CG-P16-02 · binding down to Stage 4 is compared on the server", () => {
  it("real W5b seal: the sealed θ* is the candidate every fold's generation child ran, under one strategy fingerprint — BOUND", async () => {
    const binding = (await freeze(serviceFor(w5b), w5b.run_id)).stage4_binding;
    const frozen = quantbtCandidateId(theta, DEFAULT_PARAMETER_BINDING_REGISTRY.byRetainedLaneProfile(LANE_PROFILE)!.candidateParameterKinds);
    expect(frozen).toBe("2671e27b827ab2701d52e6ce");
    expect(binding).toMatchObject({ lane: "RS02_RETAINED_CHILD_AUDIT", state: "BOUND", reason_code: null, pairs: { params: "MATCH", bundle: "MATCH" } });
    // The θ* digest Screen 07 copies is P11's fold params_digest: sha256 of the canonical sealed map.
    expect(binding.sealed_params_sha256).toBe(sha256ResearchJson(theta));
    const [sealedParams, replayParams, sealedBundle, runtimeBundle] = binding.rows;
    expect(sealedParams).toMatchObject({ key: "SEALED_PARAMS", value: frozen, state: "MATCH" });
    expect(replayParams).toMatchObject({ key: "REPLAY_PARAMS", value: frozen, state: "MATCH" });
    expect(replayParams!.folds.map((fold) => [fold.fold_id, fold.audit_ordinal, fold.state])).toEqual([["0", 10, "MATCH"], ["1", 11, "MATCH"]]);
    expect(sealedBundle).toMatchObject({ key: "SEALED_BUNDLE", state: "MATCH", value: expect.stringMatching(/^92cb6412/) });
    expect(runtimeBundle).toMatchObject({ key: "RUNTIME_BUNDLE", state: "MATCH", value: sealedBundle!.value });
  });

  it("a generation child that ran another candidate DRIFTs on that fold only, and the sealed side keeps its tick", async () => {
    const rows = structuredClone(w5b.rows);
    const records = (rows.FOLD[1]!.payload as any).child_audit.records as Array<Record<string, unknown>>;
    records.find((record) => record.context === "out-of-sample generation")!.candidate_id = "baf7c707c2436a55bb012a15";
    const binding = (await freeze(serviceFor(w5b, rows), w5b.run_id)).stage4_binding;
    expect(binding).toMatchObject({ state: "DRIFT", pairs: { params: "MISMATCH", bundle: "MATCH" } });
    expect(binding.rows[0]).toMatchObject({ state: "MATCH" });
    expect(binding.rows[1]).toMatchObject({ state: "MISMATCH", value: null });
    expect(binding.rows[1]!.folds.map((fold) => fold.state)).toEqual(["MATCH", "MISMATCH"]);
  });

  it("a runtime strategy fingerprint that differs from the selection-stage one DRIFTs the bundle", async () => {
    const rows = structuredClone(w5b.rows);
    const records = (rows.FOLD[0]!.payload as any).child_audit.records as Array<Record<string, unknown>>;
    records.find((record) => record.context === "out-of-sample generation")!.strategy_fingerprint = "e".repeat(64);
    const binding = (await freeze(serviceFor(w5b, rows), w5b.run_id)).stage4_binding;
    expect(binding).toMatchObject({ state: "DRIFT", pairs: { params: "MATCH", bundle: "MISMATCH" } });
    expect(binding.rows[3]!.folds.map((fold) => fold.state)).toEqual(["MISMATCH", "MATCH"]);
  });

  it("a seal retained before the child audit is NOT_COMPARED with the seal's own reason — no tick", async () => {
    const binding = (await freeze(serviceFor(w3), w3.run_id)).stage4_binding;
    expect(binding).toMatchObject({ state: "NOT_COMPARED", reason_code: STAGE4_REASONS.childAuditNotRetained });
    expect(binding.rows[1]).toMatchObject({ state: "NOT_PUBLISHED", reason_code: STAGE4_REASONS.childAuditNotRetained });
    expect(binding.rows[2]).toMatchObject({ state: "NOT_PUBLISHED", reason_code: STAGE4_REASONS.childAuditNotRetained });
  });

  it("P04 lane: the registered bundle and adapter vs what the P04 child executed", () => {
    const digest = bundleDigest(P04_DELTA_FIXED_PARAMETERS);
    const adapter = "a".repeat(64);
    expect(fixedStage4Binding({ expectedBundleDigest: digest, observedBundleDigest: digest, expectedAdapterDigest: adapter, observedAdapterDigest: adapter, missingReason: "X_MISSING" }))
      .toMatchObject({ lane: "P04_FIXED_QUALIFICATION", state: "BOUND", sealed_params_sha256: digest });
    const drift = fixedStage4Binding({ expectedBundleDigest: digest, observedBundleDigest: "b".repeat(64), expectedAdapterDigest: adapter, observedAdapterDigest: adapter, missingReason: "X_MISSING" });
    expect(drift).toMatchObject({ state: "DRIFT", pairs: { params: "MISMATCH", bundle: "MATCH" } });
    expect(drift.rows.map((row) => row.state)).toEqual(["MATCH", "MISMATCH", "MATCH", "MATCH"]);
    const missing = fixedStage4Binding({ expectedBundleDigest: null, observedBundleDigest: digest, expectedAdapterDigest: adapter, observedAdapterDigest: adapter, missingReason: "X_MISSING" });
    expect(missing).toMatchObject({ state: "NOT_COMPARED", reason_code: "X_MISSING" });
    expect(missing.rows[1]).toMatchObject({ state: "NOT_PUBLISHED", reason_code: STAGE4_REASONS.sealedSideMissing });
    for (const value of [drift, missing]) hubStage4Validator.assert(value);
  });

  it("the P04 hub freeze read serves the binding from its own checks; a bundle drift is DRIFT, never a tick", async () => {
    const digest = P04_DELTA_ADAPTER_CONTRACT_DIGEST;
    const read = async (bundle: Record<string, number>) => {
      const repository = { hub: vi.fn().mockResolvedValue(p04Row(bundle, digest)) };
      const detail = await new ResearchFreezeService(repository as never, { FEATURE_RESEARCH_FREEZE: "true" } as never).detail(scope, "run_x2", {});
      hubFreezeValidator.assert(detail);
      return detail;
    };
    const bound = await read(P04_DELTA_FIXED_PARAMETERS);
    expect(bound.stage4_binding).toMatchObject({ lane: "P04_FIXED_QUALIFICATION", state: "BOUND", pairs: { params: "MATCH", bundle: "MATCH" } });
    expect(bound.stage4_binding.rows.map((row) => row.value)).toEqual([
      bundleDigest(P04_DELTA_FIXED_PARAMETERS), bundleDigest(P04_DELTA_FIXED_PARAMETERS), digest, digest,
    ]);
    expect(bound.parameter_authority.declared.names).toEqual(Object.keys(P04_DELTA_DECLARED_CONTRACT.parameter_space));
    const drifted = await read({ ...P04_DELTA_FIXED_PARAMETERS, rvol: 1.9 });
    expect(drifted.stage4_binding).toMatchObject({ state: "DRIFT", pairs: { params: "MISMATCH" } });
    expect(drifted.freeze.integrity.state).toBe("BLOCKED");
  });
});

describe("B4 · CG-P16-03 / P16-T14 · code-fixed values and the hash scope of every parameter", () => {
  it("declared (swept or pinned) values are in the params digest; code-fixed values are a typed absence under the code digest", async () => {
    const authority = (await freeze(serviceFor(w5b), w5b.run_id)).parameter_authority;
    expect(authority.declared).toEqual({ hash_scope: "PARAMS_DIGEST", names: Object.keys(theta) });
    expect(authority.code_fixed).toMatchObject({
      state: "NOT_PUBLISHED",
      reason_code: "P04_DELTA_KERNEL_PUBLISHES_NO_CODE_FIXED_VALUE_LIST",
      values: [],
      hash_scope: "ADAPTER_CONTRACT_DIGEST",
      code_digest: P04_DELTA_DECLARED_CONTRACT.provenance.protected_kernel_sha256,
      specification_digest: P04_DELTA_DECLARED_CONTRACT.provenance.specification_sha256,
      adapter_contract_digest: DELTA_WFO_PROFILE.adapter_contract_digest,
    });
  });

  it("P16-T14: changing the protected code moves the adapter contract digest and never the params digest", () => {
    const canonical = (value: unknown) => createHash("sha256").update(JSON.stringify(sortKeys(value)), "utf8").digest("hex");
    const contract = (kernel: string) => canonical({
      schema_version: "research.p04-delta-binding.v1",
      alpha_id: "delta-rsi-polynomial-alpha",
      alpha_version_id: "av_delta_rsi_polynomial_alpha_1_0_0",
      declared_contract: { ...P04_DELTA_DECLARED_CONTRACT, provenance: { ...P04_DELTA_DECLARED_CONTRACT.provenance, protected_kernel_sha256: kernel } },
      fixed_parameters: P04_DELTA_FIXED_PARAMETERS,
    });
    const installed = contract(P04_DELTA_DECLARED_CONTRACT.provenance.protected_kernel_sha256);
    expect(installed).toBe(DELTA_WFO_PROFILE.adapter_contract_digest);
    expect(contract("0".repeat(64))).not.toBe(installed);
    // θ digest is the canonical parameter map alone: the code is outside it.
    expect(sha256ResearchJson(theta)).toBe(canonical(theta));
    const binding = DEFAULT_PARAMETER_BINDING_REGISTRY.byRetainedLaneProfile(LANE_PROFILE)!;
    expect(parameterAuthority({ names: Object.keys(theta), codeFixed: binding.codeFixed, adapterContractDigest: installed }).code_fixed.adapter_contract_digest).toBe(installed);
  });
});

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, sortKeys(v)]));
  }
  return value;
}

/** A P04 hub row (the W5a A10b helper): the P14 receipt names the bundle the P04 child executed. */
function p04Row(bundle: Record<string, number>, adapterDigest: string) {
  const original = p14SplitSourceFixture();
  const source = {
    ...original,
    protocol: { ...original.protocol, selection: { ...original.protocol.selection, parameter_bundle_digest: sha256ResearchJson(bundle) } },
  };
  return {
    kind: "DURABLE" as const,
    runId: "run_x2",
    adapterContractDigest: adapterDigest,
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
    receivedAt: new Date("2026-09-22T00:00:00.000Z"),
    asOfUtcMs: 1_727_000_000_000,
    sourceAsOfUtcMs: 1_727_000_000_000,
    sourceAsOfBasis: "P14_PROJECTION_RECEIVED_AT" as const,
  };
}

/** Canonical fixtures for Screens 06/07 (the real W5b seal through this service). */
describe("X2 · published current-source search/freeze fixtures", () => {
  const root = join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures");
  const files = { search: "research-current-source.search-surface.valid.json", freeze: "research-current-source.freeze-binding.valid.json" } as const;

  it("writes (opt-in, X2_WRITE_FIXTURES=1) and validates the committed fixtures against Zod and OpenAPI", async () => {
    if (process.env.X2_WRITE_FIXTURES === "1") {
      const service = serviceFor(w5b);
      writeFileSync(join(root, files.search), `${JSON.stringify(await search(service, w5b.run_id))}\n`);
      writeFileSync(join(root, files.freeze), `${JSON.stringify(await freeze(service, w5b.run_id))}\n`);
    }
    const searchBody = JSON.parse(readFileSync(join(root, files.search), "utf8"));
    const freezeBody = JSON.parse(readFileSync(join(root, files.freeze), "utf8"));
    expect(ResearchCurrentSourceSearchResponseSchema.safeParse(searchBody).success).toBe(true);
    searchValidator.assert(searchBody);
    expect(ResearchCurrentSourceFreezeResponseSchema.safeParse(freezeBody).success).toBe(true);
    freezeValidator.assert(freezeBody);
    // The committed bodies are what this service serves today: drift fails here, not in a browser.
    const service = serviceFor(w5b);
    expect(searchBody.surface).toEqual((await search(service, w5b.run_id)).surface);
    expect(searchBody.declared_space).toEqual((await search(service, w5b.run_id)).declared_space);
    expect(freezeBody.stage4_binding).toEqual((await freeze(service, w5b.run_id)).stage4_binding);
    expect(freezeBody.parameter_authority).toEqual((await freeze(service, w5b.run_id)).parameter_authority);
  });
});
