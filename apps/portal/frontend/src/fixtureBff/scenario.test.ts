// @vitest-environment node
/** WP-P: the fixture scenario selector (FIXTURE_SCENARIO, GET/POST /__fixture/scenario). In memory, lane-internal, deterministic reset. */
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConfigError, createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { reviewCatalog, reviewHtml } from "../../../fixture-bff/review-catalog";
import { DEFAULT_SCENARIO, FIXTURE_SCENARIOS, getScenario, isFixtureScenario, resetScenario, setScenario } from "../../../fixture-bff/scenario";
import { scenarioVariants } from "../../../fixture-bff/scenario-apply";

describe("the scenario list", () => {
  it("defaults to positive and names the eight scenarios of the directive", () => {
    expect(DEFAULT_SCENARIO).toBe("positive");
    expect([...FIXTURE_SCENARIOS]).toEqual(["positive", "partial", "stale", "denied", "empty", "missing", "zero", "dense"]);
    expect(isFixtureScenario("stale")).toBe(true);
    expect(isFixtureScenario("production")).toBe(false);
  });
  it("loadConfig reads FIXTURE_SCENARIO, defaults to positive and rejects a misspelling", () => {
    expect(loadConfig({}).scenario).toBe("positive");
    for (const scenario of FIXTURE_SCENARIOS) expect(loadConfig({ FIXTURE_SCENARIO: scenario }).scenario).toBe(scenario);
    expect(() => loadConfig({ FIXTURE_SCENARIO: "worst-case" })).toThrow(ConfigError);
  });
  it("selects the doubles' own negative variants only for the scenarios that mean them", () => {
    expect(scenarioVariants("positive")).toEqual({ overview: {}, users: "paged" });
    expect(scenarioVariants("denied")).toMatchObject({ overview: { blotter: "denied", admin: "denied" }, users: "denied" });
    expect(scenarioVariants("stale").overview).toMatchObject({ commandCenter: "stale", blotter: "stale" });
    expect(scenarioVariants("empty")).toMatchObject({ overview: { blotter: "empty" }, users: "empty" });
    expect(scenarioVariants("missing").overview.commandCenter).toBe("feed-unavailable");
    expect(scenarioVariants("partial").overview.commandCenter).toBe("partial");
  });
  it("the harness page and the catalog name the active scenario without a script or a form", () => {
    const html = reviewHtml("populated", "medium", "stale");
    expect(html).toContain("stale (active)");
    expect(html).toContain('href="/__fixture/scenario?set=positive"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<form");
    expect(reviewCatalog("populated", "medium", "denied")).toMatchObject({ scenario: "denied", scenarios: FIXTURE_SCENARIOS });
  });
});

describe("the selector over HTTP", () => {
  let server: Server;
  let base = "";
  const post = (body: unknown) => fetch(`${base}/__fixture/scenario`, { method: "POST", body: JSON.stringify(body) });
  beforeAll(async () => {
    server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_WRITES: "refuse" }));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(async () => { await post({ reset: true }); });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    resetFixtureGlobals();
    resetScenario();
  });

  it("reports positive at start, on the lane route, the header and the scenario route", async () => {
    const lane = await fetch(`${base}/__fixture/lane`);
    expect(lane.headers.get("x-fixture-scenario")).toBe("positive");
    expect(await lane.json()).toMatchObject({ scenario: "positive", configured_scenario: "positive" });
    const body = await fetch(`${base}/__fixture/scenario`).then((response) => response.json());
    expect(body).toMatchObject({ scenario: "positive", default_scenario: "positive", persistence: "NONE", not_acceptance: true });
    expect(body.scenarios.map((entry: { id: string }) => entry.id)).toEqual([...FIXTURE_SCENARIOS]);
  });

  it("switches in memory (POST and the harness link), even though FIXTURE_WRITES=refuse refuses product writes", async () => {
    expect(await post({ scenario: "stale" }).then((response) => response.status)).toBe(200);
    expect(getScenario()).toBe("stale");
    expect((await fetch(`${base}/__fixture/lane`)).headers.get("x-fixture-scenario")).toBe("stale");
    expect(await fetch(`${base}/__fixture/scenario?set=denied`).then((response) => response.json())).toMatchObject({ scenario: "denied" });
    // a product write is still refused
    expect((await fetch(`${base}/api/v1/execution/commands/plans`, { method: "POST", body: "{}" })).status).toBe(405);
  });

  it("refuses an unknown scenario and other methods; nothing changes", async () => {
    await post({ scenario: "dense" });
    const bad = await post({ scenario: "chaos" });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "FIXTURE_SCENARIO_UNKNOWN" });
    expect((await fetch(`${base}/__fixture/scenario?set=chaos`)).status).toBe(400);
    expect(getScenario()).toBe("dense");
    expect((await fetch(`${base}/__fixture/scenario`, { method: "DELETE" })).status).toBe(405);
  });

  it("resets deterministically to the configured scenario", async () => {
    await post({ scenario: "missing" });
    const reset = await post({ reset: true }).then((response) => response.json());
    expect(reset.scenario).toBe("positive");
    setScenario("zero");
    expect(resetScenario()).toBe("positive");
  });

  it("the doubles follow the scenario: denied answers the roster 403, reset brings it back", async () => {
    await post({ scenario: "denied" });
    expect((await fetch(`${base}/api/admin/accounts`)).status).toBe(403);
    await post({ reset: true });
    expect((await fetch(`${base}/api/admin/accounts`)).status).toBe(200);
  });
});

describe("the value-rewrite scenarios", () => {
  it("zero: every AVAILABLE money, percent and ratio figure is an exact 0 and stays AVAILABLE; series points are 0; scores are untouched", async () => {
    const server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCENARIO: "zero" }));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const fleet = await fetch(`${base}/api/v1/execution/manager/fleet?environment=live&limit=20`).then((response) => response.json());
      const metrics = fleet.items[0].economic_partitions[0].metrics;
      expect(metrics.net_pnl).toMatchObject({ availability: "AVAILABLE", value: "0" });
      expect(metrics.allocation).toMatchObject({ availability: "AVAILABLE", value: "0" });
      expect(metrics.score.value).not.toBe("0");
      const series = await fetch(`${base}/api/v1/execution/manager/series?environment=live&metric=NET_PNL&window=%2230D%22&subjects=${encodeURIComponent(JSON.stringify([{ subject_type: "FUND" }]))}`).then((response) => response.json());
      expect(series.series[0].points.every((point: { value: string }) => point.value === "0")).toBe(true);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      resetFixtureGlobals();
      resetScenario();
    }
  });
  it("dense: display names are the long layout-stress names", async () => {
    const server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCENARIO: "dense" }));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const fleet = await fetch(`${base}/api/v1/execution/manager/fleet?environment=live&limit=5`).then((response) => response.json());
      expect(String(fleet.items[0].name).length).toBeGreaterThan(80);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      resetFixtureGlobals();
      resetScenario();
    }
  });
});

describe("the legacy lane ignores the scenario", () => {
  it("sparse-realistic keeps the doubles' defaults whatever is selected", async () => {
    const server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1" }));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const body = await fetch(`${base}/__fixture/scenario`, { method: "POST", body: JSON.stringify({ scenario: "denied" }) }).then((response) => response.json());
      expect(body.legacy_profile_ignores_scenario).toBe(true);
      expect((await fetch(`${base}/api/admin/accounts`)).status).toBe(200);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      resetFixtureGlobals();
      resetScenario();
    }
  });
});
