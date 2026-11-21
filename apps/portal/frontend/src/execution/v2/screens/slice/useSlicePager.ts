/**
 * The slice's keyset pager, bound to the stream's snapshot (UXM-08, FIXTURE ONLY).
 *
 * Same-snapshot rule: a page change is a read of the lane's PAGE port, never of the stream's snapshot port, so it cannot move the
 * stream's baseline, its counters, its cursor or its generation. The other way round, a snapshot that is a new read (a different
 * `read_at_ms`) is a new chain: the cursors of the old one are bound to the old source revision and are dropped, page 1 is read
 * again. A notice, a heartbeat or a re-read of the same snapshot does not touch the chain.
 *
 * The cursors never leave `scopedPager.ts`: this hook, the state it returns and the screen only know that a next / previous page
 * exists. No snapshot (denied, revoked, not yet read) means no chain: the pager is reset and its rows are gone.
 */
import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { FixtureLane } from "./canonicalLane";
import type { ScopedRead } from "./scopedRead";
import { createScopedPager, type PagerState, type ScopedPager } from "./scopedPager";

const NEVER = () => () => undefined;

export interface SlicePager {
  state: PagerState;
  next(): void;
  previous(): void;
  /** Read the first page again (the one way out of a refusal). */
  startOver(): void;
}

/** `null` when the lane serves one page: nothing to page, nothing rendered. */
export function useSlicePager(lane: FixtureLane, read: ScopedRead | null, connection: string): SlicePager | null {
  const pager = useMemo<ScopedPager | null>(() => (lane.pages === null ? null : createScopedPager(lane.pages, { cursorRefusal: "stop" })), [lane]);
  const state = useSyncExternalStore(pager === null ? NEVER : pager.subscribe, () => (pager === null ? null : pager.getState()));
  const key = read === null ? null : `${connection}@${read.readAtMs}`;
  useEffect(() => {
    if (pager === null) return;
    if (key === null) pager.reset();
    else void pager.open(key);
    return () => pager.reset();
  }, [pager, key]);
  if (pager === null || state === null) return null;
  return {
    state,
    next: () => void pager.next(),
    previous: () => void pager.previous(),
    startOver: () => {
      if (state.query !== null) void pager.open(state.query);
    },
  };
}
