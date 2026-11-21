/**
 * The evidence window — `window=is|oos|holdout` (F2b, S04; W5 §3.1).
 *
 * The window is a FE view key of the evidence cursor and lives in the location
 * HASH next to `fold`/`trial` (`EvidenceCursor.window`, declared in
 * `evidenceCursor.ts`). It is not part of the `p02-cursor.v2` codec: the cursor
 * strips it before decoding and re-adds it when serialising, so the server
 * contract never sees it.
 *
 * Nothing here is a fact about the run. A reader's choice is written to the
 * address; whether the Hub publishes anything for that window is decided by the
 * Hub's own read, and the screen says so rather than guessing.
 *
 * This module only owns the vocabulary and the reader of the LEGACY `?window=`
 * query, which the cursor reads once on arrival and rewrites into the hash.
 * There is no `withWindow`: links are built by `runScreenHref`, which writes the
 * window into the hash from the cursor.
 */

export const EVIDENCE_WINDOWS = ["is", "oos", "holdout"] as const;
export type EvidenceWindow = (typeof EVIDENCE_WINDOWS)[number];

/** What a screen with no named window shows. The Hub publishes this one. */
export const DEFAULT_WINDOW: EvidenceWindow = "oos";

export function isEvidenceWindow(value: string | null | undefined): value is EvidenceWindow {
  return value !== null && value !== undefined && (EVIDENCE_WINDOWS as readonly string[]).includes(value);
}

/**
 * LEGACY: the window a `?window=` query names, or `null` when it names none
 * (or names something unreadable). Old links keep working through this one
 * read; new links never carry the query.
 */
export function parseWindow(search: string): EvidenceWindow | null {
  const raw = new URLSearchParams(search).get("window");
  return isEvidenceWindow(raw) ? raw : null;
}
