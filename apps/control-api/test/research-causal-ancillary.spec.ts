/** Synthetic causal read-model units; no fixture below is fresh engine evidence. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { DELTA_CAUSAL_INNER_PROFILE, DELTA_CAUSAL_INNER_PROFILE_DIGEST, DELTA_CAUSAL_INNER_PROFILE_ID } from "../src/research/delta-causal-inner.profile";
import { CurrentSourceCausalSelectionSchema, type CurrentSourceFacts } from "../src/research/current-source.payload";
import { POOL_REASONS, searchPool, type PoolCandidate, type PoolFold, type PoolTrial } from "../src/research/current-source-pool";
import { quantbtCandidateId } from "../src/research/fold-ordering";
import { DEFAULT_PARAMETER_BINDING_REGISTRY } from "../src/research/parameter-binding.registry";
import { trialFacts } from "../src/research/current-source-facts";
import { retainedLaneFacts, type ReleaseCandidateRetainedLane } from "../src/research/release-candidate.retained-lane";

const historical = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8"));
const digest = "a".repeat(64);

function causalLane(): ReleaseCandidateRetainedLane {
  const summary = structuredClone(historical.summary);
  summary.source_facts.search.optimization_schedule = "per_fold_causal";
  summary.source_facts.claims.oos_used_for_selection = false;
  summary.source_facts.claims.validation_claim = "strict_nested_fold_local_retraining";
  summary.source_facts.claims.causality_claim = "strict_nested_fold_local_retraining";
  summary.selection.scope = "LAST_FOLD_DEPLOYMENT";
  summary.selection.fold_id = "1";
  const kinds = DEFAULT_PARAMETER_BINDING_REGISTRY.byProfileDigest(DELTA_CAUSAL_INNER_PROFILE_DIGEST)!.candidateParameterKinds;
  const folds = historical.rows.FOLD.map((row: Record<string, any>, ordinal: number) => {
    const payload = structuredClone(row.payload);
    const parameters = { ...summary.selection.parameters, window: String(30 + ordinal) };
    const start = payload.train_start_utc_ms;
    payload.causal_selection = CurrentSourceCausalSelectionSchema.parse({
      schema_version: "research.current-source-causal-selection.v1", scope: "OUTER_FOLD_SELECTION",
      study_id: `outer-fold-${ordinal}`, fold_seed: ordinal + 42, selected_trial_id: `fold-${ordinal}-trial-0`,
      parameters, objective: "0.25", objective_kind: "INNER_VALIDATION_DECAY_J",
      candidate_is_metric: "1.5", candidate_oos_metric: "1.25", candidate_decay: "0.25",
      candidate_is_scope: "INNER_VALIDATION_IS_MEAN", candidate_oos_scope: "OUTER_FOLD_OOS",
      candidate_decay_scope: "INNER_IS_MEAN_MINUS_OUTER_OOS",
      candidate_metrics_scope: "OUTER_FOLD_POST_SELECTION", candidate_count: 1, study_trial_rows: 3,
      outer_oos_used_for_selection: false, causality_claim: "strict_nested_fold_local_retraining",
      inner_fold_count: 2,
      inner_validation: { inner_split_frequency: "weekly", inner_window_mode: "expanding", inner_train_window: "7D", inner_min_folds: 2 },
      inner_folds: [0, 1].map(index => ({ inner_fold_id: String(index), train_start_utc_ms: start,
        train_end_utc_ms: start + 1000 + index * 1000, test_start_utc_ms: start + 1001 + index * 1000,
        test_end_utc_ms: start + 1999 + index * 1000, outer_oos_used_for_selection: false })),
    });
    const candidate = quantbtCandidateId(parameters, kinds);
    payload.child_audit.records.find((record: Record<string, any>) => record.context === "out-of-sample generation").candidate_id = candidate;
    if (ordinal === 1) summary.selection.parameters = parameters;
    return { sourceOrdinal: ordinal, sourceId: row.sourceId, payload };
  });
  return {
    executionProfileId: DELTA_CAUSAL_INNER_PROFILE_ID, executionProfileDigest: DELTA_CAUSAL_INNER_PROFILE_DIGEST,
    producerDatasetBindingDigest: digest,
    seal: { artifactRevision: 1, sourceAdapterId: DELTA_CAUSAL_INNER_PROFILE.current_source.source_adapter_id,
      profileId: DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id, manifestDigest: digest,
      sourceTransformDigest: digest, retainedImportDigest: digest, requestedSpecDigest: digest,
      effectiveSpecDigest: digest, datasetBindingDigest: digest, tableRows: historical.table_rows,
      totalRows: Object.values(historical.table_rows as Record<string, number>).reduce((a, b) => a + b, 0), summary },
    sealedArtifactId: "rart_causal_unit", partDigests: [digest], observedImportDigest: digest,
    folds, claimState: "ISSUED", handoffParamsDigest: null,
  };
}

function poolInput() {
  const lane = causalLane();
  const summary = lane.seal!.summary as Record<string, any>;
  const facts = summary.source_facts as CurrentSourceFacts;
  const trials: PoolTrial[] = [];
  const candidates: PoolCandidate[] = [];
  const folds: PoolFold[] = lane.folds.map(fold => {
    const payload = fold.payload as Record<string, any>;
    for (let index = 0; index < 3; index++) {
      const source = structuredClone(historical.rows.TRIAL[index].payload);
      source.trial_facts.fold_scope = { kind: "PER_FOLD_STUDY", fold_id: fold.sourceId, reason_code: null };
      source.trial_facts.study_id = payload.causal_selection.study_id;
      trials.push({ trialId: `fold-${fold.sourceId}-trial-${index}`, state: "COMPLETE", objective: source.objective, facts: source.trial_facts });
    }
    const candidate = structuredClone(historical.rows.CANDIDATE[0].payload);
    candidate.trial_facts.fold_scope = { kind: "PER_FOLD_STUDY", fold_id: fold.sourceId, reason_code: null };
    candidate.trial_facts.study_id = payload.causal_selection.study_id;
    candidate.trial_facts.source_trial_id = payload.causal_selection.selected_trial_id;
    candidates.push({ candidateId: `fold-${fold.sourceId}-candidate-0`, objective: candidate.objective, facts: candidate.trial_facts });
    return { foldId: fold.sourceId, sourceOrdinal: fold.sourceOrdinal, facts: payload.fold_facts, causalSelection: payload.causal_selection };
  });
  return { facts, trials, candidates, folds, selectedTrialId: "last-fold-deployment" };
}

describe("causal ancillary readers", () => {
  it("publishes actual study ledger counts but no invented run-global K or ceil(total N * fraction)", () => {
    const value = searchPool(poolInput());
    expect(value.trials_evaluated.value).toBe(6);
    expect(value.reevaluated.value).toBe(2);
    expect(value.reevaluation_scope).toBe("PER_FOLD_STUDY");
    expect(value.selected).toMatchObject({ state: "AVAILABLE", value: 2, source: "RETAINED_SELECTION" });
    expect(value.top_is_k).toMatchObject({ state: "NOT_PUBLISHED", value: null, reason_code: POOL_REASONS.perFoldStudies });
    expect(value.rule).toMatchObject({ state: "NOT_PUBLISHED", expression: null, n: null, k: null });
  });

  it("does not count a deployment singleton as selections for a missing or repeated fold study", () => {
    const missing = poolInput();
    delete missing.folds[0]!.causalSelection;
    expect(searchPool(missing).selected.state).toBe("NOT_PUBLISHED");
    const repeated = poolInput();
    repeated.folds[1]!.causalSelection!.study_id = repeated.folds[0]!.causalSelection!.study_id;
    expect(searchPool(repeated).selected.state).toBe("NOT_PUBLISHED");
  });

  it("maps real native FOLD candidate facts to INNER per-fold studies only under the exact causal custody pair", () => {
    const input = { ...poolInput(), sourceAdapterId: DELTA_CAUSAL_INNER_PROFILE.current_source.source_adapter_id,
      sourceProfileId: DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id };
    for (const candidate of input.candidates) {
      candidate.facts!.fold_scope.kind = "FOLD";
    }
    expect(searchPool(input).reevaluation_scope).toBe("PER_FOLD_STUDY");
    expect(trialFacts(input.candidates[0]!.facts, "compact", true)).toMatchObject({
      evaluation_scope: "INNER_VALIDATION", fold_scope: { kind: "FOLD" },
    });
    expect(searchPool({ ...input, sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1" }).reevaluation_scope).toBe("FOLD");
    expect(searchPool({ ...input, sourceProfileId: "rs02.delta-signal-notional-wfo.v1" }).reevaluation_scope).toBe("FOLD");
    input.candidates[0]!.facts!.study_id = "unretained-study";
    expect(searchPool(input).reevaluation_scope).toBe("FOLD");
  });

  it("RC ordering matches each OOS generation child to its own retained fold parameters", () => {
    const lane = causalLane();
    const facts = retainedLaneFacts(lane);
    expect(facts.laneConsistent).toBe(true);
    expect(facts.foldsValid).toBe(true);
    expect(facts.ordering!.folds.map(fold => fold.verdict)).toEqual(["CAUSAL_DATA_TIME_SELECTION", "CAUSAL_DATA_TIME_SELECTION"]);
    expect(facts.ordering!.folds.map(fold => fold.oos_generation_child.state)).toEqual(["MATCH", "MATCH"]);
    expect(facts.ordering!.folds[0]!.selected_candidate!.candidate_id).not.toBe(facts.ordering!.folds[1]!.selected_candidate!.candidate_id);
  });

  it("RC refuses missing per-fold selection and an unpinned or cross-profile causal lane", () => {
    const missing = causalLane();
    delete (missing.folds[0]!.payload as Record<string, any>).causal_selection;
    expect(retainedLaneFacts(missing)).toMatchObject({ foldsValid: false, ordering: null });
    expect(retainedLaneFacts({ ...causalLane(), executionProfileDigest: "0".repeat(64) }).laneConsistent).toBe(false);
    const mixed = causalLane();
    mixed.seal!.profileId = "rs02.delta-signal-notional-wfo.v1";
    expect(retainedLaneFacts(mixed).laneConsistent).toBe(false);
  });
});
