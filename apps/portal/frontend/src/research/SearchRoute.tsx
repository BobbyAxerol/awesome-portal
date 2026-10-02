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

import { useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";

import { SearchScreen } from "./SearchDetail";
import { useModeReads } from "./SearchFoldStrip";
import { RouteCursorNotice } from "./CursorNotice";
import { DEFAULT_CURSOR, clampFold, observedFoldsFor, useEvidenceCursor } from "./evidenceCursor";
import { useFoldLedger } from "./useFoldLedger";
import { SEARCH_FOLD_MAX, retainedSearchOf, useRetainedRunFacts, useSearch } from "./useSearch";

export function SearchRoute({ embedded = false }: { embedded?: boolean } = {}) {
  const { runId = "" } = useParams<{ runId: string }>();
  const { cursor, problems, notes, replaceFold, decline, clampToObserved, update } = useEvidenceCursor({ stage: "search" });
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
  const search = useSearch(runId, inRange ? target : DEFAULT_CURSOR.fold);
  /* W3b: a retained WFO run is read against its own identity and declared space. */
  const retainedRun = useRetainedRunFacts(runId, undefined, search.ledger);
  /* G8: the fold plan and the Atlas, for the "what this mode reads" strip — asked only on a retained run. */
  const modeReads = useModeReads(runId, search.ledger);
  /* F2: the retained trial ledger asked with the cursor's fold, named by the fold plan. */
  const foldLedger = useFoldLedger(runId, search.ledger, modeReads.plan, inRange ? target : DEFAULT_CURSOR.fold);

  useEffect(() => {
    if (known && known.length > 0) clampToObserved(known);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `knownKey` carries the set; a hand-edited fold re-clamps
  }, [clampToObserved, knownKey, cursor.fold]);

  useEffect(() => {
    if (!inRange && !clamped) replaceFold(DEFAULT_CURSOR.fold, "OUT_OF_RANGE");
  }, [clamped, inRange, replaceFold]);

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
      <SearchScreen
        runId={runId}
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
        ensureLedger={search.ensureLedger}
        onReread={search.reread}
        embedded={embedded}
      />
    </>
  );
}
