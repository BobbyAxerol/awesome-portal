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

export function clearSessionCookies(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
  reply.clearCookie(CSRF_COOKIE, { path: "/" });
}

export function originAllowed(
  request: FastifyRequest,
  allowedOrigin: string,
): boolean {
  const origin = request.headers.origin as string | undefined;
  if (!origin) return true;
  return origin === allowedOrigin;
}
