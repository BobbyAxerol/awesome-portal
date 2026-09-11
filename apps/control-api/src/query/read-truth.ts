import { KeysetPage } from "./contracts";

/**
 * A list response is a truth statement about the exact server-bound request,
 * not a claim that a workspace has no records at all.  In particular, a
 * filtered page must not cause a client to invent a global empty state.
 */
export interface ExactPageReadTruth {
  state: "AVAILABLE" | "EMPTY";
  /** Null when the exact request has one or more matching records. */
  reason_code: string | null;
  scope: "REQUEST";
}

/**
 * `filtered_count` is computed by the same bounded query transaction as the
 * page.  It is therefore the only safe signal for a genuine empty request
 * scope.  A cursor can legitimately yield an empty page while records still
 * exist; that remains AVAILABLE and lets the client refresh its opaque cursor
 * rather than presenting an invented empty workspace.
 */
export function exactPageReadTruth<T>(
  page: Pick<KeysetPage<T>, "filtered_count">,
  emptyReasonCode: string,
): ExactPageReadTruth {
  return page.filtered_count === 0
    ? { state: "EMPTY", reason_code: emptyReasonCode, scope: "REQUEST" }
    : { state: "AVAILABLE", reason_code: null, scope: "REQUEST" };
}
