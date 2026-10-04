/**
 * P25-AF · the Import screen's sample passes the seven gates on the real preview API.
 *
 * Opt-in: skipped unless P25_SAMPLE_PROBE=1. Use sample -> Parse -> Run gates, then assert seven PASS.
 * Parse and gates are stateless checks; Register is NEVER clicked. The UI under test is whatever serves
 * RESEARCH_PREVIEW_BASE_URL (default the preview :8095; for an unbuilt tree run vite.research-preview.config.ts).
 *
 *   P25_SAMPLE_PROBE=1 RESEARCH_PREVIEW_ORIGIN=... RESEARCH_PREVIEW_BASE_URL=http://localhost:5195 \
 *     npx playwright test -c playwright.research-preview.config.ts _preview-research-p25-sample
 */
import { expect, test } from "@playwright/test";

import { signIn } from "./w1StateRuns";

test.skip(process.env.P25_SAMPLE_PROBE !== "1", "opt-in: P25_SAMPLE_PROBE=1");

test("sample passes all seven gates", async ({ page }) => {
  await signIn(page);
  await page.goto("/research/quantbt/alpha-import", { waitUntil: "networkidle" });
  await page.locator("[data-action='use-sample']").click();
  await expect(page.getByLabel("Alpha source text")).toHaveValue(/ALPHA_CONTRACT = .*True/s);
  await page.locator("[data-action='parse']").click();
  await expect(page.locator("[data-declared-parameters] [data-parameter-row]")).toHaveCount(3, { timeout: 30_000 });
  await page.locator("[data-nav='2']").click();
  await page.locator("[data-action='run-gates']").click();
  await expect(page.locator("[data-gates] [data-gate-state='PASS']")).toHaveCount(7, { timeout: 30_000 });
  await expect(page.locator("[data-gates] [data-gate-state='FAIL']")).toHaveCount(0);
});
