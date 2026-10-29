/** R-B browser journey: independently mocked fixture reads, not shared-snapshot or real-source proof. */
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
const summary = "Four Canary branches are unavailable";

for (const [name, rowVersion, expected] of [["matching", 1, true], ["version mismatch", 2, false]] as const) {
  for (const width of [1280, 660]) {
    test(`${name}: Live gate blocker join at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await usePreferences(page, "operations");
      await stubPortalApi(page, "healthy");
      await stubExecutionBff(page, { operationsV2: true, screensV2: true, simulated: true });
      await stubAdminRoutes(page);
      await stubQuantbtRuns(page);
      const parent = structuredClone(parentFixture.live);
      const inbox = structuredClone(inboxFixture);
      inbox.workspace_id = workspace;
      Object.assign(inbox.page.rows[0]!, {
        id: approvalId, gate: "LIVE_GATE", subject: "Live fixture gate", subject_type: "DEPLOYMENT",
        subject_id: parent.anchors.deployment_id, environment: "LIVE", approval_version: rowVersion,
        evidence_complete: false, blocker_count: 4, blocker_summary: summary,
      });
      await page.route("**/api/v1/execution/governance/approvals?*", async (route) => {
        expect(new URL(route.request().url()).searchParams.get("workspace_id")).toBe(workspace);
        await route.fulfill({ status: 200, json: inbox });
      });
      await page.route(`**/api/v1/execution/governance/approvals/${approvalId}/live?*`, async (route) => {
        expect(new URL(route.request().url()).searchParams.get("workspace_id")).toBe(workspace);
        await route.fulfill({ status: 200, json: parent });
      });
      await page.goto(`/governance/approvals?workspace_id=${workspace}&view=live&sel=${approvalId}`);
      await expect(page.getByText("Evidence incomplete")).toBeVisible({ timeout: 15_000 });
      if (expected) await expect(page.getByText(`Blockers: 4 blockers · ${summary}`)).toBeVisible();
      else await expect(page.getByText(summary)).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
}

for (const denied of ["inbox", "gate"] as const) {
  test(`independent ${denied} denial does not expose blocker summary`, async ({ page }) => {
    await usePreferences(page, "operations");
    await stubPortalApi(page, "healthy");
    await stubExecutionBff(page, { operationsV2: true, screensV2: true, simulated: true });
    await stubAdminRoutes(page); await stubQuantbtRuns(page);
    const inbox = structuredClone(inboxFixture);
    inbox.workspace_id = workspace;
    Object.assign(inbox.page.rows[0]!, { id: approvalId, gate: "LIVE_GATE", subject: "Live fixture gate",
      subject_type: "DEPLOYMENT", subject_id: parentFixture.live.anchors.deployment_id, environment: "LIVE",
      approval_version: 1, evidence_complete: false, blocker_count: 4, blocker_summary: summary });
    const refusal = { error: { code: "ACCESS_DENIED", message: "Not permitted." } };
    await page.route("**/api/v1/execution/governance/approvals?*", async (route) => {
      await route.fulfill({ status: denied === "inbox" ? 403 : 200, json: denied === "inbox" ? refusal : inbox });
    });
    await page.route(`**/api/v1/execution/governance/approvals/${approvalId}/live?*`, async (route) => {
      await route.fulfill({ status: denied === "gate" ? 403 : 200, json: denied === "gate" ? refusal : parentFixture.live });
    });
    const refused = page.waitForResponse((response) => response.status() === 403 && response.url().includes("/governance/approvals"));
    await page.goto(`/governance/approvals/${approvalId}/live?workspace_id=${workspace}`);
    await refused;
    await expect(page.getByText(summary)).toHaveCount(0);
  });
}
