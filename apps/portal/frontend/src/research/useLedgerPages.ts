/**
 * Screen 06 — the rest of the retained trial ledger, page by page (QA D5).
 *
 * The lane serves 100 trials per read and, while more exist,
 * `ledger.page.has_more` with the `next_cursor` that continues it. The cursor
 * is echoed exactly as minted (never decoded or built here). Pages append to
 * the ones in hand; nothing is sorted, ranked or recounted — the served page
 * facts are the only truth, and a trial the server repeats is kept once.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { NOT_MODIFIED, searchApi, toSearchRefusal, type CurrentSourceSearch, type SearchRefusal } from "./searchClient";
import { isLaneNotApplicable } from "./splitClient";
import { isRetainedAnswer } from "./retainedLane";

type Trial = CurrentSourceSearch["ledger"]["trials"][number];
type Page = CurrentSourceSearch["ledger"]["page"];

export interface LedgerPages {
  /** The first page's search read with every later page appended to `ledger.trials`; the input itself when nothing was added. */
  merged: CurrentSourceSearch | null;
  hasMore: boolean;
  loading: boolean;
  error: SearchRefusal | null;
  loadMore: () => void;
}

export function useLedgerPages(runId: string, base: CurrentSourceSearch | null, foldId: string | null, workspaceId?: string): LedgerPages {
  /* A page belongs to the exact read it continues. */
  const key = `${workspaceId ?? ""}|${runId}|${foldId ?? ""}|${base?.ledger.page?.next_cursor ?? ""}|${base?.ledger.trials[0]?.trial_id ?? ""}`;
  const [held, setHeld] = useState<{ key: string; extra: Trial[]; page: Page | null }>({ key, extra: [], page: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ key: string; refusal: SearchRefusal } | null>(null);
  const inFlight = useRef(false);

  const mine = held.key === key ? held : { key, extra: [] as Trial[], page: null };
  const page: Page | null = mine.page ?? base?.ledger.page ?? null;
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
      .currentSource(runId, { workspaceId, fold: foldId, cursor: nextCursor })
      .then((answer) => {
        if (answer === NOT_MODIFIED || isLaneNotApplicable(answer) || !isRetainedAnswer(answer)) return;
        const next = answer as CurrentSourceSearch;
        setHeld((current) => {
          const have = current.key === key ? current.extra : [];
          const seen = new Set([...base.ledger.trials, ...have].map((trial) => trial.trial_id));
          return { key, extra: [...have, ...next.ledger.trials.filter((trial) => !seen.has(trial.trial_id))], page: next.ledger.page };
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
          ledger: {
            ...base.ledger,
            trials: [...base.ledger.trials, ...mine.extra],
            returned_rows: base.ledger.trials.length + mine.extra.length,
            page: mine.page ?? base.ledger.page,
          },
        };

  return { merged, hasMore: nextCursor !== null, loading, error: error?.key === key ? error.refusal : null, loadMore };
}
