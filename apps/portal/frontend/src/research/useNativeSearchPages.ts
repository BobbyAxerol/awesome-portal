/**
 * Screen 06 (native) — the rest of the trial ledger, page by page (§55).
 *
 * The first read answers the default page; while `ledger.next_cursor` is not null the next page is asked with that cursor and the SAME
 * `native_limit` (the cursor binds actor, workspace, run and source). Pages append in the server's order; a trial the server repeats is
 * kept once. Nothing is recomputed: `ledger.total` is the server's. Aborted and forgotten when the run or the first page changes.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { NOT_MODIFIED, searchApi, toSearchRefusal, type NativeSearch } from "./searchClient";

type Row = NativeSearch["ledger"]["rows"][number];

/** The page size every native read asks for (the contract's ceiling and default). */
export const NATIVE_LIMIT = 200;

export interface NativeSearchPages {
  rows: readonly Row[];
  hasMore: boolean;
  loading: boolean;
  error: boolean;
  loadMore: () => void;
}

export function useNativeSearchPages(runId: string, base: NativeSearch | null, workspaceId?: string): NativeSearchPages {
  const key = `${workspaceId ?? ""}|${runId}|${base?.revision ?? ""}|${base?.ledger.next_cursor ?? ""}`;
  const [held, setHeld] = useState<{ key: string; extra: Row[]; next: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const inFlight = useRef(false);

  const mine = held !== null && held.key === key ? held : { key, extra: [] as Row[], next: base?.ledger.next_cursor ?? null };
  const next = mine.next;

  useEffect(() => {
    inFlight.current = false;
    setLoading(false);
    setFailed(null);
  }, [key]);

  const loadMore = useCallback(() => {
    if (base === null || next === null || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setFailed(null);
    searchApi
      .detail(runId, { workspaceId, nativeLimit: NATIVE_LIMIT, nativeCursor: next })
      .then((answer) => {
        if (answer === NOT_MODIFIED || !answer.native_search) return;
        const page = answer.native_search.ledger;
        setHeld((current) => {
          const have = current !== null && current.key === key ? current.extra : [];
          const seen = new Set([...base.ledger.rows, ...have].map((row) => row.trial_number));
          return { key, extra: [...have, ...page.rows.filter((row) => !seen.has(row.trial_number))], next: page.next_cursor };
        });
      })
      .catch((cause: unknown) => {
        toSearchRefusal(cause);
        setFailed(key);
      })
      .finally(() => {
        inFlight.current = false;
        setLoading(false);
      });
  }, [base, key, next, runId, workspaceId]);

  return { rows: base === null ? [] : [...base.ledger.rows, ...mine.extra], hasMore: next !== null, loading, error: failed === key, loadMore };
}
