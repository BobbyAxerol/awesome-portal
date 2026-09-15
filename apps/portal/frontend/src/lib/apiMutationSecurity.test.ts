/**
 * A4-FE-BE-GAP-01 · the Research client proves it asked.
 *
 * The facade proxy (`/api/runs`, `/api/v1/alphas`, …) is cookie-authenticated,
 * and a browser attaches that cookie by itself — an attacker never has to read
 * it, only to make the browser send it. `SameSite=Lax` stops the cross-SITE
 * post, but SameSite is scoped to the site rather than the origin, and
 * `dev-portal.primusspark.com` shares a registrable domain with production. A
 * page there is cross-origin, same-site, and its requests carry the session
 * cookie. `POST /api/runs/{id}/cancel` takes no request body, so the
 * content-type strictness that turns the other writes into 422s does not
 * protect it.
 *
 * The header closes that because of two limits an attacker cannot escape: an
 * HTML form cannot set a header at all, and a page on another origin cannot
 * read this origin's cookie to learn the value. These tests exist because the
 * branch that adds it was, until they were written, executed by no test in the
 * suite: jsdom starts with an empty `document.cookie`, so every existing write
 * test ran the "no token" path and the header was never once attached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";

const CSRF_COOKIE = "__Host-portal_csrf";
const CSRF_HEADER = "x-portal-csrf";

const calls: { url: string; init: RequestInit | undefined }[] = [];
const originalFetch = globalThis.fetch;

function withCookie(value: string | null) {
  // jsdom will not keep a `__Host-` cookie over http, so the getter is stubbed
  // the way the admin and auth suites already stub it.
  vi.spyOn(document, "cookie", "get").mockReturnValue(
    value === null ? "" : `${CSRF_COOKIE}=${value}`,
  );
}

const headersOf = (init: RequestInit | undefined): Record<string, string> => {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => {
    out[k] = v;
  });
  return out;
};

beforeEach(() => {
  calls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("the double-submit header on facade writes", () => {
  it("sends the token from the cookie on every write helper", async () => {
    withCookie("token-abc123");

    await api.createRun({});
    await api.preflight({});
    await api.cancelRun("run_1");
    await api.importAlpha({ source_ref: "x", expected_digest: "y" } as never);

    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(headersOf(call.init)[CSRF_HEADER], call.url).toBe("token-abc123");
    }
    // `cancelRun` is the one the attack actually reaches, because its upstream
    // handler takes no body — so it is named rather than left to the loop.
    const cancel = calls.find((c) => c.url.endsWith("/cancel"))!;
    expect(cancel.init?.method).toBe("POST");
    expect(headersOf(cancel.init)[CSRF_HEADER]).toBe("token-abc123");
  });

  it("keeps the Content-Type the caller set", async () => {
    // Normalising headers must not drop what was already there; a lost content
    // type becomes a 422 from FastAPI with nothing pointing at the cause.
    withCookie("token-abc123");
    await api.createRun({ strategy_id: "s" });
    expect(headersOf(calls[0].init)["content-type"]).toBe("application/json");
  });

  it("does not add the header to a read", async () => {
    withCookie("token-abc123");
    await api.listRuns();
    expect(headersOf(calls[0].init)[CSRF_HEADER]).toBeUndefined();
  });

  it("sends the write unchanged when there is no cookie, and invents no error", async () => {
    /*
     * An absent cookie means an absent session, which the server already
     * answers for. Throwing here would put this file on the security path,
     * and §20.2 rule 2 puts the boundary on the server: the client's job is to
     * carry the proof, never to decide whether the request is allowed.
     */
    withCookie(null);
    await expect(api.cancelRun("run_1")).resolves.toBeTruthy();
    expect(headersOf(calls[0].init)[CSRF_HEADER]).toBeUndefined();
    expect(calls[0].init?.method).toBe("POST");
  });
});
