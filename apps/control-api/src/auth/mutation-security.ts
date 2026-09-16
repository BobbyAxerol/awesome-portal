/**
 * A4-1 · one mutation-security check for every Portal-owned write.
 *
 * Seven controllers carried a hand-copied version of this — auth, activation,
 * incident, canary, sandbox-certification, governance and planning — and the
 * one surface that mutates real accounts, `/api/admin/*`, carried none of them
 * (finding A4-F05). Copies drift, and two already had:
 *
 *  - the copy omits the header/cookie double-submit entirely and compares only
 *    `sha256(header)` against the session hash.
 *  - the copy also calls `originAllowed` bare, and that helper returns TRUE
 *    when the Origin header is absent, so a request carrying no Origin at all
 *    passes the check.
 *
 * This module takes the strictest reading as the single definition: Origin
 * must be PRESENT and allowed, the CSRF header must equal the CSRF cookie, and
 * its digest must equal the session's stored secret hash. All comparisons are
 * constant-time.
 *
 * SWEEP STATUS — stated precisely, because a docstring that overclaims is how
 * the next reader stops checking. `/api/admin/*`, the facade proxy and
 * `planning.controller` call the full decision. `auth.controller` uses
 * `originDenial` for login/logout (those paths have no usable session CSRF
 * proof at their first step) and the full decision for change-password. Smoke
 * callers must therefore send the deployment's exact public Origin on writes.
 *
 * §20.2 rule 2: client behaviour is never a security boundary. The frontend
 * already sends `x-portal-csrf`; that is a convenience, and this is the
 * enforcement.
 */
import type { FastifyRequest } from "fastify";

import { constantTimeEqual, sha256 } from "./argon";
import { CSRF_HEADER, csrfCookieFrom, originAllowed } from "./cookies";

/** The reason a write was refused, as a stable code a caller can map to HTTP. */
export type MutationSecurityDenial =
  | "ORIGIN_MISSING"
  | "ORIGIN_DENIED"
  | "CSRF_MISSING"
  | "CSRF_INVALID";

export interface MutationSecurityInput {
  /** The session the request authenticated as; its stored CSRF secret hash. */
  readonly csrfSecretHash: string;
  /** The exact origin this deployment serves, from configuration. */
  readonly allowedOrigin: string;
}

/**
 * Returns `null` when the request may mutate, or the reason it may not.
 *
 * Deliberately returns rather than throws: each controller family has its own
 * typed error class, and forcing one of them on all seven would be a larger
 * change than this phase should make. The decision is shared; the error shape
 * stays local.
 */
export function mutationSecurityDenial(
  request: FastifyRequest,
  input: MutationSecurityInput,
): MutationSecurityDenial | null {
  const origin = request.headers.origin;
  // Absent Origin is a denial, not a pass. `originAllowed` alone returns true
  // for a missing header, which is the trap this function exists to close.
  if (typeof origin !== "string" || origin.length === 0) return "ORIGIN_MISSING";
  if (!originAllowed(request, input.allowedOrigin)) return "ORIGIN_DENIED";

  const rawHeader = request.headers[CSRF_HEADER];
  const header = typeof rawHeader === "string" ? rawHeader : undefined;
  const cookie = csrfCookieFrom(request);
  if (!header || !cookie) return "CSRF_MISSING";

  // Both halves: the double-submit proves the caller can read our cookie, and
  // the session hash binds that token to THIS session rather than any session.
  if (!constantTimeEqual(header, cookie)) return "CSRF_INVALID";
  if (!constantTimeEqual(sha256(header), input.csrfSecretHash)) return "CSRF_INVALID";
  return null;
}

/** Every denial is a 403: the caller is authenticated but the request is not. */
export const MUTATION_SECURITY_STATUS = 403;

/**
 * The Origin half alone, for a mutation that has no session yet.
 *
 * `login` is the case: there is no CSRF secret to compare against until a
 * session exists, so the full decision cannot apply. What still applies is
 * that an Origin must be PRESENT and allowed — `originAllowed` on its own
 * answers `true` for a request carrying no Origin header, which is the drift
 * this module exists to end. Kept here rather than re-implemented at the call
 * site so there is exactly one definition of "an acceptable Origin".
 */
export function originDenial(
  request: FastifyRequest,
  allowedOrigin: string,
): Extract<MutationSecurityDenial, "ORIGIN_MISSING" | "ORIGIN_DENIED"> | null {
  const origin = request.headers.origin;
  if (typeof origin !== "string" || origin.length === 0) return "ORIGIN_MISSING";
  if (!originAllowed(request, allowedOrigin)) return "ORIGIN_DENIED";
  return null;
}

export const MUTATION_SECURITY_MESSAGE: Readonly<Record<MutationSecurityDenial, string>> = {
  ORIGIN_MISSING: "Request origin is required.",
  ORIGIN_DENIED: "Request origin is not allowed.",
  CSRF_MISSING: "CSRF token is missing.",
  CSRF_INVALID: "CSRF token is invalid.",
};
