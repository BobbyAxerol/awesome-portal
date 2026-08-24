/**
 * EL-V2-03 — the six §8.2 journeys, and the structural rule behind them.
 *
 * Runs on the preview build (chromium-preview project). Every test here is a
 * real product route with the real shell; nothing is a fixture crop.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";

async function open(page: Page, route: string) {
  await freezeClock(page);
  await usePreferences(page, "research");
  await stubPortalApi(page, "healthy");
  await page.goto(route);
  await settle(page);
}

test.describe("§8.2 journeys", () => {
  test("1 · Paper: every tab → request exit → Paper Exit Review → back with context", async ({ page }) => {
    await open(page, "/deployments/paper/dep_94");
    for (const tab of ["Fills", "Positions", "Sessions", "Orders", "Accounting", "Evidence", "Overview"]) {
      await page.getByRole("tab", { name: tab }).click();
      await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
      // The default tab is represented by the ABSENCE of the param —
      // a clean URL for the clean state; every other tab is mirrored.
      // EL-V2-04: Overview is the first tab, so it is the clean-URL default.
      if (tab === "Overview") await expect(page).not.toHaveURL(/tab=/);
      else await expect(page).toHaveURL(new RegExp(`tab=${tab}`));
    }
    await page.getByRole("tab", { name: "Fills" }).click();
    await page.getByRole("button", { name: /Request Paper Exit Review/ }).click();
    await expect(page).toHaveURL(/\/governance\/exit-reviews\/EX-771/);
    await expect(page.locator("[data-execution-preview]")).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/deployments\/paper\/dep_94\?tab=Fills/);
    await expect(page.getByRole("tab", { name: "Fills" })).toHaveAttribute("aria-selected", "true");
  });

  test("2 · Alpha 360: change venue → KPIs and tables follow → open deployment and account", async ({ page }) => {
    await open(page, "/deployments/alphas/av_2041");
    const rowsBefore = await page.locator("table tbody tr").count();
    await page.getByLabel(/Venue/).selectOption("BINANCE");
    await expect(page).toHaveURL(/venue=BINANCE/);
    expect(await page.locator("table tbody tr").count()).toBeLessThan(rowsBefore);
    await expect(page.getByText(/not published for scope BINANCE/).first()).toBeVisible();
    await page.getByRole("button", { name: "dep_88" }).click();
    await expect(page).toHaveURL(/\/deployments\/live\/dep_88\/canary/);
    await page.goBack();
    await expect(page).toHaveURL(/venue=BINANCE/);
    await page.getByRole("button", { name: /acct-canary-grid/ }).first().click();
    await expect(page).toHaveURL(/\/deployments\/accounts\/acct-canary-grid/);
  });

  test("3 · Portfolio 360: switch tabs → select correlation lens → open Alpha 360", async ({ page }) => {
    await open(page, "/deployments/portfolios/PF-CRYPTO");
    await page.getByRole("tab", { name: "Structure & Correlation" }).click();
    await expect(page).toHaveURL(/tab=Structure/);
    const lens = page.getByLabel(/lens/i).first();
    if (await lens.count()) {
      await lens.selectOption({ index: 1 });
    }
    await page.getByRole("tab", { name: "Overview" }).click();
    await page.getByRole("button", { name: "Grid v2.1" }).first().click();
    await expect(page).toHaveURL(/\/deployments\/alphas\/Grid v2\.1|\/deployments\/alphas\//);
  });

  test("4 · Full Blotter: change filter → reset cross-filter → expand row funnel → load older", async ({ page }) => {
    await open(page, "/deployments/blotter");
    // Only the unfiltered query carries a cursor (a filter change voids it —
    // blotter.fixtures documents this), so paging is exercised on All first.
    await page.getByRole("button", { name: /^All/ }).first().click();
    await page.getByRole("button", { name: /load older/i }).first().click();
    await expect(page.locator(".exec-sim-live")).toContainText("no older rows exist");
    await page.getByRole("button", { name: /partial/i }).first().click();
    await expect(page).toHaveURL(/filter=PARTIAL/);
    await page.getByRole("button", { name: /Reset the cross-filter/ }).click();
    await expect(page.locator(".exec-sim-live")).toContainText("reset cross-filter");
    // A clickable row IS the expand control (KeysetTable renders it as a
    // button-role row with Enter/Space), so click the row itself.
    const expand = page.locator("tbody tr[role='button']").first();
    await expand.click();
    await expect(page.locator(".exec-funnel-card").first()).toBeVisible();
  });

  test("5 · Account 360: dry-run and sync simulate visibly", async ({ page }) => {
    await open(page, "/deployments/accounts/acct-live-grid-v21");
    await page.getByRole("button", { name: /Sync now/ }).click();
    await expect(page.locator(".exec-sim-live")).toContainText("Simulated · sync now");
    await page.getByRole("button", { name: /Dry-run reconcile/ }).click();
    await expect(page.locator(".exec-sim-live")).toContainText("0 findings");
  });

  test("6 · Queue → Incident → Action Drawer → Verify → back to Queue", async ({ page }) => {
    // The Queue leg: selecting a row makes the triage rail follow it, and the
    // hop to its incident is rendered as UNAVAILABLE with the reason — the
    // operation contract publishes no incident reference (BR-EX-33). A guessed
    // link would be an enabled lie; a disabled control with the reason is the
    // §8.1 answer.
    await open(page, "/execution/operations");
    await page.locator("tbody .exec-linkbtn").first().click();
    await expect(page.locator(".exec-queue-triage")).toBeVisible();
    await expect(page.getByRole("button", { name: /Open incident — not published/ })).toBeDisabled();

    // Into the incident by the contract-backed path: the Command Center's
    // ranked INCIDENT row carries the server's href.
    await page.goto("/execution");
    await settle(page);
    await page.locator(".exec-cc-row").first().click();
    await expect(page).toHaveURL(/\/execution\/operations\/incidents\//);

    // Incident → its operation row → the Action Drawer, carrying the operation.
    await page.locator(".exec-linkbtn", { hasText: /op_/ }).first().click();
    await expect(page).toHaveURL(/\/administration\/actions\?operation=op_/);
    await expect(page.locator("[data-execution-preview]")).toBeVisible();

    // Verify is the drawer's own PLAN/APPLY/VERIFY surface (exercised by its
    // unit and fixture tests); the journey proves the hand-off and the return.
    await page.goBack();
    await expect(page).toHaveURL(/\/execution\/operations\/incidents\//);
    await page.goBack();
    await expect(page).toHaveURL(/\/execution$/);
    await page.getByRole("link", { name: /Operations Queue/ }).first().click();
    await expect(page).toHaveURL(/\/execution\/operations$/);
  });
});

/**
 * The structural rule (§8.2, last paragraph): within every preview product
 * route, an enabled control must navigate, mutate visible state, open a
 * surface or announce — a click that leaves URL, DOM and live region unchanged
 * is a failure. The sweep writes every control it touched to
 * `e2e/el-v2-03-controls.json` as the generated evidence list.
 */
const ROUTES = [
  "/execution",
  "/execution/operations",
  "/execution/operations/incidents/inc_fixture_44",
  "/governance/approvals",
  "/governance/approvals/AP-201/r1",
  "/governance/approvals/AP-352/r2",
  "/governance/exit-reviews/EX-771",
  "/deployments/paper/dep_94",
  "/deployments/paper/dep_vnm/vn-market",
  "/deployments/sandbox/dep_77",
  "/deployments/live/dep_88/canary",
  "/deployments/live/dep_live",
  "/deployments/blotter",
  "/deployments/alphas/av_2041",
  "/deployments/portfolios/PF-CRYPTO",
  "/deployments/accounts/acct-live-grid-v21",
  "/administration/actions",
];

const CONTROLS =
  "main button:not([disabled]), main a[href], main [role='tab'], main select:not([disabled]), main input[type='checkbox']:not([disabled])";

interface ControlRecord {
  route: string;
  index: number;
  tag: string;
  text: string;
  verdict: "changed" | "navigated" | "skipped:selected" | "skipped:hidden" | "NO-OP";
  detail?: string;
}

async function snapshot(page: Page) {
  // A click that navigates can destroy the execution context mid-evaluate;
  // that IS a result (the control navigated), so settle and read the new page.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await rawSnapshot(page);
    } catch {
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      await page.waitForTimeout(200 * (attempt + 1));
    }
  }
  return rawSnapshot(page);
}

async function rawSnapshot(page: Page) {
  return page.evaluate(() => ({
    url: location.href,
    dom: document.querySelector("main")?.innerHTML.length ?? 0,
    text: (document.querySelector("main")?.innerText ?? "").length,
    open: document.querySelectorAll("details[open]").length,
    pressed: [...document.querySelectorAll("[aria-pressed],[aria-selected],[aria-expanded]")]
      .map((n) => `${n.getAttribute("aria-pressed")}${n.getAttribute("aria-selected")}${n.getAttribute("aria-expanded")}`)
      .join(""),
    live: [...document.querySelectorAll("[role='status'],[aria-live]")].map((n) => n.textContent).join("|"),
    focus: document.activeElement?.tagName ?? "",
  }));
}

test("structural: no enabled control on any preview route is a no-op", async ({ page }) => {
  test.setTimeout(900_000);
  const records: ControlRecord[] = [];
  for (const route of ROUTES) {
    await open(page, route);
    let i = 0;
    while (true) {
      // Fresh page per control. Clicking sequentially on one page let an
      // earlier click's in-flight decision walk swallow the next click (the
      // reducer refuses a second decision mid-walk), which the sweep then
      // reported as a no-op. Measured: Deny alone changes 171 characters of
      // text at once. Isolation costs a reload each; it buys a true verdict.
      await page.goto(route);
      await settle(page);
      let count = 0;
      try {
        count = await page.locator(CONTROLS).count();
      } catch {
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        await settle(page);
        continue;
      }
      const controls = page.locator(CONTROLS);
      if (i >= count || i > 80) break;
      const el = controls.nth(i);
      let meta: { tag: string; text: string; hidden: boolean; selected: boolean; href: string | null };
      try {
        meta = await el.evaluate((n) => ({
        tag: n.tagName,
        text: (n.getAttribute("aria-label") ?? n.textContent ?? "").trim().slice(0, 48),
        hidden: !!n.closest("details:not([open])") || (n as HTMLElement).offsetParent === null,
        selected:
          n.getAttribute("aria-selected") === "true" ||
          n.getAttribute("aria-pressed") === "true" ||
          n.getAttribute("data-active") === "true" ||
          n.getAttribute("aria-current") !== null,
        href: n.getAttribute("href"),
      }));
      } catch {
        // The page moved under us (a previous click's navigation landed
        // late). Re-settle and retry this index once.
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        await settle(page);
        continue;
      }
      const base: ControlRecord = { route, index: i, tag: meta.tag, text: meta.text, verdict: "changed" };
      if (meta.hidden) {
        records.push({ ...base, verdict: "skipped:hidden" });
        i += 1;
        continue;
      }
      if (meta.selected) {
        records.push({ ...base, verdict: "skipped:selected" });
        i += 1;
        continue;
      }
      if (meta.href === "#") {
        // A link to nowhere is a no-op wearing a link's clothes.
        records.push({ ...base, verdict: "NO-OP", detail: 'href="#"' });
        i += 1;
        continue;
      }
      let before: Awaited<ReturnType<typeof snapshot>>;
      try {
        before = await snapshot(page);
      } catch {
        await settle(page);
        continue;
      }
      if (meta.tag === "SELECT") {
        const options = await el.locator("option").count();
        if (options > 1) await el.selectOption({ index: 1 });
      } else {
        await el.click({ timeout: 3_000 }).catch(() => undefined);
      }
      // The fixture API simulates latency, so a decision's first visible
      // state change can land well after the click. Poll for a change for up
      // to 1.5s; only silence for the whole window is a no-op.
      let after = await snapshot(page);
      const changed = (a: typeof before, b: typeof before) =>
        a.url !== b.url || a.dom !== b.dom || a.text !== b.text || a.open !== b.open || a.pressed !== b.pressed || a.live !== b.live;
      for (let t = 0; t < 15 && !changed(before, after); t += 1) {
        await page.waitForTimeout(100);
        after = await snapshot(page);
      }
      if (after.url !== before.url) {
        records.push({ ...base, verdict: "navigated", detail: after.url.replace(/^https?:\/\/[^/]+/, "") });
      } else if (
        after.dom !== before.dom ||
        after.text !== before.text ||
        after.open !== before.open ||
        after.pressed !== before.pressed ||
        after.live !== before.live ||
        // Moving focus into a field IS the result of clicking a field.
        (meta.tag === "INPUT" && after.focus === "INPUT")
      ) {
        records.push(base);
      } else {
        records.push({ ...base, verdict: "NO-OP" });
      }
      i += 1;
    }
  }
  mkdirSync("e2e/el-v2-03-evidence", { recursive: true });
  writeFileSync("e2e/el-v2-03-evidence/controls.json", JSON.stringify(records, null, 1));
  const noops = records.filter((r) => r.verdict === "NO-OP");
  expect(records.length).toBeGreaterThan(100);
  expect(noops.map((r) => `${r.route} #${r.index} ${r.tag} "${r.text}" ${r.detail ?? ""}`)).toEqual([]);
});

// ── EL-V2-04 · reference vertical slice: fold + shell-visible baselines ──────
// The decision must be on the first screen at 1440×900 (handoff §10.1, §14.5):
// masthead, the "Next" rail with its CTA, and the chart tile all within the fold.
test.describe("EL-V2-04 · Paper reference slice", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Paper: masthead, Next rail, CTA and chart tile sit above the fold at 1440×900", async ({ page }) => {
    await open(page, "/deployments/paper/dep_94");
    const within = async (locator: ReturnType<typeof page.locator>) => {
      const box = await locator.first().boundingBox();
      expect(box, await locator.first().evaluate((n) => n.outerHTML.slice(0, 80))).not.toBeNull();
      expect(box!.y + box!.height, "bottom edge inside 900px fold").toBeLessThanOrEqual(900);
    };
    await within(page.getByRole("heading", { name: /Carry v3\.2|Grid v2\.1|dep_94/ }).or(page.locator("h1")));
    await within(page.getByText("Next: Paper Exit Review"));
    await within(page.getByRole("button", { name: /Request Paper Exit Review/ }));
    await within(page.getByLabel("Equity vs approved research evidence"));
    // Document never scrolls sideways at this width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("Exit Review: decision rail and its reasons sit above the fold at 1440×900", async ({ page }) => {
    await open(page, "/governance/exit-reviews/EX-771");
    const rail = page.getByText(/Decide: promote to|^Decided$/);
    const box = await rail.first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(900);
    const approve = await page.getByRole("button", { name: /Approve promotion/ }).boundingBox();
    expect(approve).not.toBeNull();
    expect(approve!.y + approve!.height).toBeLessThanOrEqual(900);
  });

  test("Paper → request exit → decide → back keeps the tab context", async ({ page }) => {
    await open(page, "/deployments/paper/dep_94");
    await page.getByRole("tab", { name: "Evidence" }).click();
    await expect(page).toHaveURL(/tab=Evidence/);
    await expect(page.getByText(/Drift vs approved evidence/)).toBeVisible();
    const cta = page.getByRole("button", { name: /Request Paper Exit Review/ });
    if (await cta.isEnabled()) {
      await cta.click();
      await expect(page).toHaveURL(/\/governance\/exit-reviews\/EX-771/);
      await page.getByRole("tab", { name: /Conditions/ }).click();
      await expect(page.getByText(/Conditions & recommendation/)).toBeVisible();
      await page.goBack();
      await expect(page).toHaveURL(/\/deployments\/paper\/dep_94\?tab=Evidence/);
    } else {
      // Unmet gate: the CTA names what blocks it and the Blockers rail lists each criterion.
      await expect(cta).toHaveAttribute("title", /Blocked — \d+ criteri/);
      await expect(page.getByText(/18 more days of observation/).first()).toBeVisible();
    }
  });

  for (const [name, route] of [
    ["paper-dep_94", "/deployments/paper/dep_94"],
    ["paper-vnm", "/deployments/paper/dep_vnm/vn-market"],
    ["exit-review-EX-771", "/governance/exit-reviews/EX-771"],
  ] as const) {
    test(`shell-visible baseline · ${name} · 1440×900`, async ({ page }) => {
      await open(page, route);
      await expect(page).toHaveScreenshot(`el-v2-04-${name}.png`, { fullPage: true, animations: "disabled" });
    });
  }
});
