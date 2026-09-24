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
import { DEFAULT_CURSOR, useEvidenceCursor } from "./evidenceCursor";
import { SEARCH_FOLD_MAX, useSearch } from "./useSearch";

export function SearchRoute() {
  const { runId = "" } = useParams<{ runId: string }>();
  const { cursor, problems, notes, replaceFold, decline } = useEvidenceCursor({ stage: "search" });
  const inRange = cursor.fold >= 1 && cursor.fold <= SEARCH_FOLD_MAX;
  const search = useSearch(runId, inRange ? cursor.fold : DEFAULT_CURSOR.fold);

  useEffect(() => {
    if (!inRange) replaceFold(DEFAULT_CURSOR.fold, "OUT_OF_RANGE");
  }, [inRange, replaceFold]);

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
      <RouteCursorNotice problems={problems} notes={notes} />
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
