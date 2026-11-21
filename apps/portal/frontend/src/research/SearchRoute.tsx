/**
 * Screen 06 on its product route (P15).
 *
 * `/research/quantbt/runs/:runId/search`. The cursor's fold is the contract's
 * `fold` selector, so a reader who arrived from the hub on fold 3 asks this
 * screen about fold 3 — and is told, in the server's words, that this source
 * has no optimizer fold.
 *
 * RF-06: a hash without a stage is on the search stage (FE-X-10); a fold the
 * read cannot accept is replaced before it is sent, with a notice (FE-S06-06);
 * an Atlas `mode`/`schedule` the run contradicts is declined, with a notice,
 * rather than forwarded into every link (FE-S06-05).
 */

import { useRunNative } from "./useRunNative";
import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { SearchScreen } from "./SearchDetail";
import { useModeReads } from "./SearchFoldStrip";
import { RouteCursorNotice } from "./CursorNotice";
import { DEFAULT_CURSOR, clampFold, observedFoldsFor, useEvidenceCursor } from "./evidenceCursor";
import { useFoldLedger } from "./useFoldLedger";
import { SEARCH_FOLD_MAX, retainedSearchOf, useRetainedRunFacts, useSearch } from "./useSearch";

export function SearchRoute({ embedded = false }: { embedded?: boolean } = {}) {
  const { runId = "" } = useParams<{ runId: string }>();
  const [search] = useSearchParams();
  const workspaceId = search.get("workspace_id") || undefined;
  return <SearchRouteBody key={`${workspaceId ?? ""}|${runId}`} runId={runId} workspaceId={workspaceId} embedded={embedded} />;
}

function SearchRouteBody({ runId, workspaceId, embedded }: { runId: string; workspaceId?: string; embedded: boolean }) {
  const { cursor, problems, notes, replaceFold, decline, clampToObserved, update, addNote } = useEvidenceCursor({ stage: "search" });
  /* X2 · F4 (T07/T08): the inspected trial lives in the hash as `pick=`, so a
     link restores it; picking never moves θ* or any other cursor key. */
  const pick = cursor.carried?.pick ?? null;
  const carried = cursor.carried;
  const onPick = useCallback(
    (trialId: string) => update({ carried: { ...(carried ?? {}), pick: trialId } }),
    [carried, update],
  );
  /* D9: letting go of the pick drops only `pick=`; every other carried key stays. */
  const onClear = useCallback(() => {
    const { pick: _dropped, ...rest } = carried ?? {};
    update({ carried: rest });
  }, [carried, update]);
  /* RF-06: the search read publishes no fold set. Where this run already
     published one (the hub's `fold_navigation`, S05's fold plan), a fold it
     never observed is clamped here exactly as there — before it is sent. */
  const known = observedFoldsFor(runId);
  const knownKey = known ? known.join(",") : "";
  const target = known && known.length > 0 ? clampFold(cursor.fold, known).fold : cursor.fold;
  const clamped = target !== cursor.fold;
  const inRange = target >= 1 && target <= SEARCH_FOLD_MAX;
  /* §55: a natively searched run is one study with no fold; the read must not carry one. */
  const native = useRunNative(runId, workspaceId);
  const search = useSearch(runId, native === true ? null : inRange ? target : DEFAULT_CURSOR.fold, workspaceId, native !== null);
  /* W3b: a retained WFO run is read against its own identity and declared space. */
  const retainedRun = useRetainedRunFacts(runId, workspaceId, search.ledger);
  /* G8: the fold plan and the Atlas, for the "what this mode reads" strip — asked only on a retained run. */
  const modeReads = useModeReads(runId, search.ledger, workspaceId);
  /* F2: the retained trial ledger asked with the cursor's fold, named by the fold plan. */
  const foldLedger = useFoldLedger(runId, search.ledger, modeReads.plan, inRange ? target : DEFAULT_CURSOR.fold, workspaceId);

  useEffect(() => {
    if (known && known.length > 0) clampToObserved(known);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `knownKey` carries the set; a hand-edited fold re-clamps
  }, [clampToObserved, knownKey, cursor.fold]);

  useEffect(() => {
    if (!inRange && !clamped) replaceFold(DEFAULT_CURSOR.fold, "OUT_OF_RANGE");
  }, [clamped, inRange, replaceFold]);

  /* D7: this read publishes no fold set, but the fold plan the strip reads does —
     a fold it never listed is clamped to it exactly as an observed fold is, with the same notice. */
  const planFolds = modeReads.plan.state === "ready" ? modeReads.plan.folds.map((fold) => fold.source_ordinal + 1) : [];
  const planKey = planFolds.join(",");
  useEffect(() => {
    if (planFolds.length > 0) clampToObserved(planFolds);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `planKey` carries the set; a hand-edited fold re-clamps
  }, [clampToObserved, planKey, cursor.fold]);

  /* D7: a stage this route is not, and a pick the search does not hold, are said and taken out of the URL. */
  const [linkNotes, setLinkNotes] = useState<string[]>([]);
  const say = useCallback((text: string) => setLinkNotes((previous) => (previous.includes(text) ? previous : [...previous, text])), []);
  useEffect(() => {
    if (embedded || cursor.stage === "search") return;
    say(`This link asked for stage “${cursor.stage}”. This is Search.`);
    update({ stage: "search" });
  }, [cursor.stage, embedded, say, update]);
  const lane = retainedSearchOf(search.ledger);
  const points = lane?.surface?.points ?? [];
  const ledgerTrials = lane?.ledger.trials ?? [];
  const pickKnown = pick === null || points.length === 0 || points.some((point) => point.trial_id === pick) || ledgerTrials.some((trial) => trial.trial_id === pick);
  useEffect(() => {
    if (pickKnown || pick === null) return;
    addNote({ code: "CURSOR_TRIAL_NOT_FOUND", value: pick });
    onClear();
  }, [addNote, onClear, pick, pickKnown]);
  const onFold = useCallback((fold: number, options?: { replace?: boolean }) => update({ fold }, options), [update]);

  /* The run's mode and schedule were fixed at submit. A link that names
     others is acknowledged, not obeyed and not carried on. */
  const requested = search.detail?.requested_optimizer;
  /* W3b: on a retained run the mode and schedule are the retained search contract's. */
  const contract = retainedSearchOf(search.ledger)?.search_contract ?? null;
  const runMode = contract ? contract.optimization_mode : (requested?.mode ?? null);
  const runSchedule = contract ? contract.optimization_schedule : (requested?.schedule ?? null);
  const settled = requested !== undefined && search.state.state !== "loading";
  const linkMode = cursor.carried?.mode ?? null;
  const linkSchedule = cursor.schedule;
  useEffect(() => {
    if (!settled) return;
    if (linkMode !== null && linkMode !== runMode) decline("mode", runMode);
    if (linkSchedule !== null && linkSchedule !== runSchedule) decline("schedule", runSchedule);
  }, [decline, linkMode, linkSchedule, runMode, runSchedule, settled]);

  return (
    <>
      {embedded ? null : <RouteCursorNotice problems={problems} notes={notes} frame={1560} />}
      {linkNotes.length > 0 && !embedded ? (
        <div role="status" className="mono mx-auto w-full max-w-[1560px] px-4 text-[11px]" style={{ color: "var(--ink-soft)" }} data-link-notice>
          {linkNotes.join(" ")}
        </div>
      ) : null}
      <SearchScreen
        runId={runId}
        workspaceId={workspaceId}
        detail={search.detail}
        state={search.state}
        notFound={search.refusal?.notFound === true}
        cursor={cursor}
        ledger={search.ledger}
        foldLedger={foldLedger}
        retainedRun={retainedRun}
        modeReads={modeReads}
        pick={pick}
        onPick={onPick}
        onClear={onClear}
        onFold={onFold}
        ensureLedger={search.ensureLedger}
        onReread={search.reread}
        embedded={embedded}
      />
    </>
  );
}
