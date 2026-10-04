/** One selected trial, resolved through bounded opaque pages of its named read.
 * Never builds a cursor from a display ordinal, fetches a job, or changes θ*.
 */
import { useEffect, useState } from "react";
import { NOT_MODIFIED, searchApi, type CurrentSourceSearch, type SourceTrial } from "./searchClient";
import { isLaneNotApplicable } from "./splitClient";

export type CinemaStudy = { studyId: string; foldId: string };
export type SelectedCinemaTrial =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready"; trial: SourceTrial }
  | { state: "absent"; reason: string };

const MAX_ROWS = 400;
const MAX_PAGES = 4;
type ReadPage = typeof searchApi.currentSource;

function selectedOnPage(page: CurrentSourceSearch, selectedId: string, study?: CinemaStudy): SelectedCinemaTrial | null {
  const rows = page.ledger.trials.filter(trial => trial.trial_id === selectedId);
  if (rows.length === 0) return null;
  if (rows.length !== 1) return { state: "absent", reason: "UI_SELECTED_TRIAL_ID_AMBIGUOUS" };
  const trial = rows[0]!;
  if (study && (trial.facts.study_id !== study.studyId || trial.facts.fold_scope.fold_id !== study.foldId)) {
    return { state: "absent", reason: "UI_SELECTED_TRIAL_STUDY_SCOPE_MISMATCH" };
  }
  return trial.params_digest
    ? { state: "ready", trial }
    : { state: "absent", reason: "UI_SELECTED_TRIAL_DIGEST_NOT_PUBLISHED" };
}

export async function readSelectedCinemaTrial(
  runId: string, base: CurrentSourceSearch, selectedId: string, workspaceId: string | undefined,
  signal: AbortSignal, study?: CinemaStudy, read: ReadPage = searchApi.currentSource,
): Promise<SelectedCinemaTrial> {
  if (base.run_id !== runId) return { state: "absent", reason: "UI_SELECTED_TRIAL_RUN_SCOPE_MISMATCH" };
  const population = base.ledger.source_trial_count;
  if (population > MAX_ROWS || population < 0) return { state: "absent", reason: "UI_SELECTED_TRIAL_READ_BOUND_EXCEEDED" };
  const foldId = base.ledger.fold_filter?.fold_id ?? null;
  if (study && foldId !== null && foldId !== study.foldId) return { state: "absent", reason: "UI_SELECTED_TRIAL_STUDY_SCOPE_MISMATCH" };
  const seenCursors = new Set<string>();
  let page = base, inspected = 0;
  for (let n = 0; n < MAX_PAGES; n += 1) {
    if (signal.aborted) return { state: "idle" };
    inspected += page.ledger.trials.length;
    if (inspected > MAX_ROWS) return { state: "absent", reason: "UI_SELECTED_TRIAL_READ_BOUND_EXCEEDED" };
    const found = selectedOnPage(page, selectedId, study);
    if (found) return found;
    const cursor = page.ledger.page.has_more ? page.ledger.page.next_cursor : null;
    if (!cursor) return { state: "absent", reason: "UI_SELECTED_TRIAL_NOT_IN_RETAINED_LEDGER" };
    if (seenCursors.has(cursor)) return { state: "absent", reason: "UI_SELECTED_TRIAL_CURSOR_REPEATED" };
    if (n + 1 === MAX_PAGES) break;
    seenCursors.add(cursor);
    const answer = await read(runId, { workspaceId, fold: foldId, cursor, signal });
    if (signal.aborted) return { state: "idle" };
    if (answer === NOT_MODIFIED || isLaneNotApplicable(answer)) return { state: "absent", reason: "UI_SELECTED_TRIAL_LEDGER_NOT_AVAILABLE" };
    if (answer.run_id !== runId || answer.revision !== base.revision
      || answer.source_revision !== base.source_revision || answer.presentation_revision !== base.presentation_revision
      || answer.ledger.source_trial_count !== population
      || (answer.ledger.fold_filter?.fold_id ?? null) !== foldId) {
      return { state: "absent", reason: "UI_SELECTED_TRIAL_PAGE_SCOPE_CHANGED" };
    }
    page = answer;
  }
  return { state: "absent", reason: "UI_SELECTED_TRIAL_READ_BOUND_EXCEEDED" };
}

export function useSelectedCinemaTrial(
  runId: string, base: CurrentSourceSearch, selectedId: string | null,
  workspaceId?: string, study?: CinemaStudy, enabled = true,
): SelectedCinemaTrial {
  const key = `${workspaceId ?? ""}|${runId}|${base.revision}|${base.source_revision ?? ""}|${base.presentation_revision ?? ""}|${base.ledger.fold_filter?.fold_id ?? ""}|${selectedId ?? ""}|${study?.studyId ?? ""}|${study?.foldId ?? ""}`;
  const [held, setHeld] = useState<{ key: string; value: SelectedCinemaTrial } | null>(null);
  useEffect(() => {
    if (selectedId === null || !enabled) return;
    // A row already carried by this read is synchronous authority, not an
    // asynchronous "lookup completed" state (and requires no follow-up GET).
    if (selectedOnPage(base, selectedId, study) !== null) return;
    const controller = new AbortController();
    readSelectedCinemaTrial(runId, base, selectedId, workspaceId, controller.signal, study)
      .then(value => { if (!controller.signal.aborted) setHeld({ key, value }); })
      .catch(() => { if (!controller.signal.aborted) setHeld({ key, value: { state: "absent", reason: "UI_SELECTED_TRIAL_READ_REFUSED" } }); });
    return () => controller.abort();
  }, [base, enabled, key, runId, selectedId, workspaceId, study?.studyId, study?.foldId]);
  if (selectedId === null || !enabled) return { state: "idle" };
  const existing = selectedOnPage(base, selectedId, study);
  return existing ?? (held?.key === key ? held.value : { state: "loading" });
}
