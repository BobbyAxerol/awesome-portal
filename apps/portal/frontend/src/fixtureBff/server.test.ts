// @vitest-environment node
/**
 * The fixture BFF over real HTTP: every route in ROUTES.md answers, carries the lane header, is
 * deterministic and (where a published schema exists) conforms to it; unknown paths and unmodelled
 * writes are refused; the standalone scale is real volume that keeps the honesty rules.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { connect, type AddressInfo } from "node:net";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MANAGER_CAPABILITIES } from "../../e2e/bffAnswerer";
import { ConfigError, MAX_BODY_BYTES, createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { ROUTES, ROUTES_BEGIN, ROUTES_END, SCHEMAS, routesMarkdown, type RouteEntry } from "./routeTable";
import { disposeSchemaCheck, violationsOf } from "./schemaCheck";

const ROUTES_MD = resolve(__dirname, "../../../fixture-bff/ROUTES.md");

let base = "";
let refuseBase = "";
const servers: import("node:http").Server[] = [];

async function listen(env: Record<string, string>): Promise<string> {
  const server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", ...env }));
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  base = await listen({ FIXTURE_SCALE: "medium" });
  refuseBase = await listen({ FIXTURE_SCALE: "medium", FIXTURE_WRITES: "refuse" });
}, 30_000);

afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((done) => server.close(() => done()))));
  resetFixtureGlobals();
  disposeSchemaCheck();
});

const REPORT: { pattern: string; verdict: string }[] = [];

/* ── the route table ────────────────────────────────────────────────────── */

async function call(origin: string, entry: Pick<RouteEntry, "url" | "body"> & { method: string }): Promise<{ status: number; headers: Headers; text: string }> {
  const response = await fetch(`${origin}${entry.url}`, {
    method: entry.method,
    ...(entry.body !== undefined ? { body: JSON.stringify(entry.body), headers: { "content-type": "application/json" } } : {}),
  });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

describe("every route in ROUTES.md", () => {
  it.each(ROUTES.map((route) => [`${route.method} ${route.pattern}`, route] as const))("%s", async (_name, route) => {
    const first = await call(base, route);
    expect(first.status, first.text.slice(0, 200)).toBe(route.status);
    expect(first.headers.get("x-fixture-lane")).toBe("FIXTURE_LAB");
    expect(first.headers.get("cache-control")).toBe("no-store");
    const isStream = route.pattern.endsWith("/stream");
    expect(first.headers.get("content-type")).toBe(isStream ? "text/event-stream" : "application/json");
    const body: unknown = isStream ? first.text : JSON.parse(first.text);

    // Same request twice, same answer. The writes are canned answers, so they hold to it too.
    const second = await call(base, route);
    expect(second.status).toBe(first.status);
    expect(second.text).toBe(first.text);

    const key = `${route.method} ${route.pattern}`;
    const verdict = SCHEMAS[key];
    if (verdict) {
      const { violations, ignored } = violationsOf(verdict.ref, body);
      const where = `${key} against ${verdict.ref.file}#${verdict.ref.ptr}`;
      if (verdict.drift) {
        // Known drift is asserted, so fixing a double (or the schema) turns this red until the table is updated.
        expect(violations.length, `${where} now conforms: drop its drift note in routeTable.ts`).toBeGreaterThan(0);
        REPORT.push({ pattern: key, verdict: `DRIFT (${verdict.drift}): ${violations.slice(0, 3).join("; ")}` });
      } else {
        expect(violations.slice(0, 5), where).toEqual([]);
        REPORT.push({ pattern: key, verdict: ignored.length > 0 ? `validated (checker cannot check ${ignored.join(", ")})` : "validated" });
      }
    } else {
      REPORT.push({ pattern: key, verdict: "no schema" });
    }
  });

  it("the ROUTES.md table is the generated one", () => {
    const text = readFileSync(ROUTES_MD, "utf8");
    const start = text.indexOf(ROUTES_BEGIN);
    const end = text.indexOf(ROUTES_END);
    expect(start, "ROUTES.md has the begin marker").toBeGreaterThanOrEqual(0);
    expect(end, "ROUTES.md has the end marker").toBeGreaterThan(start);
    const current = text.slice(start, end + ROUTES_END.length);
    if (process.env.FIXTURE_BFF_WRITE_ROUTES === "1") {
      writeFileSync(ROUTES_MD, text.slice(0, start) + routesMarkdown() + text.slice(end + ROUTES_END.length));
      return;
    }
    expect(current).toBe(routesMarkdown());
  });

  it("every pattern is listed once", () => {
    const keys = ROUTES.map((route) => `${route.method} ${route.pattern}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("reports which routes were validated and which have no schema", () => {
    const validated = REPORT.filter((row) => row.verdict.startsWith("validated"));
    const drift = REPORT.filter((row) => row.verdict.startsWith("DRIFT"));
    const none = REPORT.filter((row) => row.verdict === "no schema");
    const text = [
      `fixture-bff schema report: ${validated.length} validated, ${drift.length} known drift, ${none.length} without a schema`,
      "VALIDATED", ...validated.map((row) => `  ${row.pattern}${row.verdict === "validated" ? "" : `  [${row.verdict}]`}`),
      "DRIFT", ...drift.map((row) => `  ${row.pattern}  ${row.verdict}`),
      "NO SCHEMA", ...none.map((row) => `  ${row.pattern}`),
    ].join("\n");
    if (process.env.FIXTURE_BFF_REPORT) writeFileSync(process.env.FIXTURE_BFF_REPORT, `${text}\n`);
    expect(validated.length + drift.length + none.length).toBe(ROUTES.length);
    expect(Object.keys(SCHEMAS).every((key) => ROUTES.some((route) => `${route.method} ${route.pattern}` === key))).toBe(true);
  });
});

/* ── the session ───────────────────────────────────────────────────────── */

describe("the session capabilities", () => {
  it("are the ones the V2 Playwright lane inlines", () => {
    // The list moved from the spec into the shared lane module (v2Lane.ts), which the s1 spec and the link crawler both use.
    const spec = readFileSync(resolve(__dirname, "../../e2e/v2Lane.ts"), "utf8");
    const literal = /const MANAGER_CAPABILITIES = \[([\s\S]*?)\];/.exec(spec)?.[1] ?? "";
    const inSpec = [...literal.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(inSpec.length).toBeGreaterThan(10);
    expect([...MANAGER_CAPABILITIES]).toEqual(inSpec);
  });
});

/* ── the lane ───────────────────────────────────────────────────────────── */

describe("the lane", () => {
  it("says what it is", async () => {
    const answered = await call(base, { method: "GET", url: "/__fixture/lane" });
    expect(JSON.parse(answered.text)).toMatchObject({ lane: "FIXTURE_LAB", not_acceptance: true, source: "e2e doubles + published synthetic fixtures" });
  });

  it("marks every kind of answer, refusals and stream included", async () => {
    for (const [method, url] of [["GET", "/nope"], ["POST", "/api/v1/execution/alphas"], ["DELETE", "/__fixture/lane"], ["GET", "/api/v1/execution/command-center/stream"], ["GET", "/api/v1/execution/retained-review"]] as const) {
      const answered = await call(base, { method, url });
      expect(answered.headers.get("x-fixture-lane"), `${method} ${url}`).toBe("FIXTURE_LAB");
    }
  });
});

/* ── refusals ───────────────────────────────────────────────────────────── */

describe("what is not served", () => {
  it("an unknown path is 404 FIXTURE_ROUTE_NOT_SERVED, never a fabricated body", async () => {
    for (const url of ["/nope", "/api/v1/execution/this/is/not/a/route", "/api/v1/execution/derivations/alphas/a/anything-else?environment=paper", "/api/v1/execution/manager/current/not-in-the-catalogue?environment=paper", "/__fixture/other", "/api/admin/profile-access", "/api/auth/login", "/api/auth/csrf", "/api/v1/portal/capabilities", "/api/health"]) {
      const answered = await call(base, { method: "GET", url });
      expect(answered.status, url).toBe(404);
      expect(JSON.parse(answered.text), url).toEqual({ error: "FIXTURE_ROUTE_NOT_SERVED" });
    }
  });

  it("a write the doubles do not model on a served path is 405", async () => {
    for (const [method, url] of [["POST", "/api/v1/execution/alphas"], ["POST", "/api/v1/execution/portfolios"], ["POST", "/api/admin/accounts"], ["POST", "/api/admin/access/self"], ["POST", "/__fixture/lane"], ["DELETE", "/api/v1/execution/alphas/alpha_btc_trend/stage-drift"]] as const) {
      const answered = await call(base, { method, url, body: {} });
      expect(answered.status, `${method} ${url}`).toBe(405);
      // The Users double refuses its own writes with a typed problem; every other path gets the server's.
      const error = JSON.parse(answered.text).error;
      const users = url.startsWith("/api/admin/accounts");
      expect(users ? error.code : error).toBe(users ? "USERS_V2_READ_ONLY" : "FIXTURE_METHOD_NOT_ALLOWED");
    }
  });

  it("a path segment that cannot be decoded is 400, not a crash", async () => {
    const answered = await call(base, { method: "GET", url: "/api/v1/execution/resources/alphas/%E0%A4%A" });
    expect(answered.status).toBe(400);
    expect(JSON.parse(answered.text)).toEqual({ error: "FIXTURE_BAD_REQUEST" });
    expect(answered.headers.get("x-fixture-lane")).toBe("FIXTURE_LAB");
  });

  it("a write the doubles do not model on an unserved path is 404", async () => {
    const answered = await call(base, { method: "POST", url: "/api/v1/execution/governance/r2/capture", body: {} });
    expect(answered.status).toBe(404);
  });

  it("a command plan is the canonical BLOCKED answer, call after call, and echoes the key it was asked", async () => {
    const seen: unknown[] = [];
    for (let i = 0; i < 4; i += 1) seen.push(JSON.parse((await call(base, { method: "POST", url: "/api/v1/execution/commands/plans", body: { command_key: "account/sync" } })).text));
    for (const plan of seen) expect(plan).toEqual(seen[0]);
    expect(seen[0]).toMatchObject({ status: "BLOCKED", command_key: "account/sync", source_side_effect_requested: false });
  });

  it("FIXTURE_WRITES=refuse turns every write into 405", async () => {
    for (const url of ["/api/v1/execution/commands/plans", "/api/v1/execution/governance/approvals", "/api/v1/execution/operations/op_1/apply"]) {
      const answered = await call(refuseBase, { method: "POST", url, body: {} });
      expect(answered.status, url).toBe(405);
    }
    expect((await call(refuseBase, { method: "GET", url: "/api/v1/execution/alphas" })).status).toBe(200);
  });

  it("HEAD is GET without a body", async () => {
    const response = await fetch(`${base}/api/v1/execution/alphas`, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-fixture-lane")).toBe("FIXTURE_LAB");
    expect(await response.text()).toBe("");
  });

  it("refuses a body over 1 MiB with 413 and closes the connection", async () => {
    expect(MAX_BODY_BYTES).toBe(1024 * 1024);
    const port = Number(new URL(base).port);
    const reply = await new Promise<string>((done, fail) => {
      const socket = connect(port, "127.0.0.1", () => {
        // The declared length alone is enough: the server must not wait for the megabyte.
        socket.write(`POST /api/v1/execution/commands/plans HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: ${MAX_BODY_BYTES + 1}\r\n\r\n`);
      });
      let text = "";
      socket.on("data", (chunk) => { text += chunk.toString("utf8"); });
      socket.on("close", () => done(text));
      socket.on("error", fail);
      setTimeout(() => { socket.destroy(); done(text); }, 3000).unref();
    });
    expect(reply).toMatch(/^HTTP\/1\.1 413 /);
    expect(reply.toLowerCase()).toContain("x-fixture-lane: fixture_lab");
    expect(reply).toContain("FIXTURE_BODY_TOO_LARGE");
  });

  it("accepts a body at the limit and ignores one that is not JSON", async () => {
    const response = await fetch(`${base}/api/v1/execution/commands/plans`, { method: "POST", body: "not json", headers: { "content-type": "text/plain" } });
    expect(response.status).toBe(200);
  });
});

/* ── volume and honesty at the standalone scale ─────────────────────────── */

const json = async (origin: string, url: string): Promise<any> => JSON.parse((await call(origin, { method: "GET", url })).text);

describe("medium scale", () => {
  it("serves the counts the review asked for", async () => {
    const fleet = await json(base, "/api/v1/execution/alphas?limit=200");
    expect(fleet.summary.alpha_count).toBe(40);
    expect(fleet.page.rows).toHaveLength(40);
    expect(fleet.summary.deployment_count).toBeGreaterThanOrEqual(50);
    expect(fleet.summary.deployment_count).toBeLessThanOrEqual(80);

    const portfolios = await json(base, "/api/v1/execution/portfolios");
    expect(portfolios.items).toHaveLength(25);
    expect(portfolios.total_portfolios).toBe(25);
    expect(portfolios.truncated).toBe(false);

    let accounts = 0;
    for (const environment of ["live", "paper", "sandbox"]) {
      const page = await json(base, `/api/v1/execution/broker-bindings?environment=${environment}&limit=50`);
      accounts += page.page.total_count;
    }
    expect(accounts).toBe(80);

    const operations = await json(base, "/api/v1/execution/operations?limit=250");
    expect(operations.page.total_count).toBe(120);

    const approvals = await json(base, "/api/v1/execution/governance/approvals?limit=200");
    expect(approvals.page.total_count).toBe(30);

    const users = await json(base, "/api/admin/accounts");
    expect(users.accounts).toHaveLength(123);
  });

  it("walks 300 blotter orders over keyset pages without a repeat or a gap", async () => {
    const ids: string[] = [];
    let url = "/api/v1/execution/screens/blotter?limit=50";
    let pages = 0;
    for (;;) {
      const page = await json(base, url);
      pages += 1;
      for (const order of page.data.orders) ids.push(order.order_id);
      expect(page.data.exact_total).toBe(300);
      const next = page.data.page.next_cursor;
      if (next === null) break;
      url = `/api/v1/execution/screens/blotter?limit=50&after=${encodeURIComponent(next)}`;
    }
    expect(pages).toBe(6);
    expect(ids).toHaveLength(300);
    expect(new Set(ids).size).toBe(300);
  });

  it("keeps money exact, per currency, and null as null", async () => {
    const decimal = /^-?\d+(\.\d+)?$/;
    const fleet = await json(base, "/api/v1/execution/alphas?limit=200");
    const currencies = new Set<string>();
    for (const row of fleet.page.rows) {
      for (const dep of row.deployments) {
        for (const field of ["allocation", "balance_total", "balance_free", "balance_locked", "realized_pnl", "unrealized_pnl", "net_pnl", "exposure"]) {
          expect(dep[field], `${dep.deployment_id}.${field}`).toMatch(decimal);
          expect(dep[field]).not.toBe("-0.00");
        }
        currencies.add(dep.currency);
      }
      // One entry per currency in every per-currency list, and each total is the exact sum of its deployments.
      for (const key of ["allocations", "exposure"] as const) {
        const keys = row[key].map((entry: { currency: string }) => entry.currency);
        expect(new Set(keys).size, `${row.alpha_id}.${key}`).toBe(keys.length);
      }
      for (const entry of row.allocations) {
        const mine = row.deployments.filter((d: { currency: string }) => d.currency === entry.currency);
        const cents = mine.reduce((n: bigint, d: { allocation: string }) => n + BigInt(d.allocation.replace(".", "") + "0".repeat(2 - (d.allocation.split(".")[1] ?? "").length)), 0n);
        const want = BigInt(entry.value.replace(".", "") + "0".repeat(2 - (entry.value.split(".")[1] ?? "").length));
        expect(want, `${row.alpha_id} ${entry.currency}`).toBe(cents);
      }
    }
    // The scale world publishes USDT only (WP-4); the fleet summary lists each currency present on its own line.
    expect([...currencies]).toEqual(["USDT"]);
    expect(fleet.summary.allocation_by_currency.map((e: { currency: string }) => e.currency).sort()).toEqual([...currencies].sort());
    // A research-only alpha has no owner and no deployments: both stay empty, nothing is invented.
    const researchOnly = fleet.page.rows.filter((row: { health: string }) => row.health === "RESEARCH_ONLY");
    expect(researchOnly.length).toBeGreaterThan(0);
    expect(researchOnly.every((row: { deployments: unknown[] }) => row.deployments.length === 0)).toBe(true);
  });

  it("agrees with itself: a portfolio's book is the sum of the deployments the fleet shows for it", async () => {
    const fleet = await json(base, "/api/v1/execution/alphas?limit=200");
    const portfolios = await json(base, "/api/v1/execution/portfolios");
    const deployments = fleet.page.rows.flatMap((row: { deployments: any[] }) => row.deployments);
    for (const item of portfolios.items.filter((p: { portfolio_id: string }) => p.portfolio_id.startsWith("pf_scale_"))) {
      const mine = deployments.filter((d: { portfolio_id: string }) => d.portfolio_id === item.portfolio_id);
      expect(item.deployment_count, item.portfolio_id).toBe(mine.length);
      // A generated portfolio books deployments in its own base currency only.
      for (const d of mine) expect(d.currency, item.portfolio_id).toBe(item.base_currency);
      expect(item.allocated_by_currency.every((e: { currency: string }) => e.currency === item.base_currency)).toBe(true);
      expect(item.environments.length).toBeGreaterThan(0);
    }
  });

  it("varies the states a screen must keep apart", async () => {
    const fleet = await json(base, "/api/v1/execution/alphas?limit=200");
    expect(new Set(fleet.page.rows.map((r: { health: string }) => r.health))).toEqual(new Set(["READY", "ATTENTION", "RESEARCH_ONLY"]));
    expect(fleet.page.rows.some((r: { owner: unknown }) => r.owner === null)).toBe(true);

    const operations = await json(base, "/api/v1/execution/operations?limit=250");
    const sources = new Set(operations.page.rows.map((r: { source_status: string }) => r.source_status));
    for (const state of ["SUCCEEDED", "FAILED", "PENDING", "BLOCKED", "UNCERTAIN"]) expect(sources, state).toContain(state);

    const blotter = await json(base, "/api/v1/execution/screens/blotter?limit=200");
    expect(new Set(blotter.data.orders.map((o: { status: string }) => o.status))).toContain("REJECTED");
    expect(blotter.data.fills.some((f: { commission: unknown }) => f.commission === null)).toBe(true);

    const credentials = new Set<string>();
    for (const environment of ["live", "paper", "sandbox"]) {
      const page = await json(base, `/api/v1/execution/broker-bindings?environment=${environment}&limit=50`);
      for (const row of page.page.rows) credentials.add(row.credential_state);
    }
    for (const state of ["SYNC_SYNCED", "SYNC_STALE", "EXPIRED"]) expect(credentials, state).toContain(state);

    const approvals = await json(base, "/api/v1/execution/governance/approvals?limit=200");
    expect(approvals.counts.overdue).toBeGreaterThan(0);
  });

  it("answers the detail of a generated portfolio, account and alpha", async () => {
    const portfolios = await json(base, "/api/v1/execution/portfolios");
    const generated = portfolios.items.find((p: { portfolio_id: string; deployment_count: number }) => p.portfolio_id.startsWith("pf_scale_") && p.deployment_count > 0);
    expect(generated).toBeTruthy();
    expect((await call(base, { method: "GET", url: `/api/v1/execution/resources/portfolios/${generated.portfolio_id}` })).status).toBe(200);
    for (const environment of generated.environments) {
      expect((await call(base, { method: "GET", url: `/api/v1/execution/derivations/portfolios/${generated.portfolio_id}/capital?environment=${environment}` })).status).toBe(200);
    }
    const bindings = await json(base, "/api/v1/execution/broker-bindings?environment=live&limit=50");
    const account = bindings.page.rows.find((b: { account_id: string }) => b.account_id.startsWith("acc_scale_"));
    expect((await call(base, { method: "GET", url: `/api/v1/execution/resources/accounts/${account.account_id}` })).status).toBe(200);
    expect((await call(base, { method: "GET", url: `/api/v1/execution/broker-bindings/${encodeURIComponent(account.binding_id)}?environment=live` })).status).toBe(200);
    expect((await call(base, { method: "GET", url: "/api/v1/execution/resources/alphas/alpha_scale_001" })).status).toBe(200);
  });
});

/* ── configuration ──────────────────────────────────────────────────────── */

describe("configuration", () => {
  it("has the defaults the lane promises", () => {
    const config = loadConfig({});
    expect(config).toMatchObject({ port: 4100, host: "0.0.0.0", laneLabel: "FIXTURE_LAB", scale: "medium", nowIso: "2026-08-22T13:00:00Z", writes: "doubles" });
  });

  it.each([
    [{ PORT: "70000" }, /PORT/],
    [{ PORT: "abc" }, /PORT/],
    [{ FIXTURE_SCALE: "huge" }, /FIXTURE_SCALE/],
    [{ FIXTURE_NOW_ISO: "yesterday" }, /FIXTURE_NOW_ISO/],
    [{ FIXTURE_LANE_LABEL: "ACCEPTANCE" }, /FIXTURE_LANE_LABEL/],
    [{ FIXTURE_WRITES: "yes" }, /FIXTURE_WRITES/],
    [{ FIXTURE_VARIANTS: "{" }, /FIXTURE_VARIANTS/],
    [{ FIXTURE_VARIANTS: '{"overview":{"blotter":"bogus"}}' }, /FIXTURE_VARIANTS/],
    [{ FIXTURE_VARIANTS: '{"users":"bogus"}' }, /FIXTURE_VARIANTS/],
  ])("refuses %j", (env, message) => {
    expect(() => loadConfig(env)).toThrow(ConfigError);
    expect(() => loadConfig(env)).toThrow(message);
  });

  it("accepts a lane label that still starts FIXTURE_LAB, and known variants", () => {
    expect(loadConfig({ FIXTURE_LANE_LABEL: "FIXTURE_LAB/preview-a" }).laneLabel).toBe("FIXTURE_LAB/preview-a");
    expect(loadConfig({ FIXTURE_VARIANTS: '{"overview":{"blotter":"stale","admin":"partial"},"users":"verified"}' })).toMatchObject({ overview: { blotter: "stale", admin: "partial" }, users: "verified" });
  });
});
