/**
 * "Soon" — the one word for a surface the Trading System will publish but has
 * not published yet (owner ruling 2026-09-07).
 *
 * The distinction this file draws is operational, not cosmetic. A panel that
 * says UNAVAILABLE reads as a fault: someone should page an engineer. A panel
 * that says DENIED reads as a permission the operator can request. Neither is
 * true of a capability the source has simply not shipped, and calling that one
 * "blocked" is what let whole phases sit still waiting for a source that had
 * already given everything it could give.
 *
 * So: reason codes that name a source gap become `Soon · <code>` — the code
 * stays, because the code is how anyone finds out what is pending — while
 * denials and real faults keep their own words. A missing field on one record
 * is still "not published": that is a fact about a value, not a promise about a
 * feature.
 */

/**
 * Exact codes and code prefixes that mean "the source will publish this".
 *
 * Kept as a list rather than a regex over everything so that a new failure code
 * has to be classified deliberately: an unknown code stays UNAVAILABLE, which
 * is the safe reading.
 */
const SOURCE_PENDING_PATTERNS: readonly RegExp[] = [
  // Named source-owner extensions on the EDS-12 register.
  /\bBR-EX-(50|79|80|81)\b/,
  // Market data the Trading System has not published to the Portal yet.
  /\bN28_[A-Z0-9_]*\b/,
  /\bE5_MARKET_CANDLES[A-Z0-9_]*\b/,
  /\bEDS10_[A-Z0-9_]*_(SOURCE_GAP_CONFIRMED|NOT_ACTIVATED)\b/,
  /\bMARKET_CANDLES_SOURCE_NOT_WIRED\b/,
  // The market-context BFF validates the query and answers 503 with this
  // code until the source owner wires its adapter. That is a date, not a
  // fault: the route is right, the caller is right, and the series is not
  // there yet. Measured on dev 2026-09-08.
  /\bPENDING_MARKET_CONTEXT_ADAPTER\b/,
  // Relations the Manager envelope refuses today (portfolio equity, sizing
  // decisions, risk grants): a contract the source has still to widen.
  /\bMANAGER_V2_SOURCE_CONTRACT_REJECTED\b/,
  /\bN17B_SOURCE_REJECTED\b/,
  /\bN23_(SCREEN_OUTSIDE_RELEASE|PROFILE_READ_NOT_ACCEPTED)\b/,
  // Observation lanes codex has declared and not yet filled.
  /\bEDS10_OBSERVED_TIMELINE_[A-Z0-9_]*PARTIAL\b/,
  /\bAUTHORITATIVE_REPLAY_SOURCE_GAP_CONFIRMED\b/,
];

/** True when a reason names a source gap rather than a fault or a denial. */
export function isSourcePending(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return SOURCE_PENDING_PATTERNS.some((pattern) => pattern.test(reason));
}

/**
 * The word a panel should show for `status`, given its reason.
 *
 * Only `unavailable`, `insufficient_data` and `empty` can become "Soon":
 * `denied` is a permission fact, `terminal` and `stale` are faults about data
 * we did have, and `loading` is a moment, not a state of the world.
 */
export function soonTitle(status: string, reason: string | null | undefined, fallback: string): string {
  const eligible = status === "unavailable" || status === "insufficient_data" || status === "empty";
  return eligible && isSourcePending(reason) ? "Soon" : fallback;
}

/**
 * The reason line for a pending surface: the source's own code, once, prefixed
 * so a reader knows it is a schedule and not an error. Codes repeated by the
 * envelope (`CODE: CODE`) are collapsed — the duplicate is noise the reader has
 * to parse past.
 */
export function soonReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const collapsed = reason.replace(/^([A-Z][A-Z0-9_]+):\s*\1\b/, "$1").trim();
  if (!isSourcePending(collapsed)) return collapsed;
  return collapsed.startsWith("Soon") ? collapsed : `Soon · ${collapsed}`;
}

/**
 * The empty-state line for a list whose source has published no rows for this
 * profile. The count of what the page does hold stays visible: "nothing here"
 * and "nothing anywhere" are different claims, and the reader is entitled to
 * know which one they are looking at (BR-EX-81 lesson).
 */
export function soonEmptyLine(subject: string, pageHolds?: { rows: number; label: string } | null): string {
  const head = `Soon · the source has published no ${subject} for this profile yet`;
  if (!pageHolds) return head;
  return `${head} · the retained page holds ${pageHolds.rows} ${pageHolds.label}`;
}
