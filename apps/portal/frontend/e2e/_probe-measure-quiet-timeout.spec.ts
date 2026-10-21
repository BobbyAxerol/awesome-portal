/**
 * Bounded harness check for the meter's quiet gate on the Workbench screen (BE-P19 / Codex review 2026-10-21, change 1).
 * The pure rules are unit-tested with controlled time in scripts/measure/measure.test.mjs; this spec only proves the wiring of the real
 * meter: a request that never answers, and recurring requests, end in MEASUREMENT_QUIET_TIMEOUT (short injected cap), and a settled
 * Workbench is genuinely quiet. FIXTURE_LAB / BFF_DOUBLE; not a measurement, writes no receipt.
 *
 * Skipped unless QUIET_CHECK=1:  QUIET_CHECK=1 MEASURE_SKIP_BUILD=1 npx playwright test -c playwright.measure.config.ts --workers=1 _probe-measure-quiet-timeout
 */
import { expect, test } from "@playwright/test";

import { meter, openMeasureLane, ready } from "./measureLane";
import { SCREENS } from "./v2Lane";

test.skip(process.env.QUIET_CHECK !== "1", "QUIET_CHECK is not set");

const [, route, root] = SCREENS.find(([name]) => name === "workbench")!;
const CAP_MS = 1_500;

async function openWorkbench(page: import("@playwright/test").Page, baseURL: string | undefined) {
  await openMeasureLane(page);
  const net = meter(page, baseURL, { quietCapMs: CAP_MS });
  await page.goto(route);
  await ready(page, root);
  return net;
}

test("quiet · workbench settles and is genuinely quiet", async ({ page, baseURL }) => {
  const net = await openWorkbench(page, baseURL);
  await net.quiet();
  const snap = await net.snap();
  expect(snap.foreign).toBe(0);
  expect(snap.api).toBeGreaterThan(0);
});

test("quiet · a request that never answers is MEASUREMENT_QUIET_TIMEOUT, not a normal return", async ({ page, baseURL }) => {
  const net = await openWorkbench(page, baseURL);
  await net.quiet();
  await page.route("**/api/v1/stuck-quiet-check", () => undefined); // never fulfilled, never continued
  await page.evaluate(() => void fetch("/api/v1/stuck-quiet-check").catch(() => undefined));
  const t0 = Date.now();
  await expect(net.quiet()).rejects.toMatchObject({ code: "MEASUREMENT_QUIET_TIMEOUT", invalidMeasurement: true, detail: { capMs: CAP_MS, inFlight: 1 } });
  expect(Date.now() - t0).toBeLessThan(CAP_MS + 1_000);
  expect((await net.snap()).api).toBeGreaterThan(0); // the counters survive the failed gate
});

test("quiet · recurring requests are MEASUREMENT_QUIET_TIMEOUT", async ({ page, baseURL }) => {
  const net = await openWorkbench(page, baseURL);
  await net.quiet();
  await page.route("**/api/v1/recurring-quiet-check", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.evaluate(() => {
    setInterval(() => void fetch("/api/v1/recurring-quiet-check").catch(() => undefined), 150);
  });
  await expect(net.quiet()).rejects.toMatchObject({ code: "MEASUREMENT_QUIET_TIMEOUT", invalidMeasurement: true });
});
