/**
 * The evidence window — `?window=is|oos|holdout` (F2b, S04).
 *
 * The cursor lives in the location hash; the window is the one extra key, and it
 * lives in the query string so every stage screen (S05–S08) can read it without
 * touching the hash codec. The vocabulary is the one S08 uses.
 *
 * Nothing here is a fact about the run. A reader's choice is written to the URL;
 * whether the Hub publishes anything for that window is decided by the Hub's own
 * read, and the screen says so rather than guessing.
 */

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

export const EVIDENCE_WINDOWS = ["is", "oos", "holdout"] as const;
export type EvidenceWindow = (typeof EVIDENCE_WINDOWS)[number];

/** What a screen with no `?window=` shows. The Hub publishes this one. */
export const DEFAULT_WINDOW: EvidenceWindow = "oos";

/** The window a query string names, or `null` when it names none (or names something unreadable). */
export function parseWindow(search: string): EvidenceWindow | null {
  const raw = new URLSearchParams(search).get("window");
  return raw !== null && (EVIDENCE_WINDOWS as readonly string[]).includes(raw) ? (raw as EvidenceWindow) : null;
}

/**
 * Adds `?window=` to a link, before its hash. A reader who never chose a window
 * gets the link unchanged: an absent key stays absent instead of being defaulted.
 */
export function withWindow(href: string, window: EvidenceWindow | null): string {
  if (window === null) return href;
  const hashAt = href.indexOf("#");
  const path = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("window", window);
  return `${base}?${params.toString()}${hash}`;
}

export interface EvidenceWindowState {
  /** The window the URL names; `null` when it names none. Links carry exactly this. */
  named: EvidenceWindow | null;
  /** The window the screen shows: the named one, else the Hub's own. */
  window: EvidenceWindow;
  /** Writes `?window=` with replace semantics (a window is a view, not a place — Back leaves the run). */
  setWindow: (next: EvidenceWindow) => void;
}

/**
 * Owns `?window=` for one screen. Like the cursor hash it is written with
 * `history.replaceState`, keeps the hash, and is re-read when the router moves or
 * the reader goes Back/forward, so "copy link" and history restore the same view.
 */
export function useEvidenceWindow(): EvidenceWindowState {
  const location = useLocation();
  const [named, setNamed] = useState<EvidenceWindow | null>(() => parseWindow(location.search));
  useEffect(() => {
    setNamed(parseWindow(location.search));
  }, [location.search]);
  useEffect(() => {
    const onPop = () => setNamed(parseWindow(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const setWindow = useCallback((next: EvidenceWindow) => {
    setNamed(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("window", next);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } catch {
      /* a sandboxed history: the view still changed, only the address did not. */
    }
  }, []);
  return { named, window: named ?? DEFAULT_WINDOW, setWindow };
}

/**
 * The window the URL names, for blocks deep in the tree that draw links of their
 * own (the per-fold verdict rows). `null` outside the Hub, and when none is named.
 */
export const NamedWindowContext = createContext<EvidenceWindow | null>(null);
export const useNamedWindow = (): EvidenceWindow | null => useContext(NamedWindowContext);
