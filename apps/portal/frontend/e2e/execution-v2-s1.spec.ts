/**
 * UXM-07 S1 · the V2 screens in a real browser, BFF double only.
 *
 * Runs on the port-4176 build (VITE_EXECUTION_V2_SCREENS set). Lane:
 * FIXTURE_LAB/BFF_DOUBLE; no claim about real reads. Screenshots go to
 * UXM07_SHOT_DIR when set and are never compared: they are for review, the
 * baselines for V2 are recorded separately at the milestone.
 */
import { expect, test } from "@playwright/test";

import { answerAccessEffective } from "./bffDoubleAccess";
import { answerUsers } from "./bffDoubleUsers";
import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";
import { stubExecutionBff } from "./bffDouble";
import { settle, stubPortalApi, usePreferences } from "./fixtures";

const SCREENS = [
  ["overview", "/execution", '[data-screen="overview-v2"]'],
  ["fleet", "/deployments/alphas", ".exec-fleet-v2"],
  ["operations", "/execution/operations", ".exec-ops"],
  ["incident", "/execution/operations/incidents/inc_fixture_44", ".exec-ops"],
  ["cockpit", "/governance/approvals", ".exec-ck"],
  ["cockpit-r1", "/governance/approvals/AP-201/r1", ".exec-ck"],
  ["portfolios", "/deployments/portfolios", '[data-screen="portfolios-v2"]'],
  ["portfolio-360", "/deployments/portfolios/pf_TEST_ONLY_core", '[data-screen="portfolio-360-v2"]'],
  ["compare", "/deployments/portfolios?view=compare&in=pf_TEST_ONLY_core,pf_TEST_ONLY_satellite", '[data-screen="compare-v2"]'],
  ["alpha-360", "/deployments/alphas/alpha_btc_trend", '[data-screen="alpha-360-v2"]'],
  ["alpha-replay", "/deployments/alphas/alpha_btc_trend?tab=replay", '[data-screen="alpha-360-v2"]'],
  ["accounts", "/deployments/accounts", ".exec-acct-v2"],
  ["account-360", "/deployments/accounts/acc_bnc_core", ".exec-acct-v2"],
  ["blotter", "/deployments/blotter", '[data-screen="blotter-v2"]'],
  ["admin", "/administration/actions", '[data-screen="admin-actions-v2"]'],
  ["users", "/administration/users", '[data-screen="users-v2"]'],
  ["access", "/administration/profile-access?workspace_id=ws_TEST_GRANTS", ".exec-acc-kpi"],
] as const;

/**
 * A manager-like session for the V2 pages: the owner capabilities the portal
 * issues today plus the provisional execution names (FE-037). Without the
 * execution names every Accounts/Portfolios/Operations page correctly stays
 * fail-closed, which is the default-session case covered by the unit tests.
 */
const MANAGER_CAPABILITIES = [
  "administration.profile_access.manage",
  "administration.users.manage",
  "governance.canary.decide",
  "governance.canary.read",
  "governance.live.decide",
  "governance.live.read",
  "governance.r1.decide",
  "governance.r1.read",
  "governance.r2.decide",
  "governance.r2.read",
  "execution.portfolios.read",
  "execution.accounts.read",
  "execution.operations.read",
  "portal.execution.blotter.read",
];

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
      await stubExecutionBff(page, { operationsV2: true, screensV2: true });
      // The admin reads live outside /api/v1/execution: Access effective and the Users roster.
      await page.route("**/api/admin/**", (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname === "/api/admin/access/self") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              schema_version: "portal.owner-access.v1",
              record_authority: "PORTAL_CONTROL",
              user_id: "principal-visual-baseline",
              is_owner: true,
              owner_state: "OWNER",
              capabilities: MANAGER_CAPABILITIES,
              mutation_requirements: { origin: "REQUIRED", csrf: "REQUIRED", step_up: "REQUIRED_FOR_DESTRUCTIVE" },
            }),
          });
        }
        const answer = answerAccessEffective(request.method(), url.pathname, url.searchParams) ?? answerUsers(request.method(), url.pathname, url.searchParams);
        if (answer === null) return route.fallback();
        return route.fulfill({ status: answer.status, contentType: answer.contentType ?? "application/json", body: typeof answer.body === "string" ? answer.body : JSON.stringify(answer.body) });
      });

      const offences: string[] = [];
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") offences.push(`${message.type()}: ${message.text()}`);
      });
      page.on("pageerror", (error) => offences.push(`pageerror: ${error.message}`));
      // Chromium's own console line for a failed fetch names no URL; this does.
      // The double answers the UDB-03 retained-review read with the typed 404
      // "not configured" (a normal stack has none), so that one URL and its
      // console line are tolerated here and nowhere else.
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
      const expected = (line: string) => /Failed to load resource.*404/.test(line);
      let tolerated = retainedRefusals;
      expect(offences.filter((line) => !(expected(line) && tolerated-- > 0))).toEqual([]);
    });
  }
}
