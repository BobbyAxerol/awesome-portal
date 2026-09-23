/**
 * Screen 06 on its product route (P15).
 *
 * `/research/quantbt/runs/:runId/search`. The cursor's fold is the contract's
 * `fold` selector, so a reader who arrived from the hub on fold 3 asks this
 * screen about fold 3 — and is told, in the server's words, that this source
 * has no optimizer fold.
 */

import { useParams } from "react-router-dom";

import { SearchScreen } from "./SearchDetail";
import { RouteCursorNotice } from "./CursorNotice";
import { useEvidenceCursor } from "./evidenceCursor";
import { useSearch } from "./useSearch";

export function SearchRoute() {
  const { runId = "" } = useParams<{ runId: string }>();
  const { cursor, problems } = useEvidenceCursor({ stage: "search" });
  const search = useSearch(runId, cursor.fold);

  return (
    <>
      <RouteCursorNotice problems={problems} />
      <SearchScreen
        runId={runId}
        detail={search.detail}
        state={search.state}
        cursor={cursor}
        ledger={search.ledger}
        ensureLedger={search.ensureLedger}
        onReread={search.reread}
      />
    </>
  );
}
