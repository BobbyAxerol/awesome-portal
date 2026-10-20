// @vitest-environment node
/**
 * The shell bootstrap of the fixture BFF (FIXTURE_LAB lane, NOT acceptance evidence).
 *
 * The deployed preview has no Control API behind it, so the browser's first four reads (who is signed
 * in, the registry, the links, the summary) are answered here from `e2e/bffDoubleShell.ts`. These
 * tests hold three things:
 *
 *  1. the answers are the ones `stubPortalApi` (e2e/fixtures.ts) gives Playwright, except the
 *     identity, which is deliberately a labelled fixture and not a person;
 *  2. over real HTTP each path answers with the lane header, deterministically, and never mints or
 *     reads a cookie, token or session;
 *  3. everything near those paths that is not served (login, logout, csrf, capabilities, any write)
 *     is refused, not invented.
 */
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { stubPortalApi } from "../../e2e/fixtures";
import { MANAGER_CAPABILITIES } from "../../e2e/bffAnswerer";
import { AUTH_CONTEXT_PATH, FIXTURE_REVIEWER_NAME, PORTAL_LINKS_PATH, PORTAL_REGISTRY_PATH, PORTAL_SUMMARY_PATH, SHELL_PATHS } from "../../e2e/bffDoubleShell";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";

interface Captured {
  pattern: string;
  status: number;
  body: unknown;
}

/** Runs the real `stubPortalApi` against a page that only records what each route would answer. */
async function stubbedAnswers(): Promise<Map<string, Captured>> {
  const handlers: { pattern: string; handler: (route: unknown) => unknown }[] = [];
  const page = { route: async (pattern: string, handler: (route: unknown) => unknown) => void handlers.push({ pattern, handler }) };
  await stubPortalApi(page as never, "healthy", "AUTHENTICATED");
  const answers = new Map<string, Captured>();
  for (const { pattern, handler } of handlers) {
    if (pattern === "**/api/**") continue;
    let captured: Captured | null = null;
    const route = {
      request: () => ({ url: () => `http://localhost${pattern.replace("**", "")}`, method: () => "GET" }),
      fulfill: async (options: { status?: number; body?: string }) => {
        let body: unknown = options.body ?? null;
        try {
          body = JSON.parse(options.body ?? "null");
        } catch {
          // an event stream or other text body: not one of the four this file compares
        }
        captured = { pattern, status: options.status ?? 200, body };
      },
    };
    await handler(route);
    if (captured !== null) answers.set(pattern.replace("**", ""), captured);
  }
  return answers;
}

const servers: import("node:http").Server[] = [];
async function listen(env: Record<string, string> = {}): Promise<string> {
  const server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", ...env }));
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

let doubles = "";
let refuse = "";
beforeAll(async () => {
  doubles = await listen({ FIXTURE_WRITES: "doubles" });
  refuse = await listen({ FIXTURE_WRITES: "refuse" });
}, 30_000);
afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((done) => server.close(() => done()))));
  resetFixtureGlobals();
});

async function get(origin: string, path: string, headers: Record<string, string> = {}, method = "GET"): Promise<{ status: number; headers: Headers; text: string }> {
  const response = await fetch(`${origin}${path}`, { method, headers, ...(method === "GET" || method === "HEAD" ? {} : { body: "{}" }) });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

describe("the answers are the ones Playwright's stubPortalApi gives", () => {
  it("registry, links and summary are byte-equal to the stub's bodies", async () => {
    const stub = await stubbedAnswers();
    for (const path of [PORTAL_REGISTRY_PATH, PORTAL_LINKS_PATH, PORTAL_SUMMARY_PATH]) {
      const expected = stub.get(path);
      expect(expected, `${path} is stubbed`).toBeDefined();
      const answered = await get(doubles, path);
      expect(answered.status, path).toBe(expected!.status);
      expect(JSON.parse(answered.text), path).toEqual(expected!.body);
    }
  });

  it("the auth context has the stub's shape and state; only the identity is a labelled fixture", async () => {
    const stub = (await stubbedAnswers()).get(AUTH_CONTEXT_PATH)!.body as { state: string; principal: Record<string, unknown>; access_identity: Record<string, unknown> };
    const fixture = JSON.parse((await get(doubles, AUTH_CONTEXT_PATH)).text) as typeof stub & Record<string, unknown>;
    expect(fixture.state).toBe(stub.state);
    expect(Object.keys(fixture.principal).sort()).toEqual(Object.keys(stub.principal).sort());
    expect(Object.keys(fixture.access_identity).sort()).toEqual(Object.keys(stub.access_identity).sort());
    expect(fixture.principal.username).toBe(FIXTURE_REVIEWER_NAME);
    expect(fixture.principal.username).not.toBe(stub.principal.username);
    expect(fixture.access_identity.email).toBeNull();
    expect(fixture).toMatchObject({ fixture: true, lane: "FIXTURE_LAB", not_acceptance: true });
  });

  it("the signed-in user is the one the Access reads describe, and its capabilities are the lane's", async () => {
    const context = JSON.parse((await get(doubles, AUTH_CONTEXT_PATH)).text) as { principal: { principalId: string } };
    const self = JSON.parse((await get(doubles, "/api/admin/access/self")).text) as { user_id: string; capabilities: string[] };
    expect(self.user_id).toBe(context.principal.principalId);
    expect(self.capabilities).toEqual([...MANAGER_CAPABILITIES]);

    const other = await listen({ FIXTURE_USER_ID: "principal-fixture-other" });
    const otherContext = JSON.parse((await get(other, AUTH_CONTEXT_PATH)).text) as { principal: { principalId: string } };
    const otherSelf = JSON.parse((await get(other, "/api/admin/access/self")).text) as { user_id: string };
    expect(otherContext.principal.principalId).toBe("principal-fixture-other");
    expect(otherSelf.user_id).toBe("principal-fixture-other");
  });
});

describe("over HTTP", () => {
  it.each(SHELL_PATHS.map((path) => [path]))("GET %s carries the lane header, is deterministic and mints nothing", async (path) => {
    const first = await get(doubles, path);
    expect(first.status).toBe(200);
    expect(first.headers.get("x-fixture-lane")).toBe("FIXTURE_LAB");
    expect(first.headers.get("content-type")).toBe("application/json");
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("set-cookie")).toBeNull();
    expect(first.headers.get("etag")).toBeNull();
    expect((await get(doubles, path)).text).toBe(first.text);
  });

  it("never reads a session: a cookie, a bearer token and a CSRF header change nothing", async () => {
    const credentials = { cookie: "__Host-portal_session=REAL-LOOKING-VALUE; __Host-portal_csrf=abc", authorization: "Bearer REAL-LOOKING-TOKEN", "x-portal-csrf": "abc", "x-dev-access-email": "someone@example.com" };
    for (const path of SHELL_PATHS) {
      const bare = await get(doubles, path);
      const withCredentials = await get(doubles, path, credentials);
      expect(withCredentials.text, path).toBe(bare.text);
      expect(withCredentials.headers.get("set-cookie"), path).toBeNull();
      expect(withCredentials.text, path).not.toContain("REAL-LOOKING");
    }
  });

  it("the auth context holds no credential field and says it is a fixture", async () => {
    const body = JSON.parse((await get(doubles, AUTH_CONTEXT_PATH)).text) as Record<string, unknown>;
    const keys: string[] = [];
    const walk = (value: unknown): void => {
      if (value !== null && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
          keys.push(key);
          walk(inner);
        }
      }
    };
    walk(body);
    expect(keys.filter((key) => key !== "mustChangePassword").filter((key) => /secret|password|jwt|csrf|token|cookie|credential/i.test(key))).toEqual([]);
    expect(String((body.principal as { sessionId: string }).sessionId)).toMatch(/^fixture-/);
    expect(String(body.note)).toMatch(/fixture/i);
  });

  it("HEAD is GET without a body", async () => {
    const head = await get(doubles, AUTH_CONTEXT_PATH, {}, "HEAD");
    expect(head.status).toBe(200);
    expect(head.text).toBe("");
    expect(head.headers.get("x-fixture-lane")).toBe("FIXTURE_LAB");
  });
});

describe("what is refused next to them", () => {
  const SIBLINGS = ["/api/auth/login", "/api/auth/logout", "/api/auth/change-password", "/api/auth/csrf", "/api/auth/context/extra", "/api/v1/portal/capabilities", "/api/v1/portal/registry/extra", "/api/v1/portal/anything", "/api/health", "/api/control/healthz", "/api/runs", "/api/strategies", "/api/v1/alphas"];

  it.each(SIBLINGS.map((path) => [path]))("GET %s is 404 FIXTURE_ROUTE_NOT_SERVED", async (path) => {
    const answered = await get(doubles, path);
    expect(answered.status).toBe(404);
    expect(JSON.parse(answered.text)).toEqual({ error: "FIXTURE_ROUTE_NOT_SERVED" });
    expect(answered.headers.get("x-fixture-lane")).toBe("FIXTURE_LAB");
    expect(answered.headers.get("set-cookie")).toBeNull();
  });

  it("a sign-in or sign-out is refused in both write modes, and sets no cookie", async () => {
    for (const path of ["/api/auth/login", "/api/auth/logout", "/api/auth/change-password"]) {
      const inDoubles = await get(doubles, path, {}, "POST");
      expect(inDoubles.status, `doubles ${path}`).toBe(404);
      const inRefuse = await get(refuse, path, {}, "POST");
      expect(inRefuse.status, `refuse ${path}`).toBe(405);
      for (const answered of [inDoubles, inRefuse]) {
        expect(answered.headers.get("set-cookie")).toBeNull();
        expect(answered.headers.get("x-fixture-lane")).toBe("FIXTURE_LAB");
      }
    }
  });

  it("a write to a served bootstrap path is 405 (the path exists, the method does not)", async () => {
    for (const path of SHELL_PATHS) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const answered = await get(doubles, path, {}, method);
        expect(answered.status, `${method} ${path}`).toBe(405);
        expect(JSON.parse(answered.text)).toEqual({ error: "FIXTURE_METHOD_NOT_ALLOWED" });
      }
    }
  });
});

describe("the double itself", () => {
  it("is a pure module of the e2e folder: no Playwright, no socket, no clock, no random", () => {
    const source = readFileSync(resolve(__dirname, "../../e2e/bffDoubleShell.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(source).not.toMatch(/playwright|node:http|node:net|fetch\(|Date\.now|new Date|Math\.random|set-cookie/i);
  });
});
