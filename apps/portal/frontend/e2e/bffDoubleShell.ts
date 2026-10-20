/**
 * Shell bootstrap reads for the fixture BFF (FIXTURE_LAB lane, NOT acceptance evidence).
 *
 * The browser shell asks four things before it can draw any screen, and `e2e/fixtures.ts`
 * (`stubPortalApi`) already stubs each of them for Playwright:
 *
 *   GET /api/auth/context           who is signed in (the AuthGate)
 *   GET /api/v1/portal/registry     the module registry that builds the navigation
 *   GET /api/v1/portal/links        the cross-link sidecar
 *   GET /api/v1/portal/summary      the Command Center summary (the `healthy` fixture)
 *
 * The registry, links and summary bodies are the SAME canonical files `stubPortalApi` reads
 * (`apps/portal/registry/fixtures/*.json`), imported here rather than copied, so a bundle carries
 * them and the two cannot drift; `src/fixtureBff/shell.test.ts` runs `stubPortalApi` against a fake
 * page and compares every body. `GET /api/admin/access/self` (the capabilities) is answered by
 * `bffAnswerer.ts`, not here.
 *
 * The signed-in identity is the one place this double deliberately differs from the stub: the stub
 * names a person (`bobby`, an e-mail address); this one names "Fixture reviewer" and says, in the
 * body, that it is a fixture. It mints nothing: no cookie, no token, no session. `sessionId` is a
 * label, not a credential; nothing accepts it and the server never reads a request header.
 *
 * Only these four paths are answered, and only for GET. Everything else under `/api/auth/` (login,
 * logout, change-password, csrf) and `/api/v1/portal/` (capabilities) answers `null`, which the
 * server turns into a refusal.
 */
import links from "../../registry/fixtures/links.public.json";
import registry from "../../registry/fixtures/registry.public.json";
import summaryHealthy from "../../registry/fixtures/summary.healthy.json";

export interface ShellAnswer {
  status: number;
  body: unknown;
}

export const AUTH_CONTEXT_PATH = "/api/auth/context";
export const PORTAL_REGISTRY_PATH = "/api/v1/portal/registry";
export const PORTAL_LINKS_PATH = "/api/v1/portal/links";
export const PORTAL_SUMMARY_PATH = "/api/v1/portal/summary";
/** The four paths this double answers, in the order the shell asks. */
export const SHELL_PATHS: readonly string[] = [AUTH_CONTEXT_PATH, PORTAL_REGISTRY_PATH, PORTAL_LINKS_PATH, PORTAL_SUMMARY_PATH];

export const FIXTURE_REVIEWER_NAME = "Fixture reviewer";
/** A label the shell displays and compares; never a credential. */
export const FIXTURE_SESSION_LABEL = "fixture-lab-no-session";

/** What `/api/auth/context` says. Pure: the same user id always gives the same bytes. */
export function fixtureAuthContext(userId: string): Record<string, unknown> {
  return {
    state: "AUTHENTICATED",
    principal: {
      principalId: userId,
      username: FIXTURE_REVIEWER_NAME,
      role: "FIXTURE_LAB",
      sessionId: FIXTURE_SESSION_LABEL,
      mustChangePassword: false,
      authnMethods: ["fixture"],
      issuedAt: "2026-08-22T13:00:00+00:00",
      exp: 2000000000,
    },
    access_identity: { sub: "fixture-lab-no-identity", email: null },
    // The shell reads none of these; they are for the human who opens the response.
    fixture: true,
    lane: "FIXTURE_LAB",
    not_acceptance: true,
    note: "Synthetic identity served by the fixture BFF. No session, cookie or token exists; nothing here was read from the Control API.",
  };
}

export function answerShell(method: string, path: string, options: { userId: string }): ShellAnswer | null {
  if (method !== "GET") return null;
  switch (path) {
    case AUTH_CONTEXT_PATH:
      return { status: 200, body: fixtureAuthContext(options.userId) };
    case PORTAL_REGISTRY_PATH:
      return { status: 200, body: registry };
    case PORTAL_LINKS_PATH:
      return { status: 200, body: links };
    case PORTAL_SUMMARY_PATH:
      return { status: 200, body: summaryHealthy };
    default:
      return null;
  }
}
