/** Owner-only HTTP admin API for the DR-30 default execution grants. Needs Postgres (TEST_DATABASE_URL). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminService } from "../src/admin/admin.service";
import { Argon2CredentialService } from "../src/auth/argon";
import { AuthService } from "../src/auth/auth.service";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://portal:portal@127.0.0.1:5432/portal_control_test";
const WS = "ws_grants_admin_bound";
const PASSWORD = "a-correct-horse-battery-staple-42";
const BASE = "/api/admin/execution-grants";

type Ctx = Awaited<ReturnType<typeof setupApp>>;
interface Session { cookie: string; csrf: string }

async function boot(flag: "true" | "false") {
  const ctx = await setupApp({ AUTH_MODE: "dev", FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS: flag, EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WS });
  const auth = new AuthService(ctx.pool, ctx.config, new Argon2CredentialService({
    memoryKib: ctx.config.ARGON2_MEMORY_KIB, iterations: ctx.config.ARGON2_ITERATIONS, parallelism: ctx.config.ARGON2_PARALLELISM }));
  const admin = new AdminService(ctx.pool, ctx.config, auth);
  const http = ctx.app.getHttpAdapter().getInstance();
  const origin = ctx.config.PORTAL_PUBLIC_ORIGIN;
  const login = async (username: string, credential: string) => {
    const res = await http.inject({ method: "POST", url: "/api/auth/login", headers: { "x-dev-access-email": `${username}@azdag.com`, origin }, payload: { username, credential } });
    expect(res.statusCode).toBe(201);
    const set = res.headers["set-cookie"] as string[];
    const value = (name: string) => set.find(entry => entry.startsWith(`${name}=`))!.split(";")[0].split("=")[1];
    return { cookie: set.map(entry => entry.split(";")[0]).join("; "), token: value("__Host-portal_session"), csrf: value("__Host-portal_csrf") };
  };
  const activeUser = async (username: string, role: "ADMIN" | "USER") => {
    const created = await admin.createUser({ username, displayName: username, role });
    const token = (await admin.resetCredential(created.userId)).activationToken;
    const first = await login(username, token);
    await auth.changePassword({ sessionToken: first.token, csrfToken: first.csrf, currentPassword: token, newPassword: PASSWORD });
    return { userId: created.userId, session: await login(username, PASSWORD) as Session };
  };
  const call = (session: Session | null, method: "GET" | "POST" | "DELETE", url: string, payload?: unknown, extra: Record<string, string> = {}) =>
    http.inject({ method, url, payload: payload as never, headers: { ...(session ? { cookie: session.cookie } : {}),
      ...(method === "GET" ? {} : { "x-portal-csrf": session?.csrf ?? "", origin, "x-portal-idempotency-key": `idem-${Math.random().toString(36).slice(2, 12)}` }), ...extra } });
  const stepUp = async (session: Session) => {
    const res = await http.inject({ method: "POST", url: "/api/admin/step-up", payload: { password: PASSWORD },
      headers: { cookie: session.cookie, "x-portal-csrf": session.csrf, origin, "x-portal-idempotency-key": "grants-step-up-key" } });
    expect(res.statusCode).toBe(201);
  };
  return { ctx, activeUser, call, stepUp };
}

describe("DR-30 grants admin API, flag on", () => {
  let h: Awaited<ReturnType<typeof boot>>, ctx: Ctx;
  let owner: Session, stan: { userId: string; session: Session }, second: Session;
  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL);
    h = await boot("true"); ctx = h.ctx;
    await ctx.pool.query("DELETE FROM portal_owner_anchor");
    const o = await h.activeUser("grants-owner", "ADMIN");
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: o.userId, claimedBy: "test" });
    await ctx.pool.query("INSERT INTO workspaces(workspace_id,name,owner_user_id) VALUES($1,'bound',$2)", [WS, o.userId]);
    owner = o.session; stan = await h.activeUser("grants-stan", "USER"); second = (await h.activeUser("grants-admin2", "ADMIN")).session;
  }, 120_000);
  afterAll(async () => { await teardownApp(ctx); });
  const can = (env: string) => new WorkspacesRepository(ctx.pool, ctx.config).canReadExecution(WS, stan.userId, env as never);

  it("denies anonymous, USER and non-owner ADMIN before anything else", async () => {
    expect((await h.call(null, "GET", BASE)).statusCode).toBe(401);
    expect((await h.call(stan.session, "GET", BASE)).statusCode).toBe(403);
    expect((await h.call(second, "GET", BASE)).statusCode).toBe(403);
    expect((await h.call(second, "POST", BASE, { username: "grants-stan", environments: ["paper"] })).statusCode).toBe(403);
    expect(await can("paper")).toBe(false);
  });
  it("mutations need step-up, an idempotency key, Origin and CSRF", async () => {
    const body = { username: "grants-stan", environments: ["paper"] };
    const noStep = await h.call(owner, "POST", BASE, body);
    expect(noStep.statusCode).toBe(403); expect(JSON.stringify(noStep.json())).toContain("STEP_UP_REQUIRED");
    await h.stepUp(owner);
    const noKey = await h.call(owner, "POST", BASE, body, { "x-portal-idempotency-key": "" });
    expect(noKey.statusCode).toBe(400);
    const noCsrf = await h.call(owner, "POST", BASE, body, { "x-portal-csrf": "wrong" });
    expect(noCsrf.statusCode).toBe(403);
    expect(await can("paper")).toBe(false);
  });
  it("validates environments, term, user and owner subject; fails closed with fixed words", async () => {
    await h.stepUp(owner);
    for (const bad of [{ environments: [] }, { environments: ["prod"] }, { environments: ["paper"], term_days: 366 }, { environments: ["paper"], term_days: 0 },
      { environments: ["paper"], extra: 1 }, {}])
      expect((await h.call(owner, "POST", BASE, { username: "grants-stan", ...bad })).statusCode, JSON.stringify(bad)).toBe(422);
    expect((await h.call(owner, "POST", BASE, { username: "nobody-here", environments: ["paper"] })).statusCode).toBe(404);
    expect((await h.call(owner, "POST", BASE, { username: "grants-owner", environments: ["paper"] })).statusCode).toBe(422);
    expect((await h.call(owner, "POST", BASE, { username: "bad name!", environments: ["paper"] })).statusCode).toBe(422);
    expect(await can("paper")).toBe(false);
  });
  it("grant, list, renew, narrow, revoke: effect on the next read, same audit rows as the CLI, no membership change", async () => {
    await h.stepUp(owner);
    const members = async () => Number((await ctx.pool.query("SELECT count(*) FROM workspace_members WHERE workspace_id=$1", [WS])).rows[0].count);
    const before = await members();
    const g = await h.call(owner, "POST", BASE, { username: "grants-stan", environments: ["sandbox", "live"], term_days: 30 });
    expect(g.statusCode).toBe(201); expect(g.json()).toMatchObject({ outcome: "ISSUED", environments: ["live", "sandbox"], scope: "DEFAULT_EXECUTION_READ_ONLY", writes: false, membership_changes: 0 });
    expect([await can("sandbox"), await can("live"), await can("paper")]).toEqual([true, true, false]);
    expect((await h.call(owner, "POST", BASE, { username: "grants-stan", environments: ["paper"] })).statusCode).toBe(409);
    const list = (await h.call(owner, "GET", BASE)).json();
    expect(list).toMatchObject({ schema_version: "portal.execution-default-grants.v1", max_term_days: 365, environments: ["paper", "sandbox", "live"] });
    const row = list.grants.find((item: { username: string }) => item.username === "grants-stan");
    expect(row).toMatchObject({ status: "ACTIVE", environments: ["live", "sandbox"], revoked_at: null });
    const days = (Date.parse(row.expires_at) - Date.parse(row.term_started_at)) / 86_400_000;
    expect(days).toBeGreaterThan(29.9); expect(days).toBeLessThan(30.1);
    expect(list.candidates.map((c: { username: string }) => c.username)).toContain("grants-stan");
    expect(list.candidates.map((c: { username: string }) => c.username)).not.toContain("grants-owner");
    expect(JSON.stringify(list)).not.toMatch(/password|token|csrf|secret|hash/i);
    const r = await h.call(owner, "POST", `${BASE}/grants-stan/renew`, { environments: ["paper", "sandbox", "live"] });
    expect(r.statusCode).toBe(201); expect(r.json().outcome).toBe("RENEWED");
    expect(await can("paper")).toBe(true);
    await h.call(owner, "POST", `${BASE}/grants-stan/renew`, { environments: ["paper"] });
    expect([await can("paper"), await can("live")]).toEqual([true, false]);
    const rv = await h.call(owner, "DELETE", `${BASE}/grants-stan`);
    expect(rv.statusCode).toBe(200); expect(rv.json().outcome).toBe("REVOKED");
    expect(await can("paper")).toBe(false);
    expect((await h.call(owner, "DELETE", `${BASE}/grants-stan`)).json().outcome).toBe("NO_CHANGE");
    expect((await h.call(owner, "POST", `${BASE}/grants-stan/renew`, { environments: ["paper"] })).statusCode).toBe(404);
    const after = (await h.call(owner, "GET", BASE)).json().grants.find((item: { username: string }) => item.username === "grants-stan");
    expect(after.status).toBe("REVOKED");
    const audit = (await ctx.pool.query(`SELECT event_type,actor_user_id,metadata_json FROM product_audit_events WHERE event_type LIKE 'DR30_DEFAULT_EXECUTION_GRANT_%' ORDER BY occurred_at`)).rows;
    expect(audit.map(a => a.event_type)).toEqual(["DR30_DEFAULT_EXECUTION_GRANT_ISSUED", "DR30_DEFAULT_EXECUTION_GRANT_RENEWED", "DR30_DEFAULT_EXECUTION_GRANT_RENEWED", "DR30_DEFAULT_EXECUTION_GRANT_REVOKED"]);
    expect(audit[0].metadata_json).toMatchObject({ writes: false, membership_changes: 0, term_days: 30, scope: "DEFAULT_EXECUTION_READ_ONLY" });
    expect(await members()).toBe(before);
    expect(Number((await ctx.pool.query("SELECT (SELECT count(*) FROM portal_access_policy_events)+(SELECT count(*) FROM portal_access_grants_v2)+(SELECT count(*) FROM portal_access_policy_state) AS n")).rows[0].n)).toBe(0);
  });
});

describe("DR-30 grants admin API, flag off", () => {
  it("every route is a plain 404 for the owner (and anonymous), and nothing is written", async () => {
    await migrateTestDatabase(DATABASE_URL);
    const h = await boot("false");
    try {
      await h.ctx.pool.query("DELETE FROM portal_owner_anchor");
      const o = await h.activeUser("grants-owner-off", "ADMIN");
      await new OwnerAccessRepository(h.ctx.pool).claimOwner({ userId: o.userId, claimedBy: "test" });
      await h.stepUp(o.session);
      for (const [method, url, body] of [["GET", BASE, undefined], ["POST", BASE, { username: "x", environments: ["paper"] }],
        ["POST", `${BASE}/x/renew`, { environments: ["paper"] }], ["DELETE", `${BASE}/x`, undefined]] as const) {
        expect((await h.call(o.session, method, url, body)).statusCode, `${method} ${url}`).toBe(404);
        expect((await h.call(null, method, url, body)).statusCode, `anon ${method} ${url}`).toBe(404);
      }
      expect(Number((await h.ctx.pool.query("SELECT count(*) FROM execution_retained_review_access")).rows[0].count)).toBe(0);
    } finally { await teardownApp(h.ctx); }
  }, 120_000);
});
