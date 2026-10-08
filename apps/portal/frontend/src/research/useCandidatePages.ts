/**
 * Screen 06 · the rest of the retained candidate pool, page by page.
 *
 * Large pools (hundreds of candidates) are served as independent 50-row pages: `candidates.page.next_cursor` continues them as
 * `candidate_cursor`. It is a different relation from the trial ledger, so this hook never sends a trial cursor and the ledger hook
 * never sends this one. Cursors are echoed exactly as minted; nothing is sorted, ranked or recounted, and a candidate the server
 * repeats is kept once. A small historical pool has no `page` and is shown whole.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { NOT_MODIFIED, searchApi, toSearchRefusal, type CurrentSourceSearch, type SearchRefusal } from "./searchClient";
import { isLaneNotApplicable } from "./splitClient";
import { isRetainedAnswer } from "./retainedLane";

type Candidate = CurrentSourceSearch["candidates"]["rows"][number];
type Page = NonNullable<CurrentSourceSearch["candidates"]["page"]>;

export interface CandidatePages {
  /** The search read with every later candidate page appended to `candidates.rows`; the input itself when nothing was added. */
  merged: CurrentSourceSearch | null;
  hasMore: boolean;
  loading: boolean;
  error: SearchRefusal | null;
  loadMore: () => void;
}

export function useCandidatePages(runId: string, base: CurrentSourceSearch | null, foldId: string | null, workspaceId?: string): CandidatePages {
  /* A page belongs to the exact read it continues. */
  const key = `${workspaceId ?? ""}|${runId}|${foldId ?? ""}|${base?.candidates.page?.next_cursor ?? ""}|${(base?.candidates.rows[0] as { candidate_id?: string } | undefined)?.candidate_id ?? ""}`;
  const [held, setHeld] = useState<{ key: string; extra: Candidate[]; page: Page | null }>({ key, extra: [], page: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ key: string; refusal: SearchRefusal } | null>(null);
  const inFlight = useRef(false);

  const mine = held.key === key ? held : { key, extra: [] as Candidate[], page: null };
  const page: Page | null = mine.page ?? base?.candidates.page ?? null;
  const nextCursor = page?.has_more ? page.next_cursor : null;

  useEffect(() => {
    inFlight.current = false;
    setLoading(false);
  }, [key]);

  const loadMore = useCallback(() => {
    if (!base || !nextCursor || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    searchApi
      .currentSource(runId, { workspaceId, fold: foldId, candidateCursor: nextCursor })
      .then((answer) => {
        if (answer === NOT_MODIFIED || isLaneNotApplicable(answer) || !isRetainedAnswer(answer)) return;
        const next = answer as CurrentSourceSearch;
        setHeld((current) => {
          const have = current.key === key ? current.extra : [];
          const idOf = (row: Candidate) => (row as { candidate_id: string }).candidate_id;
          const seen = new Set([...base.candidates.rows, ...have].map(idOf));
          return { key, extra: [...have, ...next.candidates.rows.filter((row) => !seen.has(idOf(row)))], page: next.candidates.page ?? null };
        });
      })
      .catch((cause: unknown) => setError({ key, refusal: toSearchRefusal(cause) }))
      .finally(() => {
        inFlight.current = false;
        setLoading(false);
      });
  }, [base, foldId, key, nextCursor, runId, workspaceId]);

  const merged: CurrentSourceSearch | null =
    base === null || mine.extra.length === 0
      ? base
      : {
          ...base,
          candidates: {
            ...base.candidates,
            rows: [...base.candidates.rows, ...mine.extra],
            returned_rows: base.candidates.rows.length + mine.extra.length,
            page: mine.page ?? base.candidates.page,
          },
        };

  return { merged, hasMore: nextCursor !== null, loading, error: error?.key === key ? error.refusal : null, loadMore };
}
