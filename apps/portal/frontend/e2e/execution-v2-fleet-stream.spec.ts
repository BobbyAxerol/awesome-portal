/**
 * ELP2-09 browser receipt: the Fleet STREAM chip (flag key `fleet-stream`) in a real Chromium.
 *
 * Lane: FIXTURE_LAB. The fixture double (`bffDoubleManager.ts`, `answerManagerFleetRealtime`) serves the barrier and a FINITE event stream
 * (a fixture lane keeps no connection), chosen by `workspace_id=ws_TEST_FLEET_RT_*`. This is NOT evidence about a real source, a real
 * cursor, a real revocation or a real held connection: it shows what THIS adapter and chip do with the published synthetic bytes.
 * Run with `playwright.fleet-stream.config.ts` (its own build with the key on, port 4177; project chromium-v2, host Chromium).
 *
 * States asserted: Live, Paused (hidden tab, and a drop before the resume), Stopped with its reason (revoked, bounded resyncs, reconnect
 * limit, no stream offered with each finite code), Start over, and the teardown when the lens leaves the scope. Every case also holds
 * a clean console and no foreign origin, and that the table is never taken away by a stream state.
 */
import { expect, test, type Page } from "@playwright/test";

import { stubExecutionBff } from "./bffDouble";
import {
  FLEET_REALTIME_DOUBLE_WORKSPACES as WS, FLEET_REALTIME_FIXTURE_TOKEN, MANAGER_FLEET_REALTIME_SNAPSHOT_ROUTE, MANAGER_FLEET_REALTIME_STREAM_ROUTE, answerManagerFleetRealtime,
} from "./bffDoubleManager";
import { stubPortalApi, usePreferences } from "./fixtures";
import { stubAdminRoutes, stubQuantbtRuns, watchPage } from "./v2Lane";

const SNAPSHOT = "/api/v1/execution/manager/fleet/realtime-snapshot";
const STREAM = "/api/v1/execution/manager/fleet/stream";

interface Traffic {
  snapshots: URLSearchParams[];
  streams: URLSearchParams[];
}

/**
 * The Fleet route does not pass `workspace_id` to the screen, and the double picks its variant by that parameter. So the variant is asked
 * of the double's own answerer here, for the two realtime routes only, and the barrier keeps the lineage the default read carries (the
 * table on screen is the default workspace's): a variant changes what the stream does, never whether the barrier pairs.
 */
async function useVariant(page: Page, workspace: string): Promise<void> {
  const answer = (route: string, search: URLSearchParams, variant: string | null) => {
    const params = new URLSearchParams(search);
    params.delete("workspace_id");
    if (variant !== null) params.set("workspace_id", variant);
    const reply = answerManagerFleetRealtime("GET", route, params);
    if (reply === null) throw new Error(`the double does not answer ${route}`);
    return reply;
  };
  await page.route("**/api/v1/execution/manager/fleet/realtime-snapshot*", (route) => {
    const search = new URL(route.request().url()).searchParams;
    const base = answer(MANAGER_FLEET_REALTIME_SNAPSHOT_ROUTE, search, null).body as { workspace_id: string; named_snapshot: { lineage_revision: string } };
    const reply = answer(MANAGER_FLEET_REALTIME_SNAPSHOT_ROUTE, search, workspace);
    const body = reply.body as typeof base;
    body.workspace_id = base.workspace_id;
    body.named_snapshot.lineage_revision = base.named_snapshot.lineage_revision;
    return route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/api/v1/execution/manager/fleet/stream*", (route) => {
    const reply = answer(MANAGER_FLEET_REALTIME_STREAM_ROUTE, new URL(route.request().url()).searchParams, workspace);
    return route.fulfill({ status: reply.status, contentType: reply.contentType ?? "text/event-stream", body: String(reply.body) });
  });
}

async function open(page: Page, workspace: string | null, viewport = { width: 1280, height: 900 }, beforeGoto?: () => Promise<void>): Promise<Traffic> {
  // No frozen clock here (unlike the screenshot specs): the machine's coalescing window and the adapter's reconnect window read Date.now().
  await page.setViewportSize(viewport);
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
  if (workspace !== null) await useVariant(page, workspace);
  const traffic: Traffic = { snapshots: [], streams: [] };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === SNAPSHOT) traffic.snapshots.push(url.searchParams);
    if (url.pathname === STREAM) traffic.streams.push(url.searchParams);
  });
  // Every state the chip passes through, in order, however briefly: the double's stream is finite, so a held state is not on offer.
  await page.addInitScript(() => {
    const log: string[] = [];
    (window as unknown as { __chip: string[] }).__chip = log;
    const read = () => {
      const el = document.querySelector('[data-testid="fleet-stream"]');
      const value = el === null ? "none" : (el.getAttribute("data-state") ?? "none");
      if (log[log.length - 1] !== value) log.push(value);
    };
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver(read).observe(document.body, { subtree: true, childList: true, attributes: true });
      read();
    });
  });
  await beforeGoto?.();
  await page.goto("/deployments/alphas?stage=paper");
  await expect(page.getByRole("table", { name: "Alpha fleet" })).toBeVisible();
  return traffic;
}

const chip = (page: Page) => page.getByTestId("fleet-stream");
const seen = (page: Page) => page.evaluate(() => (window as unknown as { __chip: string[] }).__chip);
/** The chip said Live at some moment: the double's body is finite, so Live is a moment and not a place to wait in. */
const wasLive = (page: Page) => expect.poll(async () => (await seen(page)).includes("live"), { timeout: 10_000 }).toBe(true);
const why = (page: Page) => page.getByRole("button", { name: /^Why the stream is (stopped|paused)$/ });
const table = (page: Page) => page.getByRole("table", { name: "Alpha fleet" });
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function reasons(page: Page): Promise<string> {
  await why(page).click();
  return (await page.locator(".exec-blk-why-body").first().innerText()).replace(/\s+/g, " ").trim();
}

test.describe("FIXTURE_LAB · Fleet STREAM chip", () => {
  test("Live, then a drop is Paused and resumes with the last cursor; the console stays clean", async ({ page, baseURL }) => {
    const watch = watchPage(page, baseURL);
    const traffic = await open(page, null);
    await wasLive(page);
    // The barrier was read once for the scope; the stream opened at the barrier's cursor; the table was paired, not re-read.
    expect(traffic.snapshots[0]!.get("environment")).toBe("paper");
    expect(traffic.streams[0]!.get("cursor")).toBe(FLEET_REALTIME_FIXTURE_TOKEN);
    expect(traffic.streams[0]!.get("environment")).toBe("paper");
    // The double's finite body ends after a heartbeat: the adapter resumes with the cursor that heartbeat carried.
    await expect.poll(() => traffic.streams.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    expect(traffic.streams[1]!.get("cursor")).toBe(FLEET_REALTIME_FIXTURE_TOKEN);
    await expect.poll(async () => (await seen(page)).includes("paused"), { timeout: 10_000 }).toBe(true);
    expect(await seen(page)).toEqual(expect.arrayContaining(["live"]));
    await expect(table(page)).toBeVisible();
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(watch.foreign).toEqual([]);
    expect(watch.take()).toEqual([]);
  });

  test("a stream closed over and over stops at Too many reconnects; Start over gives it another go", async ({ page, baseURL }) => {
    const watch = watchPage(page, baseURL);
    const traffic = await open(page, null);
    await expect(chip(page)).toHaveAttribute("data-state", "stopped", { timeout: 30_000 });
    await expect(chip(page)).toContainText("Stopped");
    expect(await reasons(page)).toBe("Too many reconnects. RECONNECT_LIMIT Nothing is retrying by itself; retry when ready.");
    const frozen = traffic.streams.length;
    expect(frozen).toBeGreaterThanOrEqual(8);
    await page.waitForTimeout(2_500);
    expect(traffic.streams.length).toBe(frozen);
    await expect(table(page)).toBeVisible();
    const barriers = traffic.snapshots.length;
    await page.getByRole("button", { name: "Start over" }).click();
    await expect.poll(() => traffic.snapshots.length).toBeGreaterThan(barriers);
    await expect.poll(async () => (await seen(page)).filter((state) => state === "live").length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    expect(watch.take()).toEqual([]);
  });

  test("access_revoked is terminal: Stopped, no Start over, one stream request, the table stays (READ is its own authority)", async ({ page, baseURL }) => {
    const watch = watchPage(page, baseURL);
    const traffic = await open(page, WS.revoked);
    await expect(chip(page)).toHaveAttribute("data-state", "stopped");
    expect(await reasons(page)).toBe("Your access to this scope changed. ACCESS_CHANGED Sign in again or request access.");
    await expect(page.getByRole("button", { name: "Start over" })).toHaveCount(0);
    await page.waitForTimeout(2_000);
    expect(traffic.streams).toHaveLength(1);
    await expect(table(page)).toBeVisible();
    // the connection was Live for the moment before the frame; after the revoke it never is again
    const log = await seen(page);
    expect(log[log.length - 1]).toBe("stopped");
    expect(log.slice(log.indexOf("stopped"))).toEqual(["stopped"]);
    expect(watch.take()).toEqual([]);
  });

  test("a notice with an unchanged head re-reads the barrier and nothing else", async ({ page, baseURL }) => {
    const watch = watchPage(page, baseURL);
    const traffic = await open(page, WS.revalidate);
    await wasLive(page);
    await expect.poll(() => traffic.snapshots.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
    await expect(table(page)).toBeVisible();
    expect(watch.take()).toEqual([]);
  });

  for (const [name, workspace, sentence] of [
    ["resync (generation changed)", WS.resync, "Too many resyncs in a short time; stopped."],
    ["slow client", WS.slow, "Too many resyncs in a short time; stopped."],
  ] as const) {
    test(`${name}: resyncs are bounded, then Stopped with Start over and no more requests`, async ({ page, baseURL }) => {
      const watch = watchPage(page, baseURL);
      const traffic = await open(page, workspace);
      await expect(chip(page)).toHaveAttribute("data-state", "stopped", { timeout: 30_000 });
      expect((await reasons(page)).startsWith(sentence)).toBe(true);
      await expect(page.getByRole("button", { name: "Start over" })).toBeVisible();
      // the first connection plus three automatic resyncs, each from a fresh barrier
      const settled = traffic.streams.length;
      expect(settled).toBe(4);
      await page.waitForTimeout(2_500);
      expect(traffic.streams).toHaveLength(settled);
      await expect(table(page)).toBeVisible();
      expect(watch.take()).toEqual([]);
    });
  }

  for (const [name, workspace, code] of [
    ["a partial viewer", WS.partial, "WHOLE_FLEET_AUTHORITY_REQUIRED"],
    ["stream authority not granted", WS.notGranted, "STREAM_AUTHORITY_NOT_GRANTED"],
    ["capacity reached", WS.capacity, "STREAM_CAPACITY_REACHED"],
  ] as const) {
    test(`${name}: no stream is opened, the table is untouched, the chip says there is none (${code})`, async ({ page, baseURL }) => {
      const watch = watchPage(page, baseURL);
      const traffic = await open(page, workspace);
      await expect(chip(page)).toHaveAttribute("data-state", "stopped");
      expect(await reasons(page)).toBe(`This read has no live stream behind it. ${code} Nothing is retrying by itself; retry when ready.`);
      await page.waitForTimeout(2_000);
      expect(traffic.streams).toHaveLength(0);
      expect(traffic.snapshots).toHaveLength(1);
      await expect(table(page)).toBeVisible();
      expect(watch.take()).toEqual([]);
    });
  }

  test("a hidden tab pauses the chip and opens nothing; coming back resumes with the cursor", async ({ page, baseURL }) => {
    const watch = watchPage(page, baseURL);
    const traffic = await open(page, WS.revalidate);
    await wasLive(page);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(chip(page)).toHaveAttribute("data-state", "paused");
    const frozen = { streams: traffic.streams.length, snapshots: traffic.snapshots.length };
    await page.waitForTimeout(3_000);
    expect({ streams: traffic.streams.length, snapshots: traffic.snapshots.length }).toEqual(frozen);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => traffic.streams.length).toBeGreaterThan(frozen.streams);
    expect(traffic.streams[frozen.streams]!.get("cursor")).toBe(FLEET_REALTIME_FIXTURE_TOKEN);
    await expect(chip(page)).toHaveAttribute("data-state", /live|paused/);
    expect(watch.take()).toEqual([]);
  });

  test("leaving the scope (the All lens) closes the stream and removes the chip; nothing more is requested", async ({ page, baseURL }) => {
    const watch = watchPage(page, baseURL);
    const traffic = await open(page, WS.revalidate);
    await wasLive(page);
    await page.getByRole("tab", { name: /^All/ }).click();
    await expect(chip(page)).toHaveCount(0);
    await page.waitForTimeout(500);
    const frozen = { streams: traffic.streams.length, snapshots: traffic.snapshots.length };
    await page.waitForTimeout(3_000);
    expect({ streams: traffic.streams.length, snapshots: traffic.snapshots.length }).toEqual(frozen);
    expect(watch.take()).toEqual([]);
  });

  test("leaving the scope while the barrier is still out cancels the request (nothing is left orphaned) and opens no stream", async ({ page, baseURL }) => {
    const watch = watchPage(page, baseURL);
    const failed: string[] = [];
    page.on("requestfailed", (request) => failed.push(`${new URL(request.url()).pathname} ${request.failure()?.errorText ?? ""}`));
    // The double answers at once; hold the barrier so it is genuinely in flight when the lens changes.
    const traffic = await open(page, null, { width: 1280, height: 900 }, async () => {
      await page.route("**/api/v1/execution/manager/fleet/realtime-snapshot*", async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await route.fallback().catch(() => undefined);
      });
    });
    await expect.poll(() => traffic.snapshots.length).toBe(1);
    await page.getByRole("tab", { name: /^All/ }).click();
    await expect.poll(() => failed.some((line) => line.startsWith(SNAPSHOT) && /ABORTED/.test(line)), { timeout: 5_000 }).toBe(true);
    await page.waitForTimeout(4_000);
    expect(traffic.streams).toHaveLength(0);
    expect(traffic.snapshots).toHaveLength(1);
    await expect(chip(page)).toHaveCount(0);
    await expect(table(page)).toBeVisible();
    expect(watch.take().filter((line) => !/ERR_ABORTED/.test(line))).toEqual([]);
  });

  test("660px: the chip fits, nothing overflows", async ({ page, baseURL }) => {
    const watch = watchPage(page, baseURL);
    await open(page, WS.notGranted, { width: 660, height: 900 });
    await expect(chip(page)).toHaveAttribute("data-state", "stopped");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(watch.take()).toEqual([]);
  });
});
