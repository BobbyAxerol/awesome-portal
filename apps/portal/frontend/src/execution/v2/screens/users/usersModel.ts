/**
 * Users, pure model (UXM-07 S2, flag key `users`).
 *
 * Everything the screen prints about an account comes from `AccountSummary`
 * (`features/admin/accountApi.ts`): the V1 roles `ADMIN` and `USER`, the four
 * lifecycle states, `locked` and `mustChangePassword`. Role presets and a last
 * sign-in time are not on that read, so this file never invents them: the
 * screen names them as not published.
 *
 * Counts are taken over the roster the server returned. The roster is one
 * unpaged read, so a count over it is the whole population, and the screen
 * says "from the roster read" rather than "total".
 */
import type { AccountRole, AccountState, AccountSummary, StepUpState } from "../../../../features/admin/accountApi";
import type { FlagKind } from "../../flagKinds";

/** DOM budget: more rows than this and the reader narrows the search instead. */
export const ROW_CAP = 200;
/** Rows added by one `Load more`. */
export const PAGE_SIZE = 50;

export const ACCOUNT_STATES: readonly AccountState[] = ["ACTIVE", "INVITED", "DISABLED", "ARCHIVED"];
export const ACCOUNT_ROLES: readonly AccountRole[] = ["ADMIN", "USER"];

/** The id every role-preset, sign-in and eligibility gap is filed under (FRONTEND_BACKEND_SYNC s3, 3b). */
export const PRESET_REQUESTS = "FE-015, FE-026, FE-037, FE-038";

export interface StateView {
  kind: FlagKind;
  label: string;
}

/** Lifecycle word -> flag. Chosen from the enum, never from the label text. */
export const STATE_VIEW: Readonly<Record<AccountState, StateView>> = {
  ACTIVE: { kind: "ok", label: "Active" },
  INVITED: { kind: "pending", label: "Invited" },
  DISABLED: { kind: "paused", label: "Disabled" },
  ARCHIVED: { kind: "na", label: "Archived" },
};

export const ROLE_LABEL: Readonly<Record<AccountRole, string>> = {
  ADMIN: "Administrator",
  USER: "User",
};

export interface UsersFilters {
  q: string;
  role: AccountRole | null;
  state: AccountState | null;
}

export const NO_FILTERS: UsersFilters = { q: "", role: null, state: null };

export function isRole(value: string | null): value is AccountRole {
  return value === "ADMIN" || value === "USER";
}

export function isState(value: string | null): value is AccountState {
  return value === "ACTIVE" || value === "INVITED" || value === "DISABLED" || value === "ARCHIVED";
}

/** Name or username contains the text, case-insensitive. An empty query matches all. */
export function matchesQuery(account: AccountSummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return account.displayName.toLowerCase().includes(needle) || account.username.toLowerCase().includes(needle);
}

export function filterAccounts(accounts: readonly AccountSummary[], filters: UsersFilters): AccountSummary[] {
  return accounts.filter(
    (account) =>
      matchesQuery(account, filters.q) &&
      (filters.role === null || account.role === filters.role) &&
      (filters.state === null || account.accountState === filters.state),
  );
}

export interface RosterCounts {
  total: number;
  byState: Readonly<Record<AccountState, number>>;
  byRole: Readonly<Record<AccountRole, number>>;
  locked: number;
  awaitingFirstPassword: number;
}

/** Counts over the roster as read. An archived account does not "await" a first password. */
export function rosterCounts(accounts: readonly AccountSummary[]): RosterCounts {
  const byState: Record<AccountState, number> = { ACTIVE: 0, INVITED: 0, DISABLED: 0, ARCHIVED: 0 };
  const byRole: Record<AccountRole, number> = { ADMIN: 0, USER: 0 };
  let locked = 0;
  let awaitingFirstPassword = 0;
  for (const account of accounts) {
    byState[account.accountState] += 1;
    byRole[account.role] += 1;
    if (account.locked) locked += 1;
    if (account.mustChangePassword && account.accountState !== "ARCHIVED") awaitingFirstPassword += 1;
  }
  return { total: accounts.length, byState, byRole, locked, awaitingFirstPassword };
}

export interface StepUpView {
  kind: FlagKind;
  label: string;
  /** ISO instant the check lapses, when the server stated one. */
  until: string | null;
}

/**
 * The step-up check as the server reported it. `ACTIVE` is the only state that
 * reads as verified; the expiry is shown, never recomputed against the browser
 * clock.
 */
export function stepUpView(state: StepUpState | null): StepUpView {
  if (state === null) return { kind: "unknown", label: "Step-up state not read", until: null };
  if (state.state === "ACTIVE") return { kind: "ok", label: "Step-up verified", until: state.expiresAt };
  return { kind: "approval", label: "Step-up required", until: null };
}

/** Where a failed read lands, so a 403 is not worded as an outage. */
export function failureOf(error: unknown): { status: "denied" | "unavailable"; reason: string } {
  const status = typeof error === "object" && error !== null && "status" in error ? (error as { status: unknown }).status : null;
  if (status === 401 || status === 403) {
    return { status: "denied", reason: "Users is for administrators. This account is not one, so no account is shown." };
  }
  const code = typeof error === "object" && error !== null && "code" in error && typeof (error as { code: unknown }).code === "string"
    ? (error as { code: string }).code
    : null;
  // A refused body names where (a row and a field), never the value that was refused.
  const where = typeof error === "object" && error !== null && "where" in error && typeof (error as { where: unknown }).where === "string"
    ? (error as { where: string }).where
    : null;
  return {
    status: "unavailable",
    reason: `The account ${code?.startsWith("HISTORY_") ? "history" : "roster"} could not be read${code ? ` (${code}${where ? `, ${where}` : ""})` : ""}.`,
  };
}
