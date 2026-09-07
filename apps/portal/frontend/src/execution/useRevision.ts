/**
 * Motion by real revision (G8 / EDS-09b): a beat fires when the observed
 * projection sequence (or any revision key) changes — never on a wall clock.
 * Polling follows the projection's own cadence and the realtime refresh key;
 * it stops only on the fixtures page and while the tab is hidden.
 */
import { useEffect, useRef, useState } from "react";


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

/** A tick every `intervalMs` while polling is allowed and the tab is visible — used only to re-read a source, never to animate. */
export function usePollTick(intervalMs: number, active = true): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active || !pollAllowed() || intervalMs <= 0) return undefined;
    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      setTick((t) => t + 1);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return tick;
}

/** The projection's cadence on dev (EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS default 15 s). */
export const PROJECTION_POLL_MS = 15_000;
