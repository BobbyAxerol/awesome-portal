/** Cross-relation checks run once under the existing append/seal advisory lock. */
import { CurrentSourceFoldPayloadSchema, CurrentSourceSummarySchema } from "./current-source.payload";
import { ResearchCurrentSourceError } from "./current-source.error";
import { sha256ResearchJson } from "./preflight.service";

export function assertCausalSealConsistency(
  input: { tableRows: Record<string,number>; summary: Record<string,unknown> },
  rows: Array<{ tableKind: string; sourceOrdinal: number; sourceId: string; payload: Record<string,unknown> }>,
  authority: { requestedSpec: Record<string,unknown>; topology: Record<string,unknown> },
): void {
  const fail = () => { throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "Causal selections do not match the sealed source relations.",409); };
  const folds = rows.filter(row => row.tableKind === "FOLD").sort((a,b) => a.sourceOrdinal-b.sourceOrdinal);
  const trials = rows.filter(row => row.tableKind === "TRIAL"), candidates = rows.filter(row => row.tableKind === "CANDIDATE");
  const selection = rows.filter(row => row.tableKind === "SELECTION");
  const summary = CurrentSourceSummarySchema.safeParse(input.summary);
  const requestedInner = (authority.requestedSpec.walk_forward as Record<string,unknown> | undefined)?.inner as Record<string,unknown> | undefined;
  const requestedData = authority.requestedSpec.data as Record<string,unknown> | undefined;
  const plannedFolds = authority.topology.folds as Array<Record<string,unknown>> | undefined;
  if (!requestedInner || requestedData?.timeframe !== "1h" || authority.requestedSpec.schema_version !== "research.requested-spec.v2" ||
      authority.requestedSpec.optimization_schedule !== "per_fold_causal" ||
      authority.topology.plan_source !== "quantbt.walkforward.WalkForwardEngine.build_folds" ||
      !Array.isArray(plannedFolds) || plannedFolds.length !== folds.length) return fail();
  if (rows.length > 113 || folds.length < 2 || folds.length > 16 || trials.length !== folds.length*3 ||
      !summary.success || selection.length !== 1 || folds.length !== input.tableRows.FOLD ||
      trials.length !== input.tableRows.TRIAL || candidates.length !== input.tableRows.CANDIDATE) return fail();
  // Every retained member must stay in its native objective domain, not only
  // the winner. Nonselected Stage-A trials may still legitimately be pruned.
  if (trials.some(row => {
    const fact = row.payload.trial_facts as Record<string,unknown> | undefined;
    return fact?.stage !== "is_search" || fact.objective_kind !== "IS_MEAN_SHARPE";
  }) || candidates.some(row => {
    const fact = row.payload.trial_facts as Record<string,unknown> | undefined;
    return fact?.stage !== "oos_candidate_selection" || fact.objective_kind !== "MODE_1_DECAY_J";
  })) return fail();
  let innerCount = 0;
  const studies = new Set<string>();
  for (const [ordinal, fold] of folds.entries()) {
    const parsed = CurrentSourceFoldPayloadSchema.safeParse(fold.payload);
    if (!parsed.success || !parsed.data.causal_selection || fold.sourceId !== parsed.data.fold_id ||
        parsed.data.fold_facts?.oos_score != null) return fail();
    const fact = parsed.data.causal_selection;
    const planned = plannedFolds[fold.sourceOrdinal];
    const train = planned?.train as Record<string,unknown> | undefined;
    const outer = planned?.outer_oos as Record<string,unknown> | undefined;
    // This immutable profile is 1h only. P08 ranges are half-open; the
    // retained engine ranges end at the final bar's timestamp.
    const barMs = 3_600_000;
    if (fold.sourceOrdinal !== ordinal || !train || !outer ||
        parsed.data.train_start_utc_ms !== train.start_utc_ms ||
        parsed.data.train_end_utc_ms === null || parsed.data.train_end_utc_ms + barMs !== train.end_exclusive_utc_ms ||
        parsed.data.test_start_utc_ms !== outer.start_utc_ms ||
        parsed.data.test_end_utc_ms === null || parsed.data.test_end_utc_ms + barMs !== outer.end_exclusive_utc_ms ||
        fact.causality_claim !== "strict_nested_fold_local_retraining" ||
        planned.inner_fold_count !== fact.inner_fold_count ||
        fact.inner_validation.inner_split_frequency !== requestedInner.split_frequency ||
        fact.inner_validation.inner_window_mode !== requestedInner.window_mode ||
        fact.inner_validation.inner_train_window !== requestedInner.train_window ||
        fact.inner_validation.inner_min_folds !== (requestedInner.min_folds ?? 2)) return fail();
    if (studies.has(fact.study_id)) return fail();
    studies.add(fact.study_id); innerCount += fact.inner_folds.length;
    const studyTrials = trials.filter(row => (row.payload.trial_facts as Record<string,unknown> | undefined)?.study_id === fact.study_id);
    const studyCandidates = candidates.filter(row => (row.payload.trial_facts as Record<string,unknown> | undefined)?.study_id === fact.study_id);
    if (studyTrials.length !== 3) return fail();
    if (studyCandidates.length !== fact.candidate_count || studyCandidates.length > 3 || [...studyTrials,...studyCandidates].some(row => {
      const trialFact = row.payload.trial_facts as Record<string,unknown>;
      const scope = trialFact.fold_scope as Record<string,unknown> | undefined;
      return !scope || !["FOLD","PER_FOLD_STUDY"].includes(String(scope.kind)) || scope.fold_id !== parsed.data.fold_id;
    })) return fail();
    const picked = studyTrials.find(row => row.sourceId === fact.selected_trial_id);
    const candidate = studyCandidates.find(row => row.sourceId === fact.selected_trial_id);
    // TRIAL is stage-A inner IS Sharpe; CANDIDATE is stage-B inner Mode-1 J.
    // Equal parameters/identity do not make these two objective scopes equal.
    const trialFact = picked?.payload.trial_facts as Record<string,unknown> | undefined;
    const candidateFact = candidate?.payload.trial_facts as Record<string,unknown> | undefined;
    if (!picked || !candidate || picked.payload.state !== "COMPLETE" || trialFact?.pruned !== false ||
        trialFact?.stage !== "is_search" || candidateFact?.stage !== "oos_candidate_selection" || candidateFact?.pruned !== false ||
        trialFact?.source_trial_id !== candidateFact?.source_trial_id || candidate.payload.objective !== fact.objective ||
        sha256ResearchJson(picked.payload.parameters) !== sha256ResearchJson(fact.parameters) ||
        sha256ResearchJson(candidate.payload.parameters) !== sha256ResearchJson(fact.parameters)) return fail();
    if (studyCandidates.some(row => !studyTrials.some(trial => {
      const a = row.payload.trial_facts as Record<string,unknown>, b = trial.payload.trial_facts as Record<string,unknown>;
      return a.source_trial_id === b.source_trial_id && sha256ResearchJson(row.payload.parameters) === sha256ResearchJson(trial.payload.parameters);
    }))) return fail();
  }
  if (trials.some(row => !studies.has(String((row.payload.trial_facts as Record<string,unknown> | undefined)?.study_id))) ||
      candidates.some(row => !studies.has(String((row.payload.trial_facts as Record<string,unknown> | undefined)?.study_id)))) return fail();
  const final = CurrentSourceFoldPayloadSchema.parse(folds.at(-1)!.payload).causal_selection!;
  const finalId = folds.at(-1)!.sourceId;
  const sources = [summary.data.selection, selection[0].payload];
  for (const source of sources) {
    if (source.scope !== "LAST_FOLD_DEPLOYMENT" || source.fold_id !== finalId || source.trial_id !== final.selected_trial_id ||
        source.objective !== final.objective || sha256ResearchJson(source.parameters) !== sha256ResearchJson(final.parameters)) return fail();
  }
  if (summary.data.source_facts?.temporal_guards.observed_inner_fold_count !== innerCount ||
      summary.data.source_facts?.search.n_studies !== folds.length ||
      summary.data.source_facts?.search.optimization_schedule !== "per_fold_causal" ||
      summary.data.source_facts?.claims.causality_claim !== "strict_nested_fold_local_retraining" ||
      summary.data.source_facts?.claims.oos_used_for_selection !== false) return fail();
}
