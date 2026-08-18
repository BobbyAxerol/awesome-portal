/**
 * Identity BFF client (U07, v0.4 §21.1 Frames 01B–01D).
 *
 * The wire gateway routes every `/api/` call through the Control API, so these
 * are same-origin and cookie-authenticated. Three rules shape this module:
 *
 *  1. **The state machine is the backend's.** `/api/auth/context` returns which
 *     frame to show; the frontend never decides it can skip a step. An unknown
 *     state is treated as "cannot proceed", not as authenticated.
 *  2. **Errors are generic.** A login failure must not say whether the account
 *     exists, so the message shown is the server's own copy plus a request id
 *     for support — never a locally composed diagnosis.
 *  3. **Nothing sensitive is logged or stored.** No username, credential, JWT
 *     or cookie is written anywhere by this module.
 */

/** States `/api/auth/context` can report. */
export type AuthState =
  | "AUTHENTICATED"
  | "APP_LOGIN_REQUIRED"
  | "PASSWORD_CHANGE_REQUIRED"
  | "ACCESS_REQUIRED"
  | "ACCOUNT_DISABLED";

/** The role/session facts the BFF releases only once authenticated. */
export interface AuthPrincipal {
  principalId: string;
  username: string;
  role: string;
  sessionId: string;
  mustChangePassword: boolean;
  authnMethods: string[];
  issuedAt: string;
  exp: number;
}

/** Identity verified by Cloudflare Access, before any app login. */
export interface AccessIdentity {
  sub: string;
  email: string | null;
}

export interface AuthContext {
  state: AuthState;
  principal: AuthPrincipal | null;
  accessIdentity: AccessIdentity | null;
}

/** A failure the UI can present: server copy plus a correlation id. */
export class AuthRequestError extends Error {
  readonly code: string;
  readonly requestId: string | null;
  readonly status: number;

  constructor(status: number, code: string, message: string, requestId: string | null) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

const CSRF_COOKIE = "__Host-portal_csrf";
const CSRF_HEADER = "x-portal-csrf";

/**
 * Dev-mode Access identity.
 *
 * With `AUTH_MODE=dev` the Control API accepts `x-dev-access-email` in place of
 * a Cloudflare Access assertion, which is how the stack stays usable behind
 * `vite dev` where there is no Access in front. It is only ever sent when the
 * build explicitly configures it, so a production bundle cannot forge one.
 */
const DEV_ACCESS_EMAIL = import.meta.env.VITE_DEV_ACCESS_EMAIL as string | undefined;

function devHeaders(): Record<string, string> {
  return DEV_ACCESS_EMAIL ? { "x-dev-access-email": DEV_ACCESS_EMAIL } : {};
}

/** Reads the CSRF token the login response set. Not httpOnly, by design. */
export function csrfTokenFromCookie(): string | null {
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : null;
}

interface ErrorBody {
  error?: { code?: string; message?: string; request_id?: string };
  message?: string;
  detail?: string;
}

async function failure(response: Response): Promise<AuthRequestError> {
  let body: ErrorBody | undefined;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    // An upstream proxy can answer with a non-JSON body; the status still counts.
  }
  const requestId =
    body?.error?.request_id ?? response.headers.get("x-request-id") ?? null;
  return new AuthRequestError(
    response.status,
    body?.error?.code ?? "AUTH_REQUEST_FAILED",
    // The server's own copy is used verbatim: it is written to avoid leaking
    // whether an account exists, and rewording it here could undo that.
    body?.error?.message ?? body?.message ?? body?.detail ?? "The request could not be completed.",
    requestId,
  );
}

async function post(path: string, payload?: unknown, csrf?: string | null): Promise<Response> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...devHeaders(),
      ...(csrf ? { [CSRF_HEADER]: csrf } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (!response.ok) throw await failure(response);
  return response;
}

interface ContextResponse {
  state?: string;
  principal?: Record<string, unknown> | null;
  access_identity?: { sub?: string; email?: string | null } | null;
}

const KNOWN_STATES = new Set<AuthState>([
  "AUTHENTICATED",
  "APP_LOGIN_REQUIRED",
  "PASSWORD_CHANGE_REQUIRED",
  "ACCESS_REQUIRED",
  "ACCOUNT_DISABLED",
]);

function readPrincipal(raw: Record<string, unknown> | null | undefined): AuthPrincipal | null {
  if (!raw || typeof raw.username !== "string") return null;
  return {
    principalId: String(raw.principalId ?? raw.principal_id ?? ""),
    username: raw.username,
    role: String(raw.role ?? ""),
    sessionId: String(raw.sessionId ?? raw.session_id ?? ""),
    mustChangePassword: raw.mustChangePassword === true || raw.must_change_password === true,
    authnMethods: Array.isArray(raw.authnMethods)
      ? raw.authnMethods.filter((item): item is string => typeof item === "string")
      : [],
    issuedAt: String(raw.issuedAt ?? raw.issued_at ?? ""),
    exp: typeof raw.exp === "number" ? raw.exp : 0,
  };
}

/**
 * Reads the current auth state.
 *
 * A response the frontend cannot classify becomes `ACCESS_REQUIRED` — the most
 * restrictive state — rather than being optimistically treated as authenticated.
 */
export async function fetchAuthContext(): Promise<AuthContext> {
  const response = await fetch("/api/auth/context", {
    credentials: "same-origin",
    cache: "no-store",
    headers: devHeaders(),
  });
  if (!response.ok) throw await failure(response);
  const body = (await response.json()) as ContextResponse;
  const state = KNOWN_STATES.has(body.state as AuthState)
    ? (body.state as AuthState)
    : "ACCESS_REQUIRED";
  return {
    state,
    principal: state === "AUTHENTICATED" ? readPrincipal(body.principal) : null,
    accessIdentity: body.access_identity?.sub
      ? { sub: body.access_identity.sub, email: body.access_identity.email ?? null }
      : null,
  };
}

export interface LoginResult {
  sessionId: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
}

/** `credential` is a password or, on first login, a one-time activation code. */
export async function login(username: string, credential: string): Promise<LoginResult> {
  const response = await post("/api/auth/login", { username, credential });
  const body = (await response.json()) as Record<string, unknown>;
  return {
    sessionId: String(body.session_id ?? ""),
    idleExpiresAt: String(body.idle_expires_at ?? ""),
    absoluteExpiresAt: String(body.absolute_expires_at ?? ""),
  };
}

/**
 * Sets a private password.
 *
 * The BFF clears the session cookies on success, so the caller must return to
 * the login frame rather than assuming it is now authenticated.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const csrf = csrfTokenFromCookie();
  if (!csrf) {
    throw new AuthRequestError(
      403,
      "CSRF_REQUIRED",
      "The session CSRF token is missing. Sign in again.",
      null,
    );
  }
  await post(
    "/api/auth/change-password",
    { current_password: currentPassword, new_password: newPassword },
    csrf,
  );
}

/** Ends the app session. Access (Cloudflare) session is separate — see 01B. */
export async function logout(): Promise<void> {
  await post("/api/auth/logout", undefined, csrfTokenFromCookie());
}

/**
 * Where to send the browser to drop the Cloudflare Access session too.
 *
 * "Switch Access identity" has to clear both, and only Cloudflare can clear
 * its own. This is Access's documented logout path, not a Portal route.
 */
export const ACCESS_LOGOUT_PATH = "/cdn-cgi/access/logout";
