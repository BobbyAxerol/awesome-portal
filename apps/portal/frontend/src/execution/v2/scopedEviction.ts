/**
 * Scoped-data eviction (UXM-08, FIXTURE ONLY): the one hook by which a view that learned "your access changed" tells the
 * screens it links to to forget what they read under that scope.
 *
 * Why it exists. The destination screens (Portfolio 360, Alpha Fleet, Alpha 360, Compare) keep their reads in React state of
 * the reading hook (`portfolios/useRead`, `fleet/useFleetRead`, `alpha/useAlphaReads`). There is no query cache and no
 * module-level store of rows behind them (`api/sharedRead.ts` keeps in-flight requests only). A destination that is not
 * mounted therefore holds nothing, and the next visit reads again. A destination that IS mounted while access is withdrawn
 * must drop its rows, cancel what is in flight and refuse a late answer: that is what the registered evictors do.
 *
 * What it is not. It is not a cache and holds no data, no scope, no identity. It never decides that access changed: the caller
 * does, from a published `access_revoked` frame or a snapshot read answered DENIED, and passes the cause. Unmounting a view
 * (leaving the slice to open a destination) is NOT a cause and never calls it.
 */
import { useEffect, useRef } from "react";

export type EvictionCause = "ACCESS_REVOKED" | "SNAPSHOT_DENIED";

/** The sentence a destination shows in place of the rows it dropped. Same words for every destination. */
export const EVICTED_REASON = "Your access to this scope changed, so nothing read under it is kept. Open My access.";

type Evictor = (cause: EvictionCause) => void;

const evictors = new Set<Evictor>();
let evictions = 0;

/** Register an evictor for as long as the cache lives. Returns the function that unregisters it. */
export function registerScopedCache(evict: Evictor): () => void {
  evictors.add(evict);
  return () => {
    evictors.delete(evict);
  };
}

/** Call every registered evictor once. One evictor throwing never stops the others. Returns the count of evictors called. */
export function evictScopedCaches(cause: EvictionCause): number {
  evictions += 1;
  const called = [...evictors];
  for (const evict of called) {
    try {
      evict(cause);
    } catch {
      /* a cache that cannot be cleared must not keep the others from being cleared */
    }
  }
  return called.length;
}

/** How many times an eviction has been requested in this page load (a test and diagnostics read; never a decision). */
export function scopedEvictionCount(): number {
  return evictions;
}

/** For a reading hook: register `evict` while mounted. The latest closure is the one called. */
export function useScopedCacheEviction(evict: Evictor): void {
  const latest = useRef(evict);
  latest.current = evict;
  useEffect(() => registerScopedCache((cause) => latest.current(cause)), []);
}
