// @vitest-environment node
/** WP-P: one world clock. Rebased like the preview (FIXTURE_REBASE_TIME=1), no served body carries an instant later than now, except under a deadline key. */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";
import { futureInstants, latestContentInstant, rebaseBody, worldClockNow } from "../../../fixture-bff/time-rebase";

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
    expect(shifted.read_at).toBe("2026-10-22T13:00:00.000Z");
  });
  it("content far beyond the window (a ceiling that is not named like one) is not taken for the present", () => {
    const body = { read_at: "2026-10-17T12:00:00.000Z", note_at: "2028-01-01T00:00:00Z" };
    expect(latestContentInstant(body, Date.parse(body.read_at))).toBe(Date.parse(body.read_at));
  });
});

describe("the preview clock moves by whole days only", () => {
  it("two loads minutes apart in one world day are byte-identical; the next day shifts every instant by exactly one day", () => {
    const body = { read_at: "2026-10-17T12:04:00.000Z", items: [{ at: "2026-10-16T08:00:00Z" }, { ts_ms: Date.parse("2026-10-17T12:03:00Z") }] };
    const a = JSON.stringify(rebaseBody(body, "2026-08-22T13:00:00Z", Date.parse("2026-10-23T08:01:00Z")));
    const b = JSON.stringify(rebaseBody(body, "2026-08-22T13:00:00Z", Date.parse("2026-10-23T11:58:00Z")));
    expect(a).toBe(b);
    const next = rebaseBody(body, "2026-08-22T13:00:00Z", Date.parse("2026-10-24T08:00:00Z")) as typeof body;
    const prev = JSON.parse(a) as typeof body;
    expect(Date.parse(next.read_at) - Date.parse(prev.read_at)).toBe(86_400_000);
    expect(Date.parse(String(next.items[0]!.at)) - Date.parse(String(prev.items[0]!.at))).toBe(86_400_000);
  });
  it("never states a now later than the real clock", () => {
    for (const real of ["2026-10-17T12:04:00Z", "2026-10-18T03:00:00Z", "2026-12-31T23:59:00Z"]) {
      expect(worldClockNow(Date.parse(real))).toBeLessThanOrEqual(Date.parse(real));
    }
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
  it.each([["dep_canary_01", "canary"], ["dep_live_01", "live"], ["dep_live_01_stale", "live"], ["dep_canary_01_stale", "canary"]])(
    "%s (%s): no series point is newer than the stamp that stamps it, and a stale body never draws past its stale stamp", async (id, kind) => {
      const response = await fetch(`${base}${E}/deployments/${id}/${kind}`);
      expect(response.status).toBe(200);
      const body = await response.json();
      const points = body.series?.points as { t: string }[] | undefined;
      expect(points?.length).toBeGreaterThan(2);
      const last = Date.parse(points!.at(-1)!.t);
      expect(last).toBeLessThanOrEqual(Date.parse(body.series.envelope.as_of));
      if (id.endsWith("_stale")) {
        const stamps = (Array.isArray(body.kpis) ? body.kpis : []).map((entry: { envelope?: { as_of?: string } }) => entry.envelope?.as_of).filter(Boolean) as string[];
        for (const stamp of stamps) expect(last).toBeLessThanOrEqual(Date.parse(stamp));
      }
    });

  it.each(routes)("%s carries no instant later than now (deadlines excepted)", async (route) => {
    const response = await fetch(`${base}${route}`);
    if (response.status !== 200) return; // a route this lane does not serve under that query is the walker's business
    const body = await response.json();
    expect(futureInstants(body, Date.now() + 60_000).slice(0, 5)).toEqual([]);
  });
});
