import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:5173/?new=1", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
await page.locator('input[type="number"]').first().fill("25");
await page.getByRole("button", { name: /Run backtest/ }).first().click();
await page.waitForTimeout(3000);
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(3000);
  if (await page.getByRole("button", { name: /Xem kết quả/ }).isVisible().catch(() => false)) break;
}
// auto-switched to Stage log on completion; count structured rows
await page.waitForTimeout(1000);
const stageText = await page.evaluate(() => document.body.innerText);
const trials = (stageText.match(/trial #/g) || []).length;
const candidates = (stageText.match(/candidate #/g) || []).length;
const hasEval = stageText.includes("evaluation") || stageText.includes("holdout live");
const hasFreeze = stageText.includes("freeze");
console.log("stage log rows — trials:", trials, "| candidates:", candidates, "| freeze:", hasFreeze, "| eval:", hasEval);
console.log("PASS:", trials >= 1 && candidates >= 1 && hasFreeze && hasEval);
await page.screenshot({ path: "e2e/shots/stage-log-completed.png" });
await browser.close();
