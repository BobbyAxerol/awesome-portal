/**
 * UXM-07 S1 · the V2 screens in a real browser, BFF double only.
 *
 * Runs on the port-4176 build (VITE_EXECUTION_V2_SCREENS set). Lane:
 * FIXTURE_LAB/BFF_DOUBLE; no claim about real reads. Screenshots go to
 * UXM07_SHOT_DIR when set and are never compared: they are for review, the
 * baselines for V2 are recorded separately at the milestone.
 */
import { expect, test } from "@playwright/test";

import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";
import { stubExecutionBff } from "./bffDouble";
import { settle, stubPortalApi, usePreferences } from "./fixtures";

const SCREENS = [
  ["fleet", "/deployments/alphas", ".exec-fleet-v2"],
  ["operations", "/execution/operations", ".exec-ops"],
  ["incident", "/execution/operations/incidents/inc_fixture_44", ".exec-ops"],
  ["cockpit", "/governance/approvals", ".exec-ck"],
  ["cockpit-r1", "/governance/approvals/AP-201/r1", ".exec-ck"],
] as const;

const WIDTHS = [
  ["wide", 1440, 900],
  ["narrow", 390, 844],
] as const;

for (const [name, route, root] of SCREENS) {
  for (const [label, width, height] of WIDTHS) {
    test(`${name} renders in V2 at ${label} width without console noise`, async ({ page, baseURL }) => {
      await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
      await page.setViewportSize({ width, height });
      await usePreferences(page, "operations");
      await stubPortalApi(page, "healthy");
      await stubExecutionBff(page, { operationsV2: true });

      const offences: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") offences.push(`${message.type()}: ${message.text()}`);
      });
      page.on("pageerror", (error) => offences.push(`pageerror: ${error.message}`));
      // Chromium's own console line for a failed fetch names no URL; this does.
      // The BFF double has never answered the UDB-03 retained-review read (501
      // on every V1 route too, DEBT-UXM07-003), so that one URL and its console
      // line are tolerated here and nowhere else.
      let retainedRefusals = 0;
      page.on("response", (response) => {
        if (new URL(response.url()).pathname === "/api/v1/execution/retained-review") {
          retainedRefusals += 1;
          return;
        }
        if (response.status() >= 400) offences.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}${new URL(response.url()).search}`);
      });
      const origin = new URL(baseURL ?? "http://127.0.0.1:4176").origin;
      const foreign: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).origin !== origin) foreign.push(request.url());
      });

      await page.goto(route);
      await expect(page.locator(root).first()).toBeVisible();
      await settle(page);
      // No V2 screen may scroll the page sideways at either width.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "horizontal page overflow").toBeLessThanOrEqual(0);

      const dir = process.env.UXM07_SHOT_DIR;
      if (dir) await page.screenshot({ path: `${dir}/${name}-${label}.png`, fullPage: true });

      expect(foreign).toEqual([]);
      const expected = (line: string) => /Failed to load resource.*501/.test(line);
      let tolerated = retainedRefusals;
      expect(offences.filter((line) => !(expected(line) && tolerated-- > 0))).toEqual([]);
    });
  }
}
