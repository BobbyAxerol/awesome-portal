import { FastifyReply, FastifyRequest } from "fastify";

export const SESSION_COOKIE = "__Host-portal_session";
export const CSRF_COOKIE = "__Host-portal_csrf";
export const CSRF_HEADER = "x-portal-csrf";
export const ACCESS_ASSERTION_HEADER = "cf-access-jwt-assertion";

export function sessionTokenFrom(request: FastifyRequest): string | undefined {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  const value = cookies?.[SESSION_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function csrfCookieFrom(request: FastifyRequest): string | undefined {
  const cookies = request.cookies as Record<string, string | undefined> | undefined;
  const value = cookies?.[CSRF_COOKIE];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function setSessionCookies(
  reply: FastifyReply,
  sessionToken: string,
  csrfToken: string,
  expiresAt: Date,
): void {
  reply.setCookie(SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  reply.setCookie(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/**
 * A4-1 · a `__Host-` cookie is only deletable on the terms it was set.
 *
 * `clearCookie` deletes by re-setting the cookie with an expiry in the past,
 * so the browser applies the same validation it applied to the original. The
 * `__Host-` prefix REQUIRES `Secure` and `Path=/` and forbids `Domain`; sent
 * without `Secure`, the deletion is silently rejected and the session and CSRF
 * cookies survive logout in the browser. The session row is revoked either
 * way, so this was not an authentication hole — but it left a dead cookie pair
 * on a shared machine and made "sign out" visibly untrue in devtools.
 *
 * The attributes below mirror `setSessionCookies` exactly, which is the actual
 * requirement: a deletion that does not match the original set is not a
 * deletion.
 */
export function clearSessionCookies(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  reply.clearCookie(CSRF_COOKIE, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

export function originAllowed(
  request: FastifyRequest,
  allowedOrigin: string,
): boolean {
  const origin = request.headers.origin as string | undefined;
  if (!origin) return true;
  return origin === allowedOrigin;
}
