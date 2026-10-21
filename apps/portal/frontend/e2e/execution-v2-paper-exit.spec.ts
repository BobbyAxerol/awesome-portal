/**
 * RV-10 · the Paper exit request, reachable and demonstrable end to end in the fixture lab (FIXTURE_LAB / BFF_DOUBLE; no claim about real reads).
 *
 * The Exit control ("Request review" in the Workbench exit gate) opens from the published R2 parent served by the double
 * (`GET /governance/paper-exit/parent`), its request carries the pins that parent served (approval, `expected_r2_version`, the projection
 * digest), and typed success and denial answers render. Nothing here needs the dark `command` flag: the control rides `workbench`, and the
 * only write is `POST /governance/paper-exit/create`. The `command`-key "Preview control" form stays a separate, dark surface.
 *
 * Runs on the port-4176 build. Screenshots go to UXM07_SHOT_DIR when set and are never compared.
 */
import { expect, test, type Page } from "@playwright/test";

import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";
import { stubExecutionBff } from "./bffDouble";
import { PAPER_EXIT_OFF_WORKSPACE, PAPER_EXIT_OPEN_WORKSPACE } from "./bffDoubleGovernance";
import { settle, stubPortalApi, usePreferences } from "./fixtures";
import { stubAdminRoutes, stubQuantbtRuns, watchPage } from "./v2Lane";

const DEPLOYMENT = "dep_paper_01";
const CREATE = "/api/v1/execution/governance/paper-exit/create";
const PARENT = "/api/v1/execution/governance/paper-exit/parent";

async function openLane(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(OPERATIONS_V2_DOUBLE_NOW_ISO));
  await page.setViewportSize({ width: 1440, height: 900 });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
}

interface Write { method: string; path: string; body: Record<string, unknown> | null }
function recordWrites(page: Page): Write[] {
  const writes: Write[] = [];
  page.on("request", (request) => {
    if (request.method() === "GET" || request.method() === "HEAD") return;
    let body: Record<string, unknown> | null = null;
    try {
      body = request.postDataJSON() as Record<string, unknown>;
    } catch {
      body = null;
    }
    writes.push({ method: request.method(), path: new URL(request.url()).pathname, body });
  });
  return writes;
}

const exitUrl = (workspace: string, deployment = DEPLOYMENT): string => `/deployments/paper/${deployment}?workspace_id=${workspace}`;

test("the Exit control opens from the served R2 parent, builds the request from the served pins, and a request is recorded", async ({ page, baseURL }) => {
  await openLane(page);
  const writes = recordWrites(page);
  const parentReads: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === PARENT) parentReads.push(url.search);
  });
  const watch = watchPage(page, baseURL);

  await page.goto(exitUrl(PAPER_EXIT_OPEN_WORKSPACE));
  const root = page.locator('[data-screen="workbench-v2"]');
  await expect(root).toBeVisible();
  const control = root.locator(".exec-wb-xr");
  await expect(control).toHaveAttribute("data-state", "open");
  expect(parentReads).toEqual([`?deployment_id=${DEPLOYMENT}&workspace_id=${PAPER_EXIT_OPEN_WORKSPACE}`]);

  // Send is shut until the text is long enough; the bound is the server's.
  const send = control.getByRole("button", { name: "Request review" });
  await expect(send).toBeDisabled();
  await control.getByRole("textbox").fill("Ready after the observation window.");
  await expect(send).toBeEnabled();
  await send.click();

  // Typed success: the receipt names the review, and the status is read back from the server (never optimistic).
  const recorded = root.locator('.exec-wb-xr[data-state="recorded"]');
  await expect(recorded).toContainText("Applied: Requested");
  await expect(recorded).toContainText(`pexit_fx_${DEPLOYMENT}_`);
  await expect(recorded).toContainText("0 of 1 approvers");
  await expect(recorded.getByRole("link", { name: "Open in Approvals" })).toBeVisible();
  const dir = process.env.UXM07_SHOT_DIR;
  if (dir) await page.screenshot({ path: `${dir}/paper-exit-recorded.png`, fullPage: true });

  // The one write is the Paper exit request, with the pins the parent served and nothing else (no command route, no flag).
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ method: "POST", path: CREATE });
  expect(writes[0]!.body).toMatchObject({
    workspace_id: PAPER_EXIT_OPEN_WORKSPACE,
    deployment_id: DEPLOYMENT,
    summary: "Ready after the observation window.",
    r2_approval_id: "apr_TEST_ONLY_r2",
    expected_r2_version: 3,
    expected_projection_digest: `sha256:${"c".repeat(64)}`,
  });
  expect(watch.foreign).toEqual([]);
  expect(watch.take()).toEqual([]);
});

test("typed denials render as the server worded them and nothing is shown as requested", async ({ page, baseURL }) => {
  await openLane(page);
  const writes = recordWrites(page);
  const watch = watchPage(page, baseURL);
  await page.goto(exitUrl(PAPER_EXIT_OPEN_WORKSPACE));
  const root = page.locator('[data-screen="workbench-v2"]');
  await expect(root).toBeVisible();
  const control = root.locator(".exec-wb-xr");
  await expect(control).toHaveAttribute("data-state", "open");

  for (const [summary, code, status] of [
    ["DENIED for this admin please.", "ADMIN_ROLE_REQUIRED", "403"],
    ["REFUSE this request please.", "APPROVAL_VERSION_CONFLICT", "409"],
    ["STALE projection please.", "CAPTURE_PROJECTION_VERSION_CONFLICT", "409"],
  ] as const) {
    await control.getByRole("textbox").fill(summary);
    await control.getByRole("button", { name: "Request review" }).click();
    // DEBT-UXM07-034: the sentence is the dictionary's (or the server's own) words; the typed code sits behind "Server reason".
    await expect(control.getByRole("alert")).toContainText("The server did not record this request.");
    await expect(control.getByRole("alert")).not.toContainText(/\((unavailable|denied)\)/);
    if (status === "403") await expect(control.getByRole("alert")).toContainText("Needs the Admin role");
    await control.getByRole("alert").getByRole("button", { name: "Server reason" }).click();
    await expect(control.getByRole("alert")).toContainText(code);
    await expect(root.locator('.exec-wb-xr[data-state="recorded"]')).toHaveCount(0);
  }
  expect(writes.map((write) => write.path)).toEqual([CREATE, CREATE, CREATE]);

  // The same intent again is a replay: the server matched it, nothing is duplicated.
  await control.getByRole("textbox").fill("REPLAY of an earlier request.");
  await control.getByRole("button", { name: "Request review" }).click();
  await expect(root.locator('.exec-wb-xr[data-state="recorded"]')).toContainText("Matched an earlier request");

  // The three refusals are the only failed responses the page saw (Chromium also logs one console line per failed fetch).
  const seen = watch.take();
  expect(seen.filter((line) => line.startsWith("403 POST") || line.startsWith("409 POST")).map((line) => line.split("?")[0])).toEqual([
    `403 POST ${CREATE}`, `409 POST ${CREATE}`, `409 POST ${CREATE}`,
  ]);
  expect(seen.filter((line) => !/^(403|409) POST /.test(line) && !/^error: Failed to load resource: the server responded with a status of (403|409) /.test(line))).toEqual([]);
  expect(watch.foreign).toEqual([]);
});

test("a workspace where the server does not open the request, and a deployment whose R2 is blocked, leave the control shut with one reason", async ({ page, baseURL }) => {
  await openLane(page);
  const writes = recordWrites(page);
  const watch = watchPage(page, baseURL);

  await page.goto(exitUrl(PAPER_EXIT_OFF_WORKSPACE));
  const root = page.locator('[data-screen="workbench-v2"]');
  await expect(root.locator('.exec-wb-xr[data-state="shut"]')).toBeVisible();
  await expect(root.locator('.exec-wb-xr[data-state="shut"]').getByRole("button", { name: "Request review" })).toBeDisabled();
  // RV-06: the server's code is behind one "Server reason" disclosure button, not on a title.
  await expect(root.locator(".exec-wb-xr[title]")).toHaveCount(0);
  await root.locator('.exec-wb-xr[data-state="shut"]').getByRole("button", { name: "Server reason" }).click();
  await expect(root.locator('.exec-wb-xr[data-state="shut"] .exec-blk-why-row')).toHaveText("Server reason: PAPER_EXIT_REVIEW_NOT_OPEN_FOR_THIS_WORKSPACE");
  await expect(root.getByRole("textbox")).toHaveCount(0);

  await page.goto(exitUrl(PAPER_EXIT_OPEN_WORKSPACE, "dep_exit_not_approved"));
  const shut = page.locator('[data-screen="workbench-v2"] .exec-wb-xr[data-state="shut"]');
  await expect(shut).toBeVisible();
  await expect(shut.getByRole("button", { name: "Request review" })).toBeDisabled();
  await shut.getByRole("button", { name: "Server reason" }).click();
  await expect(shut.locator(".exec-blk-why-row")).toHaveText("Server reason: R2_APPROVAL_REQUIRED");

  // Without a workspace in the URL the control is not asked for at all.
  await page.goto(`/deployments/paper/${DEPLOYMENT}`);
  await expect(page.locator('[data-screen="workbench-v2"]')).toBeVisible();
  await settle(page);
  expect(writes).toEqual([]);
  expect(watch.foreign).toEqual([]);
});
