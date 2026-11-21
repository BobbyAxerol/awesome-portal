/**
 * W3 browser probe — Screens 04/05/06 on a real retained WFO run.
 *
 * The Portal shell and the P13–P15 hubs are the repository's healthy stubs;
 * the four retained current-source reads answer with the exact bodies the
 * Control API serves for the real QuantBT 1.1.1 Delta WFO on BTCUSDT 1h
 * (`src/research/w3RealWfo.fixture.json`). What only a browser settles: the
 * blocks render at HiFi widths without overflow, the console stays clean, and
 * the text a reader sees carries no raw decimal, no `0` for a missing fact.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { freezeClock, settle, stubPortalApi } from "./fixtures";

const here = dirname(fileURLToPath(import.meta.url));
const W3 = JSON.parse(readFileSync(join(here, "..", "src", "research", "w3RealWfo.fixture.json"), "utf8")) as Record<string, unknown>;
const W3B = JSON.parse(readFileSync(join(here, "..", "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as Record<string, unknown>;
const OUT = process.env.RESEARCH_SHOT_DIR ?? "/tmp/research-shots";
const RUN = "/research/quantbt/runs/R-WFO-118";

async function retained(page: import("@playwright/test").Page) {
  const body = (value: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(value) });
  /* One body per retained kind, as the preview served them (w3bRealWfo.fixture.json). */
  const byKind: Record<string, unknown> = {
    EQUITY: W3.series,
    MONTHLY_RETURNS: W3B.series_monthly,
    RETURN_DISTRIBUTION: W3B.series_distribution,
    ROLLING_RETURNS_20: W3B.series_rolling,
  };
  await page.route("**/current-source/evidence/series*", (route) => {
    const kind = new URL(route.request().url()).searchParams.get("kind") ?? "";
    return byKind[kind]
      ? route.fulfill(body(byKind[kind]))
      : route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { code: "RESEARCH_CURRENT_SOURCE_INVALID" } }) });
  });
  await page.route("**/api/v1/research/runs/*/progress*", (route) => route.fulfill(body(W3B.progress)));
  await page.route("**/api/v1/research/runs/*/requested-spec*", (route) => route.fulfill(body(W3B.requested_spec)));
  await page.route("**/current-source/evidence?*", (route) => route.fulfill(body(W3.evidence)));
  await page.route("**/current-source/evidence", (route) => route.fulfill(body(W3.evidence)));
  /* The research-foundation split/search hub fixtures carry the CG-P14-05
     dataset block and the CG-P15-05 claim row (W3b refresh), so fixtures.ts
     serves them as they are. */
  await page.route("**/current-source/split*", (route) => route.fulfill(body(W3.split)));
  await page.route("**/current-source/search*", (route) => route.fulfill(body(W3.search)));
}

function recorder(page: import("@playwright/test").Page) {
  const noise: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") noise.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => noise.push(`pageerror: ${e}`));
  return noise;
}

for (const [name, width] of [["desktop", 1440], ["mobile", 660]] as const) {
  test(`W3 S04/S05/S06 on a retained WFO run at ${name}`, async ({ page }) => {
    const noise = recorder(page);
    await freezeClock(page);
    await stubPortalApi(page, "healthy");
    await retained(page);
    await page.setViewportSize({ width, height: 1000 });

    await page.goto(`${RUN}/evidence`);
    await settle(page);
    await expect(page.locator("[data-claim-field='validation_claim']")).toHaveAttribute("data-claim-value", "walk_forward_oos");
    await expect(page.locator("[data-retained-verdicts='AVAILABLE'] [data-verdict-row]")).toHaveCount(2);
    await expect(page.locator("[data-retained-sampling='FULL']")).toContainText("all 1,056 retained observations");
    await expect(page.locator("[data-retained-series='EQUITY'] canvas").first()).toBeVisible({ timeout: 15_000 });
    const s04 = await page.locator("[data-retained-verdicts]").innerText();
    console.log(`W3_S04_VERDICTS ${JSON.stringify(s04)}`);
    expect(s04).not.toMatch(/-?\d+\.\d{5,}/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${OUT}/w3-s04-${name}.png`, fullPage: true });

    await page.goto(`${RUN}/split`);
    await settle(page);
    await expect(page.locator("[data-guard='purge_bars']")).toHaveText("0 bars");
    await expect(page.locator("[data-fold-table-row='1'] [data-count-cell]").first()).toHaveText("720");
    console.log(`W3_S05_TABLE ${JSON.stringify(await page.locator("[data-card='fold-table']").innerText())}`);
    await page.screenshot({ path: `${OUT}/w3-s05-${name}.png`, fullPage: true });

    await page.goto(`${RUN}/search`);
    await settle(page);
    await expect(page.locator("[data-trial='0'] [data-trial-is]")).toHaveText("−1.44");
    await expect(page.locator("[data-role-card='selected']")).toContainText("−9.81");
    console.log(`W3_S06_LEDGER ${JSON.stringify(await page.locator("[data-ledger]").innerText())}`);
    await page.screenshot({ path: `${OUT}/w3-s06-${name}.png`, fullPage: true });

    expect(noise, noise.join("\n")).toEqual([]);
  });
}
