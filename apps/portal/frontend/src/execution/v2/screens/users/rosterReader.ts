/**
 * Users V2, the strict reads behind the screen (L3 negative, Rules 9.8.3).
 *
 * The V1 reader (`features/admin/accountApi.ts`, untouched: the V1 screen still
 * uses it) is lenient on purpose for a screen that only needs to keep working:
 * a body that is not a list reads as an EMPTY roster, a revision of the wrong
 * type reads as 0, a row that is a string reads as an account with no id. On
 * this screen each of those is a lie: "The roster is empty. No account has been
 * created." for a broken body, a revision "0" for an absence, a blank row that
 * looks real.
 *
 * This reader therefore refuses instead of repairing. The contract:
 *
 * - the body must be an object whose `accounts` is an array; anything else is
 *   `ROSTER_MALFORMED` (unavailable), never an empty roster;
 * - ONE malformed row refuses the WHOLE body. A partial roster that looks real
 *   (counts, filters and the "N in the roster read" line would all be wrong) is
 *   worse than none. The refusal names the row's position and the field, never
 *   the offending value;
 * - a malformed row is: not an object; a missing, null or wrongly typed
 *   `user_id`, `username`, `role`, `account_state`, `must_change_password`,
 *   `locked` or `account_revision`; a `role` or `account_state` outside the
 *   published enum (no word is guessed to be "User" or "Disabled"); a revision
 *   that is not a non-negative safe integer; a string over 256 characters; a
 *   control or bidirectional-control character in `user_id`, `username` or
 *   `display_name`; a repeated `user_id`;
 * - `display_name` may be absent, null or only spaces (the account has none; the
 *   screen then shows the username) but not any other type;
 * - unknown extra keys are ignored: they are never read, so they never reach
 *   the screen.
 *
 * The history in the drawer is read the same way: a malformed history is the
 * drawer's "unavailable" state, not a list with blanks, and an `occurred_at`
 * that is not an ISO instant is refused rather than printed raw.
 */
import { AuthRequestError } from "../../../../auth/authApi";
import type { AccountRole, AccountState, AccountSummary, HistoryEntry } from "../../../../features/admin/accountApi";

const BASE = "/api/admin/accounts";
const MAX_TEXT = 256;
const MAX_REASON = 1024;

const ROLES: readonly string[] = ["ADMIN", "USER"];
const STATES: readonly string[] = ["INVITED", "ACTIVE", "DISABLED", "ARCHIVED"];
const OUTCOMES: readonly string[] = ["APPLIED", "REPLAYED", "CONFLICT", "DENIED"];

/** C0, DEL, C1, line and paragraph separators, and the bidirectional marks, embeddings, overrides and isolates. */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** A body the reader refused. `where` names a position and a field, never a value. */
export class RosterMalformed extends Error {
  readonly code: string;
  readonly where: string;
  constructor(code: "ROSTER_MALFORMED" | "HISTORY_MALFORMED", where: string) {
    super(`${code} at ${where}`);
    this.name = "RosterMalformed";
    this.code = code;
    this.where = where;
  }
}

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);

function text(raw: Obj, key: string, fail: (field: string) => never, options: { required: boolean; max?: number }): string {
  const value = raw[key];
  if (value === undefined || value === null) {
    if (options.required) fail(key);
    return "";
  }
  if (typeof value !== "string") return fail(key);
  if (value.trim() === "") return options.required ? fail(key) : "";
  if (value.length > (options.max ?? MAX_TEXT)) return fail(key);
  if (UNSAFE.test(value)) return fail(key);
  return value;
}

export function readRoster(body: unknown): AccountSummary[] {
  if (!isObj(body) || !Array.isArray(body.accounts)) throw new RosterMalformed("ROSTER_MALFORMED", "the body");
  const seen = new Set<string>();
  return body.accounts.map((row: unknown, index): AccountSummary => {
    const at = `row ${index + 1}`;
    const fail = (field: string): never => {
      throw new RosterMalformed("ROSTER_MALFORMED", `${at}, ${field}`);
    };
    if (!isObj(row)) return fail("row");
    const userId = text(row, "user_id", fail, { required: true });
    if (seen.has(userId)) return fail("user_id (repeated)");
    seen.add(userId);
    const username = text(row, "username", fail, { required: true });
    const displayName = text(row, "display_name", fail, { required: false });
    if (typeof row.role !== "string" || !ROLES.includes(row.role)) return fail("role");
    if (typeof row.account_state !== "string" || !STATES.includes(row.account_state)) return fail("account_state");
    if (typeof row.must_change_password !== "boolean") return fail("must_change_password");
    if (typeof row.locked !== "boolean") return fail("locked");
    const revision = row.account_revision;
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) return fail("account_revision");
    return {
      userId,
      username,
      displayName,
      role: row.role as AccountRole,
      accountState: row.account_state as AccountState,
      mustChangePassword: row.must_change_password,
      accountRevision: revision,
      locked: row.locked,
    };
  });
}

export function readHistory(body: unknown): HistoryEntry[] {
  if (!isObj(body) || !Array.isArray(body.history)) throw new RosterMalformed("HISTORY_MALFORMED", "the body");
  return body.history.map((raw: unknown, index): HistoryEntry => {
    const fail = (field: string): never => {
      throw new RosterMalformed("HISTORY_MALFORMED", `entry ${index + 1}, ${field}`);
    };
    if (!isObj(raw)) return fail("entry");
    const operationId = text(raw, "operation_id", fail, { required: true });
    const action = text(raw, "action", fail, { required: true });
    if (typeof raw.outcome !== "string" || !OUTCOMES.includes(raw.outcome)) return fail("outcome");
    const reason = raw.reason_code;
    if (reason !== undefined && reason !== null && (typeof reason !== "string" || reason.length > MAX_TEXT || UNSAFE.test(reason))) return fail("reason_code");
    const expected = raw.expected_revision;
    if (typeof expected !== "number" || !Number.isSafeInteger(expected) || expected < 0) return fail("expected_revision");
    const resulting = raw.resulting_revision;
    if (resulting !== undefined && resulting !== null && (typeof resulting !== "number" || !Number.isSafeInteger(resulting) || resulting < 0)) return fail("resulting_revision");
    const rollback = text(raw, "rollback_description", fail, { required: false, max: MAX_REASON });
    const at = raw.occurred_at;
    if (at !== undefined && at !== null && (typeof at !== "string" || !INSTANT.test(at))) return fail("occurred_at");
    return {
      operationId,
      action,
      outcome: raw.outcome as HistoryEntry["outcome"],
      reasonCode: typeof reason === "string" ? reason : null,
      expectedRevision: expected,
      resultingRevision: typeof resulting === "number" ? resulting : null,
      rollbackDescription: rollback,
      stepUpUsed: raw.step_up_used === true,
      occurredAt: typeof at === "string" ? at : "",
    };
  });
}

async function refusal(response: Response): Promise<AuthRequestError> {
  let body: { error?: { code?: unknown; message?: unknown; request_id?: unknown } } | undefined;
  try {
    body = (await response.json()) as typeof body;
  } catch {
    /* a proxy can answer with a non-JSON body; the status still counts */
  }
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  return new AuthRequestError(
    response.status,
    s(body?.error?.code) ?? "ACCOUNT_REQUEST_FAILED",
    s(body?.error?.message) ?? "The account operation could not be completed.",
    s(body?.error?.request_id) ?? response.headers.get("x-request-id"),
  );
}

async function getJson(path: string, code: "ROSTER_MALFORMED" | "HISTORY_MALFORMED"): Promise<unknown> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw await refusal(response);
  try {
    return await response.json();
  } catch {
    throw new RosterMalformed(code, "the body");
  }
}

export async function readRosterFromServer(): Promise<AccountSummary[]> {
  return readRoster(await getJson(BASE, "ROSTER_MALFORMED"));
}

/** The drawer reads the history only: the account's facts come from the roster, so a detail body's `account` is never shown. */
export async function readDetailFromServer(userId: string): Promise<{ history: HistoryEntry[] }> {
  return { history: readHistory(await getJson(`${BASE}/${encodeURIComponent(userId)}`, "HISTORY_MALFORMED")) };
}
