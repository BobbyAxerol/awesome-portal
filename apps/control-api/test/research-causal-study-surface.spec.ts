/** Synthetic retained causal source unit inputs; not engine/runtime evidence. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import {
  DeclaredSpaceSchema, SearchStudySurfaceSchema, SearchSurfaceSchema, SURFACE_REASONS,
  declaredSpace, runGlobalCausalSurface, searchStudySurfaces, searchSurface, type SearchStudySurfaceInput,
} from "../src/research/current-source-surface";
import { DELTA_CAUSAL_INNER_PROFILE } from "../src/research/delta-causal-inner.profile";
import { DELTA_WFO_PROFILE } from "../src/research/delta-wfo.profile";
import { CurrentSourceCausalSelectionSchema } from "../src/research/current-source.payload";
import { p11StageEvents } from "../src/research/p11-stage-events";

const original = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8"));
const lane = DELTA_CAUSAL_INNER_PROFILE.current_source;
const scope = { workspaceId: "study-surface-workspace", actorUserId: "study-surface-user" };
const config = { FEATURE_RESEARCH_CURRENT_SOURCE: "true", QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
  QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}', QUERY_CURSOR_TTL_SECONDS: 900 };

function studies(count = 2): SearchStudySurfaceInput[] {
  return Array.from({ length: count }, (_, index) => {
    const trials = [0, 1, 2].map(local => ({
      sourceOrdinal: index * 3 + local, trialId: `study_${index}.trial_${local}`, state: "COMPLETE" as const,
      objective: String(index * 100 + local), parameters: { ...original.summary.selection.parameters, window: String(34 + local + index) },
    }));
    return { foldId: String(index), studyId: String(index), selectedTrialId: trials[1]!.trialId,
      selectedParameters: trials[1]!.parameters, trials };
  });
}

function fixture() {
  const source = structuredClone(original), populations = studies();
  source.rows.FOLD.forEach((row: any, index: number) => {
    const population = populations[index]!, fold = row.payload, start = fold.train_start_utc_ms;
    fold.causal_selection = CurrentSourceCausalSelectionSchema.parse({
      schema_version: "research.current-source-causal-selection.v1", scope: "OUTER_FOLD_SELECTION",
      study_id: population.studyId, fold_seed: 42 + index, selected_trial_id: population.selectedTrialId,
      parameters: population.selectedParameters, objective: "0.5", objective_kind: "INNER_VALIDATION_DECAY_J",
      candidate_is_metric: "0.8", candidate_oos_metric: "0.6", candidate_decay: "0.2",
      candidate_metrics_scope: "OUTER_FOLD_POST_SELECTION", candidate_is_scope: "INNER_VALIDATION_IS_MEAN",
      candidate_oos_scope: "OUTER_FOLD_OOS", candidate_decay_scope: "INNER_IS_MEAN_MINUS_OUTER_OOS",
      candidate_count: 1, study_trial_rows: 3, outer_oos_used_for_selection: false,
      causality_claim: "strict_nested_fold_local_retraining", inner_fold_count: 2,
      inner_validation: { inner_split_frequency: "weekly", inner_window_mode: "expanding", inner_train_window: "7D", inner_min_folds: 2 },
      inner_folds: [0, 1].map(inner => ({ inner_fold_id: String(inner), train_start_utc_ms: start,
        train_end_utc_ms: start + (inner + 1) * 1_000, test_start_utc_ms: start + (inner + 1) * 1_000 + 1,
        test_end_utc_ms: start + (inner + 1) * 1_000 + 999, outer_oos_used_for_selection: false })),
    });
    fold.fold_facts.oos_score = null;
  });
  const last = source.rows.FOLD.at(-1).payload;
  source.summary.selection = { scope: "LAST_FOLD_DEPLOYMENT", fold_id: last.fold_id,
    trial_id: last.causal_selection.selected_trial_id, objective: last.causal_selection.objective, parameters: last.causal_selection.parameters };
  Object.assign(source.summary.source_facts.search, { optimization_schedule: "per_fold_causal", n_studies: 2,
    optuna_trials_scope: "per_fold", raw_best_is_trial_id: null, raw_best_is_objective: null,
    candidate_source_trial_ids: [], selected_trial_id: source.summary.selection.trial_id });
  source.rows.TRIAL = populations.flatMap(population => population.trials.map((trial, local) => ({
    sourceOrdinal: trial.sourceOrdinal, sourceId: trial.trialId, occurredAtUtcMs: null,
    payload: { trial_id: trial.trialId, state: trial.state, objective: trial.objective, parameters: trial.parameters,
      trial_facts: { ...structuredClone(original.rows.TRIAL[local].payload.trial_facts), stage: "is_search",
        objective_kind: "IS_MEAN_SHARPE", study_id: population.studyId, source_trial_id: String(local),
        fold_scope: { kind: "FOLD", fold_id: population.foldId, reason_code: null } } },
  })));
  source.table_rows.TRIAL = source.rows.TRIAL.length;
  return source;
}

function reader(source: any, binding = lane) {
  const seal = { runId: source.run_id, artifactRevision: 1, sourceAdapterId: binding.source_adapter_id,
    profileId: binding.profile_id, manifestDigest: source.manifest_digest, sourceTransformDigest: source.source_transform_digest,
    retainedImportDigest: "f".repeat(64), requestedSpecDigest: "1".repeat(64), effectiveSpecDigest: "2".repeat(64),
    datasetBindingDigest: "3".repeat(64), tableRows: source.table_rows, summary: source.summary,
    totalRows: Object.values(source.table_rows as Record<string, number>).reduce((sum, count) => sum + count, 0), retainedAtUtcMs: 1_790_269_236_911 };
  return new ResearchCurrentSourceService({ searchForRead: vi.fn().mockResolvedValue({ seal,
    inputs: { requestedSpec: null, trials: source.rows.TRIAL, candidates: source.rows.CANDIDATE,
      folds: source.rows.FOLD, stageEvents: p11StageEvents() } }) } as never, config as never);
}

describe("bounded causal study surfaces", () => {
  it("withholds every run-global ranking and theta while preserving actual source population metadata", () => {
    const value = runGlobalCausalSurface(6, 6);
    expect(SearchSurfaceSchema.safeParse(value).success).toBe(true);
    expect(value).toMatchObject({ state: "NOT_APPLICABLE", reason_code: SURFACE_REASONS.noRunGlobalSurface,
      source_trial_count: 6, complete_trial_count: 6, points: [], selected_trial_id: null, best_is_trial_id: null,
      objective_ramp: { minimum: null, maximum: null }, parameter_frequency: { parameters: [] }, importance: { parameters: [] } });
    expect(() => runGlobalCausalSurface(49, 6)).toThrow(RangeError);
    expect(() => runGlobalCausalSurface(6, 7)).toThrow(RangeError);
  });
  it("keeps repeated local IDs, best-so-far, best IS, theta frequencies and distributions inside each own study", () => {
    const value = searchStudySurfaces(lane.profile_id, studies());
    expect(value).toHaveLength(2);
    value.forEach((entry, index) => {
      expect(SearchStudySurfaceSchema.safeParse(entry).success).toBe(true);
      expect(entry).toMatchObject({ scope: "INNER_VALIDATION_OUTER_STUDY", fold_id: String(index), study_id: String(index) });
      expect(entry.surface.selected_trial_id).toBe(`study_${index}.trial_1`);
      expect(entry.surface.best_is_trial_id).toBe(`study_${index}.trial_2`);
      expect(entry.surface.points.map(point => point.best_so_far)).toEqual([0, 1, 2].map(local => String(index * 100 + local)));
      expect(entry.surface.objective_ramp).toMatchObject({ minimum: String(index * 100), maximum: String(index * 100 + 2) });
      expect(entry.surface.points.every(point => point.trial_id.startsWith(`study_${index}.`))).toBe(true);
      expect(entry.surface.distributions.parameters.find(row => row.name === "window")!.theta_value).toBe(String(35 + index));
      expect(entry.surface.parameter_frequency.pool_count).toBe(1);
      expect(entry.surface.importance.state).toBe("NOT_APPLICABLE"); // Three own trials, never six pooled trials.
    });
  });
  it("caps complete populations at 16 studies/48 points and refuses partial, duplicate or cross-study selections", () => {
    const maximum = searchStudySurfaces(lane.profile_id, studies(16));
    expect(maximum.reduce((sum, row) => sum + row.surface.points.length, 0)).toBe(48);
    expect(Buffer.byteLength(JSON.stringify(maximum), "utf8")).toBeLessThan(1024 * 1024);
    expect(() => searchStudySurfaces(lane.profile_id, studies(17))).toThrow(RangeError);
    expect(() => searchStudySurfaces(lane.profile_id, studies(1))).toThrow(RangeError);
    const partial = studies(); partial[0]!.trials = partial[0]!.trials.slice(0, 2);
    expect(() => searchStudySurfaces(lane.profile_id, partial)).toThrow(RangeError);
    const duplicate = studies(); duplicate[1]!.studyId = duplicate[0]!.studyId;
    expect(() => searchStudySurfaces(lane.profile_id, duplicate)).toThrow(RangeError);
    const cross = studies(); cross[0]!.selectedTrialId = cross[1]!.selectedTrialId;
    expect(() => searchStudySurfaces(lane.profile_id, cross)).toThrow(RangeError);
    const parameters = studies(); parameters[0]!.selectedParameters = parameters[1]!.selectedParameters;
    expect(() => searchStudySurfaces(lane.profile_id, parameters)).toThrow(RangeError);
  });
  it("integrates only the exact causal pair, independent of ledger paging/filter, with explicit final deployment declaration", async () => {
    const source = fixture(), service = reader(source);
    const full = await service.search(scope, source.run_id, { limit: 1 }) as any;
    const filtered = await service.search(scope, source.run_id, { limit: 1, fold: "0" }) as any;
    expect(full.surface.state).toBe("NOT_APPLICABLE");
    expect(full.surfaces_by_study).toHaveLength(2);
    expect(filtered.surfaces_by_study).toEqual(full.surfaces_by_study);
    expect(full.declared_space).toMatchObject({ selection_scope: "LAST_FOLD_DEPLOYMENT", fold_id: "1", study_id: "1" });
    expect(DeclaredSpaceSchema.safeParse(full.declared_space).success).toBe(true);
    expect(full.surfaces_by_study[0].surface.selected_trial_id).toBe("study_0.trial_1");
    expect(full.surfaces_by_study[0].surface.best_is_trial_id).toBe("study_0.trial_2");
    expect(Buffer.byteLength(JSON.stringify(full), "utf8")).toBeLessThan(1024 * 1024);
    const global = await reader(structuredClone(original), DELTA_WFO_PROFILE.current_source as never).search(scope, source.run_id, { limit: 1 }) as any;
    expect(global).not.toHaveProperty("surfaces_by_study");
    expect(global.declared_space).not.toHaveProperty("selection_scope");
    const rows = original.rows.TRIAL;
    expect(global.surface).toEqual(searchSurface({ trials: rows.map((row: any) => ({ sourceOrdinal: row.sourceOrdinal,
      trialId: row.payload.trial_id, state: row.payload.state, objective: row.payload.objective, parameters: row.payload.parameters })),
      space: declaredSpace(DELTA_WFO_PROFILE.current_source.profile_id, original.summary.selection.parameters),
      selectedTrialId: original.summary.selection.trial_id, bestIsTrialId: original.summary.source_facts.search.raw_best_is_trial_id,
      objectiveKind: original.rows.TRIAL[0].payload.trial_facts.objective_kind }));
  });
  it.each(["study", "fold", "stage", "objective", "selection", "population"])("fails closed on wrong retained %s binding", async (kind) => {
    const source = fixture();
    if (kind === "study") source.rows.TRIAL[0].payload.trial_facts.study_id = "1";
    if (kind === "fold") source.rows.TRIAL[0].payload.trial_facts.fold_scope.fold_id = "1";
    if (kind === "stage") source.rows.TRIAL[0].payload.trial_facts.stage = "oos_candidate_selection";
    if (kind === "objective") source.rows.TRIAL[0].payload.trial_facts.objective_kind = "MODE_1_DECAY_J";
    if (kind === "selection") source.rows.FOLD[0].payload.causal_selection.selected_trial_id = "study_1.trial_1";
    if (kind === "population") source.rows.TRIAL.pop();
    await expect(reader(source).search(scope, source.run_id, { limit: 1 })).rejects.toMatchObject({ status: 503 });
  });
});
