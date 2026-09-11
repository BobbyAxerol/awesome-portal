/**
 * Saying "empty" only when the server said it, and saying exactly how much it
 * meant (`FRONTEND_HANDOFF.md` §8.59).
 *
 * Before BE-R2-6 a screen decided this for itself: zero rows on the page became
 * "Inbox zero", a claim about the whole workspace made from a page the server
 * had chosen by an opaque cursor. The contract now answers the question
 * directly, and it answers it *scoped*: `EMPTY` means no Portal-owned record
 * matched this authorized request — this view, these filters, this cursor.
 *
 * Two rules hold everything here together:
 *
 *  - **Silence is not emptiness.** `read_truth` absent or unreadable means the
 *    screen may not claim the set is empty, only that this response carried no
 *    rows. An older backend that has not shipped §8.59 lands here, and that is
 *    the correct, weaker sentence rather than a confident wrong one.
 *  - **Emptiness is not refusal.** §8.59 point 3 is explicit: a 401, a 403, a
 *    concealed 404, a named panel `unavailable` or a policy block must never be
 *    rendered as empty. Callers pass a non-ok status through untouched; these
 *    helpers only ever speak for an `ok` response.
 */
import type { ReadTruth } from "./contracts";

/** True only when the server itself said this request scope holds nothing. */
export function serverSaysEmpty(readTruth: ReadTruth | null | undefined): boolean {
  return readTruth?.state === "EMPTY";
}

/**
 * The short label for the empty panel's title slot.
 *
 * Deliberately never "Inbox zero" or any other whole-set claim: the server
 * scoped its answer to the request, so the title is scoped too.
 */
export function emptyScopeTitle(readTruth: ReadTruth | null | undefined): string {
  // "Nothing came back" rather than "No rows in this response": seen on the
  // screen, the second reads like a debug line, and the title slot is the one
  // piece of copy a reader takes in without reading the sentence under it.
  return serverSaysEmpty(readTruth) ? "Nothing in this view" : "Nothing came back";
}

/**
 * One sentence saying what was actually established, and what was not.
 *
 * `view` names the selection the reader can see and change. `alsoPending` is
 * the server's own count of what sits outside it — included only when the
 * server published one, because "0 elsewhere" and "nothing published about
 * elsewhere" are different facts.
 */
export function emptyScopeLine(
  readTruth: ReadTruth | null | undefined,
  view: string,
  alsoPending?: number | null,
  /** What the rows are, so the sentence names them: "operation", "condition". */
  noun = "record",
): string {
  const counted = typeof alsoPending === "number" && alsoPending > 0;
  const elsewhere = counted ? ` ${alsoPending} pending outside this view.` : "";
  if (!serverSaysEmpty(readTruth)) {
    // No claim about the set — only about what came back.
    return `No ${noun} came back for ${view}. The server did not state whether any exist outside this response.${elsewhere}`;
  }
  /*
   * Read on the screen, the first draft ran to four lines and said "outside
   * it" twice: once generically, once with the server's count. When the count
   * is published it is the better sentence, so the generic qualifier gives way
   * to it rather than stacking on top. The server's own code goes last, where
   * it is evidence rather than an interruption.
   */
  const scope = counted
    ? elsewhere
    : ` ${noun[0].toUpperCase()}${noun.slice(1)}s may exist outside this view — filters and the page cursor are part of the request.`;
  const because = readTruth?.reasonCode ? ` (${readTruth.reasonCode})` : "";
  return `No ${noun} matches ${view}.${scope}${because}`;
}
