/**
 * A4-1 · the shared mutation-security decision.
 *
 * The cases here are the ones the seven hand-copies disagreed about, not a
 * restatement of the happy path: a missing Origin, a header that matches the
 * cookie but not the session, and a header that matches the session but not
 * the cookie. Each of those passed somewhere in the codebase before this.
 */
import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";

import { sha256 } from "../src/auth/argon";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/auth/cookies";
import { mutationSecurityDenial } from "../src/auth/mutation-security";

const ORIGIN = "https://portal.example";
const TOKEN = "csrf-token-value";

function request(over: {
  origin?: string | undefined;
  header?: string | undefined;
  cookie?: string | undefined;
}): FastifyRequest {
  return {
    headers: {
      ...(over.origin === undefined ? {} : { origin: over.origin }),
      ...(over.header === undefined ? {} : { [CSRF_HEADER]: over.header }),
    },
    cookies: over.cookie === undefined ? {} : { [CSRF_COOKIE]: over.cookie },
  } as unknown as FastifyRequest;
}

const input = { csrfSecretHash: sha256(TOKEN), allowedOrigin: ORIGIN };

describe("mutationSecurityDenial", () => {
  it("allows a request that satisfies all three checks", () => {
    expect(mutationSecurityDenial(request({ origin: ORIGIN, header: TOKEN, cookie: TOKEN }), input)).toBeNull();
  });

  it("denies a request with NO Origin header", () => {
    // `originAllowed` returns true for a missing Origin; `planning.controller`
    // calls it bare, so this case passed there. It must not pass here.
    expect(mutationSecurityDenial(request({ header: TOKEN, cookie: TOKEN }), input)).toBe("ORIGIN_MISSING");
    expect(mutationSecurityDenial(request({ origin: "", header: TOKEN, cookie: TOKEN }), input)).toBe("ORIGIN_MISSING");
  });

  it("denies a foreign Origin", () => {
    expect(mutationSecurityDenial(request({ origin: "https://evil.example", header: TOKEN, cookie: TOKEN }), input)).toBe("ORIGIN_DENIED");
  });

  it("denies when either half of the double-submit is absent", () => {
    expect(mutationSecurityDenial(request({ origin: ORIGIN, cookie: TOKEN }), input)).toBe("CSRF_MISSING");
    expect(mutationSecurityDenial(request({ origin: ORIGIN, header: TOKEN }), input)).toBe("CSRF_MISSING");
  });

  it("denies a header that matches the session but NOT the cookie", () => {
    // The check `planning.controller` omits: without it, a token replayed from
    // somewhere other than our own cookie is accepted.
    expect(mutationSecurityDenial(request({ origin: ORIGIN, header: TOKEN, cookie: "different" }), input)).toBe("CSRF_INVALID");
  });

  it("denies a header that matches the cookie but NOT the session", () => {
    // Binds the token to THIS session; without it any well-formed pair passes.
    const other = { csrfSecretHash: sha256("another-session"), allowedOrigin: ORIGIN };
    expect(mutationSecurityDenial(request({ origin: ORIGIN, header: TOKEN, cookie: TOKEN }), other)).toBe("CSRF_INVALID");
  });

  it("never reveals the token or the hash in its answer", () => {
    // The denial is a stable code; a message carrying the expected value would
    // turn a 403 into an oracle.
    const denial = mutationSecurityDenial(request({ origin: ORIGIN, header: "wrong", cookie: "wrong" }), input);
    expect(denial).toBe("CSRF_INVALID");
    expect(JSON.stringify(denial)).not.toContain(TOKEN);
    expect(JSON.stringify(denial)).not.toContain(input.csrfSecretHash);
  });
});
