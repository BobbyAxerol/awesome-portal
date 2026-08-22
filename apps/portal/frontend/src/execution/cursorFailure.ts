/**
 * C-PI04-03 — cursor failure UX.
 *
 * Every rejected cursor produced one sentence: "The page reference expired or
 * no longer applies — showing the first page." It was matched by a regex over
 * the reason text, and the comment beside it explained why: the BFF used to
 * collapse expiry and context mismatch into one `INVALID_CURSOR` (audit A-8).
 *
 * PRE-IAM-04 closed that (H-8). `apps/control-api/src/query/cursor.ts` now
 * throws three distinct codes, and they call for three different recoveries —
 * one of which is a correctness requirement, not a wording preference:
 *
 *   * `CURSOR_EXPIRED` must PRESERVE the operator's filters and sort. The view
 *     lease ran out; what they were looking at is still what they want.
 *   * `CURSOR_CONTEXT_MISMATCH` must DISCARD the cursor outright. The workspace,
 *     filter or sort changed, so the cursor addresses rows in a population that
 *     is no longer on screen. Replaying it would page one query's rows into
 *     another query's list — the failure this whole module exists to prevent.
 *   * `INVALID_CURSOR` is malformed or tampered. Nothing about it is
 *     recoverable, so the saved position is dropped without ceremony.
 */

export const CURSOR_CODES = [
  "INVALID_CURSOR",
  "CURSOR_EXPIRED",
  "CURSOR_CONTEXT_MISMATCH",
] as const;

export type CursorCode = (typeof CURSOR_CODES)[number];

export interface CursorFailure {
  code: CursorCode;
  /** What the operator reads. Never the cursor, a signature or a parser error. */
  notice: string;
}

/*
 * There is deliberately no `preserveQuery` flag here.
 *
 * An earlier draft carried one, and no caller branched on it — the recovery is
 * the same in all three cases and is structural rather than conditional: drop
 * the cursor, drop the rows it produced, re-request the first page of whatever
 * query is now on screen. That satisfies both requirements at once. Expiry
 * keeps the operator's filters because nothing clears them; a context mismatch
 * cannot replay into the new context because the cursor no longer exists to be
 * replayed.
 *
 * A field nobody reads is not documentation, it is a claim the code does not
 * make. The three notices carry the difference, and `containers` is tested for
 * the behaviour.
 */

const NOTICE: Record<CursorCode, string> = {
  INVALID_CURSOR: "The saved position is not valid — showing the first page.",
  CURSOR_EXPIRED:
    "The view lease for this page expired — showing the first page. Your filters and sort are unchanged.",
  // Says what changed, because the operator changed it and will otherwise read
  // the reset as the system losing their place.
  CURSOR_CONTEXT_MISMATCH:
    "The workspace, filter or sort changed, so the saved position no longer refers to this list — showing the first page of the new query.",
};

/**
 * Classify a failure reason as a cursor rejection, or `null` if it is not one.
 *
 * Reads the code as a whole token. The previous regex included a bare `cursor`
 * alternative, which matched any message containing the word — an unrelated
 * failure whose text happened to mention a cursor was treated as a cursor
 * rejection and silently reset the operator's page.
 */
export function readCursorFailure(reason: string): CursorFailure | null {
  for (const code of CURSOR_CODES) {
    // Anchored on a non-word boundary so `CURSOR_EXPIRED` cannot be matched
    // inside a longer identifier, and checked longest-first below.
    if (new RegExp(`(^|[^A-Z_])${code}([^A-Z_]|$)`).test(reason)) {
      return { code, notice: NOTICE[code] };
    }
  }
  return null;
}
