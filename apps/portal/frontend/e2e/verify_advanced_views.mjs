import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const runId = process.env.RUN_ID;
const errors = [];
const checks = {};
for (const view of ["overview", "execution", "audit", "optimization"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => errors.push(`${view}: ${e.message}`));
  const t0 = Date.now();
  try {
    await page.goto(`http://127.0.0.1:5173/${view}?run=${runId}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const ms = Date.now() - t0;
    const body = await page.evaluate(() => document.body.innerText.toLowerCase()).catch(() => "");
    const chartCount = await page.locator("canvas").count().catch(() => 0);
    checks[view] = { ms, chartCount, failed404: body.includes("404") || body.includes("not found") };
    console.log(`${view}: ${ms}ms · charts=${chartCount} · 404=${checks[view].failed404}`);
  } catch (err) {
    checks[view] = { ms: -1, chartCount: 0, failed404: true };
    console.log(`${view}: ERROR ${err.message}`);
  }
  await page.close();
}
const no404 = Object.values(checks).every((c) => !c.failed404);
console.log("PASS (no 404):", no404);
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
