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
 * The roster is one unpaged list (that is the real contract); the screen pages it
 * in memory. Switch with `setUsersDoubleVariant` (module state, per test file).
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

/** `pathname` is the full request path. Answers `null` for anything that is not a Users read. */
export function answerUsers(method: string, pathname: string, _search: URLSearchParams): UsersAnswer | null {
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

  if (seg.length === 3) return { status: 200, body: { accounts: variant === "empty" ? [] : ROWS } };

  const id = decodeURIComponent(seg[3]!);
  if (seg.length !== 4) return null;
  const row = variant === "empty" ? undefined : ROWS.find((r) => r.user_id === id);
  if (!row) return problem(404, "ACCOUNT_NOT_FOUND", "The account was not found.");
  return { status: 200, body: { account: row, history: history(id) } };
}
