/** FULL-02 cross-relation identity check under the existing seal lock.
 * Decay studies use outer OOS; Three Window keeps an independent holdout. */
import { CurrentSourceFoldPayloadSchema, CurrentSourceSummarySchema } from "./current-source.payload";
import { ResearchCurrentSourceError } from "./current-source.error";
import { currentSourceRetainedIntervalMs, currentSourceRetainedMethod } from "./current-source-profile";
import { sha256ResearchJson } from "./preflight.service";

export function assertFull02SealConsistency(
  input: { profileId: string; sourceAdapterId?: string; tableRows: Record<string, number>; summary: Record<string, unknown> },
  rows: Array<{ tableKind: string; sourceOrdinal: number; sourceId: string; payload: Record<string, unknown> }>,
): void {
  const fail = (): never => { throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT", "FULL-02 selection, population or protocol does not match its retained source.", 409); };
  const summary = CurrentSourceSummarySchema.safeParse(input.summary);
  if (!summary.success) return fail();
  const folds = rows.filter(row => row.tableKind === "FOLD").sort((a,b) => a.sourceOrdinal - b.sourceOrdinal);
  const trials = rows.filter(row => row.tableKind === "TRIAL"), candidates = rows.filter(row => row.tableKind === "CANDIDATE");
  const singletons = rows.filter(row => row.tableKind === "SELECTION");
  if (folds.length !== input.tableRows.FOLD || trials.length !== input.tableRows.TRIAL
    || candidates.length !== input.tableRows.CANDIDATE || singletons.length !== 1 || rows.length > 113) return fail();
  const sameSelection = (selection: Record<string, unknown>, trialId: string, parameters: unknown, objective: unknown) =>
    selection.trial_id === trialId && selection.objective === objective
      && sha256ResearchJson(selection.parameters) === sha256ResearchJson(parameters);
  const method = currentSourceRetainedMethod(input.profileId,input.sourceAdapterId);
  if (method === "PER_FOLD_DECAY") {
    if (folds.length < 2 || folds.length > 16 || trials.length !== folds.length * 3
      || summary.data.source_facts?.search.optimization_schedule !== "per_fold_decay"
      || summary.data.source_facts.search.n_studies !== folds.length
      || summary.data.source_facts.claims.oos_used_for_selection !== true) return fail();
    const studies = new Set<string>();
    for (const [ordinal, row] of folds.entries()) {
      const parsed = CurrentSourceFoldPayloadSchema.safeParse(row.payload);
      if (!parsed.success || parsed.data.fold_id !== row.sourceId || row.sourceOrdinal !== ordinal
        || parsed.data.causal_selection || !parsed.data.fold_selection) return fail();
      const selected = parsed.data.fold_selection;
      if (studies.has(selected.study_id) || selected.selection_sequence !== ordinal
        || selected.params_digest !== sha256ResearchJson(selected.parameters)) return fail();
      studies.add(selected.study_id);
      const members = (source: typeof rows) => source.filter(member =>
        (member.payload.trial_facts as Record<string, unknown> | undefined)?.study_id === selected.study_id);
      const trialMembers = members(trials), candidateMembers = members(candidates);
      if (trialMembers.length !== 3 || candidateMembers.length !== selected.candidate_count
        || [...trialMembers, ...candidateMembers].some(member => {
          const scope = (member.payload.trial_facts as Record<string, unknown> | undefined)?.fold_scope as Record<string, unknown> | undefined;
          return !scope || !["FOLD", "PER_FOLD_STUDY"].includes(String(scope.kind)) || scope.fold_id !== row.sourceId;
        })) return fail();
      const trial = trialMembers.find(member => member.sourceId === selected.selected_trial_id);
      const candidate = candidateMembers.find(member => member.sourceId === selected.selected_trial_id);
      if (!trial || !candidate || trial.payload.state !== "COMPLETE"
        || candidate.payload.objective !== selected.objective
        || sha256ResearchJson(trial.payload.parameters) !== selected.params_digest
        || sha256ResearchJson(candidate.payload.parameters) !== selected.params_digest) return fail();
    }
    if ([...trials, ...candidates].some(member => !studies.has(String((member.payload.trial_facts as Record<string, unknown> | undefined)?.study_id)))) return fail();
    const finalRow = folds.at(-1)!, final = CurrentSourceFoldPayloadSchema.parse(finalRow.payload).fold_selection!;
    for (const selected of [summary.data.selection, singletons[0]!.payload]) {
      if (selected.scope !== "LAST_FOLD_DEPLOYMENT" || selected.fold_id !== finalRow.sourceId
        || !sameSelection(selected, final.selected_trial_id, final.parameters, final.objective)) return fail();
    }
  } else if (method === "THREE_WINDOW") {
    if (folds.length !== 1 || trials.length !== 3 || summary.data.selection.scope !== undefined
      || summary.data.source_facts?.search.optimization_schedule !== "global"
      || !summary.data.protocol_disclosure || summary.data.source_facts.claims.oos_used_for_selection !== true) return fail();
    const fold = CurrentSourceFoldPayloadSchema.safeParse(folds[0]!.payload);
    if (!fold.success || fold.data.causal_selection || fold.data.fold_selection) return fail();
    const selected = summary.data.selection, trial = trials.find(row => row.sourceId === selected.trial_id);
    const protocol = summary.data.protocol_disclosure;
    const intervalMs = currentSourceRetainedIntervalMs(input.profileId,input.sourceAdapterId);
    if (intervalMs === null || protocol.independent_holdout.selected_params_digest !== sha256ResearchJson(selected.parameters)
      || fold.data.train_start_utc_ms !== protocol.windows.is.start_utc_ms
      || fold.data.train_end_utc_ms === null || fold.data.train_end_utc_ms + intervalMs !== protocol.windows.is.end_exclusive_utc_ms
      || fold.data.test_start_utc_ms !== protocol.windows.oos.start_utc_ms
      || fold.data.test_end_utc_ms === null || fold.data.test_end_utc_ms + intervalMs !== protocol.windows.oos.end_exclusive_utc_ms) return fail();
    if (!trial || trial.payload.state !== "COMPLETE" || !sameSelection(singletons[0]!.payload,
      selected.trial_id!, selected.parameters, selected.objective)
      || sha256ResearchJson(trial.payload.parameters) !== sha256ResearchJson(selected.parameters)) return fail();
  } else return fail();
}
