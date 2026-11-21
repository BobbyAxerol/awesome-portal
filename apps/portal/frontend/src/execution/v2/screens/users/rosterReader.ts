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
 * - the roster is read one keyset page at a time (`readRosterPage`, BE-P23): the body also
 *   carries `page` (`limit` 1..200, `returned_count` equal to the rows and within the limit,
 *   `has_more` exactly when `next_cursor` is a bounded string, and at least one row when
 *   there is more) and `counts` (non-negative integers whose states and roles each add up
 *   to `total`, `matching` within `total` and holding the rows). A body without them is
 *   `ROSTER_MALFORMED`: the old unpaged answer is not read as a page. A user id repeated on
 *   a later page is refused by the screen with the same code;
 * - ONE malformed row refuses the WHOLE body. A partial roster that looks real
 *   (counts, filters and the "N in the roster read" line would all be wrong) is
 *   worse than none. The refusal names the row's position and the field, never
 *   the offending value;
 * - a malformed row is: not an object; a missing, null or wrongly typed
 *   `user_id`, `username`, `role`, `account_state`, `must_change_password`,
 *   `locked` or `account_revision`; a `role` or `account_state` outside the
 *   published enum (no word is guessed to be "User" or "Disabled"); a revision
 *   that is not a non-negative safe integer; a string over 256 characters; a
 *   control or bidirectional-control character in `user_id` or `username`
 *   (identity: a repaired id would name a different account); a repeated
 *   `user_id`;
 * - `display_name` may be absent, null or only spaces (the account has none; the
 *   screen then shows the username) but not any other type or over 256
 *   characters. It is display text, not identity, and the server accepts any
 *   trimmed 1..120 character string (only U+0000-001F and U+007F are barred
 *   there), so a name with a control, a line separator or a bidirectional mark
 *   is a valid account whose name is shown with each such character replaced by
 *   U+FFFD, never refused: refusing it would lock every admin out of the whole
 *   roster. The raw string never reaches the DOM or an error. The history's
 *   `rollback_description` is read the same way;
 * - unknown extra keys are ignored: they are never read, so they never reach
 *   the screen.
 *
 * The history in the drawer is read the same way: a malformed history is the
 * drawer's "unavailable" state, not a list with blanks, and an `occurred_at`
 * that is not a real UTC instant (month 1-12, a day the month has, hour below
 * 24, minute and second below 60, offset hour below 24) is refused rather than
 * printed raw.
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
const UNSAFE_ALL = new RegExp(UNSAFE.source, "g");
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-](\d{2}):(\d{2}))$/;
const REPLACEMENT = "\uFFFD";

/** A real calendar instant, not just the shape of one: '2026-13-45T99:99Z' is refused. */
export function isRealInstant(value: string): boolean {
  const m = INSTANT.exec(value);
  if (m === null) return false;
  const [year, month, day, hour, minute] = [m[1], m[2], m[3], m[4], m[5]].map(Number) as [number, number, number, number, number];
  const second = m[6] === undefined ? 0 : Number(m[6]);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (m[7] !== undefined && (Number(m[7]) > 23 || Number(m[8]) > 59)) return false;
  const calendar = new Date(Date.UTC(2000, month - 1, day));
  calendar.setUTCFullYear(year);
  return day >= 1 && calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 && calendar.getUTCDate() === day;
}

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

function text(raw: Obj, key: string, fail: (field: string) => never, options: { required: boolean; max?: number; display?: boolean }): string {
  const value = raw[key];
  if (value === undefined || value === null) {
    if (options.required) fail(key);
    return "";
  }
  if (typeof value !== "string") return fail(key);
  if (value.trim() === "") return options.required ? fail(key) : "";
  if (value.length > (options.max ?? MAX_TEXT)) return fail(key);
  if (UNSAFE.test(value)) return options.display ? value.replace(UNSAFE_ALL, REPLACEMENT) : fail(key);
  return value;
}

/** One account row, strict. `at` names the position in a refusal (never the value). */
function readAccountRow(row: unknown, at: string, code: "ROSTER_MALFORMED" | "HISTORY_MALFORMED", seen: Set<string> | null): AccountSummary {
  const fail = (field: string): never => {
    throw new RosterMalformed(code, `${at}, ${field}`);
  };
  if (!isObj(row)) return fail("row");
  const userId = text(row, "user_id", fail, { required: true });
  if (seen !== null) {
    if (seen.has(userId)) return fail("user_id (repeated)");
    seen.add(userId);
  }
  const username = text(row, "username", fail, { required: true });
  const displayName = text(row, "display_name", fail, { required: false, display: true });
  if (typeof row.role !== "string" || !ROLES.includes(row.role)) return fail("role");
  if (typeof row.account_state !== "string" || !STATES.includes(row.account_state)) return fail("account_state");
  if (typeof row.must_change_password !== "boolean") return fail("must_change_password");
  if (typeof row.locked !== "boolean") return fail("locked");
  const revision = row.account_revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) return fail("account_revision");
  // FE-CAT-8: optional. The producer omits the key when sign-in history is unknown and publishes no coverage statement, so a bare
  // `null` is read as unknown too (never "never signed in"); anything but a real UTC instant, null or omitted refuses the row.
  let lastSignIn: { lastSignInAt: string | null } | Record<string, never> = {};
  if (row.last_sign_in_at !== undefined) {
    if (row.last_sign_in_at === null) lastSignIn = {};
    else if (typeof row.last_sign_in_at === "string" && isRealInstant(row.last_sign_in_at)) lastSignIn = { lastSignInAt: row.last_sign_in_at };
    else return fail("last_sign_in_at");
  }
  return {
    userId,
    username,
    displayName,
    role: row.role as AccountRole,
    accountState: row.account_state as AccountState,
    mustChangePassword: row.must_change_password,
    accountRevision: revision,
    locked: row.locked,
    ...lastSignIn,
  };
}

/** The rows of a body, strict. The page reader reads its rows only through this. */
export function readRoster(body: unknown): AccountSummary[] {
  if (!isObj(body) || !Array.isArray(body.accounts)) throw new RosterMalformed("ROSTER_MALFORMED", "the body");
  const seen = new Set<string>();
  return body.accounts.map((row: unknown, index): AccountSummary => readAccountRow(row, `row ${index + 1}`, "ROSTER_MALFORMED", seen));
}

/** The most rows one page may hold, as the contract publishes it. */
export const ROSTER_PAGE_MAX = 200;
const CURSOR_MAX = 4096;

export interface RosterPageInfo {
  limit: number;
  returnedCount: number;
  hasMore: boolean;
  /** Opaque. Sent back unchanged, never shown, never parsed. */
  nextCursor: string | null;
}

export interface RosterCounts {
  total: number;
  /** Accounts the filters select. */
  matching: number;
  byState: Readonly<Record<AccountState, number>>;
  byRole: Readonly<Record<AccountRole, number>>;
  locked: number;
  awaitingFirstPassword: number;
}

export interface RosterPage {
  accounts: AccountSummary[];
  page: RosterPageInfo;
  counts: RosterCounts;
}

function count(raw: Obj, key: string, at: string): number {
  const value = raw[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new RosterMalformed("ROSTER_MALFORMED", `${at}, ${key}`);
  return value;
}

function section(body: Obj, key: string, at = "the body"): Obj {
  const value = body[key];
  if (!isObj(value)) throw new RosterMalformed("ROSTER_MALFORMED", `${at}, ${key}`);
  return value;
}

/**
 * One keyset page of the roster (BE-P23), refused whole when anything in it is untrue.
 *
 * Beyond every row rule above, the page must be coherent: `returned_count` is the rows, within `limit` (1..200);
 * `has_more` is exactly "there is a cursor" and needs at least one row; the cursor is a bounded string without control
 * characters; every count is a non-negative safe integer, the states and the roles each add up to `total`, and
 * `matching` is within `total` and holds the rows. A body without `page` or `counts` (the old unpaged answer) is
 * refused here, not read as one page: on this screen it would show a roster as complete that was never paged.
 */
export function readRosterPage(body: unknown): RosterPage {
  if (!isObj(body)) throw new RosterMalformed("ROSTER_MALFORMED", "the body");
  const accounts = readRoster(body);
  const raw = section(body, "page");
  const limit = count(raw, "limit", "page");
  if (limit < 1 || limit > ROSTER_PAGE_MAX) throw new RosterMalformed("ROSTER_MALFORMED", "page, limit");
  const returned = count(raw, "returned_count", "page");
  if (returned !== accounts.length || returned > limit) throw new RosterMalformed("ROSTER_MALFORMED", "page, returned_count");
  const hasMore = raw.has_more;
  if (typeof hasMore !== "boolean") throw new RosterMalformed("ROSTER_MALFORMED", "page, has_more");
  const cursor = raw.next_cursor;
  if (cursor !== null && (typeof cursor !== "string" || cursor === "" || cursor.length > CURSOR_MAX || UNSAFE.test(cursor))) {
    throw new RosterMalformed("ROSTER_MALFORMED", "page, next_cursor");
  }
  if (hasMore !== (cursor !== null) || (hasMore && returned === 0)) throw new RosterMalformed("ROSTER_MALFORMED", "page, has_more");

  const c = section(body, "counts");
  const states = section(c, "by_state", "counts");
  const roles = section(c, "by_role", "counts");
  const total = count(c, "total", "counts");
  const matching = count(c, "matching", "counts");
  const byState: Record<AccountState, number> = {
    INVITED: count(states, "INVITED", "counts, by_state"),
    ACTIVE: count(states, "ACTIVE", "counts, by_state"),
    DISABLED: count(states, "DISABLED", "counts, by_state"),
    ARCHIVED: count(states, "ARCHIVED", "counts, by_state"),
  };
  const byRole: Record<AccountRole, number> = { ADMIN: count(roles, "ADMIN", "counts, by_role"), USER: count(roles, "USER", "counts, by_role") };
  const locked = count(c, "locked", "counts");
  const awaiting = count(c, "awaiting_first_password", "counts");
  if (byState.INVITED + byState.ACTIVE + byState.DISABLED + byState.ARCHIVED !== total) throw new RosterMalformed("ROSTER_MALFORMED", "counts, by_state");
  if (byRole.ADMIN + byRole.USER !== total) throw new RosterMalformed("ROSTER_MALFORMED", "counts, by_role");
  if (matching > total || accounts.length > matching) throw new RosterMalformed("ROSTER_MALFORMED", "counts, matching");
  if (locked > total) throw new RosterMalformed("ROSTER_MALFORMED", "counts, locked");
  if (awaiting > total) throw new RosterMalformed("ROSTER_MALFORMED", "counts, awaiting_first_password");
  return {
    accounts,
    page: { limit, returnedCount: returned, hasMore, nextCursor: cursor },
    counts: { total, matching, byState, byRole, locked, awaitingFirstPassword: awaiting },
  };
}

/**
 * The account a detail body names, read with the same row rules. It is shown only for a selection no loaded page
 * holds (a link to an account further down the roster). An absent or null `account` is `null`; a malformed one
 * refuses the detail as `HISTORY_MALFORMED`.
 */
export function readDetailAccount(body: unknown): AccountSummary | null {
  if (!isObj(body) || body.account === undefined || body.account === null) return null;
  return readAccountRow(body.account, "account", "HISTORY_MALFORMED", null);
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
    const rollback = text(raw, "rollback_description", fail, { required: false, max: MAX_REASON, display: true });
    const at = raw.occurred_at;
    if (at !== undefined && at !== null && (typeof at !== "string" || !isRealInstant(at))) return fail("occurred_at");
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

export interface RosterQuery {
  limit: number;
  cursor?: string | null;
  q?: string;
  role?: AccountRole | null;
  state?: AccountState | null;
}

/** The request path for one page. Only what was asked for is sent; the cursor is sent as given. */
export function rosterPath(query: RosterQuery): string {
  const params = new URLSearchParams();
  params.set("limit", String(query.limit));
  if (query.q !== undefined && query.q.trim() !== "") params.set("q", query.q.trim());
  if (query.role) params.set("role", query.role);
  if (query.state) params.set("state", query.state);
  if (query.cursor) params.set("cursor", query.cursor);
  return `${BASE}?${params.toString()}`;
}

export async function readRosterPageFromServer(query: RosterQuery): Promise<RosterPage> {
  return readRosterPage(await getJson(rosterPath(query), "ROSTER_MALFORMED"));
}

/** The drawer reads the history, and the account only to show a selection no loaded page holds. */
export async function readDetailFromServer(userId: string): Promise<{ account: AccountSummary | null; history: HistoryEntry[] }> {
  const body = await getJson(`${BASE}/${encodeURIComponent(userId)}`, "HISTORY_MALFORMED");
  return { account: readDetailAccount(body), history: readHistory(body) };
}
