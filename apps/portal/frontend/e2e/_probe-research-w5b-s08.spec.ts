/**
 * W5b · Screen 08 browser probe (P17-T06 / V11-P17-BR), not a CI gate.
 *
 * Two lanes, never mixed in one claim:
 *  - `preview` — this branch's frontend (Vite, RESEARCH_W5B_BASE_URL) against
 *    the read-only preview API. The preview runs an older server image, so its
 *    WFO run answers the pre-W5b retained body; that is what it shows.
 *  - `ledger` — the same page with the two retained replay reads answered by
 *    the published real-HMD fixtures (CG-P17-01); every other read is real.
 *
 * Asserts, at 1440 and 660: candles + transition markers drawn, no horizontal
 * overflow, a clean console, and a bounded DOM/heap while playing a fold at
 * 64×. Screenshots go outside the repository (RESEARCH_W5B_OUT).
 *
 * Run: RESEARCH_W5B_BASE_URL=http://localhost:5217 npx playwright test e2e/_probe-research-w5b-s08.spec.ts
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const HOME = `${process.env.HOME}/.config/portal-research-preview`;
const BASE = process.env.RESEARCH_W5B_BASE_URL ?? "http://localhost:5217";
const OUT = process.env.RESEARCH_W5B_OUT ?? "/tmp/w5b-s08";
mkdirSync(OUT, { recursive: true });
const PASSWORD = readFileSync(`${HOME}/claude-preview.password`, "utf8").trim();
const RUN = (JSON.parse(readFileSync(`${HOME}/seeded-wfo-run.json`, "utf8")) as { run_id: string }).run_id;
const FIXTURES = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const FOLD0 = readFileSync(join(FIXTURES, "research-current-source.replay.fold0.valid.json"), "utf8");
const LEDGER = readFileSync(join(FIXTURES, "research-current-source.replay-transitions.valid.json"), "utf8");

test.use({ baseURL: BASE, extraHTTPHeaders: { "x-dev-access-email": "claude-preview@azdag.com" } });

async function signIn(page: Page) {
  const response = await page.request.post("/api/auth/login", {
    data: { username: "claude-preview", credential: PASSWORD },
    headers: { origin: BASE },
  });
  expect(response.status(), "real BFF sign-in").toBeLessThan(300);
}

function watch(page: Page) {
  const noise: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") noise.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => noise.push(`pageerror: ${error}`));
  return noise;
}

for (const [label, width] of [["1440", 1440], ["660", 660]] as const) {
  test(`preview lane · S08 on the real WFO run at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const noise = watch(page);
    await signIn(page);
    await page.goto(`/research/quantbt/runs/${RUN}/execute`);
    await expect(page.locator("[data-screen='execute-replay']")).toHaveAttribute("data-lane", "retained", { timeout: 20_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/preview-${label}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(noise.filter((line) => !/409|CONFLICT|Failed to load resource/.test(line))).toEqual([]);
  });

  test(`ledger lane · S08 candles + transitions at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const noise = watch(page);
    await signIn(page);
    await page.route("**/current-source/replay/transitions**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: LEDGER }));
    await page.route(/\/current-source\/replay(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: FOLD0 }));
    await page.goto(`/research/quantbt/runs/${RUN}/execute`);
    await expect(page.locator("[data-chart='replay-candles']")).toHaveAttribute("data-chart-status", "ready", { timeout: 20_000 });
    await expect(page.locator("[data-transitions='ready']")).toBeVisible();
    await expect(page.locator("[data-marker]")).toHaveCount(4);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/ledger-${label}.png`, fullPage: true });
    await page.locator("[aria-label='next transition']").click();
    await page.locator("[data-action='causal-reveal']").click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/ledger-reveal-${label}.png`, fullPage: true });
    await page.locator("[data-action='causal-reveal']").click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) {
      const wide = await page.evaluate(() => [...document.querySelectorAll("body *")]
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 8).map((el) => `${el.tagName}.${(el.getAttribute("class") ?? "").slice(0, 60)} ${JSON.stringify(Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith("data-")).map((a) => [a.name, a.value.slice(0, 20)])))}`));
      console.log(`W5B_OVERFLOW ${label} ${overflow} ${JSON.stringify(wide)}`);
    }
    expect(overflow).toBeLessThanOrEqual(0);

    /* P17-T06: play the whole fold at 64× — DOM and heap stay bounded. */
    const measure = () => page.evaluate(() => ({
      nodes: document.getElementsByTagName("*").length,
      heap: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
    }));
    await page.locator("[data-speed='64']").click();
    const before = await measure();
    await page.locator("[data-action='play']").click();
    await expect(page.locator("[data-transport]")).toHaveAttribute("data-playing", "false", { timeout: 20_000 });
    const after = await measure();
    expect(Math.abs(after.nodes - before.nodes)).toBeLessThan(60);
    if (before.heap !== null && after.heap !== null) expect(after.heap - before.heap).toBeLessThan(32 * 1024 * 1024);
    expect(await page.locator("[data-transition-row]").count()).toBeLessThanOrEqual(50);
    console.log(`W5B_S08_BOUND ${label} ${JSON.stringify({ before, after })}`);
    expect(noise).toEqual([]);
  });
}
