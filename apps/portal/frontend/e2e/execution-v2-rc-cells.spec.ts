/**
 * R-C: which V2 visual cells (the CELLS of execution-v2-visual.spec.ts, same routes and roots, 1440 wide) change when the projection route is
 * served by the fixture BFF answerer instead of the double's 404. Fixture lane only; it records facts to RC_CELLS_OUT (a JSON file) and never
 * writes or compares a pixel baseline. Screenshot bytes are hashed, not kept.
 */
import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { answerEquityProjection } from "../../fixture-bff/equity-projection";
import { stubExecutionBff } from "./bffDouble";
import { stubPortalApi, usePreferences } from "./fixtures";
import { V2_WORKSPACE, stubAdminRoutes, stubQuantbtRuns } from "./v2Lane";

const OUT = process.env.RC_CELLS_OUT;
test.skip(!OUT, "RC_CELLS_OUT is not set");
const WS = `workspace_id=${V2_WORKSPACE}`;

const CELLS: readonly [string, string, string][] = [
  ["fleet", "/deployments/alphas", ".exec-fleet-v2"],
  ["fleet-paper", "/deployments/alphas?stage=paper", ".exec-fleet-v2"],
  ["overview", "/execution", '[data-screen="overview-v2"]'],
  ["portfolios", "/deployments/portfolios", '[data-screen="portfolios-v2"]'],
  ["portfolio-360", "/deployments/portfolios/pf_TEST_ONLY_core", '[data-screen="portfolio-360-v2"]'],
  ["alpha-360-overview", "/deployments/alphas/alpha_btc_trend", '[data-screen="alpha-360-v2"]'],
  ["alpha-360-orders", "/deployments/alphas/alpha_btc_trend?tab=orders", '[data-screen="alpha-360-v2"]'],
  ["alpha-360-deployments", "/deployments/alphas/alpha_btc_trend?tab=deployments", '[data-screen="alpha-360-v2"]'],
  ["accounts-list", "/deployments/accounts", '[data-screen="accounts-v2"]'],
  ["account-360", "/deployments/accounts/acc_bnc_core", ".exec-acct-v2"],
  ["compare", "/deployments/compare?in=pf_TEST_ONLY_canary,pf_TEST_ONLY_empty", '[data-screen="compare-v2"]'],
  ["blotter", "/deployments/blotter", '[data-screen="blotter-v2"]'],
  ["workbench-paper", "/deployments/paper/dep_paper_01", '[data-screen="workbench-v2"]'],
  ["live", `/deployments/live/dep_live_01?${WS}`, '[data-screen="live-v2"]'],
  ["canary", `/deployments/live/dep_canary_01/canary?${WS}`, '[data-screen="canary-v2"]'],
  ["sandbox", `/deployments/sandbox/dep_sandbox_01?${WS}`, '[data-screen="sandbox-v2"]'],
  ["admin-actions", "/administration/actions", '[data-screen="admin-actions-v2"]'],
  ["users", "/administration/users", '[data-screen="users-v2"]'],
  ["trade-replay", "/deployments/alphas/alpha_btc_trend?tab=replay", '[data-screen="trade-replay-v2"]'],
  ["access", "/administration/profile-access?workspace_id=ws_TEST_GRANTS", ".exec-acc-kpi"],
  ["cockpit", "/governance/approvals", ".exec-ck"],
  ["operations", "/execution/operations", ".exec-ops"],
  ["new-request", "/governance/approvals/new", '[data-screen="new-request-v2"]'],
];

const MIME: Record<string, string> = { js: "text/javascript", css: "text/css", json: "application/json", svg: "image/svg+xml", woff2: "font/woff2", woff: "font/woff", png: "image/png", map: "application/json" };
async function serveAssetsFromDisk(page: Page) {
  const root = resolve(process.cwd(), "dist-rc");
  await page.route("**/assets/**", async (route) => {
    const path = resolve(root, `.${new URL(route.request().url()).pathname}`);
    if (!path.startsWith(root) || !existsSync(path)) return route.continue();
    await route.fulfill({ status: 200, body: readFileSync(path), contentType: MIME[path.split(".").pop() ?? ""] ?? "application/octet-stream", headers: { "cache-control": "no-store" } });
  });
}

interface Fact { statuses: number[]; section: boolean; refused: boolean; hash: string | null; height: number | null }

async function visit(page: Page, route: string, root: string, fixture: boolean): Promise<Fact> {
  await serveAssetsFromDisk(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true, reviewManager: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
  const statuses: number[] = [];
  await page.route("**/api/v1/execution/deployments/*/equity-projection*", async (r) => {
    const url = new URL(r.request().url());
    if (!fixture) { statuses.push(404); return r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: "EXECUTION_DEPLOYMENT_NOT_FOUND", message: "The equity projection is not served by this source." } }) }); }
    const answer = answerEquityProjection({ method: "GET", path: url.pathname, search: url.search, headers: {}, body: null })!;
    statuses.push(answer.status);
    return r.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) });
  });
  await page.goto(route);
  await page.locator(root).first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(2_500);
  const section = (await page.locator('[data-testid="equity-projection"]').count()) > 0;
  const refused = (await page.locator('[data-testid="equity-projection-refused"]').count()) > 0;
  const main = page.locator("#portal-content").first();
  const height = await main.evaluate((el) => el.scrollHeight).catch(() => null);
  const shot = await main.screenshot({ animations: "disabled" }).catch(() => null);
  return { statuses, section, refused, hash: shot === null ? null : createHash("sha256").update(shot).digest("hex"), height };
}

test("fixture projection versus the double's 404 across the V2 visual cell routes (1440)", async ({ browser }) => {
  test.setTimeout(600_000);
  const rows: Record<string, { before: Fact; after: Fact }> = {};
  for (const [slug, route, root] of CELLS) {
    const before = await (async () => { const ctx = await browser.newContext(); const page = await ctx.newPage(); const f = await visit(page, route, root, false); await ctx.close(); return f; })();
    const after = await (async () => { const ctx = await browser.newContext(); const page = await ctx.newPage(); const f = await visit(page, route, root, true); await ctx.close(); return f; })();
    rows[slug] = { before, after };
  }
  writeFileSync(OUT!, JSON.stringify(rows, null, 1));
  expect(Object.keys(rows).length).toBe(CELLS.length);
});
