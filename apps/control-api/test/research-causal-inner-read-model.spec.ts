/** Synthetic causal read-model unit sources; not engine/runtime evidence. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import { ResearchCurrentSourceIngestService } from "../src/research/current-source-ingest.service";
import { ResearchReportRepository } from "../src/research/report.repository";
import { CurrentSourceCausalSelectionSchema, CurrentSourceFoldPayloadSchema, CurrentSourceSummarySchema } from "../src/research/current-source.payload";
import { DELTA_CAUSAL_INNER_PROFILE, DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_DIGEST } from "../src/research/delta-causal-inner.profile";
import { DELTA_WFO_PROFILE, DELTA_WFO_PROFILE_ID, DELTA_WFO_PROFILE_DIGEST } from "../src/research/delta-wfo.profile";
import { foldOrdering, FoldOrderingSchema, FOLD_ORDERING_REASONS, quantbtCandidateId } from "../src/research/fold-ordering";
import { retainedStage4Binding, Stage4BindingSchema, STAGE4_REASONS } from "../src/research/stage4-binding";
import { FOLD_VERDICT_RULE, foldVerdicts, splitGuards } from "../src/research/current-source-facts";
import { DEFAULT_PARAMETER_BINDING_REGISTRY } from "../src/research/parameter-binding.registry";
import { p11StageEvents } from "../src/research/p11-stage-events";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { currentSourceBatchDigest } from "../src/research/current-source.repository";

const original = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8"));
const kinds = DEFAULT_PARAMETER_BINDING_REGISTRY.byRetainedLaneProfile(DELTA_WFO_PROFILE.current_source.profile_id)!.candidateParameterKinds;
const scope = { workspaceId: "causal-unit-workspace", actorUserId: "causal-unit-user" };
const lease = { ...scope, jobId: "causal-unit-job", workerAttemptId: "causal-unit-attempt", leaseEpoch: 1 };
const config = { FEATURE_RESEARCH_CURRENT_SOURCE: "true", QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
  QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}', QUERY_CURSOR_TTL_SECONDS: 900 };

function source() {
  const fixture = structuredClone(original);
  fixture.rows.FOLD.forEach((row: any, index: number) => {
    const fold = row.payload;
    const parameters = { ...fixture.summary.selection.parameters, window: String(34 + index) };
    const first = fold.train_start_utc_ms;
    fold.causal_selection = CurrentSourceCausalSelectionSchema.parse({
      schema_version: "research.current-source-causal-selection.v1", scope: "OUTER_FOLD_SELECTION",
      study_id: String(index), fold_seed: 42 + index, selected_trial_id: `study_${index}.trial_0`, parameters,
      objective: "0.5", objective_kind: "INNER_VALIDATION_DECAY_J", candidate_is_metric: "0.8", candidate_oos_metric: "0.6",
      candidate_decay: "0.2", candidate_metrics_scope: "OUTER_FOLD_POST_SELECTION", candidate_count: 1, study_trial_rows: 3,
      candidate_is_scope: "INNER_VALIDATION_IS_MEAN", candidate_oos_scope: "OUTER_FOLD_OOS",
      candidate_decay_scope: "INNER_IS_MEAN_MINUS_OUTER_OOS",
      outer_oos_used_for_selection: false, causality_claim: "strict_nested_fold_local_retraining", inner_fold_count: 2,
      inner_validation: { inner_split_frequency: "weekly", inner_window_mode: "expanding", inner_train_window: "7D", inner_min_folds: 2 },
      inner_folds: [0, 1].map(inner => ({ inner_fold_id: String(inner), train_start_utc_ms: first,
        train_end_utc_ms: first + (inner + 1) * 1_000, test_start_utc_ms: first + (inner + 1) * 1_000 + 1,
        test_end_utc_ms: first + (inner + 1) * 1_000 + 999, outer_oos_used_for_selection: false })),
    });
    fold.fold_facts.oos_score = null;
    const candidate = quantbtCandidateId(parameters, kinds);
    fold.child_audit.records.forEach((record: any) => { record.candidate_id = candidate; });
    CurrentSourceFoldPayloadSchema.parse(fold);
  });
  const last = fixture.rows.FOLD.at(-1).payload;
  fixture.summary.selection = { scope: "LAST_FOLD_DEPLOYMENT", fold_id: last.fold_id,
    trial_id: last.causal_selection.selected_trial_id, objective: last.causal_selection.objective, parameters: last.causal_selection.parameters };
  const facts = fixture.summary.source_facts;
  Object.assign(facts.claims, { oos_used_for_selection: false, causality_claim: "strict_nested_fold_local_retraining" });
  Object.assign(facts.search, { optimization_schedule: "per_fold_causal", n_studies: 2, optuna_trials_scope: "per_fold",
    raw_best_is_trial_id: null, raw_best_is_objective: null, candidate_source_trial_ids: [], selected_trial_id: fixture.summary.selection.trial_id });
  facts.temporal_guards.inner_validation = { selection_scope: "inner_validation", inner_split_frequency: "weekly", inner_window_mode: "expanding", inner_min_folds: 2 };
  facts.temporal_guards.observed_inner_fold_count = 4;
  fixture.rows.TRIAL = fixture.rows.FOLD.flatMap((fold: any, index: number) => original.rows.TRIAL.map((row: any, local: number) => ({
    ...structuredClone(row), sourceOrdinal: index * 3 + local, sourceId: `study_${index}.trial_${local}`,
    payload: { ...structuredClone(row.payload), trial_id: `study_${index}.trial_${local}`,
      ...(local === 0 ? { parameters: structuredClone(fold.payload.causal_selection.parameters), state: "COMPLETE" } : {}),
      trial_facts: { ...structuredClone(row.payload.trial_facts), stage: "is_search", objective_kind: "IS_MEAN_SHARPE",
        study_id: String(index), source_trial_id: String(local),
        fold_scope: { kind: "FOLD", fold_id: fold.payload.fold_id, reason_code: null } } },
  })));
  fixture.rows.CANDIDATE = fixture.rows.FOLD.map((fold: any, index: number) => {
    const selected = fold.payload.causal_selection, native = structuredClone(original.rows.CANDIDATE[0]);
    return { ...native, sourceOrdinal: index, sourceId: selected.selected_trial_id,
      payload: { ...native.payload, candidate_id: selected.selected_trial_id, parameters: structuredClone(selected.parameters),
        objective: selected.objective, trial_facts: { ...native.payload.trial_facts, stage: "oos_candidate_selection",
          objective_kind: "MODE_1_DECAY_J", pruned: false, study_id: selected.study_id, source_trial_id: "0",
          fold_scope: { kind: "FOLD", fold_id: fold.payload.fold_id, reason_code: null } } } };
  });
  fixture.table_rows.TRIAL = fixture.rows.TRIAL.length;
  fixture.table_rows.CANDIDATE = fixture.rows.CANDIDATE.length;
  facts.search.candidate_source_trial_ids = fixture.rows.CANDIDATE.map((row: any) => row.sourceId);
  if (fixture.summary.counts) {
    fixture.summary.counts.trials = fixture.rows.TRIAL.length;
    fixture.summary.counts.candidates = fixture.rows.CANDIDATE.length;
  }
  CurrentSourceSummarySchema.parse(fixture.summary);
  return fixture;
}

function orderingInput(fixture: any) {
  return fixture.rows.FOLD.map((row: any) => ({ sourceOrdinal: row.sourceOrdinal, foldId: row.payload.fold_id,
    trainStartUtcMs: row.payload.train_start_utc_ms, trainEndUtcMs: row.payload.train_end_utc_ms,
    testStartUtcMs: row.payload.test_start_utc_ms, testEndUtcMs: row.payload.test_end_utc_ms,
    childAudit: row.payload.child_audit.records, causalSelection: row.payload.causal_selection }));
}
function auditInput(fixture: any) {
  return fixture.rows.FOLD.map((row: any) => ({ foldId: row.payload.fold_id,
    selectedParameters: row.payload.causal_selection?.parameters ?? null, records: row.payload.child_audit.records }));
}
function reader(fixture: any) {
  const seal = { runId: fixture.run_id, artifactRevision: 1, ...DELTA_CAUSAL_INNER_PROFILE.current_source,
    sourceAdapterId: DELTA_CAUSAL_INNER_PROFILE.current_source.source_adapter_id,
    profileId: DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id, manifestDigest: fixture.manifest_digest,
    sourceTransformDigest: fixture.source_transform_digest, retainedImportDigest: "f".repeat(64), requestedSpecDigest: "1".repeat(64),
    effectiveSpecDigest: "2".repeat(64), datasetBindingDigest: "3".repeat(64), tableRows: fixture.table_rows,
    totalRows: Object.values(fixture.table_rows as Record<string, number>).reduce((sum, value) => sum + value, 0),
    summary: fixture.summary, retainedAtUtcMs: 1_790_269_236_911 };
  const repository = { sealForRead: vi.fn().mockResolvedValue(seal), stageEventClocks: vi.fn().mockResolvedValue(p11StageEvents()),
    admittedRequestedSpec: vi.fn().mockResolvedValue(null), verifyRetainedImport: vi.fn().mockResolvedValue("f".repeat(64)),
    searchForRead: vi.fn().mockResolvedValue({ seal, inputs: { requestedSpec: null, trials: fixture.rows.TRIAL,
      candidates: fixture.rows.CANDIDATE, folds: fixture.rows.FOLD, stageEvents: p11StageEvents() } }),
    rows: vi.fn(async (_scope: unknown, _run: string, _revision: number, kind: string, query: {limit: number}) => {
      const all = fixture.rows[kind];
      return { rows: all.slice(0, query.limit), hasMore: all.length > query.limit, hasPrevious: false, totalRows: all.length };
    }) };
  return { repository, service: new ResearchCurrentSourceService(repository as never, config as never) };
}

describe("causal-inner retained per-fold selections", () => {
  it("checks actual inner data-time windows and matches each fold's own OOS child, never a wall-clock freeze", () => {
    const fixture = source();
    const value = foldOrdering(orderingInput(fixture), fixture.summary.source_facts, fixture.summary.selection.parameters,
      kinds, p11StageEvents(), DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id);
    expect(FoldOrderingSchema.safeParse(value).success).toBe(true);
    expect(value.counts).toMatchObject({ causal_data_time_selection: 2, oos_child_match: 2, oos_child_mismatch: 0 });
    expect(value.folds.map(row => row.verdict)).toEqual(["CAUSAL_DATA_TIME_SELECTION", "CAUSAL_DATA_TIME_SELECTION"]);
    expect(value.folds[0]!.selected_candidate?.candidate_id).not.toBe(value.frozen_candidate.candidate_id);
    expect(value.frozen_candidate).toMatchObject({ candidate_id: null, reason_code: FOLD_ORDERING_REASONS.noGlobalCandidate });
    expect(value.wall_clock).toEqual({ state: "NOT_PUBLISHED", reason_code: FOLD_ORDERING_REASONS.wallClock });
  });
  it("never earns the causal verdict on an old profile, missing selection, outside-IS inner row or contradictory OOS claim", () => {
    const fixture = source(), input = orderingInput(fixture);
    const old = foldOrdering(input, fixture.summary.source_facts, fixture.summary.selection.parameters, kinds, undefined, DELTA_WFO_PROFILE.current_source.profile_id);
    expect(old.folds[0]!.reason_code).toBe(FOLD_ORDERING_REASONS.perFoldNotAdmitted);
    delete input[0].causalSelection;
    const missing = foldOrdering(input, fixture.summary.source_facts, fixture.summary.selection.parameters, kinds, undefined, DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id);
    expect(missing.folds[0]!).toMatchObject({ verdict: "NOT_EVALUATED", reason_code: FOLD_ORDERING_REASONS.causalSourceMissing });
    expect(missing.folds[0]!.oos_generation_child.state).toBe("NOT_COMPUTABLE");
    input[0].causalSelection = structuredClone(fixture.rows.FOLD[0].payload.causal_selection);
    input[0].causalSelection.inner_folds[0].test_end_utc_ms = input[0].trainEndUtcMs + 1;
    expect(foldOrdering(input, fixture.summary.source_facts, fixture.summary.selection.parameters, kinds, undefined, DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id).folds[0]!.reason_code).toBe(FOLD_ORDERING_REASONS.causalWindowMismatch);
    fixture.summary.source_facts.claims.oos_used_for_selection = true;
    expect(foldOrdering(orderingInput(fixture), fixture.summary.source_facts, fixture.summary.selection.parameters, kinds, undefined, DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id).folds[0]!.reason_code).toBe(FOLD_ORDERING_REASONS.causalClaimMismatch);
  });
  it("binds Stage4 params per fold while preserving the candidate versus code-fingerprint digest domains", () => {
    const fixture = source(), folds = auditInput(fixture);
    const value = retainedStage4Binding(fixture.summary.selection.parameters, sha256ResearchJson(fixture.summary.selection.parameters), folds, kinds);
    expect(Stage4BindingSchema.safeParse(value).success).toBe(true);
    expect(value).toMatchObject({ state: "BOUND", selection_scope: "PER_FOLD", pairs: { params: "MATCH", bundle: "MATCH" } });
    expect(value.rows[0]!.value).toBeNull(); // Different valid candidates; no run-global scalar identity.
    expect(value.rows[0]!.folds.map(fold => fold.value)).toEqual(folds.map((fold: any) => quantbtCandidateId(fold.selectedParameters, kinds)));
    expect(value.rows[2]!.value).toHaveLength(64);
    folds[0].records.at(-1).candidate_id = quantbtCandidateId(fixture.summary.selection.parameters, kinds);
    expect(retainedStage4Binding(fixture.summary.selection.parameters, null, folds, kinds).state).toBe("DRIFT");
    folds[0].selectedParameters = null;
    expect(retainedStage4Binding(fixture.summary.selection.parameters, null, folds, kinds)).toMatchObject({ state: "NOT_COMPARED", reason_code: STAGE4_REASONS.foldSelectionMissing });
  });
  it("counts retained actual inner rows separately from the configured minimum; missing observed rows never become minimum-as-count", () => {
    const fixture = source(), facts = fixture.summary.source_facts;
    expect(splitGuards(facts)).toMatchObject({ inner_folds: { state: "AVAILABLE", value: 4 }, inner_min_folds: { state: "AVAILABLE", value: 2 } });
    delete facts.temporal_guards.observed_inner_fold_count;
    expect(splitGuards(facts).inner_folds).toMatchObject({ state: "NOT_PUBLISHED", value: null });
    expect(splitGuards(facts, 4).inner_folds).toMatchObject({ state: "AVAILABLE", value: 4 });
  });
  it("names the causal INNER-IS/outer-OOS basis and never substitutes a global score or invents an outer trade count", () => {
    const fixture = source();
    const input = fixture.rows.FOLD.map((row: any, index: number) => ({ sourceOrdinal: row.sourceOrdinal, foldId: row.payload.fold_id,
      testStartUtcMs: row.payload.test_start_utc_ms, testEndUtcMs: row.payload.test_end_utc_ms,
      facts: original.rows.FOLD[index].payload.fold_facts, causalSelection: row.payload.causal_selection }));
    const value = foldVerdicts(input, fixture.summary.source_facts, { meanOosSharpe: null, meanDecay: null });
    expect(value.rows[0]).toMatchObject({ is_sharpe: "0.8", oos_sharpe: "0.6", decay: "0.2", oos_trades: null,
      score_basis: "INNER_VALIDATION_IS_MEAN_AND_OUTER_FOLD_OOS", verdict: "PASS" });
    expect(value.rule).toEqual({ ...FOLD_VERDICT_RULE, score_basis: "INNER_VALIDATION_IS_MEAN_AND_OUTER_FOLD_OOS" });
    input[0].causalSelection.candidate_oos_metric = null;
    const missing = foldVerdicts(input, fixture.summary.source_facts, { meanOosSharpe: null, meanDecay: null });
    expect(missing.rows.find(row => row.fold_id === input[0].foldId)).toMatchObject({ oos_sharpe: null, verdict: "NOT_EVALUATED" });
    const legacy = foldVerdicts(input.map(({ causalSelection: _selection, ...row }: any) => row), original.summary.source_facts,
      { meanOosSharpe: null, meanDecay: null });
    expect(legacy.rows.every(row => !("score_basis" in row))).toBe(true);
    expect(legacy.rule).toEqual(FOLD_VERDICT_RULE);
  });
  it("publishes fold selections in Split/evidence, last-fold scope in Search/Freeze and exact replay parameter digests", async () => {
    const fixture = source(), { service } = reader(fixture);
    const split = await service.split(scope, fixture.run_id) as any;
    expect(split.fold_plan.folds.map((fold: any) => fold.causal_selection.parameters)).toEqual(fixture.rows.FOLD.map((row: any) => row.payload.causal_selection.parameters));
    expect(split.guards.inner_folds.value).toBe(4);
    const evidence = await service.evidence(scope, fixture.run_id) as any;
    expect(evidence.fold_verdicts.rule.score_basis).toBe("INNER_VALIDATION_IS_MEAN_AND_OUTER_FOLD_OOS");
    expect(evidence.fold_verdicts.rows.every((row: any) => row.selected_parameters && row.oos_sharpe === "0.6"
      && row.is_sharpe === "0.8" && row.decay === "0.2" && row.oos_trades === null
      && row.score_basis === "INNER_VALIDATION_IS_MEAN_AND_OUTER_FOLD_OOS" && row.verdict === "PASS")).toBe(true);
    const search = await service.search(scope, fixture.run_id, { limit: 20 }) as any;
    expect(search.selection).toMatchObject({ scope: "LAST_FOLD_DEPLOYMENT", fold_id: "1", objective_kind: "INNER_VALIDATION_DECAY_J" });
    expect(search.selection.roles.raw_best_is_equals_selected).toBeNull();
    const filtered = await service.search(scope, fixture.run_id, { limit: 20, fold: "0" }) as any;
    expect(filtered.ledger.trials).toHaveLength(3);
    expect(filtered.ledger.trials.every((row: any) => row.trial_id.startsWith("study_0."))).toBe(true);
    const freeze = await service.freeze(scope, fixture.run_id) as any;
    expect(freeze.frozen_selection).toMatchObject({ scope: "LAST_FOLD_DEPLOYMENT", fold_id: "1" });
    expect(freeze.stage4_binding.state).toBe("BOUND");
    const replay = await service.replay(scope, fixture.run_id, { limit: 10 }) as any;
    const segments = replay.execution.fold_capital.segments;
    expect(segments.map((segment: any) => segment.params_digest)).toEqual(fixture.rows.FOLD.map((row: any) => sha256ResearchJson(row.payload.causal_selection.parameters)));
    expect(segments[0].params_digest).not.toBe(sha256ResearchJson(fixture.summary.selection.parameters));
    expect(segments[0]).toMatchObject({ selection_scope: "OUTER_FOLD_SELECTION", study_id: "0", selected_trial_id: "study_0.trial_0" });
  });
  it("refuses a causal replay segment with no exact retained fold selection rather than applying last-fold parameters", async () => {
    const fixture = source(); fixture.summary.replay.fold_segments[0].fold_id = "unretained-fold";
    await expect(reader(fixture).service.replay(scope, fixture.run_id, { limit: 10 })).rejects.toMatchObject({ status: 503 });
    const missing = source(); delete missing.rows.FOLD[0].payload.causal_selection;
    await expect(reader(missing).service.replay(scope, missing.run_id, { limit: 10 })).rejects.toMatchObject({ status: 503 });
  });
  it("refuses selected-TRIAL parameters that contradict its own retained causal fold selection", async () => {
    const fixture = source();
    fixture.rows.TRIAL[0].payload.parameters = structuredClone(fixture.rows.FOLD[1].payload.causal_selection.parameters);
    await expect(reader(fixture).service.search(scope, fixture.run_id, { limit: 20 })).rejects.toMatchObject({ status: 503 });
  });
});

describe("causal-inner private current-source profile boundary", () => {
  it("accepts only the exact admitted causal pair and requires per-fold selection; old global never accepts causal rows", async () => {
    const fixture = source();
    const authority = { executionProfileId: DELTA_CAUSAL_INNER_PROFILE_ID, executionProfileDigest: DELTA_CAUSAL_INNER_PROFILE_DIGEST,
      requestedSpecDigest: "1".repeat(64), effectiveSpecDigest: "2".repeat(64), datasetBindingDigest: "3".repeat(64), artifact: {
        runId: fixture.run_id, state: "SEALED", manifestDigest: fixture.manifest_digest, artifactRevision: 1,
        workerAttemptId: lease.workerAttemptId, leaseEpoch: lease.leaseEpoch } };
    const repository = { ingestAuthority: vi.fn().mockResolvedValue(authority), append: vi.fn().mockResolvedValue({ replayed: false }),
      seal: vi.fn().mockResolvedValue({ replayed: false, retainedImportDigest: "f".repeat(64) }) };
    const service = new ResearchCurrentSourceIngestService(repository as never);
    const batch = { run_id: fixture.run_id, artifact_id: "artifact-unit", artifact_revision: 1, manifest_digest: fixture.manifest_digest,
      source_transform_digest: fixture.source_transform_digest, table_kind: "FOLD", batch_ordinal: 0,
      rows: fixture.rows.FOLD, batch_digest: currentSourceBatchDigest(fixture.rows.FOLD) };
    await expect(service.appendBatch(lease, batch as never)).resolves.toMatchObject({ accepted: true });
    const seal = { ...batch, ...DELTA_CAUSAL_INNER_PROFILE.current_source, summary: fixture.summary, table_rows: fixture.table_rows,
      total_rows: Object.values(fixture.table_rows as Record<string, number>).reduce((sum, count) => sum + count, 0), retained_import_digest: "f".repeat(64) };
    await expect(service.seal(lease, seal as never)).resolves.toMatchObject({ sealed: true });
    await expect(service.seal(lease, { ...seal, ...DELTA_WFO_PROFILE.current_source } as never)).rejects.toMatchObject({ status: 400 });
    delete fixture.rows.FOLD[0].payload.causal_selection;
    await expect(service.appendBatch(lease, batch as never)).rejects.toMatchObject({ status: 400 });
    repository.ingestAuthority.mockResolvedValue({ ...authority, executionProfileId: DELTA_WFO_PROFILE_ID, executionProfileDigest: DELTA_WFO_PROFILE_DIGEST });
    await expect(service.appendBatch(lease, { ...batch, rows: source().rows.FOLD } as never)).rejects.toMatchObject({ status: 400 });
  });
  it("report retry custody requires the exact immutable causal profile digest inside the existing workspace/RLS transaction", async () => {
    const client = { release: vi.fn(), query: vi.fn(async (sql: string) => ({
      rowCount: sql.startsWith("SELECT 1 FROM workspace_members") || sql.startsWith("INSERT INTO research.run_report_materialization_retries_v1") ? 1 : 0,
      rows: [],
    })) };
    const repository = new ResearchReportRepository({ connect: vi.fn().mockResolvedValue(client) } as never);
    await expect(repository.claimMissingWfo(scope, "causal-unit-run", [DELTA_CAUSAL_INNER_PROFILE_ID])).resolves.toBe(true);
    const [sql, values] = client.query.mock.calls.find(([text]) => text.startsWith("INSERT INTO research.run_report_materialization_retries_v1"))! as unknown as [string, unknown[]];
    expect(sql).toContain("producer.execution_profile_id = $8 AND producer.execution_profile_digest = $9");
    expect(sql).toContain("producer.execution_profile_id = ANY($3::text[])");
    expect(values.slice(0, 3)).toEqual([scope.workspaceId, "causal-unit-run", [DELTA_CAUSAL_INNER_PROFILE_ID]]);
    expect(values.slice(7)).toEqual([DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_PROFILE_DIGEST]);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
