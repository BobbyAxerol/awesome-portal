/**
 * A4-2 · the owner account control plane client.
 *
 * Every mutation here carries four things, and the reason each exists is worth
 * keeping next to the code that sends it:
 *
 *  - **the CSRF header**, because the session cookie travels on its own and a
 *    header is the half only same-origin script can add;
 *  - **an idempotency key**, so a retry over a flaky connection is answerable
 *    rather than re-executable — a re-executed activation silently invalidates
 *    the credential the owner is reading out at that moment;
 *  - **the account revision** the screen was looking at, so two tabs cannot
 *    each apply a different decision and both believe they won;
 *  - **a step-up**, for the destructive ones, performed in this same session.
 *
 * The activation credential arrives exactly once, on the response that minted
 * it. This module hands it to the caller and keeps no copy: there is no
 * variable, no cache entry and no storage write that outlives the call.
 */
import { AuthRequestError, CSRF_HEADER, csrfTokenFromCookie } from "../../auth/authApi";

export type AccountState = "INVITED" | "ACTIVE" | "DISABLED" | "ARCHIVED";
export type AccountRole = "ADMIN" | "USER";

export interface AccountSummary {
  userId: string;
  username: string;
  displayName: string;
  role: AccountRole;
  accountState: AccountState;
  mustChangePassword: boolean;
  accountRevision: number;
  locked: boolean;
}

export interface HistoryEntry {
  operationId: string;
  action: string;
  outcome: "APPLIED" | "REPLAYED" | "CONFLICT" | "DENIED";
  reasonCode: string | null;
  expectedRevision: number;
  resultingRevision: number | null;
  rollbackDescription: string;
  stepUpUsed: boolean;
  occurredAt: string;
}

export interface OperationResult {
  outcome: "APPLIED" | "REPLAYED";
  operationId: string;
  accountRevision: number;
  rollbackDescription: string;
  /** Present only on the response that minted it. Never on a replay. */
  activationToken?: string;
}

export interface StepUpState {
  state: "ACTIVE" | "REQUIRED";
  expiresAt: string | null;
}

const BASE = "/api/admin/accounts";

function readAccount(raw: Record<string, unknown>): AccountSummary {
  return {
    userId: String(raw.user_id ?? ""),
    username: String(raw.username ?? ""),
    displayName: String(raw.display_name ?? ""),
    // An unrecognised role reads as USER, the lower privilege — never ADMIN.
    role: raw.role === "ADMIN" ? "ADMIN" : "USER",
    accountState: isAccountState(raw.account_state) ? raw.account_state : "DISABLED",
    mustChangePassword: raw.must_change_password === true,
    accountRevision: typeof raw.account_revision === "number" ? raw.account_revision : 0,
    locked: raw.locked === true,
  };
}

function isAccountState(value: unknown): value is AccountState {
  return value === "INVITED" || value === "ACTIVE" || value === "DISABLED" || value === "ARCHIVED";
}

async function failure(response: Response): Promise<AuthRequestError> {
  let body: { error?: { code?: string; message?: string; request_id?: string } } | undefined;
  try {
    body = (await response.json()) as typeof body;
  } catch {
    /* a proxy can answer with a non-JSON body; the status still counts */
  }
  return new AuthRequestError(
    response.status,
    body?.error?.code ?? "ACCOUNT_REQUEST_FAILED",
    // The server's own words: they are written to name the exact refusal —
    // stale revision, step-up required, activation already issued — and
    // rewording them here would lose the one thing the screen must show.
    body?.error?.message ?? "The account operation could not be completed.",
    body?.error?.request_id ?? response.headers.get("x-request-id"),
  );
}

async function get<T>(path: string, read: (body: Record<string, unknown>) => T): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw await failure(response);
  return read((await response.json()) as Record<string, unknown>);
}

/**
 * A fresh idempotency key per user intent.
 *
 * Generated at the moment the owner confirms, and reused for every retry of
 * THAT confirmation — which is exactly the distinction the server checks. A key
 * derived from the action and target would make two deliberate resets look like
 * one retry; a key per network attempt would make a retry look like a second
 * reset.
 */
export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function send(
  path: string,
  method: "POST" | "PATCH",
  payload: Record<string, unknown>,
  idempotencyKey: string,
): Promise<OperationResult> {
  const csrf = csrfTokenFromCookie();
  if (!csrf) {
    throw new AuthRequestError(
      403,
      "CSRF_MISSING",
      "The session token is missing. Sign in again.",
      null,
    );
  }
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      [CSRF_HEADER]: csrf,
      "x-portal-idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await failure(response);
  const body = (await response.json()) as Record<string, any>;
  return {
    outcome: body.outcome === "REPLAYED" ? "REPLAYED" : "APPLIED",
    operationId: String(body.operation_id ?? ""),
    accountRevision: Number(body.account?.account_revision ?? 0),
    rollbackDescription: String(body.rollback_description ?? ""),
    // Read straight out of the response and returned; never assigned to
    // anything that outlives this function.
    ...(typeof body.activation?.token === "string"
      ? { activationToken: body.activation.token as string }
      : {}),
  };
}

export const accounts = {
  roster: () =>
    get(BASE, (body) =>
      Array.isArray(body.accounts)
        ? body.accounts.map((row) => readAccount(row as Record<string, unknown>))
        : [],
    ),

  detail: (userId: string) =>
    get(`${BASE}/${encodeURIComponent(userId)}`, (body) => ({
      account: readAccount((body.account ?? {}) as Record<string, unknown>),
      history: (Array.isArray(body.history) ? body.history : []).map(
        (raw: Record<string, any>): HistoryEntry => ({
          operationId: String(raw.operation_id ?? ""),
          action: String(raw.action ?? ""),
          outcome: raw.outcome,
          reasonCode: raw.reason_code ?? null,
          expectedRevision: Number(raw.expected_revision ?? 0),
          resultingRevision:
            typeof raw.resulting_revision === "number" ? raw.resulting_revision : null,
          rollbackDescription: String(raw.rollback_description ?? ""),
          stepUpUsed: raw.step_up_used === true,
          occurredAt: String(raw.occurred_at ?? ""),
        }),
      ),
    })),

  create: (input: { username: string; displayName?: string; role?: AccountRole }, key: string) =>
    send(
      BASE,
      "POST",
      {
        username: input.username,
        ...(input.displayName ? { display_name: input.displayName } : {}),
        ...(input.role ? { role: input.role } : {}),
      },
      key,
    ),

  updateProfile: (
    userId: string,
    input: { expectedRevision: number; displayName?: string; role?: AccountRole },
    key: string,
  ) =>
    send(
      `${BASE}/${encodeURIComponent(userId)}`,
      "PATCH",
      {
        expected_revision: input.expectedRevision,
        ...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
      },
      key,
    ),

  issueActivation: (
    userId: string,
    input: { expectedRevision: number; reissue?: boolean },
    key: string,
  ) =>
    send(
      `${BASE}/${encodeURIComponent(userId)}/activation`,
      "POST",
      { expected_revision: input.expectedRevision, ...(input.reissue ? { reissue: true } : {}) },
      key,
    ),

  action: (
    userId: string,
    action: "revoke-sessions" | "disable" | "enable" | "archive",
    expectedRevision: number,
    key: string,
  ) =>
    send(
      `${BASE}/${encodeURIComponent(userId)}/${action}`,
      "POST",
      { expected_revision: expectedRevision },
      key,
    ),
};

export const stepUp = {
  state: () =>
    get<StepUpState>("/api/admin/step-up", (body) => ({
      state: body.state === "ACTIVE" ? "ACTIVE" : "REQUIRED",
      expiresAt: typeof body.expires_at === "string" ? body.expires_at : null,
    })),

  /**
   * The owner's own password, sent once and held nowhere.
   *
   * It is a function argument and nothing else: no state hook, no ref, no
   * default form value. The component that collects it clears its field on
   * success, and the field is `type="password"` with autocomplete off so the
   * browser does not offer to keep it either.
   */
  grant: async (password: string): Promise<StepUpState> => {
    const csrf = csrfTokenFromCookie();
    if (!csrf) {
      throw new AuthRequestError(403, "CSRF_MISSING", "The session token is missing. Sign in again.", null);
    }
    const response = await fetch("/api/admin/step-up", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", [CSRF_HEADER]: csrf },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) throw await failure(response);
    const body = (await response.json()) as Record<string, unknown>;
    return {
      state: body.state === "ACTIVE" ? "ACTIVE" : "REQUIRED",
      expiresAt: typeof body.expires_at === "string" ? body.expires_at : null,
    };
  },
};
