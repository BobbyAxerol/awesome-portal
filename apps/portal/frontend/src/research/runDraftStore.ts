/**
 * Screen 02 · the declaration survives a reload (U15).
 *
 * The draft is kept in `sessionStorage` while the form is on screen and dropped when the reader leaves it
 * inside the app, so a reload brings the declaration back and a fresh visit opens clean. Every storage
 * access is guarded: private windows, blocked site data and previews throw or answer null, and the form
 * must render the same without it. A link that owns the declaration (`?from=`, `?fork=`, another `?av=`)
 * never restores an older draft over it.
 */

import type { RunDraft } from "./runDraft";

export const RUN_DRAFT_STORAGE_KEY = "research.quantbt.new-run.draft.v1";

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveRunDraft(draft: RunDraft): void {
  try {
    store()?.setItem(RUN_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* quota or blocked storage: the form works without it */
  }
}

export function clearRunDraft(): void {
  try {
    store()?.removeItem(RUN_DRAFT_STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The stored declaration laid over `base`, or null when nothing usable is stored or the address owns the
 * declaration. Only the shapes the form reads are checked; an unreadable value is dropped, never repaired.
 */
export function restoreRunDraft(base: RunDraft, search: string): RunDraft | null {
  const query = new URLSearchParams(search);
  if (query.get("from") || query.get("fork")) return null;
  let parsed: unknown;
  try {
    const raw = store()?.getItem(RUN_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !isRecord(parsed.windows) || !isRecord(parsed.walkForward) || !Array.isArray(parsed.parameters)) return null;
  const version = query.get("av");
  if (version && parsed.alphaVersionId !== version) return null;
  return { ...base, ...(parsed as Partial<RunDraft>) };
}
