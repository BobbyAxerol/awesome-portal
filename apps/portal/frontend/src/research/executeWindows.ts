/**
 * Screen 08 — the three windows (IS / OOS / HOLDOUT) as one control with the
 * fold chain, and the pure maths behind the transition markers.
 *
 *  - `?window=is|oos|holdout` is the window in the URL (default `oos`, which is
 *    then left out of the address). The fold stays in the hash cursor
 *    (`#fold=`), so one link carries both and S04/S05 can deep-link either.
 *  - Boundaries are only ever the ones the server published: the split's fold
 *    plan (train / test windows) and the overview buckets' own UTC times. A
 *    pixel position is derived from them; no boundary is invented.
 *  - Markers are the served target transitions. Pairing an entry with the
 *    transition that closes it is order only (consecutive served rows); there
 *    is no PnL here and an ambiguous sequence draws no connector.
 */

import { useCallback, useEffect, useState } from "react";

export type ExecWindow = "is" | "oos" | "holdout";

export const EXEC_WINDOWS: readonly ExecWindow[] = ["is", "oos", "holdout"];

export const DEFAULT_WINDOW: ExecWindow = "oos";

export function parseWindow(search: string): ExecWindow {
  const raw = new URLSearchParams(search).get("window");
  return raw === "is" || raw === "oos" || raw === "holdout" ? raw : DEFAULT_WINDOW;
}

/** `?window=` carried on a path (default window = no query, so existing links stay byte-identical). */
export function withWindow(path: string, window: ExecWindow): string {
  if (window === DEFAULT_WINDOW) return path;
  const hash = path.indexOf("#");
  const base = hash === -1 ? path : path.slice(0, hash);
  const tail = hash === -1 ? "" : path.slice(hash);
  return `${base}${base.includes("?") ? "&" : "?"}window=${window}${tail}`;
}

/** The window in the URL: read on arrival, written with replace (never a history entry per click), re-read on Back/forward. */
export function useExecuteWindow(): [ExecWindow, (next: ExecWindow) => void] {
  const [current, setCurrent] = useState<ExecWindow>(() => (typeof window === "undefined" ? DEFAULT_WINDOW : parseWindow(window.location.search)));
  useEffect(() => {
    const onPop = () => setCurrent(parseWindow(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const set = useCallback((next: ExecWindow) => {
    setCurrent(next);
    try {
      const url = new URL(window.location.href);
      if (next === DEFAULT_WINDOW) url.searchParams.delete("window");
      else url.searchParams.set("window", next);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* the address bar is a convenience; the state above still moved */
    }
  }, []);
  return [current, set];
}

/* ------------------------------------------------------------- overview bands */

export interface OverviewBucketTimes {
  first_ordinal: number;
  last_ordinal: number;
  open_utc_ms: number;
  close_utc_ms: number;
}

/**
 * The ordinal (as a drawing position) of a served UTC instant, from the
 * overview's own bucket times. Inside a bucket it is placed linearly between
 * the bucket's first and last bar; outside every bucket it clamps to the ends.
 * It only positions a band; it is never shown as a number.
 */
export function ordinalAt(buckets: readonly OverviewBucketTimes[], utcMs: number): number | null {
  if (buckets.length === 0) return null;
  const first = buckets[0]!;
  const last = buckets[buckets.length - 1]!;
  if (utcMs <= first.open_utc_ms) return first.first_ordinal;
  if (utcMs >= last.close_utc_ms) return last.last_ordinal;
  for (const bucket of buckets) {
    if (utcMs >= bucket.open_utc_ms && utcMs <= bucket.close_utc_ms) {
      const span = bucket.close_utc_ms - bucket.open_utc_ms;
      const at = span <= 0 ? 0 : (utcMs - bucket.open_utc_ms) / span;
      return bucket.first_ordinal + at * (bucket.last_ordinal - bucket.first_ordinal);
    }
  }
  /* Between two buckets (a source gap): the later bucket's start. */
  const next = buckets.find((bucket) => bucket.open_utc_ms >= utcMs);
  return next ? next.first_ordinal : last.last_ordinal;
}

export interface OverviewBand {
  key: "is" | "oos";
  /** Drawing span in ordinals. */
  from: number;
  to: number;
  active: boolean;
  /** Fold to read when the band is clicked (OOS bands only). */
  foldId: string | null;
  /** The band's tooltip: window start/end and bars, exactly as served. */
  title: string;
}

/** The IS buckets of a span: every overview bucket that overlaps `[start, end)`. */
export function bucketsInSpan<T extends OverviewBucketTimes>(buckets: readonly T[], startMs: number, endMs: number): T[] {
  return buckets.filter((bucket) => bucket.close_utc_ms >= startMs && bucket.open_utc_ms < endMs);
}

/* -------------------------------------------------------------------- markers */

export type MarkerKind = "ENTRY" | "EXIT" | "FLIP" | "RESIZE";
export type MarkerSide = "LONG" | "SHORT" | "FLAT";

export interface MarkerLike {
  ordinal: number;
  kind: MarkerKind;
}

/**
 * Connector pairs: an opener (ENTRY or FLIP) joined to the next served
 * transition that closes it (EXIT or FLIP), with only RESIZEs between. Any
 * other sequence (an EXIT with no opener in the window, two ENTRYs in a row,
 * a window that ends while open) pairs nothing.
 */
export function pairTransitions(markers: readonly MarkerLike[]): Array<{ from: number; to: number }> {
  const pairs: Array<{ from: number; to: number }> = [];
  let open: number | null = null;
  for (const marker of markers) {
    if (marker.kind === "RESIZE") continue;
    if (marker.kind === "ENTRY") {
      open = marker.ordinal;
    } else if (marker.kind === "EXIT") {
      if (open !== null) pairs.push({ from: open, to: marker.ordinal });
      open = null;
    } else {
      /* FLIP closes the open position and opens the next. */
      if (open !== null) pairs.push({ from: open, to: marker.ordinal });
      open = marker.ordinal;
    }
  }
  return pairs;
}

/** Glyph size from the bar spacing the chart is drawn at: scales with zoom, never below 12px, never above 18px. */
export function glyphSize(barSpacing: number | null): number {
  if (barSpacing === null || !Number.isFinite(barSpacing)) return 15;
  return Math.max(12, Math.min(18, Math.round(barSpacing * 1.6)));
}
