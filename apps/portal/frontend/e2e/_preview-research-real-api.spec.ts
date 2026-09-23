/**
 * RF02-F4 · REAL_API_E2E_RECEIPT — the Research foundation screens on the
 * isolated preview stack (RF02-B3), against real reads.
 *
 * Nothing is stubbed: the browser signs in through the real BFF as
 * `claude-preview`, and every screen reads the run `seed-run.mjs` produced
 * through P10 → P06 → P11. The receipt is valid only for the commit recorded
 * in the preview's identity.json; screenshots and the request log are written
 * outside the repository (RESEARCH_PREVIEW_RECEIPTS).
 *
 * Run: npx playwright test -c playwright.research-preview.config.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

const HOME = `${process.env.HOME}/.config/portal-research-preview`;
const OUT = process.env.RESEARCH_PREVIEW_RECEIPTS ?? `${HOME}/receipts`;
mkdirSync(OUT, { recursive: true, mode: 0o700 });
const PASSWORD = readFileSync(`${HOME}/claude-preview.password`, "utf8").trim();
const RUN = (JSON.parse(readFileSync(`${HOME}/seeded-run.json`, "utf8")) as { run_id: string }).run_id;
const ORIGIN = "http://localhost:8095";

const VIEWPORTS = [
  ["laptop", 1280, 900],
  ["mobile", 660, 900],
] as const;

interface Observed {
  requests: string[];
  failures: string[];
  /** Problem codes of refused reads, read from the response body. */
  refusalCodes: string[];
  noise: string[];
}

/**
 * Typed refusals a real run may legitimately produce. Chrome logs one
 * resource error for each before any application code runs; it is accepted
 * only for these codes, and only when the screen says what the code means.
 */
const EXPECTED_REFUSALS: Record<string, RegExp> = {
  // RS-02: this preview has no retention materializer, so a completed run's
  // retained current source stays PENDING_RETENTION.
  RESEARCH_CURRENT_SOURCE_CONFLICT: /pending retention/,
};

function observe(page: Page): Observed {
  const observed: Observed = { requests: [], failures: [], refusalCodes: [], noise: [] };
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (!url.pathname.startsWith("/api/")) return;
    observed.requests.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
    if (response.status() >= 400) {
      observed.failures.push(`${url.pathname} ${response.status()}`);
      try {
        const body = (await response.json()) as { error?: { code?: string } };
        if (body.error?.code) observed.refusalCodes.push(body.error.code);
      } catch {
        observed.refusalCodes.push("UNTYPED");
      }
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") observed.noise.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => observed.noise.push(`pageerror: ${error}`));
  return observed;
}

async function signIn(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { username: "claude-preview", credential: PASSWORD },
    headers: { origin: ORIGIN },
  });
  expect(response.status(), "real BFF sign-in").toBeLessThan(300);
}


const SCREENS = [
  ["S01", "/research/quantbt/runs", "[data-screen='run-library']"],
  ["S03", `/research/quantbt/runs/${RUN}/progress`, "[data-screen='run-progress']"],
  ["S04", `/research/quantbt/runs/${RUN}/evidence`, "[data-screen='evidence-flow']"],
  ["S05", `/research/quantbt/runs/${RUN}/split`, "[data-screen='split-detail']"],
  ["S06", `/research/quantbt/runs/${RUN}/search`, "[data-screen='search-detail']"],
  ["S07", `/research/quantbt/runs/${RUN}/freeze`, "[data-screen='freeze-detail']"],
  ["S02", "/research/quantbt/runs/new", "[data-screen='new-run']"],
  ["S12", `/research/quantbt/atlas#tab=modes&run=${RUN}`, "[data-screen='engine-atlas']"],
] as const;

for (const [name, width, height] of VIEWPORTS) {
  for (const [screenId, path, selector] of SCREENS) {
    test(`${screenId} on real reads at ${name}`, async ({ page }) => {
      const observed = observe(page);
      await page.setViewportSize({ width, height });
      await signIn(page);
      await page.goto(path);
      await expect(page.locator(selector)).toBeVisible({ timeout: 20_000 });
      await page.waitForLoadState("networkidle");

      if (screenId === "S01") await expect(page.locator(`[data-run="${RUN}"]`).first()).toBeVisible();
      if (screenId === "S12") {
        await expect(page.locator('[data-mode="mode_1_decay"] [data-claim]')).toBeVisible();
        await page.locator('[data-mode="mode_1_decay"] [data-schedule="per_fold_decay"]').click();
        await expect(page.locator('[data-mode="mode_1_decay"] [data-claim]')).toHaveText("selection_adjusted_outer_oos");
        await expect(page.locator('[data-mode="mode_1_decay"] [data-formula-state="katex"]').first()).toBeVisible();
      }

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.screenshot({ path: `${OUT}/${screenId}-${name}.png`, fullPage: true });
      // One file per test: a failing test restarts the worker, so an in-memory log would be lost.
      writeFileSync(
        `${OUT}/${screenId}-${name}.json`,
        JSON.stringify({ screen: screenId, viewport: name, path, overflow, requests: [...new Set(observed.requests)], failures: observed.failures, refusalCodes: observed.refusalCodes, noise: observed.noise }, null, 2),
        { mode: 0o600 },
      );

      for (const request of observed.requests) expect(request, `${screenId} reached a private route`).not.toMatch(/\/internal\//);
      expect(overflow, `${screenId} horizontal overflow at ${width}`).toBeLessThanOrEqual(1);
      const refusalsExplained = observed.refusalCodes.every((code) => code in EXPECTED_REFUSALS);
      expect(refusalsExplained, `${screenId} unexpected refusals: ${observed.refusalCodes.join(", ")}`).toBe(true);
      const text = (await page.locator(selector).textContent()) ?? "";
      for (const code of new Set(observed.refusalCodes)) {
        expect(text, `${screenId} does not say what ${code} means`).toMatch(EXPECTED_REFUSALS[code]!);
      }
      const unexplained = observed.noise.filter(
        (line) => !(refusalsExplained && /^error: Failed to load resource: the server responded with a status of 409 /.test(line)),
      );
      expect(unexplained, `${screenId} console:\n${observed.noise.join("\n")}`).toEqual([]);
    });
  }
}
