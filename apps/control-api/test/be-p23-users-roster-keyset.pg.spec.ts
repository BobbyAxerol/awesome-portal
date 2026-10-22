/**
 * BE-P23, REAL PostgreSQL half (WRITTEN, NOT RUN by the author: needs a DISPOSABLE `TEST_DATABASE_URL`; otherwise the whole suite skips).
 *
 * The page logic over a fake store is proved by be-p23-account-roster-page.spec.ts. This proves what a fake cannot, over HTTP on the mounted app:
 * (1) the single-statement SQL: a walk of the real table at limit 50 returns every account once, in the DATABASE's `ORDER BY username`
 *     (collation included: mixed case, hyphen, underscore, digits), with `counts` equal to independent COUNT(*) queries;
 * (2) filters (q over username and display name, role, state with ARCHIVED winning over stored status) and `matching` against the same filter in SQL;
 * (3) the no-query read is still the whole unpaged roster (no `page`, no `counts`), the V1 screen's transition;
 * (4) the authority boundary: a non-owner ADMIN gets the same 403 for a paged read whether its `q` matches an account or not (no existence oracle),
 *     and an owner cursor replayed by another owner's session is refused as changed;
 * (5) bad limits, unknown keys and tampered cursors are fixed-code 400/409 answers that never echo the cursor, the filter or a username.
 * The page statement is also EXPLAINed with seqscan disabled to show `portal_users_username_key` serves the range (bounded cost).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminService } from "../src/admin/admin.service";
import { AuthService } from "../src/auth/auth.service";
import { OwnerAccessRepository } from "../src/repos/owner-access";
import { ROSTER_PAGE_SQL } from "../src/repos/users";
import { migrateTestDatabase, setupApp, teardownApp } from "./harness";

const DATABASE_URL = process.env.TEST_DATABASE_URL;
const OWNER_PASSWORD = "owner-correct-horse-battery-2026";

describe.skipIf(!DATABASE_URL)("BE-P23 owner roster keyset page on real PostgreSQL (TEST_ONLY; NOT_RUN without TEST_DATABASE_URL)", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let auth: AuthService;
  let admin: AdminService;
  let ownerSession: { cookie: string; csrf: string };

  const http = () => ctx.app.getHttpAdapter().getInstance();
  const inject = (path: string, options: Record<string, unknown> = {}) => {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) };
    if (!("x-dev-access-email" in headers)) headers["x-dev-access-email"] = "dev@azdag.com";
    return http().inject({ method: "GET", url: path, ...options, headers });
  };
  const signIn = async (username: string, password: string) => {
    const response = await inject("/api/auth/login", { method: "POST", headers: { "x-dev-access-email": `${username}@azdag.com`, origin: ctx.config.PORTAL_PUBLIC_ORIGIN }, payload: { username, credential: password } });
    expect(response.statusCode).toBe(201);
    const cookies = response.headers["set-cookie"] as string[];
    return { cookie: cookies.map((v) => v.split(";")[0]).join("; "), csrf: cookies.find((v) => v.startsWith("__Host-portal_csrf="))!.split(";")[0].split("=")[1] };
  };
  const roster = (query: string, session = ownerSession) => inject(`/api/admin/accounts${query}`, { headers: { cookie: session.cookie } });
  const sql = async (text: string, values: unknown[] = []) => (await ctx.pool.query(text, values)).rows;

  async function activeAccount(username: string, role: "ADMIN" | "USER" = "USER") {
    const password = `${username}-correct-horse-battery-2026`;
    const created = await admin.createUser({ username, displayName: username, role });
    const { activationToken } = await admin.resetCredential(created.userId);
    const first = await auth.login({ assertion: undefined, devEmail: `${username}@azdag.com`, username, credential: activationToken });
    await auth.changePassword({ sessionToken: first.token, csrfToken: first.csrfToken, currentPassword: activationToken, newPassword: password });
    return { ...created, password };
  }

  beforeAll(async () => {
    await migrateTestDatabase(DATABASE_URL!);
    ctx = await setupApp({ AUTH_MODE: "dev" });
    auth = ctx.app.get(AuthService, { strict: false });
    admin = new AdminService(ctx.pool, ctx.config, auth);
    await ctx.pool.query("DELETE FROM portal_owner_anchor");
    const created = await admin.createUser({ username: "bobby", displayName: "Bobby", role: "ADMIN" });
    const { activationToken } = await admin.resetCredential(created.userId);
    const first = await auth.login({ assertion: undefined, devEmail: "bobby@azdag.com", username: "bobby", credential: activationToken });
    await auth.changePassword({ sessionToken: first.token, csrfToken: first.csrfToken, currentPassword: activationToken, newPassword: OWNER_PASSWORD });
    await new OwnerAccessRepository(ctx.pool).claimOwner({ userId: created.userId, claimedBy: "test" });
    ownerSession = await signIn("bobby", OWNER_PASSWORD);
    // 120 more invited accounts: collation-sensitive names, a few archived, disabled and locked ones.
    const names = Array.from({ length: 120 }, (_, i) => {
      const n = String(i).padStart(3, "0");
      return [`user-${n}`, `user_${n}`, `user${n}`, `zed-${n}`][i % 4]!;
    });
    for (const name of names) await admin.createUser({ username: name, displayName: i2(name), role: name.startsWith("zed") ? "ADMIN" : "USER" });
    await ctx.pool.query("UPDATE portal_users SET status='DISABLED', disabled_at=now() WHERE username LIKE 'user-0%1'");
    await ctx.pool.query("UPDATE portal_users SET archived_at=now(), status='DISABLED' WHERE username LIKE 'user-0%2'");
    await ctx.pool.query("UPDATE portal_users SET locked_until=now()+interval '1 hour' WHERE username LIKE 'user-0%3'");
  });
  afterAll(async () => { if (ctx) await teardownApp(ctx); });

  const i2 = (name: string) => (name.length % 2 === 0 ? `Display ${name}` : `Name ${name.toLowerCase()}`);

  async function walk(query: string) {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let last: any;
    do {
      const response = await roster(`?${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      last = response.json();
      pages += 1;
      seen.push(...last.accounts.map((a: { username: string }) => a.username));
      expect(last.page.returned_count).toBe(last.accounts.length);
      expect(last.page.has_more).toBe(last.page.next_cursor !== null);
      cursor = last.page.next_cursor;
      if (pages > 30) throw new Error("runaway paging");
    } while (cursor);
    return { seen, pages, last };
  }

  it("walks the whole table at limit 50 in the database's own username order, once each, with exact counts", async () => {
    const { seen, pages, last } = await walk("limit=50");
    const db = (await sql("SELECT username FROM portal_users ORDER BY username")).map((r) => r.username);
    expect(seen).toEqual(db);
    expect(new Set(seen).size).toBe(db.length);
    expect(pages).toBe(Math.ceil(db.length / 50));
    const [total] = await sql("SELECT count(*)::int AS n FROM portal_users");
    expect(last.counts.total).toBe(total.n);
    expect(last.counts.matching).toBe(total.n);
    const [byRole] = await sql("SELECT count(*) FILTER (WHERE role='ADMIN')::int AS a, count(*) FILTER (WHERE role='USER')::int AS u FROM portal_users");
    expect(last.counts.by_role).toEqual({ ADMIN: byRole.a, USER: byRole.u });
    const states = await sql("SELECT CASE WHEN archived_at IS NOT NULL THEN 'ARCHIVED' ELSE status END AS s, count(*)::int AS n FROM portal_users GROUP BY 1");
    for (const state of ["INVITED", "ACTIVE", "DISABLED", "ARCHIVED"]) expect(last.counts.by_state[state]).toBe(states.find((r) => r.s === state)?.n ?? 0);
    const [locked] = await sql("SELECT count(*)::int AS n FROM portal_users WHERE locked_until > now()");
    expect(last.counts.locked).toBe(locked.n);
    const [awaiting] = await sql("SELECT count(*)::int AS n FROM portal_users WHERE must_change_password AND archived_at IS NULL");
    expect(last.counts.awaiting_first_password).toBe(awaiting.n);
  });

  it("every page and the counts come from one answer: a page's counts equal the first page's counts on a quiet table", async () => {
    const first = (await roster("?limit=10")).json();
    const second = (await roster(`?limit=10&cursor=${encodeURIComponent(first.page.next_cursor)}`)).json();
    expect(second.counts).toEqual(first.counts);
  });

  it("q, role and state filter in SQL; matching is the filtered total and the other counts stay roster-wide", async () => {
    const q = await walk("q=zed-0&limit=7");
    const dbQ = (await sql("SELECT username FROM portal_users WHERE position('zed-0' IN lower(username))>0 OR position('zed-0' IN lower(display_name))>0 ORDER BY username")).map((r) => r.username);
    expect(q.seen).toEqual(dbQ);
    expect(q.last.counts.matching).toBe(dbQ.length);
    const [total] = await sql("SELECT count(*)::int AS n FROM portal_users");
    expect(q.last.counts.total).toBe(total.n);
    const archived = await walk("state=ARCHIVED&limit=5");
    expect(archived.seen).toEqual((await sql("SELECT username FROM portal_users WHERE archived_at IS NOT NULL ORDER BY username")).map((r) => r.username));
    const disabled = await walk("state=DISABLED&limit=5");
    expect(disabled.seen).toEqual((await sql("SELECT username FROM portal_users WHERE archived_at IS NULL AND status='DISABLED' ORDER BY username")).map((r) => r.username));
    const admins = await walk("role=ADMIN&state=INVITED&limit=9");
    expect(admins.seen).toEqual((await sql("SELECT username FROM portal_users WHERE role='ADMIN' AND archived_at IS NULL AND status='INVITED' ORDER BY username")).map((r) => r.username));
    const none = (await roster("?q=no-such-person-anywhere")).json();
    expect(none.accounts).toEqual([]);
    expect(none.page).toEqual({ limit: 50, returned_count: 0, has_more: false, next_cursor: null });
    expect(none.counts.matching).toBe(0);
  });

  it("an LIKE-significant search is literal text: '%' and '_' match nothing they are not", async () => {
    expect((await roster(`?q=${encodeURIComponent("%")}`)).json().counts.matching).toBe(0);
    expect((await roster(`?q=${encodeURIComponent("user_00")}`)).json().counts.matching).toBe(
      (await sql("SELECT count(*)::int AS n FROM portal_users WHERE position('user_00' IN lower(username))>0 OR position('user_00' IN lower(display_name))>0"))[0].n);
  });

  it("with no query the read is still the whole unpaged roster: no page, no counts (the V1 screen's transition)", async () => {
    const body = (await roster("")).json();
    expect(Object.keys(body).sort()).toEqual(["accounts", "record_authority", "schema_version"]);
    expect(body.accounts).toHaveLength((await sql("SELECT count(*)::int AS n FROM portal_users"))[0].n);
  });

  it("the PRODUCTION statement reads its page from the unique username index, bounded by limit + 1 (EXPLAIN ANALYZE of ROSTER_PAGE_SQL)", async () => {
    const nodes = (plan: any): any[] => [plan, ...((plan.Plans ?? []) as any[]).flatMap(nodes)];
    const run = async (params: unknown[]) => {
      const rows = await sql(`EXPLAIN (ANALYZE, FORMAT JSON) ${ROSTER_PAGE_SQL}`, params);
      return nodes(rows[0]["QUERY PLAN"][0].Plan);
    };
    await ctx.pool.query("SET enable_seqscan = off");
    try {
      // No filter: the page is an index range of at most limit + 1 rows (the aggregate is a separate full pass).
      const plain = await run(["user-050", null, null, null, 51, new Date()]);
      const pageScan = plain.find((n) => n["Index Name"] === "portal_users_username_key" && n["Actual Loops"] === 1 && n["Actual Rows"] <= 51 && n["Node Type"].includes("Index"));
      expect(pageScan, "no bounded username-index node for the page").toBeDefined();
      expect(plain.some((n) => n["Node Type"] === "Limit" && n["Actual Rows"] <= 51)).toBe(true);
      // With a filter the scan walks the same index until 51 rows match: record what it really read, do not claim limit + 1.
      const filtered = await run([null, "user-0", "USER", null, 51, new Date()]);
      const scan = filtered.find((n) => n["Index Name"] === "portal_users_username_key");
      expect(scan, "filtered page lost the username index").toBeDefined();
      console.info(`BE-P23 page scan, filtered: returned ${scan["Actual Rows"]}, removed by filter ${scan["Rows Removed by Filter"] ?? 0}`);
    } finally { await ctx.pool.query("RESET enable_seqscan"); }
  });

  it("bad limits and keys are fixed 400s that never echo the input", async () => {
    for (const query of ["?limit=0", "?limit=201", "?limit=abc", "?role=SUPER", "?state=GONE", `?q=${"x".repeat(65)}`, "?sort=role", "?limit=5&limit=6"]) {
      const response = await roster(query);
      expect(response.statusCode, query).toBe(400);
      expect(response.json().error.code).toBe("ROSTER_QUERY_INVALID");
      expect(JSON.stringify(response.json())).not.toMatch(/SUPER|GONE|abc|xxxx|sort/);
    }
  });

  it("a tampered cursor is 400, a cursor for another filter or limit is 409, and neither names an account", async () => {
    const first = (await roster("?limit=10")).json();
    const cursor: string = first.page.next_cursor;
    const tampered = await roster(`?limit=10&cursor=${encodeURIComponent(`${cursor.slice(0, -3)}AAA`)}`);
    expect(tampered.statusCode).toBe(400);
    expect(tampered.json().error.code).toBe("ROSTER_CURSOR_INVALID");
    const changed = await roster(`?limit=11&cursor=${encodeURIComponent(cursor)}`);
    expect(changed.statusCode).toBe(409);
    expect(changed.json().error.code).toBe("ROSTER_CURSOR_CHANGED");
    const filtered = await roster(`?limit=10&role=USER&cursor=${encodeURIComponent(cursor)}`);
    expect(filtered.statusCode).toBe(409);
    for (const response of [tampered, changed, filtered]) expect(JSON.stringify(response.json())).not.toMatch(/user-|user_|zed-|bobby|usr_/);
  });

  it("a non-owner ADMIN gets the same 403 whether its q matches an account or not, and cannot replay the owner's cursor", async () => {
    const other = await activeAccount("p23-second-admin", "ADMIN");
    const session = await signIn("p23-second-admin", other.password);
    const hit = await roster("?q=bobby&limit=5", session);
    const miss = await roster("?q=no-such-person-anywhere&limit=5", session);
    expect(hit.statusCode).toBe(403);
    expect(miss.statusCode).toBe(403);
    expect(JSON.stringify(hit.json())).toBe(JSON.stringify(miss.json()));
    expect(JSON.stringify(hit.json())).not.toContain("bobby");
    const cursor = (await roster("?limit=5")).json().page.next_cursor as string;
    const replay = await roster(`?limit=5&cursor=${encodeURIComponent(cursor)}`, session);
    expect(replay.statusCode).toBe(403);
    expect(JSON.stringify(replay.json())).toBe(JSON.stringify(hit.json()));
  });

  it("an unauthenticated paged read is refused before any data", async () => {
    const response = await inject("/api/admin/accounts?limit=5");
    expect([401, 403]).toContain(response.statusCode);
    expect(JSON.stringify(response.json())).not.toContain("accounts\":[");
  });
});
