/**
 * Admin API client (ADMIN-only, behind the gateway).
 *
 * Every call here is a mutation on someone's access, so three rules hold:
 *
 *  1. **CSRF on every write.** The BFF requires the `x-portal-csrf` header to
 *     match the session cookie. Missing it fails closed here rather than sending
 *     a request the server will reject.
 *  2. **The server decides authority.** A 403 is reported, never pre-empted with
 *     a guess about the caller's role — the UI hides the menu for a non-ADMIN as
 *     a courtesy, not as the boundary.
 *  3. **A one-time credential is never stored.** `resetCredential` returns the
 *     activation token once; it is handed to the caller and kept only in
 *     component state, never in localStorage, never logged.
 */
import { AuthRequestError, csrfTokenFromCookie } from "../../auth/authApi";

export type UserRole = "ADMIN" | "USER";

export interface AdminUser {
  userId: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: string;
  mustChangePassword: boolean;
  lockedUntil: string | null;
  createdAt: string;
  disabledAt: string | null;
}

interface RawUser {
  user_id?: unknown;
  username?: unknown;
  display_name?: unknown;
  role?: unknown;
  status?: unknown;
  must_change_password?: unknown;
  locked_until?: unknown;
  created_at?: unknown;
  disabled_at?: unknown;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readUser(raw: RawUser): AdminUser {
  return {
    userId: text(raw.user_id),
    username: text(raw.username),
    displayName: text(raw.display_name),
    // An unrecognised role is treated as USER, the lower privilege — never as
    // ADMIN.
    role: raw.role === "ADMIN" ? "ADMIN" : "USER",
    status: text(raw.status, "UNKNOWN"),
    mustChangePassword: raw.must_change_password === true,
    lockedUntil: nullableText(raw.locked_until),
    createdAt: text(raw.created_at),
    disabledAt: nullableText(raw.disabled_at),
  };
}

async function failure(response: Response): Promise<AuthRequestError> {
  let body: { error?: { code?: string; message?: string; request_id?: string } } | undefined;
  try {
    body = await response.json();
  } catch {
    /* non-JSON error body */
  }
  return new AuthRequestError(
    response.status,
    body?.error?.code ?? "ADMIN_REQUEST_FAILED",
    body?.error?.message ?? "Không thực hiện được yêu cầu.",
    body?.error?.request_id ?? response.headers.get("x-request-id"),
  );
}

async function send(path: string, method: "POST" | "PATCH", payload?: unknown): Promise<Response> {
  const csrf = csrfTokenFromCookie();
  if (!csrf) {
    // Fail closed: without the session's CSRF token this cannot be a legitimate
    // write from this session.
    throw new AuthRequestError(
      403,
      "CSRF_REQUIRED",
      "Thiếu CSRF token của phiên. Hãy tải lại trang hoặc đăng nhập lại.",
      null,
    );
  }
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", "x-portal-csrf": csrf },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (!response.ok) throw await failure(response);
  return response;
}

export async function listUsers(): Promise<AdminUser[]> {
  const response = await fetch("/api/admin/users", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw await failure(response);
  const body = (await response.json()) as { users?: RawUser[] };
  return Array.isArray(body.users) ? body.users.map(readUser) : [];
}

export async function setRole(userId: string, role: UserRole): Promise<AdminUser> {
  const response = await send(`/api/admin/users/${encodeURIComponent(userId)}`, "PATCH", { role });
  return readUser((await response.json()) as RawUser);
}

/**
 * Resets a credential and returns the one-time activation token.
 *
 * The token is shown once and never persisted. The caller must treat it as a
 * secret in transit to the user.
 */
export async function resetCredential(userId: string): Promise<string> {
  const response = await send(
    `/api/admin/users/${encodeURIComponent(userId)}/reset-credential`,
    "POST",
  );
  const body = (await response.json()) as { activation_token?: unknown };
  return text(body.activation_token);
}

export async function revokeSessions(userId: string): Promise<void> {
  await send(`/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, "POST");
}

export async function disableUser(userId: string): Promise<void> {
  await send(`/api/admin/users/${encodeURIComponent(userId)}/disable`, "POST");
}
