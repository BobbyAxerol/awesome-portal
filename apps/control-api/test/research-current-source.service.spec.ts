import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ResearchCurrentSourceService, currentSourceReadRevision, currentSourceSealDigest, currentSourceFactRevision } from "../src/research/current-source.service";
import { mockSearchRepository } from "./research-search-inputs.fixture";
import { wfoRequested } from "./research-w1-wfo.fixture";
import { P04_DELTA_BINDING } from "../src/research/p04-delta.binding";
import { executionRecipes } from "../src/research/execution-recipes";
import { sha256ResearchJson } from "../src/research/preflight.service";
import type { ResearchCurrentSourceNotApplicableResponse } from "../src/research/current-source.contract";
import { p11StageEvents, POOL_FREEZE_CLOCK_ABSENT } from "../src/research/p11-stage-events";

/** RF-05: these fixtures are sealed RS-02 runs; a not-applicable lane answer here is a test failure. */
function sealed<T>(value: T | ResearchCurrentSourceNotApplicableResponse): T {
  if ((value as { schema_version?: string }).schema_version === "research.current-source-not-applicable.v1") {
    throw new Error("expected a sealed current-source response");
  }
  return value as T;
}
import {
  currentSourceImportDigest,
  type CurrentSourceSealRow,
} from "../src/research/current-source.repository";

const scope = { workspaceId: "rs02-workspace", actorUserId: "rs02-user" };

const seal: CurrentSourceSealRow = {
  runId: "run-rs02",
  artifactRevision: 1,
  sourceAdapterId: "rs02.quantbt-advanced-wfo.v1",
  profileId: "rs02.delta-wfo-global.v1",
  manifestDigest: "a".repeat(64),
  sourceTransformDigest: "b".repeat(64),
  retainedImportDigest: "f".repeat(64),
  requestedSpecDigest: "c".repeat(64),
  effectiveSpecDigest: "d".repeat(64),
  datasetBindingDigest: "e".repeat(64),
  tableRows: { OBSERVATION: 3, FOLD: 2, TRIAL: 2, CANDIDATE: 1, SELECTION: 1 },
  totalRows: 9,
  retainedAtUtcMs: 1_725_000_000_000,
  summary: {
    schema_version: "research.current-source-summary.v1",
    derived_scope: "OUTER_TEST_UNION_INCLUSIVE_V1",
    metrics: {
      initial_equity: "100", final_equity: "110", net_return_fraction: "0.1", max_drawdown_fraction: "-0.02",
    },
    selection: { trial_id: "trial-1", objective: "0.1", parameters: { window: "20" } },
    data_use: {
      warmup: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_WARMUP" },
      purge: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_PURGE" },
      embargo: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_EMBARGO" },
      strict_outer_oos_selection: { state: "NOT_PUBLISHED", reason_code: "SOURCE_DID_NOT_PUBLISH_STRICT_OOS" },
    },
    derived: {
      monthly_returns: {
        source_observation_count: 3, emitted_point_count: 1, total_period_count: 1,
        omitted_leading_period_count: 1, omitted_transport_period_count: 0, sampling: "FULL",
        values: [{ month_start_utc_ms: 1_704_067_200_000, return_fraction: "0.1" }],
      },
      rolling_returns_20: {
        source_observation_count: 0, emitted_point_count: 0, window_observations: 20,
        sampling: "NOT_APPLICABLE", values: [],
      },
      return_distribution: {
        state: "AVAILABLE", reason_code: null, source_observation_count: 3, emitted_point_count: 2,
        sampling: "FULL_RETURN_HISTOGRAM_V2",
        values: [
          { lower_inclusive: "-0.02", upper: "0", upper_inclusive: "false", count: "1" },
          { lower_inclusive: "0", upper: "0.05", upper_inclusive: "true", count: "2" },
        ],
      },
    },
  },
};

const observations = [0, 1, 2].map((ordinal) => ({
  sourceOrdinal: ordinal,
  sourceId: `2024-01-0${ordinal + 1}T00:00:00Z`,
  occurredAtUtcMs: 1_704_067_200_000 + ordinal * 86_400_000,
  payload: {
    source_index_utc: `2024-01-0${ordinal + 1}T00:00:00Z`,
    at_utc_ms: 1_704_067_200_000 + ordinal * 86_400_000,
    equity: String(100 + ordinal * 5), return_fraction: ordinal === 0 ? "0" : "0.05",
    accepted_position: "0.4", drawdown_fraction: ordinal === 1 ? "-0.02" : "0", signal_target: "0.5",
  },
}));

const folds = [0, 1].map((ordinal) => ({
  sourceOrdinal: ordinal, sourceId: `fold-${ordinal}`, occurredAtUtcMs: null,
  payload: {
    fold_id: `fold-${ordinal}`,
    train_start_utc_ms: 1_704_067_200_000 + ordinal * 86_400_000,
    train_end_utc_ms: 1_704_153_600_000 + ordinal * 86_400_000,
    test_start_utc_ms: 1_704_240_000_000 + ordinal * 86_400_000,
    test_end_utc_ms: 1_704_326_400_000 + ordinal * 86_400_000,
  },
}));

const trials = [0, 1].map((ordinal) => ({
  sourceOrdinal: ordinal, sourceId: `trial-${ordinal}`, occurredAtUtcMs: null,
  payload: { trial_id: `trial-${ordinal}`, state: "COMPLETE", objective: `0.${ordinal + 1}`, parameters: { window: String(10 + ordinal) } },
}));

const candidates = [{
  sourceOrdinal: 0, sourceId: "candidate-0", occurredAtUtcMs: null,
  payload: { candidate_id: "candidate-0", objective: "0.2", parameters: { window: "20" } },
}];

function page(rows: Array<{ sourceOrdinal: number; sourceId: string; occurredAtUtcMs: number | null; payload: Record<string, unknown> }>, totalRows = rows.length) {
  return { rows, hasMore: false, hasPrevious: false, totalRows };
}

function service(repository: Record<string, unknown>) {
  return new ResearchCurrentSourceService(mockSearchRepository({ admittedRequestedSpec: vi.fn().mockResolvedValue(null), ...repository }) as never, {
    FEATURE_RESEARCH_CURRENT_SOURCE: "true",
    QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
    QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
    QUERY_CURSOR_TTL_SECONDS: 900,
  } as never);
}

describe("RS-02 retained current-source named read models", () => {
  it("pages a 620-member candidate census separately without losing trial rows or accepting a trial cursor", async () => {
    const source = {...seal, tableRows:{...seal.tableRows,CANDIDATE:620}};
    const retained = Array.from({length:620},(_,n)=>({...candidates[0]!,sourceOrdinal:n,
      sourceId:`candidate-${n}`,payload:{...candidates[0]!.payload,candidate_id:`candidate-${n}`}}));
    const current = new ResearchCurrentSourceService({searchForRead:vi.fn().mockResolvedValue({seal:source,
      inputs:{requestedSpec:null,trials,candidates:retained,folds,stageEvents:p11StageEvents()}})} as never,{
      FEATURE_RESEARCH_CURRENT_SOURCE:"true", QUERY_CURSOR_ACTIVE_KEY_ID:"query-k1",
      QUERY_CURSOR_KEYS_JSON:'{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
      QUERY_CURSOR_TTL_SECONDS:900,
    } as never);
    const first = sealed(await current.search(scope,source.runId,{limit:1}));
    expect(first.candidates).toMatchObject({source_candidate_count:620,returned_rows:50,
      page:{limit:50,has_more:true,has_previous:false}});
    expect(first.ledger.source_trial_count).toBe(2);
    const ids = [...first.candidates.rows.map(row=>row.candidate_id)];
    let cursor = first.candidates.page!.next_cursor;
    while(cursor){
      const next=sealed(await current.search(scope,source.runId,{limit:1,candidate_cursor:cursor}));
      ids.push(...next.candidates.rows.map(row=>row.candidate_id));
      cursor=next.candidates.page!.next_cursor;
    }
    expect(ids).toHaveLength(620);expect(new Set(ids).size).toBe(620);
    await expect(current.search(scope,source.runId,{limit:1,candidate_cursor:first.ledger.page.next_cursor!}))
      .rejects.toMatchObject({status:400});
    await expect(current.search(scope,source.runId,{limit:1,cursor:first.candidates.page!.next_cursor!}))
      .rejects.toMatchObject({status:400});
  });
  it("Evidence reads a complete expanded candidate pool beyond64 without widening old seal bounds", async () => {
    const recipe = executionRecipes.find(r => r.descriptor.schema_version === "research.expanded-trial-profile.v1"
      && r.public_profile.optimization_mode === "mode_5_full_robust" && r.public_profile.timeframe === "1h")!;
    const pair = (recipe.descriptor as {current_source: {profile_id: string; source_adapter_id: string}}).current_source;
    const source = {...seal, profileId: pair.profile_id, sourceAdapterId: pair.source_adapter_id,
      tableRows: {...seal.tableRows, CANDIDATE: 100}, totalRows: seal.totalRows + 99};
    const pool = Array.from({length: 100}, (_, n) => ({...candidates[0]!, sourceOrdinal: n,
      sourceId: `candidate-${n}`, payload: {...candidates[0]!.payload, candidate_id: `candidate-${n}`}}));
    const rows = vi.fn().mockImplementation((_s, _r, _v, kind) => page(kind === "FOLD" ? folds : pool));
    const result = sealed(await service({sealForRead: vi.fn().mockResolvedValue(source), rows}).evidence(scope, source.runId));
    expect(result.passport.artifact_table_rows.candidates).toBe(100);
    expect(rows.mock.calls.find(call => call[3] === "CANDIDATE")![4]).toEqual({limit: 400});
    await expect(service({sealForRead: vi.fn().mockResolvedValue({...source,
      profileId: seal.profileId, sourceAdapterId: seal.sourceAdapterId}), rows}).evidence(scope, source.runId)).rejects.toMatchObject({status: 503});
  });
  it("P24 discloses immutable parameters without repinning seal/cursors or fabricating sampler trace", async () => {
    const requested = wfoRequested();
    const source = { ...seal, requestedSpecDigest: sha256ResearchJson(requested) };
    const rows = vi.fn().mockImplementation((_scope, _runId, _revision, kind: string) =>
      page(kind === "FOLD" ? folds : kind === "TRIAL" ? trials : candidates));
    const repository = { sealForRead: vi.fn().mockResolvedValue(source), rows,
      admittedRequestedSpec: vi.fn().mockResolvedValue(requested) };
    const without = sealed(await service(repository).search(scope, source.runId, { limit: 100 }));
    const bound = { ...source, runDeclarationInputs: {
      alphaId: P04_DELTA_BINDING.alphaId, alphaVersionId: P04_DELTA_BINDING.alphaVersionId,
      declaredContract: P04_DELTA_BINDING.declaredContract, entrypoint: P04_DELTA_BINDING.entrypoint,
      requestedSpec: requested, requestedSpecDigest: source.requestedSpecDigest,
    } };
    repository.sealForRead.mockResolvedValue(bound);
    const withDeclaration = sealed(await service(repository).search(scope, source.runId, { limit: 100 }));
    expect(withDeclaration.run_declaration?.state).toBe("AVAILABLE");
    expect(withDeclaration.revision).toBe(without.revision);
    expect(withDeclaration.source_revision).toBe(without.source_revision);
    expect(withDeclaration.ledger.page).toEqual(without.ledger.page);
    expect(withDeclaration.etag).not.toBe(without.etag);
    expect(currentSourceSealDigest(bound)).toBe(currentSourceSealDigest(source));
    expect(withDeclaration.sampler_evidence).toMatchObject({
      requested_configuration: { state: "AVAILABLE", scope: "RUN_REQUESTED_SPEC", optimization_config: {}, random_seed: 42 },
      internal_trace: { state: "NOT_PUBLISHED" }, observed_trials: { source_trial_count: 2 },
    });
  });
  it("§32 separates retained source identity from presentation and view identity", () => {
    const split = currentSourceFactRevision("split", seal);
    const replay = currentSourceFactRevision("replay", seal);
    expect(split).not.toBe(replay);
    expect(split.slice("rs02_split_".length)).toBe(replay.slice("rs02_replay_".length));
    expect(currentSourceReadRevision("split", seal)).not.toBe(split);
    expect(currentSourceFactRevision("split", { ...seal, manifestDigest: "9".repeat(64) })).not.toBe(split);
  });
  it("publishes digest-bound Replay IDs and fold metadata without changing source pins or issuing duplicate fold reads", async () => {
    const request = wfoRequested();
    const source = { ...seal, requestedSpecDigest: sha256ResearchJson(request) };
    const original = currentSourceSealDigest(source);
    const admittedRequestedSpec = vi.fn().mockResolvedValue(request);
    const rows = vi.fn().mockImplementation((_scope, _runId, _revision, kind: string) =>
      kind === "FOLD" ? page(folds, 2) : page(observations, 3));
    const current = service({ sealForRead: vi.fn().mockResolvedValue(source), admittedRequestedSpec, rows });
    const first = sealed(await current.replay(scope, source.runId, { limit: 100 }));
    expect(first.identity).toMatchObject({ ...request.alpha_binding, availability: { state: "AVAILABLE" } });
    expect(first.is_window).toMatchObject({ bounds_semantics: "SOURCE_RETAINED_FOLD_BOUNDS", bars: null,
      availability: { reason_code: "REPLAY_RETAINED_FOLD_BAR_COUNTS_NOT_PUBLISHED" } });
    expect(first.is_window!.segments).toHaveLength(2);
    expect(first.revision).toBe(`rs02_replay_${original}`);
    expect(first.presentation_revision).toBe("research.replay-navigation.v1");
    expect(rows.mock.calls.filter(call => call[3] === "FOLD")).toHaveLength(1);
    expect(admittedRequestedSpec).toHaveBeenCalledWith(scope, source.runId, source.requestedSpecDigest, undefined);
    expect(currentSourceSealDigest(source)).toBe(original);
    admittedRequestedSpec.mockResolvedValue({ ...request, alpha_binding: { alpha_id: "foreign", alpha_version_id: "foreign" } });
    const next = sealed(await current.replay(scope, source.runId, { limit: 100 }));
    expect(next.identity!.alpha_id).toBeNull();
    expect(next.presentation_digest).not.toBe(first.presentation_digest);
    expect(next.revision).toBe(first.revision);
  });
  it("publishes source-bound orchestration clocks separately and binds Search/Freeze cursors and ETags to them", async () => {
    const stageEventClocks = vi.fn().mockResolvedValue(p11StageEvents("a".repeat(64), {
      s3_completed_utc_ms: 10, s4_started_utc_ms: 11, s4_completed_utc_ms: 40,
    }));
    const repository = {
      sealForRead: vi.fn().mockResolvedValue(seal), stageEventClocks,
      rows: vi.fn().mockImplementation((_scope, _runId, _revision, kind: string) =>
        page(kind === "FOLD" ? folds : kind === "TRIAL" ? trials : candidates)),
      verifyRetainedImport: vi.fn().mockResolvedValue(seal.retainedImportDigest),
    };
    const current = service(repository);
    const immutableSealDigest = currentSourceSealDigest(seal);
    const search = sealed(await current.search(scope, seal.runId, { limit: 1 }));
    const freeze = sealed(await current.freeze(scope, seal.runId));
    expect(search.stage_events).toEqual(await stageEventClocks());
    expect(search.pool).toMatchObject({ frozen_at_utc_ms: null, frozen_at_source: null, frozen_at_reason_code: POOL_FREEZE_CLOCK_ABSENT });
    expect(freeze.fold_ordering.stage_events).toEqual(search.stage_events);
    expect(freeze.fold_ordering.wall_clock.state).toBe("NOT_PUBLISHED");
    expect(freeze.stage4_binding.sealed_params_sha256).toBe(sha256ResearchJson(seal.summary.selection.parameters));
    expect(stageEventClocks).toHaveBeenCalledWith(scope, seal, undefined);

    stageEventClocks.mockResolvedValue(p11StageEvents("a".repeat(64), {
      s3_completed_utc_ms: 10, s4_started_utc_ms: 11, s4_completed_utc_ms: 41,
    }));
    const changedSearch = sealed(await current.search(scope, seal.runId, { limit: 1 }));
    const changedFreeze = sealed(await current.freeze(scope, seal.runId));
    expect(changedSearch.revision).not.toBe(search.revision);
    expect(changedSearch.etag).not.toBe(search.etag);
    expect(changedFreeze.revision).not.toBe(freeze.revision);
    expect(changedFreeze.etag).not.toBe(freeze.etag);
    expect(changedFreeze.stage4_binding).toEqual(freeze.stage4_binding);
    expect(search.ledger.page.next_cursor).not.toBeNull();
    await expect(current.search(scope, seal.runId, { limit: 1, cursor: search.ledger.page.next_cursor! }))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    expect(currentSourceSealDigest(seal)).toBe(immutableSealDigest);
  });

  it("maps actual retained-source fields into five named screen models without a source call", async () => {
    const repository = {
      sealForRead: vi.fn().mockResolvedValue(seal),
      runState: vi.fn(),
      rows: vi.fn().mockImplementation((_scope, _runId, _revision, kind: string) => {
        if (kind === "OBSERVATION") return page(observations, 3);
        if (kind === "FOLD") return page(folds, 2);
        if (kind === "TRIAL") return page(trials, 2);
        if (kind === "CANDIDATE") return page(candidates, 1);
        throw new Error(`unexpected ${kind}`);
      }),
      observationSeries: vi.fn().mockResolvedValue({ rows: observations, sampling: "FULL", extremaEmitted: true }),
      verifyRetainedImport: vi.fn().mockResolvedValue("f".repeat(64)),
    };
    const current = service(repository);
    const evidence = sealed(await current.evidence(scope, "run-rs02"));
    const split = sealed(await current.split(scope, "run-rs02"));
    const search = sealed(await current.search(scope, "run-rs02", { limit: 100 }));
    expect(search.pool.frozen_at_utc_ms).toBeNull();
    expect(search.pool.frozen_at_source).toBeNull();
    expect(search.pool.frozen_at_reason_code).toBe(POOL_FREEZE_CLOCK_ABSENT);
    const freeze = sealed(await current.freeze(scope, "run-rs02"));
    const initialReplay = sealed(await current.replay(scope, "run-rs02", { limit: 100 }));
    const replay = sealed(await current.replay(scope, "run-rs02", {
      limit: 100,
      at: initialReplay.replay.rows[1]!.playback_cursor,
    }));

    expect(evidence.passport.artifact_table_rows).toMatchObject({ observations: 3, trials: 2 });
    expect(split.fold_plan.folds).toHaveLength(2);
    expect(split.revision).toBe(currentSourceReadRevision("split", seal));
    expect(split.source_revision).toBe(currentSourceFactRevision("split", seal));
    expect(split.presentation_revision).toBe(split.etag.slice(1, -1));
    expect(search.source_revision).toBe(currentSourceFactRevision("search", seal));
    expect(search.presentation_revision).toBe(search.revision);
    expect(freeze.source_revision).toBe(currentSourceFactRevision("freeze", seal));
    expect(freeze.presentation_revision).toBe(freeze.revision);
    expect(split.etag).not.toBe(`"${split.revision}"`);
    expect(sealed(await current.split(scope, "run-rs02")).etag).toBe(split.etag);
    expect(split.guards.train_test_disjoint).toMatchObject({
      verdict: "NOT_CHECKABLE", reason_code: "S05_TEMPORAL_GUARDS_NOT_PUBLISHED",
    });
    expect(search.ledger.trials).toHaveLength(2);
    expect(search.candidates.rows).toHaveLength(1);
    expect(search.selection.selected_trial_id).toBe("trial-1");
    expect(freeze.integrity).toMatchObject({
      state: "MATCH",
      retained_row_count: 9,
      verification_scope: "PORTAL_RETAINED_MANIFEST_ROW_COUNTS_AND_BATCH_RECEIPT",
    });
    expect(replay.replay.state_at_cursor).toMatchObject({
      state: "AVAILABLE_RETAINED_MODEL_SAMPLE", source_ordinal: 1, accepted_position: "0.4",
    });
    expect(replay.route_capabilities.model_positions.state).toBe("AVAILABLE");
    expect(replay.route_capabilities.fills.reason_code).toBe("QUANTBT_ADVANCED_WFO_DID_NOT_PUBLISH_AUDITED_FILLS");
    const distribution = sealed(await current.evidenceSeries(scope, "run-rs02", "RETURN_DISTRIBUTION"));
    expect(distribution.values).toHaveLength(2);
    expect(repository.rows).toHaveBeenCalled();
  });
  it("AN-29 adds v2 only to Evidence while preserving the immutable seal and unrelated revisions", async () => {
    const analytics = JSON.parse(readFileSync(join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures/research-retained-analytics-v2.fixed.valid.json"), "utf8"));
    const withSidecar: CurrentSourceSealRow = { ...seal, analyticsSidecar: {
      digest: sha256ResearchJson(analytics), sourceRowsDigest: "1".repeat(64), analytics,
    } };
    expect(currentSourceSealDigest(withSidecar)).toBe(currentSourceSealDigest(seal));
    const read = (source: CurrentSourceSealRow) => service({
      sealForRead: vi.fn().mockResolvedValue(source),
      rows: vi.fn().mockImplementation((_scope, _runId, _revision, kind: string) =>
        kind === "FOLD" ? page(folds, 2) : page(candidates, 1)),
    }).evidence(scope, "run-rs02");
    const oldEvidence = sealed(await read(seal));
    const newEvidence = sealed(await read(withSidecar));
    expect(newEvidence.revision).not.toBe(oldEvidence.revision);
    expect(newEvidence.summary_analytics_v2).toEqual(analytics);
  });


  it("LW-04: immutable pre-fix seals do not publish pre-OOS derived rows as OOS", async () => {
    const oldSeal = structuredClone(seal);
    delete (oldSeal.summary as Record<string, unknown>).derived_scope;
    const repository = { sealForRead: vi.fn().mockResolvedValue(oldSeal), runState: vi.fn() };
    const current = service(repository);
    for (const kind of ["MONTHLY_RETURNS", "ROLLING_RETURNS_20", "RETURN_DISTRIBUTION"] as const) {
      const response = sealed(await current.evidenceSeries(scope, "run-rs02", kind));
      expect(response.availability).toEqual({
        state: "NOT_PUBLISHED", reason_code: "PORTAL_DERIVED_SERIES_SCOPE_NOT_OOS",
      });
      expect(response.values).toEqual([]);
      expect(response.source_sample.emitted_point_count).toBe(0);
    }
    const modern = service({ sealForRead: vi.fn().mockResolvedValue(seal), runState: vi.fn() });
    const distribution = sealed(await modern.evidenceSeries(scope, "run-rs02", "RETURN_DISTRIBUTION"));
    expect(distribution.values).toHaveLength(2);
  });

  it("B6 reads one shared all-time block, updates ETags and leaves the original seal identity intact", async () => {
    const enriched = JSON.parse(readFileSync(join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures/research-enriched-analysis.healthy.valid.json"), "utf8"));
    const oldSeal = structuredClone(seal);
    oldSeal.runId = enriched.run_id;
    delete (oldSeal.summary as Record<string, unknown>).derived_scope;
    const enrichedSeal = { ...oldSeal, enrichedAnalysis: enriched };
    expect(currentSourceSealDigest(enrichedSeal)).toBe(currentSourceSealDigest(oldSeal));
    const forbidden = vi.fn(() => { throw new Error("GET must not reread or calculate retained source"); });
    const old = service({ sealForRead: vi.fn().mockResolvedValue(oldSeal), rows: forbidden });
    const current = service({ sealForRead: vi.fn().mockResolvedValue(enrichedSeal), rows: forbidden });
    for (const kind of ["MONTHLY_RETURNS", "RETURN_DISTRIBUTION"] as const) {
      const before = sealed(await old.evidenceSeries(scope, enriched.run_id, kind));
      const after = sealed(await current.evidenceSeries(scope, enriched.run_id, kind));
      expect(after.availability.state).toBe("AVAILABLE");
      expect(after.etag).not.toBe(before.etag);
      expect(after.source_sample.derivation?.input_digest).toBe(enriched.input_digest);
      expect(after.values.length).toBe(kind === "MONTHLY_RETURNS" ? 3 : 12);
    }
    expect(forbidden).not.toHaveBeenCalled();
    // Existing Hub passport still legitimately reads bounded fold/candidate
    // facts; those aren't a request-time enrichment calculation.
    const hubReader = service({ sealForRead: vi.fn().mockResolvedValue(enrichedSeal),
      rows: vi.fn().mockImplementation((_scope, _run, _revision, kind) => page(kind === "FOLD" ? folds : candidates)) });
    const hub = sealed(await hubReader.evidence(scope, enriched.run_id));
    expect(hub.enriched_analysis).toEqual(enriched);
    expect(hub.enriched_analysis_availability).toEqual({ state: "AVAILABLE", reason_code: null });
    const oldHubReader = service({ sealForRead: vi.fn().mockResolvedValue(oldSeal),
      rows: vi.fn().mockImplementation((_scope, _run, _revision, kind) => page(kind === "FOLD" ? folds : candidates)) });
    const oldHub = sealed(await oldHubReader.evidence(scope, enriched.run_id));
    expect(oldHub.enriched_analysis_availability).toEqual({ state: "NOT_PUBLISHED", reason_code: "SEALED_ENRICHMENT_NOT_COMPUTED" });
  });

  it("BR-F6: old seals read verified precomputed companions without source queries or seal revision changes", async () => {
    const distributions = JSON.parse(readFileSync(join(process.env.PORTAL_CONTRACTS_DIR ?? join(__dirname, "../../../packages/contracts"), "fixtures/research-all-time-distributions.valid.json"), "utf8"));
    const oldSeal = structuredClone(seal);
    delete (oldSeal.summary as Record<string, unknown>).derived_scope;
    oldSeal.tableRows.OBSERVATION = distributions.oos_observation_count;
    const withCompanion: CurrentSourceSealRow = { ...oldSeal, distributionsSidecar: {
      digest: sha256ResearchJson(distributions), distributions,
    } };
    expect(currentSourceSealDigest(withCompanion)).toBe(currentSourceSealDigest(oldSeal));
    const noSourceRows = vi.fn(() => { throw new Error("read may not request retained rows or compute distributions"); });
    const old = service({ sealForRead: vi.fn().mockResolvedValue(oldSeal), rows: noSourceRows });
    const current = service({ sealForRead: vi.fn().mockResolvedValue(withCompanion), rows: noSourceRows });
    for (const kind of ["MONTHLY_RETURNS", "RETURN_DISTRIBUTION"] as const) {
      const before = sealed(await old.evidenceSeries(scope, "run-rs02", kind));
      const after = sealed(await current.evidenceSeries(scope, "run-rs02", kind));
      expect(after.revision).not.toBe(before.revision);
      expect(after.availability.state).toBe("AVAILABLE");
      expect(after.source_sample.derivation?.grain).toBe(kind === "MONTHLY_RETURNS" ? "UTC_CALENDAR_MONTH" : "UTC_DAY");
      expect(after.source_sample.derivation?.origin).toBe("PORTAL_DERIVED");
      expect(after.source_sample.derivation?.input_digest).toBe(distributions.input_digest);
      expect(after.values).toEqual(kind === "MONTHLY_RETURNS" ? distributions.monthly_returns.values : distributions.return_distribution.values);
    }
    expect(noSourceRows).not.toHaveBeenCalled();
    const oldRolling = sealed(await old.evidenceSeries(scope, "run-rs02", "ROLLING_RETURNS_20"));
    const newRolling = sealed(await current.evidenceSeries(scope, "run-rs02", "ROLLING_RETURNS_20"));
    expect(newRolling).toEqual(oldRolling); // No accidental revival of non-OOS/rolling facts.
  });

  it("binds a playhead to its relation and reports a local receipt mismatch without reopening source bytes", async () => {
    const repository = {
      sealForRead: vi.fn().mockResolvedValue(seal), runState: vi.fn(),
      rows: vi.fn().mockImplementation((_scope, _runId, _revision, kind: string) => {
        if (kind === "OBSERVATION") return page(observations, 3);
        if (kind === "TRIAL") return page(trials, 2);
        if (kind === "CANDIDATE") return page(candidates, 1);
        // W5a P16-T02: the freeze read derives its per-fold ordering from FOLD.
        if (kind === "FOLD") return page(folds, 2);
        throw new Error(`unexpected ${kind}`);
      }),
      observationSeries: vi.fn().mockResolvedValue({ rows: observations, sampling: "FULL", extremaEmitted: true }),
      verifyRetainedImport: vi.fn().mockResolvedValue("0".repeat(64)),
    };
    const current = service(repository);
    const replay = sealed(await current.replay(scope, "run-rs02", { limit: 100 }));
    const search = sealed(await current.search(scope, "run-rs02", { limit: 100 }));
    const freeze = sealed(await current.freeze(scope, "run-rs02"));

    await expect(current.replay(scope, "run-rs02", {
      limit: 1,
      at: search.ledger.trials[0]!.playback_cursor,
    })).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    await expect(current.replay({ ...scope, workspaceId: "other" }, "run-rs02", {
      limit: 1,
      at: replay.replay.rows[0]!.playback_cursor,
    })).rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
    expect(freeze.integrity).toMatchObject({ state: "MISMATCH", observed_retained_import_digest: "0".repeat(64) });
    expect(freeze.source_artifact_bytes.reason_code).toBe("P05_SOURCE_BYTES_WERE_VERIFIED_AT_IMPORT_BUT_A_GET_NEVER_REOPENS_PRIVATE_ARTIFACT_BYTES");
  });

  it("canonicalizes the retained batch receipt independent of database row order", () => {
    const rows = [
      { table_kind: "TRIAL" as const, batch_ordinal: 1, batch_digest: "a".repeat(64), row_count: 2 },
      { table_kind: "OBSERVATION" as const, batch_ordinal: 0, batch_digest: "b".repeat(64), row_count: 3 },
      { table_kind: "TRIAL" as const, batch_ordinal: 0, batch_digest: "c".repeat(64), row_count: 2 },
    ];
    expect(currentSourceImportDigest(rows)).toBe(currentSourceImportDigest([...rows].reverse()));
    expect(currentSourceImportDigest(rows)).not.toBe(currentSourceImportDigest([
      ...rows.slice(0, 2), { ...rows[2]!, row_count: 3 },
    ]));
  });

  it("preserves current-source legacy/pending distinctions and refuses to run when dark", async () => {
    const legacy = service({
      sealForRead: vi.fn().mockResolvedValue(null),
      runState: vi.fn().mockResolvedValue({ sourceKind: "LEGACY_1_0_8_METADATA", effectiveStatus: "COMPLETED" }),
    });
    await expect(legacy.evidence(scope, "legacy-run")).rejects.toMatchObject({
      code: "RESEARCH_CURRENT_SOURCE_CONFLICT", status: 409,
    });
    const dark = new ResearchCurrentSourceService({ sealForRead: vi.fn() } as never, {
      FEATURE_RESEARCH_CURRENT_SOURCE: "false",
      QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
      QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
      QUERY_CURSOR_TTL_SECONDS: 900,
    } as never);
    await expect(dark.evidence(scope, "run-rs02")).rejects.toMatchObject({
      code: "RESEARCH_CURRENT_SOURCE_UNAVAILABLE", status: 503,
    });
  });

  it("binds replay paging cursors to the retained revision and workspace", async () => {
    const repository = {
      sealForRead: vi.fn().mockResolvedValue(seal), runState: vi.fn(), rows: vi.fn().mockImplementation(
        (_scope, _runId, _revision, kind: string) => kind === "FOLD" ? page(folds, 2) : {
          rows: observations.slice(0, 1), hasMore: true, hasPrevious: false, totalRows: 3,
        }), observationSeries: vi.fn(), verifyRetainedImport: vi.fn(),
    };
    const current = service(repository);
    const first = sealed(await current.replay(scope, "run-rs02", { limit: 1 }));
    const token = first.replay.page.next_cursor;
    expect(token).toMatch(/^kc1\./);
    await current.replay(scope, "run-rs02", { limit: 1, cursor: token! });
    await expect(current.replay({ ...scope, workspaceId: "other" }, "run-rs02", { limit: 1, cursor: token! }))
      .rejects.toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_INVALID", status: 400 });
  });

  it("keeps the maximum admitted trial/candidate screen model below 1 MiB without raw source payloads", async () => {
    const parameters = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [
      `parameter_${index}`, "9".repeat(96),
    ]));
    const maximumTrials = Array.from({ length: 64 }, (_, ordinal) => ({
      sourceOrdinal: ordinal,
      sourceId: `trial-max-${ordinal}`,
      occurredAtUtcMs: null,
      payload: { trial_id: `trial-max-${ordinal}`, state: "COMPLETE", objective: "0.1", parameters },
    }));
    const maximumCandidates = Array.from({ length: 64 }, (_, ordinal) => ({
      sourceOrdinal: ordinal,
      sourceId: `candidate-max-${ordinal}`,
      occurredAtUtcMs: null,
      payload: { candidate_id: `candidate-max-${ordinal}`, objective: "0.1", parameters },
    }));
    const maximumSeal: CurrentSourceSealRow = {
      ...seal,
      tableRows: { OBSERVATION: 3, FOLD: 2, TRIAL: 64, CANDIDATE: 64, SELECTION: 1 },
      totalRows: 134,
      summary: {
        ...seal.summary,
        selection: { trial_id: "trial-max-0", objective: "0.1", parameters },
      },
    };
    const repository = {
      sealForRead: vi.fn().mockResolvedValue(maximumSeal), runState: vi.fn(),
      rows: vi.fn().mockImplementation((_scope, _runId, _revision, kind: string) => {
        if (kind === "TRIAL") return page(maximumTrials, 64);
        if (kind === "CANDIDATE") return page(maximumCandidates, 64);
        // E5: the search read's pool block reads the fold plan for θ*'s per-fold decay.
        if (kind === "FOLD") return page(folds, 2);
        throw new Error(`unexpected ${kind}`);
      }),
    };

    const response = sealed(await service(repository).search(scope, "run-rs02", { limit: 200 }));
    expect(Buffer.byteLength(JSON.stringify(response), "utf8")).toBeLessThan(1_048_576);
    expect(response.candidates.rows).toHaveLength(64);
    expect(response.candidates.rows[0]).not.toHaveProperty("source_payload");
  });
});
