/**
 * What a refused scoped read says (`portal.execution.manager-scoped.v1`, RV-12 `execution-manager-scoped.refusals.synthetic.negative.json`,
 * `requests`): the HTTP status and `error.code` of the shared error envelope `{ error: { code, message }, request_id, details }`,
 * read into a TYPED outcome. FIXTURE ONLY: no route serves the body to the browser yet.
 *
 * Rules:
 * - the pair (status, code) decides, never the message and never the status alone: a known code on another status, an unknown
 *   code, or a body that is not an envelope is `null` (an unreadable refusal), and the caller fails closed;
 * - the server's free text is dropped; this module never returns, logs or renders `message`, `details` or a cursor;
 * - what each outcome obliges the caller to do is the `action` field, so no screen re-derives it from a word:
 *   `restart_chain`  400 cursor codes: drop the cursor and the rows it produced, read the first page of the query on screen
 *                    (a changed query, a wrong direction, another workspace and a new source revision are all
 *                    CURSOR_CONTEXT_MISMATCH; expiry and a tampered cursor are not "unavailable");
 *   `refetch_scope`  409 EXECUTION_READ_ACCESS_CHANGED: authority moved between the read and the delivery fence; the whole
 *                    response is void, discard the page and read the scope again from its first page;
 *   `show_absence`   every other code: the read is not available to this caller (or not now); show the typed absence, keep no rows.
 * - there is no fallback to a fixture or to a legacy body here.
 */
import { record } from "../../readers/managerMetric";

export const CURSOR_REFUSAL_CODES = ["CURSOR_CONTEXT_MISMATCH", "INVALID_CURSOR", "CURSOR_EXPIRED"] as const;
export type CursorRefusalCode = (typeof CURSOR_REFUSAL_CODES)[number];

export type ScopedRefusal =
  | { kind: "cursor_reset"; code: CursorRefusalCode; action: "restart_chain" }
  | { kind: "access_changed"; action: "refetch_scope" }
  /** 503 EXECUTION_READ_AUTHORITY_UNAVAILABLE: a named environment has no recorded snapshot, or an item was too large to publish whole. */
  | { kind: "authority_unavailable"; action: "show_absence" }
  /** 404 / 400 EXECUTION_READ_NOT_AVAILABLE: not granted, every environment denied, unknown binding, or a field the caller may not query. One outcome, on purpose: a hidden field is not an oracle. */
  | { kind: "not_available"; action: "show_absence" }
  | { kind: "policy_pending"; action: "show_absence" }
  | { kind: "field_policy_pending"; action: "show_absence" };

export type ScopedRefusalKind = ScopedRefusal["kind"];

const TABLE: ReadonlyMap<string, ScopedRefusal> = new Map<string, ScopedRefusal>([
  ["400|CURSOR_CONTEXT_MISMATCH", { kind: "cursor_reset", code: "CURSOR_CONTEXT_MISMATCH", action: "restart_chain" }],
  ["400|INVALID_CURSOR", { kind: "cursor_reset", code: "INVALID_CURSOR", action: "restart_chain" }],
  ["400|CURSOR_EXPIRED", { kind: "cursor_reset", code: "CURSOR_EXPIRED", action: "restart_chain" }],
  ["409|EXECUTION_READ_ACCESS_CHANGED", { kind: "access_changed", action: "refetch_scope" }],
  ["503|EXECUTION_READ_AUTHORITY_UNAVAILABLE", { kind: "authority_unavailable", action: "show_absence" }],
  ["404|EXECUTION_READ_NOT_AVAILABLE", { kind: "not_available", action: "show_absence" }],
  ["400|EXECUTION_READ_NOT_AVAILABLE", { kind: "not_available", action: "show_absence" }],
  ["403|EXECUTION_READ_POLICY_PENDING", { kind: "policy_pending", action: "show_absence" }],
  ["503|EXECUTION_READ_FIELD_POLICY_PENDING", { kind: "field_policy_pending", action: "show_absence" }],
]);

/** The pairs this reader knows (the contract's runtime refusals), for the conformance suite. */
export const SCOPED_REFUSAL_PAIRS: readonly string[] = [...TABLE.keys()];

/** `null` = not a refusal this contract names (unknown pair, or a body that is not the error envelope). Never throws. */
export function readScopedRefusal(status: unknown, body: unknown): ScopedRefusal | null {
  if (typeof status !== "number" || !Number.isInteger(status)) return null;
  const envelope = record(body);
  const error = envelope === null ? null : record(envelope.error);
  if (error === null || typeof error.code !== "string") return null;
  const found = TABLE.get(`${status}|${error.code}`);
  return found === undefined ? null : { ...found };
}
