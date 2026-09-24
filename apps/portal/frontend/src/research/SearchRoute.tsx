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

import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { SearchScreen } from "./SearchDetail";
import { RouteCursorNotice } from "./CursorNotice";
import { DEFAULT_CURSOR, clampFold, observedFoldsFor, useEvidenceCursor } from "./evidenceCursor";
import { SEARCH_FOLD_MAX, useSearch } from "./useSearch";

export function SearchRoute() {
  const { runId = "" } = useParams<{ runId: string }>();
  const { cursor, problems, notes, replaceFold, decline, clampToObserved } = useEvidenceCursor({ stage: "search" });
  /* RF-06: the search read publishes no fold set. Where this run already
     published one (the hub's `fold_navigation`, S05's fold plan), a fold it
     never observed is clamped here exactly as there — before it is sent. */
  const known = observedFoldsFor(runId);
  const knownKey = known ? known.join(",") : "";
  const target = known && known.length > 0 ? clampFold(cursor.fold, known).fold : cursor.fold;
  const clamped = target !== cursor.fold;
  const inRange = target >= 1 && target <= SEARCH_FOLD_MAX;
  const search = useSearch(runId, inRange ? target : DEFAULT_CURSOR.fold);

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
  const linkMode = cursor.carried?.mode ?? null;
  const linkSchedule = cursor.schedule;
  useEffect(() => {
    if (!requested) return;
    if (linkMode !== null && linkMode !== requested.mode) decline("mode", requested.mode);
    if (linkSchedule !== null && linkSchedule !== requested.schedule) decline("schedule", requested.schedule);
  }, [decline, linkMode, linkSchedule, requested]);

  return (
    <>
      <RouteCursorNotice problems={problems} notes={notes} frame={1560} />
      <SearchScreen
        runId={runId}
        detail={search.detail}
        state={search.state}
        notFound={search.refusal?.notFound === true}
        cursor={cursor}
        ledger={search.ledger}
        ensureLedger={search.ensureLedger}
        onReread={search.reread}
      />
    </>
  );
}
