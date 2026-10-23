/**
 * Users reads for the e2e BFF double (UXM-07 S2, flag key `users`).
 *
 * These routes live OUTSIDE `/api/v1/execution`: `GET /api/admin/accounts`,
 * `GET /api/admin/accounts/{id}` and `GET /api/admin/step-up` (the owner account
 * control plane, `features/admin/accountApi.ts`). The primary wires this next
 * to `stubExecutionBff`, with its own `page.route("**\/api/admin/**", ...)`:
 *
 *   const answer = answerUsers(request.method(), url.pathname, url.searchParams);
 *   if (answer !== null) return route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) });
 *
 * It answers `null` for anything that is not a Users read, so other admin routes
 * fall through. Only reads are served: a POST or PATCH is answered 405, because
 * the V2 Users screen is read only and a stray write must fail loudly.
 *
 * States (sparse on purpose; every one a real shape):
 *
 * | variant | roster | step-up |
 * |---|---|---|
 * | `paged` (default) | 123 accounts across the four states: 3 ADMIN, the rest USER; locked, awaiting-first-password and archived ones among them | `REQUIRED` |
 * | `verified` | same roster | `ACTIVE` with an expiry |
 * | `empty` | none | `REQUIRED` |
 * | `denied` | 403 `OWNER_ACCESS_REQUIRED` on the roster and the detail | 403 |
 * | `broken` | 503 `ACCOUNT_STORE_UNAVAILABLE` | 503 |
 *
 * The roster read is the real contract's two answers (BE-P23): with NO query it is the
 * whole unpaged list (the V1 screen's transition), and with any of `limit`, `cursor`,
 * `q`, `role`, `state` it is one keyset page ordered by username, with `page` and the
 * exact roster-wide `counts`. The cursor is a stand-in token bound to the limit and the
 * filters, so a cursor replayed under another filter or limit is a 409 and a mangled one
 * a 400, as the server answers. Switch with `setUsersDoubleVariant` (module state, per test file).
 * Account `usr_0001` carries a three-entry history; every other account has one
 * entry; `usr_NOT_FOUND` is a 404.
 */

export interface UsersAnswer {
  status: number;
  body: unknown;
  contentType?: string;
}

export type UsersDoubleVariant = "paged" | "verified" | "empty" | "denied" | "broken";

let variant: UsersDoubleVariant = "paged";

export function setUsersDoubleVariant(next: UsersDoubleVariant): void {
  variant = next;
}

type State = "INVITED" | "ACTIVE" | "DISABLED" | "ARCHIVED";

interface Wire {
  user_id: string;
  username: string;
  display_name: string;
  role: "ADMIN" | "USER";
  account_state: State;
  must_change_password: boolean;
  account_revision: number;
  locked: boolean;
}

/** All four states, in a repeating pattern, so every page of the roster shows more than one. */
const PATTERN: readonly State[] = ["ACTIVE", "ACTIVE", "ACTIVE", "INVITED", "ACTIVE", "DISABLED", "ACTIVE", "ACTIVE", "ARCHIVED", "ACTIVE"];

export const USERS_DOUBLE_COUNT = 123;

function build(): Wire[] {
  const rows: Wire[] = [];
  for (let i = 1; i <= USERS_DOUBLE_COUNT; i += 1) {
    const state = PATTERN[(i - 1) % PATTERN.length]!;
    const id = `usr_${String(i).padStart(4, "0")}`;
    rows.push({
      user_id: id,
      username: i === 1 ? "bobby" : i === 2 ? "lan" : `user${String(i).padStart(3, "0")}`,
      display_name: i === 1 ? "Bobby Vu" : i === 2 ? "Lan Tran" : `Account ${i}`,
      role: i <= 3 ? "ADMIN" : "USER",
      account_state: state,
      must_change_password: state === "INVITED" || (state === "DISABLED" && i % 3 === 0),
      account_revision: 1 + (i % 7),
      locked: state === "ACTIVE" && i % 17 === 0,
    });
  }
  return rows;
}

const ROWS = build();

function problem(status: number, code: string, message: string): UsersAnswer {
  return { status, body: { error: { code, message, request_id: "req_double_users" } } };
}

function history(userId: string): unknown[] {
  const base = {
    operation_id: `op_${userId}_1`,
    action: "create",
    outcome: "APPLIED",
    reason_code: null,
    expected_revision: 0,
    resulting_revision: 1,
    rollback_description: "Archive the account.",
    step_up_used: false,
    occurred_at: "2026-09-30T08:00:00.000Z",
  };
  if (userId !== "usr_0001") return [base];
  return [
    base,
    { ...base, operation_id: "op_usr_0001_2", action: "issue-activation", expected_revision: 1, resulting_revision: 2, rollback_description: "Revoke the activation.", step_up_used: true, occurred_at: "2026-10-01T09:30:00.000Z" },
    { ...base, operation_id: "op_usr_0001_3", action: "disable", outcome: "CONFLICT", reason_code: "ACCOUNT_REVISION_STALE", expected_revision: 1, resulting_revision: null, rollback_description: "Nothing changed.", step_up_used: true, occurred_at: "2026-10-02T10:15:00.000Z" },
  ];
}

const QUERY_KEYS: readonly string[] = ["limit", "cursor", "q", "role", "state"];
const CURSOR_SIGNATURE = "RG91YmxlLU5PVC1BLVJFQUwtU0lHTkFUVVJF";

const cursorFor = (after: string, binding: unknown): string =>
  `kc1.double-k1.${Buffer.from(JSON.stringify({ after, binding }), "utf8").toString("base64url")}.${CURSOR_SIGNATURE}`;

function rosterPage(search: URLSearchParams): UsersAnswer {
  const bad = (code: string, message: string, status = 400) => problem(status, code, message);
  const keys = [...new Set([...search.keys()])];
  if (keys.some((key) => !QUERY_KEYS.includes(key)) || QUERY_KEYS.some((key) => search.getAll(key).length > 1)) {
    return bad("ROSTER_QUERY_INVALID", "The roster query is not valid.");
  }
  const rawLimit = search.get("limit");
  const limit = rawLimit === null ? 50 : /^\d+$/.test(rawLimit) ? Number(rawLimit) : Number.NaN;
  const q = (search.get("q") ?? "").trim();
  const role = search.get("role");
  const state = search.get("state");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || q.length > 64
    || (role !== null && role !== "ADMIN" && role !== "USER")
    || (state !== null && !["INVITED", "ACTIVE", "DISABLED", "ARCHIVED"].includes(state))) {
    return bad("ROSTER_QUERY_INVALID", "The roster query is not valid.");
  }
  const binding = { limit, q: q.toLowerCase(), role, state };
  let after: string | null = null;
  const cursor = search.get("cursor");
  if (cursor !== null) {
    const parts = cursor.split(".");
    try {
      if (parts.length !== 4 || parts[0] !== "kc1" || parts[3] !== CURSOR_SIGNATURE) throw new Error("shape");
      const payload = JSON.parse(Buffer.from(parts[2]!, "base64url").toString("utf8")) as { after?: unknown; binding?: unknown };
      if (typeof payload.after !== "string") throw new Error("boundary");
      if (JSON.stringify(payload.binding) !== JSON.stringify(binding)) {
        return bad("ROSTER_CURSOR_CHANGED", "The roster cursor belongs to a different query. Reload the roster.", 409);
      }
      after = payload.after;
    } catch {
      return bad("ROSTER_CURSOR_INVALID", "The roster cursor is not valid.");
    }
  }
  const all = variant === "empty" ? [] : [...ROWS].sort((a, b) => (a.username < b.username ? -1 : a.username > b.username ? 1 : 0));
  const matches = (row: Wire) => (q === "" || row.username.toLowerCase().includes(q.toLowerCase()) || row.display_name.toLowerCase().includes(q.toLowerCase()))
    && (role === null || row.role === role) && (state === null || row.account_state === state);
  const matching = all.filter(matches);
  const rest = matching.filter((row) => after === null || row.username > after);
  const rows = rest.slice(0, limit);
  const more = rest.length > rows.length;
  const count = (test: (row: Wire) => boolean) => all.filter(test).length;
  return {
    status: 200,
    body: {
      schema_version: "portal.account-roster.v1",
      record_authority: "PORTAL_CONTROL",
      accounts: rows,
      page: { limit, returned_count: rows.length, has_more: more, next_cursor: more ? cursorFor(rows[rows.length - 1]!.username, binding) : null },
      counts: {
        total: all.length,
        matching: matching.length,
        by_state: { INVITED: count((r) => r.account_state === "INVITED"), ACTIVE: count((r) => r.account_state === "ACTIVE"), DISABLED: count((r) => r.account_state === "DISABLED"), ARCHIVED: count((r) => r.account_state === "ARCHIVED") },
        by_role: { ADMIN: count((r) => r.role === "ADMIN"), USER: count((r) => r.role === "USER") },
        locked: count((r) => r.locked),
        awaiting_first_password: count((r) => r.must_change_password && r.account_state !== "ARCHIVED"),
      },
    },
  };
}

/** `pathname` is the full request path. Answers `null` for anything that is not a Users read. */
/** SIMULATED (FIXTURE_LAB, opt-in, FE-CAT-8): the roster publishes `last_sign_in_at`. Off by default: the double is unchanged. */
let lastSignIn = false;
export function setUsersDoubleLastSignIn(on: boolean): void {
  lastSignIn = on;
}
/** A fixed rule: an INVITED account and every seventh account have unknown history (the key is OMITTED, never null); the others carry a fixed past instant. */
function simulatedLastSignIn(row: Wire): string | undefined {
  if (row.account_state === "INVITED" || Number(row.user_id.slice(-4)) % 7 === 0) return undefined;
  const day = 1 + (Number(row.user_id.slice(-4)) % 20);
  return `2026-10-${String(day).padStart(2, "0")}T09:14:00Z`;
}

/**
 * SIMULATED (FIXTURE_LAB, WP-E, opt-in): the signed-in person is a row of the roster. The first account (`usr_0001`, bobby) is
 * served under the session's own user id, so the screen can mark it "(you)" and say why Disable is off for it. The id is only
 * a key: nothing else about the row changes. Off by default (`null`): the roster is unchanged.
 */
let sessionAlias: string | null = null;
export function setUsersDoubleSessionUser(id: string | null): void {
  sessionAlias = id === null || id === "" || id === "usr_0001" ? null : id;
}
const ALIASED = "usr_0001";
function aliasRow<T extends { user_id?: string }>(row: T): T {
  return sessionAlias !== null && row.user_id === ALIASED ? { ...row, user_id: sessionAlias } : row;
}

function withSignIn(row: Wire): Wire & { last_sign_in_at?: string } {
  const at = simulatedLastSignIn(row);
  return at === undefined ? row : { ...row, last_sign_in_at: at };
}

export function answerUsers(method: string, pathname: string, search: URLSearchParams): UsersAnswer | null {
  // The alias is undone on the way in (a detail read under the session id is the first account's) and applied on the way out.
  const seg = pathname.split("/").filter(Boolean);
  const unaliased = sessionAlias !== null && seg.length === 4 && seg[2] === "accounts" && decodeURIComponent(seg[3]!) === sessionAlias
    ? `/api/admin/accounts/${ALIASED}`
    : pathname;
  const answer = answerUsersBase(method, unaliased, search);
  if (answer === null || answer.status !== 200) return answer;
  const body = answer.body as { accounts?: Wire[]; account?: Wire } | null;
  if (body === null) return answer;
  let next: Record<string, unknown> = body as Record<string, unknown>;
  if (Array.isArray(body.accounts)) {
    // Roster reads only; the detail read and the lifecycle history keep the unextended summary.
    next = { ...body, accounts: body.accounts.map((row) => aliasRow(lastSignIn ? withSignIn(row) : row)) };
  } else if (body.account !== undefined && body.account !== null) {
    next = { ...body, account: aliasRow(body.account) };
  }
  return next === body ? answer : { ...answer, body: next };
}

function answerUsersBase(method: string, pathname: string, search: URLSearchParams): UsersAnswer | null {
  const seg = pathname.split("/").filter(Boolean);
  const isAccounts = seg[0] === "api" && seg[1] === "admin" && seg[2] === "accounts";
  const isStepUp = seg[0] === "api" && seg[1] === "admin" && seg[2] === "step-up" && seg.length === 3;
  if (!isAccounts && !isStepUp) return null;
  if (method !== "GET") return problem(405, "USERS_V2_READ_ONLY", "The V2 Users screen reads accounts only.");

  if (isStepUp) {
    if (variant === "denied") return problem(403, "OWNER_ACCESS_REQUIRED", "Owner access is required.");
    if (variant === "broken") return problem(503, "ACCOUNT_STORE_UNAVAILABLE", "The account store is unavailable.");
    return {
      status: 200,
      body: variant === "verified"
        ? { state: "ACTIVE", expires_at: "2026-10-17T12:11:00.000Z" }
        : { state: "REQUIRED", expires_at: null },
    };
  }

  if (variant === "denied") return problem(403, "OWNER_ACCESS_REQUIRED", "Owner access is required.");
  if (variant === "broken") return problem(503, "ACCOUNT_STORE_UNAVAILABLE", "The account store is unavailable.");

  if (seg.length === 3) {
    if ([...search.keys()].length > 0) return rosterPage(search);
    return { status: 200, body: { accounts: variant === "empty" ? [] : ROWS } };
  }

  const id = decodeURIComponent(seg[3]!);
  if (seg.length !== 4) return null;
  const row = variant === "empty" ? undefined : ROWS.find((r) => r.user_id === id);
  if (!row) return problem(404, "ACCOUNT_NOT_FOUND", "The account was not found.");
  return { status: 200, body: { account: row, history: history(id) } };
}
