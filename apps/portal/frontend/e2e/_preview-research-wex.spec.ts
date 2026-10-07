/**
 * §44 / WEX · completed windows and the native journal on the real preview API (no stubs, GET-only).
 *
 * Runs (created by Codex through the product, kept as immutable seals):
 *   Three Window A / B (IS 504 · OOS 168 · Holdout 168), Walk-forward (OOS 504, IS folds 0/1/2: 792/960/1128, no independent Holdout),
 *   Bracket V4 (two real fills), Reactive and Event-driven (one real fill each), and a pre-WEX Bracket V3 run whose seal never kept the companion.
 *
 *   RESEARCH_PREVIEW_ORIGIN=... [RESEARCH_PREVIEW_BASE_URL=http://localhost:5195] \
 *     npx playwright test -c playwright.research-preview.config.ts _preview-research-wex
 */
import { expect, test, type Page } from "@playwright/test";

import { signIn } from "./w1StateRuns";

const ALPHA = "delta-rsi-polynomial-alpha";
const THREE_A = "rrun_729c36043209ed38a4a966b90f85568a";
const THREE_B = "rrun_1aeb8159b2ed7560d4df1a58651f61e7";
const WFO = "rrun_6f7e63ce32cbbe57698e5f4c883201f8";
const BRACKET_V4 = "rrun_c2329924a32a26e8d9d5bf9d5c1f809a";
const REACTIVE = "rrun_fbf968c1075a2b020a03bd04fd7a8024";
const EVENT = "rrun_9f127033d7ed4ccd4692d0be1f6aec53";
/** Created before WEX: its seal kept no complete-window companion. */
const OLD_BRACKET_V3 = "rrun_ea0e06b9d56e08757c40d54746982098";
const WIDTHS = [1280, 660] as const;

async function watch(page: Page): Promise<{ errors: string[]; failures: string[]; writes: string[] }> {
  const errors: string[] = [];
  const failures: string[] = [];
  const writes: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 200));
  });
  page.on("pageerror", (error) => errors.push(`pageerror ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/api/")) failures.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  page.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/")) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return { errors, failures, writes };
}

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

for (const width of WIDTHS) {
  test.describe(`WEX @${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("Overview: a completed Three Window shows IS and Holdout as complete accounts with their authority; OOS keeps its own path", async ({ page }) => {
      await signIn(page);
      const seen = await watch(page);
      for (const [window, label] of [["is", "IS"], ["holdout", "Holdout"]] as const) {
        await page.goto(`/research/quantbt/runs/${THREE_A}/evidence#window=${window}`, { waitUntil: "networkidle" });
        const panel = page.locator('[data-window-source="WINDOW_ANALYTICS"]');
        await expect(panel).toBeVisible({ timeout: 30_000 });
        await expect(panel.locator("[data-window-bounds]")).toContainText(label);
        await expect(panel.locator("[data-window-bounds]")).toContainText("504 retained observations".replace("504", window === "is" ? "504" : "168"));
        await expect(panel).toHaveAttribute("data-window-authority", "FROZEN_PARAMETER_POST_SELECTION_ACCOUNT");
        /* 25 typed facts: every one is a value or a typed absence, none is a bare 0 standing in for "not published". */
        const facts = panel.locator("[data-window-metric], [data-window-fact]");
        expect(await facts.count()).toBeGreaterThanOrEqual(22);
        for (const state of await panel.locator("[data-fact-state]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-fact-state")))) {
          expect(["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"]).toContain(state);
        }
        await expect(panel.locator('[data-window-account="strategy-benchmark"]')).toBeVisible();
        await expect(panel.locator('[data-window-account="drawdown"]')).toBeVisible();
        expect(await noHorizontalScroll(page)).toBe(true);
      }
      await page.goto(`/research/quantbt/runs/${THREE_A}/evidence#window=oos`, { waitUntil: "networkidle" });
      await expect(page.locator('[data-window-source="WINDOW_ANALYTICS"]')).toHaveCount(0);
      expect(seen.failures).toEqual([]);
      expect(seen.writes).toEqual([]);
      expect(seen.errors).toEqual([]);
    });

    test("Overview: Walk-forward IS is read by the engine fold id and called a post-selection training diagnostic; there is no independent Holdout", async ({ page }) => {
      await signIn(page);
      const seen = await watch(page);
      const asked: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/windows/analytics")) asked.push(new URL(request.url()).search);
      });
      await page.goto(`/research/quantbt/runs/${WFO}/evidence#window=is&fold=2`, { waitUntil: "networkidle" });
      const panel = page.locator('[data-window-source="WINDOW_ANALYTICS"]');
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await expect(panel).toHaveAttribute("data-window-authority", "FROZEN_PARAMETER_POST_SELECTION_TRAINING_DIAGNOSTIC");
      await expect(panel.locator("[data-window-bounds]")).toContainText("IS · fold 1");
      await expect(panel.locator("[data-window-bounds]")).toContainText("960 retained observations");
      await expect(panel.locator("[data-window-caution]")).toContainText("not one stitched IS account");
      /* The display ordinal 2 is engine fold "1"; an IS read is never sent before the lane (and so the fold id) is known. */
      expect(asked.every((query) => query.includes("fold_id="))).toBe(true);
      expect(asked.some((query) => query.includes("fold_id=1"))).toBe(true);
      await page.goto(`/research/quantbt/runs/${WFO}/evidence#window=holdout`, { waitUntil: "networkidle" });
      await expect(page.locator('[data-window-source="WINDOW_ANALYTICS"]')).toHaveCount(0);
      await expect(page.locator("main")).toContainText(/no independent holdout|not applicable/i);
      expect(seen.failures).toEqual([]);
      expect(seen.writes).toEqual([]);
      expect(seen.errors).toEqual([]);
    });

    test("Overview: a seal that never kept its complete window says so; nothing sampled is promoted to a full window", async ({ page }) => {
      await signIn(page);
      const seen = await watch(page);
      await page.goto(`/research/quantbt/runs/${OLD_BRACKET_V3}/evidence#window=holdout`, { waitUntil: "networkidle" });
      await expect(page.locator('[data-window-source="WINDOW_ANALYTICS"]')).toHaveCount(0);
      await expect(page.locator("main")).toContainText(/not published|not applicable|HISTORICAL|did not execute/i);
      expect(seen.failures).toEqual([]);
      expect(seen.writes).toEqual([]);
    });

    test("Compare: two Three Window runs on one explicit window, independent accounts, exact correlation, no delta", async ({ page }) => {
      await signIn(page);
      const seen = await watch(page);
      let compareReads = 0;
      page.on("request", (request) => {
        if (request.url().includes("/windows/compare")) compareReads += 1;
      });
      await page.goto(`/research/quantbt/alphas/${ALPHA}/compare?mode=pair&runs=${THREE_A},${THREE_B}`, { waitUntil: "networkidle" });
      await expect(page.locator("[data-window-compare]")).toHaveAttribute("data-window-compare-state", "idle");
      expect(compareReads, "nothing is asked until a window is picked").toBe(0);
      for (const window of ["IS", "HOLDOUT"] as const) {
        await page.locator(`[data-window-switch] [data-window="${window}"]`).click();
        await expect(page.locator("[data-window-compare]")).toHaveAttribute("data-window-compare-state", "ready", { timeout: 30_000 });
        await expect(page.locator("[data-window-side]")).toHaveCount(2);
        await expect(page.locator("[data-window-row]")).toHaveCount(25);
        await expect(page.locator("[data-window-correlation] [data-rho]")).toHaveAttribute("data-exact", /^-?\d/);
        expect((await page.locator("[data-window-table] th").allInnerTexts()).join(" ")).not.toMatch(/Δ|delta/i);
        expect(page.url()).toContain(`window=${window}`);
      }
      /* The selection survives a reload (it is in the URL), and a window with a constant series is a typed N/A, never a zero. */
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator("[data-window-compare]")).toHaveAttribute("data-window-selected", "HOLDOUT");
      await page.locator('[data-window-switch] [data-window="OOS"]').click();
      await expect(page.locator("[data-window-correlation]")).toHaveAttribute("data-window-correlation", "NOT_APPLICABLE", { timeout: 30_000 });
      await expect(page.locator("[data-correlation-absent]")).toHaveAttribute("data-reason-code", "WINDOW_COMPARE_CONSTANT_RETURN_SERIES");
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(seen.failures).toEqual([]);
      expect(seen.writes).toEqual([]);
      expect(seen.errors).toEqual([]);
    });

    test("Replay: Bracket V4 shows its two real fills at the exact prices, exit reason and clock; the ORDER relation stays not published", async ({ page }) => {
      await signIn(page);
      const seen = await watch(page);
      await page.goto(`/research/quantbt/runs/${BRACKET_V4}/execute`, { waitUntil: "networkidle" });
      const card = page.locator("[data-window-replay]");
      await expect(card).toHaveAttribute("data-window-replay-state", "ready", { timeout: 30_000 });
      await expect(card.locator("[data-window-descriptor]")).toContainText("168 retained observations");
      await expect(card.locator("[data-chart='window-replay']")).toBeVisible();
      const fills = card.locator("[data-record='FILL']");
      await expect(fills).toHaveCount(2);
      await expect(fills.nth(0)).toContainText("BUY");
      await expect(fills.nth(0).locator('[data-exact="63557.1"]')).toBeVisible();
      await expect(fills.nth(0)).toContainText("entry");
      await expect(fills.nth(1)).toContainText("SELL");
      await expect(fills.nth(1).locator('[data-exact="65209.5846"]')).toBeVisible();
      await expect(fills.nth(1)).toContainText("take_profit");
      await expect(fills.nth(0)).toContainText("2026-06-12 16:00Z");
      await card.locator('[data-record-kind="ORDER"]').click();
      await expect(card.locator('[data-window-journal] [data-window-absent="NOT_PUBLISHED"]')).toHaveAttribute("data-reason-code", "ENGINE_EXECUTION_RELATION_NOT_PUBLISHED");
      await expect(page.locator("[data-native-journal-note]")).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(seen.failures).toEqual([]);
      expect(seen.writes).toEqual([]);
      expect(seen.errors).toEqual([]);
    });

    test("Replay: Reactive and Event-driven show their real fill with the fields the source published and `not published` for the rest", async ({ page }) => {
      await signIn(page);
      const seen = await watch(page);
      for (const run of [REACTIVE, EVENT]) {
        await page.goto(`/research/quantbt/runs/${run}/execute`, { waitUntil: "networkidle" });
        const card = page.locator("[data-window-replay]");
        await expect(card).toHaveAttribute("data-window-replay-state", "ready", { timeout: 30_000 });
        const fill = card.locator("[data-record='FILL']");
        await expect(fill).toHaveCount(1);
        await expect(fill.locator('[data-exact="63951.2"]')).toBeVisible();
        await expect(fill.locator('[data-field-absent="status"]')).toHaveText("not published");
        await expect(card.locator("[data-window-caution]")).toHaveCount(0);
      }
      expect(seen.failures).toEqual([]);
      expect(seen.writes).toEqual([]);
      expect(seen.errors).toEqual([]);
    });

    test("Replay: a completed Three Window Holdout is readable; a Walk-forward has no independent Holdout; a fold's IS pages by cursor without repeating a bar", async ({ page }) => {
      await signIn(page);
      const seen = await watch(page);
      await page.goto(`/research/quantbt/runs/${THREE_A}/execute`, { waitUntil: "networkidle" });
      let card = page.locator("[data-window-replay]");
      await card.locator("summary").click();
      await card.locator('[data-window="HOLDOUT"]').click();
      await expect(card.locator("[data-window-descriptor]")).toContainText("Holdout", { timeout: 30_000 });
      await expect(card.locator("[data-window-descriptor]")).toContainText("168 retained observations");
      await page.goto(`/research/quantbt/runs/${WFO}/execute`, { waitUntil: "networkidle" });
      card = page.locator("[data-window-replay]");
      await card.locator("summary").click();
      await card.locator('[data-window="HOLDOUT"]').click();
      await expect(card.locator('[data-window-absent="NOT_APPLICABLE"]')).toHaveAttribute("data-reason-code", "WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT", { timeout: 30_000 });
      await card.locator('[data-window="IS"]').click();
      const fold = card.locator('input[aria-label="fold id"]');
      await fold.fill("0");
      await fold.press("Enter");
      await expect(card.locator("[data-window-descriptor]")).toContainText("792 retained observations", { timeout: 30_000 });
      await expect(card.locator("[data-window-caution]")).toContainText("not one stitched IS account");
      const firstPage = await card.locator("[data-window-descriptor]").innerText();
      expect(firstPage).toContain("200 of 792");
      await card.locator('[data-action="later"]').click();
      await expect(card.locator("[data-window-paging]")).toContainText("page 2", { timeout: 30_000 });
      await card.locator('[data-action="earlier"]').click();
      await expect(card.locator("[data-window-paging]")).toContainText("page 1");
      expect(seen.failures).toEqual([]);
      expect(seen.writes).toEqual([]);
      expect(seen.errors).toEqual([]);
    });

    test("Report: the supplemental window analytics are collapsed, say they are not part of the seal, and read only when opened", async ({ page }) => {
      await signIn(page);
      const seen = await watch(page);
      const asked: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/windows/analytics")) asked.push(request.url());
      });
      await page.goto(`/research/quantbt/runs/${THREE_A}/report`, { waitUntil: "networkidle" });
      const block = page.locator("[data-window-supplement]");
      await expect(block).toBeVisible({ timeout: 30_000 });
      expect(asked).toEqual([]);
      await block.locator("summary").click();
      await expect(block.locator("[data-supplement-note]")).toContainText("unchanged");
      await expect(block.locator('[data-window-source="WINDOW_ANALYTICS"]')).toBeVisible({ timeout: 30_000 });
      await block.locator('[data-window="HOLDOUT"]').click();
      await expect(block.locator('[data-window-view="holdout"]')).toBeVisible({ timeout: 30_000 });
      /* The Report's own linked-audit reader answers a typed 409 for a Three Window run (it has no final audit); that is the screen's
         existing, handled refusal and not part of this block. Every other request must succeed. */
      expect(seen.failures.filter((entry) => !entry.endsWith("/final-audit"))).toEqual([]);
      expect(seen.writes).toEqual([]);
      /* The browser logs that one handled 409 as a resource error; anything else is a real console error. */
      expect(seen.errors.filter((entry) => !/status of 409/.test(entry))).toEqual([]);
    });
  });
}
