// @vitest-environment node
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConfigError, createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { REVIEW_PROFILES, REVIEW_SCREENS, reviewCatalog, reviewHtml } from "../../../fixture-bff/review-catalog";

describe("explicit fixture review catalog", () => {
  it("is opt-in and rejects misspellings, not silently a fake successful real lane", () => {
    expect(loadConfig({}).reviewProfile).toBe("sparse-realistic");
    for (const profile of REVIEW_PROFILES) expect(loadConfig({ FIXTURE_REVIEW_PROFILE: profile }).reviewProfile).toBe(profile);
    expect(() => loadConfig({ FIXTURE_REVIEW_PROFILE: "production" })).toThrow(ConfigError);
  });
  it("has unique local screens and explicit non-acceptance/removal/absence boundaries", () => {
    const catalog = reviewCatalog("layout-stress", "large");
    expect(catalog).toMatchObject({ lane: "FIXTURE_LAB", not_acceptance: true, real_api_fallback: false, persistence: "NONE" });
    expect(new Set(REVIEW_SCREENS.map(([id]) => id)).size).toBe(REVIEW_SCREENS.length);
    expect(REVIEW_SCREENS.length).toBeGreaterThanOrEqual(25);
    expect(REVIEW_SCREENS.every(([, href]) => href.startsWith("/") && !href.startsWith("//"))).toBe(true);
    expect(catalog.states.map((state) => state.expect)).toContain("DENIED");
    expect(catalog.states.map((state) => state.expect)).toContain("UNAVAILABLE");
    expect(catalog.remove).toContain("No data migration");
  });
  it("renders only an escaped no-script index, not a replacement UI", () => {
    const html = reviewHtml("populated", '<script>alert("x")</script>');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<form");
    expect(html).toContain("not real Edge data");
  });
});

describe("review HTTP boundary", () => {
  let server: Server;
  let base = "";
  beforeAll(async () => {
    server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_SCALE: "large",
      FIXTURE_WRITES: "refuse", FIXTURE_REVIEW_PROFILE: "layout-stress" }));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    resetFixtureGlobals();
  });
  it("labels catalog, API and errors with the same active fixture profile", async () => {
    for (const path of ["/__fixture/review", "/__fixture/lane", "/api/v1/execution/alphas", "/no-real-fallback"]) {
      const response = await fetch(`${base}${path}`);
      expect(response.headers.get("x-fixture-lane")).toBe("FIXTURE_LAB");
      expect(response.headers.get("x-fixture-profile")).toBe("layout-stress");
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    const lane = await fetch(`${base}/__fixture/lane`).then((response) => response.json());
    expect(lane).toMatchObject({ review_profile: "layout-stress", real_api_fallback: false });
  });
  it("serves a locked-down HTML index, and rejects every write", async () => {
    const html = await fetch(`${base}/__fixture/review.html`);
    expect(html.headers.get("content-type")).toContain("text/html");
    expect(html.headers.get("content-security-policy")).toContain("default-src 'none'");
    for (const path of ["/__fixture/review", "/__fixture/review.html", "/api/v1/execution/commands/plans"]) {
      const response = await fetch(`${base}${path}`, { method: "POST", body: "{}" });
      expect(response.status).toBe(405);
      expect(await response.json()).toEqual({ error: "FIXTURE_METHOD_NOT_ALLOWED" });
    }
  });
  it("keeps unknown routes refused instead of falling back to a real API", async () => {
    const response = await fetch(`${base}/api/v1/execution/not-a-fixture`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "FIXTURE_ROUTE_NOT_SERVED" });
  });
});
