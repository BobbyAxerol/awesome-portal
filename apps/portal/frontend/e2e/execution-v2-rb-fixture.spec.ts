/** R-B browser journey: the blocker line comes ONLY from the gate body's own snapshot block. Fixture reads, not real-source or browser-acceptance proof. */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stubExecutionBff } from "./bffDouble";
import { stubPortalApi, usePreferences } from "./fixtures";
import { stubAdminRoutes, stubQuantbtRuns } from "./v2Lane";

const fixture = (name: string): any => JSON.parse(readFileSync(resolve(process.cwd(), "../../../packages/contracts/fixtures", name), "utf8")); // eslint-disable-line @typescript-eslint/no-explicit-any
const parentFixture = fixture("execution-positive-parent.synthetic.valid.json");
const inboxFixture = fixture("execution-governance.approval-inbox.valid.json");
const workspace = "ws_TEST_ONLY_parent";
const approvalId = parentFixture.live.approval.approval_id;
const rowSummary = "Inbox row summary that must never be shown";
const blockSummary = parentFixture.live_blockers.blockers.blocker_summary;


const setup = async (page: import("@playwright/test").Page, gateBody: unknown, inboxStatus = 200) => {
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true, simulated: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
  const inbox = structuredClone(inboxFixture);
  inbox.workspace_id = workspace;
  // The row deliberately matches the gate on every key; it still must not feed the line.
  Object.assign(inbox.page.rows[0]!, {
    id: approvalId, gate: "LIVE_GATE", subject: "Live fixture gate", subject_type: "DEPLOYMENT",
    subject_id: parentFixture.live.anchors.deployment_id, environment: "LIVE", approval_version: 1,
    evidence_complete: false, blocker_count: 4, blocker_summary: rowSummary,
  });
  const refusal = { error: { code: "ACCESS_DENIED", message: "Not permitted." } };
  await page.route("**/api/v1/execution/governance/approvals?*", async (route) => {
    await route.fulfill({ status: inboxStatus, json: inboxStatus === 200 ? inbox : refusal });
  });
  await page.route(`**/api/v1/execution/governance/approvals/${approvalId}/live?*`, async (route) => {
    expect(new URL(route.request().url()).searchParams.get("workspace_id")).toBe(workspace);
    await route.fulfill({ status: gateBody === null ? 403 : 200, json: gateBody ?? refusal });
  });
};

for (const width of [1280, 660]) {
  test(`snapshot block present: the line is the block's, never the row's, at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page, parentFixture.live_blockers);
    await page.goto(`/governance/approvals?workspace_id=${workspace}&view=live&sel=${approvalId}`);
    await expect(page.getByText("Evidence incomplete")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`Blockers: 2 blockers \u00b7 ${blockSummary}`)).toBeVisible();
    await expect(page.getByText(rowSummary)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}

for (const [name, body] of [["no block (purpose not authorized)", "live"], ["declared absence", "live_blockers_absent"]] as const) {
  test(`${name}: generic 'Evidence incomplete', and the matching inbox row is NOT used as a fallback`, async ({ page }) => {
    await setup(page, parentFixture[body]);
    await page.goto(`/governance/approvals?workspace_id=${workspace}&view=live&sel=${approvalId}`);
    await expect(page.getByText("Evidence incomplete")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(rowSummary)).toHaveCount(0);
    await expect(page.getByText(/Blockers:/)).toHaveCount(0);
  });
}

test("gate denied: no blocker text", async ({ page }) => {
  await setup(page, null);
  const refused = page.waitForResponse((response) => response.status() === 403 && response.url().includes("/governance/approvals/"));
  await page.goto(`/governance/approvals/${approvalId}/live?workspace_id=${workspace}`);
  await refused;
  await expect(page.getByText(rowSummary)).toHaveCount(0);
  await expect(page.getByText(blockSummary)).toHaveCount(0);
});

test("inbox denied: the gate's own snapshot block still reads, independently", async ({ page }) => {
  await setup(page, parentFixture.live_blockers, 403);
  const refused = page.waitForResponse((response) => response.status() === 403 && response.url().includes("/governance/approvals"));
  await page.goto(`/governance/approvals/${approvalId}/live?workspace_id=${workspace}`);
  await refused;
  await expect(page.getByText(rowSummary)).toHaveCount(0);
});
