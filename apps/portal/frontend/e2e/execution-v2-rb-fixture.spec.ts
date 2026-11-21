/**
 * R-B browser journey: the blocker line comes ONLY from the gate body's own snapshot block (`blockers`, read in the gate's one snapshot).
 * Fixture reads, not real-source or browser-acceptance proof; denial and refusal are simulated by route stubs.
 *
 * Harness notes (evidence: upgrade/execution_loop/evidence/UXM-07/rb-browser-2026-10-29):
 * - every case waits for the REAL gate response (and its status) before asserting presence or absence, then for the final UI state;
 * - the earlier flakes were `net::ERR_NETWORK_CHANGED` aborting the app's lazy route chunks (host network-change events), so the cockpit never
 *   mounted and no read was made. That is detected explicitly: the navigation only is retried at most twice and annotated, then the test fails
 *   naming an environment fault. No product assertion is retried or weakened;
 * - the app's own `/assets/*` are served from the same `dist-ra` build on disk (same bytes, no loopback transport).
 */
import { expect, test, type Page, type Response } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
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
const blockSummary: string = parentFixture.live_blockers.blockers.blocker_summary;

const MIME: Record<string, string> = { js: "text/javascript", css: "text/css", json: "application/json", svg: "image/svg+xml", woff2: "font/woff2", woff: "font/woff", png: "image/png", map: "application/json" };

async function serveAssetsFromDisk(page: Page) {
  const root = resolve(process.cwd(), "dist-ra");
  await page.route("**/assets/**", async (route) => {
    const path = resolve(root, `.${new URL(route.request().url()).pathname}`);
    if (!path.startsWith(root) || !existsSync(path)) return route.continue();
    await route.fulfill({ status: 200, body: readFileSync(path), contentType: MIME[path.split(".").pop() ?? ""] ?? "application/octet-stream", headers: { "cache-control": "no-store" } });
  });
}

type Setup = { gateBody: unknown; gateStatus?: number; inboxStatus?: number; inboxRow?: boolean };

async function setup(page: Page, width: number, s: Setup) {
  await serveAssetsFromDisk(page);
  await page.setViewportSize({ width, height: 900 });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true, simulated: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
  const inbox = structuredClone(inboxFixture);
  inbox.workspace_id = workspace;
  if (s.inboxRow === false) inbox.page.rows = inbox.page.rows.slice(1);
  else {
    // The row deliberately matches the gate on every key and carries its own (different) summary: it must never feed the line.
    Object.assign(inbox.page.rows[0]!, {
      id: approvalId, gate: "LIVE_GATE", subject: "Live fixture gate", subject_type: "DEPLOYMENT", subject_id: parentFixture.live.anchors.deployment_id,
      environment: "LIVE", approval_version: 1, evidence_complete: false, blocker_count: 4, blocker_summary: rowSummary,
    });
  }
  const refusal = { error: { code: "ACCESS_DENIED", message: "Not permitted." } };
  await page.route("**/api/v1/execution/governance/approvals?*", async (route) => {
    await route.fulfill({ status: s.inboxStatus ?? 200, json: (s.inboxStatus ?? 200) === 200 ? inbox : refusal });
  });
  await page.route(`**/api/v1/execution/governance/approvals/${approvalId}/live?*`, async (route) => {
    expect(new URL(route.request().url()).searchParams.get("workspace_id")).toBe(workspace);
    await route.fulfill({ status: s.gateStatus ?? 200, json: (s.gateStatus ?? 200) === 200 ? s.gateBody : refusal });
  });
}

async function openCockpit(page: Page, url: string, expectGate: number, expectInbox: number | null, testInfo: { annotations: { type: string; description?: string }[] }) {
  const isGate = (r: Response) => new RegExp(`/api/v1/execution/governance/approvals/${approvalId}/live\\?`).test(r.url());
  const isInbox = (r: Response) => /\/api\/v1\/execution\/governance\/approvals\?/.test(r.url()) && r.url().includes("limit=50");
  for (let attempt = 1; attempt <= 3; attempt++) {
    let chunkFault: string | null = null;
    const onFailed = (request: { url(): string; failure(): { errorText: string } | null }) => {
      if (request.url().includes("/assets/") && /ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED|ERR_INTERNET_DISCONNECTED/.test(request.failure()?.errorText ?? "")) chunkFault = request.failure()!.errorText;
    };
    page.on("requestfailed", onFailed);
    const gateP = page.waitForResponse(isGate, { timeout: 20_000 }).catch(() => null);
    const inboxP = expectInbox === null ? Promise.resolve(null) : page.waitForResponse(isInbox, { timeout: 20_000 }).catch(() => null);
    await page.goto(url);
    const [gate, inbox] = await Promise.all([gateP, inboxP]);
    page.off("requestfailed", onFailed);
    if (chunkFault !== null && (gate === null || (expectInbox !== null && inbox === null)) && attempt < 3) {
      testInfo.annotations.push({ type: "harness-retry", description: `attempt ${attempt}: ${chunkFault} on a lazy chunk; navigation retried` });
      continue;
    }
    if (chunkFault !== null && (gate === null || (expectInbox !== null && inbox === null))) throw new Error(`Environment fault, not a product result: ${chunkFault} on lazy route chunks in 3 attempts, so the cockpit reads were never made.`);
    expect(gate, "the Live gate read was made and answered").not.toBeNull();
    expect(gate!.status()).toBe(expectGate);
    if (expectInbox !== null) {
      expect(inbox, "the inbox read was made and answered").not.toBeNull();
      expect(inbox!.status()).toBe(expectInbox);
    }
    return;
  }
}

const SEL = `/governance/approvals?workspace_id=${workspace}&view=live&sel=${approvalId}`;
const PATH = `/governance/approvals/${approvalId}/live?workspace_id=${workspace}`;

const withBlockers = (patch: (b: any) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const body = structuredClone(parentFixture.live_blockers);
  patch(body.blockers);
  return body;
};
const withBody = (patch: (b: any) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const body = structuredClone(parentFixture.live_blockers);
  patch(body);
  return body;
};

type Expect = { evidence: "incomplete" | "none"; line: boolean };
type Case = { name: string; s: Setup; url: "sel" | "path"; gate: number; inbox: number | null; expect: Expect };

const CASES: Case[] = [
  { name: "block available with a blocker line", s: { gateBody: parentFixture.live_blockers }, url: "sel", gate: 200, inbox: 200, expect: { evidence: "incomplete", line: true } },
  { name: "block available with count 0 (no line, never a clear gate)", s: { gateBody: parentFixture.live_blockers_zero }, url: "sel", gate: 200, inbox: 200, expect: { evidence: "incomplete", line: false } },
  { name: "block ABSENT (declared reason)", s: { gateBody: parentFixture.live_blockers_absent }, url: "sel", gate: 200, inbox: 200, expect: { evidence: "incomplete", line: false } },
  { name: "block key omitted (purpose not authorized)", s: { gateBody: parentFixture.live }, url: "sel", gate: 200, inbox: 200, expect: { evidence: "incomplete", line: false } },
  { name: "block naming another approval id (body refused)", s: { gateBody: withBlockers((b) => { b.approval_id = "apr_OTHER"; }) }, url: "sel", gate: 200, inbox: 200, expect: { evidence: "none", line: false } },
  { name: "block naming another version (body refused)", s: { gateBody: withBlockers((b) => { b.approval_version = 99; }) }, url: "sel", gate: 200, inbox: 200, expect: { evidence: "none", line: false } },
  { name: "gate denied (403)", s: { gateBody: null, gateStatus: 403 }, url: "path", gate: 403, inbox: null, expect: { evidence: "none", line: false } },
  { name: "gate not found (404)", s: { gateBody: null, gateStatus: 404 }, url: "path", gate: 404, inbox: null, expect: { evidence: "none", line: false } },
  { name: "gate body for another workspace", s: { gateBody: withBody((b) => { b.workspace_id = "ws_OTHER"; }) }, url: "sel", gate: 200, inbox: 200, expect: { evidence: "none", line: false } },
  { name: "inbox denied: the gate's own block still reads", s: { gateBody: parentFixture.live_blockers, inboxStatus: 403 }, url: "path", gate: 200, inbox: 403, expect: { evidence: "incomplete", line: true } },
  { name: "row paged out: the gate's own block still reads", s: { gateBody: parentFixture.live_blockers, inboxRow: false }, url: "path", gate: 200, inbox: 200, expect: { evidence: "incomplete", line: true } },
];

for (const c of CASES) {
  for (const width of [1280, 660]) {
    test(`${c.name} at ${width}px`, async ({ page }, testInfo) => {
      await setup(page, width, c.s);
      // The real responses first; only then the final UI state, presence or absence alike.
      await openCockpit(page, c.url === "sel" ? SEL : PATH, c.gate, c.inbox, testInfo);
      if (c.expect.evidence === "incomplete") await expect(page.getByText("Evidence incomplete")).toBeVisible({ timeout: 15_000 });
      else await expect(page.getByText("Evidence incomplete")).toHaveCount(0);
      if (c.expect.line) await expect(page.getByText(`Blockers: 2 blockers · ${blockSummary}`)).toBeVisible();
      else {
        await expect(page.getByText(/Blockers:/)).toHaveCount(0);
        await expect(page.getByText(blockSummary)).toHaveCount(0);
        await expect(page.getByText(/no blockers|0 blockers|clear gate/i)).toHaveCount(0);
      }
      await expect(page.getByText(rowSummary)).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }
}
