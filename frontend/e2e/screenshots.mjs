// Playwright visual gate (P7, plan §19.4/§23.6): desktop + mobile screenshots
// and a blank-canvas/console-error check. Usage:
//   RUN_ID=<run_id> node e2e/screenshots.mjs
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = process.env.PORTAL_URL ?? "http://127.0.0.1:4173";
const RUN_ID = process.env.RUN_ID;
if (!RUN_ID) {
  console.error("RUN_ID env is required");
  process.exit(1);
}
const OUT = "e2e/shots";
mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "desktop-1280", width: 1280, height: 720 },
  { name: "mobile-390", width: 390, height: 844 },
];
const views = ["overview", "optimization", "parameters", "execution", "audit"];

const browser = await chromium.launch();
const errors = [];

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => errors.push(`${viewport.name}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${viewport.name} console: ${message.text()}`);
  });
  for (const view of views) {
    await page.goto(`${BASE}/${view}?run=${RUN_ID}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const canvases = await page.locator("canvas").count();
    const blank = await page.evaluate(() =>
      Array.from(document.querySelectorAll("canvas")).filter((canvas) => {
        const ctx = canvas.getContext("2d");
        if (!ctx) return false;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        return data.every((value) => value === 0);
      }).length,
    );
    const title = await page.title();
    await page.screenshot({ path: `${OUT}/${viewport.name}-${view}.png`, fullPage: true });
    console.log(`${viewport.name} ${view}: canvases=${canvases} blank=${blank} title="${title}"`);
    if (blank > 0) errors.push(`${viewport.name} ${view}: ${blank} blank canvas(es)`);
    if (canvases === 0 && view !== "audit") errors.push(`${viewport.name} ${view}: no charts rendered`);
  }
  await page.close();
}
await browser.close();
console.log(errors.length ? `ERRORS:\n${errors.join("\n")}` : "VISUAL GATE PASS");
process.exit(errors.length ? 1 : 0);
