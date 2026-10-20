/**
 * UXM-09 browser receipt: the command confirmation story (/execution/command, flag key `command`) in a real Chromium.
 *
 * Lane: FIXTURE_LAB. Port-4176 build, project chromium-v2. The page is a FIXTURE STORY over a scripted FAKE PORT: it builds
 * no request, so every claim below is about the screen's states, not about any command, relay or source. A receipt on this
 * page is a scripted answer, and says "fake port" in its own text. Nothing here is evidence that a command was accepted, applied or even
 * understood by anything real, and it does not accept UXM-09.
 *
 * What is asserted: plan -> confirm -> receipt states; UNKNOWN locks the payload and a retry reuses the key; a double click sends
 * once; Enter never submits; every disabled operation carries its reason; 1280 and 660 px do not overflow; the console is clean;
 * and the page makes ZERO writes and ZERO requests to any command, plan, apply or operation route.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";

import { stubExecutionBff } from "./bffDouble";
import { settle, stubPortalApi, usePreferences } from "./fixtures";
import { stubAdminRoutes, stubQuantbtRuns, watchPage } from "./v2Lane";

const WIDTHS = [
  ["1280", 1280, 900],
  ["660", 660, 900],
] as const;

const STORY_LABEL = "Fixture story: not connected to a source; fake port";
const FAKE_PORT = "Answered by the fake port: a scripted fixture answer, not a receipt from any source.";
const SEND_DISABLED = "Command sends are not connected to a source: UXM-09 fixture";
/** Any path that would be a command, a plan, an apply or an operation write/read. The story must not ask for one. */
const COMMAND_ROUTES = /\/(commands?|plans?|apply|operations|approvals)(\/|$|\?)|\/ecm_/;

async function openLane(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await stubExecutionBff(page, { operationsV2: true, screensV2: true });
  await stubAdminRoutes(page);
  await stubQuantbtRuns(page);
}

/** Every same-origin /api request: its method and path. A write, or a call to a command route, is what must never appear. */
function netMeter(page: Page) {
  const all: { method: string; path: string }[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) all.push({ method: request.method(), path: `${url.pathname}${url.search}` });
  });
  return {
    writes: () => all.filter((entry) => !["GET", "HEAD"].includes(entry.method)),
    commandCalls: () => all.filter((entry) => COMMAND_ROUTES.test(entry.path)),
    all: () => [...all],
  };
}

async function openStory(page: Page): Promise<void> {
  await page.goto("/execution/command");
  await expect(page.getByRole("heading", { name: "Command confirmation" })).toBeVisible();
  await settle(page);
}

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const flow = (page: Page) => page.locator(".exec-cf-flow");
const reasonBox = (page: Page) => page.getByRole("textbox", { name: /^Reason/ });
const wordBox = (page: Page) => page.getByRole("textbox", { name: /Type .* to confirm/ });
const submit = (page: Page) => page.getByRole("button", { name: "Submit to the fixture port" });

async function scenario(page: Page, id: string): Promise<void> {
  const lane = id.startsWith("f0") ? /^F0 command/ : /^Capital command/;
  await page.getByRole("radio", { name: lane }).check();
  await page.locator("#exec-cf-scenario").selectOption(id);
}

async function planAndFill(page: Page, word: string): Promise<void> {
  await page.getByRole("button", { name: "Read the plan" }).click();
  await expect(page.getByLabel(/^Plan: /)).toBeVisible();
  await reasonBox(page).fill("Month-end top-up agreed with treasury.");
  await wordBox(page).fill(word);
  await page.getByRole("checkbox").check();
  await expect(submit(page)).not.toHaveAttribute("aria-disabled", "true");
}

/** The text of the provenance line (inside a closed <details>, so read from the DOM, not from what is painted). */
const provenance = async (receipt: Locator): Promise<string> => (await receipt.locator(".exec-cf-prov .exec-cf-mono").textContent()) ?? "";
const requestKeyOf = async (receipt: Locator): Promise<string> => (await provenance(receipt)).match(/request key (\S+)/)?.[1] ?? "";
const sendsOf = async (receipt: Locator): Promise<number> => Number((await provenance(receipt)).match(/sends (\d+)/)?.[1] ?? "0");

for (const [label, width] of WIDTHS) {
  test(`FIXTURE_LAB · command @${label}: labelled as a fixture story over a fake port, no overflow, console clean, zero writes`, async ({ page, baseURL }) => {
    await openLane(page, width);
    const watch = watchPage(page, baseURL);
    const net = netMeter(page);
    await openStory(page);

    await expect(page.getByRole("note")).toContainText(STORY_LABEL);
    expect(await overflow(page), "horizontal page overflow").toBeLessThanOrEqual(0);

    // The real send path is a disabled control that says why, and a click on it does nothing.
    const real = page.getByRole("button", { name: "Send to the Trading System" });
    await expect(real).toBeDisabled();
    await expect(page.getByText(SEND_DISABLED).first()).toBeVisible();
    await real.click({ force: true });

    // One full plan -> confirm -> receipt pass at this width, then the page again (receipt on screen).
    await scenario(page, "f0-denied");
    await planAndFill(page, "account/sync");
    expect(await overflow(page), "overflow with the plan and the form open").toBeLessThanOrEqual(0);
    await submit(page).click();
    const denied = page.getByLabel("Denied by the relay");
    await expect(denied).toBeVisible();
    await expect(denied).toContainText("fake port");
    await expect(denied.getByText(FAKE_PORT)).toBeVisible();
    expect(await overflow(page), "overflow with the receipt open").toBeLessThanOrEqual(0);

    expect(net.writes(), "writes").toEqual([]);
    expect(net.commandCalls(), "requests to a command, plan, apply or operation route").toEqual([]);
    expect(watch.foreign).toEqual([]);
    expect(watch.take()).toEqual([]);
  });
}

test("FIXTURE_LAB · command @1280: every receipt state is labelled fake port, and none reaches the network", async ({ page, baseURL }) => {
  await openLane(page, 1280);
  const watch = watchPage(page, baseURL);
  const net = netMeter(page);
  await openStory(page);

  const cases: [string, string, string][] = [
    ["f0-denied", "account/sync", "Denied by the relay"],
    ["accepted", "TOP_UP", "Accepted"],
    ["rejected-preview-changed", "TOP_UP", "Rejected"],
    ["timeout-then-landed", "TOP_UP", "Outcome unknown"],
    ["revoked", "TOP_UP", "Access changed"],
  ];
  for (const [id, word, receiptLabel] of cases) {
    await scenario(page, id);
    await planAndFill(page, word);
    await submit(page).click();
    const receipt = page.getByLabel(receiptLabel);
    await expect(receipt, id).toBeVisible();
    await expect(receipt.getByText(FAKE_PORT), id).toBeVisible();
    await expect(receipt, id).toContainText("fake port");
    expect(await overflow(page), `${id}: horizontal page overflow`).toBeLessThanOrEqual(0);
  }

  expect(net.writes(), "writes").toEqual([]);
  expect(net.commandCalls(), "command routes").toEqual([]);
  expect(watch.take()).toEqual([]);
});

test("FIXTURE_LAB · command @1280: UNKNOWN locks the payload and a retry reuses the same key", async ({ page, baseURL }) => {
  await openLane(page, 1280);
  const watch = watchPage(page, baseURL);
  const net = netMeter(page);
  await openStory(page);

  await scenario(page, "timeout-then-landed");
  await planAndFill(page, "TOP_UP");
  await submit(page).click();
  const unknown = page.getByLabel("Outcome unknown");
  await expect(unknown).toBeVisible();
  await expect(unknown).toContainText("This command may already have been applied.");

  // The payload is locked: the fields cannot be edited while the outcome stands.
  for (const field of [reasonBox(page), wordBox(page)]) {
    const locked = await field.evaluate((node) => node.matches(":disabled") || (node as HTMLInputElement).readOnly || node.getAttribute("aria-disabled") === "true");
    expect(locked, "field locked while the outcome is unknown").toBe(true);
  }
  await expect(page.getByRole("checkbox")).toBeDisabled();
  const key = await requestKeyOf(unknown);
  expect(key).not.toBe("");
  expect(await sendsOf(unknown)).toBe(1);

  // Retry: the same key, the one send count goes to two, and the answer says it came from a re-send.
  await page.getByRole("button", { name: "Retry with the same key" }).click();
  const accepted = page.getByLabel(/^(Accepted|Already recorded)$/);
  await expect(accepted).toBeVisible();
  expect(await requestKeyOf(accepted), "retry reuses the key").toBe(key);
  expect(await sendsOf(accepted)).toBe(2);
  await expect(accepted.getByText(FAKE_PORT)).toBeVisible();
  // There is no control that sends the stored intent under a second key.
  await expect(page.getByRole("button", { name: /new key|different key/i })).toHaveCount(0);

  expect(net.writes(), "writes").toEqual([]);
  expect(net.commandCalls(), "command routes").toEqual([]);
  expect(watch.take()).toEqual([]);
});

test("FIXTURE_LAB · command @1280: a double click sends once, and Enter never submits", async ({ page, baseURL }) => {
  await openLane(page, 1280);
  const watch = watchPage(page, baseURL);
  const net = netMeter(page);
  await openStory(page);

  await scenario(page, "accepted");
  await page.getByRole("button", { name: "Read the plan" }).click();
  await expect(page.getByLabel(/^Plan: /)).toBeVisible();
  await reasonBox(page).fill("Month-end top-up agreed with treasury.");
  await wordBox(page).fill("TOP_UP");
  await page.getByRole("checkbox").check();

  // Enter in the single-line field, and in the reason: neither submits (no receipt appears, Submit is still there).
  await wordBox(page).press("Enter");
  await reasonBox(page).press("Enter");
  await page.waitForTimeout(250);
  await expect(page.getByLabel(/^(Accepted|Outcome unknown|Rejected|Denied by the relay|Access changed|Already recorded)$/)).toHaveCount(0);
  await expect(submit(page)).toBeVisible();
  // A keyboard activation of the button itself is the one keyboard road to a send.
  await reasonBox(page).fill("Month-end top-up agreed with treasury.");

  // Two clicks in the same tick: one command.
  await submit(page).dblclick();
  const accepted = page.getByLabel("Accepted");
  await expect(accepted).toBeVisible();
  expect(await sendsOf(accepted), "sends after a double click").toBe(1);

  expect(net.writes(), "writes").toEqual([]);
  expect(net.commandCalls(), "command routes").toEqual([]);
  expect(watch.take()).toEqual([]);
});

test("FIXTURE_LAB · command @1280: Submit stays closed with the reason until the typed confirmation is complete, and Space on it sends once", async ({ page }) => {
  await openLane(page, 1280);
  await openStory(page);
  await scenario(page, "accepted");
  await page.getByRole("button", { name: "Read the plan" }).click();
  await expect(page.getByLabel(/^Plan: /)).toBeVisible();

  // Closed: aria-disabled (still focusable) and the sentence names what is missing.
  await expect(submit(page)).toHaveAttribute("aria-disabled", "true");
  await expect(flow(page)).toContainText("Still needed");
  await submit(page).click({ force: true });
  await page.waitForTimeout(150);
  await expect(page.getByLabel("Accepted")).toHaveCount(0);

  await reasonBox(page).fill("Month-end top-up agreed with treasury.");
  await wordBox(page).fill("TOP_UP");
  await page.getByRole("checkbox").check();
  await submit(page).focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Accepted")).toBeVisible();
  // The receipt takes focus, so a keyboard user is told.
  await expect(page.getByLabel("Accepted")).toBeFocused();
});

test("FIXTURE_LAB · command @1280: all 84 disabled controls (1 real send, 78 operations, 5 certification flows) carry a reason, and none is enabled", async ({ page, baseURL }) => {
  await openLane(page, 1280);
  const watch = watchPage(page, baseURL);
  const net = netMeter(page);
  await openStory(page);

  const result = await page.locator(".exec-cf-page button[disabled]").evaluateAll((nodes) =>
    nodes.map((node) => {
      const id = node.getAttribute("aria-describedby");
      const reason = id === null ? "" : (document.getElementById(id)?.textContent ?? "").trim();
      return { name: (node.textContent ?? "").trim(), reason };
    }),
  );
  expect(result.length).toBe(84);
  expect(result.filter((entry) => entry.reason === "").map((entry) => entry.name), "disabled controls with no reason").toEqual([]);
  // The reasons are words, not codes alone, and none claims the control can be enabled by being clicked.
  expect(result.filter((entry) => entry.reason.length < 12).map((entry) => `${entry.name}: ${entry.reason}`)).toEqual([]);
  // No enabled control hides in these sections: every button inside them is disabled or a summary/link.
  const enabledInGroups = await page
    .locator("section", { has: page.getByRole("heading", { name: "Operations that are not sendable" }) })
    .locator("button:not([disabled])")
    .count();
  expect(enabledInGroups, "enabled buttons among the operations").toBe(0);

  // A group opens and shows its reasons to a reader, not only to the DOM.
  const group = page.locator("details", { hasText: "Account & capital (13)" }).first();
  await group.locator("summary").click();
  await expect(group.locator("button[disabled]").first()).toBeVisible();
  const first = group.locator("button[disabled]").first();
  const describedBy = (await first.getAttribute("aria-describedby")) ?? "";
  await expect(page.locator(`[id="${describedBy}"]`)).toBeVisible();

  // And the certification flows say so.
  await expect(page.getByText("Requires separate certification").first()).toBeVisible();
  expect(overflowFree(await overflow(page))).toBe(true);

  expect(net.writes(), "writes").toEqual([]);
  expect(net.commandCalls(), "command routes").toEqual([]);
  expect(watch.take()).toEqual([]);
});

function overflowFree(px: number): boolean {
  return px <= 0;
}

test("FIXTURE_LAB · command @660: the full flow fits the narrow width (plan, unknown and the open operations list)", async ({ page, baseURL }) => {
  await openLane(page, 660);
  const watch = watchPage(page, baseURL);
  const net = netMeter(page);
  await openStory(page);

  await scenario(page, "timeout-then-landed");
  await planAndFill(page, "TOP_UP");
  await submit(page).click();
  await expect(page.getByLabel("Outcome unknown")).toBeVisible();
  expect(await overflow(page), "overflow with an unknown receipt").toBeLessThanOrEqual(0);

  // Open every operations group: the widest content of the page.
  const groups = page.locator("details.exec-cf-group > summary");
  const count = await groups.count();
  for (let i = 0; i < count; i += 1) await groups.nth(i).click();
  expect(await overflow(page), "overflow with every group open").toBeLessThanOrEqual(0);

  expect(net.writes(), "writes").toEqual([]);
  expect(net.commandCalls(), "command routes").toEqual([]);
  expect(watch.take()).toEqual([]);
});
