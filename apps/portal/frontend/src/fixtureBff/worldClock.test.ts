// @vitest-environment node
/** WP-P: one world clock. Rebased like the preview (FIXTURE_REBASE_TIME=1), no served body carries an instant later than now, except under a deadline key. */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";
import { futureInstants, latestContentInstant, rebaseBody } from "../../../fixture-bff/time-rebase";

const NOW = Date.parse("2026-10-23T12:00:00Z");

describe("rebaseBody anchors on the latest content instant, not only on read_at", () => {
  it("content written against a later clock than its envelope does not land in the future", () => {
    const body = { read_at: "2026-10-17T12:00:00.000Z", items: [{ at: "2026-12-18T09:13:00Z" }, { at_ms: Date.parse("2026-12-16T00:00:00Z") }], due_at: "2027-01-30T00:00:00Z" };
    const shifted = rebaseBody(body, "2026-08-22T13:00:00Z", NOW);
    expect(futureInstants(shifted, NOW + 60_000)).toEqual([]);
    // the distance between instants is kept, and a deadline stays ahead
    const d = shifted as { items: { at: string; at_ms: number }[]; due_at: string };
    expect(Date.parse(d.items[0]!.at) - Date.parse(new Date(d.items[1]!.at_ms).toISOString())).toBe(Date.parse("2026-12-18T09:13:00Z") - Date.parse("2026-12-16T00:00:00Z"));
    expect(Date.parse(d.due_at)).toBeGreaterThan(NOW);
  });
  it("a body whose content stays at or before its read time moves exactly as before", () => {
    const body = { read_at: "2026-10-17T12:00:00.000Z", points: [{ ts_ms: Date.parse("2026-10-16T00:00:00Z") }] };
    expect(latestContentInstant(body, Date.parse(body.read_at))).toBe(Date.parse(body.read_at));
    const shifted = rebaseBody(body, "2026-08-22T13:00:00Z", NOW) as typeof body;
    expect(shifted.read_at).toBe("2026-10-23T12:00:00.000Z");
  });
  it("content far beyond the window (a ceiling that is not named like one) is not taken for the present", () => {
    const body = { read_at: "2026-10-17T12:00:00.000Z", note_at: "2028-01-01T00:00:00Z" };
    expect(latestContentInstant(body, Date.parse(body.read_at))).toBe(Date.parse(body.read_at));
  });
});

describe("the served world has one clock", () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "medium", FIXTURE_REBASE_TIME: "1" }));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    resetFixtureGlobals();
    resetScenario();
  });
  const E = "/api/v1/execution";
  const routes = [
    `${E}/manager/fund-overview?environment=live`, `${E}/manager/fleet?environment=ALL&limit=50`, `${E}/portfolios`,
    `${E}/resources/accounts/acc_bnc_core`, `${E}/resources/alphas/alpha_btc_trend`, `${E}/views/equity-chart?portfolio_id=pf_TEST_ONLY_core&environment=live`,
    `${E}/screens/blotter?environment=live`, `${E}/operations`, `${E}/deployments/dep_paper_01/paper`, `${E}/deployments/dep_sandbox_01/sandbox`,
    `${E}/deployments/dep_live_01/live`, `${E}/governance/approvals`, `${E}/operations/audit`,
  ];
  it.each(routes)("%s carries no instant later than now (deadlines excepted)", async (route) => {
    const response = await fetch(`${base}${route}`);
    if (response.status !== 200) return; // a route this lane does not serve under that query is the walker's business
    const body = await response.json();
    expect(futureInstants(body, Date.now() + 60_000).slice(0, 5)).toEqual([]);
  });
});
