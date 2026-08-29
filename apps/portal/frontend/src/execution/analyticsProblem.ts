/**
 * C-PI04-05 — typed analytics failures.
 *
 * Before this, every analytics failure resolved through `panelStatusForHttp`,
 * which has no branch for 422 and so returned `unavailable` for all of them.
 * That is the collapse H-6 named: a currency the operator mistyped and an
 * arithmetic overflow inside the engine produced the same "backend
 * unavailable" panel, and only one of those is something a human can fix.
 *
 * The thirteen 422/503 codes are read from the edge service itself
 * (`edge-service/src/main.rs`, `analytics_error_contract`), not from prose:
 * twelve are 422 and correctable by changing the request, one is 503 and is
 * not. The separate 413 response-size guard is handled by the HTTP envelope
 * layer because it is a transport bound rather than a panel correction.
 *
 * One more reason this is urgent, which is not in codex's handoff: PRE-IAM-04
 * closed H-1 by making `DecimalString::parse` REJECT a decimal beyond the
 * supported scale instead of silently rounding it. Calls that used to succeed
 * with a quietly wrong number now return 422. Without this file the operator
 * would read that as the system being down.
 */
import type { PanelStatus } from "./contracts";

export const ANALYTICS_CORRECTABLE = [
  "ANALYTICS_INPUT_LIMIT_EXCEEDED",
  "ANALYTICS_INVALID_CURRENCY",
  "ANALYTICS_ACCOUNTING_MISMATCH",
  "ANALYTICS_SCOPE_MISMATCH",
  "ANALYTICS_DUPLICATE_IDENTIFIER",
  "ANALYTICS_CORRELATION_INVALID",
  "ANALYTICS_SERIES_RANGE_INVALID",
  "ANALYTICS_SERIES_POINT_LIMIT",
  "ANALYTICS_SERIES_GAP_UNEXPLAINED",
  "ANALYTICS_APPROVED_BAND_LINEAGE_MISMATCH",
  "ANALYTICS_TILE_KIND_MISMATCH",
  "ANALYTICS_TILE_SAMPLE_STATE_INVALID",
] as const;

export type AnalyticsCorrectableCode = (typeof ANALYTICS_CORRECTABLE)[number];

/** Infrastructure. 503, and no amount of editing the request helps. */
export const ANALYTICS_UNAVAILABLE_CODE = "ANALYTICS_ARITHMETIC_UNAVAILABLE";

export interface AnalyticsFailure {
  code: string;
  /**
   * Whether the operator can act on this by changing what they asked for.
   *
   * Drives whether the panel offers a corrective action or a retry, and it is
   * the only thing on this object a screen should branch on.
   */
  kind: "correctable" | "infrastructure" | "unknown";
  /** Never `ok`: this type only describes failures. */
  panelStatus: Exclude<PanelStatus, "ok">;
  /**
   * What to tell the operator. Written here, never taken from the server's
   * `message`: the server's text is for a log, may name a source id or an
   * internal path, and is not written for the person reading the screen.
   */
  title: string;
  /** The one thing to do next. `null` when there is nothing the operator can do. */
  action: string | null;
  retryAfterSeconds: number | null;
  /**
   * Whether the panel may keep showing its last known data, labelled stale.
   *
   * True for a correctable 422, because the previous answer was computed from a
   * valid request and is still a true statement about that request. False for
   * infrastructure and unknown, where we cannot vouch for anything.
   */
  keepLastKnownAsStale: boolean;
}

/**
 * What each correctable code means in the operator's terms.
 *
 * Deliberately says what to change, not what went wrong. "The request exceeded
 * a published limit" tells them nothing; "ask for fewer alphas" tells them the
 * next move.
 */
const CORRECTABLE: Record<AnalyticsCorrectableCode, { title: string; action: string }> = {
  ANALYTICS_INPUT_LIMIT_EXCEEDED: {
    title: "This request asked for more than one call may carry.",
    action: "Narrow the selection and ask again — the batch limit is 64 items.",
  },
  ANALYTICS_INVALID_CURRENCY: {
    title: "One of the currencies in this request is not a currency the engine accepts.",
    action: "Check the currency on the selected accounts and ask again.",
  },
  ANALYTICS_ACCOUNTING_MISMATCH: {
    title: "The amounts in this request do not reconcile against the ledger.",
    action:
      "The engine refused to compute rather than return a number that does not tie out. Reload the source rows before asking again.",
  },
  ANALYTICS_SCOPE_MISMATCH: {
    title: "This request mixed entities from different scopes.",
    action: "Select entities from one workspace and portfolio, then ask again.",
  },
  ANALYTICS_DUPLICATE_IDENTIFIER: {
    title: "The same identifier appeared twice in this request.",
    action: "Remove the duplicate selection and ask again.",
  },
  ANALYTICS_CORRELATION_INVALID: {
    title: "The correlation request could not be formed from the entities given.",
    action:
      "Check that every entity is in the portfolio and that no pair is an entity with itself, then ask again.",
  },
  ANALYTICS_SERIES_RANGE_INVALID: {
    title: "The requested time range does not fit a supported analytics interval.",
    action: "Choose a valid start and end time, then ask again.",
  },
  ANALYTICS_SERIES_POINT_LIMIT: {
    title: "The requested series contains more points than one response may carry.",
    action: "Shorten the time range or choose a coarser interval, then ask again.",
  },
  ANALYTICS_SERIES_GAP_UNEXPLAINED: {
    title: "The series contains a gap that has no published gap evidence.",
    action: "Reload the source window or choose a complete interval before asking again.",
  },
  ANALYTICS_APPROVED_BAND_LINEAGE_MISMATCH: {
    title: "The comparison band does not belong to the approved research evidence.",
    action: "Return to the approved evidence set and select its published band.",
  },
  ANALYTICS_TILE_KIND_MISMATCH: {
    title: "This series cannot be rendered as the requested insight tile.",
    action: "Choose a tile compatible with the published series kind.",
  },
  ANALYTICS_TILE_SAMPLE_STATE_INVALID: {
    title: "The tile series and its sample-state evidence disagree.",
    action: "Refresh the source samples before requesting this tile again.",
  },
};

/**
 * Map an analytics failure onto something a screen can render.
 *
 * Pure, and shared by all six analytics screens, so the same 422 cannot become
 * an apologetic banner on one screen and a red error on another.
 *
 * Unknown codes fail closed: unavailable, no corrective action offered, and no
 * stale data retained. A code we do not recognise is a code whose blast radius
 * we cannot reason about, and guessing that it is probably harmless is how a
 * screen ends up inviting an operator to retry something that will never work.
 */
export function readAnalyticsFailure(
  raw: unknown,
  httpStatus: number,
): AnalyticsFailure {
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const envelope =
    body.envelope && typeof body.envelope === "object"
      ? (body.envelope as Record<string, unknown>)
      : body;
  const error =
    envelope.error && typeof envelope.error === "object"
      ? (envelope.error as Record<string, unknown>)
      : {};
  const code = typeof error.code === "string" ? error.code : `HTTP_${httpStatus}`;
  const retryAfterSeconds =
    typeof error.retry_after_seconds === "number" && Number.isInteger(error.retry_after_seconds)
      ? error.retry_after_seconds
      : null;

  if ((ANALYTICS_CORRECTABLE as readonly string[]).includes(code)) {
    const copy = CORRECTABLE[code as AnalyticsCorrectableCode];
    return {
      code,
      kind: "correctable",
      // Not `denied` and not `unavailable`: the request was understood and
      // refused on its merits. `insufficient_data` is the state that says the
      // panel has no answer for what was asked without implying the system is
      // broken or the operator is unauthorised.
      panelStatus: "insufficient_data",
      title: copy.title,
      action: copy.action,
      retryAfterSeconds,
      keepLastKnownAsStale: true,
    };
  }

  if (code === ANALYTICS_UNAVAILABLE_CODE) {
    return {
      code,
      kind: "infrastructure",
      panelStatus: "unavailable",
      title: "The engine could not complete this computation.",
      action: null,
      retryAfterSeconds,
      keepLastKnownAsStale: false,
    };
  }

  return {
    code,
    kind: "unknown",
    panelStatus: "unavailable",
    title: "This computation failed for a reason this screen does not recognise.",
    action: null,
    retryAfterSeconds,
    keepLastKnownAsStale: false,
  };
}

/**
 * The sentence a panel renders. Never includes the server's own message.
 *
 * `readAnalyticsFailure` already refuses to carry the server's text; this is
 * the second half of that rule, so a caller cannot reach past the adapter and
 * concatenate one in.
 */
export function analyticsFailureReason(failure: AnalyticsFailure): string {
  return failure.action ? `${failure.title} ${failure.action}` : failure.title;
}
