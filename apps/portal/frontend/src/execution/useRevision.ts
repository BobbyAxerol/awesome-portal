/**
 * Motion by real revision (G8 / EDS-09b): a beat fires when the observed
 * projection sequence (or any revision key) changes — never on a wall clock.
 * Polling follows the projection's own cadence and the realtime refresh key;
 * it stops only on the fixtures page and while the tab is hidden.
 */
import { useEffect, useRef, useState } from "react";

import { retainedEpoch, retainedStatic, subscribeRetained } from "./retainedReview";


/** Increments every time `key` changes to a new non-null value; 0 until the first value. */
export function useRevisionBeat(key: string | number | null | undefined): { beat: number; changedAtMs: number | null } {
  const last = useRef<string | number | null | undefined>(undefined);
  const [state, setState] = useState<{ beat: number; changedAtMs: number | null }>({ beat: 0, changedAtMs: null });
  useEffect(() => {
    if (key === null || key === undefined) return;
    if (last.current === undefined) { last.current = key; return; }
    if (last.current !== key) {
      last.current = key;
      setState((s) => ({ beat: s.beat + 1, changedAtMs: Date.now() }));
    }
  }, [key]);
  return state;
}

/**
 * Re-reading a source is not motion: it stays on under `prefers-reduced-motion`
 * and in automated browsers (so a Playwright check can watch a revision advance),
 * and is off only on the evidence fixtures page, where a dozen screens mount at
 * once and the audits measure a still page.
 */
export function pollAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location?.pathname.includes("/_fixtures")) return false;
  return true;
}

/**
 * A tick every `intervalMs` while polling is allowed and the tab is visible — used only to re-read a source, never to animate.
 *
 * In an Execution retained review (UDB-03) the source is a set of earlier observations that cannot change: the interval is off, and the
 * tick advances only when the reader asks for a refresh. `scope: "always"` is for work that is not Execution source reading (Research jobs).
 */
export function usePollTick(intervalMs: number, active = true, scope: "execution" | "always" = "execution"): number {
  const [tick, setTick] = useState(0);
  const [epoch, setEpoch] = useState(retainedEpoch);
  const [frozen, setFrozen] = useState(retainedStatic);
  useEffect(() => subscribeRetained(() => { setEpoch(retainedEpoch()); setFrozen(retainedStatic()); }), []);
  const stopped = scope === "execution" && frozen;
  useEffect(() => {
    if (!active || stopped || !pollAllowed() || intervalMs <= 0) return undefined;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setTick((t) => t + 1);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active, stopped]);
  return tick + (scope === "execution" ? epoch : 0);
}

/**
 * The cadence to use until the server has told us its own.
 *
 * It mirrors `EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS` (15 s on dev), and
 * it is a fallback rather than the rule: see `useFreshnessPoll`.
 */
export const PROJECTION_POLL_MS = 15_000;

/** Freshness is an age classification, not a no-change or polling promise.
 * Only an explicit refreshIntervalMs hint changes the bounded fallback. */
export const MIN_POLL_MS = 5_000;

export function freshnessPollMs(budget: { freshMs: number; refreshIntervalMs?: number } | null | undefined): number {
  const fresh = budget?.refreshIntervalMs;
  if (typeof fresh !== "number" || !Number.isFinite(fresh)) return PROJECTION_POLL_MS;
  return Math.max(MIN_POLL_MS, Math.min(60_000, Math.round(fresh)));
}

/**
 * A bounded fallback tick; an age budget alone is not a cadence hint.
 */
export function useFreshnessPoll(
  budget: { freshMs: number; refreshIntervalMs?: number } | null | undefined,
  active = true,
): number {
  return usePollTick(freshnessPollMs(budget), active);
}
